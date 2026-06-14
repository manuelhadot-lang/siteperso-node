/** Panneau latéral droit — éditeur sketch Arduino + compilation arduino-cli. */
import { saveState, circuit } from './state.js';
import { draw, resizeCanvas } from './renderer.js';
import { DEFAULT_ARDUINO_SKETCH } from './arduino-uno-layout.js';
import { applyArduinoSketchToComponent } from './Engine/arduino-sketch-parse.mjs';
import { registerArduinoSketchSync, syncArduinoSketchesFromEditor } from './arduino-sketch-sync.js';
import { flags } from './state.js';

let activeBoard = null;

const panel = () => document.getElementById('arduino-panel');
const sketchEl = () => document.getElementById('arduino-sketch-input');
const logEl = () => document.getElementById('arduino-compile-log');
const titleEl = () => document.getElementById('arduino-panel-title');
const statusEl = () => document.getElementById('arduino-cli-status');

function resolveApiBaseUrl() {
    const { protocol, pathname, origin } = window.location;
    if (protocol === 'file:') return 'http://127.0.0.1:43721';
    if (pathname.startsWith('/Simulateur')) return origin;
    return origin;
}

export function isArduinoPanelOpen() {
    const p = panel();
    return p && !p.classList.contains('hidden');
}

export function getArduinoPanelWidth() {
    const p = panel();
    return isArduinoPanelOpen() && p ? p.offsetWidth : 0;
}

export function openArduinoEditor(comp) {
    if (!comp || comp.type !== 'arduino_uno') return;
    activeBoard = comp;
    if (titleEl()) titleEl().textContent = `${comp.label} — Arduino UNO`;
    if (sketchEl()) sketchEl().value = comp.sketch || DEFAULT_ARDUINO_SKETCH;
    applyArduinoSketchToComponent(comp);
    if (logEl()) logEl().textContent = comp.lastCompileLog || '';
    panel()?.classList.remove('hidden');
    refreshArduinoCliStatus();
    resizeCanvas();
}

export function closeArduinoEditor() {
    applySketchToBoard();
    panel()?.classList.add('hidden');
    activeBoard = null;
    resizeCanvas();
}

function applySketchToBoard() {
    if (!activeBoard || !sketchEl()) return;
    activeBoard.sketch = sketchEl().value;
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
    if (log) log.textContent = 'Compilation en cours…';
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
        if (data.ok) applyArduinoSketchToComponent(activeBoard);
        if (log) log.textContent = activeBoard.lastCompileLog;
        draw();
        if (!data.ok) {
            alert('Compilation échouée — voir le journal ci-dessous.');
        }
    } catch (err) {
        activeBoard.lastCompileOk = false;
        activeBoard.lastCompileLog = err?.message || String(err);
        if (log) log.textContent = activeBoard.lastCompileLog;
        draw();
    }
}

export function prepareArduinoForSimulation() {
    syncArduinoSketchesFromEditor();
    for (const comp of circuit.components) {
        if (comp.type === 'arduino_uno') applyArduinoSketchToComponent(comp);
    }
}
export function initArduinoEditor() {
    registerArduinoSketchSync(() => activeBoard);
    document.getElementById('arduino-panel-close')?.addEventListener('click', () => {
        saveState();
        closeArduinoEditor();
        draw();
    });
    document.getElementById('arduino-btn-compile')?.addEventListener('click', () => {
        compileActiveSketch();
    });
    sketchEl()?.addEventListener('keydown', (e) => {
        if (e.ctrlKey || e.metaKey) e.stopPropagation();
    });
    sketchEl()?.addEventListener('input', () => {
        applySketchToBoard();
        if (activeBoard) applyArduinoSketchToComponent(activeBoard);
        draw();
    });
    sketchEl()?.addEventListener('blur', () => {
        applySketchToBoard();
        applyArduinoSketchToComponent(activeBoard);
        saveState();
    });
}

export function onArduinoBoardRemoved(comp) {
    if (activeBoard && comp === activeBoard) closeArduinoEditor();
}
