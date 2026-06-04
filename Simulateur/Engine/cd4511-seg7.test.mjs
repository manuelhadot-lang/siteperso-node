/**
 * CD4511 → afficheur 7 segments (BCD 0, cathode commune).
 * node Simulateur/Engine/cd4511-seg7.test.mjs
 */
import { existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { buildNgspiceDeck } from "./spice-netlist-v2.mjs";
import { isXspiceDffAvailable } from "./logic-xspice.mjs";
import { ngspiceHasXspice } from "./ngspice-xspice-probe.mjs";
import { mergeSeg7FromTranWrdata } from "./v2/result-parser.mjs";
import { execFileSync } from "child_process";
import { mkdtempSync, writeFileSync, readFileSync } from "fs";
import { tmpdir } from "os";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, "..", "..");
const ngspice = join(__dirname, "..", "bin", "ngspice_con.exe");

function assert(cond, msg) {
    if (!cond) throw new Error(msg);
}

if (!isXspiceDffAvailable(repoRoot) || !existsSync(ngspice) || !ngspiceHasXspice(ngspice)) {
    console.log("cd4511-seg7.test.mjs : SKIP");
    process.exit(0);
}

const state = {
    components: [
        { id: "G0", type: "ground", x: 0, y: 0 },
        { id: "U1", type: "logic_cd4511", x: 100, y: 0 },
        { id: "SEG1", type: "seg7", x: 200, y: 0 },
        { id: "LA", type: "logic_state", value: "0", logicRail: 5 },
        { id: "LB", type: "logic_state", value: "0", logicRail: 5 },
        { id: "LC", type: "logic_state", value: "0", logicRail: 5 },
        { id: "LD", type: "logic_state", value: "0", logicRail: 5 },
        { id: "LLE", type: "logic_state", value: "0", logicRail: 5 },
        { id: "LBI", type: "logic_state", value: "1", logicRail: 5 },
        { id: "LLT", type: "logic_state", value: "1", logicRail: 5 },
    ],
    wires: [
        { id: "w0", solid: true, fromKey: "G0#0", toKey: "SEG1#7", points: [] },
        { id: "wa", solid: true, fromKey: "LA#0", toKey: "U1#0", points: [] },
        { id: "wb", solid: true, fromKey: "LB#0", toKey: "U1#1", points: [] },
        { id: "wc", solid: true, fromKey: "LC#0", toKey: "U1#2", points: [] },
        { id: "wd", solid: true, fromKey: "LD#0", toKey: "U1#3", points: [] },
        { id: "wle", solid: true, fromKey: "LLE#0", toKey: "U1#4", points: [] },
        { id: "wbi", solid: true, fromKey: "LBI#0", toKey: "U1#5", points: [] },
        { id: "wlt", solid: true, fromKey: "LLT#0", toKey: "U1#6", points: [] },
        { id: "wsa", solid: true, fromKey: "U1#7", toKey: "SEG1#0", points: [] },
        { id: "wsb", solid: true, fromKey: "U1#8", toKey: "SEG1#1", points: [] },
        { id: "wsc", solid: true, fromKey: "U1#9", toKey: "SEG1#2", points: [] },
        { id: "wsd", solid: true, fromKey: "U1#10", toKey: "SEG1#3", points: [] },
        { id: "wse", solid: true, fromKey: "U1#11", toKey: "SEG1#4", points: [] },
        { id: "wsf", solid: true, fromKey: "U1#12", toKey: "SEG1#5", points: [] },
        { id: "wsg", solid: true, fromKey: "U1#13", toKey: "SEG1#6", points: [] },
    ],
};

const built = await buildNgspiceDeck(state, { repoRoot, ngspiceExe: ngspice });
assert(built.ok, built.errors?.join(" ") || "netlist");
assert(built.netlist.includes("d_genlut"), "d_genlut");

const dir = mkdtempSync(join(tmpdir(), "cd4511-seg7-"));
const wave = join(dir, "wave.dat").replace(/\\/g, "/");
writeFileSync(join(dir, "circuit.cir"), built.netlist.split("__TRAN_WAVE_PATH__").join(wave));
execFileSync(ngspice, ["-b", "-o", "ngspice.log", "circuit.cir"], { cwd: dir, encoding: "utf8", timeout: 120000 });

const waveTxt = readFileSync(join(dir, "wave.dat"), "utf8");
const seg7 = mergeSeg7FromTranWrdata(waveTxt, built.seg7TranMeta || []);
const seg = seg7.SEG1?.segments || {};
assert(seg.a && seg.b && seg.c && seg.d && seg.e && seg.f, "chiffre 0 : segments a–f allumés");
assert(!seg.g, "chiffre 0 : segment g éteint");

console.log("cd4511-seg7.test.mjs : OK", seg);
