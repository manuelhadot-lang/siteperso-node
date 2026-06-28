// scope-animation.js — affichage des courbes CH1/CH2 sur l'oscilloscope
import { circuit, flags } from './state.js';
import { getSimulationElapsedSec } from './led-animation.js';
import {
    findArduinoDriveForScopeChannel,
    synthesizeArduinoScopeTrace,
} from './Engine/scope-arduino-ideal.mjs';
import {
    findAcGeneratorDriveForScopeChannel,
    synthesizeAcGeneratorScopeTrace,
    shouldAnimateGsinScope,
} from './Engine/scope-gsin-ideal.mjs';
import {
    findRcFilterPreviewForScope,
    findLm386OutputPreviewForScope,
    synthesizeFilteredAcScopeTrace,
    synthesizeAmplifiedAcScopeTrace,
} from './Engine/scope-filter-ideal.mjs';

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

function hasGsinScopeChannels() {
    return shouldAnimateGsinScope(circuit.components);
}

function hasLiveScopeSources() {
    return hasArduinoScopeChannels() || hasGsinScopeChannels();
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
    if (scopeAnimStartMs > 0) return (performance.now() - scopeAnimStartMs) / 1000;
    const ledElapsed = getSimulationElapsedSec();
    if (ledElapsed > 0) return ledElapsed;
    return 0;
}

export function startScopeAnimation(plots, opts = {}) {
    const keepClock = opts.keepClock === true && scopeAnimStartMs > 0;
    stopScopeAnimation({ keepClock });
    scopePlots = plots && typeof plots === 'object' ? plots : {};
    if (!Object.keys(scopePlots).length && !hasLiveScopeSources()) return;
    if (!keepClock) scopeAnimStartMs = performance.now();
    const tick = () => {
        popupRedraw();
        redraw();
        rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);
}

export function stopScopeAnimation(opts = {}) {
    if (rafId != null) cancelAnimationFrame(rafId);
    rafId = null;
    scopePlots = {};
    if (opts.keepClock !== true) scopeAnimStartMs = 0;
}

export function hasScopeAnimation() {
    return rafId != null && (Object.keys(scopePlots).length > 0 || hasLiveScopeSources());
}

function detectChannelPeriodSec(channel, threshold) {
    const time = channel?.time;
    const voltage = channel?.voltage;
    if (!time?.length || !voltage?.length) return 0;
    let peak = 0;
    for (const v of voltage) {
        const a = Math.abs(v);
        if (a > peak) peak = a;
    }
    const thr = Number.isFinite(threshold) ? threshold : Math.max(0.02, peak * 0.35);
    const rising = [];
    for (let i = 1; i < voltage.length; i++) {
        if (voltage[i] > thr && voltage[i - 1] <= thr) rising.push(time[i]);
    }
    if (rising.length >= 2) return rising[1] - rising[0];
    let toggles = 0;
    for (let i = 1; i < voltage.length; i++) {
        if ((voltage[i] > thr) !== (voltage[i - 1] > thr)) toggles++;
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
        const anchor = Number.isFinite(options.syncAnchorSec)
            ? options.syncAnchorSec
            : channel.time[0];
        const n = Math.max(64, Math.min(800, Math.ceil(windowSec * 4000)));
        const out = [];
        for (let i = 0; i < n; i++) {
            const tScreen = (i / (n - 1)) * windowSec;
            const tPhase = ((timeOffsetSec + tScreen) % period + period) % period;
            const tSample = anchor + tPhase;
            const v = interpolateChannelVoltage(channel, tSample);
            if (Number.isFinite(v)) out.push({ t: tScreen, v });
        }
        return out;
    }

    const dataStart = channel.time[0];
    const dataEnd = channel.time[channel.time.length - 1];
    const scroll = Number.isFinite(options.scrollSec) ? options.scrollSec : 0;
    // Bord droit qui suit le temps réel sans jamais dépasser les données simulées.
    const tEnd = Math.min(dataEnd, dataStart + windowSec + scroll) + timeOffsetSec;
    const tStart = Math.max(dataStart, tEnd - windowSec);
    const out = [];
    for (let i = 0; i < channel.time.length; i++) {
        const t = channel.time[i];
        if (t < tStart) continue;
        if (t > tEnd) break;
        const v = channel.voltage[i];
        if (Number.isFinite(t) && Number.isFinite(v)) out.push({ t: t - tStart, v });
    }
    return out;
}

/** Fenêtre SPICE centrée sur tCenter — courbe continue, sans repli de phase. */
function sampleChannelAtTime(channel, windowSec, tCenterSec, timeOffsetSec = 0) {
    if (!channel?.time?.length || !channel?.voltage?.length || windowSec <= 0) return [];
    const tMin = channel.time[0];
    const tMax = channel.time[channel.time.length - 1];
    const tEnd = Math.min(tMax, Math.max(tMin, tCenterSec + timeOffsetSec));
    const tStart = Math.max(tMin, tEnd - windowSec);
    const span = tEnd - tStart;
    if (!(span > 0)) return [];
    const n = Math.max(128, Math.min(800, Math.ceil(span * 4000)));
    const out = [];
    for (let i = 0; i < n; i++) {
        const t = tStart + (i / (n - 1)) * span;
        const v = interpolateChannelVoltage(channel, t);
        if (Number.isFinite(v)) out.push({ t: (i / (n - 1)) * windowSec, v });
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
    const syncOffsetSec = (Number.isFinite(comp.syncOffsetDiv) ? comp.syncOffsetDiv : 0) * timeDiv;
    const elapsed = getScopeElapsedSec();
    const plot = scopePlots[comp.label];

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
    const ch1Gsin = findAcGeneratorDriveForScopeChannel(
        comp.label,
        'CH1',
        circuit.components,
        circuit.wires,
        circuit.autoJunctions
    );
    const ch2Gsin = findAcGeneratorDriveForScopeChannel(
        comp.label,
        'CH2',
        circuit.components,
        circuit.wires,
        circuit.autoJunctions
    );

    const tuningLabel = flags.isSimulating && flags.sourcePanelTuning ? flags.tuningSourceLabel : null;
    const tunedSource =
        tuningLabel != null
            ? circuit.components.find(
                  (c) => c.label === tuningLabel && (c.type === 'gsin' || c.type === 'gsqr')
              )
            : null;

    function spiceSampleOpts(channel) {
        const tLast = channel.time[channel.time.length - 1];
        const dataSpan = tLast - channel.time[0];
        if (dataSpan >= windowSec * 1.2) {
            return {
                timeOffsetSec,
                synced: false,
                scrollSec: Math.max(0, dataSpan - windowSec),
            };
        }
        const period = detectChannelPeriodSec(channel);
        if (period > 0) {
            return {
                timeOffsetSec,
                synced: true,
                periodSec: period,
                syncAnchorSec: Math.max(channel.time[0], tLast - 3 * period),
            };
        }
        return {
            timeOffsetSec,
            synced: false,
            scrollSec: Math.min(elapsed, Math.max(0, tLast - windowSec)),
        };
    }

    function sampleSpiceChannel(channel) {
        return sampleChannelWindow(channel, windowSec, spiceSampleOpts(channel));
    }

    function preferLiveAcTrace(acGen) {
        return tuningLabel && acGen && acGen.label === tuningLabel;
    }

    function acScopeTrace(acGen) {
        return synthesizeAcGeneratorScopeTrace(acGen, windowSec, elapsed, timeOffsetSec, syncOffsetSec);
    }

    function channelPeakToPeak(channel) {
        if (!channel?.voltage?.length) return 0;
        let min = Infinity;
        let max = -Infinity;
        for (const v of channel.voltage) {
            if (!Number.isFinite(v)) continue;
            if (v < min) min = v;
            if (v > max) max = v;
        }
        return Number.isFinite(min) && Number.isFinite(max) ? max - min : 0;
    }

    function pickChannelTrace({ arduinoDrive, spiceChannel, acGen, channelSuffix }) {
        if (arduinoDrive) {
            return synthesizeArduinoScopeTrace(
                arduinoDrive.uno,
                arduinoDrive.pinLabel,
                windowSec,
                elapsed,
                {},
                timeOffsetSec
            );
        }

        const lm386Preview = findLm386OutputPreviewForScope(
            comp.label,
            channelSuffix,
            circuit.components,
            circuit.wires,
            circuit.autoJunctions
        );

        if (preferLiveAcTrace(acGen)) return acScopeTrace(acGen);

        if (tuningLabel && lm386Preview) {
            return synthesizeAmplifiedAcScopeTrace(
                lm386Preview.sourceComp,
                lm386Preview.opampChain,
                windowSec,
                elapsed,
                timeOffsetSec,
                syncOffsetSec
            );
        }

        if (tuningLabel && tunedSource) {
            const filterPreview = findRcFilterPreviewForScope(
                comp.label,
                channelSuffix,
                tunedSource,
                circuit.components,
                circuit.wires,
                circuit.autoJunctions
            );
            if (filterPreview) {
                return synthesizeFilteredAcScopeTrace(
                    tunedSource,
                    filterPreview,
                    windowSec,
                    elapsed,
                    timeOffsetSec,
                    syncOffsetSec
                );
            }
        }

        if (!tuningLabel && spiceChannel?.voltage?.length && channelPeakToPeak(spiceChannel) > 1e-3) {
            return sampleSpiceChannel(spiceChannel);
        }

        if (lm386Preview) {
            return synthesizeAmplifiedAcScopeTrace(
                lm386Preview.sourceComp,
                lm386Preview.opampChain,
                windowSec,
                elapsed,
                timeOffsetSec,
                syncOffsetSec
            );
        }

        if (spiceChannel?.voltage?.length && channelPeakToPeak(spiceChannel) > 1e-3) {
            return sampleSpiceChannel(spiceChannel);
        }
        if (spiceChannel?.voltage?.length) return sampleSpiceChannel(spiceChannel);
        if (acGen) return acScopeTrace(acGen);
        return [];
    }

    const ch1 = pickChannelTrace({
        arduinoDrive: ch1Drive,
        spiceChannel: plot?.ch1,
        acGen: ch1Gsin,
        channelSuffix: 'CH1',
    });
    const ch2 = pickChannelTrace({
        arduinoDrive: ch2Drive,
        spiceChannel: plot?.ch2,
        acGen: ch2Gsin,
        channelSuffix: 'CH2',
    });

    if (!ch1.length && !ch2.length) return null;

    const ch1Vdiv = comp.ch1VoltsPerDiv > 0 ? comp.ch1VoltsPerDiv : 1;
    const ch2Vdiv = comp.ch2VoltsPerDiv > 0 ? comp.ch2VoltsPerDiv : 1;

    return {
        ch1,
        ch2,
        windowSec,
        timeDiv,
        timeOffsetSec,
        ch1Vdiv,
        ch2Vdiv,
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
