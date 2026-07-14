/* エージェントのプロフィール生成（名前・役割・アイコン） */
(function () {
  'use strict';

  /* 役割プール — 市場分析に必要な専門領域 */
  const ROLE_POOL = [
    { role: '市場規模アナリスト', icon: 'chart', focus: 'TAM/SAM/SOMの推定、市場の成長率と将来予測を分析する' },
    { role: '競合分析スペシャリスト', icon: 'crosshair', focus: '主要競合のシェア・強み・弱み・戦略を比較分析する' },
    { role: 'ターゲット顧客リサーチャー', icon: 'target', focus: '顧客セグメント、ニーズ、購買行動、意思決定要因を分析する' },
    { role: 'トレンドウォッチャー', icon: 'trend', focus: '市場の最新トレンド、消費者行動の変化、注目キーワードを分析する' },
    { role: 'SWOT分析官', icon: 'grid', focus: '強み・弱み・機会・脅威を整理し戦略的示唆を導く' },
    { role: '価格戦略アナリスト', icon: 'percent', focus: '価格帯の分布、価格弾力性、最適なプライシング戦略を分析する' },
    { role: '流通チャネル調査員', icon: 'truck', focus: '販売チャネルの構造、EC/実店舗の比率、チャネル別の攻略法を分析する' },
    { role: 'SNS動向アナリスト', icon: 'phone', focus: 'SNS上の話題性、インフルエンサー動向、UGCの傾向を分析する' },
    { role: '規制・法務リサーチャー', icon: 'scale', focus: '関連する法規制、業界ルール、コンプライアンス上の注意点を分析する' },
    { role: '技術動向スカウト', icon: 'cpu', focus: '関連技術の進化、DX動向、テクノロジーがもたらす変化を分析する' },
    { role: '海外市場リサーチャー', icon: 'globe', focus: '海外の類似市場・先行事例から国内市場への示唆を導く' },
    { role: 'リスクアナリスト', icon: 'shield', focus: '参入リスク、市場リスク、想定される失敗パターンと対策を分析する' },
    { role: 'マーケ施策プランナー', icon: 'megaphone', focus: '有効なマーケティング施策、プロモーション戦略を立案する' },
    { role: 'KPI設計コンサルタント', icon: 'sliders', focus: '成功を測る指標体系（KGI/KPI）と目標値の目安を設計する' },
    { role: 'ペルソナデザイナー', icon: 'user', focus: '具体的なペルソナ像を複数作成し、それぞれの行動特性を描く' },
    { role: 'ジャーニー設計士', icon: 'map', focus: 'カスタマージャーニーを設計し、各接点での打ち手を分析する' },
    { role: 'ブランド戦略アナリスト', icon: 'tag', focus: 'ポジショニング、ブランドイメージ、差別化の軸を分析する' },
    { role: '広告媒体プランナー', icon: 'monitor', focus: '効果的な広告媒体の組み合わせと予算配分の考え方を分析する' },
    { role: 'コンテンツ戦略プランナー', icon: 'pentool', focus: 'オウンドメディア・コンテンツマーケティングの戦略を立案する' },
    { role: 'データサイエンティスト', icon: 'activity', focus: '定量データの観点から市場構造を推定し、数値仮説を提示する' },
    { role: '業界構造アナリスト', icon: 'layers', focus: 'ファイブフォース分析で業界の競争構造と収益性を分析する' },
    { role: 'サプライチェーン調査員', icon: 'link', focus: '調達・生産・物流の構造とコスト構造、ボトルネックを分析する' },
    { role: '消費者心理リサーチャー', icon: 'heart', focus: '購買心理、行動経済学的なインサイト、心理的障壁を分析する' },
    { role: '成長戦略プランナー', icon: 'rocket', focus: '中長期の成長シナリオ、事業拡大のロードマップを立案する' },
    { role: '収益モデルアナリスト', icon: 'pie', focus: 'ビジネスモデル、収益構造、損益分岐の考え方を分析する' },
    { role: 'アライアンス調査員', icon: 'users', focus: '有望な提携先、パートナーシップ戦略の選択肢を分析する' },
    { role: 'サステナビリティ調査員', icon: 'leaf', focus: 'ESG・サステナビリティ観点の要請と機会を分析する' },
    { role: 'イノベーション動向スカウト', icon: 'bulb', focus: '新興プレイヤー、スタートアップ、破壊的イノベーションの兆しを分析する' },
    { role: 'レビュー分析官', icon: 'star', focus: '既存商品・サービスの口コミから顧客の不満と期待を分析する' },
    { role: 'シナリオプランナー', icon: 'compass', focus: '楽観・中立・悲観の3シナリオで将来の市場変化を予測する' },
  ];

  /* 名前プール（カタカナのエージェント名） */
  const NAME_POOL = [
    'ハルト', 'アオイ', 'ユイ', 'ソラ', 'リン', 'カイト', 'ミナ', 'レン', 'ヒナタ', 'ツムギ',
    'イツキ', 'サクラ', 'リク', 'メイ', 'ユウナ', 'アサヒ', 'コハル', 'タクミ', 'ノア', 'エマ',
    'ダイチ', 'ミオ', 'ケンタ', 'ルナ', 'ショウ', 'アカリ', 'ユウキ', 'ホノカ', 'ジン', 'サナ',
    'カエデ', 'トワ', 'スイ', 'ナギ', 'フウカ',
  ];

  /* アバター背景のグラデーション配色 */
  const GRADIENTS = [
    ['#ffd9a8', '#ffb0b0'], ['#c9b8f0', '#f7c8e8'], ['#f7c8e8', '#b8ccf0'],
    ['#b8ecc9', '#b0dcf4'], ['#ffd9b0', '#e4b8ec'], ['#e8d5fa', '#bcd4fc'],
    ['#f9c2f2', '#f9a8b0'], ['#a8d4fc', '#a0ecf4'], ['#b0eccb', '#a8f4e0'],
    ['#f9b8c8', '#fce9a8'], ['#a8dcdc', '#b8c0ec'], ['#c0c8f4', '#d4b8e8'],
  ];

  /* 顔イラスト用パーツ配色（多様な人種・年齢を表現） */
  const SKIN_TONES = ['#ffdfc4', '#f5cba7', '#e8b184', '#c68863', '#a5673f', '#8d5524', '#6f4423'];
  const HAIR_COLORS = ['#2b2118', '#453022', '#5f402a', '#8a5a33', '#c98e4a', '#e3c16f', '#a44e35', '#555b63', '#9aa2ab', '#e9e6df'];
  const CLOTH_COLORS = ['#4f8cff', '#e46a6a', '#3ba57e', '#8a6fd8', '#e29a3d', '#4aa8c0', '#c95f9c', '#5f6f8a', '#7a9e4f', '#3d5a80'];

  function hashCode(s) {
    let h = 0;
    for (let i = 0; i < s.length; i++) { h = ((h << 5) - h + s.charCodeAt(i)) | 0; }
    return Math.abs(h);
  }

  function shade(hex, f) {
    const n = parseInt(hex.slice(1), 16);
    const r = Math.max(0, Math.min(255, Math.round(((n >> 16) & 255) * f)));
    const g = Math.max(0, Math.min(255, Math.round(((n >> 8) & 255) * f)));
    const b = Math.max(0, Math.min(255, Math.round((n & 255) * f)));
    return 'rgb(' + r + ',' + g + ',' + b + ')';
  }

  /*
   * SNS風プロフィールアイコン — 人の顔のフラットイラストを決定的に生成。
   * 肌の色7種 × 髪型9種 × 髪色10種 × メガネ/ひげ/年齢表現などの組み合わせで
   * 老若男女・さまざまな人種のバリエーションを作る。
   */
  function avatarSVG(seed) {
    const h1 = hashCode(seed);
    const h2 = hashCode(seed + '*face');
    const h3 = hashCode('face*' + seed);

    const grad = GRADIENTS[h1 % GRADIENTS.length];
    const skin = SKIN_TONES[h2 % SKIN_TONES.length];
    const hairStyle = h1 % 9;                     // 0-8
    let hair = HAIR_COLORS[h3 % HAIR_COLORS.length];
    const cloth = CLOTH_COLORS[(h1 >> 4) % CLOTH_COLORS.length];
    const senior = (h2 >> 3) % 5 === 0;           // 約20%はシニア（白髪・グレー）
    if (senior) hair = ((h2 >> 5) % 2) ? '#e9e6df' : '#9aa2ab';
    const glasses = (h3 >> 2) % 4 === 0;          // 約25%
    const facialHair = !glasses && ((h1 >> 7) % 5 === 0); // 約20%（バランス調整）
    const blush = (h2 >> 6) % 3 === 0;            // 約33%
    const earrings = (h3 >> 4) % 4 === 0;         // 約25%
    const gid = 'fa' + (h1 % 100000);

    const skinShade = shade(skin, 0.88);
    const lineColor = '#3a2e2e';

    const parts = [];

    /* --- 背面の髪（ロング・アフロなど頭の後ろに広がるもの） --- */
    if (hairStyle === 4) { // ロングストレート
      parts.push('<path d="M18 56 L18 26 C18 13 46 13 46 26 L46 56 Z" fill="' + hair + '"/>');
    }
    if (hairStyle === 6) { // カーリー／アフロ
      parts.push('<circle cx="32" cy="20" r="11.5" fill="' + hair + '"/>' +
        '<circle cx="20.5" cy="26" r="6" fill="' + hair + '"/>' +
        '<circle cx="43.5" cy="26" r="6" fill="' + hair + '"/>');
    }
    if (hairStyle === 8) { // ポニーテール（後ろ髪）
      parts.push('<path d="M40 16 C50 18 50 34 45 44 C47 32 45 22 38 19 Z" fill="' + hair + '"/>');
    }

    /* --- 体（服） --- */
    parts.push('<path d="M9 66 C9 50 19 45.5 32 45.5 C45 45.5 55 50 55 66 Z" fill="' + cloth + '"/>');
    /* 襟元 */
    parts.push('<path d="M27 46 L32 51 L37 46 Z" fill="' + shade(cloth, 0.8) + '"/>');

    /* --- 首・頭・耳 --- */
    parts.push('<rect x="28" y="37.5" width="8" height="10" rx="3" fill="' + skinShade + '"/>');
    parts.push('<circle cx="18.8" cy="30.5" r="3" fill="' + skin + '"/>');
    parts.push('<circle cx="45.2" cy="30.5" r="3" fill="' + skin + '"/>');
    if (earrings) {
      parts.push('<circle cx="18.6" cy="33.6" r="1.1" fill="#f2c94c"/>' +
        '<circle cx="45.4" cy="33.6" r="1.1" fill="#f2c94c"/>');
    }
    parts.push('<ellipse cx="32" cy="29" rx="13.4" ry="14" fill="' + skin + '"/>');

    /* --- シニアの頬のライン --- */
    if (senior) {
      parts.push('<path d="M24.5 35.5 Q25.5 37 27 37.5" stroke="' + skinShade + '" stroke-width="1" fill="none" stroke-linecap="round"/>' +
        '<path d="M39.5 35.5 Q38.5 37 37 37.5" stroke="' + skinShade + '" stroke-width="1" fill="none" stroke-linecap="round"/>');
    }

    /* --- ひげ（口より先に描いて口を上に重ねる） --- */
    if (facialHair) {
      const beardKind = (h2 >> 8) % 2;
      if (beardKind === 0) { // あごひげ
        parts.push('<path d="M19.6 29 C19.6 41 24.5 46 32 46 C39.5 46 44.4 41 44.4 29 L44.4 33 C44.4 42.5 39.5 47 32 47 C24.5 47 19.6 42.5 19.6 33 Z" fill="' + hair + '"/>' +
          '<path d="M23 36 C24 42 27.5 44.5 32 44.5 C36.5 44.5 40 42 41 36 C41 41 37.5 44 32 44 C26.5 44 23 41 23 36 Z" fill="' + hair + '"/>');
      } else { // 口ひげ
        parts.push('<path d="M26.8 34.6 Q32 32.8 37.2 34.6 Q32 36.8 26.8 34.6 Z" fill="' + hair + '"/>');
      }
    }

    /* --- 目・眉・口・頬 --- */
    if (senior && (h3 >> 6) % 2 === 0) {
      // にっこり目（アーチ）
      parts.push('<path d="M24.8 30 Q26.8 28.2 28.8 30" stroke="' + lineColor + '" stroke-width="1.6" fill="none" stroke-linecap="round"/>' +
        '<path d="M35.2 30 Q37.2 28.2 39.2 30" stroke="' + lineColor + '" stroke-width="1.6" fill="none" stroke-linecap="round"/>');
    } else {
      parts.push('<circle cx="26.8" cy="29.8" r="1.7" fill="' + lineColor + '"/>' +
        '<circle cx="37.2" cy="29.8" r="1.7" fill="' + lineColor + '"/>');
    }
    const browColor = senior ? hair : shade(hair, 0.75);
    parts.push('<path d="M24.3 26 Q26.8 24.6 29.3 26" stroke="' + browColor + '" stroke-width="1.5" fill="none" stroke-linecap="round"/>' +
      '<path d="M34.7 26 Q37.2 24.6 39.7 26" stroke="' + browColor + '" stroke-width="1.5" fill="none" stroke-linecap="round"/>');
    if (blush) {
      parts.push('<circle cx="23.6" cy="33.6" r="2" fill="#f08a8a" opacity="0.35"/>' +
        '<circle cx="40.4" cy="33.6" r="2" fill="#f08a8a" opacity="0.35"/>');
    }
    const mouthKind = (h1 >> 9) % 3;
    if (mouthKind === 0) { // 笑顔（開口）
      parts.push('<path d="M28 35.6 Q32 40 36 35.6 Z" fill="#8a4a42"/>');
    } else { // 微笑み
      parts.push('<path d="M28.4 36.4 Q32 39.4 35.6 36.4" stroke="#8a4a42" stroke-width="1.6" fill="none" stroke-linecap="round"/>');
    }

    /* --- 前面の髪型 --- */
    const cap = 'M18.6 30 A13.4 14 0 0 1 45.4 30 L45.4 28 C45.4 21.5 40.5 18.4 32 18.4 C23.5 18.4 18.6 21.5 18.6 28 Z';
    switch (hairStyle) {
      case 0: // ショート
        parts.push('<path d="' + cap + '" fill="' + hair + '"/>');
        break;
      case 1: // 前髪ぱっつん
        parts.push('<path d="M18.6 30 A13.4 14 0 0 1 45.4 30 L45.4 27 C45.4 20 40.5 16.8 32 16.8 C23.5 16.8 18.6 20 18.6 27 Z" fill="' + hair + '"/>' +
          '<path d="M19.5 27.5 C22 23.5 26 22.5 32 22.5 C38 22.5 42 23.5 44.5 27.5 C42 25.8 38 25 32 25 C26 25 22 25.8 19.5 27.5 Z" fill="' + hair + '"/>');
        break;
      case 2: // ツンツン（スパイキー）
        parts.push('<path d="' + cap + '" fill="' + hair + '"/>' +
          '<path d="M21 20.5 L23 14.5 L25.5 18.3 L28.5 13 L31.5 17.5 L34.5 13.2 L37 17.8 L40 14.8 L41.5 20 Z" fill="' + hair + '"/>');
        break;
      case 3: // ボブ
        parts.push('<path d="M17.2 37 C14.8 14.5 49.2 14.5 46.8 37 C44.6 33 44.2 28.5 43.6 25.8 C39.8 20.8 24.2 20.8 20.4 25.8 C19.8 28.5 19.4 33 17.2 37 Z" fill="' + hair + '"/>');
        break;
      case 4: // ロング（前面）
        parts.push('<path d="M18.6 30 A13.4 14 0 0 1 45.4 30 L45.4 27 C45.4 20.5 40.5 17.8 32 17.8 C23.5 17.8 18.6 20.5 18.6 27 Z" fill="' + hair + '"/>');
        break;
      case 5: // おだんご
        parts.push('<circle cx="32" cy="13" r="4.8" fill="' + hair + '"/>' +
          '<path d="' + cap + '" fill="' + hair + '"/>');
        break;
      case 6: // カーリー（前面）
        parts.push('<path d="' + cap + '" fill="' + hair + '"/>');
        break;
      case 7: // 薄毛・サイドのみ（シニア風）
        parts.push('<path d="M18.6 31 C18.4 25 19.8 21.5 22.8 19.8 C21.4 23.5 21.2 27.5 21.6 31 Z" fill="' + hair + '"/>' +
          '<path d="M45.4 31 C45.6 25 44.2 21.5 41.2 19.8 C42.6 23.5 42.8 27.5 42.4 31 Z" fill="' + hair + '"/>' +
          '<path d="M24 17.8 Q32 14.5 40 17.8" stroke="' + hair + '" stroke-width="1.6" fill="none" stroke-linecap="round"/>');
        break;
      case 8: // ポニーテール（前面）
        parts.push('<path d="' + cap + '" fill="' + hair + '"/>');
        break;
    }

    /* --- メガネ --- */
    if (glasses) {
      parts.push('<g stroke="' + lineColor + '" stroke-width="1.4" fill="none">' +
        '<circle cx="26.8" cy="30" r="4.4"/>' +
        '<circle cx="37.2" cy="30" r="4.4"/>' +
        '<path d="M31.2 30 L32.8 30"/>' +
        '<path d="M22.4 29.4 L19 28.6"/><path d="M41.6 29.4 L45 28.6"/></g>');
    }

    return (
      '<svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg" role="img">' +
      '<defs><linearGradient id="' + gid + '" x1="0" y1="0" x2="1" y2="1">' +
      '<stop offset="0" stop-color="' + grad[0] + '"/><stop offset="1" stop-color="' + grad[1] + '"/>' +
      '</linearGradient><clipPath id="' + gid + 'c"><circle cx="32" cy="32" r="32"/></clipPath></defs>' +
      '<circle cx="32" cy="32" r="32" fill="url(#' + gid + ')"/>' +
      '<g clip-path="url(#' + gid + 'c)">' + parts.join('') + '</g>' +
      '</svg>'
    );
  }

  function shuffled(arr, seed) {
    const a = arr.slice();
    let s = seed;
    for (let i = a.length - 1; i > 0; i--) {
      s = (s * 9301 + 49297) % 233280;
      const j = Math.floor((s / 233280) * (i + 1));
      const t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }

  /* ローカル生成のフォールバックチーム（AIによるチーム編成が使えない場合） */
  function buildLocalTeam(topic, count) {
    const seed = hashCode(topic || 'default') + count;
    const roles = shuffled(ROLE_POOL, seed).slice(0, Math.min(count, ROLE_POOL.length));
    const names = shuffled(NAME_POOL, seed + 7);
    return roles.map(function (r, i) {
      return {
        name: names[i % names.length] + (i >= names.length ? String(Math.floor(i / names.length) + 1) : ''),
        role: r.role,
        icon: r.icon,
        focus: r.focus,
      };
    });
  }

  /* 資料作成エージェント（統合役）の固定プロフィール */
  const SYNTH_PROFILE = {
    name: 'ツヅリ',
    role: '資料作成ディレクター',
    icon: 'pen',
    focus: '全エージェントの報告を統合し、完成度の高い市場分析資料に仕上げる',
  };

  window.Agents = {
    ROLE_POOL: ROLE_POOL,
    NAME_POOL: NAME_POOL,
    SYNTH_PROFILE: SYNTH_PROFILE,
    avatarSVG: avatarSVG,
    buildLocalTeam: buildLocalTeam,
  };
})();
