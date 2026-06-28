// source-panel.js — panneau de réglage GImp et générateurs
import { flags, saveState } from './state.js';
import { draw, resizeCanvas } from './renderer.js';
import { requestLiveSimulation } from './simulation.js';
import { ensureScopeFieldsVisible, updateBottomPanelTitle } from './scope-panel.js';
import { refreshScopePopup } from './scope-popup.js';
import { syncSpeakerAudioLive } from './speaker-audio.js';

let activeSource = null;

const panel = () => document.getElementById('source-panel');
const titleEl = () => document.getElementById('source-panel-title');
const gimpFields = () => document.getElementById('gimp-fields');
const gsinFields = () => document.getElementById('gsin-fields');
const gsqrFields = () => document.getElementById('gsqr-fields');

const gimpVoltageEl = () => document.getElementById('gimp-voltage');
const gimpFreqEl = () => document.getElementById('gimp-freq');
const gimpDutyEl = () => document.getElementById('gimp-duty');
const gimpClockPresetEl = () => document.getElementById('gimp-clock-preset');

const gsinAmpEl = () => document.getElementById('gsin-amplitude');
const gsinFreqEl = () => document.getElementById('gsin-freq');
const gsinOffsetEl = () => document.getElementById('gsin-offset');

const gsqrAmpEl = () => document.getElementById('gsqr-amplitude');
const gsqrFreqEl = () => document.getElementById('gsqr-freq');
const gsqrOffsetEl = () => document.getElementById('gsqr-offset');

export function isSourcePanelOpen() {
    const p = panel();
    return p && !p.classList.contains('hidden');
}

export function getSourcePanelHeight() {
    const p = panel();
    return isSourcePanelOpen() && p ? p.offsetHeight : 0;
}

/** Hauteur du panneau bas (source ou oscilloscope). */
export function getBottomPanelHeight() {
    const p = panel();
    return p && !p.classList.contains('hidden') ? p.offsetHeight : 0;
}

export function clearSourceSelection() {
    activeSource = null;
    if (gimpFields()) {
        gimpFields().classList.add('hidden');
        gimpFields().style.display = 'none';
    }
    if (gsinFields()) {
        gsinFields().classList.add('hidden');
        gsinFields().style.display = 'none';
    }
    if (gsqrFields()) {
        gsqrFields().classList.add('hidden');
        gsqrFields().style.display = 'none';
    }
}

/** @deprecated compat */
export const isGimpPanelOpen = isSourcePanelOpen;
export const getGimpPanelHeight = getSourcePanelHeight;

export function getActiveSource() {
    return activeSource;
}

function showFieldsForType(type) {
    const g = gimpFields();
    const s = gsinFields();
    const q = gsqrFields();
    if (g) { g.classList.toggle('hidden', type !== 'gimp'); g.style.display = type === 'gimp' ? 'flex' : 'none'; }
    if (s) { s.classList.toggle('hidden', type !== 'gsin'); s.style.display = type === 'gsin' ? 'flex' : 'none'; }
    if (q) { q.classList.toggle('hidden', type !== 'gsqr'); q.style.display = type === 'gsqr' ? 'flex' : 'none'; }
}

function syncFieldsFromComponent(comp) {
    if (!comp) return;
    showFieldsForType(comp.type);
    if (comp.type === 'gimp') {
        if (gimpVoltageEl()) gimpVoltageEl().value = String(comp.voltageRail ?? 5);
        if (gimpFreqEl()) gimpFreqEl().value = String(comp.frequency ?? 1000);
        if (gimpDutyEl()) gimpDutyEl().value = String(comp.dutyCycle ?? 10);
    } else if (comp.type === 'gsin') {
        if (gsinAmpEl()) gsinAmpEl().value = String(comp.peakAmplitude ?? 5);
        if (gsinFreqEl()) gsinFreqEl().value = String(comp.frequency ?? 1000);
        if (gsinOffsetEl()) gsinOffsetEl().value = String(comp.offset ?? 0);
    } else if (comp.type === 'gsqr') {
        if (gsqrAmpEl()) gsqrAmpEl().value = String(comp.peakAmplitude ?? 5);
        if (gsqrFreqEl()) gsqrFreqEl().value = String(comp.frequency ?? 1000);
        if (gsqrOffsetEl()) gsqrOffsetEl().value = String(comp.offset ?? 0);
    }
}

export function flushSourcePanelFields() {
    if (!activeSource) return;
    applyFieldsToComponent();
}

function beginLiveTuning() {
    if (!activeSource) return;
    flags.sourcePanelTuning = true;
    flags.tuningSourceLabel = activeSource.label ?? null;
}

function endLiveTuning() {
    flags.sourcePanelTuning = false;
    flags.tuningSourceLabel = null;
}

function applyFieldsToComponent() {
    if (!activeSource) return;
    if (activeSource.type === 'gimp') {
        activeSource.voltageRail = parseFloat(gimpVoltageEl()?.value) || 5;
        activeSource.frequency = Math.max(1 / 86400, parseFloat(gimpFreqEl()?.value) || 2);
        activeSource.dutyCycle = Math.min(99, Math.max(1, parseFloat(gimpDutyEl()?.value) || 10));
    } else if (activeSource.type === 'gsin') {
        activeSource.peakAmplitude = Math.max(0, parseFloat(gsinAmpEl()?.value) || 5);
        activeSource.frequency = Math.max(0.1, parseFloat(gsinFreqEl()?.value) || 1000);
        activeSource.offset = parseFloat(gsinOffsetEl()?.value) || 0;
    } else if (activeSource.type === 'gsqr') {
        activeSource.peakAmplitude = Math.max(0, parseFloat(gsqrAmpEl()?.value) || 5);
        activeSource.frequency = Math.max(0.1, parseFloat(gsqrFreqEl()?.value) || 1000);
        activeSource.offset = parseFloat(gsqrOffsetEl()?.value) || 0;
    }
    draw();
    if (flags.isSimulating) {
        if (flags.sourcePanelTuning) {
            syncSpeakerAudioLive();
            refreshScopePopup();
        }
        requestLiveSimulation();
    }
}

function applyLive() {
    if (!activeSource) return;
    beginLiveTuning();
    applyFieldsToComponent();
}

export function ensureActiveSourceFieldsVisible() {
    if (!activeSource) return;
    showFieldsForType(activeSource.type);
    panel()?.classList.remove('hidden');
}

export function openSourcePanel(comp) {
    if (!comp || (comp.type !== 'gimp' && comp.type !== 'gsin' && comp.type !== 'gsqr')) return;
    activeSource = comp;
    syncFieldsFromComponent(comp);
    ensureScopeFieldsVisible();
    updateBottomPanelTitle();
    panel()?.classList.remove('hidden');
    resizeCanvas();
}

export function openGimpPanel(comp) {
    openSourcePanel(comp);
}

export function closeSourcePanel() {
    activeSource = null;
    flags.sourcePanelTuning = false;
    flags.tuningSourceLabel = null;
    if (gimpFields()) { gimpFields().classList.add('hidden'); gimpFields().style.display = 'none'; }
    if (gsinFields()) { gsinFields().classList.add('hidden'); gsinFields().style.display = 'none'; }
    if (gsqrFields()) { gsqrFields().classList.add('hidden'); gsqrFields().style.display = 'none'; }
    const sf = document.getElementById('scope-fields');
    if (!sf || sf.classList.contains('hidden')) {
        panel()?.classList.add('hidden');
    } else {
        updateBottomPanelTitle();
    }
    resizeCanvas();
}

export function closeGimpPanel() {
    closeSourcePanel();
}

export function onSourceRemoved(comp) {
    if (activeSource === comp) closeSourcePanel();
}

export function onGimpRemoved(comp) {
    onSourceRemoved(comp);
}

function formatFreqLabel(f) {
    if (!(f > 0)) return '?';
    if (f >= 1000 && f % 1000 === 0) return `${f / 1000} kHz`;
    if (f < 1) {
        const p = 1 / f;
        if (p >= 3600 && Math.abs(p % 3600) < 0.01) return `1/${p / 3600} h`;
        if (p >= 60 && Math.abs(p % 60) < 0.01) return `1/${p / 60} min`;
        return `${p >= 10 ? Math.round(p) : p.toFixed(2)} s`;
    }
    return `${f} Hz`;
}

export function formatGimpLabel(comp) {
    const v = comp.voltageRail ?? 5;
    const f = comp.frequency ?? 2;
    const d = comp.dutyCycle ?? 10;
    return `0-${v}V ${formatFreqLabel(f)} ${d}%`;
}

export function formatGsinLabel(comp) {
    const a = comp.peakAmplitude ?? 5;
    const f = comp.frequency ?? 1000;
    const o = comp.offset ?? 0;
    const fStr = f >= 1000 && f % 1000 === 0 ? `${f / 1000}kHz` : `${f}Hz`;
    return `${a}V crête ${fStr} offset ${o}V`;
}

export function initSourcePanel() {
    const apply = () => applyLive();

    const onChange = () => {
        if (!activeSource) return;
        if (flags.isSimulating) applyLive();
        else {
            applyFieldsToComponent();
            endLiveTuning();
            saveState();
        }
    };

    const onBlur = () => endLiveTuning();

    /** Flèches / spinner : `change` parfois sans `input` — appliquer après mise à jour du champ. */
    const onStepKey = (e) => {
        if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
        queueMicrotask(() => applyLive());
    };

    for (const el of [
        gimpVoltageEl(), gimpFreqEl(), gimpDutyEl(),
        gsinAmpEl(), gsinFreqEl(), gsinOffsetEl(),
        gsqrAmpEl(), gsqrFreqEl(), gsqrOffsetEl(),
    ]) {
        el?.addEventListener('blur', onBlur);
        el?.addEventListener('keydown', onStepKey);
    }

    gimpVoltageEl()?.addEventListener('change', onChange);
    gimpFreqEl()?.addEventListener('change', onChange);
    gimpDutyEl()?.addEventListener('change', onChange);
    gimpClockPresetEl()?.addEventListener('change', () => {
        const preset = gimpClockPresetEl()?.value;
        if (!preset || !activeSource || activeSource.type !== 'gimp') return;
        const f = parseFloat(preset);
        if (!Number.isFinite(f) || f <= 0) return;
        if (!flags.isSimulating) saveState();
        activeSource.frequency = f;
        if (gimpFreqEl()) gimpFreqEl().value = String(f);
        applyFieldsToComponent();
    });
    gsinAmpEl()?.addEventListener('change', onChange);
    gsinFreqEl()?.addEventListener('change', onChange);
    gsinOffsetEl()?.addEventListener('change', onChange);
    gsqrAmpEl()?.addEventListener('change', onChange);
    gsqrFreqEl()?.addEventListener('change', onChange);
    gsqrOffsetEl()?.addEventListener('change', onChange);

    gimpVoltageEl()?.addEventListener('input', apply);
    gimpFreqEl()?.addEventListener('input', apply);
    gimpDutyEl()?.addEventListener('input', apply);
    gsinAmpEl()?.addEventListener('input', apply);
    gsinFreqEl()?.addEventListener('input', apply);
    gsinOffsetEl()?.addEventListener('input', apply);
    gsqrAmpEl()?.addEventListener('input', apply);
    gsqrFreqEl()?.addEventListener('input', apply);
    gsqrOffsetEl()?.addEventListener('input', apply);
}

export function initGimpPanel() {
    initSourcePanel();
}
