/* アカウントと設定の暗号化保存 — WebCrypto (PBKDF2 310,000回 + AES-GCM 256bit)
   - パスワードから導出した鍵で設定(APIキー含む)を暗号化してlocalStorageに保存
   - 平文のパスワードや鍵そのものは保存しない
   - 暗号化済みアカウントデータは同期ファイルとして書き出し/読み込みでき、
     別端末でも同じID・パスワードでログインすれば同じ設定が使える */
(function () {
  'use strict';

  const STORE_KEY = 'aml_accounts_v1';
  const SESSION_KEY = 'aml_session_v1';
  const PBKDF2_ITERATIONS = 310000;
  const CHECK_PLAINTEXT = 'aml-password-check-v1';

  let currentId = null;
  let currentKey = null; // CryptoKey（メモリ上のみ）

  function cloudEnabled() {
    return !!(window.Cloud && window.Cloud.isConfigured());
  }

  /* クラウドモードでは全端末で同じ鍵を導出できるよう、IDから決定的にソルトを生成 */
  async function saltFromId(id) {
    const digest = await crypto.subtle.digest('SHA-256', enc.encode('aml-cloud-salt-v1:' + id));
    return new Uint8Array(digest).slice(0, 16);
  }

  const enc = new TextEncoder();
  const dec = new TextDecoder();

  function b64(buf) {
    return btoa(String.fromCharCode.apply(null, new Uint8Array(buf)));
  }
  function unb64(s) {
    const bin = atob(s);
    const arr = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    return arr;
  }

  function loadStore() {
    try { return JSON.parse(localStorage.getItem(STORE_KEY)) || {}; } catch (e) { return {}; }
  }
  function saveStore(store) {
    localStorage.setItem(STORE_KEY, JSON.stringify(store));
  }

  async function deriveKey(password, saltBytes, extractable) {
    const base = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveKey']);
    return crypto.subtle.deriveKey(
      { name: 'PBKDF2', salt: saltBytes, iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
      base,
      { name: 'AES-GCM', length: 256 },
      !!extractable,
      ['encrypt', 'decrypt']
    );
  }

  async function encrypt(key, text) {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: iv }, key, enc.encode(text));
    return { iv: b64(iv), ct: b64(ct) };
  }

  async function decrypt(key, box) {
    const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(box.iv) }, key, unb64(box.ct));
    return dec.decode(pt);
  }

  function normalizeId(id) {
    return String(id || '').trim().toLowerCase();
  }

  function validate(id, password) {
    if (!/^[a-z0-9_.@-]{3,64}$/.test(id)) {
      throw new Error('IDは3文字以上の半角英数字（. _ - @ 使用可）で入力してください。');
    }
    if (String(password).length < 8) {
      throw new Error('パスワードは8文字以上にしてください。');
    }
  }

  async function register(id, password, initialSettings) {
    id = normalizeId(id);
    validate(id, password);

    if (cloudEnabled()) {
      await window.Cloud.register(id, password); // 既存IDはここで弾かれる
      const key = await deriveKey(password, await saltFromId(id), true);
      currentId = id;
      currentKey = key;
      const data = await encrypt(key, JSON.stringify(initialSettings || {}));
      await window.Cloud.saveBlob({ v: 1, data: data });
      await persistSession(password, id);
      return id;
    }

    const store = loadStore();
    if (store[id]) throw new Error('このIDはこの端末で既に登録されています。ログインしてください。');
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const key = await deriveKey(password, salt, true);
    const check = await encrypt(key, CHECK_PLAINTEXT);
    const data = await encrypt(key, JSON.stringify(initialSettings || {}));
    store[id] = { v: 1, salt: b64(salt), check: check, data: data, updated: new Date().toISOString() };
    saveStore(store);
    currentId = id;
    currentKey = key;
    await persistSession(password, id);
    return id;
  }

  async function login(id, password) {
    id = normalizeId(id);

    if (cloudEnabled()) {
      await window.Cloud.login(id, password); // ID/パスワードの検証はFirebase側で実施
      const key = await deriveKey(password, await saltFromId(id), true);
      currentId = id;
      currentKey = key;
      await persistSession(password, id);
      return id;
    }

    const store = loadStore();
    const rec = store[id];
    if (!rec) throw new Error('このIDはこの端末に見つかりません。新規登録するか、同期ファイルを読み込んでください。');
    const key = await deriveKey(password, unb64(rec.salt), true);
    try {
      const check = await decrypt(key, rec.check);
      if (check !== CHECK_PLAINTEXT) throw new Error('bad');
    } catch (e) {
      throw new Error('パスワードが違います。');
    }
    currentId = id;
    currentKey = key;
    await persistSession(password, id);
    return id;
  }

  /* タブを閉じるまでログイン状態を維持（sessionStorageに鍵素材を保持。恒久保存はしない） */
  async function persistSession(password, id) {
    try {
      const jwk = await crypto.subtle.exportKey('jwk', currentKey);
      sessionStorage.setItem(SESSION_KEY, JSON.stringify({ id: id, jwk: jwk }));
    } catch (e) { /* セッション維持は任意機能 */ }
  }

  async function resumeSession() {
    try {
      const raw = sessionStorage.getItem(SESSION_KEY);
      if (!raw) return null;
      const s = JSON.parse(raw);
      if (cloudEnabled()) {
        const user = await window.Cloud.waitUser();
        if (!user) { sessionStorage.removeItem(SESSION_KEY); return null; }
      } else {
        const store = loadStore();
        if (!store[s.id]) return null;
      }
      currentKey = await crypto.subtle.importKey('jwk', s.jwk, { name: 'AES-GCM' }, true, ['encrypt', 'decrypt']);
      currentId = s.id;
      return s.id;
    } catch (e) {
      return null;
    }
  }

  function logout() {
    currentId = null;
    currentKey = null;
    sessionStorage.removeItem(SESSION_KEY);
    if (cloudEnabled()) window.Cloud.logout();
  }

  async function saveSettings(settings) {
    if (!currentId || !currentKey) throw new Error('ログインしていません。');
    if (cloudEnabled()) {
      const data = await encrypt(currentKey, JSON.stringify(settings));
      await window.Cloud.saveBlob({ v: 1, data: data });
      return;
    }
    const store = loadStore();
    const rec = store[currentId];
    if (!rec) throw new Error('アカウントが見つかりません。');
    rec.data = await encrypt(currentKey, JSON.stringify(settings));
    rec.updated = new Date().toISOString();
    saveStore(store);
  }

  async function loadSettings() {
    if (!currentId || !currentKey) return null;
    if (cloudEnabled()) {
      const box = await window.Cloud.loadBlob();
      if (!box || !box.data) return null;
      try {
        return JSON.parse(await decrypt(currentKey, box.data));
      } catch (e) {
        throw new Error('クラウド上の設定を復号できませんでした。パスワードが変更された可能性があります。');
      }
    }
    const store = loadStore();
    const rec = store[currentId];
    if (!rec) return null;
    try {
      return JSON.parse(await decrypt(currentKey, rec.data));
    } catch (e) {
      return null;
    }
  }

  /* 同期ファイル（暗号化されたまま書き出す。中身の復号にはID+パスワードが必要） */
  function exportFile() {
    if (!currentId) throw new Error('ログインしていません。');
    const store = loadStore();
    return JSON.stringify({ app: 'agent-market-lab', kind: 'sync', v: 1, id: currentId, account: store[currentId] }, null, 2);
  }

  function importFile(text) {
    let obj;
    try { obj = JSON.parse(text); } catch (e) { throw new Error('同期ファイルの形式が正しくありません。'); }
    if (!obj || obj.app !== 'agent-market-lab' || obj.kind !== 'sync' || !obj.id || !obj.account) {
      throw new Error('このアプリの同期ファイルではありません。');
    }
    const store = loadStore();
    store[obj.id] = obj.account;
    saveStore(store);
    return obj.id;
  }

  window.Auth = {
    isCloud: cloudEnabled,
    register: register,
    login: login,
    logout: logout,
    resumeSession: resumeSession,
    saveSettings: saveSettings,
    loadSettings: loadSettings,
    exportFile: exportFile,
    importFile: importFile,
    isLoggedIn: function () { return !!currentId; },
    currentId: function () { return currentId; },
  };
})();
