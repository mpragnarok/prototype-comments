# AI Agent Development Guide — prototype-comments

**專案性質**：pc.js 留言系統 + ui-flow kit。被多個**靜態設計站**（jubo `docs/design/`、內部 demo 站）以 ESM `import { initPrototypeComments } from './pc.js'` 消費。`build.py` 串接 `src/{styles,store,note-comments,index}.js` → bundle。

---

## ‼️ 改功能前的強制流程（使用者 2026-05-30 核准，無例外）

任何**功能性改動**，動工寫 code 前必須依序完成下列，並**等使用者明確確認後才能動工**：

1. **先更新 SSOT roadmap**：`docs/2026-05-30-comment-system-and-uiflow-roadmap.md`（記錄這次改什麼、為什麼）。
2. **若涉及設計規範 / design system** → 一起更新（不可變條款、design-spec），不可只改 code。
3. **為該功能新增規格文件 spec doc**：`docs/{YYYY-MM-DD}-{feat|fix}-{slug}.md`（描述需求、行為、邊界、驗收）。
4. **把以上 1–3 的變更提交使用者確認** → 確認後才動工。

> 「我說要改動功能」時，先改 SSOT / design system / spec，請我確認，**不要直接改 code**。

---

## ‼️ 每次改動必附測試

- **每加/改功能 → 寫 e2e test**：`test/e2e-*.spec.js`（playwright library 模式，`node test/...`，專案為 `type:module`）。
- **畫面有改動 → 加/更新視覺 regression test**：`test/visual/`。鐵則：fixture **載入真實 STYLES**（`import { STYLES } from '../../src/styles.js'`，**絕不複製 CSS**），改 src 後 baseline 自動反映。
- **pc.js bundle**：改 `src/` 後跑 `python3 build.py` + `node --check <bundle>`。

CI：GitHub Actions 應在 push / PR 跑 `test:e2e` + 視覺 regression（見 `.github/workflows/`）。

---

## 設計不可變條款（與消費端 jubo `AGENTS.md` 同步，違反需先取得同意）

- **主色 teal `#0FA0A0`**：所有互動 accent（focus、active chip、hover、mention）。
- **系統紅 `#BA1A1A` 只給 pin**：不得用於一般按鈕 / chip / 連結。例外：reaction「mine」狀態允許紅色調 `#FFDAD6`/`#BA1A1A`。
- **留言 bar 永遠浮動在視窗底部**，不注入頁面 header。
- **回覆階層單層**：root 留言可回覆 + resolve/unresolve；replies 不可再回覆、不可 resolve。
- **Emoji reactions 精選 6–8 顆**，不掛整套 emoji。

---

## 測試指令

```bash
npm run test:render            # open test/render-test.html
npm run test:e2e               # node test/e2e-comments.spec.js
npm run test:e2e:local         # USE_LOCAL=1 ...
node test/visual/visual-shot.js          # 視覺 regression，截到 output/ 比對 baseline
node test/visual/visual-shot.js --update # 核可後更新 baseline
```
