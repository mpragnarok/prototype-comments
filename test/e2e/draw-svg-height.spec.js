// test/e2e/draw-svg-height.spec.js — e2e for #pc-draw svg 高度 bug（pc-draw-svg-height-bug）
//
//   node test/e2e/draw-svg-height.spec.js
//
// Bug：CSS #pc-draw{height:100%}（src/draw/styles.js）只吃到 host 的內容高。內容比視窗
// 矮的頁面，host（常見即 document.body）的高 = 內容高，svg 蓋不到下方視窗空白區 → 無法在
// 那裡畫標注。修法：render() 內 syncSvgHeight() 用 inline style 蓋過 CSS，取
// max(document.documentElement.scrollHeight, window.innerHeight)。
//
// 驗證：
//   - 短內容頁：svg 實際高度 ≥ window.innerHeight（蓋滿視窗）
//   - 在內容下方的空白視窗區域真實 drag 一個 rect → getObjects() 有該筆
import { chromium } from 'playwright';
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
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

async function dragDraw(page, x1, y1, x2, y2) {
  await page.mouse.move(x1, y1); await page.mouse.down();
  await page.mouse.move((x1 + x2) / 2, (y1 + y2) / 2); await page.mouse.move(x2, y2); await page.mouse.up();
}

(async () => {
  await new Promise(r => server.listen(0, r));
  const PORT = server.address().port; // ephemeral → 不與平行 bg job 撞埠
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 800, height: 600 } }); // 內容僅 80px 高，遠矮於視窗
  page.on('pageerror', e => console.log('     [pageerror]', e.message));
  page.on('console', m => { if (m.type() === 'error') console.log('     [browser err]', m.text()); });
  await page.goto(`http://localhost:${PORT}/test/e2e/draw-svg-height-harness.html`);
  await page.waitForFunction(() => window.__drawTest && window.__drawTest.ready);

  console.log('draw svg height e2e（短頁 + 較長視窗）:');

  await test('短內容頁 init 後：#pc-draw svg 高度 ≥ window.innerHeight（蓋滿視窗，非只蓋內容高）', async () => {
    const r = await page.evaluate(() => {
      window.__drawTest.api = window.__drawTest.init({ mode: 'draw' });
      const svg = document.getElementById('pc-draw');
      const rect = svg.getBoundingClientRect();
      return {
        svgHeight: rect.height,
        contentHeight: document.getElementById('content').getBoundingClientRect().height,
        innerHeight: window.innerHeight,
      };
    });
    console.log('     ', JSON.stringify(r));
    assert(r.contentHeight < r.innerHeight, '測試前提：內容高應遠小於視窗高（否則沒重現到 bug 場景）');
    assert(r.svgHeight >= r.innerHeight - 1, `svg 高度應 ≥ 視窗高，實際 svg=${r.svgHeight} innerHeight=${r.innerHeight}`);
  });

  await test('在內容下方的空白視窗區域真實 drag → 能畫出 rect（getObjects 有該筆）', async () => {
    await page.evaluate(() => window.__drawTest.api.setTool('rect'));
    // content 只到 y=80px；在 y=200~400（視窗下方空白區，短頁原本蓋不到 svg 的地方）拉框。
    await dragDraw(page, 200, 200, 500, 400);
    const r = await page.evaluate(() => ({
      rects: document.querySelectorAll('#pc-draw > rect').length,
      objs: window.__drawTest.api.getObjects().map(o => o.tool),
    }));
    console.log('     ', JSON.stringify(r));
    assert(r.rects === 1, `視窗下方空白區應可畫出 1 個 rect，實際 ${r.rects}`);
    assert(r.objs.length === 1 && r.objs[0] === 'rect', 'getObjects 應有 1 筆 rect');
  });

  await test('resize 後 svg 高度仍跟著 max(文件高, 視窗高) 重算', async () => {
    await page.setViewportSize({ width: 800, height: 900 });
    await page.waitForTimeout(50);
    const r = await page.evaluate(() => ({
      svgHeight: document.getElementById('pc-draw').getBoundingClientRect().height,
      innerHeight: window.innerHeight,
    }));
    console.log('     ', JSON.stringify(r));
    assert(r.svgHeight >= r.innerHeight - 1, `resize 後 svg 高度應跟上新視窗高，實際 svg=${r.svgHeight} innerHeight=${r.innerHeight}`);
  });

  await browser.close();
  await new Promise(r => server.close(r));
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
