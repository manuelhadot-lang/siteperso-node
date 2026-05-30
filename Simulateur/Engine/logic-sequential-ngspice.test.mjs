/**
 * Bascules D/JK : netlist sans delay() (ngspice-46).
 * node Simulateur/Engine/logic-sequential-ngspice.test.mjs
 */
import { existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { buildNgspiceDeck } from "./spice-netlist-v2.mjs";
import { execFileSync } from "child_process";
import { mkdtempSync, writeFileSync, readFileSync } from "fs";
import { tmpdir } from "os";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, "..", "..");
const ngspice = join(__dirname, "..", "bin", "ngspice_con.exe");

function assert(cond, msg) {
    if (!cond) throw new Error(msg);
}

function runDeck(built, label) {
    const dir = mkdtempSync(join(tmpdir(), label + "-"));
    const cir = join(dir, "circuit.cir");
    const log = join(dir, "ngspice.log");
    const wave = join(dir, "wave.dat").replace(/\\/g, "/");
    writeFileSync(cir, built.netlist.split("__TRAN_WAVE_PATH__").join(wave));
    try {
        execFileSync(ngspice, ["-b", "-o", log, cir], {
            encoding: "utf8",
            timeout: 120000,
            cwd: repoRoot,
        });
    } catch {
        const tail = readFileSync(log, "utf8");
        throw new Error(`${label} : ngspice a échoué:\n${tail.slice(-1200)}`);
    }
    return readFileSync(log, "utf8");
}

if (!existsSync(ngspice)) {
    console.log("logic-sequential-ngspice.test.mjs : SKIP (ngspice_con.exe absent)");
    process.exit(0);
}

const state = {
    components: [
        { id: "Sin1", type: "vsin", x: 0, y: 0, value: "5V 5V 1kHz 0V", orient: 0 },
        { id: "G0", type: "ground", x: 0, y: 50, orient: 0 },
        { id: "Dbas1", type: "logic_dff", x: 100, y: 0, orient: 0 },
        { id: "JKff1", type: "logic_jk", x: 200, y: 0, orient: 0 },
        { id: "Osc1", type: "oscilloscope", x: 300, y: 0, orient: 0 },
        { id: "G1", type: "ground", x: 300, y: 50, orient: 0 },
    ],
    wires: [
        { id: "w0", solid: true, fromKey: "G0#0", toKey: "Sin1#1", points: [] },
        { id: "w1", solid: true, fromKey: "Sin1#0", toKey: "Dbas1#0", points: [] },
        { id: "w2", solid: true, fromKey: "Sin1#0", toKey: "Dbas1#1", points: [] },
        { id: "w3", solid: true, fromKey: "Dbas1#2", toKey: "JKff1#0", points: [] },
        { id: "w4", solid: true, fromKey: "Sin1#0", toKey: "JKff1#1", points: [] },
        { id: "w5", solid: true, fromKey: "G0#0", toKey: "JKff1#2", points: [] },
        { id: "w6", solid: true, fromKey: "JKff1#3", toKey: "Osc1#1", points: [] },
        { id: "w7", solid: true, fromKey: "G1#0", toKey: "Osc1#0", points: [] },
    ],
};

const built = await buildNgspiceDeck(state, { repoRoot, forceBsourceDff: true });
assert(built.ok, built.errors?.join(" ") || "netlist");
assert(!built.netlist.includes("delay("), "ne doit pas utiliser delay()");
assert(!built.netlist.includes("ddt(V("), "pas de ddt sur l'horloge (instable en .tran)");
assert(built.netlist.includes("_cedge"), "détecteur de front RC");
assert(/^\s*\*/m.test(built.netlist), "deck : 1re ligne titre SPICE en commentaire *");

runDeck(built, "logic-seq");

console.log("logic-sequential-ngspice.test.mjs : OK");
