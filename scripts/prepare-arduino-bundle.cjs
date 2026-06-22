"use strict";
/**
 * Prépare le bundle arduino-cli + cores AVR/ESP32 pour l'installateur Windows Simulateur H.
 * À lancer sur la machine de build (Windows x64, accès Internet une fois).
 *
 *   node scripts/prepare-arduino-bundle.cjs
 *   node scripts/prepare-arduino-bundle.cjs --force
 */
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const { execFileSync } = require("node:child_process");
const { mkdir, rm, writeFile } = require("node:fs/promises");

const ROOT = path.join(__dirname, "..");
const CLI_VERSION = "1.2.2";
const DOWNLOAD_URL = `https://github.com/arduino/arduino-cli/releases/download/v${CLI_VERSION}/arduino-cli_${CLI_VERSION}_Windows_64bit.zip`;
const CLI_DIR = path.join(ROOT, "Simulateur", "bin", "arduino-cli");
const CLI_EXE = path.join(CLI_DIR, "arduino-cli.exe");
const DATA_DIR = path.join(ROOT, "Simulateur", "arduino-data");
const BUNDLE_VERSION = `simulateur-h-${CLI_VERSION}-avr-esp32`;

const CORES = ["arduino:avr", "esp32:esp32"];
const LIBS = [
    "DHT sensor library",
    "LiquidCrystal I2C",
    "Adafruit GFX Library",
    "Adafruit ST7735 and ST7789 Library",
    "Adafruit TSL2591 Library",
    "Adafruit BusIO",
];

const force = process.argv.includes("--force");

function runCli(exe, args, env, timeoutMs = 600000) {
    return execFileSync(exe, args, {
        env: { ...process.env, ...env },
        encoding: "utf8",
        timeout: timeoutMs,
        maxBuffer: 8 * 1024 * 1024,
        windowsHide: true,
    });
}

async function downloadCli() {
    if (!force && fs.existsSync(CLI_EXE)) {
        console.log("✓ arduino-cli.exe déjà présent");
        return CLI_EXE;
    }
    console.log(`Téléchargement arduino-cli ${CLI_VERSION}…`);
    await mkdir(CLI_DIR, { recursive: true });
    const zipPath = path.join(os.tmpdir(), `arduino-cli_${CLI_VERSION}_win.zip`);
    const res = await fetch(DOWNLOAD_URL);
    if (!res.ok) throw new Error(`Téléchargement échoué : ${res.status} ${DOWNLOAD_URL}`);
    const buf = Buffer.from(await res.arrayBuffer());
    await writeFile(zipPath, buf);

    const extractDir = path.join(os.tmpdir(), `arduino-cli-extract-${Date.now()}`);
    await mkdir(extractDir, { recursive: true });
    execFileSync(
        "powershell",
        [
            "-NoProfile",
            "-Command",
            `Expand-Archive -LiteralPath '${zipPath.replace(/'/g, "''")}' -DestinationPath '${extractDir.replace(/'/g, "''")}' -Force`,
        ],
        { stdio: "inherit", windowsHide: true }
    );
    const extractedExe = path.join(extractDir, "arduino-cli.exe");
    if (!fs.existsSync(extractedExe)) {
        throw new Error("arduino-cli.exe introuvable dans l'archive");
    }
    await rm(CLI_DIR, { recursive: true, force: true }).catch(() => {});
    await mkdir(CLI_DIR, { recursive: true });
    fs.copyFileSync(extractedExe, CLI_EXE);
    console.log("✓ arduino-cli.exe installé dans Simulateur/bin/arduino-cli/");
    return CLI_EXE;
}

async function installCoresAndLibs(exe) {
    if (!force && fs.existsSync(path.join(DATA_DIR, ".bundle-version"))) {
        const v = fs.readFileSync(path.join(DATA_DIR, ".bundle-version"), "utf8").trim();
        if (v === BUNDLE_VERSION) {
            console.log("✓ Cores/libs déjà préparés (" + v + ")");
            return;
        }
    }

    console.log("Préparation du dossier arduino-data (cores + bibliothèques)…");
    await rm(DATA_DIR, { recursive: true, force: true }).catch(() => {});
    await mkdir(DATA_DIR, { recursive: true });

    const env = {
        ARDUINO_CLI: exe,
        ARDUINO_DIRECTORIES_DATA: DATA_DIR,
        ARDUINO_DIRECTORIES_USER: path.join(ROOT, "arduino-libraries"),
    };

    console.log("  → core update-index");
    runCli(exe, ["core", "update-index"], env, 180000);

    for (const coreId of CORES) {
        console.log(`  → core install ${coreId} (peut prendre plusieurs minutes)`);
        runCli(exe, ["core", "install", coreId], env, 900000);
    }

    console.log("  → lib update-index");
    runCli(exe, ["lib", "update-index"], env, 180000);

    for (const lib of LIBS) {
        console.log(`  → lib install « ${lib} »`);
        try {
            runCli(exe, ["lib", "install", lib], env, 300000);
        } catch (err) {
            console.warn(`    ⚠ Échec (optionnel) : ${lib} — ${err.message || err}`);
        }
    }

    await writeFile(path.join(DATA_DIR, ".bundle-version"), BUNDLE_VERSION + "\n", "utf8");
    console.log("✓ arduino-data prêt : " + DATA_DIR);
}

async function main() {
    if (process.platform !== "win32") {
        console.warn("Ce script est prévu pour Windows (build installateur Simulateur H).");
    }
    const exe = await downloadCli();
    await installCoresAndLibs(exe);
    console.log("\nBundle Arduino prêt pour electron-builder.");
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
