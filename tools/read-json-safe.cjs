"use strict";

const fs = require("fs");

function parseJsonText(raw) {
    if (raw == null) {
        throw new Error("Fichier vide.");
    }
    const text = String(raw).replace(/^\uFEFF/, "").trim();
    if (!text) {
        throw new Error("Fichier vide.");
    }
    return JSON.parse(text);
}

/**
 * Lit un fichier JSON (UTF-8, BOM toléré). Retourne defaultValue si absent ou illisible.
 * @param {string} filePath
 * @param {*} defaultValue
 */
function readJsonFileSafe(filePath, defaultValue) {
    try {
        if (!fs.existsSync(filePath)) return defaultValue;
        return parseJsonText(fs.readFileSync(filePath, "utf8"));
    } catch (err) {
        console.warn(`[JSON] Lecture échouée (${filePath}) : ${err?.message || err}`);
        return defaultValue;
    }
}

module.exports = { parseJsonText, readJsonFileSafe };
