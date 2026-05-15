/**
 * Construit une netlist ngspice (.op) à partir du JSON de l’éditeur graphique
 * (résistances, pile DC, voltmètres, fils avec clés __t / __p).
 */

function isTwoTerminalType(t) {
    return t === "resistor" || t === "vsource" || t === "voltmeter" || t === "ammeter" || t === "ohmmeter";
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

function parseDcVolts(s) {
    if (s == null) return 5;
    const t = String(s).trim().replace(/\s/g, "").replace(",", ".");
    const m = /^([-+]?[\d.]+)\s*v?$/i.exec(t);
    if (m) return parseFloat(m[1]) || 5;
    const n = parseFloat(t.replace(/v$/i, ""));
    return Number.isFinite(n) ? n : 5;
}

function spiceBranchName(prefix, id) {
    const safe = String(id).replace(/[^a-zA-Z0-9_]/g, "_");
    return `${prefix}_${safe}`;
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
        if (!isTwoTerminalType(c.type)) continue;
        touch(`${c.id}#0`);
        touch(`${c.id}#1`);
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

    const vsrc = components.find(c => c.type === "vsource");
    const ohmeterComponents = components.filter(c => c.type === "ohmmeter");
    const needsDcSupply = components.some(c => c.type === "voltmeter" || c.type === "ammeter");

    if (needsDcSupply && !vsrc) {
        return {
            ok: false,
            errors: ["Voltmètre ou ampèremètre : ajoutez une pile DC."],
            warnings,
            netlist: "",
            voltmeters: [],
            ammeters: [],
            ohmeters: [],
            nodeMeasures: [],
            scopesTranMeta: [],
            analysisTran: false,
        };
    }
    if (!vsrc && ohmeterComponents.length === 0) {
        return {
            ok: false,
            errors: [
                "Ajoutez une pile DC, ou un ohmmètre pour mesurer des résistances sans alimentation du circuit.",
            ],
            warnings,
            netlist: "",
            voltmeters: [],
            ammeters: [],
            ohmeters: [],
            nodeMeasures: [],
            scopesTranMeta: [],
            analysisTran: false,
        };
    }

    let gndKey;
    if (vsrc) gndKey = `${vsrc.id}#1`;
    else gndKey = `${ohmeterComponents[0].id}#1`;

    touch(gndKey);
    const gndRoot = ufFind(parent, gndKey);
    if (vsrc) {
        const vsrcP = `${vsrc.id}#0`;
        const vsrcM = `${vsrc.id}#1`;
        if ((terminalWireCount.get(vsrcP) || 0) === 0 || (terminalWireCount.get(vsrcM) || 0) === 0) {
            warnings.push(`Pile ${vsrc.id} : au moins une borne n’est reliée à aucun fil.`);
        }
    } else {
        warnings.push(
            "Mode ohmmètre : pas de pile — référence sur la borne « − » du premier ohmmètre ; courant de test injecté pour calculer R."
        );
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

    for (const c of components) {
        if (c.type === "resistor") {
            const n0 = nodeFor(`${c.id}#0`);
            const n1 = nodeFor(`${c.id}#1`);
            const ohms = parseResistanceOhm(c.value);
            lines.push(`${spiceBranchName("R", c.id)} ${n0} ${n1} ${ohms}`);
        } else if (c.type === "vsource") {
            const n0 = nodeFor(`${c.id}#0`);
            const n1 = nodeFor(`${c.id}#1`);
            const v = parseDcVolts(c.value);
            lines.push(`${spiceBranchName("V", c.id)} ${n0} ${n1} DC ${v}`);
        } else if (c.type === "ammeter") {
            const n0 = nodeFor(`${c.id}#0`);
            const n1 = nodeFor(`${c.id}#1`);
            const kp = `${c.id}#0`;
            const km = `${c.id}#1`;
            if ((terminalWireCount.get(kp) || 0) === 0 || (terminalWireCount.get(km) || 0) === 0) {
                warnings.push(`Ampèremètre ${c.id} : au moins une borne n’est reliée à aucun fil (branchement en série requis).`);
            }
            if (n0 === n1) {
                warnings.push(`Ampèremètre ${c.id} : les deux bornes sont sur le même nœud (${n0}).`);
            } else {
                /* Sonde de courant : source 0 V en série ; i(VI_…) lu au .op */
                lines.push(`${spiceBranchName("VI", c.id)} ${n0} ${n1} DC 0`);
            }
        }
    }

    /* Sans branche SPICE, les nœuds reliés uniquement au voltmètre n’existent pas pour ngspice
     * (print v(nx) → « vector nx is not available »). R très grande = charge négligeable. */
    for (const c of components) {
        if (c.type !== "voltmeter") continue;
        const kp = `${c.id}#0`;
        const km = `${c.id}#1`;
        if ((terminalWireCount.get(kp) || 0) === 0 || (terminalWireCount.get(km) || 0) === 0) {
            warnings.push(`Voltmètre ${c.id} : au moins une borne n’est reliée à aucun fil.`);
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

    lines.push("");
    lines.push(".op");
    lines.push(".control");
    lines.push("op");

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
        lines.push(`echo @@VM:${c.id}@@`);
        /* ngspice : print v(0) provoque « no such vector 0 » — la masse est implicite à 0 V. */
        if (np !== "0") lines.push(`print v(${np})`);
        if (nm !== "0") lines.push(`print v(${nm})`);
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
        lines.push(`echo @@AM:${c.id}@@`);
        lines.push(`print i(${branch})`);
    }

    for (const om of ohmeters) {
        lines.push(`echo @@OH:${om.id}@@`);
        if (om.nodePlus !== "0") lines.push(`print v(${om.nodePlus})`);
        if (om.nodeMinus !== "0") lines.push(`print v(${om.nodeMinus})`);
    }

    lines.push(".endc");
    lines.push(".end");

    return {
        ok: true,
        netlist: lines.join("\n"),
        warnings,
        voltmeters,
        ammeters,
        ohmeters,
        nodeMeasures: [],
        scopesTranMeta: [],
        analysisTran: false,
    };
}
