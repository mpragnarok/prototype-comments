/**
 * draw/dom — 建立 SVG／HTML 元素的小工具（draw 前綴避免 bundle 時與 index.js 同名 top-level 衝突）。
 * 由 render / toolbar / record-panel 與 draw-layer.js 共用。
 */
import { SVG_NS } from './constants.js';

// ── DOM helpers（draw 前綴避免 bundle 時與 index.js 同名 top-level 衝突）────────
export function drawSvgEl(tag, attrs = {}) {
  const n = document.createElementNS(SVG_NS, tag);
  Object.entries(attrs).forEach(([k, v]) => n.setAttribute(k, String(v)));
  return n;
}
export function drawHtmlEl(tag, cls) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  return n;
}
