/**
 * Ampèremètre en série avec LED + GImp (.tran)
 * node Simulateur/Engine/ammeter-tran.test.mjs
 */
import { buildNgspiceDeck } from "./spice-netlist-v2.mjs";
import { execFileSync } from "child_process";
import { mkdtempSync, writeFileSync, readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { tmpdir } from "os";
import { mergeAmmeterFromTranWrdata } from "./v2/result-parser.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, "..", "..");
const ngspice = join(__dirname, "..", "bin", "ngspice_con.exe");

const state = {
    components: [
        { id: "GImp1", type: "vpulse", value: "5V 1Hz 50%" },
        { id: "GND1", type: "ground" },
        { id: "R1", type: "resistor", value: "330" },
        { id: "LED1", type: "diode_led" },
        { id: "A1", type: "ammeter" },
    ],
    wires: [
        { solid: true, fromKey: "GND1#0", toKey: "GImp1#1", points: [] },
        { solid: true, fromKey: "GImp1#0", toKey: "A1#0", points: [] },
        { solid: true, fromKey: "A1#1", toKey: "R1#0", points: [] },
        { solid: true, fromKey: "R1#1", toKey: "LED1#0", points: [] },
        { solid: true, fromKey: "LED1#1", toKey: "GND1#0", points: [] },
    ],
};

const built = await buildNgspiceDeck(state, { repoRoot, ngspiceExe: ngspice });
const meta = built.metersTranMeta?.ammeters || [];
console.log("ammeter meta:", JSON.stringify(meta, null, 2));
const dir = mkdtempSync(join(tmpdir(), "am-tran-"));
const wavePath = join(dir, "waves.txt");
const netlist = built.netlist.replace("__TRAN_WAVE_PATH__", wavePath.replace(/\\/g, "/"));
writeFileSync(join(dir, "c.cir"), netlist);
execFileSync(ngspice, ["-b", "-o", join(dir, "l.log"), join(dir, "c.cir")]);
const waveTxt = readFileSync(wavePath, "utf8");
const am = mergeAmmeterFromTranWrdata(waveTxt, meta);
console.log("A1:", am.A1);
const i = am.A1?.current;
if (!Number.isFinite(i) || Math.abs(i) < 1e-5) {
    console.error("FAIL: courant crête attendu > 10 µA, obtenu", i);
    console.error("wrdata head:", waveTxt.slice(0, 400));
    process.exit(1);
}
console.log("OK ammeter i=", i);
