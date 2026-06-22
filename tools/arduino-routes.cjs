"use strict";
const {
    getArduinoCliStatus,
    compileArduinoSketch,
    listArduinoBoards,
    uploadArduinoSketch,
    resolveUserLibraryRoots,
    resolveUserLibraryPaths,
    searchArduinoLibraries,
    listInstalledArduinoLibraries,
    installArduinoLibrary,
    uninstallArduinoLibrary,
    updateArduinoLibraryIndex,
    DEFAULT_FQBN,
} = require("./arduino-api.cjs");

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

    app.get("/api/arduino/libraries", async (_req, res) => {
        try {
            const result = await listInstalledArduinoLibraries();
            res.json({
                ok: result.ok,
                roots: resolveUserLibraryRoots(),
                libraries: result.libraries,
                log: result.log || "",
                errors: result.errors || [],
            });
        } catch (err) {
            res.status(500).json({ ok: false, errors: [err?.message || String(err)] });
        }
    });

    app.get("/api/arduino/lib/search", async (req, res) => {
        const q = req.query?.q || req.query?.query || "";
        try {
            const result = await searchArduinoLibraries(q);
            if (!result.ok) {
                return res.status(400).json(result);
            }
            res.json(result);
        } catch (err) {
            res.status(500).json({ ok: false, libraries: [], errors: [err?.message || String(err)] });
        }
    });

    app.post("/api/arduino/lib/install", async (req, res) => {
        const name = req.body?.name || req.body?.library;
        try {
            const result = await installArduinoLibrary(name);
            if (!result.ok) {
                return res.status(400).json(result);
            }
            res.json(result);
        } catch (err) {
            res.status(500).json({ ok: false, errors: [err?.message || String(err)] });
        }
    });

    app.post("/api/arduino/lib/uninstall", async (req, res) => {
        const name = req.body?.name || req.body?.library;
        try {
            const result = await uninstallArduinoLibrary(name);
            if (!result.ok) {
                return res.status(400).json(result);
            }
            res.json(result);
        } catch (err) {
            res.status(500).json({ ok: false, errors: [err?.message || String(err)] });
        }
    });

    app.post("/api/arduino/lib/update-index", async (_req, res) => {
        try {
            const result = await updateArduinoLibraryIndex();
            if (!result.ok) {
                return res.status(400).json(result);
            }
            res.json(result);
        } catch (err) {
            res.status(500).json({ ok: false, errors: [err?.message || String(err)] });
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

    app.get("/api/arduino/boards", async (_req, res) => {
        try {
            const result = await listArduinoBoards();
            if (!result.ok) {
                return res.status(503).json(result);
            }
            res.json(result);
        } catch (err) {
            res.status(500).json({
                ok: false,
                boards: [],
                errors: [err?.message || String(err)],
            });
        }
    });

    app.post("/api/arduino/upload", async (req, res) => {
        const sketch = req.body?.sketch;
        const sketchName = req.body?.sketchName || req.body?.label || "sketch";
        const fqbn = req.body?.fqbn || DEFAULT_FQBN;
        const port = req.body?.port;
        try {
            const result = await uploadArduinoSketch({ sketch, sketchName, fqbn, port });
            if (!result.ok) {
                return res.status(400).json(result);
            }
            res.json(result);
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
