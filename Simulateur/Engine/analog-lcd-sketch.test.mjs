import assert from "node:assert/strict";
import { evaluateLoopVarBindings } from "./arduino-sketch-parse.mjs";
import { parseGroveLcdFromSketch, resolveLcdDisplayAt } from "./grove-lcd-sketch-parse.mjs";
import { getIdealGroveLcdDisplay } from "./grove-lcd-ideal.mjs";
import { readUnoAnalogInputs, resolveNetVoltage } from "./arduino-analog-ideal.mjs";

const userSketch = `#include <rgb_lcd.h>

const int brocheAnalogique = A0;
rgb_lcd LCD;

void setup() {
  Serial.begin(9600);
  LCD.begin(16,2);
}

void loop() {
  int valeurBrute = analogRead(brocheAnalogique);
  float tension = valeurBrute * (5.0 / 1023.0);
  Serial.print("Tension : ");
  Serial.print(tension);
  LCD.print(tension);
  Serial.println(" V");
  delay(500);
}`;

const bindings = evaluateLoopVarBindings(userSketch, { A0: 512 });
assert.equal(bindings.valeurBrute, "512");
assert.equal(bindings.tension, "2.50");

const circuit = {
    components: [
        { type: "vcc", label: "VCC1", value: 5 },
        { type: "gnd", label: "GND1" },
        { type: "potentiometer", label: "POT1", value: "10k", position: 50 },
        {
            type: "arduino_uno",
            label: "UNO1",
            sketch: userSketch,
            lastCompileOk: true,
        },
        { type: "grove_lcd16x2", label: "LCD1", i2cAddress: 0x3e },
    ],
    wires: [
        { fromJonctionId: "VCC1_out", toJonctionId: "POT1_in" },
        { fromJonctionId: "POT1_out", toJonctionId: "GND1_out" },
        { fromJonctionId: "POT1_wip", toJonctionId: "UNO1_A0" },
        { fromJonctionId: "LCD1_SDA", toJonctionId: "UNO1_A4" },
        { fromJonctionId: "LCD1_SCL", toJonctionId: "UNO1_A5" },
        { fromJonctionId: "LCD1_VCC", toJonctionId: "VCC1_out" },
        { fromJonctionId: "LCD1_GND", toJonctionId: "GND1_out" },
    ],
    autoJunctions: [],
};

const ctx = {
    components: circuit.components,
    wires: circuit.wires,
    autoJunctions: [],
};

const vPot = resolveNetVoltage("UNO1_A0", ctx);
assert.ok(Math.abs(vPot - 2.5) < 0.1, `pot milieu ~2.5 V, got ${vPot}`);

const adc = readUnoAnalogInputs({ label: "UNO1" }, ctx);
assert.ok(adc.A0 >= 500 && adc.A0 <= 525, `ADC ~512, got ${adc.A0}`);

const printCtx = {
    collectVarBindings: () => evaluateLoopVarBindings(userSketch, adc),
};

const parsed = parseGroveLcdFromSketch(userSketch, printCtx);
assert.ok(parsed, "rgb_lcd sketch parsed");
assert.equal(parsed.loopVarBindings.tension, "2.50");

const display = resolveLcdDisplayAt(parsed, 600, { ctx: printCtx });
assert.ok(display?.lines[0].includes("2,50"), `LCD affiche tension avec virgule, got: "${display?.lines[0]}"`);

const ideal = getIdealGroveLcdDisplay(
    "LCD1",
    circuit.components,
    circuit.wires,
    circuit.autoJunctions,
    0.6,
    {}
);
assert.ok(ideal.wired, "LCD câblé");
assert.ok(ideal.lines[0].includes("2,50"), `LCD idéal ~2,50 V, got: "${ideal.lines[0]}"`);

console.log("analog-lcd-sketch.test.mjs OK");
