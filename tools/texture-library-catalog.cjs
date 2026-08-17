"use strict";

const fs = require("fs");
const path = require("path");

const MAP_SUFFIXES = ["color", "normal", "roughness", "ao", "displacement", "metalness"];
const IMAGE_EXT = new Set([".jpg", ".jpeg", ".png", ".webp"]);
const HDR_EXT = new Set([".hdr"]);

const CATEGORY_KIND = {
    hdri: "hdri",
    decalcomanie: "decal",
};

/**
 * @param {string} fileName
 * @returns {{ prefix: string, map: string } | null}
 */
function parseMapName(fileName) {
    const base = fileName.replace(/\.[^.]+$/, "");
    for (const map of MAP_SUFFIXES) {
        const re = new RegExp(`_(${map})$`, "i");
        const match = re.exec(base);
        if (match) {
            return { prefix: base.slice(0, match.index), map: map.toLowerCase() };
        }
    }
    return null;
}

/**
 * @param {string} textureRoot absolute path to texture/
 * @param {{ urlBase?: string }} [options]
 * @returns {{ ok: boolean, assets: object[], categories: string[] }}
 */
function buildTextureLibraryCatalog(textureRoot, options = {}) {
    const urlBase = String(options.urlBase || "/texture").replace(/\/$/, "");
    /** @type {object[]} */
    const assets = [];
    /** @type {Set<string>} */
    const categories = new Set();

    if (!fs.existsSync(textureRoot) || !fs.statSync(textureRoot).isDirectory()) {
        return { ok: true, assets: [], categories: [] };
    }

    const folders = fs
        .readdirSync(textureRoot, { withFileTypes: true })
        .filter((d) => d.isDirectory())
        .map((d) => d.name)
        .sort((a, b) => a.localeCompare(b, "fr"));

    for (const category of folders) {
        const dir = path.join(textureRoot, category);
        const files = fs
            .readdirSync(dir, { withFileTypes: true })
            .filter((d) => d.isFile())
            .map((d) => d.name);

        if (category === "hdri" || CATEGORY_KIND[category] === "hdri") {
            for (const fileName of files.sort((a, b) => a.localeCompare(b, "fr"))) {
                const ext = path.extname(fileName).toLowerCase();
                if (!HDR_EXT.has(ext) && !IMAGE_EXT.has(ext)) continue;
                const rel = `${category}/${fileName}`.replace(/\\/g, "/");
                const name = fileName.replace(/\.[^.]+$/, "");
                categories.add(category);
                assets.push({
                    id: `pack:${rel}`,
                    name: `${category} · ${name}`,
                    kind: "hdri",
                    category,
                    url: `${urlBase}/${rel}`,
                    thumbUrl: IMAGE_EXT.has(ext) ? `${urlBase}/${rel}` : undefined,
                    mime: ext === ".hdr" ? "application/octet-stream" : "image/jpeg",
                    builtin: true,
                });
            }
            continue;
        }

        /** @type {Map<string, { color?: string, normal?: string }>} */
        const packs = new Map();
        for (const fileName of files) {
            const ext = path.extname(fileName).toLowerCase();
            if (!IMAGE_EXT.has(ext)) continue;
            const parsed = parseMapName(fileName);
            if (!parsed) continue;
            if (parsed.map !== "color" && parsed.map !== "normal") continue;
            let pack = packs.get(parsed.prefix);
            if (!pack) {
                pack = {};
                packs.set(parsed.prefix, pack);
            }
            pack[parsed.map] = fileName;
        }

        const kind = CATEGORY_KIND[category] || "albedo";
        const prefixes = [...packs.keys()].sort((a, b) => a.localeCompare(b, "fr"));
        for (const prefix of prefixes) {
            const pack = packs.get(prefix);
            if (!pack?.color && !pack?.normal) continue;
            categories.add(category);
            if (pack.color) {
                const colorRel = `${category}/${pack.color}`.replace(/\\/g, "/");
                const normalRel = pack.normal
                    ? `${category}/${pack.normal}`.replace(/\\/g, "/")
                    : undefined;
                assets.push({
                    id: `pack:${colorRel}`,
                    name: `${category} · ${prefix}`,
                    kind,
                    category,
                    url: `${urlBase}/${colorRel}`,
                    thumbUrl: `${urlBase}/${colorRel}`,
                    normalUrl: normalRel ? `${urlBase}/${normalRel}` : undefined,
                    mime: "image/jpeg",
                    builtin: true,
                });
            } else if (pack.normal) {
                const normalRel = `${category}/${pack.normal}`.replace(/\\/g, "/");
                assets.push({
                    id: `pack:${normalRel}`,
                    name: `${category} · ${prefix} (normal)`,
                    kind: "normal",
                    category,
                    url: `${urlBase}/${normalRel}`,
                    thumbUrl: `${urlBase}/${normalRel}`,
                    mime: "image/jpeg",
                    builtin: true,
                });
            }
        }
    }

    return {
        ok: true,
        assets,
        categories: [...categories].sort((a, b) => a.localeCompare(b, "fr")),
    };
}

module.exports = {
    buildTextureLibraryCatalog,
};
