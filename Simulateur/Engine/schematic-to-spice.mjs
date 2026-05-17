/**
 * Construit une netlist ngspice (.op) à partir du JSON de l’éditeur graphique
 * (résistances, pile DC, générateurs, voltmètres, fils avec clés __t / __p).
 */

function isTwoTerminalType(t) {
    return (
        t === "resistor" ||
        t === "capacitor" ||
        t === "inductor" ||
        t === "diode" ||
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
    return t === "vsin" || t === "vsquare";
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

function isSingleTerminalRefType(t) {
    return isGroundType(t) || isVtermType(t);
}

function isOpampType(t) {
    return t === "opamp";
}

function isThreeTerminalType(t) {
    return t === "npn" || t === "opamp";
}

/** Bornes SPICE à enregistrer pour le câblage (union-find). */
function terminalKeysForComponent(c) {
    if (!c || !c.id) return [];
    if (isOscilloscopeType(c.type)) return [`${c.id}#0`, `${c.id}#1`, `${c.id}#2`];
    if (isThreeTerminalType(c.type)) return [`${c.id}#0`, `${c.id}#1`, `${c.id}#2`];
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
    return t === "vsource" || t === "vsin" || t === "vsquare" || t === "vterm";
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

function spiceBranchName(prefix, id) {
    const safe = String(id).replace(/[^a-zA-Z0-9_]/g, "_");
    return `${prefix}_${safe}`;
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
        if (c.type !== "vsin" && c.type !== "vsquare") continue;
        const f = parseFreqHz(c.value);
        if (f > 0) minPeriod = Math.min(minPeriod, 1 / f);
    }
    const tstep = minPeriod / TRAN_SAMPLES_PER_PERIOD;
    let tstop = Math.max(minPeriod * 8, TRAN_SCOPE_H_DIVS * TRAN_MAX_TIME_DIV_SEC);
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
        components.find(c => c.type === "vsquare");
    const vtermComponents = components.filter(c => c.type === "vterm");
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
                "Voltmètre, ampèremètre (DC ou efficace), oscilloscope : ajoutez une source (pile, borne, sinus ou carré).",
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
                "Ajoutez une pile DC, une borne, un générateur (sinus/carré), une masse, ou un ohmmètre pour définir le circuit.",
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
                warnings.push(`Borne ${vt.id} : la connexion n’est reliée à aucun fil.`);
            }
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
        return rootToSpice.get(ufFind(parent, key));
    }

    const lines = [];
    lines.push("* Circuit Designer — netlist générée (.op)");
    lines.push("");

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
        } else if (c.type === "vsource") {
            const n0 = nodeFor(`${c.id}#0`);
            const n1 = nodeFor(`${c.id}#1`);
            const v = parseDcVolts(c.value);
            lines.push(`${spiceBranchName("V", c.id)} ${n0} ${n1} DC ${v}`);
        } else if (c.type === "vterm") {
            const n0 = nodeFor(`${c.id}#0`);
            const v = parseDcVolts(c.value);
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
    const acSources = components.filter(c => c.type === "vsin" || c.type === "vsquare");

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

    const useTran =
        acSources.length > 0 &&
        (oscilloscopes.length > 0 || voltmetersRms.length > 0 || ammetersRms.length > 0);
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
        if (lines[0]) lines[0] = "* Circuit Designer — netlist générée (.tran)";
        lines.push(`.tran ${tstepStr} ${tstopStr}`);
        lines.push(".control");
        lines.push(`tran ${tstepStr} ${tstopStr}`);
        lines.push("set wr_singlescale");

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
        lines.push(`wrdata __TRAN_WAVE_PATH__ ${wrVars.join(" ")}`);
        if (oscilloscopes.length > 0) {
            warnings.push(
                `Oscilloscope : analyse transitoire (${tstopStr}) — les courbes s’ouvrent dans la fenêtre dédiée.`
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
        lines[0] = "* Circuit Designer — netlist générée (.op)";
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
        if (oscilloscopes.length > 0 && acSources.length === 0) {
            warnings.push(
                "Oscilloscope avec source DC : valeurs affichées au point de repos (.op). Pour voir des signaux alternatifs, utilisez un générateur sinus ou carré."
            );
        }
    }

    lines.push(".endc");
    lines.push(".end");

    return {
        ok: true,
        netlist: lines.join("\n"),
        warnings,
        voltmeters,
        ammeters,
        voltmetersRms,
        ammetersRms,
        ohmeters,
        oscilloscopes,
        nodeMeasures: [],
        scopesTranMeta,
        metersTranMeta,
        analysisTran,
    };
}
