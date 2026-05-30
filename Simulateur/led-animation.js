// led-animation.js — clignotement LED à partir des courbes .tran (wrdata)
import { circuit } from './state.js';

/** Au-delà de cette fréquence, persistance rétinienne : LED fixe (courant moyen). */
export const PERSISTENCE_FREQ_HZ = 50;

const LED_ON_A = 1e-4;

let redraw = () => {};
let anim = {
    rafId: null,
    startMs: 0,
    plots: {},
    /** @type {Record<string, number>} période (s) propre à chaque LED */
    ledPeriods: {},
    /** @type {Record<string, boolean>} persistance rétinienne par LED */
    ledPersistence: {},
    /** @type {Record<string, number>} courant moyen si persistance */
    steadyCurrent: {},
};

export function bindLedAnimationRedraw(fn) {
    redraw = typeof fn === 'function' ? fn : () => {};
}

function getSourceFrequencyHz() {
    for (const comp of circuit.components) {
        if (comp.type === 'gimp' && comp.frequency > 0) return comp.frequency;
    }
    return 0;
}

function getGimpPeriodSec() {
    const hz = getSourceFrequencyHz();
    return hz > 0 ? 1 / hz : null;
}

function hasRippleCounter() {
    const ffTypes = new Set(['d_flipflop', 'jk_flipflop']);
    for (const comp of circuit.components) {
        if (!ffTypes.has(comp.type)) continue;
        const clkJon = `${comp.label}_CLK`;
        for (const w of circuit.wires) {
            const other = w.fromJonctionId === clkJon ? w.toJonctionId
                : w.toJonctionId === clkJon ? w.fromJonctionId : null;
            if (!other) continue;
            const m = /^([A-Za-z0-9_]+)_Q$/.exec(other);
            if (!m || m[1] === comp.label) continue;
            if (circuit.components.some((c) => ffTypes.has(c.type) && c.label === m[1])) return true;
        }
    }
    return false;
}

/** Instant stable dans la phase basse du GImp (ripple propagé). */
function getGimpStablePhase() {
    for (const comp of circuit.components) {
        if (comp.type === 'gimp') {
            const duty = Math.min(99, Math.max(1, comp.dutyCycle ?? 50));
            const lowStart = duty / 100;
            return lowStart + (1 - lowStart) * 0.5;
        }
    }
    return 0.75;
}

function sampleTimeSec(elapsed, ledPeriod) {
    if (hasRippleCounter()) {
        const master = getGimpPeriodSec() ?? ledPeriod;
        const phase = getGimpStablePhase();
        const tStable = Math.floor(elapsed / master) * master + master * phase;
        return tStable;
    }
    return plotTimeOrigin(elapsed, ledPeriod);
}

function plotTimeOrigin(elapsed, period) {
    return elapsed % period;
}

function fallbackPeriodSec(plots) {
    const freqHz = getSourceFrequencyHz();
    if (freqHz > 0) return 1 / freqHz;
    const plot = Object.values(plots)[0];
    if (plot?.time?.length > 1) {
        const span = plot.time[plot.time.length - 1] - plot.time[0];
        if (span > 0) return span;
    }
    return 1;
}

/** Période détectée dans le tracé SPICE (ex. diviseur par 2 → 2× l'horloge). */
function detectLedPeriodSec(plot) {
    const { time, current } = plot;
    if (!time?.length || !current?.length) return null;

    const rising = [];
    for (let i = 1; i < current.length; i++) {
        if (current[i] > LED_ON_A && current[i - 1] <= LED_ON_A) rising.push(time[i]);
    }
    if (rising.length >= 2) return rising[1] - rising[0];

    let toggles = 0;
    for (let i = 1; i < current.length; i++) {
        if ((current[i] > LED_ON_A) !== (current[i - 1] > LED_ON_A)) toggles++;
    }
    const span = time[time.length - 1] - time[0];
    if (toggles >= 2 && span > 0) return (2 * span) / toggles;
    return null;
}

function interpolatePlot(plot, tSec) {
    const { time, current } = plot;
    if (!time?.length) return 0;
    if (tSec <= time[0]) return current[0] ?? 0;
    const last = time.length - 1;
    if (tSec >= time[last]) return current[last] ?? 0;
    let lo = 0;
    let hi = last;
    while (hi - lo > 1) {
        const mid = (lo + hi) >> 1;
        if (time[mid] <= tSec) lo = mid;
        else hi = mid;
    }
    const t0 = time[lo];
    const t1 = time[hi];
    const i0 = current[lo] ?? 0;
    const i1 = current[hi] ?? 0;
    if (t1 <= t0) return i0;
    const f = (tSec - t0) / (t1 - t0);
    return i0 + f * (i1 - i0);
}

function averageCurrentOverPeriod(plot, periodSec) {
    const { time, current } = plot;
    if (!time?.length) return 0;
    const tEnd = time[0] + periodSec;
    let sum = 0;
    let count = 0;
    for (let i = 0; i < time.length; i++) {
        if (time[i] >= tEnd) break;
        sum += current[i] ?? 0;
        count++;
    }
    return count > 0 ? sum / count : 0;
}

function prepareLedTiming(plots) {
    const fallback = fallbackPeriodSec(plots);
    anim.ledPeriods = {};
    anim.ledPersistence = {};
    anim.steadyCurrent = {};

    for (const [id, plot] of Object.entries(plots)) {
        const period = detectLedPeriodSec(plot) ?? fallback;
        anim.ledPeriods[id] = period;
        const freqHz = period > 0 ? 1 / period : 0;
        if (freqHz > PERSISTENCE_FREQ_HZ) {
            anim.ledPersistence[id] = true;
            anim.steadyCurrent[id] = averageCurrentOverPeriod(plot, period);
        }
    }
}

export function getAnimatedLedCurrent(label) {
    const plot = anim.plots[label];
    if (!plot) return null;
    if (anim.ledPersistence[label]) {
        return anim.steadyCurrent[label] ?? 0;
    }
    const period = anim.ledPeriods[label] ?? 1;
    const elapsed = (performance.now() - anim.startMs) / 1000;
    const tSample = sampleTimeSec(elapsed, period);
    const plotSpan = plot.time[plot.time.length - 1] - plot.time[0];
    const tAbs = plot.time[0] + (plotSpan > 0 ? tSample % plotSpan : tSample);
    return interpolatePlot(plot, tAbs);
}

export function hasLedAnimation() {
    return anim.rafId != null && Object.keys(anim.plots).length > 0;
}

export function startLedAnimation(plots) {
    stopLedAnimation();
    if (!plots || !Object.keys(plots).length) return;

    anim.plots = plots;
    anim.startMs = performance.now();
    prepareLedTiming(plots);

    const needsFrameLoop = Object.keys(plots).some((id) => !anim.ledPersistence[id]);
    if (!needsFrameLoop) {
        redraw();
        return;
    }

    const tick = () => {
        redraw();
        anim.rafId = requestAnimationFrame(tick);
    };
    anim.rafId = requestAnimationFrame(tick);
}

export function stopLedAnimation() {
    if (anim.rafId != null) cancelAnimationFrame(anim.rafId);
    anim.rafId = null;
    anim.plots = {};
    anim.ledPeriods = {};
    anim.ledPersistence = {};
    anim.steadyCurrent = {};
}
