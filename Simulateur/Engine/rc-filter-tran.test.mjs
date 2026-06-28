/**
 * Filtres RC passe-bas / passe-haut : .tran ngspice + courbes oscilloscope.
 * node Simulateur/Engine/rc-filter-tran.test.mjs
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

function baseComponents(capValue) {
    return [
        { id: "Sin1", type: "vsin", value: "5V 1kHz 0V", x: 0, y: 0 },
        { id: "R1", type: "resistor", value: "1k", x: 100, y: 0 },
        { id: "C1", type: "capacitor", value: capValue, x: 200, y: 0 },
        { id: "GND1", type: "ground", x: 200, y: 80 },
        {
            id: "Osci1",
            type: "oscilloscope",
            x: 320,
            y: 0,
            timeDivSec: 0.00005,
            ch1VoltsPerDiv: 2,
            ch2VoltsPerDiv: 2,
        },
    ];
}

function runCase(name, capValue, filterWires, minPeak) {
    const state = {
        components: baseComponents(capValue),
        wires: [
            wire("Sin1#0", "GND1#0"),
            wire("Osci1#2", "GND1#0"),
            wire("Sin1#1", "Osci1#1"),
            ...filterWires,
        ],
    };
    const built = buildNetlistFromGraphicalState(state);
    if (!built.ok) throw new Error(`${name}: build failed — ${(built.errors || []).join("; ")}`);
    const tranLine = built.netlist.match(/\.tran\s+(\S+)\s+(\S+)/);
    if (!tranLine) throw new Error(`${name}: .tran manquant`);
    const tstopStr = tranLine[2];
    const tmp = mkdtempSync(join(tmpdir(), "rc-tran-"));
    const deck = built.netlist.replace("__TRAN_WAVE_PATH__", "tran_waves.txt");
    writeFileSync(join(tmp, "circuit.cir"), deck);
    execFileSync(ngspice, ["-b", "-o", "ng.log", "circuit.cir"], { cwd: tmp, stdio: "pipe" });
    const waveTxt = readFileSync(join(tmp, "tran_waves.txt"), "utf8");
    const plots = mergeScopePlotsFromTranWrdata(waveTxt, built.scopesTranMeta);
    const p = plots.Osci1;
    if (!p?.ch1?.voltage?.length) throw new Error(`${name}: CH1 vide (tstop=${tstopStr})`);
    const tailStart = Math.floor(p.ch1.voltage.length * 0.7);
    let peak1 = 0;
    let peak2 = 0;
    let tLast = 0;
    for (let i = tailStart; i < p.ch1.voltage.length; i++) {
        peak1 = Math.max(peak1, Math.abs(p.ch1.voltage[i]));
        tLast = p.ch1.time[i];
    }
    for (const v of p.ch2.voltage) peak2 = Math.max(peak2, Math.abs(v));
    console.log(`${name}: tstop=${tstopStr} tLast=${tLast.toFixed(4)}s CH1=${peak1.toFixed(2)}V CH2=${peak2.toFixed(2)}V`);
    if (peak2 < 2) throw new Error(`${name}: entrée Sin trop faible`);
    if (peak1 < minPeak) throw new Error(`${name}: sortie filtre trop faible (${peak1}V)`);
    return { peak1, peak2, tstopStr };
}

// fc ≈ 1,6 kHz — à 1 kHz le passe-bas laisse passer (~4 V).
runCase(
    "LP-100n",
    "100n",
    [
        wire("Sin1#1", "R1#0"),
        wire("R1#1", "C1#0"),
        wire("R1#1", "Osci1#0"),
        wire("C1#1", "GND1#0"),
    ],
    3.5
);

// fc ≈ 159 Hz — à 1 kHz le passe-haut laisse passer (~5 V).
runCase(
    "HP-1u",
    "1u",
    [
        wire("Sin1#1", "C1#0"),
        wire("C1#1", "R1#0"),
        wire("C1#1", "Osci1#0"),
        wire("R1#1", "GND1#0"),
    ],
    4
);

console.log("rc-filter-tran.test.mjs : OK");
