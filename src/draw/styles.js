/**
 * draw/styles — 繪圖層的 CSS（DRAW_STYLES 常數）與注入函式 injectDrawStyles。
 * 一次性以 <style id="pc-draw-styles"> 注入 document.head；與 src/styles.js（留言層樣式）分屬不同層。
 */

export const DRAW_STYLES = `
/* ── 語意色 token（design system）：draw 引擎 chrome 用色集中於此，逐處以 var() 取用。
   ⚠️ 筆刷 8 色調色盤（DRAW_COLORS，draw/constants.js）＝功能性使用者色盤，不在此收斂、原值不動。
   純白 #fff、繪圖內容色 #E5484D（文字工具 ink）、彩虹自訂色 swatch，以及陰影/遮罩 rgba 效果值
   維持字面值（非品牌色，收斂無益且易致視覺漂移）。 */
:root {
  /* accent — 系統主色（violet：選取/啟用/連結/紀錄強調） */
  --pc-accent: #635a8f;
  --pc-accent-strong: #4d4670;
  --pc-accent-ring: #6b4fb5;         /* spotlight 聚焦環 */
  --pc-accent-rgb: 99, 90, 143;      /* rgba() 淡色底用 */
  /* status */
  --pc-danger: #BA1A1A;              /* 自繪物件高亮（紅） */
  --pc-danger-rgb: 186, 26, 26;
  --pc-danger-ink: #b91c1c;          /* danger 按鈕文字/邊框 */
  --pc-danger-hover: #d64545;        /* 移除鈕 hover */
  --pc-success: #0d7a4f;             /* 已送出 */
  --pc-success-rgb: 22, 163, 74;
  --pc-warning: #B7791F;             /* 已排佇列（琥珀） */
  --pc-warning-ink: #9a6a00;         /* 未送出文字 */
  --pc-warning-rgb: 183, 121, 31;
  /* 深色 surface（工具列/選單/help/context/fab/popover） */
  --pc-surface-dark: #1e1e1e;
  --pc-surface-dark-hover: #333;
  --pc-border-dark: #444;
  --pc-divider-dark: #3a3a3a;
  --pc-on-dark: #e5e7eb;
  --pc-on-dark-muted: #9aa0a6;
  /* 淺色 surface / neutral ramp（便利貼卡＋側欄抽屜，沿用留言層 slate） */
  --pc-surface-note: #fffdf7;
  --pc-surface-muted: #f8fafc;
  --pc-ink: #1f2937;
  --pc-ink-strong: #111827;
  --pc-ink-2: #475569;
  --pc-ink-3: #6b7280;
  --pc-slate: #1e293b;
  --pc-muted: #94a3b8;
  --pc-border: #cbd5e1;
  --pc-border-2: #e2e8f0;
  --pc-border-3: #eef2f6;
}

/* width/height:100% 不可省：<svg> 是 replaced element，預設 intrinsic 300×150，
   只給 inset:0 不會撐滿 host → 超出 300px 的點會穿到底下的 app（pointerdown 收不到）。 */
#pc-draw { position: absolute; inset: 0; width: 100%; height: 100%; z-index: 220; pointer-events: none; }
#pc-draw.pc-draw-active { pointer-events: auto; cursor: crosshair; }
#pc-draw.pc-draw-select { cursor: default; }
/* ── 元件註記層（note 模式：hover 框元件 → 點選 → 對元件下 prompt，AI 回方案卡）── */
.pc-note-layer { position: absolute; inset: 0; width: 100%; height: 100%; z-index: 225; pointer-events: none; }
.pc-note-layer.pc-note-active { pointer-events: auto; cursor: crosshair; }
/* hover 高亮框（inspect 式虛線）：DOM 元件 teal、自繪物件 red */
.pc-note-hl { position: absolute; pointer-events: none; box-sizing: border-box; border-radius: 6px; z-index: 1; }
.pc-note-hl.is-dom { outline: 2px dashed var(--pc-accent); outline-offset: 1px; background: rgba(var(--pc-accent-rgb), .06); }
.pc-note-hl.is-obj { outline: 2px dashed var(--pc-danger); outline-offset: 1px; background: rgba(var(--pc-danger-rgb), .06); }
.pc-note-hl-label { position: absolute; top: -20px; left: 0; background: var(--pc-accent); color: #fff;
  font-size: 11px; font-weight: 600; padding: 1px 7px; border-radius: 5px; white-space: nowrap; }
.pc-note-hl.is-obj .pc-note-hl-label { background: var(--pc-danger); }
/* 元件上的留言標記：持續實線外框（貼齊元件、零間隙）+ 角落圓 badge（violet=DOM、red=自繪）。
   badge 騎在框左上「角」外側（不落在框內緣）→ 不覆蓋元件內容；外框 pointer-events:none 讓底層仍可
   被 hover/點選下一則 note，只有 badge 可點。系統色改用 violet（避免與 Jubo teal 品牌色打架）。 */
.pc-note-mark { position: absolute; box-sizing: border-box; pointer-events: none; z-index: 2;
  border: 2px solid var(--pc-accent); border-radius: 6px; }
.pc-note-mark.is-obj { border-color: var(--pc-danger); }
.pc-note-mark.is-point { border: none; width: 0; height: 0; } /* 無法解析範圍 → 只剩 badge */
.pc-note-tab { position: absolute; left: 0; top: 0; transform: translate(-50%, -50%);
  pointer-events: auto; cursor: pointer; display: flex; align-items: center; justify-content: center;
  width: 21px; height: 21px; border-radius: 50%; background: var(--pc-accent); color: #fff;
  font-size: 11px; font-weight: 700; line-height: 1; border: 2px solid #fff;
  box-shadow: 0 1px 4px rgba(0,0,0,.3); }
.pc-note-mark.is-obj .pc-note-tab { background: var(--pc-danger); }
.pc-note-tab:hover { filter: brightness(1.1); }
.pc-note-card.is-focused { box-shadow: 4px 4px 0 rgba(17,24,39,.9); border-color: var(--pc-ink-strong); }
.pc-note-mark.is-dim { opacity: 0.4; }
/* spotlight：聚焦某則 note 時，用超大 box-shadow 把四周罩暗、只留目標元件亮著 + 亮環（Driver.js/Shepherd 式）。
   外框內側透明 → 底層元件透出來仍是亮的；四周 rgba 暗罩由 noteLayer(inset:0) 裁切。 */
.pc-note-mark.is-spotlight { box-shadow: 0 0 0 3px var(--pc-accent-ring), 0 0 0 9999px rgba(15,23,42,.55); }
.pc-note-mark.is-spotlight.is-obj { box-shadow: 0 0 0 3px var(--pc-danger), 0 0 0 9999px rgba(15,23,42,.55); }
/* 貼元件的對話卡：中性墨黑「手繪便利貼」皮（辨識度靠形/描邊/陰影，不靠色 → 疊任何頁面都不撞色）。
   prompt 在上、AI 方案卡在下；左上小尾巴指向被標元件。 */
.pc-note-card {
  position: absolute; transform: translate(10px, 8px); pointer-events: auto; z-index: 3;
  background: var(--pc-surface-note); color: var(--pc-ink); border: 2px solid var(--pc-ink); border-radius: 13px 9px 15px 8px; width: 232px;
  box-shadow: 3px 3px 0 rgba(31,41,55,.85); font-size: 13px; line-height: 1.5; overflow: visible;
}
.pc-note-card::after { /* 指向元件的小尾巴（左上 → 指向卡片上方的錨點）*/
  content: ''; position: absolute; left: 18px; top: -11px; width: 0; height: 0;
  border-width: 0 9px 11px 9px; border-style: solid; border-color: transparent transparent var(--pc-ink) transparent;
}
.pc-note-card-head { display: flex; align-items: center; justify-content: space-between; gap: 6px;
  background: transparent; border-bottom: 1px dashed var(--pc-border); padding: 8px 11px 6px; font-size: 11.5px; font-weight: 700; color: var(--pc-ink); }
.pc-note-card-head .pc-n-target { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.pc-note-card-head button { border: none; background: transparent; color: var(--pc-ink-3); font-size: 13px; cursor: pointer; padding: 0 2px; line-height: 1; }
.pc-note-card-body { padding: 9px 11px 11px; }
.pc-note-card textarea {
  width: 100%; box-sizing: border-box; resize: vertical; min-height: 50px; border-radius: 8px 6px 9px 5px;
  border: 1.5px solid var(--pc-ink); background: #fff; color: var(--pc-ink); padding: 6px 8px; font: inherit; font-size: 12.5px;
}
.pc-note-prompt-text { white-space: pre-wrap; word-break: break-word; background: #fff; color: var(--pc-ink);
  border: 1.5px solid var(--pc-ink); border-radius: 8px 6px 9px 5px; padding: 7px 9px; font-size: 12.5px; }
.pc-note-prompt-lbl { font-size: 10px; font-weight: 700; color: var(--pc-ink-3); margin-bottom: 2px; }
.pc-note-row { display: flex; gap: 6px; justify-content: flex-end; margin-top: 8px; }
.pc-note-row button { border: 1.5px solid var(--pc-ink); border-radius: 8px 6px 9px 5px; padding: 4px 12px; font-size: 12px; cursor: pointer; color: #fff; background: var(--pc-ink-strong); }
.pc-note-row button.ghost { background: #fff; color: var(--pc-ink); }
.pc-note-row button.danger { background: #fff; color: var(--pc-danger-ink); border-color: var(--pc-danger-ink); }
.pc-note-reply-slot { margin-top: 9px; }
.pc-note-expand { margin-top: 8px; font-size: 11.5px; color: var(--pc-ink); font-weight: 700; cursor: pointer; background: none; border: none; padding: 0; text-decoration: underline; }
/* 兩段式：放大成置中大面板（複雜圖文好讀） */
.pc-note-backdrop { position: fixed; inset: 0; background: rgba(15,23,42,.45); z-index: 2147483646; }
.pc-note-panel { position: fixed; left: 50%; top: 50%; transform: translate(-50%,-50%); z-index: 2147483647;
  background: #fff; color: var(--pc-ink); border-radius: 14px; width: min(560px, 92vw); max-height: 84vh; overflow: hidden;
  display: flex; flex-direction: column; box-shadow: 0 24px 60px rgba(0,0,0,.4); }
.pc-note-panel-head { display: flex; align-items: center; justify-content: space-between; padding: 13px 16px;
  border-bottom: 1px solid #eef0f2; font-weight: 700; color: var(--pc-accent-strong); }
.pc-note-panel-head button { border: none; background: transparent; font-size: 18px; color: var(--pc-muted); cursor: pointer; }
.pc-note-panel-body { padding: 16px; overflow-y: auto; }
.pc-draw-selection rect[data-handle] { cursor: nwse-resize; }
.pc-draw-toolbar {
  position: fixed; left: 50%; bottom: 20px; transform: translateX(-50%);
  z-index: 2147483600; display: flex; align-items: center; gap: 4px;
  background: var(--pc-surface-dark); padding: 6px; border-radius: 12px;
  box-shadow: 0 6px 24px rgba(0,0,0,.35); font-family: system-ui, -apple-system, sans-serif;
}
.pc-draw-tool {
  position: relative;
  width: 34px; height: 34px; border: none; border-radius: 8px; cursor: pointer;
  background: transparent; color: var(--pc-on-dark); font-size: 16px; line-height: 1;
  display: flex; align-items: center; justify-content: center; transition: background .12s;
}
.pc-draw-tool:hover { background: var(--pc-surface-dark-hover); }
/* 只有「目前工具」該highlight。滑鼠點過/快捷鍵切換後殘留的瀏覽器 focus 外框會讓上一個工具看起來也被選 →
   滑鼠 focus 不顯外框（鍵盤 Tab 導覽的 :focus-visible 仍保留，維持無障礙）。 */
.pc-draw-tool:focus:not(:focus-visible) { outline: none; }
.pc-draw-tool.active { background: var(--pc-accent); color: #fff; }
.pc-draw-tool svg { display: block; }
/* 常駐數字快捷鍵徽章（Excalidraw 風格，右下角、不擋點擊、不位移圖示） */
.pc-draw-kbd {
  position: absolute; right: 3px; bottom: 1px; pointer-events: none;
  font: 9px/1 system-ui, -apple-system, sans-serif; color: rgba(229,231,235,.55);
}
.pc-draw-tool.active .pc-draw-kbd { color: rgba(255,255,255,.7); }
.pc-draw-help-btn { font-weight: 700; font-size: 17px; }
/* 快捷鍵／使用說明 modal */
.pc-draw-help-modal {
  position: fixed; inset: 0; z-index: 2147483602; display: flex;
  align-items: center; justify-content: center; background: rgba(0,0,0,.5);
  font-family: system-ui, -apple-system, sans-serif;
}
.pc-draw-help-box {
  width: 340px; max-width: 88vw; max-height: 80vh; overflow: auto;
  background: var(--pc-surface-dark); color: var(--pc-on-dark); border-radius: 12px;
  box-shadow: 0 12px 40px rgba(0,0,0,.5);
}
.pc-draw-help-hd {
  display: flex; align-items: center; justify-content: space-between;
  padding: 12px 14px; border-bottom: 1px solid var(--pc-surface-dark-hover); font-weight: 600;
}
.pc-draw-help-x { background: transparent; border: none; color: #aaa; font-size: 15px; cursor: pointer; line-height: 1; }
.pc-draw-help-body { padding: 12px 14px; }
.pc-draw-help-sec-t { font-size: 12px; color: var(--pc-on-dark-muted); margin: 14px 0 6px; }
.pc-draw-help-sec-t:first-child { margin-top: 0; }
.pc-draw-help-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 4px 14px; }
.pc-draw-help-row { display: flex; align-items: center; justify-content: space-between; gap: 8px; font-size: 13px; padding: 3px 0; }
.pc-draw-help-row kbd, .pc-draw-help-desc kbd {
  font: 11px/1 ui-monospace, monospace; background: var(--pc-surface-dark-hover); color: var(--pc-on-dark);
  border-radius: 4px; padding: 3px 6px; border: 1px solid var(--pc-border-dark); white-space: nowrap;
}
.pc-draw-help-desc { font-size: 12px; color: #c5c9ce; line-height: 1.6; }
.pc-draw-help-link {
  display: inline-block; margin-top: 12px; color: var(--pc-accent); font-size: 13px; text-decoration: none;
}
.pc-draw-help-link:hover { text-decoration: underline; }
/* 收合 FAB（off 模式時取代整條工具列的右下小圓鈕） */
.pc-draw-collapsed { display: none !important; }
.pc-draw-fab {
  position: fixed; right: 20px; bottom: 20px; z-index: 2147483600;
  width: 48px; height: 48px; border-radius: 50%; border: none; cursor: pointer;
  background: var(--pc-surface-dark); color: var(--pc-on-dark); box-shadow: 0 6px 24px rgba(0,0,0,.35);
  display: none; align-items: center; justify-content: center;
}
.pc-draw-fab.show { display: flex; }
.pc-draw-fab:hover { background: var(--pc-accent); color: #fff; }
.pc-draw-fab svg { width: 22px; height: 22px; }
/* 回饋匣（opt-in feedbackBox）：右下常駐單鍵，打包標註＋決策一次送出。
   放 bottom:80px 讓開它時（draw/note 模式）避開底部置中工具列，收合成 FAB 時也不疊到 FAB（right/bottom:20）。 */
.pc-draw-feedback-box {
  position: fixed; right: 20px; bottom: 80px; z-index: 2147483601;
  border: none; border-radius: 999px; cursor: pointer;
  padding: 11px 20px; font-size: 14px; font-weight: 700; line-height: 1;
  font-family: system-ui, -apple-system, sans-serif;
  background: var(--pc-accent); color: #fff;
  box-shadow: 0 6px 24px rgba(0,0,0,.28);
  transition: background .12s, opacity .12s;
}
.pc-draw-feedback-box:hover { background: var(--pc-accent-strong); }
.pc-draw-feedback-box.is-empty { background: var(--pc-surface-dark); opacity: .55; cursor: default; }
.pc-draw-feedback-box.is-sent { background: #2f9e44; }
.pc-draw-sep { width: 1px; height: 22px; background: var(--pc-divider-dark); margin: 0 2px; }
/* 顏色/線粗收進 popover，避免 pill 過長溢出 */
.pc-draw-menu { position: relative; display: flex; align-items: center; }
.pc-draw-cur-color { width: 18px; height: 18px; border-radius: 50%; border: 2px solid #555; display: block; }
.pc-draw-popover {
  position: absolute; bottom: calc(100% + 10px); left: 50%; transform: translateX(-50%);
  display: none; flex-wrap: wrap; gap: 8px; width: 152px; box-sizing: border-box;
  background: var(--pc-surface-dark); padding: 10px; border-radius: 10px; box-shadow: 0 6px 24px rgba(0,0,0,.4);
}
.pc-draw-popover-width { width: auto; flex-wrap: nowrap; }
.pc-draw-menu.open .pc-draw-popover { display: flex; }
.pc-draw-swatch {
  width: 22px; height: 22px; border-radius: 50%; padding: 0; cursor: pointer;
  border: 2px solid transparent;
}
.pc-draw-swatch.active { border-color: #fff; box-shadow: 0 0 0 1px var(--pc-accent); }
/* 第 9 顆：彩虹圓 + 「+」，明確邀請「挑自己的顏色」 */
.pc-draw-custom-swatch {
  position: relative; display: flex; align-items: center; justify-content: center;
  border-color: #fff; cursor: pointer; overflow: hidden;
  background: conic-gradient(#f00, #ff0, #0f0, #0ff, #00f, #f0f, #f00);
}
.pc-draw-custom-swatch::after {
  content: '+'; font: bold 15px system-ui, sans-serif; color: #fff;
  text-shadow: 0 0 2px rgba(0,0,0,.7); line-height: 1; pointer-events: none;
}
.pc-draw-color-custom {
  position: absolute; inset: 0; width: 100%; height: 100%;
  opacity: 0; padding: 0; border: none; cursor: pointer;
}
.pc-draw-width {
  width: 30px; height: 30px; border: none; border-radius: 8px; cursor: pointer;
  background: transparent; display: flex; align-items: center; justify-content: center;
}
.pc-draw-width:hover { background: var(--pc-surface-dark-hover); }
.pc-draw-width.active { background: var(--pc-accent); }
.pc-draw-disabled { opacity: .35; cursor: not-allowed; }
.pc-draw-eyedropper { color: var(--pc-on-dark); }
/* 右鍵 context menu */
.pc-draw-context {
  position: fixed; z-index: 2147483601; display: none; flex-direction: column;
  min-width: 132px; padding: 4px; background: var(--pc-surface-dark); border-radius: 8px;
  box-shadow: 0 6px 24px rgba(0,0,0,.4); font-family: system-ui, -apple-system, sans-serif;
}
.pc-draw-context.open { display: flex; }
.pc-draw-context-item {
  display: flex; align-items: center; gap: 8px; width: 100%;
  padding: 6px 8px; border: none; border-radius: 6px; cursor: pointer;
  background: transparent; color: var(--pc-on-dark); font-size: 13px; text-align: left;
}
.pc-draw-context-item:hover { background: var(--pc-accent); color: #fff; }
.pc-draw-context-item svg { flex: none; }
.pc-draw-text-input {
  position: absolute; z-index: 230; width: auto !important; min-width: 80px; max-width: 60vw;
  box-sizing: content-box; font: 14px system-ui, sans-serif;
  color: #E5484D; background: rgba(255,255,255,.92); border: 1px solid #E5484D;
  border-radius: 4px; padding: 2px 4px; outline: none;
}
/* ── P6 側邊「標注紀錄」面板（右緣 tab + 抽屜，沿用 spec-overlay 互動）──────────────
   position:fixed + 高 z-index；pointer-events 只在面板本身（tab/drawer），不擋畫布。
   預設 drawer 關閉（off by default）→ comment-only/一般使用不被打擾，靠 tab 才打開。 */
.pc-draw-rec-tab {
  position: fixed; top: 62%; right: 0; transform: translateY(-50%); z-index: 2147483603;
  display: none; border: none; cursor: pointer; background: var(--pc-accent); color: #fff;
  padding: 14px 7px; border-radius: 10px 0 0 10px; box-shadow: -2px 0 12px rgba(0,0,0,.2);
  writing-mode: vertical-rl; font: 700 12px/1 system-ui, -apple-system, sans-serif; letter-spacing: 2px;
  transition: background .15s;
}
.pc-draw-rec-tab:hover { background: var(--pc-accent-strong); }
.pc-draw-rec-tab.show { display: block; }
.pc-draw-rec-drawer {
  position: fixed; top: 0; right: 0; bottom: 0; z-index: 2147483602;
  width: 300px; max-width: 90vw; background: #fff; border-left: 1px solid var(--pc-border-2);
  display: flex; flex-direction: column; box-shadow: -2px 0 16px rgba(0,0,0,.12);
  transform: translateX(100%); transition: transform .22s ease;
  font-family: system-ui, -apple-system, sans-serif;
}
.pc-draw-rec-drawer.open { transform: translateX(0); }
.pc-draw-rec-hd { display: flex; align-items: center; gap: 8px; padding: 12px 14px; border-bottom: 1px solid var(--pc-border-3); }
.pc-draw-rec-hd-title { color: var(--pc-accent); font-weight: 700; font-size: 13px; }
.pc-draw-rec-count { background: rgba(var(--pc-accent-rgb), .12); color: var(--pc-accent-strong); border-radius: 9px;
  font-size: 10px; padding: 1px 7px; line-height: 16px; }
.pc-draw-rec-close { margin-left: auto; border: none; background: none; cursor: pointer;
  color: var(--pc-muted); font-size: 18px; line-height: 1; padding: 2px 4px; }
.pc-draw-rec-close:hover { color: var(--pc-ink-2); }
.pc-draw-rec-list { padding: 10px; overflow-y: auto; flex: 1; background: var(--pc-surface-muted); }
.pc-draw-rec-row {
  display: flex; align-items: center; gap: 9px; width: 100%; text-align: left;
  background: #fff; border: 1px solid var(--pc-border-3); border-radius: 7px; padding: 8px 10px;
  margin-bottom: 8px; cursor: pointer; box-shadow: 0 1px 2px rgba(0,0,0,.04);
}
.pc-draw-rec-row:last-child { margin-bottom: 0; }
.pc-draw-rec-row:hover { border-color: var(--pc-accent); }
.pc-draw-rec-row.selected { border-color: var(--pc-accent); background: rgba(var(--pc-accent-rgb), .08); box-shadow: 0 0 0 1px var(--pc-accent); }
.pc-draw-rec-icon { flex: none; width: 22px; height: 22px; display: flex; align-items: center; justify-content: center; color: var(--pc-ink-2); }
.pc-draw-rec-icon svg { display: block; }
.pc-draw-rec-swatch { flex: none; width: 12px; height: 12px; border-radius: 50%; border: 1px solid rgba(0,0,0,.15); }
.pc-draw-rec-group { flex: none; font-size: 11px; line-height: 1; opacity: .75; }
.pc-draw-rec-row.is-grouped { border-left: 2px solid var(--pc-accent); }
.pc-draw-rec-body { min-width: 0; flex: 1; }
.pc-draw-rec-status { flex: none; font-size: 10px; font-weight: 700; padding: 2px 6px; border-radius: 999px; white-space: nowrap; }
.pc-draw-rec-status.is-sent { color: var(--pc-success); background: rgba(var(--pc-success-rgb), .12); }
.pc-draw-rec-status.is-unsent { color: var(--pc-warning-ink); background: rgba(var(--pc-warning-rgb), .14); }
.pc-draw-rec-check { flex: none; width: 16px; height: 16px; margin: 0; cursor: pointer; accent-color: var(--pc-accent); }
.pc-draw-rec-all-wrap { display: inline-flex; align-items: center; gap: 4px; font-size: 11px; color: var(--pc-ink-2); cursor: pointer; user-select: none; }
.pc-draw-rec-all { width: 14px; height: 14px; margin: 0; cursor: pointer; accent-color: var(--pc-accent); }
/* AI 方案卡層：錨定在標注旁。容器不吃指標，卡片本身吃。 */
.pc-draw-reply-layer { position: absolute; inset: 0; pointer-events: none; z-index: 2147483640; }
.pc-draw-reply-card { position: absolute; pointer-events: auto; max-width: 300px; transform: translate(12px, 12px);
  background: #fff; border: 1.5px solid var(--pc-accent); border-radius: 10px; padding: 10px 12px;
  box-shadow: 0 6px 24px rgba(var(--pc-accent-rgb), .22); font: 13px/1.5 system-ui, -apple-system, sans-serif; color: var(--pc-slate); }
.pc-draw-reply-head { font-size: 11px; font-weight: 700; color: var(--pc-accent-strong); margin-bottom: 4px; display: flex; align-items: center; justify-content: space-between; }
.pc-draw-reply-close { border: none; background: transparent; color: var(--pc-muted); font-size: 13px; line-height: 1; cursor: pointer; padding: 0 2px; }
.pc-draw-reply-close:hover { color: var(--pc-ink-2); }
.pc-draw-rec-remove { flex: none; border: none; background: transparent; color: #b0bcc8; font-size: 12px; line-height: 1; cursor: pointer; padding: 2px 4px; }
.pc-draw-rec-remove:hover { color: var(--pc-danger-hover); }
.pc-draw-reply-text { margin-bottom: 8px; white-space: pre-wrap; }
.pc-draw-reply-opts { display: flex; flex-wrap: wrap; gap: 6px; }
.pc-draw-reply-opts.is-rich { flex-direction: column; flex-wrap: nowrap; gap: 8px; }
.pc-draw-reply-opt { padding: 6px 10px; border: 1px solid var(--pc-accent); border-radius: 7px; background: rgba(var(--pc-accent-rgb), .08);
  color: var(--pc-accent-strong); font-size: 12px; font-weight: 600; cursor: pointer; }
.pc-draw-reply-opt:hover { background: var(--pc-accent); color: #fff; }
.pc-draw-reply-opts.is-rich .pc-draw-reply-opt { background: var(--pc-surface-muted); color: var(--pc-slate); }
.pc-draw-reply-opts.is-rich .pc-draw-reply-opt:hover { background: #eef7f7; border-color: var(--pc-accent-strong); color: var(--pc-slate); }
.pc-draw-reply-opt-label { font-weight: 700; color: var(--pc-accent-strong); font-size: 13px; }
.pc-draw-reply-opt-desc { font-weight: 400; color: var(--pc-ink-2); font-size: 12px; margin-top: 2px; }
.pc-draw-reply-preview { margin: 6px 0 0; padding: 6px 8px; background: #fff; border: 1px solid var(--pc-border-2); border-radius: 6px;
  font: 11px/1.45 ui-monospace, SFMono-Regular, Menlo, monospace; color: #334155; white-space: pre; overflow-x: auto; }
/* 真實 UI 預覽：用頁面全域樣式渲染。pointer-events:none → 戳不會誤觸；margin 歸零避免卡片內過寬留白。 */
.pc-draw-reply-mock { margin: 6px 0; padding: 8px; background: #fff; border: 1px dashed var(--pc-border); border-radius: 6px; pointer-events: none; }
.pc-draw-reply-mock .field, .pc-draw-reply-mock fieldset { margin: 0 !important; }
.pc-draw-reply-choose { margin-top: 8px; width: 100%; padding: 6px 10px; border: none; border-radius: 7px;
  background: var(--pc-accent); color: #fff; font-size: 12px; font-weight: 700; cursor: pointer; }
.pc-draw-reply-choose:hover { background: var(--pc-accent-strong); }
.pc-draw-reply-chosen { color: var(--pc-success); font-weight: 700; font-size: 12px; }
.pc-draw-reply-rechoose { margin-top: 6px; padding: 3px 10px; border: 1px solid var(--pc-border); border-radius: 6px;
  background: #fff; color: var(--pc-ink-2); font-size: 12px; cursor: pointer; }
.pc-draw-reply-rechoose:hover { border-color: var(--pc-accent); color: var(--pc-accent-strong); background: #f4fbfb; }
.pc-draw-rec-text { color: var(--pc-slate); font-size: 12px; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.pc-draw-rec-sel { margin-top: 2px; color: var(--pc-accent-strong); font: 10px/1.4 ui-monospace, SFMono-Regular, Menlo, monospace;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.pc-draw-rec-empty { color: var(--pc-muted); font-size: 12px; text-align: center; padding: 28px 12px; line-height: 1.6; }
/* ── 抽屜 footer：「送給 AI（N）」主要送出按鈕（teal 主色）── */
.pc-draw-rec-footer { padding: 10px 14px; border-top: 1px solid var(--pc-border-3); background: #fff; }
.pc-draw-rec-send-btn {
  width: 100%; padding: 8px; border: none; border-radius: 7px; cursor: pointer;
  background: var(--pc-accent); color: #fff; font: 600 13px/1.4 system-ui, -apple-system, sans-serif;
  transition: background .12s, opacity .12s;
}
.pc-draw-rec-send-btn:disabled { opacity: .5; cursor: not-allowed; }
.pc-draw-rec-send-btn:not(:disabled):hover { background: var(--pc-accent-strong); }
/* AI 未連線、已排佇列：用琥珀色與「已送達」的綠/teal 區隔，讓使用者一眼看出差異。 */
.pc-draw-rec-send-btn.pc-draw-rec-queued { background: var(--pc-warning); }
.pc-draw-rec-send-btn.pc-draw-rec-queued:disabled { opacity: .85; }
`;

export function injectDrawStyles() {
  if (document.getElementById('pc-draw-styles')) return;
  const s = document.createElement('style');
  s.id = 'pc-draw-styles';
  s.textContent = DRAW_STYLES;
  document.head.appendChild(s);
}
