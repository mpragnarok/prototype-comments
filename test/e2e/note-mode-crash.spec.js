// test/e2e/note-mode-crash.spec.js — regression e2e for note-mode click/hover crash.
//
//   node test/e2e/note-mode-crash.spec.js
//
// 線上事故：CDN note-UX 新版下，live-markup consumer 的 /api/draw store 與 decide.js 決策按鈕
// 共用同一 collection → store 裡有 tool:'choice'（無 geom、非 kind:'note'）的 doc。onRemoteDrawings
// 把它塞進 state.objects；note 模式的 pickTarget 對每顆 object 呼叫 geomBBox → 讀 g.x（g=undefined）
// → TypeError: Cannot read properties of undefined (reading 'x')，note 卡不開。
// 本檔重現該情境（seedChoice）並斷言：note 模式 hover/click 不 crash、卡照常開。
import { chromium } from 'playwright';
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const PORT = 8337;
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

async function bootPage(browser, bootFn, arg) {
  const page = await browser.newPage({ viewport: { width: 800, height: 600 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(`http://localhost:${PORT}/test/e2e/note-mode-harness.html`);
  await page.waitForFunction(() => window.__noteCrash && window.__noteCrash.ready);
  await page.evaluate(({ fn, a }) => window.__noteCrash[fn](a), { fn: bootFn, a: arg });
  return { page, errors };
}

// note 模式下 hover + click 目標 <p>，回傳 { errors, cardOpened }。
async function noteHoverClick(page, errors) {
  await page.evaluate(() => window.__api.setMode('note'));
  await page.waitForTimeout(60); // 讓 store 的 onSnapshot 把 seed 的 doc 併入
  const box = await page.evaluate(() => { const r = document.getElementById('para').getBoundingClientRect(); return { x: r.left + 40, y: r.top + r.height / 2 }; });
  await page.mouse.move(box.x, box.y);
  await page.mouse.move(box.x + 3, box.y + 2); // 觸發 pointermove → onNoteHover → pickTarget
  await page.waitForTimeout(60);
  await page.mouse.click(box.x, box.y);
  await page.waitForTimeout(120);
  const cardOpened = await page.evaluate(() => !!document.querySelector('.pc-note-card'));
  return { errors, cardOpened };
}

(async () => {
  await new Promise(r => server.listen(PORT, r));
  const browser = await chromium.launch();

  console.log('note-mode crash e2e:');

  await test('live-markup boot + store 有 choice doc → note 模式 hover/click 不 crash、卡照常開', async () => {
    const { page, errors } = await bootPage(browser, 'initLiveMarkup', { seedChoice: true, mode: 'off' });
    const objs = await page.evaluate(() => window.__noteCrash.getObjects());
    console.log('     objects after choice seed:', JSON.stringify(objs));
    const r = await noteHoverClick(page, errors);
    console.log('     result:', JSON.stringify({ errors: r.errors, cardOpened: r.cardOpened }));
    assert(r.errors.length === 0, `note 模式操作不應 throw，實際 pageerror: ${JSON.stringify(r.errors)}`);
    assert(r.cardOpened, 'hover+click <p> 應開啟 note 卡');
    await page.close();
  });

  await test('native boot（無 persist）→ note 模式 hover/click 不 crash、卡照常開', async () => {
    const { page, errors } = await bootPage(browser, 'initNative', {});
    const r = await noteHoverClick(page, errors);
    assert(r.errors.length === 0, `note 模式操作不應 throw，實際 pageerror: ${JSON.stringify(r.errors)}`);
    assert(r.cardOpened, 'hover+click <p> 應開啟 note 卡');
    await page.close();
  });

  await browser.close();
  server.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
