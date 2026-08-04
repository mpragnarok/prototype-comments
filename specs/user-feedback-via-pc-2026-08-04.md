# user-feedback 改走 prototype-comments — 2026-08-04 設計

## 起點

需求：「user-feedback 也要像 live-markup 一樣，有留言就在頁面上標記；已處理過的標記要跟新的不一樣。」

追問後確認的範圍：

| 決策點 | 選定 |
|---|---|
| 標記顯示誰的留言 | **所有終端使用者都看得到**（不只自己剛留的）|
| 身份 | **Google 登入自動具名**（取代 localStorage 手打名字）|
| 實作路線 | **直接用 prototype-comments**，只改 bridge |
| 功能落差處理 | **補 selector，不補貼圖**（方案 C）|

## 為什麼不是「改 user-feedback」

查證後發現，需求裡的每一項 prototype-comments 都已經有：

| 需求 | pc 現況 | 位置 |
|---|---|---|
| Google 登入 | ✅ `GoogleAuthProvider` / `signInWithPopup` / `onAuthStateChanged` | `src/index.js:31,41` |
| 自動具名 | ✅ `authorName` = `displayName`，另存 `authorPhoto` | `src/index.js:576` |
| 頁面標記 pin | ✅ `.pc-annotation`，x/y 定位 | `src/index.js` |
| 留言公開可讀 | ✅ 設計如此（同事互審用）| — |
| **已處理 vs 新的** | ✅ `resolved` ＋ `resolvedBy`/`resolvedByUid`/`resolvedAt`，連 `✓ Resolve` 按鈕都有 | `src/index.js:770-809` |

反過來，user-feedback 的具名是 localStorage 手打（`uf-reporter`），且**完全沒有讀回與渲染既有留言的邏輯**——487 行全是「收集 + 送出」。

繼續改 user-feedback 等於把 pc 重造一遍。

> ⚠️ 代價要說清楚：user-feedback 的 SKILL.md 把「**免登入**」列為核心理由（*「要登入回饋率會掉」*，對象是醫師、客戶、家人）。改走 pc 等於推翻該決策，換得具名與標記。這是取捨，不是純升級。

## 功能落差（改走 pc 會失去的）

| | user-feedback | prototype-comments |
|---|---|---|
| 留言定位 | **CSS selector ＋ 元素文字** | 只有 **x/y 座標** |
| 貼圖 | ✅ 有（`compressToDataUrl`，10 處）| ❌ 無（0 處）|

**selector 的價值**：sink 產出現在能寫「DOM 位置：`main > div:nth-of-type(2)`」與「快速出貨」。少了它，agent 得從座標反推元素——`live-markup` 的 `triage` playbook 才剛寫下「有 `sel` 就直接用，不要反推座標」，因為反推容易錯。

**決定（方案 C）**：補 selector，不補貼圖。
- selector 是純新增欄位，不改任何既有行為，三個 consumer 不受影響。
- 貼圖牽涉 UI／壓縮／儲存，範圍大得多，之後再議。

## 架構

### 前端：改用 pc.js（零新元件）

```html
<script type="module">
  import { initPrototypeComments } from 'https://prototype-comments.netlify.app/src/index.js';
  initPrototypeComments({ firebaseConfig, projectId: 'my-app' });
</script>
```

### 資料落點

```
改前  user-feedback/{projectId}/notes/{id}          手打名字、無狀態
改後  prototype-comments/{projectId}/comments/{id}  Google 具名、有 resolved
```

### `filedAt` 與 `resolved` 必須分開

這是本設計最關鍵的一點。

bridge 現在撈完會 `markFiled`，目的只是**避免下輪重複撈**。而 pc 的 `resolved` 意思是**人真的處理完了**（頁面 pin 會變樣）。若讓 bridge 直接寫 `resolved: true`，使用者一留言、bridge 撈走，頁面立刻顯示「已解決」——但其實只是排進待辦。**那個標記會說謊。**

| 欄位 | 意思 | 誰寫 | 影響頁面標記 |
|---|---|---|---|
| `filedAt` | bridge 已收進待辦 | bridge 自動 | ❌ 不影響 |
| `resolved` | 真的處理完了 | 人按 `✓ Resolve`，或 dash 卡片完成時回寫 | ✅ pin 變樣 |

bridge 的查詢條件因此是 `filedAt == null`，**不是** `resolved == false`。

## 改動清單

### 1. `prototype-comments/src/index.js`（CDN，最危險的一區）

留言寫入時多存錨定欄位。**直接引用 draw layer 現成的實作，不搬 user-feedback 的**：

```js
import { cssSelectorFor } from './draw/selectors.js';
// 寫入 comment 時：
selector: cssSelectorFor(annotation.targetEl),
relX, relY,   // 元素內相對位置，沿用 draw layer 的錨定慣例
```

為什麼用 draw layer 而不是搬 `user-feedback.js` 的 `cssPathOf`：

| | draw layer `cssSelectorFor` | user-feedback `cssPathOf` |
|---|---|---|
| 狀態 | 已 `export`，同 repo 同 CDN，直接 import | 要複製貼上 |
| 驗證 | **querySelector round-trip**（產完會驗回得去）| 無 |
| 附帶 | `relX`/`relY` 元素內相對位置、`data-testid` 等錨點屬性優先 | 只有路徑字串 |
| 生產狀態 | live-markup 每天在用 | 只在送出路徑用過 |

`src/draw/selectors.js` 只有 118 行，唯一相依是 `./constants.js` 的 `ICON_PATHS`——引用成本極低，不會把整個 draw layer 拖進來。

**額外好處**：錨定邏輯全站統一，不會出現兩套 selector 實作各自漂移。

**純新增欄位，不改既有行為。** 但仍需跑 prototype-flow / prototype-live / live-markup 三個 consumer 的回歸測試（見 `prototype-release` skill §0）。

### 2. `prototype-skills/skills/user-feedback/scripts/lib/firestore.mjs`

- collection：`user-feedback/{pid}/notes` → `prototype-comments/{pid}/comments`
- 列 projectId：同樣需要 `showMissing=true`（父文件從未被寫過）
- 查詢條件：`filedAt == null`
- `markFiled` 改寫 `filedAt`，不動 `resolved`

### 3. 欄位對映（bridge → sinks）

| sink 需要 | pc comment | 備註 |
|---|---|---|
| `id` | doc id | |
| `projectId` | 由路徑取得 | |
| `note` | `body` | |
| `reporter` | `authorName` | 比原本更可信（Google 具名）|
| `createdAt` | `createdAt` | serverTimestamp |
| `selector` | `selector` | ← 本設計新增，來自 draw layer `cssSelectorFor` |
| `elementText` | — | draw layer 不產這個；sink 改用 `selector` 顯示位置 |
| — | `relX`/`relY` | ← 附帶取得，元素內相對位置，agent 可判斷指的是哪一側 |
| `page` | `screenId` | 語意相近，非完全等價 |
| `image` | — | 方案 C 不做，sink 需容忍缺值 |

三個 sink（file／webhook／dash）都要能在 `image` 為 `null` 時正常運作——現有程式碼已經是 `imagePath ? [...] : []`，應無須改動，但要有測試覆蓋。

### 4. `skills/user-feedback/SKILL.md`

「免登入」的定位必須改寫，否則文件與行為相反（這正是 2026-08-04 兩 remote 漂移的成因模式：文件與現實相反，兩邊都被當成真相）。

## 測試

- bridge：現有 21 個測試中，`config` 12 個不受影響；`sinks` 9 個需補「`image` 為 null」的案例。
- 新增：`filedAt` 查詢條件、`markFiled` 只動 `filedAt` 不動 `resolved`。
- CDN：三個 consumer 的既有 e2e 全綠才可 push（`src/*` push 即上線，無 staging）。

## 未決 / 後續

- **貼圖**：方案 C 暫緩。若使用者實際反映需要，再評估搬 `compressToDataUrl` 到 pc。
- **dash 卡片完成時回寫 `resolved`**：能讓「處理完 → 頁面標記變樣」全自動，但需要 dash → Firestore 的反向通道，本設計未涵蓋。
- **`page` vs `screenId` 語意差**：目前直接對映，若實際使用發現不夠精確再處理。
