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
 * @param {THREE.Material} material
 * @returns {THREE.MeshStandardMaterial}
 */
function createBakedMaterial(material) {
    const out = new THREE.MeshStandardMaterial({
        color: material.color?.clone?.() ?? new THREE.Color(0xffffff),
        roughness: typeof material.roughness === "number" ? material.roughness : 0.8,
        metalness: typeof material.metalness === "number" ? material.metalness : 0,
        transparent: material.transparent === true,
        opacity: typeof material.opacity === "number" ? material.opacity : 1,
        side: material.side ?? THREE.FrontSide,
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
 * monde appliquées et matériaux « cuits ».
 * @param {THREE.Scene} scene
 * @returns {THREE.Scene}
 */
export function buildExportScene(scene) {
    scene.updateMatrixWorld(true);
    const exportScene = new THREE.Scene();
    let counter = 0;

    for (const mesh of collectExportMeshes(scene)) {
        const materials = Array.isArray(mesh.material)
            ? mesh.material.map((entry) => createBakedMaterial(entry))
            : createBakedMaterial(mesh.material);
        const clone = new THREE.Mesh(mesh.geometry, materials);
        counter += 1;
        clone.name = mesh.name || `Objet_${counter}`;
        mesh.matrixWorld.decompose(clone.position, clone.quaternion, clone.scale);
        exportScene.add(clone);
    }

    exportScene.updateMatrixWorld(true);
    return exportScene;
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

/**
 * @param {THREE.Scene} scene
 * @returns {Promise<void>}
 */
export function exportSceneGltf(scene) {
    const exportScene = buildExportScene(scene);
    return new Promise((resolve) => {
        new GLTFExporter().parse(
            exportScene,
            (result) => {
                const blob =
                    result instanceof ArrayBuffer
                        ? new Blob([result], { type: "model/gltf-binary" })
                        : new Blob([JSON.stringify(result)], { type: "model/gltf+json" });
                downloadBlob(blob, `${EXPORT_BASENAME}.glb`);
                resolve();
            },
            { binary: true }
        );
    });
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
