"use strict";
/**
 * Bundle portable arduino-cli + données (cores AVR/ESP32) pour Simulateur H Windows.
 * Chemins relatifs à repoRoot (racine avec Simulateur/ et tools/).
 */
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");

const BUNDLE_VERSION_FILE = ".bundle-version";
const CLI_DIR_REL = path.join("Simulateur", "bin", "arduino-cli");
const SEED_DATA_REL = path.join("Simulateur", "arduino-data");

function cleanEnvExecutable(s) {
    let x = String(s || "").trim();
    if ((x.startsWith('"') && x.endsWith('"')) || (x.startsWith("'") && x.endsWith("'"))) {
        x = x.slice(1, -1).trim();
    }
    return x;
}

function bundledCliExePath(repoRoot) {
    if (!repoRoot) return null;
    const base = path.join(repoRoot, CLI_DIR_REL);
    const candidates = [
        path.join(base, "arduino-cli.exe"),
        path.join(base, "arduino-cli"),
    ];
    for (const c of candidates) {
        if (fs.existsSync(c)) return c;
    }
    return null;
}

function bundledSeedDataDir(repoRoot) {
    if (!repoRoot) return null;
    const dir = path.join(repoRoot, SEED_DATA_REL);
    if (!fs.existsSync(dir)) return null;
    if (!fs.existsSync(path.join(dir, BUNDLE_VERSION_FILE))) return null;
    return dir;
}

function readBundleVersion(dir) {
    try {
        return fs.readFileSync(path.join(dir, BUNDLE_VERSION_FILE), "utf8").trim();
    } catch {
        return "";
    }
}

/** Répertoire data inscriptible (copie locale du seed embarqué). */
function writableDataDir(userDataDir) {
    return path.join(userDataDir, "arduino-data");
}

function collectToolBinDirs(dataDir) {
    const bins = [];
    const packages = path.join(dataDir, "packages");
    if (!fs.existsSync(packages)) return bins;
    for (const vendor of fs.readdirSync(packages)) {
        const vendorPath = path.join(packages, vendor);
        if (!fs.statSync(vendorPath).isDirectory()) continue;
        for (const platform of fs.readdirSync(vendorPath)) {
            const toolsPath = path.join(vendorPath, platform, "tools");
            if (!fs.existsSync(toolsPath)) continue;
            for (const tool of fs.readdirSync(toolsPath)) {
                const binPath = path.join(toolsPath, tool, "bin");
                if (fs.existsSync(binPath)) bins.push(binPath);
            }
        }
    }
    return bins;
}

function prependPathSegments(env, segments) {
    const key = Object.prototype.hasOwnProperty.call(env, "Path") ? "Path" : "PATH";
    const cur = String(env[key] || "");
    const parts = segments.filter(Boolean);
    if (!parts.length) return env;
    env[key] = [...parts, ...cur.split(path.delimiter).filter(Boolean)].join(path.delimiter);
    return env;
}

/**
 * Copie le seed embarqué vers userData si nécessaire (premier lancement ou mise à jour).
 * @returns {Promise<{ seeded: boolean; dataDir: string | null; version: string | null }>}
 */
async function seedArduinoDataIfNeeded(repoRoot, userDataDir) {
    const seedSrc = bundledSeedDataDir(repoRoot);
    if (!seedSrc) {
        return { seeded: false, dataDir: null, version: null };
    }
    const seedVersion = readBundleVersion(seedSrc);
    const dest = writableDataDir(userDataDir);
    const destVersion = readBundleVersion(dest);
    if (destVersion && destVersion === seedVersion && fs.existsSync(path.join(dest, "packages"))) {
        return { seeded: false, dataDir: dest, version: seedVersion };
    }

    await fs.promises.mkdir(path.dirname(dest), { recursive: true });
    await fs.promises.rm(dest, { recursive: true, force: true }).catch(() => {});
    console.log("[arduino-cli] Copie des cores embarqués (premier lancement, patience)…");
    await fs.promises.cp(seedSrc, dest, { recursive: true });
    console.log("[arduino-cli] Cores prêts : " + dest);
    return { seeded: true, dataDir: dest, version: seedVersion };
}

/**
 * Configure process.env pour arduino-api.cjs (CLI + data + PATH outils).
 * @param {{ repoRoot: string; userDataDir?: string }} options
 */
async function applyArduinoCliEnvironment(options = {}) {
    const repoRoot = options.repoRoot;
    const userDataDir = options.userDataDir || path.join(os.homedir(), ".simulateur-h");
    const exe = bundledCliExePath(repoRoot);

    if (!exe) {
        return { ok: false, bundled: false, reason: "arduino-cli.exe non embarqué" };
    }

    const { dataDir, version } = await seedArduinoDataIfNeeded(repoRoot, userDataDir);
    if (!dataDir) {
        return {
            ok: false,
            bundled: true,
            exe,
            reason: "Données Arduino (cores) absentes du bundle — reconstruire avec prepare-arduino-bundle",
        };
    }

    process.env.ARDUINO_CLI = exe;
    process.env.ARDUINO_DIRECTORIES_DATA = dataDir;
    const userLibs = path.join(repoRoot, "arduino-libraries");
    if (fs.existsSync(userLibs)) {
        process.env.ARDUINO_DIRECTORIES_USER = userLibs;
    }

    prependPathSegments(process.env, collectToolBinDirs(dataDir));

    return {
        ok: true,
        bundled: true,
        exe,
        dataDir,
        version,
        userLibraries: fs.existsSync(userLibs) ? userLibs : null,
    };
}

function isBundledArduinoCliReady(repoRoot) {
    return !!(bundledCliExePath(repoRoot) && bundledSeedDataDir(repoRoot));
}

function resolveBundledArduinoCliExe(repoRoot) {
    return bundledCliExePath(repoRoot);
}

module.exports = {
    BUNDLE_VERSION_FILE,
    CLI_DIR_REL,
    SEED_DATA_REL,
    bundledCliExePath,
    bundledSeedDataDir,
    writableDataDir,
    seedArduinoDataIfNeeded,
    applyArduinoCliEnvironment,
    isBundledArduinoCliReady,
    resolveBundledArduinoCliExe,
};
