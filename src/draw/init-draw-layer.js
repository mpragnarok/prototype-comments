/**
 * draw/init-draw-layer — 繪圖層的組裝與生命週期核心：initDrawLayer 建立 SVG/工具列/面板、
 * 綁定事件、管理 mode 狀態機與 undo/團隊同步，並把 draw/* 各模組（幾何/模型/渲染/工具列/面板）
 * 接線在一起。resolveTarget / resolveDrawStore 為其私有 wiring。public API 與 DOM 結構、class 名、
 * z-index、事件行為皆與拆分前一致；由 draw-layer.js 對外 re-export initDrawLayer。
 */
import { createDrawingStore } from '../store.js';
import {
  DRAW_MODES, DRAW_TOOLS, DEFAULT_DRAW_STYLE, DRAW_COLORS, DRAW_UI_COLORS, DRAW_STROKE_WIDTHS,
  DRAW_FONT_SIZES, DRAW_HEAD_MODES, arrowHeads, MIN_DRAW_SIZE_PCT,
  SVG_NS, HANDLE_FIXED, ICON_PATHS, icon,
  DRAW_BRUSHES, BRUSH_LABELS, BRUSH_ICON, BRUSH_RENDER, brushStyle,
  TOOL_SHORTCUTS, TOOL_LABELS_ZH, TOOL_KEY, resolveShortcut, resolveShortcutByCode,
  isLocalEnv,
} from './constants.js';
import {
  pxToPct, pctToPx, clientToPct, rectFromPoints, diamondPoints, imageGeom,
  geomFromDrag, freehandPath, taperedOutline, geomBBox, labelAnchor, translateGeom,
  remapGeom, boxCorner, resizeBBox, setEndpoint, SNAP_THRESHOLD_PCT, rectAnchorPoints,
  objectSnapPoints, nearestSnap, nearestPointOnRect, anchorRel, resolveEndpoints, mergeEndAnchor, assignGroupId,
  clearGroupId, expandSelectionToGroups, marqueeSelect, isOutlinedShape, objHitDist,
} from './geometry.js';
import {
  cssSelectorFor, buildExport, commentViewGeom, annotationSig, decisionSig, noteSig,
  annotationRows,
} from './selectors.js';
import {
  reorderMany, applyStylePatch, eyedropperSupported, applyCommand, invertCommand, makeUndoStack,
  nextDrawId, nextGroupId, bumpIdSeq, makeDrawObject, serializeDrawObject, serializeObjectsForLocal,
  hydrateObjectsFromLocal, drawingToDoc,
  mergeTombstones, isTombstoned, filterTombstoned, compactTombstones,
} from './model.js';
import {
  drawSvgEl, drawHtmlEl,
} from './dom.js';
import {
  injectDrawStyles,
} from './styles.js';
import {
  toPxBox, findById, initialGeom, updateGeom, isDrawn, renderObject,
  renderLabel, sizeLabelBg, buildArrowhead,
} from './render.js';
import {
  buildToolbar, buildContextMenu, syncToolbar,
} from './toolbar.js';
import {
  buildRecordTab, buildRecordDrawer, recordRowEl, replyCardEl,
} from './record-panel.js';

function resolveTarget(target) {
  if (!target) return document.body;
  if (typeof target === 'string') return document.querySelector(target) || document.body;
  return target;
}

// ── init ────────────────────────────────────────────────────────────────────
export function initDrawLayer(target, opts = {}) {
  injectDrawStyles();
  const host = resolveTarget(target);
  if (getComputedStyle(host).position === 'static') host.style.position = 'relative';

  const svg = drawSvgEl('svg', { id: 'pc-draw' });
  buildArrowhead(svg);
  host.appendChild(svg);
  // ── 單一參考軸座標系 ──────────────────────────────────────────────────────
  // x、y 都以「畫布寬」換算 → 上下拉動視窗 / 手機網址列收合（只改高度）時，標注不縮放、不變形。
  // 回傳保留 left/top（hit-test 用），width、height 皆為畫布寬的方形參考 rect。
  function coordRect() {
    const r = svg.getBoundingClientRect();
    const w = svg.clientWidth || host.clientWidth || r.width;
    return { left: r.left, top: r.top, width: w, height: w };
  }
  // AI 方案卡層：錨定在標注旁的回覆卡（不依賴 lavish，走自家 reply 通道）。容器不吃指標、卡片才吃。
  const replyLayer = drawHtmlEl('div', 'pc-draw-reply-layer');
  host.appendChild(replyLayer);
  // 留言 pin 層：與 #pc-draw 同一個 box（同座標系）。comment 模式吃指標 → 點空白放 pin；pin/泡泡永遠可點。
  const noteLayer = drawHtmlEl('div', 'pc-note-layer');
  noteLayer.id = 'pc-note-layer';
  host.appendChild(noteLayer);

  const state = {
    mode: opts.mode && DRAW_MODES.includes(opts.mode) ? opts.mode : 'off',
    tool: 'select',
    objects: [],      // DrawObject[]（committed，陣列順序＝z-order）
    draft: null,      // 進行中的 DrawObject（尚未送出）
    selectedIds: [],  // 多選：目前選取的物件 id 集合（陣列保序）
    marquee: null,    // 進行中的橡皮筋框 {x,y,w,h}（% 座標）
    brushType: 'pen', // 自由筆刷類型 pen/marker/highlighter
    exportEndpoint: opts.exportEndpoint || null, // 「送給 AI」POST 目標（無則只回 payload）
    recordOpen: false, // P6 側邊標注紀錄抽屜開關（預設關 → 不打擾一般使用）
    sentSigs: {},      // {objId: 上次成功送出時的內容簽章} → 面板每列顯示「已送/未送」
    sentConfirmN: 0,   // 上次成功送出的筆數。outbox 下已送項會離開清單，靠此讓 footer 維持「✅ 已送出（N 筆）」確認，不退回「送給 AI（0）」假失敗態
    sendUnchecked: {}, // {objId: true} → 該列「不納入送出」（預設全勾；新物件預設納入）
    replies: [],       // AI 貼回頁面的方案卡（{n, anchor, text, options, chosen?}）
    replyCursor: 0,    // reply-poll 游標
    decisions: [],     // 在方案卡上選的「決定」佇列（{id, replyId, optionId, optionLabel, text}）→ 進標注紀錄、隨批送出
    editingId: null,   // 正在以輸入框編輯的文字物件 id（render 時隱藏原件，避免重疊兩個框）
    collapsed: false,  // 工具列是否收合成右下 FAB（按 ✕ 收合；點 FAB / 按工具快捷鍵展開）
    notes: [],      // 註記 pin（{id, kind:'note', text, x, y}；x/y 為 % 座標，同繪圖座標系）
    tombstones: {}, // 墓碑 {id: deletedAt(ms)}：刪除不移除紀錄、改記墓碑 → 舊快照回寫無法復活已刪項
  };
  const history = makeUndoStack();
  // ── 決策 A：頁面/screen 歸屬（選用 opts.getScreenId）──────────────────────────
  // 傳入 getScreenId() → 新標注/註記存檔時打上當前 screenId；render/清單只顯示當前 screen
  // 的項目（不刪物件，換頁只是不畫、換回還在）。未傳 → currentScreenId()=null → 一律全畫（向後相容）。
  const currentScreenId = () => (typeof opts.getScreenId === 'function' ? (opts.getScreenId() ?? null) : null);
  // 某項目（obj/note）是否屬於當前 screen：未啟用 screen 過濾、或項目無 screenId（全域/舊資料）、或相符 → true。
  const onCurrentScreen = (x) => (typeof opts.getScreenId !== 'function') || !x || x.screenId == null || x.screenId === currentScreenId();
  // ── P7 團隊持久（選用）：把 opts.persist 解析成 drawings store（ready store 或 {fb,db,projectId}）。
  // 失敗或未提供 → drawStore = null → 一律走純本地（dev 模式 0 Firebase）。
  const drawStore = resolveDrawStore(opts.persist);
  // ── dev 模式本機持久化（無 drawStore + persistLocal !== false 時啟用）──────────
  // 讓 dev 環境重整後仍保留向量標注。image 不存（dataURL 佔空間太大，§4.6 哲學）。
  const localKey = 'pc-draw-local:' + (opts.projectId || 'default');
  const _storage = opts._storage || (typeof localStorage !== 'undefined' ? localStorage : null);
  const useLocalPersist = !drawStore && opts.persistLocal !== false;
  // 送出後「已送」狀態（sentSigs）是每個瀏覽器的本地觀看狀態（非協作資料）→ 即使走 drawStore
  // 團隊模式也存 localStorage。修 bug：不持久化時重整/重訂閱後 sentSigs 歸零，已送標注會從
  // drawStore/本地快照被當「未送」重新畫回畫布與清單（「送出後又出現」）。
  const sentKey = 'pc-draw-sent:' + (opts.projectId || 'default');
  function persistSentState() {
    if (!_storage) return;
    try { _storage.setItem(sentKey, JSON.stringify({ sentSigs: state.sentSigs, sentConfirmN: state.sentConfirmN })); } catch (_) { /* 配額/隱私模式失敗不影響繪圖 */ }
  }
  function loadSentState() {
    if (!_storage) return;
    try {
      const raw = _storage.getItem(sentKey);
      if (!raw) return;
      const s = JSON.parse(raw);
      if (s && typeof s === 'object') { state.sentSigs = s.sentSigs || {}; state.sentConfirmN = s.sentConfirmN || 0; }
    } catch (_) { /* 損毀 → 從空白開始 */ }
  }
  function persistLocalSave() {
    if (!useLocalPersist || !_storage) return;
    try {
      // 併回寫（read-merge-write）：先讀既有快照，把本地墓碑與快照裡的墓碑合併（deletedAt 最新者贏），
      // 再用合併後的墓碑過濾 objects/notes 才寫回。→ 別的分頁刪掉的項目，不會被本分頁的舊快照回寫復活。
      let storedTombs = null;
      try { const prev = JSON.parse(_storage.getItem(localKey) || '{}'); storedTombs = prev && prev.tombstones; } catch (_) { }
      const tombstones = mergeTombstones(state.tombstones, storedTombs);
      state.tombstones = tombstones; // 吸收別分頁的墓碑到本地，供後續合併/過濾
      _storage.setItem(localKey, JSON.stringify({
        objects: filterTombstoned(serializeObjectsForLocal(state.objects), tombstones),
        notes: filterTombstoned(state.notes, tombstones),
        tombstones,
      }));
    } catch (_) { }
  }
  let unsubDraw = null;   // remote 訂閱解除函式（destroy 時呼叫）
  let drag = null;    // 繪製中：{ tool, rect, start, points }

  // ── 元件留言（comment 模式）：hover 框元件 → 點選 → 對「那個元件」下 prompt，AI 回方案卡 ──
  //   錨定：DOM 元件存 sel（querySelector round-trip）、自繪物件存 objId；relX/relY＝點擊處相對框內位置；
  //   x/y＝解析失敗時 fallback %（也讓 live-markup poll 仍讀得到座標）。資料走 `<projectId>__comments` 分區。
  let pendingAnchor = null;  // 新卡尚未存檔前的錨點
  let focusNoteId = null;
  let hoverBox = null;       // hover 高亮框 DOM

  // 解析留言錨點 → pin 點（svg % 座標）。有 sel/objId 解得到 → 跟著元件；否則 fallback x/y。
  function resolveNotePct(c) {
    const r = resolveNoteBox(c);
    if (r) return { x: r.x + (c.relX != null ? c.relX : 0.5) * r.w, y: r.y + (c.relY != null ? c.relY : 0.5) * r.h };
    return { x: c.x != null ? c.x : 50, y: c.y != null ? c.y : 50 };
  }
  // 解析留言錨定元件的「整塊範圍」（寬-% bbox）。供持續外框用；fallback（僅 x/y）時回 null。
  function resolveNoteBox(c) {
    let r = null;
    if (c.sel) r = getRectPct(c.sel);
    else if (c.objId != null) { const t = findById(state.objects, c.objId); if (t) r = geomBBox(t, resolveO); }
    return r && r.w != null ? r : null;
  }
  // 放/改一則留言。anchor＝{sel,objId,relX,relY,x,y,label}；id 有值 → 只更新文字。
  function noteToDoc(c) {
    const doc = { id: c.id, kind: 'note', text: c.text };
    if (c.sel != null) doc.sel = c.sel;
    if (c.objId != null) doc.objId = c.objId;
    if (c.relX != null) doc.relX = c.relX;
    if (c.relY != null) doc.relY = c.relY;
    if (c.x != null) doc.x = c.x;
    if (c.y != null) doc.y = c.y;
    if (c.label != null) doc.label = c.label;
    if (c.screenId != null) doc.screenId = c.screenId; // 決策 A：頁面/screen 歸屬（有才帶）
    return doc;
  }
  function saveNote(text, anchor, id) {
    const t = String(text || '').trim();
    if (!t) return null;
    const existing = id && state.notes.find(c => c.id === id);
    let c;
    if (existing) { existing.text = t; c = existing; }
    else {
      c = Object.assign({ id: nextDrawId(), kind: 'note', text: t }, anchor || {});
      if (typeof opts.getScreenId === 'function' && c.screenId == null) c.screenId = currentScreenId(); // 決策 A：新註記歸屬當前 screen
      state.notes.push(c);
    }
    renderNotes();
    renderRecordPanel(); // 加/改 note 後同步標注紀錄面板（新列 + 全選框 checked/indeterminate 狀態）
    if (drawStore) { try { existing ? drawStore.save({ id: c.id, kind: 'note', text: t }) : drawStore.save(noteToDoc(c)); } catch (_) { } }
    persistLocalSave();
    return c;
  }
  function deleteNote(id) {
    state.notes = state.notes.filter(c => c.id !== id);
    state.tombstones[id] = Date.now(); // 墓碑：記下刪除時間 → 舊快照回寫無法復活
    if (focusNoteId === id) focusNoteId = null;
    const card = noteLayer.querySelector(`.pc-note-card[data-note-id="${id}"]`);
    if (card) card.remove();
    renderNotes();
    renderRecordPanel(); // 同步標注紀錄面板：卡片『刪除』鈕直呼此函式，漏此行則已刪 note 殘留在紀錄側欄
    if (drawStore) { try { syncTombstone(id); } catch (_) { } }
    persistLocalSave();
  }
  // 留言錨定的 DOM selector 集合 → live reposition 監聽用。
  function noteSelectors() { const s = new Set(); state.notes.forEach(c => { if (c.sel) s.add(c.sel); }); return s; }

  // ── 渲染留言標記（只動 .pc-note-mark；開著的卡跟著元件重新定位）──
  // 取消勾選（不送 AI）的 note 直接不畫（與「畫的標注」一致：uncheck → 從畫布消失）。
  // 編號只對「已勾選」連續給 1..n，與送出的 p.notes 陣列順序一致 → 截圖角標可對照 JSON。
  function renderNotes() {
    [...noteLayer.querySelectorAll('.pc-note-mark')].forEach(n => n.remove());
    let n = 0;
    state.notes.forEach((c) => {
      if (!onCurrentScreen(c)) return; // 決策 A：不屬當前頁的註記不畫
      if (state.sendUnchecked[c.id]) return;
      noteLayer.appendChild(notePin(c, ++n));
    });
    repositionNoteCard();
  }
  // 一則 note → 持續實線外框（貼齊元件範圍、零間隙）+ 左上角落圓 badge（編號）。
  // badge 騎在框「角」外側（不落在框內緣）→ 不覆蓋元件內容；外框 pointer-events:none，
  // 只有 badge 可點開卡。圓形小（21px）放不下 icon，只留數字 → 靠外框本身區分「這是 note」。
  function notePin(c, n) {
    const mark = drawHtmlEl('div', 'pc-note-mark' + (c.objId != null ? ' is-obj' : ''));
    mark.dataset.noteId = c.id;
    const box = resolveNoteBox(c);
    if (box) {
      const b = pctToPxBox(box);
      mark.style.left = b.x + 'px'; mark.style.top = b.y + 'px';
      mark.style.width = b.w + 'px'; mark.style.height = b.h + 'px';
    } else {
      const xy = noteXY(resolveNotePct(c)); // 無法解析範圍 → 退化成點，只掛 badge
      mark.classList.add('is-point');
      mark.style.left = xy.x + 'px'; mark.style.top = xy.y + 'px';
    }
    const tab = drawHtmlEl('button', 'pc-note-tab');
    tab.textContent = String(n);
    tab.title = c.text;
    tab.onclick = (e) => { e.stopPropagation(); openNoteCard(c); };
    mark.appendChild(tab);
    return mark;
  }

  // ── hover 框元件（inspect 式虛線）。先測自繪物件命中 → 否則底層 DOM 元件 ──
  function clearHover() { if (hoverBox) { hoverBox.remove(); hoverBox = null; } }
  function onNoteHover(e) {
    if (state.mode !== 'note') { clearHover(); return; }
    if (e.target.closest && e.target.closest('.pc-note-card, .pc-note-mark')) { clearHover(); return; }
    const tg = pickTarget(e.clientX, e.clientY);
    if (!tg) { clearHover(); return; }
    if (!hoverBox) {
      hoverBox = drawHtmlEl('div', 'pc-note-hl');
      hoverBox.appendChild(drawHtmlEl('div', 'pc-note-hl-label'));
      noteLayer.appendChild(hoverBox);
    }
    hoverBox.className = 'pc-note-hl ' + (tg.objId != null ? 'is-obj' : 'is-dom');
    const b = pctToPxBox(tg.pctRect);
    hoverBox.style.left = b.x + 'px'; hoverBox.style.top = b.y + 'px';
    hoverBox.style.width = b.w + 'px'; hoverBox.style.height = b.h + 'px';
    hoverBox.firstChild.textContent = tg.label;
  }
  // 單一參考軸：note 的 x、y、w、h 都以「層寬」換算（與 coordRect/getRectPct 一致；
  // 舊版 y/h 用 clientHeight → 非正方畫布上標的元件外框會跑掉）。
  function pctToPxBox(r) {
    const w = noteLayer.clientWidth;
    return { x: pctToPx(r.x, w), y: pctToPx(r.y, w), w: pctToPx(r.w, w), h: pctToPx(r.h, w) };
  }
  // 寬-% 點 → px。CSS top 的 % 是相對「高」，不能直接套寬-% 的 y，故一律換算成 px。
  function noteXY(p) { const w = noteLayer.clientWidth; return { x: pctToPx(p.x, w), y: pctToPx(p.y, w) }; }
  // 找游標下的目標：自繪物件（topmost bbox 命中）優先 → 否則底層 DOM 元件。
  function pickTarget(clientX, clientY) {
    const pt = clientToPct(clientX, clientY, coordRect()); // 單一參考軸：與 geomBBox/getRectPct（寬-%）同基準
    for (let i = state.objects.length - 1; i >= 0; i--) {
      const o = state.objects[i];
      if (isSent(o) || state.sendUnchecked[o.id] || o.id === state.editingId) continue;
      const bb = geomBBox(o, resolveO);
      if (bb && pt.x >= bb.x && pt.x <= bb.x + bb.w && pt.y >= bb.y && pt.y <= bb.y + bb.h) {
        return { objId: o.id, sel: null, pctRect: bb, label: '我畫的' + objToolLabel(o), pt };
      }
    }
    const el = elementUnderPointC(clientX, clientY);
    const sel = elSnapSelector(el);
    if (!sel) return null;
    const r = getRectPct(sel);
    if (!r) return null;
    return { objId: null, sel, pctRect: r, label: domLabel(el), pt };
  }
  // 同 elementUnderPoint，但也暫時關掉 noteLayer 指標 → 取得底層 app 元件。
  function elementUnderPointC(clientX, clientY) {
    const prev = noteLayer.style.pointerEvents; noteLayer.style.pointerEvents = 'none';
    const el = elementUnderPoint(clientX, clientY);
    noteLayer.style.pointerEvents = prev;
    return el;
  }
  function objToolLabel(o) {
    return ({ rect: '方框', ellipse: '圈', diamond: '菱形', arrow: '箭頭', line: '線', pencil: '筆跡', text: '文字' })[o.tool] || '標注';
  }
  function domLabel(el) {
    if (!el) return '元件';
    const tag = (el.tagName || '').toLowerCase();
    const txt = (el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 14);
    return tag + (txt ? ' · ' + txt : '');
  }
  function relWithin(tg) {
    const r = tg.pctRect, pt = tg.pt;
    const rx = r.w ? (pt.x - r.x) / r.w : 0.5, ry = r.h ? (pt.y - r.y) / r.h : 0.5;
    return { relX: Math.max(0, Math.min(1, rx)), relY: Math.max(0, Math.min(1, ry)) };
  }

  // ── 對話卡（H：prompt 在上、AI 方案卡在下，整段貼著元件）──
  function closeAllNoteCards() {
    noteLayer.querySelectorAll('.pc-note-card').forEach(n => n.remove());
    pendingAnchor = null;
    focusNoteId = null;
  }
  function closeNoteCard() { closeAllNoteCards(); }
  function setFocusNote(id) {
    focusNoteId = id;
    noteLayer.querySelectorAll('.pc-note-mark').forEach(mark => {
      const isTarget = mark.dataset.noteId === String(id) && id != null;
      // spotlight：聚焦那則罩暗四周 + 亮環（業界導覽庫做法，讓被註記元件絕對看得到、也「指向」它）；其餘變暗。
      mark.classList.toggle('is-spotlight', isTarget);
      mark.classList.toggle('is-dim', !isTarget && id != null);
    });
    noteLayer.querySelectorAll('.pc-note-card').forEach(card => {
      card.classList.toggle('is-focused', card.dataset.noteId === String(id));
    });
  }
  function repositionNoteCard() {
    noteLayer.querySelectorAll('.pc-note-card').forEach(card => {
      const noteId = card.dataset.noteId;
      const c = noteId === 'new' ? pendingAnchor : state.notes.find(x => x.id === noteId);
      if (!c) return;
      const xy = noteXY(resolveNotePct(c)); card.style.left = xy.x + 'px'; card.style.top = xy.y + 'px';
    });
  }
  // 開卡：existing note（有 id）→ 顯示 prompt + 編輯/刪除 + AI 方案卡；newAnchor → 空白輸入。
  function openNoteCard(arg) {
    const isNew = !(arg && arg.id);
    const noteId = isNew ? 'new' : arg.id;
    const existingCard = noteLayer.querySelector(`.pc-note-card[data-note-id="${noteId}"]`);
    if (existingCard) { setFocusNote(noteId); return; }
    closeAllNoteCards(); // 單一對話框：開新的前先關掉其他開著的（含未送出的新註記草稿 → 直接丟棄）
    clearHover();
    if (isNew) pendingAnchor = arg;
    const card = drawHtmlEl('div', 'pc-note-card');
    card.dataset.noteId = noteId;
    const xy = noteXY(resolveNotePct(arg)); card.style.left = xy.x + 'px'; card.style.top = xy.y + 'px';
    const head = drawHtmlEl('div', 'pc-note-card-head');
    const tgt = drawHtmlEl('span', 'pc-n-target'); tgt.textContent = (arg.objId != null ? '◆ ' : '▢ ') + (arg.label || '元件');
    const x = drawHtmlEl('button'); x.textContent = '✕'; x.title = '關閉'; x.onclick = () => { card.remove(); renderNotes(); };
    head.append(tgt, x); card.appendChild(head);
    const body = drawHtmlEl('div', 'pc-note-card-body'); card.appendChild(body);
    if (!isNew && arg.text) renderCardView(body, arg); else renderCardInput(body, arg, '');
    noteLayer.appendChild(card);
    setFocusNote(noteId);
    const ta = card.querySelector('textarea'); if (ta) ta.focus();
  }
  // 已存狀態：prompt 泡泡 + 編輯/刪除 + （若有對應 AI 方案卡）內嵌方案卡 + 放大閱讀。
  function renderCardView(body, c) {
    body.innerHTML = '';
    const pr = drawHtmlEl('div', 'pc-note-prompt-text');
    const lb = drawHtmlEl('div', 'pc-note-prompt-lbl'); lb.textContent = '我的 prompt';
    pr.appendChild(lb); pr.appendChild(document.createTextNode(c.text)); body.appendChild(pr);
    const row = drawHtmlEl('div', 'pc-note-row');
    const edit = drawHtmlEl('button', 'ghost'); edit.textContent = '編輯'; edit.onclick = () => renderCardInput(body, c, c.text);
    const del = drawHtmlEl('button', 'danger'); del.textContent = '刪除'; del.onclick = () => deleteNote(c.id);
    row.append(edit, del); body.appendChild(row);
    const rep = state.replies.find(r => r.commentId === c.id);
    if (rep) {
      const slot = drawHtmlEl('div', 'pc-note-reply-slot'); slot.appendChild(replyCardInline(rep));
      const exp = drawHtmlEl('button', 'pc-note-expand'); exp.textContent = '⤢ 放大閱讀';
      exp.onclick = () => openNotePanel(c, rep); slot.appendChild(exp);
      body.appendChild(slot);
    }
  }
  function renderCardInput(body, c, initial) {
    body.innerHTML = '';
    const ta = document.createElement('textarea');
    ta.value = initial; ta.placeholder = '對這個元件說…（Enter 存紀錄 · ⌘Enter 送 AI）';
    const row = drawHtmlEl('div', 'pc-note-row');
    const send = drawHtmlEl('button'); send.textContent = c.id ? '更新' : '存紀錄'; // 存進標注紀錄佇列（非直接送 AI）
    const cancel = drawHtmlEl('button', 'ghost'); cancel.textContent = '取消';
    const isEdit = !!c.id;
    // 存 note；alsoSend=true → 存完直接送 AI（隨批送出目前已勾選那批，含這則）。
    const submit = (alsoSend) => {
      const saved = saveNote(ta.value, isEdit ? null : pendingAnchor, c.id || null);
      if (!saved) return;
      const currentCard = body.closest('.pc-note-card'); if (currentCard) currentCard.remove();
      // 編輯 → 存完重開 VIEW 卡看結果；新增 → 存完關閉（marker 已放好，要看再點）。
      if (isEdit) openNoteCard(saved); else closeNoteCard();
      if (alsoSend) sendToAgent();
    };
    send.onclick = () => submit(false);
    cancel.onclick = () => {
      if (c.id) { const currentCard = body.closest('.pc-note-card'); if (currentCard) currentCard.remove(); openNoteCard(c); }
      else closeNoteCard();
    };
    row.append(cancel, send); body.append(ta, row);
    ta.addEventListener('keydown', ev => {
      if (ev.isComposing || ev.keyCode === 229) return; // 注音/IME 組字中的 Enter（含 Safari/舊 WebKit keyCode 229）→ 放行給輸入法選字，不觸發送出/存檔
      if (ev.key === 'Enter' && (ev.metaKey || ev.ctrlKey)) { ev.preventDefault(); submit(true); }      // ⌘/Ctrl+Enter → 送 AI
      else if (ev.key === 'Enter' && !ev.shiftKey) { ev.preventDefault(); submit(false); }              // Enter → 存標注紀錄
      else if (ev.key === 'Escape') { ev.preventDefault(); if (c.id) { const cur = body.closest('.pc-note-card'); if (cur) cur.remove(); openNoteCard(c); } else closeNoteCard(); }
      // Shift+Enter → 換行（不攔截，textarea 預設行為）
    });
    ta.focus();
  }
  // 內嵌 AI 方案卡：重用 replyCardEl，拔掉絕對定位 → 塞進對話卡/面板。
  function replyCardInline(rep) {
    const el = replyCardEl(rep, (r, o) => submitChoice(r, o), () => { }, rechoose);
    el.style.position = 'static'; el.style.transform = 'none'; el.style.maxWidth = '100%';
    el.style.boxShadow = 'none'; el.style.border = '1px solid #e2e8f0';
    return el;
  }
  // 兩段式：放大成置中大面板（複雜圖文好讀）。
  function closeNotePanel() { [...host.querySelectorAll('.pc-note-backdrop, .pc-note-panel')].forEach(n => n.remove()); }
  function openNotePanel(c, rep) {
    closeNotePanel();
    const back = drawHtmlEl('div', 'pc-note-backdrop'); back.onclick = closeNotePanel;
    const panel = drawHtmlEl('div', 'pc-note-panel');
    const head = drawHtmlEl('div', 'pc-note-panel-head');
    const ti = drawHtmlEl('span'); ti.textContent = '💬 ' + (c.label || '元件') + ' · AI 方案';
    const x = drawHtmlEl('button'); x.textContent = '✕'; x.onclick = closeNotePanel;
    head.append(ti, x);
    const pbody = drawHtmlEl('div', 'pc-note-panel-body');
    const pr = drawHtmlEl('div', 'pc-note-prompt-text');
    const lb = drawHtmlEl('div', 'pc-note-prompt-lbl'); lb.textContent = '我的 prompt';
    pr.appendChild(lb); pr.appendChild(document.createTextNode(c.text)); pbody.appendChild(pr);
    if (rep) { const slot = drawHtmlEl('div', 'pc-note-reply-slot'); slot.appendChild(replyCardInline(rep)); pbody.appendChild(slot); }
    panel.append(head, pbody); host.append(back, panel);
  }

  // comment 模式：hover 框元件、點選開卡。
  noteLayer.addEventListener('pointermove', onNoteHover);
  noteLayer.addEventListener('pointerleave', clearHover);
  noteLayer.addEventListener('click', (e) => {
    if (state.mode !== 'note') return;
    if (e.target.closest && e.target.closest('.pc-note-mark, .pc-note-card')) return; // 點在標記/卡 → 各自 handler 處理
    const tg = pickTarget(e.clientX, e.clientY);
    if (!tg) return;
    // 點到「已有註記的目標」（同 sel / 同自繪 objId）→ 開該註記聚焦編輯，不再誤建新。
    //（note mark 外框 pointer-events:none，點擊會穿到底層元件；沒有這個 guard 就會在既有註記上重複建新。）
    const existing = state.notes.find(nt => (tg.sel && nt.sel === tg.sel) || (tg.objId != null && nt.objId === tg.objId));
    if (existing) { openNoteCard(existing); return; }
    const rel = relWithin(tg);
    openNoteCard({ sel: tg.sel, objId: tg.objId, relX: rel.relX, relY: rel.relY, x: tg.pt.x, y: tg.pt.y, label: tg.label });
  });
  const actions = { setMode, setTool, setBrush, setColor, setStrokeWidth, setFontSize, setHeads, act, eyedropper: openEyedropper, closeContext: closeContextMenu, send: () => sendToAgent(), openRecord: () => { state.recordOpen = true; renderRecordPanel(); }, collapse: () => collapseToolbar(), toggleNote: () => toggleNote() };
  const toolbar = buildToolbar(state, actions, opts);
  document.body.appendChild(toolbar);
  // 收合 FAB：off（放行）模式時工具列收起、改顯右下小圓鈕；點它展開工具列並進繪圖模式。
  const fab = drawHtmlEl('button', 'pc-draw-fab');
  fab.title = '開始標注';
  fab.setAttribute('aria-label', '開始標注');
  fab.innerHTML = icon('pencil');
  fab.onclick = () => expandToolbar();
  document.body.appendChild(fab);
  const contextMenu = buildContextMenu(actions);
  document.body.appendChild(contextMenu);

  // 選取集合小工具
  const isSelected = id => state.selectedIds.includes(id);
  // 已送出且未再改 → 從畫布隱藏（仍保留在標注紀錄）。讓畫面只剩「還沒送的」標注。
  const isSent = o => o && o.id != null && state.sentSigs[o.id] === annotationSig(o);
  const selectOnly = id => { state.selectedIds = id ? [id] : []; };
  const toggleSelect = id => {
    state.selectedIds = isSelected(id) ? state.selectedIds.filter(x => x !== id) : [...state.selectedIds, id];
  };
  const selectedObjects = () => state.selectedIds.map(id => findById(state.objects, id)).filter(Boolean);

  // ── P6 側邊標注紀錄面板（右緣 tab + 抽屜）─────────────────────────────────────────
  const recordTab = buildRecordTab(() => { state.recordOpen = !state.recordOpen; renderRecordPanel(); });
  const recordDrawer = buildRecordDrawer(() => { state.recordOpen = false; renderRecordPanel(); });
  const drawerSendBtn = recordDrawer.querySelector('.pc-draw-rec-send-btn');
  if (drawerSendBtn) drawerSendBtn.onclick = () => handleDrawerSend();
  // 標注紀錄「送出時納入哪些」勾選集合：unchecked 內的不送（預設全送）。
  // outbox：送出對象＝勾選且「尚未送過（或送後又改過）」；已送未改的不再重複送。
  const checkedObjects = () => state.objects.filter(o => !state.sendUnchecked[o.id] && !isSent(o));
  const checkedDecisions = () => state.decisions.filter(d => !state.sendUnchecked[d.id] && state.sentSigs[d.id] !== decisionSig(d));
  const onToggleSendChecked = (id, checked) => {
    // 有 groupId → 整組一起勾/取消；否則只動自己（decision 無 groupId 也走單一）。
    const o = state.objects.find(x => x.id === id);
    const ids = (o && o.groupId) ? state.objects.filter(x => x.groupId === o.groupId).map(x => x.id) : [id];
    ids.forEach(i => { if (checked) delete state.sendUnchecked[i]; else state.sendUnchecked[i] = true; });
    render(); // 立即從畫布隱藏/顯示 + 連帶 renderRecordPanel 更新列與截圖預覽
  };
  const removeDecision = (id) => { state.decisions = state.decisions.filter(d => d.id !== id); delete state.sendUnchecked[id]; delete state.sentSigs[id]; renderRecordPanel(); };
  const removeNote = (id) => deleteNote(id); // deleteNote 已含 renderRecordPanel（畫布+紀錄面板都同步）
  const drawerAllBox = recordDrawer.querySelector('.pc-draw-rec-all');
  if (drawerAllBox) drawerAllBox.onchange = () => {
    state.sendUnchecked = {};
    // 取消全選：objects + decisions + notes 全部設未勾選（舊版只含 objects → notes/decisions 漏掉）。
    if (!drawerAllBox.checked) [...state.objects, ...state.decisions, ...state.notes].forEach(x => { state.sendUnchecked[x.id] = true; });
    render(); // 用 render（非只 renderRecordPanel）→ 未勾選的 note/物件即時從畫布消失，畫面與截圖一致
  };
  document.body.appendChild(recordDrawer);
  document.body.appendChild(recordTab);

  // ── 回饋匣（opt-in opts.feedbackBox / api.setFeedbackBox）：右下常駐「📮 送出回饋（N）」單鍵 ──
  //   N＝未送出的標註 + 已選未送出的決策 + 未送出的註記。按一下＝一次打包送出：
  //   決策寫 choice doc（與 hub 既有 pc-draw.json `tool:'choice'` 資料流一致）；標註/註記標記已送出
  //   （其向量早在畫/存的當下就經 drawStore 落盤）。取代「決策按🚀、標註另外送」兩套。
  let feedbackBox = null;
  function ensureFeedbackBox() {
    if (feedbackBox) return feedbackBox;
    feedbackBox = drawHtmlEl('button', 'pc-draw-feedback-box');
    feedbackBox.type = 'button';
    feedbackBox.onclick = () => handleFeedbackSend();
    document.body.appendChild(feedbackBox);
    renderFeedbackBox();
    return feedbackBox;
  }
  function removeFeedbackBox() { if (feedbackBox) { feedbackBox.remove(); feedbackBox = null; } }
  const uncheckedUnsentNotes = () => state.notes.filter(n => !state.sendUnchecked[n.id] && state.sentSigs[n.id] !== noteSig(n));
  function feedbackCount() { return checkedObjects().length + checkedDecisions().length + uncheckedUnsentNotes().length; }
  function renderFeedbackBox() {
    if (!feedbackBox || feedbackBox.dataset.inflight) return; // 送出中/回執顯示中 → 不覆寫
    const n = feedbackCount();
    feedbackBox.textContent = `📮 送出回饋（${n}）`;
    feedbackBox.disabled = n === 0;
    feedbackBox.classList.toggle('is-empty', n === 0);
  }
  // 決策 → choice doc（沿用 decide.js 既有格式；stable id 讓重送覆蓋而非累積）。
  function decisionToChoiceDoc(d) {
    return {
      id: 'decision-' + d.id, tool: 'choice',
      anchor: d.anchor || 'feedback-box',
      page: (typeof document !== 'undefined' && document.title) || '',
      text: d.text || ('決定：' + (d.optionLabel || d.optionId || d.id)),
    };
  }
  async function handleFeedbackSend() {
    if (!feedbackBox || feedbackBox.dataset.inflight) return;
    const objs = checkedObjects(), decs = checkedDecisions(), notes = uncheckedUnsentNotes();
    const n = objs.length + decs.length + notes.length;
    if (!n) return; // 全沒東西 → 不送
    feedbackBox.dataset.inflight = '1';
    feedbackBox.disabled = true;
    feedbackBox.textContent = '送出中…';
    // 決策寫 choice doc（drawStore 落盤 → agent 讀得到）。任一失敗 → 保留佇列、提示可重送。
    let ok = true;
    if (drawStore) {
      for (const d of decs) {
        try { await Promise.resolve(drawStore.save(decisionToChoiceDoc(d))); } catch (_) { ok = false; }
      }
    }
    if (!ok) {
      feedbackBox.textContent = '⚠️ 送出失敗，再點一次';
      feedbackBox.classList.remove('is-empty');
      feedbackBox.disabled = false;
      delete feedbackBox.dataset.inflight;
      return;
    }
    // 標註/註記早已由 drawStore 自動落盤（畫/存的當下）→ 這裡標記已送出：離開未送清單、從畫布隱藏。
    objs.forEach(o => { state.sentSigs[o.id] = annotationSig(o); });
    decs.forEach(d => { state.sentSigs[d.id] = decisionSig(d); });
    notes.forEach(nn => { state.sentSigs[nn.id] = noteSig(nn); });
    state.sentConfirmN = n;
    persistSentState(); // 修 bug：持久化「已送」→ 重整/重訂閱後不再把已送標註當未送畫回
    render(); // 隱藏已送標註（inflight 仍在 → renderFeedbackBox 不覆寫下方回執）
    const parts = [];
    if (decs.length) parts.push('決策 ' + decs.length);
    if (objs.length + notes.length) parts.push('標註 ' + (objs.length + notes.length));
    feedbackBox.textContent = `✅ 已送出 ${n} 筆` + (parts.length ? `（${parts.join(' · ')}）` : '');
    feedbackBox.classList.remove('is-empty');
    feedbackBox.classList.add('is-sent');
    feedbackBox.disabled = true;
    setTimeout(() => { // 2.6s 後回到常駐計數態（同一批改動後可再送）
      if (!feedbackBox) return;
      delete feedbackBox.dataset.inflight;
      feedbackBox.classList.remove('is-sent');
      renderFeedbackBox();
    }, 2600);
  }
  if (opts.feedbackBox) ensureFeedbackBox();

  // 依目前 objects/selectedIds 重畫面板（render() 每次變動都會喚起 → 即時更新）。
  function renderRecordPanel() {
    recordTab.classList.toggle('show', !state.recordOpen);
    recordDrawer.classList.toggle('open', state.recordOpen);
    // 佇列＝畫的標注 + 在方案卡上做的「決定」，兩者都可勾選/送出/標已送。
    // 決策 A：清單也依當前 screen 過濾（與畫布一致）；決策卡為全域 AI 產物，不分頁。
    const annRows = annotationRows(state.objects.filter(onCurrentScreen), state.sentSigs);
    const decRows = state.decisions.map(d => ({
      id: d.id, tool: 'text', icon: 'text', text: '✅ ' + d.text, selector: null, color: DRAW_UI_COLORS.sent,
      sent: state.sentSigs[d.id] === decisionSig(d), isDecision: true,
    }));
    const noteRows = state.notes.filter(onCurrentScreen).map((n) => ({
      id: n.id, tool: 'comment', icon: 'comment',
      text: '【註記】' + (n.label ? n.label + ' → ' : '') + n.text,
      selector: n.sel || null, color: DRAW_UI_COLORS.selection,
      sent: state.sentSigs[n.id] === noteSig(n), isNote: true,
    }));
    // outbox：已送給 AI（且未再改）的項目不再留在清單（畫布上的 note/標注仍在，也不會被重複送）。
    const rows = annRows.concat(decRows).concat(noteRows).filter(r => !r.sent);
    // 群組視覺提示：標記屬於 ≥2 成員群組的列（勾選會整組連動，讓使用者預期得到）。
    const groupCount = {};
    rows.forEach(r => { if (r.groupId) groupCount[r.groupId] = (groupCount[r.groupId] || 0) + 1; });
    rows.forEach(r => { r.grouped = !!(r.groupId && groupCount[r.groupId] > 1); });
    const checkedRows = rows.filter(r => !state.sendUnchecked[r.id]); // 納入送出的列
    const checkedCount = checkedRows.length;
    const count = recordDrawer.querySelector('.pc-draw-rec-count');
    if (count) count.textContent = String(rows.length);
    // 全選框：全勾→checked、部分→indeterminate、空清單→disabled
    const allBox = recordDrawer.querySelector('.pc-draw-rec-all');
    if (allBox) {
      allBox.checked = rows.length > 0 && checkedCount === rows.length;
      allBox.indeterminate = checkedCount > 0 && checkedCount < rows.length;
      allBox.disabled = rows.length === 0;
    }
    // footer 送出鈕狀態機（outbox：已送項已離開清單，故 checkedCount>0 必為未送 → 可直接送）：
    //   有可送項 → 「送給 AI（N）」可送；剛送完、沒有新可送項 → 持久「✅ 已送出（N 筆）」確認
    //   （不退回「送給 AI（0）」假失敗態）；從沒送過也沒東西 → 「送給 AI（0）」。
    const sendBtn = recordDrawer.querySelector('.pc-draw-rec-send-btn');
    if (sendBtn) {
      // 只有「真正清空」（清單空且沒有待確認的已送批次）才強制重設 in-flight；
      // 送出後 outbox 清空清單時保留 in-flight → 「✅ 已送達／📥 已排佇列」即時回饋不被蓋掉。
      if (!rows.length && !state.sentConfirmN) delete sendBtn.dataset.inflight;
      if (!sendBtn.dataset.inflight) {
        sendBtn.classList.remove('pc-draw-rec-queued');
        if (checkedCount > 0) {
          sendBtn.textContent = `送給 AI（${checkedCount}）`; sendBtn.disabled = false;
        } else if (state.sentConfirmN > 0) {
          sendBtn.textContent = `✅ 已送出（${state.sentConfirmN} 筆）`; sendBtn.disabled = true;
        } else {
          sendBtn.textContent = '送給 AI（0）'; sendBtn.disabled = true;
        }
      }
    }
    const list = recordDrawer.querySelector('.pc-draw-rec-list');
    if (!list) return;
    list.innerHTML = '';
    if (!rows.length) {
      const empty = drawHtmlEl('div', 'pc-draw-rec-empty');
      empty.textContent = '尚無標注';
      list.appendChild(empty);
      return;
    }
    list.appendChild(recordPreviewEl()); // 置頂：送給 AI 的畫面截圖預覽
    rows.forEach(row => list.appendChild(recordRowEl(
      row, isSelected(row.id), onRecordRowClick, !state.sendUnchecked[row.id], onToggleSendChecked,
      row.isNote ? removeNote : (row.isDecision ? removeDecision : null)
    )));
    refreshRecordPreview();
  }
  // 標注紀錄頂部「送出畫面」縮圖：顯示 capturePng() 的結果（=送給 AI 的 PNG）。
  let _previewSig = null, _previewUrl = null, _previewTimer = null;
  function recordPreviewEl() {
    if (_previewUrl) {
      const img = drawHtmlEl('img', 'pc-draw-rec-preview');
      img.alt = '送給 AI 的畫面預覽';
      img.style.cssText = 'display:block;width:100%;min-height:48px;border:1px solid #e1e4e8;border-radius:8px;margin:0 0 10px;background:#fafbfc;';
      img.src = _previewUrl;
      return img;
    }
    // 截圖尚未備好 → 顯示 placeholder（避免空 src <img> 被瀏覽器畫成破圖）
    const ph = drawHtmlEl('div', 'pc-draw-rec-preview');
    ph.textContent = '產生預覽中…';
    ph.style.cssText = 'display:flex;align-items:center;justify-content:center;width:100%;min-height:48px;border:1px solid #e1e4e8;border-radius:8px;margin:0 0 10px;background:#fafbfc;color:#8a9099;font-size:12px;';
    return ph;
  }
  function refreshRecordPreview() {
    if (!state.recordOpen) return;
    const sig = state.objects.length + '|' + history.length + '|' + Object.keys(state.sendUnchecked).sort().join(','); // 內容/勾選變更即重拍（取消勾選也要重拍截圖）
    if (sig === _previewSig) return;
    _previewSig = sig;
    if (_previewTimer) clearTimeout(_previewTimer);
    _previewTimer = setTimeout(() => {
      capturePng().then(url => {
        if (!url) return;
        _previewUrl = url;
        const el = recordDrawer.querySelector('.pc-draw-rec-preview');
        if (!el) return;
        if (el.tagName === 'IMG') { el.src = url; return; }
        el.replaceWith(recordPreviewEl()); // placeholder → 真正的 <img>（_previewUrl 已設）
      });
    }, 180); // debounce：連續操作只在停手後拍一次
  }
  // 點一筆 row → 選取該物件、若在畫面外則捲入視野（沿用 spec-overlay 的 scrollIntoView）。
  function onRecordRowClick(id) {
    const note = state.notes.find(n => n.id === id);
    if (note) { setFocusNote(id); openNoteCard(note); return; }
    selectOnly(id);
    render();
    scrollObjectIntoView(id);
  }
  function scrollObjectIntoView(id) {
    const node = svg.querySelector('[data-id="' + id + '"]');
    if (!node || typeof node.getBoundingClientRect !== 'function') return;
    const r = node.getBoundingClientRect();
    const offscreen = r.bottom < 0 || r.top > window.innerHeight || r.right < 0 || r.left > window.innerWidth;
    if (offscreen && node.scrollIntoView) node.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }

  function applyMode() {
    const drawing = state.mode === 'draw';
    svg.classList.toggle('pc-draw-active', drawing);
    svg.classList.toggle('pc-draw-select', drawing && state.tool === 'select');
    toolbar.classList.toggle('pc-draw-collapsed', state.collapsed); // 收合 → 隱藏整條工具列
    fab.classList.toggle('show', state.collapsed);                  // 收合 → 顯示右下 FAB
    noteLayer.classList.toggle('pc-note-active', state.mode === 'note'); // note 模式 → 註記層吃指標選元件
    if (state.mode !== 'note') { closeAllNoteCards(); clearHover(); closeNotePanel(); } // 離開 note → 收掉卡/框/面板
    syncToolbar(toolbar, state, history);
  }
  // 收合成 FAB（按 ✕）：同時回 off 放行 app 點擊。展開（點 FAB / 按工具鍵）：回繪圖模式。
  function collapseToolbar() { state.collapsed = true; setMode('off'); }
  function expandToolbar() { state.collapsed = false; setMode('draw'); }
  function setMode(mode) {
    if (!DRAW_MODES.includes(mode)) return;
    state.mode = mode;
    if (mode === 'draw') state.collapsed = false; // 繪圖模式一定展開工具列（收合只在 off）
    applyMode();
  }
  // 留言模式切換：comment ⇌ draw。comment 時 SVG 放行（pointer-events:none），
  // 工具列仍在（state.collapsed 不變），讓底下 pc.js 釘選留言系統接手點擊。
  function toggleNote() { setMode(state.mode === 'note' ? 'draw' : 'note'); }
  function setTool(tool) {
    if (!DRAW_TOOLS.includes(tool)) return;
    state.tool = tool;
    state.collapsed = false; // 選工具（含快捷鍵）→ 確保工具列展開
    if (tool !== 'select') state.selectedIds = []; // 切到繪圖工具 → 取消選取（避免新物件被回頭改色）
    if (tool !== 'comment') snapHighlight = null;   // 離開指元件 → 清掉殘留的 hover 外框
    setMode('draw'); // 任何工具（含 select）都進 draw → SVG 吃事件
    render();
  }
  function setBrush(type) {
    if (!DRAW_BRUSHES.includes(type)) return;
    state.brushType = type;
    setTool('pencil'); // 選筆刷即切到自由筆
  }

  function stampZ() { state.objects.forEach((o, i) => { o.z = i; }); }

  // ── Batch 4：端點 anchor 解析（element/object 硬鎖）+ 吸附 + live reposition ──────
  // selector → 元件 rect 換算成 host(svg) % 空間（與 geom 同基準）。找不到 → null（fallback geom）。
  function getRectPct(selector) {
    if (!selector) return null;
    let el = null;
    try { el = document.querySelector(selector); } catch (_) { return null; }
    if (!el || typeof el.getBoundingClientRect !== 'function') return null;
    const er = el.getBoundingClientRect();
    const hr = coordRect();
    return {
      x: pxToPct(er.left - hr.left, hr.width), y: pxToPct(er.top - hr.top, hr.width),
      w: pxToPct(er.width, hr.width), h: pxToPct(er.height, hr.width),
    };
  }
  // 綁定 resolver：供 render/geomBBox/labelAnchor 取得 arrow/line 解析後端點。
  const resolveO = o => resolveEndpoints(o, getRectPct, state.objects);
  // arrow/line 有 anchor 時 → 回傳「端點已解析」的渲染視圖物件；其餘原樣。
  function viewObject(o) {
    if ((o.tool === 'arrow' || o.tool === 'line') && o.endAnchors) {
      const e = resolveO(o);
      return { ...o, geom: { ...o.geom, from: e.from, to: e.to } };
    }
    if (o.tool === 'comment') return { ...o, geom: commentViewGeom(o, getRectPct) }; // 每幀重解析元件外框
    return o;
  }

  // 拖端點吸附中的高亮目標（render 時畫 dashed teal rect）。{selector} 或 {objId}；放開/離開 → null。
  let snapHighlight = null;
  function renderSnapHighlight() {
    if (!snapHighlight) return;
    let r = null;
    if (snapHighlight.selector) r = getRectPct(snapHighlight.selector);            // DOM 元件
    else if (snapHighlight.objId != null) {                                        // 自繪形狀
      const t = findById(state.objects, snapHighlight.objId);
      if (t) r = geomBBox(t, resolveO);
    }
    if (!r) return;
    const rect = coordRect();
    const b = toPxBox(r, rect);
    svg.appendChild(drawSvgEl('rect', {
      class: 'pc-draw-snap-hl', x: b.x, y: b.y, width: b.w, height: b.h, fill: 'none',
      stroke: DRAW_UI_COLORS.selection, 'stroke-width': 2, 'stroke-dasharray': '5 4', 'pointer-events': 'none',
    }));
  }

  // ── live reposition：有 el anchor 時監聽 scroll/resize/ResizeObserver + rAF 比對 rect ──
  let liveOn = false, liveRaf = null, liveRO = null;
  const liveRects = new Map();
  function anchoredSelectors() {
    const sels = new Set();
    state.objects.forEach(o => {
      if (o.tool === 'comment' && o.anchor) sels.add(o.anchor); // 指元件也綁元件 → 捲動/resize 要重解析
      const ea = o.endAnchors; if (!ea) return;
      ['from', 'to'].forEach(w => { if (ea[w] && ea[w].kind === 'el') sels.add(ea[w].selector); });
    });
    noteSelectors().forEach(s => sels.add(s)); // 註記錨定的 DOM 元件也要監聽 scroll/resize
    return sels;
  }
  function liveTick() {
    if (!liveOn) return;
    let changed = false;
    anchoredSelectors().forEach(sel => {
      const r = getRectPct(sel);
      const sig = r ? `${r.x},${r.y},${r.w},${r.h}` : 'null';
      if (liveRects.get(sel) !== sig) { liveRects.set(sel, sig); changed = true; }
    });
    if (changed) render();
    liveRaf = (liveOn && typeof requestAnimationFrame === 'function') ? requestAnimationFrame(liveTick) : null; // render→syncLiveLoop 可能已 stopLive，勿排程鬼魂 rAF
  }
  function hasElAnchor(o) {
    if (o.tool === 'comment' && o.anchor) return true; // [fix0b] 指元件：anchor selector → live loop 追蹤
    const ea = o.endAnchors; if (!ea) return false;
    return (ea.from && ea.from.kind === 'el') || (ea.to && ea.to.kind === 'el');
  }
  function syncLiveLoop() {
    // 只有 el anchor 需要 DOM 監聽（scroll/resize）；obj 形狀錨點隨 render 自然跟隨，免 rAF。
    const need = state.objects.some(hasElAnchor) || noteSelectors().size > 0; // 註記錨定 DOM 也要 live
    if (need && !liveOn) startLive();
    else if (!need && liveOn) stopLive();
  }
  function startLive() {
    liveOn = true;
    window.addEventListener('scroll', render, true); // capture：抓內層捲動容器
    if (typeof ResizeObserver === 'function') { liveRO = new ResizeObserver(() => render()); liveRO.observe(host); }
    if (typeof requestAnimationFrame === 'function') liveRaf = requestAnimationFrame(liveTick);
  }
  function stopLive() {
    liveOn = false;
    window.removeEventListener('scroll', render, true);
    if (liveRO) { liveRO.disconnect(); liveRO = null; }
    if (liveRaf && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(liveRaf);
    liveRaf = null; liveRects.clear();
  }

  function render() {
    stampZ();
    while (svg.childNodes.length > 1) svg.removeChild(svg.lastChild); // 保留 <defs>
    const rect = coordRect();
    // [fix5] stable badge 序號：以 state.objects 中 comment 的插入順序為準（不受 render 過濾影響）
    const _commentSeqMap = new Map(
      state.objects.filter(o => o.tool === 'comment').map((o, i) => [o.id, i + 1])
    );
    let _commentSeqFallback = _commentSeqMap.size; // draft 用 next 號
    [...state.objects, state.draft].forEach(o => {
      if (!o) return;
      if (o !== state.draft && !onCurrentScreen(o)) return; // 決策 A：不屬當前頁的標注不畫（不刪，換回頁還在）
      if (o !== state.draft && isSent(o)) return; // 已送出 → 不畫在畫布（保留在標注紀錄）
      if (o !== state.draft && state.sendUnchecked[o.id]) return; // 標注紀錄取消勾選 → 從畫布隱藏（也不進送出截圖）
      if (o.id === state.editingId) return;       // 正在編輯的文字 → 隱藏原件，只留輸入框（不重疊兩個）
      const vo = viewObject(o); // arrow/line anchor → 解析後端點渲染
      if (vo.tool === 'comment') vo.seq = _commentSeqMap.get(o.id) ?? ++_commentSeqFallback; // [fix5] stable
      const node = renderObject(vo, rect, svg);
      node.setAttribute('data-id', o.id);
      // 物件不吃指標事件 → 所有點擊都落在穩定的 <svg>（hit-test 用幾何）。
      // 關鍵：避免點擊細線時 render() 重建 <line> 導致瀏覽器 dblclick 因 target 改變而不觸發。
      node.setAttribute('pointer-events', 'none');
      svg.appendChild(node);
      const lbl = renderLabel(vo, rect);
      if (lbl) { svg.appendChild(lbl); sizeLabelBg(lbl); } // 綁定標籤；append 後量 text bbox 收緊白底
    });
    renderSelection(rect);
    renderMarquee(rect);
    renderSnapHighlight(); // Batch 4：拖端點吸附中的 dashed teal 高亮
    syncToolbar(toolbar, state, history);
    renderRecordPanel(); // P6：標注紀錄面板隨 objects/selection 即時更新
    syncLiveLoop();       // Batch 4：有 anchor 才啟動 live reposition 監聽
    renderReplies();     // AI 方案卡：錨定貼在標注旁
    renderNotes();    // 元件註記 pin：隨元件 scroll/resize 重新定位
    renderFeedbackBox(); // 回饋匣（若啟用）：更新「📮 送出回饋（N）」計數
  }

  // ── AI 方案卡（reply 通道）：渲染 + 輪詢 + 回送選擇 ─────────────────────────────
  function renderReplies() {
    replyLayer.innerHTML = '';
    const rect = coordRect();
    state.replies.forEach(r => {
      const card = replyCardEl(r, submitChoice, closeReply, rechoose);
      const a = r.anchor || {};
      const x = a.x != null ? a.x : 50, y = a.y != null ? a.y : 50;
      card.style.left = pctToPx(x, rect.width) + 'px';
      card.style.top = pctToPx(y, rect.height) + 'px';
      replyLayer.appendChild(card);
    });
  }
  // 關閉單張方案卡（不影響佇列裡已做的決定）。
  function closeReply(reply) {
    state.replies = state.replies.filter(r => r.n !== reply.n);
    renderReplies();
  }
  // 注入方案卡（poll 收到或測試用）：依 n 去重後併入。
  function ingestReplies(entries) {
    (entries || []).forEach(e => { if (!state.replies.some(r => r.n === e.n)) state.replies.push(e); });
    renderReplies();
  }
  // 使用者點方案卡上的選項 → 標記已選 + POST /api/draw-choice（→ AI 端 draw-poll 收到）。
  // 在方案卡選選項 → 卡片標已選 + 把「決定」加進標注紀錄佇列（不立即送；最後一次送出隨批帶給 AI）。
  function submitChoice(reply, option) {
    reply.chosen = option;
    const id = 'dec-' + reply.n; // 同一張卡重選 → 取代舊決定
    state.decisions = state.decisions.filter(d => d.id !== id);
    state.decisions.push({ id, replyId: reply.n, optionId: option.id, optionLabel: option.label, text: '決定：' + (option.label || option.id) });
    render(); // 更新方案卡(已選) + 標注紀錄(新佇列項) + 送出鈕計數/狀態
  }
  // 取消已選 → 方案卡回到選項列、把該決定移出佇列（可重新挑一個）。
  function rechoose(reply) {
    reply.chosen = null;
    state.decisions = state.decisions.filter(d => d.id !== ('dec-' + reply.n));
    render();
  }
  // reply-poll 迴圈：long-poll 收 AI 方案卡（僅 opts.replyPoll 開啟時跑；同源 http 才有 endpoint）。
  let replyPolling = false;
  async function replyPollLoop() {
    const endpoint = sameOriginApi('/api/draw-reply-poll');
    if (!endpoint || typeof fetch !== 'function') return;
    replyPolling = true;
    while (replyPolling) {
      try {
        const resp = await fetch(endpoint + '?since=' + state.replyCursor);
        const data = await resp.json();
        if (data && Array.isArray(data.entries) && data.entries.length) ingestReplies(data.entries);
        if (data && data.cursor != null) state.replyCursor = data.cursor;
      } catch (_) { await new Promise(r => setTimeout(r, 2000)); }
    }
  }

  // 選取框 px box：text 用實際渲染的 <text> getBBox（隨字級/字長變化），其餘用幾何 bbox。
  function selPxBox(o, rect) {
    if (o.tool === 'text') {
      const el = svg.querySelector(`text[data-id="${o.id}"]`);
      if (el && typeof el.getBBox === 'function') {
        try {
          const bb = el.getBBox();
          if (bb.width || bb.height) { const pad = 3; return { x: bb.x - pad, y: bb.y - pad, w: bb.width + pad * 2, h: bb.height + pad * 2 }; }
        } catch (_) { /* getBBox 不可用 → 退回幾何估算 */ }
      }
    }
    return toPxBox(geomBBox(o, resolveO), rect);
  }
  function renderSelection(rect) {
    const objs = selectedObjects().filter(o => !isSent(o) && !state.sendUnchecked[o.id] && o.id !== state.editingId); // 已送出/取消勾選/編輯中者不畫選取框
    if (!objs.length) return;
    const g = drawSvgEl('g', { class: 'pc-draw-selection' });
    objs.forEach(o => {
      const box = selPxBox(o, rect);
      g.appendChild(drawSvgEl('rect', { x: box.x, y: box.y, width: box.w, height: box.h, fill: 'none', stroke: DRAW_UI_COLORS.selection, 'stroke-width': 1, 'stroke-dasharray': '4 3', 'pointer-events': 'none' }));
    });
    if (objs.length === 1) { // handle 只在單選時出現
      const o = objs[0];
      if (o.tool === 'arrow' || o.tool === 'line') {
        // 箭頭/線段：兩個圓端點 handle（取代 bbox 四角）；用解析後端點（anchor live）
        const ends = resolveO(o);
        ['from', 'to'].forEach(which => {
          const cx = pctToPx(ends[which].x, rect.width);
          const cy = pctToPx(ends[which].y, rect.height);
          g.appendChild(drawSvgEl('circle', { cx, cy, r: 4, fill: '#fff', stroke: DRAW_UI_COLORS.selection, 'stroke-width': 1, 'data-endpoint': which }));
        });
      } else {
        // 其餘工具：4 角縮放 handle（text 用實際渲染框 → handle 隨字級貼合）
        const box = selPxBox(o, rect);
        ['nw', 'ne', 'se', 'sw'].forEach(name => {
          const c = boxCorner(box, name);
          g.appendChild(drawSvgEl('rect', { x: c.x - 4, y: c.y - 4, width: 8, height: 8, fill: '#fff', stroke: DRAW_UI_COLORS.selection, 'stroke-width': 1, 'data-handle': name }));
        });
      }
    }
    svg.appendChild(g);
  }
  function renderMarquee(rect) {
    if (!state.marquee) return;
    const box = toPxBox(state.marquee, rect);
    svg.appendChild(drawSvgEl('rect', { class: 'pc-draw-marquee', x: box.x, y: box.y, width: box.w, height: box.h, fill: DRAW_UI_COLORS.selectionTint, stroke: DRAW_UI_COLORS.selection, 'stroke-width': 1, 'stroke-dasharray': '4 3', 'pointer-events': 'none' }));
  }

  // ── command 執行（apply＋push）/ undo / redo ─────────────────────────────────
  function runCommand(cmd) {
    // 決策 A：新畫的標注打上當前 screenId（只在啟用 getScreenId 時；未設過才戳，redo 不覆蓋）。
    if (cmd.type === 'create' && cmd.obj && cmd.obj.screenId == null && typeof opts.getScreenId === 'function') {
      cmd.obj.screenId = currentScreenId();
    }
    state.objects = applyCommand(state.objects, cmd);
    markTombstones(deletedIdsOf(cmd), true); // 刪除類 command → 記墓碑（create/update 為空集 → no-op）
    history.push(cmd);
    if (cmd.type === 'create') state.selectedIds = [cmd.obj.id];
    render();
    syncCommand(cmd); // P7：團隊模式才會真的寫 Firestore（drawStore 為 null 時 no-op）
    persistLocalSave(); // dev 模式本機持久化
  }
  // 刪除類 command 涉及的物件 id（create/update/reorder → 空陣列）。tombstone 記錄/清除共用。
  function deletedIdsOf(cmd) {
    if (!cmd) return [];
    if (cmd.type === 'delete') return cmd.obj ? [cmd.obj.id] : [];
    if (cmd.type === 'deleteMany') return (cmd.items || []).map(it => it.obj && it.obj.id).filter(Boolean);
    if (cmd.type === 'batch') return (cmd.cmds || []).flatMap(deletedIdsOf);
    return [];
  }
  // on=true：標墓碑（刪除 / redo 刪除）；on=false：清墓碑（undo 刪除 → 物件復原，不該再被過濾）。
  function markTombstones(ids, on) {
    if (!ids.length) return;
    const now = Date.now();
    ids.forEach(id => { if (on) state.tombstones[id] = now; else delete state.tombstones[id]; });
  }
  // 物件已即時改好（拖曳預覽），只補登歷史（不重複 apply）。
  function pushHistory(cmd) { history.push(cmd); render(); syncCommand(cmd); persistLocalSave(); }

  // ── P7 團隊持久：把本地 command 反映到 Firestore（向量 only）。──────────────────
  // 持久化失敗一律吞掉 → 本地永遠是 live session 的真相，不因網路/權限問題壞掉繪圖。
  function syncCommand(cmd) {
    if (!drawStore || !cmd) return;
    try {
      if (cmd.type === 'create') syncSaveObj(cmd.obj);
      else if (cmd.type === 'update') syncSaveById(cmd.id);
      else if (cmd.type === 'reorder') (cmd.after || []).forEach(syncSaveById); // z 變更 → 重存
      else if (cmd.type === 'deleteMany') (cmd.items || []).forEach(it => syncRemoveObj(it.obj));
      else if (cmd.type === 'batch') (cmd.cmds || []).forEach(syncCommand);
    } catch (_) { /* 持久化失敗不影響本地繪圖 */ }
  }
  function syncSaveObj(obj) {
    if (!drawStore || !obj || obj.tool === 'image') return; // 跳過貼圖：PNG/dataURL 不進 Firestore（plan §4.6）
    try { Promise.resolve(drawStore.save(drawingToDoc(obj))).catch(() => {}); } catch (_) { /* ignore */ }
  }
  function syncSaveById(id) { const o = findById(state.objects, id); if (o) syncSaveObj(o); }
  function syncRemoveObj(obj) {
    if (!drawStore || !obj || obj.tool === 'image') return; // image 從未存過 → 不需刪
    syncTombstone(obj.id);
  }
  // 軟刪除到 store：寫墓碑 doc（不真的刪）→ 其他 client 舊快照回寫無法復活。
  // store 無 tombstone（舊 store）時退回硬刪，維持相容。
  function syncTombstone(id) {
    if (!drawStore) return;
    try {
      const op = drawStore.tombstone ? drawStore.tombstone(id) : drawStore.remove(id);
      Promise.resolve(op).catch(() => {});
    } catch (_) { /* 持久化失敗不影響本地繪圖 */ }
  }

  // remote 訂閱：teammate 的向量物件即時併入（只「新增」缺的 id，de-dupe，不覆蓋本地進行中物件）。
  function startSync() {
    if (!drawStore) return;
    try { unsubDraw = drawStore.subscribe(onRemoteDrawings, () => { /* 訂閱錯誤 → 維持本地 */ }); }
    catch (_) { unsubDraw = null; }
  }
  function onRemoteDrawings(remoteDocs) {
    if (!Array.isArray(remoteDocs) || !remoteDocs.length) return;
    const localNoteIds = new Set(state.notes.map(n => n.id));
    const localObjIds = new Set(state.objects.map(o => o.id));
    let changed = false;
    remoteDocs.forEach(doc => {
      if (!doc || doc.id == null) return;
      // 墓碑 doc：記下墓碑（deletedAt 最新者贏）+ 從本地移除該 id。teammate 刪的東西即時在本端消失。
      if (doc.deleted) {
        const at = Number(doc.deletedAt) || Date.now();
        if (!state.tombstones[doc.id] || at > state.tombstones[doc.id]) state.tombstones[doc.id] = at;
        if (localObjIds.has(doc.id)) { state.objects = state.objects.filter(o => o.id !== doc.id); changed = true; }
        if (localNoteIds.has(doc.id)) { state.notes = state.notes.filter(n => n.id !== doc.id); changed = true; }
        return;
      }
      // 墓碑優先：已被墓碑標記的 id，遠端非刪 doc（含 stale client 的舊快照回寫）一律不復活。
      if (isTombstoned(state.tombstones, doc.id)) return;
      if (doc.kind === 'note') {
        if (localNoteIds.has(doc.id)) return;
        state.notes.push({ id: doc.id, kind: 'note', text: doc.text,
          sel: doc.sel || null, objId: doc.objId != null ? doc.objId : null,
          relX: doc.relX, relY: doc.relY, x: doc.x, y: doc.y, label: doc.label || '',
          ...(doc.screenId != null ? { screenId: doc.screenId } : {}) });
        changed = true;
      } else if (doc.geom) {
        // 只吸收真正的向量繪圖 doc。live-markup 的 /api/draw 與 decide.js 決策按鈕共用同一 collection，
        // 會混入無 geom 的 doc（如 tool:'choice'）；這些非繪圖 doc 一律略過，否則會被 pickTarget/geomBBox 讀 g.x 而 crash。
        if (doc.tool === 'image' || localObjIds.has(doc.id)) return;
        state.objects.push(rehydrateDrawing(doc));
        changed = true;
      }
    });
    if (changed) {
      ensureSelectionValid(); // 墓碑移除的物件若在選取中 → 清掉 dangling selection
      bumpIdSeq([...state.objects.map(o => o.id), ...state.objects.map(o => o.groupId).filter(Boolean), ...state.notes.map(n => n.id)]);
      render();
    }
  }
  // Firestore doc（含 updatedAt 等 metadata）→ 乾淨 DrawObject（丟掉非向量欄位）。
  function rehydrateDrawing(doc) {
    const obj = makeDrawObject({ id: doc.id, tool: doc.tool, geom: doc.geom, style: doc.style, text: doc.text, screenId: doc.screenId });
    if (doc.label != null) obj.label = doc.label;
    if (doc.anchor != null) obj.anchor = doc.anchor;
    if (doc.groupId != null) obj.groupId = doc.groupId;
    if (doc.endAnchors != null) obj.endAnchors = doc.endAnchors;
    return obj;
  }
  function commitChange(id, before, after) { pushHistory({ type: 'update', id, before, after }); }
  function doUndo() {
    const cmd = history.undo();
    if (!cmd) return;
    state.objects = invertCommand(state.objects, cmd);
    markTombstones(deletedIdsOf(cmd), false); // undo 刪除 → 物件復原 → 清墓碑（否則會被過濾掉又消失）
    ensureSelectionValid();
    render();
    persistLocalSave();
  }
  function doRedo() {
    const cmd = history.redo();
    if (!cmd) return;
    state.objects = applyCommand(state.objects, cmd);
    markTombstones(deletedIdsOf(cmd), true); // redo 刪除 → 物件再度移除 → 重記墓碑
    ensureSelectionValid();
    render();
    persistLocalSave();
  }
  function ensureSelectionValid() {
    state.selectedIds = state.selectedIds.filter(id => findById(state.objects, id));
  }

  // ── Batch 3：群組 bind / ungroup ──────────────────────────────────────────────
  function doGroupSelected() {
    if (state.selectedIds.length < 2) return;
    const gid = nextGroupId();
    const cmds = state.selectedIds.map(id => {
      const o = findById(state.objects, id);
      return { type: 'update', id, before: { groupId: o ? o.groupId : undefined }, after: { groupId: gid } };
    });
    state.objects = assignGroupId(state.objects, state.selectedIds, gid);
    pushHistory(cmds.length === 1 ? cmds[0] : { type: 'batch', cmds });
  }
  function doUngroupSelected() {
    const gids = new Set();
    state.selectedIds.forEach(id => {
      const o = findById(state.objects, id);
      if (o && o.groupId) gids.add(o.groupId); // 解散整組（含未選到的成員），避免落單成 group-of-one
    });
    if (!gids.size) return;
    const toUngroup = state.objects.filter(o => o.groupId && gids.has(o.groupId)).map(o => o.id);
    const cmds = toUngroup.map(id => {
      const o = findById(state.objects, id);
      return { type: 'update', id, before: { groupId: o.groupId }, after: { groupId: undefined } };
    });
    state.objects = clearGroupId(state.objects, toUngroup);
    pushHistory(cmds.length === 1 ? cmds[0] : { type: 'batch', cmds });
  }

  // ── z-order / 刪除 / style（皆作用於整個選取集合）──────────────────────────────
  function zorder(op) {
    if (!state.selectedIds.length) return;
    const before = state.objects.map(o => o.id);
    const after = reorderMany(before, state.selectedIds, op);
    runCommand({ type: 'reorder', before, after });
  }
  function deleteSelected() {
    if (!state.selectedIds.length) return;
    const items = state.objects
      .map((o, i) => ({ obj: o, index: i }))
      .filter(it => isSelected(it.obj.id)); // 已依 index 由小到大
    if (!items.length) return;
    state.selectedIds = [];
    runCommand({ type: 'deleteMany', items });
  }
  // Excalidraw 風格：繪圖工具啟用時 picker 只改「下一個新物件」的預設、不動選取；
  // select 工具 + 有選取時才回頭改「所有選取物件」的樣式（同時更新預設）。
  function setStyle(patch) {
    const res = applyStylePatch({ tool: state.tool, selectedIds: state.selectedIds, objects: state.objects, defaultStyle: DEFAULT_DRAW_STYLE }, patch);
    Object.assign(DEFAULT_DRAW_STYLE, res.defaultStyle);
    state.objects = res.objects;
    if (!res.cmds.length) { render(); return; }
    pushHistory(res.cmds.length === 1 ? res.cmds[0] : { type: 'batch', cmds: res.cmds });
  }
  function setColor(c) { setStyle({ color: c }); }
  function setStrokeWidth(w) { setStyle({ strokeWidth: w }); }
  function setFontSize(px) { setStyle({ fontSize: px }); }
  function setHeads(mode) { setStyle({ heads: mode }); } // line/arrow 端點箭頭 none/end/start/both

  // 吸管：用瀏覽器 EyeDropper API 取樣 → 走 setColor 同一語意。
  async function openEyedropper() {
    if (!eyedropperSupported(window)) return;
    try {
      const res = await new window.EyeDropper().open();
      if (res && res.sRGBHex) setColor(res.sRGBHex);
    } catch (_) { /* 使用者按 Esc 取消 → 忽略 */ }
  }

  // toolbar / 右鍵選單 動作分派（z-order / 刪除 / undo-redo）。
  function act(action) {
    if (action === 'delete') return deleteSelected();
    if (action === 'undo') return doUndo();
    if (action === 'redo') return doRedo();
    if (action === 'group') return doGroupSelected();
    if (action === 'ungroup') return doUngroupSelected();
    return zorder(action); // front / back / forward / backward
  }

  // ── pointer：select 模式（選取 / 多選 / marquee / 移動 / 縮放）──────────────────
  function onSelectDown(e) {
    const rect = coordRect();
    // 端點拖曳（arrow/line）：優先於 bbox handle 分支
    const endpoint = e.target?.dataset?.endpoint;
    if (endpoint && state.selectedIds.length === 1) { startEndpointDrag(e, endpoint, rect); return; }
    const handle = e.target && e.target.dataset ? e.target.dataset.handle : null;
    if (handle && state.selectedIds.length === 1) { startResize(e, handle, rect); return; }
    const p = clientToPct(e.clientX, e.clientY, rect);
    const hit = hitTest(p);
    if (!hit) { startMarquee(rect, p, e.shiftKey); render(); return; } // 空白起拖 → 橡皮筋框
    if (e.shiftKey) { toggleSelect(hit.id); render(); return; }        // Shift+click → 加/減選
    if (!isSelected(hit.id)) {                                         // 點未選物件 → 展開群組後選
      state.selectedIds = expandSelectionToGroups(state.objects, [hit.id]);
    }
    render();
    startMove(rect, p);                                               // 拖曳 → 整個選取一起移動
  }
  function hitTest(p) {
    const tol = 2.5; // % 容差
    // 第一輪：精準命中取「最近者」→ 細線穿過外框形狀邊緣時選到的是線，不是被穿的形狀。
    // 平手時：細線(arrow/line/pencil)優先於外框形狀；其餘維持 z-order（上層先遇到者勝）。
    let best = null, bestD = Infinity, bestThin = false, bestOutlined = false;
    for (let i = state.objects.length - 1; i >= 0; i--) {
      const o = state.objects[i];
      if (isSent(o)) continue; // 已送出隱藏 → 不可選
      if (state.sendUnchecked[o.id]) continue; // 取消勾選隱藏 → 不可選
      const ends = (o.tool === 'arrow' || o.tool === 'line') ? resolveO(o) : null;
      const d = objHitDist(o, p, tol, ends);
      if (d === Infinity) continue;
      const thin = o.tool === 'arrow' || o.tool === 'line' || o.tool === 'pencil';
      const closer = d < bestD - 1e-9;
      const tieThinWins = Math.abs(d - bestD) <= 1e-9 && thin && bestOutlined && !bestThin;
      if (best === null || closer || tieThinWins) { best = o; bestD = d; bestThin = thin; bestOutlined = isOutlinedShape(o); }
    }
    if (best) return best;
    // 第二輪：bbox 後援 → 點在大空白外框內也選得到（如鉛筆捲線內側、未重疊時）
    for (let i = state.objects.length - 1; i >= 0; i--) {
      const o = state.objects[i];
      if (isSent(o)) continue; // 已送出隱藏 → 不可選
      const b = geomBBox(o, resolveO);
      if (p.x >= b.x - tol && p.x <= b.x + b.w + tol && p.y >= b.y - tol && p.y <= b.y + b.h + tol) return o;
    }
    return null;
  }
  function startMarquee(rect, startP, additive) {
    const base = additive ? state.selectedIds.slice() : [];
    state.selectedIds = base.slice(); // 起手即套用：純 click 空白（無拖移）也會取消選取
    state.marquee = { x: startP.x, y: startP.y, w: 0, h: 0 };
    const onMv = ev => {
      const p = clientToPct(ev.clientX, ev.clientY, rect);
      state.marquee = rectFromPoints(startP, p);
      const hits = marqueeSelect(state.objects, state.marquee);
      state.selectedIds = [...new Set([...base, ...hits])];
      render();
    };
    const onUp = () => {
      window.removeEventListener('pointermove', onMv);
      window.removeEventListener('pointerup', onUp);
      state.marquee = null;
      render();
    };
    window.addEventListener('pointermove', onMv);
    window.addEventListener('pointerup', onUp);
  }
  function startMove(rect, startP) {
    const objs = selectedObjects();
    if (!objs.length) return;
    const before = new Map(objs.map(o => [o.id, o.geom]));
    let moved = false;
    const onMv = ev => {
      const p = clientToPct(ev.clientX, ev.clientY, rect);
      const dx = p.x - startP.x, dy = p.y - startP.y;
      objs.forEach(o => { o.geom = translateGeom({ tool: o.tool, geom: before.get(o.id) }, dx, dy); });
      moved = true;
      render();
    };
    const onUp = () => {
      window.removeEventListener('pointermove', onMv);
      window.removeEventListener('pointerup', onUp);
      if (!moved) return;
      const cmds = objs.map(o => ({ type: 'update', id: o.id, before: { geom: before.get(o.id) }, after: { geom: o.geom } }));
      pushHistory(cmds.length === 1 ? cmds[0] : { type: 'batch', cmds });
    };
    window.addEventListener('pointermove', onMv);
    window.addEventListener('pointerup', onUp);
  }
  function startResize(e, handle, rect) {
    const o = selectedObjects()[0];
    if (!o) return;
    const before = o.geom;
    const oldBox = geomBBox(o);
    let resized = false;
    const onMv = ev => {
      const p = clientToPct(ev.clientX, ev.clientY, rect);
      const newBox = resizeBBox(oldBox, handle, p);
      o.geom = remapGeom({ tool: o.tool, geom: before }, oldBox, newBox);
      resized = true;
      render();
    };
    const onUp = () => {
      window.removeEventListener('pointermove', onMv);
      window.removeEventListener('pointerup', onUp);
      if (resized) commitChange(o.id, { geom: before }, { geom: o.geom });
    };
    window.addEventListener('pointermove', onMv);
    window.addEventListener('pointerup', onUp);
  }

  // 拖曳端點 handle → 重新指向端點（arrow/line 專用）。仿 startResize，加吸附 + anchor + 高亮。
  function startEndpointDrag(e, which, rect) {
    const o = selectedObjects()[0];
    if (!o) return;
    const before = { geom: o.geom, endAnchors: o.endAnchors };
    let moved = false, pendingAnchor;
    const onMv = ev => {
      const p = clientToPct(ev.clientX, ev.clientY, rect);
      const snap = computeEndpointSnap(p, o.id, ev.clientX, ev.clientY);
      o.geom = setEndpoint(before.geom, which, snap ? snap.point : p);
      pendingAnchor = snap ? snap.anchor : undefined;
      o.endAnchors = mergeEndAnchor(before.endAnchors, which, pendingAnchor); // 拖曳中即時反映：避免已 anchored 端點被舊 anchor 鎖住不跟手
      snapHighlight = snap ? snap.highlight : null; // 吸到元件/形狀 → 高亮其 rect
      moved = true;
      render();
    };
    const onUp = () => {
      window.removeEventListener('pointermove', onMv);
      window.removeEventListener('pointerup', onUp);
      snapHighlight = null;
      if (moved) commitEndpoint(o, which, before, pendingAnchor);
      else render(); // 清掉高亮
    };
    window.addEventListener('pointermove', onMv);
    window.addEventListener('pointerup', onUp);
  }
  // 蒐集候選（游標下元件的 8 錨點 + 最近邊 + 其他物件端點）→ 閾值內最近吸附點 + 對應 anchor。
  function computeEndpointSnap(p, draggedId, clientX, clientY) {
    // 自繪物件（線端點 / 形狀錨點）優先：刻意畫的標注目標應贏過背景 DOM（DOM 最近邊永遠貼游標會蓋掉形狀）。
    const objHit = nearestSnap(p, objectSnapPoints(state.objects, draggedId), SNAP_THRESHOLD_PCT);
    if (objHit) return snapResult(objHit, null);
    const selector = elSnapSelector(elementUnderPoint(clientX, clientY));
    const elRect = selector ? getRectPct(selector) : null;
    if (!elRect) return null;
    const cands = rectAnchorPoints(elRect).map(pt => ({ ...pt, selector }));
    cands.push({ ...nearestPointOnRect(p, elRect), selector, ref: 'edge' }); // DOM 才有最近邊吸附
    const elHit = nearestSnap(p, cands, SNAP_THRESHOLD_PCT);
    return elHit ? snapResult(elHit, elRect) : null;
  }
  function snapResult(hit, elRect) {
    return { point: hit.point, anchor: snapToAnchor(hit.cand, elRect), highlight: snapHighlightOf(hit.cand) };
  }
  // 候選 → 高亮目標：el 候選 → {selector}；obj 候選 → {objId}。
  function snapHighlightOf(cand) {
    if (cand.selector) return { selector: cand.selector };
    if (cand.objId != null) return { objId: cand.objId };
    return null;
  }
  // 候選 → anchor：obj 線端點 → which；obj 形狀 → relX/relY；el → relX/relY。
  function snapToAnchor(cand, elRect) {
    if (cand.objId != null) {
      if (cand.which) return { kind: 'obj', objId: cand.objId, which: cand.which };
      return { kind: 'obj', objId: cand.objId, relX: cand.relX, relY: cand.relY };
    }
    if (cand.selector && elRect) {
      const rel = anchorRel(cand, elRect);
      return { kind: 'el', selector: cand.selector, relX: rel.relX, relY: rel.relY };
    }
    return undefined;
  }
  // 排除 overlay/toolbar 自身與 body/html → 回傳可吸附元件的 css selector。
  function elSnapSelector(el) {
    if (!el || el === document.body || el === document.documentElement) return null;
    if (svg.contains(el) || toolbar.contains(el)) return null;
    return cssSelectorFor(el);
  }
  // 提交端點變更：before/after 同時含 geom + endAnchors（undo 一起還原）。
  function commitEndpoint(o, which, before, pendingAnchor) {
    const nextAnchors = mergeEndAnchor(before.endAnchors, which, pendingAnchor);
    if (nextAnchors) o.endAnchors = nextAnchors; else delete o.endAnchors;
    commitChange(o.id, { geom: before.geom, endAnchors: before.endAnchors },
      { geom: o.geom, endAnchors: nextAnchors });
  }

  // ── pointer：繪製模式（拖曳畫物件）────────────────────────────────────────────
  function onDown(e) {
    if (state.mode !== 'draw') return;
    if (state.tool === 'select') { onSelectDown(e); return; }
    e.preventDefault();
    state.selectedIds = [];
    const rect = coordRect();
    if (state.tool === 'text') { startTextInput(e.clientX, e.clientY, rect); return; }
    if (state.tool === 'comment') { startCommentInput(e.clientX, e.clientY, rect); return; }
    const p0 = clientToPct(e.clientX, e.clientY, rect);
    let start = p0, fromAnchor;
    if (isEndpointTool(state.tool)) { // 起點也可吸附（畫線時 from 黏元件/形狀）
      const snap = computeEndpointSnap(p0, null, e.clientX, e.clientY);
      if (snap) { start = snap.point; fromAnchor = snap.anchor; snapHighlight = snap.highlight; }
    }
    drag = { tool: state.tool, rect, start, points: [[start.x, start.y]], fromAnchor };
    const style = state.tool === 'pencil' ? { ...(opts.style || {}), brushType: state.brushType } : opts.style;
    state.draft = makeDrawObject({ tool: state.tool, geom: initialGeom(state.tool, start), style });
    if (fromAnchor) state.draft.endAnchors = { from: fromAnchor };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  }
  function isEndpointTool(tool) { return tool === 'arrow' || tool === 'line'; }
  function onMove(e) {
    if (!drag || !state.draft) return;
    const p = clientToPct(e.clientX, e.clientY, drag.rect);
    let to = p;
    if (isEndpointTool(drag.tool)) { // 終點即時吸附 + 高亮，並把 anchor 暫存到 draft
      const snap = computeEndpointSnap(p, null, e.clientX, e.clientY);
      to = snap ? snap.point : p;
      snapHighlight = snap ? snap.highlight : null;
      setDraftAnchors(drag.fromAnchor, snap ? snap.anchor : undefined);
    }
    state.draft.geom = updateGeom(drag, to);
    render();
  }
  function setDraftAnchors(fromAnchor, toAnchor) {
    let ea = fromAnchor ? { from: fromAnchor } : undefined;
    ea = mergeEndAnchor(ea, 'to', toAnchor);
    if (ea) state.draft.endAnchors = ea; else delete state.draft.endAnchors;
  }
  function onUp() {
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);
    drag = null;
    commitDraft();
  }
  function commitDraft() {
    const d = state.draft;
    state.draft = null;
    snapHighlight = null; // 收掉吸附高亮
    if (d && isDrawn(d)) { captureAnchor(d); runCommand({ type: 'create', obj: d }); }
    else render();
  }

  // ── P4：selector 擷取 + 截圖 + 結構化匯出 + 送給 AI ─────────────────────────────
  const ANCHOR_TOOLS = ['ellipse', 'diamond', 'rect', 'arrow', 'line']; // 指向底層元件的標注才擷取
  // 暫時關閉 overlay/toolbar 指標事件，elementFromPoint 取得底層 app 元件。
  function elementUnderPoint(clientX, clientY) {
    const prev = svg.style.pointerEvents;
    svg.style.pointerEvents = 'none';
    toolbar.style.pointerEvents = 'none';
    const el = document.elementFromPoint(clientX, clientY);
    svg.style.pointerEvents = prev;
    toolbar.style.pointerEvents = '';
    return el;
  }
  function captureAnchor(obj) {
    if (!ANCHOR_TOOLS.includes(obj.tool)) return;
    const rect = coordRect();
    const a = labelAnchor(obj); // bbox 中心 / 線中點
    const el = elementUnderPoint(rect.left + pctToPx(a.x, rect.width), rect.top + pctToPx(a.y, rect.height));
    if (!el || el === document.body || el === document.documentElement) return; // 空畫布 → anchor 留 null
    const sel = cssSelectorFor(el);
    if (sel) obj.anchor = sel;
  }

  function exportPayload() {
    const p = buildExport(checkedObjects(), { w: svg.clientWidth || host.clientWidth, h: svg.clientHeight || host.clientHeight });
    const decs = checkedDecisions();
    if (decs.length) p.decisions = decs.map(d => ({ replyId: d.replyId, optionId: d.optionId, optionLabel: d.optionLabel }));
    const checkedNotes = state.notes.filter(n => !state.sendUnchecked[n.id] && state.sentSigs[n.id] !== noteSig(n)); // outbox：已送未改的不重複送
    if (checkedNotes.length) p.notes = checkedNotes.map(n => ({
      id: n.id, text: n.text, label: n.label || '',
      selector: n.sel || null, objId: n.objId != null ? n.objId : null,
      x: n.x, y: n.y,
    }));
    return p;
  }
  // html2canvas 載入：優先用既有 window.html2canvas；否則注入 UMD <script>（雙 CDN 後援）。
  // 用 <script> 而非 ESM import — esm.sh 動態 import 時好時壞，失敗會默默退回透明 SVG-only（截不到底下畫面）。
  let _h2cPromise = null;
  function injectScript(src) {
    return new Promise((resolve) => {
      const s = document.createElement('script');
      s.src = src; s.async = true;
      s.onload = () => resolve(window.html2canvas || null);
      s.onerror = () => resolve(null);
      document.head.appendChild(s);
    });
  }
  function loadHtml2canvas() {
    if (typeof window === 'undefined' || typeof document === 'undefined') return Promise.resolve(null);
    if (window.html2canvas) return Promise.resolve(window.html2canvas);
    if (!_h2cPromise) {
      const chain = injectScript('https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js')
        .then(fn => fn || injectScript('https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js'))
        .then(fn => fn || window.html2canvas || null)
        .catch(() => null);
      // 整體逾時後援：任一/兩個 CDN 請求卡住（pending，不觸發 onload/onerror）時，
      // 不讓 capturePng 無限等 → 4.5s 後回 null，退回 SVG-only。背景仍可能載完，下次截圖即用整頁。
      const timeout = new Promise(res => setTimeout(() => res(null), 4500));
      _h2cPromise = Promise.race([chain, timeout]);
    }
    return _h2cPromise;
  }
  // 截圖要排除的 overlay chrome（工具列/抽屜/方案卡/選單/編輯框）＋未勾選送出的標注（讓截圖=送出內容一致）。
  function isCaptureExcluded(el) {
    if (!el || !el.classList) return false;
    if (el.classList.contains('pc-draw-toolbar') || el.classList.contains('pc-draw-reply-layer')
      || el.classList.contains('pc-draw-rec-tab') || el.classList.contains('pc-draw-text-input')
      || el.id === 'pc-draw-rec-drawer' || el.id === 'pc-draw-context') return true;
    if (el.classList.contains('pc-draw-selection') || el.classList.contains('pc-draw-marquee')) return true; // 選取框/橡皮筋不入鏡（不改 state.selectedIds，避免與選取讀取競態）
    // 對話卡（開著的 note 輸入/彈窗）與 hover 高亮框都是 UI chrome → 不入鏡（保留框+角標本身）。
    if (el.classList.contains('pc-note-card') || el.classList.contains('pc-note-hl')) return true;
    const id = el.getAttribute && el.getAttribute('data-id');
    if (id && state.sendUnchecked[id]) return true; // 未勾選送出的標注不入鏡
    // note 標記用 data-note-id（非 data-id）；未勾選 → 整個 .pc-note-mark（框+角標）排除，與送出 JSON 一致。
    const nid = el.getAttribute && el.getAttribute('data-note-id');
    return !!(nid && state.sendUnchecked[nid]);
  }
  // 整頁截圖（底層畫面 + 標注合成）。html2canvas 不可用/失敗 → 退回只截 SVG 標注層（透明底）。async。
  async function capturePng() {
    const h2c = await loadHtml2canvas().catch(() => null);
    if (h2c) {
      try {
        // 選取框不入鏡：交給 ignoreElements（isCaptureExcluded）在截圖時跳過 .pc-draw-selection/.pc-draw-marquee，
        // 不再暫時清空 state.selectedIds——那會在 await 截圖期間讓其他讀取者（含測試）看到空選取，造成競態閃爍。
        const canvas = await h2c(document.body, {
          backgroundColor: '#ffffff',
          scale: Math.min(2, (typeof window !== 'undefined' && window.devicePixelRatio) || 1),
          logging: false, useCORS: true,
          ignoreElements: isCaptureExcluded,
        });
        return canvas.toDataURL('image/png');
      } catch (_) { /* fall through to SVG-only */ }
    }
    return capturePngSvgOnly();
  }
  // 後援：把 #pc-draw SVG（含貼圖 + 標注）轉 PNG dataURL（透明底，XMLSerializer → img → canvas）。async。
  async function capturePngSvgOnly() {
    try {
      const w = svg.clientWidth || host.clientWidth, h = svg.clientHeight || host.clientHeight;
      const clone = svg.cloneNode(true);
      clone.setAttribute('width', w);
      clone.setAttribute('height', h);
      clone.setAttribute('xmlns', SVG_NS);
      clone.querySelectorAll('.pc-draw-selection, .pc-draw-marquee').forEach(n => n.remove()); // 不要選取框
      // 只截「納入送出」的標注：移除未勾選物件的圖元，讓截圖與送出的 JSON 一致。
      clone.querySelectorAll('[data-id]').forEach(n => { if (state.sendUnchecked[n.getAttribute('data-id')]) n.remove(); });
      const xml = new XMLSerializer().serializeToString(clone);
      const url = URL.createObjectURL(new Blob([xml], { type: 'image/svg+xml;charset=utf-8' }));
      const dataURL = await new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          canvas.width = w; canvas.height = h;
          canvas.getContext('2d').drawImage(img, 0, 0);
          resolve(canvas.toDataURL('image/png'));
        };
        img.onerror = reject;
        img.src = url;
      });
      URL.revokeObjectURL(url);
      return dataURL;
    } catch (_) { return null; }
  }
  // 同源 API 路徑（http(s) 才回，file:// 回 null）。resolve server 同源服務 flow + 這些端點。
  function sameOriginApi(p) {
    try {
      const o = typeof location !== 'undefined' && location.origin;
      return o && /^https?:/.test(o) ? o + p : null;
    } catch (_) { return null; }
  }
  // 預設打同源 /api/draw（http(s) 才送；file:// 回 null 不送）。
  function sameOriginDrawEndpoint() {
    try {
      return sameOriginApi('/api/draw');
    } catch (_) { return null; }
  }
  // 組 {json, png} → POST 到 endpoint（可無）；無論有無 server 都回 payload 供 caller/測試讀。
  async function sendToAgent(opts2 = {}) {
    const json = exportPayload();
    if (!json.annotations.length && !(json.decisions && json.decisions.length) && !(json.notes && json.notes.length)) return { json, png: null, sent: false, listening: false };
    const png = await capturePng();
    const payload = { json, png, sent: false, listening: false };
    const endpoint = opts2.endpoint || state.exportEndpoint || sameOriginDrawEndpoint();
    if (endpoint && typeof fetch === 'function') {
      try {
        const resp = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ json, png }) });
        payload.sent = true;
        // server 回 { ok, n, listening }：listening＝此刻 AI 是否在線（有 long-poll 連線）。
        try { const data = await resp.json(); if (data) { payload.listening = !!data.listening; payload.n = data.n; } } catch (_) { /* 無 JSON body 也算送出成功 */ }
      } catch (_) { payload.sent = false; }
    }
    return payload;
  }

  // 抽屜 footer「送給 AI（N）」按鈕處理：防重複送出、顯示中間/成功/失敗狀態。
  async function handleDrawerSend() {
    const sendBtn = recordDrawer.querySelector('.pc-draw-rec-send-btn');
    if (!sendBtn || sendBtn.disabled || sendBtn.dataset.inflight) return;
    const n = checkedObjects().length + checkedDecisions().length + state.notes.filter(x => !state.sendUnchecked[x.id]).length;
    if (!n) return; // 全沒勾 → 不送
    sendBtn.dataset.inflight = '1';
    sendBtn.disabled = true;
    sendBtn.textContent = '送出中…';
    let result;
    try { result = await sendToAgent(); } catch (_) { result = { sent: false }; }
    if (result && result.sent) {
      // 分「AI 在線＝立即送達」與「AI 未連線＝已排佇列（之後連上自動收）」，讓使用者看得出狀態。
      sendBtn.textContent = result.listening ? `✅ 已送達 AI（${n} 筆）` : `📥 已排佇列（${n} 筆，AI 未連線）`;
      sendBtn.classList.toggle('pc-draw-rec-queued', !result.listening);
      // 記下這批「實際送出（勾選）」的標注＋決定簽章 → 面板那幾列標「已送」（改動後簽章變、自動回「未送」）。
      checkedObjects().forEach(o => { state.sentSigs[o.id] = annotationSig(o); });
      checkedDecisions().forEach(d => { state.sentSigs[d.id] = decisionSig(d); });
      state.notes.filter(n => !state.sendUnchecked[n.id]).forEach(n => { state.sentSigs[n.id] = noteSig(n); });
      state.sentConfirmN = n; // outbox 清空清單後，footer 靠此維持「✅ 已送出（N 筆）」確認
      persistSentState(); // 修 bug：持久化「已送」→ 重整/重訂閱後不再把已送標注當未送畫回
      render(); // 立刻更新：畫布隱藏已送標注 + 各列「已送」標記（inflight 仍在 → 不蓋按鈕狀態文字）
      // 2 秒後恢復成可再送（同一批可重送；server 不去重、AI 端 cursor 會收到）。
      setTimeout(() => { delete sendBtn.dataset.inflight; renderRecordPanel(); }, 2000);
      return;
    }
    sendBtn.textContent = '⚠️ 送出失敗，再試一次';
    sendBtn.disabled = false;
    delete sendBtn.dataset.inflight;
  }

  function startTextInput(clientX, clientY, rect) {
    const input = drawHtmlEl('input', 'pc-draw-text-input');
    input.type = 'text';
    input.style.left = (clientX - rect.left) + 'px';
    input.style.top = (clientY - rect.top) + 'px';
    host.appendChild(input);
    setTimeout(() => input.focus(), 0);
    const point = clientToPct(clientX, clientY, rect);
    let done = false;
    const commit = () => {
      if (done) return;            // Enter 與 blur 都會觸發 → 防重複 remove/commit
      done = true;
      const text = input.value.trim();
      input.remove();
      if (!text) return;
      runCommand({ type: 'create', obj: makeDrawObject({ tool: 'text', geom: { x: point.x, y: point.y }, text, style: opts.style }) });
    };
    input.addEventListener('keydown', ev => { if (ev.isComposing || ev.keyCode === 229) return; if (ev.key === 'Enter') { ev.preventDefault(); commit(); } });
    input.addEventListener('blur', commit);
  }

  // ── 指元件 comment：點底層元件 → 收 prompt → 建一筆帶 anchor 的留言 ────────────────
  // 抓游標下 app 元件 selector；抓不到具體元件（body/overlay/toolbar）→ 不開輸入框、不建留言
  //（強制每筆 comment 都有錨點，AI 才知道指誰）。建出的物件沿用既有佇列/送出/已送全鏈。
  function startCommentInput(clientX, clientY, rect) {
    const selector = elSnapSelector(elementUnderPoint(clientX, clientY));
    if (!selector) return;
    const input = drawHtmlEl('input', 'pc-draw-text-input');
    input.type = 'text';
    input.style.left = (clientX - rect.left) + 'px';
    input.style.top = (clientY - rect.top) + 'px';
    host.appendChild(input);
    setTimeout(() => input.focus(), 0);
    const point = clientToPct(clientX, clientY, rect);
    let done = false;
    const commit = () => {
      if (done) return;            // Enter 與 blur 都會觸發 → 防重複
      done = true;
      const text = input.value.trim();
      input.remove();
      snapHighlight = null; // [fix7] 空輸入也要清 hover 高亮、重繪（移到 early-return 前）
      if (!text) { render(); return; }
      // geom 存建立時的元件 rect（fallback 落點）；render 時再用 anchor 重解析以跟著元件移位。
      const g = getRectPct(selector);
      const geom = g ? g : { ...point, w: 0, h: 0 }; // [fix3] selector 此刻沒回 rect → 至少給 {x,y,w:0,h:0}
      const o = makeDrawObject({ tool: 'comment', geom, text, style: opts.style });
      o.anchor = selector; // buildExport→selector、annotationRows→selector、隨元件移位重解析外框
      runCommand({ type: 'create', obj: o });
    };
    input.addEventListener('keydown', ev => { if (ev.isComposing || ev.keyCode === 229) return; if (ev.key === 'Enter') { ev.preventDefault(); commit(); } });
    input.addEventListener('blur', commit);
  }
  // 指元件 hover：游標下若有可標注 app 元件 → 顯示虛線外框（重用 snapHighlight 渲染）。
  let _cHoverRaf = null;
  function onCommentHover(e) {
    if (state.mode !== 'draw' || state.tool !== 'comment' || drag) return;
    if (host.querySelector('.pc-draw-text-input')) return; // [fix8a] 輸入框開著時不更新 hover
    if (_cHoverRaf) return;                               // [fix8b] rAF throttle（pointermove 連觸過頻）
    const cx = e.clientX, cy = e.clientY;
    _cHoverRaf = (typeof requestAnimationFrame === 'function' ? requestAnimationFrame : f => setTimeout(f, 16))(() => {
      _cHoverRaf = null;
      const sel = elSnapSelector(elementUnderPoint(cx, cy));
      const prevSel = snapHighlight && snapHighlight.selector;
      if (sel !== prevSel) { snapHighlight = sel ? { selector: sel } : null; render(); }
    });
  }

  // ── 雙擊：在物件上加/編輯綁定標籤（Excalidraw bound text）────────────────────────
  function onDblClick(e) {
    if (state.mode !== 'draw' || state.tool !== 'select') return;
    const rect = coordRect();
    const hit = hitTest(clientToPct(e.clientX, e.clientY, rect));
    if (hit) {
      e.preventDefault();
      state.selectedIds = [hit.id];
      if (hit.tool === 'text') startTextEdit(hit, rect); // 文字物件 → 編輯內容
      else startLabelEdit(hit, rect);                    // 其他 → 編輯綁定標籤
    } else startTextInput(e.clientX, e.clientY, rect);    // 雙擊空白 → 自由文字（Excalidraw parity）
  }
  // 在物件錨點（shape 中心 / line 中點）開輸入框，commit 寫回 obj.label（可 undo）。
  function startLabelEdit(o, rect) {
    const a = labelAnchor(o);
    const cx = pctToPx(a.x, rect.width), cy = pctToPx(a.y, rect.height);
    const input = drawHtmlEl('input', 'pc-draw-text-input');
    input.type = 'text';
    input.value = o.label || '';                 // 已有標籤 → 預填供編輯
    input.style.left = (cx - 40) + 'px';          // 大致置中於錨點
    input.style.top = (cy - 12) + 'px';
    input.style.textAlign = 'center';
    host.appendChild(input);
    setTimeout(() => { input.focus(); input.select(); }, 0);
    const before = { label: o.label || '' };
    let done = false;
    const commit = () => {
      if (done) return;
      done = true;
      const text = input.value.trim();
      input.remove();
      if (text === (o.label || '')) { render(); return; } // 無變更
      o.label = text;                              // 立即套用（預覽）
      pushHistory({ type: 'update', id: o.id, before, after: { label: text } });
    };
    input.addEventListener('keydown', ev => { if (ev.isComposing || ev.keyCode === 229) return; if (ev.key === 'Enter') { ev.preventDefault(); commit(); } });
    input.addEventListener('blur', commit);
  }
  // 雙擊文字物件 → 編輯其內容（o.text）；清空則刪除該物件。
  function startTextEdit(o, rect) {
    state.editingId = o.id; // 隱藏原件 → 編輯時只看到一個輸入框
    render();
    const input = drawHtmlEl('input', 'pc-draw-text-input');
    input.type = 'text';
    input.value = o.text || '';
    input.style.left = pctToPx(o.geom.x, rect.width) + 'px';
    input.style.top = (pctToPx(o.geom.y, rect.height) - 12) + 'px';
    host.appendChild(input);
    setTimeout(() => { input.focus(); input.select(); }, 0);
    const before = { text: o.text || '' };
    let done = false;
    const commit = () => {
      if (done) return;
      done = true;
      state.editingId = null; // 還原顯示
      const text = input.value.trim();
      input.remove();
      if (text === (o.text || '')) { render(); return; } // 無變更
      if (!text) { // 清空 → 刪除該文字物件
        const index = state.objects.findIndex(x => x.id === o.id);
        if (index >= 0) runCommand({ type: 'deleteMany', items: [{ obj: o, index }] });
        else render();
        return;
      }
      o.text = text;                               // 立即套用（預覽）
      pushHistory({ type: 'update', id: o.id, before, after: { text } });
      render();
    };
    input.addEventListener('keydown', ev => { if (ev.isComposing || ev.keyCode === 229) return; if (ev.key === 'Enter') { ev.preventDefault(); commit(); } });
    input.addEventListener('blur', commit);
  }

  // ── 貼圖：paste（剪貼簿）/ drop（檔案）→ image 物件（P3，dataURL 內嵌）─────────────
  // 核心：addImage（純資料路徑，paste/drop 與 e2e 共用），回傳新物件。
  function addImage(dataURL, naturalW, naturalH, atPoint) {
    const cw = svg.clientWidth || host.clientWidth || 1;
    const ch = svg.clientHeight || host.clientHeight || 1;
    const geom = imageGeom(naturalW, naturalH, cw, ch, atPoint);
    const obj = makeDrawObject({ tool: 'image', geom, imageRef: dataURL });
    runCommand({ type: 'create', obj }); // 進 undo/redo + 自動選取
    return obj;
  }
  // blob → dataURL → 量自然尺寸 → addImage。
  function loadBlobAsImage(blob, atPoint) {
    const reader = new FileReader();
    reader.onload = () => {
      const dataURL = reader.result;
      const img = new Image();
      img.onload = () => addImage(dataURL, img.naturalWidth || img.width, img.naturalHeight || img.height, atPoint);
      img.src = dataURL;
    };
    reader.readAsDataURL(blob);
  }
  function isTyping() {
    const ae = document.activeElement;
    return !!ae && (ae.tagName === 'INPUT' || ae.tagName === 'TEXTAREA' || ae.isContentEditable);
  }
  function onPaste(e) {
    if (state.mode !== 'draw' || isTyping()) return; // 打字時不攔貼上
    const items = (e.clipboardData && e.clipboardData.items) || [];
    for (const it of items) {
      if (it.type && it.type.indexOf('image') === 0) {
        const blob = it.getAsFile();
        if (blob) { e.preventDefault(); loadBlobAsImage(blob, null); return; } // 置中
      }
    }
  }
  function onDragOver(e) { if (state.mode === 'draw') e.preventDefault(); } // 允許 drop
  function onDrop(e) {
    if (state.mode !== 'draw') return;
    e.preventDefault(); // 擋瀏覽器開新頁
    const files = (e.dataTransfer && e.dataTransfer.files) || [];
    const at = clientToPct(e.clientX, e.clientY, svg.getBoundingClientRect());
    for (const f of files) {
      if (f.type && f.type.indexOf('image') === 0) { loadBlobAsImage(f, at); return; }
    }
  }

  // ── 鍵盤：Delete/Backspace 刪除、Cmd/Ctrl+Z undo、Shift+Cmd/Ctrl+Z redo ────────
  function onKey(e) {
    const tag = (e.target && e.target.tagName) || '';
    if (tag === 'INPUT' || tag === 'TEXTAREA' || (e.target && e.target.isContentEditable)) return; // 打字中一律不攔
    const meta = e.metaKey || e.ctrlKey;
    // 工具切換快捷鍵：即使在 off（放行）模式也生效 → 自動進繪圖模式（Excalidraw 風格，按 2 直接畫）。
    // 排除 Cmd/Ctrl/Alt 以免撞 undo/redo/瀏覽器；e.code 讓注音/IME 開著也能切工具。
    if (!meta && !e.altKey) {
      // C：切換留言模式（用 e.code 對抗注音/IME；含修飾鍵時不攔，避免撞 Cmd+C 複製）。
      if (e.code === 'KeyC') { e.preventDefault(); toggleNote(); return; }
      const action = resolveShortcut(e.key) || resolveShortcutByCode(e.code);
      if (action === 'eyedropper') { if (state.mode === 'draw') { e.preventDefault(); openEyedropper(); } return; } // 取色需先在繪圖模式
      if (action) {
        e.preventDefault();
        if (action === 'pencil') setBrush('pen'); // 7/P → 自由筆（預設 pen）
        else setTool(action);                     // setTool 內部 setMode('draw') → 自動進繪圖模式
        return;
      }
    }
    // 以下操作只在繪圖模式有意義（Esc 關選單、undo/redo、群組、刪除）。
    if (state.mode !== 'draw') return;
    if (e.key === 'Escape') { closeContextMenu(); return; } // 關右鍵選單
    if (meta && (e.key === 'z' || e.key === 'Z')) {
      e.preventDefault();
      if (e.shiftKey) doRedo(); else doUndo();
      return;
    }
    if (meta && e.key.toLowerCase() === 'g') {
      e.preventDefault();
      if (e.shiftKey) doUngroupSelected(); else doGroupSelected();
      return;
    }
    if ((e.key === 'Delete' || e.key === 'Backspace') && state.selectedIds.length) {
      e.preventDefault();
      deleteSelected();
      return;
    }
  }

  // ── 右鍵 context menu（z-order + 刪除，作用於選取集合）──────────────────────────
  function onContextMenu(e) {
    if (state.mode !== 'draw' || state.tool !== 'select') return;
    e.preventDefault(); // 擋掉瀏覽器原生選單
    const rect = coordRect();
    const hit = hitTest(clientToPct(e.clientX, e.clientY, rect));
    if (!hit) { closeContextMenu(); return; }
    if (!isSelected(hit.id)) selectOnly(hit.id); // 右鍵未選物件 → 先選它
    render();
    openContextMenu(e.clientX, e.clientY);
  }
  // 依選取狀態動態顯示 群組（選 ≥2）／解散群組（選到群組成員）。
  function syncContextItems() {
    const canGroup = state.selectedIds.length >= 2;
    const canUngroup = state.selectedIds.some(id => { const o = findById(state.objects, id); return !!(o && o.groupId); });
    const g = contextMenu.querySelector('[data-action="group"]');
    const u = contextMenu.querySelector('[data-action="ungroup"]');
    if (g) g.style.display = canGroup ? '' : 'none';
    if (u) u.style.display = canUngroup ? '' : 'none';
  }
  function openContextMenu(x, y) {
    syncContextItems();
    contextMenu.style.left = x + 'px';
    contextMenu.style.top = y + 'px';
    contextMenu.classList.add('open');
    // 下一輪 tick 再掛外點關閉監聽（避免開啟當下的同一個 pointer 事件立刻關掉）。Esc 由 onKey 處理。
    setTimeout(() => document.addEventListener('pointerdown', onDocPointer, true), 0);
  }
  function closeContextMenu() {
    contextMenu.classList.remove('open');
    document.removeEventListener('pointerdown', onDocPointer, true);
  }
  function onDocPointer(e) { if (!contextMenu.contains(e.target)) closeContextMenu(); }

  svg.addEventListener('pointerdown', onDown);
  svg.addEventListener('pointermove', onCommentHover);                       // 指元件 hover 外框
  svg.addEventListener('pointerleave', () => { if (snapHighlight && state.tool === 'comment') { snapHighlight = null; render(); } });
  svg.addEventListener('dblclick', onDblClick);
  svg.addEventListener('contextmenu', onContextMenu);
  svg.addEventListener('dragover', onDragOver);
  svg.addEventListener('drop', onDrop);
  window.addEventListener('resize', render);
  window.addEventListener('scroll', renderReplies, true); // 捲動時方案卡跟著重新定位（capture：任何容器捲動都收到）
  window.addEventListener('keydown', onKey);
  window.addEventListener('paste', onPaste);

  // dev 模式：init 時從本機儲存還原向量物件（首次 render 前）。try/catch 確保失敗不影響繪圖。
  if (useLocalPersist && _storage) {
    try {
      const raw = _storage.getItem(localKey);
      if (raw) {
        const stored = JSON.parse(raw);
        if (Array.isArray(stored)) { state.objects = hydrateObjectsFromLocal(stored); } // backward compat（舊格式無墓碑）
        else if (stored) {
          state.tombstones = stored.tombstones || {}; // 向後相容：舊快照無 tombstones → 空集
          // 載入即用墓碑過濾（雙保險：即使快照 objects/notes 混入已刪項也不還原）。
          state.objects = filterTombstoned(hydrateObjectsFromLocal(stored.objects || []), state.tombstones);
          state.notes = filterTombstoned(stored.notes || [], state.tombstones);
        }
        // 還原後推進 id 計數器，避免新物件 id 與還原物件碰撞（見 bumpIdSeq 註解）。
        bumpIdSeq([
          ...state.objects.map(o => o.id),
          ...state.objects.map(o => o.groupId).filter(Boolean),
          ...state.notes.map(n => n.id),
        ]);
      }
    } catch (_) { /* localStorage 失敗 / JSON 損毀 → 從空白開始 */ }
  }

  loadSentState(); // 修 bug：還原「已送」狀態 → 已送標注重整後仍隱藏、不會又出現在畫布/清單
  applyMode();
  render();
  startSync(); // P7：團隊模式才訂閱 + 載入既有 drawings（dev 模式 drawStore=null → no-op）
  if (opts.replyPoll) { replyPollLoop(); loadHtml2canvas(); } // 跑方案卡輪詢 + 預載 html2canvas（送出時整頁截圖才不會卡/退回透明）

  return {
    svg, host,
    getMode: () => state.mode,
    setMode,
    getTool: () => state.tool,
    setTool,
    getObjects: () => { stampZ(); return state.objects.map(serializeDrawObject); },
    getSelected: () => (state.selectedIds.length ? state.selectedIds[0] : null), // 向後相容：回傳首個
    getSelectedIds: () => state.selectedIds.slice(),
    select: id => { state.selectedIds = id ? [id] : []; render(); },
    selectIds: ids => { state.selectedIds = (ids || []).slice(); render(); },
    bringToFront: () => zorder('front'),
    sendToBack: () => zorder('back'),
    forward: () => zorder('forward'),
    backward: () => zorder('backward'),
    deleteSelected,
    undo: doUndo,
    redo: doRedo,
    setColor,
    setStrokeWidth,
    setFontSize,
    setHeads,
    eyedropper: openEyedropper,
    addImage, // (dataURL, naturalW, naturalH, atPoint?) → 新 image 物件（paste/drop 與測試共用）
    buildExport: exportPayload,            // 結構化 JSON（selector + text + geom）
    capturePng,                            // async → PNG dataURL
    isExcludedFromCapture: el => isCaptureExcluded(el), // 測試用：某元素是否被排除出送出截圖
    sendToAgent,                           // async (opts?) → {json, png, sent}；回 payload
    setExportEndpoint: url => { state.exportEndpoint = url; },
    getAnnotationRows: () => annotationRows(state.objects, state.sentSigs), // P6 面板 row 資料（純函式包裝）
    ingestReplies, // AI 方案卡：注入回覆（poll 收到或測試用）
    getReplies: () => state.replies.slice(),
    getNotes: () => state.notes.slice(),                 // 註記清單（poll / 測試用）
    // 放一則註記（測試 / 程式化）：addNote(text, {sel|objId, relX,relY, x,y, label}) 或舊式 addNote(text, x, y)。
    addNote: (text, a, b) => saveNote(text, (a && typeof a === 'object') ? a : { x: a, y: b }),
    deleteNote,
    getTombstones: () => ({ ...state.tombstones }), // 目前墓碑集合 {id: deletedAt}（測試 / 檢視用）
    // compact：清掉早於 maxAgeMs（預設 30 天）的墓碑並回寫。只清本地墓碑索引；
    // Firestore 上的墓碑 doc 由維護腳本用 store.remove 硬刪（保留該入口）。回傳清理後的集合。
    compactTombstones: (now, maxAgeMs) => {
      state.tombstones = compactTombstones(state.tombstones, now, maxAgeMs);
      persistLocalSave();
      return { ...state.tombstones };
    },
    getDecisions: () => state.decisions.slice(), // 方案卡選擇進的佇列
    // 外部決策 UI（如 hub decide.js 的 .opt 卡）把「選定」灌進佇列 → 由回饋匣一起計數/送出。
    // d = { id, text, optionLabel?, optionId?, replyId?, anchor? }；同 id 再呼叫＝改選（取代舊決定）。
    addDecision: (d) => {
      if (!d || d.id == null) return null;
      state.decisions = state.decisions.filter(x => x.id !== d.id);
      const dec = { id: d.id, replyId: d.replyId != null ? d.replyId : d.id, optionId: d.optionId, optionLabel: d.optionLabel, text: d.text, anchor: d.anchor };
      state.decisions.push(dec);
      delete state.sendUnchecked[d.id];
      delete state.sentSigs[d.id]; // 改選 → 回未送 → 回饋匣重新計數
      render();
      return dec;
    },
    removeDecision: (id) => { removeDecision(id); render(); },
    // 開/關回饋匣（hub decide.js 於引擎就緒後呼叫 setFeedbackBox(true) 啟用單鍵送出）。
    setFeedbackBox: (on) => { if (on) ensureFeedbackBox(); else removeFeedbackBox(); },
    getFeedbackCount: () => feedbackCount(),
    toggleRecordPanel: () => { state.recordOpen = !state.recordOpen; renderRecordPanel(); },
    // 決策 A：外部（如 live-markup 換頁監聽）呼叫 → 依當前 getScreenId() 重畫，只顯示當前頁標注。
    refresh: () => render(),
    clear: () => { state.objects = []; state.draft = null; state.selectedIds = []; state.sentSigs = {}; state.sentConfirmN = 0; state.sendUnchecked = {}; state.replies = []; state.decisions = []; state.notes = []; render(); persistLocalSave(); persistSentState(); },
    destroy: () => {
      stopLive(); // Batch 4：拆掉 live reposition 監聽/rAF/ResizeObserver
      replyPolling = false; // 停掉 AI 方案卡輪詢
      svg.remove(); toolbar.remove(); contextMenu.remove(); replyLayer.remove();
      noteLayer.remove(); closeNotePanel(); // 留言層 + 放大面板/遮罩
      recordTab.remove(); recordDrawer.remove();
      removeFeedbackBox();
      window.removeEventListener('resize', render);
      window.removeEventListener('scroll', renderReplies, true);
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('paste', onPaste);
      if (typeof unsubDraw === 'function') { try { unsubDraw(); } catch (_) { /* ignore */ } }
      closeContextMenu();
    },
  };
}

// opts.persist → drawings store（純 wiring，可單測思路）。接受三種輸入：
//   - falsy        → null（dev 模式，0 Firebase）
//   - ready store  → 已有 subscribe/save → 直接用（呼叫端先 createDrawingStore）
//   - {fb,db,projectId} → 用 createDrawingStore 現場建（team 模式便利寫法）
// 任一步出錯都回 null → 退回純本地，永不讓持久化擋住繪圖。
function resolveDrawStore(persist) {
  if (!persist) return null;
  try {
    if (typeof persist.subscribe === 'function' && typeof persist.save === 'function') return persist;
    if (persist.fb && persist.projectId != null) return createDrawingStore(persist.fb, persist.db, persist.projectId);
  } catch (_) { /* ignore → null */ }
  return null;
}
