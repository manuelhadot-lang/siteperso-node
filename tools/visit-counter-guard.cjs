"use strict";

const fs = require("fs");
const path = require("path");
const { readJsonFileSafe } = require("./read-json-safe.cjs");

/** @param {string | undefined} header */
function parseCookieHeader(header) {
    /** @type {Record<string, string>} */
    const out = {};
    if (!header || typeof header !== "string") return out;
    for (const part of header.split(";")) {
        const i = part.indexOf("=");
        if (i <= 0) continue;
        const k = part.slice(0, i).trim();
        const v = part.slice(i + 1).trim();
        if (k) out[k] = decodeURIComponent(v);
    }
    return out;
}

/** @param {import("express").Request} req */
function clientIp(req) {
    const xf = req.headers["x-forwarded-for"];
    if (typeof xf === "string" && xf.trim()) {
        return xf.split(",")[0].trim();
    }
    return req.socket?.remoteAddress || req.ip || "unknown";
}

/** @param {string | undefined} ua */
function isLikelyBot(ua) {
    if (!ua || typeof ua !== "string") return true;
    return /bot|crawl|spider|slurp|facebookexternalhit|preview|wget|curl|python-requests|httpclient|scrapy|headless|phantom|selenium|puppeteer|monitor|uptime|pingdom|statuscake/i.test(
        ua
    );
}

/**
 * Compteur anti-abus : 1 hit / navigateur (cookie) et / IP sur une fenêtre donnée.
 * @param {{
 *   filePath: string,
 *   cookieName: string,
 *   cooldownMs?: number,
 *   cookieMaxAgeSec?: number,
 * }} opts
 */
function createGuardedVisitCounter(opts) {
    const filePath = opts.filePath;
    const cookieName = opts.cookieName;
    const cooldownMs = opts.cooldownMs ?? 12 * 60 * 60 * 1000; // 12 h
    const cookieMaxAgeSec = opts.cookieMaxAgeSec ?? 60 * 60 * 24; // 24 h
    /** @type {Map<string, number>} */
    const hitsByIp = new Map();
    let count = Number(readJsonFileSafe(filePath, { count: 0 }).count) || 0;
    let pruneAt = Date.now() + 60 * 60 * 1000;

    function persist() {
        try {
            const dir = path.dirname(filePath);
            if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
            const tmp = `${filePath}.${process.pid}.tmp`;
            fs.writeFileSync(tmp, JSON.stringify({ count }));
            fs.renameSync(tmp, filePath);
        } catch (err) {
            console.warn("[visit-counter] écriture:", err?.message || err);
        }
    }

    function reloadFromDisk() {
        count = Number(readJsonFileSafe(filePath, { count: 0 }).count) || 0;
        return count;
    }

    function setCount(n) {
        count = Math.max(0, Math.floor(Number(n) || 0));
        persist();
        return count;
    }

    function prune(now) {
        if (now < pruneAt) return;
        pruneAt = now + 60 * 60 * 1000;
        for (const [ip, t] of hitsByIp) {
            if (now - t > cooldownMs) hitsByIp.delete(ip);
        }
    }

    /**
     * @param {import("express").Request} req
     * @param {import("express").Response} res
     * @returns {{ count: number, counted: boolean }}
     */
    function tryHit(req, res) {
        const now = Date.now();
        prune(now);

        const cookies = parseCookieHeader(req.headers.cookie);
        if (cookies[cookieName] === "1") {
            return { count, counted: false };
        }

        if (isLikelyBot(req.headers["user-agent"])) {
            return { count, counted: false };
        }

        // Requêtes hors navigateur (pas d’Accept HTML typique) : souvent des scripts.
        const accept = String(req.headers.accept || "");
        if (accept && !/text\/html|application\/json|\*\//i.test(accept) && !accept.includes("*/*")) {
            // leave as soft check — fetch() sends */* so OK
        }

        const ip = clientIp(req);
        const last = hitsByIp.get(ip) || 0;
        if (now - last < cooldownMs) {
            // Même IP récente : cookie pour éviter les retries, pas d’incrément.
            res.append(
                "Set-Cookie",
                `${cookieName}=1; Path=/; Max-Age=${cookieMaxAgeSec}; HttpOnly; SameSite=Lax`
            );
            return { count, counted: false };
        }

        hitsByIp.set(ip, now);
        count += 1;
        persist();
        res.append(
            "Set-Cookie",
            `${cookieName}=1; Path=/; Max-Age=${cookieMaxAgeSec}; HttpOnly; SameSite=Lax${
                process.env.NODE_ENV === "production" ? "; Secure" : ""
            }`
        );
        return { count, counted: true };
    }

    return {
        getCount: () => count,
        setCount,
        reloadFromDisk,
        tryHit,
    };
}

module.exports = { createGuardedVisitCounter, clientIp, isLikelyBot };
