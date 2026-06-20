/**
 * Affichage idéal Grove LCD 2×16 I2C — câblage SDA/SCL/VCC/GND vers Arduino UNO.
 */

import { applyArduinoSketchToComponent, evaluateLoopVarBindings, sketchUsesAnalogInput } from "./arduino-sketch-parse.mjs";
import { parseGroveLcdFromSketch, pickLcdPhaseAt, resolveLcdDisplayAt, effectiveLcdLoopCycleMs, emptyLcdBuffer } from "./grove-lcd-sketch-parse.mjs";
import { resolveDhtPrintArg, buildDhtVarBindings } from "./dht22-ideal.mjs";
import { sketchLcdUsesDhtReads } from "./dht22-sketch-parse.mjs";
import { readUnoAnalogInputs } from "./arduino-analog-ideal.mjs";
import { reachableJonctions } from "./hc90-cascade.mjs";

const GROVE_LCD_DEFAULT_I2C = 0x3e;

const I2C_UNO_PINS = { SDA: "A4", SCL: "A5" };

function isLcdI2cWiredToUno(lcdLabel, unoLabel, wires, autoJunctions) {
    for (const [lcdPin, unoPin] of Object.entries(I2C_UNO_PINS)) {
        const lcdJ = `${lcdLabel}_${lcdPin}`;
        const unoJ = `${unoLabel}_${unoPin}`;
        const net = reachableJonctions(lcdJ, wires, autoJunctions);
        if (!net.has(unoJ)) return false;
    }
    return true;
}

function padHint(s) {
    return String(s).slice(0, 16).padEnd(16, " ");
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
                if (comp.type === "arduino_uno" && (net.has(`${comp.label}_5V`) || net.has(`${comp.label}_3V3`))) {
                    ok = true;
                }
            } else {
                if (comp.type === "gnd" && net.has(`${comp.label}_out`)) ok = true;
                if (comp.type === "battery" && net.has(`${comp.label}_in`)) ok = true;
                if (comp.type === "arduino_uno" && (net.has(`${comp.label}_GND`) || net.has(`${comp.label}_GND2`))) {
                    ok = true;
                }
            }
        }
        if (!ok) return false;
    }
    return true;
}

/**
 * Trouve l'UNO câblé sur ce LCD Grove (I2C + alim).
 * @returns {{ uno: object, wired: boolean }}
 */
export function findUnoForGroveLcd(lcdLabel, components, wires, autoJunctions = []) {
    const lcd = components.find((c) => c.label === lcdLabel && c.type === "grove_lcd16x2");
    if (!lcd) return { uno: null, wired: false };

    if (!isLcdPowered(lcdLabel, components, wires, autoJunctions)) {
        return { uno: null, wired: false };
    }

    const candidates = components.filter((c) => c.type === "arduino_uno");
    candidates.sort((a, b) => (b.lastCompileOk ? 1 : 0) - (a.lastCompileOk ? 1 : 0));

    for (const comp of candidates) {
        if (isLcdI2cWiredToUno(lcdLabel, comp.label, wires, autoJunctions)) {
            return { uno: comp, wired: true };
        }
    }
    return { uno: null, wired: false };
}

export function isGroveLcdWiredToUno(lcdLabel, components, wires, autoJunctions = []) {
    return findUnoForGroveLcd(lcdLabel, components, wires, autoJunctions).wired;
}

function buildLcdPrintCtx(uno, components, wires, autoJunctions, elapsedSec = 0, opts = {}) {
    const sketch = uno?.sketch || "";
    const hasDht = sketchLcdUsesDhtReads(sketch);
    const hasAnalog = sketchUsesAnalogInput(sketch);
    if (!hasDht && !hasAnalog) return null;

    const analogInputs = () => readUnoAnalogInputs(uno, {
        components,
        wires,
        autoJunctions,
        tSec: elapsedSec,
        getVoltageAtJonction: opts.getVoltageAtJonction,
        voltmeters: opts.voltmeters,
    });

    return {
        resolveDht: hasDht
            ? (arg) => resolveDhtPrintArg(arg, sketch, uno.label, components, wires, autoJunctions)
            : undefined,
        collectVarBindings: (body) => {
            let bindings = hasAnalog ? evaluateLoopVarBindings(sketch, analogInputs()) : {};
            if (hasDht) {
                bindings = {
                    ...bindings,
                    ...buildDhtVarBindings(body, sketch, uno.label, components, wires, autoJunctions),
                };
            }
            return bindings;
        },
    };
}

function needsRuntimeLcdCtx(uno) {
    const sketch = uno?.sketch || "";
    return sketchLcdUsesDhtReads(sketch) || sketchUsesAnalogInput(sketch);
}

/**
 * Met à jour le cache d'affichage LCD après compilation / édition sketch.
 */
export function refreshGroveLcdDisplayCache(components, wires, autoJunctions = []) {
    for (const lcd of components) {
        if (lcd.type !== "grove_lcd16x2") continue;
        delete lcd.lcdDisplayCache;
        const { uno, wired } = findUnoForGroveLcd(lcd.label, components, wires, autoJunctions);
        if (!wired || !uno) continue;
        applyArduinoSketchToComponent(uno);
        const parsed = parseGroveLcdFromSketch(uno.sketch || "");
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
        } else if (uno.lastCompileOk) {
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

/**
 * Texte à afficher sur le LCD (sketch Arduino interprété).
 * @param {number} [elapsedSec] temps écoulé depuis le début de la simulation (pour delay()).
 * @returns {{ lines: string[], backlight: boolean, rgb: object | null, wired: boolean, address: number, blank: boolean }}
 */
export function getIdealGroveLcdDisplay(lcdLabel, components, wires, autoJunctions = [], elapsedSec = 0, opts = {}) {
    const lcd = components.find((c) => c.label === lcdLabel && c.type === "grove_lcd16x2");
    if (!lcd) {
        return { lines: emptyLcdBuffer(), backlight: false, rgb: null, wired: false, address: GROVE_LCD_DEFAULT_I2C, blank: true };
    }

    const { uno, wired } = findUnoForGroveLcd(lcdLabel, components, wires, autoJunctions);
    if (!wired || !uno) {
        return {
            lines: [padHint("SDA->A4 SCL->"), padHint("A5  5V  GND")],
            backlight: false,
            rgb: null,
            wired: false,
            address: lcd.i2cAddress ?? GROVE_LCD_DEFAULT_I2C,
            blank: false,
        };
    }

    applyArduinoSketchToComponent(uno);
    const printCtx = buildLcdPrintCtx(uno, components, wires, autoJunctions, elapsedSec, opts);
    const needsRuntime = needsRuntimeLcdCtx(uno);

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

    const parsed = parseGroveLcdFromSketch(uno.sketch || "", printCtx);
    if (!parsed) {
        const hint = uno.lastCompileOk
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
