# CLAUDE.md — このリポジトリでの Claude Code 運用ルール

このファイルは Claude Code が自動で読み込む指示書です。作業前に必ず `docs/HANDOFF.md`（ツールの全体像・設計・履歴）にも目を通してください。

## セッション開始時の引き継ぎ（最初に必ず実施）

新しいセッションは、作業を始める前に次を読んで前任セッションの内容を引き継ぐこと。
1. `docs/obsidian/worklog.md` … 直近の作業ログ（新しい順）。**まずここで最新の状況を把握する。**
2. `docs/HANDOFF.md` … ツールの全体像・設計・運用・履歴。
3. 必要に応じて `git log --oneline -15` で最近の変更を確認する。
引き継ぎ後、ユーザーへ「前回までの状況」を1〜3行で要約してから作業に入るとよい。

## プロジェクト概要
- Agent Market Lab（AML）: マルチAIエージェント市場分析ツール。バニラJSの静的SPA + PWA。GitHub Pages配信。
- 開発ブランチ: `claude/multi-agent-market-analysis-vm9lif` → `main` に ff-merge で反映。
- 詳細は `docs/HANDOFF.md` を参照。

## 絶対に守るルール
- **絵文字を一切使わない**（UIもコードもドキュメントも）。アイコンは SVG ピクトグラムのみ。
- **虚偽・捏造の禁止**: 確認できない数値は「推定」「未確認」と明記。架空の統計・出典を作らない。
- 競合分析は**複数社を個別に**（1社に偏らせない。最大20社）。
- APIキーは常に**暗号化・秘匿**を維持（平文でディスクに残さない、URLに載せない、ログに出さない）。
- コードを変更してデプロイするときは **`sw.js` の `CACHE_NAME` を必ず +1**。

## デプロイ手順
```
git push -u origin claude/multi-agent-market-analysis-vm9lif
git checkout main && git merge --ff-only claude/multi-agent-market-analysis-vm9lif
git push origin main
git checkout claude/multi-agent-market-analysis-vm9lif
```

## Obsidian への作業記録（Gitブリッジ自動化）

ユーザーが以下の形式で指示したら、**自動で Obsidian 連携ファイルへ追記して push** すること。
（この環境からローカルの Obsidian MCP へは書けないため、リポジトリ経由で反映する。詳細 `docs/obsidian/README.md`）

### トリガー
- `Obsidianに記録：<本文>` … 既定ファイル `docs/obsidian/worklog.md` に追記。
- `Obsidianに記録(<ファイル名>.md)：<本文>` … `docs/obsidian/<ファイル名>.md` に追記（無ければ新規作成）。
- 「Obsidianに」「作業ログに残して」等の同義の依頼も同様に扱う。

### 追記の手順
1. 対象ファイル（既定は `docs/obsidian/worklog.md`）を開く。
2. 見出し直下（**新しい順**）に、次の形式でエントリを追記する:
   ```
   ## YYYY-MM-DD HH:MM (TZ) — <タイトル>

   - <箇条書きで内容>
   ```
   日時は Bash の `date "+%Y-%m-%d %H:%M (%Z)"` で取得する（推測しない）。
3. `git add` → コミット（例メッセージ: `Obsidian: 作業ログを追記`）→ 現在の作業ブランチへ push。
   ユーザーが「mainにも反映」を望む場合や、他の変更と同様の運用が自然な場合は ff-merge で main にも反映する。
4. 追記した内容の要点だけを短く報告する（ファイル全文の貼り付けは不要）。

### 注意
- 記録専用の依頼のときは、コードには手を触れない（`sw.js` の更新も不要）。
- ユーザーが対象ファイルを指定した場合はそれを優先する。
