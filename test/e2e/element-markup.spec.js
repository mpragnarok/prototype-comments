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

async function fresh(browser, { seed = [], user = USER, init = {} } = {}) {
  const page = await browser.newPage({ viewport: { width: 900, height: 760 } });
  page.on('pageerror', e => console.log('     [pageerror]', e.message));
  await page.goto(`http://localhost:${PORT}/test/e2e/element-markup.harness.html`);
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

  // 這條特意測**具名**模式（auth:'google'）：署名要是真的 Google 名字。
  // 匿名模式的對應行為另有一條測試。
  await test('具名模式按「標成已處理」→ 框變樣、記下是誰、且不碰 filedAt', async () => {
    const page = await fresh(browser, { seed: [seedMark({ id: 'a', filedAt: null })], init: { auth: 'google' } });
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
    assert(r.rows === 0, '畫不出來的也不該列在面板——點了跳不過去，列著只會讓人以為漏看了什麼');
    assert(/找不到位置/.test(r.note), `面板要說明有幾則被省略，實際「${r.note}」`);
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

  // MUI 的每個圖示都自帶 data-testid（ReplayIcon、AddIcon…），同一頁常有好幾個。
  // 一看到 data-* 就採用的話，標記會錨到「第一個同名的」——也就是別人身上，而且不會報錯。
  await test('重複的 data-testid 不採用，退回位置路徑指到正確那一個', async () => {
    const page = await fresh(browser);
    await markOn(page, '#dup-b span[data-testid="ReplayIcon"]', '這顆的圖示怪怪的');
    const doc = await page.evaluate(() => window.__fb.__docs().find(d => d.body === '這顆的圖示怪怪的'));
    const resolved = await page.evaluate((sel) => {
      const found = document.querySelectorAll(sel);
      return { count: found.length, insideB: found.length === 1 && !!found[0].closest('#dup-b') };
    }, doc.selector);
    await page.close();
    assert(doc.selector !== '[data-testid="ReplayIcon"]',
      `重複的 testid 不該被當錨點，實際存了 ${doc.selector}`);
    assert(resolved.count === 1, `selector 應唯一命中，實際命中 ${resolved.count} 個`);
    assert(resolved.insideB, 'selector 應指回 dup-b 裡那顆，而不是 dup-a');
  });

  await test('唯一的 data-testid 仍優先採用（那是最耐改版的錨點）', async () => {
    const page = await fresh(browser);
    await markOn(page, '[data-testid="unique-btn"]', '這顆按鈕文案要改');
    const doc = await page.evaluate(() => window.__fb.__docs().find(d => d.body === '這顆按鈕文案要改'));
    await page.close();
    assert(doc.selector === '[data-testid="unique-btn"]',
      `唯一的 testid 應直接當錨點，實際 ${doc.selector}`);
  });

  // 匿名是**預設**：連結常常是從 LINE 點開的，而 Google 封鎖 in-app WebView 的 OAuth
  // （signInWithRedirect 也一樣擋）。要求登入等於那些人永遠留不了言。
  await test('預設匿名：不跳登入也標得了，名字留空就是未署名', async () => {
    const page = await fresh(browser, { user: null });
    await markOn(page, '#btn-step', '沒登入也要能講');
    const doc = await page.evaluate(() => window.__fb.__docs().find(d => d.body === '沒登入也要能講'));
    await page.close();
    assert(doc, '匿名應該也存得進去');
    assert(doc.authorName === '未署名', `名字留空應為「未署名」，實際 ${JSON.stringify(doc.authorName)}`);
    assert(doc.authorUid && doc.authorUid.startsWith('anon-'), '應該是匿名 uid');
    assert(doc.selector === '#btn-step', '錨定行為與具名版一致');
  });

  await test('匿名填了名字就記住，下一則自動帶入', async () => {
    const page = await fresh(browser, { user: null });
    await page.click('.em-fab');
    let box = await page.locator('#btn-step').boundingBox();
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    await page.waitForSelector('.em-input.show');
    await page.fill('.em-name', 'Jenny');
    await page.fill('.em-input textarea', '第一則');
    await page.click('.em-input .go');
    await page.waitForTimeout(300);

    await page.click('.em-fab');
    box = await page.locator('#size-014').boundingBox();
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    await page.waitForSelector('.em-input.show');
    const prefilled = await page.inputValue('.em-name');
    await page.fill('.em-input textarea', '第二則');
    await page.click('.em-input .go');
    await page.waitForTimeout(300);

    const docs = await page.evaluate(() => window.__fb.__docs().filter(d => /第[一二]則/.test(d.body)));
    await page.close();
    assert(prefilled === 'Jenny', `第二則應自動帶入名字，實際「${prefilled}」`);
    assert(docs.length === 2 && docs.every(d => d.authorName === 'Jenny'), '兩則都該是 Jenny');
  });

  await test('匿名也能把標記標成已處理（收回饋的人常常也在 LINE 裡看）', async () => {
    const page = await fresh(browser, { user: null, seed: [seedMark({ id: 'a' })] });
    await page.click('.em-tab');
    await page.waitForSelector('.em-row .toggle');
    await page.click('.em-row .toggle');
    await page.waitForTimeout(400);
    const r = await page.evaluate(() => ({
      done: document.querySelectorAll('.em-box.done').length,
      doc: window.__fb.__docs().find(d => d.id === 'a') || window.__fb.__docs()[0],
    }));
    await page.close();
    assert(r.done === 1, '框要變成已處理樣式');
    assert(r.doc.resolved === true, 'resolved 應為 true');
  });

  await test('匿名版的顯示與具名版完全一樣（框、標籤、面板、狀態）', async () => {
    const page = await fresh(browser, {
      user: null,
      seed: [seedMark({ id: 'a' }), seedMark({ id: 'b', selector: '#size-014', resolved: true, resolvedBy: '未署名' })],
    });
    await page.click('.em-tab');
    await page.waitForTimeout(300);
    const r = await page.evaluate(() => ({
      boxes: document.querySelectorAll('.em-box').length,
      done: document.querySelectorAll('.em-box.done').length,
      tags: document.querySelectorAll('.em-tag').length,
      rows: document.querySelectorAll('.em-row').length,
      drawerOpen: document.querySelector('.em-drawer').classList.contains('open'),
    }));
    await page.close();
    assert(r.boxes === 2 && r.done === 1, `框與狀態應與具名版一致，實際 ${JSON.stringify(r)}`);
    assert(r.tags === 2 && r.rows === 2 && r.drawerOpen, `標籤與紀錄面板應照常，實際 ${JSON.stringify(r)}`);
  });

  // 留言的人事後想改字、想撤回，是很正常的事。
  await test('自己標的可以改內容', async () => {
    const page = await fresh(browser, { user: null });
    await markOn(page, '#btn-step', '原本寫的');
    await page.click('.em-tab');
    await page.waitForSelector('.em-acts .edit');
    await page.click('.em-acts .edit');
    await page.waitForSelector('.em-edit');
    await page.fill('.em-edit', '改過之後的內容');
    await page.click('.em-acts .go');
    await page.waitForTimeout(400);
    const r = await page.evaluate(() => ({
      doc: window.__fb.__docs().find(d => /改過之後/.test(d.body || '')),
      rowText: document.querySelector('.em-row .body')?.textContent,
      stillEditing: !!document.querySelector('.em-edit'),
    }));
    await page.close();
    assert(r.doc, '內容應該被改掉');
    assert(r.rowText === '改過之後的內容', `列表要跟著更新，實際「${r.rowText}」`);
    assert(!r.stillEditing, '存完要收起編輯框');
  });

  await test('編輯按取消不動任何資料', async () => {
    const page = await fresh(browser, { user: null });
    await markOn(page, '#btn-step', '不要動我');
    await page.click('.em-tab');
    await page.click('.em-acts .edit');
    await page.fill('.em-edit', '亂改的');
    await page.click('.edit-cancel');
    await page.waitForTimeout(300);
    const r = await page.evaluate(() => ({
      doc: window.__fb.__docs().find(d => d.body === '不要動我'),
      editing: !!document.querySelector('.em-edit'),
    }));
    await page.close();
    assert(r.doc, '取消不該改到資料');
    assert(!r.editing, '取消要收起編輯框');
  });

  await test('刪除要二次確認，確認後才真的消失', async () => {
    const page = await fresh(browser, { user: null });
    await markOn(page, '#btn-step', '待會要刪掉');
    await page.click('.em-tab');
    await page.waitForSelector('.em-acts .del');
    await page.click('.em-acts .del');                 // 第一下只是問
    await page.waitForTimeout(250);
    const asked = await page.evaluate(() => ({
      ask: !!document.querySelector('.em-ask'),
      stillThere: window.__fb.__docs().some(d => d.body === '待會要刪掉'),
    }));
    await page.click('.del-yes');                      // 第二下才刪
    await page.waitForTimeout(500);
    const after = await page.evaluate(() => ({
      docs: window.__fb.__docs().filter(d => d.body === '待會要刪掉').length,
      boxes: document.querySelectorAll('.em-box').length,
      rows: document.querySelectorAll('.em-row').length,
    }));
    await page.close();
    assert(asked.ask && asked.stillThere, '第一下只該問，不該刪');
    assert(after.docs === 0, '確認後資料要真的沒了');
    assert(after.boxes === 0 && after.rows === 0, '框與列表要跟著消失');
  });

  await test('刪除的確認可以取消', async () => {
    const page = await fresh(browser, { user: null });
    await markOn(page, '#btn-step', '別刪我');
    await page.click('.em-tab');
    await page.click('.em-acts .del');
    await page.waitForSelector('.em-ask');
    await page.click('.del-no');
    await page.waitForTimeout(300);
    const r = await page.evaluate(() => ({
      docs: window.__fb.__docs().filter(d => d.body === '別刪我').length,
      ask: !!document.querySelector('.em-ask'),
    }));
    await page.close();
    assert(r.docs === 1, '取消不該刪掉');
    assert(!r.ask, '取消後要回到原本的按鈕');
  });

  // 界線：別人的標記連按鈕都不該出現（rules 也會擋，前端只是不顯示做不到的事）
  await test('別人的標記不出現編輯與刪除', async () => {
    const page = await fresh(browser, { user: null, seed: [seedMark({ id: 'other', authorUid: 'someone-else' })] });
    await page.click('.em-tab');
    await page.waitForSelector('.em-row');
    const r = await page.evaluate(() => ({
      edit: document.querySelectorAll('.em-acts .edit').length,
      del: document.querySelectorAll('.em-acts .del').length,
      toggle: document.querySelectorAll('.em-acts .toggle').length,
    }));
    await page.close();
    assert(r.edit === 0 && r.del === 0, '別人的標記不該有編輯／刪除');
    assert(r.toggle === 1, '但「標成已處理」仍要能按——收回饋的人得標得動別人的留言');
  });

  // 點頁面上的標記，使用者指的就是那一則——當場給他看，不要丟進清單裡自己找。
  await test('點頁面上的標記 → 就地跳出那則留言（不是開側邊面板）', async () => {
    const page = await fresh(browser, { user: null, seed: [seedMark({ id: 'a' })] });
    await page.waitForSelector('.em-tag');
    await page.click('.em-tag');
    await page.waitForSelector('.em-pop.show', { timeout: 3000 });
    const r = await page.evaluate(() => {
      const pop = document.querySelector('.em-pop');
      const rect = pop.getBoundingClientRect();
      return {
        body: pop.querySelector('.body')?.textContent,
        who: pop.querySelector('.top span:nth-child(2)')?.textContent,
        state: pop.querySelector('.state')?.textContent,
        drawerOpen: document.querySelector('.em-drawer').classList.contains('open'),
        inViewport: rect.left >= 0 && rect.top >= 0
          && rect.right <= innerWidth + 1 && rect.bottom <= innerHeight + 1,
        hasToggle: !!pop.querySelector('.toggle'),
      };
    });
    await page.close();
    assert(r.body === '這顆按鈕看不懂', `內容不對：「${r.body}」`);
    assert(/Jenny/.test(r.who), `應顯示標記的人，實際「${r.who}」`);
    assert(/待處理/.test(r.state), `應顯示狀態，實際「${r.state}」`);
    assert(!r.drawerOpen, '不該連帶把側邊面板打開——那正是要取代的行為');
    assert(r.inViewport, '視窗不能跑出畫面外');
    assert(r.hasToggle, '在這裡就要能標成已處理');
  });

  await test('留言視窗裡就能標成已處理、也能刪自己的', async () => {
    const page = await fresh(browser, { user: null });
    await markOn(page, '#btn-step', '就地操作測試');
    await page.click('.em-tag');
    await page.waitForSelector('.em-pop.show');
    const own = await page.evaluate(() => ({
      edit: !!document.querySelector('.em-pop .edit'),
      del: !!document.querySelector('.em-pop .del'),
    }));
    await page.click('.em-pop .toggle');
    await page.waitForTimeout(400);
    const done = await page.evaluate(() => document.querySelectorAll('.em-box.done').length);
    await page.close();
    assert(own.edit && own.del, '自己的標記在視窗裡也要能編輯與刪除');
    assert(done === 1, '在視窗裡按「標成已處理」框要跟著變');
  });

  await test('點視窗以外的地方就收起來', async () => {
    const page = await fresh(browser, { user: null, seed: [seedMark({ id: 'a' })] });
    await page.waitForSelector('.em-tag');
    await page.click('.em-tag');
    await page.waitForSelector('.em-pop.show');
    await page.mouse.click(20, 400);              // 點頁面空白處
    await page.waitForTimeout(300);
    const shown = await page.evaluate(() => document.querySelector('.em-pop').classList.contains('show'));
    await page.close();
    assert(!shown, '點別處應該收起來');
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
