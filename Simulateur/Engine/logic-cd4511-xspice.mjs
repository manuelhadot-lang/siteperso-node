/**
 * CD4511 (BCD → 7 segments, latch LE, BI, LT) via XSPICE :
 * adc_bridge, d_dlatch (×4), d_genlut, d_or / d_and, dac_bridge.
 */
import { xspiceLogicThresholds } from "./logic-xspice.mjs";

/** Chiffres 0–9 : segments a,b,c,d,e,f,g (1 = segment actif, cathode commune). */
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

/** table_values pour d_genlut : 4 entrées [A B C D], 7 sorties a…g. */
export function cd4511BcdToSegGenlutTable() {
    let table = "";
    for (let seg = 0; seg < 7; seg++) {
        for (let val = 0; val < 16; val++) {
            if (val <= 9 && BCD_SEGMENTS[val][seg]) table += "1";
            else table += "0";
        }
    }
    return table;
}

export function cd4511InputPinIndices() {
    return { A: 0, B: 1, C: 2, D: 3, LE: 4, BI: 5, LT: 6 };
}

export function cd4511OutputPinIndices() {
    return { a: 7, b: 8, c: 9, d: 10, e: 11, f: 12, g: 13 };
}

export function cd4511InputNodeKeys(c) {
    const p = cd4511InputPinIndices();
    return Object.values(p).map((i) => `${c.id}#${i}`);
}

export function cd4511OutputNodeKeys(c) {
    const p = cd4511OutputPinIndices();
    return Object.values(p).map((i) => `${c.id}#${i}`);
}

const SEG_NAMES = ["a", "b", "c", "d", "e", "f", "g"];

/**
 * @param {object} c composant logic_cd4511
 * @param {function} nodeFor
 * @param {number} vhi
 * @param {string[]} lines
 * @param {function} spiceBranchName
 * @param {{ biWired?: boolean; ltWired?: boolean; leWired?: boolean }} [opts]
 */
export function appendLogicCd4511XspiceNetlist(c, nodeFor, vhi, lines, spiceBranchName, opts = {}) {
    const th = xspiceLogicThresholds(vhi);
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

    const mAdc = `${c.id}_m_adcio`;
    const mDac = `${c.id}_m_dac`;
    lines.push(`.model ${mAdc} adc_bridge(in_low=${th.inLow} in_high=${th.inHigh})`);
    lines.push(
        `.model ${mDac} dac_bridge(out_low=${th.outLow} out_high=${th.outHigh} t_rise=2e-9 t_fall=2e-9)`
    );

    const ndZero = nodeFor(`${c.id}#__xd_zero`);
    const nZa = nodeFor(`${c.id}#__xa_zero`);
    lines.push(`${spiceBranchName("V", c.id)}_xz ${nZa} 0 DC 0`);
    lines.push(`${spiceBranchName("A", c.id)}_adcz [${nZa}] [${ndZero}] ${mAdc}`);

    let ndPullHi = null;
    const pullHighDigital = () => {
        if (ndPullHi) return ndPullHi;
        const nPullA = nodeFor(`${c.id}#__xa_pull`);
        ndPullHi = nodeFor(`${c.id}#__xd_pull`);
        lines.push(`${spiceBranchName("V", c.id)}_pull ${nPullA} 0 DC ${v}`);
        lines.push(`${spiceBranchName("A", c.id)}_adcpull [${nPullA}] [${ndPullHi}] ${mAdc}`);
        return ndPullHi;
    };

    const adcIn = (suffix, nAnalog) => {
        const nd = nodeFor(`${c.id}#__xd_in_${suffix}`);
        lines.push(`${spiceBranchName("A", c.id)}_adc${suffix} [${nAnalog}] [${nd}] ${mAdc}`);
        return nd;
    };

    const ndA = adcIn("a", nA);
    const ndB = adcIn("b", nB);
    const ndC = adcIn("c", nC);
    const ndD = adcIn("d", nD);

    const ndBI = opts.biWired ? adcIn("bi", nBI) : pullHighDigital();
    let ndLTbar;
    if (opts.ltWired) {
        const nLTinvA = nodeFor(`${c.id}#__xa_ltinv`);
        lines.push(`${spiceBranchName("B", c.id)}_ltinv ${nLTinvA} 0 V = { ${v} - V(${nLT}) }`);
        ndLTbar = nodeFor(`${c.id}#__xd_ltbar`);
        lines.push(`${spiceBranchName("A", c.id)}_adcltbar [${nLTinvA}] [${ndLTbar}] ${mAdc}`);
    } else {
        lines.push(`${spiceBranchName("V", c.id)}_ltpu ${nLT} 0 DC ${v}`);
        ndLTbar = ndZero;
    }

    // LE actif bas → transparent ; d_dlatch : enable=1 suit data, enable=0 mémorise.
    const nLEenA = nodeFor(`${c.id}#__xa_le_en`);
    lines.push(`${spiceBranchName("B", c.id)}_leen ${nLEenA} 0 V = { ${v} - V(${nLE}) }`);
    const ndLEen = nodeFor(`${c.id}#__xd_le_en`);
    lines.push(`${spiceBranchName("A", c.id)}_adcleen [${nLEenA}] [${ndLEen}] ${mAdc}`);

    const mLatch = `${c.id}_m_dlatch`;
    lines.push(
        `.model ${mLatch} d_dlatch(data_delay=2e-9 enable_delay=2e-9 rise_delay=2e-9 fall_delay=2e-9 ic=0)`
    );

    const latchBit = (bit, ndIn) => {
        const ndLat = nodeFor(`${c.id}#__xd_lat_${bit}`);
        const ndQb = nodeFor(`${c.id}#__xd_lat_${bit}qb`);
        lines.push(
            `${spiceBranchName("A", c.id)}_lt${bit} ${ndIn} ${ndLEen} ${ndZero} ${ndZero} ${ndLat} ${ndQb} ${mLatch}`
        );
        return ndLat;
    };

    const ndLa = latchBit("a", ndA);
    const ndLb = latchBit("b", ndB);
    const ndLc = latchBit("c", ndC);
    const ndLd = latchBit("d", ndD);

    const mDecode = `${c.id}_m_bcd7`;
    const ndSeg = SEG_NAMES.map((s) => nodeFor(`${c.id}#__xd_seg_${s}`));
    lines.push(
        `.model ${mDecode} d_genlut(table_values="${cd4511BcdToSegGenlutTable()}")`
    );
    lines.push(
        `${spiceBranchName("A", c.id)}_dec [${ndLa} ${ndLb} ${ndLc} ${ndLd}] [${ndSeg.join(" ")}] ${mDecode}`
    );

    const mOr = `${c.id}_m_or`;
    const mAnd = `${c.id}_m_and`;
    lines.push(`.model ${mOr} d_or(rise_delay=2e-9 fall_delay=2e-9)`);
    lines.push(`.model ${mAnd} d_and(rise_delay=2e-9 fall_delay=2e-9)`);

    SEG_NAMES.forEach((s, i) => {
        const ndTmp = nodeFor(`${c.id}#__xd_${s}_pre`);
        const ndOutD = nodeFor(`${c.id}#__xd_${s}_out`);
        // LT actif bas : test lampe = (¬LT) ∨ segment
        lines.push(`${spiceBranchName("A", c.id)}_or${s} [${ndLTbar} ${ndSeg[i]}] ${ndTmp} ${mOr}`);
        lines.push(`${spiceBranchName("A", c.id)}_and${s} [${ndTmp} ${ndBI}] ${ndOutD} ${mAnd}`);
        const nOut = nodeFor(`${c.id}#${outs[s]}`);
        lines.push(`${spiceBranchName("A", c.id)}_dac${s} [${ndOutD}] [${nOut}] ${mDac}`);
    });
}

export function logicCd4511XspiceInternalNodeKeys(c) {
    if (!c?.id) return [];
    const keys = ["__xd_zero", "__xa_zero", "__xa_pull", "__xd_pull", "__xa_le_en", "__xd_le_en"];
    for (const s of ["a", "b", "c", "d"]) {
        keys.push(`__xd_in_${s}`, `__xd_lat_${s}`, `__xd_lat_${s}qb`);
    }
    keys.push("__xd_in_bi", "__xa_ltinv", "__xd_ltbar");
    for (const s of SEG_NAMES) {
        keys.push(`__xd_seg_${s}`, `__xd_${s}_pre`, `__xd_${s}_out`);
    }
    return keys.map((k) => `${c.id}#${k}`);
}
