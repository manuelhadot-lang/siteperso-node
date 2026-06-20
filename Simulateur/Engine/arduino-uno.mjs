/**
 * Arduino UNO R3 — modèle SPICE simplifié pour co-simulation avec le circuit.
 * Alimentation : 5 V / 3,3 V / masse sur les broches correspondantes.
 * GPIO sortie : source DC ou PULSE selon le sketch interprété (pinModes / pinLevels / pinPulses).
 */

import { appendI2cBusNetlist } from "./i2c-bus-ideal.mjs";

function formatSpiceTime(seconds) {
    const s = Math.abs(Number(seconds));
    if (!Number.isFinite(s)) return "1n";
    if (s === 0) return "0";
    if (s >= 1) return String(s);
    if (s >= 1e-3) return `${(s * 1e3).toPrecision(6)}m`;
    if (s >= 1e-6) return `${(s * 1e6).toPrecision(6)}u`;
    if (s >= 1e-9) return `${(s * 1e9).toPrecision(6)}n`;
    return `${s.toExponential(3)}`;
}

function pinVoltageFromPhases(pinPhases, pinName) {
    return pinPhases.map((ph) => (ph.levels?.[pinName] ? 5 : 0));
}

/** Carré périodique dérivé des phases (HIGH/LOW cumulés sur une période). */
function pinPhaseToPulse(pinPhases, pinName) {
    const levels = pinVoltageFromPhases(pinPhases, pinName);
    if (levels.length < 2 || levels.every((v) => v === levels[0])) return null;
    let highMs = 0;
    let lowMs = 0;
    for (let i = 0; i < pinPhases.length; i++) {
        const d = pinPhases[i].durationMs || 0;
        if (levels[i]) highMs += d;
        else lowMs += d;
    }
    if (highMs <= 0 || lowMs <= 0) return null;
    const highSec = highMs / 1000;
    const lowSec = lowMs / 1000;
    const period = highSec + lowSec;
    const delaySec = levels[0] ? 0 : lowSec;
    return { highSec, lowSec, period, delaySec };
}

function appendPinPhasePulse(c, pinName, nPin, pinPhases, lines, spiceBranchName) {
    const pulse = pinPhaseToPulse(pinPhases, pinName);
    if (!pulse) return false;
    lines.push(
        `${spiceBranchName("V", `${c.id}_${pinName}`)} ${nPin} 0 PULSE(0 5 ${formatSpiceTime(pulse.delaySec)} 1n 1n ${formatSpiceTime(pulse.highSec)} ${formatSpiceTime(pulse.period)})`
    );
    return true;
}

/** Séquence PWL pour motifs non périodiques (compteurs PORTD, bargraph…). */
function appendPinPhasePwl(c, pinName, nPin, pinPhases, lines, spiceBranchName) {
    const levels = pinVoltageFromPhases(pinPhases, pinName);
    if (!levels.length) return false;
    if (levels.every((v) => v === levels[0])) {
        lines.push(`${spiceBranchName("V", `${c.id}_${pinName}`)} ${nPin} 0 DC ${levels[0]}`);
        return true;
    }
    if (appendPinPhasePulse(c, pinName, nPin, pinPhases, lines, spiceBranchName)) return true;
    let t = 0;
    const parts = [];
    for (let i = 0; i < pinPhases.length; i++) {
        parts.push(formatSpiceTime(t), String(levels[i]));
        t += (pinPhases[i].durationMs || 0) / 1000;
    }
    if (t <= 0) return false;
    parts.push(formatSpiceTime(t), String(levels[levels.length - 1]));
    lines.push(
        `${spiceBranchName("V", `${c.id}_${pinName}`)} ${nPin} 0 PWL(${parts.join(" ")})`
    );
    return true;
}
export const UNO_PIN = {
    IOREF: 0,
    RESET: 1,
    "3V3": 2,
    "5V": 3,
    GND: 4,
    GND2: 5,
    VIN: 6,
    A0: 7,
    A1: 8,
    A2: 9,
    A3: 10,
    A4: 11,
    A5: 12,
    D13: 13,
    D12: 14,
    D11: 15,
    D10: 16,
    D9: 17,
    D8: 18,
    D7: 19,
    D6: 20,
    D5: 21,
    D4: 22,
    D3: 23,
    D2: 24,
    D1: 25,
    D0: 26,
};

export const UNO_PIN_COUNT = 27;

export function isArduinoUnoType(t) {
    return t === "arduino_uno";
}

export function arduinoUnoTerminalKeys(c) {
    const keys = [];
    for (let i = 0; i < UNO_PIN_COUNT; i++) keys.push(`${c.id}#${i}`);
    return keys;
}

/** Broches mesurées pour animation logique (D0…D13). */
export function arduinoUnoDigitalPinIndices() {
    return [
        UNO_PIN.D0, UNO_PIN.D1, UNO_PIN.D2, UNO_PIN.D3, UNO_PIN.D4, UNO_PIN.D5,
        UNO_PIN.D6, UNO_PIN.D7, UNO_PIN.D8, UNO_PIN.D9, UNO_PIN.D10, UNO_PIN.D11,
        UNO_PIN.D12, UNO_PIN.D13,
    ];
}

export function arduinoUnoDigitalPinName(pinIndex) {
    const map = {
        [UNO_PIN.D0]: "D0", [UNO_PIN.D1]: "D1", [UNO_PIN.D2]: "D2", [UNO_PIN.D3]: "D3",
        [UNO_PIN.D4]: "D4", [UNO_PIN.D5]: "D5", [UNO_PIN.D6]: "D6", [UNO_PIN.D7]: "D7",
        [UNO_PIN.D8]: "D8", [UNO_PIN.D9]: "D9", [UNO_PIN.D10]: "D10", [UNO_PIN.D11]: "D11",
        [UNO_PIN.D12]: "D12", [UNO_PIN.D13]: "D13",
    };
    return map[pinIndex] || `P${pinIndex}`;
}

/** Broches GPIO simulées (D0…D13, A0…A5). */
export function arduinoUnoGpioPinIndices() {
    return [
        ...arduinoUnoDigitalPinIndices(),
        UNO_PIN.A0, UNO_PIN.A1, UNO_PIN.A2, UNO_PIN.A3, UNO_PIN.A4, UNO_PIN.A5,
    ];
}

export function arduinoUnoGpioPinName(pinIndex) {
    const digital = arduinoUnoDigitalPinName(pinIndex);
    if (digital.startsWith("D")) return digital;
    const analog = {
        [UNO_PIN.A0]: "A0", [UNO_PIN.A1]: "A1", [UNO_PIN.A2]: "A2",
        [UNO_PIN.A3]: "A3", [UNO_PIN.A4]: "A4", [UNO_PIN.A5]: "A5",
    };
    return analog[pinIndex] || `P${pinIndex}`;
}

/**
 * @param {object} c composant moteur
 * @param {(key: string) => string} nodeFor
 * @param {string[]} lines
 * @param {(prefix: string, id: string) => string} spiceBranchName
 */
export function appendArduinoUnoNetlist(c, nodeFor, lines, spiceBranchName, opts = {}) {
    const id = c.id;
    const n5 = nodeFor(`${id}#${UNO_PIN["5V"]}`);
    const n33 = nodeFor(`${id}#${UNO_PIN["3V3"]}`);
    const ng1 = nodeFor(`${id}#${UNO_PIN.GND}`);
    const ng2 = nodeFor(`${id}#${UNO_PIN.GND2}`);
    const nioref = nodeFor(`${id}#${UNO_PIN.IOREF}`);
    const nreset = nodeFor(`${id}#${UNO_PIN.RESET}`);

    lines.push(`* ${id} Arduino UNO (rails + GPIO passifs)`);
    lines.push(`${spiceBranchName("R", `${id}_g1`)} ${ng1} 0 1m`);
    lines.push(`${spiceBranchName("R", `${id}_g2`)} ${ng2} 0 1m`);
    lines.push(`${spiceBranchName("V", `${id}_5v`)} ${n5} 0 DC 5`);
    lines.push(`${spiceBranchName("V", `${id}_3v3`)} ${n33} 0 DC 3.3`);
    lines.push(`${spiceBranchName("R", `${id}_ioref`)} ${nioref} ${n5} 100`);
    lines.push(`${spiceBranchName("R", `${id}_rstpu`)} ${nreset} ${n5} 10000`);

    const pinModes = c.pinModes && typeof c.pinModes === "object" ? c.pinModes : {};
    const pinLevels = c.pinLevels && typeof c.pinLevels === "object" ? c.pinLevels : {};
    const pinPulses = c.pinPulses && typeof c.pinPulses === "object" ? c.pinPulses : {};
    const pinPhases = Array.isArray(c.pinPhases) ? c.pinPhases : [];
    const hasMultiPhase = pinPhases.length >= 2;

    for (const pinIdx of arduinoUnoGpioPinIndices()) {
        const pinName = arduinoUnoGpioPinName(pinIdx);
        if (c.i2cBus?.active && (pinName === "A4" || pinName === "A5")) continue;
        const nPin = nodeFor(`${id}#${pinIdx}`);
        if (pinModes[pinName] === "OUTPUT") {
            const pulse = pinPulses[pinName];
            if (pulse && pulse.highSec > 0 && pulse.lowSec > 0) {
                const period = pulse.highSec + pulse.lowSec;
                const ton = pulse.highSec;
                lines.push(
                    `${spiceBranchName("V", `${id}_${pinName}`)} ${nPin} 0 PULSE(0 5 0 1n 1n ${formatSpiceTime(ton)} ${formatSpiceTime(period)})`
                );
            } else if (hasMultiPhase) {
                const levels = pinVoltageFromPhases(pinPhases, pinName);
                const constant = levels.length > 0 && levels.every((v) => v === levels[0]);
                if (constant) {
                    lines.push(`${spiceBranchName("V", `${id}_${pinName}`)} ${nPin} 0 DC ${levels[0]}`);
                } else if (!appendPinPhasePwl(c, pinName, nPin, pinPhases, lines, spiceBranchName)) {
                    const high = pinLevels[pinName] === 1 || pinLevels[pinName] === "1" || pinLevels[pinName] === true;
                    lines.push(`${spiceBranchName("V", `${id}_${pinName}`)} ${nPin} 0 DC ${high ? 5 : 0}`);
                }
            } else {
                const high = pinLevels[pinName] === 1 || pinLevels[pinName] === "1" || pinLevels[pinName] === true;
                const v = high ? 5 : 0;
                lines.push(`${spiceBranchName("V", `${id}_${pinName}`)} ${nPin} 0 DC ${v}`);
            }
        } else if (pinModes[pinName] === "INPUT_PULLUP") {
            lines.push(`${spiceBranchName("R", `${id}_${pinName}_pu`)} ${n5} ${nPin} 30000`);
        } else {
            lines.push(`${spiceBranchName("R", `${id}_${pinName}_z`)} ${nPin} 0 10Meg`);
        }
    }

    if (c.i2cBus?.active) {
        appendI2cBusNetlist(c, nodeFor, lines, spiceBranchName, opts.i2cRepeatSec ?? 0.02);
    }
}
