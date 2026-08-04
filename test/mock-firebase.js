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
    apps: [],                 // { name, options } — 見下方 app 區塊
  };
  (initial.comments || []).forEach(c => {
    const id = c.id || `m${++idSeq}`;
    const { id: _omit, ...data } = c;
    state.docs.set(id, data);
  });

  const docsArray = () => [...state.docs.entries()].map(([id, data]) => ({
    id,
    data: () => ({ ...data }),
  }));
  const emitSnap = () => state.snapListeners.forEach(l => { l({ docs: docsArray() }); });
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
    query: (col) => col,
    where: () => ({ __where: true }),
    serverTimestamp: () => ({ toMillis: () => 0 }),

    // ─ firestore ops ─
    onSnapshot: (_q, onChange) => {
      const l = snap => onChange(snap);
      state.snapListeners.add(l);
      l({ docs: docsArray() });                  // 立即推一次當前狀態
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
    onAuthStateChanged: (_auth, cb) => {
      state.authListeners.add(cb);
      cb(state.user);                            // 立即推一次當前 user
      return () => state.authListeners.delete(cb);
    },
    signInWithPopup: async () => {
      state.user = initial.user || { uid: 'u1', email: 'test@e2e.local', displayName: 'E2E User' };
      emitAuth();
    },
    signOut: async () => { state.user = null; emitAuth(); },

    // ─ test controls ─
    __setUser: (u) => { state.user = u; emitAuth(); },
    __seed: (c) => { const id = c.id || `m${++idSeq}`; state.docs.set(id, { ...c }); emitSnap(); return id; },
    __docs: () => docsArray().map(d => ({ id: d.id, ...d.data() })),
    __state: state,
  };
}
