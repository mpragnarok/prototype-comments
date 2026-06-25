# pc.js + ui-flow 留言系統 — 進度 checkpoint

更新：2026-05-30（feat/tournament-and-scheduling session）

## ✅ 本輪已完成並部署（vitallink-flow-docs.netlify.app）
1. **搜尋注音 bug** — `renderPanel` 每次 keystroke `innerHTML=''` 重建 input → IME 組字中斷。
   修法：拆出 `renderPanelList()`，搜尋只重繪 list；加 `compositionstart/end` guard。`src/index.js`
2. **手機版全部留言不能上下滑** — flex column 子元素缺 `min-height:0` + `100vh` 在手機過高。
   修法：`.pc-panel-list` 加 `min-height:0` + touch scroll；手機 media query panel 用 `100dvh` 全寬。`src/styles.js`
3. **設計/工程 tab 篩選** — 全部留言面板 toolbar 加「全部項目 / 🎨設計 / 🔧工程」chips（`panel.typeFilter`）。
4. **按鈕顏色 revert** — 只有標註（annotation）維持系統紅 #BA1A1A；mention/搜尋框/tag chip/排序鈕 accent 改回 design-system teal #0FA0A0。
5. **規格面板顯示元件間距（📐 元件間距）** — 規格面板可直接秀出元件間距：來自手動標註的 `devNote.spacing`，或在 live 模式自動量測真實 DOM 得出，免另寫間距規格文字。
6. **`projectId` 改為必填** — 一個 prototype 專案 = 一個 projectId；移除 `'default'` fallback，缺少直接報錯。Why：本地 resolve 與線上必須共用同一個 id 才會看到同一批留言。

## ⏳ 需使用者拍板（我已備好建議，等決定再做）
- **回覆階層**（Image#11）：建議「單層」即可（Figma/Linear/Notion 設計留言皆 flat thread）。
  root 留言 = 回覆 + resolve/unresolve toggle；replies = 不可再回覆、不可 resolve。←目前已接近，需收尾確保 replies 無 reply/resolve 鈕 + root 可 unresolve。
- **Emoji 種類**（Image#11）：建議維持精選 6–8 顆（reactions 是快速情緒，非完整表情）；不建議掛整套 iPhone emoji（依賴大、CP 值低）。
- **標註（annotation）/icon 重設計**：待提 2–3 方案（pill+數字 / teardrop / 對話泡）。
- **留言 bar float 底部**（Image#13）：regression。bar 位置由 init 的 `authBarTarget` 決定（有值→注入 header；null→`#pc-auth-mobile-wrap` fixed 浮動）。需查 gen-uiflow.js init config 改回浮動底部，並把此行為寫進 design 規格 + 專案 CLAUDE.md。

## ⏳ 待做（不需決策，但量大／需 fresh context）
- **reactions 顯示誰按**（Image#14）：`buildReactions` 已存 {uid,name}，需在 chip hover/tap 顯示名單 tooltip。
- **guide v2 更新**（prototype-comments-guide.html）：補 reactions/@tag/搜尋/篩選/排序/回覆/紅標註。
- **design 規格新增不可變條款**：bar 浮動底部、按鈕主色 teal、標註（annotation）才用紅 → 寫進 design-spec.html + 專案 AGENTS.md/CLAUDE.md。
- **完整 design review**（Image#14）：產出不合理點 + 方案 report。
- **doc-sync skill**：掃 code/config → 更新四份文件 + 提醒同步。
- **e2e + 視覺 regression test**（Image#16）：ui-flow skill + prototype-comments 都要，測手機/網頁 RWD。
- **ui-flow 完整功能說明**（RWD onboarding overlay）。

## 🧭 Roadmap 評估（Image#18，待評估報告）
- ui-flow 產出模式：目前 prototype-first；新增 spec+design-system(storybook) → 設計稿+ui-flow（用羽球比賽系統實驗）。
- 設計稿留言 → 自動 report.html（畫面 + unresolved 留言截圖），供人讀 & 餵 AI 修正設計稿/prototype。
- 評估把 UI component 畫面綁定 storybook id（公司流程：react/flutter prototype → netlify → ui-flow kit 產交付）。
- 檢視 ui-flow skill 產 dev note 那段，讓輸出更好讀懂。
