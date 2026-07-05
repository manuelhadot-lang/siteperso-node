/**
 * Affichage idéal Grove LCD 2×16 I2C — câblage SDA/SCL/VCC/GND vers UNO ou ESP32-C3.
 */

import { applyArduinoSketchToComponent, evaluateLoopVarBindings, sketchUsesAnalogInput } from "./arduino-sketch-parse.mjs";
import { parseGroveLcdFromSketch, pickLcdPhaseAt, resolveLcdDisplayAt, effectiveLcdLoopCycleMs, emptyLcdBuffer } from "./grove-lcd-sketch-parse.mjs";
import { resolveDhtPrintArg, buildDhtVarBindings } from "./dht22-ideal.mjs";
import { resolveTslPrintArg, buildTslVarBindings } from "./tsl2591-ideal.mjs";
import { resolveBmpPrintArg, buildBmpVarBindings } from "./bmp280-ideal.mjs";
import { sketchLcdUsesDhtReads } from "./dht22-sketch-parse.mjs";
import { sketchLcdUsesTslReads } from "./tsl2591-sketch-parse.mjs";
import { sketchLcdUsesBmpReads } from "./bmp280-sketch-parse.mjs";
import { readBoardAnalogInputs } from "./arduino-analog-ideal.mjs";
import { reachableJonctions } from "./hc90-cascade.mjs";
import { boardProfile, isMicroBoardType } from "./micro-board-config.mjs";

const GROVE_LCD_DEFAULT_I2C = 0x3e;

function isLcdI2cWiredToBoard(lcdLabel, board, wires, autoJunctions) {
    const prof = boardProfile(board.type);
    for (const [lcdPin, boardPin] of [
        ["SDA", prof.i2c.sda.name],
        ["SCL", prof.i2c.scl.name],
    ]) {
        const lcdJ = `${lcdLabel}_${lcdPin}`;
        const boardJ = `${board.label}_${boardPin}`;
        const net = reachableJonctions(lcdJ, wires, autoJunctions);
        if (!net.has(boardJ)) return false;
    }
    return true;
}

function padHint(s) {
    return String(s).slice(0, 16).padEnd(16, " ");
}

function isMicroBoardPowered(comp, net, rail) {
    const prof = boardProfile(comp.type);
    if (rail === "VCC") {
        for (const pin of prof.vccPins) {
            if (net.has(`${comp.label}_${pin}`)) return true;
        }
    } else {
        for (const pin of prof.gndPins) {
            if (net.has(`${comp.label}_${pin}`)) return true;
        }
    }
    return false;
}

function isLcdPowered(lcdLabel, components, wires, autoJunctions) {
    for (const lcdPin of ["VCC", "GND"]) {
        const lcdJ = `${lcdLabel}_${lcdPin}`;
        const net = reachableJonctions(lcdJ, wires, autoJunctions);
        let ok = false;
        for (const comp of components) {
            if (lcdPin === "VCC") {
                if (comp.type === "vcc" && net.has(`${comp.label}_out`)) ok = true;
                if (comp.type === "battery" && net.has(`${comp.label}_out`)) ok = true;
                if (isMicroBoardType(comp.type) && isMicroBoardPowered(comp, net, "VCC")) ok = true;
            } else {
                if (comp.type === "gnd" && net.has(`${comp.label}_out`)) ok = true;
                if (comp.type === "battery" && net.has(`${comp.label}_in`)) ok = true;
                if (isMicroBoardType(comp.type) && isMicroBoardPowered(comp, net, "GND")) ok = true;
            }
        }
        if (!ok) return false;
    }
    return true;
}

/**
 * Trouve la carte microcontrôleur câblée sur ce LCD Grove (I2C + alim).
 * @returns {{ board: object | null, wired: boolean }}
 */
export function findBoardForGroveLcd(lcdLabel, components, wires, autoJunctions = []) {
    const lcd = components.find((c) => c.label === lcdLabel && c.type === "grove_lcd16x2");
    if (!lcd) return { board: null, wired: false };

    if (!isLcdPowered(lcdLabel, components, wires, autoJunctions)) {
        return { board: null, wired: false };
    }

    const candidates = components.filter((c) => isMicroBoardType(c.type));
    candidates.sort((a, b) => (b.lastCompileOk ? 1 : 0) - (a.lastCompileOk ? 1 : 0));

    for (const comp of candidates) {
        if (isLcdI2cWiredToBoard(lcdLabel, comp, wires, autoJunctions)) {
            return { board: comp, wired: true };
        }
    }
    return { board: null, wired: false };
}

/** @deprecated alias */
export function findUnoForGroveLcd(lcdLabel, components, wires, autoJunctions = []) {
    const { board, wired } = findBoardForGroveLcd(lcdLabel, components, wires, autoJunctions);
    return { uno: board, wired };
}

export function isGroveLcdWiredToBoard(lcdLabel, components, wires, autoJunctions = []) {
    return findBoardForGroveLcd(lcdLabel, components, wires, autoJunctions).wired;
}

/** @deprecated alias UNO */
export function isGroveLcdWiredToUno(lcdLabel, components, wires, autoJunctions = []) {
    return isGroveLcdWiredToBoard(lcdLabel, components, wires, autoJunctions);
}

function buildLcdPrintCtx(board, components, wires, autoJunctions, elapsedSec = 0, opts = {}) {
    const sketch = board?.sketch || "";
    const hasDht = sketchLcdUsesDhtReads(sketch);
    const hasTsl = sketchLcdUsesTslReads(sketch);
    const hasBmp = sketchLcdUsesBmpReads(sketch);
    const hasAnalog = sketchUsesAnalogInput(sketch);
    if (!hasDht && !hasTsl && !hasBmp && !hasAnalog) return null;

    const analogInputs = () => readBoardAnalogInputs(board, {
        components,
        wires,
        autoJunctions,
        tSec: elapsedSec,
        getVoltageAtJonction: opts.getVoltageAtJonction,
        voltmeters: opts.voltmeters,
    });

    return {
        resolveDht: hasDht
            ? (arg) => resolveDhtPrintArg(arg, sketch, board.label, components, wires, autoJunctions)
            : undefined,
        resolveTsl: hasTsl
            ? (arg) => resolveTslPrintArg(arg, sketch, board.label, components, wires, autoJunctions)
            : undefined,
        resolveBmp: hasBmp
            ? (arg) => resolveBmpPrintArg(arg, sketch, board.label, components, wires, autoJunctions)
            : undefined,
        collectVarBindings: (body) => {
            let bindings = hasAnalog ? evaluateLoopVarBindings(sketch, analogInputs(), board.type) : {};
            if (hasDht) {
                bindings = {
                    ...bindings,
                    ...buildDhtVarBindings(body, sketch, board.label, components, wires, autoJunctions),
                };
            }
            if (hasTsl) {
                bindings = {
                    ...bindings,
                    ...buildTslVarBindings(body, sketch, board.label, components, wires, autoJunctions),
                };
            }
            if (hasBmp) {
                bindings = {
                    ...bindings,
                    ...buildBmpVarBindings(body, sketch, board.label, components, wires, autoJunctions),
                };
            }
            return bindings;
        },
    };
}

function needsRuntimeLcdCtx(board) {
    const sketch = board?.sketch || "";
    return sketchLcdUsesDhtReads(sketch) || sketchLcdUsesTslReads(sketch) || sketchLcdUsesBmpReads(sketch) || sketchUsesAnalogInput(sketch);
}

export function refreshGroveLcdDisplayCache(components, wires, autoJunctions = []) {
    for (const lcd of components) {
        if (lcd.type !== "grove_lcd16x2") continue;
        delete lcd.lcdDisplayCache;
        const { board, wired } = findBoardForGroveLcd(lcd.label, components, wires, autoJunctions);
        if (!wired || !board) continue;
        applyArduinoSketchToComponent(board);
        const parsed = parseGroveLcdFromSketch(board.sketch || "");
        if (parsed) {
            lcd.lcdDisplayCache = {
                lines: parsed.lines,
                phases: parsed.phases,
                hasTiming: parsed.hasTiming,
                setupDurationMs: parsed.setupDurationMs,
                loopCycleMs: parsed.loopCycleMs,
                effectiveLoopCycleMs: parsed.effectiveLoopCycleMs,
                setupEndState: parsed.setupEndState,
                loopEvents: parsed.loopEvents,
                sketchSrc: parsed.sketchSrc,
                backlight: parsed.backlight,
                rgb: parsed.rgb,
                address: parsed.address,
                blank: !parsed.lines.some((l) => l.trim()),
            };
        } else if (board.lastCompileOk) {
            lcd.lcdDisplayCache = {
                lines: [padHint("LiquidCrystal"), padHint("_I2C requis")],
                backlight: true,
                address: lcd.i2cAddress ?? GROVE_LCD_DEFAULT_I2C,
                blank: false,
            };
        } else {
            lcd.lcdDisplayCache = {
                lines: emptyLcdBuffer(),
                backlight: true,
                address: lcd.i2cAddress ?? GROVE_LCD_DEFAULT_I2C,
                blank: true,
            };
        }
    }
}

export function getIdealGroveLcdDisplay(lcdLabel, components, wires, autoJunctions = [], elapsedSec = 0, opts = {}) {
    const lcd = components.find((c) => c.label === lcdLabel && c.type === "grove_lcd16x2");
    if (!lcd) {
        return { lines: emptyLcdBuffer(), backlight: false, rgb: null, wired: false, address: GROVE_LCD_DEFAULT_I2C, blank: true };
    }

    const { board, wired } = findBoardForGroveLcd(lcdLabel, components, wires, autoJunctions);
    if (!wired || !board) {
        return {
            lines: [padHint("SDA / SCL /"), padHint("VCC / GND")],
            backlight: false,
            rgb: null,
            wired: false,
            address: lcd.i2cAddress ?? GROVE_LCD_DEFAULT_I2C,
            blank: false,
        };
    }

    applyArduinoSketchToComponent(board);
    const printCtx = buildLcdPrintCtx(board, components, wires, autoJunctions, elapsedSec, opts);
    const needsRuntime = needsRuntimeLcdCtx(board);

    const pickDisplay = (parsedOrCache) => {
        const elapsedMs = Math.max(0, elapsedSec * 1000);
        const loopCycleMs = effectiveLcdLoopCycleMs(parsedOrCache);
        const resolveOpts = needsRuntime ? { ctx: printCtx } : {};
        const phase = loopCycleMs > 0 && parsedOrCache.loopEvents?.length
            ? resolveLcdDisplayAt(parsedOrCache, elapsedMs, resolveOpts)
            : (parsedOrCache.hasTiming && parsedOrCache.phases?.length
                ? pickLcdPhaseAt(parsedOrCache.phases, elapsedMs, {
                    loopCycleMs: 0,
                    setupDurationMs: 0,
                })
                : null);
        const lines = phase?.lines ?? parsedOrCache.lines;
        const backlight = phase?.backlight ?? parsedOrCache.backlight;
        const rgb = phase?.rgb ?? parsedOrCache.rgb ?? null;
        return {
            lines,
            backlight,
            rgb: rgb ? { ...rgb } : null,
            blank: !lines.some((l) => l.trim()),
            address: parsedOrCache.address ?? lcd.i2cAddress ?? GROVE_LCD_DEFAULT_I2C,
        };
    };

    if (lcd.lcdDisplayCache && !needsRuntime) {
        const d = pickDisplay(lcd.lcdDisplayCache);
        return { ...d, wired: true };
    }

    const parsed = parseGroveLcdFromSketch(board.sketch || "", printCtx);
    if (!parsed) {
        const hint = board.lastCompileOk
            ? [padHint("LiquidCrystal"), padHint("_I2C requis")]
            : emptyLcdBuffer();
        return {
            lines: hint,
            backlight: true,
            rgb: null,
            wired: true,
            address: lcd.i2cAddress ?? GROVE_LCD_DEFAULT_I2C,
            blank: !hint.some((l) => l.trim()),
        };
    }

    const d = pickDisplay(parsed);
    return { ...d, wired: true };
}
