"use strict";
/**
 * Vérifie en local : modules Engine (ESM) + exécutable ngspice (même logique que server.js).
 * Usage : npm run check-ngspice
 * Optionnel : NGSPICE ou NGSPICE_PATH. Sinon : Simulateur/bin/ngspice(.exe) + PATH bin/lib.
 */
const { execFile } = require("node:child_process");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const { resolveNgspiceForServer, applyPathPrepend } = require("./ngspice-bundle.cjs");

function runNgspiceVersion(bin, env) {
    return new Promise((resolve, reject) => {
        execFile(
            bin,
            ["-v"],
            { windowsHide: true, timeout: 15000, maxBuffer: 2 * 1024 * 1024, env },
            (err, stdout, stderr) => {
                if (err) reject(err);
                else resolve({ stdout: stdout || "", stderr: stderr || "" });
            }
        );
    });
}

async function main() {
    const root = path.join(__dirname, "..");
    const { exe, prependPath } = resolveNgspiceForServer(root);
    const env = applyPathPrepend(process.env, prependPath);
    console.log("Binaire ngspice attendu :", exe);
    if (prependPath.length) console.log("PATH préfixé (portable) :", prependPath.join(path.delimiter));

    const deckUrl = pathToFileURL(
        path.join(root, "Simulateur", "Engine", "spice-netlist-v2.mjs")
    ).href;
    const mod = await import(deckUrl);
    if (typeof mod.buildNgspiceDeck !== "function") {
        throw new Error("buildNgspiceDeck introuvable dans spice-netlist-v2.mjs");
    }

    const rpUrl = pathToFileURL(
        path.join(root, "Simulateur", "Engine", "v2", "result-parser.mjs")
    ).href;
    const rp = await import(rpUrl);
    if (typeof rp.mergeVoltmeterMeasurements !== "function") {
        throw new Error("mergeVoltmeterMeasurements introuvable dans result-parser.mjs");
    }
    console.log("Modules Simulateur/Engine : OK");

    try {
        const { stdout, stderr } = await runNgspiceVersion(exe, env);
        const out = (stdout || stderr || "").trim();
        console.log("ngspice -v : OK");
        if (out) console.log("---\n" + out);
    } catch (e) {
        console.error("ngspice -v : ÉCHEC —", e && e.message ? e.message : e);
        console.error(
            "\nPlace ngspice.exe dans Simulateur/bin/ et les DLL dans Simulateur/lib/, " +
                "ou définis NGSPICE / NGSPICE_PATH, ou ajoute ngspice au PATH système."
        );
        process.exitCode = 1;
    }
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
