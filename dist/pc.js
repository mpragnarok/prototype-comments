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
 */

// ── 常數 ────────────────────────────────────────────────────────────────────
const DRAW_MODES = ['comment', 'draw', 'off'];
const DRAW_TOOLS = ['select', 'ellipse', 'arrow', 'pencil', 'text', 'rect', 'line'];
const DEFAULT_DRAW_STYLE = { color: '#E5484D', strokeWidth: 2, fill: 'none' };
const DRAW_COLORS = ['#E5484D', '#0066FF', '#F5A623', '#111111']; // red / blue / amber / black
const DRAW_STROKE_WIDTHS = [2, 4, 8];
const MIN_DRAW_SIZE_PCT = 1; // 縮放最小尺寸（% 座標）

const SVG_NS = 'http://www.w3.org/2000/svg';
const TOOL_LABELS = { select: '↖', ellipse: '◯', arrow: '↗', pencil: '✎', text: 'T', rect: '▭', line: '╱' };
const HANDLE_FIXED = { nw: 'se', ne: 'sw', se: 'nw', sw: 'ne' };

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

// 一次拖曳（起點 a、終點 b）→ 某工具的幾何（box 類 / 端點類）。pencil 另走累點邏輯。
function geomFromDrag(tool, a, b) {
  if (tool === 'ellipse' || tool === 'rect') return rectFromPoints(a, b);
  if (tool === 'arrow' || tool === 'line') return { from: { ...a }, to: { ...b } };
  return { x: b.x, y: b.y }; // text 等：落點即位置
}

// 任一物件 → 其 % bounding box（選取框 / 命中測試 / 縮放重映射用）。
function geomBBox(o) {
  const g = o.geom;
  if (o.tool === 'ellipse' || o.tool === 'rect') return { x: g.x, y: g.y, w: g.w, h: g.h };
  if (o.tool === 'arrow' || o.tool === 'line') return rectFromPoints(g.from, g.to);
  if (o.tool === 'pencil') {
    const xs = g.points.map(p => p[0]), ys = g.points.map(p => p[1]);
    const x = Math.min(...xs), y = Math.min(...ys);
    return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
  }
  const w = Math.max(4, (o.text ? o.text.length : 1) * 1.2); // text：估一個可命中的框
  return { x: g.x, y: g.y - 2.5, w, h: 3.5 };
}

// 平移物件幾何（移動）。回傳新 geom，不改入參。
function translateGeom(o, dx, dy) {
  const g = o.geom;
  if (o.tool === 'arrow' || o.tool === 'line')
    return { from: { x: g.from.x + dx, y: g.from.y + dy }, to: { x: g.to.x + dx, y: g.to.y + dy } };
  if (o.tool === 'pencil') return { points: g.points.map(([x, y]) => [x + dx, y + dy]) };
  if (o.tool === 'ellipse' || o.tool === 'rect') return { x: g.x + dx, y: g.y + dy, w: g.w, h: g.h };
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
  if (o.tool === 'ellipse' || o.tool === 'rect') return { x: newBox.x, y: newBox.y, w: newBox.w, h: newBox.h };
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
  return {
    color: style.color || DEFAULT_DRAW_STYLE.color,
    strokeWidth: style.strokeWidth ?? DEFAULT_DRAW_STYLE.strokeWidth,
    fill: style.fill || DEFAULT_DRAW_STYLE.fill,
  };
}

let _idSeq = 0;
function nextDrawId() { return 'd' + (++_idSeq); }

// 組裝一個 DrawObject（plan §4.2 子集：id/tool/geom/style[/text]）。
// z 由繪圖層在 commit 時依 DOM 順序戳上（stampZ），純函式不負責。
function makeDrawObject({ id, tool, geom, style, text } = {}) {
  const obj = { id: id || nextDrawId(), tool, geom, style: normalizeStyle(style) };
  if (text != null) obj.text = text;
  return obj;
}

// 精簡序列化（之後匯出給 AI 用）。z 若已戳上則一併輸出。
function serializeDrawObject(obj) {
  const out = { id: obj.id, tool: obj.tool, geom: obj.geom, style: obj.style };
  if (obj.text != null) out.text = obj.text;
  if (obj.z != null) out.z = obj.z;
  return out;
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
  width: 34px; height: 34px; border: none; border-radius: 8px; cursor: pointer;
  background: transparent; color: #e5e7eb; font-size: 16px; line-height: 1;
  display: flex; align-items: center; justify-content: center; transition: background .12s;
}
.pc-draw-tool:hover { background: #333; }
.pc-draw-tool.active { background: #0FA0A0; color: #fff; }
.pc-draw-sep { width: 1px; height: 22px; background: #3a3a3a; margin: 0 2px; }
.pc-draw-swatch {
  width: 20px; height: 20px; border-radius: 50%; padding: 0; cursor: pointer;
  border: 2px solid transparent;
}
.pc-draw-swatch.active { border-color: #fff; box-shadow: 0 0 0 1px #0FA0A0; }
.pc-draw-width {
  width: 30px; height: 30px; border: none; border-radius: 8px; cursor: pointer;
  background: transparent; display: flex; align-items: center; justify-content: center;
}
.pc-draw-width:hover { background: #333; }
.pc-draw-width.active { background: #0FA0A0; }
.pc-draw-disabled { opacity: .35; cursor: not-allowed; }
.pc-draw-text-input {
  position: absolute; z-index: 230; min-width: 80px; font: 14px system-ui, sans-serif;
  color: #E5484D; background: rgba(255,255,255,.92); border: 1px solid #E5484D;
  border-radius: 4px; padding: 2px 4px; outline: none;
}
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
    selectedId: null, // 目前選取物件 id
  };
  const history = makeUndoStack();
  let drag = null;    // 繪製中：{ tool, rect, start, points }
  const actions = { setMode, setTool, setColor, setStrokeWidth, act };
  const toolbar = buildToolbar(state, actions);
  document.body.appendChild(toolbar);

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
    setMode('draw'); // 任何工具（含 select）都進 draw → SVG 吃事件
  }

  function stampZ() { state.objects.forEach((o, i) => { o.z = i; }); }

  function render() {
    stampZ();
    while (svg.childNodes.length > 1) svg.removeChild(svg.lastChild); // 保留 <defs>
    const rect = { width: svg.clientWidth || host.clientWidth, height: svg.clientHeight || host.clientHeight };
    [...state.objects, state.draft].forEach(o => {
      if (!o) return;
      const node = renderObject(o, rect);
      node.setAttribute('data-id', o.id);
      svg.appendChild(node);
    });
    renderSelection(rect);
    syncToolbar(toolbar, state, history);
  }

  function renderSelection(rect) {
    if (!state.selectedId) return;
    const o = findById(state.objects, state.selectedId);
    if (!o) return;
    const b = geomBBox(o);
    const box = { x: pctToPx(b.x, rect.width), y: pctToPx(b.y, rect.height), w: pctToPx(b.w, rect.width), h: pctToPx(b.h, rect.height) };
    const g = drawSvgEl('g', { class: 'pc-draw-selection' });
    g.appendChild(drawSvgEl('rect', { x: box.x, y: box.y, width: box.w, height: box.h, fill: 'none', stroke: '#0FA0A0', 'stroke-width': 1, 'stroke-dasharray': '4 3', 'pointer-events': 'none' }));
    ['nw', 'ne', 'se', 'sw'].forEach(name => {
      const c = boxCorner(box, name);
      g.appendChild(drawSvgEl('rect', { x: c.x - 4, y: c.y - 4, width: 8, height: 8, fill: '#fff', stroke: '#0FA0A0', 'stroke-width': 1, 'data-handle': name }));
    });
    svg.appendChild(g);
  }

  // ── command 執行（apply＋push）/ undo / redo ─────────────────────────────────
  function runCommand(cmd) {
    state.objects = applyCommand(state.objects, cmd);
    history.push(cmd);
    if (cmd.type === 'create') state.selectedId = cmd.obj.id;
    render();
  }
  // 物件已即時改好（拖曳預覽），只補登歷史（不重複 apply）。
  function commitChange(id, before, after) {
    history.push({ type: 'update', id, before, after });
    render();
  }
  function doUndo() {
    const cmd = history.undo();
    if (!cmd) return;
    state.objects = invertCommand(state.objects, cmd);
    ensureSelectionValid();
    render();
  }
  function doRedo() {
    const cmd = history.redo();
    if (!cmd) return;
    state.objects = applyCommand(state.objects, cmd);
    ensureSelectionValid();
    render();
  }
  function ensureSelectionValid() {
    if (state.selectedId && !findById(state.objects, state.selectedId)) state.selectedId = null;
  }

  // ── z-order / 刪除 / style ──────────────────────────────────────────────────
  function zorder(op) {
    if (!state.selectedId) return;
    const before = state.objects.map(o => o.id);
    const after = reorderIds(before, state.selectedId, op);
    runCommand({ type: 'reorder', before, after });
  }
  function deleteSelected() {
    const o = findById(state.objects, state.selectedId);
    if (!o) return;
    const index = state.objects.indexOf(o);
    state.selectedId = null;
    runCommand({ type: 'delete', obj: o, index });
  }
  function setStyle(patch) {
    Object.assign(DEFAULT_DRAW_STYLE, patch); // 影響之後新物件
    const o = findById(state.objects, state.selectedId);
    if (!o) { render(); return; }
    const before = { style: { ...o.style } };
    o.style = { ...o.style, ...patch };
    commitChange(o.id, before, { style: { ...o.style } });
  }
  function setColor(c) { setStyle({ color: c }); }
  function setStrokeWidth(w) { setStyle({ strokeWidth: w }); }

  // toolbar 動作分派（z-order / 刪除 / undo-redo）。
  function act(action) {
    if (action === 'delete') return deleteSelected();
    if (action === 'undo') return doUndo();
    if (action === 'redo') return doRedo();
    return zorder(action); // front / back / forward / backward
  }

  // ── pointer：select 模式（選取 / 移動 / 縮放）─────────────────────────────────
  function onSelectDown(e) {
    const rect = svg.getBoundingClientRect();
    const handle = e.target && e.target.dataset ? e.target.dataset.handle : null;
    if (handle && state.selectedId) { startResize(e, handle, rect); return; }
    const p = clientToPct(e.clientX, e.clientY, rect);
    const hit = hitTest(p);
    state.selectedId = hit ? hit.id : null;
    render();
    if (hit) startMove(rect, p);
  }
  function hitTest(p) {
    for (let i = state.objects.length - 1; i >= 0; i--) {
      const b = geomBBox(state.objects[i]);
      const pad = 1.5;
      if (p.x >= b.x - pad && p.x <= b.x + b.w + pad && p.y >= b.y - pad && p.y <= b.y + b.h + pad)
        return state.objects[i];
    }
    return null;
  }
  function startMove(rect, startP) {
    const o = findById(state.objects, state.selectedId);
    if (!o) return;
    const before = o.geom;
    let moved = false;
    const onMv = ev => {
      const p = clientToPct(ev.clientX, ev.clientY, rect);
      o.geom = translateGeom({ tool: o.tool, geom: before }, p.x - startP.x, p.y - startP.y);
      moved = true;
      render();
    };
    const onUp = () => {
      window.removeEventListener('pointermove', onMv);
      window.removeEventListener('pointerup', onUp);
      if (moved) commitChange(o.id, { geom: before }, { geom: o.geom });
    };
    window.addEventListener('pointermove', onMv);
    window.addEventListener('pointerup', onUp);
  }
  function startResize(e, handle, rect) {
    const o = findById(state.objects, state.selectedId);
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

  // ── pointer：繪製模式（拖曳畫物件）────────────────────────────────────────────
  function onDown(e) {
    if (state.mode !== 'draw') return;
    if (state.tool === 'select') { onSelectDown(e); return; }
    e.preventDefault();
    state.selectedId = null;
    const rect = svg.getBoundingClientRect();
    if (state.tool === 'text') { startTextInput(e.clientX, e.clientY, rect); return; }
    const p = clientToPct(e.clientX, e.clientY, rect);
    drag = { tool: state.tool, rect, start: p, points: [[p.x, p.y]] };
    state.draft = makeDrawObject({ tool: state.tool, geom: initialGeom(state.tool, p), style: opts.style });
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  }
  function onMove(e) {
    if (!drag || !state.draft) return;
    const p = clientToPct(e.clientX, e.clientY, drag.rect);
    state.draft.geom = updateGeom(drag, p);
    render();
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
    if (d && isDrawn(d)) runCommand({ type: 'create', obj: d });
    else render();
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

  // ── 鍵盤：Delete/Backspace 刪除、Cmd/Ctrl+Z undo、Shift+Cmd/Ctrl+Z redo ────────
  function onKey(e) {
    if (state.mode !== 'draw') return;
    const tag = (e.target && e.target.tagName) || '';
    if (tag === 'INPUT' || tag === 'TEXTAREA' || (e.target && e.target.isContentEditable)) return;
    const meta = e.metaKey || e.ctrlKey;
    if (meta && (e.key === 'z' || e.key === 'Z')) {
      e.preventDefault();
      if (e.shiftKey) doRedo(); else doUndo();
      return;
    }
    if ((e.key === 'Delete' || e.key === 'Backspace') && state.selectedId) {
      e.preventDefault();
      deleteSelected();
    }
  }

  svg.addEventListener('pointerdown', onDown);
  window.addEventListener('resize', render);
  window.addEventListener('keydown', onKey);

  applyMode();
  render();

  return {
    svg, host,
    getMode: () => state.mode,
    setMode,
    getTool: () => state.tool,
    setTool,
    getObjects: () => { stampZ(); return state.objects.map(serializeDrawObject); },
    getSelected: () => state.selectedId,
    select: id => { state.selectedId = id; render(); },
    bringToFront: () => zorder('front'),
    sendToBack: () => zorder('back'),
    forward: () => zorder('forward'),
    backward: () => zorder('backward'),
    deleteSelected,
    undo: doUndo,
    redo: doRedo,
    setColor,
    setStrokeWidth,
    clear: () => { state.objects = []; state.draft = null; state.selectedId = null; render(); },
    destroy: () => {
      svg.remove(); toolbar.remove();
      window.removeEventListener('resize', render);
      window.removeEventListener('keydown', onKey);
    },
  };
}

function findById(objects, id) { return objects.find(o => o.id === id); }

// ── 幾何（依工具，% 座標）──────────────────────────────────────────────────
function initialGeom(tool, p) {
  if (tool === 'ellipse' || tool === 'rect') return { x: p.x, y: p.y, w: 0, h: 0 };
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
  if (o.tool === 'ellipse' || o.tool === 'rect') return o.geom.w > 0.2 || o.geom.h > 0.2;
  if (o.tool === 'arrow' || o.tool === 'line') { const g = o.geom; return Math.abs(g.to.x - g.from.x) > 0.2 || Math.abs(g.to.y - g.from.y) > 0.2; }
  if (o.tool === 'pencil') return (o.geom.points || []).length > 1;
  return true; // text 由 input commit 控制
}

// ── render 一個 DrawObject → SVG 節點（% → px）──────────────────────────────
function renderObject(o, rect) {
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
  if (o.tool === 'arrow' || o.tool === 'line') {
    const g = o.geom;
    const attrs = {
      x1: pctToPx(g.from.x, rect.width), y1: pctToPx(g.from.y, rect.height),
      x2: pctToPx(g.to.x, rect.width), y2: pctToPx(g.to.y, rect.height),
      stroke: s.color, 'stroke-width': s.strokeWidth, fill: 'none',
    };
    if (o.tool === 'arrow') attrs['marker-end'] = 'url(#pc-draw-arrowhead)';
    return drawSvgEl('line', attrs);
  }
  if (o.tool === 'pencil') {
    const pts = (o.geom.points || []).map(([x, y]) => `${pctToPx(x, rect.width)},${pctToPx(y, rect.height)}`).join(' ');
    return drawSvgEl('polyline', { points: pts, stroke: s.color, 'stroke-width': s.strokeWidth, fill: 'none', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' });
  }
  const t = drawSvgEl('text', { x: pctToPx(o.geom.x, rect.width), y: pctToPx(o.geom.y, rect.height), fill: s.color, 'font-size': 14, 'font-family': 'system-ui, sans-serif' });
  t.textContent = o.text || '';
  return t;
}

function buildArrowhead(svg) {
  const defs = drawSvgEl('defs');
  const marker = drawSvgEl('marker', { id: 'pc-draw-arrowhead', viewBox: '0 0 10 10', refX: 8, refY: 5, markerWidth: 7, markerHeight: 7, orient: 'auto-start-reverse' });
  marker.appendChild(drawSvgEl('path', { d: 'M0,0 L10,5 L0,10 z', fill: '#E5484D' }));
  defs.appendChild(marker);
  svg.appendChild(defs);
}

// ── 工具列 UI ───────────────────────────────────────────────────────────────
function buildToolbar(state, actions) {
  const bar = drawHtmlEl('div', 'pc-draw-toolbar');
  bar.id = 'pc-draw-toolbar';
  DRAW_TOOLS.forEach(tool => bar.appendChild(toolButton(tool, actions)));
  appendSep(bar);
  DRAW_COLORS.forEach(color => bar.appendChild(swatchButton(color, actions)));
  appendSep(bar);
  DRAW_STROKE_WIDTHS.forEach(w => bar.appendChild(widthButton(w, actions)));
  appendSep(bar);
  [['front', '⤒'], ['forward', '↑'], ['backward', '↓'], ['back', '⤓'], ['delete', '🗑']]
    .forEach(([a, l]) => bar.appendChild(actButton(a, l, actions)));
  appendSep(bar);
  [['undo', '⟲'], ['redo', '⟳']].forEach(([a, l]) => bar.appendChild(actButton(a, l, actions)));
  appendSep(bar);
  const off = drawHtmlEl('button', 'pc-draw-tool');
  off.dataset.tool = 'off';
  off.title = '結束繪圖（放行 app 點擊）';
  off.textContent = '✕';
  off.onclick = () => actions.setMode('off');
  bar.appendChild(off);
  return bar;
}
function appendSep(bar) { bar.appendChild(drawHtmlEl('div', 'pc-draw-sep')); }
function toolButton(tool, actions) {
  const b = drawHtmlEl('button', 'pc-draw-tool');
  b.dataset.tool = tool;
  b.title = tool;
  b.textContent = TOOL_LABELS[tool] || tool;
  b.onclick = () => actions.setTool(tool);
  return b;
}
function swatchButton(color, actions) {
  const b = drawHtmlEl('button', 'pc-draw-swatch');
  b.dataset.color = color;
  b.style.background = color;
  b.title = color;
  b.onclick = () => actions.setColor(color);
  return b;
}
function widthButton(w, actions) {
  const b = drawHtmlEl('button', 'pc-draw-width');
  b.dataset.width = w;
  b.title = w + 'px';
  const dot = drawHtmlEl('span');
  dot.style.cssText = `display:block;width:16px;height:${Math.min(w, 8)}px;border-radius:4px;background:#e5e7eb;`;
  b.appendChild(dot);
  b.onclick = () => actions.setStrokeWidth(w);
  return b;
}
function actButton(action, label, actions) {
  const b = drawHtmlEl('button', 'pc-draw-tool pc-draw-act');
  b.dataset.action = action;
  b.title = action;
  b.textContent = label;
  b.onclick = () => actions.act(action);
  return b;
}

function syncToolbar(bar, state, history) {
  bar.querySelectorAll('.pc-draw-tool[data-tool]').forEach(b => {
    b.classList.toggle('active', state.mode === 'draw' && b.dataset.tool === state.tool);
  });
  const color = (DEFAULT_DRAW_STYLE.color || '').toLowerCase();
  bar.querySelectorAll('.pc-draw-swatch').forEach(b => {
    b.classList.toggle('active', b.dataset.color.toLowerCase() === color);
  });
  bar.querySelectorAll('.pc-draw-width').forEach(b => {
    b.classList.toggle('active', Number(b.dataset.width) === DEFAULT_DRAW_STYLE.strokeWidth);
  });
  const hasSel = !!state.selectedId;
  bar.querySelectorAll('[data-action]').forEach(b => {
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
