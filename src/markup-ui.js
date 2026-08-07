/**
 * markup-ui —— `user-feedback-markup.js` 的顯示層：框、標籤、標注紀錄抽屜、輸入卡。
 *
 * 內部模組，不對外掛載，所以不跟著主檔改名。要用這套 UI 請 import
 * `user-feedback-markup.js`，不要直接吃這支——它的介面隨時會變。
 *
 * 與資料來源解耦：這裡只認一個 mark 陣列與幾個 callback，不碰 Firebase。
 * 視覺語言刻意沿用 draw layer（accent #635a8f、右側抽屜、白底列項），
 * 因為使用者在同一批頁面上會同時看到兩者，長得不一樣會像兩個工具。
 */
import { resolveAnchor } from './anchor.js';

const ACCENT = '#635a8f';
const ACCENT_STRONG = '#4f4775';
const DONE = '#0d7a4f';
/** 只靠位置路徑定位的舊標記——琥珀色，跟「已處理」的綠、「待處理」的紫都分得開 */
const STALE = '#a86b12';
const Z = 2147482000;

export const MARKUP_STYLES = `
/* 只對工具自己的 DOM 生效（都帶 data-em），不動 app 的樣式。
   沒有這行時 width:300 ＋ padding:13 會量成 326，邊界計算全部偏掉。 */
[data-em], [data-em] *{box-sizing:border-box}
.em-hover{position:absolute;pointer-events:none;z-index:${Z};border:2px solid ${ACCENT};border-radius:5px;
  background:rgba(99,90,143,.07);transition:top .06s,left .06s,width .06s,height .06s}
.em-box{position:absolute;pointer-events:none;z-index:${Z + 100};border:2px solid ${ACCENT};border-radius:5px;
  background:rgba(99,90,143,.05)}
.em-box.done{border-style:dashed;border-color:${DONE};background:rgba(13,122,79,.05);opacity:.72}
.em-box.sel{box-shadow:0 0 0 3px rgba(99,90,143,.25)}
/* 只靠位置路徑定位的：外面再套一圈琥珀色點狀 outline。
   刻意不動 border——border 已經在講「待處理／已處理」（實線／虛線、紫／綠），
   蓋掉它的話那個區別就消失了，而那是兩件不同的事，要能同時看得出來。 */
.em-box.stale{outline:2px dotted ${STALE};outline-offset:2px}
.em-row.stale{border-left:3px solid ${STALE}}
.em-row .stale-note{margin-top:5px;color:${STALE};font-size:11.5px;line-height:1.5}
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
  transform:translateX(100%);font-family:system-ui,-apple-system,sans-serif;
  /* visibility 是關鍵：只用 transform 推到畫面外，元素仍佔著水平捲動空間，
     手機上會把整頁撐寬、瀏覽器縮小顯示。visibility:hidden 才真的退出版面計算。
     transition 延後 visibility，關閉動畫才不會瞬間消失。 */
  visibility:hidden;transition:transform .22s ease,visibility 0s .22s}
.em-drawer.open{transform:translateX(0);visibility:visible;transition:transform .22s ease}
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
.em-acts{display:flex;align-items:center;gap:10px;margin-top:7px;flex-wrap:wrap}
.em-acts button{font-size:11.5px;color:${ACCENT};background:none;border:none;padding:0;cursor:pointer}
.em-acts button.del{color:#c0392b}
.em-acts button.go{color:#fff;background:${ACCENT};border-radius:6px;padding:4px 12px}
.em-acts button:disabled{opacity:.5;cursor:default}
.em-ask{font-size:11.5px;color:#c0392b}
.em-edit{width:100%;min-height:64px;margin-top:6px;border:1px solid ${ACCENT};border-radius:7px;padding:7px;
  font:inherit;font-size:13px;resize:vertical;color:#1e1e1e;background:#fff}
.em-note{color:#6b7080;font-size:12.5px;text-align:center;padding:22px 10px;line-height:1.6}
.em-input{position:fixed;z-index:${Z + 1100};width:320px;max-width:92vw;background:#fff;border-radius:12px;
  box-shadow:0 8px 32px rgba(0,0,0,.24);padding:14px;display:none;font:14px/1.5 system-ui,-apple-system,sans-serif}
.em-input.show{display:block}
.em-input .who{font-size:12px;color:#6b7080;margin-bottom:8px;display:flex;align-items:center;gap:6px}
.em-input .av{width:18px;height:18px;border-radius:50%;object-fit:cover;background:${ACCENT};color:#fff;
  font:700 10px/18px system-ui;text-align:center;flex:none}
.em-name{flex:1;min-width:0;border:1px solid #e3e5ea;border-radius:6px;padding:4px 8px;
  font:inherit;font-size:12px;background:transparent;color:inherit}
.em-input textarea{width:100%;min-height:74px;border:1px solid #e3e5ea;border-radius:8px;padding:8px;
  font:inherit;font-size:13.5px;resize:vertical;color:#1e1e1e;background:#fff}
.em-input .target{font-size:11.5px;color:#6b7080;margin-top:8px;word-break:break-all}
.em-input .acts{display:flex;gap:8px;justify-content:flex-end;margin-top:10px}
.em-input button{border-radius:7px;padding:7px 14px;font:inherit;font-size:13px;cursor:pointer;
  border:1px solid #e3e5ea;background:#fff;color:#1e1e1e}
.em-input button.go{background:${ACCENT};color:#fff;border-color:${ACCENT}}
.em-input button:disabled{opacity:.5;cursor:default}
.em-pop{position:fixed;z-index:${Z + 1150};width:300px;max-width:92vw;background:#fff;border-radius:12px;
  box-shadow:0 8px 32px rgba(0,0,0,.24);padding:13px;display:none;font:14px/1.55 system-ui,-apple-system,sans-serif}
.em-pop.show{display:block}
.em-pop .top{display:flex;align-items:center;gap:7px;font-size:11.5px;color:#6b7080;margin-bottom:6px}
.em-pop .num{background:${ACCENT};color:#fff;border-radius:4px;font:700 10px/1 system-ui;padding:3px 5px}
.em-pop.done .num{background:${DONE}}
.em-pop .state{margin-left:auto;font-size:10.5px;padding:2px 7px;border-radius:9px;
  background:rgba(99,90,143,.12);color:${ACCENT_STRONG}}
.em-pop.done .state{background:rgba(13,122,79,.14);color:${DONE}}
.em-pop .x{border:none;background:none;cursor:pointer;color:#6b7080;font-size:17px;line-height:1;padding:0 2px}
.em-pop .body{font-size:13.5px;color:#1e1e1e;white-space:pre-wrap;word-break:break-word}
.em-err{color:#c0392b;font-size:12px;margin:8px 0 0}
.em-fail{position:fixed;right:12px;bottom:12px;z-index:${Z + 2000};max-width:min(320px,92vw);
  background:#c0392b;color:#fff;border-radius:10px;padding:10px 12px;
  font:12.5px/1.5 system-ui,-apple-system,sans-serif;box-shadow:0 3px 14px rgba(0,0,0,.3)}
.em-fail b{display:block;font-size:13px;margin-bottom:3px}
.em-toast{position:fixed;left:50%;bottom:80px;transform:translateX(-50%);z-index:${Z + 1200};background:#1e1e1e;
  color:#fff;padding:9px 16px;border-radius:18px;font:13px/1 system-ui,-apple-system,sans-serif;box-shadow:0 3px 14px rgba(0,0,0,.3)}
@media (prefers-color-scheme:dark){
  .em-drawer,.em-row,.em-input,.em-pop{background:#1e2026;border-color:#33363f}
  .em-pop .body{color:#e8e9ee}
  .em-hd{border-color:#33363f}
  .em-list{background:#16171b}
  .em-row .body{color:#e8e9ee}
  .em-input textarea,.em-input button,.em-name,.em-edit{background:#16171b;border-color:#33363f;color:#e8e9ee}
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
  const pop = mark(el('div', 'em-pop'));

  drawer.innerHTML =
    '<div class="em-hd"><span class="t">標注紀錄</span><span class="n">0</span>'
    + '<button class="x" type="button" aria-label="關閉">×</button></div><div class="em-list"></div>';
  input.innerHTML =
    '<div class="who"></div><textarea placeholder="這裡怎麼了？"></textarea>'
    + '<div class="target"></div><div class="acts">'
    + '<button type="button" class="cancel">取消</button>'
    + '<button type="button" class="go" disabled>送出</button></div>';
  // 名字欄位只有匿名模式會用到（具名模式由 Google 帳號提供）。先建好，openInput 決定顯不顯示。
  const nameInput = el('input', 'em-name', { type: 'text', placeholder: '你的名字（可不填）', maxLength: 30 });

  document.body.append(shield, hover, fab, tab, drawer, input, pop);
  fab.onclick = onToggleMark;
  tab.onclick = () => onOpenDrawer();
  drawer.querySelector('.x').onclick = () => drawer.classList.remove('open');

  return {
    shield, hover, fab, tab, drawer, input, pop,
    count: drawer.querySelector('.n'),
    list: drawer.querySelector('.em-list'),
    ta: input.querySelector('textarea'),
    who: input.querySelector('.who'),
    nameInput,
    target: input.querySelector('.target'),
    send: input.querySelector('.go'),
    cancel: input.querySelector('.cancel'),
    destroy: () => [shield, hover, fab, tab, drawer, input, pop].forEach(n => n.remove()),
  };
}

/** 開啟輸入卡並定位在點擊處附近（貼邊時往內收，不讓它跑出視窗）。 */
export function openInput(ui, { x, y, selector, user, anonymous = false, savedName = '' }) {
  ui.who.innerHTML = '';
  if (anonymous) {
    // 匿名：名字自己填、可留空。不假裝知道你是誰，也不強迫你告訴我們。
    ui.nameInput.value = savedName;
    const initial = () => (ui.nameInput.value.trim() || '?').slice(0, 1);
    const avatar = el('span', 'av', { textContent: initial() });
    ui.nameInput.oninput = () => { avatar.textContent = initial(); };
    ui.who.append(avatar, ui.nameInput);
  } else {
    const avatar = user?.photoURL
      ? el('img', 'av', { src: user.photoURL, alt: '' })
      : el('span', 'av', { textContent: (user?.displayName || '?').slice(0, 1) });
    ui.who.append(avatar, el('span', null, { textContent: user?.displayName || user?.email || '' }));
  }
  ui.target.textContent = selector ? `錨定：${selector}` : '';
  ui.ta.value = '';
  ui.send.disabled = true;
  ui.input.querySelector('.em-err')?.remove();
  ui.input.classList.add('show');
  ui.input.style.left = `${Math.max(12, Math.min(x, window.innerWidth - 336))}px`;
  ui.input.style.top = `${Math.max(12, Math.min(y, window.innerHeight - 250))}px`;
  ui.ta.focus();
}

/**
 * 一則標記 → 頁面上的框。
 *
 * 只靠位置路徑解出來的（`how === 'selector'`）加上 `stale`：那些是舊資料，
 * 頁面一改就可能指到別人身上，而框本身不會透露這件事。看的人有權知道
 * 哪幾則不能全信——這正是 2026-08-07 那次整批位移沒有任何人察覺的原因。
 */
function drawBox(mark, node, how, index, onTagClick) {
  const stale = how === 'selector' ? ' stale' : '';
  const box = el('div', `em-box${mark.resolved ? ' done' : ''}${stale}`);
  box.setAttribute('data-em', '');
  box.dataset.markId = mark.id;
  placeBox(box, node);
  const tag = el('span', 'em-tag', {
    // ⚠ 放在標籤上，因為使用者多半只看畫面上的框，不會去開右側面板
    textContent: `${mark.resolved ? '✓ ' : ''}${stale ? '⚠ ' : ''}${index + 1}　${mark.authorName || '未署名'}`,
  });
  tag.onclick = (e) => { e.stopPropagation(); onTagClick(mark.id, { x: e.clientX, y: e.clientY }); };
  box.append(tag);
  document.body.append(box);
  return box;
}

/** 一列底下的動作。自己的標記多兩個：改內容、刪掉。 */
function rowActions(row, mark, { onToggle, onEdit, onDelete, isMine }) {
  const bar = el('div', 'em-acts');
  const btn = (cls, text, fn) => {
    const b = el('button', cls, { type: 'button', textContent: text });
    b.onclick = (e) => { e.stopPropagation(); fn(); };
    return b;
  };
  bar.append(btn('toggle', mark.resolved ? '↩ 標回待處理' : '✓ 標成已處理', () => onToggle(mark)));
  if (isMine) {
    bar.append(btn('edit', '編輯', () => startEdit(row, mark, onEdit)));
    bar.append(btn('del', '刪除', () => confirmDelete(bar, mark, onDelete)));
  }
  return bar;
}

/** 內容改成可編輯。取消就還原，不動任何資料。 */
function startEdit(row, mark, onEdit) {
  if (row.querySelector('.em-edit')) return;   // row 也可能是 popover——兩者結構相同（.body + .em-acts）              // 連按兩次不要疊出第二個
  const body = row.querySelector('.body');
  const acts = row.querySelector('.em-acts');
  const ta = el('textarea', 'em-edit');
  ta.value = mark.body || '';
  const save = el('button', 'go', { type: 'button', textContent: '儲存' });
  const cancel = el('button', 'edit-cancel', { type: 'button', textContent: '取消' });
  const bar = el('div', 'em-acts em-edit-acts');
  bar.append(save, cancel);
  body.style.display = 'none';
  acts.style.display = 'none';
  row.append(ta, bar);
  ta.focus();
  const close = () => { ta.remove(); bar.remove(); body.style.display = ''; acts.style.display = ''; };
  cancel.onclick = (e) => { e.stopPropagation(); close(); };
  save.onclick = (e) => {
    e.stopPropagation();
    const next = ta.value.trim();
    if (!next) return;                                     // 空的就是刪除，那要走刪除的路徑
    save.disabled = true;
    onEdit(mark, next);                                    // snapshot 會重畫整份，不必自己 close
  };
}

/**
 * 刪除要二次確認，但**不用 confirm()**：原生對話框會凍住整個頁面，
 * 在嵌在 LINE 裡的 WebView 更容易卡死。改成就地換成兩顆按鈕。
 */
function confirmDelete(bar, mark, onDelete) {
  if (bar.dataset.confirming) return;
  bar.dataset.confirming = '1';
  const original = [...bar.children];
  original.forEach(n => { n.style.display = 'none'; });
  const ask = el('span', 'em-ask', { textContent: '確定刪掉？' });
  const yes = el('button', 'del del-yes', { type: 'button', textContent: '刪除' });
  const no = el('button', 'del-no', { type: 'button', textContent: '取消' });
  const restore = () => {
    [ask, yes, no].forEach(n => n.remove());
    original.forEach(n => { n.style.display = ''; });
    delete bar.dataset.confirming;
  };
  no.onclick = (e) => { e.stopPropagation(); restore(); };
  yes.onclick = (e) => { e.stopPropagation(); yes.disabled = true; onDelete(mark); };
  bar.append(ask, yes, no);
}

/** 一則標記 → 抽屜裡的一列。 */
function drawRow(mark, index, handlers, how) {
  const stale = how === 'selector' ? ' stale' : '';
  const row = el('div', `em-row${mark.resolved ? ' done' : ''}${stale}`);
  row.dataset.markId = mark.id;
  const state = mark.resolved
    ? `✓ 已處理${mark.resolvedBy ? `　${mark.resolvedBy}` : ''}`
    : '待處理';
  row.innerHTML =
    `<div class="top"><span class="num">${index + 1}</span><span class="nm"></span>`
    + `<span class="state"></span></div><div class="body"></div>`;
  row.querySelector('.nm').textContent = mark.authorName || '未署名';
  row.querySelector('.state').textContent = state;
  row.querySelector('.body').textContent = mark.body || '';
  // 舊資料只有位置路徑，頁面改過就可能框在別人身上。說出來，不要讓人以為每一則都是準的。
  if (stale) {
    row.append(el('div', 'stale-note', {
      textContent: '⚠ 這則是用舊方式（頁面上的位置）定位的，頁面改過的話可能不準。',
    }));
  }
  row.append(rowActions(row, mark, { ...handlers, isMine: handlers.isMine(mark) }));
  row.onclick = () => handlers.onFocus(mark);
  return row;
}

/**
 * 重畫全部：框 + 列表。每次資料或版面變動都整份重來——
 * 標記量是「一頁幾十則」的等級，差異更新的複雜度換不到有感的效能。
 */
export function renderMarks(ui, marks, handlers) {
  document.querySelectorAll('.em-box').forEach(n => n.remove());
  // 只列「這一頁真的畫得出來」的標記。錨點失效的列在這裡沒有意義——
  // 點了跳不過去，也對不上畫面上任何東西，只會讓人以為自己漏看了什麼。
  // 資料沒有消失（agent 與 bridge 照樣讀得到），只是不在這個面板上。
  // 一則只解析一次，框與列項共用同一個結果——否則兩邊可能各自解到不同的元素
  const visible = [];
  marks.forEach((m) => {
    const { node, how } = resolveAnchor(m);
    if (!node) return;
    drawBox(m, node, how, visible.length, handlers.onFocusId);
    visible.push({ mark: m, how });
  });

  ui.count.textContent = String(visible.length);
  ui.list.innerHTML = '';
  const missing = marks.length - visible.length;
  // 「還沒有標記」只在真的一則都沒有時說。有 missing 卻說「還沒有標記」是自相矛盾的，
  // 底下馬上又寫「另有 N 則」——看的人會以為工具壞了。
  if (!marks.length) {
    ui.list.append(el('div', 'em-note', { textContent: '這一頁還沒有標記。按右下角的按鈕開始。' }));
  } else {
    visible.forEach(({ mark, how }, i) => ui.list.append(drawRow(mark, i, handlers, how)));
  }
  if (missing > 0) {
    ui.list.append(el('div', 'em-note', {
      textContent: `另有 ${missing} 則標在已經改掉的元件上，找不到位置所以沒列出來（內容還在，收回饋的人讀得到）。`,
    }));
  }
}

/**
 * 點頁面上的標記 → 就地跳出那一則。
 *
 * 比「打開右側面板再自己找」直覺：使用者指著的就是這一則，
 * 應該當場給他看，而不是把他丟進一份清單裡。
 * 動作（標成已處理／編輯／刪除）與面板那邊共用同一組 handler，行為一致。
 */
export function showMarkPopover(ui, mark, index, handlers, at) {
  const pop = ui.pop;
  pop.className = `em-pop show${mark.resolved ? ' done' : ''}`;
  pop.dataset.markId = String(mark.id);
  pop.innerHTML = '';
  const head = el('div', 'top');
  head.append(
    el('span', 'num', { textContent: String(index + 1) }),
    el('span', null, { textContent: mark.authorName || '未署名' }),
    el('span', 'state', {
      textContent: mark.resolved
        ? `✓ 已處理${mark.resolvedBy ? `　${mark.resolvedBy}` : ''}`
        : '待處理',
    }),
  );
  const close = el('button', 'x', { type: 'button', textContent: '×', title: '關閉' });
  close.onclick = (e) => { e.stopPropagation(); hideMarkPopover(ui); };
  head.append(close);
  const body = el('div', 'body', { textContent: mark.body || '' });
  pop.append(head, body);
  pop.append(rowActions(pop, mark, { ...handlers, isMine: handlers.isMine(mark) }));

  positionPopover(ui);
}

/**
 * 把留言視窗對準它那個框。
 *
 * 用 `fixed` ＋ viewport 座標，而不是 absolute ＋ page 座標：absolute 的元素若被
 * 放到頁面右緣外，會把整份文件撐寬——手機瀏覽器只好縮小整頁來容納它，使用者的
 * 感受是「有個標記一直讓螢幕變小」。fixed 不參與文件尺寸計算，不會有這問題。
 *
 * 代價是捲動時要自己重新對準，所以 reflow 會呼叫這支。換來的是「捲動時它跟著
 * 那個框走」而且永遠不會撐寬頁面——兩件事同時成立。
 */
export function positionPopover(ui) {
  const pop = ui.pop;
  const id = pop.dataset.markId;
  if (!id || !pop.classList.contains('show')) return;
  const box = document.querySelector(`.em-box[data-mark-id="${cssEscapeId(id)}"]`);
  if (!box) return hideMarkPopover(ui);      // 那個框沒了（selector 失效或被刪）
  const b = box.getBoundingClientRect();
  const r = pop.getBoundingClientRect();
  const view = document.documentElement.clientWidth;
  pop.style.left = `${Math.max(8, Math.min(b.left + b.width / 2 - r.width / 2, view - r.width - 8))}px`;
  const above = b.top - r.height - 10;
  pop.style.top = `${above > 8 ? above : Math.min(b.bottom + 10, window.innerHeight - r.height - 8)}px`;
}

const cssEscapeId = (v) => (window.CSS && CSS.escape) ? CSS.escape(v) : String(v).replace(/["\\]/g, '\\$&');

export function hideMarkPopover(ui) {
  ui.pop.classList.remove('show');
  delete ui.pop.dataset.markId;
}

export function highlightMark(id) {
  document.querySelectorAll('.em-box').forEach(b => b.classList.toggle('sel', b.dataset.markId === String(id)));
}

/**
 * 載入失敗要看得見。
 *
 * 先前失敗只印 console，而使用者在手機上——他看到的是「回饋按鈕不見了」，
 * 沒有任何線索，也沒辦法告訴我為什麼。畫面上說一句，勝過十行 log。
 */
export function showInitFailure(message) {
  document.querySelector('.em-fail')?.remove();
  const box = el('div', 'em-fail');
  box.setAttribute('data-em', '');
  box.append(el('b', null, { textContent: '回饋工具沒load起來' }),
             el('span', null, { textContent: message }));
  document.body.append(box);
}

export function toast(message) {
  const t = el('div', 'em-toast', { textContent: message });
  t.setAttribute('data-em', '');
  document.body.append(t);
  setTimeout(() => t.remove(), 2600);
}
