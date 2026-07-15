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

  /* 主要キーワードをテーマ／自社情報から抽出（業種語の推定に使う） */
  function coreKeyword(topic, opts) {
    if (opts && opts.company) return opts.company;
    const t = String(topic || '').replace(/\s+/g, ' ');
    return t.slice(0, 30);
  }

  /* テーマ・エリア・モードから検索エンジン用クエリを組み立てる。
     実店舗・Instagramアカウント・競合・口コミの実地調査を重視する。 */
  function buildQueries(topic, count, opts) {
    opts = opts || {};
    const t = topic.replace(/\s+/g, ' ').slice(0, 60);
    const area = (opts.area || '').trim();
    const areaPrefix = area ? area + ' ' : '';

    // 実店舗・エリア調査（検索エンジンで実在の店舗を探す）
    const local = [
      areaPrefix + t + ' 店舗 一覧 おすすめ',
      areaPrefix + t + ' 人気 ランキング 口コミ',
    ];
    // Instagram アカウント/ハッシュタグ調査（公開Web経由で実在アカウントを探す）
    const insta = [
      t + ' ' + areaPrefix + 'Instagram 人気アカウント',
      'instagram.com ' + areaPrefix + t + ' 公式',
      t + ' インスタ 人気 ハッシュタグ 投稿 傾向',
    ];
    // 競合・口コミの深掘り
    const comp = [];
    if (opts.competitors) {
      String(opts.competitors).split(/[\n,、･・]+/).map(function (s) { return s.trim(); })
        .filter(Boolean).slice(0, 4).forEach(function (c) {
          comp.push(c + ' 口コミ 評判 料金 サービス');
        });
    }
    const base = [
      t + ' 市場規模 統計 最新',
      areaPrefix + t + ' 競合 比較',
      t + ' 口コミ レビュー 評判',
      t + ' 料金 相場 価格',
      t + ' 業界 動向 ニュース 最新',
      t + ' 消費者 調査 トレンド',
    ];

    // モード別に優先順位を決めて件数分だけ返す
    let ordered;
    if (opts.mode === 'competitor') {
      ordered = comp.concat(local, insta.slice(0, 2), base);
    } else {
      ordered = base.slice(0, 3).concat(local.slice(0, 1), insta.slice(0, 2), base.slice(3));
    }
    // 重複除去
    const seen = {};
    ordered = ordered.filter(function (q) { if (seen[q]) return false; seen[q] = 1; return true; });
    // 件数を確保（不足時はlocal/instaで補う）
    if (ordered.length < count) ordered = ordered.concat(local, insta);
    return ordered.slice(0, Math.max(3, count));
  }

  /* 収集テキストから店舗・競合の候補名をヒューリスティックに抽出（AIが使えない場合のフォールバック） */
  function extractCandidateNames(text, max, exclude) {
    const names = {};
    const ex = String(exclude || '');
    const patterns = [
      /([一-龠ぁ-んァ-ヴA-Za-z0-9＆&'’\-]{2,20}(?:サロン|エステ|エステティック|クリニック|スタジオ|ジム|株式会社|有限会社))/g,
      /(?:^|\n)\s*[0-9０-９]+[\.\)．]\s*([一-龠ぁ-んァ-ヴA-Za-z0-9＆&'’\- ]{2,24})/g,
    ];
    patterns.forEach(function (re) {
      let m;
      while ((m = re.exec(text)) && Object.keys(names).length < max * 4) {
        const n = (m[1] || '').trim().replace(/\s+/g, ' ');
        if (n.length < 3 || n.length > 24) continue;
        if (/^(市場|競合|口コミ|ランキング|一覧|人気|おすすめ|エリア|比較|評判|料金|サービス|詳細|情報)/.test(n)) continue;
        if (ex && ex.indexOf(n) !== -1) continue; // テーマ文に含まれる語（一般語）は除外
        names[n] = (names[n] || 0) + 1;
      }
    });
    return Object.keys(names).sort(function (a, b) { return names[b] - names[a]; }).slice(0, max);
  }

  /**
   * 発見した競合・店舗を1件ずつ個別に深掘り調査する。
   * 各名称について「口コミ・評判・料金・サービス・公式」をまとめて検索する。
   * @returns {Promise<{digest, count, images, names}>}
   */
  async function deepDive(names, area, totalCap, signal, onProgress) {
    const list = (names || []).filter(Boolean).slice(0, 20);
    if (!list.length) return { digest: '', count: 0, images: [], names: [] };
    const areaPrefix = area ? area + ' ' : '';
    const results = [];
    let idx = 0, done = 0;
    async function lane() {
      while (idx < list.length) {
        if (signal && signal.aborted) return;
        const name = list[idx++];
        try {
          const r = await researchQuery(areaPrefix + name + ' 口コミ 評判 料金 サービス 特徴 公式', signal);
          if (r) results.push({ name: name, content: r.content });
        } catch (e) { if (e.name === 'AbortError') return; }
        done++;
        if (onProgress) onProgress(done, list.length);
      }
    }
    // 件数が多い場合は並列数を増やして時間を短縮（最大4並列）
    const lanes = Math.min(4, Math.max(2, Math.ceil(list.length / 5)));
    await Promise.all(Array.from({ length: lanes }, function () { return lane(); }));
    if (!results.length) return { digest: '', count: 0, images: [], names: [] };

    // 画像抽出
    const imgSet = {};
    const imgRe = /(https:\/\/[^\s)"']+\.(?:jpg|jpeg|png|webp))(?:\?[^\s)"']*)?/gi;
    results.forEach(function (r) { let m; while ((m = imgRe.exec(r.content)) && Object.keys(imgSet).length < 16) imgSet[m[1]] = 1; });
    const images = Object.keys(imgSet).filter(function (u) { return !/(sprite|icon|logo|avatar|pixel|favicon|\.svg)/i.test(u); }).slice(0, 10);

    const perCap = Math.max(1500, Math.floor(totalCap / results.length));
    const digest = '【競合・店舗の個別深掘り調査（各社ごと）】\n' + results.map(function (r, i) {
      let c = r.content;
      if (c.length > perCap) c = c.slice(0, perCap) + '\n…（省略）';
      return '=== 競合' + (i + 1) + '：' + r.name + ' ===\n' + c;
    }).join('\n\n');
    return { digest: digest, count: results.length, images: images, names: results.map(function (r) { return r.name; }) };
  }

  /**
   * 自律リサーチを実行
   * @returns {Promise<{digest:string, results:Array<{query,via}>, failed:number}>}
   */
  async function run(topic, queryCount, totalCap, signal, onProgress, opts) {
    const tasks = buildQueries(topic, queryCount, opts).map(function (q) {
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

    // 収集テキストから実在の画像URLを抽出（資料に引用できる本物のみ）
    const imgSet = {};
    const imgRe = /(https:\/\/[^\s)"']+\.(?:jpg|jpeg|png|webp|gif))(?:\?[^\s)"']*)?/gi;
    const mdImgRe = /!\[[^\]]*\]\((https:\/\/[^)\s]+)\)/gi;
    results.forEach(function (r) {
      let m;
      while ((m = mdImgRe.exec(r.content)) && Object.keys(imgSet).length < 20) imgSet[m[1]] = 1;
      while ((m = imgRe.exec(r.content)) && Object.keys(imgSet).length < 20) imgSet[m[1]] = 1;
    });
    const images = Object.keys(imgSet).filter(function (u) {
      return !/(sprite|icon|logo|avatar|1x1|pixel|blank|spacer|favicon|\.svg)/i.test(u);
    }).slice(0, 12);

    if (!results.length) return { digest: '', results: [], failed: failed, images: [] };
    const perCap = Math.max(2000, Math.floor(totalCap / results.length));
    const digest = results.map(function (r, i) {
      let c = r.content;
      if (c.length > perCap) c = c.slice(0, perCap) + '\n…（省略）';
      return '=== 自動調査' + (i + 1) + '（' + r.via + '｜検索語: ' + r.query + '）===\n' + c;
    }).join('\n\n');
    return { digest: digest, results: results, failed: failed, images: images };
  }

  window.Research = { run: run, deepDive: deepDive, extractCandidateNames: extractCandidateNames };
})();
