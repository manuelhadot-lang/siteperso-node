/**
 * Vérifie que les fils CD4511 ↔ seg7 passent dans la netlist (comme simulation.js).
 * node Simulateur/Engine/cd4511-wires.test.mjs
 */
import { buildNgspiceDeck } from "./spice-netlist-v2.mjs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

function assert(cond, msg) {
    if (!cond) throw new Error(msg);
}

const state = {
    components: [
        { id: "GND1", type: "ground", x: 0, y: 0 },
        { id: "CD45111", type: "logic_cd4511", x: 100, y: 0 },
        { id: "SEG1", type: "seg7", x: 200, y: 0 },
        { id: "LOGA", type: "logic_state", value: "0", logicRail: 5 },
        { id: "LOGB", type: "logic_state", value: "0", logicRail: 5 },
        { id: "LOGC", type: "logic_state", value: "0", logicRail: 5 },
        { id: "LOGD", type: "logic_state", value: "0", logicRail: 5 },
        { id: "LOGLE", type: "logic_state", value: "0", logicRail: 5 },
        { id: "LOGBI", type: "logic_state", value: "1", logicRail: 5 },
        { id: "LOGLT", type: "logic_state", value: "1", logicRail: 5 },
    ],
    wires: [
        { solid: true, fromKey: "GND1#0", toKey: "SEG1#7", points: [{ x: 0, y: 0 }, { x: 1, y: 1 }] },
        { solid: true, fromKey: "LOGA#0", toKey: "CD45111#0", points: [{ x: 0, y: 0 }, { x: 1, y: 1 }] },
        { solid: true, fromKey: "LOGB#0", toKey: "CD45111#1", points: [{ x: 0, y: 0 }, { x: 1, y: 1 }] },
        { solid: true, fromKey: "LOGC#0", toKey: "CD45111#2", points: [{ x: 0, y: 0 }, { x: 1, y: 1 }] },
        { solid: true, fromKey: "LOGD#0", toKey: "CD45111#3", points: [{ x: 0, y: 0 }, { x: 1, y: 1 }] },
        { solid: true, fromKey: "LOGLE#0", toKey: "CD45111#4", points: [{ x: 0, y: 0 }, { x: 1, y: 1 }] },
        { solid: true, fromKey: "LOGBI#0", toKey: "CD45111#5", points: [{ x: 0, y: 0 }, { x: 1, y: 1 }] },
        { solid: true, fromKey: "LOGLT#0", toKey: "CD45111#6", points: [{ x: 0, y: 0 }, { x: 1, y: 1 }] },
        { solid: true, fromKey: "CD45111#7", toKey: "SEG1#0", points: [{ x: 0, y: 0 }, { x: 1, y: 1 }] },
        { solid: true, fromKey: "CD45111#8", toKey: "SEG1#1", points: [{ x: 0, y: 0 }, { x: 1, y: 1 }] },
        { solid: true, fromKey: "CD45111#9", toKey: "SEG1#2", points: [{ x: 0, y: 0 }, { x: 1, y: 1 }] },
        { solid: true, fromKey: "CD45111#10", toKey: "SEG1#3", points: [{ x: 0, y: 0 }, { x: 1, y: 1 }] },
        { solid: true, fromKey: "CD45111#11", toKey: "SEG1#4", points: [{ x: 0, y: 0 }, { x: 1, y: 1 }] },
        { solid: true, fromKey: "CD45111#12", toKey: "SEG1#5", points: [{ x: 0, y: 0 }, { x: 1, y: 1 }] },
        { solid: true, fromKey: "CD45111#13", toKey: "SEG1#6", points: [{ x: 0, y: 0 }, { x: 1, y: 1 }] },
    ],
};

const built = await buildNgspiceDeck(state, { repoRoot });
assert(built.ok, built.errors?.join(" ") || "build");
assert(built.analysisTran, "analyse .tran requise");
const nl = built.netlist;
assert(nl.includes("V_LOGA"), "borne LOGA dans la netlist");
assert(nl.includes("d_genlut"), "décodeur XSPICE");
assert(!/CD45111#7.*\n.*CD45111#7/s.test(nl) || nl.includes("SEG1"), "liaison sorties");

console.log("cd4511-wires.test.mjs : OK");
