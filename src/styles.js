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
  cursor: crosshair;
}
/* Pins inside overlay are always clickable regardless of overlay state */
.pc-overlay .pc-pin {
  pointer-events: all !important;
  cursor: pointer;
}

/* Comment Pin */
.pc-pin {
  position: absolute;
  transform: translate(-50%, -50%);
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
  transition: transform .15s, opacity .15s;
  pointer-events: all;
  font-family: monospace;
}
.pc-pin:hover { transform: translate(-50%, -50%) scale(1.2); }
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
  display: none;
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
  transition: color .15s;
}
.pc-note-comment-btn:hover { color: #0FA0A0; }
.eng-note-row:hover .pc-note-comment-btn,
.dev-note-v2:hover .pc-note-comment-btn { display: flex; }
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
`;
