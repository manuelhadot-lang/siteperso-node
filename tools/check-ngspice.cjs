"use strict";
/**
 * Vérifie en local : modules Engine (ESM) + exécutable ngspice (même logique que server.js).
 * Usage : npm run check-ngspice
 * Optionnel : NGSPICE ou NGSPICE_PATH (chemin complet vers ngspice.exe).
 */
const { execFile } = require("node:child_process");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

function ngspiceExecutablePath() {
    const fromEnv = process.env.NGSPICE || process.env.NGSPICE_PATH;
    return typeof fromEnv === "string" && fromEnv.trim().length > 0
        ? fromEnv.trim()
        : "ngspice";
}

function runNgspiceVersion(bin) {
    return new Promise((resolve, reject) => {
        execFile(
            bin,
            ["-v"],
            { windowsHide: true, timeout: 15000, maxBuffer: 2 * 1024 * 1024 },
            (err, stdout, stderr) => {
                if (err) reject(err);
                else resolve({ stdout: stdout || "", stderr: stderr || "" });
            }
        );
    });
}

async function main() {
    const root = path.join(__dirname, "..");
    const bin = ngspiceExecutablePath();
    console.log("Binaire ngspice attendu :", bin);

    const deckUrl = pathToFileURL(
        path.join(root, "Simulateur", "Engine", "spice-netlist-v2.js")
    ).href;
    const mod = await import(deckUrl);
    if (typeof mod.buildNgspiceDeck !== "function") {
        throw new Error("buildNgspiceDeck introuvable dans spice-netlist-v2.js");
    }

    const rpUrl = pathToFileURL(
        path.join(root, "Simulateur", "Engine", "v2", "result-parser.js")
    ).href;
    const rp = await import(rpUrl);
    if (typeof rp.mergeVoltmeterMeasurements !== "function") {
        throw new Error("mergeVoltmeterMeasurements introuvable dans result-parser.js");
    }
    console.log("Modules Simulateur/Engine : OK");

    try {
        const { stdout, stderr } = await runNgspiceVersion(bin);
        const out = (stdout || stderr || "").trim();
        console.log("ngspice -v : OK");
        if (out) console.log("---\n" + out);
    } catch (e) {
        console.error("ngspice -v : ÉCHEC —", e && e.message ? e.message : e);
        console.error(
            "\nSi ngspice est installé mais absent du PATH, définis avant la commande :\n" +
                "  PowerShell : $env:NGSPICE = \"C:\\\\chemin\\\\vers\\\\ngspice.exe\"\n" +
                "  ou ajoute le dossier contenant ngspice.exe aux variables d’environnement système, puis rouvre le terminal."
        );
        process.exitCode = 1;
    }
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
