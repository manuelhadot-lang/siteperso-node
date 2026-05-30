/**
 * Construit une netlist ngspice (.op) à partir du JSON de l’éditeur graphique
 * (résistances, pile DC, générateurs, voltmètres, fils avec clés __t / __p).
 */

import { dirname, join } from "path";
import { fileURLToPath } from "url";

const __schematicDir = dirname(fileURLToPath(import.meta.url));
const DEFAULT_REPO_ROOT = join(__schematicDir, "..", "..");

import {
    logicVhi,
    logicVth,
    parseLogicRail,
    parseLogicStateVolts,
} from "./logic-rails.mjs";
import {
    appendIc74ls00Netlist,
    appendIc74ls74Netlist,
    appendLogicDffNetlist,
    appendLogicJkNetlist,
    isRippleClockFromPrevQ,
    logicSequentialInternalNodeKeys,
    ic74ls00NandGates,
    ic74ls00VccPinIndex,
    ic74ls74DffSlices,
    ic74ls74VccPinIndex,
    isIc74ls00Type,
    isIc74ls74Type,
    isLogicDigitalSimType,
    isLogicIcType,
    isLogicSequentialType,
    logicDffInputNodeKeys,
    logicDffSetResetNodeKeys,
    logicDffOutputNodeKey,
    logicDffOutputNodeKeys,
    logicDffQbarOutputNodeKey,
    logicDffDAndQbarShareNode,
    logicJkInputNodeKeys,
    logicJkSetResetNodeKeys,
    logicJkOutputNodeKey,
    logicJkOutputNodeKeys,
    logicJkQbarOutputNodeKey,
    resolveIc74ls00Vhi,
    resolveIc74ls74Vhi,
    resolveSequentialVhi,
    useLogicDffXspice,
    useLogicJkXspice,
    xspiceCodemodelLines,
    isXspiceDffAvailable,
} from "./logic-sequential.mjs";

function isLedType(t) {
    return t === "led" || t === "diode_led";
}

function isTwoTerminalType(t) {
    return (
        t === "resistor" ||
        t === "capacitor" ||
        t === "inductor" ||
        t === "diode" ||
        isLedType(t) ||
        t === "npn" ||
        t === "vsource" ||
        t === "voltmeter" ||
        t === "ammeter" ||
        t === "voltmeter_rms" ||
        t === "ammeter_rms" ||
        t === "ohmmeter"
    );
}

function isVoltmeterRmsType(t) {
    return t === "voltmeter_rms";
}

function isAmmeterRmsType(t) {
    return t === "ammeter_rms";
}

function isSignalGeneratorType(t) {
    return t === "vsin" || t === "vsquare" || t === "vpulse";
}

function isOscilloscopeType(t) {
    return t === "oscilloscope";
}

function isGroundType(t) {
    return t === "ground";
}

function isVtermType(t) {
    return t === "vterm";
}

function isLogicStateType(t) {
    return t === "logic_state";
}

function isSingleTerminalRefType(t) {
    return isGroundType(t) || isVtermType(t) || isLogicStateType(t);
}

function isOpampType(t) {
    return t === "opamp";
}

function isThreeTerminalType(t) {
    return t === "npn" || t === "opamp";
}

function isSeg7Type(t) {
    return t === "seg7";
}

function seg7TerminalKeys(c) {
    const keys = [];
    for (let i = 0; i < 8; i++) keys.push(`${c.id}#${i}`);
    return keys;
}

/** Bornes SPICE à enregistrer pour le câblage (union-find). */
function terminalKeysForComponent(c) {
    if (!c || !c.id) return [];
    if (isSeg7Type(c.type)) return seg7TerminalKeys(c);
    if (isOscilloscopeType(c.type)) return [`${c.id}#0`, `${c.id}#1`, `${c.id}#2`];
    if (isThreeTerminalType(c.type)) return [`${c.id}#0`, `${c.id}#1`, `${c.id}#2`];
    if (isLogicGateComponentType(c.type)) {
        return [...logicGateInputNodeKeys(c), logicGateOutputNodeKey(c)];
    }
    if (c.type === "logic_dff") {
        return [
            ...logicDffInputNodeKeys(c),
            ...logicDffSetResetNodeKeys(c),
            ...logicDffOutputNodeKeys(c),
        ];
    }
    if (c.type === "logic_jk") {
        return [
            ...logicJkInputNodeKeys(c),
            ...logicJkSetResetNodeKeys(c),
            ...logicJkOutputNodeKeys(c),
        ];
    }
    if (isLogicIcType(c.type)) {
        const keys = [];
        for (let i = 0; i < 14; i++) keys.push(`${c.id}#${i}`);
        return keys;
    }
    if (isSingleTerminalRefType(c.type)) return [`${c.id}#0`];
    if (isTwoTerminalType(c.type) || isSignalGeneratorType(c.type)) {
        return [`${c.id}#0`, `${c.id}#1`];
    }
    return [];
}

/** Comparateur / Schmitt (boucle + ou boucle ouverte) : bascule dure. Amplificateur (boucle −) : tanh raide. */
function opampUsesComparatorModel(c, parent) {
    const outKey = `${c.id}#2`;
    const posKey = `${c.id}#0`;
    const negKey = `${c.id}#1`;
    const outRoot = ufFind(parent, outKey);
    const posRoot = ufFind(parent, posKey);
    const negRoot = ufFind(parent, negKey);
    const positiveFeedback = outRoot === posRoot;
    const negativeFeedback = outRoot === negRoot;
    return positiveFeedback || !negativeFeedback;
}

/** Source comportementale AOP : saturation aux rails (comparateur, hystérésis, amplif.). */
function formatOpampBsourceLine(c, nOut, nPlus, nMinus, { comparatorMode = false } = {}) {
    const vp = parseOpampVp(c);
    const vn = parseOpampVn(c);
    const bname = spiceBranchName("BAOP", c.id);
    const diff = `V(${nPlus})-V(${nMinus})`;
    if (comparatorMode) {
        return `${bname} ${nOut} 0 V={${vn}+(${vp}-${vn})*u(${diff})}`;
    }
    const vmid = (vp + vn) / 2;
    const vhalf = (vp - vn) / 2;
    const gain = 1e5;
    return `${bname} ${nOut} 0 V={${vmid}+${vhalf}*tanh(${gain}*(${diff}))}`;
}

function isTerminalComponentType(t) {
    return (
        isTwoTerminalType(t) ||
        isOpampType(t) ||
        isSignalGeneratorType(t) ||
        isOscilloscopeType(t) ||
        isSingleTerminalRefType(t)
    );
}

function isPowerSourceType(t) {
    return t === "vsource" || t === "vsin" || t === "vsquare" || t === "vpulse" || t === "vterm" || t === "logic_state";
}

/** Courant de test pour l’ohmètre (mesure R = ΔV / I). */
const OHMMETER_TEST_CURRENT_A = 0.001;

function ufFind(parent, x) {
    if (!parent.has(x)) parent.set(x, x);
    const p = parent.get(x);
    if (p !== x) {
        const r = ufFind(parent, p);
        parent.set(x, r);
        return r;
    }
    return x;
}

function ufUnion(parent, a, b) {
    const ra = ufFind(parent, a);
    const rb = ufFind(parent, b);
    if (ra !== rb) parent.set(ra, rb);
}

function parseResistanceOhm(s) {
    if (s == null) return 1000;
    let t = String(s).trim().toLowerCase().replace(/\s/g, "");
    if (!t) return 1000;
    let mult = 1;
    if (t.endsWith("meg")) {
        mult = 1e6;
        t = t.slice(0, -3);
    } else if (t.endsWith("k")) {
        mult = 1e3;
        t = t.slice(0, -1);
    } else if (t.endsWith("m") && /^\d/.test(t.slice(0, -1))) {
        mult = 1e-3;
        t = t.slice(0, -1);
    }
    const n = parseFloat(t.replace(",", "."));
    return Number.isFinite(n) && n > 0 ? n * mult : 1000;
}

function parseCapacitanceFarad(s) {
    if (s == null) return 1e-6;
    let t = String(s).trim().toLowerCase().replace(/\s/g, "").replace(",", ".").replace("µ", "u");
    if (!t) return 1e-6;
    let mult = 1;
    if (t.endsWith("uf")) {
        mult = 1e-6;
        t = t.slice(0, -2);
    } else if (t.endsWith("nf")) {
        mult = 1e-9;
        t = t.slice(0, -2);
    } else if (t.endsWith("pf")) {
        mult = 1e-12;
        t = t.slice(0, -2);
    } else if (t.endsWith("mf")) {
        mult = 1e-3;
        t = t.slice(0, -2);
    } else if (t.endsWith("f")) {
        mult = 1;
        t = t.slice(0, -1);
    }
    const n = parseFloat(t);
    return Number.isFinite(n) && n > 0 ? n * mult : 1e-6;
}

function parseInductanceHenry(s) {
    if (s == null) return 1e-3;
    let t = String(s).trim().toLowerCase().replace(/\s/g, "").replace(",", ".").replace("µ", "u");
    if (!t) return 1e-3;
    let mult = 1;
    if (t.endsWith("mh")) {
        mult = 1e-3;
        t = t.slice(0, -2);
    } else if (t.endsWith("uh")) {
        mult = 1e-6;
        t = t.slice(0, -2);
    } else if (t.endsWith("kh")) {
        mult = 1e3;
        t = t.slice(0, -2);
    } else if (t.endsWith("h")) {
        mult = 1;
        t = t.slice(0, -1);
    }
    const n = parseFloat(t);
    return Number.isFinite(n) && n > 0 ? n * mult : 1e-3;
}

/** Nom de modèle SPICE pour un BJT (ex. 2N2222 → Q2N2222). */
function spiceBjtModelName(value) {
    const raw = String(value || "2N2222")
        .trim()
        .replace(/\s+/g, "");
    const safe = raw.replace(/[^a-zA-Z0-9_]/g, "");
    const base = safe.length ? safe : "2N2222";
    return /^[a-zA-Z_]/.test(base) ? `Q${base}` : `Q_${base}`;
}

/** Nom de modèle SPICE pour une diode (ex. 1N4148 → D1N4148). */
function spiceDiodeModelName(value) {
    const raw = String(value || "1N4148")
        .trim()
        .replace(/\s+/g, "");
    const safe = raw.replace(/[^a-zA-Z0-9_]/g, "");
    const base = safe.length ? safe : "1N4148";
    return /^[a-zA-Z_]/.test(base) ? `D${base}` : `D_${base}`;
}

function parseDcVolts(s) {
    if (s == null) return 5;
    const t = String(s).trim().replace(/\s/g, "").replace(",", ".");
    const m = /^([-+]?[\d.]+)\s*v?$/i.exec(t);
    if (m) return parseFloat(m[1]) || 5;
    const n = parseFloat(t.replace(/v$/i, ""));
    return Number.isFinite(n) ? n : 5;
}

/** Carré : « 5V 5V 1kHz 0V » — amplitudes + et − au-dessus / en dessous de l’offset. */
function parseSquareAmplitudes(s) {
    const raw = String(s || "").trim();
    const pair = /^([-+]?[\d.]+)\s*v\s+([-+]?[\d.]+)\s*v/i.exec(raw);
    if (pair) {
        return {
            ampPos: Math.abs(parseFloat(pair[1])) || 5,
            ampNeg: Math.abs(parseFloat(pair[2])) || 5,
        };
    }
    const vpk = parseDcVolts(s);
    return { ampPos: vpk, ampNeg: vpk };
}

/** Amplitude crête sinus : premier « …V » en tête de chaîne. */
function parseSinusAmplitudeVolts(s) {
    const raw = String(s || "").trim();
    const m = /^([-+]?[\d.]+)\s*v/i.exec(raw);
    if (!m) return 5;
    const n = parseFloat(m[1]);
    return Number.isFinite(n) ? Math.abs(n) : 5;
}

/** Phase sinus (°) : « 90° », « phase 45 », etc. */
function parsePhaseDeg(s) {
    const raw = String(s || "").trim();
    let m = /(?:phase|φ|phi)\s*([-+]?[\d.]+)\s*(?:°|deg)?/i.exec(raw);
    if (m) {
        const n = parseFloat(m[1]);
        return Number.isFinite(n) ? n : 0;
    }
    m = /([-+]?[\d.]+)\s*(?:°|deg)\s*$/i.exec(raw);
    if (m) {
        const n = parseFloat(m[1]);
        return Number.isFinite(n) ? n : 0;
    }
    return 0;
}

function parseOpampVp(c) {
    const n = Number(c?.vp);
    return Number.isFinite(n) ? n : 15;
}

function parseOpampVn(c) {
    const n = Number(c?.vn);
    return Number.isFinite(n) ? n : -15;
}

/** Offset DC (V) : dernier « …V » après la fréquence (sinus ou carré), ou mot offset. */
function parseOffsetVolts(s) {
    if (s == null) return 0;
    const raw = String(s).trim();
    const mOff = /(?:offset|off|dc)\s*([-+]?[\d.]+)\s*v?/i.exec(raw);
    if (mOff) {
        const n = parseFloat(mOff[1]);
        return Number.isFinite(n) ? n : 0;
    }
    const volts = [...raw.matchAll(/([-+]?[\d.]+)\s*v/gi)];
    const isSquarePair = /^([-+]?[\d.]+)\s*v\s+([-+]?[\d.]+)\s*v/i.test(raw);
    if (isSquarePair) {
        if (volts.length >= 3) {
            const n = parseFloat(volts[volts.length - 1][1]);
            return Number.isFinite(n) ? n : 0;
        }
        return 0;
    }
    if (volts.length >= 2) {
        const n = parseFloat(volts[volts.length - 1][1]);
        return Number.isFinite(n) ? n : 0;
    }
    return 0;
}

/** Extrait la fréquence (Hz) d’une chaîne du type « 5V 1kHz ». */
function parseFreqHz(s) {
    if (s == null) return 1000;
    const t = String(s).toLowerCase().replace(/\s/g, "").replace(",", ".");
    let m = /([\d.]+)\s*khz/.exec(t);
    if (m) {
        const n = parseFloat(m[1]);
        return Number.isFinite(n) && n > 0 ? n * 1000 : 1000;
    }
    m = /([\d.]+)\s*mhz/.exec(t);
    if (m) {
        const n = parseFloat(m[1]);
        return Number.isFinite(n) && n > 0 ? n * 1e6 : 1000;
    }
    m = /([\d.]+)\s*hz/.exec(t);
    if (m) {
        const n = parseFloat(m[1]);
        return Number.isFinite(n) && n > 0 ? n : 1000;
    }
    return 1000;
}

/** Amplitude haute d'un générateur d'impulsions : « 5V 1kHz 10% ». */
function parsePulseHighVolts(s) {
    if (s == null) return 5;
    const m = /([-+]?[\d.]+)\s*v/i.exec(String(s));
    if (m) {
        const n = parseFloat(m[1]);
        return Number.isFinite(n) && n > 0 ? n : 5;
    }
    return 5;
}

/** Rapport cyclique (%) : « 5V 1kHz 10% » ou « duty 25 ». */
function parseDutyPercent(s) {
    if (s == null) return 10;
    const raw = String(s).trim();
    let m = /([\d.]+)\s*%/.exec(raw);
    if (m) {
        const n = parseFloat(m[1]);
        return Number.isFinite(n) ? Math.min(99, Math.max(1, n)) : 10;
    }
    m = /duty\s*([\d.]+)/i.exec(raw);
    if (m) {
        const n = parseFloat(m[1]);
        return Number.isFinite(n) ? Math.min(99, Math.max(1, n)) : 10;
    }
    return 10;
}

function spiceBranchName(prefix, id) {
    const safe = String(id).replace(/[^a-zA-Z0-9_]/g, "_");
    return `${prefix}_${safe}`;
}

const LOGIC_VLO = 0;

function isLogicGateComponentType(t) {
    return (
        t === "logic_not" ||
        t === "logic_and" ||
        t === "logic_or" ||
        t === "logic_nand" ||
        t === "logic_nor" ||
        t === "logic_xor" ||
        t === "logic_xnor"
    );
}

/** Expression ngspice (source comportementale B) : niveaux 0 / rail, seuil à mi-rail. */
function logicGateBsourceExpression(type, inputNodes, vhi) {
    const hi = vhi;
    const lo = LOGIC_VLO;
    const th = vhi / 2;
    const a = inputNodes[0];
    const b = inputNodes[1];
    const gt = n => `u(V(${n})-${th})`;
    switch (type) {
        case "logic_not":
            return `{ (1-${gt(a)})*${hi} }`;
        case "logic_and":
            return `{ (${gt(a)})*(${gt(b)})*${hi} }`;
        case "logic_nand":
            return `{ (1-(${gt(a)})*(${gt(b)}))*${hi} }`;
        case "logic_or":
            return `{ ((${gt(a)})+(${gt(b)})>0)*${hi} }`;
        case "logic_nor":
            return `{ (1-((${gt(a)})+(${gt(b)})>0))*${hi} }`;
        case "logic_xor":
            return `{ abs(${gt(a)}-${gt(b)})*${hi} }`;
        case "logic_xnor":
            return `{ (1-abs(${gt(a)}-${gt(b)}))*${hi} }`;
        default:
            return `{ ${lo} }`;
    }
}

function logicGateOutputNodeKey(c) {
    return c.type === "logic_not" ? `${c.id}#1` : `${c.id}#2`;
}

function logicGateInputNodeKeys(c) {
    if (c.type === "logic_not") return [`${c.id}#0`];
    return [`${c.id}#0`, `${c.id}#1`];
}

/** Rail de sortie d’une porte : max des entrées (et override logicRail), pas la borne sortie (peut être à la masse). */
function resolveLogicGateVhi(c, logicVhiByTerminal) {
    let vhi = 0;
    for (const k of logicGateInputNodeKeys(c)) {
        vhi = Math.max(vhi, logicVhiByTerminal.get(k) ?? 0);
    }
    if (c.logicRail != null && c.logicRail !== "") {
        vhi = Math.max(vhi, logicVhi(parseLogicRail(c.logicRail)));
    }
    if (vhi <= 0) {
        const outKey = logicGateOutputNodeKey(c);
        vhi = logicVhiByTerminal.get(outKey) ?? 5;
    }
    return vhi > 0 ? vhi : 5;
}

/** Rail logique (V) par borne : états logiques, propagation réseau, sorties de portes. */
function computeLogicVhiByTerminalKey(components, parent) {
    const vhiByKey = new Map();

    const touchKey = (k, v) => {
        if (!k || !(v > 0)) return;
        const prev = vhiByKey.get(k);
        if (prev == null || v > prev) vhiByKey.set(k, v);
    };

    for (const c of components) {
        if (c.type === "logic_state") {
            touchKey(`${c.id}#0`, logicVhi(parseLogicRail(c.logicRail)));
        }
        if (c.type === "vsquare") {
            const { ampPos } = parseSquareAmplitudes(c.value);
            const voff = parseOffsetVolts(c.value);
            touchKey(`${c.id}#0`, voff + ampPos);
        }
        if (c.type === "vpulse") {
            touchKey(`${c.id}#0`, parsePulseHighVolts(c.value));
        }
        if (c.type === "vsin") {
            const voff = parseOffsetVolts(c.value);
            const vpk = parseSinusAmplitudeVolts(c.value);
            touchKey(`${c.id}#0`, voff + vpk);
        }
        if (isLogicGateComponentType(c.type) && c.logicRail != null && c.logicRail !== "") {
            const v = logicVhi(parseLogicRail(c.logicRail));
            for (const k of logicGateInputNodeKeys(c)) touchKey(k, v);
        }
        if (c.type === "logic_dff" && c.logicRail != null && c.logicRail !== "") {
            const v = logicVhi(parseLogicRail(c.logicRail));
            for (const k of logicDffInputNodeKeys(c)) touchKey(k, v);
        }
        if (c.type === "logic_jk" && c.logicRail != null && c.logicRail !== "") {
            const v = logicVhi(parseLogicRail(c.logicRail));
            for (const k of logicJkInputNodeKeys(c)) touchKey(k, v);
        }
        if (isLogicIcType(c.type) && c.logicRail != null && c.logicRail !== "") {
            const vccIdx = isIc74ls74Type(c.type) ? ic74ls74VccPinIndex() : ic74ls00VccPinIndex();
            touchKey(`${c.id}#${vccIdx}`, logicVhi(parseLogicRail(c.logicRail)));
        }
    }

    const propagateNets = () => {
        const netMax = new Map();
        for (const [k] of parent) {
            const r = ufFind(parent, k);
            const v = vhiByKey.get(k);
            if (v != null && v > 0) netMax.set(r, Math.max(netMax.get(r) ?? 0, v));
        }
        let changed = false;
        for (const [k] of parent) {
            const r = ufFind(parent, k);
            const target = netMax.get(r);
            if (target == null || target <= 0) continue;
            if ((vhiByKey.get(k) ?? 0) < target) {
                vhiByKey.set(k, target);
                changed = true;
            }
        }
        return changed;
    };

    for (let iter = 0; iter < 48; iter++) {
        let changed = false;
        for (const c of components) {
            if (!isLogicGateComponentType(c.type)) continue;
            let inVhi = 0;
            for (const k of logicGateInputNodeKeys(c)) {
                inVhi = Math.max(inVhi, vhiByKey.get(k) ?? 0);
            }
            if (inVhi <= 0) inVhi = 5;
            const outKey = logicGateOutputNodeKey(c);
            if ((vhiByKey.get(outKey) ?? 0) < inVhi) {
                vhiByKey.set(outKey, inVhi);
                changed = true;
            }
        }
        while (propagateNets()) changed = true;
        if (!changed) break;
    }

    return vhiByKey;
}

/** Durée SPICE (ex. 2.5u, 4m) pour .tran / wrdata. */
function formatSpiceTime(seconds) {
    const s = Math.abs(Number(seconds));
    if (!Number.isFinite(s) || s === 0) return "1n";
    if (s >= 1) return String(s);
    if (s >= 1e-3) return `${(s * 1e3).toPrecision(6)}m`;
    if (s >= 1e-6) return `${(s * 1e6).toPrecision(6)}u`;
    if (s >= 1e-9) return `${(s * 1e9).toPrecision(6)}n`;
    return `${s.toExponential(3)}`;
}

/** Aligné sur l’oscilloscope (8 div. horizontales, jusqu’à 500 µs/div). */
const TRAN_SCOPE_H_DIVS = 8;
const TRAN_MAX_TIME_DIV_SEC = 5e-4;
const TRAN_SAMPLES_PER_PERIOD = 200;
const TRAN_MAX_POINTS = 30000;

/** Pas et durée de simulation transitoire selon les générateurs AC du schéma. */
function computeTranTiming(components) {
    let minPeriod = 1;
    for (const c of components) {
        if (c.type !== "vsin" && c.type !== "vsquare" && c.type !== "vpulse") continue;
        const f = parseFreqHz(c.value);
        if (f > 0) minPeriod = Math.min(minPeriod, 1 / f);
    }
    const tstep = minPeriod / TRAN_SAMPLES_PER_PERIOD;
    let tstop = Math.max(minPeriod * 8, TRAN_SCOPE_H_DIVS * TRAN_MAX_TIME_DIV_SEC);

    // Compteur ripple (N bascules) : le bit MSB a une période ≈ T_clk × 2^N.
    // Il faut au moins 2^N fronts horloge LSB pour dépasser 7, 15, … (ex. 4 bascules → 16 impulsions).
    const numFf = components.filter((c) => c.type === "logic_dff" || c.type === "logic_jk").length;
    if (numFf > 0) {
        const ripplePeriods = (1 << numFf) + 2;
        tstop = Math.max(tstop, minPeriod * ripplePeriods);
    }

    if (tstop / tstep > TRAN_MAX_POINTS) {
        tstop = tstep * TRAN_MAX_POINTS;
    }
    return {
        tstep,
        tstop,
        tstepStr: formatSpiceTime(tstep),
        tstopStr: formatSpiceTime(tstop),
    };
}

const WIRE_EPS = 1e-6;

function parseVirtualWirePointKey(key) {
    const m = /^__(?:t|p)#([^#]+)#([^#]+)$/.exec(String(key || ""));
    if (!m) return null;
    const x = Number(m[1]);
    const y = Number(m[2]);
    return Number.isFinite(x) && Number.isFinite(y) ? { x, y } : null;
}

function pointOnWireSegment(p, a, b) {
    if (!p || !a || !b) return false;
    if (Math.abs(a.x - b.x) < WIRE_EPS) {
        return (
            Math.abs(p.x - a.x) < WIRE_EPS &&
            p.y >= Math.min(a.y, b.y) - WIRE_EPS &&
            p.y <= Math.max(a.y, b.y) + WIRE_EPS
        );
    }
    if (Math.abs(a.y - b.y) < WIRE_EPS) {
        return (
            Math.abs(p.y - a.y) < WIRE_EPS &&
            p.x >= Math.min(a.x, b.x) - WIRE_EPS &&
            p.x <= Math.max(a.x, b.x) + WIRE_EPS
        );
    }
    return false;
}

/**
 * @param {{ components: any[]; wires: any[] }} state
 * @param {{ gridStep?: number }} [opts]
 */
export function buildNetlistFromGraphicalState(state, opts = {}) {
    const deckOpts = { repoRoot: opts.repoRoot || DEFAULT_REPO_ROOT, ...opts };
    const warnings = [];
    const components = Array.isArray(state.components) ? state.components : [];
    const wires = Array.isArray(state.wires) ? state.wires : [];

    const parent = new Map();
    const terminalWireCount = new Map();

    function touch(k) {
        if (!parent.has(k)) parent.set(k, k);
    }

    for (const c of components) {
        for (const k of terminalKeysForComponent(c)) touch(k);
    }
    for (const w of wires) {
        if (!w || !w.solid || !w.fromKey || !w.toKey) continue;
        touch(w.fromKey);
        touch(w.toKey);
        terminalWireCount.set(w.fromKey, (terminalWireCount.get(w.fromKey) || 0) + 1);
        terminalWireCount.set(w.toKey, (terminalWireCount.get(w.toKey) || 0) + 1);
        ufUnion(parent, w.fromKey, w.toKey);
    }
    const virtualKeys = new Set();
    for (const w of wires) {
        if (!w || !w.solid) continue;
        if (parseVirtualWirePointKey(w.fromKey)) virtualKeys.add(w.fromKey);
        if (parseVirtualWirePointKey(w.toKey)) virtualKeys.add(w.toKey);
    }
    for (const key of virtualKeys) {
        const p = parseVirtualWirePointKey(key);
        for (const w of wires) {
            if (!w || !w.solid || !w.fromKey || !Array.isArray(w.points) || w.points.length < 2) continue;
            for (let i = 0; i < w.points.length - 1; i++) {
                if (pointOnWireSegment(p, w.points[i], w.points[i + 1])) {
                    ufUnion(parent, key, w.fromKey);
                    break;
                }
            }
        }
    }

    const powerSrc =
        components.find(c => c.type === "vsource") ||
        components.find(c => c.type === "vsin") ||
        components.find(c => c.type === "vsquare") ||
        components.find(c => c.type === "vpulse");
    const vtermComponents = components.filter(c => c.type === "vterm" || c.type === "logic_state");
    const groundComponents = components.filter(c => c.type === "ground");
    const hasVtermPower = vtermComponents.length > 0;
    const ohmeterComponents = components.filter(c => c.type === "ohmmeter");
    const needsDcSupply = components.some(
        c =>
            c.type === "voltmeter" ||
            c.type === "ammeter" ||
            c.type === "voltmeter_rms" ||
            c.type === "ammeter_rms" ||
            c.type === "oscilloscope"
    );

    if (needsDcSupply && !powerSrc && !hasVtermPower) {
        return {
            ok: false,
            errors: [
                "Voltmètre, ampèremètre (DC ou efficace), oscilloscope : ajoutez une source (pile, borne, état logique, sinus, carré ou impulsions GImp).",
            ],
            warnings,
            netlist: "",
            voltmeters: [],
            ammeters: [],
            ohmeters: [],
            oscilloscopes: [],
            nodeMeasures: [],
            scopesTranMeta: [],
            analysisTran: false,
        };
    }
    if (!powerSrc && !hasVtermPower && ohmeterComponents.length === 0 && groundComponents.length === 0) {
        return {
            ok: false,
            errors: [
                "Ajoutez une pile DC, une borne, un état logique, un générateur (sinus/carré), une masse, ou un ohmmètre pour définir le circuit.",
            ],
            warnings,
            netlist: "",
            voltmeters: [],
            ammeters: [],
            ohmeters: [],
            oscilloscopes: [],
            nodeMeasures: [],
            scopesTranMeta: [],
            analysisTran: false,
        };
    }

    let gndKey;
    if (groundComponents.length > 0) {
        gndKey = `${groundComponents[0].id}#0`;
    } else if (powerSrc) {
        gndKey = `${powerSrc.id}#1`;
    } else if (ohmeterComponents.length > 0) {
        gndKey = `${ohmeterComponents[0].id}#1`;
    } else {
        gndKey = "__spice_gnd__";
    }

    touch(gndKey);
    for (const g of groundComponents) {
        ufUnion(parent, `${g.id}#0`, gndKey);
    }
    const gndRoot = ufFind(parent, gndKey);
    if (powerSrc) {
        const vsrcP = `${powerSrc.id}#0`;
        const vsrcM = `${powerSrc.id}#1`;
        if ((terminalWireCount.get(vsrcP) || 0) === 0 || (terminalWireCount.get(vsrcM) || 0) === 0) {
            warnings.push(`Source ${powerSrc.id} : au moins une borne n’est reliée à aucun fil.`);
        }
    } else if (ohmeterComponents.length > 0) {
        warnings.push(
            "Mode ohmmètre : pas de pile — référence sur la borne « − » du premier ohmmètre ; courant de test injecté pour calculer R."
        );
    } else if (hasVtermPower) {
        for (const vt of vtermComponents) {
            const kp = `${vt.id}#0`;
            if ((terminalWireCount.get(kp) || 0) === 0) {
                const label = isLogicStateType(vt.type) ? "État logique" : "Borne";
                warnings.push(`${label} ${vt.id} : la connexion n’est reliée à aucun fil.`);
            }
        }
    }

    /* Nœuds internes LED / bascules : doivent exister avant l’attribution n1, n2… */
    for (const c of components) {
        if (isLedType(c.type)) touch(`${c.id}#__ledint`);
        for (const k of logicSequentialInternalNodeKeys(c, {
            ...deckOpts,
            rippleClockFromPrevQ: isRippleClockFromPrevQ(c, wires, components),
        })) touch(k);
    }

    const roots = new Set();
    for (const k of parent.keys()) roots.add(ufFind(parent, k));

    const rootToSpice = new Map();
    rootToSpice.set(gndRoot, "0");
    let ni = 1;
    const sortedRoots = [...roots].sort();
    for (const r of sortedRoots) {
        if (r === gndRoot) continue;
        rootToSpice.set(r, `n${ni++}`);
    }

    function nodeFor(key) {
        touch(key);
        const root = ufFind(parent, key);
        if (!rootToSpice.has(root)) {
            rootToSpice.set(root, `n${ni++}`);
        }
        return rootToSpice.get(root);
    }

    const logicVhiByTerminal = computeLogicVhiByTerminalKey(components, parent);

    const hasLogicDff = components.some((c) => c.type === "logic_dff");
    const hasLogicJk = components.some((c) => c.type === "logic_jk");
    const usesXspiceFf =
        (hasLogicDff && useLogicDffXspice(deckOpts)) || (hasLogicJk && useLogicJkXspice(deckOpts));
    const lines = [];
    lines.push("* Circuit Designer - netlist SPICE (.op)");
    if (usesXspiceFf) {
        for (const cmLine of xspiceCodemodelLines(deckOpts.repoRoot)) {
            lines.push(cmLine);
        }
        const ffTypes = [];
        if (hasLogicDff && useLogicDffXspice(deckOpts)) ffTypes.push("D (d_dff)");
        if (hasLogicJk && useLogicJkXspice(deckOpts)) ffTypes.push("JK (d_jkff)");
        warnings.push(
            `Bascule(s) ${ffTypes.join(", ")} : modèle XSPICE (digital.cm) — simulation mixte analogique/numérique.`
        );
    } else if ((hasLogicDff || hasLogicJk) && isXspiceDffAvailable(deckOpts.repoRoot)) {
        warnings.push(
            "Bascule(s) : digital.cm présent mais ngspice sans XSPICE — modèle sources B (voir Simulateur/lib/ngspice/README.txt)."
        );
    }

    const declaredDiodeModels = new Set();
    const declaredBjtModels = new Set();

    for (const c of components) {
        if (c.type === "resistor") {
            const n0 = nodeFor(`${c.id}#0`);
            const n1 = nodeFor(`${c.id}#1`);
            const ohms = parseResistanceOhm(c.value);
            lines.push(`${spiceBranchName("R", c.id)} ${n0} ${n1} ${ohms}`);
        } else if (c.type === "capacitor") {
            const n0 = nodeFor(`${c.id}#0`);
            const n1 = nodeFor(`${c.id}#1`);
            const farad = parseCapacitanceFarad(c.value);
            lines.push(`${spiceBranchName("C", c.id)} ${n0} ${n1} ${farad}`);
        } else if (c.type === "inductor") {
            const n0 = nodeFor(`${c.id}#0`);
            const n1 = nodeFor(`${c.id}#1`);
            const henry = parseInductanceHenry(c.value);
            lines.push(`${spiceBranchName("L", c.id)} ${n0} ${n1} ${henry}`);
        } else if (c.type === "diode") {
            const n0 = nodeFor(`${c.id}#0`);
            const n1 = nodeFor(`${c.id}#1`);
            const model = spiceDiodeModelName(c.value);
            if (!declaredDiodeModels.has(model)) {
                declaredDiodeModels.add(model);
                const v = String(c.value || "").toLowerCase();
                if (v.includes("4148")) {
                    lines.push(
                        `.model ${model} D (IS=2.52n RS=0.568 N=1.752 TT=4n CJO=4p M=0.4 BV=100)`
                    );
                } else {
                    lines.push(`.model ${model} D`);
                }
            }
            lines.push(`${spiceBranchName("D", c.id)} ${n0} ${n1} ${model}`);
        } else if (isLedType(c.type)) {
            const anode = nodeFor(`${c.id}#0`);
            const cathode = nodeFor(`${c.id}#1`);
            touch(`${c.id}#__ledint`);
            const mid = nodeFor(`${c.id}#__ledint`);
            if (!declaredDiodeModels.has("DLED")) {
                declaredDiodeModels.add("DLED");
                lines.push(
                    `.model DLED D (IS=1.05E-15 N=1.8 RS=15 BV=50 IBV=10u CJO=10p)`
                );
            }
            /* Source 0 V en série : ngspice ne fournit pas toujours i(D_*), mais i(VIL_*) oui. */
            lines.push(`${spiceBranchName("VIL", c.id)} ${anode} ${mid} 0`);
            lines.push(`${spiceBranchName("D", c.id)} ${mid} ${cathode} DLED`);
        } else if (c.type === "npn") {
            const nb = nodeFor(`${c.id}#0`);
            const nc = nodeFor(`${c.id}#1`);
            const ne = nodeFor(`${c.id}#2`);
            const model = spiceBjtModelName(c.value);
            if (!declaredBjtModels.has(model)) {
                declaredBjtModels.add(model);
                const v = String(c.value || "").toLowerCase();
                if (v.includes("2222")) {
                    lines.push(
                        `.model ${model} NPN (IS=1e-14 BF=200 VAF=100 IKF=0.3 CJE=2.4p CJC=8p TF=0.5n TR=50n)`
                    );
                } else {
                    lines.push(`.model ${model} NPN`);
                }
            }
            lines.push(`${spiceBranchName("Q", c.id)} ${nc} ${nb} ${ne} ${model}`);
        } else if (c.type === "opamp") {
            const nPlus = nodeFor(`${c.id}#0`);
            const nMinus = nodeFor(`${c.id}#1`);
            const nOut = nodeFor(`${c.id}#2`);
            const comparatorMode = opampUsesComparatorModel(c, parent);
            lines.push(formatOpampBsourceLine(c, nOut, nPlus, nMinus, { comparatorMode }));
        } else if (isLogicGateComponentType(c.type)) {
            const inKeys = logicGateInputNodeKeys(c);
            const inNodes = inKeys.map(k => nodeFor(k));
            const outKey = logicGateOutputNodeKey(c);
            const nOut = nodeFor(outKey);
            const vhi = resolveLogicGateVhi(c, logicVhiByTerminal);
            const expr = logicGateBsourceExpression(c.type, inNodes, vhi);
            lines.push(`${spiceBranchName("B", c.id)} ${nOut} 0 V = ${expr}`);
        } else if (c.type === "logic_dff") {
            const vhi = resolveSequentialVhi(
                c,
                logicVhiByTerminal,
                parseLogicRail,
                logicVhi,
                logicDffInputNodeKeys(c)
            );
            const srWired = {
                set: (terminalWireCount.get(`${c.id}#4`) || 0) > 0,
                reset: (terminalWireCount.get(`${c.id}#5`) || 0) > 0,
            };
            appendLogicDffNetlist(c, nodeFor, vhi, lines, spiceBranchName, {
                ...deckOpts,
                srWired,
                rippleClockFromPrevQ: isRippleClockFromPrevQ(c, wires, components),
            });
        } else if (c.type === "logic_jk") {
            const vhi = resolveSequentialVhi(
                c,
                logicVhiByTerminal,
                parseLogicRail,
                logicVhi,
                logicJkInputNodeKeys(c)
            );
            const srWired = {
                set: (terminalWireCount.get(`${c.id}#5`) || 0) > 0,
                reset: (terminalWireCount.get(`${c.id}#6`) || 0) > 0,
            };
            appendLogicJkNetlist(c, nodeFor, vhi, lines, spiceBranchName, {
                ...deckOpts,
                srWired,
                rippleClockFromPrevQ: isRippleClockFromPrevQ(c, wires, components),
            });
        } else if (isIc74ls00Type(c.type)) {
            const vhi = resolveIc74ls00Vhi(c, logicVhiByTerminal, parseLogicRail, logicVhi);
            appendIc74ls00Netlist(c, nodeFor, vhi, lines, spiceBranchName);
        } else if (isIc74ls74Type(c.type)) {
            const vhi = resolveIc74ls74Vhi(c, logicVhiByTerminal, parseLogicRail, logicVhi);
            appendIc74ls74Netlist(c, nodeFor, vhi, lines, spiceBranchName);
        } else if (c.type === "vsource") {
            const n0 = nodeFor(`${c.id}#0`);
            const n1 = nodeFor(`${c.id}#1`);
            const v = parseDcVolts(c.value);
            lines.push(`${spiceBranchName("V", c.id)} ${n0} ${n1} DC ${v}`);
        } else if (c.type === "vterm") {
            const n0 = nodeFor(`${c.id}#0`);
            const v = parseDcVolts(c.value);
            lines.push(`${spiceBranchName("V", c.id)} ${n0} 0 DC ${v}`);
        } else if (c.type === "logic_state") {
            const n0 = nodeFor(`${c.id}#0`);
            const v = parseLogicStateVolts(c.value, c.logicRail);
            lines.push(`${spiceBranchName("V", c.id)} ${n0} 0 DC ${v}`);
        } else if (c.type === "vsin") {
            const n0 = nodeFor(`${c.id}#0`);
            const n1 = nodeFor(`${c.id}#1`);
            const vpk = parseSinusAmplitudeVolts(c.value);
            const freq = parseFreqHz(c.value);
            const voff = parseOffsetVolts(c.value);
            const phi = parsePhaseDeg(c.value);
            lines.push(`${spiceBranchName("V", c.id)} ${n0} ${n1} SIN(${voff} ${vpk} ${freq} 0 0 ${phi})`);
        } else if (c.type === "vsquare") {
            const n0 = nodeFor(`${c.id}#0`);
            const n1 = nodeFor(`${c.id}#1`);
            const freq = parseFreqHz(c.value);
            const voff = parseOffsetVolts(c.value);
            const { ampPos, ampNeg } = parseSquareAmplitudes(c.value);
            const period = 1 / freq;
            const ton = period / 2;
            const vlow = voff - ampNeg;
            const vhi = voff + ampPos;
            lines.push(
                `${spiceBranchName("V", c.id)} ${n0} ${n1} PULSE(${vlow} ${vhi} 0 1n 1n ${ton} ${period})`
            );
        } else if (c.type === "vpulse") {
            const n0 = nodeFor(`${c.id}#0`);
            const n1 = nodeFor(`${c.id}#1`);
            const freq = parseFreqHz(c.value);
            const vhi = parsePulseHighVolts(c.value);
            const duty = parseDutyPercent(c.value);
            const period = 1 / freq;
            const pw = period * duty / 100;
            lines.push(
                `${spiceBranchName("V", c.id)} ${n0} ${n1} PULSE(0 ${vhi} 0 1n 1n ${formatSpiceTime(pw)} ${formatSpiceTime(period)})`
            );
        } else if (c.type === "ammeter" || isAmmeterRmsType(c.type)) {
            const n0 = nodeFor(`${c.id}#0`);
            const n1 = nodeFor(`${c.id}#1`);
            const kp = `${c.id}#0`;
            const km = `${c.id}#1`;
            const label = isAmmeterRmsType(c.type) ? "Ampèremètre (eff.)" : "Ampèremètre";
            if ((terminalWireCount.get(kp) || 0) === 0 || (terminalWireCount.get(km) || 0) === 0) {
                warnings.push(`${label} ${c.id} : au moins une borne n’est reliée à aucun fil (branchement en série requis).`);
            }
            if (n0 === n1) {
                warnings.push(`${label} ${c.id} : les deux bornes sont sur le même nœud (${n0}).`);
            } else {
                lines.push(`${spiceBranchName("VI", c.id)} ${n0} ${n1} DC 0`);
            }
        }
    }

    for (const c of components) {
        if (c.type !== "voltmeter" && !isVoltmeterRmsType(c.type)) continue;
        const kp = `${c.id}#0`;
        const km = `${c.id}#1`;
        const label = isVoltmeterRmsType(c.type) ? "Voltmètre (eff.)" : "Voltmètre";
        if ((terminalWireCount.get(kp) || 0) === 0 || (terminalWireCount.get(km) || 0) === 0) {
            warnings.push(`${label} ${c.id} : au moins une borne n’est reliée à aucun fil.`);
        }
        const n0 = nodeFor(kp);
        const n1 = nodeFor(km);
        if (n0 !== n1) {
            lines.push(`${spiceBranchName("RVM", c.id)} ${n0} ${n1} 1e12`);
        }
    }

    const ohmeters = [];
    for (const c of components) {
        if (c.type !== "ohmmeter") continue;
        const kp = `${c.id}#0`;
        const km = `${c.id}#1`;
        if ((terminalWireCount.get(kp) || 0) === 0 || (terminalWireCount.get(km) || 0) === 0) {
            warnings.push(`Ohmmètre ${c.id} : au moins une borne n’est reliée à aucun fil.`);
        }
        const np = nodeFor(kp);
        const nm = nodeFor(km);
        if (np === nm) {
            warnings.push(`Ohmmètre ${c.id} : les deux bornes sont sur le même nœud (${np}).`);
            continue;
        }
        lines.push(`${spiceBranchName("IOHM", c.id)} ${np} ${nm} DC ${OHMMETER_TEST_CURRENT_A}`);
        ohmeters.push({
            id: c.id,
            nodePlus: np,
            nodeMinus: nm,
            testCurrent: OHMMETER_TEST_CURRENT_A,
        });
    }

    const oscilloscopes = [];
    for (const c of components) {
        if (!isOscilloscopeType(c.type)) continue;
        const kCh1 = `${c.id}#0`;
        const kCh2 = `${c.id}#1`;
        const kGnd = `${c.id}#2`;
        if (
            (terminalWireCount.get(kCh1) || 0) === 0 ||
            (terminalWireCount.get(kCh2) || 0) === 0 ||
            (terminalWireCount.get(kGnd) || 0) === 0
        ) {
            warnings.push(
                `Oscilloscope ${c.id} : reliez CH1, CH2 et la borne commune (masse) au circuit.`
            );
        }
        const nCh1 = nodeFor(kCh1);
        const nCh2 = nodeFor(kCh2);
        const nGnd = nodeFor(kGnd);
        if (nCh1 !== nGnd) {
            lines.push(`${spiceBranchName("RVM", `${c.id}_ch1`)} ${nCh1} ${nGnd} 1e12`);
        }
        if (nCh2 !== nGnd) {
            lines.push(`${spiceBranchName("RVM", `${c.id}_ch2`)} ${nCh2} ${nGnd} 1e12`);
        }
        oscilloscopes.push({
            id: c.id,
            ch1NodePlus: nCh1,
            ch1NodeMinus: nGnd,
            ch2NodePlus: nCh2,
            ch2NodeMinus: nGnd,
        });
    }

    for (const c of components) {
        if (!isOpampType(c.type)) continue;
        const kOut = `${c.id}#2`;
        const kPlus = `${c.id}#0`;
        const kMinus = `${c.id}#1`;
        if ((terminalWireCount.get(kOut) || 0) === 0) {
            warnings.push(
                `AOP ${c.id} : reliez la sortie à une charge (résistance vers la masse) ou à une boucle de rétroaction — indispensable en comparateur.`
            );
        }
        if ((terminalWireCount.get(kPlus) || 0) === 0 || (terminalWireCount.get(kMinus) || 0) === 0) {
            warnings.push(`AOP ${c.id} : les entrées + et − doivent être câblées.`);
        }
    }
    const hasOpamp = components.some(c => isOpampType(c.type));
    const acSources = components.filter(c => c.type === "vsin" || c.type === "vsquare" || c.type === "vpulse");
    const hasPulseSource = components.some(c => c.type === "vpulse");

    const voltmetersRms = [];
    for (const c of components) {
        if (!isVoltmeterRmsType(c.type)) continue;
        const kp = `${c.id}#0`;
        const km = `${c.id}#1`;
        const np = nodeFor(kp);
        const nm = nodeFor(km);
        if (np === nm) {
            warnings.push(
                `Voltmètre (eff.) ${c.id} : les deux bornes sont sur le même nœud (${np}). Vérifiez le câblage.`
            );
        }
        voltmetersRms.push({ id: c.id, nodePlus: np, nodeMinus: nm });
    }

    const ammetersRms = [];
    for (const c of components) {
        if (!isAmmeterRmsType(c.type)) continue;
        const np = nodeFor(`${c.id}#0`);
        const nm = nodeFor(`${c.id}#1`);
        ammetersRms.push({
            id: c.id,
            branch: spiceBranchName("VI", c.id),
            nodePlus: np,
            nodeMinus: nm,
        });
    }

    const hasLeds = components.some(c => isLedType(c.type));
    const hasLogicGates = components.some(
        c => isLogicGateComponentType(c.type) || isLogicDigitalSimType(c.type)
    );
    const useTran =
        hasPulseSource ||
        (acSources.length > 0 &&
            (oscilloscopes.length > 0 ||
                voltmetersRms.length > 0 ||
                ammetersRms.length > 0 ||
                hasLeds ||
                hasLogicGates));
    if (hasOpamp && acSources.length > 0 && oscilloscopes.length === 0) {
        warnings.push(
            "Comparateur / hystérésis dynamique : ajoutez un oscilloscope sur la sortie de l'AOP et un générateur sinus (ou carré) sur l'entrée pour voir les seuils en simulation transitoire."
        );
    }
    if (hasOpamp && acSources.length === 0 && oscilloscopes.length > 0) {
        warnings.push(
            "AOP en régime DC (.op) : seuils de comparateur visibles au voltmètre ; pour l'hystérésis en fonction du temps, excitez l'entrée avec un générateur sinus."
        );
    }
    if ((voltmetersRms.length > 0 || ammetersRms.length > 0) && !useTran) {
        warnings.push(
            "Voltmètre / ampèremètre efficace : ajoutez un générateur sinus ou carré (et un oscilloscope si besoin de .tran) pour activer l’analyse transitoire et la valeur efficace."
        );
    }
    const scopesTranMeta = [];
    const ledsTranMeta = [];
    const logicGatesTranMeta = [];
    const metersTranMeta = { voltmetersRms: [], ammetersRms: [] };
    let analysisTran = false;

    lines.push("");

    const voltmeters = [];
    for (const c of components) {
        if (c.type !== "voltmeter") continue;
        const kp = `${c.id}#0`;
        const km = `${c.id}#1`;
        const np = nodeFor(kp);
        const nm = nodeFor(km);
        if (np === nm) {
            warnings.push(
                `Voltmètre ${c.id} : les deux bornes sont sur le même nœud (${np}). Vérifiez le câblage des deux fils.`
            );
        }
        voltmeters.push({
            id: c.id,
            nodePlus: np,
            nodeMinus: nm,
        });
    }

    const ammeters = [];
    for (const c of components) {
        if (c.type !== "ammeter") continue;
        const np = nodeFor(`${c.id}#0`);
        const nm = nodeFor(`${c.id}#1`);
        const branch = spiceBranchName("VI", c.id);
        ammeters.push({
            id: c.id,
            branch,
            nodePlus: np,
            nodeMinus: nm,
        });
    }

    if (useTran) {
        const { tstepStr, tstopStr } = computeTranTiming(components);
        analysisTran = true;
        if (lines[0]) lines[0] = "* Circuit Designer - netlist SPICE (.tran)";
        if (components.some(c => isLogicSequentialType(c.type))) {
            lines.push(".options method=gear reltol=1e-3 abstol=1e-9 gmin=1e-15 trtol=50");
        }
        lines.push(`.tran ${tstepStr} ${tstopStr}`);
        lines.push(".control");
        if (components.some(c => isLogicSequentialType(c.type))) {
            lines.push("set method=gear");
        }
        lines.push("set wr_singlescale");
        lines.push(`tran ${tstepStr} ${tstopStr}`);

        const wrVars = ["time"];
        const nodeCol = new Map();
        const currentCol = new Map();
        function isSpiceGndNode(nodeName) {
            return String(nodeName || "").trim() === "0";
        }
        function addWrNode(nodeName) {
            const n = String(nodeName || "").trim();
            // ngspice n’expose pas v(0) — la masse vaut 0 V par définition.
            if (!n || isSpiceGndNode(n) || nodeCol.has(n)) return;
            nodeCol.set(n, wrVars.length);
            wrVars.push(`v(${n})`);
        }
        function addWrCurrent(branchName) {
            const b = String(branchName || "").trim();
            if (!b || currentCol.has(b)) return;
            currentCol.set(b, wrVars.length);
            wrVars.push(`i(${b})`);
        }
        function channelWrMeta(plusNode, minusNode) {
            const plusWrIndex = nodeCol.get(plusNode);
            const minusIsGnd = isSpiceGndNode(minusNode);
            const minusWrIndex = minusIsGnd ? null : nodeCol.get(minusNode);
            return {
                plusNode,
                minusNode,
                wrIndex: plusWrIndex,
                minusWrIndex,
                minusIsGnd,
            };
        }
        for (const osc of oscilloscopes) {
            addWrNode(osc.ch1NodePlus);
            addWrNode(osc.ch1NodeMinus);
            addWrNode(osc.ch2NodePlus);
            addWrNode(osc.ch2NodeMinus);
            scopesTranMeta.push({
                id: osc.id,
                timeCol: 0,
                wrVarCount: wrVars.length,
                ch1: channelWrMeta(osc.ch1NodePlus, osc.ch1NodeMinus),
                ch2: channelWrMeta(osc.ch2NodePlus, osc.ch2NodeMinus),
            });
        }
        for (const vm of voltmetersRms) {
            addWrNode(vm.nodePlus);
            addWrNode(vm.nodeMinus);
            const ch = channelWrMeta(vm.nodePlus, vm.nodeMinus);
            metersTranMeta.voltmetersRms.push({
                id: vm.id,
                timeCol: 0,
                wrVarCount: wrVars.length,
                nodePlus: vm.nodePlus,
                nodeMinus: vm.nodeMinus,
                channel: ch,
            });
        }
        for (const am of ammetersRms) {
            addWrCurrent(am.branch);
            metersTranMeta.ammetersRms.push({
                id: am.id,
                timeCol: 0,
                wrVarCount: wrVars.length,
                branch: am.branch,
                currentWrIndex: currentCol.get(am.branch),
            });
        }
        for (const c of components) {
            if (!isLogicGateComponentType(c.type) && !isLogicDigitalSimType(c.type)) continue;
            let outKeys = [];
            if (isLogicGateComponentType(c.type)) outKeys = [logicGateOutputNodeKey(c)];
            else if (c.type === "logic_dff") {
                outKeys = logicDffDAndQbarShareNode(c, nodeFor)
                    ? [logicDffOutputNodeKey(c)]
                    : logicDffOutputNodeKeys(c);
            } else if (c.type === "logic_jk") outKeys = logicJkOutputNodeKeys(c);
            else if (isIc74ls00Type(c.type)) {
                outKeys = ic74ls00NandGates().map(g => `${c.id}#${g.y}`);
            } else if (isIc74ls74Type(c.type)) {
                outKeys = ic74ls74DffSlices().map(sl => `${c.id}#${sl.q}`);
            }
            let vhiTran = 5;
            if (isLogicGateComponentType(c.type)) {
                vhiTran = resolveLogicGateVhi(c, logicVhiByTerminal);
            } else if (c.type === "logic_dff") {
                vhiTran = resolveSequentialVhi(
                    c,
                    logicVhiByTerminal,
                    parseLogicRail,
                    logicVhi,
                    logicDffInputNodeKeys(c)
                );
            } else if (c.type === "logic_jk") {
                vhiTran = resolveSequentialVhi(
                    c,
                    logicVhiByTerminal,
                    parseLogicRail,
                    logicVhi,
                    logicJkInputNodeKeys(c)
                );
            } else if (isIc74ls00Type(c.type)) {
                vhiTran = resolveIc74ls00Vhi(c, logicVhiByTerminal, parseLogicRail, logicVhi);
            } else if (isIc74ls74Type(c.type)) {
                vhiTran = resolveIc74ls74Vhi(c, logicVhiByTerminal, parseLogicRail, logicVhi);
            }
            for (const outKey of outKeys) {
                const nOut = nodeFor(outKey);
                addWrNode(nOut);
                let icOutId = c.id;
                if (isIc74ls00Type(c.type)) {
                    icOutId = `${c.id}_Y${outKeys.indexOf(outKey) + 1}`;
                } else if (isIc74ls74Type(c.type)) {
                    icOutId = `${c.id}_Q${outKeys.indexOf(outKey) + 1}`;
                } else if (c.type === "logic_dff") {
                    icOutId =
                        outKey === logicDffOutputNodeKey(c) ? `${c.id}_Q` : `${c.id}_Qbar`;
                } else if (c.type === "logic_jk") {
                    icOutId =
                        outKey === logicJkOutputNodeKey(c) ? `${c.id}_Q` : `${c.id}_Qbar`;
                }
                logicGatesTranMeta.push({
                    id: icOutId,
                    timeCol: 0,
                    wrVarCount: wrVars.length,
                    nodeOut: nOut,
                    wrIndex: nodeCol.get(nOut),
                    vhi: vhiTran,
                    vth: vhiTran / 2,
                });
            }
            if (isLogicGateComponentType(c.type)) {
                for (const k of logicGateInputNodeKeys(c)) addWrNode(nodeFor(k));
            } else if (c.type === "logic_dff") {
                for (const k of logicDffInputNodeKeys(c)) addWrNode(nodeFor(k));
            } else if (c.type === "logic_jk") {
                for (const k of logicJkInputNodeKeys(c)) addWrNode(nodeFor(k));
            }
        }
        for (const c of components) {
            if (!isLedType(c.type)) continue;
            const branch = spiceBranchName("VIL", c.id);
            addWrCurrent(branch);
            ledsTranMeta.push({
                id: c.id,
                timeCol: 0,
                branch,
                currentWrIndex: currentCol.get(branch),
                nodePlus: nodeFor(`${c.id}#0`),
                nodeMinus: nodeFor(`${c.id}#1`),
            });
        }
        const finalWrVarCount = wrVars.length;
        for (const m of ledsTranMeta) {
            m.wrVarCount = finalWrVarCount;
            if (m.branch) m.currentWrIndex = currentCol.get(m.branch);
        }
        for (const m of logicGatesTranMeta) {
            m.wrVarCount = finalWrVarCount;
            if (m.nodeOut) m.wrIndex = nodeCol.get(m.nodeOut);
        }
        for (const m of scopesTranMeta) {
            const osc = oscilloscopes.find((o) => o.id === m.id);
            if (osc) {
                m.ch1 = channelWrMeta(osc.ch1NodePlus, osc.ch1NodeMinus);
                m.ch2 = channelWrMeta(osc.ch2NodePlus, osc.ch2NodeMinus);
            }
            m.wrVarCount = finalWrVarCount;
        }
        for (const vm of metersTranMeta.voltmetersRms) {
            const def = voltmetersRms.find((v) => v.id === vm.id);
            if (def) vm.channel = channelWrMeta(def.nodePlus, def.nodeMinus);
            vm.wrVarCount = finalWrVarCount;
        }
        for (const m of metersTranMeta.ammetersRms) {
            m.wrVarCount = finalWrVarCount;
            if (m.branch) m.currentWrIndex = currentCol.get(m.branch);
        }
        lines.push(`wrdata __TRAN_WAVE_PATH__ ${wrVars.join(" ")}`);
        if (oscilloscopes.length > 0) {
            warnings.push(
                `Oscilloscope : analyse transitoire (${tstopStr}) — les courbes s’ouvrent dans la fenêtre dédiée.`
            );
        } else if (hasLeds || hasLogicGates) {
            warnings.push(
                `Signal alternatif : analyse transitoire (${tstopStr}) pour l’animation des LED et le fonctionnement des portes logiques.`
            );
        }
        if (voltmetersRms.length > 0) {
            warnings.push(
                `Voltmètre(s) efficace : Vrms calculée sur ${tstopStr} (générateur alternatif requis).`
            );
        }
        if (ammetersRms.length > 0) {
            warnings.push(
                `Ampèremètre(s) efficace : Arms calculé sur ${tstopStr} (générateur alternatif requis).`
            );
        }
        if (voltmetersRms.length > 0 && acSources.length === 0) {
            warnings.push(
                "Voltmètre (eff.) : ajoutez un générateur sinus ou carré pour une mesure Vrms non nulle."
            );
        }
        if (ammetersRms.length > 0 && acSources.length === 0) {
            warnings.push(
                "Ampèremètre (eff.) : ajoutez un générateur sinus ou carré pour une mesure Arms non nulle."
            );
        }
    } else {
        lines[0] = "* Circuit Designer - netlist SPICE (.op)";
        lines.push(".op");
        lines.push(".control");
        lines.push("op");

        for (const c of components) {
            if (c.type !== "voltmeter") continue;
            const np = nodeFor(`${c.id}#0`);
            const nm = nodeFor(`${c.id}#1`);
            lines.push(`echo @@VM:${c.id}@@`);
            if (np !== "0") lines.push(`print v(${np})`);
            if (nm !== "0") lines.push(`print v(${nm})`);
        }
        for (const c of components) {
            if (c.type !== "ammeter") continue;
            const branch = spiceBranchName("VI", c.id);
            lines.push(`echo @@AM:${c.id}@@`);
            lines.push(`print i(${branch})`);
        }
        for (const c of components) {
            if (!isLedType(c.type)) continue;
            const branch = spiceBranchName("VIL", c.id);
            const np = nodeFor(`${c.id}#0`);
            const nm = nodeFor(`${c.id}#1`);
            lines.push(`echo @@LD:${c.id}@@`);
            lines.push(`print i(${branch})`);
            if (np !== "0") lines.push(`print v(${np})`);
            if (nm !== "0") lines.push(`print v(${nm})`);
        }
        for (const c of components) {
            if (!isLogicGateComponentType(c.type)) continue;
            const nOut = nodeFor(logicGateOutputNodeKey(c));
            lines.push(`echo @@LG:${c.id}@@`);
            if (nOut !== "0") lines.push(`print v(${nOut})`);
            for (const k of logicGateInputNodeKeys(c)) {
                const n = nodeFor(k);
                if (n !== "0") lines.push(`print v(${n})`);
            }
        }
        for (const om of ohmeters) {
            lines.push(`echo @@OH:${om.id}@@`);
            if (om.nodePlus !== "0") lines.push(`print v(${om.nodePlus})`);
            if (om.nodeMinus !== "0") lines.push(`print v(${om.nodeMinus})`);
        }
        for (const osc of oscilloscopes) {
            lines.push(`echo @@SC:${osc.id}:CH1@@`);
            if (osc.ch1NodePlus !== "0") lines.push(`print v(${osc.ch1NodePlus})`);
            if (osc.ch1NodeMinus !== "0") lines.push(`print v(${osc.ch1NodeMinus})`);
            lines.push(`echo @@SC:${osc.id}:CH2@@`);
            if (osc.ch2NodePlus !== "0") lines.push(`print v(${osc.ch2NodePlus})`);
            if (osc.ch2NodeMinus !== "0") lines.push(`print v(${osc.ch2NodeMinus})`);
        }
        for (const c of components) {
            if (c.type !== "seg7") continue;
            const nodes = new Set();
            for (let i = 0; i < 7; i++) {
                const n = nodeFor(`${c.id}#${i}`);
                if (n !== "0") nodes.add(n);
            }
            const nCom = nodeFor(`${c.id}#7`);
            if (nCom !== "0") nodes.add(nCom);
            lines.push(`echo @@S7:${c.id}@@`);
            for (const n of nodes) lines.push(`print v(${n})`);
        }
        if (oscilloscopes.length > 0 && acSources.length === 0) {
            warnings.push(
                "Oscilloscope avec source DC : valeurs affichées au point de repos (.op). Pour voir des signaux alternatifs, utilisez un générateur sinus ou carré."
            );
        }
    }

    lines.push(".endc");
    lines.push(".end");

    for (const c of components) {
        if (isLogicGateComponentType(c.type)) {
            const labels = {
                logic_not: "Inverseur",
                logic_and: "ET",
                logic_or: "OU",
                logic_nand: "NON-ET",
                logic_nor: "NON-OU",
                logic_xor: "OU exclusif",
                logic_xnor: "NON-OU exclusif",
            };
            const label = labels[c.type] || c.type;
            const kp = logicGateInputNodeKeys(c);
            const unwired = kp.filter(k => (terminalWireCount.get(k) || 0) === 0);
            if (unwired.length > 0) {
                warnings.push(`${label} ${c.id} : borne(s) non reliée(s) au circuit.`);
            }
        }
        if (c.type === "logic_dff") {
            const kp = logicDffInputNodeKeys(c);
            const unwired = kp.filter(k => (terminalWireCount.get(k) || 0) === 0);
            if (unwired.length > 0) {
                warnings.push(`Bascule D ${c.id} : borne(s) non reliée(s) au circuit.`);
            }
            if (logicDffDAndQbarShareNode(c, nodeFor)) {
                warnings.push(
                    useLogicDffXspice(deckOpts)
                        ? `Bascule D ${c.id} : D et /Q sur le même fil — diviseur par 2 (XSPICE : entrée D = sortie /Q numérique).`
                        : `Bascule D ${c.id} : D et /Q sur le même fil — en simulation, à chaque front d’horloge on prend D = complément de Q.`
                );
            }
        }
        if (c.type === "logic_jk") {
            const kp = logicJkInputNodeKeys(c);
            const unwired = kp.filter(k => (terminalWireCount.get(k) || 0) === 0);
            if (unwired.length > 0) {
                warnings.push(`Bascule JK ${c.id} : borne(s) non reliée(s) au circuit.`);
            }
        }
        if (isIc74ls00Type(c.type)) {
            const vccKey = `${c.id}#${ic74ls00VccPinIndex()}`;
            const gndKey = `${c.id}#6`;
            if ((terminalWireCount.get(vccKey) || 0) === 0) {
                warnings.push(`74HC00 ${c.id} : reliez VCC (broche 14) au rail d’alimentation.`);
            }
            if ((terminalWireCount.get(gndKey) || 0) === 0) {
                warnings.push(`74HC00 ${c.id} : reliez GND (broche 7) à la masse.`);
            }
        }
        if (isIc74ls74Type(c.type)) {
            const vccKey = `${c.id}#${ic74ls74VccPinIndex()}`;
            const gndKey = `${c.id}#6`;
            if ((terminalWireCount.get(vccKey) || 0) === 0) {
                warnings.push(`74LS74 ${c.id} : reliez VCC (broche 14) au rail d’alimentation.`);
            }
            if ((terminalWireCount.get(gndKey) || 0) === 0) {
                warnings.push(`74LS74 ${c.id} : reliez GND (broche 7) à la masse.`);
            }
        }
        if (c.type === "lamp" || c.type === "lcd") {
            const labels = { lamp: "Lampe", lcd: "LCD" };
            warnings.push(`${labels[c.type] || c.type} ${c.id} : non simulé pour l'instant.`);
        }
        if (c.type === "seg7") {
            const comKey = `${c.id}#7`;
            if ((terminalWireCount.get(comKey) || 0) === 0) {
                warnings.push(
                    `7 Segments ${c.id} : reliez la cathode commune (broche C, bas) à la masse.`
                );
            }
        }
    }

    const logicGates = [];
    for (const c of components) {
        if (isLogicGateComponentType(c.type)) {
            const outKey = logicGateOutputNodeKey(c);
            const vhi = resolveLogicGateVhi(c, logicVhiByTerminal);
            logicGates.push({
                id: c.id,
                type: c.type,
                nodeOut: nodeFor(outKey),
                inputs: logicGateInputNodeKeys(c).map(k => nodeFor(k)),
                vhi,
                vth: vhi / 2,
            });
        } else if (c.type === "logic_dff") {
            const vhi = resolveSequentialVhi(
                c,
                logicVhiByTerminal,
                parseLogicRail,
                logicVhi,
                logicDffInputNodeKeys(c)
            );
            const inputs = logicDffInputNodeKeys(c).map(k => nodeFor(k));
            logicGates.push({
                id: `${c.id}/Q`,
                type: c.type,
                nodeOut: nodeFor(logicDffOutputNodeKey(c)),
                inputs,
                vhi,
                vth: vhi / 2,
            });
            logicGates.push({
                id: `${c.id}/Qbar`,
                type: c.type,
                nodeOut: nodeFor(logicDffQbarOutputNodeKey(c)),
                inputs,
                vhi,
                vth: vhi / 2,
            });
        } else if (c.type === "logic_jk") {
            const vhi = resolveSequentialVhi(
                c,
                logicVhiByTerminal,
                parseLogicRail,
                logicVhi,
                logicJkInputNodeKeys(c)
            );
            const inputs = logicJkInputNodeKeys(c).map(k => nodeFor(k));
            logicGates.push({
                id: `${c.id}/Q`,
                type: c.type,
                nodeOut: nodeFor(logicJkOutputNodeKey(c)),
                inputs,
                vhi,
                vth: vhi / 2,
            });
            logicGates.push({
                id: `${c.id}/Qbar`,
                type: c.type,
                nodeOut: nodeFor(logicJkQbarOutputNodeKey(c)),
                inputs,
                vhi,
                vth: vhi / 2,
            });
        } else if (isIc74ls00Type(c.type)) {
            const vhi = resolveIc74ls00Vhi(c, logicVhiByTerminal, parseLogicRail, logicVhi);
            ic74ls00NandGates().forEach((g, i) => {
                logicGates.push({
                    id: `${c.id}/Y${i + 1}`,
                    type: c.type,
                    nodeOut: nodeFor(`${c.id}#${g.y}`),
                    inputs: [nodeFor(`${c.id}#${g.a}`), nodeFor(`${c.id}#${g.b}`)],
                    vhi,
                    vth: vhi / 2,
                });
            });
        } else if (isIc74ls74Type(c.type)) {
            const vhi = resolveIc74ls74Vhi(c, logicVhiByTerminal, parseLogicRail, logicVhi);
            ic74ls74DffSlices().forEach((sl) => {
                logicGates.push({
                    id: `${c.id}/Q${sl.suffix}`,
                    type: c.type,
                    nodeOut: nodeFor(`${c.id}#${sl.q}`),
                    inputs: [nodeFor(`${c.id}#${sl.d}`), nodeFor(`${c.id}#${sl.clk}`)],
                    vhi,
                    vth: vhi / 2,
                });
            });
        }
    }

    return {
        ok: true,
        netlist: lines.join("\n"),
        warnings,
        voltmeters,
        ammeters,
        leds: components
            .filter(c => isLedType(c.type))
            .map(c => ({
                id: c.id,
                branch: spiceBranchName("VIL", c.id),
                nodePlus: nodeFor(`${c.id}#0`),
                nodeMinus: nodeFor(`${c.id}#1`),
            })),
        voltmetersRms,
        ammetersRms,
        ohmeters,
        oscilloscopes,
        nodeMeasures: [],
        scopesTranMeta,
        ledsTranMeta,
        logicGates,
        logicGatesTranMeta,
        metersTranMeta,
        analysisTran,
        seg7Displays: components
            .filter(c => c.type === "seg7")
            .map(c => ({
                id: c.id,
                segmentNodes: [0, 1, 2, 3, 4, 5, 6].map(i => nodeFor(`${c.id}#${i}`)),
                commonNode: nodeFor(`${c.id}#7`),
            })),
    };
}
