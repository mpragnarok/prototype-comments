/**
 * prototype-comments
 * Drop-in Firebase comment overlay for HTML prototypes.
 *
 * Usage:
 *   import { initPrototypeComments } from '.../src/index.js';
 *   initPrototypeComments({ firebaseConfig, projectId, getScreenId, getMode,
 *                           designTarget, engNoteSelector, navigateTo });
 *
 * No secrets are stored here. All Firebase config is passed by the consumer.
 */

import { STYLES } from './styles.js';
import { createStore } from './store.js';
import { createNoteModule } from './note-comments.js';

// ─── Firebase SDK (ESM, gstatic CDN) ────────────────────────────────────────
const FB_VER = '12.13.0';
const FB_BASE = `https://www.gstatic.com/firebasejs/${FB_VER}`;

async function loadFirebase() {
  const [
    { initializeApp, getApps, getApp },
    { getFirestore, collection, addDoc, onSnapshot, query, where,
      serverTimestamp, deleteDoc, doc, updateDoc },
    { getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged },
  ] = await Promise.all([
    import(`${FB_BASE}/firebase-app.js`),
    import(`${FB_BASE}/firebase-firestore.js`),
    import(`${FB_BASE}/firebase-auth.js`),
  ]);
  return {
    initializeApp, getApps, getApp,
    getFirestore, collection, addDoc, onSnapshot, query, where,
    serverTimestamp, deleteDoc, doc, updateDoc,
    getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged,
  };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
function injectStyles() {
  if (document.getElementById('pc-styles')) return;
  const s = document.createElement('style');
  s.id = 'pc-styles';
  s.textContent = STYLES;
  document.head.appendChild(s);
}

function timeAgo(ts) {
  if (!ts) return '';
  const sec = Math.floor((Date.now() - ts.toMillis()) / 1000);
  if (sec < 60) return '剛剛';
  if (sec < 3600) return `${Math.floor(sec / 60)} 分鐘前`;
  if (sec < 86400) return `${Math.floor(sec / 3600)} 小時前`;
  return `${Math.floor(sec / 86400)} 天前`;
}

function noteKey(tag, text) {
  return `${tag}::${(text || '').trim().slice(0, 40)}`;
}

function el(tag, cls, attrs = {}) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  Object.entries(attrs).forEach(([k, v]) => e.setAttribute(k, v));
  return e;
}

// 設定錯誤（如缺 projectId）時，除了 console 也在畫面右下角顯示明顯紅色 badge，
// 讓「忘了設定」在接上去當下就被看見，而不是事後才發現留言沒存。inline 樣式自帶（不靠 injectStyles）。
function showInitError(text) {
  const render = () => {
    if (document.getElementById('pc-init-error')) return;
    const b = document.createElement('div');
    b.id = 'pc-init-error';
    b.setAttribute('role', 'alert');
    b.textContent = '⚠ pc.js — ' + text;
    b.style.cssText = 'position:fixed;right:12px;bottom:12px;z-index:2147483647;'
      + 'background:#BA1A1A;color:#fff;font:600 12px/1.45 system-ui,-apple-system,sans-serif;'
      + 'padding:8px 12px;border-radius:6px;box-shadow:0 2px 10px rgba(0,0,0,.35);max-width:280px;';
    (document.body || document.documentElement).appendChild(b);
  };
  if (document.body) render();
  else document.addEventListener('DOMContentLoaded', render, { once: true });
}

// ─── Main Init ───────────────────────────────────────────────────────────────
export async function initPrototypeComments(opts = {}) {
  const {
    firebaseConfig,
    projectId,                  // 必填：每個原型專案一個唯一 id；留言依此分區（不再 fallback 到 'default'）
    getScreenId     = () => 'unknown',
    getMode         = () => 'design',
    designTarget    = '#phone',
    engNoteSelector = '.eng-note-row',
    navigateTo        = null,   // (screenId: string) => void  — consumer provides
    authBarTarget     = null,   // CSS selector for a flex header to inject auth bar into
    authBarCorner     = 'right', // 浮動 auth bar 貼哪個底角：'right'(預設) | 'left'。bar 仍「浮底」，
                                 //   只切左右——給「note/內容在右側、bar 會擋到」的版型把 bar 移到左下。
    scrollContainer   = null,   // CSS selector for scrollable body inside the phone frame
    clipToScrollContainer = false, // [ADD 2026-06-16] true → annotation 捲出 scrollContainer 可視範圍就隱藏
                                   //   （不夾邊緣）。給 live app 用：designTarget 是整個 #root、但實際
                                   //   捲動區只佔視窗一部分，annotation 捲出捲動區若不裁切會飄在 header 等處。
                                   //   截圖 flow 維持預設 false（annotation 夾在 phone frame 邊緣當指示器）。
    noteJump          = false,  // [ADD 2026-06-16] 「全部留言」清單點 note(規格)留言的行為：
                                //   false(預設,截圖版)→ inline 在面板內展開討論串（reliable）。
                                //   true(live overlay)→ 改成跳到該 note：關面板、(必要時)換頁、捲到
                                //   對應 .eng-note-row 並開它的討論串。因 note 在 React 抽屜(keepMounted
                                //   但視覺關閉)，跳轉前先 dispatch `pc:note-jump` 事件讓 consumer 開抽屜。
    _firebase         = null,   // 測試用：注入 in-memory firebase mock，略過 CDN load + 真 Firebase
  } = opts;

  if (!firebaseConfig && !_firebase) {
    console.error('[prototype-comments] firebaseConfig is required');
    return;
  }

  if (!projectId) {
    console.error('[prototype-comments] projectId is required — 每個原型專案需指定唯一 projectId（標註/留言依此分區，不再 fallback 到 default）');
    showInitError('缺少 projectId：留言系統未啟動（每個原型專案需指定唯一 projectId）');
    return;
  }

  injectStyles();

  // Load Firebase SDK（測試可用 _firebase 注入 mock，略過 gstatic CDN）
  const fb = _firebase || await loadFirebase();

  // Init Firebase app (avoid duplicate)
  const app = fb.getApps().length
    ? fb.getApp()
    : fb.initializeApp(firebaseConfig);

  const db   = fb.getFirestore(app);
  const auth = fb.getAuth(app);

  // ── Store (Firebase seam) ──────────────────────────────────────────────────
  const store = createStore(fb, db, projectId);

  // ── State ──────────────────────────────────────────────────────────────────
  let currentUser = null;
  let commentMode  = false;
  let annotationsVisible  = true;
  let unsub        = null;

  function toggleAnnotationsVisible() {
    annotationsVisible = !annotationsVisible;
    const overlay = document.getElementById('pc-overlay');
    if (overlay) overlay.classList.toggle('pc-annotations-hidden', !annotationsVisible);
    const btn = document.getElementById('pc-toggle-annotations');
    if (btn) btn.style.opacity = annotationsVisible ? '1' : '0.4';
  }

  // data state
  let comments    = [];
  let allComments = [];

  // scroll sync — re-attaches on every screen change because goto() replaces .body
  let _scrollEl = null;
  function refreshScrollEl() {
    if (!scrollContainer) return;
    const el = document.querySelector(scrollContainer);
    if (el === _scrollEl) return;
    if (_scrollEl) _scrollEl.removeEventListener('scroll', renderAnnotations);
    _scrollEl = el;
    if (_scrollEl) _scrollEl.addEventListener('scroll', renderAnnotations, { passive: true });
  }
  const getScrollTop = () => _scrollEl?.scrollTop ?? 0;

  // interaction state (UI lifecycle)
  const annotation   = { current: null };          // pendingAnnotation
  const pop   = { id: null, el: null };     // openPopoverId + popoverEl
  let movingAnnotationId = null;                   // id of annotation currently being relocated
  let isDragging  = false;                  // true while drag is in progress
  let dragAnnotationEl   = null;                   // DOM element being dragged
  let justDragged = false;                  // suppress post-drag click event
  let lastDragX   = 0;                      // last cursor x during drag
  let lastDragY   = 0;                      // last cursor y during drag
  let autoScrollTimer = null;               // interval id for edge autoscroll
  let autoScrollDir   = 0;                  // 1 = down, -1 = up, 0 = none

  // panel state
  const panel = { open: false, filter: 'all', typeFilter: 'all', search: '', tagFilter: null, sort: 'new', expandedNote: null, el: null, listEl: null, unsub: null };

  // ── Auth Bar ───────────────────────────────────────────────────────────────
  function buildAuthBar() {
    const bar = el('div', 'pc-auth-bar');
    bar.id = 'pc-auth-bar';

    const signInBtn = el('button', 'pc-sign-in-btn');
    signInBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 48 48" fill="none"><path d="M44.5 20H24v8.5h11.8C34.7 33.9 30.1 37 24 37c-7.2 0-13-5.8-13-13s5.8-13 13-13c3.1 0 5.9 1.1 8.1 2.9l6.4-6.4C34.6 4.1 29.6 2 24 2 11.8 2 2 11.8 2 24s9.8 22 22 22c11 0 21-8 21-22 0-1.3-.2-2.7-.5-4z" fill="#4285F4"/><path d="M6.3 14.7l7 5.1C15.1 16.6 19.2 14 24 14c3.1 0 5.9 1.1 8.1 2.9l6.4-6.4C34.6 4.1 29.6 2 24 2 16.3 2 9.7 7.4 6.3 14.7z" fill="#EA4335"/><path d="M24 46c5.9 0 10.9-2 14.5-5.3l-6.7-5.5C29.7 36.9 27 38 24 38c-6.1 0-10.7-3.1-11.8-7.5l-7 5.4C9.2 43.1 16.1 46 24 46z" fill="#34A853"/><path d="M44.5 20H24v8.5h11.8c-.6 2.3-2 4.3-3.8 5.7l6.7 5.5C42.6 36.2 46 30.5 46 24c0-1.3-.2-2.7-.5-4h-1z" fill="#FBBC05"/></svg> <span class="pc-signin-text">Sign in with Google</span>`;
    signInBtn.onclick = () =>
      fb.signInWithPopup(auth, new fb.GoogleAuthProvider());

    bar.appendChild(signInBtn);
    bar.appendChild(buildHelpBtn());
    return { bar, signInBtn };
  }

  function renderAuthBar(user) {
    const bar = document.getElementById('pc-auth-bar');
    if (!bar) return;
    bar.innerHTML = '';

    if (!user) {
      const btn = el('button', 'pc-sign-in-btn');
      btn.innerHTML = `<svg width="14" height="14" viewBox="0 0 48 48" fill="none"><path d="M44.5 20H24v8.5h11.8C34.7 33.9 30.1 37 24 37c-7.2 0-13-5.8-13-13s5.8-13 13-13c3.1 0 5.9 1.1 8.1 2.9l6.4-6.4C34.6 4.1 29.6 2 24 2 11.8 2 2 11.8 2 24s9.8 22 22 22c11 0 21-8 21-22 0-1.3-.2-2.7-.5-4z" fill="#4285F4"/></svg> <span class="pc-signin-text">Sign in with Google</span>`;
      btn.onclick = () =>
        fb.signInWithPopup(auth, new fb.GoogleAuthProvider());
      bar.appendChild(btn);
      return;
    }

    if (user.photoURL) {
      const img = el('img', 'pc-user-avatar', { src: user.photoURL, alt: user.displayName });
      bar.appendChild(img);
    }
    const name = el('span', 'pc-user-name');
    name.textContent = user.displayName || user.email;
    bar.appendChild(name);

    const toggle = el('button', 'pc-comment-toggle');
    toggle.id = 'pc-comment-toggle';
    toggle.innerHTML = '💬 留言模式';
    toggle.onclick = () => setCommentMode(!commentMode);
    bar.appendChild(toggle);

    const toggleAnnotationBtn = el('button', 'pc-comment-toggle');
    toggleAnnotationBtn.id = 'pc-toggle-annotations';
    toggleAnnotationBtn.title = '隱藏標註';
    toggleAnnotationBtn.style.padding = '6px 8px';
    toggleAnnotationBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>`;
    toggleAnnotationBtn.onclick = toggleAnnotationsVisible;
    bar.appendChild(toggleAnnotationBtn);

    const panelBtn = el('button', 'pc-sign-in-btn');
    panelBtn.id = 'pc-panel-btn';
    panelBtn.style.cssText = 'font-size:11px;padding:4px 10px;';
    panelBtn.textContent = '📋 全部留言';
    panelBtn.onclick = () => panel.open ? closePanel() : openPanel();
    bar.appendChild(panelBtn);

    const so = el('button', 'pc-sign-in-btn pc-signout-btn');
    so.style.cssText = 'font-size:11px;opacity:.6;padding:4px 8px;';
    so.textContent = '登出';
    so.onclick = () => fb.signOut(auth);
    bar.appendChild(so);
    bar.appendChild(buildHelpBtn());
  }

  function buildHelpBtn() {
    const btn = el('button', 'pc-help-btn');
    btn.title = '使用說明';
    btn.textContent = '?';
    btn.onclick = showHelpModal;
    return btn;
  }

  function showHelpModal() {
    if (document.getElementById('pc-help-modal')) return;
    const modal = el('div', 'pc-help-modal');
    modal.id = 'pc-help-modal';
    modal.innerHTML = `
      <div class="pc-help-box">
        <div class="pc-help-header">
          <span>💬 留言系統使用說明</span>
          <button class="pc-popover-close pc-help-close" onclick="this.closest('#pc-help-modal').remove()">✕</button>
        </div>
        <div class="pc-help-body">
          <div class="pc-help-section">
            <div class="pc-help-title">🔑 登入</div>
            <div class="pc-help-desc">點「Sign in with Google」用 Google 帳號登入後即可留言；未登入則只能瀏覽。</div>
          </div>
          <div class="pc-help-section">
            <div class="pc-help-title">📌 新增標註</div>
            <div class="pc-help-desc">點選「💬 留言模式」後，在畫面任意位置點一下放置標註，輸入留言後送出。</div>
          </div>
          <div class="pc-help-section">
            <div class="pc-help-title">↕️ 移動標註</div>
            <div class="pc-help-desc"><strong>長按標註約 0.5 秒</strong>進入拖曳模式，拖曳至新位置後放開即儲存。按 <kbd>ESC</kbd> 取消。超出畫面的標註會停靠在邊緣，同樣可長按拖曳。</div>
          </div>
          <div class="pc-help-section">
            <div class="pc-help-title">💬 查看與回覆</div>
            <div class="pc-help-desc">點選標註開啟留言串，可在底部直接回覆；輸入 <kbd>@</kbd> 可標記（提及）其他協作者。</div>
          </div>
          <div class="pc-help-section">
            <div class="pc-help-title">👍 表情回應</div>
            <div class="pc-help-desc">在留言上點 emoji 快速回應，再點一次取消；可看到誰按了。</div>
          </div>
          <div class="pc-help-section">
            <div class="pc-help-title">✏️ 編輯／刪除</div>
            <div class="pc-help-desc">自己的留言可「編輯」（會標示「已編輯」）或「刪除」；刪除主留言會一併刪掉整串。</div>
          </div>
          <div class="pc-help-section">
            <div class="pc-help-title">✓ 標記完成／取消</div>
            <div class="pc-help-desc">留言處理完點「✓ Resolve」，標註與對話框變灰表示已解決；任何同事都能再點「↩ 取消解決」還原。</div>
          </div>
          <div class="pc-help-section">
            <div class="pc-help-title">👁 隱藏標註</div>
            <div class="pc-help-desc">點選眼睛圖示切換所有標註的顯示狀態。</div>
          </div>
          <div class="pc-help-section">
            <div class="pc-help-title">📋 全部留言</div>
            <div class="pc-help-desc">點選「📋 全部留言」查看並跳轉到任意畫面的留言。</div>
          </div>
        </div>
      </div>`;
    modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
    document.body.appendChild(modal);
  }

  function mountAuthBar() {
    const wrap = el('div');
    const { bar } = buildAuthBar();
    wrap.appendChild(bar);
    const targetEl = authBarTarget ? document.querySelector(authBarTarget) : null;
    if (targetEl) {
      wrap.style.flexShrink = '0';
      targetEl.appendChild(wrap);
    } else {
      wrap.id = 'pc-auth-mobile-wrap';
      const side = authBarCorner === 'left' ? 'left:12px' : 'right:12px';
      wrap.style.cssText = 'position:fixed;bottom:64px;' + side + ';z-index:9000;background:#fff;border-radius:20px;box-shadow:0 2px 12px rgba(0,0,0,.15);padding:6px 10px;';
      document.body.appendChild(wrap);
    }
  }

  // ── Overlay & Positional Annotations ──────────────────────────────────────────────
  function getDesignTarget() {
    return document.querySelector(designTarget);
  }

  function mountOverlay() {
    const target = getDesignTarget();
    if (!target || document.getElementById('pc-overlay')) return;
    if (getComputedStyle(target).position === 'static') {
      target.style.position = 'relative';
    }
    target.style.overflow = 'hidden';
    const overlay = el('div', 'pc-overlay');
    overlay.id = 'pc-overlay';
    target.appendChild(overlay);

    overlay.addEventListener('click', e => {
      if (!currentUser) return;
      e.stopPropagation();
      if (!commentMode) return;
      const rect = overlay.getBoundingClientRect();
      const scrollTop = getScrollTop();
      const x = parseFloat(((e.clientX - rect.left) / rect.width * 100).toFixed(2));
      const y = parseFloat(((e.clientY - rect.top + scrollTop) / rect.height * 100).toFixed(2));
      closeAllPopovers();
      annotation.current = { x, y };
      console.log('[pc] overlay click → annotation.current set to', annotation.current);
      showInputPopover(e.clientX, e.clientY, null);
    });
  }

  function setCommentMode(active) {
    commentMode = active;
    const overlay = document.getElementById('pc-overlay');
    if (overlay) overlay.classList.toggle('active', active);
    const toggle = document.getElementById('pc-comment-toggle');
    if (toggle) toggle.classList.toggle('active', active);
    if (!active) { annotation.current = null; closeAllPopovers(); }
  }

  // ── Annotation Relocation (long-press + drag) ───────────────────────────────────
  async function finishMovingAnnotation(x, y) {
    if (!movingAnnotationId) return;
    const id = movingAnnotationId;
    movingAnnotationId = null;
    dragAnnotationEl = null;
    justDragged = true;
    setTimeout(() => { justDragged = false; }, 0);
    document.body.classList.remove('pc-dragging');
    // Optimistic update: apply x/y locally so any renderAnnotations() calls while
    // awaiting the Firestore round-trip show the annotation at the new position.
    const idx = comments.findIndex(c => c.id === id);
    if (idx !== -1) { comments[idx] = { ...comments[idx], x, y }; renderAnnotations(); }
    await store.update(id, { x, y });
  }

  function cancelMovingAnnotation() {
    if (!movingAnnotationId && !isDragging) return;
    movingAnnotationId = null;
    isDragging = false;
    dragAnnotationEl = null;
    document.body.classList.remove('pc-dragging');
    removeDragListeners();
    renderAnnotations();
  }

  function addDragListeners() {
    // 全程用 pointer events：pointerdown 已 preventDefault（切斷 compatibility mouse events），
    // 若 drag 用 mousemove/up 會收不到 → 統一 pointer 才動得了。pointer 也統一涵蓋 touch。
    document.addEventListener('pointermove', onDragMove);
    document.addEventListener('pointerup', onDragEnd);
  }

  function removeDragListeners() {
    document.removeEventListener('pointermove', onDragMove);
    document.removeEventListener('pointerup', onDragEnd);
    clearAutoScroll();
  }

  function moveAnnotationVisually(clientX, clientY) {
    if (!dragAnnotationEl) return;
    const overlay = document.getElementById('pc-overlay');
    if (!overlay) return;
    const rect = overlay.getBoundingClientRect();
    const scrollTop = getScrollTop();
    const overlayH = overlay.offsetHeight || 1;
    const x = (clientX - rect.left) / rect.width * 100;
    const y = (clientY - rect.top + scrollTop) / overlayH * 100;
    const visualY = y - (scrollTop / overlayH * 100);
    dragAnnotationEl.style.left = `${x}%`;
    dragAnnotationEl.style.top  = `${visualY}%`;
  }

  function checkAutoScroll(clientY) {
    const overlay = document.getElementById('pc-overlay');
    if (!overlay || !_scrollEl) { clearAutoScroll(); return; }
    const rect = overlay.getBoundingClientRect();
    const edgePx = 48;
    const distBottom = rect.bottom - clientY;
    const distTop    = clientY - rect.top;
    if (distBottom >= 0 && distBottom < edgePx) {
      setAutoScroll(1);
    } else if (distTop >= 0 && distTop < edgePx) {
      setAutoScroll(-1);
    } else {
      clearAutoScroll();
    }
  }

  function setAutoScroll(dir) {
    if (autoScrollTimer && autoScrollDir === dir) return;
    clearAutoScroll();
    autoScrollDir = dir;
    autoScrollTimer = setInterval(() => {
      if (!_scrollEl) { clearAutoScroll(); return; }
      _scrollEl.scrollTop += dir * 8;
      moveAnnotationVisually(lastDragX, lastDragY);
    }, 16);
  }

  function clearAutoScroll() {
    if (autoScrollTimer) { clearInterval(autoScrollTimer); autoScrollTimer = null; }
    autoScrollDir = 0;
  }

  function onDragMove(e) {
    if (!isDragging) return;
    lastDragX = e.clientX; lastDragY = e.clientY;
    moveAnnotationVisually(e.clientX, e.clientY);
    checkAutoScroll(e.clientY);
  }
  function onDragMoveTouch(e) {
    if (!isDragging || !e.touches.length) return;
    e.preventDefault();
    lastDragX = e.touches[0].clientX; lastDragY = e.touches[0].clientY;
    moveAnnotationVisually(e.touches[0].clientX, e.touches[0].clientY);
    checkAutoScroll(e.touches[0].clientY);
  }

  function onDragEnd(e) {
    if (!isDragging) return;
    isDragging = false;
    removeDragListeners();
    const overlay = document.getElementById('pc-overlay');
    if (!overlay || !movingAnnotationId) { movingAnnotationId = null; dragAnnotationEl = null; document.body.classList.remove('pc-dragging'); return; }
    const rect = overlay.getBoundingClientRect();
    const scrollTop = getScrollTop();
    const overlayH = overlay.offsetHeight || 1;
    const x = parseFloat((Math.max(0, Math.min(100, (e.clientX - rect.left) / rect.width * 100))).toFixed(2));
    // y is not capped at 100 — when the phone body is scrolled, the stored y can
    // legitimately exceed 100% to represent content positions below the initial fold.
    const y = parseFloat((Math.max(0, (e.clientY - rect.top + scrollTop) / overlayH * 100)).toFixed(2));
    finishMovingAnnotation(x, y);
  }

  function onDragEndTouch(e) {
    if (!isDragging) return;
    isDragging = false;
    removeDragListeners();
    const t = e.changedTouches[0];
    const overlay = document.getElementById('pc-overlay');
    if (!overlay || !movingAnnotationId) { movingAnnotationId = null; dragAnnotationEl = null; document.body.classList.remove('pc-dragging'); return; }
    const rect = overlay.getBoundingClientRect();
    const scrollTop = getScrollTop();
    const overlayH = overlay.offsetHeight || 1;
    const x = parseFloat((Math.max(0, Math.min(100, (t.clientX - rect.left) / rect.width * 100))).toFixed(2));
    const y = parseFloat((Math.max(0, (t.clientY - rect.top + scrollTop) / overlayH * 100)).toFixed(2));
    finishMovingAnnotation(x, y);
  }

  // ── Popover (input / thread) ───────────────────────────────────────────────
  function closeAllPopovers() {
    if (pop.el) { pop.el.remove(); pop.el = null; }
    pop.id = null;
  }

  function showInputPopover(clientX, clientY, commentId) {
    closeAllPopovers();
    if (!currentUser) return;

    const popEl = el('div', 'pc-popover');
    pop.el = popEl;

    const hdr = el('div', 'pc-popover-header');
    if (currentUser.photoURL) {
      const av = el('img', 'pc-popover-avatar', { src: currentUser.photoURL, alt: '' });
      hdr.appendChild(av);
    }
    const author = el('span', 'pc-popover-author');
    author.textContent = currentUser.displayName || currentUser.email;
    hdr.appendChild(author);
    const closeBtn = el('button', 'pc-popover-close');
    closeBtn.textContent = '✕';
    closeBtn.onclick = () => { annotation.current = null; closeAllPopovers(); };
    hdr.appendChild(closeBtn);
    popEl.appendChild(hdr);

    if (commentId) {
      const thread = renderThread(commentId);
      if (thread) popEl.appendChild(thread);
    }

    const ta = el('textarea', 'pc-textarea', { placeholder: '留下你的意見…（@ 可標記人）' });
    attachMentions(ta);
    popEl.appendChild(ta);
    ta.focus();

    const actions = el('div', 'pc-popover-actions');
    const cancelBtn = el('button', 'pc-btn-cancel');
    cancelBtn.textContent = '取消';
    cancelBtn.onclick = () => { annotation.current = null; closeAllPopovers(); };
    const submitBtn = el('button', 'pc-btn-submit', { disabled: '' });
    submitBtn.textContent = '送出';

    ta.addEventListener('input', () => {
      submitBtn.disabled = !ta.value.trim();
    });

    submitBtn.onclick = async () => {
      const body = ta.value.trim();
      if (!body) return;
      submitBtn.disabled = true;

      const data = {
        type: 'positional',
        screenId: getScreenId(),
        x: annotation.current ? annotation.current.x : null,
        y: annotation.current ? annotation.current.y : null,
        body,
        authorUid: currentUser.uid,
        authorName: currentUser.displayName || currentUser.email,
        authorPhoto: currentUser.photoURL || '',
        resolved: false,
      };

      if (commentId) {
        const parent = comments.find(c => c.id === commentId);
        if (parent) {
          data.x = parent.x;
          data.y = parent.y;
          data.parentId = commentId;
        }
      }

      console.log('[pc] save x=', data.x, 'y=', data.y, 'screenId=', data.screenId, 'annotation=', annotation.current);
      try {
        await store.save(data);
        console.log('[pc] save success');
      } catch(e) {
        console.error('[pc] save FAILED:', e.message, e.code);
      }
      annotation.current = null;
      closeAllPopovers();
    };

    actions.appendChild(cancelBtn);
    actions.appendChild(submitBtn);
    popEl.appendChild(actions);

    document.body.appendChild(popEl);
    positionPopover(popEl, clientX, clientY);
  }

  // Escape HTML then turn URLs into clickable links (Feature: linkify)
  function escapeHtml(s) {
    return (s || '').replace(/[&<>"']/g, m => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[m]));
  }
  function linkify(s, names) {
    let h = escapeHtml(s);
    h = h.replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" rel="noopener" class="pc-link">$1</a>');
    // highlight known @full-names first (longest first, so "Mina Huang" beats "Mina")
    (names || []).slice().filter(Boolean).sort((a, b) => b.length - a.length).forEach(n => {
      const e = escapeHtml(n).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      h = h.replace(new RegExp('@' + e, 'g'), '<span class="pc-mention">@' + escapeHtml(n) + '</span>');
    });
    return h;
  }

  // ── @mention (Figma-style): pool = distinct comment authors in this projectId ──
  function peopleList() {
    const m = new Map();
    allComments.forEach(c => { if (c.authorUid && c.authorName) m.set(c.authorUid, { uid: c.authorUid, name: c.authorName, photo: c.authorPhoto || '' }); });
    return [...m.values()];
  }
  function attachMentions(ta) {
    let pop = null;
    const close = () => { if (pop) { pop.remove(); pop = null; } };
    ta.addEventListener('input', () => {
      const pos = ta.selectionStart;
      const before = ta.value.slice(0, pos);
      const m = before.match(/@([^\s@]*)$/);
      close();
      if (!m) return;
      const q = m[1].toLowerCase();
      const matches = peopleList().filter(p => p.name.toLowerCase().includes(q)).slice(0, 6);
      if (!matches.length) return;
      pop = el('div', 'pc-mention-pop');
      matches.forEach(p => {
        const opt = el('button', 'pc-mention-opt');
        opt.innerHTML = (p.photo ? `<img src="${p.photo}" alt="">` : '<span class="pc-mention-ph"></span>') + `<span>${escapeHtml(p.name)}</span>`;
        opt.onmousedown = (e) => {
          e.preventDefault();
          const start = pos - m[0].length;
          ta.value = ta.value.slice(0, start) + '@' + p.name + ' ' + ta.value.slice(pos);
          const np = start + p.name.length + 2;
          ta.setSelectionRange(np, np);
          close(); ta.focus();
          ta.dispatchEvent(new Event('input'));
        };
        pop.appendChild(opt);
      });
      const r = ta.getBoundingClientRect();
      pop.style.left = r.left + 'px';
      pop.style.top = (r.bottom + 2) + 'px';
      pop.style.width = r.width + 'px';
      document.body.appendChild(pop);
    });
    ta.addEventListener('blur', () => setTimeout(close, 150));
  }

  // ── Emoji reactions (Figma-style: any logged-in user can react; shows who) ──
  const REACTION_EMOJIS = ['👍','❤️','🎉','😄','👀','🙏','🤔','🔥'];
  // 決議（採用/不採用/待議）已從留言 overlay 移除，改只在 report.html 操作（使用者 2026-06-01）。
  // decision/decisionNote 仍是 Firestore 欄位，由 report 寫入；pc.js 不再顯示或編輯。
  function toggleReaction(c, emoji, onReact) {
    if (!currentUser) return;
    const me = { uid: currentUser.uid, name: currentUser.displayName || currentUser.email || '匿名' };
    const r = { ...(c.reactions || {}) };
    const list = (r[emoji] || []).slice();
    const i = list.findIndex(u => u.uid === me.uid);
    if (i >= 0) list.splice(i, 1); else list.push(me);
    if (list.length) r[emoji] = list; else delete r[emoji];
    onReact(r);
  }
  function showEmojiPicker(anchor, c, onReact) {
    const existing = document.querySelector('.pc-emoji-picker');
    if (existing) { existing.remove(); return; }
    const pop = el('div', 'pc-emoji-picker');
    REACTION_EMOJIS.forEach(em => {
      const b = el('button', 'pc-emoji-opt'); b.textContent = em;
      b.onclick = (e) => { e.stopPropagation(); toggleReaction(c, em, onReact); pop.remove(); };
      pop.appendChild(b);
    });
    const r = anchor.getBoundingClientRect();
    pop.style.left = Math.min(r.left, window.innerWidth - 220) + 'px';
    pop.style.top = (r.bottom + 4) + 'px';
    document.body.appendChild(pop);
    setTimeout(() => document.addEventListener('click', function h() { pop.remove(); document.removeEventListener('click', h); }), 0);
  }
  // B5（#5 重設計）：顯示「誰按了某 emoji」純名單 popover。
  // 桌機 hover 觸發、手機長按觸發；toggle 自己的反應改由 chip 的 click/tap 處理（不放進此 popover）。
  function showReactionUsers(anchor, emoji, users, { dismissable = false } = {}) {
    document.querySelectorAll('.pc-reaction-users').forEach(p => p.remove());
    const pop = el('div', 'pc-reaction-users');
    const myUid = currentUser && currentUser.uid;
    users.forEach(u => {
      const row = el('div', 'pc-reaction-users-row');
      row.textContent = emoji + '  ' + u.name + (u.uid === myUid ? '（你）' : '');
      pop.appendChild(row);
    });
    const r = anchor.getBoundingClientRect();
    pop.style.left = Math.min(r.left, window.innerWidth - 230) + 'px';
    pop.style.top = (r.bottom + 4) + 'px';
    document.body.appendChild(pop);
    if (dismissable) {
      setTimeout(() => document.addEventListener('pointerdown', function h(ev) {
        if (!pop.contains(ev.target)) { pop.remove(); document.removeEventListener('pointerdown', h); }
      }), 0);
    }
    return pop;
  }
  // 桌機：hover chip 看名單、click toggle；手機：長按 chip 看名單、tap toggle。
  function bindReactionChip(chip, c, emoji, users, onReact) {
    const noHover = window.matchMedia && window.matchMedia('(hover: none)').matches;
    if (noHover) {
      let lpTimer = null, lpFired = false;
      chip.addEventListener('pointerdown', () => {
        lpFired = false;
        lpTimer = setTimeout(() => { lpFired = true; showReactionUsers(chip, emoji, users, { dismissable: true }); }, 400);
      });
      const cancelLp = () => { if (lpTimer) { clearTimeout(lpTimer); lpTimer = null; } };
      chip.addEventListener('pointerup', cancelLp);
      chip.addEventListener('pointercancel', cancelLp);
      chip.addEventListener('pointerleave', cancelLp);
      chip.onclick = (e) => {
        e.stopPropagation();
        if (lpFired) { lpFired = false; return; }   // 長按剛開名單 → 這次 tap 不 toggle
        toggleReaction(c, emoji, onReact);
      };
    } else {
      let hoverPop = null;
      chip.addEventListener('mouseenter', () => { hoverPop = showReactionUsers(chip, emoji, users); });
      chip.addEventListener('mouseleave', () => { if (hoverPop) { hoverPop.remove(); hoverPop = null; } });
      chip.onclick = (e) => {
        e.stopPropagation();
        if (hoverPop) { hoverPop.remove(); hoverPop = null; }
        toggleReaction(c, emoji, onReact);
      };
    }
  }
  function buildReactions(c, onReact) {
    const wrap = el('div', 'pc-ci-reactions');
    const reactions = c.reactions || {};
    const myUid = currentUser && currentUser.uid;
    Object.keys(reactions).forEach(emoji => {
      const users = reactions[emoji] || [];
      if (!users.length) return;
      const chip = el('button', 'pc-reaction-chip');
      if (myUid && users.some(u => u.uid === myUid)) chip.classList.add('mine');
      chip.innerHTML = emoji + ' <span>' + users.length + '</span>';
      chip.title = users.map(u => u.name).join(', ');   // 原生 tooltip fallback
      if (onReact && myUid) bindReactionChip(chip, c, emoji, users, onReact);
      wrap.appendChild(chip);
    });
    if (onReact && myUid) {
      const add = el('button', 'pc-reaction-add'); add.textContent = '🙂'; add.title = '加表情';
      add.onclick = (e) => { e.stopPropagation(); showEmojiPicker(add, c, onReact); };
      wrap.appendChild(add);
    }
    return wrap;
  }

  // Resolve 開放給任何登入者（對齊 GitHub/GitLab：非留言作者限定）。
  // 寫入歸屬欄位 resolvedBy/resolvedByUid/resolvedAt，取消解決時清空。
  function resolvePayload(resolved) {
    return resolved
      ? { resolved: true, resolvedBy: currentUser?.displayName || currentUser?.email || '',
          resolvedByUid: currentUser?.uid || '', resolvedAt: fb.serverTimestamp() }
      : { resolved: false, resolvedBy: '', resolvedByUid: '', resolvedAt: null };
  }

  // Build a single comment item element with edit/delete/resolve actions
  function buildCommentItem(c, isRootComment, { onResolve, onDelete, onDeleteThread, onEdit, onReact, onReply, onUpdated, compact } = {}) {
    const item = el('div', 'pc-comment-item');

    if (!compact && c.authorPhoto) {
      const av = el('img', 'pc-ci-avatar', { src: c.authorPhoto, alt: '' });
      item.appendChild(av);
    }
    const bodyEl = el('div', 'pc-ci-body');
    let txtEl = null;
    // compact（全部留言 panel 的 inline 主留言）：略過頭像／作者／內容，只留 reactions＋操作，
    // 避免與上方 panel item 的作者＋摘要重複（使用者回饋：點開第一項不要又是主留言）。
    if (!compact) {
      const meta = el('div', 'pc-ci-meta');
      const an = el('span', 'pc-ci-author'); an.textContent = c.authorName;
      const at = el('span', 'pc-ci-time');
      at.textContent = timeAgo(c.createdAt) + (c.edited ? ' · 已編輯' : '');
      meta.appendChild(an); meta.appendChild(at);
      bodyEl.appendChild(meta);

      txtEl = el('p', 'pc-ci-text'); txtEl.innerHTML = linkify(c.body, peopleList().map(p => p.name));
      bodyEl.appendChild(txtEl);
    }

    // Emoji reactions row (any logged-in user)
    if (onReact) bodyEl.appendChild(buildReactions(c, onReact));

    const acts = el('div', 'pc-ci-actions');

    // Resolve / Unresolve toggle (root comments only) — D1: root 可 resolve 也可 unresolve
    if (isRootComment && onResolve) {
      const resolveBtn = el('button', 'pc-ci-action resolve');
      resolveBtn.textContent = c.resolved ? '↩ 取消解決' : '✓ Resolve';
      resolveBtn.onclick = async () => {
        await onResolve(!c.resolved);
        if (onUpdated) onUpdated();
      };
      acts.appendChild(resolveBtn);
      if (c.resolved && c.resolvedBy) {
        const by = el('span', 'pc-ci-resolved-by');
        by.textContent = `由 ${c.resolvedBy} 解決`;
        acts.appendChild(by);
      }
    }



    // Reply (any logged-in user) — opens inline reply box; used by note/eng threads
    if (onReply && currentUser) {
      const replyBtn = el('button', 'pc-ci-action');
      replyBtn.textContent = '↩ 回覆';
      replyBtn.onclick = () => {
        if (bodyEl.querySelector('.pc-reply-box')) return;
        const box = el('div', 'pc-reply-box');
        const rta = el('textarea', 'pc-note-textarea', { placeholder: '回覆…（@ 可標記人）' });
        attachMentions(rta);
        const send = el('button', 'pc-note-submit'); send.textContent = '送出';
        const cancel = el('button', 'pc-btn-cancel'); cancel.textContent = '取消';
        cancel.style.cssText = 'margin-left:4px;font-size:11px;padding:4px 8px;';
        const row = el('div', ''); row.style.cssText = 'display:flex;gap:6px;margin-top:6px;';
        row.appendChild(send); row.appendChild(cancel);
        box.appendChild(rta); box.appendChild(row); bodyEl.appendChild(box);
        cancel.onclick = () => box.remove();
        send.onclick = async () => {
          const b = rta.value.trim(); if (!b) return; send.disabled = true;
          await onReply(b); box.remove();
          if (onUpdated) onUpdated();
        };
        rta.focus();
      };
      acts.appendChild(replyBtn);
    }

    // Edit (own comments only) + Delete (own replies only)
    if (currentUser && c.authorUid === currentUser.uid) {
      if (!compact) {
      const editBtn = el('button', 'pc-ci-action');
      editBtn.textContent = '編輯';
      editBtn.onclick = () => {
        txtEl.style.display = 'none';
        acts.style.display = 'none';
        const ta = el('textarea', 'pc-note-textarea');
        ta.value = c.body;
        ta.style.cssText = 'margin-top:6px;';
        const saveBtn = el('button', 'pc-note-submit');
        saveBtn.textContent = '儲存';
        const cancelEdit = el('button', 'pc-btn-cancel');
        cancelEdit.style.cssText = 'margin-left:4px;font-size:11px;padding:4px 8px;';
        cancelEdit.textContent = '取消';
        const row = el('div', '');
        row.style.cssText = 'display:flex;gap:6px;margin-top:6px;';
        row.appendChild(saveBtn);
        row.appendChild(cancelEdit);
        bodyEl.appendChild(ta);
        bodyEl.appendChild(row);

        cancelEdit.onclick = () => {
          ta.remove(); row.remove();
          txtEl.style.display = '';
          acts.style.display = '';
        };
        saveBtn.onclick = async () => {
          const newBody = ta.value.trim();
          if (!newBody) return;
          saveBtn.disabled = true;
          if (onEdit) await onEdit(newBody);
          if (onUpdated) onUpdated();
        };
        ta.focus();
      };
      acts.appendChild(editBtn);
      }

      // Delete — Figma-style: replies delete themselves; root deletes the whole thread (with confirm)
      const delBtn = el('button', 'pc-ci-action');
      delBtn.textContent = '刪除';
      delBtn.onclick = async () => {
        if (isRootComment) {
          if (!confirm('確定要刪除這個 thread 嗎？\n此 thread 的所有留言都會被刪除，且無法復原。')) return;
          if (onDeleteThread) await onDeleteThread();
          else if (onDelete) await onDelete();
        } else {
          if (!confirm('刪除這則留言？')) return;
          if (onDelete) await onDelete();
        }
        if (onUpdated) onUpdated();
      };
      acts.appendChild(delBtn);
    }

    bodyEl.appendChild(acts);
    // 決議（採用/不採用/待議）已從留言 overlay 移除 → 只在 report.html 操作。

    item.appendChild(bodyEl);
    return item;
  }

  function renderThread(commentId, onUpdated) {
    const threadComments = comments.filter(
      c => c.id === commentId || c.parentId === commentId
    );
    if (!threadComments.length) return null;

    const div = el('div', 'pc-thread');
    threadComments.forEach(c => {
      div.appendChild(buildCommentItem(c, c.id === commentId, {
        onResolve: resolved => store.update(c.id, resolvePayload(resolved)),
        onDelete:  ()       => store.remove(c.id),
        onDeleteThread: ()  => Promise.all(threadComments.map(t => store.remove(t.id))),
        onEdit:    body     => store.update(c.id, { body, edited: true }),
        onReact:   r        => store.update(c.id, { reactions: r }),
        onUpdated,
      }));
    });
    return div;
  }

  function positionPopover(popEl, cx, cy) {
    const vw = window.innerWidth, vh = window.innerHeight;
    const pw = popEl.offsetWidth || 268, ph = popEl.scrollHeight || 200;
    let left = cx + 10, top = cy - 10;
    if (left + pw > vw - 10) left = cx - pw - 10;
    if (left < 10) left = 10;
    if (top + ph > vh - 10) top = vh - ph - 10;
    if (top < 10) top = 10;
    popEl.style.left = `${left}px`;
    popEl.style.top  = `${top}px`;
  }

  // ── Render Annotations ───────────────────────────────────────────────────────────
  function renderAnnotations() {
    const overlay = document.getElementById('pc-overlay');
    if (!overlay) { console.warn('[pc] renderAnnotations: overlay not found'); return; }
    refreshScrollEl();

    overlay.querySelectorAll('.pc-annotation').forEach(p => p.remove());
    const screenId = getScreenId();
    const positional = comments.filter(
      c => c.type === 'positional' && c.screenId === screenId && !c.parentId
        && c.x != null && c.y != null
    );
    console.log('[pc] renderAnnotations screenId=', screenId, 'total comments=', comments.length, 'positional this screen=', positional.length);

    positional.forEach((c) => {
      const threadCount = 1 + comments.filter(r => r.parentId === c.id).length;
      const scale = Math.min(1 + Math.log2(threadCount) * 0.3, 2.2).toFixed(2);

      const annotationEl = el('div', `pc-annotation${c.resolved ? ' resolved' : ''}`);
      annotationEl.dataset.commentId = c.id;
      const scrollTop = getScrollTop();
      const overlayH  = overlay.offsetHeight || 1;
      const visualY   = c.y - (scrollTop / overlayH * 100);
      // [ADD 2026-06-16] clipToScrollContainer：annotation 捲出 scrollContainer 可視範圍就整個隱藏（不夾邊緣）。
      // annotation 的視窗 Y = overlay 頂 + visualY% × overlayH；落在 scrollContainer rect 之外（上方被 header
      // 蓋住、或下方捲出）就 skip 不畫。找留言改用「全部留言」清單跳回。
      if (clipToScrollContainer && _scrollEl) {
        const scRect = _scrollEl.getBoundingClientRect();
        const oRect  = overlay.getBoundingClientRect();
        const annotationWinY = oRect.top + (visualY / 100) * overlayH;
        if (annotationWinY < scRect.top || annotationWinY > scRect.bottom) return; // 出可視區 → 不顯示
      }
      const safeMin   = 14 / overlayH * 100;
      const safeMax   = 100 - safeMin;
      const isEdge    = !clipToScrollContainer && (visualY < 0 || visualY > 100);
      const annotationVisualY = isEdge ? Math.max(safeMin, Math.min(safeMax, visualY)) : visualY;
      if (isEdge) annotationEl.classList.add('pc-annotation-edge', visualY < 0 ? 'pc-annotation-edge-top' : 'pc-annotation-edge-bottom');
      annotationEl.style.left = `${c.x}%`;
      annotationEl.style.top  = `${annotationVisualY}%`;
      annotationEl.style.setProperty('--pc-annotation-scale', scale);
      const label = el('span', 'pc-annotation-label');
      // 方案 C 對話泡：icon 放固定寬度框 → 💬(未解決)/✓(已解決) 同寬，兩種 annotation 尺寸一致
      label.innerHTML = '<span class="pc-annotation-ic">' + (c.resolved ? '✓' : '💬') + '</span>' + threadCount;
      annotationEl.appendChild(label);

      annotationEl.addEventListener('click', e => {
        e.stopPropagation();
        if (justDragged) return;
        if (pop.id === c.id) { closeAllPopovers(); return; }
        showThreadPopover(e.clientX, e.clientY, c.id);
      });

      // Long-press (500 ms) to enter drag mode — own unresolved annotations only.
      // 用 Pointer Events + setPointerCapture：游標脫離 annotation（hover 放大造成）也抓得住，
      // 不再因 mouseleave 取消長按。press 期間加 .pressing 停用 hover 放大穩住游標。
      if (currentUser && c.authorUid === currentUser.uid && !c.resolved) {
        let pressTimer = null;
        const startPress = () => {
          annotationEl.classList.add('pressing');
          pressTimer = setTimeout(() => {
            pressTimer = null;
            movingAnnotationId = c.id;
            isDragging = true;
            dragAnnotationEl = annotationEl;
            closeAllPopovers();
            annotationEl.classList.remove('pressing');
            annotationEl.classList.add('moving');
            document.body.classList.add('pc-dragging');
            addDragListeners();
          }, 500);
        };
        const cancelPress = () => {
          if (pressTimer) { clearTimeout(pressTimer); pressTimer = null; }
          annotationEl.classList.remove('pressing');
        };
        annotationEl.addEventListener('pointerdown', e => {
          if (e.button != null && e.button > 0) return;   // 僅主鍵 / 觸控
          e.preventDefault();
          try { annotationEl.setPointerCapture(e.pointerId); } catch (_) {}
          startPress();
        });
        annotationEl.addEventListener('pointerup', cancelPress);
        annotationEl.addEventListener('pointercancel', cancelPress);
        // press 階段（尚未進 drag）明顯移動 → 視為滑動，取消長按
        annotationEl.addEventListener('pointermove', e => {
          if (pressTimer && (Math.abs(e.movementX) > 4 || Math.abs(e.movementY) > 4)) cancelPress();
        });
      }

      overlay.appendChild(annotationEl);
    });
  }

  function showThreadPopover(clientX, clientY, commentId) {
    closeAllPopovers();
    pop.id = commentId;

    const rootC = comments.find(c => c.id === commentId);
    const popEl = el('div', 'pc-popover' + (rootC?.resolved ? ' resolved' : ''));
    pop.el = popEl;

    const closeBtn = el('button', 'pc-popover-close');
    closeBtn.style.marginLeft = 'auto';
    closeBtn.textContent = '✕';
    closeBtn.onclick = closeAllPopovers;
    const hdr = el('div', 'pc-popover-header');
    hdr.appendChild(closeBtn);
    popEl.appendChild(hdr);

    function refreshThread() {
      const existing = popEl.querySelector('.pc-thread');
      if (existing) existing.remove();
      const t = renderThread(commentId, refreshThread);
      if (t) {
        const ta = popEl.querySelector('.pc-textarea');
        ta ? popEl.insertBefore(t, ta) : popEl.appendChild(t);
      }
    }

    const thread = renderThread(commentId, refreshThread);
    if (thread) popEl.appendChild(thread);

    if (currentUser) {
      const ta = el('textarea', 'pc-textarea', { placeholder: '回覆…（@ 可標記人）', rows: '2' });
      attachMentions(ta);
      ta.style.minHeight = '52px';
      popEl.appendChild(ta);
      const actions = el('div', 'pc-popover-actions');
      const submitBtn = el('button', 'pc-btn-submit', { disabled: '' });
      submitBtn.textContent = '回覆';
      ta.addEventListener('input', () => { submitBtn.disabled = !ta.value.trim(); });
      submitBtn.onclick = async () => {
        const body = ta.value.trim();
        if (!body) return;
        const parent = comments.find(c => c.id === commentId);
        await store.save({
          type: 'positional',
          screenId: getScreenId(),
          x: parent?.x ?? 0,
          y: parent?.y ?? 0,
          parentId: commentId,
          body,
          authorUid: currentUser.uid,
          authorName: currentUser.displayName || currentUser.email,
          authorPhoto: currentUser.photoURL || '',
          resolved: false,
        });
        // #4：回覆後保持 popover 開著（像對話 thread），清空輸入方便連續回覆。
        // 不再 closeAllPopovers()——snapshot handler 會自動把新回覆刷進 thread，
        // 這裡先本地 refresh 給即時回饋。
        ta.value = '';
        submitBtn.disabled = true;
        refreshThread();
      };
      actions.appendChild(submitBtn);
      popEl.appendChild(actions);
    }

    document.body.appendChild(popEl);
    positionPopover(popEl, clientX, clientY);
  }

  // ── Firestore Subscription ─────────────────────────────────────────────────
  function subscribe() {
    if (unsub) { unsub(); unsub = null; }

    const mode = getMode();
    let q;

    if (mode === 'eng') {
      q = store.query(fb.where('type', '==', 'note'));
    } else {
      const screenId = getScreenId();
      q = store.query(fb.where('screenId', '==', screenId));
    }

    console.log('[pc] subscribe() screenId=', getScreenId(), 'mode=', mode);
    unsub = store.subscribe(q, incoming => {
      console.log('[pc] snapshot fired:', incoming.length, 'docs');
      const sorted = [...incoming].sort(
        (a, b) => (a.createdAt?.toMillis?.() ?? 0) - (b.createdAt?.toMillis?.() ?? 0)
      );

      if (mode === 'eng') {
        comments = [
          ...comments.filter(c => c.type !== 'note'),
          ...sorted,
        ];
      } else {
        const screenId = getScreenId();
        comments = [
          ...comments.filter(c => c.screenId !== screenId),
          ...sorted,
        ];
      }

      renderAnnotations();
      noteModule.refresh({ updateThreads: true });

      if (pop.id && pop.el) {
        const thread = pop.el.querySelector('.pc-thread');
        if (thread) {
          const newThread = renderThread(pop.id);
          if (newThread) thread.replaceWith(newThread);
        }
      }
    }, err => {
      console.warn('[prototype-comments] snapshot error:', err);
    });
  }

  // ── Global Panel Subscription ─────────────────────────────────────────────
  function subscribeAll() {
    if (panel.unsub) { panel.unsub(); panel.unsub = null; }
    panel.unsub = store.subscribe(store.query(), incoming => {
      allComments = [...incoming].sort(
        (a, b) => (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0)
      );
      if (panel.open) renderPanel();
      updatePanelBadge();
    }, err => console.warn('[pc] subscribeAll error:', err));
  }

  function updatePanelBadge() {
    const btn = document.getElementById('pc-panel-btn');
    if (!btn) return;
    const n = allComments.filter(c => !c.parentId && !c.resolved).length;
    btn.textContent = n > 0 ? `📋 全部留言 (${n})` : '📋 全部留言';
  }

  // ── Global Comment Panel ───────────────────────────────────────────────────
  function buildPanel() {
    if (document.getElementById('pc-panel')) return;
    const p = el('div', 'pc-panel');
    p.id = 'pc-panel';
    document.body.appendChild(p);
    panel.el = p;
  }

  function openPanel() {
    buildPanel();
    panel.open = true;
    panel.el.classList.add('open');
    renderPanel();
  }

  function closePanel() {
    panel.open = false;
    if (panel.el) panel.el.classList.remove('open');
  }

  // Expand a note thread inside the panel. B10: root 的控制項（reactions／resolve／回覆／
  // 決議）放到 panel item 本身（最外層）；下方展開區只列「回覆（replies）」，不再把 root
  // 渲成一張獨立卡 → 解決「點開後第一則留言又出現一次」。
  // 控制項包一層 .pc-panel-root-ctrl：item.onclick 的 guard 會略過它，避免點 resolve／回覆／
  // 決議時誤觸發 item 的展開 toggle。
  function renderExpandedNote(item, root) {
    const key = root.noteKey;
    const all = allComments.filter(x => x.type === 'note' && x.noteKey === key);
    const replies = all.filter(x => x.parentId === root.id)
      .sort((a, b) => (a.createdAt?.toMillis?.() ?? 0) - (b.createdAt?.toMillis?.() ?? 0));
    const saveReply = body => store.save({
      type: 'note', screenId: root.screenId, noteKey: key, noteTag: root.noteTag, noteText: root.noteText,
      parentId: root.id, body,
      authorUid: currentUser.uid, authorName: currentUser.displayName || currentUser.email,
      authorPhoto: currentUser.photoURL || '', resolved: false,
    });

    const ctrl = el('div', 'pc-panel-root-ctrl');
    ctrl.appendChild(buildCommentItem(root, true, {
      compact: true,
      onResolve: r => store.update(root.id, resolvePayload(r)),
      onDelete:  () => store.remove(root.id),
      onDeleteThread: () => Promise.all(
        all.filter(x => x.id === root.id || x.parentId === root.id).map(t => store.remove(t.id))),
      onEdit:    b => store.update(root.id, { body: b, edited: true }),
      onReact:   r => store.update(root.id, { reactions: r }),
      onReply:   currentUser ? saveReply : null,
      onUpdated: renderPanel,
    }));
    item.appendChild(ctrl);

    if (replies.length) {
      const inline = el('div', 'pc-panel-inline-thread');
      const ind = el('div', 'pc-note-replies');
      replies.forEach(r => ind.appendChild(buildCommentItem(r, false, {
        onDelete: () => store.remove(r.id),
        onEdit:   b => store.update(r.id, { body: b, edited: true }),
        onReact:  rr => store.update(r.id, { reactions: rr }),
        // D1: replies 不可再回覆 — 不傳 onReply
        onUpdated: renderPanel,
      })));
      inline.appendChild(ind);
      item.appendChild(inline);
    }
  }

  function renderPanel() {
    if (!panel.el) return;
    panel.el.innerHTML = '';

    const hdr = el('div', 'pc-panel-header');
    const title = el('span', 'pc-panel-title'); title.textContent = '💬 全部留言';
    const closeBtn = el('button', 'pc-popover-close');
    closeBtn.textContent = '✕'; closeBtn.onclick = closePanel;
    hdr.appendChild(title); hdr.appendChild(closeBtn);
    panel.el.appendChild(hdr);

    const tabs = el('div', 'pc-panel-tabs');
    [['all', '全部'], ['open', '未解決'], ['resolved', '已解決']].forEach(([f, label]) => {
      const tab = el('button', `pc-panel-tab${panel.filter === f ? ' active' : ''}`);
      tab.textContent = label;
      tab.onclick = () => { panel.filter = f; renderPanel(); };
      tabs.appendChild(tab);
    });
    panel.el.appendChild(tabs);

    // Search box (Figma-style)
    const searchWrap = el('div', 'pc-panel-search');
    const searchInput = el('input', 'pc-panel-search-input', { type: 'text', placeholder: '🔍 搜尋留言、作者、tag、畫面…' });
    searchInput.value = panel.search || '';
    let composing = false;
    searchInput.addEventListener('compositionstart', () => { composing = true; });
    searchInput.addEventListener('compositionend', () => {
      composing = false; panel.search = searchInput.value; renderPanelList();
    });
    searchInput.oninput = () => {
      if (composing) return;            // mid-IME composition (注音/拼音) — don't re-filter yet
      panel.search = searchInput.value;
      renderPanelList();                // re-render ONLY the list → input element survives, IME intact
    };
    searchWrap.appendChild(searchInput);
    panel.el.appendChild(searchWrap);

    // Tag filter chips (clickable) + sort button — kept visually separate from status tabs
    const toolbar = el('div', 'pc-panel-toolbar');
    const chipsWrap = el('div', 'pc-panel-tagchips');
    // Type filter: 標註 (positional annotations) vs 規格 (note comments)。tag 名稱按「留言貼在哪」命名，
    //   不綁「誰留的」——positional annotation=畫面上隨手標一點(標註)；note=針對規格說明清單某條(規格)。
    [['all', '全部項目'], ['design', '📍 標註'], ['eng', '📋 規格']].forEach(([t, label]) => {
      const chip = el('button', `pc-panel-tagchip pc-panel-typechip${panel.typeFilter === t ? ' active' : ''}`);
      chip.textContent = label;
      chip.onclick = () => { panel.typeFilter = t; renderPanel(); };
      chipsWrap.appendChild(chip);
    });
    const tags = [...new Set(allComments.filter(c => !c.parentId && c.noteTag).map(c => c.noteTag))];
    tags.forEach(t => {
      const chip = el('button', `pc-panel-tagchip${panel.tagFilter === t ? ' active' : ''}`);
      chip.textContent = '#' + t;
      chip.onclick = () => { panel.tagFilter = panel.tagFilter === t ? null : t; renderPanel(); };
      chipsWrap.appendChild(chip);
    });
    toolbar.appendChild(chipsWrap);
    const sortBtn = el('button', 'pc-panel-sort');
    sortBtn.textContent = panel.sort === 'old' ? '↑ 最舊優先' : '↓ 最新優先';
    sortBtn.title = '切換排序';
    sortBtn.onclick = () => { panel.sort = panel.sort === 'old' ? 'new' : 'old'; renderPanel(); };
    toolbar.appendChild(sortBtn);
    panel.el.appendChild(toolbar);

    panel.listEl = el('div', 'pc-panel-list');
    panel.el.appendChild(panel.listEl);
    renderPanelList();
  }

  // Re-renders ONLY the list portion. Called on every search keystroke so the
  // search <input> element is never destroyed mid-IME-composition (注音 bug fix).
  function renderPanelList() {
    const list = panel.listEl;
    if (!list) return;
    list.innerHTML = '';

    const annotationNums = {};
    [...allComments]
      .filter(c => !c.parentId && c.type === 'positional')
      .sort((a, b) => (a.createdAt?.toMillis?.() ?? 0) - (b.createdAt?.toMillis?.() ?? 0))
      .forEach(c => {
        if (!annotationNums[c.screenId]) annotationNums[c.screenId] = {};
        annotationNums[c.screenId][c.id] = Object.keys(annotationNums[c.screenId]).length + 1;
      });

    const q = (panel.search || '').trim().toLowerCase();
    const roots = allComments.filter(c => !c.parentId && (
      panel.filter === 'all'      ? true :
      panel.filter === 'open'     ? !c.resolved :
      /* resolved */                 c.resolved
    )).filter(c => !panel.tagFilter || c.noteTag === panel.tagFilter)
      .filter(c => panel.typeFilter === 'all' ? true :
                   panel.typeFilter === 'design' ? c.type === 'positional' :
                   /* eng */ c.type === 'note')
      .filter(c => {
        if (!q) return true;
        return [c.body, c.authorName, c.noteTag, c.noteText, c.screenId]
          .filter(Boolean).join(' ').toLowerCase().includes(q);
      })
      .sort((a, b) => {
        const ta = a.createdAt?.toMillis?.() ?? 0, tb = b.createdAt?.toMillis?.() ?? 0;
        return panel.sort === 'old' ? ta - tb : tb - ta;
      });

    if (!roots.length) {
      const empty = el('div', 'pc-panel-empty');
      empty.textContent =
        q                           ? '找不到符合的留言' :
        panel.filter === 'open'     ? '沒有未解決的留言 🎉' :
        panel.filter === 'resolved' ? '還沒有已解決的留言' : '還沒有留言';
      list.appendChild(empty);
    } else {
      roots.forEach(c => {
        const item = el('div', `pc-panel-item${c.resolved ? ' resolved' : ''}`);
        if (c.type === 'note') {
          // Note/eng comment 點擊行為：noteJump=false(截圖版) → inline 展開討論串(reliable)；
          //   noteJump=true(live overlay) → 跳到該 note（navigateToComment 會發 pc:note-jump 開抽屜）。
          item.onclick = (e) => {
            // 點最外層控制項(.pc-panel-root-ctrl) 或回覆區(.pc-panel-inline-thread) 內 → 不要 toggle 收合
            if (e.target.closest('.pc-panel-inline-thread, .pc-panel-root-ctrl')) return;
            if (noteJump) { navigateToComment(c); return; }
            panel.expandedNote = panel.expandedNote === c.noteKey ? null : c.noteKey;
            renderPanel();
          };
        } else {
          item.onclick = () => navigateToComment(c);
        }

        const topRow = el('div', 'pc-panel-top-row');
        const modeChip = el('span', 'pc-panel-chip');
        if (c.type === 'note') {
          modeChip.textContent = '📋 規格';
          modeChip.style.cssText = 'background:rgba(99,102,241,.12);color:#6366f1;';
        } else {
          modeChip.textContent = '📍 標註';
        }
        topRow.appendChild(modeChip);
        if (c.type === 'note' && c.noteTag) {
          const tagChip = el('span', 'pc-panel-chip'); tagChip.textContent = c.noteTag;
          topRow.appendChild(tagChip);
        } else if (c.type === 'positional') {
          if (c.screenId) {
            const chip = el('span', 'pc-panel-chip'); chip.textContent = c.screenId;
            topRow.appendChild(chip);
          }
          if (annotationNums[c.screenId]?.[c.id]) {
            const num = el('span', 'pc-panel-num');
            num.textContent = `#${annotationNums[c.screenId][c.id]}`;
            topRow.appendChild(num);
          }
        }
        if (c.resolved) {
          const rb = el('span', 'pc-panel-resolved-badge');
          rb.textContent = c.resolvedBy ? `✓ ${c.resolvedBy} 已解決` : '✓ 已解決';
          topRow.appendChild(rb);
        }
        const at = el('span', 'pc-ci-time'); at.textContent = timeAgo(c.createdAt);
        topRow.style.flex = '1';
        at.style.marginLeft = 'auto';
        topRow.appendChild(at);
        item.appendChild(topRow);

        const authorRow = el('div', 'pc-panel-meta');
        if (c.authorPhoto) {
          const av = el('img', 'pc-ci-avatar', { src: c.authorPhoto, alt: '' });
          authorRow.appendChild(av);
        }
        const an = el('span', 'pc-ci-author'); an.textContent = c.authorName || '匿名';
        authorRow.appendChild(an);
        item.appendChild(authorRow);

        const txt = el('p', 'pc-panel-excerpt');
        txt.textContent = (c.body || '').slice(0, 60) + ((c.body || '').length > 60 ? '…' : '');
        item.appendChild(txt);

        const replies = allComments.filter(r => r.parentId === c.id).length;
        if (replies > 0) {
          const rc = el('span', 'pc-panel-reply-count');
          rc.textContent = `↩ ${replies} 則回覆`;
          item.appendChild(rc);
        }

        // Inline-expanded note thread (B10: 控制項在 item 最外層、展開區只列回覆)
        if (c.type === 'note' && panel.expandedNote === c.noteKey) {
          renderExpandedNote(item, c);
        }

        list.appendChild(item);
      });
    }
  }

  async function navigateToComment(comment) {
    closePanel();
    // B6: 只有換頁才走 navigate；同頁也讓出一個 tick 對齊時序（避免同步路徑下
    //     剛開的 popover 被同一輪事件處理清掉），確保已在該頁時仍能「跳出來」
    const onOtherScreen = navigateTo && comment.screenId && comment.screenId !== getScreenId();
    if (onOtherScreen) navigateTo(comment.screenId);
    await new Promise(r => setTimeout(r, onOtherScreen ? 150 : 0));

    if (comment.type === 'note' && comment.noteKey) {
      // [ADD 2026-06-16] live overlay：note 在 React 抽屜（keepMounted 但視覺關閉）。發事件讓
      //   consumer 開抽屜，pc.js 再捲到對應 row 並開討論串。截圖版用不到 noteJump（走 inline 展開），
      //   此分支不會被觸發，故只在 noteJump 時 dispatch。
      if (noteJump) {
        document.dispatchEvent(new CustomEvent('pc:note-jump', { detail: {
          screenId: comment.screenId, noteKey: comment.noteKey,
          noteTag: comment.noteTag, noteText: comment.noteText,
        } }));
      }
      // 找對應 .eng-note-row。開抽屜 + screen-change 重新注入(💬 按鈕)有時序，按鈕未必馬上在 →
      // 輪詢（最多 ~660ms）等 row 帶 .pc-note-comment-btn 後再捲動 + 開討論串。
      const findRow = () => {
        for (const row of document.querySelectorAll('[data-pc-injected]')) {
          if (noteKey(row.dataset.pcTag || '', row.dataset.pcText || '') === comment.noteKey) return row;
        }
        return null;
      };
      for (let i = 0; i < 11; i++) {
        const row = findRow();
        if (row && row.querySelector('.pc-note-comment-btn')) {
          row.scrollIntoView({ behavior: 'smooth', block: 'center' });
          const thread = row.nextElementSibling;
          const isOpen = thread?.classList.contains('pc-note-thread') && thread.classList.contains('open');
          if (!isOpen) row.querySelector('.pc-note-comment-btn')?.click(); // toggle：未開(含尚未建立)就開
          return;
        }
        await new Promise(r => setTimeout(r, 60));
      }
      return;
    }

    const overlay = document.getElementById('pc-overlay');
    if (overlay && comment.x != null) {
      // B6: 高亮該 annotation 讓留言「跳出來」（同頁無換頁動畫時的視覺回饋）
      const annotationEl = overlay.querySelector(`.pc-annotation[data-comment-id="${comment.id}"]`);
      if (annotationEl) {
        annotationEl.classList.remove('pc-annotation-flash');
        void annotationEl.offsetWidth;            // reflow → 重新觸發 animation
        annotationEl.classList.add('pc-annotation-flash');
        setTimeout(() => annotationEl.classList.remove('pc-annotation-flash'), 1300);
      }
      const rect = overlay.getBoundingClientRect();
      const cx = rect.left + (comment.x / 100) * rect.width;
      const cy = rect.top  + (comment.y / 100) * rect.height - getScrollTop();
      showThreadPopover(cx, cy, comment.id);
    }
  }

  // ── Note Module (lazy init after store is ready) ───────────────────────────
  const noteModule = createNoteModule({
    store,
    getCurrentUser: () => currentUser,
    attachMentions,
    getScreenId,
    engNoteSelector,
    getComments:    () => comments,
    noteKey,
    el,
    timeAgo,
    buildCommentItem,
  });

  // ── Screen-change listener ─────────────────────────────────────────────────
  document.addEventListener('pc:screen-change', ({ detail }) => {
    setCommentMode(false);
    closeAllPopovers();
    setTimeout(() => {
      mountOverlay();
      renderAnnotations();
      noteModule.injectAll();
    }, 30);
    subscribe();
  });

  const observer = new MutationObserver(() => {
    if (!document.getElementById('pc-overlay')) mountOverlay();
    noteModule.injectAll();
    noteModule.refresh();
  });
  observer.observe(document.body, { childList: true, subtree: true });

  // ── Auth State ─────────────────────────────────────────────────────────────
  fb.onAuthStateChanged(auth, user => {
    currentUser = user;
    console.log('[pc] auth state:', user ? `logged in as ${user.email}` : 'not logged in');
    renderAuthBar(user);
    if (user) {
      subscribe();
      subscribeAll();
      buildPanel();
    } else {
      if (unsub)       { unsub();         unsub       = null; }
      if (panel.unsub) { panel.unsub();   panel.unsub = null; }
      comments    = [];
      allComments = [];
      closePanel();
      renderAnnotations();
    }
  });

  // ── Bootstrap ─────────────────────────────────────────────────────────────
  mountAuthBar();
  mountOverlay();

  subscribe();

  setTimeout(() => noteModule.injectAll(), 200);

  document.addEventListener('click', e => {
    if (pop.el && !pop.el.contains(e.target)) {
      const isAnnotation = e.target.closest('.pc-annotation');
      if (!isAnnotation) { annotation.current = null; closeAllPopovers(); }
    }
  });

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && (movingAnnotationId || isDragging)) cancelMovingAnnotation();
  });

  return {
    setCommentMode,
    getComments: () => comments,
    subscribe,
  };
}
