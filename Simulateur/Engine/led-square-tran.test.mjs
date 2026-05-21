/**
 * Générateur carré + 2 LED + NOT : .tran sans oscilloscope.
 * node Simulateur/Engine/led-square-tran.test.mjs
 */
import { buildNetlistFromGraphicalState } from "./schematic-to-spice.mjs";

function assert(cond, msg) {
    if (!cond) throw new Error(msg);
}

const state = {
    components: [
        { id: "Carre1", type: "vsquare", x: 0, y: 0, value: "5V 5V 1kHz 0V", orient: 0 },
        { id: "G0", type: "ground", x: 0, y: 50, orient: 0 },
        { id: "NOT1", type: "logic_not", x: 120, y: 0, orient: 0 },
        { id: "R1", type: "resistor", x: 200, y: 0, value: "330", orient: 0 },
        { id: "R2", type: "resistor", x: 120, y: -60, value: "330", orient: 0 },
        { id: "LD1", type: "led", x: 280, y: 0, orient: 0 },
        { id: "LD2", type: "led", x: 200, y: -60, orient: 0 },
        { id: "G1", type: "ground", x: 280, y: 50, orient: 0 },
        { id: "G2", type: "ground", x: 200, y: -10, orient: 0 },
    ],
    wires: [
        { id: "w0", solid: true, fromKey: "G0#0", toKey: "Carre1#1", points: [] },
        { id: "w1", solid: true, fromKey: "Carre1#0", toKey: "NOT1#0", points: [] },
        { id: "w2", solid: true, fromKey: "Carre1#0", toKey: "R2#0", points: [] },
        { id: "w3", solid: true, fromKey: "R2#1", toKey: "LD2#0", points: [] },
        { id: "w4", solid: true, fromKey: "LD2#1", toKey: "G2#0", points: [] },
        { id: "w5", solid: true, fromKey: "NOT1#1", toKey: "R1#0", points: [] },
        { id: "w6", solid: true, fromKey: "R1#1", toKey: "LD1#0", points: [] },
        { id: "w7", solid: true, fromKey: "LD1#1", toKey: "G1#0", points: [] },
    ],
};

const built = buildNetlistFromGraphicalState(state);
assert(built.ok, built.errors?.join(" ") || "netlist");
assert(built.analysisTran === true, "analysisTran sans oscilloscope");
assert(built.netlist.includes(".tran"), "doit contenir .tran");
assert(built.netlist.includes("wrdata"), "wrdata pour courbes LED");
assert(built.ledsTranMeta?.length === 2, "2 LED en transitoire");
assert(!/\bundefined\b/i.test(built.netlist), "pas de nœud undefined");

console.log("led-square-tran.test.mjs : OK");
