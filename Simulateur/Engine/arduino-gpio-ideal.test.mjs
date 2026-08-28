import assert from "node:assert/strict";
import { parseArduinoSketch, applyArduinoSketchToComponent, resolvePinLevelsAt } from "./arduino-sketch-parse.mjs";
import { getIdealVoltmeterVoltage, getIdealSeg7FromArduino, getIdealBargraphFromArduino, getIdealArduinoBcdForCd4511 } from "./arduino-gpio-ideal.mjs";

const sketch3 = `void setup(){
  pinMode(13, OUTPUT); pinMode(12, OUTPUT); pinMode(11, OUTPUT); pinMode(10, OUTPUT);
}
void loop(){
  digitalWrite(13, 1); digitalWrite(12, 1); digitalWrite(11, 0); digitalWrite(10, 0);
}`;

const sketch0 = `void setup(){
  pinMode(13, OUTPUT); pinMode(12, OUTPUT); pinMode(11, OUTPUT); pinMode(10, OUTPUT);
}
void loop(){
  digitalWrite(13, 0); digitalWrite(12, 0); digitalWrite(11, 0); digitalWrite(10, 0);
}`;

function makeCircuit(sketch) {
    const uno = { label: "UNO1", type: "arduino_uno", sketch };
    applyArduinoSketchToComponent(uno);
    const components = [
        uno,
        { label: "CD4511_1", type: "cd4511" },
        { label: "SEG1", type: "seg7" },
        { label: "V1", type: "voltmeter" },
        { label: "GND1", type: "gnd" },
    ];
    const wires = [
        { fromJonctionId: "UNO1_D13", toJonctionId: "CD4511_1_A" },
        { fromJonctionId: "UNO1_D12", toJonctionId: "CD4511_1_B" },
        { fromJonctionId: "UNO1_D11", toJonctionId: "CD4511_1_C" },
        { fromJonctionId: "UNO1_D10", toJonctionId: "CD4511_1_D" },
        { fromJonctionId: "CD4511_1_a", toJonctionId: "SEG1_a" },
        { fromJonctionId: "V1_out", toJonctionId: "UNO1_D13" },
        { fromJonctionId: "V1_in", toJonctionId: "GND1_out" },
    ];
    return { components, wires, uno };
}

const c3 = makeCircuit(sketch3);
assert.equal(getIdealVoltmeterVoltage("V1", c3.components, c3.wires), 5);
const seg3 = getIdealSeg7FromArduino("SEG1", c3.components, c3.wires);
assert.ok(seg3?.segments?.a && seg3?.segments?.b && seg3?.segments?.c, "chiffre 3");

const c0 = makeCircuit(sketch0);
assert.equal(getIdealArduinoBcdForCd4511("CD4511_1", c0.components, c0.wires), 0);
assert.equal(c0.uno.pinLevels.D13, 0);

const parsed = parseArduinoSketch(`void loop(){ digitalWrite(5,HIGH); digitalWrite(9,LOW); }`);
assert.equal(parsed.pinModes.D5, "OUTPUT");
assert.equal(parsed.pinLevels.D5, 1);
assert.equal(parsed.pinLevels.D9, 0);

const toggleSketch = `void setup(){
  pinMode(13, OUTPUT); pinMode(12, OUTPUT); pinMode(11, OUTPUT); pinMode(10, OUTPUT);
}
void loop(){
  digitalWrite(13, 1); digitalWrite(12, 0); digitalWrite(11, 0); digitalWrite(10, 1);
  delay(1000);
  digitalWrite(13, 0); digitalWrite(12, 0); digitalWrite(11, 0); digitalWrite(10, 0);
  delay(1000);
}`;
const ct = makeCircuit(toggleSketch);
assert.equal(getIdealArduinoBcdForCd4511("CD4511_1", ct.components, ct.wires, 0.5), 9);
assert.equal(getIdealArduinoBcdForCd4511("CD4511_1", ct.components, ct.wires, 1.5), 0);
assert.equal(resolvePinLevelsAt(ct.uno, 0.5).D13, 1);
assert.equal(resolvePinLevelsAt(ct.uno, 1.5).D13, 0);

const regSketch = `void setup(){ DDRD=0b0001111; } void loop(){ PORTD=10; }`;
function makePortDCircuit(sketch) {
    const uno = { label: "UNO1", type: "arduino_uno", sketch };
    applyArduinoSketchToComponent(uno);
    const components = [uno, { label: "CD4511_1", type: "cd4511" }, { label: "SEG1", type: "seg7" }];
    const wires = [
        { fromJonctionId: "UNO1_D0", toJonctionId: "CD4511_1_A" },
        { fromJonctionId: "UNO1_D1", toJonctionId: "CD4511_1_B" },
        { fromJonctionId: "UNO1_D2", toJonctionId: "CD4511_1_C" },
        { fromJonctionId: "UNO1_D3", toJonctionId: "CD4511_1_D" },
        { fromJonctionId: "CD4511_1_a", toJonctionId: "SEG1_a" },
    ];
    return { components, wires, uno };
}

const c6 = makePortDCircuit(`void setup(){ DDRD=0b00001111; } void loop(){ PORTD=6; }`);
assert.equal(getIdealArduinoBcdForCd4511("CD4511_1", c6.components, c6.wires), 6);
const seg6 = getIdealSeg7FromArduino("SEG1", c6.components, c6.wires);
assert.ok(seg6?.bcd === 6, "affichage 6");

for (let n = 0; n <= 9; n++) {
    const ct = makePortDCircuit(`void setup(){ DDRD=0b00001111; } void loop(){ PORTD=${n}; }`);
    assert.equal(getIdealArduinoBcdForCd4511("CD4511_1", ct.components, ct.wires), n, `PORTD=${n}`);
}

const sketch6 = `void setup(){ DDRD=0b00001111; } void loop(){ PORTD=6; }`;
const uno6 = { label: "UNO1", type: "arduino_uno", sketch: sketch6 };
applyArduinoSketchToComponent(uno6);
const comp6 = [uno6, { label: "CD45111", type: "cd4511" }, { label: "SEG1", type: "seg7" }];
const aj = [{ id: "auto_junc_1", x: 50, y: 0 }];
const wiresJunc = [
    { fromJonctionId: "UNO1_D0", toJonctionId: "CD45111_A" },
    { fromJonctionId: "UNO1_D1", toJonctionId: "CD45111_B" },
    { fromJonctionId: "UNO1_D2", toJonctionId: "CD45111_C" },
    { fromJonctionId: "UNO1_D3", toJonctionId: "CD45111_D" },
    { fromJonctionId: "CD45111_a", toJonctionId: "auto_junc_1", points: [{ x: 0, y: 0 }, { x: 50, y: 0 }] },
    { fromJonctionId: "auto_junc_1", toJonctionId: "SEG1_a", points: [{ x: 50, y: 0 }, { x: 100, y: 0 }] },
];
const segJunc = getIdealSeg7FromArduino("SEG1", comp6, wiresJunc, 0, aj);
assert.equal(segJunc?.bcd, 6, "SEG7 via jonction T");

const barSketch = `void setup(){ DDRD=0b11111111; } void loop(){ PORTD=0xFF; }`;
const barUno = { label: "UNO1", type: "arduino_uno", sketch: barSketch };
applyArduinoSketchToComponent(barUno);
const barComps = [barUno, { label: "BAR1", type: "bargraph_dc10h" }, { label: "GND1", type: "gnd" }];
const barWires = [];
for (let i = 0; i < 8; i++) {
    barWires.push({ fromJonctionId: `UNO1_D${i}`, toJonctionId: `BAR1_s${i + 1}` });
}
barWires.push({ fromJonctionId: "BAR1_COM", toJonctionId: "GND1_out" });
const barIdeal = getIdealBargraphFromArduino("BAR1", barComps, barWires);
assert.ok(barIdeal?.segments?.s1 && barIdeal?.segments?.s8, "bargraph s1–s8 allumés");
assert.equal(barIdeal?.segments?.s9, false);
assert.equal(barIdeal?.segments?.s10, false);

const ldr33 = {
    components: [
        { type: "vcc", label: "VCC1", value: 3.3 },
        { type: "ldr", label: "LDR1", lux: 10 },
        { type: "resistor", label: "R1", value: "10k" },
        { type: "gnd", label: "GND1" },
        { type: "voltmeter", label: "V2" },
    ],
    wires: [
        { fromJonctionId: "VCC1_out", toJonctionId: "LDR1_in" },
        { fromJonctionId: "LDR1_out", toJonctionId: "R1_in" },
        { fromJonctionId: "R1_out", toJonctionId: "GND1_out" },
        { fromJonctionId: "V2_out", toJonctionId: "R1_in" },
        { fromJonctionId: "V2_in", toJonctionId: "GND1_out" },
    ],
};
const vLdr33 = getIdealVoltmeterVoltage("V2", ldr33.components, ldr33.wires);
assert.ok(vLdr33 > 1.4 && vLdr33 < 1.8, `VCC 3,3 V + LDR 10 lx / 10 kΩ → +1,65 V, got ${vLdr33}`);

console.log("arduino-gpio-ideal.test.mjs OK");
