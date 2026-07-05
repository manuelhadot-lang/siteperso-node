/**
 * L293D — driver moteur double pont en H (DIP-16).
 * Modèle idéal : sorties push-pull entre VMOT et GND selon EN + entrées A.
 */

import { L293D_PIN } from "../l293d-layout.js";
import { reachableJonctions } from "./hc90-cascade.mjs";

export function isL293dType(t) {
    return t === "l293d";
}

export function l293dParams(comp) {
    return {
        vth: Number(comp?.vth ?? 1.5),
    };
}

function logicHigh(v, ref, vth) {
    if (!Number.isFinite(v) || !Number.isFinite(ref)) return false;
    return v - ref > vth;
}

/** Tension idéale d'une sortie Y (réf. GND1). */
export function l293dOutputVolts(en, inA, inB, vMot, gnd, vth = 1.5) {
    if (!logicHigh(en, gnd, vth)) return gnd;
    const a = logicHigh(inA, gnd, vth);
    const b = logicHigh(inB, gnd, vth);
    if (a && !b) return vMot;
    if (b && !a) return gnd;
    return gnd;
}

function channelBsourceLines(ctx, c, enPin, aPin, bPin, yPin, gndPin, vmotPin, tag) {
    const { nodeFor, lines, spiceBranchName, vth } = ctx;
    const nY = nodeFor(`${c.id}#${yPin}`);
    const nGnd = nodeFor(`${c.id}#${gndPin}`);
    const nEn = nodeFor(`${c.id}#${enPin}`);
    const nA = nodeFor(`${c.id}#${aPin}`);
    const nB = nodeFor(`${c.id}#${bPin}`);
    const nVmot = nodeFor(`${c.id}#${vmotPin}`);

    const en = `V(${nEn},${nGnd})>${vth}`;
    const ia = `V(${nA},${nGnd})>${vth}`;
    const ib = `V(${nB},${nGnd})>${vth}`;
    const vm = `V(${nVmot},${nGnd})`;

    const bname = spiceBranchName(`BL293D${tag}`, c.id);
    lines.push(
        `${bname} ${nY} ${nGnd} V={${en} && ${ia} && !(${ib}) ? ${vm} : ((${en}) && ${ib} && !(${ia}) ? 0 : 0)}`
    );
}

/**
 * @param {(key: string) => string} nodeFor
 */
export function appendL293dNetlist(c, ctx) {
    const { nodeFor, lines, warnings, terminalWireCount, spiceBranchName } = ctx;
    const { vth } = l293dParams(c);
    const spiceCtx = { nodeFor, lines, spiceBranchName, vth };

    if ((terminalWireCount.get(`${c.id}#${L293D_PIN.GND1}`) || 0) === 0) {
        warnings.push(`${c.id} : broche GND (4) non câblée — reliez-la à la masse.`);
    }
    if ((terminalWireCount.get(`${c.id}#${L293D_PIN.VSS}`) || 0) === 0) {
        warnings.push(`${c.id} : broche VSS (8) non câblée — reliez l'alimentation logique (5 V).`);
    }
    if ((terminalWireCount.get(`${c.id}#${L293D_PIN.VMOT}`) || 0) === 0) {
        warnings.push(`${c.id} : broche VMOT (16) non câblée — reliez l'alimentation moteur (6–12 V).`);
    }

    channelBsourceLines(
        spiceCtx,
        c,
        L293D_PIN.EN12,
        L293D_PIN.A1,
        L293D_PIN.A2,
        L293D_PIN.Y1,
        L293D_PIN.GND1,
        L293D_PIN.VMOT,
        "Y1"
    );
    channelBsourceLines(
        spiceCtx,
        c,
        L293D_PIN.EN12,
        L293D_PIN.A2,
        L293D_PIN.A1,
        L293D_PIN.Y2,
        L293D_PIN.GND1,
        L293D_PIN.VMOT,
        "Y2"
    );
    channelBsourceLines(
        spiceCtx,
        c,
        L293D_PIN.EN34,
        L293D_PIN.A3,
        L293D_PIN.A4,
        L293D_PIN.Y3,
        L293D_PIN.GND1,
        L293D_PIN.VMOT,
        "Y3"
    );
    channelBsourceLines(
        spiceCtx,
        c,
        L293D_PIN.EN34,
        L293D_PIN.A4,
        L293D_PIN.A3,
        L293D_PIN.Y4,
        L293D_PIN.GND1,
        L293D_PIN.VMOT,
        "Y4"
    );

    lines.push(`* ${c.id} L293D : canaux 1–2 (EN12) et 3–4 (EN34), Vth=${vth} V`);
}

export function tryL293dOutputVoltage(jonctionId, ctx, resolveNetVoltage, visiting) {
    const { components, wires, autoJunctions = [] } = ctx;
    const net = reachableJonctions(jonctionId, wires, autoJunctions);
    for (const comp of components) {
        if (!isL293dType(comp.type) || !comp.label) continue;
        const { vth } = l293dParams(comp);
        const gndJ = `${comp.label}_GND1`;
        const branch = new Set(visiting);
        const gnd = resolveNetVoltage(gndJ, ctx, branch);
        const gndV = Number.isFinite(gnd) ? gnd : 0;
        const vmot = resolveNetVoltage(`${comp.label}_VMOT`, ctx, new Set(visiting)) ?? 0;
        const vmotV = Number.isFinite(vmot) ? vmot : 0;

        const channels = [
            { y: "Y1", en: "EN12", a: "A1", b: "A2" },
            { y: "Y2", en: "EN12", a: "A2", b: "A1" },
            { y: "Y3", en: "EN34", a: "A3", b: "A4" },
            { y: "Y4", en: "EN34", a: "A4", b: "A3" },
        ];
        for (const ch of channels) {
            const yJ = `${comp.label}_${ch.y}`;
            if (!net.has(yJ)) continue;
            const b2 = new Set(visiting);
            const enV = resolveNetVoltage(`${comp.label}_${ch.en}`, ctx, b2) ?? 0;
            const aV = resolveNetVoltage(`${comp.label}_${ch.a}`, ctx, b2) ?? 0;
            const bV = resolveNetVoltage(`${comp.label}_${ch.b}`, ctx, b2) ?? 0;
            return l293dOutputVolts(enV, aV, bV, vmotV, gndV, vth);
        }
    }
    return null;
}
