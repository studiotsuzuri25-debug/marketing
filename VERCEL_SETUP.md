# Vercel デプロイ手順（APIキーを環境変数で隠す）

このアプリは「静的フロントエンド + Vercelサーバー関数（`/api`）」で動きます。
サーバー関数がAPIキーを**環境変数から読み**、各AIへ中継するため、**キーはブラウザに一切出ません**。

サーバー関数は **Firebaseのログインを必須** にしています（ログイン済みユーザーだけがサーバーのキーを使えます）。

---

## 1. Vercelにインポート

1. https://vercel.com にGitHubでログイン
2. 「Add New… → Project」→ このリポジトリ（`marketing`）を選択
3. Framework Preset は **Other**（自動検出でOK）。Root Directory はそのまま。
4. まだ Deploy は押さず、次の「環境変数」を設定します。

## 2. 環境変数（Environment Variables）を登録

Vercel のプロジェクト → **Settings → Environment Variables** に、以下を登録します。
（Production / Preview / Development すべてにチェックを入れておくと安全です）

### 必須（ログイン検証用）

| 変数名 | 値 |
|---|---|
| `FIREBASE_PROJECT_ID` | FirebaseのプロジェクトID（`js/firebase-config.js` の `projectId` と同じ文字列） |

### 使いたいAIのぶんだけ登録（少なくとも1つ）

| 変数名 | 対応AI | キーの取得先 |
|---|---|---|
| `ANTHROPIC_API_KEY` | Claude | https://console.anthropic.com/ |
| `OPENAI_API_KEY` | ChatGPT | https://platform.openai.com/api-keys |
| `GEMINI_API_KEY` | Gemini | https://aistudio.google.com/apikey |
| `XAI_API_KEY` | Grok | https://console.x.ai/ |
| `PERPLEXITY_API_KEY` | Perplexity | https://www.perplexity.ai/settings/api |

> 登録したAIだけが「サーバーキー利用可」になります。未登録のAIは、従来どおりアプリ内でご自身のキーを入力すれば使えます。

## 3. デプロイ

「Deploy」を押します。完了後、割り当てられたURL（例: `https://xxxx.vercel.app`）を開きます。

## 4. Firebaseに承認ドメインを追加（Googleログインを使う場合）

Firebase Console → **Authentication → Settings → 承認済みドメイン** に、Vercelのドメイン
（`xxxx.vercel.app` や独自ドメイン）を追加してください。追加しないとGoogleログインが弾かれます。

## 5. 動作確認

1. アプリを開き、右上からログイン（またはGoogleログイン）
2. 設定を開くと、環境変数を登録したAIに「**サーバーにキーが登録済み**」と表示されます
3. APIキー欄は**空欄のまま**分析を開始できます（サーバーのキーで動作）

---

## 仕組みと安全性

- ブラウザ → `/api/chat`（同一オリジン）→ 各AI。**キーはサーバー内だけ**で使われ、応答にもログにも含めません。
- `/api/chat` は `Authorization: Bearer <FirebaseIDトークン>` を検証し、未ログインは拒否します。
- アプリ内でご自身のキーを入力した場合のみ、従来どおりブラウザから直接そのAIを呼びます（その人の課金）。
- `/api/config` は「どのAIにサーバーキーがあるか」の真偽値だけを返し、キーの値は返しません。

## 注意・制限

- **課金は環境変数キーの持ち主（あなた）に発生**します。ログイン必須にしていますが、登録ユーザーが増えると使用量も増えます。必要なら Firebase の登録を絞ってください。
- Vercelの関数実行時間は Hobbyプランで最大60秒、Proプランで最大300秒です。非常に長い分析（Lv.3の大規模統合など）はタイムアウトすることがあります。その場合はレベルを下げるか、Proプランをご検討ください。
- レート制限（1ユーザーあたりの回数制限）は未実装です。必要になったら Vercel KV などで追加できます。

## GitHub Pages でも使えます

`/api` が無い環境（GitHub Pages など）では、サーバーモードは自動的に無効になり、
従来どおり「アプリにキーを入力（暗号化保存）」して動作します。どちらのホスティングでも壊れません。
