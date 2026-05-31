export const STYLES = `
/* ── prototype-comments ──────────────────────────── */

/* Auth Bar */
.pc-auth-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-left: 12px;
  padding-left: 12px;
  border-left: 1px solid #e5e7eb;
}
.pc-sign-in-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  border-radius: 8px;
  border: 1.5px solid #e5e7eb;
  background: #fff;
  font-size: 12px;
  font-weight: 600;
  color: #374151;
  cursor: pointer;
  font-family: inherit;
  transition: all .15s;
  white-space: nowrap;
}
.pc-sign-in-btn:hover { background: #f9fafb; border-color: #9ca3af; }
.pc-user-avatar {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  object-fit: cover;
  border: 2px solid #e5e7eb;
}
.pc-user-name {
  font-size: 12px;
  font-weight: 600;
  color: #374151;
  max-width: 80px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.pc-comment-toggle {
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 6px 12px;
  border-radius: 8px;
  border: 1.5px solid #e5e7eb;
  background: #fff;
  font-size: 12px;
  font-weight: 600;
  color: #6b7280;
  cursor: pointer;
  font-family: inherit;
  transition: all .15s;
  white-space: nowrap;
}
.pc-comment-toggle.active {
  background: #0FA0A0;
  color: #fff;
  border-color: #0FA0A0;
}
.pc-comment-toggle:hover:not(.active) { background: #f0fdf9; border-color: #0FA0A0; color: #0FA0A0; }

/* Overlay (design mode) */
.pc-overlay {
  position: absolute;
  inset: 0;
  z-index: 200;
  pointer-events: none; /* overlay itself doesn't block clicks unless active */
  border-radius: inherit;
}
.pc-overlay.active {
  pointer-events: all;
  /* teal circle + white plus; fallback to crosshair */
  cursor: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24'%3E%3Ccircle cx='12' cy='12' r='11' fill='%230FA0A0' opacity='.85'/%3E%3Cpath d='M12 7v10M7 12h10' stroke='%23fff' stroke-width='2.5' stroke-linecap='round'/%3E%3C/svg%3E") 12 12, crosshair;
}
/* Pins inside overlay are always clickable regardless of overlay state */
.pc-overlay .pc-pin {
  pointer-events: all !important;
  cursor: pointer;
}

/* Comment Pin — 對話泡 bubble (方案 C)
   rounded-rect 比例（寬>高）+ 左下尾巴 → 單一數字也讀得出 speech bubble；不加白圈 */
.pc-pin {
  position: absolute;
  display: flex;
  align-items: center;
  justify-content: center;
  min-width: 30px;
  height: 22px;
  padding: 0 8px 1px;
  border-radius: 11px;                 /* 四角統一圓角；尾巴從底邊直線段長出 */
  background: #BA1A1A;
  color: #fff;
  font-size: 12px;
  font-weight: 700;
  font-family: monospace;
  cursor: pointer;
  z-index: 210;
  box-shadow: 0 2px 6px rgba(0,0,0,.3);
  transform: translate(-50%, -50%) scale(var(--pc-pin-scale, 1));
  transform-origin: center;
  transition: transform .15s, opacity .15s;
  pointer-events: all;
}
.pc-pin::before {                        /* 對話泡尾巴，左下角指向錨點 */
  content: '';
  position: absolute;
  bottom: -5px;
  left: 10px;
  width: 0; height: 0;
  border-left: 5px solid transparent;
  border-right: 6px solid transparent;
  border-top: 8px solid #BA1A1A;
}
.pc-pin:hover { transform: translate(-50%, -50%) scale(calc(var(--pc-pin-scale, 1) * 1.2)); }
/* 長按計時 / 拖曳中：停用 hover 放大，避免游標脫離 pin 觸發 mouseleave 取消長按 */
.pc-pin.pressing { transform: translate(-50%, -50%) scale(var(--pc-pin-scale, 1)); }
.pc-pin.moving { transform: translate(-50%, -50%) scale(var(--pc-pin-scale, 1)); opacity: .7; cursor: grabbing; box-shadow: 0 4px 14px rgba(0,0,0,.4); }
.pc-pin.resolved {
  background: #6b7280;                  /* gray-500：白字對比度 ~4.6:1 達 WCAG AA，一眼讀得出 ✓ */
  color: #fff;
  opacity: .80;                          /* 仍保留「已解決=次要、退到背景」語意，但不再糊掉 */
}
.pc-pin.resolved::before { border-top-color: #6b7280; }
.pc-pin.pc-pin-edge::before { display: none; }   /* edge pin 用 ::after 箭頭，不顯示泡泡尾巴 */
.pc-pin-label { line-height: 1; display: inline-flex; align-items: center; gap: 1px; }
.pc-pin-ic { flex: 0 0 16px; display: inline-flex; justify-content: center; overflow: hidden; }   /* icon 固定寬框(不縮不漲) → 💬/✓ 同寬，resolved 與未解決 pin 對齊 */

/* B6: 「全部留言」導向同頁時，pin 閃爍高亮讓留言「跳出來」 */
.pc-pin.pc-pin-flash { animation: pc-pin-flash .55s ease 2; z-index: 211; }
@keyframes pc-pin-flash {
  0%, 100% { transform: translate(-50%, -50%) scale(var(--pc-pin-scale, 1)); box-shadow: 0 2px 6px rgba(0,0,0,.3); }
  50%      { transform: translate(-50%, -50%) scale(calc(var(--pc-pin-scale, 1) * 1.5)); box-shadow: 0 0 0 4px rgba(186,26,26,.35), 0 2px 8px rgba(0,0,0,.35); }
}

/* Emoji reactions */
.pc-ci-reactions { display: flex; flex-wrap: wrap; gap: 4px; margin: 6px 0 2px; align-items: center; }
.pc-reaction-chip {
  display: inline-flex; align-items: center; gap: 3px;
  padding: 2px 7px; border-radius: 12px; cursor: pointer;
  border: 1px solid #e5e7eb; background: #f8fafc; font-size: 12px; line-height: 1.4;
  font-family: inherit; transition: all .12s;
}
.pc-reaction-chip span { font-size: 11px; color: #64748b; font-weight: 600; }
.pc-reaction-chip:hover { border-color: #cbd5e1; }
.pc-reaction-chip.mine { background: #FFDAD6; border-color: #BA1A1A; }
.pc-reaction-chip.mine span { color: #BA1A1A; }
.pc-reaction-add {
  width: 22px; height: 22px; border-radius: 50%; cursor: pointer;
  border: 1px dashed #cbd5e1; background: #fff; font-size: 12px; line-height: 1;
  display: inline-flex; align-items: center; justify-content: center; opacity: .65;
}
.pc-reaction-add:hover { opacity: 1; border-color: #0FA0A0; }
.pc-emoji-picker {
  position: fixed; z-index: 2147483647; display: flex; gap: 2px;
  background: #fff; border: 1px solid #e5e7eb; border-radius: 10px;
  padding: 5px 7px; box-shadow: 0 6px 24px rgba(0,0,0,.16);
}
.pc-emoji-opt {
  border: none; background: none; cursor: pointer; font-size: 18px;
  width: 30px; height: 30px; border-radius: 7px; line-height: 1;
}
.pc-emoji-opt:hover { background: #f1f5f9; }
/* B5: 手機 tap reaction chip → 顯示誰按了 + toggle */
.pc-reaction-users {
  position: fixed; z-index: 2147483647;
  background: #fff; border: 1px solid #e5e7eb; border-radius: 10px;
  padding: 8px; box-shadow: 0 6px 24px rgba(0,0,0,.16);
  min-width: 140px; max-width: 230px;
}
.pc-reaction-users-row { display: flex; align-items: center; padding: 4px 5px; font-size: 13px; color: #334155; }
.pc-reaction-users-toggle {
  margin-top: 6px; width: 100%; box-sizing: border-box;
  border: 1px solid #e5e7eb; background: #f8fafc; color: #475569;
  border-radius: 7px; padding: 7px; cursor: pointer; font-family: inherit; font-size: 12px;
}
.pc-reaction-users-toggle:hover { border-color: #0FA0A0; color: #0FA0A0; }
.pc-reaction-users-toggle.mine { background: #FFDAD6; border-color: #BA1A1A; color: #BA1A1A; }

/* All-comments panel search */
.pc-panel-search { padding: 8px 12px 4px; }
.pc-panel-search-input {
  width: 100%; box-sizing: border-box; padding: 7px 10px;
  border: 1px solid #e5e7eb; border-radius: 8px; font-size: 13px;
  font-family: inherit; outline: none;
}
.pc-panel-search-input:focus { border-color: #0FA0A0; }
.pc-panel-toolbar { display: flex; align-items: center; gap: 8px; padding: 0 12px 8px; flex-wrap: wrap; }
.pc-panel-tagchips { display: flex; flex-wrap: wrap; gap: 4px; flex: 1; min-width: 0; }
.pc-panel-tagchip { font-size: 11px; padding: 3px 9px; border-radius: 12px; border: 1px solid #e5e7eb; background: #fff; color: #64748b; cursor: pointer; font-family: inherit; }
.pc-panel-tagchip:hover { border-color: #cbd5e1; }
.pc-panel-tagchip.active { background: #0FA0A0; border-color: #0FA0A0; color: #fff; }
.pc-panel-sort { font-size: 12px; padding: 4px 10px; border-radius: 8px; border: 1px solid #e5e7eb; background: #f8fafc; color: #475569; cursor: pointer; font-family: inherit; white-space: nowrap; }
.pc-panel-sort:hover { border-color: #0FA0A0; color: #0FA0A0; }

/* @mention */
.pc-mention { color: #0FA0A0; font-weight: 600; }
.pc-mention-pop {
  position: fixed; z-index: 2147483647; background: #fff;
  border: 1px solid #e5e7eb; border-radius: 8px; box-shadow: 0 6px 24px rgba(0,0,0,.16);
  max-height: 200px; overflow-y: auto; padding: 4px;
}
.pc-mention-opt {
  display: flex; align-items: center; gap: 8px; width: 100%;
  border: none; background: none; cursor: pointer; padding: 6px 8px;
  border-radius: 6px; font-size: 13px; font-family: inherit; text-align: left;
}
.pc-mention-opt:hover { background: #f1f5f9; }
.pc-mention-opt img, .pc-mention-ph { width: 22px; height: 22px; border-radius: 50%; flex-shrink: 0; object-fit: cover; }
.pc-mention-ph { background: #e5e7eb; }

/* Note/eng reply threads (1-level nesting) */
.pc-note-replies { margin-left: 22px; padding-left: 10px; border-left: 2px solid #eef2f2; display: flex; flex-direction: column; gap: 6px; margin-top: 4px; }
.pc-reply-box { margin-top: 6px; }
.pc-panel-inline-thread { margin-top: 8px; padding-top: 8px; border-top: 1px dashed #e5e7eb; cursor: default; }

/* Input Popover */
.pc-popover {
  position: fixed;
  z-index: 9999;
  background: #fff;
  border-radius: 12px;
  box-shadow: 0 8px 32px rgba(0,0,0,.16);
  padding: 12px;
  width: 260px;
  border: 1px solid #e5e7eb;
}
.pc-popover-header {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 8px;
}
.pc-popover-avatar {
  width: 22px;
  height: 22px;
  border-radius: 50%;
  object-fit: cover;
}
.pc-popover-author {
  font-size: 12px;
  font-weight: 600;
  color: #374151;
  flex: 1;
}
.pc-popover-close {
  width: 20px;
  height: 20px;
  border-radius: 4px;
  border: none;
  background: #f3f4f6;
  color: #6b7280;
  cursor: pointer;
  font-size: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
}
.pc-textarea {
  width: 100%;
  min-height: 72px;
  border: 1.5px solid #e5e7eb;
  border-radius: 8px;
  padding: 8px 10px;
  font-size: 13px;
  color: #1f2937;
  resize: none;
  outline: none;
  font-family: inherit;
  line-height: 1.5;
}
.pc-textarea:focus { border-color: #0FA0A0; }
.pc-popover-actions {
  display: flex;
  gap: 6px;
  margin-top: 8px;
  justify-content: flex-end;
}
.pc-btn-cancel {
  padding: 6px 12px;
  border-radius: 7px;
  border: 1px solid #e5e7eb;
  background: #fff;
  color: #6b7280;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  font-family: inherit;
}
.pc-btn-submit {
  padding: 6px 14px;
  border-radius: 7px;
  border: none;
  background: #0FA0A0;
  color: #fff;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  font-family: inherit;
  transition: opacity .15s;
}
.pc-btn-submit:disabled { opacity: .5; cursor: default; }

/* Comment Thread (in popover) */
.pc-thread { display: flex; flex-direction: column; gap: 8px; margin-bottom: 8px; }
.pc-comment-item {
  display: flex;
  gap: 7px;
  align-items: flex-start;
}
.pc-ci-avatar {
  width: 20px;
  height: 20px;
  border-radius: 50%;
  object-fit: cover;
  flex-shrink: 0;
  margin-top: 1px;
}
.pc-ci-body { flex: 1; }
.pc-ci-meta {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 2px;
}
.pc-ci-author { font-size: 11px; font-weight: 700; color: #374151; }
.pc-ci-time { font-size: 10px; color: #9ca3af; }
.pc-ci-text { font-size: 12px; color: #374151; line-height: 1.5; }
.pc-ci-actions {
  display: flex;
  gap: 8px;
  margin-top: 3px;
}
.pc-ci-action {
  font-size: 10px;
  color: #9ca3af;
  cursor: pointer;
  background: none;
  border: none;
  padding: 0;
  font-family: inherit;
}
.pc-ci-action:hover { color: #374151; }
.pc-ci-action.resolve { color: #0FA0A0; }

/* Decision（採用/不採用/待議）— 採用=olive、待議=clay、不採用=灰(不可用紅) */
.pc-ci-dec-badge {
  font-size: 9px;
  font-weight: 700;
  padding: 1px 6px;
  border-radius: 8px;
  color: #fff;
  letter-spacing: .03em;
}
.pc-ci-dec-badge.accepted { background: #788C5D; }
.pc-ci-dec-badge.pending  { background: #D97757; }
.pc-ci-dec-badge.rejected { background: #6b7280; }
.pc-ci-decision {
  display: flex;
  gap: 6px;
  margin-top: 6px;
}
.pc-ci-dec-btn {
  font-size: 10px;
  font-weight: 600;
  padding: 3px 9px;
  border-radius: 999px;
  cursor: pointer;
  background: #fff;
  border: 1.5px solid #e5e7eb;
  color: #9ca3af;
  font-family: inherit;
  transition: all .12s;
}
.pc-ci-dec-btn:hover { border-color: #d1d5db; color: #6b7280; }
.pc-ci-dec-btn.accepted.active { background: #788C5D; border-color: #788C5D; color: #fff; }
.pc-ci-dec-btn.pending.active  { background: #D97757; border-color: #D97757; color: #fff; }
.pc-ci-dec-btn.rejected.active { background: #6b7280; border-color: #6b7280; color: #fff; }
.pc-ci-dec-note {
  margin-top: 6px;
  width: 100%;
  font-size: 11px;
  padding: 5px 8px;
  border: 1px solid #e5e7eb;
  border-radius: 6px;
  font-family: inherit;
  color: #374151;
  box-sizing: border-box;
}
.pc-ci-dec-note:focus { outline: none; border-color: #0FA0A0; }

/* Note Comment Badge */
.pc-note-badge {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  font-size: 10px;
  font-weight: 700;
  color: #0FA0A0;
  background: rgba(15,160,160,.1);
  border-radius: 999px;
  padding: 1px 6px;
  margin-left: 6px;
  cursor: pointer;
  flex-shrink: 0;
  transition: background .15s;
}
.pc-note-badge:hover { background: rgba(15,160,160,.2); }
.pc-note-comment-btn {
  display: flex;
  align-items: center;
  gap: 3px;
  font-size: 10px;
  font-weight: 600;
  color: #9ca3af;
  background: none;
  border: none;
  cursor: pointer;
  padding: 0 4px;
  font-family: inherit;
  margin-left: auto;
  flex-shrink: 0;
  opacity: 0.3;
  transition: color .15s, opacity .15s;
}
.pc-note-comment-btn:hover { color: #0FA0A0; }
.eng-note-row:hover .pc-note-comment-btn,
.dev-note-v2:hover .pc-note-comment-btn { opacity: 1; }
.pc-note-thread {
  display: none;
  flex-direction: column;
  gap: 6px;
  padding: 8px 12px 10px 28px;
  border-top: 1px solid #f3f4f6;
  background: #fafafa;
}
.pc-note-thread.open { display: flex; }
.pc-note-input-wrap {
  display: flex;
  gap: 6px;
  align-items: flex-start;
  margin-top: 6px;
}
.pc-note-textarea {
  flex: 1;
  min-height: 52px;
  border: 1.5px solid #e5e7eb;
  border-radius: 8px;
  padding: 6px 8px;
  font-size: 12px;
  color: #1f2937;
  resize: none;
  outline: none;
  font-family: inherit;
  line-height: 1.5;
}
.pc-note-textarea:focus { border-color: #0FA0A0; }
.pc-note-submit {
  padding: 6px 10px;
  border-radius: 7px;
  border: none;
  background: #0FA0A0;
  color: #fff;
  font-size: 11px;
  font-weight: 600;
  cursor: pointer;
  font-family: inherit;
  align-self: flex-end;
}
.pc-note-submit:disabled { opacity: .5; }

/* ── Global Comment Panel ────────────────────────────────────── */
.pc-panel {
  position: fixed;
  top: 0;
  right: 0;
  width: 320px;
  height: 100vh;
  background: #fff;
  border-left: 1px solid #e5e7eb;
  box-shadow: -4px 0 24px rgba(0,0,0,.1);
  z-index: 8900;
  display: flex;
  flex-direction: column;
  transform: translateX(100%);
  transition: transform .25s cubic-bezier(.4,0,.2,1);
  font-family: inherit;
}
.pc-panel.open { transform: translateX(0); }

.pc-panel-header {
  display: flex;
  align-items: center;
  padding: 14px 16px 12px;
  border-bottom: 1px solid #f3f4f6;
  flex-shrink: 0;
}
.pc-panel-title {
  font-size: 14px;
  font-weight: 700;
  color: #111827;
  flex: 1;
}

.pc-panel-tabs {
  display: flex;
  gap: 4px;
  padding: 10px 12px 8px;
  border-bottom: 1px solid #f3f4f6;
  flex-shrink: 0;
}
.pc-panel-tab {
  padding: 4px 12px;
  border-radius: 999px;
  border: 1.5px solid #e5e7eb;
  background: #fff;
  font-size: 11px;
  font-weight: 600;
  color: #6b7280;
  cursor: pointer;
  font-family: inherit;
  transition: all .15s;
}
.pc-panel-tab.active {
  background: #0FA0A0;
  border-color: #0FA0A0;
  color: #fff;
}
.pc-panel-tab:hover:not(.active) { border-color: #0FA0A0; color: #0FA0A0; }

.pc-panel-list {
  flex: 1;
  min-height: 0;                      /* flex child must shrink so overflow-y can scroll */
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
  overscroll-behavior: contain;
  padding: 8px 0;
}
.pc-panel-empty {
  padding: 32px 16px;
  text-align: center;
  font-size: 13px;
  color: #9ca3af;
}

.pc-panel-item {
  padding: 10px 16px;
  border-bottom: 1px solid #f9fafb;
  cursor: pointer;
  transition: background .1s;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.pc-panel-item:hover { background: #f9fafb; }
.pc-panel-item.resolved { opacity: .6; }

.pc-panel-top-row {
  display: flex;
  align-items: center;
  gap: 5px;
  flex-wrap: wrap;
}
.pc-panel-chip {
  font-size: 10px;
  font-weight: 700;
  color: #0FA0A0;
  background: rgba(15,160,160,.1);
  padding: 1px 6px;
  border-radius: 4px;
  text-transform: uppercase;
  letter-spacing: .5px;
}
.pc-panel-num {
  font-size: 11px;
  font-weight: 700;
  color: #374151;
}
.pc-panel-resolved-badge {
  font-size: 10px;
  color: #10b981;
  font-weight: 600;
}

.pc-panel-meta {
  display: flex;
  align-items: center;
  gap: 5px;
}
.pc-panel-excerpt {
  font-size: 12px;
  color: #374151;
  line-height: 1.5;
  margin: 0;
  white-space: pre-wrap;
  word-break: break-word;
}
.pc-panel-reply-count {
  font-size: 10px;
  color: #9ca3af;
}

/* Pin visibility toggle */
.pc-pins-hidden .pc-pin { display: none !important; }

/* Edge-docked pins (off-screen content) */
.pc-pin.pc-pin-edge { opacity: .75; }
.pc-pin.pc-pin-edge-top::after,
.pc-pin.pc-pin-edge-bottom::after {
  content: '';
  position: absolute;
  left: 50%;
  transform: translateX(-50%);
  width: 0; height: 0;
  border-left: 4px solid transparent;
  border-right: 4px solid transparent;
}
.pc-pin.pc-pin-edge-top::after {
  bottom: calc(100% + 2px);
  border-bottom: 5px solid #0FA0A0;
}
.pc-pin.pc-pin-edge-bottom::after {
  top: calc(100% + 2px);
  border-top: 5px solid #0FA0A0;
}

/* Help button */
.pc-help-btn {
  width: 24px; height: 24px;
  border-radius: 50%;
  border: 1.5px solid #e5e7eb;
  background: #fff;
  color: #6b7280;
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
  font-family: inherit;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  transition: all .15s;
}
.pc-help-btn:hover { border-color: #0FA0A0; color: #0FA0A0; }

/* Help modal */
.pc-help-modal {
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,.45);
  z-index: 10000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
}
.pc-help-box {
  background: #fff;
  border-radius: 16px;
  box-shadow: 0 12px 40px rgba(0,0,0,.2);
  width: 100%;
  max-width: 360px;
  max-height: 80vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.pc-help-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 16px 12px;
  font-size: 14px;
  font-weight: 700;
  color: #111827;
  border-bottom: 1px solid #f3f4f6;
  flex-shrink: 0;
}
.pc-help-close { flex-shrink: 0; }
.pc-help-body {
  overflow-y: auto;
  padding: 12px 16px 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.pc-help-section { display: flex; flex-direction: column; gap: 3px; }
.pc-help-title { font-size: 12px; font-weight: 700; color: #1f2937; }
.pc-help-desc { font-size: 12px; color: #4b5563; line-height: 1.6; }
.pc-help-desc kbd {
  display: inline-block;
  padding: 0 4px;
  border-radius: 4px;
  border: 1px solid #d1d5db;
  background: #f9fafb;
  font-size: 10px;
  font-family: monospace;
}

/* Pin relocation — drag state */
@keyframes pc-pin-pulse {
  from { box-shadow: 0 2px 8px rgba(15,160,160,.5), 0 0 0 3px #0FA0A0; }
  to   { box-shadow: 0 2px 8px rgba(15,160,160,.8), 0 0 0 6px rgba(15,160,160,.3); }
}
.pc-pin.moving {
  animation: pc-pin-pulse .6s ease-in-out infinite alternate;
  z-index: 220;
  transition: none !important;
}
body.pc-dragging, body.pc-dragging * { cursor: grabbing !important; }

/* Auth bar responsive — mobile: floating pill above bottom nav */
@media (max-width: 767px) {
  #pc-auth-mobile-wrap .pc-auth-bar { gap: 4px; border-left: none; margin-left: 0; padding-left: 0; }
  #pc-auth-mobile-wrap .pc-user-name { display: none; }
  .pc-signin-text { display: none; }
  #pc-auth-mobile-wrap .pc-sign-in-btn { padding: 6px 8px; }

  /* All-comments panel: full-width + dynamic viewport height so the list scrolls
     (100vh is taller than the visible area on mobile → bottom was unreachable) */
  .pc-panel {
    width: 100vw;
    height: 100dvh;
    max-height: 100dvh;
  }
}
`;
