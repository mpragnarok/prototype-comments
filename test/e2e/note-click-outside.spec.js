// test/e2e/note-click-outside.spec.js — e2e：note 卡片「點外面」三態行為。
//
//   node test/e2e/note-click-outside.spec.js
//
// 她的原話：「當我已經comment一個時，我如果再點畫面其他地方，原本那個如果沒有打字的話，
// 應該要自動關掉視窗；如果有打字的話，應該要自動儲存下來」＋「高亮時，應該點旁邊就要可以取消高亮」。
// 三態：
//   1. 檢視 popup（已存 note）開著 → 點外面 → 關閉 + 清掉 mark 的 is-spotlight/is-dim 高亮。
//   2. 輸入 popover 開著、textarea 空白 → 點外面 → 直接關閉，不留空紀錄（getNotes() 不新增）。
//   3. 輸入 popover 開著、textarea 有字 → 點外面 → 視同按「存紀錄」自動存檔（進 getNotes() +
//      標注紀錄面板），再關閉整個 popover。
// 另外驗證「點到另一個 note pin」時，舊卡片被妥善關閉／存檔，但該次點擊本身開新卡的行為不會被吞掉。
//
// 「點外面」統一點在 #canvas（600x400）範圍之外的 <body> 空白處：elSnapSelector 明確排除
// document.body/documentElement，pickTarget 對那裡永遠回 null，故不會被 note 模式自己的
// 「點空白開新卡」邏輯干擾，乾淨隔離只測本檔新增的 document pointerdown 監聽。
import { chromium } from 'playwright';
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const PORT = 8352;
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

const OUTSIDE = { x: 700, y: 500 }; // #canvas 為 600x400 起於 (0,0)，此點落在 body 空白處（canvas 外）

(async () => {
  await new Promise(r => server.listen(PORT, r));
  const browser = await chromium.launch();
  console.log('note 點外面（click-outside）e2e:');

  await test('狀態1｜檢視 popup 開著 → 點外面 → 關閉 + 清高亮（is-spotlight/is-dim）', async () => {
    const page = await browser.newPage({ viewport: { width: 800, height: 600 } });
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.goto(`http://localhost:${PORT}/test/e2e/draw-layer-harness.html`);
    await page.waitForFunction(() => window.__drawTest && window.__drawTest.ready);
    await page.evaluate(() => { window.__drawTest.api = window.__drawTest.init({ mode: 'off' }); });

    await page.evaluate(() => {
      const api = window.__drawTest.api;
      api.setMode('note');
      api.addNote('已存的 note 內容', { sel: '#price-card', relX: 0.5, relY: 0.5, label: 'div' });
    });
    const badge = await page.evaluate(() => {
      const t = document.querySelector('.pc-note-mark .pc-note-tab');
      const r = t.getBoundingClientRect();
      return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) };
    });
    await page.mouse.click(badge.x, badge.y); // 開檢視卡
    await page.waitForSelector('.pc-note-card', { timeout: 2000 });
    const opened = await page.evaluate(() => {
      const card = document.querySelector('.pc-note-card');
      const mark = document.querySelector('.pc-note-mark');
      return { hasCard: !!card, text: card && card.textContent, spotlight: mark && mark.classList.contains('is-spotlight') };
    });
    assert(opened.hasCard && /已存的 note 內容/.test(opened.text), '應開啟檢視卡並顯示內容');
    assert(opened.spotlight, '開卡時該 note 的 mark 應加上 is-spotlight');

    await page.mouse.click(OUTSIDE.x, OUTSIDE.y); // 點外面
    await page.waitForTimeout(80);
    const after = await page.evaluate(() => {
      const mark = document.querySelector('.pc-note-mark');
      return {
        cardGone: !document.querySelector('.pc-note-card'),
        spotlight: mark && mark.classList.contains('is-spotlight'),
        dim: mark && mark.classList.contains('is-dim'),
        count: window.__drawTest.api.getNotes().length,
        text: window.__drawTest.api.getNotes()[0].text,
      };
    });
    console.log('     狀態1 after-outside-click:', JSON.stringify(after));
    assert(after.cardGone, '點外面應關閉檢視卡');
    assert(!after.spotlight && !after.dim, '點外面應清掉高亮（is-spotlight/is-dim）——她的原話「點旁邊就要可以取消高亮」');
    assert(after.count === 1 && after.text === '已存的 note 內容', '純檢視、點外面不應動到既有內容');
    assert(errors.length === 0, `不應 throw：${JSON.stringify(errors)}`);
    await page.close();
  });

  await test('狀態2｜輸入 popover 開著、textarea 空白 → 點外面 → 直接關閉，不留空紀錄', async () => {
    const page = await browser.newPage({ viewport: { width: 800, height: 600 } });
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.goto(`http://localhost:${PORT}/test/e2e/draw-layer-harness.html`);
    await page.waitForFunction(() => window.__drawTest && window.__drawTest.ready);
    await page.evaluate(() => { window.__drawTest.api = window.__drawTest.init({ mode: 'off' }); });
    await page.evaluate(() => window.__drawTest.api.setMode('note'));

    // 點畫布空白處（避開 price-card / sidebar / submit-btn）→ 開空白輸入卡
    await page.mouse.click(300, 160);
    await page.waitForSelector('.pc-note-card textarea', { timeout: 2000 });
    const before = await page.evaluate(() => document.querySelector('.pc-note-card textarea').value);
    assert(before === '', 'textarea 初始應為空');

    await page.mouse.click(OUTSIDE.x, OUTSIDE.y); // 點外面，未打字
    await page.waitForTimeout(80);
    const after = await page.evaluate(() => ({
      cardGone: !document.querySelector('.pc-note-card'),
      count: window.__drawTest.api.getNotes().length,
      pins: document.querySelectorAll('.pc-note-mark').length,
    }));
    console.log('     狀態2 after-outside-click:', JSON.stringify(after));
    assert(after.cardGone, '點外面應關閉輸入 popover');
    assert(after.count === 0 && after.pins === 0, '空白 textarea 點外面不應留下任何紀錄或 pin');
    assert(errors.length === 0, `不應 throw：${JSON.stringify(errors)}`);
    await page.close();
  });

  await test('狀態3｜輸入 popover 有打字 → 點外面 → 自動存檔（等同存紀錄）再關閉，且進標注紀錄面板', async () => {
    const page = await browser.newPage({ viewport: { width: 800, height: 600 } });
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.goto(`http://localhost:${PORT}/test/e2e/draw-layer-harness.html`);
    await page.waitForFunction(() => window.__drawTest && window.__drawTest.ready);
    await page.evaluate(() => { window.__drawTest.api = window.__drawTest.init({ mode: 'off' }); });
    await page.evaluate(() => window.__drawTest.api.setMode('note'));

    const NOTE_TEXT = '點外面自動存檔測試';
    await page.mouse.click(300, 160); // 開空白輸入卡
    await page.waitForSelector('.pc-note-card textarea', { timeout: 2000 });
    await page.fill('.pc-note-card textarea', NOTE_TEXT);

    await page.mouse.click(OUTSIDE.x, OUTSIDE.y); // 點外面，有打字 → 應自動存檔
    await page.waitForTimeout(80);
    const afterClose = await page.evaluate(() => ({
      cardGone: !document.querySelector('.pc-note-card'),
      count: window.__drawTest.api.getNotes().length,
      text: (window.__drawTest.api.getNotes()[0] || {}).text,
      pins: document.querySelectorAll('.pc-note-mark').length,
    }));
    console.log('     狀態3 after-outside-click:', JSON.stringify(afterClose));
    assert(afterClose.cardGone, '點外面存檔後 popover 應關閉');
    assert(afterClose.count === 1 && afterClose.text === NOTE_TEXT, '有打字時點外面應等同「存紀錄」寫入 getNotes()');
    assert(afterClose.pins === 1, '存檔後畫面應留下對應的 note pin');

    // 斷言真的進了標注紀錄面板（不是只存在記憶體，卡片消失資料就等於沒進紀錄）
    await page.evaluate(() => window.__drawTest.api.toggleRecordPanel());
    await page.waitForTimeout(80);
    const listed = await page.evaluate((t) => {
      const list = document.querySelector('.pc-draw-rec-list');
      return !!list && list.textContent.includes(t);
    }, NOTE_TEXT);
    assert(listed, '自動存檔的 note 應出現在標注紀錄面板列表中');
    assert(errors.length === 0, `不應 throw：${JSON.stringify(errors)}`);
    await page.close();
  });

  await test('編輯既有 note 時點外面：有改字 → 自動存檔覆蓋舊文字並直接關閉（不像「取消」鈕會重開檢視卡）', async () => {
    const page = await browser.newPage({ viewport: { width: 800, height: 600 } });
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.goto(`http://localhost:${PORT}/test/e2e/draw-layer-harness.html`);
    await page.waitForFunction(() => window.__drawTest && window.__drawTest.ready);
    await page.evaluate(() => { window.__drawTest.api = window.__drawTest.init({ mode: 'off' }); });
    // 刻意不切 note 模式：pin badge 本就「永遠可點」（與 mode 無關），且 note 模式下點卡內按鈕
    // 另有一個與本功能無關的既存 bug（編輯鈕的 body.innerHTML='' 會在同一次 click 派送過程中
    // 把自己從 DOM 摘掉，導致 noteLayer 的空白點擊 handler 誤判成點空白、多生一則幽靈 note）。
    // 維持預設 off 模式可乾淨隔離，只測「點外面」本身的行為，不誤觸那個既存問題。
    await page.evaluate(() => {
      const api = window.__drawTest.api;
      api.addNote('原始文字', { sel: '#price-card', relX: 0.5, relY: 0.5, label: 'div' });
    });
    const badge = await page.evaluate(() => {
      const t = document.querySelector('.pc-note-mark .pc-note-tab');
      const r = t.getBoundingClientRect();
      return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) };
    });
    await page.mouse.click(badge.x, badge.y); // 開檢視卡
    await page.waitForSelector('.pc-note-card', { timeout: 2000 });
    const editClicked = await page.evaluate(() => {
      const btn = [...document.querySelectorAll('.pc-note-card button')].find(b => b.textContent.includes('編輯'));
      if (!btn) return false; btn.click(); return true;
    });
    assert(editClicked, '應找到並點開「編輯」鈕');
    await page.waitForSelector('.pc-note-card textarea', { timeout: 2000 });
    await page.fill('.pc-note-card textarea', '編輯後文字');

    await page.mouse.click(OUTSIDE.x, OUTSIDE.y); // 點外面
    await page.waitForTimeout(80);
    const after = await page.evaluate(() => ({
      cardGone: !document.querySelector('.pc-note-card'),
      count: window.__drawTest.api.getNotes().length,
      text: (window.__drawTest.api.getNotes()[0] || {}).text,
    }));
    console.log('     編輯態 after-outside-click:', JSON.stringify(after));
    assert(after.cardGone, '編輯中點外面存檔後應直接關閉整個 popover（不重開檢視卡）');
    assert(after.count === 1 && after.text === '編輯後文字', '應覆蓋成編輯後的文字（自動存檔）');
    assert(errors.length === 0, `不應 throw：${JSON.stringify(errors)}`);
    await page.close();
  });

  await test('點到另一個 note pin：舊卡片被關閉（若有字則存檔），但這次點擊開新卡的行為不會被吞掉', async () => {
    const page = await browser.newPage({ viewport: { width: 800, height: 600 } });
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.goto(`http://localhost:${PORT}/test/e2e/draw-layer-harness.html`);
    await page.waitForFunction(() => window.__drawTest && window.__drawTest.ready);
    await page.evaluate(() => { window.__drawTest.api = window.__drawTest.init({ mode: 'off' }); });
    await page.evaluate(() => {
      const api = window.__drawTest.api;
      api.setMode('note');
      api.addNote('A註記', { sel: '#price-card', relX: 0.5, relY: 0.5, label: 'div' });
      api.addNote('B註記', { sel: '[data-testid="sidebar"]', relX: 0.5, relY: 0.5, label: 'div' });
    });
    const badges = await page.evaluate(() => {
      const marks = [...document.querySelectorAll('.pc-note-mark')];
      return marks.map(m => {
        const t = m.querySelector('.pc-note-tab');
        const r = t.getBoundingClientRect();
        return { id: m.dataset.noteId, x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) };
      });
    });
    const findBadgeFor = async (text) => {
      // 依 note id 找出對應文字的 badge：先用 title（＝note.text）比對最穩定
      const idx = await page.evaluate((t) => {
        const marks = [...document.querySelectorAll('.pc-note-mark')];
        return marks.findIndex(m => (m.querySelector('.pc-note-tab') || {}).title === t);
      }, text);
      return badges[idx];
    };
    const badgeA = await findBadgeFor('A註記');
    const badgeB = await findBadgeFor('B註記');
    assert(badgeA && badgeB, '應各自找到 A/B 兩個 pin badge');

    await page.mouse.click(badgeA.x, badgeA.y); // 開 A 的檢視卡
    await page.waitForSelector('.pc-note-card', { timeout: 2000 });
    const openedA = await page.evaluate(() => document.querySelector('.pc-note-card').textContent);
    assert(/A註記/.test(openedA), 'A 應先開卡');

    await page.mouse.click(badgeB.x, badgeB.y); // 直接點另一個 pin（B）
    await page.waitForSelector('.pc-note-card', { timeout: 2000 });
    await page.waitForTimeout(80);
    const finalState = await page.evaluate(() => {
      const cards = document.querySelectorAll('.pc-note-card');
      return { cardCount: cards.length, text: cards[0] && cards[0].textContent };
    });
    console.log('     點另一 pin 最終狀態:', JSON.stringify(finalState));
    assert(finalState.cardCount === 1, '同一時間只應有 1 張卡（單一對話框）');
    assert(/B註記/.test(finalState.text), '點 B 的 pin 應正常開出 B 的卡，行為不應被舊卡的「點外面關閉」機制吞掉');
    assert(errors.length === 0, `不應 throw：${JSON.stringify(errors)}`);
    await page.close();
  });

  await browser.close();
  server.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
