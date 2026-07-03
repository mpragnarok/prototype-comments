/**
 * draw/record-panel — P6 側邊「標注紀錄」面板 DOM 與 AI 方案卡：
 * 右緣 tab、抽屜、每列 row、reply 卡片工廠。皆吃 callback 參數，不持有 closure 狀態。
 */
import { icon } from './constants.js';
import { drawHtmlEl } from './dom.js';

// ── P6 側邊「標注紀錄」面板 DOM（右緣 tab + 抽屜，沿用 spec-overlay 的 tab/drawer 模式）──
export function buildRecordTab(onToggle) {
  const tab = drawHtmlEl('button', 'pc-draw-rec-tab');
  tab.id = 'pc-draw-rec-tab';
  tab.textContent = '標注紀錄 ◂';
  tab.title = '標注紀錄';
  tab.setAttribute('aria-label', '標注紀錄');
  tab.onclick = onToggle;
  return tab;
}
export function buildRecordDrawer(onClose) {
  const drawer = drawHtmlEl('div', 'pc-draw-rec-drawer');
  drawer.id = 'pc-draw-rec-drawer';
  const hd = drawHtmlEl('div', 'pc-draw-rec-hd');
  const title = drawHtmlEl('span', 'pc-draw-rec-hd-title'); title.textContent = '標注紀錄';
  const count = drawHtmlEl('span', 'pc-draw-rec-count'); count.textContent = '0';
  // 全選/全不選：控制「送出時納入哪些標注」（onchange 在 initDrawLayer 掛上）
  const allWrap = drawHtmlEl('label', 'pc-draw-rec-all-wrap');
  const allBox = drawHtmlEl('input', 'pc-draw-rec-all'); allBox.type = 'checkbox'; allBox.checked = true;
  allBox.setAttribute('aria-label', '全選／全不選送出');
  const allLbl = drawHtmlEl('span'); allLbl.textContent = '全選';
  allWrap.appendChild(allBox); allWrap.appendChild(allLbl);
  const close = drawHtmlEl('button', 'pc-draw-rec-close'); close.textContent = '✕';
  close.title = '關閉'; close.setAttribute('aria-label', '關閉標注紀錄'); close.onclick = onClose;
  hd.appendChild(title); hd.appendChild(count); hd.appendChild(allWrap); hd.appendChild(close);
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
export function recordRowEl(row, selected, onClick, checked, onToggle, onRemove) {
  const el = drawHtmlEl('div', 'pc-draw-rec-row' + (selected ? ' selected' : '') + (row.grouped ? ' is-grouped' : ''));
  el.dataset.id = row.id;
  el.setAttribute('role', 'button'); el.setAttribute('tabindex', '0');
  el.setAttribute('aria-label', row.text + (row.grouped ? '（群組成員，勾選會連動整組）' : ''));
  // 送出勾選框：是否納入送出（獨立於畫布選取；stopPropagation 不觸發整列點選）。
  const cb = drawHtmlEl('input', 'pc-draw-rec-check'); cb.type = 'checkbox'; cb.checked = checked !== false;
  cb.setAttribute('aria-label', row.grouped ? '送出時包含此標注（群組連動）' : '送出時包含此標注');
  if (row.grouped) cb.title = '此列屬於群組，勾選/取消會連動整組';
  cb.onclick = e => e.stopPropagation();
  cb.onchange = e => { e.stopPropagation(); if (onToggle) onToggle(row.id, cb.checked); };
  el.appendChild(cb);
  const ic = drawHtmlEl('span', 'pc-draw-rec-icon');
  ic.innerHTML = icon(row.icon, 18);
  el.appendChild(ic);
  if (row.color) {
    const sw = drawHtmlEl('span', 'pc-draw-rec-swatch');
    sw.style.background = row.color;
    el.appendChild(sw);
  }
  if (row.grouped) { // 群組連動提示：勾這列＝整組一起勾/取消
    const grp = drawHtmlEl('span', 'pc-draw-rec-group'); grp.textContent = '🔗';
    grp.title = '群組成員（勾選連動整組）'; grp.setAttribute('aria-hidden', 'true');
    el.appendChild(grp);
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
  // 已送/未送 標記：送出後沒再改＝已送（綠勾）；新建或改過＝未送（琥珀）。
  const badge = drawHtmlEl('span', 'pc-draw-rec-status ' + (row.sent ? 'is-sent' : 'is-unsent'));
  badge.textContent = row.sent ? '✓ 已送' : '● 未送';
  el.appendChild(badge);
  if (onRemove) { // 從佇列移除（目前用於「決定」列）
    const rm = drawHtmlEl('button', 'pc-draw-rec-remove'); rm.textContent = '✕';
    rm.title = '從佇列移除'; rm.setAttribute('aria-label', '從佇列移除');
    rm.onclick = e => { e.stopPropagation(); onRemove(row.id); };
    el.appendChild(rm);
  }
  el.onclick = () => onClick(row.id);
  return el;
}

// AI 方案卡（錨定貼在標注旁）：標題 + 文字 + 可點選項按鈕；已選則顯示「✓ 已選」。
// onChoose(reply, option) 在點選項時呼叫。純函式（位置由呼叫端設 style）。
export function replyCardEl(reply, onChoose, onClose, onRechoose) {
  const card = drawHtmlEl('div', 'pc-draw-reply-card');
  card.dataset.n = reply.n;
  const head = drawHtmlEl('div', 'pc-draw-reply-head'); head.textContent = '💬 AI 方案';
  const close = drawHtmlEl('button', 'pc-draw-reply-close'); close.textContent = '✕';
  close.title = '關閉這張方案卡'; close.setAttribute('aria-label', '關閉方案卡');
  close.onclick = () => onClose && onClose(reply);
  head.appendChild(close);
  card.appendChild(head);
  if (reply.text) { const t = drawHtmlEl('div', 'pc-draw-reply-text'); t.textContent = reply.text; card.appendChild(t); }
  const opts = Array.isArray(reply.options) ? reply.options : [];
  // 有 html(真實 UI)/desc(說明)/preview(文字示意) → 圖文卡片式；否則純按鈕。
  const rich = opts.some(o => o.html || o.desc || o.preview);
  if (reply.chosen) {
    const c = drawHtmlEl('div', 'pc-draw-reply-chosen');
    c.textContent = '✓ 已選：' + (reply.chosen.label || reply.chosen.id);
    card.appendChild(c);
    const re = drawHtmlEl('button', 'pc-draw-reply-rechoose'); // 取消已選 → 回選項列重挑
    re.textContent = '改選'; re.title = '取消這個選擇，重新挑一個方案';
    re.onclick = () => onRechoose && onRechoose(reply);
    card.appendChild(re);
  } else if (opts.length) {
    const row = drawHtmlEl('div', 'pc-draw-reply-opts' + (rich ? ' is-rich' : ''));
    opts.forEach(o => {
      const b = drawHtmlEl('div', 'pc-draw-reply-opt');
      if (!rich) { // 純按鈕：整塊可點（向後相容）
        b.setAttribute('role', 'button'); b.setAttribute('tabindex', '0');
        b.textContent = o.label || o.id;
        b.onclick = () => onChoose && onChoose(reply, o);
        row.appendChild(b);
        return;
      }
      const lbl = drawHtmlEl('div', 'pc-draw-reply-opt-label'); lbl.textContent = o.label || o.id; b.appendChild(lbl);
      if (o.desc) { const d = drawHtmlEl('div', 'pc-draw-reply-opt-desc'); d.textContent = o.desc; b.appendChild(d); }
      // html＝真實 UI 畫面：用頁面全域 styles 渲染，長得跟真的一樣（本地單人信任來源，故 innerHTML）。
      // 設 pointer-events:none（CSS）→ 戳 mockup 不會誤觸；用下面「選這個方案」鈕才送出。
      if (o.html) { const m = drawHtmlEl('div', 'pc-draw-reply-mock'); m.innerHTML = o.html; b.appendChild(m); }
      else if (o.preview) { const p = drawHtmlEl('pre', 'pc-draw-reply-preview'); p.textContent = o.preview; b.appendChild(p); }
      const choose = drawHtmlEl('button', 'pc-draw-reply-choose'); choose.textContent = '選這個方案';
      choose.onclick = () => onChoose && onChoose(reply, o); b.appendChild(choose);
      row.appendChild(b);
    });
    card.appendChild(row);
  }
  return card;
}
