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
    appendLogicCd4511Netlist,
    appendLogicDffNetlist,
    appendLogicJkNetlist,
    cd4511InputNodeKeys,
    cd4511OutputNodeKeys,
    getRippleClockFromPrev,
    logicSequentialInternalNodeKeys,
    ic74ls00NandGates,
    ic74ls00VccPinIndex,
    ic74ls74DffSlices,
    ic74ls74VccPinIndex,
    isIc74hc90Type,
    isIc74ls00Type,
    isIc74ls74Type,
    isLogicCd4511Type,
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
    resolveLogicCd4511Vhi,
    resolveSequentialVhi,
    useLogicCd4511Xspice,
    useLogicDffXspice,
    useLogicJkXspice,
    xspiceCodemodelLines,
    isXspiceDffAvailable,
} from "./logic-sequential.mjs";
import {
    appendIc74hc90Netlist,
    IC90_PIN,
    ic74hc90GndPinIndex,
    ic74hc90InternalNodeKeys,
    ic74hc90OutputNodeKeys,
    ic74hc90ToggleSlices,
    ic74hc90VccPinIndex,
    resolveIc74hc90Vhi,
} from "./logic-74hc90.mjs";
import {
    appendArduinoUnoNetlist,
    arduinoUnoDigitalPinIndices,
    arduinoUnoDigitalPinName,
    arduinoUnoTerminalKeys,
    isArduinoUnoType,
} from "./arduino-uno.mjs";
import {
    arduinoUnoMinPulsePeriodSec,
    applyArduinoSketchToComponent,
    arduinoGpioIsTimeVarying,
} from "./arduino-sketch-parse.mjs";
import { annotateUnoI2cBusEngine, i2cBusMinPeriodSec } from "./i2c-bus-ideal.mjs";
import {
    detectHc90Mod60FromGraphicalState,
    detectHc90MrAndQ1Q3OnSameChip,
} from "./hc90-cascade.mjs";

function isLedType(t) {
    return t === "led" || t === "diode_led";
}

/** Nœud SPICE relié à une masse ou une source « 0 » (borne logique, VCC à 0 V, etc.). */
function isNodeLikelyLogicLow(nodeName, components, nodeFor) {
    if (!nodeName || nodeName === "0") return true;
    for (const g of components) {
        if (g.type === "ground" && nodeFor(`${g.id}#0`) === nodeName) return true;
    }
    for (const g of components) {
        if ((g.type === "vsin" || g.type === "vsquare") && nodeFor(`${g.id}#0`) === nodeName) {
            return true;
        }
    }
    for (const g of components) {
        const key = `${g.id}#0`;
        if (nodeFor(key) !== nodeName) continue;
        if (g.type === "logic_state" && parseLogicStateVolts(g.value, g.logicRail) < 0.5) return true;
        if (g.type === "logic_terminal" && Number(g.state) === 0) return true;
        if (g.type === "vterm" && parseDcVolts(g.value) < 0.5) return true;
    }
    return false;
}

/** Nœud relié à +5 V (VCC, borne à 1, etc.). */
function isNodeLikelyLogicHigh(nodeName, components, nodeFor) {
    if (!nodeName) return false;
    for (const g of components) {
        const key = `${g.id}#0`;
        if (nodeFor(key) !== nodeName) continue;
        if (g.type === "logic_state" && parseLogicStateVolts(g.value, g.logicRail) > 2.5) return true;
        if (g.type === "logic_terminal" && Number(g.state) === 1) return true;
        if (g.type === "vterm" && parseDcVolts(g.value) > 2.5) return true;
    }
    return false;
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
        t === "ohmmeter" ||
        t === "bode_analyzer" ||
        t === "speaker" ||
        t === "push_button"
    );
}

function isBodeAnalyzerType(t) {
    return t === "bode_analyzer";
}

function isSpeakerType(t) {
    return t === "speaker";
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
    return t === "npn" || t === "opamp" || t === "potentiometer" || t === "switch_spdt";
}

function isSeg7Type(t) {
    return t === "seg7";
}

function isBargraphDc10hType(t) {
    return t === "bargraph_dc10h";
}

function isGroveLcdType(t) {
    return t === "grove_lcd16x2";
}

function isGroveDht22Type(t) {
    return t === "grove_dht22";
}

function seg7TerminalKeys(c) {
    const keys = [];
    for (let i = 0; i < 8; i++) keys.push(`${c.id}#${i}`);
    return keys;
}

function bargraphTerminalKeys(c) {
    const keys = [];
    for (let i = 0; i < 11; i++) keys.push(`${c.id}#${i}`);
    return keys;
}

/** Bornes SPICE à enregistrer pour le câblage (union-find). */
function terminalKeysForComponent(c) {
    if (!c || !c.id) return [];
    if (isSeg7Type(c.type)) return seg7TerminalKeys(c);
    if (isBargraphDc10hType(c.type)) return bargraphTerminalKeys(c);
    if (isGroveLcdType(c.type)) return [`${c.id}#0`, `${c.id}#1`, `${c.id}#2`, `${c.id}#3`];
    if (isGroveDht22Type(c.type)) return [`${c.id}#0`, `${c.id}#1`, `${c.id}#2`, `${c.id}#3`];
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
    if (isArduinoUnoType(c.type)) return arduinoUnoTerminalKeys(c);
    if (isSingleTerminalRefType(c.type)) return [`${c.id}#0`];
    if (isTwoTerminalType(c.type) || isSignalGeneratorType(c.type)) {
        return [`${c.id}#0`, `${c.id}#1`];
    }
    return [];
}

/** Fréquence de résonance d’un circuit LC parallèle (bobine + condensateur). */
function estimateParallelLcResonantHz(components) {
    let cFarad = 0;
    let lHenry = 0;
    for (const c of components) {
        if (c.type === "capacitor") cFarad = Math.max(cFarad, parseCapacitanceFarad(c.value));
        if (c.type === "inductor") lHenry = Math.max(lHenry, parseInductanceHenry(c.value));
    }
    if (cFarad <= 0 || lHenry <= 0) return 0;
    return 1 / (2 * Math.PI * Math.sqrt(lHenry * cFarad));
}

/** AOP + LC + oscilloscope, sans générateur externe : oscillateur autonome. */
function circuitHasAutonomousLcOscillator(components) {
    return (
        components.some((c) => c.type === "oscilloscope") &&
        components.some((c) => isOpampType(c.type)) &&
        components.some((c) => c.type === "inductor") &&
        components.some((c) => c.type === "capacitor")
    );
}

/** Comparateur / Schmitt (boucle + ou boucle ouverte) : bascule dure. Amplificateur (boucle −) : tanh raide. */
function opampUsesComparatorModel(c, parent, components) {
    const topo = new Map(parent);
    ufUnionPassiveInternals(topo, components);
    const outKey = `${c.id}#2`;
    const posKey = `${c.id}#0`;
    const negKey = `${c.id}#1`;
    const outRoot = ufFind(topo, outKey);
    const posRoot = ufFind(topo, posKey);
    const negRoot = ufFind(topo, negKey);
    const positiveFeedback = outRoot === posRoot;
    const negativeFeedback = outRoot === negRoot;
    if (
        positiveFeedback &&
        negativeFeedback &&
        components.some((x) => x.type === "inductor") &&
        components.some((x) => x.type === "capacitor")
    ) {
        return false;
    }
    return positiveFeedback || !negativeFeedback;
}

/** Source comportementale AOP : saturation aux rails (comparateur, hystérésis, amplif.). */
function formatOpampBsourceLine(c, nOut, nPlus, nMinus, { comparatorMode = false, gain = 1e5 } = {}) {
    const vp = parseOpampVp(c);
    const vn = parseOpampVn(c);
    const bname = spiceBranchName("BAOP", c.id);
    const diff = spiceVoltageDiffExpr(nPlus, nMinus);
    if (comparatorMode) {
        return `${bname} ${nOut} 0 V={${vn}+(${vp}-${vn})*u(${diff})}`;
    }
    const vmid = (vp + vn) / 2;
    const vhalf = (vp - vn) / 2;
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

/** Met à 0 les sources indépendantes pour mesure Ω (comme un multimètre). */
function zeroIndependentSourceLine(line) {
    const t = String(line || "").trim();
    if (/^IOHM_/i.test(t)) return line;
    if (/^VI_/i.test(t)) return line;
    if (/^V[^\s]+\s+.+\s+DC\s+/i.test(t)) {
        return line.replace(/(\sDC\s+)[^\s]+/i, "$10");
    }
    if (/^V[^\s]+\s+.+\s+(SIN|PULSE)\(/i.test(t)) {
        return line.replace(/\s+(SIN|PULSE)\([^)]*\)/i, " DC 0");
    }
    return line;
}

/**
 * Netlist .op avec sources coupées — mesure de résistance entre les bornes de l'ohmmètre.
 * @param {string} fullNetlist
 * @param {{ id: string; nodePlus: string; nodeMinus: string }[]} ohmeters
 */
export function buildOhmmeterIsolationNetlist(fullNetlist, ohmeters) {
    if (!fullNetlist || !Array.isArray(ohmeters) || ohmeters.length === 0) return "";
    const out = [];
    let skipControl = false;
    for (const raw of fullNetlist.split(/\r?\n/)) {
        const t = raw.trim();
        if (/^\.(tran|op)\b/i.test(t)) continue;
        if (t === ".control") {
            skipControl = true;
            continue;
        }
        if (t === ".endc") {
            skipControl = false;
            continue;
        }
        if (skipControl) continue;
        if (t.startsWith("wrdata")) continue;
        if (t === ".end") continue;
        if (/^\.options\b/i.test(t)) continue;
        out.push(zeroIndependentSourceLine(raw));
    }
    out.push(".op");
    out.push(".control");
    out.push("op");
    for (const om of ohmeters) {
        out.push(`echo @@OH:${om.id}@@`);
        if (om.nodePlus !== "0") out.push(`print v(${om.nodePlus})`);
        if (om.nodeMinus !== "0") out.push(`print v(${om.nodeMinus})`);
    }
    out.push("quit");
    out.push(".endc");
    out.push(".end");
    return out.join("\n");
}

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

/**
 * Détecte un AND de reset mod-10 sur deux sorties Q de bascules D (indices DFF1…DFF4).
 * @returns {{ a: number, b: number } | null}
 */
function getRippleMod10ResetAndIndices(components, parent) {
    const dffs = components.filter((c) => c.type === "logic_dff");
    const ands = components.filter((c) => c.type === "logic_and" || c.type === "and");
    if (dffs.length < 4 || ands.length === 0) return null;

    const dffIndex = (c) => {
        const m = /(\d+)$/.exec(String(c.id || ""));
        return m ? parseInt(m[1], 10) : null;
    };
    const sameNet = (a, b) => ufFind(parent, a) === ufFind(parent, b);

    for (const and of ands) {
        const outKey = `${and.id}#2`;
        if (!parent.has(outKey)) continue;
        if (!dffs.some((d) => sameNet(outKey, `${d.id}#5`))) continue;

        const inputIdx = [];
        for (const inKey of [`${and.id}#0`, `${and.id}#1`]) {
            if (!parent.has(inKey)) continue;
            for (const d of dffs) {
                const qKey = `${d.id}#2`;
                if (parent.has(qKey) && sameNet(inKey, qKey)) {
                    const idx = dffIndex(d);
                    if (idx != null && !inputIdx.includes(idx)) inputIdx.push(idx);
                }
            }
        }
        if (inputIdx.length !== 2) continue;
        inputIdx.sort((a, b) => a - b);
        return { a: inputIdx[0], b: inputIdx[1] };
    }
    return null;
}

/**
 * AND de reset mal câblé sur compteur ripple 4 bits (symptôme typique : 4…9 au lieu de 0…9).
 * @returns {string|null}
 */
function detectRippleMod10ResetAndWarning(components, parent) {
    const pair = getRippleMod10ResetAndIndices(components, parent);
    if (!pair) return null;
    const { a, b } = pair;
    if (a === 2 && b === 4) return null;
    if (a === 1 && b === 4) {
        return (
            "Compteur ripple mod-10 : AND sur la Q de DFF1 et DFF4 — reset au 9 (1001) au lieu du 10 (1010), " +
            "comptage souvent bloqué entre 4 et 8. Corrigez : AND sur DFF2.Q et DFF4.Q (bits de poids 2 et 8)."
        );
    }
    if (a === 3 && b === 4) {
        return (
            "Compteur ripple mod-10 : AND sur DFF3.Q et DFF4.Q — reset au 12 (1100), pas une décade 0…9. " +
            "Corrigez : AND sur DFF2.Q et DFF4.Q pour détecter 1010."
        );
    }
    return (
        `Compteur ripple mod-10 : AND de reset sur DFF${a} et DFF${b} — pour le 10 décimal (1010), ` +
        "reliez AND à DFF2.Q et DFF4.Q seulement."
    );
}

/** Résistances / passifs : même nœud électrique aux deux bornes (pour détecter la rétroaction AOP). */
function ufUnionPassiveInternals(parent, components) {
    for (const c of components) {
        if (c.type === "resistor" || c.type === "capacitor" || c.type === "inductor") {
            ufUnion(parent, `${c.id}#0`, `${c.id}#1`);
        }
    }
}

function spiceVoltageExpr(nodeName) {
    const n = String(nodeName || "").trim();
    if (n === "0") return "0";
    return `V(${n})`;
}

function spiceVoltageDiffExpr(nPlus, nMinus) {
    const p = String(nPlus || "").trim();
    const m = String(nMinus || "").trim();
    if (m === "0") return spiceVoltageExpr(p);
    if (p === "0") return `-V(${m})`;
    return `V(${p})-V(${m})`;
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
    } else if (t.endsWith("u")) {
        mult = 1e-6;
        t = t.slice(0, -1);
    } else if (t.endsWith("pf")) {
        mult = 1e-12;
        t = t.slice(0, -2);
    } else if (t.endsWith("nf")) {
        mult = 1e-9;
        t = t.slice(0, -2);
    } else if (t.endsWith("mf")) {
        mult = 1e-3;
        t = t.slice(0, -2);
    } else if (t.endsWith("p")) {
        mult = 1e-12;
        t = t.slice(0, -1);
    } else if (t.endsWith("n")) {
        mult = 1e-9;
        t = t.slice(0, -1);
    } else if (t.endsWith("m")) {
        mult = 1e-3;
        t = t.slice(0, -1);
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
    } else if (t.endsWith("m")) {
        mult = 1e-3;
        t = t.slice(0, -1);
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

/** Extrait la fréquence (Hz) d’une chaîne du type « 5V 1kHz », « 5V 60s », « 5V 1/60Hz ». */
function parseFreqHz(s) {
    if (s == null) return 1000;
    const t = String(s).toLowerCase().replace(/\s/g, "").replace(",", ".");
    let m = /period[e]?=([\d.]+)s/.exec(t);
    if (m) {
        const p = parseFloat(m[1]);
        return Number.isFinite(p) && p > 0 ? 1 / p : 1000;
    }
    m = /([\d.]+)s(?:period|per)?$/.exec(t) || /([\d.]+)s(?!\/)/.exec(t);
    if (m) {
        const p = parseFloat(m[1]);
        return Number.isFinite(p) && p > 0 ? 1 / p : 1000;
    }
    m = /1\/([\d.]+)\s*hz/.exec(t);
    if (m) {
        const p = parseFloat(m[1]);
        return Number.isFinite(p) && p > 0 ? 1 / p : 1000;
    }
    m = /([\d.]+)\s*khz/.exec(t);
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
            const vccIdx = isIc74ls74Type(c.type)
                ? ic74ls74VccPinIndex()
                : isIc74hc90Type(c.type)
                  ? ic74hc90VccPinIndex()
                  : ic74ls00VccPinIndex();
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

/** Aligné sur l’oscilloscope UI (8 div. horizontales, jusqu’à 100 ms/div). */
const TRAN_SCOPE_H_DIVS = 8;
const TRAN_MAX_TIME_DIV_SEC = 0.1;
const TRAN_SAMPLES_PER_PERIOD = 200;
const TRAN_MAX_POINTS = 50000;
/** Au-delà de cette période (f ≤ 1 Hz), .tran court + animation temps réel côté client. */
const SLOW_CLOCK_PERIOD_SEC = 1;
/** Un seul HC90 : 2 cycles décade (0…9 × 2). */
const SLOW_CLOCK_TRAN_PERIODS = 20;
/** Compteur ripple mod-10 : 2 décades complètes (0…9 × 2) + marge reset. */
const RIPPLE_MOD10_TRAN_PERIODS = 22;
/** Deux HC90 en cascade : cycle complet 0…99 (100 impulsions) ou 0…59 (60) si reset mod-60. */
const SLOW_CLOCK_TWO_DIGIT_PERIODS = 100;
const SLOW_CLOCK_MOD60_PERIODS = 60;
const SLOW_CLOCK_MAX_TSTOP_SEC = 120;

/** Pas et durée de simulation transitoire selon les générateurs AC et la base de temps du scope. */
function computeTranTiming(components, deckOpts = {}) {
    let minPeriod = Infinity;
    for (const c of components) {
        if (c.type !== "vsin" && c.type !== "vsquare" && c.type !== "vpulse") continue;
        const f = parseFreqHz(c.value);
        if (f > 0) minPeriod = Math.min(minPeriod, 1 / f);
    }
    const arduinoPeriod = arduinoUnoMinPulsePeriodSec(components);
    if (arduinoPeriod > 0) minPeriod = Math.min(minPeriod, arduinoPeriod);
    const i2cPeriod = i2cBusMinPeriodSec(components);
    if (i2cPeriod > 0) minPeriod = Math.min(minPeriod, i2cPeriod);
    if (!Number.isFinite(minPeriod) || minPeriod <= 0) minPeriod = 1;

    const lcHz = estimateParallelLcResonantHz(components);
    const hasAcGenerator = components.some(
        (c) => c.type === "vsin" || c.type === "vsquare" || c.type === "vpulse"
    );
    const opampOscillator = lcHz > 0 && !hasAcGenerator && components.some((c) => isOpampType(c.type));

    if (opampOscillator) {
        minPeriod = 1 / lcHz;
    }

    let scopeWindowSec = 0;
    for (const c of components) {
        if (c.type === "oscilloscope" && Number(c.timeDivSec) > 0) {
            scopeWindowSec = Math.max(scopeWindowSec, c.timeDivSec * TRAN_SCOPE_H_DIVS);
        }
    }
    if (scopeWindowSec <= 0) scopeWindowSec = TRAN_SCOPE_H_DIVS * 0.001;

    let tstep = minPeriod / TRAN_SAMPLES_PER_PERIOD;
    const hasScope = components.some((c) => c.type === "oscilloscope");
    const hasSpeaker = components.some((c) => isSpeakerType(c.type));
    let tstop = hasScope
        ? Math.max(scopeWindowSec, minPeriod * 2)
        : Math.max(minPeriod * 8, scopeWindowSec);
    if (hasSpeaker) {
        tstop = Math.max(tstop, minPeriod * 20, 0.25);
        // Durée = nombre entier de périodes du générateur → boucle audio sans « toc ».
        if (minPeriod > 0 && Number.isFinite(minPeriod)) {
            const periods = Math.max(20, Math.ceil(tstop / minPeriod));
            tstop = periods * minPeriod;
        }
    }

    const numFf =
        components.filter((c) => c.type === "logic_dff" || c.type === "logic_jk").length +
        components.filter((c) => isIc74hc90Type(c.type)).length * 4;
    const hc90Count = components.filter((c) => isIc74hc90Type(c.type)).length;
    const hc90Mod60 = deckOpts.hc90Mod60 === true;
    const twoDigitPeriods = hc90Mod60 ? SLOW_CLOCK_MOD60_PERIODS : SLOW_CLOCK_TWO_DIGIT_PERIODS;
    if (numFf > 0) {
        const ripplePeriods = (1 << numFf) + 2;
        tstop = Math.max(tstop, minPeriod * ripplePeriods);
    }
    const slowClock = minPeriod >= SLOW_CLOCK_PERIOD_SEC;
    if (hc90Count > 0) {
        if (slowClock) {
            const slowPeriods =
                hc90Count >= 2 ? twoDigitPeriods : SLOW_CLOCK_TRAN_PERIODS;
            tstop = Math.min(
                SLOW_CLOCK_MAX_TSTOP_SEC,
                Math.max(minPeriod * slowPeriods, minPeriod * 8)
            );
        } else {
            const minRipplePeriods = hc90Count >= 2 ? twoDigitPeriods : 24;
            tstop = Math.max(tstop, minPeriod * minRipplePeriods);
        }
    }

    if (tstop / tstep > TRAN_MAX_POINTS) {
        tstep = tstop / TRAN_MAX_POINTS;
        const minStep = minPeriod / 40;
        if (tstep > minStep) {
            tstep = minStep;
            if (tstop / tstep > TRAN_MAX_POINTS) {
                tstop = tstep * TRAN_MAX_POINTS;
            }
        }
    }
    if (hc90Count > 0 && !slowClock) {
        const hc90MinTstop = minPeriod * 12;
        if (tstop < hc90MinTstop) {
            tstop = hc90MinTstop;
            if (tstop / tstep > TRAN_MAX_POINTS) {
                tstep = tstop / TRAN_MAX_POINTS;
            }
        }
    }
    if (opampOscillator) {
        tstop = Math.max(tstop, minPeriod * 50);
        if (tstop / tstep > TRAN_MAX_POINTS) {
            tstep = tstop / TRAN_MAX_POINTS;
        }
    }
    if (deckOpts.rippleMod10) {
        tstop = Math.max(tstop, minPeriod * RIPPLE_MOD10_TRAN_PERIODS);
        if (tstop / tstep > TRAN_MAX_POINTS) {
            tstep = tstop / TRAN_MAX_POINTS;
        }
    }
    // quickTran (serveur Linux) : fenêtre .tran réduite pour limiter le temps ngspice.
    // Décade seule : au moins 10 impulsions (0…9) — 6 provoquait un comptage bloqué à 0…5 en réseau.
    // Deux chiffres + horloge lente : ne pas tronquer (sinon 1 Hz → 8 s → affichage ~07).
    if (deckOpts.quickTran && hc90Count > 0 && !(slowClock && hc90Count >= 2)) {
        const quickPeriods = hc90Count >= 2 ? 8 : 10;
        tstop = Math.min(tstop, minPeriod * quickPeriods);
        if (tstop / tstep > TRAN_MAX_POINTS) {
            tstep = tstop / TRAN_MAX_POINTS;
        }
    }
    if (deckOpts.quickTran && deckOpts.rippleMod10) {
        tstop = Math.max(tstop, minPeriod * RIPPLE_MOD10_TRAN_PERIODS);
        if (tstop / tstep > TRAN_MAX_POINTS) {
            tstep = tstop / TRAN_MAX_POINTS;
        }
    }
    const hasArduinoPulse = components.some(
        (c) =>
            isArduinoUnoType(c.type) &&
            ((c.pinPulses && Object.keys(c.pinPulses).length > 0) ||
                (Array.isArray(c.pinPhases) && c.pinPhases.length >= 2))
    );
    if (deckOpts.quickTran && hasArduinoPulse && minPeriod > 0) {
        const arduinoQuickPeriods = 12;
        tstop = Math.min(tstop, minPeriod * arduinoQuickPeriods);
        if (tstop / tstep > TRAN_MAX_POINTS) {
            tstep = tstop / TRAN_MAX_POINTS;
        }
    }
    return {
        tstep,
        tstop,
        tstepStr: formatSpiceTime(tstep),
        tstopStr: formatSpiceTime(tstop),
        clockPeriodSec: minPeriod,
        slowClock,
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
 * UNO + bargraph / LED / 7 segments : l'animation GPIO est gérée côté client ;
 * inutile de lancer un .tran ngspice (lent sur Render).
 */
function isArduinoIdealOnlyCircuit(components) {
    const arduinos = components.filter((c) => isArduinoUnoType(c.type));
    if (!arduinos.length) return false;
    if (!arduinos.some((c) => arduinoGpioIsTimeVarying(c))) return false;
    for (const c of components) {
        if (isArduinoUnoType(c.type)) continue;
        if (
            c.type === "bargraph_dc10h" ||
            c.type === "seg7" ||
            c.type === "led" ||
            c.type === "grove_lcd16x2" ||
            c.type === "grove_dht22" ||
            c.type === "ground" ||
            c.type === "gnd" ||
            c.type === "push_button" ||
            c.type === "switch_spdt" ||
            c.type === "voltmeter" ||
            c.type === "ammeter" ||
            c.type === "resistor" ||
            c.type === "capacitor" ||
            c.type === "inductor" ||
            c.type === "diode" ||
            c.type === "potentiometer"
        ) {
            continue;
        }
        return false;
    }
    return true;
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

    for (const c of components) {
        if (isArduinoUnoType(c.type)) {
            applyArduinoSketchToComponent(c);
            annotateUnoI2cBusEngine(c, components, wires);
        }
    }

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
            c.type === "oscilloscope" ||
            isBodeAnalyzerType(c.type) ||
            isSpeakerType(c.type)
    );

    const hasAutonomousLcOscillator = circuitHasAutonomousLcOscillator(components);
    const hasArduinoUno = components.some((c) => isArduinoUnoType(c.type));
    if (needsDcSupply && !powerSrc && !hasVtermPower && !hasAutonomousLcOscillator && !hasArduinoUno) {
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
    if (!powerSrc && !hasVtermPower && !hasArduinoUno && ohmeterComponents.length === 0 && groundComponents.length === 0) {
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
        if (powerSrc.type === "vsin" || powerSrc.type === "vsquare") {
            gndKey = `${powerSrc.id}#0`;
        } else {
            gndKey = `${powerSrc.id}#1`;
        }
    } else if (ohmeterComponents.length > 0) {
        gndKey = `${ohmeterComponents[0].id}#1`;
    } else {
        gndKey = "__spice_gnd__";
    }

    touch(gndKey);
    for (const g of groundComponents) {
        ufUnion(parent, `${g.id}#0`, gndKey);
    }
    if (
        powerSrc &&
        (powerSrc.type === "vsin" || powerSrc.type === "vsquare") &&
        groundComponents.length > 0
    ) {
        ufUnion(parent, `${powerSrc.id}#0`, gndKey);
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
            rippleClockFromPrev: getRippleClockFromPrev(c, wires, components),
        })) touch(k);
        if (isIc74hc90Type(c.type)) {
            for (const k of ic74hc90InternalNodeKeys(c, deckOpts)) touch(k);
        }
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

    const rippleMod10Pair = getRippleMod10ResetAndIndices(components, parent);
    if (rippleMod10Pair?.a === 2 && rippleMod10Pair?.b === 4) {
        deckOpts.rippleMod10 = true;
    }

    const bodeAnalyzerComponents = components.filter((c) => isBodeAnalyzerType(c.type));
    const hasBodeAnalyzer = bodeAnalyzerComponents.length > 0;
    const hasBlockingTranForBode =
        components.some((c) => c.type === "vpulse") ||
        components.some((c) => isLogicGateComponentType(c.type) || isLogicDigitalSimType(c.type)) ||
        hasAutonomousLcOscillator;
    const useAcForBode = hasBodeAnalyzer && !hasBlockingTranForBode;
    if (hasBodeAnalyzer && hasBlockingTranForBode) {
        warnings.push(
            "Analyse fréquentielle : incompatible avec les impulsions GImp, la logique numérique ou l’oscillateur LC autonome."
        );
    }
    if (useAcForBode && !components.some((c) => c.type === "vsin")) {
        return {
            ok: false,
            errors: [
                "Analyse fréquentielle : ajoutez un générateur sinus (Sin) comme source d’entrée du filtre.",
            ],
            warnings,
            netlist: "",
            voltmeters: [],
            ammeters: [],
            ohmeters: [],
            oscilloscopes: [],
            bodeAnalyzers: [],
            nodeMeasures: [],
            scopesTranMeta: [],
            bodeAcMeta: [],
            analysisTran: false,
            analysisAc: false,
        };
    }

    const hasLogicDff = components.some((c) => c.type === "logic_dff");
    const hasLogicJk = components.some((c) => c.type === "logic_jk");
    const hasLogicCd4511 = components.some((c) => isLogicCd4511Type(c.type));
    const usesXspiceFf =
        (hasLogicDff && useLogicDffXspice(deckOpts)) || (hasLogicJk && useLogicJkXspice(deckOpts));
    const usesXspiceCd4511 = hasLogicCd4511 && useLogicCd4511Xspice(deckOpts);
    const usesBsourceCd4511 = hasLogicCd4511 && !usesXspiceCd4511;
    const usesXspiceDigital = usesXspiceFf || usesXspiceCd4511;
    const lines = [];
    lines.push("* Circuit Designer - netlist SPICE (.op)");
    if (usesXspiceDigital) {
        for (const cmLine of xspiceCodemodelLines(deckOpts.repoRoot)) {
            lines.push(cmLine);
        }
        const xParts = [];
        if (hasLogicDff && useLogicDffXspice(deckOpts)) xParts.push("D (d_dff)");
        if (hasLogicJk && useLogicJkXspice(deckOpts)) xParts.push("JK (d_jkff)");
        if (usesXspiceCd4511) xParts.push("CD4511 (d_dlatch + d_genlut)");
        warnings.push(
            `${xParts.length ? xParts.join(", ") : "Circuits logiques"} : modèle XSPICE (digital.cm) — simulation mixte analogique/numérique.`
        );
    } else if (usesBsourceCd4511) {
        warnings.push(
            "CD4511 : modèle sources B (compatibilité ngspice Linux / serveur distant — pas de d_genlut)."
        );
    } else if (
        (hasLogicDff || hasLogicJk) &&
        isXspiceDffAvailable(deckOpts.repoRoot)
    ) {
        warnings.push(
            "Bascule(s) : digital.cm présent mais ngspice sans XSPICE — modèle sources B (voir Simulateur/lib/ngspice/README.txt)."
        );
    }

    const declaredDiodeModels = new Set();
    const declaredBjtModels = new Set();

    let oscillatorCapKickDone = false;
    let oscillatorTankNode = null;
    let i2cRepeatSec = 0.02;
    for (const c of components) {
        if (c.type === "oscilloscope" && Number(c.timeDivSec) > 0) {
            i2cRepeatSec = Math.max(i2cRepeatSec, c.timeDivSec * TRAN_SCOPE_H_DIVS);
        }
    }
    for (const c of components) {
        if (c.type === "resistor") {
            const n0 = nodeFor(`${c.id}#0`);
            const n1 = nodeFor(`${c.id}#1`);
            const ohms = parseResistanceOhm(c.value);
            lines.push(`${spiceBranchName("R", c.id)} ${n0} ${n1} ${ohms}`);
        } else if (c.type === "potentiometer") {
            const n0 = nodeFor(`${c.id}#0`);
            const n1 = nodeFor(`${c.id}#1`);
            const n2 = nodeFor(`${c.id}#2`);
            const total = Math.max(parseResistanceOhm(c.value), 1);
            const pos = Math.min(100, Math.max(0, Number(c.position) || 50)) / 100;
            const r1 = Math.max(1e-3, total * pos);
            const r2 = Math.max(1e-3, total * (1 - pos));
            lines.push(`${spiceBranchName("R", c.id)}a ${n0} ${n1} ${r1}`);
            lines.push(`${spiceBranchName("R", c.id)}b ${n1} ${n2} ${r2}`);
        } else if (c.type === "switch_spdt") {
            const nCom = nodeFor(`${c.id}#0`);
            const nA = nodeFor(`${c.id}#1`);
            const nB = nodeFor(`${c.id}#2`);
            const rOn = 0.01;
            const rOff = 1e9;
            const toB = Number(c.state) === 1;
            lines.push(`${spiceBranchName("R", c.id)}a ${nCom} ${nA} ${toB ? rOff : rOn}`);
            lines.push(`${spiceBranchName("R", c.id)}b ${nCom} ${nB} ${toB ? rOn : rOff}`);
        } else if (c.type === "push_button") {
            const n0 = nodeFor(`${c.id}#0`);
            const n1 = nodeFor(`${c.id}#1`);
            const pressed = Number(c.state) === 1;
            lines.push(`${spiceBranchName("R", c.id)} ${n0} ${n1} ${pressed ? 0.01 : 1e9}`);
        } else if (c.type === "capacitor") {
            const n0 = nodeFor(`${c.id}#0`);
            const n1 = nodeFor(`${c.id}#1`);
            const farad = parseCapacitanceFarad(c.value);
            let icSuffix = "";
            if (hasAutonomousLcOscillator && !oscillatorCapKickDone) {
                icSuffix = " IC=50m";
                oscillatorTankNode = n0 !== "0" ? n0 : n1;
                oscillatorCapKickDone = true;
            }
            lines.push(`${spiceBranchName("C", c.id)} ${n0} ${n1} ${farad}${icSuffix}`);
        } else if (c.type === "inductor") {
            const n0 = nodeFor(`${c.id}#0`);
            const n1 = nodeFor(`${c.id}#1`);
            const henry = parseInductanceHenry(c.value);
            lines.push(`${spiceBranchName("L", c.id)} ${n0} ${n1} ${henry}`);
        } else if (isSpeakerType(c.type)) {
            const nMinus = nodeFor(`${c.id}#0`);
            const nPlus = nodeFor(`${c.id}#1`);
            const kp = `${c.id}#0`;
            const km = `${c.id}#1`;
            if ((terminalWireCount.get(kp) || 0) === 0 || (terminalWireCount.get(km) || 0) === 0) {
                warnings.push(
                    `Haut-parleur ${c.id} : reliez les deux bornes (+ et −) au circuit.`
                );
            }
            if (nPlus === nMinus) {
                warnings.push(
                    `Haut-parleur ${c.id} : les deux bornes sont sur le même nœud (${nPlus}).`
                );
            }
            const ohms = parseResistanceOhm(c.value) > 0 ? parseResistanceOhm(c.value) : 8;
            lines.push(`${spiceBranchName("R", c.id)} ${nMinus} ${nPlus} ${ohms}`);
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
        } else if (c.type === "seg7") {
            const nCom = nodeFor(`${c.id}#7`);
            if (!declaredDiodeModels.has("DLED")) {
                declaredDiodeModels.add("DLED");
                lines.push(
                    `.model DLED D (IS=1.05E-15 N=1.8 RS=15 BV=50 IBV=10u CJO=10p)`
                );
            }
            for (let i = 0; i < 7; i++) {
                const nSeg = nodeFor(`${c.id}#${i}`);
                touch(`${c.id}#__seg${i}`);
                const mid = nodeFor(`${c.id}#__seg${i}`);
                lines.push(`${spiceBranchName("VIL", `${c.id}_s${i}`)} ${nSeg} ${mid} 0`);
                lines.push(`${spiceBranchName("D", `${c.id}_s${i}`)} ${mid} ${nCom} DLED`);
            }
        } else if (c.type === "bargraph_dc10h") {
            const nCom = nodeFor(`${c.id}#10`);
            if (!declaredDiodeModels.has("DLED")) {
                declaredDiodeModels.add("DLED");
                lines.push(
                    `.model DLED D (IS=1.05E-15 N=1.8 RS=15 BV=50 IBV=10u CJO=10p)`
                );
            }
            for (let i = 0; i < 10; i++) {
                const nSeg = nodeFor(`${c.id}#${i}`);
                touch(`${c.id}#__seg${i}`);
                const mid = nodeFor(`${c.id}#__seg${i}`);
                lines.push(`${spiceBranchName("VIL", `${c.id}_bg${i}`)} ${nSeg} ${mid} 0`);
                lines.push(`${spiceBranchName("D", `${c.id}_bg${i}`)} ${mid} ${nCom} DLED`);
            }
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
            const comparatorMode = opampUsesComparatorModel(c, parent, components);
            const topo = new Map(parent);
            ufUnionPassiveInternals(topo, components);
            const outEqualsPlus = ufFind(topo, `${c.id}#2`) === ufFind(topo, `${c.id}#0`);
            let bOut = nOut;
            if (outEqualsPlus) {
                touch(`${c.id}#__obuf`);
                bOut = nodeFor(`${c.id}#__obuf`);
                lines.push(`${spiceBranchName("R", c.id)}_iso ${nOut} ${bOut} 1`);
            }
            lines.push(formatOpampBsourceLine(c, bOut, nPlus, nMinus, { comparatorMode }));
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
                rippleClockFromPrev: getRippleClockFromPrev(c, wires, components),
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
                rippleClockFromPrev: getRippleClockFromPrev(c, wires, components),
            });
        } else if (isIc74ls00Type(c.type)) {
            const vhi = resolveIc74ls00Vhi(c, logicVhiByTerminal, parseLogicRail, logicVhi);
            appendIc74ls00Netlist(c, nodeFor, vhi, lines, spiceBranchName);
        } else if (isIc74ls74Type(c.type)) {
            const vhi = resolveIc74ls74Vhi(c, logicVhiByTerminal, parseLogicRail, logicVhi);
            appendIc74ls74Netlist(c, nodeFor, vhi, lines, spiceBranchName);
        } else if (isIc74hc90Type(c.type)) {
            const vhi = resolveIc74hc90Vhi(c, logicVhiByTerminal, parseLogicRail, logicVhi);
            appendIc74hc90Netlist(c, nodeFor, vhi, lines, spiceBranchName, deckOpts);
        } else if (isArduinoUnoType(c.type)) {
            appendArduinoUnoNetlist(c, nodeFor, lines, spiceBranchName, { i2cRepeatSec });
        } else if (isLogicCd4511Type(c.type)) {
            const vhi = resolveLogicCd4511Vhi(c, logicVhiByTerminal, parseLogicRail, logicVhi);
            appendLogicCd4511Netlist(c, nodeFor, vhi, lines, spiceBranchName, {
                ...deckOpts,
                leWired: (terminalWireCount.get(`${c.id}#4`) || 0) > 0,
                biWired: (terminalWireCount.get(`${c.id}#5`) || 0) > 0,
                ltWired: (terminalWireCount.get(`${c.id}#6`) || 0) > 0,
            });
        } else if (c.type === "vsource") {
            const nPlus = nodeFor(`${c.id}#0`);
            const nMinus = nodeFor(`${c.id}#1`);
            const v = parseDcVolts(c.value);
            lines.push(`${spiceBranchName("V", c.id)} ${nPlus} ${nMinus} DC ${v}`);
        } else if (c.type === "vterm") {
            const n0 = nodeFor(`${c.id}#0`);
            const v = parseDcVolts(c.value);
            lines.push(`${spiceBranchName("V", c.id)} ${n0} 0 DC ${v}`);
        } else if (c.type === "logic_state") {
            const n0 = nodeFor(`${c.id}#0`);
            const v = parseLogicStateVolts(c.value, c.logicRail);
            lines.push(`${spiceBranchName("V", c.id)} ${n0} 0 DC ${v}`);
        } else if (c.type === "vsin") {
            const nMinus = nodeFor(`${c.id}#0`);
            const nPlus = nodeFor(`${c.id}#1`);
            const voff = parseOffsetVolts(c.value);
            if (useAcForBode) {
                lines.push(`${spiceBranchName("V", c.id)} ${nPlus} ${nMinus} DC ${voff} AC 1`);
            } else {
                const vpk = parseSinusAmplitudeVolts(c.value);
                const freq = parseFreqHz(c.value);
                const phi = parsePhaseDeg(c.value);
                lines.push(`${spiceBranchName("V", c.id)} ${nPlus} ${nMinus} SIN(${voff} ${vpk} ${freq} 0 0 ${phi})`);
            }
        } else if (c.type === "vsquare") {
            const nMinus = nodeFor(`${c.id}#0`);
            const nPlus = nodeFor(`${c.id}#1`);
            const freq = parseFreqHz(c.value);
            const voff = parseOffsetVolts(c.value);
            const { ampPos, ampNeg } = parseSquareAmplitudes(c.value);
            const period = 1 / freq;
            const ton = period / 2;
            const vlow = voff - ampNeg;
            const vhi = voff + ampPos;
            lines.push(
                `${spiceBranchName("V", c.id)} ${nPlus} ${nMinus} PULSE(${vlow} ${vhi} 0 1n 1n ${ton} ${period})`
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
        if (c.type !== "voltmeter" && !isVoltmeterRmsType(c.type) && !isBodeAnalyzerType(c.type)) continue;
        const kp = `${c.id}#0`;
        const km = `${c.id}#1`;
        const label = isBodeAnalyzerType(c.type)
            ? "Analyse fréquentielle"
            : isVoltmeterRmsType(c.type)
              ? "Voltmètre (eff.)"
              : "Voltmètre";
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
    if (ohmeters.length > 0 && (powerSrc || hasVtermPower)) {
        warnings.push(
            "Ohmmètre : la résistance affichée est mesurée avec les sources du circuit coupées (mode Ω d'un multimètre)."
        );
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

    const bodeAnalyzers = [];
    const vsinForBode = components.find((c) => c.type === "vsin");
    for (const c of bodeAnalyzerComponents) {
        const kp = `${c.id}#0`;
        const km = `${c.id}#1`;
        if ((terminalWireCount.get(kp) || 0) === 0 || (terminalWireCount.get(km) || 0) === 0) {
            warnings.push(
                `Analyse fréquentielle ${c.id} : reliez les deux bornes (+ et −) au circuit.`
            );
        }
        const n0 = nodeFor(kp);
        const n1 = nodeFor(km);
        if (n0 === n1) {
            warnings.push(
                `Analyse fréquentielle ${c.id} : les deux bornes sont sur le même nœud (${n0}).`
            );
        }
        const n0IsGnd = n0 === "0" || isNodeLikelyLogicLow(n0, components, nodeFor);
        const n1IsGnd = n1 === "0" || isNodeLikelyLogicLow(n1, components, nodeFor);
        if (!n0IsGnd && !n1IsGnd) {
            warnings.push(
                `Analyse fréquentielle ${c.id} : reliez la borne − à la masse (symbole GND relié au même fil). Sans référence masse, la courbe peut ressembler à un passe-haut.`
            );
        }
        let nodeOutPlus;
        let nodeOutMinus;
        if (n1IsGnd && !n0IsGnd) {
            nodeOutPlus = n0;
            nodeOutMinus = n1;
        } else if (n0IsGnd && !n1IsGnd) {
            nodeOutPlus = n1;
            nodeOutMinus = n0;
        } else {
            nodeOutPlus = n1;
            nodeOutMinus = n0;
        }
        let nodeInPlus = "0";
        let nodeInMinus = "0";
        if (vsinForBode) {
            const sin0 = nodeFor(`${vsinForBode.id}#0`);
            const sin1 = nodeFor(`${vsinForBode.id}#1`);
            const sin0Gnd = sin0 === "0" || isNodeLikelyLogicLow(sin0, components, nodeFor);
            const sin1Gnd = sin1 === "0" || isNodeLikelyLogicLow(sin1, components, nodeFor);
            if (sin1Gnd && !sin0Gnd) {
                nodeInPlus = sin0;
                nodeInMinus = sin1;
            } else if (sin0Gnd && !sin1Gnd) {
                nodeInPlus = sin1;
                nodeInMinus = sin0;
            } else {
                nodeInPlus = sin1;
                nodeInMinus = sin0;
            }
        }
        bodeAnalyzers.push({
            id: c.id,
            nodeOutPlus,
            nodeOutMinus,
            nodeInPlus,
            nodeInMinus,
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
        voltmetersRms.push({ id: c.id, nodePlus: nm, nodeMinus: np });
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
    const hasSpeakers = components.some((c) => isSpeakerType(c.type));
    const hasLogicGates = components.some(
        c => isLogicGateComponentType(c.type) || isLogicDigitalSimType(c.type)
    );
    const hasArduinoPulse = components.some(
        (c) =>
            isArduinoUnoType(c.type) &&
            ((c.pinPulses && Object.keys(c.pinPulses).length > 0) ||
                (Array.isArray(c.pinPhases) && c.pinPhases.length >= 2))
    );
    const hasI2cBus = components.some((c) => isArduinoUnoType(c.type) && c.i2cBus?.active);
    let useTran =
        hasPulseSource ||
        hasArduinoPulse ||
        hasI2cBus ||
        hasLogicGates ||
        hasAutonomousLcOscillator ||
        (acSources.length > 0 &&
            (oscilloscopes.length > 0 ||
                voltmetersRms.length > 0 ||
                ammetersRms.length > 0 ||
                hasLeds ||
                hasSpeakers));
    if (isArduinoIdealOnlyCircuit(components)) {
        useTran = false;
        warnings.push(
            "Arduino (GPIO animés) : pas de transitoire SPICE — bargraph / LED / 7 segments animés en temps réel (plus rapide)."
        );
    }
    if (hasSpeakers && acSources.length === 0) {
        warnings.push(
            "Haut-parleur : ajoutez un générateur sinus ou carré pour activer la restitution sonore."
        );
    }
    if (hasSpeakers && useAcForBode) {
        warnings.push(
            "Haut-parleur inactif en mode analyse fréquentielle (Bode) — retirez l’analyseur Bode pour entendre le signal."
        );
    }
    if (useAcForBode && useTran) {
        warnings.push(
            "Analyse fréquentielle active : l’oscilloscope et les mesures temporelles sont ignorés pour cette simulation."
        );
        useTran = false;
    }
    if (hasOpamp && acSources.length > 0 && oscilloscopes.length === 0) {
        warnings.push(
            "Comparateur / hystérésis dynamique : ajoutez un oscilloscope sur la sortie de l'AOP et un générateur sinus (ou carré) sur l'entrée pour voir les seuils en simulation transitoire."
        );
    }
    if (hasOpamp && acSources.length === 0 && oscilloscopes.length > 0 && !hasAutonomousLcOscillator) {
        warnings.push(
            "AOP en régime DC (.op) : seuils de comparateur visibles au voltmètre ; pour l'hystérésis en fonction du temps, excitez l'entrée avec un générateur sinus."
        );
    }
    let lcKickPeriodSec = null;
    if (hasAutonomousLcOscillator) {
        const fHz = estimateParallelLcResonantHz(components);
        const periodMs = fHz > 0 ? (1000 / fHz).toFixed(2) : "?";
        if (fHz > 0) lcKickPeriodSec = 1 / fHz;
        warnings.push(
            `Oscillateur LC autonome : fréquence LC théorique ≈ ${fHz > 0 ? `${Math.round(fHz)} Hz` : "?"} (période ≈ ${periodMs} ms). SPICE est lancé en transitoire réel avec impulsion d'excitation périodique de test.`
        );
    }
    if ((voltmetersRms.length > 0 || ammetersRms.length > 0) && !useTran) {
        warnings.push(
            "Voltmètre / ampèremètre efficace : ajoutez un générateur sinus ou carré (et un oscilloscope si besoin de .tran) pour activer l’analyse transitoire et la valeur efficace."
        );
    }
    const scopesTranMeta = [];
    const ledsTranMeta = [];
    const seg7TranMeta = [];
    const bargraphTranMeta = [];
    const logicGatesTranMeta = [];
    const metersTranMeta = { voltmetersRms: [], ammetersRms: [], voltmeters: [], ammeters: [], ohmmeters: [], speakers: [] };
    let analysisTran = false;
    let analysisAc = false;
    const bodeAcMeta = [];

    lines.push("");

    const voltmeters = [];
    for (const c of components) {
        if (c.type !== "voltmeter") continue;
        const nMinus = nodeFor(`${c.id}#0`);
        const nPlus = nodeFor(`${c.id}#1`);
        if (nPlus === nMinus) {
            warnings.push(
                `Voltmètre ${c.id} : les deux bornes sont sur le même nœud (${nPlus}). Vérifiez le câblage des deux fils.`
            );
        }
        voltmeters.push({
            id: c.id,
            nodePlus: nPlus,
            nodeMinus: nMinus,
        });
    }

    const speakers = [];
    for (const c of components) {
        if (!isSpeakerType(c.type)) continue;
        const nMinus = nodeFor(`${c.id}#0`);
        const nPlus = nodeFor(`${c.id}#1`);
        speakers.push({
            id: c.id,
            nodePlus: nPlus,
            nodeMinus: nMinus,
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

    if (useAcForBode) {
        analysisAc = true;
        if (lines[0]) lines[0] = "* Circuit Designer - netlist SPICE (.ac)";
        const acFmin = 1;
        const acFmax = 1e6;
        const acPtsPerDec = 50;
        lines.push(`.ac dec ${acPtsPerDec} ${acFmin} ${acFmax}`);
        lines.push(".control");
        lines.push("run");
        const wrVars = ["frequency"];
        function pushAcNodeWr(nodeName) {
            if (!nodeName || nodeName === "0") {
                return { dbCol: null, phCol: null, isGnd: true };
            }
            wrVars.push(`vdb(${nodeName})`);
            const dbCol = wrVars.length * 2;
            wrVars.push(`vp(${nodeName})`);
            const phCol = wrVars.length * 2;
            return { dbCol, phCol, isGnd: false, nodeName };
        }
        for (const ba of bodeAnalyzers) {
            const meta = {
                id: ba.id,
                freqCol: 0,
                fMin: acFmin,
                fMax: acFmax,
                outPlus: pushAcNodeWr(ba.nodeOutPlus),
                outMinus: pushAcNodeWr(ba.nodeOutMinus),
                inPlus: pushAcNodeWr(ba.nodeInPlus),
                inMinus: pushAcNodeWr(ba.nodeInMinus),
            };
            bodeAcMeta.push(meta);
        }
        lines.push(`wrdata __AC_WAVE_PATH__ ${wrVars.join(" ")}`);
        warnings.push(
            `Analyse fréquentielle : balayage ${acFmin} Hz – ${acFmax >= 1e6 ? "1 MHz" : acFmax + " Hz"} (diagramme de Bode, gain en dB).`
        );
        if (oscilloscopes.length > 0) {
            warnings.push(
                "Oscilloscope présent : non alimenté en mode analyse fréquentielle — retirez l’analyseur Bode ou l’oscilloscope pour une simulation temporelle."
            );
        }
    } else if (useTran) {
        const hc90Mod60 = detectHc90Mod60FromGraphicalState(components, wires);
        const tranTiming = computeTranTiming(components, { ...deckOpts, hc90Mod60 });
        const { tstepStr, tstopStr, slowClock, clockPeriodSec } = tranTiming;
        analysisTran = true;
        const hc90InCircuit = components.some((c) => isIc74hc90Type(c.type));
        if (slowClock && hc90InCircuit) {
            const periodLabel =
                clockPeriodSec >= 3600
                    ? `${(clockPeriodSec / 3600).toFixed(clockPeriodSec % 3600 === 0 ? 0 : 2)} h`
                    : clockPeriodSec >= 60
                      ? `${(clockPeriodSec / 60).toFixed(clockPeriodSec % 60 === 0 ? 0 : 2)} min`
                      : `${clockPeriodSec.toFixed(2)} s`;
            warnings.push(
                `Horloge lente (${periodLabel} par impulsion) : SPICE simule ${tstopStr} s de transitoire.`
            );
        }
        if (lines[0]) lines[0] = "* Circuit Designer - netlist SPICE (.tran)";
        if (hasAutonomousLcOscillator && oscillatorTankNode) {
            const kickPeriod = lcKickPeriodSec && lcKickPeriodSec > 0 ? lcKickPeriodSec : 1e-3;
            const kickPw = Math.max(1e-6, Math.min(100e-6, kickPeriod * 0.05));
            lines.push(
                `${spiceBranchName("V", "lckick")} ${oscillatorTankNode} 0 PULSE(0 3 0 1n 1n ${formatSpiceTime(kickPw)} ${formatSpiceTime(kickPeriod)})`
            );
        }
        // Bascules internes (D, JK, 74HC90 ÷2÷5, 74LS74) : boucles logiques raides →
        // options de convergence (method=gear). Ne PAS forcer UIC ici : les ponts
        // numériques XSPICE (d_dff/d_jkff) gèrent mal les conditions initiales et
        // produiraient une séquence fausse.
        const hasInternalFlipFlops = components.some(
            (c) =>
                isLogicSequentialType(c.type) ||
                isIc74hc90Type(c.type) ||
                isIc74ls74Type(c.type)
        );
        if (hasInternalFlipFlops) {
            lines.push(".options method=gear reltol=1e-3 abstol=1e-9 gmin=1e-15 trtol=50");
        } else if (hasAutonomousLcOscillator) {
            lines.push(".options method=gear reltol=1e-3 abstol=1e-12 gmin=1e-12 trtol=10");
        }
        lines.push(
            hasAutonomousLcOscillator
                ? `.tran ${tstepStr} ${tstopStr} UIC`
                : `.tran ${tstepStr} ${tstopStr}`
        );
        lines.push(".control");
        if (hasInternalFlipFlops) {
            lines.push("set method=gear");
        }
        lines.push("set wr_singlescale");
        lines.push(
            hasAutonomousLcOscillator
                ? `tran ${tstepStr} ${tstopStr} UIC`
                : `tran ${tstepStr} ${tstopStr}`
        );

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
            const plusIsGnd = isSpiceGndNode(plusNode);
            const minusIsGnd = isSpiceGndNode(minusNode);
            const plusWrIndex = plusIsGnd ? null : nodeCol.get(plusNode);
            const minusWrIndex = minusIsGnd ? null : nodeCol.get(minusNode);
            return {
                plusNode,
                minusNode,
                wrIndex: plusWrIndex,
                minusWrIndex,
                minusIsGnd,
                plusIsGnd,
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
        for (const vm of voltmeters) {
            addWrNode(vm.nodePlus);
            addWrNode(vm.nodeMinus);
            metersTranMeta.voltmeters.push({
                id: vm.id,
                timeCol: 0,
                wrVarCount: wrVars.length,
                nodePlus: vm.nodePlus,
                nodeMinus: vm.nodeMinus,
                channel: channelWrMeta(vm.nodePlus, vm.nodeMinus),
            });
        }
        for (const sp of speakers) {
            addWrNode(sp.nodePlus);
            addWrNode(sp.nodeMinus);
            metersTranMeta.speakers.push({
                id: sp.id,
                timeCol: 0,
                wrVarCount: wrVars.length,
                nodePlus: sp.nodePlus,
                nodeMinus: sp.nodeMinus,
                channel: channelWrMeta(sp.nodePlus, sp.nodeMinus),
            });
        }
        for (const am of ammeters) {
            addWrCurrent(am.branch);
            metersTranMeta.ammeters.push({
                id: am.id,
                timeCol: 0,
                wrVarCount: wrVars.length,
                branch: am.branch,
                currentWrIndex: currentCol.get(am.branch),
                nodePlus: am.nodePlus,
                nodeMinus: am.nodeMinus,
            });
        }
        for (const om of ohmeters) {
            addWrNode(om.nodePlus);
            addWrNode(om.nodeMinus);
            metersTranMeta.ohmmeters.push({
                id: om.id,
                timeCol: 0,
                wrVarCount: wrVars.length,
                nodePlus: om.nodePlus,
                nodeMinus: om.nodeMinus,
                testCurrent: om.testCurrent,
                channel: channelWrMeta(om.nodePlus, om.nodeMinus),
            });
        }
        for (const c of components) {
            if (!isLogicGateComponentType(c.type) && !isLogicDigitalSimType(c.type) && !isArduinoUnoType(c.type)) continue;
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
            } else if (isIc74hc90Type(c.type)) {
                outKeys = ic74hc90OutputNodeKeys(c);
            } else if (isLogicCd4511Type(c.type)) {
                outKeys = cd4511OutputNodeKeys(c);
            } else if (isArduinoUnoType(c.type)) {
                outKeys = arduinoUnoDigitalPinIndices().map((i) => `${c.id}#${i}`);
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
            } else if (isIc74hc90Type(c.type)) {
                vhiTran = resolveIc74hc90Vhi(c, logicVhiByTerminal, parseLogicRail, logicVhi);
            } else if (isLogicCd4511Type(c.type)) {
                vhiTran = resolveLogicCd4511Vhi(c, logicVhiByTerminal, parseLogicRail, logicVhi);
            } else if (isArduinoUnoType(c.type)) {
                vhiTran = 5;
            }
            for (const outKey of outKeys) {
                const nOut = nodeFor(outKey);
                addWrNode(nOut);
                let icOutId = c.id;
                if (isIc74ls00Type(c.type)) {
                    icOutId = `${c.id}_Y${outKeys.indexOf(outKey) + 1}`;
                } else if (isIc74ls74Type(c.type)) {
                    icOutId = `${c.id}_Q${outKeys.indexOf(outKey) + 1}`;
                } else if (isIc74hc90Type(c.type)) {
                    const qLabels = ["Q0", "Q1", "Q2", "Q3"];
                    const idx = outKeys.indexOf(outKey);
                    if (idx >= 0 && idx < qLabels.length) icOutId = `${c.id}_${qLabels[idx]}`;
                } else if (c.type === "logic_dff") {
                    icOutId =
                        outKey === logicDffOutputNodeKey(c) ? `${c.id}_Q` : `${c.id}_Qbar`;
                } else if (c.type === "logic_jk") {
                    icOutId =
                        outKey === logicJkOutputNodeKey(c) ? `${c.id}_Q` : `${c.id}_Qbar`;
                } else if (isLogicCd4511Type(c.type)) {
                    const segNames = ["a", "b", "c", "d", "e", "f", "g"];
                    const idx = outKeys.indexOf(outKey);
                    if (idx >= 0 && idx < segNames.length) icOutId = `${c.id}_${segNames[idx]}`;
                } else if (isArduinoUnoType(c.type)) {
                    const pinIdx = Number(String(outKey).split("#")[1]);
                    if (Number.isFinite(pinIdx)) icOutId = `${c.id}_${arduinoUnoDigitalPinName(pinIdx)}`;
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
        const seg7TranMetaLocal = [];
        for (const c of components) {
            if (c.type !== "seg7") continue;
            const segWr = [];
            for (let i = 0; i < 7; i++) {
                const n = nodeFor(`${c.id}#${i}`);
                addWrNode(n);
                segWr.push(nodeCol.get(n));
            }
            const nCom = nodeFor(`${c.id}#7`);
            addWrNode(nCom);
            seg7TranMetaLocal.push({
                id: c.id,
                timeCol: 0,
                segmentWrIndex: segWr,
                commonWrIndex: nodeCol.get(nCom),
            });
        }
        seg7TranMeta.push(...seg7TranMetaLocal);
        const bargraphTranMetaLocal = [];
        for (const c of components) {
            if (c.type !== "bargraph_dc10h") continue;
            const segWr = [];
            for (let i = 0; i < 10; i++) {
                const n = nodeFor(`${c.id}#${i}`);
                addWrNode(n);
                segWr.push(nodeCol.get(n));
            }
            const nCom = nodeFor(`${c.id}#10`);
            addWrNode(nCom);
            bargraphTranMetaLocal.push({
                id: c.id,
                timeCol: 0,
                segmentWrIndex: segWr,
                commonWrIndex: nodeCol.get(nCom),
            });
        }
        bargraphTranMeta.push(...bargraphTranMetaLocal);
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
        for (const m of seg7TranMeta) {
            m.wrVarCount = finalWrVarCount;
        }
        for (const m of bargraphTranMeta) {
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
        for (const vm of metersTranMeta.voltmeters) {
            const def = voltmeters.find((v) => v.id === vm.id);
            if (def) vm.channel = channelWrMeta(def.nodePlus, def.nodeMinus);
            vm.wrVarCount = finalWrVarCount;
        }
        for (const m of metersTranMeta.ammeters) {
            m.wrVarCount = finalWrVarCount;
            if (m.branch) m.currentWrIndex = currentCol.get(m.branch);
        }
        for (const om of metersTranMeta.ohmmeters) {
            const def = ohmeters.find((o) => o.id === om.id);
            if (def) om.channel = channelWrMeta(def.nodePlus, def.nodeMinus);
            om.wrVarCount = finalWrVarCount;
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
        for (const c of components) {
            if (c.type !== "bargraph_dc10h") continue;
            const nodes = new Set();
            for (let i = 0; i < 10; i++) {
                const n = nodeFor(`${c.id}#${i}`);
                if (n !== "0") nodes.add(n);
            }
            const nCom = nodeFor(`${c.id}#10`);
            if (nCom !== "0") nodes.add(nCom);
            lines.push(`echo @@BG:${c.id}@@`);
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
        if (isIc74hc90Type(c.type)) {
            const vccKey = `${c.id}#${ic74hc90VccPinIndex()}`;
            const gndKey = `${c.id}#${ic74hc90GndPinIndex()}`;
            if ((terminalWireCount.get(vccKey) || 0) === 0) {
                warnings.push(`74HC90 ${c.id} : reliez VCC (broche 5) au +5 V.`);
            }
            if ((terminalWireCount.get(gndKey) || 0) === 0) {
                warnings.push(`74HC90 ${c.id} : reliez GND (broche 10) à la masse.`);
            }
            const q0Key = `${c.id}#11`;
            const cp1Key = `${c.id}#0`;
            const q0ToCp1 = nodeFor(q0Key) === nodeFor(cp1Key);
            if (q0ToCp1) {
                warnings.push(
                    `74HC90 ${c.id} : Q0 relié à CP1 — comptage décade 0…9 (horloge sur CP0, broche 14).`
                );
            }
            const cp0Key = `${c.id}#13`;
            const cp0Wired = (terminalWireCount.get(cp0Key) || 0) > 0;
            const cp1Wired = (terminalWireCount.get(cp1Key) || 0) > 0;
            if (!cp0Wired && cp1Wired) {
                warnings.push(
                    `74HC90 ${c.id} : horloge détectée sur CP1 alors que CP0 n'est pas relié — compteur en mode /5 (0→4). Pour 0→9 : horloge sur CP0 + Q0 relié à CP1.`
                );
            }
            if (cp1Wired && !q0ToCp1) {
                warnings.push(
                    `74HC90 ${c.id} : CP1 n'est pas relié à Q0 — le mode décade 0→9 est invalide (comptage typiquement bloqué à 0→4). Reliez Q0 à CP1.`
                );
            }
            const mr1Key = `${c.id}#1`;
            const mr2Key = `${c.id}#2`;
            const mr1High =
                (terminalWireCount.get(mr1Key) || 0) > 0 &&
                isNodeLikelyLogicHigh(nodeFor(mr1Key), components, nodeFor);
            const mr2High =
                (terminalWireCount.get(mr2Key) || 0) > 0 &&
                isNodeLikelyLogicHigh(nodeFor(mr2Key), components, nodeFor);
            if (mr1High && mr2High) {
                warnings.push(
                    `74HC90 ${c.id} : MR1 et MR2 au niveau haut — compteur maintenu à 0. Reliez MR1 et MR2 à 0 V (masse).`
                );
            }
            if (detectHc90MrAndQ1Q3OnSameChip(c.id, components, wires)) {
                warnings.push(
                    `74HC90 ${c.id} : AND(Q1,Q3) relié à MR1/MR2 — comptage erratique (reset pendant les transitions). Pour 0…9 : MR1 et MR2 à la masse. AND(Q0,Q3) sert au report vers un 2e HC90 (dizaines), pas au reset.`
                );
            }
            const ms1Key = `${c.id}#${IC90_PIN.MS1}`;
            const ms2Key = `${c.id}#${IC90_PIN.MS2}`;
            const ms1High =
                (terminalWireCount.get(ms1Key) || 0) > 0 &&
                isNodeLikelyLogicHigh(nodeFor(ms1Key), components, nodeFor);
            const ms2High =
                (terminalWireCount.get(ms2Key) || 0) > 0 &&
                isNodeLikelyLogicHigh(nodeFor(ms2Key), components, nodeFor);
            if (ms1High !== ms2High && (ms1High || ms2High)) {
                warnings.push(
                    `74HC90 ${c.id} : MS1/MS2 asymétriques — pour le mode décade 0…9, reliez MS1 et MS2 tous deux à 0 V (masse).`
                );
            }
        }
        if (isLogicCd4511Type(c.type)) {
            const inp = cd4511InputNodeKeys(c);
            const unwired = inp.filter((k) => (terminalWireCount.get(k) || 0) === 0);
            if (unwired.length > 0) {
                warnings.push(
                    `CD4511 ${c.id} : entrée(s) non reliée(s) (A–D, LE, BI, LT) — valeurs par défaut appliquées.`
                );
            }
            const biKey = `${c.id}#5`;
            const ltKey = `${c.id}#6`;
            const leKey = `${c.id}#4`;
            if ((terminalWireCount.get(biKey) || 0) > 0 && isNodeLikelyLogicLow(nodeFor(biKey), components, nodeFor)) {
                warnings.push(
                    `CD4511 ${c.id} : BI relié à la masse (0 V) — afficheur éteint. Reliez BI au +5 V (même rail que VCC).`
                );
            }
            if ((terminalWireCount.get(ltKey) || 0) > 0 && isNodeLikelyLogicLow(nodeFor(ltKey), components, nodeFor)) {
                warnings.push(
                    `CD4511 ${c.id} : LT relié à la masse (0 V) — mode test lampe (tous segments allumés). Reliez LT au +5 V en utilisation normale.`
                );
            }
            if ((terminalWireCount.get(leKey) || 0) > 0 && isNodeLikelyLogicHigh(nodeFor(leKey), components, nodeFor)) {
                warnings.push(
                    `CD4511 ${c.id} : LE au niveau haut — affichage verrouillé (ne suit plus le compteur). Reliez LE à 0 V pour le suivi en direct.`
                );
            }
        }
        if (c.type === "lamp" || c.type === "lcd") {
            const labels = { lamp: "Lampe", lcd: "LCD" };
            warnings.push(`${labels[c.type] || c.type} ${c.id} : non simulé pour l'instant.`);
        }
        if (c.type === "grove_lcd16x2") {
            warnings.push(
                `${c.id} (Grove LCD I²C) : protocole PCF8574/HD44780 simulé sur SDA/SCL (100 kHz). Scope : CH1=SDA, CH2=SCL, GND commun, 20–50 µs/div.`
            );
        }
        if (c.type === "grove_dht22") {
            warnings.push(
                `${c.id} (Grove DHT22) : lecture T°/humidité simulée via bibliothèque DHT.h sur broche DATA (câbler DATA→Dx, VCC→5V, GND).`
            );
        }
        if (c.type === "seg7") {
            const comKey = `${c.id}#7`;
            if ((terminalWireCount.get(comKey) || 0) === 0) {
                warnings.push(
                    `7 Segments ${c.id} : reliez la cathode commune (broche C, bas) à la masse.`
                );
            }
        }
        if (c.type === "bargraph_dc10h") {
            const comKey = `${c.id}#10`;
            if ((terminalWireCount.get(comKey) || 0) === 0) {
                warnings.push(
                    `Bargraph ${c.id} : reliez la cathode commune (COM) à la masse.`
                );
            }
        }
    }

    const rippleMod10Warn = detectRippleMod10ResetAndWarning(components, parent);
    if (rippleMod10Warn) warnings.push(rippleMod10Warn);

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
        } else if (isIc74hc90Type(c.type)) {
            const vhi = resolveIc74hc90Vhi(c, logicVhiByTerminal, parseLogicRail, logicVhi);
            const qNames = ["Q0", "Q1", "Q2", "Q3"];
            ic74hc90ToggleSlices().forEach((sl, i) => {
                logicGates.push({
                    id: `${c.id}/${qNames[i]}`,
                    type: c.type,
                    nodeOut: nodeFor(`${c.id}#${sl.q}`),
                    inputs: [nodeFor(`${c.id}#${sl.clk}`)],
                    vhi,
                    vth: vhi / 2,
                });
            });
        } else if (isArduinoUnoType(c.type)) {
            const vhi = 5;
            for (const pinIdx of arduinoUnoDigitalPinIndices()) {
                const pinName = arduinoUnoDigitalPinName(pinIdx);
                logicGates.push({
                    id: `${c.id}_${pinName}`,
                    type: c.type,
                    nodeOut: nodeFor(`${c.id}#${pinIdx}`),
                    inputs: [],
                    vhi,
                    vth: 2.5,
                });
            }
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
        } else if (isLogicCd4511Type(c.type)) {
            const vhi = resolveLogicCd4511Vhi(c, logicVhiByTerminal, parseLogicRail, logicVhi);
            const segNames = ["a", "b", "c", "d", "e", "f", "g"];
            segNames.forEach((s, i) => {
                logicGates.push({
                    id: `${c.id}/${s}`,
                    type: c.type,
                    nodeOut: nodeFor(`${c.id}#${7 + i}`),
                    inputs: cd4511InputNodeKeys(c).map((k) => nodeFor(k)),
                    vhi,
                    vth: vhi / 2,
                });
            });
        }
    }

    const netlistText = lines.join("\n");

    if (hasLogicCd4511 && !usesXspiceCd4511 && !usesBsourceCd4511) {
        return {
            ok: false,
            errors: [
                "CD4511 : modèle de simulation indisponible (XSPICE ou sources B).",
            ],
            warnings,
            netlist: netlistText,
            voltmeters: [],
            ammeters: [],
            ohmeters: [],
            oscilloscopes: [],
            nodeMeasures: [],
            scopesTranMeta: [],
            analysisTran: false,
            analysisAc: false,
        };
    }

    return {
        ok: true,
        netlist: netlistText,
        warnings,
        voltmeters,
        speakers,
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
        ohmmeterIsolationNetlist:
            ohmeters.length > 0 ? buildOhmmeterIsolationNetlist(netlistText, ohmeters) : "",
        oscilloscopes,
        nodeMeasures: [],
        scopesTranMeta,
        ledsTranMeta,
        logicGates,
        logicGatesTranMeta,
        metersTranMeta,
        seg7TranMeta,
        bargraphTranMeta,
        analysisTran,
        analysisAc,
        bodeAnalyzers,
        bodeAcMeta,
        seg7Displays: components
            .filter(c => c.type === "seg7")
            .map(c => ({
                id: c.id,
                segmentNodes: [0, 1, 2, 3, 4, 5, 6].map(i => nodeFor(`${c.id}#${i}`)),
                commonNode: nodeFor(`${c.id}#7`),
            })),
        bargraphDisplays: components
            .filter(c => c.type === "bargraph_dc10h")
            .map(c => ({
                id: c.id,
                segmentNodes: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map(i => nodeFor(`${c.id}#${i}`)),
                commonNode: nodeFor(`${c.id}#10`),
            })),
    };
}
