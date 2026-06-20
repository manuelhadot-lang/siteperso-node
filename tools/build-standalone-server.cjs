"use strict";
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const src = fs.readFileSync(path.join(root, "server.js"), "utf8");
const lines = src.split(/\r?\n/);

const header = `"use strict";
/**
 * Serveur minimal Simulateur H : fichiers statiques + POST /api/simulate.
 * Fichier dans l'asar Electron (express disponible). repoRoot = dossier avec Simulateur/ et tools/.
 */
const express = require("express");
const path = require("path");
const os = require("node:os");
const { execFile } = require("node:child_process");
const { copyFile, mkdtemp, readFile: readFileAsync, rm, writeFile } = require("node:fs/promises");
const { pathToFileURL } = require("node:url");

const XSPICE_DIGITAL_CM_PLACEHOLDER = "__XSPICE_DIGITAL_CM__";
const SIM_ENGINE_BUILD_TAG = "v2-reset-2026-05-09";

function createSimulateStandaloneApp(repoRoot) {
    const {
        resolveNgspiceForServer,
        applyPathPrepend,
        isNgspiceWrongPlatformBinary,
        resolveDigitalCmSourcePath,
    } = require(path.join(repoRoot, "tools", "ngspice-bundle.cjs"));

    const app = express();
    app.use(express.json({ limit: "20mb" }));
    app.use(express.urlencoded({ extended: true }));

    const dirSimulateur = path.join(repoRoot, "Simulateur");
`;

const footer = `
    app.get("/api/version", (req, res) => {
        res.json({
            ok: true,
            service: "simulateur-h",
            simEngineBuildTag: SIM_ENGINE_BUILD_TAG,
            ngspiceExecutable: ngspiceExecutablePath(),
            pid: process.pid,
        });
    });

    const { mountArduinoRoutes } = require(path.join(repoRoot, "tools", "arduino-routes.cjs"));
    mountArduinoRoutes(app);

    app.use("/Simulateur", express.static(dirSimulateur));
    app.get("/", (req, res) => res.redirect("/Simulateur/"));
    return app;
}

function startStandaloneSimulateServer(options = {}) {
    const repoRoot = options.repoRoot;
    if (!repoRoot) throw new Error("repoRoot requis");
    const port = options.port ?? 43721;
    const host = options.host ?? "127.0.0.1";
    const app = createSimulateStandaloneApp(repoRoot);
    const { resolveNgspiceForServer } = require(path.join(repoRoot, "tools", "ngspice-bundle.cjs"));
    return new Promise((resolve, reject) => {
        const server = app.listen(port, host, () => {
            const { exe: ngspiceExe } = resolveNgspiceForServer(repoRoot);
            console.log("[Simulateur H] ngspice : " + ngspiceExe);
            console.log("[Simulateur H] http://" + host + ":" + port + "/Simulateur/");
            resolve({ server, port, host, url: "http://" + host + ":" + port + "/Simulateur/" });
        });
        server.on("error", reject);
    });
}

module.exports = { createSimulateStandaloneApp, startStandaloneSimulateServer, SIM_ENGINE_BUILD_TAG };
`;

let bodyA = lines.slice(341, 421).join("\n");
bodyA = bodyA.replace(/__dirname/g, "repoRoot");
let bodyB = lines.slice(538, 764).join("\n");
bodyB = bodyB.replace(/__dirname/g, "repoRoot");
const body = bodyA + "\n\n" + bodyB;

let routes = lines.slice(764, 1187).join("\n");
routes = routes.replace(/__dirname/g, "repoRoot");
routes = routes.replace(
    /\s*if \(\s*\n\s*siteAccessPasswordConfigured\(\)[\s\S]*?\) \{\s*\n\s*return sendSiteAccessDenied\(res, req\);\s*\n\s*\}\s*\n/,
    "\n"
);

const out = header + "\n" + body + "\n" + routes + "\n" + footer;
const targets = [
    path.join(__dirname, "simulate-standalone-server.cjs"),
    path.join(root, "SimulateurH", "simulate-server.cjs"),
];
for (const target of targets) {
    fs.writeFileSync(target, out);
    console.log("OK", path.relative(root, target), out.length, "bytes");
}

const { execSync } = require("child_process");
for (const target of targets) {
    execSync(`node --check "${target}"`, { stdio: "inherit" });
}
