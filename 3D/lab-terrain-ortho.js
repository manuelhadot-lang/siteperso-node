/** Orthophoto IGN (BD ORTHO) alignée sur la zone du heightmap. */

import { terrainFootprintBounds } from "./lab-terrain-ign.js";

const TILE_PX = 256;
const MAX_TILES = 64;
const MIN_ZOOM = 12;
const MAX_ZOOM = 19;

/**
 * @param {number} lon
 * @param {number} zoom
 */
function lonToTileX(lon, zoom) {
    return ((lon + 180) / 360) * 2 ** zoom;
}

/**
 * Web Mercator (y = 0 au pôle Nord, comme OSM / IGN PM).
 * @param {number} lat
 * @param {number} zoom
 */
function latToTileY(lat, zoom) {
    const s = Math.sin((lat * Math.PI) / 180);
    const clamped = Math.min(0.9999, Math.max(-0.9999, s));
    return (0.5 - Math.log((1 + clamped) / (1 - clamped)) / (4 * Math.PI)) * 2 ** zoom;
}

/**
 * @param {number} sizeMeters
 */
function chooseOrthoZoom(sizeMeters) {
    if (sizeMeters <= 180) return 19;
    if (sizeMeters <= 350) return 18;
    if (sizeMeters <= 700) return 17;
    if (sizeMeters <= 1400) return 16;
    return 15;
}

/**
 * @param {number} z
 * @param {number} x
 * @param {number} y
 * @returns {Promise<HTMLImageElement | null>}
 */
async function loadOrthoTile(z, x, y) {
    try {
        const res = await fetch(`/api/ign/ortho-tile?z=${z}&x=${x}&y=${y}`, {
            credentials: "same-origin",
            cache: "no-store",
        });
        if (!res.ok) return null;
        const type = res.headers.get("content-type") || "";
        if (!type.startsWith("image/")) return null;
        const blob = await res.blob();
        if (blob.size < 32) return null;
        const url = URL.createObjectURL(blob);
        try {
            const image = await new Promise((resolve, reject) => {
                const img = new Image();
                img.onload = () => resolve(img);
                img.onerror = () => reject(new Error("decode"));
                img.src = url;
            });
            return image;
        } finally {
            URL.revokeObjectURL(url);
        }
    } catch {
        return null;
    }
}

/**
 * Assemble l’orthophoto IGN de la zone terrain (nord en haut de l’image).
 * Recadrage en lat/lon équirectangulaire (mêmes mètres que le heightmap / OSM),
 * pas un simple stretch du rectangle Web Mercator — sinon les routes décalent.
 * @param {number} lat
 * @param {number} lon
 * @param {number} sizeMeters
 * @param {number} [resolution]
 * @param {(p: number, label: string) => void} [onProgress]
 * @returns {Promise<{ imageData: ImageData, dataUrl: string, zoom: number, tileCount: number }>}
 */
export async function buildIgnOrthoForTerrain(
    lat,
    lon,
    sizeMeters,
    resolution = 2048,
    onProgress
) {
    const footprint = terrainFootprintBounds(sizeMeters, lat, lon);
    const south = footprint[0][0];
    const west = footprint[0][1];
    const north = footprint[1][0];
    const east = footprint[1][1];

    let zoom = chooseOrthoZoom(sizeMeters);
    let minTx = 0;
    let maxTx = 0;
    let minTy = 0;
    let maxTy = 0;
    let nx = 1;
    let ny = 1;
    while (zoom >= MIN_ZOOM) {
        minTx = Math.floor(lonToTileX(west, zoom));
        maxTx = Math.floor(lonToTileX(east, zoom));
        minTy = Math.floor(latToTileY(north, zoom));
        maxTy = Math.floor(latToTileY(south, zoom));
        nx = maxTx - minTx + 1;
        ny = maxTy - minTy + 1;
        if (nx * ny <= MAX_TILES) break;
        zoom -= 1;
    }
    zoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, zoom));

    const mosaic = document.createElement("canvas");
    mosaic.width = nx * TILE_PX;
    mosaic.height = ny * TILE_PX;
    const mosaicCtx = mosaic.getContext("2d", { willReadFrequently: true });
    if (!mosaicCtx) throw new Error("Assemblage orthophoto impossible");
    mosaicCtx.fillStyle = "#3d4f32";
    mosaicCtx.fillRect(0, 0, mosaic.width, mosaic.height);

    const tiles = [];
    for (let ty = minTy; ty <= maxTy; ty += 1) {
        for (let tx = minTx; tx <= maxTx; tx += 1) {
            tiles.push({ tx, ty });
        }
    }

    let drawn = 0;
    let loaded = 0;
    const batch = 6;
    for (let i = 0; i < tiles.length; i += batch) {
        const slice = tiles.slice(i, i + batch);
        const images = await Promise.all(slice.map((t) => loadOrthoTile(zoom, t.tx, t.ty)));
        slice.forEach((t, idx) => {
            const img = images[idx];
            if (!img) return;
            mosaicCtx.drawImage(img, (t.tx - minTx) * TILE_PX, (t.ty - minTy) * TILE_PX);
            drawn += 1;
        });
        loaded += slice.length;
        onProgress?.(
            0.05 + (loaded / tiles.length) * 0.75,
            `Orthophoto IGN… ${drawn}/${tiles.length} tuiles`
        );
        await new Promise((resolve) => requestAnimationFrame(resolve));
    }
    if (drawn === 0) {
        throw new Error(
            "Aucune tuile orthophoto IGN — redémarrez le serveur Node puis Ctrl+F5"
        );
    }

    const mosaicData = mosaicCtx.getImageData(0, 0, mosaic.width, mosaic.height);
    const mw = mosaic.width;
    const mh = mosaic.height;
    const md = mosaicData.data;
    const latSpan = north - south || 1e-9;
    const lonSpan = east - west || 1e-9;

    const out = document.createElement("canvas");
    const res = Math.max(256, Math.min(2048, resolution));
    out.width = res;
    out.height = res;
    const ctx = out.getContext("2d");
    if (!ctx) throw new Error("Recadrage orthophoto impossible");
    const outImg = ctx.createImageData(res, res);
    const od = outImg.data;

    onProgress?.(0.88, "Alignement geo orthophoto…");

    /**
     * @param {number} fx
     * @param {number} fy
     * @returns {[number, number, number]}
     */
    function sampleMosaic(fx, fy) {
        const x = Math.min(mw - 1, Math.max(0, fx));
        const y = Math.min(mh - 1, Math.max(0, fy));
        const x0 = Math.floor(x);
        const y0 = Math.floor(y);
        const x1 = Math.min(mw - 1, x0 + 1);
        const y1 = Math.min(mh - 1, y0 + 1);
        const tx = x - x0;
        const ty = y - y0;
        const i00 = (y0 * mw + x0) * 4;
        const i10 = (y0 * mw + x1) * 4;
        const i01 = (y1 * mw + x0) * 4;
        const i11 = (y1 * mw + x1) * 4;
        /** @param {number} c */
        const lerp = (c) =>
            md[i00 + c] * (1 - tx) * (1 - ty) +
            md[i10 + c] * tx * (1 - ty) +
            md[i01 + c] * (1 - tx) * ty +
            md[i11 + c] * tx * ty;
        return [lerp(0), lerp(1), lerp(2)];
    }

    for (let py = 0; py < res; py += 1) {
        // Nord en haut (py = 0) — flipY = true + UV v = nord.
        const la = north - ((py + 0.5) / res) * latSpan;
        for (let px = 0; px < res; px += 1) {
            const lo = west + ((px + 0.5) / res) * lonSpan;
            const fx = lonToTileX(lo, zoom) * TILE_PX - minTx * TILE_PX;
            const fy = latToTileY(la, zoom) * TILE_PX - minTy * TILE_PX;
            const [r, g, b] = sampleMosaic(fx, fy);
            const oi = (py * res + px) * 4;
            od[oi] = r;
            od[oi + 1] = g;
            od[oi + 2] = b;
            od[oi + 3] = 255;
        }
        if (py % 128 === 0) {
            onProgress?.(0.88 + (py / res) * 0.08, "Alignement geo orthophoto…");
            await new Promise((resolve) => requestAnimationFrame(resolve));
        }
    }

    ctx.putImageData(outImg, 0, 0);
    const imageData = outImg;
    const dataUrl = out.toDataURL("image/jpeg", 0.9);
    return { imageData, dataUrl, zoom, tileCount: tiles.length };
}

/**
 * @param {string} dataUrl
 * @returns {Promise<ImageData>}
 */
export function dataUrlToImageData(dataUrl) {
    return new Promise((resolve, reject) => {
        const image = new Image();
        image.onload = () => {
            const canvas = document.createElement("canvas");
            canvas.width = image.naturalWidth || image.width;
            canvas.height = image.naturalHeight || image.height;
            const ctx = canvas.getContext("2d", { willReadFrequently: true });
            if (!ctx) {
                reject(new Error("Lecture image impossible"));
                return;
            }
            ctx.drawImage(image, 0, 0);
            resolve(ctx.getImageData(0, 0, canvas.width, canvas.height));
        };
        image.onerror = () => reject(new Error("Image illisible"));
        image.src = dataUrl;
    });
}
