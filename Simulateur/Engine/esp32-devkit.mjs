/**
 * ESP32 DevKit WROOM-32 — modèle SPICE simplifié (rails 3,3 V / 5 V USB, GPIO passifs).
 */

import { appendI2cBusNetlist } from "./i2c-bus-ideal.mjs";

const LOGIC_VHI = 3.3;

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
    return pinPhases.map((ph) => (ph.levels?.[pinName] ? LOGIC_VHI : 0));
}

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
        `${spiceBranchName("V", `${c.id}_${pinName}`)} ${nPin} 0 PULSE(0 ${LOGIC_VHI} ${formatSpiceTime(pulse.delaySec)} 1n 1n ${formatSpiceTime(pulse.highSec)} ${formatSpiceTime(pulse.period)})`
    );
    return true;
}

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

/** Indices SPICE — ordre identique à esp32-devkit-layout.js */
export const ESP32_DEVKIT_PIN = {
    "3V3": 0,
    EN: 1,
    GPIO36: 2,
    GPIO39: 3,
    GPIO34: 4,
    GPIO35: 5,
    GPIO32: 6,
    GPIO33: 7,
    GPIO25: 8,
    GPIO26: 9,
    GPIO27: 10,
    GPIO14: 11,
    GPIO12: 12,
    GND: 13,
    GPIO13: 14,
    GPIO9: 15,
    GPIO10: 16,
    GPIO11: 17,
    GPIO23: 18,
    GPIO22: 19,
    GPIO1: 20,
    GPIO3: 21,
    GPIO21: 22,
    GND2: 23,
    GPIO19: 24,
    GPIO18: 25,
    GPIO5: 26,
    GPIO17: 27,
    GPIO16: 28,
    GPIO4: 29,
    GPIO2: 30,
    GPIO15: 31,
    GPIO8: 32,
    GPIO0: 33,
    GPIO6: 34,
    "5V": 35,
};

export const ESP32_DEVKIT_PIN_COUNT = 36;

const GPIO_INDEX_TO_NAME = Object.fromEntries(
    Object.entries(ESP32_DEVKIT_PIN)
        .filter(([k]) => /^GPIO\d+$/.test(k))
        .map(([k, v]) => [v, k])
);

export function isEsp32DevkitType(t) {
    return t === "esp32_devkit";
}

export function esp32DevkitTerminalKeys(c) {
    const keys = [];
    for (let i = 0; i < ESP32_DEVKIT_PIN_COUNT; i++) keys.push(`${c.id}#${i}`);
    return keys;
}

export function esp32DevkitGpioPinIndices() {
    return Object.values(GPIO_INDEX_TO_NAME).map((name) => ESP32_DEVKIT_PIN[name]);
}

export function esp32DevkitGpioPinName(pinIndex) {
    return GPIO_INDEX_TO_NAME[pinIndex] || `P${pinIndex}`;
}

export function esp32DevkitDigitalPinIndices() {
    return esp32DevkitGpioPinIndices();
}

export function appendEsp32DevkitNetlist(c, nodeFor, lines, spiceBranchName, opts = {}) {
    const id = c.id;
    const n33 = nodeFor(`${id}#${ESP32_DEVKIT_PIN["3V3"]}`);
    const n5 = nodeFor(`${id}#${ESP32_DEVKIT_PIN["5V"]}`);
    const ng1 = nodeFor(`${id}#${ESP32_DEVKIT_PIN.GND}`);
    const ng2 = nodeFor(`${id}#${ESP32_DEVKIT_PIN.GND2}`);
    const nen = nodeFor(`${id}#${ESP32_DEVKIT_PIN.EN}`);

    lines.push(`* ${id} ESP32 DevKit WROOM-32 (rails + GPIO passifs)`);
    lines.push(`${spiceBranchName("R", `${id}_g1`)} ${ng1} ${ng2} 1m`);
    lines.push(`${spiceBranchName("R", `${id}_g2`)} ${ng2} 0 1m`);
    lines.push(`${spiceBranchName("V", `${id}_3v3`)} ${n33} 0 DC 3.3`);
    lines.push(`${spiceBranchName("V", `${id}_5v`)} ${n5} 0 DC 5`);
    lines.push(`${spiceBranchName("R", `${id}_enpu`)} ${n33} ${nen} 10000`);

    const pinModes = c.pinModes && typeof c.pinModes === "object" ? c.pinModes : {};
    const pinLevels = c.pinLevels && typeof c.pinLevels === "object" ? c.pinLevels : {};
    const pinPulses = c.pinPulses && typeof c.pinPulses === "object" ? c.pinPulses : {};
    const pinPhases = Array.isArray(c.pinPhases) ? c.pinPhases : [];
    const hasMultiPhase = pinPhases.length >= 2;

    for (const pinIdx of esp32DevkitGpioPinIndices()) {
        const pinName = esp32DevkitGpioPinName(pinIdx);
        if (c.i2cBus?.active && (pinName === "GPIO21" || pinName === "GPIO22")) continue;
        const nPin = nodeFor(`${id}#${pinIdx}`);
        if (pinModes[pinName] === "OUTPUT") {
            const pulse = pinPulses[pinName];
            if (pulse && pulse.highSec > 0 && pulse.lowSec > 0) {
                const period = pulse.highSec + pulse.lowSec;
                const ton = pulse.highSec;
                lines.push(
                    `${spiceBranchName("V", `${c.id}_${pinName}`)} ${nPin} 0 PULSE(0 ${LOGIC_VHI} 0 1n 1n ${formatSpiceTime(ton)} ${formatSpiceTime(period)})`
                );
            } else if (hasMultiPhase) {
                const levels = pinVoltageFromPhases(pinPhases, pinName);
                const constant = levels.length > 0 && levels.every((v) => v === levels[0]);
                if (constant) {
                    lines.push(`${spiceBranchName("V", `${c.id}_${pinName}`)} ${nPin} 0 DC ${levels[0]}`);
                } else if (!appendPinPhasePwl(c, pinName, nPin, pinPhases, lines, spiceBranchName)) {
                    const high = pinLevels[pinName] === 1 || pinLevels[pinName] === "1" || pinLevels[pinName] === true;
                    lines.push(`${spiceBranchName("V", `${c.id}_${pinName}`)} ${nPin} 0 DC ${high ? LOGIC_VHI : 0}`);
                }
            } else {
                const high = pinLevels[pinName] === 1 || pinLevels[pinName] === "1" || pinLevels[pinName] === true;
                lines.push(`${spiceBranchName("V", `${c.id}_${pinName}`)} ${nPin} 0 DC ${high ? LOGIC_VHI : 0}`);
            }
        } else if (pinModes[pinName] === "INPUT_PULLUP") {
            lines.push(`${spiceBranchName("R", `${c.id}_${pinName}_pu`)} ${n33} ${nPin} 47000`);
        } else {
            lines.push(`${spiceBranchName("R", `${c.id}_${pinName}_z`)} ${nPin} 0 10Meg`);
        }
    }

    if (c.i2cBus?.active) {
        appendI2cBusNetlist(c, nodeFor, lines, spiceBranchName, opts.i2cRepeatSec ?? 0.02);
    }
}
