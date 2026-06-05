/**
 * Chaîne 74HC90 (décade) → CD4511 → 7 segments.
 * node Simulateur/Engine/hc90-cd4511-chain.test.mjs
 */
import { existsSync } from "fs";
import { join } from "path";
import { fileURLToPath } from "url";
import { buildNgspiceDeck } from "./spice-netlist-v2.mjs";
import { IC90_PIN } from "./logic-74hc90.mjs";
import { isXspiceDffAvailable } from "./logic-xspice.mjs";
import { ngspiceHasXspice } from "./ngspice-xspice-probe.mjs";
import { mergeSeg7FromTranWrdata } from "./v2/result-parser.mjs";
import { execFileSync } from "child_process";
import { mkdtempSync, writeFileSync, readFileSync } from "fs";
import { tmpdir } from "os";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const repoRoot = join(__dirname, "..", "..");
const ngspice = join(__dirname, "..", "bin", "ngspice_con.exe");

function assert(cond, msg) {
    if (!cond) throw new Error(msg);
}

if (!isXspiceDffAvailable(repoRoot) || !existsSync(ngspice) || !ngspiceHasXspice(ngspice)) {
    console.log("hc90-cd4511-chain.test.mjs : SKIP (XSPICE requis pour CD4511)");
    process.exit(0);
}

const state = {
    components: [
        { id: "GImp1", type: "vpulse", value: "5V 2Hz 50%" },
        { id: "GND1", type: "ground" },
        { id: "VCC1", type: "logic_state", value: "1", logicRail: 5 },
        { id: "VMR1", type: "logic_state", value: "0", logicRail: 5 },
        { id: "VMR2", type: "logic_state", value: "0", logicRail: 5 },
        { id: "VMS1", type: "logic_state", value: "0", logicRail: 5 },
        { id: "VMS2", type: "logic_state", value: "0", logicRail: 5 },
        { id: "LLE", type: "logic_state", value: "0", logicRail: 5 },
        { id: "LBI", type: "logic_state", value: "1", logicRail: 5 },
        { id: "LLT", type: "logic_state", value: "1", logicRail: 5 },
        { id: "U90", type: "ic_74hc90" },
        { id: "U4511", type: "logic_cd4511" },
        { id: "SEG1", type: "seg7" },
    ],
    wires: [
        { solid: true, fromKey: "GND1#0", toKey: "GImp1#1", points: [] },
        { solid: true, fromKey: "GImp1#0", toKey: `U90#${IC90_PIN.CP0}`, points: [] },
        { solid: true, fromKey: "VCC1#0", toKey: `U90#${IC90_PIN.VCC}`, points: [] },
        { solid: true, fromKey: "GND1#0", toKey: `U90#${IC90_PIN.GND}`, points: [] },
        { solid: true, fromKey: "VMR1#0", toKey: `U90#${IC90_PIN.MR1}`, points: [] },
        { solid: true, fromKey: "VMR2#0", toKey: `U90#${IC90_PIN.MR2}`, points: [] },
        { solid: true, fromKey: "VMS1#0", toKey: `U90#${IC90_PIN.MS1}`, points: [] },
        { solid: true, fromKey: "VMS2#0", toKey: `U90#${IC90_PIN.MS2}`, points: [] },
        { solid: true, fromKey: `U90#${IC90_PIN.Q0}`, toKey: `U90#${IC90_PIN.CP1}`, points: [] },
        { solid: true, fromKey: `U90#${IC90_PIN.Q0}`, toKey: "U4511#0", points: [] },
        { solid: true, fromKey: `U90#${IC90_PIN.Q1}`, toKey: "U4511#1", points: [] },
        { solid: true, fromKey: `U90#${IC90_PIN.Q2}`, toKey: "U4511#2", points: [] },
        { solid: true, fromKey: `U90#${IC90_PIN.Q3}`, toKey: "U4511#3", points: [] },
        { solid: true, fromKey: "LLE#0", toKey: "U4511#4", points: [] },
        { solid: true, fromKey: "LBI#0", toKey: "U4511#5", points: [] },
        { solid: true, fromKey: "LLT#0", toKey: "U4511#6", points: [] },
        { solid: true, fromKey: "GND1#0", toKey: "SEG1#7", points: [] },
        { solid: true, fromKey: "U4511#7", toKey: "SEG1#0", points: [] },
        { solid: true, fromKey: "U4511#8", toKey: "SEG1#1", points: [] },
        { solid: true, fromKey: "U4511#9", toKey: "SEG1#2", points: [] },
        { solid: true, fromKey: "U4511#10", toKey: "SEG1#3", points: [] },
        { solid: true, fromKey: "U4511#11", toKey: "SEG1#4", points: [] },
        { solid: true, fromKey: "U4511#12", toKey: "SEG1#5", points: [] },
        { solid: true, fromKey: "U4511#13", toKey: "SEG1#6", points: [] },
    ],
};

const built = await buildNgspiceDeck(state, {
    repoRoot,
    ngspiceExe: ngspice,
    forceXspiceDff: true,
    forceXspiceCd4511: true,
});
assert(built.ok, built.errors?.join(" ") || "netlist");

const dir = mkdtempSync(join(tmpdir(), "hc90-chain-"));
const wave = join(dir, "wave.dat").replace(/\\/g, "/");
writeFileSync(join(dir, "circuit.cir"), built.netlist.split("__TRAN_WAVE_PATH__").join(wave));
execFileSync(ngspice, ["-b", "-o", "ngspice.log", "circuit.cir"], { cwd: dir, encoding: "utf8", timeout: 180000 });

const waveTxt = readFileSync(join(dir, "wave.dat"), "utf8");
const rows = waveTxt
    .split(/\r?\n/)
    .filter((l) => l.trim() && !l.startsWith("*"))
    .map((l) => l.trim().split(/\s+/).map(Number).filter(Number.isFinite));

function rowAt(tTarget) {
    let best = rows[0];
    for (const row of rows) {
        if (row[0] <= tTarget) best = row;
        else break;
    }
    return best;
}

const qMeta = (built.logicGatesTranMeta || []).filter((m) => /^U90_Q\d$/.test(m.id));
function countAt(tTarget) {
    const row = rowAt(tTarget);
    let n = 0;
    qMeta.forEach((m, i) => {
        if (row[(m.wrIndex ?? 0) + 1] > 2.5) n |= 1 << i;
    });
    return n;
}

function segPatternAt(tTarget) {
    const slice = rows.filter((r) => r[0] <= tTarget);
    const txt = slice.map((r) => r.join(" ")).join("\n");
    const seg = mergeSeg7FromTranWrdata(txt, built.seg7TranMeta || []).SEG1?.segments || {};
    return ["a", "b", "c", "d", "e", "f", "g"].filter((s) => seg[s]).join("");
}

const counterStates = new Set();
const segPatterns = new Set();
for (let pulse = 1; pulse <= 12; pulse++) {
    const t = (pulse - 1) * 0.5 + 0.49;
    counterStates.add(countAt(t));
    segPatterns.add(segPatternAt(t));
}

assert(counterStates.size >= 3, `compteur figé ? états: ${[...counterStates].join(", ")}`);
assert(segPatterns.size >= 2, `afficheur figé ? motifs: ${[...segPatterns].join(" | ")}`);

console.log(
    "hc90-cd4511-chain.test.mjs : OK — compteur",
    [...counterStates].sort((a, b) => a - b).join(","),
    "— seg7",
    [...segPatterns].slice(0, 6).join(" | ")
);
