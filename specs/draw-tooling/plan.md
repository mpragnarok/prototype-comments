# 設計師視覺標注工具 — 實作計畫（plan）

> 狀態：草稿 v1 · 2026-06-26
> 設計來源（已鎖定）：`prototype-practice-app/.lavish/draw-tooling-discussion.html`
> 關聯：與 `doc-watch B（resolve dev 直送）` 共用同一套基礎建設（long-poll + 結構化 delta 回饋）

---

## 1. 背景與目標（Why）

設計師除了打字，常需要「畫給 AI 看」——圈一塊、拉箭頭、貼參考圖、寫一句。
現況 pc.js 只有「pin 留言」（座標 + 文字），AI 要從座標＋截圖**推**是哪個元件，易改錯。

**目標**：在 pc.js 上加一套 Figma/Excalidraw 風格的視覺標注工具，讓標注帶著
**精準元件（selector）＋ 截圖 ＋ 意圖文字** 直送 AI，省掉「打字描述位置」的 token，
並讓 AI 改到對的地方。兩個 skill（prototype-flow / prototype-live）通用、與既有留言互動。

## 2. 範圍 / 非範圍

**範圍（v1）**
- pc.js 內新增「畫圖模式」：SVG 向量層 + 工具列 + 模式切換
- 工具：圈選(橢圓) / 箭頭 / 自由筆 / 文字 / 矩形 / 直線 / 顏色筆粗
- 物件操作：選取 / 移動 / 縮放 / **z-order（置頂/置底/上下一層）** / 刪除 / undo-redo
- **貼圖**：Ctrl/⌘+V 或拖入參考圖 → 可移動縮放的物件 → 在其上標注
- 截圖 + 結構化匯出（PNG ＋ `{selector,text,tool}` JSON）→ 寫本機檔
- resolve `--watch`：本機 server long-poll（學 lavish），直送 AI
- 側邊紀錄面板（沿用 spec-overlay 的 tab/drawer）

**非範圍（v1 不做）**
- 多人即時協作游標（CRDT）
- 複雜圖形編輯（貝茲曲線節點編輯、群組巢狀）
- 把 PNG 存進 Firestore（明確禁止，見資料模型）

## 3. 架構決策（已鎖，來自 lavish 討論）

| 面向 | 決定 |
|---|---|
| 放哪 | **擴充 pc.js**（在 prototype-comments）→ 兩 skill 經 CDN 自動共用、跟留言同層同 Firebase |
| 進對話 | 截圖 PNG ＋ 被圈元件 selector → resolve 本機檔 → AI 讀（接 doc-watch B） |
| 存法 | **分層**：dev 模式全寫本機（0 Firebase）／團隊模式只存向量 strokes JSON／PNG 永不進 Firebase |
| 互動架構 | 學 lavish：本機 server 事件驅動 long-poll（15s 心跳、30min 閒置關）＋ 結構化 delta 回饋 |
| 側邊紀錄 | 沿用 spec-overlay「右緣 tab + 抽屜」 |

## 4. 系統設計

### 4.1 pc.js 繪圖層（src/index.js + 新檔 src/draw-layer.js）
- 在既有 `#pc-overlay` 之上加一個 `#pc-draw` SVG 層（`position:absolute; inset:0`）。
- **模式狀態機**：`pc.mode ∈ { comment, draw, off }`。沿用 pc.js 既有「不跟 app 打架」機制
  —— draw 模式時 SVG 層 `pointer-events:auto` 吃事件，app 點擊被擋；切回 comment/off 則放行。
- **工具狀態**：`draw.tool`、`draw.color`、`draw.strokeWidth`。
- **自癒定位**：沿用既有 capture-phase scroll listener（L172 `renderAnnotations`）——
  繪圖物件若 `anchor` 綁定某 DOM 元件，捲動時跟著重算；未綁定（自由畫）則固定畫布座標。

### 4.2 物件模型（draw object schema）
```
DrawObject = {
  id, tool: 'ellipse'|'arrow'|'pencil'|'text'|'rect'|'line'|'image',
  // 幾何（相對 viewport 百分比，沿用 pc.js 既有 % 座標慣例 → RWD 友善）
  geom: { x, y, w, h } | { points:[[x,y]...] } | { from, to },
  z: <int>,                       // z-order
  style: { color, strokeWidth, fill? },
  text?: <string>,                // text 工具 / 物件附註
  anchor?: <selector>,            // 綁定的 DOM 元件（圈選命中時自動填，elementFromPoint）
  imageRef?: <localPath|dataURL>, // image 工具
}
```
- **selector 擷取**：圈選/箭頭結束時，對中心點跑 `document.elementFromPoint` →
  產生穩定 selector（id 優先，否則 nth-of-type 路徑），存進 `anchor`。這是「精準定位」的關鍵。

### 4.3 z-order
- z = SVG 內 DOM 順序。`bringToFront/sendToBack/forward/backward` 重排 `<g>` 節點 + 更新 `z`。
- UI：選取物件後右鍵選單 + 工具列四顆鈕。

### 4.4 貼圖
- `paste`（Clipboard image）/ `drop`（檔案）→ 建 `image` 物件，dataURL 暫存、可移動縮放、可被其他物件疊（z-order）。
- dev 模式：圖落地成本機檔（`.proto-crit/assets/`）。團隊模式：**不**進 Firestore（見 4.6）。

### 4.5 截圖 + 結構化匯出（src/draw-export.js）
- 觸發（按「送給 AI」或自動）→
  1. `html2canvas`（或 resolve 端 playwright）擷取 `#pc-overlay+#pc-draw` 疊合區 → PNG
  2. 序列化當前 DrawObject[] → 精簡 JSON（只含 tool/selector/text/color，省 token）
  3. 寫入 resolve 本機檔 `.proto-crit/inbox.jsonl`（一行一筆）+ PNG 到 `.proto-crit/assets/`
- 形狀（送進 AI 對話）：
```json
{ "shot":".proto-crit/assets/shot-001.png",
  "annotations":[
    {"tool":"ellipse","selector":"#price-card","text":"跟右欄頂端對齊","color":"red"},
    {"tool":"arrow","from":"#price-card","to":".sidebar"} ] }
```

### 4.6 分層儲存
- **dev 模式（主要）**：strokes + PNG 全寫本機 `.proto-crit/`，0 Firebase。
- **團隊模式（選用）**：只把向量 strokes JSON 寫 Firestore，跟留言同 `projectId`
  （子集合 `drawings`）。**PNG 永不進 Firestore**（需要時前端從向量即時重畫）。
- store.js 擴充：`saveDrawing(projectId, drawObj)` / `loadDrawings(projectId)`，沿用既有 Firebase 連線。

### 4.7 resolve dev 直送（prototype-flow skill，scripts/）
- 新增 `resolve --watch`：在既有本機 HTTP server 上加
  - `GET /api/draw-poll`：**事件驅動 long-poll**（仿 lavish：hold 連線、掛 watcher、15s 心跳、30min 閒置關）
  - `POST /api/draw`：pc.js 匯出時打進來 → emit 事件 → 喚醒 poll → 回傳 delta（新標注 JSON + PNG 路徑）
- AI 端：背景跑 `draw-poll`，使用者一送標注就秒醒，讀 PNG + JSON → 動作。

### 4.8 側邊紀錄面板
- 沿用 spec-overlay 的 `.spec-tab` + drawer 模式（已實作）。
- 內容：每筆標注縮圖 ＋ 時間 ＋ 對應 selector ＋ 文字；點一筆 → 高亮/捲到該物件。

## 5. 跨 repo 介面與分界

| 元件 | repo | 角色 |
|---|---|---|
| pc.js 繪圖層 / 工具列 / 匯出 | prototype-comments（CDN SSOT） | 前端標注 + 截圖 + 結構化匯出 |
| store.js drawings | prototype-comments | 團隊模式 Firestore 向量 |
| resolve `--watch` server | prototype-skills/prototype-flow | 本機 long-poll + 直送 AI |
| 串接說明 / 觸發詞 | prototype-flow & prototype-live SKILL.md | 文件 |

> CDN 自動更新：pc.js 改動上 CDN 後，兩 skill 既有/新原型重整即生效，無需改 skill 模板。

## 6. 實作階段（增量、每階段可獨立驗收）

> **每階段共通驗收門檻（DoD，缺一不可）**
> 1. **單元測試**：純函式（座標換算、selector 擷取、z-order 重排、序列化）先寫測試（紅）→ 實作（綠）。
> 2. **e2e 測試**（playwright，沿用既有 test/e2e）：模擬使用者操作 → 斷言 DOM/SVG 結果與匯出 JSON。
> 3. **跑綠 + 附完整 stdout/timestamp** 才算該階段完成（不靠舊紀錄、不未跑先猜）。
> 4. 視覺類改動補 verify-overlay 式截圖比對。
>
> 下列每階段的「驗收」欄即該階段要新增/通過的測試。

- **P1 — 繪圖骨架（本機、無 Firebase）**
  `#pc-draw` SVG 層 + 模式狀態機 + 工具列 UI + 圈選/箭頭/自由筆/文字基本繪製。驗收：能在 harness 畫出四種物件。
- **P2 — 物件操作**：選取/移動/縮放/z-order/刪除/undo-redo + 矩形/直線 + 顏色筆粗。
- **P3 — 貼圖**：paste/drop 圖物件 + 疊放。
- **P4 — selector 擷取 + 結構化匯出**：elementFromPoint → anchor；匯出 PNG + JSON 到 `.proto-crit/`。
- **P5 — resolve `--watch` long-poll**：server 端點 + 心跳/閒置；AI 端 draw-poll 串接。端到端：畫→秒送→AI 讀。
- **P6 — 側邊紀錄面板**：spec-overlay tab/drawer 列標注。
- **P7 — 團隊持久（選用）**：store.js drawings Firestore 向量 + 載入重畫。
- **P8 — 兩 skill 串接 + 文件**：SKILL.md / README、e2e、CDN 部署。

> 先求 P1–P5 端到端跑通（dev 即時 crit 主場景），P6–P8 再補。

## 7. 測試策略
- 沿用 prototype-comments 既有 e2e（playwright）：每個工具一個畫測試（畫→斷言 SVG 物件數/座標）。
- selector 擷取單元測試（給定 DOM → 期望 selector）。
- long-poll：mock POST → 斷言 poll 在 <100ms 內回傳 delta（事件驅動，非輪詢延遲）。
- 視覺：verify-overlay 式截圖比對標注疊放位置。

## 8. 風險與緩解
- **pc.js 變大** → 繪圖獨立成 `draw-layer.js` 模組，build 時打包；comment-only 使用者行為不變。
- **draw 模式搶 app 點擊** → 嚴格綁 `pc.mode`，只有 draw 時 SVG `pointer-events:auto`。
- **selector 不穩**（動態 class）→ 擷取時優先 id / data-* / 文字錨點；存原始座標當 fallback。
- **背景 poll 被系統收掉**（本 session 已遇）→ 端點設計成「佇列永不遺失」+ 斷線可重連 drain。
- **html2canvas 對活 React app 失真** → resolve 端改用既有 playwright 截圖管道當備援。

## 9. 開放問題（小，不擋 P1 起步）
- text 工具是否要支援多行 / 字級切換？（v1 先單行、固定字級）
- 自由筆是否要平滑化（Catmull-Rom）？（v1 先原始點，視覺再調）
- 團隊模式向量 strokes 與留言是否要可互相引用（drawing ↔ comment thread）？（P7 再定）
