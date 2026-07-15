// test/e2e/note-multiline.spec.js — e2e for note 編輯器多行支援（pc-note-multiline）。
//
//   node test/e2e/note-multiline.spec.js
//
// 需求：註記只能單行不夠用 → note textarea 支援 Shift+Enter 換行、Enter 仍存紀錄（既有拍板行為
// 不可改）。本檔用真實鍵盤輸入模擬「第一行 → Shift+Enter → 第二行 → Enter」，斷言：
//   1. Shift+Enter 只換行，不提前存紀錄（打第一行過程中不應觸發 submit）
//   2. Enter 存入紀錄後 getNotes()[].text 含 \n，兩行內容都在
//   3. 送給 AI 的 payload（buildExport().notes[].text）保留換行
//   4. note 卡（view 模式）與標注紀錄列都保留換行顯示（white-space 非 nowrap）
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

const LINE1 = '第一行';
const LINE2 = '第二行';

(async () => {
  await new Promise(r => server.listen(0, r));
  const PORT = server.address().port; // ephemeral → 不與平行 bg job 撞埠
  const browser = await chromium.launch();
  console.log('note multiline e2e:');

  await test('第一行 → Shift+Enter → 第二行 → Enter：換行不提前送出、存紀錄後含 \\n、卡片/紀錄列/payload 都保留換行', async () => {
    const page = await browser.newPage({ viewport: { width: 800, height: 600 } });
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(`http://localhost:${PORT}/test/e2e/note-mode-harness.html`);
    await page.waitForFunction(() => window.__noteCrash && window.__noteCrash.ready);
    await page.evaluate(() => window.__noteCrash.initNative({ mode: 'off' }));

    // 1) note 模式 hover + click #para → 開新 note 卡（未送出，pendingAnchor）
    await page.evaluate(() => window.__api.setMode('note'));
    await page.waitForTimeout(60);
    const box = await page.evaluate(() => { const r = document.getElementById('para').getBoundingClientRect(); return { x: r.left + 40, y: r.top + r.height / 2 }; });
    await page.mouse.move(box.x, box.y);
    await page.mouse.move(box.x + 3, box.y + 2);
    await page.waitForTimeout(60);
    await page.mouse.click(box.x, box.y);
    await page.waitForTimeout(120);
    const cardOpened = await page.evaluate(() => !!document.querySelector('.pc-note-card textarea'));
    assert(cardOpened, '點擊目標應開啟 note 卡且含 textarea 輸入元件');

    // 已是 textarea → 確認鍵盤行為/placeholder 提示到位
    const placeholder = await page.evaluate(() => document.querySelector('.pc-note-card textarea').placeholder);
    assert(placeholder.includes('Shift+Enter'), `placeholder 應提示 Shift+Enter 換行，實際「${placeholder}」`);

    // 2) 真實鍵盤輸入第一行
    await page.click('.pc-note-card textarea');
    await page.keyboard.type(LINE1);
    const notesAfterLine1 = await page.evaluate(() => window.__api.getNotes().length);
    assert(notesAfterLine1 === 0, `打第一行途中不應提前存紀錄，實際 getNotes().length=${notesAfterLine1}`);

    // 3) Shift+Enter → 只換行，仍未存紀錄
    await page.keyboard.press('Shift+Enter');
    const notesAfterShiftEnter = await page.evaluate(() => window.__api.getNotes().length);
    assert(notesAfterShiftEnter === 0, `Shift+Enter 不應觸發送出/存檔，實際 getNotes().length=${notesAfterShiftEnter}`);
    const valueAfterShiftEnter = await page.evaluate(() => document.querySelector('.pc-note-card textarea').value);
    assert(valueAfterShiftEnter === LINE1 + '\n', `Shift+Enter 後 textarea 值應為「第一行\\n」，實際 ${JSON.stringify(valueAfterShiftEnter)}`);

    // 4) 打第二行 → Enter → 存紀錄（單獨 Enter＝存，非 Shift/⌘）
    await page.keyboard.type(LINE2);
    await page.keyboard.press('Enter');
    await page.waitForTimeout(120);

    const notes = await page.evaluate(() => window.__api.getNotes());
    assert(notes.length === 1, `Enter 後應存入 1 則 note，實際 ${notes.length}`);
    const expected = LINE1 + '\n' + LINE2;
    assert(notes[0].text === expected, `note text 應為 ${JSON.stringify(expected)}，實際 ${JSON.stringify(notes[0].text)}`);

    // 5) 送給 AI 的 payload（buildExport）保留換行
    const payload = await page.evaluate(() => window.__api.buildExport());
    assert(Array.isArray(payload.notes) && payload.notes.length === 1, 'buildExport().notes 應含剛存的這則');
    assert(payload.notes[0].text === expected, `payload note.text 應保留換行，實際 ${JSON.stringify(payload.notes[0].text)}`);

    // 6) 重開 note 卡（view 模式）→ .pc-note-prompt-text 保留換行顯示
    const reopened = await page.evaluate(() => { const t = document.querySelector('.pc-note-tab'); if (!t) return false; t.click(); return true; });
    assert(reopened, '應找到 note badge .pc-note-tab 以重開卡');
    await page.waitForTimeout(80);
    const cardView = await page.evaluate(() => {
      const el = document.querySelector('.pc-note-prompt-text');
      if (!el) return null;
      const cs = getComputedStyle(el);
      return { text: el.textContent, whiteSpace: cs.whiteSpace };
    });
    assert(cardView && cardView.text.includes('\n'), 'note 卡內容應保留 \\n');
    // textContent 含「我的 prompt」標籤（同容器內的 sibling label），故用 includes 而非嚴格相等
    assert(cardView.text.includes(expected), `note 卡顯示內容應含 ${JSON.stringify(expected)}，實際 ${JSON.stringify(cardView.text)}`);
    assert(cardView.whiteSpace === 'pre-wrap', `note 卡 white-space 應為 pre-wrap 以顯示換行，實際 ${cardView.whiteSpace}`);

    // 7) 標注紀錄列同樣保留換行
    await page.evaluate(() => window.__api.toggleRecordPanel());
    await page.waitForTimeout(80);
    const recRow = await page.evaluate((t) => {
      const rows = [...document.querySelectorAll('.pc-draw-rec-text')];
      const el = rows.find(r => r.textContent.includes(t));
      if (!el) return null;
      const cs = getComputedStyle(el);
      return { text: el.textContent, whiteSpace: cs.whiteSpace };
    }, LINE1);
    assert(recRow, '標注紀錄列應列出剛存的這則 note');
    assert(recRow.text.includes('\n'), `標注紀錄列應保留 \\n，實際 ${JSON.stringify(recRow.text)}`);
    assert(recRow.whiteSpace !== 'nowrap', `標注紀錄列 white-space 不應是 nowrap（會吃掉換行顯示），實際 ${recRow.whiteSpace}`);

    assert(errors.length === 0, `不應 throw：${JSON.stringify(errors)}`);
    await page.close();
  });

  await browser.close();
  server.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
