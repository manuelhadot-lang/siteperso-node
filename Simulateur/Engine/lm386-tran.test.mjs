/**
 * LM386 DIP-8 : gain externe + sortie HP.
 * node Simulateur/Engine/lm386-tran.test.mjs
 */
import { readFileSync, mkdtempSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { execFileSync } from "child_process";
import { buildNetlistFromGraphicalState } from "./schematic-to-spice.mjs";
import { mergeScopePlotsFromTranWrdata } from "./v2/result-parser.mjs";
import { detectLm386Gain } from "./lm386.mjs";

const repoRoot = join(import.meta.dirname, "..", "..");
const ngspice = join(repoRoot, "Simulateur", "bin", "ngspice_con.exe");

function wire(fromKey, toKey) {
    return { solid: true, fromKey, toKey, points: [] };
}

function runCase(name, extraComponents, extraWires, expectGain) {
    const state = {
        components: [
            { id: "Sin1", type: "vsin", value: "0.05V 1kHz 0V", x: 0, y: 0 },
            { id: "Cin", type: "capacitor", value: "10u", x: 100, y: 0 },
            { id: "U1", type: "lm386", value: "LM386N-1", vplus: 9, x: 250, y: 0 },
            { id: "Cout", type: "capacitor", value: "220u", x: 400, y: 0 },
            { id: "HP1", type: "speaker", value: "8", x: 500, y: 0 },
            { id: "V9", type: "vsource", value: "9", x: 250, y: -80 },
            { id: "GND1", type: "ground", x: 250, y: 120 },
            {
                id: "Osci1",
                type: "oscilloscope",
                x: 650,
                y: 0,
                timeDivSec: 0.0005,
                ch1VoltsPerDiv: 2,
                ch2VoltsPerDiv: 0.1,
            },
            ...extraComponents,
        ],
        wires: [
            wire("Sin1#0", "GND1#0"),
            wire("Sin1#1", "Cin#0"),
            wire("Cin#1", "U1#2"),
            wire("U1#1", "GND1#0"),
            wire("U1#3", "GND1#0"),
            wire("U1#5", "V9#1"),
            wire("V9#0", "GND1#0"),
            wire("U1#4", "Cout#0"),
            wire("Cout#1", "HP1#1"),
            wire("HP1#0", "GND1#0"),
            wire("U1#4", "Osci1#0"),
            wire("Sin1#1", "Osci1#1"),
            wire("Osci1#2", "GND1#0"),
            ...extraWires,
        ],
    };

    const gain = detectLm386Gain(state.components.find((c) => c.id === "U1"), state.components, state.wires);
    if (gain !== expectGain) {
        throw new Error(`${name}: gain attendu ${expectGain}, obtenu ${gain}`);
    }

    const built = buildNetlistFromGraphicalState(state);
    if (!built.ok) throw new Error(`${name}: build — ${(built.errors || []).join("; ")}`);
    if (!/BLM386_U1/.test(built.netlist)) throw new Error(`${name}: source LM386 manquante`);
    if (!new RegExp(`gain=${expectGain}\\b`).test(built.netlist)) {
        throw new Error(`${name}: commentaire gain absent`);
    }

    const tmp = mkdtempSync(join(tmpdir(), "lm386-tran-"));
    const deck = built.netlist.replace("__TRAN_WAVE_PATH__", "tran_waves.txt");
    writeFileSync(join(tmp, "circuit.cir"), deck);
    execFileSync(ngspice, ["-b", "-o", "ng.log", "circuit.cir"], { cwd: tmp, stdio: "pipe" });
    const waveTxt = readFileSync(join(tmp, "tran_waves.txt"), "utf8");
    const plots = mergeScopePlotsFromTranWrdata(waveTxt, built.scopesTranMeta);
    const p = plots.Osci1;
    if (!p?.ch1?.voltage?.length) throw new Error(`${name}: CH1 vide`);

    const tail = Math.floor(p.ch1.voltage.length * 0.7);
    let peak1 = 0;
    for (let i = tail; i < p.ch1.voltage.length; i++) {
        peak1 = Math.max(peak1, Math.abs(p.ch1.voltage[i]));
    }
    console.log(`${name}: gain=${gain} CH1 peak=${peak1.toFixed(3)} V`);
    if (peak1 < 0.3) throw new Error(`${name}: sortie LM386 trop faible (${peak1} V)`);
    return peak1;
}

runCase("gain-20-open", [], [], 20);

runCase(
    "gain-200-cap",
    [{ id: "Cg", type: "capacitor", value: "10u", x: 200, y: -40 }],
    [wire("U1#0", "Cg#0"), wire("U1#7", "Cg#1")],
    200
);

runCase(
    "gain-50-res",
    [{ id: "Rg", type: "resistor", value: "1.2k", x: 200, y: -40 }],
    [wire("U1#0", "Rg#0"), wire("U1#7", "Rg#1")],
    50
);

console.log("lm386-tran.test.mjs : OK");
