"use strict";
/**
 * Résolution ngspice : variables NGSPICE / NGSPICE_PATH, sinon bundle portable
 * dans Simulateur/bin (+ lib pour les DLL Windows).
 * Sur Linux/macOS : ngspice (ELF), jamais ngspice.exe même s'il est présent dans bin/.
 */
const fs = require("node:fs");
const path = require("node:path");

function isWin32() {
    return process.platform === "win32";
}

function isPortableWindowsExe(exePath) {
    return /\.exe$/i.test(String(exePath || ""));
}

function cleanEnvExecutable(s) {
    let x = String(s).trim();
    if ((x.startsWith('"') && x.endsWith('"')) || (x.startsWith("'") && x.endsWith("'")))
        x = x.slice(1, -1).trim();
    return x;
}

function resolveNgspiceCandidate(p, appRoot) {
    const t = cleanEnvExecutable(p);
    if (!t) return "ngspice";
    if (path.isAbsolute(t)) return path.normalize(t);
    const fromCwd = path.resolve(process.cwd(), t);
    if (fs.existsSync(fromCwd)) return fromCwd;
    const fromApp = path.resolve(appRoot, t);
    if (fs.existsSync(fromApp)) return fromApp;
    return t;
}

function pathsEqual(a, b) {
    return path.normalize(a).toLowerCase() === path.normalize(b).toLowerCase();
}

/** Noms des exécutables Windows dans Simulateur/bin (ordre de préférence). */
const WIN_BUNDLE_EXE_NAMES = ["ngspice.exe", "ngspice_con.exe"];

/**
 * @param {string} binDir
 * @param {string} libDir
 * @returns {string[]}
 */
function prependPathForSimulateurBundle(binDir, libDir) {
    const segments = [];
    if (fs.existsSync(binDir)) segments.push(binDir);
    if (isWin32() && fs.existsSync(libDir)) segments.push(libDir);
    const libNgspice = path.join(libDir, "ngspice");
    if (isWin32() && fs.existsSync(libNgspice)) segments.push(libNgspice);
    return segments;
}

/**
 * @param {string} binDir
 * @returns {string | null}
 */
function findWindowsBundledExe(binDir) {
    for (const name of WIN_BUNDLE_EXE_NAMES) {
        const candidate = path.join(binDir, name);
        if (fs.existsSync(candidate)) return path.normalize(candidate);
    }
    const noExt = path.join(binDir, "ngspice");
    if (fs.existsSync(noExt)) return path.normalize(noExt);
    return null;
}

/**
 * Binaire portable selon l’OS (sans variables d’environnement).
 * @param {string} binDir
 * @param {string} libDir
 * @returns {{ exe: string, prependPath: string[] } | null}
 */
function resolveBundledNgspice(binDir, libDir) {
    const unixExe = path.join(binDir, "ngspice");
    const prepend = prependPathForSimulateurBundle(binDir, libDir);

    if (isWin32()) {
        const win = findWindowsBundledExe(binDir);
        if (win) return { exe: win, prependPath: prepend };
    } else if (fs.existsSync(unixExe)) {
        return { exe: path.normalize(unixExe), prependPath: prepend };
    }

    return null;
}

/**
 * @param {string} exe Chemin ou nom du binaire ngspice tenté
 * @returns {boolean} true si .exe sur Linux/macOS (ne peut pas s’exécuter)
 */
function isNgspiceWrongPlatformBinary(exe) {
    return !isWin32() && isPortableWindowsExe(exe);
}

/**
 * @param {string} appRoot Racine du projet (typiquement __dirname de server.js)
 * @returns {{ exe: string, prependPath: string[] }}
 */
function resolveNgspiceForServer(appRoot) {
    const simRoot = path.join(appRoot, "Simulateur");
    const binDir = path.join(simRoot, "bin");
    const libDir = path.join(simRoot, "lib");

    const prependForSimulateurBin = () => prependPathForSimulateurBundle(binDir, libDir);

    const raw = process.env.NGSPICE || process.env.NGSPICE_PATH;
    if (typeof raw === "string" && raw.trim().length > 0) {
        const exe = resolveNgspiceCandidate(raw, appRoot);
        const exeDir = path.dirname(path.resolve(exe));
        if (pathsEqual(exeDir, path.resolve(binDir))) {
            return { exe, prependPath: prependForSimulateurBin() };
        }
        return { exe, prependPath: [] };
    }

    const bundled = resolveBundledNgspice(binDir, libDir);
    if (bundled) return bundled;

    return { exe: "ngspice", prependPath: [] };
}

/**
 * @param {NodeJS.ProcessEnv} base
 * @param {string[]} prependPath absolute dirs to prepend to PATH
 */
function applyPathPrepend(base, prependPath) {
    if (!prependPath.length) return base;
    const env = { ...base };
    const sep = path.delimiter;
    const prefix = prependPath.filter((d) => fs.existsSync(d)).join(sep);
    if (!prefix) return env;
    env.PATH = prefix + sep + (env.PATH || "");
    return env;
}

/**
 * Chemin source de digital.cm dans le dépôt (pour copie vers dossier temp ngspice).
 * @param {string} appRoot
 * @returns {string | null}
 */
function resolveDigitalCmSourcePath(appRoot) {
    const candidates = [
        path.join(appRoot, "Simulateur", "lib", "ngspice", "digital.cm"),
        path.join(appRoot, "Simulateur", "share", "ngspice", "lib", "ngspice", "digital.cm"),
    ];
    for (const p of candidates) {
        if (fs.existsSync(p)) return path.normalize(p);
    }
    return null;
}

module.exports = {
    resolveNgspiceForServer,
    applyPathPrepend,
    isNgspiceWrongPlatformBinary,
    isPortableWindowsExe,
    resolveDigitalCmSourcePath,
};
