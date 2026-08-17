/** Bibliothèque Texture — onglets + glisser-déposer (couleur / normal / spéculaire empilés). */

const DB_NAME = "lab3d-asset-library";
const DB_STORE = "assets";
const DB_VERSION = 1;
export const TEXLIB_DRAG_MIME = "application/x-lab-texlib";

const TAB_PERSO = "perso";

/** Domaines proposés même sans pack (import utilisateur). */
const DOMAIN_FALLBACKS = [
    "beton",
    "bitume",
    "bois",
    "brique",
    "decalcomanie",
    "herbe",
    "metal",
    "neige",
    "pave",
    "pierre",
    "sable",
    "sol",
    "tissus",
    "tuiles",
];

/** @typedef {"color"|"normal"|"specular"|"roughness"|"ignore"} MapRole */

/** Suffixes de fichiers PBR → rôle (AmbientCG, Poly Haven, FR, « basic », etc.). */
const MAP_ROLE_BY_SUFFIX = {
    color: "color",
    albedo: "color",
    diffuse: "color",
    col: "color",
    basecolor: "color",
    basecolour: "color",
    basic: "color",
    base: "color",
    couleur: "color",
    normal: "normal",
    normale: "normal",
    normals: "normal",
    normalgl: "normal",
    normaldx: "normal",
    nrm: "normal",
    nor: "normal",
    norm: "normal",
    normap: "normal",
    specular: "specular",
    speculaire: "specular",
    spec: "specular",
    metalness: "specular",
    metal: "specular",
    metallic: "specular",
    metallique: "specular",
    metalique: "specular",
    roughness: "roughness",
    rough: "roughness",
    rugosite: "roughness",
    rugueux: "roughness",
    gloss: "roughness",
    glossiness: "roughness",
    ao: "ignore",
    ambientocclusion: "ignore",
    ambient: "ignore",
    displacement: "ignore",
    height: "ignore",
    disp: "ignore",
};

const ROLE_KEYS = Object.keys(MAP_ROLE_BY_SUFFIX).sort((a, b) => b.length - a.length);
const IGNORE_NAME_TOKENS = new Set([
    "1k", "2k", "4k", "8k", "16k", "jpg", "jpeg", "png", "webp", "exr", "tif", "tiff",
]);

/**
 * Découpe un nom en jetons (tirets, underscores, espaces, camelCase).
 * @param {string} text
 * @returns {string[]}
 */
function tokenizeMapName(text) {
    return String(text || "")
        .toLowerCase()
        .replace(/([a-z])([A-Z])/g, "$1 $2")
        .split(/[^a-z0-9]+/)
        .filter(Boolean);
}

/**
 * @param {string} token
 * @returns {MapRole | null}
 */
function roleFromToken(token) {
    const t = String(token || "").toLowerCase();
    if (!t || IGNORE_NAME_TOKENS.has(t)) return null;
    if (MAP_ROLE_BY_SUFFIX[t]) return /** @type {MapRole} */ (MAP_ROLE_BY_SUFFIX[t]);
    for (const key of ROLE_KEYS) {
        if (t === key || t.startsWith(key) || t.endsWith(key)) {
            return /** @type {MapRole} */ (MAP_ROLE_BY_SUFFIX[key]);
        }
    }
    return null;
}

/**
 * @param {string} text
 * @returns {MapRole | null}
 */
function detectRoleInText(text) {
    const tokens = tokenizeMapName(text);
    /** Priorité : normal / spec / roughness avant couleur (un nom peut contenir les deux). */
    const priority = ["normal", "specular", "roughness", "ignore", "color"];
    /** @type {MapRole | null} */
    let found = null;
    for (const token of tokens) {
        const role = roleFromToken(token);
        if (!role) continue;
        if (!found || priority.indexOf(role) < priority.indexOf(found)) found = role;
    }
    return found;
}

/**
 * @param {string} fileName
 * @returns {{ prefix: string, role: MapRole }}
 */
function parseMapFileName(fileName) {
    const base = String(fileName || "")
        .replace(/\.[^.]+$/, "")
        .trim();
    if (!base) return { prefix: "texture", role: "color" };
    const tokens = tokenizeMapName(base);
    /** @type {MapRole} */
    let role = "color";
    const kept = [];
    for (const token of tokens) {
        const tokenRole = roleFromToken(token);
        if (tokenRole && tokenRole !== "color") {
            if (role === "color" || tokenRole !== "ignore") role = tokenRole;
            continue;
        }
        if (tokenRole === "color") continue;
        if (IGNORE_NAME_TOKENS.has(token)) continue;
        kept.push(token);
    }
    if (role === "color") {
        const detected = detectRoleInText(base);
        if (detected) role = detected;
    }
    return { prefix: kept.join(" ") || base, role };
}

/** @typedef {"albedo"|"normal"|"hdri"|"material"|"decal"|"brush"|"specular"|"roughness"} AssetKind */

/**
 * @typedef {{
 *   id: string,
 *   name: string,
 *   kind: AssetKind,
 *   mime: string,
 *   dataUrl?: string,
 *   url?: string,
 *   thumbUrl?: string,
 *   normalUrl?: string,
 *   specularUrl?: string,
 *   roughnessUrl?: string,
 *   normalDataUrl?: string,
 *   specularDataUrl?: string,
 *   roughnessDataUrl?: string,
 *   thumbDataUrl?: string,
 *   packKey?: string,
 *   category?: string,
 *   builtin?: boolean,
 *   updatedAt: number,
 * }} LibraryAsset
 */

/**
 * @typedef {{
 *   color?: string,
 *   normal?: string,
 *   specular?: string,
 *   roughness?: string,
 * }} ResolvedMaps
 */

/**
 * @param {string} prefix
 * @returns {string}
 */
function normalizePackKey(prefix) {
    return String(prefix || "texture")
        .trim()
        .toLowerCase()
        .replace(/\s+/g, " ");
}

/**
 * @param {LibraryAsset} asset
 * @returns {boolean}
 */
function assetHasAnyMap(asset) {
    return !!(
        asset.dataUrl ||
        asset.url ||
        asset.normalDataUrl ||
        asset.normalUrl ||
        asset.specularDataUrl ||
        asset.specularUrl ||
        asset.roughnessDataUrl ||
        asset.roughnessUrl
    );
}

/**
 * @param {LibraryAsset} asset
 * @param {MapRole} role
 * @param {string} dataUrl
 */
function assignMapToAsset(asset, role, dataUrl) {
    if (role === "color") {
        asset.dataUrl = dataUrl;
        asset.thumbDataUrl = dataUrl;
        if (asset.kind === "normal" || asset.kind === "specular" || asset.kind === "roughness") {
            asset.kind = "material";
        } else if (asset.kind !== "material") {
            asset.kind = "albedo";
        }
        return;
    }
    if (role === "normal") {
        asset.normalDataUrl = dataUrl;
        if (!asset.thumbDataUrl && !asset.dataUrl) asset.thumbDataUrl = dataUrl;
        if (!asset.dataUrl && asset.kind === "albedo") asset.kind = "material";
        return;
    }
    if (role === "specular") {
        asset.specularDataUrl = dataUrl;
        if (!asset.dataUrl && asset.kind === "albedo") asset.kind = "material";
        return;
    }
    if (role === "roughness") {
        asset.roughnessDataUrl = dataUrl;
        if (!asset.dataUrl && asset.kind === "albedo") asset.kind = "material";
    }
}

/**
 * @param {LibraryAsset} asset
 * @returns {AssetKind}
 */
function inferKindFromMaps(asset) {
    const hasColor = !!(asset.dataUrl || asset.url);
    const hasNormal = !!(asset.normalDataUrl || asset.normalUrl);
    const hasSpecular = !!(asset.specularDataUrl || asset.specularUrl);
    const hasRoughness = !!(asset.roughnessDataUrl || asset.roughnessUrl);
    const extras = [hasNormal, hasSpecular, hasRoughness].filter(Boolean).length;
    if (hasColor && extras > 0) return "material";
    if (hasColor) return "albedo";
    if (hasNormal && !hasSpecular && !hasRoughness) return "normal";
    if (hasSpecular && !hasNormal && !hasRoughness) return "specular";
    if (hasRoughness && !hasNormal && !hasSpecular) return "roughness";
    return "material";
}

/**
 * Fusionne des cartes perso séparées (même préfixe + domaine) en un pack PBR.
 * @param {LibraryAsset[]} assets
 * @returns {Promise<LibraryAsset[]>}
 */
async function consolidateUserMaterialPacks(assets) {
    /** @type {Map<string, LibraryAsset[]>} */
    const groups = new Map();
    for (const asset of assets) {
        if (asset.builtin) continue;
        const parsed = parseMapFileName(asset.name);
        const keyFromName = normalizePackKey(asset.packKey || parsed.prefix);
        const domain = String(asset.category || TAB_PERSO).toLowerCase();
        const groupKey = `${domain}::${keyFromName}`;
        const list = groups.get(groupKey) || [];
        list.push(asset);
        groups.set(groupKey, list);
    }

    /** @type {LibraryAsset[]} */
    const kept = [];
    /** @type {string[]} */
    const toDelete = [];

    for (const [, group] of groups) {
        if (group.length === 1) {
            const only = group[0];
            const parsed = parseMapFileName(only.name);
            const role = parsed.role;
            // Carte isolée encore typée « fichier brut » → ranger la map au bon champ.
            if (
                role !== "color" &&
                role !== "ignore" &&
                only.dataUrl &&
                !only.normalDataUrl &&
                !only.specularDataUrl &&
                !only.roughnessDataUrl
            ) {
                const dataUrl = only.dataUrl;
                if (role === "normal") {
                    only.normalDataUrl = dataUrl;
                    only.dataUrl = undefined;
                } else if (role === "specular") {
                    only.specularDataUrl = dataUrl;
                    only.dataUrl = undefined;
                } else if (role === "roughness") {
                    only.roughnessDataUrl = dataUrl;
                    only.dataUrl = undefined;
                }
                only.packKey = normalizePackKey(parsed.prefix);
                only.name = parsed.prefix;
                only.kind = inferKindFromMaps(only);
                only.updatedAt = Date.now();
                await putAsset(only);
            } else if (!only.packKey) {
                only.packKey = normalizePackKey(parsed.prefix);
                await putAsset(only);
            }
            kept.push(only);
            continue;
        }

        group.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
        const primary =
            group.find((a) => a.dataUrl && parseMapFileName(a.name).role === "color") ||
            group.find((a) => a.dataUrl) ||
            group[0];
        const prefix =
            primary.packKey ||
            parseMapFileName(primary.name).prefix ||
            primary.name ||
            "texture";

        /** @type {LibraryAsset} */
        const merged = {
            ...primary,
            name: prefix,
            packKey: normalizePackKey(prefix),
            kind: "material",
            updatedAt: Date.now(),
        };

        for (const asset of group) {
            const parsed = parseMapFileName(asset.name);
            let role = parsed.role;
            if (role === "ignore") continue;
            // Anciennes cartes : dataUrl porte la map indiquée par le nom / kind.
            if (asset.normalDataUrl) merged.normalDataUrl = asset.normalDataUrl;
            if (asset.specularDataUrl) merged.specularDataUrl = asset.specularDataUrl;
            if (asset.roughnessDataUrl) merged.roughnessDataUrl = asset.roughnessDataUrl;
            if (asset.normalUrl) merged.normalUrl = asset.normalUrl;
            if (asset.specularUrl) merged.specularUrl = asset.specularUrl;
            if (asset.roughnessUrl) merged.roughnessUrl = asset.roughnessUrl;

            if (asset.dataUrl) {
                if (
                    role === "color" ||
                    (asset === primary && !merged.dataUrl) ||
                    (role !== "normal" &&
                        role !== "specular" &&
                        role !== "roughness" &&
                        !merged.dataUrl)
                ) {
                    if (role === "normal") {
                        merged.normalDataUrl = asset.dataUrl;
                    } else if (role === "specular") {
                        merged.specularDataUrl = asset.dataUrl;
                    } else if (role === "roughness") {
                        merged.roughnessDataUrl = asset.dataUrl;
                    } else {
                        merged.dataUrl = asset.dataUrl;
                        merged.thumbDataUrl = asset.dataUrl;
                    }
                } else if (role === "normal") {
                    merged.normalDataUrl = asset.dataUrl;
                } else if (role === "specular") {
                    merged.specularDataUrl = asset.dataUrl;
                } else if (role === "roughness") {
                    merged.roughnessDataUrl = asset.dataUrl;
                }
            } else if (asset.kind === "normal" && asset.url) {
                merged.normalUrl = asset.url;
            }
        }

        merged.kind = inferKindFromMaps(merged);
        if (!merged.thumbDataUrl) {
            merged.thumbDataUrl =
                merged.dataUrl || merged.normalDataUrl || merged.specularDataUrl || merged.roughnessDataUrl;
        }
        await putAsset(merged);
        kept.push(merged);
        for (const asset of group) {
            if (asset.id !== merged.id) toDelete.push(asset.id);
        }
    }

    for (const id of toDelete) {
        await deleteAsset(id);
    }

    // Assets hors groupes (builtins déjà exclus) — conserver ceux non traités.
    const keptIds = new Set(kept.map((a) => a.id));
    for (const asset of assets) {
        if (!keptIds.has(asset.id) && !toDelete.includes(asset.id)) kept.push(asset);
    }

    kept.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
    return kept;
}

function openDatabase() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);
        request.onupgradeneeded = () => {
            const db = request.result;
            if (!db.objectStoreNames.contains(DB_STORE)) {
                const store = db.createObjectStore(DB_STORE, { keyPath: "id" });
                store.createIndex("kind", "kind", { unique: false });
                store.createIndex("updatedAt", "updatedAt", { unique: false });
            }
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error ?? new Error("IndexedDB indisponible"));
    });
}

async function listUserAssets() {
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(DB_STORE, "readonly");
        const request = tx.objectStore(DB_STORE).getAll();
        request.onsuccess = () => {
            const rows = /** @type {LibraryAsset[]} */ (request.result || []);
            rows.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
            resolve(rows);
        };
        request.onerror = () => reject(request.error);
    });
}

async function putAsset(asset) {
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(DB_STORE, "readwrite");
        tx.objectStore(DB_STORE).put(asset);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
    });
}

async function deleteAsset(id) {
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(DB_STORE, "readwrite");
        tx.objectStore(DB_STORE).delete(id);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
    });
}

function blobToDataUrl(blob) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ""));
        reader.onerror = () => reject(reader.error ?? new Error("Lecture impossible"));
        reader.readAsDataURL(blob);
    });
}

async function fetchUrlAsDataUrl(url) {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Chargement impossible (${response.status})`);
    return blobToDataUrl(await response.blob());
}

/**
 * @param {LibraryAsset} asset
 * @returns {Promise<ResolvedMaps>}
 */
async function resolveAssetMaps(asset) {
    /** @type {ResolvedMaps} */
    const maps = {};
    const parsed = parseMapFileName(asset.name);
    const name = `${asset.name} ${asset.kind}`.toLowerCase();

    const roleFromKind =
        asset.kind === "normal"
            ? "normal"
            : asset.kind === "specular"
              ? "specular"
              : asset.kind === "roughness"
                ? "roughness"
                : null;
    const roleFromName =
        parsed.role === "normal" || parsed.role === "specular" || parsed.role === "roughness"
            ? parsed.role
            : detectRoleInText(name);
    /** Rôle mono-map si dataUrl porte encore l’ancienne map (pas un pack multi-champs). */
    const soloRole =
        !asset.normalDataUrl &&
        !asset.specularDataUrl &&
        !asset.roughnessDataUrl &&
        !asset.normalUrl &&
        !asset.specularUrl &&
        !asset.roughnessUrl
            ? roleFromKind || roleFromName
            : null;

    if (asset.normalDataUrl) maps.normal = asset.normalDataUrl;
    else if (asset.normalUrl) {
        try {
            maps.normal = await fetchUrlAsDataUrl(asset.normalUrl);
        } catch {
            /* optionnel */
        }
    }

    if (asset.specularDataUrl) maps.specular = asset.specularDataUrl;
    else if (asset.specularUrl) {
        try {
            maps.specular = await fetchUrlAsDataUrl(asset.specularUrl);
        } catch {
            /* optionnel */
        }
    }

    if (asset.roughnessDataUrl) maps.roughness = asset.roughnessDataUrl;
    else if (asset.roughnessUrl) {
        try {
            maps.roughness = await fetchUrlAsDataUrl(asset.roughnessUrl);
        } catch {
            /* optionnel */
        }
    }

    if (soloRole === "normal") {
        if (asset.dataUrl) maps.normal = asset.dataUrl;
        else if (asset.url && !maps.normal) maps.normal = await fetchUrlAsDataUrl(asset.url);
        return maps;
    }
    if (soloRole === "specular") {
        if (asset.dataUrl) maps.specular = asset.dataUrl;
        else if (asset.url && !maps.specular) maps.specular = await fetchUrlAsDataUrl(asset.url);
        return maps;
    }
    if (soloRole === "roughness") {
        if (asset.dataUrl) maps.roughness = asset.dataUrl;
        else if (asset.url && !maps.roughness) maps.roughness = await fetchUrlAsDataUrl(asset.url);
        return maps;
    }

    if (asset.dataUrl) maps.color = asset.dataUrl;
    else if (asset.url) {
        const wantColor =
            asset.kind === "albedo" ||
            asset.kind === "material" ||
            asset.kind === "decal" ||
            parsed.role === "color" ||
            !!maps.normal ||
            !!maps.specular ||
            !!maps.roughness;
        if (wantColor) maps.color = await fetchUrlAsDataUrl(asset.url);
    }

    if (maps.color || maps.normal || maps.specular || maps.roughness) return maps;

    if (asset.dataUrl) maps.color = asset.dataUrl;
    else if (asset.url) maps.color = await fetchUrlAsDataUrl(asset.url);
    return maps;
}

async function loadPackAssets() {
    for (const endpoint of ["/api/texture-library", "/3D/texture-catalog.json"]) {
        try {
            const response = await fetch(endpoint, { cache: "no-store" });
            if (!response.ok) continue;
            const payload = await response.json();
            if (!payload?.ok || !Array.isArray(payload.assets)) continue;
            const rows = payload.assets
                .map((row) => /** @type {LibraryAsset} */ ({
                    id: String(row.id || ""),
                    name: String(row.name || "pack"),
                    kind: /** @type {AssetKind} */ (row.kind || "albedo"),
                    mime: String(row.mime || "image/jpeg"),
                    url: row.url ? String(row.url) : undefined,
                    thumbUrl: row.thumbUrl ? String(row.thumbUrl) : undefined,
                    normalUrl: row.normalUrl ? String(row.normalUrl) : undefined,
                    specularUrl: row.specularUrl ? String(row.specularUrl) : undefined,
                    category: row.category ? String(row.category) : undefined,
                    builtin: true,
                    updatedAt: 0,
                }))
                .filter((a) => a.id && (a.url || a.dataUrl) && a.kind !== "hdri");
            if (rows.length) return rows;
        } catch {
            /* suivant */
        }
    }
    return [];
}

/**
 * @param {{
 *   root: HTMLElement,
 *   viewport?: HTMLElement | null,
 *   showStatus?: (msg: string) => void,
 *   onDropTexture: (payload: {
 *     clientX: number,
 *     clientY: number,
 *     maps: ResolvedMaps,
 *     name: string,
 *     transform: { tileX: number, tileY: number, offsetX: number, offsetY: number },
 *   }) => Promise<void>,
 *   onTransformChange?: (transform: {
 *     tileX: number,
 *     tileY: number,
 *     offsetX: number,
 *     offsetY: number,
 *   }, meta?: { phase: "input" | "change" }) => void,
 *   onModeChange?: (mode: "object" | "face" | "triangles") => void,
 *   onClearTriangles?: () => void,
 * }} options
 */
export function initTextureLibrary(options) {
    const {
        root,
        viewport,
        showStatus,
        onDropTexture,
        onTransformChange,
        onModeChange,
        onClearTriangles,
    } = options;

    const grid = root.querySelector("[data-texlib-grid]");
    const tabsHost = root.querySelector("[data-texlib-tabs]");
    const fileInput = /** @type {HTMLInputElement | null} */ (root.querySelector("[data-texlib-file]"));
    const addBtn = root.querySelector("[data-texlib-add]");
    const deleteBtn = root.querySelector("[data-texlib-delete]");
    const domainSelect = /** @type {HTMLSelectElement | null} */ (
        root.querySelector("[data-texlib-domain]")
    );
    const layerSelect = /** @type {HTMLSelectElement | null} */ (
        root.querySelector("[data-texlib-layer]")
    );
    const tileXInput = /** @type {HTMLInputElement | null} */ (root.querySelector("[data-texlib-tile-x]"));
    const tileYInput = /** @type {HTMLInputElement | null} */ (root.querySelector("[data-texlib-tile-y]"));
    const tileZInput = /** @type {HTMLInputElement | null} */ (root.querySelector("[data-texlib-tile-z]"));
    const offsetXInput = /** @type {HTMLInputElement | null} */ (root.querySelector("[data-texlib-offset-x]"));
    const offsetYInput = /** @type {HTMLInputElement | null} */ (root.querySelector("[data-texlib-offset-y]"));
    const offsetZInput = /** @type {HTMLInputElement | null} */ (root.querySelector("[data-texlib-offset-z]"));
    const tileXNum = /** @type {HTMLInputElement | null} */ (root.querySelector("[data-texlib-tile-x-num]"));
    const tileYNum = /** @type {HTMLInputElement | null} */ (root.querySelector("[data-texlib-tile-y-num]"));
    const tileZNum = /** @type {HTMLInputElement | null} */ (root.querySelector("[data-texlib-tile-z-num]"));
    const offsetXNum = /** @type {HTMLInputElement | null} */ (root.querySelector("[data-texlib-offset-x-num]"));
    const offsetYNum = /** @type {HTMLInputElement | null} */ (root.querySelector("[data-texlib-offset-y-num]"));
    const offsetZNum = /** @type {HTMLInputElement | null} */ (root.querySelector("[data-texlib-offset-z-num]"));
    const modeHint = root.querySelector("[data-texlib-mode-hint]");
    const modeBtns = [...root.querySelectorAll("[data-texlib-mode]")];
    const clearTrisBtn = root.querySelector("[data-texlib-clear-tris]");
    /** Évite une boucle range ↔ number sur le même champ. */
    let syncingUvInputs = false;
    /** Évite de réécrire le select pendant un refresh programmatique. */
    let syncingDomainSelect = false;

    /** @type {LibraryAsset[]} */
    let packAssets = [];
    /** @type {LibraryAsset[]} */
    let userAssets = [];
    /** @type {string | null} */
    let selectedId = null;
    /** @type {string} */
    let activeTab = "herbe";
    /** @type {"object" | "face" | "triangles"} */
    let applyMode = "object";

    function allAssets() {
        return [...packAssets, ...userAssets];
    }

    function selectedAsset() {
        return allAssets().find((a) => a.id === selectedId) || null;
    }

    /**
     * @param {LibraryAsset} asset
     * @returns {string}
     */
    function assetDomain(asset) {
        const raw = String(asset.category || "").trim().toLowerCase();
        if (!raw || raw === TAB_PERSO) return TAB_PERSO;
        return raw;
    }

    function domainOptions() {
        const cats = new Set(DOMAIN_FALLBACKS);
        for (const asset of packAssets) {
            if (asset.category) cats.add(String(asset.category));
        }
        for (const asset of userAssets) {
            const domain = assetDomain(asset);
            if (domain !== TAB_PERSO) cats.add(domain);
        }
        return [...cats].sort((a, b) => a.localeCompare(b, "fr")).concat(TAB_PERSO);
    }

    function readDomainSelect() {
        const value = String(domainSelect?.value || "").trim().toLowerCase();
        return value || TAB_PERSO;
    }

    /**
     * @returns {"auto" | "color" | "normal" | "specular" | "roughness"}
     */
    function readLayerSelect() {
        const value = String(layerSelect?.value || "auto").trim().toLowerCase();
        if (value === "color" || value === "normal" || value === "specular" || value === "roughness") {
            return value;
        }
        return "auto";
    }

    /**
     * @param {string} domain
     */
    function setDomainSelect(domain) {
        if (!domainSelect) return;
        const value = domain || TAB_PERSO;
        syncingDomainSelect = true;
        if (![...domainSelect.options].some((opt) => opt.value === value)) {
            const opt = document.createElement("option");
            opt.value = value;
            opt.textContent = value === TAB_PERSO ? "Perso" : value;
            domainSelect.appendChild(opt);
        }
        domainSelect.value = value;
        syncingDomainSelect = false;
    }

    function syncDomainSelectFromContext() {
        const selected = selectedAsset();
        if (selected && !selected.builtin) {
            setDomainSelect(assetDomain(selected));
            return;
        }
        setDomainSelect(activeTab);
    }

    function fillDomainSelect() {
        if (!domainSelect) return;
        const current = readDomainSelect() || activeTab;
        const ids = domainOptions();
        domainSelect.replaceChildren();
        for (const id of ids) {
            const opt = document.createElement("option");
            opt.value = id;
            opt.textContent = id === TAB_PERSO ? "Perso" : id;
            domainSelect.appendChild(opt);
        }
        setDomainSelect(ids.includes(current) ? current : activeTab);
    }

    function readTransform() {
        const parse = (input, fallback) => {
            const value = Number(input?.value);
            return Number.isFinite(value) ? value : fallback;
        };
        return {
            tileX: parse(tileXInput, 1),
            tileY: parse(tileYInput, 1),
            tileZ: parse(tileZInput, 1),
            offsetX: parse(offsetXInput, 0),
            offsetY: parse(offsetYInput, 0),
            offsetZ: parse(offsetZInput, 0),
        };
    }

    /**
     * @param {HTMLInputElement | null} range
     * @param {HTMLInputElement | null} num
     * @param {number} value
     * @param {number} digits
     */
    function syncUvPair(range, num, value, digits) {
        if (!range && !num) return;
        const min = Number(range?.min ?? num?.min);
        const max = Number(range?.max ?? num?.max);
        let v = value;
        if (Number.isFinite(min)) v = Math.max(min, v);
        if (Number.isFinite(max)) v = Math.min(max, v);
        const text = digits <= 1 ? String(Number(v.toFixed(digits))) : v.toFixed(digits);
        syncingUvInputs = true;
        if (range) range.value = String(v);
        if (num && document.activeElement !== num) num.value = text;
        syncingUvInputs = false;
    }

    function syncTransformOutputs() {
        const t = readTransform();
        syncUvPair(tileXInput, tileXNum, t.tileX, 1);
        syncUvPair(tileYInput, tileYNum, t.tileY, 1);
        syncUvPair(tileZInput, tileZNum, t.tileZ, 1);
        syncUvPair(offsetXInput, offsetXNum, t.offsetX, 2);
        syncUvPair(offsetYInput, offsetYNum, t.offsetY, 2);
        syncUvPair(offsetZInput, offsetZNum, t.offsetZ, 2);
    }

    function emitTransform(phase = "input") {
        syncTransformOutputs();
        onTransformChange?.(readTransform(), { phase });
    }

    /**
     * @param {HTMLInputElement | null} range
     * @param {HTMLInputElement | null} num
     * @param {number} digits
     * @param {number} fallback
     */
    function bindUvPair(range, num, digits, fallback) {
        const clampParse = (raw) => {
            const value = Number(raw);
            if (!Number.isFinite(value)) return fallback;
            const min = Number(range?.min ?? num?.min);
            const max = Number(range?.max ?? num?.max);
            let v = value;
            if (Number.isFinite(min)) v = Math.max(min, v);
            if (Number.isFinite(max)) v = Math.min(max, v);
            return v;
        };
        const onRange = (phase) => {
            if (syncingUvInputs) return;
            const v = clampParse(range?.value);
            syncingUvInputs = true;
            if (num) num.value = digits <= 1 ? String(Number(v.toFixed(digits))) : v.toFixed(digits);
            if (range) range.value = String(v);
            syncingUvInputs = false;
            emitTransform(phase);
        };
        const onNum = (phase) => {
            if (syncingUvInputs) return;
            const v = clampParse(num?.value);
            syncingUvInputs = true;
            if (range) range.value = String(v);
            if (num && phase === "change") {
                num.value = digits <= 1 ? String(Number(v.toFixed(digits))) : v.toFixed(digits);
            }
            syncingUvInputs = false;
            emitTransform(phase);
        };
        range?.addEventListener("input", () => onRange("input"));
        range?.addEventListener("change", () => onRange("change"));
        num?.addEventListener("input", () => onNum("input"));
        num?.addEventListener("change", () => onNum("change"));
        for (const el of [range, num]) {
            el?.addEventListener("pointerdown", (event) => event.stopPropagation());
            el?.addEventListener("mousedown", (event) => event.stopPropagation());
            el?.addEventListener("keydown", (event) => event.stopPropagation());
        }
    }

    function setApplyMode(mode) {
        applyMode =
            mode === "triangles" ? "triangles" : mode === "face" ? "face" : "object";
        for (const btn of modeBtns) {
            const active = btn.getAttribute("data-texlib-mode") === applyMode;
            btn.classList.toggle("is-active", active);
            btn.setAttribute("aria-pressed", String(active));
        }
        if (modeHint) {
            modeHint.textContent =
                applyMode === "triangles"
                    ? "Mode Triangles : glissez pour sélectionner. Vider △ / Échap / Ctrl+Z annule la sélection. Tile = dernier lot △."
                    : applyMode === "face"
                      ? "Mode Face : déposez sur une face de cube / panneau. Tile = dernière face."
                      : "Mode Objet : déposez sur l’objet entier. Tile = dernier objet texturé.";
        }
        onModeChange?.(applyMode);
    }

    for (const btn of modeBtns) {
        btn.addEventListener("click", (event) => {
            event.stopPropagation();
            const mode = btn.getAttribute("data-texlib-mode");
            if (mode === "object" || mode === "face" || mode === "triangles") setApplyMode(mode);
        });
    }
    clearTrisBtn?.addEventListener("click", (event) => {
        event.stopPropagation();
        onClearTriangles?.();
    });
    setApplyMode("object");

    function tabIds() {
        return domainOptions();
    }

    function assetsForTab(tab) {
        const domain = tab || TAB_PERSO;
        const packs = packAssets.filter((a) => a.category === domain);
        const users = userAssets.filter((a) => assetDomain(a) === domain);
        return [...packs, ...users];
    }

    function renderTabs() {
        if (!tabsHost) return;
        const ids = tabIds();
        if (!ids.includes(activeTab)) activeTab = ids[0] || TAB_PERSO;
        tabsHost.replaceChildren();
        tabsHost.setAttribute("aria-orientation", "vertical");
        for (const id of ids) {
            const btn = document.createElement("button");
            btn.type = "button";
            btn.setAttribute("role", "tab");
            btn.setAttribute("aria-selected", String(id === activeTab));
            btn.classList.toggle("is-active", id === activeTab);
            btn.textContent = id === TAB_PERSO ? "Perso" : id;
            btn.title =
                id === TAB_PERSO
                    ? "Textures personnelles non classées"
                    : `Domaine « ${id} » (packs + imports)`;
            btn.addEventListener("click", (event) => {
                event.stopPropagation();
                activeTab = id;
                selectedId = null;
                setDomainSelect(id);
                renderTabs();
                renderGrid();
            });
            tabsHost.appendChild(btn);
        }
    }

    function renderGrid() {
        if (!grid) return;
        const list = assetsForTab(activeTab);
        deleteBtn?.toggleAttribute("disabled", !selectedAsset() || !!selectedAsset()?.builtin);
        grid.replaceChildren();
        if (!list.length) {
            const empty = document.createElement("p");
            empty.className = "lab-texlib__empty";
            empty.textContent =
                activeTab === TAB_PERSO
                    ? "Aucune texture perso — choisissez un domaine puis Charger…"
                    : `Aucune texture dans « ${activeTab} » — Charger… pour en ajouter.`;
            grid.appendChild(empty);
            return;
        }
        for (const asset of list) {
            const card = document.createElement("button");
            card.type = "button";
            card.className = "lab-texlib__card";
            if (asset.builtin) card.classList.add("lab-texlib__card--pack");
            card.classList.toggle("is-selected", asset.id === selectedId);
            card.draggable = true;
            const badges = [];
            if (asset.normalDataUrl || asset.normalUrl || asset.kind === "normal") badges.push("N");
            if (asset.specularDataUrl || asset.specularUrl || asset.kind === "specular") badges.push("S");
            if (asset.roughnessDataUrl || asset.roughnessUrl || asset.kind === "roughness") badges.push("R");
            card.title = `${asset.name}${badges.length ? ` [${badges.join("+")}]` : ""} — glisser sur la scène`;

            const thumb = document.createElement("span");
            thumb.className = "lab-texlib__thumb";
            const src =
                asset.thumbDataUrl ||
                asset.thumbUrl ||
                (asset.dataUrl?.startsWith("data:image") ? asset.dataUrl : "") ||
                (asset.url && !/\.hdr$/i.test(asset.url) ? asset.url : "");
            if (src) thumb.style.backgroundImage = `url("${src}")`;

            const label = document.createElement("span");
            label.className = "lab-texlib__card-label";
            label.textContent = asset.name.includes(" · ")
                ? asset.name.split(" · ").slice(1).join(" · ")
                : asset.name;

            card.append(thumb, label);
            if (badges.length) {
                const badge = document.createElement("span");
                badge.className = "lab-texlib__badge";
                badge.textContent = badges.join("+");
                card.appendChild(badge);
            }

            card.addEventListener("click", (event) => {
                event.stopPropagation();
                selectedId = asset.id;
                syncDomainSelectFromContext();
                renderGrid();
            });
            card.addEventListener("dragstart", (event) => {
                selectedId = asset.id;
                const payload = JSON.stringify({ id: asset.id });
                event.dataTransfer?.setData(TEXLIB_DRAG_MIME, payload);
                event.dataTransfer?.setData("text/plain", payload);
                if (event.dataTransfer) event.dataTransfer.effectAllowed = "copy";
                card.classList.add("is-dragging");
                viewport?.classList.add("lab-viewport--texdrop");
            });
            card.addEventListener("dragend", () => {
                card.classList.remove("is-dragging");
                viewport?.classList.remove("lab-viewport--texdrop");
                viewport?.classList.remove("lab-viewport--drop");
            });
            grid.appendChild(card);
        }
    }

    async function refresh() {
        try {
            const raw = await listUserAssets();
            userAssets = await consolidateUserMaterialPacks(raw);
        } catch {
            userAssets = [];
        }
        packAssets = await loadPackAssets();
        fillDomainSelect();
        syncDomainSelectFromContext();
        renderTabs();
        if (selectedId && !allAssets().some((a) => a.id === selectedId)) selectedId = null;
        renderGrid();
    }

    /**
     * @param {string} domain
     */
    async function moveSelectedToDomain(domain) {
        const asset = selectedAsset();
        if (!asset || asset.builtin) return false;
        const next = domain || TAB_PERSO;
        if (assetDomain(asset) === next) return false;
        asset.category = next;
        asset.updatedAt = Date.now();
        await putAsset(asset);
        activeTab = next;
        await refresh();
        showStatus?.(`Rangée dans « ${next === TAB_PERSO ? "Perso" : next} »`);
        return true;
    }

    /**
     * @param {string} domain
     * @param {string} packKey
     * @returns {LibraryAsset | undefined}
     */
    function findUserPack(domain, packKey) {
        const key = normalizePackKey(packKey);
        return userAssets.find(
            (a) =>
                !a.builtin &&
                assetDomain(a) === domain &&
                normalizePackKey(a.packKey || parseMapFileName(a.name).prefix) === key
        );
    }

    async function addFiles(files) {
        const domain = readDomainSelect() || activeTab || TAB_PERSO;
        let mergedCount = 0;
        let createdCount = 0;
        /** @type {string | null} */
        let lastId = null;

        for (const file of files) {
            if (!file) continue;
            const dataUrl = await blobToDataUrl(file);
            const parsed = parseMapFileName(file.name);
            const forced = readLayerSelect();
            if (forced !== "auto") parsed.role = forced;
            if (parsed.role === "ignore") {
                showStatus?.(`Ignoré (AO/height) : ${file.name}`);
                continue;
            }
            const packKey = normalizePackKey(parsed.prefix);
            let asset = findUserPack(domain, packKey);
            if (!asset) {
                asset = {
                    id: `tex-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
                    name: parsed.prefix || "texture",
                    kind: "albedo",
                    mime: file.type || "image/png",
                    packKey,
                    category: domain,
                    builtin: false,
                    updatedAt: Date.now(),
                };
                createdCount += 1;
            } else {
                mergedCount += 1;
            }
            assignMapToAsset(asset, parsed.role, dataUrl);
            asset.packKey = packKey;
            asset.name = parsed.prefix || asset.name;
            asset.kind = inferKindFromMaps(asset);
            asset.mime = file.type || asset.mime || "image/png";
            asset.category = domain;
            asset.updatedAt = Date.now();
            if (!assetHasAnyMap(asset)) continue;
            await putAsset(asset);
            // Met à jour le cache local pour les prochains fichiers du même lot.
            const idx = userAssets.findIndex((a) => a.id === asset.id);
            if (idx >= 0) userAssets[idx] = asset;
            else userAssets.unshift(asset);
            lastId = asset.id;
            selectedId = asset.id;
        }

        activeTab = domain;
        await refresh();
        if (lastId) selectedId = lastId;
        const label = domain === TAB_PERSO ? "Perso" : domain;
        if (createdCount + mergedCount <= 0) {
            showStatus?.("Aucune map utilisable");
            return;
        }
        if (mergedCount && createdCount) {
            showStatus?.(`Pack PBR mis à jour (${createdCount} nouveau, ${mergedCount} fusion) → ${label}`);
        } else if (mergedCount) {
            showStatus?.(
                mergedCount > 1
                    ? `${mergedCount} maps fusionnées en pack(s) → ${label}`
                    : `Map fusionnée dans le pack → ${label}`
            );
        } else {
            showStatus?.(
                createdCount > 1
                    ? `${createdCount} packs ajoutés → ${label}`
                    : `Texture ajoutée → ${label}`
            );
        }
    }

    async function handleDropPayload(clientX, clientY, raw) {
        let parsed;
        try {
            parsed = JSON.parse(raw);
        } catch {
            showStatus?.("Texture invalide");
            return;
        }
        const asset = allAssets().find((a) => a.id === parsed.id);
        if (!asset) {
            showStatus?.("Texture introuvable");
            return;
        }
        showStatus?.("Application…");
        try {
            const maps = await resolveAssetMaps(asset);
            const forced = readLayerSelect();
            if (forced !== "auto") {
                const source =
                    (forced === "color" && (maps.color || asset.dataUrl)) ||
                    (forced === "normal" && (maps.normal || maps.color || asset.dataUrl || asset.normalDataUrl)) ||
                    (forced === "specular" && (maps.specular || maps.color || asset.dataUrl || asset.specularDataUrl)) ||
                    (forced === "roughness" && (maps.roughness || maps.color || asset.dataUrl || asset.roughnessDataUrl)) ||
                    asset.dataUrl ||
                    maps.color ||
                    maps.normal ||
                    maps.specular ||
                    maps.roughness ||
                    "";
                maps.color = undefined;
                maps.normal = undefined;
                maps.specular = undefined;
                maps.roughness = undefined;
                if (source) maps[forced] = source;
            }
            if (!maps.color && !maps.normal && !maps.specular && !maps.roughness) {
                showStatus?.("Aucune map utilisable");
                return;
            }
            await onDropTexture({
                clientX,
                clientY,
                maps,
                name: asset.name,
                transform: readTransform(),
            });
        } catch (error) {
            showStatus?.(error instanceof Error ? error.message : "Drop impossible");
        }
    }

    addBtn?.addEventListener("click", (event) => {
        event.stopPropagation();
        fileInput?.click();
    });

    domainSelect?.addEventListener("change", () => {
        if (syncingDomainSelect) return;
        const domain = readDomainSelect();
        const selected = selectedAsset();
        if (selected && !selected.builtin) {
            void moveSelectedToDomain(domain).catch((err) => {
                showStatus?.(err instanceof Error ? err.message : "Déplacement impossible");
            });
            return;
        }
        activeTab = domain;
        selectedId = null;
        renderTabs();
        renderGrid();
    });

    domainSelect?.addEventListener("pointerdown", (event) => event.stopPropagation());
    domainSelect?.addEventListener("mousedown", (event) => event.stopPropagation());
    domainSelect?.addEventListener("click", (event) => event.stopPropagation());
    layerSelect?.addEventListener("pointerdown", (event) => event.stopPropagation());
    layerSelect?.addEventListener("mousedown", (event) => event.stopPropagation());
    layerSelect?.addEventListener("click", (event) => event.stopPropagation());

    fileInput?.addEventListener("change", () => {
        const files = [...(fileInput.files || [])];
        fileInput.value = "";
        if (files.length) {
            void addFiles(files).catch((err) => {
                showStatus?.(err instanceof Error ? err.message : "Import impossible");
            });
        }
    });

    deleteBtn?.addEventListener("click", (event) => {
        event.stopPropagation();
        const asset = selectedAsset();
        if (!asset || asset.builtin) return;
        void deleteAsset(asset.id)
            .then(() => {
                selectedId = null;
                return refresh();
            })
            .then(() => showStatus?.(`Supprimé : ${asset.name}`));
    });

    bindUvPair(tileXInput, tileXNum, 1, 1);
    bindUvPair(tileYInput, tileYNum, 1, 1);
    bindUvPair(tileZInput, tileZNum, 1, 1);
    bindUvPair(offsetXInput, offsetXNum, 2, 0);
    bindUvPair(offsetYInput, offsetYNum, 2, 0);
    bindUvPair(offsetZInput, offsetZNum, 2, 0);
    syncTransformOutputs();

    const dropTarget =
        viewport?.querySelector?.("canvas") ||
        viewport ||
        document.querySelector("#lab-viewport canvas") ||
        document.getElementById("lab-viewport");
    if (dropTarget) {
        dropTarget.addEventListener("dragover", (event) => {
            const types = event.dataTransfer?.types;
            if (!types) return;
            const list = [...types];
            if (list.includes("application/x-lab-objlib")) return;
            const ok =
                list.includes(TEXLIB_DRAG_MIME) ||
                list.includes("text/plain");
            if (!ok) return;
            event.preventDefault();
            if (event.dataTransfer) event.dataTransfer.dropEffect = "copy";
            viewport?.classList.add("lab-viewport--drop");
        });
        dropTarget.addEventListener("dragleave", (event) => {
            const related = /** @type {Node | null} */ (event.relatedTarget);
            if (related && dropTarget.contains(related)) return;
            viewport?.classList.remove("lab-viewport--drop");
        });
        dropTarget.addEventListener("drop", (event) => {
            const types = event.dataTransfer?.types ? [...event.dataTransfer.types] : [];
            if (types.includes("application/x-lab-objlib")) return;
            const raw =
                event.dataTransfer?.getData(TEXLIB_DRAG_MIME) ||
                event.dataTransfer?.getData("text/plain") ||
                "";
            if (!raw || !raw.includes('"id"') || raw.includes("lab-object")) return;
            event.preventDefault();
            event.stopPropagation();
            viewport?.classList.remove("lab-viewport--drop");
            viewport?.classList.remove("lab-viewport--texdrop");
            void handleDropPayload(event.clientX, event.clientY, raw);
        });
    }

    void refresh();

    return {
        refresh,
        readTransform,
        getApplyMode: () => applyMode,
        setApplyMode,
    };
}
