/**
 * Grove TSL2591 — câblage SDA/SCL/VCC/GND vers Arduino UNO ou ESP32-C3.
 */

import { applyArduinoSketchToComponent } from "./arduino-sketch-parse.mjs";
import {
    parseTsl2591FromSketch,
    buildTslVarBindingsFromBody,
    luxToRawChannels,
} from "./tsl2591-sketch-parse.mjs";
import { reachableJonctions } from "./hc90-cascade.mjs";
import { boardProfile, isMicroBoardType } from "./micro-board-config.mjs";

const GROVE_TSL2591_DEFAULT_I2C = 0x29;

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

function isTslI2cWiredToBoard(tslLabel, board, wires, autoJunctions) {
    const prof = boardProfile(board.type);
    for (const [tslPin, boardPin] of [
        ["SDA", prof.i2c.sda.name],
        ["SCL", prof.i2c.scl.name],
    ]) {
        const tslJ = `${tslLabel}_${tslPin}`;
        const boardJ = `${board.label}_${boardPin}`;
        const net = reachableJonctions(tslJ, wires, autoJunctions);
        if (!net.has(boardJ)) return false;
    }
    return true;
}

function isTslPowered(tslLabel, components, wires, autoJunctions) {
    for (const pin of ["VCC", "GND"]) {
        const j = `${tslLabel}_${pin}`;
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

/**
 * @returns {{ board: object | null, wired: boolean }}
 */
export function findBoardForGroveTsl2591(tslLabel, components, wires, autoJunctions = []) {
    const tsl = components.find((c) => c.label === tslLabel && c.type === "grove_tsl2591");
    if (!tsl || !isTslPowered(tslLabel, components, wires, autoJunctions)) {
        return { board: null, wired: false };
    }

    const candidates = components.filter((c) => isMicroBoardType(c.type));
    candidates.sort((a, b) => (b.lastCompileOk ? 1 : 0) - (a.lastCompileOk ? 1 : 0));

    for (const board of candidates) {
        if (isTslI2cWiredToBoard(tslLabel, board, wires, autoJunctions)) {
            return { board, wired: true };
        }
    }
    return { board: null, wired: false };
}

export function isGroveTsl2591WiredToBoard(tslLabel, components, wires, autoJunctions = []) {
    return findBoardForGroveTsl2591(tslLabel, components, wires, autoJunctions).wired;
}

export function findGroveTsl2591ForBoard(boardLabel, components, wires, autoJunctions = [], i2cAddress = GROVE_TSL2591_DEFAULT_I2C) {
    if (!boardLabel) return null;
    for (const comp of components) {
        if (comp.type !== "grove_tsl2591") continue;
        const link = findBoardForGroveTsl2591(comp.label, components, wires, autoJunctions);
        if (!link.wired || link.board?.label !== boardLabel) continue;
        const addr = comp.i2cAddress ?? GROVE_TSL2591_DEFAULT_I2C;
        if (addr === i2cAddress) return comp;
    }
    return null;
}

function readingFromComponent(tsl) {
    const lux = Number.isFinite(tsl?.lux) ? tsl.lux : 100;
    const { full, ir } = luxToRawChannels(lux);
    return { lux, full, ir };
}

export function resolveTslPrintArg(arg, sketch, boardLabel, components, wires, autoJunctions = []) {
    const t = String(arg || "").trim();
    if (!t || !sketch || !boardLabel) return null;
    const parsed = parseTsl2591FromSketch(sketch);
    if (!parsed) return null;
    const { varName, i2cAddress } = parsed;
    const luxRe = new RegExp(`\\b${varName}\\.calculateLux\\s*\\(`, "i");
    const fullRe = new RegExp(`\\b${varName}\\.getFullLuminosity\\s*\\(\\s*\\)`, "i");
    if (!luxRe.test(t) && !fullRe.test(t)) return null;

    const tsl = findGroveTsl2591ForBoard(boardLabel, components, wires, autoJunctions, i2cAddress);
    if (!tsl) return null;

    const { lux, full, ir } = readingFromComponent(tsl);
    if (luxRe.test(t)) return String(Math.round(lux * 10) / 10);
    if (fullRe.test(t)) {
        const f = Math.round(full) & 0xffff;
        const i = Math.round(ir) & 0xffff;
        return String((f << 16) | i);
    }
    return null;
}

export function buildTslVarBindings(body, sketch, boardLabel, components, wires, autoJunctions = []) {
    const parsed = parseTsl2591FromSketch(sketch);
    if (!parsed) return {};
    const tsl = findGroveTsl2591ForBoard(
        boardLabel,
        components,
        wires,
        autoJunctions,
        parsed.i2cAddress
    );
    if (!tsl) return {};
    const { lux, full, ir } = readingFromComponent(tsl);
    return buildTslVarBindingsFromBody(body, parsed.varName, lux, full, ir);
}

/** Lectures TSL2591 pour le runtime Serial (loop live). */
export function resolveTslReadingsForBoard(board, components, wires, autoJunctions = []) {
    if (!board?.label || !board?.sketch) return null;
    const parsed = parseTsl2591FromSketch(board.sketch);
    if (!parsed) return null;
    const tsl = findGroveTsl2591ForBoard(
        board.label,
        components,
        wires,
        autoJunctions,
        parsed.i2cAddress
    );
    if (!tsl) return null;
    const { lux, full, ir } = readingFromComponent(tsl);
    return { varName: parsed.varName, lux, full, ir };
}

export function getIdealTsl2591Reading(tslLabel, components, wires, autoJunctions = [], _elapsedSec = 0) {
    const tsl = components.find((c) => c.label === tslLabel && c.type === "grove_tsl2591");
    const { lux, full, ir } = readingFromComponent(tsl);
    const { board, wired } = findBoardForGroveTsl2591(tslLabel, components, wires, autoJunctions);
    if (!wired || !board) {
        return { wired: false, active: false, lux: null, full: null, ir: null };
    }

    applyArduinoSketchToComponent(board);
    const parsed = parseTsl2591FromSketch(board.sketch || "");
    if (!parsed) {
        return { wired: true, active: false, lux: null, full: null, ir: null };
    }

    return { wired: true, active: true, lux, full, ir };
}
