/**
 * IR2104 — driver de grille demi-pont (DIP-8).
 * Modèle idéal : IN commande HO (côté haut) et LO (côté bas) avec seuil logique.
 */

import { IR2104_PIN } from "../ir2104-layout.js";
import { reachableJonctions } from "./hc90-cascade.mjs";

export function isIr2104Type(t) {
    return t === "ir2104";
}

export function ir2104Params(comp) {
    return {
        vth: Number(comp?.vth ?? 2.5),
    };
}

/** Entrée logique active (réf. COM). */
export function ir2104InIsHigh(vIn, vCom, vth = 2.5) {
    if (!Number.isFinite(vIn) || !Number.isFinite(vCom)) return false;
    return vIn - vCom > vth;
}

/** Tension absolue broche LO (réf. COM). IN haut → LO bas ; IN bas → LO haut (VCC). */
export function ir2104LoVolts(vIn, vCom, vVcc, vth = 2.5) {
    return ir2104InIsHigh(vIn, vCom, vth) ? vCom : vVcc;
}

/** Tension absolue broche HO (réf. VS). IN haut → HO haut (VB) ; IN bas → HO bas (VS). */
export function ir2104HoVolts(vIn, vCom, vVB, vVS, vth = 2.5) {
    return ir2104InIsHigh(vIn, vCom, vth) ? vVB : vVS;
}

/**
 * Tension sur LO ou HO si la jonction appartient à un réseau de sortie IR2104.
 */
export function tryIr2104GateVoltage(jonctionId, ctx, resolveNetVoltage, visiting) {
    const { components, wires, autoJunctions = [] } = ctx;
    const net = reachableJonctions(jonctionId, wires, autoJunctions);
    for (const comp of components) {
        if (!isIr2104Type(comp.type) || !comp.label) continue;
        const loJ = `${comp.label}_LO`;
        const hoJ = `${comp.label}_HO`;
        if (!net.has(loJ) && !net.has(hoJ)) continue;
        const { vth } = ir2104Params(comp);
        const branch = new Set(visiting);
        const vIn = resolveNetVoltage(`${comp.label}_IN`, ctx, branch);
        const vCom = resolveNetVoltage(`${comp.label}_COM`, ctx, branch);
        const vVcc = resolveNetVoltage(`${comp.label}_VCC`, ctx, branch);
        const vVB = resolveNetVoltage(`${comp.label}_VB`, ctx, branch);
        const vVS = resolveNetVoltage(`${comp.label}_VS`, ctx, branch);
        const inV = Number.isFinite(vIn) ? vIn : 0;
        const comV = Number.isFinite(vCom) ? vCom : 0;
        const vccV = Number.isFinite(vVcc) ? vVcc : 0;
        const vbV = Number.isFinite(vVB) ? vVB : 0;
        const vsV = Number.isFinite(vVS) ? vVS : 0;
        if (net.has(loJ)) return ir2104LoVolts(inV, comV, vccV, vth);
        if (net.has(hoJ)) return ir2104HoVolts(inV, comV, vbV, vsV, vth);
    }
    return null;
}

/**
 * @param {(key: string) => string} nodeFor
 */
export function appendIr2104Netlist(c, ctx) {
    const { nodeFor, lines, warnings, terminalWireCount, spiceBranchName } = ctx;
    const { vth } = ir2104Params(c);

    const nLo = nodeFor(`${c.id}#${IR2104_PIN.LO}`);
    const nVs = nodeFor(`${c.id}#${IR2104_PIN.VS}`);
    const nHo = nodeFor(`${c.id}#${IR2104_PIN.HO}`);
    const nVb = nodeFor(`${c.id}#${IR2104_PIN.VB}`);
    const nVcc = nodeFor(`${c.id}#${IR2104_PIN.VCC}`);
    const nCom = nodeFor(`${c.id}#${IR2104_PIN.COM}`);
    const nIn = nodeFor(`${c.id}#${IR2104_PIN.IN}`);

    if ((terminalWireCount.get(`${c.id}#${IR2104_PIN.COM}`) || 0) === 0) {
        warnings.push(`${c.id} : broche COM (7) non câblée — reliez-la à la masse.`);
    }
    if ((terminalWireCount.get(`${c.id}#${IR2104_PIN.VCC}`) || 0) === 0) {
        warnings.push(`${c.id} : broche VCC (6) non câblée — reliez l'alimentation du driver (ex. 12 V).`);
    }
    if ((terminalWireCount.get(`${c.id}#${IR2104_PIN.IN}`) || 0) === 0) {
        warnings.push(`${c.id} : entrée IN (8) non câblée — reliez le signal de commande.`);
    }

    const vinDiff = `V(${nIn},${nCom})`;
    const onExpr = `${vinDiff} > ${vth}`;

    const bLo = spiceBranchName("BIR2104LO", c.id);
    const bHo = spiceBranchName("BIR2104HO", c.id);

    lines.push(`${bLo} ${nLo} ${nCom} V={${onExpr} ? 0 : V(${nVcc},${nCom})}`);
    lines.push(`${bHo} ${nHo} ${nVs} V={${onExpr} ? V(${nVb},${nVs}) : 0}`);
    lines.push(`* ${c.id} IR2104 : IN haut → HO actif (VB), LO bas ; IN bas → LO actif (VCC), HO bas (VS)`);
    lines.push(`* ${c.id} IR2104 seuil logique Vth=${vth} V (réf. COM)`);
}
