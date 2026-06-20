/** Panneau latéral droit — éditeur sketch Arduino + compilation arduino-cli. */
import { saveState, circuit, flags } from './state.js';
import { draw, resizeCanvas } from './renderer.js';
import { onArduinoSketchUpdated } from './led-animation.js';
import { refreshGroveLcdDisplayCache } from './Engine/grove-lcd-ideal.mjs';
import { DEFAULT_ARDUINO_SKETCH } from './arduino-uno-layout.js';
import { applyArduinoSketchToComponent } from './Engine/arduino-sketch-parse.mjs';
import { registerArduinoSketchSync, syncArduinoSketchesFromEditor } from './arduino-sketch-sync.js';
import { openArduinoLibPopup } from './arduino-lib-popup.js';
import { initArduinoSyntaxHighlight, refreshArduinoSyntaxHighlight } from './arduino-syntax-highlight.js';
import { showModal } from './modal-ui.js';

let activeBoard = null;

const panel = () => document.getElementById('arduino-panel');
const sketchEl = () => document.getElementById('arduino-sketch-input');
const logEl = () => document.getElementById('arduino-compile-log');
const compileStatusEl = () => document.getElementById('arduino-compile-status');
const showErrorsBtn = () => document.getElementById('arduino-btn-show-errors');
const titleEl = () => document.getElementById('arduino-panel-title');
const statusEl = () => document.getElementById('arduino-cli-status');
const libSearchEl = () => document.getElementById('arduino-lib-search');
const libSearchResultsEl = () => document.getElementById('arduino-lib-search-results');
const libInstalledEl = () => document.getElementById('arduino-lib-installed');
const libMsgEl = () => document.getElementById('arduino-lib-msg');

function resolveApiBaseUrl() {
    const { protocol, pathname, origin } = window.location;
    if (protocol === 'file:') return 'http://127.0.0.1:43721';
    if (pathname.startsWith('/Simulateur')) return origin;
    return origin;
}

function setLibMsg(text, kind = '') {
    const el = libMsgEl();
    if (!el) return;
    el.textContent = text || '';
    el.className = 'arduino-lib-msg' + (kind ? ` arduino-lib-msg--${kind}` : '');
}

function setCompileLogVisible(visible) {
    const log = logEl();
    const btn = showErrorsBtn();
    if (log) log.classList.toggle('hidden', !visible);
    if (btn) btn.textContent = visible ? 'Masquer les erreurs' : 'Voir les erreurs';
}

function updateCompileStatusUi(board) {
    const status = compileStatusEl();
    const btn = showErrorsBtn();
    const log = logEl();
    if (!status || !btn) return;

    if (!board) {
        status.textContent = '';
        status.className = 'arduino-compile-status';
        btn.classList.add('hidden');
        if (log) {
            log.textContent = '';
            log.classList.add('hidden');
        }
        return;
    }

    if (board.lastCompileOk) {
        status.textContent = 'OK';
        status.className = 'arduino-compile-status arduino-compile-status--ok';
        btn.classList.add('hidden');
        setCompileLogVisible(false);
        return;
    }

    status.textContent = '';
    status.className = 'arduino-compile-status';
    const hasLog = !!(board.lastCompileLog || '').trim();
    if (hasLog) {
        btn.classList.remove('hidden');
        if (log) log.textContent = board.lastCompileLog;
        setCompileLogVisible(false);
    } else {
        btn.classList.add('hidden');
        if (log) log.classList.add('hidden');
    }
}

function escapeHtml(s) {
    return String(s || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function renderLibraryItem(lib, mode) {
    const li = document.createElement('li');
    li.className = 'arduino-lib-item';
    const meta = [lib.author, lib.version].filter(Boolean).join(' · ');
    const desc = lib.description ? `<div class="arduino-lib-item-meta">${escapeHtml(lib.description)}</div>` : '';
    const btnClass = mode === 'install' ? 'arduino-btn--install' : 'arduino-btn--uninstall';
    const btnLabel = mode === 'install' ? 'Installer' : 'Retirer';
    const btn = mode === 'local'
        ? '<span class="arduino-lib-item-meta">local</span>'
        : `<button type="button" class="arduino-btn arduino-btn--small ${btnClass}" data-lib-name="${escapeHtml(lib.name)}">${btnLabel}</button>`;
    li.innerHTML = `
        <div class="arduino-lib-item-info">
            <button type="button" class="arduino-lib-item-name" title="Voir les commandes">${escapeHtml(lib.name)}</button>
            ${meta ? `<div class="arduino-lib-item-meta">${escapeHtml(meta)}</div>` : ''}
            ${desc}
        </div>
        ${btn}
    `;
    li.querySelector('.arduino-lib-item-name')?.addEventListener('click', (e) => {
        e.stopPropagation();
        openArduinoLibPopup(lib.name);
    });
    if (mode !== 'local') {
        li.querySelector('button')?.addEventListener('click', () => {
            if (mode === 'install') installLibraryByName(lib.name);
            else uninstallLibraryByName(lib.name);
        });
    }
    return li;
}

export function isArduinoPanelOpen() {
    const p = panel();
    return p && !p.classList.contains('hidden');
}

export function getArduinoPanelWidth() {
    const p = panel();
    return isArduinoPanelOpen() && p ? p.offsetWidth : 0;
}

export async function refreshInstalledLibraries() {
    const list = libInstalledEl();
    if (!list) return;
    list.innerHTML = '';
    setLibMsg('Chargement des bibliothèques…');
    try {
        const base = resolveApiBaseUrl();
        const r = await fetch(`${base}/api/arduino/libraries`);
        const data = await r.json();
        const libs = Array.isArray(data.libraries) ? data.libraries : [];
        if (libs.length === 0) {
            setLibMsg('Aucune bibliothèque installée. Recherchez « LiquidCrystal I2C » ci-dessus.', '');
        } else {
            setLibMsg(`${libs.length} bibliothèque(s) disponible(s).`, 'ok');
        }
        for (const lib of libs) {
            const mode = lib.source === 'local' ? 'local' : 'uninstall';
            list.appendChild(renderLibraryItem(lib, mode));
        }
        await refreshArduinoCliStatus();
    } catch (err) {
        setLibMsg(err?.message || 'Impossible de charger les bibliothèques.', 'err');
    }
}

export async function searchLibraries(query) {
    const q = String(query || '').trim();
    const list = libSearchResultsEl();
    if (!list) return;
    list.innerHTML = '';
    if (!q) {
        setLibMsg('Saisissez un nom à rechercher.', 'err');
        return;
    }
    setLibMsg(`Recherche « ${q} »…`);
    try {
        const base = resolveApiBaseUrl();
        const r = await fetch(`${base}/api/arduino/lib/search?q=${encodeURIComponent(q)}`);
        const data = await r.json();
        const libs = Array.isArray(data.libraries) ? data.libraries : [];
        if (!data.ok) {
            setLibMsg((data.errors || []).join(' ') || 'Recherche échouée.', 'err');
            return;
        }
        if (libs.length === 0) {
            setLibMsg('Aucun résultat. Essayez « LiquidCrystal » ou mettez à jour l\'index (↻).', 'err');
            return;
        }
        setLibMsg(`${libs.length} résultat(s).`, 'ok');
        for (const lib of libs.slice(0, 12)) {
            list.appendChild(renderLibraryItem(lib, 'install'));
        }
    } catch (err) {
        setLibMsg(err?.message || 'Recherche impossible.', 'err');
    }
}

export async function installLibraryByName(name) {
    const libName = String(name || '').trim();
    if (!libName) return;
    setLibMsg(`Installation de « ${libName} »…`);
    try {
        const base = resolveApiBaseUrl();
        const r = await fetch(`${base}/api/arduino/lib/install`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: libName }),
        });
        const data = await r.json();
        if (!data.ok) {
            setLibMsg((data.errors || []).join('\n') || data.log || 'Installation échouée.', 'err');
            return;
        }
        setLibMsg(`« ${libName} » installée.`, 'ok');
        libSearchResultsEl()?.replaceChildren();
        await refreshInstalledLibraries();
    } catch (err) {
        setLibMsg(err?.message || 'Installation impossible.', 'err');
    }
}

export async function uninstallLibraryByName(name) {
    const libName = String(name || '').trim();
    if (!libName) return;
    if (!confirm(`Retirer la bibliothèque « ${libName} » ?`)) return;
    setLibMsg(`Retrait de « ${libName} »…`);
    try {
        const base = resolveApiBaseUrl();
        const r = await fetch(`${base}/api/arduino/lib/uninstall`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: libName }),
        });
        const data = await r.json();
        if (!data.ok) {
            setLibMsg((data.errors || []).join('\n') || data.log || 'Retrait échoué.', 'err');
            return;
        }
        setLibMsg(`« ${libName} » retirée.`, 'ok');
        await refreshInstalledLibraries();
    } catch (err) {
        setLibMsg(err?.message || 'Retrait impossible.', 'err');
    }
}

export function getActiveArduinoBoard() {
    return activeBoard;
}

export function openArduinoEditor(comp) {
    if (!comp || comp.type !== 'arduino_uno') return;
    activeBoard = comp;
    if (titleEl()) titleEl().textContent = `${comp.label} — Arduino UNO`;
    if (sketchEl()) sketchEl().value = comp.sketch || DEFAULT_ARDUINO_SKETCH;
    refreshArduinoSyntaxHighlight();
    applyArduinoSketchToComponent(comp);
    updateCompileStatusUi(comp);
    panel()?.classList.remove('hidden');
    refreshArduinoCliStatus();
    refreshInstalledLibraries();
    resizeCanvas();
    requestAnimationFrame(() => sketchEl()?.focus({ preventScroll: true }));
}

/** Ouvre l’éditeur sur la première carte UNO du schéma (ou la carte déjà active). */
export function openArduinoEditorForCircuit() {
    if (activeBoard && circuit.components.includes(activeBoard)) {
        openArduinoEditor(activeBoard);
        return true;
    }
    const uno = circuit.components.find((c) => c.type === 'arduino_uno');
    if (!uno) {
        alert('Ajoutez d’abord une carte Arduino UNO au schéma (menu Arduino).');
        return false;
    }
    openArduinoEditor(uno);
    return true;
}

export function closeArduinoEditor() {
    applySketchToBoard();
    panel()?.classList.add('hidden');
    activeBoard = null;
    resizeCanvas();
}

function applySketchToBoard() {
    if (!activeBoard || !sketchEl() || !circuit.components.includes(activeBoard)) return;
    activeBoard.sketch = sketchEl().value;
}

/** Vide l'éditeur sans réécrire le textarea dans un composant détaché (chargement JSON). */
export function resetArduinoEditorOnCircuitLoad() {
    activeBoard = null;
    panel()?.classList.add('hidden');
    if (sketchEl()) sketchEl().value = '';
    updateCompileStatusUi(null);
    resizeCanvas();
}

/** Enregistre le sketch visible dans le composant UNO actif avant export fichier. */
export function flushArduinoSketchesBeforeSave() {
    applySketchToBoard();
}

export async function refreshArduinoCliStatus() {
    const el = statusEl();
    if (!el) return;
    el.textContent = 'Vérification arduino-cli…';
    try {
        const base = resolveApiBaseUrl();
        const r = await fetch(`${base}/api/arduino/status`);
        const data = await r.json();
        if (data.ok && data.version) {
            el.textContent = `arduino-cli OK — ${String(data.version).split('\n')[0]}`;
            el.className = 'arduino-cli-status arduino-cli-status--ok';
        } else {
            el.textContent = data.hint || 'arduino-cli introuvable sur ce serveur.';
            el.className = 'arduino-cli-status arduino-cli-status--warn';
        }
    } catch {
        el.textContent = 'Serveur Arduino injoignable (lancez npm start ou Simulateur H).';
        el.className = 'arduino-cli-status arduino-cli-status--warn';
    }
}

export async function compileActiveSketch() {
    if (!activeBoard) return;
    applySketchToBoard();
    saveState();
    const log = logEl();
    const status = compileStatusEl();
    const btn = showErrorsBtn();
    if (status) {
        status.textContent = 'Compilation…';
        status.className = 'arduino-compile-status arduino-compile-status--busy';
    }
    if (btn) btn.classList.add('hidden');
    if (log) {
        log.textContent = 'Compilation en cours…';
        log.classList.add('hidden');
    }
    const base = resolveApiBaseUrl();
    try {
        const r = await fetch(`${base}/api/arduino/compile`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                sketch: activeBoard.sketch,
                sketchName: activeBoard.label,
                fqbn: activeBoard.fqbn || 'arduino:avr:uno',
            }),
        });
        const data = await r.json();
        activeBoard.lastCompileOk = !!data.ok;
        activeBoard.lastCompileLog = data.log || (data.errors || []).join('\n');
        if (data.ok) {
            applyArduinoSketchToComponent(activeBoard);
            onArduinoSketchUpdated();
            if (flags.isSimulating) {
                import('./simulation.js').then((m) => m.requestLiveSimulation());
            }
        }
        if (log) log.textContent = activeBoard.lastCompileLog;
        updateCompileStatusUi(activeBoard);
        draw();
    } catch (err) {
        activeBoard.lastCompileOk = false;
        activeBoard.lastCompileLog = err?.message || String(err);
        if (log) log.textContent = activeBoard.lastCompileLog;
        updateCompileStatusUi(activeBoard);
        draw();
    }
}

export function prepareArduinoForSimulation() {
    syncArduinoSketchesFromEditor();
    for (const comp of circuit.components) {
        if (comp.type === 'arduino_uno') applyArduinoSketchToComponent(comp);
    }
    refreshGroveLcdDisplayCache(circuit.components, circuit.wires, circuit.autoJunctions);
}

export function initArduinoEditor() {
    registerArduinoSketchSync(() => activeBoard);
    document.getElementById('arduino-panel-close')?.addEventListener('click', () => {
        saveState();
        closeArduinoEditor();
        draw();
    });
    document.getElementById('arduino-panel-doc')?.addEventListener('click', () => {
        if (!activeBoard) return;
        const modal = document.getElementById('uno-doc-modal');
        const title = document.getElementById('uno-doc-title');
        if (title) title.textContent = `Arduino UNO R3 — ${activeBoard.label}`;
        showModal(modal);
    });
    document.getElementById('arduino-btn-compile')?.addEventListener('click', () => {
        compileActiveSketch();
    });
    document.getElementById('arduino-btn-show-errors')?.addEventListener('click', () => {
        const log = logEl();
        if (!log) return;
        setCompileLogVisible(log.classList.contains('hidden'));
    });
    document.getElementById('arduino-lib-search-btn')?.addEventListener('click', () => {
        searchLibraries(libSearchEl()?.value || '');
    });
    libSearchEl()?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            searchLibraries(libSearchEl()?.value || '');
        }
    });
    document.getElementById('arduino-lib-refresh')?.addEventListener('click', async () => {
        setLibMsg('Mise à jour de l\'index Library Manager…');
        try {
            const base = resolveApiBaseUrl();
            const r = await fetch(`${base}/api/arduino/lib/update-index`, { method: 'POST' });
            const data = await r.json();
            if (!data.ok) {
                setLibMsg((data.errors || []).join(' ') || 'Échec.', 'err');
            } else {
                setLibMsg('Index à jour.', 'ok');
            }
            await refreshInstalledLibraries();
        } catch (err) {
            setLibMsg(err?.message || 'Échec.', 'err');
        }
    });
    sketchEl()?.addEventListener('keydown', (e) => {
        e.stopPropagation();
        if (e.key === 'Tab') {
            e.preventDefault();
            const ta = sketchEl();
            if (!ta) return;
            const start = ta.selectionStart;
            const end = ta.selectionEnd;
            const val = ta.value;
            ta.value = `${val.slice(0, start)}    ${val.slice(end)}`;
            ta.selectionStart = ta.selectionEnd = start + 4;
            ta.dispatchEvent(new Event('input', { bubbles: true }));
        }
    });
    document.querySelector('.arduino-sketch-wrap')?.addEventListener('mousedown', (e) => {
        if (e.target === sketchEl()) return;
        e.preventDefault();
        sketchEl()?.focus({ preventScroll: true });
    });
    let sketchDrawTimer = 0;
    sketchEl()?.addEventListener('input', () => {
        applySketchToBoard();
        if (activeBoard) applyArduinoSketchToComponent(activeBoard);
        refreshArduinoSyntaxHighlight();
        clearTimeout(sketchDrawTimer);
        sketchDrawTimer = setTimeout(() => draw(), 200);
    });
    sketchEl()?.addEventListener('blur', () => {
        applySketchToBoard();
        applyArduinoSketchToComponent(activeBoard);
        saveState();
    });
    initArduinoSyntaxHighlight();
}

export function onArduinoBoardRemoved(comp) {
    if (activeBoard && comp === activeBoard) closeArduinoEditor();
}
