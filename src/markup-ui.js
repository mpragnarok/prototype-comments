/**
 * markup-ui —— 「點選元素標記」的顯示層：框、標籤、標注紀錄抽屜、輸入卡。
 *
 * 與資料來源解耦：這裡只認一個 mark 陣列與幾個 callback，不碰 Firebase。
 * 視覺語言刻意沿用 draw layer（accent #635a8f、右側抽屜、白底列項），
 * 因為使用者在同一批頁面上會同時看到兩者，長得不一樣會像兩個工具。
 */
const ACCENT = '#635a8f';
const ACCENT_STRONG = '#4f4775';
const DONE = '#0d7a4f';
const Z = 2147482000;

export const MARKUP_STYLES = `
.em-hover{position:absolute;pointer-events:none;z-index:${Z};border:2px solid ${ACCENT};border-radius:5px;
  background:rgba(99,90,143,.07);transition:top .06s,left .06s,width .06s,height .06s}
.em-box{position:absolute;pointer-events:none;z-index:${Z + 100};border:2px solid ${ACCENT};border-radius:5px;
  background:rgba(99,90,143,.05)}
.em-box.done{border-style:dashed;border-color:${DONE};background:rgba(13,122,79,.05);opacity:.72}
.em-box.sel{box-shadow:0 0 0 3px rgba(99,90,143,.25)}
.em-tag{position:absolute;top:-11px;left:-2px;pointer-events:auto;cursor:pointer;background:${ACCENT};color:#fff;
  border-radius:5px;font:700 11px/1 system-ui,-apple-system,sans-serif;padding:4px 7px;white-space:nowrap;
  box-shadow:0 1px 4px rgba(0,0,0,.25);max-width:180px;overflow:hidden;text-overflow:ellipsis}
.em-box.done .em-tag{background:${DONE}}
.em-shield{position:fixed;inset:0;z-index:${Z - 100};display:none;cursor:crosshair}
body.em-marking .em-shield{display:block}
.em-fab{position:fixed;right:16px;bottom:16px;z-index:${Z + 1000};display:flex;align-items:center;gap:8px;
  background:${ACCENT};color:#fff;border:none;border-radius:22px;padding:11px 18px;cursor:pointer;
  font:600 14px/1 system-ui,-apple-system,sans-serif;box-shadow:0 3px 14px rgba(0,0,0,.28)}
.em-fab[data-active="true"]{background:#c0392b}
.em-fab:disabled{opacity:.55;cursor:default}
.em-tab{position:fixed;top:62%;right:0;transform:translateY(-50%);z-index:${Z + 1603};border:none;cursor:pointer;
  background:${ACCENT};color:#fff;padding:14px 7px;border-radius:10px 0 0 10px;box-shadow:-2px 0 12px rgba(0,0,0,.2);
  writing-mode:vertical-rl;font:700 12px/1 system-ui,-apple-system,sans-serif;letter-spacing:2px}
.em-tab:hover{background:${ACCENT_STRONG}}
.em-drawer{position:fixed;top:0;right:0;bottom:0;z-index:${Z + 1602};width:310px;max-width:90vw;background:#fff;
  border-left:1px solid #e3e5ea;display:flex;flex-direction:column;box-shadow:-2px 0 16px rgba(0,0,0,.12);
  transform:translateX(100%);transition:transform .22s ease;font-family:system-ui,-apple-system,sans-serif}
.em-drawer.open{transform:translateX(0)}
.em-hd{display:flex;align-items:center;gap:8px;padding:12px 14px;border-bottom:1px solid #eceef2}
.em-hd .t{color:${ACCENT};font-weight:700;font-size:13px}
.em-hd .n{background:rgba(99,90,143,.12);color:${ACCENT_STRONG};border-radius:9px;font-size:10px;padding:1px 7px}
.em-hd .x{margin-left:auto;border:none;background:none;cursor:pointer;color:#6b7080;font-size:18px;line-height:1;padding:2px 4px}
.em-list{padding:10px;overflow-y:auto;flex:1;background:#f7f8fa}
.em-row{background:#fff;border:1px solid #eceef2;border-radius:7px;padding:9px 11px;margin-bottom:8px;cursor:pointer;
  box-shadow:0 1px 2px rgba(0,0,0,.04)}
.em-row:hover{border-color:${ACCENT}}
.em-row.done{opacity:.62}
.em-row .top{display:flex;align-items:center;gap:7px;font-size:11.5px;color:#6b7080;margin-bottom:4px}
.em-row .num{background:${ACCENT};color:#fff;border-radius:4px;font:700 10px/1 system-ui;padding:3px 5px}
.em-row.done .num{background:${DONE}}
.em-row .state{margin-left:auto;font-size:10.5px;padding:2px 7px;border-radius:9px;
  background:rgba(99,90,143,.12);color:${ACCENT_STRONG}}
.em-row.done .state{background:rgba(13,122,79,.14);color:${DONE}}
.em-row .body{font-size:13px;line-height:1.5;color:#1e1e1e;white-space:pre-wrap;word-break:break-word}
.em-row .toggle{margin-top:7px;font-size:11.5px;color:${ACCENT};background:none;border:none;padding:0;cursor:pointer}
.em-note{color:#6b7080;font-size:12.5px;text-align:center;padding:22px 10px;line-height:1.6}
.em-input{position:fixed;z-index:${Z + 1100};width:320px;max-width:92vw;background:#fff;border-radius:12px;
  box-shadow:0 8px 32px rgba(0,0,0,.24);padding:14px;display:none;font:14px/1.5 system-ui,-apple-system,sans-serif}
.em-input.show{display:block}
.em-input .who{font-size:12px;color:#6b7080;margin-bottom:8px;display:flex;align-items:center;gap:6px}
.em-input .av{width:18px;height:18px;border-radius:50%;object-fit:cover;background:${ACCENT};color:#fff;
  font:700 10px/18px system-ui;text-align:center;flex:none}
.em-input textarea{width:100%;min-height:74px;border:1px solid #e3e5ea;border-radius:8px;padding:8px;
  font:inherit;font-size:13.5px;resize:vertical;color:#1e1e1e;background:#fff}
.em-input .target{font-size:11.5px;color:#6b7080;margin-top:8px;word-break:break-all}
.em-input .acts{display:flex;gap:8px;justify-content:flex-end;margin-top:10px}
.em-input button{border-radius:7px;padding:7px 14px;font:inherit;font-size:13px;cursor:pointer;
  border:1px solid #e3e5ea;background:#fff;color:#1e1e1e}
.em-input button.go{background:${ACCENT};color:#fff;border-color:${ACCENT}}
.em-input button:disabled{opacity:.5;cursor:default}
.em-err{color:#c0392b;font-size:12px;margin:8px 0 0}
.em-toast{position:fixed;left:50%;bottom:80px;transform:translateX(-50%);z-index:${Z + 1200};background:#1e1e1e;
  color:#fff;padding:9px 16px;border-radius:18px;font:13px/1 system-ui,-apple-system,sans-serif;box-shadow:0 3px 14px rgba(0,0,0,.3)}
@media (prefers-color-scheme:dark){
  .em-drawer,.em-row,.em-input{background:#1e2026;border-color:#33363f}
  .em-hd{border-color:#33363f}
  .em-list{background:#16171b}
  .em-row .body{color:#e8e9ee}
  .em-input textarea,.em-input button{background:#16171b;border-color:#33363f;color:#e8e9ee}
  .em-input button.go{background:${ACCENT};color:#fff}
}
`;

const el = (tag, cls, props) => Object.assign(document.createElement(tag), cls ? { className: cls } : {}, props || {});

/** 把框貼到元素上（含捲動位移）。分離出來因為 hover 與落定的框共用。 */
export function placeBox(box, target) {
  const r = target.getBoundingClientRect();
  box.style.left = `${r.left + window.scrollX - 2}px`;
  box.style.top = `${r.top + window.scrollY - 2}px`;
  box.style.width = `${r.width + 4}px`;
  box.style.height = `${r.height + 4}px`;
}

/**
 * 建立所有常駐 DOM，回傳把手。呼叫端只管餵資料與接事件。
 * 全部掛在 body 下並標記 `data-em`，選取時據此排除自己（否則會標到工具本身）。
 */
export function mountChrome({ label, onToggleMark, onOpenDrawer }) {
  document.head.append(el('style', null, { textContent: MARKUP_STYLES }));
  const mark = (node) => { node.setAttribute('data-em', ''); return node; };

  const shield = mark(el('div', 'em-shield'));
  const hover = mark(el('div', 'em-hover', { style: 'display:none' }));
  const fab = mark(el('button', 'em-fab', { type: 'button', textContent: label }));
  const tab = mark(el('button', 'em-tab', { type: 'button', textContent: '標注紀錄' }));
  const drawer = mark(el('aside', 'em-drawer'));
  const input = mark(el('div', 'em-input'));

  drawer.innerHTML =
    '<div class="em-hd"><span class="t">標注紀錄</span><span class="n">0</span>'
    + '<button class="x" type="button" aria-label="關閉">×</button></div><div class="em-list"></div>';
  input.innerHTML =
    '<div class="who"></div><textarea placeholder="這裡怎麼了？"></textarea>'
    + '<div class="target"></div><div class="acts">'
    + '<button type="button" class="cancel">取消</button>'
    + '<button type="button" class="go" disabled>送出</button></div>';

  document.body.append(shield, hover, fab, tab, drawer, input);
  fab.onclick = onToggleMark;
  tab.onclick = () => onOpenDrawer();
  drawer.querySelector('.x').onclick = () => drawer.classList.remove('open');

  return {
    shield, hover, fab, tab, drawer, input,
    count: drawer.querySelector('.n'),
    list: drawer.querySelector('.em-list'),
    ta: input.querySelector('textarea'),
    who: input.querySelector('.who'),
    target: input.querySelector('.target'),
    send: input.querySelector('.go'),
    cancel: input.querySelector('.cancel'),
    destroy: () => [shield, hover, fab, tab, drawer, input].forEach(n => n.remove()),
  };
}

/** 開啟輸入卡並定位在點擊處附近（貼邊時往內收，不讓它跑出視窗）。 */
export function openInput(ui, { x, y, selector, user }) {
  ui.who.innerHTML = '';
  const avatar = user?.photoURL
    ? el('img', 'av', { src: user.photoURL, alt: '' })
    : el('span', 'av', { textContent: (user?.displayName || '?').slice(0, 1) });
  ui.who.append(avatar, el('span', null, { textContent: user?.displayName || user?.email || '' }));
  ui.target.textContent = selector ? `錨定：${selector}` : '';
  ui.ta.value = '';
  ui.send.disabled = true;
  ui.input.querySelector('.em-err')?.remove();
  ui.input.classList.add('show');
  ui.input.style.left = `${Math.max(12, Math.min(x, window.innerWidth - 336))}px`;
  ui.input.style.top = `${Math.max(12, Math.min(y, window.innerHeight - 250))}px`;
  ui.ta.focus();
}

/** 一則標記 → 頁面上的框。找不到元素回 null（不畫，而不是畫在錯的地方）。 */
function drawBox(mark, index, onTagClick) {
  let node = null;
  try { node = document.querySelector(mark.selector); } catch { return null; }
  if (!node) return null;
  const box = el('div', `em-box${mark.resolved ? ' done' : ''}`);
  box.setAttribute('data-em', '');
  box.dataset.markId = mark.id;
  placeBox(box, node);
  const tag = el('span', 'em-tag', {
    textContent: `${mark.resolved ? '✓ ' : ''}${index + 1}　${mark.authorName || '未署名'}`,
  });
  tag.onclick = (e) => { e.stopPropagation(); onTagClick(mark.id); };
  box.append(tag);
  document.body.append(box);
  return box;
}

/** 一則標記 → 抽屜裡的一列。 */
function drawRow(mark, index, { onToggle, onFocus }) {
  const row = el('div', `em-row${mark.resolved ? ' done' : ''}`);
  row.dataset.markId = mark.id;
  const state = mark.resolved
    ? `✓ 已處理${mark.resolvedBy ? `　${mark.resolvedBy}` : ''}`
    : '待處理';
  row.innerHTML =
    `<div class="top"><span class="num">${index + 1}</span><span class="nm"></span>`
    + `<span class="state"></span></div><div class="body"></div>`
    + `<button type="button" class="toggle">${mark.resolved ? '↩ 標回待處理' : '✓ 標成已處理'}</button>`;
  row.querySelector('.nm').textContent = mark.authorName || '未署名';
  row.querySelector('.state').textContent = state;
  row.querySelector('.body').textContent = mark.body || '';
  row.querySelector('.toggle').onclick = (e) => { e.stopPropagation(); onToggle(mark); };
  row.onclick = () => onFocus(mark);
  return row;
}

/**
 * 重畫全部：框 + 列表。每次資料或版面變動都整份重來——
 * 標記量是「一頁幾十則」的等級，差異更新的複雜度換不到有感的效能。
 */
export function renderMarks(ui, marks, handlers) {
  document.querySelectorAll('.em-box').forEach(n => n.remove());
  let drawn = 0;
  marks.forEach((m, i) => { if (drawBox(m, i, handlers.onFocusId)) drawn += 1; });

  ui.count.textContent = String(marks.length);
  ui.list.innerHTML = '';
  if (!marks.length) {
    ui.list.append(el('div', 'em-note', { textContent: '還沒有標記。按右下角的按鈕開始。' }));
    return;
  }
  marks.forEach((m, i) => ui.list.append(drawRow(m, i, handlers)));
  const missing = marks.length - drawn;
  if (missing > 0) {
    ui.list.append(el('div', 'em-note', {
      textContent: `另有 ${missing} 則的元素在這一頁找不到，所以沒有畫出來（頁面改版過就會這樣）。`,
    }));
  }
}

export function highlightMark(id) {
  document.querySelectorAll('.em-box').forEach(b => b.classList.toggle('sel', b.dataset.markId === String(id)));
}

export function toast(message) {
  const t = el('div', 'em-toast', { textContent: message });
  t.setAttribute('data-em', '');
  document.body.append(t);
  setTimeout(() => t.remove(), 2600);
}
