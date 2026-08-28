// test/e2e/record-send-scope.spec.js — 標注紀錄面板「送出範圍」的守門
//
//   node test/e2e/record-send-scope.spec.js
//
// 釘住五件事（前三件是審查抓到的破口，改動前全部沒有測試守著）：
//   1. 眼睛鈕隱藏的**未送**標注/註記不進送出範圍——截圖看不到它，payload 也不該有它
//      （isCaptureExcluded 宣告的 invariant：截圖＝送出內容）
//   2. 取消隱藏 → 自動回到送出範圍（排除法是非破壞性的，不動使用者自己勾的勾選框）
//   3. 已送出且未再改的標注/註記不會被重複送（送出後按眼睛鈕還原到畫布，也仍然不重送）
//   4. 空狀態文案跟著總筆數更新（「尚無標注」↔「這個篩選下沒有標注」）
//   5. 只有「未指定標注的回覆」時，置頂截圖預覽仍會被填內容（不是空框）
//   附帶：註記的隱藏狀態會落盤（noteToDoc），重新訂閱後仍隱藏
import { chromium } from 'playwright';
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json' };

// 假的 agent endpoint：把每次 POST 的 body 收下來 → 測試直接讀（同一個 node process）。
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
})));
const sendBtnText = page => page.evaluate(() => document.querySelector('.pc-draw-rec-send-btn').textContent);
// 送出鈕按下後 2 秒停在回執態（dataset.inflight）→ 等它交還給計數態再讀筆數
const settle = page => page.waitForFunction(() => !document.querySelector('.pc-draw-rec-send-btn').dataset.inflight, null, { timeout: 8000 });
const clickEye = (page, id) => page.click(`.pc-draw-rec-row[data-id="${id}"] .pc-draw-rec-eye`);

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

  console.log('record-send-scope e2e（送出範圍守門）:');

  await page.evaluate(() => {
    window.__api = window.__drawTest.init({ mode: 'draw' });
    window.__api.setExportEndpoint('/agent-endpoint');
    window.__api.toggleRecordPanel();
  });

  // ── 1. 隱藏的未送「標注」不該被送出 ───────────────────────────────────────────
  await test('隱藏一筆未送標注：送出筆數少一，payload 不含它', async () => {
    await page.evaluate(() => { window.__api.clear(); window.__api.setTool('rect'); });
    await dragDraw(page, 100, 100, 180, 160);
    await dragDraw(page, 220, 100, 300, 160);
    await page.waitForTimeout(120);
    const before = await rowsOf(page);
    assert(before.length === 2, `應有 2 列，實際 ${before.length}`);
    const btn2 = await sendBtnText(page);
    assert(btn2.includes('（2）'), `隱藏前送出鈕應算 2 筆，實際「${btn2}」`);

    const hiddenId = before[0].id;
    await clickEye(page, hiddenId);
    await page.waitForTimeout(150);
    const btn1 = await sendBtnText(page);
    console.log('     隱藏後 sendBtn:', btn1);
    assert(btn1.includes('（1）'), `隱藏一筆後送出鈕應算 1 筆，實際「${btn1}」`);

    const n0 = posts.length;
    await page.click('.pc-draw-rec-send-btn');
    await page.waitForTimeout(1200);
    assert(posts.length === n0 + 1, `應送出一次，實際新增 ${posts.length - n0} 次 POST`);
    const anns = posts[posts.length - 1].json.annotations;
    console.log('     payload annotation ids:', JSON.stringify(anns.map(a => a.id)), '隱藏的是', hiddenId);
    assert(anns.length === 1, `payload 應只含 1 筆標注，實際 ${anns.length}`);
    assert(!anns.some(a => String(a.id) === String(hiddenId)), `隱藏的標注 ${hiddenId} 不該出現在 payload`);
    await settle(page);
  });

  // ── 2. 隱藏的未送「註記」不該被送出；取消隱藏後自動回到送出範圍 ─────────────────
  await test('隱藏一筆未送註記：payload.notes 不含它；取消隱藏後又回到送出範圍', async () => {
    await page.evaluate(() => {
      window.__api.clear();
      window.__api.addNote('註記甲', { sel: '#price-card', relX: 0.3, relY: 0.3 });
      window.__api.addNote('註記乙', { sel: '#price-card', relX: 0.6, relY: 0.6 });
    });
    await page.waitForTimeout(150);
    const rows = await rowsOf(page);
    assert(rows.length === 2, `應有 2 列註記，實際 ${rows.length}`);
    const hiddenId = rows.find(r => r.text.includes('註記甲')).id;
    await clickEye(page, hiddenId);
    await page.waitForTimeout(150);

    const p1 = await page.evaluate(() => window.__api.buildExport());
    console.log('     隱藏後 notes:', JSON.stringify((p1.notes || []).map(n => n.text)));
    assert((p1.notes || []).length === 1, `隱藏後 payload.notes 應只剩 1 筆，實際 ${(p1.notes || []).length}`);
    assert(!p1.notes.some(n => n.text === '註記甲'), '隱藏的註記不該出現在 payload.notes');
    // 勾選框沒被動過（排除法非破壞性）
    const stillChecked = await page.evaluate(id => document.querySelector(`.pc-draw-rec-row[data-id="${id}"] .pc-draw-rec-check`).checked, hiddenId);
    assert(stillChecked, '隱藏不該連帶取消勾選（勾選框要維持原樣）');

    await clickEye(page, hiddenId); // 取消隱藏
    await page.waitForTimeout(150);
    const p2 = await page.evaluate(() => window.__api.buildExport());
    console.log('     取消隱藏後 notes:', JSON.stringify((p2.notes || []).map(n => n.text)));
    assert((p2.notes || []).length === 2, `取消隱藏後應回到 2 筆，實際 ${(p2.notes || []).length}`);
  });

  // ── 3. 送出去重：已送未改者不會被重複送（含送出後按眼睛鈕還原到畫布的情況）────────
  await test('已送出且未再改：再送一次不會重複送（標注 + 註記）', async () => {
    await page.evaluate(() => { window.__api.clear(); window.__api.setTool('rect'); });
    await dragDraw(page, 120, 220, 200, 280);
    await page.evaluate(() => window.__api.addNote('去重註記', { sel: '#price-card', relX: 0.5, relY: 0.5 }));
    await page.waitForTimeout(150);
    const n0 = posts.length;
    await page.click('.pc-draw-rec-send-btn');
    await page.waitForTimeout(1200);
    assert(posts.length === n0 + 1, `第一次送出應產生 1 筆 POST，實際 ${posts.length - n0}`);
    const first = posts[posts.length - 1].json;
    assert(first.annotations.length === 1 && (first.notes || []).length === 1,
      `第一次應送出 1 標注 + 1 註記，實際 ${first.annotations.length} / ${(first.notes || []).length}`);
    await settle(page);

    // 送出後標注被「收納」（hidden）→ 按眼睛鈕還原到畫布：此時它是「已送、未隱藏」，
    // 只剩 !isSent 這一道在把關重複送。這正是審查者拿掉 !isSent 後仍全綠的那個破口。
    const rows = await rowsOf(page);
    const annRow = rows.find(r => !r.text.includes('註記'));
    assert(annRow.eyeOff, '送出後標注應處於收納（眼睛關）狀態');
    await clickEye(page, annRow.id);
    await page.waitForTimeout(150);
    const back = await rowsOf(page);
    assert(!back.find(r => r.id === annRow.id).eyeOff, '應已還原到畫布（眼睛開）');

    const p = await page.evaluate(() => window.__api.buildExport());
    console.log('     還原後再算一次 payload:', JSON.stringify({ ann: p.annotations.length, notes: (p.notes || []).length }));
    assert(p.annotations.length === 0, `已送未改的標注不該再進送出範圍，實際 ${p.annotations.length} 筆`);
    assert((p.notes || []).length === 0, `已送未改的註記不該再進送出範圍，實際 ${(p.notes || []).length} 筆`);

    const before2 = posts.length;
    const res = await page.evaluate(() => window.__api.sendToAgent());
    await page.waitForTimeout(400);
    console.log('     第二次 sendToAgent → sent:', res.sent, 'posts 新增:', posts.length - before2);
    assert(res.sent === false, '沒有可送的東西 → 不該真的送出');
    assert(posts.length === before2, `第二次不該產生新的 POST，實際新增 ${posts.length - before2}`);
  });

  // ── 4. 空狀態文案跟著總筆數更新 ───────────────────────────────────────────────
  await test('空狀態文案：清空 → 切「已送」→ 畫一筆新的 → 文案從「尚無標注」變「這個篩選下沒有標注」', async () => {
    await page.evaluate(() => { window.__api.clear(); window.__api.setRecordFilter('sent'); });
    await page.waitForTimeout(150);
    const t0 = await page.evaluate(() => document.querySelector('.pc-draw-rec-empty')?.textContent);
    console.log('     清空後空狀態:', t0);
    assert(t0 === '尚無標注', `一筆都沒有時應顯示「尚無標注」，實際「${t0}」`);
    await page.evaluate(() => window.__api.setTool('rect'));
    await dragDraw(page, 320, 200, 400, 260);
    await page.waitForTimeout(200);
    const t1 = await page.evaluate(() => document.querySelector('.pc-draw-rec-empty')?.textContent);
    console.log('     畫一筆後空狀態:', t1);
    assert(t1 === '這個篩選下沒有標注', `有標注但被篩掉時應顯示「這個篩選下沒有標注」，實際「${t1}」`);
    await page.evaluate(() => window.__api.setRecordFilter('all'));
  });

  // ── 5. 只有孤兒回覆時，截圖預覽仍會被填內容 ─────────────────────────────────────
  await test('只有「未指定標注的回覆」時，置頂截圖預覽有內容（不是空框）', async () => {
    // 必須用全新的 page：同一個 instance 一旦拍過一次預覽，_previewUrl 就留著，
    // recordPreviewEl 不管 refreshRecordPreview 有沒有被呼叫都會直接吐一張舊 <img>——
    // 那樣這條測試會變成永遠綠的假守門。
    const page3 = await browser.newPage({ viewport: { width: 800, height: 600 } });
    const errs = [];
    page3.on('pageerror', e => errs.push('pageerror: ' + e.message));
    await page3.goto(`http://localhost:${PORT}/test/e2e/draw-layer-harness.html`);
    await page3.waitForFunction(() => window.__drawTest && window.__drawTest.ready);
    await page3.evaluate(() => {
      window.__api = window.__drawTest.init({ mode: 'draw' });
      window.__api.toggleRecordPanel();
      window.__api.setAgentReplies([{ id: 'orphan-1', text: '這則沒有指定對象' }]);
    });
    await page3.waitForTimeout(300);
    const s = await page3.evaluate(() => ({
      rows: document.querySelectorAll('.pc-draw-rec-row').length,
      orphanHd: !!document.querySelector('.pc-draw-rec-orphan-hd'),
      previewTag: document.querySelector('.pc-draw-rec-preview')?.tagName || null,
    }));
    console.log('     只有孤兒回覆時:', JSON.stringify(s));
    assert(s.rows === 0 && s.orphanHd, '前提：沒有任何可見列，只有孤兒回覆區');
    assert(s.previewTag, '預覽框應被 append');
    // refreshRecordPreview 有被呼叫 → 預覽最終長出真正的 <img src>（不是永遠停在「產生預覽中…」）
    await page3.waitForFunction(() => {
      const img = document.querySelector('img.pc-draw-rec-preview');
      return !!(img && img.src && img.src.startsWith('data:image'));
    }, null, { timeout: 20000 }).catch(() => { throw new Error('預覽框一直停在 placeholder，refreshRecordPreview 沒被呼叫'); });
    const src = await page3.evaluate(() => document.querySelector('img.pc-draw-rec-preview').src.slice(0, 24));
    console.log('     preview src:', src);
    assert(src.startsWith('data:image'), `預覽應被填上截圖，實際「${src}」`);
    assert(errs.length === 0, '不可有錯誤：' + errs.join(' / '));
    await page3.close();
  });

  // ── 附帶：註記的隱藏狀態要落盤（noteToDoc），重新訂閱後仍隱藏 ────────────────────
  await test('註記隱藏落盤：寫進 store 的 doc 帶 hidden，重新訂閱後仍是隱藏', async () => {
    const page2 = await browser.newPage({ viewport: { width: 800, height: 600 } });
    const errs = [];
    page2.on('pageerror', e => errs.push('pageerror: ' + e.message));
    await page2.goto(`http://localhost:${PORT}/test/e2e/draw-layer-harness.html`);
    await page2.waitForFunction(() => window.__drawTest && window.__drawTest.ready);
    await page2.evaluate(() => {
      window.__drawTest.initTeam({}, { mode: 'draw', projectId: 'hidden-persist' });
      window.__api = window.__teamApi;
      window.__api.toggleRecordPanel();
      window.__api.addNote('要被藏起來的註記', { sel: '#price-card', relX: 0.5, relY: 0.5 });
    });
    await page2.waitForTimeout(250);
    const noteId = await page2.evaluate(() => window.__api.getNotes()[0].id);
    await page2.click(`.pc-draw-rec-row[data-id="${noteId}"] .pc-draw-rec-eye`);
    await page2.waitForTimeout(250);
    const doc = await page2.evaluate(id => window.__teamFb.__docs().find(d => d.id === id), noteId);
    console.log('     落盤 doc:', JSON.stringify(doc && { id: doc.id, kind: doc.kind, hidden: doc.hidden }));
    assert(doc && doc.hidden === true, `寫進 store 的 note doc 應帶 hidden:true，實際 ${JSON.stringify(doc)}`);

    // 重新訂閱（銷毀 → 清掉本地快取 → 用同一個 store 重建）：hidden 只能從 doc 還原
    await page2.evaluate(() => { window.__api.destroy(); localStorage.clear(); });
    await page2.evaluate(() => {
      window.__api = window.__drawTest.initDrawLayer('#canvas', { mode: 'draw', projectId: 'hidden-persist', persist: window.__teamSpy });
    });
    await page2.waitForTimeout(400);
    const restored = await page2.evaluate(id => (window.__api.getNotes().find(n => n.id === id) || null), noteId);
    console.log('     重載後 note:', JSON.stringify(restored && { id: restored.id, hidden: restored.hidden }));
    assert(restored, '註記應從 store 還原回來');
    assert(restored.hidden === true, `重載後應仍是隱藏，實際 hidden=${restored && restored.hidden}`);
    assert(errs.length === 0, '不可有錯誤：' + errs.join(' / '));
    await page2.close();
  });

  console.log(`\n${fail === 0 ? '✅' : '❌'} record-send-scope: ${pass} passed, ${fail} failed`);
  if (errors.length) console.log('   page errors seen:', errors.join(' / '));
  await browser.close();
  server.close();
  process.exit(fail === 0 ? 0 : 1);
})();
