/**
 * draw/selectors — P4 結構化匯出：CSS selector 擷取、精簡 JSON export、
 * 標注簽章（sig）與側邊面板 row 資料。純函式（唯一 DOM 依賴為讀取 element 屬性/位置，
 * 無 closure 狀態）。由 draw-layer.js 聚合後對外 re-export。
 */
import { ICON_PATHS } from './constants.js';

// ── P4 結構化匯出（selector 擷取 + 精簡 JSON）────────────────────────────────────
export const ANCHOR_DATA_ATTRS = ['data-testid', 'data-test', 'data-cy', 'data-id'];
export function cssEscape(s) {
  if (typeof CSS !== 'undefined' && CSS.escape) return CSS.escape(s);
  return String(s).replace(/[^a-zA-Z0-9_-]/g, '\\$&'); // node fallback（無 CSS API）
}
export function nthOfType(el) {
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
export const ANNOTATION_TOOL_LABELS = {
  ellipse: '圈選', arrow: '箭頭', line: '直線', rect: '矩形', diamond: '菱形',
  pencil: '手繪', text: '文字', image: '參考圖', comment: '指元件',
};
// 指元件 comment 的畫布外框幾何：每幀用 anchor selector 重解析底層元件 rect（隨元件移位/捲動跟著貼）；
// 無 anchor 或解析失敗（元件消失）→ 退回建立時存的 o.geom。純函式（getRect 注入，可單測）。
export function commentViewGeom(o, getRect) {
  if (o && o.anchor) {
    const r = getRect(o.anchor);
    if (r) return r;
  }
  return o ? o.geom : undefined;
}
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
export function noteSig(n) {
  return JSON.stringify({ text: n.text, sel: n.sel, objId: n.objId, range: n.range });
}
// 程式碼範圍註記的顯示標籤：`path:startLine–endLine`（單行退化成 `path:line`）。
// en-dash（–, U+2013）與 GitHub 行號範圍一致。純函式，供標注紀錄列與卡片標題共用。
export function rangeLabel(range) {
  if (!range || range.path == null) return null;
  const { path, startLine, endLine } = range;
  return endLine != null && endLine !== startLine
    ? `${path}:${startLine}–${endLine}`
    : `${path}:${startLine}`;
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
      archived: !!o.hidden, // 送出後收納中（畫布隱藏）→ 面板顯示「還原到畫布」
      groupId: o.groupId || null,
    };
  });
}
