/**
 * Grove DHT22 — câblage DATA/VCC/GND vers Arduino UNO ou ESP32-C3.
 */

import { applyArduinoSketchToComponent } from "./arduino-sketch-parse.mjs";
import { parseDht22FromSketch, buildDhtVarBindingsFromBody } from "./dht22-sketch-parse.mjs";
import { reachableJonctions } from "./hc90-cascade.mjs";
import { boardProfile, dataPinLabelsForBoard, isMicroBoardType } from "./micro-board-config.mjs";

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

function isDhtPowered(dhtLabel, components, wires, autoJunctions) {
    for (const pin of ["VCC", "GND"]) {
        const j = `${dhtLabel}_${pin}`;
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

function dataPinOnBoard(dhtLabel, boardLabel, boardType, wires, autoJunctions) {
    const net = reachableJonctions(`${dhtLabel}_DATA`, wires, autoJunctions);
    for (const label of dataPinLabelsForBoard(boardType)) {
        if (net.has(`${boardLabel}_${label}`)) return label;
    }
    return null;
}

/**
 * @returns {{ board: object | null, wired: boolean, dataPin: string | null }}
 */
export function findBoardForGroveDht22(dhtLabel, components, wires, autoJunctions = []) {
    const dht = components.find((c) => c.label === dhtLabel && c.type === "grove_dht22");
    if (!dht || !isDhtPowered(dhtLabel, components, wires, autoJunctions)) {
        return { board: null, wired: false, dataPin: null };
    }

    const candidates = components.filter((c) => isMicroBoardType(c.type));
    candidates.sort((a, b) => (b.lastCompileOk ? 1 : 0) - (a.lastCompileOk ? 1 : 0));

    for (const board of candidates) {
        const dataPin = dataPinOnBoard(dhtLabel, board.label, board.type, wires, autoJunctions);
        if (dataPin) return { board, wired: true, dataPin };
    }
    return { board: null, wired: false, dataPin: null };
}

/** @deprecated alias */
export function findUnoForGroveDht22(dhtLabel, components, wires, autoJunctions = []) {
    const { board, wired, dataPin } = findBoardForGroveDht22(dhtLabel, components, wires, autoJunctions);
    return { uno: board, wired, dataPin };
}

export function isGroveDht22WiredToBoard(dhtLabel, components, wires, autoJunctions = []) {
    return findBoardForGroveDht22(dhtLabel, components, wires, autoJunctions).wired;
}

/** @deprecated alias UNO */
export function isGroveDht22WiredToUno(dhtLabel, components, wires, autoJunctions = []) {
    return isGroveDht22WiredToBoard(dhtLabel, components, wires, autoJunctions);
}

export function findGroveDht22ForBoardDataPin(boardLabel, dataPin, components, wires, autoJunctions = []) {
    if (!boardLabel || !dataPin) return null;
    for (const comp of components) {
        if (comp.type !== "grove_dht22") continue;
        const link = findBoardForGroveDht22(comp.label, components, wires, autoJunctions);
        if (link.wired && link.board?.label === boardLabel && link.dataPin === dataPin) return comp;
    }
    return null;
}

/** @deprecated alias */
export function findGroveDht22ForUnoDataPin(unoLabel, dataPin, components, wires, autoJunctions = []) {
    return findGroveDht22ForBoardDataPin(unoLabel, dataPin, components, wires, autoJunctions);
}

export function resolveDhtPrintArg(arg, sketch, boardLabel, components, wires, autoJunctions = []) {
    const t = String(arg || "").trim();
    if (!t || !sketch || !boardLabel) return null;
    const board = components.find((c) => c.label === boardLabel && isMicroBoardType(c.type));
    const parsed = parseDht22FromSketch(sketch, board?.type || "arduino_uno");
    if (!parsed?.pinLabel) return null;
    const { varName, pinLabel } = parsed;
    const tempRe = new RegExp(`\\b${varName}\\.readTemperature\\s*\\(\\s*\\)`, "i");
    const humRe = new RegExp(`\\b${varName}\\.readHumidity\\s*\\(\\s*\\)`, "i");
    if (!tempRe.test(t) && !humRe.test(t)) return null;

    const dht = findGroveDht22ForBoardDataPin(boardLabel, pinLabel, components, wires, autoJunctions);
    if (!dht) return null;

    const temperature = Number.isFinite(dht.temperature) ? dht.temperature : 24;
    const humidity = Number.isFinite(dht.humidity) ? dht.humidity : 55;
    if (tempRe.test(t)) return String(Math.round(temperature * 10) / 10);
    if (humRe.test(t)) return String(Math.round(humidity));
    return null;
}

export function buildDhtVarBindings(body, sketch, boardLabel, components, wires, autoJunctions = []) {
    const board = components.find((c) => c.label === boardLabel && isMicroBoardType(c.type));
    const parsed = parseDht22FromSketch(sketch, board?.type || "arduino_uno");
    if (!parsed?.pinLabel) return {};
    const dht = findGroveDht22ForBoardDataPin(boardLabel, parsed.pinLabel, components, wires, autoJunctions);
    if (!dht) return {};
    const temperature = Number.isFinite(dht.temperature) ? dht.temperature : 24;
    const humidity = Number.isFinite(dht.humidity) ? dht.humidity : 55;
    return buildDhtVarBindingsFromBody(body, parsed.varName, temperature, humidity);
}

/** Lectures DHT pour le runtime Serial (loop live). */
export function resolveDhtReadingsForBoard(board, components, wires, autoJunctions = []) {
    if (!board?.label || !board?.sketch) return null;
    const parsed = parseDht22FromSketch(board.sketch, board.type || "arduino_uno");
    if (!parsed?.pinLabel) return null;
    const dht = findGroveDht22ForBoardDataPin(
        board.label,
        parsed.pinLabel,
        components,
        wires,
        autoJunctions
    );
    if (!dht) return null;
    return {
        varName: parsed.varName,
        temperature: Number.isFinite(dht.temperature) ? dht.temperature : 24,
        humidity: Number.isFinite(dht.humidity) ? dht.humidity : 55,
    };
}

export function getIdealDht22Reading(dhtLabel, components, wires, autoJunctions = [], _elapsedSec = 0) {
    const dht = components.find((c) => c.label === dhtLabel && c.type === "grove_dht22");
    const temperature = Number.isFinite(dht?.temperature) ? dht.temperature : 24;
    const humidity = Number.isFinite(dht?.humidity) ? dht.humidity : 55;

    const { board, wired, dataPin } = findBoardForGroveDht22(dhtLabel, components, wires, autoJunctions);
    if (!wired || !board) {
        return { wired: false, active: false, temperature: null, humidity: null, dataPin: null, sensorType: null };
    }

    applyArduinoSketchToComponent(board);
    const parsed = parseDht22FromSketch(board.sketch || "", board.type || "arduino_uno");
    if (!parsed) {
        return { wired: true, active: false, temperature: null, humidity: null, dataPin, sensorType: null };
    }

    return {
        wired: true,
        active: true,
        temperature,
        humidity,
        dataPin,
        sensorType: parsed.sensorType,
    };
}
