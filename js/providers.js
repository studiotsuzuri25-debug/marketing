/* AIプロバイダ抽象化レイヤ — Claude / ChatGPT / Gemini / Grok / デモ */
(function () {
  'use strict';

  const PROVIDERS = {
    demo: {
      label: 'デモモード',
      icon: 'flask',
      needsKey: false,
      defaultModel: 'demo',
      note: 'APIキー不要。ダミーの分析結果で動作を確認できます。',
    },
    claude: {
      label: 'Claude (Anthropic)',
      icon: 'sparkle',
      needsKey: true,
      defaultModel: 'claude-sonnet-5',
      modelOptions: [
        { id: 'claude-opus-4-8', note: '最高性能（コスト高）' },
        { id: 'claude-sonnet-5', note: 'バランス型（推奨）' },
        { id: 'claude-haiku-4-5-20251001', note: '高速・低コスト' },
      ],
      keyPlaceholder: 'sk-ant-api03-...',
      keyUrl: 'https://console.anthropic.com/',
    },
    openai: {
      label: 'ChatGPT (OpenAI)',
      icon: 'message',
      needsKey: true,
      defaultModel: 'gpt-4o',
      modelOptions: [
        { id: 'gpt-4o', note: 'バランス型' },
        { id: 'gpt-4o-mini', note: '高速・低コスト' },
      ],
      keyPlaceholder: 'sk-...',
      keyUrl: 'https://platform.openai.com/api-keys',
    },
    gemini: {
      label: 'Gemini (Google)',
      icon: 'gem',
      needsKey: true,
      defaultModel: 'gemini-flash-latest',
      modelOptions: [
        { id: 'gemini-flash-latest', note: '常に最新のFlash（推奨）' },
        { id: 'gemini-pro-latest', note: '常に最新のPro（課金推奨）' },
      ],
      keyPlaceholder: 'AIza...',
      keyUrl: 'https://aistudio.google.com/apikey',
    },
    grok: {
      label: 'Grok (xAI)',
      icon: 'zap',
      needsKey: true,
      defaultModel: 'grok-3',
      modelOptions: [
        { id: 'grok-4', note: '高性能' },
        { id: 'grok-3', note: 'バランス型' },
      ],
      keyPlaceholder: 'xai-...',
      keyUrl: 'https://console.x.ai/',
    },
    perplexity: {
      label: 'Perplexity（リアルタイム検索）',
      icon: 'globe',
      needsKey: true,
      defaultModel: 'sonar',
      modelOptions: [
        { id: 'sonar', note: 'リアルタイム検索・高速（推奨）' },
        { id: 'sonar-pro', note: '高精度検索' },
        { id: 'sonar-reasoning', note: '検索＋推論' },
        { id: 'sonar-deep-research', note: '徹底調査（高コスト）' },
      ],
      keyPlaceholder: 'pplx-...',
      keyUrl: 'https://www.perplexity.ai/settings/api',
    },
  };

  async function readError(res) {
    let detail = '';
    try {
      const j = await res.json();
      detail = (j.error && (j.error.message || j.error.type)) || j.message || JSON.stringify(j).slice(0, 200);
    } catch (e) { /* ignore */ }
    let hint = '';
    if (res.status === 429) {
      hint = /free_tier|limit: 0/i.test(detail)
        ? '【対処】このモデルは無料枠では利用できない可能性があります。設定画面で無料枠対応のモデル（例: gemini-2.5-flash）に変更するか、AI事業者側で課金を有効にしてください。'
        : '【対処】レート制限に達しました。設定画面で「同時実行数」を下げて再実行してください。';
    } else if (res.status === 401 || res.status === 403) {
      hint = '【対処】APIキーが無効か権限がありません。設定画面でキーを確認してください。';
    } else if (res.status === 404) {
      hint = '【対処】モデル名が正しくない可能性があります。設定画面のモデル候補から選び直してください。';
    }
    const err = new Error('APIエラー (' + res.status + ') ' + (hint ? hint + '\n詳細: ' : '') + detail);
    err.status = res.status;
    return err;
  }

  async function callClaude(opts) {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      signal: opts.signal,
      headers: {
        'content-type': 'application/json',
        'x-api-key': opts.apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({
        model: opts.model,
        max_tokens: opts.maxTokens,
        system: opts.system,
        messages: [{ role: 'user', content: opts.prompt }],
      }),
    });
    if (!res.ok) throw await readError(res);
    const data = await res.json();
    reportUsage(opts, data.usage && {
      input: data.usage.input_tokens || 0,
      output: data.usage.output_tokens || 0,
    });
    return (data.content || []).map(function (b) { return b.text || ''; }).join('');
  }

  // OpenAI互換 (ChatGPT / Grok)
  async function callOpenAICompat(baseUrl, opts, useCompletionTokens) {
    const body = {
      model: opts.model,
      messages: [
        { role: 'system', content: opts.system },
        { role: 'user', content: opts.prompt },
      ],
    };
    if (useCompletionTokens) body.max_completion_tokens = opts.maxTokens;
    else body.max_tokens = opts.maxTokens;

    const res = await fetch(baseUrl + '/chat/completions', {
      method: 'POST',
      signal: opts.signal,
      headers: {
        'content-type': 'application/json',
        'authorization': 'Bearer ' + opts.apiKey,
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw await readError(res);
    const data = await res.json();
    reportUsage(opts, data.usage && {
      input: data.usage.prompt_tokens || 0,
      output: data.usage.completion_tokens || 0,
    });
    let content = ((data.choices || [])[0] || {}).message ? data.choices[0].message.content || '' : '';
    // Perplexity等のリアルタイム検索の出典URLを本文末尾に付与
    let cites = data.citations;
    if ((!cites || !cites.length) && Array.isArray(data.search_results)) {
      cites = data.search_results.map(function (r) { return r.url || r.link; }).filter(Boolean);
    }
    if (Array.isArray(cites) && cites.length) {
      content += '\n\n参考（リアルタイム検索の出典）:\n' +
        cites.slice(0, 15).map(function (u, i) { return '[' + (i + 1) + '] ' + u; }).join('\n');
    }
    return content;
  }

  async function callGemini(opts) {
    const url = 'https://generativelanguage.googleapis.com/v1beta/models/' +
      encodeURIComponent(opts.model) + ':generateContent?key=' + encodeURIComponent(opts.apiKey);
    const res = await fetch(url, {
      method: 'POST',
      signal: opts.signal,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: opts.system }] },
        contents: [{ role: 'user', parts: [{ text: opts.prompt }] }],
        generationConfig: { maxOutputTokens: opts.maxTokens },
      }),
    });
    if (!res.ok) throw await readError(res);
    const data = await res.json();
    const um = data.usageMetadata || {};
    reportUsage(opts, { input: um.promptTokenCount || 0, output: um.candidatesTokenCount || 0 });
    const cand = (data.candidates || [])[0];
    if (!cand || !cand.content) throw new Error('Geminiから応答が取得できませんでした');
    return (cand.content.parts || []).map(function (p) { return p.text || ''; }).join('');
  }

  /* トークン使用量を呼び出し元へ通知（概算コスト計算に使用） */
  function reportUsage(opts, usage) {
    if (opts && typeof opts.onUsage === 'function' && usage) {
      opts.onUsage({ input: usage.input || 0, output: usage.output || 0 });
    }
  }

  /* モデル別の概算単価（USD / 100万トークン）。あくまで目安。 */
  const PRICING = {
    'claude-opus': { in: 15, out: 75 },
    'claude-sonnet': { in: 3, out: 15 },
    'claude-haiku': { in: 0.8, out: 4 },
    'gpt-4o-mini': { in: 0.15, out: 0.6 },
    'gpt-4o': { in: 2.5, out: 10 },
    'gpt-4': { in: 2.5, out: 10 },
    'gpt': { in: 2.5, out: 10 },
    'gemini-2.5-pro': { in: 1.25, out: 10 },
    'gemini-pro': { in: 1.25, out: 10 },
    'gemini-2.5-flash': { in: 0.3, out: 2.5 },
    'gemini-flash': { in: 0.3, out: 2.5 },
    'gemini': { in: 0.3, out: 2.5 },
    'grok-4': { in: 5, out: 15 },
    'grok': { in: 3, out: 15 },
    'sonar-deep-research': { in: 2, out: 8 },
    'sonar-reasoning-pro': { in: 2, out: 8 },
    'sonar-reasoning': { in: 1, out: 5 },
    'sonar-pro': { in: 3, out: 15 },
    'sonar': { in: 1, out: 1 },
  };

  /* モデル名から概算単価を推定（部分一致・長いキー優先） */
  function priceFor(model) {
    const m = String(model || '').toLowerCase();
    const keys = Object.keys(PRICING).sort(function (a, b) { return b.length - a.length; });
    for (let i = 0; i < keys.length; i++) {
      if (m.indexOf(keys[i]) !== -1) return PRICING[keys[i]];
    }
    return null;
  }

  function estimateCost(provider, model, inputTokens, outputTokens) {
    if (provider === 'demo') return 0;
    const p = priceFor(model);
    if (!p) return null;
    return (inputTokens / 1e6) * p.in + (outputTokens / 1e6) * p.out;
  }

  /* デモモード：ダミーの分析レポートを生成（APIキー不要で動作確認用） */
  function demoReport(opts) {
    const role = opts.demoRole || '市場分析';
    const topic = (opts.demoTopic || 'ご指定のテーマ').slice(0, 60);
    const delay = 1200 + Math.random() * 3500;
    reportUsage(opts, { input: 700 + Math.floor(Math.random() * 900), output: opts.demoKind === 'synthesis' ? 1800 : 400 + Math.floor(Math.random() * 500) });
    return new Promise(function (resolve, reject) {
      const t = setTimeout(function () {
        if (opts.demoKind === 'synthesis') {
          resolve([
            '# 市場分析レポート（デモ）',
            '',
            '> これは **デモモード** の出力です。設定画面で Claude / ChatGPT / Gemini / Grok のAPIキーを設定すると、実際のAIによる分析が行われます。',
            '',
            '## 1. エグゼクティブサマリー',
            '「' + topic + '」について、' + (opts.demoCount || 0) + '体のエージェントによる並列分析を実施しました。' +
            (opts.demoSourceCount ? 'ユーザー提供の参考資料' + opts.demoSourceCount + '件を根拠として利用しています（デモのため内容は反映されません）。' : '') +
            '市場は堅調な成長が見込まれ、差別化戦略の明確化が成功の鍵となります。',
            '',
            '```kpi',
            '{"items":[{"label":"市場規模(2026年・デモ値)","value":"3,700億円","note":"前年比 +5.1%"},{"label":"市場成長率(年平均)","value":"+8%","note":"今後5年間の推定"},{"label":"参入障壁","value":"中程度","note":"5段階中3"},{"label":"推奨参入時期","value":"12ヶ月以内","note":"デモ判定"}]}',
            '```',
            '',
            '## 2. 市場概況',
            '- 市場規模は今後5年間で年平均+8%程度の成長が期待（デモ値）',
            '- 顧客ニーズは「品質」「利便性」「価格」の3軸で多様化',
            '',
            '```chart',
            '{"type":"bar","title":"市場規模の推移（デモ値）","unit":"億円","labels":["2023","2024","2025","2026","2027"],"series":[{"name":"市場規模","data":[3200,3350,3520,3700,3900]}]}',
            '```',
            '',
            '```chart',
            '{"type":"donut","title":"市場シェア構成（デモ値）","unit":"%","labels":["大手A社","大手B社","大手C社","中堅グループ","その他"],"series":[{"name":"シェア","data":[24,18,12,26,20]}]}',
            '```',
            '',
            '![市場イメージ（デモ・存在しないURLのため非表示になります）](https://example.com/no-such-image-demo.jpg)',
            '',
            '## 3. 競合ポジショニング',
            '',
            '```chart',
            '{"type":"radar","title":"競合ポジショニング比較（デモ値）","labels":["価格競争力","品質","認知度","チャネル力","独自性"],"series":[{"name":"自社想定","data":[3,4,2,2,5]},{"name":"大手A社","data":[4,4,5,5,3]}]}',
            '```',
            '',
            '### 競合比較表（デモ）',
            '',
            '| 項目 | 自社 | 競合A | 競合B |',
            '|---|---|---|---|',
            '| 価格帯 | 中 | 高 | 低 |',
            '| 主要チャネル | EC | 店舗 | EC＋店舗 |',
            '| SNS強度 | 中 | 高 | 低 |',
            '',
            '```chart',
            '{"type":"line","title":"SNS言及数の推移（デモ値）","unit":"千件/月","labels":["1月","2月","3月","4月","5月","6月"],"series":[{"name":"カテゴリ全体","data":[12,14,13,17,21,24]},{"name":"競合A社","data":[8,9,8,10,11,12]}]}',
            '```',
            '',
            '| 項目 | 評価 | コメント |',
            '|---|---|---|',
            '| 市場成長性 | 4 / 5 | 安定成長（デモ） |',
            '| 競争強度 | 3 / 5 | 中程度（デモ） |',
            '| 参入障壁 | 2 / 5 | 比較的低い（デモ） |',
            '',
            '## 4. 戦略提言',
            '1. ターゲットセグメントの明確化と一点突破',
            '2. SNSを起点とした認知拡大とコミュニティ形成',
            '3. 小さく検証 → 高速に改善するリーンな展開',
            '',
            '## 5. 次のアクション',
            '- 実APIキーを設定して本分析を実行する',
            '- 分析レベルを Lv.3 にして詳細分析を行う',
          ].join('\n'));
        } else {
          resolve([
            '### ' + role + 'の観点からの報告（デモ）',
            '',
            '「' + topic + '」について、' + role + 'の観点から分析しました。' +
            (opts.demoSourceCount ? '（参考資料' + opts.demoSourceCount + '件を受領。デモモードのため内容は解析されません）' : ''),
            '',
            '- 主要な発見 1：市場には未充足ニーズが存在（デモデータ）',
            '- 主要な発見 2：競合は大手3社に集中しロングテールが手薄（デモデータ）',
            '- 主要な発見 3：SNS上の言及は直近6ヶ月で増加傾向（デモデータ）',
            '',
            '**結論：** 参入余地はあるが、差別化ポイントの明確化が必須。',
            '',
            '_※ デモモードの出力です。実際のAI分析には設定画面でAPIキーを登録してください。_',
          ].join('\n'));
        }
      }, delay);
      if (opts.signal) {
        opts.signal.addEventListener('abort', function () {
          clearTimeout(t);
          reject(new DOMException('Aborted', 'AbortError'));
        });
      }
    });
  }

  /* APIキーで実際に利用可能なモデルの一覧を各社のAPIから取得する */
  async function listModels(provider, apiKey) {
    if (provider === 'perplexity') {
      // Perplexityはモデル一覧APIを公開していないため既知の一覧を返す
      return ['sonar', 'sonar-pro', 'sonar-reasoning', 'sonar-reasoning-pro', 'sonar-deep-research'];
    }
    if (provider === 'gemini') {
      const r = await fetch('https://generativelanguage.googleapis.com/v1beta/models?pageSize=100&key=' + encodeURIComponent(apiKey));
      if (!r.ok) throw await readError(r);
      const d = await r.json();
      return (d.models || [])
        .filter(function (m) { return (m.supportedGenerationMethods || []).indexOf('generateContent') !== -1; })
        .map(function (m) { return String(m.name || '').replace(/^models\//, ''); })
        .filter(function (n) { return /gemini/.test(n) && !/embedding|aqa|tts|image-|imagen|audio|live/.test(n); });
    }
    if (provider === 'claude') {
      const r = await fetch('https://api.anthropic.com/v1/models?limit=100', {
        headers: {
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true',
        },
      });
      if (!r.ok) throw await readError(r);
      const d = await r.json();
      return (d.data || []).map(function (m) { return m.id; });
    }
    if (provider === 'openai' || provider === 'grok') {
      const base = provider === 'grok' ? 'https://api.x.ai/v1' : 'https://api.openai.com/v1';
      const r = await fetch(base + '/models', { headers: { 'authorization': 'Bearer ' + apiKey } });
      if (!r.ok) throw await readError(r);
      const d = await r.json();
      let ids = (d.data || []).map(function (m) { return m.id; });
      if (provider === 'openai') {
        ids = ids.filter(function (n) {
          return /^(gpt-|o\d|chatgpt)/.test(n) && !/audio|realtime|tts|transcribe|embedding|whisper|image|dall|moderation|search|instruct/.test(n);
        });
      } else {
        ids = ids.filter(function (n) { return /^grok/.test(n) && !/image|vision-beta/.test(n); });
      }
      return ids;
    }
    throw new Error('このプロバイダはモデル一覧取得に対応していません');
  }

  /**
   * 統一呼び出しインターフェース
   * @param {object} opts {provider, apiKey, model, system, prompt, maxTokens, signal, demo*}
   * @returns {Promise<string>}
   */
  /* 親シグナルと結合したタイムアウト付きで実行（時間がかかりすぎる呼び出しを検知） */
  async function withTimeout(opts, fn) {
    const ctrl = new AbortController();
    const timeoutMs = opts.timeoutMs || 240000;
    let timedOut = false;
    const timer = setTimeout(function () { timedOut = true; ctrl.abort(); }, timeoutMs);
    const onAbort = function () { ctrl.abort(); };
    if (opts.signal) {
      if (opts.signal.aborted) { clearTimeout(timer); throw new DOMException('Aborted', 'AbortError'); }
      opts.signal.addEventListener('abort', onAbort);
    }
    try {
      return await fn(Object.assign({}, opts, { signal: ctrl.signal }));
    } catch (e) {
      if (timedOut) {
        const err = new Error('AIの応答がタイムアウトしました（' + Math.round(timeoutMs / 1000) + '秒）。「再実行」で再試行してください。');
        err.isTimeout = true;
        throw err;
      }
      throw e;
    } finally {
      clearTimeout(timer);
      if (opts.signal) opts.signal.removeEventListener('abort', onAbort);
    }
  }

  async function callAI(opts) {
    switch (opts.provider) {
      case 'demo':   return demoReport(opts);
      case 'claude': return withTimeout(opts, callClaude);
      case 'openai': return withTimeout(opts, function (o) { return callOpenAICompat('https://api.openai.com/v1', o, true); });
      case 'grok':   return withTimeout(opts, function (o) { return callOpenAICompat('https://api.x.ai/v1', o, false); });
      case 'perplexity': return withTimeout(opts, function (o) { return callOpenAICompat('https://api.perplexity.ai', o, false); });
      case 'gemini': return withTimeout(opts, callGemini);
      default: throw new Error('未対応のプロバイダです: ' + opts.provider);
    }
  }

  window.AI = { PROVIDERS: PROVIDERS, call: callAI, listModels: listModels, estimateCost: estimateCost };
})();
