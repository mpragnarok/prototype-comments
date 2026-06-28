// test/e2e/draw-layer.spec.js — e2e for src/draw-layer.js（繪圖層骨架 P1）
//
//   node test/e2e/draw-layer.spec.js
//
// 起本地 http server serve repo root，playwright goto draw-layer-harness.html，
// 透過工具列切模式/選工具 + 真實滑鼠下筆，斷言：
//   - #pc-draw SVG 層存在；mode 切換正確 toggle pointer-events（不跟 app 打架的核心）
//   - 四種工具（ellipse/arrow/pencil/text）各畫出對應 SVG 元素 + 進 getObjects()
import { chromium } from 'playwright';
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const PORT = 8126;
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json' };

const server = http.createServer((req, res) => {
  const rel = decodeURIComponent(req.url.split('?')[0]);
  const p = path.join(ROOT, rel);
  if (!p.startsWith(ROOT) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); res.end('nf'); return; }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' });
  fs.createReadStream(p).pipe(res);
});

let pass = 0, fail = 0;
async function test(name, fn) {
  try { await fn(); console.log('  ✓', name); pass++; }
  catch (e) { console.error('  ✗', name, '\n     ', e.message); fail++; }
}
function assert(cond, msg) { if (!cond) throw new Error(msg || 'assertion failed'); }

// 用真實滑鼠在 svg 上拉一條（move→down→move→up），驅動 pointer 事件繪製。
async function dragDraw(page, x1, y1, x2, y2) {
  await page.mouse.move(x1, y1);
  await page.mouse.down();
  await page.mouse.move((x1 + x2) / 2, (y1 + y2) / 2);
  await page.mouse.move(x2, y2);
  await page.mouse.up();
}

(async () => {
  await new Promise(r => server.listen(PORT, r));
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 800, height: 600 } });
  page.on('pageerror', e => console.log('     [pageerror]', e.message));
  page.on('console', m => { if (m.type() === 'error') console.log('     [browser err]', m.text()); });
  await page.goto(`http://localhost:${PORT}/test/e2e/draw-layer-harness.html`);
  await page.waitForFunction(() => window.__drawTest && window.__drawTest.ready);

  console.log('draw-layer e2e (no firebase):');

  await test('initDrawLayer → #pc-draw SVG 層 + 工具列；預設 off、pointer-events:none', async () => {
    const r = await page.evaluate(() => {
      window.__drawTest.api = window.__drawTest.init();
      const svg = document.getElementById('pc-draw');
      return {
        svg: !!svg,
        isSvg: svg && svg.namespaceURI === 'http://www.w3.org/2000/svg',
        toolbar: !!document.querySelector('.pc-draw-toolbar'),
        toolBtns: document.querySelectorAll('.pc-draw-tool[data-tool]').length,
        mode: window.__drawTest.api.getMode(),
        pe: getComputedStyle(svg).pointerEvents,
      };
    });
    console.log('     init:', JSON.stringify(r));
    assert(r.svg && r.isSvg, '#pc-draw 應為 SVG 元素');
    assert(r.toolbar, '應有浮動工具列');
    assert(r.toolBtns >= 5, `工具列應 ≥5 顆工具鈕，實際 ${r.toolBtns}`);
    assert(r.mode === 'off', `預設模式 off，實際 ${r.mode}`);
    assert(r.pe === 'none', `off 時 svg pointer-events 應 none，實際 ${r.pe}`);
  });

  await test('點工具列 ellipse → 進 draw 模式、pointer-events:auto、鈕 active', async () => {
    await page.click('.pc-draw-tool[data-tool="ellipse"]');
    const r = await page.evaluate(() => ({
      mode: window.__drawTest.api.getMode(),
      tool: window.__drawTest.api.getTool(),
      pe: getComputedStyle(document.getElementById('pc-draw')).pointerEvents,
      active: document.querySelector('.pc-draw-tool[data-tool="ellipse"]').classList.contains('active'),
    }));
    console.log('     after pick ellipse:', JSON.stringify(r));
    assert(r.mode === 'draw', `選工具應切 draw，實際 ${r.mode}`);
    assert(r.tool === 'ellipse', `tool 應 ellipse，實際 ${r.tool}`);
    assert(r.pe === 'auto', `draw 時 svg pointer-events 應 auto（吃事件擋 app），實際 ${r.pe}`);
    assert(r.active, 'ellipse 鈕應 active');
  });

  await test('拉出 ellipse → #pc-draw 含 1 個 <ellipse> + getObjects 1 筆', async () => {
    await dragDraw(page, 100, 80, 240, 200);
    const r = await page.evaluate(() => ({
      ellipses: document.querySelectorAll('#pc-draw ellipse').length,
      objs: window.__drawTest.api.getObjects(),
    }));
    console.log('     ellipse drawn:', JSON.stringify(r));
    assert(r.ellipses === 1, `應有 1 個 ellipse，實際 ${r.ellipses}`);
    assert(r.objs.length === 1 && r.objs[0].tool === 'ellipse', 'getObjects 應有 1 筆 ellipse');
    assert(r.objs[0].geom.w > 0 && r.objs[0].geom.h > 0, 'ellipse geom 寬高應為正（% 座標）');
  });

  await test('arrow 工具 → 拉出 <line marker-end>', async () => {
    await page.click('.pc-draw-tool[data-tool="arrow"]');
    await dragDraw(page, 300, 80, 440, 200);
    const r = await page.evaluate(() => {
      const line = document.querySelector('#pc-draw line');
      return { lines: document.querySelectorAll('#pc-draw line').length, marker: line && line.getAttribute('marker-end') };
    });
    console.log('     arrow drawn:', JSON.stringify(r));
    assert(r.lines === 1, `應有 1 條 line，實際 ${r.lines}`);
    assert(/arrowhead/.test(r.marker || ''), 'arrow 應帶箭頭 marker-end');
  });

  await test('pencil 工具（預設 pen 筆刷）→ 填充外框 <path>（fill=色、無 stroke、封閉），非 polyline', async () => {
    await page.click('.pc-draw-brush[data-brush="pen"]'); // 無獨立鉛筆鈕；pen 筆刷＝自由筆
    await page.mouse.move(100, 260);
    await page.mouse.down();
    for (const [x, y] of [[140, 300], [180, 270], [220, 320], [260, 280]]) await page.mouse.move(x, y);
    await page.mouse.up();
    const r = await page.evaluate(() => {
      const p = document.querySelector('#pc-draw path[data-id]'); // 物件 path（排除 <defs> 內的箭頭 marker path）
      const o = window.__drawTest.api.getObjects().slice(-1)[0];
      return {
        paths: document.querySelectorAll('#pc-draw path[data-id]').length,
        polylines: document.querySelectorAll('#pc-draw polyline').length,
        d: p ? p.getAttribute('d') : null,
        fill: p ? p.getAttribute('fill') : null,
        stroke: p ? p.getAttribute('stroke') : null,
        brush: p ? p.getAttribute('data-brush') : null,
        styleBrush: o.style.brushType,
        tool: o.tool,
        geomPts: o.geom.points.length,
      };
    });
    console.log('     pencil drawn:', JSON.stringify(r));
    assert(r.paths === 1 && r.polylines === 0, `自由筆應渲染為 <path> 非 polyline，實際 paths=${r.paths} polylines=${r.polylines}`);
    assert(r.fill && r.fill !== 'none' && r.stroke === 'none', `pen 應為填充外框（fill=色、stroke=none），實際 fill=${r.fill} stroke=${r.stroke}`);
    assert(/^M /.test(r.d) && / L /.test(r.d) && /Z\s*$/.test(r.d), `pen 外框應為封閉多邊形（M…L…Z），實際 ${r.d}`);
    assert(r.brush === 'pen' && r.styleBrush === 'pen', `預設筆刷應為 pen，實際 dom=${r.brush} style=${r.styleBrush}`);
    assert(r.tool === 'pencil' && r.geomPts >= 3, 'geom 仍為 {points:[…]}（render 變了、模型不變）');
  });

  await test('text 工具 → 點畫布、輸入、Enter → <text> 落地', async () => {
    await page.click('.pc-draw-tool[data-tool="text"]');
    await page.mouse.click(360, 320);
    await page.waitForSelector('.pc-draw-text-input', { timeout: 2000 });
    await page.fill('.pc-draw-text-input', '對齊右欄');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(60);
    const r = await page.evaluate(() => {
      const t = document.querySelector('#pc-draw text');
      return { texts: document.querySelectorAll('#pc-draw text').length, content: t ? t.textContent : null, inputGone: !document.querySelector('.pc-draw-text-input') };
    });
    console.log('     text drawn:', JSON.stringify(r));
    assert(r.texts === 1, `應有 1 個 text，實際 ${r.texts}`);
    assert(r.content === '對齊右欄', `text 內容不符：${r.content}`);
    assert(r.inputGone, '送出後 input 應移除');
  });

  await test('四種物件都進 getObjects（ellipse/arrow/pencil/text）', async () => {
    const tools = await page.evaluate(() => window.__drawTest.api.getObjects().map(o => o.tool));
    console.log('     objects:', JSON.stringify(tools));
    assert(tools.length === 4, `應有 4 筆物件，實際 ${tools.length}`);
    ['ellipse', 'arrow', 'pencil', 'text'].forEach(t => assert(tools.includes(t), `缺 ${t}`));
  });

  await test('模式狀態機 toggle pointer-events：comment/off→none，draw→auto', async () => {
    const r = await page.evaluate(() => {
      const svg = document.getElementById('pc-draw');
      const peOf = () => getComputedStyle(svg).pointerEvents;
      const api = window.__drawTest.api;
      api.setMode('comment'); const comment = peOf();
      api.setMode('draw');    const draw = peOf();
      api.setMode('off');     const off = peOf();
      return { comment, draw, off };
    });
    console.log('     pointer-events by mode:', JSON.stringify(r));
    assert(r.comment === 'none', `comment 應 none，實際 ${r.comment}`);
    assert(r.draw === 'auto', `draw 應 auto，實際 ${r.draw}`);
    assert(r.off === 'none', `off 應 none，實際 ${r.off}`);
  });

  await test('工具列 ✕ → 回 off 模式（放行 app 點擊）', async () => {
    await page.evaluate(() => window.__drawTest.api.setMode('draw'));
    await page.click('.pc-draw-tool[data-tool="off"]');
    const r = await page.evaluate(() => ({
      mode: window.__drawTest.api.getMode(),
      pe: getComputedStyle(document.getElementById('pc-draw')).pointerEvents,
    }));
    assert(r.mode === 'off', `✕ 應回 off，實際 ${r.mode}`);
    assert(r.pe === 'none', `off 後 pointer-events 應 none，實際 ${r.pe}`);
  });

  // ── P2：物件操作（select/move/resize/z-order/delete/undo-redo）+ rect/line + 顏色筆粗 ──
  console.log('\ndraw-layer e2e — P2 物件操作:');

  // 共用：清空畫布、回到指定工具。
  async function reset(tool = 'select') {
    await page.evaluate(t => { window.__drawTest.api.clear(); window.__drawTest.api.setTool(t); }, tool);
  }

  await test('rect 工具 → 拉出 <rect>（物件層直接子節點，非選取 handle）', async () => {
    await reset('rect');
    await dragDraw(page, 100, 80, 240, 200);
    const r = await page.evaluate(() => ({
      rects: document.querySelectorAll('#pc-draw > rect').length, // 排除 selection <g> 內的 handle
      objs: window.__drawTest.api.getObjects().map(o => o.tool),
    }));
    console.log('     rect drawn:', JSON.stringify(r));
    assert(r.rects === 1, `應有 1 個物件 <rect>，實際 ${r.rects}`);
    assert(r.objs.length === 1 && r.objs[0] === 'rect', 'getObjects 應有 1 筆 rect');
  });

  await test('line 工具 → 拉出 <line>（無箭頭 marker）', async () => {
    await reset('line');
    await dragDraw(page, 300, 100, 440, 240);
    const r = await page.evaluate(() => {
      const line = document.querySelector('#pc-draw line');
      return { lines: document.querySelectorAll('#pc-draw line').length, marker: line && line.getAttribute('marker-end'), tool: window.__drawTest.api.getObjects()[0].tool };
    });
    console.log('     line drawn:', JSON.stringify(r));
    assert(r.lines === 1, `應有 1 條 line，實際 ${r.lines}`);
    assert(!r.marker, 'line 不應帶箭頭 marker-end');
    assert(r.tool === 'line', 'getObjects 應為 line');
  });

  await test('diamond 工具 → 拉出 <polygon>（4 點菱形），可選取/移動', async () => {
    await reset('diamond');
    await dragDraw(page, 100, 80, 220, 200);
    const r = await page.evaluate(() => {
      const poly = document.querySelector('#pc-draw polygon');
      const o = window.__drawTest.api.getObjects()[0];
      return {
        polys: document.querySelectorAll('#pc-draw polygon').length,
        pts: poly ? poly.getAttribute('points').trim().split(/\s+/).length : 0,
        tool: o.tool, geom: o.geom,
      };
    });
    console.log('     diamond drawn:', JSON.stringify(r));
    assert(r.polys === 1 && r.pts === 4, `應為 1 個 4 點 polygon，實際 polys=${r.polys} pts=${r.pts}`);
    assert(r.tool === 'diamond' && r.geom.w > 0 && r.geom.h > 0, 'getObjects 應為 diamond + 正寬高');
    // 可選取 + 移動
    await page.evaluate(() => window.__drawTest.api.setTool('select'));
    const before = await page.evaluate(() => window.__drawTest.api.getObjects()[0].geom);
    await dragDraw(page, 160, 140, 240, 220); // 從中心拖
    const after = await page.evaluate(() => ({ geom: window.__drawTest.api.getObjects()[0].geom, sel: window.__drawTest.api.getSelectedIds().length }));
    console.log('     diamond move:', before.x, '→', after.geom.x, 'sel:', after.sel);
    assert(after.geom.x > before.x + 1 && after.geom.y > before.y + 1, 'diamond 可被選取並移動');
  });

  await test('select → 點空白處取消選取、點物件選取（顯示選取框 + handle）', async () => {
    await reset('rect');
    await dragDraw(page, 100, 80, 220, 180); // 畫完自動選取
    await page.evaluate(() => window.__drawTest.api.setTool('select'));
    await page.mouse.click(10, 10); // 點空白
    const deselected = await page.evaluate(() => window.__drawTest.api.getSelected());
    await page.mouse.click(160, 130); // 點 rect 中心
    const r = await page.evaluate(() => ({
      sel: window.__drawTest.api.getSelected(),
      box: document.querySelectorAll('.pc-draw-selection').length,
      handles: document.querySelectorAll('.pc-draw-selection rect[data-handle]').length,
    }));
    console.log('     deselected:', deselected, 'reselect:', JSON.stringify(r));
    assert(deselected === null, '點空白應取消選取');
    assert(r.sel, '點物件應選取');
    assert(r.box === 1 && r.handles === 4, `應顯示選取框 + 4 handle，實際 box=${r.box} handles=${r.handles}`);
  });

  await test('move：拖選取物件 → geom 位移（% 座標改變）', async () => {
    await reset('rect');
    await dragDraw(page, 100, 80, 220, 180);
    await page.evaluate(() => window.__drawTest.api.setTool('select'));
    const before = await page.evaluate(() => window.__drawTest.api.getObjects()[0].geom);
    await dragDraw(page, 160, 130, 260, 230); // 從中心拖到右下
    const after = await page.evaluate(() => window.__drawTest.api.getObjects()[0].geom);
    console.log('     move before/after x:', before.x, '→', after.x, '| y:', before.y, '→', after.y);
    assert(after.x > before.x + 1 && after.y > before.y + 1, 'move 後 x/y 應增加');
    assert(Math.abs(after.w - before.w) < 0.5 && Math.abs(after.h - before.h) < 0.5, 'move 不應改變尺寸');
  });

  await test('resize：拖 se handle → geom 尺寸改變', async () => {
    await reset('rect');
    await dragDraw(page, 100, 80, 200, 160);
    await page.evaluate(() => window.__drawTest.api.setTool('select'));
    await page.mouse.click(150, 120); // 確保選取
    const before = await page.evaluate(() => window.__drawTest.api.getObjects()[0].geom);
    const handle = await page.evaluate(() => {
      const h = document.querySelector('.pc-draw-selection rect[data-handle="se"]');
      const r = h.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    });
    await dragDraw(page, handle.x, handle.y, handle.x + 80, handle.y + 60); // 往外拉 se 角
    const after = await page.evaluate(() => window.__drawTest.api.getObjects()[0].geom);
    console.log('     resize w/h:', before.w, before.h, '→', after.w, after.h);
    assert(after.w > before.w + 1 && after.h > before.h + 1, 'resize 後寬高應變大');
  });

  await test('z-order：bringToFront → SVG DOM 順序重排（選取物件移到最後）', async () => {
    await reset('rect');
    await dragDraw(page, 60, 60, 140, 140);   // A
    await dragDraw(page, 200, 200, 280, 280); // B（自動選取）
    const r = await page.evaluate(() => {
      const api = window.__drawTest.api;
      const ids = api.getObjects().map(o => o.id); // [A, B]
      api.select(ids[0]);                           // 選 A（底層）
      api.bringToFront();
      const domOrder = [...document.querySelectorAll('#pc-draw [data-id]')].map(e => e.dataset.id);
      const objs = api.getObjects();
      return { firstId: ids[0], domOrder, order: objs.map(o => o.id), zs: objs.map(o => o.z) };
    });
    console.log('     z-order:', JSON.stringify(r));
    assert(r.domOrder[r.domOrder.length - 1] === r.firstId, 'A 應排到 SVG 最後（最上層）');
    assert(r.order[r.order.length - 1] === r.firstId, 'state 陣列尾應為 A');
    assert(r.zs[r.zs.length - 1] === r.zs.length - 1, 'z 應依 DOM 順序遞增');
  });

  await test('delete：刪除選取物件（API + Delete 鍵）', async () => {
    await reset('rect');
    await dragDraw(page, 100, 80, 200, 180);
    const n0 = await page.evaluate(() => window.__drawTest.api.getObjects().length);
    await page.evaluate(() => window.__drawTest.api.deleteSelected());
    const afterApi = await page.evaluate(() => ({ n: window.__drawTest.api.getObjects().length, dom: document.querySelectorAll('#pc-draw [data-id]').length }));
    // 再用鍵盤刪一次
    await dragDraw(page, 120, 100, 220, 200);
    await page.mouse.move(170, 150);
    await page.keyboard.press('Delete');
    const afterKey = await page.evaluate(() => window.__drawTest.api.getObjects().length);
    console.log('     delete n0:', n0, 'afterApi:', JSON.stringify(afterApi), 'afterKey:', afterKey);
    assert(n0 === 1 && afterApi.n === 0 && afterApi.dom === 0, 'API 刪除應清空物件 + DOM');
    assert(afterKey === 0, 'Delete 鍵應刪除選取物件');
  });

  await test('undo / redo：刪除後 undo 還原、redo 再刪（API + 快捷鍵）', async () => {
    await reset('rect');
    await dragDraw(page, 100, 80, 200, 180);
    const id = await page.evaluate(() => window.__drawTest.api.getObjects()[0].id);
    await page.evaluate(() => window.__drawTest.api.deleteSelected());
    const gone = await page.evaluate(() => window.__drawTest.api.getObjects().length);
    await page.evaluate(() => window.__drawTest.api.undo());
    const restored = await page.evaluate(() => window.__drawTest.api.getObjects());
    await page.evaluate(() => window.__drawTest.api.redo());
    const redone = await page.evaluate(() => window.__drawTest.api.getObjects().length);
    console.log('     undo/redo gone:', gone, 'restored:', restored.length, 'redone:', redone);
    assert(gone === 0, '刪除後應 0 筆');
    assert(restored.length === 1 && restored[0].id === id, 'undo 應還原同 id 物件');
    assert(redone === 0, 'redo 應再次刪除');
  });

  await test('undo move：移動後 undo 還原原座標', async () => {
    await reset('rect');
    await dragDraw(page, 100, 80, 200, 180);
    await page.evaluate(() => window.__drawTest.api.setTool('select'));
    const before = await page.evaluate(() => window.__drawTest.api.getObjects()[0].geom);
    await dragDraw(page, 150, 130, 250, 230);
    await page.evaluate(() => window.__drawTest.api.undo());
    const after = await page.evaluate(() => window.__drawTest.api.getObjects()[0].geom);
    console.log('     undo move x:', before.x, '→ moved → undo →', after.x);
    assert(Math.abs(after.x - before.x) < 0.5 && Math.abs(after.y - before.y) < 0.5, 'undo 應還原移動前座標');
  });

  await test('keyboard undo/redo：Ctrl+Z 還原、Ctrl+Shift+Z 重做', async () => {
    await reset('rect');
    await dragDraw(page, 100, 80, 200, 180);
    await page.evaluate(() => window.__drawTest.api.deleteSelected());
    await page.keyboard.press('Control+z');
    const restored = await page.evaluate(() => window.__drawTest.api.getObjects().length);
    await page.keyboard.press('Control+Shift+z');
    const redone = await page.evaluate(() => window.__drawTest.api.getObjects().length);
    console.log('     kbd undo→', restored, 'redo→', redone);
    assert(restored === 1, 'Ctrl+Z 應還原');
    assert(redone === 0, 'Ctrl+Shift+Z 應重做');
  });

  await test('color picker（popover swatch，select 工具 + 選取）：擴充預設色 → 選取物件變色 + 新物件沿用', async () => {
    await reset('rect');
    await dragDraw(page, 100, 80, 200, 180); // 自動選取，tool 仍為 rect
    await page.evaluate(() => window.__drawTest.api.setTool('select')); // 切 select（保留選取）
    await page.click('.pc-draw-tool[data-action="color-menu"]'); // 開色盤 popover
    await page.click('.pc-draw-popover[data-menu="color"] .pc-draw-swatch[data-color="#2f9e44"]'); // 擴充綠
    const r = await page.evaluate(() => {
      const o = window.__drawTest.api.getObjects()[0];
      const el = document.querySelector('#pc-draw > rect');
      return { color: o.style.color, stroke: el && el.getAttribute('stroke') };
    });
    // 換工具再畫一個 → 應沿用新預設色
    await page.evaluate(() => window.__drawTest.api.setTool('rect'));
    await dragDraw(page, 300, 100, 380, 200);
    const next = await page.evaluate(() => window.__drawTest.api.getObjects().slice(-1)[0].style.color);
    console.log('     color picker:', JSON.stringify(r), 'new obj color:', next);
    assert(r.color === '#2f9e44', `選取物件 style.color 應變綠，實際 ${r.color}`);
    assert(r.stroke === '#2f9e44', `SVG stroke 應變綠，實際 ${r.stroke}`);
    assert(next === '#2f9e44', `新物件應沿用新預設色，實際 ${next}`);
  });

  await test('custom color（<input type=color>）：設任意 hex → 下一個新物件沿用', async () => {
    await reset('rect'); // 繪圖工具啟用 → custom color 只設預設
    await page.evaluate(() => {
      const inp = document.querySelector('.pc-draw-color-custom');
      inp.value = '#abcdef';
      inp.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await dragDraw(page, 120, 90, 220, 190); // 新物件應為自訂色
    const c = await page.evaluate(() => window.__drawTest.api.getObjects().slice(-1)[0].style.color);
    console.log('     custom color new obj:', c);
    assert(c === '#abcdef', `自訂色應套到新物件，實際 ${c}`);
  });

  await test('strokeWidth picker（popover，select 工具 + 選取）：較粗線寬 → 選取物件線寬改變', async () => {
    await reset('rect');
    await dragDraw(page, 100, 80, 200, 180);
    await page.evaluate(() => window.__drawTest.api.setTool('select'));
    await page.click('.pc-draw-tool[data-action="width-menu"]'); // 開線粗 popover
    await page.click('.pc-draw-popover[data-menu="width"] .pc-draw-width[data-width="6"]'); // 最粗
    const r = await page.evaluate(() => ({
      sw: window.__drawTest.api.getObjects()[0].style.strokeWidth,
      domSw: document.querySelector('#pc-draw > rect').getAttribute('stroke-width'),
    }));
    console.log('     strokeWidth picker:', JSON.stringify(r));
    assert(r.sw === 6 && r.domSw === '6', `線寬應為 6，實際 ${JSON.stringify(r)}`);
  });

  await test('toolbar 圖示化：每顆鈕為 inline <svg> + aria-label；z-order 鈕已移除、改放筆刷', async () => {
    const r = await page.evaluate(() => {
      const tools = [...document.querySelectorAll('.pc-draw-tool[data-tool]')];
      const acts = [...document.querySelectorAll('.pc-draw-act')];
      const brushes = [...document.querySelectorAll('.pc-draw-brush[data-brush]')];
      const allSvg = [...tools, ...acts, ...brushes].every(b => b.querySelector('svg') && b.getAttribute('aria-label'));
      return {
        actActions: acts.map(b => b.dataset.action).sort(),
        brushTypes: brushes.map(b => b.dataset.brush),
        allSvg,
        // acts 不含文字；tools 僅可含數字徽章（無 emoji/字母 glyph）
        noGlyphText: acts.every(b => !b.textContent.trim()) && tools.every(b => /^\d?$/.test(b.textContent.trim())),
        zorderBtns: ['front', 'forward', 'backward', 'back'].filter(a => document.querySelector(`.pc-draw-toolbar .pc-draw-act[data-action="${a}"]`)).length,
        presetSwatches: document.querySelectorAll('.pc-draw-popover[data-menu="color"] .pc-draw-swatch[data-color]').length,
        widthOpts: document.querySelectorAll('.pc-draw-popover[data-menu="width"] .pc-draw-width').length,
      };
    });
    console.log('     icons/aria:', JSON.stringify(r));
    assert(r.allSvg, '每顆工具/動作/筆刷鈕應為 inline svg + aria-label');
    assert(r.noGlyphText, '不應再有 emoji/字元 glyph');
    assert(r.actActions.join(',') === 'delete,redo,undo', `工具列動作鈕應只剩 delete/undo/redo，實際 ${r.actActions}`);
    assert(r.zorderBtns === 0, `工具列不應再有 z-order 按鈕，實際 ${r.zorderBtns}`);
    assert(r.brushTypes.join(',') === 'pen,marker,highlighter', `應有 3 個筆刷鈕，實際 ${r.brushTypes}`);
    assert(r.presetSwatches === 8, `應有 8 預設色，實際 ${r.presetSwatches}`);
    assert(r.widthOpts === 4, `應有 4 線寬，實際 ${r.widthOpts}`);
  });

  await test('z-order 圖示（右鍵選單）：forward/backward 用 move_up/move_down（與 flip 置頂/底區隔）', async () => {
    const r = await page.evaluate(() => {
      const pathOf = a => {
        const p = document.querySelector(`#pc-draw-context .pc-draw-context-item[data-action="${a}"] svg path`);
        return p && p.getAttribute('d');
      };
      return { front: pathOf('front'), back: pathOf('back'), forward: pathOf('forward'), backward: pathOf('backward') };
    });
    console.log('     ctx z-order icon d:', JSON.stringify({ forward: r.forward && r.forward.slice(0, 12), backward: r.backward && r.backward.slice(0, 12) }));
    assert(r.forward.includes('M15 5h6') && r.backward.includes('M15 5h6'), 'forward/backward 應為 move_up/move_down（含堆疊列）');
    assert(r.forward.startsWith('M9 4') && r.backward.startsWith('M9 20'), 'forward 上箭頭、backward 下箭頭');
    const set = new Set([r.front, r.back, r.forward, r.backward]);
    assert(set.size === 4, '四個 z-order 圖示應互不相同（一眼分辨 front vs forward）');
  });

  await test('自訂調色盤 swatch：popover 內第 9 顆、明顯可見、aria-label=自訂顏色', async () => {
    await reset('rect');
    await page.click('.pc-draw-tool[data-action="color-menu"]'); // 開色盤 popover
    const r = await page.evaluate(() => {
      const sw = document.querySelector('.pc-draw-popover[data-menu="color"] .pc-draw-custom-swatch');
      const inp = sw && sw.querySelector('.pc-draw-color-custom[data-action="custom-color"]');
      const rect = sw ? sw.getBoundingClientRect() : null;
      const cs = sw ? getComputedStyle(sw) : null;
      const allSwatches = [...document.querySelectorAll('.pc-draw-popover[data-menu="color"] .pc-draw-swatch')];
      return {
        present: !!sw, hasInput: !!inp,
        visible: !!rect && rect.width > 8 && rect.height > 8 && cs.display !== 'none' && cs.visibility !== 'hidden' && cs.opacity !== '0',
        ariaLabel: sw && sw.getAttribute('aria-label'),
        total: allSwatches.length,
        lastIsCustom: allSwatches.length > 0 && allSwatches[allSwatches.length - 1].classList.contains('pc-draw-custom-swatch'),
        hasGradient: cs && /gradient/.test(cs.backgroundImage),
      };
    });
    console.log('     custom swatch:', JSON.stringify(r));
    assert(r.present && r.hasInput, '應有自訂顏色 swatch + <input type=color>');
    assert(r.visible, '自訂顏色 swatch 在開啟的 popover 內應明顯可見');
    assert(r.ariaLabel === '自訂顏色', `aria-label 應為「自訂顏色」，實際 ${r.ariaLabel}`);
    assert(r.total === 9 && r.lastIsCustom, `應為第 9 顆（8 預設 + 自訂），實際 total=${r.total} lastIsCustom=${r.lastIsCustom}`);
    assert(r.hasGradient, '自訂 swatch 應有彩虹漸層背景（邀請挑色）');
  });

  // ── Bug 1：繪圖工具啟用時 picker 只設預設、不回頭改選取；切繪圖工具會取消選取 ──
  await test('即時換色：繪圖工具下對剛建立(選取中)物件 setColor → 即時換色 + 更新預設', async () => {
    await reset('rect');
    await page.evaluate(() => window.__drawTest.api.setColor('#F5A623')); // tool=rect → 設預設（amber）
    await dragDraw(page, 100, 80, 200, 180);                              // 畫出 amber rect（自動選取）
    const c1 = await page.evaluate(() => window.__drawTest.api.getObjects()[0].style.color);
    await page.evaluate(() => window.__drawTest.api.setColor('#0066FF')); // tool 仍 rect 但有選取 → 即時換該 rect
    const c2 = await page.evaluate(() => window.__drawTest.api.getObjects()[0].style.color);
    await dragDraw(page, 300, 100, 380, 200);                             // 再畫一個 → 沿用新預設藍
    const c3 = await page.evaluate(() => window.__drawTest.api.getObjects().slice(-1)[0].style.color);
    console.log('     recolor c1/c2/c3:', c1, c2, c3);
    assert(c1 === '#F5A623', `首個 rect 應為 amber，實際 ${c1}`);
    assert(c2 === '#0066FF', `剛建立(選取中)物件 setColor 應即時換為藍，實際 ${c2}`);
    assert(c3 === '#0066FF', `新物件應沿用新預設藍，實際 ${c3}`);
  });

  await test('即時換色：未選取時 setColor 只設預設、不動既有物件', async () => {
    await reset('rect');
    await page.evaluate(() => window.__drawTest.api.setColor('#E5484D')); // 預設 red
    await dragDraw(page, 100, 80, 200, 180);                             // 畫出 red rect（自動選取）
    await page.evaluate(() => window.__drawTest.api.setTool('ellipse')); // 切繪圖工具 → 取消選取
    const beforeC = await page.evaluate(() => window.__drawTest.api.getObjects()[0].style.color);
    await page.evaluate(() => window.__drawTest.api.setColor('#0066FF')); // 無選取 → 只設預設
    const afterC = await page.evaluate(() => window.__drawTest.api.getObjects()[0].style.color);
    console.log('     recolor no-selection:', beforeC, '→(setColor blue, no selection)→', afterC);
    assert(beforeC === '#E5484D', `畫出時應為 red，實際 ${beforeC}`);
    assert(afterC === '#E5484D', `無選取時 setColor 不該改既有物件，應仍 red，實際 ${afterC}`);
  });

  await test('bug1：切換到繪圖工具會取消目前選取', async () => {
    await reset('rect');
    await dragDraw(page, 100, 80, 200, 180);
    const selA = await page.evaluate(() => window.__drawTest.api.getSelected());
    await page.evaluate(() => window.__drawTest.api.setTool('ellipse')); // 切繪圖工具
    const selB = await page.evaluate(() => ({ sel: window.__drawTest.api.getSelected(), box: document.querySelectorAll('.pc-draw-selection').length }));
    console.log('     bug1 deselect on tool switch:', selA, '→', JSON.stringify(selB));
    assert(selA, '畫完應自動選取');
    assert(selB.sel === null, '切繪圖工具應取消選取');
    assert(selB.box === 0, '選取框應移除');
  });

  // ── Bug 2：箭頭 marker 顏色跟著 stroke 顏色（多色各自正確）──
  await test('bug2：不同顏色的 arrow → 箭頭 marker fill === 各自 stroke', async () => {
    await reset('arrow');
    await page.evaluate(() => window.__drawTest.api.setColor('#0066FF')); // 藍箭頭
    await dragDraw(page, 80, 80, 200, 160);
    await page.evaluate(() => window.__drawTest.api.setTool('arrow')); // 重新拿 arrow（取消上一個選取）
    await page.evaluate(() => window.__drawTest.api.setColor('#111111')); // 黑箭頭
    await dragDraw(page, 260, 80, 400, 200);
    const r = await page.evaluate(() => {
      return [...document.querySelectorAll('#pc-draw line[marker-end]')].map(line => {
        const stroke = line.getAttribute('stroke');
        const m = (line.getAttribute('marker-end') || '').match(/#([^)]+)/);
        const path = m && document.querySelector('#' + m[1] + ' path');
        return { stroke, markerFill: path && path.getAttribute('fill') };
      });
    });
    console.log('     bug2 arrows:', JSON.stringify(r));
    assert(r.length === 2, `應有 2 條箭頭，實際 ${r.length}`);
    r.forEach((a, i) => assert(a.markerFill === a.stroke, `箭頭 ${i} marker fill(${a.markerFill}) 應 === stroke(${a.stroke})`));
    const colors = r.map(a => a.stroke).sort();
    assert(colors[0] === '#0066FF' && colors[1] === '#111111', `兩箭頭應為藍/黑兩色，實際 ${JSON.stringify(colors)}`);
  });

  // ── 鍵盤快捷鍵（Excalidraw 風格）──────────────────────────────────────────────
  console.log('\ndraw-layer e2e — 鍵盤快捷鍵:');

  await test('單鍵切工具：o→ellipse、r→rect、7→pencil、v→select、a→arrow', async () => {
    await page.evaluate(() => window.__drawTest.api.setTool('select')); // 確保 draw 模式
    async function pressTool(key) { await page.keyboard.press(key); return page.evaluate(() => window.__drawTest.api.getTool()); }
    const o = await pressTool('o');
    const r = await pressTool('r');
    const seven = await pressTool('7');
    const v = await pressTool('v');
    const a = await pressTool('a');
    console.log('     keys o/r/7/v/a →', JSON.stringify({ o, r, seven, v, a }));
    assert(o === 'ellipse', `o → ellipse，實際 ${o}`);
    assert(r === 'rect', `r → rect，實際 ${r}`);
    assert(seven === 'pencil', `7 → pencil，實際 ${seven}`);
    assert(v === 'select', `v → select，實際 ${v}`);
    assert(a === 'arrow', `a → arrow，實際 ${a}`);
  });

  await test('大寫亦可（case-insensitive）：R → rect', async () => {
    await page.evaluate(() => window.__drawTest.api.setTool('select'));
    await page.keyboard.press('Shift+R'); // 大寫 R
    const tool = await page.evaluate(() => window.__drawTest.api.getTool());
    console.log('     Shift+R →', tool);
    assert(tool === 'rect', `大寫 R 應切 rect，實際 ${tool}`);
  });

  await test('打字 guard：在文字輸入框打 r 不切工具、字元進輸入框', async () => {
    await reset('text');
    await page.mouse.click(360, 300);
    await page.waitForSelector('.pc-draw-text-input', { timeout: 2000 });
    await page.focus('.pc-draw-text-input');
    await page.keyboard.press('r'); // 應進輸入框、不切工具
    const r = await page.evaluate(() => ({
      tool: window.__drawTest.api.getTool(),
      val: document.querySelector('.pc-draw-text-input') ? document.querySelector('.pc-draw-text-input').value : null,
    }));
    console.log('     typing guard:', JSON.stringify(r));
    assert(r.tool === 'text', `打字時不應切工具，實際 ${r.tool}`);
    assert(r.val === 'r', `字元應進輸入框，實際 ${r.val}`);
    await page.keyboard.press('Enter'); // 收尾：commit 文字
    await page.evaluate(() => window.__drawTest.api.clear());
  });

  await test('Cmd/Ctrl/Alt + 字母不切工具（避免撞 undo/redo/瀏覽器）', async () => {
    await page.evaluate(() => window.__drawTest.api.setTool('select'));
    await page.keyboard.press('Control+r'); // 含修飾鍵 → 不切
    const tool = await page.evaluate(() => window.__drawTest.api.getTool());
    console.log('     Ctrl+r tool stays:', tool);
    assert(tool === 'select', `含 Ctrl 不應切工具，實際 ${tool}`);
  });

  await test('i 鍵 → 觸發 eyedropper（mock）→ 取樣色套到新物件', async () => {
    await reset('rect');
    await page.evaluate(() => window.__drawTest.setEyedropHex('#1488cc'));
    await page.keyboard.press('i');
    await page.waitForTimeout(30);
    await dragDraw(page, 120, 90, 220, 190);
    const c = await page.evaluate(() => window.__drawTest.api.getObjects().slice(-1)[0].style.color);
    console.log('     i → eyedropper new obj color:', c);
    assert(c === '#1488cc', `i 鍵應觸發 eyedropper 並套色，實際 ${c}`);
  });

  await test('工具 tooltip 含快捷鍵：select=(V)、rect=(R)；eyedropper title=(I)', async () => {
    const r = await page.evaluate(() => ({
      select: document.querySelector('.pc-draw-tool[data-tool="select"]').title,
      rect: document.querySelector('.pc-draw-tool[data-tool="rect"]').title,
      eye: document.querySelector('.pc-draw-eyedropper[data-action="eyedropper"]').title,
    }));
    console.log('     titles:', JSON.stringify(r));
    assert(/\(V\)/.test(r.select), `select title 應含 (V)，實際 ${r.select}`);
    assert(/\(R\)/.test(r.rect), `rect title 應含 (R)，實際 ${r.rect}`);
    assert(/\(I\)/.test(r.eye), `eyedropper title 應含 (I)，實際 ${r.eye}`);
  });

  await test('常駐數字快捷鍵徽章：工具列 1-8 連續、7 在 pen 筆刷、pointer-events:none', async () => {
    const r = await page.evaluate(() => {
      // 工具鈕（data-tool）的徽章
      const want = { select: '1', rect: '2', diamond: '3', ellipse: '4', arrow: '5', line: '6', text: '8' };
      const out = {};
      let allPE = true, allVisible = true;
      const check = badge => {
        if (!badge) { allVisible = false; return; }
        const cs = getComputedStyle(badge);
        if (cs.pointerEvents !== 'none') allPE = false;
        if (cs.display === 'none' || cs.visibility === 'hidden') allVisible = false;
      };
      Object.keys(want).forEach(tool => {
        const badge = document.querySelector(`.pc-draw-tool[data-tool="${tool}"] .pc-draw-kbd`);
        out[tool] = badge ? badge.textContent.trim() : null;
        check(badge);
      });
      // 7 在 pen 筆刷；marker/highlighter 無徽章
      const penBadge = document.querySelector('.pc-draw-brush[data-brush="pen"] .pc-draw-kbd');
      out.pen = penBadge ? penBadge.textContent.trim() : null;
      check(penBadge);
      const markerBadge = !!document.querySelector('.pc-draw-brush[data-brush="marker"] .pc-draw-kbd');
      const hlBadge = !!document.querySelector('.pc-draw-brush[data-brush="highlighter"] .pc-draw-kbd');
      // 工具列上所有徽章依 DOM 順序
      const order = [...document.querySelectorAll('.pc-draw-toolbar .pc-draw-kbd')].map(b => b.textContent.trim());
      // 確認沒有獨立鉛筆工具鈕
      const pencilToolBtn = !!document.querySelector('.pc-draw-tool[data-tool="pencil"]');
      const offBadge = !!document.querySelector('.pc-draw-tool[data-tool="off"] .pc-draw-kbd');
      const actBadge = !!document.querySelector('.pc-draw-act .pc-draw-kbd');
      return { out, allPE, allVisible, markerBadge, hlBadge, order, pencilToolBtn, offBadge, actBadge, want };
    });
    console.log('     kbd badges:', JSON.stringify(r.out), 'order:', JSON.stringify(r.order));
    Object.entries(r.want).forEach(([tool, n]) => assert(r.out[tool] === n, `${tool} 徽章應為 ${n}，實際 ${r.out[tool]}`));
    assert(r.out.pen === '7', `pen 筆刷徽章應為 7，實際 ${r.out.pen}`);
    assert(r.allVisible && r.allPE, `徽章應可見且 pointer-events:none（visible=${r.allVisible} pe=${r.allPE}）`);
    assert(!r.markerBadge && !r.hlBadge, 'marker/highlighter 不應有徽章');
    assert(r.order.join(',') === '1,2,3,4,5,6,7,8', `工具列徽章應依序 1-8，實際 ${r.order}`);
    assert(!r.pencilToolBtn, '不應有獨立 pencil 工具鈕（改由筆刷代表）');
    assert(!r.offBadge && !r.actBadge, 'off/動作 鈕不應有徽章');
  });

  await test('工具列 DOM 順序（含菱形、筆刷群、無獨立鉛筆）', async () => {
    const r = await page.evaluate(() => {
      const bar = document.getElementById('pc-draw-toolbar');
      // 工具鈕(data-tool, 排除 off) 與 筆刷鈕(data-brush) 依 DOM 順序的序列
      const seq = [...bar.querySelectorAll('.pc-draw-tool[data-tool]:not([data-tool="off"]), .pc-draw-brush[data-brush]')]
        .map(b => b.dataset.tool || ('brush:' + b.dataset.brush));
      return { seq };
    });
    console.log('     toolbar seq:', JSON.stringify(r.seq));
    const expected = ['select', 'rect', 'diamond', 'ellipse', 'arrow', 'line', 'brush:pen', 'brush:marker', 'brush:highlighter', 'text'];
    assert(r.seq.join(',') === expected.join(','), `工具列順序不符，實際 ${r.seq}`);
  });

  await test('快捷鍵 3 / d → diamond；7 / p → 自由筆(pencil) 且 brush=pen', async () => {
    await page.evaluate(() => window.__drawTest.api.setTool('select'));
    await page.keyboard.press('3');
    const three = await page.evaluate(() => window.__drawTest.api.getTool());
    await page.evaluate(() => window.__drawTest.api.setTool('select'));
    await page.keyboard.press('d');
    const dKey = await page.evaluate(() => window.__drawTest.api.getTool());
    await page.evaluate(() => window.__drawTest.api.setTool('select'));
    await page.keyboard.press('7');
    const sevenTool = await page.evaluate(() => window.__drawTest.api.getTool());
    const penActive = await page.evaluate(() => document.querySelector('.pc-draw-brush[data-brush="pen"]').classList.contains('active'));
    await page.evaluate(() => window.__drawTest.api.setTool('select'));
    await page.keyboard.press('p');
    const pTool = await page.evaluate(() => window.__drawTest.api.getTool());
    console.log('     3/d/7/p →', JSON.stringify({ three, dKey, sevenTool, penActive, pTool }));
    assert(three === 'diamond' && dKey === 'diamond', `3/d 應切 diamond，實際 ${three}/${dKey}`);
    assert(sevenTool === 'pencil' && pTool === 'pencil', `7/p 應切自由筆，實際 ${sevenTool}/${pTool}`);
    assert(penActive, '7 應啟用 pen 筆刷');
  });

  // ── Change 2/3：筆刷類型（pen/marker/highlighter）+ 頭尾漸細 ────────────────────
  console.log('\ndraw-layer e2e — 筆刷類型 / 漸細:');

  // 用某筆刷畫一條自由筆，回傳該物件 path 的屬性。
  async function drawBrush(brush) {
    await page.evaluate(() => window.__drawTest.api.clear());
    await page.click(`.pc-draw-brush[data-brush="${brush}"]`); // 選筆刷（會切到 pencil）
    await page.mouse.move(120, 250);
    await page.mouse.down();
    for (const [x, y] of [[160, 252], [200, 248], [240, 250], [280, 249], [320, 251]]) await page.mouse.move(x, y);
    await page.mouse.up();
    return page.evaluate(() => {
      const p = document.querySelector('#pc-draw path[data-id]');
      const o = window.__drawTest.api.getObjects().slice(-1)[0];
      return {
        d: p && p.getAttribute('d'), fill: p && p.getAttribute('fill'), stroke: p && p.getAttribute('stroke'),
        sw: p && p.getAttribute('stroke-width'), opacity: p && p.getAttribute('opacity'),
        cap: p && p.getAttribute('stroke-linecap'), style: p && p.getAttribute('style'),
        brushAttr: p && p.getAttribute('data-brush'), styleBrush: o.style.brushType,
        bbox: p ? (() => { const b = p.getBBox(); return { w: b.width, h: b.height }; })() : null,
      };
    });
  }

  await test('筆刷 active 狀態：選 marker → 該筆刷鈕 active', async () => {
    await page.click('.pc-draw-brush[data-brush="marker"]');
    const r = await page.evaluate(() => ({
      tool: window.__drawTest.api.getTool(),
      active: document.querySelector('.pc-draw-brush[data-brush="marker"]').classList.contains('active'),
      penActive: document.querySelector('.pc-draw-brush[data-brush="pen"]').classList.contains('active'),
    }));
    console.log('     brush active:', JSON.stringify(r));
    assert(r.tool === 'pencil', '選筆刷應切到 pencil 工具');
    assert(r.active && !r.penActive, 'marker 鈕 active、pen 不 active');
  });

  await test('pen 筆刷：填充外框 + 頭尾漸細（端點窄於中段）', async () => {
    const r = await drawBrush('pen');
    console.log('     pen:', JSON.stringify({ ...r, d: undefined }));
    assert(r.fill && r.fill !== 'none' && r.stroke === 'none', `pen 填充外框，實際 fill=${r.fill} stroke=${r.stroke}`);
    assert(/Z\s*$/.test(r.d), 'pen 外框封閉(Z)');
    assert(r.brushAttr === 'pen' && r.styleBrush === 'pen', 'brushType=pen');
    // 漸細結構：解析 d 的 y 座標，量「靠端點」與「靠中段」的上下緣寬度
    const taper = await page.evaluate(() => {
      const d = document.querySelector('#pc-draw path[data-id]').getAttribute('d');
      const nums = d.match(/-?\d+(\.\d+)?/g).map(Number);
      const pts = []; for (let i = 0; i < nums.length - 1; i += 2) pts.push([nums[i], nums[i + 1]]);
      const half = Math.floor(pts.length / 2);
      const fwd = pts.slice(0, half), bwd = pts.slice(half).reverse(); // 上緣 / 下緣（回程反轉對齊）
      const widthAt = i => Math.abs(fwd[i][1] - bwd[i][1]);
      const n = fwd.length;
      return { endW: (widthAt(0) + widthAt(n - 1)) / 2, midW: widthAt(Math.floor(n / 2)) };
    });
    console.log('     pen taper end/mid:', JSON.stringify(taper));
    assert(taper.midW > taper.endW + 1, `中段應比端點寬（漸細），end=${taper.endW} mid=${taper.midW}`);
  });

  await test('marker 筆刷：填充外框、比 pen 粗、漸細較少（端點仍有寬度）', async () => {
    const pen = await drawBrush('pen');
    const marker = await drawBrush('marker');
    console.log('     marker bbox vs pen:', JSON.stringify({ pen: pen.bbox, marker: marker.bbox }));
    assert(marker.fill && marker.fill !== 'none' && marker.stroke === 'none', 'marker 填充外框');
    assert(marker.brushAttr === 'marker', 'brushType=marker');
    assert(marker.bbox.h > pen.bbox.h, `marker 應比 pen 粗（bbox 高），pen=${pen.bbox.h} marker=${marker.bbox.h}`);
  });

  await test('highlighter 筆刷：等寬描邊、半透明、無 Z、multiply', async () => {
    const r = await drawBrush('highlighter');
    console.log('     highlighter:', JSON.stringify({ ...r, d: undefined }));
    assert(r.stroke && r.stroke !== 'none' && r.fill === 'none', `highlighter 應描邊（stroke=色、fill=none），實際 stroke=${r.stroke} fill=${r.fill}`);
    assert(Number(r.opacity) > 0 && Number(r.opacity) < 1, `應半透明，實際 opacity=${r.opacity}`);
    assert(!/Z\s*$/.test(r.d), 'highlighter 為描邊中心線、非封閉外框（無 Z）');
    assert(/multiply/.test(r.style || ''), 'highlighter 應 mix-blend-mode:multiply');
    assert(Number(r.sw) > 0, '應有等寬 stroke-width');
  });

  await test('筆刷 brushType 進 serialize（getObjects）', async () => {
    await drawBrush('highlighter');
    const o = await page.evaluate(() => window.__drawTest.api.getObjects().slice(-1)[0]);
    console.log('     serialize brush:', JSON.stringify(o.style));
    assert(o.style.brushType === 'highlighter', `serialize 應含 brushType，實際 ${o.style.brushType}`);
  });

  // ── 綁定標籤（雙擊物件加文字）──────────────────────────────────────────────────
  console.log('\ndraw-layer e2e — 綁定標籤 (bound text):');

  await test('雙擊 rect → 置中輸入框 → 打字 → <text> 置中於形狀 + obj.label', async () => {
    await reset('rect');
    await dragDraw(page, 100, 80, 220, 200); // rect（中心約 160,140）
    await page.evaluate(() => window.__drawTest.api.setTool('select'));
    await page.mouse.click(160, 140, { clickCount: 2 });
    await page.waitForSelector('.pc-draw-text-input', { timeout: 2000 });
    await page.fill('.pc-draw-text-input', '價格卡');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(40);
    const r = await page.evaluate(() => {
      const o = window.__drawTest.api.getObjects()[0];
      const t = document.querySelector(`.pc-draw-label[data-label-for="${o.id}"] text`);
      return {
        label: o.label, content: t && t.textContent,
        anchor: t && t.getAttribute('text-anchor'), baseline: t && t.getAttribute('dominant-baseline'),
        x: t && +t.getAttribute('x'), y: t && +t.getAttribute('y'),
        gone: !document.querySelector('.pc-draw-text-input'),
      };
    });
    console.log('     rect label:', JSON.stringify(r));
    assert(r.label === '價格卡' && r.content === '價格卡', `label 應寫回物件，實際 ${r.label}`);
    assert(r.anchor === 'middle' && r.baseline === 'middle', 'text 應 h/v 置中');
    assert(Math.abs(r.x - 160) < 6 && Math.abs(r.y - 140) < 6, `label 應置中於形狀(~160,140)，實際 ${r.x},${r.y}`);
    assert(r.gone, '送出後輸入框移除');
  });

  await test('雙擊 line → 中點標籤 + 白底 <rect> 蓋住線', async () => {
    await reset('line');
    await dragDraw(page, 100, 100, 300, 200); // 中點約 200,150
    await page.evaluate(() => window.__drawTest.api.setTool('select'));
    await page.mouse.click(200, 150, { clickCount: 2 });
    await page.waitForSelector('.pc-draw-text-input', { timeout: 2000 });
    await page.fill('.pc-draw-text-input', '對齊');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(40);
    const r = await page.evaluate(() => {
      const o = window.__drawTest.api.getObjects()[0];
      const g = document.querySelector(`.pc-draw-label[data-label-for="${o.id}"]`);
      const bg = g && g.querySelector('rect');
      const t = g && g.querySelector('text');
      const tb = t.getBBox();        // 實際渲染文字框
      const bb = bg.getBBox();        // 白底框
      return {
        label: o.label, bgFill: bg.getAttribute('fill'),
        tx: +t.getAttribute('x'), ty: +t.getAttribute('y'),
        textW: tb.width, textH: tb.height, bgW: bb.width, bgH: bb.height,
        // 覆蓋檢查：白底四邊都包住文字框
        covers: bb.x <= tb.x && bb.y <= tb.y && (bb.x + bb.width) >= (tb.x + tb.width) && (bb.y + bb.height) >= (tb.y + tb.height),
        // 中心對齊錨點
        bgCx: bb.x + bb.width / 2, bgCy: bb.y + bb.height / 2,
      };
    });
    console.log('     line label:', JSON.stringify(r));
    assert(r.label === '對齊', 'line label 寫回');
    assert(/#fff|white/i.test(r.bgFill), 'line/arrow 標籤應有白底 rect 蓋線');
    assert(Math.abs(r.tx - 200) < 8 && Math.abs(r.ty - 150) < 8, `label 應在中點(~200,150)，實際 ${r.tx},${r.ty}`);
    assert(r.bgW >= r.textW && r.bgH >= r.textH, `白底應 >= 文字框（bg ${r.bgW}x${r.bgH} vs text ${r.textW}x${r.textH}）`);
    assert(r.covers, '白底四邊應完全包住文字框（線不會露出）');
    assert(Math.abs(r.bgCx - 200) < 8 && Math.abs(r.bgCy - 150) < 8, `白底應置中於錨點，實際 ${r.bgCx},${r.bgCy}`);
  });

  await test('label 隨物件移動：拖 rect → 標籤重新置中', async () => {
    await reset('rect');
    await dragDraw(page, 100, 80, 220, 200);
    await page.evaluate(() => window.__drawTest.api.setTool('select'));
    await page.mouse.click(160, 140, { clickCount: 2 });
    await page.waitForSelector('.pc-draw-text-input', { timeout: 2000 });
    await page.fill('.pc-draw-text-input', 'L');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(30);
    const id = await page.evaluate(() => window.__drawTest.api.getObjects()[0].id);
    const before = await page.evaluate(i => +document.querySelector(`.pc-draw-label[data-label-for="${i}"] text`).getAttribute('x'), id);
    await dragDraw(page, 160, 140, 240, 200); // 拖物件
    const after = await page.evaluate(i => +document.querySelector(`.pc-draw-label[data-label-for="${i}"] text`).getAttribute('x'), id);
    console.log('     label move x:', before, '→', after);
    assert(after > before + 40, `標籤應隨物件右移，實際 ${before}→${after}`);
  });

  await test('再次雙擊已有標籤 → 預填既有文字可編輯', async () => {
    await reset('rect');
    await dragDraw(page, 100, 80, 220, 200);
    await page.evaluate(() => window.__drawTest.api.setTool('select'));
    await page.mouse.click(160, 140, { clickCount: 2 });
    await page.waitForSelector('.pc-draw-text-input', { timeout: 2000 });
    await page.fill('.pc-draw-text-input', '原文字');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(30);
    await page.mouse.click(160, 140, { clickCount: 2 }); // 再雙擊
    await page.waitForSelector('.pc-draw-text-input', { timeout: 2000 });
    const prefill = await page.evaluate(() => document.querySelector('.pc-draw-text-input').value);
    await page.fill('.pc-draw-text-input', '改後');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(30);
    const label = await page.evaluate(() => window.__drawTest.api.getObjects()[0].label);
    console.log('     edit existing prefill:', prefill, '→', label);
    assert(prefill === '原文字', `應預填既有文字，實際 ${prefill}`);
    assert(label === '改後', `編輯後 label 應更新，實際 ${label}`);
  });

  await test('label 輸入框打字不觸發工具快捷鍵', async () => {
    await reset('rect');
    await dragDraw(page, 100, 80, 220, 200);
    await page.evaluate(() => window.__drawTest.api.setTool('select'));
    await page.mouse.click(160, 140, { clickCount: 2 });
    await page.waitForSelector('.pc-draw-text-input', { timeout: 2000 });
    await page.focus('.pc-draw-text-input');
    await page.keyboard.press('o'); // 若漏 guard → 會切 ellipse
    const r = await page.evaluate(() => ({
      tool: window.__drawTest.api.getTool(),
      val: document.querySelector('.pc-draw-text-input') ? document.querySelector('.pc-draw-text-input').value : null,
    }));
    console.log('     label typing guard:', JSON.stringify(r));
    assert(r.tool === 'select', `打標籤時不應切工具，實際 ${r.tool}`);
    assert(r.val === 'o', `字元應進輸入框，實際 ${r.val}`);
    await page.keyboard.press('Enter');
    await page.evaluate(() => window.__drawTest.api.clear());
  });

  // ── P3 貼圖 image（addImage / paste / drop）──────────────────────────────────
  console.log('\ndraw-layer e2e — P3 貼圖 image:');

  // 1×1 紅點 PNG（dataURL）。e2e 以明確自然尺寸呼叫 addImage，不需真剪貼簿。
  const PNG_1x1 = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

  // 用 addImage 建一張圖（自然 300×200），回傳 id。
  async function addImg() {
    await page.evaluate(() => { window.__drawTest.api.clear(); window.__drawTest.api.setTool('select'); });
    return page.evaluate(d => window.__drawTest.api.addImage(d, 300, 200).id, PNG_1x1);
  }

  await test('addImage → #pc-draw 渲染 <image href=dataURL> + getObjects tool=image', async () => {
    const id = await addImg();
    const r = await page.evaluate(({ id, d }) => {
      const el = document.querySelector(`#pc-draw image[data-id="${id}"]`);
      const o = window.__drawTest.api.getObjects().find(o => o.id === id);
      return {
        images: document.querySelectorAll('#pc-draw image').length,
        href: el && (el.getAttribute('href') || el.getAttribute('xlink:href')),
        tool: o && o.tool, imageRef: o && o.imageRef, geom: o && o.geom,
        w: el && +el.getAttribute('width'), h: el && +el.getAttribute('height'),
      };
    }, { id, d: PNG_1x1 });
    console.log('     addImage:', JSON.stringify({ ...r, href: r.href && r.href.slice(0, 20) }));
    assert(r.images === 1 && r.href === PNG_1x1, `應渲染 <image> 帶 dataURL，實際 ${r.images}`);
    assert(r.tool === 'image' && r.imageRef === PNG_1x1, 'getObjects 應為 image + imageRef');
    assert(r.geom.w > 0 && r.geom.h > 0 && r.w > 0 && r.h > 0, 'image 應有正尺寸 box');
    // 自然 300×200 在 600×400 畫布 → 50%×50%（未超 60%），渲染 px = 300×200
    assert(Math.abs(r.w - 300) < 2 && Math.abs(r.h - 200) < 2, `渲染尺寸 ~300×200，實際 ${r.w}×${r.h}`);
  });

  await test('image 可選取 + 移動（拖曳 → geom 改變）', async () => {
    const id = await addImg(); // 置中於 (50%,50%) → 約 (175,125)..(425,275)，中心 (300,200)
    await page.evaluate(() => window.__drawTest.api.select(null));
    await page.mouse.click(300, 200); // 點圖中心
    const sel = await page.evaluate(() => window.__drawTest.api.getSelectedIds());
    const before = await page.evaluate(i => window.__drawTest.api.getObjects().find(o => o.id === i).geom, id);
    await dragDraw(page, 300, 200, 360, 250); // 拖圖
    const after = await page.evaluate(i => window.__drawTest.api.getObjects().find(o => o.id === i).geom, id);
    console.log('     image move:', JSON.stringify({ sel: sel.length, bx: before.x, ax: after.x }));
    assert(sel.length === 1 && sel[0] === id, '點圖應選取');
    assert(after.x > before.x + 1 && after.y > before.y + 1, 'image 應可被拖動');
  });

  await test('image 可縮放（拖 se handle → 尺寸改變）', async () => {
    const id = await addImg();
    await page.mouse.click(300, 200); // 選取
    const before = await page.evaluate(i => window.__drawTest.api.getObjects().find(o => o.id === i).geom, id);
    const handle = await page.evaluate(() => {
      const h = document.querySelector('.pc-draw-selection rect[data-handle="se"]');
      const r = h.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    });
    await dragDraw(page, handle.x, handle.y, handle.x + 60, handle.y + 40);
    const after = await page.evaluate(i => window.__drawTest.api.getObjects().find(o => o.id === i).geom, id);
    console.log('     image resize w/h:', before.w, before.h, '→', after.w, after.h);
    assert(after.w > before.w + 1 && after.h > before.h + 1, 'image 應可縮放');
  });

  await test('image z-order：右鍵選單「置底」把圖排到 shape 之下', async () => {
    await page.evaluate(() => { window.__drawTest.api.clear(); window.__drawTest.api.setTool('rect'); });
    await dragDraw(page, 50, 300, 150, 360); // 先畫 rect（底層，與圖不重疊）
    const imgId = await page.evaluate(d => window.__drawTest.api.addImage(d, 300, 200).id, PNG_1x1); // 再建圖（在 rect 之上）
    await page.evaluate(() => window.__drawTest.api.setTool('select'));
    const beforeFirst = await page.evaluate(() => window.__drawTest.api.getObjects()[0].tool);
    await page.mouse.click(300, 200, { button: 'right' }); // 右鍵圖中心 → 選圖 + 開選單
    await page.click('#pc-draw-context .pc-draw-context-item[data-action="back"]'); // 置底
    const r = await page.evaluate(() => ({
      domFirst: document.querySelector('#pc-draw [data-id]').dataset.id,
      objFirst: window.__drawTest.api.getObjects()[0].id,
      objFirstTool: window.__drawTest.api.getObjects()[0].tool,
    }));
    console.log('     image z-order:', JSON.stringify({ beforeFirst, ...r, imgId }));
    assert(beforeFirst === 'rect', '初始 rect 在底層');
    assert(r.domFirst === imgId && r.objFirst === imgId && r.objFirstTool === 'image', '右鍵置底後 image 應在最底（DOM 最前）');
  });

  await test('image 可刪除（Delete 鍵）', async () => {
    const id = await addImg();
    await page.mouse.click(300, 200); // 選取
    await page.keyboard.press('Delete');
    const n = await page.evaluate(() => ({ objs: window.__drawTest.api.getObjects().length, imgs: document.querySelectorAll('#pc-draw image').length }));
    console.log('     image delete:', JSON.stringify(n));
    assert(n.objs === 0 && n.imgs === 0, 'image 應可刪除');
  });

  await test('drop 圖檔 → 建 image 物件（合成 drop 事件 + File）', async () => {
    await page.evaluate(() => { window.__drawTest.api.clear(); window.__drawTest.api.setTool('select'); });
    await page.evaluate(async d => {
      const blob = await (await fetch(d)).blob();
      const file = new File([blob], 'x.png', { type: 'image/png' });
      const dt = new DataTransfer();
      dt.items.add(file);
      const svg = document.getElementById('pc-draw');
      svg.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: dt }));
      svg.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, clientX: 250, clientY: 180, dataTransfer: dt }));
    }, PNG_1x1);
    await page.waitForFunction(() => window.__drawTest.api.getObjects().some(o => o.tool === 'image'), { timeout: 2000 });
    const r = await page.evaluate(() => {
      const o = window.__drawTest.api.getObjects().find(o => o.tool === 'image');
      return { tool: o && o.tool, hasRef: !!(o && o.imageRef), imgs: document.querySelectorAll('#pc-draw image').length };
    });
    console.log('     drop image:', JSON.stringify(r));
    assert(r.tool === 'image' && r.hasRef && r.imgs === 1, 'drop 圖檔應建立 image 物件');
  });

  // ── Feature A：marquee 多選 + 右鍵 z-order 選單 ──────────────────────────────
  console.log('\ndraw-layer e2e — Feature A 多選 / marquee / 右鍵選單:');

  // 畫兩個 rect、回 select 工具、清空選取。回傳兩物件 id。
  async function twoRectsThenSelect() {
    await reset('rect');
    await dragDraw(page, 60, 60, 140, 140);    // A
    await dragDraw(page, 300, 240, 380, 320);  // B
    await page.evaluate(() => { window.__drawTest.api.setTool('select'); window.__drawTest.api.select(null); });
    return page.evaluate(() => window.__drawTest.api.getObjects().map(o => o.id));
  }

  await test('marquee：空白起拖框住兩物件 → 兩個都被選取', async () => {
    await twoRectsThenSelect();
    await dragDraw(page, 20, 20, 420, 360); // 大框涵蓋 A、B
    const r = await page.evaluate(() => ({
      ids: window.__drawTest.api.getSelectedIds(),
      boxes: document.querySelectorAll('.pc-draw-selection rect:not([data-handle])').length,
      marqueeGone: !document.querySelector('.pc-draw-marquee'),
    }));
    console.log('     marquee select:', JSON.stringify(r));
    assert(r.ids.length === 2, `marquee 應選到 2 個，實際 ${r.ids.length}`);
    assert(r.boxes === 2, `應有 2 個選取框，實際 ${r.boxes}`);
    assert(r.marqueeGone, '放開後橡皮筋框應移除');
  });

  await test('Shift+click：加選 / 減選切換', async () => {
    const ids = await twoRectsThenSelect();
    await page.mouse.click(100, 100); // 單選 A
    const after1 = await page.evaluate(() => window.__drawTest.api.getSelectedIds());
    await page.keyboard.down('Shift');
    await page.mouse.click(340, 280); // Shift+click B → 加選
    const after2 = await page.evaluate(() => window.__drawTest.api.getSelectedIds());
    await page.mouse.click(340, 280); // Shift+click B 再一次 → 減選
    const after3 = await page.evaluate(() => window.__drawTest.api.getSelectedIds());
    await page.keyboard.up('Shift');
    console.log('     shift-click:', JSON.stringify({ after1, after2, after3 }));
    assert(after1.length === 1 && after1[0] === ids[0], '單選 A');
    assert(after2.length === 2, 'Shift+click 加選 B → 2 個');
    assert(after3.length === 1 && after3[0] === ids[0], 'Shift+click 再點 B → 減選回 1 個');
  });

  await test('多選 move：拖其中一個 → 全部一起位移', async () => {
    await twoRectsThenSelect();
    await dragDraw(page, 20, 20, 420, 360); // marquee 選兩個
    const before = await page.evaluate(() => window.__drawTest.api.getObjects().map(o => ({ id: o.id, x: o.geom.x, y: o.geom.y })));
    await dragDraw(page, 100, 100, 160, 160); // 拖 A（已選）→ 兩個都移
    const after = await page.evaluate(() => window.__drawTest.api.getObjects().map(o => ({ id: o.id, x: o.geom.x, y: o.geom.y })));
    console.log('     multi-move before/after:', JSON.stringify({ before, after }));
    after.forEach((a, i) => {
      assert(a.x > before[i].x + 1 && a.y > before[i].y + 1, `物件 ${a.id} 應一起右下位移`);
    });
  });

  await test('多選 delete：刪除全部選取', async () => {
    await twoRectsThenSelect();
    await dragDraw(page, 20, 20, 420, 360); // 選兩個
    const n0 = await page.evaluate(() => window.__drawTest.api.getSelectedIds().length);
    await page.evaluate(() => window.__drawTest.api.deleteSelected());
    const after = await page.evaluate(() => ({ objs: window.__drawTest.api.getObjects().length, dom: document.querySelectorAll('#pc-draw [data-id]').length }));
    await page.evaluate(() => window.__drawTest.api.undo()); // undo 應一次還原兩個
    const undone = await page.evaluate(() => window.__drawTest.api.getObjects().length);
    console.log('     multi-delete n0/after/undone:', n0, JSON.stringify(after), undone);
    assert(n0 === 2, '選取 2 個');
    assert(after.objs === 0 && after.dom === 0, 'delete 應清空兩個 + DOM');
    assert(undone === 2, 'undo 一次還原兩個（deleteMany）');
  });

  await test('右鍵 context menu：開選單 + 「置頂」對整個選取重排 SVG DOM', async () => {
    const ids = await twoRectsThenSelect(); // [A, B]，A 在底層
    await page.mouse.click(100, 100); // 選 A（底層）
    await page.mouse.click(100, 100, { button: 'right' }); // 右鍵 A → 開選單
    const menu = await page.evaluate(() => {
      const m = document.getElementById('pc-draw-context');
      return {
        open: m.classList.contains('open'),
        items: [...m.querySelectorAll('.pc-draw-context-item')].map(b => b.dataset.action),
        labels: [...m.querySelectorAll('.pc-draw-context-item')].map(b => b.getAttribute('aria-label')),
      };
    });
    await page.click('#pc-draw-context .pc-draw-context-item[data-action="front"]'); // 置頂
    const r = await page.evaluate(() => ({
      menuClosed: !document.getElementById('pc-draw-context').classList.contains('open'),
      domOrder: [...document.querySelectorAll('#pc-draw [data-id]')].map(e => e.dataset.id),
    }));
    console.log('     context menu:', JSON.stringify(menu), 'after front:', JSON.stringify(r));
    assert(menu.open, '右鍵應開啟 context menu');
    assert(menu.items.join(',') === 'front,forward,backward,back,group,ungroup,delete', `選單項目應齊全，實際 ${menu.items}`);
    assert(menu.labels.join(',') === '置頂,上移一層,下移一層,置底,群組,解散群組,刪除', `選單中文標籤，實際 ${menu.labels}`);
    assert(r.domOrder[r.domOrder.length - 1] === ids[0], '「置頂」後 A 應排到 SVG 最後（最上層）');
    assert(r.menuClosed, '點項目後選單關閉');
  });

  await test('右鍵 context menu：Esc 關閉 + 原生 contextmenu 被攔截', async () => {
    await twoRectsThenSelect();
    await page.mouse.click(100, 100); // 選 A
    await page.mouse.click(100, 100, { button: 'right' });
    const opened = await page.evaluate(() => document.getElementById('pc-draw-context').classList.contains('open'));
    await page.keyboard.press('Escape');
    const closed = await page.evaluate(() => !document.getElementById('pc-draw-context').classList.contains('open'));
    console.log('     esc-close opened/closed:', opened, closed);
    assert(opened, '右鍵開啟');
    assert(closed, 'Esc 關閉');
  });

  await test('單選回歸：單點物件仍只選一個（含 handle）', async () => {
    await twoRectsThenSelect();
    await page.mouse.click(100, 100); // 點 A
    const r = await page.evaluate(() => ({
      ids: window.__drawTest.api.getSelectedIds(),
      single: window.__drawTest.api.getSelected(),
      handles: document.querySelectorAll('.pc-draw-selection rect[data-handle]').length,
    }));
    console.log('     single-select regression:', JSON.stringify(r));
    assert(r.ids.length === 1 && r.single === r.ids[0], '單點 → 只選一個');
    assert(r.handles === 4, '單選顯示 4 個縮放 handle');
  });

  // ── Feature B：吸管 eyedropper ────────────────────────────────────────────────
  console.log('\ndraw-layer e2e — Feature B 吸管:');

  await test('eyedropper 按鈕：存在於色盤 popover + aria-label（mock EyeDropper 已支援）', async () => {
    await reset('rect');
    await page.click('.pc-draw-tool[data-action="color-menu"]'); // 開色盤
    const r = await page.evaluate(() => {
      const b = document.querySelector('.pc-draw-popover[data-menu="color"] .pc-draw-eyedropper[data-action="eyedropper"]');
      return { present: !!b, aria: b && b.getAttribute('aria-label'), hidden: b && (b.disabled || getComputedStyle(b).display === 'none'), hasSvg: b && !!b.querySelector('svg') };
    });
    console.log('     eyedropper btn:', JSON.stringify(r));
    assert(r.present && r.hasSvg, '應有吸管按鈕 + svg 圖示');
    assert(r.aria === '取樣顏色', `aria-label 應為 取樣顏色，實際 ${r.aria}`);
    assert(!r.hidden, 'mock EyeDropper 支援 → 不應隱藏/disabled');
  });

  await test('eyedropper 取樣：picked hex → 下一個新物件沿用（繪圖工具）', async () => {
    await reset('rect');
    await page.evaluate(() => window.__drawTest.setEyedropHex('#7ac943'));
    await page.evaluate(() => window.__drawTest.api.eyedropper()); // 走 EyeDropper mock → setColor
    await page.waitForTimeout(20);
    await dragDraw(page, 120, 90, 220, 190);
    const c = await page.evaluate(() => window.__drawTest.api.getObjects().slice(-1)[0].style.color);
    console.log('     eyedropper new obj color:', c);
    assert(c === '#7ac943', `吸管取樣色應套到新物件，實際 ${c}`);
  });

  await test('eyedropper 取樣：select + 選取 → 改選取物件顏色', async () => {
    await reset('rect');
    await dragDraw(page, 100, 80, 200, 180);
    await page.evaluate(() => window.__drawTest.api.setTool('select')); // 保留選取
    await page.evaluate(() => window.__drawTest.setEyedropHex('#ff8800'));
    await page.evaluate(() => window.__drawTest.api.eyedropper());
    await page.waitForTimeout(20);
    const c = await page.evaluate(() => window.__drawTest.api.getObjects()[0].style.color);
    console.log('     eyedropper restyle selected:', c);
    assert(c === '#ff8800', `吸管應改選取物件顏色，實際 ${c}`);
  });

  // ── P4：selector 擷取 / 結構化匯出 / 截圖 / 送給 AI ──────────────────────────────
  console.log('\ndraw-layer e2e — P4 匯出 / selector / 截圖 / 送給 AI:');

  await test('anchor selector：ellipse 畫在 #price-card 上 → annotation.selector === "#price-card"', async () => {
    await reset('ellipse');
    await dragDraw(page, 110, 80, 210, 160); // 中心 ~160,120 落在 #price-card（client 80..240 / 60..180）
    const r = await page.evaluate(() => {
      const ex = window.__drawTest.api.buildExport();
      const o = window.__drawTest.api.getObjects()[0];
      return { selector: ex.annotations[0].selector, anchor: o.anchor, tool: ex.annotations[0].tool };
    });
    console.log('     anchor capture:', JSON.stringify(r));
    assert(r.tool === 'ellipse', `annotation tool 應 ellipse，實際 ${r.tool}`);
    assert(r.selector === '#price-card', `selector 應解析為 #price-card（elementFromPoint 取底層元件），實際 ${r.selector}`);
  });

  await test('buildExport shape：viewport + 每筆 id/tool/color/geom；labeled 有 text、id 元件上有 selector、空欄省略', async () => {
    await reset('ellipse');
    await dragDraw(page, 110, 80, 210, 160);           // A：ellipse 蓋 #price-card（有 selector、無 text）
    await page.evaluate(() => window.__drawTest.api.setTool('rect'));
    await dragDraw(page, 100, 250, 200, 320);          // B：rect 於畫布下方
    await page.evaluate(() => window.__drawTest.api.setTool('select'));
    await page.mouse.click(150, 285, { clickCount: 2 }); // 雙擊加綁定標籤
    await page.waitForSelector('.pc-draw-text-input', { timeout: 2000 });
    await page.fill('.pc-draw-text-input', '說明');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(40);
    const ex = await page.evaluate(() => window.__drawTest.api.buildExport());
    console.log('     buildExport:', JSON.stringify(ex));
    assert(ex.viewport && ex.viewport.w > 0 && ex.viewport.h > 0, `應有 viewport w/h，實際 ${JSON.stringify(ex.viewport)}`);
    assert(ex.annotations.length === 2, `應有 2 筆 annotation，實際 ${ex.annotations.length}`);
    ex.annotations.forEach((a, i) => {
      assert(typeof a.id === 'string' && a.id, `annotation ${i} 應有 id`);
      assert(typeof a.tool === 'string' && a.tool, `annotation ${i} 應有 tool`);
      assert(a.color, `annotation ${i} 應有 color`);
      assert(a.geom && typeof a.geom === 'object', `annotation ${i} 應有 geom`);
    });
    const ell = ex.annotations.find(a => a.tool === 'ellipse');
    const rect = ex.annotations.find(a => a.tool === 'rect');
    assert(ell.selector === '#price-card', `id 元件上的標注應有 selector，實際 ${ell.selector}`);
    assert(!('text' in ell), 'ellipse 無標籤 → text 欄位應省略（空欄不塞 JSON）');
    assert(rect.text === '說明', `綁定標籤的物件應有 text，實際 ${rect.text}`);
  });

  await test('送給 AI 按鈕 + sendToAgent：工具列鈕開抽屜、footer 鈕 POST endpoint，sendToAgent API 回 payload', async () => {
    // 工具列有送出鈕（data-action=send，aria-label 含「送給 AI」）
    const btn = await page.evaluate(() => {
      const b = document.querySelector('.pc-draw-toolbar [data-action="send"]');
      return { present: !!b, aria: b && b.getAttribute('aria-label') };
    });
    assert(btn.present, '工具列應有送出鈕（data-action=send）');
    assert(btn.aria === '標注紀錄／送給 AI', `送出鈕 aria-label 應為「標注紀錄／送給 AI」，實際 ${btn.aria}`);

    await reset('ellipse');
    await dragDraw(page, 110, 80, 210, 160); // 至少一筆標注
    // stub window.fetch 記錄呼叫，並設定 endpoint
    await page.evaluate(() => {
      window.__fetchCalls = [];
      window.fetch = (url, opts) => { window.__fetchCalls.push({ url, body: opts && opts.body }); return Promise.resolve({ ok: true, json: () => Promise.resolve({}) }); };
      window.__drawTest.api.setExportEndpoint('http://x/api/draw');
    });
    // 點工具列 ✈ 鈕 → 開抽屜（不直接送出）
    await page.click('.pc-draw-toolbar [data-action="send"]');
    const drawerOpened = await page.evaluate(() => document.getElementById('pc-draw-rec-drawer').classList.contains('open'));
    assert(drawerOpened, '點工具列 ✈ 鈕應開啟標注紀錄抽屜');
    // 點抽屜 footer 送出鈕 → 觸發 sendToAgent → fetch
    await page.click('.pc-draw-rec-send-btn');
    await page.waitForFunction(() => window.__fetchCalls && window.__fetchCalls.length > 0, { timeout: 3000 });
    const fc = await page.evaluate(() => {
      const c = window.__fetchCalls[0];
      let parsed = null; try { parsed = JSON.parse(c.body); } catch (_) {}
      return { url: c.url, hasJson: !!(parsed && parsed.json && parsed.json.annotations), annN: parsed && parsed.json && parsed.json.annotations.length };
    });
    console.log('     footer send fetch:', JSON.stringify(fc));
    assert(fc.url === 'http://x/api/draw', `fetch 應送到設定的 endpoint，實際 ${fc.url}`);
    assert(fc.hasJson && fc.annN >= 1, `POST body 應含 json.annotations，實際 ${JSON.stringify(fc)}`);
    // 直接呼叫 sendToAgent API 驗證回傳形狀
    const payload = await page.evaluate(async () => {
      const p = await window.__drawTest.api.sendToAgent();
      return { sent: p.sent, hasJson: !!(p.json && p.json.annotations), pngPrefix: p.png ? p.png.slice(0, 15) : null };
    });
    console.log('     sendToAgent payload:', JSON.stringify(payload));
    assert(payload.sent === true, 'endpoint 設定下 sendToAgent 應回 sent=true');
    assert(payload.hasJson, 'payload 應含 json');
    assert(payload.pngPrefix && payload.pngPrefix.startsWith('data:image/png'), `payload.png 應為 data:image/png，實際 ${payload.pngPrefix}`);
    // 測試結束：關閉抽屜，避免後續 P6 test 接到開啟狀態
    await page.evaluate(() => { const d = document.getElementById('pc-draw-rec-drawer'); if (d && d.classList.contains('open')) window.__drawTest.api.toggleRecordPanel(); });
  });

  await test('capturePng：回傳 data:image/png 字串（chromium rasterize SVG）', async () => {
    await reset('ellipse');
    await dragDraw(page, 110, 80, 210, 160);
    const png = await page.evaluate(async () => {
      const p = await window.__drawTest.api.capturePng();
      return { type: typeof p, prefix: p ? p.slice(0, 15) : null, isNull: p === null };
    });
    console.log('     capturePng:', JSON.stringify(png));
    if (png.isNull) { console.log('     [soft] capturePng 回 null（環境無法 rasterize SVG）→ 軟跳過'); return; }
    assert(png.type === 'string', `capturePng 應回字串，實際 ${png.type}`);
    assert(png.prefix.startsWith('data:image/png'), `應為 data:image/png dataURL，實際 ${png.prefix}`);
  });

  // ── P6：側邊標注紀錄面板（右緣 tab + 抽屜）────────────────────────────────────────
  console.log('\ndraw-layer e2e — P6 側邊標注紀錄面板:');

  await test('面板：tab + drawer 存在；position:fixed；預設 drawer 關閉、tab 顯示（off by default）', async () => {
    await reset('ellipse'); // clear → 無標注
    const r = await page.evaluate(() => {
      const tab = document.getElementById('pc-draw-rec-tab');
      const drawer = document.getElementById('pc-draw-rec-drawer');
      return {
        tab: !!tab, drawer: !!drawer,
        tabShown: tab && tab.classList.contains('show'),
        open: drawer && drawer.classList.contains('open'),
        posTab: tab && getComputedStyle(tab).position,
        posDrawer: drawer && getComputedStyle(drawer).position,
        empty: !!(drawer && drawer.querySelector('.pc-draw-rec-empty')),
      };
    });
    console.log('     panel default:', JSON.stringify(r));
    assert(r.tab && r.drawer, '應有右緣 tab + 抽屜 drawer');
    assert(r.posTab === 'fixed' && r.posDrawer === 'fixed', 'tab/drawer 應 position:fixed');
    assert(r.tabShown, '預設 tab 應顯示（入口）');
    assert(!r.open, '預設 drawer 應關閉（off by default，不打擾一般使用）');
    assert(r.empty, '無標注 → 顯示空狀態');
  });

  await test('面板：畫 3 筆 → 點 tab 開抽屜 → 列出對應 rows（text/selector/icon/swatch）', async () => {
    await reset('ellipse');
    await dragDraw(page, 110, 80, 210, 160);                       // A：ellipse 蓋 #price-card → selector，無 label
    await page.evaluate(() => window.__drawTest.api.setTool('rect'));
    await dragDraw(page, 100, 250, 200, 320);                      // B：rect（待加綁定標籤）
    await page.evaluate(() => window.__drawTest.api.setTool('select'));
    await page.mouse.click(150, 285, { clickCount: 2 });           // 雙擊加綁定標籤
    await page.waitForSelector('.pc-draw-text-input', { timeout: 2000 });
    await page.fill('.pc-draw-text-input', '價格卡');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(40);
    await page.evaluate(() => window.__drawTest.api.setTool('pencil')); // C：自由筆（不在 ANCHOR_TOOLS → 無 selector）
    await page.mouse.move(300, 360);
    await page.mouse.down();
    for (const [x, y] of [[330, 362], [360, 358], [390, 360]]) await page.mouse.move(x, y);
    await page.mouse.up();
    // 點 tab 開面板
    await page.click('#pc-draw-rec-tab');
    const r = await page.evaluate(() => {
      const drawer = document.getElementById('pc-draw-rec-drawer');
      const rows = [...drawer.querySelectorAll('.pc-draw-rec-row')].map(el => ({
        id: el.dataset.id,
        text: el.querySelector('.pc-draw-rec-text').textContent,
        sel: el.querySelector('.pc-draw-rec-sel') ? el.querySelector('.pc-draw-rec-sel').textContent : null,
        hasIcon: !!el.querySelector('.pc-draw-rec-icon svg'),
        hasSwatch: !!el.querySelector('.pc-draw-rec-swatch'),
      }));
      const byId = {}; window.__drawTest.api.getObjects().forEach(o => { byId[o.id] = o.tool; });
      return {
        open: drawer.classList.contains('open'),
        tabShown: document.getElementById('pc-draw-rec-tab').classList.contains('show'),
        count: drawer.querySelector('.pc-draw-rec-count').textContent,
        rows, byId,
      };
    });
    console.log('     panel rows:', JSON.stringify(r));
    assert(r.open && !r.tabShown, '點 tab 應開抽屜並收起 tab');
    assert(r.rows.length === 3 && r.count === '3', `應列 3 筆 + count 3，實際 rows=${r.rows.length} count=${r.count}`);
    const byTool = {}; r.rows.forEach(row => { byTool[r.byId[row.id]] = row; });
    assert(byTool.ellipse.text === '圈選', `ellipse 無 label → 友善預設「圈選」，實際 ${byTool.ellipse.text}`);
    assert(byTool.ellipse.sel === '#price-card', `ellipse row 應顯示 selector #price-card，實際 ${byTool.ellipse.sel}`);
    assert(byTool.rect.text === '價格卡', `rect row 應顯示綁定標籤，實際 ${byTool.rect.text}`);
    assert(byTool.pencil.text === '手繪' && byTool.pencil.sel === null, `pencil 無 anchor → 無 selector + 友善預設，實際 ${JSON.stringify(byTool.pencil)}`);
    assert(r.rows.every(row => row.hasIcon && row.hasSwatch), '每筆 row 應有工具圖示 + 色票');
  });

  await test('面板：點 row → 選取該物件（getSelectedIds）+ row 高亮 selected', async () => {
    await page.evaluate(() => {
      const d = document.getElementById('pc-draw-rec-drawer');
      if (!d.classList.contains('open')) document.getElementById('pc-draw-rec-tab').click();
    });
    const targetId = await page.evaluate(() => window.__drawTest.api.getObjects()[0].id);
    await page.click(`.pc-draw-rec-row[data-id="${targetId}"]`);
    const r = await page.evaluate((id) => {
      const row = document.querySelector(`.pc-draw-rec-row[data-id="${id}"]`);
      return { sel: window.__drawTest.api.getSelectedIds(), selected: row.classList.contains('selected') };
    }, targetId);
    console.log('     row click → select:', JSON.stringify(r));
    assert(r.sel.length === 1 && r.sel[0] === targetId, `點 row 應選取該物件，實際 ${JSON.stringify(r.sel)}`);
    assert(r.selected, '被選取的 row 應有 selected 高亮');
  });

  await test('面板：刪除物件 → 即時更新（count 減少、該 row 移除）', async () => {
    const before = await page.evaluate(() => document.querySelectorAll('.pc-draw-rec-row').length);
    const delId = await page.evaluate(() => {
      const id = window.__drawTest.api.getObjects()[0].id;
      window.__drawTest.api.select(id);
      window.__drawTest.api.deleteSelected();
      return id;
    });
    const r = await page.evaluate((id) => ({
      rows: document.querySelectorAll('.pc-draw-rec-row').length,
      count: document.querySelector('.pc-draw-rec-count').textContent,
      gone: !document.querySelector(`.pc-draw-rec-row[data-id="${id}"]`),
    }), delId);
    console.log('     after delete:', before, '→', JSON.stringify(r));
    assert(r.rows === before - 1, `刪除後 row 應 ${before - 1}，實際 ${r.rows}`);
    assert(r.count === String(before - 1), `count 應更新為 ${before - 1}，實際 ${r.count}`);
    assert(r.gone, '被刪物件的 row 應從面板移除（即時更新）');
  });

  await test('面板：清空 → 顯示空狀態「尚無標注」', async () => {
    await page.evaluate(() => window.__drawTest.api.clear());
    const r = await page.evaluate(() => {
      const list = document.querySelector('.pc-draw-rec-list');
      const empty = list.querySelector('.pc-draw-rec-empty');
      return {
        rows: list.querySelectorAll('.pc-draw-rec-row').length,
        empty: !!empty, text: empty ? empty.textContent : null,
        count: document.querySelector('.pc-draw-rec-count').textContent,
      };
    });
    console.log('     empty state:', JSON.stringify(r));
    assert(r.rows === 0, '清空後不應有 row');
    assert(r.empty && /尚無標注/.test(r.text), `應顯示友善空狀態，實際 ${r.text}`);
    assert(r.count === '0', `count 應為 0，實際 ${r.count}`);
  });

  // ── Fix 2：工具列 ✈ 鈕開抽屜 + 抽屜 footer「送給 AI（N）」────────────────────────
  console.log('\ndraw-layer e2e — Fix 2 send-to-agent UX:');

  await test('Fix2 工具列 ✈ 鈕 → 開標注紀錄抽屜（不直接送出）', async () => {
    await reset('ellipse');
    // 確保抽屜關閉（若前面 test 留開著）
    await page.evaluate(() => { const d = document.getElementById('pc-draw-rec-drawer'); if (d.classList.contains('open')) d.classList.remove('open'); document.getElementById('pc-draw-rec-tab').classList.add('show'); });
    const before = await page.evaluate(() => document.getElementById('pc-draw-rec-drawer').classList.contains('open'));
    assert(!before, 'precondition：抽屜應關閉');
    await page.click('.pc-draw-toolbar [data-action="send"]');
    const r = await page.evaluate(() => ({
      open: document.getElementById('pc-draw-rec-drawer').classList.contains('open'),
      tabHidden: !document.getElementById('pc-draw-rec-tab').classList.contains('show'),
    }));
    console.log('     toolbar send → drawer:', JSON.stringify(r));
    assert(r.open, '點工具列 ✈ 鈕應開啟標注紀錄抽屜');
    assert(r.tabHidden, '抽屜開啟後 tab 應收起');
  });

  await test('Fix2 footer 送出鈕：0 標注 → disabled；畫 1 筆 → 顯示「送給 AI（1）」且 enabled', async () => {
    await reset('ellipse');
    // 點工具列鈕開抽屜
    await page.click('.pc-draw-toolbar [data-action="send"]');
    const r0 = await page.evaluate(() => {
      const btn = document.querySelector('.pc-draw-rec-send-btn');
      return { text: btn && btn.textContent.trim(), disabled: btn && btn.disabled };
    });
    assert(r0.disabled, `0 標注時 footer 送出鈕應 disabled，實際 ${JSON.stringify(r0)}`);
    // 畫一筆
    await page.evaluate(() => window.__drawTest.api.setTool('ellipse'));
    await dragDraw(page, 110, 80, 210, 160);
    const r1 = await page.evaluate(() => {
      const btn = document.querySelector('.pc-draw-rec-send-btn');
      return { text: btn && btn.textContent.trim(), disabled: btn && btn.disabled };
    });
    console.log('     footer btn 0→1 annot:', JSON.stringify({ r0, r1 }));
    assert(!r1.disabled, `有標注後 footer 送出鈕應 enabled，實際 ${JSON.stringify(r1)}`);
    assert(r1.text === '送給 AI（1）', `footer 送出鈕文字應為「送給 AI（1）」，實際 ${r1.text}`);
  });

  await test('Fix2 footer 送出鈕：AI 在線(listening:true) → 顯示「✅ 已送達 AI」', async () => {
    // 承接上一個 test：畫布有 1 筆標注、抽屜已開
    await page.evaluate(() => {
      window.__fetchCallsFix2 = [];
      window.fetch = (url, opts) => { window.__fetchCallsFix2.push({ url }); return Promise.resolve({ ok: true, json: () => Promise.resolve({ ok: true, n: 1, listening: true }) }); };
      window.__drawTest.api.setExportEndpoint('http://x/api/draw');
    });
    await page.click('.pc-draw-rec-send-btn');
    await page.waitForFunction(() => window.__fetchCallsFix2 && window.__fetchCallsFix2.length > 0, { timeout: 3000 });
    const r = await page.evaluate(() => {
      const btn = document.querySelector('.pc-draw-rec-send-btn');
      return { fetchCount: window.__fetchCallsFix2.length, btnText: btn && btn.textContent.trim(), disabled: btn && btn.disabled, queued: btn && btn.classList.contains('pc-draw-rec-queued') };
    });
    console.log('     footer send (online) result:', JSON.stringify(r));
    assert(r.fetchCount === 1, `應恰好 fetch 一次，實際 ${r.fetchCount}`);
    assert(/已送達/.test(r.btnText), `AI 在線送出後應顯示「✅ 已送達 AI」，實際 ${r.btnText}`);
    assert(!r.queued, 'AI 在線不應有 queued 樣式');
    assert(r.disabled, '送出後短暫 disabled（防連點）');
  });

  await test('Fix2 footer 送出鈕：AI 未連線→「📥 已排佇列」；送出後維持 disabled「✅ 已送出」(不會以為沒送)', async () => {
    await reset('ellipse');
    await dragDraw(page, 110, 80, 210, 160);
    await page.evaluate(() => { const d = document.getElementById('pc-draw-rec-drawer'); if (!d.classList.contains('open')) window.__drawTest.api.toggleRecordPanel(); });
    await page.evaluate(() => {
      window.__fetchQueued = 0;
      window.fetch = () => { window.__fetchQueued++; return Promise.resolve({ ok: true, json: () => Promise.resolve({ ok: true, n: 1, listening: false }) }); };
      window.__drawTest.api.setExportEndpoint('http://x/api/draw');
    });
    await page.click('.pc-draw-rec-send-btn');
    await page.waitForFunction(() => window.__fetchQueued > 0, { timeout: 3000 });
    const r1 = await page.evaluate(() => { const b = document.querySelector('.pc-draw-rec-send-btn'); return { text: b.textContent.trim(), queued: b.classList.contains('pc-draw-rec-queued') }; });
    assert(/已排佇列/.test(r1.text), `AI 未連線應顯示「📥 已排佇列」，實際 ${r1.text}`);
    assert(r1.queued, 'AI 未連線應有 queued 樣式');
    // 送出後（inflight 結束）→ 維持 disabled 並顯示「✅ 已送出」，不會回到看起來沒送的狀態
    await page.waitForFunction(() => { const b = document.querySelector('.pc-draw-rec-send-btn'); return b && !b.dataset.inflight; }, { timeout: 3000 });
    const r2 = await page.evaluate(() => { const b = document.querySelector('.pc-draw-rec-send-btn'); return { text: b.textContent.trim(), disabled: b.disabled }; });
    console.log('     after-send sticky:', JSON.stringify(r2));
    assert(/已送出/.test(r2.text) && r2.disabled, `送出後應維持 disabled「✅ 已送出」，實際 ${JSON.stringify(r2)}`);
    // 內容改變（再畫一筆）→ 按鈕恢復可送
    await page.evaluate(() => window.__drawTest.api.setTool('ellipse'));
    await dragDraw(page, 250, 250, 320, 320);
    const r3 = await page.evaluate(() => { const b = document.querySelector('.pc-draw-rec-send-btn'); return { text: b.textContent.trim(), disabled: b.disabled }; });
    assert(/送給 AI/.test(r3.text) && !r3.disabled, `有新標注後應恢復可送，實際 ${JSON.stringify(r3)}`);
    await page.evaluate(() => { const d = document.getElementById('pc-draw-rec-drawer'); if (d.classList.contains('open')) window.__drawTest.api.toggleRecordPanel(); });
  });

  await test('面板每列「已送/未送」：送出後該列標已送、新畫的標未送、改過的回未送', async () => {
    await reset('ellipse');
    await dragDraw(page, 110, 80, 210, 160); // 第 1 筆
    await page.evaluate(() => { const d = document.getElementById('pc-draw-rec-drawer'); if (!d.classList.contains('open')) window.__drawTest.api.toggleRecordPanel(); });
    // 送出前：未送
    const before = await page.evaluate(() => [...document.querySelectorAll('.pc-draw-rec-status')].map(s => s.textContent.trim()));
    assert(before.length === 1 && /未送/.test(before[0]), `送出前應全未送，實際 ${JSON.stringify(before)}`);
    // 送出（AI 在線）
    await page.evaluate(() => {
      window.fetch = () => Promise.resolve({ ok: true, json: () => Promise.resolve({ ok: true, n: 1, listening: true }) });
      window.__drawTest.api.setExportEndpoint('http://x/api/draw');
    });
    await page.click('.pc-draw-rec-send-btn');
    await page.waitForFunction(() => { const s = document.querySelector('.pc-draw-rec-status'); return s && /已送/.test(s.textContent); }, { timeout: 3000 });
    // 再畫第 2 筆 → 它未送、第 1 筆仍已送
    await page.evaluate(() => window.__drawTest.api.setTool('ellipse'));
    await dragDraw(page, 250, 250, 320, 310);
    const rows = await page.evaluate(() => [...document.querySelectorAll('.pc-draw-rec-row')].map(r => { const s = r.querySelector('.pc-draw-rec-status'); return s && (s.classList.contains('is-sent') ? 'sent' : 'unsent'); }));
    console.log('     per-row sent state:', JSON.stringify(rows));
    assert(rows.length === 2 && rows.filter(x => x === 'sent').length === 1 && rows.filter(x => x === 'unsent').length === 1, `應 1 已送 + 1 未送，實際 ${JSON.stringify(rows)}`);
    await page.evaluate(() => { const d = document.getElementById('pc-draw-rec-drawer'); if (d.classList.contains('open')) window.__drawTest.api.toggleRecordPanel(); });
  });

  await test('多選送出：取消勾選某列 → 只送勾選的；全選框可全勾/全不選', async () => {
    await reset('ellipse');
    await dragDraw(page, 110, 80, 200, 150); // 第 1 筆
    await page.evaluate(() => window.__drawTest.api.setTool('ellipse'));
    await dragDraw(page, 250, 250, 330, 320); // 第 2 筆
    await page.evaluate(() => { const d = document.getElementById('pc-draw-rec-drawer'); if (!d.classList.contains('open')) window.__drawTest.api.toggleRecordPanel(); });
    // 預設兩列都勾 → 「送給 AI（2）」
    const t0 = await page.evaluate(() => document.querySelector('.pc-draw-rec-send-btn').textContent.trim());
    assert(/（2）/.test(t0), `預設應全勾顯示「送給 AI（2）」，實際 ${t0}`);
    // 取消第 1 列勾選 → 「送給 AI（1）」
    await page.evaluate(() => { const cbs = document.querySelectorAll('.pc-draw-rec-check'); cbs[0].click(); });
    const t1 = await page.evaluate(() => document.querySelector('.pc-draw-rec-send-btn').textContent.trim());
    assert(/（1）/.test(t1), `取消 1 列後應顯示「送給 AI（1）」，實際 ${t1}`);
    // 送出 → POST body 只含 1 筆 annotation
    await page.evaluate(() => {
      window.__sendBody = null;
      window.fetch = (url, opts) => { try { window.__sendBody = JSON.parse(opts.body); } catch (_) {} return Promise.resolve({ ok: true, json: () => Promise.resolve({ ok: true, n: 1, listening: true }) }); };
      window.__drawTest.api.setExportEndpoint('http://x/api/draw');
    });
    await page.click('.pc-draw-rec-send-btn');
    await page.waitForFunction(() => window.__sendBody, { timeout: 3000 });
    const annN = await page.evaluate(() => window.__sendBody.json.annotations.length);
    console.log('     multi-select sent annotations:', annN);
    assert(annN === 1, `只勾 1 列 → 送出應只含 1 筆，實際 ${annN}`);
    // 全選框：全不選 → 送出鈕 disabled / 「送給 AI（0）」
    await page.waitForFunction(() => { const b = document.querySelector('.pc-draw-rec-send-btn'); return b && !b.dataset.inflight; }, { timeout: 3000 });
    await page.evaluate(() => { const a = document.querySelector('.pc-draw-rec-all'); if (a.checked || a.indeterminate) a.click(); if (document.querySelector('.pc-draw-rec-all').checked) document.querySelector('.pc-draw-rec-all').click(); });
    const r = await page.evaluate(() => { const b = document.querySelector('.pc-draw-rec-send-btn'); return { text: b.textContent.trim(), disabled: b.disabled }; });
    assert(/（0）/.test(r.text) && r.disabled, `全不選後應「送給 AI（0）」且 disabled，實際 ${JSON.stringify(r)}`);
    // 全選回來 → （2）enabled
    await page.evaluate(() => { const a = document.querySelector('.pc-draw-rec-all'); if (!a.checked) a.click(); });
    const r2 = await page.evaluate(() => { const b = document.querySelector('.pc-draw-rec-send-btn'); return { text: b.textContent.trim(), disabled: b.disabled }; });
    assert(/（2）/.test(r2.text) && !r2.disabled, `全選後應「送給 AI（2）」且 enabled，實際 ${JSON.stringify(r2)}`);
    await page.evaluate(() => { const d = document.getElementById('pc-draw-rec-drawer'); if (d.classList.contains('open')) window.__drawTest.api.toggleRecordPanel(); });
  });

  await test('AI 方案卡：ingestReplies 渲染錨定卡(文字+選項)；點選項 → POST choice + 標已選', async () => {
    await reset('select');
    await page.evaluate(() => {
      window.__choiceBody = null;
      window.fetch = (url, opts) => { if (/draw-choice/.test(url)) { try { window.__choiceBody = JSON.parse(opts.body); } catch (_) {} } return Promise.resolve({ ok: true, json: () => Promise.resolve({ ok: true }) }); };
      window.__drawTest.api.ingestReplies([{ n: 1, anchor: { x: 40, y: 50 }, text: '建議改多選', options: [{ id: 'multi', label: '多選+其他' }, { id: 'select', label: '下拉' }] }]);
    });
    const card = await page.evaluate(() => {
      const c = document.querySelector('.pc-draw-reply-card');
      return { present: !!c, text: c && c.querySelector('.pc-draw-reply-text').textContent, opts: c ? [...c.querySelectorAll('.pc-draw-reply-opt')].map(b => b.textContent) : [] };
    });
    assert(card.present, '應渲染 AI 方案卡');
    assert(card.text === '建議改多選', `卡片文字，實際 ${card.text}`);
    assert(card.opts.length === 2 && card.opts[0] === '多選+其他', `應有 2 個選項，實際 ${JSON.stringify(card.opts)}`);
    await page.click('.pc-draw-reply-opt'); // 點第一個選項
    await page.waitForFunction(() => window.__choiceBody, { timeout: 3000 });
    const body = await page.evaluate(() => window.__choiceBody);
    console.log('     reply choice body:', JSON.stringify(body));
    assert(body.replyId === 1 && body.optionId === 'multi', `choice body 應帶 replyId/optionId，實際 ${JSON.stringify(body)}`);
    const chosen = await page.evaluate(() => { const c = document.querySelector('.pc-draw-reply-chosen'); return c && c.textContent; });
    assert(chosen && /已選/.test(chosen), `點後卡片應顯示「已選」，實際 ${chosen}`);
    await page.evaluate(() => window.__drawTest.api.clear && window.__drawTest.api.clear());
  });

  await test('AI 方案卡：選項帶 desc + preview → 圖文卡片式渲染', async () => {
    await reset('select');
    await page.evaluate(() => {
      window.__drawTest.api.ingestReplies([{ n: 7, anchor: { x: 40, y: 50 }, text: '挑一種', options: [
        { id: 'multi', label: '多選核取＋其他', desc: '可複選多項', preview: '☑ 素食  ☐ 不吃牛\n☐ 其他：[____]' },
        { id: 'select', label: '單選下拉', desc: '一次一個', preview: '[ 無        ▾ ]' },
      ] }]);
    });
    const r = await page.evaluate(() => {
      const c = document.querySelector('.pc-draw-reply-card');
      return {
        rich: !!c.querySelector('.pc-draw-reply-opts.is-rich'),
        descs: [...c.querySelectorAll('.pc-draw-reply-opt-desc')].map(d => d.textContent),
        previews: [...c.querySelectorAll('.pc-draw-reply-preview')].map(p => p.textContent),
      };
    });
    console.log('     rich reply card:', JSON.stringify(r));
    assert(r.rich, '應為圖文卡片式（is-rich）');
    assert(r.descs.length === 2 && r.descs[0] === '可複選多項', `應渲染 desc，實際 ${JSON.stringify(r.descs)}`);
    assert(r.previews.length === 2 && /素食/.test(r.previews[0]), `應渲染 preview 示意圖，實際 ${JSON.stringify(r.previews)}`);
    await page.evaluate(() => window.__drawTest.api.clear && window.__drawTest.api.clear());
  });

  await test('標注紀錄頂部顯示「送出畫面」縮圖（.pc-draw-rec-preview）', async () => {
    await reset('ellipse');
    await dragDraw(page, 110, 80, 210, 160);
    // 確保抽屜開著（前一個測試可能殘留開/關狀態）→ 用 API 而非點工具列鈕（抽屜會蓋住工具列）
    await page.evaluate(() => { if (!document.querySelector('.pc-draw-rec-drawer.open')) window.__drawTest.api.toggleRecordPanel(); });
    await page.waitForTimeout(250);
    const r = await page.evaluate(() => {
      const list = document.querySelector('.pc-draw-rec-list');
      return { hasPreview: !!document.querySelector('.pc-draw-rec-preview'), first: !!(list && list.firstChild && list.firstChild.className === 'pc-draw-rec-preview') };
    });
    assert(r.hasPreview, '標注紀錄頂部應有縮圖預覽 img');
    assert(r.first, '縮圖應置於列表頂端');
  });

  // ── Phase A：arrow/line 端點 handle + 拖曳重指向 ─────────────────────────────
  console.log('\ndraw-layer e2e — Phase A 端點 handle:');

  await test('選取 arrow → 出現 2 個 [data-endpoint] 圓 handle，無 [data-handle] bbox 角', async () => {
    await reset('arrow');
    await dragDraw(page, 100, 80, 300, 200);
    // 切 select 工具後點 arrow 選取
    await page.evaluate(() => window.__drawTest.api.setTool('select'));
    await page.mouse.click(200, 140);
    await page.waitForTimeout(30);
    const r = await page.evaluate(() => {
      const endpoints = document.querySelectorAll('#pc-draw [data-endpoint]');
      const handles = document.querySelectorAll('#pc-draw [data-handle]');
      const objs = window.__drawTest.api.getObjects();
      return {
        endpointCount: endpoints.length,
        handleCount: handles.length,
        endpointValues: [...endpoints].map(el => el.getAttribute('data-endpoint')).sort(),
        objTool: objs[0] && objs[0].tool,
      };
    });
    console.log('     arrow selection handles:', JSON.stringify(r));
    assert(r.objTool === 'arrow', `物件應為 arrow，實際 ${r.objTool}`);
    assert(r.endpointCount === 2, `應有 2 個 data-endpoint handle，實際 ${r.endpointCount}`);
    assert(r.handleCount === 0, `arrow 不應出現 data-handle bbox 角，實際 ${r.handleCount}`);
    assert(r.endpointValues[0] === 'from' && r.endpointValues[1] === 'to', `data-endpoint 應為 from/to，實際 ${JSON.stringify(r.endpointValues)}`);
  });

  await test('拖曳 arrow to 端點 → geom.to 改變、geom.from 不變', async () => {
    // 承接上一個 test：畫布有 1 個已選取的 arrow
    const before = await page.evaluate(() => {
      const o = window.__drawTest.api.getObjects()[0];
      return { from: { ...o.geom.from }, to: { ...o.geom.to } };
    });
    // 找到 to handle 的 px 座標（cx/cy 屬性），拖往新位置
    const toHandlePos = await page.evaluate(() => {
      const el = document.querySelector('#pc-draw [data-endpoint="to"]');
      return el ? { cx: parseFloat(el.getAttribute('cx')), cy: parseFloat(el.getAttribute('cy')) } : null;
    });
    assert(toHandlePos, 'to handle 應存在');
    await page.mouse.move(toHandlePos.cx, toHandlePos.cy);
    await page.mouse.down();
    await page.mouse.move(toHandlePos.cx + 60, toHandlePos.cy + 40);
    await page.mouse.up();
    await page.waitForTimeout(30);
    const after = await page.evaluate(() => {
      const o = window.__drawTest.api.getObjects()[0];
      return { from: { ...o.geom.from }, to: { ...o.geom.to } };
    });
    console.log('     before:', JSON.stringify(before), '→ after:', JSON.stringify(after));
    assert(after.to.x !== before.to.x || after.to.y !== before.to.y, 'geom.to 應已改變');
    assert(Math.abs(after.from.x - before.from.x) < 0.01 && Math.abs(after.from.y - before.from.y) < 0.01, 'geom.from 應不變');
  });

  await test('選取 rect → 出現 4 個 [data-handle] bbox 角，無 [data-endpoint]（非 regression）', async () => {
    await reset('rect');
    await dragDraw(page, 80, 80, 220, 180);
    await page.evaluate(() => window.__drawTest.api.setTool('select'));
    await page.mouse.click(150, 130);
    await page.waitForTimeout(30);
    const r = await page.evaluate(() => ({
      handleCount: document.querySelectorAll('#pc-draw [data-handle]').length,
      endpointCount: document.querySelectorAll('#pc-draw [data-endpoint]').length,
    }));
    console.log('     rect selection handles:', JSON.stringify(r));
    assert(r.handleCount === 4, `rect 應有 4 個 data-handle，實際 ${r.handleCount}`);
    assert(r.endpointCount === 0, `rect 不應出現 data-endpoint，實際 ${r.endpointCount}`);
  });

  // ── Batch 4：端點吸附 element anchor + live reposition + 接近高亮 ───────────────
  console.log('\ndraw-layer e2e — Batch 4 端點吸附/anchor/live:');

  // 重設 #submit-btn 到已知位置（前面測試可能改過 style），畫一條 arrow 並選取。
  async function setupArrowForSnap() {
    await page.evaluate(() => {
      const b = document.querySelector('#submit-btn');
      b.style.left = '400px'; b.style.top = '300px'; b.style.width = '80px'; b.style.height = '30px';
      window.__drawTest.api.clear();
      window.__drawTest.api.setTool('arrow');
    });
    await dragDraw(page, 100, 80, 250, 150); // 畫 arrow（自動選取）
    await page.evaluate(() => window.__drawTest.api.setTool('select'));
    await page.mouse.click(175, 115); // 確保選取
    await page.waitForTimeout(30);
  }
  // 回傳 #submit-btn 上邊中點附近的 viewport 座標（吸附目標）。
  async function btnTopMid() {
    return page.evaluate(() => {
      const r = document.querySelector('#submit-btn').getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + 4 }; // 略入上緣 → 投影到 top 邊
    });
  }
  async function toHandlePos() {
    return page.evaluate(() => {
      const el = document.querySelector('#pc-draw [data-endpoint="to"]');
      return el ? { cx: parseFloat(el.getAttribute('cx')), cy: parseFloat(el.getAttribute('cy')) } : null;
    });
  }

  await test('拖 to 端點到 #submit-btn 邊緣 → 吸附 + endAnchors.to.kind===el + selector 命中', async () => {
    await setupArrowForSnap();
    const h = await toHandlePos();
    const t = await btnTopMid();
    await page.mouse.move(h.cx, h.cy);
    await page.mouse.down();
    await page.mouse.move((h.cx + t.x) / 2, (h.cy + t.y) / 2);
    await page.mouse.move(t.x, t.y);
    await page.mouse.up();
    await page.waitForTimeout(30);
    const r = await page.evaluate(() => {
      const o = window.__drawTest.api.getObjects()[0];
      return { endAnchors: o.endAnchors || null, to: o.geom.to };
    });
    console.log('     snap result:', JSON.stringify(r));
    assert(r.endAnchors && r.endAnchors.to, 'endAnchors.to 應建立');
    assert(r.endAnchors.to.kind === 'el', `anchor kind 應為 el，實際 ${r.endAnchors.to.kind}`);
    assert(r.endAnchors.to.selector === '#submit-btn', `selector 應命中 #submit-btn，實際 ${r.endAnchors.to.selector}`);
    assert(typeof r.endAnchors.to.relX === 'number' && typeof r.endAnchors.to.relY === 'number', '應有 relX/relY');
  });

  await test('live reposition：移動 #submit-btn → arrow to 端點跟著移動', async () => {
    // 承上：arrow 的 to 已鎖到 #submit-btn 上緣。讀渲染 line 的 y2，移動按鈕後應變大。
    const before = await page.evaluate(() => parseFloat(document.querySelector('#pc-draw line').getAttribute('y2')));
    await page.evaluate(() => { document.querySelector('#submit-btn').style.top = '360px'; }); // 下移 60px
    await page.waitForTimeout(120); // 等 rAF live loop 比對 → render
    const after = await page.evaluate(() => parseFloat(document.querySelector('#pc-draw line').getAttribute('y2')));
    console.log('     line y2 before/after move:', before, '→', after);
    assert(after > before + 20, `按鈕下移後 to 端點 y2 應變大，實際 ${before} → ${after}`);
  });

  await test('接近元件 → 出現 dashed teal 高亮 rect；放開 → 消失', async () => {
    await setupArrowForSnap();
    const h = await toHandlePos();
    const t = await btnTopMid();
    await page.mouse.move(h.cx, h.cy);
    await page.mouse.down();
    await page.mouse.move(t.x, t.y); // 移到按鈕上緣（吸附中）
    await page.waitForTimeout(20);
    const during = await page.evaluate(() => document.querySelectorAll('#pc-draw .pc-draw-snap-hl').length);
    await page.mouse.up();
    await page.waitForTimeout(20);
    const after = await page.evaluate(() => document.querySelectorAll('#pc-draw .pc-draw-snap-hl').length);
    console.log('     highlight during/after:', during, after);
    assert(during === 1, `吸附中應有 1 個高亮 rect，實際 ${during}`);
    assert(after === 0, `放開後高亮應消失，實際 ${after}`);
  });

  await test('undo 還原端點 + anchor', async () => {
    await setupArrowForSnap();
    const h = await toHandlePos();
    const t = await btnTopMid();
    const beforeTo = await page.evaluate(() => ({ ...window.__drawTest.api.getObjects()[0].geom.to }));
    await page.mouse.move(h.cx, h.cy);
    await page.mouse.down();
    await page.mouse.move(t.x, t.y);
    await page.mouse.up();
    await page.waitForTimeout(30);
    const snapped = await page.evaluate(() => !!(window.__drawTest.api.getObjects()[0].endAnchors || {}).to);
    assert(snapped, 'undo 前應已建立 anchor');
    await page.evaluate(() => window.__drawTest.api.undo());
    await page.waitForTimeout(30);
    const r = await page.evaluate(() => {
      const o = window.__drawTest.api.getObjects()[0];
      return { hasAnchor: !!(o.endAnchors || {}).to, to: o.geom.to };
    });
    console.log('     after undo:', JSON.stringify(r), 'origTo:', JSON.stringify(beforeTo));
    assert(!r.hasAnchor, 'undo 後 endAnchors.to 應清除');
    assert(Math.abs(r.to.x - beforeTo.x) < 0.01 && Math.abs(r.to.y - beforeTo.y) < 0.01, 'undo 後 geom.to 應還原');
  });

  await test('重拖已 anchored 的 to 端點 → 拖曳中即時跟手（不被舊 anchor 鎖住）', async () => {
    await setupArrowForSnap();
    let h = await toHandlePos();
    const t = await btnTopMid();
    await page.mouse.move(h.cx, h.cy); // 先把 to 鎖到 #submit-btn
    await page.mouse.down();
    await page.mouse.move(t.x, t.y);
    await page.mouse.up();
    await page.waitForTimeout(30);
    const anchoredY2 = await page.evaluate(() => parseFloat(document.querySelector('#pc-draw line').getAttribute('y2')));
    h = await toHandlePos(); // anchored 後 handle 落在按鈕上緣
    await page.mouse.move(h.cx, h.cy);
    await page.mouse.down();
    await page.mouse.move(h.cx, 80); // 往上拖離按鈕（未放開）
    await page.waitForTimeout(20);
    const duringY2 = await page.evaluate(() => parseFloat(document.querySelector('#pc-draw line').getAttribute('y2')));
    await page.mouse.up();
    await page.waitForTimeout(20);
    console.log('     re-drag anchored y2 during:', anchoredY2, '→', duringY2);
    assert(duringY2 < anchoredY2 - 100, `重拖 anchored 端點應即時跟手上移，實際 ${anchoredY2} → ${duringY2}`);
  });

  // ── Batch 5：箭頭吸附「自繪形狀」+ 畫線時即時吸附 ────────────────────────────────
  console.log('\ndraw-layer e2e — Batch 5 attach 到自繪形狀 / 繪製時吸附:');

  // 畫一個 rect 當吸附目標，回傳其 id。canvas 僅 600×400，座標需落在範圍內。
  async function drawTargetRect() {
    await page.evaluate(() => { window.__drawTest.api.clear(); window.__drawTest.api.setTool('rect'); });
    await dragDraw(page, 380, 250, 500, 330);
    return page.evaluate(() => window.__drawTest.api.getObjects().find(o => o.tool === 'rect').id);
  }
  // rect 上邊中點的 viewport 座標（吸附目標點）。
  async function rectTopMid() {
    return page.evaluate(() => {
      const o = window.__drawTest.api.getObjects().find(o => o.tool === 'rect');
      const r = document.querySelector('#pc-draw').getBoundingClientRect();
      return { x: r.left + (o.geom.x + o.geom.w / 2) / 100 * r.width, y: r.top + o.geom.y / 100 * r.height };
    });
  }

  await test('拖 arrow to 端點到自繪 rect → endAnchors.to.kind===obj + objId 命中 rect', async () => {
    const rectId = await drawTargetRect();
    await page.evaluate(() => window.__drawTest.api.setTool('arrow'));
    await dragDraw(page, 120, 100, 250, 180);
    await page.evaluate(() => window.__drawTest.api.setTool('select'));
    await page.mouse.click(185, 140);
    await page.waitForTimeout(30);
    const h = await page.evaluate(() => { const el = document.querySelector('#pc-draw [data-endpoint="to"]'); return { cx: +el.getAttribute('cx'), cy: +el.getAttribute('cy') }; });
    const t = await rectTopMid();
    await page.mouse.move(h.cx, h.cy); await page.mouse.down();
    await page.mouse.move((h.cx + t.x) / 2, (h.cy + t.y) / 2); await page.mouse.move(t.x, t.y); await page.mouse.up();
    await page.waitForTimeout(30);
    const r = await page.evaluate(() => (window.__drawTest.api.getObjects().find(o => o.tool === 'arrow').endAnchors || {}).to || null);
    console.log('     attach-to-shape anchor:', JSON.stringify(r));
    assert(r && r.kind === 'obj', `to anchor 應為 obj，實際 ${r && r.kind}`);
    assert(r.objId === rectId, `objId 應命中 rect ${rectId}，實際 ${r.objId}`);
    assert(typeof r.relX === 'number' && typeof r.relY === 'number', '應帶 relX/relY');
  });

  await test('自繪 rect 移動 → 吸附其上的 arrow 端點跟著移動', async () => {
    // 承上：arrow.to 已鎖 rect 上緣。移動 rect → arrow line y2 變大。
    const before = await page.evaluate(() => +document.querySelector('#pc-draw line').getAttribute('y2'));
    await page.evaluate(() => window.__drawTest.api.setTool('select'));
    await page.mouse.click(440, 290); // 選 rect（中心）
    await page.waitForTimeout(20);
    await page.mouse.move(440, 290); await page.mouse.down();
    await page.mouse.move(440, 330); await page.mouse.move(440, 360); await page.mouse.up(); // rect 下移（仍在 canvas 內）
    await page.waitForTimeout(30);
    const after = await page.evaluate(() => +document.querySelector('#pc-draw line').getAttribute('y2'));
    console.log('     arrow y2 before/after rect move:', before, '→', after);
    assert(after > before + 20, `rect 下移後 arrow to 端點 y2 應變大，實際 ${before} → ${after}`);
  });

  await test('畫 arrow 時終點落在自繪 rect → 新箭頭直接帶 endAnchors.to(obj)', async () => {
    const rectId = await drawTargetRect();
    await page.evaluate(() => window.__drawTest.api.setTool('arrow'));
    const t = await rectTopMid();
    await page.mouse.move(120, 120); await page.mouse.down();
    await page.mouse.move((120 + t.x) / 2, (120 + t.y) / 2); await page.mouse.move(t.x, t.y); await page.mouse.up();
    await page.waitForTimeout(30);
    const r = await page.evaluate(() => (window.__drawTest.api.getObjects().find(o => o.tool === 'arrow').endAnchors || {}).to || null);
    console.log('     create-time snap anchor:', JSON.stringify(r));
    assert(r && r.kind === 'obj' && r.objId === rectId, `畫線終點應即時吸附 rect，實際 ${JSON.stringify(r)}`);
  });

  // ── Batch 6：端點箭頭（單／雙向）──────────────────────────────────────────────
  console.log('\ndraw-layer e2e — Batch 6 端點箭頭 heads:');
  await test('arrow 預設 → 有 marker-end、無 marker-start', async () => {
    await reset('arrow');
    await dragDraw(page, 120, 100, 260, 180);
    const r = await page.evaluate(() => { const l = document.querySelector('#pc-draw line'); return { end: !!l.getAttribute('marker-end'), start: !!l.getAttribute('marker-start') }; });
    assert(r.end, 'arrow 應有 marker-end');
    assert(!r.start, 'arrow 預設不應有 marker-start');
  });
  await test('setHeads(both) → 雙箭頭（marker-start + marker-end）', async () => {
    await page.evaluate(() => window.__drawTest.api.setHeads('both')); // 承上：arrow 已選取
    const r = await page.evaluate(() => { const l = document.querySelector('#pc-draw line'); return { end: !!l.getAttribute('marker-end'), start: !!l.getAttribute('marker-start') }; });
    assert(r.start && r.end, `雙向應有兩端 marker，實際 ${JSON.stringify(r)}`);
  });
  await test('line 預設無箭頭 → setHeads(end) 變單箭頭', async () => {
    await reset('line');
    await dragDraw(page, 120, 100, 260, 180);
    const before = await page.evaluate(() => !!document.querySelector('#pc-draw line').getAttribute('marker-end'));
    await page.evaluate(() => window.__drawTest.api.setHeads('end'));
    const after = await page.evaluate(() => !!document.querySelector('#pc-draw line').getAttribute('marker-end'));
    assert(!before, 'line 預設不應有 marker-end');
    assert(after, 'setHeads(end) 後 line 應有 marker-end');
  });

  // ── P7 團隊持久（Firestore 向量同步，用 mock firebase）─────────────────────────────
  // 在獨立分頁跑（避免與上方共用 #canvas 的 P1–P6 draw layer 互相干擾）。
  const teamPage = await browser.newPage({ viewport: { width: 800, height: 600 } });
  teamPage.on('pageerror', e => console.log('     [pageerror]', e.message));
  teamPage.on('console', m => { if (m.type() === 'error') console.log('     [browser err]', m.text()); });
  await teamPage.goto(`http://localhost:${PORT}/test/e2e/draw-layer-harness.html`);
  await teamPage.waitForFunction(() => window.__drawTest && window.__drawTest.ready);

  console.log('draw-layer P7 team-persistence e2e (mock firebase):');

  await test('team 模式：init 即訂閱 drawings、畫 2 物件 → 各 save 一筆「向量 only」doc（無 dataURL）', async () => {
    await teamPage.evaluate(() => window.__drawTest.initTeam({}));
    // 畫 ellipse + rect（真實滑鼠拖曳 → create → 同步 Firestore）
    await teamPage.evaluate(() => window.__teamApi.setTool('ellipse'));
    await dragDraw(teamPage, 80, 80, 180, 160);
    await teamPage.evaluate(() => window.__teamApi.setTool('rect'));
    await dragDraw(teamPage, 250, 120, 360, 220);
    await teamPage.waitForTimeout(50);
    const r = await teamPage.evaluate(() => {
      const docs = window.__teamFb.__docs();
      return {
        subscribeCalls: window.__teamSpy.__calls.subscribe,
        saveCalls: window.__teamSpy.__calls.save,
        docCount: docs.length,
        tools: docs.map(d => d.tool).sort(),
        anyDataUrl: JSON.stringify(docs).includes('data:image') || JSON.stringify(docs).includes('imageRef'),
        sampleHasGeom: docs.every(d => d.geom && typeof d.geom === 'object'),
      };
    });
    console.log('     team draw → store:', JSON.stringify(r));
    assert(r.subscribeCalls === 1, `init 應訂閱一次 drawings，實際 ${r.subscribeCalls}`);
    assert(r.saveCalls === 2, `畫 2 物件應 save 2 次，實際 ${r.saveCalls}`);
    assert(r.docCount === 2, `Firestore 應有 2 筆 drawing doc，實際 ${r.docCount}`);
    assert(JSON.stringify(r.tools) === JSON.stringify(['ellipse', 'rect']), `tools 應為 ellipse+rect，實際 ${JSON.stringify(r.tools)}`);
    assert(!r.anyDataUrl, 'drawing docs 不應含 imageRef / dataURL（向量 only）');
    assert(r.sampleHasGeom, '每筆 doc 應帶向量 geom');
  });

  await test('team 模式：seed 一筆 remote drawing → 即時併入畫面（teammate 同步）', async () => {
    const r = await teamPage.evaluate(() => {
      window.__teamFb.__seed({ id: 'remote-1', tool: 'rect', geom: { x: 5, y: 5, w: 20, h: 20 }, style: { color: '#2f9e44', strokeWidth: 2, fill: 'none' } });
      return {
        hasObj: window.__teamApi.getObjects().some(o => o.id === 'remote-1'),
        rendered: !!document.querySelector('#pc-draw [data-id="remote-1"]'),
        total: window.__teamApi.getObjects().length,
      };
    });
    console.log('     after seed remote:', JSON.stringify(r));
    assert(r.hasObj, 'remote drawing 應併入 getObjects()');
    assert(r.rendered, 'remote drawing 應渲染到 #pc-draw（即時可見）');
    assert(r.total === 3, `應有 2 本地 + 1 remote = 3 物件，實際 ${r.total}`);
  });

  await test('team 模式：貼圖 image 物件「不」進 Firestore（PNG 永不上 Firestore）', async () => {
    const r = await teamPage.evaluate(() => {
      const before = window.__teamFb.__docs().length;
      const savesBefore = window.__teamSpy.__calls.save;
      window.__teamApi.addImage('data:image/png;base64,IMGDATA', 120, 80, { x: 50, y: 50 });
      const docs = window.__teamFb.__docs();
      return {
        added: docs.length - before,
        saveDelta: window.__teamSpy.__calls.save - savesBefore,
        hasImageDoc: docs.some(d => d.tool === 'image'),
        anyImgData: JSON.stringify(docs).includes('IMGDATA'),
        localHasImage: window.__teamApi.getObjects().some(o => o.tool === 'image'),
      };
    });
    console.log('     after addImage:', JSON.stringify(r));
    assert(r.added === 0, `image 不應新增 Firestore doc，實際新增 ${r.added}`);
    assert(r.saveDelta === 0, 'image 不應觸發 store.save');
    assert(!r.hasImageDoc, 'Firestore 不應有 image doc');
    assert(!r.anyImgData, 'Firestore 不應出現任何圖片 dataURL');
    assert(r.localHasImage, '本地仍應有 image 物件（只是不同步到 Firestore）');
  });

  await test('team 模式：刪除本地物件 → store.remove 被呼叫、Firestore doc 消失', async () => {
    const r = await teamPage.evaluate(() => {
      const target = window.__teamApi.getObjects().find(o => o.tool === 'ellipse'); // 第一筆本地 ellipse
      const removeBefore = window.__teamSpy.__calls.remove;
      const beforeCount = window.__teamFb.__docs().length;
      window.__teamApi.select(target.id);
      window.__teamApi.deleteSelected();
      const docs = window.__teamFb.__docs();
      return {
        id: target.id,
        removeDelta: window.__teamSpy.__calls.remove - removeBefore,
        docDelta: beforeCount - docs.length,
        stillThere: docs.some(d => d.id === target.id),
      };
    });
    console.log('     after delete:', JSON.stringify(r));
    assert(r.removeDelta === 1, `刪除應呼叫 store.remove 一次，實際 ${r.removeDelta}`);
    assert(r.docDelta === 1, `Firestore 應少一筆 doc，實際 ${r.docDelta}`);
    assert(!r.stillThere, '被刪 doc 應從 Firestore 消失');
  });

  await test('dev 模式（無 persist）：畫物件 → 對 store 0 呼叫（mock 完全沒被碰）', async () => {
    const devPage = await browser.newPage({ viewport: { width: 800, height: 600 } });
    await devPage.goto(`http://localhost:${PORT}/test/e2e/draw-layer-harness.html`);
    await devPage.waitForFunction(() => window.__drawTest && window.__drawTest.ready);
    await devPage.evaluate(() => window.__drawTest.initDevWithIdleSpy());
    await devPage.evaluate(() => window.__drawTest.api.setTool('ellipse'));
    await dragDraw(devPage, 80, 80, 180, 160);
    await devPage.evaluate(() => window.__drawTest.api.setTool('rect'));
    await dragDraw(devPage, 250, 120, 360, 220);
    await devPage.waitForTimeout(50);
    const r = await devPage.evaluate(() => ({
      localObjs: window.__drawTest.api.getObjects().length,
      calls: window.__idleSpy.__calls,
      docCount: window.__idleFb.__docs().length,
    }));
    await devPage.close();
    console.log('     dev (no persist):', JSON.stringify(r));
    assert(r.localObjs === 2, `本地仍應畫出 2 物件，實際 ${r.localObjs}`);
    assert(r.calls.subscribe === 0 && r.calls.save === 0 && r.calls.update === 0 && r.calls.remove === 0,
      `dev 模式 store 應 0 呼叫，實際 ${JSON.stringify(r.calls)}`);
    assert(r.docCount === 0, `dev 模式不應寫任何 Firestore doc，實際 ${r.docCount}`);
  });

  await teamPage.close();

  // ── Item 1：dev 模式 localStorage 持久化 ─────────────────────────────────────
  // 使用主 page（已有 #canvas），注入 opts.projectId 區分 key，每個 test 自行清 key。
  console.log('\ndraw-layer e2e — dev 模式 localStorage 持久化:');

  const LOCAL_PROJ = 'e2e-local-persist';
  const LOCAL_KEY  = 'pc-draw-local:' + LOCAL_PROJ;

  // 清 key + destroy 舊 api + 建新 controller（同 projectId）。
  async function initLocalPersist(overrides = {}) {
    await page.evaluate(({ key, proj, extra }) => {
      localStorage.removeItem(key);
      try { if (window.__drawTest.api) window.__drawTest.api.destroy(); } catch (_) {}
      window.__drawTest.api = window.__drawTest.init({ projectId: proj, ...extra });
    }, { key: LOCAL_KEY, proj: LOCAL_PROJ, extra: overrides });
  }

  await test('畫 rect → localStorage 寫入序列化資料', async () => {
    await initLocalPersist();
    await page.evaluate(() => window.__drawTest.api.setTool('rect'));
    await dragDraw(page, 50, 50, 150, 130);
    const stored = await page.evaluate(k => localStorage.getItem(k), LOCAL_KEY);
    assert(stored !== null, 'localStorage 應有資料');
    const docs = JSON.parse(stored);
    assert(Array.isArray(docs) && docs.length === 1 && docs[0].tool === 'rect',
      `應序列化 1 筆 rect，實際 ${JSON.stringify(docs)}`);
  });

  await test('重新 initDrawLayer 同 projectId → 物件從 localStorage 還原並渲染', async () => {
    // 不清 key（承接上一個 test 留下的 rect）
    await page.evaluate(proj => {
      try { window.__drawTest.api.destroy(); } catch (_) {}
      window.__drawTest.api = window.__drawTest.init({ projectId: proj });
    }, LOCAL_PROJ);
    const r = await page.evaluate(() => ({
      objs: window.__drawTest.api.getObjects(),
      domRects: document.querySelectorAll('#pc-draw > rect').length,
    }));
    assert(r.objs.length === 1 && r.objs[0].tool === 'rect',
      `重新 init 後應還原 1 筆 rect，實際 ${JSON.stringify(r.objs.map(o => o.tool))}`);
    assert(r.domRects >= 1, `DOM 應渲染 rect，實際 ${r.domRects}`);
  });

  await test('image 物件不進 localStorage（vectors only）', async () => {
    await initLocalPersist();
    const PNG_TINY = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
    await page.evaluate(d => window.__drawTest.api.addImage(d, 1, 1, null), PNG_TINY);
    const stored = await page.evaluate(k => localStorage.getItem(k), LOCAL_KEY);
    const docs = stored ? JSON.parse(stored) : [];
    assert(!docs.some(d => d.tool === 'image'),
      `image 物件不應進 localStorage，實際 ${JSON.stringify(docs)}`);
  });

  await test('opts.persistLocal=false → localStorage 不寫入', async () => {
    const noKey = 'pc-draw-local:e2e-no-persist';
    await page.evaluate(k => {
      localStorage.removeItem(k);
      try { window.__drawTest.api.destroy(); } catch (_) {}
      window.__drawTest.api = window.__drawTest.init({ projectId: 'e2e-no-persist', persistLocal: false });
    }, noKey);
    await page.evaluate(() => window.__drawTest.api.setTool('rect'));
    await dragDraw(page, 50, 50, 130, 110);
    const stored = await page.evaluate(k => localStorage.getItem(k), noKey);
    assert(stored === null, 'persistLocal=false 應不寫入 localStorage');
    await page.evaluate(() => { localStorage.removeItem('pc-draw-local:e2e-no-persist'); });
  });

  await test('clear() 後 localStorage 更新為空陣列', async () => {
    await initLocalPersist();
    await page.evaluate(() => window.__drawTest.api.setTool('rect'));
    await dragDraw(page, 50, 50, 150, 130);
    await page.evaluate(() => window.__drawTest.api.clear());
    const stored = await page.evaluate(k => localStorage.getItem(k), LOCAL_KEY);
    const docs = stored ? JSON.parse(stored) : null;
    assert(Array.isArray(docs) && docs.length === 0, `clear 後 localStorage 應為空陣列，實際 ${JSON.stringify(docs)}`);
    // 清理
    await page.evaluate(k => localStorage.removeItem(k), LOCAL_KEY);
    // 還原：重建 default controller 給後續 test 用
    await page.evaluate(() => {
      try { window.__drawTest.api.destroy(); } catch (_) {}
      window.__drawTest.api = window.__drawTest.init();
    });
  });

  // ── Item 2：文字字體大小工具 ─────────────────────────────────────────────────
  console.log('\ndraw-layer e2e — 文字字體大小:');

  // 建一個 text 物件，回傳其 id 與渲染後的 <text> font-size 屬性。
  async function drawTextAndGetFontSize() {
    await page.evaluate(() => { window.__drawTest.api.clear(); window.__drawTest.api.setTool('text'); });
    await page.mouse.click(200, 200);
    await page.waitForSelector('.pc-draw-text-input', { timeout: 2000 });
    await page.fill('.pc-draw-text-input', 'FontTest');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(50);
    return page.evaluate(() => {
      const o = window.__drawTest.api.getObjects().slice(-1)[0];
      const t = document.querySelector(`#pc-draw text[data-id="${o.id}"]`);
      return { id: o.id, fontSize: o.style.fontSize, domFontSize: t && t.getAttribute('font-size') };
    });
  }

  await test('text 物件預設 font-size=16；<text> font-size 屬性反映 style.fontSize', async () => {
    const r = await drawTextAndGetFontSize();
    console.log('     default font-size:', JSON.stringify(r));
    assert(r.fontSize === 16, `style.fontSize 預設應為 16，實際 ${r.fontSize}`);
    assert(r.domFontSize === '16', `<text> font-size 屬性應為 16，實際 ${r.domFontSize}`);
  });

  await test('fontsize-menu popover 存在；含 4 個字體大小按鈕', async () => {
    const r = await page.evaluate(() => {
      const menu = document.querySelector('.pc-draw-popover[data-menu="fontsize"]');
      const btns = menu ? [...menu.querySelectorAll('.pc-draw-fontsize')] : [];
      return {
        present: !!menu,
        count: btns.length,
        sizes: btns.map(b => Number(b.dataset.fontSize)),
      };
    });
    console.log('     fontsize menu:', JSON.stringify(r));
    assert(r.present, '應有 fontsize popover');
    assert(r.count === 4, `應有 4 個字體大小按鈕，實際 ${r.count}`);
    assert(JSON.stringify(r.sizes) === JSON.stringify([12, 16, 20, 28]),
      `字體大小選項應為 [12,16,20,28]，實際 ${JSON.stringify(r.sizes)}`);
  });

  await test('select 工具 + 選取 text → 點 28px → <text> font-size 更新', async () => {
    const before = await drawTextAndGetFontSize();
    // 切 select，點物件
    await page.evaluate(() => window.__drawTest.api.setTool('select'));
    await page.mouse.click(200, 200);
    // 開 fontsize popover，點 28
    await page.click('.pc-draw-tool[data-action="fontsize-menu"]');
    await page.click('.pc-draw-popover[data-menu="fontsize"] .pc-draw-fontsize[data-font-size="28"]');
    await page.waitForTimeout(30);
    const after = await page.evaluate(id => {
      const o = window.__drawTest.api.getObjects().find(o => o.id === id);
      const t = document.querySelector(`#pc-draw text[data-id="${id}"]`);
      return { fontSize: o && o.style.fontSize, domFontSize: t && t.getAttribute('font-size') };
    }, before.id);
    console.log('     font-size before/after:', JSON.stringify({ before: before.fontSize, ...after }));
    assert(after.fontSize === 28, `style.fontSize 應更新為 28，實際 ${after.fontSize}`);
    assert(after.domFontSize === '28', `<text> font-size 屬性應為 28，實際 ${after.domFontSize}`);
  });

  await test('新建 text 物件沿用目前 fontSize 預設（28 設好後再畫一個）', async () => {
    // 承接上一個 test：DEFAULT_DRAW_STYLE.fontSize 應已被更新為 28
    await page.evaluate(() => window.__drawTest.api.setTool('text'));
    await page.mouse.click(350, 150);
    await page.waitForSelector('.pc-draw-text-input', { timeout: 2000 });
    await page.fill('.pc-draw-text-input', 'NewText');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(40);
    const r = await page.evaluate(() => {
      const objs = window.__drawTest.api.getObjects();
      const last = objs[objs.length - 1];
      const t = document.querySelector(`#pc-draw text[data-id="${last.id}"]`);
      return { fontSize: last.style.fontSize, domFontSize: t && t.getAttribute('font-size') };
    });
    console.log('     new text with prevailing fontSize:', JSON.stringify(r));
    assert(r.fontSize === 28, `新建 text 應沿用 28，實際 ${r.fontSize}`);
    assert(r.domFontSize === '28', `<text> font-size 屬性應為 28，實際 ${r.domFontSize}`);
    // 清場 + 重設 fontSize 為預設 16，避免干擾後續 test
    await page.evaluate(() => {
      window.__drawTest.api.clear();
      window.__drawTest.api.setFontSize(16);
    });
  });

  // ── Item 3：快捷鍵 onKey DOM 觸發（補 resolveShortcut 之外的 wiring）──────────
  // 前方「鍵盤快捷鍵」section 已覆蓋 o/r/7/v/a/R/3/d/7/p/i/Ctrl；
  // 此 section 補上 l→line、t→text、2→rect、1→select 以及 dispatchEvent guard。
  console.log('\ndraw-layer e2e — 快捷鍵 onKey wiring（Item 3 補完）:');

  async function resetForShortcut() {
    await page.evaluate(() => {
      window.__drawTest.api.clear();
      window.__drawTest.api.setMode('draw'); // onKey 要求 mode=draw
    });
  }

  await test('onKey wiring: l → line', async () => {
    await resetForShortcut();
    await page.keyboard.press('l');
    const tool = await page.evaluate(() => window.__drawTest.api.getTool());
    assert(tool === 'line', `l 應切 line，實際 ${tool}`);
  });

  await test('onKey wiring: t → text', async () => {
    await resetForShortcut();
    await page.keyboard.press('t');
    const tool = await page.evaluate(() => window.__drawTest.api.getTool());
    assert(tool === 'text', `t 應切 text，實際 ${tool}`);
    // 關閉可能出現的 text input 避免後續 test 受干擾
    await page.keyboard.press('Escape');
  });

  await test('onKey wiring: 2 → rect（數字鍵）', async () => {
    await resetForShortcut();
    await page.keyboard.press('2');
    const tool = await page.evaluate(() => window.__drawTest.api.getTool());
    assert(tool === 'rect', `2 應切 rect，實際 ${tool}`);
  });

  await test('onKey wiring: 1 → select（數字鍵）', async () => {
    await resetForShortcut();
    await page.keyboard.press('1');
    const tool = await page.evaluate(() => window.__drawTest.api.getTool());
    assert(tool === 'select', `1 應切 select，實際 ${tool}`);
  });

  await test('guard: dispatchEvent 目標為 INPUT → 工具不切換（isTyping 判斷）', async () => {
    // 在 #canvas 內插入一個暫時 input，focus 後 dispatchEvent → onKey 應判斷 isTyping() 而跳過。
    await page.evaluate(() => {
      window.__drawTest.api.setTool('select');
      window.__drawTest.api.setMode('draw');
    });
    const toolBefore = await page.evaluate(() => window.__drawTest.api.getTool());
    await page.evaluate(() => {
      const inp = document.createElement('input');
      inp.id = '__guard-test-input';
      inp.style.cssText = 'position:absolute;left:-999px;'; // 畫面外但可 focus
      document.body.appendChild(inp);
      inp.focus();
      // 直接用 dispatchEvent（不透過 playwright keyboard）確保 target === input
      inp.dispatchEvent(new KeyboardEvent('keydown', { key: 'r', bubbles: true, cancelable: true }));
    });
    const toolAfter = await page.evaluate(() => window.__drawTest.api.getTool());
    await page.evaluate(() => { const inp = document.getElementById('__guard-test-input'); if (inp) inp.remove(); });
    console.log(`     dispatchEvent guard: before=${toolBefore} after=${toolAfter}`);
    assert(toolAfter === toolBefore, `INPUT 為焦點時 keydown 不應切工具，tool=${toolAfter}`);
  });

  await test('guard: TEXTAREA 為焦點時同樣不切工具', async () => {
    await page.evaluate(() => {
      window.__drawTest.api.setTool('select');
      window.__drawTest.api.setMode('draw');
    });
    const toolBefore = await page.evaluate(() => window.__drawTest.api.getTool());
    await page.evaluate(() => {
      const ta = document.createElement('textarea');
      ta.id = '__guard-test-ta';
      ta.style.cssText = 'position:absolute;left:-999px;';
      document.body.appendChild(ta);
      ta.focus();
      ta.dispatchEvent(new KeyboardEvent('keydown', { key: 'o', bubbles: true, cancelable: true }));
    });
    const toolAfter = await page.evaluate(() => window.__drawTest.api.getTool());
    await page.evaluate(() => { const ta = document.getElementById('__guard-test-ta'); if (ta) ta.remove(); });
    console.log(`     TEXTAREA guard: before=${toolBefore} after=${toolAfter}`);
    assert(toolAfter === toolBefore, `TEXTAREA 為焦點時 keydown 不應切工具，tool=${toolAfter}`);
  });

  // ── Batch 3：持久群組（Cmd+G / Cmd+Shift+G）───────────────────────────────────
  console.log('\ndraw-layer e2e — Batch 3 持久群組:');

  // 每次清空畫布並重設到 select 模式（mode=draw 讓 onKey 生效）。
  async function resetGroup() {
    await page.evaluate(() => {
      window.__drawTest.api.clear();
      window.__drawTest.api.setMode('draw');
      window.__drawTest.api.setTool('select');
    });
  }

  // 畫 2 個 rect，回傳 [id1, id2]。
  // rect1: 60..160 × 200..260（center ≈ 110, 230）
  // rect2: 220..340 × 200..260（center ≈ 280, 230）
  async function draw2RectsForGroup() {
    await page.evaluate(() => window.__drawTest.api.setTool('rect'));
    await dragDraw(page, 60, 200, 160, 260);
    await page.evaluate(() => window.__drawTest.api.setTool('rect'));
    await dragDraw(page, 220, 200, 340, 260);
    return page.evaluate(() => window.__drawTest.api.getObjects().map(o => o.id));
  }

  await test('Cmd+G：≥2 選取 → 群組化；點其中一個成員 → 兩個都被選取', async () => {
    await resetGroup();
    const ids = await draw2RectsForGroup();
    assert(ids.length === 2, `應畫出 2 個物件，實際 ${ids.length}`);
    // 用 API 全選後按 Ctrl+G 群組化
    await page.evaluate(ids => window.__drawTest.api.selectIds(ids), ids);
    await page.keyboard.press('Control+g');
    await page.waitForTimeout(30);
    // 驗證兩個物件都有相同 groupId
    const gids = await page.evaluate(() => window.__drawTest.api.getObjects().map(o => o.groupId));
    console.log('     after Ctrl+G groupIds:', JSON.stringify(gids));
    assert(gids[0] && gids[0] === gids[1], `兩物件應有相同 groupId，實際 ${JSON.stringify(gids)}`);
    // 取消選取後點第一個 rect → 應展開選取整個群組
    await page.evaluate(() => { window.__drawTest.api.selectIds([]); window.__drawTest.api.setTool('select'); });
    await page.mouse.click(110, 230);
    await page.waitForTimeout(30);
    const selIds = await page.evaluate(() => window.__drawTest.api.getSelectedIds());
    console.log('     group click selIds:', JSON.stringify(selIds));
    assert(selIds.length === 2, `點群組成員後應選取 2 個，實際 ${selIds.length}`);
  });

  await test('群組拖曳：拖一個成員 → 兩個物件一起移動', async () => {
    await resetGroup();
    const ids = await draw2RectsForGroup();
    // 群組化
    await page.evaluate(ids => window.__drawTest.api.selectIds(ids), ids);
    await page.keyboard.press('Control+g');
    await page.waitForTimeout(30);
    // 切 select 工具，記錄拖曳前 geom
    await page.evaluate(() => window.__drawTest.api.setTool('select'));
    const before = await page.evaluate(() =>
      window.__drawTest.api.getObjects().map(o => ({ id: o.id, x: o.geom.x, y: o.geom.y }))
    );
    // 從 rect1 中心（110, 230）拖到（180, 250）——兩個物件都已被選取（Cmd+G 後未取消選取）
    await page.mouse.move(110, 230);
    await page.mouse.down();
    await page.mouse.move(145, 240);
    await page.mouse.move(180, 250);
    await page.mouse.up();
    await page.waitForTimeout(30);
    const after = await page.evaluate(() =>
      window.__drawTest.api.getObjects().map(o => ({ id: o.id, x: o.geom.x, y: o.geom.y }))
    );
    const d0 = Math.abs(after[0].x - before[0].x) + Math.abs(after[0].y - before[0].y);
    const d1 = Math.abs(after[1].x - before[1].x) + Math.abs(after[1].y - before[1].y);
    console.log('     group drag delta: obj0=', d0.toFixed(3), 'obj1=', d1.toFixed(3));
    assert(d0 > 0.5, `第一個物件應已移動，delta=${d0.toFixed(3)}`);
    assert(d1 > 0.5, `第二個物件應一起移動，delta=${d1.toFixed(3)}`);
  });

  await test('Cmd+Shift+G：解散群組；點一個 → 只選一個', async () => {
    await resetGroup();
    const ids = await draw2RectsForGroup();
    // 群組化
    await page.evaluate(ids => window.__drawTest.api.selectIds(ids), ids);
    await page.keyboard.press('Control+g');
    await page.waitForTimeout(30);
    // 全選後解散
    await page.evaluate(ids => window.__drawTest.api.selectIds(ids), ids);
    await page.keyboard.press('Control+Shift+g');
    await page.waitForTimeout(30);
    const gids = await page.evaluate(() => window.__drawTest.api.getObjects().map(o => o.groupId));
    console.log('     after Ctrl+Shift+G groupIds:', JSON.stringify(gids));
    assert(gids.every(g => !g), `解散後所有 groupId 應清除，實際 ${JSON.stringify(gids)}`);
    // 取消選取後點第一個 rect → 應只選一個
    await page.evaluate(() => { window.__drawTest.api.selectIds([]); window.__drawTest.api.setTool('select'); });
    await page.mouse.click(110, 230);
    await page.waitForTimeout(30);
    const selIds = await page.evaluate(() => window.__drawTest.api.getSelectedIds());
    console.log('     ungroup click selIds:', JSON.stringify(selIds));
    assert(selIds.length === 1, `解散後點一個應只選一個，實際 ${selIds.length}`);
  });

  await test('群組化後 undo → 群組解除；點一個 → 只選一個', async () => {
    await resetGroup();
    const ids = await draw2RectsForGroup();
    // 群組化
    await page.evaluate(ids => window.__drawTest.api.selectIds(ids), ids);
    await page.keyboard.press('Control+g');
    await page.waitForTimeout(30);
    const gidBefore = await page.evaluate(() => window.__drawTest.api.getObjects()[0].groupId);
    assert(gidBefore, 'undo test: 群組化後應有 groupId');
    // Undo 群組化
    await page.keyboard.press('Control+z');
    await page.waitForTimeout(30);
    const gidsAfter = await page.evaluate(() => window.__drawTest.api.getObjects().map(o => o.groupId));
    console.log('     after undo groupIds:', JSON.stringify(gidsAfter));
    assert(gidsAfter.every(g => !g), `undo 後 groupId 應清除，實際 ${JSON.stringify(gidsAfter)}`);
    // 取消選取後點第一個 → 只選一個
    await page.evaluate(() => { window.__drawTest.api.selectIds([]); window.__drawTest.api.setTool('select'); });
    await page.mouse.click(110, 230);
    await page.waitForTimeout(30);
    const selIds = await page.evaluate(() => window.__drawTest.api.getSelectedIds());
    console.log('     undo group selIds:', JSON.stringify(selIds));
    assert(selIds.length === 1, `undo 群組後點一個應只選一個，實際 ${selIds.length}`);
  });

  // ── 右鍵選單：群組／解散（Option A）────────────────────────────────────────────
  console.log('\ndraw-layer e2e — 右鍵選單 群組/解散:');
  await test('右鍵選單：選 ≥2 顯示「群組」、未群組時隱藏「解散群組」→ 點擊群組化', async () => {
    await resetGroup();
    const ids = await draw2RectsForGroup();
    await page.evaluate(ids => { window.__drawTest.api.setTool('select'); window.__drawTest.api.selectIds(ids); }, ids);
    await page.mouse.click(110, 230, { button: 'right' }); // 右鍵已選成員 → 開選單
    await page.waitForTimeout(20);
    const vis = await page.evaluate(() => {
      const g = document.querySelector('#pc-draw-context.open [data-action="group"]');
      const u = document.querySelector('#pc-draw-context.open [data-action="ungroup"]');
      return { group: !!(g && g.style.display !== 'none'), ungroup: !!(u && u.style.display !== 'none') };
    });
    console.log('     menu vis (≥2 selected):', JSON.stringify(vis));
    assert(vis.group, '選 ≥2 時「群組」應顯示');
    assert(!vis.ungroup, '尚未群組時「解散群組」應隱藏');
    await page.click('#pc-draw-context.open [data-action="group"]');
    await page.waitForTimeout(30);
    const gids = await page.evaluate(() => window.__drawTest.api.getObjects().map(o => o.groupId));
    assert(gids[0] && gids[0] === gids[1], `點「群組」後兩物件應同 groupId，實際 ${JSON.stringify(gids)}`);
  });
  await test('右鍵選單：選到群組成員顯示「解散群組」→ 點擊解散', async () => {
    await page.evaluate(() => { window.__drawTest.api.selectIds([]); window.__drawTest.api.setTool('select'); });
    await page.mouse.click(110, 230); // 點成員 → 選整組
    await page.waitForTimeout(20);
    await page.mouse.click(110, 230, { button: 'right' });
    await page.waitForTimeout(20);
    const ungroup = await page.evaluate(() => { const u = document.querySelector('#pc-draw-context.open [data-action="ungroup"]'); return !!(u && u.style.display !== 'none'); });
    assert(ungroup, '選到群組成員時「解散群組」應顯示');
    await page.click('#pc-draw-context.open [data-action="ungroup"]');
    await page.waitForTimeout(30);
    const gids = await page.evaluate(() => window.__drawTest.api.getObjects().map(o => o.groupId || null));
    console.log('     after 解散 groupIds:', JSON.stringify(gids));
    assert(gids.every(g => !g), `解散後不應有 groupId，實際 ${JSON.stringify(gids)}`);
  });
  await test('右鍵選單：單選時「群組」隱藏', async () => {
    await resetGroup();
    const ids = await draw2RectsForGroup();
    await page.evaluate(id => { window.__drawTest.api.setTool('select'); window.__drawTest.api.selectIds([id]); }, ids[0]);
    await page.mouse.click(110, 230, { button: 'right' });
    await page.waitForTimeout(20);
    const group = await page.evaluate(() => { const g = document.querySelector('#pc-draw-context.open [data-action="group"]'); return !!(g && g.style.display !== 'none'); });
    assert(!group, '單選時「群組」應隱藏');
  });

  await test('精準命中：點鉛筆筆畫 → 選到鉛筆（即使被箭頭 bbox 蓋住）', async () => {
    await page.evaluate(() => { window.__drawTest.api.clear(); window.__drawTest.api.setMode('draw'); });
    // 鉛筆：水平短線 y=150
    await page.evaluate(() => window.__drawTest.api.setTool('pencil'));
    await page.mouse.move(150, 150); await page.mouse.down(); await page.mouse.move(200, 150); await page.mouse.move(250, 150); await page.mouse.up();
    const pencilId = await page.evaluate(() => window.__drawTest.api.getObjects().find(o => o.tool === 'pencil').id);
    // 箭頭：斜線，bbox 蓋住鉛筆，但線在 (200,150) 離很遠
    await page.evaluate(() => window.__drawTest.api.setTool('arrow'));
    await page.mouse.move(120, 120); await page.mouse.down(); await page.mouse.move(300, 260); await page.mouse.up();
    // 點 (200,150)：在鉛筆筆畫上、在箭頭 bbox 內但離箭頭線遠
    await page.evaluate(() => { window.__drawTest.api.setTool('select'); window.__drawTest.api.selectIds([]); });
    await page.mouse.click(200, 150);
    await page.waitForTimeout(30);
    const sel = await page.evaluate(() => window.__drawTest.api.getSelectedIds());
    console.log('     precise-hit selIds:', JSON.stringify(sel), 'pencil:', pencilId);
    assert(sel.length === 1 && sel[0] === pencilId, `點鉛筆筆畫應選到鉛筆，實際 ${JSON.stringify(sel)}`);
  });

  await test('bbox 後援：點未重疊鉛筆捲線的內側空白 → 仍選到鉛筆', async () => {
    await page.evaluate(() => { window.__drawTest.api.clear(); window.__drawTest.api.setMode('draw'); window.__drawTest.api.setTool('pencil'); });
    await page.mouse.move(160, 240); await page.mouse.down(); await page.mouse.move(220, 200); await page.mouse.move(260, 250); await page.mouse.move(210, 290); await page.mouse.move(160, 250); await page.mouse.up();
    const pid = await page.evaluate(() => window.__drawTest.api.getObjects().find(o => o.tool === 'pencil').id);
    await page.evaluate(() => { window.__drawTest.api.setTool('select'); window.__drawTest.api.selectIds([]); });
    await page.mouse.click(210, 245); // 捲線內側空白（非筆畫）→ 無重疊 → bbox 後援命中
    await page.waitForTimeout(30);
    const sel = await page.evaluate(() => window.__drawTest.api.getSelectedIds());
    console.log('     bbox-fallback selIds:', JSON.stringify(sel), 'pencil:', pid);
    assert(sel.length === 1 && sel[0] === pid, `未重疊時點捲線內側應靠 bbox 後援選到鉛筆，實際 ${JSON.stringify(sel)}`);
  });

  await test('文字物件：雙擊 → 編輯內容（預填原文字、改後更新）', async () => {
    await page.evaluate(() => { window.__drawTest.api.clear(); window.__drawTest.api.setMode('draw'); window.__drawTest.api.setTool('text'); });
    await page.mouse.click(220, 160);
    await page.waitForSelector('.pc-draw-text-input', { timeout: 3000 });
    await page.fill('.pc-draw-text-input', '原文字');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(30);
    const t1 = await page.evaluate(() => { const o = window.__drawTest.api.getObjects().find(o => o.tool === 'text'); return o && o.text; });
    assert(t1 === '原文字', `建立文字內容，實際 ${t1}`);
    await page.evaluate(() => window.__drawTest.api.setTool('select'));
    const pos = await page.evaluate(() => { const o = window.__drawTest.api.getObjects().find(o => o.tool === 'text'); const r = document.querySelector('#pc-draw').getBoundingClientRect(); return { x: r.left + o.geom.x / 100 * r.width, y: r.top + o.geom.y / 100 * r.height }; });
    await page.mouse.dblclick(pos.x, pos.y);
    await page.waitForSelector('.pc-draw-text-input', { timeout: 3000 });
    const prefill = await page.evaluate(() => document.querySelector('.pc-draw-text-input').value);
    assert(prefill === '原文字', `雙擊編輯框應預填原文字，實際 ${prefill}`);
    await page.fill('.pc-draw-text-input', '改後文字');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(30);
    const t2 = await page.evaluate(() => { const o = window.__drawTest.api.getObjects().find(o => o.tool === 'text'); return o && o.text; });
    console.log('     text edit:', t1, '→', t2);
    assert(t2 === '改後文字', `雙擊編輯後文字應更新，實際 ${t2}`);
  });

  await test('外框形狀不蓋住底下：點箭頭(在橢圓內部)→ 選到箭頭而非橢圓', async () => {
    await page.evaluate(() => { window.__drawTest.api.clear(); window.__drawTest.api.setMode('draw'); });
    // 先畫箭頭（底層）：水平線 y=200
    await page.evaluate(() => window.__drawTest.api.setTool('arrow'));
    await page.mouse.move(180, 200); await page.mouse.down(); await page.mouse.move(320, 200); await page.mouse.up();
    const arrowId = await page.evaluate(() => window.__drawTest.api.getObjects().find(o => o.tool === 'arrow').id);
    // 再畫橢圓（上層，外框，內部空白覆蓋箭頭）
    await page.evaluate(() => window.__drawTest.api.setTool('ellipse'));
    await page.mouse.move(150, 150); await page.mouse.down(); await page.mouse.move(350, 250); await page.mouse.up();
    // 點 (250,200)：在箭頭線上、在橢圓內部空白
    await page.evaluate(() => { window.__drawTest.api.setTool('select'); window.__drawTest.api.selectIds([]); });
    await page.mouse.click(250, 200);
    await page.waitForTimeout(30);
    const sel = await page.evaluate(() => window.__drawTest.api.getSelectedIds());
    console.log('     arrow-under-ellipse selIds:', JSON.stringify(sel), 'arrow:', arrowId);
    assert(sel.length === 1 && sel[0] === arrowId, `點橢圓內的箭頭應選到箭頭，實際 ${JSON.stringify(sel)}`);
  });
  await test('外框形狀不蓋住底下：點箭頭(穿過橢圓邊緣處)→ 取最近者選到箭頭', async () => {
    await page.evaluate(() => { window.__drawTest.api.clear(); window.__drawTest.api.setMode('draw'); });
    // 箭頭橫貫整個橢圓寬度（明確穿過左右外框）：y=200, x 120→380
    await page.evaluate(() => window.__drawTest.api.setTool('arrow'));
    await page.mouse.move(120, 200); await page.mouse.down(); await page.mouse.move(380, 200); await page.mouse.up();
    const arrowId = await page.evaluate(() => window.__drawTest.api.getObjects().find(o => o.tool === 'arrow').id);
    // 橢圓（上層，外框）x150-350 → 左外框在 y=200 處 x≈150
    await page.evaluate(() => window.__drawTest.api.setTool('ellipse'));
    await page.mouse.move(150, 150); await page.mouse.down(); await page.mouse.move(350, 250); await page.mouse.up();
    // 點 (153,200)：落在箭頭線上(dist≈0)、且離橢圓左外框僅 ~3px(在容差內)→ 應選最近者＝箭頭
    await page.evaluate(() => { window.__drawTest.api.setTool('select'); window.__drawTest.api.selectIds([]); });
    await page.mouse.click(153, 200);
    await page.waitForTimeout(30);
    const sel = await page.evaluate(() => window.__drawTest.api.getSelectedIds());
    console.log('     arrow-crossing-edge selIds:', JSON.stringify(sel), 'arrow:', arrowId);
    assert(sel.length === 1 && sel[0] === arrowId, `點外框邊緣處的箭頭應選到箭頭，實際 ${JSON.stringify(sel)}`);
  });
  await test('快捷鍵：IME 開著(e.key=Process)仍用 e.code 切工具', async () => {
    await page.evaluate(() => { window.__drawTest.api.clear(); window.__drawTest.api.setMode('draw'); window.__drawTest.api.setTool('select'); });
    await page.evaluate(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Process', code: 'KeyO', bubbles: true })));
    await page.waitForTimeout(20);
    await dragDraw(page, 150, 150, 230, 210);
    const tool = await page.evaluate(() => { const os = window.__drawTest.api.getObjects(); return os.length ? os[os.length - 1].tool : null; });
    console.log('     IME(e.code=KeyO) → drawn tool:', tool);
    assert(tool === 'ellipse', `IME 開著時 e.code=KeyO 應切到 ellipse，實際 ${tool}`);
  });

  await browser.close();
  server.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
