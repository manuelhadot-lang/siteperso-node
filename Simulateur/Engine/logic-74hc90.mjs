/**
 * 74HC90 / 74LS90 — compteur décade asynchrone (÷2 + ÷5).
 * Brochage TI : CP1=1, MR1=2, MR2=3, VCC=5, MS1=6, MS2=7, Q2=8, Q1=9, GND=10, Q3=11, Q0=12, CP0=14.
 */
import {
    appendLogicJkNetlist,
    useLogicJkXspice,
} from "./logic-sequential.mjs";
import { logicJkXspiceInternalNodeKeys } from "./logic-xspice.mjs";

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

/** Sous-bascules JK internes (suffixes) — voir appendIc74hc90Netlist. */
const IC90_JK_SUFFIXES = ["u0", "u1", "u2", "u3"];

/** Nœuds internes d'une sous-bascule JK selon le moteur (XSPICE d_jkff ou source B). */
function ic90JkSubInternalKeys(subId, opts) {
    if (useLogicJkXspice(opts)) {
        return logicJkXspiceInternalNodeKeys({ id: subId }, {});
    }
    return [`${subId}#__qi`, `${subId}#__clkedge`, `${subId}#__qbar`];
}

export function ic74hc90InternalNodeKeys(c, opts = {}) {
    const keys = [
        `${c.id}#__mr`,
        `${c.id}#__ms`,
        `${c.id}#__rst_mid`,
        `${c.id}#__set_lo`,
        `${c.id}#__one`,
        `${c.id}#__jb`,
        `${c.id}#__jd`,
        `${c.id}#__clka`,
        `${c.id}#__clkbd`,
        `${c.id}#__clkc`,
    ];
    IC90_JK_SUFFIXES.forEach((sfx, i) => {
        keys.push(`${c.id}#__qb${i}`);
        for (const k of ic90JkSubInternalKeys(`${c.id}_${sfx}`, opts)) keys.push(k);
    });
    return keys;
}

function stepGt(node, th) {
    return `u(V(${node})-${th})`;
}

/**
 * 74HC90 modélisé avec 4 bascules JK (datasheet) :
 *   - FFA (Q0) : diviseur par 2, J=K=1, horloge CP0 (front descendant).
 *   - Section ÷5 SYNCHRONE (CP1) :
 *       FFB (Q1) : J=/Q3, K=1, horloge CP1↓
 *       FFC (Q2) : J=K=1, horloge Q1↓ (ripple interne ÷5)
 *       FFD (Q3) : J=Q1·Q2, K=1, horloge CP1↓
 * Aucune remise à zéro « décade » asynchrone auto-effaçante : la section ÷5
 * boucle naturellement (0→4→0), ce qui supprime la course qui faisait
 * « repartir de 4 » dès qu'on prélevait Q0/Q3 (report cascade).
 * MR1·MR2 force 0000 ; MS1·MS2 force 1001 (=9).
 * @param {object} c composant ic_74hc90
 */
export function appendIc74hc90Netlist(c, nodeFor, vhi, lines, spiceBranchName, deckOpts = {}) {
    const th = vhi > 0 ? vhi / 2 : 2.5;
    const v = vhi > 0 ? vhi : 5;
    const B = (suffix) => `${spiceBranchName("B", c.id)}${suffix}`;

    const nMr1 = nodeFor(`${c.id}#${IC90_PIN.MR1}`);
    const nMr2 = nodeFor(`${c.id}#${IC90_PIN.MR2}`);
    const nMs1 = nodeFor(`${c.id}#${IC90_PIN.MS1}`);
    const nMs2 = nodeFor(`${c.id}#${IC90_PIN.MS2}`);
    const nMr = nodeFor(`${c.id}#__mr`);
    const nMs = nodeFor(`${c.id}#__ms`);
    const nRstMid = nodeFor(`${c.id}#__rst_mid`);
    const nSetLo = nodeFor(`${c.id}#__set_lo`);
    const nOne = nodeFor(`${c.id}#__one`);

    lines.push(`${B("_mr")} ${nMr} 0 V = { ${stepGt(nMr1, th)}*${stepGt(nMr2, th)}*${v} }`);
    lines.push(`${B("_ms")} ${nMs} 0 V = { ${stepGt(nMs1, th)}*${stepGt(nMs2, th)}*${v} }`);
    // Reset des bascules Q1/Q2 : MR OU MS (le 9 a Q1=Q2=0).
    lines.push(
        `${B("_rstm")} ${nRstMid} 0 V = { (${stepGt(nMr, th)}+${stepGt(nMs, th)}-${stepGt(nMr, th)}*${stepGt(nMs, th)})*${v} }`
    );
    lines.push(`${spiceBranchName("V", c.id)}_setlo ${nSetLo} 0 DC 0`);
    lines.push(`${B("_one")} ${nOne} 0 V = { ${v} }`);

    const nCp0 = nodeFor(`${c.id}#${IC90_PIN.CP0}`);
    const nCp1 = nodeFor(`${c.id}#${IC90_PIN.CP1}`);
    const nQ0 = nodeFor(`${c.id}#${IC90_PIN.Q0}`);
    const nQ1 = nodeFor(`${c.id}#${IC90_PIN.Q1}`);
    const nQ2 = nodeFor(`${c.id}#${IC90_PIN.Q2}`);
    const nQ3 = nodeFor(`${c.id}#${IC90_PIN.Q3}`);

    // Entrées J combinatoires de la section ÷5.
    const nJb = nodeFor(`${c.id}#__jb`); // FFB : J = /Q3
    lines.push(`${B("_jb")} ${nJb} 0 V = { (1-${stepGt(nQ3, th)})*${v} }`);
    const nJd = nodeFor(`${c.id}#__jd`); // FFD : J = Q1·Q2
    lines.push(`${B("_jd")} ${nJd} 0 V = { ${stepGt(nQ1, th)}*${stepGt(nQ2, th)}*${v} }`);

    // Horloges inversées : déclenchement sur front descendant (74HC90 = négatif).
    const nClkA = nodeFor(`${c.id}#__clka`); // /CP0
    const nClkBD = nodeFor(`${c.id}#__clkbd`); // /CP1
    const nClkC = nodeFor(`${c.id}#__clkc`); // /Q1 (ripple FFC)
    // Pendant MR actif, geler toutes les horloges : sinon Q1↓ lors du reset asynchrone
    // horloge FFC (J=K=1) et le compteur se fige à 4 ; un front CP0 résiduel
    // (report cascade) peut aussi corrompre l'état juste après le reset.
    const mrOn = stepGt(nMr, th);
    lines.push(
        `${B("_clka")} ${nClkA} 0 V = { (1-(${mrOn}))*(${v} - V(${nCp0})) + (${mrOn})*${v} }`
    );
    lines.push(
        `${B("_clkbd")} ${nClkBD} 0 V = { (1-(${mrOn}))*(${v} - V(${nCp1})) + (${mrOn})*${v} }`
    );
    lines.push(
        `${B("_clkc")} ${nClkC} 0 V = { (1-(${mrOn}))*(${v} - V(${nQ1})) + (${mrOn})*${v} }`
    );

    const slices = [
        { sfx: "u0", q: nQ0, clk: nClkA, j: nOne, k: nOne, set: nMs, reset: nMr, srWired: { set: true, reset: true } },
        { sfx: "u1", q: nQ1, clk: nClkBD, j: nJb, k: nOne, set: nSetLo, reset: nRstMid, srWired: { set: false, reset: true } },
        { sfx: "u2", q: nQ2, clk: nClkC, j: nOne, k: nOne, set: nSetLo, reset: nMr, srWired: { set: false, reset: true } },
        { sfx: "u3", q: nQ3, clk: nClkBD, j: nJd, k: nOne, set: nMs, reset: nMr, srWired: { set: true, reset: true } },
    ];

    slices.forEach((sl, i) => {
        const subId = `${c.id}_${sl.sfx}`;
        const nQbar = nodeFor(`${c.id}#__qb${i}`);
        // Remap des broches JK (#0 J, #1 K, #2 CLK, #3 Q, #4 /Q, #5 Set, #6 Reset).
        const sub = { id: subId, type: "logic_jk" };
        const sliceNodeFor = (key) => {
            if (key === `${subId}#0`) return sl.j;
            if (key === `${subId}#1`) return sl.k;
            if (key === `${subId}#2`) return sl.clk;
            if (key === `${subId}#3`) return sl.q;
            if (key === `${subId}#4`) return nQbar;
            if (key === `${subId}#5`) return sl.set;
            if (key === `${subId}#6`) return sl.reset;
            return nodeFor(key);
        };
        appendLogicJkNetlist(sub, sliceNodeFor, v, lines, spiceBranchName, {
            ...deckOpts,
            srWired: sl.srWired,
        });
    });
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
