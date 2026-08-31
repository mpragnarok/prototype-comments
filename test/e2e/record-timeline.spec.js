// test/e2e/record-timeline.spec.js — 標注紀錄面板「對話串 + 篩選」（方案 D）
//
//   node test/e2e/record-timeline.spec.js
//
// 釘住四件事：
//   1. 已送出的列留在清單上（含註記——舊版註記送出後整列消失，pin 卻還留在畫布上）
//   2. 每列的眼睛鈕切換「這一筆畫不畫在畫布上」（標注走 SVG、註記走 pin）
//   3. 頂部篩選列（全部／待送／已送／有回覆）只改看得到哪幾列，不改送出範圍
//   4. AI 回覆氣泡：consumer 用 api.setAgentReplies 推進來才有；
//      沒推的 consumer（prototype-flow / prototype-live）面板照常運作、零氣泡、零錯誤
import { chromium } from 'playwright';
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json' };

const server = http.createServer((req, res) => {
  const rel = decodeURIComponent(req.url.split('?')[0]);
  // 假的 agent endpoint：讓 footer「送給 AI」走得到成功分支（sendToAgent 需要 result.sent）
  if (rel === '/agent-endpoint') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, n: 1, listening: true }));
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
const snap = page => page.evaluate(() => ({
  rows: [...document.querySelectorAll('.pc-draw-rec-row')].map(r => ({
    id: r.dataset.id, text: r.querySelector('.pc-draw-rec-text').textContent,
    sent: r.classList.contains('is-sent-row'), hiddenRow: r.classList.contains('is-hidden-row'),
    eye: !!r.querySelector('.pc-draw-rec-eye'), eyeOff: !!r.querySelector('.pc-draw-rec-eye.is-off'),
  })),
  bubbles: [...document.querySelectorAll('.pc-draw-rec-reply')].map(b => b.querySelector('.pc-draw-rec-reply-text').textContent),
  orphanHd: !!document.querySelector('.pc-draw-rec-orphan-hd'),
  filters: [...document.querySelectorAll('.pc-draw-rec-filter')].map(f => ({ v: f.dataset.filter, t: f.textContent, on: f.classList.contains('is-on') })),
  svgNodes: document.querySelectorAll('#pc-draw [data-id]').length,
  notePins: document.querySelectorAll('.pc-note-mark').length,
  headerCount: document.querySelector('.pc-draw-rec-count').textContent,
  sendBtn: document.querySelector('.pc-draw-rec-send-btn').textContent,
  allBox: (() => { const b = document.querySelector('.pc-draw-rec-all'); return { checked: b.checked, indeterminate: b.indeterminate, disabled: b.disabled }; })(),
}));

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

  console.log('record-timeline e2e（標注紀錄對話串 + 篩選）:');

  await page.evaluate(() => {
    window.__api = window.__drawTest.init({ mode: 'draw' });
    window.__api.setExportEndpoint('/agent-endpoint');
    window.__api.setTool('rect');
  });
  // 兩個標注 + 一則註記
  await dragDraw(page, 100, 100, 180, 160);
  await dragDraw(page, 220, 100, 300, 160);
  await page.evaluate(() => window.__api.addNote('註記一', { sel: '#price-card', relX: 0.5, relY: 0.5 }));
  await page.evaluate(() => window.__api.toggleRecordPanel());

  await test('篩選列存在，四顆鈕、預設「全部」選中，各自帶筆數', async () => {
    const s = await snap(page);
    console.log('     filters:', JSON.stringify(s.filters));
    assert(s.filters.length === 4, `應有 4 顆篩選鈕，實際 ${s.filters.length}`);
    assert(s.filters.map(f => f.v).join(',') === 'all,pending,sent,replied', `篩選值應為 all,pending,sent,replied，實際 ${s.filters.map(f => f.v)}`);
    assert(s.filters[0].on, '預設應選中「全部」');
    assert(s.filters[0].t.includes('3') && s.filters[1].t.includes('3'), `全部/待送 都應是 3，實際 ${s.filters[0].t} / ${s.filters[1].t}`);
  });

  // ── 送出 ────────────────────────────────────────────────────────────────────
  await page.click('.pc-draw-rec-send-btn');
  await page.waitForTimeout(600);

  await test('已送出的列全部留在清單（標注 2 + 註記 1），不再消失', async () => {
    const s = await snap(page);
    console.log('     rows:', JSON.stringify(s.rows));
    assert(s.rows.length === 3, `送出後應仍有 3 列，實際 ${s.rows.length}`);
    assert(s.rows.every(r => r.sent), '三列都應標成已送出（is-sent-row）');
    assert(s.rows.some(r => r.text.includes('註記一')), '註記列也要留下（舊版會整列消失）');
  });

  // archiveObjects 只吃 state.objects（畫的標注），註記/位移完全不在它的範圍內——
  // 所以「送出後畫布上還看得到東西」是設計如此，不是 bug。這條把兩邊的實際行為都釘住。
  await test('送出後：標注從畫布收起，但註記 pin 仍留著（archiveObjects 不管註記）', async () => {
    const s = await snap(page);
    console.log('     svgNodes:', s.svgNodes, 'notePins:', s.notePins);
    assert(s.svgNodes === 0, `已送標注不應留在畫布，實際 ${s.svgNodes} 個`);
    assert(s.notePins === 1, `註記 pin 送出後仍在畫布（要收起請按眼睛鈕），實際 ${s.notePins}`);
  });

  await test('眼睛鈕：標注列點一下 → 回到畫布；再點一下 → 又收起', async () => {
    const before = await snap(page);
    const annRow = before.rows.find(r => !r.text.includes('註記'));
    assert(annRow && annRow.eye, '標注列應有眼睛鈕');
    await page.click(`.pc-draw-rec-row[data-id="${annRow.id}"] .pc-draw-rec-eye`);
    await page.waitForTimeout(150);
    const on = await snap(page);
    console.log('     點開後 svgNodes:', on.svgNodes);
    assert(on.svgNodes === 1, `點眼睛後該標注應回畫布（1），實際 ${on.svgNodes}`);
    await page.click(`.pc-draw-rec-row[data-id="${annRow.id}"] .pc-draw-rec-eye`);
    await page.waitForTimeout(150);
    const off = await snap(page);
    console.log('     再點後 svgNodes:', off.svgNodes);
    assert(off.svgNodes === 0, `再點一次應又從畫布收起，實際 ${off.svgNodes}`);
  });

  await test('眼睛鈕：註記列切換 pin 在畫布上的顯示', async () => {
    const s0 = await snap(page);
    const noteRow = s0.rows.find(r => r.text.includes('註記一'));
    assert(noteRow && noteRow.eye, '註記列應有眼睛鈕');
    const pinsBefore = s0.notePins;
    await page.click(`.pc-draw-rec-row[data-id="${noteRow.id}"] .pc-draw-rec-eye`);
    await page.waitForTimeout(150);
    const s1 = await snap(page);
    console.log('     notePins', pinsBefore, '→', s1.notePins);
    assert(s1.notePins !== pinsBefore, `眼睛鈕應改變 pin 顯示（${pinsBefore} → ${s1.notePins}）`);
    await page.click(`.pc-draw-rec-row[data-id="${noteRow.id}"] .pc-draw-rec-eye`);
    await page.waitForTimeout(150);
    const s2 = await snap(page);
    assert(s2.notePins === pinsBefore, `再點一次應回到原狀（${pinsBefore}），實際 ${s2.notePins}`);
  });

  // ── 新畫一筆未送的 → 篩選才有東西可分 ────────────────────────────────────────
  await page.evaluate(() => window.__api.setTool('rect'));
  await dragDraw(page, 340, 220, 420, 280);

  await test('篩選：待送只看到未送那筆、已送只看到送過的、全部看得到全部', async () => {
    await page.click('.pc-draw-rec-filter[data-filter="pending"]');
    await page.waitForTimeout(120);
    const pend = await snap(page);
    console.log('     pending rows:', pend.rows.map(r => r.text));
    assert(pend.rows.length === 1 && !pend.rows[0].sent, `待送應只剩 1 列未送，實際 ${pend.rows.length}`);
    await page.click('.pc-draw-rec-filter[data-filter="sent"]');
    await page.waitForTimeout(120);
    const sent = await snap(page);
    console.log('     sent rows:', sent.rows.map(r => r.text));
    assert(sent.rows.length === 3 && sent.rows.every(r => r.sent), `已送應剩 3 列，實際 ${sent.rows.length}`);
    await page.click('.pc-draw-rec-filter[data-filter="all"]');
    await page.waitForTimeout(120);
    const all = await snap(page);
    assert(all.rows.length === 4, `全部應是 4 列，實際 ${all.rows.length}`);
  });

  await test('全選只作用於「待送」：勾選狀態與送出計數都不把已送的算進去', async () => {
    // 送出後 2s 內按鈕停在「✅ 已送達 AI（N 筆）」回執態（dataset.inflight），
    // 等它交還給計數態才問「送出鈕算幾筆」——否則量到的是回執文字，不是待送數。
    await page.waitForFunction(() => !document.querySelector('.pc-draw-rec-send-btn').dataset.inflight, null, { timeout: 5000 });
    const s = await snap(page);
    console.log('     allBox:', JSON.stringify(s.allBox), 'sendBtn:', s.sendBtn, 'headerCount:', s.headerCount);
    assert(s.allBox.checked && !s.allBox.indeterminate, '只有 1 筆待送且已勾 → 全選框應為 checked、非 indeterminate');
    assert(s.sendBtn.includes('（1）'), `送出鈕應只算 1 筆待送，實際「${s.sendBtn}」`);
    assert(s.headerCount === '4', `標題計數＝紀錄總筆數 4，實際 ${s.headerCount}`);
  });

  // ── AI 回覆（consumer 推進來）────────────────────────────────────────────────
  await test('setAgentReplies：回覆氣泡接在它聲明的那一列下面', async () => {
    const ids = await page.evaluate(() => window.__api.getObjects().map(o => o.id));
    const n = await page.evaluate(([target]) => window.__api.setAgentReplies([
      { id: 'r1', text: '已改成 map，第 84 行', objId: target },
    ]), [ids[0]]);
    assert(n === 1, `setAgentReplies 應回傳 1，實際 ${n}`);
    await page.waitForTimeout(120);
    const s = await page.evaluate(() => {
      const kids = [...document.querySelector('.pc-draw-rec-list').children];
      return kids.map(k => k.className + '|' + (k.querySelector?.('.pc-draw-rec-text, .pc-draw-rec-reply-text')?.textContent || ''));
    });
    console.log('     list order:', JSON.stringify(s, null, 1));
    const iRow = s.findIndex(x => x.startsWith('pc-draw-rec-row'));
    const iBub = s.findIndex(x => x.startsWith('pc-draw-rec-reply'));
    assert(iBub === iRow + 1, `氣泡應緊接在對應列後面（row@${iRow} bubble@${iBub}）`);
    assert(s[iBub].includes('已改成 map'), '氣泡內容應是回覆文字');
  });

  await test('篩選「有回覆」只留下有回覆的那一列（含它的氣泡）', async () => {
    await page.click('.pc-draw-rec-filter[data-filter="replied"]');
    await page.waitForTimeout(120);
    const s = await snap(page);
    console.log('     replied rows:', s.rows.map(r => r.text), 'bubbles:', s.bubbles);
    assert(s.rows.length === 1, `有回覆應只剩 1 列，實際 ${s.rows.length}`);
    assert(s.bubbles.length === 1 && s.bubbles[0].includes('已改成 map'), '該列的氣泡要在');
    await page.click('.pc-draw-rec-filter[data-filter="all"]');
    await page.waitForTimeout(120);
  });

  await test('沒聲明對象的回覆不亂猜：列在「未指定標注的回覆」區', async () => {
    await page.evaluate(() => window.__api.setAgentReplies([{ id: 'r9', text: '這則沒指定對象' }]));
    await page.waitForTimeout(120);
    const s = await snap(page);
    console.log('     orphanHd:', s.orphanHd, 'bubbles:', s.bubbles);
    assert(s.orphanHd, '應出現「未指定標注的回覆」標頭');
    assert(s.bubbles.length === 1 && s.bubbles[0].includes('沒指定對象'), '該回覆仍要看得到（不可被丟掉）');
    const inTimeline = await page.evaluate(() => {
      const kids = [...document.querySelector('.pc-draw-rec-list').children];
      const hd = kids.findIndex(k => k.className === 'pc-draw-rec-orphan-hd');
      return kids.slice(0, hd).filter(k => k.className === 'pc-draw-rec-reply').length;
    });
    assert(inTimeline === 0, `未指定對象的回覆不可掛在任何一列下面，實際掛了 ${inTimeline} 則`);
  });

  // ── 降級：沒有 setAgentReplies 的 consumer ──────────────────────────────────
  await test('降級：consumer 從不呼叫 setAgentReplies → 面板照常、零氣泡、零錯誤', async () => {
    const page2 = await browser.newPage({ viewport: { width: 800, height: 600 } });
    const errs = [];
    page2.on('pageerror', e => errs.push('pageerror: ' + e.message));
    page2.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
    await page2.goto(`http://localhost:${PORT}/test/e2e/draw-layer-harness.html`);
    await page2.waitForFunction(() => window.__drawTest && window.__drawTest.ready);
    // 完全不碰 setAgentReplies，且用 live-markup draw-boot 的同一組 init 參數
    // （mode / projectId / persist / getScreenId）→ 這是三個 consumer 實際的呼叫形狀。
    await page2.evaluate(() => {
      window.__drawTest.initTeam({}, { mode: 'draw', projectId: 'degrade', getScreenId: () => 'index' });
      window.__api = window.__teamApi;
      window.__api.setTool('rect');
    });
    await dragDraw(page2, 100, 100, 180, 160);
    await page2.evaluate(() => window.__api.toggleRecordPanel());
    await page2.waitForTimeout(200);
    const s = await snap(page2);
    console.log('     rows:', s.rows.length, 'bubbles:', s.bubbles.length, 'filters:', s.filters.length, 'errs:', errs);
    assert(s.rows.length === 1, `清單應照常有 1 列，實際 ${s.rows.length}`);
    assert(s.bubbles.length === 0 && !s.orphanHd, '不應出現任何回覆氣泡或未指定區');
    assert(s.filters.length === 4, '篩選列仍在');
    // live-markup 的 review-range e2e 靠 .pc-draw-rec-sel 找列 → 這個 class 不能消失
    const selCls = await page2.evaluate(() => document.querySelectorAll('.pc-draw-rec-sel').length);
    assert(selCls >= 1, `.pc-draw-rec-sel 仍要渲染（live-markup 的 e2e 依賴它），實際 ${selCls}`);
    assert(s.sendBtn.includes('（1）'), `送出鈕照常，實際「${s.sendBtn}」`);
    // 每一顆篩選都點得動、不噴錯
    for (const v of ['pending', 'sent', 'replied', 'all']) {
      await page2.click(`.pc-draw-rec-filter[data-filter="${v}"]`);
      await page2.waitForTimeout(80);
    }
    assert(errs.length === 0, '降級路徑不可有任何錯誤：' + errs.join(' / '));
    await page2.close();
  });

  console.log(`\n${fail === 0 ? '✅' : '❌'} record-timeline: ${pass} passed, ${fail} failed`);
  if (errors.length) console.log('   page errors seen:', errors.join(' / '));
  await browser.close();
  server.close();
  process.exit(fail === 0 ? 0 : 1);
})();
