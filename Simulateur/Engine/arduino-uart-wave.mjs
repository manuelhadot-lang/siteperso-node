/**
 * Forme d'onde UART 8N1 (TX=D1) pour l'oscilloscope.
 */

import {
    createArduinoRuntime,
    stepArduinoRuntime,
    sketchHasLoop,
} from "./arduino-sketch-parse.mjs";

export function sketchUsesSerial(sketch) {
    return /\bSerial\.begin\s*\(/i.test(String(sketch || ""));
}

/** Bits 8N1 LSB-first : start 0, 8 data, stop 1. */
export function uartByteBits(byte) {
    const code = byte & 0xff;
    const bits = [0];
    for (let i = 0; i < 8; i++) bits.push((code >> i) & 1);
    bits.push(1);
    return bits;
}

/**
 * Niveau TX (0/1) à l'instant tMs dans une trame.
 * @param {Array<{ startMs: number, data: string }>} schedule
 */
export function uartTxBitAt(schedule, baud, tMs) {
    if (!schedule?.length || !baud || baud <= 0) return 1;
    const bitMs = 1000 / baud;
    for (const ev of schedule) {
        let cursor = ev.startMs;
        const data = String(ev.data || "");
        for (let i = 0; i < data.length; i++) {
            for (const bit of uartByteBits(data.charCodeAt(i))) {
                if (tMs >= cursor && tMs < cursor + bitMs) return bit;
                cursor += bitMs;
            }
        }
    }
    return 1;
}

/** Niveau TX avec période de boucle (affichage stable sur l'oscillo). */
export function uartTxBitAtLoop(schedule, baud, tMs, loopPeriodMs) {
    if (!loopPeriodMs || loopPeriodMs <= 0) return uartTxBitAt(schedule, baud, tMs);
    const tMod = ((tMs % loopPeriodMs) + loopPeriodMs) % loopPeriodMs;
    const bitMs = 1000 / baud;
    for (const ev of schedule) {
        const start = ((ev.startMs % loopPeriodMs) + loopPeriodMs) % loopPeriodMs;
        let cursor = start;
        const data = String(ev.data || "");
        for (let i = 0; i < data.length; i++) {
            for (const bit of uartByteBits(data.charCodeAt(i))) {
                let end = cursor + bitMs;
                if (end <= loopPeriodMs) {
                    if (tMod >= cursor && tMod < end) return bit;
                } else if (tMod >= cursor || tMod < end - loopPeriodMs) {
                    return bit;
                }
                cursor = end;
                if (cursor >= loopPeriodMs) cursor -= loopPeriodMs;
            }
        }
    }
    return 1;
}

/** Somme des delay() dans void loop() — sans exécuter le sketch. */
export function uartSketchLoopPeriodMs(sketch) {
    const loopBody = String(sketch || "").match(/void\s+loop\s*\(\s*\)\s*\{([\s\S]*?)\}/i)?.[1] || "";
    let delaySum = 0;
    for (const m of loopBody.matchAll(/delay\s*\(\s*(\d+)\s*\)/gi)) {
        delaySum += parseInt(m[1], 10);
    }
    return delaySum;
}

function parseSerialBaud(sketch) {
    const m = String(sketch || "").match(/\bSerial\.begin\s*\(\s*(\d+)/i);
    return m ? parseInt(m[1], 10) : 0;
}

/** Période de boucle UART pour réglage auto scope (s), sans rejouer le runtime. */
export function arduinoUartScopePeriodSec(components) {
    let min = Infinity;
    for (const c of components) {
        if (c.type !== "arduino_uno") continue;
        if (!sketchUsesSerial(c.sketch)) continue;
        const loopMs = uartSketchLoopPeriodMs(c.sketch);
        if (loopMs > 0) {
            min = Math.min(min, loopMs / 1000);
            continue;
        }
        const baud = parseSerialBaud(c.sketch) || 9600;
        min = Math.min(min, uartCharDurationSec(baud) * 2);
    }
    return Number.isFinite(min) ? min : 0;
}

function inferLoopPeriodMs(sketch, schedule) {
    const delaySum = uartSketchLoopPeriodMs(sketch);
    if (delaySum > 0) return delaySum;

    const loopEvents = schedule.filter((ev) => ev.loopPhase);
    if (loopEvents.length >= 2) {
        const d = loopEvents[1].startMs - loopEvents[0].startMs;
        if (d > 0) return d;
    }
    if (schedule.length >= 2) {
        const d = schedule[schedule.length - 1].startMs - schedule[0].startMs;
        if (d > 0) return d;
    }
    return 0;
}

/**
 * Rejoue le sketch pour construire le planning des émissions UART.
 * @returns {{ schedule: Array<{startMs:number,data:string}>, baud: number, loopPeriodMs: number }}
 */
export function buildUartScopeModel(uno, inputs = {}, replayMs = 3500) {
    if (!uno || !sketchUsesSerial(uno.sketch)) {
        return { schedule: [], baud: 9600, loopPeriodMs: 0 };
    }
    const rt = createArduinoRuntime(uno);
    const ser = rt.state.serial;
    const setupEndMs = rt.state.simTimeMs;
    let guard = 0;
    while (rt.state.simTimeMs < replayMs && guard < 50000) {
        stepArduinoRuntime(rt, 2, inputs);
        guard++;
    }
    const schedule = (ser?.schedule || []).map((ev) => ({
        ...ev,
        loopPhase: ev.startMs >= setupEndMs - 0.5,
    }));
    const baud = ser?.baud > 0 ? ser.baud : 9600;
    const loopPeriodMs = sketchHasLoop(uno.sketch)
        ? inferLoopPeriodMs(uno.sketch, schedule)
        : 0;
    return { schedule, baud, loopPeriodMs };
}

export function uartScopeBitAt(model, tMs) {
    if (!model?.schedule?.length) return 1;
    if (model.loopPeriodMs > 0) {
        return uartTxBitAtLoop(model.schedule, model.baud, tMs, model.loopPeriodMs);
    }
    return uartTxBitAt(model.schedule, model.baud, tMs);
}

/** Durée d'une trame 8N1 (s) pour réglage de la base de temps. */
export function uartCharDurationSec(baud) {
    if (!baud || baud <= 0) return 0;
    return 10 / baud;
}
