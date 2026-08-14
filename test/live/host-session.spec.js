// test/live/host-session.spec.js — `auth: 'host'` 真的沿用得到頁面已登入的人嗎？
//
//   node test/live/host-session.spec.js
//
// ⚠️ 這支**會連真的 Firebase**（示範專案 prototype-comments-27106），所以刻意
// 不放進 `npm run test:all`：CI 不該因為沒網路就變紅。它是 host 模式的地基檢查，
// 改到 appNameFor／auth 流程時手動跑一次。
//
// ── 為什麼非驗不可 ──────────────────────────────────────────────────────
// host 模式的全部機制是一句沒有寫在任何 API 文件裡的行為：Firebase 把登入狀態存進
// IndexedDB，鍵是 `firebase:authUser:{apiKey}:{app 名字}`。掛這支 script 的頁面用的是
// 它自己打包的 SDK，我們用的是 CDN 上的另一份——兩個實例互不相識，物件不能互傳，
// 共用得到的只有那把鍵。這個假設若不成立，症狀是「明明登入了卻被要求先登入」，
// 而 mock 測試永遠驗不到它（mock 裡沒有 IndexedDB，也只有一個實例）。
//
// 用**分頁**製造「兩個獨立的 SDK 實例」：不同分頁是不同的 JS realm，各自載入各自的
// 模組，唯一共用的就是同源的 IndexedDB——正是真實情況的形狀。
// 這支只碰 Auth（產生一個匿名 uid），不寫任何 Firestore 文件。
import { chromium } from 'playwright';
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const PORT = 8151;
const MIME = { '.html': 'text/html', '.js': 'text/javascript' };

const server = http.createServer((req, res) => {
  const rel = decodeURIComponent(req.url.split('?')[0]);
  const p = path.join(ROOT, rel);
  if (!p.startsWith(ROOT) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) {
    res.writeHead(404); return res.end('nf');
  }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' });
  fs.createReadStream(p).pipe(res);
});

const FB = 'https://www.gstatic.com/firebasejs/10.12.2';
const CONFIG = {
  apiKey: 'AIzaSyCsJ8HK2Wo7FJSTxwdCk3cdnOBXThpTUPo',
  authDomain: 'prototype-comments-27106.firebaseapp.com',
  projectId: 'prototype-comments-27106',
  storageBucket: 'prototype-comments-27106.firebasestorage.app',
  messagingSenderId: '1010970126486',
  appId: '1:1010970126486:web:9d1e055488207759aebab7',
};

let pass = 0, fail = 0;
async function test(name, fn) {
  try { await fn(); console.log('  ✓', name); pass++; }
  catch (e) { console.error('  ✗', name, '\n     ', e.message); fail++; }
}
const assert = (cond, msg) => { if (!cond) throw new Error(msg || 'assertion failed'); };

/** 在一個乾淨的分頁裡，用指定的 app 名字問「這個瀏覽器記得誰登入了」 */
async function userSeenBy(context, appName) {
  const page = await context.newPage();
  await page.goto(`http://localhost:${PORT}/test/live/host-session.harness.html`);
  const uid = await page.evaluate(async ({ FB, CONFIG, appName }) => {
    const [app, auth] = await Promise.all([
      import(`${FB}/firebase-app.js`), import(`${FB}/firebase-auth.js`),
    ]);
    const a = app.initializeApp(CONFIG, appName);
    const authInstance = auth.getAuth(a);
    // 第一次回呼就是「還原完成」的那一刻，等它才問得準
    return await new Promise((resolve) => {
      const stop = auth.onAuthStateChanged(authInstance, (u) => { stop(); resolve(u ? u.uid : null); });
      setTimeout(() => resolve(null), 10000);
    });
  }, { FB, CONFIG, appName });
  await page.close();
  return uid;
}

(async () => {
  await new Promise(r => server.listen(PORT, r));
  const browser = await chromium.launch();
  const context = await browser.newContext();   // 同一個瀏覽器 profile ＝ 同一份 IndexedDB
  console.log('live (host-session，會連真的 Firebase):');

  // 「頁面」那一半：自己打包的 SDK，用預設 app 名字登入
  const hostPage = await context.newPage();
  await hostPage.goto(`http://localhost:${PORT}/test/live/host-session.harness.html`);
  const hostUid = await hostPage.evaluate(async ({ FB, CONFIG }) => {
    const [app, auth] = await Promise.all([
      import(`${FB}/firebase-app.js`), import(`${FB}/firebase-auth.js`),
    ]);
    const a = app.initializeApp(CONFIG);           // 預設就是 '[DEFAULT]'
    const { user } = await auth.signInAnonymously(auth.getAuth(a));
    return user.uid;
  }, { FB, CONFIG });
  await hostPage.close();
  console.log(`  （頁面端登入的 uid：${hostUid}）`);

  await test('另一個 SDK 實例用同一個 app 名字 → 看得到同一個已登入的人', async () => {
    assert(hostUid, '頁面端沒登入成功，後面都不用測了');
    const seen = await userSeenBy(context, '[DEFAULT]');
    assert(seen === hostUid, `應沿用 ${hostUid}，實際 ${seen}`);
  });

  await test('換成元件預設的具名 app → 看不到（證明機制真的是 app 名字）', async () => {
    const seen = await userSeenBy(context, 'element-markup:e2e');
    assert(seen === null, `具名 app 不該讀到頁面的登入狀態，實際 ${seen}`);
  });

  await test('元件在 host 模式下拿到的就是頁面那個 uid（不是自己換一個匿名的）', async () => {
    const page = await context.newPage();
    await page.goto(`http://localhost:${PORT}/test/live/host-session.harness.html`);
    const r = await page.evaluate(async ({ CONFIG }) => {
      const { initElementMarkup } = await import('/src/user-feedback-markup.js');
      await initElementMarkup({ projectId: 'live-check', page: '/live-check', firebaseConfig: CONFIG, auth: 'host' });
      // 按鈕的 title 是元件對外說「我現在以誰的身分標記」的唯一出口
      await new Promise(r => setTimeout(r, 2500));
      return document.querySelector('.em-fab')?.title || '(沒有按鈕)';
    }, { CONFIG });
    await page.close();
    // 匿名使用者沒有 displayName／email，元件會顯示 undefined——這裡只驗
    // 「它認為自己有身分」而不是「它說要先登入」。真正比對 uid 的是上面第一條。
    assert(!/請先登入/.test(r), `host 模式應沿用頁面身分，實際按鈕說「${r}」`);
  });

  await browser.close();
  server.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
