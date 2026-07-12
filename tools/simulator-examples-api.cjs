"use strict";

const fs = require("fs");
const path = require("path");
const express = require("express");

const CATEGORY_LABELS = {
    Arduino: "Arduino",
    ESP32: "ESP32",
    spice: "SPICE / Électronique",
};

/** Titres affichés dans le catalogue (Fichier → Exemples). */
const SPICE_DISPLAY_NAMES = {
    "ampermetre.json": "Ampèremètre",
    "ampliNPN.json": "Amplificateur NPN",
    "AOP_Passe_Bande.json": "AOP passe-bande",
    "AOPLineaire.json": "AOP linéaire",
    "audio1.json": "Signal audio 1",
    "audio2.json": "Signal audio 2",
    "audio3.json": "Signal audio 3",
    "audio4.json": "Signal audio 4",
    "C4511_74HC90.json": "CD4511 + 74HC90",
    "CD4511_compteur.json": "Compteur avec CD4511",
    "CD4511.json": "Afficheur CD4511",
    "comp_hyst.json": "Comparateur à hystérésis",
    "comparateur_simple.json": "Comparateur simple",
    "compteur_binaire.json": "Compteur binaire",
    "D_Scope.json": "Oscilloscope double trace",
    "diode.json": "Diode / redressement",
    "generateur_pulse.json": "Générateur d'impulsions",
    "HC90_LED.json": "Compteur 74HC90 + LED",
    "interrupteur.json": "Interrupteur",
    "JK_compteur.json": "Compteur JK",
    "JK.json": "Bascule JK",
    "LED_Nand.json": "LED + porte NAND",
    "LED.json": "LED",
    "LM386.json": "Amplificateur LM386",
    "moteurDC.json": "Moteur DC",
    "mx8.json": "Matrice 8×8",
    "osciRLC.json": "Oscilloscope + circuit RLC",
    "pdt.json": "Pont diviseur de tension",
    "portNand.json": "Porte NAND",
    "RC.json": "Circuit RC",
    "RCSon.json": "Circuit RC + haut-parleur",
    "RLC_passe_bande.json": "Filtre RLC passe-bande",
    "servo.json": "Servo-moteur",
    "suiveur.json": "Suiveur de tension",
};

function formatFileStem(stem) {
    return String(stem || "")
        .replace(/_/g, " ")
        .replace(/([a-zàâäéèêëïîôùûüç])([A-ZÀÂÄÉÈÊËÏÎÔÙÛÜÇ0-9])/g, "$1 $2")
        .replace(/([0-9])([A-Za-zÀ-ÿ])/g, "$1 $2")
        .replace(/\s+/g, " ")
        .trim();
}

function resolveExampleDisplayName(catId, file, parsed) {
    if (catId === "spice" && SPICE_DISPLAY_NAMES[file]) {
        return SPICE_DISPLAY_NAMES[file];
    }
    const fromJson = parsed?.name != null ? String(parsed.name).trim() : "";
    if (fromJson) return fromJson;
    const cartouche = parsed?.printFrame?.cartouche?.title;
    if (cartouche && String(cartouche).trim()) return String(cartouche).trim();
    return formatFileStem(file.replace(/\.json$/i, ""));
}

function listExamples(examplesDir) {
    if (!fs.existsSync(examplesDir)) return [];
    const categories = [];
    for (const entry of fs.readdirSync(examplesDir, { withFileTypes: true })) {
        if (!entry.isDirectory()) continue;
        const catId = entry.name;
        const catPath = path.join(examplesDir, catId);
        const examples = [];
        for (const file of fs.readdirSync(catPath).filter((f) => f.toLowerCase().endsWith(".json"))) {
            let parsed = null;
            try {
                parsed = JSON.parse(fs.readFileSync(path.join(catPath, file), "utf8"));
            } catch {
                /* nom dérivé du fichier */
            }
            examples.push({
                id: `${catId}/${file}`,
                file,
                name: resolveExampleDisplayName(catId, file, parsed),
                url: `/exemples/${encodeURIComponent(catId)}/${encodeURIComponent(file)}`,
            });
        }
        examples.sort((a, b) => a.name.localeCompare(b.name, "fr"));
        if (examples.length) {
            categories.push({
                id: catId,
                label: CATEGORY_LABELS[catId] || catId,
                examples,
            });
        }
    }
    return categories.sort((a, b) => a.label.localeCompare(b.label, "fr"));
}

/**
 * @param {import("express").Express} app
 * @param {string} repoRoot
 */
function mountSimulatorExamplesRoutes(app, repoRoot) {
    const examplesDir = path.join(repoRoot, "exemples");
    if (fs.existsSync(examplesDir)) {
        app.use("/exemples", express.static(examplesDir));
    }
    app.get("/api/simulator/examples", (_req, res) => {
        try {
            res.json({ ok: true, categories: listExamples(examplesDir) });
        } catch (err) {
            res.status(500).json({ ok: false, error: err?.message || String(err) });
        }
    });
}

module.exports = {
    mountSimulatorExamplesRoutes,
    listExamples,
    resolveExampleDisplayName,
    formatFileStem,
};
