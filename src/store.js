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
