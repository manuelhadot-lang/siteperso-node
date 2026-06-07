// led-animation.js — clignotement LED à partir des courbes .tran (wrdata)
import { circuit } from './state.js';
import { bcdDigitToSeg7Segments, bcdFromQVoltages } from './Engine/bcd-seg7.mjs';
import {
    detectHc90Cascade,
    hc90LabelForSeg7,
    hc90TranSampleTimeSec,
    idealHc90BcdForLabel,
    isHc90MasterResetActive,
    shouldUseIdealHc90Counting,
} from './Engine/hc90-cascade.mjs';

/** Au-delà de cette fréquence, persistance rétinienne : LED fixe (courant moyen). */
export const PERSISTENCE_FREQ_HZ = 50;

const LED_ON_A = 1e-4;

/** Courant maxi recommandé pour une LED standard (au-delà → grillée). */
export const LED_MAX_SAFE_CURRENT_A = 0.02;

export function isLedOvercurrent(current) {
    return typeof current === 'number' && Number.isFinite(current) && Math.abs(current) > LED_MAX_SAFE_CURRENT_A;
}

let redraw = () => {};
const SEG7_NAMES = ['a', 'b', 'c', 'd', 'e', 'f', 'g'];
const SEG7_LIT_DELTA_V = 0.35;

let anim = {
    rafId: null,
    startMs: 0,
    plots: {},
    vmPlots: {},
    seg7Plots: {},
    /** @type {Record<string, { q: Array<{ time: number[]; voltage: number[]; vth?: number } | null>; span: number }>} */
    hc90QPlots: {},
    /** Dernier BCD valide 0–9 par HC90 (filtre états transitoires > 9). */
    hc90LastBcd: {},
    /** MR1·MR2 actifs (reset asynchrone) sur le circuit courant. */
    hc90MrActive: false,
    /** @type {Record<string, number>} période (s) propre à chaque LED */
    ledPeriods: {},
    vmPeriods: {},
    /** @type {Record<string, boolean>} persistance rétinienne par LED */
    ledPersistence: {},
    /** @type {Record<string, number>} courant moyen si persistance */
    steadyCurrent: {},
    /** @type {ReturnType<typeof detectHc90Cascade>|null} */
    hc90Cascade: null,
};

export function bindLedAnimationRedraw(fn) {
    redraw = typeof fn === 'function' ? fn : () => {};
}

function getSourceFrequencyHz() {
    for (const comp of circuit.components) {
        if ((comp.type === 'gimp' || comp.type === 'gsin' || comp.type === 'gsqr') && comp.frequency > 0) return comp.frequency;
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
            const mQ = /^([A-Za-z0-9_]+)_Q$/.exec(other);
            const mQb = /^([A-Za-z0-9_]+)_Qbar$/.exec(other);
            const prevLabel = (mQ || mQb)?.[1];
            if (!prevLabel || prevLabel === comp.label) continue;
            if (circuit.components.some((c) => ffTypes.has(c.type) && c.label === prevLabel)) return true;
        }
    }
    return false;
}

/** 74HC90 en mode décade : l’animation doit balayer le .tran, pas figer une phase d’horloge. */
function hasHc90DecadeCounter() {
    return circuit.components.some((c) => c.type === 'ic_74hc90');
}

function indexHc90QPlots(logicGateTranPlots) {
    const byComp = {};
    for (const [id, plot] of Object.entries(logicGateTranPlots || {})) {
        const m = /^(.+)_Q([0-3])$/.exec(id);
        if (!m || !plot?.time?.length) continue;
        const base = m[1];
        const qi = Number(m[2]);
        if (!byComp[base]) byComp[base] = { q: [null, null, null, null], span: 0 };
        byComp[base].q[qi] = plot;
        const span = plot.time[plot.time.length - 1] - plot.time[0];
        if (span > byComp[base].span) byComp[base].span = span;
    }
    return byComp;
}

function hc90TranSpanSec() {
    let max = 0;
    for (const pack of Object.values(anim.hc90QPlots)) {
        if (pack.span > max) max = pack.span;
    }
    return max;
}

/**
 * Temps simulé pour l’échantillon HC90 : 1 impulsion GImp = 1 pas de comptage (temps réel).
 * On lit la valeur stabilisée en fin de période d’horloge (comme les tests SPICE).
 */
/**
 * Synchronise l’horloge d’animation avec le reset MR :
 * - MR actif → affichage 0 ;
 * - MR relâché → repartir de t=0 (nouvelle .tran SPICE).
 */
function syncHc90MasterResetClock() {
    const mrActive = isHc90MasterResetActive(circuit.components, circuit.wires, circuit.autoJunctions);
    if (anim.hc90MrActive && !mrActive) {
        anim.startMs = performance.now();
        anim.hc90LastBcd = {};
    }
    anim.hc90MrActive = mrActive;
    return mrActive;
}

function hc90SampleTimeSec(elapsed, compLabel) {
    const plotSpan = hc90TranSpanSec() || anim.hc90QPlots[compLabel]?.span || 0;
    const clockPeriod = getGimpPeriodSec();
    if (plotSpan > 0 && clockPeriod > 0) {
        return hc90TranSampleTimeSec(elapsed, clockPeriod, plotSpan);
    }
    if (plotSpan > 0) return elapsed % plotSpan;
    return elapsed;
}

function sampleHc90Bcd(compLabel, tSec) {
    const pack = anim.hc90QPlots[compLabel];
    if (!pack?.q?.[0]?.time?.length) return null;
    const vth = pack.q[0].vth ?? 2.5;
    const qV = pack.q.map((plot) =>
        plot?.time?.length ? interpolateSeries(plot.time, plot.voltage, tSec) : 0
    );
    const raw = bcdFromQVoltages(qV, vth);
    if (raw > 9) {
        const last = anim.hc90LastBcd[compLabel];
        return last != null ? last : null;
    }
    anim.hc90LastBcd[compLabel] = raw;
    return raw;
}

/** Valeur BCD 0–9 animée pour un 74HC90 (comptage idéal ou courbes Q0…Q3 du .tran). */
export function getAnimatedHc90Bcd(compLabel) {
    if (!compLabel || !hasHc90DecadeCounter()) return null;
    if (syncHc90MasterResetClock()) return 0;
    const elapsed = (performance.now() - anim.startMs) / 1000;
    const clockPeriod = getGimpPeriodSec();
    const cascade = anim.hc90Cascade ?? detectHc90Cascade(circuit.components, circuit.wires, circuit.autoJunctions);
    if (shouldUseIdealHc90Counting(cascade, clockPeriod)) {
        const ideal = idealHc90BcdForLabel(compLabel, cascade, elapsed, clockPeriod);
        if (ideal != null) return ideal;
    }
    if (!anim.hc90QPlots[compLabel]) return null;
    return sampleHc90Bcd(compLabel, hc90SampleTimeSec(elapsed, compLabel));
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

function interpolateSeries(time, values, tSec) {
    if (!time?.length || !values?.length) return NaN;
    if (tSec <= time[0]) return values[0] ?? NaN;
    const last = time.length - 1;
    if (tSec >= time[last]) return values[last] ?? NaN;
    let lo = 0;
    let hi = last;
    while (hi - lo > 1) {
        const mid = (lo + hi) >> 1;
        if (time[mid] <= tSec) lo = mid;
        else hi = mid;
    }
    const t0 = time[lo];
    const t1 = time[hi];
    const v0 = values[lo];
    const v1 = values[hi];
    if (t1 <= t0) return v0;
    const f = (tSec - t0) / (t1 - t0);
    return v0 + f * (v1 - v0);
}

function seg7LitFromVoltages(segmentV, vCom) {
    const lit = {};
    const vc = Number.isFinite(vCom) ? vCom : 0;
    for (let i = 0; i < 7; i++) {
        const v = segmentV[i];
        lit[SEG7_NAMES[i]] = Number.isFinite(v) && v - vc >= SEG7_LIT_DELTA_V;
    }
    return lit;
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

function interpolateVoltagePlot(plot, tSec) {
    const { time, voltage } = plot;
    if (!time?.length) return 0;
    if (tSec <= time[0]) return voltage[0] ?? 0;
    const last = time.length - 1;
    if (tSec >= time[last]) return voltage[last] ?? 0;
    let lo = 0;
    let hi = last;
    while (hi - lo > 1) {
        const mid = (lo + hi) >> 1;
        if (time[mid] <= tSec) lo = mid;
        else hi = mid;
    }
    const t0 = time[lo];
    const t1 = time[hi];
    const v0 = voltage[lo] ?? 0;
    const v1 = voltage[hi] ?? 0;
    if (t1 <= t0) return v0;
    return v0 + ((tSec - t0) / (t1 - t0)) * (v1 - v0);
}

function detectPlotPeriodSec(time, values, threshold = 2.5) {
    if (!time?.length || !values?.length) return null;
    const rising = [];
    for (let i = 1; i < values.length; i++) {
        if (values[i] > threshold && values[i - 1] <= threshold) rising.push(time[i]);
    }
    if (rising.length >= 2) return rising[1] - rising[0];
    let toggles = 0;
    for (let i = 1; i < values.length; i++) {
        if ((values[i] > threshold) !== (values[i - 1] > threshold)) toggles++;
    }
    const span = time[time.length - 1] - time[0];
    if (toggles >= 2 && span > 0) return (2 * span) / toggles;
    return null;
}

function prepareVmTiming(vmPlots) {
    anim.vmPeriods = {};
    const fallback = fallbackPeriodSec({});
    for (const [id, plot] of Object.entries(vmPlots)) {
        anim.vmPeriods[id] = detectPlotPeriodSec(plot.time, plot.voltage) ?? fallback;
    }
}

/** Affichage voltmètre sur signaux logiques (0 / Vhi) — évite 1,6 V en transition. */
export function quantizeVoltmeterReading(v, samples) {
    if (typeof v !== 'number' || !Number.isFinite(v)) return v;
    const vals = Array.isArray(samples) ? samples.filter(Number.isFinite) : [];
    if (vals.length >= 4) {
        const maxV = Math.max(...vals);
        const minV = Math.min(...vals);
        if (maxV - minV > 1.5) {
            const vhi = maxV >= 3 ? maxV : 5;
            const vlo = minV <= 0.5 ? 0 : minV;
            return v >= vhi / 2 ? vhi : vlo;
        }
    }
    if (v >= 4) return Math.round(v * 10) / 10;
    if (v <= 0.5) return 0;
    return v;
}

export function getAnimatedVoltmeterVoltage(label) {
    const plot = anim.vmPlots[label];
    if (!plot?.time?.length) return null;
    const period = anim.vmPeriods[label] ?? 1;
    const elapsed = (performance.now() - anim.startMs) / 1000;
    // Temps réel : ne pas figer sur la phase stable des compteurs ripple (réservée aux LED).
    const tSample = plotTimeOrigin(elapsed, period);
    const plotSpan = plot.time[plot.time.length - 1] - plot.time[0];
    const tAbs = plot.time[0] + (plotSpan > 0 ? tSample % plotSpan : tSample);
    return quantizeVoltmeterReading(interpolateVoltagePlot(plot, tAbs), plot.voltage);
}

export function hasVoltmeterAnimation() {
    return Object.keys(anim.vmPlots).length > 0 && anim.rafId != null;
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

export function hasSeg7Animation() {
    return anim.rafId != null && Object.keys(anim.seg7Plots).length > 0;
}

/** Segments allumés à l'instant courant de la simulation live (.tran). */
export function getAnimatedSeg7Segments(label) {
    const plot = anim.seg7Plots[label];
    if (!plot?.time?.length) return null;
    if (syncHc90MasterResetClock()) return { segments: bcdDigitToSeg7Segments(0) };
    const hc90Label = hc90LabelForSeg7(label, circuit.components, circuit.wires, circuit.autoJunctions);
    if (hc90Label) {
        const bcd = getAnimatedHc90Bcd(hc90Label);
        if (bcd != null) return { segments: bcdDigitToSeg7Segments(bcd) };
    }
    const plotSpan = plot.time[plot.time.length - 1] - plot.time[0];
    const clockPeriod = getGimpPeriodSec() ?? 1;
    const elapsed = (performance.now() - anim.startMs) / 1000;
    const tSample =
        hasHc90DecadeCounter() && plotSpan > 0 && clockPeriod > 0
            ? hc90TranSampleTimeSec(elapsed, clockPeriod, plotSpan)
            : sampleTimeSec(elapsed, clockPeriod);
    const tAbs = plot.time[0] + (plotSpan > 0 ? tSample % plotSpan : tSample);
    const vCom = interpolateSeries(plot.time, plot.common, tAbs);
    const segmentV = SEG7_NAMES.map((n) => interpolateSeries(plot.time, plot.segments[n], tAbs));
    return { segments: seg7LitFromVoltages(segmentV, vCom) };
}

export function startLedAnimation(plots, vmPlots = {}, seg7Plots = {}, logicGateTranPlots = {}, opts = {}) {
    const mrActive = isHc90MasterResetActive(circuit.components, circuit.wires, circuit.autoJunctions);
    const mrReleased = anim.hc90MrActive && !mrActive;
    const savedStartMs = opts.keepClock === true && !mrReleased ? anim.startMs : 0;
    stopLedAnimation();
    const hasLeds = plots && Object.keys(plots).length > 0;
    const hasVm = vmPlots && Object.keys(vmPlots).length > 0;
    const hasSeg7 = seg7Plots && Object.keys(seg7Plots).length > 0;
    anim.hc90QPlots = indexHc90QPlots(logicGateTranPlots);
    anim.hc90Cascade = detectHc90Cascade(circuit.components, circuit.wires, circuit.autoJunctions);
    anim.hc90MrActive = mrActive;
    const hasHc90Anim = Object.keys(anim.hc90QPlots).length > 0;
    if (!hasLeds && !hasVm && !hasSeg7 && !hasHc90Anim) return;

    anim.plots = plots || {};
    anim.vmPlots = vmPlots || {};
    anim.seg7Plots = seg7Plots || {};
    anim.startMs = savedStartMs > 0 ? savedStartMs : performance.now();
    if (hasLeds) prepareLedTiming(plots);
    if (hasVm) prepareVmTiming(vmPlots);

    const needsFrameLoop =
        Object.keys(anim.plots).some((id) => !anim.ledPersistence[id]) ||
        hasVm ||
        hasSeg7 ||
        hasHc90Anim;
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

let smokeRafId = null;

export function startBurntLedSmokeLoop() {
    if (smokeRafId != null) return;
    const tick = () => {
        redraw();
        smokeRafId = requestAnimationFrame(tick);
    };
    smokeRafId = requestAnimationFrame(tick);
}

function stopBurntLedSmokeLoop() {
    if (smokeRafId != null) cancelAnimationFrame(smokeRafId);
    smokeRafId = null;
}

export function stopLedAnimation() {
    if (anim.rafId != null) cancelAnimationFrame(anim.rafId);
    anim.rafId = null;
    anim.plots = {};
    anim.vmPlots = {};
    anim.seg7Plots = {};
    anim.hc90QPlots = {};
    anim.hc90LastBcd = {};
    anim.hc90MrActive = false;
    anim.hc90Cascade = null;
    anim.ledPeriods = {};
    anim.vmPeriods = {};
    anim.ledPersistence = {};
    anim.steadyCurrent = {};
    stopBurntLedSmokeLoop();
}
