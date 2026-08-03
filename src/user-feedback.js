/**
 * user-feedback
 * 讓「終端使用者」對頁面留言，留言直接變成 agent 的待辦卡片。
 *
 *   import { initUserFeedback } from '.../src/user-feedback.js';
 *   initUserFeedback({ projectId: 'jenny-ortho' });
 *
 * 與這個 repo 既有工具的分工——三者對象不同，不要互相取代：
 *   prototype-comments (pc.js) 給**同事**做設計審查：要 Google 登入、留言可協作 resolve。
 *   live-markup              給**她自己**在本機看的頁手繪標註，靠 CLI poll 取回。
 *   user-feedback (本檔)     給**終端使用者**（醫師、客戶）：免登入、可貼圖，
 *                            回饋由本機 bridge 轉成中控台卡片。
 *
 * 刻意不共用 pc.js 的程式碼：那支是三個 consumer 靠著的 CDN 合約，
 * 為了這裡的需求去改它會靜默炸掉別人。只共用同一個 Firebase 專案。
 *
 * 免登入是刻意的：要使用者先登入才留言，回饋率會掉。防線改成
 * 「只能寫、不能讀」＋欄位長度上限（見 firestore.rules 的 user-feedback 段）。
 * 因此這個 collection **不得存放任何敏感或個人資料**。
 */

const FB_VER = '12.13.0';
const FB_BASE = `https://www.gstatic.com/firebasejs/${FB_VER}`;

/** 共用的留言專案。config 不是 secret（apiKey 只是 public identifier）。 */
const DEFAULT_CONFIG = {
  apiKey: 'AIzaSyCsJ8HK2Wo7FJSTxwdCk3cdnOBXThpTUPo',
  authDomain: 'prototype-comments-27106.firebaseapp.com',
  projectId: 'prototype-comments-27106',
  storageBucket: 'prototype-comments-27106.firebasestorage.app',
  messagingSenderId: '1010970126486',
  appId: '1:1010970126486:web:9d1e055488207759aebab7',
};

/**
 * 圖片上限。Cloud Storage 自 2024/09 起需要 Blaze 方案才建得了 bucket，
 * 所以圖片是壓成 dataURL 存進 Firestore 文件（單文件上限 1 MiB）。
 */
const MAX_IMAGE_BYTES = 700_000;
const QUALITY_STEPS = [0.6, 0.45, 0.3];
const UI_MARKER = 'data-uf-ui';

const STYLES = `
.uf-fab{position:fixed;right:16px;bottom:16px;z-index:2147483000;display:flex;align-items:center;gap:8px;
  min-height:44px;padding:0 20px;border:0;border-radius:999px;cursor:pointer;
  font:700 15px/1 system-ui,-apple-system,"PingFang TC","Noto Sans TC",sans-serif;
  background:#1e2082;color:#fff;box-shadow:0 6px 20px rgba(0,0,0,.25)}
.uf-fab[data-active="true"]{background:#9a6fb0}
.uf-outline{position:fixed;pointer-events:none;z-index:2147482000;border:2px solid #9a6fb0;border-radius:4px;
  background:rgba(154,111,176,.12)}
.uf-backdrop{position:fixed;inset:0;z-index:2147483100;display:flex;align-items:center;justify-content:center;
  padding:16px;background:rgba(0,0,0,.45)}
.uf-panel{width:100%;max-width:480px;max-height:86vh;overflow:auto;background:#fff;color:#23255c;
  border-radius:16px;padding:20px;box-sizing:border-box;
  font:400 15px/1.6 system-ui,-apple-system,"PingFang TC","Noto Sans TC",sans-serif}
.uf-title{margin:0 0 4px;font-size:18px;font-weight:700}
.uf-target{margin:0 0 16px;font-size:14px;color:#6e6b8c;word-break:break-all}
.uf-label{display:block;margin:12px 0 4px;font-size:13px;font-weight:700;color:#6e6b8c}
.uf-input,.uf-textarea{width:100%;box-sizing:border-box;padding:10px 12px;border:1px solid #d6d3e6;
  border-radius:10px;font:inherit;font-size:16px;background:#fff;color:inherit}
.uf-textarea{min-height:96px;resize:vertical}
.uf-thumb{display:block;margin-top:12px;max-width:100%;border-radius:10px}
.uf-error{margin:12px 0 0;padding:10px 12px;border-radius:10px;background:#f7e2e2;color:#a23b3b;font-size:14px}
.uf-row{display:flex;gap:8px;justify-content:flex-end;margin-top:20px;flex-wrap:wrap}
.uf-btn{min-height:44px;padding:0 20px;border-radius:999px;border:1px solid #d6d3e6;background:#fff;
  color:#23255c;font:700 15px/1 inherit;cursor:pointer}
.uf-btn--primary{background:#1e2082;border-color:#1e2082;color:#fff}
.uf-btn[disabled]{opacity:.5;cursor:default}
.uf-toast{position:fixed;left:50%;bottom:80px;transform:translateX(-50%);z-index:2147483200;
  padding:12px 20px;border-radius:999px;background:#23255c;color:#fff;font:600 14px/1 system-ui,sans-serif}
@media (prefers-color-scheme:dark){
  .uf-panel{background:#232338;color:#f3f1fa}
  .uf-input,.uf-textarea{background:#1b1b2e;color:#f3f1fa;border-color:#38385a}
  .uf-btn{background:#232338;color:#f3f1fa;border-color:#38385a}
}
`;

async function loadFirebase() {
  const [{ initializeApp, getApps, getApp }, { getFirestore, collection, addDoc }] =
    await Promise.all([
      import(`${FB_BASE}/firebase-app.js`),
      import(`${FB_BASE}/firebase-firestore.js`),
    ]);
  return { initializeApp, getApps, getApp, getFirestore, collection, addDoc };
}

function el(tag, className, props = {}) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  Object.assign(node, props);
  node.setAttribute(UI_MARKER, '');
  return node;
}

// ─── 元素辨識 ────────────────────────────────────────────────────────────────
const SKIP_TAGS = new Set(['HTML', 'BODY', 'MAIN']);

function indexSuffixOf(node) {
  const parent = node.parentElement;
  if (!parent) return '';
  const sameTag = [...parent.children].filter(c => c.tagName === node.tagName);
  return sameTag.length < 2 ? '' : `:nth-of-type(${sameTag.indexOf(node) + 1})`;
}

/** 不用 class：多數框架的 class 每次建置都會換一組雜湊，存下來隔天就對不上 */
function cssPathOf(node) {
  const parts = [];
  let current = node;
  while (current && !SKIP_TAGS.has(current.tagName)) {
    parts.unshift(current.tagName.toLowerCase() + indexSuffixOf(current));
    current = current.parentElement;
  }
  return parts.join(' > ').slice(0, 500);
}

function describeElement(node) {
  const label = node.getAttribute('aria-label');
  if (label) return label.slice(0, 200);
  const text = (node.textContent || '').replace(/\s+/g, ' ').trim();
  if (!text) return `<${node.tagName.toLowerCase()}>`;
  return text.length > 60 ? `${text.slice(0, 60)}…` : text;
}

// ─── 圖片 ────────────────────────────────────────────────────────────────────
function drawToCanvas(bitmap, maxDim) {
  const ratio = Math.min(1, maxDim / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * ratio);
  canvas.height = Math.round(bitmap.height * ratio);
  canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return canvas;
}

function firstFitting(canvas) {
  for (const quality of QUALITY_STEPS) {
    const dataUrl = canvas.toDataURL('image/jpeg', quality);
    if (dataUrl.length <= MAX_IMAGE_BYTES) return dataUrl;
  }
  return null;
}

/** 依序降畫質再降尺寸；全部試完仍太大就丟錯，讓使用者知道要換一張 */
export async function compressToDataUrl(file) {
  const bitmap = await createImageBitmap(file);
  for (const maxDim of [1280, 900]) {
    const fitted = firstFitting(drawToCanvas(bitmap, maxDim));
    if (fitted) return fitted;
  }
  throw new Error('IMAGE_TOO_LARGE');
}

// ─── 留言者名字（跨 session 記住）───────────────────────────────────────────
// 名字存在 localStorage：使用者打一次，之後每次留言都自動帶入。
//
// 這不是身分驗證，只是省去重複打字——真實使用者（長輩、客戶）常常一次留好幾則，
// 每則都要重打名字會讓人乾脆不署名，回饋就變成「有人說某頁怪怪的」而失去可追問性。
//
// 存取一律包 try/catch：Safari 無痕模式的 localStorage 是「存在但一寫就丟例外」，
// 不是回 null；沒包起來會讓整個面板在無痕視窗掛掉。記不住只是退回每次重打，
// 不該連留言都不能送。
/**
 * 這則留言算在哪一頁。
 *
 * `page` 可以給字串，也可以給函式——函式會在**送出當下**才呼叫。
 * 這對「網址不變、內容會變」的頁面是必要的：投影片 deck 一份 HTML 有二十幾張，
 * SPA（Next.js client routing）也可能整段導覽都不重新載入。掛載當時算好的路徑
 * 到了送出那一刻早就不是使用者正在看的東西，回饋會全部歸到同一頁、失去定位能力。
 *
 * 函式丟例外時退回 location.pathname：宿主頁的取值邏輯壞掉不該讓留言送不出去。
 */
function resolvePage(opts) {
  if (typeof opts.page === 'function') {
    try {
      return String(opts.page() || '') || location.pathname;
    } catch {
      return location.pathname;
    }
  }
  return opts.page || location.pathname;
}

const REPORTER_KEY = 'uf-reporter';

function readReporter() {
  try {
    return localStorage.getItem(REPORTER_KEY) || '';
  } catch {
    return '';
  }
}

function writeReporter(name) {
  try {
    if (name) localStorage.setItem(REPORTER_KEY, name);
    else localStorage.removeItem(REPORTER_KEY);
  } catch {
    /* 記不住就算了，不影響送出 */
  }
}

// ─── 留言面板 ────────────────────────────────────────────────────────────────
function buildPanel(target, reporter) {
  const panel = el('div', 'uf-panel');
  panel.append(
    el('h2', 'uf-title', { textContent: '對這裡留言' }),
    el('p', 'uf-target', { textContent: `你點到的是：${target.elementText}` }),
    el('label', 'uf-label', { textContent: '想說什麼（必填）' }),
  );
  const note = el('textarea', 'uf-textarea');
  const name = el('input', 'uf-input', { type: 'text', value: reporter });
  const file = el('input', null, { type: 'file', accept: 'image/*', hidden: true });
  const pick = el('button', 'uf-btn', { type: 'button', textContent: '附一張圖（可省略）' });
  const cancel = el('button', 'uf-btn', { type: 'button', textContent: '取消' });
  const send = el('button', 'uf-btn uf-btn--primary', { type: 'button', textContent: '送出' });
  const row = el('div', 'uf-row');
  row.append(cancel, send);

  panel.append(
    note,
    el('label', 'uf-label', { textContent: '你的稱呼' }),
    name,
    el('div', 'uf-row', {}),
    pick,
    file,
    row,
  );
  return { panel, note, name, file, pick, cancel, send };
}

function showToast(message) {
  const toast = el('div', 'uf-toast', { textContent: message });
  document.body.append(toast);
  setTimeout(() => toast.remove(), 3500);
}

// ─── 主流程 ──────────────────────────────────────────────────────────────────

/**
 * @param {object}   opts
 * @param {string}   opts.projectId       Firestore namespace，一個產品一個 id
 * @param {string|(() => string)} [opts.page] 留言歸屬的頁面路徑，預設 location.pathname。
 *   給函式則在送出當下才求值——投影片 deck、SPA 這種「網址不變但內容會變」的頁面要用這種。
 * @param {object}  [opts.firebaseConfig] 預設共用 prototype-comments-27106
 * @param {string}  [opts.label]          浮動按鈕文字
 * @param {Function}[opts.onSent]         送出成功後的 callback
 * @param {object}  [opts._firebase]      測試注入（同 pc.js 慣例，見 test/mock-firebase.js）
 */
export async function initUserFeedback(opts = {}) {
  if (!opts.projectId) throw new Error('initUserFeedback: projectId is required');

  const fb = opts._firebase || (await loadFirebase());
  const app = fb.getApps().length
    ? fb.getApp()
    : fb.initializeApp(opts.firebaseConfig || DEFAULT_CONFIG);
  const db = fb.getFirestore(app);
  const notes = () => fb.collection(db, 'user-feedback', opts.projectId, 'notes');

  document.head.append(el('style', null, { textContent: STYLES }));

  const state = { active: false, reporter: readReporter(), outline: null };
  const fab = el('button', 'uf-fab', { type: 'button', textContent: opts.label || '給回饋' });
  document.body.append(fab);

  function setActive(next) {
    state.active = next;
    fab.dataset.active = String(next);
    fab.textContent = next ? '結束留言' : opts.label || '給回饋';
    if (!next) clearOutline();
  }

  function clearOutline() {
    state.outline?.remove();
    state.outline = null;
  }

  function isPickable(node) {
    return node instanceof Element && !node.closest(`[${UI_MARKER}]`);
  }

  function highlight(event) {
    if (!state.active || !isPickable(event.target)) return clearOutline();
    const box = event.target.getBoundingClientRect();
    state.outline = state.outline || document.body.appendChild(el('div', 'uf-outline'));
    Object.assign(state.outline.style, {
      top: `${box.top}px`, left: `${box.left}px`,
      width: `${box.width}px`, height: `${box.height}px`,
    });
  }

  /** capture 階段攔截：頁面自己的按鈕會吃掉 click，等冒泡上來就攔不到了 */
  function intercept(event) {
    if (!state.active || !isPickable(event.target)) return;
    event.preventDefault();
    event.stopPropagation();
    openDialog(event.target);
  }

  function openDialog(node) {
    setActive(false);
    const target = { selector: cssPathOf(node), elementText: describeElement(node) };
    const backdrop = el('div', 'uf-backdrop');
    const ui = buildPanel(target, state.reporter);
    backdrop.append(ui.panel);
    document.body.append(backdrop);
    wireDialog({ backdrop, ui, target });
    ui.note.focus();
  }

  function wireDialog({ backdrop, ui, target }) {
    let image = '';
    const fail = message => {
      ui.panel.querySelector('.uf-error')?.remove();
      ui.panel.append(el('p', 'uf-error', { textContent: message }));
    };

    ui.pick.onclick = () => ui.file.click();
    ui.file.onchange = async () => {
      try {
        image = await compressToDataUrl(ui.file.files[0]);
        ui.panel.querySelector('.uf-thumb')?.remove();
        ui.panel.append(el('img', 'uf-thumb', { src: image, alt: '附加的圖片' }));
      } catch {
        fail('這張圖太大了，換一張小一點的，或先截圖局部再上傳。');
      }
    };
    ui.cancel.onclick = () => backdrop.remove();
    ui.send.onclick = () => void send({ backdrop, ui, target, image: () => image, fail });
  }

  async function send({ backdrop, ui, target, image, fail }) {
    const note = ui.note.value.trim();
    if (!note) return fail('請寫一下這裡怎麼了。');
    ui.send.disabled = true;
    state.reporter = ui.name.value.trim();
    writeReporter(state.reporter);
    try {
      await fb.addDoc(notes(), {
        page: resolvePage(opts),
        selector: target.selector,
        elementText: target.elementText,
        note: note.slice(0, 2000),
        image: image(),
        reporter: state.reporter || '未署名',
        createdAt: new Date().toISOString(),
        status: 'new',
      });
      backdrop.remove();
      showToast('已送出，謝謝你的回饋');
      opts.onSent?.();
    } catch {
      ui.send.disabled = false;
      fail('送出失敗，可能是網路不穩，再按一次試試。');
    }
  }

  fab.onclick = () => setActive(!state.active);
  document.addEventListener('pointermove', highlight, true);
  document.addEventListener('click', intercept, true);

  return { setActive, destroy: () => {
    document.removeEventListener('pointermove', highlight, true);
    document.removeEventListener('click', intercept, true);
    fab.remove();
    clearOutline();
  } };
}
