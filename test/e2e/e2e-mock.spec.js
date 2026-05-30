// test/e2e/e2e-mock.spec.js — e2e with in-memory Firebase mock（無真 Firebase / 無網路）
//
//   node test/e2e/e2e-mock.spec.js
//
// 起本地 http server serve repo root（避開 file:// ESM CORS），playwright goto harness，
// 用 window.__pcTest 注入 mock + init + 操作，斷言真實 JS render 行為。
import { chromium } from 'playwright';
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const PORT = 8123;
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.json': 'application/json' };

const server = http.createServer((req, res) => {
  const rel = decodeURIComponent(req.url.split('?')[0]);
  const p = path.join(ROOT, rel);
  if (!p.startsWith(ROOT) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); res.end('not found'); return; }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' });
  fs.createReadStream(p).pipe(res);
});

let pass = 0, fail = 0;
async function test(name, fn) {
  try { await fn(); console.log('  ✓', name); pass++; }
  catch (e) { console.error('  ✗', name, '\n     ', e.message); fail++; }
}
function assert(cond, msg) { if (!cond) throw new Error(msg || 'assertion failed'); }

const USER = { uid: 'u1', email: 'a@e2e.local', displayName: '設計師 A' };
const seedComment = (over = {}) => ({ type: 'positional', screenId: 's1', x: 50, y: 50, body: '測試留言', authorUid: 'u1', authorName: '設計師 A', resolved: false, parentId: null, ...over });

(async () => {
  await new Promise(r => server.listen(PORT, r));
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 375, height: 700 } });
  page.on('console', m => { const t = m.text(); if (m.type() === 'error' || t.includes('[pc]')) console.log('     [browser]', t); });
  page.on('pageerror', e => console.log('     [pageerror]', e.message));
  await page.goto(`http://localhost:${PORT}/test/e2e/harness.html`);
  await page.waitForFunction(() => window.__pcTest && window.__pcTest.ready);

  console.log('e2e (mock firebase):');

  await test('seeded comment → pin renders with 💬 label', async () => {
    await page.evaluate(({ user, comment }) => {
      const fb = window.__pcTest.createMockFirebase({ user, comments: [comment] });
      window.__fb = fb;
      return window.__pcTest.init(fb);
    }, { user: USER, comment: seedComment() });
    // 模擬消費端畫面載入：觸發 overlay mount + renderPins（mock onSnapshot 已同步餵入資料）
    await page.evaluate(() => document.dispatchEvent(new CustomEvent('pc:screen-change', { detail: {} })));
    await page.waitForTimeout(600);
    const diag = await page.evaluate(() => ({
      overlay: !!document.getElementById('pc-overlay'),
      pins: document.querySelectorAll('.pc-pin').length,
      fbDocs: window.__fb && window.__fb.__docs(),
      phone: !!document.querySelector('#phone'),
    }));
    console.log('     DIAG', JSON.stringify(diag));
    await page.waitForSelector('.pc-pin', { timeout: 4000 });
    const label = await page.locator('.pc-pin .pc-pin-label').first().textContent();
    assert(/💬/.test(label), `expected 💬 in pin label, got "${label}"`);
  });

  await test('resolved pin → 深灰底白字 #6b7280（A7 對比度修正 + #3 跑版重現）', async () => {
    await page.evaluate(() => {
      window.__fb.__seed({ type: 'positional', screenId: 's1', x: 30, y: 30, body: '已完成', authorUid: 'u1', authorName: '設計師 A', resolved: true, parentId: null });
      document.dispatchEvent(new CustomEvent('pc:screen-change', { detail: {} }));
    });
    await page.waitForTimeout(300);
    const info = await page.evaluate(() => {
      const r = [...document.querySelectorAll('.pc-pin')].find(p => p.classList.contains('resolved'));
      if (!r) return { found: false };
      const cs = getComputedStyle(r);
      const tail = getComputedStyle(r, '::before');
      return { found: true, label: r.textContent, bg: cs.backgroundColor, color: cs.color, tailColor: tail.borderTopColor };
    });
    console.log('     resolved pin:', JSON.stringify(info));
    assert(info.found, 'resolved pin not rendered');
    // A7：對比度修正 — 深灰底 #6b7280 + 白字（取代舊 #d1d5db 灰字，對比僅 2.5:1 看不清）。
    // 紅=rgb(186,26,26) 即重現 #3 跑版（resolved 沒套到灰）。
    assert(info.bg === 'rgb(107, 114, 128)', `resolved pin 泡泡應深灰 #6b7280，實際 ${info.bg}（紅=rgb(186,26,26) 即重現跑版）`);
    assert(info.color === 'rgb(255, 255, 255)', `resolved pin 文字應白色（對比度達 AA），實際 ${info.color}`);
    assert(info.tailColor === 'rgb(107, 114, 128)', `resolved pin 尾巴應同深灰 #6b7280，實際 ${info.tailColor}`);
  });

  await test('long-press drag → 自己未解決 pin 位置更新 (#6 drag 收尾)', async () => {
    const pin = page.locator('.pc-pin:not(.resolved)').first();
    const box = await pin.boundingBox();
    assert(box, 'unresolved pin not found');
    const cx = box.x + box.width / 2, cy = box.y + box.height / 2;
    await page.mouse.move(cx, cy);
    await page.mouse.down();
    await page.waitForTimeout(650);              // > 500ms 進入 drag
    await page.mouse.move(cx + 50, cy + 70, { steps: 6 });
    await page.mouse.up();
    await page.waitForTimeout(250);
    const c = await page.evaluate(() => window.__fb.__docs().find(d => d.type === 'positional' && !d.parentId && !d.resolved));
    console.log('     dragged pos:', JSON.stringify({ x: c.x, y: c.y }));
    assert(c.x !== 50 || c.y !== 50, `pin 應已移動（原 x:50,y:50），實際 ${JSON.stringify({ x: c.x, y: c.y })}`);
  });

  await test('resolved pin 與未解決 pin 同寬（對齊，icon 固定寬）', async () => {
    await page.mouse.move(2, 2);          // 移開游標，避免 :hover scale(1.2) 干擾寬度量測
    await page.waitForTimeout(120);
    const w = await page.evaluate(() => {
      const un = document.querySelector('.pc-pin:not(.resolved)');
      const re = document.querySelector('.pc-pin.resolved');
      return { un: un && un.getBoundingClientRect().width, re: re && re.getBoundingClientRect().width };
    });
    console.log('     pin widths 💬/✓:', JSON.stringify(w));
    assert(w.un && w.re, 'both pins required');
    assert(Math.abs(w.un - w.re) < 2, `resolved 應與未解決同寬，💬=${w.un} ✓=${w.re}`);
  });

  await test('回覆 thread popover 送出後 popover 不關閉、回覆即時出現 (#4)', async () => {
    await page.mouse.move(2, 2);                       // 避開 hover
    await page.waitForTimeout(120);
    const pin = page.locator('.pc-pin:not(.resolved)').first();
    await pin.click();                                 // 點 pin 開 thread popover
    await page.waitForSelector('.pc-popover .pc-textarea', { timeout: 3000 });
    await page.fill('.pc-popover .pc-textarea', '我是一則回覆 #4');
    await page.click('.pc-popover .pc-btn-submit');    // 送出回覆
    await page.waitForTimeout(400);
    const r = await page.evaluate(() => ({
      popOpen: !!document.querySelector('.pc-popover'),
      replyShown: [...document.querySelectorAll('.pc-popover .pc-ci-text')].some(e => e.textContent.includes('我是一則回覆 #4')),
      taCleared: (document.querySelector('.pc-popover .pc-textarea') || {}).value === '',
    }));
    console.log('     reply popover:', JSON.stringify(r));
    assert(r.popOpen, '回覆送出後 thread popover 不該自動關閉（#4 根因：submit 後 closeAllPopovers）');
    assert(r.replyShown, '回覆送出後應即時顯示在 thread 內（snapshot refresh）');
    assert(r.taCleared, '回覆送出後 textarea 應清空，方便連續回覆');
  });

  await test('B5 桌機 hover chip → 名單 popover；click → toggle (#5)', async () => {
    const cid = await page.evaluate(() => window.__fb.__seed({ type: 'positional', screenId: 's1', x: 80, y: 15, body: '有反應的留言', authorUid: 'u2', authorName: '設計師 B', resolved: false, parentId: null, reactions: { '👍': [{ uid: 'u2', name: '設計師 B' }] } }));
    await page.waitForTimeout(200);
    await page.click(`.pc-pin[data-comment-id="${cid}"]`);
    await page.waitForSelector('.pc-popover .pc-reaction-chip', { timeout: 3000 });
    await page.hover('.pc-popover .pc-reaction-chip');
    await page.waitForTimeout(150);
    const hov = await page.evaluate(() => {
      const p = document.querySelector('.pc-reaction-users');
      return { shown: !!p, hasName: p ? p.textContent.includes('設計師 B') : false };
    });
    console.log('     B5 desktop hover:', JSON.stringify(hov));
    assert(hov.shown, 'hover chip 應顯示名單 popover');
    assert(hov.hasName, '名單應含按過的人「設計師 B」');
    const before = await page.evaluate(c => (window.__fb.__docs().find(d => d.id === c)?.reactions?.['👍'] || []).length, cid);
    await page.click('.pc-popover .pc-reaction-chip');
    await page.waitForTimeout(250);
    const after = await page.evaluate(c => (window.__fb.__docs().find(d => d.id === c)?.reactions?.['👍'] || []).length, cid);
    console.log('     B5 desktop click toggle 👍:', before, '→', after);
    assert(after === before + 1, `click 應 toggle 自己反應（${before}→${after}，期望 +1）`);
  });

  await test('B5 手機長按 chip → 名單 popover；tap → toggle，不開名單 (#5)', async () => {
    const mctx = await browser.newContext({ viewport: { width: 375, height: 700 } });
    await mctx.addInitScript(() => {
      const orig = window.matchMedia.bind(window);
      window.matchMedia = (q) => /hover:\s*none/.test(q)
        ? { matches: true, media: q, onchange: null, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {}, dispatchEvent() { return false; } }
        : orig(q);
    });
    const mp = await mctx.newPage();
    mp.on('pageerror', e => console.log('     [m-pageerror]', e.message));
    await mp.goto(`http://localhost:${PORT}/test/e2e/harness.html`);
    await mp.waitForFunction(() => window.__pcTest && window.__pcTest.ready);
    const cid = await mp.evaluate(async ({ user }) => {
      const fb = window.__pcTest.createMockFirebase({ user, comments: [] });
      window.__fb = fb;
      await window.__pcTest.init(fb);
      return fb.__seed({ type: 'positional', screenId: 's1', x: 50, y: 50, body: '手機反應', authorUid: 'u2', authorName: '設計師 B', resolved: false, parentId: null, reactions: { '👍': [{ uid: 'u2', name: '設計師 B' }] } });
    }, { user: USER });
    await mp.evaluate(() => document.dispatchEvent(new CustomEvent('pc:screen-change', { detail: {} })));
    await mp.waitForTimeout(400);
    await mp.click(`.pc-pin[data-comment-id="${cid}"]`);
    await mp.waitForSelector('.pc-popover .pc-reaction-chip', { timeout: 3000 });
    // 長按 ≥400ms → 名單 popover
    await mp.evaluate(() => document.querySelector('.pc-popover .pc-reaction-chip').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })));
    await mp.waitForTimeout(480);
    const lpShown = await mp.evaluate(() => !!document.querySelector('.pc-reaction-users'));
    await mp.evaluate(() => document.querySelector('.pc-popover .pc-reaction-chip')?.dispatchEvent(new PointerEvent('pointerup', { bubbles: true })));
    assert(lpShown, '手機長按 chip 應顯示名單 popover');
    // 收掉名單，再測短按 tap → toggle 且不開名單
    await mp.evaluate(() => document.querySelectorAll('.pc-reaction-users').forEach(p => p.remove()));
    const before = await mp.evaluate(c => (window.__fb.__docs().find(d => d.id === c)?.reactions?.['👍'] || []).length, cid);
    await mp.evaluate(() => {
      const chip = document.querySelector('.pc-popover .pc-reaction-chip');
      chip.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
      chip.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
      chip.click();
    });
    await mp.waitForTimeout(250);
    const after = await mp.evaluate(c => (window.__fb.__docs().find(d => d.id === c)?.reactions?.['👍'] || []).length, cid);
    const tapPop = await mp.evaluate(() => !!document.querySelector('.pc-reaction-users'));
    console.log('     B5 mobile 👍:', before, '→', after, 'tapOpenedList:', tapPop);
    assert(after === before + 1, `tap 應 toggle 自己反應（${before}→${after}，期望 +1）`);
    assert(!tapPop, 'tap（短按）不該開名單 popover');
    await mctx.close();
  });

  await browser.close();
  server.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); server.close(); process.exit(1); });
