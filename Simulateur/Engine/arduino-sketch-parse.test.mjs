import assert from "node:assert/strict";
import { parseArduinoSketch } from "./arduino-sketch-parse.mjs";

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

console.log("arduino-sketch-parse.test.mjs OK");
