// test/visual/visual-shot.js — pc.js 元件視覺 regression runner (ESM)
//
// 直接 import src/styles.js 的「真實」STYLES export（不複製、不正則），注入 fixture.html 後截圖。
// 沿用 playwright library 模式（與 test/e2e-comments.spec.js 一致）。專案 package.json 為 type:module。
//
//   node test/visual/visual-shot.js            # 截到 output/，與 baselines/ 比對
//   node test/visual/visual-shot.js --update   # 寫入 baselines/（核可後更新基準）
//
import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { STYLES } from '../../src/styles.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE = 'file://' + path.join(HERE, 'fixture.html');
const UPDATE = process.argv.includes('--update');
const OUT_DIR = path.join(HERE, UPDATE ? 'baselines' : 'output');
const BASE_DIR = path.join(HERE, 'baselines');

const VIEWPORTS = [
  ['desktop', { width: 1440, height: 900 }],
  ['mobile', { width: 375, height: 812 }],
];

(async () => {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  console.log(`注入真實 STYLES (${STYLES.length} chars) from src/styles.js`);

  const browser = await chromium.launch();
  const results = [];
  for (const [name, vp] of VIEWPORTS) {
    const page = await browser.newPage({ viewport: vp, deviceScaleFactor: 2 });
    await page.goto(FIXTURE, { waitUntil: 'networkidle' });
    await page.addStyleTag({ content: STYLES });   // ← 真實 pin/元件 CSS 注入
    await page.waitForTimeout(300);
    const file = path.join(OUT_DIR, `${name}.png`);
    await page.screenshot({ path: file, fullPage: true });
    console.log('saved', path.relative(process.cwd(), file));
    await page.close();

    // MVP 比對：byte 等值 → identical / differ（精確 pixel diff 待 pixelmatch，見 plan）
    if (!UPDATE) {
      const basePath = path.join(BASE_DIR, `${name}.png`);
      if (!fs.existsSync(basePath)) {
        results.push(`  [${name}] 無 baseline — 先 --update 建立基準`);
      } else {
        const a = fs.readFileSync(basePath), b = fs.readFileSync(file);
        results.push(a.equals(b) ? `  [${name}] ✓ identical` : `  [${name}] ✗ DIFFER（請人眼/AI 比對 output vs baseline）`);
      }
    }
  }
  await browser.close();

  if (UPDATE) {
    console.log('baseline 已更新 →', path.relative(process.cwd(), OUT_DIR));
  } else {
    console.log('比對結果:');
    results.forEach(r => console.log(r));
  }
})().catch(e => { console.error(e); process.exit(1); });
