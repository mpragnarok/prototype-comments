/**
 * draw/render — 把繪圖物件渲染成 SVG（renderObject / 標籤 / 箭頭 marker），
 * 以及繪製過程的幾何小工具（toPxBox / initialGeom / updateGeom / isDrawn / findById）。
 * 由 draw-layer.js 的 render loop 呼叫；不持有 closure 狀態（一律吃參數）。
 */
import { DEFAULT_DRAW_STYLE, arrowHeads, brushStyle } from './constants.js';
import { diamondPoints, freehandPath, geomFromDrag, labelAnchor, pctToPx, taperedOutline } from './geometry.js';
import { drawSvgEl } from './dom.js';

// 把 % box 換成 px box（選取框 / marquee 繪製）。
export function toPxBox(b, rect) {
  return { x: pctToPx(b.x, rect.width), y: pctToPx(b.y, rect.height), w: pctToPx(b.w, rect.width), h: pctToPx(b.h, rect.height) };
}

export function findById(objects, id) { return objects.find(o => o.id === id); }

// ── 幾何（依工具，% 座標）──────────────────────────────────────────────────
export function initialGeom(tool, p) {
  if (tool === 'ellipse' || tool === 'rect' || tool === 'diamond') return { x: p.x, y: p.y, w: 0, h: 0 };
  if (tool === 'arrow' || tool === 'line') return { from: { ...p }, to: { ...p } };
  if (tool === 'pencil') return { points: [[p.x, p.y]] };
  return { x: p.x, y: p.y };
}
export function updateGeom(drag, p) {
  if (drag.tool === 'pencil') { drag.points.push([p.x, p.y]); return { points: drag.points.slice() }; }
  return geomFromDrag(drag.tool, drag.start, p);
}
// 判斷物件是否「真的畫了」（避免單點 click 留下空物件）。
export function isDrawn(o) {
  if (o.tool === 'ellipse' || o.tool === 'rect' || o.tool === 'diamond' || o.tool === 'image') return o.geom.w > 0.2 || o.geom.h > 0.2;
  if (o.tool === 'arrow' || o.tool === 'line') { const g = o.geom; return Math.abs(g.to.x - g.from.x) > 0.2 || Math.abs(g.to.y - g.from.y) > 0.2; }
  if (o.tool === 'pencil') return (o.geom.points || []).length > 1;
  return true; // text 由 input commit 控制
}

// ── render 一個 DrawObject → SVG 節點（% → px）──────────────────────────────
export function renderObject(o, rect, svg) {
  const s = o.style || DEFAULT_DRAW_STYLE;
  const stroke = { stroke: s.color, 'stroke-width': s.strokeWidth, fill: s.fill || 'none' };
  if (o.tool === 'comment') {
    // 指元件：被標注元件的虛線外框 + 左上角 💬+序號 角標。geom 已由 viewObject 重解析成元件 rect。
    const g = o.geom || { x: 0, y: 0, w: 0, h: 0 };
    const x = pctToPx(g.x, rect.width), y = pctToPx(g.y, rect.height);
    const w = pctToPx(g.w || 0, rect.width), h = pctToPx(g.h || 0, rect.height);
    const grp = drawSvgEl('g', { class: 'pc-draw-comment' });
    grp.appendChild(drawSvgEl('rect', {
      x, y, width: w, height: h, fill: 'none',
      stroke: s.color, 'stroke-width': s.strokeWidth, 'stroke-dasharray': '5 4', rx: 4,
    }));
    const badgeY = y >= 10 ? y - 5 : y + 13; // [fix4] 元件貼頂時 badge 畫在框內，防 y<0 裁切
    const badge = drawSvgEl('text', { x: x + 3, y: badgeY, fill: s.color, 'font-size': 13, 'font-weight': 700 });
    badge.textContent = '💬' + (o.seq || '');
    grp.appendChild(badge);
    return grp;
  }
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

export const LABEL_FONT_SIZE = 14;
export const LABEL_BG_PAD = 5; // 白底每邊外擴 px
// 綁定標籤 → <g>（含 <text>；line/arrow 另加白底 <rect> 把線蓋掉）。無 label 回 null。
// 白底先用估算尺寸（fallback），append 後由 sizeLabelBg() 量實際 text bbox 收緊到完全覆蓋。
export function renderLabel(o, rect) {
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
export function sizeLabelBg(g) {
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
export function buildArrowhead(svg) {
  svg.appendChild(drawSvgEl('defs'));
}

// 顏色 → 穩定的 marker id（只保留英數，確保是合法 id；保留 "arrowhead" 關鍵字）。
export function arrowMarkerId(color) {
  return 'pc-draw-arrowhead-' + String(color).replace(/[^a-z0-9]/gi, '');
}

// 確保該顏色的箭頭 marker 存在於 <defs>（path fill＝該色 → 箭頭跟著 stroke 變色）。回傳 id。
export function ensureArrowMarker(svg, color) {
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
