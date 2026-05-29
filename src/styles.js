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

/* Comment Pin */
.pc-pin {
  position: absolute;
  width: 24px;
  height: 24px;
  border-radius: 50%;
  background: #0FA0A0;
  color: #fff;
  font-size: 11px;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  z-index: 210;
  box-shadow: 0 2px 8px rgba(15,160,160,.5), 0 0 0 2px #fff;
  transform: translate(-50%, -50%) scale(var(--pc-pin-scale, 1));
  transform-origin: center;
  transition: transform .15s, opacity .15s;
  pointer-events: all;
  font-family: monospace;
}
.pc-pin:hover { transform: translate(-50%, -50%) scale(calc(var(--pc-pin-scale, 1) * 1.2)); }
.pc-pin.resolved {
  background: #d1d5db;
  box-shadow: 0 0 0 2px #fff;
  opacity: .6;
}
.pc-pin-label { line-height: 1; }

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
  overflow-y: auto;
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
  #pc-auth-mobile-wrap #pc-panel-btn { display: none; }
  .pc-signin-text { display: none; }
  #pc-auth-mobile-wrap .pc-sign-in-btn { padding: 6px 8px; }
}
`;
