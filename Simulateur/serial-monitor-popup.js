/** Moniteur série — UART hardware UNO (TX=D1, RX=D0). */
import { circuit, flags } from './state.js';
import {
    getUnoSerialOutput,
    sendUnoSerialInput,
    clearUnoSerialOutput,
    listUnoBoardLabels,
} from './led-animation.js';

let selectedLabel = null;
let floatX = 140;
let floatY = 90;
let dragging = false;
let dragOffX = 0;
let dragOffY = 0;
let lastOutputLen = 0;
let popupMounted = false;

const popupEl = () => document.getElementById('serial-monitor-popup');
const titleEl = () => document.getElementById('serial-monitor-title');
const outputEl = () => document.getElementById('serial-monitor-output');
const inputEl = () => document.getElementById('serial-monitor-input');
const boardSel = () => document.getElementById('serial-monitor-board');
const baudEl = () => document.getElementById('serial-monitor-baud');
const statusEl = () => document.getElementById('serial-monitor-status');
const dragHandle = () => document.getElementById('serial-monitor-drag-handle');

/** Déplace la popup à la racine du document (évite overflow / z-index des conteneurs). */
function ensurePopupMounted() {
    const el = popupEl();
    if (!el || popupMounted) return;
    if (el.parentElement !== document.body) {
        document.body.appendChild(el);
    }
    popupMounted = true;
}

function applyFloatPosition() {
    const el = popupEl();
    if (!el) return;
    el.style.left = `${floatX}px`;
    el.style.top = `${floatY}px`;
}

function syncFloatFromDom() {
    const el = popupEl();
    if (!el || el.classList.contains('hidden')) return;
    const rect = el.getBoundingClientRect();
    if (rect.width > 0) {
        floatX = rect.left;
        floatY = rect.top;
    }
}

function refreshBoardList() {
    const sel = boardSel();
    if (!sel) return;
    const labels = listUnoBoardLabels();
    const prev = selectedLabel || sel.value;
    sel.innerHTML = '';
    if (labels.length === 0) {
        const opt = document.createElement('option');
        opt.value = '';
        opt.textContent = '(aucune carte UNO)';
        sel.appendChild(opt);
        selectedLabel = null;
        return;
    }
    for (const label of labels) {
        const opt = document.createElement('option');
        opt.value = label;
        opt.textContent = label;
        sel.appendChild(opt);
    }
    if (labels.includes(prev)) {
        sel.value = prev;
        selectedLabel = prev;
    } else {
        sel.value = labels[0];
        selectedLabel = labels[0];
    }
}

function activeUno() {
    if (!selectedLabel) return null;
    return circuit.components.find((c) => c.type === 'arduino_uno' && c.label === selectedLabel) || null;
}

export function isSerialMonitorOpen() {
    const el = popupEl();
    return el && !el.classList.contains('hidden');
}

export function refreshSerialMonitor() {
    if (!isSerialMonitorOpen()) return;
    refreshBoardList();
    const out = outputEl();
    const uno = activeUno();
    if (!out) return;

    const text = selectedLabel ? getUnoSerialOutput(selectedLabel) : '';
    if (text.length !== lastOutputLen || out.textContent !== text) {
        out.textContent = text;
        lastOutputLen = text.length;
        out.scrollTop = out.scrollHeight;
    }

    if (baudEl()) {
        const baud = uno?.serialBaud;
        baudEl().textContent = baud ? `${baud} baud` : '— baud';
    }
    if (statusEl()) {
        if (!flags.isSimulating) {
            statusEl().textContent = 'Simulation arrêtée — lancez la simulation pour voir la sortie série.';
        } else if (!selectedLabel) {
            statusEl().textContent = 'Ajoutez une carte Arduino UNO au schéma.';
        } else if (!uno?.serialBegun) {
            statusEl().textContent = 'Appelez Serial.begin(9600) dans le sketch — aucun fil sur D0/D1 n’est nécessaire pour le moniteur.';
        } else {
            statusEl().textContent = 'Moniteur virtuel (pas de câblage D0/D1 requis). TX logiciel → affichage ci-dessus.';
        }
    }
}

export function openSerialMonitor(preferredLabel) {
    ensurePopupMounted();
    refreshBoardList();
    if (preferredLabel && listUnoBoardLabels().includes(preferredLabel)) {
        selectedLabel = preferredLabel;
        if (boardSel()) boardSel().value = preferredLabel;
    }
    if (titleEl()) {
        titleEl().textContent = selectedLabel
            ? `Moniteur série — ${selectedLabel}`
            : 'Moniteur série';
    }
    const el = popupEl();
    if (!el) return;
    el.classList.remove('hidden');
    syncFloatFromDom();
    clampFloatPosition();
    applyFloatPosition();
    lastOutputLen = -1;
    refreshSerialMonitor();
    inputEl()?.focus({ preventScroll: true });
}

export function closeSerialMonitor() {
    popupEl()?.classList.add('hidden');
    dragging = false;
}

function clampFloatPosition() {
    const el = popupEl();
    if (!el) return;
    const w = el.offsetWidth || 520;
    const h = el.offsetHeight || 360;
    floatX = Math.max(4, Math.min(window.innerWidth - w - 4, floatX));
    floatY = Math.max(52, Math.min(window.innerHeight - h - 4, floatY));
}

function sendInputLine() {
    const inp = inputEl();
    if (!inp || !selectedLabel) return;
    const line = inp.value;
    if (!line && line !== '') return;
    sendUnoSerialInput(selectedLabel, line + '\n');
    inp.value = '';
    refreshSerialMonitor();
}

export function initSerialMonitor() {
    ensurePopupMounted();

    document.getElementById('serial-monitor-close')?.addEventListener('click', (e) => {
        e.stopPropagation();
        closeSerialMonitor();
    });
    document.getElementById('serial-monitor-clear')?.addEventListener('click', () => {
        if (selectedLabel) clearUnoSerialOutput(selectedLabel);
        lastOutputLen = -1;
        refreshSerialMonitor();
    });
    document.getElementById('serial-monitor-send')?.addEventListener('click', sendInputLine);
    boardSel()?.addEventListener('change', () => {
        selectedLabel = boardSel()?.value || null;
        if (titleEl() && selectedLabel) titleEl().textContent = `Moniteur série — ${selectedLabel}`;
        lastOutputLen = -1;
        refreshSerialMonitor();
    });
    inputEl()?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendInputLine();
        }
    });

    const handle = dragHandle();
    handle?.addEventListener('pointerdown', (e) => {
        if (e.button !== 0) return;
        if (e.target.closest('#serial-monitor-close')) return;
        dragging = true;
        const rect = popupEl()?.getBoundingClientRect();
        if (rect) {
            dragOffX = e.clientX - rect.left;
            dragOffY = e.clientY - rect.top;
            floatX = rect.left;
            floatY = rect.top;
        }
        handle.setPointerCapture(e.pointerId);
        e.preventDefault();
    });
    handle?.addEventListener('pointermove', (e) => {
        if (!dragging) return;
        floatX = e.clientX - dragOffX;
        floatY = e.clientY - dragOffY;
        clampFloatPosition();
        applyFloatPosition();
    });
    const endDrag = () => {
        dragging = false;
    };
    handle?.addEventListener('pointerup', endDrag);
    handle?.addEventListener('pointercancel', endDrag);

    window.addEventListener('resize', () => {
        if (isSerialMonitorOpen()) {
            clampFloatPosition();
            applyFloatPosition();
        }
    });
}

