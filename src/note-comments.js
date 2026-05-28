export function createNoteModule({
  store, getCurrentUser, getScreenId, engNoteSelector, getComments, noteKey, el, timeAgo,
  buildCommentItem,
}) {

  function getNoteComments(tag, text) {
    const key = noteKey(tag, text);
    return getComments().filter(c => c.type === 'note' && c.noteKey === key);
  }

  function renderNoteThread(threadEl, tag, text) {
    threadEl.innerHTML = '';
    const nc = getNoteComments(tag, text);
    const refresh = () => renderNoteThread(threadEl, tag, text);

    nc.forEach(c => {
      const user = getCurrentUser();
      threadEl.appendChild(buildCommentItem(c, true, {
        onResolve: resolved => store.update(c.id, { resolved }),
        onDelete:  ()       => store.remove(c.id),
        onEdit:    body     => store.update(c.id, { body, edited: true }),
        onUpdated: refresh,
      }));
    });

    const user = getCurrentUser();
    if (user) {
      const wrap = el('div', 'pc-note-input-wrap');
      const ta = el('textarea', 'pc-note-textarea', { placeholder: '留言…' });
      const btn = el('button', 'pc-note-submit', { disabled: '' });
      btn.textContent = '送出';
      ta.addEventListener('input', () => { btn.disabled = !ta.value.trim(); });
      btn.onclick = async () => {
        const body = ta.value.trim();
        if (!body) return;
        btn.disabled = true;
        await store.save({
          type:        'note',
          screenId:    getScreenId(),
          noteKey:     noteKey(tag, text),
          noteTag:     tag,
          noteText:    text,
          body,
          authorUid:   user.uid,
          authorName:  user.displayName || user.email,
          authorPhoto: user.photoURL || '',
          resolved:    false,
        });
        ta.value = '';
        btn.disabled = true;
      };
      wrap.appendChild(ta);
      wrap.appendChild(btn);
      threadEl.appendChild(wrap);
    } else {
      const hint = el('p', 'pc-ci-time');
      hint.textContent = '請先登入才能留言';
      hint.style.padding = '4px 0';
      threadEl.appendChild(hint);
    }
  }

  function injectNoteUI(rowEl, tag, text) {
    if (rowEl.dataset.pcInjected) return;
    rowEl.dataset.pcInjected = '1';

    const btn = el('button', 'pc-note-comment-btn');
    btn.innerHTML = '💬 留言';
    rowEl.appendChild(btn);

    const badge = el('span', 'pc-note-badge');
    badge.style.display = 'none';
    rowEl.appendChild(badge);

    const thread = el('div', 'pc-note-thread');
    rowEl.after(thread);

    function updateBadge() {
      const nc = getNoteComments(tag, text);
      if (nc.length > 0) {
        badge.textContent = `💬 ${nc.length}`;
        badge.style.display = 'inline-flex';
      } else {
        badge.style.display = 'none';
      }
    }

    function toggleThread() {
      const open = thread.classList.toggle('open');
      if (open) renderNoteThread(thread, tag, text);
    }

    btn.onclick   = toggleThread;
    badge.onclick = toggleThread;

    rowEl.dataset.pcTag  = tag;
    rowEl.dataset.pcText = text;

    updateBadge();
    return { updateBadge };
  }

  function injectAll() {
    document.querySelectorAll(engNoteSelector).forEach(row => {
      const tag  = row.dataset.tag  || row.querySelector('[data-tag]')?.dataset.tag
                || row.querySelector('.snc-tag, .tag')?.textContent?.trim() || '';
      const text = row.dataset.text || row.querySelector('.note-text, p, span:not(.snc-tag):not(.tag)')?.textContent?.trim() || '';
      if (tag || text) injectNoteUI(row, tag, text);
    });

    document.querySelectorAll('.dev-note-v2').forEach(row => {
      const tag  = row.dataset.tag  || row.querySelector('[data-tag]')?.dataset.tag
                || row.querySelector('.snc-tag, .tag')?.textContent?.trim() || '';
      const text = row.dataset.text || row.querySelector('p, .note-body')?.textContent?.trim() || '';
      if (tag || text) injectNoteUI(row, tag, text);
    });
  }

  function refresh() {
    document.querySelectorAll('[data-pc-injected]').forEach(row => {
      const tag  = row.dataset.pcTag  || '';
      const text = row.dataset.pcText || '';
      const nc   = getNoteComments(tag, text);
      const badge = row.querySelector('.pc-note-badge');
      if (badge) {
        if (nc.length > 0) {
          badge.textContent = `💬 ${nc.length}`;
          badge.style.display = 'inline-flex';
        } else {
          badge.style.display = 'none';
        }
      }
      const thread = row.nextElementSibling;
      if (thread?.classList.contains('open')) {
        renderNoteThread(thread, tag, text);
      }
    });
  }

  return { injectAll, refresh };
}
