/**
 * Interprétation minimale d'un sketch Arduino (.ino) pour la co-simulation.
 * pinMode(n, OUTPUT|INPUT|INPUT_PULLUP), digitalWrite(n, HIGH|LOW|1|0), delay(ms).
 * Registres AVR : DDRB/C/D, PORTB/C/D (D0–D13, A0–A5).
 */

import {
    buildAvrRegistersFromParsed,
    applyDynamicLevelsToRegisters,
    registersToPinLevels,
    registersToPinModes,
} from "./arduino-avr-registers.mjs";
import { expandUserFunctionCalls } from "./sketch-functions.mjs";

export function resolvePinToken(token, boardType = "arduino_uno") {
    const t = String(token || "").trim();
    if (boardType === "esp32_c3") {
        if (/LED_BUILTIN/i.test(t)) return 8;
        const gpio = t.match(/^GPIO\s*(\d+)$/i);
        if (gpio) return parseInt(gpio[1], 10);
        const m = t.match(/\bD?\s*(\d+)\b/i);
        if (m) return parseInt(m[1], 10);
        return null;
    }
    if (/LED_BUILTIN/i.test(t)) return 13;
    const a = t.match(/^A(\d+)$/i);
    if (a) return 14 + parseInt(a[1], 10);
    const m = t.match(/\bD?\s*(\d+)\b/i);
    if (m) return parseInt(m[1], 10);
    return null;
}

function stripComments(src) {
    return String(src || "")
        .replace(/\/\/[^\n]*/g, "")
        .replace(/\/\*[\s\S]*?\*\//g, "");
}

function extractLoopBody(src) {
    const idx = src.search(/void\s+loop\s*\(\s*\)\s*\{/i);
    if (idx < 0) return src;
    let i = src.indexOf("{", idx);
    if (i < 0) return src;
    let depth = 0;
    const start = i + 1;
    for (; i < src.length; i++) {
        const ch = src[i];
        if (ch === "{") depth++;
        else if (ch === "}") {
            depth--;
            if (depth === 0) return src.slice(start, i);
        }
    }
    return src.slice(start);
}

function pinLabel(pin, boardType = "arduino_uno") {
    if (pin == null || pin < 0) return null;
    if (boardType === "esp32_c3") {
        const valid = new Set([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 20, 21]);
        return valid.has(pin) ? `GPIO${pin}` : null;
    }
    if (pin <= 13) return `D${pin}`;
    if (pin <= 19) return `A${pin - 14}`;
    return null;
}

/* ---------------------------------------------------------------------------
 * Mini-interpréteur de sketch : variables, delay, incréments, écritures PORTx.
 * Génère des phases temporelles (compteur, séquences) pour l'animation.
 * ------------------------------------------------------------------------- */

function extractFunctionBody(src, name) {
    const idx = src.search(new RegExp(`\\b(?:void|int|byte)\\s+${name}\\s*\\([^)]*\\)\\s*\\{`, "i"));
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

function bodyOf(src, name) {
    return expandUserFunctionCalls(extractFunctionBody(src, name), src);
}

function parseNumberLiteral(t) {
    const s = String(t).trim();
    if (/^0[xX][0-9a-fA-F]+$/.test(s)) return { v: parseInt(s, 16), f: false };
    if (/^0[bB][01]+$/.test(s)) return { v: parseInt(s.slice(2), 2), f: false };
    if (/^B[01]+$/.test(s)) return { v: parseInt(s.slice(1), 2), f: false };
    if (/^(\d+\.\d*|\.\d+)([eE][+-]?\d+)?$/.test(s)) return { v: parseFloat(s), f: true };
    if (/^\d+$/.test(s)) return { v: parseInt(s, 10), f: false };
    return null;
}

function evVal(x) {
    return x && typeof x === "object" && "v" in x ? x.v : (x ?? 0);
}

function evFloat(x) {
    return !!(x && typeof x === "object" && x.f);
}

function evPack(v, f) {
    return f ? { v, f: true } : v;
}

function tokenizeExpr(expr) {
    const toks = [];
    const s = String(expr);
    let i = 0;
    const two = ["<<", ">>", "<=", ">=", "==", "!=", "&&", "||"];
    while (i < s.length) {
        const c = s[i];
        if (/\s/.test(c)) { i++; continue; }
        if (/[0-9.]/.test(c)) {
            let j = i + 1;
            if (c === "0" && (s[i + 1] === "x" || s[i + 1] === "X")) {
                j = i + 2;
                while (j < s.length && /[0-9a-fA-F]/.test(s[j])) j++;
            } else if (c === "0" && (s[i + 1] === "b" || s[i + 1] === "B")) {
                j = i + 2;
                while (j < s.length && /[01]/.test(s[j])) j++;
            } else {
                while (j < s.length && /[0-9.]/.test(s[j])) j++;
            }
            const lit = parseNumberLiteral(s.slice(i, j));
            if (!lit) return null;
            toks.push({ t: "num", v: lit.v, f: lit.f });
            i = j;
            continue;
        }
        if (/[A-Za-z_]/.test(c)) {
            let j = i + 1;
            while (j < s.length && /[A-Za-z0-9_]/.test(s[j])) j++;
            toks.push({ t: "id", v: s.slice(i, j) });
            i = j;
            continue;
        }
        const pair = s.slice(i, i + 2);
        if (two.includes(pair)) { toks.push({ t: "op", v: pair }); i += 2; continue; }
        if ("+-*/%()<>!&|^~".includes(c)) { toks.push({ t: "op", v: c }); i++; continue; }
        return null;
    }
    return toks;
}

const BIN_PREC = {
    "*": 10, "/": 10, "%": 10,
    "+": 9, "-": 9,
    "<<": 8, ">>": 8,
    "<": 7, "<=": 7, ">": 7, ">=": 7,
    "==": 6, "!=": 6,
    "&": 5, "^": 4, "|": 3,
    "&&": 2, "||": 1,
};

function evalExpr(expr, vars, floatVars = new Set(), regs = {}) {
    const toks = tokenizeExpr(expr);
    if (!toks) return 0;
    const out = [];
    const ops = [];
    let prevValue = false;
    const applyTop = () => {
        const op = ops.pop();
        if (op.unary) {
            const a = out.pop() ?? 0;
            const av = evVal(a);
            if (op.v === "-") out.push(evPack(-av, evFloat(a)));
            else if (op.v === "!") out.push(av ? 0 : 1);
            else if (op.v === "~") out.push(~av);
            return;
        }
        const b = out.pop() ?? 0;
        const a = out.pop() ?? 0;
        const av = evVal(a);
        const bv = evVal(b);
        const fp = evFloat(a) || evFloat(b);
        switch (op.v) {
            case "*": out.push(evPack(av * bv, fp)); break;
            case "/":
                out.push(evPack(fp ? (bv === 0 ? 0 : av / bv) : (bv === 0 ? 0 : Math.trunc(av / bv)), fp));
                break;
            case "%": out.push(bv === 0 ? 0 : av % bv); break;
            case "+": out.push(evPack(av + bv, fp)); break;
            case "-": out.push(evPack(av - bv, fp)); break;
            case "<<": out.push(av << bv); break;
            case ">>": out.push(av >> bv); break;
            case "<": out.push(av < bv ? 1 : 0); break;
            case "<=": out.push(av <= bv ? 1 : 0); break;
            case ">": out.push(av > bv ? 1 : 0); break;
            case ">=": out.push(av >= bv ? 1 : 0); break;
            case "==": out.push(av === bv ? 1 : 0); break;
            case "!=": out.push(av !== bv ? 1 : 0); break;
            case "&": out.push(av & bv); break;
            case "^": out.push(av ^ bv); break;
            case "|": out.push(av | bv); break;
            case "&&": out.push(av && bv ? 1 : 0); break;
            case "||": out.push(av || bv ? 1 : 0); break;
            default: out.push(0);
        }
    };
    for (const tok of toks) {
        if (tok.t === "num") { out.push(evPack(tok.v, tok.f)); prevValue = true; continue; }
        if (tok.t === "id") {
            const name = tok.v;
            if (/^(HIGH|true)$/i.test(name)) out.push(1);
            else if (/^(LOW|false)$/i.test(name)) out.push(0);
            else if (/^(DDR|PORT)[BCD]$/.test(name)) {
                out.push((regs[name] ?? 0) & 0xff);
            } else {
                const pin = resolvePinToken(name);
                if (pin != null) out.push(pin);
                else {
                    const raw = vars[name];
                    const n = Number.isFinite(raw) ? raw : 0;
                    const asFloat =
                        floatVars.has(name) ||
                        (typeof raw === "number" && !Number.isInteger(raw));
                    out.push(asFloat ? { v: n, f: true } : n);
                }
            }
            prevValue = true;
            continue;
        }
        const v = tok.v;
        if (v === "(") { ops.push({ v }); prevValue = false; continue; }
        if (v === ")") {
            while (ops.length && ops[ops.length - 1].v !== "(") applyTop();
            ops.pop();
            prevValue = true;
            continue;
        }
        const unary = !prevValue && (v === "-" || v === "!" || v === "~");
        if (unary) { ops.push({ v, unary: true, prec: 11 }); prevValue = false; continue; }
        const prec = BIN_PREC[v] ?? 0;
        while (
            ops.length &&
            ops[ops.length - 1].v !== "(" &&
            (ops[ops.length - 1].prec ?? BIN_PREC[ops[ops.length - 1].v] ?? 0) >= prec
        ) {
            applyTop();
        }
        ops.push({ v, prec });
        prevValue = false;
    }
    while (ops.length) {
        if (ops[ops.length - 1].v === "(") { ops.pop(); continue; }
        applyTop();
    }
    const r = out[out.length - 1];
    if (r == null) return 0;
    return evFloat(r) ? evVal(r) : Math.trunc(evVal(r));
}

const DECL_RE = /\b((?:const\s+)?(?:unsigned\s+)?(?:int|long|byte|char|short|float|double|uint8_t|uint16_t|volatile\s+int|volatile\s+byte))\s+([A-Za-z_][A-Za-z0-9_]*)\s*=\s*([^;,]+)/g;
const FLOAT_DECL_RE = /\b(?:const\s+)?(?:float|double)\s+([A-Za-z_][A-Za-z0-9_]*)\s*;/g;

function collectInitialVars(src) {
    const vars = {};
    const floatVars = new Set();
    const globalPart = String(src || "").split(/\bvoid\s+setup\s*\(/i)[0];
    let m;
    FLOAT_DECL_RE.lastIndex = 0;
    while ((m = FLOAT_DECL_RE.exec(globalPart)) !== null) {
        floatVars.add(m[1]);
        if (!(m[1] in vars)) vars[m[1]] = 0;
    }
    DECL_RE.lastIndex = 0;
    while ((m = DECL_RE.exec(globalPart)) !== null) {
        const name = m[2];
        vars[name] = evalExpr(m[3], vars, floatVars);
        if (/\b(?:float|double)\b/i.test(m[1])) floatVars.add(name);
    }
    return { vars, floatVars };
}

function parseParenCondition(s, startIdx) {
    let i = startIdx;
    const n = s.length;
    while (i < n && /\s/.test(s[i])) i++;
    if (s[i] !== "(") return null;
    let depth = 0;
    let j = i;
    for (; j < n; j++) {
        if (s[j] === "(") depth++;
        else if (s[j] === ")") { depth--; if (depth === 0) break; }
    }
    return { cond: s.slice(i + 1, j), next: j + 1 };
}

const MAX_WHILE_ITER = 10000;

function parseStatementOrBlock(s, i) {
    const n = s.length;
    while (i < n && /\s/.test(s[i])) i++;
    if (s[i] === "{") {
        let depth = 0;
        let j = i;
        for (; j < n; j++) {
            if (s[j] === "{") depth++;
            else if (s[j] === "}") { depth--; if (depth === 0) break; }
        }
        return { stmt: parseStatements(s.slice(i + 1, j)), next: j + 1 };
    }
    let j = i;
    let depth = 0;
    for (; j < n; j++) {
        const c = s[j];
        if (c === "(") depth++;
        else if (c === ")") depth--;
        else if (c === ";" && depth === 0) break;
    }
    const text = s.slice(i, j).trim();
    return { stmt: text ? [{ type: "expr", text }] : [], next: j + 1 };
}

function parseStatements(body) {
    const stmts = [];
    const s = String(body);
    const n = s.length;
    let i = 0;
    while (i < n) {
        while (i < n && /\s/.test(s[i])) i++;
        if (i >= n) break;
        if (s.slice(i, i + 5) === "while" && !/[A-Za-z0-9_]/.test(s[i + 5] || "")) {
            const condPart = parseParenCondition(s, i + 5);
            if (!condPart) { i++; continue; }
            const bodyPart = parseStatementOrBlock(s, condPart.next);
            stmts.push({ type: "while", cond: condPart.cond, body: bodyPart.stmt });
            i = bodyPart.next;
            continue;
        }
        if (s.slice(i, i + 2) === "if" && !/[A-Za-z0-9_]/.test(s[i + 2] || "")) {
            i += 2;
            const condPart = parseParenCondition(s, i);
            if (!condPart) continue;
            const thenPart = parseStatementOrBlock(s, condPart.next);
            let elsePart = null;
            let k = thenPart.next;
            while (k < n && /\s/.test(s[k])) k++;
            if (s.slice(k, k + 4) === "else" && !/[A-Za-z0-9_]/.test(s[k + 4] || "")) {
                const r = parseStatementOrBlock(s, k + 4);
                elsePart = r.stmt;
                i = r.next;
            } else {
                i = thenPart.next;
            }
            stmts.push({ type: "if", cond: condPart.cond, body: thenPart.stmt, elseBody: elsePart });
            continue;
        }
        let j = i;
        let depth = 0;
        for (; j < n; j++) {
            const c = s[j];
            if (c === "(") depth++;
            else if (c === ")") depth--;
            else if (c === ";" && depth === 0) break;
        }
        const text = s.slice(i, j).trim();
        if (text) stmts.push({ type: "expr", text });
        i = j + 1;
    }
    return stmts;
}

function resolvePinLabelFromExpr(expr, state) {
    const t = String(expr || "").trim();
    if (!t) return null;
    try {
        return pinLabel(evalExprState(substituteCalls(t, state), state));
    } catch {
        return pinLabel(resolvePinToken(t));
    }
}

/**
 * Remplace les appels de fonction connus par leur valeur avant évaluation :
 * digitalRead(pin), analogRead(pin), millis()/micros(), Serial…
 */
function substituteCalls(expr, state) {
    let s = String(expr);
    s = s.replace(/\bdigitalRead\s*\(\s*([^()]*?)\s*\)/gi, (_, p) => {
        const label = resolvePinLabelFromExpr(p, state);
        const v = label && state.inputs ? state.inputs[label] : undefined;
        return v === 0 ? "0" : "1";
    });
    s = s.replace(/\banalogRead\s*\(\s*([^()]*?)\s*\)/gi, (_, p) => {
        const label = resolvePinLabelFromExpr(p, state);
        const adc = label && state.analogInputs ? state.analogInputs[label] : undefined;
        return String(Number.isFinite(adc) ? Math.round(adc) : 0);
    });
    s = s.replace(/\b(?:millis|micros)\s*\(\s*\)/gi, String(Math.trunc(state.simTimeMs || 0)));
    s = s.replace(/\bSerial\.available\s*\(\s*\)/gi, String(serialAvailable(state)));
    s = s.replace(/\bSerial\.read\s*\(\s*\)/gi, String(serialRead(state)));
    s = s.replace(/\b(\w+)\.readTemperature\s*\(\s*\)/gi, (_, varName) => {
        const dht = state.dhtReadings;
        if (dht && dht.varName === varName) return String(dht.temperature);
        return "nan";
    });
    s = s.replace(/\b(\w+)\.readHumidity\s*\(\s*\)/gi, (_, varName) => {
        const dht = state.dhtReadings;
        if (dht && dht.varName === varName) return String(dht.humidity);
        return "nan";
    });
    s = s.replace(/\b(\w+)\.getFullLuminosity\s*\(\s*\)/gi, (_, varName) => {
        const tsl = state.tslReadings;
        if (tsl && tsl.varName === varName) {
            const full = Math.round(tsl.full) & 0xffff;
            const ir = Math.round(tsl.ir) & 0xffff;
            return String((full << 16) | ir);
        }
        return "0";
    });
    s = s.replace(/\b(\w+)\.calculateLux\s*\(\s*([^)]*)\s*\)/gi, (_, varName) => {
        const tsl = state.tslReadings;
        if (tsl && tsl.varName === varName) return String(tsl.lux);
        return "nan";
    });
    s = s.replace(/\bSerial\b/g, "1");
    return s;
}

function createSerialState() {
    return { tx: "", rx: [], baud: 9600, begun: false, schedule: [] };
}

function ensureSerial(state) {
    if (!state.serial) state.serial = createSerialState();
    return state.serial;
}

/** UART matériel : TX/RX selon carte. */
function configUartPins(state) {
    if (state.boardType === "esp32_c3") {
        state.pins.GPIO21 = 1;
        if (state.pins.GPIO20 == null) state.pins.GPIO20 = 0;
        return;
    }
    state.regs.DDRD = ((state.regs.DDRD || 0) & ~0x01) | 0x02;
    state.regs.PORTD = (state.regs.PORTD || 0) | 0x02;
    state.pins.D1 = 1;
}

function serialAvailable(state) {
    const ser = state.serial;
    if (!ser?.begun) return 0;
    if (ser.rx.length > 0) return ser.rx.length;
    return 1;
}

function serialRead(state) {
    const ser = ensureSerial(state);
    if (!ser.rx.length) return -1;
    return ser.rx.shift();
}

function unescapeCppString(s) {
    return String(s)
        .replace(/\\n/g, "\n")
        .replace(/\\r/g, "\r")
        .replace(/\\t/g, "\t")
        .replace(/\\\\/g, "\\")
        .replace(/\\"/g, '"')
        .replace(/\\'/g, "'");
}

function skipQuotedArg(src, i) {
    const q = src[i];
    i++;
    while (i < src.length) {
        if (src[i] === "\\") { i += 2; continue; }
        if (src[i] === q) return i + 1;
        i++;
    }
    return src.length;
}

function extractFirstCallArg(text) {
    const open = text.indexOf("(");
    if (open < 0) return null;
    let depth = 0;
    let i = open + 1;
    const start = i;
    while (i < text.length) {
        const c = text[i];
        if (c === '"' || c === "'") { i = skipQuotedArg(text, i); continue; }
        if (c === "(") { depth++; i++; continue; }
        if (c === ")") {
            if (depth === 0) return text.slice(start, i).trim();
            depth--;
            i++;
            continue;
        }
        if (c === "," && depth === 0) return text.slice(start, i).trim();
        i++;
    }
    return null;
}

function evalExprState(expr, state) {
    return evalExpr(substituteCalls(expr, state), state.vars, state.floatVars, state.regs);
}

function formatSerialNumber(n, state, exprText) {
    const name = String(exprText || "").trim();
    const isFloat =
        evFloat(n) ||
        state.floatVars?.has(name) ||
        (typeof n === "number" && !Number.isInteger(n));
    const v = evVal(n);
    if (isFloat) return v.toFixed(2);
    return String(Math.trunc(v));
}

function evalSerialPrintArg(arg, state) {
    const t = String(arg || "").trim();
    if (!t) return "";
    const strM = t.match(/^String\s*\(\s*([\s\S]+?)\s*\)$/i);
    if (strM) return evalSerialPrintArg(strM[1], state);
    const concatM = t.match(/^([\s\S]+?)\s*\+\s*([\s\S]+)$/);
    if (concatM) {
        return evalSerialPrintArg(concatM[1].trim(), state) + evalSerialPrintArg(concatM[2].trim(), state);
    }
    const fM = t.match(/^F\s*\(\s*(["'])([\s\S]*?)\1\s*\)/);
    if (fM) return unescapeCppString(fM[2]);
    if (t.startsWith('"') && t.endsWith('"')) return unescapeCppString(t.slice(1, -1));
    if (t.startsWith("'") && t.endsWith("'") && t.length > 2) return unescapeCppString(t.slice(1, -1));
    if (t.startsWith("'") && t.length === 3) return t[1];
    try {
        const n = evalExprState(t, state);
        return formatSerialNumber(n, state, t);
    } catch {
        return t;
    }
}

function appendSerialTx(state, text, newline = false) {
    const ser = ensureSerial(state);
    if (!ser.begun) {
        ser.begun = true;
        ser.baud = ser.baud || 9600;
        configUartPins(state);
    }
    const chunk = String(text) + (newline ? "\n" : "");
    ser.tx += chunk;
    ser.schedule.push({ startMs: state.simTimeMs || 0, data: chunk });
    configUartPins(state);
}

/** Exécute une instruction simple ; renvoie la durée delay() en ms (0 sinon). */
function execExprStatement(text, state, onDelay) {
    const delayM = text.match(/^delay\s*\(\s*(.+?)\s*\)$/i);
    if (delayM) {
        const ms = Math.max(0, evalExprState(delayM[1], state));
        if (onDelay) onDelay(ms);
        return ms;
    }
    if (/^Serial\.begin\s*\(/i.test(text)) {
        const ser = ensureSerial(state);
        const arg = extractFirstCallArg(text);
        ser.baud = arg ? Math.max(300, evalExprState(arg, state)) : 9600;
        ser.begun = true;
        configUartPins(state);
        return 0;
    }
    if (/^Serial\.print(ln)?\s*\(/i.test(text)) {
        const ln = /^Serial\.println\s*\(/i.test(text);
        const arg = extractFirstCallArg(text);
        appendSerialTx(state, evalSerialPrintArg(arg, state), ln);
        return 0;
    }
    if (/^Serial\.write\s*\(/i.test(text)) {
        const arg = extractFirstCallArg(text);
        const code = evalExprState(arg || "0", state) & 0xff;
        appendSerialTx(state, String.fromCharCode(code), false);
        return 0;
    }
    if (/^digitalWrite\s*\(/i.test(text)) {
        const m = text.match(/^digitalWrite\s*\(\s*([^,]+)\s*,\s*(.+)\)$/i);
        if (m) {
            const label = pinLabel(resolvePinToken(m[1], state.boardType), state.boardType);
            if (label) state.pins[label] = evalExprState(m[2], state) ? 1 : 0;
        }
        return 0;
    }
    if (/^pinMode\s*\(/i.test(text)) return 0;
    if (/^\w+\.begin\s*\(\s*\)/i.test(text)) return 0;

    const localDecl = text.match(
        /^(?:const\s+)?(?:unsigned\s+)?(int|long|byte|short|float|double)\s+([A-Za-z_][A-Za-z0-9_]*)\s*=\s*([\s\S]+)$/i
    );
    if (localDecl) {
        const type = localDecl[1];
        const name = localDecl[2];
        const isFloat = /^(?:float|double)$/i.test(type);
        if (isFloat) {
            state.floatVars = state.floatVars || new Set();
            state.floatVars.add(name);
        }
        const val = evalExprState(localDecl[3], state);
        state.vars[name] = isFloat ? val : Math.trunc(val);
        return 0;
    }

    const localFloatOnly = text.match(/^(?:const\s+)?(?:float|double)\s+([A-Za-z_][A-Za-z0-9_]*)\s*$/i);
    if (localFloatOnly) {
        state.floatVars = state.floatVars || new Set();
        state.floatVars.add(localFloatOnly[1]);
        if (!(localFloatOnly[1] in state.vars)) state.vars[localFloatOnly[1]] = 0;
        return 0;
    }

    let m = text.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*(\+\+|--)$/) ||
        text.match(/^(\+\+|--)\s*([A-Za-z_][A-Za-z0-9_]*)$/);
    if (m) {
        const name = /[A-Za-z_]/.test(m[1][0]) ? m[1] : m[2];
        const op = /[A-Za-z_]/.test(m[1][0]) ? m[2] : m[1];
        state.vars[name] = (state.vars[name] || 0) + (op === "++" ? 1 : -1);
        return 0;
    }

    m = text.match(/^(DDR[BCD]|PORT[BCD]|[A-Za-z_][A-Za-z0-9_]*)\s*(\|=|&=|\^=|\+=|-=|\*=|\/=|%=|<<=|>>=|=)\s*([\s\S]+)$/);
    if (!m) return 0;
    const target = m[1];
    const op = m[2];
    const rhs = evalExprState(m[3], state);
    const cur = /^(DDR|PORT)[BCD]$/.test(target)
        ? state.regs[target] || 0
        : state.vars[target] || 0;
    let val;
    switch (op) {
        case "=": val = rhs; break;
        case "|=": val = cur | rhs; break;
        case "&=": val = cur & rhs; break;
        case "^=": val = cur ^ rhs; break;
        case "+=": val = cur + rhs; break;
        case "-=": val = cur - rhs; break;
        case "*=": val = cur * rhs; break;
        case "/=": val = rhs === 0 ? cur : Math.trunc(cur / rhs); break;
        case "%=": val = rhs === 0 ? cur : cur % rhs; break;
        case "<<=": val = cur << rhs; break;
        case ">>=": val = cur >> rhs; break;
        default: val = rhs;
    }
    if (/^(DDR|PORT)[BCD]$/.test(target)) {
        state.regs[target] = val & 0xff;
        if (state.assignedRegs) state.assignedRegs.add(target);
    } else {
        const isFloat = state.floatVars?.has(target);
        state.vars[target] = isFloat ? val : Math.trunc(val);
    }
    return 0;
}

function execStatements(stmts, state, onDelay) {
    for (const st of stmts) {
        if (st.type === "expr") execExprStatement(st.text, state, onDelay);
        else if (st.type === "if") {
            if (evalExprState(st.cond, state)) execStatements(st.body, state, onDelay);
            else if (st.elseBody) execStatements(st.elseBody, state, onDelay);
        } else if (st.type === "while") {
            let guard = 0;
            while (evalExprState(st.cond, state) && guard < MAX_WHILE_ITER) {
                guard++;
                execStatements(st.body, state, onDelay);
            }
        }
    }
}

/**
 * Exécution pas-à-pas du loop() sous forme de générateur : chaque delay(ms)
 * rendu (yield) permet de suspendre l'exécution et de l'aligner sur le temps réel.
 */
function* runLoopGen(stmts, state) {
    for (const st of stmts) {
        if (st.type === "expr") {
            const d = execExprStatement(st.text, state);
            if (d > 0) yield d;
        } else if (st.type === "if") {
            if (evalExprState(st.cond, state)) yield* runLoopGen(st.body, state);
            else if (st.elseBody) yield* runLoopGen(st.elseBody, state);
        } else if (st.type === "while") {
            let guard = 0;
            while (evalExprState(st.cond, state) && guard < MAX_WHILE_ITER) {
                guard++;
                yield* runLoopGen(st.body, state);
            }
        }
    }
}

const PORT_TO_LABELS = {
    PORTD: ["D0", "D1", "D2", "D3", "D4", "D5", "D6", "D7"],
    PORTB: ["D8", "D9", "D10", "D11", "D12", "D13"],
    PORTC: ["A0", "A1", "A2", "A3", "A4", "A5"],
};
const DDR_FOR_PORT = { PORTD: "DDRD", PORTB: "DDRB", PORTC: "DDRC" };

function resolveOutputLevels(state) {
    const levels = {};
    const portMap =
        state.boardType === "esp32_c3"
            ? {
                PORTD: ["GPIO0", "GPIO1", "GPIO2", "GPIO3", "GPIO4", "GPIO5", "GPIO6", "GPIO7"],
                PORTB: ["GPIO8", "GPIO9", "GPIO10"],
                PORTC: [],
            }
            : PORT_TO_LABELS;
    for (const [port, labels] of Object.entries(portMap)) {
        const ddrReg = DDR_FOR_PORT[port];
        if (!ddrReg) continue;
        const ddr = state.regs[ddrReg] || 0;
        const val = state.regs[port] || 0;
        labels.forEach((label, bit) => {
            if (label && (ddr >> bit) & 1) levels[label] = (val >> bit) & 1;
        });
    }
    for (const [label, lv] of Object.entries(state.pins)) levels[label] = lv ? 1 : 0;
    return levels;
}

/* ---------------------------------------------------------------------------
 * Runtime temps réel : exécute setup() une fois puis loop() en boucle pendant
 * la simulation (delay(), digitalWrite, registres PORT, digitalRead…).
 * ------------------------------------------------------------------------- */

/** Le sketch définit-il une fonction loop() non vide ? */
export function sketchHasLoop(sketch) {
    const loop = bodyOf(stripComments(sketch || ""), "loop");
    return !!loop.trim();
}

/** Le loop() lit-il une entrée (digitalRead) ? */
export function sketchUsesLiveInput(sketch) {
    const loop = bodyOf(stripComments(sketch || ""), "loop");
    return /\bdigitalRead\s*\(/i.test(loop);
}

/** Le loop() utilise-t-il analogRead ? */
export function sketchUsesAnalogInput(sketch) {
    const loop = bodyOf(stripComments(sketch || ""), "loop");
    return /\banalogRead\s*\(/i.test(loop);
}

export function createArduinoRuntime(uno) {
    const src = stripComments(uno?.sketch || "");
    const setupBody = bodyOf(src, "setup");
    const loopBody = bodyOf(src, "loop");
    const init = collectInitialVars(src);
    const state = {
        boardType: uno?.type || "arduino_uno",
        vars: init.vars,
        floatVars: init.floatVars,
        regs: {},
        pins: {},
        inputs: {},
        analogInputs: {},
        simTimeMs: 0,
        serial: createSerialState(),
    };
    execStatements(parseStatements(setupBody), state, (ms) => { state.simTimeMs += ms; });
    return {
        sketch: uno?.sketch || "",
        state,
        loopStmts: parseStatements(loopBody),
        gen: null,
        sleepMs: 0,
        passDelays: 0,
        idle: false,
        lastInputs: null,
    };
}

/**
 * Avance le runtime de deltaMs (temps réel), en consommant les delay().
 * @param {object} rt runtime créé par createArduinoRuntime
 * @param {number} deltaMs durée écoulée depuis le dernier pas
 * @param {Record<string, number>} inputs niveaux d'entrée live (ex. { D13: 0 })
 * @param {Record<string, number>} [analogInputs] valeurs ADC 0–1023 (ex. { A0: 512 })
 */
export function stepArduinoRuntime(rt, deltaMs, inputs, analogInputs) {
    if (!rt) return;
    rt.state.inputs = inputs || {};
    rt.state.analogInputs = analogInputs || {};
    const inKey = JSON.stringify(rt.state.inputs);
    if (rt.lastInputs !== inKey) rt.idle = false;
    rt.lastInputs = inKey;
    if (rt.idle) return;
    let budget = Math.min(Math.max(0, deltaMs), 2000);
    let guard = 0;
    while (budget > 0 && guard < 200000) {
        guard++;
        if (rt.sleepMs > 0) {
            const c = Math.min(budget, rt.sleepMs);
            rt.sleepMs -= c;
            budget -= c;
            rt.state.simTimeMs += c;
            if (rt.sleepMs > 0) break;
            continue;
        }
        if (!rt.gen) { rt.gen = runLoopGen(rt.loopStmts, rt.state); rt.passDelays = 0; }
        const r = rt.gen.next();
        if (r.done) {
            rt.gen = null;
            if (!rt.loopStmts.length) {
                rt.idle = true;
                break;
            }
            if (rt.passDelays > 0) {
                rt.passDelays = 0;
                continue;
            }
            // loop() sans delay : une itération par frame (effets cumulatifs, digitalRead…)
            break;
        }
        rt.sleepMs = Math.max(0, Number(r.value) || 0);
        rt.passDelays++;
    }
}

export function arduinoRuntimeLevels(rt) {
    return rt ? resolveOutputLevels(rt.state) : {};
}

export function getRuntimeSerialTx(rt) {
    return rt?.state?.serial?.tx ?? "";
}

export function injectRuntimeSerialRx(rt, text) {
    if (!rt) return;
    const ser = ensureSerial(rt.state);
    for (const ch of String(text)) ser.rx.push(ch.charCodeAt(0) & 0xff);
}

export function getRuntimeSerialMeta(rt) {
    const ser = rt?.state?.serial;
    return { begun: !!ser?.begun, baud: ser?.baud ?? 0 };
}

function formatBindingValue(name, value, floatVars) {
    const v = typeof value === "number" ? value : Number(value);
    if (!Number.isFinite(v)) return "0";
    if (floatVars?.has(name) || !Number.isInteger(v)) return v.toFixed(2);
    return String(Math.trunc(v));
}

/**
 * Évalue les variables locales du loop() (analogRead, calculs float…) pour lcd.print(var).
 * @param {string} sketch
 * @param {Record<string, number>} [analogInputs] ex. { A0: 512 }
 * @returns {Record<string, string>}
 */
export function evaluateLoopVarBindings(sketch, analogInputs = {}) {
    const src = stripComments(sketch || "");
    const loopBody = bodyOf(src, "loop");
    if (!loopBody.trim()) return {};
    const init = collectInitialVars(src);
    const state = {
        vars: { ...init.vars },
        floatVars: new Set(init.floatVars),
        regs: {},
        pins: {},
        inputs: {},
        analogInputs: analogInputs || {},
        simTimeMs: 0,
    };
    const bindings = {};
    for (const st of parseStatements(loopBody)) {
        if (st.type !== "expr") continue;
        const text = st.text.trim();
        const isLocalDecl = /^(?:const\s+)?(?:unsigned\s+)?(?:int|long|byte|short|float|double)\s+[A-Za-z_]\w*\s*=/i.test(text);
        if (!isLocalDecl) continue;
        execExprStatement(text, state, null);
        const m = text.match(
            /^(?:const\s+)?(?:unsigned\s+)?(?:int|long|byte|short|float|double)\s+([A-Za-z_][A-Za-z0-9_]*)\s*=/i
        );
        if (m && Object.prototype.hasOwnProperty.call(state.vars, m[1])) {
            bindings[m[1]] = formatBindingValue(m[1], state.vars[m[1]], state.floatVars);
        }
    }
    return bindings;
}

/**
 * Exécute setup() puis loop() une fois et renvoie l'état final des registres.
 * Résout les variables et expressions (PORTD = x, PORTD = x << 1, etc.).
 */
function interpretRegisterState(src, boardType = "arduino_uno") {
    const setupBody = bodyOf(src, "setup");
    const loopBody = bodyOf(src, "loop");
    if (!setupBody && !loopBody) return null;
    if (!/\b(?:DDR|PORT)[BCD]\s*(?:\|=|&=|\^=|=)/.test(`${setupBody};${loopBody}`)) return null;
    const init = collectInitialVars(src);
    const state = { boardType, vars: init.vars, floatVars: init.floatVars, regs: {}, pins: {}, assignedRegs: new Set() };
    execStatements(parseStatements(setupBody), state, () => {});
    execStatements(parseStatements(loopBody), state, () => {});
    return { regs: state.regs, assigned: state.assignedRegs };
}

/** Exécute le sketch (setup + loop) pour générer des phases temporelles. */
function interpretRegisterPhases(src, boardType = "arduino_uno") {
    const setupBody = bodyOf(src, "setup");
    const loopBody = bodyOf(src, "loop");
    if (!loopBody) return null;
    if (!/\bdelay\s*\(/i.test(loopBody)) return null;
    if (!/\bPORT[BCD]\s*(?:\|=|&=|\^=|\+=|-=|\*=|\/=|%=|<<=|>>=|=)/.test(loopBody)) return null;

    const init = collectInitialVars(src);
    const state = { boardType, vars: init.vars, floatVars: init.floatVars, regs: {}, pins: {} };
    execStatements(parseStatements(setupBody), state, () => {});

    const loopStmts = parseStatements(loopBody);
    const phases = [];
    const MAX_PHASES = 64;
    const seen = new Set();

    for (let iter = 0; iter < 256 && phases.length < MAX_PHASES; iter++) {
        let emitted = false;
        execStatements(loopStmts, state, (ms) => {
            if (ms <= 0) return;
            phases.push({ durationMs: ms, levels: resolveOutputLevels(state) });
            emitted = true;
        });
        if (!emitted) break;
        const key = JSON.stringify(state.vars) + "|" + JSON.stringify(state.regs) + "|" + JSON.stringify(state.pins);
        if (seen.has(key) && phases.length >= 2) break;
        seen.add(key);
    }

    return phases.length >= 2 ? phases : null;
}

/**
 * Niveau logique d'une broche à l'instant tSec (phases / pulsations du sketch).
 * N'utilise pas liveLevels — adapté à l'oscilloscope et aux courbes idéales.
 */
export function resolveArduinoPinLevelAt(uno, pinLabel, tSec = 0) {
    if (!uno || !pinLabel) return 0;
    const dynamic = computeDynamicPinLevels(uno, tSec);
    if (Object.prototype.hasOwnProperty.call(dynamic, pinLabel)) {
        return dynamic[pinLabel] ? 1 : 0;
    }
    const lv = uno.pinLevels?.[pinLabel];
    if (lv === 1 || lv === "1" || lv === true) return 1;
    if (lv === 0 || lv === "0" || lv === false) return 0;
    return 0;
}

function computeDynamicPinLevels(uno, tSec = 0) {
    const levels = {};
    const pinPhases = uno?.pinPhases;
    if (Array.isArray(pinPhases) && pinPhases.length >= 2) {
        const totalMs = pinPhases.reduce((s, p) => s + (p.durationMs || 0), 0);
        if (totalMs > 0) {
            let rem = (((tSec * 1000) % totalMs) + totalMs) % totalMs;
            for (const ph of pinPhases) {
                const d = ph.durationMs || 0;
                if (rem < d) return { ...(ph.levels || {}) };
                rem -= d;
            }
            return { ...(pinPhases[pinPhases.length - 1].levels || {}) };
        }
    }
    const pinPulses = uno?.pinPulses || {};
    for (const [pin, pulse] of Object.entries(pinPulses)) {
        if (pulse?.highSec > 0 && pulse?.lowSec > 0) {
            const period = pulse.highSec + pulse.lowSec;
            const phase = ((tSec % period) + period) % period;
            levels[pin] = phase < pulse.highSec ? 1 : 0;
        }
    }
    return levels;
}

function parseLoopPhases(loopBody, boardType = "arduino_uno") {
    const phases = [];
    let current = {};
    let hadWrite = false;
    const re =
        /digitalWrite\s*\(\s*([^,)]+)\s*,\s*(HIGH|LOW|1|0)\s*\)|delay\s*\(\s*(\d+)\s*\)/gi;
    let m;
    while ((m = re.exec(loopBody)) !== null) {
        if (/digitalWrite/i.test(m[0])) {
            const pin = resolvePinToken(m[1], boardType);
            const label = pinLabel(pin, boardType);
            if (!label) continue;
            current[label] = /HIGH|1/i.test(m[2]) ? 1 : 0;
            hadWrite = true;
            continue;
        }
        const delayMs = parseInt(m[3], 10);
        if (hadWrite && delayMs > 0) {
            phases.push({ durationMs: delayMs, levels: { ...current } });
        }
        hadWrite = false;
    }
    return phases;
}

/** Deux phases ou plus sur une seule broche → pulsation carrée (clignotement). */
function singlePinPulseFromPhases(phases) {
    const pins = new Set();
    for (const ph of phases) {
        for (const label of Object.keys(ph.levels || {})) pins.add(label);
    }
    if (pins.size !== 1) return null;
    const label = [...pins][0];
    let highMs = 0;
    let lowMs = 0;
    for (const ph of phases) {
        if (ph.levels?.[label]) highMs += ph.durationMs || 0;
        else lowMs += ph.durationMs || 0;
    }
    if (highMs <= 0 || lowMs <= 0) return null;
    return { label, pulse: { highSec: highMs / 1000, lowSec: lowMs / 1000 } };
}

/**
 * Niveaux GPIO D0–D13 à l'instant tSec (phases loop, pulsations ou statique).
 * @returns {Record<string, number>}
 */
export function resolvePinLevelsAt(uno, tSec = 0) {
    if (uno && uno.liveLevels) return { ...uno.liveLevels };
    const dynamic = computeDynamicPinLevels(uno, tSec);
    const hasDynamic = Object.keys(dynamic).length > 0;
    if (uno?.type === "esp32_c3") {
        const out = { ...(uno?.pinLevels || {}) };
        if (hasDynamic) {
            for (const [k, v] of Object.entries(dynamic)) out[k] = v;
        }
        return out;
    }
    const base =
        uno?.avrRegisters ||
        buildAvrRegistersFromParsed(
            {
                pinModes: uno?.pinModes,
                pinLevels: uno?.pinLevels,
                pinPulses: uno?.pinPulses,
                pinPhases: uno?.pinPhases,
            },
            uno?.sketch || ""
        );
    if (!hasDynamic) return registersToPinLevels(base);
    return registersToPinLevels(applyDynamicLevelsToRegisters(base, dynamic));
}

export function arduinoGpioIsTimeVarying(uno) {
    if (!uno || (uno.type !== "arduino_uno" && uno.type !== "esp32_c3")) return false;
    if (Array.isArray(uno.pinPhases) && uno.pinPhases.length >= 2) return true;
    return !!(uno.pinPulses && Object.keys(uno.pinPulses).length > 0);
}

/**
 * @returns {{ pinModes: Record<string, string>, pinLevels: Record<string, number>, pinPulses: Record<string, { highSec: number, lowSec: number }>, pinPhases: Array<{ durationMs: number, levels: Record<string, number> }> }}
 */
export function parseArduinoSketch(sketch, boardType = "arduino_uno") {
    const src = stripComments(sketch);
    const pinModes = {};
    const pinLevels = {};
    const pinPulses = {};
    let pinPhases = [];
    const pinNum = (token) => resolvePinToken(token, boardType);
    const labelOf = (pin) => pinLabel(pin, boardType);

    for (const m of src.matchAll(/pinMode\s*\(\s*([^,)]+)\s*,\s*(OUTPUT|INPUT_PULLUP|INPUT)\s*\)/gi)) {
        const pin = pinNum(m[1]);
        const label = labelOf(pin);
        if (!label) continue;
        const mode = String(m[2]).toUpperCase();
        if (mode === "INPUT_PULLUP") pinModes[label] = "INPUT_PULLUP";
        else if (/INPUT/i.test(mode)) pinModes[label] = "INPUT";
        else pinModes[label] = "OUTPUT";
    }

    const loopBody = extractLoopBody(src);
    const writes = [];
    const writeRe = /digitalWrite\s*\(\s*([^,)]+)\s*,\s*(HIGH|LOW|1|0)\s*\)/gi;
    for (const m of loopBody.matchAll(writeRe)) {
        const pin = pinNum(m[1]);
        const label = labelOf(pin);
        if (!label) continue;
        writes.push({ label, level: /HIGH|1/i.test(m[2]) });
    }

    const loopPhases = parseLoopPhases(loopBody, boardType);
    let blinkApplied = false;

    if (loopPhases.length >= 2) {
        const singlePulse = singlePinPulseFromPhases(loopPhases);
        if (singlePulse) {
            pinModes[singlePulse.label] = "OUTPUT";
            pinPulses[singlePulse.label] = singlePulse.pulse;
            delete pinLevels[singlePulse.label];
            blinkApplied = true;
        } else {
            pinPhases = loopPhases;
            for (const ph of pinPhases) {
                for (const label of Object.keys(ph.levels || {})) {
                    pinModes[label] = "OUTPUT";
                    delete pinLevels[label];
                    delete pinPulses[label];
                }
            }
        }
    } else {
        const stepRe =
            /digitalWrite\s*\(\s*([^,)]+)\s*,\s*(HIGH|LOW|1|0)\s*\)\s*;\s*delay\s*\(\s*(\d+)\s*\)/gi;
        const steps = [];
        let match;
        while ((match = stepRe.exec(loopBody)) !== null) {
            const pin = pinNum(match[1]);
            const label = labelOf(pin);
            if (!label) continue;
            steps.push({
                label,
                level: /HIGH|1/i.test(match[2]),
                delayMs: parseInt(match[3], 10),
            });
        }

        if (steps.length >= 2) {
            const labels = [...new Set(steps.map((s) => s.label))];
            if (labels.length === 1) {
                const label = labels[0];
                let highMs = 0;
                let lowMs = 0;
                for (const s of steps) {
                    if (s.level) highMs += s.delayMs;
                    else lowMs += s.delayMs;
                }
                if (highMs > 0 && lowMs > 0) {
                    pinModes[label] = "OUTPUT";
                    pinPulses[label] = { highSec: highMs / 1000, lowSec: lowMs / 1000 };
                    delete pinLevels[label];
                    blinkApplied = true;
                }
            }
        }

        if (!blinkApplied && loopPhases.length === 1) {
            for (const [label, level] of Object.entries(loopPhases[0].levels || {})) {
                pinModes[label] = "OUTPUT";
                pinLevels[label] = level ? 1 : 0;
                delete pinPulses[label];
            }
        } else if (!blinkApplied && writes.length > 0) {
            const lastByPin = {};
            for (const w of writes) lastByPin[w.label] = w.level;
            for (const [label, level] of Object.entries(lastByPin)) {
                pinModes[label] = "OUTPUT";
                pinLevels[label] = level ? 1 : 0;
                delete pinPulses[label];
            }
        }
    }

    if (pinPhases.length < 2) {
        const regPhases = interpretRegisterPhases(src, boardType);
        if (regPhases && regPhases.length >= 2) {
            pinPhases = regPhases;
            for (const ph of pinPhases) {
                for (const label of Object.keys(ph.levels || {})) {
                    pinModes[label] = "OUTPUT";
                    delete pinLevels[label];
                    delete pinPulses[label];
                }
            }
        }
    }

    for (const label of Object.keys(pinModes)) {
        if (pinModes[label] !== "OUTPUT") {
            delete pinLevels[label];
            delete pinPulses[label];
            continue;
        }
        if (pinLevels[label] === undefined && !pinPulses[label] && pinPhases.length < 2) {
            pinLevels[label] = 0;
        }
    }

    if (/\bSerial\.begin\s*\(/i.test(src)) {
        if (boardType === "esp32_c3") {
            pinModes.GPIO21 = "OUTPUT";
            pinLevels.GPIO21 = 1;
            if (!pinModes.GPIO20) pinModes.GPIO20 = "INPUT_PULLUP";
        } else {
            pinModes.D1 = "OUTPUT";
            pinLevels.D1 = 1;
            if (!pinModes.D0) pinModes.D0 = "INPUT_PULLUP";
        }
    }

    if (boardType === "esp32_c3") {
        const execState = interpretRegisterState(src, boardType);
        if (execState && pinPhases.length < 2) {
            const levels = resolveOutputLevels({
                boardType,
                regs: execState.regs,
                pins: {},
            });
            for (const [label, lv] of Object.entries(levels)) {
                pinModes[label] = "OUTPUT";
                pinLevels[label] = lv ? 1 : 0;
                delete pinPulses[label];
            }
        }
        return {
            pinModes,
            pinLevels,
            pinPulses,
            pinPhases,
            avrRegisters: execState?.regs ? { ...execState.regs } : null,
            usesLiveInput: sketchUsesLiveInput(sketch),
        };
    }

    const avrRegisters = buildAvrRegistersFromParsed(
        { pinModes, pinLevels, pinPulses, pinPhases },
        sketch
    );

    // L'interpréteur résout les variables/expressions (PORTD = x, PORTD = x << 1…)
    // que l'analyse statique ne peut pas évaluer. On écrase les registres touchés.
    // Ne pas écraser les registres si des phases temporelles existent (sinon bargraph figé).
    const execState = interpretRegisterState(src, boardType);
    if (execState && pinPhases.length < 2) {
        for (const reg of execState.assigned) {
            avrRegisters[reg] = (execState.regs[reg] || 0) & 0xff;
        }
    }

    const syncedModes = registersToPinModes(avrRegisters);
    const syncedLevels = registersToPinLevels(avrRegisters);
    for (const label of Object.keys(syncedModes)) {
        if (syncedModes[label] !== "OUTPUT") {
            delete syncedLevels[label];
            continue;
        }
        if (pinPulses[label] || (pinPhases.length >= 2 && pinPhases.some((ph) => label in (ph.levels || {})))) {
            delete syncedLevels[label];
        }
    }

    return {
        pinModes: syncedModes,
        pinLevels: syncedLevels,
        pinPulses,
        pinPhases,
        avrRegisters,
        usesLiveInput: sketchUsesLiveInput(sketch),
    };
}

export function applyArduinoSketchToComponent(comp) {
    if (!comp || (comp.type !== "arduino_uno" && comp.type !== "esp32_c3")) return;
    const parsed = parseArduinoSketch(comp.sketch || "", comp.type);
    comp.pinModes = parsed.pinModes;
    comp.pinLevels = parsed.pinLevels;
    comp.pinPulses = parsed.pinPulses;
    comp.pinPhases = parsed.pinPhases || [];
    comp.avrRegisters = parsed.avrRegisters;
    comp.usesLiveInput = parsed.usesLiveInput;
}

export function arduinoUnoMinPulsePeriodSec(components) {
    let min = Infinity;
    for (const c of components) {
        if (c.type !== "arduino_uno" && c.type !== "esp32_c3") continue;
        if (Array.isArray(c.pinPhases) && c.pinPhases.length >= 2) {
            for (const ph of c.pinPhases) {
                const d = (ph.durationMs || 0) / 1000;
                if (d > 0) min = Math.min(min, d);
            }
        }
        if (!c.pinPulses) continue;
        for (const pulse of Object.values(c.pinPulses)) {
            const period = (pulse.highSec || 0) + (pulse.lowSec || 0);
            if (period > 0) min = Math.min(min, period);
        }
    }
    return Number.isFinite(min) ? min : 0;
}
