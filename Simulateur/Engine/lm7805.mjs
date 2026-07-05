/**
 * LM7805 — régulateur de tension fixe +5 V (TO-220).
 * Modèle idéal : sortie régulée si Vin ≥ Vin(min), sinon chute de dropout.
 */

import { LM7805_PIN } from "../lm7805-layout.js";
import { reachableJonctions } from "./hc90-cascade.mjs";

export function isLm7805Type(t) {
    return t === "lm7805";
}

export function lm7805Params(comp) {
    return {
        vout: Number(comp?.vout ?? 5),
        vinMin: Number(comp?.vinMin ?? 7),
        dropout: Number(comp?.dropout ?? 2),
    };
}

/** Tension de sortie régulée (réf. GND du régulateur). */
export function lm7805OutputVolts(comp, vin, gndOk = true) {
    const { vout, vinMin, dropout } = lm7805Params(comp);
    if (!gndOk || !Number.isFinite(vin)) return 0;
    if (vin >= vinMin) return vout;
    return Math.max(0, vin - dropout);
}

function netHasGround(net) {
    for (const j of net) {
        if (!j) continue;
        if (j.startsWith("GND") || /^GND\d+_/.test(j)) return true;
        if (/_GND2?$/.test(j)) return true;
    }
    return false;
}

/**
 * Tension sur la broche OUT si jonctionId appartient au réseau de sortie d'un LM7805.
 * @param {string} jonctionId
 * @param {object} ctx
 * @param {(id: string, ctx: object, visiting: Set) => number|null} resolveNetVoltage
 * @param {Set<string>} visiting
 */
export function tryLm7805OutputVoltage(jonctionId, ctx, resolveNetVoltage, visiting) {
    const { components, wires, autoJunctions = [] } = ctx;
    const net = reachableJonctions(jonctionId, wires, autoJunctions);
    for (const comp of components) {
        if (!isLm7805Type(comp.type) || !comp.label) continue;
        const outJ = `${comp.label}_OUT`;
        if (!net.has(outJ)) continue;
        const inJ = `${comp.label}_IN`;
        const gndJ = `${comp.label}_GND`;
        const branch = new Set(visiting);
        const vin = resolveNetVoltage(inJ, ctx, branch);
        const gndNet = reachableJonctions(gndJ, wires, autoJunctions);
        const gndOk = netHasGround(gndNet);
        return lm7805OutputVolts(comp, vin, gndOk);
    }
    return null;
}

/**
 * @param {(key: string) => string} nodeFor
 */
export function appendLm7805Netlist(c, ctx) {
    const { nodeFor, lines, warnings, terminalWireCount, spiceBranchName } = ctx;
    const { vout, vinMin, dropout } = lm7805Params(c);

    const nIn = nodeFor(`${c.id}#${LM7805_PIN.IN}`);
    const nGnd = nodeFor(`${c.id}#${LM7805_PIN.GND}`);
    const nOut = nodeFor(`${c.id}#${LM7805_PIN.OUT}`);

    if ((terminalWireCount.get(`${c.id}#${LM7805_PIN.GND}`) || 0) === 0) {
        warnings.push(`${c.id} : broche GND (2) non câblée — reliez-la à la masse.`);
    }
    if ((terminalWireCount.get(`${c.id}#${LM7805_PIN.IN}`) || 0) === 0) {
        warnings.push(`${c.id} : entrée IN (1) non câblée — reliez une alimentation ≥ ${vinMin} V.`);
    }
    if ((terminalWireCount.get(`${c.id}#${LM7805_PIN.OUT}`) || 0) === 0) {
        warnings.push(`${c.id} : sortie OUT (3) non câblée.`);
    }

    const vinExpr = `V(${nIn},${nGnd})`;
    const bname = spiceBranchName("B7805", c.id);
    lines.push(
        `${bname} ${nOut} ${nGnd} V={${vinMin} <= ${vinExpr} ? ${vout} : max(0, ${vinExpr}-${dropout})}`
    );
    lines.push(`* ${c.id} LM7805 : ${vout} V régulés si ${vinExpr} >= ${vinMin} V`);
}
