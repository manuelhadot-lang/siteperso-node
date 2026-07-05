import assert from "node:assert/strict";
import { l293dOutputVolts, appendL293dNetlist } from "./l293d.mjs";

assert.equal(l293dOutputVolts(5, 5, 0, 12, 0), 12);
assert.equal(l293dOutputVolts(5, 0, 5, 12, 0), 0);
assert.equal(l293dOutputVolts(0, 5, 0, 12, 0), 0);
assert.equal(l293dOutputVolts(5, 5, 0, 12, 0, 1.5), 12);

const lines = [];
appendL293dNetlist(
    { id: "U1", type: "l293d", vth: 1.5 },
    {
        nodeFor: (k) => k.replace("#", "_"),
        lines,
        warnings: [],
        terminalWireCount: new Map([
            ["U1#3", 1],
            ["U1#7", 1],
            ["U1#15", 1],
        ]),
        spiceBranchName: (p, id) => `${p}${id}`,
    }
);
assert.ok(lines.some((l) => l.includes("BL293DY1U1")), `SPICE Y1: ${lines.join(";")}`);
assert.ok(lines.some((l) => l.includes("BL293DY2U1")), `SPICE Y2: ${lines.join(";")}`);
assert.equal(lines.filter((l) => l.startsWith("BL293D")).length, 4);

console.log("l293d.test.mjs OK");