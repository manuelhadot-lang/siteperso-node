/**
 * Haut-parleur + Sin → .tran + courbe tension HP.
 * node Simulateur/Engine/speaker-tran.test.mjs
 */
import { readFileSync, mkdtempSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { execFileSync } from "child_process";
import { buildNetlistFromGraphicalState } from "./schematic-to-spice.mjs";
import { mergeVoltmeterTranPlotsFromWrdata } from "./v2/result-parser.mjs";

const repoRoot = join(import.meta.dirname, "..", "..");
const ngspice = join(repoRoot, "Simulateur", "bin", "ngspice_con.exe");

const state = {
    components: [
        { id: "Sin_1", type: "vsin", value: "5V 440Hz 0V", x: 0, y: 0 },
        { id: "GND_1", type: "ground", x: 0, y: 80 },
        { id: "HP_1", type: "speaker", value: "8", x: 200, y: 0 },
    ],
    wires: [
        { solid: true, fromKey: "Sin_1#1", toKey: "HP_1#0", points: [] },
        { solid: true, fromKey: "Sin_1#0", toKey: "GND_1#0", points: [] },
        { solid: true, fromKey: "HP_1#1", toKey: "GND_1#0", points: [] },
    ],
};

const built = buildNetlistFromGraphicalState(state);
if (!built.ok) throw new Error("build failed: " + built.errors?.join("; "));
if (!built.analysisTran) throw new Error("analysisTran attendu");
if (!built.netlist.includes("R_HP_1")) throw new Error("résistance HP manquante");
if (!built.metersTranMeta?.speakers?.length) throw new Error("meta speaker manquante");

const tmp = mkdtempSync(join(tmpdir(), "spk-"));
const deck = built.netlist.replace("__TRAN_WAVE_PATH__", "tran_waves.txt");
writeFileSync(join(tmp, "circuit.cir"), deck);
execFileSync(ngspice, ["-b", "-o", "ng.log", "circuit.cir"], { cwd: tmp, stdio: "pipe" });
const waveTxt = readFileSync(join(tmp, "tran_waves.txt"), "utf8");
const plots = mergeVoltmeterTranPlotsFromWrdata(waveTxt, built.metersTranMeta.speakers);
const p = plots.HP_1;
if (!p?.voltage?.length) throw new Error("courbe HP vide");
const peak = Math.max(...p.voltage.map(Math.abs));
if (peak < 1) throw new Error(`tension HP trop faible: ${peak}`);
console.log("speaker-tran.test.mjs : OK (peak", peak.toFixed(2), "V)");
