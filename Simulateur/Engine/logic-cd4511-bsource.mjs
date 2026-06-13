/**
 * CD4511 via sources comportementales (sans XSPICE d_genlut / d_dlatch).
 * Compatible ngspice-39 Linux (Render, Docker).
 */
import {
    cd4511InputPinIndices,
    cd4511OutputPinIndices,
} from "./logic-cd4511-xspice.mjs";

const SEG_NAMES = ["a", "b", "c", "d", "e", "f", "g"];

const BCD_SEGMENTS = [
    [1, 1, 1, 1, 1, 1, 0],
    [0, 1, 1, 0, 0, 0, 0],
    [1, 1, 0, 1, 1, 0, 1],
    [1, 1, 1, 1, 0, 0, 1],
    [0, 1, 1, 0, 0, 1, 1],
    [1, 0, 1, 1, 0, 1, 1],
    [1, 0, 1, 1, 1, 1, 1],
    [1, 1, 1, 0, 0, 0, 0],
    [1, 1, 1, 1, 1, 1, 1],
    [1, 1, 1, 1, 0, 1, 1],
];

const LATCH_STATE_C_F = 100e-9;
const LATCH_Q_R_OHM = 10e3;

function stepGt(node, th) {
    return `u(V(${node})-${th})`;
}

function bitMatchExpr(nPin, bitVal, th) {
    return bitVal ? stepGt(nPin, th) : `(1-${stepGt(nPin, th)})`;
}

/** Somme de produits BCD → un segment (après latch). */
export function bcdLatchSegDecodeExpr(nA, nB, nC, nD, segIdx, th) {
    const terms = [];
    for (let d = 0; d <= 9; d++) {
        if (!BCD_SEGMENTS[d][segIdx]) continue;
        const t = [
            bitMatchExpr(nA, d & 1, th),
            bitMatchExpr(nB, d & 2, th),
            bitMatchExpr(nC, d & 4, th),
            bitMatchExpr(nD, d & 8, th),
        ].join("*");
        terms.push(`(${t})`);
    }
    return terms.length ? `(${terms.join("+")})` : "0";
}

export function logicCd4511BsourceInternalNodeKeys(c) {
    if (!c?.id) return [];
    const keys = [];
    for (const s of ["a", "b", "c", "d"]) {
        keys.push(`__inbuf_${s}`, `__lat_${s}`, `__lat_${s}_qi`);
    }
    return keys.map((k) => `${c.id}#${k}`);
}

/**
 * @param {object} c composant logic_cd4511
 */
export function appendLogicCd4511BsourceNetlist(c, nodeFor, vhi, lines, spiceBranchName, opts = {}) {
    const th = vhi > 0 ? vhi / 2 : 2.5;
    const v = vhi > 0 ? vhi : 5;
    const pins = cd4511InputPinIndices();
    const outs = cd4511OutputPinIndices();

    const nA = nodeFor(`${c.id}#${pins.A}`);
    const nB = nodeFor(`${c.id}#${pins.B}`);
    const nC = nodeFor(`${c.id}#${pins.C}`);
    const nD = nodeFor(`${c.id}#${pins.D}`);
    const nLE = nodeFor(`${c.id}#${pins.LE}`);
    if (!opts.leWired) {
        lines.push(`${spiceBranchName("V", c.id)}_lep ${nLE} 0 DC 0`);
    }
    const nBI = nodeFor(`${c.id}#${pins.BI}`);
    const nLT = nodeFor(`${c.id}#${pins.LT}`);
    if (!opts.biWired) {
        lines.push(`${spiceBranchName("V", c.id)}_bipu ${nBI} 0 DC ${v}`);
    }
    if (!opts.ltWired) {
        lines.push(`${spiceBranchName("V", c.id)}_ltpu ${nLT} 0 DC ${v}`);
    }

    const leTransparent = `(1-${stepGt(nLE, th)})`;

    // Entrées BCD lues via VCVS (haute impédance) : évite de perturber les Q des bascules
    // ripple au reset asynchrone (symptôme 9→4 au lieu de 9→0 quand B/D partagent le fil AND).
    const inputBuf = (suffix, nIn) => {
        const nBuf = nodeFor(`${c.id}#__inbuf_${suffix}`);
        lines.push(`${spiceBranchName("E", c.id)}_buf${suffix} ${nBuf} 0 ${nIn} 0 1`);
        return nBuf;
    };

    const latchBit = (suffix, nIn) => {
        const nLat = nodeFor(`${c.id}#__lat_${suffix}`);
        const nQi = nodeFor(`${c.id}#__lat_${suffix}_qi`);
        const inHi = stepGt(nIn, th);
        lines.push(
            `${spiceBranchName("B", c.id)}_lat${suffix} ${nQi} 0 V = { (${leTransparent}*${inHi}+(1-${leTransparent})*${stepGt(nLat, th)})*${v} }`
        );
        lines.push(`${spiceBranchName("R", c.id)}_lat${suffix} ${nQi} ${nLat} ${LATCH_Q_R_OHM}`);
        lines.push(`${spiceBranchName("C", c.id)}_lat${suffix} ${nLat} 0 ${LATCH_STATE_C_F}`);
        return nLat;
    };

    const nLa = latchBit("a", inputBuf("a", nA));
    const nLb = latchBit("b", inputBuf("b", nB));
    const nLc = latchBit("c", inputBuf("c", nC));
    const nLd = latchBit("d", inputBuf("d", nD));

    const biOn = stepGt(nBI, th);
    const ltActive = `(1-${stepGt(nLT, th)})`;

    SEG_NAMES.forEach((s, segIdx) => {
        const decode = bcdLatchSegDecodeExpr(nLa, nLb, nLc, nLd, segIdx, th);
        const nOut = nodeFor(`${c.id}#${outs[s]}`);
        lines.push(
            `${spiceBranchName("B", c.id)}_seg${s} ${nOut} 0 V = { (${biOn}*(${ltActive}+${decode}*(1-${ltActive})))*${v} }`
        );
    });
}
