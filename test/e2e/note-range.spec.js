// test/e2e/note-range.spec.js — e2e for 程式碼範圍註記的 pc.js 契約端（pc-note-range）。
//
//   node test/e2e/note-range.spec.js
//
// 需求：live-markup review 頁支援多行程式碼範圍註記（GitHub 同款）。選取互動歸 skills 側；
// 資料與顯示歸 pc.js。本檔驗證 pc.js 對外契約：
//   window.__api.openRangeNote({ sel, endSel, range:{path,startLine,endLine,side,code}, label })
//   1. openRangeNote → 開一張空白 note 卡（進 note 模式，卡頭顯示 path:N–M）
//   2. 真實鍵盤輸入 + Enter 存 → getNotes()[].range === 傳入的範圍
//   3. 範圍註記外框（.pc-note-mark）跨起訖行（union bbox，高度 > 單行）
//   4. 標注紀錄列 selector 顯示 `path:12–14`（非原始 CSS selector）
//   5. 送給 AI 的 payload（buildExport().notes[].range）帶 {path,startLine,endLine,side}＋程式碼行文字
//   6. 0 pageerror
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

// review 頁選完一段（第 12–14 行）後 skills 側送進來的 anchor（此處手工組，模擬那份 payload）。
const RANGE = { path: 'app.js', startLine: 12, endLine: 14, side: 'new',
  code: ['  console.log(msg);', '  return msg;', '}'] };

(async () => {
  await new Promise(r => server.listen(0, r));
  const PORT = server.address().port;
  const browser = await chromium.launch();
  console.log('note range e2e:');

  await test('openRangeNote → 卡頭 path:12–14；存後 getNotes range / 外框跨行 / 紀錄列 / payload 皆帶範圍', async () => {
    const page = await browser.newPage({ viewport: { width: 900, height: 600 } });
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(`http://localhost:${PORT}/test/e2e/note-range-harness.html`);
    await page.waitForFunction(() => window.__ready === true);

    // 1) 程式化開範圍註記泡泡（sel=起始行、endSel=結束行；模擬 gutter 拖選完成的呼叫）
    const opened = await page.evaluate((range) => {
      return window.__api.openRangeNote({ sel: '#F0L12', endSel: '#F0L14', range, label: 'app.js:12–14' });
    }, RANGE);
    assert(opened && opened.ok, 'openRangeNote 應回 {ok:true}');
    await page.waitForSelector('.pc-note-card textarea', { timeout: 5000 });
    const headText = await page.evaluate(() => document.querySelector('.pc-note-card .pc-n-target')?.textContent || '');
    assert(headText.includes('app.js:12–14'), `卡頭應顯示 app.js:12–14，實際「${headText}」`);

    // note 模式應已啟用（openRangeNote 內 setMode('note')）
    const mode = await page.evaluate(() => window.__api.getMode());
    assert(mode === 'note', `openRangeNote 應切到 note 模式，實際 ${mode}`);

    // 2) 真實鍵盤輸入 + Enter 存
    await page.click('.pc-note-card textarea');
    await page.keyboard.type('這段邏輯要抽成獨立函式');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(150);

    const notes = await page.evaluate(() => window.__api.getNotes());
    assert(notes.length === 1, `Enter 後應存 1 則 note，實際 ${notes.length}`);
    const r = notes[0].range;
    assert(r && r.path === 'app.js' && r.startLine === 12 && r.endLine === 14 && r.side === 'new',
      `note.range 應為 app.js:12–14 new，實際 ${JSON.stringify(r)}`);
    assert(Array.isArray(r.code) && r.code.length === 3 && r.code[1] === '  return msg;',
      `note.range.code 應帶三行程式碼文字，實際 ${JSON.stringify(r.code)}`);

    // 3) 範圍外框跨起訖行：union bbox 高度應明顯大於單行（≥ 兩行高）
    const markH = await page.evaluate(() => {
      const m = document.querySelector('.pc-note-mark');
      return m ? m.getBoundingClientRect().height : 0;
    });
    const lineH = await page.evaluate(() => document.getElementById('F0L12').getBoundingClientRect().height);
    assert(markH > lineH * 1.8, `範圍外框高度(${markH}) 應跨多行(單行 ${lineH})`);

    // 4) 標注紀錄列 selector 顯示 path:12–14（非原始 CSS selector）
    await page.evaluate(() => window.__api.toggleRecordPanel());
    await page.waitForTimeout(100);
    const selText = await page.evaluate(() => {
      const el = [...document.querySelectorAll('.pc-draw-rec-sel')].find(e => e.textContent.includes('app.js'));
      return el ? el.textContent : null;
    });
    assert(selText === 'app.js:12–14', `紀錄列應顯示 app.js:12–14，實際 ${JSON.stringify(selText)}`);

    // 5) payload：buildExport().notes[].range 帶座標與程式碼行
    const payload = await page.evaluate(() => window.__api.buildExport());
    assert(Array.isArray(payload.notes) && payload.notes.length === 1, 'buildExport().notes 應含這則');
    const pr = payload.notes[0].range;
    assert(pr && pr.path === 'app.js' && pr.startLine === 12 && pr.endLine === 14 && pr.side === 'new',
      `payload note.range 應帶範圍座標，實際 ${JSON.stringify(pr)}`);
    assert(Array.isArray(pr.code) && pr.code.join('\n').includes('console.log(msg)'),
      `payload note.range.code 應帶程式碼行，實際 ${JSON.stringify(pr.code)}`);

    assert(errors.length === 0, `不應 throw：${JSON.stringify(errors)}`);
    await page.close();
  });

  await browser.close();
  server.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
