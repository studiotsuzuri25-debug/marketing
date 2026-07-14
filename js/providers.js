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
      defaultModel: 'gemini-2.5-flash',
      modelOptions: [
        { id: 'gemini-2.5-flash', note: '無料枠あり（推奨）' },
        { id: 'gemini-2.5-pro', note: '高性能（課金設定が必要）' },
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
    return ((data.choices || [])[0] || {}).message ? data.choices[0].message.content || '' : '';
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
    const cand = (data.candidates || [])[0];
    if (!cand || !cand.content) throw new Error('Geminiから応答が取得できませんでした');
    return (cand.content.parts || []).map(function (p) { return p.text || ''; }).join('');
  }

  /* デモモード：ダミーの分析レポートを生成（APIキー不要で動作確認用） */
  function demoReport(opts) {
    const role = opts.demoRole || '市場分析';
    const topic = (opts.demoTopic || 'ご指定のテーマ').slice(0, 60);
    const delay = 1200 + Math.random() * 3500;
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
            '## 2. 市場概況',
            '- 市場規模は今後5年間で年平均+8%程度の成長が期待（デモ値）',
            '- 顧客ニーズは「品質」「利便性」「価格」の3軸で多様化',
            '',
            '| 項目 | 評価 | コメント |',
            '|---|---|---|',
            '| 市場成長性 | 4 / 5 | 安定成長（デモ） |',
            '| 競争強度 | 3 / 5 | 中程度（デモ） |',
            '| 参入障壁 | 2 / 5 | 比較的低い（デモ） |',
            '',
            '## 3. 戦略提言',
            '1. ターゲットセグメントの明確化と一点突破',
            '2. SNSを起点とした認知拡大とコミュニティ形成',
            '3. 小さく検証 → 高速に改善するリーンな展開',
            '',
            '## 4. 次のアクション',
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

  /**
   * 統一呼び出しインターフェース
   * @param {object} opts {provider, apiKey, model, system, prompt, maxTokens, signal, demo*}
   * @returns {Promise<string>}
   */
  async function callAI(opts) {
    switch (opts.provider) {
      case 'demo':   return demoReport(opts);
      case 'claude': return callClaude(opts);
      case 'openai': return callOpenAICompat('https://api.openai.com/v1', opts, true);
      case 'grok':   return callOpenAICompat('https://api.x.ai/v1', opts, false);
      case 'gemini': return callGemini(opts);
      default: throw new Error('未対応のプロバイダです: ' + opts.provider);
    }
  }

  window.AI = { PROVIDERS: PROVIDERS, call: callAI };
})();
