/* サーバー関数の共通処理:
   - FirebaseのIDトークン検証（ログイン必須のゲート）
   - 各AIプロバイダへの中継（APIキーは環境変数からのみ読み、応答は正規化して返す）
   キーはこのサーバー内でのみ使用し、レスポンスやログには一切含めない。 */
import { jwtVerify, createRemoteJWKSet } from 'jose';

const PROJECT_ID = process.env.FIREBASE_PROJECT_ID || '';

// Firebase IDトークンの署名検証に使う公開鍵（JWKS）。warm起動間でキャッシュされる。
const JWKS = createRemoteJWKSet(
  new URL('https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com')
);

/* 環境変数名の対応。Vercelのプロジェクト設定に登録してもらう。 */
export const ENV_KEY = {
  claude: 'ANTHROPIC_API_KEY',
  openai: 'OPENAI_API_KEY',
  grok: 'XAI_API_KEY',
  perplexity: 'PERPLEXITY_API_KEY',
  gemini: 'GEMINI_API_KEY',
};

export function serverKeyFor(provider) {
  const name = ENV_KEY[provider];
  return name ? (process.env[name] || '').trim() : '';
}

/* どのプロバイダにサーバーキーが登録済みか（真偽のみ。値は返さない） */
export function configuredProviders() {
  const out = {};
  Object.keys(ENV_KEY).forEach(function (p) { out[p] = !!serverKeyFor(p); });
  return out;
}

/* Authorization: Bearer <idToken> を検証し、ユーザー情報を返す。失敗時は例外。 */
export async function requireUser(req) {
  const auth = req.headers['authorization'] || req.headers['Authorization'] || '';
  const m = /^Bearer\s+(.+)$/i.exec(auth);
  const token = m ? m[1].trim() : '';
  if (!token) { const e = new Error('ログインが必要です（トークンがありません）。'); e.status = 401; throw e; }
  if (!PROJECT_ID) { const e = new Error('サーバー設定エラー: FIREBASE_PROJECT_ID が未設定です。'); e.status = 500; throw e; }
  try {
    const { payload } = await jwtVerify(token, JWKS, {
      issuer: 'https://securetoken.google.com/' + PROJECT_ID,
      audience: PROJECT_ID,
    });
    if (!payload.sub) throw new Error('sub なし');
    return { uid: payload.sub, email: payload.email || '' };
  } catch (e) {
    const err = new Error('ログイン情報を確認できませんでした。再ログインしてください。');
    err.status = 401;
    throw err;
  }
}

async function readError(res) {
  let detail = '';
  try {
    const j = await res.json();
    detail = (j.error && (j.error.message || j.error.type)) || j.message || JSON.stringify(j).slice(0, 200);
  } catch (e) { /* ignore */ }
  const err = new Error('APIエラー (' + res.status + ') ' + detail);
  err.status = res.status === 401 || res.status === 403 ? 502 : res.status; // 上流の認可失敗は設定ミス→502
  err.upstream = res.status;
  return err;
}

/* プロバイダ呼び出しを {text, usage, citations} に正規化して返す */
export async function callProvider(provider, key, opts, signal) {
  const model = opts.model;
  const system = String(opts.system || '');
  const prompt = String(opts.prompt || '');
  const maxTokens = Math.min(Math.max(parseInt(opts.maxTokens, 10) || 2000, 1), 32000);

  if (provider === 'claude') {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST', signal,
      headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model, max_tokens: maxTokens, system, messages: [{ role: 'user', content: prompt }] }),
    });
    if (!res.ok) throw await readError(res);
    const data = await res.json();
    return {
      text: (data.content || []).map(function (b) { return b.text || ''; }).join(''),
      usage: { input: (data.usage && data.usage.input_tokens) || 0, output: (data.usage && data.usage.output_tokens) || 0 },
    };
  }

  if (provider === 'gemini') {
    const url = 'https://generativelanguage.googleapis.com/v1beta/models/' +
      encodeURIComponent(model) + ':generateContent';
    const res = await fetch(url, {
      method: 'POST', signal,
      headers: { 'content-type': 'application/json', 'x-goog-api-key': key },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: system }] },
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: { maxOutputTokens: maxTokens },
      }),
    });
    if (!res.ok) throw await readError(res);
    const data = await res.json();
    const um = data.usageMetadata || {};
    const cand = (data.candidates || [])[0];
    if (!cand || !cand.content) throw new Error('Geminiから応答が取得できませんでした');
    return {
      text: (cand.content.parts || []).map(function (p) { return p.text || ''; }).join(''),
      usage: { input: um.promptTokenCount || 0, output: um.candidatesTokenCount || 0 },
    };
  }

  // OpenAI互換（ChatGPT / Grok / Perplexity）
  const base = provider === 'openai' ? 'https://api.openai.com/v1'
    : provider === 'grok' ? 'https://api.x.ai/v1'
      : provider === 'perplexity' ? 'https://api.perplexity.ai'
        : null;
  if (!base) { const e = new Error('未対応のプロバイダです: ' + provider); e.status = 400; throw e; }
  const body = { model, messages: [{ role: 'system', content: system }, { role: 'user', content: prompt }] };
  if (provider === 'openai') body.max_completion_tokens = maxTokens; else body.max_tokens = maxTokens;
  const res = await fetch(base + '/chat/completions', {
    method: 'POST', signal,
    headers: { 'content-type': 'application/json', 'authorization': 'Bearer ' + key },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw await readError(res);
  const data = await res.json();
  let text = ((data.choices || [])[0] || {}).message ? (data.choices[0].message.content || '') : '';
  let cites = data.citations;
  if ((!cites || !cites.length) && Array.isArray(data.search_results)) {
    cites = data.search_results.map(function (r) { return r.url || r.link; }).filter(Boolean);
  }
  if (Array.isArray(cites) && cites.length) {
    text += '\n\n参考（リアルタイム検索の出典）:\n' +
      cites.slice(0, 15).map(function (u, i) { return '[' + (i + 1) + '] ' + u; }).join('\n');
  }
  return {
    text,
    usage: { input: (data.usage && data.usage.prompt_tokens) || 0, output: (data.usage && data.usage.completion_tokens) || 0 },
  };
}

export function readJsonBody(req) {
  if (req.body && typeof req.body === 'object') return Promise.resolve(req.body);
  return new Promise(function (resolve) {
    let raw = '';
    req.on('data', function (c) { raw += c; });
    req.on('end', function () { try { resolve(raw ? JSON.parse(raw) : {}); } catch (e) { resolve({}); } });
    req.on('error', function () { resolve({}); });
  });
}
