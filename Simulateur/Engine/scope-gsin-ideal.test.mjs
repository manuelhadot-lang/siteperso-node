import {
    findGsinDriveForScopeChannel,
    gsinVoltageAt,
    synthesizeGsinScopeTrace,
} from "./scope-gsin-ideal.mjs";

const gsin = {
    type: "gsin",
    label: "Sin_1",
    peakAmplitude: 5,
    frequency: 1000,
    offset: 0,
};
const osc = { type: "oscilloscope", label: "Osci_1" };
const wires = [{ solid: true, fromKey: "Sin_1_out", toKey: "Osci_1_CH2" }];
const auto = [];

const ch2 = findGsinDriveForScopeChannel("Osci_1", "CH2", [gsin, osc], wires, auto);
if (ch2?.label !== "Sin_1") throw new Error("ch2 drive");

const v = gsinVoltageAt(gsin, 0.00025);
if (Math.abs(v) < 4) throw new Error(`v0 ${v}`);

const trace = synthesizeGsinScopeTrace(gsin, 0.001, 0.5, 0);
if (trace.length < 64) throw new Error(`trace ${trace.length}`);

console.log("scope-gsin-ideal.test.mjs : OK");
