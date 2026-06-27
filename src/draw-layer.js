/**
 * draw-layer — Figma/Excalidraw 風格的視覺標注繪圖層（plan §4.1–§4.3）。
 *
 * 在既有 `#pc-overlay` 之上加一個 `#pc-draw` SVG 層，提供：
 *   - 模式狀態機 mode ∈ { comment, draw, off }；draw 時 SVG `pointer-events:auto`
 *     吃事件擋掉 app 點擊，comment/off 則 `pointer-events:none` 放行（不跟 app 打架）。
 *   - 浮動工具列：select / ellipse / arrow / pencil / text / rect / line
 *     ＋ 顏色筆粗 picker ＋ z-order / 刪除 / undo-redo。
 *   - 七種工具繪製、選取/移動/縮放、z-order、刪除、undo-redo。
 *
 * 座標一律存 viewport-% （沿用 pc.js 既有 % 慣例 → RWD 友善）；render 時才換算成 px。
 * 幾何換算、bbox、平移/縮放重映射、z-order 重排、undo command apply/invert 全抽成純函式
 *（下方 export），可單測。
 *
 * Usage:
 *   import { initDrawLayer } from '.../src/draw-layer.js';
 *   const draw = initDrawLayer('#root');   // 或傳 element；預設 document.body
 *   draw.setMode('draw'); draw.setTool('select');
 *
 * P2 之後（不在本階段）：貼圖、selector 擷取(anchor)、PNG/JSON 匯出。
 */

// ── 常數 ────────────────────────────────────────────────────────────────────
export const DRAW_MODES = ['comment', 'draw', 'off'];
export const DRAW_TOOLS = ['select', 'ellipse', 'arrow', 'pencil', 'text', 'rect', 'line'];
export const DEFAULT_DRAW_STYLE = { color: '#E5484D', strokeWidth: 2, fill: 'none' };
// Excalidraw/Figma 風格預設色（8 色）＋ picker 另附 <input type=color> 自訂任意 hex。
export const DRAW_COLORS = ['#1e1e1e', '#e03131', '#2f9e44', '#1971c2', '#f08c00', '#9c36b5', '#0c8599', '#868e96'];
export const DRAW_STROKE_WIDTHS = [1, 2, 4, 6]; // thin → bold
export const MIN_DRAW_SIZE_PCT = 1; // 縮放最小尺寸（% 座標）

const SVG_NS = 'http://www.w3.org/2000/svg';
const HANDLE_FIXED = { nw: 'se', ne: 'sw', se: 'nw', sw: 'ne' };

// Material Icons 官方 24px path data（與 MUI 同一套圖示，inline SVG，不引 React/@mui）。
const ICON_PATHS = {
  select: 'M21 3L3 10.53v.98l6.84 2.65L12.48 21h.98L21 3z',                                   // near_me
  ellipse: 'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8z', // circle (outlined)
  arrow: 'M6 6v2h8.59L5 17.59 6.41 19 16 9.41V18h2V6z',                                        // arrow_outward
  pencil: 'M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z', // edit
  text: 'M5 4v3h5.5v12h3V7H19V4z',                                                             // title
  rect: 'M18 4H6c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 14H6V6h12v12z', // crop_square
  line: 'M19 13H5v-2h14v2z',                                                                   // remove (horizontal bar)
  front: 'M3 13h2v-2H3v2zm0 4h2v-2H3v2zm2 4v-2H3c0 1.1.89 2 2 2zM3 9h2V7H3v2zm12 12h2v-2h-2v2zm4-18H9c-1.11 0-2 .9-2 2v10c0 1.1.89 2 2 2h10c1.11 0 2-.9 2-2V5c0-1.1-.89-2-2-2zm0 12H9V5h10v10zm-8 6h2v-2h-2v2zm-4 0h2v-2H7v2z', // flip_to_front
  back: 'M9 7H7v2h2V7zm0 4H7v2h2v-2zm0-8c-1.11 0-2 .9-2 2h2V3zm4 12h-2v2h2v-2zm6-12v2h2c0-1.1-.9-2-2-2zm-6 0h-2v2h2V3zM9 17v-2H7c0 1.1.89 2 2 2zm10-4h2v-2h-2v2zm0-4h2V7h-2v2zm0 8c1.1 0 2-.9 2-2h-2v2zM5 7H3v12c0 1.1.89 2 2 2h12v-2H5V7zm10-2h2V3h-2v2zm0 12h2v-2h-2v2z', // flip_to_back
  forward: 'M4 12l1.41 1.41L11 7.83V20h2V7.83l5.58 5.59L20 12l-8-8-8 8z',                       // arrow_upward
  backward: 'M20 12l-1.41-1.41L13 16.17V4h-2v12.17l-5.58-5.59L4 12l8 8 8-8z',                    // arrow_downward
  delete: 'M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z',       // delete
  undo: 'M12.5 8c-2.65 0-5.05.99-6.9 2.6L2 7v9h9l-3.62-3.62c1.39-1.16 3.16-1.88 5.12-1.88 3.54 0 6.55 2.31 7.6 5.5l2.37-.78C21.08 11.03 17.15 8 12.5 8z', // undo
  redo: 'M18.4 10.6C16.55 8.99 14.15 8 11.5 8c-4.65 0-8.58 3.03-9.96 7.22L3.9 16c1.05-3.19 4.05-5.5 7.6-5.5 1.95 0 3.73.72 5.12 1.88L13 16h9V7l-3.6 3.6z', // redo
  lineWeight: 'M3 17h18v-2H3v2zm0 3h18v-1H3v1zm0-7h18v-3H3v3zm0-9v4h18V4H3z',                    // line_weight
  close: 'M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z', // close
};

// 一個 Material 圖示 → inline SVG 字串（currentColor → 跟著 active/hover 文字色變化）。
function icon(name, size = 20) {
  return `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="currentColor" aria-hidden="true"><path d="${ICON_PATHS[name]}"/></svg>`;
}

// ── 純函式（單元測試對象，無 DOM 依賴）──────────────────────────────────────
// px → viewport-%（沿用 index.js overlay click 的 toFixed(2) 慣例）。
export function pxToPct(px, total) {
  if (!total) return 0;
  return parseFloat(((px / total) * 100).toFixed(2));
}

// viewport-% → px。
export function pctToPx(pct, total) {
  return (pct / 100) * total;
}

// 視窗座標 (clientX/Y) → 相對 rect 的 % 點。自由畫＝固定畫布座標，不接 scroll anchor。
export function clientToPct(clientX, clientY, rect) {
  return {
    x: pxToPct(clientX - rect.left, rect.width),
    y: pxToPct(clientY - rect.top, rect.height),
  };
}

// 兩個 % 點 → bounding box：{x,y}=左上、{w,h}=尺寸，皆為 %。
export function rectFromPoints(a, b) {
  return {
    x: Math.min(a.x, b.x),
    y: Math.min(a.y, b.y),
    w: Math.abs(b.x - a.x),
    h: Math.abs(b.y - a.y),
  };
}

// 一次拖曳（起點 a、終點 b）→ 某工具的幾何（box 類 / 端點類）。pencil 另走累點邏輯。
export function geomFromDrag(tool, a, b) {
  if (tool === 'ellipse' || tool === 'rect') return rectFromPoints(a, b);
  if (tool === 'arrow' || tool === 'line') return { from: { ...a }, to: { ...b } };
  return { x: b.x, y: b.y }; // text 等：落點即位置
}

// 任一物件 → 其 % bounding box（選取框 / 命中測試 / 縮放重映射用）。
export function geomBBox(o) {
  const g = o.geom;
  if (o.tool === 'ellipse' || o.tool === 'rect') return { x: g.x, y: g.y, w: g.w, h: g.h };
  if (o.tool === 'arrow' || o.tool === 'line') return rectFromPoints(g.from, g.to);
  if (o.tool === 'pencil') {
    const xs = g.points.map(p => p[0]), ys = g.points.map(p => p[1]);
    const x = Math.min(...xs), y = Math.min(...ys);
    return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
  }
  const w = Math.max(4, (o.text ? o.text.length : 1) * 1.2); // text：估一個可命中的框
  return { x: g.x, y: g.y - 2.5, w, h: 3.5 };
}

// 平移物件幾何（移動）。回傳新 geom，不改入參。
export function translateGeom(o, dx, dy) {
  const g = o.geom;
  if (o.tool === 'arrow' || o.tool === 'line')
    return { from: { x: g.from.x + dx, y: g.from.y + dy }, to: { x: g.to.x + dx, y: g.to.y + dy } };
  if (o.tool === 'pencil') return { points: g.points.map(([x, y]) => [x + dx, y + dy]) };
  if (o.tool === 'ellipse' || o.tool === 'rect') return { x: g.x + dx, y: g.y + dy, w: g.w, h: g.h };
  return { x: g.x + dx, y: g.y + dy }; // text
}

// 把幾何從 oldBox 等比重映射到 newBox（縮放）。回傳新 geom。
export function remapGeom(o, oldBox, newBox) {
  const sx = oldBox.w ? newBox.w / oldBox.w : 0;
  const sy = oldBox.h ? newBox.h / oldBox.h : 0;
  const mx = x => newBox.x + (x - oldBox.x) * sx;
  const my = y => newBox.y + (y - oldBox.y) * sy;
  const g = o.geom;
  if (o.tool === 'arrow' || o.tool === 'line')
    return { from: { x: mx(g.from.x), y: my(g.from.y) }, to: { x: mx(g.to.x), y: my(g.to.y) } };
  if (o.tool === 'pencil') return { points: g.points.map(([x, y]) => [mx(x), my(y)]) };
  if (o.tool === 'ellipse' || o.tool === 'rect') return { x: newBox.x, y: newBox.y, w: newBox.w, h: newBox.h };
  return { x: mx(g.x), y: my(g.y) }; // text
}

function boxCorner(box, name) {
  const c = {
    nw: { x: box.x, y: box.y },
    ne: { x: box.x + box.w, y: box.y },
    se: { x: box.x + box.w, y: box.y + box.h },
    sw: { x: box.x, y: box.y + box.h },
  };
  return c[name];
}

// 拖某角 handle → 新 box：對角固定、拖到點 p，最後夾住最小尺寸。
export function resizeBBox(oldBox, handle, p, minSize = MIN_DRAW_SIZE_PCT) {
  const fixed = boxCorner(oldBox, HANDLE_FIXED[handle] || 'nw');
  const box = rectFromPoints(fixed, p);
  if (box.w < minSize) box.w = minSize;
  if (box.h < minSize) box.h = minSize;
  return box;
}

// z-order：把 id 在 id 陣列中往前/後/頂/底重排（陣列尾＝最上層）。回傳新陣列。
export function reorderIds(ids, id, op) {
  const i = ids.indexOf(id);
  if (i < 0) return ids.slice();
  const next = ids.slice();
  next.splice(i, 1);
  if (op === 'front') next.push(id);
  else if (op === 'back') next.unshift(id);
  else if (op === 'forward') next.splice(Math.min(i + 1, next.length), 0, id);
  else if (op === 'backward') next.splice(Math.max(i - 1, 0), 0, id);
  else next.splice(i, 0, id);
  return next;
}

function reindexByIds(objects, ids) {
  const map = {};
  objects.forEach(o => { map[o.id] = o; });
  return ids.map(id => map[id]).filter(Boolean);
}

// ── undo/redo command（純：apply 正向、invert 反向；皆回傳新陣列）─────────────
// cmd 形狀：
//   { type:'create', obj }
//   { type:'delete', obj, index }
//   { type:'update', id, before, after }   // patch（{geom} / {style}）→ 涵蓋 move/resize/style
//   { type:'reorder', before:[ids], after:[ids] }
export function applyCommand(objects, cmd) {
  if (cmd.type === 'create') return objects.concat(cmd.obj);
  if (cmd.type === 'delete') return objects.filter(o => o.id !== cmd.obj.id);
  if (cmd.type === 'update') return objects.map(o => (o.id === cmd.id ? { ...o, ...cmd.after } : o));
  if (cmd.type === 'reorder') return reindexByIds(objects, cmd.after);
  return objects;
}

export function invertCommand(objects, cmd) {
  if (cmd.type === 'create') return objects.filter(o => o.id !== cmd.obj.id);
  if (cmd.type === 'delete') {
    const next = objects.slice();
    next.splice(Math.min(cmd.index, next.length), 0, cmd.obj);
    return next;
  }
  if (cmd.type === 'update') return objects.map(o => (o.id === cmd.id ? { ...o, ...cmd.before } : o));
  if (cmd.type === 'reorder') return reindexByIds(objects, cmd.before);
  return objects;
}

// undo/redo 指標堆疊（純邏輯，無 DOM）：push 清空 redo；undo/redo 在兩堆間搬。
export function makeUndoStack() {
  const undo = [], redo = [];
  return {
    push(cmd) { undo.push(cmd); redo.length = 0; },
    undo() { if (!undo.length) return null; const c = undo.pop(); redo.push(c); return c; },
    redo() { if (!redo.length) return null; const c = redo.pop(); undo.push(c); return c; },
    canUndo: () => undo.length > 0,
    canRedo: () => redo.length > 0,
  };
}

function normalizeStyle(style = {}) {
  return {
    color: style.color || DEFAULT_DRAW_STYLE.color,
    strokeWidth: style.strokeWidth ?? DEFAULT_DRAW_STYLE.strokeWidth,
    fill: style.fill || DEFAULT_DRAW_STYLE.fill,
  };
}

let _idSeq = 0;
function nextDrawId() { return 'd' + (++_idSeq); }

// 組裝一個 DrawObject（plan §4.2 子集：id/tool/geom/style[/text]）。
// z 由繪圖層在 commit 時依 DOM 順序戳上（stampZ），純函式不負責。
export function makeDrawObject({ id, tool, geom, style, text } = {}) {
  const obj = { id: id || nextDrawId(), tool, geom, style: normalizeStyle(style) };
  if (text != null) obj.text = text;
  return obj;
}

// 精簡序列化（之後匯出給 AI 用）。z 若已戳上則一併輸出。
export function serializeDrawObject(obj) {
  const out = { id: obj.id, tool: obj.tool, geom: obj.geom, style: obj.style };
  if (obj.text != null) out.text = obj.text;
  if (obj.z != null) out.z = obj.z;
  return out;
}

// ── DOM helpers（draw 前綴避免 bundle 時與 index.js 同名 top-level 衝突）────────
function drawSvgEl(tag, attrs = {}) {
  const n = document.createElementNS(SVG_NS, tag);
  Object.entries(attrs).forEach(([k, v]) => n.setAttribute(k, String(v)));
  return n;
}
function drawHtmlEl(tag, cls) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  return n;
}

const DRAW_STYLES = `
/* width/height:100% 不可省：<svg> 是 replaced element，預設 intrinsic 300×150，
   只給 inset:0 不會撐滿 host → 超出 300px 的點會穿到底下的 app（pointerdown 收不到）。 */
#pc-draw { position: absolute; inset: 0; width: 100%; height: 100%; z-index: 220; pointer-events: none; }
#pc-draw.pc-draw-active { pointer-events: auto; cursor: crosshair; }
#pc-draw.pc-draw-select { cursor: default; }
.pc-draw-selection rect[data-handle] { cursor: nwse-resize; }
.pc-draw-toolbar {
  position: fixed; left: 50%; bottom: 20px; transform: translateX(-50%);
  z-index: 2147483600; display: flex; align-items: center; gap: 4px;
  background: #1e1e1e; padding: 6px; border-radius: 12px;
  box-shadow: 0 6px 24px rgba(0,0,0,.35); font-family: system-ui, -apple-system, sans-serif;
}
.pc-draw-tool {
  width: 34px; height: 34px; border: none; border-radius: 8px; cursor: pointer;
  background: transparent; color: #e5e7eb; font-size: 16px; line-height: 1;
  display: flex; align-items: center; justify-content: center; transition: background .12s;
}
.pc-draw-tool:hover { background: #333; }
.pc-draw-tool.active { background: #0FA0A0; color: #fff; }
.pc-draw-tool svg { display: block; }
.pc-draw-sep { width: 1px; height: 22px; background: #3a3a3a; margin: 0 2px; }
/* 顏色/線粗收進 popover，避免 pill 過長溢出 */
.pc-draw-menu { position: relative; display: flex; align-items: center; }
.pc-draw-cur-color { width: 18px; height: 18px; border-radius: 50%; border: 2px solid #555; display: block; }
.pc-draw-popover {
  position: absolute; bottom: calc(100% + 10px); left: 50%; transform: translateX(-50%);
  display: none; flex-wrap: wrap; gap: 8px; width: 152px; box-sizing: border-box;
  background: #1e1e1e; padding: 10px; border-radius: 10px; box-shadow: 0 6px 24px rgba(0,0,0,.4);
}
.pc-draw-popover-width { width: auto; flex-wrap: nowrap; }
.pc-draw-menu.open .pc-draw-popover { display: flex; }
.pc-draw-swatch {
  width: 22px; height: 22px; border-radius: 50%; padding: 0; cursor: pointer;
  border: 2px solid transparent;
}
.pc-draw-swatch.active { border-color: #fff; box-shadow: 0 0 0 1px #0FA0A0; }
.pc-draw-color-custom {
  width: 22px; height: 22px; padding: 0; border: 2px solid #555; border-radius: 50%;
  background: none; cursor: pointer; overflow: hidden;
}
.pc-draw-color-custom::-webkit-color-swatch-wrapper { padding: 0; }
.pc-draw-color-custom::-webkit-color-swatch { border: none; border-radius: 50%; }
.pc-draw-width {
  width: 30px; height: 30px; border: none; border-radius: 8px; cursor: pointer;
  background: transparent; display: flex; align-items: center; justify-content: center;
}
.pc-draw-width:hover { background: #333; }
.pc-draw-width.active { background: #0FA0A0; }
.pc-draw-disabled { opacity: .35; cursor: not-allowed; }
.pc-draw-text-input {
  position: absolute; z-index: 230; min-width: 80px; font: 14px system-ui, sans-serif;
  color: #E5484D; background: rgba(255,255,255,.92); border: 1px solid #E5484D;
  border-radius: 4px; padding: 2px 4px; outline: none;
}
`;

function injectDrawStyles() {
  if (document.getElementById('pc-draw-styles')) return;
  const s = document.createElement('style');
  s.id = 'pc-draw-styles';
  s.textContent = DRAW_STYLES;
  document.head.appendChild(s);
}

function resolveTarget(target) {
  if (!target) return document.body;
  if (typeof target === 'string') return document.querySelector(target) || document.body;
  return target;
}

// ── init ────────────────────────────────────────────────────────────────────
export function initDrawLayer(target, opts = {}) {
  injectDrawStyles();
  const host = resolveTarget(target);
  if (getComputedStyle(host).position === 'static') host.style.position = 'relative';

  const svg = drawSvgEl('svg', { id: 'pc-draw' });
  buildArrowhead(svg);
  host.appendChild(svg);

  const state = {
    mode: opts.mode && DRAW_MODES.includes(opts.mode) ? opts.mode : 'off',
    tool: 'select',
    objects: [],      // DrawObject[]（committed，陣列順序＝z-order）
    draft: null,      // 進行中的 DrawObject（尚未送出）
    selectedId: null, // 目前選取物件 id
  };
  const history = makeUndoStack();
  let drag = null;    // 繪製中：{ tool, rect, start, points }
  const actions = { setMode, setTool, setColor, setStrokeWidth, act };
  const toolbar = buildToolbar(state, actions);
  document.body.appendChild(toolbar);

  function applyMode() {
    svg.classList.toggle('pc-draw-active', state.mode === 'draw');
    svg.classList.toggle('pc-draw-select', state.mode === 'draw' && state.tool === 'select');
    syncToolbar(toolbar, state, history);
  }
  function setMode(mode) {
    if (!DRAW_MODES.includes(mode)) return;
    state.mode = mode;
    applyMode();
  }
  function setTool(tool) {
    if (!DRAW_TOOLS.includes(tool)) return;
    state.tool = tool;
    if (tool !== 'select') state.selectedId = null; // 切到繪圖工具 → 取消選取（避免新物件被回頭改色）
    setMode('draw'); // 任何工具（含 select）都進 draw → SVG 吃事件
    render();
  }

  function stampZ() { state.objects.forEach((o, i) => { o.z = i; }); }

  function render() {
    stampZ();
    while (svg.childNodes.length > 1) svg.removeChild(svg.lastChild); // 保留 <defs>
    const rect = { width: svg.clientWidth || host.clientWidth, height: svg.clientHeight || host.clientHeight };
    [...state.objects, state.draft].forEach(o => {
      if (!o) return;
      const node = renderObject(o, rect, svg);
      node.setAttribute('data-id', o.id);
      svg.appendChild(node);
    });
    renderSelection(rect);
    syncToolbar(toolbar, state, history);
  }

  function renderSelection(rect) {
    if (!state.selectedId) return;
    const o = findById(state.objects, state.selectedId);
    if (!o) return;
    const b = geomBBox(o);
    const box = { x: pctToPx(b.x, rect.width), y: pctToPx(b.y, rect.height), w: pctToPx(b.w, rect.width), h: pctToPx(b.h, rect.height) };
    const g = drawSvgEl('g', { class: 'pc-draw-selection' });
    g.appendChild(drawSvgEl('rect', { x: box.x, y: box.y, width: box.w, height: box.h, fill: 'none', stroke: '#0FA0A0', 'stroke-width': 1, 'stroke-dasharray': '4 3', 'pointer-events': 'none' }));
    ['nw', 'ne', 'se', 'sw'].forEach(name => {
      const c = boxCorner(box, name);
      g.appendChild(drawSvgEl('rect', { x: c.x - 4, y: c.y - 4, width: 8, height: 8, fill: '#fff', stroke: '#0FA0A0', 'stroke-width': 1, 'data-handle': name }));
    });
    svg.appendChild(g);
  }

  // ── command 執行（apply＋push）/ undo / redo ─────────────────────────────────
  function runCommand(cmd) {
    state.objects = applyCommand(state.objects, cmd);
    history.push(cmd);
    if (cmd.type === 'create') state.selectedId = cmd.obj.id;
    render();
  }
  // 物件已即時改好（拖曳預覽），只補登歷史（不重複 apply）。
  function commitChange(id, before, after) {
    history.push({ type: 'update', id, before, after });
    render();
  }
  function doUndo() {
    const cmd = history.undo();
    if (!cmd) return;
    state.objects = invertCommand(state.objects, cmd);
    ensureSelectionValid();
    render();
  }
  function doRedo() {
    const cmd = history.redo();
    if (!cmd) return;
    state.objects = applyCommand(state.objects, cmd);
    ensureSelectionValid();
    render();
  }
  function ensureSelectionValid() {
    if (state.selectedId && !findById(state.objects, state.selectedId)) state.selectedId = null;
  }

  // ── z-order / 刪除 / style ──────────────────────────────────────────────────
  function zorder(op) {
    if (!state.selectedId) return;
    const before = state.objects.map(o => o.id);
    const after = reorderIds(before, state.selectedId, op);
    runCommand({ type: 'reorder', before, after });
  }
  function deleteSelected() {
    const o = findById(state.objects, state.selectedId);
    if (!o) return;
    const index = state.objects.indexOf(o);
    state.selectedId = null;
    runCommand({ type: 'delete', obj: o, index });
  }
  // Excalidraw 風格：繪圖工具啟用時，picker 只改「下一個新物件」的預設，不動目前選取；
  // 只有 select 工具 + 有選取時才回頭改選取物件的樣式（同時更新預設）。
  function setStyle(patch) {
    Object.assign(DEFAULT_DRAW_STYLE, patch); // 影響之後新物件
    const o = state.tool === 'select' ? findById(state.objects, state.selectedId) : null;
    if (!o) { render(); return; }
    const before = { style: { ...o.style } };
    o.style = { ...o.style, ...patch };
    commitChange(o.id, before, { style: { ...o.style } });
  }
  function setColor(c) { setStyle({ color: c }); }
  function setStrokeWidth(w) { setStyle({ strokeWidth: w }); }

  // toolbar 動作分派（z-order / 刪除 / undo-redo）。
  function act(action) {
    if (action === 'delete') return deleteSelected();
    if (action === 'undo') return doUndo();
    if (action === 'redo') return doRedo();
    return zorder(action); // front / back / forward / backward
  }

  // ── pointer：select 模式（選取 / 移動 / 縮放）─────────────────────────────────
  function onSelectDown(e) {
    const rect = svg.getBoundingClientRect();
    const handle = e.target && e.target.dataset ? e.target.dataset.handle : null;
    if (handle && state.selectedId) { startResize(e, handle, rect); return; }
    const p = clientToPct(e.clientX, e.clientY, rect);
    const hit = hitTest(p);
    state.selectedId = hit ? hit.id : null;
    render();
    if (hit) startMove(rect, p);
  }
  function hitTest(p) {
    for (let i = state.objects.length - 1; i >= 0; i--) {
      const b = geomBBox(state.objects[i]);
      const pad = 1.5;
      if (p.x >= b.x - pad && p.x <= b.x + b.w + pad && p.y >= b.y - pad && p.y <= b.y + b.h + pad)
        return state.objects[i];
    }
    return null;
  }
  function startMove(rect, startP) {
    const o = findById(state.objects, state.selectedId);
    if (!o) return;
    const before = o.geom;
    let moved = false;
    const onMv = ev => {
      const p = clientToPct(ev.clientX, ev.clientY, rect);
      o.geom = translateGeom({ tool: o.tool, geom: before }, p.x - startP.x, p.y - startP.y);
      moved = true;
      render();
    };
    const onUp = () => {
      window.removeEventListener('pointermove', onMv);
      window.removeEventListener('pointerup', onUp);
      if (moved) commitChange(o.id, { geom: before }, { geom: o.geom });
    };
    window.addEventListener('pointermove', onMv);
    window.addEventListener('pointerup', onUp);
  }
  function startResize(e, handle, rect) {
    const o = findById(state.objects, state.selectedId);
    if (!o) return;
    const before = o.geom;
    const oldBox = geomBBox(o);
    let resized = false;
    const onMv = ev => {
      const p = clientToPct(ev.clientX, ev.clientY, rect);
      const newBox = resizeBBox(oldBox, handle, p);
      o.geom = remapGeom({ tool: o.tool, geom: before }, oldBox, newBox);
      resized = true;
      render();
    };
    const onUp = () => {
      window.removeEventListener('pointermove', onMv);
      window.removeEventListener('pointerup', onUp);
      if (resized) commitChange(o.id, { geom: before }, { geom: o.geom });
    };
    window.addEventListener('pointermove', onMv);
    window.addEventListener('pointerup', onUp);
  }

  // ── pointer：繪製模式（拖曳畫物件）────────────────────────────────────────────
  function onDown(e) {
    if (state.mode !== 'draw') return;
    if (state.tool === 'select') { onSelectDown(e); return; }
    e.preventDefault();
    state.selectedId = null;
    const rect = svg.getBoundingClientRect();
    if (state.tool === 'text') { startTextInput(e.clientX, e.clientY, rect); return; }
    const p = clientToPct(e.clientX, e.clientY, rect);
    drag = { tool: state.tool, rect, start: p, points: [[p.x, p.y]] };
    state.draft = makeDrawObject({ tool: state.tool, geom: initialGeom(state.tool, p), style: opts.style });
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  }
  function onMove(e) {
    if (!drag || !state.draft) return;
    const p = clientToPct(e.clientX, e.clientY, drag.rect);
    state.draft.geom = updateGeom(drag, p);
    render();
  }
  function onUp() {
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);
    drag = null;
    commitDraft();
  }
  function commitDraft() {
    const d = state.draft;
    state.draft = null;
    if (d && isDrawn(d)) runCommand({ type: 'create', obj: d });
    else render();
  }

  function startTextInput(clientX, clientY, rect) {
    const input = drawHtmlEl('input', 'pc-draw-text-input');
    input.type = 'text';
    input.style.left = (clientX - rect.left) + 'px';
    input.style.top = (clientY - rect.top) + 'px';
    host.appendChild(input);
    setTimeout(() => input.focus(), 0);
    const point = clientToPct(clientX, clientY, rect);
    let done = false;
    const commit = () => {
      if (done) return;            // Enter 與 blur 都會觸發 → 防重複 remove/commit
      done = true;
      const text = input.value.trim();
      input.remove();
      if (!text) return;
      runCommand({ type: 'create', obj: makeDrawObject({ tool: 'text', geom: { x: point.x, y: point.y }, text, style: opts.style }) });
    };
    input.addEventListener('keydown', ev => { if (ev.key === 'Enter') { ev.preventDefault(); commit(); } });
    input.addEventListener('blur', commit);
  }

  // ── 鍵盤：Delete/Backspace 刪除、Cmd/Ctrl+Z undo、Shift+Cmd/Ctrl+Z redo ────────
  function onKey(e) {
    if (state.mode !== 'draw') return;
    const tag = (e.target && e.target.tagName) || '';
    if (tag === 'INPUT' || tag === 'TEXTAREA' || (e.target && e.target.isContentEditable)) return;
    const meta = e.metaKey || e.ctrlKey;
    if (meta && (e.key === 'z' || e.key === 'Z')) {
      e.preventDefault();
      if (e.shiftKey) doRedo(); else doUndo();
      return;
    }
    if ((e.key === 'Delete' || e.key === 'Backspace') && state.selectedId) {
      e.preventDefault();
      deleteSelected();
    }
  }

  svg.addEventListener('pointerdown', onDown);
  window.addEventListener('resize', render);
  window.addEventListener('keydown', onKey);

  applyMode();
  render();

  return {
    svg, host,
    getMode: () => state.mode,
    setMode,
    getTool: () => state.tool,
    setTool,
    getObjects: () => { stampZ(); return state.objects.map(serializeDrawObject); },
    getSelected: () => state.selectedId,
    select: id => { state.selectedId = id; render(); },
    bringToFront: () => zorder('front'),
    sendToBack: () => zorder('back'),
    forward: () => zorder('forward'),
    backward: () => zorder('backward'),
    deleteSelected,
    undo: doUndo,
    redo: doRedo,
    setColor,
    setStrokeWidth,
    clear: () => { state.objects = []; state.draft = null; state.selectedId = null; render(); },
    destroy: () => {
      svg.remove(); toolbar.remove();
      window.removeEventListener('resize', render);
      window.removeEventListener('keydown', onKey);
    },
  };
}

function findById(objects, id) { return objects.find(o => o.id === id); }

// ── 幾何（依工具，% 座標）──────────────────────────────────────────────────
function initialGeom(tool, p) {
  if (tool === 'ellipse' || tool === 'rect') return { x: p.x, y: p.y, w: 0, h: 0 };
  if (tool === 'arrow' || tool === 'line') return { from: { ...p }, to: { ...p } };
  if (tool === 'pencil') return { points: [[p.x, p.y]] };
  return { x: p.x, y: p.y };
}
function updateGeom(drag, p) {
  if (drag.tool === 'pencil') { drag.points.push([p.x, p.y]); return { points: drag.points.slice() }; }
  return geomFromDrag(drag.tool, drag.start, p);
}
// 判斷物件是否「真的畫了」（避免單點 click 留下空物件）。
function isDrawn(o) {
  if (o.tool === 'ellipse' || o.tool === 'rect') return o.geom.w > 0.2 || o.geom.h > 0.2;
  if (o.tool === 'arrow' || o.tool === 'line') { const g = o.geom; return Math.abs(g.to.x - g.from.x) > 0.2 || Math.abs(g.to.y - g.from.y) > 0.2; }
  if (o.tool === 'pencil') return (o.geom.points || []).length > 1;
  return true; // text 由 input commit 控制
}

// ── render 一個 DrawObject → SVG 節點（% → px）──────────────────────────────
function renderObject(o, rect, svg) {
  const s = o.style || DEFAULT_DRAW_STYLE;
  const stroke = { stroke: s.color, 'stroke-width': s.strokeWidth, fill: s.fill || 'none' };
  if (o.tool === 'ellipse') {
    const g = o.geom;
    return drawSvgEl('ellipse', {
      cx: pctToPx(g.x + g.w / 2, rect.width), cy: pctToPx(g.y + g.h / 2, rect.height),
      rx: pctToPx(g.w / 2, rect.width), ry: pctToPx(g.h / 2, rect.height), ...stroke,
    });
  }
  if (o.tool === 'rect') {
    const g = o.geom;
    return drawSvgEl('rect', {
      x: pctToPx(g.x, rect.width), y: pctToPx(g.y, rect.height),
      width: pctToPx(g.w, rect.width), height: pctToPx(g.h, rect.height), ...stroke,
    });
  }
  if (o.tool === 'arrow' || o.tool === 'line') {
    const g = o.geom;
    const attrs = {
      x1: pctToPx(g.from.x, rect.width), y1: pctToPx(g.from.y, rect.height),
      x2: pctToPx(g.to.x, rect.width), y2: pctToPx(g.to.y, rect.height),
      stroke: s.color, 'stroke-width': s.strokeWidth, fill: 'none',
    };
    if (o.tool === 'arrow') attrs['marker-end'] = `url(#${ensureArrowMarker(svg, s.color)})`;
    return drawSvgEl('line', attrs);
  }
  if (o.tool === 'pencil') {
    const pts = (o.geom.points || []).map(([x, y]) => `${pctToPx(x, rect.width)},${pctToPx(y, rect.height)}`).join(' ');
    return drawSvgEl('polyline', { points: pts, stroke: s.color, 'stroke-width': s.strokeWidth, fill: 'none', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' });
  }
  const t = drawSvgEl('text', { x: pctToPx(o.geom.x, rect.width), y: pctToPx(o.geom.y, rect.height), fill: s.color, 'font-size': 14, 'font-family': 'system-ui, sans-serif' });
  t.textContent = o.text || '';
  return t;
}

// <defs> 容器（marker 依顏色按需建立，見 ensureArrowMarker）。render 保留首子節點＝此 defs。
function buildArrowhead(svg) {
  svg.appendChild(drawSvgEl('defs'));
}

// 顏色 → 穩定的 marker id（只保留英數，確保是合法 id；保留 "arrowhead" 關鍵字）。
function arrowMarkerId(color) {
  return 'pc-draw-arrowhead-' + String(color).replace(/[^a-z0-9]/gi, '');
}

// 確保該顏色的箭頭 marker 存在於 <defs>（path fill＝該色 → 箭頭跟著 stroke 變色）。回傳 id。
function ensureArrowMarker(svg, color) {
  const id = arrowMarkerId(color);
  let defs = svg.querySelector('defs');
  if (!defs) { defs = drawSvgEl('defs'); svg.insertBefore(defs, svg.firstChild); }
  if (!defs.querySelector('#' + id)) {
    const marker = drawSvgEl('marker', { id, viewBox: '0 0 10 10', refX: 8, refY: 5, markerWidth: 7, markerHeight: 7, orient: 'auto-start-reverse' });
    marker.appendChild(drawSvgEl('path', { d: 'M0,0 L10,5 L0,10 z', fill: color }));
    defs.appendChild(marker);
  }
  return id;
}

// ── 工具列 UI（Material 圖示 + 顏色/線粗 popover）────────────────────────────
function buildToolbar(state, actions) {
  const bar = drawHtmlEl('div', 'pc-draw-toolbar');
  bar.id = 'pc-draw-toolbar';
  DRAW_TOOLS.forEach(tool => bar.appendChild(toolButton(tool, actions)));
  appendSep(bar);
  bar.appendChild(colorMenu(actions));
  bar.appendChild(widthMenu(actions));
  appendSep(bar);
  // z-order（icon 名 === action 名）＋ delete
  ['front', 'forward', 'backward', 'back', 'delete'].forEach(a => bar.appendChild(actButton(a, actions)));
  appendSep(bar);
  ['undo', 'redo'].forEach(a => bar.appendChild(actButton(a, actions)));
  appendSep(bar);
  const off = drawHtmlEl('button', 'pc-draw-tool');
  off.dataset.tool = 'off';
  off.title = '結束繪圖（放行 app 點擊）';
  off.setAttribute('aria-label', '結束繪圖');
  off.innerHTML = icon('close');
  off.onclick = () => actions.setMode('off');
  bar.appendChild(off);
  return bar;
}
function appendSep(bar) { bar.appendChild(drawHtmlEl('div', 'pc-draw-sep')); }
function toolButton(tool, actions) {
  const b = drawHtmlEl('button', 'pc-draw-tool');
  b.dataset.tool = tool;
  b.title = tool;
  b.setAttribute('aria-label', tool);
  b.innerHTML = icon(tool);
  b.onclick = () => actions.setTool(tool);
  return b;
}
function actButton(action, actions) {
  const b = drawHtmlEl('button', 'pc-draw-tool pc-draw-act');
  b.dataset.action = action;
  b.title = action;
  b.setAttribute('aria-label', action);
  b.innerHTML = icon(action);
  b.onclick = () => actions.act(action);
  return b;
}

// 顏色 popover：8 預設色 swatch ＋ <input type=color> 自訂任意 hex。
function colorMenu(actions) {
  const wrap = drawHtmlEl('div', 'pc-draw-menu');
  const trigger = drawHtmlEl('button', 'pc-draw-tool pc-draw-trigger');
  trigger.dataset.action = 'color-menu';
  trigger.title = '顏色';
  trigger.setAttribute('aria-label', '顏色');
  trigger.appendChild(drawHtmlEl('span', 'pc-draw-cur-color'));
  trigger.onclick = () => togglePopover(wrap);
  const pop = drawHtmlEl('div', 'pc-draw-popover');
  pop.dataset.menu = 'color';
  DRAW_COLORS.forEach(c => pop.appendChild(swatchButton(c, actions)));
  const custom = drawHtmlEl('input', 'pc-draw-color-custom');
  custom.type = 'color';
  custom.title = '更多顏色';
  custom.setAttribute('aria-label', '更多顏色');
  custom.dataset.action = 'custom-color';
  custom.addEventListener('input', () => actions.setColor(custom.value));
  pop.appendChild(custom);
  wrap.appendChild(trigger);
  wrap.appendChild(pop);
  return wrap;
}
// 線粗 popover：thin → bold 的遞增粗條。
function widthMenu(actions) {
  const wrap = drawHtmlEl('div', 'pc-draw-menu');
  const trigger = drawHtmlEl('button', 'pc-draw-tool pc-draw-trigger');
  trigger.dataset.action = 'width-menu';
  trigger.title = '線粗';
  trigger.setAttribute('aria-label', '線粗');
  trigger.innerHTML = icon('lineWeight');
  trigger.onclick = () => togglePopover(wrap);
  const pop = drawHtmlEl('div', 'pc-draw-popover pc-draw-popover-width');
  pop.dataset.menu = 'width';
  DRAW_STROKE_WIDTHS.forEach(w => pop.appendChild(widthButton(w, actions)));
  wrap.appendChild(trigger);
  wrap.appendChild(pop);
  return wrap;
}
function togglePopover(wrap) {
  const bar = wrap.closest('.pc-draw-toolbar');
  if (bar) bar.querySelectorAll('.pc-draw-menu.open').forEach(m => { if (m !== wrap) m.classList.remove('open'); });
  wrap.classList.toggle('open');
}
function swatchButton(color, actions) {
  const b = drawHtmlEl('button', 'pc-draw-swatch');
  b.dataset.color = color;
  b.style.background = color;
  b.title = color;
  b.setAttribute('aria-label', color);
  b.onclick = () => actions.setColor(color);
  return b;
}
function widthButton(w, actions) {
  const b = drawHtmlEl('button', 'pc-draw-width');
  b.dataset.width = w;
  b.title = w + 'px';
  b.setAttribute('aria-label', w + 'px');
  const dot = drawHtmlEl('span');
  dot.style.cssText = `display:block;width:18px;height:${Math.min(w, 10)}px;border-radius:4px;background:#e5e7eb;`;
  b.appendChild(dot);
  b.onclick = () => actions.setStrokeWidth(w);
  return b;
}

function syncToolbar(bar, state, history) {
  bar.querySelectorAll('.pc-draw-tool[data-tool]').forEach(b => {
    b.classList.toggle('active', state.mode === 'draw' && b.dataset.tool === state.tool);
  });
  const color = (DEFAULT_DRAW_STYLE.color || '').toLowerCase();
  const dot = bar.querySelector('.pc-draw-cur-color');
  if (dot) dot.style.background = DEFAULT_DRAW_STYLE.color;
  bar.querySelectorAll('.pc-draw-swatch').forEach(b => {
    b.classList.toggle('active', b.dataset.color.toLowerCase() === color);
  });
  bar.querySelectorAll('.pc-draw-width').forEach(b => {
    b.classList.toggle('active', Number(b.dataset.width) === DEFAULT_DRAW_STYLE.strokeWidth);
  });
  const hasSel = !!state.selectedId;
  bar.querySelectorAll('.pc-draw-act').forEach(b => {
    const a = b.dataset.action;
    const enabled = a === 'undo' ? (history && history.canUndo()) : a === 'redo' ? (history && history.canRedo()) : hasSel;
    b.disabled = !enabled;
    b.classList.toggle('pc-draw-disabled', !enabled);
  });
}
