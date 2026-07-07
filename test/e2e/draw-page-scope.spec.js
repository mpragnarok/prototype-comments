// test/e2e/draw-page-scope.spec.js — e2e for 三件修正：
//   ① 決策 A：標注跟著頁面走（opts.getScreenId + api.refresh() → 換頁只顯示該頁、換回還在）
//   ② Enter 只存進標注紀錄、不直接送 AI（送出只走「送給 AI」按鈕）
//   ③ 送出後「已送」狀態持久化 → 重整/重訂閱後不會又把已送標注畫回（不再重現）
//
//   node test/e2e/draw-page-scope.spec.js
//
// 復用 draw-layer-harness.html（同 prod /src/ 服務路徑，dev 模式 localStorage 持久化）。
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

async function dragDraw(page, x1, y1, x2, y2) {
  await page.mouse.move(x1, y1);
  await page.mouse.down();
  await page.mouse.move((x1 + x2) / 2, (y1 + y2) / 2);
  await page.mouse.move(x2, y2);
  await page.mouse.up();
}

// 畫布上「被畫出來」的標注節點數（render 給每個物件 node 打 data-id）。
const drawnCount = (page) => page.evaluate(() => document.querySelectorAll('#pc-draw [data-id]').length);

(async () => {
  await new Promise(r => server.listen(PORT, r));
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 800, height: 600 } });
  page.on('pageerror', e => console.log('     [pageerror]', e.message));
  page.on('console', m => { if (m.type() === 'error') console.log('     [browser err]', m.text()); });
  await page.goto(`http://localhost:${PORT}/test/e2e/draw-layer-harness.html`);
  await page.waitForFunction(() => window.__drawTest && window.__drawTest.ready);

  console.log('draw page-scope + send-flow e2e:');

  // ── ① 標注跟著頁面走 ─────────────────────────────────────────────────────────
  await test('① 換頁不殘留：頁 A 畫的標注在頁 B 不顯示、換回頁 A 仍在（不刪物件）', async () => {
    await page.evaluate(() => {
      try { if (window.__drawTest.api) window.__drawTest.api.destroy(); } catch (_) {}
      localStorage.removeItem('pc-draw-local:scope');
      localStorage.removeItem('pc-draw-sent:scope');
      window.__screen = 'A';
      window.__drawTest.api = window.__drawTest.init({ projectId: 'scope', getScreenId: () => window.__screen });
      window.__drawTest.api.setTool('rect');
    });
    await dragDraw(page, 100, 100, 200, 180);
    // 頁 A：畫得出來、物件帶 screenId 'A'
    const a = await page.evaluate(() => ({ drawn: document.querySelectorAll('#pc-draw [data-id]').length, objs: window.__drawTest.api.getObjects() }));
    assert(a.drawn === 1, `頁 A 應畫出 1 筆，實際 ${a.drawn}`);
    assert(a.objs.length === 1 && a.objs[0].screenId === 'A', `物件應帶 screenId 'A'，實際 ${JSON.stringify(a.objs[0] && a.objs[0].screenId)}`);
    // 切到頁 B + refresh → 不畫；但物件沒被刪（getObjects 仍 1）
    await page.evaluate(() => { window.__screen = 'B'; window.__drawTest.api.refresh(); });
    const b = await page.evaluate(() => ({ drawn: document.querySelectorAll('#pc-draw [data-id]').length, objs: window.__drawTest.api.getObjects().length }));
    assert(b.drawn === 0, `頁 B 不應顯示頁 A 的標注，實際 drawn=${b.drawn}`);
    assert(b.objs === 1, `切頁只是不畫、不刪物件，getObjects 應仍 1，實際 ${b.objs}`);
    // 換回頁 A + refresh → 又出現
    await page.evaluate(() => { window.__screen = 'A'; window.__drawTest.api.refresh(); });
    const a2 = await drawnCount(page);
    assert(a2 === 1, `換回頁 A 應又顯示該標注，實際 ${a2}`);
    await page.evaluate(() => { window.__drawTest.api.destroy(); localStorage.removeItem('pc-draw-local:scope'); localStorage.removeItem('pc-draw-sent:scope'); });
  });

  await test('① 標注紀錄清單也跟著頁面走：頁 B 清單 0 列、頁 A 有 1 列', async () => {
    await page.evaluate(() => {
      try { if (window.__drawTest.api) window.__drawTest.api.destroy(); } catch (_) {}
      localStorage.removeItem('pc-draw-local:scope2');
      window.__screen = 'A';
      window.__drawTest.api = window.__drawTest.init({ projectId: 'scope2', getScreenId: () => window.__screen });
      window.__drawTest.api.setTool('rect');
    });
    await dragDraw(page, 120, 120, 210, 190);
    await page.evaluate(() => { const d = document.getElementById('pc-draw-rec-drawer'); if (!d.classList.contains('open')) window.__drawTest.api.toggleRecordPanel(); });
    const rowsA = await page.evaluate(() => document.querySelectorAll('.pc-draw-rec-row').length);
    assert(rowsA === 1, `頁 A 清單應 1 列，實際 ${rowsA}`);
    await page.evaluate(() => { window.__screen = 'B'; window.__drawTest.api.refresh(); });
    const rowsB = await page.evaluate(() => document.querySelectorAll('.pc-draw-rec-row').length);
    assert(rowsB === 0, `頁 B 清單應 0 列（不含頁 A 標注），實際 ${rowsB}`);
    await page.evaluate(() => { const d = document.getElementById('pc-draw-rec-drawer'); if (d.classList.contains('open')) window.__drawTest.api.toggleRecordPanel(); window.__drawTest.api.destroy(); localStorage.removeItem('pc-draw-local:scope2'); });
  });

  await test('① 向後相容：未傳 getScreenId → 不論當前 screen 一律全畫、物件不帶 screenId', async () => {
    await page.evaluate(() => {
      try { if (window.__drawTest.api) window.__drawTest.api.destroy(); } catch (_) {}
      localStorage.removeItem('pc-draw-local:bc');
      window.__screen = 'B'; // 即使有 screen 變數，未傳 getScreenId 就不應過濾
      window.__drawTest.api = window.__drawTest.init({ projectId: 'bc' });
      window.__drawTest.api.setTool('rect');
    });
    await dragDraw(page, 130, 130, 220, 200);
    const r = await page.evaluate(() => ({ drawn: document.querySelectorAll('#pc-draw [data-id]').length, screenId: window.__drawTest.api.getObjects()[0].screenId }));
    assert(r.drawn === 1, `未傳 getScreenId 應照常全畫，實際 ${r.drawn}`);
    assert(r.screenId === undefined, `未傳 getScreenId 物件不應帶 screenId，實際 ${JSON.stringify(r.screenId)}`);
    await page.evaluate(() => { window.__drawTest.api.destroy(); localStorage.removeItem('pc-draw-local:bc'); });
  });

  // ── ③ 送出後「已送」持久化，重整不再重現 ─────────────────────────────────────
  await test('③ 送出後重整不重現：送出 → 清單 0 列 + 畫布隱藏；destroy 後同 projectId 重建仍隱藏、不畫回', async () => {
    await page.evaluate(() => {
      try { if (window.__drawTest.api) window.__drawTest.api.destroy(); } catch (_) {}
      localStorage.removeItem('pc-draw-local:sendpersist');
      localStorage.removeItem('pc-draw-sent:sendpersist');
      window.__drawTest.api = window.__drawTest.init({ projectId: 'sendpersist' });
      window.__drawTest.api.setTool('rect');
    });
    await dragDraw(page, 140, 100, 240, 180);
    await page.evaluate(() => { const d = document.getElementById('pc-draw-rec-drawer'); if (!d.classList.contains('open')) window.__drawTest.api.toggleRecordPanel(); });
    await page.evaluate(() => {
      window.fetch = () => Promise.resolve({ ok: true, json: () => Promise.resolve({ ok: true, n: 1, listening: true }) });
      window.__drawTest.api.setExportEndpoint('http://x/api/draw');
    });
    await page.click('.pc-draw-rec-send-btn');
    await page.waitForFunction(() => document.querySelectorAll('.pc-draw-rec-row').length === 0, { timeout: 3000 });
    const afterSend = await page.evaluate(() => ({ rows: document.querySelectorAll('.pc-draw-rec-row').length, drawn: document.querySelectorAll('#pc-draw [data-id]').length }));
    assert(afterSend.rows === 0 && afterSend.drawn === 0, `送出後清單應 0 列、畫布隱藏，實際 ${JSON.stringify(afterSend)}`);
    // 模擬「重整 / 重新載入」：destroy 後同 projectId 重建（objects 從 localStorage 還原）
    await page.evaluate(() => { window.__drawTest.api.destroy(); window.__drawTest.api = window.__drawTest.init({ projectId: 'sendpersist' }); });
    const reinit = await page.evaluate(() => {
      const d = document.getElementById('pc-draw-rec-drawer'); if (!d.classList.contains('open')) window.__drawTest.api.toggleRecordPanel();
      return { rows: document.querySelectorAll('.pc-draw-rec-row').length, drawn: document.querySelectorAll('#pc-draw [data-id]').length, objs: window.__drawTest.api.getObjects().length };
    });
    console.log('     re-init after send:', JSON.stringify(reinit));
    assert(reinit.objs === 1, `物件應仍在（從 localStorage 還原），實際 ${reinit.objs}`);
    assert(reinit.drawn === 0, `已送標注重建後不應又畫回畫布，實際 drawn=${reinit.drawn}`);
    assert(reinit.rows === 0, `已送標注重建後不應又回清單，實際 rows=${reinit.rows}`);
    await page.evaluate(() => { window.__drawTest.api.destroy(); localStorage.removeItem('pc-draw-local:sendpersist'); localStorage.removeItem('pc-draw-sent:sendpersist'); });
  });

  // ── ② Enter 只存進標注紀錄、不送 AI ──────────────────────────────────────────
  await test('② Enter 只存進標注紀錄、不觸發送出（送 AI 只走「送給 AI」按鈕）', async () => {
    await page.evaluate(() => {
      try { if (window.__drawTest.api) window.__drawTest.api.destroy(); } catch (_) {}
      localStorage.removeItem('pc-draw-local:enter');
      window.__drawTest.api = window.__drawTest.init({ projectId: 'enter' });
      window.__sendCount = 0;
      window.fetch = () => { window.__sendCount++; return Promise.resolve({ ok: true, json: () => Promise.resolve({ ok: true, n: 1, listening: true }) }); };
      window.__drawTest.api.setExportEndpoint('http://x/api/draw'); // 有 endpoint → 若真送就會打到 fetch
      window.__drawTest.api.setMode('note');
    });
    const box = await page.evaluate(() => { const r = document.getElementById('price-card').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
    await page.mouse.move(box.x, box.y);
    await page.mouse.click(box.x, box.y);
    await page.waitForSelector('.pc-note-card textarea', { timeout: 2000 });
    await page.fill('.pc-note-card textarea', '這裡改藍色');
    const r = await page.evaluate(() => {
      const ta = document.querySelector('.pc-note-card textarea');
      ta.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
      return { notes: window.__drawTest.api.getNotes().length, sends: window.__sendCount };
    });
    console.log('     enter stores-not-sends:', JSON.stringify(r));
    assert(r.notes === 1, `Enter 應把標注存進紀錄，實際 notes=${r.notes}`);
    assert(r.sends === 0, `Enter 不應觸發送出，實際 fetch 次數=${r.sends}`);
    await page.evaluate(() => { window.__drawTest.api.setMode('draw'); window.__drawTest.api.destroy(); localStorage.removeItem('pc-draw-local:enter'); });
  });

  await browser.close();
  await new Promise(r => server.close(r));
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
