/* 参考資料（ソース）管理 — URL / テキスト / CSV / Excel / PDF などの取り込みと解析 */
(function () {
  'use strict';

  const MAX_CHARS_PER_SOURCE = 60000; // 取り込み時の1ソースあたり保持上限

  /** @type {Array<{id,type:'url'|'file',name,detail,status:'loading'|'ready'|'error',content,error}>} */
  const sources = [];
  let nextId = 1;
  let onChange = function () {};

  /* ============ 遅延ライブラリロード（大きいので必要時のみ） ============ */
  const libPromises = {};
  function loadScript(src) {
    if (!libPromises[src]) {
      libPromises[src] = new Promise(function (resolve, reject) {
        const s = document.createElement('script');
        s.src = src;
        s.onload = resolve;
        s.onerror = function () { delete libPromises[src]; reject(new Error(src + ' の読み込みに失敗しました')); };
        document.head.appendChild(s);
      });
    }
    return libPromises[src];
  }
  async function ensureXLSX() {
    if (!window.XLSX) await loadScript('vendor/xlsx.full.min.js');
    return window.XLSX;
  }
  async function ensurePDF() {
    if (!window.pdfjsLib) {
      await loadScript('vendor/pdf.min.js');
      window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'vendor/pdf.worker.min.js';
    }
    return window.pdfjsLib;
  }

  /* ============ URL取り込み ============ */
  function stripHtml(html) {
    try {
      const doc = new DOMParser().parseFromString(html, 'text/html');
      doc.querySelectorAll('script,style,noscript,svg,iframe,nav,footer,header').forEach(function (el) { el.remove(); });
      const title = doc.title ? 'タイトル: ' + doc.title + '\n\n' : '';
      return title + (doc.body ? doc.body.innerText : html).replace(/\n{3,}/g, '\n\n').trim();
    } catch (e) {
      return html;
    }
  }

  async function fetchUrlContent(url) {
    // 1) 直接取得（CORS許可サイト・同一オリジン）
    try {
      const r = await fetch(url);
      if (r.ok) {
        const text = await r.text();
        const ct = r.headers.get('content-type') || '';
        return ct.includes('html') || /<html[\s>]/i.test(text.slice(0, 2000)) ? stripHtml(text) : text;
      }
    } catch (e) { /* CORSブロック等 → プロキシへ */ }

    // 2) Jina Reader（ページをMarkdown化して返すCORS対応リーダー）
    try {
      const r = await fetch('https://r.jina.ai/' + url);
      if (r.ok) return await r.text();
    } catch (e) { /* 次へ */ }

    // 3) allorigins プロキシ経由
    const r = await fetch('https://api.allorigins.win/raw?url=' + encodeURIComponent(url));
    if (!r.ok) throw new Error('URLを取得できませんでした (' + r.status + ')');
    return stripHtml(await r.text());
  }

  /* ============ ファイル取り込み ============ */
  function readAsText(file) {
    return new Promise(function (resolve, reject) {
      const fr = new FileReader();
      fr.onload = function () { resolve(String(fr.result || '')); };
      fr.onerror = function () { reject(new Error('ファイルの読み込みに失敗しました')); };
      fr.readAsText(file);
    });
  }
  function readAsArrayBuffer(file) {
    return new Promise(function (resolve, reject) {
      const fr = new FileReader();
      fr.onload = function () { resolve(fr.result); };
      fr.onerror = function () { reject(new Error('ファイルの読み込みに失敗しました')); };
      fr.readAsArrayBuffer(file);
    });
  }

  async function parseExcel(file) {
    const XLSX = await ensureXLSX();
    const buf = await readAsArrayBuffer(file);
    const wb = XLSX.read(buf, { type: 'array' });
    const parts = [];
    wb.SheetNames.forEach(function (name) {
      const csv = XLSX.utils.sheet_to_csv(wb.Sheets[name]).trim();
      if (csv) parts.push('【シート: ' + name + '】\n' + csv);
    });
    if (!parts.length) throw new Error('シートからデータを抽出できませんでした');
    return parts.join('\n\n');
  }

  async function parsePDF(file) {
    const pdfjsLib = await ensurePDF();
    const buf = await readAsArrayBuffer(file);
    const pdf = await pdfjsLib.getDocument({ data: buf }).promise;
    const parts = [];
    for (let p = 1; p <= pdf.numPages; p++) {
      const page = await pdf.getPage(p);
      const tc = await page.getTextContent();
      const text = tc.items.map(function (it) { return it.str; }).join(' ').replace(/\s{3,}/g, '  ').trim();
      if (text) parts.push('【' + p + 'ページ】\n' + text);
      if (parts.join('').length > MAX_CHARS_PER_SOURCE) break; // 巨大PDF対策
    }
    if (!parts.length) throw new Error('テキストを抽出できませんでした（画像のみのPDFの可能性があります）');
    return parts.join('\n\n');
  }

  async function parseFile(file) {
    const name = file.name.toLowerCase();
    if (/\.(xlsx|xlsm|xls|ods)$/.test(name)) return parseExcel(file);
    if (/\.pdf$/.test(name)) return parsePDF(file);
    if (/\.(txt|md|markdown|csv|tsv|json|log|html|htm|xml|yaml|yml)$/.test(name) || (file.type && file.type.startsWith('text/'))) {
      const text = await readAsText(file);
      return /\.(html|htm)$/.test(name) ? stripHtml(text) : text;
    }
    throw new Error('未対応のファイル形式です（対応: テキスト/Markdown/CSV/JSON/HTML/Excel/PDF）');
  }

  /* ============ ソース追加・削除 ============ */
  function finalize(src, content) {
    let text = (content || '').trim();
    if (!text) {
      src.status = 'error';
      src.error = '内容が空でした';
    } else {
      if (text.length > MAX_CHARS_PER_SOURCE) text = text.slice(0, MAX_CHARS_PER_SOURCE) + '\n…（長いため省略）';
      src.content = text;
      src.status = 'ready';
      src.detail = text.length.toLocaleString('ja-JP') + '文字を取り込み済み';
    }
    onChange();
  }

  function addUrl(url) {
    url = (url || '').trim();
    if (!/^https?:\/\//i.test(url)) throw new Error('http(s):// で始まるURLを入力してください');
    const src = { id: nextId++, type: 'url', name: url, detail: '取得中…', status: 'loading', content: '', error: '' };
    sources.push(src);
    onChange();
    fetchUrlContent(url)
      .then(function (text) { finalize(src, text); })
      .catch(function (e) {
        src.status = 'error';
        src.error = (e && e.message) || 'URLを取得できませんでした';
        onChange();
      });
    return src;
  }

  function addFiles(fileList) {
    Array.prototype.forEach.call(fileList, function (file) {
      const src = {
        id: nextId++, type: 'file', name: file.name,
        detail: '解析中…（' + Math.max(1, Math.round(file.size / 1024)) + ' KB）',
        status: 'loading', content: '', error: '',
      };
      sources.push(src);
      onChange();
      parseFile(file)
        .then(function (text) { finalize(src, text); })
        .catch(function (e) {
          src.status = 'error';
          src.error = (e && e.message) || '解析に失敗しました';
          onChange();
        });
    });
  }

  function remove(id) {
    const i = sources.findIndex(function (s) { return s.id === id; });
    if (i !== -1) { sources.splice(i, 1); onChange(); }
  }

  function readyCount() {
    return sources.filter(function (s) { return s.status === 'ready'; }).length;
  }
  function loadingCount() {
    return sources.filter(function (s) { return s.status === 'loading'; }).length;
  }

  /* ============ ダイジェスト生成（プロンプト用に文字数を配分） ============ */
  function buildDigest(totalChars) {
    const ready = sources.filter(function (s) { return s.status === 'ready' && s.content; });
    if (!ready.length) return '';
    const perSource = Math.max(1500, Math.floor(totalChars / ready.length));
    return ready.map(function (s, i) {
      let c = s.content;
      if (c.length > perSource) c = c.slice(0, perSource) + '\n…（文字数制限のため以降省略）';
      const kind = s.type === 'url' ? 'URL' : 'ファイル';
      return '=== 資料' + (i + 1) + '（' + kind + ': ' + s.name + '）===\n' + c;
    }).join('\n\n');
  }

  function listNames() {
    return sources
      .filter(function (s) { return s.status === 'ready'; })
      .map(function (s) { return s.name; });
  }

  window.Sources = {
    all: sources,
    addUrl: addUrl,
    addFiles: addFiles,
    remove: remove,
    readyCount: readyCount,
    loadingCount: loadingCount,
    buildDigest: buildDigest,
    listNames: listNames,
    setOnChange: function (fn) { onChange = fn || function () {}; },
  };
})();
