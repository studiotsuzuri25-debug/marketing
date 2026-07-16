/* GET /api/config — どのプロバイダにサーバーキー(環境変数)が登録済みかを真偽値で返す。
   秘密情報（キーそのもの）は一切返さない。クライアントは空欄でもそのプロバイダを使えるか判断する。 */
import { configuredProviders } from './_lib.js';

export default function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.status(200).json({ serverMode: true, providers: configuredProviders() });
}
