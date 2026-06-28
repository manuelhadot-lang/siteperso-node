/**
 * Chaîne audio AOP : .tran ngspice + courbes oscilloscope.
 * node Simulateur/Engine/opamp-audio-tran.test.mjs
 */
import { readFileSync, mkdtempSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { execFileSync } from "child_process";
import { buildNetlistFromGraphicalState } from "./schematic-to-spice.mjs";
import { mergeScopePlotsFromTranWrdata } from "./v2/result-parser.mjs";

const repoRoot = join(import.meta.dirname, "..", "..");
const ngspice = join(repoRoot, "Simulateur", "bin", "ngspice_con.exe");

function wire(fromKey, toKey) {
    return { solid: true, fromKey, toKey, points: [] };
}

const state = {
    components: [
        { id: "Sin1", type: "vsin", value: "5V 1kHz 0V", x: 0, y: 0 },
        { id: "R2", type: "resistor", value: "1k", x: 100, y: 0 },
        { id: "C1", type: "capacitor", value: "10uF", x: 200, y: 50 },
        { id: "AOP1", type: "opamp", value: "uA741", vp: 15, vn: -15, x: 300, y: 0 },
        { id: "HP1", type: "speaker", value: "8", x: 450, y: 50 },
        { id: "R3", type: "resistor", value: "1k", x: 500, y: -50 },
        { id: "R4", type: "resistor", value: "1k", x: 500, y: 50 },
        { id: "AOP2", type: "opamp", value: "uA741", vp: 15, vn: -15, x: 600, y: 0 },
        { id: "Osci1", type: "oscilloscope", x: 750, y: 0, timeDivSec: 0.001 },
        { id: "GND1", type: "ground", x: 300, y: 150 },
    ],
    wires: [
        wire("Sin1#0", "R2#0"),
        wire("Sin1#1", "GND1#0"),
        wire("R2#1", "C1#0"),
        wire("C1#0", "AOP1#0"),
        wire("C1#1", "GND1#0"),
        wire("AOP1#1", "AOP1#2"),
        wire("AOP1#2", "HP1#1"),
        wire("HP1#0", "GND1#0"),
        wire("AOP1#2", "AOP2#0"),
        wire("AOP2#2", "R3#0"),
        wire("R3#1", "AOP2#1"),
        wire("AOP2#1", "R4#0"),
        wire("R4#1", "GND1#0"),
        wire("AOP2#2", "Osci1#0"),
        wire("Sin1#0", "Osci1#1"),
        wire("Osci1#2", "GND1#0"),
    ],
};

const built = buildNetlistFromGraphicalState(state);
if (!built.ok) throw new Error("build failed: " + (built.errors || []).join("; "));
if (!built.analysisTran) throw new Error("analysisTran attendu");
const aop2Line = (built.netlist.match(/BAOP_AOP2[^\n]+/) || [""])[0];
if (!/tanh\(/.test(aop2Line)) throw new Error("AOP2 pas en mode amplificateur: " + aop2Line);

const tmp = mkdtempSync(join(tmpdir(), "aop-audio-"));
const deck = built.netlist.replace("__TRAN_WAVE_PATH__", "tran_waves.txt");
writeFileSync(join(tmp, "circuit.cir"), deck);
execFileSync(ngspice, ["-b", "-o", "ng.log", "circuit.cir"], { cwd: tmp, stdio: "pipe" });
const waveTxt = readFileSync(join(tmp, "tran_waves.txt"), "utf8");
const plots = mergeScopePlotsFromTranWrdata(waveTxt, built.scopesTranMeta);
const p = plots.Osci1;
if (!p?.ch1?.voltage?.length) throw new Error("CH1 vide — plots: " + JSON.stringify(Object.keys(plots)));
const peak1 = Math.max(...p.ch1.voltage.map(Math.abs));
const peak2 = Math.max(...p.ch2.voltage.map(Math.abs));
console.log("CH1 peak", peak1.toFixed(3), "V  CH2 peak", peak2.toFixed(3), "V");
if (peak2 < 0.5) throw new Error(`CH2 (Sin) trop faible: ${peak2} V — vérifiez générateur / masse`);
if (peak1 < 0.05) throw new Error(`CH1 (sortie AOP2) quasi nulle: ${peak1} V — HP 8Ω écrase le suiveur ; augmentez V/div ou retirez le HP pour tester`);
console.log("opamp-audio-tran.test.mjs : OK");
