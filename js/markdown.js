/* 依存なしの軽量 Markdown → HTML コンバータ */
(function () {
  'use strict';

  function escapeHtml(s) {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  // インライン要素（太字・斜体・コード・リンク・打消し）
  function inline(s) {
    let out = escapeHtml(s);
    out = out.replace(/`([^`]+)`/g, function (_, c) { return '<code>' + c + '</code>'; });
    out = out.replace(/\*\*\*([^*]+)\*\*\*/g, '<strong><em>$1</em></strong>');
    out = out.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    out = out.replace(/(^|[^*])\*([^*\s][^*]*)\*/g, '$1<em>$2</em>');
    out = out.replace(/~~([^~]+)~~/g, '<del>$1</del>');
    out = out.replace(/\[([^\]]+)\]\((https?:[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
    return out;
  }

  function isTableRow(line) {
    return /^\s*\|.*\|\s*$/.test(line);
  }
  function isTableSep(line) {
    return /^\s*\|?\s*:?-{2,}.*\|.*$/.test(line) && /^[\s|:\-]+$/.test(line);
  }
  function splitRow(line) {
    return line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map(function (c) { return c.trim(); });
  }

  function mdToHtml(md) {
    if (!md) return '';
    const lines = md.replace(/\r\n/g, '\n').split('\n');
    const html = [];
    let i = 0;
    let listStack = []; // {type:'ul'|'ol'}
    let para = [];

    function closeLists() {
      while (listStack.length) { html.push('</' + listStack.pop().type + '>'); }
    }
    function flushPara() {
      if (para.length) {
        html.push('<p>' + para.map(inline).join('<br>') + '</p>');
        para = [];
      }
    }
    function flushAll() { flushPara(); closeLists(); }

    while (i < lines.length) {
      const line = lines[i];

      // コードブロック
      if (/^\s*```/.test(line)) {
        flushAll();
        const buf = [];
        i++;
        while (i < lines.length && !/^\s*```/.test(lines[i])) { buf.push(lines[i]); i++; }
        i++; // 終了フェンスを消費
        html.push('<pre><code>' + escapeHtml(buf.join('\n')) + '</code></pre>');
        continue;
      }

      // テーブル
      if (isTableRow(line) && i + 1 < lines.length && isTableSep(lines[i + 1])) {
        flushAll();
        const headers = splitRow(line);
        i += 2;
        const rows = [];
        while (i < lines.length && isTableRow(lines[i])) { rows.push(splitRow(lines[i])); i++; }
        let t = '<table><thead><tr>';
        headers.forEach(function (h) { t += '<th>' + inline(h) + '</th>'; });
        t += '</tr></thead><tbody>';
        rows.forEach(function (r) {
          t += '<tr>';
          for (let c = 0; c < headers.length; c++) { t += '<td>' + inline(r[c] || '') + '</td>'; }
          t += '</tr>';
        });
        t += '</tbody></table>';
        html.push(t);
        continue;
      }

      // 見出し
      const h = line.match(/^(#{1,6})\s+(.*)$/);
      if (h) {
        flushAll();
        const lvl = h[1].length;
        html.push('<h' + lvl + '>' + inline(h[2].replace(/\s*#+\s*$/, '')) + '</h' + lvl + '>');
        i++;
        continue;
      }

      // 水平線
      if (/^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(line)) {
        flushAll();
        html.push('<hr>');
        i++;
        continue;
      }

      // 引用
      if (/^\s*>\s?/.test(line)) {
        flushAll();
        const buf = [];
        while (i < lines.length && /^\s*>\s?/.test(lines[i])) {
          buf.push(lines[i].replace(/^\s*>\s?/, ''));
          i++;
        }
        html.push('<blockquote>' + mdToHtml(buf.join('\n')) + '</blockquote>');
        continue;
      }

      // リスト（2スペース単位のネスト対応）
      const li = line.match(/^(\s*)([-*+]|\d+[.)])\s+(.*)$/);
      if (li) {
        flushPara();
        const depth = Math.floor(li[1].replace(/\t/g, '  ').length / 2) + 1;
        const type = /^[-*+]$/.test(li[2]) ? 'ul' : 'ol';
        while (listStack.length > depth) { html.push('</' + listStack.pop().type + '>'); }
        while (listStack.length < depth) { listStack.push({ type: type }); html.push('<' + type + '>'); }
        if (listStack.length && listStack[listStack.length - 1].type !== type && listStack.length === depth) {
          html.push('</' + listStack.pop().type + '>');
          listStack.push({ type: type });
          html.push('<' + type + '>');
        }
        html.push('<li>' + inline(li[3]) + '</li>');
        i++;
        continue;
      }

      // 空行
      if (/^\s*$/.test(line)) {
        flushAll();
        i++;
        continue;
      }

      // 通常の段落
      closeLists();
      para.push(line);
      i++;
    }
    flushAll();
    return html.join('\n');
  }

  // プレーンテキスト化（.txt ダウンロード用）
  function mdToText(md) {
    return (md || '')
      .replace(/```[\s\S]*?```/g, function (m) { return m.replace(/```\w*\n?/g, ''); })
      .replace(/^#{1,6}\s+/gm, '')
      .replace(/\*\*([^*]+)\*\*/g, '$1')
      .replace(/\*([^*]+)\*/g, '$1')
      .replace(/`([^`]+)`/g, '$1')
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
      .replace(/^\s*>\s?/gm, '')
      .replace(/^\s*(-{3,}|\*{3,})\s*$/gm, '----------------------------------------');
  }

  window.MD = { toHtml: mdToHtml, toText: mdToText };
})();
