// test/e2e/element-markup.spec.js — 點選元素標記：輸入、顯示、已處理狀態
//
//   node test/e2e/element-markup.spec.js
//
// 每一條都對應一個「不會報錯、只會靜默做錯」的行為：
//   標記存不下正確的 selector → 換頁後永遠找不到那個元件
//   框畫在錯的位置          → 使用者以為指的是別的東西
//   已處理與待處理長得一樣  → 那個標記在說謊
import { chromium } from 'playwright';
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const PORT = 8147;
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

async function fresh(browser, { seed = [], user = USER } = {}) {
  const page = await browser.newPage({ viewport: { width: 900, height: 760 } });
  page.on('pageerror', e => console.log('     [pageerror]', e.message));
  await page.goto(`http://localhost:${PORT}/test/e2e/element-markup.harness.html`);
  await page.waitForFunction(() => window.__emTest && window.__emTest.ready);
  await page.evaluate(({ seed, user }) => {
    const fb = window.__emTest.createMockFirebase({ user, comments: seed });
    window.__fb = fb;
    return window.__emTest.init(fb);
  }, { seed, user });
  await page.waitForTimeout(300);
  return page;
}

/** 進標記模式 → 點某元素 → 打字 → 送出 */
async function markOn(page, selector, text) {
  await page.click('.em-fab');
  const box = await page.locator(selector).boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.waitForTimeout(120);
  await page.mouse.click(box.x + box.width * 0.7, box.y + box.height / 2);
  await page.waitForSelector('.em-input.show', { timeout: 3000 });
  await page.fill('.em-input textarea', text);
  await page.click('.em-input .go');
  await page.waitForTimeout(300);
}

const seedMark = (over = {}) => ({
  type: 'positional', screenId: '/wire', selector: '#btn-step', relX: 50, relY: 50,
  body: '這顆按鈕看不懂', authorUid: 'u9', authorName: 'Jenny', resolved: false, parentId: null, ...over,
});

(async () => {
  await new Promise(r => server.listen(PORT, r));
  const browser = await chromium.launch();
  console.log('e2e (element-markup):');

  await test('點選元素 → 存下 selector 與元件內相對位置', async () => {
    const page = await fresh(browser);
    await markOn(page, '#size-014', '這個尺寸想用按鈕選');
    const doc = await page.evaluate(() => window.__fb.__docs().find(d => d.body === '這個尺寸想用按鈕選'));
    await page.close();
    assert(doc, '沒存進去');
    assert(doc.selector === '#size-014', `selector 應為 #size-014，實際 ${JSON.stringify(doc.selector)}`);
    assert(doc.relX > 50 && doc.relX < 100, `點右側，relX 應 50~100，實際 ${doc.relX}`);
    assert(doc.screenId === '/wire', 'screenId 要用 page() 求值');
    assert(doc.resolved === false, '新標記不該是已處理');
  });

  await test('新標記帶 filedAt:null——bridge 的 IS_NULL 才查得到', async () => {
    const page = await fresh(browser);
    await markOn(page, '#btn-step', '要進待辦');
    const doc = await page.evaluate(() => window.__fb.__docs().find(d => d.body === '要進待辦'));
    await page.close();
    assert('filedAt' in doc, 'Firestore 的 IS_NULL 不匹配「欄位不存在」，必須明寫');
    assert(doc.filedAt === null, `filedAt 應為 null，實際 ${JSON.stringify(doc.filedAt)}`);
  });

  await test('框畫在那個元素身上，不是畫在別處', async () => {
    const page = await fresh(browser, { seed: [seedMark()] });
    await page.waitForSelector('.em-box', { timeout: 3000 });
    const { box, target } = await page.evaluate(() => {
      const b = document.querySelector('.em-box').getBoundingClientRect();
      const t = document.getElementById('btn-step').getBoundingClientRect();
      return { box: { x: b.x, y: b.y, w: b.width }, target: { x: t.x, y: t.y, w: t.width } };
    });
    await page.close();
    assert(Math.abs(box.x - target.x) < 6, `框的 x 應貼著元素（${target.x}），實際 ${box.x}`);
    assert(Math.abs(box.y - target.y) < 6, `框的 y 應貼著元素（${target.y}），實際 ${box.y}`);
    assert(Math.abs(box.w - target.w) < 10, '框的寬度應與元素相當');
  });

  await test('標籤帶編號與標記的人', async () => {
    const page = await fresh(browser, { seed: [seedMark()] });
    await page.waitForSelector('.em-tag');
    const text = await page.locator('.em-tag').first().textContent();
    await page.close();
    assert(/1/.test(text) && /Jenny/.test(text), `標籤應含編號與人名，實際「${text}」`);
  });

  await test('已處理與待處理在畫面上長得不一樣', async () => {
    const page = await fresh(browser, {
      seed: [seedMark({ id: 'a' }), seedMark({ id: 'b', selector: '#size-014', resolved: true, resolvedBy: 'Mina' })],
    });
    await page.waitForSelector('.em-box');
    const s = await page.evaluate(() => {
      const boxes = [...document.querySelectorAll('.em-box')];
      const done = boxes.find(b => b.classList.contains('done'));
      const open = boxes.find(b => !b.classList.contains('done'));
      const cs = el => getComputedStyle(el);
      return {
        total: boxes.length,
        doneStyle: done && cs(done).borderStyle,
        openStyle: open && cs(open).borderStyle,
        sameColor: done && open && cs(done).borderColor === cs(open).borderColor,
        doneTag: done && done.querySelector('.em-tag').textContent,
      };
    });
    await page.close();
    assert(s.total === 2, `應有 2 個框，實際 ${s.total}`);
    assert(s.doneStyle === 'dashed' && s.openStyle === 'solid', `已處理應為虛線、待處理實線，實際 ${s.doneStyle}/${s.openStyle}`);
    assert(!s.sameColor, '兩種狀態的框顏色不該一樣');
    assert(/✓/.test(s.doneTag), `已處理的標籤要有 ✓，實際「${s.doneTag}」`);
  });

  await test('標注紀錄面板列出全部，並標明狀態', async () => {
    const page = await fresh(browser, {
      seed: [seedMark({ id: 'a' }), seedMark({ id: 'b', selector: '#size-014', resolved: true, resolvedBy: 'Mina' })],
    });
    await page.click('.em-tab');
    await page.waitForTimeout(300);
    const r = await page.evaluate(() => ({
      open: document.querySelector('.em-drawer').classList.contains('open'),
      rows: document.querySelectorAll('.em-row').length,
      count: document.querySelector('.em-hd .n').textContent,
      states: [...document.querySelectorAll('.em-row .state')].map(s => s.textContent.trim()),
    }));
    await page.close();
    assert(r.open && r.rows === 2 && r.count === '2', `面板應開啟且有 2 列，實際 ${JSON.stringify(r)}`);
    assert(r.states.some(s => /待處理/.test(s)) && r.states.some(s => /已處理/.test(s)), `狀態文字不對：${r.states}`);
  });

  await test('按「標成已處理」→ 框當場變樣，且不碰 filedAt', async () => {
    const page = await fresh(browser, { seed: [seedMark({ id: 'a', filedAt: null })] });
    await page.click('.em-tab');
    await page.waitForSelector('.em-row .toggle');
    await page.click('.em-row .toggle');
    await page.waitForTimeout(350);
    const r = await page.evaluate(() => ({
      done: document.querySelectorAll('.em-box.done').length,
      doc: window.__fb.__docs().find(d => d.id === 'a') || window.__fb.__docs()[0],
    }));
    await page.close();
    assert(r.done === 1, '框應變成已處理樣式');
    assert(r.doc.resolved === true, 'resolved 應為 true');
    assert(r.doc.resolvedBy === 'Mina', '應記下是誰處理的');
    assert(r.doc.filedAt === null, 'filedAt 是 bridge 的記帳，人按「已處理」不該動它');
  });

  await test('selector 失效的標記不畫，並在面板明說有幾則沒畫出來', async () => {
    const page = await fresh(browser, { seed: [seedMark({ id: 'x', selector: '#long-gone' })] });
    await page.click('.em-tab');
    await page.waitForTimeout(300);
    const r = await page.evaluate(() => ({
      boxes: document.querySelectorAll('.em-box').length,
      rows: document.querySelectorAll('.em-row').length,
      note: document.querySelector('.em-note')?.textContent || '',
    }));
    await page.close();
    assert(r.boxes === 0, `失效的 selector 不該畫框，實際畫了 ${r.boxes}`);
    assert(r.rows === 1, '列表仍要列出它——資料還在，只是畫不出來');
    assert(/找不到/.test(r.note), `面板要說明有幾則沒畫出來，實際「${r.note}」`);
  });

  await test('工具自己的 UI 不會被當成可標記的元素', async () => {
    const page = await fresh(browser);
    await page.click('.em-fab');
    const tab = await page.locator('.em-tab').boundingBox();
    await page.mouse.move(tab.x + tab.width / 2, tab.y + tab.height / 2);
    await page.waitForTimeout(150);
    const hoverShown = await page.evaluate(() => getComputedStyle(document.querySelector('.em-hover')).display);
    await page.close();
    assert(hoverShown === 'none', '滑到工具列上不該出現選取框');
  });

  await test('回覆／子留言不會被畫成獨立的框', async () => {
    const page = await fresh(browser, {
      seed: [seedMark({ id: 'a' }), seedMark({ id: 'r', parentId: 'a', body: '我也覺得' })],
    });
    await page.waitForSelector('.em-box');
    const n = await page.evaluate(() => document.querySelectorAll('.em-box').length);
    await page.close();
    assert(n === 1, `有 parentId 的是討論串回覆，不該自成一個框，實際 ${n}`);
  });

  await browser.close();
  server.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
