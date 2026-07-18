// test/e2e/note-edit-ghost-card.spec.js — regression e2e：note 模式點「編輯」鈕誤生幽靈 note。
//
//   node test/e2e/note-edit-ghost-card.spec.js
//
// 根因：編輯鈕 onclick → renderCardInput(body, c, c.text)，其第一行 `body.innerHTML = ''`
// 會在同一次 click 事件「派送過程中」把編輯鈕自己（與所在的 .pc-note-row）從 DOM 摘掉。
// noteLayer 上委派的 click handler 用 `e.target.closest('.pc-note-card')` 判斷「這次點擊是否
// 發生在卡片內」——但 closest() 走的是 *當下*（live）的 parentNode 鏈；編輯鈕此時已被摘掉、
// 走不到 .pc-note-card，guard 失效，事件落到「note 模式點畫布空白建新卡」邏輯：
// openNoteCard({...新錨點}) 找不到既有的 data-note-id="new" 卡 → closeAllNoteCards() 把剛開的
// 編輯卡整個關掉，換成一張空白幽靈 note（錨點還可能落在編輯鈕當下螢幕座標底下的任意元件上）。
//
// 修法：card 建立時掛一個 `card.addEventListener('click', e => e.stopPropagation())`，卡內任何
// 點擊（不論按鈕自己怎麼改自己的 DOM）一律不外洩到 noteLayer；card/body/noteLayer 三者本身全程
// 都還在 DOM 上、事件冒泡路徑於 dispatch 當下已鎖定，不受卡內子節點被摘掉影響。
//
// 本檔斷言：note 模式下，開既有 note 的檢視卡 → 點「編輯」→ 應該還是同一則 note 的編輯卡
// （data-note-id 不變、textarea 帶原文字），不應變成 data-note-id="new" 的空白卡、
// 也不應讓 getNotes() 平白多出一筆。
import { chromium } from 'playwright';
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const PORT = 8353;
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

async function bootWithOneNote(browser) {
  const page = await browser.newPage({ viewport: { width: 800, height: 600 } });
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto(`http://localhost:${PORT}/test/e2e/draw-layer-harness.html`);
  await page.waitForFunction(() => window.__drawTest && window.__drawTest.ready);
  await page.evaluate(() => { window.__drawTest.api = window.__drawTest.init({ mode: 'off' }); });
  await page.evaluate(() => {
    const api = window.__drawTest.api;
    api.setMode('note'); // 觸發條件之一：note 模式下 noteLayer 的「點畫布空白建新卡」邏輯才會啟動
    api.addNote('原始文字', { sel: '#price-card', relX: 0.5, relY: 0.5, label: 'div' });
  });
  return { page, errors };
}

async function openViewCard(page) {
  const badge = await page.evaluate(() => {
    const t = document.querySelector('.pc-note-mark .pc-note-tab');
    const r = t.getBoundingClientRect();
    return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) };
  });
  await page.mouse.click(badge.x, badge.y);
  await page.waitForSelector('.pc-note-card', { timeout: 2000 });
}

async function clickEditButton(page) {
  const editBox = await page.evaluate(() => {
    const btn = [...document.querySelectorAll('.pc-note-card button')].find(b => b.textContent.includes('編輯'));
    if (!btn) return null;
    const r = btn.getBoundingClientRect();
    return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) };
  });
  assert(editBox, '應找到「編輯」鈕');
  await page.mouse.click(editBox.x, editBox.y); // 真實滑鼠點擊（非 el.click()），完整走瀏覽器 event dispatch
}

(async () => {
  await new Promise(r => server.listen(PORT, r));
  const browser = await chromium.launch();
  console.log('note 編輯鈕幽靈 note 迴歸測試:');

  await test('note 模式｜點「編輯」鈕 → 應開同一則 note 的編輯卡，不應變成空白幽靈新卡', async () => {
    const { page, errors } = await bootWithOneNote(browser);
    await openViewCard(page);
    const beforeId = await page.evaluate(() => document.querySelector('.pc-note-card').dataset.noteId);
    assert(beforeId !== 'new', '開卡當下應是既有 note 的卡（非 new）');

    await clickEditButton(page);
    await page.waitForTimeout(150);

    const after = await page.evaluate(() => {
      const cards = [...document.querySelectorAll('.pc-note-card')];
      const ta = document.querySelector('.pc-note-card textarea');
      return {
        cardCount: cards.length,
        cardIds: cards.map(c => c.dataset.noteId),
        notesCount: window.__drawTest.api.getNotes().length,
        textareaVal: ta ? ta.value : null,
      };
    });
    console.log('     after edit click:', JSON.stringify(after));
    assert(after.cardCount === 1, '編輯後仍應只有一張卡（不該多生幽靈卡）');
    assert(after.cardIds[0] === beforeId, `編輯後卡片應維持同一 note id（實際 ${after.cardIds[0]}），不應退化成 "new" 空白幽靈卡`);
    assert(after.textareaVal === '原始文字', `編輯 textarea 應帶原文字（實際 ${JSON.stringify(after.textareaVal)}），不應是空白幽靈卡`);
    assert(after.notesCount === 1, `getNotes() 不應平白多出一筆（實際 ${after.notesCount} 筆）`);
    assert(errors.length === 0, `不應 throw：${JSON.stringify(errors)}`);
    await page.close();
  });

  await test('note 模式｜編輯 → 改文字 → 存檔 → 應正常更新原本那則 note，不應多出第二筆', async () => {
    const { page, errors } = await bootWithOneNote(browser);
    await openViewCard(page);
    await clickEditButton(page);
    await page.waitForSelector('.pc-note-card textarea', { timeout: 2000 });
    await page.fill('.pc-note-card textarea', '編輯後文字');
    await page.keyboard.press('Enter'); // 存紀錄

    await page.waitForTimeout(150);
    const notes = await page.evaluate(() => window.__drawTest.api.getNotes());
    console.log('     after save:', JSON.stringify(notes));
    assert(notes.length === 1, `存檔後應仍只有 1 筆 note（實際 ${notes.length} 筆）`);
    assert(notes[0].text === '編輯後文字', '應正確更新為編輯後文字');
    assert(errors.length === 0, `不應 throw：${JSON.stringify(errors)}`);
    await page.close();
  });

  await browser.close();
  server.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
