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

> ⚠️ **不要把 `firebaseConfig` 提交到公開 repo。** 使用環境變數或 gitignore 的設定檔管理。

### 3. 在 HTML prototype 引入

```html
<script type="module">
  import { initPrototypeComments } from
    'https://cdn.jsdelivr.net/gh/mpragnarok/prototype-comments@main/src/index.js';

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

**② `switchMode()` 暴露 mode 到 window**

```js
function switchMode(mode) {
  window.currentMode = mode;   // ← 必須暴露到 window
  // ... 你的原有邏輯 ...
}
```

**③ dev note 元素加 data attributes（供 note comment key 使用）**

```html
<!-- 設計模式 info panel -->
<div class="dev-note-v2" data-tag="API" data-text="此 API 尚未確認">...</div>

<!-- 工程模式 -->
<div class="eng-note-row" data-tag="API" data-text="此 API 尚未確認">...</div>
```

### 5. 設定 Firestore Rules

在 `firestore.rules` 加上：

```
match /prototype-comments/{projectId}/comments/{commentId} {
  allow read: if true;
  allow create: if request.auth != null;
  allow update: if request.auth != null &&
    (request.auth.uid == resource.data.authorUid ||
     request.resource.data.diff(resource.data).affectedKeys().hasOnly(['resolved']));
  allow delete: if request.auth != null &&
    request.auth.uid == resource.data.authorUid;
}
```

然後 deploy：

```bash
firebase deploy --only firestore:rules
```

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
  resolved:    false,
  createdAt:   serverTimestamp(),
}
```

---

## Security

- **Firebase config 不含任何 secret**。`apiKey` 是 public identifier，Firestore Rules 控制讀寫權限。
- 只有登入使用者可以建立留言（`allow create: if request.auth != null`）
- 只有作者可以刪除自己的留言
- `resolved` 欄位任何登入使用者都可以更新（design review 中 reviewer 也可以 resolve）

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

## License

MIT
