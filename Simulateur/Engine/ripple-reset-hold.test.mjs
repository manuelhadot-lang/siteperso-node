/**
 * Reset maintenu : OR( AND(Q3,Q4), AND(¬tous_0, reset_hold) ) → R des bascules.
 * node Simulateur/Engine/ripple-reset-hold.test.mjs
 */
import { buildNgspiceDeck } from "./spice-netlist-v2.mjs";
import { execFileSync } from "child_process";
import { mkdtempSync, writeFileSync, readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { tmpdir } from "os";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, "..", "..");
const ngspice = join(__dirname, "..", "bin", "ngspice_con.exe");

function w(from, to) {
    return { solid: true, fromKey: from, toKey: to, points: [] };
}

function buildWires() {
    const wires = [
        w("GND1#0", "GImp1#1"),
        w("GImp1#0", "DFF1#1"),
    ];
    for (let i = 1; i <= 4; i++) {
        wires.push(w(`DFF${i}#0`, `DFF${i}#3`));
        if (i < 4) wires.push(w(`DFF${i}#3`, `DFF${i + 1}#1`));
        wires.push(w(`DFF${i}#2`, `NOT${i}#0`));
    }
    wires.push(
        w("DFF3#2", "AND12#0"),
        w("DFF4#2", "AND12#1"),
        w("NOT1#1", "AND01a#0"),
        w("NOT2#1", "AND01a#1"),
        w("NOT3#1", "AND23a#0"),
        w("NOT4#1", "AND23a#1"),
        w("AND01a#2", "AND0#0"),
        w("AND23a#2", "AND0#1"),
        w("AND12#2", "NAND1#0"),
        w("NAND2#1", "NAND1#1"),
        w("AND0#2", "NAND2#0"),
        w("NAND1#2", "NAND2#1"),
        w("NAND1#2", "NOTR#0")
    );
    for (let i = 1; i <= 4; i++) wires.push(w("NOTR#1", `DFF${i}#5`));
    return wires;
}

const components = [
    { id: "GImp1", type: "vpulse", value: "5V 2Hz 50%" },
    { id: "GND1", type: "ground" },
    ...[1, 2, 3, 4].map((i) => ({ id: `DFF${i}`, type: "logic_dff" })),
    ...[1, 2, 3, 4].map((i) => ({ id: `NOT${i}`, type: "logic_not" })),
    { id: "AND12", type: "logic_and" },
    { id: "AND01a", type: "logic_and" },
    { id: "AND23a", type: "logic_and" },
    { id: "AND0", type: "logic_and" },
    { id: "NAND1", type: "logic_nand" },
    { id: "NAND2", type: "logic_nand" },
    { id: "NOTR", type: "logic_not" },
];

const built = await buildNgspiceDeck(
    { components, wires: buildWires() },
    { repoRoot, ngspiceExe: ngspice, forceXspiceDff: true }
);
if (!built.ok) throw new Error(built.errors?.join(" "));

const dir = mkdtempSync(join(tmpdir(), "rst-hold-"));
const wave = join(dir, "wave.dat").replace(/\\/g, "/");
writeFileSync(join(dir, "circuit.cir"), built.netlist.split("__TRAN_WAVE_PATH__").join(wave));
execFileSync(ngspice, ["-b", "-o", "log", "circuit.cir"], { cwd: dir });

const rows = readFileSync(wave, "utf8")
    .split(/\r?\n/)
    .filter((l) => l.trim() && !l.startsWith("*"))
    .map((l) => l.trim().split(/\s+/).map(Number).filter(Number.isFinite));
const qMeta = (built.logicGatesTranMeta || [])
    .filter((m) => /^DFF\d+_Q$/.test(m.id))
    .sort((a, b) => parseInt(a.id.match(/\d+/)?.[0] || "0", 10) - parseInt(b.id.match(/\d+/)?.[0] || "0", 10));

function decode(row) {
    let n = 0;
    qMeta.forEach((m, i) => {
        if (row[(m.wrIndex ?? 0) + 1] > 2.5) n |= 1 << i;
    });
    return n;
}

const counts = new Set(rows.map(decode));
const stable = [...counts].filter((n) => n <= 11);
console.log("Valeurs observées :", [...counts].sort((a, b) => a - b).join(", "));

let afterWrap = [];
for (let i = 1; i < rows.length; i++) {
    const prev = decode(rows[i - 1]);
    const cur = decode(rows[i]);
    if (prev === 11 && cur <= 1) {
        for (let j = i; j < Math.min(i + 12, rows.length); j++) afterWrap.push(decode(rows[j]));
        break;
    }
}
console.log("Max stable ≤ 11 :", Math.max(...stable));
console.log("Après 11 → … :", afterWrap.length ? afterWrap.join(" → ") : "(non capturé)");
if (afterWrap.includes(4) || afterWrap.includes(8)) {
    throw new Error("Reset partiel (4 ou 8)");
}
if (afterWrap.length && !afterWrap.includes(0)) throw new Error("Pas de retour à 0");
if (Math.max(...counts) > 11) throw new Error("Dépasse 11");
console.log("ripple-reset-hold.test.mjs : OK");
