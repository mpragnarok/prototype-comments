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

  await test('pencil 工具 → 自由筆畫出 <polyline>（多點）', async () => {
    await page.click('.pc-draw-tool[data-tool="pencil"]');
    await page.mouse.move(100, 260);
    await page.mouse.down();
    for (const [x, y] of [[140, 300], [180, 270], [220, 320], [260, 280]]) await page.mouse.move(x, y);
    await page.mouse.up();
    const r = await page.evaluate(() => {
      const pl = document.querySelector('#pc-draw polyline');
      return { polylines: document.querySelectorAll('#pc-draw polyline').length, pts: pl ? pl.getAttribute('points').trim().split(/\s+/).length : 0 };
    });
    console.log('     pencil drawn:', JSON.stringify(r));
    assert(r.polylines === 1, `應有 1 條 polyline，實際 ${r.polylines}`);
    assert(r.pts >= 3, `polyline 應有多個點，實際 ${r.pts}`);
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

  await test('color picker：點藍色 swatch → 選取物件 stroke 變色 + 新物件沿用', async () => {
    await reset('rect');
    await dragDraw(page, 100, 80, 200, 180); // 自動選取
    await page.click('.pc-draw-swatch[data-color="#0066FF"]');
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
    assert(r.color === '#0066FF', `選取物件 style.color 應變藍，實際 ${r.color}`);
    assert(r.stroke === '#0066FF', `SVG stroke 應變藍，實際 ${r.stroke}`);
    assert(next === '#0066FF', `新物件應沿用新預設色，實際 ${next}`);
  });

  await test('strokeWidth picker：點 8px → 選取物件線寬改變', async () => {
    await reset('rect');
    await dragDraw(page, 100, 80, 200, 180);
    await page.click('.pc-draw-width[data-width="8"]');
    const r = await page.evaluate(() => ({
      sw: window.__drawTest.api.getObjects()[0].style.strokeWidth,
      domSw: document.querySelector('#pc-draw > rect').getAttribute('stroke-width'),
    }));
    console.log('     strokeWidth picker:', JSON.stringify(r));
    assert(r.sw === 8 && r.domSw === '8', `線寬應為 8，實際 ${JSON.stringify(r)}`);
  });

  await browser.close();
  server.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
