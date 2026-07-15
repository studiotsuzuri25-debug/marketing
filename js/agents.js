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
    { role: 'SNS動向アナリスト', icon: 'phone', focus: 'SNS全般の話題性、インフルエンサー動向、UGC・口コミの傾向を分析する' },
    { role: 'Instagram分析官', icon: 'camera', focus: 'Instagramのトレンド、人気ハッシュタグ、検索されるキーワード、伸びている投稿・支持されるビジュアル表現の傾向を分析する' },
    { role: '検索キーワードアナリスト', icon: 'search', focus: 'Google検索のトレンド・サジェスト・検索需要の高いキーワード・検索意図と、AI検索（AIへの質問傾向とAIが提示する回答）の傾向を分析する' },
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

  /* 名前プール（英語のエージェント名） */
  const NAME_POOL = [
    'Ethan', 'Olivia', 'Liam', 'Emma', 'Noah', 'Ava', 'Mason', 'Sophia', 'James', 'Isabella',
    'Lucas', 'Mia', 'Henry', 'Amelia', 'Leo', 'Harper', 'Owen', 'Ella', 'Aiden', 'Grace',
    'Julian', 'Chloe', 'Nathan', 'Luna', 'Caleb', 'Zoe', 'Ryan', 'Nora', 'Adrian', 'Maya',
    'Elias', 'Ivy', 'Miles', 'Aria', 'Felix',
  ];

  /* HUDアバターのアクセント色（クールで統一感のある寒色系のみ） */
  const ACCENTS = ['#38bdf8', '#22d3ee', '#2dd4bf', '#60a5fa', '#818cf8', '#a78bfa', '#34d399', '#7dd3fc'];

  function hashCode(s) {
    let h = 0;
    for (let i = 0; i < s.length; i++) { h = ((h << 5) - h + s.charCodeAt(i)) | 0; }
    return Math.abs(h);
  }

  function monogram(label) {
    const s = String(label || '').trim();
    if (!s) return 'AI';
    const letters = s.replace(/[^A-Za-z0-9]/g, '');
    if (letters.length >= 2) return letters.slice(0, 2).toUpperCase();
    if (letters.length === 1) return letters.toUpperCase();
    return s.slice(0, 2); // 日本語などはそのまま2文字
  }

  /*
   * エージェントアバター — ChatGPTの音声オーブのように、色付きのもやもやが
   * ゆっくり動き・色相が移ろう「AIが稼働している」印象のアニメーションオーブ。
   * エージェントごとに基準となる色相・動き・速度を決定的に変える。
   */
  function avatarSVG(seed, label) {
    const h = hashCode(seed);
    const h2 = hashCode(seed + '~orb');
    const baseH = h % 360;                       // 基準色相（エージェントごとに異なる）
    const h1 = baseH;
    const hueB = (baseH + 45) % 360;
    const hueC = (baseH + 320) % 360;
    const dur = (5 + (h % 45) / 10).toFixed(1);   // もやもやの動き 5.0〜9.4s
    const hueDur = (9 + (h2 % 90) / 10).toFixed(1); // 色相の一巡 9.0〜17.9s
    const d1 = '-' + ((h % 60) / 10).toFixed(1) + 's';
    const d2 = '-' + ((h2 % 80) / 10).toFixed(1) + 's';
    const style =
      '--h1:' + h1 + ';--h2:' + hueB + ';--h3:' + hueC + ';' +
      '--orbdur:' + dur + 's;--huedur:' + hueDur + 's;--d1:' + d1 + ';--d2:' + d2 + ';';
    return (
      '<div class="orb" style="' + style + '" aria-hidden="true">' +
      '<span class="orb-b orb-b1"></span>' +
      '<span class="orb-b orb-b2"></span>' +
      '<span class="orb-b orb-b3"></span>' +
      '<span class="orb-sheen"></span>' +
      '</div>'
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

  /* ローカル生成のフォールバックチーム（AIによるチーム編成が使えない場合）
     SNS・Instagram分析の担当を必ず1体含める */
  function buildLocalTeam(topic, count) {
    const seed = hashCode(topic || 'default') + count;
    const roles = shuffled(ROLE_POOL, seed).slice(0, Math.min(count, ROLE_POOL.length));
    if (!roles.some(function (r) { return /Instagram|SNS/.test(r.role); })) {
      roles[roles.length - 1] = ROLE_POOL.find(function (r) { return r.role === 'Instagram分析官'; });
    }
    if (roles.length >= 2 && !roles.some(function (r) { return /検索キーワード/.test(r.role); })) {
      roles[roles.length - 2] = ROLE_POOL.find(function (r) { return r.role === '検索キーワードアナリスト'; });
    }
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
    name: 'Editor',
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
