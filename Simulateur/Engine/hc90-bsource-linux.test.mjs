/**
 * 74HC90 en sources B (mode serveur Linux) — décade 0…9.
 * node Simulateur/Engine/hc90-bsource-linux.test.mjs
 */
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { buildNgspiceDeck } from "./spice-netlist-v2.mjs";
import { IC90_PIN } from "./logic-74hc90.mjs";
import { execFileSync } from "child_process";
import { mkdtempSync, writeFileSync, readFileSync } from "fs";
import { tmpdir } from "os";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const ngspice = join(repoRoot, "Simulateur", "bin", "ngspice_con.exe");

const state = {
    components: [
        { id: "GImp1", type: "vpulse", value: "5V 2Hz 50%" },
        { id: "GND1", type: "ground" },
        { id: "VCC1", type: "logic_state", value: "1", logicRail: 5 },
        { id: "VMR1", type: "logic_state", value: "0", logicRail: 5 },
        { id: "VMR2", type: "logic_state", value: "0", logicRail: 5 },
        { id: "VMS1", type: "logic_state", value: "0", logicRail: 5 },
        { id: "VMS2", type: "logic_state", value: "0", logicRail: 5 },
        { id: "U1", type: "ic_74hc90" },
    ],
    wires: [
        { solid: true, fromKey: "GND1#0", toKey: "GImp1#1", points: [] },
        { solid: true, fromKey: "GImp1#0", toKey: `U1#${IC90_PIN.CP0}`, points: [] },
        { solid: true, fromKey: "VCC1#0", toKey: `U1#${IC90_PIN.VCC}`, points: [] },
        { solid: true, fromKey: "GND1#0", toKey: `U1#${IC90_PIN.GND}`, points: [] },
        { solid: true, fromKey: "VMR1#0", toKey: `U1#${IC90_PIN.MR1}`, points: [] },
        { solid: true, fromKey: "VMR2#0", toKey: `U1#${IC90_PIN.MR2}`, points: [] },
        { solid: true, fromKey: "VMS1#0", toKey: `U1#${IC90_PIN.MS1}`, points: [] },
        { solid: true, fromKey: "VMS2#0", toKey: `U1#${IC90_PIN.MS2}`, points: [] },
        { solid: true, fromKey: `U1#${IC90_PIN.Q0}`, toKey: `U1#${IC90_PIN.CP1}`, points: [] },
    ],
};

const built = await buildNgspiceDeck(state, {
    repoRoot,
    ngspiceExe: ngspice,
    forceBsourceDff: true,
    forceBsourceCd4511: true,
});
if (!built.ok) throw new Error(built.errors?.join(" "));
if (built.netlist.includes("d_dff")) throw new Error("d_dff ne doit pas être utilisé");

const dir = mkdtempSync(join(tmpdir(), "hc90-bs-"));
const wave = join(dir, "wave.dat").replace(/\\/g, "/");
writeFileSync(join(dir, "circuit.cir"), built.netlist.split("__TRAN_WAVE_PATH__").join(wave));
execFileSync(ngspice, ["-b", "-o", "ng.log", "circuit.cir"], { cwd: dir, encoding: "utf8", timeout: 120000 });

const log = readFileSync(join(dir, "ng.log"), "utf8");
if (/Simulation interrupted/i.test(log)) {
    throw new Error(`ngspice HC90 B-source:\n${log.slice(-1500)}`);
}

console.log("hc90-bsource-linux.test.mjs : OK");
