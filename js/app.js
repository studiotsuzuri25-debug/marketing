/* メインアプリ — 設定 / チーム編成 / 並列実行 / 資料統合 / ダウンロード */
(function () {
  'use strict';

  const $ = function (sel) { return document.querySelector(sel); };
  const SETTINGS_KEY = 'aml_settings_v1';

  /* ============ 分析レベル定義 ============ */
  const LEVELS = {
    1: {
      name: 'Lv.1 クイック',
      agents: 8,
      agentTokens: 1024,
      synthTokens: 4500,
      reportCap: 3500,
      charts: 4,
      sourceChars: 12000,
      researchQueries: 3,
      researchChars: 8000,
      instruction: '要点のみを簡潔にまとめてください。箇条書き中心で、全体で400字程度。最重要ポイント3つと結論を必ず含めてください。',
      synthInstruction: 'コンパクトでも戦略的な資料（A4で4〜5ページ相当）にまとめてください。各章に図表を入れ、要点を可視化してください。',
    },
    2: {
      name: 'Lv.2 スタンダード',
      agents: 16,
      agentTokens: 2048,
      synthTokens: 8192,
      reportCap: 6000,
      charts: 7,
      sourceChars: 24000,
      researchQueries: 5,
      researchChars: 14000,
      instruction: '担当分野についてバランス良く分析してください。見出しと箇条書きを使い、全体で800〜1200字程度。根拠・示唆・推奨アクションを含めてください。',
      synthInstruction: '経営会議で使える本格的な戦略レポート（A4で8〜12ページ相当）としてまとめてください。3C/SWOT/4P/ファイブフォース/ポジショニングマップ等のフレームワークを適切に用い、各章に図表と比較表を豊富に盛り込んでください。',
    },
    3: {
      name: 'Lv.3 ディープ',
      agents: 28,
      agentTokens: 4096,
      synthTokens: 8192,
      reportCap: 9000,
      charts: 12,
      sourceChars: 48000,
      researchQueries: 8,
      researchChars: 24000,
      instruction: '担当分野について、極めて詳細かつ徹底的に分析してください。定量的な推定値（推定と明記）、複数の視点、具体例、反論の検討、詳細な推奨アクションを含め、見出し・表・箇条書きを駆使して2000字以上の深い報告をしてください。',
      synthInstruction: '極めて詳細かつ網羅的なコンサルティング水準の戦略レポート（A4で15ページ以上相当）としてまとめてください。3C/SWOT/クロスSWOT/4P/4C/ファイブフォース/バリューチェーン/ポジショニングマップ/STP/カスタマージャーニー等のフレームワークを駆使し、各章に複数の図表・比較表・数値目安・時系列ロードマップを盛り込み、具体的な打ち手を優先度・期待効果・必要リソース付きで提示してください。',
    },
  };

  /* ============ 自社情報の質問項目 ============ */
  const PROFILE_QUESTIONS = [
    { key: 'name', q: '会社名・屋号・ブランド名は？', ph: '例: サロン・ド・ツヅリ' },
    { key: 'business', q: '事業内容・提供している商品やサービスは？', ph: '例: フェイシャル・痩身エステ、フェイシャル機器の販売' },
    { key: 'area', q: '営業エリア・店舗の所在地は？（実店舗調査に使います）', ph: '例: 東京都渋谷区、オンライン全国' },
    { key: 'target', q: '主なターゲット顧客は？', ph: '例: 30〜40代の働く女性' },
    { key: 'price', q: '価格帯は？', ph: '例: 1回8,000〜15,000円、月額コース3万円' },
    { key: 'strength', q: '自社の強み・こだわりは？', ph: '例: 完全個室、独自の美容機器、リピート率80%' },
    { key: 'weakness', q: '課題・弱みだと感じている点は？', ph: '例: 新規集客が弱い、SNS運用が手薄' },
    { key: 'channel', q: '集客・販売チャネルは？', ph: '例: Instagram、ホットペッパー、紹介' },
    { key: 'url', q: '自社サイト・SNSのURLは？', ph: '例: https://example.com, Instagram @xxxx' },
    { key: 'goal', q: 'この分析で達成したいことは？', ph: '例: 競合との差別化、新規客の獲得' },
  ];

  function loadProfile() {
    return (state.settings && state.settings.profile) || {};
  }
  function profileFilledCount() {
    const p = loadProfile();
    return PROFILE_QUESTIONS.filter(function (q) { return (p[q.key] || '').trim(); }).length;
  }
  function profileToText() {
    const p = loadProfile();
    const lines = PROFILE_QUESTIONS
      .filter(function (q) { return (p[q.key] || '').trim(); })
      .map(function (q) { return '- ' + q.q + ' → ' + p[q.key].trim(); });
    return lines.length ? lines.join('\n') : '';
  }

  /* ============ 状態 ============ */
  const state = {
    settings: loadSettings(),
    mode: 'market',
    competitors: '',
    topic: '',
    level: 2,
    agents: [],
    synth: null,
    abort: null,
    running: false,
    finalReport: '',
    startedAt: null,
    sourceDigest: '',
    sourceNames: [],
    researchDigest: '',
    researchCount: 0,
    researchImages: [],
    competitorNames: [],
    historyId: null,
    usage: null,
  };

  function resetUsage() {
    state.usage = { input: 0, output: 0, calls: 0, cost: 0, hasCost: false };
  }
  function recordUsage(u) {
    if (!state.usage) resetUsage();
    state.usage.input += u.input || 0;
    state.usage.output += u.output || 0;
    state.usage.calls += 1;
    const c = AI.estimateCost(state.settings.provider, currentModel(), u.input || 0, u.output || 0);
    if (c != null) { state.usage.cost += c; state.usage.hasCost = true; }
  }

  /* 自社情報・競合指定・分析モードをプロンプトに埋め込むブロック */
  function contextBlock() {
    let b = '';
    if (state.mode === 'competitor') {
      b += '\n\n【分析モード】自社と競合の比較分析\n';
      const prof = profileToText();
      if (prof) {
        b += '■ 自社情報（登録済み。これを分析の起点にする）:\n' + prof + '\n';
      } else {
        b += '■ 自社情報は未登録です。テーマ本文から自社の状況を読み取ってください。\n';
      }
      if (state.competitors) {
        b += '■ ユーザー指定の競合:\n' + state.competitors + '\n';
      } else {
        b += '■ 競合の指定はありません。市場・エリア内の実在の競合を自動調査結果から特定し、自社と比較してください。\n';
      }
      b += '自社と競合を具体的な項目（価格・サービス・強み弱み・集客チャネル・SNS・立地など）で比較し、差別化ポイントと打ち手を提示してください。';
    } else {
      const prof = profileToText();
      if (prof) b += '\n\n【参考: 依頼者の自社情報】\n' + prof;
    }
    return b;
  }

  /* ソース資料＋自動リサーチ結果をプロンプトに埋め込むブロックを生成 */
  function sourceBlock(maxChars) {
    let block = '';
    if (state.sourceDigest) {
      let d = state.sourceDigest;
      if (maxChars && d.length > maxChars) d = d.slice(0, maxChars) + '\n…（以降省略）';
      block += '\n\n【ユーザー提供の参考資料】\n' +
        '以下の資料を最優先の根拠として分析してください。資料に基づく記述には出典（資料番号・資料名）を明示し、' +
        '資料にない事項を学習知識で補う場合はその旨を区別して書いてください。\n\n' + d;
    }
    if (state.researchDigest) {
      block += '\n\n【エージェントによるリアルタイムWeb調査結果（検索エンジン・実店舗・Instagram・口コミ）】\n' +
        '以下は、検索エンジン（Google相当のWEB検索）・ニュース・Instagram等の公開Web検索で、今このタイミングに自動収集した実データです。' +
        'エリア内の実在する店舗・競合・Instagramアカウント・口コミが含まれることがあります。これを最重要かつ最新の一次情報として分析に使ってください。' +
        '引用時は出典として「自動調査N」と該当URLを必ず明記してください。実在が確認できた店舗名・アカウント名・URLは具体的に報告してください。' +
        '一方で、検索結果は不正確・古い場合もあるため、断定を避け、確認できない事項は「未確認」と明記してください（虚偽・捏造は絶対禁止）。\n\n' +
        state.researchDigest;
    }
    return block;
  }

  function mergeSettings(s) {
    const defaults = { provider: 'demo', concurrency: 4, notify: true, autoResearch: true, keys: {}, models: {}, profile: {} };
    s = s || {};
    return Object.assign(defaults, s, {
      keys: Object.assign({}, s.keys),
      models: Object.assign({}, s.models),
      profile: Object.assign({}, s.profile),
    });
  }
  function loadSettings() {
    try {
      const raw = localStorage.getItem(SETTINGS_KEY);
      if (raw) return mergeSettings(JSON.parse(raw));
    } catch (e) { /* 破損時はデフォルト */ }
    return mergeSettings(null);
  }
  function saveSettings() {
    // ログイン中は暗号化して保存し、平文では保存しない
    if (window.Auth && Auth.isLoggedIn()) {
      Auth.saveSettings(state.settings).catch(function (e) { console.warn('設定の暗号化保存に失敗:', e); });
    } else {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(state.settings));
    }
  }
  function currentModel() {
    return state.settings.models[state.settings.provider] || AI.PROVIDERS[state.settings.provider].defaultModel;
  }
  function currentKey() {
    return (state.settings.keys[state.settings.provider] || '').trim();
  }

  /* ============ 設定画面 ============ */
  function renderSettings() {
    const list = $('#provider-list');
    const config = $('#provider-config');
    list.innerHTML = '';
    config.innerHTML = '';

    Object.keys(AI.PROVIDERS).forEach(function (key) {
      const p = AI.PROVIDERS[key];
      const label = document.createElement('label');
      label.className = 'provider-option';
      label.innerHTML =
        '<input type="radio" name="provider" value="' + key + '"' + (state.settings.provider === key ? ' checked' : '') + '>' +
        '<div class="p-body">' + Icons.svg(p.icon) + '<span>' + p.label + '</span></div>';
      list.appendChild(label);

      const block = document.createElement('div');
      block.className = 'provider-config-block';
      block.dataset.provider = key;
      block.hidden = state.settings.provider !== key;
      let inner = '';
      if (p.needsKey) {
        inner +=
          '<div class="field"><label>' + p.label + ' APIキー' +
          (p.keyUrl ? '（<a href="' + p.keyUrl + '" target="_blank" rel="noopener" style="color:var(--accent)">取得はこちら</a>）' : '') +
          '</label>' +
          '<input type="password" data-key-for="' + key + '" placeholder="' + (p.keyPlaceholder || '') + '" value="' +
          (state.settings.keys[key] || '').replace(/"/g, '&quot;') + '"></div>';
        inner +=
          '<div class="field"><label>モデル名</label>' +
          '<input type="text" data-model-for="' + key + '" placeholder="' + p.defaultModel + '" value="' +
          (state.settings.models[key] || p.defaultModel).replace(/"/g, '&quot;') + '">' +
          (p.modelOptions ?
            '<div class="model-chips" data-chips-for="' + key + '">' + p.modelOptions.map(function (m) {
              return '<button type="button" class="model-chip" data-model-chip="' + key + '" data-model-id="' + m.id + '">' +
                m.id + '<span class="chip-note">' + m.note + '</span></button>';
            }).join('') + '</div>'
            : '') +
          '<div class="fetch-models-row">' +
          '<button type="button" class="btn btn-ghost btn-sm" data-fetch-models="' + key + '">このAPIキーで使えるモデルを一覧取得</button>' +
          '<span class="hint" data-fetch-status="' + key + '"></span>' +
          '</div>' +
          '</div>';
      } else {
        inner += '<p class="hint">' + (p.note || '') + '</p>';
      }
      block.innerHTML = inner;
      config.appendChild(block);
    });

    list.addEventListener('change', function (e) {
      if (e.target.name !== 'provider') return;
      const selected = e.target.value;
      config.querySelectorAll('.provider-config-block').forEach(function (b) {
        b.hidden = b.dataset.provider !== selected;
      });
    });

    // モデル候補チップ: タップでモデル名欄に反映
    config.addEventListener('click', function (e) {
      const chip = e.target.closest('[data-model-chip]');
      if (chip) {
        const input = config.querySelector('[data-model-for="' + chip.dataset.modelChip + '"]');
        if (input) input.value = chip.dataset.modelId;
        config.querySelectorAll('[data-model-chip="' + chip.dataset.modelChip + '"]').forEach(function (c) {
          c.classList.toggle('active', c === chip);
        });
        return;
      }

      // 利用可能なモデル一覧をAPIから取得してチップを差し替え
      const fetchBtn = e.target.closest('[data-fetch-models]');
      if (fetchBtn) {
        const key = fetchBtn.dataset.fetchModels;
        const apiKeyInput = config.querySelector('[data-key-for="' + key + '"]');
        const status = config.querySelector('[data-fetch-status="' + key + '"]');
        const apiKey = apiKeyInput ? apiKeyInput.value.trim() : '';
        if (!apiKey) {
          status.textContent = '先にAPIキーを入力してください。';
          return;
        }
        status.textContent = '取得中…';
        fetchBtn.disabled = true;
        AI.listModels(key, apiKey)
          .then(function (models) {
            fetchBtn.disabled = false;
            if (!models.length) { status.textContent = 'モデルが見つかりませんでした。'; return; }
            status.textContent = models.length + '件のモデルが利用可能です。タップで選択できます。';
            const chips = config.querySelector('[data-chips-for="' + key + '"]');
            if (chips) {
              chips.innerHTML = models.slice(0, 24).map(function (id) {
                return '<button type="button" class="model-chip" data-model-chip="' + key + '" data-model-id="' +
                  escapeText(id) + '">' + escapeText(id) + '</button>';
              }).join('');
            }
          })
          .catch(function (err) {
            fetchBtn.disabled = false;
            status.textContent = '取得できませんでした: ' + (err.message || err);
          });
      }
    });

    $('#concurrency-input').value = state.settings.concurrency;
    $('#concurrency-value').textContent = state.settings.concurrency;
    $('#notify-input').checked = !!state.settings.notify;
    updateNotifyStatus();
  }

  function updateNotifyStatus() {
    const el = $('#notify-status');
    if (!('Notification' in window)) {
      el.textContent = 'このブラウザは通知に対応していません。';
    } else if (Notification.permission === 'denied') {
      el.textContent = '通知がブラウザ側でブロックされています。ブラウザの設定から許可してください。';
    } else if (Notification.permission === 'granted') {
      el.textContent = '通知は許可されています。';
    } else {
      el.textContent = '分析開始時に通知の許可を求めます。';
    }
  }

  function commitSettings() {
    const checked = document.querySelector('input[name="provider"]:checked');
    if (checked) state.settings.provider = checked.value;
    document.querySelectorAll('[data-key-for]').forEach(function (input) {
      state.settings.keys[input.dataset.keyFor] = input.value.trim();
    });
    document.querySelectorAll('[data-model-for]').forEach(function (input) {
      state.settings.models[input.dataset.modelFor] = input.value.trim() || AI.PROVIDERS[input.dataset.modelFor].defaultModel;
    });
    state.settings.concurrency = parseInt($('#concurrency-input').value, 10) || 4;
    state.settings.notify = $('#notify-input').checked;
    saveSettings();
    updateProviderBadge();
    if (state.settings.notify) requestNotifyPermission().then(updateNotifyStatus);
  }

  function updateProviderBadge() {
    const p = AI.PROVIDERS[state.settings.provider];
    $('#provider-badge').innerHTML = Icons.svg(p.icon) + '<span>' + p.label + '</span>';
  }

  /* ============ テーマ（ダーク／ライト） ============ */
  const THEME_KEY = 'aml_theme';
  function currentTheme() {
    return document.documentElement.dataset.theme === 'light' ? 'light' : 'dark';
  }
  function applyTheme(theme) {
    document.documentElement.dataset.theme = theme;
    try { localStorage.setItem(THEME_KEY, theme); } catch (e) { /* 無視 */ }
    const btn = $('#btn-theme');
    if (btn) {
      btn.innerHTML = Icons.svg(theme === 'dark' ? 'sun' : 'moon');
      btn.title = theme === 'dark' ? 'ライトモードに切替' : 'ダークモードに切替';
    }
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.content = theme === 'dark' ? '#05070c' : '#eef1f6';
  }
  function toggleTheme() {
    applyTheme(currentTheme() === 'dark' ? 'light' : 'dark');
  }

  /* ============ 通知（PWA） ============ */
  async function requestNotifyPermission() {
    if (!state.settings.notify || !('Notification' in window)) return;
    if (Notification.permission === 'default') {
      try { await Notification.requestPermission(); } catch (e) { /* 無視 */ }
    }
  }

  function sendNotification(title, body) {
    if (!state.settings.notify) return;
    if (!('Notification' in window) || Notification.permission !== 'granted') return;
    const options = {
      body: body,
      icon: 'icons/icon-192.png',
      badge: 'icons/icon-192.png',
      tag: 'aml-analysis',
    };
    // Service Worker経由（PWA/バックグラウンドでも届く）を優先し、不可なら直接表示
    if (navigator.serviceWorker && navigator.serviceWorker.controller) {
      navigator.serviceWorker.ready
        .then(function (reg) { return reg.showNotification(title, options); })
        .catch(function () { try { new Notification(title, options); } catch (e) { /* 無視 */ } });
    } else {
      try { new Notification(title, options); } catch (e) { /* 無視 */ }
    }
  }

  /* ============ モーダル ============ */
  function openModal(id) { $('#' + id).hidden = false; }
  function closeModal(id) { $('#' + id).hidden = true; }

  /* ============ 競合の特定（複数） ============ */
  async function discoverCompetitors(digest, area, signal) {
    // ユーザー指定の競合は必ず対象に含める
    const seeds = state.competitors
      ? state.competitors.split(/[\n,、･・]+/).map(function (s) { return s.trim(); }).filter(Boolean)
      : [];

    // デモや失敗時はヒューリスティック抽出でフォールバック
    if (state.settings.provider === 'demo' || !digest) {
      return dedupeNames(seeds.concat(Research.extractCandidateNames(digest || '', 8, state.topic)), 8);
    }
    try {
      const sys = 'あなたは競合リサーチのアシスタントです。指定されたJSON配列のみを出力し、説明文は出力しません。';
      const prompt =
        '次の「テーマ」と「Web調査結果」から、分析対象テーマの競合となる実在の企業・店舗・ブランド名を最大8件、重複なく抽出してください。\n' +
        (area ? 'エリア: ' + area + '（このエリアの実店舗を優先）\n' : '') +
        'テーマ: ' + state.topic + '\n\n' +
        'Web調査結果:\n' + digest.slice(0, 12000) + '\n\n' +
        '出力形式（実在が読み取れる固有名詞のみ。一般語・カテゴリ名は除外）:\n["店舗A","株式会社B",...]';
      const text = await AI.call({
        provider: state.settings.provider, apiKey: currentKey(), model: currentModel(),
        system: sys, prompt: prompt, maxTokens: 500, signal: signal, onUsage: recordUsage,
      });
      const start = text.indexOf('['), end = text.lastIndexOf(']');
      let arr = [];
      if (start !== -1 && end !== -1) arr = JSON.parse(text.slice(start, end + 1));
      arr = arr.filter(function (x) { return typeof x === 'string' && x.trim(); }).map(function (x) { return x.trim(); });
      const merged = dedupeNames(seeds.concat(arr), 8);
      return merged.length ? merged : dedupeNames(seeds.concat(Research.extractCandidateNames(digest, 8, state.topic)), 8);
    } catch (e) {
      if (signal.aborted) throw e;
      return dedupeNames(seeds.concat(Research.extractCandidateNames(digest, 8, state.topic)), 8);
    }
  }
  function dedupeNames(arr, max) {
    const seen = {}, out = [];
    arr.forEach(function (n) {
      const k = n.replace(/\s+/g, '').toLowerCase();
      if (n.length >= 2 && n.length <= 30 && !seen[k]) { seen[k] = 1; out.push(n); }
    });
    return out.slice(0, max);
  }

  /* ============ チーム編成 ============ */
  async function planTeam(topic, count, signal) {
    if (state.settings.provider === 'demo') {
      return Agents.buildLocalTeam(topic, count);
    }
    try {
      const system = 'あなたは市場分析プロジェクトのチーム編成AIです。指示されたJSONのみを出力し、それ以外の文章は一切出力しません。';
      const sourceHint = state.sourceNames.length
        ? '\n\nユーザーは参考資料を' + state.sourceNames.length + '件提供しています（' +
          state.sourceNames.slice(0, 10).join(' / ').slice(0, 300) +
          '）。資料の読み込み・検証を担当するエージェントも含めてください。'
        : '';
      const prompt =
        '次の市場分析テーマに最適なAIエージェントチームを' + count + '体分、JSON配列で作成してください。\n\n' +
        'テーマ:\n' + topic + sourceHint + '\n\n' +
        '条件:\n' +
        '- それぞれ異なる専門役割にする（市場規模、競合、顧客、トレンド、価格、チャネル、リスク、規制、SNS、海外事例など、テーマに合わせて多角的に）\n' +
        '- SNS・Instagram分析（トレンド・人気ハッシュタグ・伸びている投稿やビジュアルの傾向）を担当するエージェントを必ず1体以上含める\n' +
        '- Google検索・AI検索のキーワードトレンド分析を担当するエージェントを必ず1体含める\n' +
        '- name は英語のファーストネーム（例: Ethan, Olivia, Liam。半角英字・重複禁止）\n' +
        '- role は「〜アナリスト」「〜リサーチャー」などの肩書き（12文字以内）\n' +
        '- icon は次の一覧から役割に最も合うものを1つ選ぶ: ' + Icons.TEAM_ICON_NAMES.join(', ') + '\n' +
        '- focus はそのエージェントが分析する観点の説明（50字以内）\n\n' +
        '出力形式（この形式のJSON配列のみを出力）:\n' +
        '[{"name":"Ethan","role":"市場規模アナリスト","icon":"chart","focus":"市場規模と成長率を推定する"}]';
      const text = await AI.call({
        provider: state.settings.provider,
        apiKey: currentKey(),
        model: currentModel(),
        system: system,
        prompt: prompt,
        maxTokens: 4000,
        signal: signal,
        onUsage: recordUsage,
      });
      const start = text.indexOf('[');
      const end = text.lastIndexOf(']');
      if (start === -1 || end === -1) throw new Error('JSONが見つかりません');
      const arr = JSON.parse(text.slice(start, end + 1));
      const team = arr
        .filter(function (a) { return a && a.name && a.role; })
        .slice(0, count)
        .map(function (a) {
          return {
            name: String(a.name).slice(0, 10),
            role: String(a.role).slice(0, 20),
            icon: (a.icon && Icons.has(String(a.icon))) ? String(a.icon) : Icons.forRole(String(a.role)),
            focus: String(a.focus || a.role).slice(0, 120),
          };
        });
      if (team.length < Math.min(4, count)) throw new Error('チームが少なすぎます');
      // 不足分はローカルプールで補完
      if (team.length < count) {
        const extra = Agents.buildLocalTeam(topic + '_extra', count - team.length);
        team.push.apply(team, extra);
      }
      return team;
    } catch (e) {
      if (signal.aborted) throw e;
      console.warn('AIによるチーム編成に失敗したためローカル編成を使用します:', e);
      return Agents.buildLocalTeam(topic, count);
    }
  }

  /* ============ エージェント実行 ============ */
  async function runAgent(agent, level, signal) {
    agent.status = 'running';
    updateAgentCard(agent);
    const lv = LEVELS[level];
    const system =
      'あなたは「' + agent.name + '」という名前のAI市場分析エージェントです。\n' +
      '役割: ' + agent.role + '\n' +
      '担当領域: ' + agent.focus + '\n' +
      'あなたはチームの一員として、自分の担当領域に集中して分析報告を行います。' +
      '報告は日本語のMarkdown形式（見出し・箇条書き・必要に応じて表）で書いてください。絵文字や顔文字は一切使用しないでください。' +
      ((state.sourceDigest || state.researchDigest)
        ? '提供された参考資料と自動Webリサーチ結果が最重要の根拠です。内容を精読し、担当領域に関係する事実・数値を出典付きで引用してください。'
        : 'リアルタイムのWeb情報はないため、学習知識に基づく分析であることを踏まえ、具体的な数値は「推定」と明記してください。') +
      '事実の正確性を最優先してください。確認できない情報を事実として断定しない・虚偽のデータや存在しない統計・架空の出典を作らないことは絶対のルールです。不明な点は「不明」と正直に書いてください。' +
      'もしあなたにリアルタイムのWeb検索機能がある場合は積極的に活用し、最新の事実・数値・実在するURLを根拠として引用してください。';
    const snsExtra = /Instagram|インスタ|SNS/i.test(agent.role + agent.focus)
      ? '\nInstagram・SNSについては、トレンドのテーマ、人気・急上昇ハッシュタグ、検索されやすいキーワード、伸びている投稿の型（構図・色調・被写体・キャプションなどのビジュアル/表現傾向）、参考になるアカウントの傾向を、自動調査・資料の出典に基づいて具体的に分析してください。写真データそのものは取得できないため、人気ビジュアルの特徴は言語で詳しく描写してください。'
      : '';
    const kwExtra = /検索キーワード|検索トレンド|SEO/i.test(agent.role + agent.focus)
      ? '\nGoogle検索については、自動調査の「Google検索サジェスト」（実際に検索されている関連キーワード）と「Googleトレンド」データを根拠に、検索需要の高いキーワード、検索意図の分類（情報収集/比較検討/購入直前）、優先的に狙うべきキーワード戦略を分析してください。' +
        'AI検索については、ユーザーがChatGPT・Gemini等のAIに尋ねそうな質問例と、AIが提示しがちな回答・推奨の傾向、AIの回答で選ばれる（引用される）ために有効な施策を分析してください。この部分は実測データではなくAIモデルの知見に基づく分析であることを必ず明記してください。'
      : '';
    // 競合・店舗が複数特定されている場合、1社に絞らず全社を対象にするよう明示
    const compExtra = (state.competitorNames && state.competitorNames.length && /競合|比較|ブランド|市場|SNS|Instagram|顧客|価格|チャネル/.test(agent.role + agent.focus))
      ? '\n【重要】今回のWeb調査で次の競合・店舗が個別に調査されています。1社だけに絞らず、これら全てを対象に比較・分析してください: ' +
        state.competitorNames.join(' / ') +
        '\n各競合について、料金・サービス・強み弱み・立地・SNSなどを個別に触れ、可能な限り表で横比較してください。'
      : '';
    const prompt =
      '【分析テーマ】\n' + state.topic +
      contextBlock() +
      sourceBlock(lv.sourceChars) + '\n\n' +
      '【指示】\nあなたの担当領域「' + agent.role + '」の観点からこのテーマを分析し、報告してください。' + snsExtra + kwExtra + compExtra + '\n' +
      lv.instruction + '\n\n' +
      '【根拠の提示（必須・最重要）】\n' +
      '- すべての主要な主張には、必ず具体的な根拠（数値・固有名詞・事例・出典）を添えること。「〜と考えられる」だけで終わらせない。\n' +
      '- Web調査結果（自動調査N・競合N）や資料に書かれている事実は、該当する数字・文言を引用し、出典番号とURLを併記する。\n' +
      '- 主張→根拠→示唆（だから何が言えるか）の順で、論理をつなげて書く。\n' +
      '- 推測は「推測」、未確認は「未確認」、データが無い数値は「推定」と明記し、事実と区別する（虚偽・捏造は絶対禁止）。\n\n' +
      '最後に「**結論:**」として担当領域からの最重要メッセージを1〜2文で述べ、' +
      'その後に必ず「**根拠・出典:**」セクションを設けて次を箇条書きで明記してください。\n' +
      '- 参照した資料・自動調査・競合調査（番号・名称・URL）と、そこから得た具体的な事実・数値\n' +
      '- AIの学習知識に基づく部分（その旨を明記）\n' +
      '- 推定・仮説の部分（推定の根拠・考え方も簡潔に）';

    // レート制限(429)は待ち時間を読み取って粘り強くリトライする
    const maxAttempts = 5;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const text = await AI.call({
          provider: state.settings.provider,
          apiKey: currentKey(),
          model: currentModel(),
          system: system,
          prompt: prompt,
          maxTokens: lv.agentTokens,
          signal: signal,
          demoRole: agent.role,
          demoTopic: state.topic,
          demoSourceCount: state.sourceNames.length,
          onUsage: recordUsage,
        });
        agent.report = text.trim();
        agent.status = 'done';
        updateAgentCard(agent);
        return;
      } catch (e) {
        if (signal.aborted) {
          agent.status = 'waiting';
          updateAgentCard(agent);
          throw e;
        }
        const is429 = e.status === 429;
        // 無料枠で利用不可(limit: 0)のモデルはリトライしても無駄なので即エラー表示
        const isHardQuota = is429 && /limit: 0/i.test(e.message || '');
        const lastAttempt = attempt >= (is429 && !isHardQuota ? maxAttempts : 2);
        if (isHardQuota || lastAttempt) {
          agent.status = 'error';
          agent.error = e.message || String(e);
          updateAgentCard(agent);
          return;
        }
        let wait = 2000 * attempt + Math.random() * 2000;
        if (is429) {
          wait = Math.max(wait, 10000 * attempt); // レート制限は長めに待つ
          const m = /retry in ([0-9.]+)\s*s/i.exec(e.message || '');
          if (m) wait = Math.max(wait, parseFloat(m[1]) * 1000 + 2000);
        }
        await sleep(wait, signal);
      }
    }
  }

  function sleep(ms, signal) {
    return new Promise(function (resolve, reject) {
      const t = setTimeout(resolve, ms);
      if (signal) signal.addEventListener('abort', function () {
        clearTimeout(t);
        reject(new DOMException('Aborted', 'AbortError'));
      });
    });
  }

  /* 同時実行数を制限した並列プール */
  async function runPool(items, worker, limit, signal) {
    let index = 0;
    async function next() {
      while (index < items.length) {
        if (signal.aborted) return;
        const item = items[index++];
        try { await worker(item); } catch (e) { if (e.name === 'AbortError') return; }
        updateProgress();
      }
    }
    const lanes = [];
    for (let i = 0; i < Math.min(limit, items.length); i++) lanes.push(next());
    await Promise.all(lanes);
  }

  /* ============ 資料統合 ============ */
  async function synthesize(level, signal) {
    const lv = LEVELS[level];
    const done = state.agents.filter(function (a) { return a.status === 'done' && a.report; });
    if (!done.length) throw new Error('分析に成功したエージェントがいないため、資料を作成できません。');

    state.synth.status = 'running';
    updateSynthCard();
    setPhase(state.synth.name + ' が資料を作成中…', 92, 'pen');

    const reports = done.map(function (a) {
      let r = a.report;
      if (r.length > lv.reportCap) r = r.slice(0, lv.reportCap) + '\n…（以下省略）';
      return '━━━━━━━━━━━━━━\n■ 報告者: ' + a.name + '（' + a.role + '）\n━━━━━━━━━━━━━━\n' + r;
    }).join('\n\n');

    const system =
      'あなたは「' + state.synth.name + '」という名前の資料作成ディレクターAIです。' +
      '複数の専門エージェントの分析報告を統合し、1つの完成された市場分析資料（日本語・Markdown形式）を作成します。' +
      '見出し構造を整え、重複を排除し、矛盾があれば両論併記し、読み手がそのまま意思決定に使える品質に仕上げてください。' +
      '絵文字や顔文字は一切使用しないでください。' +
      'データの捏造・架空の出典の作成は絶対に禁止です。エージェント報告に無い数値を新たに作らないでください（報告内の数値の計算・集計は可）。';
    const prompt =
      '【分析テーマ】\n' + state.topic + contextBlock() + '\n\n' +
      '【分析レベル】' + lv.name + '\n' +
      '【指示】\n以下の' + done.length + '体のエージェントの報告をすべて統合し、市場分析資料を作成してください。\n' +
      lv.synthInstruction + '\n\n' +
      '資料の構成（各章に必ず図表を入れ、戦略的な示唆まで踏み込むこと）:\n' +
      '1. タイトル（# 見出し）と作成概要\n' +
      '2. エグゼクティブサマリー（冒頭に必ずKPIカードを置き、結論・推奨アクションを先に述べる）\n' +
      '3. 市場環境分析（市場規模・成長率の時系列グラフ、セグメント別構成、PEST/マクロtrend）\n' +
      '4. 顧客・ターゲット分析（ペルソナ、ニーズ、カスタマージャーニー）\n' +
      '5. 競合分析（競合比較表、ポジショニングマップ=radar、シェア構成=pie/donut。' + (state.mode === 'competitor' ? '自社と競合の項目別比較表を必ず入れる' : '主要プレイヤーの比較') +
      (state.competitorNames && state.competitorNames.length ? '。今回個別調査した次の競合を1社も欠かさず比較表に含めること: ' + state.competitorNames.join(' / ') : '') + '）\n' +
      '6. SNS・Instagramトレンド分析（人気ハッシュタグ・投稿傾向・言及数推移グラフ）\n' +
      '7. 検索キーワード・AI検索トレンド分析（需要キーワード表、検索意図の分類）\n' +
      '8. フレームワーク分析（3C・SWOT/クロスSWOT・4P・ファイブフォース等を該当レベルに応じて）\n' +
      '9. 戦略提言・推奨アクション（優先度・期待効果・必要リソース・時系列ロードマップ表）\n' +
      '10. リスクと留意点\n' +
      '11. 付録: 分析チーム一覧・出典一覧（参照した資料・自動調査・URL）' + '\n\n' +
      '【正確性のルール】\n' +
      '- 各章の重要な主張・数値には出典（資料番号・自動調査番号・URL・担当エージェント名、または「推定」）を付記する\n' +
      '- 出典が確認できない情報は「推定」「未確認」と明記し、事実として断定しない\n\n' +
      (state.sourceNames.length
        ? '【ユーザー提供の参考資料一覧】\n' +
          state.sourceNames.map(function (n, i) { return (i + 1) + '. ' + n; }).join('\n') +
          '\n（各エージェントはこれらの資料を根拠に分析しています。資料に基づく記述の出典表記を維持してください）\n\n'
        : '') +
      '【ビジュアル化の指示（最重要）】\n' +
      '文章だけの資料にせず、数値をグラフ・表・KPIカードで視覚化してください。以下の専用記法はそのまま図表としてレンダリングされます。\n' +
      '- 重要指標カード（エグゼクティブサマリー冒頭に必ず1つ）:\n' +
      '```kpi\n{"items":[{"label":"市場規模(2026年・推定)","value":"3,700億円","note":"前年比+5%"},{"label":"想定参入障壁","value":"中程度","note":"5段階中3"}]}\n```\n' +
      '- グラフ（1コードブロックに1つのJSON。typeは bar / hbar / line / pie / donut / radar）:\n' +
      '```chart\n{"type":"bar","title":"市場規模の推移（推定）","unit":"億円","labels":["2023","2024","2025","2026"],"series":[{"name":"市場規模","data":[3200,3350,3520,3700]}]}\n```\n' +
      '```chart\n{"type":"radar","title":"競合ポジショニング比較（推定）","labels":["価格","品質","認知度","チャネル","独自性"],"series":[{"name":"自社想定","data":[3,4,2,2,5]},{"name":"競合A","data":[4,4,5,5,3]}]}\n```\n' +
      'ルール:\n' +
      '- グラフを最低' + lv.charts + '個、内容に合わせて異なるtypeを使い分けて本文の適切な位置に埋め込む（推移=line/bar、構成比=pie/donut、ランキング=hbar、多軸比較=radar）\n' +
      '- KPIカードは複数の章で使ってよい。各章に最低1つは図表（グラフ/表/KPI）を入れる\n' +
      '- Markdownの比較表を各分析章に必ず入れる（競合比較・項目別評価・施策一覧など）\n' +
      '- 数値は報告・自動調査・資料の値を使い、無い場合は妥当な推定値を入れてタイトルか注記に「推定」と明記する\n' +
      '- JSONは厳密に有効な形式で書く（コメント・末尾カンマ・全角引用符は禁止）\n\n' +
      '【画像の引用】\n' +
      (state.researchImages && state.researchImages.length
        ? '以下は自動Web調査で見つかった実在の画像URLです。資料の関連する箇所に ![説明](画像URL) の形式で適宜引用してください（最大' +
          Math.min(state.researchImages.length, 8) + '枚程度）。必ずこのリストのURLをそのまま使い、URLを改変・創作しないこと。\n' +
          state.researchImages.slice(0, 8).map(function (u, i) { return (i + 1) + '. ' + u; }).join('\n') + '\n\n'
        : 'Web画像の候補は見つかりませんでした。画像URLを創作してはいけません。画像の代わりにグラフ・表で可視化してください。\n\n') +
      '【エージェントからの報告】\n\n' + reports;

    let text = null;
    for (let attempt = 1; attempt <= 4; attempt++) {
      try {
        text = await AI.call({
          provider: state.settings.provider,
          apiKey: currentKey(),
          model: currentModel(),
          system: system,
          prompt: prompt,
          maxTokens: lv.synthTokens,
          signal: signal,
          demoKind: 'synthesis',
          demoTopic: state.topic,
          demoCount: done.length,
          demoSourceCount: state.sourceNames.length,
          onUsage: recordUsage,
        });
        break;
      } catch (e) {
        if (signal.aborted) throw e;
        const retryable = (e.status === 429 && !/limit: 0/i.test(e.message || '')) || e.isTimeout;
        if (!retryable || attempt >= 4) throw e;
        let wait = 12000 * attempt;
        const m = /retry in ([0-9.]+)\s*s/i.exec(e.message || '');
        if (m) wait = Math.max(wait, parseFloat(m[1]) * 1000 + 2000);
        await sleep(wait, signal);
      }
    }

    state.finalReport = text.trim();
    state.synth.status = 'done';
    state.synth.report = state.finalReport;
    updateSynthCard();
  }

  /* ============ UI 描画 ============ */
  function statusHTML(agent) {
    switch (agent.status) {
      case 'waiting': return '<span class="agent-status status-waiting">' + Icons.svg('clock') + '待機中</span>';
      case 'running': return '<span class="agent-status status-running"><span class="spinner"></span>分析中…</span>';
      case 'done':    return '<span class="agent-status status-done">' + Icons.svg('check') + '報告完了</span>';
      case 'error':   return '<span class="agent-status status-error">' + Icons.svg('alert') + 'エラー</span>' +
        '<button type="button" class="retry-btn" data-retry="' + agent.id + '">' + Icons.svg('refresh') + '再実行</button>';
    }
    return '';
  }

  function renderGrid() {
    const grid = $('#agent-grid');
    grid.innerHTML = '';
    state.agents.forEach(function (agent, i) {
      const card = document.createElement('div');
      card.className = 'agent-card';
      card.id = 'agent-card-' + agent.id;
      card.style.animationDelay = (i * 40) + 'ms';
      card.innerHTML =
        '<div class="agent-avatar">' + Agents.avatarSVG(agent.name + agent.role, agent.name) + '</div>' +
        '<div class="agent-name">' + escapeText(agent.name) + '</div>' +
        '<div class="agent-role">' + escapeText(agent.role) + '</div>' +
        '<div class="status-slot">' + statusHTML(agent) + '</div>';
      card.addEventListener('click', function () { openAgentModal(agent); });
      grid.appendChild(card);
    });
    renderSynthCard();
  }

  function renderSynthCard() {
    const slot = $('#synth-slot');
    const s = state.synth;
    slot.innerHTML = '';
    if (!s) return;
    const card = document.createElement('div');
    card.className = 'synth-card';
    card.id = 'synth-card';
    card.innerHTML =
      '<div class="agent-avatar">' + Agents.avatarSVG(s.name + s.role, s.name) + '</div>' +
      '<div class="texts">' +
      '<div class="synth-label">DOCUMENT AGENT</div>' +
      '<div class="agent-name">' + escapeText(s.name) + '</div>' +
      '<div class="agent-role">' + escapeText(s.role) + ' — 全報告を統合して資料を作成します</div>' +
      '</div>' +
      '<div class="status-slot">' + statusHTML(s) + '</div>';
    card.addEventListener('click', function () { openAgentModal(s); });
    slot.appendChild(card);
  }

  function updateAgentCard(agent) {
    const card = document.getElementById('agent-card-' + agent.id);
    if (!card) return;
    card.className = 'agent-card ' + agent.status;
    card.querySelector('.status-slot').innerHTML = statusHTML(agent);
  }

  function updateSynthCard() {
    const card = document.getElementById('synth-card');
    if (!card) return;
    card.querySelector('.status-slot').innerHTML = statusHTML(state.synth);
  }

  function openAgentModal(agent) {
    $('#agent-modal-profile').innerHTML =
      '<div class="agent-avatar">' + Agents.avatarSVG(agent.name + agent.role, agent.name) + '</div>' +
      '<div><div class="name">' + escapeText(agent.name) + '</div>' +
      '<div class="role">' + escapeText(agent.role) + '｜' + escapeText(agent.focus || '') + '</div></div>';
    let body;
    if (agent.status === 'done' && agent.report) {
      body = MD.toHtml(agent.report);
    } else if (agent.status === 'error') {
      body = '<p style="color:var(--red)">分析中にエラーが発生しました。</p><p class="hint">' + escapeText(agent.error || '') + '</p>';
    } else if (agent.status === 'running') {
      body = '<p>現在分析中です。完了すると、ここに報告が表示されます。</p>';
    } else {
      body = '<p>実行待ちです。</p>';
    }
    $('#agent-modal-report').innerHTML = body;
    openModal('agent-modal');
  }

  function setPhase(text, percent, icon) {
    $('#run-phase').innerHTML = (icon ? Icons.svg(icon, 'phase-icon') : '') + '<span>' + escapeText(text) + '</span>';
    if (percent != null) $('#progress-bar').style.width = percent + '%';
  }

  function updateProgress() {
    const total = state.agents.length;
    const finished = state.agents.filter(function (a) { return a.status === 'done' || a.status === 'error'; }).length;
    const done = state.agents.filter(function (a) { return a.status === 'done'; }).length;
    const errors = finished - done;
    // 分析フェーズは全体の10%〜90%
    const pct = total ? 10 + (finished / total) * 80 : 10;
    $('#progress-bar').style.width = pct + '%';
    $('#progress-text').textContent =
      'エージェント報告: ' + finished + ' / ' + total + ' 体完了' + (errors ? '（エラー ' + errors + '体）' : '');
    if (finished < total) {
      setPhase(total + '体のエージェントが並列分析中…', null, 'bot');
    }
  }

  function escapeText(s) {
    const div = document.createElement('div');
    div.textContent = s == null ? '' : String(s);
    return div.innerHTML;
  }

  /* ============ メインフロー ============ */
  async function startAnalysis() {
    const topic = $('#topic-input').value.trim();
    const warning = $('#setup-warning');
    warning.hidden = true;
    if (!topic) {
      warning.textContent = '分析したい内容を入力してください。';
      warning.hidden = false;
      return;
    }
    const provider = AI.PROVIDERS[state.settings.provider];
    if (provider.needsKey && !currentKey()) {
      warning.textContent = provider.label + ' のAPIキーが未設定です。右上の「設定」から登録するか、デモモードを選択してください。';
      warning.hidden = false;
      return;
    }
    if (window.Auth && Auth.isCloud() && !Auth.isLoggedIn()) {
      warning.textContent = 'このアプリはアカウント制です。右上の「ログイン」からログイン（または新規登録）してください。';
      warning.hidden = false;
      updateAccountUI();
      setAuthMode('login');
      openModal('account-modal');
      return;
    }
    if (Sources.loadingCount() > 0) {
      warning.textContent = '参考資料の取り込みが完了していません。完了するまで少しお待ちください（不要な資料は削除ボタンで外せます）。';
      warning.hidden = false;
      return;
    }

    const levelInput = document.querySelector('input[name="level"]:checked');
    state.level = parseInt(levelInput ? levelInput.value : '2', 10);
    state.topic = topic;
    state.competitors = (state.mode === 'competitor') ? ($('#competitor-input').value || '').trim() : '';
    state.sourceDigest = Sources.buildDigest(LEVELS[state.level].sourceChars);
    state.sourceNames = Sources.listNames();
    state.researchDigest = '';
    state.researchCount = 0;
    state.researchImages = [];
    state.settings.autoResearch = $('#research-input').checked;
    saveSettings();
    state.historyId = null;
    resetUsage();
    state.finalReport = '';
    state.abort = new AbortController();
    state.running = true;
    state.startedAt = new Date();

    // 画面切替
    $('#setup-view').hidden = true;
    $('#run-view').hidden = false;
    $('#report-section').hidden = true;
    $('#btn-stop').hidden = false;
    $('#btn-new').hidden = true;
    $('#run-topic').textContent = '【' + (state.mode === 'competitor' ? '自社と競合の分析' : '市場分析') + '】「' + topic + '」｜' +
      LEVELS[state.level].name + '｜' + provider.label +
      (state.sourceNames.length ? '｜参考資料 ' + state.sourceNames.length + '件' : '');
    $('#agent-grid').innerHTML = '';
    $('#synth-slot').innerHTML = '';
    $('#progress-text').textContent = '';
    setPhase('分析テーマに合わせてチームを編成中…', 4, 'compass');

    requestNotifyPermission();

    const signal = state.abort.signal;
    $('#regen-bar').hidden = true;
    try {
      // 0) 自律Webリサーチ（市場・競合・SNS/口コミの傾向を自動収集）
      if (state.settings.autoResearch) {
        setPhase('自律Webリサーチ中…（市場・競合・SNS/口コミを自動調査）', 4, 'globe');
        try {
          const research = await Research.run(
            topic,
            LEVELS[state.level].researchQueries,
            LEVELS[state.level].researchChars,
            signal,
            function (done, total) {
              $('#progress-text').textContent = 'エージェントがWeb検索・実店舗/SNS調査を実行中: ' + done + ' / ' + total + ' 件';
            },
            {
              mode: state.mode,
              area: (loadProfile().area || '').trim(),
              company: (loadProfile().name || '').trim(),
              competitors: state.competitors,
            }
          );
          if (signal.aborted) return;
          state.researchDigest = research.digest;
          state.researchCount = research.results.length;
          state.researchImages = research.images || [];
          state.competitorNames = [];

          // 競合・店舗を複数特定し、それぞれを個別に深掘り調査する
          try {
            setPhase('競合・店舗を特定して個別に深掘り調査中…', 6, 'crosshair');
            const area = (loadProfile().area || '').trim();
            const names = await discoverCompetitors(research.digest, area, signal);
            if (!signal.aborted && names.length) {
              const deep = await Research.deepDive(
                names, area, LEVELS[state.level].researchChars, signal,
                function (done, total) {
                  $('#progress-text').textContent = '競合を個別調査中: ' + done + ' / ' + total + ' 社';
                }
              );
              if (!signal.aborted && deep.count) {
                state.researchDigest += '\n\n' + deep.digest;
                state.researchCount += deep.count;
                state.researchImages = (state.researchImages || []).concat(deep.images || []);
                state.competitorNames = deep.names;
              }
            }
          } catch (e) {
            if (signal.aborted) return;
            console.warn('競合深掘りに失敗（通常調査で続行）:', e);
          }

          $('#run-topic').textContent += '｜自動調査 ' + state.researchCount + '件' +
            (state.competitorNames.length ? '（競合' + state.competitorNames.length + '社を個別調査）' : '') +
            (research.failed ? '（' + research.failed + '件失敗）' : '');
        } catch (e) {
          if (signal.aborted) return;
          console.warn('自律リサーチに失敗しました（学習知識ベースで続行）:', e);
        }
      }

      // 1) チーム編成
      setPhase('分析テーマに合わせてチームを編成中…', 8, 'compass');
      const team = await planTeam(topic, LEVELS[state.level].agents, signal);
      if (signal.aborted) return;
      state.agents = team.map(function (t, i) {
        return Object.assign({ id: i, status: 'waiting', report: '', error: '' }, t);
      });
      state.synth = Object.assign({ id: 'synth', status: 'waiting', report: '', error: '' }, Agents.SYNTH_PROFILE);
      renderGrid();
      updateProgress();

      // 2) 並列分析
      await runPool(state.agents, function (agent) {
        return runAgent(agent, state.level, signal);
      }, state.settings.concurrency, signal);
      if (signal.aborted) return;

      // 3) 資料統合
      await synthesize(state.level, signal);
      if (signal.aborted) return;

      // 4) 完成
      const secs = Math.round((new Date() - state.startedAt) / 1000);
      setPhase('分析完了（所要 ' + Math.floor(secs / 60) + '分' + (secs % 60) + '秒）', 100, 'check');
      showReport();
      saveToHistory();
      sendNotification('市場分析が完了しました',
        '「' + state.topic.slice(0, 40) + '」の資料ができあがりました。タップして確認してください。');
    } catch (e) {
      if (e.name === 'AbortError' || signal.aborted) {
        setPhase('停止しました', null, 'stop');
      } else {
        setPhase('エラーが発生しました', null, 'alert');
        $('#progress-text').textContent = e.message || String(e);
        sendNotification('市場分析でエラーが発生しました', e.message || String(e));
        if (state.synth && state.synth.status === 'running') {
          state.synth.status = 'error';
          state.synth.error = e.message || String(e);
          updateSynthCard();
        }
      }
    } finally {
      state.running = false;
      $('#btn-stop').hidden = true;
      $('#btn-new').hidden = false;
    }
  }

  function stopAnalysis() {
    if (state.abort) state.abort.abort();
    state.running = false;
    $('#btn-stop').hidden = true;
    $('#btn-new').hidden = false;
    setPhase('停止しました', null, 'stop');
  }

  /* エラーになったエージェントを個別に再実行 */
  async function retryAgent(id) {
    if (id === 'synth') { regenerateReport(); return; }
    const agent = state.agents.find(function (a) { return String(a.id) === String(id); });
    if (!agent || agent.status === 'running') return;
    if (!state.abort || state.abort.signal.aborted) state.abort = new AbortController();
    const signal = state.abort.signal;
    agent.error = '';
    try {
      await runAgent(agent, state.level, signal);
    } catch (e) { /* 中断 */ }
    updateProgress();
    if (agent.status === 'done' && !state.running && state.synth) {
      $('#regen-bar').hidden = false;
      if (!state.finalReport) regenerateReport();
    }
  }

  /* 最新のエージェント報告で資料を再生成 */
  async function regenerateReport() {
    if (state.running || (state.synth && state.synth.status === 'running')) return;
    if (!state.abort || state.abort.signal.aborted) state.abort = new AbortController();
    const signal = state.abort.signal;
    $('#regen-bar').hidden = true;
    try {
      await synthesize(state.level, signal);
      if (signal.aborted) return;
      setPhase('資料を更新しました', 100, 'check');
      showReport();
      saveToHistory();
      sendNotification('資料を更新しました', '最新のエージェント報告で資料を再生成しました。');
    } catch (e) {
      if (signal.aborted) return;
      if (state.synth) {
        state.synth.status = 'error';
        state.synth.error = e.message || String(e);
        updateSynthCard();
      }
      setPhase('資料の再生成でエラーが発生しました', null, 'alert');
      $('#progress-text').textContent = e.message || String(e);
    }
  }

  /* ============ 分析履歴 ============ */
  function snapshotAgents() {
    return state.agents.map(function (a) {
      return { name: a.name, role: a.role, icon: a.icon, focus: a.focus, status: a.status, report: a.report, error: a.error };
    });
  }

  function saveToHistory() {
    try {
      const data = {
        topic: state.topic,
        mode: state.mode,
        competitors: state.competitors,
        level: state.level,
        provider: state.settings.provider,
        finalReport: state.finalReport,
        sourceNames: state.sourceNames,
        researchCount: state.researchCount,
        competitorNames: state.competitorNames,
        usage: state.usage,
        agents: snapshotAgents(),
        synth: state.synth ? {
          name: state.synth.name, role: state.synth.role, icon: state.synth.icon,
          focus: state.synth.focus, status: state.synth.status, report: state.synth.report,
        } : null,
      };
      if (state.historyId && RunHistory.get(state.historyId)) {
        RunHistory.update(state.historyId, data);
      } else {
        state.historyId = RunHistory.add(data);
      }
    } catch (e) {
      console.warn('履歴の保存に失敗しました:', e);
    }
  }

  function formatHistoryDate(ts) {
    try {
      return new Date(ts).toLocaleString('ja-JP', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
    } catch (e) { return ''; }
  }

  function renderHistory() {
    const list = $('#history-list');
    const entries = RunHistory.all();
    if (!entries.length) {
      list.innerHTML = '<p class="hint">まだ履歴がありません。分析が完了すると自動で保存されます。</p>';
      return;
    }
    list.innerHTML = entries.map(function (e) {
      const lv = (LEVELS[e.level] || {}).name || '';
      const provider = (AI.PROVIDERS[e.provider] || {}).label || e.provider || '';
      return '<div class="history-item" data-history-id="' + e.id + '">' +
        '<div class="h-main">' +
        '<div class="h-topic">' + escapeText(e.topic || '(無題)') + '</div>' +
        '<div class="h-meta">' + formatHistoryDate(e.ts) + '｜' + escapeText(lv) + '｜' + escapeText(provider) +
        '｜エージェント' + (e.agents || []).length + '体' + (e.updated ? '｜更新あり' : '') + '</div>' +
        '</div>' +
        '<button type="button" class="h-del" data-history-del="' + e.id + '" title="この履歴を削除">' + Icons.svg('trash') + '</button>' +
        '</div>';
    }).join('');
  }

  function loadHistoryEntry(id) {
    const entry = RunHistory.get(id);
    if (!entry) return;
    if (state.running) {
      alert('分析の実行中は履歴を開けません。停止してから開いてください。');
      return;
    }
    if (state.abort) state.abort.abort();
    state.historyId = entry.id;
    state.topic = entry.topic || '';
    state.mode = entry.mode || 'market';
    state.competitors = entry.competitors || '';
    state.level = entry.level || 2;
    state.finalReport = entry.finalReport || '';
    state.sourceNames = entry.sourceNames || [];
    state.sourceDigest = '';
    state.researchDigest = '';
    state.researchCount = entry.researchCount || 0;
    state.competitorNames = entry.competitorNames || [];
    state.usage = entry.usage || null;
    state.agents = (entry.agents || []).map(function (a, i) {
      return Object.assign({ id: i, report: '', error: '' }, a);
    });
    state.synth = Object.assign({ id: 'synth', status: 'done', report: '', error: '' }, entry.synth || Agents.SYNTH_PROFILE);

    closeModal('history-modal');
    $('#setup-view').hidden = true;
    $('#run-view').hidden = false;
    $('#btn-stop').hidden = true;
    $('#btn-new').hidden = false;
    $('#regen-bar').hidden = true;
    const provider = (AI.PROVIDERS[entry.provider] || {}).label || entry.provider || '';
    $('#run-topic').textContent = '「' + state.topic + '」｜' + ((LEVELS[state.level] || {}).name || '') + '｜' + provider +
      (state.researchCount ? '｜自動調査 ' + state.researchCount + '件' : '');
    renderGrid();
    updateProgress();
    setPhase('履歴を表示中（' + formatHistoryDate(entry.ts) + '）', 100, 'history');
    if (state.finalReport) {
      $('#report-content').innerHTML = MD.toHtml(state.finalReport);
      $('#report-section').hidden = false;
      renderUsage();
    } else {
      $('#report-section').hidden = true;
    }
    window.scrollTo({ top: 0 });
  }

  function resetToSetup() {
    showMenu();
  }

  function showReport() {
    $('#report-content').innerHTML = MD.toHtml(state.finalReport);
    $('#report-section').hidden = false;
    renderUsage();
    $('#report-section').scrollIntoView({ behavior: 'smooth' });
  }

  function renderUsage() {
    const el = $('#usage-bar');
    const u = state.usage;
    if (!u || !u.calls) { el.hidden = true; return; }
    const provider = (AI.PROVIDERS[state.settings.provider] || {}).label || state.settings.provider;
    const total = u.input + u.output;
    let costHtml = '';
    if (state.settings.provider === 'demo') {
      costHtml = '<span class="usage-cost">デモモード（課金なし）</span>';
    } else if (u.hasCost) {
      const usd = u.cost;
      const jpy = Math.round(usd * 155);
      costHtml = '<span class="usage-cost">概算コスト: 約 $' + usd.toFixed(usd < 1 ? 4 : 2) + '（約 ' + jpy.toLocaleString('ja-JP') + '円）</span>';
    } else {
      costHtml = '<span class="usage-cost">概算コスト: 単価不明のモデルのため算出不可</span>';
    }
    el.innerHTML =
      '<span class="usage-icon" data-icon="activity"></span>' +
      '<div class="usage-body">' +
      '<div class="usage-title">AIクレジット使用量（' + escapeText(provider) + ' / ' + escapeText(currentModel()) + '）</div>' +
      '<div class="usage-nums">' +
      '<span>API呼び出し <strong>' + u.calls + '</strong> 回</span>' +
      '<span>入力 <strong>' + u.input.toLocaleString('ja-JP') + '</strong> トークン</span>' +
      '<span>出力 <strong>' + u.output.toLocaleString('ja-JP') + '</strong> トークン</span>' +
      '<span>合計 <strong>' + total.toLocaleString('ja-JP') + '</strong> トークン</span>' +
      costHtml +
      '</div></div>';
    el.hidden = false;
    Icons.hydrate(el);
  }

  /* ============ ダウンロード ============ */
  function fileStamp() {
    const d = new Date();
    const pad = function (n) { return String(n).padStart(2, '0'); };
    return d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate()) + '_' + pad(d.getHours()) + pad(d.getMinutes());
  }

  function downloadBlob(content, mime, filename) {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 5000);
  }

  function standaloneHTML() {
    const body = MD.toHtml(state.finalReport);
    return '<!DOCTYPE html>\n<html lang="ja"><head><meta charset="UTF-8">' +
      '<meta name="viewport" content="width=device-width, initial-scale=1.0">' +
      '<title>市場分析レポート</title><style>' +
      'body{font-family:"Hiragino Kaku Gothic ProN","Hiragino Sans","Noto Sans JP","Yu Gothic",Meiryo,sans-serif;' +
      'max-width:820px;margin:0 auto;padding:48px 32px;color:#1c2330;line-height:1.8;font-size:15px}' +
      'h1{font-size:26px;border-bottom:2px solid #1c2330;padding-bottom:10px}' +
      'h2{font-size:20px;border-left:4px solid #3d7bf0;padding-left:10px;margin-top:32px}' +
      'h3{font-size:16.5px;margin-top:24px}' +
      'table{border-collapse:collapse;width:100%;margin:14px 0}' +
      'th,td{border:1px solid #b9c2d0;padding:7px 12px;font-size:13.5px;text-align:left}' +
      'th{background:#eef1f6}' +
      'blockquote{border-left:3px solid #3d7bf0;padding:4px 14px;color:#4a5568;margin:12px 0}' +
      'code{background:#eef1f6;border-radius:5px;padding:1px 6px}' +
      'pre{background:#eef1f6;border-radius:8px;padding:14px;overflow-x:auto}' +
      'hr{border:none;border-top:1px solid #b9c2d0;margin:24px 0}' +
      '.table-scroll{overflow-x:auto;max-width:100%}' +
      '.chart-figure{margin:20px 0;padding:16px 14px 12px;border:1px solid #e3e8ef;border-radius:6px;background:#fdfdfe;page-break-inside:avoid}' +
      '.chart-figure figcaption{font-size:13.5px;font-weight:700;color:#2b3546;margin-bottom:10px}' +
      '.chart-figure svg{width:100%;height:auto;display:block}' +
      '.chart-unit{font-size:11px;font-weight:400;color:#7b8698;margin-left:8px}' +
      '.chart-legend{display:flex;flex-wrap:wrap;gap:6px 16px;margin-top:10px}' +
      '.chart-legend-col{flex-direction:column;gap:6px;margin-top:0}' +
      '.chart-legend-item{display:inline-flex;align-items:center;gap:6px;font-size:12px;color:#3a4454}' +
      '.chart-swatch{width:10px;height:10px;border-radius:2px;flex-shrink:0}' +
      '.chart-pie-wrap{display:flex;align-items:center;gap:22px;flex-wrap:wrap}' +
      '.chart-pie-wrap svg{width:190px;flex-shrink:0}' +
      '.chart-radar-wrap{display:flex;justify-content:center}' +
      '.chart-radar-wrap svg{max-width:340px}' +
      '.kpi-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px;margin:18px 0}' +
      '.kpi-card{border:1px solid #e3e8ef;border-left:3px solid #2563eb;border-radius:6px;padding:12px 14px;background:#fdfdfe}' +
      '.kpi-label{font-size:11px;color:#7b8698}' +
      '.kpi-value{font-size:21px;font-weight:700;color:#1c2740;line-height:1.3;margin-top:2px}' +
      '.kpi-note{font-size:11px;color:#5d6b80;margin-top:2px}' +
      '.report-img{margin:18px 0;text-align:center;page-break-inside:avoid}' +
      '.report-img img{max-width:100%;height:auto;border-radius:6px;border:1px solid #e3e8ef}' +
      '.report-img figcaption{font-size:11.5px;color:#7b8698;margin-top:6px}' +
      'footer{margin-top:48px;font-size:12px;color:#8a94a6;border-top:1px solid #e2e6ee;padding-top:12px}' +
      '@media print{body{padding:0}}' +
      '</style></head><body>' + body +
      '<footer>Generated by Agent Market Lab（マルチAIエージェント市場分析ツール）｜' +
      new Date().toLocaleString('ja-JP') + '</footer></body></html>';
  }

  function downloadPDF() {
    // 印刷ダイアログ経由でPDF保存（依存ライブラリ不要で最も確実な方法）
    const w = window.open('', '_blank');
    if (!w) {
      alert('ポップアップがブロックされました。ブラウザの設定でポップアップを許可してください。');
      return;
    }
    w.document.write(standaloneHTML());
    w.document.close();
    w.focus();
    setTimeout(function () { w.print(); }, 400);
  }

  /* ============ ソースUI ============ */
  function sourceIcon(src) {
    if (src.type === 'url') return 'link';
    const n = src.name.toLowerCase();
    if (/\.pdf$/.test(n)) return 'file';
    if (/\.(xlsx|xlsm|xls|ods|csv|tsv)$/.test(n)) return 'chart';
    return 'alignleft';
  }

  function renderSourceList() {
    const list = $('#source-list');
    list.innerHTML = '';
    Sources.all.forEach(function (src) {
      const li = document.createElement('li');
      li.className = 'source-item ' + src.status;
      const detail = src.status === 'error' ? (src.error || '取り込み失敗') : src.detail;
      li.innerHTML =
        '<span class="s-icon">' + Icons.svg(sourceIcon(src)) + '</span>' +
        '<span class="s-name" title="' + escapeText(src.name) + '">' + escapeText(src.name) + '</span>' +
        (src.status === 'loading' ? '<span class="spinner"></span>' : '') +
        '<span class="s-detail">' + escapeText(detail) + '</span>' +
        '<button class="s-remove" title="削除" data-id="' + src.id + '">' + Icons.svg('x') + '</button>';
      li.querySelector('.s-remove').addEventListener('click', function () { Sources.remove(src.id); });
      list.appendChild(li);
    });
    $('#url-proxy-note').hidden = !Sources.all.some(function (s) { return s.type === 'url'; });
  }

  function addUrlFromInput() {
    const input = $('#url-input');
    const warning = $('#setup-warning');
    warning.hidden = true;
    if (!input.value.trim()) return;
    try {
      Sources.addUrl(input.value);
      input.value = '';
    } catch (e) {
      warning.textContent = e.message;
      warning.hidden = false;
    }
  }

  function setupSourceEvents() {
    Sources.setOnChange(renderSourceList);
    $('#btn-add-url').addEventListener('click', addUrlFromInput);
    $('#url-input').addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); addUrlFromInput(); }
    });

    const zone = $('#drop-zone');
    const fileInput = $('#file-input');
    zone.addEventListener('click', function () { fileInput.click(); });
    fileInput.addEventListener('change', function () {
      if (fileInput.files.length) Sources.addFiles(fileInput.files);
      fileInput.value = '';
    });
    ['dragenter', 'dragover'].forEach(function (ev) {
      zone.addEventListener(ev, function (e) { e.preventDefault(); zone.classList.add('dragover'); });
    });
    ['dragleave', 'drop'].forEach(function (ev) {
      zone.addEventListener(ev, function (e) { e.preventDefault(); zone.classList.remove('dragover'); });
    });
    zone.addEventListener('drop', function (e) {
      if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length) {
        Sources.addFiles(e.dataTransfer.files);
      }
    });
  }

  /* ============ アカウント（暗号化設定・端末間同期） ============ */
  let authMode = 'login';

  function updateAccountUI() {
    const loggedIn = window.Auth && Auth.isLoggedIn();
    const cloud = window.Auth && Auth.isCloud();
    $('#account-label').textContent = loggedIn ? Auth.currentId() : 'ログイン';
    $('#account-logged-out').hidden = loggedIn;
    $('#account-logged-in').hidden = !loggedIn;
    if (loggedIn) $('#account-current').textContent = Auth.currentId();
    // クラウド有効時は同期ファイルのUIは不要、Googleログインはクラウド有効時のみ
    $('#sync-import-block').hidden = cloud;
    $('#btn-sync-export').hidden = cloud;
    $('#google-block').hidden = !cloud;
    $('#cloud-status').innerHTML = cloud
      ? Icons.svg('globe') + ' クラウド同期: <strong>有効</strong> — 同じID・パスワードでどの端末（PC・タブレット・スマホのブラウザ）からでも利用できます。'
      : Icons.svg('lock') + ' クラウド同期: 無効 — アカウントはこの端末内に保存されます（別端末へは同期ファイルで移行）。';
  }

  function setAuthMode(mode) {
    authMode = mode;
    $('#tab-login').classList.toggle('active', mode === 'login');
    $('#tab-register').classList.toggle('active', mode === 'register');
    $('#auth-pw2-field').hidden = mode !== 'register';
    $('#btn-auth-submit').textContent = mode === 'login' ? 'ログイン' : '登録してログイン';
    $('#auth-error').hidden = true;
  }

  function authFail(msg) {
    const el = $('#auth-error');
    el.textContent = msg;
    el.hidden = false;
  }

  async function afterAuthSuccess() {
    // アカウントの設定を読み込み、平文設定は端末から削除（セキュリティ強化）
    const loaded = await Auth.loadSettings();
    state.settings = mergeSettings(loaded);
    localStorage.removeItem(SETTINGS_KEY);
    saveSettings();
    renderSettings();
    updateProviderBadge();
    $('#research-input').checked = state.settings.autoResearch !== false;
    updateAccountUI();
    closeModal('account-modal');
  }

  async function submitAuth() {
    const id = $('#auth-id').value;
    const pw = $('#auth-pw').value;
    try {
      if (authMode === 'register') {
        if (pw !== $('#auth-pw2').value) throw new Error('確認用パスワードが一致しません。');
        // 端末に保存済みの設定（ゲスト設定）を初期値として引き継ぐ
        await Auth.register(id, pw, state.settings);
      } else {
        await Auth.login(id, pw);
      }
      $('#auth-pw').value = '';
      $('#auth-pw2').value = '';
      await afterAuthSuccess();
    } catch (e) {
      authFail(e.message || String(e));
      updateAccountUI();
    }
  }

  function doLogout() {
    Auth.logout();
    state.settings = mergeSettings(null); // 復号済み設定（APIキー含む）をメモリから破棄
    renderSettings();
    updateProviderBadge();
    $('#research-input').checked = true;
    updateAccountUI();
  }

  function setupAccountEvents() {
    $('#btn-account').addEventListener('click', function () {
      updateAccountUI();
      setAuthMode('login');
      openModal('account-modal');
    });
    $('#tab-login').addEventListener('click', function () { setAuthMode('login'); });
    $('#tab-register').addEventListener('click', function () { setAuthMode('register'); });
    $('#btn-auth-submit').addEventListener('click', submitAuth);
    $('#auth-pw').addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && authMode === 'login') submitAuth();
    });
    $('#btn-logout').addEventListener('click', doLogout);
    $('#btn-google').addEventListener('click', async function () {
      const pw = $('#auth-pw').value;
      try {
        await Auth.loginGoogle(pw, state.settings);
        $('#auth-pw').value = '';
        await afterAuthSuccess();
      } catch (e) {
        authFail(e.message || String(e));
      }
    });
    $('#btn-sync-export').addEventListener('click', function () {
      try {
        downloadBlob(Auth.exportFile(), 'application/json;charset=utf-8', 'agent-market-lab-sync_' + fileStamp() + '.json');
      } catch (e) { alert(e.message || String(e)); }
    });
    $('#btn-sync-import').addEventListener('click', function () { $('#sync-file-input').click(); });
    $('#sync-file-input').addEventListener('change', function () {
      const file = $('#sync-file-input').files[0];
      $('#sync-file-input').value = '';
      if (!file) return;
      const fr = new FileReader();
      fr.onload = function () {
        try {
          const id = Auth.importFile(String(fr.result));
          authFail('同期ファイルを読み込みました。ID「' + id + '」とパスワードでログインしてください。');
          $('#auth-id').value = id;
          setAuthMode('login');
          $('#auth-error').hidden = false;
        } catch (e) {
          authFail(e.message || String(e));
        }
      };
      fr.readAsText(file);
    });

    // タブを開いている間のログイン状態を復元
    Auth.resumeSession().then(function (id) {
      if (!id) return;
      return afterAuthSuccess();
    }).catch(function (e) { console.warn(e); });
  }

  /* ============ メニュー・自社情報 ============ */
  function showMenu() {
    if (state.abort) state.abort.abort();
    state.running = false;
    $('#menu-view').hidden = false;
    $('#setup-view').hidden = true;
    $('#run-view').hidden = true;
    updateProfileStatus();
  }

  function updateProfileStatus() {
    const n = profileFilledCount();
    const el = $('#profile-status');
    if (!el) return;
    el.textContent = n ? '自社情報: ' + n + ' / ' + PROFILE_QUESTIONS.length + ' 項目を登録済み' : '自社情報は未登録です（競合分析でより精度が上がります）';
  }

  function selectMode(mode) {
    state.mode = mode;
    $('#menu-view').hidden = true;
    $('#setup-view').hidden = false;
    $('#run-view').hidden = true;
    const isComp = mode === 'competitor';
    $('#competitor-fields').hidden = !isComp;
    if (isComp) {
      $('#setup-title').textContent = '自社と競合の分析';
      const n = profileFilledCount();
      $('#competitor-hint').textContent = n
        ? '登録済みの自社情報（' + n + '項目）を基に競合と比較します。下のテーマ欄には分析の狙いを書いてください。'
        : '自社情報が未登録です。メニューに戻って登録するか、下のテーマ欄に自社の情報を詳しく書いてください。';
      $('#topic-input').placeholder = '例: 渋谷エリアで競合エステサロンと比較し、差別化ポイントと集客改善策を知りたい';
    } else {
      $('#setup-title').textContent = '分析したい内容を入力してください';
      $('#topic-input').placeholder = '分析したい市場・商品・サービス・課題などを自由に記入してください…';
    }
    window.scrollTo({ top: 0 });
  }

  function renderProfileForm() {
    const p = loadProfile();
    $('#profile-fields').innerHTML = PROFILE_QUESTIONS.map(function (q) {
      return '<div class="field"><label>' + escapeText(q.q) + '</label>' +
        '<input type="text" data-profile="' + q.key + '" placeholder="' + escapeText(q.ph) + '" value="' +
        escapeText(p[q.key] || '').replace(/"/g, '&quot;') + '"></div>';
    }).join('');
  }

  function saveProfile() {
    const p = {};
    document.querySelectorAll('[data-profile]').forEach(function (input) {
      const v = input.value.trim();
      if (v) p[input.dataset.profile] = v;
    });
    state.settings.profile = p;
    saveSettings();
    updateProfileStatus();
    closeModal('profile-modal');
  }

  function setupMenuEvents() {
    document.querySelectorAll('.menu-card').forEach(function (card) {
      card.addEventListener('click', function () { selectMode(card.dataset.mode); });
    });
    $('#btn-back-menu').addEventListener('click', showMenu);
    $('#btn-open-profile').addEventListener('click', function () {
      renderProfileForm();
      Icons.hydrate($('#profile-modal'));
      openModal('profile-modal');
    });
    $('#btn-save-profile').addEventListener('click', saveProfile);
    updateProfileStatus();
  }

  /* ============ PWA: Service Worker登録 ============ */
  function registerServiceWorker() {
    if (!('serviceWorker' in navigator)) return;
    const h = location.hostname;
    if (location.protocol !== 'https:' && h !== 'localhost' && h !== '127.0.0.1') return;
    navigator.serviceWorker.register('sw.js').catch(function (e) {
      console.warn('Service Workerの登録に失敗しました:', e);
    });
  }

  /* ============ イベント登録 ============ */
  document.addEventListener('DOMContentLoaded', function () {
    Icons.hydrate();
    applyTheme(currentTheme());
    $('#btn-theme').addEventListener('click', toggleTheme);
    renderSettings();
    updateProviderBadge();
    setupSourceEvents();
    setupAccountEvents();
    setupMenuEvents();
    registerServiceWorker();

    // 自律リサーチのオン/オフ
    $('#research-input').checked = state.settings.autoResearch !== false;
    $('#research-input').addEventListener('change', function () {
      state.settings.autoResearch = $('#research-input').checked;
      saveSettings();
    });

    // エラーカードの「再実行」（カードクリックより先に捕捉）
    function handleRetryClick(e) {
      const btn = e.target.closest('.retry-btn');
      if (!btn) return;
      e.stopPropagation();
      e.preventDefault();
      retryAgent(btn.dataset.retry);
    }
    $('#agent-grid').addEventListener('click', handleRetryClick, true);
    $('#synth-slot').addEventListener('click', handleRetryClick, true);
    $('#btn-regen').addEventListener('click', regenerateReport);

    // 分析履歴
    $('#btn-history').addEventListener('click', function () {
      renderHistory();
      openModal('history-modal');
    });
    $('#history-list').addEventListener('click', function (e) {
      const del = e.target.closest('[data-history-del]');
      if (del) {
        e.stopPropagation();
        RunHistory.remove(del.dataset.historyDel);
        renderHistory();
        return;
      }
      const item = e.target.closest('[data-history-id]');
      if (item) loadHistoryEntry(item.dataset.historyId);
    });
    $('#btn-history-clear').addEventListener('click', function () {
      if (confirm('保存されている分析履歴をすべて削除します。よろしいですか？')) {
        RunHistory.clear();
        renderHistory();
      }
    });

    $('#btn-start').addEventListener('click', startAnalysis);
    $('#btn-stop').addEventListener('click', stopAnalysis);
    $('#btn-new').addEventListener('click', resetToSetup);

    $('#btn-settings').addEventListener('click', function () {
      renderSettings();
      openModal('settings-modal');
    });
    $('#btn-save-settings').addEventListener('click', function () {
      commitSettings();
      closeModal('settings-modal');
    });
    $('#concurrency-input').addEventListener('input', function (e) {
      $('#concurrency-value').textContent = e.target.value;
    });

    document.querySelectorAll('.modal-close').forEach(function (btn) {
      btn.addEventListener('click', function () { closeModal(btn.dataset.close); });
    });
    document.querySelectorAll('.modal-backdrop').forEach(function (backdrop) {
      backdrop.addEventListener('click', function (e) {
        if (e.target === backdrop) backdrop.hidden = true;
      });
    });

    $('#btn-dl-md').addEventListener('click', function () {
      downloadBlob(state.finalReport, 'text/markdown;charset=utf-8', 'market-report_' + fileStamp() + '.md');
    });
    $('#btn-dl-html').addEventListener('click', function () {
      downloadBlob(standaloneHTML(), 'text/html;charset=utf-8', 'market-report_' + fileStamp() + '.html');
    });
    $('#btn-dl-txt').addEventListener('click', function () {
      downloadBlob(MD.toText(state.finalReport), 'text/plain;charset=utf-8', 'market-report_' + fileStamp() + '.txt');
    });
    $('#btn-dl-pdf').addEventListener('click', downloadPDF);
  });
})();
