/**
 * Bus I²C PCF8574 + HD44780 — formes d'onde réelles pour ngspice / oscilloscope.
 */

import { parseGroveLcdFromSketch } from "./grove-lcd-sketch-parse.mjs";
import { reachableTerminalKeys } from "./hc90-cascade.mjs";
import {
    I2C_SCL_PERIOD_SEC,
    I2C_SCL_HZ,
    formatSpiceTime,
    pwlToSpiceString,
} from "./i2c-protocol.mjs";
import { buildLcdI2cWaveformFromSketch } from "./lcd-pcf8574-i2c.mjs";

/** Indices broches UNO (alignés sur arduino-uno.mjs). */
const UNO_A4 = 11;
const UNO_A5 = 12;
const UNO_5V = 3;
const UNO_GND = 4;
const UNO_GND2 = 5;

const LCD_SDA = 0;
const LCD_SCL = 1;
const LCD_VCC = 2;
const LCD_GND = 3;

export { I2C_SCL_HZ, I2C_SCL_PERIOD_SEC };

export function sketchUsesI2cLcd(sketch) {
    return parseGroveLcdFromSketch(sketch || "") != null;
}

function isLcdPoweredEngine(lcdId, components, wires) {
    const vccNet = reachableTerminalKeys(`${lcdId}#${LCD_VCC}`, wires);
    const gndNet = reachableTerminalKeys(`${lcdId}#${LCD_GND}`, wires);
    let vccOk = false;
    let gndOk = false;
    for (const comp of components) {
        const id = comp.id || comp.label;
        if (!id) continue;
        if (vccNet.has(`${id}#0`) || vccNet.has(`${id}#1`)) {
            if (comp.type === "vcc" || comp.type === "battery" || comp.type === "vsource" || comp.type === "vterm") {
                vccOk = true;
            }
        }
        if (comp.type === "arduino_uno") {
            if (vccNet.has(`${id}#${UNO_5V}`) || vccNet.has(`${id}#2`)) vccOk = true;
            if (gndNet.has(`${id}#${UNO_GND}`) || gndNet.has(`${id}#${UNO_GND2}`)) gndOk = true;
        }
        if (gndNet.has(`${id}#0`) || gndNet.has(`${id}#1`)) {
            if (comp.type === "ground" || comp.type === "gnd" || comp.type === "battery") gndOk = true;
        }
    }
    return vccOk && gndOk;
}

function isLcdI2cWiredToUnoEngine(unoId, lcdId, wires) {
    const sdaNet = reachableTerminalKeys(`${lcdId}#${LCD_SDA}`, wires);
    const sclNet = reachableTerminalKeys(`${lcdId}#${LCD_SCL}`, wires);
    return sdaNet.has(`${unoId}#${UNO_A4}`) && sclNet.has(`${unoId}#${UNO_A5}`);
}

/**
 * Marque l'UNO comme émetteur I²C si sketch LiquidCrystal_I2C + LCD Grove câblé.
 */
export function annotateUnoI2cBusEngine(uno, components, wires) {
    if (!uno || uno.type !== "arduino_uno") return;
    const unoId = uno.id || uno.label;
    if (!unoId || !sketchUsesI2cLcd(uno.sketch)) {
        delete uno.i2cBus;
        return;
    }
    for (const lcd of components) {
        if (lcd.type !== "grove_lcd16x2") continue;
        const lcdId = lcd.id || lcd.label;
        if (!lcdId) continue;
        if (!isLcdI2cWiredToUnoEngine(unoId, lcdId, wires)) continue;
        if (!isLcdPoweredEngine(lcdId, components, wires)) continue;
        uno.i2cBus = {
            active: true,
            address: lcd.i2cAddress ?? 0x3e,
            lcdId,
        };
        return;
    }
    delete uno.i2cBus;
}

export function i2cBusMinPeriodSec(components) {
    for (const c of components) {
        if (c.type === "arduino_uno" && c.i2cBus?.active) return I2C_SCL_PERIOD_SEC;
    }
    return 0;
}

/**
 * Pull-up I²C + pilotes PWL (START/STOP/ACK, 100 kHz) sur SDA/SCL.
 */
export function appendI2cBusNetlist(c, nodeFor, lines, spiceBranchName, repeatUntilSec = 0.02) {
    if (!c?.i2cBus?.active) return;
    const wf = buildLcdI2cWaveformFromSketch(c.sketch || "", repeatUntilSec);
    if (!wf?.sda?.length || !wf?.scl?.length) return;

    const id = c.id;
    const nSda = nodeFor(`${id}#${UNO_A4}`);
    const nScl = nodeFor(`${id}#${UNO_A5}`);

    lines.push(`* ${id} I²C PCF8574 — ${I2C_SCL_HZ / 1000} kHz, START/STOP/ACK, PWL ${formatSpiceTime(wf.durationSec)} s`);
    lines.push(`${spiceBranchName("V", `${id}_SDA_DRV`)} ${nSda} 0 ${pwlToSpiceString(wf.sda)}`);
    lines.push(`${spiceBranchName("V", `${id}_SCL_DRV`)} ${nScl} 0 ${pwlToSpiceString(wf.scl)}`);
}
