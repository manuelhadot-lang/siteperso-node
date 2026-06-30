/**
 * Joy-it RB-TFT1.8 — câblage SPI vers Arduino UNO ou ESP32-C3.
 */

import { applyArduinoSketchToComponent, evaluateLoopVarBindings, sketchUsesAnalogInput, sketchUsesLiveInput } from "./arduino-sketch-parse.mjs";
import { readMicroBoardDigitalInputs } from "./arduino-live-inputs.mjs";
import {
    parseTft18FromSketch,
    pickTft18PhaseAt,
    resolveTft18DisplayAt,
    mapTftControlPinForBoard,
} from "./tft18-sketch-parse.mjs";
import { resolveDhtPrintArg, buildDhtVarBindings } from "./dht22-ideal.mjs";
import { resolveTslPrintArg, buildTslVarBindings } from "./tsl2591-ideal.mjs";
import { resolveBmpPrintArg, buildBmpVarBindings } from "./bmp280-ideal.mjs";
import { sketchUsesDht } from "./dht22-sketch-parse.mjs";
import { sketchUsesTsl2591 } from "./tsl2591-sketch-parse.mjs";
import { sketchUsesBmp280 } from "./bmp280-sketch-parse.mjs";
import { readBoardAnalogInputs } from "./arduino-analog-ideal.mjs";
import { reachableJonctions } from "./hc90-cascade.mjs";
import { boardProfile, isMicroBoardType, tft18SpiDefaults, digitalPinsForBoard } from "./micro-board-config.mjs";

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

function isTftPowered(tftLabel, components, wires, autoJunctions) {
    for (const pin of ["VCC", "GND"]) {
        const j = `${tftLabel}_${pin}`;
        const net = reachableJonctions(j, wires, autoJunctions);
        let ok = false;
        for (const comp of components) {
            if (pin === "VCC") {
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

function boardPinOnNet(boardLabel, pinName, net) {
    return net.has(`${boardLabel}_${pinName}`);
}

function mapBoardPin(boardType, pin) {
    return mapTftControlPinForBoard(boardType, pin);
}

function tftWiringHintLabels(board, controlPins) {
    if (!board || !controlPins) {
        return hintLabels(["SPI : SCL SDA", "CS DC RES", "VCC GND"]);
    }
    const cs = mapBoardPin(board.type, controlPins.CS);
    const dc = mapBoardPin(board.type, controlPins.DC);
    const res = mapBoardPin(board.type, controlPins.RES);
    return hintLabels([
        "Câblage SPI incomplet",
        `CS→${cs} DC→${dc}`,
        `RES→${res} (sketch)`,
        "VCC GND",
    ]);
}

function tftNetHasBoardPin(tftLabel, tftPin, board, wires, autoJunctions) {
    const net = reachableJonctions(`${tftLabel}_${tftPin}`, wires, autoJunctions);
    for (const pinName of digitalPinsForBoard(board.type)) {
        if (net.has(`${board.label}_${pinName}`)) return true;
    }
    return false;
}

function isTftSpiWiredToBoard(tftLabel, board, wires, autoJunctions, controlPins) {
    const defaults = tft18SpiDefaults(board.type);
    for (const tftPin of ["SCL", "SDA"]) {
        if (!tftNetHasBoardPin(tftLabel, tftPin, board, wires, autoJunctions)) return false;
    }
    for (const tftPin of ["CS", "DC", "RES"]) {
        const pinRef = controlPins?.[tftPin] || defaults[tftPin];
        const net = reachableJonctions(`${tftLabel}_${tftPin}`, wires, autoJunctions);
        const mapped = mapBoardPin(board.type, pinRef);
        if (!boardPinOnNet(board.label, mapped, net) && !boardPinOnNet(board.label, pinRef, net)) {
            return false;
        }
    }
    return true;
}

export function findBoardForJoyitTft18(tftLabel, components, wires, autoJunctions = []) {
    const tft = components.find((c) => c.label === tftLabel && c.type === "joyit_tft18");
    if (!tft || !isTftPowered(tftLabel, components, wires, autoJunctions)) {
        return { board: null, wired: false };
    }

    const candidates = components.filter((c) => isMicroBoardType(c.type));
    candidates.sort((a, b) => (b.lastCompileOk ? 1 : 0) - (a.lastCompileOk ? 1 : 0));

    let controlPins = tft.tftControlPins;
    for (const board of candidates) {
        applyArduinoSketchToComponent(board);
        const parsed = parseTft18FromSketch(board.sketch || "");
        controlPins = parsed?.controlPins || controlPins;
        if (isTftSpiWiredToBoard(tftLabel, board, wires, autoJunctions, controlPins)) {
            return { board, wired: true, controlPins };
        }
    }
    return { board: null, wired: false, controlPins };
}

export function isJoyitTft18WiredToBoard(tftLabel, components, wires, autoJunctions = []) {
    return findBoardForJoyitTft18(tftLabel, components, wires, autoJunctions).wired;
}

function buildTftPrintCtx(board, components, wires, autoJunctions, elapsedSec = 0, opts = {}) {
    const sketch = board?.sketch || "";
    const hasDht = sketchUsesDht(sketch);
    const hasTsl = sketchUsesTsl2591(sketch);
    const hasBmp = sketchUsesBmp280(sketch);
    const hasAnalog = sketchUsesAnalogInput(sketch);
    const hasLiveInput = sketchUsesLiveInput(sketch);
    if (!hasDht && !hasTsl && !hasBmp && !hasAnalog && !hasLiveInput) return null;

    const analogInputs = () => readBoardAnalogInputs(board, {
        components,
        wires,
        autoJunctions,
        tSec: elapsedSec,
        getVoltageAtJonction: opts.getVoltageAtJonction,
        voltmeters: opts.voltmeters,
    });

    return {
        boardType: board.type,
        liveInput: hasLiveInput,
        inputs: hasLiveInput
            ? readMicroBoardDigitalInputs(board, components, wires, autoJunctions)
            : {},
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
            let bindings = hasAnalog ? evaluateLoopVarBindings(sketch, analogInputs()) : {};
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

function needsRuntimeTftCtx(board) {
    const sketch = board?.sketch || "";
    return sketchUsesDht(sketch) || sketchUsesTsl2591(sketch) || sketchUsesBmp280(sketch)
        || sketchUsesAnalogInput(sketch) || sketchUsesLiveInput(sketch);
}

function tftHasVisibleContent(parsed) {
    if (parsed.labels?.length) return true;
    return parsed.phases?.some((p) => p.labels?.length) ?? false;
}

function hintLabels(rows) {
    return rows.map((text, i) => ({
        x: 4,
        y: 8 + i * 10,
        text,
        fg: "#666666",
        size: 1,
    }));
}

export function refreshJoyitTft18DisplayCache(components, wires, autoJunctions = []) {
    for (const tft of components) {
        if (tft.type !== "joyit_tft18") continue;
        delete tft.tftDisplayCache;
        const { board, wired } = findBoardForJoyitTft18(tft.label, components, wires, autoJunctions);
        if (!wired || !board) continue;
        applyArduinoSketchToComponent(board);
        const parsed = parseTft18FromSketch(board.sketch || "");
        if (parsed) {
            tft.tftControlPins = parsed.controlPins;
            tft.tftDisplayCache = {
                bg: parsed.bg,
                fg: parsed.fg,
                textSize: parsed.textSize,
                rotation: parsed.rotation,
                labels: parsed.labels,
                setupEndState: parsed.setupEndState,
                setupDurationMs: parsed.setupDurationMs,
                setupPhaseCount: parsed.setupPhaseCount,
                phases: parsed.phases,
                hasTiming: parsed.hasTiming,
                loopCycleMs: parsed.loopCycleMs,
                sketchSrc: parsed.sketchSrc,
                blank: !tftHasVisibleContent(parsed),
            };
        } else if (board.lastCompileOk) {
            tft.tftDisplayCache = {
                labels: hintLabels(["Adafruit_ST7735", "requis"]),
                bg: "#000000",
                fg: "#ffffff",
                textSize: 1,
                rotation: 0,
                blank: false,
            };
        }
    }
}

export function getIdealJoyitTft18Display(tftLabel, components, wires, autoJunctions = [], elapsedSec = 0, opts = {}) {
    const tft = components.find((c) => c.label === tftLabel && c.type === "joyit_tft18");
    if (!tft) {
        return { labels: [], bg: "#000000", fg: "#888888", wired: false, blank: true, textSize: 1, rotation: 0 };
    }

    const { board, wired, controlPins } = findBoardForJoyitTft18(tftLabel, components, wires, autoJunctions);
    if (!wired || !board) {
        const boardGuess = components.find((c) => isMicroBoardType(c.type));
        const cp = controlPins
            || (boardGuess?.sketch ? parseTft18FromSketch(boardGuess.sketch)?.controlPins : null);
        return {
            labels: tftWiringHintLabels(boardGuess, cp),
            bg: "#111111",
            fg: "#666666",
            wired: false,
            blank: false,
            textSize: 1,
            rotation: 0,
        };
    }

    applyArduinoSketchToComponent(board);
    const printCtx = buildTftPrintCtx(board, components, wires, autoJunctions, elapsedSec, opts);
    const needsRuntime = needsRuntimeTftCtx(board);

    const pickDisplay = (parsedOrCache) => {
        const elapsedMs = Math.max(0, elapsedSec * 1000);
        const resolveOpts = needsRuntime ? { ctx: printCtx } : {};
        const phase = !printCtx?.liveInput && parsedOrCache.hasTiming && parsedOrCache.phases?.length
            ? pickTft18PhaseAt(
                parsedOrCache.phases,
                elapsedMs,
                parsedOrCache.loopCycleMs,
                parsedOrCache.setupDurationMs ?? 0,
                parsedOrCache.setupPhaseCount ?? 0
            )
            : null;
        const resolved = phase
            ?? (needsRuntime
                ? resolveTft18DisplayAt(parsedOrCache, elapsedMs, resolveOpts)
                : null);
        const snap = resolved ?? phase ?? parsedOrCache.setupEndState ?? parsedOrCache;
        const labels = snap.labels ?? [];
        return {
            bg: snap.bg ?? parsedOrCache.bg,
            fg: snap.fg ?? parsedOrCache.fg,
            textSize: snap.textSize ?? parsedOrCache.textSize ?? 1,
            rotation: snap.rotation ?? parsedOrCache.rotation ?? 0,
            labels,
            blank: !labels.length,
        };
    };

    if (tft.tftDisplayCache && !needsRuntime) {
        return { ...pickDisplay(tft.tftDisplayCache), wired: true };
    }

    const parsed = parseTft18FromSketch(board.sketch || "", printCtx);
    if (!parsed) {
        const labels = board.lastCompileOk
            ? hintLabels(["Adafruit_ST7735", "requis"])
            : [];
        return {
            labels,
            bg: "#000000",
            fg: "#ffffff",
            textSize: 1,
            rotation: 0,
            wired: true,
            blank: !labels.length,
        };
    }

    return { ...pickDisplay(parsed), wired: true };
}
