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

  // ── transport：已經有後端的人不該被逼著開 Firebase ────────────────────────
  // 這三條顧的是「分享出去」那條路：http／supabase 模式下完全不碰 Firebase、
  // 也不需要本機 bridge，回饋直接進對方系統。

  await test('transport=http 時 POST 到指定端點，不寫 Firestore', async () => {
    const page = await openHarness(browser, base, '?transport=http');
    await pickElement(page, '#host-btn');
    await fillAndSend(page, { note: '走自己的端點', name: 'Jenny' });
    await page.waitForFunction(() => window.__requests.length === 1);

    const [req] = await page.evaluate(() => window.__requests);
    assert(req.url === 'https://example.test/feedback', `端點錯：${req.url}`);
    assert(req.headers['X-Token'] === 'abc', '自訂 header 應該原封不動帶上');
    assert(req.body.projectId === 'harness', `body 要帶 projectId：${req.body.projectId}`);
    assert(req.body.note === '走自己的端點', `留言內容錯：${req.body.note}`);
    assert(req.body.status === 'new', 'status 仍是 new');
    assert(
      (await page.evaluate(() => window.__docs())).length === 0,
      'http 模式不該寫進 Firestore',
    );
    await page.close();
  });

  await test('transport=supabase 時打 PostgREST，欄位轉成 snake_case', async () => {
    const page = await openHarness(browser, base, '?transport=supabase');
    await pickElement(page, '#host-btn');
    await fillAndSend(page, { note: '走 Supabase', name: 'Jenny' });
    await page.waitForFunction(() => window.__requests.length === 1);

    const [req] = await page.evaluate(() => window.__requests);
    assert(
      req.url === 'https://proj.supabase.co/rest/v1/user_feedback',
      `PostgREST 路徑錯（結尾斜線要吃掉）：${req.url}`,
    );
    assert(req.headers.apikey === 'anon-key-123', 'apikey header 必要');
    assert(req.headers.Authorization === 'Bearer anon-key-123', 'Authorization header 必要');
    assert(req.body.project_id === 'harness', `project_id 錯：${req.body.project_id}`);
    assert(
      req.body.element_text === '14 右上第一小臼齒',
      `element_text 錯：${req.body.element_text}`,
    );
    assert('created_at' in req.body, 'created_at 應存在（SQL 慣例 snake_case）');
    assert(!('elementText' in req.body), 'camelCase 欄位不該送出去');
    await page.close();
  });

  await test('端點回 500 時不吞掉，面板留著讓使用者重送', async () => {
    const page = await openHarness(browser, base, '?transport=http&fail=1');
    await pickElement(page, '#host-btn');
    await fillAndSend(page, { note: '端點掛了' });
    await page.waitForSelector('.uf-error');
    assert(await page.$('.uf-panel'), '面板要留著，否則使用者剛打的字就沒了');
    assert(!(await page.evaluate(() => window.__sent)), '沒送成功不該呼叫 onSent');
    await page.close();
  });

  // ── Firebase app 隔離：兩個方向都不該碰到頁面自己的預設 app ────────────────
  // 這兩條顧的是「回饋靜默寫進別人的專案」——最難自己看出來的一種壞法：
  // 頁面沒報錯、面板顯示送出成功，只是那則留言你永遠收不到。

  await test('傳了 firebaseConfig 時，不被頁面既有的 firebase app 蓋掉', async () => {
    const page = await openHarness(browser, base, '?seedapp=1&fbconfig=1');
    const apps = await page.evaluate(() => window.__apps());
    const mine = apps.find(a => a.name === 'user-feedback');
    assert(mine, `應另開具名 app，實際：${JSON.stringify(apps)}`);
    assert(
      mine.projectId === 'my-own-project',
      `具名 app 要用我傳的專案，實際：${mine.projectId}`,
    );
    // 而且真的送得出去（沿用錯的 app 時這裡照樣會過，所以上面的斷言才是重點）
    await pickElement(page, '#host-btn');
    await fillAndSend(page, { note: '寫進我自己的專案' });
    await page.waitForFunction(() => window.__docs().length === 1);
    await page.close();
  });

  await test('沒傳 firebaseConfig 時開自己的具名 app，不沿用別人的預設 app', async () => {
    // 沿用的話實際寫進「別人那個專案」，console 訊息卻宣稱寫進示範專案——
    // 診斷訊息說謊比沒有訊息更難查。
    const page = await openHarness(browser, base, '?seedapp=1');
    const apps = await page.evaluate(() => window.__apps());
    const mine = apps.find(a => a.name === 'user-feedback');
    assert(mine, `即使沒傳 config 也該開具名 app，實際：${JSON.stringify(apps)}`);
    assert(
      mine.projectId === 'prototype-comments-27106',
      `應落在示範專案（與 console 訊息一致），實際：${mine.projectId}`,
    );
    assert(
      apps.some(a => a.name === '[DEFAULT]' && a.projectId === 'someone-else'),
      '頁面原本的預設 app 應原封不動',
    );
    await page.close();
  });

  await test('同頁掛第二份、Firebase 專案不同時會警告（先掛的說了算）', async () => {
    // Firebase 不允許同名 app 換設定，所以第二份只能沿用第一份的專案——
    // 靜默沿用的話，第二份收到的回饋會全部寫到第一份那個專案去。
    const page = await openHarness(browser, base, '?fbconfig=1');
    const warnings = [];
    page.on('console', m => { if (m.type() === 'warning') warnings.push(m.text()); });
    await page.evaluate(() => window.__initAgain({ projectId: 'another-project' }));
    assert(
      warnings.some(w => w.includes('another-project') && w.includes('my-own-project')),
      `應警告兩個專案衝突，實際：${JSON.stringify(warnings)}`,
    );
    await page.close();
  });

  await browser.close();
  server.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail === 0 ? 0 : 1);
}

main();
