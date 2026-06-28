// scope-panel.js — réglages oscilloscope (panneau bas)
import { flags, saveState } from './state.js';
import { draw, resizeCanvas } from './renderer.js';
import { getActiveSource, ensureActiveSourceFieldsVisible } from './source-panel.js';
import { openScopePopup, refreshScopePopup, closeScopePopup, isScopePopupOpen } from './scope-popup.js';

let activeScope = null;

const panel = () => document.getElementById('source-panel');
const titleEl = () => document.getElementById('source-panel-title');
const scopeFields = () => document.getElementById('scope-fields');
const timeDivEl = () => document.getElementById('scope-time-div');
const timePosEl = () => document.getElementById('scope-time-pos');
const syncOffsetEl = () => document.getElementById('scope-sync-offset');
const syncResetBtn = () => document.getElementById('scope-sync-reset');
const ch1VdivEl = () => document.getElementById('scope-ch1-vdiv');
const ch2VdivEl = () => document.getElementById('scope-ch2-vdiv');
const ch1PosEl = () => document.getElementById('scope-ch1-pos');
const ch2PosEl = () => document.getElementById('scope-ch2-pos');
const timePosVal = () => document.getElementById('scope-time-pos-val');
const syncOffsetVal = () => document.getElementById('scope-sync-offset-val');
const ch1PosVal = () => document.getElementById('scope-ch1-pos-val');
const ch2PosVal = () => document.getElementById('scope-ch2-pos-val');
const openWindowBtn = () => document.getElementById('scope-open-window');

function formatPosDiv(v) {
    const n = Number.isFinite(v) ? v : 0;
    const s = n.toFixed(1).replace('.', ',');
    return `${n >= 0 ? '+' : ''}${s} div`;
}

export function isScopePanelOpen() {
    return activeScope != null && panel() && !panel().classList.contains('hidden');
}

export function getScopePanelHeight() {
    return isScopePanelOpen() && panel() ? panel().offsetHeight : 0;
}

export function getActiveScope() {
    return activeScope;
}

export function refreshScopePanelFields() {
    if (activeScope) syncFieldsFromComponent(activeScope);
}

function sourcePanelSubtitle(comp) {
    if (!comp) return 'Source';
    if (comp.type === 'gimp') return "Générateur d'impulsions";
    if (comp.type === 'gsin') return 'Générateur sinusoïdal';
    if (comp.type === 'gsqr') return 'Générateur carré';
    return 'Source';
}

export function updateBottomPanelTitle() {
    if (!titleEl()) return;
    const parts = [];
    const src = getActiveSource();
    if (activeScope) parts.push(`${activeScope.label} — Oscilloscope`);
    if (src) parts.push(`${src.label} — ${sourcePanelSubtitle(src)}`);
    titleEl().textContent = parts.length ? parts.join(' · ') : 'Réglages';
}

function syncFieldsFromComponent(comp) {
    if (!comp) return;
    updateBottomPanelTitle();
    if (timeDivEl()) timeDivEl().value = String(comp.timeDivSec ?? 0.001);
    if (ch1VdivEl()) ch1VdivEl().value = String(comp.ch1VoltsPerDiv ?? 1);
    if (ch2VdivEl()) ch2VdivEl().value = String(comp.ch2VoltsPerDiv ?? 1);
    const tp = comp.timePositionDiv ?? 0;
    const syncOff = comp.syncOffsetDiv ?? 0;
    const p1 = comp.ch1PositionDiv ?? 0;
    const p2 = comp.ch2PositionDiv ?? 0;
    if (timePosEl()) timePosEl().value = String(tp);
    if (syncOffsetEl()) syncOffsetEl().value = String(syncOff);
    if (ch1PosEl()) ch1PosEl().value = String(p1);
    if (ch2PosEl()) ch2PosEl().value = String(p2);
    if (timePosVal()) timePosVal().textContent = formatPosDiv(tp);
    if (syncOffsetVal()) syncOffsetVal().textContent = formatPosDiv(syncOff);
    if (ch1PosVal()) ch1PosVal().textContent = formatPosDiv(p1);
    if (ch2PosVal()) ch2PosVal().textContent = formatPosDiv(p2);
    updateOpenWindowButton();
}

function updateOpenWindowButton() {
    const btn = openWindowBtn();
    if (!btn) return;
    btn.textContent = isScopePopupOpen() ? '📈 Fenêtre scope ouverte' : '📈 Afficher fenêtre scope';
}

function applyFieldsToComponent() {
    if (!activeScope) return;
    activeScope.timeDivSec = parseFloat(timeDivEl()?.value) || 0.001;
    activeScope.ch1VoltsPerDiv = parseFloat(ch1VdivEl()?.value) || 1;
    activeScope.ch2VoltsPerDiv = parseFloat(ch2VdivEl()?.value) || 1;
    activeScope.timePositionDiv = parseFloat(timePosEl()?.value) || 0;
    activeScope.syncOffsetDiv = parseFloat(syncOffsetEl()?.value) || 0;
    activeScope.ch1PositionDiv = parseFloat(ch1PosEl()?.value) || 0;
    activeScope.ch2PositionDiv = parseFloat(ch2PosEl()?.value) || 0;
    if (timePosVal()) timePosVal().textContent = formatPosDiv(activeScope.timePositionDiv);
    if (syncOffsetVal()) syncOffsetVal().textContent = formatPosDiv(activeScope.syncOffsetDiv);
    if (ch1PosVal()) ch1PosVal().textContent = formatPosDiv(activeScope.ch1PositionDiv);
    if (ch2PosVal()) ch2PosVal().textContent = formatPosDiv(activeScope.ch2PositionDiv);
    refreshScopePopup();
    draw();
}

export function ensureScopeFieldsVisible() {
    if (!activeScope) return;
    const sf = scopeFields();
    if (sf) {
        sf.classList.remove('hidden');
        sf.style.display = 'flex';
    }
    panel()?.classList.remove('hidden');
}

/** Ouvre le panneau bas (sans forcer la popup). */
export function openScopePanel(comp, { openPopup = false } = {}) {
    if (!comp || comp.type !== 'oscilloscope') return;
    activeScope = comp;
    syncFieldsFromComponent(comp);
    ensureScopeFieldsVisible();
    ensureActiveSourceFieldsVisible();
    if (openPopup) openScopePopup(comp);
    resizeCanvas();
}

export function closeScopePanelFully() {
    activeScope = null;
    const sf = scopeFields();
    if (sf) { sf.classList.add('hidden'); sf.style.display = 'none'; }
    closeScopePopup(true);
    if (!getActiveSource()) {
        panel()?.classList.add('hidden');
    } else {
        updateBottomPanelTitle();
    }
    resizeCanvas();
}

export function onScopePopupClosed() {
    updateOpenWindowButton();
}

export function onScopeRemoved(comp) {
    if (activeScope === comp) closeScopePanelFully();
}

export function initScopePanel() {
    const apply = () => {
        if (!activeScope) return;
        applyFieldsToComponent();
    };
    const onChange = () => {
        if (!activeScope) return;
        if (!flags.isSimulating) saveState();
        applyFieldsToComponent();
    };

    timeDivEl()?.addEventListener('change', onChange);
    timePosEl()?.addEventListener('change', onChange);
    syncOffsetEl()?.addEventListener('change', onChange);
    ch1VdivEl()?.addEventListener('change', onChange);
    ch2VdivEl()?.addEventListener('change', onChange);
    ch1PosEl()?.addEventListener('change', onChange);
    ch2PosEl()?.addEventListener('change', onChange);
    timeDivEl()?.addEventListener('input', apply);
    timePosEl()?.addEventListener('input', apply);
    syncOffsetEl()?.addEventListener('input', apply);
    ch1VdivEl()?.addEventListener('input', apply);
    ch2VdivEl()?.addEventListener('input', apply);
    ch1PosEl()?.addEventListener('input', apply);
    ch2PosEl()?.addEventListener('input', apply);

    syncResetBtn()?.addEventListener('click', () => {
        if (!activeScope) return;
        activeScope.syncOffsetDiv = 0;
        if (syncOffsetEl()) syncOffsetEl().value = '0';
        if (syncOffsetVal()) syncOffsetVal().textContent = formatPosDiv(0);
        if (!flags.isSimulating) saveState();
        refreshScopePopup();
        draw();
    });

    openWindowBtn()?.addEventListener('click', () => {
        if (!activeScope) return;
        if (isScopePopupOpen()) {
            closeScopePopup();
        } else {
            openScopePopup(activeScope);
        }
        updateOpenWindowButton();
    });
}
