/**
 * Interprétation minimale Adafruit_BMP280.h (Grove pression / T° I²C).
 */

function stripComments(src) {
    return String(src || "")
        .replace(/\/\/[^\n]*/g, "")
        .replace(/\/\*[\s\S]*?\*\//g, "");
}

function resolveSketchToken(src, tok) {
    let t = String(tok || "").trim();
    for (let i = 0; i < 8; i++) {
        if (!/^[A-Za-z_]\w*$/.test(t)) break;
        const def = src.match(new RegExp(`#define\\s+${t}\\s+(\\S+)`));
        if (!def) break;
        t = def[1].trim();
    }
    return t;
}

export function sketchUsesBmp280(sketch) {
    const src = stripComments(sketch);
    return (
        /#include\s*[<"]Adafruit_BMP280\.h[>"]/i.test(src) ||
        /\bAdafruit_BMP280\s+\w+/i.test(src)
    );
}

export function sketchLcdUsesBmpReads(sketch) {
    if (!sketchUsesBmp280(sketch)) return false;
    const src = stripComments(sketch);
    return /\.read(Pressure|Temperature|Altitude)\s*\(/i.test(src);
}

/**
 * @param {string} sketch
 * @returns {{ varName: string, i2cAddress: number } | null}
 */
export function parseBmp280FromSketch(sketch) {
    const src = stripComments(sketch);
    if (!sketchUsesBmp280(src)) return null;

    const ctor =
        src.match(/\bAdafruit_BMP280\s+(\w+)\s*=\s*Adafruit_BMP280\s*\(\s*\)/i) ||
        src.match(/\bAdafruit_BMP280\s+(\w+)\s*;/i);
    const varName = ctor?.[1] ?? "bmp";

    let i2cAddress = 0x76;
    const addrDef = src.match(/#define\s+BMP280_ADDRESS\s+(0x[0-9a-f]+|\d+)/i);
    if (addrDef) {
        i2cAddress = parseInt(addrDef[1], /^0x/i.test(addrDef[1]) ? 16 : 10);
    }
    const beginCall = src.match(
        new RegExp(`\\b${varName}\\.begin\\s*\\(\\s*(0x[0-9a-f]+|\\d+|\\w+)\\s*\\)`, "i")
    );
    if (beginCall) {
        const tok = resolveSketchToken(src, beginCall[1]);
        if (/^0x[0-9a-f]+$/i.test(tok) || /^\d+$/.test(tok)) {
            i2cAddress = parseInt(tok, /^0x/i.test(tok) ? 16 : 10);
        }
    }

    return { varName, i2cAddress };
}

/** Altitude barométrique (formule Adafruit, seaLevel en hPa). */
export function pressureToAltitude(seaLevelHpa, pressurePa) {
    const sea = Number(seaLevelHpa);
    const p = Number(pressurePa);
    if (!Number.isFinite(sea) || !Number.isFinite(p) || sea <= 0 || p <= 0) return 0;
    return 44330.0 * (1.0 - (p / (sea * 100.0)) ** 0.1903);
}

/** Variables locales assignées depuis readTemperature / readPressure / readAltitude (affichage en hPa). */
export function buildBmpVarBindingsFromBody(body, bmpVarName, temperature, pressureHpa, seaLevelHpa = 1013.25) {
    const bindings = {};
    const hpa = Number.isFinite(pressureHpa) ? pressureHpa : 1013.25;
    const pressurePa = hpa * 100;
    const tempStr = String(Math.round(temperature * 10) / 10);
    const pressStr = String(Math.round(hpa * 10) / 10);

    const tempRe = new RegExp(
        `(?:float|double)\\s+(\\w+)\\s*=\\s*${bmpVarName}\\.readTemperature\\s*\\(\\s*\\)\\s*;`,
        "gi"
    );
    const pressRe = new RegExp(
        `(?:float|double)\\s+(\\w+)\\s*=\\s*${bmpVarName}\\.readPressure\\s*\\(\\s*\\)\\s*;`,
        "gi"
    );
    const pressDivRe = new RegExp(
        `(?:float|double)\\s+(\\w+)\\s*=\\s*${bmpVarName}\\.readPressure\\s*\\(\\s*\\)\\s*/\\s*100(?:\\.0+)?\\s*;`,
        "gi"
    );
    const altRe = new RegExp(
        `(?:float|double)\\s+(\\w+)\\s*=\\s*${bmpVarName}\\.readAltitude\\s*\\([^)]*\\)\\s*;`,
        "gi"
    );

    let m;
    while ((m = tempRe.exec(body)) !== null) bindings[m[1]] = tempStr;
    while ((m = pressRe.exec(body)) !== null) bindings[m[1]] = pressStr;
    while ((m = pressDivRe.exec(body)) !== null) bindings[m[1]] = pressStr;
    while ((m = altRe.exec(body)) !== null) {
        const seaM = m[0].match(/readAltitude\s*\(\s*([^)]*)\s*\)/i);
        let sea = seaLevelHpa;
        if (seaM?.[1]?.trim()) {
            const n = parseFloat(seaM[1]);
            if (Number.isFinite(n)) sea = n;
        }
        bindings[m[1]] = String(Math.round(pressureToAltitude(sea, pressurePa) * 10) / 10);
    }

    return bindings;
}
