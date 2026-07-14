/* 分析履歴 — 完成した分析（資料＋全エージェントの報告）を端末に保存し、後から再表示する */
(function () {
  'use strict';

  const KEY = 'aml_history_v1';
  const MAX_ENTRIES = 30;

  function all() {
    try { return JSON.parse(localStorage.getItem(KEY)) || []; } catch (e) { return []; }
  }

  /* 容量超過時は古い履歴から順に削って保存を試みる */
  function persist(list) {
    for (;;) {
      try {
        localStorage.setItem(KEY, JSON.stringify(list));
        return true;
      } catch (e) {
        if (!list.length) return false;
        list.pop(); // 末尾＝最も古い履歴
      }
    }
  }

  function add(entry) {
    const list = all();
    entry.id = 'h' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
    entry.ts = Date.now();
    list.unshift(entry);
    if (list.length > MAX_ENTRIES) list.length = MAX_ENTRIES;
    persist(list);
    return entry.id;
  }

  function update(id, patch) {
    const list = all();
    const i = list.findIndex(function (e) { return e.id === id; });
    if (i === -1) return false;
    const ts = list[i].ts;
    Object.assign(list[i], patch);
    list[i].ts = ts;
    list[i].updated = Date.now();
    return persist(list);
  }

  function get(id) {
    return all().find(function (e) { return e.id === id; }) || null;
  }

  function remove(id) {
    persist(all().filter(function (e) { return e.id !== id; }));
  }

  function clear() {
    localStorage.removeItem(KEY);
  }

  window.RunHistory = { all: all, add: add, update: update, get: get, remove: remove, clear: clear };
})();
