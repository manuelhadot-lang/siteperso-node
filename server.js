require('dotenv').config();

const express = require('express');
const crypto = require('crypto');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const nodemailer = require('nodemailer'); // Nécessite 'npm install nodemailer'
const http = require('http'); // Module natif Node.js
const { Server } = require("socket.io"); // Module Socket.io
const archiver = require('archiver'); // Nécessite 'npm install archiver'
const { execFile } = require("node:child_process");
const os = require("node:os");
const { copyFile, mkdtemp, readFile: readFileAsync, rm, writeFile } = require("node:fs/promises");
const { pathToFileURL } = require("node:url");
const {
    resolveNgspiceForServer,
    applyPathPrepend,
    isNgspiceWrongPlatformBinary,
    resolveDigitalCmSourcePath,
} = require("./tools/ngspice-bundle.cjs");
const { mountArduinoRoutes } = require("./tools/arduino-routes.cjs");
const { parseJsonText, readJsonFileSafe } = require("./tools/read-json-safe.cjs");
const { extractAllowedFilesFromZip } = require("./tools/unzip-backup.cjs");

const XSPICE_DIGITAL_CM_PLACEHOLDER = "__XSPICE_DIGITAL_CM__";

const app = express();
const server = http.createServer(app); // On crée le serveur HTTP avec Express
const io = new Server(server); // On attache Socket.io au serveur HTTP

/** Render / reverse proxy HTTPS : nécessaire pour cookies Secure et req.secure. */
if (process.env.NODE_ENV === "production") {
    app.set("trust proxy", 1);
}

app.use(express.urlencoded({ extended: true }));
app.use(express.json({ limit: "2mb" }));

/** Mot de passe « vitrine » : si SITE_ACCESS_PASSWORD est défini (ex. sur Render), tout le site exige une session cookie. */
const SITE_ACCESS_COOKIE = 'site_unlock';
const SITE_ACCESS_DEFAULT_MAX_AGE_SEC = 60 * 60 * 24 * 7; // 7 jours si SITE_ACCESS_MAX_AGE_SEC non défini

function siteAccessLogoutOnPageUnloadEnabled() {
    // Mot de passe uniquement à l’entrée du site : la session reste valable
    // pour tous les blocs (Cours, Projets, 3D, Simulateur, …).
    return false;
}

/** Durée du cookie : nombre de secondes, ou "session" = cookie de session navigateur (pas Max-Age). */
function siteAccessCookieMaxAgeSecondsForSetCookie() {
    const raw = process.env.SITE_ACCESS_MAX_AGE_SEC;
    if (raw != null && String(raw).trim().toLowerCase() === 'session') return null;
    const n = parseInt(String(raw ?? '').trim(), 10);
    if (Number.isFinite(n) && n > 0) return n;
    return SITE_ACCESS_DEFAULT_MAX_AGE_SEC;
}

/** Durée de validité du jeton signé (peut être plus courte que le cookie en mode session). */
function siteAccessTokenLifetimeSec() {
    const cookieAge = siteAccessCookieMaxAgeSecondsForSetCookie();
    if (cookieAge != null) return cookieAge;
    return 60 * 60 * 12; // avec cookie "session", le jeton reste borné (12 h)
}

function siteAccessPasswordConfigured() {
    const p = process.env.SITE_ACCESS_PASSWORD;
    return typeof p === 'string' && p.length > 0;
}

function siteAccessSigningKey() {
    const p = process.env.SITE_ACCESS_PASSWORD;
    const extra = process.env.SITE_ACCESS_SECRET || '';
    return crypto.createHash('sha256').update(`siteperso-unlock|${p}|${extra}`).digest();
}

function parseCookieHeader(header) {
    const out = {};
    if (!header || typeof header !== 'string') return out;
    for (const part of header.split(';')) {
        const idx = part.indexOf('=');
        if (idx === -1) continue;
        const k = part.slice(0, idx).trim();
        const v = part.slice(idx + 1).trim();
        try {
            out[k] = decodeURIComponent(v);
        } catch {
            out[k] = v;
        }
    }
    return out;
}

function createSiteAccessToken() {
    const exp = Math.floor(Date.now() / 1000) + siteAccessTokenLifetimeSec();
    const key = siteAccessSigningKey();
    const sig = crypto.createHmac('sha256', key).update(String(exp)).digest('hex');
    return `${exp}.${sig}`;
}

function verifySiteAccessToken(token) {
    if (!token || typeof token !== 'string') return false;
    const dot = token.lastIndexOf('.');
    if (dot <= 0) return false;
    const exp = parseInt(token.slice(0, dot), 10);
    const sig = token.slice(dot + 1);
    if (!Number.isFinite(exp) || exp * 1000 < Date.now()) return false;
    const key = siteAccessSigningKey();
    const expected = crypto.createHmac('sha256', key).update(String(exp)).digest('hex');
    try {
        const a = Buffer.from(sig, 'utf8');
        const b = Buffer.from(expected, 'utf8');
        return a.length === b.length && crypto.timingSafeEqual(a, b);
    } catch {
        return false;
    }
}

function hasSiteAccessFromCookies(cookieHeader) {
    const cookies = parseCookieHeader(cookieHeader);
    return verifySiteAccessToken(cookies[SITE_ACCESS_COOKIE]);
}

function sendSiteAccessDenied(res, req) {
    const msg =
        "Accès refusé. Connectez-vous via /acces-site (mot de passe du site), puis relancez la simulation.";
    const path = req.originalUrl || req.url || "";
    if (path.startsWith("/api/")) {
        return res.status(403).json({ ok: false, phase: "auth", errors: [msg] });
    }
    return res.status(403).type("text/plain; charset=utf-8").send(msg);
}

/** POST simulation : le cookie HttpOnly n’est pas toujours renvoyé sur fetch (Render, Safari, etc.). */
function isSimulateApiPost(req) {
    const p = req.path || "";
    return req.method === "POST" && (p === "/api/simulate" || p.endsWith("/api/simulate"));
}

/** POST altimétrie IGN : données publiques ; le cookie n’est pas toujours renvoyé sur fetch. */
function isIgnElevationPost(req) {
    return req.method === "POST" && req.path === "/api/ign/elevation";
}

/** GET tuiles ortho IGN — Image/fetch sans cookie (même cas que l’altimétrie). */
function isIgnOrthoGet(req) {
    return (req.method === "GET" || req.method === "HEAD") && req.path === "/api/ign/ortho-tile";
}

/** POST Overpass OSM (routes) — même contrainte cookie / CORS. */
function isOsmOverpassPost(req) {
    return req.method === "POST" && req.path === "/api/osm/overpass";
}

/** GET Mapillary (skybox) — même contrainte cookie. */
function isMapillaryGet(req) {
    return (
        (req.method === "GET" || req.method === "HEAD") &&
        (req.path === "/api/mapillary/nearby-pano" || req.path === "/api/mapillary/image")
    );
}

/** GET bâtiments BD TOPO IGN — données publiques. */
function isIgnBdTopoGet(req) {
    return (
        (req.method === "GET" || req.method === "HEAD") &&
        (req.path === "/api/ign/bdtopo-buildings")
    );
}

function siteAccessRequiresSimulateCookie() {
    const v = process.env.SITE_ACCESS_REQUIRE_AUTH_SIMULATE;
    return v === "1" || String(v || "").toLowerCase() === "true";
}

/** Évite les redirections ouvertes vers des URLs absolues. */
function isSafeSiteRedirectTarget(url) {
    if (!url || typeof url !== 'string') return false;
    if (!url.startsWith('/')) return false;
    if (url.startsWith('//')) return false;
    if (url.includes('\\')) return false;
    if (/^\/[^/]*:/i.test(url)) return false;
    return true;
}

function escapeHtmlAttr(text) {
    return String(text).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}

// Escape pour insérer une valeur dans une chaîne JavaScript délimitée par des quotes simples.
function escapeJsString(text) {
    return String(text)
        .replace(/\\/g, "\\\\")
        .replace(/'/g, "\\'")
        .replace(/\r?\n/g, "\\n");
}

function setSiteAccessCookie(res, token) {
    const parts = [
        `${SITE_ACCESS_COOKIE}=${encodeURIComponent(token)}`,
        'Path=/',
        'HttpOnly',
        'SameSite=Lax',
    ];
    const maxAge = siteAccessCookieMaxAgeSecondsForSetCookie();
    if (maxAge != null) parts.push(`Max-Age=${maxAge}`);
    if (process.env.NODE_ENV === 'production') parts.push('Secure');
    res.setHeader('Set-Cookie', parts.join('; '));
}

function clearSiteAccessCookie(res) {
    const parts = [`${SITE_ACCESS_COOKIE}=`, 'Path=/', 'HttpOnly', 'Max-Age=0', 'SameSite=Lax'];
    if (process.env.NODE_ENV === 'production') parts.push('Secure');
    res.setHeader('Set-Cookie', parts.join('; '));
}

app.get('/acces-site', (req, res) => {
    if (!siteAccessPasswordConfigured()) return res.redirect('/');
    let nextTarget = typeof req.query.next === 'string' ? req.query.next : '/';
    if (!isSafeSiteRedirectTarget(nextTarget)) nextTarget = '/';
    if (hasSiteAccessFromCookies(req.headers.cookie)) return res.redirect(302, nextTarget);
    const err = req.query.err === '1';
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    res.setHeader('Pragma', 'no-cache');
    res.send(`<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Accès au site</title>
  <style>
    * { box-sizing: border-box; }
    body { margin:0; min-height:100vh; display:flex; align-items:center; justify-content:center;
      background:#0f172a; color:#e2e8f0; font-family: system-ui, sans-serif; }
    .card { width:100%; max-width:380px; padding:2rem; background:#1e293b; border-radius:12px;
      border:1px solid #334155; box-shadow:0 20px 50px rgba(0,0,0,.35); }
    h1 { margin:0 0 .5rem; font-size:1.25rem; color:#f8fafc; }
    p { margin:0 0 1.25rem; font-size:.9rem; color:#94a3b8; line-height:1.5; }
    label { display:block; font-size:.85rem; color:#94a3b8; margin-bottom:.35rem; }
    input[type=password] { width:100%; padding:.65rem .75rem; border-radius:8px; border:1px solid #475569;
      background:#0f172a; color:#f8fafc; font-size:1rem; }
    input[type=password]:focus { outline:2px solid #00d1ff; outline-offset:1px; border-color:#00d1ff; }
    button { width:100%; margin-top:1rem; padding:.75rem; border:none; border-radius:8px; cursor:pointer;
      background:#00d1ff; color:#0f172a; font-weight:700; font-size:1rem; }
    button:hover { filter:brightness(1.05); }
    .err { background:#450a0a; color:#fecaca; padding:.65rem .75rem; border-radius:8px; font-size:.85rem; margin-bottom:1rem; }
    .hint { font-size:0.8rem; color:#64748b; line-height:1.45; margin:-0.25rem 0 1rem; }
  </style>
</head>
<body>
  <div class="card">
    <h1>Accès protégé</h1>
    <p>Ce site n’est visible qu’avec le mot de passe fourni par l’administrateur.</p>
    ${siteAccessLogoutOnPageUnloadEnabled() ? '<p class="hint">Option active : à chaque fois que vous quittez une page du site, la session est oubliée — le mot de passe sera redemandé.</p>' : ''}
    ${err ? '<div class="err">Mot de passe incorrect.</div>' : ''}
    <form method="post" action="/acces-site" autocomplete="off">
      <input type="hidden" name="next" value="${escapeHtmlAttr(nextTarget)}">
      <label for="pw">Mot de passe</label>
      <input id="pw" name="password" type="password" required autocomplete="new-password" autofocus>
      <button type="submit">Entrer</button>
    </form>
  </div>
  <script>
    (function () {
      var el = document.getElementById("pw");
      if (!el) return;
      var touched = false;
      el.addEventListener("input", function () { touched = true; });
      el.addEventListener("keydown", function () { touched = true; });
      // Vide un éventuel autofill sans bloquer la saisie.
      function clearIfUntouched() {
        if (!touched) el.value = "";
      }
      clearIfUntouched();
      window.addEventListener("pageshow", function () {
        touched = false;
        clearIfUntouched();
      });
    })();
  </script>
  <script src="/site-access-unload.js" defer></script>
</body>
</html>`);
});

app.post('/acces-site', (req, res) => {
    if (!siteAccessPasswordConfigured()) return res.redirect('/');
    const rawNext = req.body && typeof req.body.next === 'string' ? req.body.next : '/';
    const nextTarget = isSafeSiteRedirectTarget(rawNext) ? rawNext : '/';
    const sent = req.body && typeof req.body.password === 'string' ? req.body.password : '';
    const expected = process.env.SITE_ACCESS_PASSWORD;
    const a = Buffer.from(sent, 'utf8');
    const b = Buffer.from(expected, 'utf8');
    const ok = a.length === b.length && crypto.timingSafeEqual(a, b);
    if (!ok) {
        return res.redirect(302, '/acces-site?err=1&next=' + encodeURIComponent(nextTarget));
    }
    setSiteAccessCookie(res, createSiteAccessToken());
    return res.redirect(302, nextTarget);
});

/** Efface uniquement le cookie d’accès (utilisé au déchargement de page si SITE_ACCESS_LOGOUT_ON_PAGE_UNLOAD=1). */
app.post('/acces-site/clear-session', (req, res) => {
    if (!siteAccessPasswordConfigured() || !siteAccessLogoutOnPageUnloadEnabled()) return res.sendStatus(204);
    clearSiteAccessCookie(res);
    return res.sendStatus(204);
});

/** Déconnexion manuelle (lien possible dans le site). */
app.get('/acces-site/deconnexion', (req, res) => {
    if (!siteAccessPasswordConfigured()) return res.redirect('/');
    clearSiteAccessCookie(res);
    return res.redirect(302, '/acces-site');
});

app.get('/site-access-unload.js', (req, res) => {
    res.set('Cache-Control', 'no-store');
    res.type('application/javascript; charset=utf-8');
    if (!siteAccessLogoutOnPageUnloadEnabled()) {
        return res.send("/* SITE_ACCESS_LOGOUT_ON_PAGE_UNLOAD désactivé : aucune action au déchargement */\n");
    }
    res.send(`(function(){
  var skipClearOnUnload = false;
  function markInternalNavigation() {
    skipClearOnUnload = true;
    setTimeout(function () { skipClearOnUnload = false; }, 1500);
  }
  document.addEventListener("click", function (e) {
    var el = e.target;
    while (el) {
      if (el.tagName === "A" && el.href) {
        try {
          var u = new URL(el.href, location.href);
          if (u.origin === location.origin) markInternalNavigation();
        } catch (err) {}
        break;
      }
      el = el.parentElement;
    }
  }, true);
  document.addEventListener("submit", function (e) {
    var form = e.target;
    if (!form || !form.action) return;
    try {
      var u = new URL(form.action, location.href);
      if (u.origin === location.origin) markInternalNavigation();
    } catch (err) {}
  }, true);
  function clearSiteAccessCookieBeacon() {
    if (skipClearOnUnload) return;
    try {
      navigator.sendBeacon("/acces-site/clear-session", "");
    } catch (e) {}
  }
  window.addEventListener("pagehide", clearSiteAccessCookieBeacon);
})();`);
});

app.use((req, res, next) => {
    if (!siteAccessPasswordConfigured()) return next();
    if (req.method === 'GET' || req.method === 'HEAD') {
        if (isIgnOrthoGet(req)) return next();
        if (isMapillaryGet(req)) return next();
        if (isIgnBdTopoGet(req)) return next();
        if (hasSiteAccessFromCookies(req.headers.cookie)) return next();
        const dest = req.originalUrl || req.url || '/';
        const safe = isSafeSiteRedirectTarget(dest) ? dest : '/';
        return res.redirect(302, '/acces-site?next=' + encodeURIComponent(safe));
    }
    /* Simulateur : la page reste protégée en GET ; l’API POST ne dépend pas du cookie (souvent absent sur fetch). */
    if (isSimulateApiPost(req) && !siteAccessRequiresSimulateCookie()) return next();
    if (isIgnElevationPost(req)) return next();
    if (isOsmOverpassPost(req)) return next();
    if (hasSiteAccessFromCookies(req.headers.cookie)) return next();
    return sendSiteAccessDenied(res, req);
});

io.use((socket, next) => {
    if (!siteAccessPasswordConfigured()) return next();
    if (hasSiteAccessFromCookies(socket.handshake.headers.cookie)) return next();
    next(new Error('unauthorized'));
});
const PORT = process.env.PORT || 3000;
/** Local : 127.0.0.1 (moins d’alertes pare-feu Windows). Prod : NODE_ENV=production → 0.0.0.0. Surcharge : LISTEN_HOST ou HOST. */
const LISTEN_HOST =
    process.env.LISTEN_HOST ||
    process.env.HOST ||
    (process.env.NODE_ENV === "production" ? "0.0.0.0" : "127.0.0.1");
const ADMIN_USER = process.env.ADMIN_USER;
const ADMIN_PASS = process.env.ADMIN_PASS;

// --- 1. CONFIGURATION DES CHEMINS ---
const dirUploads = path.join(__dirname, 'upload-tp');
const dirDocs = path.join(__dirname, 'doc'); 
const mesSousDossiersDocs = ["Digicode", "Robo_Cytron", "RobotTriPostal", "StationMeteoConnectee", "UltraSon", "documents", "3D"];
const dirQuizAssets = path.join(__dirname, 'public', 'quiz-assets');
const dirSimulateur = path.join(__dirname, 'Simulateur');
const SIM_UI_VERSION = 'icons4';
const ngspiceDeckModuleUrl = pathToFileURL(path.join(__dirname, "Simulateur", "Engine", "spice-netlist-v2.mjs")).href;
const ngspiceResultParserModuleUrl = pathToFileURL(path.join(__dirname, "Simulateur", "Engine", "v2", "result-parser.mjs")).href;
let buildNgspiceDeckFn = null;
let mergeVoltmeterMeasurementsFn = null;
let mergeAmmeterMeasurementsFn = null;
let mergeOhmmeterMeasurementsFn = null;
let mergeOscilloscopeMeasurementsFn = null;
let deriveOscilloscopeValuesFromScopePlotsFn = null;
let mergeScopePlotsFromTranWrdataFn = null;
const SIM_ENGINE_BUILD_TAG = "v2-reset-2026-05-09";

const ngspiceXspiceProbeModuleUrl = pathToFileURL(
    path.join(__dirname, "Simulateur", "Engine", "ngspice-xspice-probe.mjs")
).href;
/** @type {{ exe: string | null; envKey: string | null; value: boolean | null }} */
let cachedNgspiceXspice = { exe: null, envKey: null, value: null };

function envPathKey(env) {
    return env && (env.PATH || env.Path) ? String(env.PATH || env.Path) : "";
}

function forceBsourceFromEnv() {
    const v = process.env.FORCE_BSOURCE;
    return v === "1" || String(v || "").toLowerCase() === "true";
}

/**
 * Détecte si le binaire ngspice du serveur supporte XSPICE (résultat mis en cache).
 * @param {string} exe
 * @param {NodeJS.ProcessEnv} env
 */
async function serverNgspiceHasXspice(exe, env) {
    const envKey = envPathKey(env);
    if (
        cachedNgspiceXspice.exe === exe &&
        cachedNgspiceXspice.envKey === envKey &&
        cachedNgspiceXspice.value !== null
    ) {
        return cachedNgspiceXspice.value;
    }
    try {
        const mod = await import(ngspiceXspiceProbeModuleUrl);
        const value = mod.ngspiceHasXspice(exe, env);
        cachedNgspiceXspice = { exe, envKey, value };
        return value;
    } catch {
        cachedNgspiceXspice = { exe, envKey, value: false };
        return false;
    }
}

/**
 * Binaire ngspice : NGSPICE / NGSPICE_PATH, sinon Simulateur/bin/ngspice(.exe)
 * si vous y copiez le bundle (bin, lib, share).
 */
function ngspiceExecutablePath() {
    return resolveNgspiceForServer(__dirname).exe;
}

/**
 * @param {{ message?: string; code?: string | number }} error
 */
function isNgspiceMissingError(error) {
    if (!error) return false;
    if (error.code === "ENOENT") return true;
    const msg = `${error.message || ""}`;
    // Ne pas matcher seul « spawn » : spawn EPERM = blocage sécurité, pas « introuvable ».
    return /not recognized|introuvable|pas reconnu|cannot find|No such file|est pas une commande|n'est pas reconnu|n'est pas reconnu|command not found/i.test(
        msg
    );
}

/**
 * @param {{ message?: string; code?: string | number }} error
 * @param {string} [exeTried]
 */
function isLikelySecuritySoftwareBlock(error, exeTried) {
    if (!error || isNgspiceWrongPlatformBinary(exeTried || "")) return false;
    if (!isWin32Platform()) return false;
    const c = error.code;
    if (c === "EPERM" || c === "EACCES") return true;
    const msg = `${error.message || ""}`;
    return /operation not permitted|accès refusé|access denied|bloqué|blocked|not permitted by/i.test(msg);
}

function isWin32Platform() {
    return process.platform === "win32";
}

// --- CHARGEMENT DES ELEVES ---
let baseEleves = readJsonFileSafe("./eleves.json", {});

// Route pour vérifier si un code élève existe
app.get('/api/check-student/:code', (req, res) => {
    const codeCherche = req.params.code.toUpperCase();
    let eleveTrouve = null;

    for (let classe in baseEleves) {
        const match = baseEleves[classe].find(e => e.code.toUpperCase() === codeCherche);
        if (match) {
            eleveTrouve = { nom: match.nom, prenom: match.prenom };
            break;
        }
    }

    if (eleveTrouve) {
        res.json({ exists: true, ...eleveTrouve });
    } else {
        res.json({ exists: false });
    }
});

// Création automatique
if (!fs.existsSync(dirUploads)) fs.mkdirSync(dirUploads);
if (!fs.existsSync(dirDocs)) fs.mkdirSync(dirDocs);
if (!fs.existsSync(dirQuizAssets)) fs.mkdirSync(dirQuizAssets, { recursive: true });
mesSousDossiersDocs.forEach(sd => {
    const p = path.join(dirDocs, sd);
    if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
});

// Liste de tes classes (Modifie ces noms selon tes besoins)
const mesClasses = ["Tle_STI2D1", "Tle_STI2D2", "1ere_STI2D1", "1ere_STI2D2"];

// --- 2. CHARGEMENT DES PLANNINGS ---
let planningProjets = readJsonFileSafe("./planning_projets.json", {
    Robotique: "2026-03-01",
    UltraSon: "2026-03-01",
    Station_Meteo: "2026-03-01",
    Digicode: "2026-03-01",
    Robo_Cytron_ESP32: "2026-03-01",
});
let planningDocs = readJsonFileSafe("./planning_docs.json", {});
let quizzes = readJsonFileSafe("./quizzes.json", {});
let chatMessages = readJsonFileSafe("./chat_messages.json", []);

// --- 3. CONFIGURATION MULTER ---
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const projet = req.body.projet || 'Robotique';
        const target = path.join(dirUploads, projet);
        if (!fs.existsSync(target)) fs.mkdirSync(target, { recursive: true });
        cb(null, target);
    },
    filename: (req, file, cb) => {
        const nom = (req.body.nom || 'SANSNOM').toUpperCase().replace(/\s/g, '_');
        const prenom = (req.body.prenom || 'SANSPRENOM').replace(/\s/g, '_');
        cb(null, `${nom}_${prenom}_${new Date().toISOString().slice(0, 10)}${path.extname(file.originalname)}`);
    }
});
const upload = multer({ storage: storage });

// Configuration Multer pour les images des Quiz
const storageQuiz = multer.diskStorage({
    destination: (req, file, cb) => cb(null, dirQuizAssets),
    filename: (req, file, cb) => cb(null, 'img_' + Date.now() + path.extname(file.originalname))
});
const uploadQuiz = multer({ storage: storageQuiz });

const BACKUP_JSON_FILES = [
    "eleves.json",
    "quizzes.json",
    "planning_projets.json",
    "planning_docs.json",
    "chat_messages.json",
    "visits.json",
    "simulator-visits.json",
];

const uploadBackupZip = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 8 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        const ok = file && /\.zip$/i.test(file.originalname || "");
        cb(ok ? null : new Error("Choisissez le fichier ZIP de sauvegarde."), ok);
    },
});

function writeJsonAtomic(fileName, value) {
    fs.writeFileSync(path.join(__dirname, fileName), JSON.stringify(value, null, 2));
}

function applyBackupJsonFile(fileName, parsed) {
    if (fileName === "eleves.json") {
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
            throw new Error("eleves.json invalide.");
        }
        baseEleves = parsed;
        writeJsonAtomic(fileName, baseEleves);
        return;
    }
    if (fileName === "quizzes.json") {
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
            throw new Error("quizzes.json invalide.");
        }
        quizzes = parsed;
        writeJsonAtomic(fileName, quizzes);
        return;
    }
    if (fileName === "planning_projets.json") {
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
            throw new Error("planning_projets.json invalide.");
        }
        planningProjets = parsed;
        writeJsonAtomic(fileName, planningProjets);
        return;
    }
    if (fileName === "planning_docs.json") {
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
            throw new Error("planning_docs.json invalide.");
        }
        planningDocs = parsed;
        writeJsonAtomic(fileName, planningDocs);
        return;
    }
    if (fileName === "chat_messages.json") {
        if (!Array.isArray(parsed)) {
            throw new Error("chat_messages.json invalide.");
        }
        chatMessages = parsed;
        writeJsonAtomic(fileName, chatMessages);
        return;
    }
    if (fileName === "visits.json") {
        const n = parsed && typeof parsed === "object" ? Number(parsed.count) : NaN;
        visitCount = Number.isFinite(n) ? n : 0;
        writeJsonAtomic(fileName, { count: visitCount });
        return;
    }
    if (fileName === "simulator-visits.json") {
        const n = parsed && typeof parsed === "object" ? Number(parsed.count) : NaN;
        writeJsonAtomic(fileName, { count: Number.isFinite(n) ? n : 0 });
        if (typeof mountSimulatorVisitRoutes.reloadFromDisk === "function") {
            mountSimulatorVisitRoutes.reloadFromDisk();
        }
    }
}

function adminAlertRedirect(message) {
    return `<script>alert(${JSON.stringify(String(message))}); window.location='/espace-correction';</script>`;
}


// --- 4. MIDDLEWARES ---

function isProjectAccessible(projectKey) {
    const aujourdhui = new Date().toISOString().split('T')[0];
    const dateOuverture = planningProjets[projectKey];
    return !dateOuverture || aujourdhui >= dateOuverture;
}

function sendProjectLocked(res, projectKey) {
    const dateOuverture = planningProjets[projectKey];
    const dateAffichee = dateOuverture ? dateOuverture.split('-').reverse().join('/') : "date à venir";
    return res.send(`<script>alert("🔒 Projet disponible le ${dateAffichee}"); window.location='/projets.html';</script>`);
}

function withProjectDateGate(projectKey, handler) {
    return (req, res) => {
        if (!isProjectAccessible(projectKey)) return sendProjectLocked(res, projectKey);
        return handler(req, res);
    };
}

// Redirige l'ancienne page statique qui contournait les dates.
app.get('/projets_backup.html', (req, res) => res.redirect('/projets.html'));
app.get('/ContenuRobotique.html', withProjectDateGate('Robotique', (req, res) => res.sendFile(path.join(__dirname, 'public', 'ContenuRobotique.html'))));
app.get('/ultrason.html', withProjectDateGate('UltraSon', (req, res) => res.sendFile(path.join(__dirname, 'public', 'ultrason.html'))));
app.get('/StationMeteoConnectee.html', withProjectDateGate('Station_Meteo', (req, res) => res.sendFile(path.join(__dirname, 'public', 'StationMeteoConnectee.html'))));
app.get('/Digicode.html', withProjectDateGate('Digicode', (req, res) => res.sendFile(path.join(__dirname, 'public', 'Digicode.html'))));
app.get('/Robo_Cytron_ESP32.html', withProjectDateGate('Robo_Cytron_ESP32', (req, res) => res.sendFile(path.join(__dirname, 'public', 'Robo_Cytron_ESP32.html'))));

app.get('/favicon.ico', (req, res) => {
    res.type('image/svg+xml');
    res.sendFile(path.join(__dirname, 'public', 'favicon.svg'));
});
app.use(express.static('public'));
app.get('/Simulateur/__ui', (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.json({
        ok: true,
        uiVersion: SIM_UI_VERSION,
        simulateurDir: dirSimulateur,
        pid: process.pid,
    });
});
app.use('/Simulateur', express.static(dirSimulateur, {
    setHeaders(res) {
        res.setHeader('Cache-Control', 'no-store');
        res.setHeader('X-Sim-UI', SIM_UI_VERSION);
    },
}));
app.use('/3D', express.static(path.join(__dirname, '3D'), {
    setHeaders(res) {
        res.setHeader('Cache-Control', 'no-store');
    },
}));
app.use('/assets-3d', express.static(path.join(dirDocs, '3D'))); // Route pour les modèles 3D
const textureRoot = path.join(__dirname, 'texture');
app.use('/texture', express.static(textureRoot, {
    setHeaders(res) {
        res.setHeader('Cache-Control', 'public, max-age=86400');
    },
}));
app.get('/api/texture-library', (req, res) => {
    try {
        const { buildTextureLibraryCatalog } = require('./tools/texture-library-catalog.cjs');
        const catalog = buildTextureLibraryCatalog(textureRoot, { urlBase: '/texture' });
        res.setHeader('Cache-Control', 'no-store');
        res.json(catalog);
    } catch (error) {
        res.status(500).json({
            ok: false,
            assets: [],
            categories: [],
            error: error instanceof Error ? error.message : 'Catalogue textures indisponible',
        });
    }
});
/** Proxy altimétrie IGN — évite les URL GET géantes (>90 ko) impossibles dans le navigateur. */
const IGN_ELEVATION_URL =
    "https://data.geopf.fr/altimetrie/1.0/calcul/alti/rest/elevation.json";
const IGN_ELEVATION_RESOURCE = "ign_rge_alti_wld";
const IGN_ELEVATION_MAX_POINTS = 5000;
/** Taille max d’un appel GET vers l’IGN (URL ~95 ko à 5000 pts). */
const IGN_UPSTREAM_CHUNK = 250;
const IGN_UPSTREAM_DELAY_MS = 220;

async function fetchIgnUpstreamElevations(lats, lons) {
    const elevations = [];
    for (let start = 0; start < lats.length; start += IGN_UPSTREAM_CHUNK) {
        const latsChunk = lats.slice(start, start + IGN_UPSTREAM_CHUNK);
        const lonsChunk = lons.slice(start, start + IGN_UPSTREAM_CHUNK);
        const params = new URLSearchParams({
            lon: lonsChunk.map((value) => String(value)).join("|"),
            lat: latsChunk.map((value) => String(value)).join("|"),
            resource: IGN_ELEVATION_RESOURCE,
            delimiter: "|",
            measures: "false",
            zonly: "true",
        });
        const response = await fetch(`${IGN_ELEVATION_URL}?${params.toString()}`);
        if (!response.ok) {
            throw new Error(`Service IGN (${response.status})`);
        }
        const data = await response.json();
        if (!Array.isArray(data?.elevations) || data.elevations.length !== latsChunk.length) {
            throw new Error("Réponse IGN altimétrique invalide");
        }
        elevations.push(...data.elevations);
        if (start + IGN_UPSTREAM_CHUNK < lats.length) {
            await new Promise((resolve) => setTimeout(resolve, IGN_UPSTREAM_DELAY_MS));
        }
    }
    return elevations;
}

app.post("/api/ign/elevation", async (req, res) => {
    try {
        const lats = req.body?.lats;
        const lons = req.body?.lons;
        if (!Array.isArray(lats) || !Array.isArray(lons) || lats.length !== lons.length) {
            return res.status(400).json({ error: "Tableaux lats / lons invalides" });
        }
        if (lats.length === 0 || lats.length > IGN_ELEVATION_MAX_POINTS) {
            return res.status(400).json({
                error: `Entre 1 et ${IGN_ELEVATION_MAX_POINTS} points par requête`,
            });
        }
        const elevations = await fetchIgnUpstreamElevations(lats, lons);
        return res.json({ elevations });
    } catch (error) {
        console.error("[api/ign/elevation]", error);
        const message = error instanceof Error ? error.message : "Service IGN indisponible";
        return res.status(502).json({ error: message });
    }
});

/** Tuiles orthophoto IGN (WMTS PM) — évite le CORS navigateur. */
const IGN_ORTHO_LAYER = "ORTHOIMAGERY.ORTHOPHOTOS";
const IGN_ORTHO_MIN_Z = 10;
const IGN_ORTHO_MAX_Z = 19;

app.get("/api/ign/ortho-tile", async (req, res) => {
    try {
        const z = Number(req.query.z);
        const x = Number(req.query.x);
        const y = Number(req.query.y);
        if (!Number.isInteger(z) || z < IGN_ORTHO_MIN_Z || z > IGN_ORTHO_MAX_Z) {
            return res.status(400).json({ error: "Zoom ortho invalide" });
        }
        const n = 2 ** z;
        if (!Number.isInteger(x) || x < 0 || x >= n || !Number.isInteger(y) || y < 0 || y >= n) {
            return res.status(400).json({ error: "Tuile ortho invalide" });
        }
        const urlWmts =
            "https://data.geopf.fr/wmts?" +
            new URLSearchParams({
                SERVICE: "WMTS",
                REQUEST: "GetTile",
                VERSION: "1.0.0",
                LAYER: IGN_ORTHO_LAYER,
                STYLE: "normal",
                FORMAT: "image/jpeg",
                TILEMATRIXSET: "PM",
                TILEMATRIX: String(z),
                TILEROW: String(y),
                TILECOL: String(x),
            }).toString();
        const urlRest = `https://data.geopf.fr/wmts/1.0.0/${IGN_ORTHO_LAYER}/normal/PM/${z}/${y}/${x}.jpeg`;
        let response = await fetch(urlWmts);
        if (!response.ok || !(response.headers.get("content-type") || "").startsWith("image/")) {
            response = await fetch(urlRest);
        }
        if (!response.ok) {
            return res.status(502).json({ error: `Tuile IGN (${response.status})` });
        }
        const buffer = Buffer.from(await response.arrayBuffer());
        const contentType = response.headers.get("content-type") || "";
        if (!contentType.startsWith("image/") || buffer.length < 32 || buffer[0] !== 0xff) {
            return res.status(502).json({ error: "Tuile ortho IGN invalide" });
        }
        res.setHeader("Content-Type", contentType.startsWith("image/") ? contentType : "image/jpeg");
        res.setHeader("Cache-Control", "public, max-age=86400");
        return res.send(buffer);
    } catch (error) {
        console.error("[api/ign/ortho-tile]", error);
        return res.status(502).json({ error: "Orthophoto IGN indisponible" });
    }
});

/** Mapillary — panorama 360° près d’un point (token développeur requis). */
const MAPILLARY_GRAPH = "https://graph.mapillary.com";
const MAPILLARY_FIELDS =
    "id,geometry,captured_at,compass_angle,is_pano,thumb_2048_url,thumb_original_url,width,height";

function getMapillaryToken() {
    const t = process.env.MAPILLARY_ACCESS_TOKEN || process.env.MAPILLARY_TOKEN || "";
    return String(t).trim();
}

/**
 * Distance haversine approx (m).
 * @param {number} lat1
 * @param {number} lon1
 * @param {number} lat2
 * @param {number} lon2
 */
function haversineMeters(lat1, lon1, lat2, lon2) {
    const R = 6371000;
    const toRad = (d) => (d * Math.PI) / 180;
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a =
        Math.sin(dLat / 2) ** 2 +
        Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
    return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
}

/**
 * @param {string} token
 * @param {Record<string, string | number | boolean>} params
 */
async function mapillaryFetchImages(token, params) {
    const q = new URLSearchParams({
        access_token: token,
        fields: MAPILLARY_FIELDS,
        ...Object.fromEntries(
            Object.entries(params).map(([k, v]) => [k, String(v)])
        ),
    });
    const res = await fetch(`${MAPILLARY_GRAPH}/images?${q.toString()}`, {
        headers: { Accept: "application/json" },
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
        const msg =
            (data && data.error && data.error.message) ||
            `Mapillary HTTP ${res.status}`;
        const err = new Error(msg);
        err.status = res.status;
        throw err;
    }
    return Array.isArray(data?.data) ? data.data : [];
}

/**
 * Cherche un panorama Mapillary près de (lat, lon), en élargissant la zone.
 * GET /api/mapillary/nearby-pano?lat=&lon=&minDistanceM=&preferFar=1
 */
app.get("/api/mapillary/nearby-pano", async (req, res) => {
    try {
        const token = getMapillaryToken();
        if (!token) {
            return res.status(503).json({
                error:
                    "Token Mapillary manquant — ajoutez MAPILLARY_ACCESS_TOKEN dans .env (https://www.mapillary.com/dashboard/developers)",
            });
        }
        const lat = Number(req.query.lat);
        const lon = Number(req.query.lon);
        if (![lat, lon].every(Number.isFinite)) {
            return res.status(400).json({ error: "lat / lon invalides" });
        }
        const minDistanceM = Math.max(0, Number(req.query.minDistanceM) || 0);
        const preferFar = req.query.preferFar === "1" || req.query.preferFar === "true";

        /** @type {object[]} */
        let candidates = [];

        // 1) Recherche rayon 50 m (API préfère déjà les 360°).
        try {
            candidates = await mapillaryFetchImages(token, {
                lat,
                lng: lon,
                radius: 50,
                limit: 20,
            });
        } catch (e) {
            console.warn("[mapillary] radius search:", e.message || e);
        }

        // 2) Bbox de plus en plus large, panoramas seulement.
        const halfDegs = [0.002, 0.004, 0.008, 0.02, 0.04];
        for (const half of halfDegs) {
            if (candidates.some((img) => img.is_pano)) break;
            const bbox = `${lon - half},${lat - half},${lon + half},${lat + half}`;
            try {
                const more = await mapillaryFetchImages(token, {
                    bbox,
                    is_pano: true,
                    limit: 50,
                });
                candidates = candidates.concat(more);
            } catch (e) {
                console.warn("[mapillary] bbox search:", e.message || e);
            }
        }

        if (!candidates.length) {
            return res.status(404).json({
                error: "Aucune image Mapillary près de ce point (essayez une zone urbaine)",
            });
        }

        const scored = candidates
            .map((img) => {
                const g = img.geometry?.coordinates;
                const ilon = Array.isArray(g) ? Number(g[0]) : NaN;
                const ilat = Array.isArray(g) ? Number(g[1]) : NaN;
                const dist = Number.isFinite(ilat) && Number.isFinite(ilon)
                    ? haversineMeters(lat, lon, ilat, ilon)
                    : 1e9;
                return { img, dist, ilat, ilon };
            })
            .filter((row) => row.dist >= minDistanceM);

        const pool = scored.length ? scored : candidates.map((img) => ({
            img,
            dist: 0,
            ilat: lat,
            ilon: lon,
        }));

        pool.sort((a, b) => {
            const pa = a.img.is_pano ? 0 : 1;
            const pb = b.img.is_pano ? 0 : 1;
            if (pa !== pb) return pa - pb;
            if (preferFar) {
                // Préfère ~300–2500 m du centre, puis le plus proche dans cette bande.
                const score = (d) => {
                    if (d < 80) return 1e6 + d;
                    if (d > 4000) return d;
                    return Math.abs(d - 800);
                };
                return score(a.dist) - score(b.dist);
            }
            return a.dist - b.dist;
        });

        const best = pool[0];
        const thumb =
            best.img.thumb_original_url ||
            best.img.thumb_2048_url ||
            null;
        if (!thumb) {
            return res.status(404).json({ error: "Image Mapillary sans URL de téléchargement" });
        }

        return res.json({
            id: best.img.id,
            isPano: Boolean(best.img.is_pano),
            distanceM: Math.round(best.dist),
            lat: best.ilat,
            lon: best.ilon,
            compassAngle: best.img.compass_angle ?? null,
            capturedAt: best.img.captured_at ?? null,
            width: best.img.width ?? null,
            height: best.img.height ?? null,
            thumbUrl: thumb,
            proxyUrl: `/api/mapillary/image?id=${encodeURIComponent(best.img.id)}`,
            attribution: "© Mapillary contributors",
        });
    } catch (error) {
        console.error("[api/mapillary/nearby-pano]", error);
        return res.status(502).json({
            error: error instanceof Error ? error.message : "Mapillary indisponible",
        });
    }
});

/**
 * Proxy l’image Mapillary (évite CORS) — id d’image Graph API.
 */
app.get("/api/mapillary/image", async (req, res) => {
    try {
        const token = getMapillaryToken();
        if (!token) {
            return res.status(503).json({ error: "Token Mapillary manquant" });
        }
        const id = String(req.query.id || "").trim();
        if (!/^\d+$/.test(id)) {
            return res.status(400).json({ error: "id image invalide" });
        }
        const metaRes = await fetch(
            `${MAPILLARY_GRAPH}/${id}?` +
                new URLSearchParams({
                    access_token: token,
                    fields: "thumb_original_url,thumb_2048_url,is_pano",
                }).toString()
        );
        const meta = await metaRes.json().catch(() => ({}));
        if (!metaRes.ok) {
            return res.status(502).json({
                error: (meta && meta.error && meta.error.message) || "Métadonnées Mapillary",
            });
        }
        const url = meta.thumb_original_url || meta.thumb_2048_url;
        if (!url || typeof url !== "string") {
            return res.status(404).json({ error: "URL image absente" });
        }
        const imgRes = await fetch(url);
        if (!imgRes.ok) {
            return res.status(502).json({ error: `Téléchargement image (${imgRes.status})` });
        }
        const buffer = Buffer.from(await imgRes.arrayBuffer());
        const contentType = imgRes.headers.get("content-type") || "image/jpeg";
        res.setHeader("Content-Type", contentType);
        res.setHeader("Cache-Control", "public, max-age=86400");
        res.setHeader("X-Mapillary-Is-Pano", meta.is_pano ? "1" : "0");
        return res.send(buffer);
    } catch (error) {
        console.error("[api/mapillary/image]", error);
        return res.status(502).json({ error: "Image Mapillary indisponible" });
    }
});

const OSM_MAP_API_URL = "https://api.openstreetmap.org/api/0.6/map";
const OSM_FETCH_HEADERS = {
    Accept: "application/xml, application/json",
    "User-Agent": "siteperso-lab3d/1.0 (educational; contact: local-dev)",
};

/**
 * Lit les attributs XML d’une balise ouvrante.
 * @param {string} attrs
 * @returns {Record<string, string>}
 */
function parseXmlAttrs(attrs) {
    /** @type {Record<string, string>} */
    const out = {};
    const re = /([a-zA-Z_:][\w:.-]*)\s*=\s*"([^"]*)"/g;
    let m;
    while ((m = re.exec(attrs))) out[m[1]] = m[2];
    return out;
}

/**
 * Convertit le XML /api/0.6/map en éléments façon Overpass (type, tags, geometry).
 * @param {string} xml
 * @param {string[]} layers
 */
function parseOsmMapXmlToElements(xml, layers) {
    /** @type {Map<string, { lat: number, lon: number }>} */
    const nodes = new Map();
    const nodeRe = /<node\b([^>]*)\/?>/g;
    let nm;
    while ((nm = nodeRe.exec(xml))) {
        const a = parseXmlAttrs(nm[1]);
        if (!a.id || a.lat == null || a.lon == null) continue;
        const lat = Number(a.lat);
        const lon = Number(a.lon);
        if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
        nodes.set(a.id, { lat, lon });
    }

    const wantHighway = layers.includes("highway");
    const wantBuilding = layers.includes("building");
    /** @type {object[]} */
    const elements = [];
    const wayRe = /<way\b([^>]*)>([\s\S]*?)<\/way>/g;
    let wm;
    while ((wm = wayRe.exec(xml))) {
        const a = parseXmlAttrs(wm[1]);
        const body = wm[2];
        /** @type {Record<string, string>} */
        const tags = {};
        const tagRe = /<tag\b([^>]*)\/?>/g;
        let tm;
        while ((tm = tagRe.exec(body))) {
            const ta = parseXmlAttrs(tm[1]);
            if (ta.k) tags[ta.k] = ta.v ?? "";
        }
        const isHighway = Boolean(tags.highway) && tags.area !== "yes";
        const isBuilding = Boolean(tags.building) && tags.building !== "no";
        if (!(wantHighway && isHighway) && !(wantBuilding && isBuilding)) continue;

        /** @type {{ lat: number, lon: number }[]} */
        const geometry = [];
        const ndRe = /<nd\b([^>]*)\/?>/g;
        let dm;
        while ((dm = ndRe.exec(body))) {
            const da = parseXmlAttrs(dm[1]);
            const pt = da.ref ? nodes.get(da.ref) : null;
            if (pt) geometry.push({ lat: pt.lat, lon: pt.lon });
        }
        if (geometry.length < 2) continue;
        elements.push({
            type: "way",
            id: Number(a.id) || a.id,
            tags,
            geometry,
        });
    }
    return elements;
}

/**
 * Source fiable : API carte OSM (pas Overpass — souvent bloqué / saturé).
 * @param {number} south
 * @param {number} west
 * @param {number} north
 * @param {number} east
 * @param {string[]} layers
 */
async function fetchOsmMapElements(south, west, north, east, layers) {
    const area = Math.abs(north - south) * Math.abs(east - west);
    if (area > 0.24) {
        throw new Error("Zone trop grande pour l’API OSM Map — réduisez la taille du terrain");
    }
    const url =
        `${OSM_MAP_API_URL}?bbox=` +
        [west, south, east, north].map((v) => Number(v).toFixed(6)).join(",");
    const response = await fetch(url, { headers: OSM_FETCH_HEADERS });
    if (!response.ok) {
        throw new Error(`API OSM Map (${response.status})`);
    }
    const xml = await response.text();
    if (!xml || xml.length < 40 || !xml.includes("<osm")) {
        throw new Error("Réponse OSM Map invalide");
    }
    return parseOsmMapXmlToElements(xml, layers);
}

app.post("/api/osm/overpass", async (req, res) => {
    try {
        const south = Number(req.body?.south);
        const west = Number(req.body?.west);
        const north = Number(req.body?.north);
        const east = Number(req.body?.east);
        if (![south, west, north, east].every(Number.isFinite)) {
            return res.status(400).json({ error: "BBox invalide (south, west, north, east)" });
        }
        if (south >= north || west >= east) {
            return res.status(400).json({ error: "BBox incohérente" });
        }
        const latSpan = north - south;
        const lonSpan = east - west;
        if (latSpan > 0.08 || lonSpan > 0.12) {
            return res.status(400).json({ error: "Zone trop grande pour OSM — réduisez la taille du terrain" });
        }
        const queryLayers = Array.isArray(req.body?.include)
            ? req.body.include.filter((v) => v === "highway" || v === "building")
            : ["highway"];
        if (!queryLayers.length) queryLayers.push("highway");

        const elements = await fetchOsmMapElements(south, west, north, east, queryLayers);
        if (!elements.length) {
            return res.status(404).json({
                error: "Aucune route / bâtiment OSM dans cette zone — zoomez sur un quartier",
                elements: [],
            });
        }
        return res.json({ elements, source: "osm-map-api" });
    } catch (error) {
        console.error("[api/osm/overpass]", error);
        return res.status(502).json({
            error:
                error instanceof Error
                    ? error.message
                    : "Service OpenStreetMap indisponible",
        });
    }
});

/**
 * Bâtiments BD TOPO® v3 (Géoplateforme WFS) — empreintes + hauteur IGN.
 * GET /api/ign/bdtopo-buildings?south=&west=&north=&east=&count=
 */
app.get("/api/ign/bdtopo-buildings", async (req, res) => {
    try {
        const south = Number(req.query.south);
        const west = Number(req.query.west);
        const north = Number(req.query.north);
        const east = Number(req.query.east);
        if (![south, west, north, east].every(Number.isFinite)) {
            return res.status(400).json({ error: "BBox invalide (south, west, north, east)" });
        }
        if (south >= north || west >= east) {
            return res.status(400).json({ error: "BBox incohérente" });
        }
        const latSpan = north - south;
        const lonSpan = east - west;
        if (latSpan > 0.08 || lonSpan > 0.12) {
            return res.status(400).json({
                error: "Zone trop grande pour BD TOPO — réduisez la taille du terrain",
            });
        }
        const count = Math.max(1, Math.min(800, Number(req.query.count) || 500));
        const bbox = `${west},${south},${east},${north},EPSG:4326`;
        const q = new URLSearchParams({
            SERVICE: "WFS",
            VERSION: "2.0.0",
            REQUEST: "GetFeature",
            TYPENAMES: "BDTOPO_V3:batiment",
            OUTPUTFORMAT: "application/json",
            SRSNAME: "EPSG:4326",
            BBOX: bbox,
            COUNT: String(count),
        });
        const url = `https://data.geopf.fr/wfs/ows?${q.toString()}`;
        const upstream = await fetch(url, {
            headers: { Accept: "application/json" },
        });
        const text = await upstream.text();
        if (!upstream.ok) {
            let msg = `BD TOPO HTTP ${upstream.status}`;
            try {
                const j = JSON.parse(text);
                if (j?.exceptions?.[0]?.text) msg = String(j.exceptions[0].text);
            } catch {
                /* ignore */
            }
            return res.status(502).json({ error: msg });
        }
        let geo;
        try {
            geo = JSON.parse(text);
        } catch {
            return res.status(502).json({ error: "Réponse BD TOPO invalide" });
        }
        const features = Array.isArray(geo?.features) ? geo.features : [];
        return res.json({
            type: "FeatureCollection",
            features,
            count: features.length,
            source: "ign-bdtopo-wfs",
            attribution: "© IGN — BD TOPO®",
        });
    } catch (error) {
        console.error("[api/ign/bdtopo-buildings]", error);
        return res.status(502).json({
            error:
                error instanceof Error
                    ? error.message
                    : "Service BD TOPO indisponible",
        });
    }
});

app.get('/api/version', (req, res) => {
    res.json({
        ok: true,
        service: "siteperso-main-server",
        ignElevationProxy: true,
        ignOrthoTileProxy: true,
        osmOverpassProxy: true,
        ignBdTopoBuildingsProxy: true,
        simEngineBuildTag: SIM_ENGINE_BUILD_TAG,
        simUiVersion: SIM_UI_VERSION,
        simulateurDir: dirSimulateur,
        simulateAwaitFix: true,
        ngspiceDeckModuleUrl,
        ngspiceResultParserModuleUrl,
        ngspiceExecutable: ngspiceExecutablePath(),
        pid: process.pid
    });
});

/* Moteur SPICE : modules ESM chargés une seule fois (perf Render). */
const {
    loadSimEngineModules,
    preloadSimEngineModules,
} = require(path.join(__dirname, "tools", "simulate-engine-loader.cjs"));

/** buildNgspiceDeck est async (ESM) ; tolère aussi une version synchrone ancienne. */
async function invokeBuildNgspiceDeck(buildFn, state, opts) {
    const result = buildFn(state, opts);
    if (result != null && typeof result.then === "function") return await result;
    return result;
}

/** Délai exec ngspice : circuits 74HC90 / CD4511 (.tran jusqu'à ~120 s simulées). */
function ngspiceExecTimeoutMs(netlistText) {
    const text = String(netlistText || "");
    if (!/\.tran\b/i.test(text)) return 30000;
    const m = text.match(/\.tran\s+\S+\s+(\S+)/i);
    if (!m) return 90000;
    const tstop = parseFloat(m[1]);
    if (!Number.isFinite(tstop) || tstop <= 0) return 90000;
    return Math.min(180000, Math.max(15000, Math.round(tstop * 3000 + 10000)));
}

function runNgspice(netlistPath, outputPath, opts = {}) {
    const { exe, prependPath } = resolveNgspiceForServer(__dirname);
    const env = applyPathPrepend(process.env, prependPath);
    const cwd = opts.cwd || __dirname;
    const timeoutMs = opts.timeoutMs ?? 90000;
    // Linux (Docker/Render) : -i charge digital.cm copié dans le répertoire de travail.
    // Windows : pas de -i/-f (ngspice_con charge spinit du bundle).
    const args = ["-b"];
    if (opts.xspiceRc && process.platform !== "win32") {
        args.push("-i", opts.xspiceRc);
    }
    args.push("-o", outputPath, netlistPath);
    return new Promise((resolve, reject) => {
        execFile(
            exe,
            args,
            {
                windowsHide: true,
                timeout: timeoutMs,
                maxBuffer: 8 * 1024 * 1024,
                env,
                cwd,
            },
            (error, stdout, stderr) => {
                if (error) {
                    reject({
                        message: error.message,
                        code: error.code,
                        stdout: stdout || "",
                        stderr: stderr || "",
                        ngspiceExe: exe,
                    });
                    return;
                }
                resolve({ stdout: stdout || "", stderr: stderr || "" });
            }
        );
    });
}

app.get("/api/simulate", (req, res) => {
    res.status(405).json({
        ok: false,
        phase: "method",
        errors: [
            "Cette URL accepte uniquement POST (pas GET dans la barre d’adresse).",
            "Lancez « npm start », puis ouvrez http://localhost:3000/Simulateur/ et cliquez sur « Lancer Simulation ».",
        ],
    });
});

app.post("/api/simulate", async (req, res) => {
    if (
        siteAccessPasswordConfigured() &&
        siteAccessRequiresSimulateCookie() &&
        !hasSiteAccessFromCookies(req.headers.cookie)
    ) {
        return sendSiteAccessDenied(res, req);
    }
    const state = req.body?.state;
    if (
        !state ||
        typeof state !== "object" ||
        !Array.isArray(state.components) ||
        !Array.isArray(state.wires)
    ) {
        return res.status(400).json({
            ok: false,
            phase: "build",
            errors: [
                "Schéma non reçu par le serveur. Rechargez le simulateur (Ctrl+F5), puis réessayez.",
            ],
            warnings: [],
            netlist: "",
        });
    }
    let eng;
    try {
        eng = await loadSimEngineModules(__dirname);
    } catch (error) {
        res.status(500).json({
            ok: false,
            phase: "init",
            errors: ["Modules ngspice (netlist ou parseur resultats) indisponibles sur le serveur."],
            details: { message: error?.message || "" }
        });
        return;
    }
    const {
        buildNgspiceDeck,
        mergeVoltmeterMeasurements,
        mergeAmmeterMeasurements,
        mergeLedMeasurements,
        mergeLedTranPlotsFromWrdata,
        mergeLedValuesFromTranPlots,
        mergeLogicGateMeasurements,
        mergeLogicGateTranFromWrdata,
        mergeLogicGateTranPlotsFromWrdata,
        mergeOhmmeterMeasurements,
        mergeOscilloscopeMeasurements,
        deriveOscilloscopeValuesFromScopePlots,
        mergeScopePlotsFromTranWrdata,
        mergeBodePlotsFromAcWrdata,
        mergeVoltmeterRmsFromTranWrdata,
        mergeAmmeterRmsFromTranWrdata,
        mergeVoltmeterFromTranWrdata,
        mergeAmmeterFromTranWrdata,
        mergeOhmmeterFromTranWrdata,
        mergeVoltmeterTranPlotsFromWrdata,
        mergeSeg7Measurements,
        mergeSeg7FromTranWrdata,
        mergeSeg7TranPlotsFromWrdata,
        mergeBargraphMeasurements,
        mergeBargraphFromTranWrdata,
        mergeBargraphTranPlotsFromWrdata,
    } = eng;

    const gs = Number(req.body?.gridStep);
    const { exe: ngspiceExe, prependPath } = resolveNgspiceForServer(__dirname);
    const ngspiceEnv = applyPathPrepend(process.env, prependPath);
    const linuxServer = process.platform !== "win32";
    const hasXspice = await serverNgspiceHasXspice(ngspiceExe, ngspiceEnv);
    const forceAllBsource = forceBsourceFromEnv() || !hasXspice;
    const deckOpts = {
        repoRoot: __dirname,
        ngspiceExe,
        ngspiceEnv,
        // CD4511 : d_genlut plante sur ngspice apt (Render) → sources B obligatoires sous Linux.
        // Bascules D : XSPICE si le binaire le supporte ; repli B sinon.
        forceBsourceCd4511: linuxServer || forceAllBsource,
        forceBsourceDff: forceAllBsource,
        // 74HC90 : bascules JK XSPICE si disponibles (repli B automatique sinon).
        quickTran: linuxServer,
    };
    if (Number.isFinite(gs) && gs > 0) deckOpts.gridStep = gs;
    if (req.body?.liveSourceTuning === true) deckOpts.liveSourceTuning = true;
    const built = await invokeBuildNgspiceDeck(buildNgspiceDeck, state, deckOpts);
    if (!built || typeof built !== "object") {
        return res.status(500).json({
            ok: false,
            phase: "build",
            errors: [
                "Réponse netlist invalide du moteur SPICE. Redéployez le serveur (server.js + Simulateur/Engine/).",
            ],
            warnings: [],
            netlist: "",
        });
    }
    if (!built.ok) {
        const errs = Array.isArray(built.errors)
            ? built.errors.filter((e) => e != null && String(e).trim()).map(String)
            : [];
        if (!errs.length) errs.push("Impossible de générer la netlist SPICE à partir du schéma.");
        res.status(400).json({
            ok: false,
            phase: "build",
            errors: errs,
            warnings: built.warnings || [],
            netlist: built.netlist || "",
        });
        return;
    }

    const tempDir = await mkdtemp(path.join(os.tmpdir(), "sim-ngspice-"));
    const netlistPath = path.join(tempDir, "circuit.cir");
    const outputPath = path.join(tempDir, "ngspice.log");
    const wavePathFs = path.join(tempDir, "tran_waves.txt");
    const acWavePathFs = path.join(tempDir, "ac_waves.txt");

    try {
        let deckText = built.netlist;
        // Toujours chemins relatifs : ngspice tourne dans tempDir (évite espaces dans le chemin du projet).
        if (built.analysisTran && typeof deckText === "string") {
            deckText = deckText.split("__TRAN_WAVE_PATH__").join("tran_waves.txt");
        }
        if (built.analysisAc && typeof deckText === "string") {
            deckText = deckText.split("__AC_WAVE_PATH__").join("ac_waves.txt");
        }
        let xspiceRc;
        if (typeof deckText === "string" && deckText.includes(XSPICE_DIGITAL_CM_PLACEHOLDER)) {
            const digitalSrc = resolveDigitalCmSourcePath(__dirname);
            if (!digitalSrc) {
                return res.status(500).json({
                    ok: false,
                    phase: "run",
                    errors: [
                        "digital.cm introuvable (Simulateur/lib/ngspice/digital.cm). Voir Simulateur/lib/ngspice/README.txt.",
                    ],
                    warnings: built.warnings,
                    netlist: built.netlist,
                });
            }
            await copyFile(digitalSrc, path.join(tempDir, "digital.cm"));
            xspiceRc = path.join(tempDir, "ngspice-xspice.rc");
            await writeFile(xspiceRc, "codemodel digital.cm\n", "utf8");
            xspiceRc = path.basename(xspiceRc);
        }
        await writeFile(netlistPath, deckText, "utf8");
        const spiceTimeoutMs = ngspiceExecTimeoutMs(deckText);
        const runResult = await runNgspice("circuit.cir", "ngspice.log", {
            cwd: tempDir,
            xspiceRc,
            timeoutMs: spiceTimeoutMs,
        });
        let log = "";
        try {
            log = await readFileAsync(outputPath, "utf8");
        } catch {
            // Certaines variantes/runtime d'ngspice peuvent ne pas ecrire le log attendu.
        }
        const combinedLog = [log, runResult.stdout || "", runResult.stderr || ""]
            .filter((part) => typeof part === "string" && part.trim().length > 0)
            .join("\n");
        const tran = !!(/** @type {{ analysisTran?: boolean }} */ (built).analysisTran);
        const ac = !!(/** @type {{ analysisAc?: boolean }} */ (built).analysisAc);
        let voltmeterValues = mergeVoltmeterMeasurements(combinedLog, built.voltmeters, built.nodeMeasures || []);
        let ammeterValues = mergeAmmeterMeasurements(combinedLog, built.ammeters || []);
        let ledValues = mergeLedMeasurements(combinedLog, built.leds || []);
        let logicValues = mergeLogicGateMeasurements(combinedLog, built.logicGates || []);
        let ohmmeterValues = {};
        let voltmeterRmsValues = {};
        let ammeterRmsValues = {};
        let scopePlots = {};
        let bodePlots = {};
        let seg7Values = mergeSeg7Measurements(combinedLog, built.seg7Displays || []);
        let bargraphValues = mergeBargraphMeasurements(combinedLog, built.bargraphDisplays || []);
        let seg7TranPlots = {};
        let bargraphTranPlots = {};
        let logicGateTranPlots = {};
        let ledTranPlots = {};
        let voltmeterTranPlots = {};
        let speakerTranPlots = {};
        let waveDiag = "";
        if (tran) {
            let waveTxt = "";
            try {
                waveTxt = await readFileAsync(wavePathFs, "utf8");
            } catch (waveErr) {
                waveTxt = "";
                waveDiag = `[wrdata] Fichier courbes introuvable : ${waveErr?.message || waveErr}`;
            }
            const meta = Array.isArray(built.scopesTranMeta) ? built.scopesTranMeta : [];
            scopePlots = mergeScopePlotsFromTranWrdata(waveTxt, meta);
            const ledsMeta = Array.isArray(built.ledsTranMeta) ? built.ledsTranMeta : [];
            ledTranPlots = mergeLedTranPlotsFromWrdata(waveTxt, ledsMeta);
            const fromTran = mergeLedValuesFromTranPlots(ledTranPlots);
            if (Object.keys(fromTran).length > 0) ledValues = fromTran;
            const lgMeta = Array.isArray(built.logicGatesTranMeta) ? built.logicGatesTranMeta : [];
            logicGateTranPlots = mergeLogicGateTranPlotsFromWrdata(waveTxt, lgMeta);
            const fromTranLg = mergeLogicGateTranFromWrdata(waveTxt, lgMeta);
            if (Object.keys(fromTranLg).length > 0) logicValues = fromTranLg;
            const metersMeta = built.metersTranMeta || {};
            voltmeterValues = mergeVoltmeterFromTranWrdata(
                waveTxt,
                Array.isArray(metersMeta.voltmeters) ? metersMeta.voltmeters : []
            );
            voltmeterTranPlots = mergeVoltmeterTranPlotsFromWrdata(
                waveTxt,
                Array.isArray(metersMeta.voltmeters) ? metersMeta.voltmeters : []
            );
            speakerTranPlots = mergeVoltmeterTranPlotsFromWrdata(
                waveTxt,
                Array.isArray(metersMeta.speakers) ? metersMeta.speakers : []
            );
            ammeterValues = mergeAmmeterFromTranWrdata(
                waveTxt,
                Array.isArray(metersMeta.ammeters) ? metersMeta.ammeters : []
            );
            voltmeterRmsValues = mergeVoltmeterRmsFromTranWrdata(
                waveTxt,
                Array.isArray(metersMeta.voltmetersRms) ? metersMeta.voltmetersRms : []
            );
            ammeterRmsValues = mergeAmmeterRmsFromTranWrdata(
                waveTxt,
                Array.isArray(metersMeta.ammetersRms) ? metersMeta.ammetersRms : []
            );
            const seg7Meta = Array.isArray(built.seg7TranMeta) ? built.seg7TranMeta : [];
            const fromTranSeg7 = mergeSeg7FromTranWrdata(waveTxt, seg7Meta);
            if (Object.keys(fromTranSeg7).length > 0) seg7Values = fromTranSeg7;
            seg7TranPlots = mergeSeg7TranPlotsFromWrdata(waveTxt, seg7Meta);
            const bargraphMeta = Array.isArray(built.bargraphTranMeta) ? built.bargraphTranMeta : [];
            const fromTranBargraph = mergeBargraphFromTranWrdata(waveTxt, bargraphMeta);
            if (Object.keys(fromTranBargraph).length > 0) bargraphValues = fromTranBargraph;
            bargraphTranPlots = mergeBargraphTranPlotsFromWrdata(waveTxt, bargraphMeta);
            /* Diagnostic visible dans Vérification → Journal */
            const linesCnt = waveTxt ? waveTxt.split("\n").length : 0;
            const plotKeys = Object.keys(scopePlots);
            const ledPlotKeys = Object.keys(ledTranPlots);
            waveDiag = [
                `[wrdata] Fichier courbes : ${waveTxt.length} octets, ${linesCnt} lignes`,
                `[wrdata] Premières données : ${waveTxt.slice(0, 300).replace(/\r/g, "") || "(vide)"}`,
                `[wrdata] Oscilloscopes : ${plotKeys.length ? plotKeys.join(", ") : "(aucun)"}`,
                `[wrdata] LED (courant i(VIL_*)) : ${ledPlotKeys.length ? ledPlotKeys.join(", ") : "(aucun)"}`
            ].join("\n");
            const oscList = Array.isArray(built.oscilloscopes) ? built.oscilloscopes : [];
            if (oscList.length > 0 && plotKeys.length === 0) {
                const miss = oscList.map((o) => o.id).join(", ");
                built.warnings = built.warnings || [];
                built.warnings.push(
                    `Oscilloscope(s) ${miss} : aucune courbe dans tran_waves.txt. Reliez CH1, CH2 et la masse (borne du bas) ; vérifiez qu’il y a un générateur sinus/carré.`
                );
            }
        }
        if (ac) {
            let acWaveTxt = "";
            try {
                acWaveTxt = await readFileAsync(acWavePathFs, "utf8");
            } catch (acErr) {
                acWaveTxt = "";
                waveDiag = `[wrdata ac] Fichier courbes introuvable : ${acErr?.message || acErr}`;
            }
            const bodeMeta = Array.isArray(built.bodeAcMeta) ? built.bodeAcMeta : [];
            bodePlots = mergeBodePlotsFromAcWrdata(acWaveTxt, bodeMeta);
            const bodeList = Array.isArray(built.bodeAnalyzers) ? built.bodeAnalyzers : [];
            if (bodeList.length > 0 && Object.keys(bodePlots).length === 0) {
                const miss = bodeList.map((b) => b.id).join(", ");
                built.warnings = built.warnings || [];
                built.warnings.push(
                    `Analyse fréquentielle ${miss} : aucune courbe dans ac_waves.txt. Vérifiez le câblage et le générateur sinus.`
                );
            }
        }
        const ohmList = Array.isArray(built.ohmeters) ? built.ohmeters : [];
        const ohmIsoNetlist = built.ohmmeterIsolationNetlist;
        if (ohmList.length > 0 && typeof ohmIsoNetlist === "string" && ohmIsoNetlist.trim()) {
            try {
                const ohmLogPath = path.join(tempDir, "ngspice_ohm.log");
                await writeFile(path.join(tempDir, "circuit_ohm.cir"), ohmIsoNetlist, "utf8");
                const ohmRun = await runNgspice("circuit_ohm.cir", "ngspice_ohm.log", {
                    cwd: tempDir,
                    xspiceRc,
                    timeoutMs: spiceTimeoutMs,
                });
                let ohmLog = "";
                try {
                    ohmLog = await readFileAsync(ohmLogPath, "utf8");
                } catch {
                    /* pas de log ohmmètre */
                }
                const ohmCombined = [ohmLog, ohmRun.stdout || "", ohmRun.stderr || ""]
                    .filter((part) => typeof part === "string" && part.trim().length > 0)
                    .join("\n");
                ohmmeterValues = mergeOhmmeterMeasurements(ohmCombined, ohmList);
            } catch (ohmErr) {
                built.warnings = built.warnings || [];
                built.warnings.push(
                    "Ohmmètre : mesure en mode isolation impossible — vérifiez le câblage ou retirez l’ohmmètre du circuit alimenté."
                );
                ohmmeterValues = mergeOhmmeterMeasurements(combinedLog, ohmList);
            }
        }
        const oscilloscopeValues = tran
            ? deriveOscilloscopeValuesFromScopePlots(scopePlots)
            : mergeOscilloscopeMeasurements(combinedLog, built.oscilloscopes || []);
        res.json({
            ok: true,
            warnings: built.warnings,
            netlist: deckText,
            log: [combinedLog || log, waveDiag].filter(Boolean).join("\n\n--- DIAGNOSTIC COURBES ---\n"),
            voltmeterValues,
            voltmeterIds: Array.isArray(built.voltmeters) ? built.voltmeters.map((v) => v.id) : [],
            voltmeterNodes: Array.isArray(built.voltmeters) ? built.voltmeters : [],
            ammeterValues,
            ammeterIds: Array.isArray(built.ammeters) ? built.ammeters.map((a) => a.id) : [],
            ammeterBranches: Array.isArray(built.ammeters) ? built.ammeters : [],
            ledValues,
            ledIds: Array.isArray(built.leds) ? built.leds.map((l) => l.id) : [],
            ledBranches: Array.isArray(built.leds) ? built.leds : [],
            ledTranPlots,
            voltmeterTranPlots,
            speakerTranPlots,
            logicValues,
            logicIds: Array.isArray(built.logicGates) ? built.logicGates.map((g) => g.id) : [],
            logicGates: Array.isArray(built.logicGates) ? built.logicGates : [],
            voltmeterRmsValues,
            voltmeterRmsIds: Array.isArray(built.voltmetersRms)
                ? built.voltmetersRms.map((v) => v.id)
                : [],
            voltmeterRmsNodes: Array.isArray(built.voltmetersRms) ? built.voltmetersRms : [],
            ammeterRmsValues,
            ammeterRmsIds: Array.isArray(built.ammetersRms) ? built.ammetersRms.map((a) => a.id) : [],
            ammeterRmsBranches: Array.isArray(built.ammetersRms) ? built.ammetersRms : [],
            ohmmeterValues,
            ohmmeterIds: Array.isArray(built.ohmeters) ? built.ohmeters.map((o) => o.id) : [],
            ohmmeterNodes: Array.isArray(built.ohmeters) ? built.ohmeters : [],
            oscilloscopeValues,
            oscilloscopeIds: Array.isArray(built.oscilloscopes)
                ? built.oscilloscopes.map((o) => o.id)
                : [],
            oscilloscopeNodes: Array.isArray(built.oscilloscopes) ? built.oscilloscopes : [],
            analysisTran: tran,
            analysisAc: ac,
            scopePlots,
            bodePlots,
            seg7Values,
            seg7TranPlots,
            bargraphValues,
            bargraphTranPlots,
            logicGateTranPlots,
            seg7Displays: Array.isArray(built.seg7Displays) ? built.seg7Displays : [],
            bargraphDisplays: Array.isArray(built.bargraphDisplays) ? built.bargraphDisplays : [],
        });
    } catch (error) {
        const exeTried = /** @type {{ ngspiceExe?: string }} */ (error)?.ngspiceExe || ngspiceExecutablePath();
        const wrongPlatform = isNgspiceWrongPlatformBinary(exeTried);
        const missing = isNgspiceMissingError(error);
        const securityBlock = isLikelySecuritySoftwareBlock(error, exeTried);
        let logTail = "";
        try {
            logTail = await readFileAsync(outputPath, "utf8");
        } catch {
            /* pas de ngspice.log */
        }
        const tailOut = [logTail, error?.stderr, error?.stdout, error?.message]
            .filter((x) => typeof x === "string" && x.trim())
            .join("\n")
            .trim()
            .slice(-4000);
        let primary;
        if (wrongPlatform) {
            primary =
                `Binaire ngspice incompatible (${exeTried}) : un exécutable Windows (.exe) ne peut pas tourner sur ${process.platform}. ` +
                `Sur Render / Docker / Linux : définir la variable d’environnement NGSPICE=/usr/bin/ngspice (voir Dockerfile) ou installer ngspice via le système ; ne pas déployer Simulateur/bin/ngspice.exe sur le serveur. ` +
                `En local Windows : utiliser ngspice.exe dans Simulateur/bin/ ou NGSPICE vers votre installation.`;
        } else if (missing) {
            const exeBase = path.basename(String(exeTried || "")).toLowerCase().replace(/\.exe$/i, "");
            const probe = exeBase === "ngspice_con" ? "ngspice_con -v" : "ngspice -v";
            const hint = isWin32Platform()
                ? "sur Windows : place ngspice_con.exe dans Simulateur/bin/ (livré avec le projet), supprime une éventuelle variable NGSPICE=ngspice mal définie, ou pointe NGSPICE vers le chemin complet du .exe"
                : "sur Linux : installe ngspice (apt install ngspice) puis exporte NGSPICE=/usr/bin/ngspice — ne déploie pas les .exe Windows sur le serveur";
            primary = `ngspice introuvable ou non exécutable (essayé : ${exeTried}). ${hint}, puis relance npm start depuis le même terminal où « ${probe} » fonctionne.`;
        } else if (securityBlock) {
            primary =
                `Exécution de ngspice bloquée (${exeTried}). Un antivirus ou une stratégie « logiciel inconnu » (ex. Trend Micro) peut empêcher ngspice.exe : seul un administrateur informatique peut créer une exception. ` +
                `En attendant : utiliser le site hébergé en ligne (Docker / Render) où ngspice tourne sur le serveur, pas sur le PC du visiteur.`;
        } else {
            primary = `Echec d'exécution ngspice (${exeTried}).${tailOut ? `\n\n${tailOut}` : ""}`;
        }
        const attachTail = tailOut && (missing || securityBlock || wrongPlatform);
        res.status(500).json({
            ok: false,
            phase: "run",
            errors: [primary + (attachTail ? `\n\n${tailOut}` : "")],
            warnings: built.warnings,
            netlist: built.netlist,
            details: {
                message: error?.message || "",
                stdout: error?.stdout || "",
                stderr: error?.stderr || "",
                ngspiceExe: exeTried,
            },
        });
    } finally {
        await rm(tempDir, { recursive: true, force: true });
    }
});

mountArduinoRoutes(app);

const { mountSimulatorVisitRoutes } = require("./tools/simulator-visit-counter.cjs");
mountSimulatorVisitRoutes(app, __dirname);

const { mountSimulatorExamplesRoutes } = require("./tools/simulator-examples-api.cjs");
mountSimulatorExamplesRoutes(app, __dirname);

const fichePresentationPdf = path.join(__dirname, "docs", "Simulateur-fiche-presentation.pdf");
app.get("/Simulateur/fiche-presentation.pdf", (req, res) => {
    if (!fs.existsSync(fichePresentationPdf)) {
        return res.status(404).type("text/plain; charset=utf-8").send(
            "PDF non généré. Exécutez : npm run docs:simulateur-presentation-pdf"
        );
    }
    res.download(fichePresentationPdf, "Simulateur-fiche-presentation.pdf");
});

// --- 5. COMPTEUR ---
let visitCount = readJsonFileSafe("./visits.json", { count: 0 }).count || 0;
app.get('/api/counter', (req, res) => {
    visitCount++;
    fs.writeFileSync('./visits.json', JSON.stringify({ count: visitCount }));
    res.json({ count: visitCount });
});

// --- 6. AUTHENTIFICATION PROF ---
const authentificationProf = (req, res, next) => {
    if (!ADMIN_USER || !ADMIN_PASS) {
        return res.status(500).send(
            "Configuration admin manquante : définir ADMIN_USER et ADMIN_PASS dans les variables d'environnement du service (sur Render : Environment du Web Service, pas dans le Dockerfile)."
        );
    }

    const auth = req.headers.authorization;
    if (!auth) {
        res.setHeader('WWW-Authenticate', 'Basic realm="Zone Prof"');
        return res.status(401).send("Identification requise.");
    }
    const credentials = Buffer.from(auth.split(' ')[1], 'base64').toString().split(':');
    if (credentials[0] === ADMIN_USER && credentials[1] === ADMIN_PASS) return next();
    return res.status(401).send("Identifiants incorrects.");
};

// --- FONCTIONS DE SÉCURITÉ ---
// 1. Empêcher l'injection de scripts (XSS)
function escapeHtml(text) {
    if (!text) return text;
    return String(text).replace(/[&<>"']/g, function(m) {
        return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[m];
    });
}

// --- 7. ROUTES ÉLÈVES & DOCUMENTS ---
app.get('/projets.html', (req, res) => {
    const aujourdhui = new Date().toISOString().split('T')[0];
    const cartesHTML = Object.keys(planningProjets).map(p => {
        const ouvert = aujourdhui >= planningProjets[p];
        return `<a href="${ouvert ? '/'+p : '#'}" class="card" style="text-decoration:none; ${ouvert ? '' : 'opacity:0.5; cursor:not-allowed;'}">
                    <h2>${p.replace(/_/g, ' ')}</h2>
                    <p>${ouvert ? '✅ Ouvert' : '🔒 Dès le ' + planningProjets[p].split('-').reverse().join('/')}</p>
                </a>`;
    }).join('');
    res.send(`<html><head><meta charset="UTF-8"><link rel="stylesheet" href="style.css"></head><body style="background:#0f172a; color:white; font-family:sans-serif; padding:20px;"><h1>PROJETS STI2D</h1><div style="display:grid; grid-template-columns:repeat(auto-fit,minmax(250px,1fr)); gap:20px;">${cartesHTML}</div><script src="/site-access-unload.js" defer></script></body></html>`);
});

// Pages de cours
app.get('/Robotique', withProjectDateGate('Robotique', (req, res) => res.sendFile(path.join(__dirname, 'public', 'ContenuRobotique.html'))));
app.get('/UltraSon', withProjectDateGate('UltraSon', (req, res) => res.sendFile(path.join(__dirname, 'public', 'ultrason.html'))));
app.get('/Station_Meteo', withProjectDateGate('Station_Meteo', (req, res) => res.sendFile(path.join(__dirname, 'public', 'StationMeteoConnectee.html'))));
app.get('/Digicode', withProjectDateGate('Digicode', (req, res) => res.sendFile(path.join(__dirname, 'public', 'Digicode.html'))));
app.get('/Robo_Cytron_ESP32', withProjectDateGate('Robo_Cytron_ESP32', (req, res) => res.sendFile(path.join(__dirname, 'public', 'Robo_Cytron_ESP32.html'))));
app.get('/apps', (req, res) => res.sendFile(path.join(__dirname, 'public', 'apps.html')));
app.get('/docs', (req, res) => res.sendFile(path.join(__dirname, 'public', 'docs.html')));
app.get('/contact.html', (req, res) => res.sendFile(path.join(__dirname, 'public', 'contact.html')));

// Téléchargement sécurisé
app.get('/get-doc/:sousDossier/:nomFichier', (req, res) => {
    const { sousDossier, nomFichier } = req.params;
    
    // SÉCURITÉ : Empêcher de remonter dans l'arborescence (Path Traversal)
    if (sousDossier.includes('..') || nomFichier.includes('..') || nomFichier.includes('/') || nomFichier.includes('\\')) {
        return res.status(403).send("Accès interdit.");
    }

    const aujourdhui = new Date().toISOString().split('T')[0];
    const dateAcces = planningDocs[nomFichier];
    if (dateAcces && aujourdhui < dateAcces) return res.send(`<script>alert("🔒 Disponible le ${dateAcces.split('-').reverse().join('/')}"); window.history.back();</script>`);
    
    const filePath = path.join(dirDocs, sousDossier, nomFichier);
    
    // Vérifie que le fichier est bien DANS le dossier prévu
    if (filePath.startsWith(dirDocs) && fs.existsSync(filePath)) res.download(filePath);
    else res.status(404).send("Fichier introuvable ou accès refusé.");
});

// API pour masquer les boutons sur les pages de cours
app.get('/api/check-access/:nomFichier', (req, res) => {
    const aujourdhui = new Date().toISOString().split('T')[0];
    const dateAcces = planningDocs[req.params.nomFichier];
    res.json({ accessible : !dateAcces || aujourdhui >= dateAcces });
});

// --- 8. RÉCEPTION DES TP ---
app.post('/upload-tp', upload.single('tp_file'), (req, res) => {
    if (req.body.access_code !== "STI2D2026") {
        if (req.file) fs.unlinkSync(req.file.path);
        return res.send("<script>alert('Code incorrect !'); window.history.back();</script>");
    }
    res.send("<body style='background:#0f172a; color:white; text-align:center;'><h1>✅ Bien reçu !</h1><a href='/' style='color:#00d1ff;'>Retour</a></body>");
});

// --- 8b. API TCHAT ---
app.get('/api/chat', (req, res) => res.json(chatMessages.slice(-50))); // Renvoie les 50 derniers messages

app.post('/api/chat', (req, res) => {
    const { author, text, isProf } = req.body;
    if(author && text) {
        // SÉCURITÉ : Nettoyage des entrées avant enregistrement (XSS)
        const msg = { id: Date.now(), time: new Date().toLocaleTimeString('fr-FR', {hour:'2-digit', minute:'2-digit'}), author: escapeHtml(author), text: escapeHtml(text), isProf: !!isProf };
        chatMessages.push(msg);
        if(chatMessages.length > 200) chatMessages.shift(); // Garde l'historique propre
        fs.writeFileSync('./chat_messages.json', JSON.stringify(chatMessages));
        res.json({success: true});
    } else res.status(400).json({error: "Données manquantes"});
});

// --- 8c. API ENVOI EMAIL ---
app.post('/api/send-email', async (req, res) => {
    const { name, email, message } = req.body;

    // Configuration de l'envoi (Gmail)
    // ⚠️ Remplacez le mot de passe ci-dessous par votre "Mot de passe d'application" Gmail
    // (https://myaccount.google.com/apppasswords)
    const transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: {
            user: 'manuel.hadot@gmail.com', // Votre adresse Gmail
            pass: process.env.GMAIL_PASS || 'krazgfcgsuusibbx' // Utilise la variable d'environnement si disponible
        }
    });

    const mailOptions = {
        from: '"Site STI2D" <manuel.hadot@gmail.com>', // L'expéditeur technique doit être votre compte pour passer les filtres Gmail
        to: 'manuel.hadot@gmail.com',
        replyTo: email, // Permet de répondre directement à l'élève en cliquant sur "Répondre"
        subject: `[Site STI2D] Nouveau message de ${name}`,
        text: `Nom: ${name}\nEmail de réponse: ${email}\n\nMessage:\n${message}`
    };

    try {
        await transporter.sendMail(mailOptions);
        res.json({ success: true });
    } catch (error) {
        console.error("Erreur envoi mail:", error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Route obscure pour récupérer le lien d'administration (cache l'URL dans le code source client)
app.post('/api/admin-door', (req, res) => {
    res.json({ url: '/espace-correction' });
});

// --- 9. ESPACE PROF (VERSION BLINDÉE) ---
// --- 9. ESPACE PROF (CORRIGÉ & OPTIMISÉ) ---
app.get('/espace-correction', authentificationProf, (req, res) => {
    // 1. Préparation de la liste des documents
    let htmlDocs = "";
    mesSousDossiersDocs.forEach(sd => {
        const chemin = path.join(dirDocs, sd);
        const fichiers = fs.existsSync(chemin) ? fs.readdirSync(chemin).filter(f => !f.startsWith('.')) : [];
        
        htmlDocs += `<div style="margin-bottom:10px; border-left:3px solid #00d1ff; padding-left:10px;">
                        <b style="color:#00d1ff; font-size:0.9rem;">📁 ${sd}</b>`;
        if (fichiers.length === 0) htmlDocs += `<p style="color:#666; font-size:0.7rem;">(Vide)</p>`;
        else {
            fichiers.forEach(f => {
                htmlDocs += `<div style="display:flex; justify-content:space-between; align-items:center; margin-top:4px; background:#333; padding:4px; border-radius:3px;">
                                <span style="font-size:0.8rem; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; max-width:200px;" title="${escapeHtml(f)}">${escapeHtml(f)}</span>
                                <input type="date" name="${f}" value="${planningDocs[f] || ''}" style="font-size:0.7rem;">
                             </div>`;
            });
        }
        htmlDocs += `</div>`;
    });

    // 2. Génération du tableau des élèves (SORTI DE LA BOUCLE PRÉCÉDENTE)
    let htmlEleves = "";
    for (let classe in baseEleves) {
        htmlEleves += `
        <div style="margin-top:20px; background:#222; padding:15px; border-radius:8px;">
            <h3 style="color:#10b981; margin-top:0;">📊 Classe : ${classe}</h3>
            <table style="width:100%; border-collapse:collapse; color:white; font-size:0.9rem;">
                <thead>
                    <tr style="background:#00d1ff; color:black;">
                        <th style="padding:8px; text-align:left;">Nom</th>
                        <th style="padding:8px; text-align:left;">Prénom</th>
                        <th style="padding:8px; text-align:center;">Code Accès</th>
                        <th style="padding:8px; text-align:left;">Notes Quiz</th>
                        <th style="padding:8px; text-align:center;">Action</th>
                    </tr>
                </thead>
                <tbody>`;

        const sortedEleves = [...(baseEleves[classe] || [])].sort((a, b) => {
            const an = String(a?.nom || "");
            const bn = String(b?.nom || "");
            const ap = String(a?.prenom || "");
            const bp = String(b?.prenom || "");
            // Ordre alphabétique "professionnel" : nom puis prénom, insensible à la casse.
            const byNom = an.localeCompare(bn, "fr", { sensitivity: "base" });
            if (byNom !== 0) return byNom;
            const byPrenom = ap.localeCompare(bp, "fr", { sensitivity: "base" });
            if (byPrenom !== 0) return byPrenom;
            return String(a?.code || "").localeCompare(String(b?.code || ""), "fr", { sensitivity: "base" });
        });

        sortedEleves.forEach((e, index) => {
            let notesStr = Object.entries(e.notes).length > 0 
                ? Object.entries(e.notes).map(([q, n]) => `
                    <span style="display:inline-block; background:#444; padding:2px 5px; border-radius:4px; margin-right:5px; margin-bottom:2px;">
                        ${escapeHtml(q)}: <b>${n}/20</b>
                        <form action="/admin/supprimer-note" method="POST" style="display:inline;">
                            <input type="hidden" name="classe" value="${classe}">
                            <input type="hidden" name="code" value="${e.code}">
                            <input type="hidden" name="quiz" value="${q}">
                            <button type="submit" style="background:none; border:none; color:#ef4444; cursor:pointer; font-weight:bold; margin-left:5px; font-size:0.8rem;" title="Supprimer cette note">×</button>
                        </form>
                    </span>`).join(' ')
                : `<span style="color:#666;">Aucune note</span>`;
            
            htmlEleves += `
                <tr
                    style="background:${index % 2 === 0 ? '#1a1a1a' : '#252525'}; border-bottom:1px solid #333; cursor:pointer;"
                    onclick="openEditEleve(event, '${escapeJsString(classe)}', '${escapeJsString(e.code)}', '${escapeJsString(e.nom)}', '${escapeJsString(e.prenom)}')"
                    title="Clique pour modifier cet élève"
                >
                    <td style="padding:8px;">${escapeHtml(e.nom)}</td>
                    <td style="padding:8px;">${escapeHtml(e.prenom)}</td>
                    <td style="padding:8px; text-align:center; font-family:monospace; color:#00d1ff;">${escapeHtml(e.code)}</td>
                    <td style="padding:8px;">${notesStr}</td>
                    <td style="padding:8px; text-align:center;">
                        <form action="/admin/supprimer-eleve" method="POST" onsubmit="return confirm('Supprimer définitivement cet élève ?');">
                            <input type="hidden" name="classe" value="${classe}">
                            <input type="hidden" name="code" value="${e.code}">
                            <button type="submit" style="background:#ef4444; color:white; border:none; padding:5px 10px; border-radius:3px; cursor:pointer;" title="Supprimer l'élève">🗑️</button>
                        </form>
                    </td>
                </tr>`;
        });
        htmlEleves += `</tbody></table></div>`;
    }

    // 3. Envoi du HTML final
    res.send(`
    <html lang="fr">
    <head><meta charset="UTF-8"><title>Admin STI2D</title></head>
    <body style="background:#121212; color:white; font-family:sans-serif; padding:20px;">
        <h1 style="margin-bottom:20px; border-bottom:2px solid #00d1ff; padding-bottom:10px;">👩‍🏫 Gestion Professeur</h1>
        
        <div style="background:#1e293b; padding:15px; border-radius:10px; border:1px solid #00d1ff; margin-bottom:20px; display:flex; justify-content:space-between; align-items:center;">
            <h2 style="margin:0; color:#00d1ff; font-size:1.2rem;">🧩 Générateur de QCM</h2>
            <a href="/admin/export-csv" style="background:#eab308; color:#0f172a; text-decoration:none; padding:10px 20px; border-radius:5px; font-weight:bold;">📊 Exporter les Notes (.csv)</a>
            <a href="/admin/backup-zip" style="background:#f97316; color:white; text-decoration:none; padding:10px 20px; border-radius:5px; font-weight:bold; margin-left:10px;">💾 SAUVEGARDE TOTALE (.zip)</a>
            <form action="/admin/restore-zip" method="POST" enctype="multipart/form-data" style="display:inline-flex; align-items:center; gap:8px; margin-left:10px; flex-wrap:wrap;" onsubmit="return confirm('Remplacer les données actuelles (élèves, dates, quiz, tchat…) par ce ZIP ?');">
                <input type="file" name="backup" accept=".zip,application/zip" required style="color:#e2e8f0; max-width:220px;">
                <button type="submit" style="background:#a855f7; color:white; border:none; padding:10px 20px; border-radius:5px; font-weight:bold; cursor:pointer;">♻️ RESTAURER (.zip)</button>
            </form>
            <a href="/gestion-quiz" style="background:#00d1ff; color:#0f172a; text-decoration:none; padding:10px 20px; border-radius:5px; font-weight:bold;">🛠️ Créer / Modifier un Quiz</a>
            <a href="/contact.html?prof=1" target="_blank" style="background:#10b981; color:white; text-decoration:none; padding:10px 20px; border-radius:5px; font-weight:bold; margin-left:10px;">💬 Accéder au Tchat</a>
        </div>
        <p style="color:#94a3b8; font-size:0.85rem; margin:-8px 0 20px;">Après un redéploiement Render : téléchargez d’abord le ZIP de sauvegarde, puis utilisez <b>Restaurer</b> avec ce même fichier pour récupérer élèves, dates, quiz et tchat.</p>

        <div style="display:grid; grid-template-columns: 1fr 1fr 1fr; gap:20px;">
            <section style="background:#1e1e1e; padding:15px; border-radius:10px;">
                <h2 style="font-size:1.1rem; border-bottom:1px solid #333; padding-bottom:5px;">🗓️ Dates Projets</h2>
                <form action="/update-dates" method="POST">
                    ${Object.keys(planningProjets).map(p => `
                        <div style="margin-bottom:10px;">
                            <label style="font-size:0.8rem; color:#bbb;">${p}</label>
                            <input type="date" name="${p}" value="${planningProjets[p]}" style="width:100%; padding:5px; margin-top:3px; background:#333; color:white; border:1px solid #444;">
                        </div>`).join('')}
                    <button type="submit" style="width:100%; background:#00c2ff; border:none; padding:10px; border-radius:5px; font-weight:bold; cursor:pointer;">💾 Sauvegarder Projets</button>
                </form>
            </section>

            <section style="background:#1e1e1e; padding:15px; border-radius:10px; border:1px solid #00d1ff;">
                <h2 style="font-size:1.1rem; color:#00d1ff; border-bottom:1px solid #333; padding-bottom:5px;">📄 Dates Documents</h2>
                <form action="/update-docs-dates" method="POST">
                    <div style="max-height:400px; overflow-y:auto;">${htmlDocs}</div>
                    <button type="submit" style="width:100%; background:#10b981; color:white; border:none; padding:10px; border-radius:5px; font-weight:bold; cursor:pointer; margin-top:10px;">💾 Sauvegarder Docs</button>
                </form>
            </section>

            <section style="background:#1e1e1e; padding:15px; border-radius:10px;">
                <h2 style="font-size:1.1rem; border-bottom:1px solid #333; padding-bottom:5px;">📥 Travaux reçus</h2>
                <div style="max-height:500px; overflow-y:auto;">
                    ${Object.keys(planningProjets).map(p => {
                        const copies = fs.existsSync(path.join(dirUploads, p)) ? fs.readdirSync(path.join(dirUploads, p)).filter(f => !f.startsWith('.')) : [];
                        return `<div style="margin-bottom:10px;">
                                    <b style="color:#10b981; font-size:0.9rem;">${p} (${copies.length})</b>
                                    <ul style="font-size:0.75rem; padding-left:15px; margin:5px 0; color:#aaa;">
                                        ${copies.map(c => {
                                            // Lien sécurisé pour le téléchargement
                                            return `<li style="margin-bottom:3px;">
                                                <a href="/download-copie/${p}/${c}" style="color:#00d1ff; text-decoration:none;">${escapeHtml(c)}</a>
                                            </li>`;
                                        }).join('')}
                                    </ul>
                                </div>`;
                    }).join('')}
                </div>
            </section>

            <section style="background:#1e1e1e; padding:20px; border-radius:10px; grid-column: 1 / -1; border-top: 4px solid #10b981;">
                <h2 style="color:#10b981; margin-top:0;">👥 Inscription des Élèves</h2>
                <form action="/admin/ajouter-eleve" method="POST" style="display:flex; gap:10px; flex-wrap:wrap; background:#111; padding:15px; border-radius:8px;">
                    <select name="classe" required style="padding:8px; border-radius:4px; border:none; background:#333; color:white; cursor:pointer;">
                        <option value="" disabled selected>Choisir une classe...</option>
                        ${mesClasses.map(c => `<option value="${c}">${c.replace(/_/g, ' ')}</option>`).join('')}
                    </select>
                    <input type="text" name="nom" placeholder="NOM" required style="padding:8px; border-radius:4px; border:none; background:#333; color:white;">
                    <input type="text" name="prenom" placeholder="Prénom" required style="padding:8px; border-radius:4px; border:none; background:#333; color:white;">
                    <input type="text" name="code" placeholder="Code (ex: JD123)" required style="padding:8px; border-radius:4px; border:none; background:#333; color:white;">
                    <button type="submit" style="background:#10b981; color:white; border:none; padding:8px 20px; border-radius:4px; font-weight:bold; cursor:pointer;">➕ Ajouter l'élève</button>
                </form>
                <!-- Modal édition : déclenchée par clic sur la ligne -->
                <div id="edit-eleve-modal" style="display:none; position:fixed; inset:0; background:rgba(0,0,0,0.6); z-index:99999; align-items:center; justify-content:center;">
                    <form action="/admin/modifier-eleve" method="POST" style="width:420px; background:#0f172a; border:1px solid #00d1ff; border-radius:10px; padding:16px; display:grid; gap:10px;">
                        <h3 style="margin:0; color:#00d1ff;">✏️ Modifier un élève</h3>
                        <input type="hidden" name="classe" id="edit-classe">
                        <input type="hidden" name="codeOriginal" id="edit-code-original">
                        <label style="display:grid; gap:4px; font-size:0.85rem; color:#e2e8f0;">
                            Nom
                            <input type="text" name="nom" id="edit-nom" required style="width:100%; padding:8px; background:#111827; border:1px solid #334155; border-radius:6px; color:white;">
                        </label>
                        <label style="display:grid; gap:4px; font-size:0.85rem; color:#e2e8f0;">
                            Prénom
                            <input type="text" name="prenom" id="edit-prenom" required style="width:100%; padding:8px; background:#111827; border:1px solid #334155; border-radius:6px; color:white;">
                        </label>
                        <label style="display:grid; gap:4px; font-size:0.85rem; color:#e2e8f0;">
                            Code accès (pour notes)
                            <input type="text" name="code" id="edit-code" required style="width:100%; padding:8px; background:#111827; border:1px solid #334155; border-radius:6px; color:white; font-family:monospace;">
                        </label>
                        <div style="display:flex; gap:10px; margin-top:6px;">
                            <button type="submit" style="flex:1; background:#10b981; color:white; border:none; padding:10px; border-radius:6px; font-weight:bold; cursor:pointer;">Enregistrer</button>
                            <button type="button" onclick="closeEditEleve()" style="flex:1; background:#334155; color:white; border:none; padding:10px; border-radius:6px; font-weight:bold; cursor:pointer;">Annuler</button>
                        </div>
                    </form>
                </div>

                <script>
                    function openEditEleve(event, classe, code, nom, prenom) {
                        // Évite d’ouvrir l’édition si l’on clique dans une zone de formulaire (ex: suppression)
                        if (event?.target?.closest && event.target.closest('form')) return;
                        const modal = document.getElementById('edit-eleve-modal');
                        if (!modal) return;
                        document.getElementById('edit-classe').value = classe;
                        document.getElementById('edit-code-original').value = code;
                        document.getElementById('edit-nom').value = nom;
                        document.getElementById('edit-prenom').value = prenom;
                        document.getElementById('edit-code').value = code;
                        modal.style.display = 'flex';
                    }
                    function closeEditEleve() {
                        const modal = document.getElementById('edit-eleve-modal');
                        if (modal) modal.style.display = 'none';
                    }
                </script>
                ${htmlEleves || "<p style='color:#666; margin-top:20px;'>Aucun élève inscrit pour le moment.</p>"}
            </section>
        </div>
    </body>
    </html>`);
});

// --- ROUTES DE SAUVEGARDE ---
app.post('/update-dates', authentificationProf, (req, res) => {
    planningProjets = Object.assign(planningProjets, req.body);
    fs.writeFileSync('./planning_projets.json', JSON.stringify(planningProjets));
    res.send("<script>alert('Dates Projets sauvegardées !'); window.location='/espace-correction';</script>");
});

app.post('/update-docs-dates', authentificationProf, (req, res) => {
    planningDocs = Object.assign(planningDocs, req.body);
    fs.writeFileSync('./planning_docs.json', JSON.stringify(planningDocs));
    res.send("<script>alert('Dates Documents sauvegardées !'); window.location='/espace-correction';</script>");
});

app.get('/download-copie/:projet/:file', authentificationProf, (req, res) => {
    const { projet, file } = req.params;
    // SÉCURITÉ : Empêcher le Path Traversal dans l'espace prof
    if (file.includes('..') || file.includes('/') || file.includes('\\') || projet.includes('..')) {
        return res.status(403).send("Accès interdit.");
    }
    res.download(path.join(dirUploads, projet, file));
});

// Route pour exporter les notes en CSV (Excel)
app.get('/admin/export-csv', authentificationProf, (req, res) => {
    let csvContent = "Classe;Nom;Prénom;Code;Moyenne;Détail_Notes\n";
    
    for (let classe in baseEleves) {
        baseEleves[classe].forEach(e => {
            const notes = Object.values(e.notes);
            const moyenne = notes.length > 0 ? (notes.reduce((a, b) => a + b, 0) / notes.length).toFixed(2) : "N/A";
            const detail = Object.entries(e.notes).map(([k, v]) => `${k}:${v}`).join('|');
            csvContent += `${classe};${e.nom};${e.prenom};${e.code};${moyenne.replace('.', ',')};${detail}\n`;
        });
    }

    res.header('Content-Type', 'text/csv; charset=utf-8');
    res.attachment('notes_eleves.csv');
    res.send('\uFEFF' + csvContent); // \uFEFF force Excel à lire en UTF-8 (accents)
});

// Route pour télécharger une SAUVEGARDE COMPLÈTE (Backup ZIP)
app.get('/admin/backup-zip', authentificationProf, (req, res) => {
    const archive = archiver('zip', { zlib: { level: 9 } });
    
    res.attachment(`BACKUP_STI2D_${new Date().toISOString().slice(0,10)}.zip`);

    archive.on('error', (err) => res.status(500).send({ error: err.message }));
    archive.pipe(res);

    BACKUP_JSON_FILES.forEach(file => {
        if (fs.existsSync(file)) archive.file(file, { name: file });
    });

    archive.finalize();
});

app.post("/admin/restore-zip", authentificationProf, (req, res) => {
    uploadBackupZip.single("backup")(req, res, (err) => {
        if (err) return res.send(adminAlertRedirect(err.message || "Upload invalide."));
        try {
            if (!req.file || !req.file.buffer) {
                return res.send(adminAlertRedirect("Aucun fichier ZIP sélectionné."));
            }
            const extracted = extractAllowedFilesFromZip(req.file.buffer, BACKUP_JSON_FILES);
            const restored = [];
            for (const fileName of BACKUP_JSON_FILES) {
                const raw = extracted[fileName];
                if (!raw) continue;
                applyBackupJsonFile(fileName, parseJsonText(raw.toString("utf8")));
                restored.push(fileName);
            }
            if (restored.length === 0) {
                return res.send(adminAlertRedirect("Aucun fichier de sauvegarde reconnu dans ce ZIP."));
            }
            return res.send(adminAlertRedirect("Restauration OK : " + restored.join(", ")));
        } catch (e) {
            return res.send(adminAlertRedirect(e.message || "Restauration impossible."));
        }
    });
});

// --- ROUTES GESTION QUIZ ---

// 1. API pour uploader une image de question
app.post('/api/upload-asset', authentificationProf, uploadQuiz.single('file'), (req, res) => {
    if (req.file) res.json({ url: '/quiz-assets/' + req.file.filename });
    else res.status(500).json({ error: "Erreur upload" });
});

// 2. API pour sauvegarder un quiz
app.post('/api/save-quiz', authentificationProf, (req, res) => {
    const { id, title, questions } = req.body;
    const quizId = id || 'quiz_' + Date.now();
    quizzes[quizId] = { id: quizId, title, questions, date: new Date().toISOString().split('T')[0] };
    fs.writeFileSync('./quizzes.json', JSON.stringify(quizzes, null, 2));
    res.json({ success: true, id: quizId });
});

// 3. API pour récupérer la liste des quiz (Public pour l'index, ou Prof)
app.get('/api/list-quizzes', (req, res) => {
    const list = Object.values(quizzes).map(q => ({ id: q.id, title: q.title, count: q.questions.length }));
    res.json(list);
});

// 4. API pour récupérer un quiz complet (Client)
app.get('/api/get-quiz/:id', (req, res) => {
    const q = quizzes[req.params.id];
    if (q) res.json(q);
    else res.status(404).json({ error: "Quiz introuvable" });
});

// 5. API pour supprimer un quiz
app.post('/api/delete-quiz', authentificationProf, (req, res) => {
    const { id } = req.body;
    if (quizzes[id]) {
        delete quizzes[id];
        fs.writeFileSync('./quizzes.json', JSON.stringify(quizzes, null, 2));
    }
    res.json({ success: true });
});

// 6. Interface Graphique de création de Quiz
app.get('/gestion-quiz', authentificationProf, (req, res) => {
    res.send(`
    <!DOCTYPE html>
    <html lang="fr">
    <head>
        <meta charset="UTF-8">
        <title>Éditeur de Quiz</title>
        <style>
            body { background:#0f172a; color:white; font-family:sans-serif; padding:20px; max-width:1000px; margin:auto; }
            .header { display:flex; justify-content:space-between; align-items:center; border-bottom:2px solid #00d1ff; padding-bottom:15px; margin-bottom:20px; }
            .btn { padding:10px 15px; border:none; border-radius:5px; cursor:pointer; font-weight:bold; }
            .btn-primary { background:#00d1ff; color:#0f172a; }
            .btn-danger { background:#ef4444; color:white; }
            .btn-success { background:#10b981; color:white; }
            .quiz-item { background:#1e293b; padding:15px; margin-bottom:10px; border-radius:8px; display:flex; justify-content:space-between; align-items:center; }
            .question-box { background:#334155; padding:15px; margin-bottom:15px; border-radius:8px; border-left:4px solid #00d1ff; }
            input[type="text"] { width:100%; padding:8px; margin:5px 0; background:#1e293b; border:1px solid #475569; color:white; border-radius:4px; }
            input[type="file"] { margin-top:5px; }
        </style>
    </head>
    <body>
        <div class="header">
            <h1>🛠️ Éditeur de Quiz</h1>
            <a href="/espace-correction" style="color:#00d1ff;">Retour Dashboard</a>
        </div>

        <div id="list-view">
            <button class="btn btn-success" onclick="createNew()">+ NOUVEAU QUIZ</button>
            <div id="quiz-list" style="margin-top:20px;"></div>
        </div>

        <div id="editor-view" style="display:none;">
            <input type="text" id="quiz-title" placeholder="Titre du Quiz (ex: Évaluation Réseaux)" style="font-size:1.5rem; margin-bottom:20px;">
            <div id="questions-container"></div>
            <button class="btn btn-primary" onclick="addQuestion()">+ Ajouter une question</button>
            <div style="margin-top:20px; border-top:1px solid #333; padding-top:20px;">
                <button class="btn btn-success" onclick="saveQuiz()">💾 ENREGISTRER LE QUIZ</button>
                <button class="btn btn-danger" onclick="cancelEdit()">Annuler</button>
            </div>
        </div>

        <script>
            let currentQuiz = { id: null, questions: [] };
            const API_URL = '/api';

            async function loadList() {
                const res = await fetch(API_URL + '/list-quizzes');
                const list = await res.json();
                document.getElementById('quiz-list').innerHTML = list.map(q => 
                    \`<div class="quiz-item">
                        <div><strong>\${q.title}</strong> (\${q.count} questions)</div>
                        <div>
                            <button class="btn btn-primary" onclick="editQuiz('\${q.id}')">Modifier</button>
                            <button class="btn btn-danger" onclick="deleteQuiz('\${q.id}')">Suppr</button>
                        </div>
                    </div>\`
                ).join('');
            }

            function createNew() {
                currentQuiz = { id: null, title: "", questions: [] };
                renderEditor();
                document.getElementById('list-view').style.display = 'none';
                document.getElementById('editor-view').style.display = 'block';
            }

            async function editQuiz(id) {
                const res = await fetch(API_URL + '/get-quiz/' + id);
                currentQuiz = await res.json();
                document.getElementById('quiz-title').value = currentQuiz.title;
                renderEditor();
                document.getElementById('list-view').style.display = 'none';
                document.getElementById('editor-view').style.display = 'block';
            }

            function renderEditor() {
                const container = document.getElementById('questions-container');
                container.innerHTML = "";
                currentQuiz.questions.forEach((q, idx) => {
                    container.innerHTML += \`
                    <div class="question-box" id="q-box-\${idx}">
                        <div style="display:flex; justify-content:space-between;">
                            <h3>Question \${idx + 1}</h3>
                            <button class="btn btn-danger" style="padding:2px 8px;" onclick="removeQuestion(\${idx})">X</button>
                        </div>
                        <input type="text" placeholder="Intitulé de la question" value="\${q.text}" onchange="updateQ(\${idx}, 'text', this.value)">
                        
                        <div style="margin:10px 0; background:#222; padding:10px; border-radius:4px;">
                            <label>📷 Image (optionnel) : </label>
                            \${q.image ? \`<img src="\${q.image}" height="50" style="vertical-align:middle; margin-right:10px;">\` : ''}
                            <input type="file" onchange="uploadImage(\${idx}, this)">
                        </div>

                        <div style="display:grid; grid-template-columns: 1fr 1fr; gap:10px;">
                            \${[0,1,2].map(i => \`
                                <div>
                                    <input type="radio" name="correct-\${idx}" \${q.correct == i ? 'checked' : ''} onclick="updateQ(\${idx}, 'correct', \${i})">
                                    <input type="text" placeholder="Réponse \${i+1}" value="\${q.answers[i] || ''}" onchange="updateAns(\${idx}, \${i}, this.value)" style="width:85%">
                                </div>
                            \`).join('')}
                        </div>
                    </div>\`;
                });
            }

            function addQuestion() {
                currentQuiz.questions.push({ text: "", answers: ["", "", ""], correct: 0, image: null });
                renderEditor();
            }

            function removeQuestion(idx) {
                currentQuiz.questions.splice(idx, 1);
                renderEditor();
            }

            function updateQ(idx, field, val) { currentQuiz.questions[idx][field] = val; }
            function updateAns(qIdx, aIdx, val) { currentQuiz.questions[qIdx].answers[aIdx] = val; }

            async function uploadImage(idx, input) {
                if(!input.files[0]) return;
                const formData = new FormData();
                formData.append('file', input.files[0]);
                const res = await fetch('/api/upload-asset', { method: 'POST', body: formData });
                const data = await res.json();
                currentQuiz.questions[idx].image = data.url;
                renderEditor();
            }

            async function saveQuiz() {
                const title = document.getElementById('quiz-title').value;
                if(!title) return alert("Veuillez mettre un titre !");
                
                await fetch('/api/save-quiz', {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({ id: currentQuiz.id, title, questions: currentQuiz.questions })
                });
                alert("Sauvegardé !");
                location.reload();
            }

            async function deleteQuiz(id) {
                if(confirm("Confirmer la suppression ?")) {
                    await fetch('/api/delete-quiz', {
                        method: 'POST',
                        headers: {'Content-Type': 'application/json'},
                        body: JSON.stringify({ id })
                    });
                    loadList();
                }
            }

            function cancelEdit() {
                document.getElementById('editor-view').style.display = 'none';
                document.getElementById('list-view').style.display = 'block';
            }

            loadList();
        </script>
    </body>
    </html>`);
});

// Route pour ajouter un élève (Interface Prof)
app.post('/admin/ajouter-eleve', authentificationProf, (req, res) => {
    const { classe, nom, prenom, code } = req.body;
    if (!baseEleves[classe]) baseEleves[classe] = [];
    // On nettoie les entrées au cas où (même si escapeHtml est utilisé à l'affichage)
    baseEleves[classe].push({ nom: nom.trim(), prenom: prenom.trim(), code: code.trim(), notes: {} });
    fs.writeFileSync('./eleves.json', JSON.stringify(baseEleves, null, 2));
    res.redirect('/espace-correction');
});

// Route pour supprimer un élève
app.post('/admin/supprimer-eleve', authentificationProf, (req, res) => {
    const { classe, code } = req.body;
    if (baseEleves[classe]) {
        // On ne garde que les élèves qui n'ont PAS le code sélectionné
        baseEleves[classe] = baseEleves[classe].filter(e => e.code !== code);
        
        // Si la classe est vide après suppression, on peut choisir de la supprimer aussi
        if (baseEleves[classe].length === 0) delete baseEleves[classe];
        
        fs.writeFileSync('./eleves.json', JSON.stringify(baseEleves, null, 2));
    }
    res.redirect('/espace-correction');
});

// Route pour modifier un élève (édition depuis l’interface prof)
app.post('/admin/modifier-eleve', authentificationProf, (req, res) => {
    const { classe, codeOriginal, nom, prenom, code } = req.body;
    const classeStr = String(classe || "").trim();
    const codeOrig = String(codeOriginal || "").trim();
    const nextNom = String(nom || "").trim();
    const nextPrenom = String(prenom || "").trim();
    const nextCode = String(code || "").trim();

    if (!classeStr || !codeOrig || !nextNom || !nextPrenom || !nextCode) {
        return res.redirect('/espace-correction');
    }
    if (!baseEleves[classeStr]) {
        return res.redirect('/espace-correction');
    }

    const eleve = baseEleves[classeStr].find(e => e.code === codeOrig);
    if (!eleve) {
        return res.redirect('/espace-correction');
    }

    // Si le code change, on empêche les doublons.
    if (nextCode !== codeOrig) {
        for (let c in baseEleves) {
            if (!baseEleves[c]) continue;
            const exists = baseEleves[c].some(e => e.code === nextCode);
            if (exists) return res.status(400).send("Code élève déjà utilisé.");
        }
    }

    eleve.nom = nextNom;
    eleve.prenom = nextPrenom;
    eleve.code = nextCode;

    fs.writeFileSync('./eleves.json', JSON.stringify(baseEleves, null, 2));
    res.redirect('/espace-correction');
});

// Route pour supprimer une note
app.post('/admin/supprimer-note', authentificationProf, (req, res) => {
    const { classe, code, quiz } = req.body;
    if (baseEleves[classe]) {
        let eleve = baseEleves[classe].find(e => e.code === code);
        if (eleve && eleve.notes && eleve.notes[quiz]) {
            delete eleve.notes[quiz];
            fs.writeFileSync('./eleves.json', JSON.stringify(baseEleves, null, 2));
        }
    }
    res.redirect('/espace-correction');
});

// Route API pour que le Quiz envoie la note
app.post('/api/save-note', (req, res) => {
    const { codeEleve, quizNom, note } = req.body;
    let trouve = false;

    for (let classe in baseEleves) {
        let eleve = baseEleves[classe].find(e => e.code === codeEleve);
        if (eleve) {
            eleve.notes[quizNom] = note;
            trouve = true;
            break;
        }
    }

    if (trouve) {
        fs.writeFileSync('./eleves.json', JSON.stringify(baseEleves, null, 2));
        res.json({ success: true });
    } else {
        res.status(404).json({ error: "Code élève inconnu" });
    }
});

let activePort = PORT;

async function onServerListening() {
    try {
        const { applyArduinoCliEnvironment } = require("./tools/arduino-cli-bundle.cjs");
        const arduinoEnv = await applyArduinoCliEnvironment({
            repoRoot: __dirname,
            userDataDir: path.join(os.homedir(), ".simulateur-h"),
        });
        if (arduinoEnv.ok) {
            console.log(`🛠️  arduino-cli embarqué : ${arduinoEnv.exe}`);
        }
    } catch (err) {
        console.warn("arduino-cli bundle :", err?.message || err);
    }
    preloadSimEngineModules(__dirname);
    const { exe: ngspiceExe, prependPath } = resolveNgspiceForServer(__dirname);
    const digitalCm = resolveDigitalCmSourcePath(__dirname);
    console.log(`🔬 Simulateur ngspice : ${ngspiceExe}`);
    console.log(`🎨 Simulateur UI ${SIM_UI_VERSION} : ${dirSimulateur}`);
    console.log(`🚀 Serveur en ligne : http://localhost:${activePort}/Simulateur/`);
    if (LISTEN_HOST === "127.0.0.1" || LISTEN_HOST === "localhost") {
        console.log(
            `   ↳ Accès réseau local : définir LISTEN_HOST=0.0.0.0 puis ouvrir http://<IP-de-ce-PC>:${activePort}/Simulateur/`
        );
    } else {
        console.log(`   ↳ Écoute sur ${LISTEN_HOST} (accès LAN : http://<IP-de-ce-PC>:${activePort}/Simulateur/)`);
    }
    console.log(
        `   ↳ CD4511 / bascules XSPICE : digital.cm ${digitalCm ? "OK" : "ABSENT"} — vérifiez avec npm run check-ngspice`
    );
    import(pathToFileURL(path.join(__dirname, "Simulateur", "Engine", "ngspice-xspice-probe.mjs")).href)
        .then(async (m) => {
            const env = applyPathPrepend(process.env, prependPath);
            const xspice = await serverNgspiceHasXspice(ngspiceExe, env);
            console.log(`   ↳ XSPICE dans le binaire ngspice : ${xspice ? "oui" : "non"}`);
            if (process.platform !== "win32") {
                console.log("   ↳ CD4511 (Render/Linux) : modèle sources B (d_genlut apt incompatible)");
            }
            if (xspice && process.platform === "win32") {
                console.log("   ↳ CD4511 / bascules D : modèle XSPICE (digital.cm)");
            } else if (xspice) {
                console.log("   ↳ Bascules D / JK HC90 : XSPICE si disponible");
            } else if (forceBsourceFromEnv()) {
                console.log("   ↳ FORCE_BSOURCE=1 : modèle sources B imposé");
            } else {
                console.log("   ↳ Repli sources B (XSPICE indisponible sur ce binaire)");
            }
        })
        .catch(() => {});
    if (siteAccessPasswordConfigured()) {
        console.log('🔐 Accès site protégé : visitez n’importe quelle URL pour être redirigé vers /acces-site');
        if (siteAccessLogoutOnPageUnloadEnabled()) {
            console.log('   ↳ SITE_ACCESS_LOGOUT_ON_PAGE_UNLOAD : cookie effacé à chaque changement de page');
        }
        if (siteAccessCookieMaxAgeSecondsForSetCookie() == null) {
            console.log('   ↳ SITE_ACCESS_MAX_AGE_SEC=session : cookie jusqu’à fermeture du navigateur');
        }
    }
}

function startServer(port) {
    activePort = port;
    server.listen(port, LISTEN_HOST, onServerListening);
}

const FALLBACK_PORTS = [3000, 3010, 3020, 3030, 3040];

server.on("error", (err) => {
    if (err.code !== "EADDRINUSE" || process.env.PORT) {
        console.error(err);
        process.exit(1);
    }
    const currentIndex = FALLBACK_PORTS.indexOf(activePort);
    const nextPort = currentIndex >= 0 ? FALLBACK_PORTS[currentIndex + 1] : null;
    if (!nextPort) {
        console.error(
            "\n❌ Ports 3000–3040 occupés. Arrêtez les anciens serveurs :\n" +
                "   netstat -ano | findstr :3000\n" +
                "   taskkill /PID <pid> /F\n"
        );
        process.exit(1);
    }
    console.warn(`\n⚠️  Le port ${activePort} est déjà pris (ancien npm start ?).`);
    console.warn(`   Nouvelle tentative sur le port ${nextPort}…\n`);
    startServer(nextPort);
});

startServer(FALLBACK_PORTS[0]);