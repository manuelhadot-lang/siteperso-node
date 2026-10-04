"use strict";

const path = require("path");
const { createGuardedVisitCounter } = require("./visit-counter-guard.cjs");

/** @type {ReturnType<typeof createGuardedVisitCounter> | null} */
let simulatorVisitCounter = null;

/**
 * Compteur de visites du simulateur — anti-abus (cookie + IP).
 * GET  /api/simulator/counter      → lecture seule
 * POST /api/simulator/counter/hit  → +1 si autorisé
 * @param {import("express").Express} app
 * @param {string} repoRoot
 */
function mountSimulatorVisitRoutes(app, repoRoot) {
    const statsPath = path.join(repoRoot, "simulator-visits.json");
    const counter = createGuardedVisitCounter({
        filePath: statsPath,
        cookieName: "sti2d_sim_visit",
        cooldownMs: 12 * 60 * 60 * 1000,
        cookieMaxAgeSec: 60 * 60 * 24,
        maxHitsPerIp: 80,
    });
    simulatorVisitCounter = counter;

    mountSimulatorVisitRoutes.reloadFromDisk = function reloadFromDisk() {
        return counter.reloadFromDisk();
    };

    mountSimulatorVisitRoutes.resetToZero = function resetToZero() {
        return counter.resetToZero();
    };

    mountSimulatorVisitRoutes.getCount = function getCount() {
        return counter.getCount();
    };

    app.get("/api/simulator/counter", (req, res) => {
        res.json({ count: counter.getCount() });
    });

    app.post("/api/simulator/counter/hit", (req, res) => {
        const result = counter.tryHit(req, res);
        res.json(result);
    });
}

module.exports = { mountSimulatorVisitRoutes };
