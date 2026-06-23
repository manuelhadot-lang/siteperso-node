/**
 * Profils cartes microcontrôleur (UNO, ESP32-C3) — broches I²C, alim, logique.
 */

export const MICRO_BOARD_TYPES = new Set(["arduino_uno", "esp32_c3"]);

export function isMicroBoardType(t) {
    return MICRO_BOARD_TYPES.has(t);
}

const UNO_PROFILE = {
    type: "arduino_uno",
    logicVolts: 5,
    logicThreshold: 2.5,
    i2c: { sda: { name: "A4", idx: 11 }, scl: { name: "A5", idx: 12 } },
    vccPins: ["5V", "3V3"],
    gndPins: ["GND", "GND2"],
    /** Entrées BCD CD4511 : D0–D3 par défaut. */
    bcdPinPrefix: "D",
    bcdPinMax: 3,
    lcdHint: ["SDA->A4 SCL->", "A5  5V  GND"],
    adcVref: 5,
    analogPinLabels: () => ["A0", "A1", "A2", "A3", "A4", "A5"],
};

const ESP32_C3_PROFILE = {
    type: "esp32_c3",
    logicVolts: 3.3,
    logicThreshold: 1.65,
    i2c: { sda: { name: "GPIO8", idx: 12 }, scl: { name: "GPIO9", idx: 13 } },
    vccPins: ["5V", "3V3"],
    gndPins: ["GND", "GND2"],
    bcdPinPrefix: "GPIO",
    bcdPinMax: 3,
    lcdHint: ["SDA->GPIO8", "SCL GPIO9 3V3"],
    adcVref: 3.3,
    analogPinLabels: () => ["GPIO0", "GPIO1", "GPIO2", "GPIO3", "GPIO4"],
};

export function boardProfile(type) {
    if (type === "esp32_c3") return ESP32_C3_PROFILE;
    return UNO_PROFILE;
}

/** Mapping PORTD bits → libellés GPIO (ESP32) ou D* (UNO). */
export function portRegisterLabels(boardType) {
    if (boardType === "esp32_c3") {
        return {
            PORTD: ["GPIO0", "GPIO1", "GPIO2", "GPIO3", "GPIO4", "GPIO5", "GPIO6", "GPIO7"],
            PORTB: ["GPIO8", "GPIO9", "GPIO10"],
            PORTC: [],
        };
    }
    return {
        PORTD: ["D0", "D1", "D2", "D3", "D4", "D5", "D6", "D7"],
        PORTB: ["D8", "D9", "D10", "D11", "D12", "D13"],
        PORTC: ["A0", "A1", "A2", "A3", "A4", "A5"],
    };
}

/** Broches DATA DHT22 : D0–D13 (UNO) ou GPIO* (ESP32). */
export function dataPinLabelsForBoard(boardType) {
    if (boardType === "esp32_c3") {
        return [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 20, 21].map((n) => `GPIO${n}`);
    }
    const out = [];
    for (let i = 0; i <= 13; i++) out.push(`D${i}`);
    return out;
}

export function bcdInputJonctionRegex(boardLabel, boardType) {
    if (boardType === "esp32_c3") {
        return new RegExp(`^${boardLabel}_GPIO([0-3])$`);
    }
    return new RegExp(`^${boardLabel}_D([0-3])$`);
}

/** Broches GPIO / digitales câblables (détection SPI souple). */
export function digitalPinsForBoard(boardType) {
    if (boardType === "esp32_c3") {
        return ["GPIO0", "GPIO1", "GPIO2", "GPIO3", "GPIO4", "GPIO5", "GPIO6", "GPIO7",
            "GPIO8", "GPIO9", "GPIO10", "GPIO20", "GPIO21"];
    }
    const out = [];
    for (let i = 0; i <= 13; i++) out.push(`D${i}`);
    return out;
}

/** Broches SPI par défaut pour Joy-it RB-TFT1.8 (câblage type Joy-it). */
export function tft18SpiDefaults(boardType) {
    if (boardType === "esp32_c3") {
        return { SCL: "GPIO8", SDA: "GPIO10", CS: "GPIO6", DC: "GPIO7", RES: "GPIO5" };
    }
    return { SCL: "D13", SDA: "D11", CS: "D10", DC: "D8", RES: "D9" };
}

function stripSketchComments(src) {
    return String(src || "")
        .replace(/\/\/[^\n]*/g, "")
        .replace(/\/\*[\s\S]*?\*\//g, "");
}

function resolveSketchToken(tok, defines) {
    let t = String(tok || "").trim();
    for (let i = 0; i < 8 && defines[t]; i++) {
        t = defines[t].trim();
    }
    return t;
}

function sketchPinToBoardLabel(boardType, tok) {
    const t = String(tok || "").trim();
    if (!t) return null;
    if (boardType === "esp32_c3") {
        const gpio = t.match(/^GPIO(\d+)$/i);
        if (gpio) return `GPIO${gpio[1]}`;
        if (/^\d+$/.test(t)) return `GPIO${t}`;
    }
    const analog = t.match(/^A(\d+)$/i);
    if (analog) return `A${analog[1]}`;
    const digital = t.match(/^D(\d+)$/i);
    if (digital) return `D${digital[1]}`;
    if (/^\d+$/.test(t) && boardType === "arduino_uno") {
        const n = parseInt(t, 10);
        if (n === 18) return "A4";
        if (n === 19) return "A5";
        return `D${n}`;
    }
    return t;
}

/**
 * Broches I²C effectives d'après Wire.begin(…) dans le sketch (sinon profil carte).
 * @returns {{ sda: string, scl: string }}
 */
export function parseSketchI2cPins(sketch, boardType) {
    const prof = boardProfile(boardType);
    const fallback = { sda: prof.i2c.sda.name, scl: prof.i2c.scl.name };
    const src = stripSketchComments(sketch);
    if (!src) return fallback;

    const defines = {};
    for (const m of src.matchAll(/#define\s+(\w+)\s+(\S+)/g)) {
        defines[m[1]] = m[2];
    }

    const wireBegin = src.match(/Wire\.begin\s*\(\s*([^)]*)\s*\)/i);
    if (!wireBegin) return fallback;

    const args = wireBegin[1].trim();
    if (!args) return fallback;

    const parts = args.split(",").map((p) => p.trim()).filter(Boolean);
    if (parts.length < 2) return fallback;

    const sda = sketchPinToBoardLabel(boardType, resolveSketchToken(parts[0], defines));
    const scl = sketchPinToBoardLabel(boardType, resolveSketchToken(parts[1], defines));
    if (!sda || !scl) return fallback;
    return { sda, scl };
}
