import assert from "node:assert/strict";
import { parseArduinoSketch } from "./arduino-sketch-parse.mjs";
import { appendArduinoUnoNetlist, UNO_PIN } from "./arduino-uno.mjs";
import { buildNgspiceDeck } from "./spice-netlist-v2.mjs";
import { execFileSync } from "child_process";
import { mkdtempSync, writeFileSync, readFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { tmpdir } from "os";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, "..", "..");
const ngspice = join(__dirname, "..", "bin", "ngspice_con.exe");

const toggleSketch = `
void setup() {
  pinMode(13, OUTPUT);
  pinMode(12, OUTPUT);
  pinMode(11, OUTPUT);
  pinMode(10, OUTPUT);
}
void loop() {
  digitalWrite(13, 1);
  digitalWrite(12, 0);
  digitalWrite(11, 0);
  digitalWrite(10, 1);
  delay(1000);
  digitalWrite(13, 0);
  digitalWrite(12, 0);
  digitalWrite(11, 0);
  digitalWrite(10, 0);
  delay(1000);
}`;

const parsed = parseArduinoSketch(toggleSketch);
assert.equal(parsed.pinPhases.length, 2);

const comp = { id: "UNO1", type: "arduino_uno", ...parsed };
const lines = [];
appendArduinoUnoNetlist(comp, (k) => k.replace("#", "_"), lines, (p, id) => `${p}${id}`);

const d13 = lines.find((l) => /UNO1_D13.*PULSE/i.test(l));
const d12 = lines.find((l) => /UNO1_D12.*DC/i.test(l));
assert.ok(d13, `D13 PULSE attendu:\n${lines.join("\n")}`);
assert.match(d13, /PULSE\(0 5 0 1n 1n 1 2\)/);
assert.ok(d12, "D12 constant LOW → DC");
assert.match(d12, /DC 0/);

const state = {
    components: [
        { id: "UNO1", type: "arduino_uno", sketch: toggleSketch, ...parsed },
        { id: "CD4511_1", type: "cd4511" },
        { id: "GND1", type: "ground" },
    ],
    wires: [
        { solid: true, fromKey: `UNO1#${UNO_PIN.D13}`, toKey: "CD4511_1#0", points: [] },
        { solid: true, fromKey: `UNO1#${UNO_PIN.D12}`, toKey: "CD4511_1#1", points: [] },
        { solid: true, fromKey: `UNO1#${UNO_PIN.D11}`, toKey: "CD4511_1#2", points: [] },
        { solid: true, fromKey: `UNO1#${UNO_PIN.D10}`, toKey: "CD4511_1#3", points: [] },
        { solid: true, fromKey: "CD4511_1#4", toKey: "GND1#0", points: [] },
    ],
};

const built = await buildNgspiceDeck(state, { repoRoot, ngspiceExe: ngspice });
if (!built.ok) throw new Error(built.errors?.join(" "));
assert.match(built.netlist, /PULSE\(0 5 0 1n 1n 1 2\)/);

if (!existsSync(ngspice)) {
    console.log("SKIP ngspice run (binaire absent)");
    console.log("arduino-uno-phases-spice.test.mjs OK");
    process.exit(0);
}

const dir = mkdtempSync(join(tmpdir(), "uno-phases-"));
const logPath = join(dir, "log.txt");
writeFileSync(join(dir, "circuit.cir"), built.netlist);
let log = "";
try {
    execFileSync(ngspice, ["-b", "-o", logPath, "circuit.cir"], { cwd: dir, timeout: 120000 });
    log = readFileSync(logPath, "utf8");
} catch (err) {
    log = readFileSync(logPath, "utf8");
    if (/non-increasing|does not match any time point/i.test(log)) {
        throw new Error(`ngspice PWL error:\n${log}`);
    }
    throw err;
}
assert.ok(!/non-increasing|does not match any time point/i.test(log), log);
console.log("arduino-uno-phases-spice.test.mjs OK");
