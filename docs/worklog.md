---
tags: [claude-code, worklog, AML]
project: Agent Market Lab (AML)
repo: studiotsuzuri25-debug/marketing
---

# Claude Code 作業ログ（AML）

> このファイルは、ユーザーの「作業ログに記録」要望を受けて Claude Code が追記する作業ログです。
> セッションが変わった際は、新しいセッションがまずこのファイルを読んで引き継ぎます。
> 最新のエントリが上に来る**新しい順**で記録します。運用ルールはリポジトリ直下の `CLAUDE.md` を参照。

---

## 2026-07-16 07:46 (UTC) — Obsidian連携を取りやめ、リポジトリ内の作業ログに一本化

- ユーザー判断により Obsidian連携は見送り。Obsidian固有ファイル（`docs/obsidian/README.md`）を削除。
- 作業ログを `docs/obsidian/worklog.md` → `docs/worklog.md` へ移動し、Obsidianの記述を除去。
- `CLAUDE.md` を更新: 記録トリガーを「作業ログに記録：…」に変更（→ `docs/worklog.md`）。
  セッション開始時の引き継ぎは `docs/worklog.md` + `docs/HANDOFF.md` を読む運用は維持。
- 結果: **リポジトリ内だけで完結するセッション引き継ぎ**（記録→次セッションが読む）が有効。

## 2026-07-16 06:24 (UTC) — Obsidian連携（Gitブリッジ）を構築 + 引き継ぎノート作成

- `docs/HANDOFF.md` を作成（ツール全体像・設計・運用・履歴の引き継ぎ資料）。
- Obsidian自動記述の仕組みを **Gitブリッジ方式** で構築（Web/ローカルどちらのClaude Codeからでも動作）。
  - 本ログ `docs/obsidian/worklog.md` と `docs/obsidian/README.md`、運用ルール `CLAUDE.md` を追加。
  - ユーザーが「Obsidianに記録：…」と指示すると、このファイルへ追記して push する運用。
- 補足: この環境（Web/クラウドのClaude Code）からは**ローカルのObsidian MCPには到達不可**のため、
  Gitブリッジ（リポジトリ→Obsidian取り込み）で自動反映する構成を採用。

## これまでのセッションの主な成果（AMLツール）

- マルチAIエージェント並列市場分析ツール（バニラJS静的SPA + PWA）を構築し GitHub Pages で配信。
- 主な機能: 2分析モード（市場分析／自社と競合）、最大28体の並列エージェント、統合役Editor、
  自律Web調査（検索・実店舗・SNS・口コミ）、参考資料取り込み（URL/CSV/Excel/PDF等）、
  レポートのグラフ/表/KPI/画像引用、PDF/HTML/MD/TXTダウンロード、履歴、使用量表示。
- アカウント/同期: Firebase Auth（メール/パス + Google）+ Firestore（E2E暗号化）。
- セキュリティ: APIキーを AES-256 + PBKDF2 で暗号化、非取り出し鍵をIndexedDB保持、
  CSP導入、Geminiキーのヘッダ化、Referrer-Policy、端末記憶ログイン（毎回のパスワード入力を廃止）。
- 2段階モード（調査=Perplexity → 戦略=Claude など、工程別にAIを分離）。
- Vercel環境変数キー方式は一度実装→**コスト懸念で撤去**（GitHub Pages維持）。詳細は HANDOFF.md 第13章。
