/* レポート用チャート描画エンジン — 依存なしのSVG生成
   Markdown内の ```chart / ```kpi コードブロック(JSON)をグラフ・KPIカードに変換する */
(function () {
  'use strict';

  const PALETTE = ['#2563eb', '#0ea5e9', '#10b981', '#f59e0b', '#8b5cf6', '#ef4444', '#14b8a6', '#64748b'];
  const AXIS = '#8b95a5';
  const GRIDLINE = '#e3e8ef';
  const TEXT = '#3a4454';

  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function num(v) {
    const n = Number(v);
    return isFinite(n) ? n : 0;
  }
  function fmt(n) {
    if (Math.abs(n) >= 10000) return n.toLocaleString('ja-JP');
    if (Number.isInteger(n)) return n.toLocaleString('ja-JP');
    return n.toLocaleString('ja-JP', { maximumFractionDigits: 1 });
  }
  /* 軸の上限をキリの良い数字に丸める */
  function niceMax(v) {
    if (v <= 0) return 1;
    const p = Math.pow(10, Math.floor(Math.log10(v)));
    const d = v / p;
    const m = d <= 1 ? 1 : d <= 2 ? 2 : d <= 2.5 ? 2.5 : d <= 5 ? 5 : 10;
    return m * p;
  }

  function normalize(spec) {
    const labels = (spec.labels || []).slice(0, 12).map(function (l) { return String(l); });
    let series = (spec.series || []).slice(0, 6).map(function (s, i) {
      return {
        name: String(s.name || '系列' + (i + 1)),
        data: (s.data || []).slice(0, labels.length).map(num),
      };
    });
    if (!series.length && Array.isArray(spec.data)) {
      series = [{ name: spec.title || '', data: spec.data.slice(0, labels.length).map(num) }];
    }
    return { labels: labels, series: series };
  }

  function legendHTML(series) {
    if (series.length < 2) return '';
    return '<div class="chart-legend">' + series.map(function (s, i) {
      return '<span class="chart-legend-item"><span class="chart-swatch" style="background:' +
        PALETTE[i % PALETTE.length] + '"></span>' + esc(s.name) + '</span>';
    }).join('') + '</div>';
  }

  function figure(title, unit, inner, legend) {
    return '<figure class="chart-figure">' +
      (title ? '<figcaption>' + esc(title) + (unit ? '<span class="chart-unit">（単位: ' + esc(unit) + '）</span>' : '') + '</figcaption>' : '') +
      inner + (legend || '') + '</figure>';
  }

  /* ---------- 縦棒 / 折れ線（共通の座標系） ---------- */
  function axisChart(spec, kind) {
    const d = normalize(spec);
    if (!d.labels.length || !d.series.length) return null;
    const W = 640, H = 320, L = 62, R = 18, T = 18, B = 46;
    const pw = W - L - R, ph = H - T - B;
    const maxVal = niceMax(Math.max.apply(null, d.series.reduce(function (a, s) { return a.concat(s.data); }, [1])));
    const ticks = 5;
    let g = '';

    for (let t = 0; t <= ticks; t++) {
      const y = T + ph - (ph * t / ticks);
      g += '<line x1="' + L + '" y1="' + y + '" x2="' + (W - R) + '" y2="' + y + '" stroke="' + GRIDLINE + '" stroke-width="1"/>';
      g += '<text x="' + (L - 8) + '" y="' + (y + 4) + '" text-anchor="end" font-size="11" fill="' + AXIS + '">' + fmt(maxVal * t / ticks) + '</text>';
    }
    const slot = pw / d.labels.length;
    d.labels.forEach(function (lb, i) {
      const x = L + slot * i + slot / 2;
      const label = lb.length > 7 ? lb.slice(0, 7) + '…' : lb;
      g += '<text x="' + x + '" y="' + (H - B + 18) + '" text-anchor="middle" font-size="11" fill="' + TEXT + '">' + esc(label) + '</text>';
    });

    if (kind === 'bar') {
      const groupW = slot * 0.7;
      const barW = Math.min(38, groupW / d.series.length);
      d.series.forEach(function (s, si) {
        s.data.forEach(function (v, i) {
          const bh = ph * (v / maxVal);
          const x = L + slot * i + slot / 2 - (barW * d.series.length) / 2 + barW * si;
          const y = T + ph - bh;
          g += '<rect x="' + x + '" y="' + y + '" width="' + (barW - 2) + '" height="' + Math.max(0, bh) +
            '" rx="2" fill="' + PALETTE[si % PALETTE.length] + '"/>';
          if (d.series.length * d.labels.length <= 12) {
            g += '<text x="' + (x + (barW - 2) / 2) + '" y="' + (y - 5) + '" text-anchor="middle" font-size="10.5" fill="' + TEXT + '">' + fmt(v) + '</text>';
          }
        });
      });
    } else { // line
      d.series.forEach(function (s, si) {
        const color = PALETTE[si % PALETTE.length];
        const pts = s.data.map(function (v, i) {
          const x = L + slot * i + slot / 2;
          const y = T + ph - ph * (v / maxVal);
          return [x, y];
        });
        g += '<polyline points="' + pts.map(function (p) { return p.join(','); }).join(' ') +
          '" fill="none" stroke="' + color + '" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>';
        pts.forEach(function (p, i) {
          g += '<circle cx="' + p[0] + '" cy="' + p[1] + '" r="3.5" fill="#fff" stroke="' + color + '" stroke-width="2"/>';
          if (d.series.length === 1 && d.labels.length <= 8) {
            g += '<text x="' + p[0] + '" y="' + (p[1] - 9) + '" text-anchor="middle" font-size="10.5" fill="' + TEXT + '">' + fmt(s.data[i]) + '</text>';
          }
        });
      });
    }
    const svg = '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" xmlns="http://www.w3.org/2000/svg">' + g + '</svg>';
    return figure(spec.title, spec.unit, svg, legendHTML(d.series));
  }

  /* ---------- 横棒 ---------- */
  function hbarChart(spec) {
    const d = normalize(spec);
    if (!d.labels.length || !d.series.length) return null;
    const s = d.series[0];
    const rowH = 34, W = 640, L = 130, R = 66, T = 8;
    const H = T + rowH * d.labels.length + 8;
    const pw = W - L - R;
    const maxVal = niceMax(Math.max.apply(null, s.data.concat([1])));
    let g = '';
    d.labels.forEach(function (lb, i) {
      const v = num(s.data[i]);
      const y = T + rowH * i;
      const bw = pw * (v / maxVal);
      const label = lb.length > 9 ? lb.slice(0, 9) + '…' : lb;
      g += '<text x="' + (L - 10) + '" y="' + (y + rowH / 2 + 4) + '" text-anchor="end" font-size="11.5" fill="' + TEXT + '">' + esc(label) + '</text>';
      g += '<rect x="' + L + '" y="' + (y + 6) + '" width="' + Math.max(0, bw) + '" height="' + (rowH - 12) + '" rx="3" fill="' + PALETTE[i % PALETTE.length] + '"/>';
      g += '<text x="' + (L + bw + 8) + '" y="' + (y + rowH / 2 + 4) + '" font-size="11" fill="' + TEXT + '">' + fmt(v) + '</text>';
    });
    const svg = '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" xmlns="http://www.w3.org/2000/svg">' + g + '</svg>';
    return figure(spec.title, spec.unit, svg, '');
  }

  /* ---------- 円 / ドーナツ ---------- */
  function pieChart(spec, donut) {
    const d = normalize(spec);
    if (!d.labels.length || !d.series.length) return null;
    const values = d.series[0].data.map(function (v) { return Math.max(0, v); });
    const total = values.reduce(function (a, b) { return a + b; }, 0);
    if (total <= 0) return null;
    const C = 110, RAD = 92;
    let angle = -Math.PI / 2;
    let g = '';
    values.forEach(function (v, i) {
      const frac = v / total;
      const a2 = angle + frac * Math.PI * 2;
      const x1 = C + RAD * Math.cos(angle), y1 = C + RAD * Math.sin(angle);
      const x2 = C + RAD * Math.cos(a2), y2 = C + RAD * Math.sin(a2);
      const large = frac > 0.5 ? 1 : 0;
      if (frac >= 0.999) {
        g += '<circle cx="' + C + '" cy="' + C + '" r="' + RAD + '" fill="' + PALETTE[i % PALETTE.length] + '"/>';
      } else {
        g += '<path d="M' + C + ' ' + C + ' L' + x1.toFixed(2) + ' ' + y1.toFixed(2) +
          ' A' + RAD + ' ' + RAD + ' 0 ' + large + ' 1 ' + x2.toFixed(2) + ' ' + y2.toFixed(2) + ' Z" fill="' +
          PALETTE[i % PALETTE.length] + '" stroke="#fff" stroke-width="1.5"/>';
      }
      if (frac >= 0.06) {
        const mid = (angle + a2) / 2;
        const lx = C + RAD * 0.62 * Math.cos(mid), ly = C + RAD * 0.62 * Math.sin(mid);
        g += '<text x="' + lx.toFixed(1) + '" y="' + ly.toFixed(1) + '" text-anchor="middle" font-size="11" font-weight="600" fill="#fff">' +
          Math.round(frac * 100) + '%</text>';
      }
      angle = a2;
    });
    if (donut) g += '<circle cx="' + C + '" cy="' + C + '" r="46" fill="#fff"/>';
    const svg = '<svg viewBox="0 0 220 220" class="chart-pie" role="img" xmlns="http://www.w3.org/2000/svg">' + g + '</svg>';
    const legend = '<div class="chart-legend chart-legend-col">' + d.labels.map(function (lb, i) {
      return '<span class="chart-legend-item"><span class="chart-swatch" style="background:' + PALETTE[i % PALETTE.length] + '"></span>' +
        esc(lb) + '<span class="chart-unit">' + fmt(values[i]) + (spec.unit ? ' ' + esc(spec.unit) : '') + '</span></span>';
    }).join('') + '</div>';
    return '<figure class="chart-figure">' +
      (spec.title ? '<figcaption>' + esc(spec.title) + '</figcaption>' : '') +
      '<div class="chart-pie-wrap">' + svg + legend + '</div></figure>';
  }

  /* ---------- レーダー ---------- */
  function radarChart(spec) {
    const d = normalize(spec);
    const n = d.labels.length;
    if (n < 3 || !d.series.length) return null;
    const C = 160, RAD = 104, W = 320, H = 300, CY = 148;
    const maxVal = niceMax(Math.max.apply(null, d.series.reduce(function (a, s) { return a.concat(s.data); }, [1])));
    function pt(i, r) {
      const a = -Math.PI / 2 + (Math.PI * 2 * i) / n;
      return [C + r * Math.cos(a), CY + r * Math.sin(a)];
    }
    let g = '';
    for (let ring = 1; ring <= 4; ring++) {
      const pts = [];
      for (let i = 0; i < n; i++) pts.push(pt(i, (RAD * ring) / 4).map(function (v) { return v.toFixed(1); }).join(','));
      g += '<polygon points="' + pts.join(' ') + '" fill="none" stroke="' + GRIDLINE + '" stroke-width="1"/>';
    }
    for (let i = 0; i < n; i++) {
      const p = pt(i, RAD);
      g += '<line x1="' + C + '" y1="' + CY + '" x2="' + p[0].toFixed(1) + '" y2="' + p[1].toFixed(1) + '" stroke="' + GRIDLINE + '" stroke-width="1"/>';
      const lp = pt(i, RAD + 16);
      const lb = d.labels[i].length > 6 ? d.labels[i].slice(0, 6) + '…' : d.labels[i];
      g += '<text x="' + lp[0].toFixed(1) + '" y="' + (lp[1] + 4).toFixed(1) + '" text-anchor="middle" font-size="10.5" fill="' + TEXT + '">' + esc(lb) + '</text>';
    }
    d.series.forEach(function (s, si) {
      const color = PALETTE[si % PALETTE.length];
      const pts = [];
      for (let i = 0; i < n; i++) {
        pts.push(pt(i, RAD * (Math.max(0, num(s.data[i])) / maxVal)).map(function (v) { return v.toFixed(1); }).join(','));
      }
      g += '<polygon points="' + pts.join(' ') + '" fill="' + color + '" fill-opacity="0.18" stroke="' + color + '" stroke-width="2"/>';
    });
    const svg = '<svg viewBox="0 0 ' + W + ' ' + H + '" class="chart-radar" role="img" xmlns="http://www.w3.org/2000/svg">' + g + '</svg>';
    return figure(spec.title, spec.unit, '<div class="chart-radar-wrap">' + svg + '</div>', legendHTML(d.series));
  }

  /* ---------- KPIカード ---------- */
  function kpiCards(spec) {
    const items = (spec.items || []).slice(0, 8);
    if (!items.length) return null;
    return '<div class="kpi-grid">' + items.map(function (it) {
      return '<div class="kpi-card">' +
        '<div class="kpi-label">' + esc(it.label || '') + '</div>' +
        '<div class="kpi-value">' + esc(it.value || '') + '</div>' +
        (it.note ? '<div class="kpi-note">' + esc(it.note) + '</div>' : '') +
        '</div>';
    }).join('') + '</div>';
  }

  /* コードブロック(lang, code)をHTMLへ。対象外・解析不能なら null */
  function fromCode(lang, code) {
    if (lang !== 'chart' && lang !== 'kpi') return null;
    let spec;
    try {
      spec = JSON.parse(code);
    } catch (e) {
      return null;
    }
    try {
      if (lang === 'kpi') return kpiCards(spec);
      switch (spec.type) {
        case 'bar':   return axisChart(spec, 'bar');
        case 'line':  return axisChart(spec, 'line');
        case 'hbar':  return hbarChart(spec);
        case 'pie':   return pieChart(spec, false);
        case 'donut': return pieChart(spec, true);
        case 'radar': return radarChart(spec);
        default:      return null;
      }
    } catch (e) {
      return null;
    }
  }

  window.Charts = { fromCode: fromCode };
})();
