# C2 — pc.js 視覺 regression + e2e 測試

> roadmap §C2（使用者標「優先做」）。屬新測試子系統。
> 目標：用截圖把關「視覺對不對 / 互動有沒有壞」，補上 grep 標記驗證抓不到的退化。

## 核心發現（為何現有測試擋不住 pin 退化）

`test/render-test.html` 裡的 `.pc-pin` 是**手抄一份舊 CSS**（圓形 teal `#0FA0A0` `border-radius:50%`），跟 `src/styles.js` 現在的對話泡紅 pin（`border-radius:10px 10px 10px 3px; background:#BA1A1A`）**完全不同步**。它測的是過時的複製樣式，所以「pin 款式選錯了卻以為通過」。

→ **C2 鐵則：fixture 一律 `import { STYLES } from '../../src/styles.js'` 載入真實 CSS，永不複製。** pin/元件樣式改了，fixture 自動跟著變，截圖才有意義。

## 設計

落點 `test/visual/`：
- `fixture.html` — `<script type="module">` import 真實 `STYLES`，注入各態 sample DOM（免 Firebase）：
  - pin：unresolved 單位數 `💬1` / 多位數 `💬12`、resolved `✓3`、edge pin、flash 態
  - reactions：`.pc-reaction-chip` normal / `.mine` / `.pc-reaction-add`
  - panel toolbar：search input、type filter chips、tag chips active/inactive、sort
  - reply thread：root + reply（reply 無回覆鈕，驗 D1 單層）、resolve toggle
- `shot.js` — 沿用 bootstrap 模式（playwright library，非 @playwright/test，與現有 `e2e-comments.spec.js` 一致）：截 desktop 1440×900 + mobile 375×812，scale 2 → PNG
- `baselines/` — 核可後的 baseline PNG，commit 進 repo
- npm script `test:visual`（截圖）/ `test:visual:update`（更新 baseline）

## MVP（本次）→ 後續

- **MVP（零新依賴）**：fixture + 截圖 runner + baseline PNG + 人眼/AI 檢視。立即能擋 pin 款式那種錯。
- **後續**：自動 pixel diff（需 pixelmatch + pngjs，另議）；需 Firebase 的 e2e（建立/resolve/reply）用 emulator。

## 與後續 goal 項目的關係（C2 > A3 > B5）

1. **C2** 先建 pin fixture → 立刻當 A3 的驗證工具。
2. **A3 修正**：pin 左下角 `border-radius ...3px`（近直角）跟其他三角 10px 不協調（使用者圖回報）。用 fixture 截圖對比修正前後。
3. **B5**：reaction chip 手機 tap → popover 列名單（class 已在 `.pc-reaction-chip`）。
