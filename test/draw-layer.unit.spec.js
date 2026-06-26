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
  DEFAULT_DRAW_STYLE, DRAW_MODES, DRAW_TOOLS,
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
test('模式/工具常數完整', () => {
  ['comment', 'draw', 'off'].forEach(m => assert(DRAW_MODES.includes(m), m));
  ['select', 'ellipse', 'arrow', 'pencil', 'text'].forEach(t => assert(DRAW_TOOLS.includes(t), t));
});

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
