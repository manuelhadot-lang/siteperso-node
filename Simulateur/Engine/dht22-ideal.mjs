/**
 * Grove DHT22 — câblage DATA/VCC/GND vers Arduino UNO.
 */

import { applyArduinoSketchToComponent } from "./arduino-sketch-parse.mjs";
import { parseDht22FromSketch, buildDhtVarBindingsFromBody } from "./dht22-sketch-parse.mjs";
import { reachableJonctions } from "./hc90-cascade.mjs";

function isDhtPowered(dhtLabel, components, wires, autoJunctions) {
    for (const pin of ["VCC", "GND"]) {
        const j = `${dhtLabel}_${pin}`;
        const net = reachableJonctions(j, wires, autoJunctions);
        let ok = false;
        for (const comp of components) {
            if (pin === "VCC") {
                if (comp.type === "vcc" && net.has(`${comp.label}_out`)) ok = true;
                if (comp.type === "battery" && net.has(`${comp.label}_out`)) ok = true;
                if (comp.type === "arduino_uno" && (net.has(`${comp.label}_5V`) || net.has(`${comp.label}_3V3`))) {
                    ok = true;
                }
            } else {
                if (comp.type === "gnd" && net.has(`${comp.label}_out`)) ok = true;
                if (comp.type === "battery" && net.has(`${comp.label}_in`)) ok = true;
                if (comp.type === "arduino_uno" && (net.has(`${comp.label}_GND`) || net.has(`${comp.label}_GND2`))) {
                    ok = true;
                }
            }
        }
        if (!ok) return false;
    }
    return true;
}

function dataPinOnUno(dhtLabel, unoLabel, wires, autoJunctions) {
    const net = reachableJonctions(`${dhtLabel}_DATA`, wires, autoJunctions);
    for (let d = 0; d <= 13; d++) {
        const label = `D${d}`;
        if (net.has(`${unoLabel}_${label}`)) return label;
    }
    return null;
}

/**
 * @returns {{ uno: object | null, wired: boolean, dataPin: string | null }}
 */
export function findUnoForGroveDht22(dhtLabel, components, wires, autoJunctions = []) {
    const dht = components.find((c) => c.label === dhtLabel && c.type === "grove_dht22");
    if (!dht || !isDhtPowered(dhtLabel, components, wires, autoJunctions)) {
        return { uno: null, wired: false, dataPin: null };
    }

    const candidates = components.filter((c) => c.type === "arduino_uno");
    candidates.sort((a, b) => (b.lastCompileOk ? 1 : 0) - (a.lastCompileOk ? 1 : 0));

    for (const uno of candidates) {
        const dataPin = dataPinOnUno(dhtLabel, uno.label, wires, autoJunctions);
        if (dataPin) return { uno, wired: true, dataPin };
    }
    return { uno: null, wired: false, dataPin: null };
}

export function isGroveDht22WiredToUno(dhtLabel, components, wires, autoJunctions = []) {
    return findUnoForGroveDht22(dhtLabel, components, wires, autoJunctions).wired;
}

/** Grove DHT22 câblé sur une broche DATA donnée de l'UNO. */
export function findGroveDht22ForUnoDataPin(unoLabel, dataPin, components, wires, autoJunctions = []) {
    if (!unoLabel || !dataPin) return null;
    for (const comp of components) {
        if (comp.type !== "grove_dht22") continue;
        const link = findUnoForGroveDht22(comp.label, components, wires, autoJunctions);
        if (link.wired && link.uno?.label === unoLabel && link.dataPin === dataPin) return comp;
    }
    return null;
}

/**
 * Résout dht.readTemperature() / readHumidity() dans lcd.print() — valeurs du composant câblé.
 * @returns {string | null}
 */
export function resolveDhtPrintArg(arg, sketch, unoLabel, components, wires, autoJunctions = []) {
    const t = String(arg || "").trim();
    if (!t || !sketch || !unoLabel) return null;
    const parsed = parseDht22FromSketch(sketch);
    if (!parsed?.pinLabel) return null;
    const { varName, pinLabel } = parsed;
    const tempRe = new RegExp(`\\b${varName}\\.readTemperature\\s*\\(\\s*\\)`, "i");
    const humRe = new RegExp(`\\b${varName}\\.readHumidity\\s*\\(\\s*\\)`, "i");
    if (!tempRe.test(t) && !humRe.test(t)) return null;

    const dht = findGroveDht22ForUnoDataPin(unoLabel, pinLabel, components, wires, autoJunctions);
    if (!dht) return null;

    const temperature = Number.isFinite(dht.temperature) ? dht.temperature : 24;
    const humidity = Number.isFinite(dht.humidity) ? dht.humidity : 55;
    if (tempRe.test(t)) return String(Math.round(temperature * 10) / 10);
    if (humRe.test(t)) return String(Math.round(humidity));
    return null;
}

/** Variables locales (float t = dht.readTemperature(); lcd.print(t);). */
export function buildDhtVarBindings(body, sketch, unoLabel, components, wires, autoJunctions = []) {
    const parsed = parseDht22FromSketch(sketch);
    if (!parsed?.pinLabel) return {};
    const dht = findGroveDht22ForUnoDataPin(unoLabel, parsed.pinLabel, components, wires, autoJunctions);
    if (!dht) return {};
    const temperature = Number.isFinite(dht.temperature) ? dht.temperature : 24;
    const humidity = Number.isFinite(dht.humidity) ? dht.humidity : 55;
    return buildDhtVarBindingsFromBody(body, parsed.varName, temperature, humidity);
}

/**
 * @returns {{ wired: boolean, active: boolean, temperature: number | null, humidity: number | null, dataPin: string | null, sensorType: string | null }}
 */
export function getIdealDht22Reading(dhtLabel, components, wires, autoJunctions = [], _elapsedSec = 0) {
    const dht = components.find((c) => c.label === dhtLabel && c.type === "grove_dht22");
    const temperature = Number.isFinite(dht?.temperature) ? dht.temperature : 24;
    const humidity = Number.isFinite(dht?.humidity) ? dht.humidity : 55;

    const { uno, wired, dataPin } = findUnoForGroveDht22(dhtLabel, components, wires, autoJunctions);
    if (!wired || !uno) {
        return { wired: false, active: false, temperature: null, humidity: null, dataPin: null, sensorType: null };
    }

    applyArduinoSketchToComponent(uno);
    const parsed = parseDht22FromSketch(uno.sketch || "");
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
