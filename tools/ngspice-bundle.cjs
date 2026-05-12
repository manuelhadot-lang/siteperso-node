"use strict";
/**
 * Résolution ngspice : variables NGSPICE / NGSPICE_PATH, sinon bundle portable
 * dans Simulateur/bin (+ lib pour les DLL Windows).
 */
const fs = require("node:fs");
const path = require("node:path");

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

/**
 * @param {string} appRoot Racine du projet (typiquement __dirname de server.js)
 * @returns {{ exe: string, prependPath: string[] }}
 */
function resolveNgspiceForServer(appRoot) {
    const simRoot = path.join(appRoot, "Simulateur");
    const binDir = path.join(simRoot, "bin");
    const libDir = path.join(simRoot, "lib");
    const winExe = path.join(binDir, "ngspice.exe");
    const unixExe = path.join(binDir, "ngspice");

    const prependForSimulateurBin = () => {
        const segments = [];
        if (fs.existsSync(binDir)) segments.push(binDir);
        if (fs.existsSync(libDir)) segments.push(libDir);
        return segments;
    };

    const raw = process.env.NGSPICE || process.env.NGSPICE_PATH;
    if (typeof raw === "string" && raw.trim().length > 0) {
        const exe = resolveNgspiceCandidate(raw, appRoot);
        const exeDir = path.dirname(path.resolve(exe));
        if (pathsEqual(exeDir, path.resolve(binDir))) {
            return { exe, prependPath: prependForSimulateurBin() };
        }
        return { exe, prependPath: [] };
    }

    if (fs.existsSync(winExe)) {
        return { exe: path.normalize(winExe), prependPath: prependForSimulateurBin() };
    }
    if (fs.existsSync(unixExe)) {
        return { exe: path.normalize(unixExe), prependPath: prependForSimulateurBin() };
    }

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

module.exports = {
    resolveNgspiceForServer,
    applyPathPrepend,
};
