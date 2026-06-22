/**
 * Interprétation minimale Adafruit_TSL2591.h (Grove luminosité I²C).
 */

function stripComments(src) {
    return String(src || "")
        .replace(/\/\/[^\n]*/g, "")
        .replace(/\/\*[\s\S]*?\*\//g, "");
}

export function sketchUsesTsl2591(sketch) {
    const src = stripComments(sketch);
    return (
        /#include\s*[<"]Adafruit_TSL2591\.h[>"]/i.test(src) ||
        /\bAdafruit_TSL2591\s+\w+/i.test(src)
    );
}

/** Sketch avec lcd.print / tft.print contenant calculateLux ou getFullLuminosity. */
export function sketchLcdUsesTslReads(sketch) {
    if (!sketchUsesTsl2591(sketch)) return false;
    const src = stripComments(sketch);
    return /\.calculateLux\s*\(|\.getFullLuminosity\s*\(\s*\)/i.test(src);
}

/**
 * @param {string} sketch
 * @returns {{ varName: string, i2cAddress: number } | null}
 */
export function parseTsl2591FromSketch(sketch) {
    const src = stripComments(sketch);
    if (!sketchUsesTsl2591(src)) return null;

    const ctor =
        src.match(/\bAdafruit_TSL2591\s+(\w+)\s*=\s*Adafruit_TSL2591\s*\(\s*(\d+)\s*\)/i) ||
        src.match(/\bAdafruit_TSL2591\s+(\w+)\s*\(\s*(\d+)\s*\)/i);
    const varName = ctor?.[1] ?? "tsl";

    let i2cAddress = 0x29;
    const addrDef = src.match(/#define\s+TSL2591_ADDR\s+(0x[0-9a-f]+|\d+)/i);
    if (addrDef) {
        i2cAddress = parseInt(addrDef[1], /^0x/i.test(addrDef[1]) ? 16 : 10);
    }
    const setAddr = src.match(new RegExp(`\\b${varName}\\.setAddress\\s*\\(\\s*(0x[0-9a-f]+|\\d+)\\s*\\)`, "i"));
    if (setAddr) {
        i2cAddress = parseInt(setAddr[1], /^0x/i.test(setAddr[1]) ? 16 : 10);
    }

    return { varName, i2cAddress };
}

/** Canaux bruts dérivés d'une luminosité simulée (lux). */
export function luxToRawChannels(lux) {
    const l = Math.max(0, Number(lux) || 0);
    const full = Math.min(65535, Math.round(l * 100));
    const ir = Math.min(65535, Math.round(full * 0.12));
    return { lux: l, full, ir };
}

/** Variables locales assignées depuis getFullLuminosity / calculateLux. */
export function buildTslVarBindingsFromBody(body, tslVarName, lux, full, ir) {
    const bindings = {};
    const { full: f, ir: i } = luxToRawChannels(lux);
    const fullVal = Number.isFinite(full) ? full : f;
    const irVal = Number.isFinite(ir) ? ir : i;
    const luxVal = Number.isFinite(lux) ? lux : f / 100;
    const luxStr = String(Math.round(luxVal * 10) / 10);
    const lumStr = String(((Math.round(fullVal) & 0xffff) << 16) | (Math.round(irVal) & 0xffff));
    const fullStr = String(Math.round(fullVal));
    const irStr = String(Math.round(irVal));

    const lumRe = new RegExp(
        `(?:uint32_t|unsigned\\s+long|long)\\s+(\\w+)\\s*=\\s*${tslVarName}\\.getFullLuminosity\\s*\\(\\s*\\)\\s*;`,
        "gi"
    );
    const fullRe = new RegExp(
        `(?:uint16_t|unsigned\\s+int|int)\\s+(\\w+)\\s*=\\s*\\w+\\s*>>\\s*16\\s*;`,
        "gi"
    );
    const irRe = new RegExp(
        `(?:uint16_t|unsigned\\s+int|int)\\s+(\\w+)\\s*=\\s*\\w+\\s*&\\s*0xFFFF\\s*;`,
        "gi"
    );
    const luxRe = new RegExp(
        `(?:float|double)\\s+(\\w+)\\s*=\\s*${tslVarName}\\.calculateLux\\s*\\([^)]*\\)\\s*;`,
        "gi"
    );

    let m;
    while ((m = lumRe.exec(body)) !== null) bindings[m[1]] = lumStr;
    while ((m = luxRe.exec(body)) !== null) bindings[m[1]] = luxStr;

    if (body.includes(`${tslVarName}.getFullLuminosity()`)) {
        while ((m = fullRe.exec(body)) !== null) bindings[m[1]] = fullStr;
        while ((m = irRe.exec(body)) !== null) bindings[m[1]] = irStr;
    }

    return bindings;
}
