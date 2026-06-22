/**
 * Interprétation minimale DHT.h (DHT22 / Grove T° humidité).
 */

function stripComments(src) {
    return String(src || "")
        .replace(/\/\/[^\n]*/g, "")
        .replace(/\/\*[\s\S]*?\*\//g, "");
}

const PIN_MAP_UNO = {
    0: "D0", 1: "D1", 2: "D2", 3: "D3", 4: "D4", 5: "D5", 6: "D6", 7: "D7",
    8: "D8", 9: "D9", 10: "D10", 11: "D11", 12: "D12", 13: "D13",
};

const PIN_MAP_ESP32 = {
    0: "GPIO0", 1: "GPIO1", 2: "GPIO2", 3: "GPIO3", 4: "GPIO4", 5: "GPIO5",
    6: "GPIO6", 7: "GPIO7", 8: "GPIO8", 9: "GPIO9", 10: "GPIO10",
    20: "GPIO20", 21: "GPIO21",
};

function resolvePinToken(tok, boardType = "arduino_uno") {
    const t = String(tok || "").trim();
    if (/^GPIO\s*(\d+)$/i.test(t)) {
        const m = t.match(/^GPIO\s*(\d+)$/i);
        return `GPIO${m[1]}`;
    }
    if (/^D\d+$/i.test(t)) return t.toUpperCase();
    const n = parseInt(t, 10);
    if (Number.isFinite(n)) {
        if (boardType === "esp32_c3") {
            if (PIN_MAP_ESP32[n]) return PIN_MAP_ESP32[n];
        } else if (PIN_MAP_UNO[n]) {
            return PIN_MAP_UNO[n];
        }
    }
    if (/^A(\d+)$/i.test(t)) return t.toUpperCase();
    return null;
}

function resolveSketchToken(src, tok) {
    let t = String(tok || "").trim();
    for (let i = 0; i < 4; i++) {
        if (!/^[A-Za-z_]\w*$/.test(t)) break;
        const def = src.match(new RegExp(`#define\\s+${t}\\s+(\\S+)`));
        if (!def) break;
        t = def[1].trim();
    }
    return t;
}

export function sketchUsesDht(sketch) {
    const src = stripComments(sketch);
    return /#include\s*[<"]DHT\.h[>"]/i.test(src) || /\bDHT\s+\w+\s*\(/i.test(src);
}

/** Sketch avec lcd.print(dht.readTemperature|readHumidity()). */
export function sketchLcdUsesDhtReads(sketch) {
    if (!sketchUsesDht(sketch)) return false;
    const src = stripComments(sketch);
    return /\.read(Temperature|Humidity)\s*\(\s*\)/i.test(src);
}

/**
 * @param {string} sketch
 * @returns {{ varName: string, pinLabel: string | null, sensorType: string, baseTemp: number, baseHum: number } | null}
 */
export function parseDht22FromSketch(sketch, boardType = "arduino_uno") {
    const src = stripComments(sketch);
    if (!sketchUsesDht(src)) return null;

    const ctor = src.match(/\bDHT\s+(\w+)\s*\(\s*([^,)]+)\s*,\s*([^)]+)\s*\)/i);
    const varName = ctor?.[1] ?? "dht";
    const pinRaw = ctor ? resolveSketchToken(src, ctor[2]) : null;
    const pinLabel = pinRaw ? resolvePinToken(pinRaw, boardType) : null;
    const typeRaw = resolveSketchToken(src, String(ctor?.[3] ?? "DHT22").trim());
    const sensorType = /22/.test(typeRaw) ? "DHT22" : "DHT11";

    let baseTemp = 24.0;
    let baseHum = 55.0;
    const tempConst = src.match(new RegExp(`\\b${varName}\\.readTemperature\\s*\\(\\s*\\)[^;]*;`, "i"));
    const humConst = src.match(new RegExp(`\\b${varName}\\.readHumidity\\s*\\(\\s*\\)[^;]*;`, "i"));
    const tempAssign = src.match(/(?:float|double)\s+\w+\s*=\s*(-?\d+(?:\.\d+)?)\s*;/);
    const humAssign = src.match(/(?:float|double)\s+\w+\s*=\s*(-?\d+(?:\.\d+)?)\s*;[\s\S]{0,80}readHumidity/i);
    if (tempAssign) baseTemp = parseFloat(tempAssign[1]);
    if (humAssign) baseHum = parseFloat(humAssign[1]);
    if (tempConst && /=\s*(-?\d+(?:\.\d+)?)/.test(tempConst[0])) {
        const m = tempConst[0].match(/=\s*(-?\d+(?:\.\d+)?)/);
        if (m) baseTemp = parseFloat(m[1]);
    }
    if (humConst && /=\s*(-?\d+(?:\.\d+)?)/.test(humConst[0])) {
        const m = humConst[0].match(/=\s*(-?\d+(?:\.\d+)?)/);
        if (m) baseHum = parseFloat(m[1]);
    }

    return { varName, pinLabel, sensorType, baseTemp, baseHum };
}

/** Variables locales assignées depuis dht.readTemperature() / readHumidity(). */
export function buildDhtVarBindingsFromBody(body, dhtVarName, temperature, humidity) {
    const bindings = {};
    const tempStr = String(Math.round(temperature * 10) / 10);
    const humStr = String(Math.round(humidity));
    const tempRe = new RegExp(
        `(?:float|double|int|unsigned\\s+int)?\\s*(\\w+)\\s*=\\s*${dhtVarName}\\.readTemperature\\s*\\(\\s*\\)\\s*;`,
        "gi"
    );
    const humRe = new RegExp(
        `(?:float|double|int|unsigned\\s+int)?\\s*(\\w+)\\s*=\\s*${dhtVarName}\\.readHumidity\\s*\\(\\s*\\)\\s*;`,
        "gi"
    );
    let m;
    while ((m = tempRe.exec(body)) !== null) bindings[m[1]] = tempStr;
    while ((m = humRe.exec(body)) !== null) bindings[m[1]] = humStr;
    return bindings;
}

export function dht22ReadingAt(parsed, elapsedSec = 0) {
    if (!parsed) return null;
    const t = Math.max(0, elapsedSec);
    return {
        temperature: parsed.baseTemp + 2.2 * Math.sin(t * 0.07),
        humidity: Math.max(0, Math.min(100, parsed.baseHum + 9 * Math.sin(t * 0.045 + 0.8))),
        sensorType: parsed.sensorType,
    };
}
