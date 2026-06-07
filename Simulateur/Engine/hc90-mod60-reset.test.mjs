/**
 * Reset mod-60 : AND(Q1,Q2) dizaines → MR1+MR2 — doit repartir à 0, pas 4.
 * node Simulateur/Engine/hc90-mod60-reset.test.mjs
 */
import { join } from "path";
import { fileURLToPath } from "url";
import { buildNgspiceDeck } from "./spice-netlist-v2.mjs";
import { IC90_PIN } from "./logic-74hc90.mjs";
import { execFileSync } from "child_process";
import { mkdtempSync, writeFileSync, readFileSync } from "fs";
import { tmpdir } from "os";

const repoRoot = join(fileURLToPath(new URL(".", import.meta.url)), "../..");
const ngspice = join(repoRoot, "Simulateur/bin/ngspice_con.exe");

const state = {
    components: [
        { id: "GImp1", type: "vpulse", value: "5V 10Hz 50%" },
        { id: "GND1", type: "ground" },
        { id: "VCC1", type: "logic_state", value: "1", logicRail: 5 },
        { id: "VMS1", type: "logic_state", value: "0", logicRail: 5 },
        { id: "VMS2", type: "logic_state", value: "0", logicRail: 5 },
        { id: "U90T", type: "ic_74hc90" },
        { id: "AND60", type: "logic_and" },
    ],
    wires: [
        { solid: true, fromKey: "GND1#0", toKey: "GImp1#1", points: [] },
        { solid: true, fromKey: "GImp1#0", toKey: `U90T#${IC90_PIN.CP0}`, points: [] },
        { solid: true, fromKey: "VCC1#0", toKey: `U90T#${IC90_PIN.VCC}`, points: [] },
        { solid: true, fromKey: "GND1#0", toKey: `U90T#${IC90_PIN.GND}`, points: [] },
        { solid: true, fromKey: "VMS1#0", toKey: `U90T#${IC90_PIN.MS1}`, points: [] },
        { solid: true, fromKey: "VMS2#0", toKey: `U90T#${IC90_PIN.MS2}`, points: [] },
        { solid: true, fromKey: `U90T#${IC90_PIN.Q0}`, toKey: `U90T#${IC90_PIN.CP1}`, points: [] },
        { solid: true, fromKey: `U90T#${IC90_PIN.Q1}`, toKey: "AND60#0", points: [] },
        { solid: true, fromKey: `U90T#${IC90_PIN.Q2}`, toKey: "AND60#1", points: [] },
        { solid: true, fromKey: "AND60#2", toKey: `U90T#${IC90_PIN.MR1}`, points: [] },
        { solid: true, fromKey: "AND60#2", toKey: `U90T#${IC90_PIN.MR2}`, points: [] },
    ],
};

const built = await buildNgspiceDeck(state, {
    repoRoot,
    ngspiceExe: ngspice,
    forceXspiceJk: true,
});
if (!built.ok) throw new Error(built.errors?.join(" "));

const dir = mkdtempSync(join(tmpdir(), "mod60-"));
const wave = join(dir, "w.dat").replace(/\\/g, "/");
writeFileSync(join(dir, "c.cir"), built.netlist.split("__TRAN_WAVE_PATH__").join(wave));
execFileSync(ngspice, ["-b", "-o", "log", "c.cir"], { cwd: dir, timeout: 120000 });

const rows = readFileSync(wave, "utf8")
    .split(/\r?\n/)
    .filter((l) => l.trim() && !l.startsWith("*"))
    .map((l) => l.trim().split(/\s+/).map(Number).filter(Number.isFinite));

const qMeta = (built.logicGatesTranMeta || [])
    .filter((m) => /^U90T_Q\d$/.test(m.id))
    .sort((a, b) => +a.id.slice(-1) - +b.id.slice(-1));

function decode(row) {
    let n = 0;
    qMeta.forEach((m, i) => { if (row[(m.wrIndex ?? 0) + 1] > 2.5) n |= 1 << i; });
    return n;
}

const seen = new Set();
let afterReset = [];
for (const row of rows) {
    const n = decode(row);
    seen.add(n);
    if (n === 6) afterReset.push(decode(row));
}
// Après passage à 6, échantillonner les 5 prochains fronts
const samples = [];
let hit6 = false;
for (let i = 1; i < rows.length; i++) {
    const n = decode(rows[i]);
    if (n === 6) hit6 = true;
    if (hit6 && samples.length < 8) samples.push(n);
}

console.log("états distincts:", [...seen].sort((a, b) => a - b).join(","));
console.log("après détection 6 (8 échantillons):", samples.join(","));

if (samples.includes(4) && !samples.includes(0)) {
    throw new Error("repart de 4 au lieu de 0 après reset AND(Q1,Q2)→MR");
}
if (!seen.has(0)) throw new Error("état 0 jamais atteint");
console.log("hc90-mod60-reset.test.mjs : OK");
