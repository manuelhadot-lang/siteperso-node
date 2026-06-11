/**
 * Intégration locale : netlist .ac + parse wrdata
 * node Simulateur/Engine/bode-ac-integration.test.mjs
 */
import { readFileSync, mkdtempSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { execFileSync } from "child_process";
import { buildNetlistFromGraphicalState } from "./schematic-to-spice.mjs";
import { mergeBodePlotsFromAcWrdata } from "./v2/result-parser.mjs";

const repoRoot = join(import.meta.dirname, "..", "..");
const ngspice = join(repoRoot, "Simulateur", "bin", "ngspice_con.exe");

const state = {
    components: [
        { id: "Sin_1", type: "vsin", value: "5V 1kHz 0V", x: 0, y: 0 },
        { id: "R_1", type: "resistor", value: "1k", x: 100, y: 0 },
        { id: "C_1", type: "capacitor", value: "100n", x: 200, y: 0 },
        { id: "GND_1", type: "ground", x: 200, y: 80 },
        { id: "Bode_1", type: "bode_analyzer", x: 280, y: 0 },
    ],
    wires: [
        { solid: true, fromKey: "Sin_1#1", toKey: "R_1#0", points: [] },
        { solid: true, fromKey: "R_1#1", toKey: "C_1#0", points: [] },
        { solid: true, fromKey: "C_1#1", toKey: "GND_1#0", points: [] },
        { solid: true, fromKey: "Sin_1#0", toKey: "GND_1#0", points: [] },
        { solid: true, fromKey: "Bode_1#1", toKey: "R_1#1", points: [] },
        { solid: true, fromKey: "Bode_1#0", toKey: "GND_1#0", points: [] },
    ],
};

const built = buildNetlistFromGraphicalState(state);
if (!built.ok) throw new Error("build failed: " + built.errors?.join("; "));
const deck = built.netlist.replace("__AC_WAVE_PATH__", "ac_waves.txt");
const tmp = mkdtempSync(join(tmpdir(), "bode-int-"));
writeFileSync(join(tmp, "circuit.cir"), deck.replace(/^\* Circuit Designer[^\n]*\n/, "* CD\n"));
execFileSync(ngspice, ["-b", "-o", "ng.log", "circuit.cir"], { cwd: tmp, stdio: "pipe" });
const waveTxt = readFileSync(join(tmp, "ac_waves.txt"), "utf8");
const lines = waveTxt.trim().split(/\r?\n/).filter(Boolean);
console.log("meta", JSON.stringify(built.bodeAcMeta[0], null, 2));
console.log("row0", lines[0]);
console.log("rowLast", lines[lines.length - 1]);
const plots = mergeBodePlotsFromAcWrdata(waveTxt, built.bodeAcMeta);
const p = plots.Bode_1;
console.log("gain0", p.gainDb[0], "gainMid", p.gainDb[100], "gainEnd", p.gainDb[p.gainDb.length - 1]);
console.log("fc", p.cutoffHz);
if (p.gainDb[p.gainDb.length - 1] > -6) throw new Error("gain haute fréquence devrait être < -6 dB");
if (!p.cutoffHz?.length) throw new Error("fc attendue");
console.log("bode-ac-integration.test.mjs : OK");
