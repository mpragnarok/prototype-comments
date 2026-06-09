# prototype-comments

Drop-in Firebase comment overlay for HTML prototypes.

- **設計模式**：在任何 `designTarget` 容器上點擊留下帶編號的 pin（Figma 風格）
- **工程模式**：在 dev note 行右側留 inline comment
- 兩種模式的 note 留言**互通**：同一條 note 在設計模式 info panel 和工程模式 eng-note-row 共用同一批留言
- 以 Firebase Firestore 持久化，Google Auth 辨識作者

---

## Quick Start

### 1. 建立 Firebase 專案

前往 [Firebase Console](https://console.firebase.google.com/)：

1. 建立（或選用）一個 Firebase 專案
2. **Authentication → Sign-in method** → 啟用 **Google**
3. **Authentication → Settings → Authorized domains** → 加入你的 prototype 部署網域
4. **Firestore** → 建立資料庫（以下步驟 4 會設置 rules）

### 2. 取得 Firebase 設定

在 Firebase Console → 專案設定 → 你的 app → 複製 `firebaseConfig` 物件。

> ℹ️ `firebaseConfig` **不是 secret**（`apiKey` 只是 public identifier），放進公開 repo 沒問題。
> 真正的防線是 Firestore Rules + Authorized domains（見 [Security](#security)），不是把 config 藏起來。

### 3. 在 HTML prototype 引入

```html
<script type="module">
  import { initPrototypeComments } from
    'https://prototype-comments.netlify.app/src/index.js';   // self-host，no-cache（見 netlify.toml）

  initPrototypeComments({
    firebaseConfig: {
      apiKey:            '...',
      authDomain:        '...',
      projectId:         '...',
      storageBucket:     '...',
      messagingSenderId: '...',
      appId:             '...',
    },
    projectId:       'my-prototype',       // Firestore namespace（多個 prototype 共用一個 Firebase 專案時用來隔離）
    getScreenId:     () => window.currentScreen,
    getMode:         () => window.currentMode,
    designTarget:    '#phone',             // positional pin 的容器（需有 position: relative）
    engNoteSelector: '.eng-note-row',      // 工程模式 note 行的 CSS selector
  });
</script>
```

### 4. prototype 需要加上的 3 個修改

**① `goto()` 裡 dispatch screen-change event**

```js
function goto(id) {
  currentScreen = id;
  window.currentScreen = id;   // ← 必須暴露到 window
  // ... 你的原有邏輯 ...
  document.dispatchEvent(new CustomEvent('pc:screen-change', { detail: { screenId: id } }));
}
```

**② `switchMode()` 暴露 mode 到 window 並 dispatch screen-change**

```js
function switchMode(mode) {
  window.currentMode = mode;   // ← 必須暴露到 window
  // ... 你的原有邏輯 ...
  // ← 必須 dispatch，讓 prototype-comments 重新訂閱正確的 Firestore query
  // （設計模式 → 依 screenId 訂閱；工程模式 → 訂閱所有 note）
  document.dispatchEvent(new CustomEvent('pc:screen-change', { detail: { screenId: window.currentScreen } }));
}
```

> ⚠️ **若省略這行**，切換到工程模式後留言不會出現——因為 Firestore 訂閱仍在使用設計模式的 screenId 過濾器。

**③ dev note 元素加 data attributes（供 note comment key 使用）**

```html
<!-- 設計模式 info panel -->
<div class="dev-note-v2" data-tag="API" data-text="此 API 尚未確認">...</div>

<!-- 工程模式 -->
<div class="eng-note-row" data-tag="API" data-text="此 API 尚未確認">...</div>
```

**④ 使用 `authBarTarget` 讓 auth bar 整合進 header（推薦）**

在 `initPrototypeComments` 加上 `authBarTarget`，auth bar 會注入成 header flex row 的最後一個子元素，不以 `position:fixed` 浮動覆蓋內容：

```js
initPrototypeComments({
  ...
  authBarTarget: '.header',   // CSS selector，需對應 display:flex 的 header 元素
});
```

同時在 header CSS 讓最後一個導覽元素（如 mode-switcher）有 `margin-left:auto`，
使它靠右，auth bar 緊接其後：

```css
.mode-switcher {
  margin-left: auto;    /* 推到右側，auth bar 緊接在後 */
  padding-left: 16px;
  border-left: 1px solid #e5e7eb;
}
```

結果：`[title][flow buttons] ←自動空間→ |[設計][工程] |[avatar …]`

> **跨頁面守則（每個新 UI flow HTML 只需 2 個設定）：**
> 1. `initPrototypeComments({ authBarTarget: '.my-header' })`
> 2. header 的最後一個導覽元素加 `margin-left: auto`

### 5. Firestore Rules（本 repo 是唯一 SSOT）

留言規則住在本 repo 的 [`firestore.rules`](firestore.rules)，部署到共用 project `prototype-comments-27106`（已在 `.firebaserc` 釘死 default）。**不要**把這段規則 copy 進各 consumer（vitallink / coshift / badminton）的 firestore.rules — 它們全指向同一個 project，只需這裡這一份。

改完規則後一行部署：

```bash
make deploy-rules          # = firebase deploy --only firestore:rules
```

> ⚠ `firestore.rules` 的 `update` 白名單必須與 `src/index.js` 的 `resolvePayload()` 寫入欄位同步。pc.js 改了 resolve 寫入哪些欄位，白名單要一起改再 `make deploy-rules`，否則非作者按 resolve 會 `permission-denied`。

---

## API

```ts
initPrototypeComments(opts: {
  firebaseConfig:   object;          // Firebase app config（必填）
  projectId?:       string;          // Firestore namespace，預設 'default'
  getScreenId?:     () => string;    // 當前 screen id，預設 () => 'unknown'
  getMode?:         () => string;    // 'design' | 'eng'，預設 () => 'design'
  designTarget?:    string;          // CSS selector for pin container，預設 '#phone'
  engNoteSelector?: string;          // CSS selector for eng note rows，預設 '.eng-note-row'
  authBarTarget?:   string;          // CSS selector for flex header to inject auth bar into
                                     // 未設定時 fallback 到 position:fixed;top:12px;right:16px
}): Promise<{ setCommentMode, getComments, subscribe }>
```

---

## Firestore 資料模型

Collection path: `prototype-comments/{projectId}/comments/{commentId}`

```js
{
  type:        'positional' | 'note',
  screenId:    'screen-id',
  // positional only:
  x:           42.3,          // % of designTarget width
  y:           18.7,          // % of designTarget height
  parentId:    'comment-id',  // optional, for replies
  // note only:
  noteKey:     'API::此 API 尚未確認',
  noteTag:     'API',
  noteText:    '此 API 尚未確認',
  // common:
  body:        '留言內容',
  authorUid:   'google-uid',
  authorName:  'Mina Huang',
  authorPhoto: 'https://...',
  createdAt:   serverTimestamp(),
  edited:      true,          // optional，編輯過才有

  // resolve 狀態（resolvePayload 一次寫這四欄；取消解決時清空為 false/''/null）：
  resolved:      false,
  resolvedBy:    'Mina Huang',     // 解決者顯示名
  resolvedByUid: 'google-uid',
  resolvedAt:    serverTimestamp(),

  // 協作欄位（皆在 update 白名單內）：
  reactions:    { '👍': ['uid1', 'uid2'] },  // emoji → 按的人 uid 陣列
  decision:     'adopt',       // optional，外部 report 工具寫入；pc.js 不再顯示/編輯
  decisionNote: '...',         // optional，同上
}
```

---

## Security

權威規則見本 repo 的 [`firestore.rules`](firestore.rules)（SSOT，部署到 `prototype-comments-27106`）。重點：

- **Firebase config 不含任何 secret**。`apiKey` 只是 public identifier，安全靠 Rules + Authorized domains，不靠藏 config。
- **讀取公開**：`allow read: if true`，有分享連結即可看留言。
- **寫入限公司帳號**：create / update / delete 都需通過 `isJubo()` — 已驗證（`email_verified`）的 `@jubo.health` Google 帳號，擋路人甲灌留言 / 亂 resolve。
- **更新**：作者本人可改全部欄位；其他同事只能改協作型白名單欄位 `resolved` / `resolvedBy` / `resolvedByUid` / `resolvedAt` / `reactions` / `decision` / `decisionNote`（故 reviewer 也能 resolve / 取消解決）。
- **刪除**：僅留言作者本人。
- ⚠ 白名單必須與 `src/index.js` 的 `resolvePayload()`（一次寫 `resolved`+`resolvedBy`/`resolvedByUid`/`resolvedAt`）保持同步。

---

## 開發

```bash
# Clone
git clone https://github.com/mpragnarok/prototype-comments.git
cd prototype-comments

# 用本地 dev server 測試
npx serve .
# → 開 http://localhost:3000/example/index.html
```

本 package 不依賴任何 build tool。全為 ES Modules，可直接在 modern browser 使用。

---

## 部署到 jubo-line-badminton（本地 bundle 模式）

> **不要部署到 `taupe-shortbread-d24e04.netlify.app`！**  
> 正確站點是 `jubo-line-badminton.netlify.app`（site ID: `4e4723bf-2c3d-4e35-a5c6-7dadcd67f4aa`）。

### 1. 修改 src/ 原始碼後，重新 build

```bash
# 從 prototype-comments repo 根目錄執行
python3 build.py
# → 輸出到 ../jubo-line-badminton-check-in-system/docs/design/pc.js

# 驗證語法
node --input-type=module < ../jubo-line-badminton-check-in-system/docs/design/pc.js
# 沒有輸出 = 語法正確
```

### 2. 部署到正確的 Netlify 站

```bash
cd ../jubo-line-badminton-check-in-system
netlify deploy \
  --site=4e4723bf-2c3d-4e35-a5c6-7dadcd67f4aa \
  --dir=docs/design \
  --prod \
  --no-build
```

### 3. Commit & push

```bash
git add docs/design/pc.js
git commit -m "fix: rebuild pc.js — <描述改了什麼>"
git push origin feat/tournament-and-scheduling
```

> **常見錯誤：** `netlify deploy` 若在專案根目錄執行，會因 `netlify.toml` 內 Next.js plugin 觸發 build error。加 `--no-build` 跳過。

---

## License

MIT
