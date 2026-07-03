/**
 * draw/constants — 繪圖層共用常數與純資料衍生的小工具（圖示 / 筆刷 / 快捷鍵 / 環境判斷）。
 * 皆無 DOM／closure 依賴，可單獨載入與單測。由 draw-layer.js 聚合後對外 re-export。
 */

// ── 常數 ────────────────────────────────────────────────────────────────────
export const DRAW_MODES = ['note', 'draw', 'off'];
export const DRAW_TOOLS = ['select', 'rect', 'diamond', 'ellipse', 'arrow', 'line', 'pencil', 'text'];
export const DEFAULT_DRAW_STYLE = { color: '#E5484D', strokeWidth: 2, fill: 'none', fontSize: 16 };
// Excalidraw/Figma 風格預設色（8 色）＋ picker 另附 <input type=color> 自訂任意 hex。
export const DRAW_COLORS = ['#1e1e1e', '#e03131', '#2f9e44', '#1971c2', '#f08c00', '#9c36b5', '#0c8599', '#868e96'];

// 繪圖層 chrome（選取疊層 / 紀錄列 / 標籤）的語意色。SVG presentation 屬性吃不到 CSS var()，
// 故渲染端在 JS 集中於此，與 draw/styles.js 的 --pc-* CSS token 同源（值需一致）。
// ⚠️ 與 DRAW_COLORS（使用者筆刷 8 色）分屬兩事：這裡是工具本身的介面色，不是內容色。
export const DRAW_UI_COLORS = {
  selection: '#635a8f',              // 選取框 / marquee / 端點 / 縮放把手（= --pc-accent）
  selectionTint: 'rgba(99,90,143,.08)', // marquee 拖選填色（= --pc-accent-rgb @ .08）
  sent: '#0d7a4f',                   // 已送出決策紀錄列色（= --pc-success）
  labelBg: '#ffffff',                // 標籤底
  labelInk: '#1e1e1e',               // 標籤文字
  onDark: '#e5e7eb',                 // 深色工具列上的線粗示意 dot（= --pc-on-dark）
};
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

export const SVG_NS = 'http://www.w3.org/2000/svg';
export const HANDLE_FIXED = { nw: 'se', ne: 'sw', se: 'nw', sw: 'ne' };

// Material Icons 官方 24px path data（與 MUI 同一套圖示，inline SVG，不引 React/@mui）。
export const ICON_PATHS = {
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
  help: 'M11 18h2v-2h-2v2zm1-16C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm0-14c-2.21 0-4 1.79-4 4h2c0-1.1.9-2 2-2s2 .9 2 2c0 2-3 1.75-3 5h2c0-2.25 3-2.5 3-5 0-2.21-1.79-4-4-4z', // help_outline（使用說明）
  comment: 'M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H5.17L4 17.17V4h16v12z', // chat_bubble_outline（留言模式）
  note: 'M14 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z', // note（便利貼角標）
};

// 一個 Material 圖示 → inline SVG 字串（currentColor → 跟著 active/hover 文字色變化）。
export function icon(name, size = 20) {
  return `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="currentColor" aria-hidden="true"><path d="${ICON_PATHS[name]}"/></svg>`;
}

// 筆刷類型（自由筆 pencil 的 brushType）。
export const DRAW_BRUSHES = ['pen', 'marker', 'highlighter'];
export const BRUSH_LABELS = { pen: '鋼筆', marker: '麥克筆', highlighter: '螢光筆' };
export const BRUSH_ICON = { pen: 'pencil', marker: 'brush', highlighter: 'highlighter' };

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
  c: 'comment', // 指元件留言（無數字鍵；數字 1–8 已滿、9 留給未實作 image）
  i: 'eyedropper',
};
// 工具的中文標籤與主要字母提示（tooltip / aria）。
export const TOOL_LABELS_ZH = { select: '選取', ellipse: '橢圓', arrow: '箭頭', pencil: '自由筆', text: '文字', rect: '矩形', diamond: '菱形', line: '直線', comment: '指元件' };
export const TOOL_KEY = { select: 'V', rect: 'R', diamond: 'D', ellipse: 'O', arrow: 'A', line: 'L', pencil: 'P', text: 'T', comment: 'C' };

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

// localhost / 本機環境判斷（繪圖是 dev-time 工具，只在本機掛入口；線上不顯示）。
export function isLocalEnv(hostname) {
  return hostname === 'localhost' || hostname === '127.0.0.1'
      || hostname === '0.0.0.0' || hostname === '::1' || hostname === '';
}
// enableDraw 解析：'auto'(預設)=只 localhost；true=永遠；false=永不。
export function shouldEnableDraw(mode, hostname) {
  if (mode === true) return true;
  if (mode === false) return false;
  return isLocalEnv(hostname); // 'auto' 或 undefined
}
