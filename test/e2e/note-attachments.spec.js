// test/e2e/note-attachments.spec.js — 註記卡附件 e2e（opts.uploadAttachment）。
//
//   node test/e2e/note-attachments.spec.js
//
// 斷言（使用者 2026-10-06 定案的設計）：
//   1. 有 uploadAttachment → 迴紋針出現；選檔／貼圖後出現附件、計數「n／3」；第 4 個被擋並就近說明
//   2. 超過 10MB → 不加入、紅框說明上限，打好的字還在
//   3. 上傳中「存紀錄」不能按、Enter 也不存；傳完才能存
//   4. 上傳失敗 → 紅框「沒傳上去 · 重試」；照存時失敗的不帶入、卡上說「1 個附件沒存到」；重試成功會回來
//   5. 存紀錄後重開卡附件還在、doc 有 attachments、送給 AI 的 notes 帶 path；編輯時可拿掉
//   6. 拖檔進卡片 → 卡框變色＋虛線遮罩，放開加入
//   7. 沒碰過的不會變：另一則沒附件的舊註記 doc 不多出欄位
//   8. 沒傳 uploadAttachment → 看不到迴紋針；畫布貼圖成參考圖照舊；有傳時畫布貼圖也照舊
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

// 1x1 透明 PNG
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
const pngFile = (name) => ({ name, mimeType: 'image/png', buffer: PNG });
const pdfFile = (name, size = 2048) => ({ name, mimeType: 'application/pdf', buffer: Buffer.alloc(size, 1) });

let PORT, browser;
async function boot(withUploader) {
  const page = await browser.newPage({ viewport: { width: 900, height: 700 } });
  page.__errors = [];
  page.on('pageerror', e => page.__errors.push(e.message));
  await page.goto(`http://localhost:${PORT}/test/e2e/note-attachments-harness.html`);
  await page.waitForFunction(() => window.__h && window.__h.ready);
  await page.evaluate(w => window.__h.init({ withUploader: w }), withUploader);
  await page.waitForTimeout(80);
  return page;
}
// note 模式下點 #para → 開新註記卡
async function openCard(page, sel = '#para') {
  await page.evaluate(() => window.__api.setMode('note'));
  await page.waitForTimeout(40);
  const b = await page.evaluate(s => { const r = document.querySelector(s).getBoundingClientRect(); return { x: r.left + 30, y: r.top + r.height / 2 }; }, sel);
  await page.mouse.move(b.x, b.y); await page.mouse.move(b.x + 3, b.y + 2);
  await page.waitForTimeout(40);
  await page.mouse.click(b.x, b.y);
  await page.waitForSelector('.pc-note-card textarea');
}
// 在 textarea 上派一個帶檔案的 paste 事件（⌘V 貼截圖）
async function pasteImage(page, name, target = '.pc-note-card textarea') {
  await page.evaluate(({ name, target, b64 }) => {
    const bytes = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
    const dt = new DataTransfer(); dt.items.add(new File([bytes], name, { type: 'image/png' }));
    const el = target ? document.querySelector(target) : document;
    if (target) el.focus(); else if (document.activeElement) document.activeElement.blur();
    el.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
  }, { name, target, b64: PNG.toString('base64') });
  await page.waitForTimeout(60);
}
const listInfo = page => page.evaluate(() => ({
  thumbs: document.querySelectorAll('.pc-note-card .pc-attach-list .pc-att-thumb').length,
  files: document.querySelectorAll('.pc-note-card .pc-attach-list .pc-att-file').length,
  count: (document.querySelector('.pc-note-card .pc-attach-count') || {}).textContent,
  clipDisabled: (document.querySelector('.pc-note-card .pc-attach-btn') || {}).disabled,
  err: (document.querySelector('.pc-note-card .pc-att-err') || {}).textContent || '',
}));

(async () => {
  await new Promise(r => server.listen(0, r));
  PORT = server.address().port;
  browser = await chromium.launch();
  console.log('note attachments e2e:');

  await test('有 uploadAttachment：迴紋針出現；選兩個檔＋貼一張圖 → 3／3、迴紋針停用；第 4 個被擋並說明', async () => {
    const page = await boot(true);
    await openCard(page);
    assert(await page.$('.pc-note-card .pc-attach-btn'), '應有迴紋針');
    let info = await listInfo(page);
    assert(info.count === '', `還沒附檔時不顯示計數，實際「${info.count}」`);
    await page.setInputFiles('.pc-note-card .pc-attach-input', [pngFile('截圖.png'), pdfFile('規格表.pdf')]);
    await page.waitForTimeout(80);
    info = await listInfo(page);
    assert(info.thumbs === 1 && info.files === 1, `應有 1 縮圖 + 1 檔案，實際 ${JSON.stringify(info)}`);
    assert(info.count === '2／3', `計數應為 2／3，實際「${info.count}」`);
    await pasteImage(page, '貼上的.png');
    info = await listInfo(page);
    assert(info.thumbs === 2 && info.count === '3／3', `貼圖後應 3／3，實際 ${JSON.stringify(info)}`);
    assert(info.clipDisabled === true, '滿 3 個時迴紋針應停用');
    await pasteImage(page, '第四張.png');
    info = await listInfo(page);
    assert(info.thumbs + info.files === 3, `第 4 個不該加入，實際 ${info.thumbs + info.files}`);
    assert(info.err.includes('最多 3 個'), `應說明最多 3 個，實際「${info.err}」`);
    const objs = await page.evaluate(() => window.__api.getObjects().length);
    assert(objs === 0, `貼在輸入框的圖不該變成畫布參考圖，實際 objects=${objs}`);
    assert(!page.__errors.length, 'page errors: ' + page.__errors.join('; '));
    await page.close();
  });

  await test('超過 10MB：不加入、紅框說明上限，打好的字還在', async () => {
    const page = await boot(true);
    await openCard(page);
    await page.fill('.pc-note-card textarea', '參考這段錄影');
    await page.setInputFiles('.pc-note-card .pc-attach-input', [pdfFile('操作錄影.mov', 10 * 1024 * 1024 + 1)]);
    await page.waitForTimeout(60);
    const info = await listInfo(page);
    assert(info.thumbs + info.files === 0, '太大的檔不該加入');
    assert(info.err.includes('操作錄影.mov') && info.err.includes('超過單檔 10MB'), `紅框應說明檔名與上限，實際「${info.err}」`);
    const uploads = await page.evaluate(() => window.__uploads.length);
    assert(uploads === 0, '太大的檔不該被送去上傳');
    const v = await page.inputValue('.pc-note-card textarea');
    assert(v === '參考這段錄影', `打好的字不該不見，實際「${v}」`);
    await page.click('.pc-note-card .pc-att-err button');
    assert(!(await page.$('.pc-note-card .pc-att-err')), '按 ✕ 應收掉提示');
    await page.close();
  });

  await test('伺服器回 413：附件拿掉、改顯示太大的紅框', async () => {
    const page = await boot(true);
    await openCard(page);
    await page.evaluate(() => { window.__uploadMode = 'too_large'; });
    await page.setInputFiles('.pc-note-card .pc-attach-input', [pdfFile('偷渡.pdf')]);
    await page.waitForTimeout(80);
    const info = await listInfo(page);
    assert(info.thumbs + info.files === 0, `413 的附件應被拿掉，實際 ${JSON.stringify(info)}`);
    assert(info.err.includes('超過單檔 10MB'), `應顯示上限說明，實際「${info.err}」`);
    await page.close();
  });

  await test('上傳中「存紀錄」不能按、Enter 不存；傳完才存得下去', async () => {
    const page = await boot(true);
    await openCard(page);
    await page.evaluate(() => { window.__uploadMode = 'hold'; });
    await page.fill('.pc-note-card textarea', '照這份規格表排');
    await page.setInputFiles('.pc-note-card .pc-attach-input', [pdfFile('規格表.pdf')]);
    await page.waitForTimeout(60);
    const st = await page.evaluate(() => ({
      disabled: [...document.querySelectorAll('.pc-note-card .pc-note-row button')].find(b => b.textContent === '存紀錄').disabled,
      uploading: !!document.querySelector('.pc-note-card .pc-att-file.is-uploading .pc-att-bar'),
      sz: document.querySelector('.pc-note-card .pc-att-file .sz').textContent,
    }));
    assert(st.disabled, '上傳中存紀錄應 disabled');
    assert(st.uploading && st.sz.includes('上傳中'), `應顯示上傳中與進度條，實際 ${JSON.stringify(st)}`);
    await page.focus('.pc-note-card textarea'); await page.keyboard.press('Enter');
    let n = await page.evaluate(() => window.__api.getNotes().filter(x => x.id !== 'old-1').length);
    assert(n === 0, `上傳中按 Enter 不該存，實際 ${n}`);
    await page.evaluate(() => window.__release());
    await page.waitForTimeout(60);
    const disabled = await page.evaluate(() => [...document.querySelectorAll('.pc-note-card .pc-note-row button')].find(b => b.textContent === '存紀錄').disabled);
    assert(!disabled, '傳完後存紀錄應可按');
    await page.keyboard.press('Enter');
    n = await page.evaluate(() => window.__api.getNotes().filter(x => x.id !== 'old-1').length);
    assert(n === 1, `傳完後 Enter 應存下，實際 ${n}`);
    await page.close();
  });

  await test('上傳失敗：紅框「沒傳上去 · 重試」；照存 → 失敗的不帶入、卡上說「1 個附件沒存到」；重試成功會回來', async () => {
    const page = await boot(true);
    await openCard(page);
    await page.fill('.pc-note-card textarea', '欄位照這份排');
    await page.setInputFiles('.pc-note-card .pc-attach-input', [pngFile('好的.png')]);
    await page.waitForTimeout(60);
    await page.evaluate(() => { window.__uploadMode = 'fail'; });
    await page.setInputFiles('.pc-note-card .pc-attach-input', [pdfFile('壞的.pdf')]);
    await page.waitForTimeout(60);
    const failedTxt = await page.evaluate(() => (document.querySelector('.pc-note-card .pc-att-file.is-failed') || {}).textContent || '');
    assert(failedTxt.includes('沒傳上去') && failedTxt.includes('重試'), `應顯示失敗與重試，實際「${failedTxt}」`);
    // 重試：先讓它再失敗一次確認仍是 failed，再改成成功
    await page.evaluate(() => { window.__uploadMode = 'ok'; });
    await page.click('.pc-note-card .pc-att-file.is-failed .retry');
    await page.waitForTimeout(60);
    assert(!(await page.$('.pc-note-card .pc-att-file.is-failed')), '重試成功後不該再是失敗狀態');
    // 再加一個失敗的，然後照存
    await page.evaluate(() => { window.__uploadMode = 'fail'; });
    await page.setInputFiles('.pc-note-card .pc-attach-input', [pdfFile('又壞.pdf')]);
    await page.waitForTimeout(60);
    await page.click('.pc-note-card .pc-note-row button:has-text("存紀錄")');
    await page.waitForTimeout(80);
    const saved = await page.evaluate(() => window.__api.getNotes().find(x => x.id !== 'old-1'));
    assert(saved && saved.attachments.length === 2, `應只存 2 個成功的附件，實際 ${JSON.stringify(saved && saved.attachments)}`);
    assert(!saved.attachments.some(a => a.name === '又壞.pdf'), '失敗的附件不該帶入');
    const notice = await page.evaluate(() => (document.querySelector('.pc-note-card .pc-att-err') || {}).textContent || '');
    assert(notice.includes('1 個附件沒存到'), `卡上應說「1 個附件沒存到」，實際「${notice}」`);
    await page.close();
  });

  await test('存紀錄後重開卡附件還在、doc 有 attachments、送給 AI 帶 path；編輯可拿掉；舊註記 doc 沒被動到', async () => {
    const page = await boot(true);
    const oldBefore = await page.evaluate(() => JSON.stringify(window.__h.docs().find(d => d.id === 'old-1')));
    await openCard(page);
    await page.fill('.pc-note-card textarea', '改成跟這張圖一樣的間距');
    await page.setInputFiles('.pc-note-card .pc-attach-input', [pngFile('截圖.png'), pdfFile('規格表.pdf')]);
    await page.waitForTimeout(80);
    await page.click('.pc-note-card .pc-note-row button:has-text("存紀錄")');
    await page.waitForTimeout(80);
    const note = await page.evaluate(() => window.__api.getNotes().find(x => x.id !== 'old-1'));
    const doc = await page.evaluate(id => window.__h.docs().find(d => d.id === id), note.id);
    assert(Array.isArray(doc.attachments) && doc.attachments.length === 2, `doc 應有 2 個 attachments，實際 ${JSON.stringify(doc.attachments)}`);
    const keys = Object.keys(doc.attachments[0]).sort().join(',');
    assert(keys === 'name,path,size,type,url', `附件只該有合約欄位，實際 ${keys}`);
    const exp = await page.evaluate(() => window.__api.buildExport().notes);
    const en = exp.find(x => x.id === note.id);
    assert(en && en.attachments && en.attachments[0].path.startsWith('/tmp/ws/uploads/'), `送給 AI 的 notes 應帶 path，實際 ${JSON.stringify(en)}`);
    // 重開 view 卡：附件在 prompt 泡泡內
    await page.click(`.pc-note-mark[data-note-id="${note.id}"] .pc-note-tab`);
    await page.waitForSelector('.pc-note-card .pc-note-prompt-att');
    const view = await page.evaluate(() => ({
      thumbs: document.querySelectorAll('.pc-note-prompt-text .pc-note-prompt-att .pc-att-thumb').length,
      files: document.querySelectorAll('.pc-note-prompt-text .pc-note-prompt-att .pc-att-file').length,
      x: document.querySelectorAll('.pc-note-prompt-att .pc-att-x').length,
    }));
    assert(view.thumbs === 1 && view.files === 1 && view.x === 0, `view 卡應有 1 縮圖 1 檔案、沒有 ✕，實際 ${JSON.stringify(view)}`);
    // 編輯：附件回到輸入狀態，拿掉 pdf 後更新
    await page.click('.pc-note-card .pc-note-row button:has-text("編輯")');
    let info = await listInfo(page);
    assert(info.thumbs === 1 && info.files === 1 && info.count === '2／3', `編輯時附件應回到輸入狀態，實際 ${JSON.stringify(info)}`);
    await page.click('.pc-note-card .pc-attach-list .pc-att-file .pc-att-x');
    await page.click('.pc-note-card .pc-note-row button:has-text("更新")');
    await page.waitForTimeout(80);
    const doc2 = await page.evaluate(id => window.__h.docs().find(d => d.id === id), note.id);
    assert(doc2.attachments.length === 1 && doc2.attachments[0].name === '截圖.png', `更新後 doc 應只剩截圖，實際 ${JSON.stringify(doc2.attachments)}`);
    // 沒碰過的不會變
    const oldAfter = await page.evaluate(() => JSON.stringify(window.__h.docs().find(d => d.id === 'old-1')));
    assert(oldAfter === oldBefore, `舊註記 doc 不該變動：\n before=${oldBefore}\n after=${oldAfter}`);
    const oldNote = await page.evaluate(() => window.__api.getNotes().find(x => x.id === 'old-1'));
    assert(!('attachments' in oldNote), '舊註記不該多出 attachments 欄位');
    assert(!page.__errors.length, 'page errors: ' + page.__errors.join('; '));
    await page.close();
  });

  await test('拖檔進卡片：卡框變色＋虛線遮罩；放開加入、遮罩收掉', async () => {
    const page = await boot(true);
    await openCard(page);
    await page.evaluate(() => {
      const card = document.querySelector('.pc-note-card');
      const dt = new DataTransfer(); dt.items.add(new File(['x'], '拖進來.txt', { type: 'text/plain' }));
      window.__dt = dt;
      card.dispatchEvent(new DragEvent('dragenter', { dataTransfer: dt, bubbles: true, cancelable: true }));
      card.dispatchEvent(new DragEvent('dragover', { dataTransfer: dt, bubbles: true, cancelable: true }));
    });
    const during = await page.evaluate(() => ({
      over: document.querySelector('.pc-note-card').classList.contains('is-dragover'),
      veil: (document.querySelector('.pc-note-card .pc-drop-veil') || {}).textContent || '',
    }));
    assert(during.over && during.veil.includes('放開就加入附件'), `拖曳中應變色＋遮罩，實際 ${JSON.stringify(during)}`);
    await page.evaluate(() => {
      const card = document.querySelector('.pc-note-card');
      card.dispatchEvent(new DragEvent('drop', { dataTransfer: window.__dt, bubbles: true, cancelable: true }));
    });
    await page.waitForTimeout(60);
    const after = await page.evaluate(() => ({
      over: document.querySelector('.pc-note-card').classList.contains('is-dragover'),
      veil: !!document.querySelector('.pc-note-card .pc-drop-veil'),
      files: document.querySelectorAll('.pc-note-card .pc-attach-list .pc-att-file').length,
    }));
    assert(!after.over && !after.veil && after.files === 1, `放開後應加入並收掉遮罩，實際 ${JSON.stringify(after)}`);
    await page.close();
  });

  await test('有 uploadAttachment 時，畫布（沒在打字）貼圖仍變成參考圖', async () => {
    const page = await boot(true);
    await page.evaluate(() => window.__api.setMode('draw'));
    await pasteImage(page, '參考.png', null);
    await page.waitForTimeout(150);
    const imgs = await page.evaluate(() => window.__api.getObjects().filter(o => o.tool === 'image').length);
    assert(imgs === 1, `畫布貼圖應產生 1 張參考圖，實際 ${imgs}`);
    await page.close();
  });

  await test('沒傳 uploadAttachment：看不到迴紋針、輸入框貼圖不攔；畫布貼圖成參考圖照舊；doc 不帶 attachments', async () => {
    const page = await boot(false);
    await page.evaluate(() => window.__api.setMode('draw'));
    await pasteImage(page, '參考.png', null);
    await page.waitForTimeout(150);
    const imgs = await page.evaluate(() => window.__api.getObjects().filter(o => o.tool === 'image').length);
    assert(imgs === 1, `畫布貼圖應產生 1 張參考圖，實際 ${imgs}`);
    await openCard(page);
    const ui = await page.evaluate(() => ({
      clip: !!document.querySelector('.pc-note-card .pc-attach-btn'),
      list: !!document.querySelector('.pc-note-card .pc-attach-list'),
      input: !!document.querySelector('.pc-note-card input[type=file]'),
      rowBtns: [...document.querySelectorAll('.pc-note-card .pc-note-row > *')].map(b => b.textContent),
    }));
    assert(!ui.clip && !ui.list && !ui.input, `不該出現附件 UI，實際 ${JSON.stringify(ui)}`);
    assert(JSON.stringify(ui.rowBtns) === JSON.stringify(['取消', '存紀錄']), `按鈕列應跟原本一樣，實際 ${JSON.stringify(ui.rowBtns)}`);
    const pasteEv = await page.evaluate(({ b64 }) => {
      const bytes = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
      const dt = new DataTransfer(); dt.items.add(new File([bytes], 'x.png', { type: 'image/png' }));
      const ta = document.querySelector('.pc-note-card textarea'); ta.focus();
      const ev = new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true });
      ta.dispatchEvent(ev);
      return ev.defaultPrevented;
    }, { b64: PNG.toString('base64') });
    assert(pasteEv === false, '沒傳 uploadAttachment 時，輸入框的貼上不該被攔');
    await page.fill('.pc-note-card textarea', '沒附件的留言');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(60);
    const note = await page.evaluate(() => window.__api.getNotes().find(x => x.id !== 'old-1'));
    const doc = await page.evaluate(id => window.__h.docs().find(d => d.id === id), note.id);
    assert(doc && !('attachments' in doc), `doc 不該帶 attachments，實際 ${JSON.stringify(doc)}`);
    const exp = await page.evaluate(() => window.__api.buildExport().notes.find(n => n.text === '沒附件的留言'));
    assert(exp && !('attachments' in exp), '送給 AI 的 note 不該帶 attachments');
    await page.close();
  });

  await test('圖片預覽的 object URL：存檔、取消、點外面、切到別張卡、上傳中關卡都會釋放', async () => {
    const page = await boot(true);
    await page.evaluate(() => {
      window.__made = []; window.__revoked = [];
      const mk = URL.createObjectURL.bind(URL), rv = URL.revokeObjectURL.bind(URL);
      URL.createObjectURL = (b) => { const u = mk(b); window.__made.push(u); return u; };
      URL.revokeObjectURL = (u) => { window.__revoked.push(u); rv(u); };
    });
    const leaked = () => page.evaluate(() => window.__made.filter(u => !window.__revoked.includes(u)));
    const made = () => page.evaluate(() => window.__made.length);
    // 1) 存紀錄
    await openCard(page, '#t1');
    await page.fill('.pc-note-card textarea', '存檔');
    await pasteImage(page, 'a.png');
    await page.click('.pc-note-card .pc-note-row button:has-text("存紀錄")');
    await page.waitForTimeout(60);
    // 2) 取消
    await openCard(page, '#t2');
    await pasteImage(page, 'b.png');
    await page.click('.pc-note-card .pc-note-row button:has-text("取消")');
    // 3) 點外面（有字 → 自動存檔後關）
    await openCard(page, '#t3');
    await page.fill('.pc-note-card textarea', '點外面');
    await pasteImage(page, 'c.png');
    await page.mouse.click(860, 660);
    await page.waitForTimeout(60);
    // 4) 切到別張卡（點另一個元件開新卡）
    await openCard(page, '#t4');
    await pasteImage(page, 'd.png');
    await openCard(page, '#t5');
    await page.click('.pc-note-card .pc-note-row button:has-text("取消")');
    // 5) 上傳中按 ✕ 關卡
    await page.evaluate(() => { window.__uploadMode = 'hold'; });
    await openCard(page, '#t2');
    await pasteImage(page, 'e.png');
    await page.click('.pc-note-card .pc-note-card-head button');
    await page.evaluate(() => window.__release());
    await page.waitForTimeout(60);
    assert(await made() === 5, `應建了 5 個預覽網址，實際 ${await made()}`);
    const left = await leaked();
    assert(left.length === 0, `有 ${left.length} 個預覽網址沒釋放`);
    assert(!page.__errors.length, 'page errors: ' + page.__errors.join('; '));
    await page.close();
  });

  await test('note doc 帶 javascript:／data: 網址：縮圖不設 src、點了不呼叫 window.open、卡片照常顯示', async () => {
    const page = await browser.newPage({ viewport: { width: 900, height: 700 } });
    page.__errors = [];
    page.on('pageerror', e => page.__errors.push(e.message));
    await page.goto(`http://localhost:${PORT}/test/e2e/note-attachments-harness.html`);
    await page.waitForFunction(() => window.__h && window.__h.ready);
    await page.evaluate(() => {
      window.__h.init({ withUploader: true });
      window.__opened = [];
      window.open = (...a) => { window.__opened.push(a[0]); return null; };
      window.__fb.__seed({ id: 'evil-1', kind: 'note', text: '被竄改的留言', sel: '#para', relX: 0.5, relY: 0.5, x: 10, y: 10, label: 'para', updatedAt: 2,
        attachments: [
          { name: 'x.png', type: 'image/png', size: 10, url: 'javascript:window.__pwned=1', path: '/tmp/x.png' },
          { name: 'y.pdf', type: 'application/pdf', size: 10, url: ' data:text/html,<script>window.__pwned=1</script>', path: '/tmp/y.pdf' },
        ] });
    });
    await page.waitForTimeout(80);
    await page.evaluate(() => window.__api.setMode('note'));
    await page.click('.pc-note-mark[data-note-id="evil-1"] .pc-note-tab');
    await page.waitForSelector('.pc-note-card .pc-note-prompt-att');
    const st = await page.evaluate(() => ({
      thumbs: document.querySelectorAll('.pc-note-prompt-att .pc-att-thumb').length,
      files: document.querySelectorAll('.pc-note-prompt-att .pc-att-file').length,
      srcs: [...document.querySelectorAll('.pc-note-prompt-att img')].map(i => i.getAttribute('src')),
    }));
    assert(st.thumbs === 1 && st.files === 1, `兩個附件都要顯示（不壞版），實際 ${JSON.stringify(st)}`);
    assert(!st.srcs.some(s => s && /^\s*(javascript|data):/i.test(s)), `縮圖不該設不安全的 src：${JSON.stringify(st.srcs)}`);
    await page.click('.pc-note-prompt-att .pc-att-thumb');
    await page.click('.pc-note-prompt-att .pc-att-file');
    await page.focus('.pc-note-prompt-att .pc-att-file').catch(() => {});
    await page.keyboard.press('Enter');
    const res = await page.evaluate(() => ({ opened: window.__opened, pwned: window.__pwned || null }));
    assert(res.opened.length === 0, `不該呼叫 window.open，實際 ${JSON.stringify(res.opened)}`);
    assert(res.pwned === null, '不該執行到 javascript: 網址');
    assert(!page.__errors.length, 'page errors: ' + page.__errors.join('; '));
    await page.close();
  });

  await browser.close();
  server.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
