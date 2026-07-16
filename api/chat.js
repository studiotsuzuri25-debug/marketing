/* POST /api/chat — ログイン済みユーザーだけが、環境変数のAPIキーでAIを呼べる中継口。
   リクエスト: { provider, model, system, prompt, maxTokens }（Authorization: Bearer <FirebaseIDトークン>）
   レスポンス: { text, usage:{input,output} } */
import { requireUser, serverKeyFor, callProvider, readJsonBody, ENV_KEY } from './_lib.js';

// AI応答は時間がかかるため関数の最大実行時間を延ばす（Hobbyは最大60秒・Proは最大300秒）
export const config = { maxDuration: 60 };

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: { message: 'POSTのみ対応しています。' } });
    return;
  }
  try {
    await requireUser(req); // 未ログインはここで401

    const body = await readJsonBody(req);
    const provider = String(body.provider || '');
    if (!ENV_KEY[provider]) {
      res.status(400).json({ error: { message: '未対応のプロバイダです: ' + provider } });
      return;
    }
    const key = serverKeyFor(provider);
    if (!key) {
      res.status(400).json({ error: { message: 'サーバーに ' + (ENV_KEY[provider] || provider) + ' が登録されていません。設定でご自身のAPIキーを入力するか、管理者に環境変数の登録を依頼してください。' } });
      return;
    }

    // タイムアウト（上流が遅い場合に中断）
    const ctrl = new AbortController();
    const timer = setTimeout(function () { ctrl.abort(); }, 240000);
    try {
      const out = await callProvider(provider, key, body, ctrl.signal);
      res.status(200).json({ text: out.text, usage: out.usage });
    } finally {
      clearTimeout(timer);
    }
  } catch (e) {
    const status = e.status || 500;
    // キーや内部情報は返さない
    res.status(status).json({ error: { message: e.message || 'サーバーエラー' } });
  }
}
