/**
 * Compteur ripple mod-10 + CD4511 (sources B) : décade 0…9 après reset au 10.
 * node Simulateur/Engine/ripple-mod10-cd4511.test.mjs
 */
import { buildNgspiceDeck } from "./spice-netlist-v2.mjs";
import { execFileSync } from "child_process";
import { mkdtempSync, writeFileSync, readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { tmpdir } from "os";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const ngspice = join(repoRoot, "Simulateur", "bin", "ngspice_con.exe");

function w(from, to) {
    return { solid: true, fromKey: from, toKey: to, points: [] };
}

function buildState() {
    return {
        components: [
            { id: "GImp1", type: "vpulse", value: "5V 2Hz 50%" },
            { id: "GND1", type: "ground" },
            { id: "V0", type: "logic_state", value: "0", logicRail: 5 },
            { id: "AND1", type: "logic_and" },
            ...[1, 2, 3, 4].map((i) => ({ id: `DFF${i}`, type: "logic_dff" })),
            { id: "CD1", type: "logic_cd4511" },
        ],
        wires: [
            w("GND1#0", "GImp1#1"),
            w("GImp1#0", "DFF1#1"),
            w("DFF2#2", "AND1#0"),
            w("DFF4#2", "AND1#1"),
            ...[1, 2, 3, 4].flatMap((i) => [
                w(`DFF${i}#0`, `DFF${i}#3`),
                w("V0#0", `DFF${i}#4`),
                w("AND1#2", `DFF${i}#5`),
            ]),
            w("DFF1#3", "DFF2#1"),
            w("DFF2#3", "DFF3#1"),
            w("DFF3#3", "DFF4#1"),
            w("DFF1#2", "CD1#0"),
            w("DFF2#2", "CD1#1"),
            w("DFF3#2", "CD1#2"),
            w("DFF4#2", "CD1#3"),
            w("V0#0", "CD1#4"),
        ],
    };
}

function decode(row, qMeta) {
    let n = 0;
    qMeta.forEach((m, i) => {
        if (row[(m.wrIndex ?? 0) + 1] > 2.5) n |= 1 << i;
    });
    return n;
}

const built = await buildNgspiceDeck(buildState(), {
    repoRoot,
    ngspiceExe: ngspice,
    forceXspiceDff: true,
    forceBsourceCd4511: true,
});
if (!built.ok) throw new Error(built.errors?.join(" "));
if (!built.netlist.includes("reset_delay=100e-9")) {
    throw new Error("rippleMod10 : reset_delay=100e-9 attendu dans la netlist");
}
const tranLine = built.netlist.match(/\.tran[^\n]+/);
if (!tranLine || !/\.tran\s+\S+\s+1[1-9]/.test(tranLine[0])) {
    throw new Error(`rippleMod10 : .tran trop court (${tranLine?.[0] || "?"})`);
}

const dir = mkdtempSync(join(tmpdir(), "mod10cd-"));
const wave = join(dir, "wave.dat").replace(/\\/g, "/");
writeFileSync(join(dir, "circuit.cir"), built.netlist.split("__TRAN_WAVE_PATH__").join(wave));
execFileSync(ngspice, ["-b", "-o", "ng.log", "circuit.cir"], { cwd: dir });

const rows = readFileSync(wave, "utf8")
    .split(/\r?\n/)
    .filter((l) => l.trim() && !l.startsWith("*"))
    .map((l) => l.trim().split(/\s+/).map(Number).filter(Number.isFinite));
const qMeta = (built.logicGatesTranMeta || [])
    .filter((m) => /^DFF\d+_Q$/.test(m.id))
    .sort(
        (a, b) =>
            parseInt(a.id.match(/\d+/)?.[0] || "0", 10) - parseInt(b.id.match(/\d+/)?.[0] || "0", 10)
    );

const seen = new Set();
for (let pulse = 1; pulse <= 20; pulse++) {
    const t = (pulse - 1) * 0.5 + 0.49;
    let best = rows[0];
    for (const row of rows) {
        if (row[0] <= t) best = row;
        else break;
    }
    seen.add(decode(best, qMeta));
}

if (!seen.has(0) || !seen.has(9) || seen.size < 10) {
    throw new Error(`CD4511 mod-10 : attendu 0…9, vu ${[...seen].sort((a, b) => a - b).join(", ")}`);
}

const afterNine = decode(
    (() => {
        const t = (9 - 1) * 0.5 + 0.49;
        let best = rows[0];
        for (const row of rows) {
            if (row[0] <= t) best = row;
            else break;
        }
        return best;
    })(),
    qMeta
);
if (afterNine !== 9) throw new Error(`après 9 impulsions : attendu 9, vu ${afterNine}`);

const atTen = decode(
    (() => {
        const t = (10 - 1) * 0.5 + 0.49;
        let best = rows[0];
        for (const row of rows) {
            if (row[0] <= t) best = row;
            else break;
        }
        return best;
    })(),
    qMeta
);
if (atTen !== 0) throw new Error(`rollover 9→0 : attendu 0 à l'impulsion 10, vu ${atTen}`);

console.log("ripple-mod10-cd4511.test.mjs : OK");
