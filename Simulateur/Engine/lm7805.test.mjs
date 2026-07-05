import assert from "node:assert/strict";
import { resolveNetVoltage } from "./arduino-analog-ideal.mjs";
import { lm7805OutputVolts, appendLm7805Netlist } from "./lm7805.mjs";

assert.equal(lm7805OutputVolts({}, 9, true), 5);
assert.equal(lm7805OutputVolts({}, 6, true), 4);
assert.equal(lm7805OutputVolts({}, 9, false), 0);

const circuit = {
    components: [
        { type: "battery", label: "BAT1", value: 9 },
        { type: "gnd", label: "GND1" },
        { type: "lm7805", label: "U1", vout: 5, vinMin: 7, dropout: 2 },
        { type: "resistor", label: "R1", value: "10k" },
    ],
    wires: [
        { fromJonctionId: "BAT1_in", toJonctionId: "U1_IN" },
        { fromJonctionId: "BAT1_out", toJonctionId: "GND1_out" },
        { fromJonctionId: "U1_GND", toJonctionId: "GND1_out" },
        { fromJonctionId: "U1_OUT", toJonctionId: "R1_in" },
        { fromJonctionId: "R1_out", toJonctionId: "GND1_out" },
    ],
    autoJunctions: [],
};

const ctx = {
    components: circuit.components,
    wires: circuit.wires,
    autoJunctions: [],
};

const vOut = resolveNetVoltage("U1_OUT", ctx);
assert.ok(Math.abs(vOut - 5) < 0.05, `sortie ~5 V, got ${vOut}`);

const vLoad = resolveNetVoltage("R1_in", ctx);
assert.ok(Math.abs(vLoad - 5) < 0.05, `charge ~5 V, got ${vLoad}`);

const lines = [];
appendLm7805Netlist(
    { id: "U1", type: "lm7805", vout: 5, vinMin: 7, dropout: 2 },
    {
        nodeFor: (k) => k.replace("#", "_"),
        lines,
        warnings: [],
        terminalWireCount: new Map([
            ["U1#0", 1],
            ["U1#1", 1],
            ["U1#2", 1],
        ]),
        spiceBranchName: (p, id) => `${p}${id}`,
    }
);
assert.ok(lines.some((l) => l.includes("B7805U1")), `SPICE: ${lines.join(";")}`);

console.log("lm7805.test.mjs OK");
