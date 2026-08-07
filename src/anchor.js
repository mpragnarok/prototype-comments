/**
 * anchor —— 一則標記「指到哪個元素」的擷取與還原。
 *
 * ── 為什麼要有這一支 ──────────────────────────────────────────
 * 原本只存一條 CSS 位置路徑（`main > div:nth-of-type(8) > div > p:nth-of-type(2)`）。
 * 那條路徑對「有人在前面插了一個區塊」零抵抗力：整批往後推一格，每一則回饋
 * 都貼到別人身上——而且**畫面上完全看不出來**，框照畫、標籤照顯示。
 *
 * 2026-08-07 就這樣壞過一次：jenny-ortho-crm 的 /preview/data-questions/
 * 在最前面插了兩張卡，那一頁 15 則回饋全數失準；整個專案 60 則裡 45 則不再
 * 指得到當初那個元素。而 60 則裡有 43 則連「當初框的是哪一段文字」都沒有存，
 * 只能靠翻 git 把當時的頁面 build 回來才查得出來。
 *
 * ── 所以錨點分三層 ────────────────────────────────────────────
 *   1. 穩定 id（`data-fb-id`，或元素自己的 `id`）——頁面怎麼重排都跟著走
 *   2. 當初框住的文字——內容還在就對得回來，成本近乎零，卻是改版後唯一的線索
 *   3. 位置路徑——什麼都沒有時的最後手段，也是舊資料唯一有的東西
 *
 * 讀取端一定要能接受「只有第 3 層」的舊資料（既有 60 則都是），
 * 只是要在畫面上說清楚那一則是用舊方式定位的。
 */

/** 使用端在會被標記的區塊上掛這個屬性，值用語意名稱（`q-brand`），NEVER 用序號。 */
export const FB_ID_ATTR = 'data-fb-id';

/** 文字錨點存多長。夠長到能認出是哪一段，短到不會把整張卡的內容都抄一份。 */
const TEXT_LIMIT = 300;

/** 比對前的正規化：連續空白（含零寬字元）收成一個空格。 */
function norm(text) {
  return String(text || '').replace(/[\s​‌﻿]+/g, ' ').trim();
}

/**
 * 沿 DOM 往上找最近的穩定 id。
 *
 * `data-fb-id` 優先於 `id`：`id` 是給樣式與 a11y 用的，隨時可能為了別的理由改掉，
 * 而 `data-fb-id` 存在的唯一理由就是「回饋要錨在這裡」——改它的人知道自己在改什麼。
 *
 * 兩者都要驗「這一頁只有一個」：HTML 不強制 id 唯一，重複的 id 會讓標記靜靜錨到
 * 第一個同名的元素，也就是別人身上。
 */
export function anchorFor(el) {
  const doc = el && el.ownerDocument;
  if (!el || !el.closest || !doc) return { anchorId: null, anchorAttr: null };
  const unique = (sel) => {
    try { return doc.querySelectorAll(sel).length === 1; } catch { return false; }
  };
  const tagged = el.closest(`[${FB_ID_ATTR}]`);
  const fbId = tagged && tagged.getAttribute(FB_ID_ATTR);
  if (fbId && unique(`[${FB_ID_ATTR}="${cssEscape(fbId)}"]`)) {
    return { anchorId: fbId, anchorAttr: FB_ID_ATTR };
  }
  const withId = el.closest('[id]');
  const id = withId && withId.getAttribute('id');
  if (id && unique(`#${cssEscape(id)}`)) return { anchorId: id, anchorAttr: 'id' };
  return { anchorId: null, anchorAttr: null };
}

/** 當初框住的那段文字。存不存是「頁面改版後救不救得回來」的分水嶺。 */
export function elementTextFor(el) {
  return norm(el && el.textContent).slice(0, TEXT_LIMIT);
}

function cssEscape(s) {
  if (typeof CSS !== 'undefined' && CSS.escape) return CSS.escape(s);
  return String(s).replace(/[^a-zA-Z0-9_-]/g, '\\$&');
}

function anchorSelector(mark) {
  if (!mark.anchorId) return null;
  return mark.anchorAttr === 'id'
    ? `#${cssEscape(mark.anchorId)}`
    : `[${FB_ID_ATTR}="${cssEscape(mark.anchorId)}"]`;
}

function only(nodes) {
  return nodes.length === 1 ? nodes[0] : null;
}

/**
 * 文字比對：在 `scope` 底下找**唯一**一個內容等於 `text` 的元素。
 *
 * 「唯一」是重點。命中多個就退回去，不要挑第一個——挑錯的話，錨點會從
 * 「解不到」變成「解到別人身上」，那比解不到更糟：解不到看得出來，解錯看不出來。
 *
 * 取最深的那些（父層的 textContent 一定也包含子層的），才是真正框住那段字的元素。
 */
function byText(scope, text) {
  const wanted = norm(text);
  if (!wanted) return null;
  const hits = [];
  for (const el of scope.querySelectorAll('*')) {
    if (el.closest('[data-em]')) continue;          // 工具自己的 DOM 不算
    if (norm(el.textContent) === wanted) hits.push(el);
  }
  const deepest = hits.filter(el => !hits.some(other => other !== el && el.contains(other)));
  return only(deepest);
}

/**
 * 一則標記 → 現在的頁面上那個元素。
 *
 * 回傳 `how` 是給 UI 用的：只有位置路徑解出來的（`selector`）要在畫面上標明
 * 「可能不準」——那些是舊資料，而看的人有權知道哪幾則不能全信。
 *
 * @returns {{ node: Element|null, how: 'id'|'text'|'selector'|null }}
 */
export function resolveAnchor(mark, doc = document) {
  const container = anchorSelector(mark) ? only([...doc.querySelectorAll(anchorSelector(mark))]) : null;
  if (container) {
    // 有錨點容器時，再用文字往裡面收斂到她當初真正框的那一段；收斂不到就框整張卡
    return { node: (mark.elementText && byText(container, mark.elementText)) || container, how: 'id' };
  }
  const byWords = mark.elementText ? byText(doc, mark.elementText) : null;
  if (byWords) return { node: byWords, how: 'text' };
  if (!mark.selector) return { node: null, how: null };
  try {
    const node = doc.querySelector(mark.selector);
    return node ? { node, how: 'selector' } : { node: null, how: null };
  } catch {
    return { node: null, how: null };   // 存壞的 selector
  }
}
