import { buildTopology } from "./topology.js";
import { compileSpiceDeck } from "./spice-compiler.js";
import { buildDiagnostics } from "./diagnostics.js";

export function buildNgspiceDeckV2(state, options = {}) {
    const topology = buildTopology(state, options);
    const compiled = compileSpiceDeck(topology);
    const diagnostics = buildDiagnostics(compiled);

    const warnings = [...compiled.warnings];
    if (diagnostics.sourceConnectedToGround === false) {
        warnings.push(
            "Circuit ouvert probable : aucune source ne semble reliee a la masse via un chemin conducteur."
        );
    }
    if (diagnostics.floatingNets.length > 0) {
        warnings.push(
            `Noeuds poss. flottants: ${diagnostics.floatingNets.slice(0, 6).join(", ")}${
                diagnostics.floatingNets.length > 6 ? ", …" : ""
            }.`
        );
    }

    return {
        ok: compiled.errors.length === 0,
        netlist: compiled.lines.join("\n"),
        warnings,
        errors: compiled.errors,
        voltmeters: compiled.voltmeters,
        nodeMeasures: compiled.nodeMeasures,
        diagnostics
    };
}
