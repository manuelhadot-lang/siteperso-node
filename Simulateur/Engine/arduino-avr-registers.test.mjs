import assert from "node:assert/strict";
import {
    arduinoPinToPortBit,
    applyDigitalWriteToRegisters,
    applyPinModeToRegisters,
    buildAvrRegistersFromParsed,
    createEmptyAvrRegisters,
    getPinPortLevel,
    isPinOutput,
    parseAvrRegisterWrites,
    registersToPinLevels,
    registersToPinModes,
} from "./arduino-avr-registers.mjs";
import { parseArduinoSketch, resolvePinLevelsAt } from "./arduino-sketch-parse.mjs";

assert.deepEqual(arduinoPinToPortBit(13), { port: "B", bit: 5, label: "D13" });
assert.deepEqual(arduinoPinToPortBit("A2"), { port: "C", bit: 2, label: "A2" });
assert.deepEqual(arduinoPinToPortBit(5), { port: "D", bit: 5, label: "D5" });

const reg = createEmptyAvrRegisters();
applyPinModeToRegisters(reg, "D13", "OUTPUT");
applyDigitalWriteToRegisters(reg, "D13", true);
assert.equal(reg.DDRB & (1 << 5), 1 << 5);
assert.equal(reg.PORTB & (1 << 5), 1 << 5);
assert.equal(isPinOutput(reg, "D13"), 1);
assert.equal(getPinPortLevel(reg, "D13"), 1);

applyPinModeToRegisters(reg, "A0", "INPUT_PULLUP");
assert.equal(reg.DDRC & 1, 0);
assert.equal(reg.PORTC & 1, 1);
assert.equal(registersToPinModes(reg).A0, "INPUT_PULLUP");

const direct = parseAvrRegisterWrites(`
  void setup() {
    DDRD |= (1 << 5);
    PORTD |= (1 << 5);
    DDRB |= (1 << PB5);
    PORTB &= ~(1 << 5);
    DDRC = 0x0F;
    PORTC = 0xFF;
  }
`);
assert.equal(direct.DDRD & (1 << 5), 1 << 5);
assert.equal(direct.PORTD & (1 << 5), 1 << 5);
assert.equal(direct.DDRB & (1 << 5), 1 << 5);
assert.equal(direct.PORTB & (1 << 5), 0);
assert.equal(direct.DDRC, 0x0f);
assert.equal(direct.PORTC, 0xff);

const sketch = `
void setup() {
  pinMode(13, OUTPUT);
  DDRD |= (1 << 6);
  PORTD |= (1 << 6);
}
void loop() {
  digitalWrite(13, HIGH);
  delay(500);
  digitalWrite(13, LOW);
  delay(500);
}`;
const parsed = parseArduinoSketch(sketch);
assert.equal(parsed.avrRegisters.DDRB & (1 << 5), 1 << 5);
assert.equal(parsed.pinModes.D6, "OUTPUT");
assert.equal(parsed.pinLevels.D6, 1);
assert.equal(parsed.pinPulses.D13?.highSec, 0.5);

const uno = { type: "arduino_uno", ...parsed, sketch };
assert.equal(resolvePinLevelsAt(uno, 0).D13, 1);
assert.equal(resolvePinLevelsAt(uno, 0.6).D13, 0);
assert.equal(resolvePinLevelsAt(uno, 0).D6, 1);

const analogSketch = `
void setup() { pinMode(A0, OUTPUT); }
void loop() { digitalWrite(A0, HIGH); delay(100); }`;
const ap = parseArduinoSketch(analogSketch);
assert.equal(ap.pinModes.A0, "OUTPUT");
assert.equal(ap.pinLevels.A0, 1);
assert.equal(ap.avrRegisters.DDRC & 1, 1);
assert.equal(ap.avrRegisters.PORTC & 1, 1);

console.log("arduino-avr-registers.test.mjs OK");
