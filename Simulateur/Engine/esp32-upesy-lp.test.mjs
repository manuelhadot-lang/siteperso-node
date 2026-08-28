import assert from "node:assert/strict";
import { GRID_SIZE as G } from "../grid-constants.js";
import {
    ESP32_UPESY_LP_PIN_COUNT,
    ESP32_UPESY_LP_PIN,
    ESP32_UPESY_LP_LEFT_PINS,
    ESP32_UPESY_LP_RIGHT_PINS,
    ESP32_UPESY_LP_LEFT_PIN_Y,
    ESP32_UPESY_LP_RIGHT_PIN_Y,
    ESP32_UPESY_LP_JUNC_L,
    ESP32_UPESY_LP_JUNC_R,
    ESP32_UPESY_LP_GPIO_PINS,
    upesyGpio35Volts,
    clampUpesyVbat,
    UPESY_DEFAULT_VBAT,
    UPESY_VBAT_DIVIDER,
} from "../esp32-upesy-lp-layout.js";
import {
    isEsp32UpesyLpType,
    appendEsp32UpesyLpNetlist,
    ESP32_UPESY_LP_PIN as SPICE_PIN,
} from "./esp32-upesy-lp.mjs";
import {
    isEsp32BoardType,
    isEsp32WroomType,
    esp32LedBuiltinPin,
    boardProfile,
    esp32GpioNumbersForBoard,
} from "./micro-board-config.mjs";
import { voltageToAdc, readBoardAnalogInputs, resolveNetVoltage } from "./arduino-analog-ideal.mjs";
import { parseArduinoSketch, evaluateLoopVarBindings, createArduinoRuntime, stepArduinoRuntime, getRuntimeSerialTx } from "./arduino-sketch-parse.mjs";

assert.equal(ESP32_UPESY_LP_PIN_COUNT, 32);
assert.equal(ESP32_UPESY_LP_LEFT_PINS.length, 16);
assert.equal(ESP32_UPESY_LP_RIGHT_PINS.length, 16);
assert.ok(Number.isInteger(ESP32_UPESY_LP_JUNC_L / G));
assert.ok(Number.isInteger(ESP32_UPESY_LP_JUNC_R / G));
for (const y of [...ESP32_UPESY_LP_LEFT_PIN_Y, ...ESP32_UPESY_LP_RIGHT_PIN_Y]) {
    assert.ok(Number.isInteger(y / G), `broche Y=${y} hors grille`);
}
assert.equal(ESP32_UPESY_LP_PIN.GPIO35, 4);
assert.equal(ESP32_UPESY_LP_PIN.VIN, 13);
assert.equal(ESP32_UPESY_LP_PIN["5V"], 14);
assert.equal(ESP32_UPESY_LP_PIN["3V3"], 30);
assert.equal(ESP32_UPESY_LP_PIN.GPIO21, 20);
assert.equal(ESP32_UPESY_LP_PIN.GPIO22, 17);
assert.equal(SPICE_PIN.GPIO35, ESP32_UPESY_LP_PIN.GPIO35);

for (const n of [6, 8, 9, 10, 11]) {
    assert.ok(!ESP32_UPESY_LP_GPIO_PINS.includes(`GPIO${n}`), `GPIO${n} ne doit pas être exposé`);
}

assert.ok(isEsp32UpesyLpType("esp32_upesy_lp"));
assert.ok(isEsp32BoardType("esp32_upesy_lp"));
assert.ok(isEsp32WroomType("esp32_upesy_lp"));
assert.equal(esp32LedBuiltinPin("esp32_upesy_lp"), null);

const prof = boardProfile("esp32_upesy_lp");
assert.equal(prof.i2c.sda.name, "GPIO21");
assert.equal(prof.i2c.sda.idx, 20);
assert.equal(prof.i2c.scl.idx, 17);
assert.ok(esp32GpioNumbersForBoard("esp32_upesy_lp").includes(35));
assert.ok(!esp32GpioNumbersForBoard("esp32_upesy_lp").includes(6));

assert.equal(clampUpesyVbat(2), 3);
assert.equal(clampUpesyVbat(5), 4.3);
const v35 = upesyGpio35Volts(UPESY_DEFAULT_VBAT);
assert.ok(Math.abs(v35 - UPESY_DEFAULT_VBAT / UPESY_VBAT_DIVIDER) < 1e-9);

const adc = voltageToAdc(v35, 3.3, 4095);
const vBatBack = UPESY_VBAT_DIVIDER * (adc / 4095) * 3.3;
assert.ok(Math.abs(vBatBack - UPESY_DEFAULT_VBAT) < 0.02, `Vbat reconstituée ${vBatBack}`);

const analog = readBoardAnalogInputs(
    { type: "esp32_upesy_lp", label: "UPLP1", vbat: 3.7 },
    { components: [], wires: [], autoJunctions: [] }
);
assert.equal(analog.GPIO35, adc);

const lines = [];
appendEsp32UpesyLpNetlist(
    { id: "UPLP1", type: "esp32_upesy_lp", vbat: 3.7, pinModes: {}, pinLevels: {} },
    (key) => `n_${key.replace("#", "_")}`,
    lines,
    (letter, name) => `${letter}${name}`
);
const net = lines.join("\n");
assert.ok(net.includes("vbat35"), "source GPIO35 VBAT");
assert.ok(net.includes("DC 3.3"), "rail 3V3");
assert.ok(!/\bGPIO6\b/.test(net), "pas de GPIO6 flash");

const parsed = parseArduinoSketch(
    `void setup(){ Serial.begin(115200); } void loop(){ analogRead(35); delay(1000); }`,
    "esp32_upesy_lp"
);
assert.equal(parsed.pinModes.GPIO1, "OUTPUT", "UART TX0");

const sketchVbat = `void setup(){}
void loop(){
  int raw = analogRead(35);
  float vBat = 1.435 * (raw / 4095.0) * 3.3;
}`;
const bindings = evaluateLoopVarBindings(sketchVbat, { GPIO35: adc }, "esp32_upesy_lp");
assert.ok(bindings.raw, "raw analogRead");
assert.ok(Math.abs(Number(bindings.vBat) - UPESY_DEFAULT_VBAT) < 0.05, `vBat sketch ${bindings.vBat}`);

assert.ok(prof.analogPinLabels().includes("GPIO4"), "GPIO4 ADC2 doit être analogique");
assert.equal(analog.GPIO35, adc, "GPIO35 reste le pont batterie");

const ldrDiv = {
    components: [
        { type: "esp32_upesy_lp", label: "UPLP1", vbat: 3.7 },
        { type: "ldr", label: "LDR1", lux: 10 },
        { type: "resistor", label: "R1", value: "10k" },
    ],
    wires: [
        { fromJonctionId: "UPLP1_3V3", toJonctionId: "LDR1_in" },
        { fromJonctionId: "LDR1_out", toJonctionId: "UPLP1_GPIO4" },
        { fromJonctionId: "UPLP1_GPIO4", toJonctionId: "R1_in" },
        { fromJonctionId: "R1_out", toJonctionId: "UPLP1_GND" },
    ],
    autoJunctions: [],
};
const vGpio4 = resolveNetVoltage("UPLP1_GPIO4", ldrDiv);
assert.ok(Math.abs(vGpio4 - 1.65) < 0.05, `pont LDR 10 lx / 10 kΩ → 1.65 V, got ${vGpio4}`);
const analogLdr = readBoardAnalogInputs({ type: "esp32_upesy_lp", label: "UPLP1", vbat: 3.7 }, ldrDiv);
assert.ok(analogLdr.GPIO4 >= 2000 && analogLdr.GPIO4 <= 2100, `ADC GPIO4 12 bits ~2048, got ${analogLdr.GPIO4}`);
assert.equal(analogLdr.GPIO35, adc, "GPIO35 inchangé avec LDR sur GPIO4");

const sketchLdr = `void setup(){}
void loop(){
  int raw = analogRead(04);
  float vLdr = (raw / 4095.0) * 3.3;
}`;
const bindLdr = evaluateLoopVarBindings(sketchLdr, analogLdr, "esp32_upesy_lp");
assert.ok(Math.abs(Number(bindLdr.raw) - analogLdr.GPIO4) < 1, `analogRead(04) → GPIO4, got ${bindLdr.raw}`);
assert.ok(Math.abs(Number(bindLdr.vLdr) - 1.65) < 0.08, `vLdr sketch ${bindLdr.vLdr}`);

const sketchLdr4 = `void setup(){}
void loop(){
  int raw = analogRead(4);
}`;
const bind4 = evaluateLoopVarBindings(sketchLdr4, analogLdr, "esp32_upesy_lp");
assert.equal(Number(bind4.raw), analogLdr.GPIO4, "analogRead(4) → GPIO4");

const rtLdr = createArduinoRuntime({
    type: "esp32_upesy_lp",
    sketch: `void setup(){ Serial.begin(115200); }
void loop(){
  int raw = analogRead(04);
  float vLdr = (raw / 4095.0) * 3.3;
  Serial.print("Vldr = ");
  Serial.print(vLdr, 3);
  Serial.println(" V");
  delay(1000);
}`,
});
stepArduinoRuntime(rtLdr, 50, {}, analogLdr);
const serialLdr = getRuntimeSerialTx(rtLdr);
assert.ok(/Vldr\s*=\s*1\.6/.test(serialLdr), `Serial GPIO4 LDR, got: ${serialLdr}`);

console.log("esp32-upesy-lp.test.mjs OK");
