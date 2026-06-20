import assert from "node:assert/strict";
import {
    parseArduinoSketch,
    resolvePinLevelsAt,
    applyArduinoSketchToComponent,
} from "./arduino-sketch-parse.mjs";
import { getIdealBargraphFromArduino } from "./arduino-gpio-ideal.mjs";

const counterSketch = `void setup() {
  DDRD=0b11111111;
  PORTD=0x00;
}
void loop() {
  PORTD=PORTD+1;
  delay(1000);
}`;

const shiftSketch = `void setup() {
  DDRD=0b11111111;
  PORTD=0x01;
}
void loop() {
  PORTD=PORTD<<1;
  delay(1000);
}`;

function parse(sketch) {
    const p = parseArduinoSketch(sketch);
    const uno = { label: "UNO1", type: "arduino_uno", sketch, ...p };
    return uno;
}

const unoCounter = parse(counterSketch);
assert.ok(unoCounter.pinPhases?.length >= 2, "counter: pinPhases attendues");
assert.equal(unoCounter.pinPhases[0].levels.D0, 1, "counter phase0 D0");
assert.equal(unoCounter.pinPhases[1].levels.D1, 1, "counter phase1 D1 (PORTD=2)");
assert.equal(unoCounter.pinPhases[2].levels.D0, 1, "counter phase2 D0");
assert.equal(unoCounter.pinPhases[2].levels.D1, 1, "counter phase2 D1 (PORTD=3)");

const lv05 = resolvePinLevelsAt(unoCounter, 0.5);
assert.equal(lv05.D0, 1, "t=0.5s D0");

const lv15 = resolvePinLevelsAt(unoCounter, 1.5);
assert.equal(lv15.D0, 0, "t=1.5s D0 off");
assert.equal(lv15.D1, 1, "t=1.5s D1 (PORTD=2)");

const lv25 = resolvePinLevelsAt(unoCounter, 2.5);
assert.equal(lv25.D0, 1, "t=2.5s D0");
assert.equal(lv25.D1, 1, "t=2.5s D1 (PORTD=3)");

const unoShift = parse(shiftSketch);
assert.ok(unoShift.pinPhases?.length >= 2, "shift: pinPhases");
assert.equal(unoShift.pinPhases[0].levels.D1, 1, "shift phase0 D1");
assert.equal(unoShift.pinPhases[1].levels.D2, 1, "shift phase1 D2");

applyArduinoSketchToComponent(unoCounter);
const barComps = [unoCounter, { label: "BAR1", type: "bargraph_dc10h" }, { label: "GND1", type: "gnd" }];
const barWires = [];
for (let i = 0; i < 8; i++) {
    barWires.push({ fromJonctionId: `UNO1_D${i}`, toJonctionId: `BAR1_s${i + 1}` });
}
barWires.push({ fromJonctionId: "BAR1_COM", toJonctionId: "GND1_out" });

const bg = getIdealBargraphFromArduino("BAR1", barComps, barWires, 0.5);
assert.ok(bg?.segments?.s1, "bargraph s1 at t=0.5");

console.log("arduino-portd-counter.test.mjs OK");
