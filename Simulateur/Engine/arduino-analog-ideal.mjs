/**
 * Entrées analogiques Arduino (A0–A5) — tension du circuit → ADC 10 bits.
 */

import { reachableJonctions } from "./hc90-cascade.mjs";

const VREF = 5;
const ADC_MAX = 1023;

export function voltageToAdc(volts) {
    if (!Number.isFinite(volts)) return 0;
    const v = Math.max(0, Math.min(VREF, volts));
    return Math.round((v / VREF) * ADC_MAX);
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

function isGndJunction(jid) {
    return fixedVoltageAtJunction(jid) === 0;
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

/** Pont diviseur : deux résistances sur le même nœud. */
function tryResistorDivider(jonctionId, ctx, visiting) {
    const { components, wires, autoJunctions = [] } = ctx;
    const net = reachableJonctions(jonctionId, wires, autoJunctions);
    const legs = [];
    for (const comp of components) {
        if (comp.type !== "resistor" || !comp.label) continue;
        const inn = `${comp.label}_in`;
        const out = `${comp.label}_out`;
        if (!net.has(inn) && !net.has(out)) continue;
        const touch = net.has(inn) ? inn : out;
        const other = touch === inn ? out : inn;
        const branch = new Set(visiting);
        const vOther = resolveNetVoltage(other, ctx, branch);
        if (!Number.isFinite(vOther)) continue;
        legs.push({ ohm: parseResistorOhms(comp.value), vOther });
    }
    if (legs.length !== 2) return null;
    const [a, b] = legs;
    if (a.vOther === b.vOther) return a.vOther;
    const high = a.vOther > b.vOther ? a : b;
    const low = a.vOther > b.vOther ? b : a;
    const rTop = high.ohm;
    const rBot = low.ohm;
    if (rTop + rBot <= 0) return null;
    return low.vOther + (high.vOther - low.vOther) * (rBot / (rTop + rBot));
}

/**
 * Tension (V) sur le réseau câblé à une jonction.
 */
export function resolveNetVoltage(jonctionId, ctx, visiting = new Set()) {
    if (!jonctionId || visiting.has(jonctionId)) return null;
    visiting.add(jonctionId);

    const { components, wires, autoJunctions = [], tSec = 0, getVoltageAtJonction, voltmeters } = ctx;
    const net = reachableJonctions(jonctionId, wires, autoJunctions);

    for (const j of net) {
        const fixed = fixedVoltageAtJunction(j);
        if (fixed !== null) return fixed;
    }

    for (const comp of components) {
        if (!comp.label) continue;
        if (comp.type === "vcc") {
            for (const j of net) {
                if (j.startsWith(`${comp.label}_`)) return Number(comp.value) || 5;
            }
        }
        if (comp.type === "battery" && net.has(`${comp.label}_in`)) {
            return Number(comp.value) || 5;
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
        if (comp.type !== "arduino_uno" || !comp.label) continue;
        for (const j of net) {
            if (!j.startsWith(`${comp.label}_`)) continue;
            const suffix = j.slice(comp.label.length + 1);
            if (!/^A\d+$|^D\d+$/.test(suffix)) continue;
            const modes = comp.pinModes || {};
            const levels = comp.liveLevels || comp.pinLevels || {};
            if (modes[suffix] === "OUTPUT") return levels[suffix] ? 5 : 0;
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

/** Valeurs ADC 0–1023 pour A0–A5 d'une carte UNO. */
export function readUnoAnalogInputs(uno, ctx) {
    const out = {};
    if (!uno?.label) return out;
    for (let i = 0; i <= 5; i++) {
        const label = `A${i}`;
        const jid = `${uno.label}_${label}`;
        const v = resolveNetVoltage(jid, ctx);
        out[label] = voltageToAdc(Number.isFinite(v) ? v : 0);
    }
    return out;
}
