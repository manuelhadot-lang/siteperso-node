/**
 * uPesy ESP32 Wroom Low Power DevKit — rails 3,3 V / 5 V USB, VIN passif, GPIO35 = VBAT.
 */

import { appendI2cBusNetlist } from "./i2c-bus-ideal.mjs";
import { clampUpesyVbat, upesyGpio35Volts, UPESY_DEFAULT_VBAT } from "../esp32-upesy-lp-layout.js";

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

/** Indices SPICE — ordre identique à esp32-upesy-lp-layout.js */
export const ESP32_UPESY_LP_PIN = {
    EN: 0,
    GPIO36: 1,
    GPIO39: 2,
    GPIO34: 3,
    GPIO35: 4,
    GPIO32: 5,
    GPIO33: 6,
    GPIO25: 7,
    GPIO26: 8,
    GPIO27: 9,
    GPIO14: 10,
    GPIO12: 11,
    GPIO13: 12,
    VIN: 13,
    "5V": 14,
    GND: 15,
    GPIO23: 16,
    GPIO22: 17,
    GPIO1: 18,
    GPIO3: 19,
    GPIO21: 20,
    GPIO19: 21,
    GPIO18: 22,
    GPIO5: 23,
    GPIO17: 24,
    GPIO16: 25,
    GPIO4: 26,
    GPIO0: 27,
    GPIO2: 28,
    GPIO15: 29,
    "3V3": 30,
    GND2: 31,
};

export const ESP32_UPESY_LP_PIN_COUNT = 32;

const GPIO_INDEX_TO_NAME = Object.fromEntries(
    Object.entries(ESP32_UPESY_LP_PIN)
        .filter(([k]) => /^GPIO\d+$/.test(k))
        .map(([k, v]) => [v, k])
);

export function isEsp32UpesyLpType(t) {
    return t === "esp32_upesy_lp";
}

export function esp32UpesyLpTerminalKeys(c) {
    const keys = [];
    for (let i = 0; i < ESP32_UPESY_LP_PIN_COUNT; i++) keys.push(`${c.id}#${i}`);
    return keys;
}

export function esp32UpesyLpGpioPinIndices() {
    return Object.values(GPIO_INDEX_TO_NAME).map((name) => ESP32_UPESY_LP_PIN[name]);
}

export function esp32UpesyLpGpioPinName(pinIndex) {
    return GPIO_INDEX_TO_NAME[pinIndex] || `P${pinIndex}`;
}

export function esp32UpesyLpDigitalPinIndices() {
    return esp32UpesyLpGpioPinIndices();
}

export function appendEsp32UpesyLpNetlist(c, nodeFor, lines, spiceBranchName, opts = {}) {
    const id = c.id;
    const n33 = nodeFor(`${id}#${ESP32_UPESY_LP_PIN["3V3"]}`);
    const n5 = nodeFor(`${id}#${ESP32_UPESY_LP_PIN["5V"]}`);
    const nVin = nodeFor(`${id}#${ESP32_UPESY_LP_PIN.VIN}`);
    const ng1 = nodeFor(`${id}#${ESP32_UPESY_LP_PIN.GND}`);
    const ng2 = nodeFor(`${id}#${ESP32_UPESY_LP_PIN.GND2}`);
    const nen = nodeFor(`${id}#${ESP32_UPESY_LP_PIN.EN}`);
    const n35 = nodeFor(`${id}#${ESP32_UPESY_LP_PIN.GPIO35}`);
    const n35int = nodeFor(`${id}#__vbat35`);
    const vbat = clampUpesyVbat(c.vbat ?? UPESY_DEFAULT_VBAT);
    const v35 = upesyGpio35Volts(vbat);

    lines.push(`* ${id} uPesy ESP32 Wroom Low Power (rails + GPIO35 VBAT)`);
    lines.push(`${spiceBranchName("R", `${id}_g1`)} ${ng1} ${ng2} 1m`);
    lines.push(`${spiceBranchName("R", `${id}_g2`)} ${ng2} 0 1m`);
    lines.push(`${spiceBranchName("V", `${id}_3v3`)} ${n33} 0 DC 3.3`);
    lines.push(`${spiceBranchName("V", `${id}_5v`)} ${n5} 0 DC 5`);
    lines.push(`${spiceBranchName("R", `${id}_vinz`)} ${nVin} 0 10Meg`);
    lines.push(`${spiceBranchName("R", `${id}_enpu`)} ${n33} ${nen} 10000`);
    lines.push(`${spiceBranchName("V", `${id}_vbat35`)} ${n35int} 0 DC ${v35.toFixed(6)}`);
    lines.push(`${spiceBranchName("R", `${id}_vbat35r`)} ${n35int} ${n35} 47000`);

    const pinModes = c.pinModes && typeof c.pinModes === "object" ? c.pinModes : {};
    const pinLevels = c.pinLevels && typeof c.pinLevels === "object" ? c.pinLevels : {};
    const pinPulses = c.pinPulses && typeof c.pinPulses === "object" ? c.pinPulses : {};
    const pinPhases = Array.isArray(c.pinPhases) ? c.pinPhases : [];
    const hasMultiPhase = pinPhases.length >= 2;

    for (const pinIdx of esp32UpesyLpGpioPinIndices()) {
        const pinName = esp32UpesyLpGpioPinName(pinIdx);
        if (pinName === "GPIO35") continue;
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
