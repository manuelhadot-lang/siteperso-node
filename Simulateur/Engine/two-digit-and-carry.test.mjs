/**
 * Deux HC90 en cascade via AND — vérifie que les dizaines n'avancent qu'au report.
 * node Simulateur/Engine/two-digit-and-carry.test.mjs
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

const decadeJumpers = [
    { solid: true, fromKey: `HC90_1#${IC90_PIN.CP1}`, toKey: `HC90_1#${IC90_PIN.Q0}`, points: [] },
    { solid: true, fromKey: `HC90_2#${IC90_PIN.CP1}`, toKey: `HC90_2#${IC90_PIN.Q0}`, points: [] },
];

async function runSim(wiresExtra, label) {
    const state = {
        components: [
            { id: "GImp_1", type: "vpulse", value: "5V 2Hz 50%" },
            { id: "GND_1", type: "ground" },
            { id: "VCC_1", type: "logic_state", value: "1", logicRail: 5 },
            { id: "VMR1", type: "logic_state", value: "0", logicRail: 5 },
            { id: "VMR2", type: "logic_state", value: "0", logicRail: 5 },
            { id: "VMS1", type: "logic_state", value: "0", logicRail: 5 },
            { id: "VMS2", type: "logic_state", value: "0", logicRail: 5 },
            { id: "HC90_1", type: "ic_74hc90" },
            { id: "AND_1", type: "logic_and" },
            { id: "HC90_2", type: "ic_74hc90" },
        ],
        wires: [
            { solid: true, fromKey: "GND_1#0", toKey: "GImp_1#1", points: [] },
            { solid: true, fromKey: "GImp_1#0", toKey: `HC90_1#${IC90_PIN.CP0}`, points: [] },
            { solid: true, fromKey: "VCC_1#0", toKey: `HC90_1#${IC90_PIN.VCC}`, points: [] },
            { solid: true, fromKey: "GND_1#0", toKey: `HC90_1#${IC90_PIN.GND}`, points: [] },
            { solid: true, fromKey: "VMR1#0", toKey: `HC90_1#${IC90_PIN.MR1}`, points: [] },
            { solid: true, fromKey: "VMR2#0", toKey: `HC90_1#${IC90_PIN.MR2}`, points: [] },
            { solid: true, fromKey: "VMS1#0", toKey: `HC90_1#${IC90_PIN.MS1}`, points: [] },
            { solid: true, fromKey: "VMS2#0", toKey: `HC90_1#${IC90_PIN.MS2}`, points: [] },
            { solid: true, fromKey: "VCC_1#0", toKey: `HC90_2#${IC90_PIN.VCC}`, points: [] },
            { solid: true, fromKey: "GND_1#0", toKey: `HC90_2#${IC90_PIN.GND}`, points: [] },
            { solid: true, fromKey: "VMR1#0", toKey: `HC90_2#${IC90_PIN.MR1}`, points: [] },
            { solid: true, fromKey: "VMR2#0", toKey: `HC90_2#${IC90_PIN.MR2}`, points: [] },
            { solid: true, fromKey: "VMS1#0", toKey: `HC90_2#${IC90_PIN.MS1}`, points: [] },
            { solid: true, fromKey: "VMS2#0", toKey: `HC90_2#${IC90_PIN.MS2}`, points: [] },
            ...decadeJumpers,
            ...wiresExtra,
        ],
    };
    const built = await buildNgspiceDeck(state, { repoRoot, ngspiceExe: ngspice });
    const dir = mkdtempSync(join(tmpdir(), "two-"));
    const wave = join(dir, "w.dat").replace(/\\/g, "/");
    writeFileSync(join(dir, "c.cir"), built.netlist.split("__TRAN_WAVE_PATH__").join(wave));
    execFileSync(ngspice, ["-b", "-o", "l", "c.cir"], { cwd: dir });
    const rows = readFileSync(wave, "utf8")
        .split(/\r?\n/)
        .filter((l) => l.trim() && !l.startsWith("*"))
        .map((l) => l.trim().split(/\s+/).map(Number).filter(Number.isFinite));

    const qMeta = (built.logicGatesTranMeta || []).filter((m) => /^HC90_\d_Q\d$/.test(m.id));
    const byChip = { HC90_1: [], HC90_2: [] };
    for (const m of qMeta) {
        const chip = m.id.replace(/_Q\d$/, "");
        const qi = Number(m.id.slice(-1));
        byChip[chip][qi] = m;
    }
    function decode(row, chip) {
        let n = 0;
        for (let i = 0; i < 4; i++) {
            const m = byChip[chip][i];
            if (m && row[(m.wrIndex ?? 0) + 1] > 2.5) n |= 1 << i;
        }
        return n;
    }
    const u = new Set();
    const t = new Set();
    let uSteps = 0;
    let tSteps = 0;
    let uPrev = -1;
    let tPrev = -1;
    for (const row of rows) {
        const du = decode(row, "HC90_1");
        const dt = decode(row, "HC90_2");
        u.add(du);
        t.add(dt);
        if (du !== uPrev) {
            uSteps++;
            uPrev = du;
        }
        if (dt !== tPrev) {
            tSteps++;
            tPrev = dt;
        }
    }
    console.log(
        label,
        "| unités:",
        [...u].sort((a, b) => a - b).join(","),
        "| dizaines:",
        [...t].sort((a, b) => a - b).join(","),
        "| Δ unités:",
        uSteps,
        "Δ dizaines:",
        tSteps
    );
    return { u, t, uSteps, tSteps };
}

const q1q3 = await runSim(
    [
        { solid: true, fromKey: `HC90_1#${IC90_PIN.Q1}`, toKey: "AND_1#0", points: [] },
        { solid: true, fromKey: `HC90_1#${IC90_PIN.Q3}`, toKey: "AND_1#1", points: [] },
        { solid: true, fromKey: "AND_1#2", toKey: `HC90_2#${IC90_PIN.CP0}`, points: [] },
    ],
    "AND(Q1,Q3) utilisateur"
);

const q0q3 = await runSim(
    [
        { solid: true, fromKey: `HC90_1#${IC90_PIN.Q0}`, toKey: "AND_1#0", points: [] },
        { solid: true, fromKey: `HC90_1#${IC90_PIN.Q3}`, toKey: "AND_1#1", points: [] },
        { solid: true, fromKey: "AND_1#2", toKey: `HC90_2#${IC90_PIN.CP0}`, points: [] },
    ],
    "AND(Q0,Q3) report à 9"
);

if (q0q3.tSteps > 0 && q0q3.tSteps < q0q3.uSteps * 0.25) {
    console.log("OK — AND(Q0,Q3) : les dizaines avancent moins souvent que les unités.");
} else {
    console.warn(
        "ATTENTION : report dizaines (ratio Δ dizaines/Δ unités attendu ≪ 1).",
        "Câblage recommandé : AND entre Q0 et Q3 du HC90 des unités → CP0 du HC90 des dizaines (pas Q1+Q3)."
    );
}
