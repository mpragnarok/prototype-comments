/**
 * draw-layer — Figma/Excalidraw 風格的視覺標注繪圖層（plan §4.1 / §4.2，P1 骨架）。
 *
 * 在既有 `#pc-overlay` 之上加一個 `#pc-draw` SVG 層，提供：
 *   - 模式狀態機 mode ∈ { comment, draw, off }；draw 時 SVG `pointer-events:auto`
 *     吃事件擋掉 app 點擊，comment/off 則 `pointer-events:none` 放行（不跟 app 打架）。
 *   - 浮動工具列：select / ellipse / arrow / pencil / text。
 *   - 四種工具的基本繪製，產生 DrawObject 並畫進 SVG。
 *
 * 座標一律存 viewport-% （沿用 pc.js 既有 % 慣例 → RWD 友善）；render 時才換算成 px。
 * px↔% 換算與 DrawObject 組裝抽成純函式（下方 export），可單測。
 *
 * Usage:
 *   import { initDrawLayer } from '.../src/draw-layer.js';
 *   const draw = initDrawLayer('#root');   // 或傳 element；預設 document.body
 *   draw.setMode('draw'); draw.setTool('ellipse');
 *
 * P1 之後（不在本階段）：選取/移動/縮放、z-order、貼圖、selector 擷取(anchor)、匯出。
 */

// ── 常數 ────────────────────────────────────────────────────────────────────
export const DRAW_MODES = ['comment', 'draw', 'off'];
export const DRAW_TOOLS = ['select', 'ellipse', 'arrow', 'pencil', 'text'];
export const DEFAULT_DRAW_STYLE = { color: '#E5484D', strokeWidth: 2, fill: 'none' };

const SVG_NS = 'http://www.w3.org/2000/svg';
const TOOL_LABELS = { select: '↖', ellipse: '◯', arrow: '↗', pencil: '✎', text: 'T' };

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

// 視窗座標 (clientX/Y) → 相對 rect 的 % 點。P1 自由畫＝固定畫布座標，不接 scroll anchor。
export function clientToPct(clientX, clientY, rect) {
  return {
    x: pxToPct(clientX - rect.left, rect.width),
    y: pxToPct(clientY - rect.top, rect.height),
  };
}

// 兩個 % 點 → bounding box（ellipse 幾何用）：{x,y}=左上、{w,h}=尺寸，皆為 %。
export function rectFromPoints(a, b) {
  return {
    x: Math.min(a.x, b.x),
    y: Math.min(a.y, b.y),
    w: Math.abs(b.x - a.x),
    h: Math.abs(b.y - a.y),
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
// anchor / z / imageRef 等留待 P2–P4，本階段不產生。
export function makeDrawObject({ id, tool, geom, style, text } = {}) {
  const obj = { id: id || nextDrawId(), tool, geom, style: normalizeStyle(style) };
  if (text != null) obj.text = text;
  return obj;
}

// 精簡序列化（之後匯出給 AI 用；P1 先提供可測形狀）。
export function serializeDrawObject(obj) {
  const out = { id: obj.id, tool: obj.tool, geom: obj.geom, style: obj.style };
  if (obj.text != null) out.text = obj.text;
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
.pc-draw-sep { width: 1px; height: 22px; background: #3a3a3a; margin: 0 2px; }
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
    objects: [],      // DrawObject[]（committed）
    draft: null,      // 進行中的 DrawObject（尚未送出）
  };
  let drag = null;    // { tool, rect, start }
  const toolbar = buildToolbar(state, { setMode, setTool });
  document.body.appendChild(toolbar);

  function applyMode() {
    svg.classList.toggle('pc-draw-active', state.mode === 'draw');
    syncToolbar(toolbar, state);
  }
  function setMode(mode) {
    if (!DRAW_MODES.includes(mode)) return;
    state.mode = mode;
    applyMode();
  }
  function setTool(tool) {
    if (!DRAW_TOOLS.includes(tool)) return;
    state.tool = tool;
    if (tool !== 'select') setMode('draw');
    else applyMode();
  }

  function render() {
    while (svg.childNodes.length > 1) svg.removeChild(svg.lastChild); // 保留 <defs>
    const rect = { width: svg.clientWidth || host.clientWidth, height: svg.clientHeight || host.clientHeight };
    [...state.objects, state.draft].forEach(o => { if (o) svg.appendChild(renderObject(o, rect)); });
  }

  function commitDraft() {
    if (state.draft && isDrawn(state.draft)) state.objects.push(state.draft);
    state.draft = null;
    render();
  }

  // ── pointer 繪製 ───────────────────────────────────────────────────────────
  function onDown(e) {
    if (state.mode !== 'draw' || state.tool === 'select') return;
    e.preventDefault();
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
      state.objects.push(makeDrawObject({ tool: 'text', geom: { x: point.x, y: point.y }, text, style: opts.style }));
      render();
    };
    input.addEventListener('keydown', ev => { if (ev.key === 'Enter') { ev.preventDefault(); commit(); } });
    input.addEventListener('blur', commit);
  }

  svg.addEventListener('pointerdown', onDown);
  window.addEventListener('resize', render);

  applyMode();
  render();

  return {
    svg, host,
    getMode: () => state.mode,
    setMode,
    getTool: () => state.tool,
    setTool,
    getObjects: () => state.objects.map(serializeDrawObject),
    clear: () => { state.objects = []; state.draft = null; render(); },
    destroy: () => { svg.remove(); toolbar.remove(); window.removeEventListener('resize', render); },
  };
}

// ── 幾何（依工具，% 座標）──────────────────────────────────────────────────
function initialGeom(tool, p) {
  if (tool === 'ellipse') return { x: p.x, y: p.y, w: 0, h: 0 };
  if (tool === 'arrow') return { from: { ...p }, to: { ...p } };
  if (tool === 'pencil') return { points: [[p.x, p.y]] };
  return { x: p.x, y: p.y };
}
function updateGeom(drag, p) {
  if (drag.tool === 'ellipse') return rectFromPoints(drag.start, p);
  if (drag.tool === 'arrow') return { from: { ...drag.start }, to: { ...p } };
  if (drag.tool === 'pencil') { drag.points.push([p.x, p.y]); return { points: drag.points.slice() }; }
  return { x: p.x, y: p.y };
}
// 判斷物件是否「真的畫了」（避免單點 click 留下空物件）。
function isDrawn(o) {
  if (o.tool === 'ellipse') return o.geom.w > 0.2 || o.geom.h > 0.2;
  if (o.tool === 'arrow') { const g = o.geom; return Math.abs(g.to.x - g.from.x) > 0.2 || Math.abs(g.to.y - g.from.y) > 0.2; }
  if (o.tool === 'pencil') return (o.geom.points || []).length > 1;
  return true; // text 由 input commit 控制
}

// ── render 一個 DrawObject → SVG 節點（% → px）──────────────────────────────
function renderObject(o, rect) {
  const s = o.style || DEFAULT_DRAW_STYLE;
  const stroke = { stroke: s.color, 'stroke-width': s.strokeWidth, fill: s.fill || 'none' };
  if (o.tool === 'ellipse') {
    const g = o.geom;
    return drawSvgEl('ellipse', {
      cx: pctToPx(g.x + g.w / 2, rect.width), cy: pctToPx(g.y + g.h / 2, rect.height),
      rx: pctToPx(g.w / 2, rect.width), ry: pctToPx(g.h / 2, rect.height), ...stroke,
    });
  }
  if (o.tool === 'arrow') {
    const g = o.geom;
    return drawSvgEl('line', {
      x1: pctToPx(g.from.x, rect.width), y1: pctToPx(g.from.y, rect.height),
      x2: pctToPx(g.to.x, rect.width), y2: pctToPx(g.to.y, rect.height),
      'marker-end': 'url(#pc-draw-arrowhead)', stroke: s.color, 'stroke-width': s.strokeWidth, fill: 'none',
    });
  }
  if (o.tool === 'pencil') {
    const pts = (o.geom.points || []).map(([x, y]) => `${pctToPx(x, rect.width)},${pctToPx(y, rect.height)}`).join(' ');
    return drawSvgEl('polyline', { points: pts, stroke: s.color, 'stroke-width': s.strokeWidth, fill: 'none', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' });
  }
  const t = drawSvgEl('text', { x: pctToPx(o.geom.x, rect.width), y: pctToPx(o.geom.y, rect.height), fill: s.color, 'font-size': 14, 'font-family': 'system-ui, sans-serif' });
  t.textContent = o.text || '';
  return t;
}

function buildArrowhead(svg) {
  const defs = drawSvgEl('defs');
  const marker = drawSvgEl('marker', { id: 'pc-draw-arrowhead', viewBox: '0 0 10 10', refX: 8, refY: 5, markerWidth: 7, markerHeight: 7, orient: 'auto-start-reverse' });
  marker.appendChild(drawSvgEl('path', { d: 'M0,0 L10,5 L0,10 z', fill: '#E5484D' }));
  defs.appendChild(marker);
  svg.appendChild(defs);
}

// ── 工具列 UI ───────────────────────────────────────────────────────────────
function buildToolbar(state, { setMode, setTool }) {
  const bar = drawHtmlEl('div', 'pc-draw-toolbar');
  bar.id = 'pc-draw-toolbar';
  DRAW_TOOLS.forEach(tool => {
    const b = drawHtmlEl('button', 'pc-draw-tool');
    b.dataset.tool = tool;
    b.title = tool;
    b.textContent = TOOL_LABELS[tool] || tool;
    b.onclick = () => setTool(tool);
    bar.appendChild(b);
  });
  bar.appendChild(drawHtmlEl('div', 'pc-draw-sep'));
  const off = drawHtmlEl('button', 'pc-draw-tool');
  off.dataset.tool = 'off';
  off.title = '結束繪圖（放行 app 點擊）';
  off.textContent = '✕';
  off.onclick = () => setMode('off');
  bar.appendChild(off);
  return bar;
}

function syncToolbar(bar, state) {
  bar.querySelectorAll('.pc-draw-tool').forEach(b => {
    const active = state.mode === 'draw' && b.dataset.tool === state.tool;
    b.classList.toggle('active', active);
  });
}
