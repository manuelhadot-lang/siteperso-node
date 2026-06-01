// scope-animation.js — affichage des courbes CH1/CH2 sur l'oscilloscope
export const SCOPE_H_DIVS = 8;
export const SCOPE_V_DIVS = 8;

let scopePlots = {};
let rafId = null;
let redraw = () => {};
let popupRedraw = () => {};

export function bindScopeAnimationRedraw(fn) {
    redraw = typeof fn === 'function' ? fn : () => {};
}

export function bindScopePopupRedraw(fn) {
    popupRedraw = typeof fn === 'function' ? fn : () => {};
}

export function startScopeAnimation(plots) {
    stopScopeAnimation();
    scopePlots = plots && typeof plots === 'object' ? plots : {};
    if (!Object.keys(scopePlots).length) return;
    const tick = () => {
        redraw();
        popupRedraw();
        rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);
}

export function stopScopeAnimation() {
    if (rafId != null) cancelAnimationFrame(rafId);
    rafId = null;
    scopePlots = {};
}

export function hasScopeAnimation() {
    return rafId != null && Object.keys(scopePlots).length > 0;
}

function sampleChannelWindow(channel, windowSec) {
    if (!channel?.time?.length || !channel?.voltage?.length) return [];
    const tEnd = channel.time[channel.time.length - 1];
    const tStart = Math.max(channel.time[0], tEnd - windowSec);
    const out = [];
    for (let i = 0; i < channel.time.length; i++) {
        const t = channel.time[i];
        if (t < tStart) continue;
        const v = channel.voltage[i];
        if (Number.isFinite(t) && Number.isFinite(v)) out.push({ t: t - tStart, v });
    }
    return out;
}

/**
 * Fenêtre temporelle + échantillons pour les deux voies (superposées à l'affichage).
 * @param {{ label: string; timeDivSec?: number; ch1VoltsPerDiv?: number; ch2VoltsPerDiv?: number }} comp
 */
export function getScopeTraceWindow(comp) {
    const plot = scopePlots[comp.label];
    if (!plot) return null;
    const timeDiv = comp.timeDivSec > 0 ? comp.timeDivSec : 1e-3;
    const windowSec = timeDiv * SCOPE_H_DIVS;
    return {
        ch1: sampleChannelWindow(plot.ch1, windowSec),
        ch2: sampleChannelWindow(plot.ch2, windowSec),
        windowSec,
        timeDiv,
        ch1Vdiv: comp.ch1VoltsPerDiv > 0 ? comp.ch1VoltsPerDiv : 1,
        ch2Vdiv: comp.ch2VoltsPerDiv > 0 ? comp.ch2VoltsPerDiv : 1,
        ch1PosDiv: Number.isFinite(comp.ch1PositionDiv) ? comp.ch1PositionDiv : 0,
        ch2PosDiv: Number.isFinite(comp.ch2PositionDiv) ? comp.ch2PositionDiv : 0,
    };
}
