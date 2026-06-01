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

const XSPICE_DIGITAL_CM_PLACEHOLDER = "__XSPICE_DIGITAL_CM__";

const app = express();
const server = http.createServer(app); // On crée le serveur HTTP avec Express
const io = new Server(server); // On attache Socket.io au serveur HTTP

/** Render / reverse proxy HTTPS : nécessaire pour cookies Secure et req.secure. */
if (process.env.NODE_ENV === "production") {
    app.set("trust proxy", 1);
}

app.use(express.urlencoded({ extended: true }));
app.use(express.json());

/** Mot de passe « vitrine » : si SITE_ACCESS_PASSWORD est défini (ex. sur Render), tout le site exige une session cookie. */
const SITE_ACCESS_COOKIE = 'site_unlock';
const SITE_ACCESS_DEFAULT_MAX_AGE_SEC = 60 * 60 * 24 * 7; // 7 jours si SITE_ACCESS_MAX_AGE_SEC non défini

function siteAccessLogoutOnPageUnloadEnabled() {
    const v = process.env.SITE_ACCESS_LOGOUT_ON_PAGE_UNLOAD;
    return v === '1' || String(v || '').toLowerCase() === 'true';
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
    <form method="post" action="/acces-site">
      <input type="hidden" name="next" value="${escapeHtmlAttr(nextTarget)}">
      <label for="pw">Mot de passe</label>
      <input id="pw" name="password" type="password" required autocomplete="current-password" autofocus>
      <button type="submit">Entrer</button>
    </form>
  </div>
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
        if (hasSiteAccessFromCookies(req.headers.cookie)) return next();
        const dest = req.originalUrl || req.url || '/';
        const safe = isSafeSiteRedirectTarget(dest) ? dest : '/';
        return res.redirect(302, '/acces-site?next=' + encodeURIComponent(safe));
    }
    /* Simulateur : la page reste protégée en GET ; l’API POST ne dépend pas du cookie (souvent absent sur fetch). */
    if (isSimulateApiPost(req) && !siteAccessRequiresSimulateCookie()) return next();
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
let baseEleves = {};
if (fs.existsSync('./eleves.json')) baseEleves = JSON.parse(fs.readFileSync('./eleves.json'));

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
let planningProjets = { "Robotique": "2026-03-01", "UltraSon": "2026-03-01", "Station_Meteo": "2026-03-01", "Digicode": "2026-03-01", "Robo_Cytron_ESP32": "2026-03-01" };
let planningDocs = {};
let quizzes = {};
let chatMessages = [];

if (fs.existsSync('./planning_projets.json')) planningProjets = JSON.parse(fs.readFileSync('./planning_projets.json'));
if (fs.existsSync('./planning_docs.json')) planningDocs = JSON.parse(fs.readFileSync('./planning_docs.json'));
if (fs.existsSync('./quizzes.json')) quizzes = JSON.parse(fs.readFileSync('./quizzes.json'));
if (fs.existsSync('./chat_messages.json')) chatMessages = JSON.parse(fs.readFileSync('./chat_messages.json'));

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

app.use(express.static('public'));
app.use('/Simulateur', express.static(dirSimulateur));
app.use('/assets-3d', express.static(path.join(dirDocs, '3D'))); // Route pour les modèles 3D
app.get('/api/version', (req, res) => {
    res.json({
        ok: true,
        service: "siteperso-main-server",
        simEngineBuildTag: SIM_ENGINE_BUILD_TAG,
        simulateAwaitFix: true,
        ngspiceDeckModuleUrl,
        ngspiceResultParserModuleUrl,
        ngspiceExecutable: ngspiceExecutablePath(),
        pid: process.pid
    });
});

/* Rechargement dynamique : `import(file://…?t=…)` évite le cache ESM de Node sans passer
   par une data: URI (certaines versions / politiques peuvent refuser ou limiter ces imports). */

/** @param {string} filePath chemin absolu du module .js à importer à chaud */
async function importFresh(filePath) {
    const url = `${pathToFileURL(path.resolve(filePath)).href}?t=${Date.now()}&r=${Math.random()}`;
    return import(url);
}

const ngspiceDeckModulePath       = path.join(__dirname, "Simulateur", "Engine", "spice-netlist-v2.mjs");
const ngspiceResultParserModulePath = path.join(__dirname, "Simulateur", "Engine", "v2", "result-parser.mjs");

async function getBuildNgspiceDeck() {
    const module = await importFresh(ngspiceDeckModulePath);
    if (typeof module.buildNgspiceDeck !== "function")
        throw new Error("Module buildNgspiceDeck introuvable.");
    return module.buildNgspiceDeck;
}

/** buildNgspiceDeck est async (ESM) ; tolère aussi une version synchrone ancienne. */
async function invokeBuildNgspiceDeck(buildFn, state, opts) {
    const result = buildFn(state, opts);
    if (result != null && typeof result.then === "function") return await result;
    return result;
}

async function getMergeVoltmeterMeasurements() {
    const module = await importFresh(ngspiceResultParserModulePath);
    if (typeof module.mergeVoltmeterMeasurements !== "function")
        throw new Error("Module mergeVoltmeterMeasurements introuvable.");
    return module.mergeVoltmeterMeasurements;
}

async function getMergeAmmeterMeasurements() {
    const module = await importFresh(ngspiceResultParserModulePath);
    if (typeof module.mergeAmmeterMeasurements !== "function")
        throw new Error("Module mergeAmmeterMeasurements introuvable.");
    return module.mergeAmmeterMeasurements;
}

async function getMergeLedMeasurements() {
    const module = await importFresh(ngspiceResultParserModulePath);
    if (typeof module.mergeLedMeasurements !== "function")
        throw new Error("Module mergeLedMeasurements introuvable.");
    return module.mergeLedMeasurements;
}

async function getMergeSeg7Measurements() {
    const module = await importFresh(ngspiceResultParserModulePath);
    if (typeof module.mergeSeg7Measurements !== "function")
        throw new Error("Module mergeSeg7Measurements introuvable.");
    return module.mergeSeg7Measurements;
}

async function getMergeSeg7FromTranWrdata() {
    const module = await importFresh(ngspiceResultParserModulePath);
    if (typeof module.mergeSeg7FromTranWrdata !== "function")
        throw new Error("Module mergeSeg7FromTranWrdata introuvable.");
    return module.mergeSeg7FromTranWrdata;
}

async function getMergeLedTranPlotsFromWrdata() {
    const module = await importFresh(ngspiceResultParserModulePath);
    if (typeof module.mergeLedTranPlotsFromWrdata !== "function")
        throw new Error("Module mergeLedTranPlotsFromWrdata introuvable.");
    return module.mergeLedTranPlotsFromWrdata;
}

async function getMergeLedValuesFromTranPlots() {
    const module = await importFresh(ngspiceResultParserModulePath);
    if (typeof module.mergeLedValuesFromTranPlots !== "function")
        throw new Error("Module mergeLedValuesFromTranPlots introuvable.");
    return module.mergeLedValuesFromTranPlots;
}

async function getMergeLogicGateMeasurements() {
    const module = await importFresh(ngspiceResultParserModulePath);
    if (typeof module.mergeLogicGateMeasurements !== "function")
        throw new Error("Module mergeLogicGateMeasurements introuvable.");
    return module.mergeLogicGateMeasurements;
}

async function getMergeLogicGateTranFromWrdata() {
    const module = await importFresh(ngspiceResultParserModulePath);
    if (typeof module.mergeLogicGateTranFromWrdata !== "function")
        throw new Error("Module mergeLogicGateTranFromWrdata introuvable.");
    return module.mergeLogicGateTranFromWrdata;
}

async function getMergeOhmmeterMeasurements() {
    const module = await importFresh(ngspiceResultParserModulePath);
    if (typeof module.mergeOhmmeterMeasurements !== "function")
        throw new Error("Module mergeOhmmeterMeasurements introuvable.");
    return module.mergeOhmmeterMeasurements;
}

async function getMergeOscilloscopeMeasurements() {
    const module = await importFresh(ngspiceResultParserModulePath);
    if (typeof module.mergeOscilloscopeMeasurements !== "function")
        throw new Error("Module mergeOscilloscopeMeasurements introuvable.");
    return module.mergeOscilloscopeMeasurements;
}

async function getMergeScopePlotsFromTranWrdata() {
    const module = await importFresh(ngspiceResultParserModulePath);
    if (typeof module.mergeScopePlotsFromTranWrdata !== "function")
        throw new Error("Module mergeScopePlotsFromTranWrdata introuvable.");
    return module.mergeScopePlotsFromTranWrdata;
}

async function getDeriveOscilloscopeValuesFromScopePlots() {
    const module = await importFresh(ngspiceResultParserModulePath);
    if (typeof module.deriveOscilloscopeValuesFromScopePlots !== "function")
        throw new Error("Module deriveOscilloscopeValuesFromScopePlots introuvable.");
    return module.deriveOscilloscopeValuesFromScopePlots;
}

async function getMergeVoltmeterRmsFromTranWrdata() {
    const module = await importFresh(ngspiceResultParserModulePath);
    if (typeof module.mergeVoltmeterRmsFromTranWrdata !== "function")
        throw new Error("Module mergeVoltmeterRmsFromTranWrdata introuvable.");
    return module.mergeVoltmeterRmsFromTranWrdata;
}

async function getMergeAmmeterRmsFromTranWrdata() {
    const module = await importFresh(ngspiceResultParserModulePath);
    if (typeof module.mergeAmmeterRmsFromTranWrdata !== "function")
        throw new Error("Module mergeAmmeterRmsFromTranWrdata introuvable.");
    return module.mergeAmmeterRmsFromTranWrdata;
}

async function getMergeVoltmeterFromTranWrdata() {
    const module = await importFresh(ngspiceResultParserModulePath);
    if (typeof module.mergeVoltmeterFromTranWrdata !== "function")
        throw new Error("Module mergeVoltmeterFromTranWrdata introuvable.");
    return module.mergeVoltmeterFromTranWrdata;
}

async function getMergeAmmeterFromTranWrdata() {
    const module = await importFresh(ngspiceResultParserModulePath);
    if (typeof module.mergeAmmeterFromTranWrdata !== "function")
        throw new Error("Module mergeAmmeterFromTranWrdata introuvable.");
    return module.mergeAmmeterFromTranWrdata;
}

async function getMergeOhmmeterFromTranWrdata() {
    const module = await importFresh(ngspiceResultParserModulePath);
    if (typeof module.mergeOhmmeterFromTranWrdata !== "function")
        throw new Error("Module mergeOhmmeterFromTranWrdata introuvable.");
    return module.mergeOhmmeterFromTranWrdata;
}

async function getMergeVoltmeterTranPlotsFromWrdata() {
    const module = await importFresh(ngspiceResultParserModulePath);
    if (typeof module.mergeVoltmeterTranPlotsFromWrdata !== "function")
        throw new Error("Module mergeVoltmeterTranPlotsFromWrdata introuvable.");
    return module.mergeVoltmeterTranPlotsFromWrdata;
}

function runNgspice(netlistPath, outputPath, opts = {}) {
    const { exe, prependPath } = resolveNgspiceForServer(__dirname);
    const env = applyPathPrepend(process.env, prependPath);
    const cwd = opts.cwd || __dirname;
    // NB : pas de « -f rc ». L'option -f n'existe pas dans ngspice-46 (elle bascule en
    // mode interactif, n'exécute rien et n'écrit pas le -o log). Les codemodels XSPICE
    // (dont digital.cm) sont chargés automatiquement par spinit (../lib/ngspice/digital.cm).
    const args = ["-b", "-o", outputPath, netlistPath];
    return new Promise((resolve, reject) => {
        execFile(
            exe,
            args,
            {
                windowsHide: true,
                timeout: 25000,
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
    let buildNgspiceDeck;
    let mergeVoltmeterMeasurements;
    let mergeAmmeterMeasurements;
    let mergeLedMeasurements;
    let mergeLedTranPlotsFromWrdata;
    let mergeLedValuesFromTranPlots;
    let mergeLogicGateMeasurements;
    let mergeLogicGateTranFromWrdata;
    let mergeOhmmeterMeasurements;
    let mergeOscilloscopeMeasurements;
    let deriveOscilloscopeValuesFromScopePlots;
    let mergeScopePlotsFromTranWrdata;
    let mergeVoltmeterRmsFromTranWrdata;
    let mergeAmmeterRmsFromTranWrdata;
    let mergeVoltmeterFromTranWrdata;
    let mergeAmmeterFromTranWrdata;
    let mergeOhmmeterFromTranWrdata;
    let mergeVoltmeterTranPlotsFromWrdata;
    let mergeSeg7Measurements;
    let mergeSeg7FromTranWrdata;
    try {
        buildNgspiceDeck = await getBuildNgspiceDeck();
        mergeVoltmeterMeasurements = await getMergeVoltmeterMeasurements();
        mergeAmmeterMeasurements = await getMergeAmmeterMeasurements();
        mergeLedMeasurements = await getMergeLedMeasurements();
        mergeLedTranPlotsFromWrdata = await getMergeLedTranPlotsFromWrdata();
        mergeLedValuesFromTranPlots = await getMergeLedValuesFromTranPlots();
        mergeLogicGateMeasurements = await getMergeLogicGateMeasurements();
        mergeLogicGateTranFromWrdata = await getMergeLogicGateTranFromWrdata();
        mergeOhmmeterMeasurements = await getMergeOhmmeterMeasurements();
        mergeOscilloscopeMeasurements = await getMergeOscilloscopeMeasurements();
        deriveOscilloscopeValuesFromScopePlots = await getDeriveOscilloscopeValuesFromScopePlots();
        mergeScopePlotsFromTranWrdata = await getMergeScopePlotsFromTranWrdata();
        mergeVoltmeterRmsFromTranWrdata = await getMergeVoltmeterRmsFromTranWrdata();
        mergeAmmeterRmsFromTranWrdata = await getMergeAmmeterRmsFromTranWrdata();
        mergeVoltmeterFromTranWrdata = await getMergeVoltmeterFromTranWrdata();
        mergeAmmeterFromTranWrdata = await getMergeAmmeterFromTranWrdata();
        mergeOhmmeterFromTranWrdata = await getMergeOhmmeterFromTranWrdata();
        mergeVoltmeterTranPlotsFromWrdata = await getMergeVoltmeterTranPlotsFromWrdata();
        mergeSeg7Measurements = await getMergeSeg7Measurements();
        mergeSeg7FromTranWrdata = await getMergeSeg7FromTranWrdata();
    } catch (error) {
        res.status(500).json({
            ok: false,
            phase: "init",
            errors: ["Modules ngspice (netlist ou parseur resultats) indisponibles sur le serveur."],
            details: { message: error?.message || "" }
        });
        return;
    }

    const gs = Number(req.body?.gridStep);
    const { exe: ngspiceExe, prependPath } = resolveNgspiceForServer(__dirname);
    const deckOpts = {
        repoRoot: __dirname,
        ngspiceExe,
        ngspiceEnv: applyPathPrepend(process.env, prependPath),
    };
    if (Number.isFinite(gs) && gs > 0) deckOpts.gridStep = gs;
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

    try {
        let deckText = built.netlist;
        // Toujours chemins relatifs : ngspice tourne dans tempDir (évite espaces dans le chemin du projet).
        if (built.analysisTran && typeof deckText === "string") {
            deckText = deckText.split("__TRAN_WAVE_PATH__").join("tran_waves.txt");
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
        const runResult = await runNgspice("circuit.cir", "ngspice.log", {
            cwd: tempDir,
            xspiceRc,
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
        let voltmeterValues = mergeVoltmeterMeasurements(combinedLog, built.voltmeters, built.nodeMeasures || []);
        let ammeterValues = mergeAmmeterMeasurements(combinedLog, built.ammeters || []);
        let ledValues = mergeLedMeasurements(combinedLog, built.leds || []);
        let logicValues = mergeLogicGateMeasurements(combinedLog, built.logicGates || []);
        let ohmmeterValues = {};
        let voltmeterRmsValues = {};
        let ammeterRmsValues = {};
        let scopePlots = {};
        let seg7Values = mergeSeg7Measurements(combinedLog, built.seg7Displays || []);
        let ledTranPlots = {};
        let voltmeterTranPlots = {};
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
        const ohmList = Array.isArray(built.ohmeters) ? built.ohmeters : [];
        const ohmIsoNetlist = built.ohmmeterIsolationNetlist;
        if (ohmList.length > 0 && typeof ohmIsoNetlist === "string" && ohmIsoNetlist.trim()) {
            try {
                const ohmLogPath = path.join(tempDir, "ngspice_ohm.log");
                await writeFile(path.join(tempDir, "circuit_ohm.cir"), ohmIsoNetlist, "utf8");
                const ohmRun = await runNgspice("circuit_ohm.cir", "ngspice_ohm.log", {
                    cwd: tempDir,
                    xspiceRc,
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
            scopePlots,
            seg7Values,
            seg7Displays: Array.isArray(built.seg7Displays) ? built.seg7Displays : [],
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

// --- 5. COMPTEUR ---
let visitCount = 0;
if (fs.existsSync('./visits.json')) visitCount = JSON.parse(fs.readFileSync('./visits.json')).count || 0;
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
        
        baseEleves[classe].forEach((e, index) => {
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
                <tr style="background:${index % 2 === 0 ? '#1a1a1a' : '#252525'}; border-bottom:1px solid #333;">
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
            <a href="/gestion-quiz" style="background:#00d1ff; color:#0f172a; text-decoration:none; padding:10px 20px; border-radius:5px; font-weight:bold;">🛠️ Créer / Modifier un Quiz</a>
            <a href="/contact.html?prof=1" target="_blank" style="background:#10b981; color:white; text-decoration:none; padding:10px 20px; border-radius:5px; font-weight:bold; margin-left:10px;">💬 Accéder au Tchat</a>
        </div>

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

    // Ajouter les fichiers JSON de données
    const files = ['eleves.json', 'quizzes.json', 'planning_projets.json', 'planning_docs.json', 'chat_messages.json', 'visits.json'];
    files.forEach(file => {
        if (fs.existsSync(file)) archive.file(file, { name: file });
    });

    // Ajouter le dossier des uploads élèves (optionnel, peut être lourd)
    // archive.directory(dirUploads, 'Travaux_Eleves'); 

    archive.finalize();
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

server.listen(PORT, LISTEN_HOST, () => {
    const { exe: ngspiceExe } = resolveNgspiceForServer(__dirname);
    console.log(`🔬 Simulateur ngspice : ${ngspiceExe}`);
    console.log(`🚀 Serveur en ligne : http://localhost:${PORT}`);
    if (siteAccessPasswordConfigured()) {
        console.log('🔐 Accès site protégé : visitez n’importe quelle URL pour être redirigé vers /acces-site');
        if (siteAccessLogoutOnPageUnloadEnabled()) {
            console.log('   ↳ SITE_ACCESS_LOGOUT_ON_PAGE_UNLOAD : cookie effacé à chaque changement de page');
        }
        if (siteAccessCookieMaxAgeSecondsForSetCookie() == null) {
            console.log('   ↳ SITE_ACCESS_MAX_AGE_SEC=session : cookie jusqu’à fermeture du navigateur');
        }
    }
});