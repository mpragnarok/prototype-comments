// test/mock-firebase.js — in-memory Firebase mock for e2e（不連真 Firebase / 無網路）
//
// 用法（e2e / browser context）：
//   import { createMockFirebase } from '../test/mock-firebase.js';
//   const mockFb = createMockFirebase({ user: {...}, comments: [...] });
//   await initPrototypeComments({ projectId, getScreenId, ..., _firebase: mockFb });
//   mockFb.__setUser(user)   // 模擬登入/登出
//   mockFb.__seed(comment)   // 注入一筆留言並觸發 onSnapshot
//
// 對應 src/index.js loadFirebase() 回傳的 surface + store.js 用到的方法。

let idSeq = 0;

export function createMockFirebase(initial = {}) {
  const state = {
    docs: new Map(),          // id -> data
    snapListeners: new Set(), // onSnapshot callbacks
    authListeners: new Set(), // onAuthStateChanged callbacks
    user: initial.user || null,
    redirectCalls: 0,
    popupCalls: 0,
    // 匿名登入也要記次數：`auth: 'host'` 的合約是「絕不自己發起登入」，
    // 而匿名登入正是它最容易不小心退回去走的那一條——沒有這個計數，
    // 那條合約在測試裡驗不到（畫面看起來一模一樣，只有 uid 悄悄變成匿名的）。
    anonCalls: 0,
    apps: [],                 // { name, options } — 見下方 app 區塊
  };
  (initial.comments || []).forEach(c => {
    const id = c.id || `m${++idSeq}`;
    const { id: _omit, ...data } = c;
    state.docs.set(id, data);
  });

  // where 是真的會篩的。放行等於讓「換頁沒重新訂閱」這種 bug 在測試裡全綠：
  // 訂閱條件錯了照樣拿到全部文件，畫面看起來對，線上才發現前一頁的標記沒消失。
  const matches = (data, clauses) => clauses.every(({ field, op, value }) => {
    if (op === '==') return data[field] === value;
    if (op === '!=') return data[field] !== value;
    throw new Error(`mock-firebase: 還沒實作的 where 運算子「${op}」`);
  });
  const docsArray = (clauses = []) => [...state.docs.entries()]
    .filter(([, data]) => matches(data, clauses))
    .map(([id, data]) => ({ id, data: () => ({ ...data }) }));
  const emitSnap = () => state.snapListeners.forEach(l => { l.cb({ docs: docsArray(l.clauses) }); });
  const emitAuth = () => state.authListeners.forEach(cb => { cb(state.user); });

  return {
    // ─ app ─
    // 真的維護一份 app 註冊表（而不是永遠回空）：user-feedback 用**具名** app 來避開
    // 頁面既有的預設 app，沒有 name / options 的話那條路徑在測試裡完全無法驗證，
    // 「傳了 firebaseConfig 卻被別人的 app 蓋掉」這種 bug 就永遠擋不下來。
    getApps: () => [...state.apps],
    getApp: (name = '[DEFAULT]') => {
      const found = state.apps.find(a => a.name === name);
      if (!found) throw new Error(`No Firebase App '${name}' has been created`);
      return found;
    },
    initializeApp: (options = {}, name = '[DEFAULT]') => {
      // 真 SDK 對同名重複初始化會拋 app/duplicate-app。mock 若放行，
      // 「忘了先查有沒有existing app」這種 bug 會在測試裡全綠、只有線上炸。
      if (state.apps.some(a => a.name === name)) {
        throw new Error(`Firebase: Firebase App named '${name}' already exists (app/duplicate-app)`);
      }
      const app = { name, options };
      state.apps.push(app);
      return app;
    },
    getFirestore: () => ({}),
    getAuth: () => ({}),
    GoogleAuthProvider: function GoogleAuthProvider() {},

    // ─ firestore refs（輕量；mock 不需真實路徑，doc 只記住 id）─
    collection: () => ({ __col: true }),
    doc: (_db, _root, _pid, _coll, id) => ({ __id: id }),
    query: (col, ...clauses) => ({ ...col, __clauses: clauses.filter(c => c && c.__where) }),
    where: (field, op, value) => ({ __where: true, field, op, value }),
    serverTimestamp: () => ({ toMillis: () => 0 }),

    // ─ firestore ops ─
    onSnapshot: (q, onChange) => {
      const l = { cb: onChange, clauses: (q && q.__clauses) || [] };
      state.snapListeners.add(l);
      l.cb({ docs: docsArray(l.clauses) });       // 立即推一次當前狀態
      return () => state.snapListeners.delete(l);
    },
    addDoc: async (_col, data) => {
      const id = `m${++idSeq}`;
      state.docs.set(id, { ...data });
      emitSnap();
      return { id };
    },
    // setDoc by ref（drawings store 用「繪圖物件 id」當 doc id → upsert）。
    setDoc: async (ref, data) => {
      state.docs.set(ref.__id, { ...data });
      emitSnap();
    },
    updateDoc: async (ref, data) => {
      const cur = state.docs.get(ref.__id) || {};
      state.docs.set(ref.__id, { ...cur, ...data });
      emitSnap();
    },
    deleteDoc: async (ref) => {
      state.docs.delete(ref.__id);
      emitSnap();
    },

    // ─ auth ─
    /**
     * 真 SDK 的第一次回呼是在**還原持久化的身分之後**才發生的（IndexedDB 是非同步的），
     * 所以「第一次回呼給 null」等於真的沒人登入。預設在這裡立即推一次就是模擬那個已經
     * 落地的狀態。
     *
     * `deferAuth: true` 則模擬「還原還沒完成」那段空窗：註冊時什麼都不推，等
     * `__setUser` 才第一次回呼。沒有這個開關就驗不到「使用者在頁面剛載入就按下按鈕」
     * ——那一刻 state.user 還是 null，而誤判的下場是對一個明明登入了的人說「請先登入」。
     */
    onAuthStateChanged: (_auth, cb) => {
      state.authListeners.add(cb);
      if (!initial.deferAuth) cb(state.user);
      return () => state.authListeners.delete(cb);
    },
    signInWithPopup: async () => {
      state.popupCalls += 1;
      state.user = initial.user || { uid: 'u1', email: 'test@e2e.local', displayName: 'E2E User' };
      emitAuth();
      return { user: state.user };
    },
    // redirect 版登入：真實情況會整頁跳走再回來，測試裡只記下「被呼叫了」——
    // 手機該走這條而不是 popup（popup 常被擋，而且擋掉時未必丟得出錯誤）。
    signInWithRedirect: async () => { state.redirectCalls += 1; },
    getRedirectResult: async () => ({ user: null }),

    // 匿名登入沒有 OAuth 流程，只是換一個 uid——在 LINE／FB 的內建瀏覽器裡也能用。
    // 沒有 displayName／email 是重點：名字得由使用者自己填。
    signInAnonymously: async () => {
      state.anonCalls += 1;
      state.user = { uid: `anon-${++idSeq}`, isAnonymous: true };
      emitAuth();
      return { user: state.user };
    },
    signOut: async () => { state.user = null; emitAuth(); },

    // ─ test controls ─
    __setUser: (u) => { state.user = u; emitAuth(); },
    __authCalls: () => ({
      redirect: state.redirectCalls, popup: state.popupCalls, anon: state.anonCalls,
    }),
    __seed: (c) => { const id = c.id || `m${++idSeq}`; state.docs.set(id, { ...c }); emitSnap(); return id; },
    __docs: () => docsArray().map(d => ({ id: d.id, ...d.data() })),
    __state: state,
  };
}
