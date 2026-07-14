/**
 * draw/toolbar — 浮動工具列與所有 popover 選單 DOM（工具鈕/筆刷/顏色/線粗/字級/箭頭端點/
 * 右鍵選單）、工具列狀態同步（syncToolbar / setMenuEnabled）與使用說明。皆吃 state/actions 參數，
 * 不持有 closure 狀態。由 draw-layer.js 建構工具列時呼叫。
 */
import { icon, TOOL_KEY, TOOL_LABELS_ZH, TOOL_SHORTCUTS, BRUSH_LABELS, BRUSH_ICON, DRAW_BRUSHES, DRAW_COLORS, DRAW_UI_COLORS, DRAW_STROKE_WIDTHS, DRAW_FONT_SIZES, DRAW_HEAD_MODES, DEFAULT_DRAW_STYLE } from './constants.js';
import { drawHtmlEl } from './dom.js';
import { eyedropperSupported } from './model.js';

// ── 工具列 UI（Material 圖示 + 顏色/線粗 popover）────────────────────────────
// 工具列上的工具排序（Excalidraw 數字順序）；pencil 槽位用 3 個筆刷取代（無獨立鉛筆鈕）。
export const TOOLBAR_TOOL_ORDER = ['select', 'rect', 'diamond', 'ellipse', 'arrow', 'line', 'pencil', 'text'];
export function buildToolbar(state, actions, opts = {}) {
  const bar = drawHtmlEl('div', 'pc-draw-toolbar');
  bar.id = 'pc-draw-toolbar';
  // 1 select · 2 rect · 3 diamond · 4 ellipse · 5 arrow · 6 line · 7 [pen marker highlighter] · 8 text
  TOOLBAR_TOOL_ORDER.forEach(tool => {
    if (tool === 'pencil') DRAW_BRUSHES.forEach(t => { bar.appendChild(brushButton(t, actions)); }); // 7：筆刷群＝自由筆
    else bar.appendChild(toolButton(tool, actions));
  });
  appendSep(bar);
  bar.appendChild(noteButton(actions)); // 註記模式切換（畫圖層放行 → 底下 pc.js 釘選留言接手）
  appendSep(bar);
  bar.appendChild(colorMenu(actions));
  bar.appendChild(widthMenu(actions));
  bar.appendChild(fontSizeMenu(actions));
  bar.appendChild(headsMenu(actions));
  appendSep(bar);
  bar.appendChild(actButton('delete', actions)); // 刪除（z-order 已移到右鍵選單）
  appendSep(bar);
  ['undo', 'redo'].forEach(a => { bar.appendChild(actButton(a, actions)); });
  appendSep(bar);
  const send = drawHtmlEl('button', 'pc-draw-tool pc-draw-send');
  send.dataset.action = 'send';
  send.title = '標注紀錄／送給 AI';
  send.setAttribute('aria-label', '標注紀錄／送給 AI');
  send.innerHTML = icon('send');
  send.onclick = () => actions.openRecord();
  bar.appendChild(send);
  appendSep(bar);
  const help = drawHtmlEl('button', 'pc-draw-tool pc-draw-help-btn');
  help.dataset.action = 'help';
  help.title = '快捷鍵與使用說明';
  help.setAttribute('aria-label', '快捷鍵與使用說明');
  help.innerHTML = icon('help');
  help.onclick = () => openDrawHelp(opts);
  bar.appendChild(help);
  appendSep(bar);
  const off = drawHtmlEl('button', 'pc-draw-tool');
  off.dataset.tool = 'off';
  off.title = '收合工具列（放行 app 點擊）';
  off.setAttribute('aria-label', '收合工具列');
  off.innerHTML = icon('close');
  off.onclick = () => actions.collapse();
  bar.appendChild(off);
  return bar;
}
export function appendSep(bar) { bar.appendChild(drawHtmlEl('div', 'pc-draw-sep')); }

// 預設教學手冊（可由 initDrawLayer 的 opts.helpUrl 覆寫）。
export const DRAW_HELP_URL = 'https://github.com/mpragnarok/prototype-comments#readme';
// 工具列「?」說明 modal：列出每個工具的字母快捷鍵 + 其他操作 + 標注紀錄用法 + 手冊連結。
export function openDrawHelp(opts = {}) {
  if (document.getElementById('pc-draw-help-modal')) return;
  const url = opts.helpUrl || DRAW_HELP_URL;
  const toolRows = [...TOOLBAR_TOOL_ORDER, 'eyedropper', 'comment']
    .map(t => {
      const name = t === 'eyedropper' ? '取色（吸管）' : t === 'comment' ? '註記模式' : (TOOL_LABELS_ZH[t] || t);
      const key = t === 'eyedropper' ? 'I' : t === 'comment' ? 'C' : shortcutBadge(t);
      return `<div class="pc-draw-help-row"><span>${name}</span><kbd>${key}</kbd></div>`;
    }).join('');
  const modal = drawHtmlEl('div', 'pc-draw-help-modal');
  modal.id = 'pc-draw-help-modal';
  modal.innerHTML = `
    <div class="pc-draw-help-box">
      <div class="pc-draw-help-hd">
        <span>標注工具使用說明</span>
        <button class="pc-draw-help-x" aria-label="關閉">✕</button>
      </div>
      <div class="pc-draw-help-body">
        <div class="pc-draw-help-sec-t">⌨️ 工具快捷鍵</div>
        <div class="pc-draw-help-grid">${toolRows}</div>
        <div class="pc-draw-help-sec-t">🛠 其他操作</div>
        <div class="pc-draw-help-row"><span>復原／重做</span><kbd>⌘Z / ⇧⌘Z</kbd></div>
        <div class="pc-draw-help-row"><span>群組／解散</span><kbd>⌘G / ⇧⌘G</kbd></div>
        <div class="pc-draw-help-row"><span>刪除選取</span><kbd>Delete</kbd></div>
        <div class="pc-draw-help-sec-t">📋 標注紀錄</div>
        <div class="pc-draw-help-desc">點工具列的 ➤ 圖示開啟「標注紀錄」抽屜，勾選要送出的標注，按「送給 AI」一次送出給 AI 處理。</div>
        <a class="pc-draw-help-link" href="${url}" target="_blank" rel="noopener">📖 開啟完整教學手冊 →</a>
      </div>
    </div>`;
  const close = () => modal.remove();
  modal.querySelector('.pc-draw-help-x').onclick = close;
  modal.addEventListener('click', e => { if (e.target === modal) close(); });
  document.body.appendChild(modal);
}
// 工具的數字快捷鍵（取自 TOOL_SHORTCUTS 單一真相）。
export function toolNumberKey(tool) {
  return Object.keys(TOOL_SHORTCUTS).find(k => /^[0-9]$/.test(k) && TOOL_SHORTCUTS[k] === tool) || '';
}
// 徽章文字＝數字 + 字母（兩種按鍵都有效，一起顯示提示，例：「2 R」）。
export function shortcutBadge(tool) {
  return [toolNumberKey(tool), TOOL_KEY[tool]].filter(Boolean).join(' ');
}
export function toolButton(tool, actions) {
  const b = drawHtmlEl('button', 'pc-draw-tool');
  b.dataset.tool = tool;
  const key = TOOL_KEY[tool];
  const label = (TOOL_LABELS_ZH[tool] || tool) + (key ? ` (${key})` : '');
  b.title = label;                       // tooltip 含字母快捷鍵，供探索
  b.setAttribute('aria-label', label);
  const badge = toolNumberKey(tool);
  b.innerHTML = icon(tool) + (badge ? `<span class="pc-draw-kbd" aria-hidden="true">${badge}</span>` : ''); // 常駐數字快捷鍵徽章（字母仍可按，列在 ? 說明）
  b.onclick = () => actions.setTool(tool);
  return b;
}
// 留言模式切換鈕：非繪圖工具，故用 data-mode（不被 setTool 的 data-tool 邏輯清掉）。
// 點擊在 draw ⇌ comment 間切；comment 時畫圖層放行，讓底下 pc.js 釘選留言系統接手（同 lavish）。
export function noteButton(actions) {
  const b = drawHtmlEl('button', 'pc-draw-tool pc-draw-note');
  b.dataset.mode = 'note';
  b.title = '註記模式 (C)';
  b.setAttribute('aria-label', '註記模式');
  b.innerHTML = icon('comment') + '<span class="pc-draw-kbd" aria-hidden="true">C</span>';
  b.onclick = () => actions.toggleNote();
  return b;
}
export function actButton(action, actions) {
  const b = drawHtmlEl('button', 'pc-draw-tool pc-draw-act');
  b.dataset.action = action;
  b.title = action;
  b.setAttribute('aria-label', action);
  b.innerHTML = icon(action);
  b.onclick = () => actions.act(action);
  return b;
}
export function brushButton(type, actions) {
  const b = drawHtmlEl('button', 'pc-draw-tool pc-draw-brush');
  b.dataset.brush = type;
  b.title = BRUSH_LABELS[type] + (type === 'pen' ? ' (P)' : ''); // pen 是自由筆主鍵
  b.setAttribute('aria-label', BRUSH_LABELS[type]);
  const badge = type === 'pen' ? toolNumberKey('pencil') : ''; // 徽章「7」只放在 pen（自由筆代表）
  b.innerHTML = icon(BRUSH_ICON[type]) + (badge ? `<span class="pc-draw-kbd" aria-hidden="true">${badge}</span>` : '');
  b.onclick = () => actions.setBrush(type);
  return b;
}

// 右鍵 context menu：z-order + 刪除，作用於目前選取集合。
export const CTX_SYM = { group: '⧉', ungroup: '⊟' }; // 群組/解散沒有 icon → 用符號
export function buildContextMenu(actions) {
  const menu = drawHtmlEl('div', 'pc-draw-context');
  menu.id = 'pc-draw-context';
  [['front', '置頂'], ['forward', '上移一層'], ['backward', '下移一層'], ['back', '置底'],
    ['group', '群組'], ['ungroup', '解散群組'], ['delete', '刪除']]
    .forEach(([action, label]) => {
      const item = drawHtmlEl('button', 'pc-draw-context-item');
      item.dataset.action = action;
      item.setAttribute('aria-label', label);
      const head = CTX_SYM[action] ? `<span style="display:inline-block;width:18px;text-align:center;font-size:15px">${CTX_SYM[action]}</span>` : icon(action, 18);
      item.innerHTML = head + `<span>${label}</span>`;
      item.onclick = () => { actions.act(action); actions.closeContext(); };
      menu.appendChild(item);
    });
  return menu;
}

// 顏色 popover：8 預設色 swatch ＋ <input type=color> 自訂任意 hex。
export function colorMenu(actions) {
  const wrap = drawHtmlEl('div', 'pc-draw-menu');
  const trigger = drawHtmlEl('button', 'pc-draw-tool pc-draw-trigger');
  trigger.dataset.action = 'color-menu';
  trigger.title = '顏色';
  trigger.setAttribute('aria-label', '顏色');
  trigger.appendChild(drawHtmlEl('span', 'pc-draw-cur-color'));
  trigger.onclick = () => togglePopover(wrap);
  const pop = drawHtmlEl('div', 'pc-draw-popover');
  pop.dataset.menu = 'color';
  DRAW_COLORS.forEach(c => { pop.appendChild(swatchButton(c, actions)); });
  pop.appendChild(customSwatch(actions)); // 第 9 顆：自訂調色盤
  pop.appendChild(eyedropperButton(actions)); // 吸管取樣
  wrap.appendChild(trigger);
  wrap.appendChild(pop);
  return wrap;
}
// 吸管：取樣畫面上任意顏色（瀏覽器 EyeDropper API）。不支援時隱藏，不報錯。
export function eyedropperButton(actions) {
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
export function customSwatch(actions) {
  const label = drawHtmlEl('label', 'pc-draw-swatch pc-draw-custom-swatch');
  label.title = '自訂顏色';
  label.setAttribute('aria-label', '自訂顏色');
  const custom = drawHtmlEl('input', 'pc-draw-color-custom');
  custom.type = 'color';
  custom.setAttribute('aria-label', '自訂顏色');
  custom.dataset.action = 'custom-color';
  custom.addEventListener('input', () => actions.setColor(custom.value));
  custom.addEventListener('change', () => closeMenuOf(custom)); // 選色完成（picker 關閉）→ 收 popover
  label.appendChild(custom);
  return label;
}
// 線粗 popover：thin → bold 的遞增粗條。
export function widthMenu(actions) {
  const wrap = drawHtmlEl('div', 'pc-draw-menu');
  const trigger = drawHtmlEl('button', 'pc-draw-tool pc-draw-trigger');
  trigger.dataset.action = 'width-menu';
  trigger.title = '線粗';
  trigger.setAttribute('aria-label', '線粗');
  trigger.innerHTML = icon('lineWeight');
  trigger.onclick = () => togglePopover(wrap);
  const pop = drawHtmlEl('div', 'pc-draw-popover pc-draw-popover-width');
  pop.dataset.menu = 'width';
  DRAW_STROKE_WIDTHS.forEach(w => { pop.appendChild(widthButton(w, actions)); });
  wrap.appendChild(trigger);
  wrap.appendChild(pop);
  return wrap;
}
export function togglePopover(wrap) {
  const bar = wrap.closest('.pc-draw-toolbar');
  if (bar) bar.querySelectorAll('.pc-draw-menu.open').forEach(m => { if (m !== wrap) m.classList.remove('open'); });
  wrap.classList.toggle('open');
}
// 選完選項即關閉所屬 popover（避免選完粗細/顏色 popover 一直浮現）。
export function closeMenuOf(btn) {
  const m = btn.closest('.pc-draw-menu');
  if (m) m.classList.remove('open');
}
export function swatchButton(color, actions) {
  const b = drawHtmlEl('button', 'pc-draw-swatch');
  b.dataset.color = color;
  b.style.background = color;
  b.title = color;
  b.setAttribute('aria-label', color);
  b.onclick = () => { actions.setColor(color); closeMenuOf(b); };
  return b;
}
export function widthButton(w, actions) {
  const b = drawHtmlEl('button', 'pc-draw-width');
  b.dataset.width = w;
  b.title = w + 'px';
  b.setAttribute('aria-label', w + 'px');
  const dot = drawHtmlEl('span');
  dot.style.cssText = `display:block;width:18px;height:${Math.min(w, 10)}px;border-radius:4px;background:${DRAW_UI_COLORS.onDark};`;
  b.appendChild(dot);
  b.onclick = () => { actions.setStrokeWidth(w); closeMenuOf(b); };
  return b;
}
// 字體大小 popover：用標本文字大小直觀呈現各選項。
export function fontSizeMenu(actions) {
  const wrap = drawHtmlEl('div', 'pc-draw-menu');
  const trigger = drawHtmlEl('button', 'pc-draw-tool pc-draw-trigger');
  trigger.dataset.action = 'fontsize-menu';
  trigger.title = '字體大小';
  trigger.setAttribute('aria-label', '字體大小');
  trigger.innerHTML = icon('text');
  trigger.onclick = () => togglePopover(wrap);
  const pop = drawHtmlEl('div', 'pc-draw-popover pc-draw-popover-fontsize');
  pop.dataset.menu = 'fontsize';
  DRAW_FONT_SIZES.forEach(sz => { pop.appendChild(fontSizeButton(sz, actions)); });
  wrap.appendChild(trigger);
  wrap.appendChild(pop);
  return wrap;
}
export function fontSizeButton(sz, actions) {
  const b = drawHtmlEl('button', 'pc-draw-fontsize');
  b.dataset.fontSize = sz;
  b.title = sz + 'px';
  b.setAttribute('aria-label', sz + 'px');
  b.style.cssText = `font-size:${Math.max(sz, 10)}px; padding:1px 6px; line-height:1.3; font-family:system-ui,sans-serif;`;
  b.textContent = 'A';
  b.onclick = () => { actions.setFontSize(sz); closeMenuOf(b); };
  return b;
}

export const HEAD_SYMBOL = { none: '—', end: '→', start: '←', both: '↔' };
export const HEAD_LABEL = { none: '無箭頭', end: '終點箭頭', start: '起點箭頭', both: '雙向箭頭' };
// 端點箭頭 popover：line/arrow 選無/終點/起點/雙向（雙向＝雙箭頭）。
export function headsMenu(actions) {
  const wrap = drawHtmlEl('div', 'pc-draw-menu');
  const trigger = drawHtmlEl('button', 'pc-draw-tool pc-draw-trigger');
  trigger.dataset.action = 'heads-menu';
  trigger.title = '端點箭頭（單／雙向）';
  trigger.setAttribute('aria-label', '端點箭頭');
  trigger.textContent = '↔';
  trigger.onclick = () => togglePopover(wrap);
  const pop = drawHtmlEl('div', 'pc-draw-popover pc-draw-popover-heads');
  pop.dataset.menu = 'heads';
  DRAW_HEAD_MODES.forEach(m => { pop.appendChild(headsButton(m, actions)); });
  wrap.appendChild(trigger);
  wrap.appendChild(pop);
  return wrap;
}
export function headsButton(mode, actions) {
  const b = drawHtmlEl('button', 'pc-draw-heads');
  b.dataset.heads = mode;
  b.title = HEAD_LABEL[mode];
  b.setAttribute('aria-label', HEAD_LABEL[mode]);
  b.style.cssText = 'font-size:16px; padding:2px 8px; line-height:1.2;';
  b.textContent = HEAD_SYMBOL[mode];
  b.onclick = () => { actions.setHeads(mode); closeMenuOf(b); };
  return b;
}

export function syncToolbar(bar, state, history) {
  bar.querySelectorAll('.pc-draw-tool[data-tool]').forEach(b => {
    b.classList.toggle('active', state.mode === 'draw' && b.dataset.tool === state.tool);
  });
  const commentBtn = bar.querySelector('.pc-draw-note');
  if (commentBtn) commentBtn.classList.toggle('active', state.mode === 'note'); // 註記模式 → 高亮
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
  // 依「目前作用對象」(有選取→選取物件；否則→目前工具) 切換各選項菜單可用性：
  //   字級僅 text 適用；端點箭頭僅 line/arrow；線粗對純 text 無意義。
  const selTools = state.selectedIds
    .map(id => { const o = (state.objects || []).find(x => x.id === id); return o && o.tool; })
    .filter(Boolean);
  const targets = selTools.length ? selTools : [state.tool];
  const anyText = targets.includes('text');
  const allText = targets.every(t => t === 'text');
  const anyLineArrow = targets.some(t => t === 'arrow' || t === 'line');
  setMenuEnabled(bar, 'fontsize-menu', anyText);      // 字級：只有 text
  setMenuEnabled(bar, 'heads-menu', anyLineArrow);    // 端點箭頭：只有 line/arrow
  setMenuEnabled(bar, 'width-menu', !allText);        // 線粗：純 text 不適用
}
// 切換某個選項菜單 trigger 的可用性；disable 時順手收掉它的 popover。
export function setMenuEnabled(bar, action, enabled) {
  const t = bar.querySelector(`.pc-draw-trigger[data-action="${action}"]`);
  if (!t) return;
  t.disabled = !enabled;
  t.classList.toggle('pc-draw-disabled', !enabled);
  if (!enabled) { const m = t.closest('.pc-draw-menu'); if (m) m.classList.remove('open'); }
}
