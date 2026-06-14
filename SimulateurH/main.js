"use strict";

const { app, BrowserWindow, shell } = require("electron");
const path = require("path");

const DEFAULT_PORT = 43721;
let mainWindow = null;
/** @type {import("http").Server | null} */
let httpServer = null;

function isDevMode() {
    return !app.isPackaged;
}

/** Racine contenant Simulateur/ et tools/ (dev : parent du dossier SimulateurH). */
function resolveRepoRoot() {
    if (isDevMode()) {
        return path.join(__dirname, "..");
    }
    return path.join(process.resourcesPath, "simulator-app");
}

function resolveStandaloneServerModule() {
    return require(path.join(__dirname, "simulate-server.cjs"));
}

async function startBackend() {
    const { startStandaloneSimulateServer } = resolveStandaloneServerModule();
    const repoRoot = resolveRepoRoot();
    const port = Number(process.env.SIMULATEUR_H_PORT) || DEFAULT_PORT;
    const { server, url } = await startStandaloneSimulateServer({
        repoRoot,
        port,
        host: "127.0.0.1",
    });
    httpServer = server;
    return `${url}?app=h`;
}

function createWindow(startUrl) {
    mainWindow = new BrowserWindow({
        title: "Simulateur H",
        width: 1280,
        height: 860,
        minWidth: 960,
        minHeight: 640,
        autoHideMenuBar: true,
        webPreferences: {
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: true,
        },
    });

    mainWindow.loadURL(startUrl);

    mainWindow.webContents.setWindowOpenHandler(({ url }) => {
        if (url.startsWith("http://127.0.0.1") || url.startsWith("http://localhost")) {
            return { action: "allow" };
        }
        shell.openExternal(url);
        return { action: "deny" };
    });

    mainWindow.on("closed", () => {
        mainWindow = null;
    });
}

function stopBackend() {
    if (httpServer) {
        try {
            httpServer.close();
        } catch {
            /* ignore */
        }
        httpServer = null;
    }
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
    app.quit();
} else {
    app.on("second-instance", () => {
        if (mainWindow) {
            if (mainWindow.isMinimized()) mainWindow.restore();
            mainWindow.focus();
        }
    });

    app.whenReady().then(async () => {
        try {
            const startUrl = await startBackend();
            createWindow(startUrl);
        } catch (err) {
            console.error("[Simulateur H] Démarrage impossible :", err);
            const { dialog } = require("electron");
            dialog.showErrorBox(
                "Simulateur H — erreur de démarrage",
                (err && err.message) || String(err)
            );
            app.exit(1);
        }
    });

    app.on("window-all-closed", () => {
        stopBackend();
        app.quit();
    });

    app.on("before-quit", () => {
        stopBackend();
    });
}
