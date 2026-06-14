/**
 * Valeurs idéales GPIO Arduino (5 V / 0 V) pour voltmètre / BCD / 7 segments.
 */

import { bcdDigitToSeg7Segments } from "./bcd-seg7.mjs";
import {
    applyArduinoSketchToComponent,
    arduinoGpioIsTimeVarying,
    resolvePinLevelsAt,
} from "./arduino-sketch-parse.mjs";
import { isPinOutput } from "./arduino-avr-registers.mjs";
import { reachableJonctions } from "./hc90-cascade.mjs";

const CD4511_BCD_INPUTS = { A: 0, B: 1, C: 2, D: 3 };
const SEG7_OFF = { a: false, b: false, c: false, d: false, e: false, f: false, g: false };

function isGndJunction(jid) {
    if (!jid) return false;
    if (jid.startsWith("GND")) return true;
    const prefix = jid.split("_")[0];
    return /^GND\d+$/.test(prefix);
}

function parseArduinoPinAtJunction(jid, components, pinLevelsByUno) {
    if (!jid) return null;
    for (const comp of components) {
        if (comp.type !== "arduino_uno" || !jid.startsWith(`${comp.label}_`)) continue;
        const suffix = jid.slice(comp.label.length + 1);
        if (!/^D\d+$|^A\d+$/.test(suffix)) continue;
        const out =
            (comp.avrRegisters && isPinOutput(comp.avrRegisters, suffix)) ||
            comp.pinModes?.[suffix] === "OUTPUT";
        if (!out) continue;
        const levels = pinLevelsByUno?.get(comp.label) || comp.pinLevels || {};
        const high = levels[suffix] === 1 || levels[suffix] === "1" || levels[suffix] === true;
        return { pinLabel: suffix, high, volts: high ? 5 : 0 };
    }
    return null;
}

function buildPinLevelsByUno(components, tSec = 0) {
    const map = new Map();
    for (const comp of components) {
        if (comp.type !== "arduino_uno") continue;
        applyArduinoSketchToComponent(comp);
        map.set(comp.label, resolvePinLevelsAt(comp, tSec));
    }
    return map;
}

/** Classifie une jonction : Arduino OUTPUT, masse, ou flottant (inclut jonctions T). */
function classifyJonction(jid, components, wires, autoJunctions = [], tSec = 0) {
    if (!jid) return { kind: "unknown" };
    const pinLevelsByUno = buildPinLevelsByUno(components, tSec);
    const net = reachableJonctions(jid, wires, autoJunctions);
    for (const cur of net) {
        if (isGndJunction(cur)) return { kind: "gnd", volts: 0 };
        const ar = parseArduinoPinAtJunction(cur, components, pinLevelsByUno);
        if (ar) return { kind: "arduino", volts: ar.volts, high: ar.high };
    }
    return { kind: "unknown" };
}

export function traceJonctionToIdealVolts(jid, components, wires, tSec = 0, autoJunctions = []) {
    const c = classifyJonction(jid, components, wires, autoJunctions, tSec);
    if (c.kind === "gnd") return 0;
    if (c.kind === "arduino") return c.volts;
    return null;
}

/** Voltmètre : détecte Arduino vs GND sur _in ou _out (câblage +/− libre). */
export function getIdealVoltmeterVoltage(vmLabel, components, wires, tSec = 0, autoJunctions = []) {
    const out = classifyJonction(`${vmLabel}_out`, components, wires, autoJunctions, tSec);
    const inn = classifyJonction(`${vmLabel}_in`, components, wires, autoJunctions, tSec);

    if (out.kind === "arduino" && inn.kind === "gnd") return out.volts;
    if (inn.kind === "arduino" && out.kind === "gnd") return inn.volts;
    if (out.kind === "arduino" && inn.kind !== "arduino") return out.volts;
    if (inn.kind === "arduino" && out.kind !== "arduino") return inn.volts;
    if (out.kind === "gnd" && inn.kind === "gnd") return 0;
    return null;
}

function cd4511LabelWiredToSeg7(segLabel, wires, autoJunctions = [], components = []) {
    for (const seg of ["a", "b", "c", "d", "e", "f", "g"]) {
        const segJ = `${segLabel}_${seg}`;
        const net = reachableJonctions(segJ, wires, autoJunctions);
        for (const jid of net) {
            for (const comp of components) {
                if (comp.type !== "cd4511" || !comp.label) continue;
                if (!jid.startsWith(`${comp.label}_`)) continue;
                const suffix = jid.slice(comp.label.length + 1);
                if (/^[a-g]$/.test(suffix)) return comp.label;
            }
        }
    }
    return null;
}

function resolveCd4511ForSeg7(segLabel, components, wires, autoJunctions = []) {
    const linked = cd4511LabelWiredToSeg7(segLabel, wires, autoJunctions, components);
    if (linked) return linked;
    const seg7s = components.filter((c) => c.type === "seg7");
    const cd4511s = components.filter((c) => c.type === "cd4511");
    if (seg7s.length === 1 && cd4511s.length === 1) return cd4511s[0].label;
    return null;
}

/**
 * Détecte le câblage CD4511 A…D → UNO D0…D3 (permutation).
 * @returns {Record<'A'|'B'|'C'|'D', number>|null} bit PORTD (0–3) par entrée BCD
 */
export function detectPortDMappingForCd4511(cd4511Label, unoLabel, wires, autoJunctions = []) {
    const map = {};
    for (const name of Object.keys(CD4511_BCD_INPUTS)) {
        const jid = `${cd4511Label}_${name}`;
        const net = reachableJonctions(jid, wires, autoJunctions);
        let dPin = null;
        for (const j of net) {
            const m = new RegExp(`^${unoLabel}_D([0-3])$`).exec(j);
            if (m) {
                dPin = parseInt(m[1], 10);
                break;
            }
        }
        if (dPin == null) return null;
        map[name] = dPin;
    }
    return map;
}

function findUnoPortDMappingForCd4511(cd4511Label, components, wires, autoJunctions) {
    for (const comp of components) {
        if (comp.type !== "arduino_uno" || !comp.label) continue;
        applyArduinoSketchToComponent(comp);
        const map = detectPortDMappingForCd4511(cd4511Label, comp.label, wires, autoJunctions);
        if (map) return { uno: comp, map };
    }
    return null;
}

/** BCD à partir de PORTD et du câblage (A→Dx, B→Dy…). */
export function bcdFromPortDRegister(portD, inputToBit) {
    const port = (Number(portD) || 0) & 0xff;
    let bcd = 0;
    for (const [name, bcdBit] of Object.entries(CD4511_BCD_INPUTS)) {
        const dPin = inputToBit[name];
        if (dPin == null) return null;
        if ((port >> dPin) & 1) bcd |= 1 << bcdBit;
    }
    return bcd;
}

function bcdFromMappedPortDAtTime(uno, map, tSec) {
    if (uno?.liveLevels || arduinoGpioIsTimeVarying(uno)) {
        const levels = resolvePinLevelsAt(uno, tSec);
        let bcd = 0;
        for (const [name, bcdBit] of Object.entries(CD4511_BCD_INPUTS)) {
            const dPin = map[name];
            const label = `D${dPin}`;
            if (levels[label] === 1 || levels[label] === "1" || levels[label] === true) {
                bcd |= 1 << bcdBit;
            }
        }
        return bcd;
    }
    return bcdFromPortDRegister(uno.avrRegisters?.PORTD ?? 0, map);
}

function bcdFromTrace(cd4511Label, components, wires, tSec, autoJunctions) {
    let bcd = 0;
    let any = false;
    for (const [name, idx] of Object.entries(CD4511_BCD_INPUTS)) {
        const jid = `${cd4511Label}_${name}`;
        const v = traceJonctionToIdealVolts(jid, components, wires, tSec, autoJunctions);
        if (v == null) continue;
        any = true;
        if (v >= 2.5) bcd |= 1 << idx;
    }
    return any ? bcd : null;
}

export function getIdealArduinoBcdForCd4511(cd4511Label, components, wires, tSec = 0, autoJunctions = []) {
    const linked = findUnoPortDMappingForCd4511(cd4511Label, components, wires, autoJunctions);
    if (linked) {
        return bcdFromMappedPortDAtTime(linked.uno, linked.map, tSec);
    }
    return bcdFromTrace(cd4511Label, components, wires, tSec, autoJunctions);
}

export function getIdealSeg7FromArduino(segLabel, components, wires, tSec = 0, autoJunctions = []) {
    const cdLabel = resolveCd4511ForSeg7(segLabel, components, wires, autoJunctions);
    if (!cdLabel) return null;
    const bcd = getIdealArduinoBcdForCd4511(cdLabel, components, wires, tSec, autoJunctions);
    if (bcd == null) return null;
    if (bcd > 9) return { segments: { ...SEG7_OFF }, bcd, blank: true };
    return { segments: bcdDigitToSeg7Segments(bcd), bcd };
}
