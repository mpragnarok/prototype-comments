# 規格文件：resolved 修正 / drag 修復 / B5 重設計 / CI（2026-05-30 批次）

> 依 AGENTS.md 強制流程：動工前先定規格 + SSOT + design 影響，**等使用者確認才寫 code**。
> 使用者已定方向：drag=修好長按、B5 toggle=click/tap 仍 toggle、CI=先只跑 e2e。

---

## 1. fix — resolved pin 真實站跑版

**現象**（Image #2）：真實設計站上 resolve 後的 pin = **紅泡 + 灰尾 + 灰字**，跟未解決 pin 長不一樣。
**已知**：C2 fixture 的靜態 `resolved` pin 渲染**正常**（灰泡灰尾）。差異在**真實站走 JS render**（`renderPins` line 858 動態建 `pc-pin resolved`），fixture 是手寫靜態 DOM。
**動工首步**：在 fixture 加「動態 render 重現」或直接在真實站重現，確認 background 灰沒生效的真因（候選：bundle CSS 順序、`--pc-pin-scale` 互動、某 class 覆蓋）。**先重現再修，不盲改。**
**目標行為**：resolved pin 整顆灰（泡 + 尾），**形狀/尺寸跟未解決一致**，只差顏色 + `✓`/`💬`。
**Design 影響**：無新條款（resolved 灰本就是設計）；確保符合「pin 紅只給未解決」。
**Test**：
- visual：fixture 加「resolved vs 未解決**並排同 threadCount** 對比」cell（直接擋住「長不一樣」）。
- e2e：建 comment → resolve toggle → assert pin 有 `resolved` class、label 變 `✓`。
**SSOT**：roadmap §2.A 加此 fix 記錄。

---

## 2. fix — pin 長按拖曳失效

**根因**：`authorUid` 欄位正確（非欄位問題）。最可能 `.pc-pin:hover` 放大 1.2x → mousedown 後 pin 邊界外移、游標脫離 → `mouseleave` 觸發 `cancelPress` → 500ms timer 被清 → 長按沒反應。
**修法**：
- 改用 **Pointer Events** 統一 mouse/touch；mousedown/pointerdown 時 `setPointerCapture` 抓住游標（脫離 pin 也不 cancel）。
- 長按計時期間加 class 暫時**停用 hover scale**（`.pc-pin.pressing { transform 不放大 }`），消除邊界跳動。
- 移除靠 `mouseleave` 取消的脆弱邏輯，改成「移動超過 threshold 或放開才結束」。
**目標行為**：自己的、未解決的 pin，長按 500ms → 進入拖曳（半透明跟隨）→ 放開存新 x/y%。手機桌機一致。
**邊界**：非自己 / 已解決 pin 不可拖；拖曳後的 click 不觸發 thread popover（`justDragged` 保留）；拖曳中 overlay 座標換算正確。
**Design 影響**：無；`.pc-pin.moving` 既有樣式沿用。
**Test**：
- e2e：模擬 pointerdown→等 500ms→pointermove→pointerup，assert comment x/y 更新 + 非自己 pin 不可拖。
- visual：`.pc-pin.moving`（拖曳中半透明）態加進 fixture。
**SSOT**：roadmap §2.A 加此 fix。

---

## 3. feat — B5 reaction「誰按了」重設計

**取代**我上一版（手機 tap 開 popover）。新規則：
- **桌機**：**hover** reaction chip → 顯示「誰按了」名單 popover；**click 仍 toggle** 自己的反應。
- **手機**：**長按** chip → 名單 popover；**tap 仍 toggle**。
- 桌機原本的 `title`（瀏覽器原生 tooltip）可保留當 fallback，但主要靠自繪 popover（可控樣式）。
**Design 影響**：popover 用既有 `.pc-reaction-users`（teal accent、mine 紅例外），符合不可變條款。
**邊界**：hover 移開 / 點別處 → popover 關；長按與「tap toggle」不衝突（長按 ≥400ms 才開名單、短放開才 toggle）；無人按的 emoji 不顯 popover。
**Test**：
- e2e：hover chip → popover 出現且名單正確；click → toggle（reactions 物件變動）；手機長按 → popover、tap → toggle。
- visual：reaction-users popover（mine/非 mine）已在 fixture，補 hover 態說明。
**SSOT**：roadmap §2.A B5 改寫成「hover/長按看名單 + click/tap toggle」。

---

## 4. feat — GitHub Actions CI

**範圍（使用者選「先只跑 e2e」）**：
- `.github/workflows/test.yml`：on push + PR → setup node → `npm ci` → `npx playwright install chromium` → `npm run test:e2e`。
- **visual regression 先不上 CI**（mac/Linux subpixel 差異易 flaky）；本地 `node test/visual/visual-shot.js` 把關。之後用 Linux baseline 或 pixelmatch threshold 再納入。
**前提**：e2e (`test/e2e-comments.spec.js`) 需能在 CI 無頭跑（確認不依賴真 Firebase；必要時加 mock/skip 標記）。
**Test**：CI 本身即測試管線；新增後推一次驗證 workflow 綠燈。
**SSOT**：roadmap §C 加 CI 項；AGENTS.md 已寫 CI 規範。

---

## 動工順序（確認後一起寫）
1. resolved 重現 + 修 + test　2. drag 修 + test　3. B5 重設計 + test　4. CI
每項：改 src → `build.py` rebuild + `node --check` → e2e + visual → 更新 SSOT 狀態 → 最後一起 commit/部署/push。
