"use strict";

const fs = require("fs");
const path = require("path");
const express = require("express");

const CATEGORY_LABELS = {
    Arduino: "Arduino",
    ESP32: "ESP32",
    spice: "SPICE / Électronique",
};

function listExamples(examplesDir) {
    if (!fs.existsSync(examplesDir)) return [];
    const categories = [];
    for (const entry of fs.readdirSync(examplesDir, { withFileTypes: true })) {
        if (!entry.isDirectory()) continue;
        const catId = entry.name;
        const catPath = path.join(examplesDir, catId);
        const examples = [];
        for (const file of fs.readdirSync(catPath).filter((f) => f.toLowerCase().endsWith(".json")).sort((a, b) => a.localeCompare(b, "fr"))) {
            let name = file.replace(/\.json$/i, "");
            try {
                const parsed = JSON.parse(fs.readFileSync(path.join(catPath, file), "utf8"));
                if (parsed?.name) name = String(parsed.name);
            } catch {
                /* nom fichier par défaut */
            }
            examples.push({
                id: `${catId}/${file}`,
                file,
                name,
                url: `/exemples/${encodeURIComponent(catId)}/${encodeURIComponent(file)}`,
            });
        }
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

module.exports = { mountSimulatorExamplesRoutes, listExamples };
