/** Boîte de saisie modale (remplace window.prompt, compatible Electron). */
import { showModal, hideModal } from './modal-ui.js';

/** @type {((value: string | null) => void) | null} */
let pendingResolve = null;

function getModal() {
    return document.getElementById('value-prompt-modal');
}

/**
 * @param {string} message
 * @param {string} [defaultValue]
 * @returns {Promise<string | null>}
 */
export function showValuePrompt(message, defaultValue = '') {
    return new Promise((resolve) => {
        const modal = getModal();
        const input = document.getElementById('value-prompt-input');
        const label = document.getElementById('value-prompt-message');
        if (!modal || !input || !label) {
            resolve(typeof window.prompt === 'function' ? window.prompt(message, defaultValue) : null);
            return;
        }
        if (pendingResolve) pendingResolve(null);
        pendingResolve = resolve;
        label.textContent = message;
        input.value = defaultValue ?? '';
        showModal(modal);
        input.focus();
        input.select();
    });
}

export function initValuePrompt() {
    const modal = getModal();
    const input = document.getElementById('value-prompt-input');
    const okBtn = document.getElementById('value-prompt-ok');
    const cancelBtn = document.getElementById('value-prompt-cancel');
    const closeBtn = document.getElementById('close-value-prompt');

    function finish(value) {
        if (!pendingResolve) return;
        const resolve = pendingResolve;
        pendingResolve = null;
        hideModal(modal);
        resolve(value);
    }

    okBtn?.addEventListener('click', () => finish(input?.value ?? null));
    cancelBtn?.addEventListener('click', () => finish(null));
    closeBtn?.addEventListener('click', () => finish(null));
    input?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            finish(input.value);
        }
        if (e.key === 'Escape') {
            e.preventDefault();
            finish(null);
        }
    });
    modal?.addEventListener('click', (e) => {
        if (e.target === modal) finish(null);
    });
}
