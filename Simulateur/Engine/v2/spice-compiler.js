import {
    parseSpiceNumericValue,
    sanitizeRef,
    SPICE_DIODE_MODEL_LINE,
    SPICE_OPTIONS_LINE
} from "./spice-utils.js";

export const BUILD_TAG = "v2-reset-2026-05-09";

function isPassiveType(type) {
    return type === "resistance" || type === "capacitor" || type === "inductor" || type === "diode";
}

function isGroundLike(component) {
    const type = String(component?.type || "").toLowerCase();
    const value = String(component?.value || "").toLowerCase();
    return type === "ground" || type === "sourceground" || type.includes("ground") || value === "gnd";
}

function isPowerTerminalLike(component) {
    const type = String(component?.type || "").toLowerCase();
    return type === "powerterminal" || type === "sourcepowerterminal" || type.includes("powerterminal");
}

export function compileSpiceDeck(topology) {
    const lines = [
        "* Netlist generee automatiquement (v2 reset)",
        `* BUILD_TAG: ${BUILD_TAG}`,
        SPICE_OPTIONS_LINE,
        SPICE_DIODE_MODEL_LINE
    ];
    const warnings = [...(topology.warnings || [])];
    const errors = [];
    const voltmeters = [];
    const nodeMeasures = [];
    const unsupportedComponents = [];
    const conductiveAdj = new Map();
    const sourceNodes = [];
    const floatingSeedNodes = new Set();
    const statsByNode = new Map();

    const ensureNodeStats = (node) => {
        if (!statsByNode.has(node)) {
            statsByNode.set(node, { hasSource: false, hasConductive: false, hasUnsupported: false });
        }
        return statsByNode.get(node);
    };

    const addConductiveEdge = (a, b) => {
        if (!conductiveAdj.has(a)) {
            conductiveAdj.set(a, new Set());
        }
        if (!conductiveAdj.has(b)) {
            conductiveAdj.set(b, new Set());
        }
        conductiveAdj.get(a).add(b);
        conductiveAdj.get(b).add(a);
    };

    let rIdx = 1;
    let cIdx = 1;
    let vIdx = 1;
    let dIdx = 1;
    let lIdx = 1;

    for (const { component, terms } of topology.componentTerminals) {
        if (isGroundLike(component) || isPowerTerminalLike(component)) {
            continue;
        }
        if (terms.length < 2) {
            warnings.push(`Composant '${component.reference || component.type}' ignore (pas assez de bornes).`);
            continue;
        }

        const n1 = topology.nodeOf(terms[0].key);
        const n2 = topology.nodeOf(terms[1].key);

        if (component.type === "resistance") {
            lines.push(
                `${sanitizeRef(component.reference, "R", rIdx++)} ${n1} ${n2} ${parseSpiceNumericValue(component.value, "1000")}`
            );
            addConductiveEdge(n1, n2);
            ensureNodeStats(n1).hasConductive = true;
            ensureNodeStats(n2).hasConductive = true;
        } else if (component.type === "supply") {
            lines.push(`${sanitizeRef(component.reference, "V", vIdx++)} ${n1} ${n2} DC ${parseSpiceNumericValue(component.value, "5")}`);
            sourceNodes.push(n1, n2);
            ensureNodeStats(n1).hasSource = true;
            ensureNodeStats(n2).hasSource = true;
            floatingSeedNodes.add(n1);
            floatingSeedNodes.add(n2);
            addConductiveEdge(n1, n2);
        } else if (component.type === "voltmeter") {
            const meterRef = sanitizeRef(component.reference, "VM", voltmeters.length + 1);
            voltmeters.push({
                reference: meterRef,
                nPlus: n1,
                nMinus: n2,
                measureName: `VM_${meterRef}`
            });
            nodeMeasures.push({ nodeName: n1, measureName: `NODE_${n1}` });
            nodeMeasures.push({ nodeName: n2, measureName: `NODE_${n2}` });
        } else if (!isPassiveType(component.type)) {
            warnings.push(`Composant '${component.reference || component.type}' non supporte (ignore).`);
            unsupportedComponents.push(component.reference || component.type);
            ensureNodeStats(n1).hasUnsupported = true;
            ensureNodeStats(n2).hasUnsupported = true;
        }
    }

    if (!topology.hasGround) {
        errors.push("Aucune masse : ajoute le composant Masse.");
    }
    if (lines.length <= 3) {
        errors.push("Aucun composant simulable (R, source).");
    }

    lines.push(".op");
    if (voltmeters.length > 0) {
        const vmNodes = new Set();
        for (const m of voltmeters) {
            vmNodes.add(m.nPlus);
            vmNodes.add(m.nMinus);
        }
        const nodeList = [...vmNodes].filter((n) => String(n) !== "0");
        for (let i = 0; i < nodeList.length; i += 8) {
            const chunk = nodeList.slice(i, i + 8);
            lines.push(`.print op ${chunk.map((n) => `v(${n})`).join(" ")}`);
        }
    }
    lines.push(".end");

    return {
        lines,
        warnings,
        errors,
        voltmeters,
        nodeMeasures,
        sourceNodes,
        floatingSeedNodes,
        conductiveAdj,
        unsupportedComponents,
        statsByNode
    };
}
