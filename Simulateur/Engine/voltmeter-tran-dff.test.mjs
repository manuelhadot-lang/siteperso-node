/**
 * Voltmètre sur sortie Q d'une bascule D en analyse .tran
 * node Simulateur/Engine/voltmeter-tran-dff.test.mjs
 */
import { buildNgspiceDeck } from "./spice-netlist-v2.mjs";
import { execFileSync } from "child_process";
import { mkdtempSync, writeFileSync, readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { tmpdir } from "os";
import { mergeVoltmeterFromTranWrdata } from "./v2/result-parser.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, "..", "..");
const ngspice = join(__dirname, "..", "bin", "ngspice_con.exe");

const state = {
    components: [
        { id: "GImp1", type: "vpulse", value: "5V 1Hz 50%" },
        { id: "GND1", type: "ground" },
        { id: "DFF1", type: "logic_dff" },
        { id: "VM1", type: "voltmeter" },
    ],
    wires: [
        { solid: true, fromKey: "GND1#0", toKey: "GImp1#1", points: [] },
        { solid: true, fromKey: "GImp1#0", toKey: "DFF1#1", points: [] },
        { solid: true, fromKey: "DFF1#0", toKey: "DFF1#3", points: [] },
        { solid: true, fromKey: "VM1#0", toKey: "DFF1#2", points: [] },
        { solid: true, fromKey: "VM1#1", toKey: "GND1#0", points: [] },
    ],
};

const built = await buildNgspiceDeck(state, { repoRoot, ngspiceExe: ngspice });
if (!built.analysisTran) {
    console.error("FAIL: analyse .tran attendue");
    process.exit(1);
}
const meta = built.metersTranMeta?.voltmeters || [];
if (meta.length !== 1) {
    console.error("FAIL: meta voltmètre manquante", meta);
    process.exit(1);
}

const dir = mkdtempSync(join(tmpdir(), "vm-tran-"));
const wavePath = join(dir, "waves.txt");
const netlist = built.netlist.replace("__TRAN_WAVE_PATH__", wavePath.replace(/\\/g, "/"));
writeFileSync(join(dir, "c.cir"), netlist);
execFileSync(ngspice, ["-b", "-o", join(dir, "l.log"), join(dir, "c.cir")]);
const waveTxt = readFileSync(wavePath, "utf8");
const vm = mergeVoltmeterFromTranWrdata(waveTxt, meta);
const v = vm.VM1?.voltage;
console.log("VM1 voltage (Q on +, GND on -):", v);

const stateGndLeft = {
    ...state,
    components: state.components.map((c) => (c.id === "VM1" ? { ...c, id: "V1" } : c)),
    wires: [
        { solid: true, fromKey: "GND1#0", toKey: "GImp1#1", points: [] },
        { solid: true, fromKey: "GImp1#0", toKey: "DFF1#1", points: [] },
        { solid: true, fromKey: "DFF1#0", toKey: "DFF1#3", points: [] },
        { solid: true, fromKey: "V1#0", toKey: "GND1#0", points: [] },
        { solid: true, fromKey: "V1#1", toKey: "DFF1#2", points: [] },
    ],
};
const built2 = await buildNgspiceDeck(stateGndLeft, { repoRoot, ngspiceExe: ngspice });
const dir2 = mkdtempSync(join(tmpdir(), "vm-tran2-"));
const wavePath2 = join(dir2, "waves.txt");
writeFileSync(join(dir2, "c.cir"), built2.netlist.replace("__TRAN_WAVE_PATH__", wavePath2.replace(/\\/g, "/")));
execFileSync(ngspice, ["-b", "-o", join(dir2, "l.log"), join(dir2, "c.cir")]);
const vm2 = mergeVoltmeterFromTranWrdata(readFileSync(wavePath2, "utf8"), built2.metersTranMeta?.voltmeters || []);
const v2 = vm2.V1?.voltage;
console.log("V1 voltage (GND on -, Q on +):", v2);

if (!Number.isFinite(v) && !Number.isFinite(v2)) {
    console.error("FAIL: aucune mesure voltmètre");
    process.exit(1);
}
for (const measured of [v, v2]) {
    if (!Number.isFinite(measured)) continue;
    if (Math.abs(measured) > 0.5 && Math.abs(measured) < 4.5) {
        console.error("FAIL: tension illisible", measured);
        process.exit(1);
    }
}
console.log("OK voltmètre bascule D");
