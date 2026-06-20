import assert from "node:assert/strict";
import {
    parseArduinoSketch,
    resolvePinLevelsAt,
    createArduinoRuntime,
    stepArduinoRuntime,
    arduinoRuntimeLevels,
} from "./arduino-sketch-parse.mjs";

const whileSketch = `int x=0;
void setup() {
  DDRD=0b11111111;
  DDRB=0b00000011;
  PORTD=0xFF;
  PORTB=3;
}
void loop() {
  if(x==0) {
    while(PORTB>0) {
      PORTB=PORTB-1;
      delay(1000);
    }
    if(PORTD>1) {
      PORTD=PORTD/2;
      delay(100);
    } else {
      x=1;
    }
  }
  if(x==1) {
    if(PORTD<0xFF) {
      PORTD=PORTD*2+1;
      delay(100);
    } else {
      x=0;
    }
  }
}`;

const parsed = parseArduinoSketch(whileSketch);
assert.ok(parsed.pinPhases?.length >= 3, "while PORTB: au moins 3 phases delay(1000)");

const portbAfterWhile = parsed.pinPhases[2].levels;
assert.equal(portbAfterWhile.D8, 0, "après while PORTB=0 → D8 off");
assert.equal(portbAfterWhile.D9, 0, "après while PORTB=0 → D9 off");

const uno = { type: "arduino_uno", label: "UNO1", sketch: whileSketch, ...parsed };

const rt = createArduinoRuntime(uno);
assert.equal(rt.state.regs.PORTB, 3, "setup laisse PORTB=3");

stepArduinoRuntime(rt, 500, {});
let lv = arduinoRuntimeLevels(rt);
assert.equal(lv.D8, 0, "t=0.5s PORTB=2 → D8 off");
assert.equal(lv.D9, 1, "t=0.5s PORTB=2 → D9 on");

stepArduinoRuntime(rt, 2600, {});
assert.equal(rt.state.regs.PORTB, 0, "while terminé PORTB=0");
lv = arduinoRuntimeLevels(rt);
assert.equal(lv.D8, 0, "PORTB=0 D8 off");
assert.equal(lv.D9, 0, "PORTB=0 D9 off");

const simpleWhile = `void setup(){ DDRB=0x03; PORTB=2; }
void loop(){ while(PORTB>0){ PORTB=PORTB-1; delay(500); } delay(100); }`;
const p2 = parseArduinoSketch(simpleWhile);
assert.ok(p2.pinPhases?.length >= 2, "while simple: phases delay");
assert.equal(p2.pinPhases[0].levels.D8, 1, "phase0 D8 (PORTB=1)");
assert.equal(p2.pinPhases[1].levels.D8, 0, "phase1 D8 off (PORTB=0)");

console.log("arduino-while-portb.test.mjs OK");
