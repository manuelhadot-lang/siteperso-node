import { DisjointSet } from "./disjoint-set.js";
import { pointKey } from "./spice-utils.js";

const SUPPLY_TERMINAL_STEPS = 2;

function isGroundComponent(component) {
    const type = String(component?.type || "").toLowerCase();
    const value = String(component?.value || "").toLowerCase();
    return type === "ground" || type === "sourceground" || type === "gnd" || value === "gnd";
}

function isPowerTerminalComponent(component) {
    const type = String(component?.type || "").toLowerCase();
    return type === "powerterminal" || type === "sourcepowerterminal" || type === "sourcepowertinal";
}

function rotateLocal(component, localX, localY) {
    const angle = ((component.rotation || 0) * Math.PI) / 180;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    return { x: component.x + localX * cos - localY * sin, y: component.y + localX * sin + localY * cos };
}

function getTerminals(component, gridStep) {
    if (isGroundComponent(component)) {
        return { a: rotateLocal(component, 0, -gridStep) };
    }
    if (component.type === "supply") {
        const d = SUPPLY_TERMINAL_STEPS * gridStep;
        return { a: rotateLocal(component, 0, -d), b: rotateLocal(component, 0, d) };
    }
    if (isPowerTerminalComponent(component)) {
        return { a: rotateLocal(component, 0, gridStep) };
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
    return {
        a: { x: component.x + (-2 * gridStep) * cos, y: component.y + (-2 * gridStep) * sin },
        b: { x: component.x + (2 * gridStep) * cos, y: component.y + (2 * gridStep) * sin }
    };
}

function getWirePoints(wire) {
    if (Array.isArray(wire.points) && wire.points.length >= 2) {
        return wire.points;
    }
    return [{ x: wire.ax, y: wire.ay }, { x: wire.bx, y: wire.by }];
}

export function buildTopology(state, options = {}) {
    const gridStep = options.gridStep || 40;
    const components = Array.isArray(state?.components) ? state.components : [];
    const wires = Array.isArray(state?.wires) ? state.wires : [];
    const dsu = new DisjointSet();

    for (const wire of wires) {
        const pts = getWirePoints(wire);
        for (const p of pts) {
            dsu.make(pointKey(p.x, p.y));
        }
        for (let i = 1; i < pts.length; i += 1) {
            dsu.union(pointKey(pts[i - 1].x, pts[i - 1].y), pointKey(pts[i].x, pts[i].y));
        }
    }

    const componentTerminals = [];
    const fallbackGroundKeys = [];
    for (const component of components) {
        const terms = Object.entries(getTerminals(component, gridStep)).map(([name, p]) => ({
            name,
            key: pointKey(p.x, p.y)
        }));
        for (const term of terms) {
            dsu.make(term.key);
        }
        if (isGroundComponent(component) && terms.length > 0) {
            fallbackGroundKeys.push(terms[0].key);
        }
        componentTerminals.push({ component, terms });
    }

    const rootNameMap = new Map();
    const nameRootMap = new Map();
    const groundRoots = new Set();
    let autoNetIndex = 1;
    const warnings = [];

    const assignRootName = (root, wanted = null) => {
        if (!rootNameMap.has(root)) {
            if (!wanted || !nameRootMap.has(wanted)) {
                const n = wanted || `N${autoNetIndex++}`;
                rootNameMap.set(root, n);
                nameRootMap.set(n, root);
            } else {
                warnings.push(`Nom de net '${wanted}' deja utilise, renommage automatique.`);
                const n = `N${autoNetIndex++}`;
                rootNameMap.set(root, n);
                nameRootMap.set(n, root);
            }
        }
        return rootNameMap.get(root);
    };

    for (const { component, terms } of componentTerminals) {
        if (!isGroundComponent(component) || terms.length === 0) {
            continue;
        }
        const root = dsu.find(terms[0].key);
        groundRoots.add(root);
        rootNameMap.set(root, "0");
        nameRootMap.set("0", root);
    }
    if (groundRoots.size === 0 && fallbackGroundKeys.length > 0) {
        const root = dsu.find(fallbackGroundKeys[0]);
        groundRoots.add(root);
        rootNameMap.set(root, "0");
        nameRootMap.set("0", root);
        warnings.push("Masse forcee sur le noeud GND detecte (compatibilite).");
    }

    for (const { component, terms } of componentTerminals) {
        if (!isPowerTerminalComponent(component) || terms.length === 0) {
            continue;
        }
        const root = dsu.find(terms[0].key);
        if (groundRoots.has(root)) {
            continue;
        }
        const label = String(component.value || component.reference || "").trim().toUpperCase().replace(/[^A-Z0-9_]/g, "");
        if (label) {
            assignRootName(root, label);
        }
    }

    const nodeOf = (terminalKey) => {
        const root = dsu.find(terminalKey);
        return groundRoots.has(root) ? "0" : assignRootName(root);
    };

    return {
        components,
        componentTerminals,
        nodeOf,
        hasGround: nameRootMap.has("0"),
        warnings
    };
}
