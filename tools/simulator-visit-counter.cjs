"use strict";

const fs = require("fs");
const path = require("path");
const { readJsonFileSafe } = require("./read-json-safe.cjs");

/**
 * Compteur de visites du simulateur — GET /api/simulator/counter
 * @param {import("express").Express} app
 * @param {string} repoRoot
 */
function mountSimulatorVisitRoutes(app, repoRoot) {
    const statsPath = path.join(repoRoot, "simulator-visits.json");
    let count = readJsonFileSafe(statsPath, { count: 0 }).count || 0;

    app.get("/api/simulator/counter", (req, res) => {
        count++;
        try {
            fs.writeFileSync(statsPath, JSON.stringify({ count }));
        } catch (err) {
            console.warn("[simulateur] écriture compteur visites:", err?.message || err);
        }
        res.json({ count });
    });
}

module.exports = { mountSimulatorVisitRoutes };
