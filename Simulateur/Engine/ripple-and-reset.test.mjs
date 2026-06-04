/**
 * Compteur ripple + reset AND(Q3,Q4) — reproduit remise à 0 partielle (ex. 4).
 * node Simulateur/Engine/ripple-and-reset.test.mjs
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

function buildRippleWires(withReset) {
    const wires = [
        { solid: true, fromKey: "GND1#0", toKey: "GImp1#1", points: [] },
        { solid: true, fromKey: "GImp1#0", toKey: "DFF1#1", points: [] },
    ];
    for (let i = 1; i <= 4; i++) {
        wires.push({ solid: true, fromKey: `DFF${i}#0`, toKey: `DFF${i}#3`, points: [] });
        if (i < 4) {
            wires.push({ solid: true, fromKey: `DFF${i}#3`, toKey: `DFF${i + 1}#1`, points: [] });
        }
    }
    if (withReset) {
        wires.push({ solid: true, fromKey: "DFF3#2", toKey: "AND1#0", points: [] });
        wires.push({ solid: true, fromKey: "DFF4#2", toKey: "AND1#1", points: [] });
        for (let i = 1; i <= 4; i++) {
            wires.push({ solid: true, fromKey: "AND1#2", toKey: `DFF${i}#5`, points: [] });
        }
    }
    return wires;
}

function decodeCount(row, qMeta) {
    let n = 0;
    for (let i = 0; i < qMeta.length; i++) {
        if (row[(qMeta[i].wrIndex ?? 0) + 1] > 2.5) n |= 1 << i;
    }
    return n;
}

async function runSim(label, withReset) {
    const components = [
        { id: "GImp1", type: "vpulse", value: "5V 2Hz 50%" },
        { id: "GND1", type: "ground" },
        ...[1, 2, 3, 4].map((i) => ({ id: `DFF${i}`, type: "logic_dff" })),
    ];
    if (withReset) components.push({ id: "AND1", type: "logic_and" });
    const built = await buildNgspiceDeck(
        { components, wires: buildRippleWires(withReset) },
        { repoRoot, ngspiceExe: ngspice, forceXspiceDff: true }
    );
    if (!built.ok) throw new Error(built.errors?.join(" "));
    const dir = mkdtempSync(join(tmpdir(), "rst-"));
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
    const counts = new Set(rows.map((r) => decodeCount(r, qMeta)));
    console.log(`${label} — valeurs distinctes :`, [...counts].sort((a, b) => a - b).join(", "));
    return { rows, qMeta };
}

const base = await runSim("Sans reset", false);
const rst = await runSim("AND(Q3,Q4) → R", true);

let after12 = [];
for (const row of rst.rows) {
    const n = decodeCount(row, rst.qMeta);
    if (n === 12) {
        const idx = rst.rows.indexOf(row);
        for (let j = idx; j < Math.min(idx + 20, rst.rows.length); j++) {
            after12.push(decodeCount(rst.rows[j], rst.qMeta));
        }
        break;
    }
}
if (after12.length) {
    console.log("Échantillons après passage à 12 :", after12.slice(0, 12).join(" → "));
    const stuck4 = after12.includes(4) && !after12.includes(0);
    if (stuck4) console.log("Reproduit : reset partiel → 4");
} else {
    console.log("Jamais atteint 12 (reset trop agressif ou compteur bloqué)");
}

const baseMax = Math.max(...[...new Set(base.rows.map((r) => decodeCount(r, base.qMeta)))]);
console.log(`Sans reset, max = ${baseMax}`);
