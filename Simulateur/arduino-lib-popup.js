// arduino-lib-popup.js — fenêtre flottante : commandes d'une bibliothèque Arduino
import { resolveArduinoLibDoc } from './arduino-lib-commands.mjs';

let floatX = 160;
let floatY = 90;
let dragging = false;
let dragOffX = 0;
let dragOffY = 0;

const popupEl = () => document.getElementById('arduino-lib-popup');
const titleEl = () => document.getElementById('arduino-lib-popup-title');
const bodyEl = () => document.getElementById('arduino-lib-popup-body');

function escapeHtml(s) {
    return String(s || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function applyFloatPosition() {
    const el = popupEl();
    if (!el) return;
    el.style.left = `${floatX}px`;
    el.style.top = `${floatY}px`;
}

function clampFloatPosition() {
    const el = popupEl();
    if (!el) return;
    const w = el.offsetWidth || 480;
    const h = el.offsetHeight || 400;
    floatX = Math.max(4, Math.min(window.innerWidth - w - 4, floatX));
    floatY = Math.max(48, Math.min(window.innerHeight - h - 4, floatY));
}

function renderUnknownLib(libName) {
    return `
        <p class="arduino-lib-doc-note">
            Aucune fiche détaillée pour <strong>${escapeHtml(libName)}</strong>.
            Consultez la documentation du Library Manager ou le fichier <code>README</code> de la bibliothèque.
        </p>
        <p class="arduino-lib-doc-note">
            Bibliothèques documentées dans le simulateur :
            <strong>LiquidCrystal I2C</strong>, <strong>Wire</strong>, <strong>Grove LCD RGB</strong>.
        </p>
    `;
}

function renderLibDoc(doc) {
    const header = doc.header
        ? `<pre class="arduino-lib-doc-code">${escapeHtml(doc.header)}</pre>`
        : '';
    const ctor = doc.ctor
        ? `<pre class="arduino-lib-doc-code">${escapeHtml(doc.ctor)}</pre>`
        : '';
    const note = doc.note
        ? `<p class="arduino-lib-doc-note">${escapeHtml(doc.note)}</p>`
        : '';
    const rows = doc.commands.map((cmd) => {
        const badge = cmd.simSupported
            ? '<span class="arduino-lib-doc-badge arduino-lib-doc-badge--sim">simulateur</span>'
            : '<span class="arduino-lib-doc-badge">compilation</span>';
        return `<tr>
            <td><code class="arduino-lib-doc-sig">${escapeHtml(cmd.sig)}</code>${badge}</td>
            <td>${escapeHtml(cmd.desc)}</td>
        </tr>`;
    }).join('');
    return `
        ${note}
        ${header}
        ${ctor}
        <table class="arduino-lib-doc-table">
            <thead>
                <tr><th>Commande</th><th>Description</th></tr>
            </thead>
            <tbody>${rows}</tbody>
        </table>
        <p class="arduino-lib-doc-legend">
            <span class="arduino-lib-doc-badge arduino-lib-doc-badge--sim">simulateur</span> effet visible en simulation
            · <span class="arduino-lib-doc-badge">compilation</span> compile uniquement (arduino-cli)
        </p>
    `;
}

export function isArduinoLibPopupOpen() {
    const el = popupEl();
    return el && !el.classList.contains('hidden');
}

export function openArduinoLibPopup(libName) {
    const name = String(libName || '').trim();
    if (!name) return;
    const doc = resolveArduinoLibDoc(name);
    if (titleEl()) titleEl().textContent = doc ? doc.title : name;
    if (bodyEl()) {
        bodyEl().innerHTML = doc ? renderLibDoc(doc) : renderUnknownLib(name);
    }
    applyFloatPosition();
    popupEl()?.classList.remove('hidden');
}

export function closeArduinoLibPopup() {
    popupEl()?.classList.add('hidden');
}

export function initArduinoLibPopup() {
    document.getElementById('arduino-lib-popup-close')?.addEventListener('click', (e) => {
        e.stopPropagation();
        closeArduinoLibPopup();
    });

    const handle = document.getElementById('arduino-lib-popup-drag-handle');
    handle?.addEventListener('mousedown', (e) => {
        if (e.button !== 0) return;
        if (e.target.closest('#arduino-lib-popup-close')) return;
        dragging = true;
        const rect = popupEl()?.getBoundingClientRect();
        if (rect) {
            dragOffX = e.clientX - rect.left;
            dragOffY = e.clientY - rect.top;
        }
        e.preventDefault();
    });

    window.addEventListener('mousemove', (e) => {
        if (!dragging) return;
        floatX = e.clientX - dragOffX;
        floatY = e.clientY - dragOffY;
        clampFloatPosition();
        applyFloatPosition();
    });

    window.addEventListener('mouseup', () => {
        dragging = false;
    });

    window.addEventListener('resize', () => {
        if (isArduinoLibPopupOpen()) {
            clampFloatPosition();
            applyFloatPosition();
        }
    });
}
