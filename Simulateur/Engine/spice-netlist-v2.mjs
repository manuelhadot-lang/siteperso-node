// Netlist brute (éditeur Simulateur) ou état JSON avec champ .netlist
export function buildNgspiceDeck(state, opts = {}) {
    const netlist =
        typeof state === "string"
            ? state
            : typeof state?.netlist === "string"
              ? state.netlist
              : "";
    if (!netlist.trim()) {
        return {
            ok: false,
            errors: ["Netlist vide ou invalide : fournir une chaîne SPICE ou un objet { netlist: string }."],
            warnings: [],
            netlist: "",
        };
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
        warnings: [],
    };
}