// test/e2e/toolbar-layout.spec.js — 工具列的版面：排幾排、按鈕大小
//
//   node test/e2e/toolbar-layout.spec.js
//
// 釘住兩件事（都是使用者在真實頁面上看到的跑版）：
//   1. 中等寬度（1512px）視窗，抽屜開或關，工具列都排成一排。
//      之前 left:50% 讓工具列最寬只到半個視窗，1512 寬就擠成兩排，抽屜開時第二排只剩一顆收合鈕。
//   2. 宿主頁面寫了裸的 button{padding;min-height;…} 規則，工具列按鈕仍是 34×34、圖示 20×20，
//      hover 時圖示不變色、按下時不縮小。之前內距漏進來，圖示被壓成 6px 寬。
// 抽屜開時工具列整條在抽屜左邊，由 record-send-scope.spec.js 的 967px 測試守著。
import { chromium } from 'playwright';
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json' };
const server = http.createServer((req, res) => {
  const p = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]));
  if (!p.startsWith(ROOT) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); res.end('nf'); return; }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' });
  fs.createReadStream(p).pipe(res);
});

// 照抄使用者那份設計頁的全域按鈕規則（含 hover 換底色、active 縮小）
const HOST_BUTTON_CSS = `
  button { font: 500 13.5px/1 Georgia, serif; color: #444; background: #fff; border: 1px solid #d9d9d9;
    border-radius: 8px; padding: 9px 14px; cursor: pointer; min-height: 40px; }
  button:hover { background: #eee; color: #1a1a1a; }
  button:active { transform: scale(.97); }`;

let pass = 0, fail = 0;
async function test(name, fn) {
  try { await fn(); console.log('  ✓', name); pass++; }
  catch (e) { console.error('  ✗', name, '\n     ', e.message); fail++; }
}
function assert(cond, msg) { if (!cond) throw new Error(msg || 'assertion failed'); }

// 依子元素的垂直中心分排：同一排的鈕與分隔線高度不同、top 不同，但中心相近。
const toolbarRows = page => page.evaluate(() => {
  const bar = document.querySelector('#pc-draw-toolbar');
  const centers = [...bar.children]
    .map(k => k.getBoundingClientRect())
    .filter(r => r.width > 0)
    .map(r => r.top + r.height / 2)
    .sort((a, b) => a - b);
  const rows = [];
  let last = -Infinity;
  for (const c of centers) { if (c - last > 15) rows.push(0); rows[rows.length - 1]++; last = c; }
  return { rows, height: Math.round(bar.getBoundingClientRect().height) };
});

(async () => {
  await new Promise(r => server.listen(0, r));
  const PORT = server.address().port;
  const browser = await chromium.launch();
  const openHarness = async (viewport, hostCss) => {
    const page = await browser.newPage({ viewport });
    await page.goto(`http://localhost:${PORT}/test/e2e/draw-layer-harness.html`);
    await page.waitForFunction(() => window.__drawTest && window.__drawTest.ready);
    if (hostCss) await page.addStyleTag({ content: hostCss });
    await page.evaluate(() => { window.__api = window.__drawTest.init({ mode: 'draw' }); });
    return page;
  };

  console.log('toolbar-layout e2e（工具列排版與按鈕大小）:');

  await test('1512px 寬的視窗：抽屜關著或打開，工具列都排成一排', async () => {
    const page = await openHarness({ width: 1512, height: 893 });
    const closed = await toolbarRows(page);
    console.log('     抽屜關:', JSON.stringify(closed));
    assert(closed.rows.length === 1, `抽屜關時應排一排，實際每排 ${JSON.stringify(closed.rows)}`);
    await page.evaluate(() => window.__api.toggleRecordPanel());
    await page.waitForTimeout(400); // 抽屜滑入動畫 .22s
    const open = await toolbarRows(page);
    console.log('     抽屜開:', JSON.stringify(open));
    assert(open.rows.length === 1, `抽屜開時應排一排，實際每排 ${JSON.stringify(open.rows)}`);
    await page.close();
  });

  await test('宿主頁面有裸 button 樣式時，工具按鈕仍是 34×34、圖示 20×20', async () => {
    const page = await openHarness({ width: 1512, height: 893 }, HOST_BUTTON_CSS);
    const sizes = await page.evaluate(() => [...document.querySelectorAll('#pc-draw-toolbar .pc-draw-tool')]
      .filter(b => b.getBoundingClientRect().width > 0)
      .map(b => {
        const r = b.getBoundingClientRect();
        const svg = b.querySelector('svg');
        const s = svg ? svg.getBoundingClientRect() : null;
        return { label: b.title || b.textContent.trim(), w: Math.round(r.width), h: Math.round(r.height),
          svgW: s && Math.round(s.width), svgH: s && Math.round(s.height) };
      }));
    const bad = sizes.filter(t => t.w !== 34 || t.h !== 34 || (t.svgW !== null && (t.svgW !== 20 || t.svgH !== 20)));
    console.log('     工具鈕數:', sizes.length, '尺寸不對:', JSON.stringify(bad.slice(0, 3)));
    assert(sizes.length > 10, `應量到工具列上的工具鈕，實際 ${sizes.length} 顆`);
    assert(bad.length === 0, `有 ${bad.length} 顆工具鈕尺寸被宿主樣式改掉，例如 ${JSON.stringify(bad[0])}`);
    await page.close();
  });

  await test('宿主頁面有 button:hover／:active 樣式時，工具鈕 hover 不變色、按下不縮小', async () => {
    const page = await openHarness({ width: 1512, height: 893 }, HOST_BUTTON_CSS);
    const sel = '#pc-draw-toolbar .pc-draw-tool[data-tool="rect"]';
    const normalColor = await page.$eval(sel, b => getComputedStyle(b).color);
    const box = await page.locator(sel).boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.waitForTimeout(200);
    const hover = await page.$eval(sel, b => ({ color: getComputedStyle(b).color, bg: getComputedStyle(b).backgroundColor }));
    await page.mouse.down();
    await page.waitForTimeout(200);
    const transform = await page.$eval(sel, b => getComputedStyle(b).transform);
    await page.mouse.move(5, 880);
    await page.mouse.up();
    console.log('     一般/hover/按下:', JSON.stringify({ normalColor, hover, transform }));
    assert(hover.color === normalColor, `hover 時圖示顏色應維持 ${normalColor}，實際 ${hover.color}`);
    assert(hover.bg !== 'rgb(238, 238, 238)', 'hover 底色不可是宿主頁的淺灰');
    assert(transform === 'none', `按下時不可縮小，實際 transform=${transform}`);
    await page.close();
  });

  console.log(`\n${fail === 0 ? '✅' : '❌'} toolbar-layout: ${pass} passed, ${fail} failed`);
  await browser.close();
  server.close();
  process.exit(fail === 0 ? 0 : 1);
})();
