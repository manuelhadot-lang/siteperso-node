export function buildNgspiceDeck(state, opts = {}) {
    const netlist = typeof state === 'string' ? state : (state.netlist || "");
    return {
        ok: true,
        netlist: netlist,
        analysisTran: netlist.toLowerCase().includes('.tran'),
        warnings: [],
        // Ajoutez ces lignes pour éviter des erreurs de lecture plus tard
        voltmeters: [],
        nodeMeasures: [],
        ammeters: [],
        ohmeters: [],
        scopesTranMeta: []
    };
}