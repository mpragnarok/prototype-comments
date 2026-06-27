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
    remove: id => fb.deleteDoc(ref(id)),
  };
}
