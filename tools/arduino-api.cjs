"use strict";
/**
 * Intégration arduino-cli : compilation de sketches Arduino UNO.
 * Variable d'environnement ARDUINO_CLI = chemin vers arduino-cli(.exe).
 */
const { execFile } = require("node:child_process");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const { mkdir, readFile, rm, writeFile } = require("node:fs/promises");

const DEFAULT_FQBN = "arduino:avr:uno";
const BUILD_CACHE_ROOT = path.join(os.tmpdir(), "sim-arduino-build-cache");
/** Cores déjà installés en session (évite core list à chaque compilation). */
const installedCoresCache = new Set();
/** Noms de bibliothèques déjà installées via Library Manager (cache session). */
let installedRegistryLibNames = null;

/** Dépendances locales connues (dossier arduino-libraries/). */
const LOCAL_LIB_EXTRA_DEPS = {
    Adafruit_ST7735_and_ST7789_Library: ["Adafruit_GFX_Library", "Adafruit_BusIO"],
    Adafruit_TSL2591_Library: ["Adafruit_GFX_Library", "Adafruit_BusIO", "Adafruit_Unified_Sensor"],
    Adafruit_BMP280_Library: ["Adafruit_BusIO", "Adafruit_Unified_Sensor"],
    Adafruit_GFX_Library: ["Adafruit_BusIO"],
    DHT_sensor_library: ["Adafruit_Unified_Sensor"],
};

/** Ancien FQBN (espressif:esp32) → core actuel esp32:esp32 dans arduino-cli. */
function normalizeFqbn(fqbn) {
    const s = String(fqbn || DEFAULT_FQBN);
    if (s.startsWith("espressif:esp32:")) return s.replace("espressif:esp32:", "esp32:esp32:");
    return s;
}

/** FQBN → identifiant de core arduino-cli (ex. arduino:avr, esp32:esp32). */
function coreIdFromFqbn(fqbn) {
    const parts = normalizeFqbn(fqbn).split(":");
    if (parts.length < 2) return null;
    return `${parts[0]}:${parts[1]}`;
}

function isCoreInstalledInList(coreListJson, coreId) {
    const data = tryParseCliJson(coreListJson);
    if (!data) return false;
    const platforms = Array.isArray(data)
        ? data
        : data.platforms || data.platform || data.installed || [];
    if (!Array.isArray(platforms)) return false;
    for (const p of platforms) {
        const id = p.id || p.ID || p.Id;
        if (id !== coreId) continue;
        if (p.installed_version || p.installedVersion || p.installed) return true;
    }
    return false;
}

function parsePreinstalledCores() {
    return String(process.env.ARDUINO_CORES_PREINSTALLED || "")
        .split(/[,;|]/)
        .map((s) => s.trim())
        .filter(Boolean);
}

/** Vérifie la présence du core sur disque (image Docker Render). */
function isCoreInstalledOnDisk(coreId) {
    const dataDir = process.env.ARDUINO_DIRECTORIES_DATA;
    if (!dataDir || !coreId) return false;
    const [vendor, arch] = coreId.split(":");
    if (!vendor || !arch) return false;
    const hwDir = path.join(dataDir, "packages", vendor, "hardware", arch);
    if (!fs.existsSync(hwDir)) return false;
    try {
        return fs.readdirSync(hwDir).some((name) => {
            const p = path.join(hwDir, name);
            return fs.statSync(p).isDirectory();
        });
    } catch {
        return false;
    }
}

function markCoreInstalled(coreId) {
    if (coreId) installedCoresCache.add(coreId);
}

function isCoreKnownInstalled(coreId) {
    if (!coreId) return true;
    if (installedCoresCache.has(coreId)) return true;
    if (parsePreinstalledCores().includes(coreId)) return true;
    if (isCoreInstalledOnDisk(coreId)) return true;
    return false;
}

/**
 * Installe le core requis pour le FQBN (AVR ou ESP32) si absent.
 * @returns {Promise<{ ok: boolean; coreId?: string; log?: string; errors?: string[] }>}
 */
async function ensureCoreForFqbn(fqbn) {
    const coreId = coreIdFromFqbn(fqbn);
    if (!coreId) return { ok: true };
    if (isCoreKnownInstalled(coreId)) {
        markCoreInstalled(coreId);
        return { ok: true, coreId };
    }

    const listRun = await runCli(["core", "list", "--format", "json"], { timeoutMs: 90000 });
    if (isCoreInstalledInList(listRun.stdout, coreId) || isCoreInstalledOnDisk(coreId)) {
        markCoreInstalled(coreId);
        return { ok: true, coreId };
    }

    const logs = [];

    const indexRun = await runCli(["core", "update-index"], { timeoutMs: 180000 });
    logs.push([indexRun.stdout, indexRun.stderr].filter(Boolean).join("\n").trim());
    if (!indexRun.ok) {
        return {
            ok: false,
            coreId,
            log: logs.filter(Boolean).join("\n\n"),
            errors: ["Mise à jour de l'index des cartes échouée.", indexRun.message].filter(Boolean),
        };
    }

    const installRun = await runCli(["core", "install", coreId], {
        timeoutMs: coreId === "esp32:esp32" ? 900000 : 300000,
    });
    logs.push([installRun.stdout, installRun.stderr].filter(Boolean).join("\n").trim());

    if (!installRun.ok) {
        const hint =
            coreId === "esp32:esp32"
                ? "Installez le core ESP32 : arduino-cli core update-index && arduino-cli core install esp32:esp32"
                : `Installez le core : arduino-cli core install ${coreId}`;
        return {
            ok: false,
            coreId,
            log: logs.filter(Boolean).join("\n\n"),
            errors: [`Core ${coreId} introuvable.`, hint, installRun.message].filter(Boolean),
        };
    }

    markCoreInstalled(coreId);
    return { ok: true, coreId, log: logs.filter(Boolean).join("\n\n") };
}

function cleanEnvExecutable(s) {
    let x = String(s || "").trim();
    if ((x.startsWith('"') && x.endsWith('"')) || (x.startsWith("'") && x.endsWith("'"))) {
        x = x.slice(1, -1).trim();
    }
    return x;
}

function resolveArduinoCliPath() {
    const fromEnv = cleanEnvExecutable(process.env.ARDUINO_CLI);
    if (fromEnv) {
        if (path.isAbsolute(fromEnv) && fs.existsSync(fromEnv)) return fromEnv;
        const fromCwd = path.resolve(process.cwd(), fromEnv);
        if (fs.existsSync(fromCwd)) return fromCwd;
    }
    try {
        const bundle = require("./arduino-cli-bundle.cjs");
        const repoRoot = path.resolve(__dirname, "..");
        const bundled = bundle.bundledCliExePath(repoRoot);
        if (bundled) return bundled;
    } catch {
        /* ignore */
    }
    if (process.platform === "win32") {
        const desktop = path.join(process.env.USERPROFILE || process.env.HOME || "", "Desktop");
        const candidates = [
            path.join(desktop, "Arduino-cli", "arduino-cli.exe"),
            path.join(desktop, "arduino-cli", "arduino-cli.exe"),
            path.join(process.env.ProgramFiles || "", "Arduino CLI", "arduino-cli.exe"),
            path.join(process.env["ProgramFiles(x86)"] || "", "Arduino CLI", "arduino-cli.exe"),
        ];
        for (const c of candidates) {
            if (c && fs.existsSync(c)) return c;
        }
    }
    return "arduino-cli";
}

function runCli(args, opts = {}) {
    const exe = opts.exe || resolveArduinoCliPath();
    const timeoutMs = opts.timeoutMs ?? 120000;
    return new Promise((resolve, reject) => {
        execFile(
            exe,
            args,
            {
                windowsHide: true,
                timeout: timeoutMs,
                maxBuffer: 4 * 1024 * 1024,
                env: process.env,
            },
            (error, stdout, stderr) => {
                resolve({
                    ok: !error,
                    exe,
                    stdout: stdout || "",
                    stderr: stderr || "",
                    code: error?.code,
                    message: error?.message || "",
                });
            }
        );
    });
}

function sanitizeSketchFolderName(name) {
    const base = String(name || "sketch")
        .replace(/[^a-zA-Z0-9_]/g, "_")
        .replace(/^_+/, "")
        .slice(0, 40);
    return base.match(/^[a-zA-Z_]/) ? base : `sketch_${base || "uno"}`;
}

/** Dossiers racine où l'utilisateur peut déposer des bibliothèques Arduino. */
function resolveUserLibraryRoots() {
    const roots = [];
    const envPaths = String(process.env.ARDUINO_LIBRARIES || "")
        .split(/[;|]/)
        .map((p) => p.trim())
        .filter(Boolean);
    for (const p of envPaths) {
        const abs = path.isAbsolute(p) ? p : path.resolve(process.cwd(), p);
        if (fs.existsSync(abs)) roots.push(abs);
    }
    for (const rel of ["arduino-libraries", path.join("Simulateur", "arduino-libraries")]) {
        const abs = path.resolve(process.cwd(), rel);
        if (fs.existsSync(abs) && !roots.includes(abs)) roots.push(abs);
    }
    return roots;
}

function isArduinoLibraryDir(dir) {
    if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) return false;
    if (fs.existsSync(path.join(dir, "library.properties"))) return true;
    const entries = fs.readdirSync(dir);
    if (entries.some((f) => f.endsWith(".h"))) return true;
    const src = path.join(dir, "src");
    return fs.existsSync(src) && fs.statSync(src).isDirectory()
        && fs.readdirSync(src).some((f) => f.endsWith(".h"));
}

/** Chemins des bibliothèques locales (--library arduino-cli). */
function resolveUserLibraryPaths() {
    const paths = [];
    const seen = new Set();
    const addDir = (dir) => {
        const abs = path.resolve(dir);
        if (seen.has(abs)) return;
        if (!isArduinoLibraryDir(abs)) return;
        seen.add(abs);
        paths.push(abs);
    };
    for (const root of resolveUserLibraryRoots()) {
        for (const name of fs.readdirSync(root)) {
            addDir(path.join(root, name));
        }
        const nested = path.join(root, "libraries");
        if (fs.existsSync(nested) && fs.statSync(nested).isDirectory()) {
            for (const name of fs.readdirSync(nested)) {
                addDir(path.join(nested, name));
            }
        }
    }
    return paths;
}

function addLibraryWithDeps(libDir, allByBase, selected) {
    const abs = path.resolve(libDir);
    if (!selected.has(abs)) selected.add(abs);
    const base = path.basename(abs);
    for (const dep of LOCAL_LIB_EXTRA_DEPS[base] || []) {
        const depDir = allByBase.get(dep);
        if (depDir) addLibraryWithDeps(depDir, allByBase, selected);
    }
}

/**
 * Ne passe à arduino-cli que les bibliothèques locales réellement utiles au sketch.
 * Évite de scanner 10+ libs à chaque compilation (lent sur Render).
 */
function resolveLibrariesForSketch(sketch, fqbn) {
    const allPaths = resolveUserLibraryPaths();
    const allByBase = new Map(allPaths.map((p) => [path.basename(p), p]));
    const selected = new Set();
    const headers = parseSketchIncludes(sketch);

    if (sketchUsesAvrRegisters(sketch) && coreIdFromFqbn(fqbn) === "esp32:esp32") {
        const compat = allByBase.get("SimAVRCompat");
        if (compat) selected.add(path.resolve(compat));
    }

    for (const header of headers) {
        const libDir = findLocalLibraryForHeader(header, allPaths);
        if (libDir) addLibraryWithDeps(libDir, allByBase, selected);
    }

    return [...selected];
}

function buildCacheKey(sketch, fqbn, libraryPaths) {
    return crypto
        .createHash("sha256")
        .update(fqbn)
        .update("\0")
        .update(sketch)
        .update("\0")
        .update(libraryPaths.slice().sort().join("|"))
        .digest("hex")
        .slice(0, 24);
}

function resolveBuildWorkspace(sketch, fqbn, libraryPaths, folderName) {
    const key = buildCacheKey(sketch, fqbn, libraryPaths);
    const tmpRoot = path.join(BUILD_CACHE_ROOT, key);
    return {
        tmpRoot,
        sketchDir: path.join(tmpRoot, folderName),
        outDir: path.join(tmpRoot, "build"),
        cacheKey: key,
    };
}

async function getInstalledRegistryLibNames() {
    if (installedRegistryLibNames) return installedRegistryLibNames;
    const run = await runCli(["lib", "list", "--format", "json"], { timeoutMs: 60000 });
    const data = tryParseCliJson(run.stdout);
    let raw = [];
    if (Array.isArray(data)) raw = data;
    else if (Array.isArray(data?.installed_libraries)) raw = data.installed_libraries;
    installedRegistryLibNames = new Set(
        raw.map((e) => String(e?.library?.name || e?.name || "").trim().toLowerCase()).filter(Boolean)
    );
    return installedRegistryLibNames;
}

function parseSketchIncludes(sketch) {
    const headers = new Set();
    for (const m of String(sketch || "").matchAll(/#include\s*[<"]([^">]+)[">]/g)) {
        headers.add(m[1].trim());
    }
    return [...headers];
}

/** Correspondance en-tête → nom Library Manager (installable via arduino-cli lib install). */
const HEADER_LIB_REGISTRY = {
    "LiquidCrystal_I2C.h": "LiquidCrystal I2C",
    "rgb_lcd.h": "Grove - LCD RGB Backlight",
    "DHT.h": "DHT sensor library",
    "Adafruit_ST7735.h": "Adafruit ST7735 and ST7789 Library",
    "Adafruit_GFX.h": "Adafruit GFX Library",
    "Adafruit_TSL2591.h": "Adafruit TSL2591 Library",
    "Adafruit_BMP280.h": "Adafruit BMP280 Library",
};

function findLocalLibraryForHeader(header, libraryPaths) {
    for (const libDir of libraryPaths) {
        if (fs.existsSync(path.join(libDir, header))) return libDir;
        if (fs.existsSync(path.join(libDir, "src", header))) return libDir;
    }
    return null;
}

async function ensureRegistryLibraries(headers, libraryPaths) {
    const installed = [];
    const skipped = [];
    const registryNames = await getInstalledRegistryLibNames();
    for (const header of headers) {
        if (findLocalLibraryForHeader(header, libraryPaths)) {
            skipped.push(header);
            continue;
        }
        const libName = HEADER_LIB_REGISTRY[header];
        if (!libName) continue;
        if (registryNames.has(libName.toLowerCase())) {
            skipped.push(header);
            continue;
        }
        const result = await installArduinoLibrary(libName);
        if (result.ok) {
            installed.push(libName);
            registryNames.add(libName.toLowerCase());
        }
    }
    return { installed, skipped };
}

function tryParseCliJson(text) {
    const t = String(text || "").trim();
    if (!t) return null;
    try {
        return JSON.parse(t);
    } catch {
        return null;
    }
}

function normalizeLibraryEntry(entry) {
    if (!entry || typeof entry !== "object") return null;
    if (entry.library && typeof entry.library === "object") {
        return normalizeLibraryEntry(entry.library);
    }
    const name = entry.name || entry.Name;
    if (!name) return null;
    return {
        name: String(name),
        author: String(entry.author || entry.maintainer || entry.Author || ""),
        version: String(entry.version || entry.Version || ""),
        description: String(entry.sentence || entry.paragraph || entry.Sentence || "").slice(0, 160),
    };
}

function dedupeLibrariesByName(items) {
    const seen = new Set();
    const out = [];
    for (const item of items) {
        const key = item.name.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        out.push(item);
    }
    return out;
}

/** @returns {Promise<{ ok: boolean; libraries: object[]; log?: string; errors?: string[] }>} */
async function searchArduinoLibraries(query) {
    const q = String(query || "").trim();
    if (!q) {
        return { ok: false, libraries: [], errors: ["Saisissez un nom de bibliothèque à rechercher."] };
    }
    const run = await runCli(["lib", "search", q, "--format", "json"], { timeoutMs: 120000 });
    const log = [run.stdout, run.stderr].filter(Boolean).join("\n").trim();
    const data = tryParseCliJson(run.stdout);
    let raw = [];
    if (Array.isArray(data)) raw = data;
    else if (Array.isArray(data?.libraries)) raw = data.libraries;
    const libraries = dedupeLibrariesByName(
        raw.map(normalizeLibraryEntry).filter(Boolean)
    );
    if (!run.ok) {
        return {
            ok: false,
            libraries,
            log,
            errors: ["Recherche Library Manager échouée.", run.message, log].filter(Boolean),
        };
    }
    return { ok: true, libraries, log };
}

/** Bibliothèques installées (Library Manager + dossier arduino-libraries/). */
async function listInstalledArduinoLibraries() {
    const run = await runCli(["lib", "list", "--format", "json"], { timeoutMs: 90000 });
    const log = [run.stdout, run.stderr].filter(Boolean).join("\n").trim();
    const data = tryParseCliJson(run.stdout);
    let raw = [];
    if (Array.isArray(data)) raw = data;
    else if (Array.isArray(data?.installed_libraries)) raw = data.installed_libraries;
    const registry = dedupeLibrariesByName(
        raw.map(normalizeLibraryEntry).filter(Boolean)
    ).map((lib) => ({ ...lib, source: "registry" }));

    const local = resolveUserLibraryPaths().map((p) => ({
        name: path.basename(p),
        author: "",
        version: "local",
        description: "Bibliothèque locale (arduino-libraries/)",
        source: "local",
        path: p,
    }));

    const libraries = dedupeLibrariesByName([...registry, ...local]);
    return {
        ok: run.ok || local.length > 0,
        libraries,
        log,
        errors: run.ok ? [] : [run.message, log].filter(Boolean),
    };
}

/** @returns {Promise<{ ok: boolean; name: string; log?: string; errors?: string[] }>} */
async function installArduinoLibrary(name) {
    const libName = String(name || "").trim();
    if (!libName) {
        return { ok: false, name: "", errors: ["Nom de bibliothèque manquant."] };
    }
    const run = await runCli(["lib", "install", libName], { timeoutMs: 300000 });
    const log = [run.stdout, run.stderr].filter(Boolean).join("\n").trim();
    return {
        ok: run.ok,
        name: libName,
        log,
        errors: run.ok ? [] : ["Installation échouée.", log || run.message].filter(Boolean),
    };
}

/** @returns {Promise<{ ok: boolean; name: string; log?: string; errors?: string[] }>} */
async function uninstallArduinoLibrary(name) {
    const libName = String(name || "").trim();
    if (!libName) {
        return { ok: false, name: "", errors: ["Nom de bibliothèque manquant."] };
    }
    const run = await runCli(["lib", "uninstall", libName], { timeoutMs: 120000 });
    const log = [run.stdout, run.stderr].filter(Boolean).join("\n").trim();
    return {
        ok: run.ok,
        name: libName,
        log,
        errors: run.ok ? [] : ["Désinstallation échouée.", log || run.message].filter(Boolean),
    };
}

async function updateArduinoLibraryIndex() {
    const run = await runCli(["lib", "update-index"], { timeoutMs: 120000 });
    const log = [run.stdout, run.stderr].filter(Boolean).join("\n").trim();
    return {
        ok: run.ok,
        log,
        errors: run.ok ? [] : ["Mise à jour de l'index échouée.", log || run.message].filter(Boolean),
    };
}

function buildCompileArgs(fqbn, outDir, sketchDir, libraryPaths) {
    const args = ["compile", "--fqbn", fqbn];
    // ESP32 3.x (Windows) : --output-dir provoque l'échec Copy-Item sur partitions.csv
    if (coreIdFromFqbn(fqbn) !== "esp32:esp32") {
        args.push("--output-dir", outDir);
    }
    for (const libDir of libraryPaths) {
        args.push("--library", libDir);
    }
    args.push(sketchDir);
    return args;
}

function findFileRecursive(dir, ext, depth = 0) {
    if (!dir || depth > 8 || !fs.existsSync(dir)) return null;
    let entries;
    try {
        entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
        return null;
    }
    for (const ent of entries) {
        const full = path.join(dir, ent.name);
        if (ent.isFile() && ent.name.endsWith(ext)) return full;
    }
    for (const ent of entries) {
        if (!ent.isDirectory()) continue;
        const found = findFileRecursive(path.join(dir, ent.name), ext, depth + 1);
        if (found) return found;
    }
    return null;
}

function resolveBuildArtifactPath(sketchDir, outDir, fqbn, ext) {
    const roots =
        coreIdFromFqbn(fqbn) === "esp32:esp32"
            ? [path.join(sketchDir, "build"), sketchDir]
            : [outDir, path.join(sketchDir, "build")];
    for (const root of roots) {
        const found = findFileRecursive(root, ext);
        if (found) return found;
    }
    return null;
}

/** Sketch ESP32 utilisant DDRD/PORTD (syntaxe AVR) — injecte la bibliothèque de compatibilité. */
function sketchUsesAvrRegisters(sketch) {
    return /\b(?:DDR|PORT)[BCD]\b/.test(String(sketch || ""));
}

function prepareSketchForCompile(sketch, fqbn) {
    let s = String(sketch || "");
    if (!sketchUsesAvrRegisters(s)) return s;
    if (coreIdFromFqbn(fqbn) !== "esp32:esp32") return s;
    if (/#include\s*[<"]SimAVRCompat\.h[">]/.test(s)) return s;
    return `#include <SimAVRCompat.h>\n${s}`;
}

async function getArduinoCliStatus() {
    const exe = resolveArduinoCliPath();
    const versionRun = await runCli(["version"], { exe });
    const version = [versionRun.stdout, versionRun.stderr].join("\n").trim();
    const libraryPaths = resolveUserLibraryPaths();
    let bundled = null;
    try {
        const bundle = require("./arduino-cli-bundle.cjs");
        const repoRoot = path.resolve(__dirname, "..");
        if (bundle.isBundledArduinoCliReady(repoRoot)) {
            bundled = {
                cli: bundle.bundledCliExePath(repoRoot),
                seedData: bundle.bundledSeedDataDir(repoRoot),
                dataEnv: process.env.ARDUINO_DIRECTORIES_DATA || null,
            };
        }
    } catch {
        /* ignore */
    }
    return {
        ok: versionRun.ok,
        exe,
        version: version || null,
        fqbnDefault: DEFAULT_FQBN,
        libraryRoots: resolveUserLibraryRoots(),
        libraryPaths,
        bundled,
        hint: versionRun.ok
            ? null
            : bundled
              ? "arduino-cli embarqué détecté mais exécution échouée — vérifiez l’antivirus ou relancez l’application."
              : process.env.ARDUINO_CLI && !fs.existsSync(cleanEnvExecutable(process.env.ARDUINO_CLI))
                ? `ARDUINO_CLI pointe vers un fichier absent (${process.env.ARDUINO_CLI}). Reconstruisez l'image Docker ou corrigez la variable.`
                : "Installez arduino-cli ou reconstruisez Simulateur H avec prepare-arduino-bundle.cjs.",
    };
}

/**
 * @param {{ sketch: string; sketchName?: string; fqbn?: string }} opts
 */
async function compileArduinoSketch(opts) {
    const sketch = String(opts?.sketch || "");
    if (!sketch.trim()) {
        return { ok: false, errors: ["Sketch vide."], log: "" };
    }
    const fqbn = normalizeFqbn(String(opts?.fqbn || DEFAULT_FQBN));
    const folderName = sanitizeSketchFolderName(opts?.sketchName || "sketch");
    let libraryPaths = resolveLibrariesForSketch(sketch, fqbn);
    const headers = parseSketchIncludes(sketch);
    let registryInstall = await ensureRegistryLibraries(headers, resolveUserLibraryPaths());
    if (registryInstall.installed.length > 0) {
        libraryPaths = resolveLibrariesForSketch(sketch, fqbn);
    }

    const { tmpRoot, sketchDir, outDir } = resolveBuildWorkspace(sketch, fqbn, libraryPaths, folderName);
    await mkdir(sketchDir, { recursive: true });
    await mkdir(outDir, { recursive: true });
    const sketchSource = prepareSketchForCompile(sketch, fqbn);
    await writeFile(path.join(sketchDir, `${folderName}.ino`), sketchSource, "utf8");

    const coreEnsure = await ensureCoreForFqbn(fqbn);
    if (!coreEnsure.ok) {
        return {
            ok: false,
            errors: coreEnsure.errors || [`Core requis pour ${fqbn} non installé.`],
            log: coreEnsure.log || "",
            fqbn,
        };
    }

    const useEphemeral = !!opts?.ephemeral;
    try {
        let compileRun = await runCli(
            buildCompileArgs(fqbn, outDir, sketchDir, libraryPaths),
            { timeoutMs: coreIdFromFqbn(fqbn) === "esp32:esp32" ? 300000 : 180000 }
        );
        let log = [compileRun.stdout, compileRun.stderr].filter(Boolean).join("\n").trim();

        if (!compileRun.ok && /No such file or directory/i.test(log)) {
            registryInstall = await ensureRegistryLibraries(headers, resolveUserLibraryPaths());
            if (registryInstall.installed.length > 0) {
                libraryPaths = resolveLibrariesForSketch(sketch, fqbn);
                compileRun = await runCli(
                    buildCompileArgs(fqbn, outDir, sketchDir, libraryPaths),
                    { timeoutMs: coreIdFromFqbn(fqbn) === "esp32:esp32" ? 300000 : 180000 }
                );
                log = [compileRun.stdout, compileRun.stderr].filter(Boolean).join("\n").trim();
            }
        }

        if (!compileRun.ok) {
            if (useEphemeral) await rm(tmpRoot, { recursive: true, force: true }).catch(() => {});
            const libHint = libraryPaths.length
                ? `Bibliothèques locales : ${libraryPaths.map((p) => path.basename(p)).join(", ")}`
                : "Ajoutez vos bibliothèques dans le dossier arduino-libraries/ (un sous-dossier par lib).";
            return {
                ok: false,
                errors: [
                    "Compilation Arduino échouée.",
                    compileRun.message ? `(${compileRun.message})` : "",
                    libHint,
                    log ? log.slice(-6000) : `Vérifiez arduino-cli core install ${coreIdFromFqbn(fqbn) || "arduino:avr"}.`,
                ].filter(Boolean),
                log,
                fqbn,
                exe: compileRun.exe,
            libraryPaths,
        };
        }
        let hexPath = resolveBuildArtifactPath(sketchDir, outDir, fqbn, ".hex");
        const result = {
            ok: true,
            log: log || "Compilation OK.",
            fqbn,
            exe: compileRun.exe,
            hexPath,
            buildDir: hexPath ? path.dirname(hexPath) : outDir,
            sketchDir,
            tmpRoot,
            libraryPaths,
        };
        if (opts?.keepTemp) {
            return result;
        }
        if (useEphemeral) {
            await rm(tmpRoot, { recursive: true, force: true }).catch(() => {});
            delete result.tmpRoot;
            delete result.sketchDir;
        }
        return result;
    } catch (err) {
        if (useEphemeral) await rm(tmpRoot, { recursive: true, force: true }).catch(() => {});
        return {
            ok: false,
            errors: [err?.message || String(err)],
            log: "",
        };
    }
}

function normalizeBoardListEntry(entry) {
    if (!entry || typeof entry !== "object") return null;
    const portObj = entry.port && typeof entry.port === "object" ? entry.port : entry;
    const port = String(portObj.address || portObj.label || portObj.port || "").trim();
    if (!port) return null;
    const match = Array.isArray(entry.matching_boards) ? entry.matching_boards[0] : null;
    const label = String(
        match?.name || entry.board?.name || portObj.label || port
    ).trim();
    const fqbn = match?.fqbn ? String(match.fqbn) : null;
    return { port, label, fqbn };
}

/** @returns {Promise<{ ok: boolean; boards: object[]; log?: string; errors?: string[]; local?: boolean }>} */
async function listArduinoBoards() {
    const run = await runCli(["board", "list", "--format", "json"], { timeoutMs: 45000 });
    const log = [run.stdout, run.stderr].filter(Boolean).join("\n").trim();
    const data = tryParseCliJson(run.stdout);
    let raw = [];
    if (Array.isArray(data)) raw = data;
    else if (Array.isArray(data?.boards)) raw = data.boards;
    else if (Array.isArray(data?.detected_ports)) raw = data.detected_ports;

    const seen = new Set();
    const boards = [];
    for (const entry of raw) {
        const norm = normalizeBoardListEntry(entry);
        if (!norm || seen.has(norm.port)) continue;
        seen.add(norm.port);
        boards.push(norm);
    }

    if (!run.ok) {
        return {
            ok: false,
            boards,
            log,
            errors: [
                "Impossible de lister les ports USB.",
                run.message,
                "Vérifiez qu’arduino-cli est installé et que le serveur tourne sur le PC où la carte est branchée.",
            ].filter(Boolean),
        };
    }
    return { ok: true, boards, log, local: true };
}

/**
 * Compile puis téléverse sur le port série (arduino-cli upload).
 * @param {{ sketch: string; sketchName?: string; fqbn?: string; port: string }} opts
 */
async function uploadArduinoSketch(opts) {
    const port = String(opts?.port || "").trim();
    if (!port) {
        return { ok: false, errors: ["Port série non sélectionné (branchez la carte USB)."], log: "" };
    }

    const compileResult = await compileArduinoSketch({ ...opts, keepTemp: true });
    if (!compileResult.ok) return compileResult;

    const { fqbn, sketchDir, tmpRoot } = compileResult;
    const logs = [compileResult.log || "Compilation OK."];
    try {
        const uploadRun = await runCli(
            ["upload", "-p", port, "--fqbn", fqbn, sketchDir],
            { timeoutMs: coreIdFromFqbn(fqbn) === "esp32:esp32" ? 300000 : 120000 }
        );
        const uploadLog = [uploadRun.stdout, uploadRun.stderr].filter(Boolean).join("\n").trim();
        if (uploadLog) logs.push(uploadLog);

        if (!uploadRun.ok) {
            return {
                ok: false,
                errors: [
                    "Téléversement échoué.",
                    uploadRun.message,
                    "Fermez le Moniteur série et l’IDE Arduino s’ils utilisent le même port.",
                    uploadLog ? uploadLog.slice(-4000) : "",
                ].filter(Boolean),
                log: logs.join("\n\n"),
                fqbn,
                port,
            };
        }

        return {
            ok: true,
            log: logs.join("\n\n") || "Téléversement OK.",
            fqbn,
            port,
        };
    } catch (err) {
        return {
            ok: false,
            errors: [err?.message || String(err)],
            log: logs.join("\n\n"),
            fqbn,
            port,
        };
    } finally {
        if (tmpRoot) await rm(tmpRoot, { recursive: true, force: true }).catch(() => {});
    }
}

module.exports = {
    DEFAULT_FQBN,
    resolveArduinoCliPath,
    resolveUserLibraryRoots,
    resolveUserLibraryPaths,
    resolveLibrariesForSketch,
    parseSketchIncludes,
    searchArduinoLibraries,
    listInstalledArduinoLibraries,
    installArduinoLibrary,
    uninstallArduinoLibrary,
    updateArduinoLibraryIndex,
    getArduinoCliStatus,
    ensureCoreForFqbn,
    coreIdFromFqbn,
    compileArduinoSketch,
    listArduinoBoards,
    uploadArduinoSketch,
    sanitizeSketchFolderName,
};
