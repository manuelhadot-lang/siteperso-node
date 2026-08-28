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
import { boardProfile, isMicroBoardType } from "./micro-board-config.mjs";

/** Indices broches UNO (rétrocompatibilité tests). */
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
        if (isMicroBoardType(comp.type)) {
            if (comp.type === "arduino_uno") {
                if (vccNet.has(`${id}#3`) || vccNet.has(`${id}#2`)) vccOk = true;
                if (gndNet.has(`${id}#4`) || gndNet.has(`${id}#5`)) gndOk = true;
            } else if (comp.type === "esp32_c3") {
                if (vccNet.has(`${id}#0`) || vccNet.has(`${id}#17`)) vccOk = true;
                if (gndNet.has(`${id}#1`) || gndNet.has(`${id}#2`)) gndOk = true;
            } else if (comp.type === "esp32_devkit") {
                if (vccNet.has(`${id}#0`) || vccNet.has(`${id}#35`)) vccOk = true;
                if (gndNet.has(`${id}#13`) || gndNet.has(`${id}#23`)) gndOk = true;
            } else if (comp.type === "esp32_upesy_lp") {
                if (vccNet.has(`${id}#30`) || vccNet.has(`${id}#14`)) vccOk = true;
                if (gndNet.has(`${id}#15`) || gndNet.has(`${id}#31`)) gndOk = true;
            }
        }
        if (gndNet.has(`${id}#0`) || gndNet.has(`${id}#1`)) {
            if (comp.type === "ground" || comp.type === "gnd" || comp.type === "battery") gndOk = true;
        }
    }
    return vccOk && gndOk;
}

function isLcdI2cWiredToBoardEngine(boardId, boardType, lcdId, wires) {
    const prof = boardProfile(boardType);
    const sdaNet = reachableTerminalKeys(`${lcdId}#${LCD_SDA}`, wires);
    const sclNet = reachableTerminalKeys(`${lcdId}#${LCD_SCL}`, wires);
    return (
        sdaNet.has(`${boardId}#${prof.i2c.sda.idx}`) &&
        sclNet.has(`${boardId}#${prof.i2c.scl.idx}`)
    );
}

/** @deprecated alias UNO */
function isLcdI2cWiredToUnoEngine(unoId, lcdId, wires) {
    return isLcdI2cWiredToBoardEngine(unoId, "arduino_uno", lcdId, wires);
}

/**
 * Marque la carte comme émetteur I²C si sketch LiquidCrystal_I2C + LCD Grove câblé.
 */
export function annotateMicroBoardI2cBusEngine(board, components, wires) {
    if (!board || !isMicroBoardType(board.type)) return;
    const boardId = board.id || board.label;
    if (!boardId || !sketchUsesI2cLcd(board.sketch)) {
        delete board.i2cBus;
        return;
    }
    for (const lcd of components) {
        if (lcd.type !== "grove_lcd16x2") continue;
        const lcdId = lcd.id || lcd.label;
        if (!lcdId) continue;
        if (!isLcdI2cWiredToBoardEngine(boardId, board.type, lcdId, wires)) continue;
        if (!isLcdPoweredEngine(lcdId, components, wires)) continue;
        const prof = boardProfile(board.type);
        board.i2cBus = {
            active: true,
            address: lcd.i2cAddress ?? 0x3e,
            lcdId,
            sdaIdx: prof.i2c.sda.idx,
            sclIdx: prof.i2c.scl.idx,
        };
        return;
    }
    delete board.i2cBus;
}

/** @deprecated — préférer annotateMicroBoardI2cBusEngine */
export function annotateUnoI2cBusEngine(uno, components, wires) {
    return annotateMicroBoardI2cBusEngine(uno, components, wires);
}

export function i2cBusMinPeriodSec(components) {
    for (const c of components) {
        if (isMicroBoardType(c.type) && c.i2cBus?.active) return I2C_SCL_PERIOD_SEC;
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
    const sdaIdx = c.i2cBus.sdaIdx ?? UNO_A4;
    const sclIdx = c.i2cBus.sclIdx ?? UNO_A5;
    const nSda = nodeFor(`${id}#${sdaIdx}`);
    const nScl = nodeFor(`${id}#${sclIdx}`);

    lines.push(`* ${id} I²C PCF8574 — ${I2C_SCL_HZ / 1000} kHz, START/STOP/ACK, PWL ${formatSpiceTime(wf.durationSec)} s`);
    lines.push(`${spiceBranchName("V", `${id}_SDA_DRV`)} ${nSda} 0 ${pwlToSpiceString(wf.sda)}`);
    lines.push(`${spiceBranchName("V", `${id}_SCL_DRV`)} ${nScl} 0 ${pwlToSpiceString(wf.scl)}`);
}

export { isLcdI2cWiredToUnoEngine };
