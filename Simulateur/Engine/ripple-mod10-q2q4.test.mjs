/**
 * Compteur ripple mod-10 : AND(Q2,Q4) → R, S à 0, chaînage /Q.
 * node Simulateur/Engine/ripple-mod10-q2q4.test.mjs
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

function buildState(andA, andB) {
    return {
        components: [
            { id: "GImp1", type: "vpulse", value: "5V 2Hz 50%" },
            { id: "GND1", type: "ground" },
            { id: "V0", type: "logic_state", value: "0", logicRail: 5 },
            { id: "AND1", type: "logic_and" },
            ...[1, 2, 3, 4].map((i) => ({ id: `DFF${i}`, type: "logic_dff" })),
        ],
        wires: [
            w("GND1#0", "GImp1#1"),
            w("GImp1#0", "DFF1#1"),
            w(andA, "AND1#0"),
            w(andB, "AND1#1"),
            ...[1, 2, 3, 4].flatMap((i) => [
                w(`DFF${i}#0`, `DFF${i}#3`),
                w("V0#0", `DFF${i}#4`),
                w("AND1#2", `DFF${i}#5`),
            ]),
            w("DFF1#3", "DFF2#1"),
            w("DFF2#3", "DFF3#1"),
            w("DFF3#3", "DFF4#1"),
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

async function runCounts(andA, andB) {
    const built = await buildNgspiceDeck(buildState(andA, andB), {
        repoRoot,
        ngspiceExe: ngspice,
        forceXspiceDff: true,
    });
    if (!built.ok) throw new Error(built.errors?.join(" "));
    const dir = mkdtempSync(join(tmpdir(), "mod10-"));
    const wave = join(dir, "wave.dat").replace(/\\/g, "/");
    writeFileSync(join(dir, "circuit.cir"), built.netlist.split("__TRAN_WAVE_PATH__").join(wave));
    execFileSync(ngspice, ["-b", "-o", "ng.log", "circuit.cir"], { cwd: dir });
    const rows = readFileSync(wave, "utf8")
        .split(/\r?\n/)
        .filter((l) => l.trim() && !l.startsWith("*"))
        .map((l) => l.trim().split(/\s+/).map(Number).filter(Number.isFinite));
    const qMeta = (built.logicGatesTranMeta || [])
        .filter((m) => /^DFF\d+_Q$/.test(m.id))
        .sort((a, b) => parseInt(a.id.match(/\d+/)?.[0] || "0", 10) - parseInt(b.id.match(/\d+/)?.[0] || "0", 10));
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
    return seen;
}

const ok = await runCounts("DFF2#2", "DFF4#2");
if (!ok.has(0) || !ok.has(9) || ok.size < 10) {
    throw new Error(`Q2+Q4 : attendu 0…9, vu ${[...ok].sort((a, b) => a - b).join(", ")}`);
}

const bad = await runCounts("DFF1#2", "DFF4#2");
if (bad.has(0) && bad.has(9) && bad.size >= 10) {
    throw new Error("Q1+Q4 : devrait empêcher la décade complète");
}

const builtWarn = await buildNgspiceDeck(buildState("DFF1#2", "DFF4#2"), {
    repoRoot,
    ngspiceExe: ngspice,
    forceXspiceDff: true,
});
if (!builtWarn.warnings?.some((w) => /DFF1 et DFF4/.test(w))) {
    throw new Error("avertissement Q1+Q4 manquant");
}

console.log("ripple-mod10-q2q4.test.mjs : OK");
