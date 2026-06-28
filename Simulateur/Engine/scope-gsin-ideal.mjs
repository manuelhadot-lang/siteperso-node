/**
 * Oscilloscope : courbes idéales depuis le générateur Sin câblé sur CH1/CH2.
 */

import { reachableJonctions } from "./hc90-cascade.mjs";

/** Générateur Sin ou carré câblé sur CH1/CH2 de l'oscilloscope. */
export function findAcGeneratorDriveForScopeChannel(
    oscLabel,
    channelSuffix,
    components,
    wires,
    autoJunctions = []
) {
    const net = reachableJonctions(`${oscLabel}_${channelSuffix}`, wires, autoJunctions);
    for (const comp of components) {
        if (comp.type !== "gsin" && comp.type !== "gsqr") continue;
        if (net.has(`${comp.label}_out`)) return comp;
    }
    return null;
}

/** @deprecated alias */
export const findGsinDriveForScopeChannel = findAcGeneratorDriveForScopeChannel;

/** Au moins un Sin + oscilloscope (courbe idéale si le Sin n'est pas mesuré en SPICE). */
export function shouldAnimateGsinScope(components) {
    if (!components.some((c) => c.type === "oscilloscope")) return false;
    return components.some((c) => c.type === "gsin");
}

/** Tension (V) du générateur Sin ou carré à l'instant tAbs (s). */
export function acGeneratorVoltageAt(comp, tAbs) {
    const a = comp.peakAmplitude ?? 5;
    const o = comp.offset ?? 0;
    const f = comp.frequency ?? 440;
    const t = Math.max(0, tAbs);
    if (!(f > 0)) return o;
    if (comp.type === "gsqr") {
        const period = 1 / f;
        const phase = ((t % period) + period) % period;
        return o + (phase < period / 2 ? a : -a);
    }
    return o + a * Math.sin(2 * Math.PI * f * t);
}

/** @deprecated */
export const gsinVoltageAt = (comp, tAbs) => acGeneratorVoltageAt(comp, tAbs);

function acGeneratorPeriodSec(comp) {
    const f = comp?.frequency ?? 440;
    return f > 0 ? 1 / f : 0;
}

/** Courbe verrouillée sur la période du générateur (trigger implicite). */
export function synthesizeAcGeneratorScopeTrace(
    comp,
    windowSec,
    elapsedSec,
    timeOffsetSec = 0,
    syncOffsetSec = 0
) {
    if (!comp || windowSec <= 0) return [];
    const period = acGeneratorPeriodSec(comp);
    if (!(period > 0)) return [];

    const tRef = Math.max(0, elapsedSec);
    const phase = ((tRef % period) + period) % period;
    const anchor = tRef - phase;
    const n = Math.max(128, Math.min(1600, Math.ceil(windowSec * (40 / period))));
    const points = [];
    for (let i = 0; i < n; i++) {
        const tScreen = (i / (n - 1)) * windowSec;
        const tPhase = ((syncOffsetSec + timeOffsetSec + tScreen) % period + period) % period;
        points.push({ t: tScreen, v: acGeneratorVoltageAt(comp, anchor + tPhase) });
    }
    return points;
}

/** @deprecated */
export function synthesizeGsinScopeTrace(comp, windowSec, elapsedSec, timeOffsetSec = 0, syncOffsetSec = 0) {
    return synthesizeAcGeneratorScopeTrace(comp, windowSec, elapsedSec, timeOffsetSec, syncOffsetSec);
}
