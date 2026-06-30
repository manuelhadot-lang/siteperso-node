/**
 * Interprétation minimale Adafruit ST7735 / Adafruit_GFX (Joy-it RB-TFT1.8).
 * Police GFX par défaut : 6×8 px, setTextSize(1…5) = coefficient multiplicateur.
 */

export const TFT_NATIVE_W = 128;
export const TFT_NATIVE_H = 160;
export const TFT_GFX_CHAR_W = 6;
export const TFT_GFX_CHAR_H = 8;
export const TFT_GFX_TEXT_SIZE_MAX = 5;
export const TFT18_DEFAULT_LOOP_MS = 1000;

/** @deprecated compat tests — préférer labels */
export const TFT18_COLS = 21;
export const TFT18_TEXT_ROWS = 10;

import { expandUserFunctionCalls } from "./sketch-functions.mjs";
import { isEsp32BoardType } from "./micro-board-config.mjs";
import { evalSketchExpression, parseSketchBodyStatements, runSketchForLoop } from "./arduino-sketch-parse.mjs";

function stripComments(src) {
    return String(src || "")
        .replace(/\/\/[^\n]*/g, "")
        .replace(/\/\*[\s\S]*?\*\//g, "");
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
    return src.slice(start);
}

function resolveDefine(src, tok) {
    let t = String(tok || "").trim();
    for (let i = 0; i < 4; i++) {
        if (!/^[A-Za-z_]\w*$/.test(t)) break;
        const m = src.match(new RegExp(`#define\\s+${t}\\s+(\\S+)`));
        if (!m) break;
        t = m[1].trim();
    }
    return t;
}

function parseColorToken(tok) {
    const t = String(tok || "").trim();
    if (/^0[xX][0-9a-fA-F]+$/.test(t)) return parseInt(t, 16);
    if (/^ST77?XX_(BLACK|WHITE|RED|GREEN|BLUE|YELLOW|CYAN|MAGENTA|ORANGE)$/i.test(t)) {
        const map = {
            BLACK: 0x0000,
            WHITE: 0xffff,
            RED: 0xf800,
            GREEN: 0x07e0,
            BLUE: 0x001f,
            YELLOW: 0xffe0,
            CYAN: 0x07ff,
            MAGENTA: 0xf81f,
            ORANGE: 0xfc00,
        };
        return map[t.split("_").pop().toUpperCase()] ?? 0xffff;
    }
    const n = parseInt(t, 10);
    return Number.isFinite(n) ? n : 0xffff;
}

function rgb565ToCss(c) {
    const v = Number(c) & 0xffff;
    const r = ((v >> 11) & 0x1f) * 255 / 31;
    const g = ((v >> 5) & 0x3f) * 255 / 63;
    const b = (v & 0x1f) * 255 / 31;
    return `rgb(${Math.round(r)},${Math.round(g)},${Math.round(b)})`;
}

function clampTextSize(n) {
    return Math.min(TFT_GFX_TEXT_SIZE_MAX, Math.max(1, Number(n) || 1));
}

function snapshotState(st) {
    return {
        bg: st.bg,
        fg: st.fg,
        textSize: st.textSize,
        rotation: st.rotation,
        cursorX: st.cursorX,
        cursorY: st.cursorY,
        labels: st.labels.map((l) => ({ ...l })),
    };
}

function cloneState(st) {
    return {
        ...snapshotState(st),
    };
}

function createState() {
    return {
        bg: "#000000",
        fg: "#ffffff",
        textSize: 1,
        rotation: 0,
        cursorX: 0,
        cursorY: 0,
        labels: [],
    };
}

function printText(st, text) {
    const s = String(text ?? "");
    if (!s) return;
    st.labels.push({
        x: st.cursorX,
        y: st.cursorY,
        text: s,
        fg: st.fg,
        size: st.textSize,
    });
    st.cursorX += s.length * TFT_GFX_CHAR_W * st.textSize;
}

function parseByteArg(arg) {
    let t = String(arg || "").trim();
    t = t.replace(/^\((?:uint8_t|byte|char|unsigned char)\)\s*/i, "");
    if (/^0[xX][0-9a-fA-F]+$/.test(t)) return parseInt(t, 16) & 0xff;
    if (/^-?\d+$/.test(t)) return parseInt(t, 10) & 0xff;
    if ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'"))) {
        const s = t.slice(1, -1);
        return s.length ? s.charCodeAt(0) & 0xff : null;
    }
    return null;
}

function charFromByte(code) {
    if (code == null || code < 0x20) return "";
    return String.fromCharCode(code);
}

function parsePrintArg(arg, ctx) {
    const t = String(arg || "").trim();
    if (!t) return "";
    if ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'"))) {
        return t.slice(1, -1);
    }
    if (/^0[xX][0-9a-fA-F]+$/.test(t)) return charFromByte(parseInt(t, 16) & 0xff);
    if (/^-?\d+$/.test(t)) return String(parseInt(t, 10));
    if (ctx?.resolveDht) {
        const dhtVal = ctx.resolveDht(t);
        if (dhtVal != null) return String(dhtVal).replace(".", ",");
    }
    if (ctx?.resolveTsl) {
        const tslVal = ctx.resolveTsl(t);
        if (tslVal != null) return String(tslVal).replace(".", ",");
    }
    if (ctx?.resolveBmp) {
        const bmpVal = ctx.resolveBmp(t);
        if (bmpVal != null) return String(bmpVal).replace(".", ",");
    }
    if (ctx?.varBindings && Object.prototype.hasOwnProperty.call(ctx.varBindings, t)) {
        return String(ctx.varBindings[t]).replace(".", ",");
    }
    return "";
}

function execTftCall(text, st, ctx) {
    const t = String(text || "").trim();
    if (/^tft\.initR\s*\(/i.test(t) || /^tft\.init\s*\(/i.test(t)) return 0;
    const rotM = t.match(/^tft\.setRotation\s*\(\s*(\d+)\s*\)/i);
    if (rotM) {
        st.rotation = parseInt(rotM[1], 10) & 3;
        return 0;
    }
    const fill = t.match(/^tft\.fillScreen\s*\(\s*([^)]+)\s*\)/i);
    if (fill) {
        st.bg = rgb565ToCss(parseColorToken(resolveDefine(ctx?.src || "", fill[1])));
        st.labels = [];
        st.cursorX = 0;
        st.cursorY = 0;
        return 0;
    }
    const tc = t.match(/^tft\.setTextColor\s*\(\s*([^)]+)\s*\)/i);
    if (tc) {
        st.fg = rgb565ToCss(parseColorToken(resolveDefine(ctx?.src || "", tc[1])));
        return 0;
    }
    const ts = t.match(/^tft\.setTextSize\s*\(\s*(\d+)\s*\)/i);
    if (ts) {
        st.textSize = clampTextSize(parseInt(ts[1], 10));
        return 0;
    }
    const cur = t.match(/^tft\.setCursor\s*\(\s*(\d+)\s*,\s*(\d+)\s*\)/i);
    if (cur) {
        st.cursorX = parseInt(cur[1], 10);
        st.cursorY = parseInt(cur[2], 10);
        return 0;
    }
    const pr = t.match(/^tft\.print\s*\(\s*([\s\S]+?)\s*\)\s*;?\s*$/i);
    if (pr) {
        printText(st, parsePrintArg(pr[1], ctx));
        return 0;
    }
    const wr = t.match(/^tft\.write\s*\(\s*([\s\S]+?)\s*\)\s*;?\s*$/i);
    if (wr) {
        printText(st, charFromByte(parseByteArg(wr[1])));
        return 0;
    }
    const pl = t.match(/^tft\.println\s*\(\s*([\s\S]*?)\s*\)\s*;?\s*$/i);
    if (pl) {
        printText(st, parsePrintArg(pl[1], ctx));
        st.cursorY += TFT_GFX_CHAR_H * st.textSize;
        return 0;
    }
    const delayM = t.match(/^delay\s*\(\s*(\d+)\s*\)/i);
    if (delayM) return parseInt(delayM[1], 10);
    return 0;
}

const MAX_TFT_LOOP_GUARD = 5000;

function createTftEvalState(ctx) {
    return {
        boardType: ctx.boardType || "arduino_uno",
        sketchSrc: ctx.src || "",
        vars: {},
        floatVars: new Set(),
        regs: {},
        pins: {},
        inputs: ctx.inputs || {},
        analogInputs: {},
        simTimeMs: 0,
    };
}

function execTftStatements(stmts, st, ctx, phases, delayAcc) {
    const evalState = createTftEvalState(ctx);
    for (const stmt of stmts) {
        if (stmt.type === "expr") {
            const d = execTftCall(stmt.text, st, ctx);
            if (d > 0) {
                delayAcc.val += d;
                phases.push({ durationMs: d, ...snapshotState(st) });
            }
        } else if (stmt.type === "if") {
            if (evalSketchExpression(stmt.cond, evalState)) {
                execTftStatements(stmt.body, st, ctx, phases, delayAcc);
            } else if (stmt.elseBody) {
                execTftStatements(stmt.elseBody, st, ctx, phases, delayAcc);
            }
        } else if (stmt.type === "while") {
            let guard = 0;
            while (evalSketchExpression(stmt.cond, evalState) && guard < MAX_TFT_LOOP_GUARD) {
                guard++;
                execTftStatements(stmt.body, st, ctx, phases, delayAcc);
            }
        } else if (stmt.type === "for") {
            runSketchForLoop(stmt, evalState, (body) => {
                execTftStatements(body, st, ctx, phases, delayAcc);
            });
        }
    }
}

/** Exécute le corps jusqu'à timeBudgetMs (delay() suspend les instructions suivantes). */
function execTftStatementsUpToTime(stmts, st, ctx, timeBudgetMs, timeAcc) {
    const evalState = createTftEvalState(ctx);
    for (const stmt of stmts) {
        if (timeAcc.val > timeBudgetMs) return;
        if (stmt.type === "expr") {
            const d = execTftCall(stmt.text, st, ctx);
            if (d > 0) {
                if (timeAcc.val + d > timeBudgetMs) return;
                timeAcc.val += d;
            }
        } else if (stmt.type === "if") {
            if (evalSketchExpression(stmt.cond, evalState)) {
                execTftStatementsUpToTime(stmt.body, st, ctx, timeBudgetMs, timeAcc);
            } else if (stmt.elseBody) {
                execTftStatementsUpToTime(stmt.elseBody, st, ctx, timeBudgetMs, timeAcc);
            }
        } else if (stmt.type === "while") {
            let guard = 0;
            while (evalSketchExpression(stmt.cond, evalState) && guard < MAX_TFT_LOOP_GUARD) {
                if (timeAcc.val > timeBudgetMs) return;
                guard++;
                execTftStatementsUpToTime(stmt.body, st, ctx, timeBudgetMs, timeAcc);
            }
        } else if (stmt.type === "for") {
            runSketchForLoop(stmt, evalState, (body) => {
                execTftStatementsUpToTime(body, st, ctx, timeBudgetMs, timeAcc);
            });
        }
    }
}

function computeLiveLoopCycleMs(body) {
    const delays = [...String(body).matchAll(/\bdelay\s*\(\s*(\d+)\s*\)/gi)];
    if (!delays.length) return TFT18_DEFAULT_LOOP_MS;
    const max = Math.max(...delays.map((m) => parseInt(m[1], 10)));
    return max + 1;
}

function executeBodyUpToTime(body, st, ctx, timeBudgetMs) {
    const timeAcc = { val: 0 };
    execTftStatementsUpToTime(parseSketchBodyStatements(body), st, ctx, timeBudgetMs, timeAcc);
}

/** Exécute setup/loop ; capture les phases aux delay(). Gère if/else et digitalRead(). */
function executeBody(body, st, ctx) {
    const phases = [];
    const delayAcc = { val: 0 };
    execTftStatements(parseSketchBodyStatements(body), st, ctx, phases, delayAcc);
    return { delayMs: delayAcc.val, phases };
}

export function sketchUsesTft18(sketch) {
    const src = stripComments(sketch);
    return /Adafruit_ST7735|Adafruit_GFX|ST7735_|ST77XX_/i.test(src);
}

export function parseTft18ControlPins(sketch) {
    const src = stripComments(sketch);
    const ctor = src.match(
        /Adafruit_ST7735\s+\w+\s*(?:=\s*Adafruit_ST7735\s*)?\(\s*([^,)]+)\s*,\s*([^,)]+)\s*,\s*([^)]+)\s*\)/i
    );
    const readPinToken = (tok) => {
        const t = resolveDefine(src, String(tok || "").trim());
        const m = t.match(/^(?:GPIO)?(\d+)$/i);
        return m ? parseInt(m[1], 10) : parseInt(t, 10);
    };
    const readPin = (names, fallback, ctorIdx) => {
        for (const n of names) {
            const m = src.match(new RegExp(`#define\\s+${n}\\s+(?:GPIO)?(\\d+)`, "i"));
            if (m) return `D${m[1]}`;
        }
        if (ctor) {
            const n = readPinToken(ctor[ctorIdx]);
            if (Number.isFinite(n)) return `D${n}`;
        }
        return fallback;
    };
    return {
        CS: readPin(["TFT_CS", "TFT_CS_PIN"], "D10", 1),
        DC: readPin(["TFT_DC", "TFT_DC_PIN"], "D8", 2),
        RES: readPin(["TFT_RST", "TFT_RESET", "TFT_RST_PIN"], "D9", 3),
    };
}

/** Broche carte (D9 / GPIO9) à partir d'une ref sketch (D9). */
export function mapTftControlPinForBoard(boardType, pinRef) {
    const pin = String(pinRef || "").trim();
    if (isEsp32BoardType(boardType) && /^D(\d+)$/.test(pin)) return `GPIO${pin.slice(1)}`;
    return pin;
}

function stateHasVisibleContent(st) {
    return (st.labels?.length ?? 0) > 0;
}

export function parseTft18FromSketch(sketch, printCtx = null) {
    const src = stripComments(sketch);
    if (!sketchUsesTft18(src)) return null;

    const setupBody = expandUserFunctionCalls(extractFunctionBody(src, "setup"), src);
    const loopBody = expandUserFunctionCalls(extractFunctionBody(src, "loop"), src);
    const baseCtx = { src, ...(printCtx || {}) };

    const st = createState();
    const { phases: setupPhases } = executeBody(setupBody, st, baseCtx);
    const setupEndState = snapshotState(st);
    const setupDurationMs = setupPhases.reduce((s, p) => s + (p.durationMs || 0), 0);
    const setupPhaseCount = setupPhases.length;

    const phases = [...setupPhases];
    let loopCycleMs = 0;
    let displaySt = st;

    if (loopBody.trim()) {
        const loopSt = cloneState(st);
        const ctx = {
            ...baseCtx,
            varBindings: printCtx?.collectVarBindings?.(loopBody) || {},
        };
        const { delayMs, phases: loopPhases } = executeBody(loopBody, loopSt, ctx);
        if (loopPhases.length) {
            phases.push(...loopPhases);
            loopCycleMs = loopPhases.reduce((s, p) => s + (p.durationMs || 0), 0);
        } else {
            loopCycleMs = delayMs > 0 ? delayMs : TFT18_DEFAULT_LOOP_MS;
            phases.push({ durationMs: loopCycleMs, ...snapshotState(loopSt) });
        }
        displaySt = loopSt;
    } else if (setupPhaseCount === 0 && stateHasVisibleContent(setupEndState)) {
        loopCycleMs = TFT18_DEFAULT_LOOP_MS;
        phases.push({ durationMs: loopCycleMs, ...setupEndState });
    }

    return {
        ...snapshotState(displaySt),
        setupEndState,
        setupDurationMs,
        setupPhaseCount,
        phases,
        loopCycleMs,
        hasTiming: phases.length > 0 && (loopCycleMs > 0 || setupDurationMs > 0),
        controlPins: parseTft18ControlPins(src),
        sketchSrc: src,
    };
}

/** setup() une fois, puis boucle loop() — elapsedMs en millisecondes. */
export function pickTft18PhaseAt(phases, elapsedMs, loopCycleMs, setupDurationMs = 0, setupPhaseCount = 0) {
    if (!phases?.length) return null;

    const setupCount = Math.min(setupPhaseCount, phases.length);
    if (setupCount > 0 && elapsedMs < setupDurationMs) {
        let rem = elapsedMs;
        for (let i = 0; i < setupCount; i++) {
            const ph = phases[i];
            const d = ph.durationMs || 0;
            if (rem < d) return ph;
            rem -= d;
        }
        return phases[setupCount - 1];
    }

    const loopPhases = phases.slice(setupCount);
    if (!loopPhases.length) return phases[phases.length - 1];

    const loopElapsed = Math.max(0, elapsedMs - setupDurationMs);
    const cycle = loopCycleMs > 0
        ? loopCycleMs
        : loopPhases.reduce((s, p) => s + (p.durationMs || 0), 0);
    if (cycle <= 0) return loopPhases[loopPhases.length - 1];

    let rem = loopElapsed % cycle;
    for (const ph of loopPhases) {
        const d = ph.durationMs || 0;
        if (rem < d) return ph;
        rem -= d;
    }
    return loopPhases[loopPhases.length - 1];
}

export function resolveTft18DisplayAt(parsed, elapsedMs, opts = {}) {
    if (!parsed) return null;

    const setupDuration = parsed.setupDurationMs ?? 0;
    const setupPhaseCount = parsed.setupPhaseCount ?? 0;

    if (setupDuration > 0 && elapsedMs < setupDuration && parsed.phases?.length) {
        const ph = pickTft18PhaseAt(
            parsed.phases,
            elapsedMs,
            parsed.loopCycleMs ?? 0,
            setupDuration,
            setupPhaseCount
        );
        if (ph) return ph;
    }

    if (opts?.ctx?.liveInput && parsed.sketchSrc) {
        const loopBody = expandUserFunctionCalls(extractFunctionBody(parsed.sketchSrc, "loop"), parsed.sketchSrc);
        const st = parsed.setupEndState
            ? cloneState(parsed.setupEndState)
            : createState();
        if (!parsed.setupEndState) {
            st.bg = parsed.bg;
            st.fg = parsed.fg;
            st.textSize = parsed.textSize;
            st.rotation = parsed.rotation || 0;
        }
        const ctx = {
            src: parsed.sketchSrc,
            ...opts.ctx,
            varBindings: opts.ctx.collectVarBindings?.(loopBody) || {},
        };
        const loopElapsed = Math.max(0, elapsedMs - setupDuration);
        const loopCycle = computeLiveLoopCycleMs(loopBody);
        const loopTimeMs = loopCycle > 0 ? loopElapsed % loopCycle : loopElapsed;
        executeBodyUpToTime(loopBody, st, ctx, loopTimeMs);
        return snapshotState(st);
    }

    if (parsed.hasTiming && parsed.phases?.length) {
        const ph = pickTft18PhaseAt(
            parsed.phases,
            elapsedMs,
            parsed.loopCycleMs,
            parsed.setupDurationMs,
            parsed.setupPhaseCount
        );
        if (ph) return ph;
    }
    if (opts?.ctx && parsed.sketchSrc) {
        const loopBody = expandUserFunctionCalls(extractFunctionBody(parsed.sketchSrc, "loop"), parsed.sketchSrc);
        const st = parsed.setupEndState
            ? cloneState(parsed.setupEndState)
            : createState();
        if (!parsed.setupEndState) {
            st.bg = parsed.bg;
            st.fg = parsed.fg;
            st.textSize = parsed.textSize;
            st.rotation = parsed.rotation || 0;
        }
        const ctx = {
            src: parsed.sketchSrc,
            ...opts.ctx,
            varBindings: opts.ctx.collectVarBindings?.(loopBody) || {},
        };
        executeBody(loopBody, st, ctx);
        return snapshotState(st);
    }
    return snapshotState(parsed.setupEndState ?? parsed);
}
