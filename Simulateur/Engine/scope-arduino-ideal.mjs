/**
 * Oscilloscope : signaux idéaux 0/5 V depuis GPIO Arduino (comme LED / voltmètre).
 */

import { reachableJonctions } from "./hc90-cascade.mjs";
import {
    applyArduinoSketchToComponent,
    resolveArduinoPinLevelAt,
    sketchHasLoop,
    createArduinoRuntime,
    stepArduinoRuntime,
    arduinoRuntimeLevels,
} from "./arduino-sketch-parse.mjs";
import {
    buildUartScopeModel,
    uartScopeBitAt,
    sketchUsesSerial,
    uartCharDurationSec,
    uartSketchLoopPeriodMs,
} from "./arduino-uart-wave.mjs";

const uartModelCache = new WeakMap();

function pinHasSketchTiming(uno, pinLabel) {
    if (uno?.pinPulses?.[pinLabel]) return true;
    if (Array.isArray(uno?.pinPhases) && uno.pinPhases.length >= 2) {
        return uno.pinPhases.some((ph) => Object.prototype.hasOwnProperty.call(ph.levels || {}, pinLabel));
    }
    return false;
}

function isUartTxPin(uno, pinLabel) {
    return pinLabel === "D1" && sketchUsesSerial(uno?.sketch || "");
}

function getUartScopeModel(uno) {
    const sketch = uno?.sketch || "";
    const cached = uartModelCache.get(uno);
    if (cached && cached.sketch === sketch) return cached;
    const model = { sketch, ...buildUartScopeModel(uno) };
    uartModelCache.set(uno, model);
    return model;
}

/** Période (s) du signal sur une broche, si connue depuis le sketch. */
export function arduinoPinPeriodSec(uno, pinLabel) {
    if (!uno || !pinLabel) return 0;
    if (isUartTxPin(uno, pinLabel)) {
        const model = getUartScopeModel(uno);
        if (model.loopPeriodMs > 0) return model.loopPeriodMs / 1000;
        if (model.baud > 0) return uartCharDurationSec(model.baud) * 4;
    }
    const pulse = uno.pinPulses?.[pinLabel];
    if (pulse?.highSec > 0 && pulse?.lowSec > 0) {
        return pulse.highSec + pulse.lowSec;
    }
    if (Array.isArray(uno.pinPhases) && uno.pinPhases.length >= 2) {
        const usesPin = uno.pinPhases.some((ph) =>
            Object.prototype.hasOwnProperty.call(ph.levels || {}, pinLabel)
        );
        if (usesPin) {
            const totalMs = uno.pinPhases.reduce((s, p) => s + (p.durationMs || 0), 0);
            if (totalMs > 0) return totalMs / 1000;
        }
    }
    return 0;
}

/**
 * UNO en sortie câblé sur CH1 ou CH2 de l'oscilloscope.
 * @param {'CH1'|'CH2'} channelSuffix
 */
export function findArduinoDriveForScopeChannel(
    oscLabel,
    channelSuffix,
    components,
    wires,
    autoJunctions = []
) {
    const net = reachableJonctions(`${oscLabel}_${channelSuffix}`, wires, autoJunctions);
    for (const comp of components) {
        if (comp.type !== "arduino_uno") continue;
        applyArduinoSketchToComponent(comp);
        for (const jid of net) {
            if (!jid.startsWith(`${comp.label}_`)) continue;
            const pinLabel = jid.slice(comp.label.length + 1);
            if (!/^D\d+$|^A\d+$/.test(pinLabel)) continue;
            if (isUartTxPin(comp, pinLabel)) {
                return { uno: comp, pinLabel, uart: true };
            }
            if (comp.pinModes?.[pinLabel] === "OUTPUT") {
                return { uno: comp, pinLabel, uart: false };
            }
        }
    }
    return null;
}

function runtimePinLevelAt(uno, pinLabel, tSec, inputs = {}) {
    const rt = createArduinoRuntime(uno);
    stepArduinoRuntime(rt, Math.max(0, tSec) * 1000, inputs);
    const lv = arduinoRuntimeLevels(rt)[pinLabel];
    return lv === 1 || lv === "1" || lv === true ? 1 : 0;
}

function synthesizeUartScopeTrace(uno, windowSec, timeOffsetSec = 0) {
    const model = getUartScopeModel(uno);
    if (!model.schedule?.length || !model.baud) return [];
    const samplesPerBit = 4;
    const n = Math.max(
        128,
        Math.min(4000, Math.ceil(windowSec * model.baud * samplesPerBit))
    );
    const points = [];
    for (let i = 0; i < n; i++) {
        const frac = n > 1 ? i / (n - 1) : 0;
        const tScreenSec = frac * windowSec;
        const tMs = timeOffsetSec * 1000 + tScreenSec * 1000;
        const bit = uartScopeBitAt(model, tMs);
        points.push({ t: tScreenSec, v: bit ? 5 : 0 });
    }
    return points;
}

/**
 * Courbe numérique 0/5 V.
 * Signaux périodiques (delay / blink / UART) : fenêtre verrouillée sur la phase.
 */
export function synthesizeArduinoScopeTrace(uno, pinLabel, windowSec, elapsedSec, inputs = {}, timeOffsetSec = 0) {
    if (!uno || !pinLabel || windowSec <= 0) return [];

    if (isUartTxPin(uno, pinLabel)) {
        return synthesizeUartScopeTrace(uno, windowSec, timeOffsetSec);
    }

    const period = arduinoPinPeriodSec(uno, pinLabel);
    const synced = period > 0;
    const useRuntime = sketchHasLoop(uno.sketch || "") && !pinHasSketchTiming(uno, pinLabel);
    const n = Math.max(64, Math.min(800, Math.ceil(windowSec * 4000)));

    const points = [];
    for (let i = 0; i < n; i++) {
        const frac = n > 1 ? i / (n - 1) : 0;
        const tScreen = frac * windowSec;
        let tAbs;
        if (synced) {
            tAbs = ((timeOffsetSec + tScreen) % period + period) % period;
        } else {
            const tEnd = Math.max(0, elapsedSec) + timeOffsetSec;
            tAbs = Math.max(0, tEnd - windowSec) + tScreen;
        }
        const lv = useRuntime
            ? runtimePinLevelAt(uno, pinLabel, tAbs, inputs)
            : resolveArduinoPinLevelAt(uno, pinLabel, tAbs);
        points.push({ t: tScreen, v: lv ? 5 : 0 });
    }
    return points;
}

