/**
 * Encode les opérations LiquidCrystal_I2C (PCF8574 + HD44780 4 bits) en transactions I²C.
 * Compatible bibliothèque Frank de Brabander / Grove 104020112.
 */

import { parseGroveLcdFromSketch } from "./grove-lcd-sketch-parse.mjs";
import { I2cMasterWaveform, groveLcdBusAddress8, repeatI2cWaveform } from "./i2c-protocol.mjs";

const RS = 0x01;
const EN = 0x04;
const BL = 0x08;

const LCD_CLEAR = 0x01;
const LCD_ENTRYMODE = 0x06;
const LCD_DISPLAYON = 0x0c;
const LCD_FUNCTIONSET = 0x28;
const LCD_SETDDRAM = 0x80;
const LCD_SHIFT_LEFT = 0x18;
const LCD_SHIFT_RIGHT = 0x1c;

function ddramAddr(col, row) {
    return row === 0 ? col : 0x40 + col;
}

function extractParenArg(body, openParenIndex) {
    let i = openParenIndex + 1;
    let depth = 1;
    const start = i;
    while (i < body.length && depth > 0) {
        if (body[i] === "(") depth++;
        else if (body[i] === ")") depth--;
        i++;
    }
    return body.slice(start, i - 1);
}

function parsePrintArg(arg) {
    const t = String(arg || "").trim();
    const fMacro = t.match(/^F\s*\(\s*(["'])([\s\S]*?)\1\s*\)/);
    if (fMacro) return fMacro[2];
    if ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'"))) {
        return t.slice(1, -1);
    }
    return "";
}

/** @returns {number[]} octets PCF8574 pour une impulsion EN (2 writes I²C). */
function expanderPulseBytes(value, backlight) {
    const bl = backlight ? BL : 0;
    const base = (value & 0xff) | bl;
    return [base | EN, base & ~EN];
}

function encodeWrite4bits(wave, addr8, nibbleData, rs, backlight) {
    const hi = (nibbleData & 0xf0) | rs;
    const lo = ((nibbleData & 0x0f) << 4) | rs;
    for (const val of [hi, lo]) {
        for (const b of expanderPulseBytes(val, backlight)) {
            wave.writeTransaction(addr8, [b]);
        }
    }
}

function encodeCommand(wave, addr8, cmd, backlight) {
    encodeWrite4bits(wave, addr8, cmd, 0, backlight);
}

function encodeData(wave, addr8, data, backlight) {
    encodeWrite4bits(wave, addr8, data, RS, backlight);
}

function encodeHd44780Init(wave, addr8, backlight) {
    encodeWrite4bits(wave, addr8, 0x03, 0, backlight);
    encodeWrite4bits(wave, addr8, 0x03, 0, backlight);
    encodeWrite4bits(wave, addr8, 0x03, 0, backlight);
    encodeWrite4bits(wave, addr8, 0x02, 0, backlight);
    encodeCommand(wave, addr8, LCD_FUNCTIONSET, backlight);
    encodeCommand(wave, addr8, LCD_DISPLAYON, backlight);
    encodeCommand(wave, addr8, LCD_ENTRYMODE, backlight);
    encodeCommand(wave, addr8, LCD_CLEAR, backlight);
}

function encodeSetCursor(wave, addr8, col, row, backlight) {
    encodeCommand(wave, addr8, LCD_SETDDRAM | ddramAddr(col, row), backlight);
}

function encodePrintText(wave, addr8, text, backlight) {
    for (const ch of String(text || "")) {
        encodeData(wave, addr8, ch.charCodeAt(0) & 0xff, backlight);
    }
}

function extractFunctionBody(src, name) {
    const idx = src.search(new RegExp(`\\b(?:void|int)\\s+${name}\\s*\\([^)]*\\)\\s*\\{`, "i"));
    if (idx < 0) return "";
    let i = src.indexOf("{", idx);
    if (i < 0) return "";
    let depth = 0;
    const start = i + 1;
    for (; i < src.length; i++) {
        if (src[i] === "{") depth++;
        else if (src[i] === "}") {
            depth--;
            if (depth === 0) return src.slice(start, i);
        }
    }
    return "";
}

/**
 * Rejoue setup()/loop() du sketch et génère le bus I²C complet (100 kHz, START/ACK/STOP).
 * @param {string} sketch
 * @param {number} [repeatUntilSec=0.02]
 */
export function buildLcdI2cWaveformFromSketch(sketch, repeatUntilSec = 0.02) {
    const parsed = parseGroveLcdFromSketch(sketch || "");
    if (!parsed) return null;

    const addr8 = groveLcdBusAddress8(parsed.address);
    const wave = new I2cMasterWaveform();
    let backlight = true;
    let initDone = false;

    const src = String(sketch || "").replace(/\/\/[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "");
    const varName = parsed.varName;

    for (const fn of ["setup", "loop"]) {
        const body = extractFunctionBody(src, fn);
        if (!body) continue;
        const lcdRe = new RegExp(`\\b${varName}\\.(\\w+)\\s*\\(`, "gi");
        let m;
        while ((m = lcdRe.exec(body)) !== null) {
            const op = m[1].toLowerCase();
            const open = m.index + m[0].length - 1;
            const args = extractParenArg(body, open);
            if (op === "init" || op === "begin") {
                if (!initDone) {
                    encodeHd44780Init(wave, addr8, backlight);
                    initDone = true;
                }
                continue;
            }
            if (!initDone) {
                encodeHd44780Init(wave, addr8, backlight);
                initDone = true;
            }
            if (op === "backlight") {
                backlight = true;
                continue;
            }
            if (op === "nobacklight") {
                backlight = false;
                continue;
            }
            if (op === "clear") {
                encodeCommand(wave, addr8, LCD_CLEAR, backlight);
                continue;
            }
            if (op === "scrolldisplayleft") {
                encodeCommand(wave, addr8, LCD_SHIFT_LEFT, backlight);
                continue;
            }
            if (op === "scrolldisplayright") {
                encodeCommand(wave, addr8, LCD_SHIFT_RIGHT, backlight);
                continue;
            }
            if (op === "home") {
                encodeSetCursor(wave, addr8, 0, 0, backlight);
                continue;
            }
            if (op === "setcursor") {
                const parts = args.split(",").map((x) => x.trim());
                const col = Math.max(0, parseInt(parts[0], 10) || 0);
                const row = Math.max(0, parseInt(parts[1], 10) || 0);
                encodeSetCursor(wave, addr8, col, row, backlight);
                continue;
            }
            if (op === "print" || op === "write") {
                const text = parsePrintArg(args.split(",")[0]);
                if (text) encodePrintText(wave, addr8, text, backlight);
            }
        }
    }

    if (!initDone) {
        encodeHd44780Init(wave, addr8, backlight);
    }

    const once = wave.toPwl();
    return repeatI2cWaveform(once, repeatUntilSec);
}
