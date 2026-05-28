/**
 * prototype-comments
 * Drop-in Firebase comment overlay for HTML prototypes.
 *
 * Usage:
 *   import { initPrototypeComments } from '.../src/index.js';
 *   initPrototypeComments({ firebaseConfig, projectId, getScreenId, getMode,
 *                           designTarget, engNoteSelector });
 *
 * No secrets are stored here. All Firebase config is passed by the consumer.
 */

import { STYLES } from './styles.js';

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

// ─── Main Init ───────────────────────────────────────────────────────────────
export async function initPrototypeComments(opts = {}) {
  const {
    firebaseConfig,
    projectId   = 'default',
    getScreenId = () => 'unknown',
    getMode     = () => 'design',
    designTarget = '#phone',
    engNoteSelector = '.eng-note-row',
  } = opts;

  if (!firebaseConfig) {
    console.error('[prototype-comments] firebaseConfig is required');
    return;
  }

  injectStyles();

  // Load Firebase SDK
  const fb = await loadFirebase();

  // Init Firebase app (avoid duplicate)
  const app = fb.getApps().length
    ? fb.getApp()
    : fb.initializeApp(firebaseConfig);

  const db   = fb.getFirestore(app);
  const auth = fb.getAuth(app);

  // ── State ──────────────────────────────────────────────────────────────────
  let currentUser     = null;
  let commentMode     = false;   // is comment overlay active?
  let unsub           = null;    // Firestore onSnapshot unsubscribe
  let comments        = [];      // current snapshot
  let pendingPin      = null;    // { x%, y% } waiting for input
  let openPopoverId   = null;    // which pin's popover is open

  const colPath = () =>
    fb.collection(db, 'prototype-comments', projectId, 'comments');

  // ── Auth Bar ───────────────────────────────────────────────────────────────
  function buildAuthBar() {
    const bar = el('div', 'pc-auth-bar');
    bar.id = 'pc-auth-bar';

    const signInBtn = el('button', 'pc-sign-in-btn');
    signInBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 48 48" fill="none"><path d="M44.5 20H24v8.5h11.8C34.7 33.9 30.1 37 24 37c-7.2 0-13-5.8-13-13s5.8-13 13-13c3.1 0 5.9 1.1 8.1 2.9l6.4-6.4C34.6 4.1 29.6 2 24 2 11.8 2 2 11.8 2 24s9.8 22 22 22c11 0 21-8 21-22 0-1.3-.2-2.7-.5-4z" fill="#4285F4"/><path d="M6.3 14.7l7 5.1C15.1 16.6 19.2 14 24 14c3.1 0 5.9 1.1 8.1 2.9l6.4-6.4C34.6 4.1 29.6 2 24 2 16.3 2 9.7 7.4 6.3 14.7z" fill="#EA4335"/><path d="M24 46c5.9 0 10.9-2 14.5-5.3l-6.7-5.5C29.7 36.9 27 38 24 38c-6.1 0-10.7-3.1-11.8-7.5l-7 5.4C9.2 43.1 16.1 46 24 46z" fill="#34A853"/><path d="M44.5 20H24v8.5h11.8c-.6 2.3-2 4.3-3.8 5.7l6.7 5.5C42.6 36.2 46 30.5 46 24c0-1.3-.2-2.7-.5-4h-1z" fill="#FBBC05"/></svg> Sign in with Google`;
    signInBtn.onclick = () =>
      fb.signInWithPopup(auth, new fb.GoogleAuthProvider());

    bar.appendChild(signInBtn);
    return { bar, signInBtn };
  }

  function renderAuthBar(user) {
    const bar = document.getElementById('pc-auth-bar');
    if (!bar) return;
    bar.innerHTML = '';

    if (!user) {
      const btn = el('button', 'pc-sign-in-btn');
      btn.innerHTML = `<svg width="14" height="14" viewBox="0 0 48 48" fill="none"><path d="M44.5 20H24v8.5h11.8C34.7 33.9 30.1 37 24 37c-7.2 0-13-5.8-13-13s5.8-13 13-13c3.1 0 5.9 1.1 8.1 2.9l6.4-6.4C34.6 4.1 29.6 2 24 2 11.8 2 2 11.8 2 24s9.8 22 22 22c11 0 21-8 21-22 0-1.3-.2-2.7-.5-4z" fill="#4285F4"/></svg> Sign in with Google`;
      btn.onclick = () =>
        fb.signInWithPopup(auth, new fb.GoogleAuthProvider());
      bar.appendChild(btn);
      return;
    }

    // Avatar
    if (user.photoURL) {
      const img = el('img', 'pc-user-avatar', { src: user.photoURL, alt: user.displayName });
      bar.appendChild(img);
    }
    // Name
    const name = el('span', 'pc-user-name');
    name.textContent = user.displayName || user.email;
    bar.appendChild(name);

    // Comment toggle
    const toggle = el('button', 'pc-comment-toggle');
    toggle.id = 'pc-comment-toggle';
    toggle.innerHTML = '💬 留言模式';
    toggle.onclick = () => setCommentMode(!commentMode);
    bar.appendChild(toggle);

    // Sign out (small link)
    const so = el('button', 'pc-sign-in-btn');
    so.style.cssText = 'font-size:11px;opacity:.6;padding:4px 8px;';
    so.textContent = '登出';
    so.onclick = () => fb.signOut(auth);
    bar.appendChild(so);
  }

  // Inject auth bar into page header
  function mountAuthBar() {
    const header = document.querySelector('header, .header, nav, .nav, #header');
    if (!header) {
      // Fallback: floating bar top-right
      const wrap = el('div', 'pc-auth-bar');
      wrap.id = 'pc-auth-bar';
      wrap.style.cssText = 'position:fixed;top:12px;right:16px;z-index:9000;background:#fff;padding:6px 10px;border-radius:10px;box-shadow:0 2px 12px rgba(0,0,0,.15);';
      document.body.appendChild(wrap);
    } else {
      const { bar } = buildAuthBar();
      header.appendChild(bar);
    }
  }

  // ── Overlay & Positional Pins ──────────────────────────────────────────────
  function getDesignTarget() {
    return document.querySelector(designTarget);
  }

  function mountOverlay() {
    const target = getDesignTarget();
    if (!target || document.getElementById('pc-overlay')) return;
    if (getComputedStyle(target).position === 'static') {
      target.style.position = 'relative';
    }
    const overlay = el('div', 'pc-overlay');
    overlay.id = 'pc-overlay';
    target.appendChild(overlay);

    overlay.addEventListener('click', e => {
      if (!commentMode || !currentUser) return;
      e.stopPropagation();
      const rect = overlay.getBoundingClientRect();
      const x = ((e.clientX - rect.left) / rect.width * 100).toFixed(2);
      const y = ((e.clientY - rect.top) / rect.height * 100).toFixed(2);
      closeAllPopovers();
      // Set AFTER closeAllPopovers (which no longer clears pendingPin)
      pendingPin = { x: parseFloat(x), y: parseFloat(y) };
      console.log('[pc] overlay click → pendingPin set to', pendingPin);
      showInputPopover(e.clientX, e.clientY, null);
    });
  }

  function setCommentMode(active) {
    commentMode = active;
    const overlay = document.getElementById('pc-overlay');
    if (overlay) overlay.classList.toggle('active', active);
    const toggle = document.getElementById('pc-comment-toggle');
    if (toggle) toggle.classList.toggle('active', active);
    if (!active) { pendingPin = null; closeAllPopovers(); }
  }

  // ── Popover (input / thread) ───────────────────────────────────────────────
  let popoverEl = null;

  function closeAllPopovers() {
    if (popoverEl) { popoverEl.remove(); popoverEl = null; }
    openPopoverId = null;
    // pendingPin is NOT reset here — the overlay click flow sets it just
    // before calling showInputPopover, and showInputPopover calls this too.
    // pendingPin is explicitly cleared only at submit / cancel / outside-click.
  }

  function showInputPopover(clientX, clientY, commentId) {
    closeAllPopovers();
    if (!currentUser) return;

    const pop = el('div', 'pc-popover');
    popoverEl = pop;

    // Header
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
    closeBtn.onclick = () => { pendingPin = null; closeAllPopovers(); };
    hdr.appendChild(closeBtn);
    pop.appendChild(hdr);

    // Thread (if existing comment)
    if (commentId) {
      const thread = renderThread(commentId);
      if (thread) pop.appendChild(thread);
    }

    // Input
    const ta = el('textarea', 'pc-textarea', { placeholder: '留下你的意見…' });
    pop.appendChild(ta);
    ta.focus();

    const actions = el('div', 'pc-popover-actions');
    const cancelBtn = el('button', 'pc-btn-cancel');
    cancelBtn.textContent = '取消';
    cancelBtn.onclick = () => { pendingPin = null; closeAllPopovers(); };
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
        x: pendingPin ? pendingPin.x : null,
        y: pendingPin ? pendingPin.y : null,
        body,
        authorUid: currentUser.uid,
        authorName: currentUser.displayName || currentUser.email,
        authorPhoto: currentUser.photoURL || '',
        resolved: false,
        createdAt: fb.serverTimestamp(),
      };

      if (commentId) {
        // reply to existing thread — for MVP treat as new top-level comment at same position
        const parent = comments.find(c => c.id === commentId);
        if (parent) {
          data.x = parent.x;
          data.y = parent.y;
          data.parentId = commentId;
        }
      }

      console.log('[pc] addDoc x=', data.x, 'y=', data.y, 'screenId=', data.screenId, 'pendingPin=', pendingPin);
      try {
        await fb.addDoc(colPath(), data);
        console.log('[pc] addDoc success');
      } catch(e) {
        console.error('[pc] addDoc FAILED:', e.message, e.code);
      }
      pendingPin = null;
      closeAllPopovers();
    };

    actions.appendChild(cancelBtn);
    actions.appendChild(submitBtn);
    pop.appendChild(actions);

    // Position
    document.body.appendChild(pop);
    positionPopover(pop, clientX, clientY);
  }

  // Build a single comment item element with edit/delete/resolve actions
  function buildCommentItem(c, isRootComment, onUpdated) {
    const item = el('div', 'pc-comment-item');

    if (c.authorPhoto) {
      const av = el('img', 'pc-ci-avatar', { src: c.authorPhoto, alt: '' });
      item.appendChild(av);
    }
    const bodyEl = el('div', 'pc-ci-body');
    const meta = el('div', 'pc-ci-meta');
    const an = el('span', 'pc-ci-author'); an.textContent = c.authorName;
    const at = el('span', 'pc-ci-time');
    at.textContent = timeAgo(c.createdAt) + (c.edited ? ' · 已編輯' : '');
    meta.appendChild(an); meta.appendChild(at);
    bodyEl.appendChild(meta);

    // Text or edit form
    const txtEl = el('p', 'pc-ci-text'); txtEl.textContent = c.body;
    bodyEl.appendChild(txtEl);

    const acts = el('div', 'pc-ci-actions');

    // Resolve (root comments only)
    if (!c.resolved && isRootComment) {
      const resolveBtn = el('button', 'pc-ci-action resolve');
      resolveBtn.textContent = '✓ Resolve';
      resolveBtn.onclick = async () => {
        await fb.updateDoc(
          fb.doc(db, 'prototype-comments', projectId, 'comments', c.id),
          { resolved: true }
        );
        if (onUpdated) onUpdated();
      };
      acts.appendChild(resolveBtn);
    }

    // Edit + Delete (own comments only)
    if (currentUser && c.authorUid === currentUser.uid) {
      // Edit
      const editBtn = el('button', 'pc-ci-action');
      editBtn.textContent = '編輯';
      editBtn.onclick = () => {
        // Swap text for inline editor
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
          await fb.updateDoc(
            fb.doc(db, 'prototype-comments', projectId, 'comments', c.id),
            { body: newBody, edited: true }
          );
          if (onUpdated) onUpdated();
        };
        ta.focus();
      };
      acts.appendChild(editBtn);

      // Delete
      const delBtn = el('button', 'pc-ci-action');
      delBtn.textContent = '刪除';
      delBtn.onclick = async () => {
        if (!confirm('刪除這則留言？')) return;
        await fb.deleteDoc(
          fb.doc(db, 'prototype-comments', projectId, 'comments', c.id)
        );
        if (onUpdated) onUpdated();
      };
      acts.appendChild(delBtn);
    }

    bodyEl.appendChild(acts);
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
      div.appendChild(buildCommentItem(c, c.id === commentId, onUpdated));
    });
    return div;
  }

  function positionPopover(pop, cx, cy) {
    const vw = window.innerWidth, vh = window.innerHeight;
    const pw = 268, ph = 200;
    let left = cx + 10, top = cy - 10;
    if (left + pw > vw - 10) left = cx - pw - 10;
    if (top + ph > vh - 10) top = vh - ph - 10;
    if (top < 10) top = 10;
    pop.style.left = `${left}px`;
    pop.style.top  = `${top}px`;
  }

  // ── Render Pins ───────────────────────────────────────────────────────────
  function renderPins() {
    const overlay = document.getElementById('pc-overlay');
    if (!overlay) { console.warn('[pc] renderPins: overlay not found'); return; }

    overlay.querySelectorAll('.pc-pin').forEach(p => p.remove());
    const screenId = getScreenId();
    const positional = comments.filter(
      c => c.type === 'positional' && c.screenId === screenId && !c.parentId
        && c.x != null && c.y != null   // skip old bad-data docs with null coords
    );
    console.log('[pc] renderPins screenId=', screenId, 'total comments=', comments.length, 'positional this screen=', positional.length);

    positional.forEach((c, i) => {
      const pin = el('div', `pc-pin${c.resolved ? ' resolved' : ''}`);
      pin.style.left = `${c.x}%`;
      pin.style.top  = `${c.y}%`;
      const label = el('span', 'pc-pin-label');
      label.textContent = i + 1;
      pin.appendChild(label);

      pin.addEventListener('click', e => {
        e.stopPropagation();
        if (openPopoverId === c.id) { closeAllPopovers(); return; }
        openPopoverId = c.id;
        showThreadPopover(e.clientX, e.clientY, c.id);
      });
      overlay.appendChild(pin);
    });
  }

  function showThreadPopover(clientX, clientY, commentId) {
    closeAllPopovers();
    openPopoverId = commentId;

    const pop = el('div', 'pc-popover');
    popoverEl = pop;

    const closeBtn = el('button', 'pc-popover-close');
    closeBtn.style.marginLeft = 'auto';
    closeBtn.textContent = '✕';
    closeBtn.onclick = closeAllPopovers;
    const hdr = el('div', 'pc-popover-header');
    hdr.appendChild(closeBtn);
    pop.appendChild(hdr);

    // onUpdated: re-render thread in-place after edit/delete/resolve
    function refreshThread() {
      const existing = pop.querySelector('.pc-thread');
      if (existing) existing.remove();
      const t = renderThread(commentId, refreshThread);
      if (t) {
        // insert before the textarea (if any)
        const ta = pop.querySelector('.pc-textarea');
        ta ? pop.insertBefore(t, ta) : pop.appendChild(t);
      }
    }

    const thread = renderThread(commentId, refreshThread);
    if (thread) pop.appendChild(thread);

    if (currentUser) {
      const ta = el('textarea', 'pc-textarea', { placeholder: '回覆…', rows: '2' });
      ta.style.minHeight = '52px';
      pop.appendChild(ta);
      const actions = el('div', 'pc-popover-actions');
      const submitBtn = el('button', 'pc-btn-submit', { disabled: '' });
      submitBtn.textContent = '回覆';
      ta.addEventListener('input', () => { submitBtn.disabled = !ta.value.trim(); });
      submitBtn.onclick = async () => {
        const body = ta.value.trim();
        if (!body) return;
        const parent = comments.find(c => c.id === commentId);
        await fb.addDoc(colPath(), {
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
          createdAt: fb.serverTimestamp(),
        });
        closeAllPopovers();
      };
      actions.appendChild(submitBtn);
      pop.appendChild(actions);
    }

    document.body.appendChild(pop);
    positionPopover(pop, clientX, clientY);
  }

  // ── Note Comments ─────────────────────────────────────────────────────────
  // Note comments are identified by noteKey(tag, text) — shared across modes.

  function getNoteComments(tag, text) {
    const key = noteKey(tag, text);
    return comments.filter(c => c.type === 'note' && c.noteKey === key);
  }

  function renderNoteThread(threadEl, tag, text) {
    threadEl.innerHTML = '';
    const nc = getNoteComments(tag, text);
    const refresh = () => renderNoteThread(threadEl, tag, text);

    nc.forEach(c => {
      threadEl.appendChild(buildCommentItem(c, true, refresh));
    });

    // Input
    if (currentUser) {
      const wrap = el('div', 'pc-note-input-wrap');
      const ta = el('textarea', 'pc-note-textarea', { placeholder: '留言…' });
      const btn = el('button', 'pc-note-submit', { disabled: '' });
      btn.textContent = '送出';
      ta.addEventListener('input', () => { btn.disabled = !ta.value.trim(); });
      btn.onclick = async () => {
        const body = ta.value.trim();
        if (!body) return;
        btn.disabled = true;
        await fb.addDoc(colPath(), {
          type:        'note',
          screenId:    getScreenId(),
          noteKey:     noteKey(tag, text),
          noteTag:     tag,
          noteText:    text,
          body,
          authorUid:   currentUser.uid,
          authorName:  currentUser.displayName || currentUser.email,
          authorPhoto: currentUser.photoURL || '',
          resolved:    false,
          createdAt:   fb.serverTimestamp(),
        });
        ta.value = '';
        btn.disabled = true;
      };
      wrap.appendChild(ta);
      wrap.appendChild(btn);
      threadEl.appendChild(wrap);
    } else {
      const hint = el('p', 'pc-ci-time');
      hint.textContent = '請先登入才能留言';
      hint.style.padding = '4px 0';
      threadEl.appendChild(hint);
    }
  }

  // Inject badge + thread into a note row element
  function injectNoteUI(rowEl, tag, text) {
    if (rowEl.dataset.pcInjected) return;
    rowEl.dataset.pcInjected = '1';

    // Comment button (hover-visible)
    const btn = el('button', 'pc-note-comment-btn');
    btn.innerHTML = '💬 留言';
    rowEl.appendChild(btn);

    // Badge (shows count when > 0)
    const badge = el('span', 'pc-note-badge');
    badge.style.display = 'none';
    rowEl.appendChild(badge);

    // Thread area
    const thread = el('div', 'pc-note-thread');
    rowEl.after(thread);

    function updateBadge() {
      const nc = getNoteComments(tag, text);
      if (nc.length > 0) {
        badge.textContent = `💬 ${nc.length}`;
        badge.style.display = 'inline-flex';
      } else {
        badge.style.display = 'none';
      }
    }

    function toggleThread() {
      const open = thread.classList.toggle('open');
      if (open) renderNoteThread(thread, tag, text);
    }

    btn.onclick   = toggleThread;
    badge.onclick = toggleThread;

    // Keep badge updated when comments change (polling the comments array)
    rowEl.dataset.pcTag  = tag;
    rowEl.dataset.pcText = text;

    updateBadge();
    return { updateBadge };
  }

  // Scan and inject UI into all note rows
  function injectAllNoteUI() {
    // Engineering mode rows
    document.querySelectorAll(engNoteSelector).forEach(row => {
      const tag  = row.dataset.tag  || row.querySelector('[data-tag]')?.dataset.tag
                || row.querySelector('.snc-tag, .tag')?.textContent?.trim() || '';
      const text = row.dataset.text || row.querySelector('.note-text, p, span:not(.snc-tag):not(.tag)')?.textContent?.trim() || '';
      if (tag || text) injectNoteUI(row, tag, text);
    });

    // Design mode info panel notes
    document.querySelectorAll('.dev-note-v2').forEach(row => {
      const tag  = row.dataset.tag  || row.querySelector('[data-tag]')?.dataset.tag
                || row.querySelector('.snc-tag, .tag')?.textContent?.trim() || '';
      const text = row.dataset.text || row.querySelector('p, .note-body')?.textContent?.trim() || '';
      if (tag || text) injectNoteUI(row, tag, text);
    });
  }

  // Refresh open note threads and badges after snapshot update
  function refreshNoteUI() {
    document.querySelectorAll('[data-pc-injected]').forEach(row => {
      const tag  = row.dataset.pcTag  || '';
      const text = row.dataset.pcText || '';
      const nc   = getNoteComments(tag, text);
      const badge = row.querySelector('.pc-note-badge');
      if (badge) {
        if (nc.length > 0) {
          badge.textContent = `💬 ${nc.length}`;
          badge.style.display = 'inline-flex';
        } else {
          badge.style.display = 'none';
        }
      }
      const thread = row.nextElementSibling;
      if (thread?.classList.contains('pc-note-thread', 'open')) {
        renderNoteThread(thread, tag, text);
      }
    });
  }

  // ── Firestore Subscription ─────────────────────────────────────────────────
  function subscribe() {
    if (unsub) { unsub(); unsub = null; }

    const mode = getMode();
    let q;

    if (mode === 'eng') {
      // Eng mode: subscribe to all note-type comments for this project
      q = fb.query(colPath(),
        fb.where('type', '==', 'note')
      );
    } else {
      // Design mode: subscribe to current screen (positional + note)
      const screenId = getScreenId();
      q = fb.query(colPath(),
        fb.where('screenId', '==', screenId)
      );
    }

    console.log('[pc] subscribe() screenId=', getScreenId(), 'mode=', mode);
    unsub = fb.onSnapshot(q, snapshot => {
      console.log('[pc] snapshot fired:', snapshot.docs.length, 'docs');
      // Merge: keep comments from other screens, replace for current screen/mode
      // Sort client-side by createdAt to avoid needing composite Firestore indexes
      const incoming = snapshot.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .sort((a, b) => (a.createdAt?.toMillis?.() ?? 0) - (b.createdAt?.toMillis?.() ?? 0));

      if (mode === 'eng') {
        // Replace note comments entirely
        comments = [
          ...comments.filter(c => c.type !== 'note'),
          ...incoming,
        ];
      } else {
        const screenId = getScreenId();
        comments = [
          ...comments.filter(c => c.screenId !== screenId),
          ...incoming,
        ];
      }

      renderPins();
      refreshNoteUI();

      // Re-render open popover thread if still open
      if (openPopoverId && popoverEl) {
        const thread = popoverEl.querySelector('.pc-thread');
        if (thread) {
          const newThread = renderThread(openPopoverId);
          if (newThread) thread.replaceWith(newThread);
        }
      }
    }, err => {
      console.warn('[prototype-comments] snapshot error:', err);
    });
  }

  // ── Screen-change listener ─────────────────────────────────────────────────
  // renderScreen() uses innerHTML= which destroys the overlay and pins.
  // Re-mount overlay and re-render pins after every screen change.
  document.addEventListener('pc:screen-change', ({ detail }) => {
    closeAllPopovers();
    // Small delay so renderScreen()'s innerHTML= runs first
    setTimeout(() => {
      mountOverlay();
      renderPins();
      injectAllNoteUI();
    }, 30);
    // Re-subscribe with new screenId (design mode)
    if (getMode() !== 'eng') subscribe();
  });

  // Also re-inject after any DOM mutation in info panel area (design mode renders async)
  const observer = new MutationObserver(() => {
    // Re-mount overlay if it was wiped by innerHTML=
    if (!document.getElementById('pc-overlay')) mountOverlay();
    injectAllNoteUI();
    refreshNoteUI();
  });
  observer.observe(document.body, { childList: true, subtree: true });

  // ── Auth State ─────────────────────────────────────────────────────────────
  fb.onAuthStateChanged(auth, user => {
    currentUser = user;
    console.log('[pc] auth state:', user ? `logged in as ${user.email}` : 'not logged in');
    renderAuthBar(user);
    if (user) {
      subscribe();
    } else {
      if (unsub) { unsub(); unsub = null; }
      comments = [];
      renderPins();
    }
  });

  // ── Bootstrap ─────────────────────────────────────────────────────────────
  mountAuthBar();
  mountOverlay();

  // Initial subscription (even unauthenticated, allow read)
  subscribe();

  // Initial note UI injection (design/eng notes already in DOM)
  setTimeout(injectAllNoteUI, 200);

  // Close popover on outside click
  document.addEventListener('click', e => {
    if (popoverEl && !popoverEl.contains(e.target)) {
      const isPin = e.target.closest('.pc-pin');
      if (!isPin) { pendingPin = null; closeAllPopovers(); }
    }
  });

  return {
    setCommentMode,
    getComments: () => comments,
    subscribe,
  };
}
