// test/e2e/anchor-stability.spec.js — 標記錨得住嗎：穩定 id、文字、位置路徑三層
//
//   node test/e2e/anchor-stability.spec.js
//
// 這支測的是一件已經真的發生過的事：2026-08-07，jenny-ortho-crm 的
// /preview/data-questions/ 在最前面插了兩張新卡，那一頁 15 則回饋的
// `main > div:nth-of-type(N)` 全部往後推，每一則都貼到別題的答案上。
// 60 則回饋裡 45 則不再指得到當初那個元素，而**畫面上完全看不出來**：
// 框照畫、標籤照顯示，只是框在別人身上。
//
// 每一條都對應一個「不會報錯、只會靜默做錯」的行為：
//   沒存穩定 id   → 頁面一改，錨點就整批位移
//   沒存文字      → 位移之後連「她當初框的是哪一段」都無從查起（60 則裡 43 則就是這樣）
//   文字亂認      → 錨點從「解不到」變成「解到錯的」，比解不到更糟
//   舊資料看不出來→ 用舊方式定位的那些照樣顯示，看的人以為它們都是準的
import { chromium } from 'playwright';
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const PORT = 8151;
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json' };

const server = http.createServer((req, res) => {
  const rel = decodeURIComponent(req.url.split('?')[0]);
  const p = path.join(ROOT, rel);
  if (!p.startsWith(ROOT) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); return res.end('nf'); }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' });
  fs.createReadStream(p).pipe(res);
});

let pass = 0, fail = 0;
async function test(name, fn) {
  try { await fn(); console.log('  ✓', name); pass++; }
  catch (e) { console.error('  ✗', name, '\n     ', e.message); fail++; }
}
const assert = (cond, msg) => { if (!cond) throw new Error(msg || 'assertion failed'); };

const USER = { uid: 'u1', email: 'mina@e2e.local', displayName: 'Mina', photoURL: '' };

async function fresh(browser, { seed = [], user = USER, init = {} } = {}) {
  const page = await browser.newPage({ viewport: { width: 900, height: 900 } });
  page.on('pageerror', e => console.log('     [pageerror]', e.message));
  await page.goto(`http://localhost:${PORT}/test/e2e/anchor-stability.harness.html`);
  await page.waitForFunction(() => window.__emTest && window.__emTest.ready);
  await page.evaluate(({ seed, user, init }) => {
    const fb = window.__emTest.createMockFirebase({ user, comments: seed });
    window.__fb = fb;
    return window.__emTest.init(fb, init);
  }, { seed, user, init });
  await page.waitForTimeout(300);
  return page;
}

/** 進標記模式 → 點某元素 → 打字 → 送出 */
async function markOn(page, selector, text) {
  await page.click('.em-fab');
  const box = await page.locator(selector).boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.waitForTimeout(120);
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await page.waitForSelector('.em-input.show', { timeout: 3000 });
  await page.fill('.em-input textarea', text);
  await page.click('.em-input .go');
  await page.waitForTimeout(300);
}

const seedMark = (over = {}) => ({
  type: 'positional', screenId: '/questions', relX: 50, relY: 50,
  body: '這一則的內容', authorUid: 'u9', authorName: 'Jenny', resolved: false, parentId: null, ...over,
});

/** 某個框現在框住的是不是這個 selector 指的元素（用位置比，因為框是絕對定位疊上去的） */
async function boxSitsOn(page, targetSelector) {
  return page.evaluate((sel) => {
    const box = document.querySelector('.em-box');
    const target = document.querySelector(sel);
    if (!box || !target) return { ok: false, why: box ? '找不到目標元素' : '沒有畫出任何框' };
    const b = box.getBoundingClientRect();
    const t = target.getBoundingClientRect();
    return {
      ok: Math.abs(b.x - t.x) < 6 && Math.abs(b.y - t.y) < 6 && Math.abs(b.height - t.height) < 10,
      why: `框在 (${Math.round(b.x)},${Math.round(b.y)}) 高 ${Math.round(b.height)}，`
        + `目標在 (${Math.round(t.x)},${Math.round(t.y)}) 高 ${Math.round(t.height)}`,
    };
  }, targetSelector);
}

(async () => {
  await new Promise(r => server.listen(PORT, r));
  const browser = await chromium.launch();
  console.log('e2e (anchor-stability):');

  // ── 記錄端 ──────────────────────────────────────────────────────────────────

  await test('記錄時存下最近的 data-fb-id，不只存位置路徑', async () => {
    const page = await fresh(browser);
    await markOn(page, '[data-fb-id="q-brand"] p:nth-of-type(2)', '這題我回答一下');
    const doc = await page.evaluate(() => window.__fb.__docs().find(d => d.body === '這題我回答一下'));
    await page.close();
    assert(doc, '沒存進去');
    assert(doc.anchorId === 'q-brand', `應沿 DOM 往上找到 q-brand，實際 ${JSON.stringify(doc.anchorId)}`);
    assert(doc.anchorAttr === 'data-fb-id', `應記下錨點來自哪個屬性，實際 ${JSON.stringify(doc.anchorAttr)}`);
  });

  await test('記錄時一律存下框住的文字——頁面改版後只剩它能重新比對', async () => {
    const page = await fresh(browser);
    await markOn(page, '[data-fb-id="q-extraction"] p:nth-of-type(2)', 'x 是不拔牙的意思');
    const doc = await page.evaluate(() => window.__fb.__docs().find(d => d.body === 'x 是不拔牙的意思'));
    await page.close();
    assert(doc.elementText === '那個單獨的「x」是什麼意思？',
      `elementText 應為框住的那段字，實際 ${JSON.stringify(doc.elementText)}`);
  });

  await test('沒有 data-fb-id 的元素照樣存得下（anchorId 留空，不是整則失敗）', async () => {
    const page = await fresh(browser);
    await markOn(page, 'main > .card:nth-of-type(3) p:nth-of-type(2)', '這張卡沒有錨點');
    const doc = await page.evaluate(() => window.__fb.__docs().find(d => d.body === '這張卡沒有錨點'));
    await page.close();
    assert(doc, '沒存進去');
    assert(doc.anchorId === null, `找不到穩定 id 時應存 null，實際 ${JSON.stringify(doc.anchorId)}`);
    assert(typeof doc.selector === 'string' && doc.selector, '要退回位置路徑，不能兩個都沒有');
    assert(doc.elementText, '沒有 id 的時候更需要文字');
  });

  // ── 讀取端 ──────────────────────────────────────────────────────────────────

  await test('在最前面插一個新區塊之後，帶 data-fb-id 的標記仍然框住原本那張卡', async () => {
    // 位置路徑指向插入前的第 2 張卡；插入後那個位置變成第 1 張卡的內容
    const page = await fresh(browser, { seed: [seedMark({
      id: 'a', anchorId: 'q-brand', anchorAttr: 'data-fb-id',
      selector: 'main > div:nth-of-type(2) > div > p:nth-of-type(2)',
      elementText: '我已經把它對應成系統的「矯正方式」了，這樣對嗎？',
      body: '對',
    })] });
    await page.waitForSelector('.em-box');
    await page.evaluate(() => window.__emTest.insertBlockAtTop());
    await page.evaluate(() => window.dispatchEvent(new Event('resize')));
    await page.waitForTimeout(200);
    const r = await boxSitsOn(page, '[data-fb-id="q-brand"] p:nth-of-type(2)');
    const drifted = await boxSitsOn(page, 'main > div:nth-of-type(2) > div > p:nth-of-type(2)');
    await page.close();
    assert(r.ok, `框應該還在 q-brand 那題上——${r.why}`);
    assert(!drifted.ok, '框不該跟著位置路徑漂到新插進來的區塊上');
  });

  await test('沒有 data-fb-id、位置路徑也失效時，用存下來的文字重新對上', async () => {
    const page = await fresh(browser, { seed: [seedMark({
      id: 'b', anchorId: null, selector: 'main > div:nth-of-type(99)',
      elementText: '是轉診來的醫師，還是一起處理這個 case 的醫師？',
      body: '一起處理這個 case 的醫師',
    })] });
    await page.waitForTimeout(300);
    const r = await boxSitsOn(page, 'main > .card:nth-of-type(3) p:nth-of-type(2)');
    await page.close();
    assert(r.ok, `文字還在頁面上就該救得回來——${r.why}`);
  });

  await test('文字在頁面上出現多次時不亂認，退回位置路徑', async () => {
    const page = await fresh(browser, { seed: [seedMark({
      id: 'c', anchorId: null, elementText: '對嗎？',
      selector: 'main > div:nth-of-type(5) > div > p',
      body: '指的是後面那一張',
    })] });
    await page.waitForTimeout(300);
    const r = await boxSitsOn(page, 'main > div:nth-of-type(5) > div > p');
    await page.close();
    assert(r.ok, `文字有兩個候選時應退回 selector，而不是挑第一個——${r.why}`);
  });

  await test('只有位置路徑的舊資料照樣畫得出來，但標明「可能不準」', async () => {
    const page = await fresh(browser, { seed: [
      seedMark({ id: 'old', selector: 'main > div:nth-of-type(3) > div > p:nth-of-type(2)', body: '舊格式的一則' }),
      seedMark({ id: 'new', anchorId: 'q-brand', anchorAttr: 'data-fb-id',
        selector: '[data-fb-id="q-brand"] > div > p:nth-of-type(2)',
        elementText: '我已經把它對應成系統的「矯正方式」了，這樣對嗎？', body: '新格式的一則' }),
    ] });
    await page.waitForSelector('.em-box');
    await page.click('.em-tab');
    await page.waitForTimeout(300);
    const r = await page.evaluate(() => ({
      boxes: document.querySelectorAll('.em-box').length,
      staleBoxes: document.querySelectorAll('.em-box.stale').length,
      staleRows: document.querySelectorAll('.em-row.stale').length,
      staleNote: [...document.querySelectorAll('.em-row')]
        .map(row => row.textContent).filter(t => /可能不準/.test(t)).length,
    }));
    await page.close();
    assert(r.boxes === 2, `兩則都該畫得出來（不能因為改了格式就讓舊的消失），實際 ${r.boxes}`);
    assert(r.staleBoxes === 1, `只有舊格式那則該標成不確定，實際 ${r.staleBoxes}`);
    assert(r.staleRows === 1 && r.staleNote === 1, `面板也要說得出哪一則是舊方式定位的，實際 ${JSON.stringify(r)}`);
  });

  await browser.close();
  server.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
