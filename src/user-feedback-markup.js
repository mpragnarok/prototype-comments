/**
 * user-feedback-markup —— 點選頁面元素留下標記，標記留在元素上，處理完會變樣。
 *
 * 一行掛上任何頁面：
 *   import { initElementMarkup } from 'https://prototype-comments.netlify.app/src/user-feedback-markup.js';
 *   initElementMarkup({ projectId: 'my-app', page: () => location.pathname });
 *
 * 舊路徑 `element-markup.js` 仍可用（一行 re-export），但新的掛法請用這個檔名——
 * 它與同資料夾的 `user-feedback.js` 是同一家族，看得出屬於哪個 skill。
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
import { mountChrome, openInput, renderMarks, highlightMark, placeBox, toast,
  showMarkPopover, hideMarkPopover, positionPopover, showInitFailure } from './markup-ui.js';

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
  try {
    return await start(opts);
  } catch (error) {
    // 掛不起來時在畫面上說一句。只印 console 的話，手機上的使用者看到的是
    // 「回饋按鈕不見了」而沒有任何線索——連要回報什麼都不知道。
    console.error('[element-markup] 初始化失敗', error);
    showInitFailure(error?.message ? String(error.message).slice(0, 160) : String(error).slice(0, 160));
    return { setMarking() {}, destroy() { document.querySelector('.em-fail')?.remove(); } };
  }
}

async function start(opts) {
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
    // 登入擋在「進入標記模式」這一刻，不是「點下某個元素」的那一刻——
    // 後者會讓使用者每點一個元件就被彈窗打斷一次，而且是在他已經想好要說什麼之後。
    onToggleMark: async () => {
      if (state.marking) return setMarking(false);
      ui.fab.disabled = true;
      try {
        const user = await ensureUser();   // 匿名時使用者無感，只是換一個 uid
        if (user) setMarking(true);
      } finally {
        // 一定要解除。走 redirect 時頁面會跳走所以無所謂，但**跳轉沒真的發生**
        // （被擋、失敗、或環境不支援）時，少了這行按鈕就永遠卡在灰色不能按——
        // 使用者看到的是「按鈕不見了／按不動」，而畫面上沒有任何原因。
        ui.fab.disabled = false;
      }
    },
    onOpenDrawer: (id) => openDrawer(id),
  });

  // ── 身分 ────────────────────────────────────────────────────────────────────
  // 預設**匿名**：signInAnonymously 只是跟 Firebase 換一個 uid，不走 OAuth，
  // 所以在 LINE／FB 的內建瀏覽器裡也能用——Google 封鎖 in-app WebView 的 OAuth，
  // 那是它的政策，換 signInWithRedirect 也一樣被擋。收回饋的人用哪個瀏覽器不是
  // 我們能選的，能選的是不要求登入。
  //
  // 想具名的人可以自己在輸入卡填名字（記在這台裝置上，下次自動帶）。
  // 需要「保證是本人」的場合才傳 auth:'google'。
  /**
   * 登入失敗的原因要說出來。吞掉的下場是使用者每點一次就跳一次彈窗、
   * 每次都失敗，而畫面上完全看不出為什麼——實際踩過一次，症狀是
   * 「我都沒辦法使用」，真因是網域沒加進 Firebase 的授權清單。
   */
  const SIGN_IN_ERRORS = {
    'auth/unauthorized-domain':
      `這個網域（${location.hostname}）沒有加進 Firebase 的授權清單，登入不會成功。`
      + '要掛這頁的人到 Firebase Console → Authentication → Settings → Authorized domains 加進去。',
    'auth/popup-blocked': '瀏覽器擋掉了登入彈窗，允許彈出視窗後再試一次。',
    'auth/popup-closed-by-user': '登入視窗被關掉了，再按一次。',
    'auth/cancelled-popup-request': '',   // 連按兩次造成，不必吵使用者
  };

  const anonymous = (opts.auth || 'anonymous') !== 'google';

  /**
   * 手機一律走 redirect，不用 popup。
   *
   * `signInWithPopup` 在手機瀏覽器常被當成彈出廣告直接擋掉，而且擋掉時
   * 未必丟得出錯誤——使用者的感受是「按了完全沒動靜」，實際踩過一次。
   * redirect 是整頁跳走再回來，沒有彈窗可擋。
   */
  const isMobile = () => /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
  const REDIRECT_FALLBACK = ['auth/popup-blocked', 'auth/popup-closed-by-user',
    'auth/operation-not-supported-in-this-environment', 'auth/cancelled-popup-request'];

  /**
   * 跨網域的 authDomain ＋ 擋第三方儲存的瀏覽器 = redirect 登入必定失敗。
   *
   * Firebase 官方已知限制（2024-06-24 起）：SDK 靠一個連到 authDomain 的跨站 iframe
   * 完成 redirect 流程，而 Safari 16.1+／Chrome 115+／Firefox 109+ 擋掉跨站儲存後，
   * 使用者會被導回、卻**沒有登入**——而且不會有任何錯誤。症狀是「登入兩次還是沒登入」。
   * https://firebase.google.com/docs/auth/web/redirect-best-practices
   *
   * 官方解法是讓 authDomain 與 app 同源（自訂網域或反向代理）。在那之前，明知會
   * 失敗就不要讓使用者白跳一趟 Google——直接說清楚，並指回不受影響的匿名模式。
   */
  const crossSiteAuth = () => {
    const domain = (config.authDomain || '').toLowerCase();
    return !!domain && domain !== location.hostname.toLowerCase();
  };

  async function signInWithGoogle() {
    const provider = new fb.GoogleAuthProvider();
    if (isMobile()) {
      if (crossSiteAuth()) {
        toast('這個瀏覽器擋跨站儲存，Google 登入會跳回來但登不進去（Firebase 已知限制）。'
          + '改用不需登入的模式即可，功能完全一樣。');
        console.warn('[element-markup] authDomain（' + config.authDomain + '）與本站不同源，'
          + '行動瀏覽器上的 signInWithRedirect 無法完成。'
          + '見 https://firebase.google.com/docs/auth/web/redirect-best-practices');
        return null;
      }
      await fb.signInWithRedirect(auth, provider);   // 頁面會離開，這裡不會回來
      return null;
    }
    try {
      return (await fb.signInWithPopup(auth, provider)).user;
    } catch (error) {
      if (!REDIRECT_FALLBACK.includes(error?.code)) throw error;
      // 桌機也可能擋彈窗（擴充功能、嚴格設定）→ 退回 redirect，而不是放著不管
      console.warn('[element-markup] 彈窗被擋，改用整頁跳轉登入', error.code);
      await fb.signInWithRedirect(auth, provider);
      return null;
    }
  }

  async function ensureUser() {
    if (state.user) return state.user;
    try {
      if (anonymous) return (await fb.signInAnonymously(auth)).user;
      return await signInWithGoogle();
    } catch (error) {
      const known = SIGN_IN_ERRORS[error?.code];
      if (known) toast(known);
      else if (known !== '') toast(anonymous ? '連不上伺服器，等一下再試。' : '登入沒有完成，再試一次。');
      console.error('[element-markup] 取得身分失敗', error?.code || error);
      return null;
    }
  }

  // 名字記在這台裝置上：不強迫留名，但留過一次就不必每則重打。
  const NAME_KEY = `em-name:${opts.projectId}`;
  const savedName = () => { try { return localStorage.getItem(NAME_KEY) || ''; } catch { return ''; } };
  const rememberName = (name) => { try { localStorage.setItem(NAME_KEY, name); } catch { /* 私密模式 */ } };

  /**
   * 按鈕文字要自己說清楚會發生什麼事。
   *
   * 先前具名模式的按鈕跟匿名版一樣寫「給回饋」，「按下去會跳登入」只寫在 title 裡——
   * 手機上看不到 tooltip，所以使用者的感受是「沒有看到 Google 登入」。
   * 畫面上看不出來的狀態，等於不存在。
   */
  function refreshFab() {
    if (state.marking) { ui.fab.textContent = '✕ 結束標記'; return; }
    const needsSignIn = !anonymous && !state.user;
    ui.fab.textContent = needsSignIn ? '🔒 用 Google 登入給回饋' : (opts.label || '給回饋');
    ui.fab.title = anonymous
      ? '不需要登入，直接點頁面上的元件留言'
      : (state.user ? `以 ${state.user.displayName || state.user.email} 的身分標記` : '會先請你用 Google 登入');
  }

  let announcedUser = null;
  // 從 Google 跳轉回來時把結果收下。不處理的話 onAuthStateChanged 仍會拿到 user，
  // 但錯誤（例如網域沒授權）會靜靜消失，使用者只看到「跳出去又跳回來，還是沒登入」。
  if (!anonymous) {
    fb.getRedirectResult(auth).catch((error) => {
      const known = SIGN_IN_ERRORS[error?.code];
      toast(known || '登入沒有完成，再試一次。');
      console.error('[element-markup] 跳轉登入失敗', error?.code || error);
    });
  }

  fb.onAuthStateChanged(auth, (user) => {
    state.user = user;
    refreshFab();
    // 具名模式登入成功要說一聲：不然使用者不確定「剛剛那個彈窗到底成功了沒」
    if (!anonymous && user && user.uid !== announcedUser) {
      announcedUser = user.uid;
      toast(`已登入：${user.displayName || user.email}`);
    }
    // 拿到 uid 之後才知道哪些是「自己的」，要重畫才會長出編輯／刪除
    if (state.marks.length) render();
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
    // 匿名：名字用填的，留空就是「未署名」——不假裝知道你是誰。
    const typed = anonymous ? ui.nameInput.value.trim() : '';
    if (anonymous) rememberName(typed);
    const authorName = anonymous
      ? (typed || '未署名')
      : (state.user.displayName || state.user.email);
    await fb.addDoc(col, {
      type: 'positional',
      screenId: page(),
      selector, relX, relY,
      body: body.slice(0, 2000),
      authorUid: state.user.uid,
      authorName,
      authorPhoto: state.user.photoURL || '',
      resolved: false,
      filedAt: null,          // bridge 靠這個欄位認「還沒收進待辦」，見 user-feedback skill
      createdAt: fb.serverTimestamp(),
    });
  }

  /** 只有自己標的才給改／刪——rules 也是這樣擋的，前端只是不要顯示做不到的按鈕。 */
  const isMine = (mark) => !!state.user && mark.authorUid === state.user.uid;

  async function editMark(mark, body) {
    try {
      await fb.updateDoc(docRef(mark.id), { body: body.slice(0, 2000), editedAt: fb.serverTimestamp() });
    } catch (error) {
      console.error('[element-markup] 改不動', error);
      toast('改不動，重新整理後再試一次。');
    }
  }

  async function deleteMark(mark) {
    try {
      await fb.deleteDoc(docRef(mark.id));
      toast('已刪除');
    } catch (error) {
      console.error('[element-markup] 刪不掉', error);
      toast('刪不掉——只有自己標的才能刪。');
    }
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
    const by = anonymous ? (savedName() || '未署名') : (user.displayName || user.email);
    await fb.updateDoc(docRef(mark.id), next
      ? { resolved: true, resolvedBy: by, resolvedByUid: user.uid, resolvedAt: fb.serverTimestamp() }
      : { resolved: false, resolvedBy: '', resolvedByUid: '', resolvedAt: null });
  }

  // ── 標記模式 ────────────────────────────────────────────────────────────────
  function setMarking(next) {
    state.marking = next;
    document.body.classList.toggle('em-marking', next);
    ui.fab.dataset.active = String(next);
    refreshFab();
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
    const user = state.user || await ensureUser();   // 一般走不到這裡：進標記模式時已經登入過
    if (!user) return setMarking(false);
    const rect = node.getBoundingClientRect();
    state.pending = {
      selector: cssSelectorFor(node),
      relX: rect.width ? +(((e.clientX - rect.left) / rect.width) * 100).toFixed(2) : 50,
      relY: rect.height ? +(((e.clientY - rect.top) / rect.height) * 100).toFixed(2) : 50,
    };
    openInput(ui, { x: e.clientX, y: e.clientY, selector: state.pending.selector, user,
      anonymous, savedName: savedName() });
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

  // 點頁面上的標記 → 就地跳出那一則，而不是把人丟進右側清單裡自己找。
  function popoverFor(id, at) {
    const index = state.marks.findIndex(m => m.id === id);
    if (index < 0) return;
    highlightMark(id);
    showMarkPopover(ui, state.marks[index], index, handlers(), at);
  }

  const handlers = () => ({
    isMine,
    onEdit: (m, body) => void editMark(m, body),
    onDelete: (m) => void deleteMark(m),
    onToggle: (m) => void toggleResolved(m),
    onFocus: (m) => {
      let node = null;
      try { node = document.querySelector(m.selector); } catch { /* 壞掉的 selector */ }
      node?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      highlightMark(m.id);
    },
    onFocusId: popoverFor,
  });

  function render() {
    renderMarks(ui, state.marks, handlers());
    // 視窗顯示的那則若已經不在了（自己刪掉、或別人刪的），就收起來——
    // 不然它會停在畫面上說著一則不存在的留言。檢查放在這裡而不是捲動事件裡，
    // 因為刪除走的是 snapshot 更新，不是捲動。
    const shownId = ui.pop.dataset.markId;
    if (shownId && !state.marks.some(m => String(m.id) === shownId)) hideMarkPopover(ui);
  }

  // 捲動／改變視窗：重畫框，並讓留言視窗重新對準它那個框
  // （視窗是 fixed 的——absolute 會把頁面撐寬，見 positionPopover 的說明）。
  const reflow = () => { render(); positionPopover(ui); };
  addEventListener('resize', reflow);
  addEventListener('scroll', reflow, { passive: true });
  // 點到 popover 以外的地方就收起來——包含頁面本身與別的標記
  const onDocClick = (e) => {
    if (!ui.pop.classList.contains('show')) return;
    if (ui.pop.contains(e.target)) return;
    hideMarkPopover(ui);
  };
  const onEsc = (e) => { if (e.key === 'Escape') hideMarkPopover(ui); };
  document.addEventListener('click', onDocClick, true);
  document.addEventListener('keydown', onEsc);
  // SPA 換頁：網址變了就換一批標記（screenId 是以 page() 求值的）
  const onRoute = () => subscribe();
  addEventListener('hashchange', onRoute);
  addEventListener('popstate', onRoute);

  refreshFab();
  subscribe();

  return {
    setMarking,
    destroy: () => {
      state.unsub?.();
      removeEventListener('resize', reflow);
      removeEventListener('scroll', reflow);
      document.removeEventListener('click', onDocClick, true);
      document.removeEventListener('keydown', onEsc);
      removeEventListener('hashchange', onRoute);
      removeEventListener('popstate', onRoute);
      document.querySelectorAll('.em-box').forEach(n => n.remove());
      document.body.classList.remove('em-marking');
      ui.destroy();
    },
  };
}
