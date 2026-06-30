import assert from "node:assert/strict";
import {
    parseArduinoSketch,
    createArduinoRuntime,
    stepArduinoRuntime,
    arduinoRuntimeLevels,
    sketchHasLoop,
    getRuntimeSerialTx,
} from "./arduino-sketch-parse.mjs";

const blink = `
void setup() {
  pinMode(13, OUTPUT);
}
void loop() {
  digitalWrite(13, HIGH);
  delay(500);
  digitalWrite(13, LOW);
  delay(500);
}
`;

const parsed = parseArduinoSketch(blink);
assert.equal(parsed.pinModes.D13, "OUTPUT");
assert.deepEqual(parsed.pinPulses.D13, { highSec: 0.5, lowSec: 0.5 });
assert.equal(parsed.pinLevels.D13, undefined);

const alwaysOn = `
void setup() { pinMode(LED_BUILTIN, OUTPUT); }
void loop() { digitalWrite(LED_BUILTIN, HIGH); delay(1000); }
`;
const on = parseArduinoSketch(alwaysOn);
assert.equal(on.pinModes.D13, "OUTPUT");
assert.equal(on.pinLevels.D13, 1);

const bcdSketch = `
void setup() {
  pinMode(13, OUTPUT);
  pinMode(12, OUTPUT);
  pinMode(11, OUTPUT);
  pinMode(10, OUTPUT);
}
void loop() {
  digitalWrite(13, 1);
  digitalWrite(12, 1);
  digitalWrite(11, 0);
  digitalWrite(10, 0);
  delay(1000);
}
`;
const bcd = parseArduinoSketch(bcdSketch);
assert.equal(bcd.pinLevels.D13, 1);
assert.equal(bcd.pinLevels.D12, 1);
assert.equal(bcd.pinLevels.D11, 0);
assert.equal(bcd.pinLevels.D10, 0);
assert.equal(bcd.pinPulses.D13, undefined);

const toggleSketch = `
void setup() {
  pinMode(13, OUTPUT);
  pinMode(12, OUTPUT);
  pinMode(11, OUTPUT);
  pinMode(10, OUTPUT);
}
void loop() {
  digitalWrite(13, 1);
  digitalWrite(12, 0);
  digitalWrite(11, 0);
  digitalWrite(10, 1);
  delay(1000);
  digitalWrite(13, 0);
  digitalWrite(12, 0);
  digitalWrite(11, 0);
  digitalWrite(10, 0);
  delay(1000);
}`;
const toggle = parseArduinoSketch(toggleSketch);
assert.equal(toggle.pinPhases.length, 2);
assert.equal(toggle.pinPhases[0].levels.D13, 1);
assert.equal(toggle.pinPhases[0].levels.D10, 1);
assert.equal(toggle.pinPhases[1].levels.D13, 0);
assert.equal(toggle.pinLevels.D13, undefined);

assert.equal(sketchHasLoop(blink), true);
assert.equal(sketchHasLoop("void setup() {}"), false);

const counterSketch = `
void setup() {
  DDRD = 0xFF;
}
byte x = 0;
void loop() {
  PORTD = x;
  x++;
}
`;
const rtCounter = createArduinoRuntime({ sketch: counterSketch });
stepArduinoRuntime(rtCounter, 16, {});
stepArduinoRuntime(rtCounter, 16, {});
assert.equal(arduinoRuntimeLevels(rtCounter).D0, 1);

const rtBlink = createArduinoRuntime({ sketch: blink });
stepArduinoRuntime(rtBlink, 600, {});
assert.equal(arduinoRuntimeLevels(rtBlink).D13, 0);

const serialSketch = `
void setup() {
  Serial.begin(9600);
  Serial.println("Hello");
}
void loop() {
  Serial.print("T=");
  Serial.println(42);
  delay(1000);
}
`;
const rtSerial = createArduinoRuntime({ sketch: serialSketch });
assert.equal(getRuntimeSerialTx(rtSerial), "Hello\n");
stepArduinoRuntime(rtSerial, 100, {});
assert.ok(getRuntimeSerialTx(rtSerial).includes("T=42"));
assert.equal(arduinoRuntimeLevels(rtSerial).D1, 1);

const shiftParsed = parseArduinoSketch(`void setup(){ DDRD=0xFF; PORTD=1; } void loop(){ PORTD=PORTD<<1; delay(500); }`);
assert.ok(shiftParsed.pinPhases?.length >= 2, "PORTD<<1 phases");
assert.equal(shiftParsed.pinPhases[0].levels.D1, 1);

const incParsed = parseArduinoSketch(`void setup(){ DDRD=0xFF; PORTD=0; } void loop(){ PORTD=PORTD+1; delay(500); }`);
assert.ok(incParsed.pinPhases?.length >= 2, "PORTD+1 phases");
assert.equal(incParsed.pinPhases[0].levels.D0, 1);
assert.equal(incParsed.pinPhases[1].levels.D1, 1);

const gpioRead = parseArduinoSketch(
    `void setup(){} void loop(){ if (digitalRead(4)==0) { digitalWrite(2,HIGH); } delay(100); }`,
    "esp32_devkit"
);
assert.equal(gpioRead.pinModes.GPIO4, "INPUT_PULLUP", "digitalRead(4) → GPIO4 entrée");

const rtBtn = createArduinoRuntime({
    type: "esp32_devkit",
    sketch: `void setup(){} void loop(){ if (digitalRead(4)==0) { digitalWrite(2,HIGH); } else { digitalWrite(2,LOW); } delay(50); }`,
});
stepArduinoRuntime(rtBtn, 60, { GPIO4: 0 }, {});
assert.equal(arduinoRuntimeLevels(rtBtn).GPIO2, 1, "GPIO2 HIGH si GPIO4 à 0");
stepArduinoRuntime(rtBtn, 60, { GPIO4: 1 }, {});
assert.equal(arduinoRuntimeLevels(rtBtn).GPIO2, 0, "GPIO2 LOW si GPIO4 relâché");

console.log("arduino-sketch-parse.test.mjs OK");
