/**
 * Simple Store Text Tool - Client-side only
 * No API calls, local storage only
 */

class SimpleStoreText {
    constructor() {
        this.currentNote = '';
        this.notes = [];
        this.init();
    }

    init() {
        this.loadNotes();
        this.setupEventListeners();
        this.hideLoading();
    }

    setupEventListeners() {
        // Auto-save on typing
        const textArea = document.getElementById('main-text');
        if (textArea) {
            textArea.addEventListener('input', () => {
                this.currentNote = textArea.value;
                this.autoSave();
            });
        }

        // Save button
        const saveBtn = document.getElementById('save-note');
        if (saveBtn) {
            saveBtn.addEventListener('click', () => this.saveNote());
        }

        // Load button
        const loadBtn = document.getElementById('load-note');
        if (loadBtn) {
            loadBtn.addEventListener('click', () => this.showLoadDialog());
        }

        // Clear button
        const clearBtn = document.getElementById('clear-text');
        if (clearBtn) {
            clearBtn.addEventListener('click', () => this.clearText());
        }

        // Download button
        const downloadBtn = document.getElementById('download-text');
        if (downloadBtn) {
            downloadBtn.addEventListener('click', () => this.downloadText());
        }
    }

    showLoading(message = 'Loading...') {
        const loader = document.getElementById('loading-overlay');
        if (loader) {
            loader.innerHTML = `
                <div class="bg-white rounded-lg p-6 shadow-lg">
                    <div class="flex items-center space-x-3">
                        <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                        <span class="text-gray-700">${message}</span>
                    </div>
                </div>
            `;
            loader.classList.remove('hidden');
        }
    }

    hideLoading() {
        const loader = document.getElementById('loading-overlay');
        if (loader) {
            loader.classList.add('hidden');
        }
    }

    autoSave() {
        // Auto-save to localStorage every 2 seconds
        clearTimeout(this.autoSaveTimeout);
        this.autoSaveTimeout = setTimeout(() => {
            this.saveToLocalStorage('auto-save', this.currentNote);
            this.showStatus('Auto-saved', 'success');
        }, 2000);
    }

    saveNote() {
        const title = prompt('Enter a title for your note:');
        if (title && this.currentNote.trim()) {
            this.saveToLocalStorage(title, this.currentNote);
            this.loadNotes();
            this.showStatus('Note saved successfully!', 'success');
        }
    }

    saveToLocalStorage(key, content) {
        try {
            const notes = JSON.parse(localStorage.getItem('storetext-notes') || '{}');
            notes[key] = {
                content: content,
                timestamp: new Date().toISOString()
            };
            localStorage.setItem('storetext-notes', JSON.stringify(notes));
        } catch (e) {
            console.error('Failed to save to localStorage:', e);
            this.showStatus('Failed to save note', 'error');
        }
    }

    loadNotes() {
        try {
            const notes = JSON.parse(localStorage.getItem('storetext-notes') || '{}');
            this.notes = Object.keys(notes).map(key => ({
                title: key,
                content: notes[key].content,
                timestamp: notes[key].timestamp
            }));
        } catch (e) {
            console.error('Failed to load notes:', e);
            this.notes = [];
        }
    }

    showLoadDialog() {
        this.loadNotes();
        
        if (this.notes.length === 0) {
            this.showStatus('No saved notes found', 'info');
            return;
        }

        const notesList = this.notes.map((note, index) => 
            `<div class="border-b p-3 cursor-pointer hover:bg-gray-50" onclick="storeText.loadNote(${index})">
                <div class="font-semibold">${note.title}</div>
                <div class="text-sm text-gray-500">${new Date(note.timestamp).toLocaleString()}</div>
                <div class="text-sm text-gray-600 truncate">${note.content.substring(0, 100)}...</div>
            </div>`
        ).join('');

        const dialog = document.createElement('div');
        dialog.className = 'fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4';
        dialog.innerHTML = `
            <div class="bg-white rounded-lg max-w-md w-full max-h-96 overflow-hidden">
                <div class="p-4 border-b flex justify-between items-center">
                    <h3 class="font-semibold">Load Note</h3>
                    <button onclick="this.parentElement.parentElement.parentElement.remove()" class="text-gray-500 hover:text-gray-700">×</button>
                </div>
                <div class="overflow-y-auto max-h-64">
                    ${notesList}
                </div>
            </div>
        `;
        document.body.appendChild(dialog);
    }

    loadNote(index) {
        if (this.notes[index]) {
            const textArea = document.getElementById('main-text');
            if (textArea) {
                textArea.value = this.notes[index].content;
                this.currentNote = this.notes[index].content;
                this.showStatus(`Loaded: ${this.notes[index].title}`, 'success');
            }
        }
        // Close dialog
        document.querySelectorAll('.fixed.inset-0').forEach(dialog => dialog.remove());
    }

    clearText() {
        if (confirm('Are you sure you want to clear all text?')) {
            const textArea = document.getElementById('main-text');
            if (textArea) {
                textArea.value = '';
                this.currentNote = '';
                this.showStatus('Text cleared', 'info');
            }
        }
    }

    downloadText() {
        if (!this.currentNote.trim()) {
            this.showStatus('No text to download', 'error');
            return;
        }

        const blob = new Blob([this.currentNote], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `note-${new Date().toISOString().split('T')[0]}.txt`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        this.showStatus('Text downloaded', 'success');
    }

    showStatus(message, type = 'info') {
        const statusEl = document.getElementById('status-message');
        if (statusEl) {
            statusEl.textContent = message;
            statusEl.className = `mt-2 text-sm ${type === 'success' ? 'text-green-600' : type === 'error' ? 'text-red-600' : 'text-blue-600'}`;
            setTimeout(() => {
                statusEl.textContent = '';
            }, 3000);
        }
    }
}

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.storeText = new SimpleStoreText();
});
