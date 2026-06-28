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
/* Annotations inside overlay are always clickable regardless of overlay state */
.pc-overlay .pc-annotation {
  pointer-events: all !important;
  cursor: pointer;
}

/* Comment Annotation — 對話泡 bubble (方案 C)
   rounded-rect 比例（寬>高）+ 左下尾巴 → 單一數字也讀得出 speech bubble；不加白圈 */
.pc-annotation {
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
  transform: translate(-50%, -50%) scale(var(--pc-annotation-scale, 1));
  transform-origin: center;
  transition: transform .15s, opacity .15s;
  pointer-events: all;
}
.pc-annotation::before {                        /* 對話泡尾巴，左下角指向錨點 */
  content: '';
  position: absolute;
  bottom: -5px;
  left: 10px;
  width: 0; height: 0;
  border-left: 5px solid transparent;
  border-right: 6px solid transparent;
  border-top: 8px solid #BA1A1A;
}
.pc-annotation:hover { transform: translate(-50%, -50%) scale(calc(var(--pc-annotation-scale, 1) * 1.2)); }
/* 長按計時 / 拖曳中：停用 hover 放大，避免游標脫離 annotation 觸發 mouseleave 取消長按 */
.pc-annotation.pressing { transform: translate(-50%, -50%) scale(var(--pc-annotation-scale, 1)); }
.pc-annotation.moving { transform: translate(-50%, -50%) scale(var(--pc-annotation-scale, 1)); opacity: .7; cursor: grabbing; box-shadow: 0 4px 14px rgba(0,0,0,.4); }
.pc-annotation.resolved {
  background: #6b7280;                  /* gray-500：白字對比度 ~4.6:1 達 WCAG AA，一眼讀得出 ✓ */
  color: #fff;
  opacity: .80;                          /* 仍保留「已解決=次要、退到背景」語意，但不再糊掉 */
}
.pc-annotation.resolved::before { border-top-color: #6b7280; }
.pc-annotation.pc-annotation-edge::before { display: none; }   /* edge annotation 用 ::after 箭頭，不顯示泡泡尾巴 */
.pc-annotation-label { line-height: 1; display: inline-flex; align-items: center; gap: 1px; }
.pc-annotation-ic { flex: 0 0 16px; display: inline-flex; justify-content: center; overflow: hidden; }   /* icon 固定寬框(不縮不漲) → 💬/✓ 同寬，resolved 與未解決 annotation 對齊 */

/* B6: 「全部留言」導向同頁時，annotation 閃爍高亮讓留言「跳出來」 */
.pc-annotation.pc-annotation-flash { animation: pc-annotation-flash .55s ease 2; z-index: 211; }
@keyframes pc-annotation-flash {
  0%, 100% { transform: translate(-50%, -50%) scale(var(--pc-annotation-scale, 1)); box-shadow: 0 2px 6px rgba(0,0,0,.3); }
  50%      { transform: translate(-50%, -50%) scale(calc(var(--pc-annotation-scale, 1) * 1.5)); box-shadow: 0 0 0 4px rgba(186,26,26,.35), 0 2px 8px rgba(0,0,0,.35); }
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
/* B10: root 控制項（reactions/resolve/回覆/決議）放 panel item 最外層，compact 扁平呈現、與摘要間以虛線分隔 */
.pc-panel-root-ctrl { margin-top: 6px; padding-top: 6px; border-top: 1px dashed #e5e7eb; cursor: default; }

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
  /* [ADD 2026-06-16] 留言串太高時內部捲動，不要溢出視窗（之前在 live app 上 thread 會跑出框外）。
     box-sizing 確保 260px 含 padding，max-width 防止窄視窗水平溢出。 */
  box-sizing: border-box;
  max-width: calc(100vw - 20px);
  max-height: calc(100vh - 24px);
  overflow-y: auto;
}
/* 已解決留言：整個對話框轉灰，與灰色 annotation 語意一致 */
.pc-popover.resolved { background: #f3f4f6; }
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
.pc-ci-resolved-by { font-size: 10px; color: #9ca3af; align-self: center; }

/* 決議（採用/不採用/待議）UI 已從留言 overlay 移除 → 只在 report.html；此處不再需要 .pc-ci-dec-* */

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

/* Annotation visibility toggle */
.pc-annotations-hidden .pc-annotation { display: none !important; }

/* Edge-docked annotations (off-screen content) */
.pc-annotation.pc-annotation-edge { opacity: .75; }
.pc-annotation.pc-annotation-edge-top::after,
.pc-annotation.pc-annotation-edge-bottom::after {
  content: '';
  position: absolute;
  left: 50%;
  transform: translateX(-50%);
  width: 0; height: 0;
  border-left: 4px solid transparent;
  border-right: 4px solid transparent;
}
.pc-annotation.pc-annotation-edge-top::after {
  bottom: calc(100% + 2px);
  border-bottom: 5px solid #0FA0A0;
}
.pc-annotation.pc-annotation-edge-bottom::after {
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

/* Annotation relocation — drag state */
@keyframes pc-annotation-pulse {
  from { box-shadow: 0 2px 8px rgba(15,160,160,.5), 0 0 0 3px #0FA0A0; }
  to   { box-shadow: 0 2px 8px rgba(15,160,160,.8), 0 0 0 6px rgba(15,160,160,.3); }
}
.pc-annotation.moving {
  animation: pc-annotation-pulse .6s ease-in-out infinite alternate;
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

// 團隊模式：向量繪圖物件的 Firestore store（draw-tooling plan §4.6）。
// 與 comments 同 `projectId`，存在子集合 `prototype-comments/{projectId}/drawings`。
// 與 createStore 的差異：
//   - 用 setDoc 以「繪圖物件自己的 id」當 Firestore doc id → de-dupe / update / remove 全靠同一把 id，
//     teammate 同步與本地 echo 都好對齊（不會因 auto-id 產生重複）。
//   - **只存向量 strokes JSON**：呼叫端（draw-layer）負責用 drawingToDoc() 剝掉 imageRef/PNG dataURL，
//     PNG 永不進 Firestore（需要時前端從向量即時重畫）。
function createDrawingStore(fb, db, projectId) {
  const col = () => fb.collection(db, 'prototype-comments', projectId, 'drawings');
  const ref = id => fb.doc(db, 'prototype-comments', projectId, 'drawings', id);

  return {
    query:     (...constraints) => fb.query(col(), ...constraints),
    // comments 的 subscribe 收外部 query；drawings 直接訂閱整個集合（呼叫端只要 onChange/onErr）。
    subscribe: (onChange, onErr) => fb.onSnapshot(
      fb.query(col()),
      snap => onChange(snap.docs.map(d => ({ id: d.id, ...d.data() }))),
      onErr
    ),
    // drawObj 須已是向量精簡 doc（drawingToDoc 產物）；setDoc by id → upsert。
    save:   drawObj => fb.setDoc(ref(drawObj.id), { ...drawObj, updatedAt: fb.serverTimestamp() }),
    update: (id, patch) => fb.updateDoc(ref(id), { ...patch, updatedAt: fb.serverTimestamp() }),
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
 * draw-layer — Figma/Excalidraw 風格的視覺標注繪圖層（plan §4.1–§4.3）。
 *
 * 在既有 `#pc-overlay` 之上加一個 `#pc-draw` SVG 層，提供：
 *   - 模式狀態機 mode ∈ { comment, draw, off }；draw 時 SVG `pointer-events:auto`
 *     吃事件擋掉 app 點擊，comment/off 則 `pointer-events:none` 放行（不跟 app 打架）。
 *   - 浮動工具列：select / ellipse / arrow / pencil / text / rect / line
 *     ＋ 顏色筆粗 picker ＋ z-order / 刪除 / undo-redo。
 *   - 七種工具繪製、選取/移動/縮放、z-order、刪除、undo-redo。
 *
 * 座標一律存 viewport-% （沿用 pc.js 既有 % 慣例 → RWD 友善）；render 時才換算成 px。
 * 幾何換算、bbox、平移/縮放重映射、z-order 重排、undo command apply/invert 全抽成純函式
 *（下方 export），可單測。
 *
 * Usage:
 *   import { initDrawLayer } from '.../src/draw-layer.js';
 *   const draw = initDrawLayer('#root');   // 或傳 element；預設 document.body
 *   draw.setMode('draw'); draw.setTool('select');
 *
 * P2 之後（不在本階段）：貼圖、selector 擷取(anchor)、PNG/JSON 匯出。
 *
 * P7 團隊持久（選用）：傳 opts.persist（{fb,db,projectId} 或 ready store）→ 把向量物件
 * 同步到 Firestore `drawings` 子集合；不傳則 0 Firebase（dev 模式行為完全不變）。
 */

// ── 常數 ────────────────────────────────────────────────────────────────────
const DRAW_MODES = ['comment', 'draw', 'off'];
const DRAW_TOOLS = ['select', 'rect', 'diamond', 'ellipse', 'arrow', 'line', 'pencil', 'text'];
const DEFAULT_DRAW_STYLE = { color: '#E5484D', strokeWidth: 2, fill: 'none', fontSize: 16 };
// Excalidraw/Figma 風格預設色（8 色）＋ picker 另附 <input type=color> 自訂任意 hex。
const DRAW_COLORS = ['#1e1e1e', '#e03131', '#2f9e44', '#1971c2', '#f08c00', '#9c36b5', '#0c8599', '#868e96'];
const DRAW_STROKE_WIDTHS = [1, 2, 4, 6]; // thin → bold
const DRAW_FONT_SIZES = [12, 16, 20, 28]; // 文字工具字體大小選項（px）
const DRAW_HEAD_MODES = ['none', 'end', 'start', 'both']; // 端點箭頭：無/終點/起點/雙向
// line/arrow 的端點箭頭：依 style.heads；未設時 arrow→終點、line→無（向後相容）。
function arrowHeads(o) {
  if (!o || (o.tool !== 'arrow' && o.tool !== 'line')) return { start: false, end: false };
  const mode = (o.style && o.style.heads) || (o.tool === 'arrow' ? 'end' : 'none');
  return { start: mode === 'start' || mode === 'both', end: mode === 'end' || mode === 'both' };
}
const MIN_DRAW_SIZE_PCT = 1; // 縮放最小尺寸（% 座標）

const SVG_NS = 'http://www.w3.org/2000/svg';
const HANDLE_FIXED = { nw: 'se', ne: 'sw', se: 'nw', sw: 'ne' };

// Material Icons 官方 24px path data（與 MUI 同一套圖示，inline SVG，不引 React/@mui）。
const ICON_PATHS = {
  select: 'M21 3L3 10.53v.98l6.84 2.65L12.48 21h.98L21 3z',                                   // near_me
  ellipse: 'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8z', // circle (outlined)
  arrow: 'M6 6v2h8.59L5 17.59 6.41 19 16 9.41V18h2V6z',                                        // arrow_outward
  pencil: 'M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z', // edit
  text: 'M5 4v3h5.5v12h3V7H19V4z',                                                             // title
  rect: 'M18 4H6c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 14H6V6h12v12z', // crop_square
  diamond: 'M12 2L22 12 12 22 2 12z',                                                          // 菱形（Material 無乾淨菱形，自繪）
  line: 'M19 13H5v-2h14v2z',                                                                   // remove (horizontal bar)
  front: 'M3 13h2v-2H3v2zm0 4h2v-2H3v2zm2 4v-2H3c0 1.1.89 2 2 2zM3 9h2V7H3v2zm12 12h2v-2h-2v2zm4-18H9c-1.11 0-2 .9-2 2v10c0 1.1.89 2 2 2h10c1.11 0 2-.9 2-2V5c0-1.1-.89-2-2-2zm0 12H9V5h10v10zm-8 6h2v-2h-2v2zm-4 0h2v-2H7v2z', // flip_to_front（置頂）
  back: 'M9 7H7v2h2V7zm0 4H7v2h2v-2zm0-8c-1.11 0-2 .9-2 2h2V3zm4 12h-2v2h2v-2zm6-12v2h2c0-1.1-.9-2-2-2zm-6 0h-2v2h2V3zM9 17v-2H7c0 1.1.89 2 2 2zm10-4h2v-2h-2v2zm0-4h2V7h-2v2zm0 8c1.1 0 2-.9 2-2h-2v2zM5 7H3v12c0 1.1.89 2 2 2h12v-2H5V7zm10-2h2V3h-2v2zm0 12h2v-2h-2v2z', // flip_to_back（置底）
  // move_up / move_down：左側上/下箭頭 + 右側堆疊列 → 一眼讀作「在圖層堆疊中上/下移一層」，與 flip 置頂/底明顯區隔。
  forward: 'M9 4L5 8h3v6h2V8h3zM15 5h6v2h-6zM15 9h6v2h-6zM15 13h6v2h-6zM15 17h6v2h-6z',           // move_up（上移一層）
  backward: 'M9 20l-4-4h3v-6h2v6h3zM15 5h6v2h-6zM15 9h6v2h-6zM15 13h6v2h-6zM15 17h6v2h-6z',        // move_down（下移一層）
  delete: 'M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z',       // delete
  undo: 'M12.5 8c-2.65 0-5.05.99-6.9 2.6L2 7v9h9l-3.62-3.62c1.39-1.16 3.16-1.88 5.12-1.88 3.54 0 6.55 2.31 7.6 5.5l2.37-.78C21.08 11.03 17.15 8 12.5 8z', // undo
  redo: 'M18.4 10.6C16.55 8.99 14.15 8 11.5 8c-4.65 0-8.58 3.03-9.96 7.22L3.9 16c1.05-3.19 4.05-5.5 7.6-5.5 1.95 0 3.73.72 5.12 1.88L13 16h9V7l-3.6 3.6z', // redo
  lineWeight: 'M3 17h18v-2H3v2zm0 3h18v-1H3v1zm0-7h18v-3H3v3zm0-9v4h18V4H3z',                    // line_weight
  close: 'M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z', // close
  colorize: 'M20.71 5.63l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-3.12 3.12-1.93-1.91-1.41 1.41 1.42 1.42L3 16.25V21h4.75l8.92-8.92 1.42 1.42 1.41-1.41-1.92-1.92 3.12-3.12c.4-.4.4-1.03.01-1.4zM6.92 19L5 17.08l8.06-8.06 1.92 1.92L6.92 19z', // colorize（吸管）
  brush: 'M7 14c-1.66 0-3 1.34-3 3 0 1.31-1.16 2-2 2 .92 1.22 2.49 2 4 2 2.21 0 4-1.79 4-4 0-1.66-1.34-3-3-3zm13.71-9.37l-1.34-1.34c-.39-.39-1.02-.39-1.41 0L9 12.25 11.75 15l8.96-8.96c.39-.39.39-1.02 0-1.41z', // brush（麥克筆）
  highlighter: 'M17.75 7L14 3.25l-10 10V17h3.75l10-10zm2.96-2.96c.39-.39.39-1.02 0-1.41L18.37.29c-.2-.2-.45-.29-.71-.29s-.51.1-.7.29L15 2.25 18.75 6l1.96-1.96zM0 20h24v4H0z', // border_color（螢光筆）
  send: 'M2.01 21L23 12 2.01 3 2 10l15 2-15 2z', // send（送給 AI）
};

// 一個 Material 圖示 → inline SVG 字串（currentColor → 跟著 active/hover 文字色變化）。
function icon(name, size = 20) {
  return `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="currentColor" aria-hidden="true"><path d="${ICON_PATHS[name]}"/></svg>`;
}

// 筆刷類型（自由筆 pencil 的 brushType）。
const DRAW_BRUSHES = ['pen', 'marker', 'highlighter'];
const BRUSH_LABELS = { pen: '鋼筆', marker: '麥克筆', highlighter: '螢光筆' };
const BRUSH_ICON = { pen: 'pencil', marker: 'brush', highlighter: 'highlighter' };

// 各筆刷的渲染參數（純資料，可單測）：
//   fill=true → 變寬度填充外框（pen/marker，頭尾漸細）；fill=false → 等寬描邊（highlighter，半透明）。
//   widthMul = 相對 strokeWidth 的倍率；taperFrac = 頭尾各佔幾成做漸細；minScale = 端點最小寬度比例。
const BRUSH_RENDER = {
  pen: { fill: true, widthMul: 1.8, taperFrac: 0.18, minScale: 0, opacity: 1, blend: 'normal' },
  marker: { fill: true, widthMul: 3.2, taperFrac: 0.12, minScale: 0.5, opacity: 1, blend: 'normal' },
  highlighter: { fill: false, widthMul: 5, taperFrac: 0, minScale: 1, opacity: 0.4, blend: 'multiply' },
};
function brushStyle(brushType) { return BRUSH_RENDER[brushType] || BRUSH_RENDER.pen; }

// ── 鍵盤快捷鍵（Excalidraw 風格：數字 + 字母都可）────────────────────────────────
// 值為工具名（DRAW_TOOLS）或 'eyedropper'。鍵一律小寫；diamond(3)/image(9) 尚未實作故略過。
const TOOL_SHORTCUTS = {
  1: 'select', v: 'select',
  2: 'rect', r: 'rect',
  3: 'diamond', d: 'diamond',
  4: 'ellipse', o: 'ellipse',
  5: 'arrow', a: 'arrow',
  6: 'line', l: 'line',
  7: 'pencil', p: 'pencil',
  8: 'text', t: 'text',
  i: 'eyedropper',
};
// 工具的中文標籤與主要字母提示（tooltip / aria）。
const TOOL_LABELS_ZH = { select: '選取', ellipse: '橢圓', arrow: '箭頭', pencil: '自由筆', text: '文字', rect: '矩形', diamond: '菱形', line: '直線' };
const TOOL_KEY = { select: 'V', rect: 'R', diamond: 'D', ellipse: 'O', arrow: 'A', line: 'L', pencil: 'P', text: 'T' };

// key（單鍵）→ 工具名 / 'eyedropper' / null。大小寫不敏感。純函式。
function resolveShortcut(key) {
  if (key == null) return null;
  return TOOL_SHORTCUTS[String(key).toLowerCase()] || null;
}

// ── 純函式（單元測試對象，無 DOM 依賴）──────────────────────────────────────
// px → viewport-%（沿用 index.js overlay click 的 toFixed(2) 慣例）。
function pxToPct(px, total) {
  if (!total) return 0;
  return parseFloat(((px / total) * 100).toFixed(2));
}

// viewport-% → px。
function pctToPx(pct, total) {
  return (pct / 100) * total;
}

// 視窗座標 (clientX/Y) → 相對 rect 的 % 點。自由畫＝固定畫布座標，不接 scroll anchor。
function clientToPct(clientX, clientY, rect) {
  return {
    x: pxToPct(clientX - rect.left, rect.width),
    y: pxToPct(clientY - rect.top, rect.height),
  };
}

// 兩個 % 點 → bounding box：{x,y}=左上、{w,h}=尺寸，皆為 %。
function rectFromPoints(a, b) {
  return {
    x: Math.min(a.x, b.x),
    y: Math.min(a.y, b.y),
    w: Math.abs(b.x - a.x),
    h: Math.abs(b.y - a.y),
  };
}

// 菱形（rhombus）四頂點：內接於 bbox（上、右、下、左中點）。純函式，px 或 % 皆可。
function diamondPoints(box) {
  return [
    [box.x + box.w / 2, box.y],
    [box.x + box.w, box.y + box.h / 2],
    [box.x + box.w / 2, box.y + box.h],
    [box.x, box.y + box.h / 2],
  ];
}

// 貼圖初始幾何（% 座標）：自然像素尺寸等比縮到 ≤ maxFrac 畫布，置於 atPoint 中心（無則畫布中心），夾進畫布。
// 純函式 → {x,y,w,h}（%）。等比在「像素空間」計算後再換成 %，確保視覺長寬比正確。
function imageGeom(natW, natH, canvasW, canvasH, atPoint, maxFrac = 0.6) {
  const r2 = n => parseFloat(n.toFixed(2));
  const CW = canvasW || 1, CH = canvasH || 1;
  const scale = Math.min(1, (maxFrac * CW) / (natW || 1), (maxFrac * CH) / (natH || 1)); // 等比、不放大
  const wPct = (natW * scale / CW) * 100;
  const hPct = (natH * scale / CH) * 100;
  let x = atPoint ? atPoint.x - wPct / 2 : 50 - wPct / 2;
  let y = atPoint ? atPoint.y - hPct / 2 : 50 - hPct / 2;
  x = Math.max(0, Math.min(x, 100 - wPct)); // 夾進畫布
  y = Math.max(0, Math.min(y, 100 - hPct));
  return { x: r2(x), y: r2(y), w: r2(wPct), h: r2(hPct) };
}

// ── P4 結構化匯出（selector 擷取 + 精簡 JSON）────────────────────────────────────
const ANCHOR_DATA_ATTRS = ['data-testid', 'data-test', 'data-cy', 'data-id'];
function cssEscape(s) {
  if (typeof CSS !== 'undefined' && CSS.escape) return CSS.escape(s);
  return String(s).replace(/[^a-zA-Z0-9_-]/g, '\\$&'); // node fallback（無 CSS API）
}
function nthOfType(el) {
  const parent = el.parentElement || el.parentNode;
  if (!parent || !parent.children) return null;
  const same = [...parent.children].filter(c => c.tagName === el.tagName);
  if (same.length <= 1) return null;
  return same.indexOf(el) + 1;
}
// DOM 元素 → 穩定 CSS selector（id 優先 → data-* → nth-of-type 路徑）。可被 querySelector round-trip。
function cssSelectorFor(el) {
  if (!el || !el.tagName) return null;
  if (el.id) return '#' + cssEscape(el.id);
  for (const attr of ANCHOR_DATA_ATTRS) {
    const v = el.getAttribute && el.getAttribute(attr);
    if (v) return `[${attr}="${cssEscape(v)}"]`;
  }
  const parts = [];
  let cur = el;
  while (cur && cur.tagName) {
    const tag = cur.tagName.toLowerCase();
    if (tag === 'html' || tag === 'body') break;
    if (cur.id) { parts.unshift('#' + cssEscape(cur.id)); break; }
    const v = cur.getAttribute && ANCHOR_DATA_ATTRS.map(a => [a, cur.getAttribute(a)]).find(([, x]) => x);
    if (v) { parts.unshift(`[${v[0]}="${cssEscape(v[1])}"]`); break; }
    const n = nthOfType(cur);
    parts.unshift(n ? `${tag}:nth-of-type(${n})` : tag);
    cur = cur.parentElement || cur.parentNode;
  }
  return parts.length ? parts.join(' > ') : null;
}

// DrawObject[] → 精簡結構化匯出（省 token；只含有意義欄位）。純函式。
function buildExport(objects, viewport = {}) {
  return {
    viewport: { w: viewport.w || 0, h: viewport.h || 0 },
    annotations: (objects || []).map(o => {
      const a = { id: o.id, tool: o.tool };
      if (o.anchor != null) a.selector = o.anchor;
      const text = (o.label != null && o.label !== '') ? o.label : (o.text != null ? o.text : null);
      if (text != null) a.text = text;
      if (o.style && o.style.color) a.color = o.style.color;
      if (o.imageRef != null) a.image = true; // 標記有圖（dataURL 不塞進精簡 JSON）
      a.geom = o.geom;
      return a;
    }),
  };
}

// ── P6 側邊標注紀錄面板：row 資料（純函式，可單測）─────────────────────────────────
// 每個工具的友善預設標籤（物件無 label/text 時，面板顯示這個 → 比 'ellipse' 易讀）。
const ANNOTATION_TOOL_LABELS = {
  ellipse: '圈選', arrow: '箭頭', line: '直線', rect: '矩形', diamond: '菱形',
  pencil: '手繪', text: '文字', image: '參考圖',
};
// DrawObject[] → 側邊「標注紀錄」面板的 row 資料。純函式：
//   text：label（綁定標籤）優先 → text（文字工具）→ 工具友善預設（圈選/箭頭…）。
//   selector：取 anchor（elementFromPoint 擷取的元件），無則 null。
//   color：取 style.color。icon：對映合法的工具圖示名（無對應者退回 'rect'）。
function annotationRows(objects) {
  return (objects || []).map(o => {
    const text = (o.label != null && o.label !== '') ? o.label
      : (o.text != null && o.text !== '') ? o.text
      : (ANNOTATION_TOOL_LABELS[o.tool] || o.tool);
    return {
      id: o.id,
      tool: o.tool,
      icon: ICON_PATHS[o.tool] ? o.tool : 'rect', // 面板圖示用（image 無專屬圖示 → 退回方框）
      text,
      selector: o.anchor != null ? o.anchor : null,
      color: (o.style && o.style.color) || null,
    };
  });
}

// 一次拖曳（起點 a、終點 b）→ 某工具的幾何（box 類 / 端點類）。pencil 另走累點邏輯。
function geomFromDrag(tool, a, b) {
  if (tool === 'ellipse' || tool === 'rect' || tool === 'diamond') return rectFromPoints(a, b);
  if (tool === 'arrow' || tool === 'line') return { from: { ...a }, to: { ...b } };
  return { x: b.x, y: b.y }; // text 等：落點即位置
}

// 抽稀：丟掉與上一個保留點距離 < minDist 的密集點（保留首尾），讓平滑曲線乾淨。
function thinPoints(points, minDist) {
  if (!points || points.length <= 2) return (points || []).slice();
  const out = [points[0]];
  let last = points[0];
  for (let i = 1; i < points.length - 1; i++) {
    const dx = points[i][0] - last[0], dy = points[i][1] - last[1];
    if (dx * dx + dy * dy >= minDist * minDist) { out.push(points[i]); last = points[i]; }
  }
  out.push(points[points.length - 1]);
  return out;
}

// 自由筆平滑（Excalidraw 風格手繪感）：二次貝茲「中點平滑」——
// 每段以「採樣點」當控制點、以「相鄰兩採樣點的中點」當端點 → 連續、無稜角。
// 純函式：input 為 px 點陣列 [[x,y]…]，回傳 SVG <path> 的 d 字串（M … Q … L …）。
function freehandPath(points, minDist = 1.5) {
  const pts = thinPoints(points, minDist);
  const r = n => Math.round(n * 100) / 100;
  if (pts.length === 0) return '';
  const p0 = pts[0];
  if (pts.length === 1) return `M ${r(p0[0])} ${r(p0[1])}`;                              // 單點 → round cap 顯示一個點
  if (pts.length === 2) return `M ${r(p0[0])} ${r(p0[1])} L ${r(pts[1][0])} ${r(pts[1][1])}`; // 兩點 → 直線
  let d = `M ${r(p0[0])} ${r(p0[1])}`;
  for (let i = 1; i < pts.length - 1; i++) {
    const xc = (pts[i][0] + pts[i + 1][0]) / 2;
    const yc = (pts[i][1] + pts[i + 1][1]) / 2;
    d += ` Q ${r(pts[i][0])} ${r(pts[i][1])} ${r(xc)} ${r(yc)}`;
  }
  const last = pts[pts.length - 1];
  return d + ` L ${r(last[0])} ${r(last[1])}`; // 收尾接到最後一個採樣點
}

// 漸細係數：t（0..1 弧長位置）→ 0..1。頭尾各佔 taperFrac 從 0 線性升到 1，中段恆 1。
function taperScale(t, taperFrac = 0.15) {
  const f = taperFrac <= 0 ? 1e-4 : taperFrac;
  if (t < f) return t / f;
  if (t > 1 - f) return (1 - t) / f;
  return 1;
}

// 每個中心線點的線寬（依弧長位置漸細）。純函式，供 taperedOutline 與單測使用。
function outlineWidths(points, baseWidth, opts = {}) {
  const taperFrac = opts.taperFrac ?? 0.15;
  const minScale = opts.minScale ?? 0;
  const pts = thinPoints(points, 0.5);
  const n = pts.length;
  if (n === 0) return [];
  if (n === 1) return [baseWidth];
  const len = [0];
  let total = 0;
  for (let i = 1; i < n; i++) { total += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); len.push(total); }
  if (!total) total = 1;
  return len.map(L => baseWidth * (minScale + (1 - minScale) * taperScale(L / total, taperFrac)));
}

// 頭尾漸細的「填充外框」path（pen/marker 用）：沿中心線兩側依 outlineWidths 偏移，
// 去程走一側、回程走另一側、封閉成多邊形。純函式 → SVG <path> 的 d（M…L…Z）。
function taperedOutline(points, baseWidth, opts = {}) {
  const pts = thinPoints(points, 0.5);
  const r = v => Math.round(v * 100) / 100;
  const n = pts.length;
  if (n === 0) return '';
  if (n === 1) { // 單點 → 圓點
    const rad = baseWidth / 2, [x, y] = pts[0];
    return `M ${r(x - rad)} ${r(y)} a ${r(rad)} ${r(rad)} 0 1 0 ${r(2 * rad)} 0 a ${r(rad)} ${r(rad)} 0 1 0 ${r(-2 * rad)} 0 Z`;
  }
  const widths = outlineWidths(points, baseWidth, opts);
  const left = [], right = [];
  for (let i = 0; i < n; i++) {
    const dir = pointDir(pts, i);
    const nx = -dir.y, ny = dir.x; // 法線
    const w = widths[i] / 2;
    left.push([pts[i][0] + nx * w, pts[i][1] + ny * w]);
    right.push([pts[i][0] - nx * w, pts[i][1] - ny * w]);
  }
  let d = `M ${r(left[0][0])} ${r(left[0][1])}`;
  for (let i = 1; i < n; i++) d += ` L ${r(left[i][0])} ${r(left[i][1])}`;
  for (let i = n - 1; i >= 0; i--) d += ` L ${r(right[i][0])} ${r(right[i][1])}`;
  return d + ' Z';
}
// 第 i 點的單位切線（用前後鄰點方向）。
function pointDir(pts, i) {
  const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const m = Math.hypot(dx, dy) || 1;
  return { x: dx / m, y: dy / m };
}

// 任一物件 → 其 % bounding box（選取框 / 命中測試 / 縮放重映射用）。
// resolve(o)（選用）：回傳 arrow/line 解析後端點 {from,to}（el/obj anchor）。不傳則用 geom。
function geomBBox(o, resolve) {
  const g = o.geom;
  if (o.tool === 'ellipse' || o.tool === 'rect' || o.tool === 'diamond' || o.tool === 'image') return { x: g.x, y: g.y, w: g.w, h: g.h };
  if (o.tool === 'arrow' || o.tool === 'line') { const e = resolve ? resolve(o) : g; return rectFromPoints(e.from, e.to); }
  if (o.tool === 'pencil') {
    const xs = g.points.map(p => p[0]), ys = g.points.map(p => p[1]);
    const x = Math.min(...xs), y = Math.min(...ys);
    return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
  }
  const w = Math.max(4, (o.text ? o.text.length : 1) * 1.2); // text：估一個可命中的框
  return { x: g.x, y: g.y - 2.5, w, h: 3.5 };
}

// 綁定標籤的錨點（% 座標）：line/arrow 取兩端中點；其餘取 bbox 中心。隨 geom 重算 → 跟著物件移動/縮放。
function labelAnchor(o, resolve) {
  if (o.tool === 'arrow' || o.tool === 'line') {
    const e = resolve ? resolve(o) : o.geom;
    return { x: (e.from.x + e.to.x) / 2, y: (e.from.y + e.to.y) / 2 };
  }
  const b = geomBBox(o, resolve);
  return { x: b.x + b.w / 2, y: b.y + b.h / 2 };
}

// 平移物件幾何（移動）。回傳新 geom，不改入參。
function translateGeom(o, dx, dy) {
  const g = o.geom;
  if (o.tool === 'arrow' || o.tool === 'line')
    return { from: { x: g.from.x + dx, y: g.from.y + dy }, to: { x: g.to.x + dx, y: g.to.y + dy } };
  if (o.tool === 'pencil') return { points: g.points.map(([x, y]) => [x + dx, y + dy]) };
  if (o.tool === 'ellipse' || o.tool === 'rect' || o.tool === 'diamond' || o.tool === 'image') return { x: g.x + dx, y: g.y + dy, w: g.w, h: g.h };
  return { x: g.x + dx, y: g.y + dy }; // text
}

// 把幾何從 oldBox 等比重映射到 newBox（縮放）。回傳新 geom。
function remapGeom(o, oldBox, newBox) {
  const sx = oldBox.w ? newBox.w / oldBox.w : 0;
  const sy = oldBox.h ? newBox.h / oldBox.h : 0;
  const mx = x => newBox.x + (x - oldBox.x) * sx;
  const my = y => newBox.y + (y - oldBox.y) * sy;
  const g = o.geom;
  if (o.tool === 'arrow' || o.tool === 'line')
    return { from: { x: mx(g.from.x), y: my(g.from.y) }, to: { x: mx(g.to.x), y: my(g.to.y) } };
  if (o.tool === 'pencil') return { points: g.points.map(([x, y]) => [mx(x), my(y)]) };
  if (o.tool === 'ellipse' || o.tool === 'rect' || o.tool === 'diamond' || o.tool === 'image') return { x: newBox.x, y: newBox.y, w: newBox.w, h: newBox.h };
  return { x: mx(g.x), y: my(g.y) }; // text
}

function boxCorner(box, name) {
  const c = {
    nw: { x: box.x, y: box.y },
    ne: { x: box.x + box.w, y: box.y },
    se: { x: box.x + box.w, y: box.y + box.h },
    sw: { x: box.x, y: box.y + box.h },
  };
  return c[name];
}

// 拖某角 handle → 新 box：對角固定、拖到點 p，最後夾住最小尺寸。
function resizeBBox(oldBox, handle, p, minSize = MIN_DRAW_SIZE_PCT) {
  const fixed = boxCorner(oldBox, HANDLE_FIXED[handle] || 'nw');
  const box = rectFromPoints(fixed, p);
  if (box.w < minSize) box.w = minSize;
  if (box.h < minSize) box.h = minSize;
  return box;
}

// 設定箭頭/線段的端點（immutable）。which ∈ 'from'|'to'。回傳新 geom，不改入參。
function setEndpoint(geom, which, p) {
  return { ...geom, [which]: { x: p.x, y: p.y } };
}

// ── Batch 4 純函式：端點吸附 + element/object anchor 解析 ──────────────────────
// 吸附閾值（host rect %）。約等於 800px 寬畫布上 ~20px。改這裡即可調整吸附靈敏度。
const SNAP_THRESHOLD_PCT = 2.5;

// rect {x,y,w,h}（% 空間）→ 8 個吸附點：4 邊中點 + 4 角，各標 ref。
function rectAnchorPoints(rect) {
  const { x, y, w, h } = rect;
  return [
    { x: x + w / 2, y, ref: 'top' },
    { x: x + w, y: y + h / 2, ref: 'right' },
    { x: x + w / 2, y: y + h, ref: 'bottom' },
    { x, y: y + h / 2, ref: 'left' },
    { x, y, ref: 'tl' },
    { x: x + w, y, ref: 'tr' },
    { x: x + w, y: y + h, ref: 'br' },
    { x, y: y + h, ref: 'bl' },
  ];
}

// p {x,y} → rect 邊界上最近點。外部點 → clamp 到邊界；內部點 → 投影到最近的一條邊。
function nearestPointOnRect(p, rect) {
  const { x, y, w, h } = rect;
  const inside = p.x > x && p.x < x + w && p.y > y && p.y < y + h;
  if (!inside) {
    return { x: Math.max(x, Math.min(p.x, x + w)), y: Math.max(y, Math.min(p.y, y + h)) };
  }
  const dl = p.x - x, dr = x + w - p.x, dt = p.y - y, db = y + h - p.y;
  const m = Math.min(dl, dr, dt, db);
  if (m === dl) return { x, y: p.y };
  if (m === dr) return { x: x + w, y: p.y };
  if (m === dt) return { x: p.x, y };
  return { x: p.x, y: y + h };
}

// 其他畫圖物件（arrow/line）的端點 → 吸附候選，標上可建 obj anchor 的 objId/which。
const SNAP_SHAPE_TOOLS = ['rect', 'ellipse', 'diamond', 'image'];
function objectSnapPoints(objects, exceptId) {
  const pts = [];
  (objects || []).forEach(o => {
    if (o.id === exceptId) return;
    if (o.tool === 'arrow' || o.tool === 'line') { // line/arrow → 兩端點（鎖 which）
      pts.push({ x: o.geom.from.x, y: o.geom.from.y, objId: o.id, which: 'from' });
      pts.push({ x: o.geom.to.x, y: o.geom.to.y, objId: o.id, which: 'to' });
    } else if (SNAP_SHAPE_TOOLS.includes(o.tool)) { // 形狀 → bbox 8 錨點（鎖 relX/relY，隨形狀移動）
      const bbox = geomBBox(o);
      rectAnchorPoints(bbox).forEach(pt => {
        const rel = anchorRel(pt, bbox);
        pts.push({ x: pt.x, y: pt.y, objId: o.id, relX: rel.relX, relY: rel.relY });
      });
    }
  });
  return pts;
}

// p → candidates 中閾值內最近者 {point, cand}；皆超過閾值 → null。
function nearestSnap(p, candidates, threshold = SNAP_THRESHOLD_PCT) {
  let best = null, bestD = threshold;
  (candidates || []).forEach(c => {
    const d = Math.hypot(c.x - p.x, c.y - p.y);
    if (d <= bestD) { bestD = d; best = c; }
  });
  return best ? { point: { x: best.x, y: best.y }, cand: best } : null;
}

// p(%) 在 elRect(%) 內的相對位置 0..1（除以零時回 0）。
function anchorRel(p, elRect) {
  return {
    relX: elRect.w ? (p.x - elRect.x) / elRect.w : 0,
    relY: elRect.h ? (p.y - elRect.y) / elRect.h : 0,
  };
}

// el anchor + elRect(%) → 絕對 % 點（anchorRel 的逆運算）。
function resolveAnchorPoint(anchor, elRect) {
  return {
    x: elRect.x + (anchor.relX || 0) * elRect.w,
    y: elRect.y + (anchor.relY || 0) * elRect.h,
  };
}

// 解析單一端點：有 el anchor → getRectPct(selector) 換算；有 obj anchor → 查目標物件端點；
// 無 anchor 或解析失敗 → 回 geom fallback。seen 防 obj anchor 互鎖造成無限遞迴。
function resolveOneEnd(o, which, getRectPct, objects, seen) {
  const anchor = o.endAnchors && o.endAnchors[which];
  const fallback = o.geom[which];
  if (!anchor) return fallback;
  if (anchor.kind === 'el') {
    const elRect = getRectPct && getRectPct(anchor.selector);
    return elRect ? resolveAnchorPoint(anchor, elRect) : fallback;
  }
  if (anchor.kind === 'obj') {
    if (!objects || seen.has(anchor.objId)) return fallback;
    const target = objects.find(t => t.id === anchor.objId);
    if (!target) return fallback;
    seen.add(o.id);
    if (anchor.relX != null) return resolveAnchorPoint(anchor, geomBBox(target)); // 鎖到形狀 bbox 相對位置
    const ends = resolveEndpoints(target, getRectPct, objects, seen);             // 鎖到 line/arrow 端點
    return ends[anchor.which] || fallback;
  }
  return fallback;
}

// 解析 arrow/line 物件的兩端 → {from,to}。供 render/geomBBox/labelAnchor 注入。
function resolveEndpoints(o, getRectPct, objects, seen = new Set()) {
  return {
    from: resolveOneEnd(o, 'from', getRectPct, objects, seen),
    to: resolveOneEnd(o, 'to', getRectPct, objects, seen),
  };
}

// 把某一端的 anchor 併入 endAnchors（immutable）。anchor 為 falsy → 清掉該端；
// 兩端皆空 → 回 undefined（物件不再帶 endAnchors）。
function mergeEndAnchor(prev, which, anchor) {
  const next = { ...(prev || {}) };
  if (anchor) next[which] = anchor; else delete next[which];
  return Object.keys(next).length ? next : undefined;
}

// ── Batch 3 純函式：持久群組（groupId）───────────────────────────────────────
// 指定 ids 設上新的 groupId（immutable）。不在 ids 中的物件保持不變。
function assignGroupId(objects, ids, gid) {
  const idSet = new Set(ids);
  return objects.map(o => idSet.has(o.id) ? { ...o, groupId: gid } : o);
}

// 指定 ids 清除 groupId（immutable）。不在 ids 中的物件保持不變。
function clearGroupId(objects, ids) {
  const idSet = new Set(ids);
  return objects.map(o => {
    if (!idSet.has(o.id)) return o;
    const next = { ...o };
    delete next.groupId;
    return next;
  });
}

// 將選取展開：若選取的物件屬於某群組，展開為所有群組成員 id（去重、依 objects 順序）。
function expandSelectionToGroups(objects, selectedIds) {
  const groupIds = new Set();
  selectedIds.forEach(id => {
    const o = objects.find(x => x.id === id);
    if (o && o.groupId) groupIds.add(o.groupId);
  });
  if (!groupIds.size) return selectedIds.slice();
  const expanded = new Set(selectedIds);
  objects.forEach(o => { if (o.groupId && groupIds.has(o.groupId)) expanded.add(o.id); });
  return objects.filter(o => expanded.has(o.id)).map(o => o.id);
}

// 回傳屬於同一 groupId 的所有物件 id。
function groupMembers(objects, gid) {
  return objects.filter(o => o.groupId === gid).map(o => o.id);
}

// 兩個 box（{x,y,w,h}）是否相交（marquee 命中測試用）。
function rectsIntersect(a, b) {
  return !(a.x > b.x + b.w || a.x + a.w < b.x || a.y > b.y + b.h || a.y + a.h < b.y);
}

// marquee（橡皮筋框）→ 命中的物件 id（bbox 與框相交者）。純函式。
function marqueeSelect(objects, mrect) {
  return objects.filter(o => rectsIntersect(geomBBox(o), mrect)).map(o => o.id);
}

// z-order：把 id 在 id 陣列中往前/後/頂/底重排（陣列尾＝最上層）。回傳新陣列。
function reorderIds(ids, id, op) {
  const i = ids.indexOf(id);
  if (i < 0) return ids.slice();
  const next = ids.slice();
  next.splice(i, 1);
  if (op === 'front') next.push(id);
  else if (op === 'back') next.unshift(id);
  else if (op === 'forward') next.splice(Math.min(i + 1, next.length), 0, id);
  else if (op === 'backward') next.splice(Math.max(i - 1, 0), 0, id);
  else next.splice(i, 0, id);
  return next;
}

// 多選 z-order：整組一起移動，保留它們彼此的相對順序。回傳新 id 陣列。
function reorderMany(ids, selectedIds, op) {
  const selSet = new Set(selectedIds);
  const sel = ids.filter(id => selSet.has(id)); // 依現有 z 順序保相對序
  if (!sel.length) return ids.slice();
  const rest = ids.filter(id => !selSet.has(id));
  if (op === 'front') return [...rest, ...sel];
  if (op === 'back') return [...sel, ...rest];
  if (op === 'forward') return shiftGroup(ids, selSet, +1);
  if (op === 'backward') return shiftGroup(ids, selSet, -1);
  return ids.slice();
}
// 把選取群組整體往 dir（+1 上 / -1 下）移一步，群組成員不互相穿越。
function shiftGroup(ids, selSet, dir) {
  const arr = ids.slice();
  if (dir > 0) {
    for (let i = arr.length - 2; i >= 0; i--) {
      if (selSet.has(arr[i]) && !selSet.has(arr[i + 1])) { const t = arr[i]; arr[i] = arr[i + 1]; arr[i + 1] = t; }
    }
  } else {
    for (let i = 1; i < arr.length; i++) {
      if (selSet.has(arr[i]) && !selSet.has(arr[i - 1])) { const t = arr[i]; arr[i] = arr[i - 1]; arr[i - 1] = t; }
    }
  }
  return arr;
}

// 顏色/筆粗套用（純）：依 tool/selectedIds 決定「只設預設」或「同時改選取的所有物件」。
// 回傳 { defaultStyle, objects, cmds }；eyedropper 與 picker 共用同一路徑。
function applyStylePatch({ tool, selectedIds, objects, defaultStyle }, patch) {
  const nextDefault = { ...defaultStyle, ...patch };
  // 有選取就套到選取物件（不限 select 工具）：剛建立的物件會 auto-select，
  // 此時按顏色/筆寬/字級應「即時換」到該物件，同時更新預設供下一個物件用。
  const sel = new Set(selectedIds || []);
  if (!sel.size) return { defaultStyle: nextDefault, objects, cmds: [] };
  const cmds = [];
  const nextObjects = objects.map(o => {
    if (!sel.has(o.id)) return o;
    const before = { style: { ...o.style } };
    const after = { style: { ...o.style, ...patch } };
    cmds.push({ type: 'update', id: o.id, before, after });
    return { ...o, ...after };
  });
  return { defaultStyle: nextDefault, objects: nextObjects, cmds };
}

// EyeDropper API 偵測（feature-detect；可注入 win 以利單測）。
function eyedropperSupported(win = (typeof window !== 'undefined' ? window : undefined)) {
  return !!win && typeof win.EyeDropper === 'function';
}

function reindexByIds(objects, ids) {
  const map = {};
  objects.forEach(o => { map[o.id] = o; });
  return ids.map(id => map[id]).filter(Boolean);
}

// ── undo/redo command（純：apply 正向、invert 反向；皆回傳新陣列）─────────────
// cmd 形狀：
//   { type:'create', obj }
//   { type:'delete', obj, index }
//   { type:'update', id, before, after }   // patch（{geom} / {style}）→ 涵蓋 move/resize/style
//   { type:'reorder', before:[ids], after:[ids] }
function applyCommand(objects, cmd) {
  if (cmd.type === 'create') return objects.concat(cmd.obj);
  if (cmd.type === 'delete') return objects.filter(o => o.id !== cmd.obj.id);
  if (cmd.type === 'update') return objects.map(o => (o.id === cmd.id ? { ...o, ...cmd.after } : o));
  if (cmd.type === 'reorder') return reindexByIds(objects, cmd.after);
  if (cmd.type === 'batch') return cmd.cmds.reduce((objs, c) => applyCommand(objs, c), objects);
  if (cmd.type === 'deleteMany') {
    const ids = new Set(cmd.items.map(it => it.obj.id));
    return objects.filter(o => !ids.has(o.id));
  }
  return objects;
}

function invertCommand(objects, cmd) {
  if (cmd.type === 'create') return objects.filter(o => o.id !== cmd.obj.id);
  if (cmd.type === 'delete') {
    const next = objects.slice();
    next.splice(Math.min(cmd.index, next.length), 0, cmd.obj);
    return next;
  }
  if (cmd.type === 'update') return objects.map(o => (o.id === cmd.id ? { ...o, ...cmd.before } : o));
  if (cmd.type === 'reorder') return reindexByIds(objects, cmd.before);
  if (cmd.type === 'batch') return cmd.cmds.slice().reverse().reduce((objs, c) => invertCommand(objs, c), objects);
  if (cmd.type === 'deleteMany') {
    const next = objects.slice();
    cmd.items.slice().sort((a, b) => a.index - b.index) // 由小到大插回 → 原索引正確
      .forEach(it => next.splice(Math.min(it.index, next.length), 0, it.obj));
    return next;
  }
  return objects;
}

// undo/redo 指標堆疊（純邏輯，無 DOM）：push 清空 redo；undo/redo 在兩堆間搬。
function makeUndoStack() {
  const undo = [], redo = [];
  return {
    push(cmd) { undo.push(cmd); redo.length = 0; },
    undo() { if (!undo.length) return null; const c = undo.pop(); redo.push(c); return c; },
    redo() { if (!redo.length) return null; const c = redo.pop(); undo.push(c); return c; },
    canUndo: () => undo.length > 0,
    canRedo: () => redo.length > 0,
  };
}

function normalizeStyle(style = {}) {
  const out = {
    color: style.color || DEFAULT_DRAW_STYLE.color,
    strokeWidth: style.strokeWidth ?? DEFAULT_DRAW_STYLE.strokeWidth,
    fill: style.fill || DEFAULT_DRAW_STYLE.fill,
    fontSize: style.fontSize || DEFAULT_DRAW_STYLE.fontSize, // 文字工具字體大小（px）
  };
  if (style.brushType) out.brushType = style.brushType; // 自由筆刷類型（pen/marker/highlighter）
  if (style.heads) out.heads = style.heads; // line/arrow 端點箭頭模式（none/end/start/both）
  return out;
}

let _idSeq = 0;
function nextDrawId() { return 'd' + (++_idSeq); }
function nextGroupId() { return 'g' + (++_idSeq); }

// 組裝一個 DrawObject（plan §4.2 子集：id/tool/geom/style[/text]）。
// z 由繪圖層在 commit 時依 DOM 順序戳上（stampZ），純函式不負責。
function makeDrawObject({ id, tool, geom, style, text, imageRef, endAnchors } = {}) {
  const obj = { id: id || nextDrawId(), tool, geom, style: normalizeStyle(style) };
  if (text != null) obj.text = text;
  if (imageRef != null) obj.imageRef = imageRef; // image 物件的 dataURL（P3）/ 本機路徑（P4）
  if (endAnchors != null) obj.endAnchors = endAnchors; // arrow/line 端點 element/object 硬鎖
  return obj;
}

// 精簡序列化（之後匯出給 AI 用）。z 若已戳上則一併輸出。
function serializeDrawObject(obj) {
  const out = { id: obj.id, tool: obj.tool, geom: obj.geom, style: obj.style };
  if (obj.text != null) out.text = obj.text;
  if (obj.label != null && obj.label !== '') out.label = obj.label; // 綁定標籤
  if (obj.anchor != null) out.anchor = obj.anchor;                  // elementFromPoint selector
  if (obj.imageRef != null) out.imageRef = obj.imageRef;            // 貼圖 dataURL/路徑
  if (obj.z != null) out.z = obj.z;
  if (obj.groupId != null) out.groupId = obj.groupId;
  if (obj.endAnchors != null) out.endAnchors = obj.endAnchors; // 端點硬鎖（有才帶）
  return out;
}

// ── 本機持久化純函式（dev 模式；可單測）──────────────────────────────────────
// 序列化 objects → plain doc 陣列（跳過 image：dataURL 輕易超出 localStorage 配額，
// 與 §4.6 vectors-only 哲學一致；code comment: images 不走本機持久化）。
function serializeObjectsForLocal(objects) {
  return objects.filter(o => o.tool !== 'image').map(serializeDrawObject);
}
// plain doc 陣列 → DrawObject[]（類似 rehydrateDrawing，供 initDrawLayer 初始載入）。
function hydrateObjectsFromLocal(docs) {
  if (!Array.isArray(docs)) return [];
  return docs.map(doc => {
    const obj = makeDrawObject({ id: doc.id, tool: doc.tool, geom: doc.geom, style: doc.style, text: doc.text });
    if (doc.label != null) obj.label = doc.label;
    if (doc.anchor != null) obj.anchor = doc.anchor;
    if (doc.endAnchors != null) obj.endAnchors = doc.endAnchors;
    if (doc.groupId != null) obj.groupId = doc.groupId;
    return obj;
  });
}

// 團隊模式 Firestore 文件序列化（純函式，可單測）。
// 與 serializeDrawObject 的關鍵差異：**故意不輸出 imageRef / PNG dataURL**
//（plan §4.6：PNG 永不進 Firestore；image 物件於 sync 層整顆跳過，這裡即使被呼叫也保證無 dataURL）。
// 只保留向量欄位：id / tool / geom / style（＋有意義時的 text / label / anchor / z）。
function drawingToDoc(obj) {
  const doc = { id: obj.id, tool: obj.tool, geom: obj.geom, style: obj.style };
  if (obj.text != null) doc.text = obj.text;                       // 文字工具內容
  if (obj.label != null && obj.label !== '') doc.label = obj.label; // 綁定標籤
  if (obj.anchor != null) doc.anchor = obj.anchor;                 // elementFromPoint selector
  if (obj.z != null) doc.z = obj.z;                                // z-order
  if (obj.groupId != null) doc.groupId = obj.groupId;              // 群組 id
  if (obj.endAnchors != null) doc.endAnchors = obj.endAnchors;     // 端點硬鎖（有才帶）
  return doc; // 注意：不含 imageRef / dataURL（PNG 永不進 Firestore）
}

// ── DOM helpers（draw 前綴避免 bundle 時與 index.js 同名 top-level 衝突）────────
function drawSvgEl(tag, attrs = {}) {
  const n = document.createElementNS(SVG_NS, tag);
  Object.entries(attrs).forEach(([k, v]) => n.setAttribute(k, String(v)));
  return n;
}
function drawHtmlEl(tag, cls) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  return n;
}

const DRAW_STYLES = `
/* width/height:100% 不可省：<svg> 是 replaced element，預設 intrinsic 300×150，
   只給 inset:0 不會撐滿 host → 超出 300px 的點會穿到底下的 app（pointerdown 收不到）。 */
#pc-draw { position: absolute; inset: 0; width: 100%; height: 100%; z-index: 220; pointer-events: none; }
#pc-draw.pc-draw-active { pointer-events: auto; cursor: crosshair; }
#pc-draw.pc-draw-select { cursor: default; }
.pc-draw-selection rect[data-handle] { cursor: nwse-resize; }
.pc-draw-toolbar {
  position: fixed; left: 50%; bottom: 20px; transform: translateX(-50%);
  z-index: 2147483600; display: flex; align-items: center; gap: 4px;
  background: #1e1e1e; padding: 6px; border-radius: 12px;
  box-shadow: 0 6px 24px rgba(0,0,0,.35); font-family: system-ui, -apple-system, sans-serif;
}
.pc-draw-tool {
  position: relative;
  width: 34px; height: 34px; border: none; border-radius: 8px; cursor: pointer;
  background: transparent; color: #e5e7eb; font-size: 16px; line-height: 1;
  display: flex; align-items: center; justify-content: center; transition: background .12s;
}
.pc-draw-tool:hover { background: #333; }
.pc-draw-tool.active { background: #0FA0A0; color: #fff; }
.pc-draw-tool svg { display: block; }
/* 常駐數字快捷鍵徽章（Excalidraw 風格，右下角、不擋點擊、不位移圖示） */
.pc-draw-kbd {
  position: absolute; right: 3px; bottom: 1px; pointer-events: none;
  font: 9px/1 system-ui, -apple-system, sans-serif; color: rgba(229,231,235,.55);
}
.pc-draw-tool.active .pc-draw-kbd { color: rgba(255,255,255,.7); }
.pc-draw-sep { width: 1px; height: 22px; background: #3a3a3a; margin: 0 2px; }
/* 顏色/線粗收進 popover，避免 pill 過長溢出 */
.pc-draw-menu { position: relative; display: flex; align-items: center; }
.pc-draw-cur-color { width: 18px; height: 18px; border-radius: 50%; border: 2px solid #555; display: block; }
.pc-draw-popover {
  position: absolute; bottom: calc(100% + 10px); left: 50%; transform: translateX(-50%);
  display: none; flex-wrap: wrap; gap: 8px; width: 152px; box-sizing: border-box;
  background: #1e1e1e; padding: 10px; border-radius: 10px; box-shadow: 0 6px 24px rgba(0,0,0,.4);
}
.pc-draw-popover-width { width: auto; flex-wrap: nowrap; }
.pc-draw-menu.open .pc-draw-popover { display: flex; }
.pc-draw-swatch {
  width: 22px; height: 22px; border-radius: 50%; padding: 0; cursor: pointer;
  border: 2px solid transparent;
}
.pc-draw-swatch.active { border-color: #fff; box-shadow: 0 0 0 1px #0FA0A0; }
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
.pc-draw-width:hover { background: #333; }
.pc-draw-width.active { background: #0FA0A0; }
.pc-draw-disabled { opacity: .35; cursor: not-allowed; }
.pc-draw-eyedropper { color: #e5e7eb; }
/* 右鍵 context menu */
.pc-draw-context {
  position: fixed; z-index: 2147483601; display: none; flex-direction: column;
  min-width: 132px; padding: 4px; background: #1e1e1e; border-radius: 8px;
  box-shadow: 0 6px 24px rgba(0,0,0,.4); font-family: system-ui, -apple-system, sans-serif;
}
.pc-draw-context.open { display: flex; }
.pc-draw-context-item {
  display: flex; align-items: center; gap: 8px; width: 100%;
  padding: 6px 8px; border: none; border-radius: 6px; cursor: pointer;
  background: transparent; color: #e5e7eb; font-size: 13px; text-align: left;
}
.pc-draw-context-item:hover { background: #0FA0A0; color: #fff; }
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
  display: none; border: none; cursor: pointer; background: #0FA0A0; color: #fff;
  padding: 14px 7px; border-radius: 10px 0 0 10px; box-shadow: -2px 0 12px rgba(0,0,0,.2);
  writing-mode: vertical-rl; font: 700 12px/1 system-ui, -apple-system, sans-serif; letter-spacing: 2px;
  transition: background .15s;
}
.pc-draw-rec-tab:hover { background: #0d8f8f; }
.pc-draw-rec-tab.show { display: block; }
.pc-draw-rec-drawer {
  position: fixed; top: 0; right: 0; bottom: 0; z-index: 2147483602;
  width: 300px; max-width: 90vw; background: #fff; border-left: 1px solid #e2e8f0;
  display: flex; flex-direction: column; box-shadow: -2px 0 16px rgba(0,0,0,.12);
  transform: translateX(100%); transition: transform .22s ease;
  font-family: system-ui, -apple-system, sans-serif;
}
.pc-draw-rec-drawer.open { transform: translateX(0); }
.pc-draw-rec-hd { display: flex; align-items: center; gap: 8px; padding: 12px 14px; border-bottom: 1px solid #eef2f6; }
.pc-draw-rec-hd-title { color: #0FA0A0; font-weight: 700; font-size: 13px; }
.pc-draw-rec-count { background: rgba(15,160,160,.12); color: #0d8f8f; border-radius: 9px;
  font-size: 10px; padding: 1px 7px; line-height: 16px; }
.pc-draw-rec-close { margin-left: auto; border: none; background: none; cursor: pointer;
  color: #94a3b8; font-size: 18px; line-height: 1; padding: 2px 4px; }
.pc-draw-rec-close:hover { color: #475569; }
.pc-draw-rec-list { padding: 10px; overflow-y: auto; flex: 1; background: #f8fafc; }
.pc-draw-rec-row {
  display: flex; align-items: center; gap: 9px; width: 100%; text-align: left;
  background: #fff; border: 1px solid #eef2f6; border-radius: 7px; padding: 8px 10px;
  margin-bottom: 8px; cursor: pointer; box-shadow: 0 1px 2px rgba(0,0,0,.04);
}
.pc-draw-rec-row:last-child { margin-bottom: 0; }
.pc-draw-rec-row:hover { border-color: #0FA0A0; }
.pc-draw-rec-row.selected { border-color: #0FA0A0; background: rgba(15,160,160,.08); box-shadow: 0 0 0 1px #0FA0A0; }
.pc-draw-rec-icon { flex: none; width: 22px; height: 22px; display: flex; align-items: center; justify-content: center; color: #475569; }
.pc-draw-rec-icon svg { display: block; }
.pc-draw-rec-swatch { flex: none; width: 12px; height: 12px; border-radius: 50%; border: 1px solid rgba(0,0,0,.15); }
.pc-draw-rec-body { min-width: 0; flex: 1; }
.pc-draw-rec-text { color: #1e293b; font-size: 12px; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.pc-draw-rec-sel { margin-top: 2px; color: #0d8f8f; font: 10px/1.4 ui-monospace, SFMono-Regular, Menlo, monospace;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.pc-draw-rec-empty { color: #94a3b8; font-size: 12px; text-align: center; padding: 28px 12px; line-height: 1.6; }
/* ── 抽屜 footer：「送給 AI（N）」主要送出按鈕（teal 主色）── */
.pc-draw-rec-footer { padding: 10px 14px; border-top: 1px solid #eef2f6; background: #fff; }
.pc-draw-rec-send-btn {
  width: 100%; padding: 8px; border: none; border-radius: 7px; cursor: pointer;
  background: #0FA0A0; color: #fff; font: 600 13px/1.4 system-ui, -apple-system, sans-serif;
  transition: background .12s, opacity .12s;
}
.pc-draw-rec-send-btn:disabled { opacity: .5; cursor: not-allowed; }
.pc-draw-rec-send-btn:not(:disabled):hover { background: #0d8f8f; }
`;

function injectDrawStyles() {
  if (document.getElementById('pc-draw-styles')) return;
  const s = document.createElement('style');
  s.id = 'pc-draw-styles';
  s.textContent = DRAW_STYLES;
  document.head.appendChild(s);
}

function resolveTarget(target) {
  if (!target) return document.body;
  if (typeof target === 'string') return document.querySelector(target) || document.body;
  return target;
}

// ── init ────────────────────────────────────────────────────────────────────
function initDrawLayer(target, opts = {}) {
  injectDrawStyles();
  const host = resolveTarget(target);
  if (getComputedStyle(host).position === 'static') host.style.position = 'relative';

  const svg = drawSvgEl('svg', { id: 'pc-draw' });
  buildArrowhead(svg);
  host.appendChild(svg);

  const state = {
    mode: opts.mode && DRAW_MODES.includes(opts.mode) ? opts.mode : 'off',
    tool: 'select',
    objects: [],      // DrawObject[]（committed，陣列順序＝z-order）
    draft: null,      // 進行中的 DrawObject（尚未送出）
    selectedIds: [],  // 多選：目前選取的物件 id 集合（陣列保序）
    marquee: null,    // 進行中的橡皮筋框 {x,y,w,h}（% 座標）
    brushType: 'pen', // 自由筆刷類型 pen/marker/highlighter
    exportEndpoint: opts.exportEndpoint || null, // 「送給 AI」POST 目標（無則只回 payload）
    recordOpen: false, // P6 側邊標注紀錄抽屜開關（預設關 → 不打擾一般使用）
  };
  const history = makeUndoStack();
  // ── P7 團隊持久（選用）：把 opts.persist 解析成 drawings store（ready store 或 {fb,db,projectId}）。
  // 失敗或未提供 → drawStore = null → 一律走純本地（dev 模式 0 Firebase）。
  const drawStore = resolveDrawStore(opts.persist);
  // ── dev 模式本機持久化（無 drawStore + persistLocal !== false 時啟用）──────────
  // 讓 dev 環境重整後仍保留向量標注。image 不存（dataURL 佔空間太大，§4.6 哲學）。
  const localKey = 'pc-draw-local:' + (opts.projectId || 'default');
  const _storage = opts._storage || (typeof localStorage !== 'undefined' ? localStorage : null);
  const useLocalPersist = !drawStore && opts.persistLocal !== false;
  function persistLocalSave() {
    if (!useLocalPersist || !_storage) return;
    try { _storage.setItem(localKey, JSON.stringify(serializeObjectsForLocal(state.objects))); }
    catch (_) { /* quota 溢位 / 無 localStorage → 不影響繪圖 */ }
  }
  let unsubDraw = null;   // remote 訂閱解除函式（destroy 時呼叫）
  let drag = null;    // 繪製中：{ tool, rect, start, points }
  const actions = { setMode, setTool, setBrush, setColor, setStrokeWidth, setFontSize, setHeads, act, eyedropper: openEyedropper, closeContext: closeContextMenu, send: () => sendToAgent(), openRecord: () => { state.recordOpen = true; renderRecordPanel(); } };
  const toolbar = buildToolbar(state, actions);
  document.body.appendChild(toolbar);
  const contextMenu = buildContextMenu(actions);
  document.body.appendChild(contextMenu);

  // 選取集合小工具
  const isSelected = id => state.selectedIds.includes(id);
  const selectOnly = id => { state.selectedIds = id ? [id] : []; };
  const toggleSelect = id => {
    state.selectedIds = isSelected(id) ? state.selectedIds.filter(x => x !== id) : [...state.selectedIds, id];
  };
  const selectedObjects = () => state.selectedIds.map(id => findById(state.objects, id)).filter(Boolean);

  // ── P6 側邊標注紀錄面板（右緣 tab + 抽屜）─────────────────────────────────────────
  const recordTab = buildRecordTab(() => { state.recordOpen = !state.recordOpen; renderRecordPanel(); });
  const recordDrawer = buildRecordDrawer(() => { state.recordOpen = false; renderRecordPanel(); });
  const drawerSendBtn = recordDrawer.querySelector('.pc-draw-rec-send-btn');
  if (drawerSendBtn) drawerSendBtn.onclick = () => handleDrawerSend();
  document.body.appendChild(recordDrawer);
  document.body.appendChild(recordTab);

  // 依目前 objects/selectedIds 重畫面板（render() 每次變動都會喚起 → 即時更新）。
  function renderRecordPanel() {
    recordTab.classList.toggle('show', !state.recordOpen);
    recordDrawer.classList.toggle('open', state.recordOpen);
    const rows = annotationRows(state.objects);
    const count = recordDrawer.querySelector('.pc-draw-rec-count');
    if (count) count.textContent = String(rows.length);
    // footer 送出鈕：畫布清空時強制重設（否則 in-flight 中若 clear 仍殘留舊狀態）
    const sendBtn = recordDrawer.querySelector('.pc-draw-rec-send-btn');
    if (sendBtn) {
      if (!rows.length) delete sendBtn.dataset.inflight; // clear → 強制重設
      if (!sendBtn.dataset.inflight) {
        sendBtn.textContent = `送給 AI（${rows.length}）`;
        sendBtn.disabled = rows.length === 0;
      }
    }
    const list = recordDrawer.querySelector('.pc-draw-rec-list');
    if (!list) return;
    list.innerHTML = '';
    if (!rows.length) {
      const empty = drawHtmlEl('div', 'pc-draw-rec-empty');
      empty.textContent = '尚無標注';
      list.appendChild(empty);
      return;
    }
    list.appendChild(recordPreviewEl()); // 置頂：送給 AI 的畫面截圖預覽
    rows.forEach(row => list.appendChild(recordRowEl(row, isSelected(row.id), onRecordRowClick)));
    refreshRecordPreview();
  }
  // 標注紀錄頂部「送出畫面」縮圖：顯示 capturePng() 的結果（=送給 AI 的 PNG）。
  let _previewSig = null, _previewUrl = null, _previewTimer = null;
  function recordPreviewEl() {
    const img = drawHtmlEl('img', 'pc-draw-rec-preview');
    img.alt = '送給 AI 的畫面預覽';
    img.style.cssText = 'display:block;width:100%;min-height:48px;border:1px solid #e1e4e8;border-radius:8px;margin:0 0 10px;background:#fafbfc;';
    if (_previewUrl) img.src = _previewUrl;
    return img;
  }
  function refreshRecordPreview() {
    if (!state.recordOpen) return;
    const sig = state.objects.length + '|' + history.length; // 內容變更（增刪/移動/換色）即重拍
    if (sig === _previewSig) return;
    _previewSig = sig;
    if (_previewTimer) clearTimeout(_previewTimer);
    _previewTimer = setTimeout(() => {
      capturePng().then(url => {
        if (!url) return;
        _previewUrl = url;
        const img = recordDrawer.querySelector('.pc-draw-rec-preview');
        if (img) img.src = url;
      });
    }, 180); // debounce：連續操作只在停手後拍一次
  }
  // 點一筆 row → 選取該物件、若在畫面外則捲入視野（沿用 spec-overlay 的 scrollIntoView）。
  function onRecordRowClick(id) {
    selectOnly(id);
    render();
    scrollObjectIntoView(id);
  }
  function scrollObjectIntoView(id) {
    const node = svg.querySelector('[data-id="' + id + '"]');
    if (!node || typeof node.getBoundingClientRect !== 'function') return;
    const r = node.getBoundingClientRect();
    const offscreen = r.bottom < 0 || r.top > window.innerHeight || r.right < 0 || r.left > window.innerWidth;
    if (offscreen && node.scrollIntoView) node.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }

  function applyMode() {
    svg.classList.toggle('pc-draw-active', state.mode === 'draw');
    svg.classList.toggle('pc-draw-select', state.mode === 'draw' && state.tool === 'select');
    syncToolbar(toolbar, state, history);
  }
  function setMode(mode) {
    if (!DRAW_MODES.includes(mode)) return;
    state.mode = mode;
    applyMode();
  }
  function setTool(tool) {
    if (!DRAW_TOOLS.includes(tool)) return;
    state.tool = tool;
    if (tool !== 'select') state.selectedIds = []; // 切到繪圖工具 → 取消選取（避免新物件被回頭改色）
    setMode('draw'); // 任何工具（含 select）都進 draw → SVG 吃事件
    render();
  }
  function setBrush(type) {
    if (!DRAW_BRUSHES.includes(type)) return;
    state.brushType = type;
    setTool('pencil'); // 選筆刷即切到自由筆
  }

  function stampZ() { state.objects.forEach((o, i) => { o.z = i; }); }

  // ── Batch 4：端點 anchor 解析（element/object 硬鎖）+ 吸附 + live reposition ──────
  // selector → 元件 rect 換算成 host(svg) % 空間（與 geom 同基準）。找不到 → null（fallback geom）。
  function getRectPct(selector) {
    if (!selector) return null;
    let el = null;
    try { el = document.querySelector(selector); } catch (_) { return null; }
    if (!el || typeof el.getBoundingClientRect !== 'function') return null;
    const er = el.getBoundingClientRect();
    const hr = svg.getBoundingClientRect();
    return {
      x: pxToPct(er.left - hr.left, hr.width), y: pxToPct(er.top - hr.top, hr.height),
      w: pxToPct(er.width, hr.width), h: pxToPct(er.height, hr.height),
    };
  }
  // 綁定 resolver：供 render/geomBBox/labelAnchor 取得 arrow/line 解析後端點。
  const resolveO = o => resolveEndpoints(o, getRectPct, state.objects);
  // arrow/line 有 anchor 時 → 回傳「端點已解析」的渲染視圖物件；其餘原樣。
  function viewObject(o) {
    if ((o.tool === 'arrow' || o.tool === 'line') && o.endAnchors) {
      const e = resolveO(o);
      return { ...o, geom: { ...o.geom, from: e.from, to: e.to } };
    }
    return o;
  }

  // 拖端點吸附中的高亮目標（render 時畫 dashed teal rect）。{selector} 或 {objId}；放開/離開 → null。
  let snapHighlight = null;
  function renderSnapHighlight() {
    if (!snapHighlight) return;
    let r = null;
    if (snapHighlight.selector) r = getRectPct(snapHighlight.selector);            // DOM 元件
    else if (snapHighlight.objId != null) {                                        // 自繪形狀
      const t = findById(state.objects, snapHighlight.objId);
      if (t) r = geomBBox(t, resolveO);
    }
    if (!r) return;
    const rect = { width: svg.clientWidth || host.clientWidth, height: svg.clientHeight || host.clientHeight };
    const b = toPxBox(r, rect);
    svg.appendChild(drawSvgEl('rect', {
      class: 'pc-draw-snap-hl', x: b.x, y: b.y, width: b.w, height: b.h, fill: 'none',
      stroke: '#0FA0A0', 'stroke-width': 2, 'stroke-dasharray': '5 4', 'pointer-events': 'none',
    }));
  }

  // ── live reposition：有 el anchor 時監聽 scroll/resize/ResizeObserver + rAF 比對 rect ──
  let liveOn = false, liveRaf = null, liveRO = null;
  const liveRects = new Map();
  function anchoredSelectors() {
    const sels = new Set();
    state.objects.forEach(o => {
      const ea = o.endAnchors; if (!ea) return;
      ['from', 'to'].forEach(w => { if (ea[w] && ea[w].kind === 'el') sels.add(ea[w].selector); });
    });
    return sels;
  }
  function liveTick() {
    if (!liveOn) return;
    let changed = false;
    anchoredSelectors().forEach(sel => {
      const r = getRectPct(sel);
      const sig = r ? `${r.x},${r.y},${r.w},${r.h}` : 'null';
      if (liveRects.get(sel) !== sig) { liveRects.set(sel, sig); changed = true; }
    });
    if (changed) render();
    liveRaf = (liveOn && typeof requestAnimationFrame === 'function') ? requestAnimationFrame(liveTick) : null; // render→syncLiveLoop 可能已 stopLive，勿排程鬼魂 rAF
  }
  function hasElAnchor(o) {
    const ea = o.endAnchors; if (!ea) return false;
    return (ea.from && ea.from.kind === 'el') || (ea.to && ea.to.kind === 'el');
  }
  function syncLiveLoop() {
    // 只有 el anchor 需要 DOM 監聽（scroll/resize）；obj 形狀錨點隨 render 自然跟隨，免 rAF。
    const need = state.objects.some(hasElAnchor);
    if (need && !liveOn) startLive();
    else if (!need && liveOn) stopLive();
  }
  function startLive() {
    liveOn = true;
    window.addEventListener('scroll', render, true); // capture：抓內層捲動容器
    if (typeof ResizeObserver === 'function') { liveRO = new ResizeObserver(() => render()); liveRO.observe(host); }
    if (typeof requestAnimationFrame === 'function') liveRaf = requestAnimationFrame(liveTick);
  }
  function stopLive() {
    liveOn = false;
    window.removeEventListener('scroll', render, true);
    if (liveRO) { liveRO.disconnect(); liveRO = null; }
    if (liveRaf && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(liveRaf);
    liveRaf = null; liveRects.clear();
  }

  function render() {
    stampZ();
    while (svg.childNodes.length > 1) svg.removeChild(svg.lastChild); // 保留 <defs>
    const rect = { width: svg.clientWidth || host.clientWidth, height: svg.clientHeight || host.clientHeight };
    [...state.objects, state.draft].forEach(o => {
      if (!o) return;
      const vo = viewObject(o); // arrow/line anchor → 解析後端點渲染
      const node = renderObject(vo, rect, svg);
      node.setAttribute('data-id', o.id);
      // 物件不吃指標事件 → 所有點擊都落在穩定的 <svg>（hit-test 用幾何）。
      // 關鍵：避免點擊細線時 render() 重建 <line> 導致瀏覽器 dblclick 因 target 改變而不觸發。
      node.setAttribute('pointer-events', 'none');
      svg.appendChild(node);
      const lbl = renderLabel(vo, rect);
      if (lbl) { svg.appendChild(lbl); sizeLabelBg(lbl); } // 綁定標籤；append 後量 text bbox 收緊白底
    });
    renderSelection(rect);
    renderMarquee(rect);
    renderSnapHighlight(); // Batch 4：拖端點吸附中的 dashed teal 高亮
    syncToolbar(toolbar, state, history);
    renderRecordPanel(); // P6：標注紀錄面板隨 objects/selection 即時更新
    syncLiveLoop();       // Batch 4：有 anchor 才啟動 live reposition 監聽
  }

  function renderSelection(rect) {
    const objs = selectedObjects();
    if (!objs.length) return;
    const g = drawSvgEl('g', { class: 'pc-draw-selection' });
    objs.forEach(o => {
      const box = toPxBox(geomBBox(o, resolveO), rect);
      g.appendChild(drawSvgEl('rect', { x: box.x, y: box.y, width: box.w, height: box.h, fill: 'none', stroke: '#0FA0A0', 'stroke-width': 1, 'stroke-dasharray': '4 3', 'pointer-events': 'none' }));
    });
    if (objs.length === 1) { // handle 只在單選時出現
      const o = objs[0];
      if (o.tool === 'arrow' || o.tool === 'line') {
        // 箭頭/線段：兩個圓端點 handle（取代 bbox 四角）；用解析後端點（anchor live）
        const ends = resolveO(o);
        ['from', 'to'].forEach(which => {
          const cx = pctToPx(ends[which].x, rect.width);
          const cy = pctToPx(ends[which].y, rect.height);
          g.appendChild(drawSvgEl('circle', { cx, cy, r: 4, fill: '#fff', stroke: '#0FA0A0', 'stroke-width': 1, 'data-endpoint': which }));
        });
      } else {
        // 其餘工具：4 角縮放 handle（原行為不變）
        const box = toPxBox(geomBBox(o), rect);
        ['nw', 'ne', 'se', 'sw'].forEach(name => {
          const c = boxCorner(box, name);
          g.appendChild(drawSvgEl('rect', { x: c.x - 4, y: c.y - 4, width: 8, height: 8, fill: '#fff', stroke: '#0FA0A0', 'stroke-width': 1, 'data-handle': name }));
        });
      }
    }
    svg.appendChild(g);
  }
  function renderMarquee(rect) {
    if (!state.marquee) return;
    const box = toPxBox(state.marquee, rect);
    svg.appendChild(drawSvgEl('rect', { class: 'pc-draw-marquee', x: box.x, y: box.y, width: box.w, height: box.h, fill: 'rgba(15,160,160,.08)', stroke: '#0FA0A0', 'stroke-width': 1, 'stroke-dasharray': '4 3', 'pointer-events': 'none' }));
  }

  // ── command 執行（apply＋push）/ undo / redo ─────────────────────────────────
  function runCommand(cmd) {
    state.objects = applyCommand(state.objects, cmd);
    history.push(cmd);
    if (cmd.type === 'create') state.selectedIds = [cmd.obj.id];
    render();
    syncCommand(cmd); // P7：團隊模式才會真的寫 Firestore（drawStore 為 null 時 no-op）
    persistLocalSave(); // dev 模式本機持久化
  }
  // 物件已即時改好（拖曳預覽），只補登歷史（不重複 apply）。
  function pushHistory(cmd) { history.push(cmd); render(); syncCommand(cmd); persistLocalSave(); }

  // ── P7 團隊持久：把本地 command 反映到 Firestore（向量 only）。──────────────────
  // 持久化失敗一律吞掉 → 本地永遠是 live session 的真相，不因網路/權限問題壞掉繪圖。
  function syncCommand(cmd) {
    if (!drawStore || !cmd) return;
    try {
      if (cmd.type === 'create') syncSaveObj(cmd.obj);
      else if (cmd.type === 'update') syncSaveById(cmd.id);
      else if (cmd.type === 'reorder') (cmd.after || []).forEach(syncSaveById); // z 變更 → 重存
      else if (cmd.type === 'deleteMany') (cmd.items || []).forEach(it => syncRemoveObj(it.obj));
      else if (cmd.type === 'batch') (cmd.cmds || []).forEach(syncCommand);
    } catch (_) { /* 持久化失敗不影響本地繪圖 */ }
  }
  function syncSaveObj(obj) {
    if (!drawStore || !obj || obj.tool === 'image') return; // 跳過貼圖：PNG/dataURL 不進 Firestore（plan §4.6）
    try { Promise.resolve(drawStore.save(drawingToDoc(obj))).catch(() => {}); } catch (_) { /* ignore */ }
  }
  function syncSaveById(id) { const o = findById(state.objects, id); if (o) syncSaveObj(o); }
  function syncRemoveObj(obj) {
    if (!drawStore || !obj || obj.tool === 'image') return; // image 從未存過 → 不需刪
    try { Promise.resolve(drawStore.remove(obj.id)).catch(() => {}); } catch (_) { /* ignore */ }
  }

  // remote 訂閱：teammate 的向量物件即時併入（只「新增」缺的 id，de-dupe，不覆蓋本地進行中物件）。
  function startSync() {
    if (!drawStore) return;
    try { unsubDraw = drawStore.subscribe(onRemoteDrawings, () => { /* 訂閱錯誤 → 維持本地 */ }); }
    catch (_) { unsubDraw = null; }
  }
  function onRemoteDrawings(remoteDocs) {
    if (!Array.isArray(remoteDocs) || !remoteDocs.length) return;
    const localIds = new Set(state.objects.map(o => o.id));
    let changed = false;
    remoteDocs.forEach(doc => {
      if (!doc || doc.id == null || doc.tool === 'image') return;
      if (localIds.has(doc.id)) return; // 已存在（含自己剛存的 echo）→ de-dupe、不 clobber 本地
      state.objects.push(rehydrateDrawing(doc));
      changed = true;
    });
    if (changed) render();
  }
  // Firestore doc（含 updatedAt 等 metadata）→ 乾淨 DrawObject（丟掉非向量欄位）。
  function rehydrateDrawing(doc) {
    const obj = makeDrawObject({ id: doc.id, tool: doc.tool, geom: doc.geom, style: doc.style, text: doc.text });
    if (doc.label != null) obj.label = doc.label;
    if (doc.anchor != null) obj.anchor = doc.anchor;
    if (doc.groupId != null) obj.groupId = doc.groupId;
    if (doc.endAnchors != null) obj.endAnchors = doc.endAnchors;
    return obj;
  }
  function commitChange(id, before, after) { pushHistory({ type: 'update', id, before, after }); }
  function doUndo() {
    const cmd = history.undo();
    if (!cmd) return;
    state.objects = invertCommand(state.objects, cmd);
    ensureSelectionValid();
    render();
    persistLocalSave();
  }
  function doRedo() {
    const cmd = history.redo();
    if (!cmd) return;
    state.objects = applyCommand(state.objects, cmd);
    ensureSelectionValid();
    render();
    persistLocalSave();
  }
  function ensureSelectionValid() {
    state.selectedIds = state.selectedIds.filter(id => findById(state.objects, id));
  }

  // ── Batch 3：群組 bind / ungroup ──────────────────────────────────────────────
  function doGroupSelected() {
    if (state.selectedIds.length < 2) return;
    const gid = nextGroupId();
    const cmds = state.selectedIds.map(id => {
      const o = findById(state.objects, id);
      return { type: 'update', id, before: { groupId: o ? o.groupId : undefined }, after: { groupId: gid } };
    });
    state.objects = assignGroupId(state.objects, state.selectedIds, gid);
    pushHistory(cmds.length === 1 ? cmds[0] : { type: 'batch', cmds });
  }
  function doUngroupSelected() {
    const gids = new Set();
    state.selectedIds.forEach(id => {
      const o = findById(state.objects, id);
      if (o && o.groupId) gids.add(o.groupId); // 解散整組（含未選到的成員），避免落單成 group-of-one
    });
    if (!gids.size) return;
    const toUngroup = state.objects.filter(o => o.groupId && gids.has(o.groupId)).map(o => o.id);
    const cmds = toUngroup.map(id => {
      const o = findById(state.objects, id);
      return { type: 'update', id, before: { groupId: o.groupId }, after: { groupId: undefined } };
    });
    state.objects = clearGroupId(state.objects, toUngroup);
    pushHistory(cmds.length === 1 ? cmds[0] : { type: 'batch', cmds });
  }

  // ── z-order / 刪除 / style（皆作用於整個選取集合）──────────────────────────────
  function zorder(op) {
    if (!state.selectedIds.length) return;
    const before = state.objects.map(o => o.id);
    const after = reorderMany(before, state.selectedIds, op);
    runCommand({ type: 'reorder', before, after });
  }
  function deleteSelected() {
    if (!state.selectedIds.length) return;
    const items = state.objects
      .map((o, i) => ({ obj: o, index: i }))
      .filter(it => isSelected(it.obj.id)); // 已依 index 由小到大
    if (!items.length) return;
    state.selectedIds = [];
    runCommand({ type: 'deleteMany', items });
  }
  // Excalidraw 風格：繪圖工具啟用時 picker 只改「下一個新物件」的預設、不動選取；
  // select 工具 + 有選取時才回頭改「所有選取物件」的樣式（同時更新預設）。
  function setStyle(patch) {
    const res = applyStylePatch({ tool: state.tool, selectedIds: state.selectedIds, objects: state.objects, defaultStyle: DEFAULT_DRAW_STYLE }, patch);
    Object.assign(DEFAULT_DRAW_STYLE, res.defaultStyle);
    state.objects = res.objects;
    if (!res.cmds.length) { render(); return; }
    pushHistory(res.cmds.length === 1 ? res.cmds[0] : { type: 'batch', cmds: res.cmds });
  }
  function setColor(c) { setStyle({ color: c }); }
  function setStrokeWidth(w) { setStyle({ strokeWidth: w }); }
  function setFontSize(px) { setStyle({ fontSize: px }); }
  function setHeads(mode) { setStyle({ heads: mode }); } // line/arrow 端點箭頭 none/end/start/both

  // 吸管：用瀏覽器 EyeDropper API 取樣 → 走 setColor 同一語意。
  async function openEyedropper() {
    if (!eyedropperSupported(window)) return;
    try {
      const res = await new window.EyeDropper().open();
      if (res && res.sRGBHex) setColor(res.sRGBHex);
    } catch (_) { /* 使用者按 Esc 取消 → 忽略 */ }
  }

  // toolbar / 右鍵選單 動作分派（z-order / 刪除 / undo-redo）。
  function act(action) {
    if (action === 'delete') return deleteSelected();
    if (action === 'undo') return doUndo();
    if (action === 'redo') return doRedo();
    return zorder(action); // front / back / forward / backward
  }

  // ── pointer：select 模式（選取 / 多選 / marquee / 移動 / 縮放）──────────────────
  function onSelectDown(e) {
    const rect = svg.getBoundingClientRect();
    // 端點拖曳（arrow/line）：優先於 bbox handle 分支
    const endpoint = e.target?.dataset?.endpoint;
    if (endpoint && state.selectedIds.length === 1) { startEndpointDrag(e, endpoint, rect); return; }
    const handle = e.target && e.target.dataset ? e.target.dataset.handle : null;
    if (handle && state.selectedIds.length === 1) { startResize(e, handle, rect); return; }
    const p = clientToPct(e.clientX, e.clientY, rect);
    const hit = hitTest(p);
    if (!hit) { startMarquee(rect, p, e.shiftKey); render(); return; } // 空白起拖 → 橡皮筋框
    if (e.shiftKey) { toggleSelect(hit.id); render(); return; }        // Shift+click → 加/減選
    if (!isSelected(hit.id)) {                                         // 點未選物件 → 展開群組後選
      state.selectedIds = expandSelectionToGroups(state.objects, [hit.id]);
    }
    render();
    startMove(rect, p);                                               // 拖曳 → 整個選取一起移動
  }
  function hitTest(p) {
    for (let i = state.objects.length - 1; i >= 0; i--) {
      const b = geomBBox(state.objects[i], resolveO);
      const pad = 1.5;
      if (p.x >= b.x - pad && p.x <= b.x + b.w + pad && p.y >= b.y - pad && p.y <= b.y + b.h + pad)
        return state.objects[i];
    }
    return null;
  }
  function startMarquee(rect, startP, additive) {
    const base = additive ? state.selectedIds.slice() : [];
    state.selectedIds = base.slice(); // 起手即套用：純 click 空白（無拖移）也會取消選取
    state.marquee = { x: startP.x, y: startP.y, w: 0, h: 0 };
    const onMv = ev => {
      const p = clientToPct(ev.clientX, ev.clientY, rect);
      state.marquee = rectFromPoints(startP, p);
      const hits = marqueeSelect(state.objects, state.marquee);
      state.selectedIds = [...new Set([...base, ...hits])];
      render();
    };
    const onUp = () => {
      window.removeEventListener('pointermove', onMv);
      window.removeEventListener('pointerup', onUp);
      state.marquee = null;
      render();
    };
    window.addEventListener('pointermove', onMv);
    window.addEventListener('pointerup', onUp);
  }
  function startMove(rect, startP) {
    const objs = selectedObjects();
    if (!objs.length) return;
    const before = new Map(objs.map(o => [o.id, o.geom]));
    let moved = false;
    const onMv = ev => {
      const p = clientToPct(ev.clientX, ev.clientY, rect);
      const dx = p.x - startP.x, dy = p.y - startP.y;
      objs.forEach(o => { o.geom = translateGeom({ tool: o.tool, geom: before.get(o.id) }, dx, dy); });
      moved = true;
      render();
    };
    const onUp = () => {
      window.removeEventListener('pointermove', onMv);
      window.removeEventListener('pointerup', onUp);
      if (!moved) return;
      const cmds = objs.map(o => ({ type: 'update', id: o.id, before: { geom: before.get(o.id) }, after: { geom: o.geom } }));
      pushHistory(cmds.length === 1 ? cmds[0] : { type: 'batch', cmds });
    };
    window.addEventListener('pointermove', onMv);
    window.addEventListener('pointerup', onUp);
  }
  function startResize(e, handle, rect) {
    const o = selectedObjects()[0];
    if (!o) return;
    const before = o.geom;
    const oldBox = geomBBox(o);
    let resized = false;
    const onMv = ev => {
      const p = clientToPct(ev.clientX, ev.clientY, rect);
      const newBox = resizeBBox(oldBox, handle, p);
      o.geom = remapGeom({ tool: o.tool, geom: before }, oldBox, newBox);
      resized = true;
      render();
    };
    const onUp = () => {
      window.removeEventListener('pointermove', onMv);
      window.removeEventListener('pointerup', onUp);
      if (resized) commitChange(o.id, { geom: before }, { geom: o.geom });
    };
    window.addEventListener('pointermove', onMv);
    window.addEventListener('pointerup', onUp);
  }

  // 拖曳端點 handle → 重新指向端點（arrow/line 專用）。仿 startResize，加吸附 + anchor + 高亮。
  function startEndpointDrag(e, which, rect) {
    const o = selectedObjects()[0];
    if (!o) return;
    const before = { geom: o.geom, endAnchors: o.endAnchors };
    let moved = false, pendingAnchor;
    const onMv = ev => {
      const p = clientToPct(ev.clientX, ev.clientY, rect);
      const snap = computeEndpointSnap(p, o.id, ev.clientX, ev.clientY);
      o.geom = setEndpoint(before.geom, which, snap ? snap.point : p);
      pendingAnchor = snap ? snap.anchor : undefined;
      o.endAnchors = mergeEndAnchor(before.endAnchors, which, pendingAnchor); // 拖曳中即時反映：避免已 anchored 端點被舊 anchor 鎖住不跟手
      snapHighlight = snap ? snap.highlight : null; // 吸到元件/形狀 → 高亮其 rect
      moved = true;
      render();
    };
    const onUp = () => {
      window.removeEventListener('pointermove', onMv);
      window.removeEventListener('pointerup', onUp);
      snapHighlight = null;
      if (moved) commitEndpoint(o, which, before, pendingAnchor);
      else render(); // 清掉高亮
    };
    window.addEventListener('pointermove', onMv);
    window.addEventListener('pointerup', onUp);
  }
  // 蒐集候選（游標下元件的 8 錨點 + 最近邊 + 其他物件端點）→ 閾值內最近吸附點 + 對應 anchor。
  function computeEndpointSnap(p, draggedId, clientX, clientY) {
    // 自繪物件（線端點 / 形狀錨點）優先：刻意畫的標注目標應贏過背景 DOM（DOM 最近邊永遠貼游標會蓋掉形狀）。
    const objHit = nearestSnap(p, objectSnapPoints(state.objects, draggedId), SNAP_THRESHOLD_PCT);
    if (objHit) return snapResult(objHit, null);
    const selector = elSnapSelector(elementUnderPoint(clientX, clientY));
    const elRect = selector ? getRectPct(selector) : null;
    if (!elRect) return null;
    const cands = rectAnchorPoints(elRect).map(pt => ({ ...pt, selector }));
    cands.push({ ...nearestPointOnRect(p, elRect), selector, ref: 'edge' }); // DOM 才有最近邊吸附
    const elHit = nearestSnap(p, cands, SNAP_THRESHOLD_PCT);
    return elHit ? snapResult(elHit, elRect) : null;
  }
  function snapResult(hit, elRect) {
    return { point: hit.point, anchor: snapToAnchor(hit.cand, elRect), highlight: snapHighlightOf(hit.cand) };
  }
  // 候選 → 高亮目標：el 候選 → {selector}；obj 候選 → {objId}。
  function snapHighlightOf(cand) {
    if (cand.selector) return { selector: cand.selector };
    if (cand.objId != null) return { objId: cand.objId };
    return null;
  }
  // 候選 → anchor：obj 線端點 → which；obj 形狀 → relX/relY；el → relX/relY。
  function snapToAnchor(cand, elRect) {
    if (cand.objId != null) {
      if (cand.which) return { kind: 'obj', objId: cand.objId, which: cand.which };
      return { kind: 'obj', objId: cand.objId, relX: cand.relX, relY: cand.relY };
    }
    if (cand.selector && elRect) {
      const rel = anchorRel(cand, elRect);
      return { kind: 'el', selector: cand.selector, relX: rel.relX, relY: rel.relY };
    }
    return undefined;
  }
  // 排除 overlay/toolbar 自身與 body/html → 回傳可吸附元件的 css selector。
  function elSnapSelector(el) {
    if (!el || el === document.body || el === document.documentElement) return null;
    if (svg.contains(el) || toolbar.contains(el)) return null;
    return cssSelectorFor(el);
  }
  // 提交端點變更：before/after 同時含 geom + endAnchors（undo 一起還原）。
  function commitEndpoint(o, which, before, pendingAnchor) {
    const nextAnchors = mergeEndAnchor(before.endAnchors, which, pendingAnchor);
    if (nextAnchors) o.endAnchors = nextAnchors; else delete o.endAnchors;
    commitChange(o.id, { geom: before.geom, endAnchors: before.endAnchors },
      { geom: o.geom, endAnchors: nextAnchors });
  }

  // ── pointer：繪製模式（拖曳畫物件）────────────────────────────────────────────
  function onDown(e) {
    if (state.mode !== 'draw') return;
    if (state.tool === 'select') { onSelectDown(e); return; }
    e.preventDefault();
    state.selectedIds = [];
    const rect = svg.getBoundingClientRect();
    if (state.tool === 'text') { startTextInput(e.clientX, e.clientY, rect); return; }
    const p0 = clientToPct(e.clientX, e.clientY, rect);
    let start = p0, fromAnchor;
    if (isEndpointTool(state.tool)) { // 起點也可吸附（畫線時 from 黏元件/形狀）
      const snap = computeEndpointSnap(p0, null, e.clientX, e.clientY);
      if (snap) { start = snap.point; fromAnchor = snap.anchor; snapHighlight = snap.highlight; }
    }
    drag = { tool: state.tool, rect, start, points: [[start.x, start.y]], fromAnchor };
    const style = state.tool === 'pencil' ? { ...(opts.style || {}), brushType: state.brushType } : opts.style;
    state.draft = makeDrawObject({ tool: state.tool, geom: initialGeom(state.tool, start), style });
    if (fromAnchor) state.draft.endAnchors = { from: fromAnchor };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  }
  function isEndpointTool(tool) { return tool === 'arrow' || tool === 'line'; }
  function onMove(e) {
    if (!drag || !state.draft) return;
    const p = clientToPct(e.clientX, e.clientY, drag.rect);
    let to = p;
    if (isEndpointTool(drag.tool)) { // 終點即時吸附 + 高亮，並把 anchor 暫存到 draft
      const snap = computeEndpointSnap(p, null, e.clientX, e.clientY);
      to = snap ? snap.point : p;
      snapHighlight = snap ? snap.highlight : null;
      setDraftAnchors(drag.fromAnchor, snap ? snap.anchor : undefined);
    }
    state.draft.geom = updateGeom(drag, to);
    render();
  }
  function setDraftAnchors(fromAnchor, toAnchor) {
    let ea = fromAnchor ? { from: fromAnchor } : undefined;
    ea = mergeEndAnchor(ea, 'to', toAnchor);
    if (ea) state.draft.endAnchors = ea; else delete state.draft.endAnchors;
  }
  function onUp() {
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);
    drag = null;
    commitDraft();
  }
  function commitDraft() {
    const d = state.draft;
    state.draft = null;
    snapHighlight = null; // 收掉吸附高亮
    if (d && isDrawn(d)) { captureAnchor(d); runCommand({ type: 'create', obj: d }); }
    else render();
  }

  // ── P4：selector 擷取 + 截圖 + 結構化匯出 + 送給 AI ─────────────────────────────
  const ANCHOR_TOOLS = ['ellipse', 'diamond', 'rect', 'arrow', 'line']; // 指向底層元件的標注才擷取
  // 暫時關閉 overlay/toolbar 指標事件，elementFromPoint 取得底層 app 元件。
  function elementUnderPoint(clientX, clientY) {
    const prev = svg.style.pointerEvents;
    svg.style.pointerEvents = 'none';
    toolbar.style.pointerEvents = 'none';
    const el = document.elementFromPoint(clientX, clientY);
    svg.style.pointerEvents = prev;
    toolbar.style.pointerEvents = '';
    return el;
  }
  function captureAnchor(obj) {
    if (!ANCHOR_TOOLS.includes(obj.tool)) return;
    const rect = svg.getBoundingClientRect();
    const a = labelAnchor(obj); // bbox 中心 / 線中點
    const el = elementUnderPoint(rect.left + pctToPx(a.x, rect.width), rect.top + pctToPx(a.y, rect.height));
    if (!el || el === document.body || el === document.documentElement) return; // 空畫布 → anchor 留 null
    const sel = cssSelectorFor(el);
    if (sel) obj.anchor = sel;
  }

  function exportPayload() {
    return buildExport(state.objects, { w: svg.clientWidth || host.clientWidth, h: svg.clientHeight || host.clientHeight });
  }
  // 把 #pc-draw SVG（含貼圖 + 標注）轉 PNG dataURL（XMLSerializer → img → canvas）。async。
  async function capturePng() {
    try {
      const w = svg.clientWidth || host.clientWidth, h = svg.clientHeight || host.clientHeight;
      const clone = svg.cloneNode(true);
      clone.setAttribute('width', w);
      clone.setAttribute('height', h);
      clone.setAttribute('xmlns', SVG_NS);
      clone.querySelectorAll('.pc-draw-selection, .pc-draw-marquee').forEach(n => n.remove()); // 不要選取框
      const xml = new XMLSerializer().serializeToString(clone);
      const url = URL.createObjectURL(new Blob([xml], { type: 'image/svg+xml;charset=utf-8' }));
      const dataURL = await new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          canvas.width = w; canvas.height = h;
          canvas.getContext('2d').drawImage(img, 0, 0);
          resolve(canvas.toDataURL('image/png'));
        };
        img.onerror = reject;
        img.src = url;
      });
      URL.revokeObjectURL(url);
      return dataURL;
    } catch (_) { return null; }
  }
  // 實際使用時 flow 由 resolve server 同源服務 → 預設打同源 /api/draw（http(s) 才送；file:// 回 null 不送）。
  function sameOriginDrawEndpoint() {
    try {
      const o = typeof location !== 'undefined' && location.origin;
      return o && /^https?:/.test(o) ? o + '/api/draw' : null;
    } catch (_) { return null; }
  }
  // 組 {json, png} → POST 到 endpoint（可無）；無論有無 server 都回 payload 供 caller/測試讀。
  async function sendToAgent(opts2 = {}) {
    const json = exportPayload();
    if (!json.annotations.length) return { json, png: null, sent: false }; // 沒標注 → 不做事
    const png = await capturePng();
    const payload = { json, png, sent: false };
    const endpoint = opts2.endpoint || state.exportEndpoint || sameOriginDrawEndpoint();
    if (endpoint && typeof fetch === 'function') {
      try {
        await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ json, png }) });
        payload.sent = true;
      } catch (_) { payload.sent = false; }
    }
    return payload;
  }

  // 抽屜 footer「送給 AI（N）」按鈕處理：防重複送出、顯示中間/成功/失敗狀態。
  async function handleDrawerSend() {
    const sendBtn = recordDrawer.querySelector('.pc-draw-rec-send-btn');
    if (!sendBtn || sendBtn.disabled || sendBtn.dataset.inflight) return;
    const n = annotationRows(state.objects).length; // 與面板計數一致（非 raw objects 數）
    sendBtn.dataset.inflight = '1';
    sendBtn.disabled = true;
    sendBtn.textContent = '送出中…';
    let result;
    try { result = await sendToAgent(); } catch (_) { result = { sent: false }; }
    if (result && result.sent) {
      sendBtn.textContent = `✅ 已送出 ${n} 筆`;
      setTimeout(() => { delete sendBtn.dataset.inflight; renderRecordPanel(); }, 1800);
      return;
    }
    sendBtn.textContent = '⚠️ 送出失敗，再試一次';
    sendBtn.disabled = false;
    delete sendBtn.dataset.inflight;
  }

  function startTextInput(clientX, clientY, rect) {
    const input = drawHtmlEl('input', 'pc-draw-text-input');
    input.type = 'text';
    input.style.left = (clientX - rect.left) + 'px';
    input.style.top = (clientY - rect.top) + 'px';
    host.appendChild(input);
    setTimeout(() => input.focus(), 0);
    const point = clientToPct(clientX, clientY, rect);
    let done = false;
    const commit = () => {
      if (done) return;            // Enter 與 blur 都會觸發 → 防重複 remove/commit
      done = true;
      const text = input.value.trim();
      input.remove();
      if (!text) return;
      runCommand({ type: 'create', obj: makeDrawObject({ tool: 'text', geom: { x: point.x, y: point.y }, text, style: opts.style }) });
    };
    input.addEventListener('keydown', ev => { if (ev.key === 'Enter') { ev.preventDefault(); commit(); } });
    input.addEventListener('blur', commit);
  }

  // ── 雙擊：在物件上加/編輯綁定標籤（Excalidraw bound text）────────────────────────
  function onDblClick(e) {
    if (state.mode !== 'draw' || state.tool !== 'select') return;
    const rect = svg.getBoundingClientRect();
    const hit = hitTest(clientToPct(e.clientX, e.clientY, rect));
    if (hit) { e.preventDefault(); state.selectedIds = [hit.id]; startLabelEdit(hit, rect); }
    else startTextInput(e.clientX, e.clientY, rect); // 雙擊空白 → 自由文字（Excalidraw parity）
  }
  // 在物件錨點（shape 中心 / line 中點）開輸入框，commit 寫回 obj.label（可 undo）。
  function startLabelEdit(o, rect) {
    const a = labelAnchor(o);
    const cx = pctToPx(a.x, rect.width), cy = pctToPx(a.y, rect.height);
    const input = drawHtmlEl('input', 'pc-draw-text-input');
    input.type = 'text';
    input.value = o.label || '';                 // 已有標籤 → 預填供編輯
    input.style.left = (cx - 40) + 'px';          // 大致置中於錨點
    input.style.top = (cy - 12) + 'px';
    input.style.textAlign = 'center';
    host.appendChild(input);
    setTimeout(() => { input.focus(); input.select(); }, 0);
    const before = { label: o.label || '' };
    let done = false;
    const commit = () => {
      if (done) return;
      done = true;
      const text = input.value.trim();
      input.remove();
      if (text === (o.label || '')) { render(); return; } // 無變更
      o.label = text;                              // 立即套用（預覽）
      pushHistory({ type: 'update', id: o.id, before, after: { label: text } });
    };
    input.addEventListener('keydown', ev => { if (ev.key === 'Enter') { ev.preventDefault(); commit(); } });
    input.addEventListener('blur', commit);
  }

  // ── 貼圖：paste（剪貼簿）/ drop（檔案）→ image 物件（P3，dataURL 內嵌）─────────────
  // 核心：addImage（純資料路徑，paste/drop 與 e2e 共用），回傳新物件。
  function addImage(dataURL, naturalW, naturalH, atPoint) {
    const cw = svg.clientWidth || host.clientWidth || 1;
    const ch = svg.clientHeight || host.clientHeight || 1;
    const geom = imageGeom(naturalW, naturalH, cw, ch, atPoint);
    const obj = makeDrawObject({ tool: 'image', geom, imageRef: dataURL });
    runCommand({ type: 'create', obj }); // 進 undo/redo + 自動選取
    return obj;
  }
  // blob → dataURL → 量自然尺寸 → addImage。
  function loadBlobAsImage(blob, atPoint) {
    const reader = new FileReader();
    reader.onload = () => {
      const dataURL = reader.result;
      const img = new Image();
      img.onload = () => addImage(dataURL, img.naturalWidth || img.width, img.naturalHeight || img.height, atPoint);
      img.src = dataURL;
    };
    reader.readAsDataURL(blob);
  }
  function isTyping() {
    const ae = document.activeElement;
    return !!ae && (ae.tagName === 'INPUT' || ae.tagName === 'TEXTAREA' || ae.isContentEditable);
  }
  function onPaste(e) {
    if (state.mode !== 'draw' || isTyping()) return; // 打字時不攔貼上
    const items = (e.clipboardData && e.clipboardData.items) || [];
    for (const it of items) {
      if (it.type && it.type.indexOf('image') === 0) {
        const blob = it.getAsFile();
        if (blob) { e.preventDefault(); loadBlobAsImage(blob, null); return; } // 置中
      }
    }
  }
  function onDragOver(e) { if (state.mode === 'draw') e.preventDefault(); } // 允許 drop
  function onDrop(e) {
    if (state.mode !== 'draw') return;
    e.preventDefault(); // 擋瀏覽器開新頁
    const files = (e.dataTransfer && e.dataTransfer.files) || [];
    const at = clientToPct(e.clientX, e.clientY, svg.getBoundingClientRect());
    for (const f of files) {
      if (f.type && f.type.indexOf('image') === 0) { loadBlobAsImage(f, at); return; }
    }
  }

  // ── 鍵盤：Delete/Backspace 刪除、Cmd/Ctrl+Z undo、Shift+Cmd/Ctrl+Z redo ────────
  function onKey(e) {
    if (state.mode !== 'draw') return;
    if (e.key === 'Escape') { closeContextMenu(); return; } // 關右鍵選單
    const tag = (e.target && e.target.tagName) || '';
    if (tag === 'INPUT' || tag === 'TEXTAREA' || (e.target && e.target.isContentEditable)) return;
    const meta = e.metaKey || e.ctrlKey;
    if (meta && (e.key === 'z' || e.key === 'Z')) {
      e.preventDefault();
      if (e.shiftKey) doRedo(); else doUndo();
      return;
    }
    if (meta && e.key.toLowerCase() === 'g') {
      e.preventDefault();
      if (e.shiftKey) doUngroupSelected(); else doGroupSelected();
      return;
    }
    if ((e.key === 'Delete' || e.key === 'Backspace') && state.selectedIds.length) {
      e.preventDefault();
      deleteSelected();
      return;
    }
    // 工具切換快捷鍵（純按鍵；排除 Cmd/Ctrl/Alt 以免撞 undo/redo/瀏覽器）。打字已在上方 guard 擋掉。
    if (!meta && !e.altKey) {
      const action = resolveShortcut(e.key);
      if (action) {
        e.preventDefault();
        if (action === 'eyedropper') openEyedropper();
        else if (action === 'pencil') setBrush('pen'); // 7/P → 自由筆（預設 pen）
        else setTool(action);
      }
    }
  }

  // ── 右鍵 context menu（z-order + 刪除，作用於選取集合）──────────────────────────
  function onContextMenu(e) {
    if (state.mode !== 'draw' || state.tool !== 'select') return;
    e.preventDefault(); // 擋掉瀏覽器原生選單
    const rect = svg.getBoundingClientRect();
    const hit = hitTest(clientToPct(e.clientX, e.clientY, rect));
    if (!hit) { closeContextMenu(); return; }
    if (!isSelected(hit.id)) selectOnly(hit.id); // 右鍵未選物件 → 先選它
    render();
    openContextMenu(e.clientX, e.clientY);
  }
  function openContextMenu(x, y) {
    contextMenu.style.left = x + 'px';
    contextMenu.style.top = y + 'px';
    contextMenu.classList.add('open');
    // 下一輪 tick 再掛外點關閉監聽（避免開啟當下的同一個 pointer 事件立刻關掉）。Esc 由 onKey 處理。
    setTimeout(() => document.addEventListener('pointerdown', onDocPointer, true), 0);
  }
  function closeContextMenu() {
    contextMenu.classList.remove('open');
    document.removeEventListener('pointerdown', onDocPointer, true);
  }
  function onDocPointer(e) { if (!contextMenu.contains(e.target)) closeContextMenu(); }

  svg.addEventListener('pointerdown', onDown);
  svg.addEventListener('dblclick', onDblClick);
  svg.addEventListener('contextmenu', onContextMenu);
  svg.addEventListener('dragover', onDragOver);
  svg.addEventListener('drop', onDrop);
  window.addEventListener('resize', render);
  window.addEventListener('keydown', onKey);
  window.addEventListener('paste', onPaste);

  // dev 模式：init 時從本機儲存還原向量物件（首次 render 前）。try/catch 確保失敗不影響繪圖。
  if (useLocalPersist && _storage) {
    try {
      const raw = _storage.getItem(localKey);
      if (raw) state.objects = hydrateObjectsFromLocal(JSON.parse(raw));
    } catch (_) { /* localStorage 失敗 / JSON 損毀 → 從空白開始 */ }
  }

  applyMode();
  render();
  startSync(); // P7：團隊模式才訂閱 + 載入既有 drawings（dev 模式 drawStore=null → no-op）

  return {
    svg, host,
    getMode: () => state.mode,
    setMode,
    getTool: () => state.tool,
    setTool,
    getObjects: () => { stampZ(); return state.objects.map(serializeDrawObject); },
    getSelected: () => (state.selectedIds.length ? state.selectedIds[0] : null), // 向後相容：回傳首個
    getSelectedIds: () => state.selectedIds.slice(),
    select: id => { state.selectedIds = id ? [id] : []; render(); },
    selectIds: ids => { state.selectedIds = (ids || []).slice(); render(); },
    bringToFront: () => zorder('front'),
    sendToBack: () => zorder('back'),
    forward: () => zorder('forward'),
    backward: () => zorder('backward'),
    deleteSelected,
    undo: doUndo,
    redo: doRedo,
    setColor,
    setStrokeWidth,
    setFontSize,
    setHeads,
    eyedropper: openEyedropper,
    addImage, // (dataURL, naturalW, naturalH, atPoint?) → 新 image 物件（paste/drop 與測試共用）
    buildExport: exportPayload,            // 結構化 JSON（selector + text + geom）
    capturePng,                            // async → PNG dataURL
    sendToAgent,                           // async (opts?) → {json, png, sent}；回 payload
    setExportEndpoint: url => { state.exportEndpoint = url; },
    getAnnotationRows: () => annotationRows(state.objects), // P6 面板 row 資料（純函式包裝）
    toggleRecordPanel: () => { state.recordOpen = !state.recordOpen; renderRecordPanel(); },
    clear: () => { state.objects = []; state.draft = null; state.selectedIds = []; render(); persistLocalSave(); },
    destroy: () => {
      stopLive(); // Batch 4：拆掉 live reposition 監聽/rAF/ResizeObserver
      svg.remove(); toolbar.remove(); contextMenu.remove();
      recordTab.remove(); recordDrawer.remove();
      window.removeEventListener('resize', render);
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('paste', onPaste);
      if (typeof unsubDraw === 'function') { try { unsubDraw(); } catch (_) { /* ignore */ } }
      closeContextMenu();
    },
  };
}

// opts.persist → drawings store（純 wiring，可單測思路）。接受三種輸入：
//   - falsy        → null（dev 模式，0 Firebase）
//   - ready store  → 已有 subscribe/save → 直接用（呼叫端先 createDrawingStore）
//   - {fb,db,projectId} → 用 createDrawingStore 現場建（team 模式便利寫法）
// 任一步出錯都回 null → 退回純本地，永不讓持久化擋住繪圖。
function resolveDrawStore(persist) {
  if (!persist) return null;
  try {
    if (typeof persist.subscribe === 'function' && typeof persist.save === 'function') return persist;
    if (persist.fb && persist.projectId != null) return createDrawingStore(persist.fb, persist.db, persist.projectId);
  } catch (_) { /* ignore → null */ }
  return null;
}

// 把 % box 換成 px box（選取框 / marquee 繪製）。
function toPxBox(b, rect) {
  return { x: pctToPx(b.x, rect.width), y: pctToPx(b.y, rect.height), w: pctToPx(b.w, rect.width), h: pctToPx(b.h, rect.height) };
}

function findById(objects, id) { return objects.find(o => o.id === id); }

// ── 幾何（依工具，% 座標）──────────────────────────────────────────────────
function initialGeom(tool, p) {
  if (tool === 'ellipse' || tool === 'rect' || tool === 'diamond') return { x: p.x, y: p.y, w: 0, h: 0 };
  if (tool === 'arrow' || tool === 'line') return { from: { ...p }, to: { ...p } };
  if (tool === 'pencil') return { points: [[p.x, p.y]] };
  return { x: p.x, y: p.y };
}
function updateGeom(drag, p) {
  if (drag.tool === 'pencil') { drag.points.push([p.x, p.y]); return { points: drag.points.slice() }; }
  return geomFromDrag(drag.tool, drag.start, p);
}
// 判斷物件是否「真的畫了」（避免單點 click 留下空物件）。
function isDrawn(o) {
  if (o.tool === 'ellipse' || o.tool === 'rect' || o.tool === 'diamond' || o.tool === 'image') return o.geom.w > 0.2 || o.geom.h > 0.2;
  if (o.tool === 'arrow' || o.tool === 'line') { const g = o.geom; return Math.abs(g.to.x - g.from.x) > 0.2 || Math.abs(g.to.y - g.from.y) > 0.2; }
  if (o.tool === 'pencil') return (o.geom.points || []).length > 1;
  return true; // text 由 input commit 控制
}

// ── render 一個 DrawObject → SVG 節點（% → px）──────────────────────────────
function renderObject(o, rect, svg) {
  const s = o.style || DEFAULT_DRAW_STYLE;
  const stroke = { stroke: s.color, 'stroke-width': s.strokeWidth, fill: s.fill || 'none' };
  if (o.tool === 'ellipse') {
    const g = o.geom;
    return drawSvgEl('ellipse', {
      cx: pctToPx(g.x + g.w / 2, rect.width), cy: pctToPx(g.y + g.h / 2, rect.height),
      rx: pctToPx(g.w / 2, rect.width), ry: pctToPx(g.h / 2, rect.height), ...stroke,
    });
  }
  if (o.tool === 'rect') {
    const g = o.geom;
    return drawSvgEl('rect', {
      x: pctToPx(g.x, rect.width), y: pctToPx(g.y, rect.height),
      width: pctToPx(g.w, rect.width), height: pctToPx(g.h, rect.height), ...stroke,
    });
  }
  if (o.tool === 'image') {
    const g = o.geom;
    const img = drawSvgEl('image', {
      x: pctToPx(g.x, rect.width), y: pctToPx(g.y, rect.height),
      width: pctToPx(g.w, rect.width), height: pctToPx(g.h, rect.height),
      preserveAspectRatio: 'xMidYMid meet',
    });
    img.setAttribute('href', o.imageRef || '');
    img.setAttributeNS('http://www.w3.org/1999/xlink', 'xlink:href', o.imageRef || ''); // 舊瀏覽器相容
    return img;
  }
  if (o.tool === 'diamond') {
    const g = o.geom;
    const box = { x: pctToPx(g.x, rect.width), y: pctToPx(g.y, rect.height), w: pctToPx(g.w, rect.width), h: pctToPx(g.h, rect.height) };
    const pts = diamondPoints(box).map(([x, y]) => `${x},${y}`).join(' ');
    return drawSvgEl('polygon', { points: pts, ...stroke });
  }
  if (o.tool === 'arrow' || o.tool === 'line') {
    const g = o.geom;
    const attrs = {
      x1: pctToPx(g.from.x, rect.width), y1: pctToPx(g.from.y, rect.height),
      x2: pctToPx(g.to.x, rect.width), y2: pctToPx(g.to.y, rect.height),
      stroke: s.color, 'stroke-width': s.strokeWidth, fill: 'none',
    };
    const h = arrowHeads(o); // 端點箭頭：none/end/start/both（marker 用 auto-start-reverse 自動翻向）
    if (h.start || h.end) {
      const mid = ensureArrowMarker(svg, s.color);
      if (h.end) attrs['marker-end'] = `url(#${mid})`;
      if (h.start) attrs['marker-start'] = `url(#${mid})`;
    }
    return drawSvgEl('line', attrs);
  }
  if (o.tool === 'pencil') {
    const ptsPx = (o.geom.points || []).map(([x, y]) => [pctToPx(x, rect.width), pctToPx(y, rect.height)]);
    const brush = o.style.brushType || 'pen';
    const cfg = brushStyle(brush);
    const base = (s.strokeWidth || 2) * cfg.widthMul;
    if (!cfg.fill) { // highlighter：等寬描邊、半透明、flat cap、multiply
      return drawSvgEl('path', {
        d: freehandPath(ptsPx), stroke: s.color, 'stroke-width': base, fill: 'none',
        'stroke-linecap': 'butt', 'stroke-linejoin': 'round', opacity: cfg.opacity,
        style: 'mix-blend-mode:' + cfg.blend, 'data-brush': brush,
      });
    }
    // pen / marker：頭尾漸細的填充外框（fill=色、無 stroke）
    return drawSvgEl('path', {
      d: taperedOutline(ptsPx, base, { taperFrac: cfg.taperFrac, minScale: cfg.minScale }),
      fill: s.color, stroke: 'none', opacity: cfg.opacity, 'stroke-linejoin': 'round', 'data-brush': brush,
    });
  }
  const t = drawSvgEl('text', { x: pctToPx(o.geom.x, rect.width), y: pctToPx(o.geom.y, rect.height), fill: s.color, 'font-size': s.fontSize || DEFAULT_DRAW_STYLE.fontSize, 'font-family': 'system-ui, sans-serif' });
  t.textContent = o.text || '';
  return t;
}

const LABEL_FONT_SIZE = 14;
const LABEL_BG_PAD = 5; // 白底每邊外擴 px
// 綁定標籤 → <g>（含 <text>；line/arrow 另加白底 <rect> 把線蓋掉）。無 label 回 null。
// 白底先用估算尺寸（fallback），append 後由 sizeLabelBg() 量實際 text bbox 收緊到完全覆蓋。
function renderLabel(o, rect) {
  if (o.label == null || o.label === '') return null;
  const a = labelAnchor(o);
  const x = pctToPx(a.x, rect.width), y = pctToPx(a.y, rect.height);
  const isLine = o.tool === 'arrow' || o.tool === 'line';
  const labelFs = (o.style && o.style.fontSize) || LABEL_FONT_SIZE; // 跟隨物件字體大小
  const g = drawSvgEl('g', { class: 'pc-draw-label', 'data-label-for': o.id, 'pointer-events': 'none' });
  if (isLine) { // 白底蓋住線；rect 在前(底層)、text 在後(上層)
    const w = o.label.length * labelFs + LABEL_BG_PAD * 2; // 估寬偏大（CJK ~1em/字）→ fallback 也蓋住
    const h = labelFs + LABEL_BG_PAD * 2;
    g.appendChild(drawSvgEl('rect', { x: x - w / 2, y: y - h / 2, width: w, height: h, fill: '#ffffff', rx: 3 }));
  }
  const t = drawSvgEl('text', {
    x, y, 'text-anchor': 'middle', 'dominant-baseline': 'middle',
    fill: '#1e1e1e', 'font-size': labelFs, 'font-family': 'system-ui, sans-serif',
  });
  t.textContent = o.label;
  g.appendChild(t);
  return g;
}

// 量實際 text bbox，把白底 rect 收到「text bbox + padding」完全覆蓋（需 text 已在 DOM）。
function sizeLabelBg(g) {
  const bg = g.querySelector('rect');
  const text = g.querySelector('text');
  if (!bg || !text) return; // shape 標籤無 bg → 略過
  let bb;
  try { bb = text.getBBox(); } catch (_) { bb = null; }
  if (!bb || !bb.width) return; // 量不到 → 保留估算 fallback
  bg.setAttribute('x', bb.x - LABEL_BG_PAD);
  bg.setAttribute('y', bb.y - LABEL_BG_PAD);
  bg.setAttribute('width', bb.width + LABEL_BG_PAD * 2);
  bg.setAttribute('height', bb.height + LABEL_BG_PAD * 2);
}

// <defs> 容器（marker 依顏色按需建立，見 ensureArrowMarker）。render 保留首子節點＝此 defs。
function buildArrowhead(svg) {
  svg.appendChild(drawSvgEl('defs'));
}

// 顏色 → 穩定的 marker id（只保留英數，確保是合法 id；保留 "arrowhead" 關鍵字）。
function arrowMarkerId(color) {
  return 'pc-draw-arrowhead-' + String(color).replace(/[^a-z0-9]/gi, '');
}

// 確保該顏色的箭頭 marker 存在於 <defs>（path fill＝該色 → 箭頭跟著 stroke 變色）。回傳 id。
function ensureArrowMarker(svg, color) {
  const id = arrowMarkerId(color);
  let defs = svg.querySelector('defs');
  if (!defs) { defs = drawSvgEl('defs'); svg.insertBefore(defs, svg.firstChild); }
  if (!defs.querySelector('#' + id)) {
    const marker = drawSvgEl('marker', { id, viewBox: '0 0 10 10', refX: 8, refY: 5, markerWidth: 7, markerHeight: 7, orient: 'auto-start-reverse' });
    marker.appendChild(drawSvgEl('path', { d: 'M0,0 L10,5 L0,10 z', fill: color }));
    defs.appendChild(marker);
  }
  return id;
}

// ── 工具列 UI（Material 圖示 + 顏色/線粗 popover）────────────────────────────
// 工具列上的工具排序（Excalidraw 數字順序）；pencil 槽位用 3 個筆刷取代（無獨立鉛筆鈕）。
const TOOLBAR_TOOL_ORDER = ['select', 'rect', 'diamond', 'ellipse', 'arrow', 'line', 'pencil', 'text'];
function buildToolbar(state, actions) {
  const bar = drawHtmlEl('div', 'pc-draw-toolbar');
  bar.id = 'pc-draw-toolbar';
  // 1 select · 2 rect · 3 diamond · 4 ellipse · 5 arrow · 6 line · 7 [pen marker highlighter] · 8 text
  TOOLBAR_TOOL_ORDER.forEach(tool => {
    if (tool === 'pencil') DRAW_BRUSHES.forEach(t => bar.appendChild(brushButton(t, actions))); // 7：筆刷群＝自由筆
    else bar.appendChild(toolButton(tool, actions));
  });
  appendSep(bar);
  bar.appendChild(colorMenu(actions));
  bar.appendChild(widthMenu(actions));
  bar.appendChild(fontSizeMenu(actions));
  bar.appendChild(headsMenu(actions));
  appendSep(bar);
  bar.appendChild(actButton('delete', actions)); // 刪除（z-order 已移到右鍵選單）
  appendSep(bar);
  ['undo', 'redo'].forEach(a => bar.appendChild(actButton(a, actions)));
  appendSep(bar);
  const send = drawHtmlEl('button', 'pc-draw-tool pc-draw-send');
  send.dataset.action = 'send';
  send.title = '標注紀錄／送給 AI';
  send.setAttribute('aria-label', '標注紀錄／送給 AI');
  send.innerHTML = icon('send');
  send.onclick = () => actions.openRecord();
  bar.appendChild(send);
  appendSep(bar);
  const off = drawHtmlEl('button', 'pc-draw-tool');
  off.dataset.tool = 'off';
  off.title = '結束繪圖（放行 app 點擊）';
  off.setAttribute('aria-label', '結束繪圖');
  off.innerHTML = icon('close');
  off.onclick = () => actions.setMode('off');
  bar.appendChild(off);
  return bar;
}
function appendSep(bar) { bar.appendChild(drawHtmlEl('div', 'pc-draw-sep')); }
// 工具的數字快捷鍵（取自 TOOL_SHORTCUTS 單一真相，Excalidraw 風格徽章用）。
function toolNumberKey(tool) {
  return Object.keys(TOOL_SHORTCUTS).find(k => /^[0-9]$/.test(k) && TOOL_SHORTCUTS[k] === tool) || '';
}
function toolButton(tool, actions) {
  const b = drawHtmlEl('button', 'pc-draw-tool');
  b.dataset.tool = tool;
  const key = TOOL_KEY[tool];
  const label = (TOOL_LABELS_ZH[tool] || tool) + (key ? ` (${key})` : '');
  b.title = label;                       // tooltip 含字母快捷鍵，供探索
  b.setAttribute('aria-label', label);
  const num = toolNumberKey(tool);
  b.innerHTML = icon(tool) + (num ? `<span class="pc-draw-kbd" aria-hidden="true">${num}</span>` : ''); // 常駐數字徽章
  b.onclick = () => actions.setTool(tool);
  return b;
}
function actButton(action, actions) {
  const b = drawHtmlEl('button', 'pc-draw-tool pc-draw-act');
  b.dataset.action = action;
  b.title = action;
  b.setAttribute('aria-label', action);
  b.innerHTML = icon(action);
  b.onclick = () => actions.act(action);
  return b;
}
function brushButton(type, actions) {
  const b = drawHtmlEl('button', 'pc-draw-tool pc-draw-brush');
  b.dataset.brush = type;
  b.title = BRUSH_LABELS[type] + (type === 'pen' ? ' (P)' : ''); // pen 是自由筆主鍵
  b.setAttribute('aria-label', BRUSH_LABELS[type]);
  const num = type === 'pen' ? toolNumberKey('pencil') : ''; // 數字徽章「7」只放在 pen（自由筆代表）
  b.innerHTML = icon(BRUSH_ICON[type]) + (num ? `<span class="pc-draw-kbd" aria-hidden="true">${num}</span>` : '');
  b.onclick = () => actions.setBrush(type);
  return b;
}

// 右鍵 context menu：z-order + 刪除，作用於目前選取集合。
function buildContextMenu(actions) {
  const menu = drawHtmlEl('div', 'pc-draw-context');
  menu.id = 'pc-draw-context';
  [['front', '置頂'], ['forward', '上移一層'], ['backward', '下移一層'], ['back', '置底'], ['delete', '刪除']]
    .forEach(([action, label]) => {
      const item = drawHtmlEl('button', 'pc-draw-context-item');
      item.dataset.action = action;
      item.setAttribute('aria-label', label);
      item.innerHTML = icon(action, 18) + `<span>${label}</span>`;
      item.onclick = () => { actions.act(action); actions.closeContext(); };
      menu.appendChild(item);
    });
  return menu;
}

// ── P6 側邊「標注紀錄」面板 DOM（右緣 tab + 抽屜，沿用 spec-overlay 的 tab/drawer 模式）──
function buildRecordTab(onToggle) {
  const tab = drawHtmlEl('button', 'pc-draw-rec-tab');
  tab.id = 'pc-draw-rec-tab';
  tab.textContent = '標注紀錄 ◂';
  tab.title = '標注紀錄';
  tab.setAttribute('aria-label', '標注紀錄');
  tab.onclick = onToggle;
  return tab;
}
function buildRecordDrawer(onClose) {
  const drawer = drawHtmlEl('div', 'pc-draw-rec-drawer');
  drawer.id = 'pc-draw-rec-drawer';
  const hd = drawHtmlEl('div', 'pc-draw-rec-hd');
  const title = drawHtmlEl('span', 'pc-draw-rec-hd-title'); title.textContent = '標注紀錄';
  const count = drawHtmlEl('span', 'pc-draw-rec-count'); count.textContent = '0';
  const close = drawHtmlEl('button', 'pc-draw-rec-close'); close.textContent = '✕';
  close.title = '關閉'; close.setAttribute('aria-label', '關閉標注紀錄'); close.onclick = onClose;
  hd.appendChild(title); hd.appendChild(count); hd.appendChild(close);
  drawer.appendChild(hd);
  drawer.appendChild(drawHtmlEl('div', 'pc-draw-rec-list'));
  // footer：主要送出按鈕（onclick 在 initDrawLayer 掛上）
  const footer = drawHtmlEl('div', 'pc-draw-rec-footer');
  const sendBtn = drawHtmlEl('button', 'pc-draw-rec-send-btn');
  sendBtn.textContent = '送給 AI（0）';
  sendBtn.disabled = true;
  footer.appendChild(sendBtn);
  drawer.appendChild(footer);
  return drawer;
}
// 一筆標注 → 面板 row（工具圖示 + 色票 + 文字 + selector）。點擊 → onClick(id)。
function recordRowEl(row, selected, onClick) {
  const el = drawHtmlEl('button', 'pc-draw-rec-row' + (selected ? ' selected' : ''));
  el.dataset.id = row.id;
  el.setAttribute('aria-label', row.text);
  const ic = drawHtmlEl('span', 'pc-draw-rec-icon');
  ic.innerHTML = icon(row.icon, 18);
  el.appendChild(ic);
  if (row.color) {
    const sw = drawHtmlEl('span', 'pc-draw-rec-swatch');
    sw.style.background = row.color;
    el.appendChild(sw);
  }
  const body = drawHtmlEl('div', 'pc-draw-rec-body');
  const txt = drawHtmlEl('div', 'pc-draw-rec-text'); txt.textContent = row.text;
  body.appendChild(txt);
  if (row.selector) {
    const sel = drawHtmlEl('div', 'pc-draw-rec-sel');
    sel.textContent = row.selector; sel.title = row.selector;
    body.appendChild(sel);
  }
  el.appendChild(body);
  el.onclick = () => onClick(row.id);
  return el;
}

// 顏色 popover：8 預設色 swatch ＋ <input type=color> 自訂任意 hex。
function colorMenu(actions) {
  const wrap = drawHtmlEl('div', 'pc-draw-menu');
  const trigger = drawHtmlEl('button', 'pc-draw-tool pc-draw-trigger');
  trigger.dataset.action = 'color-menu';
  trigger.title = '顏色';
  trigger.setAttribute('aria-label', '顏色');
  trigger.appendChild(drawHtmlEl('span', 'pc-draw-cur-color'));
  trigger.onclick = () => togglePopover(wrap);
  const pop = drawHtmlEl('div', 'pc-draw-popover');
  pop.dataset.menu = 'color';
  DRAW_COLORS.forEach(c => pop.appendChild(swatchButton(c, actions)));
  pop.appendChild(customSwatch(actions)); // 第 9 顆：自訂調色盤
  pop.appendChild(eyedropperButton(actions)); // 吸管取樣
  wrap.appendChild(trigger);
  wrap.appendChild(pop);
  return wrap;
}
// 吸管：取樣畫面上任意顏色（瀏覽器 EyeDropper API）。不支援時隱藏，不報錯。
function eyedropperButton(actions) {
  const b = drawHtmlEl('button', 'pc-draw-tool pc-draw-eyedropper');
  b.dataset.action = 'eyedropper';
  b.title = '取樣顏色 (I)'; // tooltip 含快捷鍵；aria-label 維持純名稱（測試/讀屏穩定）
  b.setAttribute('aria-label', '取樣顏色');
  b.innerHTML = icon('colorize');
  b.onclick = () => actions.eyedropper();
  if (!eyedropperSupported()) { b.disabled = true; b.style.display = 'none'; }
  return b;
}
// 自訂顏色 swatch：彩虹圓 + 「+」，看起來像第 9 顆 swatch；點擊開原生 color picker。
function customSwatch(actions) {
  const label = drawHtmlEl('label', 'pc-draw-swatch pc-draw-custom-swatch');
  label.title = '自訂顏色';
  label.setAttribute('aria-label', '自訂顏色');
  const custom = drawHtmlEl('input', 'pc-draw-color-custom');
  custom.type = 'color';
  custom.setAttribute('aria-label', '自訂顏色');
  custom.dataset.action = 'custom-color';
  custom.addEventListener('input', () => actions.setColor(custom.value));
  label.appendChild(custom);
  return label;
}
// 線粗 popover：thin → bold 的遞增粗條。
function widthMenu(actions) {
  const wrap = drawHtmlEl('div', 'pc-draw-menu');
  const trigger = drawHtmlEl('button', 'pc-draw-tool pc-draw-trigger');
  trigger.dataset.action = 'width-menu';
  trigger.title = '線粗';
  trigger.setAttribute('aria-label', '線粗');
  trigger.innerHTML = icon('lineWeight');
  trigger.onclick = () => togglePopover(wrap);
  const pop = drawHtmlEl('div', 'pc-draw-popover pc-draw-popover-width');
  pop.dataset.menu = 'width';
  DRAW_STROKE_WIDTHS.forEach(w => pop.appendChild(widthButton(w, actions)));
  wrap.appendChild(trigger);
  wrap.appendChild(pop);
  return wrap;
}
function togglePopover(wrap) {
  const bar = wrap.closest('.pc-draw-toolbar');
  if (bar) bar.querySelectorAll('.pc-draw-menu.open').forEach(m => { if (m !== wrap) m.classList.remove('open'); });
  wrap.classList.toggle('open');
}
function swatchButton(color, actions) {
  const b = drawHtmlEl('button', 'pc-draw-swatch');
  b.dataset.color = color;
  b.style.background = color;
  b.title = color;
  b.setAttribute('aria-label', color);
  b.onclick = () => actions.setColor(color);
  return b;
}
function widthButton(w, actions) {
  const b = drawHtmlEl('button', 'pc-draw-width');
  b.dataset.width = w;
  b.title = w + 'px';
  b.setAttribute('aria-label', w + 'px');
  const dot = drawHtmlEl('span');
  dot.style.cssText = `display:block;width:18px;height:${Math.min(w, 10)}px;border-radius:4px;background:#e5e7eb;`;
  b.appendChild(dot);
  b.onclick = () => actions.setStrokeWidth(w);
  return b;
}
// 字體大小 popover：用標本文字大小直觀呈現各選項。
function fontSizeMenu(actions) {
  const wrap = drawHtmlEl('div', 'pc-draw-menu');
  const trigger = drawHtmlEl('button', 'pc-draw-tool pc-draw-trigger');
  trigger.dataset.action = 'fontsize-menu';
  trigger.title = '字體大小';
  trigger.setAttribute('aria-label', '字體大小');
  trigger.innerHTML = icon('text');
  trigger.onclick = () => togglePopover(wrap);
  const pop = drawHtmlEl('div', 'pc-draw-popover pc-draw-popover-fontsize');
  pop.dataset.menu = 'fontsize';
  DRAW_FONT_SIZES.forEach(sz => pop.appendChild(fontSizeButton(sz, actions)));
  wrap.appendChild(trigger);
  wrap.appendChild(pop);
  return wrap;
}
function fontSizeButton(sz, actions) {
  const b = drawHtmlEl('button', 'pc-draw-fontsize');
  b.dataset.fontSize = sz;
  b.title = sz + 'px';
  b.setAttribute('aria-label', sz + 'px');
  b.style.cssText = `font-size:${Math.max(sz, 10)}px; padding:1px 6px; line-height:1.3; font-family:system-ui,sans-serif;`;
  b.textContent = 'A';
  b.onclick = () => actions.setFontSize(sz);
  return b;
}

const HEAD_SYMBOL = { none: '—', end: '→', start: '←', both: '↔' };
const HEAD_LABEL = { none: '無箭頭', end: '終點箭頭', start: '起點箭頭', both: '雙向箭頭' };
// 端點箭頭 popover：line/arrow 選無/終點/起點/雙向（雙向＝雙箭頭）。
function headsMenu(actions) {
  const wrap = drawHtmlEl('div', 'pc-draw-menu');
  const trigger = drawHtmlEl('button', 'pc-draw-tool pc-draw-trigger');
  trigger.dataset.action = 'heads-menu';
  trigger.title = '端點箭頭（單／雙向）';
  trigger.setAttribute('aria-label', '端點箭頭');
  trigger.textContent = '↔';
  trigger.onclick = () => togglePopover(wrap);
  const pop = drawHtmlEl('div', 'pc-draw-popover pc-draw-popover-heads');
  pop.dataset.menu = 'heads';
  DRAW_HEAD_MODES.forEach(m => pop.appendChild(headsButton(m, actions)));
  wrap.appendChild(trigger);
  wrap.appendChild(pop);
  return wrap;
}
function headsButton(mode, actions) {
  const b = drawHtmlEl('button', 'pc-draw-heads');
  b.dataset.heads = mode;
  b.title = HEAD_LABEL[mode];
  b.setAttribute('aria-label', HEAD_LABEL[mode]);
  b.style.cssText = 'font-size:16px; padding:2px 8px; line-height:1.2;';
  b.textContent = HEAD_SYMBOL[mode];
  b.onclick = () => actions.setHeads(mode);
  return b;
}

function syncToolbar(bar, state, history) {
  bar.querySelectorAll('.pc-draw-tool[data-tool]').forEach(b => {
    b.classList.toggle('active', state.mode === 'draw' && b.dataset.tool === state.tool);
  });
  const color = (DEFAULT_DRAW_STYLE.color || '').toLowerCase();
  const dot = bar.querySelector('.pc-draw-cur-color');
  if (dot) dot.style.background = DEFAULT_DRAW_STYLE.color;
  bar.querySelectorAll('.pc-draw-swatch[data-color]').forEach(b => { // 排除無 data-color 的自訂 swatch
    b.classList.toggle('active', b.dataset.color.toLowerCase() === color);
  });
  bar.querySelectorAll('.pc-draw-width').forEach(b => {
    b.classList.toggle('active', Number(b.dataset.width) === DEFAULT_DRAW_STYLE.strokeWidth);
  });
  bar.querySelectorAll('.pc-draw-fontsize').forEach(b => {
    b.classList.toggle('active', Number(b.dataset.fontSize) === DEFAULT_DRAW_STYLE.fontSize);
  });
  bar.querySelectorAll('.pc-draw-brush').forEach(b => {
    b.classList.toggle('active', state.tool === 'pencil' && b.dataset.brush === state.brushType);
  });
  const hasSel = state.selectedIds.length > 0;
  bar.querySelectorAll('.pc-draw-act').forEach(b => {
    const a = b.dataset.action;
    const enabled = a === 'undo' ? (history && history.canUndo()) : a === 'redo' ? (history && history.canRedo()) : hasSel;
    b.disabled = !enabled;
    b.classList.toggle('pc-draw-disabled', !enabled);
  });
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
      serverTimestamp, deleteDoc, doc, updateDoc, setDoc },
    { getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged },
  ] = await Promise.all([
    import(`${FB_BASE}/firebase-app.js`),
    import(`${FB_BASE}/firebase-firestore.js`),
    import(`${FB_BASE}/firebase-auth.js`),
  ]);
  return {
    initializeApp, getApps, getApp,
    getFirestore, collection, addDoc, onSnapshot, query, where,
    serverTimestamp, deleteDoc, doc, updateDoc, setDoc,
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

// 設定錯誤（如缺 projectId）時，除了 console 也在畫面右下角顯示明顯紅色 badge，
// 讓「忘了設定」在接上去當下就被看見，而不是事後才發現留言沒存。inline 樣式自帶（不靠 injectStyles）。
function showInitError(text) {
  const render = () => {
    if (document.getElementById('pc-init-error')) return;
    const b = document.createElement('div');
    b.id = 'pc-init-error';
    b.setAttribute('role', 'alert');
    b.textContent = '⚠ pc.js — ' + text;
    b.style.cssText = 'position:fixed;right:12px;bottom:12px;z-index:2147483647;'
      + 'background:#BA1A1A;color:#fff;font:600 12px/1.45 system-ui,-apple-system,sans-serif;'
      + 'padding:8px 12px;border-radius:6px;box-shadow:0 2px 10px rgba(0,0,0,.35);max-width:280px;';
    (document.body || document.documentElement).appendChild(b);
  };
  if (document.body) render();
  else document.addEventListener('DOMContentLoaded', render, { once: true });
}

// ─── Main Init ───────────────────────────────────────────────────────────────
export async function initPrototypeComments(opts = {}) {
  const {
    firebaseConfig,
    projectId,                  // 必填：每個原型專案一個唯一 id；留言依此分區（不再 fallback 到 'default'）
    getScreenId     = () => 'unknown',
    getMode         = () => 'design',
    designTarget    = '#phone',
    engNoteSelector = '.eng-note-row',
    navigateTo        = null,   // (screenId: string) => void  — consumer provides
    authBarTarget     = null,   // CSS selector for a flex header to inject auth bar into
    authBarCorner     = 'right', // 浮動 auth bar 貼哪個底角：'right'(預設) | 'left'。bar 仍「浮底」，
                                 //   只切左右——給「note/內容在右側、bar 會擋到」的版型把 bar 移到左下。
    scrollContainer   = null,   // CSS selector for scrollable body inside the phone frame
    clipToScrollContainer = false, // [ADD 2026-06-16] true → annotation 捲出 scrollContainer 可視範圍就隱藏
                                   //   （不夾邊緣）。給 live app 用：designTarget 是整個 #root、但實際
                                   //   捲動區只佔視窗一部分，annotation 捲出捲動區若不裁切會飄在 header 等處。
                                   //   截圖 flow 維持預設 false（annotation 夾在 phone frame 邊緣當指示器）。
    noteJump          = false,  // [ADD 2026-06-16] 「全部留言」清單點 note(規格)留言的行為：
                                //   false(預設,截圖版)→ inline 在面板內展開討論串（reliable）。
                                //   true(live overlay)→ 改成跳到該 note：關面板、(必要時)換頁、捲到
                                //   對應 .eng-note-row 並開它的討論串。因 note 在 React 抽屜(keepMounted
                                //   但視覺關閉)，跳轉前先 dispatch `pc:note-jump` 事件讓 consumer 開抽屜。
    _firebase         = null,   // 測試用：注入 in-memory firebase mock，略過 CDN load + 真 Firebase
  } = opts;

  if (!firebaseConfig && !_firebase) {
    console.error('[prototype-comments] firebaseConfig is required');
    return;
  }

  if (!projectId) {
    console.error('[prototype-comments] projectId is required — 每個原型專案需指定唯一 projectId（標註/留言依此分區，不再 fallback 到 default）');
    showInitError('缺少 projectId：留言系統未啟動（每個原型專案需指定唯一 projectId）');
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
  let annotationsVisible  = true;
  let unsub        = null;

  function toggleAnnotationsVisible() {
    annotationsVisible = !annotationsVisible;
    const overlay = document.getElementById('pc-overlay');
    if (overlay) overlay.classList.toggle('pc-annotations-hidden', !annotationsVisible);
    const btn = document.getElementById('pc-toggle-annotations');
    if (btn) btn.style.opacity = annotationsVisible ? '1' : '0.4';
  }

  // data state
  let comments    = [];
  let allComments = [];

  // scroll sync — re-attaches on every screen change because goto() replaces .body
  let _scrollEl = null;
  function refreshScrollEl() {
    if (!scrollContainer) return;
    // 熱路徑防呆：_scrollEl 可能已從 DOM 卸載（demo 導覽/路由重掛捲動容器）→ 視為失效先清掉，
    // 否則後續會讀到 detached 節點的舊 scrollTop，標註位置就跟著捲動飄走。
    if (_scrollEl && !document.contains(_scrollEl)) {
      _scrollEl.removeEventListener('scroll', renderAnnotations);
      _scrollEl = null;
    }
    const el = document.querySelector(scrollContainer);
    if (el === _scrollEl) return;
    if (_scrollEl) _scrollEl.removeEventListener('scroll', renderAnnotations);
    _scrollEl = el;
    if (_scrollEl) _scrollEl.addEventListener('scroll', renderAnnotations, { passive: true });
  }
  const getScrollTop = () => _scrollEl?.scrollTop ?? 0;

  // interaction state (UI lifecycle)
  const annotation   = { current: null };          // pendingAnnotation
  const pop   = { id: null, el: null };     // openPopoverId + popoverEl
  let movingAnnotationId = null;                   // id of annotation currently being relocated
  let isDragging  = false;                  // true while drag is in progress
  let dragAnnotationEl   = null;                   // DOM element being dragged
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

    const toggleAnnotationBtn = el('button', 'pc-comment-toggle');
    toggleAnnotationBtn.id = 'pc-toggle-annotations';
    toggleAnnotationBtn.title = '隱藏標註';
    toggleAnnotationBtn.style.padding = '6px 8px';
    toggleAnnotationBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>`;
    toggleAnnotationBtn.onclick = toggleAnnotationsVisible;
    bar.appendChild(toggleAnnotationBtn);

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
            <div class="pc-help-desc">點「Sign in with Google」用 Google 帳號登入後即可留言；未登入則只能瀏覽。</div>
          </div>
          <div class="pc-help-section">
            <div class="pc-help-title">📌 新增標註</div>
            <div class="pc-help-desc">點選「💬 留言模式」後，在畫面任意位置點一下放置標註，輸入留言後送出。</div>
          </div>
          <div class="pc-help-section">
            <div class="pc-help-title">↕️ 移動標註</div>
            <div class="pc-help-desc"><strong>長按標註約 0.5 秒</strong>進入拖曳模式，拖曳至新位置後放開即儲存。按 <kbd>ESC</kbd> 取消。超出畫面的標註會停靠在邊緣，同樣可長按拖曳。</div>
          </div>
          <div class="pc-help-section">
            <div class="pc-help-title">💬 查看與回覆</div>
            <div class="pc-help-desc">點選標註開啟留言串，可在底部直接回覆；輸入 <kbd>@</kbd> 可標記（提及）其他協作者。</div>
          </div>
          <div class="pc-help-section">
            <div class="pc-help-title">👍 表情回應</div>
            <div class="pc-help-desc">在留言上點 emoji 快速回應，再點一次取消；可看到誰按了。</div>
          </div>
          <div class="pc-help-section">
            <div class="pc-help-title">✏️ 編輯／刪除</div>
            <div class="pc-help-desc">自己的留言可「編輯」（會標示「已編輯」）或「刪除」；刪除主留言會一併刪掉整串。</div>
          </div>
          <div class="pc-help-section">
            <div class="pc-help-title">✓ 標記完成／取消</div>
            <div class="pc-help-desc">留言處理完點「✓ Resolve」，標註與對話框變灰表示已解決；任何同事都能再點「↩ 取消解決」還原。</div>
          </div>
          <div class="pc-help-section">
            <div class="pc-help-title">👁 隱藏標註</div>
            <div class="pc-help-desc">點選眼睛圖示切換所有標註的顯示狀態。</div>
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
      const side = authBarCorner === 'left' ? 'left:12px' : 'right:12px';
      wrap.style.cssText = 'position:fixed;bottom:64px;' + side + ';z-index:9000;background:#fff;border-radius:20px;box-shadow:0 2px 12px rgba(0,0,0,.15);padding:6px 10px;';
      document.body.appendChild(wrap);
    }
  }

  // ── Overlay & Positional Annotations ──────────────────────────────────────────────
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
      annotation.current = { x, y };
      console.log('[pc] overlay click → annotation.current set to', annotation.current);
      showInputPopover(e.clientX, e.clientY, null);
    });
  }

  function setCommentMode(active) {
    commentMode = active;
    const overlay = document.getElementById('pc-overlay');
    if (overlay) overlay.classList.toggle('active', active);
    const toggle = document.getElementById('pc-comment-toggle');
    if (toggle) toggle.classList.toggle('active', active);
    if (!active) { annotation.current = null; closeAllPopovers(); }
  }

  // ── Annotation Relocation (long-press + drag) ───────────────────────────────────
  async function finishMovingAnnotation(x, y) {
    if (!movingAnnotationId) return;
    const id = movingAnnotationId;
    movingAnnotationId = null;
    dragAnnotationEl = null;
    justDragged = true;
    setTimeout(() => { justDragged = false; }, 0);
    document.body.classList.remove('pc-dragging');
    // Optimistic update: apply x/y locally so any renderAnnotations() calls while
    // awaiting the Firestore round-trip show the annotation at the new position.
    const idx = comments.findIndex(c => c.id === id);
    if (idx !== -1) { comments[idx] = { ...comments[idx], x, y }; renderAnnotations(); }
    await store.update(id, { x, y });
  }

  function cancelMovingAnnotation() {
    if (!movingAnnotationId && !isDragging) return;
    movingAnnotationId = null;
    isDragging = false;
    dragAnnotationEl = null;
    document.body.classList.remove('pc-dragging');
    removeDragListeners();
    renderAnnotations();
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

  function moveAnnotationVisually(clientX, clientY) {
    if (!dragAnnotationEl) return;
    const overlay = document.getElementById('pc-overlay');
    if (!overlay) return;
    const rect = overlay.getBoundingClientRect();
    const scrollTop = getScrollTop();
    const overlayH = overlay.offsetHeight || 1;
    const x = (clientX - rect.left) / rect.width * 100;
    const y = (clientY - rect.top + scrollTop) / overlayH * 100;
    const visualY = y - (scrollTop / overlayH * 100);
    dragAnnotationEl.style.left = `${x}%`;
    dragAnnotationEl.style.top  = `${visualY}%`;
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
      moveAnnotationVisually(lastDragX, lastDragY);
    }, 16);
  }

  function clearAutoScroll() {
    if (autoScrollTimer) { clearInterval(autoScrollTimer); autoScrollTimer = null; }
    autoScrollDir = 0;
  }

  function onDragMove(e) {
    if (!isDragging) return;
    lastDragX = e.clientX; lastDragY = e.clientY;
    moveAnnotationVisually(e.clientX, e.clientY);
    checkAutoScroll(e.clientY);
  }
  function onDragMoveTouch(e) {
    if (!isDragging || !e.touches.length) return;
    e.preventDefault();
    lastDragX = e.touches[0].clientX; lastDragY = e.touches[0].clientY;
    moveAnnotationVisually(e.touches[0].clientX, e.touches[0].clientY);
    checkAutoScroll(e.touches[0].clientY);
  }

  function onDragEnd(e) {
    if (!isDragging) return;
    isDragging = false;
    removeDragListeners();
    const overlay = document.getElementById('pc-overlay');
    if (!overlay || !movingAnnotationId) { movingAnnotationId = null; dragAnnotationEl = null; document.body.classList.remove('pc-dragging'); return; }
    const rect = overlay.getBoundingClientRect();
    const scrollTop = getScrollTop();
    const overlayH = overlay.offsetHeight || 1;
    const x = parseFloat((Math.max(0, Math.min(100, (e.clientX - rect.left) / rect.width * 100))).toFixed(2));
    // y is not capped at 100 — when the phone body is scrolled, the stored y can
    // legitimately exceed 100% to represent content positions below the initial fold.
    const y = parseFloat((Math.max(0, (e.clientY - rect.top + scrollTop) / overlayH * 100)).toFixed(2));
    finishMovingAnnotation(x, y);
  }

  function onDragEndTouch(e) {
    if (!isDragging) return;
    isDragging = false;
    removeDragListeners();
    const t = e.changedTouches[0];
    const overlay = document.getElementById('pc-overlay');
    if (!overlay || !movingAnnotationId) { movingAnnotationId = null; dragAnnotationEl = null; document.body.classList.remove('pc-dragging'); return; }
    const rect = overlay.getBoundingClientRect();
    const scrollTop = getScrollTop();
    const overlayH = overlay.offsetHeight || 1;
    const x = parseFloat((Math.max(0, Math.min(100, (t.clientX - rect.left) / rect.width * 100))).toFixed(2));
    const y = parseFloat((Math.max(0, (t.clientY - rect.top + scrollTop) / overlayH * 100)).toFixed(2));
    finishMovingAnnotation(x, y);
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
    closeBtn.onclick = () => { annotation.current = null; closeAllPopovers(); };
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
    cancelBtn.onclick = () => { annotation.current = null; closeAllPopovers(); };
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
        x: annotation.current ? annotation.current.x : null,
        y: annotation.current ? annotation.current.y : null,
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

      console.log('[pc] save x=', data.x, 'y=', data.y, 'screenId=', data.screenId, 'annotation=', annotation.current);
      try {
        await store.save(data);
        console.log('[pc] save success');
      } catch(e) {
        console.error('[pc] save FAILED:', e.message, e.code);
      }
      annotation.current = null;
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
  // 決議（採用/不採用/待議）已從留言 overlay 移除，改只在 report.html 操作（使用者 2026-06-01）。
  // decision/decisionNote 仍是 Firestore 欄位，由 report 寫入；pc.js 不再顯示或編輯。
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
  // B5（#5 重設計）：顯示「誰按了某 emoji」純名單 popover。
  // 桌機 hover 觸發、手機長按觸發；toggle 自己的反應改由 chip 的 click/tap 處理（不放進此 popover）。
  function showReactionUsers(anchor, emoji, users, { dismissable = false } = {}) {
    document.querySelectorAll('.pc-reaction-users').forEach(p => p.remove());
    const pop = el('div', 'pc-reaction-users');
    const myUid = currentUser && currentUser.uid;
    users.forEach(u => {
      const row = el('div', 'pc-reaction-users-row');
      row.textContent = emoji + '  ' + u.name + (u.uid === myUid ? '（你）' : '');
      pop.appendChild(row);
    });
    const r = anchor.getBoundingClientRect();
    pop.style.left = Math.min(r.left, window.innerWidth - 230) + 'px';
    pop.style.top = (r.bottom + 4) + 'px';
    document.body.appendChild(pop);
    if (dismissable) {
      setTimeout(() => document.addEventListener('pointerdown', function h(ev) {
        if (!pop.contains(ev.target)) { pop.remove(); document.removeEventListener('pointerdown', h); }
      }), 0);
    }
    return pop;
  }
  // 桌機：hover chip 看名單、click toggle；手機：長按 chip 看名單、tap toggle。
  function bindReactionChip(chip, c, emoji, users, onReact) {
    const noHover = window.matchMedia && window.matchMedia('(hover: none)').matches;
    if (noHover) {
      let lpTimer = null, lpFired = false;
      chip.addEventListener('pointerdown', () => {
        lpFired = false;
        lpTimer = setTimeout(() => { lpFired = true; showReactionUsers(chip, emoji, users, { dismissable: true }); }, 400);
      });
      const cancelLp = () => { if (lpTimer) { clearTimeout(lpTimer); lpTimer = null; } };
      chip.addEventListener('pointerup', cancelLp);
      chip.addEventListener('pointercancel', cancelLp);
      chip.addEventListener('pointerleave', cancelLp);
      chip.onclick = (e) => {
        e.stopPropagation();
        if (lpFired) { lpFired = false; return; }   // 長按剛開名單 → 這次 tap 不 toggle
        toggleReaction(c, emoji, onReact);
      };
    } else {
      let hoverPop = null;
      chip.addEventListener('mouseenter', () => { hoverPop = showReactionUsers(chip, emoji, users); });
      chip.addEventListener('mouseleave', () => { if (hoverPop) { hoverPop.remove(); hoverPop = null; } });
      chip.onclick = (e) => {
        e.stopPropagation();
        if (hoverPop) { hoverPop.remove(); hoverPop = null; }
        toggleReaction(c, emoji, onReact);
      };
    }
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
      chip.title = users.map(u => u.name).join(', ');   // 原生 tooltip fallback
      if (onReact && myUid) bindReactionChip(chip, c, emoji, users, onReact);
      wrap.appendChild(chip);
    });
    if (onReact && myUid) {
      const add = el('button', 'pc-reaction-add'); add.textContent = '🙂'; add.title = '加表情';
      add.onclick = (e) => { e.stopPropagation(); showEmojiPicker(add, c, onReact); };
      wrap.appendChild(add);
    }
    return wrap;
  }

  // Resolve 開放給任何登入者（對齊 GitHub/GitLab：非留言作者限定）。
  // 寫入歸屬欄位 resolvedBy/resolvedByUid/resolvedAt，取消解決時清空。
  function resolvePayload(resolved) {
    return resolved
      ? { resolved: true, resolvedBy: currentUser?.displayName || currentUser?.email || '',
          resolvedByUid: currentUser?.uid || '', resolvedAt: fb.serverTimestamp() }
      : { resolved: false, resolvedBy: '', resolvedByUid: '', resolvedAt: null };
  }

  // Build a single comment item element with edit/delete/resolve actions
  function buildCommentItem(c, isRootComment, { onResolve, onDelete, onDeleteThread, onEdit, onReact, onReply, onUpdated, compact } = {}) {
    const item = el('div', 'pc-comment-item');

    if (!compact && c.authorPhoto) {
      const av = el('img', 'pc-ci-avatar', { src: c.authorPhoto, alt: '' });
      item.appendChild(av);
    }
    const bodyEl = el('div', 'pc-ci-body');
    let txtEl = null;
    // compact（全部留言 panel 的 inline 主留言）：略過頭像／作者／內容，只留 reactions＋操作，
    // 避免與上方 panel item 的作者＋摘要重複（使用者回饋：點開第一項不要又是主留言）。
    if (!compact) {
      const meta = el('div', 'pc-ci-meta');
      const an = el('span', 'pc-ci-author'); an.textContent = c.authorName;
      const at = el('span', 'pc-ci-time');
      at.textContent = timeAgo(c.createdAt) + (c.edited ? ' · 已編輯' : '');
      meta.appendChild(an); meta.appendChild(at);
      bodyEl.appendChild(meta);

      txtEl = el('p', 'pc-ci-text'); txtEl.innerHTML = linkify(c.body, peopleList().map(p => p.name));
      bodyEl.appendChild(txtEl);
    }

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
      if (c.resolved && c.resolvedBy) {
        const by = el('span', 'pc-ci-resolved-by');
        by.textContent = `由 ${c.resolvedBy} 解決`;
        acts.appendChild(by);
      }
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
      if (!compact) {
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
      }

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
    // 決議（採用/不採用/待議）已從留言 overlay 移除 → 只在 report.html 操作。

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
        onResolve: resolved => store.update(c.id, resolvePayload(resolved)),
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

  // ── Render Annotations ───────────────────────────────────────────────────────────
  function renderAnnotations() {
    const overlay = document.getElementById('pc-overlay');
    if (!overlay) { console.warn('[pc] renderAnnotations: overlay not found'); return; }
    refreshScrollEl();

    overlay.querySelectorAll('.pc-annotation').forEach(p => p.remove());
    const screenId = getScreenId();
    const positional = comments.filter(
      c => c.type === 'positional' && c.screenId === screenId && !c.parentId
        && c.x != null && c.y != null
    );
    console.log('[pc] renderAnnotations screenId=', screenId, 'total comments=', comments.length, 'positional this screen=', positional.length);

    positional.forEach((c) => {
      const threadCount = 1 + comments.filter(r => r.parentId === c.id).length;
      const scale = Math.min(1 + Math.log2(threadCount) * 0.3, 2.2).toFixed(2);

      const annotationEl = el('div', `pc-annotation${c.resolved ? ' resolved' : ''}`);
      annotationEl.dataset.commentId = c.id;
      const scrollTop = getScrollTop();
      const overlayH  = overlay.offsetHeight || 1;
      const visualY   = c.y - (scrollTop / overlayH * 100);
      // [ADD 2026-06-16] clipToScrollContainer：annotation 捲出 scrollContainer 可視範圍就整個隱藏（不夾邊緣）。
      // annotation 的視窗 Y = overlay 頂 + visualY% × overlayH；落在 scrollContainer rect 之外（上方被 header
      // 蓋住、或下方捲出）就 skip 不畫。找留言改用「全部留言」清單跳回。
      if (clipToScrollContainer && _scrollEl) {
        const scRect = _scrollEl.getBoundingClientRect();
        const oRect  = overlay.getBoundingClientRect();
        const annotationWinY = oRect.top + (visualY / 100) * overlayH;
        if (annotationWinY < scRect.top || annotationWinY > scRect.bottom) return; // 出可視區 → 不顯示
      }
      const safeMin   = 14 / overlayH * 100;
      const safeMax   = 100 - safeMin;
      const isEdge    = !clipToScrollContainer && (visualY < 0 || visualY > 100);
      const annotationVisualY = isEdge ? Math.max(safeMin, Math.min(safeMax, visualY)) : visualY;
      if (isEdge) annotationEl.classList.add('pc-annotation-edge', visualY < 0 ? 'pc-annotation-edge-top' : 'pc-annotation-edge-bottom');
      annotationEl.style.left = `${c.x}%`;
      annotationEl.style.top  = `${annotationVisualY}%`;
      annotationEl.style.setProperty('--pc-annotation-scale', scale);
      const label = el('span', 'pc-annotation-label');
      // 方案 C 對話泡：icon 放固定寬度框 → 💬(未解決)/✓(已解決) 同寬，兩種 annotation 尺寸一致
      label.innerHTML = '<span class="pc-annotation-ic">' + (c.resolved ? '✓' : '💬') + '</span>' + threadCount;
      annotationEl.appendChild(label);

      annotationEl.addEventListener('click', e => {
        e.stopPropagation();
        if (justDragged) return;
        if (pop.id === c.id) { closeAllPopovers(); return; }
        showThreadPopover(e.clientX, e.clientY, c.id);
      });

      // Long-press (500 ms) to enter drag mode — own unresolved annotations only.
      // 用 Pointer Events + setPointerCapture：游標脫離 annotation（hover 放大造成）也抓得住，
      // 不再因 mouseleave 取消長按。press 期間加 .pressing 停用 hover 放大穩住游標。
      if (currentUser && c.authorUid === currentUser.uid && !c.resolved) {
        let pressTimer = null;
        const startPress = () => {
          annotationEl.classList.add('pressing');
          pressTimer = setTimeout(() => {
            pressTimer = null;
            movingAnnotationId = c.id;
            isDragging = true;
            dragAnnotationEl = annotationEl;
            closeAllPopovers();
            annotationEl.classList.remove('pressing');
            annotationEl.classList.add('moving');
            document.body.classList.add('pc-dragging');
            addDragListeners();
          }, 500);
        };
        const cancelPress = () => {
          if (pressTimer) { clearTimeout(pressTimer); pressTimer = null; }
          annotationEl.classList.remove('pressing');
        };
        annotationEl.addEventListener('pointerdown', e => {
          if (e.button != null && e.button > 0) return;   // 僅主鍵 / 觸控
          e.preventDefault();
          try { annotationEl.setPointerCapture(e.pointerId); } catch (_) {}
          startPress();
        });
        annotationEl.addEventListener('pointerup', cancelPress);
        annotationEl.addEventListener('pointercancel', cancelPress);
        // press 階段（尚未進 drag）明顯移動 → 視為滑動，取消長按
        annotationEl.addEventListener('pointermove', e => {
          if (pressTimer && (Math.abs(e.movementX) > 4 || Math.abs(e.movementY) > 4)) cancelPress();
        });
      }

      overlay.appendChild(annotationEl);
    });
  }

  function showThreadPopover(clientX, clientY, commentId) {
    closeAllPopovers();
    pop.id = commentId;

    const rootC = comments.find(c => c.id === commentId);
    const popEl = el('div', 'pc-popover' + (rootC?.resolved ? ' resolved' : ''));
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
        // #4：回覆後保持 popover 開著（像對話 thread），清空輸入方便連續回覆。
        // 不再 closeAllPopovers()——snapshot handler 會自動把新回覆刷進 thread，
        // 這裡先本地 refresh 給即時回饋。
        ta.value = '';
        submitBtn.disabled = true;
        refreshThread();
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

      renderAnnotations();
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

  // Expand a note thread inside the panel. B10: root 的控制項（reactions／resolve／回覆／
  // 決議）放到 panel item 本身（最外層）；下方展開區只列「回覆（replies）」，不再把 root
  // 渲成一張獨立卡 → 解決「點開後第一則留言又出現一次」。
  // 控制項包一層 .pc-panel-root-ctrl：item.onclick 的 guard 會略過它，避免點 resolve／回覆／
  // 決議時誤觸發 item 的展開 toggle。
  function renderExpandedNote(item, root) {
    const key = root.noteKey;
    const all = allComments.filter(x => x.type === 'note' && x.noteKey === key);
    const replies = all.filter(x => x.parentId === root.id)
      .sort((a, b) => (a.createdAt?.toMillis?.() ?? 0) - (b.createdAt?.toMillis?.() ?? 0));
    const saveReply = body => store.save({
      type: 'note', screenId: root.screenId, noteKey: key, noteTag: root.noteTag, noteText: root.noteText,
      parentId: root.id, body,
      authorUid: currentUser.uid, authorName: currentUser.displayName || currentUser.email,
      authorPhoto: currentUser.photoURL || '', resolved: false,
    });

    const ctrl = el('div', 'pc-panel-root-ctrl');
    ctrl.appendChild(buildCommentItem(root, true, {
      compact: true,
      onResolve: r => store.update(root.id, resolvePayload(r)),
      onDelete:  () => store.remove(root.id),
      onDeleteThread: () => Promise.all(
        all.filter(x => x.id === root.id || x.parentId === root.id).map(t => store.remove(t.id))),
      onEdit:    b => store.update(root.id, { body: b, edited: true }),
      onReact:   r => store.update(root.id, { reactions: r }),
      onReply:   currentUser ? saveReply : null,
      onUpdated: renderPanel,
    }));
    item.appendChild(ctrl);

    if (replies.length) {
      const inline = el('div', 'pc-panel-inline-thread');
      const ind = el('div', 'pc-note-replies');
      replies.forEach(r => ind.appendChild(buildCommentItem(r, false, {
        onDelete: () => store.remove(r.id),
        onEdit:   b => store.update(r.id, { body: b, edited: true }),
        onReact:  rr => store.update(r.id, { reactions: rr }),
        // D1: replies 不可再回覆 — 不傳 onReply
        onUpdated: renderPanel,
      })));
      inline.appendChild(ind);
      item.appendChild(inline);
    }
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
    // Type filter: 標註 (positional annotations) vs 規格 (note comments)。tag 名稱按「留言貼在哪」命名，
    //   不綁「誰留的」——positional annotation=畫面上隨手標一點(標註)；note=針對規格說明清單某條(規格)。
    [['all', '全部項目'], ['design', '📍 標註'], ['eng', '📋 規格']].forEach(([t, label]) => {
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

    const annotationNums = {};
    [...allComments]
      .filter(c => !c.parentId && c.type === 'positional')
      .sort((a, b) => (a.createdAt?.toMillis?.() ?? 0) - (b.createdAt?.toMillis?.() ?? 0))
      .forEach(c => {
        if (!annotationNums[c.screenId]) annotationNums[c.screenId] = {};
        annotationNums[c.screenId][c.id] = Object.keys(annotationNums[c.screenId]).length + 1;
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
          // Note/eng comment 點擊行為：noteJump=false(截圖版) → inline 展開討論串(reliable)；
          //   noteJump=true(live overlay) → 跳到該 note（navigateToComment 會發 pc:note-jump 開抽屜）。
          item.onclick = (e) => {
            // 點最外層控制項(.pc-panel-root-ctrl) 或回覆區(.pc-panel-inline-thread) 內 → 不要 toggle 收合
            if (e.target.closest('.pc-panel-inline-thread, .pc-panel-root-ctrl')) return;
            if (noteJump) { navigateToComment(c); return; }
            panel.expandedNote = panel.expandedNote === c.noteKey ? null : c.noteKey;
            renderPanel();
          };
        } else {
          item.onclick = () => navigateToComment(c);
        }

        const topRow = el('div', 'pc-panel-top-row');
        const modeChip = el('span', 'pc-panel-chip');
        if (c.type === 'note') {
          modeChip.textContent = '📋 規格';
          modeChip.style.cssText = 'background:rgba(99,102,241,.12);color:#6366f1;';
        } else {
          modeChip.textContent = '📍 標註';
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
          if (annotationNums[c.screenId]?.[c.id]) {
            const num = el('span', 'pc-panel-num');
            num.textContent = `#${annotationNums[c.screenId][c.id]}`;
            topRow.appendChild(num);
          }
        }
        if (c.resolved) {
          const rb = el('span', 'pc-panel-resolved-badge');
          rb.textContent = c.resolvedBy ? `✓ ${c.resolvedBy} 已解決` : '✓ 已解決';
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

        // Inline-expanded note thread (B10: 控制項在 item 最外層、展開區只列回覆)
        if (c.type === 'note' && panel.expandedNote === c.noteKey) {
          renderExpandedNote(item, c);
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
      // [ADD 2026-06-16] live overlay：note 在 React 抽屜（keepMounted 但視覺關閉）。發事件讓
      //   consumer 開抽屜，pc.js 再捲到對應 row 並開討論串。截圖版用不到 noteJump（走 inline 展開），
      //   此分支不會被觸發，故只在 noteJump 時 dispatch。
      if (noteJump) {
        document.dispatchEvent(new CustomEvent('pc:note-jump', { detail: {
          screenId: comment.screenId, noteKey: comment.noteKey,
          noteTag: comment.noteTag, noteText: comment.noteText,
        } }));
      }
      // 找對應 .eng-note-row。開抽屜 + screen-change 重新注入(💬 按鈕)有時序，按鈕未必馬上在 →
      // 輪詢（最多 ~660ms）等 row 帶 .pc-note-comment-btn 後再捲動 + 開討論串。
      const findRow = () => {
        for (const row of document.querySelectorAll('[data-pc-injected]')) {
          if (noteKey(row.dataset.pcTag || '', row.dataset.pcText || '') === comment.noteKey) return row;
        }
        return null;
      };
      for (let i = 0; i < 11; i++) {
        const row = findRow();
        if (row && row.querySelector('.pc-note-comment-btn')) {
          row.scrollIntoView({ behavior: 'smooth', block: 'center' });
          const thread = row.nextElementSibling;
          const isOpen = thread?.classList.contains('pc-note-thread') && thread.classList.contains('open');
          if (!isOpen) row.querySelector('.pc-note-comment-btn')?.click(); // toggle：未開(含尚未建立)就開
          return;
        }
        await new Promise(r => setTimeout(r, 60));
      }
      return;
    }

    const overlay = document.getElementById('pc-overlay');
    if (overlay && comment.x != null) {
      // B6: 高亮該 annotation 讓留言「跳出來」（同頁無換頁動畫時的視覺回饋）
      const annotationEl = overlay.querySelector(`.pc-annotation[data-comment-id="${comment.id}"]`);
      if (annotationEl) {
        annotationEl.classList.remove('pc-annotation-flash');
        void annotationEl.offsetWidth;            // reflow → 重新觸發 animation
        annotationEl.classList.add('pc-annotation-flash');
        setTimeout(() => annotationEl.classList.remove('pc-annotation-flash'), 1300);
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
      renderAnnotations();
      noteModule.injectAll();
    }, 30);
    subscribe();
  });

  // ── Demo-end listener ──────────────────────────────────────────────────────
  // demo 導覽（react-joyride）會 scrollIntoView 捲動容器；關掉 demo 時 consumer dispatch
  // pc:demo-end → 重抓 scrollEl + 重錨標註，避免標註用到過時 scrollTop 跟著捲動飄走。
  document.addEventListener('pc:demo-end', () => {
    refreshScrollEl();
    renderAnnotations();
  });

  // ── 全域捲動防呆（不需 consumer 配合，純 pc.js 自癒）──────────────────────────
  // 用 capture 階段攔「任何元件」的捲動（含 demo 的 scrollIntoView、demo 關閉後捲動容器被
  // 換掉的情況）→ rAF throttle 後重算標註位置。renderAnnotations 內會 refreshScrollEl，
  // 偵測到舊 _scrollEl 已脫離 DOM 就重綁到新容器 → 標註不會在 demo 跑完關掉後跟著捲動飄走，
  // 即使 app 端沒 dispatch pc:demo-end（舊版 DemoMode）也能自動修正。
  let _scrollRaf = false;
  document.addEventListener('scroll', () => {
    if (_scrollRaf) return;
    _scrollRaf = true;
    requestAnimationFrame(() => { _scrollRaf = false; renderAnnotations(); });
  }, true);

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
      renderAnnotations();
    }
  });

  // ── Bootstrap ─────────────────────────────────────────────────────────────
  mountAuthBar();
  mountOverlay();

  subscribe();

  setTimeout(() => noteModule.injectAll(), 200);

  document.addEventListener('click', e => {
    if (pop.el && !pop.el.contains(e.target)) {
      const isAnnotation = e.target.closest('.pc-annotation');
      if (!isAnnotation) { annotation.current = null; closeAllPopovers(); }
    }
  });

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && (movingAnnotationId || isDragging)) cancelMovingAnnotation();
  });

  return {
    setCommentMode,
    getComments: () => comments,
    subscribe,
  };
}
