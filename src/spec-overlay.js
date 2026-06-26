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
 * RouteSpec = { title, desc?, devNotes: [{ tag, text, focus?, spacing? }] }
 *
 * spacing（元件間距）有兩種來源，spec 面板會直接顯示：
 *   1. 手動：devNote.spacing 給字串（如 '上下 12px · 左右 16px'）或物件
 *      { margin?, padding?, gap? }（值為任意字串）。
 *   2. 自動：devNote 有 focus（CSS selector）且沒給手動 spacing 時，從活的 DOM
 *      用 getComputedStyle 量該元件的 margin/padding/gap 即時顯示。
 *   手動 spacing 一律優先於自動量測。
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
const KEEP_OPEN_SEL = '.spec-drawer,.spec-fab,.spec-restore,.pc-popover,.pc-note-thread,.pc-emoji-picker,.pc-mention-pop,.pc-auth-bar,.pc-annotation';

// 內嵌 MUI 圖示 SVG（vanilla 模組不能 import @mui/icons-material，故直接用其 path）。
// FAB = StickyNote2Outlined、聚焦 = CenterFocusStrong；fill:currentColor 跟著按鈕文字色。
const ICON_FAB = '<svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor" aria-hidden="true"><path d="M19 5v9h-5v5H5V5zm0-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h10l6-6V5c0-1.1-.9-2-2-2m-7 11H7v-2h5zm5-4H7V8h10z"/></svg>';
const ICON_FOCUS = '<svg viewBox="0 0 24 24" width="17" height="17" fill="currentColor" aria-hidden="true"><path d="M12 8c-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4-1.79-4-4-4m-7 7H3v4c0 1.1.9 2 2 2h4v-2H5zM5 5h4V3H5c-1.1 0-2 .9-2 2v4h2zm14-2h-4v2h4v4h2V5c0-1.1-.9-2-2-2m0 16h-4v2h4c1.1 0 2-.9 2-2v-4h-2z"/></svg>';

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
.spec-fab svg, .spec-note-focus svg { display: block; }
.spec-note-text { color: #334155; font-size: 12px; line-height: 1.6; }
/* 元件間距：盒模型圖（方案 A）。margin 外圈(琥珀)、padding 內圈(綠)，四邊各標 px。 */
.spec-bm-wrap { margin-top: 8px; }
.spec-bm-cap { margin-top: 8px; color: #0d8f8f; font-size: 11px; line-height: 1.5;
  background: rgba(15,160,160,.08); border-radius: 4px; padding: 4px 8px; display: inline-block; }
.spec-bm { display: inline-block; font: 10px/1.2 ui-monospace, SFMono-Regular, Menlo, monospace; }
.spec-bm-band { border-radius: 5px; padding: 11px 4px 2px; position: relative; }
.spec-bm-margin { background: rgba(180,83,9,.10); border: 1px dashed #b45309; }
.spec-bm-padding { background: rgba(21,128,61,.10); border: 1px dashed #15803d; }
.spec-bm-label { position: absolute; top: 1px; left: 5px; font-size: 8px; font-weight: 700; letter-spacing: .03em; }
.spec-bm-margin > .spec-bm-label { color: #b45309; }
.spec-bm-padding > .spec-bm-label { color: #15803d; }
.spec-bm-side { text-align: center; padding: 1px 0; }
.spec-bm-mid { display: flex; align-items: center; justify-content: center; gap: 6px; padding: 1px 0; }
.spec-bm-v { color: #334155; font-weight: 700; }
.spec-bm-v.z { color: #cbd5e1; font-weight: 400; }
.spec-bm-content { background: #334155; color: #e2e8f0; border-radius: 3px; padding: 6px 12px; white-space: nowrap; }
.spec-bm-dim { margin-top: 6px; color: #0d8f8f; font-weight: 700; font-size: 11px;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
.spec-bm-gap { margin-top: 6px; display: inline-block; background: rgba(109,40,217,.12); color: #6d28d9;
  font-size: 10px; font-weight: 700; border-radius: 4px; padding: 2px 7px;
  font-family: ui-monospace, Menlo, monospace; }
.spec-ft { padding: 8px 16px; border-top: 1px solid #eef2f6; background: #fff; }
.spec-ft-hint { color: #94a3b8; font-size: 10px; line-height: 1.5; }
@keyframes specFocusPulse {
  0%   { box-shadow: 0 0 0 0 rgba(15,160,160,.55); }
  70%  { box-shadow: 0 0 0 10px rgba(15,160,160,0); }
  100% { box-shadow: 0 0 0 0 rgba(15,160,160,0); }
}
/* 方案 B：畫面 redline 量測層（疊在真實元件上） */
.spec-rl-layer { position: fixed; inset: 0; pointer-events: none; z-index: 1290; }
.spec-rl-layer > div { position: absolute; }
.spec-rl-box { border: 1.5px solid #0FA0A0; box-sizing: border-box; border-radius: 2px;
  box-shadow: 0 0 0 1px rgba(255,255,255,.55); }
.spec-rl-pad { background: rgba(21,128,61,.20); }
.spec-rl-plabel { transform: translate(-50%,-50%); color: #15803d; background: rgba(255,255,255,.88);
  font: 700 9px/1 ui-monospace, Menlo, monospace; padding: 1px 3px; border-radius: 2px; white-space: nowrap; }
.spec-rl-badge { background: #0FA0A0; color: #fff; font: 700 10px/1 ui-monospace, Menlo, monospace;
  padding: 2px 5px; border-radius: 3px; white-space: nowrap; box-shadow: 0 1px 3px rgba(0,0,0,.3); }
.spec-rl-w { transform: translateX(-50%); }
.spec-rl-h { transform: translateY(-50%); }
.spec-focus-flash { outline: 2px solid #0FA0A0 !important; outline-offset: 2px;
  border-radius: 4px; animation: specFocusPulse 1.4s ease-out 2; }
/* 聚焦時抽屜收合 → 右緣細條（喚回抽屜）+ 元件旁浮動小卡（顯示該 note，避免被抽屜擋住） */
.spec-restore {
  position: fixed; top: 50%; right: 0; transform: translateY(-50%); z-index: 1301;
  display: none; border: none; cursor: pointer; background: #0FA0A0; color: #fff;
  padding: 14px 7px; border-radius: 8px 0 0 8px; box-shadow: -2px 0 10px rgba(0,0,0,.18);
  writing-mode: vertical-rl; font-size: 12px; font-weight: 700; letter-spacing: 3px;
}
.spec-restore:hover { background: #0d8f8f; }
.spec-restore.show { display: block; }
.spec-focus-chip {
  position: fixed; z-index: 1291; pointer-events: none; max-width: 280px;
  background: #111827; color: #fff; font-size: 12px; line-height: 1.45;
  padding: 6px 10px; border-radius: 6px; box-shadow: 0 2px 10px rgba(0,0,0,.3);
}
.spec-focus-chip b { color: #5eead4; font-weight: 700; }
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

// ── 量測對象解析（讓規格框「整個欄位元件」而非只有 input）──────────────────────────
// focus 常指向葉節點控制項（input/select/textarea），只量它 → 規格只框到輸入框本身。
// 這裡自動往上找「整個欄位容器」再量，量出來才是完整元件。spacingTarget 明確指定時不 widen。
const LEAF_CTRL = /^(INPUT|SELECT|TEXTAREA)$/;
const FIELD_SEL = '[class*=field i],[class*=form i],[class*=control i],[class*=input i],label';
function widenToField(elx) {
  if (!elx || !LEAF_CTRL.test(elx.tagName)) return elx;
  const a = elx.getBoundingClientRect();
  // 防呆：容器不可比輸入框寬太多/高太多，否則會抓到整個版面/面板。
  const within = c => { if (!c) return false; const b = c.getBoundingClientRect();
    return b.width > 0 && b.width <= a.width * 3 + 80 && b.height <= a.height * 6 + 80; };
  const byClass = elx.parentElement && elx.parentElement.closest(FIELD_SEL);
  if (within(byClass)) return byClass;                       // 1) 最近的「欄位類」容器
  const p = elx.parentElement;                               // 2) 沒 class 命中：父層含 <label> 也算整個欄位
  if (p && p.querySelector('label') && within(p)) return p;
  return elx;
}
// 回傳「要量測/畫 redline 的元素」：spacingTarget 優先（不 widen）；否則 focus 自動 widen 到欄位。
function resolveTargetEl(note) {
  if (note.spacingTarget) return document.querySelector(note.spacingTarget);
  if (note.focus) return widenToField(document.querySelector(note.focus));
  return null;
}

// 點 note 🔦 → 捲到對應元件 + 閃高亮 + 畫面 redline 量測（方案 B）
function focusEl(note) {
  const target = resolveTargetEl(note);
  if (!target) return;
  target.scrollIntoView({ block: 'center', behavior: 'smooth' });
  target.classList.add('spec-focus-flash');
  setTimeout(() => target.classList.remove('spec-focus-flash'), 1600);
  drawRedline(target, note);
}

// ── 方案 B：畫面 redline 量測（Figma Alt-hover 風）─────────────────────────────────
// 聚焦元件時把「外框 + 長寬 badge + padding 內襯」疊在真實元件上。position:fixed 跟著
// getBoundingClientRect 走，捲動/縮放即時重定位；元件離開 DOM 或下次聚焦/關抽屜即清掉。
let _rlLayer = null, _rlTarget = null, _rlReposition = null, _rlNote = null;
function clearRedline() {
  if (_rlLayer) { _rlLayer.remove(); _rlLayer = null; }
  if (_rlReposition) {
    window.removeEventListener('scroll', _rlReposition, true);
    window.removeEventListener('resize', _rlReposition);
    _rlReposition = null;
  }
  _rlTarget = null;
  _rlNote = null;
}
function boxAt(cls, b) {
  const e = el('div', cls);
  e.style.left = b.left + 'px'; e.style.top = b.top + 'px';
  e.style.width = b.width + 'px'; e.style.height = b.height + 'px';
  return e;
}
function positionRedline() {
  if (!_rlLayer || !_rlTarget) return;
  if (!document.contains(_rlTarget)) { clearRedline(); return; }
  const r = _rlTarget.getBoundingClientRect();
  const cs = getComputedStyle(_rlTarget);
  const pad = { t: pxNum(cs.paddingTop), r: pxNum(cs.paddingRight), b: pxNum(cs.paddingBottom), l: pxNum(cs.paddingLeft) };
  _rlLayer.innerHTML = '';
  _rlLayer.appendChild(boxAt('spec-rl-box', r));
  // padding 內襯（綠色半透明）+ px 標籤
  const bands = {
    t: { left: r.left, top: r.top, width: r.width, height: pad.t },
    b: { left: r.left, top: r.bottom - pad.b, width: r.width, height: pad.b },
    l: { left: r.left, top: r.top, width: pad.l, height: r.height },
    r: { left: r.right - pad.r, top: r.top, width: pad.r, height: r.height },
  };
  ['t', 'r', 'b', 'l'].forEach(s => {
    if (!pad[s]) return;
    const b = bands[s];
    _rlLayer.appendChild(boxAt('spec-rl-pad', b));
    const lab = el('div', 'spec-rl-plabel', String(pad[s]));
    lab.style.left = (b.left + b.width / 2) + 'px';
    lab.style.top = (b.top + b.height / 2) + 'px';
    _rlLayer.appendChild(lab);
  });
  // 寬度 badge（下方置中）/ 高度 badge（右側置中）
  const wb = el('div', 'spec-rl-badge spec-rl-w', String(Math.round(r.width)));
  wb.style.left = (r.left + r.width / 2) + 'px'; wb.style.top = (r.bottom + 5) + 'px';
  _rlLayer.appendChild(wb);
  const hb = el('div', 'spec-rl-badge spec-rl-h', String(Math.round(r.height)));
  hb.style.left = (r.right + 5) + 'px'; hb.style.top = (r.top + r.height / 2) + 'px';
  _rlLayer.appendChild(hb);
  // 抽屜收合後，元件旁浮一張小卡顯示該 note（tag + 文字），避免規格資訊不見。
  if (_rlNote) {
    const chip = el('div', 'spec-focus-chip');
    if (_rlNote.tag) { const tg = el('b'); tg.textContent = _rlNote.tag + ' '; chip.appendChild(tg); }
    chip.appendChild(document.createTextNode(_rlNote.text || ''));
    _rlLayer.appendChild(chip);
    const cb = chip.getBoundingClientRect();
    let cy = r.top - cb.height - 8;
    if (cy < 4) cy = r.bottom + 8;                                  // 上方沒空間 → 放下方
    const cx = Math.max(4, Math.min(r.left, window.innerWidth - cb.width - 4));
    chip.style.left = cx + 'px'; chip.style.top = cy + 'px';
  }
}
function drawRedline(target, note) {
  clearRedline();
  const t = typeof target === 'string' ? document.querySelector(target) : target;
  if (!t) return;
  _rlTarget = t;
  _rlNote = note || null;
  _rlLayer = el('div', 'spec-rl-layer');
  document.body.appendChild(_rlLayer);
  positionRedline();
  _rlReposition = () => positionRedline();
  window.addEventListener('scroll', _rlReposition, true); // capture：抓內層捲動容器的捲動
  window.addEventListener('resize', _rlReposition);
}

// ── 元件間距：盒模型圖（方案 A，對齊 DevTools / Figma Inspect 心智模型）────────────
// 把間距畫成巢狀方塊（margin 外圈、padding 內圈），四邊各標 px —— 取代原本看不懂的純文字。
const pxNum = v => { const n = parseFloat(v); return Number.isFinite(n) ? Math.round(n) : 0; };
const anySide = s => !!(s && (s.t || s.r || s.b || s.l));

// 把 CSS 值字串解析成四邊 {t,r,b,l}（支援 '24px' / '8px 16px' / '↕4px ↔8px' / 四值）。
function parseSide(v) {
  if (typeof v !== 'string') return null;
  const nums = v.match(/-?\d+(?:\.\d+)?/g);
  if (!nums) return null;
  const n = nums.map(x => Math.round(parseFloat(x)));
  if (v.includes('↕') || v.includes('↔')) return { t: n[0], r: n[1] ?? n[0], b: n[0], l: n[1] ?? n[0] };
  if (n.length === 1) return { t: n[0], r: n[0], b: n[0], l: n[0] };
  if (n.length === 2) return { t: n[0], r: n[1], b: n[0], l: n[1] };
  if (n.length >= 4) return { t: n[0], r: n[1], b: n[2], l: n[3] };
  return { t: n[0], r: n[0], b: n[0], l: n[0] };
}

// 從活的 DOM 量四邊 margin/padding + border + gap + 尺寸。
//   w/h = border-box（整個元件的渲染寬高）；cw/ch = content-box（= border-box − padding − border）。
//   盒模型把 w×h 標成「元件」尺寸、cw×ch 放在 content 中心，幾何與 DevTools/Figma 一致。
function measureSpacingSides(target) {
  const t = typeof target === 'string' ? document.querySelector(target) : target;
  if (!t) return null;
  const cs = getComputedStyle(t);
  const r = t.getBoundingClientRect();
  const side = p => ({ t: pxNum(cs[p + 'Top']), r: pxNum(cs[p + 'Right']), b: pxNum(cs[p + 'Bottom']), l: pxNum(cs[p + 'Left']) });
  const pad = side('padding');
  const bd = { t: pxNum(cs.borderTopWidth), r: pxNum(cs.borderRightWidth), b: pxNum(cs.borderBottomWidth), l: pxNum(cs.borderLeftWidth) };
  const w = Math.round(r.width), h = Math.round(r.height);
  const gap = (cs.gap && cs.gap !== 'normal' && cs.gap !== '0px') ? cs.gap.replace(/ /g, ' / ') : null;
  return { margin: side('margin'), padding: pad, gap, w, h,
    cw: Math.max(0, w - pad.l - pad.r - bd.l - bd.r),
    ch: Math.max(0, h - pad.t - pad.b - bd.t - bd.b) };
}

function sideVal(v) { const s = el('span', 'spec-bm-v' + (v ? '' : ' z')); s.textContent = String(v); return s; }
function sideRow(v) { const d = el('div', 'spec-bm-side'); d.appendChild(sideVal(v)); return d; }

// 用 sides 包一層帶四邊數字的 band（margin / padding），把 inner 包在中間。
function bandSides(kind, sides, inner) {
  const band = el('div', 'spec-bm-band spec-bm-' + kind);
  band.appendChild(el('span', 'spec-bm-label', kind));
  band.appendChild(sideRow(sides.t));
  const mid = el('div', 'spec-bm-mid');
  mid.appendChild(sideVal(sides.l));
  mid.appendChild(inner);
  mid.appendChild(sideVal(sides.r));
  band.appendChild(mid);
  band.appendChild(sideRow(sides.b));
  return band;
}

function renderBoxModel(data) {
  const wrap = el('div', 'spec-bm-wrap');
  // 中心放 content-box（cw×ch）；沒有量測值（手動物件）時放佔位「元件」。
  const contentTxt = data.cw != null ? `${data.cw}×${data.ch}` : '元件';
  let inner = el('div', 'spec-bm-content', contentTxt);
  if (anySide(data.padding)) inner = bandSides('padding', data.padding, inner);
  if (anySide(data.margin))  inner = bandSides('margin', data.margin, inner);
  const bm = el('div', 'spec-bm'); bm.appendChild(inner); wrap.appendChild(bm);
  // 整個元件（border-box）尺寸：明確標成「元件 W×H」，避免被誤讀成只是內容區。
  if (data.w != null) wrap.appendChild(el('div', 'spec-bm-dim', `元件 ${data.w} × ${data.h}px`));
  if (data.gap) wrap.appendChild(el('div', 'spec-bm-gap', 'gap ' + data.gap));
  return wrap;
}

// 回傳間距顯示 DOM（盒模型圖；手動字串則回可讀 caption）；沒有則回 null。
//   手動 spacing（物件/字串）優先；否則量 resolveTargetEl(note)：focus 自動 widen 到整個欄位
//   容器（量完整元件，非只 input）。spacingTarget 用來覆寫 widen 結果、明確指定要量哪個元素。
function buildSpacingEl(note) {
  const sp = note.spacing;
  if (typeof sp === 'string') {
    if (!sp.trim()) return null;
    return el('div', 'spec-bm-cap', '📐 ' + sp);
  }
  let data = null;
  if (sp && typeof sp === 'object') {
    data = { margin: parseSide(sp.margin), padding: parseSide(sp.padding), gap: sp.gap || null, w: null, h: null, cw: null, ch: null };
  } else if (note.spacingTarget || note.focus) {
    data = measureSpacingSides(resolveTargetEl(note));
  }
  if (!data || (!anySide(data.margin) && !anySide(data.padding) && !data.gap)) return null;
  return renderBoxModel(data);
}

export function initSpecOverlay(opts = {}) {
  const {
    getNotesForPath = () => null,
    getPath = () => location.pathname,
    subscribe = () => () => {},
    navigateTo = null,
    firebaseConfig = null,
    projectId,                  // 必填：傳給 pc.js（每個原型專案一個唯一 id，留言依此分區）
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

  const state = { open: false, collapsed: false, spec: null, lastPath: getPath() };
  state.spec = getNotesForPath(state.lastPath);

  // ── DOM：FAB + 抽屜（常駐 DOM，靠 transform 開關，等同 keepMounted）─────────────
  const fab = el('button', 'spec-fab');
  fab.title = '規格說明';
  fab.innerHTML = ICON_FAB;
  fab.onclick = () => setOpen(true);
  const drawer = el('div', 'spec-drawer');
  // 聚焦時抽屜收合 → 右緣這條細條把抽屜喚回（展開）
  const restoreTab = el('button', 'spec-restore', '規格 ◂');
  restoreTab.title = '展開規格面板';
  restoreTab.onclick = exitFocusMode;
  document.body.appendChild(fab);
  document.body.appendChild(drawer);
  document.body.appendChild(restoreTab);

  // 點 🔦 → 收合抽屜（露出元件 + redline），redline 由 focusEl 畫。
  function enterFocusMode() {
    if (!state.open) return;
    state.collapsed = true;
    detachClickOutside();   // 收合期間點畫面不關抽屜，方便看元件
    render();
  }
  // 點細條 → 展開抽屜、收掉 redline，恢復 click-outside。
  function exitFocusMode() {
    if (!state.collapsed) return;
    state.collapsed = false;
    clearRedline();
    render();
    attachClickOutside();
  }

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
      state.collapsed = false; // 完全關閉 → 退出聚焦收合狀態
      detachClickOutside();
      clearRedline(); // 關抽屜時收掉畫面上的 redline 量測
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
      const f = el('button', 'spec-note-focus');
      f.innerHTML = ICON_FOCUS;
      f.title = '聚焦到畫面對應位置';
      f.onclick = () => { enterFocusMode(); focusEl(note); };
      top.appendChild(f);
    }
    row.appendChild(top);
    row.appendChild(el('div', 'spec-note-text', note.text));
    const spEl = buildSpacingEl(note);
    if (spEl) row.appendChild(spEl);
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
    restoreTab.classList.toggle('show', !!spec && state.open && state.collapsed);
    if (!spec) { drawer.classList.remove('open'); drawer.innerHTML = ''; return; }
    drawer.innerHTML = '';
    drawer.appendChild(buildHeader(spec));
    const list = el('div', 'spec-list');
    spec.devNotes.forEach((n) => list.appendChild(buildNoteRow(n)));
    drawer.appendChild(list);
    const ft = el('div', 'spec-ft');
    ft.appendChild(el('div', 'spec-ft-hint',
      '🔦 點規格右上角聚焦到畫面 · 📐 顯示元件間距 · 💬 每則下方可留言 · 左下角登入 Google 後也可在畫面上加標註'));
    drawer.appendChild(ft);
    drawer.classList.toggle('open', state.open && !state.collapsed);
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

  // 視窗縮放 → 元件長寬會變，盒模型量到的尺寸要跟著更新。抽屜開著時 debounce 重畫重新量測。
  let resizeT = null;
  window.addEventListener('resize', () => {
    if (!state.open) return;
    clearTimeout(resizeT);
    resizeT = setTimeout(render, 150);
  });

  render();

  // ── 內部 init pc.js（consumer 不必另外接）─────────────────────────────────────
  initPrototypeComments({
    firebaseConfig, projectId, _firebase,
    getScreenId: () => state.lastPath,
    getMode: () => 'design', // 依 screenId 訂閱：同時載 annotation + note 留言，不需模式切換
    designTarget,
    scrollContainer, clipToScrollContainer, authBarCorner, noteJump,
    navigateTo,
  });
}
