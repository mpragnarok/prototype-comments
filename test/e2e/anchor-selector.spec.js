// test/e2e/anchor-selector.spec.js — 留言的元素錨定與 selector-only 定位
//
//   node test/e2e/anchor-selector.spec.js
//
// 三件事，各自對應一個「不會報錯、只會靜默做錯」的行為：
//   1. 留言要記得使用者點的是哪個元件（selector + 元件內相對位置），不只是座標
//   2. collectToTasks 決定這則留言會不會被 user-feedback bridge 收成待辦
//   3. 只有 selector、沒有座標的留言（從舊 collection 搬過來的）仍要畫得出 pin
import { chromium } from 'playwright';
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const PORT = 8131;
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json' };

const server = http.createServer((req, res) => {
  const rel = decodeURIComponent(req.url.split('?')[0]);
  const p = path.join(ROOT, rel);
  if (!p.startsWith(ROOT) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); res.end('not found'); return; }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' });
  fs.createReadStream(p).pipe(res);
});

let pass = 0, fail = 0;
async function test(name, fn) {
  try { await fn(); console.log('  ✓', name); pass++; }
  catch (e) { console.error('  ✗', name, '\n     ', e.message); fail++; }
}
function assert(cond, msg) { if (!cond) throw new Error(msg || 'assertion failed'); }

const USER = { uid: 'u1', email: 'a@e2e.local', displayName: '設計師 A' };

/** 開一頁、init、登入、進留言模式 */
async function freshPage(browser, overrides = {}) {
  const page = await browser.newPage({ viewport: { width: 375, height: 700 } });
  page.on('pageerror', e => console.log('     [pageerror]', e.message));
  await page.goto(`http://localhost:${PORT}/test/e2e/harness.html`);
  await page.waitForFunction(() => window.__pcTest && window.__pcTest.ready);
  await page.evaluate(({ user, over }) => {
    const fb = window.__pcTest.createMockFirebase({ user, comments: [] });
    window.__fb = fb;
    return window.__pcTest.init(fb, over);
  }, { user: USER, over: overrides });
  await page.evaluate(() => window.__fb.__setUser({ uid: 'u1', email: 'a@e2e.local', displayName: '設計師 A' }));
  await page.waitForTimeout(120);
  await page.evaluate(() => document.getElementById('pc-comment-toggle')?.click());
  await page.waitForTimeout(80);
  return page;
}

/** 在某個元素上點一下 → 打字 → 送出 */
async function commentOn(page, selector, text) {
  const box = await page.locator(selector).boundingBox();
  await page.mouse.click(box.x + box.width * 0.75, box.y + box.height * 0.5);
  await page.waitForSelector('.pc-textarea', { timeout: 3000 });
  await page.locator('.pc-textarea').fill(text);
  await page.locator('.pc-btn-submit').click();
  await page.waitForTimeout(200);
}

(async () => {
  await new Promise(r => server.listen(PORT, r));
  const browser = await chromium.launch();

  console.log('e2e (anchor + selector 定位):');

  await test('點在按鈕上留言 → 存下 selector 與元件內相對位置', async () => {
    const page = await freshPage(browser);
    await commentOn(page, '#ship-fast', '這顆看不懂');
    const doc = await page.evaluate(() => window.__fb.__docs().find(d => d.body === '這顆看不懂'));
    await page.close();
    assert(doc, '留言沒存進去');
    assert(doc.selector === '#ship-fast', `selector 應為 #ship-fast，實際是 ${JSON.stringify(doc.selector)}`);
    assert(doc.relX > 50 && doc.relX < 100, `點在右側，relX 應在 50~100，實際 ${doc.relX}`);
    assert(doc.relY > 20 && doc.relY < 80, `點在垂直中間，relY 應在 20~80，實際 ${doc.relY}`);
    assert(doc.x != null && doc.y != null, '座標仍要存，selector 只是多一層錨定');
  });

  await test('點在空白處 → selector 指向容器，不會硬掰成某個按鈕', async () => {
    const page = await freshPage(browser);
    const box = await page.locator('#phone').boundingBox();
    await page.mouse.click(box.x + 20, box.y + 420);   // 按鈕以外的空白
    await page.waitForSelector('.pc-textarea', { timeout: 3000 });
    await page.locator('.pc-textarea').fill('整頁的意見');
    await page.locator('.pc-btn-submit').click();
    await page.waitForTimeout(200);
    const doc = await page.evaluate(() => window.__fb.__docs().find(d => d.body === '整頁的意見'));
    await page.close();
    assert(doc, '留言沒存進去');
    assert(doc.x != null, '座標仍要存');
    // 命中的是包住空白的容器——這是對的：使用者指的就是「這一區」，
    // 硬要指成最近的按鈕才是在編造使用者沒表達的意思。
    assert(doc.selector === '#screen-s1',
      `空白處應指向容器 #screen-s1，實際 ${JSON.stringify(doc.selector)}`);
  });

  await test('預設不帶 filedAt——同事的設計審查留言不會變成別人的待辦', async () => {
    const page = await freshPage(browser);
    await commentOn(page, '#ship-fast', '審查用留言');
    const doc = await page.evaluate(() => window.__fb.__docs().find(d => d.body === '審查用留言'));
    await page.close();
    assert(!('filedAt' in doc), `預設不該有 filedAt，實際 ${JSON.stringify(doc.filedAt)}`);
  });

  await test('collectToTasks:true → 帶 filedAt:null，bridge 的 IS_NULL 才查得到', async () => {
    const page = await freshPage(browser, { collectToTasks: true });
    await commentOn(page, '#ship-fast', '要進待辦的留言');
    const doc = await page.evaluate(() => window.__fb.__docs().find(d => d.body === '要進待辦的留言'));
    await page.close();
    assert('filedAt' in doc, 'Firestore 的 IS_NULL 不匹配「欄位不存在」，filedAt 必須明寫');
    assert(doc.filedAt === null, `filedAt 應為 null，實際 ${JSON.stringify(doc.filedAt)}`);
  });

  await test('只有 selector、沒有座標的留言（搬家來的）仍畫得出 pin', async () => {
    const page = await browser.newPage({ viewport: { width: 375, height: 700 } });
    await page.goto(`http://localhost:${PORT}/test/e2e/harness.html`);
    await page.waitForFunction(() => window.__pcTest && window.__pcTest.ready);
    await page.evaluate((user) => {
      const migrated = {
        type: 'positional', screenId: 's1', body: '腰帶三星這邊要有星座繪圖',
        authorUid: '', authorName: '匿名（舊留言）', resolved: false, parentId: null,
        selector: '#ship-fast', relX: 50, relY: 50,   // 沒有 x/y——那支工具從不存座標
      };
      const fb = window.__pcTest.createMockFirebase({ user, comments: [migrated] });
      window.__fb = fb;
      return window.__pcTest.init(fb);
    }, USER);
    await page.evaluate(() => document.dispatchEvent(new CustomEvent('pc:screen-change', { detail: {} })));
    await page.waitForSelector('.pc-annotation', { timeout: 4000 });

    // pin 要落在按鈕上，不是落在 (0,0) 或畫面正中央
    const { pin, btn } = await page.evaluate(() => {
      const p = document.querySelector('.pc-annotation').getBoundingClientRect();
      const b = document.getElementById('ship-fast').getBoundingClientRect();
      return { pin: { x: p.x + p.width / 2, y: p.y + p.height / 2 }, btn: { x: b.x + b.width / 2, y: b.y + b.height / 2 } };
    });
    await page.close();
    assert(Math.abs(pin.x - btn.x) < 30, `pin 的 x 應貼著按鈕（${btn.x}），實際 ${pin.x}`);
    assert(Math.abs(pin.y - btn.y) < 30, `pin 的 y 應貼著按鈕（${btn.y}），實際 ${pin.y}`);
  });

  await test('selector 指向已不存在的元素 → 不畫，而不是畫在錯的地方', async () => {
    const page = await browser.newPage({ viewport: { width: 375, height: 700 } });
    await page.goto(`http://localhost:${PORT}/test/e2e/harness.html`);
    await page.waitForFunction(() => window.__pcTest && window.__pcTest.ready);
    await page.evaluate((user) => {
      const stale = {
        type: 'positional', screenId: 's1', body: '指向已被刪掉的元件',
        authorUid: '', authorName: '舊留言', resolved: false, parentId: null,
        selector: '#this-element-is-long-gone',
      };
      const fb = window.__pcTest.createMockFirebase({ user, comments: [stale] });
      window.__fb = fb;
      return window.__pcTest.init(fb);
    }, USER);
    await page.evaluate(() => document.dispatchEvent(new CustomEvent('pc:screen-change', { detail: {} })));
    await page.waitForTimeout(600);
    const count = await page.evaluate(() => document.querySelectorAll('.pc-annotation').length);
    await page.close();
    assert(count === 0, `selector 失效時不該畫 pin，實際畫了 ${count} 顆`);
  });

  await browser.close();
  server.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
