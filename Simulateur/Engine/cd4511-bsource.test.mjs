/**
 * CD4511 sources B — sans d_genlut (mode serveur Linux / Render).
 * node Simulateur/Engine/cd4511-bsource.test.mjs
 */
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { buildNgspiceDeck } from "./spice-netlist-v2.mjs";
import { execFileSync } from "child_process";
import { mkdtempSync, writeFileSync, readFileSync } from "fs";
import { tmpdir } from "os";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const ngspice = join(repoRoot, "Simulateur", "bin", "ngspice_con.exe");

const built = await buildNgspiceDeck(
    {
        components: [
            { id: "G0", type: "ground" },
            { id: "V5", type: "vterm", value: "5" },
            { id: "U1", type: "logic_cd4511" },
        ],
        wires: [
            { solid: true, fromKey: "G0#0", toKey: "V5#0", points: [] },
            { solid: true, fromKey: "G0#0", toKey: "U1#0", points: [] },
            { solid: true, fromKey: "G0#0", toKey: "U1#1", points: [] },
            { solid: true, fromKey: "G0#0", toKey: "U1#2", points: [] },
            { solid: true, fromKey: "V5#0", toKey: "U1#3", points: [] },
        ],
    },
    { repoRoot, ngspiceExe: ngspice, forceBsourceCd4511: true, forceBsourceDff: true }
);

if (!built.ok) throw new Error(built.errors?.join(" "));
const nl = built.netlist;
if (nl.includes("d_genlut")) throw new Error("d_genlut ne doit pas être utilisé");
if (!nl.includes("_seg") || !nl.includes("_lat")) throw new Error("sources B CD4511 absentes");

const dir = mkdtempSync(join(tmpdir(), "cd4511-bs-"));
const wave = join(dir, "wave.dat").replace(/\\/g, "/");
writeFileSync(join(dir, "circuit.cir"), built.netlist.split("__TRAN_WAVE_PATH__").join(wave));
execFileSync(ngspice, ["-b", "-o", "ng.log", "circuit.cir"], { cwd: dir, encoding: "utf8", timeout: 120000 });

const log = readFileSync(join(dir, "ng.log"), "utf8");
if (/Defaulted array parameter/i.test(log)) {
    throw new Error("erreur d_genlut dans le log");
}
if (/Simulation interrupted/i.test(log)) {
    throw new Error(`ngspice a échoué:\n${log.slice(-1500)}`);
}

console.log("cd4511-bsource.test.mjs : OK");
