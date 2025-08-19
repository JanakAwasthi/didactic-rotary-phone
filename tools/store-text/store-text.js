/*
  store-text-pro.js
  Enhances the Store Text page with:
  - notes list (localStorage)
  - auto-save and status indicators
  - encryption / decryption using CryptoJS.AES
  - export/import encrypted files
  - share encrypted links (URL fragment)
  - on-load detection of shared encrypted payload
*/

/* Constants */
const STORAGE_KEY = 'linktoqr_storetext_notes_v1';
const ENC_PREFIX = 'ENCv1:'; // marker to identify encrypted content in the editor
const AUTO_SAVE_DELAY = 1200; // ms

/* Elements */
const mainEditor = document.getElementById('main-editor');
const noteTitleEl = document.getElementById('note-title');
const notesListEl = document.getElementById('notes-list');
const saveIndicator = document.getElementById('save-indicator');
const saveStatus = document.getElementById('save-status');
const charCountEl = document.getElementById('char-count');
const wordCountEl = document.getElementById('word-count');
const lineCountEl = document.getElementById('line-count');

const btnNew = document.getElementById('new-note');
const btnSave = document.getElementById('save-note');
const btnLoad = document.getElementById('load-note');
const btnExport = document.getElementById('export-note');
const btnShare = document.getElementById('share-note');
const btnEncrypt = document.getElementById('encrypt-note');
const btnDecrypt = document.getElementById('decrypt-note');
const btnClear = document.getElementById('clear-note');
const btnExportEnc = document.getElementById('export-encrypted');
const btnImportEnc = document.getElementById('import-encrypted');

/* State */
let notes = []; // {id, title, content, updatedAt, encrypted:bool}
let currentNoteId = null;
let autoSaveTimer = null;
let isDirty = false;

/* Utilities */
function uid() {
  return 'n_' + Math.random().toString(36).slice(2, 10);
}

function nowISO() {
  return new Date().toISOString();
}

function showToast(message, type = 'success', timeout = 3000) {
  const t = document.createElement('div');
  t.className = 'toast show' + (type === 'error' ? ' error' : type === 'warning' ? ' warning' : '');
  t.innerText = message;
  document.body.appendChild(t);
  setTimeout(() => t.classList.remove('show'), timeout - 200);
  setTimeout(() => t.remove(), timeout);
}

/* Modal helpers */
function showModal({title = '', html = '', buttons = []}) {
  const root = document.getElementById('modal-root');
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  const modal = document.createElement('div');
  modal.className = 'modal';
  if (title) {
    const h = document.createElement('h3');
    h.className = 'text-xl font-bold mb-2';
    h.innerText = title;
    modal.appendChild(h);
  }
  if (html) {
    const container = document.createElement('div');
    container.innerHTML = html;
    modal.appendChild(container);
  }
  const btnRow = document.createElement('div');
  btnRow.className = 'mt-4 flex justify-end gap-2';
  buttons.forEach(b => {
    const btn = document.createElement('button');
    btn.className = b.className || 'btn-ghost';
    btn.innerText = b.label;
    btn.onclick = () => {
      if (b.onClick) b.onClick({close: () => overlay.remove()});
    };
    btnRow.appendChild(btn);
  });
  modal.appendChild(btnRow);
  overlay.appendChild(modal);
  root.appendChild(overlay);
  return overlay;
}

function promptPassword(message, placeholder = 'Enter password', cb) {
  const id = 'pw_' + Math.random().toString(36).slice(2,6);
  const html = `
    <p class="muted mb-2">${message}</p>
    <input id="${id}" type="password" class="w-full p-2 border rounded" placeholder="${placeholder}" />
  `;
  const overlay = showModal({
    title: 'Password required',
    html,
    buttons: [
      {label: 'Cancel', className: 'btn-ghost', onClick: ({close}) => close()},
      {label: 'OK', className: 'btn-primary', onClick: ({close}) => {
        const val = document.getElementById(id).value;
        close();
        cb(val);
      }}
    ]
  });
  // focus
  setTimeout(() => {
    const el = document.getElementById(id);
    if (el) el.focus();
  }, 50);
}

function promptText(message, placeholder = '', cb) {
  const id = 'txt_' + Math.random().toString(36).slice(2,6);
  const html = `
    <p class="muted mb-2">${message}</p>
    <textarea id="${id}" rows="6" class="w-full p-2 border rounded" placeholder="${placeholder}"></textarea>
  `;
  const overlay = showModal({
    title: 'Paste encrypted text',
    html,
    buttons: [
      {label: 'Cancel', className: 'btn-ghost', onClick: ({close}) => close()},
      {label: 'Paste & Decrypt', className: 'btn-primary', onClick: ({close}) => {
        const val = document.getElementById(id).value;
        close();
        cb(val);
      }}
    ]
  });
  setTimeout(() => {
    const el = document.getElementById(id);
    if (el) el.focus();
  }, 50);
}

/* Storage functions */
function loadFromStorage() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    notes = raw ? JSON.parse(raw) : [];
  } catch (e) {
    notes = [];
    console.error('Failed to load notes', e);
  }
}

function saveToStorage() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(notes));
  } catch (e) {
    console.error('Failed to save notes', e);
  }
}

/* Rendering */
function renderNotesList() {
  notesListEl.innerHTML = '';
  if (!notes.length) {
    notesListEl.innerHTML = '<p class="muted">No notes yet. Click New to create one.</p>';
    return;
  }
  notes.slice().reverse().forEach(note => {
    const el = document.createElement('div');
    el.className = 'note-card';
    if (note.id === currentNoteId) el.classList.add('active');
    const title = note.title || '(untitled)';
    const time = new Date(note.updatedAt).toLocaleString();
    const encMark = note.encrypted ? ' <i class="fas fa-lock" title="Encrypted"></i>' : '';
    el.innerHTML = `<div class="flex justify-between items-center">
                      <div><strong>${escapeHtml(title)}</strong>${encMark}<div class="muted text-xs">${time}</div></div>
                      <div>
                        <button data-id="${note.id}" class="btn-ghost open-btn">Open</button>
                      </div>
                    </div>`;
    notesListEl.appendChild(el);
  });

  // attach open handlers
  notesListEl.querySelectorAll('.open-btn').forEach(b => {
    b.addEventListener('click', e => {
      const id = e.currentTarget.getAttribute('data-id');
      openNoteById(id);
    });
  });
}

function escapeHtml(s = '') {
  return (''+s).replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
}

/* Note ops */
function newNote() {
  const id = uid();
  const note = { id, title: 'Untitled', content: '', updatedAt: nowISO(), encrypted: false };
  notes.push(note);
  currentNoteId = id;
  saveToStorage();
  renderNotesList();
  loadNoteIntoEditor(note);
  showToast('New note created');
}

function openNoteById(id) {
  const note = notes.find(n => n.id === id);
  if (!note) return;
  currentNoteId = id;
  renderNotesList();
  // if encrypted, ask for password to decrypt before loading
  if (note.encrypted && note.content && note.content.startsWith(ENC_PREFIX)) {
    promptPassword('This note is encrypted. Enter the password to decrypt it on this device.', 'Password', pw => {
      if (!pw) { showToast('Decryption cancelled', 'warning'); return; }
      try {
        const decrypted = tryDecryptContent(note.content, pw);
        if (decrypted == null) {
          showToast('Incorrect password or corrupted data', 'error');
          return;
        }
        loadNoteIntoEditor({...note, content: decrypted});
        showToast('Note decrypted and loaded');
      } catch (e) {
        console.error(e);
        showToast('Decryption failed', 'error');
      }
    });
  } else {
    loadNoteIntoEditor(note);
  }
}

function saveCurrentNote() {
  if (!currentNoteId) {
    // create a new note if none
    newNote();
    return;
  }
  const note = notes.find(n => n.id === currentNoteId);
  if (!note) return;
  note.title = noteTitleEl.value || 'Untitled';
  note.content = mainEditor.value;
  note.updatedAt = nowISO();
  // mark encrypted flag based on content prefix
  note.encrypted = !!(note.content && note.content.startsWith(ENC_PREFIX));
  saveToStorage();
  isDirty = false;
  updateSaveIndicator('saved');
  renderNotesList();
  showToast('Saved');
}

/* Auto-save + UI state */
function scheduleAutoSave() {
  updateSaveIndicator('saving');
  isDirty = true;
  if (autoSaveTimer) clearTimeout(autoSaveTimer);
  autoSaveTimer = setTimeout(() => {
    saveCurrentNote();
  }, AUTO_SAVE_DELAY);
}

function updateSaveIndicator(state) {
  saveIndicator.className = 'save-indicator ' + (state === 'saved' ? 'saved' : state === 'saving' ? 'saving' : 'unsaved');
  if (state === 'saved') saveStatus.textContent = 'All changes saved';
  else if (state === 'saving') saveStatus.textContent = 'Saving...';
  else saveStatus.textContent = 'Unsaved changes';
}

/* Counts */
function updateCounts() {
  const txt = mainEditor.value || '';
  charCountEl.textContent = txt.length;
  wordCountEl.textContent = txt.trim() ? txt.trim().split(/\s+/).length : 0;
  lineCountEl.textContent = txt.split(/\n/).length || 1;
}

/* Editor load */
function loadNoteIntoEditor(note) {
  noteTitleEl.value = note.title || '';
  mainEditor.value = note.content || '';
  updateCounts();
  isDirty = false;
  updateSaveIndicator('saved');
}

/* Encryption helpers */
function encryptContent(plain, password) {
  const cipher = CryptoJS.AES.encrypt(plain, password).toString();
  return ENC_PREFIX + cipher;
}

function tryDecryptContent(encryptedWithPrefix, password) {
  if (!encryptedWithPrefix || !encryptedWithPrefix.startsWith(ENC_PREFIX)) return null;
  try {
    const cipher = encryptedWithPrefix.slice(ENC_PREFIX.length);
    const bytes = CryptoJS.AES.decrypt(cipher, password);
    const str = bytes.toString(CryptoJS.enc.Utf8);
    if (!str) return null;
    return str;
  } catch (e) {
    return null;
  }
}

/* Toolbar actions */
btnNew.addEventListener('click', () => newNote());
btnSave.addEventListener('click', () => saveCurrentNote());
btnLoad.addEventListener('click', () => {
  // show list modal
  if (!notes.length) {
    showToast('No saved notes', 'warning');
    return;
  }
  const itemsHtml = notes.slice().reverse().map(n => {
    const t = escapeHtml(n.title || '(untitled)');
    const enc = n.encrypted ? ' <i class="fas fa-lock muted" title="Encrypted"></i>' : '';
    return `<div class="p-2 border-b"><strong>${t}</strong> ${enc}<div class="muted text-xs">${new Date(n.updatedAt).toLocaleString()}</div>
            <div class="mt-2"><button data-id="${n.id}" class="btn-primary open-load">Open</button></div></div>`;
  }).join('');
  const overlay = showModal({
    title: 'Load note',
    html: itemsHtml,
    buttons: [{label:'Close', className: 'btn-ghost', onClick: ({close}) => close()}]
  });
  // attach open handlers after small delay
  setTimeout(() => {
    overlay.querySelectorAll('.open-load').forEach(b => {
      b.addEventListener('click', e => {
        const id = e.currentTarget.getAttribute('data-id');
        overlay.remove();
        openNoteById(id);
      });
    });
  }, 50);
});

btnExport.addEventListener('click', () => {
  const title = (noteTitleEl.value || 'untitled').replace(/[^a-z0-9_\-]/gi, '_');
  const content = mainEditor.value || '';
  const blob = new Blob([content], {type: 'text/plain;charset=utf-8'});
  const fname = `${title}.txt`;
  downloadBlob(blob, fname);
  showToast('Exported file');
});

btnExportEnc.addEventListener('click', () => {
  const content = mainEditor.value || '';
  if (!content) { showToast('No content to export', 'warning'); return; }
  promptPassword('Pick a strong password to encrypt this note before exporting. You will need the same password to decrypt it on another device.', 'Encryption password', pw => {
    if (!pw) { showToast('Export cancelled', 'warning'); return; }
    const encrypted = encryptContent(content, pw);
    const blob = new Blob([encrypted], {type: 'text/plain;charset=utf-8'});
    const fname = `${(noteTitleEl.value || 'exported').replace(/[^a-z0-9_\-]/gi, '_')}.locked.txt`;
    downloadBlob(blob, fname);
    showToast('Encrypted export ready. Save the file and keep your password safe.');
  });
});

btnImportEnc.addEventListener('click', () => {
  // paste encrypted text then prompt for password
  promptText('Paste the encrypted content you received (file content or encrypted string starting with ENCv1:).', 'ENCv1:...', pasted => {
    if (!pasted) { showToast('No content provided', 'warning'); return; }
    promptPassword('Enter password used to encrypt the content', 'Password', pw => {
      if (!pw) { showToast('Import cancelled', 'warning'); return; }
      const decrypted = tryDecryptContent(pasted.trim(), pw);
      if (decrypted == null) {
        showToast('Decryption failed. Wrong password or corrupted data.', 'error'); return;
      }
      mainEditor.value = decrypted;
      noteTitleEl.value = 'Imported note';
      scheduleAutoSave();
      updateCounts();
      showToast('Imported and decrypted note');
    });
  });
});

btnShare.addEventListener('click', () => {
  const content = mainEditor.value || '';
  if (!content) { showToast('Nothing to share', 'warning'); return; }
  promptPassword('Choose a password for the recipient. The note will be encrypted with this password and embedded in a shareable link. The recipient must know the password to decrypt the note.', 'Password', pw => {
    if (!pw) { showToast('Share cancelled', 'warning'); return; }
    const encrypted = encryptContent(content, pw); // ENC_PREFIX + cipher
    const base = location.origin + location.pathname;
    // put encrypted data in fragment so servers don't receive it
    const link = `${base}#shared=${encodeURIComponent(encrypted)}`;
    const html = `<p class="muted mb-2">Copy this link and send it to the other device. The recipient must enter the password to decrypt.</p>
                  <input id="share-link" class="w-full p-2 border rounded" readonly value="${link}"/>`;
    const overlay = showModal({
      title: 'Shareable Encrypted Link',
      html,
      buttons: [
        {label:'Copy link', className:'btn-primary', onClick: ({close}) => {
          const el = document.getElementById('share-link');
          el.select(); document.execCommand('copy');
          close();
          showToast('Link copied to clipboard');
        }},
        {label: 'Close', className: 'btn-ghost', onClick: ({close}) => close()}
      ]
    });
  });
});

btnEncrypt.addEventListener('click', () => {
  const content = mainEditor.value || '';
  if (!content) { showToast('No content to encrypt', 'warning'); return; }
  promptPassword('Enter a password to encrypt the current note. This will replace the text in the editor with an encrypted blob. Save to keep encrypted state.', 'Encryption password', pw => {
    if (!pw) { showToast('Encryption cancelled', 'warning'); return; }
    const encrypted = encryptContent(content, pw);
    mainEditor.value = encrypted;
    scheduleAutoSave();
    updateCounts();
    showToast('Note encrypted in editor. Save to persist encrypted note.');
  });
});

btnDecrypt.addEventListener('click', () => {
  const current = mainEditor.value || '';
  if (!current.startsWith(ENC_PREFIX)) {
    showToast('Editor content is not in encrypted form', 'warning'); return;
  }
  promptPassword('Enter password to decrypt the current editor content', 'Password', pw => {
    if (!pw) { showToast('Decryption cancelled', 'warning'); return; }
    const decrypted = tryDecryptContent(current, pw);
    if (decrypted == null) {
      showToast('Incorrect password or corrupted data', 'error'); return;
    }
    mainEditor.value = decrypted;
    scheduleAutoSave();
    updateCounts();
    showToast('Content decrypted in editor. Save to persist decrypted note.');
  });
});

btnClear.addEventListener('click', () => {
  const overlay = showModal({
    title: 'Clear editor',
    html: '<p class="muted">This will clear the editor content. You can always save a new note afterward. Proceed?</p>',
    buttons: [
      {label:'Cancel', className:'btn-ghost', onClick:({close})=>close()},
      {label:'Clear', className:'btn-primary', onClick:({close}) => { mainEditor.value=''; noteTitleEl.value=''; scheduleAutoSave(); updateCounts(); close(); showToast('Editor cleared'); }}
    ]
  });
});

/* Download helper */
function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/* Editor events */
mainEditor.addEventListener('input', () => {
  updateCounts();
  scheduleAutoSave();
});
noteTitleEl.addEventListener('input', () => {
  scheduleAutoSave();
});

/* Initialize */
function init() {
  loadFromStorage();
  if (notes.length) {
    currentNoteId = notes[notes.length-1].id;
    const note = notes.find(n => n.id === currentNoteId);
    if (note) loadNoteIntoEditor(note);
  } else {
    // create a temporary untitled note in memory (will be saved when user saves)
    currentNoteId = null;
    noteTitleEl.value = '';
    mainEditor.value = '';
  }
  renderNotesList();
  updateCounts();
  updateSaveIndicator('saved');

  // handle shared encrypted payload in fragment (#shared=ENCv1:...)
  handleSharedFragment();
}

/* Shared fragment handling (for transfer to another device) */
function handleSharedFragment() {
  try {
    const hash = location.hash || '';
    if (!hash.includes('shared=')) return;
    const params = new URLSearchParams(hash.replace('#',''));
    const shared = params.get('shared');
    if (!shared) return;
    // show prompt to decrypt and import
    const payload = decodeURIComponent(shared);
    const html = `<p class="muted mb-2">An encrypted note was detected in the link. Enter the password to decrypt and load it into the editor on this device.</p>
                  <div class="muted mb-2">Tip: The encryption marker should start with <code>ENCv1:</code></div>`;
    const overlay = showModal({
      title: 'Encrypted note received',
      html,
      buttons: [
        {label:'Decrypt', className:'btn-primary', onClick: ({close}) => {
          // prompt for password
          const pwId = 'frag_pw_' + Math.random().toString(36).slice(2,6);
          // replace modal content with password field
          overlay.querySelector('.modal').innerHTML = `<h3 class="text-xl font-bold mb-2">Enter password</h3>
            <input id="${pwId}" type="password" class="w-full p-2 border rounded" placeholder="Password" /> 
            <div class="mt-4 flex justify-end gap-2"><button id="frag_cancel" class="btn-ghost">Cancel</button>
            <button id="frag_ok" class="btn-primary">OK</button></div>`;
          document.getElementById('frag_cancel').onclick = () => overlay.remove();
          document.getElementById('frag_ok').onclick = () => {
            const pw = document.getElementById(pwId).value;
            overlay.remove();
            if (!pw) { showToast('No password entered', 'warning'); return; }
            const decrypted = tryDecryptContent(payload, pw);
            if (decrypted == null) {
              showToast('Decryption failed. Wrong password or corrupted data.', 'error'); return;
            }
            mainEditor.value = decrypted;
            noteTitleEl.value = 'Shared note';
            updateCounts();
            scheduleAutoSave();
            showToast('Shared note decrypted and loaded');
            // remove fragment so share link isn't repeatedly processed
            history.replaceState(null, '', location.pathname);
          };
        }},
        {label:'Ignore', className:'btn-ghost', onClick: ({close}) => { close(); history.replaceState(null, '', location.pathname); }}
      ]
    });
  } catch (e) {
    console.error('Error handling shared fragment', e);
  }
}

/* helpers for initial save status */
updateSaveIndicator('saved');

/* Kick off */
init();
