// test/e2e/note-delete-record-sync.spec.js — regression e2e：note 卡片『刪除』後標注紀錄面板同步移除。
//
//   node test/e2e/note-delete-record-sync.spec.js
//
// 事故：note 卡片的『刪除』鈕直呼 deleteNote()，舊版只 renderNotes() 重繪畫布、未呼
// renderRecordPanel() → 標注紀錄側欄仍列出已刪 note（使用者：「按下刪除後但還是會出現在標注紀錄」）。
// 紀錄面板自己的移除鈕走 removeNote() 有重繪所以正常，只有卡片刪除鈕漏。
// 本檔建立 note → 開紀錄面板確認有列 → 按卡片『刪除』→ 斷言 getNotes() 空且紀錄面板不再含該文字。
import { chromium } from 'playwright';
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const PORT = 8341;
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

const NOTE_TEXT = '刪除同步測試 note';

(async () => {
  await new Promise(r => server.listen(PORT, r));
  const browser = await chromium.launch();
  console.log('note delete → record-panel sync e2e:');

  await test('卡片『刪除』後 getNotes() 清空且標注紀錄面板不再列出該 note', async () => {
    const page = await browser.newPage({ viewport: { width: 800, height: 600 } });
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(`http://localhost:${PORT}/test/e2e/note-mode-harness.html`);
    await page.waitForFunction(() => window.__noteCrash && window.__noteCrash.ready);
    await page.evaluate(() => window.__noteCrash.initNative({ mode: 'off' }));

    // 1) 建立一則 note（用 api.addNote 直接種，避免依賴滑鼠座標）
    await page.evaluate((t) => window.__api.addNote(t, { x: 50, y: 50 }), NOTE_TEXT);
    await page.waitForTimeout(80);
    const notesAfterCreate = await page.evaluate(() => window.__api.getNotes().length);
    assert(notesAfterCreate === 1, `建立後應有 1 則 note，實際 ${notesAfterCreate}`);

    // 2) 開標注紀錄面板 → 應列出該 note
    await page.evaluate(() => window.__api.toggleRecordPanel());
    await page.waitForTimeout(80);
    const listedBefore = await page.evaluate((t) => {
      const list = document.querySelector('.pc-draw-rec-list');
      return !!list && list.textContent.includes(t);
    }, NOTE_TEXT);
    assert(listedBefore, '刪除前：標注紀錄面板應列出該 note');

    // 3) 開 note 卡 → 按『刪除』。用 DOM .click() 直接觸發 onclick handler（＝走 deleteNote 那條路），
    //    紀錄面板全程保持開啟 → 只有 deleteNote 有呼 renderRecordPanel 時列表才會更新（真正的回歸點）。
    //    （不用 Playwright 實體點擊，因為開著的紀錄抽屜會攔截 badge 的 pointer events。）
    const opened = await page.evaluate(() => { const t = document.querySelector('.pc-note-tab'); if (!t) return false; t.click(); return true; });
    assert(opened, '應找到 note badge .pc-note-tab 以開卡');
    await page.waitForTimeout(120);
    const deleted = await page.evaluate(() => {
      const btn = [...document.querySelectorAll('.pc-note-card button')].find(b => b.textContent.includes('刪除'));
      if (!btn) return false; btn.click(); return true;
    });
    assert(deleted, '應找到卡片『刪除』鈕');
    await page.waitForTimeout(150);

    // 4) 斷言：note 清空 + 紀錄面板不再含該文字
    const notesAfterDelete = await page.evaluate(() => window.__api.getNotes().length);
    const listedAfter = await page.evaluate((t) => {
      const list = document.querySelector('.pc-draw-rec-list');
      return !!list && list.textContent.includes(t);
    }, NOTE_TEXT);
    assert(notesAfterDelete === 0, `刪除後 getNotes() 應為空，實際 ${notesAfterDelete}`);
    assert(!listedAfter, '刪除後：標注紀錄面板不應再列出該 note（回歸點）');
    assert(errors.length === 0, `不應 throw：${JSON.stringify(errors)}`);
    await page.close();
  });

  await browser.close();
  server.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
