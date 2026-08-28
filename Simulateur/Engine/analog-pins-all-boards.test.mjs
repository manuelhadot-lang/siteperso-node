/**
 * analogRead / LDR sur UNO, ESP32-C3, DevKit et uPesy.
 * node Simulateur/Engine/analog-pins-all-boards.test.mjs
 */
import assert from "node:assert/strict";
import { boardProfile, analogReadPinLabel, digitalPinsForBoard } from "./micro-board-config.mjs";
import { resolveNetVoltage, readBoardAnalogInputs, ADC_INPUT_OHM } from "./arduino-analog-ideal.mjs";
import { evaluateLoopVarBindings } from "./arduino-sketch-parse.mjs";
import { ldrResistanceOhm } from "./ldr.mjs";

assert.equal(analogReadPinLabel(4, "arduino_uno"), "A4");
assert.equal(analogReadPinLabel(0, "arduino_uno"), "A0");
assert.equal(analogReadPinLabel(14, "arduino_uno"), "A0");
assert.equal(analogReadPinLabel(4, "esp32_upesy_lp"), "GPIO4");
assert.equal(analogReadPinLabel(4, "esp32_devkit"), "GPIO4");
assert.equal(analogReadPinLabel(4, "esp32_c3"), "GPIO4");
assert.equal(analogReadPinLabel(25, "esp32_upesy_lp"), "GPIO25");
assert.equal(analogReadPinLabel(35, "esp32_upesy_lp"), "GPIO35");

for (const type of ["esp32_c3", "esp32_devkit", "esp32_upesy_lp"]) {
    const pins = boardProfile(type).analogPinLabels();
    const expected = digitalPinsForBoard(type);
    for (const p of expected) {
        assert.ok(pins.includes(p), `${type} analog ${p}`);
    }
    assert.ok(pins.includes("GPIO4"), `${type} GPIO4 analogique`);
}

function railOf(type) {
    return type === "arduino_uno" ? "5V" : "3V3";
}

function vrefOf(type) {
    return type === "arduino_uno" ? 5 : 3.3;
}

function analogLabel(type, pin) {
    return analogReadPinLabel(pin, type);
}

function dividerCircuit(type, label, pinLabel, lux, withPulldown) {
    const rail = railOf(type);
    const wires = [
        { fromJonctionId: `${label}_${rail}`, toJonctionId: "LDR1_in" },
        { fromJonctionId: "LDR1_out", toJonctionId: `${label}_${pinLabel}` },
    ];
    const components = [
        { type, label, vbat: 3.7 },
        { type: "ldr", label: "LDR1", lux },
    ];
    if (withPulldown) {
        components.push({ type: "resistor", label: "R1", value: "10k" });
        wires.push(
            { fromJonctionId: `${label}_${pinLabel}`, toJonctionId: "R1_in" },
            { fromJonctionId: "R1_out", toJonctionId: `${label}_GND` }
        );
    }
    return { components, wires, autoJunctions: [] };
}

const boards = [
    { type: "arduino_uno", label: "UNO1", pin: 4 },
    { type: "esp32_c3", label: "C3_1", pin: 4 },
    { type: "esp32_devkit", label: "DK1", pin: 4 },
    { type: "esp32_upesy_lp", label: "UPLP1", pin: 4 },
];

for (const { type, label, pin } of boards) {
    const pinLabel = analogLabel(type, pin);
    const vref = vrefOf(type);
    const bright = dividerCircuit(type, label, pinLabel, 10000, true);
    const dark = dividerCircuit(type, label, pinLabel, 0, true);
    const vBright = resolveNetVoltage(`${label}_${pinLabel}`, { ...bright, adcGndOhm: ADC_INPUT_OHM });
    const vDark = resolveNetVoltage(`${label}_${pinLabel}`, { ...dark, adcGndOhm: ADC_INPUT_OHM });
    assert.ok(vBright > vDark + 0.4, `${type} pont LDR: clair ${vBright}V > sombre ${vDark}V`);

    const adcB = readBoardAnalogInputs({ type, label, vbat: 3.7 }, bright);
    const adcD = readBoardAnalogInputs({ type, label, vbat: 3.7 }, dark);
    assert.ok(adcB[pinLabel] > adcD[pinLabel] + 80, `${type} analogRead ${pinLabel} clair ${adcB[pinLabel]} > sombre ${adcD[pinLabel]}`);

    const adcMax = boardProfile(type).adcMax;
    const sketch = `void loop(){ int raw = analogRead(${pin}); float v = (raw / ${adcMax}.0) * ${vref}; }`;
    const bindB = evaluateLoopVarBindings(sketch, adcB, type);
    const bindD = evaluateLoopVarBindings(sketch, adcD, type);
    assert.ok(Number(bindB.raw) > Number(bindD.raw), `${type} analogRead(${pin}) suit le lux`);

    const oneLegBright = dividerCircuit(type, label, pinLabel, 10000, false);
    const oneLegDark = dividerCircuit(type, label, pinLabel, 0, false);
    const adc1B = readBoardAnalogInputs({ type, label, vbat: 3.7 }, oneLegBright);
    const adc1D = readBoardAnalogInputs({ type, label, vbat: 3.7 }, oneLegDark);
    assert.ok(
        adc1B[pinLabel] > adc1D[pinLabel] + 40,
        `${type} LDR seule (sans R) doit varier, clair ${adc1B[pinLabel]} sombre ${adc1D[pinLabel]}`
    );
}

const r10 = ldrResistanceOhm({ lux: 10 });
assert.ok(Math.abs(r10 - 10000) < 1);

const unoA4 = evaluateLoopVarBindings(
    `void loop(){ int raw = analogRead(4); }`,
    { A4: 640, D4: 0 },
    "arduino_uno"
);
assert.equal(Number(unoA4.raw), 640, "UNO analogRead(4) = A4, pas D4");

console.log("analog-pins-all-boards.test.mjs OK");
