/**
 * draw/geometry — 座標換算、幾何 bbox/平移/縮放重映射、自由筆平滑、端點吸附、
 * 群組運算、marquee 與命中測試（hit-test）。皆為無 DOM／無 closure 的純函式，
 * 沿用 viewport-% 座標慣例，可單測。由 draw-layer.js 聚合後對外 re-export。
 */
import { MIN_DRAW_SIZE_PCT, HANDLE_FIXED } from './constants.js';

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
  // 單一參考軸：px → % 兩軸皆除以「寬」（與 render 一致）；置中用真實畫布中心 px。
  const wPx = natW * scale, hPx = natH * scale;
  const wPct = (wPx / CW) * 100;
  const hPct = (hPx / CW) * 100;
  const cxPx = atPoint ? (atPoint.x / 100) * CW : CW / 2;
  const cyPx = atPoint ? (atPoint.y / 100) * CW : CH / 2;
  const fullH = (CH / CW) * 100; // 可視畫布高在「寬-%」下的範圍
  let x = ((cxPx - wPx / 2) / CW) * 100;
  let y = ((cyPx - hPx / 2) / CW) * 100;
  x = Math.max(0, Math.min(x, 100 - wPct));        // 夾進畫布（寬）
  y = Math.max(0, Math.min(y, fullH - hPct));      // 夾進可視畫布（高）
  return { x: r2(x), y: r2(y), w: r2(wPct), h: r2(hPct) };
}
// 一次拖曳（起點 a、終點 b）→ 某工具的幾何（box 類 / 端點類）。pencil 另走累點邏輯。
export function geomFromDrag(tool, a, b) {
  if (tool === 'ellipse' || tool === 'rect' || tool === 'diamond') return rectFromPoints(a, b);
  if (tool === 'arrow' || tool === 'line') return { from: { ...a }, to: { ...b } };
  return { x: b.x, y: b.y }; // text 等：落點即位置
}

// 抽稀：丟掉與上一個保留點距離 < minDist 的密集點（保留首尾），讓平滑曲線乾淨。
export function thinPoints(points, minDist) {
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
export function pointDir(pts, i) {
  const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const m = Math.hypot(dx, dy) || 1;
  return { x: dx / m, y: dy / m };
}

// 任一物件 → 其 % bounding box（選取框 / 命中測試 / 縮放重映射用）。
// resolve(o)（選用）：回傳 arrow/line 解析後端點 {from,to}（el/obj anchor）。不傳則用 geom。
export function geomBBox(o, resolve) {
  const g = o.geom;
  if (!g) return { x: 0, y: 0, w: 0, h: 0 }; // 防呆：非繪圖 doc（無 geom）→ 空框，不參與命中/標籤定位（避免讀 g.x crash）
  if (o.tool === 'ellipse' || o.tool === 'rect' || o.tool === 'diamond' || o.tool === 'image') return { x: g.x, y: g.y, w: g.w, h: g.h };
  if (o.tool === 'arrow' || o.tool === 'line') { const e = resolve ? resolve(o) : g; return rectFromPoints(e.from, e.to); }
  if (o.tool === 'pencil') {
    const xs = g.points.map(p => p[0]), ys = g.points.map(p => p[1]);
    const x = Math.min(...xs), y = Math.min(...ys);
    return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
  }
  if (o.tool === 'comment') return { x: g.x, y: g.y, w: g.w || 0, h: g.h || 0 }; // [fix2] 元件外框尺寸，不套 text 小框估算
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

export function boxCorner(box, name) {
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
export const SNAP_SHAPE_TOOLS = ['rect', 'ellipse', 'diamond', 'image'];
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
export function resolveOneEnd(o, which, getRectPct, objects, seen) {
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
export function polygonDist(p, pts) {
  let m = Infinity;
  for (let i = 0; i < pts.length; i++) m = Math.min(m, distPointToSegment(p, pts[i], pts[(i + 1) % pts.length]));
  return m;
}
export function pointNearPolygon(p, pts, tol) { return polygonDist(p, pts) <= tol; }
// 點到橢圓外框的近似距離（radial 偏離 1 換回 % 距離）。
export function ellipseOutlineDist(p, b) {
  const cx = b.x + b.w / 2, cy = b.y + b.h / 2, rx = b.w / 2, ry = b.h / 2;
  if (rx <= 0 || ry <= 0) return Math.hypot(p.x - cx, p.y - cy);
  const k = Math.hypot((p.x - cx) / rx, (p.y - cy) / ry); // =1 在外框上
  return Math.abs(k - 1) * Math.min(rx, ry);
}
export function pointNearEllipseOutline(p, b, tol) { return ellipseOutlineDist(p, b) <= tol; }
// 外框形狀（fill:none 的 rect/diamond）的外框頂點。
export function shapeOutlinePts(o, b) {
  return o.tool === 'diamond'
    ? [{ x: b.x + b.w / 2, y: b.y }, { x: b.x + b.w, y: b.y + b.h / 2 }, { x: b.x + b.w / 2, y: b.y + b.h }, { x: b.x, y: b.y + b.h / 2 }]
    : [{ x: b.x, y: b.y }, { x: b.x + b.w, y: b.y }, { x: b.x + b.w, y: b.y + b.h }, { x: b.x, y: b.y + b.h }];
}
export function isOutlinedShape(o) {
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
