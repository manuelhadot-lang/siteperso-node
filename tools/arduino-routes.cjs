"use strict";
const { getArduinoCliStatus, compileArduinoSketch, DEFAULT_FQBN } = require("./arduino-api.cjs");

/**
 * Monte les routes REST Arduino sur une app Express.
 * @param {import("express").Express} app
 */
function mountArduinoRoutes(app) {
    app.get("/api/arduino/status", async (_req, res) => {
        try {
            const status = await getArduinoCliStatus();
            res.json({ ok: true, ...status });
        } catch (err) {
            res.status(500).json({
                ok: false,
                errors: [err?.message || String(err)],
            });
        }
    });

    app.post("/api/arduino/compile", async (req, res) => {
        const sketch = req.body?.sketch;
        const sketchName = req.body?.sketchName || req.body?.label || "sketch";
        const fqbn = req.body?.fqbn || DEFAULT_FQBN;
        try {
            const result = await compileArduinoSketch({ sketch, sketchName, fqbn });
            if (!result.ok) {
                return res.status(400).json(result);
            }
            res.json({
                ok: true,
                log: result.log,
                fqbn: result.fqbn,
                exe: result.exe,
                hexPath: result.hexPath || null,
            });
        } catch (err) {
            res.status(500).json({
                ok: false,
                errors: [err?.message || String(err)],
                log: "",
            });
        }
    });
}

module.exports = { mountArduinoRoutes };
