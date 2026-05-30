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

  await test('resolved pin → 整顆灰 #d1d5db（#3 跑版重現）', async () => {
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
      return { found: true, label: r.textContent, bg: cs.backgroundColor, tailColor: tail.borderTopColor };
    });
    console.log('     resolved pin:', JSON.stringify(info));
    assert(info.found, 'resolved pin not rendered');
    assert(info.bg === 'rgb(209, 213, 219)', `resolved pin 泡泡應灰 #d1d5db，實際 ${info.bg}（紅=rgb(186,26,26) 即重現跑版）`);
  });

  await browser.close();
  server.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); server.close(); process.exit(1); });
