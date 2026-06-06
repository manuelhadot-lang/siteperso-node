/**
 * CD4511 : 7× d_genlut 1 sortie (compat ngspice-39 Linux / Render).
 * node Simulateur/Engine/cd4511-genlut-split.test.mjs
 */
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { buildNgspiceDeck } from "./spice-netlist-v2.mjs";
import { cd4511SegGenlutTable } from "./logic-cd4511-xspice.mjs";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const ngspice = join(repoRoot, "Simulateur", "bin", "ngspice_con.exe");

const built = await buildNgspiceDeck(
    {
        components: [
            { id: "G0", type: "ground" },
            { id: "U1", type: "logic_cd4511" },
        ],
        wires: [
            { solid: true, fromKey: "G0#0", toKey: "U1#0", points: [] },
            { solid: true, fromKey: "G0#0", toKey: "U1#1", points: [] },
            { solid: true, fromKey: "G0#0", toKey: "U1#2", points: [] },
            { solid: true, fromKey: "G0#0", toKey: "U1#3", points: [] },
        ],
    },
    { repoRoot, ngspiceExe: ngspice, forceXspiceCd4511: true }
);

if (!built.ok) throw new Error(built.errors?.join(" "));

const nl = built.netlist;
if (/\]_dec \[[^\]]+ [^\]]+ [^\]]+ [^\]]+ [^\]]+/.test(nl)) {
    throw new Error("d_genlut multi-sorties encore présent");
}
for (const s of ["a", "b", "c", "d", "e", "f", "g"]) {
    if (!nl.includes(`_dec${s} `) || !nl.includes(`_m_lut_${s}`)) {
        throw new Error(`décodeur segment ${s} manquant`);
    }
}
if (cd4511SegGenlutTable(0).length !== 16) throw new Error("table segment invalide");

console.log("cd4511-genlut-split.test.mjs : OK");
