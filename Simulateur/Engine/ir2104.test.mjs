import assert from "node:assert/strict";
import { resolveNetVoltage } from "./arduino-analog-ideal.mjs";
import {
    ir2104InIsHigh,
    ir2104LoVolts,
    ir2104HoVolts,
    appendIr2104Netlist,
} from "./ir2104.mjs";

assert.equal(ir2104InIsHigh(5, 0, 2.5), true);
assert.equal(ir2104InIsHigh(2, 0, 2.5), false);
assert.equal(ir2104LoVolts(5, 0, 12), 0);
assert.equal(ir2104LoVolts(0, 0, 12), 12);
assert.equal(ir2104HoVolts(5, 0, 20, 10), 20);
assert.equal(ir2104HoVolts(0, 0, 20, 10), 10);

const circuit = {
    components: [
        { type: "battery", label: "BAT1", value: 12 },
        { type: "gnd", label: "GND1" },
        { type: "logic_terminal", label: "LOG1", state: 1 },
        { type: "ir2104", label: "U1", vth: 2.5 },
        { type: "resistor", label: "R1", value: "10k" },
    ],
    wires: [
        { fromJonctionId: "BAT1_in", toJonctionId: "U1_VCC" },
        { fromJonctionId: "BAT1_out", toJonctionId: "GND1_out" },
        { fromJonctionId: "U1_COM", toJonctionId: "GND1_out" },
        { fromJonctionId: "LOG1_out", toJonctionId: "U1_IN" },
        { fromJonctionId: "U1_LO", toJonctionId: "R1_in" },
        { fromJonctionId: "R1_out", toJonctionId: "GND1_out" },
    ],
    autoJunctions: [],
};

const ctx = {
    components: circuit.components,
    wires: circuit.wires,
    autoJunctions: [],
};

const vLo = resolveNetVoltage("U1_LO", ctx);
assert.ok(Math.abs(vLo - 0) < 0.05, `IN haut → LO bas, got ${vLo}`);

const lines = [];
appendIr2104Netlist(
    { id: "U1", type: "ir2104", vth: 2.5 },
    {
        nodeFor: (k) => k.replace("#", "_"),
        lines,
        warnings: [],
        terminalWireCount: new Map([
            ["U1#6", 1],
            ["U1#5", 1],
            ["U1#7", 1],
        ]),
        spiceBranchName: (p, id) => `${p}${id}`,
    }
);
assert.ok(lines.some((l) => l.includes("BIR2104LOU1")), `SPICE LO: ${lines.join(";")}`);
assert.ok(lines.some((l) => l.includes("BIR2104HOU1")), `SPICE HO: ${lines.join(";")}`);

console.log("ir2104.test.mjs OK");
