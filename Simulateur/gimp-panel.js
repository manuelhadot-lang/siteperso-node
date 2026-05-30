// gimp-panel.js — panneau de réglage du générateur d'impulsions GImp
import { saveState } from './state.js';
import { draw, resizeCanvas } from './renderer.js';

let activeGimp = null;

const panel = () => document.getElementById('gimp-panel');
const titleEl = () => document.getElementById('gimp-panel-title');
const voltageEl = () => document.getElementById('gimp-voltage');
const freqEl = () => document.getElementById('gimp-freq');
const dutyEl = () => document.getElementById('gimp-duty');

export function isGimpPanelOpen() {
    const p = panel();
    return p && !p.classList.contains('hidden');
}

export function getGimpPanelHeight() {
    const p = panel();
    return isGimpPanelOpen() && p ? p.offsetHeight : 0;
}

export function getActiveGimp() {
    return activeGimp;
}

function syncFieldsFromComponent(comp) {
    if (!comp) return;
    if (titleEl()) titleEl().textContent = `${comp.label} — Générateur d'impulsions`;
    if (voltageEl()) voltageEl().value = String(comp.voltageRail ?? 5);
    if (freqEl()) freqEl().value = String(comp.frequency ?? 1000);
    if (dutyEl()) dutyEl().value = String(comp.dutyCycle ?? 10);
}

function applyFieldsToComponent() {
    if (!activeGimp) return;
    activeGimp.voltageRail = parseFloat(voltageEl()?.value) || 5;
    activeGimp.frequency = Math.max(0.1, parseFloat(freqEl()?.value) || 1000);
    activeGimp.dutyCycle = Math.min(99, Math.max(1, parseFloat(dutyEl()?.value) || 10));
    draw();
}

export function openGimpPanel(comp) {
    if (!comp || comp.type !== 'gimp') return;
    activeGimp = comp;
    syncFieldsFromComponent(comp);
    panel()?.classList.remove('hidden');
    resizeCanvas();
}

export function closeGimpPanel() {
    activeGimp = null;
    panel()?.classList.add('hidden');
    resizeCanvas();
}

export function onGimpRemoved(comp) {
    if (activeGimp === comp) closeGimpPanel();
}

export function formatGimpLabel(comp) {
    const v = comp.voltageRail ?? 5;
    const f = comp.frequency ?? 1000;
    const d = comp.dutyCycle ?? 10;
    const fStr = f >= 1000 && f % 1000 === 0 ? `${f / 1000}kHz` : `${f}Hz`;
    return `0-${v}V ${fStr} ${d}%`;
}

export function initGimpPanel() {
    document.getElementById('gimp-panel-close')?.addEventListener('click', closeGimpPanel);

    const onEdit = () => {
        if (!activeGimp) return;
        saveState();
        applyFieldsToComponent();
    };

    voltageEl()?.addEventListener('change', onEdit);
    freqEl()?.addEventListener('change', onEdit);
    dutyEl()?.addEventListener('change', onEdit);
}
