/**
 * node Simulateur/Engine/ldr.test.mjs
 */
import assert from "node:assert/strict";
import {
    ldrResistanceOhm,
    stepLdrLux,
    clampLdrLux,
    formatLdrOhms,
    LDR_R10_OHM,
    LDR_RDARK_OHM,
    LDR_RMIN_OHM,
} from "./ldr.mjs";
import { buildNetlistFromGraphicalState } from "./schematic-to-spice.mjs";
import { resolveNetVoltage, readUnoAnalogInputs } from "./arduino-analog-ideal.mjs";

assert.equal(clampLdrLux(-5), 0);
assert.equal(clampLdrLux(99999), 10000);

const r10 = ldrResistanceOhm({ lux: 10 });
assert.ok(Math.abs(r10 - LDR_R10_OHM) < 1, `10 lx → 10 kΩ, got ${r10}`);

const rDark = ldrResistanceOhm({ lux: 0 });
assert.equal(rDark, LDR_RDARK_OHM);

const rBright = ldrResistanceOhm({ lux: 10000 });
assert.ok(rBright < r10, "plus de lumière → R plus faible");
assert.ok(rBright >= LDR_RMIN_OHM);

const r100 = ldrResistanceOhm({ lux: 100 });
assert.ok(r100 < r10 && r100 > rBright, "100 lx entre 10 lx et 10 000 lx");

assert.equal(stepLdrLux(100, 1), 200);
assert.equal(stepLdrLux(100, -1), 50);
assert.equal(stepLdrLux(0, -1), 0);
assert.equal(stepLdrLux(10000, 1), 10000);

assert.equal(formatLdrOhms(10000), "10.0k");
assert.equal(formatLdrOhms(1e6), "1.0M");

const spice = buildNetlistFromGraphicalState({
    components: [
        { id: "VDC1", type: "vsource", value: "5" },
        { id: "GND1", type: "ground" },
        { id: "LDR1", type: "ldr", lux: 10 },
        { id: "R1", type: "resistor", value: "10k" },
    ],
    wires: [
        { solid: true, fromKey: "VDC1#0", toKey: "LDR1#0" },
        { solid: true, fromKey: "LDR1#1", toKey: "R1#0" },
        { solid: true, fromKey: "R1#1", toKey: "GND1#0" },
        { solid: true, fromKey: "VDC1#1", toKey: "GND1#0" },
    ],
});
assert.equal(spice.ok, true, (spice.errors || []).join("; "));
assert.match(spice.netlist, /R_LDR1\s+\S+\s+\S+\s+10000/, `netlist LDR 10 lx = 10 kΩ\n${spice.netlist}`);

const divider = {
    components: [
        { type: "vcc", label: "VCC1", value: 5 },
        { type: "gnd", label: "GND1" },
        { type: "ldr", label: "LDR1", lux: 10 },
        { type: "resistor", label: "R1", value: "10k" },
        { type: "arduino_uno", label: "UNO1" },
    ],
    wires: [
        { fromJonctionId: "VCC1_out", toJonctionId: "LDR1_in" },
        { fromJonctionId: "LDR1_out", toJonctionId: "R1_in" },
        { fromJonctionId: "R1_out", toJonctionId: "GND1_out" },
        { fromJonctionId: "LDR1_out", toJonctionId: "UNO1_A0" },
    ],
    autoJunctions: [],
};
const vMid = resolveNetVoltage("UNO1_A0", divider);
assert.ok(Math.abs(vMid - 2.5) < 0.05, `diviseur LDR 10 lx / 10 kΩ → 2.5 V, got ${vMid}`);
const adc = readUnoAnalogInputs({ label: "UNO1" }, divider);
assert.ok(adc.A0 >= 500 && adc.A0 <= 525, `ADC ~512, got ${adc.A0}`);

const dark = { ...divider, components: divider.components.map((c) => (c.type === "ldr" ? { ...c, lux: 0 } : c)) };
const vDark = resolveNetVoltage("UNO1_A0", dark);
assert.ok(vDark < 0.2, `obscurité → tension basse (LDR >> 10 kΩ), got ${vDark}`);

console.log("ldr.test.mjs OK");
