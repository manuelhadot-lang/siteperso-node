/**
 * Entrées analogiques Arduino (A0–A5, 10 bits) / ESP32 (GPIO, 12 bits comme Arduino-ESP32).
 */

import { reachableJonctions } from "./hc90-cascade.mjs";
import { boardProfile, isMicroBoardType } from "./micro-board-config.mjs";
import { tryLm7805OutputVoltage } from "./lm7805.mjs";
import { tryIr2104GateVoltage } from "./ir2104.mjs";
import { tryL293dOutputVoltage } from "./l293d.mjs";
import { ldrResistanceOhm } from "./ldr.mjs";
import { upesyGpio35Volts, UPESY_DEFAULT_VBAT } from "../esp32-upesy-lp-layout.js";

export const ADC_MAX_10 = 1023;
export const ADC_MAX_12 = 4095;
/** Impédance d'entrée ADC simulée (évite une LDR seule collée à 3,3 V via 10 MΩ SPICE). */
export const ADC_INPUT_OHM = 1e6;

export function voltageToAdc(volts, vref = 5, adcMax = ADC_MAX_10) {
    if (!Number.isFinite(volts)) return 0;
    const max = Number.isFinite(adcMax) && adcMax > 0 ? adcMax : ADC_MAX_10;
    const v = Math.max(0, Math.min(vref, volts));
    return Math.round((v / vref) * max);
}

/** Tension fixe d'une jonction d'alimentation (broches UNO, GND, VCC…). */
export function fixedVoltageAtJunction(jid) {
    if (!jid) return null;
    if (jid.startsWith("GND") || /^GND\d+_/.test(jid)) return 0;
    if (/_GND2?$/.test(jid)) return 0;
    if (/_5V$/.test(jid) || jid.endsWith("_VCC")) return 5;
    if (/_3V3$/.test(jid)) return 3.3;
    return null;
}

function parseRailVolts(value, fallback = 5) {
    if (value == null || value === "") return fallback;
    const n = parseFloat(String(value).trim().replace(",", "."));
    return Number.isFinite(n) ? n : fallback;
}

function parseResistorOhms(value) {
    const s = String(value || "1k").trim().toLowerCase();
    const m = s.match(/^([\d.]+)\s*([kmg]?)$/);
    if (!m) return 1000;
    let n = parseFloat(m[1]);
    if (!Number.isFinite(n) || n <= 0) return 1000;
    if (m[2] === "k") n *= 1e3;
    else if (m[2] === "m") n *= 1e6;
    else if (m[2] === "g") n *= 1e9;
    return n;
}

function componentOhms(comp) {
    if (comp.type === "ldr") return ldrResistanceOhm(comp);
    if (comp.type === "resistor") return parseResistorOhms(comp.value);
    return null;
}

function gsinVoltageAt(comp, tSec) {
    const a = comp.peakAmplitude ?? 5;
    const f = comp.frequency ?? 1000;
    const o = comp.offset ?? 0;
    return o + a * Math.sin(2 * Math.PI * f * Math.max(0, tSec));
}

function gimpVoltageAt(comp, tSec) {
    const rail = comp.voltageRail ?? 5;
    const f = comp.frequency ?? 2;
    const duty = (comp.dutyCycle ?? 50) / 100;
    if (f <= 0) return 0;
    const period = 1 / f;
    const phase = ((tSec % period) + period) % period;
    return phase < period * duty ? rail : 0;
}

function gsqrVoltageAt(comp, tSec) {
    const a = comp.peakAmplitude ?? 5;
    const f = comp.frequency ?? 1000;
    const o = comp.offset ?? 0;
    if (f <= 0) return o;
    const period = 1 / f;
    const phase = ((tSec % period) + period) % period;
    return o + (phase < period / 2 ? a : -a);
}

function voltageFromVoltmetersOnNet(net, voltmeters) {
    if (!voltmeters || typeof voltmeters !== "object") return null;
    for (const [name, measure] of Object.entries(voltmeters)) {
        const v = typeof measure === "object" ? measure?.voltage : measure;
        if (!Number.isFinite(v)) continue;
        const inn = `${name}_in`;
        const out = `${name}_out`;
        if (net.has(inn) || net.has(out)) return v;
    }
    return null;
}

function collectResistiveLegs(jonctionId, ctx, visiting) {
    const { components, wires, autoJunctions = [] } = ctx;
    const net = reachableJonctions(jonctionId, wires, autoJunctions);
    const legs = [];
    for (const comp of components) {
        if ((comp.type !== "resistor" && comp.type !== "ldr") || !comp.label) continue;
        const inn = `${comp.label}_in`;
        const out = `${comp.label}_out`;
        if (!net.has(inn) && !net.has(out)) continue;
        if (net.has(inn) && net.has(out)) continue;
        const touch = net.has(inn) ? inn : out;
        const other = touch === inn ? out : inn;
        const branch = new Set(visiting);
        const vOther = resolveNetVoltage(other, ctx, branch);
        if (!Number.isFinite(vOther)) continue;
        const ohm = componentOhms(comp);
        if (!(ohm > 0)) continue;
        legs.push({ ohm, vOther });
    }
    return legs;
}

function netHasExternalAnalogNetwork(jonctionId, ctx) {
    const { components, wires, autoJunctions = [] } = ctx;
    const net = reachableJonctions(jonctionId, wires, autoJunctions);
    for (const comp of components) {
        if (!comp.label) continue;
        if (comp.type === "resistor" || comp.type === "ldr") {
            const inn = `${comp.label}_in`;
            const out = `${comp.label}_out`;
            if (net.has(inn) || net.has(out)) return true;
        }
        if (comp.type === "potentiometer" && net.has(`${comp.label}_wip`)) return true;
    }
    return false;
}

function solveResistiveLegs(legs) {
    let gSum = 0;
    let iSum = 0;
    for (const { ohm, vOther } of legs) {
        if (!(ohm > 0) || !Number.isFinite(vOther)) continue;
        const g = 1 / ohm;
        gSum += g;
        iSum += vOther * g;
    }
    if (gSum <= 0) return null;
    return iSum / gSum;
}

/** Pont résistif (LDR, R, …) + impédance ADC optionnelle vers GND. */
function tryResistorDivider(jonctionId, ctx, visiting) {
    const legs = collectResistiveLegs(jonctionId, ctx, visiting);
    const adcOhm = Number(ctx.adcGndOhm);
    if (legs.length >= 2) return solveResistiveLegs(legs);
    if (legs.length === 1 && adcOhm > 0) {
        return solveResistiveLegs([...legs, { ohm: adcOhm, vOther: 0 }]);
    }
    return null;
}

function gpioOutputVoltsOnNet(net, components) {
    for (const comp of components) {
        if (!isMicroBoardType(comp.type) || !comp.label) continue;
        const prof = boardProfile(comp.type);
        for (const j of net) {
            if (!j.startsWith(`${comp.label}_`)) continue;
            const suffix = j.slice(comp.label.length + 1);
            if (!/^A\d+$|^D\d+$|^GPIO\d+$/.test(suffix)) continue;
            const modes = comp.pinModes || {};
            if (modes[suffix] !== "OUTPUT") continue;
            const levels = comp.liveLevels || comp.pinLevels || {};
            return levels[suffix] ? prof.logicVolts : 0;
        }
    }
    return null;
}

/**
 * Même réseau électrique en traversant les résistances / ampèremètres en série
 * (ex. GPIO2 → 330 Ω → LED).
 */
export function reachableJonctionsViaSeriesPassives(jonctionId, ctx = {}) {
    const { components = [], wires, autoJunctions = [] } = ctx;
    const all = new Set();
    const queue = [];
    if (jonctionId) queue.push(jonctionId);
    while (queue.length) {
        const j = queue.shift();
        if (!j) continue;
        const net = reachableJonctions(j, wires, autoJunctions);
        let grew = false;
        for (const id of net) {
            if (all.has(id)) continue;
            all.add(id);
            grew = true;
        }
        if (!grew && !all.has(j)) all.add(j);
        for (const comp of components) {
            if ((comp.type !== "resistor" && comp.type !== "ammeter") || !comp.label) continue;
            const inn = `${comp.label}_in`;
            const out = `${comp.label}_out`;
            if (all.has(inn) && !all.has(out)) queue.push(out);
            if (all.has(out) && !all.has(inn)) queue.push(inn);
        }
    }
    return all;
}

function tryMicroBoardGpioOutputVoltage(jonctionId, ctx) {
    const { components = [], wires, autoJunctions = [] } = ctx;
    const net = reachableJonctions(jonctionId, wires, autoJunctions);
    const v = gpioOutputVoltsOnNet(net, components);
    return Number.isFinite(v) ? v : null;
}

/**
 * Tension (V) sur le réseau câblé à une jonction.
 */
export function resolveNetVoltage(jonctionId, ctx, visiting = new Set()) {
    if (!jonctionId || visiting.has(jonctionId)) return null;
    visiting.add(jonctionId);

    const { components, wires, autoJunctions = [], tSec = 0, getVoltageAtJonction, voltmeters } = ctx;
    const net = reachableJonctions(jonctionId, wires, autoJunctions);

    const regV = tryLm7805OutputVoltage(jonctionId, ctx, resolveNetVoltage, visiting);
    if (Number.isFinite(regV)) return regV;

    const gateV = tryIr2104GateVoltage(jonctionId, ctx, resolveNetVoltage, visiting);
    if (Number.isFinite(gateV)) return gateV;

    const l293V = tryL293dOutputVoltage(jonctionId, ctx, resolveNetVoltage, visiting);
    if (Number.isFinite(l293V)) return l293V;

    for (const j of net) {
        const fixed = fixedVoltageAtJunction(j);
        if (fixed !== null) return fixed;
    }

    const gpioOutV = tryMicroBoardGpioOutputVoltage(jonctionId, ctx);
    if (Number.isFinite(gpioOutV)) return gpioOutV;

    for (const comp of components) {
        if (!comp.label) continue;
        if (comp.type === "vcc") {
            for (const j of net) {
                if (j.startsWith(`${comp.label}_`)) return parseRailVolts(comp.value, 5);
            }
        }
        if (comp.type === "battery" && net.has(`${comp.label}_in`)) {
            return parseRailVolts(comp.value, 5);
        }
        if (comp.type === "logic_terminal") {
            if (net.has(`${comp.label}_out`) || net.has(`${comp.label}_in`)) {
                return comp.state ? 5 : 0;
            }
        }
    }

    for (const comp of components) {
        if (comp.type !== "potentiometer" || !comp.label) continue;
        const wip = `${comp.label}_wip`;
        if (!net.has(wip)) continue;
        const branch = new Set(visiting);
        const vIn = resolveNetVoltage(`${comp.label}_in`, ctx, branch);
        const vOut = resolveNetVoltage(`${comp.label}_out`, ctx, branch);
        const pos = Math.min(100, Math.max(0, Number(comp.position) || 50)) / 100;
        const vi = Number.isFinite(vIn) ? vIn : 5;
        const vo = Number.isFinite(vOut) ? vOut : 0;
        return vi * (1 - pos) + vo * pos;
    }

    const dividerV = tryResistorDivider(jonctionId, ctx, visiting);
    if (Number.isFinite(dividerV)) return dividerV;

    for (const comp of components) {
        if (!comp.label) continue;
        const outJ = `${comp.label}_out`;
        if (!net.has(outJ)) continue;
        if (comp.type === "gsin") return gsinVoltageAt(comp, tSec);
        if (comp.type === "gimp") return gimpVoltageAt(comp, tSec);
        if (comp.type === "gsqr") return gsqrVoltageAt(comp, tSec);
    }

    for (const comp of components) {
        if (!isMicroBoardType(comp.type) || !comp.label) continue;
        for (const j of net) {
            if (!j.startsWith(`${comp.label}_`)) continue;
            const suffix = j.slice(comp.label.length + 1);
            if (comp.type === "esp32_upesy_lp" && suffix === "GPIO35"
                && !netHasExternalAnalogNetwork(j, ctx)) {
                return upesyGpio35Volts(comp.vbat ?? UPESY_DEFAULT_VBAT);
            }
        }
    }

    const vmV = voltageFromVoltmetersOnNet(net, voltmeters);
    if (Number.isFinite(vmV)) return vmV;

    if (typeof getVoltageAtJonction === "function") {
        const v = getVoltageAtJonction(jonctionId);
        if (Number.isFinite(v)) return v;
    }

    return null;
}

/** Valeurs ADC (UNO 0–1023, ESP32 0–4095) pour les entrées analogiques de la carte. */
export function readBoardAnalogInputs(board, ctx = {}) {
    const out = {};
    if (!board?.label) return out;
    const type = isMicroBoardType(board.type) ? board.type : "arduino_uno";
    const prof = boardProfile(type);
    const adcMax = prof.adcMax ?? ADC_MAX_10;
    const analogCtx = {
        ...ctx,
        adcGndOhm: Number(ctx.adcGndOhm) > 0 ? ctx.adcGndOhm : ADC_INPUT_OHM,
    };
    for (const label of prof.analogPinLabels()) {
        const jid = `${board.label}_${label}`;
        if (board.type === "esp32_upesy_lp" && label === "GPIO35"
            && !netHasExternalAnalogNetwork(jid, analogCtx)) {
            const v = upesyGpio35Volts(board.vbat ?? UPESY_DEFAULT_VBAT);
            out[label] = voltageToAdc(v, prof.adcVref, adcMax);
            continue;
        }
        const v = resolveNetVoltage(jid, analogCtx);
        out[label] = voltageToAdc(Number.isFinite(v) ? v : 0, prof.adcVref, adcMax);
    }
    return out;
}

/** @deprecated alias UNO */
export function readUnoAnalogInputs(uno, ctx) {
    return readBoardAnalogInputs(uno, ctx);
}
