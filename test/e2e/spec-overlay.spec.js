// test/e2e/spec-overlay.spec.js — e2e for src/spec-overlay.js（vanilla 規格面板 shell parity）
//
//   node test/e2e/spec-overlay.spec.js
//
// 起本地 http server serve repo root，playwright goto spec-overlay-harness.html，
// 用 window.__specTest 注入 mock + initSpecOverlay，斷言 FAB/抽屜/notes/focus/click-outside。
// （留言 WRITE / note-jump 需 Google 登入，留給線上人工驗。）
import { chromium } from 'playwright';
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const PORT = 8124;
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

const USER = { uid: 'u1', email: 'a@e2e.local', displayName: '設計師 A' };
const SPEC = {
  title: '測試 Protocol',
  desc: '測試用 spec',
  devNotes: [
    { tag: '新增', text: '有聚焦目標的 note', focus: 'input[name="reminder[0].overdueAfter"]' },
    { tag: '修改', text: '沒有聚焦目標的 note' },
    { tag: '注意事項', text: '第三則' },
  ],
};

(async () => {
  await new Promise(r => server.listen(PORT, r));
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1024, height: 768 } });
  page.on('pageerror', e => console.log('     [pageerror]', e.message));
  page.on('console', m => { if (m.type() === 'error') console.log('     [browser err]', m.text()); });
  await page.goto(`http://localhost:${PORT}/test/e2e/spec-overlay-harness.html`);
  await page.waitForFunction(() => window.__specTest && window.__specTest.ready);

  console.log('spec-overlay e2e (mock firebase):');

  await test('initSpecOverlay → FAB 出現（spec 有 notes）', async () => {
    await page.evaluate(({ user, spec }) => {
      const fb = window.__specTest.createMockFirebase({ user, comments: [] });
      window.__specTest.initSpecOverlay({
        getNotesForPath: () => spec,
        getPath: () => '/test',
        subscribe: () => () => {},
        navigateTo: () => {},
        firebaseConfig: {}, _firebase: fb,
      });
    }, { user: USER, spec: SPEC });
    await page.waitForSelector('.spec-fab', { timeout: 4000 });
    const hidden = await page.evaluate(() => document.querySelector('.spec-fab').hidden);
    assert(hidden === false, 'FAB 應在關閉時可見');
  });

  await test('點 FAB → 抽屜開、FAB 隱藏、渲染 3 則 eng-note-row', async () => {
    await page.click('.spec-fab');
    await page.waitForTimeout(120);
    const r = await page.evaluate(() => ({
      open: document.querySelector('.spec-drawer').classList.contains('open'),
      fabHidden: document.querySelector('.spec-fab').hidden,
      rows: document.querySelectorAll('.eng-note-row').length,
      tags: [...document.querySelectorAll('.eng-note-row')].map(x => x.dataset.tag),
      texts: [...document.querySelectorAll('.eng-note-row')].every(x => !!x.dataset.text),
      focusBtns: document.querySelectorAll('.spec-note-focus').length,
      title: document.querySelector('.spec-route-title')?.textContent,
    }));
    console.log('     drawer:', JSON.stringify(r));
    assert(r.open, '抽屜應開啟');
    assert(r.fabHidden, 'FAB 開啟時應隱藏');
    assert(r.rows === 3, `應有 3 row，實際 ${r.rows}`);
    assert(r.texts, '每 row 應有 data-text');
    assert(r.focusBtns === 1, `只有 1 則有 focus，實際 ${r.focusBtns}`);
    assert(r.title === '測試 Protocol', `title 不符: ${r.title}`);
  });

  await test('點 🔦 → 目標元件加 .spec-focus-flash', async () => {
    await page.click('.spec-note-focus');
    await page.waitForTimeout(80);
    const flashed = await page.evaluate(() => document.getElementById('focus-target').classList.contains('spec-focus-flash'));
    assert(flashed, '聚焦目標應加上 spec-focus-flash');
  });

  await test('點側欄外 → 抽屜關閉、FAB 復現', async () => {
    await page.waitForTimeout(80);
    await page.mouse.click(200, 400); // #root 區域，非抽屜/FAB
    await page.waitForTimeout(120);
    const r = await page.evaluate(() => ({
      open: document.querySelector('.spec-drawer').classList.contains('open'),
      fabHidden: document.querySelector('.spec-fab').hidden,
    }));
    assert(!r.open, 'click-outside 應關閉抽屜');
    assert(!r.fabHidden, '關閉後 FAB 應復現');
  });

  await test('pc.js 已被內部 init（pc-overlay 掛上）', async () => {
    const has = await page.evaluate(() => !!document.getElementById('pc-overlay'));
    assert(has, 'spec-overlay 應已內部 init pc.js');
  });

  await browser.close();
  server.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
