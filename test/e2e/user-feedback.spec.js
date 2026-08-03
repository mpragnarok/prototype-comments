// test/e2e/user-feedback.spec.js — e2e for 終端使用者回饋（src/user-feedback.js）
//
//   node test/e2e/user-feedback.spec.js
//
// 驗證這支 script 的三個賣點，每一個壞掉都會讓回饋收不到：
//   1. 免登入就能留言（不像 pc.js 要 Google 登入）
//   2. 回饋模式開著時「點按鈕＝留言」，不會觸發宿主頁面自己的行為
//   3. 寫進 Firestore 的欄位形狀要與 firestore.rules 的白名單一致，否則線上一律被拒
import { chromium } from 'playwright';
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };
const HARNESS = '/test/e2e/user-feedback-harness.html';

const server = http.createServer((req, res) => {
  const rel = decodeURIComponent(req.url.split('?')[0]);
  const p = path.join(ROOT, rel);
  if (!p.startsWith(ROOT) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) {
    res.writeHead(404); res.end('nf'); return;
  }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' });
  fs.createReadStream(p).pipe(res);
});

let pass = 0, fail = 0;
async function test(name, fn) {
  try { await fn(); console.log('  ✓', name); pass++; }
  catch (e) { console.error('  ✗', name, '\n     ', e.message); fail++; }
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function openHarness(browser, base, query = '') {
  const page = await browser.newPage();
  await page.goto(`${base}${HARNESS}${query}`);
  await page.waitForFunction(() => document.querySelector('.uf-fab'));
  return page;
}

/** 開回饋模式 → 點某個元素 → 面板應該打開 */
async function pickElement(page, selector) {
  await page.click('.uf-fab');
  await page.click(selector);
  await page.waitForSelector('.uf-panel');
}

async function fillAndSend(page, { note, name }) {
  if (note !== undefined) await page.fill('.uf-textarea', note);
  if (name !== undefined) await page.fill('.uf-input', name);
  await page.click('.uf-btn--primary');
}

async function main() {
  await new Promise(resolve => server.listen(0, resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch();

  console.log('user-feedback e2e');

  await test('浮動按鈕預設是關的，不影響頁面原本的點擊', async () => {
    const page = await openHarness(browser, base);
    await page.click('#host-btn');
    assert(await page.evaluate(() => window.__hostClicked), '宿主按鈕應該正常觸發');
    assert(!(await page.$('.uf-panel')), '沒開回饋模式不該跳出面板');
    await page.close();
  });

  await test('開啟後點按鈕變成留言，宿主行為被攔下', async () => {
    const page = await openHarness(browser, base);
    await pickElement(page, '#host-btn');
    assert(!(await page.evaluate(() => window.__hostClicked)), '宿主按鈕不該被觸發');
    const target = await page.textContent('.uf-target');
    assert(target.includes('14 右上第一小臼齒'), `應顯示 aria-label，實際：${target}`);
    await page.close();
  });

  await test('沒有 aria-label 時用文字內容描述元素', async () => {
    const page = await openHarness(browser, base);
    await pickElement(page, '#plain-text');
    const target = await page.textContent('.uf-target');
    assert(target.includes('沒有 aria-label 的一段文字'), `實際：${target}`);
    await page.close();
  });

  await test('空留言不送出，並顯示錯誤', async () => {
    const page = await openHarness(browser, base);
    await pickElement(page, '#host-btn');
    await fillAndSend(page, { note: '' });
    await page.waitForSelector('.uf-error');
    assert((await page.evaluate(() => window.__docs())).length === 0, '不該寫進任何文件');
    await page.close();
  });

  await test('免登入即可送出，欄位形狀符合 rules 白名單', async () => {
    const page = await openHarness(browser, base);
    await pickElement(page, '#host-btn');
    await fillAndSend(page, { note: '這顆按鈕太小了', name: 'Jenny' });
    await page.waitForFunction(() => window.__docs().length === 1);

    const [doc] = await page.evaluate(() => window.__docs());
    const allowed = ['page', 'selector', 'elementText', 'note',
      'image', 'reporter', 'createdAt', 'status'];
    const extra = Object.keys(doc).filter(k => k !== 'id' && !allowed.includes(k));
    assert(extra.length === 0, `多了 rules 不接受的欄位：${extra.join(', ')}`);
    assert(doc.note === '這顆按鈕太小了', `留言內容錯：${doc.note}`);
    assert(doc.reporter === 'Jenny', `署名錯：${doc.reporter}`);
    assert(doc.status === 'new', 'status 必須是 new，bridge 靠它挑未處理的');
    assert(doc.page === '/harness/', `page 錯：${doc.page}`);
    assert(doc.elementText === '14 右上第一小臼齒', `elementText 錯：${doc.elementText}`);
    assert(doc.selector.includes('button'), `selector 應指到按鈕：${doc.selector}`);
    assert(doc.image === '', '沒附圖時 image 應為空字串（rules 要求是 string）');
    await page.close();
  });

  await test('沒署名時記成「未署名」而不是空字串', async () => {
    const page = await openHarness(browser, base);
    await pickElement(page, '#host-btn');
    await fillAndSend(page, { note: '匿名的意見' });
    await page.waitForFunction(() => window.__docs().length === 1);
    const [doc] = await page.evaluate(() => window.__docs());
    assert(doc.reporter === '未署名', `實際：${doc.reporter}`);
    await page.close();
  });

  await test('名字打一次就記住，重新整理後仍自動帶入', async () => {
    // 用 reload 而不是另開 page：browser.newPage() 每次都是新的 browser context，
    // localStorage 天生隔離，那樣測到的是 Playwright 的隔離行為、不是這個功能。
    // reload 會清掉記憶體狀態但保留 localStorage，正好是要驗的那條路。
    const page = await openHarness(browser, base);
    await pickElement(page, '#host-btn');
    await fillAndSend(page, { note: '第一次留言', name: '媽媽' });
    await page.waitForSelector('.uf-toast');

    await page.reload();
    await page.waitForFunction(() => document.querySelector('.uf-fab'));
    await pickElement(page, '#host-btn');
    const prefilled = await page.inputValue('.uf-input');
    assert(prefilled === '媽媽', `名字應自動帶入，實際：「${prefilled}」`);

    // 而且第二則不必重打名字，也要記到同一個人身上
    await fillAndSend(page, { note: '第二次留言' });
    await page.waitForFunction(() => window.__docs().length === 1);
    const [doc] = await page.evaluate(() => window.__docs());
    assert(doc.reporter === '媽媽', `第二則應沿用同一個名字，實際：${doc.reporter}`);
    await page.close();
  });

  await test('page 給函式時，記的是送出當下那一頁而不是掛載當下', async () => {
    // 投影片 deck 就是這個情境：一份 HTML、二十幾張投影片、網址不變。
    // 若掛載時就把頁面算死，每則回饋都會歸到第一張，等於沒有定位能力。
    const page = await openHarness(browser, base, '?pagefn=1');
    await page.evaluate(() => { window.__currentPage = '/harness/slide-19'; });
    await pickElement(page, '#host-btn');
    await fillAndSend(page, { note: '第 19 張這裡怪怪的', name: '媽媽' });
    await page.waitForFunction(() => window.__docs().length === 1);
    const [doc] = await page.evaluate(() => window.__docs());
    assert(
      doc.page === '/harness/slide-19',
      `應記成送出當下那一頁，實際：${doc.page}`,
    );
    await page.close();
  });

  await test('送出後面板關閉並顯示回執', async () => {
    const page = await openHarness(browser, base);
    await pickElement(page, '#host-btn');
    await fillAndSend(page, { note: '送出後應該有回執' });
    await page.waitForSelector('.uf-toast');
    assert(!(await page.$('.uf-panel')), '面板應該關閉');
    assert(await page.evaluate(() => window.__sent), 'onSent callback 應該被呼叫');
    await page.close();
  });

  await browser.close();
  server.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail === 0 ? 0 : 1);
}

main();
