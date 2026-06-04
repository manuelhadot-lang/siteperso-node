/**
 * Compteur ripple 4 bits : D ou JK, passage 11 → 12 inclus.
 * node Simulateur/Engine/ripple-11-12.test.mjs
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

function buildCounterState(numFf = 4, ffType = "logic_dff") {
    const prefix = ffType === "logic_jk" ? "JKFF" : "DFF";
    const components = [
        { id: "GImp1", type: "vpulse", value: "5V 1Hz 50%" },
        { id: "GND1", type: "ground" },
        ...Array.from({ length: numFf }, (_, i) => ({
            id: `${prefix}${i + 1}`,
            type: ffType,
        })),
    ];
    if (ffType === "logic_jk") {
        components.push({ id: "VJ1", type: "logic_state", value: "1" });
        components.push({ id: "VK1", type: "logic_state", value: "1" });
    }
    const wires = [
        { solid: true, fromKey: "GND1#0", toKey: "GImp1#1", points: [] },
    ];
    if (ffType === "logic_dff") {
        wires.push({ solid: true, fromKey: "GImp1#0", toKey: "DFF1#1", points: [] });
        for (let i = 1; i <= numFf; i++) {
            wires.push({ solid: true, fromKey: `DFF${i}#0`, toKey: `DFF${i}#3`, points: [] });
            if (i < numFf) {
                wires.push({ solid: true, fromKey: `DFF${i}#2`, toKey: `DFF${i + 1}#1`, points: [] });
            }
        }
    } else {
        wires.push({ solid: true, fromKey: "GImp1#0", toKey: "JKFF1#2", points: [] });
        for (let i = 1; i <= numFf; i++) {
            wires.push({ solid: true, fromKey: "VJ1#0", toKey: `JKFF${i}#0`, points: [] });
            wires.push({ solid: true, fromKey: "VK1#0", toKey: `JKFF${i}#1`, points: [] });
            if (i < numFf) {
                wires.push({ solid: true, fromKey: `JKFF${i}#3`, toKey: `JKFF${i + 1}#2`, points: [] });
            }
        }
    }
    return { components, wires, prefix, ffType };
}

function parseWrdata(waveTxt) {
    const rows = [];
    for (const line of waveTxt.split(/\r?\n/)) {
        const t = line.trim();
        if (!t || t.startsWith("*")) continue;
        const nums = t.split(/\s+/).map(Number).filter((n) => Number.isFinite(n));
        if (nums.length >= 2) rows.push(nums);
    }
    return rows;
}

function decodeCount(qVoltages, vhi = 5) {
    let n = 0;
    for (let i = 0; i < qVoltages.length; i++) {
        if (qVoltages[i] > vhi * 0.5) n |= 1 << i;
    }
    return n;
}

function sampleAtRows(rows, qMeta, tTarget) {
    let best = rows[0];
    for (const row of rows) {
        if (row[0] <= tTarget) best = row;
        else break;
    }
    const qV = qMeta.map((m) => best[(m.wrIndex ?? 0) + 1]);
    return { t: best[0], count: decodeCount(qV), qV };
}

async function runCounter(label, state, deckOpts) {
    const built = await buildNgspiceDeck(state, { repoRoot, ngspiceExe: ngspice, ...deckOpts });
    if (!built.ok) throw new Error(built.errors?.join(" "));
    const dir = mkdtempSync(join(tmpdir(), "ripple-"));
    const wave = join(dir, "tran_waves.txt");
    writeFileSync(join(dir, "circuit.cir"), built.netlist.split("__TRAN_WAVE_PATH__").join(wave.replace(/\\/g, "/")));
    execFileSync(ngspice, ["-b", "-o", "ngspice.log", "circuit.cir"], { cwd: dir, encoding: "utf8" });
    const rows = parseWrdata(readFileSync(wave, "utf8"));
    const re = new RegExp(`^${state.prefix}\\d+_Q$`);
    const qMeta = (built.logicGatesTranMeta || [])
        .filter((m) => re.test(m.id))
        .sort((a, b) => parseInt(a.id.match(/\d+/)?.[0] || "0", 10) - parseInt(b.id.match(/\d+/)?.[0] || "0", 10));
    console.log(`\n=== ${label} (tmax=${rows.at(-1)?.[0]?.toFixed(2)}s) ===`);
    let fails = 0;
    for (let pulse = 1; pulse <= 16; pulse++) {
        const s = sampleAtRows(rows, qMeta, pulse - 1 + 0.49);
        const expect = pulse % 16;
        if (s.count !== expect) fails++;
        if (pulse <= 4 || pulse >= 10) {
            const ok = s.count === expect ? "OK" : `FAIL(attendu ${expect})`;
            console.log(`  ${pulse} → ${s.count} ${ok}`);
        }
    }
    if (fails > 0) throw new Error(`${label}: ${fails} état(s) incorrect(s)`);
    console.log(`${label} : OK (0–15)`);
}

const xspiceOpts = { forceXspiceDff: true, forceBsourceDff: false, forceXspiceJk: true, forceBsourceJk: false };

function buildCounterStateQbar(numFf = 4) {
    const state = buildCounterState(numFf, "logic_dff");
    state.wires = state.wires.filter((w) => {
        const qRipple =
            (/^DFF\d+#2$/.test(w.fromKey) && /^DFF\d+#1$/.test(w.toKey)) ||
            (/^DFF\d+#1$/.test(w.fromKey) && /^DFF\d+#2$/.test(w.toKey));
        return !qRipple;
    });
    for (let i = 1; i < numFf; i++) {
        state.wires.push({ solid: true, fromKey: `DFF${i}#3`, toKey: `DFF${i + 1}#1`, points: [] });
    }
    return state;
}

await runCounter("D ripple XSPICE (Q)", buildCounterState(4, "logic_dff"), xspiceOpts);
await runCounter("D ripple XSPICE (/Q)", buildCounterStateQbar(4), xspiceOpts);
await runCounter("JK ripple XSPICE", buildCounterState(4, "logic_jk"), xspiceOpts);
