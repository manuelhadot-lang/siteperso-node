/**
 * Mode batch ngspice (-b) : un bloc .control sans analyse au niveau circuit
 * (.op, .tran, .dc, …) échoue souvent. On insère .op avant .control si besoin,
 * et « quit » avant .endc pour une sortie propre.
 * @param {string} text
 */
function normalizeSpiceNetlistForNgspiceBatch(text) {
    let s = text;
    if (!/\S/.test(s) || !/^\s*\.control\b/im.test(s)) return s;

    const hasCircuitAnalysis = /^\s*\.(op|tran|dc|ac|pz|noise|sens|tf)\b/im.test(s);
    if (!hasCircuitAnalysis) {
        s = s.replace(/^\s*\.control\b/im, ".op\n.control");
    }

    const controlBlock = s.match(/\.control\b([\s\S]*?)\.endc\b/i);
    if (controlBlock && !/\bquit\b/i.test(controlBlock[1])) {
        s = s.replace(/(\r?\n)(\s*\.endc\b)/i, "$1quit$1$2");
    }
    return s;
}

// Netlist brute (éditeur Simulateur) ou état JSON avec champ .netlist
export function buildNgspiceDeck(state, opts = {}) {
    const raw =
        typeof state === "string"
            ? state
            : typeof state?.netlist === "string"
              ? state.netlist
              : "";
    const netlist = typeof raw === "string" ? normalizeSpiceNetlistForNgspiceBatch(raw) : "";
    if (!netlist.trim()) {
        return {
            ok: false,
            errors: ["Netlist vide ou invalide : fournir une chaîne SPICE ou un objet { netlist: string }."],
            warnings: [],
            netlist: "",
        };
    }
    const warnings = [];
    if (typeof raw === "string" && raw !== netlist) {
        warnings.push("Netlist ajustée pour le mode batch ngspice (-b) : analyse .op ou commande quit ajoutée si nécessaire.");
    }
    return {
        ok: true,
        netlist,
        analysisTran: /\b\.tran\b/i.test(netlist),
        voltmeters: [],
        ammeters: [],
        ohmeters: [],
        nodeMeasures: [],
        scopesTranMeta: [],
        warnings,
    };
}