/**
 * Bascule D + XSPICE (d_dff) — schéma type diviseur par 2 (D relié à /Q).
 * node Simulateur/Engine/logic-dff-xspice.test.mjs
 *
 * Nécessite : ngspice_con.exe + Simulateur/lib/ngspice/digital.cm
 */
import { existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { buildNgspiceDeck } from "./spice-netlist-v2.mjs";
import {
    isXspiceDffAvailable,
    resolveDigitalCmPath,
    XSPICE_DIGITAL_CM_PLACEHOLDER,
} from "./logic-xspice.mjs";
import { ngspiceHasXspice } from "./ngspice-xspice-probe.mjs";
import { execFileSync } from "child_process";
import { copyFileSync, mkdtempSync, writeFileSync, readFileSync } from "fs";
import { tmpdir } from "os";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, "..", "..");
const ngspice = join(__dirname, "..", "bin", "ngspice_con.exe");

function assert(cond, msg) {
    if (!cond) throw new Error(msg);
}

if (!isXspiceDffAvailable(repoRoot)) {
    console.log(
        "logic-dff-xspice.test.mjs : SKIP (digital.cm absent — voir Simulateur/lib/ngspice/README.txt)"
    );
    process.exit(0);
}

if (!existsSync(ngspice)) {
    console.log("logic-dff-xspice.test.mjs : SKIP (ngspice_con.exe absent)");
    process.exit(0);
}

if (!ngspiceHasXspice(ngspice)) {
    console.log(
        "logic-dff-xspice.test.mjs : SKIP (ngspice sans XSPICE — installer une build avec XSPICE, voir Simulateur/lib/ngspice/README.txt)"
    );
    process.exit(0);
}

const toggleState = {
    components: [
        { id: "G0", type: "ground", x: 0, y: 0, orient: 0 },
        { id: "Carre1", type: "vsquare", x: 0, y: 0, value: "5V 1kHz", orient: 0 },
        { id: "Dbas1", type: "logic_dff", x: 100, y: 0, orient: 0 },
        { id: "Osc1", type: "oscilloscope", x: 200, y: 0, orient: 0 },
        { id: "G1", type: "ground", x: 200, y: 50, orient: 0 },
    ],
    wires: [
        { id: "w0", solid: true, fromKey: "G0#0", toKey: "Carre1#1", points: [] },
        { id: "w1", solid: true, fromKey: "Carre1#0", toKey: "Dbas1#1", points: [] },
        { id: "w2", solid: true, fromKey: "Dbas1#0", toKey: "Dbas1#3", points: [] },
        { id: "w3", solid: true, fromKey: "Dbas1#2", toKey: "Osc1#1", points: [] },
        { id: "w4", solid: true, fromKey: "Carre1#0", toKey: "Osc1#2", points: [] },
        { id: "w5", solid: true, fromKey: "G1#0", toKey: "Osc1#0", points: [] },
    ],
};

const built = await buildNgspiceDeck(toggleState, { repoRoot, ngspiceExe: ngspice });
assert(built.ok, built.errors?.join(" ") || "netlist");
assert(built.netlist.includes("d_dff"), "netlist doit contenir d_dff");
assert(built.netlist.includes("adc_bridge"), "ponts adc");
assert(built.netlist.includes("dac_bridge"), "ponts dac");
assert(!built.netlist.includes("B_Dbas1_qi"), "pas de source B _qi");

const dir = mkdtempSync(join(tmpdir(), "xspice-dff-"));
const cir = "circuit.cir";
const log = "ngspice.log";
const wave = join(dir, "wave.dat").replace(/\\/g, "/");
const digitalSrc = resolveDigitalCmPath(repoRoot);
assert(digitalSrc, "digital.cm");
copyFileSync(digitalSrc, join(dir, "digital.cm"));
writeFileSync(join(dir, "ngspice-xspice.rc"), "codemodel digital.cm\n");
const deck = built.netlist.split("__TRAN_WAVE_PATH__").join(wave);
writeFileSync(join(dir, cir), deck);

try {
    execFileSync(ngspice, ["-b", "-f", "ngspice-xspice.rc", "-o", "ngspice.log", "circuit.cir"], {
        encoding: "utf8",
        timeout: 120000,
        cwd: dir,
    });
} catch {
    const tail = readFileSync(join(dir, log), "utf8");
    throw new Error(`ngspice XSPICE a échoué:\n${tail.slice(-1500)}`);
}

const logText = readFileSync(join(dir, log), "utf8");
assert(!/Timestep too small/i.test(logText), "pas de timestep trop petit");
assert(!/unknown parameter/i.test(logText), "pas d'erreur de parsing B/tanh");
const rows = Number(logText.match(/No\. of Data Rows\s*:\s*(\d+)/i)?.[1] || 0);
assert(rows > 500, `assez de points wrdata (${rows})`);

console.log("logic-dff-xspice.test.mjs : OK");
console.log("digital.cm :", resolveDigitalCmPath(repoRoot));
