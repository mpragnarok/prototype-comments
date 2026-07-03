export function createStore(fb, db, projectId) {
  const col = () => fb.collection(db, 'prototype-comments', projectId, 'comments');
  const ref = id => fb.doc(db, 'prototype-comments', projectId, 'comments', id);

  return {
    query:     (...constraints) => fb.query(col(), ...constraints),
    subscribe: (q, onChange, onErr) => fb.onSnapshot(
      q,
      snap => onChange(snap.docs.map(d => ({ id: d.id, ...d.data() }))),
      onErr
    ),
    save:   data => fb.addDoc(col(), { ...data, createdAt: fb.serverTimestamp() }),
    update: (id, data) => fb.updateDoc(ref(id), data),
    remove: id => fb.deleteDoc(ref(id)),
  };
}

// 團隊模式：向量繪圖物件的 Firestore store（draw-tooling plan §4.6）。
// 與 comments 同 `projectId`，存在子集合 `prototype-comments/{projectId}/drawings`。
// 與 createStore 的差異：
//   - 用 setDoc 以「繪圖物件自己的 id」當 Firestore doc id → de-dupe / update / remove 全靠同一把 id，
//     teammate 同步與本地 echo 都好對齊（不會因 auto-id 產生重複）。
//   - **只存向量 strokes JSON**：呼叫端（draw-layer）負責用 drawingToDoc() 剝掉 imageRef/PNG dataURL，
//     PNG 永不進 Firestore（需要時前端從向量即時重畫）。
export function createDrawingStore(fb, db, projectId) {
  const col = () => fb.collection(db, 'prototype-comments', projectId, 'drawings');
  const ref = id => fb.doc(db, 'prototype-comments', projectId, 'drawings', id);

  return {
    query:     (...constraints) => fb.query(col(), ...constraints),
    // comments 的 subscribe 收外部 query；drawings 直接訂閱整個集合（呼叫端只要 onChange/onErr）。
    subscribe: (onChange, onErr) => fb.onSnapshot(
      fb.query(col()),
      snap => onChange(snap.docs.map(d => ({ id: d.id, ...d.data() }))),
      onErr
    ),
    // drawObj 須已是向量精簡 doc（drawingToDoc 產物）；setDoc by id → upsert。
    save:   drawObj => fb.setDoc(ref(drawObj.id), { ...drawObj, updatedAt: fb.serverTimestamp() }),
    update: (id, patch) => fb.updateDoc(ref(id), { ...patch, updatedAt: fb.serverTimestamp() }),
    // 軟刪除（墓碑）：不真的刪 doc，改寫 {deleted:true, deletedAt}，讓其他 client 的舊快照
    // 回寫無法復活已刪項（render/合併時墓碑優先）。setDoc by id → upsert（doc 不存在也安全）。
    // deletedAt 用 client 端 Date.now()（非 serverTimestamp）→ 跨 client 可直接比較新舊、且可即時讀。
    tombstone: id => fb.setDoc(ref(id), { id, deleted: true, deletedAt: Date.now(), updatedAt: fb.serverTimestamp() }),
    // 硬刪除：真正移除 doc。保留給維護腳本 / compact（清理過期墓碑）用，日常刪除走 tombstone。
    remove: id => fb.deleteDoc(ref(id)),
  };
}
