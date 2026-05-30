/** Import à chaque build pour éviter le cache ESM de schematic-to-spice (rechargé via importFresh côté serveur). */
async function loadSchematicBuilder() {
    const mod = await import(`./schematic-to-spice.mjs?fresh=${Date.now()}`);
    if (typeof mod.buildNetlistFromGraphicalState !== "function") {
        throw new Error("buildNetlistFromGraphicalState introuvable dans schematic-to-spice.mjs");
    }
    return mod.buildNetlistFromGraphicalState;
}

/**
 * Mode batch ngspice (-b) : un bloc .control sans analyse au niveau circuit
 * (.op, .tran, .dc, …) échoue souvent. On insère .op avant .control si besoin,
 * et « quit » avant .endc pour une sortie propre.
 * @param {string} text
 */
function normalizeSpiceNetlistForNgspiceBatch(text) {
    let s = String(text || "").replace(/^\uFEFF/, "");
    // SPICE / ngspice : la **première ligne non vide** du fichier est toujours le « titre »
    // et n’est **pas** un composant. Si on supprime notre ligne * …, la 1re ligne devient
    // par ex. « V_V1 … » : elle est alors ignorée comme titre → circuit faux (0 V, etc.).
    // Remplacer par une ligne titre minimale (ASCII) — ngspice accepte tout commentaire *.
    s = s.replace(
        /^\* Circuit Designer - netlist SPICE \(\.(?:op|tran)\)[^\r\n]*\r?\n(?:\s*\r?\n)?/i,
        "* CD\n"
    );
    // Ne PAS forcer CRLF tout le fichier : sur certaines installs ngspice-46 sous Windows,
    // ça combiné au bloc .control / wrdata donne une analyse transitoire « réussie » mais
    // sans données exploitables dans l’interface.
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
export async function buildNgspiceDeck(state, opts = {}) {
    if (
        state &&
        typeof state === "object" &&
        !state.netlist &&
        Array.isArray(state.components) &&
        Array.isArray(state.wires)
    ) {
        const buildNetlistFromGraphicalState = await loadSchematicBuilder();
        const built = buildNetlistFromGraphicalState(state, opts);
        if (!built.ok) return built;
        const nrm = normalizeSpiceNetlistForNgspiceBatch(built.netlist);
        return {
            ...built,
            netlist: nrm,
            warnings: built.warnings || [],
        };
    }

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