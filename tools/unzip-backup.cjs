"use strict";

const path = require("path");
const zlib = require("zlib");

const SIG_LOCAL = 0x04034b50;
const SIG_CENTRAL = 0x02014b50;
const SIG_EOCD = 0x06054b50;

/**
 * Extrait du ZIP uniquement les fichiers dont le nom (basename) est dans allowedNames.
 * Gère STORE (0) et DEFLATE (8), comme les ZIP produits par archiver.
 * @param {Buffer} buffer
 * @param {Set<string>|string[]} allowedNames
 * @returns {Record<string, Buffer>}
 */
function extractAllowedFilesFromZip(buffer, allowedNames) {
    if (!Buffer.isBuffer(buffer) || buffer.length < 22) {
        throw new Error("Fichier ZIP invalide ou vide.");
    }
    const allow = allowedNames instanceof Set ? allowedNames : new Set(allowedNames);
    const eocd = findEocd(buffer);
    if (eocd < 0) {
        throw new Error("Archive ZIP illisible (fin de fichier introuvable).");
    }
    const entryCount = buffer.readUInt16LE(eocd + 10);
    let cdOff = buffer.readUInt32LE(eocd + 16);
    const out = {};
    for (let i = 0; i < entryCount; i++) {
        if (cdOff + 46 > buffer.length || buffer.readUInt32LE(cdOff) !== SIG_CENTRAL) {
            throw new Error("Archive ZIP corrompue (catalogue).");
        }
        const method = buffer.readUInt16LE(cdOff + 10);
        const compSize = buffer.readUInt32LE(cdOff + 20);
        const nameLen = buffer.readUInt16LE(cdOff + 28);
        const extraLen = buffer.readUInt16LE(cdOff + 30);
        const commentLen = buffer.readUInt16LE(cdOff + 32);
        const localOff = buffer.readUInt32LE(cdOff + 42);
        const rawName = buffer.slice(cdOff + 46, cdOff + 46 + nameLen).toString("utf8");
        cdOff += 46 + nameLen + extraLen + commentLen;

        const base = safeBackupBasename(rawName);
        if (!base || !allow.has(base)) continue;

        out[base] = inflateZipEntry(buffer, localOff, method, compSize);
    }
    return out;
}

function safeBackupBasename(rawName) {
    const normalized = String(rawName || "").replace(/\\/g, "/");
    if (!normalized || normalized.includes("..")) return null;
    const base = path.posix.basename(normalized);
    if (!base || base !== path.posix.normalize(base)) return null;
    return base;
}

function findEocd(buf) {
    const min = 22;
    const start = Math.max(0, buf.length - min - 65535);
    for (let i = buf.length - min; i >= start; i--) {
        if (buf.readUInt32LE(i) !== SIG_EOCD) continue;
        const commentLen = buf.readUInt16LE(i + 20);
        if (i + 22 + commentLen === buf.length) return i;
    }
    return -1;
}

function inflateZipEntry(buffer, localOff, method, compSize) {
    if (localOff + 30 > buffer.length || buffer.readUInt32LE(localOff) !== SIG_LOCAL) {
        throw new Error("Archive ZIP corrompue (entrée locale).");
    }
    const nameLen = buffer.readUInt16LE(localOff + 26);
    const extraLen = buffer.readUInt16LE(localOff + 28);
    const dataStart = localOff + 30 + nameLen + extraLen;
    if (dataStart + compSize > buffer.length) {
        throw new Error("Archive ZIP tronquée.");
    }
    const compressed = buffer.slice(dataStart, dataStart + compSize);
    if (method === 0) return Buffer.from(compressed);
    if (method === 8) return zlib.inflateRawSync(compressed);
    throw new Error("Compression ZIP non supportée (utilisez le ZIP du bouton Sauvegarde).");
}

module.exports = { extractAllowedFilesFromZip };
