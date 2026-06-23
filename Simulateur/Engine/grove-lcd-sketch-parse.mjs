/**
 * Interprétation minimale LiquidCrystal_I2C / rgb_lcd (Seeed Grove 104020112).
 * init/begin, backlight, setCursor, print, clear, scroll, setRGB, delay().
 */

export const LCD_COLS = 16;
export const LCD_ROWS = 2;
/** Dernière adresse DDRAM par ligne (HD44780 : 0x27 = index 39, pas « 27 caractères »). */
export const LCD_DDRAM_LAST_ADDR = 0x27;
/** 40 colonnes DDRAM par ligne (adresses 0x00–0x27). */
export const LCD_DDRAM_COLS = LCD_DDRAM_LAST_ADDR + 1;

/** Défilement max. pour afficher l'adresse 0x27 en colonne 15 (40 − 16 = 24 pas). */
export function maxLcdDisplayShift(visibleCols = LCD_COLS) {
    const vis = Math.max(1, visibleCols || LCD_COLS);
    return LCD_DDRAM_LAST_ADDR - (vis - 1);
}

export function emptyLcdBuffer() {
    return ["                ", "                "];
}

function emptyDdramBuffer(rows = LCD_ROWS) {
    return Array.from({ length: rows }, () => " ".repeat(LCD_DDRAM_COLS));
}

function padDdramLine(s) {
    return String(s ?? "").slice(0, LCD_DDRAM_COLS).padEnd(LCD_DDRAM_COLS, " ");
}

/** Fenêtre visible (16 colonnes) à partir du tampon DDRAM et du décalage scroll. */
export function visibleLcdLines(st) {
    const vis = st.cols || LCD_COLS;
    const maxShift = maxLcdDisplayShift(vis);
    const shift = Math.max(0, Math.min(maxShift, st.displayShift || 0));
    return st.ddram.map((row) => padDdramLine(row).slice(shift, shift + vis).padEnd(vis, " "));
}

function cloneLines(st) {
    return visibleLcdLines(st);
}

import { expandUserFunctionCalls } from "./sketch-functions.mjs";

function stripComments(src) {
    return String(src || "")
        .replace(/\/\/[^\n]*/g, "")
        .replace(/\/\*[\s\S]*?\*\//g, "");
}

/** Durée par défaut d'un cycle loop() sans delay() (scroll instantané, etc.). */
export const LCD_DEFAULT_INSTANT_LOOP_MS = 1000;

export function effectiveLcdLoopCycleMs(parsed) {
    if (!parsed) return 0;
    const ms = parsed.loopCycleMs ?? 0;
    if (ms > 0) return ms;
    if (parsed.loopEvents?.length) return LCD_DEFAULT_INSTANT_LOOP_MS;
    return 0;
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

function parsePrintArg(arg, ctx) {
    const t = String(arg || "").trim();
    if (!t) return "";
    const fMacro = t.match(/^F\s*\(\s*(["'])([\s\S]*?)\1\s*\)/);
    if (fMacro) return fMacro[2];
    if ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'"))) {
        return t.slice(1, -1);
    }
    if (/^0[xX][0-9a-fA-F]+$/.test(t)) return String(parseInt(t, 16));
    if (/^-?\d+$/.test(t)) return String(parseInt(t, 10));
    if (ctx?.resolveDht) {
        const dhtVal = ctx.resolveDht(t);
        if (dhtVal != null) return formatLcdDecimalText(dhtVal);
    }
    if (ctx?.resolveTsl) {
        const tslVal = ctx.resolveTsl(t);
        if (tslVal != null) return formatLcdDecimalText(tslVal);
    }
    if (ctx?.resolveBmp) {
        const bmpVal = ctx.resolveBmp(t);
        if (bmpVal != null) return formatLcdDecimalText(bmpVal);
    }
    if (ctx?.varBindings && Object.prototype.hasOwnProperty.call(ctx.varBindings, t)) {
        return formatLcdDecimalText(ctx.varBindings[t]);
    }
    return "";
}

/** Affichage décimal français sur LCD : 2.50 → 2,50 */
function formatLcdDecimalText(text) {
    const s = String(text);
    if (/^-?\d+\.\d+$/.test(s)) return s.replace(".", ",");
    return s;
}

function parseDelayMs(arg) {
    const t = String(arg || "").trim();
    const n = parseInt(t, 10);
    return Number.isFinite(n) ? Math.max(0, n) : 0;
}

function resolveNumericConst(src, token) {
    const t = String(token || "").trim();
    if (!t) return null;
    if (/^0[xX][0-9a-fA-F]+$/.test(t) || /^-?\d+$/.test(t)) {
        return parseInt(t, /^0x/i.test(t) ? 16 : 10);
    }
    const def = src.match(new RegExp(`#define\\s+${t}\\s+(0x[0-9A-Fa-f]+|\\d+)`));
    if (def) return parseInt(def[1], /^0x/i.test(def[1]) ? 16 : 10);
    return null;
}

function detectLcdVariable(src) {
    const i2c = src.match(/LiquidCrystal_I2C\s+(\w+)\s*\(\s*([^,)]+)(?:\s*,\s*([^,)]+))?(?:\s*,\s*([^,)]+))?\s*\)/i);
    if (i2c) {
        const addr = resolveNumericConst(src, i2c[2].trim()) ?? 0x3e;
        const colsRaw = i2c[3] ? resolveNumericConst(src, i2c[3].trim()) : LCD_COLS;
        const rowsRaw = i2c[4] ? resolveNumericConst(src, i2c[4].trim()) : LCD_ROWS;
        return {
            varName: i2c[1],
            address: addr,
            cols: Math.min(LCD_COLS, colsRaw || LCD_COLS),
            rows: Math.min(LCD_ROWS, rowsRaw || LCD_ROWS),
            supportsRgb: false,
        };
    }
    const rgb = src.match(/\brgb_lcd\s+(\w+)\s*(?:\(\s*\))?\s*;/i);
    if (rgb) {
        return {
            varName: rgb[1],
            address: 0x3e,
            cols: LCD_COLS,
            rows: LCD_ROWS,
            supportsRgb: true,
        };
    }
    return null;
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

/** Événements setup()/loop() dans l'ordre du source : appels lcd.* et delay(). */
function parseTimedEvents(body, varName) {
    if (!body) return [];
    const events = [];
    const delayRe = /\bdelay\s*\(/gi;
    let m;
    while ((m = delayRe.exec(body)) !== null) {
        const open = m.index + m[0].length - 1;
        events.push({ type: "delay", index: m.index, ms: parseDelayMs(extractParenArg(body, open)) });
    }
    const lcdRe = new RegExp(`\\b${varName}\\.(\\w+)\\s*\\(`, "gi");
    while ((m = lcdRe.exec(body)) !== null) {
        const open = m.index + m[0].length - 1;
        events.push({
            type: "lcd",
            index: m.index,
            fn: m[1].toLowerCase(),
            args: extractParenArg(body, open),
        });
    }
    events.sort((a, b) => a.index - b.index);
    return events;
}

function createLcdState(cols, rows, supportsRgb = false) {
    return {
        ddram: emptyDdramBuffer(rows),
        displayShift: 0,
        cursorCol: 0,
        cursorRow: 0,
        backlight: true,
        rgb: supportsRgb ? { r: 255, g: 255, b: 255 } : null,
        supportsRgb,
        cols,
        rows,
    };
}

/** Avance le curseur après écriture (rgb_lcd = DDRAM 0x00–0x27 puis ligne 2). */
function advanceLcdCursor(st) {
    if (st.supportsRgb) {
        st.cursorCol++;
        if (st.cursorCol >= LCD_DDRAM_COLS) {
            st.cursorCol = 0;
            if (st.cursorRow + 1 < st.rows) st.cursorRow++;
        }
        return;
    }
    // LiquidCrystal_I2C : retour à la ligne visible après cols caractères
    st.cursorCol++;
    if (st.cursorCol >= st.cols) {
        st.cursorCol = 0;
        if (st.cursorRow + 1 < st.rows) st.cursorRow++;
        else st.cursorRow = 0;
    }
}

function writeLcdChar(st, row, col, ch) {
    if (row >= st.rows || col < 0 || col >= LCD_DDRAM_COLS) return;
    const arr = st.ddram[row].split("");
    arr[col] = ch;
    st.ddram[row] = padDdramLine(arr.join(""));
}

function parseRgbArgs(args, src) {
    const parts = String(args || "").split(",").map((x) => x.trim());
    const resolve = (t) => {
        if (!t) return 0;
        const fromDef = resolveNumericConst(src, t);
        if (fromDef != null) return Math.max(0, Math.min(255, fromDef));
        const n = parseInt(t, 10);
        return Number.isFinite(n) ? Math.max(0, Math.min(255, n)) : 0;
    };
    return {
        r: resolve(parts[0]),
        g: resolve(parts[1] ?? "0"),
        b: resolve(parts[2] ?? "0"),
    };
}

function applyLcdCall(fn, args, st, src = "", ctx = null) {
    if (fn === "clear") {
        st.ddram = emptyDdramBuffer(st.rows);
        st.displayShift = 0;
        st.cursorCol = 0;
        st.cursorRow = 0;
        return true;
    }
    if (fn === "home") {
        st.cursorCol = 0;
        st.cursorRow = 0;
        return true;
    }
    if (fn === "backlight") {
        st.backlight = true;
        return false;
    }
    if (fn === "nobacklight") {
        st.backlight = false;
        return false;
    }
    if (fn === "setrgb") {
        st.rgb = parseRgbArgs(args, src);
        st.backlight = st.rgb.r + st.rgb.g + st.rgb.b > 0;
        return true;
    }
    if (fn === "scrolldisplayleft") {
        const cap = maxLcdDisplayShift(st.cols || LCD_COLS);
        st.displayShift = Math.min(cap, (st.displayShift || 0) + 1);
        return true;
    }
    if (fn === "scrolldisplayright") {
        st.displayShift = Math.max(0, (st.displayShift || 0) - 1);
        return true;
    }
    if (fn === "init" || fn === "begin") {
        const parts = args.split(",").map((x) => x.trim());
        if (parts.length >= 2 && /^\d+$/.test(parts[0])) {
            st.cols = Math.min(LCD_COLS, parseInt(parts[0], 10) || st.cols);
            st.rows = Math.min(LCD_ROWS, parseInt(parts[1], 10) || st.rows);
            st.ddram = emptyDdramBuffer(st.rows);
            st.displayShift = 0;
        }
        return false;
    }
    if (fn === "setcursor") {
        const parts = args.split(",").map((x) => x.trim());
        if (parts.length >= 2) {
            const col = parseInt(parts[0], 10) || 0;
            const row = parseInt(parts[1], 10) || 0;
            st.cursorCol = Math.max(0, Math.min(LCD_DDRAM_LAST_ADDR, col));
            st.cursorRow = Math.max(0, Math.min(st.rows - 1, row));
        }
        return false;
    }
    if (fn === "print" || fn === "write") {
        const text = parsePrintArg(args.split(",")[0], ctx);
        if (!text) return true;
        if (st.supportsRgb) {
            for (const ch of text) {
                if (st.cursorRow >= st.rows) break;
                writeLcdChar(st, st.cursorRow, st.cursorCol, ch);
                advanceLcdCursor(st);
            }
        } else {
            let col = st.cursorCol;
            let row = st.cursorRow;
            for (const ch of text) {
                if (row >= st.rows) break;
                writeLcdChar(st, row, col, ch);
                col++;
                if (col >= st.cols) {
                    col = 0;
                    if (row + 1 < st.rows) row++;
                    else row = 0;
                }
            }
            st.cursorCol = col;
            st.cursorRow = row;
        }
        return true;
    }
    return false;
}

function cloneLcdState(st) {
    return {
        ddram: st.ddram.map((row) => padDdramLine(row)),
        displayShift: st.displayShift || 0,
        cursorCol: st.cursorCol,
        cursorRow: st.cursorRow,
        backlight: st.backlight,
        rgb: st.rgb ? { ...st.rgb } : null,
        supportsRgb: !!st.supportsRgb,
        cols: st.cols,
        rows: st.rows,
    };
}

function loopBodyDurationMs(events) {
    let t = 0;
    for (const ev of events) {
        if (ev.type === "delay") t += ev.ms;
    }
    return t;
}

/** Rejoue les événements loop() jusqu'à maxMs (ms dans le cycle courant). */
function runLoopEvents(st, events, src, maxMs, ctx = null) {
    let t = 0;
    for (const ev of events) {
        if (ev.type === "delay") {
            if (t >= maxMs) return;
            const next = t + ev.ms;
            if (next > maxMs) return;
            t = next;
        } else {
            if (t > maxMs) return;
            applyLcdCall(ev.fn, ev.args, st, src, ctx);
        }
    }
}

function runFullLoop(st, events, src, ctx = null) {
    runLoopEvents(st, events, src, Number.POSITIVE_INFINITY, ctx);
}

function snapshotPhase(phases, timeMs, st) {
    phases.push({
        atMs: timeMs,
        lines: cloneLines(st),
        backlight: st.backlight,
        rgb: st.rgb ? { ...st.rgb } : null,
    });
}

function runTimedBody(body, varName, phases, st, timeRef, src = "", ctx = null) {
    if (!body?.trim()) return 0;
    const bodyCtx = ctx?.collectVarBindings
        ? { ...ctx, varBindings: ctx.collectVarBindings(body) }
        : ctx;
    const startMs = timeRef.ms;
    for (const ev of parseTimedEvents(body, varName)) {
        if (ev.type === "delay") {
            timeRef.ms += ev.ms;
        } else if (applyLcdCall(ev.fn, ev.args, st, src, bodyCtx)) {
            snapshotPhase(phases, timeRef.ms, st);
        }
    }
    return timeRef.ms - startMs;
}

/** Choisit la phase d'affichage pour un temps écoulé (ms). */
export function pickLcdPhaseAt(phases, elapsedMs, opts = {}) {
    if (!Array.isArray(phases) || phases.length === 0) return null;
    const loopCycleMs = opts.loopCycleMs ?? 0;
    const setupDurationMs = opts.setupDurationMs ?? 0;
    let t = Math.max(0, elapsedMs);
    if (loopCycleMs > 0 && t > setupDurationMs) {
        t = setupDurationMs + ((t - setupDurationMs) % loopCycleMs);
    }
    let picked = phases[0];
    for (const p of phases) {
        if (p.atMs <= t) picked = p;
        else break;
    }
    return picked;
}

/**
 * État LCD à un instant donné — rejoue loop() à chaque cycle (scroll cumulatif, etc.).
 * @param {ReturnType<typeof parseGroveLcdFromSketch>} parsed
 * @param {number} elapsedMs
 */
export function resolveLcdDisplayAt(parsed, elapsedMs, opts = {}) {
    if (!parsed) return null;
    const ctx = opts.ctx ?? null;
    const elapsed = Math.max(0, elapsedMs);
    const setupDurationMs = parsed.setupDurationMs ?? 0;

    if (elapsed < setupDurationMs) {
        return pickLcdPhaseAt(parsed.phases, elapsed, { loopCycleMs: 0, setupDurationMs: 0 });
    }

    const loopCycleMs = effectiveLcdLoopCycleMs(parsed);
    const loopEvents = parsed.loopEvents;
    if (loopCycleMs <= 0 || !loopEvents?.length) {
        const phase = pickLcdPhaseAt(parsed.phases, elapsed, { loopCycleMs: 0, setupDurationMs: 0 });
        if (phase) return phase;
        const end = parsed.setupEndState;
        if (end) {
            return {
                lines: cloneLines(end),
                backlight: end.backlight,
                rgb: end.rgb ? { ...end.rgb } : null,
            };
        }
        return null;
    }

    const st = cloneLcdState(parsed.setupEndState);
    const loopT = elapsed - setupDurationMs;
    const cyclesCompleted = Math.floor(loopT / loopCycleMs);
    const cyclePos = loopT % loopCycleMs;
    const src = parsed.sketchSrc || "";
    const loopCtx = ctx
        ? { ...ctx, varBindings: parsed.loopVarBindings ?? ctx.varBindings ?? {} }
        : null;

    for (let c = 0; c < cyclesCompleted; c++) {
        runFullLoop(st, loopEvents, src, loopCtx);
    }
    runLoopEvents(st, loopEvents, src, cyclePos, loopCtx);

    return {
        lines: cloneLines(st),
        backlight: st.backlight,
        rgb: st.rgb ? { ...st.rgb } : null,
    };
}

/**
 * @param {string} sketch
 * @returns {{ address: number, cols: number, rows: number, lines: string[], backlight: boolean, rgb: object | null, varName: string, phases: object[], hasTiming: boolean, setupDurationMs: number, loopCycleMs: number } | null}
 */
export function parseGroveLcdFromSketch(sketch, ctx = null) {
    const src = stripComments(sketch);
    const detected = detectLcdVariable(src);
    if (!detected) return null;

    const { varName, address, supportsRgb } = detected;
    const st = createLcdState(detected.cols, detected.rows, supportsRgb);
    const phases = [];
    const timeRef = { ms: 0 };

    const setupBody = expandUserFunctionCalls(extractFunctionBody(src, "setup"), src);
    const loopBody = expandUserFunctionCalls(extractFunctionBody(src, "loop"), src);
    const setupDurationMs = runTimedBody(setupBody, varName, phases, st, timeRef, src, ctx);
    const setupEndState = cloneLcdState(st);
    const loopEvents = parseTimedEvents(loopBody, varName);
    const loopCycleMs = loopBody.trim() ? loopBodyDurationMs(loopEvents) : 0;
    const effectiveLoopCycleMs = loopCycleMs > 0 ? loopCycleMs : (loopEvents.length ? LCD_DEFAULT_INSTANT_LOOP_MS : 0);
    if (loopBody.trim() && loopCycleMs > 0) {
        runTimedBody(loopBody, varName, phases, st, timeRef, src, ctx);
    }

    if (phases.length === 0) {
        snapshotPhase(phases, 0, st);
    }

    const last = phases[phases.length - 1];
    const hasTiming = effectiveLoopCycleMs > 0 || phases.length > 1 || phases.some((p) => p.atMs > 0);
    const visible = visibleLcdLines(st);

    const loopVarBindings = ctx?.collectVarBindings ? ctx.collectVarBindings(loopBody) : {};

    return {
        address,
        cols: st.cols,
        rows: st.rows,
        lines: visible.slice(0, st.rows),
        backlight: last.backlight,
        rgb: last.rgb ? { ...last.rgb } : (st.rgb ? { ...st.rgb } : null),
        varName,
        phases,
        hasTiming,
        setupDurationMs,
        loopCycleMs,
        effectiveLoopCycleMs,
        setupEndState,
        loopEvents,
        loopVarBindings,
        sketchSrc: src,
    };
}
