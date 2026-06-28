/**
 * Valeurs idéales GPIO microcontrôleur (5 V / 3,3 V) pour voltmètre / BCD / 7 segments / bargraph.
 */

import { bcdDigitToSeg7Segments } from "./bcd-seg7.mjs";
import {
    applyArduinoSketchToComponent,
    arduinoGpioIsTimeVarying,
    resolvePinLevelsAt,
} from "./arduino-sketch-parse.mjs";
import { isPinOutput } from "./arduino-avr-registers.mjs";
import { reachableJonctions } from "./hc90-cascade.mjs";
import {
    boardProfile,
    bcdInputJonctionRegex,
    isMicroBoardType,
    isEsp32BoardType,
} from "./micro-board-config.mjs";

const CD4511_BCD_INPUTS = { A: 0, B: 1, C: 2, D: 3 };
const SEG7_OFF = { a: false, b: false, c: false, d: false, e: false, f: false, g: false };

function isGndJunction(jid) {
    if (!jid) return false;
    if (jid.startsWith("GND")) return true;
    const prefix = jid.split("_")[0];
    return /^GND\d+$/.test(prefix);
}

function isGpioOutputPin(comp, suffix) {
    if (comp.type === "arduino_uno") {
        return (
            (comp.avrRegisters && isPinOutput(comp.avrRegisters, suffix)) ||
            comp.pinModes?.[suffix] === "OUTPUT"
        );
    }
    if (isEsp32BoardType(comp.type)) {
        return comp.pinModes?.[suffix] === "OUTPUT";
    }
    return false;
}

function parseBoardPinAtJunction(jid, components, pinLevelsByBoard) {
    if (!jid) return null;
    for (const comp of components) {
        if (!isMicroBoardType(comp.type) || !jid.startsWith(`${comp.label}_`)) continue;
        const suffix = jid.slice(comp.label.length + 1);
        const isUnoPin = /^D\d+$|^A\d+$/.test(suffix);
        const isEspPin = /^GPIO\d+$/.test(suffix);
        if (!isUnoPin && !isEspPin) continue;
        if (!isGpioOutputPin(comp, suffix)) continue;
        const prof = boardProfile(comp.type);
        const levels = pinLevelsByBoard?.get(comp.label) || comp.pinLevels || {};
        const high = levels[suffix] === 1 || levels[suffix] === "1" || levels[suffix] === true;
        return { pinLabel: suffix, high, volts: high ? prof.logicVolts : 0 };
    }
    return null;
}

function buildPinLevelsByBoard(components, tSec = 0) {
    const map = new Map();
    for (const comp of components) {
        if (!isMicroBoardType(comp.type)) continue;
        applyArduinoSketchToComponent(comp);
        map.set(comp.label, resolvePinLevelsAt(comp, tSec));
    }
    return map;
}

function classifyJonction(jid, components, wires, autoJunctions = [], tSec = 0) {
    if (!jid) return { kind: "unknown" };
    const pinLevelsByBoard = buildPinLevelsByBoard(components, tSec);
    const net = reachableJonctions(jid, wires, autoJunctions);
    for (const cur of net) {
        if (isGndJunction(cur)) return { kind: "gnd", volts: 0 };
        const ar = parseBoardPinAtJunction(cur, components, pinLevelsByBoard);
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
 * Détecte le câblage CD4511 A…D → D0…D3 (UNO) ou GPIO0…GPIO3 (ESP32).
 */
export function detectPortDMappingForCd4511(cd4511Label, boardLabel, boardType, wires, autoJunctions = []) {
    const map = {};
    const re = bcdInputJonctionRegex(boardLabel, boardType);
    for (const name of Object.keys(CD4511_BCD_INPUTS)) {
        const jid = `${cd4511Label}_${name}`;
        const net = reachableJonctions(jid, wires, autoJunctions);
        let pinNum = null;
        for (const j of net) {
            const m = re.exec(j);
            if (m) {
                pinNum = parseInt(m[1], 10);
                break;
            }
        }
        if (pinNum == null) return null;
        map[name] = pinNum;
    }
    return map;
}

function findBoardPortDMappingForCd4511(cd4511Label, components, wires, autoJunctions) {
    for (const comp of components) {
        if (!isMicroBoardType(comp.type) || !comp.label) continue;
        applyArduinoSketchToComponent(comp);
        const map = detectPortDMappingForCd4511(cd4511Label, comp.label, comp.type, wires, autoJunctions);
        if (map) return { board: comp, map };
    }
    return null;
}

function pinLabelForBcdBit(boardType, bitNum) {
    const prof = boardProfile(boardType);
    if (isEsp32BoardType(boardType)) return `${prof.bcdPinPrefix}${bitNum}`;
    return `D${bitNum}`;
}

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

function bcdFromMappedPortDAtTime(board, map, tSec) {
    if (board?.liveLevels || arduinoGpioIsTimeVarying(board)) {
        const levels = resolvePinLevelsAt(board, tSec);
        let bcd = 0;
        for (const [name, bcdBit] of Object.entries(CD4511_BCD_INPUTS)) {
            const dPin = map[name];
            const label = pinLabelForBcdBit(board.type, dPin);
            if (levels[label] === 1 || levels[label] === "1" || levels[label] === true) {
                bcd |= 1 << bcdBit;
            }
        }
        return bcd;
    }
    if (isEsp32BoardType(board.type)) {
        return bcdFromMappedGpioLevels(board.pinLevels || {}, map);
    }
    return bcdFromPortDRegister(board.avrRegisters?.PORTD ?? 0, map);
}

function bcdFromMappedGpioLevels(levels, map) {
    let bcd = 0;
    for (const [name, bcdBit] of Object.entries(CD4511_BCD_INPUTS)) {
        const dPin = map[name];
        const label = `GPIO${dPin}`;
        if (levels[label] === 1 || levels[label] === "1" || levels[label] === true) {
            bcd |= 1 << bcdBit;
        }
    }
    return bcd;
}

function bcdFromTrace(cd4511Label, components, wires, tSec, autoJunctions) {
    let bcd = 0;
    let any = false;
    for (const [name, idx] of Object.entries(CD4511_BCD_INPUTS)) {
        const jid = `${cd4511Label}_${name}`;
        const v = traceJonctionToIdealVolts(jid, components, wires, tSec, autoJunctions);
        if (v == null) continue;
        any = true;
        if (v >= 1.0) bcd |= 1 << idx;
    }
    return any ? bcd : null;
}

export function getIdealArduinoBcdForCd4511(cd4511Label, components, wires, tSec = 0, autoJunctions = []) {
    const linked = findBoardPortDMappingForCd4511(cd4511Label, components, wires, autoJunctions);
    if (linked) {
        return bcdFromMappedPortDAtTime(linked.board, linked.map, tSec);
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

const BARGRAPH_LIT_DELTA_V = 0.35;

export function getIdealBargraphFromArduino(barLabel, components, wires, tSec = 0, autoJunctions = []) {
    if (!barLabel) return null;
    const vCom = traceJonctionToIdealVolts(`${barLabel}_COM`, components, wires, tSec, autoJunctions);
    const vc = vCom != null ? vCom : 0;
    const segments = {};
    let anyDrive = false;
    for (let i = 1; i <= 10; i++) {
        const name = `s${i}`;
        const v = traceJonctionToIdealVolts(`${barLabel}_${name}`, components, wires, tSec, autoJunctions);
        if (v == null) {
            segments[name] = false;
            continue;
        }
        anyDrive = true;
        segments[name] = v - vc >= BARGRAPH_LIT_DELTA_V;
    }
    return anyDrive ? { segments } : null;
}
