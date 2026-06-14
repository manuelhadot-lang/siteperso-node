/**
 * Arduino UNO → CD4511 BCD 0011 (affichage 3) + voltmètre sur D13.
 * node Simulateur/Engine/arduino-cd4511-bcd.test.mjs
 */
import assert from "node:assert/strict";
import { buildNgspiceDeck } from "./spice-netlist-v2.mjs";
import { UNO_PIN } from "./arduino-uno.mjs";
import { parseArduinoSketch } from "./arduino-sketch-parse.mjs";
import { execFileSync } from "child_process";
import { mkdtempSync, writeFileSync, readFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { tmpdir } from "os";
import { mergeVoltmeterMeasurements } from "./v2/result-parser.mjs";
import { mergeSeg7Measurements } from "./v2/result-parser.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, "..", "..");
const ngspice = join(__dirname, "..", "bin", "ngspice_con.exe");

const sketch = `void setup() {
  pinMode(13, OUTPUT);
  pinMode(12, OUTPUT);
  pinMode(11, OUTPUT);
  pinMode(10, OUTPUT);
}
void loop() {
  digitalWrite(13, 1);
  digitalWrite(12, 1);
  digitalWrite(11, 0);
  digitalWrite(10, 0);
  delay(1000);
}`;
const parsed = parseArduinoSketch(sketch);

const state = {
    components: [
        { id: "UNO1", type: "arduino_uno", sketch, ...parsed },
        { id: "CD4511_1", type: "logic_cd4511" },
        { id: "SEG1", type: "seg7" },
        { id: "V1", type: "voltmeter" },
        { id: "GND1", type: "ground" },
        { id: "GND2", type: "ground" },
        { id: "LOGIC_LE", type: "logic_state", value: "0", logicRail: 5 },
        { id: "LOGIC_BI", type: "logic_state", value: "1", logicRail: 5 },
        { id: "LOGIC_LT", type: "logic_state", value: "1", logicRail: 5 },
    ],
    wires: [
        { solid: true, fromKey: `UNO1#${UNO_PIN.D13}`, toKey: "CD4511_1#0", points: [] },
        { solid: true, fromKey: `UNO1#${UNO_PIN.D12}`, toKey: "CD4511_1#1", points: [] },
        { solid: true, fromKey: `UNO1#${UNO_PIN.D11}`, toKey: "CD4511_1#2", points: [] },
        { solid: true, fromKey: `UNO1#${UNO_PIN.D10}`, toKey: "CD4511_1#3", points: [] },
        { solid: true, fromKey: "LOGIC_LE#0", toKey: "CD4511_1#4", points: [] },
        { solid: true, fromKey: "LOGIC_BI#0", toKey: "CD4511_1#5", points: [] },
        { solid: true, fromKey: "LOGIC_LT#0", toKey: "CD4511_1#6", points: [] },
        { solid: true, fromKey: "CD4511_1#7", toKey: "SEG1#0", points: [] },
        { solid: true, fromKey: "CD4511_1#8", toKey: "SEG1#1", points: [] },
        { solid: true, fromKey: "CD4511_1#9", toKey: "SEG1#2", points: [] },
        { solid: true, fromKey: "CD4511_1#10", toKey: "SEG1#3", points: [] },
        { solid: true, fromKey: "CD4511_1#11", toKey: "SEG1#4", points: [] },
        { solid: true, fromKey: "CD4511_1#12", toKey: "SEG1#5", points: [] },
        { solid: true, fromKey: "CD4511_1#13", toKey: "SEG1#6", points: [] },
        { solid: true, fromKey: "SEG1#7", toKey: "GND1#0", points: [] },
        { solid: true, fromKey: "V1#1", toKey: `UNO1#${UNO_PIN.D13}`, points: [] },
        { solid: true, fromKey: "V1#0", toKey: "GND2#0", points: [] },
    ],
};

const built = await buildNgspiceDeck(state, { repoRoot, ngspiceExe: ngspice });
if (!built.ok) {
    console.error("BUILD FAILED:", built.errors);
    process.exit(1);
}
assert.match(built.netlist, /VUNO1_D13.*DC 5/i, "D13 doit être à 5 V");
console.log("netlist OK, analysisTran:", built.analysisTran);

if (!existsSync(ngspice)) {
    console.log("SKIP ngspice run");
    process.exit(0);
}

const dir = mkdtempSync(join(tmpdir(), "uno-cd4511-"));
const logp = join(dir, "log.txt");
writeFileSync(join(dir, "circuit.cir"), built.netlist);
try {
    execFileSync(ngspice, ["-b", "-o", logp, "circuit.cir"], { cwd: dir, timeout: 180000 });
} catch (e) {
    console.error("ngspice exit", e?.status);
}
const log = readFileSync(logp, "utf8");
const vm = mergeVoltmeterMeasurements(log, built.voltmeters, []);
console.log("V1:", vm.V1);
const v = vm.V1?.voltage ?? vm.V1;
assert.ok(Number.isFinite(v) && v > 4, `voltmètre D13 attendu ~5 V, obtenu ${v}`);
console.log("arduino-cd4511-bcd.test.mjs OK");
