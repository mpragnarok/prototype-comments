/**
 * @deprecated 改用 `./user-feedback-markup.js`。
 *
 * 這支只剩一行轉接，留著是為了不弄壞既有掛法——CDN 是公開的，
 * 已經照舊網址掛上去的頁面不該因為我們想改個名字就斷掉。
 *
 * 為什麼改名：舊名字看不出它屬於哪個 skill。讀 SKILL.md 的人看到
 * 「import element-markup.js」，第一個問題都是「這是另一個工具嗎？」——
 * 一個人問等於每個人都會問。新名字 `user-feedback-markup.js` 與同資料夾的
 * `user-feedback.js` 是同一家族，一眼看得出關係。
 */
export * from './user-feedback-markup.js';
