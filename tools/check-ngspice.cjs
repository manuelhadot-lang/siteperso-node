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

async function loadNgspiceHasXspice() {
    const url = pathToFileURL(
        path.join(__dirname, "..", "Simulateur", "Engine", "ngspice-xspice-probe.mjs")
    ).href;
    const mod = await import(url);
    return mod.ngspiceHasXspice;
}

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
        const ngspiceHasXspice = await loadNgspiceHasXspice();
        const { stdout, stderr } = await runNgspiceVersion(exe, env);
        const out = (stdout || stderr || "").trim();
        console.log("ngspice -v : OK");
        if (out) console.log("---\n" + out);
        const xspiceInBanner = /\bxspice\b/i.test(out);
        const xspice = ngspiceHasXspice(exe, env);
        const digitalCm = path.join(root, "Simulateur", "lib", "ngspice", "digital.cm");
        const fs = require("node:fs");
        const hasCm = fs.existsSync(digitalCm);
        console.log("XSPICE dans le binaire :", xspice ? "oui" : "non");
        if (xspice && !xspiceInBanner) {
            console.log(
                "  (devhelp d_dff OK — certaines builds ngspice-46 n'affichent pas « XSPICE » dans ngspice -v)"
            );
        }
        console.log("digital.cm (Simulateur/lib/ngspice/) :", hasCm ? "present" : "absent");
        if (!xspice) {
            console.warn(
                "\nBascules D : mode XSPICE desactive (devhelp d_dff indisponible). " +
                    "Verifiez ngspice_con.exe dans Simulateur/bin/ ou une build compilee avec XSPICE."
            );
        } else if (!hasCm) {
            console.warn("\nBascules D : copiez digital.cm dans Simulateur/lib/ngspice/ pour activer d_dff.");
        }
    } catch (e) {
        console.error("ngspice -v : ÉCHEC —", e && e.message ? e.message : e);
        console.error(
            process.platform === "win32"
                ? "\nPlace ngspice.exe ou ngspice_con.exe dans Simulateur/bin/ et les DLL dans Simulateur/lib/, " +
                      "ou définis NGSPICE / NGSPICE_PATH, ou ajoute ngspice au PATH système."
                : "\nSur Linux : apt install ngspice puis NGSPICE=/usr/bin/ngspice, " +
                      "ou place le binaire ELF dans Simulateur/bin/ngspice (pas ngspice.exe)."
        );
        process.exitCode = 1;
    }
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
