// Client-only encrypted Store Text tool (no server required)

class CloudStoreText {
  constructor() {
    this.currentSite = null; // { name }
    this.isAuthenticated = false;
    this.saveTimeout = null;
    this.init();
  }

  init() {
    this.setupEventListeners();
    this.loadFromURLFragment();
    this.setupAutoSave();
  }

  setupEventListeners() {
    const siteNameInput = document.getElementById('site-name');
    const passwordInput = document.getElementById('password');
    const openSiteBtn = document.getElementById('open-site');
    const createSiteBtn = document.getElementById('create-site');
    const textEditor = document.getElementById('text-editor');
    const exportBtn = document.getElementById('export-btn');
    const importBtn = document.getElementById('import-btn');
    const importFile = document.getElementById('import-file');
    const shareBtn = document.getElementById('share-link-btn');
    const qrBtn = document.getElementById('share-qr-btn');
  const copyLinkBtn = document.getElementById('copy-link-btn');
  const downloadQrBtn = document.getElementById('download-qr-btn');
    const shareOutput = document.getElementById('share-output');

    openSiteBtn?.addEventListener('click', () => this.openSite());
    createSiteBtn?.addEventListener('click', () => this.createSite());

    textEditor?.addEventListener('input', () => this.handleTextChange());
    textEditor?.addEventListener('keydown', (e) => this.handleKeyDown(e));

    exportBtn?.addEventListener('click', () => this.exportText());
    importBtn?.addEventListener('click', () => importFile.click());
    importFile?.addEventListener('change', (e) => this.importText(e));

    shareBtn?.addEventListener('click', () => this.generateShareLink());
    qrBtn?.addEventListener('click', () => this.generateShareQR());
    copyLinkBtn?.addEventListener('click', () => {
      const out = document.getElementById('share-output');
      if (out && out.value) { out.select(); document.execCommand('copy'); this.showSuccess('Link copied to clipboard'); }
      else this.showError('No share link available. Generate one first.');
    });
    downloadQrBtn?.addEventListener('click', () => {
      const qrImg = document.querySelector('#share-qr-img img');
      const a = document.getElementById('share-qr-download');
      if (qrImg && a) {
        a.href = qrImg.src;
        a.click();
        this.showSuccess('QR downloaded');
      } else {
        this.showError('No QR available. Generate QR first.');
      }
    });

    siteNameInput?.addEventListener('keypress', (e) => { if (e.key === 'Enter') passwordInput.focus(); });
    passwordInput?.addEventListener('keypress', (e) => { if (e.key === 'Enter') this.openSite(); });
  }

  // Check URL fragment for an embedded encrypted note (share link)
  loadFromURLFragment() {
    const hash = window.location.hash || '';
    if (hash.startsWith('#data=')) {
      // show instruction to enter site name & password and click Open Site to decrypt
  const encoded = hash.slice(6);
  const decoded = decodeURIComponent(encoded);
  const payloadInput = document.getElementById('shared-data');
  if (payloadInput) payloadInput.value = decoded;
    }
    // Also prefill site name from query param if present
    const params = new URLSearchParams(window.location.search);
    const site = params.get('site');
    if (site) document.getElementById('site-name').value = site;
  }

  async openSite() {
    const siteName = document.getElementById('site-name').value.trim();
    const password = document.getElementById('password').value;
    if (!siteName || !password) { this.showError('Please enter both site name and password'); return; }

    this.showLoading('Opening site...');

    // Try fragment data first (shared link)
    const fragment = (window.location.hash || '').replace(/^#/, '');
    let encrypted = null;
    if (fragment.startsWith('data=')) {
      encrypted = fragment.slice(5);
    }
    // if user pasted a shared-data input, prefer that
    const sharedInput = document.getElementById('shared-data')?.value?.trim();
    if (sharedInput) encrypted = sharedInput;

    // Try localStorage (site-specific)
    if (!encrypted) {
      encrypted = localStorage.getItem('storetext::' + encodeURIComponent(siteName));
    }

    if (!encrypted) {
      this.hideLoading();
      this.showError('No data found for this site. Create new site or paste a shared link.');
      return;
    }

    try {
      // URL fragments may be percent-encoded; decode before decrypting
      try { encrypted = decodeURIComponent(encrypted); } catch (e) { /* ignore decode errors */ }
      const clear = await this.decryptPayload(encrypted, siteName + '::' + password);
      this.currentSite = { name: siteName };
      this.isAuthenticated = true;
      this.showEditor();
      this.loadText(clear);
      this.updateURL(siteName);
      this.showSuccess('Site opened successfully');
    } catch (e) {
      console.error('Decrypt failed', e);
      this.showError('Failed to decrypt. Check site name and password or try a different shared link.');
    } finally {
      this.hideLoading();
    }
  }

  async createSite() {
    const siteName = document.getElementById('site-name').value.trim();
    const password = document.getElementById('password').value;
    if (!siteName || !password) { this.showError('Please enter both site name and password'); return; }
    if (password.length < 4) { this.showError('Password should be at least 4 characters'); return; }

    this.currentSite = { name: siteName };
    this.isAuthenticated = true;
    this.showEditor();
    this.loadText('');
    this.updateURL(siteName);
    this.showSuccess('Local site created — use Share to move it to another device');
    // ensure saved as encrypted local backup
    await this.saveText();
  }

  showEditor() {
    document.getElementById('auth-section')?.classList.add('hidden');
    document.getElementById('editor-section')?.classList.remove('hidden');
    document.getElementById('current-site-name').textContent = this.currentSite.name;
  }

  loadText(content) { const textEditor = document.getElementById('text-editor'); if (textEditor) { textEditor.value = content; this.updateWordCount(); } }

  handleTextChange() {
    if (!this.isAuthenticated) return; this.updateWordCount(); this.showSavingIndicator(); if (this.saveTimeout) clearTimeout(this.saveTimeout); this.saveTimeout = setTimeout(() => this.saveText(), 1200);
  }

  handleKeyDown(e) {
    if (e.ctrlKey && e.key === 's') { e.preventDefault(); this.saveText(); }
    if (e.key === 'Tab') { e.preventDefault(); const start = e.target.selectionStart; const end = e.target.selectionEnd; e.target.value = e.target.value.substring(0, start) + '\t' + e.target.value.substring(end); e.target.selectionStart = e.target.selectionEnd = start + 1; }
  }

  async saveText() {
    if (!this.isAuthenticated) return; const content = document.getElementById('text-editor').value; const siteName = this.currentSite.name; const password = document.getElementById('password').value; try { const encrypted = await this.encryptPayload(content, siteName + '::' + password); localStorage.setItem('storetext::' + encodeURIComponent(siteName), encrypted); this.hideSavingIndicator(); this.showSavedIndicator(); } catch (e) { console.error('Save failed', e); this.showError('Failed to save locally'); } }

  setupAutoSave() { setInterval(() => { if (this.isAuthenticated) this.saveText(); }, 30000); window.addEventListener('beforeunload', () => { if (this.isAuthenticated) this.saveText(); }); }

  updateWordCount() { const text = document.getElementById('text-editor')?.value || ''; const wordCount = text.trim() ? text.trim().split(/\s+/).length : 0; const charCount = text.length; document.getElementById('word-count').textContent = `${wordCount} words, ${charCount} characters`; }

  showSavingIndicator() { const indicator = document.getElementById('saving-indicator'); if (indicator) { indicator.textContent = 'Saving...'; indicator.className = 'text-yellow-500'; } }
  hideSavingIndicator() { const indicator = document.getElementById('saving-indicator'); if (indicator) indicator.textContent = ''; }
  showSavedIndicator() { const indicator = document.getElementById('saving-indicator'); if (indicator) { indicator.textContent = 'Saved'; indicator.className = 'text-green-500'; setTimeout(() => this.hideSavingIndicator(), 1500); } }
  updateURL(siteName) { const newURL = `${window.location.pathname}?site=${encodeURIComponent(siteName)}`; window.history.replaceState({}, '', newURL); }

  exportText() { const content = document.getElementById('text-editor')?.value || ''; const siteName = this.currentSite?.name || 'note'; const blob = new Blob([content], { type: 'text/plain' }); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = `${siteName}-export.txt`; a.click(); URL.revokeObjectURL(url); this.showSuccess('Text exported successfully!'); }

  importText(event) { const file = event.target.files[0]; if (!file) return; const reader = new FileReader(); reader.onload = (e) => { const content = e.target.result; document.getElementById('text-editor').value = content; this.handleTextChange(); this.showSuccess('Text imported successfully!'); }; reader.readAsText(file); }

  // Share link / QR helpers - generate encrypted blob and present a copyable link or QR
  async generateShareLink() {
    if (!this.isAuthenticated) { this.showError('Open or create a site first'); return; }
    const content = document.getElementById('text-editor')?.value || '';
    const siteName = this.currentSite.name;
    const password = document.getElementById('password').value;
    const encrypted = await this.encryptPayload(content, siteName + '::' + password);
    const base = encodeURIComponent(encrypted);
    const href = `${window.location.origin}${window.location.pathname}?site=${encodeURIComponent(siteName)}#data=${base}`;
    const out = document.getElementById('share-output');
    if (out) { out.value = href; out.select(); document.execCommand('copy'); this.showSuccess('Share link copied to clipboard'); }
  }

  async generateShareQR() {
    const out = document.getElementById('share-output');
    let href = out?.value;
    if (!href) { await this.generateShareLink(); href = document.getElementById('share-output')?.value; }
    if (!href) { this.showError('No share link available'); return; }
    // generate QR using simple canvas + QRious if available
    if (window.QRious) {
      const qrEl = document.getElementById('share-qr-img');
      qrEl.innerHTML = '';
      const qr = new QRious({ value: href, size: 240 });
      const img = document.createElement('img');
      img.src = qr.toDataURL();
      qrEl.appendChild(img);
    } else {
      // fallback: show link only
      this.showSuccess('QR library not available - link ready to copy');
    }
  }

  // Crypto: AES-GCM with PBKDF2 key derivation; payload format: base64(salt(16) + iv(12) + ciphertext)
  async encryptPayload(plainText, password) {
    const enc = new TextEncoder();
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const key = await this.deriveKey(password, salt);
    const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(plainText));
    const combined = this.concatArrays(salt, iv, new Uint8Array(ct));
    return this.bufToBase64(combined);
  }

  async decryptPayload(b64payload, password) {
    const bytes = this.base64ToBuf(b64payload);
    const salt = bytes.slice(0,16);
    const iv = bytes.slice(16,28);
    const ct = bytes.slice(28);
    const key = await this.deriveKey(password, salt);
    const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ct);
    return new TextDecoder().decode(plain);
  }

  async deriveKey(password, salt) {
    const enc = new TextEncoder();
  const baseKey = await crypto.subtle.importKey('raw', enc.encode(password), { name: 'PBKDF2' }, false, ['deriveKey']);
  // Lower iterations to improve responsiveness on low-end devices while maintaining reasonable security for client-only notes
  const ITERATIONS = 50000;
  return crypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations: ITERATIONS, hash: 'SHA-256' }, baseKey, { name: 'AES-GCM', length: 256 }, false, ['encrypt','decrypt']);
  }

  concatArrays(...args) { let total = 0; args.forEach(a => total += a.length); const out = new Uint8Array(total); let offset = 0; args.forEach(a => { out.set(a, offset); offset += a.length; }); return out; }
  bufToBase64(buf) { let binary = ''; const bytes = new Uint8Array(buf); const len = bytes.byteLength; for (let i=0;i<len;i++) binary += String.fromCharCode(bytes[i]); return btoa(binary); }
  base64ToBuf(b64) { const binary = atob(b64); const len = binary.length; const bytes = new Uint8Array(len); for (let i=0;i<len;i++) bytes[i] = binary.charCodeAt(i); return bytes; }

  showLoading(message) { const loadingDiv = document.getElementById('loading'); if (!loadingDiv) return; loadingDiv.innerHTML = `<div class="text-center"><i class="fas fa-spinner fa-spin text-2xl mb-2"></i><p>${message}</p></div>`; loadingDiv.classList.remove('hidden'); }
  hideLoading() { document.getElementById('loading')?.classList.add('hidden'); }
  showError(message) { this.showNotification(message, 'error'); }
  showSuccess(message) { this.showNotification(message, 'success'); }
  showNotification(message, type) { const notification = document.createElement('div'); notification.className = `fixed top-4 right-4 p-4 rounded-lg z-50 ${ type === 'error' ? 'bg-red-500' : 'bg-green-500' } text-white shadow-lg`; notification.innerHTML = `<div class="flex items-center"><i class="fas ${type === 'error' ? 'fa-exclamation-circle' : 'fa-check-circle'} mr-2"></i><span>${message}</span></div>`; document.body.appendChild(notification); setTimeout(() => notification.remove(), 4000); }
}

// Initialize the app
document.addEventListener('DOMContentLoaded', () => { new CloudStoreText(); });
