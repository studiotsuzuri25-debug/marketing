/* ============================================================
   クラウド同期（Firebase）の設定
   ============================================================
   ここにFirebaseプロジェクトの設定を貼り付けると、
   「同じID・パスワードでどの端末からでも利用できる」クラウドアカウントが有効になります。
   設定手順はREADMEの「クラウド同期のセットアップ」を参照してください。

   null のままの場合は、この端末内のみのローカルアカウント＋同期ファイル方式で動作します。
*/
window.FIREBASE_CONFIG = {
  apiKey: "AIzaSyCWLbYVhhAWqoG3HTs-8WYyCTjhvpA8C0U",
  authDomain: "market-analytics-4768f.firebaseapp.com",
  projectId: "market-analytics-4768f",
  storageBucket: "market-analytics-4768f.firebasestorage.app",
  messagingSenderId: "226654207297",
  appId: "1:226654207297:web:0025442afc6eaf2a54b5c0",
  measurementId: "G-64BKCWVRYB"
};

/* 貼り付け例（Firebaseコンソール → プロジェクトの設定 → マイアプリ からコピー）:
window.FIREBASE_CONFIG = {
  apiKey: "AIzaSyXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX",
  authDomain: "your-project.firebaseapp.com",
  projectId: "your-project",
  storageBucket: "your-project.firebasestorage.app",
  messagingSenderId: "000000000000",
  appId: "1:000000000000:web:xxxxxxxxxxxxxxxxxxxxxx"
};
*/
