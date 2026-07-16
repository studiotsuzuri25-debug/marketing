# Agent Market Lab（AML）— 引き継ぎノート（セッション間ハンドオフ用）

> このノートは、別のClaude Codeセッションがこのツールの全体像・設計・運用ルールを把握して
> 開発を継続できるようにするための引き継ぎ資料です。**まずこのノートを読んでから作業を始めてください。**
> 最終更新の目安: main の最新コミット `db350e7`（SWキャッシュ `aml-cache-v33`）時点。

---

## 0. 30秒サマリー

- **何**: 複数のAIエージェントが**同時並列**で市場分析を行い、統合役（Editor）が**完成資料**を自動生成するWebツール。
- **形態**: ビルド不要の**バニラJS製 静的SPA + PWA**。GitHub Pagesで配信。サーバーは無し（すべてブラウザ内で完結）。
- **リポジトリ**: `studiotsuzuri25-debug/marketing`
- **開発ブランチ**: `claude/multi-agent-market-analysis-vm9lif` → `main` に ff-merge して GitHub Pages へ反映。
- **絶対ルール**: **絵文字は一切使わない（SVGピクトグラムのみ）** / **ハルシネーション・捏造データ・架空の出典を禁止（根拠と出典を必須にする）**。

---

## 1. プロダクトの目的とコンセプト

- ユーザー（日本語・非エンジニア寄り）の市場分析業務を、複数AIエージェントの並列調査＋統合で自動化する。
- 各エージェントはSNS風プロフィール（英語名・役割・アイコン）を持ち、グリッド画面で実行状況（待機中／分析中／報告完了）をリアルタイム表示。
- 最後に統合役 **Editor** が全報告を1つの戦略資料（Markdown→HTML、グラフ・表・KPI・画像引用込み）にまとめる。
- 「SF・エグゼクティブ」な世界観の明るいUI（雲の上のような背景アニメーション）。子どもっぽさは厳禁（過去に複数回指摘あり）。

### ユーザーが繰り返し強調している要件（ハード制約）
1. **絵文字禁止**。アイコンは必ずSVGピクトグラム/ピクトアイコン。
2. **虚偽報告の禁止**。確認できない数値は「推定」「未確認」と明記。架空の統計・出典を作らない。各主張に根拠・出典を添える。
3. **競合は「複数」を個別に調査**（1社に偏らせない。最大20社。比較表に全社を行として掲載）。
4. **APIキーの強固なセキュリティ**。
5. UIは**SF/エグゼクティブ**。派手すぎ・子どもっぽさNG。ダーク/ライト両対応。

---

## 2. 技術スタック / アーキテクチャ

- **フロント**: 素のHTML/CSS/JS（フレームワーク・ビルドツールなし）。各JSは IIFE で `window.X` にエクスポートする素朴な構成。
- **PWA**: `manifest.webmanifest` + `sw.js`（Service Worker, キャッシュ優先）。インストール可・完了プッシュ通知・`env(safe-area-inset-*)` 対応。
- **AI呼び出し**: ブラウザから各社APIへ**直接** fetch（CORS許可のあるエンドポイントを使用）。キーはブラウザ内に存在する必要があるため、**暗号化保存**で守る（下記セキュリティ参照）。
- **アカウント/同期**: Firebase Auth（メール/パスワード + Googleログイン）+ Firestore（**エンドツーエンド暗号化**した blob を保存）。設定は端末内 localStorage（暗号化）にも保存。
- **自律Web調査**: CORSフレンドリーな公開リーダー/プロキシ経由（`s.jina.ai`, `api.allorigins.win`, Wikipedia, Google Suggest/Trends/News RSS）。
- **描画**: 自作の軽量 Markdown→HTML、自作 SVG チャートエンジン、SVGアイコン、決定論的アニメーションのオーブ型アバター。

### 分析フロー（`js/app.js` の `startAnalysis()`）
```
startAnalysis()
  ├─ (0) 自律Web調査           Research.run()         ← autoResearch ON時
  │      └ 競合を複数特定       discoverCompetitors()  → Research.findCompetitors()
  │      └ 競合ごとに深掘り     Research.deepDive()
  ├─ (1) チーム編成            planTeam()             ← AIがエージェント構成をJSONで設計（失敗時ローカル編成）
  ├─ (2) 並列分析              runPool(runAgent, 同時実行数)
  ├─ (3) 統合・戦略立案        synthesize()           ← 統合役 Editor が最終資料を生成
  ├─ (4) 表示・保存            showReport() / saveToHistory()
  └─      完了通知             sendNotification()
```

### 2段階モード（重要な設定）
- 「調査分析AI」と「戦略立案AI」を**別プロバイダに分離**できる（例: 調査=Perplexity → 戦略=Claude）。
- `state.settings.pipeline = 'single' | 'split'`、`state.settings.roles = {research, strategy}`。
- `providerForStage('research'|'strategy')` が工程ごとのプロバイダを返す。runAgent/planTeam/discoverCompetitors は research、synthesize は strategy を使う。
- 使用量はプロバイダ別に集計（`state.usage.byProvider`）してレポートに内訳表示。

---

## 3. ファイル構成（役割マップ）

| ファイル | 役割 |
|---|---|
| `index.html` | SPAシェル。全ビュー/モーダル、`<script>`読込、**CSPメタ**、manifest。 |
| `css/style.css` | 全スタイル。ダーク/ライトテーマ、雲背景アニメ、オーブアバター、レスポンシブ、セーフエリア。 |
| `js/theme-init.js` | CSS読込前のテーマ適用（ちらつき防止）。**CSP対応のため外部化**したインラインスクリプト。 |
| `js/icons.js` | SVGピクトグラム集 + `hydrate()`、`TEAM_ICON_NAMES`、`forRole()`。**絵文字の代替**。 |
| `js/charts.js` | 自作SVGチャート（bar/hbar/line/pie/donut/radar）+ KPIカード。` ```chart ` / ` ```kpi ` を描画。 |
| `js/markdown.js` | 依存なし Markdown→HTML。エスケープ、表、チャート/KPIフェンス、画像（https限定）。`MD.toHtml/toText`。 |
| `js/providers.js` | AIプロバイダ抽象化。`AI.call`（Claude/OpenAI/Grok/Perplexity/Gemini/demo）、`listModels`、`estimateCost`、`PRICING`、使用量通知。 |
| `js/agents.js` | `NAME_POOL`（英語名）、`SYNTH_PROFILE`（Editor）、`avatarSVG()`（オーブ）、`buildLocalTeam()`。 |
| `js/sources.js` | 参考資料の取り込み（URL/txt/md/csv/json/html/xlsx/pdf）。`buildDigest()`、`listNames()`、`loadingCount()`。 |
| `js/firebase-config.js` | 公開Firebase設定（`window.FIREBASE_CONFIG`。web用の公開識別子）。 |
| `js/cloud.js` | Firebase Auth（メール/パス + Google popup）+ Firestore blob 保存。gstaticから動的 import。 |
| `js/auth.js` | アカウント暗号化（PBKDF2 31万回 + AES-GCM 256）。ローカル/クラウド両対応、**端末記憶ログイン**、同期ファイル入出力。 |
| `js/research.js` | 自律Web調査。`run()`、`findCompetitors()`、`deepDive()`、`extractCandidateNames()`。 |
| `js/history.js` | 分析履歴（localStorage）。`add/update/get/all`。 |
| `js/app.js` | **中核オーケストレーション**。state、`LEVELS`、`PROFILE_QUESTIONS`、設定/メニュー/プロフィールUI、`startAnalysis`、`runAgent`、`synthesize`、`renderUsage`、履歴UI、ダウンロード（PDF/HTML/MD/TXT）、`init`。 |
| `sw.js` | Service Worker。アプリシェルのキャッシュ優先、通知クリック処理。`CACHE_NAME` を**更新のたびに +1**。 |
| `manifest.webmanifest` | PWAマニフェスト。 |
| `vendor/` | `xlsx.full.min.js`、`pdf.min.js`、`pdf.worker.min.js`（資料取り込み用）。 |
| `icons/` | アプリアイコン（`icon.svg` はレーダー/成長線のロゴ。AI感を出さない指定）。 |

---

## 4. 設定・定数（要点）

- 分析レベル `LEVELS`（`js/app.js` 冒頭）:
  - Lv.1 クイック: `agents: 8`, `charts: 4`
  - Lv.2 スタンダード（既定）: `agents: 16`, `charts: 7`
  - Lv.3 ディープ: `agents: 28`, `charts: 12`
  - 各レベルで sourceChars / researchChars / tokens / instruction が異なる。
- `MAX_COMPETITORS = 20`（競合分析）。市場分析モードの個別深掘りは 8 社まで（外部プロキシ負荷対策）。
- プロバイダ既定モデル（`js/providers.js` `PROVIDERS`）:
  - claude: `claude-sonnet-5`（候補: `claude-opus-4-8` / `claude-haiku-4-5-20251001`）
  - openai: `gpt-4o`（/ `gpt-4o-mini`）
  - gemini: `gemini-flash-latest`（/ `gemini-pro-latest`）※旧 `gemini-2.5-flash` は新規ユーザー不可で404になった経緯あり
  - grok: `grok-3`（/ `grok-4`）
  - perplexity: `sonar`（/ `sonar-pro` / `sonar-reasoning` / `sonar-deep-research`。base `https://api.perplexity.ai`、出典URLを本文に付与）
  - demo: APIキー不要のダミー出力
- 設定の保存キー: `aml_settings_v1`（localStorage、ゲスト時は `keys:{}` を除外して平文を残さない）。

---

## 5. アカウント / データ保存 / 暗号化

- **暗号化**: パスワードから PBKDF2(SHA-256, 310,000回) で AES-GCM 256bit 鍵を導出し、設定（APIキー含む）を暗号化。
- **鍵の保持**: 復号鍵は **non-extractable な CryptoKey** のまま IndexedDB（`aml-keys`/`k`）に保管。**生鍵素材・パスワードは保存しない**。
- **ゲスト（未ログイン）**: APIキーは**メモリのみ**。ディスクに平文で残さない。
- **クラウド**: Firestore の `users/{uid}` に暗号化 blob を保存（E2E暗号化。運営者も中身を読めない）。ID→決定的ソルト（全端末で同じ鍵を導出するため）。
- **端末記憶ログイン**（毎回パスワード入力を廃止）:
  - `aml_remember_v1`(localStorage) + IndexedDB の鍵で、次回起動時に自動復元。
  - タブ単位（`aml_session_v1` / sessionStorage）と端末単位（localStorage）の二段構え。
  - `Auth.setRemember(bool)` / チェックボックス「この端末でログインを保持する」。ログアウトで全消去。
  - トレードオフ: 端末を開ける人は自動解錠される（＝共有端末では必ずログアウト）。UIに注意書きあり。
- **Googleログイン**: 本人確認はGoogleが担当。暗号鍵は別途「データ保護用パスワード」から導出（全端末共通）。理由 = E2E暗号のゼロ知識性を保つため（Googleは暗号鍵を渡してくれない）。
- 同期ファイル（暗号化のまま export/import）で端末間移行も可能。

---

## 6. セキュリティ（APIキー漏洩対策の現状）

実装済みの多層防御:
1. **CSP（`index.html` の meta）** — `connect-src` を必要ドメインのみに限定、`script-src` は `'unsafe-inline'` を許可しない。万一のスクリプト混入時もキーを外部送信できない。
   - connect-src 許可先: 各AI（anthropic/openai/x.ai/perplexity/generativelanguage）、調査（s.jina.ai / api.allorigins.win / ja.wikipedia.org / www.google.com）、Firebase（*.googleapis.com / *.firebaseio.com / *.firebaseapp.com）。
   - 同一オリジンは `'self'`。img-src は `https:`（Web画像引用のため）。
2. **キーの暗号化保存**（第5章）。
3. **Geminiキーはヘッダ送信**（`x-goog-api-key`。URLクエリに置かない＝履歴・ログ・Referer残留の防止）。他社は元々ヘッダ送信。
4. **Referrer-Policy**: `strict-origin-when-cross-origin`。
5. Markdownは全テキストをエスケープし生HTMLを通さない。リンクは http/https のみ、画像URLは https のみ。壊れた画像は委譲リスナーで非表示（インライン onerror を排除＝CSP両立）。

推奨（ユーザー側の作業。未対応でも動作はする）:
- **Firestore セキュリティルール**を owner-only に（`allow read, write: if request.auth.uid == uid`）。
- データ保護用パスワードは **12文字以上** 推奨。

---

## 7. 自律Web調査（`js/research.js`）

- 実際にブラウザから到達する先: `s.jina.ai`（検索リーダー）、`api.allorigins.win`（Google News RSS / Trends / Suggest をCORS回避で取得）、`ja.wikipedia.org`。
- `findCompetitors()`: 競合を**列挙**する専用検索（初回の一般調査の成否に依存しない）。
- `deepDive()`: 特定した各競合を1社ずつ個別調査（モードに応じ最大8〜20社、2〜4レーン並列）。
- `extractCandidateNames()`: AIが抽出できない時のヒューリスティック補完（番号付きリスト・「」・部分一致除去）。
- プライバシー: 調査ONのとき、テーマ/エリア等が上記の公開プロキシに送られる旨をUIに注記。OFFにすると通信先を絞れる。

---

## 8. レポート生成・ダウンロード

- `synthesize()` が 11章構成の戦略資料プロンプトで生成（KPIカード必須、グラフ最低 `LEVELS.charts` 個、競合比較表に全社掲載、出典明記、捏造禁止）。
- チャート記法: ` ```chart {json} ` と ` ```kpi {json} `（`js/charts.js` が描画）。type = bar/hbar/line/pie/donut/radar。
- 画像引用: 調査で得た**実在するhttps画像URLのみ** `![](url)` で引用（URL創作禁止）。
- ダウンロード: PDF（印刷ダイアログ経由の `standaloneHTML()`）/ HTML / Markdown / テキスト。ファイル名はASCII（`market-report_...`。日本語名だと「download」になる問題を回避）。
- 使用量表示 `renderUsage()`: 呼び出し回数・入出力トークン・概算コスト（USD/JPY）。2段階モードはプロバイダ別内訳も表示。

---

## 9. デプロイ / 運用ワークフロー

- 配信: **GitHub Pages（main ブランチ）**。
- 手順（このリポジトリの慣習）:
  ```
  # 開発ブランチで作業・コミット
  git push -u origin claude/multi-agent-market-analysis-vm9lif
  git checkout main
  git merge --ff-only claude/multi-agent-market-analysis-vm9lif
  git push origin main
  git checkout claude/multi-agent-market-analysis-vm9lif
  ```
- **Service Worker のキャッシュ更新を忘れない**: 変更をデプロイするたび `sw.js` の `CACHE_NAME`（現在 `aml-cache-v33`）を +1 する。しないと利用者に旧ファイルが残る。
- 反映後、PWAは「完全終了→再起動」または再インストール、ブラウザは再読み込みで反映。GitHub Pages反映に1〜2分。
- コミットメッセージ末尾のトレーラ（このセッションで使用）:
  ```
  Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01E2g9x95svxtwPtq8H8EavM
  ```

---

## 10. テスト方針

- Playwright（chromium: `/opt/pw-browsers/chromium`）で実機検証。ローカルは `python3 -m http.server 8765`。
- クラウド非依存のテストは、`js/firebase-config.js` を `window.FIREBASE_CONFIG=null` に route mock し、`serviceWorkers: 'block'` のコンテキストで実行（SWの旧キャッシュ干渉を避ける）。
- `window.AI.call` をスタブ化すると、外部通信なしで分析フロー全体を検証できる（provider振り分け・使用量・描画）。
- デモモード（provider=demo, キー不要, autoResearch OFF）でエンドツーエンドのスモークが可能。

---

## 11. 既知の制約 / 設計トレードオフ（意図的に許容）

- **Vercel（環境変数キー）方式は一度実装→撤去**。理由: コスト懸念。GitHub Pages（キーはアプリ入力＋暗号化）に戻した。→ 第13章参照。復活させる場合の設計メモも記載。
- 自律調査の公開プロキシ（allorigins/jina）は CSP connect-src に含む（機能上必須）。開放型プロキシのため理論上は悪用経路になり得るが、スクリプト注入自体をCSP＋エスケープで塞いでいるため実害リスクは低い、と判断。
- レート制限は未実装（ローカル完結のため各ユーザーのキー・課金に限定される）。
- Firestore の決定的ソルト、オーブアニメの負荷（`prefers-reduced-motion` で緩和）は許容。
- Vercel関数の実行時間上限（撤去済みだが再導入時の注意）: Hobby 60秒 / Pro 300秒。長い統合はタイムアウトし得る。

---

## 12. これまでの主要な意思決定・変更履歴（新しい順・要点）

- `db350e7` **Vercelサーバー中継を撤去** しGitHub Pages専用へ（コスト回避）。セキュリティ強化は維持。
- `b2a9eab` （撤去済み）Vercel環境変数キーのサーバー中継を実装（`/api/chat`・`/api/config`・jose でIDトークン検証）。
- `dad5ada` **APIキー漏洩対策**: CSP導入、Geminiキーのヘッダ化、Referrer-Policy、画像onerrorの委譲化、テーマ初期化の外部化。
- `f88f6c7` **端末記憶ログイン**（毎回のパスワード入力を廃止）。
- `806f1a6` **2段階モード**（調査AIと戦略AIの分離）。
- `d23e5a9` PWAのステータスバー重なり修正（セーフエリア上余白）。
- `8daf3f9` 詳細監査での不具合・セキュリティ課題を一括修正。
- `cae156c` 多店舗の競合分析が1社に偏る問題を改善（列挙専用検索・全社横比較の強制）。
- `3d8aaa3` ファビコン更新・Editorカード背景を白に。
- `6bbb316` ブランド刷新（AML）＋雲の上のSF背景アニメ。
- `b2a085a` 自社情報の複数登録＋競合分析でメイン選択。
- `1c42166` 競合特定を最大20社に拡大＋トップへ戻るボタン。

---

## 13. 参考: Vercel環境変数キー方式（撤去済みだが将来オプション）

ユーザーが「アプリにキーを打ち込まず、環境変数で管理」を検討した際に一度実装し、**コスト懸念で撤去**した。再導入する場合の設計:
- Vercelに移行（静的 + `/api` サーバー関数）。GitHub Pagesはサーバー関数不可。
- `/api/chat`: FirebaseのIDトークンを検証（`jose` で JWKS 検証、issuer/audience = projectId）し、**ログイン済みユーザーのみ**が環境変数キーでAIを呼べる中継口。応答は `{text, usage}` に正規化。
- `/api/config`: どのプロバイダにサーバーキーがあるか**真偽値のみ**返す。
- クライアントはハイブリッド: 個人キーがあれば直接、無ければ `/api/chat` 経由。`/api` が無い環境（GitHub Pages）では自動フォールバック。
- 環境変数名: `FIREBASE_PROJECT_ID`（必須）、`ANTHROPIC_API_KEY` / `OPENAI_API_KEY` / `GEMINI_API_KEY` / `XAI_API_KEY` / `PERPLEXITY_API_KEY`。
- 注意: 環境変数キー = オーナーの共有キー（課金はオーナー）。ログイン必須ゲート＋（必要なら）レート制限が前提。Hobby無料枠だが商用はPro、AI応答待ち時間も関数実行時間に計上される。

---

## 14. 新セッションが最初にやること（チェックリスト）

1. このノートと `README.md` を読む。
2. `git branch` を確認し、開発は `claude/multi-agent-market-analysis-vm9lif`（または指定ブランチ）で行う。
3. 変更したら **`sw.js` の `CACHE_NAME` を +1**。
4. Playwrightでスモーク（firebase-config を null にmock、SWブロック、必要なら `AI.call` をスタブ）。
5. 第9章の手順で main に ff-merge して GitHub Pages へ反映。
6. **絵文字禁止・捏造禁止・多競合・強固なキー保護**の原則を必ず守る。
