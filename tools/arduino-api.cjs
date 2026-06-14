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

async function getArduinoCliStatus() {
    const exe = resolveArduinoCliPath();
    const versionRun = await runCli(["version"], { exe });
    const version = [versionRun.stdout, versionRun.stderr].join("\n").trim();
    return {
        ok: versionRun.ok,
        exe,
        version: version || null,
        fqbnDefault: DEFAULT_FQBN,
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

    try {
        const compileRun = await runCli(
            ["compile", "--fqbn", fqbn, "--output-dir", outDir, sketchDir],
            { timeoutMs: 180000 }
        );
        const log = [compileRun.stdout, compileRun.stderr].filter(Boolean).join("\n").trim();
        if (!compileRun.ok) {
            return {
                ok: false,
                errors: [
                    "Compilation Arduino échouée.",
                    compileRun.message ? `(${compileRun.message})` : "",
                    log ? log.slice(-6000) : "Vérifiez arduino-cli core install arduino:avr.",
                ].filter(Boolean),
                log,
                fqbn,
                exe: compileRun.exe,
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
    getArduinoCliStatus,
    compileArduinoSketch,
    sanitizeSketchFolderName,
};
