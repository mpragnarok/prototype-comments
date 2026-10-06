// test/note-attachments.unit.spec.js — 註記卡附件的純函式單測（無 DOM；node 直跑）
//
//   node test/note-attachments.unit.spec.js
//
// 對象：上限判斷（checkAttachAdd）、寫進 doc 的附件形狀（attachmentsForDoc / cleanAttachment）、
// 大小與副檔名顯示、413 判斷，以及 noteSig 帶／不帶附件時的簽章（沒附件的舊註記簽章必須不變）。
import {
  NOTE_ATTACH_MAX, NOTE_ATTACH_MAX_BYTES, attachLimitLabel, formatAttachBytes, attachExt,
  isImageAttachment, checkAttachAdd, cleanAttachment, attachmentsForDoc, isAttachTooLargeError,
  attachFilesFromTransfer, isFileDrag,
} from '../src/draw/attachments.js';
import { noteSig } from '../src/draw/selectors.js';

let pass = 0, fail = 0;
function test(name, fn) {
  try { fn(); console.log('  ✓', name); pass++; }
  catch (e) { console.error('  ✗', name, '\n     ', e.message); fail++; }
}
function assert(cond, msg) { if (!cond) throw new Error(msg || 'assertion failed'); }
function eq(a, b, msg) { assert(a === b, (msg || '') + ` — expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`); }

const MB = 1024 * 1024;
const A1 = { name: 'a.png', type: 'image/png', size: 1200, url: 'uploads/1-a.png', path: '/ws/uploads/1-a.png' };

console.log('note attachments unit (pure fns):');

test('上限常數：一則最多 3 個、單檔 10MB', () => {
  eq(NOTE_ATTACH_MAX, 3);
  eq(NOTE_ATTACH_MAX_BYTES, 10 * MB);
  eq(attachLimitLabel(), '10MB', '上限文字從常數算');
});
test('checkAttachAdd：0~2 個且未超過大小 → null（可以加）', () => {
  eq(checkAttachAdd(0, { size: 1 }), null);
  eq(checkAttachAdd(2, { size: 10 * MB }), null, '剛好 10MB 可以');
});
test('checkAttachAdd：已有 3 個 → full（第 4 個被擋）', () => {
  eq(checkAttachAdd(3, { size: 1 }), 'full');
});
test('checkAttachAdd：超過 10MB 一個位元組 → too_large', () => {
  eq(checkAttachAdd(0, { size: 10 * MB + 1 }), 'too_large');
});
test('checkAttachAdd：滿了優先於太大（先說滿了）', () => {
  eq(checkAttachAdd(3, { size: 50 * MB }), 'full');
});
test('attachmentsForDoc：空陣列／undefined／非陣列 → null（呼叫端就不寫欄位）', () => {
  eq(attachmentsForDoc([]), null);
  eq(attachmentsForDoc(undefined), null);
  eq(attachmentsForDoc('x'), null);
});
test('attachmentsForDoc：只留合約欄位 {name,type,size,url,path}，丟掉其他', () => {
  const out = attachmentsForDoc([{ ...A1, status: 'done', file: {}, preview: 'blob:x' }]);
  eq(JSON.stringify(out), JSON.stringify([A1]));
});
test('attachmentsForDoc：沒有 path 也沒有 url 的（沒傳上去的）不帶入', () => {
  const out = attachmentsForDoc([A1, { name: 'b.pdf', size: 3 }]);
  eq(out.length, 1); eq(out[0].name, 'a.png');
});
test('cleanAttachment：null 欄位不寫', () => {
  eq(JSON.stringify(cleanAttachment({ name: 'x', type: null, size: 0 })), JSON.stringify({ name: 'x', size: 0 }));
});
test('formatAttachBytes：B / KB / 一位小數 MB / 整數 MB', () => {
  eq(formatAttachBytes(500), '500 B');
  eq(formatAttachBytes(380 * 1024), '380 KB');
  eq(formatAttachBytes(1.2 * MB), '1.2 MB');
  eq(formatAttachBytes(48 * MB), '48 MB');
});
test('attachExt：副檔名大寫；沒有副檔名 → FILE', () => {
  eq(attachExt('規格表.pdf'), 'PDF');
  eq(attachExt('a.tar.gz'), 'GZ');
  eq(attachExt('README'), 'FILE');
});
test('isImageAttachment：看 type 開頭', () => {
  assert(isImageAttachment({ type: 'image/png' }));
  assert(!isImageAttachment({ type: 'application/pdf' }));
  assert(!isImageAttachment(null));
});
test('isAttachTooLargeError：413 或 too_large 才算', () => {
  assert(isAttachTooLargeError({ status: 413 }));
  assert(isAttachTooLargeError({ error: 'too_large' }));
  assert(isAttachTooLargeError(new Error('upload failed: too_large')));
  assert(!isAttachTooLargeError(new Error('network')));
  assert(!isAttachTooLargeError(null));
});
test('attachFilesFromTransfer：先拿 files，沒有再從 items 取 kind=file', () => {
  eq(attachFilesFromTransfer({ files: ['f1'] })[0], 'f1');
  const dt = { files: [], items: [{ kind: 'string' }, { kind: 'file', getAsFile: () => 'f2' }] };
  eq(JSON.stringify(attachFilesFromTransfer(dt)), JSON.stringify(['f2']));
  eq(attachFilesFromTransfer(null).length, 0);
});
test('isFileDrag：types 含 Files 才算拖檔', () => {
  assert(isFileDrag({ dataTransfer: { types: ['Files'] } }));
  assert(!isFileDrag({ dataTransfer: { types: ['text/plain'] } }));
  assert(!isFileDrag({}));
});
test('noteSig：沒附件的註記簽章與加功能前一模一樣（不會被誤判成未送）', () => {
  const n = { text: 'hi', sel: '#a', objId: null, range: undefined };
  eq(noteSig(n), JSON.stringify({ text: 'hi', sel: '#a', objId: null, range: undefined }));
  eq(noteSig({ ...n, attachments: [] }), noteSig(n), '空陣列視同沒附件');
});
test('noteSig：加了附件 → 簽章改變（已送的會變回未送）', () => {
  const n = { text: 'hi', sel: '#a' };
  assert(noteSig({ ...n, attachments: [A1] }) !== noteSig(n));
});

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
