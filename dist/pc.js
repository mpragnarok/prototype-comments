const STYLES = `
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
  background: #d1d5db;
  color: #6b7280;
  opacity: .7;
}
.pc-pin.resolved::before { border-top-color: #d1d5db; }
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

function createStore(fb, db, projectId) {
  const col = () => fb.collection(db, 'prototype-comments', projectId, 'comments');
  const ref = id => fb.doc(db, 'prototype-comments', projectId, 'comments', id);

  return {
    query:     (...constraints) => fb.query(col(), ...constraints),
    subscribe: (q, onChange, onErr) => fb.onSnapshot(
      q,
      snap => onChange(snap.docs.map(d => ({ id: d.id, ...d.data() }))),
      onErr
    ),
    save:   data => fb.addDoc(col(), { ...data, createdAt: fb.serverTimestamp() }),
    update: (id, data) => fb.updateDoc(ref(id), data),
    remove: id => fb.deleteDoc(ref(id)),
  };
}

function createNoteModule({
  store, getCurrentUser, getScreenId, engNoteSelector, getComments, noteKey, el, timeAgo,
  buildCommentItem, attachMentions,
}) {

  function getNoteComments(tag, text) {
    const key = noteKey(tag, text);
    return getComments().filter(c => c.type === 'note' && c.noteKey === key);
  }

  function renderNoteThread(threadEl, tag, text) {
    threadEl.innerHTML = '';
    const nc = getNoteComments(tag, text);
    const refresh = () => renderNoteThread(threadEl, tag, text);
    const user = getCurrentUser();
    const roots = nc.filter(c => !c.parentId);
    const repliesOf = id => nc.filter(c => c.parentId === id);

    const saveReply = parentId => async body => {
      await store.save({
        type: 'note', screenId: getScreenId(), noteKey: noteKey(tag, text), noteTag: tag, noteText: text,
        parentId, body,
        authorUid: user.uid, authorName: user.displayName || user.email, authorPhoto: user.photoURL || '', resolved: false,
      });
    };

    roots.forEach((c, i) => {
      threadEl.appendChild(buildCommentItem(c, i === 0, {
        onResolve: resolved => store.update(c.id, { resolved }),
        onDelete:  ()       => store.remove(c.id),
        onDeleteThread: ()  => Promise.all(getNoteComments(tag, text).map(t => store.remove(t.id))),
        onEdit:    body     => store.update(c.id, { body, edited: true }),
        onReact:   r        => store.update(c.id, { reactions: r }),
        onReply:   user ? saveReply(c.id) : null,
        onUpdated: refresh,
      }));
      const reps = repliesOf(c.id);
      if (reps.length) {
        const indent = el('div', 'pc-note-replies');
        reps.forEach(r => {
          indent.appendChild(buildCommentItem(r, false, {
            onDelete:  ()    => store.remove(r.id),
            onEdit:    body  => store.update(r.id, { body, edited: true }),
            onReact:   rr    => store.update(r.id, { reactions: rr }),
            // D1: replies 不可再回覆 — 不傳 onReply
            onUpdated: refresh,
          }));
        });
        threadEl.appendChild(indent);
      }
    });

    if (user) {
      const wrap = el('div', 'pc-note-input-wrap');
      const ta = el('textarea', 'pc-note-textarea', { placeholder: '留言…（@ 可標記人）' });
      if (attachMentions) attachMentions(ta);
      const btn = el('button', 'pc-note-submit', { disabled: '' });
      btn.textContent = '送出';
      ta.addEventListener('input', () => { btn.disabled = !ta.value.trim(); });
      btn.onclick = async () => {
        const body = ta.value.trim();
        if (!body) return;
        btn.disabled = true;
        await store.save({
          type:        'note',
          screenId:    getScreenId(),
          noteKey:     noteKey(tag, text),
          noteTag:     tag,
          noteText:    text,
          body,
          authorUid:   user.uid,
          authorName:  user.displayName || user.email,
          authorPhoto: user.photoURL || '',
          resolved:    false,
        });
        ta.value = '';
        btn.disabled = true;
      };
      wrap.appendChild(ta);
      wrap.appendChild(btn);
      threadEl.appendChild(wrap);
    } else {
      const hint = el('p', 'pc-ci-time');
      hint.textContent = '請先登入才能留言';
      hint.style.padding = '4px 0';
      threadEl.appendChild(hint);
    }
  }

  function injectNoteUI(rowEl, tag, text) {
    if (rowEl.dataset.pcInjected) return;
    rowEl.dataset.pcInjected = '1';

    const btn = el('button', 'pc-note-comment-btn');
    btn.innerHTML = '💬 留言';
    rowEl.appendChild(btn);

    const badge = el('span', 'pc-note-badge');
    badge.style.display = 'none';
    rowEl.appendChild(badge);

    const thread = el('div', 'pc-note-thread');
    rowEl.after(thread);

    function updateBadge() {
      const nc = getNoteComments(tag, text);
      if (nc.length > 0) {
        const t = `💬 ${nc.length}`;
        if (badge.textContent !== t) badge.textContent = t;
        badge.style.display = 'inline-flex';
      } else {
        badge.style.display = 'none';
      }
    }

    function toggleThread() {
      const open = thread.classList.toggle('open');
      if (open) renderNoteThread(thread, tag, text);
    }

    btn.onclick   = toggleThread;
    badge.onclick = toggleThread;

    rowEl.dataset.pcTag  = tag;
    rowEl.dataset.pcText = text;

    updateBadge();
    return { updateBadge };
  }

  function injectAll() {
    const injectedKeys = new Set();

    document.querySelectorAll(engNoteSelector).forEach(row => {
      const tag  = row.dataset.tag  || row.querySelector('[data-tag]')?.dataset.tag
                || row.querySelector('.snc-tag, .tag')?.textContent?.trim() || '';
      const text = row.dataset.text || row.querySelector('.note-text, p, span:not(.snc-tag):not(.tag)')?.textContent?.trim() || '';
      if (tag || text) {
        const k = noteKey(tag, text);
        if (!injectedKeys.has(k)) { injectNoteUI(row, tag, text); injectedKeys.add(k); }
      }
    });

    document.querySelectorAll('.dev-note-v2').forEach(row => {
      const tag  = row.dataset.tag  || row.querySelector('[data-tag]')?.dataset.tag
                || row.querySelector('.dn-tag-v2, .snc-tag, .tag')?.textContent?.trim() || '';
      const text = row.dataset.text || row.querySelector('p, .note-body')?.textContent?.trim()
                || Array.from(row.children).find(s => !s.classList.contains('dn-tag-v2'))?.textContent?.trim() || '';
      if (tag || text) {
        const k = noteKey(tag, text);
        if (!injectedKeys.has(k)) { injectNoteUI(row, tag, text); injectedKeys.add(k); }
      }
    });
  }

  function refresh({ updateThreads = false } = {}) {
    document.querySelectorAll('[data-pc-injected]').forEach(row => {
      const tag  = row.dataset.pcTag  || '';
      const text = row.dataset.pcText || '';
      const nc   = getNoteComments(tag, text);
      const badge = row.querySelector('.pc-note-badge');
      if (badge) {
        if (nc.length > 0) {
          const t = `💬 ${nc.length}`;
          if (badge.textContent !== t) badge.textContent = t;
          badge.style.display = 'inline-flex';
        } else {
          badge.style.display = 'none';
        }
      }
      if (updateThreads) {
        const thread = row.nextElementSibling;
        if (thread?.classList.contains('open')) {
          renderNoteThread(thread, tag, text);
        }
      }
    });
  }

  return { injectAll, refresh };
}

/**
 * prototype-comments
 * Drop-in Firebase comment overlay for HTML prototypes.
 *
 * Usage:
 *   import { initPrototypeComments } from '.../src/index.js';
 *   initPrototypeComments({ firebaseConfig, projectId, getScreenId, getMode,
 *                           designTarget, engNoteSelector, navigateTo });
 *
 * No secrets are stored here. All Firebase config is passed by the consumer.
 */


// ─── Firebase SDK (ESM, gstatic CDN) ────────────────────────────────────────
const FB_VER = '12.13.0';
const FB_BASE = `https://www.gstatic.com/firebasejs/${FB_VER}`;

async function loadFirebase() {
  const [
    { initializeApp, getApps, getApp },
    { getFirestore, collection, addDoc, onSnapshot, query, where,
      serverTimestamp, deleteDoc, doc, updateDoc },
    { getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged },
  ] = await Promise.all([
    import(`${FB_BASE}/firebase-app.js`),
    import(`${FB_BASE}/firebase-firestore.js`),
    import(`${FB_BASE}/firebase-auth.js`),
  ]);
  return {
    initializeApp, getApps, getApp,
    getFirestore, collection, addDoc, onSnapshot, query, where,
    serverTimestamp, deleteDoc, doc, updateDoc,
    getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged,
  };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
function injectStyles() {
  if (document.getElementById('pc-styles')) return;
  const s = document.createElement('style');
  s.id = 'pc-styles';
  s.textContent = STYLES;
  document.head.appendChild(s);
}

function timeAgo(ts) {
  if (!ts) return '';
  const sec = Math.floor((Date.now() - ts.toMillis()) / 1000);
  if (sec < 60) return '剛剛';
  if (sec < 3600) return `${Math.floor(sec / 60)} 分鐘前`;
  if (sec < 86400) return `${Math.floor(sec / 3600)} 小時前`;
  return `${Math.floor(sec / 86400)} 天前`;
}

function noteKey(tag, text) {
  return `${tag}::${(text || '').trim().slice(0, 40)}`;
}

function el(tag, cls, attrs = {}) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  Object.entries(attrs).forEach(([k, v]) => e.setAttribute(k, v));
  return e;
}

// ─── Main Init ───────────────────────────────────────────────────────────────
export async function initPrototypeComments(opts = {}) {
  const {
    firebaseConfig,
    projectId       = 'default',
    getScreenId     = () => 'unknown',
    getMode         = () => 'design',
    designTarget    = '#phone',
    engNoteSelector = '.eng-note-row',
    navigateTo        = null,   // (screenId: string) => void  — consumer provides
    authBarTarget     = null,   // CSS selector for a flex header to inject auth bar into
    scrollContainer   = null,   // CSS selector for scrollable body inside the phone frame
    _firebase         = null,   // 測試用：注入 in-memory firebase mock，略過 CDN load + 真 Firebase
  } = opts;

  if (!firebaseConfig && !_firebase) {
    console.error('[prototype-comments] firebaseConfig is required');
    return;
  }

  injectStyles();

  // Load Firebase SDK（測試可用 _firebase 注入 mock，略過 gstatic CDN）
  const fb = _firebase || await loadFirebase();

  // Init Firebase app (avoid duplicate)
  const app = fb.getApps().length
    ? fb.getApp()
    : fb.initializeApp(firebaseConfig);

  const db   = fb.getFirestore(app);
  const auth = fb.getAuth(app);

  // ── Store (Firebase seam) ──────────────────────────────────────────────────
  const store = createStore(fb, db, projectId);

  // ── State ──────────────────────────────────────────────────────────────────
  let currentUser = null;
  let commentMode  = false;
  let pinsVisible  = true;
  let unsub        = null;

  function togglePinsVisible() {
    pinsVisible = !pinsVisible;
    const overlay = document.getElementById('pc-overlay');
    if (overlay) overlay.classList.toggle('pc-pins-hidden', !pinsVisible);
    const btn = document.getElementById('pc-toggle-pins');
    if (btn) btn.style.opacity = pinsVisible ? '1' : '0.4';
  }

  // data state
  let comments    = [];
  let allComments = [];

  // scroll sync — re-attaches on every screen change because goto() replaces .body
  let _scrollEl = null;
  function refreshScrollEl() {
    if (!scrollContainer) return;
    const el = document.querySelector(scrollContainer);
    if (el === _scrollEl) return;
    if (_scrollEl) _scrollEl.removeEventListener('scroll', renderPins);
    _scrollEl = el;
    if (_scrollEl) _scrollEl.addEventListener('scroll', renderPins, { passive: true });
  }
  const getScrollTop = () => _scrollEl?.scrollTop ?? 0;

  // interaction state (UI lifecycle)
  const pin   = { current: null };          // pendingPin
  const pop   = { id: null, el: null };     // openPopoverId + popoverEl
  let movingPinId = null;                   // id of pin currently being relocated
  let isDragging  = false;                  // true while drag is in progress
  let dragPinEl   = null;                   // DOM element being dragged
  let justDragged = false;                  // suppress post-drag click event
  let lastDragX   = 0;                      // last cursor x during drag
  let lastDragY   = 0;                      // last cursor y during drag
  let autoScrollTimer = null;               // interval id for edge autoscroll
  let autoScrollDir   = 0;                  // 1 = down, -1 = up, 0 = none

  // panel state
  const panel = { open: false, filter: 'all', typeFilter: 'all', search: '', tagFilter: null, sort: 'new', expandedNote: null, el: null, listEl: null, unsub: null };

  // ── Auth Bar ───────────────────────────────────────────────────────────────
  function buildAuthBar() {
    const bar = el('div', 'pc-auth-bar');
    bar.id = 'pc-auth-bar';

    const signInBtn = el('button', 'pc-sign-in-btn');
    signInBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 48 48" fill="none"><path d="M44.5 20H24v8.5h11.8C34.7 33.9 30.1 37 24 37c-7.2 0-13-5.8-13-13s5.8-13 13-13c3.1 0 5.9 1.1 8.1 2.9l6.4-6.4C34.6 4.1 29.6 2 24 2 11.8 2 2 11.8 2 24s9.8 22 22 22c11 0 21-8 21-22 0-1.3-.2-2.7-.5-4z" fill="#4285F4"/><path d="M6.3 14.7l7 5.1C15.1 16.6 19.2 14 24 14c3.1 0 5.9 1.1 8.1 2.9l6.4-6.4C34.6 4.1 29.6 2 24 2 16.3 2 9.7 7.4 6.3 14.7z" fill="#EA4335"/><path d="M24 46c5.9 0 10.9-2 14.5-5.3l-6.7-5.5C29.7 36.9 27 38 24 38c-6.1 0-10.7-3.1-11.8-7.5l-7 5.4C9.2 43.1 16.1 46 24 46z" fill="#34A853"/><path d="M44.5 20H24v8.5h11.8c-.6 2.3-2 4.3-3.8 5.7l6.7 5.5C42.6 36.2 46 30.5 46 24c0-1.3-.2-2.7-.5-4h-1z" fill="#FBBC05"/></svg> <span class="pc-signin-text">Sign in with Google</span>`;
    signInBtn.onclick = () =>
      fb.signInWithPopup(auth, new fb.GoogleAuthProvider());

    bar.appendChild(signInBtn);
    bar.appendChild(buildHelpBtn());
    return { bar, signInBtn };
  }

  function renderAuthBar(user) {
    const bar = document.getElementById('pc-auth-bar');
    if (!bar) return;
    bar.innerHTML = '';

    if (!user) {
      const btn = el('button', 'pc-sign-in-btn');
      btn.innerHTML = `<svg width="14" height="14" viewBox="0 0 48 48" fill="none"><path d="M44.5 20H24v8.5h11.8C34.7 33.9 30.1 37 24 37c-7.2 0-13-5.8-13-13s5.8-13 13-13c3.1 0 5.9 1.1 8.1 2.9l6.4-6.4C34.6 4.1 29.6 2 24 2 11.8 2 2 11.8 2 24s9.8 22 22 22c11 0 21-8 21-22 0-1.3-.2-2.7-.5-4z" fill="#4285F4"/></svg> <span class="pc-signin-text">Sign in with Google</span>`;
      btn.onclick = () =>
        fb.signInWithPopup(auth, new fb.GoogleAuthProvider());
      bar.appendChild(btn);
      return;
    }

    if (user.photoURL) {
      const img = el('img', 'pc-user-avatar', { src: user.photoURL, alt: user.displayName });
      bar.appendChild(img);
    }
    const name = el('span', 'pc-user-name');
    name.textContent = user.displayName || user.email;
    bar.appendChild(name);

    const toggle = el('button', 'pc-comment-toggle');
    toggle.id = 'pc-comment-toggle';
    toggle.innerHTML = '💬 留言模式';
    toggle.onclick = () => setCommentMode(!commentMode);
    bar.appendChild(toggle);

    const togglePinBtn = el('button', 'pc-comment-toggle');
    togglePinBtn.id = 'pc-toggle-pins';
    togglePinBtn.title = '隱藏留言 pin';
    togglePinBtn.style.padding = '6px 8px';
    togglePinBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>`;
    togglePinBtn.onclick = togglePinsVisible;
    bar.appendChild(togglePinBtn);

    const panelBtn = el('button', 'pc-sign-in-btn');
    panelBtn.id = 'pc-panel-btn';
    panelBtn.style.cssText = 'font-size:11px;padding:4px 10px;';
    panelBtn.textContent = '📋 全部留言';
    panelBtn.onclick = () => panel.open ? closePanel() : openPanel();
    bar.appendChild(panelBtn);

    const so = el('button', 'pc-sign-in-btn pc-signout-btn');
    so.style.cssText = 'font-size:11px;opacity:.6;padding:4px 8px;';
    so.textContent = '登出';
    so.onclick = () => fb.signOut(auth);
    bar.appendChild(so);
    bar.appendChild(buildHelpBtn());
  }

  function buildHelpBtn() {
    const btn = el('button', 'pc-help-btn');
    btn.title = '使用說明';
    btn.textContent = '?';
    btn.onclick = showHelpModal;
    return btn;
  }

  function showHelpModal() {
    if (document.getElementById('pc-help-modal')) return;
    const modal = el('div', 'pc-help-modal');
    modal.id = 'pc-help-modal';
    modal.innerHTML = `
      <div class="pc-help-box">
        <div class="pc-help-header">
          <span>💬 留言系統使用說明</span>
          <button class="pc-popover-close pc-help-close" onclick="this.closest('#pc-help-modal').remove()">✕</button>
        </div>
        <div class="pc-help-body">
          <div class="pc-help-section">
            <div class="pc-help-title">🔑 登入</div>
            <div class="pc-help-desc">點選「Sign in with Google」登入後，即可使用所有留言功能。</div>
          </div>
          <div class="pc-help-section">
            <div class="pc-help-title">📌 新增 Pin 留言</div>
            <div class="pc-help-desc">點選「💬 留言模式」後，在畫面任意位置點一下放置 Pin，輸入留言後送出。</div>
          </div>
          <div class="pc-help-section">
            <div class="pc-help-title">↕️ 移動 Pin</div>
            <div class="pc-help-desc"><strong>長按 Pin 約 0.5 秒</strong>進入拖曳模式，拖曳至新位置後放開即儲存。按 <kbd>ESC</kbd> 取消。超出畫面的 Pin 會停靠在邊緣，同樣可長按拖曳。</div>
          </div>
          <div class="pc-help-section">
            <div class="pc-help-title">💬 查看與回覆</div>
            <div class="pc-help-desc">點選 Pin 開啟留言串，可在留言串底部直接回覆。</div>
          </div>
          <div class="pc-help-section">
            <div class="pc-help-title">✓ 標記完成</div>
            <div class="pc-help-desc">留言處理完後點「✓ Resolve」，Pin 變灰色表示已解決。</div>
          </div>
          <div class="pc-help-section">
            <div class="pc-help-title">👁 隱藏 Pin</div>
            <div class="pc-help-desc">點選眼睛圖示切換所有 Pin 的顯示狀態。</div>
          </div>
          <div class="pc-help-section">
            <div class="pc-help-title">📋 全部留言</div>
            <div class="pc-help-desc">點選「📋 全部留言」查看並跳轉到任意畫面的留言。</div>
          </div>
        </div>
      </div>`;
    modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
    document.body.appendChild(modal);
  }

  function mountAuthBar() {
    const wrap = el('div');
    const { bar } = buildAuthBar();
    wrap.appendChild(bar);
    const targetEl = authBarTarget ? document.querySelector(authBarTarget) : null;
    if (targetEl) {
      wrap.style.flexShrink = '0';
      targetEl.appendChild(wrap);
    } else {
      wrap.id = 'pc-auth-mobile-wrap';
      wrap.style.cssText = 'position:fixed;bottom:64px;right:12px;z-index:9000;background:#fff;border-radius:20px;box-shadow:0 2px 12px rgba(0,0,0,.15);padding:6px 10px;';
      document.body.appendChild(wrap);
    }
  }

  // ── Overlay & Positional Pins ──────────────────────────────────────────────
  function getDesignTarget() {
    return document.querySelector(designTarget);
  }

  function mountOverlay() {
    const target = getDesignTarget();
    if (!target || document.getElementById('pc-overlay')) return;
    if (getComputedStyle(target).position === 'static') {
      target.style.position = 'relative';
    }
    target.style.overflow = 'hidden';
    const overlay = el('div', 'pc-overlay');
    overlay.id = 'pc-overlay';
    target.appendChild(overlay);

    overlay.addEventListener('click', e => {
      if (!currentUser) return;
      e.stopPropagation();
      if (!commentMode) return;
      const rect = overlay.getBoundingClientRect();
      const scrollTop = getScrollTop();
      const x = parseFloat(((e.clientX - rect.left) / rect.width * 100).toFixed(2));
      const y = parseFloat(((e.clientY - rect.top + scrollTop) / rect.height * 100).toFixed(2));
      closeAllPopovers();
      pin.current = { x, y };
      console.log('[pc] overlay click → pin.current set to', pin.current);
      showInputPopover(e.clientX, e.clientY, null);
    });
  }

  function setCommentMode(active) {
    commentMode = active;
    const overlay = document.getElementById('pc-overlay');
    if (overlay) overlay.classList.toggle('active', active);
    const toggle = document.getElementById('pc-comment-toggle');
    if (toggle) toggle.classList.toggle('active', active);
    if (!active) { pin.current = null; closeAllPopovers(); }
  }

  // ── Pin Relocation (long-press + drag) ───────────────────────────────────
  async function finishMovingPin(x, y) {
    if (!movingPinId) return;
    const id = movingPinId;
    movingPinId = null;
    dragPinEl = null;
    justDragged = true;
    setTimeout(() => { justDragged = false; }, 0);
    document.body.classList.remove('pc-dragging');
    // Optimistic update: apply x/y locally so any renderPins() calls while
    // awaiting the Firestore round-trip show the pin at the new position.
    const idx = comments.findIndex(c => c.id === id);
    if (idx !== -1) { comments[idx] = { ...comments[idx], x, y }; renderPins(); }
    await store.update(id, { x, y });
  }

  function cancelMovingPin() {
    if (!movingPinId && !isDragging) return;
    movingPinId = null;
    isDragging = false;
    dragPinEl = null;
    document.body.classList.remove('pc-dragging');
    removeDragListeners();
    renderPins();
  }

  function addDragListeners() {
    // 全程用 pointer events：pointerdown 已 preventDefault（切斷 compatibility mouse events），
    // 若 drag 用 mousemove/up 會收不到 → 統一 pointer 才動得了。pointer 也統一涵蓋 touch。
    document.addEventListener('pointermove', onDragMove);
    document.addEventListener('pointerup', onDragEnd);
  }

  function removeDragListeners() {
    document.removeEventListener('pointermove', onDragMove);
    document.removeEventListener('pointerup', onDragEnd);
    clearAutoScroll();
  }

  function movePinVisually(clientX, clientY) {
    if (!dragPinEl) return;
    const overlay = document.getElementById('pc-overlay');
    if (!overlay) return;
    const rect = overlay.getBoundingClientRect();
    const scrollTop = getScrollTop();
    const overlayH = overlay.offsetHeight || 1;
    const x = (clientX - rect.left) / rect.width * 100;
    const y = (clientY - rect.top + scrollTop) / overlayH * 100;
    const visualY = y - (scrollTop / overlayH * 100);
    dragPinEl.style.left = `${x}%`;
    dragPinEl.style.top  = `${visualY}%`;
  }

  function checkAutoScroll(clientY) {
    const overlay = document.getElementById('pc-overlay');
    if (!overlay || !_scrollEl) { clearAutoScroll(); return; }
    const rect = overlay.getBoundingClientRect();
    const edgePx = 48;
    const distBottom = rect.bottom - clientY;
    const distTop    = clientY - rect.top;
    if (distBottom >= 0 && distBottom < edgePx) {
      setAutoScroll(1);
    } else if (distTop >= 0 && distTop < edgePx) {
      setAutoScroll(-1);
    } else {
      clearAutoScroll();
    }
  }

  function setAutoScroll(dir) {
    if (autoScrollTimer && autoScrollDir === dir) return;
    clearAutoScroll();
    autoScrollDir = dir;
    autoScrollTimer = setInterval(() => {
      if (!_scrollEl) { clearAutoScroll(); return; }
      _scrollEl.scrollTop += dir * 8;
      movePinVisually(lastDragX, lastDragY);
    }, 16);
  }

  function clearAutoScroll() {
    if (autoScrollTimer) { clearInterval(autoScrollTimer); autoScrollTimer = null; }
    autoScrollDir = 0;
  }

  function onDragMove(e) {
    if (!isDragging) return;
    lastDragX = e.clientX; lastDragY = e.clientY;
    movePinVisually(e.clientX, e.clientY);
    checkAutoScroll(e.clientY);
  }
  function onDragMoveTouch(e) {
    if (!isDragging || !e.touches.length) return;
    e.preventDefault();
    lastDragX = e.touches[0].clientX; lastDragY = e.touches[0].clientY;
    movePinVisually(e.touches[0].clientX, e.touches[0].clientY);
    checkAutoScroll(e.touches[0].clientY);
  }

  function onDragEnd(e) {
    if (!isDragging) return;
    isDragging = false;
    removeDragListeners();
    const overlay = document.getElementById('pc-overlay');
    if (!overlay || !movingPinId) { movingPinId = null; dragPinEl = null; document.body.classList.remove('pc-dragging'); return; }
    const rect = overlay.getBoundingClientRect();
    const scrollTop = getScrollTop();
    const overlayH = overlay.offsetHeight || 1;
    const x = parseFloat((Math.max(0, Math.min(100, (e.clientX - rect.left) / rect.width * 100))).toFixed(2));
    // y is not capped at 100 — when the phone body is scrolled, the stored y can
    // legitimately exceed 100% to represent content positions below the initial fold.
    const y = parseFloat((Math.max(0, (e.clientY - rect.top + scrollTop) / overlayH * 100)).toFixed(2));
    finishMovingPin(x, y);
  }

  function onDragEndTouch(e) {
    if (!isDragging) return;
    isDragging = false;
    removeDragListeners();
    const t = e.changedTouches[0];
    const overlay = document.getElementById('pc-overlay');
    if (!overlay || !movingPinId) { movingPinId = null; dragPinEl = null; document.body.classList.remove('pc-dragging'); return; }
    const rect = overlay.getBoundingClientRect();
    const scrollTop = getScrollTop();
    const overlayH = overlay.offsetHeight || 1;
    const x = parseFloat((Math.max(0, Math.min(100, (t.clientX - rect.left) / rect.width * 100))).toFixed(2));
    const y = parseFloat((Math.max(0, (t.clientY - rect.top + scrollTop) / overlayH * 100)).toFixed(2));
    finishMovingPin(x, y);
  }

  // ── Popover (input / thread) ───────────────────────────────────────────────
  function closeAllPopovers() {
    if (pop.el) { pop.el.remove(); pop.el = null; }
    pop.id = null;
  }

  function showInputPopover(clientX, clientY, commentId) {
    closeAllPopovers();
    if (!currentUser) return;

    const popEl = el('div', 'pc-popover');
    pop.el = popEl;

    const hdr = el('div', 'pc-popover-header');
    if (currentUser.photoURL) {
      const av = el('img', 'pc-popover-avatar', { src: currentUser.photoURL, alt: '' });
      hdr.appendChild(av);
    }
    const author = el('span', 'pc-popover-author');
    author.textContent = currentUser.displayName || currentUser.email;
    hdr.appendChild(author);
    const closeBtn = el('button', 'pc-popover-close');
    closeBtn.textContent = '✕';
    closeBtn.onclick = () => { pin.current = null; closeAllPopovers(); };
    hdr.appendChild(closeBtn);
    popEl.appendChild(hdr);

    if (commentId) {
      const thread = renderThread(commentId);
      if (thread) popEl.appendChild(thread);
    }

    const ta = el('textarea', 'pc-textarea', { placeholder: '留下你的意見…（@ 可標記人）' });
    attachMentions(ta);
    popEl.appendChild(ta);
    ta.focus();

    const actions = el('div', 'pc-popover-actions');
    const cancelBtn = el('button', 'pc-btn-cancel');
    cancelBtn.textContent = '取消';
    cancelBtn.onclick = () => { pin.current = null; closeAllPopovers(); };
    const submitBtn = el('button', 'pc-btn-submit', { disabled: '' });
    submitBtn.textContent = '送出';

    ta.addEventListener('input', () => {
      submitBtn.disabled = !ta.value.trim();
    });

    submitBtn.onclick = async () => {
      const body = ta.value.trim();
      if (!body) return;
      submitBtn.disabled = true;

      const data = {
        type: 'positional',
        screenId: getScreenId(),
        x: pin.current ? pin.current.x : null,
        y: pin.current ? pin.current.y : null,
        body,
        authorUid: currentUser.uid,
        authorName: currentUser.displayName || currentUser.email,
        authorPhoto: currentUser.photoURL || '',
        resolved: false,
      };

      if (commentId) {
        const parent = comments.find(c => c.id === commentId);
        if (parent) {
          data.x = parent.x;
          data.y = parent.y;
          data.parentId = commentId;
        }
      }

      console.log('[pc] save x=', data.x, 'y=', data.y, 'screenId=', data.screenId, 'pin=', pin.current);
      try {
        await store.save(data);
        console.log('[pc] save success');
      } catch(e) {
        console.error('[pc] save FAILED:', e.message, e.code);
      }
      pin.current = null;
      closeAllPopovers();
    };

    actions.appendChild(cancelBtn);
    actions.appendChild(submitBtn);
    popEl.appendChild(actions);

    document.body.appendChild(popEl);
    positionPopover(popEl, clientX, clientY);
  }

  // Escape HTML then turn URLs into clickable links (Feature: linkify)
  function escapeHtml(s) {
    return (s || '').replace(/[&<>"']/g, m => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[m]));
  }
  function linkify(s, names) {
    let h = escapeHtml(s);
    h = h.replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" rel="noopener" class="pc-link">$1</a>');
    // highlight known @full-names first (longest first, so "Mina Huang" beats "Mina")
    (names || []).slice().filter(Boolean).sort((a, b) => b.length - a.length).forEach(n => {
      const e = escapeHtml(n).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      h = h.replace(new RegExp('@' + e, 'g'), '<span class="pc-mention">@' + escapeHtml(n) + '</span>');
    });
    return h;
  }

  // ── @mention (Figma-style): pool = distinct comment authors in this projectId ──
  function peopleList() {
    const m = new Map();
    allComments.forEach(c => { if (c.authorUid && c.authorName) m.set(c.authorUid, { uid: c.authorUid, name: c.authorName, photo: c.authorPhoto || '' }); });
    return [...m.values()];
  }
  function attachMentions(ta) {
    let pop = null;
    const close = () => { if (pop) { pop.remove(); pop = null; } };
    ta.addEventListener('input', () => {
      const pos = ta.selectionStart;
      const before = ta.value.slice(0, pos);
      const m = before.match(/@([^\s@]*)$/);
      close();
      if (!m) return;
      const q = m[1].toLowerCase();
      const matches = peopleList().filter(p => p.name.toLowerCase().includes(q)).slice(0, 6);
      if (!matches.length) return;
      pop = el('div', 'pc-mention-pop');
      matches.forEach(p => {
        const opt = el('button', 'pc-mention-opt');
        opt.innerHTML = (p.photo ? `<img src="${p.photo}" alt="">` : '<span class="pc-mention-ph"></span>') + `<span>${escapeHtml(p.name)}</span>`;
        opt.onmousedown = (e) => {
          e.preventDefault();
          const start = pos - m[0].length;
          ta.value = ta.value.slice(0, start) + '@' + p.name + ' ' + ta.value.slice(pos);
          const np = start + p.name.length + 2;
          ta.setSelectionRange(np, np);
          close(); ta.focus();
          ta.dispatchEvent(new Event('input'));
        };
        pop.appendChild(opt);
      });
      const r = ta.getBoundingClientRect();
      pop.style.left = r.left + 'px';
      pop.style.top = (r.bottom + 2) + 'px';
      pop.style.width = r.width + 'px';
      document.body.appendChild(pop);
    });
    ta.addEventListener('blur', () => setTimeout(close, 150));
  }

  // ── Emoji reactions (Figma-style: any logged-in user can react; shows who) ──
  const REACTION_EMOJIS = ['👍','❤️','🎉','😄','👀','🙏','🤔','🔥'];
  function toggleReaction(c, emoji, onReact) {
    if (!currentUser) return;
    const me = { uid: currentUser.uid, name: currentUser.displayName || currentUser.email || '匿名' };
    const r = { ...(c.reactions || {}) };
    const list = (r[emoji] || []).slice();
    const i = list.findIndex(u => u.uid === me.uid);
    if (i >= 0) list.splice(i, 1); else list.push(me);
    if (list.length) r[emoji] = list; else delete r[emoji];
    onReact(r);
  }
  function showEmojiPicker(anchor, c, onReact) {
    const existing = document.querySelector('.pc-emoji-picker');
    if (existing) { existing.remove(); return; }
    const pop = el('div', 'pc-emoji-picker');
    REACTION_EMOJIS.forEach(em => {
      const b = el('button', 'pc-emoji-opt'); b.textContent = em;
      b.onclick = (e) => { e.stopPropagation(); toggleReaction(c, em, onReact); pop.remove(); };
      pop.appendChild(b);
    });
    const r = anchor.getBoundingClientRect();
    pop.style.left = Math.min(r.left, window.innerWidth - 220) + 'px';
    pop.style.top = (r.bottom + 4) + 'px';
    document.body.appendChild(pop);
    setTimeout(() => document.addEventListener('click', function h() { pop.remove(); document.removeEventListener('click', h); }), 0);
  }
  // B5: 手機無 hover → tap chip 顯示「誰按了」popover（含 toggle 自己反應的按鈕）
  function showReactionUsers(anchor, emoji, users, c, onReact) {
    const existing = document.querySelector('.pc-reaction-users');
    if (existing) { existing.remove(); return; }
    const pop = el('div', 'pc-reaction-users');
    users.forEach(u => {
      const row = el('div', 'pc-reaction-users-row');
      row.textContent = emoji + '  ' + u.name;
      pop.appendChild(row);
    });
    const myUid = currentUser && currentUser.uid;
    if (onReact && myUid) {
      const mine = users.some(u => u.uid === myUid);
      const tg = el('button', 'pc-reaction-users-toggle' + (mine ? ' mine' : ''));
      tg.textContent = mine ? '✓ 已按，點此取消' : '我也按一個';
      tg.onclick = (e) => { e.stopPropagation(); toggleReaction(c, emoji, onReact); pop.remove(); };
      pop.appendChild(tg);
    }
    const r = anchor.getBoundingClientRect();
    pop.style.left = Math.min(r.left, window.innerWidth - 230) + 'px';
    pop.style.top = (r.bottom + 4) + 'px';
    document.body.appendChild(pop);
    setTimeout(() => document.addEventListener('click', function h() { pop.remove(); document.removeEventListener('click', h); }), 0);
  }
  function buildReactions(c, onReact) {
    const wrap = el('div', 'pc-ci-reactions');
    const reactions = c.reactions || {};
    const myUid = currentUser && currentUser.uid;
    Object.keys(reactions).forEach(emoji => {
      const users = reactions[emoji] || [];
      if (!users.length) return;
      const chip = el('button', 'pc-reaction-chip');
      if (myUid && users.some(u => u.uid === myUid)) chip.classList.add('mine');
      chip.innerHTML = emoji + ' <span>' + users.length + '</span>';
      chip.title = users.map(u => u.name).join(', ');   // who reacted
      if (onReact && myUid) chip.onclick = (e) => {
        // 無 hover（手機）：tap 顯示名單 popover（含 toggle）；桌機：維持 hover 看名單 + click 直接 toggle
        if (window.matchMedia && window.matchMedia('(hover: none)').matches) {
          e.stopPropagation(); showReactionUsers(chip, emoji, users, c, onReact);
        } else {
          toggleReaction(c, emoji, onReact);
        }
      };
      wrap.appendChild(chip);
    });
    if (onReact && myUid) {
      const add = el('button', 'pc-reaction-add'); add.textContent = '🙂'; add.title = '加表情';
      add.onclick = (e) => { e.stopPropagation(); showEmojiPicker(add, c, onReact); };
      wrap.appendChild(add);
    }
    return wrap;
  }

  // Build a single comment item element with edit/delete/resolve actions
  function buildCommentItem(c, isRootComment, { onResolve, onDelete, onDeleteThread, onEdit, onReact, onReply, onUpdated } = {}) {
    const item = el('div', 'pc-comment-item');

    if (c.authorPhoto) {
      const av = el('img', 'pc-ci-avatar', { src: c.authorPhoto, alt: '' });
      item.appendChild(av);
    }
    const bodyEl = el('div', 'pc-ci-body');
    const meta = el('div', 'pc-ci-meta');
    const an = el('span', 'pc-ci-author'); an.textContent = c.authorName;
    const at = el('span', 'pc-ci-time');
    at.textContent = timeAgo(c.createdAt) + (c.edited ? ' · 已編輯' : '');
    meta.appendChild(an); meta.appendChild(at);
    bodyEl.appendChild(meta);

    const txtEl = el('p', 'pc-ci-text'); txtEl.innerHTML = linkify(c.body, peopleList().map(p => p.name));
    bodyEl.appendChild(txtEl);

    // Emoji reactions row (any logged-in user)
    if (onReact) bodyEl.appendChild(buildReactions(c, onReact));

    const acts = el('div', 'pc-ci-actions');

    // Resolve / Unresolve toggle (root comments only) — D1: root 可 resolve 也可 unresolve
    if (isRootComment && onResolve) {
      const resolveBtn = el('button', 'pc-ci-action resolve');
      resolveBtn.textContent = c.resolved ? '↩ 取消解決' : '✓ Resolve';
      resolveBtn.onclick = async () => {
        await onResolve(!c.resolved);
        if (onUpdated) onUpdated();
      };
      acts.appendChild(resolveBtn);
    }



    // Reply (any logged-in user) — opens inline reply box; used by note/eng threads
    if (onReply && currentUser) {
      const replyBtn = el('button', 'pc-ci-action');
      replyBtn.textContent = '↩ 回覆';
      replyBtn.onclick = () => {
        if (bodyEl.querySelector('.pc-reply-box')) return;
        const box = el('div', 'pc-reply-box');
        const rta = el('textarea', 'pc-note-textarea', { placeholder: '回覆…（@ 可標記人）' });
        attachMentions(rta);
        const send = el('button', 'pc-note-submit'); send.textContent = '送出';
        const cancel = el('button', 'pc-btn-cancel'); cancel.textContent = '取消';
        cancel.style.cssText = 'margin-left:4px;font-size:11px;padding:4px 8px;';
        const row = el('div', ''); row.style.cssText = 'display:flex;gap:6px;margin-top:6px;';
        row.appendChild(send); row.appendChild(cancel);
        box.appendChild(rta); box.appendChild(row); bodyEl.appendChild(box);
        cancel.onclick = () => box.remove();
        send.onclick = async () => {
          const b = rta.value.trim(); if (!b) return; send.disabled = true;
          await onReply(b); box.remove();
          if (onUpdated) onUpdated();
        };
        rta.focus();
      };
      acts.appendChild(replyBtn);
    }

    // Edit (own comments only) + Delete (own replies only)
    if (currentUser && c.authorUid === currentUser.uid) {
      const editBtn = el('button', 'pc-ci-action');
      editBtn.textContent = '編輯';
      editBtn.onclick = () => {
        txtEl.style.display = 'none';
        acts.style.display = 'none';
        const ta = el('textarea', 'pc-note-textarea');
        ta.value = c.body;
        ta.style.cssText = 'margin-top:6px;';
        const saveBtn = el('button', 'pc-note-submit');
        saveBtn.textContent = '儲存';
        const cancelEdit = el('button', 'pc-btn-cancel');
        cancelEdit.style.cssText = 'margin-left:4px;font-size:11px;padding:4px 8px;';
        cancelEdit.textContent = '取消';
        const row = el('div', '');
        row.style.cssText = 'display:flex;gap:6px;margin-top:6px;';
        row.appendChild(saveBtn);
        row.appendChild(cancelEdit);
        bodyEl.appendChild(ta);
        bodyEl.appendChild(row);

        cancelEdit.onclick = () => {
          ta.remove(); row.remove();
          txtEl.style.display = '';
          acts.style.display = '';
        };
        saveBtn.onclick = async () => {
          const newBody = ta.value.trim();
          if (!newBody) return;
          saveBtn.disabled = true;
          if (onEdit) await onEdit(newBody);
          if (onUpdated) onUpdated();
        };
        ta.focus();
      };
      acts.appendChild(editBtn);

      // Delete — Figma-style: replies delete themselves; root deletes the whole thread (with confirm)
      const delBtn = el('button', 'pc-ci-action');
      delBtn.textContent = '刪除';
      delBtn.onclick = async () => {
        if (isRootComment) {
          if (!confirm('確定要刪除這個 thread 嗎？\n此 thread 的所有留言都會被刪除，且無法復原。')) return;
          if (onDeleteThread) await onDeleteThread();
          else if (onDelete) await onDelete();
        } else {
          if (!confirm('刪除這則留言？')) return;
          if (onDelete) await onDelete();
        }
        if (onUpdated) onUpdated();
      };
      acts.appendChild(delBtn);
    }

    bodyEl.appendChild(acts);
    item.appendChild(bodyEl);
    return item;
  }

  function renderThread(commentId, onUpdated) {
    const threadComments = comments.filter(
      c => c.id === commentId || c.parentId === commentId
    );
    if (!threadComments.length) return null;

    const div = el('div', 'pc-thread');
    threadComments.forEach(c => {
      div.appendChild(buildCommentItem(c, c.id === commentId, {
        onResolve: resolved => store.update(c.id, { resolved }),
        onDelete:  ()       => store.remove(c.id),
        onDeleteThread: ()  => Promise.all(threadComments.map(t => store.remove(t.id))),
        onEdit:    body     => store.update(c.id, { body, edited: true }),
        onReact:   r        => store.update(c.id, { reactions: r }),
        onUpdated,
      }));
    });
    return div;
  }

  function positionPopover(popEl, cx, cy) {
    const vw = window.innerWidth, vh = window.innerHeight;
    const pw = popEl.offsetWidth || 268, ph = popEl.scrollHeight || 200;
    let left = cx + 10, top = cy - 10;
    if (left + pw > vw - 10) left = cx - pw - 10;
    if (left < 10) left = 10;
    if (top + ph > vh - 10) top = vh - ph - 10;
    if (top < 10) top = 10;
    popEl.style.left = `${left}px`;
    popEl.style.top  = `${top}px`;
  }

  // ── Render Pins ───────────────────────────────────────────────────────────
  function renderPins() {
    const overlay = document.getElementById('pc-overlay');
    if (!overlay) { console.warn('[pc] renderPins: overlay not found'); return; }
    refreshScrollEl();

    overlay.querySelectorAll('.pc-pin').forEach(p => p.remove());
    const screenId = getScreenId();
    const positional = comments.filter(
      c => c.type === 'positional' && c.screenId === screenId && !c.parentId
        && c.x != null && c.y != null
    );
    console.log('[pc] renderPins screenId=', screenId, 'total comments=', comments.length, 'positional this screen=', positional.length);

    positional.forEach((c) => {
      const threadCount = 1 + comments.filter(r => r.parentId === c.id).length;
      const scale = Math.min(1 + Math.log2(threadCount) * 0.3, 2.2).toFixed(2);

      const pinEl = el('div', `pc-pin${c.resolved ? ' resolved' : ''}`);
      pinEl.dataset.commentId = c.id;
      const scrollTop = getScrollTop();
      const overlayH  = overlay.offsetHeight || 1;
      const visualY   = c.y - (scrollTop / overlayH * 100);
      const safeMin   = 14 / overlayH * 100;
      const safeMax   = 100 - safeMin;
      const isEdge    = visualY < 0 || visualY > 100;
      const pinVisualY = isEdge ? Math.max(safeMin, Math.min(safeMax, visualY)) : visualY;
      if (isEdge) pinEl.classList.add('pc-pin-edge', visualY < 0 ? 'pc-pin-edge-top' : 'pc-pin-edge-bottom');
      pinEl.style.left = `${c.x}%`;
      pinEl.style.top  = `${pinVisualY}%`;
      pinEl.style.setProperty('--pc-pin-scale', scale);
      const label = el('span', 'pc-pin-label');
      // 方案 C 對話泡：icon 放固定寬度框 → 💬(未解決)/✓(已解決) 同寬，兩種 pin 尺寸一致
      label.innerHTML = '<span class="pc-pin-ic">' + (c.resolved ? '✓' : '💬') + '</span>' + threadCount;
      pinEl.appendChild(label);

      pinEl.addEventListener('click', e => {
        e.stopPropagation();
        if (justDragged) return;
        if (pop.id === c.id) { closeAllPopovers(); return; }
        showThreadPopover(e.clientX, e.clientY, c.id);
      });

      // Long-press (500 ms) to enter drag mode — own unresolved pins only.
      // 用 Pointer Events + setPointerCapture：游標脫離 pin（hover 放大造成）也抓得住，
      // 不再因 mouseleave 取消長按。press 期間加 .pressing 停用 hover 放大穩住游標。
      if (currentUser && c.authorUid === currentUser.uid && !c.resolved) {
        let pressTimer = null;
        const startPress = () => {
          pinEl.classList.add('pressing');
          pressTimer = setTimeout(() => {
            pressTimer = null;
            movingPinId = c.id;
            isDragging = true;
            dragPinEl = pinEl;
            closeAllPopovers();
            pinEl.classList.remove('pressing');
            pinEl.classList.add('moving');
            document.body.classList.add('pc-dragging');
            addDragListeners();
          }, 500);
        };
        const cancelPress = () => {
          if (pressTimer) { clearTimeout(pressTimer); pressTimer = null; }
          pinEl.classList.remove('pressing');
        };
        pinEl.addEventListener('pointerdown', e => {
          if (e.button != null && e.button > 0) return;   // 僅主鍵 / 觸控
          e.preventDefault();
          try { pinEl.setPointerCapture(e.pointerId); } catch (_) {}
          startPress();
        });
        pinEl.addEventListener('pointerup', cancelPress);
        pinEl.addEventListener('pointercancel', cancelPress);
        // press 階段（尚未進 drag）明顯移動 → 視為滑動，取消長按
        pinEl.addEventListener('pointermove', e => {
          if (pressTimer && (Math.abs(e.movementX) > 4 || Math.abs(e.movementY) > 4)) cancelPress();
        });
      }

      overlay.appendChild(pinEl);
    });
  }

  function showThreadPopover(clientX, clientY, commentId) {
    closeAllPopovers();
    pop.id = commentId;

    const popEl = el('div', 'pc-popover');
    pop.el = popEl;

    const closeBtn = el('button', 'pc-popover-close');
    closeBtn.style.marginLeft = 'auto';
    closeBtn.textContent = '✕';
    closeBtn.onclick = closeAllPopovers;
    const hdr = el('div', 'pc-popover-header');
    hdr.appendChild(closeBtn);
    popEl.appendChild(hdr);

    function refreshThread() {
      const existing = popEl.querySelector('.pc-thread');
      if (existing) existing.remove();
      const t = renderThread(commentId, refreshThread);
      if (t) {
        const ta = popEl.querySelector('.pc-textarea');
        ta ? popEl.insertBefore(t, ta) : popEl.appendChild(t);
      }
    }

    const thread = renderThread(commentId, refreshThread);
    if (thread) popEl.appendChild(thread);

    if (currentUser) {
      const ta = el('textarea', 'pc-textarea', { placeholder: '回覆…（@ 可標記人）', rows: '2' });
      attachMentions(ta);
      ta.style.minHeight = '52px';
      popEl.appendChild(ta);
      const actions = el('div', 'pc-popover-actions');
      const submitBtn = el('button', 'pc-btn-submit', { disabled: '' });
      submitBtn.textContent = '回覆';
      ta.addEventListener('input', () => { submitBtn.disabled = !ta.value.trim(); });
      submitBtn.onclick = async () => {
        const body = ta.value.trim();
        if (!body) return;
        const parent = comments.find(c => c.id === commentId);
        await store.save({
          type: 'positional',
          screenId: getScreenId(),
          x: parent?.x ?? 0,
          y: parent?.y ?? 0,
          parentId: commentId,
          body,
          authorUid: currentUser.uid,
          authorName: currentUser.displayName || currentUser.email,
          authorPhoto: currentUser.photoURL || '',
          resolved: false,
        });
        closeAllPopovers();
      };
      actions.appendChild(submitBtn);
      popEl.appendChild(actions);
    }

    document.body.appendChild(popEl);
    positionPopover(popEl, clientX, clientY);
  }

  // ── Firestore Subscription ─────────────────────────────────────────────────
  function subscribe() {
    if (unsub) { unsub(); unsub = null; }

    const mode = getMode();
    let q;

    if (mode === 'eng') {
      q = store.query(fb.where('type', '==', 'note'));
    } else {
      const screenId = getScreenId();
      q = store.query(fb.where('screenId', '==', screenId));
    }

    console.log('[pc] subscribe() screenId=', getScreenId(), 'mode=', mode);
    unsub = store.subscribe(q, incoming => {
      console.log('[pc] snapshot fired:', incoming.length, 'docs');
      const sorted = [...incoming].sort(
        (a, b) => (a.createdAt?.toMillis?.() ?? 0) - (b.createdAt?.toMillis?.() ?? 0)
      );

      if (mode === 'eng') {
        comments = [
          ...comments.filter(c => c.type !== 'note'),
          ...sorted,
        ];
      } else {
        const screenId = getScreenId();
        comments = [
          ...comments.filter(c => c.screenId !== screenId),
          ...sorted,
        ];
      }

      renderPins();
      noteModule.refresh({ updateThreads: true });

      if (pop.id && pop.el) {
        const thread = pop.el.querySelector('.pc-thread');
        if (thread) {
          const newThread = renderThread(pop.id);
          if (newThread) thread.replaceWith(newThread);
        }
      }
    }, err => {
      console.warn('[prototype-comments] snapshot error:', err);
    });
  }

  // ── Global Panel Subscription ─────────────────────────────────────────────
  function subscribeAll() {
    if (panel.unsub) { panel.unsub(); panel.unsub = null; }
    panel.unsub = store.subscribe(store.query(), incoming => {
      allComments = [...incoming].sort(
        (a, b) => (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0)
      );
      if (panel.open) renderPanel();
      updatePanelBadge();
    }, err => console.warn('[pc] subscribeAll error:', err));
  }

  function updatePanelBadge() {
    const btn = document.getElementById('pc-panel-btn');
    if (!btn) return;
    const n = allComments.filter(c => !c.parentId && !c.resolved).length;
    btn.textContent = n > 0 ? `📋 全部留言 (${n})` : '📋 全部留言';
  }

  // ── Global Comment Panel ───────────────────────────────────────────────────
  function buildPanel() {
    if (document.getElementById('pc-panel')) return;
    const p = el('div', 'pc-panel');
    p.id = 'pc-panel';
    document.body.appendChild(p);
    panel.el = p;
  }

  function openPanel() {
    buildPanel();
    panel.open = true;
    panel.el.classList.add('open');
    renderPanel();
  }

  function closePanel() {
    panel.open = false;
    if (panel.el) panel.el.classList.remove('open');
  }

  // Render a note's full thread inline inside the panel (reliable — uses comment data,
  // not page rows; avoids the stale-noteKey / hidden-mode problems of scrolling to a row)
  function renderInlineNoteThread(container, root) {
    container.innerHTML = '';
    const key = root.noteKey;
    const all = allComments.filter(x => x.type === 'note' && x.noteKey === key);
    const repliesOf = id => all.filter(x => x.parentId === id);
    const refresh = renderPanel;
    const saveReply = parentId => async body => {
      await store.save({
        type: 'note', screenId: root.screenId, noteKey: key, noteTag: root.noteTag, noteText: root.noteText,
        parentId, body,
        authorUid: currentUser.uid, authorName: currentUser.displayName || currentUser.email,
        authorPhoto: currentUser.photoURL || '', resolved: false,
      });
    };
    all.filter(x => !x.parentId).forEach((c, i) => {
      container.appendChild(buildCommentItem(c, i === 0, {
        onResolve: r => store.update(c.id, { resolved: r }),
        onDelete:  () => store.remove(c.id),
        onDeleteThread: () => Promise.all(all.map(t => store.remove(t.id))),
        onEdit:    b => store.update(c.id, { body: b, edited: true }),
        onReact:   r => store.update(c.id, { reactions: r }),
        onReply:   currentUser ? saveReply(c.id) : null,
        onUpdated: refresh,
      }));
      const reps = repliesOf(c.id);
      if (reps.length) {
        const ind = el('div', 'pc-note-replies');
        reps.forEach(r => ind.appendChild(buildCommentItem(r, false, {
          onDelete: () => store.remove(r.id),
          onEdit:   b => store.update(r.id, { body: b, edited: true }),
          onReact:  rr => store.update(r.id, { reactions: rr }),
          // D1: replies 不可再回覆 — 不傳 onReply
          onUpdated: refresh,
        })));
        container.appendChild(ind);
      }
    });
  }

  function renderPanel() {
    if (!panel.el) return;
    panel.el.innerHTML = '';

    const hdr = el('div', 'pc-panel-header');
    const title = el('span', 'pc-panel-title'); title.textContent = '💬 全部留言';
    const closeBtn = el('button', 'pc-popover-close');
    closeBtn.textContent = '✕'; closeBtn.onclick = closePanel;
    hdr.appendChild(title); hdr.appendChild(closeBtn);
    panel.el.appendChild(hdr);

    const tabs = el('div', 'pc-panel-tabs');
    [['all', '全部'], ['open', '未解決'], ['resolved', '已解決']].forEach(([f, label]) => {
      const tab = el('button', `pc-panel-tab${panel.filter === f ? ' active' : ''}`);
      tab.textContent = label;
      tab.onclick = () => { panel.filter = f; renderPanel(); };
      tabs.appendChild(tab);
    });
    panel.el.appendChild(tabs);

    // Search box (Figma-style)
    const searchWrap = el('div', 'pc-panel-search');
    const searchInput = el('input', 'pc-panel-search-input', { type: 'text', placeholder: '🔍 搜尋留言、作者、tag、畫面…' });
    searchInput.value = panel.search || '';
    let composing = false;
    searchInput.addEventListener('compositionstart', () => { composing = true; });
    searchInput.addEventListener('compositionend', () => {
      composing = false; panel.search = searchInput.value; renderPanelList();
    });
    searchInput.oninput = () => {
      if (composing) return;            // mid-IME composition (注音/拼音) — don't re-filter yet
      panel.search = searchInput.value;
      renderPanelList();                // re-render ONLY the list → input element survives, IME intact
    };
    searchWrap.appendChild(searchInput);
    panel.el.appendChild(searchWrap);

    // Tag filter chips (clickable) + sort button — kept visually separate from status tabs
    const toolbar = el('div', 'pc-panel-toolbar');
    const chipsWrap = el('div', 'pc-panel-tagchips');
    // Type filter: 設計留言 (positional pins) vs 工程留言 (notes)
    [['all', '全部項目'], ['design', '🎨 設計'], ['eng', '🔧 工程']].forEach(([t, label]) => {
      const chip = el('button', `pc-panel-tagchip pc-panel-typechip${panel.typeFilter === t ? ' active' : ''}`);
      chip.textContent = label;
      chip.onclick = () => { panel.typeFilter = t; renderPanel(); };
      chipsWrap.appendChild(chip);
    });
    const tags = [...new Set(allComments.filter(c => !c.parentId && c.noteTag).map(c => c.noteTag))];
    tags.forEach(t => {
      const chip = el('button', `pc-panel-tagchip${panel.tagFilter === t ? ' active' : ''}`);
      chip.textContent = '#' + t;
      chip.onclick = () => { panel.tagFilter = panel.tagFilter === t ? null : t; renderPanel(); };
      chipsWrap.appendChild(chip);
    });
    toolbar.appendChild(chipsWrap);
    const sortBtn = el('button', 'pc-panel-sort');
    sortBtn.textContent = panel.sort === 'old' ? '↑ 最舊優先' : '↓ 最新優先';
    sortBtn.title = '切換排序';
    sortBtn.onclick = () => { panel.sort = panel.sort === 'old' ? 'new' : 'old'; renderPanel(); };
    toolbar.appendChild(sortBtn);
    panel.el.appendChild(toolbar);

    panel.listEl = el('div', 'pc-panel-list');
    panel.el.appendChild(panel.listEl);
    renderPanelList();
  }

  // Re-renders ONLY the list portion. Called on every search keystroke so the
  // search <input> element is never destroyed mid-IME-composition (注音 bug fix).
  function renderPanelList() {
    const list = panel.listEl;
    if (!list) return;
    list.innerHTML = '';

    const pinNums = {};
    [...allComments]
      .filter(c => !c.parentId && c.type === 'positional')
      .sort((a, b) => (a.createdAt?.toMillis?.() ?? 0) - (b.createdAt?.toMillis?.() ?? 0))
      .forEach(c => {
        if (!pinNums[c.screenId]) pinNums[c.screenId] = {};
        pinNums[c.screenId][c.id] = Object.keys(pinNums[c.screenId]).length + 1;
      });

    const q = (panel.search || '').trim().toLowerCase();
    const roots = allComments.filter(c => !c.parentId && (
      panel.filter === 'all'      ? true :
      panel.filter === 'open'     ? !c.resolved :
      /* resolved */                 c.resolved
    )).filter(c => !panel.tagFilter || c.noteTag === panel.tagFilter)
      .filter(c => panel.typeFilter === 'all' ? true :
                   panel.typeFilter === 'design' ? c.type === 'positional' :
                   /* eng */ c.type === 'note')
      .filter(c => {
        if (!q) return true;
        return [c.body, c.authorName, c.noteTag, c.noteText, c.screenId]
          .filter(Boolean).join(' ').toLowerCase().includes(q);
      })
      .sort((a, b) => {
        const ta = a.createdAt?.toMillis?.() ?? 0, tb = b.createdAt?.toMillis?.() ?? 0;
        return panel.sort === 'old' ? ta - tb : tb - ta;
      });

    if (!roots.length) {
      const empty = el('div', 'pc-panel-empty');
      empty.textContent =
        q                           ? '找不到符合的留言' :
        panel.filter === 'open'     ? '沒有未解決的留言 🎉' :
        panel.filter === 'resolved' ? '還沒有已解決的留言' : '還沒有留言';
      list.appendChild(empty);
    } else {
      roots.forEach(c => {
        const item = el('div', `pc-panel-item${c.resolved ? ' resolved' : ''}`);
        if (c.type === 'note') {
          // Note/eng comment → expand its thread inline in the panel (reliable)
          item.onclick = (e) => {
            if (e.target.closest('.pc-panel-inline-thread')) return;  // don't toggle when interacting inside
            panel.expandedNote = panel.expandedNote === c.noteKey ? null : c.noteKey;
            renderPanel();
          };
        } else {
          item.onclick = () => navigateToComment(c);
        }

        const topRow = el('div', 'pc-panel-top-row');
        const modeChip = el('span', 'pc-panel-chip');
        if (c.type === 'note') {
          modeChip.textContent = '🔧 工程';
          modeChip.style.cssText = 'background:rgba(99,102,241,.12);color:#6366f1;';
        } else {
          modeChip.textContent = '🎨 設計';
        }
        topRow.appendChild(modeChip);
        if (c.type === 'note' && c.noteTag) {
          const tagChip = el('span', 'pc-panel-chip'); tagChip.textContent = c.noteTag;
          topRow.appendChild(tagChip);
        } else if (c.type === 'positional') {
          if (c.screenId) {
            const chip = el('span', 'pc-panel-chip'); chip.textContent = c.screenId;
            topRow.appendChild(chip);
          }
          if (pinNums[c.screenId]?.[c.id]) {
            const num = el('span', 'pc-panel-num');
            num.textContent = `#${pinNums[c.screenId][c.id]}`;
            topRow.appendChild(num);
          }
        }
        if (c.resolved) {
          const rb = el('span', 'pc-panel-resolved-badge'); rb.textContent = '✓ 已解決';
          topRow.appendChild(rb);
        }
        const at = el('span', 'pc-ci-time'); at.textContent = timeAgo(c.createdAt);
        topRow.style.flex = '1';
        at.style.marginLeft = 'auto';
        topRow.appendChild(at);
        item.appendChild(topRow);

        const authorRow = el('div', 'pc-panel-meta');
        if (c.authorPhoto) {
          const av = el('img', 'pc-ci-avatar', { src: c.authorPhoto, alt: '' });
          authorRow.appendChild(av);
        }
        const an = el('span', 'pc-ci-author'); an.textContent = c.authorName || '匿名';
        authorRow.appendChild(an);
        item.appendChild(authorRow);

        const txt = el('p', 'pc-panel-excerpt');
        txt.textContent = (c.body || '').slice(0, 60) + ((c.body || '').length > 60 ? '…' : '');
        item.appendChild(txt);

        const replies = allComments.filter(r => r.parentId === c.id).length;
        if (replies > 0) {
          const rc = el('span', 'pc-panel-reply-count');
          rc.textContent = `↩ ${replies} 則回覆`;
          item.appendChild(rc);
        }

        // Inline-expanded note thread
        if (c.type === 'note' && panel.expandedNote === c.noteKey) {
          const inline = el('div', 'pc-panel-inline-thread');
          renderInlineNoteThread(inline, c);
          item.appendChild(inline);
        }

        list.appendChild(item);
      });
    }
  }

  async function navigateToComment(comment) {
    closePanel();
    // B6: 只有換頁才走 navigate；同頁也讓出一個 tick 對齊時序（避免同步路徑下
    //     剛開的 popover 被同一輪事件處理清掉），確保已在該頁時仍能「跳出來」
    const onOtherScreen = navigateTo && comment.screenId && comment.screenId !== getScreenId();
    if (onOtherScreen) navigateTo(comment.screenId);
    await new Promise(r => setTimeout(r, onOtherScreen ? 150 : 0));

    if (comment.type === 'note' && comment.noteKey) {
      for (const row of document.querySelectorAll('[data-pc-injected]')) {
        if (noteKey(row.dataset.pcTag || '', row.dataset.pcText || '') === comment.noteKey) {
          row.scrollIntoView({ behavior: 'smooth', block: 'center' });
          const thread = row.nextElementSibling;
          if (thread?.classList.contains('pc-note-thread') && !thread.classList.contains('open')) {
            row.querySelector('.pc-note-comment-btn')?.click();
          }
          return;
        }
      }
      return;
    }

    const overlay = document.getElementById('pc-overlay');
    if (overlay && comment.x != null) {
      // B6: 高亮該 pin 讓留言「跳出來」（同頁無換頁動畫時的視覺回饋）
      const pinEl = overlay.querySelector(`.pc-pin[data-comment-id="${comment.id}"]`);
      if (pinEl) {
        pinEl.classList.remove('pc-pin-flash');
        void pinEl.offsetWidth;            // reflow → 重新觸發 animation
        pinEl.classList.add('pc-pin-flash');
        setTimeout(() => pinEl.classList.remove('pc-pin-flash'), 1300);
      }
      const rect = overlay.getBoundingClientRect();
      const cx = rect.left + (comment.x / 100) * rect.width;
      const cy = rect.top  + (comment.y / 100) * rect.height - getScrollTop();
      showThreadPopover(cx, cy, comment.id);
    }
  }

  // ── Note Module (lazy init after store is ready) ───────────────────────────
  const noteModule = createNoteModule({
    store,
    getCurrentUser: () => currentUser,
    attachMentions,
    getScreenId,
    engNoteSelector,
    getComments:    () => comments,
    noteKey,
    el,
    timeAgo,
    buildCommentItem,
  });

  // ── Screen-change listener ─────────────────────────────────────────────────
  document.addEventListener('pc:screen-change', ({ detail }) => {
    setCommentMode(false);
    closeAllPopovers();
    setTimeout(() => {
      mountOverlay();
      renderPins();
      noteModule.injectAll();
    }, 30);
    subscribe();
  });

  const observer = new MutationObserver(() => {
    if (!document.getElementById('pc-overlay')) mountOverlay();
    noteModule.injectAll();
    noteModule.refresh();
  });
  observer.observe(document.body, { childList: true, subtree: true });

  // ── Auth State ─────────────────────────────────────────────────────────────
  fb.onAuthStateChanged(auth, user => {
    currentUser = user;
    console.log('[pc] auth state:', user ? `logged in as ${user.email}` : 'not logged in');
    renderAuthBar(user);
    if (user) {
      subscribe();
      subscribeAll();
      buildPanel();
    } else {
      if (unsub)       { unsub();         unsub       = null; }
      if (panel.unsub) { panel.unsub();   panel.unsub = null; }
      comments    = [];
      allComments = [];
      closePanel();
      renderPins();
    }
  });

  // ── Bootstrap ─────────────────────────────────────────────────────────────
  mountAuthBar();
  mountOverlay();

  subscribe();

  setTimeout(() => noteModule.injectAll(), 200);

  document.addEventListener('click', e => {
    if (pop.el && !pop.el.contains(e.target)) {
      const isPin = e.target.closest('.pc-pin');
      if (!isPin) { pin.current = null; closeAllPopovers(); }
    }
  });

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && (movingPinId || isDragging)) cancelMovingPin();
  });

  return {
    setCommentMode,
    getComments: () => comments,
    subscribe,
  };
}
