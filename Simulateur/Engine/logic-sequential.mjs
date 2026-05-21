/** Bascules et circuits intégrés logiques — ngspice (XSPICE d_dff ou sources B). */

import {
    appendLogicDffXspiceNetlist,
    isXspiceDffAvailable,
    logicDffXspiceInternalNodeKeys,
    xspiceCodemodelLines,
} from "./logic-xspice.mjs";
import { ngspiceHasXspice } from "./ngspice-xspice-probe.mjs";

export function isLogicSequentialType(t) {
    return t === "logic_dff" || t === "logic_jk";
}

export function isIc74ls00Type(t) {
    return t === "ic_74ls00";
}

export function isIc74ls74Type(t) {
    return t === "ic_74ls74";
}

export function isLogicIcType(t) {
    return isIc74ls00Type(t) || isIc74ls74Type(t);
}

export function isLogicDigitalSimType(t) {
    return isLogicSequentialType(t) || isLogicIcType(t);
}

/** Nœuds internes (pré-déclaration union-find dans schematic-to-spice). */
export function logicSequentialInternalNodeKeys(c, opts = {}) {
    if (!c?.id) return [];
    if (c.type === "logic_dff" && useLogicDffXspice(opts)) {
        return logicDffXspiceInternalNodeKeys(c);
    }
    if (c.type === "logic_dff") {
        return [`${c.id}#__qi`, `${c.id}#__clkedge`, `${c.id}#__qbar`];
    }
    if (c.type === "logic_jk") {
        return [`${c.id}#__qi`, `${c.id}#__clkedge`, `${c.id}#__qbar`];
    }
    if (isIc74ls74Type(c.type)) {
        const keys = [];
        for (const sl of ic74ls74DffSlices()) {
            keys.push(`${c.id}#__qi${sl.suffix}`, `${c.id}#__clkedge${sl.suffix}`);
        }
        return keys;
    }
    return [];
}

export function logicDffInputNodeKeys(c) {
    return [`${c.id}#0`, `${c.id}#1`];
}

export function logicDffOutputNodeKey(c) {
    return `${c.id}#2`;
}

export function logicDffQbarOutputNodeKey(c) {
    return `${c.id}#3`;
}

export function logicDffOutputNodeKeys(c) {
    return [logicDffOutputNodeKey(c), logicDffQbarOutputNodeKey(c)];
}

export function logicJkInputNodeKeys(c) {
    return [`${c.id}#0`, `${c.id}#1`, `${c.id}#2`];
}

export function logicJkOutputNodeKey(c) {
    return `${c.id}#3`;
}

export function logicJkQbarOutputNodeKey(c) {
    return `${c.id}#4`;
}

export function logicJkOutputNodeKeys(c) {
    return [logicJkOutputNodeKey(c), logicJkQbarOutputNodeKey(c)];
}

/** Quatre portes NAND du 74LS00 (indices de bornes #0…#13). */
export function ic74ls00NandGates() {
    return [
        { a: 0, b: 1, y: 2 },
        { a: 3, b: 4, y: 5 },
        { a: 8, b: 9, y: 7 },
        { a: 11, b: 12, y: 10 },
    ];
}

export function ic74ls00VccPinIndex() {
    return 13;
}

export function ic74ls74VccPinIndex() {
    return 13;
}

/** Double bascule D 74LS74 : broches D, CLK, Q (indices #0…#13). */
export function ic74ls74DffSlices() {
    return [
        { suffix: "1", d: 1, clk: 2, q: 4 },
        { suffix: "2", d: 11, clk: 10, q: 8 },
    ];
}

/** RC plus lents : évite « Timestep too small » sur __qi en .tran (surtout D relié à /Q). */
const CLK_EDGE_C_F = 1e-9;
const CLK_EDGE_R_OHM = 10e3;
const FF_STATE_C_F = 10e-9;
const FF_Q_R_OHM = 1e3;
const FF_QBAR_R_OHM = 1e3;

/** Encore plus lent si D et /Q sont court-circuités (diviseur par 2) — ngspice-46. */
const TOGGLE_CLK_EDGE_C_F = 10e-9;
const TOGGLE_CLK_EDGE_R_OHM = 100e3;
const TOGGLE_FF_STATE_C_F = 100e-9;
const TOGGLE_FF_Q_R_OHM = 10e3;
const TOGGLE_D_HOLD_C_F = 50e-12;

function stepGt(node, th) {
    return `u(V(${node})-${th})`;
}

/**
 * Front montant sans delay() ni ddt(clk) : RC entre horloge et nœud « edge ».
 * Impulsion courte quand V(clk) >> V(edge) (condensateur en charge).
 */
function risingEdgeFromRc(edgeNode, clkNode, th) {
    const pulseTh = Math.max(0.25, th * 0.12);
    return `(u(V(${clkNode})-${th})*u(V(${clkNode})-V(${edgeNode})-${pulseTh}))`;
}

function appendClkEdgeDetector(clkNode, edgeNode, lines, spiceBranchName, idLabel, cF, rOhm) {
    lines.push(`${spiceBranchName("C", idLabel)}_cedge ${clkNode} ${edgeNode} ${cF}`);
    lines.push(`${spiceBranchName("R", idLabel)}_cedge ${edgeNode} 0 ${rOhm}`);
}

export function logicNandBsourceExpression(aNode, bNode, vhi) {
    const th = vhi / 2;
    return `{ (1-${stepGt(aNode, th)}*${stepGt(bNode, th)})*${vhi} }`;
}

export function logicDffQiExpression(dNode, edgeNode, clkNode, qOutNode, vhi, dFromComplementOfQ = false) {
    const th = vhi / 2;
    const edge = risingEdgeFromRc(edgeNode, clkNode, th);
    // Si D et /Q sont sur le même nœud, ne pas lire V(D) dans B_qi : boucle avec B_qbar → nœud D.
    // On impose alors D = ¬Q au front (diviseur par 2), cohérent avec le câblage.
    const dVal = dFromComplementOfQ
        ? `(1-${stepGt(qOutNode, th)})*${vhi}`
        : `${stepGt(dNode, th)}*${vhi}`;
    const hold = `${stepGt(qOutNode, th)}*${vhi}`;
    return `{ (${edge})*(${dVal}) + (1-(${edge}))*(${hold}) }`;
}

export function logicJkQiExpression(jNode, kNode, edgeNode, clkNode, qOutNode, vhi) {
    const th = vhi / 2;
    const edge = risingEdgeFromRc(edgeNode, clkNode, th);
    const j = stepGt(jNode, th);
    const k = stepGt(kNode, th);
    const q = stepGt(qOutNode, th);
    const toggle = `(1-${q})*${vhi}`;
    const hold = `${q}*${vhi}`;
    const next = `((${j})*(${k})*(${toggle}) + (${j})*(1-(${k}))*${vhi} + (1-(${j}))*(${k})*0 + (1-(${j}))*(1-(${k}))*(${hold}))`;
    return `{ (${edge})*(${next}) + (1-(${edge}))*(${hold}) }`;
}

function appendQbarDriver(c, nQ, nQbarPin, nodeFor, vhi, lines, spiceBranchName, rSeries = FF_QBAR_R_OHM) {
    const th = vhi / 2;
    const nQbarDrv = nodeFor(`${c.id}#__qbar`);
    lines.push(
        `${spiceBranchName("B", c.id)}_qbar ${nQbarDrv} 0 V = { (1-${stepGt(nQ, th)})*${vhi} }`
    );
    if (nQbarDrv !== nQbarPin) {
        lines.push(
            `${spiceBranchName("R", c.id)}_qbr ${nQbarDrv} ${nQbarPin} ${rSeries}`
        );
    }
}

/**
 * true si bascule D via XSPICE : digital.cm présent + binaire ngspice compilé avec XSPICE.
 * @param {{ repoRoot?: string; ngspiceExe?: string; forceBsourceDff?: boolean; forceXspiceDff?: boolean }} opts
 */
export function useLogicDffXspice(opts = {}) {
    if (opts.forceBsourceDff === true) return false;
    if (!isXspiceDffAvailable(opts.repoRoot)) return false;
    if (opts.forceXspiceDff === true) return true;
    if (opts.ngspiceExe) return ngspiceHasXspice(opts.ngspiceExe);
    return false;
}

export { xspiceCodemodelLines, isXspiceDffAvailable };

export function appendLogicDffNetlist(c, nodeFor, vhi, lines, spiceBranchName, opts = {}) {
    if (useLogicDffXspice(opts)) {
        appendLogicDffXspiceNetlist(c, nodeFor, vhi, lines, spiceBranchName);
        return;
    }
    appendLogicDffBsourceNetlist(c, nodeFor, vhi, lines, spiceBranchName);
}

function appendLogicDffBsourceNetlist(c, nodeFor, vhi, lines, spiceBranchName) {
    const nD = nodeFor(`${c.id}#0`);
    const nClk = nodeFor(`${c.id}#1`);
    const nQ = nodeFor(`${c.id}#2`);
    const nQbar = nodeFor(`${c.id}#3`);
    const nQi = nodeFor(`${c.id}#__qi`);
    const nEdge = nodeFor(`${c.id}#__clkedge`);
    const dAndQbarShared = nD === nQbar;
    const cEdge = dAndQbarShared ? TOGGLE_CLK_EDGE_C_F : CLK_EDGE_C_F;
    const rEdge = dAndQbarShared ? TOGGLE_CLK_EDGE_R_OHM : CLK_EDGE_R_OHM;
    const cSt = dAndQbarShared ? TOGGLE_FF_STATE_C_F : FF_STATE_C_F;
    const rQ = dAndQbarShared ? TOGGLE_FF_Q_R_OHM : FF_Q_R_OHM;
    appendClkEdgeDetector(nClk, nEdge, lines, spiceBranchName, c.id, cEdge, rEdge);
    lines.push(
        `${spiceBranchName("B", c.id)}_qi ${nQi} 0 V = ${logicDffQiExpression(
            nD,
            nEdge,
            nClk,
            nQ,
            vhi,
            dAndQbarShared
        )}`
    );
    lines.push(`${spiceBranchName("R", c.id)}_q ${nQi} ${nQ} ${rQ}`);
    lines.push(`${spiceBranchName("C", c.id)}_st ${nQi} 0 ${cSt}`);
    if (dAndQbarShared) {
        // D et /Q sur le même fil : piloter directement le nœud D (= /Q) depuis Q, sans nœud
        // interne __qbar + R (sinon ngspice-46 peut bloquer sur n4 en .tran).
        const th = vhi / 2;
        lines.push(
            `${spiceBranchName("B", c.id)}_qbar ${nD} 0 V = { (1-${stepGt(nQ, th)})*${vhi} }`
        );
        lines.push(`${spiceBranchName("C", c.id)}_dhold ${nD} 0 ${TOGGLE_D_HOLD_C_F}`);
    } else {
        appendQbarDriver(c, nQ, nQbar, nodeFor, vhi, lines, spiceBranchName);
    }
}

/** true si D et /Q partagent le même nœud (fil entre broches 0 et 3). */
export function logicDffDAndQbarShareNode(c, nodeFor) {
    return nodeFor(`${c.id}#0`) === nodeFor(`${c.id}#3`);
}

export function appendLogicJkNetlist(c, nodeFor, vhi, lines, spiceBranchName) {
    const nJ = nodeFor(`${c.id}#0`);
    const nClk = nodeFor(`${c.id}#1`);
    const nK = nodeFor(`${c.id}#2`);
    const nQ = nodeFor(`${c.id}#3`);
    const nQbar = nodeFor(`${c.id}#4`);
    const nQi = nodeFor(`${c.id}#__qi`);
    const nEdge = nodeFor(`${c.id}#__clkedge`);
    appendClkEdgeDetector(nClk, nEdge, lines, spiceBranchName, c.id, CLK_EDGE_C_F, CLK_EDGE_R_OHM);
    lines.push(
        `${spiceBranchName("B", c.id)}_qi ${nQi} 0 V = ${logicJkQiExpression(nJ, nK, nEdge, nClk, nQ, vhi)}`
    );
    lines.push(`${spiceBranchName("R", c.id)}_q ${nQi} ${nQ} ${FF_Q_R_OHM}`);
    lines.push(`${spiceBranchName("C", c.id)}_st ${nQi} 0 ${FF_STATE_C_F}`);
    appendQbarDriver(c, nQ, nQbar, nodeFor, vhi, lines, spiceBranchName);
}

export function appendIc74ls00Netlist(c, nodeFor, vhi, lines, spiceBranchName) {
    for (let gi = 0; gi < ic74ls00NandGates().length; gi++) {
        const g = ic74ls00NandGates()[gi];
        const nA = nodeFor(`${c.id}#${g.a}`);
        const nB = nodeFor(`${c.id}#${g.b}`);
        const nY = nodeFor(`${c.id}#${g.y}`);
        const expr = logicNandBsourceExpression(nA, nB, vhi);
        lines.push(`${spiceBranchName("B", c.id)}_g${gi + 1} ${nY} 0 V = ${expr}`);
    }
}

function appendLogicDffSlice(c, nodeFor, vhi, lines, spiceBranchName, suffix, dIdx, clkIdx, qIdx) {
    const nD = nodeFor(`${c.id}#${dIdx}`);
    const nClk = nodeFor(`${c.id}#${clkIdx}`);
    const nQ = nodeFor(`${c.id}#${qIdx}`);
    const nQi = nodeFor(`${c.id}#__qi${suffix}`);
    const nEdge = nodeFor(`${c.id}#__clkedge${suffix}`);
    appendClkEdgeDetector(nClk, nEdge, lines, spiceBranchName, `${c.id}${suffix}`, CLK_EDGE_C_F, CLK_EDGE_R_OHM);
    lines.push(
        `${spiceBranchName("B", c.id)}_qi${suffix} ${nQi} 0 V = ${logicDffQiExpression(
            nD,
            nEdge,
            nClk,
            nQ,
            vhi,
            false
        )}`
    );
    lines.push(`${spiceBranchName("R", c.id)}_q${suffix} ${nQi} ${nQ} ${FF_Q_R_OHM}`);
    lines.push(`${spiceBranchName("C", c.id)}_st${suffix} ${nQi} 0 ${FF_STATE_C_F}`);
}

export function appendIc74ls74Netlist(c, nodeFor, vhi, lines, spiceBranchName) {
    for (const sl of ic74ls74DffSlices()) {
        appendLogicDffSlice(c, nodeFor, vhi, lines, spiceBranchName, sl.suffix, sl.d, sl.clk, sl.q);
    }
}

export function resolveIc74ls74Vhi(c, logicVhiByTerminal, parseLogicRail, logicVhiFn) {
    const vccKey = `${c.id}#${ic74ls74VccPinIndex()}`;
    let vhi = logicVhiByTerminal.get(vccKey) ?? 0;
    for (const sl of ic74ls74DffSlices()) {
        vhi = Math.max(vhi, logicVhiByTerminal.get(`${c.id}#${sl.d}`) ?? 0);
        vhi = Math.max(vhi, logicVhiByTerminal.get(`${c.id}#${sl.clk}`) ?? 0);
        vhi = Math.max(vhi, logicVhiByTerminal.get(`${c.id}#${sl.q}`) ?? 0);
    }
    if (c.logicRail != null && c.logicRail !== "") {
        vhi = Math.max(vhi, logicVhiFn(parseLogicRail(c.logicRail)));
    }
    if (vhi <= 0) vhi = 5;
    return vhi > 0 ? vhi : 5;
}

export function resolveSequentialVhi(c, logicVhiByTerminal, parseLogicRail, logicVhiFn, inputKeys) {
    let vhi = 0;
    for (const k of inputKeys) {
        vhi = Math.max(vhi, logicVhiByTerminal.get(k) ?? 0);
    }
    if (c.logicRail != null && c.logicRail !== "") {
        vhi = Math.max(vhi, logicVhiFn(parseLogicRail(c.logicRail)));
    }
    const outKeys =
        c.type === "logic_dff"
            ? logicDffOutputNodeKeys(c)
            : c.type === "logic_jk"
              ? logicJkOutputNodeKeys(c)
              : [];
    for (const k of outKeys) {
        vhi = Math.max(vhi, logicVhiByTerminal.get(k) ?? 0);
    }
    if (vhi <= 0) vhi = 5;
    return vhi > 0 ? vhi : 5;
}

export function resolveIc74ls00Vhi(c, logicVhiByTerminal, parseLogicRail, logicVhiFn) {
    const vccKey = `${c.id}#${ic74ls00VccPinIndex()}`;
    let vhi = logicVhiByTerminal.get(vccKey) ?? 0;
    for (const g of ic74ls00NandGates()) {
        vhi = Math.max(vhi, logicVhiByTerminal.get(`${c.id}#${g.a}`) ?? 0);
        vhi = Math.max(vhi, logicVhiByTerminal.get(`${c.id}#${g.b}`) ?? 0);
        vhi = Math.max(vhi, logicVhiByTerminal.get(`${c.id}#${g.y}`) ?? 0);
    }
    if (c.logicRail != null && c.logicRail !== "") {
        vhi = Math.max(vhi, logicVhiFn(parseLogicRail(c.logicRail)));
    }
    if (vhi <= 0) vhi = 5;
    return vhi > 0 ? vhi : 5;
}
