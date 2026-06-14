/**
 * Arduino UNO D13 clignotant + LED (montage utilisateur).
 * node Simulateur/Engine/arduino-uno-led-blink.test.mjs
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

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, "..", "..");
const ngspice = join(__dirname, "..", "bin", "ngspice_con.exe");

const sketch = `void setup(){ pinMode(13, OUTPUT); }
void loop(){ digitalWrite(13,HIGH); delay(500); digitalWrite(13,LOW); delay(500); }`;
const parsed = parseArduinoSketch(sketch);

const state = {
    components: [
        {
            id: "UNO1",
            type: "arduino_uno",
            sketch,
            ...parsed,
        },
        { id: "R1", type: "resistor", value: "500" },
        { id: "LED1", type: "diode_led" },
        { id: "GND1", type: "ground" },
    ],
    wires: [
        { solid: true, fromKey: `UNO1#${UNO_PIN.D13}`, toKey: "R1#0", points: [] },
        { solid: true, fromKey: "R1#1", toKey: "LED1#0", points: [] },
        { solid: true, fromKey: "LED1#1", toKey: "GND1#0", points: [] },
    ],
};

const built = await buildNgspiceDeck(state, { repoRoot, ngspiceExe: ngspice });
if (!built.ok) throw new Error(built.errors?.join(" "));
assert.equal(built.analysisTran, true, "analyse .tran requise pour clignotement Arduino");
assert.match(built.netlist, /PULSE\(0 5 0 1n 1n/i, "D13 doit être une source PULSE");

if (!existsSync(ngspice)) {
    console.log("SKIP ngspice (binaire absent)");
    process.exit(0);
}

const dir = mkdtempSync(join(tmpdir(), "uno-led-"));
const wave = join(dir, "wave.dat").replace(/\\/g, "/");
writeFileSync(join(dir, "circuit.cir"), built.netlist.split("__TRAN_WAVE_PATH__").join(wave));
execFileSync(ngspice, ["-b", "-o", "log", "circuit.cir"], { cwd: dir, timeout: 120000 });

const rows = readFileSync(wave, "utf8")
    .split(/\r?\n/)
    .filter((l) => l.trim() && !l.startsWith("*"))
    .map((l) => l.trim().split(/\s+/).map(Number))
    .filter((r) => r.length > 1 && Number.isFinite(r[0]));

assert.ok(rows.length > 20, "courbes .tran attendues");
const ledMeta = built.ledsTranMeta?.[0];
assert.ok(ledMeta?.currentWrIndex != null, "métadonnées courant LED");
const iCol = ledMeta.currentWrIndex;
const currents = rows.map((r) => r[iCol]).filter((i) => Number.isFinite(i));
const maxI = Math.max(...currents.map(Math.abs));
assert.ok(maxI > 1e-4, `courant LED max attendu > 0.1 mA, obtenu ${maxI}`);
console.log("arduino-uno-led-blink.test.mjs OK");
