/**
 * Câblage Bode : passe-bas (V_C) vs passe-haut (V_R).
 * node Simulateur/Engine/bode-ac-wiring.test.mjs
 */
import { readFileSync, mkdtempSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { execFileSync } from "child_process";
import { buildNetlistFromGraphicalState } from "./schematic-to-spice.mjs";
import { mergeBodePlotsFromAcWrdata } from "./v2/result-parser.mjs";

const repoRoot = join(import.meta.dirname, "..", "..");
const ngspice = join(repoRoot, "Simulateur", "bin", "ngspice_con.exe");

function runCase(name, wires) {
    const state = {
        components: [
            { id: "Sin_1", type: "vsin", value: "5V 1kHz 0V", x: 0, y: 0 },
            { id: "R_1", type: "resistor", value: "1k", x: 100, y: 0 },
            { id: "C_1", type: "capacitor", value: "1u", x: 200, y: 0 },
            { id: "GND_1", type: "ground", x: 200, y: 80 },
            { id: "Bode_1", type: "bode_analyzer", x: 280, y: 0, rotation: -90 },
        ],
        wires,
    };
    const built = buildNetlistFromGraphicalState(state);
    if (!built.ok) throw new Error(`${name}: build failed`);
    const tmp = mkdtempSync(join(tmpdir(), "bode-w-"));
    const deck = built.netlist.replace("__AC_WAVE_PATH__", "ac_waves.txt");
    writeFileSync(join(tmp, "circuit.cir"), deck);
    execFileSync(ngspice, ["-b", "-o", "ng.log", "circuit.cir"], { cwd: tmp, stdio: "pipe" });
    const waveTxt = readFileSync(join(tmp, "ac_waves.txt"), "utf8");
    const p = mergeBodePlotsFromAcWrdata(waveTxt, built.bodeAcMeta).Bode_1;
    const g0 = p.gainDb[0];
    const gEnd = p.gainDb[p.gainDb.length - 1];
    console.log(name, "gain0", g0.toFixed(2), "gainEnd", gEnd.toFixed(2), "hint", p.responseHint || "-");
    return { g0, gEnd, hint: p.responseHint };
}

const lp = runCase("VC (LP)", [
    { solid: true, fromKey: "Sin_1#1", toKey: "R_1#0", points: [] },
    { solid: true, fromKey: "R_1#1", toKey: "C_1#0", points: [] },
    { solid: true, fromKey: "C_1#1", toKey: "GND_1#0", points: [] },
    { solid: true, fromKey: "Sin_1#0", toKey: "GND_1#0", points: [] },
    { solid: true, fromKey: "Bode_1#1", toKey: "R_1#1", points: [] },
    { solid: true, fromKey: "Bode_1#0", toKey: "GND_1#0", points: [] },
]);

const hp = runCase("VR (HP)", [
    { solid: true, fromKey: "Sin_1#1", toKey: "R_1#0", points: [] },
    { solid: true, fromKey: "R_1#1", toKey: "C_1#0", points: [] },
    { solid: true, fromKey: "C_1#1", toKey: "GND_1#0", points: [] },
    { solid: true, fromKey: "Sin_1#0", toKey: "GND_1#0", points: [] },
    { solid: true, fromKey: "Bode_1#1", toKey: "R_1#0", points: [] },
    { solid: true, fromKey: "Bode_1#0", toKey: "R_1#1", points: [] },
]);

if (lp.gEnd >= lp.g0 - 6) throw new Error("VC devrait être passe-bas");
if (hp.gEnd <= hp.g0 + 6) throw new Error("VR devrait être passe-haut");
if (!hp.hint?.includes("passe-haut")) throw new Error("hint passe-haut attendu pour VR");

console.log("bode-ac-wiring.test.mjs : OK");
