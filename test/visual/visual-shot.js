// test/visual/visual-shot.js — pc.js 元件視覺 regression runner (ESM)
//
// 直接 import src/styles.js 的「真實」STYLES export（不複製、不正則），注入 fixture.html 後截圖。
// 比對改用 pixelmatch + pngjs：容忍 subpixel/抗鋸齒噪訊（本地 mac vs CI Linux 有差異），
// 只有「真實視覺退化」才判 DIFFER 並輸出 diff PNG。沿用 playwright library 模式（type:module）。
//
//   node test/visual/visual-shot.js            # 截到 output/，與 baselines/ pixel 比對（DIFFER → exit 1，給 CI gate）
//   node test/visual/visual-shot.js --update   # 寫入 baselines/（核可後更新基準）
//
import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import pixelmatch from 'pixelmatch';
import pngjs from 'pngjs';
import { STYLES } from '../../src/styles.js';

const { PNG } = pngjs;

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE = 'file://' + path.join(HERE, 'fixture.html');
const UPDATE = process.argv.includes('--update');
const OUT_DIR = path.join(HERE, UPDATE ? 'baselines' : 'output');
const BASE_DIR = path.join(HERE, 'baselines');

// pixelmatch 每像素差異門檻（0–1，越低越敏感）；整圖允許差異比例（容忍 subpixel 抗鋸齒噪訊）
const PIXEL_THRESHOLD = 0.1;
const MAX_DIFF_RATIO = 0.002;   // 0.2% 像素，足以擋住「pin 顏色/形狀變了」這類真退化，又不被 AA 噪訊誤判

const VIEWPORTS = [
  ['desktop', { width: 1440, height: 900 }],
  ['mobile', { width: 375, height: 812 }],
];

// 回傳 { status, detail }；status ∈ 'identical' | 'differ' | 'no-baseline'
function comparePng(basePath, outPath, diffPath) {
  if (!fs.existsSync(basePath)) return { status: 'no-baseline' };
  const base = PNG.sync.read(fs.readFileSync(basePath));
  const out = PNG.sync.read(fs.readFileSync(outPath));
  if (base.width !== out.width || base.height !== out.height) {
    return { status: 'differ', detail: `尺寸不同 baseline ${base.width}x${base.height} vs output ${out.width}x${out.height}` };
  }
  const { width, height } = base;
  const diff = new PNG({ width, height });
  const numDiff = pixelmatch(base.data, out.data, diff.data, width, height, { threshold: PIXEL_THRESHOLD });
  const ratio = numDiff / (width * height);
  if (ratio > MAX_DIFF_RATIO) {
    fs.writeFileSync(diffPath, PNG.sync.write(diff));
    return { status: 'differ', detail: `${numDiff} px 差異（${(ratio * 100).toFixed(3)}% > ${(MAX_DIFF_RATIO * 100).toFixed(1)}%）→ diff: ${path.relative(process.cwd(), diffPath)}` };
  }
  return { status: 'identical', detail: `${numDiff} px 差異（${(ratio * 100).toFixed(3)}% ≤ 容忍值）` };
}

(async () => {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  console.log(`注入真實 STYLES (${STYLES.length} chars) from src/styles.js`);

  const browser = await chromium.launch();
  const results = [];
  let failed = false;
  for (const [name, vp] of VIEWPORTS) {
    const page = await browser.newPage({ viewport: vp, deviceScaleFactor: 2 });
    await page.goto(FIXTURE, { waitUntil: 'networkidle' });
    await page.addStyleTag({ content: STYLES });   // ← 真實 pin/元件 CSS 注入
    // 停用動畫/transition → 消除截圖非確定性（flash 2× .55s、moving pulse 無限循環會讓
    // 每次截到不同 frame，造成大量假 pixel diff）。regression 驗的是靜態樣式，不是動畫中間態。
    await page.addStyleTag({ content: '*,*::before,*::after{animation:none !important;transition:none !important;animation-duration:0s !important;}' });
    await page.waitForTimeout(300);
    const file = path.join(OUT_DIR, `${name}.png`);
    await page.screenshot({ path: file, fullPage: true });
    console.log('saved', path.relative(process.cwd(), file));
    await page.close();

    if (!UPDATE) {
      const r = comparePng(path.join(BASE_DIR, `${name}.png`), file, path.join(OUT_DIR, `${name}.diff.png`));
      if (r.status === 'no-baseline') results.push(`  [${name}] 無 baseline — 先 --update 建立基準`);
      else if (r.status === 'identical') results.push(`  [${name}] ✓ identical（${r.detail}）`);
      else { results.push(`  [${name}] ✗ DIFFER — ${r.detail}`); failed = true; }
    }
  }
  await browser.close();

  if (UPDATE) {
    console.log('baseline 已更新 →', path.relative(process.cwd(), OUT_DIR));
  } else {
    console.log('比對結果:');
    results.forEach(r => console.log(r));
    process.exit(failed ? 1 : 0);
  }
})().catch(e => { console.error(e); process.exit(1); });
