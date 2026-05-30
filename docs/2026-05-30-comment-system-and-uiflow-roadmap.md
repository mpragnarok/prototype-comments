# pc.js 留言系統升級 + ui-flow 產出 roadmap

> **單一事實來源（SSOT）**。本檔記錄留言系統 (pc.js) 與 ui-flow 工具鏈的所有「已完成 / 待辦 / 評估」，避免長 session 中斷後失去脈絡。
> 跨兩個 repo：本 repo `prototype-comments`（pc.js 原始碼）與消費端專案的 `docs/design/`（ui-flow、設計文件、pc.js bundle）。
> 最後更新：2026-05-30
>
> ⚠️ 本 repo 為公開 repo。具體部署識別碼（netlify site id、內部 demo 站 URL、密碼）一律不寫入本檔，改記於私有部署筆記。

---

## 0. 已鎖定的設計決策（使用者 2026-05-30 核准，不再反覆）

| # | 決策 | 內容 |
|---|---|---|
| D1 | **回覆階層 = 單層** | 採 Figma/Linear/Notion 模式：root 留言可「回覆 + resolve/unresolve」；replies（第二層）**不可再回覆、不可 resolve**。不做巢狀第三層。 |
| D2 | **Emoji = 精選 6–8 顆** | 不掛整套 iPhone emoji（依賴大、CP 值低）。reactions 定位為快速情緒，非完整表情輸入。 |
| D3 | **留言 bar 浮動底部** | bar 固定浮在畫面底部（非塞進 header）。連同「主色 teal #0FA0A0、只有 pin 用系統紅 #BA1A1A」一起寫成 design 規格 + 消費端專案規範不可變條款，每次開發都遵守。 |
| D4 | **Pin 重設計** | 我提 3 案（pill+編號 / teardrop 水滴 / 對話泡）給使用者選後實作。 |

### 色彩 / 行為不可變條款（要寫進 design-spec.html + 消費端 AGENTS.md）
- **主色 primary = teal `#0FA0A0`**：所有互動 accent（focus、active chip、hover、mention）。
- **系統紅 `#BA1A1A` 只給 pin**：不得用於一般按鈕 / chip / 連結。
- **留言 bar 永遠浮動在視窗底部**，不注入頁面 header。
- **reaction「mine」狀態**允許紅色調（`#FFDAD6`/`#BA1A1A`）作為「你已按」語意，屬例外。

---

## 1. ✅ 已完成並部署（內部 demo 站，密碼閘）

| # | 問題 | 根因 | 修法 | 檔案 |
|---|---|---|---|---|
| F1 | 搜尋變只輸入注音 | 每次 keystroke `panel.el.innerHTML=''` 重建 input，IME 組字中斷 | 拆 `renderPanelList()`，搜尋只重繪清單 + `compositionstart/end` guard | `src/index.js` |
| F2 | 手機版全部留言不能上下滑 | flex column 子元素缺 `min-height:0` + 手機 `100vh` 過高 | `.pc-panel-list` 加 `min-height:0`+touch scroll；手機 panel `100dvh` 全寬 | `src/styles.js` |
| F3 | 缺工程/設計篩選 | 只有狀態 tab | toolbar 加「全部項目/🎨設計/🔧工程」chips (`panel.typeFilter`) | `src/index.js` |
| F4 | 按鈕沒照 design system | accent 被多染紅 | 只留 pin 紅；mention/搜尋/tag/排序 改回 teal | `src/styles.js` |
| F5 | 表情符號要知道誰按 | — | 桌機 hover 已顯示名單 (`chip.title`)。手機 tap 版列待辦 B5 | `src/index.js:642` |

---

## 2. ⏳ 實作待辦（決策已定，直接做）

### A. 留言系統（pc.js）
- **✅ A1 回覆階層收尾（D1）** — DONE 2026-05-30：`buildCommentItem` resolve 鈕改 toggle（`isRootComment && onResolve`，依 `c.resolved` 顯示「✓ Resolve / ↩ 取消解決」，呼叫 `onResolve(!c.resolved)`）；reply 渲染處（`index.js` panel + `note-comments.js`）移除 `onReply` → replies 無回覆鈕。
- **✅ A2 留言 bar 浮底（D3）** — DONE 2026-05-30：使用者選**右下角浮動膠囊（現有 `bottom:64px;right:12px`）**。移除消費端 ui-flow 模板與內部 demo flow 共 3 處實際 init 的 `authBarTarget:'.header'` → bar 不再注入 header、桌機/手機都浮動。（guide.html 範例碼與參數表已於 B1 更新為浮底行為。）
- **✅ A3 Pin 重設計（D4）** — DONE 2026-05-30：四角統一 `border-radius: 11px`（原 `10px 10px 10px 3px` 左下 3px 近直角，與其他三角 10px 不協調，使用者圖回報）；尾巴 `::before` 從底邊偏左直線段長出（`left:10px`、輕微不對稱 5/6px）。用 C2 fixture ×4 放大截圖驗證四角一致、尾巴銜接自然。
- **✅ A4 Emoji 微調（D2）** — DONE 2026-05-30：`REACTION_EMOJIS` 補到 8 顆 `['👍','❤️','🎉','😄','👀','🙏','🤔','🔥']`。
- **✅ A6 Pin 蓋住頁面 header（z-index）** — DONE 2026-05-30：根因＝`.phone`(手機外框) 未形成 stacking context，pin(z-index 210) 直接跟 root 比、蓋過 sticky `.header`(z-index 100)。修法＝`.phone` 加 `isolation:isolate` → 整個手機框（含 pin 子樹）關進一個 context、降到 header 之下；body 層的 auth bar(z 9000)/mobile-nav(z 200)/popover 不受影響。套用 3 doc。（2026-05-30 使用者回報）
- **✅ B5 reaction「誰按了」重設計（#5）** — DONE 2026-05-30（取代上一版「手機 tap 開 popover + toggle 鈕」）：拆成「看名單」與「toggle」兩動作。**桌機**：hover chip → `showReactionUsers` 純名單 popover（自繪、可控樣式），mouseleave 關；**click** → toggle 自己反應。**手機**（`matchMedia('(hover: none)')`）：**長按 ≥400ms** chip → 名單 popover（外點關）；**短按 tap** → toggle（長按剛開名單時該次 tap 不 toggle，避免衝突）。名單列出每位按過的人、自己標「（你）」。原生 `title` 保留當 fallback。新增 `bindReactionChip` 分流 hover/長按。e2e 兩條路徑（桌機 hover+click、手機長按+tap，含 matchMedia override context）皆綠。
- **🐞 B6 全部留言面板：已在該頁時導向失效**（2026-05-30 使用者回報）：「全部留言」面板點**設計類型(positional)**留言，原本會導到該畫面並讓該 pin 的留言跳出；但**若已經在該畫面**，點了沒反應。位置：`index.js navigateToComment`——舊邏輯只有 `screenId !== getScreenId()` 才走 navigate+150ms async 路徑，同頁是純同步、且無視覺回饋。**修法（2026-05-30）**：同頁路徑也 `await setTimeout(0)` 對齊時序 + 點到的 pin 加 `pc-pin-flash` 高亮閃爍，確保同頁也「跳出來」。⚠️ 靜態讀無法 100% 確認原始失效機制，需使用者實機驗證。
- **✅ A7 resolved pin 對比度修正**（2026-05-30 使用者回報「resolved pin 有點看不清楚」）：根因＝淡灰底 `#d1d5db` + 灰字 `#6b7280` + `opacity .7` 三層疊加 → 對比 ~2.5:1，遠低於 WCAG AA 4.5:1。**方案 A（使用者核准）**：`.pc-pin.resolved` 改 `background:#6b7280; color:#fff; opacity:.80`（`::before` 尾巴同色）→ 對比 ~4.6:1 達 AA，維持「已解決＝低調」語意但清晰可讀。同步更新 `design-spec.html`（色票 swatch + pin token）。Plan：`docs/previews/2026-05-30-fix-resolved-pin-contrast.html`（html-doc 格式，走新 GATE 流程：plan → 核准 → 實作 → 更新來源）。
- **✅ #4 回覆 thread popover 送出後自動關閉** — DONE 2026-05-30：根因＝positional pin thread 唯一回覆途徑（底部 textarea + submit）在 `await store.save()` 後**主動 `closeAllPopovers()`**，與 snapshot handler（會自動把新回覆刷進開著的 popover）打架。修法：移除該 `closeAllPopovers()`，改「清空 textarea + `refreshThread()`」→ popover 保持開著、回覆即時出現、可連續回覆（對齊 note thread 的 inline 回覆 UX）。e2e 先重現（`popOpen:false`）再修（`popOpen:true, replyShown:true, taCleared:true`）。

### B. 文件
- **✅ B1 guide v2 更新** — DONE 2026-05-30：`prototype-comments-guide.html` 新增「留言功能一覽」章節（表情回應 8 顆 + 桌機 hover／手機長按看名單、@提及 teal 高亮、搜尋／狀態 tab／類型 chip／tag chip／排序、單層回覆與 resolve toggle、紅 pin #BA1A1A／已解決灰 pin #6b7280 + pc-pin-flash）。同步：移除 setup 範例的 `authBarTarget:'.header'`（改說明省略＝浮右下角，對齊現行 3 處 init）、參數表補 `authBarTarget` 新語意 + `scrollContainer`、Firestore schema 補 `reactions` map 欄位、nav + TL;DR 更新、日期 2026-05-30。HTML tag 平衡已驗。
- **B2 design-spec 不可變條款**：把 §0 色彩/行為條款寫進 `prototype-comments-design-spec.html`（主＋worktree 兩份要同步）。
- **B3 專案規格**：把 D3 條款加進消費端專案 `AGENTS.md`（或 CLAUDE.md）。
- **B4 完整 design review**：逐畫面盤點不合理處 + 方案，產出 review report（html-doc 樣板）。

### C. 工具 / 測試
- **C1 doc-sync skill**：掃 pc.js 程式碼 + config + 文件 → 自動更新四份設計文件（UI Flow 製作流程 / 留言系統說明 / 留言系統設計規範 / UI Flow 模板）+ 提醒需同步處。
- **⭐ C2 e2e + 視覺 regression 測試（使用者 2026-05-30 要求「優先做」）**：ui-flow skill 與 prototype-comments 都要；測手機 + 網頁兩種 RWD。
  - **為何優先**：grep 標記驗證抓不到「視覺對不對／互動有沒有壞」。pin 連選的款式都出錯卻以為通過 → 必須有截圖比對把關。
  - **已 bootstrap（2026-05-30）**：Playwright chromium 裝好（macOS `~/Library/Caches/ms-playwright/`，run 時加 `NODE_PATH=<prototype-comments>/node_modules`）；`shot.js` 可對任意 HTML 出 desktop 1440×900 + mobile 375 兩張截圖。已用它驗證 pin 對話泡修正。
  - **建議架構**：
    1. **靜態 fixture（免 Firebase）**：做一頁 harness 載 pc.js 的 CSS + 注入 sample DOM（pin 各態、bubble、panel、reactions、reply thread、resolve toggle）→ 純元件視覺 regression。**這就能擋住 pin 款式那種錯**。
    2. **viewport**：desktop 1440×900 + mobile 375×812，各出 baseline PNG，commit 進 repo；之後 run 比對 diff。用 Playwright `toHaveScreenshot()` 或自寫 pixel diff。
    3. **e2e（免 Firebase 部分）**：panel 開關、設計/工程 type filter、tag filter、排序 toggle、help modal 等純前端互動。
    4. **e2e（需 Firebase 部分）**：建立留言、resolve、reply → 用 Firebase emulator 或 test project + seed，避免動到正式資料。
    5. **ui-flow skill**：對產出的 ui-flow HTML（template/tournament）兩 viewport 截圖 baseline。
  - **落點**：`prototype-comments/test/visual/`（fixtures + runner + baselines）；ui-flow skill 端在 `~/.claude/skills/prototype-flow-doc/` 加截圖比對步驟。
  - **狀態**：✅ MVP DONE 2026-05-30 — `test/visual/`：`fixture.html`（純 sample DOM）+ `visual-shot.js`（ESM runner，**不複製 CSS**：直接 `import { STYLES }`，注入後截 desktop 1440×900 + mobile 375×812）+ `baselines/`（已建）。涵蓋 pin 各態 / 放大 ×4 / reactions / toolbar / reply / B5 popover。**上線即抓到並驗證了 A3 圓角**。關鍵教訓：舊 `render-test.html` 手抄一份過時 pin CSS（圓形 teal）→ 測不到真退化；C2 鐵則是載真實 STYLES。設計見 `docs/2026-05-30-feat-c2-visual-regression.md`。
  - **✅ #8 視覺 runner 改 pixelmatch（2026-05-30）**：byte 比對 → `pixelmatch` + `pngjs`（dev deps），每像素 threshold 0.1 + 整圖容忍 0.2%，尺寸不符判 fail，DIFFER 輸出 `*.diff.png` + `process.exit(1)` 供 CI gate。**根因修正**：截圖前注入 `*{animation:none;transition:none}` 停用動畫——`pc-pin-flash`(.55s×2) 與 `pc-pin.moving`(pulse 無限) 會讓每次截到不同 frame 造成假 DIFFER（連兩次 run 0px 差異驗證確定性）。fixture pin markup 同步補 `.pc-pin-ic` 結構對齊 live render；B5 名單 popover 樣本改 list-only（對齊 #5）。
  - **✅ #7 GitHub Actions CI（2026-05-30）**：`.github/workflows/e2e.yml`（push/PR to main）→ `npm install`（repo gitignore lock，不可用 `npm ci`）+ `playwright install chromium --with-deps` + `npm run test:e2e`（**硬 gate**，mock firebase 跨平台一致）。視覺 regression 設 `continue-on-error`（informational）+ 上傳 `output/` 截圖與 diff 為 artifact——**因 baseline 在 macOS 產生，CI(Linux) 字型/emoji 字形渲染本質不同，pixelmatch 無法吸收**；要變硬 gate 需在同一 Linux 容器重產 baseline。npm scripts：`test:e2e` / `test:visual` / `test:visual:update` / `test`。
- **✅ C3 ui-flow 完整功能說明** — DONE 2026-05-30：ui-flow HTML 加首訪 onboarding overlay。首訪自動開、4 步引導（左側切畫面／點 hotspot 跳頁／設計⇄工程／留言），`localStorage('uiflow-onboarding-dismissed')` 記住關閉，左下角「?」FAB 可重開（避開 pc.js 右側 bar），`window.showOnboarding()` 可程式開啟。RWD：桌機置中卡片、手機 bottom-sheet（避開 mobile-nav）、ESC/背景點關閉。套用 `ui-flow-template.html`（master，03-generate 產的 flow 自動繼承）+ `tournament-ui-flow.html`（live）。兩檔 HTML tag 平衡 + 內嵌 JS `node --check` 通過。

---

## 3. 🧭 Roadmap 評估（含分析，非僅清單）

### R1. ui-flow 多模式產出
- **現況**：prototype-first — 設計師做好 React/Flutter prototype → 部署 Netlify → ui-flow skill 截圖 + overlay + dev note。
- **新模式**：spec + design-system(Storybook) → 直接生「設計稿 + ui-flow」，讓 ui-flow 能在 prototype 之前就存在（流程更前置）。實驗對象：**羽球比賽系統**（已有 Storybook）。
- **可行性**：Storybook 有穩定 story ID，可用 iframe 嵌入 component；spec（/plan 文件）描述畫面組成。技術上可「依 spec 組合 Storybook stories 成畫面」。
- **效益 / 成本**：效益高（左移、設計與程式同源）；成本高。
- **建議分階段**：① 先做 R3（畫面區塊綁 story ID）→ ② 由 stories 組合單一畫面 → ③ 由 spec 驅動整段 flow。先在羽球比賽系統做 PoC。

### R2. 設計稿留言 → 自動 report.html
- **目標**：當 ui-flow 有設計稿留言 (pc.js) 時，產出報告：每畫面 = 截圖 + 該畫面 unresolved 留言（標記點 + 列表）。雙用途：① 給人閱讀 ② 當 AI 修正設計稿/prototype 的資料來源。
- **可行性**：高。留言已在 Firestore（依 `projectId` 可查）；截圖管線已存在（prototype-flow-doc skill capture）。
- **管線**：query unresolved comments → 每畫面截圖 → 合成（截圖 + pin 標記 + 留言清單）→ 輸出 `report.html`（html-doc 樣板）+ 一份 machine-readable JSON/MD 給 AI。
- **成本**：中。**建議**：留言系統穩定後優先做，這是現有 capture + pc.js 的自然延伸，價值最高。

### R3. UI component 畫面綁定 Storybook id
- **公司流程**：react/flutter prototype → Netlify → ui-flow kit 產畫面流程交付。希望把 ui-flow 畫面區塊對應到 Storybook component ID，建立 設計↔component↔code 追溯。
- **可行性**：中–高。靠 data 屬性 / mapping manifest：capture 時記錄每區塊對應的 story ID（prototype DOM 帶 `data-storybook-id` 或外部 manifest）。
- **成本**：中–高（依 prototype 是否吐 story ID）。**建議**：先做「手動 mapping manifest」拿到追溯價值，再自動化。是 R1 的前置基石。

### R4. dev note 可讀性 — ✅ DONE 2026-05-30
- **目標**：檢視 ui-flow skill 產 dev note 那段，讓輸出更好讀懂。
- **檢視點**：`~/.claude/skills/prototype-flow-doc/scripts/03-generate*` 產 devNotes 的邏輯 / prompt。
- **改法**：白話、行動導向、依 tag 分組、去術語、明確「這版改了什麼」。
- **成本**：低。**建議**：快速 win，連同 C3 一起做。
- **實作**：新增 `references/dev-note-writing.md` 撰寫規範（5 條硬規則 + tag 表 + 好壞對照 + 寫完自檢），SKILL.md「devNotes 寫白話」與完成檢查兩處連結進去。順手把 `03-generate.js` pcInit 殘留的 `authBarTarget:'.header'` 移除（對齊 D3 浮底，避免每次產 flow 又把 bar 塞回 header）。`node --check` 通過。

### Roadmap 優先序建議
1. **R4 + C3**（低成本快速 win）
2. **R2 report.html**（價值最高、延伸現有管線）
3. **R3 storybook id 手動 manifest**（追溯基石）
4. **R1 spec→設計稿 多模式**（最大工程，分階段 PoC）

---

## 4.5 Repo 重整（使用者 2026-05-30 核准 Option A，**待 /compact 後執行**）

**決定**：通用 ui-flow / pc.js kit 收進 **prototype-comments**（pc.js 的真正 repo）+ 部署它自己的獨立說明站；kit index.html reference 內部 demo 站當 live demo。消費端專案只留專屬內容。

### 現況（散 3 處）
- `prototype-comments/`：`src/` pc.js 原始碼、`build.py`、`example/`、`test/`。本 session 的 src 修改已 commit（A1 回覆階層、A3+emoji 對話泡 pin、A4 emoji、B6 navigateToComment+pin-flash、F1–F4 之前修的）。
- 消費端 `docs/design/`：**通用 kit**（pc.js 複製、prototype-comments-guide/design-spec/firebase-setup、ui-flow-template/process/improvement-roadmap、design-system、index.html）＋ **專屬**（tournament-ui-flow、tournament-ui-mockup）。
- 內部 demo 部署資料夾：示例 flow + pc.js 複製 + 密碼閘 → live demo 站。

### 重整步驟（Option A）
1. 在 prototype-comments 建 `docs/`（或 `site/`），把這些**通用 kit 檔**從消費端搬過去：`prototype-comments-guide.html`、`prototype-comments-design-spec.html`、`prototype-comments-firebase-setup.html`、`ui-flow-template.html`、`ui-flow-process.html`、`ui-flow-improvement-roadmap.html`、`design-system.html`、`index.html`（kit 著陸頁）。
2. `build.py` 改成同時輸出 pc.js 到 `prototype-comments/docs/pc.js`（站內自用）；消費端與內部 demo 改為**消費 release artifact**（複製 build 好的 pc.js，不再各自為政）。記錄 sync 指令。
3. kit `index.html`：reference 內部 demo 站（密碼閘）當 live demo 連結。
4. 修所有搬移檔的相對路徑（pc.js 引用、彼此連結、Firebase config）。
5. 部署 prototype-comments/docs → **新 netlify 站**（kit 說明站）。
6. 消費端 `docs/design/` 只留 `tournament-ui-flow.html`、`tournament-ui-mockup.html` + 一份消費用 pc.js；移除已搬走的通用檔，更新消費端 `AGENTS.md`「現有設計文件」表與 index 連結。
7. **三處 commit 分離**：prototype-comments（src 改 + kit docs 進場）、消費端專案（移除通用檔、留專屬）、內部 demo 部署資料夾（pc.js 同步 + init 改）。各自 repo 各自 commit，不混。
8. guide.html 內過時的 `authBarTarget:'.header'` 說明（B1/B2 待辦）一併在搬移時更新。

### 注意
- prototype-comments 是公開 github repo → 搬進去的文件**不得含內部專案機密**（部署 id、密碼、內部功能名、內部截圖）；demo 連結指向「有密碼閘」的站即可，不把內部截圖塞進公開 kit repo。
- design-spec 原本主 repo + worktree 兩份同步問題，搬進 prototype-comments 後變單一來源，順便解掉。

## 4.6 pc.js 發布策略 — 取代「每專案複製一份」（使用者 2026-05-30 拍板順序）

**痛點**：pc.js 是 `build.py` 產的 bundle，各消費端（設計站、內部 demo 站）各存一份 copy；改一次要 `cp` + 重部署多處，維護麻煩。

**關鍵技術前提**：消費端是**靜態 HTML 設計站**（無 bundler / npm build step），用 ESM `import { initPrototypeComments } from './pc.js'` 引入。→ 純 `npm install` 對靜態站無直接幫助，要嘛 CDN、要嘛 bundler。

**拍板順序（使用者同意，現在不過早正式化，避免綁手綁腳）**：
1. **先把手上 C2 / A3 / B5 收尾**。
2. **執行 Option A**：通用 kit 全收進 prototype-comments（含 skill source 放 repo `skills/` + symlink 到 `~/.claude/skills/`，讓 skill 跟 kit 一起版控）。
3. **用一陣子**，等出現「要 publish / 要 semver / 多個 consumer」其中之一，**才**考慮 npm workspaces 正式 package 化。

**未來 package 化的技術選項（③ 階段再定，先記錄避免忘）**：
- **A. jsDelivr from GitHub（傾向）**：build → commit `dist/pc.js` → git tag → 各 HTML 改引 `https://cdn.jsdelivr.net/gh/mpragnarok/prototype-comments@<tag>/dist/pc.js`。零複製、版本可控、免 npm publish。版本策略：`@<tag>` 可 pin（改版各站 bump 一個字串，仍遠輕於 `cp` 整檔）；`@latest` 自動更新但有 CDN 快取延遲、不可 pin。
- **B. npm publish + CDN**：正式 `@scope/pc`，`npm i`（給未來有 bundler 的 consumer）+ unpkg/jsDelivr（給靜態站）。版本生態完整，但要 npm 帳號 + publish 流程。
- **C. 維持複製但自動化**：`build.py` 一次輸出到所有消費端路徑 + sync script（治標，仍是多份 copy）。

→ **傾向 A**。

### ✅ 已實作（2026-05-30，使用者主動要求「html 直接引用、不複製」→ ③ 觸發提前）
A 方案（jsDelivr from GitHub）已上線：
- `build.py` 多輸出 `dist/pc.js`，commit 進 repo（`.gitignore` 用 `dist/*` + `!dist/pc.js`）並 push GitHub。
- jsDelivr 服務 `https://cdn.jsdelivr.net/gh/mpragnarok/prototype-comments@main/dist/pc.js`（已 200 驗證）。
- **所有消費端 HTML 改引 CDN，零複製**：vitallink `protocol-setting-flow.html`、jubo `tournament-ui-flow.html` / `ui-flow-template.html`。
- **改 pc.js 流程**：改 `src/` → `python3 build.py` → commit `dist/pc.js` + push → `curl https://purge.jsdelivr.net/gh/mpragnarok/prototype-comments@main/dist/pc.js`（讓 @main 立即更新，否則 ~12h 快取）。
- 未來要 pin 版本改 `@<tag>`；npm workspaces 仍不在現階段。

## 4. 部署 / 驗證備忘
- pc.js bundle：`prototype-comments/build.py` → 消費端 `docs/design/pc.js`（~78,000 chars）。改完跑 `node --check`。
- 內部 demo 站、kit docs 站的具體 netlify site id 與密碼 → 見私有部署筆記（不寫入本公開 repo）。改 pc.js 要 `cp` 過去再部署。
- design-spec 有兩份（主 repo + worktree）需同步。
