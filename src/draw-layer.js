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
 *
 * P7 團隊持久（選用）：傳 opts.persist（{fb,db,projectId} 或 ready store）→ 把向量物件
 * 同步到 Firestore `drawings` 子集合；不傳則 0 Firebase（dev 模式行為完全不變）。
 */
import { createDrawingStore } from './store.js';

// ── 常數 ────────────────────────────────────────────────────────────────────
export const DRAW_MODES = ['comment', 'draw', 'off'];
export const DRAW_TOOLS = ['select', 'rect', 'diamond', 'ellipse', 'arrow', 'line', 'pencil', 'text'];
export const DEFAULT_DRAW_STYLE = { color: '#E5484D', strokeWidth: 2, fill: 'none', fontSize: 16 };
// Excalidraw/Figma 風格預設色（8 色）＋ picker 另附 <input type=color> 自訂任意 hex。
export const DRAW_COLORS = ['#1e1e1e', '#e03131', '#2f9e44', '#1971c2', '#f08c00', '#9c36b5', '#0c8599', '#868e96'];
export const DRAW_STROKE_WIDTHS = [1, 2, 4, 6]; // thin → bold
export const DRAW_FONT_SIZES = [12, 16, 20, 28]; // 文字工具字體大小選項（px）
export const DRAW_HEAD_MODES = ['none', 'end', 'start', 'both']; // 端點箭頭：無/終點/起點/雙向
// line/arrow 的端點箭頭：依 style.heads；未設時 arrow→終點、line→無（向後相容）。
export function arrowHeads(o) {
  if (!o || (o.tool !== 'arrow' && o.tool !== 'line')) return { start: false, end: false };
  const mode = (o.style && o.style.heads) || (o.tool === 'arrow' ? 'end' : 'none');
  return { start: mode === 'start' || mode === 'both', end: mode === 'end' || mode === 'both' };
}
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
// 用實體按鍵位置（e.code）解析快捷鍵：注音/非英文輸入法會把 e.key 變成組字字元，
// 但 e.code 仍是 "KeyR"/"Digit2"，據此映回原本的 TOOL_SHORTCUTS。
export function resolveShortcutByCode(code) {
  if (typeof code !== 'string') return null;
  if (/^Digit[1-9]$/.test(code)) return resolveShortcut(code.slice(5));
  if (/^Key[A-Z]$/.test(code)) return resolveShortcut(code.slice(3).toLowerCase());
  return null;
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

// ── P6 側邊標注紀錄面板：row 資料（純函式，可單測）─────────────────────────────────
// 每個工具的友善預設標籤（物件無 label/text 時，面板顯示這個 → 比 'ellipse' 易讀）。
const ANNOTATION_TOOL_LABELS = {
  ellipse: '圈選', arrow: '箭頭', line: '直線', rect: '矩形', diamond: '菱形',
  pencil: '手繪', text: '文字', image: '參考圖',
};
// DrawObject[] → 側邊「標注紀錄」面板的 row 資料。純函式：
//   text：label（綁定標籤）優先 → text（文字工具）→ 工具友善預設（圈選/箭頭…）。
//   selector：取 anchor（elementFromPoint 擷取的元件），無則 null。
//   color：取 style.color。icon：對映合法的工具圖示名（無對應者退回 'rect'）。
// 標注內容簽章：捕捉「送出時會帶的使用者可見內容」。改幾何/文字/顏色/錨點 → 簽章變 → 視為未送。
export function annotationSig(o) {
  return JSON.stringify({ tool: o.tool, geom: o.geom, text: o.text, label: o.label, anchor: o.anchor, style: o.style });
}
// 決定（在 AI 方案卡上選的選項）進佇列的簽章：改選不同選項 → 簽章變 → 回未送。
export function decisionSig(d) {
  return JSON.stringify({ replyId: d.replyId, optionId: d.optionId, optionLabel: d.optionLabel });
}
// sentSigs＝{objId: 上次成功送出時的簽章}；row.sent＝目前簽章與已送簽章相符（送出後沒再改）。
export function annotationRows(objects, sentSigs) {
  return (objects || []).map(o => {
    const text = (o.label != null && o.label !== '') ? o.label
      : (o.text != null && o.text !== '') ? o.text
      : (ANNOTATION_TOOL_LABELS[o.tool] || o.tool);
    return {
      id: o.id,
      tool: o.tool,
      icon: ICON_PATHS[o.tool] ? o.tool : 'rect', // 面板圖示用（image 無專屬圖示 → 退回方框）
      text,
      selector: o.anchor != null ? o.anchor : null,
      color: (o.style && o.style.color) || null,
      sent: !!(sentSigs && sentSigs[o.id] === annotationSig(o)),
    };
  });
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
// resolve(o)（選用）：回傳 arrow/line 解析後端點 {from,to}（el/obj anchor）。不傳則用 geom。
export function geomBBox(o, resolve) {
  const g = o.geom;
  if (o.tool === 'ellipse' || o.tool === 'rect' || o.tool === 'diamond' || o.tool === 'image') return { x: g.x, y: g.y, w: g.w, h: g.h };
  if (o.tool === 'arrow' || o.tool === 'line') { const e = resolve ? resolve(o) : g; return rectFromPoints(e.from, e.to); }
  if (o.tool === 'pencil') {
    const xs = g.points.map(p => p[0]), ys = g.points.map(p => p[1]);
    const x = Math.min(...xs), y = Math.min(...ys);
    return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
  }
  const w = Math.max(4, (o.text ? o.text.length : 1) * 1.2); // text：估一個可命中的框
  return { x: g.x, y: g.y - 2.5, w, h: 3.5 };
}

// 綁定標籤的錨點（% 座標）：line/arrow 取兩端中點；其餘取 bbox 中心。隨 geom 重算 → 跟著物件移動/縮放。
export function labelAnchor(o, resolve) {
  if (o.tool === 'arrow' || o.tool === 'line') {
    const e = resolve ? resolve(o) : o.geom;
    return { x: (e.from.x + e.to.x) / 2, y: (e.from.y + e.to.y) / 2 };
  }
  const b = geomBBox(o, resolve);
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

// 設定箭頭/線段的端點（immutable）。which ∈ 'from'|'to'。回傳新 geom，不改入參。
export function setEndpoint(geom, which, p) {
  return { ...geom, [which]: { x: p.x, y: p.y } };
}

// ── Batch 4 純函式：端點吸附 + element/object anchor 解析 ──────────────────────
// 吸附閾值（host rect %）。約等於 800px 寬畫布上 ~20px。改這裡即可調整吸附靈敏度。
export const SNAP_THRESHOLD_PCT = 2.5;

// rect {x,y,w,h}（% 空間）→ 8 個吸附點：4 邊中點 + 4 角，各標 ref。
export function rectAnchorPoints(rect) {
  const { x, y, w, h } = rect;
  return [
    { x: x + w / 2, y, ref: 'top' },
    { x: x + w, y: y + h / 2, ref: 'right' },
    { x: x + w / 2, y: y + h, ref: 'bottom' },
    { x, y: y + h / 2, ref: 'left' },
    { x, y, ref: 'tl' },
    { x: x + w, y, ref: 'tr' },
    { x: x + w, y: y + h, ref: 'br' },
    { x, y: y + h, ref: 'bl' },
  ];
}

// p {x,y} → rect 邊界上最近點。外部點 → clamp 到邊界；內部點 → 投影到最近的一條邊。
export function nearestPointOnRect(p, rect) {
  const { x, y, w, h } = rect;
  const inside = p.x > x && p.x < x + w && p.y > y && p.y < y + h;
  if (!inside) {
    return { x: Math.max(x, Math.min(p.x, x + w)), y: Math.max(y, Math.min(p.y, y + h)) };
  }
  const dl = p.x - x, dr = x + w - p.x, dt = p.y - y, db = y + h - p.y;
  const m = Math.min(dl, dr, dt, db);
  if (m === dl) return { x, y: p.y };
  if (m === dr) return { x: x + w, y: p.y };
  if (m === dt) return { x: p.x, y };
  return { x: p.x, y: y + h };
}

// 其他畫圖物件（arrow/line）的端點 → 吸附候選，標上可建 obj anchor 的 objId/which。
const SNAP_SHAPE_TOOLS = ['rect', 'ellipse', 'diamond', 'image'];
export function objectSnapPoints(objects, exceptId) {
  const pts = [];
  (objects || []).forEach(o => {
    if (o.id === exceptId) return;
    if (o.tool === 'arrow' || o.tool === 'line') { // line/arrow → 兩端點（鎖 which）
      pts.push({ x: o.geom.from.x, y: o.geom.from.y, objId: o.id, which: 'from' });
      pts.push({ x: o.geom.to.x, y: o.geom.to.y, objId: o.id, which: 'to' });
    } else if (SNAP_SHAPE_TOOLS.includes(o.tool)) { // 形狀 → bbox 8 錨點（鎖 relX/relY，隨形狀移動）
      const bbox = geomBBox(o);
      rectAnchorPoints(bbox).forEach(pt => {
        const rel = anchorRel(pt, bbox);
        pts.push({ x: pt.x, y: pt.y, objId: o.id, relX: rel.relX, relY: rel.relY });
      });
    }
  });
  return pts;
}

// p → candidates 中閾值內最近者 {point, cand}；皆超過閾值 → null。
export function nearestSnap(p, candidates, threshold = SNAP_THRESHOLD_PCT) {
  let best = null, bestD = threshold;
  (candidates || []).forEach(c => {
    const d = Math.hypot(c.x - p.x, c.y - p.y);
    if (d <= bestD) { bestD = d; best = c; }
  });
  return best ? { point: { x: best.x, y: best.y }, cand: best } : null;
}

// p(%) 在 elRect(%) 內的相對位置 0..1（除以零時回 0）。
export function anchorRel(p, elRect) {
  return {
    relX: elRect.w ? (p.x - elRect.x) / elRect.w : 0,
    relY: elRect.h ? (p.y - elRect.y) / elRect.h : 0,
  };
}

// el anchor + elRect(%) → 絕對 % 點（anchorRel 的逆運算）。
export function resolveAnchorPoint(anchor, elRect) {
  return {
    x: elRect.x + (anchor.relX || 0) * elRect.w,
    y: elRect.y + (anchor.relY || 0) * elRect.h,
  };
}

// 解析單一端點：有 el anchor → getRectPct(selector) 換算；有 obj anchor → 查目標物件端點；
// 無 anchor 或解析失敗 → 回 geom fallback。seen 防 obj anchor 互鎖造成無限遞迴。
function resolveOneEnd(o, which, getRectPct, objects, seen) {
  const anchor = o.endAnchors && o.endAnchors[which];
  const fallback = o.geom[which];
  if (!anchor) return fallback;
  if (anchor.kind === 'el') {
    const elRect = getRectPct && getRectPct(anchor.selector);
    return elRect ? resolveAnchorPoint(anchor, elRect) : fallback;
  }
  if (anchor.kind === 'obj') {
    if (!objects || seen.has(anchor.objId)) return fallback;
    const target = objects.find(t => t.id === anchor.objId);
    if (!target) return fallback;
    seen.add(o.id);
    if (anchor.relX != null) return resolveAnchorPoint(anchor, geomBBox(target)); // 鎖到形狀 bbox 相對位置
    const ends = resolveEndpoints(target, getRectPct, objects, seen);             // 鎖到 line/arrow 端點
    return ends[anchor.which] || fallback;
  }
  return fallback;
}

// 解析 arrow/line 物件的兩端 → {from,to}。供 render/geomBBox/labelAnchor 注入。
export function resolveEndpoints(o, getRectPct, objects, seen = new Set()) {
  return {
    from: resolveOneEnd(o, 'from', getRectPct, objects, seen),
    to: resolveOneEnd(o, 'to', getRectPct, objects, seen),
  };
}

// 把某一端的 anchor 併入 endAnchors（immutable）。anchor 為 falsy → 清掉該端；
// 兩端皆空 → 回 undefined（物件不再帶 endAnchors）。
export function mergeEndAnchor(prev, which, anchor) {
  const next = { ...(prev || {}) };
  if (anchor) next[which] = anchor; else delete next[which];
  return Object.keys(next).length ? next : undefined;
}

// ── Batch 3 純函式：持久群組（groupId）───────────────────────────────────────
// 指定 ids 設上新的 groupId（immutable）。不在 ids 中的物件保持不變。
export function assignGroupId(objects, ids, gid) {
  const idSet = new Set(ids);
  return objects.map(o => idSet.has(o.id) ? { ...o, groupId: gid } : o);
}

// 指定 ids 清除 groupId（immutable）。不在 ids 中的物件保持不變。
export function clearGroupId(objects, ids) {
  const idSet = new Set(ids);
  return objects.map(o => {
    if (!idSet.has(o.id)) return o;
    const next = { ...o };
    delete next.groupId;
    return next;
  });
}

// 將選取展開：若選取的物件屬於某群組，展開為所有群組成員 id（去重、依 objects 順序）。
export function expandSelectionToGroups(objects, selectedIds) {
  const groupIds = new Set();
  selectedIds.forEach(id => {
    const o = objects.find(x => x.id === id);
    if (o && o.groupId) groupIds.add(o.groupId);
  });
  if (!groupIds.size) return selectedIds.slice();
  const expanded = new Set(selectedIds);
  objects.forEach(o => { if (o.groupId && groupIds.has(o.groupId)) expanded.add(o.id); });
  return objects.filter(o => expanded.has(o.id)).map(o => o.id);
}

// 回傳屬於同一 groupId 的所有物件 id。
export function groupMembers(objects, gid) {
  return objects.filter(o => o.groupId === gid).map(o => o.id);
}

// 兩個 box（{x,y,w,h}）是否相交（marquee 命中測試用）。
export function rectsIntersect(a, b) {
  return !(a.x > b.x + b.w || a.x + a.w < b.x || a.y > b.y + b.h || a.y + a.h < b.y);
}

// marquee（橡皮筋框）→ 命中的物件 id（bbox 與框相交者）。純函式。
export function marqueeSelect(objects, mrect) {
  return objects.filter(o => rectsIntersect(geomBBox(o), mrect)).map(o => o.id);
}

// 點到線段最短距離（% 空間）。
export function distPointToSegment(p, a, b) {
  const dx = b.x - a.x, dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return Math.hypot(p.x - a.x, p.y - a.y);
  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}
// 點到折線最短距離（pencil 的 points，[x,y][]）；空回 Infinity。
export function polylineDist(p, points) {
  if (!points || !points.length) return Infinity;
  if (points.length === 1) return Math.hypot(p.x - points[0][0], p.y - points[0][1]);
  let m = Infinity;
  for (let i = 1; i < points.length; i++) {
    const a = { x: points[i - 1][0], y: points[i - 1][1] }, b = { x: points[i][0], y: points[i][1] };
    m = Math.min(m, distPointToSegment(p, a, b));
  }
  return m;
}
export function pointNearPolyline(p, points, tol) { return polylineDist(p, points) <= tol; }
// 點到多邊形邊最短距離（pts＝[{x,y}] 依序，閉合）。
function polygonDist(p, pts) {
  let m = Infinity;
  for (let i = 0; i < pts.length; i++) m = Math.min(m, distPointToSegment(p, pts[i], pts[(i + 1) % pts.length]));
  return m;
}
function pointNearPolygon(p, pts, tol) { return polygonDist(p, pts) <= tol; }
// 點到橢圓外框的近似距離（radial 偏離 1 換回 % 距離）。
function ellipseOutlineDist(p, b) {
  const cx = b.x + b.w / 2, cy = b.y + b.h / 2, rx = b.w / 2, ry = b.h / 2;
  if (rx <= 0 || ry <= 0) return Math.hypot(p.x - cx, p.y - cy);
  const k = Math.hypot((p.x - cx) / rx, (p.y - cy) / ry); // =1 在外框上
  return Math.abs(k - 1) * Math.min(rx, ry);
}
function pointNearEllipseOutline(p, b, tol) { return ellipseOutlineDist(p, b) <= tol; }
// 外框形狀（fill:none 的 rect/diamond）的外框頂點。
function shapeOutlinePts(o, b) {
  return o.tool === 'diamond'
    ? [{ x: b.x + b.w / 2, y: b.y }, { x: b.x + b.w, y: b.y + b.h / 2 }, { x: b.x + b.w / 2, y: b.y + b.h }, { x: b.x, y: b.y + b.h / 2 }]
    : [{ x: b.x, y: b.y }, { x: b.x + b.w, y: b.y }, { x: b.x + b.w, y: b.y + b.h }, { x: b.x, y: b.y + b.h }];
}
function isOutlinedShape(o) {
  return (o.tool === 'rect' || o.tool === 'ellipse' || o.tool === 'diamond')
    && !(o.style && o.style.fill && o.style.fill !== 'none');
}
// 點到物件的「命中距離」(% 空間)；> tol 視為未命中回 Infinity。
// 細線(arrow/line/pencil)＝實際幾何距離；外框形狀＝外框線距離（大空白內部不蓋底下物件）；
// 填充形狀 / image / text＝bbox 內部回 0（實心命中）。ends＝解析後端點（選用）。
// hitTest 用此「距離」取最近者，解決細線穿過外框形狀邊緣時誤選形狀的問題。
export function objHitDist(o, p, tol, ends) {
  if (o.tool === 'arrow' || o.tool === 'line') {
    const e = ends || o.geom;
    const d = distPointToSegment(p, e.from, e.to);
    return d <= tol ? d : Infinity;
  }
  if (o.tool === 'pencil') {
    const d = polylineDist(p, o.geom.points);
    return d <= tol ? d : Infinity;
  }
  const b = geomBBox(o);
  if (isOutlinedShape(o)) {
    const d = o.tool === 'ellipse' ? ellipseOutlineDist(p, b) : polygonDist(p, shapeOutlinePts(o, b));
    return d <= tol ? d : Infinity;
  }
  const inside = p.x >= b.x - tol && p.x <= b.x + b.w + tol && p.y >= b.y - tol && p.y <= b.y + b.h + tol;
  return inside ? 0 : Infinity;
}
// 點是否命中物件（boolean 包裝，向後相容）。
export function pointHitsObject(o, p, tol, ends) { return objHitDist(o, p, tol, ends) !== Infinity; }

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
  // 有選取就套到選取物件（不限 select 工具）：剛建立的物件會 auto-select，
  // 此時按顏色/筆寬/字級應「即時換」到該物件，同時更新預設供下一個物件用。
  const sel = new Set(selectedIds || []);
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
    fontSize: style.fontSize || DEFAULT_DRAW_STYLE.fontSize, // 文字工具字體大小（px）
  };
  if (style.brushType) out.brushType = style.brushType; // 自由筆刷類型（pen/marker/highlighter）
  if (style.heads) out.heads = style.heads; // line/arrow 端點箭頭模式（none/end/start/both）
  return out;
}

let _idSeq = 0;
function nextDrawId() { return 'd' + (++_idSeq); }
function nextGroupId() { return 'g' + (++_idSeq); }

// 組裝一個 DrawObject（plan §4.2 子集：id/tool/geom/style[/text]）。
// z 由繪圖層在 commit 時依 DOM 順序戳上（stampZ），純函式不負責。
export function makeDrawObject({ id, tool, geom, style, text, imageRef, endAnchors } = {}) {
  const obj = { id: id || nextDrawId(), tool, geom, style: normalizeStyle(style) };
  if (text != null) obj.text = text;
  if (imageRef != null) obj.imageRef = imageRef; // image 物件的 dataURL（P3）/ 本機路徑（P4）
  if (endAnchors != null) obj.endAnchors = endAnchors; // arrow/line 端點 element/object 硬鎖
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
  if (obj.groupId != null) out.groupId = obj.groupId;
  if (obj.endAnchors != null) out.endAnchors = obj.endAnchors; // 端點硬鎖（有才帶）
  return out;
}

// ── 本機持久化純函式（dev 模式；可單測）──────────────────────────────────────
// 序列化 objects → plain doc 陣列（跳過 image：dataURL 輕易超出 localStorage 配額，
// 與 §4.6 vectors-only 哲學一致；code comment: images 不走本機持久化）。
export function serializeObjectsForLocal(objects) {
  return objects.filter(o => o.tool !== 'image').map(serializeDrawObject);
}
// plain doc 陣列 → DrawObject[]（類似 rehydrateDrawing，供 initDrawLayer 初始載入）。
export function hydrateObjectsFromLocal(docs) {
  if (!Array.isArray(docs)) return [];
  return docs.map(doc => {
    const obj = makeDrawObject({ id: doc.id, tool: doc.tool, geom: doc.geom, style: doc.style, text: doc.text });
    if (doc.label != null) obj.label = doc.label;
    if (doc.anchor != null) obj.anchor = doc.anchor;
    if (doc.endAnchors != null) obj.endAnchors = doc.endAnchors;
    if (doc.groupId != null) obj.groupId = doc.groupId;
    return obj;
  });
}

// 團隊模式 Firestore 文件序列化（純函式，可單測）。
// 與 serializeDrawObject 的關鍵差異：**故意不輸出 imageRef / PNG dataURL**
//（plan §4.6：PNG 永不進 Firestore；image 物件於 sync 層整顆跳過，這裡即使被呼叫也保證無 dataURL）。
// 只保留向量欄位：id / tool / geom / style（＋有意義時的 text / label / anchor / z）。
export function drawingToDoc(obj) {
  const doc = { id: obj.id, tool: obj.tool, geom: obj.geom, style: obj.style };
  if (obj.text != null) doc.text = obj.text;                       // 文字工具內容
  if (obj.label != null && obj.label !== '') doc.label = obj.label; // 綁定標籤
  if (obj.anchor != null) doc.anchor = obj.anchor;                 // elementFromPoint selector
  if (obj.z != null) doc.z = obj.z;                                // z-order
  if (obj.groupId != null) doc.groupId = obj.groupId;              // 群組 id
  if (obj.endAnchors != null) doc.endAnchors = obj.endAnchors;     // 端點硬鎖（有才帶）
  return doc; // 注意：不含 imageRef / dataURL（PNG 永不進 Firestore）
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
/* 只有「目前工具」該highlight。滑鼠點過/快捷鍵切換後殘留的瀏覽器 focus 外框會讓上一個工具看起來也被選 →
   滑鼠 focus 不顯外框（鍵盤 Tab 導覽的 :focus-visible 仍保留，維持無障礙）。 */
.pc-draw-tool:focus:not(:focus-visible) { outline: none; }
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
  position: absolute; z-index: 230; width: auto !important; min-width: 80px; max-width: 60vw;
  box-sizing: content-box; font: 14px system-ui, sans-serif;
  color: #E5484D; background: rgba(255,255,255,.92); border: 1px solid #E5484D;
  border-radius: 4px; padding: 2px 4px; outline: none;
}
/* ── P6 側邊「標注紀錄」面板（右緣 tab + 抽屜，沿用 spec-overlay 互動）──────────────
   position:fixed + 高 z-index；pointer-events 只在面板本身（tab/drawer），不擋畫布。
   預設 drawer 關閉（off by default）→ comment-only/一般使用不被打擾，靠 tab 才打開。 */
.pc-draw-rec-tab {
  position: fixed; top: 62%; right: 0; transform: translateY(-50%); z-index: 2147483603;
  display: none; border: none; cursor: pointer; background: #0FA0A0; color: #fff;
  padding: 14px 7px; border-radius: 10px 0 0 10px; box-shadow: -2px 0 12px rgba(0,0,0,.2);
  writing-mode: vertical-rl; font: 700 12px/1 system-ui, -apple-system, sans-serif; letter-spacing: 2px;
  transition: background .15s;
}
.pc-draw-rec-tab:hover { background: #0d8f8f; }
.pc-draw-rec-tab.show { display: block; }
.pc-draw-rec-drawer {
  position: fixed; top: 0; right: 0; bottom: 0; z-index: 2147483602;
  width: 300px; max-width: 90vw; background: #fff; border-left: 1px solid #e2e8f0;
  display: flex; flex-direction: column; box-shadow: -2px 0 16px rgba(0,0,0,.12);
  transform: translateX(100%); transition: transform .22s ease;
  font-family: system-ui, -apple-system, sans-serif;
}
.pc-draw-rec-drawer.open { transform: translateX(0); }
.pc-draw-rec-hd { display: flex; align-items: center; gap: 8px; padding: 12px 14px; border-bottom: 1px solid #eef2f6; }
.pc-draw-rec-hd-title { color: #0FA0A0; font-weight: 700; font-size: 13px; }
.pc-draw-rec-count { background: rgba(15,160,160,.12); color: #0d8f8f; border-radius: 9px;
  font-size: 10px; padding: 1px 7px; line-height: 16px; }
.pc-draw-rec-close { margin-left: auto; border: none; background: none; cursor: pointer;
  color: #94a3b8; font-size: 18px; line-height: 1; padding: 2px 4px; }
.pc-draw-rec-close:hover { color: #475569; }
.pc-draw-rec-list { padding: 10px; overflow-y: auto; flex: 1; background: #f8fafc; }
.pc-draw-rec-row {
  display: flex; align-items: center; gap: 9px; width: 100%; text-align: left;
  background: #fff; border: 1px solid #eef2f6; border-radius: 7px; padding: 8px 10px;
  margin-bottom: 8px; cursor: pointer; box-shadow: 0 1px 2px rgba(0,0,0,.04);
}
.pc-draw-rec-row:last-child { margin-bottom: 0; }
.pc-draw-rec-row:hover { border-color: #0FA0A0; }
.pc-draw-rec-row.selected { border-color: #0FA0A0; background: rgba(15,160,160,.08); box-shadow: 0 0 0 1px #0FA0A0; }
.pc-draw-rec-icon { flex: none; width: 22px; height: 22px; display: flex; align-items: center; justify-content: center; color: #475569; }
.pc-draw-rec-icon svg { display: block; }
.pc-draw-rec-swatch { flex: none; width: 12px; height: 12px; border-radius: 50%; border: 1px solid rgba(0,0,0,.15); }
.pc-draw-rec-body { min-width: 0; flex: 1; }
.pc-draw-rec-status { flex: none; font-size: 10px; font-weight: 700; padding: 2px 6px; border-radius: 999px; white-space: nowrap; }
.pc-draw-rec-status.is-sent { color: #0d7a4f; background: rgba(22,163,74,.12); }
.pc-draw-rec-status.is-unsent { color: #9a6a00; background: rgba(183,121,31,.14); }
.pc-draw-rec-check { flex: none; width: 16px; height: 16px; margin: 0; cursor: pointer; accent-color: #0FA0A0; }
.pc-draw-rec-all-wrap { display: inline-flex; align-items: center; gap: 4px; font-size: 11px; color: #475569; cursor: pointer; user-select: none; }
.pc-draw-rec-all { width: 14px; height: 14px; margin: 0; cursor: pointer; accent-color: #0FA0A0; }
/* AI 方案卡層：錨定在標注旁。容器不吃指標，卡片本身吃。 */
.pc-draw-reply-layer { position: absolute; inset: 0; pointer-events: none; z-index: 2147483640; }
.pc-draw-reply-card { position: absolute; pointer-events: auto; max-width: 300px; transform: translate(12px, 12px);
  background: #fff; border: 1.5px solid #0FA0A0; border-radius: 10px; padding: 10px 12px;
  box-shadow: 0 6px 24px rgba(15,160,160,.22); font: 13px/1.5 system-ui, -apple-system, sans-serif; color: #1e293b; }
.pc-draw-reply-head { font-size: 11px; font-weight: 700; color: #0d8f8f; margin-bottom: 4px; display: flex; align-items: center; justify-content: space-between; }
.pc-draw-reply-close { border: none; background: transparent; color: #94a3b8; font-size: 13px; line-height: 1; cursor: pointer; padding: 0 2px; }
.pc-draw-reply-close:hover { color: #475569; }
.pc-draw-rec-remove { flex: none; border: none; background: transparent; color: #b0bcc8; font-size: 12px; line-height: 1; cursor: pointer; padding: 2px 4px; }
.pc-draw-rec-remove:hover { color: #d64545; }
.pc-draw-reply-text { margin-bottom: 8px; white-space: pre-wrap; }
.pc-draw-reply-opts { display: flex; flex-wrap: wrap; gap: 6px; }
.pc-draw-reply-opts.is-rich { flex-direction: column; flex-wrap: nowrap; gap: 8px; }
.pc-draw-reply-opt { padding: 6px 10px; border: 1px solid #0FA0A0; border-radius: 7px; background: rgba(15,160,160,.08);
  color: #0d7a7a; font-size: 12px; font-weight: 600; cursor: pointer; }
.pc-draw-reply-opt:hover { background: #0FA0A0; color: #fff; }
.pc-draw-reply-opts.is-rich .pc-draw-reply-opt { background: #f8fafc; color: #1e293b; }
.pc-draw-reply-opts.is-rich .pc-draw-reply-opt:hover { background: #eef7f7; border-color: #0d8f8f; color: #1e293b; }
.pc-draw-reply-opt-label { font-weight: 700; color: #0d7a7a; font-size: 13px; }
.pc-draw-reply-opt-desc { font-weight: 400; color: #475569; font-size: 12px; margin-top: 2px; }
.pc-draw-reply-preview { margin: 6px 0 0; padding: 6px 8px; background: #fff; border: 1px solid #e2e8f0; border-radius: 6px;
  font: 11px/1.45 ui-monospace, SFMono-Regular, Menlo, monospace; color: #334155; white-space: pre; overflow-x: auto; }
/* 真實 UI 預覽：用頁面全域樣式渲染。pointer-events:none → 戳不會誤觸；margin 歸零避免卡片內過寬留白。 */
.pc-draw-reply-mock { margin: 6px 0; padding: 8px; background: #fff; border: 1px dashed #cbd5e1; border-radius: 6px; pointer-events: none; }
.pc-draw-reply-mock .field, .pc-draw-reply-mock fieldset { margin: 0 !important; }
.pc-draw-reply-choose { margin-top: 8px; width: 100%; padding: 6px 10px; border: none; border-radius: 7px;
  background: #0FA0A0; color: #fff; font-size: 12px; font-weight: 700; cursor: pointer; }
.pc-draw-reply-choose:hover { background: #0d8f8f; }
.pc-draw-reply-chosen { color: #0d7a4f; font-weight: 700; font-size: 12px; }
.pc-draw-rec-text { color: #1e293b; font-size: 12px; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.pc-draw-rec-sel { margin-top: 2px; color: #0d8f8f; font: 10px/1.4 ui-monospace, SFMono-Regular, Menlo, monospace;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.pc-draw-rec-empty { color: #94a3b8; font-size: 12px; text-align: center; padding: 28px 12px; line-height: 1.6; }
/* ── 抽屜 footer：「送給 AI（N）」主要送出按鈕（teal 主色）── */
.pc-draw-rec-footer { padding: 10px 14px; border-top: 1px solid #eef2f6; background: #fff; }
.pc-draw-rec-send-btn {
  width: 100%; padding: 8px; border: none; border-radius: 7px; cursor: pointer;
  background: #0FA0A0; color: #fff; font: 600 13px/1.4 system-ui, -apple-system, sans-serif;
  transition: background .12s, opacity .12s;
}
.pc-draw-rec-send-btn:disabled { opacity: .5; cursor: not-allowed; }
.pc-draw-rec-send-btn:not(:disabled):hover { background: #0d8f8f; }
/* AI 未連線、已排佇列：用琥珀色與「已送達」的綠/teal 區隔，讓使用者一眼看出差異。 */
.pc-draw-rec-send-btn.pc-draw-rec-queued { background: #B7791F; }
.pc-draw-rec-send-btn.pc-draw-rec-queued:disabled { opacity: .85; }
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
  // AI 方案卡層：錨定在標注旁的回覆卡（不依賴 lavish，走自家 reply 通道）。容器不吃指標、卡片才吃。
  const replyLayer = drawHtmlEl('div', 'pc-draw-reply-layer');
  host.appendChild(replyLayer);

  const state = {
    mode: opts.mode && DRAW_MODES.includes(opts.mode) ? opts.mode : 'off',
    tool: 'select',
    objects: [],      // DrawObject[]（committed，陣列順序＝z-order）
    draft: null,      // 進行中的 DrawObject（尚未送出）
    selectedIds: [],  // 多選：目前選取的物件 id 集合（陣列保序）
    marquee: null,    // 進行中的橡皮筋框 {x,y,w,h}（% 座標）
    brushType: 'pen', // 自由筆刷類型 pen/marker/highlighter
    exportEndpoint: opts.exportEndpoint || null, // 「送給 AI」POST 目標（無則只回 payload）
    recordOpen: false, // P6 側邊標注紀錄抽屜開關（預設關 → 不打擾一般使用）
    sentSigs: {},      // {objId: 上次成功送出時的內容簽章} → 面板每列顯示「已送/未送」
    sendUnchecked: {}, // {objId: true} → 該列「不納入送出」（預設全勾；新物件預設納入）
    replies: [],       // AI 貼回頁面的方案卡（{n, anchor, text, options, chosen?}）
    replyCursor: 0,    // reply-poll 游標
    decisions: [],     // 在方案卡上選的「決定」佇列（{id, replyId, optionId, optionLabel, text}）→ 進標注紀錄、隨批送出
    editingId: null,   // 正在以輸入框編輯的文字物件 id（render 時隱藏原件，避免重疊兩個框）
  };
  const history = makeUndoStack();
  // ── P7 團隊持久（選用）：把 opts.persist 解析成 drawings store（ready store 或 {fb,db,projectId}）。
  // 失敗或未提供 → drawStore = null → 一律走純本地（dev 模式 0 Firebase）。
  const drawStore = resolveDrawStore(opts.persist);
  // ── dev 模式本機持久化（無 drawStore + persistLocal !== false 時啟用）──────────
  // 讓 dev 環境重整後仍保留向量標注。image 不存（dataURL 佔空間太大，§4.6 哲學）。
  const localKey = 'pc-draw-local:' + (opts.projectId || 'default');
  const _storage = opts._storage || (typeof localStorage !== 'undefined' ? localStorage : null);
  const useLocalPersist = !drawStore && opts.persistLocal !== false;
  function persistLocalSave() {
    if (!useLocalPersist || !_storage) return;
    try { _storage.setItem(localKey, JSON.stringify(serializeObjectsForLocal(state.objects))); }
    catch (_) { /* quota 溢位 / 無 localStorage → 不影響繪圖 */ }
  }
  let unsubDraw = null;   // remote 訂閱解除函式（destroy 時呼叫）
  let drag = null;    // 繪製中：{ tool, rect, start, points }
  const actions = { setMode, setTool, setBrush, setColor, setStrokeWidth, setFontSize, setHeads, act, eyedropper: openEyedropper, closeContext: closeContextMenu, send: () => sendToAgent(), openRecord: () => { state.recordOpen = true; renderRecordPanel(); } };
  const toolbar = buildToolbar(state, actions);
  document.body.appendChild(toolbar);
  const contextMenu = buildContextMenu(actions);
  document.body.appendChild(contextMenu);

  // 選取集合小工具
  const isSelected = id => state.selectedIds.includes(id);
  // 已送出且未再改 → 從畫布隱藏（仍保留在標注紀錄）。讓畫面只剩「還沒送的」標注。
  const isSent = o => o && o.id != null && state.sentSigs[o.id] === annotationSig(o);
  const selectOnly = id => { state.selectedIds = id ? [id] : []; };
  const toggleSelect = id => {
    state.selectedIds = isSelected(id) ? state.selectedIds.filter(x => x !== id) : [...state.selectedIds, id];
  };
  const selectedObjects = () => state.selectedIds.map(id => findById(state.objects, id)).filter(Boolean);

  // ── P6 側邊標注紀錄面板（右緣 tab + 抽屜）─────────────────────────────────────────
  const recordTab = buildRecordTab(() => { state.recordOpen = !state.recordOpen; renderRecordPanel(); });
  const recordDrawer = buildRecordDrawer(() => { state.recordOpen = false; renderRecordPanel(); });
  const drawerSendBtn = recordDrawer.querySelector('.pc-draw-rec-send-btn');
  if (drawerSendBtn) drawerSendBtn.onclick = () => handleDrawerSend();
  // 標注紀錄「送出時納入哪些」勾選集合：unchecked 內的不送（預設全送）。
  const checkedObjects = () => state.objects.filter(o => !state.sendUnchecked[o.id]);
  const checkedDecisions = () => state.decisions.filter(d => !state.sendUnchecked[d.id]);
  const onToggleSendChecked = (id, checked) => { if (checked) delete state.sendUnchecked[id]; else state.sendUnchecked[id] = true; renderRecordPanel(); };
  const removeDecision = (id) => { state.decisions = state.decisions.filter(d => d.id !== id); delete state.sendUnchecked[id]; delete state.sentSigs[id]; renderRecordPanel(); };
  const drawerAllBox = recordDrawer.querySelector('.pc-draw-rec-all');
  if (drawerAllBox) drawerAllBox.onchange = () => {
    if (drawerAllBox.checked) state.sendUnchecked = {};
    else state.objects.forEach(o => { state.sendUnchecked[o.id] = true; });
    renderRecordPanel();
  };
  document.body.appendChild(recordDrawer);
  document.body.appendChild(recordTab);

  // 依目前 objects/selectedIds 重畫面板（render() 每次變動都會喚起 → 即時更新）。
  function renderRecordPanel() {
    recordTab.classList.toggle('show', !state.recordOpen);
    recordDrawer.classList.toggle('open', state.recordOpen);
    // 佇列＝畫的標注 + 在方案卡上做的「決定」，兩者都可勾選/送出/標已送。
    const annRows = annotationRows(state.objects, state.sentSigs);
    const decRows = state.decisions.map(d => ({
      id: d.id, tool: 'text', icon: 'text', text: '✅ ' + d.text, selector: null, color: '#0d7a4f',
      sent: state.sentSigs[d.id] === decisionSig(d), isDecision: true,
    }));
    const rows = annRows.concat(decRows);
    const checkedRows = rows.filter(r => !state.sendUnchecked[r.id]); // 納入送出的列
    const checkedCount = checkedRows.length;
    // 勾選的裡面有沒有「還沒送、或送出後又改過」的 → 有才需要送（決定按鈕亮/暗）
    const hasUnsent = checkedRows.some(r => !r.sent);
    const count = recordDrawer.querySelector('.pc-draw-rec-count');
    if (count) count.textContent = String(rows.length);
    // 全選框：全勾→checked、部分→indeterminate、空清單→disabled
    const allBox = recordDrawer.querySelector('.pc-draw-rec-all');
    if (allBox) {
      allBox.checked = rows.length > 0 && checkedCount === rows.length;
      allBox.indeterminate = checkedCount > 0 && checkedCount < rows.length;
      allBox.disabled = rows.length === 0;
    }
    // footer 送出鈕：畫布清空時強制重設（否則 in-flight 中若 clear 仍殘留舊狀態）
    const sendBtn = recordDrawer.querySelector('.pc-draw-rec-send-btn');
    if (sendBtn) {
      if (!rows.length) delete sendBtn.dataset.inflight; // clear → 強制重設
      if (!sendBtn.dataset.inflight) {
        sendBtn.classList.remove('pc-draw-rec-queued');
        if (checkedCount === 0) {            // 沒勾任何標注 → 不能送
          sendBtn.textContent = '送給 AI（0）'; sendBtn.disabled = true;
        } else if (!hasUnsent) {             // 勾選的都送過且沒再改 → 維持「已送出」disabled（明確看出送過了）
          sendBtn.textContent = `✅ 已送出（${checkedCount} 筆）`; sendBtn.disabled = true;
        } else {                             // 有新的/改過的 → 可送
          sendBtn.textContent = `送給 AI（${checkedCount}）`; sendBtn.disabled = false;
        }
      }
    }
    const list = recordDrawer.querySelector('.pc-draw-rec-list');
    if (!list) return;
    list.innerHTML = '';
    if (!rows.length) {
      const empty = drawHtmlEl('div', 'pc-draw-rec-empty');
      empty.textContent = '尚無標注';
      list.appendChild(empty);
      return;
    }
    list.appendChild(recordPreviewEl()); // 置頂：送給 AI 的畫面截圖預覽
    rows.forEach(row => list.appendChild(recordRowEl(row, isSelected(row.id), onRecordRowClick, !state.sendUnchecked[row.id], onToggleSendChecked, row.isDecision ? removeDecision : null)));
    refreshRecordPreview();
  }
  // 標注紀錄頂部「送出畫面」縮圖：顯示 capturePng() 的結果（=送給 AI 的 PNG）。
  let _previewSig = null, _previewUrl = null, _previewTimer = null;
  function recordPreviewEl() {
    if (_previewUrl) {
      const img = drawHtmlEl('img', 'pc-draw-rec-preview');
      img.alt = '送給 AI 的畫面預覽';
      img.style.cssText = 'display:block;width:100%;min-height:48px;border:1px solid #e1e4e8;border-radius:8px;margin:0 0 10px;background:#fafbfc;';
      img.src = _previewUrl;
      return img;
    }
    // 截圖尚未備好 → 顯示 placeholder（避免空 src <img> 被瀏覽器畫成破圖）
    const ph = drawHtmlEl('div', 'pc-draw-rec-preview');
    ph.textContent = '產生預覽中…';
    ph.style.cssText = 'display:flex;align-items:center;justify-content:center;width:100%;min-height:48px;border:1px solid #e1e4e8;border-radius:8px;margin:0 0 10px;background:#fafbfc;color:#8a9099;font-size:12px;';
    return ph;
  }
  function refreshRecordPreview() {
    if (!state.recordOpen) return;
    const sig = state.objects.length + '|' + history.length; // 內容變更（增刪/移動/換色）即重拍
    if (sig === _previewSig) return;
    _previewSig = sig;
    if (_previewTimer) clearTimeout(_previewTimer);
    _previewTimer = setTimeout(() => {
      capturePng().then(url => {
        if (!url) return;
        _previewUrl = url;
        const el = recordDrawer.querySelector('.pc-draw-rec-preview');
        if (!el) return;
        if (el.tagName === 'IMG') { el.src = url; return; }
        el.replaceWith(recordPreviewEl()); // placeholder → 真正的 <img>（_previewUrl 已設）
      });
    }, 180); // debounce：連續操作只在停手後拍一次
  }
  // 點一筆 row → 選取該物件、若在畫面外則捲入視野（沿用 spec-overlay 的 scrollIntoView）。
  function onRecordRowClick(id) {
    selectOnly(id);
    render();
    scrollObjectIntoView(id);
  }
  function scrollObjectIntoView(id) {
    const node = svg.querySelector('[data-id="' + id + '"]');
    if (!node || typeof node.getBoundingClientRect !== 'function') return;
    const r = node.getBoundingClientRect();
    const offscreen = r.bottom < 0 || r.top > window.innerHeight || r.right < 0 || r.left > window.innerWidth;
    if (offscreen && node.scrollIntoView) node.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }

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

  // ── Batch 4：端點 anchor 解析（element/object 硬鎖）+ 吸附 + live reposition ──────
  // selector → 元件 rect 換算成 host(svg) % 空間（與 geom 同基準）。找不到 → null（fallback geom）。
  function getRectPct(selector) {
    if (!selector) return null;
    let el = null;
    try { el = document.querySelector(selector); } catch (_) { return null; }
    if (!el || typeof el.getBoundingClientRect !== 'function') return null;
    const er = el.getBoundingClientRect();
    const hr = svg.getBoundingClientRect();
    return {
      x: pxToPct(er.left - hr.left, hr.width), y: pxToPct(er.top - hr.top, hr.height),
      w: pxToPct(er.width, hr.width), h: pxToPct(er.height, hr.height),
    };
  }
  // 綁定 resolver：供 render/geomBBox/labelAnchor 取得 arrow/line 解析後端點。
  const resolveO = o => resolveEndpoints(o, getRectPct, state.objects);
  // arrow/line 有 anchor 時 → 回傳「端點已解析」的渲染視圖物件；其餘原樣。
  function viewObject(o) {
    if ((o.tool === 'arrow' || o.tool === 'line') && o.endAnchors) {
      const e = resolveO(o);
      return { ...o, geom: { ...o.geom, from: e.from, to: e.to } };
    }
    return o;
  }

  // 拖端點吸附中的高亮目標（render 時畫 dashed teal rect）。{selector} 或 {objId}；放開/離開 → null。
  let snapHighlight = null;
  function renderSnapHighlight() {
    if (!snapHighlight) return;
    let r = null;
    if (snapHighlight.selector) r = getRectPct(snapHighlight.selector);            // DOM 元件
    else if (snapHighlight.objId != null) {                                        // 自繪形狀
      const t = findById(state.objects, snapHighlight.objId);
      if (t) r = geomBBox(t, resolveO);
    }
    if (!r) return;
    const rect = { width: svg.clientWidth || host.clientWidth, height: svg.clientHeight || host.clientHeight };
    const b = toPxBox(r, rect);
    svg.appendChild(drawSvgEl('rect', {
      class: 'pc-draw-snap-hl', x: b.x, y: b.y, width: b.w, height: b.h, fill: 'none',
      stroke: '#0FA0A0', 'stroke-width': 2, 'stroke-dasharray': '5 4', 'pointer-events': 'none',
    }));
  }

  // ── live reposition：有 el anchor 時監聽 scroll/resize/ResizeObserver + rAF 比對 rect ──
  let liveOn = false, liveRaf = null, liveRO = null;
  const liveRects = new Map();
  function anchoredSelectors() {
    const sels = new Set();
    state.objects.forEach(o => {
      const ea = o.endAnchors; if (!ea) return;
      ['from', 'to'].forEach(w => { if (ea[w] && ea[w].kind === 'el') sels.add(ea[w].selector); });
    });
    return sels;
  }
  function liveTick() {
    if (!liveOn) return;
    let changed = false;
    anchoredSelectors().forEach(sel => {
      const r = getRectPct(sel);
      const sig = r ? `${r.x},${r.y},${r.w},${r.h}` : 'null';
      if (liveRects.get(sel) !== sig) { liveRects.set(sel, sig); changed = true; }
    });
    if (changed) render();
    liveRaf = (liveOn && typeof requestAnimationFrame === 'function') ? requestAnimationFrame(liveTick) : null; // render→syncLiveLoop 可能已 stopLive，勿排程鬼魂 rAF
  }
  function hasElAnchor(o) {
    const ea = o.endAnchors; if (!ea) return false;
    return (ea.from && ea.from.kind === 'el') || (ea.to && ea.to.kind === 'el');
  }
  function syncLiveLoop() {
    // 只有 el anchor 需要 DOM 監聽（scroll/resize）；obj 形狀錨點隨 render 自然跟隨，免 rAF。
    const need = state.objects.some(hasElAnchor);
    if (need && !liveOn) startLive();
    else if (!need && liveOn) stopLive();
  }
  function startLive() {
    liveOn = true;
    window.addEventListener('scroll', render, true); // capture：抓內層捲動容器
    if (typeof ResizeObserver === 'function') { liveRO = new ResizeObserver(() => render()); liveRO.observe(host); }
    if (typeof requestAnimationFrame === 'function') liveRaf = requestAnimationFrame(liveTick);
  }
  function stopLive() {
    liveOn = false;
    window.removeEventListener('scroll', render, true);
    if (liveRO) { liveRO.disconnect(); liveRO = null; }
    if (liveRaf && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(liveRaf);
    liveRaf = null; liveRects.clear();
  }

  function render() {
    stampZ();
    while (svg.childNodes.length > 1) svg.removeChild(svg.lastChild); // 保留 <defs>
    const rect = { width: svg.clientWidth || host.clientWidth, height: svg.clientHeight || host.clientHeight };
    [...state.objects, state.draft].forEach(o => {
      if (!o) return;
      if (o !== state.draft && isSent(o)) return; // 已送出 → 不畫在畫布（保留在標注紀錄）
      if (o.id === state.editingId) return;       // 正在編輯的文字 → 隱藏原件，只留輸入框（不重疊兩個）
      const vo = viewObject(o); // arrow/line anchor → 解析後端點渲染
      const node = renderObject(vo, rect, svg);
      node.setAttribute('data-id', o.id);
      // 物件不吃指標事件 → 所有點擊都落在穩定的 <svg>（hit-test 用幾何）。
      // 關鍵：避免點擊細線時 render() 重建 <line> 導致瀏覽器 dblclick 因 target 改變而不觸發。
      node.setAttribute('pointer-events', 'none');
      svg.appendChild(node);
      const lbl = renderLabel(vo, rect);
      if (lbl) { svg.appendChild(lbl); sizeLabelBg(lbl); } // 綁定標籤；append 後量 text bbox 收緊白底
    });
    renderSelection(rect);
    renderMarquee(rect);
    renderSnapHighlight(); // Batch 4：拖端點吸附中的 dashed teal 高亮
    syncToolbar(toolbar, state, history);
    renderRecordPanel(); // P6：標注紀錄面板隨 objects/selection 即時更新
    syncLiveLoop();       // Batch 4：有 anchor 才啟動 live reposition 監聽
    renderReplies();     // AI 方案卡：錨定貼在標注旁
  }

  // ── AI 方案卡（reply 通道）：渲染 + 輪詢 + 回送選擇 ─────────────────────────────
  function renderReplies() {
    replyLayer.innerHTML = '';
    const rect = { width: svg.clientWidth || host.clientWidth, height: svg.clientHeight || host.clientHeight };
    state.replies.forEach(r => {
      const card = replyCardEl(r, submitChoice, closeReply);
      const a = r.anchor || {};
      const x = a.x != null ? a.x : 50, y = a.y != null ? a.y : 50;
      card.style.left = pctToPx(x, rect.width) + 'px';
      card.style.top = pctToPx(y, rect.height) + 'px';
      replyLayer.appendChild(card);
    });
  }
  // 關閉單張方案卡（不影響佇列裡已做的決定）。
  function closeReply(reply) {
    state.replies = state.replies.filter(r => r.n !== reply.n);
    renderReplies();
  }
  // 注入方案卡（poll 收到或測試用）：依 n 去重後併入。
  function ingestReplies(entries) {
    (entries || []).forEach(e => { if (!state.replies.some(r => r.n === e.n)) state.replies.push(e); });
    renderReplies();
  }
  // 使用者點方案卡上的選項 → 標記已選 + POST /api/draw-choice（→ AI 端 draw-poll 收到）。
  // 在方案卡選選項 → 卡片標已選 + 把「決定」加進標注紀錄佇列（不立即送；最後一次送出隨批帶給 AI）。
  function submitChoice(reply, option) {
    reply.chosen = option;
    const id = 'dec-' + reply.n; // 同一張卡重選 → 取代舊決定
    state.decisions = state.decisions.filter(d => d.id !== id);
    state.decisions.push({ id, replyId: reply.n, optionId: option.id, optionLabel: option.label, text: '決定：' + (option.label || option.id) });
    render(); // 更新方案卡(已選) + 標注紀錄(新佇列項) + 送出鈕計數/狀態
  }
  // reply-poll 迴圈：long-poll 收 AI 方案卡（僅 opts.replyPoll 開啟時跑；同源 http 才有 endpoint）。
  let replyPolling = false;
  async function replyPollLoop() {
    const endpoint = sameOriginApi('/api/draw-reply-poll');
    if (!endpoint || typeof fetch !== 'function') return;
    replyPolling = true;
    while (replyPolling) {
      try {
        const resp = await fetch(endpoint + '?since=' + state.replyCursor);
        const data = await resp.json();
        if (data && Array.isArray(data.entries) && data.entries.length) ingestReplies(data.entries);
        if (data && data.cursor != null) state.replyCursor = data.cursor;
      } catch (_) { await new Promise(r => setTimeout(r, 2000)); }
    }
  }

  function renderSelection(rect) {
    const objs = selectedObjects().filter(o => !isSent(o) && o.id !== state.editingId); // 已送出/編輯中者不畫選取框
    if (!objs.length) return;
    const g = drawSvgEl('g', { class: 'pc-draw-selection' });
    objs.forEach(o => {
      const box = toPxBox(geomBBox(o, resolveO), rect);
      g.appendChild(drawSvgEl('rect', { x: box.x, y: box.y, width: box.w, height: box.h, fill: 'none', stroke: '#0FA0A0', 'stroke-width': 1, 'stroke-dasharray': '4 3', 'pointer-events': 'none' }));
    });
    if (objs.length === 1) { // handle 只在單選時出現
      const o = objs[0];
      if (o.tool === 'arrow' || o.tool === 'line') {
        // 箭頭/線段：兩個圓端點 handle（取代 bbox 四角）；用解析後端點（anchor live）
        const ends = resolveO(o);
        ['from', 'to'].forEach(which => {
          const cx = pctToPx(ends[which].x, rect.width);
          const cy = pctToPx(ends[which].y, rect.height);
          g.appendChild(drawSvgEl('circle', { cx, cy, r: 4, fill: '#fff', stroke: '#0FA0A0', 'stroke-width': 1, 'data-endpoint': which }));
        });
      } else {
        // 其餘工具：4 角縮放 handle（原行為不變）
        const box = toPxBox(geomBBox(o), rect);
        ['nw', 'ne', 'se', 'sw'].forEach(name => {
          const c = boxCorner(box, name);
          g.appendChild(drawSvgEl('rect', { x: c.x - 4, y: c.y - 4, width: 8, height: 8, fill: '#fff', stroke: '#0FA0A0', 'stroke-width': 1, 'data-handle': name }));
        });
      }
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
    syncCommand(cmd); // P7：團隊模式才會真的寫 Firestore（drawStore 為 null 時 no-op）
    persistLocalSave(); // dev 模式本機持久化
  }
  // 物件已即時改好（拖曳預覽），只補登歷史（不重複 apply）。
  function pushHistory(cmd) { history.push(cmd); render(); syncCommand(cmd); persistLocalSave(); }

  // ── P7 團隊持久：把本地 command 反映到 Firestore（向量 only）。──────────────────
  // 持久化失敗一律吞掉 → 本地永遠是 live session 的真相，不因網路/權限問題壞掉繪圖。
  function syncCommand(cmd) {
    if (!drawStore || !cmd) return;
    try {
      if (cmd.type === 'create') syncSaveObj(cmd.obj);
      else if (cmd.type === 'update') syncSaveById(cmd.id);
      else if (cmd.type === 'reorder') (cmd.after || []).forEach(syncSaveById); // z 變更 → 重存
      else if (cmd.type === 'deleteMany') (cmd.items || []).forEach(it => syncRemoveObj(it.obj));
      else if (cmd.type === 'batch') (cmd.cmds || []).forEach(syncCommand);
    } catch (_) { /* 持久化失敗不影響本地繪圖 */ }
  }
  function syncSaveObj(obj) {
    if (!drawStore || !obj || obj.tool === 'image') return; // 跳過貼圖：PNG/dataURL 不進 Firestore（plan §4.6）
    try { Promise.resolve(drawStore.save(drawingToDoc(obj))).catch(() => {}); } catch (_) { /* ignore */ }
  }
  function syncSaveById(id) { const o = findById(state.objects, id); if (o) syncSaveObj(o); }
  function syncRemoveObj(obj) {
    if (!drawStore || !obj || obj.tool === 'image') return; // image 從未存過 → 不需刪
    try { Promise.resolve(drawStore.remove(obj.id)).catch(() => {}); } catch (_) { /* ignore */ }
  }

  // remote 訂閱：teammate 的向量物件即時併入（只「新增」缺的 id，de-dupe，不覆蓋本地進行中物件）。
  function startSync() {
    if (!drawStore) return;
    try { unsubDraw = drawStore.subscribe(onRemoteDrawings, () => { /* 訂閱錯誤 → 維持本地 */ }); }
    catch (_) { unsubDraw = null; }
  }
  function onRemoteDrawings(remoteDocs) {
    if (!Array.isArray(remoteDocs) || !remoteDocs.length) return;
    const localIds = new Set(state.objects.map(o => o.id));
    let changed = false;
    remoteDocs.forEach(doc => {
      if (!doc || doc.id == null || doc.tool === 'image') return;
      if (localIds.has(doc.id)) return; // 已存在（含自己剛存的 echo）→ de-dupe、不 clobber 本地
      state.objects.push(rehydrateDrawing(doc));
      changed = true;
    });
    if (changed) render();
  }
  // Firestore doc（含 updatedAt 等 metadata）→ 乾淨 DrawObject（丟掉非向量欄位）。
  function rehydrateDrawing(doc) {
    const obj = makeDrawObject({ id: doc.id, tool: doc.tool, geom: doc.geom, style: doc.style, text: doc.text });
    if (doc.label != null) obj.label = doc.label;
    if (doc.anchor != null) obj.anchor = doc.anchor;
    if (doc.groupId != null) obj.groupId = doc.groupId;
    if (doc.endAnchors != null) obj.endAnchors = doc.endAnchors;
    return obj;
  }
  function commitChange(id, before, after) { pushHistory({ type: 'update', id, before, after }); }
  function doUndo() {
    const cmd = history.undo();
    if (!cmd) return;
    state.objects = invertCommand(state.objects, cmd);
    ensureSelectionValid();
    render();
    persistLocalSave();
  }
  function doRedo() {
    const cmd = history.redo();
    if (!cmd) return;
    state.objects = applyCommand(state.objects, cmd);
    ensureSelectionValid();
    render();
    persistLocalSave();
  }
  function ensureSelectionValid() {
    state.selectedIds = state.selectedIds.filter(id => findById(state.objects, id));
  }

  // ── Batch 3：群組 bind / ungroup ──────────────────────────────────────────────
  function doGroupSelected() {
    if (state.selectedIds.length < 2) return;
    const gid = nextGroupId();
    const cmds = state.selectedIds.map(id => {
      const o = findById(state.objects, id);
      return { type: 'update', id, before: { groupId: o ? o.groupId : undefined }, after: { groupId: gid } };
    });
    state.objects = assignGroupId(state.objects, state.selectedIds, gid);
    pushHistory(cmds.length === 1 ? cmds[0] : { type: 'batch', cmds });
  }
  function doUngroupSelected() {
    const gids = new Set();
    state.selectedIds.forEach(id => {
      const o = findById(state.objects, id);
      if (o && o.groupId) gids.add(o.groupId); // 解散整組（含未選到的成員），避免落單成 group-of-one
    });
    if (!gids.size) return;
    const toUngroup = state.objects.filter(o => o.groupId && gids.has(o.groupId)).map(o => o.id);
    const cmds = toUngroup.map(id => {
      const o = findById(state.objects, id);
      return { type: 'update', id, before: { groupId: o.groupId }, after: { groupId: undefined } };
    });
    state.objects = clearGroupId(state.objects, toUngroup);
    pushHistory(cmds.length === 1 ? cmds[0] : { type: 'batch', cmds });
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
  function setFontSize(px) { setStyle({ fontSize: px }); }
  function setHeads(mode) { setStyle({ heads: mode }); } // line/arrow 端點箭頭 none/end/start/both

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
    if (action === 'group') return doGroupSelected();
    if (action === 'ungroup') return doUngroupSelected();
    return zorder(action); // front / back / forward / backward
  }

  // ── pointer：select 模式（選取 / 多選 / marquee / 移動 / 縮放）──────────────────
  function onSelectDown(e) {
    const rect = svg.getBoundingClientRect();
    // 端點拖曳（arrow/line）：優先於 bbox handle 分支
    const endpoint = e.target?.dataset?.endpoint;
    if (endpoint && state.selectedIds.length === 1) { startEndpointDrag(e, endpoint, rect); return; }
    const handle = e.target && e.target.dataset ? e.target.dataset.handle : null;
    if (handle && state.selectedIds.length === 1) { startResize(e, handle, rect); return; }
    const p = clientToPct(e.clientX, e.clientY, rect);
    const hit = hitTest(p);
    if (!hit) { startMarquee(rect, p, e.shiftKey); render(); return; } // 空白起拖 → 橡皮筋框
    if (e.shiftKey) { toggleSelect(hit.id); render(); return; }        // Shift+click → 加/減選
    if (!isSelected(hit.id)) {                                         // 點未選物件 → 展開群組後選
      state.selectedIds = expandSelectionToGroups(state.objects, [hit.id]);
    }
    render();
    startMove(rect, p);                                               // 拖曳 → 整個選取一起移動
  }
  function hitTest(p) {
    const tol = 2.5; // % 容差
    // 第一輪：精準命中取「最近者」→ 細線穿過外框形狀邊緣時選到的是線，不是被穿的形狀。
    // 平手時：細線(arrow/line/pencil)優先於外框形狀；其餘維持 z-order（上層先遇到者勝）。
    let best = null, bestD = Infinity, bestThin = false, bestOutlined = false;
    for (let i = state.objects.length - 1; i >= 0; i--) {
      const o = state.objects[i];
      if (isSent(o)) continue; // 已送出隱藏 → 不可選
      const ends = (o.tool === 'arrow' || o.tool === 'line') ? resolveO(o) : null;
      const d = objHitDist(o, p, tol, ends);
      if (d === Infinity) continue;
      const thin = o.tool === 'arrow' || o.tool === 'line' || o.tool === 'pencil';
      const closer = d < bestD - 1e-9;
      const tieThinWins = Math.abs(d - bestD) <= 1e-9 && thin && bestOutlined && !bestThin;
      if (best === null || closer || tieThinWins) { best = o; bestD = d; bestThin = thin; bestOutlined = isOutlinedShape(o); }
    }
    if (best) return best;
    // 第二輪：bbox 後援 → 點在大空白外框內也選得到（如鉛筆捲線內側、未重疊時）
    for (let i = state.objects.length - 1; i >= 0; i--) {
      const o = state.objects[i];
      if (isSent(o)) continue; // 已送出隱藏 → 不可選
      const b = geomBBox(o, resolveO);
      if (p.x >= b.x - tol && p.x <= b.x + b.w + tol && p.y >= b.y - tol && p.y <= b.y + b.h + tol) return o;
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

  // 拖曳端點 handle → 重新指向端點（arrow/line 專用）。仿 startResize，加吸附 + anchor + 高亮。
  function startEndpointDrag(e, which, rect) {
    const o = selectedObjects()[0];
    if (!o) return;
    const before = { geom: o.geom, endAnchors: o.endAnchors };
    let moved = false, pendingAnchor;
    const onMv = ev => {
      const p = clientToPct(ev.clientX, ev.clientY, rect);
      const snap = computeEndpointSnap(p, o.id, ev.clientX, ev.clientY);
      o.geom = setEndpoint(before.geom, which, snap ? snap.point : p);
      pendingAnchor = snap ? snap.anchor : undefined;
      o.endAnchors = mergeEndAnchor(before.endAnchors, which, pendingAnchor); // 拖曳中即時反映：避免已 anchored 端點被舊 anchor 鎖住不跟手
      snapHighlight = snap ? snap.highlight : null; // 吸到元件/形狀 → 高亮其 rect
      moved = true;
      render();
    };
    const onUp = () => {
      window.removeEventListener('pointermove', onMv);
      window.removeEventListener('pointerup', onUp);
      snapHighlight = null;
      if (moved) commitEndpoint(o, which, before, pendingAnchor);
      else render(); // 清掉高亮
    };
    window.addEventListener('pointermove', onMv);
    window.addEventListener('pointerup', onUp);
  }
  // 蒐集候選（游標下元件的 8 錨點 + 最近邊 + 其他物件端點）→ 閾值內最近吸附點 + 對應 anchor。
  function computeEndpointSnap(p, draggedId, clientX, clientY) {
    // 自繪物件（線端點 / 形狀錨點）優先：刻意畫的標注目標應贏過背景 DOM（DOM 最近邊永遠貼游標會蓋掉形狀）。
    const objHit = nearestSnap(p, objectSnapPoints(state.objects, draggedId), SNAP_THRESHOLD_PCT);
    if (objHit) return snapResult(objHit, null);
    const selector = elSnapSelector(elementUnderPoint(clientX, clientY));
    const elRect = selector ? getRectPct(selector) : null;
    if (!elRect) return null;
    const cands = rectAnchorPoints(elRect).map(pt => ({ ...pt, selector }));
    cands.push({ ...nearestPointOnRect(p, elRect), selector, ref: 'edge' }); // DOM 才有最近邊吸附
    const elHit = nearestSnap(p, cands, SNAP_THRESHOLD_PCT);
    return elHit ? snapResult(elHit, elRect) : null;
  }
  function snapResult(hit, elRect) {
    return { point: hit.point, anchor: snapToAnchor(hit.cand, elRect), highlight: snapHighlightOf(hit.cand) };
  }
  // 候選 → 高亮目標：el 候選 → {selector}；obj 候選 → {objId}。
  function snapHighlightOf(cand) {
    if (cand.selector) return { selector: cand.selector };
    if (cand.objId != null) return { objId: cand.objId };
    return null;
  }
  // 候選 → anchor：obj 線端點 → which；obj 形狀 → relX/relY；el → relX/relY。
  function snapToAnchor(cand, elRect) {
    if (cand.objId != null) {
      if (cand.which) return { kind: 'obj', objId: cand.objId, which: cand.which };
      return { kind: 'obj', objId: cand.objId, relX: cand.relX, relY: cand.relY };
    }
    if (cand.selector && elRect) {
      const rel = anchorRel(cand, elRect);
      return { kind: 'el', selector: cand.selector, relX: rel.relX, relY: rel.relY };
    }
    return undefined;
  }
  // 排除 overlay/toolbar 自身與 body/html → 回傳可吸附元件的 css selector。
  function elSnapSelector(el) {
    if (!el || el === document.body || el === document.documentElement) return null;
    if (svg.contains(el) || toolbar.contains(el)) return null;
    return cssSelectorFor(el);
  }
  // 提交端點變更：before/after 同時含 geom + endAnchors（undo 一起還原）。
  function commitEndpoint(o, which, before, pendingAnchor) {
    const nextAnchors = mergeEndAnchor(before.endAnchors, which, pendingAnchor);
    if (nextAnchors) o.endAnchors = nextAnchors; else delete o.endAnchors;
    commitChange(o.id, { geom: before.geom, endAnchors: before.endAnchors },
      { geom: o.geom, endAnchors: nextAnchors });
  }

  // ── pointer：繪製模式（拖曳畫物件）────────────────────────────────────────────
  function onDown(e) {
    if (state.mode !== 'draw') return;
    if (state.tool === 'select') { onSelectDown(e); return; }
    e.preventDefault();
    state.selectedIds = [];
    const rect = svg.getBoundingClientRect();
    if (state.tool === 'text') { startTextInput(e.clientX, e.clientY, rect); return; }
    const p0 = clientToPct(e.clientX, e.clientY, rect);
    let start = p0, fromAnchor;
    if (isEndpointTool(state.tool)) { // 起點也可吸附（畫線時 from 黏元件/形狀）
      const snap = computeEndpointSnap(p0, null, e.clientX, e.clientY);
      if (snap) { start = snap.point; fromAnchor = snap.anchor; snapHighlight = snap.highlight; }
    }
    drag = { tool: state.tool, rect, start, points: [[start.x, start.y]], fromAnchor };
    const style = state.tool === 'pencil' ? { ...(opts.style || {}), brushType: state.brushType } : opts.style;
    state.draft = makeDrawObject({ tool: state.tool, geom: initialGeom(state.tool, start), style });
    if (fromAnchor) state.draft.endAnchors = { from: fromAnchor };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  }
  function isEndpointTool(tool) { return tool === 'arrow' || tool === 'line'; }
  function onMove(e) {
    if (!drag || !state.draft) return;
    const p = clientToPct(e.clientX, e.clientY, drag.rect);
    let to = p;
    if (isEndpointTool(drag.tool)) { // 終點即時吸附 + 高亮，並把 anchor 暫存到 draft
      const snap = computeEndpointSnap(p, null, e.clientX, e.clientY);
      to = snap ? snap.point : p;
      snapHighlight = snap ? snap.highlight : null;
      setDraftAnchors(drag.fromAnchor, snap ? snap.anchor : undefined);
    }
    state.draft.geom = updateGeom(drag, to);
    render();
  }
  function setDraftAnchors(fromAnchor, toAnchor) {
    let ea = fromAnchor ? { from: fromAnchor } : undefined;
    ea = mergeEndAnchor(ea, 'to', toAnchor);
    if (ea) state.draft.endAnchors = ea; else delete state.draft.endAnchors;
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
    snapHighlight = null; // 收掉吸附高亮
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
    const p = buildExport(checkedObjects(), { w: svg.clientWidth || host.clientWidth, h: svg.clientHeight || host.clientHeight });
    const decs = checkedDecisions();
    if (decs.length) p.decisions = decs.map(d => ({ replyId: d.replyId, optionId: d.optionId, optionLabel: d.optionLabel })); // 方案卡決定隨批送
    return p;
  }
  // html2canvas 載入：優先用既有 window.html2canvas；否則注入 UMD <script>（雙 CDN 後援）。
  // 用 <script> 而非 ESM import — esm.sh 動態 import 時好時壞，失敗會默默退回透明 SVG-only（截不到底下畫面）。
  let _h2cPromise = null;
  function injectScript(src) {
    return new Promise((resolve) => {
      const s = document.createElement('script');
      s.src = src; s.async = true;
      s.onload = () => resolve(window.html2canvas || null);
      s.onerror = () => resolve(null);
      document.head.appendChild(s);
    });
  }
  function loadHtml2canvas() {
    if (typeof window === 'undefined' || typeof document === 'undefined') return Promise.resolve(null);
    if (window.html2canvas) return Promise.resolve(window.html2canvas);
    if (!_h2cPromise) {
      const chain = injectScript('https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js')
        .then(fn => fn || injectScript('https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js'))
        .then(fn => fn || window.html2canvas || null)
        .catch(() => null);
      // 整體逾時後援：任一/兩個 CDN 請求卡住（pending，不觸發 onload/onerror）時，
      // 不讓 capturePng 無限等 → 4.5s 後回 null，退回 SVG-only。背景仍可能載完，下次截圖即用整頁。
      const timeout = new Promise(res => setTimeout(() => res(null), 4500));
      _h2cPromise = Promise.race([chain, timeout]);
    }
    return _h2cPromise;
  }
  // 截圖要排除的 overlay chrome（工具列/抽屜/方案卡/選單/編輯框）＋未勾選送出的標注（讓截圖=送出內容一致）。
  function isCaptureExcluded(el) {
    if (!el || !el.classList) return false;
    if (el.classList.contains('pc-draw-toolbar') || el.classList.contains('pc-draw-reply-layer')
      || el.classList.contains('pc-draw-rec-tab') || el.classList.contains('pc-draw-text-input')
      || el.id === 'pc-draw-rec-drawer' || el.id === 'pc-draw-context') return true;
    const id = el.getAttribute && el.getAttribute('data-id');
    return !!(id && state.sendUnchecked[id]); // 未勾選送出的標注不入鏡
  }
  // 整頁截圖（底層畫面 + 標注合成）。html2canvas 不可用/失敗 → 退回只截 SVG 標注層（透明底）。async。
  async function capturePng() {
    const h2c = await loadHtml2canvas().catch(() => null);
    if (h2c) {
      const prevSel = state.selectedIds.slice();
      try {
        if (prevSel.length) { state.selectedIds = []; render(); } // 選取框不入鏡
        const canvas = await h2c(document.body, {
          backgroundColor: '#ffffff',
          scale: Math.min(2, (typeof window !== 'undefined' && window.devicePixelRatio) || 1),
          logging: false, useCORS: true,
          ignoreElements: isCaptureExcluded,
        });
        return canvas.toDataURL('image/png');
      } catch (_) { /* fall through to SVG-only */ }
      finally { if (prevSel.length) { state.selectedIds = prevSel; render(); } }
    }
    return capturePngSvgOnly();
  }
  // 後援：把 #pc-draw SVG（含貼圖 + 標注）轉 PNG dataURL（透明底，XMLSerializer → img → canvas）。async。
  async function capturePngSvgOnly() {
    try {
      const w = svg.clientWidth || host.clientWidth, h = svg.clientHeight || host.clientHeight;
      const clone = svg.cloneNode(true);
      clone.setAttribute('width', w);
      clone.setAttribute('height', h);
      clone.setAttribute('xmlns', SVG_NS);
      clone.querySelectorAll('.pc-draw-selection, .pc-draw-marquee').forEach(n => n.remove()); // 不要選取框
      // 只截「納入送出」的標注：移除未勾選物件的圖元，讓截圖與送出的 JSON 一致。
      clone.querySelectorAll('[data-id]').forEach(n => { if (state.sendUnchecked[n.getAttribute('data-id')]) n.remove(); });
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
  // 同源 API 路徑（http(s) 才回，file:// 回 null）。resolve server 同源服務 flow + 這些端點。
  function sameOriginApi(p) {
    try {
      const o = typeof location !== 'undefined' && location.origin;
      return o && /^https?:/.test(o) ? o + p : null;
    } catch (_) { return null; }
  }
  // 預設打同源 /api/draw（http(s) 才送；file:// 回 null 不送）。
  function sameOriginDrawEndpoint() {
    try {
      return sameOriginApi('/api/draw');
    } catch (_) { return null; }
  }
  // 組 {json, png} → POST 到 endpoint（可無）；無論有無 server 都回 payload 供 caller/測試讀。
  async function sendToAgent(opts2 = {}) {
    const json = exportPayload();
    if (!json.annotations.length && !(json.decisions && json.decisions.length)) return { json, png: null, sent: false, listening: false }; // 沒標注也沒決定 → 不做事
    const png = await capturePng();
    const payload = { json, png, sent: false, listening: false };
    const endpoint = opts2.endpoint || state.exportEndpoint || sameOriginDrawEndpoint();
    if (endpoint && typeof fetch === 'function') {
      try {
        const resp = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ json, png }) });
        payload.sent = true;
        // server 回 { ok, n, listening }：listening＝此刻 AI 是否在線（有 long-poll 連線）。
        try { const data = await resp.json(); if (data) { payload.listening = !!data.listening; payload.n = data.n; } } catch (_) { /* 無 JSON body 也算送出成功 */ }
      } catch (_) { payload.sent = false; }
    }
    return payload;
  }

  // 抽屜 footer「送給 AI（N）」按鈕處理：防重複送出、顯示中間/成功/失敗狀態。
  async function handleDrawerSend() {
    const sendBtn = recordDrawer.querySelector('.pc-draw-rec-send-btn');
    if (!sendBtn || sendBtn.disabled || sendBtn.dataset.inflight) return;
    const n = checkedObjects().length + checkedDecisions().length; // 實際送出的筆數（勾選的標注＋決定）
    if (!n) return; // 全沒勾 → 不送
    sendBtn.dataset.inflight = '1';
    sendBtn.disabled = true;
    sendBtn.textContent = '送出中…';
    let result;
    try { result = await sendToAgent(); } catch (_) { result = { sent: false }; }
    if (result && result.sent) {
      // 分「AI 在線＝立即送達」與「AI 未連線＝已排佇列（之後連上自動收）」，讓使用者看得出狀態。
      sendBtn.textContent = result.listening ? `✅ 已送達 AI（${n} 筆）` : `📥 已排佇列（${n} 筆，AI 未連線）`;
      sendBtn.classList.toggle('pc-draw-rec-queued', !result.listening);
      // 記下這批「實際送出（勾選）」的標注＋決定簽章 → 面板那幾列標「已送」（改動後簽章變、自動回「未送」）。
      checkedObjects().forEach(o => { state.sentSigs[o.id] = annotationSig(o); });
      checkedDecisions().forEach(d => { state.sentSigs[d.id] = decisionSig(d); });
      render(); // 立刻更新：畫布隱藏已送標注 + 各列「已送」標記（inflight 仍在 → 不蓋按鈕狀態文字）
      // 2 秒後恢復成可再送（同一批可重送；server 不去重、AI 端 cursor 會收到）。
      setTimeout(() => { delete sendBtn.dataset.inflight; renderRecordPanel(); }, 2000);
      return;
    }
    sendBtn.textContent = '⚠️ 送出失敗，再試一次';
    sendBtn.disabled = false;
    delete sendBtn.dataset.inflight;
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
    if (hit) {
      e.preventDefault();
      state.selectedIds = [hit.id];
      if (hit.tool === 'text') startTextEdit(hit, rect); // 文字物件 → 編輯內容
      else startLabelEdit(hit, rect);                    // 其他 → 編輯綁定標籤
    } else startTextInput(e.clientX, e.clientY, rect);    // 雙擊空白 → 自由文字（Excalidraw parity）
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
  // 雙擊文字物件 → 編輯其內容（o.text）；清空則刪除該物件。
  function startTextEdit(o, rect) {
    state.editingId = o.id; // 隱藏原件 → 編輯時只看到一個輸入框
    render();
    const input = drawHtmlEl('input', 'pc-draw-text-input');
    input.type = 'text';
    input.value = o.text || '';
    input.style.left = pctToPx(o.geom.x, rect.width) + 'px';
    input.style.top = (pctToPx(o.geom.y, rect.height) - 12) + 'px';
    host.appendChild(input);
    setTimeout(() => { input.focus(); input.select(); }, 0);
    const before = { text: o.text || '' };
    let done = false;
    const commit = () => {
      if (done) return;
      done = true;
      state.editingId = null; // 還原顯示
      const text = input.value.trim();
      input.remove();
      if (text === (o.text || '')) { render(); return; } // 無變更
      if (!text) { // 清空 → 刪除該文字物件
        const index = state.objects.findIndex(x => x.id === o.id);
        if (index >= 0) runCommand({ type: 'deleteMany', items: [{ obj: o, index }] });
        else render();
        return;
      }
      o.text = text;                               // 立即套用（預覽）
      pushHistory({ type: 'update', id: o.id, before, after: { text } });
      render();
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
    if (meta && e.key.toLowerCase() === 'g') {
      e.preventDefault();
      if (e.shiftKey) doUngroupSelected(); else doGroupSelected();
      return;
    }
    if ((e.key === 'Delete' || e.key === 'Backspace') && state.selectedIds.length) {
      e.preventDefault();
      deleteSelected();
      return;
    }
    // 工具切換快捷鍵（純按鍵；排除 Cmd/Ctrl/Alt 以免撞 undo/redo/瀏覽器）。打字已在上方 guard 擋掉。
    if (!meta && !e.altKey) {
      const action = resolveShortcut(e.key) || resolveShortcutByCode(e.code); // e.code → 注音/IME 開著也能切工具
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
  // 依選取狀態動態顯示 群組（選 ≥2）／解散群組（選到群組成員）。
  function syncContextItems() {
    const canGroup = state.selectedIds.length >= 2;
    const canUngroup = state.selectedIds.some(id => { const o = findById(state.objects, id); return !!(o && o.groupId); });
    const g = contextMenu.querySelector('[data-action="group"]');
    const u = contextMenu.querySelector('[data-action="ungroup"]');
    if (g) g.style.display = canGroup ? '' : 'none';
    if (u) u.style.display = canUngroup ? '' : 'none';
  }
  function openContextMenu(x, y) {
    syncContextItems();
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
  window.addEventListener('scroll', renderReplies, true); // 捲動時方案卡跟著重新定位（capture：任何容器捲動都收到）
  window.addEventListener('keydown', onKey);
  window.addEventListener('paste', onPaste);

  // dev 模式：init 時從本機儲存還原向量物件（首次 render 前）。try/catch 確保失敗不影響繪圖。
  if (useLocalPersist && _storage) {
    try {
      const raw = _storage.getItem(localKey);
      if (raw) state.objects = hydrateObjectsFromLocal(JSON.parse(raw));
    } catch (_) { /* localStorage 失敗 / JSON 損毀 → 從空白開始 */ }
  }

  applyMode();
  render();
  startSync(); // P7：團隊模式才訂閱 + 載入既有 drawings（dev 模式 drawStore=null → no-op）
  if (opts.replyPoll) { replyPollLoop(); loadHtml2canvas(); } // 跑方案卡輪詢 + 預載 html2canvas（送出時整頁截圖才不會卡/退回透明）

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
    setFontSize,
    setHeads,
    eyedropper: openEyedropper,
    addImage, // (dataURL, naturalW, naturalH, atPoint?) → 新 image 物件（paste/drop 與測試共用）
    buildExport: exportPayload,            // 結構化 JSON（selector + text + geom）
    capturePng,                            // async → PNG dataURL
    sendToAgent,                           // async (opts?) → {json, png, sent}；回 payload
    setExportEndpoint: url => { state.exportEndpoint = url; },
    getAnnotationRows: () => annotationRows(state.objects, state.sentSigs), // P6 面板 row 資料（純函式包裝）
    ingestReplies, // AI 方案卡：注入回覆（poll 收到或測試用）
    getReplies: () => state.replies.slice(),
    getDecisions: () => state.decisions.slice(), // 方案卡選擇進的佇列
    toggleRecordPanel: () => { state.recordOpen = !state.recordOpen; renderRecordPanel(); },
    clear: () => { state.objects = []; state.draft = null; state.selectedIds = []; state.sentSigs = {}; state.sendUnchecked = {}; state.replies = []; state.decisions = []; render(); persistLocalSave(); },
    destroy: () => {
      stopLive(); // Batch 4：拆掉 live reposition 監聽/rAF/ResizeObserver
      replyPolling = false; // 停掉 AI 方案卡輪詢
      svg.remove(); toolbar.remove(); contextMenu.remove(); replyLayer.remove();
      recordTab.remove(); recordDrawer.remove();
      window.removeEventListener('resize', render);
      window.removeEventListener('scroll', renderReplies, true);
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('paste', onPaste);
      if (typeof unsubDraw === 'function') { try { unsubDraw(); } catch (_) { /* ignore */ } }
      closeContextMenu();
    },
  };
}

// opts.persist → drawings store（純 wiring，可單測思路）。接受三種輸入：
//   - falsy        → null（dev 模式，0 Firebase）
//   - ready store  → 已有 subscribe/save → 直接用（呼叫端先 createDrawingStore）
//   - {fb,db,projectId} → 用 createDrawingStore 現場建（team 模式便利寫法）
// 任一步出錯都回 null → 退回純本地，永不讓持久化擋住繪圖。
function resolveDrawStore(persist) {
  if (!persist) return null;
  try {
    if (typeof persist.subscribe === 'function' && typeof persist.save === 'function') return persist;
    if (persist.fb && persist.projectId != null) return createDrawingStore(persist.fb, persist.db, persist.projectId);
  } catch (_) { /* ignore → null */ }
  return null;
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
    const h = arrowHeads(o); // 端點箭頭：none/end/start/both（marker 用 auto-start-reverse 自動翻向）
    if (h.start || h.end) {
      const mid = ensureArrowMarker(svg, s.color);
      if (h.end) attrs['marker-end'] = `url(#${mid})`;
      if (h.start) attrs['marker-start'] = `url(#${mid})`;
    }
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
  const t = drawSvgEl('text', { x: pctToPx(o.geom.x, rect.width), y: pctToPx(o.geom.y, rect.height), fill: s.color, 'font-size': s.fontSize || DEFAULT_DRAW_STYLE.fontSize, 'font-family': 'system-ui, sans-serif' });
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
  const labelFs = (o.style && o.style.fontSize) || LABEL_FONT_SIZE; // 跟隨物件字體大小
  const g = drawSvgEl('g', { class: 'pc-draw-label', 'data-label-for': o.id, 'pointer-events': 'none' });
  if (isLine) { // 白底蓋住線；rect 在前(底層)、text 在後(上層)
    const w = o.label.length * labelFs + LABEL_BG_PAD * 2; // 估寬偏大（CJK ~1em/字）→ fallback 也蓋住
    const h = labelFs + LABEL_BG_PAD * 2;
    g.appendChild(drawSvgEl('rect', { x: x - w / 2, y: y - h / 2, width: w, height: h, fill: '#ffffff', rx: 3 }));
  }
  const t = drawSvgEl('text', {
    x, y, 'text-anchor': 'middle', 'dominant-baseline': 'middle',
    fill: '#1e1e1e', 'font-size': labelFs, 'font-family': 'system-ui, sans-serif',
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
  bar.appendChild(fontSizeMenu(actions));
  bar.appendChild(headsMenu(actions));
  appendSep(bar);
  bar.appendChild(actButton('delete', actions)); // 刪除（z-order 已移到右鍵選單）
  appendSep(bar);
  ['undo', 'redo'].forEach(a => bar.appendChild(actButton(a, actions)));
  appendSep(bar);
  const send = drawHtmlEl('button', 'pc-draw-tool pc-draw-send');
  send.dataset.action = 'send';
  send.title = '標注紀錄／送給 AI';
  send.setAttribute('aria-label', '標注紀錄／送給 AI');
  send.innerHTML = icon('send');
  send.onclick = () => actions.openRecord();
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
const CTX_SYM = { group: '⧉', ungroup: '⊟' }; // 群組/解散沒有 icon → 用符號
function buildContextMenu(actions) {
  const menu = drawHtmlEl('div', 'pc-draw-context');
  menu.id = 'pc-draw-context';
  [['front', '置頂'], ['forward', '上移一層'], ['backward', '下移一層'], ['back', '置底'],
    ['group', '群組'], ['ungroup', '解散群組'], ['delete', '刪除']]
    .forEach(([action, label]) => {
      const item = drawHtmlEl('button', 'pc-draw-context-item');
      item.dataset.action = action;
      item.setAttribute('aria-label', label);
      const head = CTX_SYM[action] ? `<span style="display:inline-block;width:18px;text-align:center;font-size:15px">${CTX_SYM[action]}</span>` : icon(action, 18);
      item.innerHTML = head + `<span>${label}</span>`;
      item.onclick = () => { actions.act(action); actions.closeContext(); };
      menu.appendChild(item);
    });
  return menu;
}

// ── P6 側邊「標注紀錄」面板 DOM（右緣 tab + 抽屜，沿用 spec-overlay 的 tab/drawer 模式）──
function buildRecordTab(onToggle) {
  const tab = drawHtmlEl('button', 'pc-draw-rec-tab');
  tab.id = 'pc-draw-rec-tab';
  tab.textContent = '標注紀錄 ◂';
  tab.title = '標注紀錄';
  tab.setAttribute('aria-label', '標注紀錄');
  tab.onclick = onToggle;
  return tab;
}
function buildRecordDrawer(onClose) {
  const drawer = drawHtmlEl('div', 'pc-draw-rec-drawer');
  drawer.id = 'pc-draw-rec-drawer';
  const hd = drawHtmlEl('div', 'pc-draw-rec-hd');
  const title = drawHtmlEl('span', 'pc-draw-rec-hd-title'); title.textContent = '標注紀錄';
  const count = drawHtmlEl('span', 'pc-draw-rec-count'); count.textContent = '0';
  // 全選/全不選：控制「送出時納入哪些標注」（onchange 在 initDrawLayer 掛上）
  const allWrap = drawHtmlEl('label', 'pc-draw-rec-all-wrap');
  const allBox = drawHtmlEl('input', 'pc-draw-rec-all'); allBox.type = 'checkbox'; allBox.checked = true;
  allBox.setAttribute('aria-label', '全選／全不選送出');
  const allLbl = drawHtmlEl('span'); allLbl.textContent = '全選';
  allWrap.appendChild(allBox); allWrap.appendChild(allLbl);
  const close = drawHtmlEl('button', 'pc-draw-rec-close'); close.textContent = '✕';
  close.title = '關閉'; close.setAttribute('aria-label', '關閉標注紀錄'); close.onclick = onClose;
  hd.appendChild(title); hd.appendChild(count); hd.appendChild(allWrap); hd.appendChild(close);
  drawer.appendChild(hd);
  drawer.appendChild(drawHtmlEl('div', 'pc-draw-rec-list'));
  // footer：主要送出按鈕（onclick 在 initDrawLayer 掛上）
  const footer = drawHtmlEl('div', 'pc-draw-rec-footer');
  const sendBtn = drawHtmlEl('button', 'pc-draw-rec-send-btn');
  sendBtn.textContent = '送給 AI（0）';
  sendBtn.disabled = true;
  footer.appendChild(sendBtn);
  drawer.appendChild(footer);
  return drawer;
}
// 一筆標注 → 面板 row（工具圖示 + 色票 + 文字 + selector）。點擊 → onClick(id)。
function recordRowEl(row, selected, onClick, checked, onToggle, onRemove) {
  const el = drawHtmlEl('div', 'pc-draw-rec-row' + (selected ? ' selected' : ''));
  el.dataset.id = row.id;
  el.setAttribute('role', 'button'); el.setAttribute('tabindex', '0');
  el.setAttribute('aria-label', row.text);
  // 送出勾選框：是否納入送出（獨立於畫布選取；stopPropagation 不觸發整列點選）。
  const cb = drawHtmlEl('input', 'pc-draw-rec-check'); cb.type = 'checkbox'; cb.checked = checked !== false;
  cb.setAttribute('aria-label', '送出時包含此標注');
  cb.onclick = e => e.stopPropagation();
  cb.onchange = e => { e.stopPropagation(); if (onToggle) onToggle(row.id, cb.checked); };
  el.appendChild(cb);
  const ic = drawHtmlEl('span', 'pc-draw-rec-icon');
  ic.innerHTML = icon(row.icon, 18);
  el.appendChild(ic);
  if (row.color) {
    const sw = drawHtmlEl('span', 'pc-draw-rec-swatch');
    sw.style.background = row.color;
    el.appendChild(sw);
  }
  const body = drawHtmlEl('div', 'pc-draw-rec-body');
  const txt = drawHtmlEl('div', 'pc-draw-rec-text'); txt.textContent = row.text;
  body.appendChild(txt);
  if (row.selector) {
    const sel = drawHtmlEl('div', 'pc-draw-rec-sel');
    sel.textContent = row.selector; sel.title = row.selector;
    body.appendChild(sel);
  }
  el.appendChild(body);
  // 已送/未送 標記：送出後沒再改＝已送（綠勾）；新建或改過＝未送（琥珀）。
  const badge = drawHtmlEl('span', 'pc-draw-rec-status ' + (row.sent ? 'is-sent' : 'is-unsent'));
  badge.textContent = row.sent ? '✓ 已送' : '● 未送';
  el.appendChild(badge);
  if (onRemove) { // 從佇列移除（目前用於「決定」列）
    const rm = drawHtmlEl('button', 'pc-draw-rec-remove'); rm.textContent = '✕';
    rm.title = '從佇列移除'; rm.setAttribute('aria-label', '從佇列移除');
    rm.onclick = e => { e.stopPropagation(); onRemove(row.id); };
    el.appendChild(rm);
  }
  el.onclick = () => onClick(row.id);
  return el;
}

// AI 方案卡（錨定貼在標注旁）：標題 + 文字 + 可點選項按鈕；已選則顯示「✓ 已選」。
// onChoose(reply, option) 在點選項時呼叫。純函式（位置由呼叫端設 style）。
function replyCardEl(reply, onChoose, onClose) {
  const card = drawHtmlEl('div', 'pc-draw-reply-card');
  card.dataset.n = reply.n;
  const head = drawHtmlEl('div', 'pc-draw-reply-head'); head.textContent = '💬 AI 方案';
  const close = drawHtmlEl('button', 'pc-draw-reply-close'); close.textContent = '✕';
  close.title = '關閉這張方案卡'; close.setAttribute('aria-label', '關閉方案卡');
  close.onclick = () => onClose && onClose(reply);
  head.appendChild(close);
  card.appendChild(head);
  if (reply.text) { const t = drawHtmlEl('div', 'pc-draw-reply-text'); t.textContent = reply.text; card.appendChild(t); }
  const opts = Array.isArray(reply.options) ? reply.options : [];
  // 有 html(真實 UI)/desc(說明)/preview(文字示意) → 圖文卡片式；否則純按鈕。
  const rich = opts.some(o => o.html || o.desc || o.preview);
  if (reply.chosen) {
    const c = drawHtmlEl('div', 'pc-draw-reply-chosen');
    c.textContent = '✓ 已選：' + (reply.chosen.label || reply.chosen.id);
    card.appendChild(c);
  } else if (opts.length) {
    const row = drawHtmlEl('div', 'pc-draw-reply-opts' + (rich ? ' is-rich' : ''));
    opts.forEach(o => {
      const b = drawHtmlEl('div', 'pc-draw-reply-opt');
      if (!rich) { // 純按鈕：整塊可點（向後相容）
        b.setAttribute('role', 'button'); b.setAttribute('tabindex', '0');
        b.textContent = o.label || o.id;
        b.onclick = () => onChoose && onChoose(reply, o);
        row.appendChild(b);
        return;
      }
      const lbl = drawHtmlEl('div', 'pc-draw-reply-opt-label'); lbl.textContent = o.label || o.id; b.appendChild(lbl);
      if (o.desc) { const d = drawHtmlEl('div', 'pc-draw-reply-opt-desc'); d.textContent = o.desc; b.appendChild(d); }
      // html＝真實 UI 畫面：用頁面全域 styles 渲染，長得跟真的一樣（本地單人信任來源，故 innerHTML）。
      // 設 pointer-events:none（CSS）→ 戳 mockup 不會誤觸；用下面「選這個方案」鈕才送出。
      if (o.html) { const m = drawHtmlEl('div', 'pc-draw-reply-mock'); m.innerHTML = o.html; b.appendChild(m); }
      else if (o.preview) { const p = drawHtmlEl('pre', 'pc-draw-reply-preview'); p.textContent = o.preview; b.appendChild(p); }
      const choose = drawHtmlEl('button', 'pc-draw-reply-choose'); choose.textContent = '選這個方案';
      choose.onclick = () => onChoose && onChoose(reply, o); b.appendChild(choose);
      row.appendChild(b);
    });
    card.appendChild(row);
  }
  return card;
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
// 字體大小 popover：用標本文字大小直觀呈現各選項。
function fontSizeMenu(actions) {
  const wrap = drawHtmlEl('div', 'pc-draw-menu');
  const trigger = drawHtmlEl('button', 'pc-draw-tool pc-draw-trigger');
  trigger.dataset.action = 'fontsize-menu';
  trigger.title = '字體大小';
  trigger.setAttribute('aria-label', '字體大小');
  trigger.innerHTML = icon('text');
  trigger.onclick = () => togglePopover(wrap);
  const pop = drawHtmlEl('div', 'pc-draw-popover pc-draw-popover-fontsize');
  pop.dataset.menu = 'fontsize';
  DRAW_FONT_SIZES.forEach(sz => pop.appendChild(fontSizeButton(sz, actions)));
  wrap.appendChild(trigger);
  wrap.appendChild(pop);
  return wrap;
}
function fontSizeButton(sz, actions) {
  const b = drawHtmlEl('button', 'pc-draw-fontsize');
  b.dataset.fontSize = sz;
  b.title = sz + 'px';
  b.setAttribute('aria-label', sz + 'px');
  b.style.cssText = `font-size:${Math.max(sz, 10)}px; padding:1px 6px; line-height:1.3; font-family:system-ui,sans-serif;`;
  b.textContent = 'A';
  b.onclick = () => actions.setFontSize(sz);
  return b;
}

const HEAD_SYMBOL = { none: '—', end: '→', start: '←', both: '↔' };
const HEAD_LABEL = { none: '無箭頭', end: '終點箭頭', start: '起點箭頭', both: '雙向箭頭' };
// 端點箭頭 popover：line/arrow 選無/終點/起點/雙向（雙向＝雙箭頭）。
function headsMenu(actions) {
  const wrap = drawHtmlEl('div', 'pc-draw-menu');
  const trigger = drawHtmlEl('button', 'pc-draw-tool pc-draw-trigger');
  trigger.dataset.action = 'heads-menu';
  trigger.title = '端點箭頭（單／雙向）';
  trigger.setAttribute('aria-label', '端點箭頭');
  trigger.textContent = '↔';
  trigger.onclick = () => togglePopover(wrap);
  const pop = drawHtmlEl('div', 'pc-draw-popover pc-draw-popover-heads');
  pop.dataset.menu = 'heads';
  DRAW_HEAD_MODES.forEach(m => pop.appendChild(headsButton(m, actions)));
  wrap.appendChild(trigger);
  wrap.appendChild(pop);
  return wrap;
}
function headsButton(mode, actions) {
  const b = drawHtmlEl('button', 'pc-draw-heads');
  b.dataset.heads = mode;
  b.title = HEAD_LABEL[mode];
  b.setAttribute('aria-label', HEAD_LABEL[mode]);
  b.style.cssText = 'font-size:16px; padding:2px 8px; line-height:1.2;';
  b.textContent = HEAD_SYMBOL[mode];
  b.onclick = () => actions.setHeads(mode);
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
  bar.querySelectorAll('.pc-draw-fontsize').forEach(b => {
    b.classList.toggle('active', Number(b.dataset.fontSize) === DEFAULT_DRAW_STYLE.fontSize);
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
