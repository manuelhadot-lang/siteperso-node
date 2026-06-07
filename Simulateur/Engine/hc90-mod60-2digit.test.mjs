/**
 * Compteur 2 chiffres mod 60 : AND(Q1,Q2) dizaines → MR des deux HC90.
 * node Simulateur/Engine/hc90-mod60-2digit.test.mjs
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
        { id: "GImp1", type: "vpulse", value: "5V 5Hz 50%" },
        { id: "GND1", type: "ground" },
        { id: "VCC1", type: "logic_state", value: "1", logicRail: 5 },
        { id: "VMS1", type: "logic_state", value: "0", logicRail: 5 },
        { id: "VMS2", type: "logic_state", value: "0", logicRail: 5 },
        { id: "U90U", type: "ic_74hc90" },
        { id: "U90T", type: "ic_74hc90" },
        { id: "ANDC", type: "logic_and" },
        { id: "AND60", type: "logic_and" },
        { id: "NORU01", type: "logic_nor" },
        { id: "NORU23", type: "logic_nor" },
        { id: "ANDNR", type: "logic_and" },
        { id: "ANDRST", type: "logic_and" },
    ],
    wires: [
        { solid: true, fromKey: "GND1#0", toKey: "GImp1#1", points: [] },
        { solid: true, fromKey: "GImp1#0", toKey: `U90U#${IC90_PIN.CP0}`, points: [] },
        ...["U90U", "U90T"].flatMap((u) => [
            { solid: true, fromKey: "VCC1#0", toKey: `${u}#${IC90_PIN.VCC}`, points: [] },
            { solid: true, fromKey: "GND1#0", toKey: `${u}#${IC90_PIN.GND}`, points: [] },
            { solid: true, fromKey: "VMS1#0", toKey: `${u}#${IC90_PIN.MS1}`, points: [] },
            { solid: true, fromKey: "VMS2#0", toKey: `${u}#${IC90_PIN.MS2}`, points: [] },
            { solid: true, fromKey: `${u}#${IC90_PIN.Q0}`, toKey: `${u}#${IC90_PIN.CP1}`, points: [] },
        ]),
        { solid: true, fromKey: `U90U#${IC90_PIN.Q0}`, toKey: "ANDC#0", points: [] },
        { solid: true, fromKey: `U90U#${IC90_PIN.Q3}`, toKey: "ANDC#1", points: [] },
        { solid: true, fromKey: "ANDC#2", toKey: `U90T#${IC90_PIN.CP0}`, points: [] },
        { solid: true, fromKey: `U90T#${IC90_PIN.Q1}`, toKey: "AND60#0", points: [] },
        { solid: true, fromKey: `U90T#${IC90_PIN.Q2}`, toKey: "AND60#1", points: [] },
        { solid: true, fromKey: `U90U#${IC90_PIN.Q0}`, toKey: "NORU01#0", points: [] },
        { solid: true, fromKey: `U90U#${IC90_PIN.Q1}`, toKey: "NORU01#1", points: [] },
        { solid: true, fromKey: `U90U#${IC90_PIN.Q2}`, toKey: "NORU23#0", points: [] },
        { solid: true, fromKey: `U90U#${IC90_PIN.Q3}`, toKey: "NORU23#1", points: [] },
        { solid: true, fromKey: "NORU01#2", toKey: "ANDNR#0", points: [] },
        { solid: true, fromKey: "NORU23#2", toKey: "ANDNR#1", points: [] },
        { solid: true, fromKey: "AND60#2", toKey: "ANDRST#0", points: [] },
        { solid: true, fromKey: "ANDNR#2", toKey: "ANDRST#1", points: [] },
        { solid: true, fromKey: "GND1#0", toKey: `U90U#${IC90_PIN.MR1}`, points: [] },
        { solid: true, fromKey: "GND1#0", toKey: `U90U#${IC90_PIN.MR2}`, points: [] },
        { solid: true, fromKey: "ANDRST#2", toKey: `U90T#${IC90_PIN.MR1}`, points: [] },
        { solid: true, fromKey: "ANDRST#2", toKey: `U90T#${IC90_PIN.MR2}`, points: [] },
    ],
};

const built = await buildNgspiceDeck(state, {
    repoRoot,
    ngspiceExe: ngspice,
    forceXspiceJk: true,
});
if (!built.ok) throw new Error(built.errors?.join(" "));

const dir = mkdtempSync(join(tmpdir(), "mod602-"));
const wave = join(dir, "w.dat").replace(/\\/g, "/");
writeFileSync(join(dir, "c.cir"), built.netlist.split("__TRAN_WAVE_PATH__").join(wave));
execFileSync(ngspice, ["-b", "-o", "log", "c.cir"], { cwd: dir, timeout: 180000 });

const rows = readFileSync(wave, "utf8")
    .split(/\r?\n/)
    .filter((l) => l.trim() && !l.startsWith("*"))
    .map((l) => l.trim().split(/\s+/).map(Number).filter(Number.isFinite));

function decodeChip(chip, row) {
    const ms = (built.logicGatesTranMeta || [])
        .filter((m) => new RegExp(`^${chip}_Q\\d$`).test(m.id))
        .sort((a, b) => +a.id.slice(-1) - +b.id.slice(-1));
    let n = 0;
    ms.forEach((m, i) => { if (row[(m.wrIndex ?? 0) + 1] > 2.5) n |= 1 << i; });
    return n;
}

const tEnd = rows[rows.length - 1][0];
const display = [];
for (let t = 0.09; t < tEnd; t += 0.2) {
    let best = rows[0];
    for (const r of rows) { if (r[0] <= t) best = r; else break; }
    const u = decodeChip("U90U", best);
    const d = decodeChip("U90T", best);
    display.push(`${d}${u}`);
}
console.log("séquence (dizaines+unités) par 0.2s:", display.slice(0, 40).join(" "));

function qBits(chip, row) {
    const ms = (built.logicGatesTranMeta || [])
        .filter((m) => new RegExp(`^${chip}_Q\\d$`).test(m.id))
        .sort((a, b) => +a.id.slice(-1) - +b.id.slice(-1));
    return ms.map((m) => ((row[(m.wrIndex ?? 0) + 1] > 2.5) ? 1 : 0)).join("");
}

const idx59 = display.findIndex((s, i) => i > 0 && display[i - 1] === "59");
if (idx59 > 0) {
    for (let j = Math.max(0, idx59 - 2); j <= Math.min(display.length - 1, idx59 + 4); j++) {
        const t = 0.09 + j * 0.2;
        let best = rows[0];
        for (const r of rows) { if (r[0] <= t) best = r; else break; }
        console.log(
            `t=${t.toFixed(2)} aff=${display[j]} U=${qBits("U90U", best)} T=${qBits("U90T", best)}`
        );
    }
}

const after59 = display[idx59];
if (idx59 > 0 && after59 !== "00") {
    throw new Error(`après 59 → ${after59} (attendu 00)`);
}
console.log("hc90-mod60-2digit.test.mjs : OK");
