# fix：標記讀不到的時候，畫面上要說話

- 日期：2026-08-30
- 檔案：`src/user-feedback-markup.js`（CDN 直出：`/src/user-feedback-markup.js`）

## 需求

回饋標記工具讀取失敗時完全靜默。`subscribe()` 的 `onSnapshot` 錯誤只走 `console.error`，
`toggleResolved()` 連 try/catch 都沒有。

對照組是送出失敗：那條早就有畫面提示（面板裡的「送出失敗，再按一次試試。」），
所以少的不是機制，是漏掉了讀取這半邊。

危險在於讀不到的畫面**跟「還沒標過」長得一模一樣**：沒有紅字、沒有錯誤、沒有缺口，
只有一個空的頁面。使用者因此會合理地以為自己根本沒留成，然後重標一次、
或者反覆問「有沒有人看到」。

## 行為

| 情境 | 改動前 | 改動後 |
|---|---|---|
| `onSnapshot` 讀取失敗 | 只寫 console，畫面無變化 | toast：「暫時讀不到你之前留的標記，重新整理看看。」 |
| 讀取持續失敗、使用者換頁 | 同上 | 只說一次；收到任何一次成功快照後才會再說 |
| 「標成已處理」寫不進去 | 沒有 catch，按了沒反應 | toast：「改不動，重新整理後再試一次。」 |

用字沿用既有那套（`toast()`，與「改不動」「刪不掉」同一組），沒有新增第二種提示機制。
提示裡不出現 Firestore／rules／`permission-denied`／error 物件——讀的人可能是醫師或設計師，
技術錯誤訊息對他們只是另一種形式的靜默。技術細節仍然照舊寫進 `console.error`。

## 邊界

- **不動資料流與對外合約**：`initElementMarkup()` 的簽名、寫進 Firestore 的欄位、
  `auth` 三種模式的行為都沒有改。這支被多個站掛著，合約要維持。
- **toast 只停留 2.6 秒**（`markup-ui.js` 既有行為）。頁面一載入就讀取失敗的話，
  沒在看畫面的人有可能錯過。改成常駐橫幅屬於新的提示機制，本次刻意不做。
- 寫入失敗時不改本地狀態——框不會假裝變成已處理。那個框說謊比沒反應更糟。
- 同 repo 的 `user-feedback.js`／`index.js` 沒有一併檢查，不在這次範圍內。

## 驗收

`test/e2e/element-markup.spec.js` 三條（`npm run test:e2e:markup`）：

1. 讀不到標記時，畫面上要說話（不能只寫 console）
2. 讀取一直失敗時只說一次，換頁不會一直跳同一句
3. 「標成已處理」寫不進去時，畫面上要說話（不能按了沒反應）

第 1 條同時斷言 `onSnapshot` 真的收下了錯誤回呼（`__failReads()` 回傳觸發到的訂閱數，
0 代表整個靜默）、以及提示裡沒有技術名詞。

`test/mock-firebase.js` 因此多了兩個測試開關：`__failReads()`、`__failWrites()`；
`onSnapshot` 也開始收下第三個參數（錯誤回呼）——先前直接丟掉，所以這類失敗根本測不到。

反證（把修好的地方改回去，確認測試真的紅）：

| 改回去的東西 | 變紅的測試 |
|---|---|
| 拿掉讀取失敗的 toast，退回只寫 console | 第 1 條 |
| 拿掉「只說一次」的旗標 | 第 2 條 |
| 拿掉 `toggleResolved` 的 try/catch | 第 3 條 |

三次各只紅一條，其餘 55 條照常通過。

畫面實拍：`docs/screenshots/markup-read-failure-toast.png`

## 順手補的一件事

`test:e2e:markup` 先前不在 `.github/workflows/e2e.yml` 的清單裡——測試檔存在、
在本機會過，但 merge 前沒有人跑到。而 `user-feedback-markup.js` 是 CDN 直出、
push main 就上線、沒有 build 步驟擋在前面。已把它加進 CI 當硬 gate。
