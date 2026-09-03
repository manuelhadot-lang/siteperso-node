/** Texture sol : orthophoto IGN, splat relief, routes bitume. */

import { paintOsmRoadsOnContext } from "./lab-terrain-osm.js";

export const SPLAT_RES = 1024;
const METERS_PER_TILE = 8;

export const LAYER_DEFS = {
    grass: {
        label: "Herbe",
        color: "/texture/herbe/grass002_color.jpg",
        normal: "/texture/herbe/grass002_normal.jpg",
    },
    sand: {
        label: "Sable",
        color: "/texture/sable/ground004_color.jpg",
        normal: "/texture/sable/ground004_normal.jpg",
    },
    path: {
        label: "Sentier",
        color: "/texture/sol/gravel023_color.jpg",
        normal: "/texture/sol/gravel023_normal.jpg",
    },
    rock: {
        label: "Roche",
        color: "/texture/pierre/rock023_color.jpg",
        normal: "/texture/pierre/rock023_normal.jpg",
    },
    road: {
        label: "Routes",
        color: "/texture/bitume/road006_color.jpg",
        normal: "/texture/bitume/road006_normal.jpg",
    },
};

export const GROUND_LAYER_IDS = ["grass", "sand", "path", "rock", "road"];

/**
 * @param {number} e0
 * @param {number} e1
 * @param {number} x
 */
function smoothstep(e0, e1, x) {
    const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0 || 1e-6)));
    return t * t * (3 - 2 * t);
}

/**
 * @param {string} url
 * @returns {Promise<ImageData>}
 */
export function loadImageData(url) {
    return new Promise((resolve, reject) => {
        const image = new Image();
        image.crossOrigin = "anonymous";
        image.onload = () => {
            const canvas = document.createElement("canvas");
            canvas.width = image.naturalWidth || image.width;
            canvas.height = image.naturalHeight || image.height;
            const ctx = canvas.getContext("2d", { willReadFrequently: true });
            if (!ctx) {
                reject(new Error("Lecture texture impossible"));
                return;
            }
            ctx.drawImage(image, 0, 0);
            resolve(ctx.getImageData(0, 0, canvas.width, canvas.height));
        };
        image.onerror = () => reject(new Error(`Texture introuvable : ${url}`));
        image.src = url;
    });
}

/**
 * @param {ImageData} image
 * @param {number} u
 * @param {number} v
 * @returns {[number, number, number]}
 */
function sampleTile(image, u, v) {
    const w = image.width;
    const h = image.height;
    const x = (((u % 1) + 1) % 1) * w;
    const y = (((v % 1) + 1) % 1) * h;
    const ix = Math.min(w - 1, Math.floor(x));
    const iy = Math.min(h - 1, Math.floor(y));
    const i = (iy * w + ix) * 4;
    return [image.data[i], image.data[i + 1], image.data[i + 2]];
}

/**
 * @param {ImageData} image
 * @param {number} u 0–1
 * @param {number} v 0–1
 * @returns {[number, number, number, number]}
 */
function sampleImage(image, u, v) {
    const w = image.width;
    const h = image.height;
    const x = Math.min(w - 1, Math.max(0, u * (w - 1)));
    const y = Math.min(h - 1, Math.max(0, v * (h - 1)));
    const x0 = Math.floor(x);
    const y0 = Math.floor(y);
    const x1 = Math.min(w - 1, x0 + 1);
    const y1 = Math.min(h - 1, y0 + 1);
    const tx = x - x0;
    const ty = y - y0;
    const i00 = (y0 * w + x0) * 4;
    const i10 = (y0 * w + x1) * 4;
    const i01 = (y1 * w + x0) * 4;
    const i11 = (y1 * w + x1) * 4;
    const d = image.data;
    /** @param {number} c */
    const lerp = (c) =>
        d[i00 + c] * (1 - tx) * (1 - ty) +
        d[i10 + c] * tx * (1 - ty) +
        d[i01 + c] * (1 - tx) * ty +
        d[i11 + c] * tx * ty;
    return [lerp(0), lerp(1), lerp(2), lerp(3)];
}

/**
 * @param {import("three").BufferGeometry} geometry
 * @param {number} sizeMeters
 */
export function sampleTerrainRelief(geometry, sizeMeters) {
    const positions = geometry.attributes.position;
    const normals = geometry.attributes.normal;
    const count = positions?.count || 0;
    const segs = Math.max(1, Math.round(Math.sqrt(count)) - 1);
    const res = segs + 1;
    const heights = new Float32Array(res * res);
    const slopes = new Float32Array(res * res);
    const half = sizeMeters * 0.5;
    let hMin = Infinity;
    let hMax = -Infinity;
    for (let i = 0; i < count; i += 1) {
        const x = positions.getX(i);
        const y = positions.getY(i);
        const z = positions.getZ(i);
        const ix = Math.min(segs, Math.max(0, Math.round(((x + half) / sizeMeters) * segs)));
        const iz = Math.min(segs, Math.max(0, Math.round(((z + half) / sizeMeters) * segs)));
        const idx = iz * res + ix;
        heights[idx] = y;
        const ny = normals ? normals.getY(i) : 1;
        slopes[idx] = 1 - Math.min(1, Math.max(0, ny));
        if (y < hMin) hMin = y;
        if (y > hMax) hMax = y;
    }
    if (!Number.isFinite(hMin)) hMin = 0;
    if (!Number.isFinite(hMax)) hMax = 0;
    return { heights, slopes, res, hMin, hMax };
}

/**
 * @param {Float32Array} grid
 * @param {number} res
 * @param {number} u
 * @param {number} v
 */
function sampleGrid(grid, res, u, v) {
    const x = Math.min(res - 1, Math.max(0, u * (res - 1)));
    const y = Math.min(res - 1, Math.max(0, v * (res - 1)));
    const x0 = Math.floor(x);
    const y0 = Math.floor(y);
    const x1 = Math.min(res - 1, x0 + 1);
    const y1 = Math.min(res - 1, y0 + 1);
    const tx = x - x0;
    const ty = y - y0;
    const a = grid[y0 * res + x0];
    const b = grid[y0 * res + x1];
    const c = grid[y1 * res + x0];
    const d = grid[y1 * res + x1];
    return a * (1 - tx) * (1 - ty) + b * tx * (1 - ty) + c * (1 - tx) * ty + d * tx * ty;
}

/**
 * @param {number} height01
 * @param {number} slope
 * @param {boolean} flat
 */
function layerWeights(height01, slope, flat) {
    if (flat) {
        return { sand: 0.08, grass: 0.82, path: 0.1, rock: 0 };
    }
    const sand = (1 - smoothstep(0.1, 0.28, height01)) * (1 - smoothstep(0.06, 0.2, slope));
    const grass =
        (1 - sand) *
        (1 - smoothstep(0.16, 0.4, slope)) *
        (1 - smoothstep(0.78, 0.96, height01));
    const path = (1 - sand) * smoothstep(0.1, 0.26, slope) * (1 - smoothstep(0.42, 0.62, slope));
    const rock = smoothstep(0.3, 0.52, slope) + smoothstep(0.7, 0.92, height01) * 0.4;
    let wSand = sand;
    let wGrass = Math.max(0.05, grass);
    let wPath = path;
    let wRock = rock;
    const sum = wSand + wGrass + wPath + wRock || 1;
    return {
        sand: wSand / sum,
        grass: wGrass / sum,
        path: wPath / sum,
        rock: wRock / sum,
    };
}

/**
 * Image nord en haut (py = 0). +Z = sud sur le mesh → py=0 échantillonne vMesh≈0 (−Z = nord).
 * @param {{
 *   geometry: import("three").BufferGeometry,
 *   sizeMeters: number,
 *   layerUrls?: Record<string, { color?: string, normal?: string }>,
 *   onProgress?: (p: number, label: string) => void,
 * }} opts
 */
export async function bakeSplatLayers(opts) {
    const { geometry, sizeMeters, layerUrls = {}, onProgress } = opts;
    onProgress?.(0.02, "Chargement des textures sol…");
    const urls = {
        grass: { ...LAYER_DEFS.grass, ...layerUrls.grass },
        sand: { ...LAYER_DEFS.sand, ...layerUrls.sand },
        path: { ...LAYER_DEFS.path, ...layerUrls.path },
        rock: { ...LAYER_DEFS.rock, ...layerUrls.rock },
        road: { ...LAYER_DEFS.road, ...layerUrls.road },
    };
    const [grassC, sandC, pathC, rockC, grassN, sandN, pathN, rockN] = await Promise.all([
        loadImageData(urls.grass.color),
        loadImageData(urls.sand.color),
        loadImageData(urls.path.color),
        loadImageData(urls.rock.color),
        loadImageData(urls.grass.normal),
        loadImageData(urls.sand.normal),
        loadImageData(urls.path.normal),
        loadImageData(urls.rock.normal),
    ]);

    geometry.computeVertexNormals();
    const relief = sampleTerrainRelief(geometry, sizeMeters);
    const span = relief.hMax - relief.hMin;
    const flat = span < 0.18;
    const tiles = Math.max(4, sizeMeters / METERS_PER_TILE);
    const res = SPLAT_RES;
    const color = new ImageData(res, res);
    const normal = new ImageData(res, res);

    const yieldEvery = 24;
    for (let py = 0; py < res; py += 1) {
        const vMesh = (py + 0.5) / res;
        for (let px = 0; px < res; px += 1) {
            const u = (px + 0.5) / res;
            const height = sampleGrid(relief.heights, relief.res, u, vMesh);
            const slope = sampleGrid(relief.slopes, relief.res, u, vMesh);
            const height01 = span > 1e-4 ? (height - relief.hMin) / span : 0.45;
            const w = layerWeights(height01, slope, flat);
            const tu = u * tiles;
            const tv = vMesh * tiles;
            const g = sampleTile(grassC, tu, tv);
            const s = sampleTile(sandC, tu, tv);
            const p = sampleTile(pathC, tu, tv);
            const r = sampleTile(rockC, tu, tv);
            const gn = sampleTile(grassN, tu, tv);
            const sn = sampleTile(sandN, tu, tv);
            const pn = sampleTile(pathN, tu, tv);
            const rn = sampleTile(rockN, tu, tv);
            const oi = (py * res + px) * 4;
            color.data[oi] = g[0] * w.grass + s[0] * w.sand + p[0] * w.path + r[0] * w.rock;
            color.data[oi + 1] = g[1] * w.grass + s[1] * w.sand + p[1] * w.path + r[1] * w.rock;
            color.data[oi + 2] = g[2] * w.grass + s[2] * w.sand + p[2] * w.path + r[2] * w.rock;
            color.data[oi + 3] = 255;
            normal.data[oi] = gn[0] * w.grass + sn[0] * w.sand + pn[0] * w.path + rn[0] * w.rock;
            normal.data[oi + 1] = gn[1] * w.grass + sn[1] * w.sand + pn[1] * w.path + rn[1] * w.rock;
            normal.data[oi + 2] = gn[2] * w.grass + sn[2] * w.sand + pn[2] * w.path + rn[2] * w.rock;
            normal.data[oi + 3] = 255;
        }
        if (py % yieldEvery === 0) {
            onProgress?.(0.12 + (py / res) * 0.82, "Plaquage herbe / sable / sentier…");
            await new Promise((resolve) => requestAnimationFrame(resolve));
        }
    }

    return { color, normal, relief };
}

/**
 * @param {{
 *   geometry: import("three").BufferGeometry,
 *   sizeMeters: number,
 * }} opts
 * @param {number} res
 */
function bakeHeightNormals(opts, res) {
    const { geometry, sizeMeters } = opts;
    geometry.computeVertexNormals();
    const relief = sampleTerrainRelief(geometry, sizeMeters);
    const normal = new ImageData(res, res);
    const texelM = sizeMeters / res;
    for (let py = 0; py < res; py += 1) {
        const vMesh = (py + 0.5) / res;
        for (let px = 0; px < res; px += 1) {
            const u = (px + 0.5) / res;
            const du = 1 / res;
            const hL = sampleGrid(relief.heights, relief.res, Math.max(0, u - du), vMesh);
            const hR = sampleGrid(relief.heights, relief.res, Math.min(1, u + du), vMesh);
            const hD = sampleGrid(relief.heights, relief.res, u, Math.max(0, vMesh - du));
            const hU = sampleGrid(relief.heights, relief.res, u, Math.min(1, vMesh + du));
            const nx = -(hR - hL) / (2 * texelM);
            const nz = -(hU - hD) / (2 * texelM);
            const ny = 1;
            const len = Math.hypot(nx, ny, nz) || 1;
            const oi = (py * res + px) * 4;
            normal.data[oi] = ((nx / len) * 0.5 + 0.5) * 255;
            normal.data[oi + 1] = ((nz / len) * 0.5 + 0.5) * 255;
            normal.data[oi + 2] = ((ny / len) * 0.5 + 0.5) * 255;
            normal.data[oi + 3] = 255;
        }
    }
    return normal;
}

/**
 * @param {ImageData} image
 * @returns {HTMLCanvasElement}
 */
function imageDataToCanvas(image) {
    const canvas = document.createElement("canvas");
    canvas.width = image.width;
    canvas.height = image.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas image impossible");
    ctx.putImageData(image, 0, 0);
    return canvas;
}

/**
 * Chemin rapide : photo aérienne + bitume (sans boucle pixel).
 * @param {ImageData} ortho
 * @param {ImageData | null} roadMask
 * @param {ImageData | null} roadColor
 * @param {boolean} showRoads
 * @param {number} sizeMeters
 * @param {number} res
 */
function compositeOrthoColor(
    ortho,
    roadMask,
    roadColor,
    showRoads,
    sizeMeters,
    res,
    roadElements = null,
    roadBbox = null
) {
    const canvas = document.createElement("canvas");
    canvas.width = res;
    canvas.height = res;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Composition ortho impossible");
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(imageDataToCanvas(ortho), 0, 0, res, res);
    if (!showRoads) return canvas;

    if (roadElements && roadBbox) {
        paintOsmRoadsOnContext(ctx, roadElements, roadBbox, res, sizeMeters);
        return canvas;
    }

    if (roadMask) {
        const src = roadMask;
        const overlay = ctx.createImageData(res, res);
        const dw = overlay.data;
        const sw = src.width;
        const sh = src.height;
        for (let py = 0; py < res; py += 1) {
            const sy = Math.min(sh - 1, Math.floor((py / res) * sh));
            for (let px = 0; px < res; px += 1) {
                const sx = Math.min(sw - 1, Math.floor((px / res) * sw));
                const a = src.data[(sy * sw + sx) * 4];
                if (a < 16) continue;
                const i = (py * res + px) * 4;
                dw[i] = 90;
                dw[i + 1] = 90;
                dw[i + 2] = 96;
                dw[i + 3] = Math.round(230 * (a / 255));
            }
        }
        const layer = document.createElement("canvas");
        layer.width = res;
        layer.height = res;
        const lCtx = layer.getContext("2d");
        if (lCtx) {
            lCtx.putImageData(overlay, 0, 0);
            ctx.drawImage(layer, 0, 0);
        }
    }
    return canvas;
}

/**
 * Mix ortho + splat + overlay bitume (image nord en haut).
 * @param {{
 *   splatColor?: ImageData | null,
 *   splatNormal?: ImageData | null,
 *   ortho?: ImageData | null,
 *   orthoMix?: number,
 *   roadMask?: ImageData | null,
 *   showRoads?: boolean,
 *   roadColor?: ImageData | null,
 *   roadNormal?: ImageData | null,
 *   heightNormal?: ImageData | null,
 *   sizeMeters: number,
 *   resolution?: number,
 * }} opts
 */
export function mixGroundMaps(opts) {
    const {
        splatColor = null,
        splatNormal = null,
        ortho = null,
        orthoMix = 1,
        roadMask = null,
        showRoads = true,
        roadColor = null,
        roadNormal = null,
        heightNormal = null,
        sizeMeters,
        resolution = 2048,
    } = opts;
    const res = resolution;
    const color = new ImageData(res, res);
    const normal = new ImageData(res, res);
    const mix = ortho && orthoMix > 0.001 ? Math.min(1, Math.max(0, orthoMix)) : 0;
    const tiles = Math.max(4, sizeMeters / METERS_PER_TILE);
    const useRoads = Boolean(showRoads && roadMask && roadColor);

    for (let py = 0; py < res; py += 1) {
        const v = (py + 0.5) / res;
        const vMesh = v;
        for (let px = 0; px < res; px += 1) {
            const u = (px + 0.5) / res;
            let cr;
            let cg;
            let cb;
            let nr;
            let ng;
            let nb;
            if (mix >= 0.999 && ortho) {
                const o = sampleImage(ortho, u, v);
                cr = o[0];
                cg = o[1];
                cb = o[2];
                if (heightNormal) {
                    const n = sampleImage(heightNormal, u, v);
                    nr = n[0];
                    ng = n[1];
                    nb = n[2];
                } else if (splatNormal) {
                    const n = sampleImage(splatNormal, u, v);
                    nr = n[0];
                    ng = n[1];
                    nb = n[2];
                } else {
                    nr = 128;
                    ng = 128;
                    nb = 255;
                }
            } else {
                const s = splatColor ? sampleImage(splatColor, u, v) : [70, 90, 55, 255];
                const sn = splatNormal ? sampleImage(splatNormal, u, v) : [128, 128, 255, 255];
                if (ortho && mix > 0) {
                    const o = sampleImage(ortho, u, v);
                    cr = s[0] * (1 - mix) + o[0] * mix;
                    cg = s[1] * (1 - mix) + o[1] * mix;
                    cb = s[2] * (1 - mix) + o[2] * mix;
                    const hn = heightNormal ? sampleImage(heightNormal, u, v) : sn;
                    nr = sn[0] * (1 - mix) + hn[0] * mix;
                    ng = sn[1] * (1 - mix) + hn[1] * mix;
                    nb = sn[2] * (1 - mix) + hn[2] * mix;
                } else {
                    cr = s[0];
                    cg = s[1];
                    cb = s[2];
                    nr = sn[0];
                    ng = sn[1];
                    nb = sn[2];
                }
            }

            if (useRoads) {
                const m = sampleImage(roadMask, u, v)[0] / 255;
                if (m > 0.03 && roadColor) {
                    const tu = u * tiles * 1.4;
                    const tv = vMesh * tiles * 1.4;
                    const road = sampleTile(roadColor, tu, tv);
                    const roadNrm = roadNormal ? sampleTile(roadNormal, tu, tv) : [128, 128, 255];
                    const t = Math.min(1, 0.35 + m * 0.85);
                    cr = cr * (1 - t) * 0.45 + 32 * t * 0.22 + road[0] * t;
                    cg = cg * (1 - t) * 0.45 + 32 * t * 0.22 + road[1] * t;
                    cb = cb * (1 - t) * 0.45 + 34 * t * 0.22 + road[2] * t;
                    nr = nr * (1 - t) + roadNrm[0] * t;
                    ng = ng * (1 - t) + roadNrm[1] * t;
                    nb = nb * (1 - t) + roadNrm[2] * t;
                }
            }

            const oi = (py * res + px) * 4;
            color.data[oi] = cr;
            color.data[oi + 1] = cg;
            color.data[oi + 2] = cb;
            color.data[oi + 3] = 255;
            normal.data[oi] = nr;
            normal.data[oi + 1] = ng;
            normal.data[oi + 2] = nb;
            normal.data[oi + 3] = 255;
        }
    }

    return { color, normal };
}

/**
 * @param {{
 *   geometry: import("three").BufferGeometry,
 *   sizeMeters: number,
 *   ortho?: ImageData | null,
 *   orthoMix?: number,
 *   roadMask?: ImageData | null,
 *   showRoads?: boolean,
 *   roadElements?: object[] | null,
 *   roadBbox?: { south: number, west: number, north: number, east: number } | null,
 *   layerUrls?: Record<string, { color?: string, normal?: string }>,
 *   splatCache?: { color: ImageData, normal: ImageData } | null,
 *   onProgress?: (p: number, label: string) => void,
 * }} opts
 */
export async function composeTerrainGround(opts) {
    const {
        geometry,
        sizeMeters,
        ortho = null,
        orthoMix = 1,
        roadMask = null,
        showRoads = true,
        roadElements = null,
        roadBbox = null,
        layerUrls = {},
        splatCache = null,
        onProgress,
    } = opts;

    const mix = ortho ? Math.min(1, Math.max(0, orthoMix)) : 0;
    const needSplat = mix < 0.995;
    let splat = splatCache;
    if (needSplat && !splat) {
        splat = await bakeSplatLayers({
            geometry,
            sizeMeters,
            layerUrls,
            onProgress,
        });
    }

    onProgress?.(0.9, "Calques routes / photo…");
    const urls = { ...LAYER_DEFS.road, ...layerUrls.road };
    /** @type {ImageData | null} */
    let roadColor = null;
    /** @type {ImageData | null} */
    let roadNormal = null;
    if (showRoads && roadMask) {
        try {
            [roadColor, roadNormal] = await Promise.all([
                loadImageData(urls.color),
                loadImageData(urls.normal),
            ]);
        } catch {
            roadColor = null;
            roadNormal = null;
        }
    }

    const outRes = ortho ? Math.min(2048, ortho.width) : splat ? splat.color.width : SPLAT_RES;

    if (mix >= 0.995 && ortho) {
        const colorCanvas = compositeOrthoColor(
            ortho,
            roadMask,
            roadColor,
            showRoads,
            sizeMeters,
            outRes,
            roadElements,
            roadBbox
        );
        onProgress?.(0.97, "Encodage des textures…");
        return {
            colorUrl: colorCanvas.toDataURL("image/jpeg", 0.92),
            normalUrl: null,
            resolution: outRes,
            splat,
        };
    }
    const maps = mixGroundMaps({
        splatColor: splat?.color ?? null,
        splatNormal: splat?.normal ?? null,
        ortho,
        orthoMix: mix,
        roadMask,
        showRoads,
        roadColor,
        roadNormal,
        heightNormal: null,
        sizeMeters,
        resolution: outRes,
    });

    onProgress?.(0.97, "Encodage des textures…");
    return {
        colorUrl: imageDataToJpeg(maps.color),
        normalUrl: imageDataToPng(maps.normal),
        resolution: outRes,
        splat,
    };
}

/**
 * @param {{
 *   geometry: import("three").BufferGeometry,
 *   sizeMeters: number,
 *   roadMask?: ImageData | null,
 *   onProgress?: (p: number, label: string) => void,
 * }} opts
 */
export async function buildRealisticHeightmapMaps(opts) {
    return composeTerrainGround({
        geometry: opts.geometry,
        sizeMeters: opts.sizeMeters,
        roadMask: opts.roadMask ?? null,
        showRoads: Boolean(opts.roadMask),
        ortho: null,
        orthoMix: 0,
        onProgress: opts.onProgress,
    });
}

/**
 * @param {ImageData} image
 * @param {number} [quality]
 */
export function imageDataToJpeg(image, quality = 0.86) {
    const canvas = document.createElement("canvas");
    canvas.width = image.width;
    canvas.height = image.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Encodage texture impossible");
    ctx.putImageData(image, 0, 0);
    return canvas.toDataURL("image/jpeg", quality);
}

/**
 * @param {ImageData} image
 */
export function imageDataToPng(image) {
    const canvas = document.createElement("canvas");
    canvas.width = image.width;
    canvas.height = image.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Encodage normal map impossible");
    ctx.putImageData(image, 0, 0);
    return canvas.toDataURL("image/png");
}
