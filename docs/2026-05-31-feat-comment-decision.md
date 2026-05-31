# feat: 留言決議寫回（採用 / 不採用 / 待議）

> Plan（方案比較 / 影響檔案 / Firestore rules diff）：`docs/previews/2026-05-31-feat-comment-decision-writeback.html`
> 設計色彩條款：`jubo/docs/design/prototype-comments-design-spec.html`（色彩系統 + rules table）

## 需求
設計稿留言報告從「只能讀」升級成「可決策」：每則**主留言**能標記 `decision`（採用/不採用/待議）+ 一句 `decisionNote`，按下即寫回 Firestore。pc.js overlay 與 report.html 共用同一欄位；AI 讀 `report.json` 的 `decision` 就知道哪些拍板要改、哪些被否決。

## 行為
- **欄位**（純 additive，無 migration）：`decision: 'accepted'|'rejected'|'pending'|null`、`decisionNote: string`。
- **範圍**：只貼**主留言**（root，與 resolve 一致）；回覆不給決議。
- **正交**：`decision` 與 `resolved` 互不連動（採用 ≠ 自動已解決）。
- **顏色**：採用=olive `#788C5D`、待議=clay `#D97757`、不採用=灰 `#6b7280`（**不可用紅**，紅只給 pin/@提及）。
- **pc.js overlay**：主留言卡 meta 顯示決議 badge；操作列三鍵（點已選→取消回 null）+ 有決議時顯示註記框（blur/Enter 存）。任何登入者可設（reviewer 通常非作者）。三處接線：positional popover、note thread、全部留言 panel。
- **report.html**：每則主留言三鍵 + 註記框；`Google 登入`後可寫回（未登入唯讀、控制項 disabled）。`report.json` 留言物件加 `decision`/`decisionNote`。
- **Firestore rules**：update 白名單擴成 `['resolved','reactions','decision','decisionNote']`（同時補回漂移掉的 `reactions`）。

## 邊界
- 未登入：report.html 三鍵與註記框 disabled、僅顯示既有決議（唯讀）。
- 取消決議（toggle null）：`decision=null`，既有 `decisionNote` 保留不清（report/overlay 顯示 null badge）。
- pc.js：決議鍵 onclick `stopPropagation()` —— 否則 store.update 觸發同步 snapshot→thread replaceWith，detach 本按鈕後 click 冒泡到 document outside-close handler 會誤關 popover（已加 e2e 鎖此回歸）。

## 驗收（皆綠）
- pc.js：`npm run test:e2e`（mock，含「點採用寫回+active+註記+toggle+popover 不關」）8/0；legacy `test/e2e-comments.spec.js` 32/0；visual regression（fixture 加決議樣本、baseline 已更新）desktop/mobile identical。
- report 工具：`node --test scripts/05-comment-report.test.js` 24/0（決議 badge/三鍵/註記、buildJson 欄位、buildHtml 有/無 apiKey 注入 writeback 分支）；buildHtml 輸出 garble 0。
- **待使用者執行**（本 session 網路封鎖 github/netlify/firebase）：`firebase deploy --only firestore:rules`（部署到 comment 所在 Firebase 專案）+ 權限 smoke test（非作者設 decision 應成功、改 body 應拒）。
