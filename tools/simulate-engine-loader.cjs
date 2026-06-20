/**
 * Chargement unique (cache) des modules ESM du moteur SPICE.
 * Évite ~25 import() par requête POST /api/simulate (lent sur Render).
 */
const path = require("path");
const { pathToFileURL } = require("url");

/** @type {Promise<Record<string, Function>> | null} */
let loadPromise = null;

const PARSER_EXPORTS = [
    "mergeVoltmeterMeasurements",
    "mergeAmmeterMeasurements",
    "mergeLedMeasurements",
    "mergeSeg7Measurements",
    "mergeSeg7FromTranWrdata",
    "mergeSeg7TranPlotsFromWrdata",
    "mergeBargraphMeasurements",
    "mergeBargraphFromTranWrdata",
    "mergeBargraphTranPlotsFromWrdata",
    "mergeLedTranPlotsFromWrdata",
    "mergeLedValuesFromTranPlots",
    "mergeLogicGateMeasurements",
    "mergeLogicGateTranFromWrdata",
    "mergeLogicGateTranPlotsFromWrdata",
    "mergeOhmmeterMeasurements",
    "mergeOscilloscopeMeasurements",
    "mergeScopePlotsFromTranWrdata",
    "mergeBodePlotsFromAcWrdata",
    "deriveOscilloscopeValuesFromScopePlots",
    "mergeVoltmeterRmsFromTranWrdata",
    "mergeAmmeterRmsFromTranWrdata",
    "mergeVoltmeterFromTranWrdata",
    "mergeAmmeterFromTranWrdata",
    "mergeOhmmeterFromTranWrdata",
    "mergeVoltmeterTranPlotsFromWrdata",
];

/**
 * @param {string} repoRoot répertoire racine du dépôt (contient Simulateur/)
 * @returns {Promise<Record<string, Function>>}
 */
async function loadSimEngineModules(repoRoot) {
    if (loadPromise) return loadPromise;
    loadPromise = (async () => {
        const deckPath = path.join(repoRoot, "Simulateur", "Engine", "spice-netlist-v2.mjs");
        const parserPath = path.join(repoRoot, "Simulateur", "Engine", "v2", "result-parser.mjs");
        const [deckMod, parserMod] = await Promise.all([
            import(pathToFileURL(deckPath).href),
            import(pathToFileURL(parserPath).href),
        ]);
        if (typeof deckMod.buildNgspiceDeck !== "function") {
            throw new Error("Module buildNgspiceDeck introuvable.");
        }
        const out = { buildNgspiceDeck: deckMod.buildNgspiceDeck };
        for (const name of PARSER_EXPORTS) {
            if (typeof parserMod[name] !== "function") {
                throw new Error(`Module ${name} introuvable.`);
            }
            out[name] = parserMod[name];
        }
        return out;
    })();
    loadPromise.catch(() => {
        loadPromise = null;
    });
    return loadPromise;
}

/** Pré-charge au démarrage du serveur (Render : 1er clic simulation plus rapide). */
function preloadSimEngineModules(repoRoot) {
    loadSimEngineModules(repoRoot).catch((err) => {
        console.error("[Simulateur] préchargement moteur SPICE :", err?.message || err);
    });
}

module.exports = { loadSimEngineModules, preloadSimEngineModules };
