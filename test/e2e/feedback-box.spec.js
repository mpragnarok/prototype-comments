// test/e2e/feedback-box.spec.js — e2e for 回饋匣（opt-in feedbackBox）單鍵送出
//
//   node test/e2e/feedback-box.spec.js
//
// 驗證使用者原始需求「已送出標注紀錄可以跟送出給 AI 一起送出嗎」：
// 右下常駐「📮 送出回饋（N）」一顆鍵，把「畫的標註」與「選的決策」打包成一次送出——
//   - N = 未送標註 + 已選未送決策（畫一筆 + 選一個 → 顯示 2）
//   - 按一下 → 決策寫成 choice doc（drawStore.save）、標註標記已送出、顯示回執
//   - 送出後計數歸零、標註留在 getObjects()（已落盤）但從畫布隱藏
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

async function dragDraw(page, x1, y1, x2, y2) {
  await page.mouse.move(x1, y1); await page.mouse.down();
  await page.mouse.move((x1 + x2) / 2, (y1 + y2) / 2); await page.mouse.move(x2, y2); await page.mouse.up();
}

(async () => {
  await new Promise(r => server.listen(0, r));
  const PORT = server.address().port; // ephemeral → 不與平行 bg job 撞埠
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 800, height: 600 } });
  page.on('pageerror', e => console.log('     [pageerror]', e.message));
  page.on('console', m => { if (m.type() === 'error') console.log('     [browser err]', m.text()); });
  await page.goto(`http://localhost:${PORT}/test/e2e/draw-layer-harness.html`);
  await page.waitForFunction(() => window.__drawTest && window.__drawTest.ready);

  console.log('feedback-box e2e:');

  // 團隊模式（spy store）+ feedbackBox 啟用；並在 spy 上掛「已送 doc」捕捉陣列供斷言。
  await page.evaluate(() => {
    window.__drawTest.initTeam({}, { feedbackBox: true });
    window.__savedDocs = [];
    const spy = window.__teamSpy;
    const realSave = spy.save.bind(spy);
    spy.save = (d) => { window.__savedDocs.push(JSON.parse(JSON.stringify(d))); return realSave(d); };
  });

  await test('feedbackBox:true → 右下常駐「📮 送出回饋（0）」、空清單時 disabled', async () => {
    const r = await page.evaluate(() => {
      const el = document.querySelector('.pc-draw-feedback-box');
      return el ? { text: el.textContent, disabled: el.disabled, empty: el.classList.contains('is-empty') } : null;
    });
    console.log('     box:', JSON.stringify(r));
    assert(r, '.pc-draw-feedback-box 應存在');
    assert(r.text.includes('送出回饋（0）'), `初始應「送出回饋（0）」，實際 ${r.text}`);
    assert(r.disabled && r.empty, '空清單時應 disabled + is-empty');
  });

  await test('畫一筆 rect 標註 → 計數 +1、鈕可按', async () => {
    await page.click('.pc-draw-tool[data-tool="rect"]'); // 進 draw 模式、選 rect
    const box = await page.$('#canvas');
    const bb = await box.boundingBox();
    await dragDraw(page, bb.x + 60, bb.y + 60, bb.x + 200, bb.y + 160);
    const r = await page.evaluate(() => ({
      count: window.__teamApi.getFeedbackCount(),
      objs: window.__teamApi.getObjects().length,
      text: document.querySelector('.pc-draw-feedback-box').textContent,
      disabled: document.querySelector('.pc-draw-feedback-box').disabled,
    }));
    console.log('     after draw:', JSON.stringify(r));
    assert(r.objs === 1, `應有 1 個標註物件，實際 ${r.objs}`);
    assert(r.count === 1, `計數應 1，實際 ${r.count}`);
    assert(r.text.includes('（1）') && !r.disabled, `鈕應顯示（1）且可按，實際 ${r.text}`);
  });

  await test('addDecision（外部決策 UI 灌入）→ 計數 +1 = 2', async () => {
    const r = await page.evaluate(() => {
      window.__teamApi.addDecision({ id: 'opt-g1', optionId: 'A', optionLabel: '方案A', text: '版面配置 → 方案A（左右分欄）', anchor: 'card-layout' });
      return { count: window.__teamApi.getFeedbackCount(), decisions: window.__teamApi.getDecisions().length, text: document.querySelector('.pc-draw-feedback-box').textContent };
    });
    console.log('     after addDecision:', JSON.stringify(r));
    assert(r.decisions === 1, `決策佇列應 1，實際 ${r.decisions}`);
    assert(r.count === 2, `計數應 2（標註1+決策1），實際 ${r.count}`);
    assert(r.text.includes('（2）'), `鈕應顯示（2），實際 ${r.text}`);
  });

  await test('改選同一組決策（同 id）→ 取代、計數仍 2（不累加）', async () => {
    const r = await page.evaluate(() => {
      window.__teamApi.addDecision({ id: 'opt-g1', optionId: 'B', optionLabel: '方案B', text: '版面配置 → 方案B（上下堆疊）', anchor: 'card-layout' });
      return { count: window.__teamApi.getFeedbackCount(), decisions: window.__teamApi.getDecisions().length };
    });
    assert(r.decisions === 1 && r.count === 2, `改選應取代（決策仍 1、計數仍 2），實際 dec=${r.decisions} count=${r.count}`);
  });

  await test('按 📮 → 決策寫 choice doc + 標註標記已送 + 回執顯示', async () => {
    await page.evaluate(() => { window.__savedDocs.length = 0; }); // 只捕捉這次送出寫的 doc
    await page.click('.pc-draw-feedback-box');
    await page.waitForFunction(() => document.querySelector('.pc-draw-feedback-box').textContent.includes('已送出'), { timeout: 4000 });
    const r = await page.evaluate(() => ({
      text: document.querySelector('.pc-draw-feedback-box').textContent,
      sent: document.querySelector('.pc-draw-feedback-box').classList.contains('is-sent'),
      saved: window.__savedDocs,
      count: window.__teamApi.getFeedbackCount(),
      objs: window.__teamApi.getObjects().length,
      svgRects: document.querySelectorAll('#pc-draw [data-id]').length,
    }));
    console.log('     receipt:', r.text, '| saved:', JSON.stringify(r.saved));
    // 回執：2 筆（決策 1 · 標註 1）
    assert(r.text.includes('已送出 2 筆'), `回執應「已送出 2 筆」，實際 ${r.text}`);
    assert(r.text.includes('決策 1') && r.text.includes('標註 1'), `回執應標明「決策 1 · 標註 1」，實際 ${r.text}`);
    assert(r.sent, '回執時應有 is-sent class');
    // 決策落盤成 choice doc（agent 讀得到的 pc-draw.json 格式）
    const choice = r.saved.find(d => d.tool === 'choice');
    assert(choice, `應寫入一筆 tool:'choice' doc，實際 saved=${JSON.stringify(r.saved)}`);
    assert(choice.id === 'decision-opt-g1', `choice doc id 應 stable「decision-opt-g1」，實際 ${choice.id}`);
    assert(choice.text.includes('方案B'), `choice doc 應帶最新選擇（方案B）的文字，實際 ${choice.text}`);
    // 標註：仍在 getObjects()（早已落盤）但已從畫布隱藏（isSent）
    assert(r.objs === 1, `標註應留在 getObjects()（已落盤），實際 ${r.objs}`);
    assert(r.svgRects === 0, `已送標註應從畫布隱藏，實際 svg 內仍有 ${r.svgRects} 個`);
    assert(r.count === 0, `送出後未送計數應歸零，實際 ${r.count}`);
  });

  await test('回執淡出後 → 回到「📮 送出回饋（0）」disabled 常駐態', async () => {
    await page.waitForFunction(() => {
      const el = document.querySelector('.pc-draw-feedback-box');
      return el && el.textContent.includes('送出回饋（0）') && !el.classList.contains('is-sent');
    }, { timeout: 4000 });
    const r = await page.evaluate(() => ({ disabled: document.querySelector('.pc-draw-feedback-box').disabled }));
    assert(r.disabled, '歸零後應 disabled');
  });

  await test('setFeedbackBox(false) → 移除；setFeedbackBox(true) → 重建', async () => {
    const r = await page.evaluate(() => {
      window.__teamApi.setFeedbackBox(false);
      const gone = !document.querySelector('.pc-draw-feedback-box');
      window.__teamApi.setFeedbackBox(true);
      const back = !!document.querySelector('.pc-draw-feedback-box');
      return { gone, back };
    });
    assert(r.gone, 'setFeedbackBox(false) 應移除鈕');
    assert(r.back, 'setFeedbackBox(true) 應重建鈕');
  });

  await browser.close();
  await new Promise(r => server.close(r));
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
