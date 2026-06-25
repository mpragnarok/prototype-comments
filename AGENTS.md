# AI Agent Development Guide — prototype-comments

**專案性質**：pc.js 留言系統 + ui-flow kit。被多個**靜態設計站**（jubo `docs/design/`、內部 demo 站）以 ESM `import { initPrototypeComments } from './pc.js'` 消費。`build.py` 串接 `src/{styles,store,note-comments,index}.js` → bundle。

---

## ‼️ 設計規範 / 規格變更流程（使用者 2026-05-30 核准，無例外）

任何**設計規範或功能規格**的改動，一律走這條鏈，**第 2 步是強制 GATE，未取得明確核准不得動工**：

1. **提 plan（html-doc 格式）** — 改規格前先用 `html-doc` skill 出一份「要怎麼改」的計畫，含：問題、方案比較、影響的檔案清單。輸出到 `docs/previews/{YYYY-MM-DD}-{feat|fix}-{slug}.html`，開給使用者看。
2. **使用者 review → 明確核准** — `🚧 GATE`：等使用者說 OK 才進下一步。不可邊問邊改。
3. **實作** — 改 `src/` code ＋ 對應 test（功能必附 e2e；畫面改動必附 visual regression，見下）。
4. **更新回來源文件（SSOT）** — 把定案同步回設計規範來源：
   - 設計規則 → `jubo/docs/design/prototype-comments-design-spec.html`（唯一設計規範來源）
   - 進度 / 決策 → `docs/2026-05-30-comment-system-and-uiflow-roadmap.md`（§2.A）
   - 該功能規格 → `docs/{YYYY-MM-DD}-{feat|fix}-{slug}.md`（需求 / 行為 / 邊界 / 驗收）
5. **doctrine 檔案只放 reference** — `AGENTS.md` / `CLAUDE.md` **不內嵌設計細節**，只指向上述來源文件 + 本流程。要查設計規則就點連結到 design-spec，避免兩處重複、漂移。

> 「我說要改動規格 / 功能」時：先出 html-doc plan、請我確認，**不要直接改 code 或來源文件**。

---

## ‼️ 每次改動必附測試

- **每加/改功能 → 寫 e2e test**：`test/e2e-*.spec.js`（playwright library 模式，`node test/...`，專案為 `type:module`）。
- **畫面有改動 → 加/更新視覺 regression test**：`test/visual/`。鐵則：fixture **載入真實 STYLES**（`import { STYLES } from '../../src/styles.js'`，**絕不複製 CSS**），改 src 後 baseline 自動反映。
- **pc.js bundle**：改 `src/` 後跑 `python3 build.py` + `node --check <bundle>`。

CI：GitHub Actions 應在 push / PR 跑 `test:e2e` + 視覺 regression（見 `.github/workflows/`）。

---

## ‼️ Roadmap 文件 .md + .html 必須同步

`docs/2026-05-30-comment-system-and-uiflow-roadmap` 同時存在 **`.md`（SSOT，可編輯）** 與 **`.html`（手寫、供瀏覽）**，**沒有 md→html 自動產生器**。

- **改 roadmap 時，兩個檔都要改**：先改 `.md`（事實來源），再把同樣的狀態變更**手動同步到 `.html`** 對應區塊（標記 ✅/🟡/🐞、新增項目、更新「最後更新」日期）。
- **NEVER 只改一邊**：只改 `.md` 會讓線上/瀏覽版過時；只改 `.html` 會讓 SSOT 失真。
- 完成後目視確認 `.html` 開得起來、無亂碼（中文段落完整）。

> Why：2026-06-01 盤點發現 B3 早已完成、B2 部分完成，但 `.md`/`.html` 都沒標回去 → 使用者要求「兩個都要記得改」並立此規。

---

## 設計規範來源（不在此內嵌，一律 reference）

設計規則的**唯一來源（SSOT）**是設計規範文件，不在 doctrine 檔案重複：

- **設計規範**：[`jubo/docs/design/prototype-comments-design-spec.html`](../jubo-line-badminton-check-in-system/docs/design/prototype-comments-design-spec.html) — 色彩系統、標註（annotation）/overlay token、功能規格、不可變條款（teal 主色、紅只給標註、bar 浮底、單層回覆、精選 emoji、resolved 標註樣式…）。
- **進度 / 決策**：`docs/2026-05-30-comment-system-and-uiflow-roadmap.md`
- **各功能規格**：`docs/{date}-{feat|fix}-{slug}.md`

> 改任何設計規則前，回到上面的流程：先 html-doc plan → 核准 → 改 code + test → **更新 design-spec.html**。違反不可變條款需先取得同意。

---

## 測試指令

```bash
npm run test:render            # open test/render-test.html
npm run test:e2e               # node test/e2e-comments.spec.js
npm run test:e2e:local         # USE_LOCAL=1 ...
node test/visual/visual-shot.js          # 視覺 regression，截到 output/ 比對 baseline
node test/visual/visual-shot.js --update # 核可後更新 baseline
```
