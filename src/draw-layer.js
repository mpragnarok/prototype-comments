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
export const DRAW_TOOLS = ['select', 'rect', 'diamond', 'ellipse', 'arrow', 'line', 'pencil', 'text'];
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
  diamond: 'M12 2L22 12 12 22 2 12z',                                                          // 菱形（Material 無乾淨菱形，自繪）
  line: 'M19 13H5v-2h14v2z',                                                                   // remove (horizontal bar)
  front: 'M3 13h2v-2H3v2zm0 4h2v-2H3v2zm2 4v-2H3c0 1.1.89 2 2 2zM3 9h2V7H3v2zm12 12h2v-2h-2v2zm4-18H9c-1.11 0-2 .9-2 2v10c0 1.1.89 2 2 2h10c1.11 0 2-.9 2-2V5c0-1.1-.89-2-2-2zm0 12H9V5h10v10zm-8 6h2v-2h-2v2zm-4 0h2v-2H7v2z', // flip_to_front（置頂）
  back: 'M9 7H7v2h2V7zm0 4H7v2h2v-2zm0-8c-1.11 0-2 .9-2 2h2V3zm4 12h-2v2h2v-2zm6-12v2h2c0-1.1-.9-2-2-2zm-6 0h-2v2h2V3zM9 17v-2H7c0 1.1.89 2 2 2zm10-4h2v-2h-2v2zm0-4h2V7h-2v2zm0 8c1.1 0 2-.9 2-2h-2v2zM5 7H3v12c0 1.1.89 2 2 2h12v-2H5V7zm10-2h2V3h-2v2zm0 12h2v-2h-2v2z', // flip_to_back（置底）
  // move_up / move_down：左側上/下箭頭 + 右側堆疊列 → 一眼讀作「在圖層堆疊中上/下移一層」，與 flip 置頂/底明顯區隔。
  forward: 'M9 4L5 8h3v6h2V8h3zM15 5h6v2h-6zM15 9h6v2h-6zM15 13h6v2h-6zM15 17h6v2h-6z',           // move_up（上移一層）
  backward: 'M9 20l-4-4h3v-6h2v6h3zM15 5h6v2h-6zM15 9h6v2h-6zM15 13h6v2h-6zM15 17h6v2h-6z',        // move_down（下移一層）
  delete: 'M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z',       // delete
  undo: 'M12.5 8c-2.65 0-5.05.99-6.9 2.6L2 7v9h9l-3.62-3.62c1.39-1.16 3.16-1.88 5.12-1.88 3.54 0 6.55 2.31 7.6 5.5l2.37-.78C21.08 11.03 17.15 8 12.5 8z', // undo
  redo: 'M18.4 10.6C16.55 8.99 14.15 8 11.5 8c-4.65 0-8.58 3.03-9.96 7.22L3.9 16c1.05-3.19 4.05-5.5 7.6-5.5 1.95 0 3.73.72 5.12 1.88L13 16h9V7l-3.6 3.6z', // redo
  lineWeight: 'M3 17h18v-2H3v2zm0 3h18v-1H3v1zm0-7h18v-3H3v3zm0-9v4h18V4H3z',                    // line_weight
  close: 'M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z', // close
  colorize: 'M20.71 5.63l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-3.12 3.12-1.93-1.91-1.41 1.41 1.42 1.42L3 16.25V21h4.75l8.92-8.92 1.42 1.42 1.41-1.41-1.92-1.92 3.12-3.12c.4-.4.4-1.03.01-1.4zM6.92 19L5 17.08l8.06-8.06 1.92 1.92L6.92 19z', // colorize（吸管）
  brush: 'M7 14c-1.66 0-3 1.34-3 3 0 1.31-1.16 2-2 2 .92 1.22 2.49 2 4 2 2.21 0 4-1.79 4-4 0-1.66-1.34-3-3-3zm13.71-9.37l-1.34-1.34c-.39-.39-1.02-.39-1.41 0L9 12.25 11.75 15l8.96-8.96c.39-.39.39-1.02 0-1.41z', // brush（麥克筆）
  highlighter: 'M17.75 7L14 3.25l-10 10V17h3.75l10-10zm2.96-2.96c.39-.39.39-1.02 0-1.41L18.37.29c-.2-.2-.45-.29-.71-.29s-.51.1-.7.29L15 2.25 18.75 6l1.96-1.96zM0 20h24v4H0z', // border_color（螢光筆）
  send: 'M2.01 21L23 12 2.01 3 2 10l15 2-15 2z', // send（送給 AI）
};

// 一個 Material 圖示 → inline SVG 字串（currentColor → 跟著 active/hover 文字色變化）。
function icon(name, size = 20) {
  return `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="currentColor" aria-hidden="true"><path d="${ICON_PATHS[name]}"/></svg>`;
}

// 筆刷類型（自由筆 pencil 的 brushType）。
export const DRAW_BRUSHES = ['pen', 'marker', 'highlighter'];
const BRUSH_LABELS = { pen: '鋼筆', marker: '麥克筆', highlighter: '螢光筆' };
const BRUSH_ICON = { pen: 'pencil', marker: 'brush', highlighter: 'highlighter' };

// 各筆刷的渲染參數（純資料，可單測）：
//   fill=true → 變寬度填充外框（pen/marker，頭尾漸細）；fill=false → 等寬描邊（highlighter，半透明）。
//   widthMul = 相對 strokeWidth 的倍率；taperFrac = 頭尾各佔幾成做漸細；minScale = 端點最小寬度比例。
export const BRUSH_RENDER = {
  pen: { fill: true, widthMul: 1.8, taperFrac: 0.18, minScale: 0, opacity: 1, blend: 'normal' },
  marker: { fill: true, widthMul: 3.2, taperFrac: 0.12, minScale: 0.5, opacity: 1, blend: 'normal' },
  highlighter: { fill: false, widthMul: 5, taperFrac: 0, minScale: 1, opacity: 0.4, blend: 'multiply' },
};
export function brushStyle(brushType) { return BRUSH_RENDER[brushType] || BRUSH_RENDER.pen; }

// ── 鍵盤快捷鍵（Excalidraw 風格：數字 + 字母都可）────────────────────────────────
// 值為工具名（DRAW_TOOLS）或 'eyedropper'。鍵一律小寫；diamond(3)/image(9) 尚未實作故略過。
export const TOOL_SHORTCUTS = {
  1: 'select', v: 'select',
  2: 'rect', r: 'rect',
  3: 'diamond', d: 'diamond',
  4: 'ellipse', o: 'ellipse',
  5: 'arrow', a: 'arrow',
  6: 'line', l: 'line',
  7: 'pencil', p: 'pencil',
  8: 'text', t: 'text',
  i: 'eyedropper',
};
// 工具的中文標籤與主要字母提示（tooltip / aria）。
const TOOL_LABELS_ZH = { select: '選取', ellipse: '橢圓', arrow: '箭頭', pencil: '自由筆', text: '文字', rect: '矩形', diamond: '菱形', line: '直線' };
const TOOL_KEY = { select: 'V', rect: 'R', diamond: 'D', ellipse: 'O', arrow: 'A', line: 'L', pencil: 'P', text: 'T' };

// key（單鍵）→ 工具名 / 'eyedropper' / null。大小寫不敏感。純函式。
export function resolveShortcut(key) {
  if (key == null) return null;
  return TOOL_SHORTCUTS[String(key).toLowerCase()] || null;
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

// 菱形（rhombus）四頂點：內接於 bbox（上、右、下、左中點）。純函式，px 或 % 皆可。
export function diamondPoints(box) {
  return [
    [box.x + box.w / 2, box.y],
    [box.x + box.w, box.y + box.h / 2],
    [box.x + box.w / 2, box.y + box.h],
    [box.x, box.y + box.h / 2],
  ];
}

// 貼圖初始幾何（% 座標）：自然像素尺寸等比縮到 ≤ maxFrac 畫布，置於 atPoint 中心（無則畫布中心），夾進畫布。
// 純函式 → {x,y,w,h}（%）。等比在「像素空間」計算後再換成 %，確保視覺長寬比正確。
export function imageGeom(natW, natH, canvasW, canvasH, atPoint, maxFrac = 0.6) {
  const r2 = n => parseFloat(n.toFixed(2));
  const CW = canvasW || 1, CH = canvasH || 1;
  const scale = Math.min(1, (maxFrac * CW) / (natW || 1), (maxFrac * CH) / (natH || 1)); // 等比、不放大
  const wPct = (natW * scale / CW) * 100;
  const hPct = (natH * scale / CH) * 100;
  let x = atPoint ? atPoint.x - wPct / 2 : 50 - wPct / 2;
  let y = atPoint ? atPoint.y - hPct / 2 : 50 - hPct / 2;
  x = Math.max(0, Math.min(x, 100 - wPct)); // 夾進畫布
  y = Math.max(0, Math.min(y, 100 - hPct));
  return { x: r2(x), y: r2(y), w: r2(wPct), h: r2(hPct) };
}

// ── P4 結構化匯出（selector 擷取 + 精簡 JSON）────────────────────────────────────
const ANCHOR_DATA_ATTRS = ['data-testid', 'data-test', 'data-cy', 'data-id'];
function cssEscape(s) {
  if (typeof CSS !== 'undefined' && CSS.escape) return CSS.escape(s);
  return String(s).replace(/[^a-zA-Z0-9_-]/g, '\\$&'); // node fallback（無 CSS API）
}
function nthOfType(el) {
  const parent = el.parentElement || el.parentNode;
  if (!parent || !parent.children) return null;
  const same = [...parent.children].filter(c => c.tagName === el.tagName);
  if (same.length <= 1) return null;
  return same.indexOf(el) + 1;
}
// DOM 元素 → 穩定 CSS selector（id 優先 → data-* → nth-of-type 路徑）。可被 querySelector round-trip。
export function cssSelectorFor(el) {
  if (!el || !el.tagName) return null;
  if (el.id) return '#' + cssEscape(el.id);
  for (const attr of ANCHOR_DATA_ATTRS) {
    const v = el.getAttribute && el.getAttribute(attr);
    if (v) return `[${attr}="${cssEscape(v)}"]`;
  }
  const parts = [];
  let cur = el;
  while (cur && cur.tagName) {
    const tag = cur.tagName.toLowerCase();
    if (tag === 'html' || tag === 'body') break;
    if (cur.id) { parts.unshift('#' + cssEscape(cur.id)); break; }
    const v = cur.getAttribute && ANCHOR_DATA_ATTRS.map(a => [a, cur.getAttribute(a)]).find(([, x]) => x);
    if (v) { parts.unshift(`[${v[0]}="${cssEscape(v[1])}"]`); break; }
    const n = nthOfType(cur);
    parts.unshift(n ? `${tag}:nth-of-type(${n})` : tag);
    cur = cur.parentElement || cur.parentNode;
  }
  return parts.length ? parts.join(' > ') : null;
}

// DrawObject[] → 精簡結構化匯出（省 token；只含有意義欄位）。純函式。
export function buildExport(objects, viewport = {}) {
  return {
    viewport: { w: viewport.w || 0, h: viewport.h || 0 },
    annotations: (objects || []).map(o => {
      const a = { id: o.id, tool: o.tool };
      if (o.anchor != null) a.selector = o.anchor;
      const text = (o.label != null && o.label !== '') ? o.label : (o.text != null ? o.text : null);
      if (text != null) a.text = text;
      if (o.style && o.style.color) a.color = o.style.color;
      if (o.imageRef != null) a.image = true; // 標記有圖（dataURL 不塞進精簡 JSON）
      a.geom = o.geom;
      return a;
    }),
  };
}

// 一次拖曳（起點 a、終點 b）→ 某工具的幾何（box 類 / 端點類）。pencil 另走累點邏輯。
export function geomFromDrag(tool, a, b) {
  if (tool === 'ellipse' || tool === 'rect' || tool === 'diamond') return rectFromPoints(a, b);
  if (tool === 'arrow' || tool === 'line') return { from: { ...a }, to: { ...b } };
  return { x: b.x, y: b.y }; // text 等：落點即位置
}

// 抽稀：丟掉與上一個保留點距離 < minDist 的密集點（保留首尾），讓平滑曲線乾淨。
function thinPoints(points, minDist) {
  if (!points || points.length <= 2) return (points || []).slice();
  const out = [points[0]];
  let last = points[0];
  for (let i = 1; i < points.length - 1; i++) {
    const dx = points[i][0] - last[0], dy = points[i][1] - last[1];
    if (dx * dx + dy * dy >= minDist * minDist) { out.push(points[i]); last = points[i]; }
  }
  out.push(points[points.length - 1]);
  return out;
}

// 自由筆平滑（Excalidraw 風格手繪感）：二次貝茲「中點平滑」——
// 每段以「採樣點」當控制點、以「相鄰兩採樣點的中點」當端點 → 連續、無稜角。
// 純函式：input 為 px 點陣列 [[x,y]…]，回傳 SVG <path> 的 d 字串（M … Q … L …）。
export function freehandPath(points, minDist = 1.5) {
  const pts = thinPoints(points, minDist);
  const r = n => Math.round(n * 100) / 100;
  if (pts.length === 0) return '';
  const p0 = pts[0];
  if (pts.length === 1) return `M ${r(p0[0])} ${r(p0[1])}`;                              // 單點 → round cap 顯示一個點
  if (pts.length === 2) return `M ${r(p0[0])} ${r(p0[1])} L ${r(pts[1][0])} ${r(pts[1][1])}`; // 兩點 → 直線
  let d = `M ${r(p0[0])} ${r(p0[1])}`;
  for (let i = 1; i < pts.length - 1; i++) {
    const xc = (pts[i][0] + pts[i + 1][0]) / 2;
    const yc = (pts[i][1] + pts[i + 1][1]) / 2;
    d += ` Q ${r(pts[i][0])} ${r(pts[i][1])} ${r(xc)} ${r(yc)}`;
  }
  const last = pts[pts.length - 1];
  return d + ` L ${r(last[0])} ${r(last[1])}`; // 收尾接到最後一個採樣點
}

// 漸細係數：t（0..1 弧長位置）→ 0..1。頭尾各佔 taperFrac 從 0 線性升到 1，中段恆 1。
export function taperScale(t, taperFrac = 0.15) {
  const f = taperFrac <= 0 ? 1e-4 : taperFrac;
  if (t < f) return t / f;
  if (t > 1 - f) return (1 - t) / f;
  return 1;
}

// 每個中心線點的線寬（依弧長位置漸細）。純函式，供 taperedOutline 與單測使用。
export function outlineWidths(points, baseWidth, opts = {}) {
  const taperFrac = opts.taperFrac ?? 0.15;
  const minScale = opts.minScale ?? 0;
  const pts = thinPoints(points, 0.5);
  const n = pts.length;
  if (n === 0) return [];
  if (n === 1) return [baseWidth];
  const len = [0];
  let total = 0;
  for (let i = 1; i < n; i++) { total += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); len.push(total); }
  if (!total) total = 1;
  return len.map(L => baseWidth * (minScale + (1 - minScale) * taperScale(L / total, taperFrac)));
}

// 頭尾漸細的「填充外框」path（pen/marker 用）：沿中心線兩側依 outlineWidths 偏移，
// 去程走一側、回程走另一側、封閉成多邊形。純函式 → SVG <path> 的 d（M…L…Z）。
export function taperedOutline(points, baseWidth, opts = {}) {
  const pts = thinPoints(points, 0.5);
  const r = v => Math.round(v * 100) / 100;
  const n = pts.length;
  if (n === 0) return '';
  if (n === 1) { // 單點 → 圓點
    const rad = baseWidth / 2, [x, y] = pts[0];
    return `M ${r(x - rad)} ${r(y)} a ${r(rad)} ${r(rad)} 0 1 0 ${r(2 * rad)} 0 a ${r(rad)} ${r(rad)} 0 1 0 ${r(-2 * rad)} 0 Z`;
  }
  const widths = outlineWidths(points, baseWidth, opts);
  const left = [], right = [];
  for (let i = 0; i < n; i++) {
    const dir = pointDir(pts, i);
    const nx = -dir.y, ny = dir.x; // 法線
    const w = widths[i] / 2;
    left.push([pts[i][0] + nx * w, pts[i][1] + ny * w]);
    right.push([pts[i][0] - nx * w, pts[i][1] - ny * w]);
  }
  let d = `M ${r(left[0][0])} ${r(left[0][1])}`;
  for (let i = 1; i < n; i++) d += ` L ${r(left[i][0])} ${r(left[i][1])}`;
  for (let i = n - 1; i >= 0; i--) d += ` L ${r(right[i][0])} ${r(right[i][1])}`;
  return d + ' Z';
}
// 第 i 點的單位切線（用前後鄰點方向）。
function pointDir(pts, i) {
  const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const m = Math.hypot(dx, dy) || 1;
  return { x: dx / m, y: dy / m };
}

// 任一物件 → 其 % bounding box（選取框 / 命中測試 / 縮放重映射用）。
export function geomBBox(o) {
  const g = o.geom;
  if (o.tool === 'ellipse' || o.tool === 'rect' || o.tool === 'diamond' || o.tool === 'image') return { x: g.x, y: g.y, w: g.w, h: g.h };
  if (o.tool === 'arrow' || o.tool === 'line') return rectFromPoints(g.from, g.to);
  if (o.tool === 'pencil') {
    const xs = g.points.map(p => p[0]), ys = g.points.map(p => p[1]);
    const x = Math.min(...xs), y = Math.min(...ys);
    return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
  }
  const w = Math.max(4, (o.text ? o.text.length : 1) * 1.2); // text：估一個可命中的框
  return { x: g.x, y: g.y - 2.5, w, h: 3.5 };
}

// 綁定標籤的錨點（% 座標）：line/arrow 取兩端中點；其餘取 bbox 中心。隨 geom 重算 → 跟著物件移動/縮放。
export function labelAnchor(o) {
  if (o.tool === 'arrow' || o.tool === 'line') {
    const g = o.geom;
    return { x: (g.from.x + g.to.x) / 2, y: (g.from.y + g.to.y) / 2 };
  }
  const b = geomBBox(o);
  return { x: b.x + b.w / 2, y: b.y + b.h / 2 };
}

// 平移物件幾何（移動）。回傳新 geom，不改入參。
export function translateGeom(o, dx, dy) {
  const g = o.geom;
  if (o.tool === 'arrow' || o.tool === 'line')
    return { from: { x: g.from.x + dx, y: g.from.y + dy }, to: { x: g.to.x + dx, y: g.to.y + dy } };
  if (o.tool === 'pencil') return { points: g.points.map(([x, y]) => [x + dx, y + dy]) };
  if (o.tool === 'ellipse' || o.tool === 'rect' || o.tool === 'diamond' || o.tool === 'image') return { x: g.x + dx, y: g.y + dy, w: g.w, h: g.h };
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
  if (o.tool === 'ellipse' || o.tool === 'rect' || o.tool === 'diamond' || o.tool === 'image') return { x: newBox.x, y: newBox.y, w: newBox.w, h: newBox.h };
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

// 兩個 box（{x,y,w,h}）是否相交（marquee 命中測試用）。
export function rectsIntersect(a, b) {
  return !(a.x > b.x + b.w || a.x + a.w < b.x || a.y > b.y + b.h || a.y + a.h < b.y);
}

// marquee（橡皮筋框）→ 命中的物件 id（bbox 與框相交者）。純函式。
export function marqueeSelect(objects, mrect) {
  return objects.filter(o => rectsIntersect(geomBBox(o), mrect)).map(o => o.id);
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

// 多選 z-order：整組一起移動，保留它們彼此的相對順序。回傳新 id 陣列。
export function reorderMany(ids, selectedIds, op) {
  const selSet = new Set(selectedIds);
  const sel = ids.filter(id => selSet.has(id)); // 依現有 z 順序保相對序
  if (!sel.length) return ids.slice();
  const rest = ids.filter(id => !selSet.has(id));
  if (op === 'front') return [...rest, ...sel];
  if (op === 'back') return [...sel, ...rest];
  if (op === 'forward') return shiftGroup(ids, selSet, +1);
  if (op === 'backward') return shiftGroup(ids, selSet, -1);
  return ids.slice();
}
// 把選取群組整體往 dir（+1 上 / -1 下）移一步，群組成員不互相穿越。
function shiftGroup(ids, selSet, dir) {
  const arr = ids.slice();
  if (dir > 0) {
    for (let i = arr.length - 2; i >= 0; i--) {
      if (selSet.has(arr[i]) && !selSet.has(arr[i + 1])) { const t = arr[i]; arr[i] = arr[i + 1]; arr[i + 1] = t; }
    }
  } else {
    for (let i = 1; i < arr.length; i++) {
      if (selSet.has(arr[i]) && !selSet.has(arr[i - 1])) { const t = arr[i]; arr[i] = arr[i - 1]; arr[i - 1] = t; }
    }
  }
  return arr;
}

// 顏色/筆粗套用（純）：依 tool/selectedIds 決定「只設預設」或「同時改選取的所有物件」。
// 回傳 { defaultStyle, objects, cmds }；eyedropper 與 picker 共用同一路徑。
export function applyStylePatch({ tool, selectedIds, objects, defaultStyle }, patch) {
  const nextDefault = { ...defaultStyle, ...patch };
  const sel = new Set(tool === 'select' ? selectedIds : []);
  if (!sel.size) return { defaultStyle: nextDefault, objects, cmds: [] };
  const cmds = [];
  const nextObjects = objects.map(o => {
    if (!sel.has(o.id)) return o;
    const before = { style: { ...o.style } };
    const after = { style: { ...o.style, ...patch } };
    cmds.push({ type: 'update', id: o.id, before, after });
    return { ...o, ...after };
  });
  return { defaultStyle: nextDefault, objects: nextObjects, cmds };
}

// EyeDropper API 偵測（feature-detect；可注入 win 以利單測）。
export function eyedropperSupported(win = (typeof window !== 'undefined' ? window : undefined)) {
  return !!win && typeof win.EyeDropper === 'function';
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
  if (cmd.type === 'batch') return cmd.cmds.reduce((objs, c) => applyCommand(objs, c), objects);
  if (cmd.type === 'deleteMany') {
    const ids = new Set(cmd.items.map(it => it.obj.id));
    return objects.filter(o => !ids.has(o.id));
  }
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
  if (cmd.type === 'batch') return cmd.cmds.slice().reverse().reduce((objs, c) => invertCommand(objs, c), objects);
  if (cmd.type === 'deleteMany') {
    const next = objects.slice();
    cmd.items.slice().sort((a, b) => a.index - b.index) // 由小到大插回 → 原索引正確
      .forEach(it => next.splice(Math.min(it.index, next.length), 0, it.obj));
    return next;
  }
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
  const out = {
    color: style.color || DEFAULT_DRAW_STYLE.color,
    strokeWidth: style.strokeWidth ?? DEFAULT_DRAW_STYLE.strokeWidth,
    fill: style.fill || DEFAULT_DRAW_STYLE.fill,
  };
  if (style.brushType) out.brushType = style.brushType; // 自由筆刷類型（pen/marker/highlighter）
  return out;
}

let _idSeq = 0;
function nextDrawId() { return 'd' + (++_idSeq); }

// 組裝一個 DrawObject（plan §4.2 子集：id/tool/geom/style[/text]）。
// z 由繪圖層在 commit 時依 DOM 順序戳上（stampZ），純函式不負責。
export function makeDrawObject({ id, tool, geom, style, text, imageRef } = {}) {
  const obj = { id: id || nextDrawId(), tool, geom, style: normalizeStyle(style) };
  if (text != null) obj.text = text;
  if (imageRef != null) obj.imageRef = imageRef; // image 物件的 dataURL（P3）/ 本機路徑（P4）
  return obj;
}

// 精簡序列化（之後匯出給 AI 用）。z 若已戳上則一併輸出。
export function serializeDrawObject(obj) {
  const out = { id: obj.id, tool: obj.tool, geom: obj.geom, style: obj.style };
  if (obj.text != null) out.text = obj.text;
  if (obj.label != null && obj.label !== '') out.label = obj.label; // 綁定標籤
  if (obj.anchor != null) out.anchor = obj.anchor;                  // elementFromPoint selector
  if (obj.imageRef != null) out.imageRef = obj.imageRef;            // 貼圖 dataURL/路徑
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
  position: relative;
  width: 34px; height: 34px; border: none; border-radius: 8px; cursor: pointer;
  background: transparent; color: #e5e7eb; font-size: 16px; line-height: 1;
  display: flex; align-items: center; justify-content: center; transition: background .12s;
}
.pc-draw-tool:hover { background: #333; }
.pc-draw-tool.active { background: #0FA0A0; color: #fff; }
.pc-draw-tool svg { display: block; }
/* 常駐數字快捷鍵徽章（Excalidraw 風格，右下角、不擋點擊、不位移圖示） */
.pc-draw-kbd {
  position: absolute; right: 3px; bottom: 1px; pointer-events: none;
  font: 9px/1 system-ui, -apple-system, sans-serif; color: rgba(229,231,235,.55);
}
.pc-draw-tool.active .pc-draw-kbd { color: rgba(255,255,255,.7); }
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
/* 第 9 顆：彩虹圓 + 「+」，明確邀請「挑自己的顏色」 */
.pc-draw-custom-swatch {
  position: relative; display: flex; align-items: center; justify-content: center;
  border-color: #fff; cursor: pointer; overflow: hidden;
  background: conic-gradient(#f00, #ff0, #0f0, #0ff, #00f, #f0f, #f00);
}
.pc-draw-custom-swatch::after {
  content: '+'; font: bold 15px system-ui, sans-serif; color: #fff;
  text-shadow: 0 0 2px rgba(0,0,0,.7); line-height: 1; pointer-events: none;
}
.pc-draw-color-custom {
  position: absolute; inset: 0; width: 100%; height: 100%;
  opacity: 0; padding: 0; border: none; cursor: pointer;
}
.pc-draw-width {
  width: 30px; height: 30px; border: none; border-radius: 8px; cursor: pointer;
  background: transparent; display: flex; align-items: center; justify-content: center;
}
.pc-draw-width:hover { background: #333; }
.pc-draw-width.active { background: #0FA0A0; }
.pc-draw-disabled { opacity: .35; cursor: not-allowed; }
.pc-draw-eyedropper { color: #e5e7eb; }
/* 右鍵 context menu */
.pc-draw-context {
  position: fixed; z-index: 2147483601; display: none; flex-direction: column;
  min-width: 132px; padding: 4px; background: #1e1e1e; border-radius: 8px;
  box-shadow: 0 6px 24px rgba(0,0,0,.4); font-family: system-ui, -apple-system, sans-serif;
}
.pc-draw-context.open { display: flex; }
.pc-draw-context-item {
  display: flex; align-items: center; gap: 8px; width: 100%;
  padding: 6px 8px; border: none; border-radius: 6px; cursor: pointer;
  background: transparent; color: #e5e7eb; font-size: 13px; text-align: left;
}
.pc-draw-context-item:hover { background: #0FA0A0; color: #fff; }
.pc-draw-context-item svg { flex: none; }
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
    selectedIds: [],  // 多選：目前選取的物件 id 集合（陣列保序）
    marquee: null,    // 進行中的橡皮筋框 {x,y,w,h}（% 座標）
    brushType: 'pen', // 自由筆刷類型 pen/marker/highlighter
    exportEndpoint: opts.exportEndpoint || null, // 「送給 AI」POST 目標（無則只回 payload）
  };
  const history = makeUndoStack();
  let drag = null;    // 繪製中：{ tool, rect, start, points }
  const actions = { setMode, setTool, setBrush, setColor, setStrokeWidth, act, eyedropper: openEyedropper, closeContext: closeContextMenu, send: () => sendToAgent() };
  const toolbar = buildToolbar(state, actions);
  document.body.appendChild(toolbar);
  const contextMenu = buildContextMenu(actions);
  document.body.appendChild(contextMenu);

  // 選取集合小工具
  const isSelected = id => state.selectedIds.includes(id);
  const selectOnly = id => { state.selectedIds = id ? [id] : []; };
  const toggleSelect = id => {
    state.selectedIds = isSelected(id) ? state.selectedIds.filter(x => x !== id) : [...state.selectedIds, id];
  };
  const selectedObjects = () => state.selectedIds.map(id => findById(state.objects, id)).filter(Boolean);

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
    if (tool !== 'select') state.selectedIds = []; // 切到繪圖工具 → 取消選取（避免新物件被回頭改色）
    setMode('draw'); // 任何工具（含 select）都進 draw → SVG 吃事件
    render();
  }
  function setBrush(type) {
    if (!DRAW_BRUSHES.includes(type)) return;
    state.brushType = type;
    setTool('pencil'); // 選筆刷即切到自由筆
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
      // 物件不吃指標事件 → 所有點擊都落在穩定的 <svg>（hit-test 用幾何）。
      // 關鍵：避免點擊細線時 render() 重建 <line> 導致瀏覽器 dblclick 因 target 改變而不觸發。
      node.setAttribute('pointer-events', 'none');
      svg.appendChild(node);
      const lbl = renderLabel(o, rect);
      if (lbl) { svg.appendChild(lbl); sizeLabelBg(lbl); } // 綁定標籤；append 後量 text bbox 收緊白底
    });
    renderSelection(rect);
    renderMarquee(rect);
    syncToolbar(toolbar, state, history);
  }

  function renderSelection(rect) {
    const objs = selectedObjects();
    if (!objs.length) return;
    const g = drawSvgEl('g', { class: 'pc-draw-selection' });
    objs.forEach(o => {
      const box = toPxBox(geomBBox(o), rect);
      g.appendChild(drawSvgEl('rect', { x: box.x, y: box.y, width: box.w, height: box.h, fill: 'none', stroke: '#0FA0A0', 'stroke-width': 1, 'stroke-dasharray': '4 3', 'pointer-events': 'none' }));
    });
    if (objs.length === 1) { // 縮放 handle 只在單選時出現
      const box = toPxBox(geomBBox(objs[0]), rect);
      ['nw', 'ne', 'se', 'sw'].forEach(name => {
        const c = boxCorner(box, name);
        g.appendChild(drawSvgEl('rect', { x: c.x - 4, y: c.y - 4, width: 8, height: 8, fill: '#fff', stroke: '#0FA0A0', 'stroke-width': 1, 'data-handle': name }));
      });
    }
    svg.appendChild(g);
  }
  function renderMarquee(rect) {
    if (!state.marquee) return;
    const box = toPxBox(state.marquee, rect);
    svg.appendChild(drawSvgEl('rect', { class: 'pc-draw-marquee', x: box.x, y: box.y, width: box.w, height: box.h, fill: 'rgba(15,160,160,.08)', stroke: '#0FA0A0', 'stroke-width': 1, 'stroke-dasharray': '4 3', 'pointer-events': 'none' }));
  }

  // ── command 執行（apply＋push）/ undo / redo ─────────────────────────────────
  function runCommand(cmd) {
    state.objects = applyCommand(state.objects, cmd);
    history.push(cmd);
    if (cmd.type === 'create') state.selectedIds = [cmd.obj.id];
    render();
  }
  // 物件已即時改好（拖曳預覽），只補登歷史（不重複 apply）。
  function pushHistory(cmd) { history.push(cmd); render(); }
  function commitChange(id, before, after) { pushHistory({ type: 'update', id, before, after }); }
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
    state.selectedIds = state.selectedIds.filter(id => findById(state.objects, id));
  }

  // ── z-order / 刪除 / style（皆作用於整個選取集合）──────────────────────────────
  function zorder(op) {
    if (!state.selectedIds.length) return;
    const before = state.objects.map(o => o.id);
    const after = reorderMany(before, state.selectedIds, op);
    runCommand({ type: 'reorder', before, after });
  }
  function deleteSelected() {
    if (!state.selectedIds.length) return;
    const items = state.objects
      .map((o, i) => ({ obj: o, index: i }))
      .filter(it => isSelected(it.obj.id)); // 已依 index 由小到大
    if (!items.length) return;
    state.selectedIds = [];
    runCommand({ type: 'deleteMany', items });
  }
  // Excalidraw 風格：繪圖工具啟用時 picker 只改「下一個新物件」的預設、不動選取；
  // select 工具 + 有選取時才回頭改「所有選取物件」的樣式（同時更新預設）。
  function setStyle(patch) {
    const res = applyStylePatch({ tool: state.tool, selectedIds: state.selectedIds, objects: state.objects, defaultStyle: DEFAULT_DRAW_STYLE }, patch);
    Object.assign(DEFAULT_DRAW_STYLE, res.defaultStyle);
    state.objects = res.objects;
    if (!res.cmds.length) { render(); return; }
    pushHistory(res.cmds.length === 1 ? res.cmds[0] : { type: 'batch', cmds: res.cmds });
  }
  function setColor(c) { setStyle({ color: c }); }
  function setStrokeWidth(w) { setStyle({ strokeWidth: w }); }

  // 吸管：用瀏覽器 EyeDropper API 取樣 → 走 setColor 同一語意。
  async function openEyedropper() {
    if (!eyedropperSupported(window)) return;
    try {
      const res = await new window.EyeDropper().open();
      if (res && res.sRGBHex) setColor(res.sRGBHex);
    } catch (_) { /* 使用者按 Esc 取消 → 忽略 */ }
  }

  // toolbar / 右鍵選單 動作分派（z-order / 刪除 / undo-redo）。
  function act(action) {
    if (action === 'delete') return deleteSelected();
    if (action === 'undo') return doUndo();
    if (action === 'redo') return doRedo();
    return zorder(action); // front / back / forward / backward
  }

  // ── pointer：select 模式（選取 / 多選 / marquee / 移動 / 縮放）──────────────────
  function onSelectDown(e) {
    const rect = svg.getBoundingClientRect();
    const handle = e.target && e.target.dataset ? e.target.dataset.handle : null;
    if (handle && state.selectedIds.length === 1) { startResize(e, handle, rect); return; }
    const p = clientToPct(e.clientX, e.clientY, rect);
    const hit = hitTest(p);
    if (!hit) { startMarquee(rect, p, e.shiftKey); render(); return; } // 空白起拖 → 橡皮筋框
    if (e.shiftKey) { toggleSelect(hit.id); render(); return; }        // Shift+click → 加/減選
    if (!isSelected(hit.id)) selectOnly(hit.id);                       // 點未選物件 → 只選它
    render();
    startMove(rect, p);                                               // 拖曳 → 整個選取一起移動
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
  function startMarquee(rect, startP, additive) {
    const base = additive ? state.selectedIds.slice() : [];
    state.selectedIds = base.slice(); // 起手即套用：純 click 空白（無拖移）也會取消選取
    state.marquee = { x: startP.x, y: startP.y, w: 0, h: 0 };
    const onMv = ev => {
      const p = clientToPct(ev.clientX, ev.clientY, rect);
      state.marquee = rectFromPoints(startP, p);
      const hits = marqueeSelect(state.objects, state.marquee);
      state.selectedIds = [...new Set([...base, ...hits])];
      render();
    };
    const onUp = () => {
      window.removeEventListener('pointermove', onMv);
      window.removeEventListener('pointerup', onUp);
      state.marquee = null;
      render();
    };
    window.addEventListener('pointermove', onMv);
    window.addEventListener('pointerup', onUp);
  }
  function startMove(rect, startP) {
    const objs = selectedObjects();
    if (!objs.length) return;
    const before = new Map(objs.map(o => [o.id, o.geom]));
    let moved = false;
    const onMv = ev => {
      const p = clientToPct(ev.clientX, ev.clientY, rect);
      const dx = p.x - startP.x, dy = p.y - startP.y;
      objs.forEach(o => { o.geom = translateGeom({ tool: o.tool, geom: before.get(o.id) }, dx, dy); });
      moved = true;
      render();
    };
    const onUp = () => {
      window.removeEventListener('pointermove', onMv);
      window.removeEventListener('pointerup', onUp);
      if (!moved) return;
      const cmds = objs.map(o => ({ type: 'update', id: o.id, before: { geom: before.get(o.id) }, after: { geom: o.geom } }));
      pushHistory(cmds.length === 1 ? cmds[0] : { type: 'batch', cmds });
    };
    window.addEventListener('pointermove', onMv);
    window.addEventListener('pointerup', onUp);
  }
  function startResize(e, handle, rect) {
    const o = selectedObjects()[0];
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
    state.selectedIds = [];
    const rect = svg.getBoundingClientRect();
    if (state.tool === 'text') { startTextInput(e.clientX, e.clientY, rect); return; }
    const p = clientToPct(e.clientX, e.clientY, rect);
    drag = { tool: state.tool, rect, start: p, points: [[p.x, p.y]] };
    const style = state.tool === 'pencil' ? { ...(opts.style || {}), brushType: state.brushType } : opts.style;
    state.draft = makeDrawObject({ tool: state.tool, geom: initialGeom(state.tool, p), style });
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
    if (d && isDrawn(d)) { captureAnchor(d); runCommand({ type: 'create', obj: d }); }
    else render();
  }

  // ── P4：selector 擷取 + 截圖 + 結構化匯出 + 送給 AI ─────────────────────────────
  const ANCHOR_TOOLS = ['ellipse', 'diamond', 'rect', 'arrow', 'line']; // 指向底層元件的標注才擷取
  // 暫時關閉 overlay/toolbar 指標事件，elementFromPoint 取得底層 app 元件。
  function elementUnderPoint(clientX, clientY) {
    const prev = svg.style.pointerEvents;
    svg.style.pointerEvents = 'none';
    toolbar.style.pointerEvents = 'none';
    const el = document.elementFromPoint(clientX, clientY);
    svg.style.pointerEvents = prev;
    toolbar.style.pointerEvents = '';
    return el;
  }
  function captureAnchor(obj) {
    if (!ANCHOR_TOOLS.includes(obj.tool)) return;
    const rect = svg.getBoundingClientRect();
    const a = labelAnchor(obj); // bbox 中心 / 線中點
    const el = elementUnderPoint(rect.left + pctToPx(a.x, rect.width), rect.top + pctToPx(a.y, rect.height));
    if (!el || el === document.body || el === document.documentElement) return; // 空畫布 → anchor 留 null
    const sel = cssSelectorFor(el);
    if (sel) obj.anchor = sel;
  }

  function exportPayload() {
    return buildExport(state.objects, { w: svg.clientWidth || host.clientWidth, h: svg.clientHeight || host.clientHeight });
  }
  // 把 #pc-draw SVG（含貼圖 + 標注）轉 PNG dataURL（XMLSerializer → img → canvas）。async。
  async function capturePng() {
    try {
      const w = svg.clientWidth || host.clientWidth, h = svg.clientHeight || host.clientHeight;
      const clone = svg.cloneNode(true);
      clone.setAttribute('width', w);
      clone.setAttribute('height', h);
      clone.setAttribute('xmlns', SVG_NS);
      clone.querySelectorAll('.pc-draw-selection, .pc-draw-marquee').forEach(n => n.remove()); // 不要選取框
      const xml = new XMLSerializer().serializeToString(clone);
      const url = URL.createObjectURL(new Blob([xml], { type: 'image/svg+xml;charset=utf-8' }));
      const dataURL = await new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          canvas.width = w; canvas.height = h;
          canvas.getContext('2d').drawImage(img, 0, 0);
          resolve(canvas.toDataURL('image/png'));
        };
        img.onerror = reject;
        img.src = url;
      });
      URL.revokeObjectURL(url);
      return dataURL;
    } catch (_) { return null; }
  }
  // 實際使用時 flow 由 resolve server 同源服務 → 預設打同源 /api/draw（http(s) 才送；file:// 回 null 不送）。
  function sameOriginDrawEndpoint() {
    try {
      const o = typeof location !== 'undefined' && location.origin;
      return o && /^https?:/.test(o) ? o + '/api/draw' : null;
    } catch (_) { return null; }
  }
  // 組 {json, png} → POST 到 endpoint（可無）；無論有無 server 都回 payload 供 caller/測試讀。
  async function sendToAgent(opts2 = {}) {
    const json = exportPayload();
    if (!json.annotations.length) return { json, png: null, sent: false }; // 沒標注 → 不做事
    const png = await capturePng();
    const payload = { json, png, sent: false };
    const endpoint = opts2.endpoint || state.exportEndpoint || sameOriginDrawEndpoint();
    if (endpoint && typeof fetch === 'function') {
      try {
        await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ json, png }) });
        payload.sent = true;
      } catch (_) { payload.sent = false; }
    }
    return payload;
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

  // ── 雙擊：在物件上加/編輯綁定標籤（Excalidraw bound text）────────────────────────
  function onDblClick(e) {
    if (state.mode !== 'draw' || state.tool !== 'select') return;
    const rect = svg.getBoundingClientRect();
    const hit = hitTest(clientToPct(e.clientX, e.clientY, rect));
    if (hit) { e.preventDefault(); state.selectedIds = [hit.id]; startLabelEdit(hit, rect); }
    else startTextInput(e.clientX, e.clientY, rect); // 雙擊空白 → 自由文字（Excalidraw parity）
  }
  // 在物件錨點（shape 中心 / line 中點）開輸入框，commit 寫回 obj.label（可 undo）。
  function startLabelEdit(o, rect) {
    const a = labelAnchor(o);
    const cx = pctToPx(a.x, rect.width), cy = pctToPx(a.y, rect.height);
    const input = drawHtmlEl('input', 'pc-draw-text-input');
    input.type = 'text';
    input.value = o.label || '';                 // 已有標籤 → 預填供編輯
    input.style.left = (cx - 40) + 'px';          // 大致置中於錨點
    input.style.top = (cy - 12) + 'px';
    input.style.textAlign = 'center';
    host.appendChild(input);
    setTimeout(() => { input.focus(); input.select(); }, 0);
    const before = { label: o.label || '' };
    let done = false;
    const commit = () => {
      if (done) return;
      done = true;
      const text = input.value.trim();
      input.remove();
      if (text === (o.label || '')) { render(); return; } // 無變更
      o.label = text;                              // 立即套用（預覽）
      pushHistory({ type: 'update', id: o.id, before, after: { label: text } });
    };
    input.addEventListener('keydown', ev => { if (ev.key === 'Enter') { ev.preventDefault(); commit(); } });
    input.addEventListener('blur', commit);
  }

  // ── 貼圖：paste（剪貼簿）/ drop（檔案）→ image 物件（P3，dataURL 內嵌）─────────────
  // 核心：addImage（純資料路徑，paste/drop 與 e2e 共用），回傳新物件。
  function addImage(dataURL, naturalW, naturalH, atPoint) {
    const cw = svg.clientWidth || host.clientWidth || 1;
    const ch = svg.clientHeight || host.clientHeight || 1;
    const geom = imageGeom(naturalW, naturalH, cw, ch, atPoint);
    const obj = makeDrawObject({ tool: 'image', geom, imageRef: dataURL });
    runCommand({ type: 'create', obj }); // 進 undo/redo + 自動選取
    return obj;
  }
  // blob → dataURL → 量自然尺寸 → addImage。
  function loadBlobAsImage(blob, atPoint) {
    const reader = new FileReader();
    reader.onload = () => {
      const dataURL = reader.result;
      const img = new Image();
      img.onload = () => addImage(dataURL, img.naturalWidth || img.width, img.naturalHeight || img.height, atPoint);
      img.src = dataURL;
    };
    reader.readAsDataURL(blob);
  }
  function isTyping() {
    const ae = document.activeElement;
    return !!ae && (ae.tagName === 'INPUT' || ae.tagName === 'TEXTAREA' || ae.isContentEditable);
  }
  function onPaste(e) {
    if (state.mode !== 'draw' || isTyping()) return; // 打字時不攔貼上
    const items = (e.clipboardData && e.clipboardData.items) || [];
    for (const it of items) {
      if (it.type && it.type.indexOf('image') === 0) {
        const blob = it.getAsFile();
        if (blob) { e.preventDefault(); loadBlobAsImage(blob, null); return; } // 置中
      }
    }
  }
  function onDragOver(e) { if (state.mode === 'draw') e.preventDefault(); } // 允許 drop
  function onDrop(e) {
    if (state.mode !== 'draw') return;
    e.preventDefault(); // 擋瀏覽器開新頁
    const files = (e.dataTransfer && e.dataTransfer.files) || [];
    const at = clientToPct(e.clientX, e.clientY, svg.getBoundingClientRect());
    for (const f of files) {
      if (f.type && f.type.indexOf('image') === 0) { loadBlobAsImage(f, at); return; }
    }
  }

  // ── 鍵盤：Delete/Backspace 刪除、Cmd/Ctrl+Z undo、Shift+Cmd/Ctrl+Z redo ────────
  function onKey(e) {
    if (state.mode !== 'draw') return;
    if (e.key === 'Escape') { closeContextMenu(); return; } // 關右鍵選單
    const tag = (e.target && e.target.tagName) || '';
    if (tag === 'INPUT' || tag === 'TEXTAREA' || (e.target && e.target.isContentEditable)) return;
    const meta = e.metaKey || e.ctrlKey;
    if (meta && (e.key === 'z' || e.key === 'Z')) {
      e.preventDefault();
      if (e.shiftKey) doRedo(); else doUndo();
      return;
    }
    if ((e.key === 'Delete' || e.key === 'Backspace') && state.selectedIds.length) {
      e.preventDefault();
      deleteSelected();
      return;
    }
    // 工具切換快捷鍵（純按鍵；排除 Cmd/Ctrl/Alt 以免撞 undo/redo/瀏覽器）。打字已在上方 guard 擋掉。
    if (!meta && !e.altKey) {
      const action = resolveShortcut(e.key);
      if (action) {
        e.preventDefault();
        if (action === 'eyedropper') openEyedropper();
        else if (action === 'pencil') setBrush('pen'); // 7/P → 自由筆（預設 pen）
        else setTool(action);
      }
    }
  }

  // ── 右鍵 context menu（z-order + 刪除，作用於選取集合）──────────────────────────
  function onContextMenu(e) {
    if (state.mode !== 'draw' || state.tool !== 'select') return;
    e.preventDefault(); // 擋掉瀏覽器原生選單
    const rect = svg.getBoundingClientRect();
    const hit = hitTest(clientToPct(e.clientX, e.clientY, rect));
    if (!hit) { closeContextMenu(); return; }
    if (!isSelected(hit.id)) selectOnly(hit.id); // 右鍵未選物件 → 先選它
    render();
    openContextMenu(e.clientX, e.clientY);
  }
  function openContextMenu(x, y) {
    contextMenu.style.left = x + 'px';
    contextMenu.style.top = y + 'px';
    contextMenu.classList.add('open');
    // 下一輪 tick 再掛外點關閉監聽（避免開啟當下的同一個 pointer 事件立刻關掉）。Esc 由 onKey 處理。
    setTimeout(() => document.addEventListener('pointerdown', onDocPointer, true), 0);
  }
  function closeContextMenu() {
    contextMenu.classList.remove('open');
    document.removeEventListener('pointerdown', onDocPointer, true);
  }
  function onDocPointer(e) { if (!contextMenu.contains(e.target)) closeContextMenu(); }

  svg.addEventListener('pointerdown', onDown);
  svg.addEventListener('dblclick', onDblClick);
  svg.addEventListener('contextmenu', onContextMenu);
  svg.addEventListener('dragover', onDragOver);
  svg.addEventListener('drop', onDrop);
  window.addEventListener('resize', render);
  window.addEventListener('keydown', onKey);
  window.addEventListener('paste', onPaste);

  applyMode();
  render();

  return {
    svg, host,
    getMode: () => state.mode,
    setMode,
    getTool: () => state.tool,
    setTool,
    getObjects: () => { stampZ(); return state.objects.map(serializeDrawObject); },
    getSelected: () => (state.selectedIds.length ? state.selectedIds[0] : null), // 向後相容：回傳首個
    getSelectedIds: () => state.selectedIds.slice(),
    select: id => { state.selectedIds = id ? [id] : []; render(); },
    selectIds: ids => { state.selectedIds = (ids || []).slice(); render(); },
    bringToFront: () => zorder('front'),
    sendToBack: () => zorder('back'),
    forward: () => zorder('forward'),
    backward: () => zorder('backward'),
    deleteSelected,
    undo: doUndo,
    redo: doRedo,
    setColor,
    setStrokeWidth,
    eyedropper: openEyedropper,
    addImage, // (dataURL, naturalW, naturalH, atPoint?) → 新 image 物件（paste/drop 與測試共用）
    buildExport: exportPayload,            // 結構化 JSON（selector + text + geom）
    capturePng,                            // async → PNG dataURL
    sendToAgent,                           // async (opts?) → {json, png, sent}；回 payload
    setExportEndpoint: url => { state.exportEndpoint = url; },
    clear: () => { state.objects = []; state.draft = null; state.selectedIds = []; render(); },
    destroy: () => {
      svg.remove(); toolbar.remove(); contextMenu.remove();
      window.removeEventListener('resize', render);
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('paste', onPaste);
      closeContextMenu();
    },
  };
}

// 把 % box 換成 px box（選取框 / marquee 繪製）。
function toPxBox(b, rect) {
  return { x: pctToPx(b.x, rect.width), y: pctToPx(b.y, rect.height), w: pctToPx(b.w, rect.width), h: pctToPx(b.h, rect.height) };
}

function findById(objects, id) { return objects.find(o => o.id === id); }

// ── 幾何（依工具，% 座標）──────────────────────────────────────────────────
function initialGeom(tool, p) {
  if (tool === 'ellipse' || tool === 'rect' || tool === 'diamond') return { x: p.x, y: p.y, w: 0, h: 0 };
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
  if (o.tool === 'ellipse' || o.tool === 'rect' || o.tool === 'diamond' || o.tool === 'image') return o.geom.w > 0.2 || o.geom.h > 0.2;
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
  if (o.tool === 'image') {
    const g = o.geom;
    const img = drawSvgEl('image', {
      x: pctToPx(g.x, rect.width), y: pctToPx(g.y, rect.height),
      width: pctToPx(g.w, rect.width), height: pctToPx(g.h, rect.height),
      preserveAspectRatio: 'xMidYMid meet',
    });
    img.setAttribute('href', o.imageRef || '');
    img.setAttributeNS('http://www.w3.org/1999/xlink', 'xlink:href', o.imageRef || ''); // 舊瀏覽器相容
    return img;
  }
  if (o.tool === 'diamond') {
    const g = o.geom;
    const box = { x: pctToPx(g.x, rect.width), y: pctToPx(g.y, rect.height), w: pctToPx(g.w, rect.width), h: pctToPx(g.h, rect.height) };
    const pts = diamondPoints(box).map(([x, y]) => `${x},${y}`).join(' ');
    return drawSvgEl('polygon', { points: pts, ...stroke });
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
    const ptsPx = (o.geom.points || []).map(([x, y]) => [pctToPx(x, rect.width), pctToPx(y, rect.height)]);
    const brush = o.style.brushType || 'pen';
    const cfg = brushStyle(brush);
    const base = (s.strokeWidth || 2) * cfg.widthMul;
    if (!cfg.fill) { // highlighter：等寬描邊、半透明、flat cap、multiply
      return drawSvgEl('path', {
        d: freehandPath(ptsPx), stroke: s.color, 'stroke-width': base, fill: 'none',
        'stroke-linecap': 'butt', 'stroke-linejoin': 'round', opacity: cfg.opacity,
        style: 'mix-blend-mode:' + cfg.blend, 'data-brush': brush,
      });
    }
    // pen / marker：頭尾漸細的填充外框（fill=色、無 stroke）
    return drawSvgEl('path', {
      d: taperedOutline(ptsPx, base, { taperFrac: cfg.taperFrac, minScale: cfg.minScale }),
      fill: s.color, stroke: 'none', opacity: cfg.opacity, 'stroke-linejoin': 'round', 'data-brush': brush,
    });
  }
  const t = drawSvgEl('text', { x: pctToPx(o.geom.x, rect.width), y: pctToPx(o.geom.y, rect.height), fill: s.color, 'font-size': 14, 'font-family': 'system-ui, sans-serif' });
  t.textContent = o.text || '';
  return t;
}

const LABEL_FONT_SIZE = 14;
const LABEL_BG_PAD = 5; // 白底每邊外擴 px
// 綁定標籤 → <g>（含 <text>；line/arrow 另加白底 <rect> 把線蓋掉）。無 label 回 null。
// 白底先用估算尺寸（fallback），append 後由 sizeLabelBg() 量實際 text bbox 收緊到完全覆蓋。
function renderLabel(o, rect) {
  if (o.label == null || o.label === '') return null;
  const a = labelAnchor(o);
  const x = pctToPx(a.x, rect.width), y = pctToPx(a.y, rect.height);
  const isLine = o.tool === 'arrow' || o.tool === 'line';
  const g = drawSvgEl('g', { class: 'pc-draw-label', 'data-label-for': o.id, 'pointer-events': 'none' });
  if (isLine) { // 白底蓋住線；rect 在前(底層)、text 在後(上層)
    const w = o.label.length * LABEL_FONT_SIZE + LABEL_BG_PAD * 2; // 估寬偏大（CJK ~1em/字）→ fallback 也蓋住
    const h = LABEL_FONT_SIZE + LABEL_BG_PAD * 2;
    g.appendChild(drawSvgEl('rect', { x: x - w / 2, y: y - h / 2, width: w, height: h, fill: '#ffffff', rx: 3 }));
  }
  const t = drawSvgEl('text', {
    x, y, 'text-anchor': 'middle', 'dominant-baseline': 'middle',
    fill: '#1e1e1e', 'font-size': LABEL_FONT_SIZE, 'font-family': 'system-ui, sans-serif',
  });
  t.textContent = o.label;
  g.appendChild(t);
  return g;
}

// 量實際 text bbox，把白底 rect 收到「text bbox + padding」完全覆蓋（需 text 已在 DOM）。
function sizeLabelBg(g) {
  const bg = g.querySelector('rect');
  const text = g.querySelector('text');
  if (!bg || !text) return; // shape 標籤無 bg → 略過
  let bb;
  try { bb = text.getBBox(); } catch (_) { bb = null; }
  if (!bb || !bb.width) return; // 量不到 → 保留估算 fallback
  bg.setAttribute('x', bb.x - LABEL_BG_PAD);
  bg.setAttribute('y', bb.y - LABEL_BG_PAD);
  bg.setAttribute('width', bb.width + LABEL_BG_PAD * 2);
  bg.setAttribute('height', bb.height + LABEL_BG_PAD * 2);
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
// 工具列上的工具排序（Excalidraw 數字順序）；pencil 槽位用 3 個筆刷取代（無獨立鉛筆鈕）。
const TOOLBAR_TOOL_ORDER = ['select', 'rect', 'diamond', 'ellipse', 'arrow', 'line', 'pencil', 'text'];
function buildToolbar(state, actions) {
  const bar = drawHtmlEl('div', 'pc-draw-toolbar');
  bar.id = 'pc-draw-toolbar';
  // 1 select · 2 rect · 3 diamond · 4 ellipse · 5 arrow · 6 line · 7 [pen marker highlighter] · 8 text
  TOOLBAR_TOOL_ORDER.forEach(tool => {
    if (tool === 'pencil') DRAW_BRUSHES.forEach(t => bar.appendChild(brushButton(t, actions))); // 7：筆刷群＝自由筆
    else bar.appendChild(toolButton(tool, actions));
  });
  appendSep(bar);
  bar.appendChild(colorMenu(actions));
  bar.appendChild(widthMenu(actions));
  appendSep(bar);
  bar.appendChild(actButton('delete', actions)); // 刪除（z-order 已移到右鍵選單）
  appendSep(bar);
  ['undo', 'redo'].forEach(a => bar.appendChild(actButton(a, actions)));
  appendSep(bar);
  const send = drawHtmlEl('button', 'pc-draw-tool pc-draw-send');
  send.dataset.action = 'send';
  send.title = '送給 AI';
  send.setAttribute('aria-label', '送給 AI');
  send.innerHTML = icon('send');
  send.onclick = () => actions.send();
  bar.appendChild(send);
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
// 工具的數字快捷鍵（取自 TOOL_SHORTCUTS 單一真相，Excalidraw 風格徽章用）。
function toolNumberKey(tool) {
  return Object.keys(TOOL_SHORTCUTS).find(k => /^[0-9]$/.test(k) && TOOL_SHORTCUTS[k] === tool) || '';
}
function toolButton(tool, actions) {
  const b = drawHtmlEl('button', 'pc-draw-tool');
  b.dataset.tool = tool;
  const key = TOOL_KEY[tool];
  const label = (TOOL_LABELS_ZH[tool] || tool) + (key ? ` (${key})` : '');
  b.title = label;                       // tooltip 含字母快捷鍵，供探索
  b.setAttribute('aria-label', label);
  const num = toolNumberKey(tool);
  b.innerHTML = icon(tool) + (num ? `<span class="pc-draw-kbd" aria-hidden="true">${num}</span>` : ''); // 常駐數字徽章
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
function brushButton(type, actions) {
  const b = drawHtmlEl('button', 'pc-draw-tool pc-draw-brush');
  b.dataset.brush = type;
  b.title = BRUSH_LABELS[type] + (type === 'pen' ? ' (P)' : ''); // pen 是自由筆主鍵
  b.setAttribute('aria-label', BRUSH_LABELS[type]);
  const num = type === 'pen' ? toolNumberKey('pencil') : ''; // 數字徽章「7」只放在 pen（自由筆代表）
  b.innerHTML = icon(BRUSH_ICON[type]) + (num ? `<span class="pc-draw-kbd" aria-hidden="true">${num}</span>` : '');
  b.onclick = () => actions.setBrush(type);
  return b;
}

// 右鍵 context menu：z-order + 刪除，作用於目前選取集合。
function buildContextMenu(actions) {
  const menu = drawHtmlEl('div', 'pc-draw-context');
  menu.id = 'pc-draw-context';
  [['front', '置頂'], ['forward', '上移一層'], ['backward', '下移一層'], ['back', '置底'], ['delete', '刪除']]
    .forEach(([action, label]) => {
      const item = drawHtmlEl('button', 'pc-draw-context-item');
      item.dataset.action = action;
      item.setAttribute('aria-label', label);
      item.innerHTML = icon(action, 18) + `<span>${label}</span>`;
      item.onclick = () => { actions.act(action); actions.closeContext(); };
      menu.appendChild(item);
    });
  return menu;
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
  pop.appendChild(customSwatch(actions)); // 第 9 顆：自訂調色盤
  pop.appendChild(eyedropperButton(actions)); // 吸管取樣
  wrap.appendChild(trigger);
  wrap.appendChild(pop);
  return wrap;
}
// 吸管：取樣畫面上任意顏色（瀏覽器 EyeDropper API）。不支援時隱藏，不報錯。
function eyedropperButton(actions) {
  const b = drawHtmlEl('button', 'pc-draw-tool pc-draw-eyedropper');
  b.dataset.action = 'eyedropper';
  b.title = '取樣顏色 (I)'; // tooltip 含快捷鍵；aria-label 維持純名稱（測試/讀屏穩定）
  b.setAttribute('aria-label', '取樣顏色');
  b.innerHTML = icon('colorize');
  b.onclick = () => actions.eyedropper();
  if (!eyedropperSupported()) { b.disabled = true; b.style.display = 'none'; }
  return b;
}
// 自訂顏色 swatch：彩虹圓 + 「+」，看起來像第 9 顆 swatch；點擊開原生 color picker。
function customSwatch(actions) {
  const label = drawHtmlEl('label', 'pc-draw-swatch pc-draw-custom-swatch');
  label.title = '自訂顏色';
  label.setAttribute('aria-label', '自訂顏色');
  const custom = drawHtmlEl('input', 'pc-draw-color-custom');
  custom.type = 'color';
  custom.setAttribute('aria-label', '自訂顏色');
  custom.dataset.action = 'custom-color';
  custom.addEventListener('input', () => actions.setColor(custom.value));
  label.appendChild(custom);
  return label;
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
  bar.querySelectorAll('.pc-draw-swatch[data-color]').forEach(b => { // 排除無 data-color 的自訂 swatch
    b.classList.toggle('active', b.dataset.color.toLowerCase() === color);
  });
  bar.querySelectorAll('.pc-draw-width').forEach(b => {
    b.classList.toggle('active', Number(b.dataset.width) === DEFAULT_DRAW_STYLE.strokeWidth);
  });
  bar.querySelectorAll('.pc-draw-brush').forEach(b => {
    b.classList.toggle('active', state.tool === 'pencil' && b.dataset.brush === state.brushType);
  });
  const hasSel = state.selectedIds.length > 0;
  bar.querySelectorAll('.pc-draw-act').forEach(b => {
    const a = b.dataset.action;
    const enabled = a === 'undo' ? (history && history.canUndo()) : a === 'redo' ? (history && history.canRedo()) : hasSel;
    b.disabled = !enabled;
    b.classList.toggle('pc-draw-disabled', !enabled);
  });
}
