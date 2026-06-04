/**
 * 74HC90 en mode décade : CP0 horloge, Q0 → CP1, comptage 0…9.
 * node Simulateur/Engine/ic74hc90-decade.test.mjs
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
        { id: "GImp1", type: "vpulse", value: "5V 2Hz 50%" },
        { id: "GND1", type: "ground" },
        { id: "VCC1", type: "logic_state", value: "1", logicRail: 5 },
        { id: "VMR1", type: "logic_state", value: "0", logicRail: 5 },
        { id: "VMR2", type: "logic_state", value: "0", logicRail: 5 },
        { id: "VMS1", type: "logic_state", value: "0", logicRail: 5 },
        { id: "VMS2", type: "logic_state", value: "0", logicRail: 5 },
        { id: "U1", type: "ic_74hc90" },
    ],
    wires: [
        { solid: true, fromKey: "GND1#0", toKey: "GImp1#1", points: [] },
        { solid: true, fromKey: "GImp1#0", toKey: `U1#${IC90_PIN.CP0}`, points: [] },
        { solid: true, fromKey: "VCC1#0", toKey: `U1#${IC90_PIN.VCC}`, points: [] },
        { solid: true, fromKey: "GND1#0", toKey: `U1#${IC90_PIN.GND}`, points: [] },
        { solid: true, fromKey: "VMR1#0", toKey: `U1#${IC90_PIN.MR1}`, points: [] },
        { solid: true, fromKey: "VMR2#0", toKey: `U1#${IC90_PIN.MR2}`, points: [] },
        { solid: true, fromKey: "VMS1#0", toKey: `U1#${IC90_PIN.MS1}`, points: [] },
        { solid: true, fromKey: "VMS2#0", toKey: `U1#${IC90_PIN.MS2}`, points: [] },
        { solid: true, fromKey: `U1#${IC90_PIN.Q0}`, toKey: `U1#${IC90_PIN.CP1}`, points: [] },
    ],
};

const built = await buildNgspiceDeck(state, {
    repoRoot,
    ngspiceExe: ngspice,
    forceXspiceDff: true,
});
if (!built.ok) throw new Error(built.errors?.join(" "));

const dir = mkdtempSync(join(tmpdir(), "hc90-"));
const wave = join(dir, "wave.dat").replace(/\\/g, "/");
writeFileSync(join(dir, "circuit.cir"), built.netlist.split("__TRAN_WAVE_PATH__").join(wave));
execFileSync(ngspice, ["-b", "-o", "log", "circuit.cir"], { cwd: dir });

const rows = readFileSync(wave, "utf8")
    .split(/\r?\n/)
    .filter((l) => l.trim() && !l.startsWith("*"))
    .map((l) => l.trim().split(/\s+/).map(Number).filter(Number.isFinite));

const qMeta = (built.logicGatesTranMeta || [])
    .filter((m) => /^U1_Q\d$/.test(m.id))
    .sort((a, b) => parseInt(a.id.replace("U1_Q", ""), 10) - parseInt(b.id.replace("U1_Q", ""), 10));

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
const seen = new Set();
for (let pulse = 1; pulse <= 18; pulse++) {
    const n = sampleAt((pulse - 1) * 0.5 + 0.49);
    seen.add(n);
    const expect = pulse % 10;
    if (n !== expect) fails++;
}
if (fails > 0) throw new Error(`${fails} échantillon(s) hors séquence décade 0…9`);
if (!seen.has(0)) throw new Error("État 0 jamais atteint");

console.log("ic74hc90-decade.test.mjs : OK — états vus", [...seen].sort((a, b) => a - b).join(", "));
