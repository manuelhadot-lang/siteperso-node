/**
 * Grove BMP280 — câblage SDA/SCL/VCC/GND vers Arduino UNO ou ESP32-C3.
 */

import { applyArduinoSketchToComponent } from "./arduino-sketch-parse.mjs";
import {
    parseBmp280FromSketch,
    buildBmpVarBindingsFromBody,
    pressureToAltitude,
} from "./bmp280-sketch-parse.mjs";
import { reachableJonctions } from "./hc90-cascade.mjs";
import { boardProfile, isMicroBoardType, parseSketchI2cPins } from "./micro-board-config.mjs";

const GROVE_BMP280_DEFAULT_I2C = 0x76;
const DEFAULT_PRESSURE_HPA = 1013.25;
const DEFAULT_TEMPERATURE = 22;

function isMicroBoardPowered(comp, net, rail) {
    const prof = boardProfile(comp.type);
    if (rail === "VCC") {
        for (const pin of prof.vccPins) {
            if (net.has(`${comp.label}_${pin}`)) return true;
        }
    } else {
        for (const pin of prof.gndPins) {
            if (net.has(`${comp.label}_${pin}`)) return true;
        }
    }
    return false;
}

function isBmpI2cWiredToBoard(bmpLabel, board, wires, autoJunctions) {
    const { sda, scl } = parseSketchI2cPins(board?.sketch, board.type);
    for (const [bmpPin, boardPin] of [
        ["SDA", sda],
        ["SCL", scl],
    ]) {
        const bmpJ = `${bmpLabel}_${bmpPin}`;
        const boardJ = `${board.label}_${boardPin}`;
        const net = reachableJonctions(bmpJ, wires, autoJunctions);
        if (!net.has(boardJ)) return false;
    }
    return true;
}

function isBmpPowered(bmpLabel, components, wires, autoJunctions) {
    for (const pin of ["VCC", "GND"]) {
        const j = `${bmpLabel}_${pin}`;
        const net = reachableJonctions(j, wires, autoJunctions);
        let ok = false;
        for (const comp of components) {
            if (pin === "VCC") {
                if (comp.type === "vcc" && net.has(`${comp.label}_out`)) ok = true;
                if (comp.type === "battery" && net.has(`${comp.label}_out`)) ok = true;
                if (isMicroBoardType(comp.type) && isMicroBoardPowered(comp, net, "VCC")) ok = true;
            } else {
                if (comp.type === "gnd" && net.has(`${comp.label}_out`)) ok = true;
                if (comp.type === "battery" && net.has(`${comp.label}_in`)) ok = true;
                if (isMicroBoardType(comp.type) && isMicroBoardPowered(comp, net, "GND")) ok = true;
            }
        }
        if (!ok) return false;
    }
    return true;
}

export function findBoardForGroveBmp280(bmpLabel, components, wires, autoJunctions = []) {
    const bmp = components.find((c) => c.label === bmpLabel && c.type === "grove_bmp280");
    if (!bmp || !isBmpPowered(bmpLabel, components, wires, autoJunctions)) {
        return { board: null, wired: false };
    }

    const candidates = components.filter((c) => isMicroBoardType(c.type));
    candidates.sort((a, b) => (b.lastCompileOk ? 1 : 0) - (a.lastCompileOk ? 1 : 0));

    for (const board of candidates) {
        if (isBmpI2cWiredToBoard(bmpLabel, board, wires, autoJunctions)) {
            return { board, wired: true };
        }
    }
    return { board: null, wired: false };
}

export function isGroveBmp280WiredToBoard(bmpLabel, components, wires, autoJunctions = []) {
    return findBoardForGroveBmp280(bmpLabel, components, wires, autoJunctions).wired;
}

export function findGroveBmp280ForBoard(boardLabel, components, wires, autoJunctions = [], i2cAddress = GROVE_BMP280_DEFAULT_I2C) {
    if (!boardLabel) return null;
    for (const comp of components) {
        if (comp.type !== "grove_bmp280") continue;
        const link = findBoardForGroveBmp280(comp.label, components, wires, autoJunctions);
        if (!link.wired || link.board?.label !== boardLabel) continue;
        const addr = comp.i2cAddress ?? GROVE_BMP280_DEFAULT_I2C;
        if (addr === i2cAddress) return comp;
    }
    return null;
}

function readingFromComponent(bmp) {
    const temperature = Number.isFinite(bmp?.temperature) ? bmp.temperature : DEFAULT_TEMPERATURE;
    const pressureHpa = Number.isFinite(bmp?.pressureHpa) ? bmp.pressureHpa : DEFAULT_PRESSURE_HPA;
    const pressurePa = pressureHpa * 100;
    return { temperature, pressureHpa, pressurePa };
}

export function resolveBmpPrintArg(arg, sketch, boardLabel, components, wires, autoJunctions = []) {
    const t = String(arg || "").trim();
    if (!t || !sketch || !boardLabel) return null;
    const parsed = parseBmp280FromSketch(sketch);
    if (!parsed) return null;
    const { varName, i2cAddress } = parsed;
    const tempRe = new RegExp(`\\b${varName}\\.readTemperature\\s*\\(\\s*\\)`, "i");
    const pressRe = new RegExp(`\\b${varName}\\.readPressure\\s*\\(\\s*\\)`, "i");
    const pressDivRe = new RegExp(`\\b${varName}\\.readPressure\\s*\\(\\s*\\)\\s*/\\s*100(?:\\.0+)?`, "i");
    const altRe = new RegExp(`\\b${varName}\\.readAltitude\\s*\\(`, "i");
    if (!tempRe.test(t) && !pressRe.test(t) && !pressDivRe.test(t) && !altRe.test(t)) return null;

    const bmp = findGroveBmp280ForBoard(boardLabel, components, wires, autoJunctions, i2cAddress);
    if (!bmp) return null;

    const { temperature, pressurePa, pressureHpa } = readingFromComponent(bmp);
    if (tempRe.test(t)) return String(Math.round(temperature * 10) / 10);
    if (pressRe.test(t) || pressDivRe.test(t)) return String(Math.round(pressureHpa * 10) / 10);
    if (altRe.test(t)) {
        const seaM = t.match(/readAltitude\s*\(\s*([^)]*)\s*\)/i);
        let seaHpa = DEFAULT_PRESSURE_HPA;
        if (seaM?.[1]?.trim()) {
            const n = parseFloat(seaM[1]);
            if (Number.isFinite(n)) seaHpa = n;
        }
        return String(Math.round(pressureToAltitude(seaHpa, pressurePa) * 10) / 10);
    }
    return null;
}

export function buildBmpVarBindings(body, sketch, boardLabel, components, wires, autoJunctions = []) {
    const parsed = parseBmp280FromSketch(sketch);
    if (!parsed) return {};
    const bmp = findGroveBmp280ForBoard(
        boardLabel,
        components,
        wires,
        autoJunctions,
        parsed.i2cAddress
    );
    if (!bmp) return {};
    const { temperature, pressureHpa } = readingFromComponent(bmp);
    return buildBmpVarBindingsFromBody(body, parsed.varName, temperature, pressureHpa);
}

export function resolveBmpReadingsForBoard(board, components, wires, autoJunctions = []) {
    if (!board?.label || !board?.sketch) return null;
    const parsed = parseBmp280FromSketch(board.sketch);
    if (!parsed) return null;
    const bmp = findGroveBmp280ForBoard(
        board.label,
        components,
        wires,
        autoJunctions,
        parsed.i2cAddress
    );
    if (!bmp) return null;
    const { temperature, pressurePa, pressureHpa } = readingFromComponent(bmp);
    return { varName: parsed.varName, temperature, pressurePa, pressureHpa };
}

export function getIdealBmp280Reading(bmpLabel, components, wires, autoJunctions = [], _elapsedSec = 0) {
    const bmp = components.find((c) => c.label === bmpLabel && c.type === "grove_bmp280");
    const { temperature, pressureHpa, pressurePa } = readingFromComponent(bmp);
    const { board, wired } = findBoardForGroveBmp280(bmpLabel, components, wires, autoJunctions);
    if (!wired || !board) {
        return { wired: false, active: false, temperature: null, pressureHpa: null, pressurePa: null };
    }

    applyArduinoSketchToComponent(board);
    const parsed = parseBmp280FromSketch(board.sketch || "");
    if (!parsed) {
        return { wired: true, active: false, temperature: null, pressureHpa: null, pressurePa: null };
    }

    return { wired: true, active: true, temperature, pressureHpa, pressurePa };
}
