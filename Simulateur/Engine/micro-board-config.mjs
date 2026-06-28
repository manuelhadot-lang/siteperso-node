/**
 * Profils cartes microcontrôleur (UNO, ESP32-C3, ESP32 DevKit) — broches I²C, alim, logique.
 */

export const MICRO_BOARD_TYPES = new Set(["arduino_uno", "esp32_c3", "esp32_devkit"]);

export function isMicroBoardType(t) {
    return MICRO_BOARD_TYPES.has(t);
}

export function isEsp32BoardType(t) {
    return t === "esp32_c3" || t === "esp32_devkit";
}

const UNO_PROFILE = {
    type: "arduino_uno",
    logicVolts: 5,
    logicThreshold: 2.5,
    i2c: { sda: { name: "A4", idx: 11 }, scl: { name: "A5", idx: 12 } },
    vccPins: ["5V", "3V3"],
    gndPins: ["GND", "GND2"],
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

const ESP32_DEVKIT_PROFILE = {
    type: "esp32_devkit",
    logicVolts: 3.3,
    logicThreshold: 1.65,
    i2c: { sda: { name: "GPIO21", idx: 22 }, scl: { name: "GPIO22", idx: 19 } },
    vccPins: ["5V", "3V3"],
    gndPins: ["GND", "GND2"],
    bcdPinPrefix: "GPIO",
    bcdPinMax: 3,
    lcdHint: ["SDA->GPIO21", "SCL GPIO22 3V3"],
    adcVref: 3.3,
    analogPinLabels: () => ["GPIO32", "GPIO33", "GPIO34", "GPIO35", "GPIO36", "GPIO39"],
};

export function boardProfile(type) {
    if (type === "esp32_c3") return ESP32_C3_PROFILE;
    if (type === "esp32_devkit") return ESP32_DEVKIT_PROFILE;
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
    if (boardType === "esp32_devkit") {
        return {
            PORTD: ["GPIO0", "GPIO1", "GPIO2", "GPIO3", "GPIO4", "GPIO5", "GPIO6", "GPIO7"],
            PORTB: ["GPIO8", "GPIO9", "GPIO10", "GPIO11", "GPIO12", "GPIO13", "GPIO14", "GPIO15"],
            PORTC: ["GPIO16", "GPIO17", "GPIO18", "GPIO19", "GPIO20", "GPIO21", "GPIO22", "GPIO23"],
        };
    }
    return {
        PORTD: ["D0", "D1", "D2", "D3", "D4", "D5", "D6", "D7"],
        PORTB: ["D8", "D9", "D10", "D11", "D12", "D13"],
        PORTC: ["A0", "A1", "A2", "A3", "A4", "A5"],
    };
}

const ESP32_DEVKIT_GPIO_NUMS = [
    0, 1, 2, 3, 4, 5, 6, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 21, 22, 23, 25, 26, 27, 32, 33, 34, 35, 36, 39,
];

/** Broches DATA DHT22 : D0–D13 (UNO) ou GPIO* (ESP32). */
export function dataPinLabelsForBoard(boardType) {
    if (boardType === "esp32_c3") {
        return [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 20, 21].map((n) => `GPIO${n}`);
    }
    if (boardType === "esp32_devkit") {
        return ESP32_DEVKIT_GPIO_NUMS.map((n) => `GPIO${n}`);
    }
    const out = [];
    for (let i = 0; i <= 13; i++) out.push(`D${i}`);
    return out;
}

export function bcdInputJonctionRegex(boardLabel, boardType) {
    if (isEsp32BoardType(boardType)) {
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
    if (boardType === "esp32_devkit") {
        return ESP32_DEVKIT_GPIO_NUMS.map((n) => `GPIO${n}`);
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
    if (boardType === "esp32_devkit") {
        return { SCL: "GPIO18", SDA: "GPIO23", CS: "GPIO5", DC: "GPIO16", RES: "GPIO17" };
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
    if (isEsp32BoardType(boardType)) {
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

/** Numéros GPIO valides pour pinLabel / resolvePinToken. */
export function esp32GpioNumbersForBoard(boardType) {
    if (boardType === "esp32_c3") return [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 20, 21];
    if (boardType === "esp32_devkit") return ESP32_DEVKIT_GPIO_NUMS;
    return [];
}

export function esp32LedBuiltinPin(boardType) {
    if (boardType === "esp32_c3") return 8;
    if (boardType === "esp32_devkit") return 2;
    return null;
}
