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
      synthTokens: 3000,
      reportCap: 3000,
      sourceChars: 12000,
      instruction: '要点のみを簡潔にまとめてください。箇条書き中心で、全体で400字程度。最重要ポイント3つと結論を必ず含めてください。',
      synthInstruction: 'コンパクトで読みやすい資料（A4で2〜3ページ相当）にまとめてください。',
    },
    2: {
      name: 'Lv.2 スタンダード',
      agents: 16,
      agentTokens: 2048,
      synthTokens: 6000,
      reportCap: 5000,
      sourceChars: 24000,
      instruction: '担当分野についてバランス良く分析してください。見出しと箇条書きを使い、全体で800〜1200字程度。根拠・示唆・推奨アクションを含めてください。',
      synthInstruction: '標準的なビジネスレポート（A4で5〜8ページ相当）としてまとめてください。表も適宜使ってください。',
    },
    3: {
      name: 'Lv.3 ディープ',
      agents: 28,
      agentTokens: 4096,
      synthTokens: 8192,
      reportCap: 8000,
      sourceChars: 48000,
      instruction: '担当分野について、極めて詳細かつ徹底的に分析してください。定量的な推定値（推定と明記）、複数の視点、具体例、反論の検討、詳細な推奨アクションを含め、見出し・表・箇条書きを駆使して2000字以上の深い報告をしてください。',
      synthInstruction: '非常に詳細で網羅的な本格レポートとしてまとめてください。各章を深く掘り下げ、表・比較・数値目安・ロードマップを盛り込み、そのまま経営会議に出せる完成度にしてください。',
    },
  };

  /* ============ 状態 ============ */
  const state = {
    settings: loadSettings(),
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
  };

  /* ソース資料をプロンプトに埋め込むブロックを生成 */
  function sourceBlock(maxChars) {
    if (!state.sourceDigest) return '';
    let digest = state.sourceDigest;
    if (maxChars && digest.length > maxChars) digest = digest.slice(0, maxChars) + '\n…（以降省略）';
    return '\n\n【ユーザー提供の参考資料】\n' +
      '以下の資料を最優先の根拠として分析してください。資料に基づく記述には出典（資料番号・資料名）を明示し、' +
      '資料にない事項を学習知識で補う場合はその旨を区別して書いてください。\n\n' + digest;
  }

  function loadSettings() {
    const defaults = { provider: 'demo', concurrency: 4, keys: {}, models: {} };
    try {
      const raw = localStorage.getItem(SETTINGS_KEY);
      if (raw) {
        const s = JSON.parse(raw);
        return Object.assign(defaults, s, {
          keys: Object.assign({}, s.keys),
          models: Object.assign({}, s.models),
        });
      }
    } catch (e) { /* 破損時はデフォルト */ }
    return defaults;
  }
  function saveSettings() {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(state.settings));
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
        '<div class="p-body"><span>' + p.icon + '</span><span>' + p.label + '</span></div>';
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
          (state.settings.models[key] || p.defaultModel).replace(/"/g, '&quot;') + '"></div>';
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

    $('#concurrency-input').value = state.settings.concurrency;
    $('#concurrency-value').textContent = state.settings.concurrency;
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
    saveSettings();
    updateProviderBadge();
  }

  function updateProviderBadge() {
    const p = AI.PROVIDERS[state.settings.provider];
    $('#provider-badge').textContent = p.icon + ' ' + p.label;
  }

  /* ============ モーダル ============ */
  function openModal(id) { $('#' + id).hidden = false; }
  function closeModal(id) { $('#' + id).hidden = true; }

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
        '- name はカタカナ3〜4文字の親しみやすい名前（重複禁止）\n' +
        '- role は「〜アナリスト」「〜リサーチャー」などの肩書き（12文字以内）\n' +
        '- emoji は役割を表す絵文字1つ\n' +
        '- focus はそのエージェントが分析する観点の説明（50字以内）\n\n' +
        '出力形式（この形式のJSON配列のみを出力）:\n' +
        '[{"name":"ハルト","role":"市場規模アナリスト","emoji":"📊","focus":"市場規模と成長率を推定する"}]';
      const text = await AI.call({
        provider: state.settings.provider,
        apiKey: currentKey(),
        model: currentModel(),
        system: system,
        prompt: prompt,
        maxTokens: 4000,
        signal: signal,
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
            emoji: (a.emoji && String(a.emoji).slice(0, 4)) || '🤖',
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
      if (e.name === 'AbortError') throw e;
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
      '報告は日本語のMarkdown形式（見出し・箇条書き・必要に応じて表）で書いてください。' +
      (state.sourceDigest
        ? 'ユーザー提供の参考資料が最重要の根拠です。資料の内容を精読し、担当領域に関係する事実・数値を積極的に引用してください。'
        : 'Web検索はできないため、学習知識に基づく分析であることを踏まえ、具体的な数値は「推定」と明記してください。');
    const prompt =
      '【分析テーマ】\n' + state.topic +
      sourceBlock(lv.sourceChars) + '\n\n' +
      '【指示】\nあなたの担当領域「' + agent.role + '」の観点からこのテーマを分析し、報告してください。\n' +
      lv.instruction + '\n\n最後に「**結論:**」として担当領域からの最重要メッセージを1〜2文で述べてください。';

    const maxAttempts = 2;
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
        });
        agent.report = text.trim();
        agent.status = 'done';
        updateAgentCard(agent);
        return;
      } catch (e) {
        if (e.name === 'AbortError' || signal.aborted) {
          agent.status = 'waiting';
          updateAgentCard(agent);
          throw e;
        }
        if (attempt < maxAttempts) {
          await sleep(2000 + Math.random() * 2000, signal);
        } else {
          agent.status = 'error';
          agent.error = e.message || String(e);
          updateAgentCard(agent);
        }
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
    setPhase('✒️ ' + state.synth.name + ' が資料を作成中…', 92);

    const reports = done.map(function (a) {
      let r = a.report;
      if (r.length > lv.reportCap) r = r.slice(0, lv.reportCap) + '\n…（以下省略）';
      return '━━━━━━━━━━━━━━\n■ 報告者: ' + a.name + '（' + a.role + '）\n━━━━━━━━━━━━━━\n' + r;
    }).join('\n\n');

    const system =
      'あなたは「' + state.synth.name + '」という名前の資料作成ディレクターAIです。' +
      '複数の専門エージェントの分析報告を統合し、1つの完成された市場分析資料（日本語・Markdown形式）を作成します。' +
      '見出し構造を整え、重複を排除し、矛盾があれば両論併記し、読み手がそのまま意思決定に使える品質に仕上げてください。';
    const prompt =
      '【分析テーマ】\n' + state.topic + '\n\n' +
      '【分析レベル】' + lv.name + '\n' +
      '【指示】\n以下の' + done.length + '体のエージェントの報告をすべて統合し、市場分析資料を作成してください。\n' +
      lv.synthInstruction + '\n\n' +
      '資料の構成:\n' +
      '1. タイトル（# 見出し）と作成概要\n' +
      '2. エグゼクティブサマリー\n' +
      '3. 市場分析の本編（章立てして各報告の知見を統合）\n' +
      '4. 戦略提言・推奨アクション\n' +
      '5. リスクと留意点\n' +
      '6. 付録: 分析チーム一覧' +
      (state.sourceNames.length ? '・参考資料一覧' : '') + '\n\n' +
      (state.sourceNames.length
        ? '【ユーザー提供の参考資料一覧】\n' +
          state.sourceNames.map(function (n, i) { return (i + 1) + '. ' + n; }).join('\n') +
          '\n（各エージェントはこれらの資料を根拠に分析しています。資料に基づく記述の出典表記を維持してください）\n\n'
        : '') +
      '【エージェントからの報告】\n\n' + reports;

    const text = await AI.call({
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
    });

    state.finalReport = text.trim();
    state.synth.status = 'done';
    state.synth.report = state.finalReport;
    updateSynthCard();
  }

  /* ============ UI 描画 ============ */
  function statusHTML(agent) {
    switch (agent.status) {
      case 'waiting': return '<span class="agent-status status-waiting">待機中</span>';
      case 'running': return '<span class="agent-status status-running"><span class="spinner"></span>分析中…</span>';
      case 'done':    return '<span class="agent-status status-done">✓ 報告完了</span>';
      case 'error':   return '<span class="agent-status status-error">⚠ エラー</span>';
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
        '<div class="agent-avatar">' + Agents.avatarSVG(agent.name + agent.role, agent.emoji) + '</div>' +
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
      '<div class="agent-avatar">' + Agents.avatarSVG(s.name + s.role, s.emoji) + '</div>' +
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
      '<div class="agent-avatar">' + Agents.avatarSVG(agent.name + agent.role, agent.emoji) + '</div>' +
      '<div><div class="name">' + escapeText(agent.name) + '</div>' +
      '<div class="role">' + escapeText(agent.role) + '｜' + escapeText(agent.focus || '') + '</div></div>';
    let body;
    if (agent.status === 'done' && agent.report) {
      body = MD.toHtml(agent.report);
    } else if (agent.status === 'error') {
      body = '<p style="color:var(--red)">⚠ 分析中にエラーが発生しました。</p><p class="hint">' + escapeText(agent.error || '') + '</p>';
    } else if (agent.status === 'running') {
      body = '<p>🔎 現在分析中です。完了すると、ここに報告が表示されます。</p>';
    } else {
      body = '<p>⏳ 実行待ちです。</p>';
    }
    $('#agent-modal-report').innerHTML = body;
    openModal('agent-modal');
  }

  function setPhase(text, percent) {
    $('#run-phase').textContent = text;
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
      setPhase('🤖 ' + total + '体のエージェントが並列分析中…');
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
      warning.textContent = provider.label + ' のAPIキーが未設定です。右上の「⚙️ 設定」から登録するか、デモモードを選択してください。';
      warning.hidden = false;
      return;
    }
    if (Sources.loadingCount() > 0) {
      warning.textContent = '参考資料の取り込みが完了していません。完了するまで少しお待ちください（不要な資料は ✕ で削除できます）。';
      warning.hidden = false;
      return;
    }

    const levelInput = document.querySelector('input[name="level"]:checked');
    state.level = parseInt(levelInput ? levelInput.value : '2', 10);
    state.topic = topic;
    state.sourceDigest = Sources.buildDigest(LEVELS[state.level].sourceChars);
    state.sourceNames = Sources.listNames();
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
    $('#run-topic').textContent = '「' + topic + '」｜' + LEVELS[state.level].name + '｜' + provider.label +
      (state.sourceNames.length ? '｜参考資料 ' + state.sourceNames.length + '件' : '｜指示文のみ');
    $('#agent-grid').innerHTML = '';
    $('#synth-slot').innerHTML = '';
    $('#progress-text').textContent = '';
    setPhase('🧭 分析テーマに合わせてチームを編成中…', 4);

    const signal = state.abort.signal;
    try {
      // 1) チーム編成
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
      setPhase('✅ 分析完了（所要 ' + Math.floor(secs / 60) + '分' + (secs % 60) + '秒）', 100);
      showReport();
    } catch (e) {
      if (e.name === 'AbortError' || signal.aborted) {
        setPhase('⏹ 停止しました');
      } else {
        setPhase('⚠ エラーが発生しました');
        $('#progress-text').textContent = e.message || String(e);
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
    setPhase('⏹ 停止しました');
  }

  function resetToSetup() {
    if (state.abort) state.abort.abort();
    $('#run-view').hidden = true;
    $('#setup-view').hidden = false;
  }

  function showReport() {
    $('#report-content').innerHTML = MD.toHtml(state.finalReport);
    $('#report-section').hidden = false;
    $('#report-section').scrollIntoView({ behavior: 'smooth' });
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
    if (src.type === 'url') return '🔗';
    const n = src.name.toLowerCase();
    if (/\.pdf$/.test(n)) return '📕';
    if (/\.(xlsx|xlsm|xls|ods|csv|tsv)$/.test(n)) return '📊';
    return '📄';
  }

  function renderSourceList() {
    const list = $('#source-list');
    list.innerHTML = '';
    Sources.all.forEach(function (src) {
      const li = document.createElement('li');
      li.className = 'source-item ' + src.status;
      const detail = src.status === 'error' ? ('⚠ ' + (src.error || '取り込み失敗')) : src.detail;
      li.innerHTML =
        '<span class="s-icon">' + sourceIcon(src) + '</span>' +
        '<span class="s-name" title="' + escapeText(src.name) + '">' + escapeText(src.name) + '</span>' +
        (src.status === 'loading' ? '<span class="spinner"></span>' : '') +
        '<span class="s-detail">' + escapeText(detail) + '</span>' +
        '<button class="s-remove" title="削除" data-id="' + src.id + '">✕</button>';
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

  /* ============ イベント登録 ============ */
  document.addEventListener('DOMContentLoaded', function () {
    renderSettings();
    updateProviderBadge();
    setupSourceEvents();

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
