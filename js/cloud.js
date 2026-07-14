/* クラウド同期レイヤ — Firebase Authentication + Firestore
   設定(js/firebase-config.js)がある場合のみ有効。SDKは必要時に動的読み込み。
   保存されるのは端末側で暗号化済みのデータのみ（エンドツーエンド暗号化） */
(function () {
  'use strict';

  const SDK_VERSION = '11.6.1';
  const EMAIL_DOMAIN = '@aml-users.example.com'; // IDをFirebase用の擬似メールに変換

  let mods = null;
  let app = null;
  let auth = null;
  let db = null;
  let readyPromise = null;

  function isConfigured() {
    return !!window.FIREBASE_CONFIG;
  }

  function init() {
    if (!isConfigured()) return Promise.resolve(false);
    if (!readyPromise) {
      const base = 'https://www.gstatic.com/firebasejs/' + SDK_VERSION + '/';
      readyPromise = Promise.all([
        import(base + 'firebase-app.js'),
        import(base + 'firebase-auth.js'),
        import(base + 'firebase-firestore.js'),
      ]).then(function (m) {
        mods = { app: m[0], auth: m[1], fs: m[2] };
        app = mods.app.initializeApp(window.FIREBASE_CONFIG);
        auth = mods.auth.getAuth(app);
        db = mods.fs.getFirestore(app);
        return true;
      }).catch(function (e) {
        readyPromise = null;
        throw new Error('クラウド同期の初期化に失敗しました（ネットワークとFirebase設定を確認してください）: ' + (e.message || e));
      });
    }
    return readyPromise;
  }

  function toEmail(id) {
    return id + EMAIL_DOMAIN;
  }

  function translateError(e) {
    const code = (e && e.code) || '';
    if (code.indexOf('email-already-in-use') !== -1) return new Error('このIDは既に登録されています。ログインしてください。');
    if (code.indexOf('invalid-credential') !== -1 || code.indexOf('wrong-password') !== -1 || code.indexOf('user-not-found') !== -1) {
      return new Error('IDまたはパスワードが違います。');
    }
    if (code.indexOf('weak-password') !== -1) return new Error('パスワードが弱すぎます。より長く複雑にしてください。');
    if (code.indexOf('too-many-requests') !== -1) return new Error('試行回数が多すぎます。しばらく待ってから再試行してください。');
    if (code.indexOf('network-request-failed') !== -1) return new Error('ネットワークに接続できません。通信環境を確認してください。');
    return new Error('クラウド認証エラー: ' + (e.message || e));
  }

  async function register(id, password) {
    await init();
    try {
      const cred = await mods.auth.createUserWithEmailAndPassword(auth, toEmail(id), password);
      return cred.user.uid;
    } catch (e) {
      throw translateError(e);
    }
  }

  async function login(id, password) {
    await init();
    try {
      const cred = await mods.auth.signInWithEmailAndPassword(auth, toEmail(id), password);
      return cred.user.uid;
    } catch (e) {
      throw translateError(e);
    }
  }

  async function logout() {
    if (!auth) return;
    try { await mods.auth.signOut(auth); } catch (e) { /* 無視 */ }
  }

  /* ページ読込直後の認証状態復元を待って、サインイン中ユーザーを返す */
  function waitUser() {
    return init().then(function (ok) {
      if (!ok) return null;
      return new Promise(function (resolve) {
        const unsub = mods.auth.onAuthStateChanged(auth, function (user) {
          unsub();
          resolve(user || null);
        });
      });
    });
  }

  /* 暗号化済みブロブの保存・読込（users/{uid} ドキュメント） */
  async function saveBlob(box) {
    await init();
    const user = auth.currentUser;
    if (!user) throw new Error('クラウドにサインインしていません。');
    await mods.fs.setDoc(mods.fs.doc(db, 'users', user.uid), {
      data: JSON.stringify(box),
      updated: mods.fs.serverTimestamp(),
    });
  }

  async function loadBlob() {
    await init();
    const user = auth.currentUser;
    if (!user) return null;
    const snap = await mods.fs.getDoc(mods.fs.doc(db, 'users', user.uid));
    if (!snap.exists()) return null;
    try { return JSON.parse(snap.data().data); } catch (e) { return null; }
  }

  window.Cloud = {
    isConfigured: isConfigured,
    init: init,
    register: register,
    login: login,
    logout: logout,
    waitUser: waitUser,
    saveBlob: saveBlob,
    loadBlob: loadBlob,
  };
})();
