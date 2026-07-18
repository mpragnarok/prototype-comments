// test/e2e/element-drag.spec.js — e2e for 元件拖曳模式（move mode，src/draw/init-draw-layer.js）
//
//   node test/e2e/element-drag.spec.js
//
// 起本地 http server serve repo root，playwright goto draw-layer-harness.html，
// 透過工具列/API 進 move 模式 + 真實滑鼠拖曳底層 app 元件，斷言：
//   1. 開模式拖一個元件 → 元件 transform 位移 + getMoves() 有紀錄 + 紀錄面板出現位移列
//   2. 關模式 → 不可拖（拖曳不新增位移紀錄）
//   3. 重載後 → 位移重放（元件 transform 重新套上）
//   4. 刪除紀錄列 → 元件回原位（transform 清空、getMoves 空）
import { chromium } from 'playwright';
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const PORT = 8129;
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

// 真實滑鼠拖曳（move→down→move→move→up）驅動 pointer 事件。
async function dragMouse(page, x1, y1, x2, y2) {
  await page.mouse.move(x1, y1);
  await page.mouse.down();
  await page.mouse.move((x1 + x2) / 2, (y1 + y2) / 2);
  await page.mouse.move(x2, y2);
  await page.mouse.up();
}
// 進 harness + 用固定 projectId 建 draw layer（localStorage 隔離；重載可讀回）。
async function initLayer(page) {
  await page.waitForFunction(() => window.__drawTest && window.__drawTest.ready);
  await page.evaluate(() => { window.__drawTest.api = window.__drawTest.init({ projectId: 'drag-e2e' }); });
}

(async () => {
  await new Promise(r => server.listen(PORT, r));
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 800, height: 600 } });
  page.on('pageerror', e => console.log('     [pageerror]', e.message));
  page.on('console', m => { if (m.type() === 'error') console.log('     [browser err]', m.text()); });
  await page.goto(`http://localhost:${PORT}/test/e2e/draw-layer-harness.html`);
  await initLayer(page);
  // 乾淨起點：清掉任何殘留位移/標注。
  await page.evaluate(() => window.__drawTest.api.clear());

  console.log('element-drag (move mode) e2e:');

  // #price-card 位於 #canvas 內 left:80 top:60 w160 h120 → 中心 (160,120)。拖到 (260,180)＝dx100 dy60。
  await test('開模式拖 #price-card → transform 位移 + getMoves 紀錄 + 紀錄面板出現位移列', async () => {
    await page.evaluate(() => window.__drawTest.api.setMoveMode(true));
    const mode = await page.evaluate(() => window.__drawTest.api.getMode());
    assert(mode === 'move', `應進 move 模式，實際 ${mode}`);
    await dragMouse(page, 160, 120, 260, 180);
    await page.waitForTimeout(40);
    const r = await page.evaluate(() => {
      const moves = window.__drawTest.api.getMoves();
      const tf = document.getElementById('price-card').style.transform;
      window.__drawTest.api.toggleRecordPanel(); // 開紀錄面板
      const rows = [...document.querySelectorAll('.pc-draw-rec-row')].map(el => el.textContent);
      return { moves, tf, rows };
    });
    console.log('     after drag:', JSON.stringify(r));
    assert(r.moves.length === 1, `應有 1 筆位移紀錄，實際 ${r.moves.length}`);
    assert(r.moves[0].sel === '#price-card', `位移 selector 應為 #price-card，實際 ${r.moves[0].sel}`);
    assert(Math.abs(r.moves[0].dx - 100) <= 2 && Math.abs(r.moves[0].dy - 60) <= 2, `位移 dx/dy 應約 100/60，實際 ${r.moves[0].dx}/${r.moves[0].dy}`);
    assert(/translate\(100px,\s*60px\)/.test(r.tf), `#price-card transform 應含 translate(100px, 60px)，實際 "${r.tf}"`);
    assert(r.rows.some(t => /移動/.test(t)), `紀錄面板應出現位移列，實際 ${JSON.stringify(r.rows)}`);
  });

  // [data-testid="sidebar"] 中心 (380,160)。關模式後拖曳不應新增位移。
  await test('關模式 → 不可拖（拖 sidebar 不新增位移紀錄）', async () => {
    await page.evaluate(() => window.__drawTest.api.setMoveMode(false));
    const mode = await page.evaluate(() => window.__drawTest.api.getMode());
    assert(mode !== 'move', `應離開 move 模式，實際 ${mode}`);
    await dragMouse(page, 380, 160, 480, 220);
    await page.waitForTimeout(40);
    const r = await page.evaluate(() => ({
      moves: window.__drawTest.api.getMoves().length,
      sidebarTf: document.querySelector('[data-testid="sidebar"]').style.transform,
    }));
    console.log('     after off-mode drag:', JSON.stringify(r));
    assert(r.moves === 1, `關模式拖曳不應新增位移，仍應為 1，實際 ${r.moves}`);
    assert(!r.sidebarTf, `sidebar 不應被位移，實際 transform "${r.sidebarTf}"`);
  });

  await test('重載後 → 位移重放（#price-card transform 重新套上）', async () => {
    await page.reload();
    await initLayer(page);
    await page.waitForTimeout(60);
    const r = await page.evaluate(() => ({
      moves: window.__drawTest.api.getMoves(),
      tf: document.getElementById('price-card').style.transform,
    }));
    console.log('     after reload:', JSON.stringify(r));
    assert(r.moves.length === 1 && r.moves[0].sel === '#price-card', `重載後應還原 1 筆位移，實際 ${JSON.stringify(r.moves)}`);
    assert(/translate\(100px,\s*60px\)/.test(r.tf), `重載後 #price-card 應重放 transform，實際 "${r.tf}"`);
  });

  await test('刪除紀錄列 → 元件回原位（transform 清空、getMoves 空）', async () => {
    const r = await page.evaluate(() => {
      window.__drawTest.api.toggleRecordPanel(); // 開面板
      const id = window.__drawTest.api.getMoves()[0].id;
      const row = document.querySelector(`.pc-draw-rec-row[data-id="${id}"]`);
      const rm = row && row.querySelector('.pc-draw-rec-remove');
      if (rm) rm.click(); // 點真實的「移除」鈕 → removeMove
      return { clicked: !!rm };
    });
    assert(r.clicked, '位移列應有「移除」鈕可點');
    await page.waitForTimeout(40);
    const after = await page.evaluate(() => ({
      moves: window.__drawTest.api.getMoves().length,
      tf: document.getElementById('price-card').style.transform,
    }));
    console.log('     after remove:', JSON.stringify(after));
    assert(after.moves === 0, `刪除後位移紀錄應清空，實際 ${after.moves}`);
    assert(!after.tf, `刪除後 #price-card 應回原位（transform 空），實際 "${after.tf}"`);
  });

  await page.evaluate(() => window.__drawTest.api.clear());
  await browser.close();
  server.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
