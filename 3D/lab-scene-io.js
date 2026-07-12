/** Scènes 3D — bibliothèque locale + enregistrement sur disque (API Fichiers). */
import * as THREE from "three";

const SCENE_VERSION = 1;
const DEFAULT_FILENAME = "scene-lab-3d.json";
const DB_NAME = "lab3d-scenes";
const DB_STORE = "scenes";

const FILE_TYPES = [
    {
        description: "Scène laboratoire 3D",
        accept: { "application/json": [".json"] },
    },
];

/** @type {string | null} */
let currentFileName = null;
/** @type {FileSystemFileHandle | null} */
let diskFileHandle = null;

/**
 * @param {ReturnType<import("./lab-history.js").captureObjectState> & { kind?: string }} snapshot
 */
export function serializeObjectSnapshot(snapshot) {
    const base = {
        kind: snapshot.kind || "cube",
        position: {
            x: snapshot.position.x,
            y: snapshot.position.y,
            z: snapshot.position.z,
        },
        rotation: {
            x: snapshot.rotation.x,
            y: snapshot.rotation.y,
            z: snapshot.rotation.z,
        },
        scale: {
            x: snapshot.scale.x,
            y: snapshot.scale.y,
            z: snapshot.scale.z,
        },
    };

    if (snapshot.kind === "light") {
        return {
            ...base,
            lightType: snapshot.lightType || "point",
            markerVisible: snapshot.markerVisible !== false,
            intensity: typeof snapshot.intensity === "number" ? snapshot.intensity : 1,
            shadowEnabled: !!snapshot.shadowEnabled,
        };
    }

    return {
        ...base,
        collisionEnabled: !!snapshot.collisionEnabled,
        shadowEnabled: !!snapshot.shadowEnabled,
        color: snapshot.color || "#00d1ff",
        textureDataUrl: snapshot.textureDataUrl || null,
    };
}

/**
 * @param {ReturnType<typeof serializeObjectSnapshot>} raw
 */
export function deserializeObjectSnapshot(raw) {
    const base = {
        kind: raw.kind || "cube",
        position: new THREE.Vector3(raw.position.x, raw.position.y, raw.position.z),
        rotation: new THREE.Euler(raw.rotation.x, raw.rotation.y, raw.rotation.z),
        scale: new THREE.Vector3(raw.scale.x, raw.scale.y, raw.scale.z),
    };

    if (raw.kind === "light") {
        return {
            ...base,
            lightType: raw.lightType || "point",
            markerVisible: raw.markerVisible !== false,
            intensity: typeof raw.intensity === "number" ? raw.intensity : 1,
            shadowEnabled: !!raw.shadowEnabled,
        };
    }

    return {
        ...base,
        collisionEnabled: !!raw.collisionEnabled,
        shadowEnabled: !!raw.shadowEnabled,
        color: raw.color || "#00d1ff",
        textureDataUrl: raw.textureDataUrl || null,
    };
}

/**
 * @param {ReturnType<typeof serializeObjectSnapshot>[]} objects
 */
export function buildSceneDocument(objects, { name = "" } = {}) {
    return {
        version: SCENE_VERSION,
        name,
        objects,
    };
}

/**
 * @param {unknown} data
 * @returns {ReturnType<typeof deserializeObjectSnapshot>[]}
 */
export function parseSceneDocument(data) {
    if (!data || typeof data !== "object") {
        throw new Error("Fichier de scène invalide.");
    }

    const doc = /** @type {{ objects?: unknown[] }} */ (data);
    if (!Array.isArray(doc.objects)) {
        throw new Error("Aucun objet dans le fichier.");
    }

    return doc.objects.map((entry) => {
        const raw = /** @type {ReturnType<typeof serializeObjectSnapshot>} */ (entry);
        if (!raw.position || !raw.rotation || !raw.scale) {
            throw new Error("Objet incomplet dans le fichier.");
        }
        return deserializeObjectSnapshot(raw);
    });
}

export function getCurrentSceneFileName() {
    return currentFileName;
}

export function setCurrentSceneFileName(name) {
    currentFileName = name ? normalizeFilename(name) : null;
}

export function clearSceneFileSession() {
    currentFileName = null;
    diskFileHandle = null;
}

export function supportsDiskFilePicker() {
    return typeof window.showSaveFilePicker === "function"
        && typeof window.showOpenFilePicker === "function";
}

export function hasDiskFileHandle() {
    return diskFileHandle !== null;
}

function normalizeFilename(name) {
    const trimmed = (name || DEFAULT_FILENAME).trim() || DEFAULT_FILENAME;
    return trimmed.endsWith(".json") ? trimmed : `${trimmed}.json`;
}

function serializeDocument(data) {
    return JSON.stringify(data, null, 2);
}

/**
 * @returns {Promise<IDBDatabase>}
 */
function openDatabase() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, 1);
        request.onupgradeneeded = () => {
            const db = request.result;
            if (!db.objectStoreNames.contains(DB_STORE)) {
                db.createObjectStore(DB_STORE, { keyPath: "name" });
            }
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error ?? new Error("IndexedDB indisponible"));
    });
}

/**
 * @returns {Promise<{ name: string, data: object, updatedAt: number }[]>}
 */
export async function listSavedScenes() {
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(DB_STORE, "readonly");
        const store = tx.objectStore(DB_STORE);
        const request = store.getAll();
        request.onsuccess = () => {
            const rows = /** @type {{ name: string, data: object, updatedAt: number }[]} */ (request.result || []);
            rows.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
            resolve(rows);
        };
        request.onerror = () => reject(request.error);
    });
}

/**
 * @param {string} name
 * @param {object} data
 */
export async function saveSceneToLibrary(name, data) {
    const filename = normalizeFilename(name);
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(DB_STORE, "readwrite");
        tx.objectStore(DB_STORE).put({
            name: filename,
            data,
            updatedAt: Date.now(),
        });
        tx.oncomplete = () => resolve(filename);
        tx.onerror = () => reject(tx.error);
    });
}

/**
 * @param {string} name
 * @returns {Promise<object | null>}
 */
export async function loadSceneFromLibrary(name) {
    const filename = normalizeFilename(name);
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(DB_STORE, "readonly");
        const request = tx.objectStore(DB_STORE).get(filename);
        request.onsuccess = () => {
            const row = /** @type {{ data?: object } | undefined} */ (request.result);
            resolve(row?.data ?? null);
        };
        request.onerror = () => reject(request.error);
    });
}

/**
 * Export silencieux vers le dossier Téléchargements (sans boîte de dialogue).
 * @param {object} data
 * @param {string} filename
 */
export function downloadSceneJson(data, filename = DEFAULT_FILENAME) {
    const blob = new Blob([serializeDocument(data)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = normalizeFilename(filename);
    link.style.display = "none";
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
}

/**
 * @param {FileSystemFileHandle} handle
 * @param {object} data
 */
async function writeToDiskHandle(handle, data) {
    const writable = await handle.createWritable();
    await writable.write(serializeDocument(data));
    await writable.close();
}

/**
 * Enregistre sur le disque dur (explorateur de fichiers).
 * @param {object} data
 * @param {{ saveAs?: boolean, suggestedName?: string | null }} [opts]
 */
export async function saveSceneToDiskLocation(data, { saveAs = false, suggestedName = null } = {}) {
    const suggested = normalizeFilename(suggestedName || currentFileName || DEFAULT_FILENAME);

    if (supportsDiskFilePicker()) {
        try {
            if (!saveAs && diskFileHandle) {
                await writeToDiskHandle(diskFileHandle, data);
                currentFileName = diskFileHandle.name;
                await saveSceneToLibrary(currentFileName, data);
                return { name: currentFileName, onDisk: true };
            }

            const handle = await window.showSaveFilePicker({
                suggestedName: suggested,
                types: FILE_TYPES,
            });
            await writeToDiskHandle(handle, data);
            diskFileHandle = handle;
            currentFileName = handle.name;
            await saveSceneToLibrary(currentFileName, data);
            return { name: handle.name, onDisk: true };
        } catch (error) {
            if (/** @type {DOMException} */ (error).name === "AbortError") throw error;
        }
    }

    downloadSceneJson(data, suggested);
    currentFileName = suggested;
    diskFileHandle = null;
    await saveSceneToLibrary(currentFileName, data);
    return { name: currentFileName, onDisk: false };
}

/**
 * Ouvre une scène depuis le disque dur (explorateur de fichiers).
 * @returns {Promise<{ name: string, data: object } | null>}
 */
export async function openSceneFromDiskLocation() {
    if (supportsDiskFilePicker()) {
        try {
            const [handle] = await window.showOpenFilePicker({
                types: FILE_TYPES,
                multiple: false,
            });
            const file = await handle.getFile();
            const data = JSON.parse(await file.text());
            diskFileHandle = handle;
            currentFileName = handle.name;
            return { name: handle.name, data };
        } catch (error) {
            if (/** @type {DOMException} */ (error).name === "AbortError") return null;
            throw error;
        }
    }

    return pickSceneJsonFileLegacy();
}

/**
 * @returns {Promise<{ name: string, data: unknown } | null>}
 */
function pickSceneJsonFileLegacy() {
    return new Promise((resolve) => {
        const input = document.createElement("input");
        input.type = "file";
        input.accept = ".json,application/json";
        input.addEventListener("change", () => {
            const file = input.files?.[0];
            if (!file) {
                resolve(null);
                return;
            }

            const reader = new FileReader();
            reader.onload = () => {
                try {
                    diskFileHandle = null;
                    currentFileName = file.name;
                    resolve({
                        name: file.name,
                        data: JSON.parse(String(reader.result)),
                    });
                } catch {
                    resolve(null);
                }
            };
            reader.onerror = () => resolve(null);
            reader.readAsText(file);
        });
        input.click();
    });
}

/**
 * @param {object} data
 * @param {{ saveAs?: boolean, suggestedName?: string | null, askName: (suggested: string) => Promise<string | null> }} opts
 */
export async function writeSceneToLibrary(data, { saveAs = false, suggestedName = null, askName }) {
    const suggested = normalizeFilename(suggestedName || currentFileName || DEFAULT_FILENAME);
    let filename = suggested;

    if (saveAs || !currentFileName) {
        const input = await askName(suggested);
        if (input === null) {
            throw new DOMException("Annulé", "AbortError");
        }
        filename = normalizeFilename(input);
    }

    await saveSceneToLibrary(filename, data);
    downloadSceneJson(data, filename);
    currentFileName = filename;
    return { name: filename };
}

/**
 * @param {(scenes: { name: string, updatedAt?: number }[]) => Promise<string | null>} pickScene
 * @returns {Promise<{ name: string, data: object } | null>}
 */
export async function readSceneFromLibrary(pickScene) {
    const scenes = await listSavedScenes();
    const pickedName = await pickScene(scenes.map(({ name, updatedAt }) => ({ name, updatedAt })));
    if (!pickedName) return null;

    const data = await loadSceneFromLibrary(pickedName);
    if (!data) {
        throw new Error("Scène introuvable dans la bibliothèque.");
    }

    currentFileName = normalizeFilename(pickedName);
    return { name: currentFileName, data };
}

export { DEFAULT_FILENAME };
