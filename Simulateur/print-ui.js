/** Aperçu et impression — cadre A4 paysage. */
import {
    printFrame,
    setPrintFrameEnabled,
    buildPrintHtml,
    openCartoucheModal,
    closeCartoucheModal,
    saveCartoucheFromForm,
} from './print-frame.js';
import { captureSchematicForPrint, draw } from './renderer.js';
import { showModal, hideModal } from './modal-ui.js';

export function togglePrintFrame() {
    setPrintFrameEnabled(!printFrame.enabled);
    draw();
}

export function openPrintPreview() {
    if (!printFrame.enabled) {
        alert('Activez d’abord le cadre A4 : menu Éditeur → Cadre A4.');
        return;
    }
    const dataUrl = captureSchematicForPrint();
    if (!dataUrl) return;
    const modal = document.getElementById('print-preview-modal');
    const frame = document.getElementById('print-preview-frame');
    if (!modal || !frame) return;
    frame.srcdoc = buildPrintHtml(dataUrl);
    showModal(modal);
}

export function closePrintPreview() {
    const modal = document.getElementById('print-preview-modal');
    const frame = document.getElementById('print-preview-frame');
    hideModal(modal);
    if (frame) frame.removeAttribute('srcdoc');
}

export function printFromPreview() {
    const frame = document.getElementById('print-preview-frame');
    if (!frame?.contentWindow) return;
    const win = frame.contentWindow;
    const doc = win.document;
    if (typeof win.__resetPrintSheet === 'function') win.__resetPrintSheet();
    const style = doc.createElement('style');
    style.textContent = '@page { size: 297mm 210mm; margin: 0; }';
    doc.head.appendChild(style);
    win.focus();
    win.print();
}

export function editCartouche(circuitTitle = '') {
    if (!printFrame.enabled) {
        setPrintFrameEnabled(true);
        draw();
    }
    openCartoucheModal(circuitTitle);
}

export function confirmCartoucheSave() {
    saveCartoucheFromForm();
    draw();
}

export function initPrintUi(circuitTitleGetter) {
    document.getElementById('btn-toggle-print-frame')?.addEventListener('click', togglePrintFrame);
    document.getElementById('btn-edit-cartouche')?.addEventListener('click', () => {
        editCartouche(typeof circuitTitleGetter === 'function' ? circuitTitleGetter() : '');
    });
    document.getElementById('btn-print')?.addEventListener('click', openPrintPreview);
    document.getElementById('close-print-preview')?.addEventListener('click', closePrintPreview);
    document.getElementById('print-preview-print')?.addEventListener('click', printFromPreview);
    document.getElementById('close-cartouche')?.addEventListener('click', closeCartoucheModal);
    document.getElementById('cartouche-save')?.addEventListener('click', confirmCartoucheSave);
    document.getElementById('cartouche-cancel')?.addEventListener('click', closeCartoucheModal);
    document.getElementById('print-preview-modal')?.addEventListener('click', (e) => {
        if (e.target === e.currentTarget) closePrintPreview();
    });
    document.getElementById('cartouche-modal')?.addEventListener('click', (e) => {
        if (e.target === e.currentTarget) closeCartoucheModal();
    });
}
