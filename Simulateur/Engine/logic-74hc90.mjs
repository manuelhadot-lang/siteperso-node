/**
 * 74HC90 / 74LS90 — compteur décade asynchrone (÷2 + ÷5).
 * Brochage TI : CP1=1, MR1=2, MR2=3, VCC=5, MS1=6, MS2=7, Q2=8, Q1=9, GND=10, Q3=11, Q0=12, CP0=14.
 */
import {
    appendLogicDffNetlist,
    logicDffDAndQbarShareNode,
} from "./logic-sequential.mjs";

export const IC90_PIN = {
    CP1: 0,
    MR1: 1,
    MR2: 2,
    NC4: 3,
    VCC: 4,
    MS1: 5,
    MS2: 6,
    Q2: 7,
    Q1: 8,
    GND: 9,
    Q3: 10,
    Q0: 11,
    NC13: 12,
    CP0: 13,
};

export function isIc74hc90Type(t) {
    return t === "ic_74hc90";
}

export function ic74hc90VccPinIndex() {
    return IC90_PIN.VCC;
}

export function ic74hc90GndPinIndex() {
    return IC90_PIN.GND;
}

/** Sections internes : bascule T (D=/Q) par indice de broche Q et CLK. */
export function ic74hc90ToggleSlices() {
    return [
        { suffix: "u0", q: IC90_PIN.Q0, clk: IC90_PIN.CP0 },
        { suffix: "u1", q: IC90_PIN.Q1, clk: IC90_PIN.CP1, rippleFromQ: true },
        { suffix: "u2", q: IC90_PIN.Q2, clk: IC90_PIN.Q1, rippleFromQ: true },
        { suffix: "u3", q: IC90_PIN.Q3, clk: IC90_PIN.Q2, rippleFromQ: true },
    ];
}

export function ic74hc90OutputNodeKeys(c) {
    return ic74hc90ToggleSlices().map((sl) => `${c.id}#${sl.q}`);
}

export function ic74hc90InputNodeKeys(c) {
    return [
        `${c.id}#${IC90_PIN.CP0}`,
        `${c.id}#${IC90_PIN.CP1}`,
        `${c.id}#${IC90_PIN.MR1}`,
        `${c.id}#${IC90_PIN.MR2}`,
        `${c.id}#${IC90_PIN.MS1}`,
        `${c.id}#${IC90_PIN.MS2}`,
    ];
}

export function ic74hc90InternalNodeKeys(c, opts = {}) {
    const keys = [
        `${c.id}#__mr`,
        `${c.id}#__ms`,
        `${c.id}#__rst_mid`,
        `${c.id}#__set_lo`,
        `${c.id}#__dec_ovf`,
        `${c.id}#__mr_eff`,
        `${c.id}#__rst_mid_eff`,
    ];
    for (const sl of ic74hc90ToggleSlices()) {
        const sub = { id: `${c.id}_${sl.suffix}`, type: "logic_dff" };
        keys.push(`${sub.id}#__dq`);
        keys.push(
            `${sub.id}#__qi`,
            `${sub.id}#__clkedge`,
            `${sub.id}#__xd_d`,
            `${sub.id}#__xd_clk`,
            `${sub.id}#__xd_set`,
            `${sub.id}#__xd_rst`,
            `${sub.id}#__xd_q`,
            `${sub.id}#__xd_qbar`,
            `${sub.id}#__xa_zero`,
            `${sub.id}#__xd_zero`
        );
        if (sl.rippleFromQ) keys.push(`${sub.id}#__xa_clkinv`);
    }
    return keys;
}

function stepGt(node, th) {
    return `u(V(${node})-${th})`;
}

/** Remappe les nœuds d'une bascule interne vers les broches du CI. */
function makeSliceNodeFor(c, sl, nodeFor, nMrEff, nMs, nRstMidEff) {
    const subId = `${c.id}_${sl.suffix}`;
    const qKey = `${c.id}#${sl.q}`;
    const clkKey = `${c.id}#${sl.clk}`;
    const isMid = sl.suffix === "u1" || sl.suffix === "u2";
    const dqKey = `${subId}#__dq`;
    return (key) => {
        // D et /Q : nœud interne (rétroaction dacqb→adc), distinct de la broche Q.
        if (key === `${subId}#0` || key === `${subId}#3`) return nodeFor(dqKey);
        if (key === `${subId}#1`) return nodeFor(clkKey);
        if (key === `${subId}#2`) return nodeFor(qKey);
        if (key === `${subId}#4`) return isMid ? nodeFor(`${c.id}#__set_lo`) : nMs;
        if (key === `${subId}#5`) return isMid ? nRstMidEff : nMrEff;
        if (key.startsWith(`${subId}#`)) return nodeFor(key);
        return nodeFor(key);
    };
}

/**
 * @param {object} c composant ic_74hc90
 */
export function appendIc74hc90Netlist(c, nodeFor, vhi, lines, spiceBranchName, deckOpts = {}) {
    const th = vhi > 0 ? vhi / 2 : 2.5;
    const v = vhi > 0 ? vhi : 5;
    const nMr1 = nodeFor(`${c.id}#${IC90_PIN.MR1}`);
    const nMr2 = nodeFor(`${c.id}#${IC90_PIN.MR2}`);
    const nMs1 = nodeFor(`${c.id}#${IC90_PIN.MS1}`);
    const nMs2 = nodeFor(`${c.id}#${IC90_PIN.MS2}`);
    const nMr = nodeFor(`${c.id}#__mr`);
    const nMs = nodeFor(`${c.id}#__ms`);
    lines.push(
        `${spiceBranchName("B", c.id)}_mr ${nMr} 0 V = { ${stepGt(nMr1, th)}*${stepGt(nMr2, th)}*${v} }`
    );
    lines.push(
        `${spiceBranchName("B", c.id)}_ms ${nMs} 0 V = { ${stepGt(nMs1, th)}*${stepGt(nMs2, th)}*${v} }`
    );
    const nRstMid = nodeFor(`${c.id}#__rst_mid`);
    lines.push(
        `${spiceBranchName("B", c.id)}_rstm ${nRstMid} 0 V = { (${stepGt(nMr, th)}+${stepGt(nMs, th)}-${stepGt(nMr, th)}*${stepGt(nMs, th)})*${v} }`
    );
    const nSetLo = nodeFor(`${c.id}#__set_lo`);
    lines.push(`${spiceBranchName("V", c.id)}_setlo ${nSetLo} 0 DC 0`);

    const nQ1 = nodeFor(`${c.id}#${IC90_PIN.Q1}`);
    const nQ3 = nodeFor(`${c.id}#${IC90_PIN.Q3}`);
    const nDecOvf = nodeFor(`${c.id}#__dec_ovf`);
    lines.push(
        `${spiceBranchName("B", c.id)}_dec ${nDecOvf} 0 V = { ${stepGt(nQ3, th)}*${stepGt(nQ1, th)}*${v} }`
    );
    const nMrEff = nodeFor(`${c.id}#__mr_eff`);
    lines.push(
        `${spiceBranchName("B", c.id)}_mreff ${nMrEff} 0 V = { (${stepGt(nMr, th)}+${stepGt(nDecOvf, th)}-${stepGt(nMr, th)}*${stepGt(nDecOvf, th)})*${v} }`
    );
    const nRstMidEff = nodeFor(`${c.id}#__rst_mid_eff`);
    lines.push(
        `${spiceBranchName("B", c.id)}_rstmeff ${nRstMidEff} 0 V = { (${stepGt(nRstMid, th)}+${stepGt(nDecOvf, th)}-${stepGt(nRstMid, th)}*${stepGt(nDecOvf, th)})*${v} }`
    );

    for (const sl of ic74hc90ToggleSlices()) {
        const sub = { id: `${c.id}_${sl.suffix}`, type: "logic_dff" };
        const sliceNodeFor = makeSliceNodeFor(c, sl, nodeFor, nMrEff, nMs, nRstMidEff);
        const srWired = { set: true, reset: true };
        appendLogicDffNetlist(sub, sliceNodeFor, v, lines, spiceBranchName, {
            ...deckOpts,
            srWired,
            rippleClockFromPrev: sl.rippleFromQ ? "q" : null,
        });
        if (logicDffDAndQbarShareNode(sub, sliceNodeFor)) {
            /* D et /Q sur Q : diviseur par 2 (comportement 74×90). */
        }
    }
}

export function resolveIc74hc90Vhi(c, logicVhiByTerminal, parseLogicRail, logicVhiFn) {
    const vccKey = `${c.id}#${ic74hc90VccPinIndex()}`;
    let vhi = logicVhiByTerminal.get(vccKey) ?? 0;
    for (const k of ic74hc90InputNodeKeys(c)) {
        vhi = Math.max(vhi, logicVhiByTerminal.get(k) ?? 0);
    }
    for (const k of ic74hc90OutputNodeKeys(c)) {
        vhi = Math.max(vhi, logicVhiByTerminal.get(k) ?? 0);
    }
    if (c.logicRail != null && c.logicRail !== "") {
        vhi = Math.max(vhi, logicVhiFn(parseLogicRail(c.logicRail)));
    }
    return vhi > 0 ? vhi : 5;
}
