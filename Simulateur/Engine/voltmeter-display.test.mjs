/**
 * node Simulateur/Engine/voltmeter-display.test.mjs
 */
import { quantizeVoltmeterReading } from "./voltmeter-display.mjs";

if (quantizeVoltmeterReading(-5) !== -5) throw new Error("DC -5 V");
if (quantizeVoltmeterReading(-3.3) !== -3.3) throw new Error("DC -3.3 V");
if (quantizeVoltmeterReading(-0.8) !== -0.8) throw new Error("DC -0.8 V");

if (quantizeVoltmeterReading(0.2) !== 0) throw new Error("bruit ~0 V");
if (quantizeVoltmeterReading(5.01) !== 5) throw new Error("arrondi +5 V");

const logic = [0, 5, 0, 5, 0, 5];
if (quantizeVoltmeterReading(4.8, logic) !== 5) throw new Error("logique haut");
if (quantizeVoltmeterReading(0.1, logic) !== 0) throw new Error("logique bas");

const ac = [-5, 5, -5, 5];
if (quantizeVoltmeterReading(-3, ac) !== -3) throw new Error("AC instant -3 V");
if (quantizeVoltmeterReading(3, ac) !== 3) throw new Error("AC instant +3 V");

console.log("voltmeter-display.test.mjs : OK");
