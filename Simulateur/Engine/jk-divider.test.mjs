/**
 * Bascule JK J=K=1 : Q doit basculer à mi-fréquence de l'horloge.
 * node Simulateur/Engine/jk-divider.test.mjs
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

const state = {
    components: [
        { id: "GImp1", type: "vpulse", value: "5V 10Hz 10%" },
        { id: "GND1", type: "ground" },
        { id: "JKFF1", type: "logic_jk" },
        { id: "VJ1", type: "logic_state", value: "1" },
        { id: "VK1", type: "logic_state", value: "1" },
        { id: "VS1", type: "logic_state", value: "0" },
        { id: "VR1", type: "logic_state", value: "0" },
    ],
    wires: [
        { solid: true, fromKey: "GND1#0", toKey: "GImp1#1", points: [] },
        { solid: true, fromKey: "GImp1#0", toKey: "JKFF1#2", points: [] },
        { solid: true, fromKey: "VJ1#0", toKey: "JKFF1#0", points: [] },
        { solid: true, fromKey: "VK1#0", toKey: "JKFF1#1", points: [] },
        { solid: true, fromKey: "VS1#0", toKey: "JKFF1#5", points: [] },
        { solid: true, fromKey: "VR1#0", toKey: "JKFF1#6", points: [] },
    ],
};

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

const built = await buildNgspiceDeck(state, { repoRoot, ngspiceExe: ngspice });
if (!built.ok) throw new Error(built.errors?.join(" "));
if (!built.netlist.includes("d_jkff")) {
    console.log("SKIP — d_jkff absent (digital.cm / XSPICE requis)");
    process.exit(0);
}

const dir = mkdtempSync(join(tmpdir(), "jk-div-"));
const wave = join(dir, "tran_waves.txt");
writeFileSync(join(dir, "circuit.cir"), built.netlist.split("__TRAN_WAVE_PATH__").join(wave.replace(/\\/g, "/")));
execFileSync(ngspice, ["-b", "-o", "ngspice.log", "circuit.cir"], { cwd: dir, encoding: "utf8" });

const rows = parseWrdata(readFileSync(wave, "utf8"));
const qMeta = (built.logicGatesTranMeta || []).find((m) => m.id === "JKFF1_Q");
if (!qMeta) throw new Error("JKFF1_Q meta manquant");

const vhi = 5;
const th = vhi * 0.5;
let toggles = 0;
let lastHigh = null;
for (const row of rows) {
    const v = row[(qMeta.wrIndex ?? 0) + 1];
    const high = v > th;
    if (lastHigh !== null && high !== lastHigh) toggles++;
    lastHigh = high;
}

console.log(`Q toggles sur ${rows.length} points: ${toggles}`);
console.log(`tstop attendu ~0.8s, rows=${rows.length}, last t=${rows.at(-1)?.[0]}`);
if (toggles < 4) {
    console.log("FAIL — Q ne bascule pas assez (attendu ≥4 pour diviseur par 2 à 10Hz sur 0.8s)");
    process.exit(1);
}
console.log("jk-divider.test.mjs : OK");
