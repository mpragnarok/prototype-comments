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

// initDrawLayer 的實作已移至 draw/init-draw-layer.js；此檔為 CDN 入口的聚合層（barrel）：
// 對外 re-export initDrawLayer 與各純函式模組的 public 匯出面（consumer / 單元測試依賴此表面不變）。
export { initDrawLayer } from './draw/init-draw-layer.js';

// 對外 re-export：保持 draw-layer.js 的 public 匯出面不變（consumer / 單元測試依賴）。
export {
  DRAW_MODES, DRAW_TOOLS, DEFAULT_DRAW_STYLE, DRAW_COLORS, DRAW_STROKE_WIDTHS,
  DRAW_FONT_SIZES, DRAW_HEAD_MODES, arrowHeads, MIN_DRAW_SIZE_PCT,
  DRAW_BRUSHES, BRUSH_RENDER, brushStyle,
  TOOL_SHORTCUTS, resolveShortcut, resolveShortcutByCode,
  isLocalEnv, shouldEnableDraw,
} from './draw/constants.js';

export {
  pxToPct, pctToPx, clientToPct, rectFromPoints, diamondPoints, imageGeom,
  geomFromDrag, freehandPath, taperScale, outlineWidths, taperedOutline, geomBBox,
  labelAnchor, translateGeom, remapGeom, resizeBBox, setEndpoint, SNAP_THRESHOLD_PCT,
  rectAnchorPoints, nearestPointOnRect, objectSnapPoints, nearestSnap, anchorRel, resolveAnchorPoint,
  resolveEndpoints, mergeEndAnchor, assignGroupId, clearGroupId, expandSelectionToGroups, groupMembers,
  rectsIntersect, marqueeSelect, distPointToSegment, polylineDist, pointNearPolyline, objHitDist,
  pointHitsObject,
} from './draw/geometry.js';

export {
  cssSelectorFor, buildExport, commentViewGeom, annotationSig, decisionSig, noteSig,
  annotationRows,
} from './draw/selectors.js';

export {
  reorderIds, reorderMany, applyStylePatch, eyedropperSupported, applyCommand, invertCommand,
  makeUndoStack, bumpIdSeq, makeDrawObject, serializeDrawObject, serializeObjectsForLocal, hydrateObjectsFromLocal,
  drawingToDoc,
} from './draw/model.js';
