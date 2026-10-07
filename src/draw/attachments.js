/**
 * draw/attachments — 註記卡附件：上限常數、純函式（可單測）與輸入狀態的附件列（DOM）。
 * 只有 initDrawLayer 收到 opts.uploadAttachment 時才會建附件列；沒傳就完全不出現（舊行為不變）。
 * 附件本身不進註記 doc，doc 只記 {name,type,size,url,path}——檔案由 consumer 的 uploadAttachment 存放。
 * ⚠️ bundle 會把各模組串成同一個 scope：這裡的 top-level 名稱一律帶 attach 字樣，避免和別的模組撞名。
 */
import { drawHtmlEl } from './dom.js';

// 一則留言最多幾個附件、單檔多大（使用者 2026-10-06 定案）。全 CDN 只在這裡定義。
export const NOTE_ATTACH_MAX = 3;
export const NOTE_ATTACH_MAX_BYTES = 10 * 1024 * 1024;
const ATTACH_FIELDS = ['name', 'type', 'size', 'url', 'path'];
const ATTACH_CLIP_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 11.5 12.6 19.9a5.5 5.5 0 0 1-7.8-7.8l8.5-8.5a3.7 3.7 0 0 1 5.2 5.2l-8.5 8.5a1.8 1.8 0 0 1-2.6-2.6l7.8-7.8"/></svg>';

// ── 純函式 ────────────────────────────────────────────────────────────────────
// 上限文字（「10MB」）從常數算，不另外手寫。
export function attachLimitLabel(maxBytes = NOTE_ATTACH_MAX_BYTES) {
  return Math.round(maxBytes / (1024 * 1024)) + 'MB';
}
// 位元組 → 人看的大小：380 KB、1.2 MB、48 MB。
export function formatAttachBytes(n) {
  const b = Math.max(0, Number(n) || 0);
  if (b < 1024) return b + ' B';
  if (b < 1024 * 1024) return Math.round(b / 1024) + ' KB';
  const mb = b / (1024 * 1024);
  return (mb < 10 ? mb.toFixed(1) : String(Math.round(mb))) + ' MB';
}
// 副檔名大寫（檔案圖示上那幾個字）；沒有副檔名 → FILE。
export function attachExt(name) {
  const m = /\.([A-Za-z0-9]{1,5})$/.exec(String(name || ''));
  return m ? m[1].toUpperCase() : 'FILE';
}
export function isImageAttachment(a) { return !!a && /^image\//.test(String(a.type || '')); }
// 能不能再加一個：回 null（可以）、'full'（已滿）、'too_large'（單檔超過上限）。
export function checkAttachAdd(count, file, max = NOTE_ATTACH_MAX, maxBytes = NOTE_ATTACH_MAX_BYTES) {
  if (count >= max) return 'full';
  if (file && Number(file.size) > maxBytes) return 'too_large';
  return null;
}
// 只留合約欄位（{name,type,size,url,path}），丟掉其他東西。
export function cleanAttachment(a) {
  const out = {};
  ATTACH_FIELDS.forEach(k => { if (a && a[k] != null) out[k] = a[k]; });
  return out;
}
// 寫進 doc 的附件陣列：沒有可用附件 → null（呼叫端就不寫這個欄位，舊資料形狀不變）。
export function attachmentsForDoc(list) {
  const out = (Array.isArray(list) ? list : []).filter(a => a && (a.path || a.url)).map(cleanAttachment);
  return out.length ? out : null;
}
// uploadAttachment 丟出來的錯誤是不是「檔案太大」（HTTP 413 帶 {error:'too_large'}）。
export function isAttachTooLargeError(e) {
  if (!e) return false;
  return e.status === 413 || e.error === 'too_large' || e.code === 'too_large' || /too_large/.test(String(e.message || ''));
}
// 從剪貼簿／拖放事件取出檔案（沒有就回空陣列）。
export function attachFilesFromTransfer(dt) {
  if (!dt) return [];
  const files = [...(dt.files || [])];
  if (files.length) return files;
  return [...(dt.items || [])].filter(it => it.kind === 'file').map(it => it.getAsFile()).filter(Boolean);
}
export function isFileDrag(ev) {
  const types = (ev && ev.dataTransfer && ev.dataTransfer.types) || [];
  return [...types].includes('Files');
}
// 附件網址 → 可開的絕對網址（相對網址照頁面 base 解析）。只放行 http／https／blob：
// 附件 url 來自註記 doc（可能是共享或被竄改的資料），javascript:／data: 這類網址交給 window.open 或 <img src>
// 等於讓別人在這頁跑東西。解析失敗或協議不在白名單 → 回空字串，呼叫端就不開視窗、不設 src。
const ATTACH_SAFE_PROTOCOLS = ['http:', 'https:', 'blob:'];
function attachDocBase() { try { return document.baseURI; } catch (_) { return undefined; } }
export function attachHref(url, base = attachDocBase()) {
  if (url == null || url === '') return '';
  try {
    const u = new URL(String(url), base);
    return ATTACH_SAFE_PROTOCOLS.includes(u.protocol) ? u.href : '';
  } catch (_) { return ''; }
}

// ── DOM：錯誤提示、已存附件、輸入中的附件列 ─────────────────────────────────────
// 紅框提示（太大／滿了／沒存到）。strong＝粗體開頭（檔名與大小），rest＝後面說明；✕ 收掉。
export function attachNoticeEl(strong, rest) {
  const box = drawHtmlEl('div', 'pc-att-err'); box.setAttribute('role', 'alert');
  const msg = drawHtmlEl('span');
  if (strong) { const b = drawHtmlEl('b'); b.textContent = strong; msg.appendChild(b); }
  msg.appendChild(document.createTextNode(rest || ''));
  const x = drawHtmlEl('button'); x.type = 'button'; x.textContent = '✕'; x.setAttribute('aria-label', '關閉提示');
  x.onclick = () => box.remove();
  box.append(msg, x);
  return box;
}
// 縮圖（圖片）。src 可以是本機預覽網址或上傳後的網址。
function attachThumbEl(name, size, src) {
  const el = drawHtmlEl('div', 'pc-att-thumb');
  el.title = size != null ? `${name} · ${formatAttachBytes(size)}` : name;
  const box = drawHtmlEl('div', 'img'); const img = document.createElement('img');
  if (src) { img.alt = name; img.src = src; box.appendChild(img); } // 沒有安全網址 → 留灰底占位，不設 src
  else box.classList.add('is-empty');
  el.appendChild(box);
  return el;
}
// 檔案條（非圖片、上傳中或失敗的圖片）：副檔名＋檔名＋狀態文字。
function attachFileEl(name, statusText) {
  const el = drawHtmlEl('div', 'pc-att-file');
  const ico = drawHtmlEl('span', 'ico'); ico.textContent = attachExt(name);
  const meta = drawHtmlEl('span', 'meta');
  const nm = drawHtmlEl('span', 'nm'); nm.textContent = name; nm.title = name;
  const sz = drawHtmlEl('span', 'sz'); sz.textContent = statusText;
  meta.append(nm, sz); el.append(ico, meta);
  return el;
}
// 已存狀態（view 卡）：放在「我的 prompt」泡泡內、虛線下方；點一下用新分頁開檔案。
export function attachmentViewEl(list) {
  const wrap = drawHtmlEl('div', 'pc-note-prompt-att');
  (list || []).forEach(a => {
    const href = attachHref(a.url);
    const el = isImageAttachment(a) ? attachThumbEl(a.name, a.size, href) : attachFileEl(a.name, formatAttachBytes(a.size));
    if (href) attachMakeLink(el, href); // 網址不安全／解析不了 → 只顯示檔名或占位，不當連結
    wrap.appendChild(el);
  });
  return wrap;
}
// 讓已存的附件可點：新分頁開 href（呼叫前已確認是 http／https／blob）。
function attachMakeLink(el, href) {
  el.classList.add('is-link'); el.tabIndex = 0; el.setAttribute('role', 'link');
  const openIt = () => { try { window.open(href, '_blank', 'noopener'); } catch (_) { } };
  el.onclick = openIt;
  el.onkeydown = ev => { if (ev.key === 'Enter') { ev.preventDefault(); openIt(); } };
}
// 拖曳中的虛線遮罩。
export function attachDropVeilEl() {
  const veil = drawHtmlEl('div', 'pc-drop-veil');
  const inner = drawHtmlEl('div'); inner.textContent = '放開就加入附件';
  const small = drawHtmlEl('small'); small.textContent = `圖片或檔案，單檔 ${attachLimitLabel()} 以內`;
  inner.appendChild(small); veil.appendChild(inner);
  return veil;
}

// 輸入狀態的附件列。items：{ status:'uploading'|'done'|'failed', file?, preview?, att? }。
// 回傳要掛到卡片上的元素（clip／countEl／listEl／errEl／input）與查詢方法。
export function createAttachmentTray({ upload, initial = [] }) {
  const t = {
    upload, items: (initial || []).map(a => ({ status: 'done', att: cleanAttachment(a) })), listeners: [],
    listEl: drawHtmlEl('div', 'pc-attach-list'), errEl: drawHtmlEl('div', 'pc-att-err-slot'),
    clip: drawHtmlEl('button', 'pc-attach-btn'), countEl: drawHtmlEl('span', 'pc-attach-count'),
    input: document.createElement('input'),
  };
  t.clip.type = 'button'; t.clip.title = '附加圖片或檔案'; t.clip.setAttribute('aria-label', '附加圖片或檔案');
  t.clip.innerHTML = ATTACH_CLIP_SVG;
  t.input.type = 'file'; t.input.multiple = true; t.input.hidden = true; t.input.className = 'pc-attach-input';
  t.clip.onclick = () => t.input.click();
  t.input.onchange = () => { trayAddFiles(t, [...(t.input.files || [])]); t.input.value = ''; };
  trayRender(t);
  return {
    clip: t.clip, countEl: t.countEl, listEl: t.listEl, errEl: t.errEl, input: t.input,
    addFiles: files => trayAddFiles(t, files),
    attachments: () => t.items.filter(i => i.status === 'done').map(i => i.att),
    isUploading: () => t.items.some(i => i.status === 'uploading'),
    failedCount: () => t.items.filter(i => i.status === 'failed').length,
    count: () => t.items.length,
    onChange: fn => { t.listeners.push(fn); },
    // 卡片拆掉時呼叫：釋放所有圖片預覽的 object URL。之後才回來的上傳結果一律丟掉。
    dispose: () => { t.items.forEach(attachRevokePreview); t.items = []; t.listeners = []; },
  };
}
// 加檔：逐一檢查上限，超過的就近顯示紅框，不加入；其餘加入並開始上傳。
function trayAddFiles(t, files) {
  t.errEl.innerHTML = '';
  for (const file of files || []) {
    const why = checkAttachAdd(t.items.length, file);
    if (why === 'full') { trayShowFull(t); break; }
    if (why === 'too_large') { trayShowTooLarge(t, file); continue; }
    const item = { status: 'uploading', file };
    if (isImageAttachment(file) && typeof URL !== 'undefined' && URL.createObjectURL) item.preview = URL.createObjectURL(file);
    t.items.push(item);
    trayUpload(t, item);
  }
  trayRender(t);
}
function trayShowTooLarge(t, file) {
  t.errEl.innerHTML = '';
  t.errEl.appendChild(attachNoticeEl(`${file.name} 有 ${formatAttachBytes(file.size)}`, `，超過單檔 ${attachLimitLabel()}。可以先壓縮，或改貼截圖。`));
}
function trayShowFull(t) {
  t.errEl.innerHTML = '';
  t.errEl.appendChild(attachNoticeEl('', `一則留言最多 ${NOTE_ATTACH_MAX} 個附件，多的沒加進去。`));
}
// 上傳一個（也給「重試」用）。上傳途中被 ✕ 拿掉的，結果直接丟掉。
async function trayUpload(t, item) {
  item.status = 'uploading';
  trayRender(t);
  try {
    const r = await t.upload(item.file);
    if (!t.items.includes(item)) return;
    item.att = cleanAttachment(Object.assign({ name: item.file.name, type: item.file.type, size: item.file.size }, r));
    item.status = 'done';
  } catch (e) {
    if (!t.items.includes(item)) return;
    if (isAttachTooLargeError(e)) { trayRemove(t, item); trayShowTooLarge(t, item.file); return; }
    item.status = 'failed';
  }
  trayRender(t);
}
function trayRemove(t, item) {
  t.items = t.items.filter(i => i !== item);
  attachRevokePreview(item);
  trayRender(t);
}
function attachRevokePreview(item) {
  if (item.preview && typeof URL !== 'undefined' && URL.revokeObjectURL) URL.revokeObjectURL(item.preview);
  item.preview = null;
}
function trayRender(t) {
  t.listEl.innerHTML = '';
  t.items.forEach(item => { t.listEl.appendChild(trayItemEl(t, item)); });
  const n = t.items.length;
  t.countEl.textContent = n ? `${n}／${NOTE_ATTACH_MAX}` : '';
  t.clip.disabled = n >= NOTE_ATTACH_MAX;
  t.listeners.forEach(fn => { fn(); });
}
// 單一附件：完成的圖片＝縮圖；其餘（非圖片、上傳中檔案、失敗）＝檔案條。右上／右側 ✕ 拿掉。
function trayItemEl(t, item) {
  const name = item.att ? item.att.name : item.file.name;
  const size = item.att ? item.att.size : item.file.size;
  const isImg = isImageAttachment(item.att || item.file);
  let el;
  if (isImg && item.status !== 'failed') {
    el = attachThumbEl(name, size, item.preview || attachHref(item.att.url));
    if (item.status === 'uploading') { el.classList.add('is-uploading'); el.appendChild(attachBarEl()); }
  } else el = trayFileEl(t, item, name, size);
  const x = drawHtmlEl('button', 'pc-att-x'); x.type = 'button'; x.textContent = '✕';
  x.setAttribute('aria-label', item.status === 'uploading' ? '取消上傳' : '移除附件');
  x.onclick = ev => { ev.stopPropagation(); trayRemove(t, item); };
  el.appendChild(x);
  if (!item.shown) { item.shown = true; el.classList.add('is-new'); } // 只有第一次畫出來時淡入
  return el;
}
function trayFileEl(t, item, name, size) {
  if (item.status === 'done') return attachFileEl(name, formatAttachBytes(size));
  if (item.status === 'uploading') {
    const el = attachFileEl(name, `上傳中… ${formatAttachBytes(size)}`);
    el.classList.add('is-uploading'); el.querySelector('.meta').appendChild(attachBarEl());
    return el;
  }
  const el = attachFileEl(name, '沒傳上去 · ');
  el.classList.add('is-failed');
  const retry = drawHtmlEl('button', 'retry'); retry.type = 'button'; retry.textContent = '重試';
  retry.onclick = ev => { ev.stopPropagation(); trayUpload(t, item); };
  el.querySelector('.sz').appendChild(retry);
  return el;
}
// 上傳中的進度條（fetch 拿不到上傳進度，所以是來回跑的不定進度條）。
function attachBarEl() {
  const bar = drawHtmlEl('div', 'pc-att-bar'); bar.appendChild(drawHtmlEl('i'));
  return bar;
}
