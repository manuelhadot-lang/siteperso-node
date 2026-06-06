/** Bascules et circuits intégrés logiques — ngspice (XSPICE d_dff ou sources B). */

import {
    appendLogicCd4511BsourceNetlist,
    logicCd4511BsourceInternalNodeKeys,
} from "./logic-cd4511-bsource.mjs";
import {
    appendLogicCd4511XspiceNetlist,
    cd4511InputNodeKeys,
    cd4511OutputNodeKeys,
    logicCd4511XspiceInternalNodeKeys,
} from "./logic-cd4511-xspice.mjs";
import {
    appendLogicDffXspiceNetlist,
    appendLogicJkXspiceNetlist,
    isXspiceDffAvailable,
    logicDffXspiceInternalNodeKeys,
    logicJkXspiceInternalNodeKeys,
    xspiceCodemodelLines,
} from "./logic-xspice.mjs";
import { ngspiceHasXspice } from "./ngspice-xspice-probe.mjs";

export { cd4511InputNodeKeys, cd4511OutputNodeKeys };

export function isLogicSequentialType(t) {
    return t === "logic_dff" || t === "logic_jk";
}

export function isIc74ls00Type(t) {
    return t === "ic_74ls00";
}

export function isIc74ls74Type(t) {
    return t === "ic_74ls74";
}

export function isLogicCd4511Type(t) {
    return t === "logic_cd4511";
}

export function isIc74hc90Type(t) {
    return t === "ic_74hc90";
}

export function isLogicIcType(t) {
    return isIc74ls00Type(t) || isIc74ls74Type(t) || isLogicCd4511Type(t) || isIc74hc90Type(t);
}

export function isLogicDigitalSimType(t) {
    return isLogicSequentialType(t) || isLogicIcType(t);
}

/** Nœuds internes (pré-déclaration union-find dans schematic-to-spice). */
export function logicSequentialInternalNodeKeys(c, opts = {}) {
    if (!c?.id) return [];
    if (c.type === "logic_dff" && useLogicDffXspice(opts)) {
        return logicDffXspiceInternalNodeKeys(c, opts);
    }
    if (c.type === "logic_dff") {
        return [`${c.id}#__qi`, `${c.id}#__clkedge`, `${c.id}#__qbar`];
    }
    if (c.type === "logic_jk") {
        if (useLogicJkXspice(opts)) {
            return logicJkXspiceInternalNodeKeys(c, opts);
        }
        return [`${c.id}#__qi`, `${c.id}#__clkedge`, `${c.id}#__qbar`];
    }
    if (isIc74ls74Type(c.type)) {
        const keys = [];
        for (const sl of ic74ls74DffSlices()) {
            keys.push(`${c.id}#__qi${sl.suffix}`, `${c.id}#__clkedge${sl.suffix}`);
        }
        return keys;
    }
    if (isLogicCd4511Type(c.type)) {
        return useLogicCd4511Xspice(opts)
            ? logicCd4511XspiceInternalNodeKeys(c)
            : logicCd4511BsourceInternalNodeKeys(c);
    }
    return [];
}

export function logicDffInputNodeKeys(c) {
    return [`${c.id}#0`, `${c.id}#1`];
}

/** Broches Set (#4) / Reset (#5) asynchrones, optionnelles. */
export function logicDffSetResetNodeKeys(c) {
    return [`${c.id}#4`, `${c.id}#5`];
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

/** Broches Set (#5) / Reset (#6) asynchrones, optionnelles. */
export function logicJkSetResetNodeKeys(c) {
    return [`${c.id}#5`, `${c.id}#6`];
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

/** Front descendant (compteur ripple : horloge = Q de l'étage précédent). */
function fallingEdgeFromRc(edgeNode, clkNode, th) {
    const pulseTh = Math.max(0.25, th * 0.12);
    return `(u(V(${edgeNode})-${th})*u(V(${edgeNode})-V(${clkNode})-${pulseTh}))`;
}

/** Horloge reliée à la sortie Q d'une autre bascule (chaînage ripple). */
export function logicFlipFlopClockNodeKey(c) {
    if (c.type === "logic_dff") return `${c.id}#1`;
    if (c.type === "logic_jk") return `${c.id}#2`;
    return null;
}

export function logicFlipFlopOutputNodeKey(c) {
    if (c.type === "logic_dff") return `${c.id}#2`;
    if (c.type === "logic_jk") return `${c.id}#3`;
    return null;
}

export function logicFlipFlopQbarOutputNodeKey(c) {
    if (c.type === "logic_dff") return logicDffQbarOutputNodeKey(c);
    if (c.type === "logic_jk") return logicJkQbarOutputNodeKey(c);
    return null;
}

/**
 * Chaînage ripple : horloge = Q ou /Q de l'étage précédent.
 * @returns {'q'|'qbar'|null}
 */
export function getRippleClockFromPrev(c, wires, components) {
    if (!c?.id || !isLogicSequentialType(c.type)) return null;
    const clkKey = logicFlipFlopClockNodeKey(c);
    if (!clkKey) return null;
    for (const w of wires) {
        if (!w?.solid || !w.fromKey || !w.toKey) continue;
        let otherKey = null;
        if (w.fromKey === clkKey) otherKey = w.toKey;
        else if (w.toKey === clkKey) otherKey = w.fromKey;
        if (!otherKey) continue;
        for (const prev of components) {
            if (!isLogicSequentialType(prev.type) || prev.id === c.id) continue;
            if (otherKey === logicFlipFlopOutputNodeKey(prev)) return "q";
            if (otherKey === logicFlipFlopQbarOutputNodeKey(prev)) return "qbar";
        }
    }
    return null;
}

/** @deprecated Utiliser getRippleClockFromPrev(c) === 'q' */
export function isRippleClockFromPrevQ(c, wires, components) {
    return getRippleClockFromPrev(c, wires, components) === "q";
}

function appendClkEdgeDetector(clkNode, edgeNode, lines, spiceBranchName, idLabel, cF, rOhm) {
    lines.push(`${spiceBranchName("C", idLabel)}_cedge ${clkNode} ${edgeNode} ${cF}`);
    lines.push(`${spiceBranchName("R", idLabel)}_cedge ${edgeNode} 0 ${rOhm}`);
}

export function logicNandBsourceExpression(aNode, bNode, vhi) {
    const th = vhi / 2;
    return `{ (1-${stepGt(aNode, th)}*${stepGt(bNode, th)})*${vhi} }`;
}

export function logicDffQiExpression(
    dNode,
    edgeNode,
    clkNode,
    qOutNode,
    vhi,
    dFromComplementOfQ = false,
    setNode = null,
    resetNode = null,
    useFallingClockEdge = false
) {
    const th = vhi / 2;
    const edge = useFallingClockEdge
        ? fallingEdgeFromRc(edgeNode, clkNode, th)
        : risingEdgeFromRc(edgeNode, clkNode, th);
    // Si D et /Q sont sur le même nœud, ne pas lire V(D) dans B_qi : boucle avec B_qbar → nœud D.
    // On impose alors D = ¬Q au front (diviseur par 2), cohérent avec le câblage.
    const dVal = dFromComplementOfQ
        ? `(1-${stepGt(qOutNode, th)})*${vhi}`
        : `${stepGt(dNode, th)}*${vhi}`;
    const hold = `${stepGt(qOutNode, th)}*${vhi}`;
    const clocked = `(${edge})*(${dVal}) + (1-(${edge}))*(${hold})`;
    if (setNode == null && resetNode == null) {
        return `{ ${clocked} }`;
    }
    // Set / Reset asynchrones, actifs à l'état haut, Reset prioritaire sur Set.
    const set = setNode != null ? stepGt(setNode, th) : "0";
    const rst = resetNode != null ? stepGt(resetNode, th) : "0";
    return `{ (1-(${rst}))*( (${set})*${vhi} + (1-(${set}))*(${clocked}) ) }`;
}

export function logicJkQiExpression(jNode, kNode, edgeNode, clkNode, qOutNode, vhi, setNode = null, resetNode = null, useFallingClockEdge = false) {
    const th = vhi / 2;
    const edge = useFallingClockEdge
        ? fallingEdgeFromRc(edgeNode, clkNode, th)
        : risingEdgeFromRc(edgeNode, clkNode, th);
    const j = stepGt(jNode, th);
    const k = stepGt(kNode, th);
    const q = stepGt(qOutNode, th);
    const toggle = `(1-${q})*${vhi}`;
    const hold = `${q}*${vhi}`;
    const next = `((${j})*(${k})*(${toggle}) + (${j})*(1-(${k}))*${vhi} + (1-(${j}))*(${k})*0 + (1-(${j}))*(1-(${k}))*(${hold}))`;
    const clocked = `(${edge})*(${next}) + (1-(${edge}))*(${hold})`;
    if (setNode == null && resetNode == null) {
        return `{ ${clocked} }`;
    }
    const set = setNode != null ? stepGt(setNode, th) : "0";
    const rst = resetNode != null ? stepGt(resetNode, th) : "0";
    return `{ (1-(${rst}))*( (${set})*${vhi} + (1-(${set}))*(${clocked}) ) }`;
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
 * @param {{ repoRoot?: string; ngspiceExe?: string; ngspiceEnv?: NodeJS.ProcessEnv; forceBsourceDff?: boolean; forceXspiceDff?: boolean }} opts
 */
export function useLogicDffXspice(opts = {}) {
    if (opts.forceBsourceDff === true) return false;
    if (!isXspiceDffAvailable(opts.repoRoot)) return false;
    if (opts.forceXspiceDff === true) return true;
    if (opts.ngspiceExe) return ngspiceHasXspice(opts.ngspiceExe, opts.ngspiceEnv);
    return false;
}

export { xspiceCodemodelLines, isXspiceDffAvailable };

export function appendLogicDffNetlist(c, nodeFor, vhi, lines, spiceBranchName, opts = {}) {
    if (useLogicDffXspice(opts)) {
        appendLogicDffXspiceNetlist(c, nodeFor, vhi, lines, spiceBranchName, opts);
        return;
    }
    appendLogicDffBsourceNetlist(c, nodeFor, vhi, lines, spiceBranchName, opts);
}

function appendLogicDffBsourceNetlist(c, nodeFor, vhi, lines, spiceBranchName, opts = {}) {
    const nD = nodeFor(`${c.id}#0`);
    const nClk = nodeFor(`${c.id}#1`);
    const nQ = nodeFor(`${c.id}#2`);
    const nQbar = nodeFor(`${c.id}#3`);
    const nSet = nodeFor(`${c.id}#4`);
    const nReset = nodeFor(`${c.id}#5`);
    const nQi = nodeFor(`${c.id}#__qi`);
    const nEdge = nodeFor(`${c.id}#__clkedge`);
    const dAndQbarShared = nD === nQbar;
    const cEdge = dAndQbarShared ? TOGGLE_CLK_EDGE_C_F : CLK_EDGE_C_F;
    const rEdge = dAndQbarShared ? TOGGLE_CLK_EDGE_R_OHM : CLK_EDGE_R_OHM;
    const cSt = dAndQbarShared ? TOGGLE_FF_STATE_C_F : FF_STATE_C_F;
    const rQ = dAndQbarShared ? TOGGLE_FF_Q_R_OHM : FF_Q_R_OHM;
    // Tirage à 0 V des broches Set/Reset : inactives (état bas) si non câblées.
    lines.push(`${spiceBranchName("R", c.id)}_setpd ${nSet} 0 1e9`);
    lines.push(`${spiceBranchName("R", c.id)}_rstpd ${nReset} 0 1e9`);
    const vClk = vhi > 0 ? vhi : 5;
    let nClkDet = nClk;
    if (opts.clockInvert && opts.rippleClockFromPrev !== "q") {
        nClkDet = nodeFor(`${c.id}#__xa_clkinv`);
        lines.push(
            `${spiceBranchName("B", c.id)}_clkinv ${nClkDet} 0 V = { ${vClk} - V(${nClk}) }`
        );
    }
    appendClkEdgeDetector(nClkDet, nEdge, lines, spiceBranchName, c.id, cEdge, rEdge);
    lines.push(
        `${spiceBranchName("B", c.id)}_qi ${nQi} 0 V = ${logicDffQiExpression(
            nD,
            nEdge,
            nClkDet,
            nQ,
            vhi,
            dAndQbarShared,
            nSet,
            nReset,
            opts.rippleClockFromPrev === "q"
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

export function useLogicJkXspice(opts = {}) {
    if (opts.forceBsourceJk === true) return false;
    if (!isXspiceDffAvailable(opts.repoRoot)) return false;
    if (opts.forceXspiceJk === true) return true;
    if (opts.ngspiceExe) return ngspiceHasXspice(opts.ngspiceExe, opts.ngspiceEnv);
    return false;
}

export function useLogicCd4511Xspice(opts = {}) {
    if (opts.forceBsourceCd4511 === true) return false;
    if (!isXspiceDffAvailable(opts.repoRoot)) return false;
    if (opts.forceXspiceCd4511 === true) return true;
    if (opts.ngspiceExe) return ngspiceHasXspice(opts.ngspiceExe, opts.ngspiceEnv);
    return false;
}

export function appendLogicCd4511Netlist(c, nodeFor, vhi, lines, spiceBranchName, opts = {}) {
    if (useLogicCd4511Xspice(opts)) {
        appendLogicCd4511XspiceNetlist(c, nodeFor, vhi, lines, spiceBranchName, opts);
        return;
    }
    appendLogicCd4511BsourceNetlist(c, nodeFor, vhi, lines, spiceBranchName, opts);
}

export function resolveLogicCd4511Vhi(c, logicVhiByTerminal, parseLogicRail, logicVhiFn) {
    let vhi = 0;
    for (const k of cd4511InputNodeKeys(c)) {
        vhi = Math.max(vhi, logicVhiByTerminal.get(k) ?? 0);
    }
    for (const k of cd4511OutputNodeKeys(c)) {
        vhi = Math.max(vhi, logicVhiByTerminal.get(k) ?? 0);
    }
    if (c.logicRail != null && c.logicRail !== "") {
        vhi = Math.max(vhi, logicVhiFn(parseLogicRail(c.logicRail)));
    }
    if (vhi <= 0) vhi = 5;
    return vhi > 0 ? vhi : 5;
}

export function appendLogicJkNetlist(c, nodeFor, vhi, lines, spiceBranchName, opts = {}) {
    if (useLogicJkXspice(opts)) {
        appendLogicJkXspiceNetlist(c, nodeFor, vhi, lines, spiceBranchName, opts);
        return;
    }
    appendLogicJkBsourceNetlist(c, nodeFor, vhi, lines, spiceBranchName, opts);
}

function appendLogicJkBsourceNetlist(c, nodeFor, vhi, lines, spiceBranchName, opts = {}) {
    const nJ = nodeFor(`${c.id}#0`);
    const nK = nodeFor(`${c.id}#1`);
    const nClk = nodeFor(`${c.id}#2`);
    const nQ = nodeFor(`${c.id}#3`);
    const nQbar = nodeFor(`${c.id}#4`);
    const nSet = nodeFor(`${c.id}#5`);
    const nReset = nodeFor(`${c.id}#6`);
    const nQi = nodeFor(`${c.id}#__qi`);
    const nEdge = nodeFor(`${c.id}#__clkedge`);
    lines.push(`${spiceBranchName("R", c.id)}_setpd ${nSet} 0 1e9`);
    lines.push(`${spiceBranchName("R", c.id)}_rstpd ${nReset} 0 1e9`);
    appendClkEdgeDetector(nClk, nEdge, lines, spiceBranchName, c.id, TOGGLE_CLK_EDGE_C_F, TOGGLE_CLK_EDGE_R_OHM);
    lines.push(
        `${spiceBranchName("B", c.id)}_qi ${nQi} 0 V = ${logicJkQiExpression(nJ, nK, nEdge, nClk, nQ, vhi, nSet, nReset, opts.rippleClockFromPrev === "q")}`
    );
    lines.push(`${spiceBranchName("R", c.id)}_q ${nQi} ${nQ} ${TOGGLE_FF_Q_R_OHM}`);
    lines.push(`${spiceBranchName("C", c.id)}_st ${nQi} 0 ${TOGGLE_FF_STATE_C_F}`);
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
