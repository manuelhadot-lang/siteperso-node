/**
 * CD4511 + XSPICE (d_dlatch, d_genlut) — affichage chiffre 8.
 * node Simulateur/Engine/logic-cd4511-xspice.test.mjs
 */
import { existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { buildNgspiceDeck } from "./spice-netlist-v2.mjs";
import { isXspiceDffAvailable, resolveDigitalCmPath } from "./logic-xspice.mjs";
import { ngspiceHasXspice } from "./ngspice-xspice-probe.mjs";
import { execFileSync } from "child_process";
import { mkdtempSync, writeFileSync, readFileSync } from "fs";
import { tmpdir } from "os";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, "..", "..");
const ngspice = join(__dirname, "..", "bin", "ngspice_con.exe");

function assert(cond, msg) {
    if (!cond) throw new Error(msg);
}

if (!isXspiceDffAvailable(repoRoot)) {
    console.log("logic-cd4511-xspice.test.mjs : SKIP (digital.cm absent)");
    process.exit(0);
}
if (!existsSync(ngspice)) {
    console.log("logic-cd4511-xspice.test.mjs : SKIP (ngspice_con.exe absent)");
    process.exit(0);
}
if (!ngspiceHasXspice(ngspice)) {
    console.log("logic-cd4511-xspice.test.mjs : SKIP (ngspice sans XSPICE)");
    process.exit(0);
}

/** BCD 8 : A=0 B=0 C=0 D=1 (LSB = A). */
const state = {
    components: [
        { id: "G0", type: "ground", x: 0, y: 0 },
        { id: "V5", type: "vterm", x: 0, y: 0, value: "5" },
        { id: "U1", type: "logic_cd4511", x: 100, y: 0 },
    ],
    wires: [
        { id: "w0", solid: true, fromKey: "G0#0", toKey: "V5#0", points: [] },
        { id: "wA", solid: true, fromKey: "G0#0", toKey: "U1#0", points: [] },
        { id: "wB", solid: true, fromKey: "G0#0", toKey: "U1#1", points: [] },
        { id: "wC", solid: true, fromKey: "G0#0", toKey: "U1#2", points: [] },
        { id: "wD", solid: true, fromKey: "V5#0", toKey: "U1#3", points: [] },
    ],
};

const built = await buildNgspiceDeck(state, { repoRoot, ngspiceExe: ngspice });
assert(built.ok, built.errors?.join(" ") || "netlist");
assert(built.netlist.includes("d_genlut"), "d_genlut");
assert(built.netlist.includes("d_dlatch"), "d_dlatch");

const dir = mkdtempSync(join(tmpdir(), "xspice-cd4511-"));
const wave = join(dir, "wave.dat").replace(/\\/g, "/");
writeFileSync(join(dir, "circuit.cir"), built.netlist.split("__TRAN_WAVE_PATH__").join(wave));

try {
    execFileSync(ngspice, ["-b", "-o", "ngspice.log", "circuit.cir"], {
        encoding: "utf8",
        timeout: 120000,
        cwd: dir,
    });
} catch {
    const tail = readFileSync(join(dir, "ngspice.log"), "utf8").slice(-2000);
    throw new Error(`ngspice CD4511 a échoué:\n${tail}`);
}

const logText = readFileSync(join(dir, "ngspice.log"), "utf8");
assert(!/Timestep too small/i.test(logText), "pas de timestep trop petit");
assert(!/unknown parameter/i.test(logText), "pas d'erreur parsing");

console.log("logic-cd4511-xspice.test.mjs : OK");
console.log("digital.cm :", resolveDigitalCmPath(repoRoot));
