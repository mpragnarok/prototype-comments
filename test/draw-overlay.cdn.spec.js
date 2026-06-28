// test/draw-overlay.cdn.spec.js — 驗證 src/draw-overlay.js 可當 native ESM 載入並暴露 draw API
//
//   node test/draw-overlay.cdn.spec.js
//
// 起本地 http server serve repo root（模擬 netlify raw /src/），playwright 載入一個
// import '/src/draw-overlay.js' 的 fixture，斷言 initDrawLayer / drawingToDoc 為 function 且無 module load error。
import { chromium } from 'playwright';
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 8127;
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json' };

const FIXTURE = `<!doctype html><meta charset="utf-8">
<script type="module">
  import { initDrawLayer, drawingToDoc } from '/src/draw-overlay.js';
  window.__drawProbe = { init: typeof initDrawLayer, doc: typeof drawingToDoc };
</script>`;

const server = http.createServer((req, res) => {
  const rel = decodeURIComponent(req.url.split('?')[0]);
  if (rel === '/__cdn-probe.html') { res.writeHead(200, { 'Content-Type': 'text/html' }); res.end(FIXTURE); return; }
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

await new Promise(r => server.listen(PORT, r));
const browser = await chromium.launch();
const page = await browser.newPage();
const errs = [];
page.on('pageerror', e => errs.push(e.message));

await test('src/draw-overlay.js loads as native ESM and exposes initDrawLayer + drawingToDoc', async () => {
  await page.goto(`http://127.0.0.1:${PORT}/__cdn-probe.html`);
  await page.waitForFunction(() => !!window.__drawProbe, { timeout: 5000 });
  const probe = await page.evaluate(() => window.__drawProbe);
  if (errs.length) throw new Error('pageerror: ' + errs.join('; '));
  if (probe.init !== 'function') throw new Error('initDrawLayer typeof=' + probe.init);
  if (probe.doc !== 'function') throw new Error('drawingToDoc typeof=' + probe.doc);
});

await browser.close();
server.close();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
