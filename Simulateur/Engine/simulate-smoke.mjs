/**
 * Fumée : pile + R + voltmètre → ngspice + merge voltmètres.
 * node Simulateur/Engine/simulate-smoke.mjs
 */
import { buildNgspiceDeck } from "./spice-netlist-v2.mjs";
import { execFileSync } from "child_process";
import { writeFileSync, readFileSync, mkdtempSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { tmpdir } from "os";
import { mergeVoltmeterMeasurements } from "./v2/result-parser.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ng = join(__dirname, "..", "bin", "ngspice_con.exe");

const state = {
    components: [
        { id: "G", type: "ground", x: 0, y: 0, orient: 0 },
        { id: "V1", type: "vsource", x: 0, y: 0, value: "5V", orient: 0 },
        { id: "R1", type: "resistor", x: 0, y: 0, value: "1k", orient: 0 },
        { id: "VM1", type: "voltmeter", x: 0, y: 0, orient: 0 },
    ],
    wires: [
        { id: "w0", solid: true, fromKey: "G#0", toKey: "V1#1", points: [] },
        { id: "w1", solid: true, fromKey: "V1#0", toKey: "R1#0", points: [] },
        { id: "w2", solid: true, fromKey: "R1#1", toKey: "G#0", points: [] },
        { id: "w3", solid: true, fromKey: "VM1#0", toKey: "R1#0", points: [] },
        { id: "w4", solid: true, fromKey: "VM1#1", toKey: "G#0", points: [] },
    ],
};

const built = await buildNgspiceDeck(state);
if (!built.ok) {
    console.error(built);
    process.exit(1);
}
if (!existsSync(ng)) {
    console.log("SKIP (pas de ngspice_con.exe)");
    process.exit(0);
}
const dir = mkdtempSync(join(tmpdir(), "smoke-"));
const cir = join(dir, "c.cir");
const logp = join(dir, "l.log");
writeFileSync(cir, built.netlist, "utf8");
try {
    execFileSync(ng, ["-b", "-o", logp, cir]);
} catch (e) {
    console.error("ngspice exit", e?.status);
}
const logText = readFileSync(logp, "utf8");
const vm = mergeVoltmeterMeasurements(logText, built.voltmeters, []);
const vm1 = vm.VM1;
const v = vm1 && typeof vm1 === "object" ? vm1.voltage : vm1;
console.log("netlist prefix:", JSON.stringify(built.netlist.slice(0, 120)));
console.log("VM1 merged:", vm1);
if (!Number.isFinite(v) || Math.abs(v - 5) > 0.01) {
    console.error("FAIL voltmètre attendu ~5 V");
    console.error(logText.slice(-800));
    process.exit(1);
}
console.log("simulate-smoke.mjs : OK");
