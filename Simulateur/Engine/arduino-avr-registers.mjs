/**
 * Registres GPIO ATmega328P — DDRx / PORTx (Arduino UNO).
 * Port D : D0–D7 | Port B : D8–D13 | Port C : A0–A5 (D14–D19).
 */

export const AVR_GPIO_PORTS = ["B", "C", "D"];

/** @typedef {{ DDRB: number, DDRC: number, DDRD: number, PORTB: number, PORTC: number, PORTD: number }} AvrRegisters */

export function createEmptyAvrRegisters() {
    return { DDRB: 0, DDRC: 0, DDRD: 0, PORTB: 0, PORTC: 0, PORTD: 0 };
}

export function cloneAvrRegisters(reg) {
    return { ...createEmptyAvrRegisters(), ...(reg || {}) };
}

/** Broches GPIO câblables (D0–D13, A0–A5). */
export function allArduinoGpioLabels() {
    const labels = [];
    for (let i = 0; i <= 13; i++) labels.push(`D${i}`);
    for (let i = 0; i <= 5; i++) labels.push(`A${i}`);
    return labels;
}

/**
 * @param {number|string} pin — 0–13, 14–19, Dn, An, A0…
 * @returns {{ port: 'B'|'C'|'D', bit: number, label: string }|null}
 */
export function arduinoPinToPortBit(pin) {
    if (typeof pin === "string") {
        const a = pin.match(/^A(\d)$/i);
        if (a) {
            const bit = parseInt(a[1], 10);
            if (bit >= 0 && bit <= 5) return { port: "C", bit, label: `A${bit}` };
            return null;
        }
        const d = pin.match(/^D?(\d+)$/i);
        if (d) return arduinoPinToPortBit(parseInt(d[1], 10));
        return null;
    }
    const n = pin;
    if (n >= 0 && n <= 7) return { port: "D", bit: n, label: `D${n}` };
    if (n >= 8 && n <= 13) return { port: "B", bit: n - 8, label: `D${n}` };
    if (n >= 14 && n <= 19) return { port: "C", bit: n - 14, label: `A${n - 14}` };
    return null;
}

export function labelToPortBit(label) {
    return arduinoPinToPortBit(String(label || ""));
}

export function isPinOutput(reg, label) {
    const pb = labelToPortBit(label);
    if (!pb || !reg) return false;
    return ((reg[`DDR${pb.port}`] || 0) >> pb.bit) & 1;
}

export function isPinInputPullup(reg, label) {
    const pb = labelToPortBit(label);
    if (!pb || !reg) return false;
    if (isPinOutput(reg, label)) return false;
    return ((reg[`PORT${pb.port}`] || 0) >> pb.bit) & 1;
}

export function getPinPortLevel(reg, label) {
    const pb = labelToPortBit(label);
    if (!pb || !reg) return 0;
    return ((reg[`PORT${pb.port}`] || 0) >> pb.bit) & 1;
}

/** @param {'OUTPUT'|'INPUT'|'INPUT_PULLUP'} mode */
export function applyPinModeToRegisters(reg, label, mode) {
    const pb = labelToPortBit(label);
    if (!pb || !reg) return;
    const ddrKey = `DDR${pb.port}`;
    const portKey = `PORT${pb.port}`;
    const mask = 1 << pb.bit;
    if (mode === "OUTPUT") {
        reg[ddrKey] = (reg[ddrKey] | mask) & 0xff;
    } else if (mode === "INPUT_PULLUP") {
        reg[ddrKey] = reg[ddrKey] & ~mask & 0xff;
        reg[portKey] = (reg[portKey] | mask) & 0xff;
    } else {
        reg[ddrKey] = reg[ddrKey] & ~mask & 0xff;
        reg[portKey] = reg[portKey] & ~mask & 0xff;
    }
}

export function applyDigitalWriteToRegisters(reg, label, high) {
    const pb = labelToPortBit(label);
    if (!pb || !reg) return;
    applyPinModeToRegisters(reg, label, "OUTPUT");
    const portKey = `PORT${pb.port}`;
    const mask = 1 << pb.bit;
    if (high) reg[portKey] = (reg[portKey] | mask) & 0xff;
    else reg[portKey] = reg[portKey] & ~mask & 0xff;
}

export function registersToPinModes(reg) {
    const modes = {};
    for (const label of allArduinoGpioLabels()) {
        if (isPinOutput(reg, label)) modes[label] = "OUTPUT";
        else if (isPinInputPullup(reg, label)) modes[label] = "INPUT_PULLUP";
        else modes[label] = "INPUT";
    }
    return modes;
}

export function registersToPinLevels(reg) {
    const levels = {};
    for (const label of allArduinoGpioLabels()) {
        if (isPinOutput(reg, label)) levels[label] = getPinPortLevel(reg, label);
    }
    return levels;
}

export function formatRegByte(n) {
    const v = (Number(n) || 0) & 0xff;
    return `0x${v.toString(16).toUpperCase().padStart(2, "0")}`;
}

export function formatAvrRegistersSummary(reg) {
    if (!reg) return "";
    return `DDRB${formatRegByte(reg.DDRB)} PORTB${formatRegByte(reg.PORTB)}  DDRC${formatRegByte(reg.DDRC)} PORTC${formatRegByte(reg.PORTC)}  DDRD${formatRegByte(reg.DDRD)} PORTD${formatRegByte(reg.PORTD)}`;
}

function resolveAvrBitToken(token, port) {
    const t = String(token || "").trim();
    const num = t.match(/^(\d+)$/);
    if (num) {
        const b = parseInt(num[1], 10);
        return b >= 0 && b <= 7 ? b : null;
    }
    const px = t.match(/^P([BCD])(\d)$/i);
    if (px && px[1].toUpperCase() === port) return parseInt(px[2], 10);
    const ddx = t.match(/^DD([BCD])(\d)$/i);
    if (ddx && ddx[1].toUpperCase() === port) return parseInt(ddx[2], 10);
    return null;
}

function evalAvrMaskExpr(expr, port) {
    const s = String(expr || "").trim();
    if (!s) return null;
    if (/^0[xX][0-9a-fA-F]+$/.test(s)) return parseInt(s, 16) & 0xff;
    if (/^0[bB][01]+$/.test(s)) return parseInt(s.slice(2), 2) & 0xff;
    if (/^B[01]+$/i.test(s)) return parseInt(s.slice(1), 2) & 0xff;
    if (/^\d+$/.test(s)) return parseInt(s, 10) & 0xff;

    const invert = /^\~\s*(.+)$/.test(s) ? true : false;
    const inner = invert ? s.replace(/^\~\s*/, "").trim() : s;

    let mask = 0;
    const shiftRe = /(?:\(\s*)?1\s*<<\s*([^)\s,|&]+)(?:\s*\))?/gi;
    let sm;
    while ((sm = shiftRe.exec(inner)) !== null) {
        const bit = resolveAvrBitToken(sm[1], port);
        if (bit == null) return null;
        mask |= 1 << bit;
    }
    if (mask) return (invert ? ~mask : mask) & 0xff;

    const bv = inner.match(/_BV\s*\(\s*P([BCD])(\d)\s*\)/i);
    if (bv && bv[1].toUpperCase() === port) {
        const v = (1 << parseInt(bv[2], 10)) & 0xff;
        return invert ? (~v & 0xff) : v;
    }

    return null;
}

function avrRegPortFromName(regName) {
    const m = String(regName || "").match(/^(?:DDR|PORT)([BCD])$/i);
    return m?.[1]?.toUpperCase() || null;
}

function applyRegOp(reg, regName, op, value) {
    const port = avrRegPortFromName(regName);
    if (!port || !AVR_GPIO_PORTS.includes(port)) return;
    const cur = reg[regName] & 0xff;
    const v = value & 0xff;
    if (op === "=") reg[regName] = v;
    else if (op === "|=") reg[regName] = (cur | v) & 0xff;
    else if (op === "&=") reg[regName] = (cur & v) & 0xff;
    else if (op === "^=") reg[regName] = (cur ^ v) & 0xff;
}

/** Parse écritures directes DDRx / PORTx dans le sketch (AVR). */
export function parseAvrRegisterWrites(sketch) {
    const reg = createEmptyAvrRegisters();
    const src = String(sketch || "");
    const re = /\b(DDR[BCD]|PORT[BCD])\s*(\|=|\&=|\^=|=)\s*([^;]+)/gi;
    let m;
    while ((m = re.exec(src)) !== null) {
        const regName = m[1].toUpperCase();
        const port = avrRegPortFromName(regName);
        if (!port) continue;
        const mask = evalAvrMaskExpr(m[3], port);
        if (mask == null) continue;
        applyRegOp(reg, regName, m[2], mask);
    }
    return reg;
}

/**
 * Fusionne pinModes / pinLevels / phases dans les registres AVR.
 * @param {object} parsed — sortie parseArduinoSketch (sans avr)
 */
export function buildAvrRegistersFromParsed(parsed, sketch) {
    const reg = parseAvrRegisterWrites(sketch);

    for (const [label, mode] of Object.entries(parsed?.pinModes || {})) {
        if (mode === "OUTPUT" || mode === "INPUT" || mode === "INPUT_PULLUP") {
            applyPinModeToRegisters(reg, label, mode);
        }
    }

    for (const [label, level] of Object.entries(parsed?.pinLevels || {})) {
        applyDigitalWriteToRegisters(reg, label, !!level);
    }

    return reg;
}

/** Applique niveaux dynamiques (phase / pulse) sur une copie PORT sans toucher DDR. */
export function applyDynamicLevelsToRegisters(reg, levels) {
    const out = cloneAvrRegisters(reg);
    for (const [label, level] of Object.entries(levels || {})) {
        if (!isPinOutput(out, label) && level !== undefined) {
            applyPinModeToRegisters(out, label, "OUTPUT");
        }
        if (isPinOutput(out, label)) {
            applyDigitalWriteToRegisters(out, label, !!level);
        }
    }
    return out;
}
