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
    const queries = buildQueries(topic, queryCount);
    const results = [];
    let failed = 0;
    // 外部サービスへの負荷と失敗率を抑えるため2並列
    let idx = 0;
    async function lane() {
      while (idx < queries.length) {
        if (signal && signal.aborted) return;
        const q = queries[idx++];
        try {
          const r = await researchQuery(q, signal);
          if (r) results.push({ query: q, via: r.via, content: r.content });
          else failed++;
        } catch (e) {
          if (e.name === 'AbortError') return;
          failed++;
        }
        if (onProgress) onProgress(results.length + failed, queries.length);
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
