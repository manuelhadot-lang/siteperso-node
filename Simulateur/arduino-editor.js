/** Panneau latéral droit — éditeur sketch Arduino + compilation arduino-cli. */
import { saveState, circuit, flags } from './state.js';
import { draw, resizeCanvas } from './renderer.js';
import { onArduinoSketchUpdated } from './led-animation.js';
import { refreshGroveLcdDisplayCache } from './Engine/grove-lcd-ideal.mjs';
import { refreshJoyitTft18DisplayCache } from './Engine/tft18-ideal.mjs';
import { DEFAULT_ARDUINO_SKETCH } from './arduino-uno-layout.js';
import { DEFAULT_ESP32_SKETCH, ESP32_FQBN, uploadProfilesForBoardType, normalizeBoardFqbn } from './esp32-c3-layout.js';
import { DEFAULT_ESP32_DEVKIT_SKETCH } from './esp32-devkit-layout.js';
import { isMicroBoard } from './micro-board.js';
import { applyArduinoSketchToComponent } from './Engine/arduino-sketch-parse.mjs';
import { registerArduinoSketchSync, syncArduinoSketchesFromEditor } from './arduino-sketch-sync.js';
import { openArduinoLibPopup } from './arduino-lib-popup.js';
import { initArduinoSyntaxHighlight, refreshArduinoSyntaxHighlight } from './arduino-syntax-highlight.js';
import { showModal } from './modal-ui.js';

let activeBoard = null;

const PANEL_WIDTH_KEY = 'simulator.arduinoPanelWidth';
const PANEL_WIDTH_DEFAULT = 420;
const PANEL_WIDTH_MIN = 280;

const EDITOR_FONT_KEY = 'simulator.arduinoEditorFontSize';
const EDITOR_FONT_DEFAULT = 13;
const EDITOR_FONT_MIN = 10;
const EDITOR_FONT_MAX = 28;

const UPLOAD_PORT_KEY = 'simulator.arduinoUploadPort';

function panelWidthMax() {
    return Math.min(800, Math.floor(window.innerWidth * 0.75));
}

function clampPanelWidth(widthPx) {
    return Math.max(PANEL_WIDTH_MIN, Math.min(panelWidthMax(), Math.round(widthPx)));
}

function applyPanelWidth(widthPx) {
    const p = panel();
    if (!p) return clampPanelWidth(widthPx);
    const w = clampPanelWidth(widthPx);
    p.style.setProperty('--arduino-panel-width', `${w}px`);
    p.style.width = `${w}px`;
    try {
        localStorage.setItem(PANEL_WIDTH_KEY, String(w));
    } catch {
        /* ignore */
    }
    return w;
}

function loadPanelWidth() {
    try {
        const saved = parseInt(localStorage.getItem(PANEL_WIDTH_KEY), 10);
        if (Number.isFinite(saved)) return clampPanelWidth(saved);
    } catch {
        /* ignore */
    }
    return clampPanelWidth(PANEL_WIDTH_DEFAULT);
}

function initPanelResize() {
    const handle = document.getElementById('arduino-panel-resize');
    const p = panel();
    if (!handle || !p) return;

    applyPanelWidth(loadPanelWidth());

    handle.addEventListener('pointerdown', (e) => {
        if (e.button !== 0 || p.classList.contains('hidden')) return;
        e.preventDefault();
        handle.setPointerCapture(e.pointerId);
        handle.classList.add('is-dragging');
        document.body.classList.add('arduino-panel-resizing');
        const startX = e.clientX;
        const startW = p.offsetWidth;

        const onMove = (ev) => {
            applyPanelWidth(startW + (startX - ev.clientX));
            resizeCanvas();
        };
        const onUp = (ev) => {
            handle.releasePointerCapture(ev.pointerId);
            handle.classList.remove('is-dragging');
            document.body.classList.remove('arduino-panel-resizing');
            handle.removeEventListener('pointermove', onMove);
            handle.removeEventListener('pointerup', onUp);
            handle.removeEventListener('pointercancel', onUp);
            resizeCanvas();
        };

        handle.addEventListener('pointermove', onMove);
        handle.addEventListener('pointerup', onUp);
        handle.addEventListener('pointercancel', onUp);
    });

    window.addEventListener('resize', () => {
        if (p.classList.contains('hidden')) return;
        applyPanelWidth(p.offsetWidth);
        resizeCanvas();
    });
}

function clampEditorFontSize(sizePx) {
    return Math.max(EDITOR_FONT_MIN, Math.min(EDITOR_FONT_MAX, Math.round(sizePx)));
}

function getEditorFontSize() {
    const grid = document.querySelector('.arduino-sketch-grid');
    if (!grid) return EDITOR_FONT_DEFAULT;
    const raw = getComputedStyle(grid).getPropertyValue('--arduino-editor-font-size').trim();
    const n = parseFloat(raw);
    return Number.isFinite(n) ? clampEditorFontSize(n) : EDITOR_FONT_DEFAULT;
}

function applyEditorFontSize(sizePx) {
    const grid = document.querySelector('.arduino-sketch-grid');
    if (!grid) return clampEditorFontSize(sizePx);
    const size = clampEditorFontSize(sizePx);
    grid.style.setProperty('--arduino-editor-font-size', `${size}px`);
    try {
        localStorage.setItem(EDITOR_FONT_KEY, String(size));
    } catch {
        /* ignore */
    }
    refreshArduinoSyntaxHighlight();
    return size;
}

function loadEditorFontSize() {
    try {
        const saved = parseInt(localStorage.getItem(EDITOR_FONT_KEY), 10);
        if (Number.isFinite(saved)) return clampEditorFontSize(saved);
    } catch {
        /* ignore */
    }
    return clampEditorFontSize(EDITOR_FONT_DEFAULT);
}

function initEditorZoom() {
    const wrap = document.querySelector('.arduino-sketch-wrap');
    if (!wrap) return;

    applyEditorFontSize(loadEditorFontSize());
    wrap.title = 'Ctrl + molette : zoom du texte';

    wrap.addEventListener('wheel', (e) => {
        if (!e.ctrlKey) return;
        e.preventDefault();
        const step = e.deltaY < 0 ? 1 : -1;
        applyEditorFontSize(getEditorFontSize() + step);
    }, { passive: false });
}

const panel = () => document.getElementById('arduino-panel');
const sketchEl = () => document.getElementById('arduino-sketch-input');
const logEl = () => document.getElementById('arduino-compile-log');
const compileStatusEl = () => document.getElementById('arduino-compile-status');
const showErrorsBtn = () => document.getElementById('arduino-btn-show-errors');
const titleEl = () => document.getElementById('arduino-panel-title');
const libSearchEl = () => document.getElementById('arduino-lib-search');
const libSearchResultsEl = () => document.getElementById('arduino-lib-search-results');
const libInstalledEl = () => document.getElementById('arduino-lib-installed');
const libMsgEl = () => document.getElementById('arduino-lib-msg');
const uploadProfileEl = () => document.getElementById('arduino-upload-profile');
const uploadPortEl = () => document.getElementById('arduino-upload-port');
const uploadHintEl = () => document.getElementById('arduino-upload-hint');

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

function resolveBoardFqbn(board) {
    if (!board) return 'arduino:avr:uno';
    board.fqbn = normalizeBoardFqbn(board);
    return board.fqbn;
}

function populateUploadProfileSelect(board) {
    const sel = uploadProfileEl();
    if (!sel || !board) return;
    const profiles = uploadProfilesForBoardType(board.type);
    sel.replaceChildren();
    for (const p of profiles) {
        const opt = document.createElement('option');
        opt.value = p.fqbn;
        opt.textContent = p.label;
        sel.appendChild(opt);
    }
    sel.value = resolveBoardFqbn(board);
    sel.disabled = profiles.length <= 1;
}

function loadSavedUploadPort() {
    try {
        return localStorage.getItem(UPLOAD_PORT_KEY) || '';
    } catch {
        return '';
    }
}

function saveUploadPort(port) {
    try {
        if (port) localStorage.setItem(UPLOAD_PORT_KEY, port);
    } catch {
        /* ignore */
    }
}

function setUploadHint(text, kind = '') {
    const el = uploadHintEl();
    if (!el) return;
    el.textContent = text || '';
    el.className = 'arduino-upload-hint' + (kind ? ` arduino-lib-msg--${kind}` : '');
}

export async function refreshUploadPorts() {
    const sel = uploadPortEl();
    if (!sel) return;
    const saved = loadSavedUploadPort();
    setUploadHint('Recherche des ports USB…');
    try {
        const base = resolveApiBaseUrl();
        const r = await fetch(`${base}/api/arduino/boards`);
        const data = await r.json();
        const boards = Array.isArray(data.boards) ? data.boards : [];
        sel.replaceChildren();
        const placeholder = document.createElement('option');
        placeholder.value = '';
        placeholder.textContent = boards.length ? '— Choisir un port —' : 'Aucun port détecté';
        sel.appendChild(placeholder);
        for (const b of boards) {
            const opt = document.createElement('option');
            opt.value = b.port;
            const hint = b.label && b.label !== b.port ? ` — ${b.label}` : '';
            opt.textContent = `${b.port}${hint}`;
            sel.appendChild(opt);
        }
        if (saved && boards.some((b) => b.port === saved)) {
            sel.value = saved;
        } else if (boards.length === 1) {
            sel.value = boards[0].port;
        }
        if (!data.ok) {
            setUploadHint((data.errors || []).join(' ') || 'Ports indisponibles (serveur distant ?).', 'err');
            return;
        }
        setUploadHint(
            boards.length
                ? `${boards.length} port(s) détecté(s). Fermez le Moniteur série avant le téléversement.`
                : 'Aucune carte USB détectée. Branchez l’UNO ou le XIAO puis ↻ Ports.',
            boards.length ? 'ok' : ''
        );
    } catch (err) {
        setUploadHint(
            `${err?.message || err} — Le téléversement requiert le serveur Node sur le PC local (npm start).`,
            'err'
        );
    }
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

    if (board.lastUploadOk) {
        status.textContent = 'Téléversé';
        status.className = 'arduino-compile-status arduino-compile-status--upload-ok';
        btn.classList.add('hidden');
        setCompileLogVisible(false);
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

function boardPanelTitle(comp) {
    if (comp.type === 'esp32_c3') return `${comp.label} — ESP32-C3`;
    if (comp.type === 'esp32_devkit') return `${comp.label} — ESP32 DevKit`;
    return `${comp.label} — Arduino UNO`;
}

function defaultSketchForBoard(comp) {
    if (comp.type === 'esp32_c3') return DEFAULT_ESP32_SKETCH;
    if (comp.type === 'esp32_devkit') return DEFAULT_ESP32_DEVKIT_SKETCH;
    return DEFAULT_ARDUINO_SKETCH;
}

export function openArduinoEditor(comp) {
    if (!isMicroBoard(comp)) return;
    activeBoard = comp;
    resolveBoardFqbn(activeBoard);
    activeBoard.lastUploadOk = false;
    if (titleEl()) titleEl().textContent = boardPanelTitle(comp);
    if (sketchEl()) sketchEl().value = comp.sketch || defaultSketchForBoard(comp);
    refreshArduinoSyntaxHighlight();
    applyArduinoSketchToComponent(comp);
    populateUploadProfileSelect(comp);
    updateCompileStatusUi(comp);
    panel()?.classList.remove('hidden');
    refreshInstalledLibraries();
    refreshUploadPorts();
    resizeCanvas();
    requestAnimationFrame(() => sketchEl()?.focus({ preventScroll: true }));
}

function findBoardForEditor(preferredType) {
    if (preferredType === 'esp32') {
        return (
            circuit.components.find((c) => c.type === 'esp32_devkit') ||
            circuit.components.find((c) => c.type === 'esp32_c3')
        );
    }
    if (preferredType) {
        return circuit.components.find((c) => c.type === preferredType);
    }
    return circuit.components.find((c) => isMicroBoard(c));
}

/** Ouvre l’éditeur sur la première carte du schéma (ou la carte déjà active). */
export function openArduinoEditorForCircuit(preferredType) {
    if (activeBoard && circuit.components.includes(activeBoard)) {
        if (!preferredType || preferredType === 'esp32') {
            if (activeBoard.type === 'esp32_devkit' || activeBoard.type === 'esp32_c3') {
                openArduinoEditor(activeBoard);
                return true;
            }
        } else if (activeBoard.type === preferredType) {
            openArduinoEditor(activeBoard);
            return true;
        }
    }
    const board = findBoardForEditor(preferredType);
    if (!board) {
        const hint =
            preferredType === 'esp32' || preferredType === 'esp32_c3' || preferredType === 'esp32_devkit'
                ? 'Ajoutez d’abord une carte ESP32 au schéma (menu ESP32 — C3 ou DevKit WROOM-32).'
                : preferredType === 'arduino_uno'
                  ? 'Ajoutez d’abord une carte Arduino UNO au schéma (menu Arduino).'
                  : 'Ajoutez d’abord une carte Arduino UNO ou ESP32 au schéma.';
        alert(hint);
        return false;
    }
    openArduinoEditor(board);
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

export async function compileActiveSketch() {
    if (!activeBoard) return;
    applySketchToBoard();
    saveState();
    activeBoard.lastUploadOk = false;
    const log = logEl();
    const status = compileStatusEl();
    const btn = showErrorsBtn();
    const fqbn = resolveBoardFqbn(activeBoard);
    if (status) {
        const isEsp32 = String(fqbn).includes('esp32');
        status.textContent = isEsp32
            ? 'Compilation ESP32… (1ère fois : installation du core, plusieurs minutes)'
            : 'Compilation…';
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
                fqbn,
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

export async function uploadActiveSketch() {
    if (!activeBoard) return;
    applySketchToBoard();
    saveState();
    const port = uploadPortEl()?.value || '';
    if (!port) {
        setUploadHint('Sélectionnez un port USB (↻ Ports) ou branchez la carte.', 'err');
        return;
    }
    saveUploadPort(port);

    const log = logEl();
    const status = compileStatusEl();
    const btn = showErrorsBtn();
    const fqbn = resolveBoardFqbn(activeBoard);
    activeBoard.lastUploadOk = false;

    if (status) {
        status.textContent = String(fqbn).includes('esp32') ? 'Téléversement ESP32…' : 'Téléversement…';
        status.className = 'arduino-compile-status arduino-compile-status--busy';
    }
    if (btn) btn.classList.add('hidden');
    if (log) {
        log.textContent = 'Compilation et téléversement en cours…';
        log.classList.remove('hidden');
    }
    setUploadHint(`Envoi sur ${port}…`);

    const base = resolveApiBaseUrl();
    try {
        const r = await fetch(`${base}/api/arduino/upload`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                sketch: activeBoard.sketch,
                sketchName: activeBoard.label,
                fqbn,
                port,
            }),
        });
        const data = await r.json();
        activeBoard.lastCompileOk = !!data.ok;
        activeBoard.lastUploadOk = !!data.ok;
        activeBoard.lastCompileLog = data.log || (data.errors || []).join('\n');
        if (data.ok) {
            applyArduinoSketchToComponent(activeBoard);
            onArduinoSketchUpdated();
            setUploadHint(`Programme téléversé sur ${port}.`, 'ok');
        } else {
            setUploadHint((data.errors || []).join(' ') || 'Téléversement échoué.', 'err');
        }
        if (log) log.textContent = activeBoard.lastCompileLog;
        updateCompileStatusUi(activeBoard);
        draw();
    } catch (err) {
        activeBoard.lastCompileOk = false;
        activeBoard.lastUploadOk = false;
        activeBoard.lastCompileLog = err?.message || String(err);
        if (log) log.textContent = activeBoard.lastCompileLog;
        setUploadHint(activeBoard.lastCompileLog, 'err');
        updateCompileStatusUi(activeBoard);
        draw();
    }
}

export function prepareArduinoForSimulation() {
    syncArduinoSketchesFromEditor();
    for (const comp of circuit.components) {
        if (isMicroBoard(comp)) applyArduinoSketchToComponent(comp);
    }
    refreshGroveLcdDisplayCache(circuit.components, circuit.wires, circuit.autoJunctions);
    refreshJoyitTft18DisplayCache(circuit.components, circuit.wires, circuit.autoJunctions);
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
    document.getElementById('arduino-btn-upload')?.addEventListener('click', () => {
        uploadActiveSketch();
    });
    document.getElementById('arduino-btn-refresh-ports')?.addEventListener('click', () => {
        refreshUploadPorts();
    });
    uploadProfileEl()?.addEventListener('change', () => {
        if (!activeBoard) return;
        const fqbn = uploadProfileEl()?.value;
        if (fqbn) {
            activeBoard.fqbn = fqbn;
            activeBoard.lastUploadOk = false;
            saveState();
            updateCompileStatusUi(activeBoard);
        }
    });
    uploadPortEl()?.addEventListener('change', () => {
        const port = uploadPortEl()?.value;
        if (port) saveUploadPort(port);
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
    initPanelResize();
    initEditorZoom();
}

export function onArduinoBoardRemoved(comp) {
    if (activeBoard && comp === activeBoard) closeArduinoEditor();
}
