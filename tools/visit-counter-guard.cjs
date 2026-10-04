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
 * Compteur anti-abus :
 * - 1 hit / navigateur (cookie) sur cookieMaxAge
 * - plafond par IP (pas 1 seul hit : un lycée partage souvent la même IP)
 * @param {{
 *   filePath: string,
 *   cookieName: string,
 *   cooldownMs?: number,
 *   cookieMaxAgeSec?: number,
 *   maxHitsPerIp?: number,
 * }} opts
 */
function createGuardedVisitCounter(opts) {
    const filePath = opts.filePath;
    const cookieName = opts.cookieName;
    const cooldownMs = opts.cooldownMs ?? 12 * 60 * 60 * 1000; // 12 h
    const cookieMaxAgeSec = opts.cookieMaxAgeSec ?? 60 * 60 * 24; // 24 h
    const maxHitsPerIp = Math.max(1, opts.maxHitsPerIp ?? 80);
    /** @type {Map<string, number[]>} */
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
        hitsByIp.clear();
        persist();
        return count;
    }

    function resetToZero() {
        return setCount(0);
    }

    function prune(now) {
        if (now < pruneAt) return;
        pruneAt = now + 60 * 60 * 1000;
        for (const [ip, times] of hitsByIp) {
            const kept = times.filter((t) => now - t < cooldownMs);
            if (kept.length === 0) hitsByIp.delete(ip);
            else hitsByIp.set(ip, kept);
        }
    }

    function cookieHeader() {
        return `${cookieName}=1; Path=/; Max-Age=${cookieMaxAgeSec}; HttpOnly; SameSite=Lax${
            process.env.NODE_ENV === "production" ? "; Secure" : ""
        }`;
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

        const ip = clientIp(req);
        const times = (hitsByIp.get(ip) || []).filter((t) => now - t < cooldownMs);
        if (times.length >= maxHitsPerIp) {
            res.append("Set-Cookie", cookieHeader());
            return { count, counted: false };
        }

        times.push(now);
        hitsByIp.set(ip, times);
        count += 1;
        persist();
        res.append("Set-Cookie", cookieHeader());
        return { count, counted: true };
    }

    return {
        getCount: () => count,
        setCount,
        resetToZero,
        reloadFromDisk,
        tryHit,
    };
}

module.exports = { createGuardedVisitCounter, clientIp, isLikelyBot };
