/**
 * draw/model — 繪圖物件的資料模型與純資料運算：z-order 重排、樣式套用、
 * command apply/invert 與 undo/redo 堆疊、物件 id 產生、序列化／反序列化（含 Firestore drawingToDoc）。
 * 無 DOM／無 closure 依賴，可單測。由 draw-layer.js 聚合後對外 re-export。
 */
import { DEFAULT_DRAW_STYLE } from './constants.js';

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
export function shiftGroup(ids, selSet, dir) {
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

export function reindexByIds(objects, ids) {
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

export function normalizeStyle(style = {}) {
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

export let _idSeq = 0;
export function nextDrawId() { return 'd' + (++_idSeq); }
export function nextGroupId() { return 'g' + (++_idSeq); }
// 還原既有資料（localStorage / 團隊同步）後，把計數器推進到已用過的最大序號，
// 避免新物件 / 新註記拿到與還原物件相同的 id（撞 id → 兩列共用 sendUnchecked/selection，
// 表現為「勾一個全選」「新增註記自動被群組」）。接受 id 與 groupId 字串陣列。
export function bumpIdSeq(ids) {
  for (const id of ids) {
    const m = /^[dg](\d+)$/.exec(String(id));
    if (m && +m[1] > _idSeq) _idSeq = +m[1];
  }
}

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
