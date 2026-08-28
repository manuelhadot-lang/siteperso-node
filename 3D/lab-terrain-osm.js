/** Texture routes / rues OpenStreetMap alignée sur la zone terrain (IGN). */

import { terrainFootprintBounds } from "./lab-terrain-ign.js";

const OSM_PROXY_URL = "/api/osm/overpass";

/** @type {Record<string, { width: number, color: string, order: number }>} */
const ROAD_STYLES = {
    motorway: { width: 6, color: "#f59e0b", order: 90 },
    motorway_link: { width: 3.5, color: "#fbbf24", order: 70 },
    trunk: { width: 5, color: "#fcd34d", order: 85 },
    trunk_link: { width: 3, color: "#fde68a", order: 68 },
    primary: { width: 4, color: "#fef9c3", order: 80 },
    primary_link: { width: 2.5, color: "#fef08a", order: 65 },
    secondary: { width: 3.2, color: "#ffffff", order: 75 },
    secondary_link: { width: 2.2, color: "#f1f5f9", order: 63 },
    tertiary: { width: 2.6, color: "#e2e8f0", order: 60 },
    tertiary_link: { width: 1.8, color: "#cbd5e1", order: 55 },
    unclassified: { width: 2.2, color: "#cbd5e1", order: 50 },
    residential: { width: 2, color: "#f8fafc", order: 45 },
    living_street: { width: 1.8, color: "#f1f5f9", order: 44 },
    service: { width: 1.4, color: "#94a3b8", order: 35 },
    track: { width: 1.2, color: "#a8a29e", order: 30 },
    path: { width: 0.9, color: "#78716c", order: 20 },
    footway: { width: 0.7, color: "#57534e", order: 15 },
    cycleway: { width: 1.1, color: "#67e8f9", order: 25 },
    pedestrian: { width: 1.2, color: "#d6d3d1", order: 22 },
    bridleway: { width: 1, color: "#a3e635", order: 18 },
};

const DEFAULT_ROAD = { width: 1.6, color: "#94a3b8", order: 40 };

/**
 * @param {number} south
 * @param {number} west
 * @param {number} north
 * @param {number} east
 * @returns {Promise<{ type: string, tags?: Record<string, string>, geometry?: { lat: number, lon: number }[] }[]>}
 */
export async function fetchOsmRoadGeometries(south, west, north, east) {
    const res = await fetch(OSM_PROXY_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ south, west, north, east }),
        cache: "no-store",
    });
    let payload = null;
    try {
        payload = await res.json();
    } catch {
        payload = null;
    }
    if (!res.ok) {
        const msg =
            (payload && typeof payload.error === "string" && payload.error) ||
            `Service OSM indisponible (${res.status})`;
        throw new Error(msg);
    }
    if (!Array.isArray(payload?.elements)) {
        throw new Error("Réponse OpenStreetMap invalide");
    }
    return payload.elements;
}

/**
 * @param {string} highway
 */
function roadStyle(highway) {
    if (!highway) return DEFAULT_ROAD;
    return ROAD_STYLES[highway] ?? DEFAULT_ROAD;
}

/**
 * @param {{ type: string, tags?: Record<string, string>, geometry?: { lat: number, lon: number }[] }[]} elements
 * @param {{ south: number, west: number, north: number, east: number }} bbox
 * @param {number} resolution
 * @param {{ backgroundColor?: string }} [opts]
 */
export function renderOsmRoadsToDataUrl(elements, bbox, resolution, opts = {}) {
    const canvas = document.createElement("canvas");
    canvas.width = resolution;
    canvas.height = resolution;
    const ctx = canvas.getContext("2d");
    if (!ctx) return "";

    const bg = opts.backgroundColor ?? "#455838";
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, resolution, resolution);

    const latSpan = bbox.north - bbox.south || 1e-9;
    const lonSpan = bbox.east - bbox.west || 1e-9;

    /** @param {number} lat @param {number} lon */
    function project(lat, lon) {
        const x = ((lon - bbox.west) / lonSpan) * resolution;
        const y = ((bbox.north - lat) / latSpan) * resolution;
        return { x, y };
    }

    const ways = elements
        .filter((el) => el.type === "way" && Array.isArray(el.geometry) && el.geometry.length >= 2)
        .map((el) => ({
            highway: el.tags?.highway ?? "",
            geometry: el.geometry,
            style: roadStyle(el.tags?.highway),
        }))
        .sort((a, b) => a.style.order - b.style.order);

    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    for (const way of ways) {
        const scale = Math.max(0.55, resolution / 2048);
        ctx.strokeStyle = way.style.color;
        ctx.lineWidth = way.style.width * scale;
        ctx.beginPath();
        way.geometry.forEach((pt, index) => {
            const { x, y } = project(pt.lat, pt.lon);
            if (index === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
        });
        ctx.stroke();
    }

    return canvas.toDataURL("image/png");
}

/**
 * Génère une texture routes OSM pour la zone terrain.
 * @param {number} lat
 * @param {number} lon
 * @param {number} sizeMeters
 * @param {number} [resolution]
 * @param {{ backgroundColor?: string }} [opts]
 */
export async function buildOsmRoadTextureForTerrain(
    lat,
    lon,
    sizeMeters,
    resolution = 2048,
    opts = {}
) {
    const footprint = terrainFootprintBounds(sizeMeters, lat, lon);
    const south = footprint[0][0];
    const west = footprint[0][1];
    const north = footprint[1][0];
    const east = footprint[1][1];
    const bbox = { south, west, north, east };

    const elements = await fetchOsmRoadGeometries(south, west, north, east);
    const ways = elements.filter(
        (el) => el.type === "way" && Array.isArray(el.geometry) && el.geometry.length >= 2
    );
    if (!ways.length) {
        throw new Error("Aucune route OSM dans cette zone — zoomez sur une zone urbanisée");
    }

    const dataUrl = renderOsmRoadsToDataUrl(elements, bbox, resolution, opts);
    return { dataUrl, wayCount: ways.length, bbox };
}
