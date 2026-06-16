/**
 * spec-overlay — self-hosted vanilla spec-notes panel for LIVE prototypes.
 *
 * 比照 pc.js 的模型：自託管、URL 引入、自己畫 DOM（不綁框架）。把原本編進 app bundle 的
 * React/MUI SpecOverlay 抽成這支，consumer 只給 config + 資料 callback，overlay 邏輯全在這。
 * 好處：修 overlay = push 本 repo 即更新所有 live 原型，零 app 重建。
 *
 * 截圖版 prototype-flow 不用這支（它直接用 pc.js）；這是 live 原型專屬的可選層。
 *
 * Usage（在 app 端，動態 import 後）:
 *   import { initSpecOverlay } from '.../src/spec-overlay.js';
 *   initSpecOverlay({
 *     getNotesForPath: (path) => routeSpecOrNull,   // app 提供 route→devNotes 資料
 *     getPath: () => router.currentPath,             // raw path（含 basename 也沒關係）
 *     subscribe: (cb) => router.subscribe(cb),       // 路由變更時呼叫 cb；回傳 unsub
 *     navigateTo: (screenId) => router.navigate(...),// 傳給 pc.js（含 basename 處理由 consumer 負責）
 *     firebaseConfig, projectId,                     // 傳給 pc.js
 *     // 以下都有預設：scrollContainer/clipToScrollContainer/authBarCorner/noteJump/designTarget/tagStyle
 *   });
 *
 * RouteSpec = { title, desc?, devNotes: [{ tag, text, focus? }] }
 */

import { initPrototypeComments } from './index.js';

// ── 預設 tag 配色（與截圖版 devNote 一致；consumer 可用 opts.tagStyle 覆蓋）──────────
const DEFAULT_TAG_STYLE = {
  '注意事項': { bg: '#b91c1c', color: '#fff' },
  '修改':     { bg: '#0369a1', color: '#fff' },
  '新增':     { bg: '#15803d', color: '#fff' },
  '假資料':   { bg: '#6b7280', color: '#fff' },
  '沿用':     { bg: '#92400e', color: '#fff' },
  '規則':     { bg: '#6d28d9', color: '#fff' },
};

// click-outside 時這些元素內的點擊不關抽屜（抽屜本身 + FAB + pc.js 互動 UI）
const KEEP_OPEN_SEL = '.spec-drawer,.spec-fab,.pc-popover,.pc-note-thread,.pc-emoji-picker,.pc-mention-pop,.pc-auth-bar,.pc-pin';

const STYLES = `
.spec-fab {
  position: fixed; bottom: 72px; right: 16px; z-index: 1300;
  width: 48px; height: 48px; border-radius: 50%; border: none;
  background: #0FA0A0; color: #fff; cursor: pointer;
  display: flex; align-items: center; justify-content: center;
  box-shadow: 0 2px 12px rgba(0,0,0,0.25); font-size: 20px;
  transition: background .15s;
}
.spec-fab:hover { background: #0d8f8f; }
.spec-fab[hidden] { display: none; }
.spec-drawer {
  position: fixed; top: 0; right: 0; bottom: 0; z-index: 1300;
  width: 360px; max-width: 92vw; background: #fff; border-left: 1px solid #e2e8f0;
  display: flex; flex-direction: column; box-shadow: -2px 0 16px rgba(0,0,0,0.12);
  transform: translateX(100%); transition: transform .22s ease;
  font-family: inherit;
}
.spec-drawer.open { transform: translateX(0); }
.spec-hd { padding: 12px 16px; border-bottom: 1px solid #eef2f6; }
.spec-hd-row { display: flex; align-items: center; justify-content: space-between; }
.spec-hd-left { display: flex; align-items: center; gap: 8px; }
.spec-hd-title { color: #0FA0A0; font-weight: 700; font-size: 13px; }
.spec-hd-count { background: rgba(15,160,160,.12); color: #0d8f8f; border-radius: 9px;
  font-size: 10px; padding: 1px 7px; line-height: 16px; }
.spec-hd-close { border: none; background: none; cursor: pointer; color: #94a3b8;
  font-size: 18px; line-height: 1; padding: 2px 4px; }
.spec-hd-close:hover { color: #475569; }
.spec-route-title { color: #1e293b; font-weight: 700; font-size: 12px; margin-top: 6px; }
.spec-route-desc { color: #64748b; font-size: 12px; margin-top: 2px; }
.spec-list { padding: 16px; overflow-y: auto; flex: 1; background: #f8fafc; }
.eng-note-row { background: #fff; border-radius: 6px; padding: 12px;
  border: 1px solid #eef2f6; box-shadow: 0 1px 2px rgba(0,0,0,0.04); margin-bottom: 12px; }
.eng-note-row:last-child { margin-bottom: 0; }
.spec-note-top { display: flex; align-items: center; justify-content: space-between; margin-bottom: 6px; }
.spec-note-tag { font-size: 10px; font-weight: 700; border-radius: 3px; padding: 1px 7px; line-height: 16px; }
.spec-note-focus { border: none; background: none; cursor: pointer; color: #0FA0A0;
  font-size: 15px; padding: 2px; line-height: 1; }
.spec-note-focus:hover { color: #0d8f8f; }
.spec-note-text { color: #334155; font-size: 12px; line-height: 1.6; }
.spec-ft { padding: 8px 16px; border-top: 1px solid #eef2f6; background: #fff; }
.spec-ft-hint { color: #94a3b8; font-size: 10px; line-height: 1.5; }
@keyframes specFocusPulse {
  0%   { box-shadow: 0 0 0 0 rgba(15,160,160,.55); }
  70%  { box-shadow: 0 0 0 10px rgba(15,160,160,0); }
  100% { box-shadow: 0 0 0 0 rgba(15,160,160,0); }
}
.spec-focus-flash { outline: 2px solid #0FA0A0 !important; outline-offset: 2px;
  border-radius: 4px; animation: specFocusPulse 1.4s ease-out 2; }
`;

function el(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
}

function injectStyles() {
  if (document.getElementById('spec-overlay-styles')) return;
  const s = el('style');
  s.id = 'spec-overlay-styles';
  s.textContent = STYLES;
  document.head.appendChild(s);
}

// 點 note 🔦 → 捲到對應元件 + 閃高亮
function focusEl(selector) {
  const target = document.querySelector(selector);
  if (!target) return;
  target.scrollIntoView({ block: 'center', behavior: 'smooth' });
  target.classList.add('spec-focus-flash');
  setTimeout(() => target.classList.remove('spec-focus-flash'), 1600);
}

export function initSpecOverlay(opts = {}) {
  const {
    getNotesForPath = () => null,
    getPath = () => location.pathname,
    subscribe = () => () => {},
    navigateTo = null,
    firebaseConfig = null,
    projectId = 'default',
    scrollContainer = '[data-pc-scroll]',
    clipToScrollContainer = true,
    authBarCorner = 'left',
    noteJump = true,
    designTarget = '#root',
    tagStyle = DEFAULT_TAG_STYLE,
    _firebase = null,
  } = opts;

  if (window.__specOverlayInit) return;
  window.__specOverlayInit = true;
  injectStyles();

  const state = { open: false, spec: null, lastPath: getPath() };
  state.spec = getNotesForPath(state.lastPath);

  // ── DOM：FAB + 抽屜（常駐 DOM，靠 transform 開關，等同 keepMounted）─────────────
  const fab = el('button', 'spec-fab');
  fab.title = '規格說明';
  fab.innerHTML = '🗒';
  fab.onclick = () => setOpen(true);
  const drawer = el('div', 'spec-drawer');
  document.body.appendChild(fab);
  document.body.appendChild(drawer);

  function dispatchScreenChange() {
    document.dispatchEvent(new CustomEvent('pc:screen-change', { detail: { screenId: state.lastPath } }));
  }

  // click-outside：開著時點抽屜/FAB/pc.js UI 以外 → 關。setTimeout 讓「開啟那次 click」先結束。
  let docClick = null;
  function attachClickOutside() {
    docClick = (e) => {
      const t = e.target;
      if (t && t.closest && t.closest(KEEP_OPEN_SEL)) return;
      setOpen(false);
    };
    setTimeout(() => document.addEventListener('click', docClick), 0);
  }
  function detachClickOutside() {
    if (docClick) document.removeEventListener('click', docClick);
    docClick = null;
  }

  function setOpen(v) {
    if (state.open === v) return;
    state.open = v;
    render();
    if (v) {
      setTimeout(dispatchScreenChange, 60); // notes 重畫後讓 pc.js 重注入 💬
      attachClickOutside();
    } else {
      detachClickOutside();
    }
  }

  function buildNoteRow(note) {
    const style = tagStyle[note.tag] || { bg: '#374151', color: '#fff' };
    const row = el('div', 'eng-note-row');
    row.dataset.tag = note.tag;
    row.dataset.text = note.text;
    row.style.borderLeft = `3px solid ${style.bg}`;
    const top = el('div', 'spec-note-top');
    const tag = el('span', 'spec-note-tag', note.tag);
    tag.style.background = style.bg;
    tag.style.color = style.color;
    top.appendChild(tag);
    if (note.focus) {
      const f = el('button', 'spec-note-focus', '🔦');
      f.title = '聚焦到畫面對應位置';
      f.onclick = () => focusEl(note.focus);
      top.appendChild(f);
    }
    row.appendChild(top);
    row.appendChild(el('div', 'spec-note-text', note.text));
    return row;
  }

  function buildHeader(spec) {
    const hd = el('div', 'spec-hd');
    const row = el('div', 'spec-hd-row');
    const left = el('div', 'spec-hd-left');
    left.appendChild(el('span', 'spec-hd-title', '🗒 Spec Notes'));
    left.appendChild(el('span', 'spec-hd-count', String(spec.devNotes.length)));
    row.appendChild(left);
    const close = el('button', 'spec-hd-close', '✕');
    close.onclick = () => setOpen(false);
    row.appendChild(close);
    hd.appendChild(row);
    hd.appendChild(el('div', 'spec-route-title', spec.title));
    if (spec.desc) hd.appendChild(el('div', 'spec-route-desc', spec.desc));
    return hd;
  }

  function render() {
    const spec = state.spec;
    fab.hidden = !spec || state.open;
    if (!spec) { drawer.classList.remove('open'); drawer.innerHTML = ''; return; }
    drawer.innerHTML = '';
    drawer.appendChild(buildHeader(spec));
    const list = el('div', 'spec-list');
    spec.devNotes.forEach((n) => list.appendChild(buildNoteRow(n)));
    drawer.appendChild(list);
    const ft = el('div', 'spec-ft');
    ft.appendChild(el('div', 'spec-ft-hint',
      '🔦 點規格右上角聚焦到畫面 · 💬 每則下方可留言 · 左下角登入 Google 後也可在畫面上釘 pin'));
    drawer.appendChild(ft);
    drawer.classList.toggle('open', state.open);
  }

  // 路由變更 → 更新 path、通知 pc.js、重算 spec、重畫
  subscribe(() => {
    state.lastPath = getPath();
    dispatchScreenChange();
    state.spec = getNotesForPath(state.lastPath);
    render();
  });

  // 全部留言點規格留言 → pc.js dispatch pc:note-jump 要我們開抽屜（pc.js 隨後捲到 row + 開串）
  document.addEventListener('pc:note-jump', () => setOpen(true));

  render();

  // ── 內部 init pc.js（consumer 不必另外接）─────────────────────────────────────
  initPrototypeComments({
    firebaseConfig, projectId, _firebase,
    getScreenId: () => state.lastPath,
    getMode: () => 'design', // 依 screenId 訂閱：同時載 pin + note 留言，不需模式切換
    designTarget,
    scrollContainer, clipToScrollContainer, authBarCorner, noteJump,
    navigateTo,
  });
}
