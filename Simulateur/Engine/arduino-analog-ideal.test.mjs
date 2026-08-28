import assert from "node:assert/strict";
import { voltageToAdc, resolveNetVoltage, readUnoAnalogInputs, reachableJonctionsViaSeriesPassives } from "./arduino-analog-ideal.mjs";
import {
    createArduinoRuntime,
    stepArduinoRuntime,
    getRuntimeSerialTx,
} from "./arduino-sketch-parse.mjs";

assert.equal(voltageToAdc(0), 0);
assert.equal(voltageToAdc(5), 1023);
assert.equal(voltageToAdc(2.5), 512);

const potCircuit = {
    components: [
        { type: "vcc", label: "VCC1", value: 5 },
        { type: "gnd", label: "GND1" },
        {
            type: "potentiometer",
            label: "POT1",
            value: "10k",
            position: 50,
        },
        { type: "arduino_uno", label: "UNO1", sketch: "" },
    ],
    wires: [
        { fromJonctionId: "VCC1_in", toJonctionId: "POT1_in" },
        { fromJonctionId: "POT1_out", toJonctionId: "GND1_in" },
        { fromJonctionId: "POT1_wip", toJonctionId: "UNO1_A0" },
    ],
    autoJunctions: [],
};

const vMid = resolveNetVoltage("UNO1_A0", {
    components: potCircuit.components,
    wires: potCircuit.wires,
    autoJunctions: [],
});
assert.ok(Math.abs(vMid - 2.5) < 0.05, `pot milieu ~2.5 V, got ${vMid}`);

const adc = readUnoAnalogInputs(
    { label: "UNO1" },
    {
        components: potCircuit.components,
        wires: potCircuit.wires,
        autoJunctions: [],
    }
);
assert.ok(adc.A0 >= 500 && adc.A0 <= 525, `ADC milieu ~512, got ${adc.A0}`);

const analogSketch = `const int brocheAnalogique = A0;
void setup() { Serial.begin(9600); }
void loop() {
  int valeurBrute = analogRead(brocheAnalogique);
  Serial.println(valeurBrute);
  delay(500);
}`;

const rt = createArduinoRuntime({ sketch: analogSketch });
stepArduinoRuntime(rt, 100, {}, { A0: 512 });
const log = getRuntimeSerialTx(rt);
assert.ok(log.includes("512"), `Serial doit afficher 512, got: ${log}`);

const userSketch = `const int brocheAnalogique = A0;
void setup() { Serial.begin(9600); }
void loop() {
  int valeurBrute = analogRead(brocheAnalogique);
  float tension = valeurBrute * (5.0 / 1023.0);
  Serial.print("Valeur brute (0-1023) : ");
  Serial.print(valeurBrute);
  Serial.print("  |  Tension : ");
  Serial.print(tension);
  Serial.println(" V");
  delay(500);
}`;

const rt2 = createArduinoRuntime({ sketch: userSketch });
stepArduinoRuntime(rt2, 100, {}, { A0: 512 });
const log2 = getRuntimeSerialTx(rt2);
assert.ok(log2.includes("512"), `valeurBrute attendue 512 dans: ${log2}`);
assert.ok(/Tension\s*:\s*2\.50/.test(log2), `tension ~2.50 V attendue dans: ${log2}`);

const globalFloatSketch = `float tension;
const int brocheAnalogique = A0;
void setup() { Serial.begin(9600); }
void loop() {
  int valeurBrute = analogRead(brocheAnalogique);
  tension = valeurBrute * (5.0 / 1023.0);
  Serial.print("Tension : ");
  Serial.println(tension);
  delay(500);
}`;
const rt3 = createArduinoRuntime({ sketch: globalFloatSketch });
stepArduinoRuntime(rt3, 100, {}, { A0: 512 });
const log3 = getRuntimeSerialTx(rt3);
assert.ok(/Tension\s*:\s*2\.50/.test(log3), `float global → tension ~2.50 V, got: ${log3}`);

const concatSketch = `void setup() { Serial.begin(9600); }
void loop() {
  int valeurBrute = analogRead(A0);
  float tension = valeurBrute * (5.0 / 1023.0);
  Serial.println("Tension : " + String(tension) + " V");
  delay(500);
}`;
const rt4 = createArduinoRuntime({ sketch: concatSketch });
stepArduinoRuntime(rt4, 100, {}, { A0: 512 });
const log4 = getRuntimeSerialTx(rt4);
assert.ok(/Tension\s*:\s*2\.50\s*V/.test(log4), `concat String(tension), got: ${log4}`);

const multilineSketch = `void setup() { Serial.begin(9600); }
void loop() {
  int valeurBrute = analogRead(A0);
  float tension = valeurBrute
    * (5.0 / 1023.0);
  Serial.print("Tension : ");
  Serial.println(tension);
  delay(500);
}`;
const rt5 = createArduinoRuntime({ sketch: multilineSketch });
stepArduinoRuntime(rt5, 100, {}, { A0: 512 });
const log5 = getRuntimeSerialTx(rt5);
assert.ok(/Tension\s*:\s*2\.50/.test(log5), `formule multiligne → ~2.50 V, got: ${log5}`);

const unoPotCircuit = {
    components: [
        { type: "arduino_uno", label: "UNO1", sketch: "" },
        { type: "potentiometer", label: "POT1", value: "10k", position: 50 },
    ],
    wires: [
        { fromJonctionId: "UNO1_5V", toJonctionId: "POT1_in" },
        { fromJonctionId: "POT1_out", toJonctionId: "UNO1_GND" },
        { fromJonctionId: "POT1_wip", toJonctionId: "UNO1_A0" },
    ],
    autoJunctions: [],
};
const vUnoPot = resolveNetVoltage("UNO1_A0", {
    components: unoPotCircuit.components,
    wires: unoPotCircuit.wires,
    autoJunctions: [],
});
assert.ok(Math.abs(vUnoPot - 2.5) < 0.1, `UNO 5V/GND + pot → ~2.5 V, got ${vUnoPot}`);

const gpio2Led = {
    components: [
        {
            type: "esp32_upesy_lp",
            label: "UPLP1",
            pinModes: { GPIO2: "OUTPUT" },
            pinLevels: { GPIO2: 1 },
            liveLevels: { GPIO2: 1 },
        },
        { type: "resistor", label: "R2", value: "330" },
        { type: "led", label: "LED1" },
        { type: "gnd", label: "GND2" },
    ],
    wires: [
        { fromJonctionId: "UPLP1_GPIO2", toJonctionId: "R2_in" },
        { fromJonctionId: "R2_out", toJonctionId: "LED1_in" },
        { fromJonctionId: "LED1_out", toJonctionId: "GND2_in" },
    ],
    autoJunctions: [],
};
const vGpio2 = resolveNetVoltage("UPLP1_GPIO2", gpio2Led);
assert.ok(Math.abs(vGpio2 - 3.3) < 0.05, `GPIO2 OUTPUT HIGH avec 330 Ω, got ${vGpio2}`);
const viaR = reachableJonctionsViaSeriesPassives("LED1_in", gpio2Led);
assert.ok(viaR.has("UPLP1_GPIO2"), "LED derrière 330 Ω doit atteindre GPIO2");

console.log("arduino-analog-ideal.test.mjs OK");
