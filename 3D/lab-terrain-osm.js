/** Texture routes / rues OpenStreetMap alignée sur la zone terrain (IGN). */

import { terrainFootprintBounds } from "./lab-terrain-ign.js";

const OSM_PROXY_URL = "/api/osm/overpass";

/** Largeurs en mètres (chaussée), plus couleur schéma héritée. */
/** @type {Record<string, { width: number, widthMeters: number, color: string, order: number }>} */
const ROAD_STYLES = {
    motorway: { width: 6, widthMeters: 12, color: "#f59e0b", order: 90 },
    motorway_link: { width: 3.5, widthMeters: 6, color: "#fbbf24", order: 70 },
    trunk: { width: 5, widthMeters: 10, color: "#fcd34d", order: 85 },
    trunk_link: { width: 3, widthMeters: 5.5, color: "#fde68a", order: 68 },
    primary: { width: 4, widthMeters: 8.5, color: "#fef9c3", order: 80 },
    primary_link: { width: 2.5, widthMeters: 5, color: "#fef08a", order: 65 },
    secondary: { width: 3.2, widthMeters: 7, color: "#ffffff", order: 75 },
    secondary_link: { width: 2.2, widthMeters: 4.5, color: "#f1f5f9", order: 63 },
    tertiary: { width: 2.6, widthMeters: 6, color: "#e2e8f0", order: 60 },
    tertiary_link: { width: 1.8, widthMeters: 4, color: "#cbd5e1", order: 55 },
    unclassified: { width: 2.2, widthMeters: 5, color: "#cbd5e1", order: 50 },
    residential: { width: 2, widthMeters: 5.5, color: "#f8fafc", order: 45 },
    living_street: { width: 1.8, widthMeters: 5, color: "#f1f5f9", order: 44 },
    service: { width: 1.4, widthMeters: 3.5, color: "#94a3b8", order: 35 },
    track: { width: 1.2, widthMeters: 2.8, color: "#a8a29e", order: 30 },
    path: { width: 0.9, widthMeters: 1.6, color: "#78716c", order: 20 },
    footway: { width: 0.7, widthMeters: 1.2, color: "#57534e", order: 15 },
    cycleway: { width: 1.1, widthMeters: 2, color: "#67e8f9", order: 25 },
    pedestrian: { width: 1.2, widthMeters: 3, color: "#d6d3d1", order: 22 },
    bridleway: { width: 1, widthMeters: 2, color: "#a3e635", order: 18 },
};

const DEFAULT_ROAD = { width: 1.6, widthMeters: 4.5, color: "#94a3b8", order: 40 };

/**
 * @param {number} south
 * @param {number} west
 * @param {number} north
 * @param {number} east
 * @param {string[]} [include]
 * @returns {Promise<{ type: string, tags?: Record<string, string>, geometry?: { lat: number, lon: number }[] }[]>}
 */
export async function fetchOsmRoadGeometries(south, west, north, east, include = ["highway"]) {
    const res = await fetch(OSM_PROXY_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ south, west, north, east, include }),
        cache: "no-store",
    });
    let payload = null;
    try {
        payload = await res.json();
    } catch {
        payload = null;
    }
    if (!res.ok) {
        // 404 = zone sans données : renvoyer [] pour laisser le placement 3D gérer le message.
        if (res.status === 404 && Array.isArray(payload?.elements)) {
            return payload.elements;
        }
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
 * @param {string} [highway]
 */
export function roadWidthMeters(highway) {
    return roadStyle(highway).widthMeters ?? DEFAULT_ROAD.widthMeters;
}

/**
 * @param {{ type?: string, tags?: Record<string, string>, geometry?: { lat: number, lon: number }[] }[]} elements
 */
export function highwayWays(elements) {
    return (elements || []).filter(
        (el) =>
            el.type === "way" &&
            el.tags?.highway &&
            el.tags.area !== "yes" &&
            Array.isArray(el.geometry) &&
            el.geometry.length >= 2
    );
}

/**
 * @param {{ type?: string, id?: number, tags?: Record<string, string>, geometry?: { lat: number, lon: number }[] }[]} elements
 */
export function buildingWays(elements) {
    return (elements || []).filter(
        (el) =>
            el.type === "way" &&
            el.tags?.building &&
            el.tags.building !== "no" &&
            Array.isArray(el.geometry) &&
            el.geometry.length >= 3
    );
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

    const ways = highwayWays(elements)
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

    const elements = await fetchOsmRoadGeometries(south, west, north, east, ["highway"]);
    const ways = highwayWays(elements);
    if (!ways.length) {
        throw new Error("Aucune route OSM dans cette zone — zoomez sur une zone urbanisée");
    }

    const dataUrl = renderOsmRoadsToDataUrl(ways, bbox, resolution, opts);
    return { dataUrl, wayCount: ways.length, bbox, elements };
}

/**
 * Masque alpha des routes (blanc = voie) pour plaquer une texture bitume sur un splat.
 * @param {number} lat
 * @param {number} lon
 * @param {number} sizeMeters
 * @param {number} [resolution]
 * @returns {Promise<{ imageData: ImageData, wayCount: number }>}
 */
export async function buildOsmRoadMaskForTerrain(lat, lon, sizeMeters, resolution = 1024) {
    const footprint = terrainFootprintBounds(sizeMeters, lat, lon);
    const south = footprint[0][0];
    const west = footprint[0][1];
    const north = footprint[1][0];
    const east = footprint[1][1];
    const bbox = { south, west, north, east };
    let elements;
    try {
        elements = await fetchOsmRoadGeometries(south, west, north, east, [
            "highway",
            "building",
        ]);
    } catch (error) {
        console.warn("[lab-terrain-osm] OSM combiné, repli routes seules :", error);
        elements = await fetchOsmRoadGeometries(south, west, north, east, ["highway"]);
    }
    const ways = highwayWays(elements);
    const buildings = buildingWays(elements);
    if (!ways.length && !buildings.length) {
        throw new Error("Aucune route / bâtiment OSM dans cette zone — zoomez sur un quartier");
    }
    const canvas = document.createElement("canvas");
    canvas.width = resolution;
    canvas.height = resolution;
    const ctx = canvas.getContext("2d", { alpha: true });
    if (!ctx) throw new Error("Masque routes OSM impossible");
    ctx.clearRect(0, 0, resolution, resolution);
    const styled = ways.length
        ? renderOsmRoadsToCanvas(ctx, ways, bbox, resolution, sizeMeters)
        : 0;
    return {
        imageData: ctx.getImageData(0, 0, resolution, resolution),
        wayCount: styled,
        elements,
        bbox,
    };
}

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {{ type: string, tags?: Record<string, string>, geometry?: { lat: number, lon: number }[] }[]} elements
 * @param {{ south: number, west: number, north: number, east: number }} bbox
 * @param {number} resolution
 * @param {number} [sizeMeters]
 */
function renderOsmRoadsToCanvas(ctx, elements, bbox, resolution, sizeMeters = 0) {
    const latSpan = bbox.north - bbox.south || 1e-9;
    const lonSpan = bbox.east - bbox.west || 1e-9;
    /** @param {number} lat @param {number} lon */
    function project(lat, lon) {
        const x = ((lon - bbox.west) / lonSpan) * resolution;
        const y = ((bbox.north - lat) / latSpan) * resolution;
        return { x, y };
    }
    const ways = highwayWays(elements)
        .map((el) => ({
            geometry: el.geometry,
            style: roadStyle(el.tags?.highway),
        }))
        .sort((a, b) => a.style.order - b.style.order);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#ffffff";
    const pxPerMeter = sizeMeters > 0 ? resolution / sizeMeters : resolution / 1024;
    for (const way of ways) {
        const meters = way.style.widthMeters ?? way.style.width * 2.2;
        ctx.lineWidth = Math.max(5, meters * pxPerMeter * 1.35);
        ctx.beginPath();
        way.geometry.forEach((pt, index) => {
            const { x, y } = project(pt.lat, pt.lon);
            if (index === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
        });
        ctx.stroke();
    }
    return ways.length;
}

/**
 * Trace les routes OSM en bitume clair, bien visible sur une orthophoto.
 * @param {CanvasRenderingContext2D} ctx
 * @param {{ type?: string, tags?: Record<string, string>, geometry?: { lat: number, lon: number }[] }[]} elements
 * @param {{ south: number, west: number, north: number, east: number }} bbox
 * @param {number} resolution
 * @param {number} [sizeMeters]
 */
export function paintOsmRoadsOnContext(ctx, elements, bbox, resolution, sizeMeters = 0) {
    const latSpan = bbox.north - bbox.south || 1e-9;
    const lonSpan = bbox.east - bbox.west || 1e-9;
    /** @param {number} lat @param {number} lon */
    function project(lat, lon) {
        const x = ((lon - bbox.west) / lonSpan) * resolution;
        const y = ((bbox.north - lat) / latSpan) * resolution;
        return { x, y };
    }
    const ways = highwayWays(elements)
        .map((el) => ({
            geometry: el.geometry,
            style: roadStyle(el.tags?.highway),
        }))
        .sort((a, b) => a.style.order - b.style.order);
    if (!ways.length) return 0;
    ctx.save();
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    const pxPerMeter = sizeMeters > 0 ? resolution / sizeMeters : resolution / 1024;
    for (const way of ways) {
        const meters = way.style.widthMeters ?? way.style.width * 2.2;
        const px = Math.max(6, meters * pxPerMeter * 1.55);
        const path = () => {
            ctx.beginPath();
            way.geometry.forEach((pt, index) => {
                const { x, y } = project(pt.lat, pt.lon);
                if (index === 0) ctx.moveTo(x, y);
                else ctx.lineTo(x, y);
            });
        };
        ctx.strokeStyle = "#141416";
        ctx.lineWidth = px + 3;
        path();
        ctx.stroke();
        ctx.strokeStyle = "#6b6b72";
        ctx.lineWidth = px;
        path();
        ctx.stroke();
        if (way.style.order >= 60) {
            ctx.strokeStyle = "#e8c547";
            ctx.lineWidth = Math.max(1.6, px * 0.18);
            path();
            ctx.stroke();
        }
    }
    ctx.restore();
    return ways.length;
}
