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

  await browser.close();
  server.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
