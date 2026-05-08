const GRID_STEP_DEFAULT = 40;
const SUPPLY_TERMINAL_STEPS = 2;

class DisjointSet {
    constructor() {
        this.parent = new Map();
    }

    make(x) {
        if (!this.parent.has(x)) {
            this.parent.set(x, x);
        }
    }

    find(x) {
        this.make(x);
        let p = this.parent.get(x);
        while (p !== this.parent.get(p)) {
            p = this.parent.get(p);
        }
        let cur = x;
        while (cur !== p) {
            const next = this.parent.get(cur);
            this.parent.set(cur, p);
            cur = next;
        }
        return p;
    }

    union(a, b) {
        const ra = this.find(a);
        const rb = this.find(b);
        if (ra !== rb) {
            this.parent.set(ra, rb);
        }
    }
}

function normalizeValueText(raw) {
    return String(raw || "")
        .trim()
        .replace(",", ".")
        .replace(/µ/g, "u")
        .replace(/Ω/gi, "")
        .replace(/\s+/g, "");
}

function parseSpiceNumericValue(raw, fallback = null) {
    const txt = normalizeValueText(raw);
    if (!txt) {
        return fallback;
    }
    const match = txt.match(/^([+-]?\d*\.?\d+(?:e[+-]?\d+)?)([a-zA-Z]*)$/);
    if (!match) {
        return fallback;
    }
    const base = Number.parseFloat(match[1]);
    if (!Number.isFinite(base)) {
        return fallback;
    }
    const unit = (match[2] || "").toLowerCase();
    const stripped = unit
        .replace(/(volt|volts|v)$/i, "")
        .replace(/(farad|farads|f)$/i, "")
        .replace(/(henry|henries|h)$/i, "")
        .replace(/(ohm|ohms)$/i, "")
        .replace(/(amp|amps|a)$/i, "");
    const multipliers = {
        t: 1e12,
        g: 1e9,
        meg: 1e6,
        k: 1e3,
        m: 1e-3,
        u: 1e-6,
        n: 1e-9,
        p: 1e-12,
        f: 1e-15
    };
    if (!stripped) {
        return `${base}`;
    }
    if (multipliers[stripped] !== undefined) {
        return `${base * multipliers[stripped]}`;
    }
    return fallback;
}

function sanitizeRef(ref, fallbackPrefix, idx) {
    const cleaned = String(ref || "")
        .toUpperCase()
        .replace(/[^A-Z0-9_]/g, "");
    if (!cleaned) {
        return `${fallbackPrefix}${idx}`;
    }
    return cleaned;
}

function pointKey(x, y) {
    return `${x}:${y}`;
}

function rotateLocal(component, localX, localY) {
    const angle = ((component.rotation || 0) * Math.PI) / 180;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    return {
        x: component.x + localX * cos - localY * sin,
        y: component.y + localX * sin + localY * cos
    };
}

function getTerminals(component, gridStep) {
    if (component.type === "ground") {
        const p = rotateLocal(component, 0, -gridStep);
        return { a: p };
    }
    if (component.type === "supply") {
        const d = SUPPLY_TERMINAL_STEPS * gridStep;
        return {
            a: rotateLocal(component, 0, -d),
            b: rotateLocal(component, 0, d)
        };
    }
    if (component.type === "powerTerminal") {
        const p = rotateLocal(component, 0, gridStep);
        return { a: p };
    }
    if (component.type === "transistorNpn") {
        return {
            a: rotateLocal(component, -gridStep, 0),
            b: rotateLocal(component, gridStep, -2 * gridStep),
            c: rotateLocal(component, gridStep, 2 * gridStep)
        };
    }
    const angle = ((component.rotation || 0) * Math.PI) / 180;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const terminalAt = (localX) => ({
        x: component.x + localX * cos,
        y: component.y + localX * sin
    });
    return { a: terminalAt(-2 * gridStep), b: terminalAt(2 * gridStep) };
}

function getWirePoints(wire) {
    if (Array.isArray(wire.points) && wire.points.length >= 2) {
        return wire.points;
    }
    return [
        { x: wire.ax, y: wire.ay },
        { x: wire.bx, y: wire.by }
    ];
}

export function buildNgspiceDeck(state, options = {}) {
    const gridStep = options.gridStep || GRID_STEP_DEFAULT;
    const components = Array.isArray(state?.components) ? state.components : [];
    const wires = Array.isArray(state?.wires) ? state.wires : [];
    const dsu = new DisjointSet();
    const errors = [];
    const warnings = [];

    for (const wire of wires) {
        const pts = getWirePoints(wire);
        for (const p of pts) {
            dsu.make(pointKey(p.x, p.y));
        }
        for (let i = 1; i < pts.length; i += 1) {
            dsu.union(pointKey(pts[i - 1].x, pts[i - 1].y), pointKey(pts[i].x, pts[i].y));
        }
    }

    const compTerminals = [];
    for (const c of components) {
        const t = getTerminals(c, gridStep);
        const terms = Object.entries(t).map(([name, p]) => ({
            name,
            point: p,
            key: pointKey(p.x, p.y)
        }));
        for (const term of terms) {
            dsu.make(term.key);
        }
        compTerminals.push({ component: c, terms });
    }

    const rootNameMap = new Map();
    const nameRootMap = new Map();
    const groundRoots = new Set();
    let autoNetIndex = 1;

    const assignRootName = (root, wanted) => {
        const cur = rootNameMap.get(root);
        if (!cur) {
            if (!wanted || !nameRootMap.has(wanted)) {
                const name = wanted || `N${autoNetIndex++}`;
                rootNameMap.set(root, name);
                nameRootMap.set(name, root);
                return name;
            }
            warnings.push(`Nom de net '${wanted}' déjà utilisé ailleurs, renommage automatique.`);
        }
        return rootNameMap.get(root);
    };

    for (const { component, terms } of compTerminals) {
        if (component.type !== "ground" || terms.length === 0) {
            continue;
        }
        const root = dsu.find(terms[0].key);
        groundRoots.add(root);
        rootNameMap.set(root, "0");
        nameRootMap.set("0", root);
    }

    for (const { component, terms } of compTerminals) {
        if (component.type !== "powerTerminal" || terms.length === 0) {
            continue;
        }
        const root = dsu.find(terms[0].key);
        if (groundRoots.has(root)) {
            continue;
        }
        const rawLabel = String(component.value || component.reference || "").trim();
        const label = rawLabel
            ? rawLabel.toUpperCase().replace(/[^A-Z0-9_]/g, "_")
            : null;
        assignRootName(root, label || null);
    }

    const nodeOf = (pointKeyValue) => {
        const root = dsu.find(pointKeyValue);
        if (groundRoots.has(root)) {
            return "0";
        }
        return assignRootName(root, null);
    };

    const lines = [];
    lines.push("* Netlist generee automatiquement");
    lines.push(".options reltol=1e-4 abstol=1e-12 vntol=1e-6");
    lines.push(".model DDEFAULT D(Is=2.52n Rs=0.568 N=1.906 Cjo=1p M=0.03 Eg=1.11 Bv=100 Ibv=0.1u)");

    let rIdx = 1;
    let cIdx = 1;
    let lIdx = 1;
    let dIdx = 1;
    let vIdx = 1;
    const voltmeters = [];

    for (const { component, terms } of compTerminals) {
        if (component.type === "ground" || component.type === "powerTerminal") {
            continue;
        }
        if (terms.length < 2) {
            warnings.push(`Composant '${component.reference || component.type}' ignore (pas assez de bornes).`);
            continue;
        }
        const n1 = nodeOf(terms[0].key);
        const n2 = nodeOf(terms[1].key);
        if (n1 === n2) {
            warnings.push(`Composant '${component.reference || component.type}' en court-circuit local (${n1}).`);
        }
        if (component.type === "resistance") {
            const v = parseSpiceNumericValue(component.value, "1000");
            lines.push(`${sanitizeRef(component.reference, "R", rIdx++)} ${n1} ${n2} ${v}`);
        } else if (component.type === "capacitor") {
            const v = parseSpiceNumericValue(component.value, "1e-6");
            lines.push(`${sanitizeRef(component.reference, "C", cIdx++)} ${n1} ${n2} ${v}`);
        } else if (component.type === "inductor") {
            const v = parseSpiceNumericValue(component.value, "1e-3");
            lines.push(`${sanitizeRef(component.reference, "L", lIdx++)} ${n1} ${n2} ${v}`);
        } else if (component.type === "diode") {
            lines.push(`${sanitizeRef(component.reference, "D", dIdx++)} ${n1} ${n2} DDEFAULT`);
        } else if (component.type === "supply") {
            const v = parseSpiceNumericValue(component.value, "5");
            lines.push(`${sanitizeRef(component.reference, "V", vIdx++)} ${n1} ${n2} DC ${v}`);
        } else if (component.type === "voltmeter") {
            const meterRef = sanitizeRef(component.reference, "VM", voltmeters.length + 1);
            const measureName = `VM_${meterRef}`;
            voltmeters.push({ reference: meterRef, nPlus: n1, nMinus: n2, measureName });
        }
    }

    if (lines.length <= 3) {
        errors.push("Aucun composant simulable detecte (R, L, C, D, alimentation).");
    }

    if (!nameRootMap.has("0")) {
        errors.push("Aucune masse detectee : ajoute un composant 'Masse' pour definir le noeud 0.");
    }

    lines.push(".op");
    voltmeters.forEach((meter) => {
        lines.push(`.meas op ${meter.measureName} FIND v(${meter.nPlus},${meter.nMinus})`);
    });
    lines.push(".end");

    return {
        ok: errors.length === 0,
        netlist: lines.join("\n"),
        warnings,
        errors,
        voltmeters
    };
}
