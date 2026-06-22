"use strict";
/**
 * Vérifie les prérequis avant de construire l'installateur Windows Simulateur H.
 */
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const ngspiceCandidates = [
    path.join(root, "Simulateur", "bin", "ngspice_con.exe"),
    path.join(root, "Simulateur", "bin", "ngspice.exe"),
];
const hasNgspice = ngspiceCandidates.some((p) => fs.existsSync(p));

if (!hasNgspice) {
    console.warn(
        "\n⚠️  ngspice_con.exe introuvable dans Simulateur/bin/\n" +
            "   Copiez le bundle ngspice Windows (ngspice_con.exe + DLL dans bin/ et lib/)\n" +
            "   avant de distribuer l'installateur, sinon la simulation SPICE échouera.\n"
    );
} else {
    console.log("✓ ngspice Windows trouvé dans Simulateur/bin/");
}

const simulateurDir = path.join(root, "Simulateur", "index.html");
if (!fs.existsSync(simulateurDir)) {
    console.error("✗ Dossier Simulateur/ incomplet (index.html manquant).");
    process.exit(1);
}
console.log("✓ Simulateur/ présent");

const cliExe = path.join(root, "Simulateur", "bin", "arduino-cli", "arduino-cli.exe");
const arduinoData = path.join(root, "Simulateur", "arduino-data", ".bundle-version");
if (!fs.existsSync(cliExe) || !fs.existsSync(arduinoData)) {
    console.error(
        "\n✗ Bundle Arduino incomplet (compilation / téléversement USB).\n" +
            "   Exécutez une fois (connexion Internet) :\n" +
            "     node scripts/prepare-arduino-bundle.cjs\n" +
            "   Puis relancez le build Simulateur H.\n"
    );
    process.exit(1);
}
console.log("✓ arduino-cli + cores embarqués (Simulateur/bin/arduino-cli, Simulateur/arduino-data)");
