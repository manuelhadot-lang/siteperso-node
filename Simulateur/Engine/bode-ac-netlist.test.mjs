/**
 * Netlist .ac pour filtre RC + analyseur Bode.
 * node Simulateur/Engine/bode-ac-netlist.test.mjs
 */
import { buildNetlistFromGraphicalState } from "./schematic-to-spice.mjs";

function assert(cond, msg) {
    if (!cond) throw new Error(`FAIL: ${msg}`);
}

const state = {
    components: [
        { id: "Sin_1", type: "vsin", value: "5V 1kHz 0V", x: 0, y: 0 },
        { id: "R_1", type: "resistor", value: "1k", x: 100, y: 0 },
        { id: "C_1", type: "capacitor", value: "100n", x: 200, y: 0 },
        { id: "GND_1", type: "ground", x: 200, y: 80 },
        { id: "Bode_1", type: "bode_analyzer", x: 280, y: 0 },
    ],
    wires: [
        { solid: true, fromKey: "Sin_1#1", toKey: "R_1#0", points: [{ x: 40, y: 0 }, { x: 60, y: 0 }] },
        { solid: true, fromKey: "R_1#1", toKey: "C_1#0", points: [{ x: 140, y: 0 }, { x: 160, y: 0 }] },
        { solid: true, fromKey: "C_1#1", toKey: "Bode_1#1", points: [{ x: 240, y: 0 }, { x: 260, y: 0 }] },
        { solid: true, fromKey: "Sin_1#0", toKey: "GND_1#0", points: [{ x: 0, y: 40 }, { x: 0, y: 80 }] },
        { solid: true, fromKey: "C_1#1", toKey: "GND_1#0", points: [{ x: 200, y: 0 }, { x: 200, y: 80 }] },
        { solid: true, fromKey: "Bode_1#0", toKey: "GND_1#0", points: [{ x: 280, y: 0 }, { x: 280, y: 80 }] },
    ],
};

const built = buildNetlistFromGraphicalState(state);
assert(built.ok, "build ok");
assert(built.analysisAc === true, "analysisAc");
assert(!built.analysisTran, "pas de .tran");
assert(built.netlist.includes(".ac dec"), "contient .ac");
assert(built.netlist.includes("AC 1"), "source AC unitaire");
assert(built.netlist.includes("wrdata __AC_WAVE_PATH__"), "wrdata AC");
assert(built.bodeAcMeta?.length === 1, "meta bode");

console.log("bode-ac-netlist.test.mjs : OK");
