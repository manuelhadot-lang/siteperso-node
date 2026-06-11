/**
 * 74HC90 décade + LED sur Q0…Q3 (montage utilisateur).
 * node Simulateur/Engine/ic74hc90-decade-led.test.mjs
 */
import { buildNgspiceDeck } from "./spice-netlist-v2.mjs";
import { IC90_PIN } from "./logic-74hc90.mjs";
import { execFileSync } from "child_process";
import { mkdtempSync, writeFileSync, readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { tmpdir } from "os";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, "..", "..");
const ngspice = join(__dirname, "..", "bin", "ngspice_con.exe");

const state = {
    components: [
        { id: "GImp_3", type: "vpulse", value: "5V 2Hz 50%" },
        { id: "GND1", type: "ground" },
        { id: "GND2", type: "ground" },
        { id: "GND3", type: "ground" },
        { id: "GND4", type: "ground" },
        { id: "GND5", type: "ground" },
        { id: "GND6", type: "ground" },
        { id: "VCC1", type: "logic_state", value: "1", logicRail: 5 },
        { id: "VMR1", type: "logic_state", value: "0", logicRail: 5 },
        { id: "VMR2", type: "logic_state", value: "0", logicRail: 5 },
        { id: "VMS1", type: "logic_state", value: "0", logicRail: 5 },
        { id: "VMS2", type: "logic_state", value: "0", logicRail: 5 },
        { id: "HC90_1", type: "ic_74hc90" },
        { id: "R_1", type: "resistor", value: "500" },
        { id: "R_2", type: "resistor", value: "500" },
        { id: "R_3", type: "resistor", value: "500" },
        { id: "R_4", type: "resistor", value: "500" },
        { id: "LED_1", type: "diode_led" },
        { id: "LED_2", type: "diode_led" },
        { id: "LED_3", type: "diode_led" },
        { id: "LED_4", type: "diode_led" },
    ],
    wires: [
        { solid: true, fromKey: "GND1#0", toKey: "GImp_3#1", points: [] },
        { solid: true, fromKey: "GImp_3#0", toKey: `HC90_1#${IC90_PIN.CP0}`, points: [] },
        { solid: true, fromKey: "VCC1#0", toKey: `HC90_1#${IC90_PIN.VCC}`, points: [] },
        { solid: true, fromKey: "GND2#0", toKey: `HC90_1#${IC90_PIN.GND}`, points: [] },
        { solid: true, fromKey: "VMR1#0", toKey: `HC90_1#${IC90_PIN.MR1}`, points: [] },
        { solid: true, fromKey: "VMR2#0", toKey: `HC90_1#${IC90_PIN.MR2}`, points: [] },
        { solid: true, fromKey: "VMS1#0", toKey: `HC90_1#${IC90_PIN.MS1}`, points: [] },
        { solid: true, fromKey: "VMS2#0", toKey: `HC90_1#${IC90_PIN.MS2}`, points: [] },
        { solid: true, fromKey: `HC90_1#${IC90_PIN.Q0}`, toKey: `HC90_1#${IC90_PIN.CP1}`, points: [] },
        { solid: true, fromKey: `HC90_1#${IC90_PIN.Q0}`, toKey: "R_1#0", points: [] },
        { solid: true, fromKey: "R_1#1", toKey: "LED_1#0", points: [] },
        { solid: true, fromKey: "LED_1#1", toKey: "GND3#0", points: [] },
        { solid: true, fromKey: `HC90_1#${IC90_PIN.Q1}`, toKey: "R_2#0", points: [] },
        { solid: true, fromKey: "R_2#1", toKey: "LED_2#0", points: [] },
        { solid: true, fromKey: "LED_2#1", toKey: "GND4#0", points: [] },
        { solid: true, fromKey: `HC90_1#${IC90_PIN.Q2}`, toKey: "R_3#0", points: [] },
        { solid: true, fromKey: "R_3#1", toKey: "LED_3#0", points: [] },
        { solid: true, fromKey: "LED_3#1", toKey: "GND5#0", points: [] },
        { solid: true, fromKey: `HC90_1#${IC90_PIN.Q3}`, toKey: "R_4#0", points: [] },
        { solid: true, fromKey: "R_4#1", toKey: "LED_4#0", points: [] },
        { solid: true, fromKey: "LED_4#1", toKey: "GND6#0", points: [] },
    ],
};

const built = await buildNgspiceDeck(state, {
    repoRoot,
    ngspiceExe: ngspice,
    forceXspiceDff: true,
});
if (!built.ok) throw new Error(built.errors?.join(" "));

const dir = mkdtempSync(join(tmpdir(), "hc90-led-"));
const wave = join(dir, "wave.dat").replace(/\\/g, "/");
writeFileSync(join(dir, "circuit.cir"), built.netlist.split("__TRAN_WAVE_PATH__").join(wave));
execFileSync(ngspice, ["-b", "-o", "log", "circuit.cir"], { cwd: dir, timeout: 120000 });

const rows = readFileSync(wave, "utf8")
    .split(/\r?\n/)
    .filter((l) => l.trim() && !l.startsWith("*"))
    .map((l) => l.trim().split(/\s+/).map(Number).filter(Number.isFinite));

const qMeta = (built.logicGatesTranMeta || [])
    .filter((m) => /^HC90_1_Q\d$/.test(m.id))
    .sort((a, b) => parseInt(a.id.replace("HC90_1_Q", ""), 10) - parseInt(b.id.replace("HC90_1_Q", ""), 10));

function decode(row) {
    let n = 0;
    qMeta.forEach((m, i) => {
        if (row[(m.wrIndex ?? 0) + 1] > 2.5) n |= 1 << i;
    });
    return n;
}

function sampleAt(tTarget) {
    let best = rows[0];
    for (const row of rows) {
        if (row[0] <= tTarget) best = row;
        else break;
    }
    return decode(best);
}

let fails = 0;
const bad = [];
const tEnd = rows[rows.length - 1][0];
for (let pulse = 1; pulse <= 25; pulse++) {
    const t = (pulse - 1) * 0.5 + 0.49;
    if (t >= tEnd) break;
    const n = sampleAt(t);
    const expect = pulse % 10;
    if (n !== expect) {
        fails++;
        bad.push({ pulse, expect, got: n });
    }
}
if (fails > 0) {
    throw new Error(`${fails} échantillon(s) faux (tstop=${tEnd}) : ${JSON.stringify(bad)}`);
}

console.log("ic74hc90-decade-led.test.mjs : OK — décade 0…9 avec LED, tstop=" + tEnd);
