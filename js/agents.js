/* エージェントのプロフィール生成（名前・役割・アイコン） */
(function () {
  'use strict';

  /* 役割プール — 市場分析に必要な専門領域 */
  const ROLE_POOL = [
    { role: '市場規模アナリスト', emoji: '📊', focus: 'TAM/SAM/SOMの推定、市場の成長率と将来予測を分析する' },
    { role: '競合分析スペシャリスト', emoji: '⚔️', focus: '主要競合のシェア・強み・弱み・戦略を比較分析する' },
    { role: 'ターゲット顧客リサーチャー', emoji: '🎯', focus: '顧客セグメント、ニーズ、購買行動、意思決定要因を分析する' },
    { role: 'トレンドウォッチャー', emoji: '📈', focus: '市場の最新トレンド、消費者行動の変化、注目キーワードを分析する' },
    { role: 'SWOT分析官', emoji: '🧩', focus: '強み・弱み・機会・脅威を整理し戦略的示唆を導く' },
    { role: '価格戦略アナリスト', emoji: '💰', focus: '価格帯の分布、価格弾力性、最適なプライシング戦略を分析する' },
    { role: '流通チャネル調査員', emoji: '🚚', focus: '販売チャネルの構造、EC/実店舗の比率、チャネル別の攻略法を分析する' },
    { role: 'SNS動向アナリスト', emoji: '📱', focus: 'SNS上の話題性、インフルエンサー動向、UGCの傾向を分析する' },
    { role: '規制・法務リサーチャー', emoji: '⚖️', focus: '関連する法規制、業界ルール、コンプライアンス上の注意点を分析する' },
    { role: '技術動向スカウト', emoji: '🔬', focus: '関連技術の進化、DX動向、テクノロジーがもたらす変化を分析する' },
    { role: '海外市場リサーチャー', emoji: '🌏', focus: '海外の類似市場・先行事例から国内市場への示唆を導く' },
    { role: 'リスクアナリスト', emoji: '🛡️', focus: '参入リスク、市場リスク、想定される失敗パターンと対策を分析する' },
    { role: 'マーケ施策プランナー', emoji: '📣', focus: '有効なマーケティング施策、プロモーション戦略を立案する' },
    { role: 'KPI設計コンサルタント', emoji: '📐', focus: '成功を測る指標体系（KGI/KPI）と目標値の目安を設計する' },
    { role: 'ペルソナデザイナー', emoji: '👤', focus: '具体的なペルソナ像を複数作成し、それぞれの行動特性を描く' },
    { role: 'ジャーニー設計士', emoji: '🗺️', focus: 'カスタマージャーニーを設計し、各接点での打ち手を分析する' },
    { role: 'ブランド戦略アナリスト', emoji: '🏷️', focus: 'ポジショニング、ブランドイメージ、差別化の軸を分析する' },
    { role: '広告媒体プランナー', emoji: '🖥️', focus: '効果的な広告媒体の組み合わせと予算配分の考え方を分析する' },
    { role: 'コンテンツ戦略プランナー', emoji: '✍️', focus: 'オウンドメディア・コンテンツマーケティングの戦略を立案する' },
    { role: 'データサイエンティスト', emoji: '🧮', focus: '定量データの観点から市場構造を推定し、数値仮説を提示する' },
    { role: '業界構造アナリスト', emoji: '🏛️', focus: 'ファイブフォース分析で業界の競争構造と収益性を分析する' },
    { role: 'サプライチェーン調査員', emoji: '🔗', focus: '調達・生産・物流の構造とコスト構造、ボトルネックを分析する' },
    { role: '消費者心理リサーチャー', emoji: '🧠', focus: '購買心理、行動経済学的なインサイト、心理的障壁を分析する' },
    { role: '成長戦略プランナー', emoji: '🚀', focus: '中長期の成長シナリオ、事業拡大のロードマップを立案する' },
    { role: '収益モデルアナリスト', emoji: '🧾', focus: 'ビジネスモデル、収益構造、損益分岐の考え方を分析する' },
    { role: 'アライアンス調査員', emoji: '🤝', focus: '有望な提携先、パートナーシップ戦略の選択肢を分析する' },
    { role: 'サステナビリティ調査員', emoji: '🌱', focus: 'ESG・サステナビリティ観点の要請と機会を分析する' },
    { role: 'イノベーション動向スカウト', emoji: '💡', focus: '新興プレイヤー、スタートアップ、破壊的イノベーションの兆しを分析する' },
    { role: 'レビュー分析官', emoji: '⭐', focus: '既存商品・サービスの口コミから顧客の不満と期待を分析する' },
    { role: 'シナリオプランナー', emoji: '🔮', focus: '楽観・中立・悲観の3シナリオで将来の市場変化を予測する' },
  ];

  /* 名前プール（カタカナのエージェント名） */
  const NAME_POOL = [
    'ハルト', 'アオイ', 'ユイ', 'ソラ', 'リン', 'カイト', 'ミナ', 'レン', 'ヒナタ', 'ツムギ',
    'イツキ', 'サクラ', 'リク', 'メイ', 'ユウナ', 'アサヒ', 'コハル', 'タクミ', 'ノア', 'エマ',
    'ダイチ', 'ミオ', 'ケンタ', 'ルナ', 'ショウ', 'アカリ', 'ユウキ', 'ホノカ', 'ジン', 'サナ',
    'カエデ', 'トワ', 'スイ', 'ナギ', 'フウカ',
  ];

  /* アバター用グラデーション配色 */
  const GRADIENTS = [
    ['#ff9a9e', '#fad0c4'], ['#a18cd1', '#fbc2eb'], ['#fbc2eb', '#a6c1ee'],
    ['#84fab0', '#8fd3f4'], ['#fccb90', '#d57eeb'], ['#e0c3fc', '#8ec5fc'],
    ['#f093fb', '#f5576c'], ['#4facfe', '#00f2fe'], ['#43e97b', '#38f9d7'],
    ['#fa709a', '#fee140'], ['#30cfd0', '#330867'], ['#667eea', '#764ba2'],
    ['#2af598', '#009efd'], ['#f78ca0', '#fe9a8b'], ['#5ee7df', '#b490ca'],
  ];

  function hashCode(s) {
    let h = 0;
    for (let i = 0; i < s.length; i++) { h = ((h << 5) - h + s.charCodeAt(i)) | 0; }
    return Math.abs(h);
  }

  /* SNS風プロフィールアイコン（決定的に生成されるSVG） */
  function avatarSVG(seed, emoji) {
    const h = hashCode(seed);
    const g = GRADIENTS[h % GRADIENTS.length];
    const gid = 'g' + h;
    const cx1 = 12 + (h % 40);
    const cy1 = 10 + ((h >> 3) % 20);
    return (
      '<svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg" role="img">' +
      '<defs><linearGradient id="' + gid + '" x1="0" y1="0" x2="1" y2="1">' +
      '<stop offset="0" stop-color="' + g[0] + '"/><stop offset="1" stop-color="' + g[1] + '"/>' +
      '</linearGradient></defs>' +
      '<circle cx="32" cy="32" r="32" fill="url(#' + gid + ')"/>' +
      '<circle cx="' + cx1 + '" cy="' + cy1 + '" r="10" fill="rgba(255,255,255,0.22)"/>' +
      '<circle cx="' + (64 - cx1) + '" cy="' + (64 - cy1) + '" r="14" fill="rgba(255,255,255,0.12)"/>' +
      '<text x="32" y="40" font-size="26" text-anchor="middle">' + emoji + '</text>' +
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
        emoji: r.emoji,
        focus: r.focus,
      };
    });
  }

  /* 資料作成エージェント（統合役）の固定プロフィール */
  const SYNTH_PROFILE = {
    name: 'ツヅリ',
    role: '資料作成ディレクター',
    emoji: '✒️',
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
