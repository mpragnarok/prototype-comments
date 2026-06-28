// test/draw-layer.unit.spec.js — 純函式單測（無 DOM；node 直跑）
//
//   node test/draw-layer.unit.spec.js
//
// 對象：px↔% 換算（pxToPct/pctToPx/clientToPct/rectFromPoints）與 DrawObject
// 組裝/序列化（makeDrawObject/serializeDrawObject）。座標慣例對齊 src/index.js
// overlay click：x% = (clientX-rect.left)/rect.width*100，toFixed(2)。
import {
  pxToPct, pctToPx, clientToPct, rectFromPoints,
  makeDrawObject, serializeDrawObject, drawingToDoc,
  serializeObjectsForLocal, hydrateObjectsFromLocal,
  geomFromDrag, geomBBox, translateGeom, remapGeom, resizeBBox, freehandPath, diamondPoints, labelAnchor, imageGeom,
  cssSelectorFor, buildExport, annotationRows,
  taperScale, outlineWidths, taperedOutline, brushStyle, DRAW_BRUSHES,
  TOOL_SHORTCUTS, resolveShortcut,
  reorderIds, reorderMany, rectsIntersect, marqueeSelect, applyStylePatch, eyedropperSupported,
  distPointToSegment, pointNearPolyline, pointHitsObject,
  applyCommand, invertCommand, makeUndoStack,
  DEFAULT_DRAW_STYLE, DRAW_MODES, DRAW_TOOLS, MIN_DRAW_SIZE_PCT,
  DRAW_FONT_SIZES,
  DRAW_HEAD_MODES, arrowHeads,
  setEndpoint,
  assignGroupId, clearGroupId, expandSelectionToGroups, groupMembers,
  rectAnchorPoints, nearestPointOnRect, objectSnapPoints, nearestSnap,
  anchorRel, resolveAnchorPoint, resolveEndpoints, mergeEndAnchor, SNAP_THRESHOLD_PCT,
} from '../src/draw-layer.js';

let pass = 0, fail = 0;
function test(name, fn) {
  try { fn(); console.log('  ✓', name); pass++; }
  catch (e) { console.error('  ✗', name, '\n     ', e.message); fail++; }
}
function assert(cond, msg) { if (!cond) throw new Error(msg || 'assertion failed'); }
function eq(a, b, msg) { assert(a === b, (msg || '') + ` — expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`); }
function close(a, b, msg) { assert(Math.abs(a - b) < 1e-6, (msg || '') + ` — expected ≈${b}, got ${a}`); }

console.log('draw-layer unit (pure fns):');

// ── pxToPct ──────────────────────────────────────────────────────────────────
test('pxToPct: 半寬 → 50%', () => eq(pxToPct(200, 400), 50));
test('pxToPct: 0 寬度 → 0（防除以零）', () => eq(pxToPct(120, 0), 0));
test('pxToPct: 四捨五入到 2 位（對齊 index.js toFixed(2)）', () => eq(pxToPct(100, 300), 33.33));

// ── pctToPx ──────────────────────────────────────────────────────────────────
test('pctToPx: 50% → 半寬', () => eq(pctToPx(50, 400), 200));
test('pctToPx ∘ pxToPct round-trip（誤差來自 2 位捨入）', () => close(pctToPx(pxToPct(150, 400), 400), 150));

// ── clientToPct ──────────────────────────────────────────────────────────────
test('clientToPct: 扣掉 rect 原點換成 %', () => {
  const rect = { left: 100, top: 50, width: 400, height: 200 };
  const p = clientToPct(300, 150, rect);
  eq(p.x, 50, 'x'); eq(p.y, 50, 'y');
});

// ── rectFromPoints ───────────────────────────────────────────────────────────
test('rectFromPoints: 任意兩點 → 正規化 bounding box', () => {
  const r = rectFromPoints({ x: 80, y: 60 }, { x: 20, y: 10 });
  eq(r.x, 20); eq(r.y, 10); eq(r.w, 60); eq(r.h, 50);
});

// ── makeDrawObject ───────────────────────────────────────────────────────────
test('makeDrawObject: 補上預設 style + 自動 id', () => {
  const o = makeDrawObject({ tool: 'ellipse', geom: { x: 1, y: 2, w: 3, h: 4 } });
  eq(o.tool, 'ellipse');
  eq(o.style.color, DEFAULT_DRAW_STYLE.color);
  eq(o.style.strokeWidth, DEFAULT_DRAW_STYLE.strokeWidth);
  eq(o.style.fill, DEFAULT_DRAW_STYLE.fill);
  assert(typeof o.id === 'string' && o.id.length > 0, 'id 應自動產生');
  assert(!('text' in o), 'ellipse 不應有 text 欄位');
});
test('makeDrawObject: style 覆寫 + text 工具帶 text', () => {
  const o = makeDrawObject({ id: 'x1', tool: 'text', geom: { x: 5, y: 5 }, text: '對齊', style: { color: '#00f' } });
  eq(o.id, 'x1');
  eq(o.style.color, '#00f');
  eq(o.style.strokeWidth, DEFAULT_DRAW_STYLE.strokeWidth, '未覆寫者沿用預設');
  eq(o.text, '對齊');
});
test('makeDrawObject: id 唯一遞增', () => {
  const a = makeDrawObject({ tool: 'arrow', geom: {} });
  const b = makeDrawObject({ tool: 'arrow', geom: {} });
  assert(a.id !== b.id, 'id 應不重複');
});

// ── serializeDrawObject ──────────────────────────────────────────────────────
test('serializeDrawObject: 精簡形狀（id/tool/geom/style），無 text 不含 text', () => {
  const o = makeDrawObject({ id: 's1', tool: 'pencil', geom: { points: [[1, 2], [3, 4]] } });
  const j = serializeDrawObject(o);
  eq(JSON.stringify(j), JSON.stringify({ id: 's1', tool: 'pencil', geom: { points: [[1, 2], [3, 4]] }, style: DEFAULT_DRAW_STYLE }));
});
test('serializeDrawObject: text 工具保留 text', () => {
  const o = makeDrawObject({ id: 's2', tool: 'text', geom: { x: 1, y: 1 }, text: 'hi' });
  eq(serializeDrawObject(o).text, 'hi');
});

// ── P7 drawingToDoc（團隊模式 Firestore 向量序列化；純函式）─────────────────────────
test('drawingToDoc: 保留向量欄位（id/tool/geom/style），round-trip geom/style', () => {
  const o = makeDrawObject({ id: 'd1', tool: 'rect', geom: { x: 1, y: 2, w: 3, h: 4 }, style: { color: '#e03131', strokeWidth: 4 } });
  const doc = drawingToDoc(o);
  eq(doc.id, 'd1'); eq(doc.tool, 'rect');
  eq(JSON.stringify(doc.geom), JSON.stringify({ x: 1, y: 2, w: 3, h: 4 }), 'geom round-trip');
  eq(doc.style.color, '#e03131'); eq(doc.style.strokeWidth, 4);
});
test('drawingToDoc: text/label/anchor 一併輸出（皆向量、可 round-trip）', () => {
  const o = { id: 'd2', tool: 'arrow', geom: { from: { x: 0, y: 0 }, to: { x: 5, y: 5 } }, style: { color: '#1971c2' }, text: '對齊', label: '右欄', anchor: '#price-card' };
  const doc = drawingToDoc(o);
  eq(doc.text, '對齊'); eq(doc.label, '右欄'); eq(doc.anchor, '#price-card');
  eq(JSON.stringify(doc.geom), JSON.stringify(o.geom), 'arrow geom round-trip');
});
test('drawingToDoc: image 物件 → doc 不含 imageRef / dataURL（PNG 永不進 Firestore）', () => {
  const o = makeDrawObject({ id: 'im1', tool: 'image', geom: { x: 0, y: 0, w: 30, h: 20 }, imageRef: 'data:image/png;base64,AAAA' });
  const doc = drawingToDoc(o);
  assert(!('imageRef' in doc), 'doc 不應含 imageRef');
  const json = JSON.stringify(doc);
  assert(!/dataURL|data:image|base64|AAAA/.test(json), `doc 不應出現任何 dataURL，實際 ${json}`);
  eq(doc.id, 'im1'); eq(doc.tool, 'image'); // 仍保留向量 meta（geom/style）
  eq(JSON.stringify(doc.geom), JSON.stringify({ x: 0, y: 0, w: 30, h: 20 }));
});
test('drawingToDoc: 省略未設欄位（無 text/label/anchor 不出現）', () => {
  const doc = drawingToDoc(makeDrawObject({ id: 'd3', tool: 'ellipse', geom: { x: 0, y: 0, w: 5, h: 5 } }));
  assert(!('text' in doc) && !('label' in doc) && !('anchor' in doc), '未設欄位不應出現');
});
test('drawingToDoc: z-order 一併輸出（已戳 z 時）', () => {
  const doc = drawingToDoc({ id: 'd4', tool: 'rect', geom: {}, style: {}, z: 3 });
  eq(doc.z, 3);
});

// ── 常數 sanity ──────────────────────────────────────────────────────────────
test('模式/工具常數完整（含 P2 rect/line）', () => {
  ['comment', 'draw', 'off'].forEach(m => assert(DRAW_MODES.includes(m), m));
  ['select', 'ellipse', 'arrow', 'pencil', 'text', 'rect', 'line'].forEach(t => assert(DRAW_TOOLS.includes(t), t));
});

// ── P2 geomFromDrag（rect/line 拖曳幾何）────────────────────────────────────────
test('geomFromDrag: rect → 正規化 bounding box（兩點任意序）', () => {
  const g = geomFromDrag('rect', { x: 60, y: 50 }, { x: 10, y: 20 });
  eq(g.x, 10); eq(g.y, 20); eq(g.w, 50); eq(g.h, 30);
});
test('geomFromDrag: line → from/to 端點（保序、深拷貝）', () => {
  const a = { x: 5, y: 6 }, b = { x: 9, y: 2 };
  const g = geomFromDrag('line', a, b);
  eq(g.from.x, 5); eq(g.from.y, 6); eq(g.to.x, 9); eq(g.to.y, 2);
  a.x = 99; eq(g.from.x, 5, 'geomFromDrag 不應持有入參 ref');
});
test('geomFromDrag: ellipse/arrow 與 rect/line 共用同邏輯', () => {
  eq(JSON.stringify(geomFromDrag('ellipse', { x: 0, y: 0 }, { x: 4, y: 6 })), JSON.stringify({ x: 0, y: 0, w: 4, h: 6 }));
  const ar = geomFromDrag('arrow', { x: 1, y: 1 }, { x: 2, y: 3 });
  eq(ar.to.y, 3);
});

// ── P2 geomBBox ───────────────────────────────────────────────────────────────
test('geomBBox: rect/ellipse 直接回 geom box', () => {
  const b = geomBBox({ tool: 'rect', geom: { x: 10, y: 20, w: 30, h: 40 } });
  eq(b.x, 10); eq(b.y, 20); eq(b.w, 30); eq(b.h, 40);
});
test('geomBBox: line 由 from/to 正規化', () => {
  const b = geomBBox({ tool: 'line', geom: { from: { x: 30, y: 5 }, to: { x: 10, y: 25 } } });
  eq(b.x, 10); eq(b.y, 5); eq(b.w, 20); eq(b.h, 20);
});
test('geomBBox: pencil 取所有點的外接框', () => {
  const b = geomBBox({ tool: 'pencil', geom: { points: [[10, 10], [30, 5], [20, 40]] } });
  eq(b.x, 10); eq(b.y, 5); eq(b.w, 20); eq(b.h, 35);
});

// ── P2 translateGeom（移動）─────────────────────────────────────────────────────
test('translateGeom: rect 平移 x/y、保留 w/h', () => {
  const g = translateGeom({ tool: 'rect', geom: { x: 10, y: 10, w: 5, h: 5 } }, 3, -2);
  eq(g.x, 13); eq(g.y, 8); eq(g.w, 5); eq(g.h, 5);
});
test('translateGeom: line 兩端同步平移', () => {
  const g = translateGeom({ tool: 'line', geom: { from: { x: 0, y: 0 }, to: { x: 10, y: 10 } } }, 5, 5);
  eq(g.from.x, 5); eq(g.to.x, 15); eq(g.to.y, 15);
});
test('translateGeom: pencil 每點平移', () => {
  const g = translateGeom({ tool: 'pencil', geom: { points: [[1, 1], [2, 2]] } }, 1, 1);
  eq(JSON.stringify(g.points), JSON.stringify([[2, 2], [3, 3]]));
});

// ── P2 remapGeom + resizeBBox（縮放 + 最小尺寸夾制）──────────────────────────────
test('remapGeom: rect 重映射到新 box', () => {
  const g = remapGeom({ tool: 'rect', geom: { x: 0, y: 0, w: 10, h: 10 } }, { x: 0, y: 0, w: 10, h: 10 }, { x: 5, y: 5, w: 20, h: 30 });
  eq(g.x, 5); eq(g.y, 5); eq(g.w, 20); eq(g.h, 30);
});
test('remapGeom: line 端點等比映射（放大兩倍）', () => {
  const g = remapGeom({ tool: 'line', geom: { from: { x: 0, y: 0 }, to: { x: 10, y: 10 } } }, { x: 0, y: 0, w: 10, h: 10 }, { x: 0, y: 0, w: 20, h: 20 });
  eq(g.from.x, 0); eq(g.to.x, 20); eq(g.to.y, 20);
});
test('resizeBBox: 拖 se 角 → 對角(nw)固定、新尺寸', () => {
  const b = resizeBBox({ x: 10, y: 10, w: 20, h: 20 }, 'se', { x: 40, y: 50 });
  eq(b.x, 10); eq(b.y, 10); eq(b.w, 30); eq(b.h, 40);
});
test('resizeBBox: 過小拖曳 → 夾到 MIN_DRAW_SIZE_PCT', () => {
  const b = resizeBBox({ x: 10, y: 10, w: 20, h: 20 }, 'se', { x: 10.1, y: 10.1 });
  assert(b.w >= MIN_DRAW_SIZE_PCT, `w 應 >= ${MIN_DRAW_SIZE_PCT}，實際 ${b.w}`);
  assert(b.h >= MIN_DRAW_SIZE_PCT, `h 應 >= ${MIN_DRAW_SIZE_PCT}，實際 ${b.h}`);
});

// ── P2 freehandPath（自由筆平滑：點 → SVG path d）──────────────────────────────
test('freehandPath: 0 點 → 空字串', () => eq(freehandPath([]), ''));
test('freehandPath: 1 點 → 只有 M（round cap 顯示一點）', () => {
  const d = freehandPath([[10, 20]]);
  assert(/^M /.test(d), `應以 M 起頭，實際 ${d}`);
  assert(!/[QCL]/.test(d), `單點不應有曲線/線段指令，實際 ${d}`);
});
test('freehandPath: 2 點 → M … L（直線）', () => {
  const d = freehandPath([[0, 0], [10, 10]]);
  assert(/^M 0 0 L 10 10$/.test(d), `兩點應為直線，實際 ${d}`);
});
test('freehandPath: >=3 點 → 起 M、含 Q 二次曲線、收 L', () => {
  const d = freehandPath([[0, 0], [10, 0], [20, 10], [30, 0]], 0); // minDist=0 不抽稀
  assert(d.startsWith('M 0 0'), `應 M 起頭，實際 ${d}`);
  assert(d.includes(' Q '), `應含 Q 二次貝茲指令，實際 ${d}`);
  assert(/ L [\d.]+ [\d.]+$/.test(d), `應以 L 收到最後一點，實際 ${d}`);
  // 控制點為採樣點、端點為中點：第一段 Q 控制 (10,0)、端點為 (10,0)與(20,10)的中點 (15,5)
  assert(d.includes('Q 10 0 15 5'), `中點平滑公式不符，實際 ${d}`);
});
test('freehandPath: 密集點抽稀（< minDist 丟棄，保留首尾）', () => {
  // 一串近乎重疊的點 + 一個遠點；minDist=1.5 → 只剩首、遠點、尾
  const dense = [[0, 0], [0.2, 0], [0.4, 0], [50, 0], [50, 0.1]];
  const d = freehandPath(dense, 1.5);
  assert(d.startsWith('M 0 0'), `首點保留，實際 ${d}`);
  assert(d.includes('50'), `遠點應保留，實際 ${d}`);
});
test('freehandPath: 不改入參（純函式）', () => {
  const src = [[1, 1], [2, 2], [3, 3]];
  const copy = JSON.stringify(src);
  freehandPath(src);
  eq(JSON.stringify(src), copy, 'freehandPath 不應改動入參');
});

// ── P2 reorderIds（z-order 純重排）──────────────────────────────────────────────
test('reorderIds: front → 移到陣列尾（最上層）', () => {
  eq(JSON.stringify(reorderIds(['a', 'b', 'c'], 'a', 'front')), JSON.stringify(['b', 'c', 'a']));
});
test('reorderIds: back → 移到陣列頭（最底層）', () => {
  eq(JSON.stringify(reorderIds(['a', 'b', 'c'], 'c', 'back')), JSON.stringify(['c', 'a', 'b']));
});
test('reorderIds: forward → 與後一個交換', () => {
  eq(JSON.stringify(reorderIds(['a', 'b', 'c'], 'a', 'forward')), JSON.stringify(['b', 'a', 'c']));
});
test('reorderIds: backward → 與前一個交換', () => {
  eq(JSON.stringify(reorderIds(['a', 'b', 'c'], 'c', 'backward')), JSON.stringify(['a', 'c', 'b']));
});
test('reorderIds: 不存在的 id → 原序回傳（新陣列）', () => {
  const src = ['a', 'b'];
  const out = reorderIds(src, 'z', 'front');
  eq(JSON.stringify(out), JSON.stringify(['a', 'b']));
  assert(out !== src, '應回傳新陣列');
});

// ── 鍵盤快捷鍵：TOOL_SHORTCUTS / resolveShortcut ─────────────────────────────────
test('TOOL_SHORTCUTS: 每個工具都可達（含數字+字母）', () => {
  const reachable = new Set(Object.values(TOOL_SHORTCUTS));
  DRAW_TOOLS.forEach(t => assert(reachable.has(t), `工具 ${t} 應有快捷鍵`));
  assert(reachable.has('eyedropper'), 'eyedropper 應可達');
});
test('TOOL_SHORTCUTS: 期望的數字+字母對映（含 diamond 3/D）', () => {
  const expect = { 1: 'select', v: 'select', 2: 'rect', r: 'rect', 3: 'diamond', d: 'diamond', 4: 'ellipse', o: 'ellipse', 5: 'arrow', a: 'arrow', 6: 'line', l: 'line', 7: 'pencil', p: 'pencil', 8: 'text', t: 'text', i: 'eyedropper' };
  Object.entries(expect).forEach(([k, v]) => eq(TOOL_SHORTCUTS[k], v, `key ${k}`));
});
test('TOOL_SHORTCUTS: 數字 1-8 連續對應工具列順序（無缺號）', () => {
  const byNum = { 1: 'select', 2: 'rect', 3: 'diamond', 4: 'ellipse', 5: 'arrow', 6: 'line', 7: 'pencil', 8: 'text' };
  for (let n = 1; n <= 8; n++) eq(TOOL_SHORTCUTS[n], byNum[n], `數字 ${n}`);
});
test('TOOL_SHORTCUTS: 無重複/衝突的鍵（key 唯一）', () => {
  const keys = Object.keys(TOOL_SHORTCUTS);
  eq(keys.length, new Set(keys).size, 'key 不應重複');
});
test('resolveShortcut: 大小寫不敏感 + 未知/null → null', () => {
  eq(resolveShortcut('o'), 'ellipse');
  eq(resolveShortcut('O'), 'ellipse');
  eq(resolveShortcut('7'), 'pencil');
  eq(resolveShortcut('v'), 'select');
  eq(resolveShortcut('i'), 'eyedropper');
  eq(resolveShortcut('z'), null, 'z 是 undo、非工具');
  eq(resolveShortcut('3'), 'diamond', '3 → diamond');
  eq(resolveShortcut('d'), 'diamond', 'd → diamond');
  eq(resolveShortcut('9'), null, 'image 尚未實作');
  eq(resolveShortcut(null), null);
});

// ── Change 2/3: 筆刷 brushStyle + serialize + 漸細外框 ───────────────────────────
test('brushStyle: pen/marker 為填充、highlighter 半透明描邊', () => {
  assert(brushStyle('pen').fill === true && brushStyle('pen').opacity === 1, 'pen 不透明填充');
  assert(brushStyle('marker').fill === true, 'marker 填充');
  const h = brushStyle('highlighter');
  assert(h.fill === false, 'highlighter 描邊');
  assert(h.opacity >= 0.35 && h.opacity <= 0.45, `highlighter opacity 約 0.35–0.45，實際 ${h.opacity}`);
  assert(h.blend === 'multiply', 'highlighter 用 multiply');
});
test('brushStyle: 未知筆刷 → 退回 pen', () => eq(brushStyle('???'), brushStyle('pen')));
test('DRAW_BRUSHES 常數齊全', () => ['pen', 'marker', 'highlighter'].forEach(t => assert(DRAW_BRUSHES.includes(t), t)));
test('serialize: 自由筆帶 brushType（style.brushType）', () => {
  const o = makeDrawObject({ id: 'p1', tool: 'pencil', geom: { points: [[1, 1], [2, 2]] }, style: { brushType: 'marker' } });
  eq(o.style.brushType, 'marker');
  eq(serializeDrawObject(o).style.brushType, 'marker', 'serialize 應含 brushType');
});

// ── Change 1: diamond 工具 ──────────────────────────────────────────────────────
test('diamondPoints: 內接 bbox 的四頂點（上右下左中點）', () => {
  const pts = diamondPoints({ x: 0, y: 0, w: 20, h: 10 });
  eq(JSON.stringify(pts), JSON.stringify([[10, 0], [20, 5], [10, 10], [0, 5]]));
});
test('diamond: geomFromDrag / geomBBox / 平移 與 rect 同邏輯', () => {
  eq(JSON.stringify(geomFromDrag('diamond', { x: 60, y: 50 }, { x: 10, y: 20 })), JSON.stringify({ x: 10, y: 20, w: 50, h: 30 }));
  const b = geomBBox({ tool: 'diamond', geom: { x: 3, y: 4, w: 5, h: 6 } });
  eq(JSON.stringify(b), JSON.stringify({ x: 3, y: 4, w: 5, h: 6 }));
  const t = translateGeom({ tool: 'diamond', geom: { x: 1, y: 1, w: 2, h: 2 } }, 5, 5);
  eq(t.x, 6); eq(t.y, 6); eq(t.w, 2);
});
test('diamond: DRAW_TOOLS 含 diamond、serialize 保留 tool', () => {
  assert(DRAW_TOOLS.includes('diamond'), 'DRAW_TOOLS 應含 diamond');
  const o = makeDrawObject({ id: 'dm1', tool: 'diamond', geom: { x: 1, y: 1, w: 4, h: 4 } });
  eq(serializeDrawObject(o).tool, 'diamond');
});

// ── P3 貼圖 image：imageGeom 尺寸 + serialize imageRef + box 幾何 ──────────────────
test('imageGeom: 大圖等比縮到 ≤60% 畫布、置中', () => {
  const g = imageGeom(1200, 800, 600, 400); // 自然 200%×200% → 縮到 60%
  // 視覺像素長寬比應 = 1200/800 = 1.5
  const wpx = g.w / 100 * 600, hpx = g.h / 100 * 400;
  close(wpx / hpx, 1200 / 800, '像素長寬比應保留');
  assert(g.w <= 60 + 1e-6 && g.h <= 60 + 1e-6, `應 ≤60% 畫布，實際 ${g.w}×${g.h}`);
  close(g.x + g.w / 2, 50, '水平置中'); close(g.y + g.h / 2, 50, '垂直置中');
});
test('imageGeom: 非等比畫布也保留像素長寬比（正方形圖）', () => {
  const g = imageGeom(800, 800, 600, 400); // 正方形圖，畫布非正方
  const wpx = g.w / 100 * 600, hpx = g.h / 100 * 400;
  close(wpx, hpx, '正方形圖應渲染成正方形像素');
  assert(hpx <= 0.6 * 400 + 1e-6, `高度受 60% 高限制，實際 ${hpx}`);
});
test('imageGeom: 小圖不放大（scale=1）', () => {
  const g = imageGeom(60, 40, 600, 400); // 自然 10%×10%，遠小於 60%
  eq(g.w, 10); eq(g.h, 10);
});
test('imageGeom: atPoint → 以該點為中心並夾進畫布', () => {
  const g = imageGeom(120, 80, 600, 400, { x: 5, y: 5 }); // 想置中於(5,5)，但會被夾住不出界
  assert(g.x >= 0 && g.y >= 0 && g.x + g.w <= 100 + 1e-6 && g.y + g.h <= 100 + 1e-6, '不應超出畫布');
  const mid = imageGeom(120, 80, 600, 400, { x: 50, y: 50 });
  close(mid.x + mid.w / 2, 50); close(mid.y + mid.h / 2, 50, '畫布內的點 → 真正以該點為中心');
});
test('image: makeDrawObject 帶 imageRef、serialize 一併輸出', () => {
  const o = makeDrawObject({ id: 'im1', tool: 'image', geom: { x: 0, y: 0, w: 30, h: 20 }, imageRef: 'data:image/png;base64,AAA' });
  eq(o.imageRef, 'data:image/png;base64,AAA');
  eq(serializeDrawObject(o).imageRef, 'data:image/png;base64,AAA', 'serialize 應含 imageRef');
});
test('image: 走 box 幾何（geomBBox / translateGeom / remapGeom）', () => {
  const o = { tool: 'image', geom: { x: 10, y: 10, w: 30, h: 20 }, imageRef: 'x' };
  eq(JSON.stringify(geomBBox(o)), JSON.stringify({ x: 10, y: 10, w: 30, h: 20 }));
  const t = translateGeom(o, 5, 7); eq(t.x, 15); eq(t.y, 17); eq(t.w, 30);
  const r = remapGeom(o, { x: 10, y: 10, w: 30, h: 20 }, { x: 0, y: 0, w: 60, h: 40 });
  eq(JSON.stringify(r), JSON.stringify({ x: 0, y: 0, w: 60, h: 40 }), 'resize 重映射');
});

// ── P4 cssSelectorFor（用 fake DOM 節點驗 selector 字串；round-trip 在 e2e 真 DOM 驗）────
function fakeEl(tag, opts = {}) {
  const e = {
    tagName: tag.toUpperCase(), id: opts.id || '', _attrs: opts.attrs || {},
    getAttribute(k) { return this._attrs[k] != null ? this._attrs[k] : null; },
    parentElement: null, children: [],
  };
  if (opts.parent) { opts.parent.children.push(e); e.parentElement = opts.parent; }
  return e;
}
test('cssSelectorFor: id → #id（優先）', () => {
  eq(cssSelectorFor(fakeEl('div', { id: 'price-card', attrs: { 'data-testid': 'x' } })), '#price-card');
});
test('cssSelectorFor: 無 id → data-testid', () => {
  eq(cssSelectorFor(fakeEl('div', { attrs: { 'data-testid': 'sidebar' } })), '[data-testid="sidebar"]');
});
test('cssSelectorFor: 退回 nth-of-type 路徑（停在最近的 id 祖先）', () => {
  const root = fakeEl('div', { id: 'root' });
  const sec = fakeEl('section', { parent: root });
  fakeEl('span', { parent: sec });               // span #1
  const s2 = fakeEl('span', { parent: sec });    // span #2
  eq(cssSelectorFor(s2), '#root > section > span:nth-of-type(2)');
});
test('cssSelectorFor: 單一同類子元素 → 不加 nth-of-type', () => {
  const root = fakeEl('main', { id: 'app' });
  const only = fakeEl('header', { parent: root });
  eq(cssSelectorFor(only), '#app > header');
});
test('cssSelectorFor: null/非元素 → null', () => {
  eq(cssSelectorFor(null), null);
  eq(cssSelectorFor({}), null);
});

// ── P4 buildExport（精簡結構化 JSON）───────────────────────────────────────────────
test('buildExport: 形狀含 selector(anchor)/text(label)/color/geom，省略 null', () => {
  const objs = [
    { id: 'a', tool: 'ellipse', anchor: '#price-card', label: '對齊右欄', style: { color: '#e03131' }, geom: { x: 1, y: 2, w: 3, h: 4 } },
    { id: 'b', tool: 'arrow', style: { color: '#1971c2' }, geom: { from: { x: 0, y: 0 }, to: { x: 5, y: 5 } } }, // 無 anchor/label
  ];
  const out = buildExport(objs, { w: 600, h: 400 });
  eq(JSON.stringify(out.viewport), JSON.stringify({ w: 600, h: 400 }));
  const a = out.annotations[0];
  eq(a.id, 'a'); eq(a.tool, 'ellipse'); eq(a.selector, '#price-card'); eq(a.text, '對齊右欄'); eq(a.color, '#e03131');
  eq(JSON.stringify(a.geom), JSON.stringify({ x: 1, y: 2, w: 3, h: 4 }));
  const b = out.annotations[1];
  assert(!('selector' in b), '無 anchor → 不含 selector');
  assert(!('text' in b), '無 label → 不含 text');
  eq(b.color, '#1971c2');
});
test('buildExport: text 工具用 obj.text 當 text；image 標 image:true', () => {
  const out = buildExport([
    { id: 't', tool: 'text', text: '備註', style: {}, geom: { x: 1, y: 1 } },
    { id: 'i', tool: 'image', imageRef: 'data:...', style: {}, geom: { x: 0, y: 0, w: 5, h: 5 } },
  ], { w: 100, h: 100 });
  eq(out.annotations[0].text, '備註');
  assert(out.annotations[1].image === true, 'image 應標記 image:true（不塞 dataURL）');
});
test('buildExport: 空 → annotations []', () => {
  eq(JSON.stringify(buildExport([], { w: 10, h: 10 }).annotations), '[]');
});

// ── P6 annotationRows（側邊標注紀錄 row 資料；純函式）─────────────────────────────────
test('annotationRows: 空 / 無入參 → []', () => {
  eq(JSON.stringify(annotationRows([])), '[]');
  eq(JSON.stringify(annotationRows()), '[]');
});
test('annotationRows: text 解析 label → text → 工具友善預設', () => {
  const rows = annotationRows([
    { id: 'a', tool: 'ellipse', label: '對齊', text: '舊', style: { color: '#e03131' } },
    { id: 'b', tool: 'text', text: '備註', style: { color: '#000' } },
    { id: 'c', tool: 'arrow', style: { color: '#1971c2' } },
  ]);
  eq(rows[0].text, '對齊', 'label 優先於 text');
  eq(rows[1].text, '備註', '無 label → 用 text');
  eq(rows[2].text, '箭頭', '無 label/text → arrow 友善預設');
});
test('annotationRows: ellipse 無文字 → 友善預設「圈選」、line → 「直線」', () => {
  eq(annotationRows([{ id: 'e', tool: 'ellipse', style: {} }])[0].text, '圈選');
  eq(annotationRows([{ id: 'l', tool: 'line', style: {} }])[0].text, '直線');
});
test('annotationRows: selector 取 anchor（無則 null）、color 取 style.color', () => {
  const rows = annotationRows([
    { id: 'a', tool: 'rect', anchor: '#price-card', style: { color: '#f08c00' } },
    { id: 'b', tool: 'rect', style: { color: '#2f9e44' } },
  ]);
  eq(rows[0].selector, '#price-card'); eq(rows[0].color, '#f08c00');
  eq(rows[1].selector, null, '無 anchor → null'); eq(rows[1].color, '#2f9e44');
});
test('annotationRows: 每筆含 id/tool/icon（icon 為非空字串、image 退回方框）', () => {
  const rows = annotationRows([{ id: 'p', tool: 'pencil', style: {} }, { id: 'i', tool: 'image', style: {} }]);
  eq(rows[0].id, 'p'); eq(rows[0].tool, 'pencil');
  assert(typeof rows[0].icon === 'string' && rows[0].icon, 'pencil 應有 icon 名');
  eq(rows[1].icon, 'rect', 'image 無專屬圖示 → 退回 rect');
});
test('annotationRows: 保序、不改入參（純函式）', () => {
  const src = [{ id: 'x', tool: 'line', style: { color: '#000' } }, { id: 'y', tool: 'diamond', style: {} }];
  const copy = JSON.stringify(src);
  const rows = annotationRows(src);
  eq(rows[0].id, 'x'); eq(rows[1].id, 'y', '保留輸入順序');
  eq(rows[1].text, '菱形');
  eq(JSON.stringify(src), copy, 'annotationRows 不應改入參');
});

// ── 綁定標籤：labelAnchor + serialize ───────────────────────────────────────────
test('labelAnchor: shape → bbox 中心', () => {
  const a = labelAnchor({ tool: 'rect', geom: { x: 10, y: 20, w: 40, h: 20 } });
  eq(a.x, 30); eq(a.y, 30);
});
test('labelAnchor: diamond/ellipse 也取 bbox 中心', () => {
  eq(JSON.stringify(labelAnchor({ tool: 'diamond', geom: { x: 0, y: 0, w: 10, h: 10 } })), JSON.stringify({ x: 5, y: 5 }));
  eq(JSON.stringify(labelAnchor({ tool: 'ellipse', geom: { x: 2, y: 4, w: 8, h: 12 } })), JSON.stringify({ x: 6, y: 10 }));
});
test('labelAnchor: line/arrow → 兩端中點', () => {
  const a = labelAnchor({ tool: 'line', geom: { from: { x: 0, y: 0 }, to: { x: 20, y: 10 } } });
  eq(a.x, 10); eq(a.y, 5);
  const b = labelAnchor({ tool: 'arrow', geom: { from: { x: 4, y: 4 }, to: { x: 8, y: 8 } } });
  eq(b.x, 6); eq(b.y, 6);
});
test('serialize: 綁定 label 一併輸出；空字串/未設不含 label', () => {
  const o = makeDrawObject({ id: 'r1', tool: 'rect', geom: { x: 0, y: 0, w: 5, h: 5 } });
  assert(!('label' in serializeDrawObject(o)), '未設 label 不應出現');
  o.label = '價格卡';
  eq(serializeDrawObject(o).label, '價格卡');
  o.label = '';
  assert(!('label' in serializeDrawObject(o)), '空字串視為無 label');
});
test('label 隨 geom 移動：平移後 labelAnchor 跟著移', () => {
  const o = { tool: 'rect', geom: { x: 10, y: 10, w: 20, h: 20 }, label: 'x' };
  const before = labelAnchor(o);
  o.geom = translateGeom(o, 5, 7);
  const after = labelAnchor(o);
  eq(after.x - before.x, 5); eq(after.y - before.y, 7);
});

test('taperScale: 端點 0、中段 1、頭尾線性升', () => {
  eq(taperScale(0, 0.15), 0);
  eq(taperScale(1, 0.15), 0);
  eq(taperScale(0.5, 0.15), 1);
  close(taperScale(0.075, 0.15), 0.5, '頭段一半 → 0.5');
});
test('outlineWidths: 端點比中段細（pen，minScale 0）', () => {
  const pts = [[0, 0], [10, 0], [20, 0], [30, 0], [40, 0]];
  const w = outlineWidths(pts, 10, { taperFrac: 0.2, minScale: 0 });
  const mid = w[Math.floor(w.length / 2)];
  assert(w[0] < mid && w[w.length - 1] < mid, `頭尾應比中段細，實際 ${JSON.stringify(w)}`);
  assert(Math.abs(mid - 10) < 1e-6, `中段應為 baseWidth，實際 ${mid}`);
});
test('outlineWidths: marker minScale 0.5 → 端點仍有一半寬（漸細較少）', () => {
  const pts = [[0, 0], [10, 0], [20, 0], [30, 0]];
  const w = outlineWidths(pts, 10, { taperFrac: 0.12, minScale: 0.5 });
  assert(w[0] >= 5 - 1e-6, `marker 端點應 >= 半寬（minScale 0.5），實際 ${w[0]}`);
});
test('taperedOutline: >=2 點 → 封閉外框（M…L…Z）', () => {
  const d = taperedOutline([[0, 0], [10, 0], [20, 0]], 10, { taperFrac: 0.2 });
  assert(/^M /.test(d) && / L /.test(d) && /Z$/.test(d), `應為 M…L…Z，實際 ${d}`);
});
test('taperedOutline: 邊界 0/1 點', () => {
  eq(taperedOutline([], 10), '');
  const dot = taperedOutline([[5, 5]], 10);
  assert(/^M /.test(dot) && /Z$/.test(dot), `單點應為封閉圓點，實際 ${dot}`);
});

// ── Feature A: marquee 命中測試（rect ∩ bbox → ids）──────────────────────────────
test('rectsIntersect: 相交 / 不相交', () => {
  assert(rectsIntersect({ x: 0, y: 0, w: 10, h: 10 }, { x: 5, y: 5, w: 10, h: 10 }), '應相交');
  assert(!rectsIntersect({ x: 0, y: 0, w: 5, h: 5 }, { x: 10, y: 10, w: 5, h: 5 }), '應不相交');
  assert(rectsIntersect({ x: 0, y: 0, w: 5, h: 5 }, { x: 5, y: 0, w: 5, h: 5 }), '邊緣接觸視為相交');
});
test('marqueeSelect: 回傳框內/相交物件的 id', () => {
  const objs = [
    { id: 'a', tool: 'rect', geom: { x: 0, y: 0, w: 10, h: 10 } },
    { id: 'b', tool: 'rect', geom: { x: 50, y: 50, w: 10, h: 10 } },
    { id: 'c', tool: 'rect', geom: { x: 5, y: 5, w: 4, h: 4 } },
  ];
  const hits = marqueeSelect(objs, { x: -1, y: -1, w: 20, h: 20 }); // 涵蓋 a、c，不含 b
  eq(JSON.stringify(hits), JSON.stringify(['a', 'c']));
});

// ── Feature A: 多選 z-order（保留相對順序）────────────────────────────────────────
test('reorderMany front/back: 整組移到尾/頭、保相對序', () => {
  eq(JSON.stringify(reorderMany(['a', 'b', 'c', 'd'], ['a', 'c'], 'front')), JSON.stringify(['b', 'd', 'a', 'c']));
  eq(JSON.stringify(reorderMany(['a', 'b', 'c', 'd'], ['b', 'd'], 'back')), JSON.stringify(['b', 'd', 'a', 'c']));
});
test('reorderMany forward/backward: 整組上/下移一步、不互相穿越', () => {
  eq(JSON.stringify(reorderMany(['a', 'b', 'c', 'd'], ['b', 'c'], 'forward')), JSON.stringify(['a', 'd', 'b', 'c']));
  eq(JSON.stringify(reorderMany(['a', 'b', 'c', 'd'], ['b', 'c'], 'backward')), JSON.stringify(['b', 'c', 'a', 'd']));
});
test('reorderMany 單選 → 與 reorderIds 等價（回歸保護）', () => {
  ['front', 'back', 'forward', 'backward'].forEach(op => {
    eq(JSON.stringify(reorderMany(['a', 'b', 'c'], ['b'], op)), JSON.stringify(reorderIds(['a', 'b', 'c'], 'b', op)), op);
  });
});

// ── Feature A/B: applyStylePatch（picker / eyedropper 共用，作用於多選）──────────────
const styleObjs = () => ([
  { id: 'a', tool: 'rect', geom: {}, style: { color: '#000', strokeWidth: 2, fill: 'none' } },
  { id: 'b', tool: 'rect', geom: {}, style: { color: '#000', strokeWidth: 2, fill: 'none' } },
]);
test('applyStylePatch: 繪圖工具 + 有選取（剛建立物件 auto-select）→ 即時換色該物件 + 更新預設', () => {
  const objs = styleObjs();
  const res = applyStylePatch({ tool: 'rect', selectedIds: ['a'], objects: objs, defaultStyle: { ...DEFAULT_DRAW_STYLE } }, { color: '#abcdef' });
  eq(res.defaultStyle.color, '#abcdef', '預設一併更新（下一個物件用）');
  eq(res.objects[0].style.color, '#abcdef', '剛建立的選取物件應即時換色');
  eq(res.objects[1].style.color, '#000', '未選取的不動');
  eq(res.cmds.length, 1, '只有選取的一條 update cmd');
});
test('applyStylePatch: 繪圖工具 + 無選取 → 只改預設、物件不動', () => {
  const objs = styleObjs();
  const res = applyStylePatch({ tool: 'rect', selectedIds: [], objects: objs, defaultStyle: { ...DEFAULT_DRAW_STYLE } }, { color: '#abcdef' });
  eq(res.defaultStyle.color, '#abcdef');
  eq(res.objects[0].style.color, '#000', '無選取 → 既有物件不動');
  eq(res.cmds.length, 0);
});
test('applyStylePatch: select 工具 + 多選 → 改所有選取物件、產生 update cmds', () => {
  const objs = styleObjs();
  const res = applyStylePatch({ tool: 'select', selectedIds: ['a', 'b'], objects: objs, defaultStyle: { ...DEFAULT_DRAW_STYLE } }, { color: '#ff0000' });
  eq(res.objects[0].style.color, '#ff0000');
  eq(res.objects[1].style.color, '#ff0000');
  eq(res.cmds.length, 2, '兩個選取物件各一條 update cmd');
  eq(res.cmds[0].after.style.color, '#ff0000');
});
test('applyStylePatch: select 但無選取 → 只改預設', () => {
  const res = applyStylePatch({ tool: 'select', selectedIds: [], objects: styleObjs(), defaultStyle: { ...DEFAULT_DRAW_STYLE } }, { strokeWidth: 6 });
  eq(res.defaultStyle.strokeWidth, 6);
  eq(res.cmds.length, 0);
});

// ── Feature B: eyedropper feature-detect ────────────────────────────────────────
test('eyedropperSupported: 偵測 win.EyeDropper', () => {
  assert(eyedropperSupported({ EyeDropper: function () {} }), '有 EyeDropper → true');
  assert(!eyedropperSupported({}), '無 → false');
  assert(!eyedropperSupported(undefined), 'undefined win → false');
});

// ── Feature A: batch / deleteMany command（apply/invert）──────────────────────────
test('command batch: apply 依序、invert 反序還原', () => {
  const o1 = { id: 'a', tool: 'rect', geom: { x: 0 }, style: {} };
  const cmd = { type: 'batch', cmds: [
    { type: 'update', id: 'a', before: { geom: { x: 0 } }, after: { geom: { x: 5 } } },
    { type: 'update', id: 'a', before: { geom: { x: 5 } }, after: { geom: { x: 9 } } },
  ] };
  eq(applyCommand([o1], cmd)[0].geom.x, 9);
  eq(invertCommand(applyCommand([o1], cmd), cmd)[0].geom.x, 0);
});
test('command deleteMany: apply 移除多個、invert 依原 index 還原', () => {
  const objs = ['a', 'b', 'c', 'd', 'e'].map(id => ({ id, tool: 'rect', geom: {}, style: {} }));
  const cmd = { type: 'deleteMany', items: [{ obj: objs[1], index: 1 }, { obj: objs[3], index: 3 }] };
  const after = applyCommand(objs, cmd);
  eq(JSON.stringify(after.map(o => o.id)), JSON.stringify(['a', 'c', 'e']));
  const back = invertCommand(after, cmd);
  eq(JSON.stringify(back.map(o => o.id)), JSON.stringify(['a', 'b', 'c', 'd', 'e']), '還原回原位置');
});

// ── P2 applyCommand / invertCommand（undo-redo 純邏輯）──────────────────────────
const oA = { id: 'a', tool: 'rect', geom: { x: 0, y: 0, w: 1, h: 1 }, style: { ...DEFAULT_DRAW_STYLE } };
const oB = { id: 'b', tool: 'rect', geom: { x: 2, y: 2, w: 1, h: 1 }, style: { ...DEFAULT_DRAW_STYLE } };

test('command create: apply 加入、invert 移除', () => {
  const cmd = { type: 'create', obj: oB };
  const after = applyCommand([oA], cmd);
  eq(after.length, 2); eq(after[1].id, 'b');
  const back = invertCommand(after, cmd);
  eq(back.length, 1); eq(back[0].id, 'a');
});
test('command delete: apply 移除、invert 還原到原 index', () => {
  const cmd = { type: 'delete', obj: oA, index: 0 };
  const after = applyCommand([oA, oB], cmd);
  eq(after.length, 1); eq(after[0].id, 'b');
  const back = invertCommand(after, cmd);
  eq(JSON.stringify(back.map(o => o.id)), JSON.stringify(['a', 'b']), '還原回原位置');
});
test('command update(move): apply 套 after、invert 還原 before', () => {
  const before = { geom: { x: 0, y: 0, w: 1, h: 1 } };
  const afterPatch = { geom: { x: 9, y: 9, w: 1, h: 1 } };
  const cmd = { type: 'update', id: 'a', before, after: afterPatch };
  const after = applyCommand([oA], cmd);
  eq(after[0].geom.x, 9);
  const back = invertCommand(after, cmd);
  eq(back[0].geom.x, 0);
});
test('command update(style): 涵蓋 style-change', () => {
  const cmd = { type: 'update', id: 'a', before: { style: { color: '#E5484D' } }, after: { style: { color: '#0066FF' } } };
  eq(applyCommand([oA], cmd)[0].style.color, '#0066FF');
  eq(invertCommand(applyCommand([oA], cmd), cmd)[0].style.color, '#E5484D');
});
test('command reorder: apply→after 序、invert→before 序', () => {
  const cmd = { type: 'reorder', before: ['a', 'b'], after: ['b', 'a'] };
  eq(JSON.stringify(applyCommand([oA, oB], cmd).map(o => o.id)), JSON.stringify(['b', 'a']));
  eq(JSON.stringify(invertCommand([oB, oA], cmd).map(o => o.id)), JSON.stringify(['a', 'b']));
});

// ── P2 makeUndoStack（指標管理）─────────────────────────────────────────────────
test('makeUndoStack: push → canUndo；undo/redo 在兩堆間搬', () => {
  const s = makeUndoStack();
  assert(!s.canUndo() && !s.canRedo(), '初始皆空');
  const c1 = { type: 'create', obj: oA };
  s.push(c1);
  assert(s.canUndo() && !s.canRedo(), 'push 後可 undo、不可 redo');
  eq(s.undo(), c1, 'undo 回傳剛 push 的 cmd');
  assert(!s.canUndo() && s.canRedo(), 'undo 後可 redo');
  eq(s.redo(), c1, 'redo 回傳同 cmd');
  assert(s.canUndo() && !s.canRedo());
});
test('makeUndoStack: 新 push 清空 redo 分支', () => {
  const s = makeUndoStack();
  s.push({ type: 'create', obj: oA });
  s.undo();
  assert(s.canRedo(), 'undo 後本有 redo');
  s.push({ type: 'create', obj: oB });
  assert(!s.canRedo(), '新 push 應清空 redo');
});
test('makeUndoStack: 空堆 undo/redo 回傳 null', () => {
  const s = makeUndoStack();
  eq(s.undo(), null); eq(s.redo(), null);
});

// ── setEndpoint（Phase A 端點拖曳純函式）─────────────────────────────────────
console.log('\ndraw-layer unit — setEndpoint:');
test('setEndpoint: 改 to 不動 from', () => {
  const geom = { from: { x: 10, y: 20 }, to: { x: 50, y: 60 } };
  const result = setEndpoint(geom, 'to', { x: 80, y: 90 });
  eq(result.to.x, 80, 'to.x'); eq(result.to.y, 90, 'to.y');
  eq(result.from.x, 10, 'from.x 不變'); eq(result.from.y, 20, 'from.y 不變');
});
test('setEndpoint: 改 from 不動 to', () => {
  const geom = { from: { x: 10, y: 20 }, to: { x: 50, y: 60 } };
  const result = setEndpoint(geom, 'from', { x: 1, y: 2 });
  eq(result.from.x, 1, 'from.x'); eq(result.from.y, 2, 'from.y');
  eq(result.to.x, 50, 'to.x 不變'); eq(result.to.y, 60, 'to.y 不變');
});
test('setEndpoint: 不改入參（immutable）', () => {
  const geom = { from: { x: 10, y: 20 }, to: { x: 50, y: 60 } };
  setEndpoint(geom, 'to', { x: 99, y: 99 });
  eq(geom.to.x, 50, '原 geom.to.x 不變'); eq(geom.to.y, 60, '原 geom.to.y 不變');
});
test('setEndpoint: 回傳新物件（非同一參考）', () => {
  const geom = { from: { x: 0, y: 0 }, to: { x: 1, y: 1 } };
  const result = setEndpoint(geom, 'to', { x: 2, y: 2 });
  assert(result !== geom, '應回傳新物件');
});

// ── serializeObjectsForLocal / hydrateObjectsFromLocal（Item 1 localStorage 持久化）──
console.log('\ndraw-layer unit — localStorage 持久化純函式:');

test('serializeObjectsForLocal: image 物件跳過，向量物件保留', () => {
  const vec = makeDrawObject({ id: 'loc-v1', tool: 'rect', geom: { x: 1, y: 2, w: 3, h: 4 } });
  const img = makeDrawObject({ id: 'loc-i1', tool: 'image', geom: { x: 0, y: 0, w: 10, h: 10 } });
  img.imageRef = 'data:image/png;base64,abc'; // 模擬 dataURL
  const docs = serializeObjectsForLocal([vec, img]);
  eq(docs.length, 1, '應跳過 image → 只剩 1 筆');
  eq(docs[0].id, 'loc-v1', '保留向量物件 id');
});
test('serializeObjectsForLocal: 空陣列回傳空陣列', () => {
  eq(serializeObjectsForLocal([]).length, 0);
});
test('hydrateObjectsFromLocal: 從 plain doc 還原 DrawObject + label / anchor', () => {
  const docs = [{ id: 'loc-h1', tool: 'arrow', geom: { from: { x: 0, y: 0 }, to: { x: 5, y: 5 } }, style: {}, label: '標籤', anchor: '#btn' }];
  const objs = hydrateObjectsFromLocal(docs);
  eq(objs.length, 1, '還原 1 筆');
  eq(objs[0].id, 'loc-h1');
  eq(objs[0].tool, 'arrow');
  eq(objs[0].label, '標籤');
  eq(objs[0].anchor, '#btn');
});
test('hydrateObjectsFromLocal: null / undefined 輸入回傳空陣列', () => {
  eq(hydrateObjectsFromLocal(null).length, 0);
  eq(hydrateObjectsFromLocal(undefined).length, 0);
});
test('round-trip: vector 物件序列化後還原 id/tool/geom/style 相同', () => {
  const obj = makeDrawObject({ id: 'loc-rt1', tool: 'ellipse', geom: { x: 5, y: 10, w: 20, h: 15 }, style: { color: '#f00', strokeWidth: 3 } });
  const docs = serializeObjectsForLocal([obj]);
  const back = hydrateObjectsFromLocal(docs);
  eq(back[0].id, 'loc-rt1', 'id 一致');
  eq(back[0].tool, 'ellipse', 'tool 一致');
  eq(back[0].style.color, '#f00', 'style.color 一致');
  eq(back[0].geom.w, 20, 'geom.w 一致');
});
test('round-trip: image 物件在 round-trip 中被濾掉（vectors only）', () => {
  const img = makeDrawObject({ id: 'loc-img', tool: 'image', geom: { x: 0, y: 0, w: 50, h: 50 } });
  const vec = makeDrawObject({ id: 'loc-rv', tool: 'line', geom: { from: { x: 0, y: 0 }, to: { x: 10, y: 10 } } });
  const docs = serializeObjectsForLocal([img, vec]);
  const back = hydrateObjectsFromLocal(docs);
  eq(back.length, 1, 'image 不進 round-trip');
  eq(back[0].id, 'loc-rv', '只剩向量物件');
});

// ── DRAW_FONT_SIZES / normalizeStyle fontSize（Item 2 字體大小）────────────────
console.log('\ndraw-layer unit — 字體大小（fontSize）:');

test('DRAW_FONT_SIZES: 匯出陣列，含 4 個正整數', () => {
  assert(Array.isArray(DRAW_FONT_SIZES), 'DRAW_FONT_SIZES 應為陣列');
  eq(DRAW_FONT_SIZES.length, 4, '應有 4 個選項');
  assert(DRAW_FONT_SIZES.every(n => typeof n === 'number' && n > 0), '每個選項應為正整數');
});
test('DRAW_FONT_SIZES: 包含 12/16/20/28', () => {
  [12, 16, 20, 28].forEach(n => assert(DRAW_FONT_SIZES.includes(n), `應包含 ${n}`));
});
test('normalizeStyle: 無 fontSize → 回傳 DEFAULT_DRAW_STYLE.fontSize (16)', () => {
  const s = makeDrawObject({ tool: 'text', geom: { x: 0, y: 0 }, text: 'hi' }).style;
  eq(s.fontSize, DEFAULT_DRAW_STYLE.fontSize, 'fontSize 應等於預設值');
  eq(DEFAULT_DRAW_STYLE.fontSize, 16, '預設 fontSize 應為 16');
});
test('normalizeStyle: 自訂 fontSize 保留', () => {
  const obj = makeDrawObject({ tool: 'text', geom: { x: 0, y: 0 }, text: 'hi', style: { fontSize: 28 } });
  eq(obj.style.fontSize, 28, 'fontSize 28 應被保留');
});
test('applyStylePatch: setFontSize 語意 — select 工具 + 選取 → 改選取物件 fontSize', () => {
  const obj = makeDrawObject({ id: 'fs1', tool: 'text', geom: { x: 0, y: 0 }, text: 'A' });
  const res = applyStylePatch(
    { tool: 'select', selectedIds: ['fs1'], objects: [obj], defaultStyle: { ...DEFAULT_DRAW_STYLE } },
    { fontSize: 28 }
  );
  eq(res.objects[0].style.fontSize, 28, '選取物件 fontSize 應更新為 28');
  eq(res.defaultStyle.fontSize, 28, '預設 fontSize 也應更新');
});

// ── Batch 3：持久群組（groupId）───────────────────────────────────────────────
console.log('\ndraw-layer unit — Batch 3 持久群組 (groupId):');

function mkRect(id) {
  return makeDrawObject({ id, tool: 'rect', geom: { x: 0, y: 0, w: 10, h: 10 } });
}

test('groupMembers: 回傳同 groupId 的所有 id', () => {
  const objs = ['a', 'b', 'c'].map(mkRect);
  objs[0].groupId = 'g1'; objs[1].groupId = 'g1';
  const members = groupMembers(objs, 'g1');
  eq(members.length, 2, 'g1 應有 2 個成員');
  assert(members.includes('a') && members.includes('b'), '應包含 a 和 b');
  assert(!members.includes('c'), '不應包含 c');
});

test('groupMembers: 無匹配 → 空陣列', () => {
  const objs = [mkRect('x')];
  eq(groupMembers(objs, 'g99').length, 0, '無匹配應回空陣列');
});

test('assignGroupId: 指定 id 設上 groupId；其他不動；immutable', () => {
  const o1 = mkRect('a'), o2 = mkRect('b');
  const result = assignGroupId([o1, o2], ['a'], 'g1');
  eq(result[0].groupId, 'g1', 'a 應有 groupId g1');
  assert(!result[1].groupId, 'b 不應有 groupId');
  assert(result[0] !== o1, '應回傳新物件（immutable）');
  assert(o1.groupId === undefined, '原物件不應被改動');
});

test('assignGroupId: 多 id 共享同一 gid', () => {
  const objs = ['a', 'b', 'c'].map(mkRect);
  const result = assignGroupId(objs, ['a', 'b'], 'g2');
  eq(result[0].groupId, 'g2', 'a 應有 g2');
  eq(result[1].groupId, 'g2', 'b 應有 g2');
  assert(!result[2].groupId, 'c 不應有 groupId');
});

test('clearGroupId: 移除指定 id 的 groupId；其他保留；immutable', () => {
  const objs = ['a', 'b', 'c'].map(mkRect);
  objs[0].groupId = 'g1'; objs[1].groupId = 'g1';
  const result = clearGroupId(objs, ['a']);
  assert(!result[0].groupId, 'a 應清除 groupId');
  eq(result[1].groupId, 'g1', 'b 應保留 groupId');
  assert(result[0] !== objs[0], '應回傳新物件（immutable）');
  assert(objs[0].groupId === 'g1', '原物件不應被改動');
});

test('clearGroupId: id 無 groupId → 不報錯、屬性不存在', () => {
  const o = mkRect('x');
  const result = clearGroupId([o], ['x']);
  assert(!result[0].groupId, '無 groupId 的物件清除後仍無 groupId');
  assert(!('groupId' in result[0]), 'groupId 屬性應不存在');
});

test('expandSelectionToGroups: 無群組成員 → 回傳原 selectedIds', () => {
  const objs = ['a', 'b'].map(mkRect);
  const result = expandSelectionToGroups(objs, ['a']);
  assert(Array.isArray(result), '應回傳陣列');
  eq(result.length, 1, '無群組不展開');
  eq(result[0], 'a', '應包含原始 id');
});

test('expandSelectionToGroups: 點一個群組成員 → 展開為所有成員', () => {
  const objs = ['a', 'b', 'c'].map(mkRect);
  objs[0].groupId = 'g1'; objs[1].groupId = 'g1';
  const result = expandSelectionToGroups(objs, ['a']);
  eq(result.length, 2, '應展開為 2 個');
  assert(result.includes('a') && result.includes('b'), '應包含 a 和 b');
  assert(!result.includes('c'), '不應包含 c');
});

test('expandSelectionToGroups: 去重、stable 順序（依 objects 陣列）', () => {
  const objs = ['a', 'b', 'c'].map(mkRect);
  objs[0].groupId = 'g1'; objs[1].groupId = 'g1';
  const result = expandSelectionToGroups(objs, ['a', 'b']); // 兩個都已選
  eq(result.length, 2, '去重後應有 2 個');
  eq(result[0], 'a', '順序應依 objects 陣列');
  eq(result[1], 'b', '順序應依 objects 陣列');
});

test('expandSelectionToGroups: 混合（有群組+無群組）', () => {
  const objs = ['a', 'b', 'c'].map(mkRect);
  objs[0].groupId = 'g1'; objs[1].groupId = 'g1';
  const result = expandSelectionToGroups(objs, ['a', 'c']); // a 有群組、c 無群組
  eq(result.length, 3, '應含 a,b,c');
  assert(result.includes('a') && result.includes('b') && result.includes('c'), '應含全部');
});

test('serializeDrawObject: groupId 有才帶，無 groupId 不帶欄位', () => {
  const o = mkRect('s1');
  o.groupId = 'g1';
  const s = serializeDrawObject(o);
  eq(s.groupId, 'g1', 'groupId 應序列化');
  const o2 = mkRect('s2');
  const s2 = serializeDrawObject(o2);
  assert(!('groupId' in s2), '無 groupId 時不應帶此欄位');
});

test('drawingToDoc: groupId 有才帶，無 groupId 不帶欄位', () => {
  const o = mkRect('d1');
  o.groupId = 'gx';
  const doc = drawingToDoc(o);
  eq(doc.groupId, 'gx', 'drawingToDoc 應帶 groupId');
  const o2 = mkRect('d2');
  const doc2 = drawingToDoc(o2);
  assert(!('groupId' in doc2), '無 groupId 時不應帶此欄位');
});

test('hydrateObjectsFromLocal: groupId round-trip', () => {
  const o = mkRect('h1');
  o.groupId = 'g9';
  const docs = serializeObjectsForLocal([o]);
  const back = hydrateObjectsFromLocal(docs);
  eq(back[0].groupId, 'g9', 'hydrateObjectsFromLocal 應還原 groupId');
});

// ── Batch 4：端點吸附 + anchor 解析 ───────────────────────────────────────────
console.log('\ndraw-layer unit — Batch 4 端點吸附/anchor:');

const RECT = { x: 10, y: 20, w: 40, h: 30 }; // 角: (10,20)..(50,50)；中心 (30,35)

test('rectAnchorPoints: 8 點（4 邊中點 + 4 角）座標正確', () => {
  const pts = rectAnchorPoints(RECT);
  eq(pts.length, 8, '應 8 點');
  const byRef = Object.fromEntries(pts.map(p => [p.ref, p]));
  eq(byRef.top.x, 30); eq(byRef.top.y, 20);
  eq(byRef.right.x, 50); eq(byRef.right.y, 35);
  eq(byRef.bottom.x, 30); eq(byRef.bottom.y, 50);
  eq(byRef.left.x, 10); eq(byRef.left.y, 35);
  eq(byRef.tl.x, 10); eq(byRef.tl.y, 20);
  eq(byRef.tr.x, 50); eq(byRef.tr.y, 20);
  eq(byRef.br.x, 50); eq(byRef.br.y, 50);
  eq(byRef.bl.x, 10); eq(byRef.bl.y, 50);
});

test('nearestPointOnRect: 左側外部點 → 投影到左邊', () => {
  const p = nearestPointOnRect({ x: 0, y: 35 }, RECT);
  eq(p.x, 10); eq(p.y, 35);
});
test('nearestPointOnRect: 上方外部點 → 投影到上邊', () => {
  const p = nearestPointOnRect({ x: 30, y: 0 }, RECT);
  eq(p.x, 30); eq(p.y, 20);
});
test('nearestPointOnRect: 右下外部點 → clamp 到右下角', () => {
  const p = nearestPointOnRect({ x: 100, y: 100 }, RECT);
  eq(p.x, 50); eq(p.y, 50);
});
test('nearestPointOnRect: 內部點 → 投影到最近邊', () => {
  const p = nearestPointOnRect({ x: 12, y: 35 }, RECT); // 最靠左邊
  eq(p.x, 10); eq(p.y, 35);
  const p2 = nearestPointOnRect({ x: 30, y: 48 }, RECT); // 最靠下邊
  eq(p2.x, 30); eq(p2.y, 50);
});

test('objectSnapPoints: 取其他 line 端點 + 形狀 bbox 錨點，排除 exceptId', () => {
  const objs = [
    makeDrawObject({ id: 'a', tool: 'arrow', geom: { from: { x: 1, y: 2 }, to: { x: 3, y: 4 } } }),
    makeDrawObject({ id: 'b', tool: 'line', geom: { from: { x: 5, y: 6 }, to: { x: 7, y: 8 } } }),
    makeDrawObject({ id: 'r', tool: 'rect', geom: { x: 0, y: 0, w: 9, h: 9 } }),
  ];
  const pts = objectSnapPoints(objs, 'a'); // 排除 a；b 兩端點 + r 8 錨點
  eq(pts.length, 10, 'b 兩端點 + r 八錨點');
  const bWhich = pts.filter(p => p.objId === 'b').map(p => p.which).sort();
  assert(bWhich[0] === 'from' && bWhich[1] === 'to', 'b 含 from/to 端點');
  eq(pts.filter(p => p.objId === 'r').length, 8, 'r 八個 bbox 錨點');
});

test('nearestSnap: 閾值內回最近候選', () => {
  const cands = [{ x: 10, y: 10, ref: 'a' }, { x: 0.5, y: 0, ref: 'b' }];
  const r = nearestSnap({ x: 0, y: 0 }, cands, SNAP_THRESHOLD_PCT);
  assert(r, '應命中');
  eq(r.cand.ref, 'b'); eq(r.point.x, 0.5); eq(r.point.y, 0);
});
test('nearestSnap: 全部超過閾值 → null', () => {
  const cands = [{ x: 100, y: 100 }];
  eq(nearestSnap({ x: 0, y: 0 }, cands, SNAP_THRESHOLD_PCT), null);
});

test('anchorRel ↔ resolveAnchorPoint round-trip', () => {
  const p = { x: 30, y: 35 };
  const rel = anchorRel(p, RECT); // 中心 → 0.5,0.5
  close(rel.relX, 0.5); close(rel.relY, 0.5);
  const back = resolveAnchorPoint({ relX: rel.relX, relY: rel.relY }, RECT);
  close(back.x, p.x); close(back.y, p.y);
});

test('resolveEndpoints: 無 anchor → 用 geom', () => {
  const o = makeDrawObject({ id: 'n', tool: 'arrow', geom: { from: { x: 1, y: 2 }, to: { x: 3, y: 4 } } });
  const e = resolveEndpoints(o, null, []);
  eq(e.from.x, 1); eq(e.to.x, 3);
});
test('resolveEndpoints: el anchor → 用 getRectPct(selector)', () => {
  const o = makeDrawObject({
    id: 'e', tool: 'arrow', geom: { from: { x: 1, y: 2 }, to: { x: 3, y: 4 } },
    endAnchors: { to: { kind: 'el', selector: '#btn', relX: 0.5, relY: 0.5 } },
  });
  const getRectPct = sel => (sel === '#btn' ? RECT : null);
  const e = resolveEndpoints(o, getRectPct, []);
  eq(e.from.x, 1); // from 無 anchor → geom
  eq(e.to.x, 30); eq(e.to.y, 35); // RECT 中心
});
test('resolveEndpoints: el anchor 解析失敗（selector 不存在）→ geom fallback', () => {
  const o = makeDrawObject({
    id: 'f', tool: 'arrow', geom: { from: { x: 1, y: 2 }, to: { x: 3, y: 4 } },
    endAnchors: { to: { kind: 'el', selector: '#gone', relX: 0.5, relY: 0.5 } },
  });
  const e = resolveEndpoints(o, () => null, []);
  eq(e.to.x, 3); eq(e.to.y, 4); // fallback geom.to
});
test('resolveEndpoints: obj anchor → 用目標物件端點', () => {
  const target = makeDrawObject({ id: 't', tool: 'arrow', geom: { from: { x: 5, y: 6 }, to: { x: 9, y: 9 } } });
  const o = makeDrawObject({
    id: 'o', tool: 'arrow', geom: { from: { x: 1, y: 2 }, to: { x: 3, y: 4 } },
    endAnchors: { from: { kind: 'obj', objId: 't', which: 'to' } },
  });
  const e = resolveEndpoints(o, null, [target, o]);
  eq(e.from.x, 9); eq(e.from.y, 9); // 鎖到 target.to
});
test('resolveEndpoints: obj anchor 目標不存在 → geom fallback', () => {
  const o = makeDrawObject({
    id: 'o', tool: 'arrow', geom: { from: { x: 1, y: 2 }, to: { x: 3, y: 4 } },
    endAnchors: { from: { kind: 'obj', objId: 'missing', which: 'to' } },
  });
  const e = resolveEndpoints(o, null, [o]);
  eq(e.from.x, 1); eq(e.from.y, 2);
});

test('objectSnapPoints: 形狀(rect) → 8 個 bbox 錨點帶 objId + relX/relY（Batch5 attach 到形狀）', () => {
  const objs = [makeDrawObject({ id: 'r', tool: 'rect', geom: { x: 0, y: 0, w: 10, h: 10 } })];
  const pts = objectSnapPoints(objs, null);
  eq(pts.length, 8, 'rect 8 錨點');
  assert(pts.every(p => p.objId === 'r'), '都來自 r');
  assert(pts.every(p => typeof p.relX === 'number' && typeof p.relY === 'number'), '帶 relX/relY');
  const top = pts.find(p => p.x === 5 && p.y === 0);
  assert(top, '含上邊中點'); close(top.relX, 0.5); close(top.relY, 0);
});
test('objectSnapPoints: 混合 — line 給端點(which)、shape 給 bbox 錨點(relX/relY)', () => {
  const objs = [
    makeDrawObject({ id: 'l', tool: 'line', geom: { from: { x: 1, y: 1 }, to: { x: 2, y: 2 } } }),
    makeDrawObject({ id: 'r', tool: 'ellipse', geom: { x: 0, y: 0, w: 4, h: 4 } }),
  ];
  const pts = objectSnapPoints(objs, null);
  eq(pts.filter(p => p.which).length, 2, 'line 兩端點');
  eq(pts.filter(p => p.relX != null).length, 8, 'ellipse 8 bbox 錨點');
});
test('resolveEndpoints: obj rel anchor → 用目標形狀 bbox + relX/relY', () => {
  const box = makeDrawObject({ id: 'bx', tool: 'rect', geom: { x: 10, y: 20, w: 40, h: 60 } });
  const o = makeDrawObject({
    id: 'o', tool: 'arrow', geom: { from: { x: 1, y: 2 }, to: { x: 3, y: 4 } },
    endAnchors: { to: { kind: 'obj', objId: 'bx', relX: 0.5, relY: 0 } }, // 上邊中點
  });
  const e = resolveEndpoints(o, null, [box, o]);
  eq(e.to.x, 30); eq(e.to.y, 20); // 10+0.5*40=30, 20+0*60=20
});
test('resolveEndpoints: obj rel anchor 隨目標移動而更新（live 跟隨）', () => {
  const o = makeDrawObject({
    id: 'o', tool: 'arrow', geom: { from: { x: 1, y: 2 }, to: { x: 3, y: 4 } },
    endAnchors: { to: { kind: 'obj', objId: 'bx', relX: 1, relY: 1 } }, // 右下角
  });
  const moved = makeDrawObject({ id: 'bx', tool: 'rect', geom: { x: 50, y: 50, w: 20, h: 20 } });
  const e = resolveEndpoints(o, null, [moved, o]);
  eq(e.to.x, 70); eq(e.to.y, 70); // 右下角 = 50+20,50+20
});

test('distPointToSegment: 垂直距離 / 端點外投影夾住', () => {
  close(distPointToSegment({ x: 5, y: 5 }, { x: 0, y: 0 }, { x: 10, y: 0 }), 5); // 垂直
  close(distPointToSegment({ x: -3, y: 0 }, { x: 0, y: 0 }, { x: 10, y: 0 }), 3); // 端點外 → 夾到 a
  close(distPointToSegment({ x: 5, y: 0 }, { x: 0, y: 0 }, { x: 10, y: 0 }), 0); // 線上
});
test('pointNearPolyline: 靠近任一段→true；遠離→false', () => {
  const pts = [[0, 0], [10, 0], [10, 10]];
  assert(pointNearPolyline({ x: 5, y: 1 }, pts, 2), '靠近第一段');
  assert(pointNearPolyline({ x: 11, y: 5 }, pts, 2), '靠近第二段');
  assert(!pointNearPolyline({ x: 5, y: 5 }, pts, 2), '折線內側空白 → 不命中');
});
test('pointHitsObject: pencil 用實際筆畫（空白 bbox 內部不命中、底下物件不被蓋）', () => {
  const pencil = makeDrawObject({ tool: 'pencil', geom: { points: [[0, 0], [20, 0], [20, 20]] } });
  assert(pointHitsObject(pencil, { x: 10, y: 0.5 }, 2), '點在筆畫上 → 命中');
  assert(!pointHitsObject(pencil, { x: 5, y: 10 }, 2), 'bbox 內但非筆畫 → 不命中（讓底下物件可選）');
});
test('pointHitsObject: arrow 用線段距離；rect 用 bbox', () => {
  const arrow = makeDrawObject({ tool: 'arrow', geom: { from: { x: 0, y: 0 }, to: { x: 10, y: 10 } } });
  assert(pointHitsObject(arrow, { x: 5, y: 5 }, 2), '點在箭頭線上 → 命中');
  assert(!pointHitsObject(arrow, { x: 0, y: 10 }, 2), '在 bbox 角但離線遠 → 不命中');
  const rect = makeDrawObject({ tool: 'rect', geom: { x: 0, y: 0, w: 10, h: 10 } });
  assert(pointHitsObject(rect, { x: 5, y: 5 }, 2), 'rect 內部 → 命中（bbox）');
});

test('arrowHeads: arrow 預設（無 heads）→ 終點箭頭', () => {
  const h = arrowHeads({ tool: 'arrow', style: {} });
  eq(h.start, false); eq(h.end, true);
});
test('arrowHeads: line 預設（無 heads）→ 無箭頭', () => {
  const h = arrowHeads({ tool: 'line', style: {} });
  eq(h.start, false); eq(h.end, false);
});
test('arrowHeads: heads=both → 雙向箭頭（起點+終點）', () => {
  const h = arrowHeads({ tool: 'line', style: { heads: 'both' } });
  eq(h.start, true); eq(h.end, true);
});
test('arrowHeads: heads=start → 只起點；heads=none 蓋過 arrow 預設', () => {
  eq(arrowHeads({ tool: 'arrow', style: { heads: 'start' } }).start, true);
  eq(arrowHeads({ tool: 'arrow', style: { heads: 'start' } }).end, false);
  const none = arrowHeads({ tool: 'arrow', style: { heads: 'none' } });
  eq(none.start, false); eq(none.end, false);
});
test('arrowHeads: 非 line/arrow → 無箭頭', () => {
  const h = arrowHeads({ tool: 'rect', style: { heads: 'both' } });
  eq(h.start, false); eq(h.end, false);
});
test('normalizeStyle/serialize: heads 保留並 round-trip', () => {
  const o = makeDrawObject({ tool: 'line', geom: { from: { x: 0, y: 0 }, to: { x: 1, y: 1 } }, style: { heads: 'both' } });
  eq(o.style.heads, 'both', 'normalizeStyle 保留 heads');
  eq(serializeDrawObject(o).style.heads, 'both', 'serialize 帶 heads');
});

test('geomBBox: 對有 anchor 的 arrow 用注入的 resolver 端點', () => {
  const o = makeDrawObject({
    id: 'g', tool: 'arrow', geom: { from: { x: 1, y: 2 }, to: { x: 3, y: 4 } },
    endAnchors: { to: { kind: 'el', selector: '#x', relX: 1, relY: 1 } },
  });
  const resolve = obj => ({ from: { x: 0, y: 0 }, to: { x: 50, y: 50 } });
  const b = geomBBox(o, resolve);
  eq(b.x, 0); eq(b.y, 0); eq(b.w, 50); eq(b.h, 50);
});
test('labelAnchor: 對有 anchor 的 arrow 用解析後兩端中點', () => {
  const o = makeDrawObject({ id: 'l', tool: 'arrow', geom: { from: { x: 1, y: 1 }, to: { x: 3, y: 3 } } });
  const resolve = () => ({ from: { x: 0, y: 0 }, to: { x: 20, y: 40 } });
  const a = labelAnchor(o, resolve);
  eq(a.x, 10); eq(a.y, 20);
});

test('serializeDrawObject: endAnchors 有才帶', () => {
  const o = makeDrawObject({ id: 'sa', tool: 'arrow', geom: { from: { x: 0, y: 0 }, to: { x: 1, y: 1 } } });
  assert(!('endAnchors' in serializeDrawObject(o)), '無 endAnchors 不帶');
  o.endAnchors = { to: { kind: 'el', selector: '#z', relX: 0, relY: 0 } };
  eq(serializeDrawObject(o).endAnchors.to.selector, '#z', '有則序列化');
});
test('drawingToDoc: endAnchors 有才帶', () => {
  const o = makeDrawObject({ id: 'da', tool: 'arrow', geom: { from: { x: 0, y: 0 }, to: { x: 1, y: 1 } } });
  assert(!('endAnchors' in drawingToDoc(o)), '無 endAnchors 不帶');
  o.endAnchors = { from: { kind: 'obj', objId: 'q', which: 'to' } };
  eq(drawingToDoc(o).endAnchors.from.objId, 'q', '有則帶');
});
test('mergeEndAnchor: 設某端、清某端、兩端皆空 → undefined', () => {
  const a = mergeEndAnchor(undefined, 'to', { kind: 'el', selector: '#a' });
  eq(a.to.selector, '#a', '設 to');
  const b = mergeEndAnchor(a, 'from', { kind: 'obj', objId: 'x', which: 'to' });
  eq(b.from.objId, 'x'); eq(b.to.selector, '#a');
  const c = mergeEndAnchor(b, 'to', undefined); // 清 to，仍留 from
  assert(!c.to && c.from, '清 to 保留 from');
  const d = mergeEndAnchor({ to: { kind: 'el', selector: '#z' } }, 'to', undefined);
  eq(d, undefined, '兩端皆空 → undefined');
});
test('mergeEndAnchor: immutable（不改入參）', () => {
  const prev = { to: { kind: 'el', selector: '#a' } };
  mergeEndAnchor(prev, 'from', { kind: 'el', selector: '#b' });
  assert(!('from' in prev), '入參不應被改');
});

test('hydrateObjectsFromLocal: endAnchors round-trip', () => {
  const o = makeDrawObject({ id: 'ha', tool: 'arrow', geom: { from: { x: 0, y: 0 }, to: { x: 1, y: 1 } } });
  o.endAnchors = { to: { kind: 'el', selector: '#k', relX: 0.25, relY: 0.75 } };
  const back = hydrateObjectsFromLocal([serializeDrawObject(o)]);
  eq(back[0].endAnchors.to.relX, 0.25, '應還原 endAnchors');
});

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
