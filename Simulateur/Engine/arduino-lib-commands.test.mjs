import assert from "node:assert/strict";
import { resolveArduinoLibDoc } from "../arduino-lib-commands.mjs";

const lcd = resolveArduinoLibDoc("LiquidCrystal I2C");
assert.ok(lcd);
assert.ok(lcd.commands.some((c) => c.sig.includes("setCursor") && c.simSupported));

const wire = resolveArduinoLibDoc("Wire");
assert.ok(wire);

const unknown = resolveArduinoLibDoc("SomeRandomLib");
assert.equal(unknown, null);

console.log("arduino-lib-commands.test.mjs OK");
