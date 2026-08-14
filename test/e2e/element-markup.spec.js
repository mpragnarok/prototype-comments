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

async function fresh(browser, { seed = [], user = USER, init = {}, pageFromLocation = false } = {}) {
  const page = await browser.newPage({ viewport: { width: 900, height: 760 } });
  page.on('pageerror', e => console.log('     [pageerror]', e.message));
  await page.goto(`http://localhost:${PORT}/test/e2e/element-markup.harness.html`);
  await page.waitForFunction(() => window.__emTest && window.__emTest.ready);
  if (pageFromLocation) await page.evaluate(() => { window.__emPageFromLocation = true; });
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

  // 一捲動就關看似省事，但手機的慣性捲動會在點下去的當下就把它關掉——
  // 線上實測就是這樣：標記在畫面外，點擊前的自動捲動先把視窗關了。
  await test('捲動不會關掉留言視窗，它跟著那個框走', async () => {
    const page = await fresh(browser, { user: null, seed: [seedMark({ id: 'a' })] });
    await page.waitForSelector('.em-tag');
    await page.click('.em-tag');
    await page.waitForSelector('.em-pop.show');
    const before = await page.evaluate(() => {
      const pop = document.querySelector('.em-pop').getBoundingClientRect();
      const box = document.querySelector('.em-box').getBoundingClientRect();
      return { gapY: Math.round(pop.top - box.top), gapX: Math.round(pop.left - box.left) };
    });
    await page.evaluate(() => window.scrollBy(0, 120));
    await page.waitForTimeout(400);
    const after = await page.evaluate(() => {
      const el = document.querySelector('.em-pop');
      if (!el.classList.contains('show')) return { closed: true };
      const pop = el.getBoundingClientRect();
      const box = document.querySelector('.em-box').getBoundingClientRect();
      return { closed: false, gapY: Math.round(pop.top - box.top), gapX: Math.round(pop.left - box.left) };
    });
    await page.close();
    assert(!after.closed, '捲動不該關掉視窗');
    assert(Math.abs(after.gapY - before.gapY) <= 2 && Math.abs(after.gapX - before.gapX) <= 2,
      `視窗要跟著框走，捲動前後的相對位置應不變（before ${JSON.stringify(before)} after ${JSON.stringify(after)}）`);
  });

  await test('視窗顯示中的那則被刪掉 → 視窗收起來', async () => {
    const page = await fresh(browser, { user: null });
    await markOn(page, '#btn-step', '刪掉之後視窗要消失');
    await page.click('.em-tag');
    await page.waitForSelector('.em-pop.show');
    await page.click('.em-pop .del');
    await page.click('.del-yes');
    await page.waitForTimeout(500);
    const shown = await page.evaluate(() => document.querySelector('.em-pop').classList.contains('show'));
    await page.close();
    assert(!shown, '那則都刪了，視窗不該還停在畫面上說著不存在的東西');
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

  // 先前具名模式的按鈕跟匿名版一樣寫「給回饋」，「按下去會跳登入」只寫在 title 裡——
  // 手機上看不到 tooltip，使用者的感受就是「沒有看到 Google 登入」。
  await test('具名模式未登入時，按鈕自己說得出來要登入', async () => {
    const page = await fresh(browser, { user: null, init: { auth: 'google' } });
    const before = await page.evaluate(() => document.querySelector('.em-fab').textContent);
    assert(/登入/.test(before), `未登入時按鈕要寫明要登入，實際「${before}」`);

    await page.evaluate(() => window.__fb.__setUser({ uid: 'u1', email: 'm@t.local', displayName: 'Mina' }));
    await page.waitForTimeout(300);
    const after = await page.evaluate(() => ({
      text: document.querySelector('.em-fab').textContent,
      title: document.querySelector('.em-fab').title,
      toast: document.querySelector('.em-toast')?.textContent,
    }));
    await page.close();
    assert(!/登入/.test(after.text), `登入後就不該再寫要登入，實際「${after.text}」`);
    assert(/Mina/.test(after.title), `登入後要看得出是誰，實際「${after.title}」`);
    assert(after.toast && /Mina/.test(after.toast), `登入成功要說一聲，實際「${after.toast}」`);
  });

  await test('匿名模式的按鈕不提登入（因為根本不需要）', async () => {
    const page = await fresh(browser, { user: null });
    await page.waitForTimeout(300);
    const r = await page.evaluate(() => ({
      text: document.querySelector('.em-fab').textContent,
      title: document.querySelector('.em-fab').title,
    }));
    await page.close();
    assert(!/登入/.test(r.text), `匿名模式不該提登入，實際「${r.text}」`);
    assert(/不需要登入/.test(r.title), `提示要說明不必登入，實際「${r.title}」`);
  });

  // 使用者回報「有個標記一直讓螢幕變小」：抽屜用 transform 推到畫面外，
  // 但仍佔著水平捲動空間，於是手機把整頁縮小以容納那 310px。
  // 這條在手機尺寸下驗「工具不准把頁面撐寬」。
  await test('手機尺寸下，標記工具不會把頁面撐寬', async () => {
    const page = await browser.newPage({ viewport: { width: 390, height: 780 }, isMobile: true, hasTouch: true });
    await page.goto(`http://localhost:${PORT}/test/e2e/element-markup.harness.html`);
    await page.waitForFunction(() => window.__emTest && window.__emTest.ready);
    const baseline = await page.evaluate(() => document.documentElement.scrollWidth);
    await page.evaluate(() => {
      const fb = window.__emTest.createMockFirebase({ user: null, comments: [] });
      window.__fb = fb;
      return window.__emTest.init(fb);
    });
    await page.waitForTimeout(500);
    const closed = await page.evaluate(() => document.documentElement.scrollWidth);

    await page.click('.em-tab');                       // 打開抽屜
    await page.waitForTimeout(400);
    const opened = await page.evaluate(() => document.documentElement.scrollWidth);
    await page.close();

    assert(closed <= baseline + 1,
      `掛上工具後頁面就被撐寬了：掛之前 ${baseline}px → 掛之後 ${closed}px`);
    assert(opened <= baseline + 1,
      `抽屜打開時把頁面撐寬了：${baseline}px → ${opened}px（抽屜寬 310px，正好是被撐出來的量）`);
  });

  await test('留言視窗不會把頁面撐寬（手機尺寸）', async () => {
    const page = await browser.newPage({ viewport: { width: 390, height: 780 }, isMobile: true, hasTouch: true });
    await page.goto(`http://localhost:${PORT}/test/e2e/element-markup.harness.html`);
    await page.waitForFunction(() => window.__emTest && window.__emTest.ready);
    const baseline = await page.evaluate(() => document.documentElement.scrollWidth);
    await page.evaluate((seed) => {
      const fb = window.__emTest.createMockFirebase({ user: null, comments: [seed] });
      window.__fb = fb;
      return window.__emTest.init(fb);
    }, seedMark({ id: 'a' }));
    await page.waitForSelector('.em-tag', { timeout: 4000 });
    await page.click('.em-tag');
    await page.waitForSelector('.em-pop.show');
    const w = await page.evaluate(() => document.documentElement.scrollWidth);
    const popRight = await page.evaluate(() =>
      Math.round(document.querySelector('.em-pop').getBoundingClientRect().right));
    await page.close();
    assert(w <= baseline + 1, `留言視窗把頁面撐寬了：${baseline}px → ${w}px`);
    assert(popRight <= 390 + 1, `留言視窗跑出畫面右邊：right=${popRight}`);
  });

  // 使用者回報「登入版完全沒動靜」：手機瀏覽器把 signInWithPopup 當彈出廣告擋掉，
  // 而且擋掉時未必丟得出錯誤，所以畫面上什麼都不會發生。
  await test('手機走整頁跳轉登入，不用會被擋掉的彈窗', async () => {
    const page = await browser.newPage({
      viewport: { width: 390, height: 780 }, isMobile: true, hasTouch: true,
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1',
    });
    await page.goto(`http://localhost:${PORT}/test/e2e/element-markup.harness.html`);
    await page.waitForFunction(() => window.__emTest && window.__emTest.ready);
    await page.evaluate(() => {
      const fb = window.__emTest.createMockFirebase({ user: null, comments: [] });
      window.__fb = fb;
      // authDomain 設成同源：跨網域的情況另有一條測試（那種組合本來就不該跳轉）
      return window.__emTest.init(fb, { auth: 'google', firebaseConfig: { authDomain: location.hostname, projectId: 'x' } });
    });
    await page.waitForTimeout(300);
    await page.click('.em-fab');
    await page.waitForTimeout(500);
    const calls = await page.evaluate(() => window.__fb.__authCalls());
    await page.close();
    assert(calls.redirect === 1, `手機應走 redirect，實際 redirect=${calls.redirect} popup=${calls.popup}`);
    assert(calls.popup === 0, '手機不該用 popup——會被擋掉而且沒有錯誤訊息');
  });

  await test('桌機用彈窗；彈窗被擋時退回整頁跳轉', async () => {
    const page = await fresh(browser, { user: null, init: { auth: 'google' } });
    await page.click('.em-fab');
    await page.waitForTimeout(400);
    const normal = await page.evaluate(() => window.__fb.__authCalls());
    assert(normal.popup === 1 && normal.redirect === 0, `桌機該用彈窗，實際 ${JSON.stringify(normal)}`);

    // 讓彈窗失敗，看有沒有退回 redirect
    const page2 = await fresh(browser, { user: null, init: { auth: 'google' } });
    await page2.evaluate(() => {
      const fb = window.__fb;
      fb.signInWithPopup = async () => { const e = new Error('blocked'); e.code = 'auth/popup-blocked'; throw e; };
    });
    await page2.click('.em-fab');
    await page2.waitForTimeout(500);
    const fallback = await page2.evaluate(() => window.__fb.__authCalls());
    await page.close(); await page2.close();
    assert(fallback.redirect === 1, `彈窗被擋時要退回整頁跳轉，實際 ${JSON.stringify(fallback)}`);
  });

  // 使用者回報「Google 登入後沒辦法出現回饋按鈕」：按下去時按鈕被設成 disabled，
  // 若跳轉沒真的發生（被擋、失敗、環境不支援），那行「解除 disabled」永遠不會執行，
  // 按鈕就卡在灰色不能按——看起來像按鈕壞了，畫面上卻沒有任何原因。
  await test('登入沒成功時，按鈕不會卡在不能按的狀態', async () => {
    const page = await fresh(browser, { user: null, init: { auth: 'google' } });
    await page.evaluate(() => {
      window.__fb.signInWithPopup = async () => { const e = new Error('boom'); e.code = 'auth/internal-error'; throw e; };
      window.__fb.signInWithRedirect = async () => { throw new Error('redirect 也失敗'); };
    });
    await page.click('.em-fab');
    await page.waitForTimeout(600);
    const r = await page.evaluate(() => ({
      disabled: document.querySelector('.em-fab').disabled,
      marking: document.body.classList.contains('em-marking'),
    }));
    await page.close();
    assert(!r.disabled, '登入失敗後按鈕必須能再按——卡在 disabled 等於按鈕壞了');
    assert(!r.marking, '沒登入成功就不該進標記模式');
  });

  await test('掛不起來時畫面上要說一句，而不是靜靜消失', async () => {
    const page = await browser.newPage({ viewport: { width: 390, height: 780 } });
    await page.goto(`http://localhost:${PORT}/test/e2e/element-markup.harness.html`);
    await page.waitForFunction(() => window.__emTest && window.__emTest.ready);
    await page.evaluate(() => window.__emTest.init(null, { projectId: '' }));  // 缺 projectId → 一定失敗
    await page.waitForTimeout(400);
    const r = await page.evaluate(() => ({
      fail: !!document.querySelector('.em-fail'),
      text: document.querySelector('.em-fail')?.textContent || '',
    }));
    await page.close();
    assert(r.fail, '初始化失敗時畫面上要看得到，不能只印 console');
    assert(/projectId/.test(r.text), `訊息要說得出原因，實際「${r.text}」`);
  });

  // Firebase 官方已知限制：authDomain 與 app 不同源時，擋跨站儲存的瀏覽器
  // （Safari 16.1+／Chrome 115+）會把使用者導回但沒登入，而且沒有任何錯誤。
  // 症狀是「登入兩次還是沒登入」。明知會失敗就不要讓人白跳一趟。
  await test('手機＋跨網域 authDomain：不跳轉，直接說明並指回匿名模式', async () => {
    const page = await browser.newPage({
      viewport: { width: 390, height: 780 }, isMobile: true, hasTouch: true,
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1',
    });
    await page.goto(`http://localhost:${PORT}/test/e2e/element-markup.harness.html`);
    await page.waitForFunction(() => window.__emTest && window.__emTest.ready);
    await page.evaluate(() => {
      const fb = window.__emTest.createMockFirebase({ user: null, comments: [] });
      window.__fb = fb;
      return window.__emTest.init(fb, {
        auth: 'google',
        firebaseConfig: { authDomain: 'someone-else.firebaseapp.com', projectId: 'x' },
      });
    });
    await page.waitForTimeout(300);
    await page.click('.em-fab');
    await page.waitForTimeout(600);
    const r = await page.evaluate(() => ({
      calls: window.__fb.__authCalls(),
      toast: document.querySelector('.em-toast')?.textContent || '',
      disabled: document.querySelector('.em-fab').disabled,
    }));
    await page.close();
    assert(r.calls.redirect === 0, `明知會失敗就不該跳轉，實際 redirect=${r.calls.redirect}`);
    assert(/登不進去|不需登入/.test(r.toast), `要說明為什麼，實際「${r.toast}」`);
    assert(!r.disabled, '按鈕不能卡在不可按');
  });

  await test('同源 authDomain 時照常跳轉登入', async () => {
    const page = await browser.newPage({
      viewport: { width: 390, height: 780 }, isMobile: true, hasTouch: true,
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1',
    });
    await page.goto(`http://localhost:${PORT}/test/e2e/element-markup.harness.html`);
    await page.waitForFunction(() => window.__emTest && window.__emTest.ready);
    await page.evaluate(() => {
      const fb = window.__emTest.createMockFirebase({ user: null, comments: [] });
      window.__fb = fb;
      return window.__emTest.init(fb, {
        auth: 'google',
        firebaseConfig: { authDomain: location.hostname, projectId: 'x' },
      });
    });
    await page.waitForTimeout(300);
    await page.click('.em-fab');
    await page.waitForTimeout(600);
    const calls = await page.evaluate(() => window.__fb.__authCalls());
    await page.close();
    assert(calls.redirect === 1, `同源時該正常跳轉，實際 ${JSON.stringify(calls)}`);
  });

  // CDN 是公開的：改檔名不能弄壞已經照舊網址掛上去的頁面。
  await test('舊路徑 element-markup.js 仍然可用（相容轉接沒斷）', async () => {
    const page = await browser.newPage({ viewport: { width: 900, height: 760 } });
    await page.goto(`http://localhost:${PORT}/test/e2e/element-markup.harness.html`);
    const r = await page.evaluate(async () => {
      const oldPath = await import('/src/element-markup.js');
      const newPath = await import('/src/user-feedback-markup.js');
      return {
        oldHasInit: typeof oldPath.initElementMarkup === 'function',
        sameFunction: oldPath.initElementMarkup === newPath.initElementMarkup,
      };
    });
    await page.close();
    assert(r.oldHasInit, '舊路徑仍要 export 得出 initElementMarkup');
    assert(r.sameFunction, '舊路徑該轉接到同一個實作，不是複製一份');
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

  // ── 版面變動時的重新定位 ─────────────────────────────────────────────────────
  // 標記框是絕對座標，元素一移動它就指著別的東西，而且不會報錯。以下四條各守一個缺口。

  await test('頁面抖動（狂改 class/style）一次都不重畫——重繪風暴守門', async () => {
    const page = await fresh(browser, { seed: [seedMark()] });
    await page.waitForSelector('.em-box', { timeout: 3000 });
    const renders = await page.evaluate(async () => {
      // 數「重畫了幾次」：render() 會先移除所有 .em-box 再重建，數移除次數就是重畫次數。
      let count = 0;
      const mo = new MutationObserver((recs) => {
        for (const r of recs) for (const n of r.removedNodes) {
          if (n.nodeType === 1 && n.classList && n.classList.contains('em-box')) count++;
        }
      });
      mo.observe(document.body, { childList: true });
      const target = document.getElementById('title');
      for (let i = 0; i < 120; i++) {
        target.classList.toggle('jitter');            // 不存在的 class：不改版面，只製造 mutation
        target.style.color = i % 2 ? 'red' : 'blue';  // 顏色不影響任何元素的矩形
      }
      await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
      await new Promise(r => setTimeout(r, 300));
      mo.disconnect();
      return count;
    });
    await page.close();
    assert(renders === 0, `位置沒變就不該重畫，實際重畫 ${renders} 次（沒有這道閘門會變成正回饋重繪風暴）`);
  });

  await test('元素被推走 → 框跟著移動到新位置', async () => {
    const page = await fresh(browser, { seed: [seedMark()] });
    await page.waitForSelector('.em-box', { timeout: 3000 });
    const r = await page.evaluate(async () => {
      const before = document.querySelector('.em-box').getBoundingClientRect().top;
      const spacer = document.createElement('div');
      spacer.style.height = '200px';
      document.querySelector('main').prepend(spacer);   // 在被標記元素上方插入一段
      await new Promise(res => setTimeout(res, 400));
      return {
        before,
        boxTop: document.querySelector('.em-box').getBoundingClientRect().top,
        targetTop: document.getElementById('btn-step').getBoundingClientRect().top,
      };
    });
    await page.close();
    assert(r.boxTop - r.before > 150, `插入 200px 後框應往下移，實際從 ${r.before} 到 ${r.boxTop}`);
    assert(Math.abs(r.boxTop - r.targetTop) < 6,
      `框要重新貼上元素（元素在 ${r.targetTop}），實際 ${r.boxTop}`);
  });

  await test('切到別的分頁 → 藏起來那一區的框收掉，不留 4px 紅點', async () => {
    const page = await fresh(browser, {
      seed: [seedMark({ id: 'a' }), seedMark({ id: 'b', selector: '#size-014' })],
    });
    await page.waitForSelector('.em-box', { timeout: 3000 });
    const r = await page.evaluate(async () => {
      const before = document.querySelectorAll('.em-box').length;
      document.getElementById('btn-step').closest('.card').style.display = 'none';
      await new Promise(res => setTimeout(res, 400));
      const boxes = [...document.querySelectorAll('.em-box')];
      return { before, after: boxes.length, ids: boxes.map(b => b.dataset.markId) };
    });
    await page.close();
    assert(r.before === 2, `先要有兩個框，實際 ${r.before}`);
    assert(r.after === 1 && r.ids[0] === 'b',
      `藏起來的那則不該再畫框（0×0 會變成左上角的紅點），實際剩 ${JSON.stringify(r.ids)}`);
  });

  /** pushState/replaceState 都不發 popstate，沒攔截就等於「換頁了但標記層不知道」。 */
  const routeSeed = [
    seedMark({ id: 'a', screenId: '/page-a', selector: '#btn-step', body: 'A 頁的標記' }),
    seedMark({ id: 'b', screenId: '/page-b', selector: '#size-014', body: 'B 頁的標記' }),
  ];
  const boxIds = (page) => page.evaluate(() =>
    [...document.querySelectorAll('.em-box')].map(b => b.dataset.markId));

  await test('pushState 換頁 → 標記層換成新頁的資料（舊頁的消失）', async () => {
    const page = await fresh(browser, { seed: routeSeed, pageFromLocation: true });
    await page.evaluate(() => history.pushState({}, '', '/page-a'));
    await page.waitForTimeout(300);
    const onA = await boxIds(page);
    await page.evaluate(() => history.pushState({}, '', '/page-b'));
    await page.waitForTimeout(300);
    const onB = await boxIds(page);
    await page.close();
    assert(onA.length === 1 && onA[0] === 'a', `/page-a 應只剩 A 的框，實際 ${JSON.stringify(onA)}`);
    assert(onB.length === 1 && onB[0] === 'b', `/page-b 應換成 B 的框，實際 ${JSON.stringify(onB)}`);
  });

  await test('replaceState 換頁 → 標記層一樣要跟著換', async () => {
    const page = await fresh(browser, { seed: routeSeed, pageFromLocation: true });
    await page.evaluate(() => history.replaceState({}, '', '/page-a'));
    await page.waitForTimeout(300);
    const onA = await boxIds(page);
    await page.evaluate(() => history.replaceState({}, '', '/page-b'));
    await page.waitForTimeout(300);
    const onB = await boxIds(page);
    await page.close();
    assert(onA.length === 1 && onA[0] === 'a', `/page-a 應只剩 A 的框，實際 ${JSON.stringify(onA)}`);
    assert(onB.length === 1 && onB[0] === 'b', `/page-b 應換成 B 的框，實際 ${JSON.stringify(onB)}`);
  });

  await test('history 攔截只裝一次，且原本的 pushState 行為照樣跑到', async () => {
    const page = await fresh(browser, { seed: [], pageFromLocation: true });
    const r = await page.evaluate(async () => {
      let events = 0;
      addEventListener('em:locationchange', () => { events++; });
      // 再掛一份元件：可重入的話不該疊出第二層 patch（一次 pushState 只發一個事件）
      await window.__emTest.init(window.__fb, { projectId: 'e2e-2' });
      history.pushState({}, '', '/patch-check');
      return { events, url: location.pathname };
    });
    await page.close();
    assert(r.url === '/patch-check', `原生行為要保留（網址該真的變），實際 ${r.url}`);
    assert(r.events === 1, `一次 pushState 只該發一個事件（重複 patch 會變 ${r.events} 個）`);
  });

  await browser.close();
  server.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
