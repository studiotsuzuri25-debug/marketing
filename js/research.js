/* 自律Webリサーチ — エージェントの分析根拠となるWeb情報を自動収集する
   検索リーダー(s.jina.ai) → GoogleニュースRSS → Wikipedia の順にフォールバック */
(function () {
  'use strict';

  const PER_QUERY_CAP = 7000; // 1クエリあたりの取り込み文字数上限

  function stripTags(xmlOrHtml) {
    return String(xmlOrHtml)
      .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&lt;[^&]*&gt;/g, ' ')
      .replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
      .replace(/\s{3,}/g, '  ')
      .trim();
  }

  async function fetchWithTimeout(url, ms, signal, options) {
    const ctrl = new AbortController();
    const timer = setTimeout(function () { ctrl.abort(); }, ms);
    if (signal) {
      if (signal.aborted) { clearTimeout(timer); throw new DOMException('Aborted', 'AbortError'); }
      signal.addEventListener('abort', function () { ctrl.abort(); });
    }
    try {
      const opts = Object.assign({}, options || {}, { signal: ctrl.signal });
      return await fetch(url, opts);
    } finally {
      clearTimeout(timer);
    }
  }

  /* 1) 検索リーダー: 検索結果ページ本文をまとめて取得 */
  async function searchReader(query, signal) {
    const r = await fetchWithTimeout('https://s.jina.ai/' + encodeURIComponent(query), 25000, signal);
    if (!r.ok) throw new Error('search reader ' + r.status);
    const text = (await r.text()).trim();
    if (text.length < 200) throw new Error('search reader empty');
    return { via: 'Web検索', content: text.slice(0, PER_QUERY_CAP) };
  }

  /* 2) GoogleニュースRSS（プロキシ経由） */
  async function newsRss(query, signal) {
    const rss = 'https://news.google.com/rss/search?q=' + encodeURIComponent(query) + '&hl=ja&gl=JP&ceid=JP:ja';
    const r = await fetchWithTimeout('https://api.allorigins.win/raw?url=' + encodeURIComponent(rss), 20000, signal);
    if (!r.ok) throw new Error('news rss ' + r.status);
    const xml = await r.text();
    const items = [];
    const re = /<item>([\s\S]*?)<\/item>/g;
    let m;
    while ((m = re.exec(xml)) && items.length < 8) {
      const block = m[1];
      const title = stripTags((block.match(/<title>([\s\S]*?)<\/title>/) || [])[1] || '');
      const link = stripTags((block.match(/<link>([\s\S]*?)<\/link>/) || [])[1] || '');
      const date = stripTags((block.match(/<pubDate>([\s\S]*?)<\/pubDate>/) || [])[1] || '');
      const src = stripTags((block.match(/<source[^>]*>([\s\S]*?)<\/source>/) || [])[1] || '');
      if (title) items.push('- ' + title + (src ? '（' + src + '）' : '') + (date ? ' [' + date.slice(0, 16) + ']' : '') + (link ? '\n  URL: ' + link : ''));
    }
    if (!items.length) throw new Error('news rss empty');
    return { via: 'Googleニュース', content: '直近の関連ニュース見出し:\n' + items.join('\n') };
  }

  /* 3) Wikipedia検索＋要約（CORS対応の公式API） */
  async function wikipedia(query, signal) {
    const searchUrl = 'https://ja.wikipedia.org/w/api.php?action=query&list=search&srlimit=3&format=json&origin=*&srsearch=' + encodeURIComponent(query);
    const r = await fetchWithTimeout(searchUrl, 15000, signal);
    if (!r.ok) throw new Error('wikipedia ' + r.status);
    const d = await r.json();
    const hits = ((d.query || {}).search || []).slice(0, 2);
    if (!hits.length) throw new Error('wikipedia empty');
    const parts = [];
    for (let i = 0; i < hits.length; i++) {
      const title = hits[i].title;
      try {
        const sr = await fetchWithTimeout('https://ja.wikipedia.org/api/rest_v1/page/summary/' + encodeURIComponent(title), 15000, signal);
        if (sr.ok) {
          const sd = await sr.json();
          parts.push('【' + title + '】' + (sd.extract || stripTags(hits[i].snippet)) +
            '\n  URL: https://ja.wikipedia.org/wiki/' + encodeURIComponent(title));
        }
      } catch (e) { /* 個別失敗は無視 */ }
    }
    if (!parts.length) throw new Error('wikipedia summaries empty');
    return { via: 'Wikipedia', content: parts.join('\n\n') };
  }

  /* Google検索サジェスト: 実際に検索されている関連キーワード（検索需要の指標） */
  async function googleSuggest(topic, signal) {
    const t = topic.replace(/\s+/g, ' ').slice(0, 40);
    const seeds = [t, t + ' おすすめ', t + ' 口コミ', t + ' 比較', t + ' 人気'];
    const keywords = [];
    for (let i = 0; i < seeds.length; i++) {
      if (signal && signal.aborted) throw new DOMException('Aborted', 'AbortError');
      try {
        const u = 'https://www.google.com/complete/search?client=firefox&hl=ja&q=' + encodeURIComponent(seeds[i]);
        const r = await fetchWithTimeout('https://api.allorigins.win/raw?url=' + encodeURIComponent(u), 15000, signal);
        if (!r.ok) continue;
        const d = JSON.parse(await r.text());
        (d[1] || []).forEach(function (k) {
          if (keywords.indexOf(k) === -1) keywords.push(k);
        });
      } catch (e) {
        if (e.name === 'AbortError' && signal && signal.aborted) throw e;
      }
    }
    if (!keywords.length) throw new Error('suggest empty');
    return {
      via: 'Google検索サジェスト',
      content: 'Google検索のオートコンプリートで表示される関連キーワード（＝実際に検索されている語。検索需要の指標）:\n' +
        keywords.slice(0, 40).map(function (k) { return '- ' + k; }).join('\n') +
        '\n出典: Google検索サジェスト（https://www.google.com/complete/search）',
    };
  }

  /* Googleトレンド: 本日の急上昇検索ワード（日本・テーマ非限定の一般トレンド） */
  async function googleTrends(signal) {
    const rss = 'https://trends.google.co.jp/trends/trending/rss?geo=JP';
    const r = await fetchWithTimeout('https://api.allorigins.win/raw?url=' + encodeURIComponent(rss), 20000, signal);
    if (!r.ok) throw new Error('trends ' + r.status);
    const xml = await r.text();
    const items = [];
    const re = /<item>([\s\S]*?)<\/item>/g;
    let m;
    while ((m = re.exec(xml)) && items.length < 15) {
      const block = m[1];
      const title = stripTags((block.match(/<title>([\s\S]*?)<\/title>/) || [])[1] || '');
      const traffic = stripTags((block.match(/<ht:approx_traffic>([\s\S]*?)<\/ht:approx_traffic>/) || [])[1] || '');
      if (title) items.push('- ' + title + (traffic ? '（検索数 ' + traffic + '）' : ''));
    }
    if (!items.length) throw new Error('trends empty');
    return {
      via: 'Googleトレンド',
      content: '本日の日本の急上昇検索ワード（テーマ非限定の一般トレンド。市況・世間の関心の参考情報）:\n' +
        items.join('\n') + '\n出典: Googleトレンド（https://trends.google.co.jp/）',
    };
  }

  async function researchQuery(query, signal) {
    const methods = [searchReader, newsRss, wikipedia];
    for (let i = 0; i < methods.length; i++) {
      if (signal && signal.aborted) throw new DOMException('Aborted', 'AbortError');
      try {
        return await methods[i](query, signal);
      } catch (e) {
        if (e.name === 'AbortError' && signal && signal.aborted) throw e;
      }
    }
    return null;
  }

  /* テーマから調査クエリを組み立てる（AI不要のテンプレート方式で確実に）
     SNS・Instagram系の調査はどのレベルでも必ず含める */
  function buildQueries(topic, count) {
    const t = topic.replace(/\s+/g, ' ').slice(0, 60);
    const sns = [
      t + ' Instagram トレンド 人気 ハッシュタグ',
      t + ' インスタ映え 人気投稿 傾向 バズ',
      t + ' SNS 口コミ 評判 話題',
    ];
    const base = [
      t + ' 市場規模 統計 最新',
      t + ' 競合 シェア 比較',
      t + ' 業界 動向 ニュース',
      t + ' 消費者 調査 アンケート',
      t + ' 口コミ レビュー 評価',
      t + ' 価格 相場',
      t + ' 課題 リスク 規制',
    ];
    const snsCount = count >= 8 ? 3 : count >= 5 ? 2 : 1;
    return base.slice(0, Math.max(1, count - snsCount)).concat(sns.slice(0, snsCount));
  }

  /**
   * 自律リサーチを実行
   * @returns {Promise<{digest:string, results:Array<{query,via}>, failed:number}>}
   */
  async function run(topic, queryCount, totalCap, signal, onProgress) {
    const tasks = buildQueries(topic, queryCount).map(function (q) {
      return { label: q, fn: function () { return researchQuery(q, signal); } };
    });
    // キーワード調査は常時実行（Google検索需要とトレンド）
    tasks.push({ label: 'Google検索サジェスト', fn: function () { return googleSuggest(topic, signal); } });
    tasks.push({ label: 'Googleトレンド急上昇', fn: function () { return googleTrends(signal); } });

    const results = [];
    let failed = 0;
    // 外部サービスへの負荷と失敗率を抑えるため2並列
    let idx = 0;
    async function lane() {
      while (idx < tasks.length) {
        if (signal && signal.aborted) return;
        const task = tasks[idx++];
        try {
          const r = await task.fn();
          if (r) results.push({ query: task.label, via: r.via, content: r.content });
          else failed++;
        } catch (e) {
          if (e.name === 'AbortError') return;
          failed++;
        }
        if (onProgress) onProgress(results.length + failed, tasks.length);
      }
    }
    await Promise.all([lane(), lane()]);

    if (!results.length) return { digest: '', results: [], failed: failed };
    const perCap = Math.max(2000, Math.floor(totalCap / results.length));
    const digest = results.map(function (r, i) {
      let c = r.content;
      if (c.length > perCap) c = c.slice(0, perCap) + '\n…（省略）';
      return '=== 自動調査' + (i + 1) + '（' + r.via + '｜検索語: ' + r.query + '）===\n' + c;
    }).join('\n\n');
    return { digest: digest, results: results, failed: failed };
  }

  window.Research = { run: run };
})();
