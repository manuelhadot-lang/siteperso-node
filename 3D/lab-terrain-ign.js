/** Relief réel France — API altimétrique IGN (RGE ALTI®, ~1–5 m). */

const IGN_ELEVATION_URL =
    "https://data.geopf.fr/altimetrie/1.0/calcul/alti/rest/elevation.json";
const IGN_RESOURCE = "ign_rge_alti_wld";
/** Points / requête vers notre proxy (POST JSON). Aligné sur le plafond serveur. */
const IGN_BATCH_SIZE = 5000;
/** GET direct navigateur vers l’IGN : URL max ~2–8 ko. */
const IGN_DIRECT_GET_MAX = 80;
/** Respecter ~5 req/s max (proxy + IGN). */
const IGN_BATCH_DELAY_MS = 80;

/** Grille IGN compacte (65×65) — un seul POST, puis sur-échantillon local. */
export const IGN_GRID_SEGMENTS = 64;

function getIgnProxyUrl() {
    if (typeof window !== "undefined" && window.location?.origin) {
        return `${window.location.origin}/api/ign/elevation`;
    }
    return "/api/ign/elevation";
}

const METERS_PER_DEG_LAT = 111_320;

/**
 * @param {number} lat
 */
function metersPerDegreeLon(lat) {
    return METERS_PER_DEG_LAT * Math.cos((lat * Math.PI) / 180);
}

/**
 * @param {number} centerLat
 * @param {number} centerLon
 * @param {number} localX mètres est
 * @param {number} localZ mètres sud (+Z = sud sur le maillage terrain)
 */
export function localTerrainToWgs84(centerLat, centerLon, localX, localZ) {
    const mLon = metersPerDegreeLon(centerLat);
    return {
        lat: centerLat - localZ / METERS_PER_DEG_LAT,
        lon: centerLon + localX / mLon,
    };
}

/**
 * WGS84 → local terrain (m). +X = est, +Z = sud
 * (PlaneGeometry + rotateX(-π/2) : le nord géographique est en −Z).
 * @param {number} centerLat
 * @param {number} centerLon
 * @param {number} lat
 * @param {number} lon
 * @returns {{ x: number, z: number }}
 */
export function wgs84ToLocalTerrain(centerLat, centerLon, lat, lon) {
    const mLon = metersPerDegreeLon(centerLat);
    return {
        x: (lon - centerLon) * mLon,
        z: (centerLat - lat) * METERS_PER_DEG_LAT,
    };
}

/**
 * @param {number} centerLat
 * @param {number} centerLon
 * @param {number} sizeMeters
 * @param {number} segments
 * @returns {{ lat: number, lon: number, index: number }[]}
 */
export function buildIgnSampleGrid(centerLat, centerLon, sizeMeters, segments) {
    /** @type {{ lat: number, lon: number, index: number }[]} */
    const samples = [];
    const half = sizeMeters * 0.5;
    const step = sizeMeters / segments;
    for (let j = 0; j <= segments; j += 1) {
        for (let i = 0; i <= segments; i += 1) {
            const localX = -half + i * step;
            const localZ = -half + j * step;
            const { lat, lon } = localTerrainToWgs84(centerLat, centerLon, localX, localZ);
            samples.push({
                lat,
                lon,
                index: j * (segments + 1) + i,
            });
        }
    }
    return samples;
}

/**
 * @param {number} elevation
 */
function isValidIgnElevation(elevation) {
    return typeof elevation === "number" && Number.isFinite(elevation) && elevation > -9000;
}

/**
 * @param {string[]} lats
 * @param {string[]} lons
 * @returns {Promise<number[]>}
 */
async function fetchIgnElevationsBatch(lats, lons) {
    const proxyUrl = getIgnProxyUrl();
    let proxyError = "";

    try {
        const proxyRes = await fetch(proxyUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "same-origin",
            body: JSON.stringify({ lats, lons }),
            cache: "no-store",
        });
        let data = null;
        try {
            data = await proxyRes.json();
        } catch {
            data = null;
        }
        if (proxyRes.ok && Array.isArray(data?.elevations)) {
            return data.elevations;
        }
        proxyError =
            (data && typeof data.error === "string" && data.error) ||
            (proxyRes.status === 404
                ? "route /api/ign/elevation absente — redémarrez npm start"
                : `HTTP ${proxyRes.status}`);
    } catch (error) {
        proxyError = error instanceof Error ? error.message : "réseau";
    }

    if (lats.length > IGN_DIRECT_GET_MAX) {
        throw new Error(
            `Relief IGN via serveur impossible (${proxyError}). ` +
                "Ctrl+C puis npm start, ouvrez http://localhost:3000/3D/ et Ctrl+F5."
        );
    }

    const params = new URLSearchParams({
        lon: lons.join("|"),
        lat: lats.join("|"),
        resource: IGN_RESOURCE,
        delimiter: "|",
        measures: "false",
        zonly: "true",
    });
    const response = await fetch(`${IGN_ELEVATION_URL}?${params.toString()}`, {
        cache: "no-store",
    });
    if (!response.ok) {
        throw new Error(`Service IGN indisponible (${response.status})`);
    }
    const data = await response.json();
    if (!Array.isArray(data?.elevations)) {
        throw new Error("Réponse IGN altimétrique invalide");
    }
    return data.elevations;
}

function delay(ms) {
    return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function minMaxFinite(values) {
    let min = Infinity;
    let max = -Infinity;
    let count = 0;
    for (let i = 0; i < values.length; i += 1) {
        const value = values[i];
        if (typeof value !== "number" || !Number.isFinite(value)) continue;
        if (value < min) min = value;
        if (value > max) max = value;
        count += 1;
    }
    return { min, max, count };
}

/**
 * @param {number} centerLat
 * @param {number} centerLon
 * @param {number} sizeMeters
 * @param {number} [segments]
 * @param {(progress: number) => void} [onProgress]
 */
export async function fetchIgnHeightGrid(
    centerLat,
    centerLon,
    sizeMeters,
    segments = 320,
    onProgress
) {
    const samples = buildIgnSampleGrid(centerLat, centerLon, sizeMeters, segments);
    /** @type {(number | null)[]} */
    const elevations = new Array(samples.length).fill(null);

    for (let start = 0; start < samples.length; start += IGN_BATCH_SIZE) {
        const chunk = samples.slice(start, start + IGN_BATCH_SIZE);
        const lats = chunk.map((sample) => sample.lat.toFixed(6));
        const lons = chunk.map((sample) => sample.lon.toFixed(6));
        const batch = await fetchIgnElevationsBatch(lats, lons);
        if (batch.length !== chunk.length) {
            throw new Error("Nombre d’altitudes IGN incohérent");
        }
        chunk.forEach((sample, index) => {
            const value = batch[index];
            elevations[sample.index] = isValidIgnElevation(value) ? value : null;
        });
        onProgress?.(Math.min(1, (start + chunk.length) / samples.length));
        if (start + IGN_BATCH_SIZE < samples.length) {
            await delay(IGN_BATCH_DELAY_MS);
        }
    }

    const { min, max, count } = minMaxFinite(elevations);
    if (!count) {
        throw new Error(
            "Aucune altitude IGN pour cette zone (hors France métropolitaine / DOM ou zone restreinte)"
        );
    }

    return {
        elevations,
        minElev: min,
        maxElev: max,
        centerLat,
        centerLon,
        sizeMeters,
        segments,
        sampleCount: samples.length,
    };
}

/**
 * Agrandit une grille d’altitudes (65×65 → maillage lab) par interpolation bilinéaire.
 * @param {(number | null)[]} src
 * @param {number} srcSegments
 * @param {number} dstSegments
 * @returns {(number | null)[]}
 */
export function upsampleIgnElevations(src, srcSegments, dstSegments) {
    const srcN = srcSegments + 1;
    const dstN = dstSegments + 1;
    if (srcN === dstN) return src.slice();
    /** @type {(number | null)[]} */
    const out = new Array(dstN * dstN);
    const at = (i, j) => {
        const v = src[j * srcN + i];
        return typeof v === "number" && Number.isFinite(v) ? v : null;
    };
    for (let j = 0; j < dstN; j += 1) {
        const fv = dstN === 1 ? 0 : (j / (dstN - 1)) * (srcN - 1);
        const j0 = Math.floor(fv);
        const j1 = Math.min(srcN - 1, j0 + 1);
        const ty = fv - j0;
        for (let i = 0; i < dstN; i += 1) {
            const fu = dstN === 1 ? 0 : (i / (dstN - 1)) * (srcN - 1);
            const i0 = Math.floor(fu);
            const i1 = Math.min(srcN - 1, i0 + 1);
            const tx = fu - i0;
            const z00 = at(i0, j0);
            const z10 = at(i1, j0);
            const z01 = at(i0, j1);
            const z11 = at(i1, j1);
            const samples = [z00, z10, z01, z11].filter((z) => z != null);
            if (!samples.length) {
                out[j * dstN + i] = null;
                continue;
            }
            const a = z00 ?? samples[0];
            const b = z10 ?? a;
            const c = z01 ?? a;
            const d = z11 ?? b;
            out[j * dstN + i] =
                a * (1 - tx) * (1 - ty) + b * tx * (1 - ty) + c * (1 - tx) * ty + d * tx * ty;
        }
    }
    return out;
}

/**
 * Convertit les altitudes IGN en hauteurs mesh visibles (exagération verticale).
 * Seul le dénivelé relatif compte : une zone plate à 500 m d’altitude reste plate.
 * @param {(number | null)[]} elevations
 * @param {number} minElev
 * @param {number} maxElev
 * @param {number} sizeMeters
 */
export function mapIgnElevationsToMeshHeights(elevations, minElev, maxElev, sizeMeters) {
    const realSpan = maxElev - minElev;
    if (!Number.isFinite(realSpan) || realSpan < 0.5) {
        return elevations.map(() => 0);
    }
    const slope = realSpan / Math.max(sizeMeters, 1);
    let targetSpan;
    if (slope < 0.14) {
        // Colline / plateau (ex. Mont Valérien ~55 m / 500 m) : échelle proche du réel
        targetSpan = Math.max(realSpan, sizeMeters * 0.02);
    } else if (slope < 0.32) {
        targetSpan = realSpan * 1.05;
    } else {
        targetSpan = Math.min(realSpan * 1.12, sizeMeters * 0.22);
    }
    targetSpan = Math.min(targetSpan, sizeMeters * 0.26);
    const scale = targetSpan / realSpan;

    return elevations.map((value) => {
        const z = value === null || !isValidIgnElevation(value) ? minElev : value;
        return (z - minElev) * scale;
    });
}

/**
 * Applique les hauteurs IGN sur le maillage terrain via les coordonnées locales X/Z
 * (aligné sur PlaneGeometry + rotateX, contrairement à l’index brut du buffer).
 * @param {THREE.BufferAttribute} positions
 * @param {number[]} meshHeights
 * @param {number} sizeMeters
 * @param {number} segments
 */
export function applyMeshHeightsToTerrainPositions(positions, meshHeights, sizeMeters, segments) {
    const half = sizeMeters * 0.5;
    const step = sizeMeters / segments;
    const row = segments + 1;
    for (let vi = 0; vi < positions.count; vi += 1) {
        const x = positions.getX(vi);
        const z = positions.getZ(vi);
        const i = Math.max(0, Math.min(segments, Math.round((x + half) / step)));
        const j = Math.max(0, Math.min(segments, Math.round((z + half) / step)));
        positions.setY(vi, meshHeights[j * row + i] ?? 0);
    }
}

/**
 * UV monde : u = est, v = nord géographique (−Z, car +Z = sud).
 * Texture geo : **nord en haut** + flipY = true.
 * @param {import("three").BufferGeometry} geometry
 * @param {number} sizeMeters
 */
export function applyTerrainGeoUVs(geometry, sizeMeters) {
    const positions = geometry.attributes.position;
    const uv = geometry.attributes.uv;
    if (!positions || !uv) return;
    const half = sizeMeters * 0.5;
    const size = sizeMeters || 1;
    for (let i = 0; i < positions.count; i += 1) {
        const u = (positions.getX(i) + half) / size;
        const v = 1 - (positions.getZ(i) + half) / size;
        uv.setXY(i, u, v);
    }
    uv.needsUpdate = true;
}

/**
 * @param {number} sizeMeters
 * @param {number} lat
 * @param {number} lon
 */
export function terrainFootprintBounds(sizeMeters, lat, lon) {
    const half = sizeMeters * 0.5;
    const dLat = half / METERS_PER_DEG_LAT;
    const dLon = half / metersPerDegreeLon(lat);
    return [
        [lat - dLat, lon - dLon],
        [lat + dLat, lon + dLon],
    ];
}

/**
 * Taille carrée (m) inscrite dans les bounds visibles de la carte.
 * @param {{ getSouthWest: () => { lat: number, lng: number }, getNorthEast: () => { lat: number, lng: number }, getCenter: () => { lat: number, lng: number } }} bounds
 * @param {{ min?: number, max?: number }} [limits]
 */
export function mapBoundsToImportZone(bounds, limits = {}) {
    const minSize = limits.min ?? 100;
    const maxSize = limits.max ?? 2000;
    const center = bounds.getCenter();
    const sw = bounds.getSouthWest();
    const ne = bounds.getNorthEast();
    const lat = center.lat;
    const widthM = Math.abs(ne.lng - sw.lng) * metersPerDegreeLon(lat);
    const heightM = Math.abs(ne.lat - sw.lat) * METERS_PER_DEG_LAT;
    const rawSize = Math.min(widthM, heightM);
    const sizeMeters = Math.max(minSize, Math.min(maxSize, rawSize));
    return {
        lat,
        lon: center.lng,
        sizeMeters,
        widthM,
        heightM,
        clamped: rawSize < minSize || rawSize > maxSize,
    };
}

/**
 * @param {(number | null)[]} elevations
 * @param {number} resolution
 * @returns {string} data URL PNG grayscale
 */
export function elevationsToHeightmapDataUrl(elevations, resolution) {
    const canvas = document.createElement("canvas");
    canvas.width = resolution;
    canvas.height = resolution;
    const ctx = canvas.getContext("2d");
    if (!ctx) return "";
    const finiteStats = minMaxFinite(elevations);
    if (!finiteStats.count) return "";
    const min = finiteStats.min;
    const max = finiteStats.max;
    const span = max - min || 1;
    const image = ctx.createImageData(resolution, resolution);
    for (let j = 0; j < resolution; j += 1) {
        for (let i = 0; i < resolution; i += 1) {
            const srcIndex = j * resolution + i;
            const dstRow = resolution - 1 - j;
            const dstIndex = dstRow * resolution + i;
            const value = elevations[srcIndex];
            const norm =
                value === null ? 0 : Math.round(((value - min) / span) * 255);
            const offset = dstIndex * 4;
            image.data[offset] = norm;
            image.data[offset + 1] = norm;
            image.data[offset + 2] = norm;
            image.data[offset + 3] = 255;
        }
    }
    ctx.putImageData(image, 0, 0);
    return canvas.toDataURL("image/png");
}

function downloadDataUrl(dataUrl, filename) {
    const anchor = document.createElement("a");
    anchor.href = dataUrl;
    anchor.download = filename;
    anchor.rel = "noopener";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
}

export function downloadIgnHeightmapPng(dataUrl, { lat, lon, sizeMeters }) {
    if (!dataUrl) return;
    const label = `${lat.toFixed(3)}_${lon.toFixed(3)}_${Math.round(sizeMeters)}m`;
    downloadDataUrl(dataUrl, `heightmap-ign-${label}.png`);
}

/** @type {Promise<typeof import("leaflet")> | null} */
let leafletLoadPromise = null;

function loadStylesheet(href) {
    if (document.querySelector(`link[href="${href}"]`)) return Promise.resolve();
    return new Promise((resolve, reject) => {
        const link = document.createElement("link");
        link.rel = "stylesheet";
        link.href = href;
        link.onload = () => resolve();
        link.onerror = () => reject(new Error("CSS Leaflet introuvable"));
        document.head.appendChild(link);
    });
}

function loadScript(src) {
    if (document.querySelector(`script[src="${src}"]`)) return Promise.resolve();
    return new Promise((resolve, reject) => {
        const script = document.createElement("script");
        script.src = src;
        script.async = true;
        script.onload = () => resolve();
        script.onerror = () => reject(new Error("Leaflet introuvable"));
        document.head.appendChild(script);
    });
}

async function loadLeaflet() {
    if (window.L) return window.L;
    if (!leafletLoadPromise) {
        leafletLoadPromise = (async () => {
            await loadStylesheet("https://unpkg.com/leaflet@1.9.4/dist/leaflet.css");
            await loadScript("https://unpkg.com/leaflet@1.9.4/dist/leaflet.js");
            if (!window.L) throw new Error("Leaflet non initialisé");
            return window.L;
        })();
    }
    return leafletLoadPromise;
}

const IGN_TERRAIN_PRESETS = [
    {
        id: "mont-valerien",
        label: "Mont Valérien",
        lat: 48.87267,
        lon: 2.21263,
        zoom: 16,
    },
];

function escapeHtml(text) {
    return String(text)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}

function getDialogMount() {
    return document.getElementById("lab-workspace") || document.body;
}

function dismissIgnPickerOverlays() {
    document.querySelectorAll(".lab-dialog-overlay--ign").forEach((node) => {
        node.dispatchEvent(new Event("lab-ign-dismiss"));
        try {
            node.remove();
        } catch {
            /* ignore */
        }
    });
}

/**
 * Choix d’une zone via zoom / pan sur la carte, puis import IGN.
 * @param {{ defaultLat?: number, defaultLon?: number, defaultSize?: number, defaultZoom?: number, maxSize?: number, title?: string, confirmLabel?: string, hint?: string }} [opts]
 * @returns {Promise<{ lat: number, lon: number, sizeMeters: number, zoom: number } | null>}
 */
export async function labIgnTerrainPicker({
    defaultLat = 48.8566,
    defaultLon = 2.3522,
    defaultSize = 500,
    defaultZoom = 15,
    maxSize = 2000,
    title = "Relief IGN — choisir sur la carte",
    confirmLabel = "Générer le heightmap",
    hint = "Zoomez (niveau&nbsp;16–17 pour une colline) et centrez le carré cyan sur le sommet. Le relief 3D montre le <strong>dénivelé</strong> dans la zone, pas l’altitude absolue (~160&nbsp;m au Mont Valérien).",
} = {}) {
    dismissIgnPickerOverlays();
    const root = document.createElement("div");
    root.className = "lab-dialog-overlay lab-dialog-overlay--ign";
    root.innerHTML = `
        <div class="lab-dialog lab-dialog--wide lab-dialog--ign" role="dialog" aria-modal="true">
            <h2 class="lab-dialog__title">${escapeHtml(title)}</h2>
            <p class="lab-dialog__rich" id="lab-ign-hint">
                ${hint}
            </p>
            <div class="lab-dialog__ign-toolbar">
                <button type="button" class="lab-dialog__btn lab-dialog__btn--ghost lab-dialog__btn--compact" data-ign-geoloc title="Centrer sur ma position">Ma position</button>
                <div class="lab-dialog__ign-presets" role="group" aria-label="Exemples">
                    ${IGN_TERRAIN_PRESETS.map(
                        (preset) =>
                            `<button type="button" class="lab-dialog__btn lab-dialog__btn--ghost lab-dialog__btn--compact" data-ign-preset="${preset.id}">${escapeHtml(preset.label)}</button>`
                    ).join("")}
                </div>
                <span class="lab-dialog__ign-meta" id="lab-ign-meta">—</span>
            </div>
            <div id="lab-ign-map" class="lab-dialog__ign-map" aria-label="Carte"></div>
            <div class="lab-dialog__field-row lab-dialog__field-row--ign-coords">
                <label class="lab-dialog__field">
                    <span>Latitude (centre)</span>
                    <input class="lab-dialog__input" type="text" id="lab-ign-lat" value="${defaultLat.toFixed(5)}" spellcheck="false" inputmode="decimal">
                </label>
                <label class="lab-dialog__field">
                    <span>Longitude (centre)</span>
                    <input class="lab-dialog__input" type="text" id="lab-ign-lon" value="${defaultLon.toFixed(5)}" spellcheck="false" inputmode="decimal">
                </label>
                <button type="button" class="lab-dialog__btn lab-dialog__btn--ghost lab-dialog__btn--compact" data-ign-fly>Centrer</button>
            </div>
            <p class="lab-dialog__ign-zone">
                Zone heightmap : <strong id="lab-ign-size-value">${Math.round(defaultSize)} m</strong>
                × <strong id="lab-ign-size-value-2">${Math.round(defaultSize)} m</strong>
                — zoom <output id="lab-ign-zoom-value">${defaultZoom}</output>
            </p>
            <div class="lab-dialog__actions">
                <button type="button" class="lab-dialog__btn lab-dialog__btn--ghost" data-ign-cancel>Annuler</button>
                <button type="button" class="lab-dialog__btn lab-dialog__btn--primary" data-ign-confirm>${escapeHtml(confirmLabel)}</button>
            </div>
        </div>
    `;
    getDialogMount().appendChild(root);

    const latInput = /** @type {HTMLInputElement} */ (root.querySelector("#lab-ign-lat"));
    const lonInput = /** @type {HTMLInputElement} */ (root.querySelector("#lab-ign-lon"));
    const sizeValue = /** @type {HTMLElement} */ (root.querySelector("#lab-ign-size-value"));
    const sizeValue2 = /** @type {HTMLElement} */ (root.querySelector("#lab-ign-size-value-2"));
    const zoomValue = /** @type {HTMLOutputElement} */ (root.querySelector("#lab-ign-zoom-value"));
    const metaEl = /** @type {HTMLElement} */ (root.querySelector("#lab-ign-meta"));
    const hintEl = /** @type {HTMLElement} */ (root.querySelector("#lab-ign-hint"));
    const mapHost = /** @type {HTMLElement} */ (root.querySelector("#lab-ign-map"));

    /** @type {import("leaflet").Map | null} */
    let map = null;
    /** @type {import("leaflet").Rectangle | null} */
    let footprint = null;
    /** @type {{ lat: number, lon: number, sizeMeters: number, zoom: number }} */
    let currentPick = {
        lat: defaultLat,
        lon: defaultLon,
        sizeMeters: defaultSize,
        zoom: defaultZoom,
    };

    function updatePickDisplay(pick, clamped = false) {
        currentPick = { ...pick, zoom: map?.getZoom() ?? pick.zoom ?? defaultZoom };
        latInput.value = pick.lat.toFixed(5);
        lonInput.value = pick.lon.toFixed(5);
        const sizeLabel = `${Math.round(pick.sizeMeters)}`;
        sizeValue.textContent = sizeLabel;
        sizeValue2.textContent = sizeLabel;
        zoomValue.textContent = String(currentPick.zoom);
        metaEl.textContent = clamped
            ? `Zone limitée à ${sizeLabel} m (zoomez pour affiner)`
            : `Résolution mesh ~${(pick.sizeMeters / 100).toFixed(1)} m / point`;
    }

    function syncFromMapView() {
        if (!map || !footprint) return;
        const bounds = map.getBounds();
        const zone = mapBoundsToImportZone(bounds, { max: maxSize });
        updatePickDisplay(
            { lat: zone.lat, lon: zone.lon, sizeMeters: zone.sizeMeters },
            zone.clamped
        );
        footprint.setBounds(terrainFootprintBounds(zone.sizeMeters, zone.lat, zone.lon));
    }

    function parseCoordsFromInputs() {
        const lat = Number.parseFloat(latInput.value.replace(",", "."));
        const lon = Number.parseFloat(lonInput.value.replace(",", "."));
        if (!Number.isFinite(lat) || lat < -90 || lat > 90) {
            throw new Error("Latitude invalide (−90 à 90)");
        }
        if (!Number.isFinite(lon) || lon < -180 || lon > 180) {
            throw new Error("Longitude invalide (−180 à 180)");
        }
        return { lat, lon };
    }

    function flyToCoords(lat, lon, zoom) {
        if (!map) {
            currentPick = { ...currentPick, lat, lon, zoom: zoom ?? currentPick.zoom };
            updatePickDisplay({ lat, lon, sizeMeters: currentPick.sizeMeters });
            if (footprint) {
                footprint.setBounds(terrainFootprintBounds(currentPick.sizeMeters, lat, lon));
            }
            return;
        }
        map.setView([lat, lon], zoom ?? Math.max(map.getZoom(), 16), { animate: true });
        window.setTimeout(syncFromMapView, 280);
    }

    function applyPreset(presetId) {
        const preset = IGN_TERRAIN_PRESETS.find((entry) => entry.id === presetId);
        if (!preset) return;
        latInput.value = preset.lat.toFixed(5);
        lonInput.value = preset.lon.toFixed(5);
        flyToCoords(preset.lat, preset.lon, preset.zoom);
        hintEl.innerHTML =
            "Colline ciblée : placez le carré cyan sur le sommet (fortification visible sur la carte).";
    }

    function parseCurrentPick() {
        const { lat, lon } = parseCoordsFromInputs();
        return {
            lat,
            lon,
            sizeMeters: currentPick.sizeMeters,
            zoom: map?.getZoom() ?? currentPick.zoom,
        };
    }

    try {
        const L = await loadLeaflet();
        map = L.map(mapHost, { zoomControl: true }).setView([defaultLat, defaultLon], defaultZoom);
        L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
            maxZoom: 19,
            attribution: "&copy; OpenStreetMap",
        }).addTo(map);

        footprint = L.rectangle(terrainFootprintBounds(defaultSize, defaultLat, defaultLon), {
            color: "#22d3ee",
            weight: 2,
            fillOpacity: 0.15,
            interactive: false,
        }).addTo(map);

        map.on("moveend zoomend", syncFromMapView);

        map.on("click", (event) => {
            map.setView(event.latlng, map.getZoom(), { animate: true });
        });

        root.querySelector("[data-ign-geoloc]")?.addEventListener("click", () => {
            if (!navigator.geolocation) {
                hintEl.textContent = "Géolocalisation non disponible sur ce navigateur.";
                return;
            }
            hintEl.textContent = "Recherche de votre position…";
            navigator.geolocation.getCurrentPosition(
                (pos) => {
                    const { latitude, longitude } = pos.coords;
                    latInput.value = latitude.toFixed(5);
                    lonInput.value = longitude.toFixed(5);
                    flyToCoords(latitude, longitude, Math.max(map?.getZoom() ?? 16, 16));
                    hintEl.innerHTML =
                        "Zoomez (16–17) et centrez le carré cyan sur le relief à modéliser.";
                },
                () => {
                    hintEl.textContent = "Impossible d’obtenir votre position (autorisation ?).";
                },
                { enableHighAccuracy: true, timeout: 12000 }
            );
        });

        root.querySelector("[data-ign-fly]")?.addEventListener("click", () => {
            try {
                const { lat, lon } = parseCoordsFromInputs();
                flyToCoords(lat, lon, Math.max(map?.getZoom() ?? 16, 16));
            } catch (error) {
                hintEl.textContent =
                    error instanceof Error ? error.message : "Coordonnées invalides";
            }
        });

        root.querySelectorAll("[data-ign-preset]").forEach((button) => {
            button.addEventListener("click", () => {
                applyPreset(button.getAttribute("data-ign-preset") || "");
            });
        });

        latInput.addEventListener("keydown", (event) => {
            if (event.key === "Enter") root.querySelector("[data-ign-fly]")?.click();
        });
        lonInput.addEventListener("keydown", (event) => {
            if (event.key === "Enter") root.querySelector("[data-ign-fly]")?.click();
        });

        window.setTimeout(() => {
            map?.invalidateSize();
            syncFromMapView();
        }, 80);
    } catch (error) {
        mapHost.innerHTML = `<p class="lab-dialog__empty">${escapeHtml(
            error instanceof Error ? error.message : "Carte indisponible"
        )}</p>`;
    }

    return new Promise((resolve) => {
        let done = false;
        const cleanup = () => {
            document.removeEventListener("keydown", onKeydown, true);
        };
        const finish = (value) => {
            if (done) return;
            done = true;
            cleanup();
            try {
                map?.remove();
            } catch {
                /* ignore */
            }
            map = null;
            try {
                root.remove();
            } catch {
                /* ignore */
            }
            resolve(value);
        };

        const onKeydown = (event) => {
            if (event.key === "Escape") {
                event.preventDefault();
                finish(null);
            }
        };
        document.addEventListener("keydown", onKeydown, true);
        root.addEventListener("lab-ign-dismiss", () => finish(null));

        root.querySelector("[data-ign-geoloc]")?.addEventListener("click", (event) => {
            event.stopPropagation();
        });
        root.querySelector("[data-ign-fly]")?.addEventListener("click", (event) => {
            event.stopPropagation();
        });
        root.querySelectorAll("[data-ign-preset]").forEach((button) => {
            button.addEventListener("click", (event) => event.stopPropagation());
        });
        root.querySelector("[data-ign-cancel]")?.addEventListener("click", () => finish(null));
        const dialogEl = root.querySelector(".lab-dialog");
        dialogEl?.addEventListener("pointerdown", (event) => event.stopPropagation());
        root.querySelector("[data-ign-confirm]")?.addEventListener("click", () => {
            try {
                if (map) syncFromMapView();
                finish(parseCurrentPick());
            } catch (error) {
                hintEl.textContent =
                    error instanceof Error ? error.message : "Coordonnées invalides";
            }
        });
    });
}
