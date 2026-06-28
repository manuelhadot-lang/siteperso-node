/**
 * LM386 — amplificateur audio mono-alimentation (DIP-8).
 * Gain externe (broches 1–8), sortie écrêtée aux rails 0…V+.
 */

import { LM386_PIN } from "../lm386-layout.js";
import { reachableJonctions } from "./hc90-cascade.mjs";
import { fixedVoltageAtJunction } from "./arduino-analog-ideal.mjs";

const LM386_VOUT_MIN = 0.2;
const LM386_VOUT_MARGIN = 0.2;

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

function parseCapFarad(s) {
    if (s == null) return 1e-6;
    let t = String(s).trim().toLowerCase().replace(/\s/g, "").replace(",", ".").replace("µ", "u");
    if (!t) return 1e-6;
    let mult = 1;
    if (t.endsWith("uf") || t.endsWith("u")) {
        mult = 1e-6;
        t = t.endsWith("uf") ? t.slice(0, -2) : t.slice(0, -1);
    } else if (t.endsWith("nf") || t.endsWith("n")) {
        mult = 1e-9;
        t = t.endsWith("nf") ? t.slice(0, -2) : t.slice(0, -1);
    } else if (t.endsWith("pf") || t.endsWith("p")) {
        mult = 1e-12;
        t = t.endsWith("pf") ? t.slice(0, -2) : t.slice(0, -1);
    } else if (t.endsWith("mf") || t.endsWith("m")) {
        mult = t.endsWith("mf") ? 1e-3 : 1e-3;
        t = t.slice(0, t.endsWith("mf") ? -2 : -1);
    } else if (t.endsWith("f")) {
        mult = 1;
        t = t.slice(0, -1);
    }
    const n = parseFloat(t);
    return Number.isFinite(n) && n > 0 ? n * mult : 1e-6;
}

function ufFind(parent, k) {
    if (!k || !parent.has(k)) return k;
    let root = k;
    while (parent.get(root) !== root) root = parent.get(root);
    let cur = k;
    while (parent.get(cur) !== root) {
        const next = parent.get(cur);
        parent.set(cur, root);
        cur = next;
    }
    return root;
}

function ufUnion(parent, a, b) {
    if (!a || !b) return;
    const ra = ufFind(parent, a);
    const rb = ufFind(parent, b);
    if (ra !== rb) parent.set(ra, rb);
}

function buildSpiceWireParent(components, wires) {
    const parent = new Map();
    const touch = (k) => {
        if (k && !parent.has(k)) parent.set(k, k);
    };
    for (const c of components) {
        if (c.type === "lm386") {
            for (let i = 0; i < 8; i++) touch(`${c.id}#${i}`);
        }
        if (c.type === "resistor" || c.type === "potentiometer" || c.type === "capacitor") {
            touch(`${c.id}#0`);
            touch(`${c.id}#1`);
        }
        if (c.type === "potentiometer") touch(`${c.id}#2`);
        if (c.type === "vterm" || c.type === "vsource" || c.type === "ground") {
            touch(`${c.id}#0`);
            if (c.type !== "ground") touch(`${c.id}#1`);
        }
    }
    for (const w of wires || []) {
        if (!w?.solid || !w.fromKey || !w.toKey) continue;
        touch(w.fromKey);
        touch(w.toKey);
        ufUnion(parent, w.fromKey, w.toKey);
    }
    return parent;
}

function sameSpiceNet(a, b, parent) {
    if (!a || !b) return false;
    return ufFind(parent, a) === ufFind(parent, b);
}

function componentConnectsNets(comp, netA, netB, parent) {
    if (comp.type === "resistor" || comp.type === "capacitor") {
        const k0 = `${comp.id}#0`;
        const k1 = `${comp.id}#1`;
        return (
            (sameSpiceNet(k0, netA, parent) && sameSpiceNet(k1, netB, parent)) ||
            (sameSpiceNet(k0, netB, parent) && sameSpiceNet(k1, netA, parent))
        );
    }
    return false;
}

/** Gain : 20 (1–8 ouverts), 50 (1,2 kΩ), 200 (10 µF), 200 (court-circuit 1–8). */
export function detectLm386Gain(comp, components, wires) {
    const g1 = `${comp.id}#${LM386_PIN.G1}`;
    const g8 = `${comp.id}#${LM386_PIN.G8}`;
    const parent = buildSpiceWireParent(components, wires);

    if (sameSpiceNet(g1, g8, parent)) return 200;

    let hasCap = false;
    let hasRes = false;
    let resOhm = 0;

    for (const c of components) {
        if (c.type === "capacitor" && componentConnectsNets(c, g1, g8, parent)) {
            hasCap = true;
        }
        if (c.type === "resistor" && componentConnectsNets(c, g1, g8, parent)) {
            hasRes = true;
            resOhm = parseResistorOhms(c.value);
        }
    }

    if (hasCap && !hasRes) return 200;
    if (hasCap && hasRes) {
        if (resOhm >= 800 && resOhm <= 2000) return 50;
        return 200;
    }
    if (hasRes) {
        if (resOhm >= 800 && resOhm <= 2000) return 50;
        if (resOhm <= 100) return 200;
        return Math.max(20, Math.min(200, Math.round(1 + 150000 / resOhm)));
    }
    return 20;
}

function parseDcVolts(value) {
    const s = String(value ?? "").trim();
    const m = s.match(/([-+]?[\d.]+)/);
    if (!m) return NaN;
    const n = parseFloat(m[1]);
    return Number.isFinite(n) ? n : NaN;
}

/** Tension d'alimentation V+ (broche 6) — pile/VCC câblée ou propriété vplus. */
export function detectLm386VccVolts(comp, components, wires) {
    const parent = buildSpiceWireParent(components, wires);
    const vccKey = `${comp.id}#${LM386_PIN.VCC}`;
    const vccRoot = ufFind(parent, vccKey);

    for (const c of components) {
        if (c.type === "vterm" || c.type === "vsource") {
            const pos = `${c.id}#1`;
            const neg = `${c.id}#0`;
            if (sameSpiceNet(pos, vccKey, parent)) {
                const v = parseDcVolts(c.value);
                if (Number.isFinite(v) && v > 0) return v;
            }
            if (sameSpiceNet(neg, vccKey, parent)) return 0;
        }
        if (c.type === "battery") {
            const pos = `${c.id}#1`;
            if (sameSpiceNet(pos, vccKey, parent)) {
                const v = parseDcVolts(c.value);
                if (Number.isFinite(v) && v > 0) return v;
            }
        }
    }

    const fallback = Number(comp?.vplus);
    return Number.isFinite(fallback) && fallback > 0 ? fallback : 9;
}

export function lm386VoutMax(vcc) {
    return Math.max(LM386_VOUT_MIN, vcc - LM386_VOUT_MARGIN);
}

export function lm386Vbias(vcc) {
    return vcc / 2;
}

export function clipLm386Output(vIdeal, vcc) {
    const vmax = lm386VoutMax(vcc);
    return Math.max(LM386_VOUT_MIN, Math.min(vmax, vIdeal));
}

/** Sortie broche OUT (réf. masse) — repos à V+/2. */
export function lm386OutVoltage(diff, gain, vcc) {
    return clipLm386Output(lm386Vbias(vcc) + gain * diff, vcc);
}

/** Tension après condensateur de couplage (AC centré sur 0 V). */
export function lm386AcCoupledVoltage(diff, gain, vcc) {
    return lm386OutVoltage(diff, gain, vcc) - lm386Vbias(vcc);
}

/** Chaîne d'amplificateurs idéale pour l'aperçu scope (gain + écrêtage mono-rail). */
export function lm386PreviewStage(gain, vcc, acCoupled = true) {
    return {
        type: "lm386",
        gain,
        vbias: lm386Vbias(vcc),
        acCoupled,
        vp: lm386VoutMax(vcc),
        vn: LM386_VOUT_MIN,
        vcc,
    };
}

/**
 * @param {(key: string) => string} nodeFor
 * @param {(a: string, b: string) => string} spiceVoltageDiffExpr
 */
export function appendLm386Netlist(c, ctx) {
    const {
        nodeFor,
        components,
        wires,
        lines,
        warnings,
        terminalWireCount,
        spiceBranchName,
        spiceVoltageDiffExpr,
    } = ctx;

    const nOut = nodeFor(`${c.id}#${LM386_PIN.OUT}`);
    const nPlus = nodeFor(`${c.id}#${LM386_PIN.INP}`);
    const nMinus = nodeFor(`${c.id}#${LM386_PIN.INM}`);
    const nGnd = nodeFor(`${c.id}#${LM386_PIN.GND}`);
    const nVcc = nodeFor(`${c.id}#${LM386_PIN.VCC}`);

    if ((terminalWireCount.get(`${c.id}#${LM386_PIN.GND}`) || 0) === 0) {
        warnings.push(`${c.id} : broche GND (4) non câblée — reliez-la à la masse.`);
    }
    if ((terminalWireCount.get(`${c.id}#${LM386_PIN.VCC}`) || 0) === 0) {
        warnings.push(
            `${c.id} : broche V+ (6) non câblée — reliez-la au rail d'alimentation (ex. 9 V).`
        );
    }
    if ((terminalWireCount.get(`${c.id}#${LM386_PIN.OUT}`) || 0) === 0) {
        warnings.push(`${c.id} : sortie OUT (5) non câblée.`);
    }

    const parent = buildSpiceWireParent(components, wires);
    if (sameSpiceNet(`${c.id}#${LM386_PIN.VCC}`, `${c.id}#${LM386_PIN.OUT}`, parent)) {
        warnings.push(
            `${c.id} : broches V+ (6) et OUT (5) sur le même fil — court-circuit : supprimez le fil vertical entre ces deux broches.`
        );
    }

    const gain = detectLm386Gain(c, components, wires);
    const vcc = detectLm386VccVolts(c, components, wires);
    const vmax = lm386VoutMax(vcc);
    const vb = lm386Vbias(vcc);
    const diff = spiceVoltageDiffExpr(nPlus, nMinus);
    const bname = spiceBranchName("BLM386", c.id);

    lines.push(
        `${bname} ${nOut} 0 V={max(${LM386_VOUT_MIN}, min(${vmax}, ${vb}+${gain}*(${diff})))}`
    );

    const bypassWired = (terminalWireCount.get(`${c.id}#${LM386_PIN.BYP}`) || 0) > 0;
    const g1Wired = (terminalWireCount.get(`${c.id}#${LM386_PIN.G1}`) || 0) > 0;
    const g8Wired = (terminalWireCount.get(`${c.id}#${LM386_PIN.G8}`) || 0) > 0;
    if (bypassWired) {
        lines.push(`* ${c.id} LM386 bypass (7) câblé — modèle idéal (pas de bruit simulé)`);
    }
    if (g1Wired || g8Wired) {
        lines.push(`* ${c.id} LM386 gain=${gain} (broches 1–8)`);
    } else {
        lines.push(`* ${c.id} LM386 gain=${gain} (broches 1–8 ouvertes)`);
    }
    lines.push(`* ${c.id} LM386 V+=${vcc} V, repos ${vb} V, sortie ${LM386_VOUT_MIN}…${vmax} V`);

    return { gain, vcc };
}

export function isLm386Type(t) {
    return t === "lm386";
}

function sameUiNet(a, b, wires, autoJunctions) {
    if (!a || !b) return false;
    return reachableJonctions(a, wires, autoJunctions).has(b);
}

function uiComponentConnectsNets(comp, netA, netB, wires, autoJunctions) {
    if (comp.type === "resistor" || comp.type === "capacitor") {
        const rIn = `${comp.label}_in`;
        const rOut = `${comp.label}_out`;
        return (
            (sameUiNet(rIn, netA, wires, autoJunctions) && sameUiNet(rOut, netB, wires, autoJunctions)) ||
            (sameUiNet(rIn, netB, wires, autoJunctions) && sameUiNet(rOut, netA, wires, autoJunctions))
        );
    }
    return false;
}

/** Gain LM386 depuis le câblage schéma (jonctions UI). */
export function detectLm386GainForUi(comp, components, wires, autoJunctions = []) {
    const g1 = `${comp.label}_G1`;
    const g8 = `${comp.label}_G8`;
    if (sameUiNet(g1, g8, wires, autoJunctions)) return 200;

    let hasCap = false;
    let hasRes = false;
    let resOhm = 0;
    for (const c of components) {
        if (c.type === "capacitor" && uiComponentConnectsNets(c, g1, g8, wires, autoJunctions)) hasCap = true;
        if (c.type === "resistor" && uiComponentConnectsNets(c, g1, g8, wires, autoJunctions)) {
            hasRes = true;
            resOhm = parseResistorOhms(c.value);
        }
    }
    if (hasCap && !hasRes) return 200;
    if (hasCap && hasRes) {
        if (resOhm >= 800 && resOhm <= 2000) return 50;
        return 200;
    }
    if (hasRes) {
        if (resOhm >= 800 && resOhm <= 2000) return 50;
        if (resOhm <= 100) return 200;
        return Math.max(20, Math.min(200, Math.round(1 + 150000 / resOhm)));
    }
    return 20;
}

/** V+ LM386 depuis le câblage schéma ou propriété vplus. */
export function detectLm386VccForUi(comp, components, wires, autoJunctions = []) {
    const vccJ = `${comp.label}_VCC`;
    const net = reachableJonctions(vccJ, wires, autoJunctions);
    for (const j of net) {
        const fixed = fixedVoltageAtJunction(j);
        if (fixed != null && fixed > 0) return fixed;
    }
    for (const c of components) {
        if (c.type === "battery" || c.type === "vcc") {
            const out = `${c.label}_out`;
            const inn = `${c.label}_in`;
            if (net.has(out)) {
                const v = Number(c.value);
                if (Number.isFinite(v) && v > 0) return v;
            }
            if (c.type === "battery" && net.has(inn)) {
                const v = Number(c.value);
                if (Number.isFinite(v) && v > 0) return v;
            }
        }
    }
    const fallback = Number(comp?.vplus);
    return Number.isFinite(fallback) && fallback > 0 ? fallback : 9;
}
