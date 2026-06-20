// scope-animation.js — affichage des courbes CH1/CH2 sur l'oscilloscope
import { circuit } from './state.js';
import { getSimulationElapsedSec } from './led-animation.js';
import {
    findArduinoDriveForScopeChannel,
    synthesizeArduinoScopeTrace,
} from './Engine/scope-arduino-ideal.mjs';

export const SCOPE_H_DIVS = 8;
export const SCOPE_V_DIVS = 8;

let scopePlots = {};
let scopeAnimStartMs = 0;
let rafId = null;
let redraw = () => {};
let popupRedraw = () => {};

export function bindScopeAnimationRedraw(fn) {
    redraw = typeof fn === 'function' ? fn : () => {};
}

export function bindScopePopupRedraw(fn) {
    popupRedraw = typeof fn === 'function' ? fn : () => {};
}

function hasArduinoScopeChannels() {
    for (const comp of circuit.components) {
        if (comp.type !== 'oscilloscope') continue;
        if (
            findArduinoDriveForScopeChannel(
                comp.label,
                'CH1',
                circuit.components,
                circuit.wires,
                circuit.autoJunctions
            ) ||
            findArduinoDriveForScopeChannel(
                comp.label,
                'CH2',
                circuit.components,
                circuit.wires,
                circuit.autoJunctions
            )
        ) {
            return true;
        }
    }
    return false;
}

function getScopeElapsedSec() {
    const ledElapsed = getSimulationElapsedSec();
    if (ledElapsed > 0) return ledElapsed;
    if (scopeAnimStartMs > 0) return (performance.now() - scopeAnimStartMs) / 1000;
    return 0;
}

export function startScopeAnimation(plots) {
    stopScopeAnimation();
    scopePlots = plots && typeof plots === 'object' ? plots : {};
    if (!Object.keys(scopePlots).length && !hasArduinoScopeChannels()) return;
    scopeAnimStartMs = performance.now();
    const tick = () => {
        popupRedraw();
        rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);
}

export function stopScopeAnimation() {
    if (rafId != null) cancelAnimationFrame(rafId);
    rafId = null;
    scopePlots = {};
    scopeAnimStartMs = 0;
}

export function hasScopeAnimation() {
    return rafId != null && (Object.keys(scopePlots).length > 0 || hasArduinoScopeChannels());
}

function detectChannelPeriodSec(channel, threshold = 2.5) {
    const time = channel?.time;
    const voltage = channel?.voltage;
    if (!time?.length || !voltage?.length) return 0;
    const rising = [];
    for (let i = 1; i < voltage.length; i++) {
        if (voltage[i] > threshold && voltage[i - 1] <= threshold) rising.push(time[i]);
    }
    if (rising.length >= 2) return rising[1] - rising[0];
    let toggles = 0;
    for (let i = 1; i < voltage.length; i++) {
        if ((voltage[i] > threshold) !== (voltage[i - 1] > threshold)) toggles++;
    }
    const span = time[time.length - 1] - time[0];
    if (toggles >= 2 && span > 0) return (2 * span) / toggles;
    return 0;
}

function interpolateChannelVoltage(channel, tSec) {
    const time = channel?.time;
    const voltage = channel?.voltage;
    if (!time?.length || !voltage?.length) return 0;
    if (tSec <= time[0]) return voltage[0];
    const tLast = time[time.length - 1];
    if (tSec >= tLast) return voltage[voltage.length - 1];
    let lo = 0;
    let hi = time.length - 1;
    while (hi - lo > 1) {
        const mid = (lo + hi) >> 1;
        if (time[mid] <= tSec) lo = mid;
        else hi = mid;
    }
    const t0 = time[lo];
    const t1 = time[hi];
    const v0 = voltage[lo];
    const v1 = voltage[hi];
    if (t1 <= t0) return v0;
    return v0 + ((tSec - t0) / (t1 - t0)) * (v1 - v0);
}

/** Échantillons SPICE sur la dernière fenêtre, ou phase verrouillée si périodique. */
function sampleChannelWindow(channel, windowSec, options = {}) {
    if (!channel?.time?.length || !channel?.voltage?.length) return [];
    const timeOffsetSec = Number.isFinite(options.timeOffsetSec) ? options.timeOffsetSec : 0;
    const period = options.periodSec ?? detectChannelPeriodSec(channel);
    const synced = options.synced !== false && period > 0;

    if (synced) {
        const n = Math.max(64, Math.min(800, Math.ceil(windowSec * 4000)));
        const out = [];
        for (let i = 0; i < n; i++) {
            const tScreen = (i / (n - 1)) * windowSec;
            const tPhase = ((timeOffsetSec + tScreen) % period + period) % period;
            const tSample = channel.time[0] + tPhase;
            const v = interpolateChannelVoltage(channel, tSample);
            if (Number.isFinite(v)) out.push({ t: tScreen, v });
        }
        return out;
    }

    const tEnd = channel.time[channel.time.length - 1] + timeOffsetSec;
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
    const timeDiv = comp.timeDivSec > 0 ? comp.timeDivSec : 1e-3;
    const windowSec = timeDiv * SCOPE_H_DIVS;
    const timeOffsetSec = (Number.isFinite(comp.timePositionDiv) ? comp.timePositionDiv : 0) * timeDiv;
    const elapsed = getScopeElapsedSec();
    const plot = scopePlots[comp.label];
    const sampleOpts = { timeOffsetSec };

    const ch1Drive = findArduinoDriveForScopeChannel(
        comp.label,
        'CH1',
        circuit.components,
        circuit.wires,
        circuit.autoJunctions
    );
    const ch2Drive = findArduinoDriveForScopeChannel(
        comp.label,
        'CH2',
        circuit.components,
        circuit.wires,
        circuit.autoJunctions
    );

    const ch1 = ch1Drive
        ? synthesizeArduinoScopeTrace(ch1Drive.uno, ch1Drive.pinLabel, windowSec, elapsed, {}, timeOffsetSec)
        : plot
          ? sampleChannelWindow(plot.ch1, windowSec, sampleOpts)
          : [];
    const ch2 = ch2Drive
        ? synthesizeArduinoScopeTrace(ch2Drive.uno, ch2Drive.pinLabel, windowSec, elapsed, {}, timeOffsetSec)
        : plot
          ? sampleChannelWindow(plot.ch2, windowSec, sampleOpts)
          : [];

    if (!ch1.length && !ch2.length) return null;

    return {
        ch1,
        ch2,
        windowSec,
        timeDiv,
        timeOffsetSec,
        ch1Vdiv: comp.ch1VoltsPerDiv > 0 ? comp.ch1VoltsPerDiv : 1,
        ch2Vdiv: comp.ch2VoltsPerDiv > 0 ? comp.ch2VoltsPerDiv : 1,
        ch1PosDiv: Number.isFinite(comp.ch1PositionDiv) ? comp.ch1PositionDiv : 0,
        ch2PosDiv: Number.isFinite(comp.ch2PositionDiv) ? comp.ch2PositionDiv : 0,
        ch1Digital: !!ch1Drive || isLikelyDigitalTrace(ch1),
        ch2Digital: !!ch2Drive || isLikelyDigitalTrace(ch2),
    };
}

/** Signal logique 0/5 V (I²C, GPIO) — affichage en créneaux, pas en diagonales. */
export function isLikelyDigitalTrace(points) {
    if (!points || points.length < 8) return false;
    let min = Infinity;
    let max = -Infinity;
    for (const pt of points) {
        if (!Number.isFinite(pt.v)) continue;
        if (pt.v < min) min = pt.v;
        if (pt.v > max) max = pt.v;
    }
    const span = max - min;
    if (span < 1.5) return false;
    const margin = span * 0.12;
    let binary = 0;
    let n = 0;
    for (const pt of points) {
        if (!Number.isFinite(pt.v)) continue;
        n++;
        if (pt.v <= min + margin || pt.v >= max - margin) binary++;
    }
    return n >= 8 && binary / n > 0.88;
}

/**
 * Trace CH1/CH2 sur un canvas (mode créneau pour signaux numériques).
 */
export function drawScopeTrace(ctx, points, windowSec, vdiv, posDiv, x0, y0, w, h, color, options = {}) {
    if (!points?.length || windowSec <= 0 || vdiv <= 0) return;
    const pxPerDivY = h / SCOPE_V_DIVS;
    const midY = y0 + h / 2;
    const pos = Number.isFinite(posDiv) ? posDiv : 0;
    const digital = options.digital ?? isLikelyDigitalTrace(points);
    const toY = (v) => midY - ((v / vdiv) + pos) * pxPerDivY;
    const toX = (t) => x0 + (t / windowSec) * w;

    ctx.save();
    ctx.beginPath();
    ctx.rect(x0, y0, w, h);
    ctx.clip();
    ctx.strokeStyle = color;
    ctx.lineWidth = options.lineWidth ?? 2;
    ctx.lineJoin = 'miter';
    ctx.beginPath();

    let prevX = toX(points[0].t);
    let prevY = toY(points[0].v);
    ctx.moveTo(prevX, prevY);

    for (let i = 1; i < points.length; i++) {
        const x = toX(points[i].t);
        const y = toY(points[i].v);
        if (digital) {
            ctx.lineTo(x, prevY);
            ctx.lineTo(x, y);
        } else {
            ctx.lineTo(x, y);
        }
        prevX = x;
        prevY = y;
    }
    ctx.stroke();
    ctx.restore();
}
