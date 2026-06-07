/**
 * 74HC90 dans la config serveur Linux (forceBsourceDff + forceBsourceCd4511).
 * Les sections ÷2/÷5 sont modélisées par des bascules JK : XSPICE d_jkff est conservé
 * (les sources B ne convergent pas à travers les fronts). On vérifie ici que la décade
 * compte bien 0…9 dans l'ordre (garde anti-régression « repart de 4 »).
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

const rows = readFileSync(wave, "utf8")
    .split(/\r?\n/)
    .filter((l) => l.trim() && !l.startsWith("*"))
    .map((l) => l.trim().split(/\s+/).map(Number).filter(Number.isFinite));
if (rows.length < 2) throw new Error("aucune donnée transitoire (.tran avorté)");

const qMeta = (built.logicGatesTranMeta || [])
    .filter((m) => /^U1_Q\d$/.test(m.id))
    .sort((a, b) => parseInt(a.id.replace("U1_Q", ""), 10) - parseInt(b.id.replace("U1_Q", ""), 10));

function sampleAt(tTarget) {
    let best = rows[0];
    for (const row of rows) {
        if (row[0] <= tTarget) best = row;
        else break;
    }
    let n = 0;
    qMeta.forEach((m, i) => {
        if (best[(m.wrIndex ?? 0) + 1] > 2.5) n |= 1 << i;
    });
    return n;
}

const tEnd = rows[rows.length - 1][0];
let fails = 0;
for (let pulse = 1; pulse <= 12; pulse++) {
    const t = (pulse - 1) * 0.5 + 0.49;
    if (t >= tEnd) break;
    if (sampleAt(t) !== pulse % 10) fails++;
}
if (fails > 0) throw new Error(`${fails} échantillon(s) hors séquence décade 0…9 (« repart de 4 » ?)`);

console.log("hc90-bsource-linux.test.mjs : OK — décade 0…9 conforme");
