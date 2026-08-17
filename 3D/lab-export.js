/** Export de la scène (sans grille ni aides visuelles) en GLTF, OBJ et FBX. */
import * as THREE from "three";
import { FBXExporter } from "@comfyorg/fbx-exporter-three";
import { GLTFExporter } from "three/addons/exporters/GLTFExporter.js";
import { OBJExporter } from "three/addons/exporters/OBJExporter.js";
import { LAB_LIGHT_KEY } from "./lab-lights.js";
import { FACE_CANVAS_SIZE } from "./lab-face-draw.js";

const EXPORT_BASENAME = "scene-3d";

/**
 * Vrai si l'objet ou un de ses parents est une lumière du labo, un outil
 * d'édition (gizmo TransformControls) ou un helper three.js.
 * @param {THREE.Object3D} object
 */
function isEditorArtifact(object) {
    let current = object;
    while (current) {
        if (current.userData?.[LAB_LIGHT_KEY] === true) return true;
        if (/Helper$|^TransformControls/.test(current.type)) return true;
        current = current.parent;
    }
    return false;
}

/**
 * Meshes exportables : contenu de la scène sans la grille (LineSegments,
 * exclue d'office), sans les ombres portées simulées, sans les marqueurs
 * et aides de lumières, sans le gizmo de transformation.
 * @param {THREE.Scene} scene
 * @returns {THREE.Mesh[]}
 */
function collectExportMeshes(scene) {
    /** @type {THREE.Mesh[]} */
    const meshes = [];
    scene.traverse((child) => {
        if (!(child instanceof THREE.Mesh)) return;
        if (child.name === "shadow-overlay") return;
        if (isEditorArtifact(child)) return;
        meshes.push(child);
    });
    return meshes;
}

/**
 * Matériau propre pour l'export : sans shader personnalisé, avec le dessin
 * des faces fusionné dans la texture couleur (sinon il serait perdu).
 * Conserve le verre physique (transmission) quand il est actif.
 * @param {THREE.Material} material
 * @returns {THREE.MeshStandardMaterial}
 */
function createBakedMaterial(material) {
    if (!material) {
        return new THREE.MeshStandardMaterial({ color: 0xffffff });
    }
    const glass =
        !!material.userData?._labGlass ||
        (material.isMeshPhysicalMaterial &&
            typeof material.transmission === "number" &&
            material.transmission > 0.02);
    const color = material.color?.clone?.() ?? new THREE.Color(0xffffff);
    const roughness = typeof material.roughness === "number" ? material.roughness : 0.8;
    const metalness = typeof material.metalness === "number" ? material.metalness : 0;
    const side = material.side ?? THREE.FrontSide;

    /** @type {THREE.MeshStandardMaterial} */
    const out = glass
        ? new THREE.MeshPhysicalMaterial({
              color,
              roughness,
              metalness,
              transparent: true,
              opacity: 1,
              side,
              transmission:
                  typeof material.transmission === "number" ? material.transmission : 0.82,
              thickness: typeof material.thickness === "number" ? material.thickness : 0.45,
          })
        : new THREE.MeshStandardMaterial({
              color,
              roughness,
              metalness,
              transparent: material.transparent === true,
              opacity: typeof material.opacity === "number" ? material.opacity : 1,
              side,
          });

    const paintCanvas = material.userData?._labPaintUniform?.value?.image ?? null;
    const baseMap =
        material.map && !material.userData?._labFacePaint_placeholderMap ? material.map : null;

    if (paintCanvas) {
        const size = FACE_CANVAS_SIZE;
        const canvas = document.createElement("canvas");
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext("2d");
        if (ctx) {
            ctx.fillStyle = `#${out.color.getHexString()}`;
            ctx.fillRect(0, 0, size, size);
            if (baseMap?.image) {
                const repeat = Math.max(1, Math.round(baseMap.repeat?.x || 1));
                const tile = size / repeat;
                for (let iy = 0; iy < repeat; iy += 1) {
                    for (let ix = 0; ix < repeat; ix += 1) {
                        ctx.drawImage(baseMap.image, ix * tile, iy * tile, tile, tile);
                    }
                }
            }
            ctx.drawImage(paintCanvas, 0, 0, size, size);
        }
        const texture = new THREE.CanvasTexture(canvas);
        if ("colorSpace" in texture) texture.colorSpace = THREE.SRGBColorSpace;
        else texture.encoding = THREE.sRGBEncoding;
        out.map = texture;
        out.color.set(0xffffff);
    } else if (baseMap) {
        out.map = baseMap;
    }

    if (material.normalMap) {
        out.normalMap = material.normalMap;
        out.normalScale = material.normalScale?.clone?.() ?? new THREE.Vector2(1, 1);
    }
    return out;
}

/**
 * Scène jetable pour l'export : clones des meshes avec transformations
 * relatives à `root` et matériaux « cuits ».
 * @param {THREE.Object3D} root
 * @param {{
 *   keepWorldRotationScale?: boolean,
 *   bakeTransform?: boolean,
 * }} [opts]
 * @returns {THREE.Scene}
 */
function cloneExportableMeshes(root, opts = {}) {
    root.updateMatrixWorld(true);
    const exportScene = new THREE.Scene();
    const relative = new THREE.Matrix4();
    if (opts.keepWorldRotationScale) {
        // Recale à l'origine sans perdre rotation / échelle du pivot.
        const rootPos = new THREE.Vector3().setFromMatrixPosition(root.matrixWorld);
        relative.makeTranslation(-rootPos.x, -rootPos.y, -rootPos.z);
    } else {
        relative.copy(root.matrixWorld).invert();
    }
    const local = new THREE.Matrix4();
    const pos = new THREE.Vector3();
    const quat = new THREE.Quaternion();
    const scl = new THREE.Vector3();
    let counter = 0;

    for (const mesh of collectExportMeshes(root)) {
        const materials = Array.isArray(mesh.material)
            ? mesh.material.map((entry) => createBakedMaterial(entry))
            : createBakedMaterial(mesh.material);
        local.multiplyMatrices(relative, mesh.matrixWorld);

        /** @type {THREE.BufferGeometry} */
        let geometry = mesh.geometry;
        const clone = new THREE.Mesh(geometry, materials);
        counter += 1;
        clone.name = mesh.name || `Objet_${counter}`;

        if (opts.bakeTransform && geometry) {
            geometry = geometry.clone();
            geometry.applyMatrix4(local);
            if (geometry.attributes.normal) {
                geometry.normalizeNormals();
            }
            geometry.computeBoundingBox();
            geometry.computeBoundingSphere();
            clone.geometry = geometry;
            clone.position.set(0, 0, 0);
            clone.quaternion.identity();
            clone.scale.set(1, 1, 1);
        } else {
            local.decompose(pos, quat, scl);
            clone.position.copy(pos);
            clone.quaternion.copy(quat);
            clone.scale.copy(scl);
        }
        exportScene.add(clone);
    }

    exportScene.updateMatrixWorld(true);
    return exportScene;
}

/**
 * Scène jetable pour l'export : clones des meshes avec transformations
 * monde appliquées et matériaux « cuits ».
 * @param {THREE.Scene} scene
 * @returns {THREE.Scene}
 */
export function buildExportScene(scene) {
    return cloneExportableMeshes(scene);
}

/**
 * @param {string} name
 * @returns {string}
 */
function sanitizeExportBasename(name) {
    const cleaned = String(name || "objet")
        .replace(/\.(glb|gltf)$/i, "")
        .replace(/[<>:"/\\|?*\u0000-\u001f]+/g, "-")
        .replace(/\s+/g, "-")
        .replace(/-+/g, "-")
        .replace(/^-|-$/g, "")
        .slice(0, 80);
    return cleaned || "objet";
}

/**
 * @param {Blob} blob
 * @param {string} filename
 */
function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
}

function parseGlbArrayBuffer(exportScene) {
    return new Promise((resolve, reject) => {
        try {
            new GLTFExporter().parse(
                exportScene,
                (result) => {
                    if (result instanceof ArrayBuffer) {
                        resolve(result);
                        return;
                    }
                    const json = JSON.stringify(result);
                    resolve(new TextEncoder().encode(json).buffer);
                },
                { binary: true }
            );
        } catch (error) {
            reject(error);
        }
    });
}

/**
 * @param {THREE.Scene} exportScene
 * @param {string} filename
 * @returns {Promise<void>}
 */
function parseAndDownloadGlb(exportScene, filename) {
    return parseGlbArrayBuffer(exportScene).then((buffer) => {
        downloadBlob(new Blob([buffer], { type: "model/gltf-binary" }), filename);
    });
}

/**
 * GLB en data-URL (pour figer un import après séparation de pièces).
 * @param {THREE.Object3D} root
 * @returns {Promise<string>}
 */
export async function objectToGlbDataUrl(root) {
    const exportScene = cloneExportableMeshes(root);
    if (!exportScene.children.length) {
        throw new Error("Aucun mesh à encoder");
    }
    const buffer = await parseGlbArrayBuffer(exportScene);
    const bytes = new Uint8Array(buffer);
    let binary = "";
    const step = 0x8000;
    for (let i = 0; i < bytes.length; i += step) {
        binary += String.fromCharCode.apply(null, bytes.subarray(i, i + step));
    }
    return `data:model/gltf-binary;base64,${btoa(binary)}`;
}

/**
 * @param {THREE.Scene} scene
 * @returns {Promise<void>}
 */
export function exportSceneGltf(scene) {
    return parseAndDownloadGlb(buildExportScene(scene), `${EXPORT_BASENAME}.glb`);
}

/**
 * Exporte un objet lab (cube, import, architecture…) en fichier .glb.
 * L’objet est recalé à l’origine, rotation et échelle conservées.
 * @param {THREE.Object3D} object
 * @param {string} [name]
 * @returns {Promise<string>} nom du fichier téléchargé
 */
export async function exportObjectGltf(object, name) {
    if (!object) throw new Error("Aucun objet à exporter");
    const exportScene = cloneExportableMeshes(object, {
        keepWorldRotationScale: true,
        bakeTransform: true,
    });
    if (!exportScene.children.length) {
        throw new Error("Cet objet n’a pas de mesh exportable");
    }
    const filename = `${sanitizeExportBasename(name)}.glb`;
    await parseAndDownloadGlb(exportScene, filename);
    return filename;
}

/**
 * @param {THREE.Scene} scene
 */
export function exportSceneObj(scene) {
    const exportScene = buildExportScene(scene);
    const text = new OBJExporter().parse(exportScene);
    downloadBlob(new Blob([text], { type: "text/plain" }), `${EXPORT_BASENAME}.obj`);
}

/**
 * Export FBX binaire 7.4 (Blender, Unity, Unreal, Maya).
 * @param {THREE.Scene} scene
 * @returns {Promise<void>}
 */
export async function exportSceneFbx(scene) {
    const exportScene = buildExportScene(scene);
    const bytes = await new FBXExporter().parseAsync(exportScene, {
        preset: "blender",
        embedTextures: true,
    });
    downloadBlob(new Blob([bytes], { type: "application/octet-stream" }), `${EXPORT_BASENAME}.fbx`);
}

/**
 * Menu « Exporter » de la barre du haut.
 * @param {{
 *   getScene: () => THREE.Scene,
 *   showStatus?: (msg: string) => void,
 * }} options
 */
export function initExportMenu({ getScene, showStatus }) {
    const menuRoot = document.querySelector('[data-menu="export"]');
    if (!menuRoot) return;

    const trigger = menuRoot.querySelector(".lab-menu__trigger");
    const panel = menuRoot.querySelector(".lab-menu__panel");
    if (!trigger || !panel) return;

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

    const actions = {
        gltf: () => exportSceneGltf(getScene()),
        obj: () => exportSceneObj(getScene()),
        fbx: () => exportSceneFbx(getScene()),
    };

    panel.querySelectorAll("[data-export-action]").forEach((item) => {
        item.addEventListener("click", async (event) => {
            event.stopPropagation();
            const action = item.dataset.exportAction;
            closePanel();
            const handler = actions[action];
            if (!handler) return;
            try {
                await handler();
                showStatus?.(`Export ${action.toUpperCase()} téléchargé`);
            } catch (error) {
                console.error("[LAB 3D] Export échoué :", error);
                showStatus?.("Export impossible");
            }
        });
    });

    document.addEventListener("click", () => closePanel());
    document.addEventListener("keydown", (event) => {
        if (event.key === "Escape") closePanel();
    });
}
