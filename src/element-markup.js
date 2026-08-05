/**
 * element-markup —— 點選頁面元素留下標記，標記留在元素上，處理完會變樣。
 *
 * 一行掛上任何頁面：
 *   import { initElementMarkup } from 'https://prototype-comments.netlify.app/src/element-markup.js';
 *   initElementMarkup({ projectId: 'my-app', page: () => location.pathname });
 *
 * 與同 repo 另外兩支的分工：
 *   user-feedback.js  免登入、可貼圖，但**送出即消失**——連留言的人自己都讀不回來。
 *   pc.js（index.js） 同事設計審查：點座標放 pin、討論串、reactions、決策紀錄。
 *   本檔             產品的真實使用者：點**元素**標記，框留在那個元素上，
 *                    看得到別人標過什麼，處理完的框會變成綠色虛線。
 *
 * 為什麼不是改上面兩支的其中一支：
 *   - 免登入那條路的安全前提正是「只能寫不能讀」（見 firestore.rules 的三層防線）。
 *     要顯示別人的標記就必須能 read，那條前提就沒了——所以它保持原樣，兩條路並存。
 *   - pc.js 是三個 consumer 靠著的合約，且它的心智模型是「座標上的 pin」，
 *     與「框住一個元件」不同。硬塞會讓兩邊都變形。
 *
 * 資料落在 `prototype-comments/{projectId}/comments`，與 pc.js 同一個 collection：
 * user-feedback 的 bridge 已經在讀它，不必為這支再寫一條收件通道。
 */
import { cssSelectorFor } from './draw/selectors.js';
import { mountChrome, openInput, renderMarks, highlightMark, placeBox, toast } from './markup-ui.js';

const FB = 'https://www.gstatic.com/firebasejs/10.12.2';

/** 示範用預設值——自架一定要傳自己的 firebaseConfig，否則標記會落在別人家。 */
const DEMO_CONFIG = {
  apiKey: 'AIzaSyCsJ8HK2Wo7FJSTxwdCk3cdnOBXThpTUPo',
  authDomain: 'prototype-comments-27106.firebaseapp.com',
  projectId: 'prototype-comments-27106',
  storageBucket: 'prototype-comments-27106.firebasestorage.app',
  messagingSenderId: '1010970126486',
  appId: '1:1010970126486:web:9d1e055488207759aebab7',
};

async function loadFirebase() {
  const [app, store, auth] = await Promise.all([
    import(`${FB}/firebase-app.js`),
    import(`${FB}/firebase-firestore.js`),
    import(`${FB}/firebase-auth.js`),
  ]);
  return { ...app, ...store, ...auth };
}

/** app 名字帶 projectId：同頁掛多份、各指不同專案時不會互相沿用第一份的設定。 */
function appFor(fb, config, projectId) {
  const name = `element-markup:${projectId}`;
  const existing = fb.getApps().find(a => a.name === name);
  return existing || fb.initializeApp(config, name);
}

/** `page` 可以給字串或函式——函式在每次求值當下才呼叫（SPA／deck 這種網址不變的頁面要用）。 */
function resolvePage(page) {
  if (typeof page === 'function') {
    try { return String(page() || '') || location.pathname; }
    catch { return location.pathname; }
  }
  return page || location.pathname;
}

/**
 * 點擊處底下的 app 元素。工具自己的 DOM 一律標了 `data-em`，據此排除——
 * 不排除的話會標到自己的按鈕，而且完全不會報錯。
 */
function pickTarget(shield, clientX, clientY) {
  shield.style.pointerEvents = 'none';
  const node = document.elementFromPoint(clientX, clientY);
  shield.style.pointerEvents = '';
  if (!node || node === document.body || node === document.documentElement) return null;
  if (node.closest('[data-em]')) return null;
  return node;
}

export async function initElementMarkup(opts = {}) {
  if (!opts.projectId) throw new Error('initElementMarkup: projectId is required');
  const fb = opts._firebase || await loadFirebase();
  const config = opts.firebaseConfig || DEMO_CONFIG;
  if (!opts.firebaseConfig && !opts._firebase) {
    console.warn('[element-markup] 沒有傳 firebaseConfig，標記會寫進共用示範專案，你的 bridge 讀不到。');
  }

  const app = appFor(fb, config, opts.projectId);
  const db = fb.getFirestore(app);
  const auth = fb.getAuth(app);
  const col = fb.collection(db, 'prototype-comments', opts.projectId, 'comments');
  // 與 store.js 同一種寫法（完整路徑而非 col+id）：mock 與真 SDK 都認這個形狀。
  const docRef = (id) => fb.doc(db, 'prototype-comments', opts.projectId, 'comments', id);

  const state = { marking: false, user: null, marks: [], pending: null, unsub: null };
  const page = () => resolvePage(opts.page);

  const ui = mountChrome({
    label: opts.label || '給回饋',
    onToggleMark: () => setMarking(!state.marking),
    onOpenDrawer: (id) => openDrawer(id),
  });

  // ── 登入 ────────────────────────────────────────────────────────────────────
  // 要能看到別人標過什麼就必須能讀，能讀就得知道是誰標的——所以這條路要登入。
  // 只在「要寫」的當下才擋，純瀏覽不必登入（rules 的 read 是公開的）。
  async function ensureUser() {
    if (state.user) return state.user;
    const provider = new fb.GoogleAuthProvider();
    const cred = await fb.signInWithPopup(auth, provider);
    return cred.user;
  }

  fb.onAuthStateChanged(auth, (user) => {
    state.user = user;
    ui.fab.title = user ? `以 ${user.displayName || user.email} 的身分標記` : '按一下會先請你用 Google 登入';
  });

  // ── 資料 ────────────────────────────────────────────────────────────────────
  function subscribe() {
    state.unsub?.();
    const q = fb.query(col, fb.where('screenId', '==', page()));
    state.unsub = fb.onSnapshot(q, (snap) => {
      state.marks = snap.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .filter(m => m.selector && !m.parentId)
        .sort((a, b) => (a.createdAt?.toMillis?.() ?? 0) - (b.createdAt?.toMillis?.() ?? 0));
      render();
    }, (error) => {
      // 靜默失敗＝「我標了但沒人收到」，所以一定要吭聲。
      console.error('[element-markup] 讀取標記失敗（多半是 Firestore rules 沒開 read）', error);
    });
  }

  async function save(body) {
    const { selector, relX, relY } = state.pending;
    await fb.addDoc(col, {
      type: 'positional',
      screenId: page(),
      selector, relX, relY,
      body: body.slice(0, 2000),
      authorUid: state.user.uid,
      authorName: state.user.displayName || state.user.email,
      authorPhoto: state.user.photoURL || '',
      resolved: false,
      filedAt: null,          // bridge 靠這個欄位認「還沒收進待辦」，見 user-feedback skill
      createdAt: fb.serverTimestamp(),
    });
  }

  /**
   * 已處理與否。刻意**不碰 filedAt**：那是 bridge 的記帳（收進待辦了沒），
   * 這裡改的是人的判斷（真的處理完了沒）。混在一起的話，使用者一標記、
   * bridge 一撈走，框就變綠說「已處理」——那個框會說謊。
   */
  async function toggleResolved(mark) {
    const user = await ensureUser().catch(() => null);
    if (!user) return;
    const next = !mark.resolved;
    await fb.updateDoc(docRef(mark.id), next
      ? { resolved: true, resolvedBy: user.displayName || user.email, resolvedByUid: user.uid, resolvedAt: fb.serverTimestamp() }
      : { resolved: false, resolvedBy: '', resolvedByUid: '', resolvedAt: null });
  }

  // ── 標記模式 ────────────────────────────────────────────────────────────────
  function setMarking(next) {
    state.marking = next;
    document.body.classList.toggle('em-marking', next);
    ui.fab.dataset.active = String(next);
    ui.fab.textContent = next ? '✕ 結束標記' : (opts.label || '給回饋');
    if (!next) { ui.hover.style.display = 'none'; ui.input.classList.remove('show'); state.pending = null; }
  }

  ui.shield.addEventListener('pointermove', (e) => {
    const node = pickTarget(ui.shield, e.clientX, e.clientY);
    if (!node) { ui.hover.style.display = 'none'; return; }
    ui.hover.style.display = 'block';
    placeBox(ui.hover, node);
  });

  ui.shield.addEventListener('click', async (e) => {
    const node = pickTarget(ui.shield, e.clientX, e.clientY);
    if (!node) return;
    const user = await ensureUser().catch((error) => {
      console.warn('[element-markup] 登入未完成，這則沒有送出', error);
      toast('要先用 Google 登入才能標記');
      return null;
    });
    if (!user) return;
    const rect = node.getBoundingClientRect();
    state.pending = {
      selector: cssSelectorFor(node),
      relX: rect.width ? +(((e.clientX - rect.left) / rect.width) * 100).toFixed(2) : 50,
      relY: rect.height ? +(((e.clientY - rect.top) / rect.height) * 100).toFixed(2) : 50,
    };
    openInput(ui, { x: e.clientX, y: e.clientY, selector: state.pending.selector, user });
  });

  ui.ta.addEventListener('input', () => { ui.send.disabled = !ui.ta.value.trim(); });
  ui.cancel.onclick = () => { ui.input.classList.remove('show'); state.pending = null; };
  ui.send.onclick = async () => {
    const body = ui.ta.value.trim();
    if (!body || !state.pending) return;
    ui.send.disabled = true;
    try {
      await save(body);
      ui.input.classList.remove('show');
      state.pending = null;
      setMarking(false);
      toast('已送出，謝謝你的回饋');
      opts.onSent?.();
    } catch (error) {
      console.error('[element-markup] 送出失敗', error);
      ui.send.disabled = false;
      ui.input.querySelector('.em-err')?.remove();
      const err = document.createElement('p');
      err.className = 'em-err';
      err.textContent = '送出失敗，再按一次試試。';
      ui.input.append(err);
    }
  };

  // ── 顯示 ────────────────────────────────────────────────────────────────────
  function openDrawer(id) {
    ui.drawer.classList.add('open');
    if (id == null) return;
    const row = ui.list.querySelector(`[data-mark-id="${CSS.escape(String(id))}"]`);
    if (row) { row.scrollIntoView({ block: 'center' }); highlightMark(id); }
  }

  function render() {
    renderMarks(ui, state.marks, {
      onToggle: (m) => void toggleResolved(m),
      onFocus: (m) => {
        let node = null;
        try { node = document.querySelector(m.selector); } catch { /* 壞掉的 selector */ }
        node?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        highlightMark(m.id);
      },
      onFocusId: (id) => openDrawer(id),
    });
  }

  const reflow = () => render();
  addEventListener('resize', reflow);
  addEventListener('scroll', reflow, { passive: true });
  // SPA 換頁：網址變了就換一批標記（screenId 是以 page() 求值的）
  const onRoute = () => subscribe();
  addEventListener('hashchange', onRoute);
  addEventListener('popstate', onRoute);

  subscribe();

  return {
    setMarking,
    destroy: () => {
      state.unsub?.();
      removeEventListener('resize', reflow);
      removeEventListener('scroll', reflow);
      removeEventListener('hashchange', onRoute);
      removeEventListener('popstate', onRoute);
      document.querySelectorAll('.em-box').forEach(n => n.remove());
      document.body.classList.remove('em-marking');
      ui.destroy();
    },
  };
}
