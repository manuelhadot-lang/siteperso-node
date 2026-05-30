/**
 * Netlist logique 3,3 V / 5 V — node Simulateur/Engine/logic-rails-netlist.test.mjs
 */
import { buildNetlistFromGraphicalState } from "./schematic-to-spice.mjs";

function assert(cond, msg) {
    if (!cond) throw new Error(msg);
}

function andCircuit(rail) {
    return {
        components: [
            { id: "LS1", type: "logic_state", x: 0, y: 0, value: "1", logicRail: rail, orient: 0 },
            { id: "LS2", type: "logic_state", x: 0, y: 50, value: "1", logicRail: rail, orient: 0 },
            { id: "U1", type: "logic_and", x: 100, y: 25, orient: 0 },
            { id: "G1", type: "ground", x: 200, y: 80, orient: 0 },
            { id: "Osc1", type: "oscilloscope", x: 220, y: 25, orient: 0 },
        ],
        wires: [
            { id: "w1", solid: true, fromKey: "LS1#0", toKey: "U1#0", points: [{ x: 0, y: 0 }, { x: 100, y: 0 }] },
            { id: "w2", solid: true, fromKey: "LS2#0", toKey: "U1#1", points: [{ x: 0, y: 50 }, { x: 100, y: 50 }] },
            { id: "w3", solid: true, fromKey: "U1#2", toKey: "Osc1#1", points: [{ x: 150, y: 25 }, { x: 220, y: 25 }] },
            { id: "w4", solid: true, fromKey: "G1#0", toKey: "Osc1#0", points: [{ x: 200, y: 80 }, { x: 220, y: 80 }] },
        ],
    };
}

const built5 = buildNetlistFromGraphicalState(andCircuit(5));
assert(built5.ok, "netlist 5 V");
assert(built5.netlist.includes("DC 5"), "état logique à 5 V");
assert(built5.netlist.includes("*5 }"), "porte AND sortie 5 V");
assert(built5.logicGates[0].vhi === 5 && built5.logicGates[0].vth === 2.5, "métadonnées 5 V");

const built33 = buildNetlistFromGraphicalState(andCircuit(3.3));
assert(built33.ok, "netlist 3,3 V");
assert(built33.netlist.includes("DC 3.3"), "état logique à 3,3 V");
assert(built33.netlist.includes("-1.65)"), "seuil 1,65 V (u(V−1,65))");
assert(built33.netlist.includes("*3.3"), "sortie porte 3,3 V");
assert(built33.logicGates[0].vhi === 3.3 && built33.logicGates[0].vth === 1.65, "métadonnées 3,3 V");

console.log("logic-rails-netlist.test.mjs : OK");
