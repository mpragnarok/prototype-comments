// test/draw-layer.unit.spec.js — 純函式單測（無 DOM；node 直跑）
//
//   node test/draw-layer.unit.spec.js
//
// 對象：px↔% 換算（pxToPct/pctToPx/clientToPct/rectFromPoints）與 DrawObject
// 組裝/序列化（makeDrawObject/serializeDrawObject）。座標慣例對齊 src/index.js
// overlay click：x% = (clientX-rect.left)/rect.width*100，toFixed(2)。
import {
  pxToPct, pctToPx, clientToPct, rectFromPoints,
  makeDrawObject, serializeDrawObject,
  geomFromDrag, geomBBox, translateGeom, remapGeom, resizeBBox,
  reorderIds, applyCommand, invertCommand, makeUndoStack,
  DEFAULT_DRAW_STYLE, DRAW_MODES, DRAW_TOOLS, MIN_DRAW_SIZE_PCT,
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

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
