"use strict";
/**
 * Intégration arduino-cli : compilation de sketches Arduino UNO.
 * Variable d'environnement ARDUINO_CLI = chemin vers arduino-cli(.exe).
 */
const { execFile } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const { mkdir, mkdtemp, readFile, rm, writeFile } = require("node:fs/promises");

const DEFAULT_FQBN = "arduino:avr:uno";

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
        // Chemin ARDUINO_CLI invalide (ex. build Docker incomplet) — retomber sur le PATH
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
    for (const root of resolveUserLibraryRoots()) {
        for (const name of fs.readdirSync(root)) {
            const libDir = path.join(root, name);
            if (isArduinoLibraryDir(libDir)) paths.push(libDir);
        }
    }
    return paths;
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
    for (const header of headers) {
        if (findLocalLibraryForHeader(header, libraryPaths)) {
            skipped.push(header);
            continue;
        }
        const libName = HEADER_LIB_REGISTRY[header];
        if (!libName) continue;
        const result = await installArduinoLibrary(libName);
        if (result.ok) installed.push(libName);
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
    const args = ["compile", "--fqbn", fqbn, "--output-dir", outDir];
    for (const libDir of libraryPaths) {
        args.push("--library", libDir);
    }
    args.push(sketchDir);
    return args;
}

async function getArduinoCliStatus() {
    const exe = resolveArduinoCliPath();
    const versionRun = await runCli(["version"], { exe });
    const version = [versionRun.stdout, versionRun.stderr].join("\n").trim();
    const libraryPaths = resolveUserLibraryPaths();
    return {
        ok: versionRun.ok,
        exe,
        version: version || null,
        fqbnDefault: DEFAULT_FQBN,
        libraryRoots: resolveUserLibraryRoots(),
        libraryPaths,
        hint: versionRun.ok
            ? null
            : process.env.ARDUINO_CLI && !fs.existsSync(cleanEnvExecutable(process.env.ARDUINO_CLI))
              ? `ARDUINO_CLI pointe vers un fichier absent (${process.env.ARDUINO_CLI}). Reconstruisez l'image Docker ou corrigez la variable.`
              : "Installez arduino-cli (https://arduino.github.io/arduino-cli/) puis définissez ARDUINO_CLI ou ajoutez-le au PATH.",
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
    const fqbn = String(opts?.fqbn || DEFAULT_FQBN);
    const folderName = sanitizeSketchFolderName(opts?.sketchName || "sketch");
    const tmpRoot = await mkdtemp(path.join(os.tmpdir(), "sim-arduino-"));
    const sketchDir = path.join(tmpRoot, folderName);
    await mkdir(sketchDir, { recursive: true });
    await writeFile(path.join(sketchDir, `${folderName}.ino`), sketch, "utf8");
    const outDir = path.join(tmpRoot, "build");
    await mkdir(outDir, { recursive: true });

    let libraryPaths = resolveUserLibraryPaths();
    const headers = parseSketchIncludes(sketch);
    let registryInstall = await ensureRegistryLibraries(headers, libraryPaths);
    if (registryInstall.installed.length > 0) {
        libraryPaths = resolveUserLibraryPaths();
    }

    try {
        let compileRun = await runCli(
            buildCompileArgs(fqbn, outDir, sketchDir, libraryPaths),
            { timeoutMs: 180000 }
        );
        let log = [compileRun.stdout, compileRun.stderr].filter(Boolean).join("\n").trim();

        if (!compileRun.ok && /No such file or directory/i.test(log)) {
            registryInstall = await ensureRegistryLibraries(headers, libraryPaths);
            if (registryInstall.installed.length > 0) {
                libraryPaths = resolveUserLibraryPaths();
                compileRun = await runCli(
                    buildCompileArgs(fqbn, outDir, sketchDir, libraryPaths),
                    { timeoutMs: 180000 }
                );
                log = [compileRun.stdout, compileRun.stderr].filter(Boolean).join("\n").trim();
            }
        }

        if (!compileRun.ok) {
            const libHint = libraryPaths.length
                ? `Bibliothèques locales : ${libraryPaths.map((p) => path.basename(p)).join(", ")}`
                : "Ajoutez vos bibliothèques dans le dossier arduino-libraries/ (un sous-dossier par lib).";
            return {
                ok: false,
                errors: [
                    "Compilation Arduino échouée.",
                    compileRun.message ? `(${compileRun.message})` : "",
                    libHint,
                    log ? log.slice(-6000) : "Vérifiez arduino-cli core install arduino:avr.",
                ].filter(Boolean),
                log,
                fqbn,
                exe: compileRun.exe,
                libraryPaths,
            };
        }
        let hexPath = null;
        try {
            const files = fs.readdirSync(outDir);
            const hex = files.find((f) => f.endsWith(".hex"));
            if (hex) hexPath = path.join(outDir, hex);
        } catch {
            /* ignore */
        }
        return {
            ok: true,
            log: log || "Compilation OK.",
            fqbn,
            exe: compileRun.exe,
            hexPath,
            buildDir: outDir,
            sketchDir,
            tmpRoot,
            libraryPaths,
        };
    } catch (err) {
        await rm(tmpRoot, { recursive: true, force: true }).catch(() => {});
        return {
            ok: false,
            errors: [err?.message || String(err)],
            log: "",
        };
    }
}

module.exports = {
    DEFAULT_FQBN,
    resolveArduinoCliPath,
    resolveUserLibraryRoots,
    resolveUserLibraryPaths,
    parseSketchIncludes,
    searchArduinoLibraries,
    listInstalledArduinoLibraries,
    installArduinoLibrary,
    uninstallArduinoLibrary,
    updateArduinoLibraryIndex,
    getArduinoCliStatus,
    compileArduinoSketch,
    sanitizeSketchFolderName,
};
