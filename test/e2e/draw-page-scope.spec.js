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

  // ── ③ 送出即收納：畫布消失、紀錄仍在（已送徽章）；重整後狀態保持 ─────────────────
  await test('③ 送出即收納：畫布消失但紀錄仍列出（已送徽章＋還原鈕）；destroy 後同 projectId 重建仍隱藏、紀錄仍在', async () => {
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
    // 送出後：畫布隱藏（drawn===0），但列仍在（收納，非 outbox 移除）
    await page.waitForFunction(() => document.querySelectorAll('#pc-draw [data-id]').length === 0, { timeout: 3000 });
    const afterSend = await page.evaluate(() => ({
      rows: document.querySelectorAll('.pc-draw-rec-row').length,
      drawn: document.querySelectorAll('#pc-draw [data-id]').length,
      sentBadge: document.querySelectorAll('.pc-draw-rec-row .pc-draw-rec-status.is-sent').length,
      restoreBtn: document.querySelectorAll('.pc-draw-rec-row .pc-draw-rec-restore').length,
      hidden: window.__drawTest.api.getObjects()[0].hidden === true,
    }));
    assert(afterSend.drawn === 0, `送出後畫布應隱藏，實際 drawn=${afterSend.drawn}`);
    assert(afterSend.rows === 1, `送出後標注應仍列在紀錄（收納），實際 rows=${afterSend.rows}`);
    assert(afterSend.sentBadge === 1, `收納列應顯示「已送」徽章，實際 ${afterSend.sentBadge}`);
    assert(afterSend.restoreBtn === 1, `收納列應有「還原到畫布」鈕，實際 ${afterSend.restoreBtn}`);
    assert(afterSend.hidden === true, `物件應標記 hidden，實際 ${afterSend.hidden}`);
    // 模擬「重整 / 重新載入」：destroy 後同 projectId 重建（objects 從 localStorage 還原）
    await page.evaluate(() => { window.__drawTest.api.destroy(); window.__drawTest.api = window.__drawTest.init({ projectId: 'sendpersist' }); });
    const reinit = await page.evaluate(() => {
      const d = document.getElementById('pc-draw-rec-drawer'); if (!d.classList.contains('open')) window.__drawTest.api.toggleRecordPanel();
      return { rows: document.querySelectorAll('.pc-draw-rec-row').length, drawn: document.querySelectorAll('#pc-draw [data-id]').length, objs: window.__drawTest.api.getObjects().length, hidden: window.__drawTest.api.getObjects()[0].hidden === true };
    });
    console.log('     re-init after send:', JSON.stringify(reinit));
    assert(reinit.objs === 1, `物件應仍在（從 localStorage 還原），實際 ${reinit.objs}`);
    assert(reinit.drawn === 0, `收納標注重建後不應又畫回畫布，實際 drawn=${reinit.drawn}`);
    assert(reinit.rows === 1, `收納標注重建後應仍列在紀錄，實際 rows=${reinit.rows}`);
    assert(reinit.hidden === true, `重建後 hidden 狀態應保持，實際 ${reinit.hidden}`);
    await page.evaluate(() => { window.__drawTest.api.destroy(); localStorage.removeItem('pc-draw-local:sendpersist'); localStorage.removeItem('pc-draw-sent:sendpersist'); });
  });

  // ── ④ 還原到畫布：單筆還原 → 畫布重現、保留已送徽章、不重複送；重整後仍顯示 ───────────
  await test('④ 還原到畫布：送出收納 → 點還原 → 畫布重現＋仍標已送＋送出鈕不重複計數；重整後仍顯示', async () => {
    await page.evaluate(() => {
      try { if (window.__drawTest.api) window.__drawTest.api.destroy(); } catch (_) {}
      localStorage.removeItem('pc-draw-local:restore');
      localStorage.removeItem('pc-draw-sent:restore');
      window.__drawTest.api = window.__drawTest.init({ projectId: 'restore' });
      window.__drawTest.api.setTool('rect');
    });
    await dragDraw(page, 150, 110, 250, 190);
    await page.evaluate(() => { const d = document.getElementById('pc-draw-rec-drawer'); if (!d.classList.contains('open')) window.__drawTest.api.toggleRecordPanel(); });
    await page.evaluate(() => {
      window.fetch = () => Promise.resolve({ ok: true, json: () => Promise.resolve({ ok: true, n: 1, listening: true }) });
      window.__drawTest.api.setExportEndpoint('http://x/api/draw');
    });
    await page.click('.pc-draw-rec-send-btn');
    await page.waitForFunction(() => document.querySelectorAll('#pc-draw [data-id]').length === 0, { timeout: 3000 });
    // 點「還原到畫布」
    await page.click('.pc-draw-rec-restore');
    await page.waitForFunction(() => document.querySelectorAll('#pc-draw [data-id]').length === 1, { timeout: 3000 });
    const afterRestore = await page.evaluate(() => ({
      drawn: document.querySelectorAll('#pc-draw [data-id]').length,
      rows: document.querySelectorAll('.pc-draw-rec-row').length,
      sentBadge: document.querySelectorAll('.pc-draw-rec-row .pc-draw-rec-status.is-sent').length,
      restoreBtn: document.querySelectorAll('.pc-draw-rec-row .pc-draw-rec-restore').length,
      hidden: window.__drawTest.api.getObjects()[0].hidden === true,
      sendBtn: (document.querySelector('.pc-draw-rec-send-btn') || {}).textContent || '',
    }));
    assert(afterRestore.drawn === 1, `還原後畫布應重現該標注，實際 drawn=${afterRestore.drawn}`);
    assert(afterRestore.rows === 1, `還原後紀錄仍列該標注，實際 rows=${afterRestore.rows}`);
    assert(afterRestore.sentBadge === 1, `還原後仍保留「已送」徽章，實際 ${afterRestore.sentBadge}`);
    assert(afterRestore.restoreBtn === 0, `還原後不再顯示還原鈕（已在畫布），實際 ${afterRestore.restoreBtn}`);
    assert(afterRestore.hidden === false, `還原後 hidden 應清除，實際 ${afterRestore.hidden}`);
    assert(!/送給 AI（1）/.test(afterRestore.sendBtn), `還原（已送未改）不應被重複計入送出，送出鈕文字=${afterRestore.sendBtn}`);
    // 重整：destroy 後同 projectId 重建 → 還原狀態（可見）保持
    await page.evaluate(() => { window.__drawTest.api.destroy(); window.__drawTest.api = window.__drawTest.init({ projectId: 'restore' }); });
    const reinit = await page.evaluate(() => ({ drawn: document.querySelectorAll('#pc-draw [data-id]').length, hidden: window.__drawTest.api.getObjects()[0].hidden === true }));
    console.log('     re-init after restore:', JSON.stringify(reinit));
    assert(reinit.drawn === 1, `重整後還原的標注應仍顯示，實際 drawn=${reinit.drawn}`);
    assert(reinit.hidden === false, `重整後 hidden 應維持清除，實際 ${reinit.hidden}`);
    await page.evaluate(() => { window.__drawTest.api.destroy(); localStorage.removeItem('pc-draw-local:restore'); localStorage.removeItem('pc-draw-sent:restore'); });
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
