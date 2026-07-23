/** Import de modèles 3D (GLB, FBX, OBJ, STL, Collada, PLY…). */
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { FBXLoader } from "three/addons/loaders/FBXLoader.js";
import { OBJLoader } from "three/addons/loaders/OBJLoader.js";
import { STLLoader } from "three/addons/loaders/STLLoader.js";
import { ColladaLoader } from "three/addons/loaders/ColladaLoader.js";
import { PLYLoader } from "three/addons/loaders/PLYLoader.js";
import { pickFilePreservingFullscreen } from "./fullscreen.js";

export const LAB_IMPORTED_KEY = "labImported";

/** @typedef {"glb" | "gltf" | "fbx" | "obj" | "stl" | "dae" | "ply" | "blend"} ImportFormat */

/**
 * @type {Record<string, { format: ImportFormat, label: string, accept: string }>}
 */
export const IMPORT_ACTIONS = {
    any: {
        format: "glb",
        label: "Modèle 3D…",
        accept: ".glb,.gltf,.fbx,.obj,.stl,.dae,.ply,model/gltf-binary,model/gltf+json,application/octet-stream",
    },
    gltf: {
        format: "glb",
        label: "GLTF / GLB (.glb, .gltf)",
        accept: ".glb,.gltf,model/gltf-binary,model/gltf+json",
    },
    fbx: {
        format: "fbx",
        label: "FBX (.fbx)",
        accept: ".fbx,application/octet-stream",
    },
    obj: {
        format: "obj",
        label: "OBJ (.obj)",
        accept: ".obj,text/plain",
    },
    stl: {
        format: "stl",
        label: "STL (.stl)",
        accept: ".stl,model/stl,application/sla",
    },
    dae: {
        format: "dae",
        label: "Collada (.dae)",
        accept: ".dae,model/vnd.collada+xml",
    },
    ply: {
        format: "ply",
        label: "PLY (.ply)",
        accept: ".ply",
    },
    blend: {
        format: "blend",
        label: "Blender (.blend)",
        accept: ".blend",
    },
};

const gltfLoader = new GLTFLoader();
const fbxLoader = new FBXLoader();
const objLoader = new OBJLoader();
const stlLoader = new STLLoader();
const colladaLoader = new ColladaLoader();
const plyLoader = new PLYLoader();

/**
 * @param {string} name
 * @returns {ImportFormat | null}
 */
export function formatFromFileName(name) {
    const lower = String(name || "").toLowerCase();
    if (lower.endsWith(".glb")) return "glb";
    if (lower.endsWith(".gltf")) return "gltf";
    if (lower.endsWith(".fbx")) return "fbx";
    if (lower.endsWith(".obj")) return "obj";
    if (lower.endsWith(".stl")) return "stl";
    if (lower.endsWith(".dae")) return "dae";
    if (lower.endsWith(".ply")) return "ply";
    if (lower.endsWith(".blend")) return "blend";
    return null;
}

/**
 * @param {File} file
 * @returns {Promise<string>}
 */
export function fileToDataUrl(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
            if (typeof reader.result === "string") resolve(reader.result);
            else reject(new Error("Lecture fichier impossible"));
        };
        reader.onerror = () => reject(new Error("Lecture fichier impossible"));
        reader.readAsDataURL(file);
    });
}

/**
 * @param {File} file
 * @returns {Promise<ArrayBuffer>}
 */
function fileToArrayBuffer(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
            if (reader.result instanceof ArrayBuffer) resolve(reader.result);
            else reject(new Error("Lecture fichier impossible"));
        };
        reader.onerror = () => reject(new Error("Lecture fichier impossible"));
        reader.readAsArrayBuffer(file);
    });
}

/**
 * @param {File} file
 * @returns {Promise<string>}
 */
function fileToText(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
            if (typeof reader.result === "string") resolve(reader.result);
            else reject(new Error("Lecture fichier impossible"));
        };
        reader.onerror = () => reject(new Error("Lecture fichier impossible"));
        reader.readAsText(file);
    });
}

/**
 * @param {string} dataUrl
 * @returns {{ mime: string, buffer: ArrayBuffer }}
 */
function dataUrlToBuffer(dataUrl) {
    const match = /^data:([^;,]+)?(;base64)?,(.*)$/s.exec(dataUrl);
    if (!match) throw new Error("Data URL invalide");
    const mime = match[1] || "application/octet-stream";
    const isBase64 = !!match[2];
    const payload = match[3];
    if (isBase64) {
        const binary = atob(payload);
        const buffer = new ArrayBuffer(binary.length);
        const view = new Uint8Array(buffer);
        for (let i = 0; i < binary.length; i += 1) view[i] = binary.charCodeAt(i);
        return { mime, buffer };
    }
    const decoded = decodeURIComponent(payload);
    const buffer = new TextEncoder().encode(decoded).buffer;
    return { mime, buffer };
}

/**
 * @param {THREE.Object3D} root
 */
export function prepareImportedContent(root) {
    root.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(root);
    if (!box.isEmpty()) {
        const size = new THREE.Vector3();
        box.getSize(size);
        const maxDim = Math.max(size.x, size.y, size.z);
        if (maxDim > 0 && (maxDim < 0.05 || maxDim > 80)) {
            root.scale.multiplyScalar(2 / maxDim);
            root.updateMatrixWorld(true);
        }
        const fitted = new THREE.Box3().setFromObject(root);
        const center = fitted.getCenter(new THREE.Vector3());
        root.position.x -= center.x;
        root.position.z -= center.z;
        root.position.y -= fitted.min.y;
        root.updateMatrixWorld(true);
    }

    root.traverse((child) => {
        if (!(child instanceof THREE.Mesh)) return;
        child.userData.skipObjectPbr = true;
        child.castShadow = true;
        child.receiveShadow = true;
        const materials = Array.isArray(child.material) ? child.material : [child.material];
        materials.forEach((mat) => {
            if (!mat) return;
            mat.side = mat.side ?? THREE.FrontSide;
            mat.needsUpdate = true;
        });
    });
}

/**
 * @param {THREE.BufferGeometry} geometry
 * @returns {THREE.Mesh}
 */
function meshFromGeometry(geometry) {
    geometry.computeVertexNormals();
    return new THREE.Mesh(
        geometry,
        new THREE.MeshStandardMaterial({
            color: 0x8b9cb3,
            roughness: 0.75,
            metalness: 0.05,
        })
    );
}

/**
 * @param {ArrayBuffer | string} data
 * @param {ImportFormat} format
 * @returns {Promise<THREE.Object3D>}
 */
export async function parseModelData(data, format) {
    if (format === "blend") {
        throw new Error(
            "Les fichiers .blend ne sont pas lisibles dans le navigateur. Exportez depuis Blender en GLB, FBX ou OBJ."
        );
    }

    if (format === "glb" || format === "gltf") {
        const buffer = typeof data === "string" ? dataUrlToBuffer(data).buffer : data;
        return new Promise((resolve, reject) => {
            gltfLoader.parse(
                buffer,
                "",
                (gltf) => resolve(gltf.scene || gltf.scenes?.[0] || new THREE.Group()),
                (err) => reject(err instanceof Error ? err : new Error("GLTF invalide"))
            );
        });
    }

    if (format === "fbx") {
        const buffer = typeof data === "string" ? dataUrlToBuffer(data).buffer : data;
        return fbxLoader.parse(buffer);
    }

    if (format === "obj") {
        const text =
            typeof data === "string" && data.startsWith("data:")
                ? new TextDecoder().decode(dataUrlToBuffer(data).buffer)
                : typeof data === "string"
                  ? data
                  : new TextDecoder().decode(data);
        return objLoader.parse(text);
    }

    if (format === "stl") {
        const buffer = typeof data === "string" ? dataUrlToBuffer(data).buffer : data;
        return meshFromGeometry(stlLoader.parse(buffer));
    }

    if (format === "dae") {
        const text =
            typeof data === "string" && data.startsWith("data:")
                ? new TextDecoder().decode(dataUrlToBuffer(data).buffer)
                : typeof data === "string"
                  ? data
                  : new TextDecoder().decode(data);
        const result = colladaLoader.parse(text, "");
        return result.scene || new THREE.Group();
    }

    if (format === "ply") {
        const buffer = typeof data === "string" ? dataUrlToBuffer(data).buffer : data;
        return meshFromGeometry(plyLoader.parse(buffer));
    }

    throw new Error(`Format non supporté : ${format}`);
}

/**
 * @param {File} file
 * @returns {Promise<{
 *   root: THREE.Object3D,
 *   format: ImportFormat,
 *   name: string,
 *   dataUrl: string,
 * }>}
 */
export async function loadModelFromFile(file) {
    const format = formatFromFileName(file.name);
    if (!format) {
        throw new Error("Format non reconnu. Utilisez GLB, GLTF, FBX, OBJ, STL, DAE ou PLY.");
    }
    if (format === "blend") {
        throw new Error(
            "Fichier Blender (.blend) : exportez d’abord en GLB / FBX / OBJ depuis Blender."
        );
    }

    const dataUrl = await fileToDataUrl(file);
    let root;

    if (format === "glb" || format === "gltf" || format === "fbx" || format === "stl" || format === "ply") {
        const buffer = await fileToArrayBuffer(file);
        root = await parseModelData(buffer, format);
    } else {
        const text = await fileToText(file);
        root = await parseModelData(text, format);
    }

    prepareImportedContent(root);
    const name = file.name.replace(/\.[^.]+$/, "") || "Import";
    return { root, format, name, dataUrl };
}

/**
 * @param {string} dataUrl
 * @param {ImportFormat} format
 * @returns {Promise<THREE.Object3D>}
 */
export async function loadModelFromDataUrl(dataUrl, format) {
    const root = await parseModelData(dataUrl, format);
    prepareImportedContent(root);
    return root;
}

/**
 * Menu « Importer » de la barre du haut.
 * @param {{
 *   onImportFile: (file: File) => Promise<void> | void,
 *   showStatus?: (msg: string) => void,
 * }} options
 */
export function initImportMenu({ onImportFile, showStatus }) {
    const menuRoot = document.querySelector('[data-menu="import"]');
    if (!menuRoot) return;

    const trigger = menuRoot.querySelector(".lab-menu__trigger");
    const panel = menuRoot.querySelector(".lab-menu__panel");
    const fileInput = /** @type {HTMLInputElement | null} */ (
        document.getElementById("lab-import-file-input")
    );
    if (!trigger || !panel || !fileInput) return;

    /** @type {string | null} */
    let pendingAction = null;

    function closePanel() {
        panel.hidden = true;
        trigger.setAttribute("aria-expanded", "false");
    }

    trigger.addEventListener("click", (event) => {
        event.stopPropagation();
        const willOpen = panel.hidden;
        panel.hidden = !willOpen;
        trigger.setAttribute("aria-expanded", willOpen ? "true" : "false");
    });

    panel.querySelectorAll("[data-import-action]").forEach((item) => {
        item.addEventListener("click", (event) => {
            event.stopPropagation();
            const action = item.getAttribute("data-import-action") || "";
            closePanel();

            if (action === "blend") {
                showStatus?.(
                    "Blender (.blend) : exportez en GLB, FBX ou OBJ depuis Blender, puis importez ici."
                );
                return;
            }

            const meta = IMPORT_ACTIONS[action];
            if (!meta) return;
            pendingAction = action;
            fileInput.accept = meta.accept;
            void pickFilePreservingFullscreen(fileInput);
        });
    });

    fileInput.addEventListener("change", () => {
        const file = fileInput.files?.[0];
        fileInput.value = "";
        const action = pendingAction;
        pendingAction = null;
        if (!file) return;
        void (async () => {
            try {
                if (action === "blend" || formatFromFileName(file.name) === "blend") {
                    showStatus?.(
                        "Blender (.blend) non supporté — exportez en GLB / FBX / OBJ."
                    );
                    return;
                }
                await onImportFile(file);
            } catch (error) {
                console.error("[LAB 3D] Import échoué :", error);
                showStatus?.(error instanceof Error ? error.message : "Import impossible");
            }
        })();
    });

    document.addEventListener("click", () => closePanel());
    document.addEventListener("keydown", (event) => {
        if (event.key === "Escape") closePanel();
    });
}
