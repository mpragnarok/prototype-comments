// test/e2e/record-allbox-receipt.spec.js — 全選框作用範圍 × 回執筆數 × 隱藏註記送出後的狀態
//
//   node test/e2e/record-allbox-receipt.spec.js
//
// 釘住三件事（都是「隱藏的標注不再被偷偷送出」那次改動帶進來的使用者可見破口）：
//   1. 有列被眼睛鈕藏起來時，全選框仍能在「全勾 ↔ 全不勾」之間來回切，送出鈕筆數跟著變
//      （分子排除隱藏、分母沒排除 → checked 永遠不成立 → 整顆全選框對使用者沒反應）
//   2. 送出後的回執筆數 ＝ endpoint 實際收到的 annotations + notes + decisions + moves 筆數
//   3. 隱藏的未送註記在送出時不會被蓋上「已送」簽章 —— 取消隱藏後要能回到送出集合
//      （noteSig 不含 hidden，蓋了就永遠回不來，狀態卡死）
import { chromium } from 'playwright';
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json' };

const posts = [];
const server = http.createServer((req, res) => {
  const rel = decodeURIComponent(req.url.split('?')[0]);
  if (rel === '/agent-endpoint') {
    let body = '';
    req.on('data', c => { body += c; });
    req.on('end', () => {
      try { posts.push(JSON.parse(body)); } catch (_) { posts.push({ __unparsable: body.length }); }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, n: 1, listening: true }));
    });
    return;
  }
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

async function dragDraw(page, x1, y1, x2, y2) {
  await page.mouse.move(x1, y1); await page.mouse.down();
  await page.mouse.move((x1 + x2) / 2, (y1 + y2) / 2); await page.mouse.move(x2, y2); await page.mouse.up();
}
const rowsOf = page => page.evaluate(() => [...document.querySelectorAll('.pc-draw-rec-row')].map(r => ({
  id: r.dataset.id, text: r.querySelector('.pc-draw-rec-text').textContent,
  sent: r.classList.contains('is-sent-row'),
  eyeOff: !!r.querySelector('.pc-draw-rec-eye.is-off'),
  checked: !!r.querySelector('.pc-draw-rec-check')?.checked,
})));
const sendBtnText = page => page.evaluate(() => document.querySelector('.pc-draw-rec-send-btn').textContent);
const allBoxState = page => page.evaluate(() => {
  const b = document.querySelector('.pc-draw-rec-all');
  return { checked: b.checked, indeterminate: b.indeterminate, disabled: b.disabled };
});
const settle = page => page.waitForFunction(() => !document.querySelector('.pc-draw-rec-send-btn').dataset.inflight, null, { timeout: 8000 });
const clickEye = (page, id) => page.click(`.pc-draw-rec-row[data-id="${id}"] .pc-draw-rec-eye`);
// 送出鈕的回執文字（「✅ 已送達 AI（N 筆）」）裡的數字；回執停留 2 秒 → 這期間讀
async function receiptN(page) {
  await page.waitForFunction(() => /已送達|已排佇列/.test(document.querySelector('.pc-draw-rec-send-btn').textContent), null, { timeout: 8000 });
  const t = await sendBtnText(page);
  const m = t.match(/（(\d+)\s*筆）/);
  assert(m, `回執文字讀不到筆數：「${t}」`);
  return { n: Number(m[1]), text: t };
}
function payloadN(post) {
  const j = post.json;
  return (j.annotations || []).length + (j.notes || []).length + (j.decisions || []).length + (j.moves || []).length;
}

(async () => {
  await new Promise(r => server.listen(0, r));
  const PORT = server.address().port; // ephemeral → 不與平行 bg job 撞埠
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 800, height: 600 } });
  const errors = [];
  page.on('pageerror', e => { errors.push(e.message); console.log('     [pageerror]', e.message); });
  page.on('console', m => { if (m.type() === 'error') { errors.push(m.text()); console.log('     [browser err]', m.text()); } });
  await page.goto(`http://localhost:${PORT}/test/e2e/draw-layer-harness.html`);
  await page.waitForFunction(() => window.__drawTest && window.__drawTest.ready);

  console.log('record-allbox-receipt e2e（全選框 × 回執筆數 × 隱藏註記狀態）:');

  await page.evaluate(() => {
    window.__api = window.__drawTest.init({ mode: 'draw' });
    window.__api.setExportEndpoint('/agent-endpoint');
    window.__api.toggleRecordPanel();
  });

  // ── 1. 有列被隱藏時，全選框仍要能來回切 ───────────────────────────────────────
  await test('隱藏一筆待送列後：全選框仍能在「全勾 ↔ 全不勾」之間來回切，送出鈕筆數跟著變', async () => {
    await page.evaluate(() => { window.__api.clear(); window.__api.setTool('rect'); });
    await dragDraw(page, 100, 100, 180, 160);
    await dragDraw(page, 220, 100, 300, 160);
    await page.waitForTimeout(150);
    const rows = await rowsOf(page);
    assert(rows.length === 2, `前提：應有 2 列，實際 ${rows.length}`);
    assert((await sendBtnText(page)).includes('（2）'), '前提：隱藏前送出鈕算 2 筆');

    const hiddenId = rows[0].id;
    await clickEye(page, hiddenId);
    await page.waitForTimeout(200);
    const s0 = await allBoxState(page);
    console.log('     隱藏一筆後：sendBtn =', await sendBtnText(page), 'allBox =', JSON.stringify(s0));
    assert((await sendBtnText(page)).includes('（1）'), '前提：隱藏後送出鈕算 1 筆');
    assert(s0.checked && !s0.indeterminate,
      `可送出的 1 列都勾著 → 全選框應為 checked（分母要排除隱藏列），實際 ${JSON.stringify(s0)}`);

    // 第一下：取消全選
    await page.click('.pc-draw-rec-all');
    await page.waitForTimeout(250);
    const b1 = await sendBtnText(page), s1 = await allBoxState(page);
    console.log('     點全選框 ×1：sendBtn =', b1, 'allBox =', JSON.stringify(s1));
    assert(b1.includes('（0）'), `點一下應取消全選 → 送出鈕 0 筆，實際「${b1}」`);
    assert(!s1.checked && !s1.indeterminate, `取消全選後全選框應為未勾，實際 ${JSON.stringify(s1)}`);

    // 第二下：全選回來
    await page.click('.pc-draw-rec-all');
    await page.waitForTimeout(250);
    const b2 = await sendBtnText(page), s2 = await allBoxState(page);
    console.log('     點全選框 ×2：sendBtn =', b2, 'allBox =', JSON.stringify(s2));
    assert(b2.includes('（1）'), `再點一下應全選回來 → 送出鈕 1 筆，實際「${b2}」`);
    assert(s2.checked && !s2.indeterminate, `全選後全選框應為 checked，實際 ${JSON.stringify(s2)}`);

    // 隱藏的那列不歸全選框管：它的勾選框維持使用者原本的意思
    const after = await rowsOf(page);
    const hiddenRow = after.find(r => r.id === hiddenId);
    console.log('     隱藏列的勾選框:', hiddenRow.checked);
    assert(hiddenRow.checked, '全選/取消全選都不該動到被隱藏的列（取消隱藏後要保持原本的勾選意思）');
  });

  // ── 2. 回執筆數 ＝ endpoint 實際收到的筆數 ─────────────────────────────────────
  await test('隱藏註記 + 可見標注：回執筆數 ＝ payload 實際筆數', async () => {
    await page.evaluate(() => {
      window.__api.clear(); window.__api.setTool('rect');
      window.__api.addNote('會被藏起來的註記', { sel: '#price-card', relX: 0.3, relY: 0.3 });
    });
    await dragDraw(page, 120, 300, 200, 360);
    await page.waitForTimeout(200);
    const noteId = await page.evaluate(() => window.__api.getNotes()[0].id);
    await clickEye(page, noteId);
    await page.waitForTimeout(200);
    const btn = await sendBtnText(page);
    assert(btn.includes('（1）'), `前提：隱藏註記後送出鈕應算 1 筆，實際「${btn}」`);

    const n0 = posts.length;
    await page.click('.pc-draw-rec-send-btn');
    const r = await receiptN(page);
    await page.waitForTimeout(600);
    assert(posts.length === n0 + 1, `應送出一次，實際新增 ${posts.length - n0}`);
    const actual = payloadN(posts[posts.length - 1]);
    console.log('     回執:', r.text, '| payload 實收:', actual,
      JSON.stringify({ ann: posts[posts.length - 1].json.annotations.length, notes: (posts[posts.length - 1].json.notes || []).length }));
    assert(r.n === actual, `回執說 ${r.n} 筆，endpoint 實收 ${actual} 筆 —— 兩者必須一致`);
    await settle(page);
  });

  await test('已送註記 + 新標注：回執筆數 ＝ payload 實際筆數（不把已送的算進去）', async () => {
    await page.evaluate(() => {
      window.__api.clear();
      window.__api.addNote('先送出去的註記', { sel: '#price-card', relX: 0.4, relY: 0.4 });
    });
    await page.waitForTimeout(200);
    await page.click('.pc-draw-rec-send-btn');
    await settle(page);
    await page.waitForTimeout(200);

    await page.evaluate(() => window.__api.setTool('rect'));
    await dragDraw(page, 300, 300, 380, 360);
    await page.waitForTimeout(200);
    const btn = await sendBtnText(page);
    assert(btn.includes('（1）'), `前提：只剩新標注可送 → 應算 1 筆，實際「${btn}」`);

    const n0 = posts.length;
    await page.click('.pc-draw-rec-send-btn');
    const r = await receiptN(page);
    await page.waitForTimeout(600);
    assert(posts.length === n0 + 1, `應送出一次，實際新增 ${posts.length - n0}`);
    const actual = payloadN(posts[posts.length - 1]);
    console.log('     回執:', r.text, '| payload 實收:', actual);
    assert(r.n === actual, `回執說 ${r.n} 筆，endpoint 實收 ${actual} 筆 —— 兩者必須一致`);
    await settle(page);
  });

  // ── 3. 隱藏的未送註記，送出後取消隱藏要能回到送出集合 ───────────────────────────
  await test('隱藏的未送註記不該被標「已送」：送出 → 取消隱藏 → 它回到送出集合（筆數 +1、payload 含它）', async () => {
    await page.evaluate(() => {
      window.__api.clear(); window.__api.setTool('rect');
      window.__api.addNote('藏起來沒送出的註記', { sel: '#price-card', relX: 0.55, relY: 0.55 });
    });
    await dragDraw(page, 420, 120, 500, 180);
    await page.waitForTimeout(220);
    const noteId = await page.evaluate(() => window.__api.getNotes()[0].id);
    await clickEye(page, noteId);
    await page.waitForTimeout(200);
    assert((await sendBtnText(page)).includes('（1）'), '前提：隱藏註記後只剩標注可送');

    // 送出：payload 只有標注，隱藏的註記沒被送出去
    const n0 = posts.length;
    await page.click('.pc-draw-rec-send-btn');
    await page.waitForTimeout(900);
    assert(posts.length === n0 + 1, `應送出一次，實際新增 ${posts.length - n0}`);
    const sentNotes = (posts[posts.length - 1].json.notes || []);
    console.log('     送出的 notes:', JSON.stringify(sentNotes.map(n => n.text)));
    assert(sentNotes.length === 0, `隱藏的註記不該被送出，實際 payload.notes 有 ${sentNotes.length} 筆`);
    await settle(page);

    // 取消隱藏 → 它從沒被送出過，必須回到送出集合
    await clickEye(page, noteId);
    await page.waitForTimeout(250);
    const row = (await rowsOf(page)).find(r => r.id === noteId);
    console.log('     取消隱藏後該列:', JSON.stringify(row));
    assert(!row.eyeOff, '前提：已取消隱藏');
    assert(!row.sent, `沒送出去的註記不該被標成「已送」（noteSig 不含 hidden → 蓋了就永遠回不來）`);
    const btn = await sendBtnText(page);
    console.log('     取消隱藏後 sendBtn:', btn);
    assert(btn.includes('（1）'), `取消隱藏後該註記應回到送出集合 → 送出鈕 1 筆，實際「${btn}」`);
    const p = await page.evaluate(() => window.__api.buildExport());
    console.log('     buildExport notes:', JSON.stringify((p.notes || []).map(n => n.text)));
    assert((p.notes || []).some(n => n.text === '藏起來沒送出的註記'), '取消隱藏後它必須重新進 payload.notes');

    // 再送一次：endpoint 真的收到它（不只是畫面上的數字）
    const n1 = posts.length;
    await page.click('.pc-draw-rec-send-btn');
    await page.waitForTimeout(900);
    assert(posts.length === n1 + 1, `應再送出一次，實際新增 ${posts.length - n1}`);
    const again = (posts[posts.length - 1].json.notes || []);
    console.log('     第二次送出的 notes:', JSON.stringify(again.map(n => n.text)));
    assert(again.some(n => n.text === '藏起來沒送出的註記'), '第二次 payload 必須含這則註記');
    await settle(page);
  });

  console.log(`\n${fail === 0 ? '✅' : '❌'} record-allbox-receipt: ${pass} passed, ${fail} failed`);
  if (errors.length) console.log('   page errors seen:', errors.join(' / '));
  await browser.close();
  server.close();
  process.exit(fail === 0 ? 0 : 1);
})();
