# Obsidian 連携（Gitブリッジ）

Claude Code の作業記録を **Gitリポジトリ経由で Obsidian に自動反映**するための仕組みです。
このフォルダ（`docs/obsidian/`）の Markdown を、あなたの Obsidian が取り込めるようにします。

## 仕組み

```
Claude Code（Web/ローカル）
   │  「Obsidianに記録：…」の指示を受ける
   ▼
docs/obsidian/worklog.md に追記 → git commit → git push（main）
   │
   ▼
あなたの Obsidian が git pull（自動 or 手動）で取り込み → ノートに反映
```

この環境（Web/クラウドの Claude Code）からは、あなたのPC上で動く Obsidian の
ローカルMCPには直接書き込めません。そこで **リポジトリを中継**して反映します。

## Obsidian 側の設定（いずれか1つ）

### 方法A: 保管庫に「Obsidian Git」プラグインを入れて自動 pull（おすすめ）

1. このリポジトリをローカルにクローン
   `git clone https://github.com/studiotsuzuri25-debug/marketing.git`
2. Obsidian で「フォルダを保管庫として開く」→ クローンした中の `docs/obsidian` を選択
   （このフォルダだけを保管庫にする。コード全体を保管庫にしたくない場合に最適）
3. コミュニティプラグイン **Obsidian Git** をインストール
4. 設定で「Pull on startup」＋「Auto pull interval（例: 10分）」を有効化
   → 以降、Claude Code が push すると自動でノートに反映されます

### 方法B: 既存の保管庫の「Claude code」フォルダにシンボリックリンク

既存の Obsidian 保管庫の中から、このフォルダを参照させる方法です。

- macOS / Linux:
  ```
  ln -s /path/to/marketing/docs/obsidian "/path/to/ObsidianVault/Claude code/AML"
  ```
- Windows（管理者PowerShell）:
  ```
  New-Item -ItemType SymbolicLink -Path "C:\path\to\ObsidianVault\Claude code\AML" -Target "C:\path\to\marketing\docs\obsidian"
  ```
- 反映は、クローンしたリポジトリで定期的に `git pull`（cron/タスクスケジューラ、または Obsidian Git）を実行。

## 使い方（記録の出し方）

Claude Code のチャットで、次のように指示してください（`CLAUDE.md` に運用ルールを記載済み）:

- `Obsidianに記録：<タイトル>` … 本文を続けて書くと `worklog.md` に日時付きで追記します。
- `Obsidianに記録(ファイル名.md)：…` … このフォルダ内の別ファイルを指定して追記できます。

Claude Code は追記後、`main` へ push します。あなたの Obsidian が pull すれば反映されます。
