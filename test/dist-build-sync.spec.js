// test/dist-build-sync.spec.js — 驗證 dist/pc.js 與 src/ 目前狀態一致（未漏 rebuild）
//
//   node test/dist-build-sync.spec.js
//
// 背景：dist/pc.js 是 build.py 從 src/ 手動產生並 commit 進 repo 的產物，不是 CI 自動 build——
// merge 一個改動 src 的 PR 後若忘記重跑 `python3 build.py`，dist/pc.js 會悄悄落後 src（曾發生：
// note-range 的 openRangeNote、Esc 收合工具列 都各自有一次「src 已改、dist 忘了重建」的視窗期）。
// jubo-line-badminton-check-in-system 與部分 e2e harness 直接吃 dist/pc.js，落後即靜默拿到舊行為。
//
// 作法：呼叫 build.py 內部的 build()/stamp() 純函式在記憶體算出「此刻 src/ 應該產出的 bundle」
// （用 -c inline script，NEVER 呼叫 build.py 的 main()／CLI——它會無條件覆寫 dist/pc.js 當第二
// target，若拿它來產生比對基準，等於先斬後奏把 dist 修好了才比，測試永遠 PASS，抓不到落後）。
// 抹掉兩邊都會變動的 provenance header（git sha + build UTC 時間戳）後逐字比對——只要 src 有變而
// dist 沒跟著重建，這裡就會不同而 FAIL。
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST_PC_JS = path.join(ROOT, 'dist', 'pc.js');

const INLINE_BUILD = `
import sys, build
from datetime import datetime, timezone
result, order = build.build()
sha = build.git_sha()
built_utc = datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')
sys.stdout.write(build.stamp(result, sha, built_utc))
`;

// 檔頭 `/* pc.js <sha> <ISO timestamp> */` 與內文一次性 `PC_VERSION = '<sha>'` 兩邊必然不同
// （sha/時間隨每次 build 變動），比對前先正規化掉，只留「build.py 從 src 產出的程式碼本體」。
function normalize(text) {
  return text
    .replace(/^\/\* pc\.js (?:[0-9a-f]+|unknown) [^*]* \*\/\n/, '')
    .replace(/PC_VERSION = '(?:[0-9a-f]+|unknown)'/, "PC_VERSION = 'X'");
}

let pass = 0, fail = 0;
function test(name, fn) {
  try { fn(); console.log('  ✓', name); pass++; }
  catch (e) { console.error('  ✗', name, '\n     ', e.message); fail++; }
}

test('committed dist/pc.js matches a fresh in-memory build.py bundle from current src/ (no file writes)', () => {
  const fresh = normalize(execFileSync('python3', ['-c', INLINE_BUILD], { cwd: ROOT, encoding: 'utf8' }));
  const committed = normalize(readFileSync(DIST_PC_JS, 'utf8'));
  if (fresh !== committed) {
    const fi = fresh.split('\n'), ci = committed.split('\n');
    let at = 0;
    while (at < fi.length && at < ci.length && fi[at] === ci[at]) at++;
    throw new Error(
      `dist/pc.js is stale — src/ has changed since the last \`python3 build.py\` commit.\n` +
      `     first divergent line ${at + 1}:\n` +
      `       fresh build : ${fi[at] ?? '(eof)'}\n` +
      `       dist/pc.js  : ${ci[at] ?? '(eof)'}\n` +
      `     Fix: run \`python3 build.py dist/pc.js\` and commit the result.`
    );
  }
});

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
