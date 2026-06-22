/**
 * ESP32-C3 DevKit — modèle SPICE simplifié (rails 3,3 V / 5 V USB, GPIO passifs).
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

export const ESP32_PIN = {
    "3V3": 0,
    GND: 1,
    GND2: 2,
    EN: 3,
    GPIO0: 4,
    GPIO1: 5,
    GPIO2: 6,
    GPIO3: 7,
    GPIO4: 8,
    GPIO5: 9,
    GPIO6: 10,
    GPIO7: 11,
    GPIO8: 12,
    GPIO9: 13,
    GPIO10: 14,
    GPIO20: 15,
    GPIO21: 16,
    "5V": 17,
};

export const ESP32_PIN_COUNT = 18;

export function isEsp32C3Type(t) {
    return t === "esp32_c3";
}

export function esp32C3TerminalKeys(c) {
    const keys = [];
    for (let i = 0; i < ESP32_PIN_COUNT; i++) keys.push(`${c.id}#${i}`);
    return keys;
}

export function esp32C3GpioPinIndices() {
    return [
        ESP32_PIN.GPIO0, ESP32_PIN.GPIO1, ESP32_PIN.GPIO2, ESP32_PIN.GPIO3, ESP32_PIN.GPIO4,
        ESP32_PIN.GPIO5, ESP32_PIN.GPIO6, ESP32_PIN.GPIO7, ESP32_PIN.GPIO8, ESP32_PIN.GPIO9,
        ESP32_PIN.GPIO10, ESP32_PIN.GPIO20, ESP32_PIN.GPIO21,
    ];
}

export function esp32C3GpioPinName(pinIndex) {
    const map = {
        [ESP32_PIN.GPIO0]: "GPIO0", [ESP32_PIN.GPIO1]: "GPIO1", [ESP32_PIN.GPIO2]: "GPIO2",
        [ESP32_PIN.GPIO3]: "GPIO3", [ESP32_PIN.GPIO4]: "GPIO4", [ESP32_PIN.GPIO5]: "GPIO5",
        [ESP32_PIN.GPIO6]: "GPIO6", [ESP32_PIN.GPIO7]: "GPIO7", [ESP32_PIN.GPIO8]: "GPIO8",
        [ESP32_PIN.GPIO9]: "GPIO9", [ESP32_PIN.GPIO10]: "GPIO10", [ESP32_PIN.GPIO20]: "GPIO20",
        [ESP32_PIN.GPIO21]: "GPIO21",
    };
    return map[pinIndex] || `P${pinIndex}`;
}

export function esp32C3DigitalPinIndices() {
    return esp32C3GpioPinIndices();
}

export function appendEsp32C3Netlist(c, nodeFor, lines, spiceBranchName, opts = {}) {
    const id = c.id;
    const n33 = nodeFor(`${id}#${ESP32_PIN["3V3"]}`);
    const n5 = nodeFor(`${id}#${ESP32_PIN["5V"]}`);
    const ng1 = nodeFor(`${id}#${ESP32_PIN.GND}`);
    const ng2 = nodeFor(`${id}#${ESP32_PIN.GND2}`);
    const nen = nodeFor(`${id}#${ESP32_PIN.EN}`);

    lines.push(`* ${id} ESP32-C3 (rails + GPIO passifs)`);
    lines.push(`${spiceBranchName("R", `${id}_g1`)} ${ng1} 0 1m`);
    lines.push(`${spiceBranchName("R", `${id}_g2`)} ${ng2} 0 1m`);
    lines.push(`${spiceBranchName("V", `${id}_3v3`)} ${n33} 0 DC 3.3`);
    lines.push(`${spiceBranchName("V", `${id}_5v`)} ${n5} 0 DC 5`);
    lines.push(`${spiceBranchName("R", `${id}_enpu`)} ${n33} ${nen} 10000`);

    const pinModes = c.pinModes && typeof c.pinModes === "object" ? c.pinModes : {};
    const pinLevels = c.pinLevels && typeof c.pinLevels === "object" ? c.pinLevels : {};
    const pinPulses = c.pinPulses && typeof c.pinPulses === "object" ? c.pinPulses : {};
    const pinPhases = Array.isArray(c.pinPhases) ? c.pinPhases : [];
    const hasMultiPhase = pinPhases.length >= 2;

    for (const pinIdx of esp32C3GpioPinIndices()) {
        const pinName = esp32C3GpioPinName(pinIdx);
        if (c.i2cBus?.active && (pinName === "GPIO8" || pinName === "GPIO9")) continue;
        const nPin = nodeFor(`${id}#${pinIdx}`);
        if (pinModes[pinName] === "OUTPUT") {
            const pulse = pinPulses[pinName];
            if (pulse && pulse.highSec > 0 && pulse.lowSec > 0) {
                const period = pulse.highSec + pulse.lowSec;
                const ton = pulse.highSec;
                lines.push(
                    `${spiceBranchName("V", `${id}_${pinName}`)} ${nPin} 0 PULSE(0 ${LOGIC_VHI} 0 1n 1n ${formatSpiceTime(ton)} ${formatSpiceTime(period)})`
                );
            } else if (hasMultiPhase) {
                const levels = pinVoltageFromPhases(pinPhases, pinName);
                const constant = levels.length > 0 && levels.every((v) => v === levels[0]);
                if (constant) {
                    lines.push(`${spiceBranchName("V", `${id}_${pinName}`)} ${nPin} 0 DC ${levels[0]}`);
                } else if (!appendPinPhasePwl(c, pinName, nPin, pinPhases, lines, spiceBranchName)) {
                    const high = pinLevels[pinName] === 1 || pinLevels[pinName] === "1" || pinLevels[pinName] === true;
                    lines.push(`${spiceBranchName("V", `${id}_${pinName}`)} ${nPin} 0 DC ${high ? LOGIC_VHI : 0}`);
                }
            } else {
                const high = pinLevels[pinName] === 1 || pinLevels[pinName] === "1" || pinLevels[pinName] === true;
                lines.push(`${spiceBranchName("V", `${id}_${pinName}`)} ${nPin} 0 DC ${high ? LOGIC_VHI : 0}`);
            }
        } else if (pinModes[pinName] === "INPUT_PULLUP") {
            lines.push(`${spiceBranchName("R", `${id}_${pinName}_pu`)} ${n33} ${nPin} 47000`);
        } else {
            lines.push(`${spiceBranchName("R", `${id}_${pinName}_z`)} ${nPin} 0 10Meg`);
        }
    }

    if (c.i2cBus?.active) {
        appendI2cBusNetlist(c, nodeFor, lines, spiceBranchName, opts.i2cRepeatSec ?? 0.02);
    }
}
