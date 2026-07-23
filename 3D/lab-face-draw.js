/** Dessin sur les faces — calque alpha fusionné dans diffuseColor (texture PBR intacte). */
import * as THREE from "three";
import { pickFilePreservingFullscreen, ensureLabFullscreenAfterFile, restoreFullscreenNow } from "./fullscreen.js";
import { prepareTileSource } from "./texture-tile-utils.js";

export const FACE_PAINT_KEY = "facePaint";
export const FACE_CANVAS_SIZE = 256;
const FACE_COUNT = 6;
const FACE_PAINT_FLAG = "_labFacePaint";
const PAINT_UNIFORM_KEY = "_labPaintUniform";
const PAINT_SHADER_KEY = "_labPaintShaderAttached";
const TRI_SELECTION_OVERLAY_NAME = "lab-triangle-selection-overlay";
const TRI_TEXTURE_OVERLAY_PREFIX = "lab-triangle-texture-overlay";

const PAINT_MIX_SNIPPET = `
    vec4 labPaintTexel = texture2D( labPaintMap, vLabPaintUv );
    diffuseColor.rgb = mix( diffuseColor.rgb, labPaintTexel.rgb, labPaintTexel.a );
`;

/** @type {THREE.CanvasTexture | null} */
let placeholderWhiteTexture = null;

/**
 * Texture 1×1 blanche opaque : garantit que USE_MAP (donc vUv) est défini
 * sans altérer le rendu (blanc × couleur = couleur d'origine).
 * @returns {THREE.CanvasTexture}
 */
export function getPlaceholderWhiteTexture() {
    if (placeholderWhiteTexture) return placeholderWhiteTexture;
    const canvas = document.createElement("canvas");
    canvas.width = 1;
    canvas.height = 1;
    const ctx = canvas.getContext("2d");
    if (ctx) {
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, 1, 1);
    }
    const texture = new THREE.CanvasTexture(canvas);
    configureOverlayTexture(texture);
    placeholderWhiteTexture = texture;
    return texture;
}

/**
 * @param {THREE.CanvasTexture} texture
 */
function configureOverlayTexture(texture) {
    if ("colorSpace" in texture) {
        texture.colorSpace = THREE.SRGBColorSpace;
    } else {
        texture.encoding = THREE.sRGBEncoding;
    }
    texture.needsUpdate = true;
}

/**
 * Garantit un attribut UV minimum pour permettre les overlays texture
 * sur des meshes importés qui n'en fournissent pas.
 * @param {THREE.Mesh} mesh
 */
function ensureMeshUv(mesh) {
    const geometry = mesh.geometry;
    if (!geometry?.attributes?.position) return false;
    if (geometry.attributes.uv) return true;

    geometry.computeBoundingBox();
    const bbox = geometry.boundingBox;
    if (!bbox) return false;
    const pos = geometry.attributes.position;
    const uv = new Float32Array(pos.count * 2);
    const sizeX = Math.max(1e-6, bbox.max.x - bbox.min.x);
    const sizeZ = Math.max(1e-6, bbox.max.z - bbox.min.z);
    for (let i = 0; i < pos.count; i += 1) {
        const x = pos.getX(i);
        const z = pos.getZ(i);
        uv[i * 2] = (x - bbox.min.x) / sizeX;
        uv[i * 2 + 1] = (z - bbox.min.z) / sizeZ;
    }
    geometry.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
    geometry.attributes.uv.needsUpdate = true;
    return true;
}

/**
 * @param {THREE.Material | null | undefined} source
 */
function toCompatibleStandardMaterial(source) {
    const mat = new THREE.MeshStandardMaterial({
        color: source?.color ? source.color.clone() : new THREE.Color(0x00d1ff),
        roughness: 0.65,
        metalness: 0.05,
        side: source?.side ?? THREE.FrontSide,
        transparent: !!source?.transparent,
        opacity: typeof source?.opacity === "number" ? source.opacity : 1,
        alphaTest: typeof source?.alphaTest === "number" ? source.alphaTest : 0,
        depthWrite: source?.depthWrite ?? true,
        depthTest: source?.depthTest ?? true,
        map: source?.map ?? null,
        normalMap: source?.normalMap ?? null,
    });
    if (source?.normalScale && mat.normalScale) {
        mat.normalScale.copy(source.normalScale);
    }
    if (source?.emissive) mat.emissive.copy(source.emissive);
    if (source?.emissiveMap) mat.emissiveMap = source.emissiveMap;
    if (source?.aoMap) mat.aoMap = source.aoMap;
    if (source?.roughnessMap) mat.roughnessMap = source.roughnessMap;
    if (source?.metalnessMap) mat.metalnessMap = source.metalnessMap;
    if (typeof source?.roughness === "number") mat.roughness = source.roughness;
    if (typeof source?.metalness === "number") mat.metalness = source.metalness;
    return mat;
}

/**
 * Mélange le dessin dans diffuseColor (avant éclairage PBR) — couleurs foncées incluses.
 * @param {THREE.MeshStandardMaterial} material
 * @param {THREE.CanvasTexture} overlayTexture
 */
function attachPaintOverlay(material, overlayTexture) {
    // Garantit USE_MAP (donc la déclaration de vUv) sans changer le rendu,
    // même sur un matériau sans texture couleur — évite un shader invalide
    // qui rendrait la face transparente.
    if (!material.map) {
        material.map = getPlaceholderWhiteTexture();
        material.userData[FACE_PAINT_FLAG + "_placeholderMap"] = true;
    }

    /** @type {{ value: THREE.CanvasTexture }} */
    let uniform = material.userData[PAINT_UNIFORM_KEY];
    if (!uniform) {
        uniform = { value: overlayTexture };
        material.userData[PAINT_UNIFORM_KEY] = uniform;
    } else {
        uniform.value = overlayTexture;
    }
    material.userData[FACE_PAINT_FLAG] = true;

    if (!material.userData[PAINT_SHADER_KEY]) {
        const previousOnBeforeCompile = material.onBeforeCompile;
        material.onBeforeCompile = (shader) => {
            previousOnBeforeCompile?.call(material, shader);
            shader.uniforms.labPaintMap = uniform;
            if (
                !shader.vertexShader.includes("vLabPaintUv") &&
                shader.vertexShader.includes("#include <uv_vertex>")
            ) {
                // UV brute (non affectée par la répétition/offset de la texture de
                // couleur), pour que le calque de dessin ne soit pas répété/décalé
                // sur les objets avec un carrelage de texture (ex. un sol).
                shader.vertexShader = shader.vertexShader
                    .replace(
                        "#include <common>",
                        "#include <common>\nvarying vec2 vLabPaintUv;"
                    )
                    .replace(
                        "#include <uv_vertex>",
                        "#include <uv_vertex>\n\t#ifdef USE_UV\n\t\tvLabPaintUv = uv;\n\t#endif"
                    );
            }
            if (
                !shader.fragmentShader.includes("labPaintTexel") &&
                shader.fragmentShader.includes("#include <map_fragment>")
            ) {
                shader.fragmentShader = shader.fragmentShader
                    .replace(
                        "#include <common>",
                        "#include <common>\nuniform sampler2D labPaintMap;\nvarying vec2 vLabPaintUv;"
                    )
                    .replace(
                        "#include <map_fragment>",
                        `#include <map_fragment>${PAINT_MIX_SNIPPET}`
                    );
            }
        };
        const previousCacheKey = material.customProgramCacheKey?.bind(material);
        material.customProgramCacheKey = () => `${previousCacheKey?.() || ""}_labFacePaintV5`;
        material.userData[PAINT_SHADER_KEY] = true;
    }

    material.needsUpdate = true;
}

/**
 * @param {THREE.MeshStandardMaterial} material
 */
function detachPaintOverlay(material) {
    if (!material.userData[FACE_PAINT_FLAG]) return;
    if (material.userData[FACE_PAINT_FLAG + "_placeholderMap"]) {
        material.map = null;
        delete material.userData[FACE_PAINT_FLAG + "_placeholderMap"];
    }
    delete material.userData[FACE_PAINT_FLAG];
    delete material.userData[PAINT_UNIFORM_KEY];
    delete material.userData[PAINT_SHADER_KEY];
    delete material.onBeforeCompile;
    delete material.customProgramCacheKey;
    material.needsUpdate = true;
}

/**
 * @param {THREE.Mesh} mesh
 * @returns {THREE.MeshStandardMaterial[]}
 */
export function ensureFaceMaterials(mesh) {
    if (Array.isArray(mesh.material) && mesh.material.length === FACE_COUNT) {
        return mesh.material;
    }

    const base =
        mesh.material instanceof THREE.MeshStandardMaterial
            ? mesh.material
            : new THREE.MeshStandardMaterial({ color: 0x00d1ff });

    const materials = Array.from({ length: FACE_COUNT }, () => {
        const material = base.clone();
        delete material.onBeforeCompile;
        delete material.customProgramCacheKey;
        delete material.userData._labFacePaint;
        delete material.userData._labFacePaint_placeholderMap;
        delete material.userData._labPaintUniform;
        delete material.userData._labPaintShaderAttached;
        material.emissiveMap = null;
        material.emissive.setHex(0x000000);
        material.map = base.map || null;
        if (base.normalMap) {
            material.normalMap = base.normalMap;
            material.normalScale = base.normalScale.clone();
        }
        return material;
    });

    if (!Array.isArray(mesh.material)) {
        mesh.material?.dispose?.();
    }
    mesh.material = materials;
    return materials;
}

/**
 * @param {THREE.Object3D} object
 */
function ensureFacePaintStore(object) {
    if (!object.userData[FACE_PAINT_KEY]) {
        object.userData[FACE_PAINT_KEY] = { faces: {}, meshLayers: {} };
    }
    if (!object.userData[FACE_PAINT_KEY].faces) object.userData[FACE_PAINT_KEY].faces = {};
    if (!object.userData[FACE_PAINT_KEY].meshLayers) object.userData[FACE_PAINT_KEY].meshLayers = {};
    return object.userData[FACE_PAINT_KEY];
}

/**
 * @param {number} triangleFaceIndex
 */
export function faceIndexFromHit(triangleFaceIndex) {
    return Math.floor(triangleFaceIndex / 2);
}

/**
 * @param {THREE.Vector2 | undefined} uv
 * @param {number} size
 */
export function uvToCanvasPixel(uv, size = FACE_CANVAS_SIZE) {
    const u = uv?.x ?? 0.5;
    const v = uv?.y ?? 0.5;
    return {
        x: u * size,
        y: (1 - v) * size,
    };
}

/**
 * @param {THREE.Object3D} object
 * @param {THREE.Mesh} mesh
 * @param {number} faceIndex
 */
function getFacePaintLayer(object, mesh, faceIndex) {
    const store = ensureFacePaintStore(object);
    if (store.faces[faceIndex]) return store.faces[faceIndex];

    const canvas = document.createElement("canvas");
    canvas.width = FACE_CANVAS_SIZE;
    canvas.height = FACE_CANVAS_SIZE;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas 2D indisponible");
    ctx.clearRect(0, 0, FACE_CANVAS_SIZE, FACE_CANVAS_SIZE);

    const texture = new THREE.CanvasTexture(canvas);
    configureOverlayTexture(texture);

    const materials = ensureFaceMaterials(mesh);
    attachPaintOverlay(materials[faceIndex], texture);

    const layer = { canvas, ctx, texture, faceIndex };
    store.faces[faceIndex] = layer;
    return layer;
}

/**
 * @param {THREE.Object3D} object
 * @param {THREE.Mesh} mesh
 * @param {number} materialIndex
 */
function getMeshPaintLayer(object, mesh, materialIndex = 0) {
    ensureMeshUv(mesh);
    const store = ensureFacePaintStore(object);
    const isMultiMat = Array.isArray(mesh.material);
    const resolvedMaterialIndex =
        isMultiMat && Number.isInteger(materialIndex) && materialIndex >= 0
            ? Math.min(materialIndex, Math.max(0, mesh.material.length - 1))
            : 0;
    const key = `${mesh.uuid}:${isMultiMat ? resolvedMaterialIndex : "single"}`;
    if (store.meshLayers[key]) return store.meshLayers[key];

    const canvas = document.createElement("canvas");
    canvas.width = FACE_CANVAS_SIZE;
    canvas.height = FACE_CANVAS_SIZE;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas 2D indisponible");
    ctx.clearRect(0, 0, FACE_CANVAS_SIZE, FACE_CANVAS_SIZE);

    const texture = new THREE.CanvasTexture(canvas);
    configureOverlayTexture(texture);

    if (Array.isArray(mesh.material)) {
        let mat = mesh.material[resolvedMaterialIndex];
        if (!(mat instanceof THREE.MeshStandardMaterial)) {
            mat = toCompatibleStandardMaterial(mat || mesh.material[0]);
            mesh.material[resolvedMaterialIndex] = mat;
        }
        attachPaintOverlay(mat, texture);
    } else if (mesh.material instanceof THREE.MeshStandardMaterial) {
        attachPaintOverlay(mesh.material, texture);
    } else {
        mesh.material = toCompatibleStandardMaterial(mesh.material);
        attachPaintOverlay(mesh.material, texture);
    }

    const layer = { canvas, ctx, texture, materialIndex: resolvedMaterialIndex };
    store.meshLayers[key] = layer;
    return layer;
}

/**
 * @param {THREE.Intersection} hit
 */
function getTriangleUvFromHit(hit) {
    const mesh = hit.object instanceof THREE.Mesh ? hit.object : null;
    if (!mesh) return null;
    ensureMeshUv(mesh);
    const geometry = mesh.geometry;
    const posAttr = geometry?.attributes?.position;
    if (!posAttr) return null;

    let ia;
    let ib;
    let ic;
    if (hit.face && Number.isFinite(hit.face.a) && Number.isFinite(hit.face.b) && Number.isFinite(hit.face.c)) {
        ia = hit.face.a;
        ib = hit.face.b;
        ic = hit.face.c;
    } else {
        if (hit.faceIndex == null || hit.faceIndex < 0) return null;
        const tri = hit.faceIndex;
        if (geometry.index) {
            const idx = geometry.index.array;
            ia = idx[tri * 3];
            ib = idx[tri * 3 + 1];
            ic = idx[tri * 3 + 2];
        } else {
            ia = tri * 3;
            ib = tri * 3 + 1;
            ic = tri * 3 + 2;
        }
    }
    if (ia == null || ib == null || ic == null) return null;
    const pa = new THREE.Vector3(posAttr.getX(ia), posAttr.getY(ia), posAttr.getZ(ia));
    const pb = new THREE.Vector3(posAttr.getX(ib), posAttr.getY(ib), posAttr.getZ(ib));
    const pc = new THREE.Vector3(posAttr.getX(ic), posAttr.getY(ic), posAttr.getZ(ic));

    const uvAttr = geometry?.attributes?.uv;
    let a;
    let b;
    let c;
    if (uvAttr) {
        a = new THREE.Vector2(uvAttr.getX(ia), uvAttr.getY(ia));
        b = new THREE.Vector2(uvAttr.getX(ib), uvAttr.getY(ib));
        c = new THREE.Vector2(uvAttr.getX(ic), uvAttr.getY(ic));
    } else {
        // Fallback sans UV : projection planaire locale du triangle.
        const uAxis = pb.clone().sub(pa);
        if (uAxis.lengthSq() < 1e-10) uAxis.set(1, 0, 0);
        uAxis.normalize();
        const normal = pb.clone().sub(pa).cross(pc.clone().sub(pa));
        if (normal.lengthSq() < 1e-10) normal.set(0, 0, 1);
        normal.normalize();
        const vAxis = normal.clone().cross(uAxis).normalize();
        const p0 = new THREE.Vector2(0, 0);
        const p1 = new THREE.Vector2(pb.clone().sub(pa).dot(uAxis), pb.clone().sub(pa).dot(vAxis));
        const p2 = new THREE.Vector2(pc.clone().sub(pa).dot(uAxis), pc.clone().sub(pa).dot(vAxis));
        const minX = Math.min(p0.x, p1.x, p2.x);
        const minY = Math.min(p0.y, p1.y, p2.y);
        const maxX = Math.max(p0.x, p1.x, p2.x);
        const maxY = Math.max(p0.y, p1.y, p2.y);
        const sx = Math.max(1e-6, maxX - minX);
        const sy = Math.max(1e-6, maxY - minY);
        a = new THREE.Vector2((p0.x - minX) / sx, (p0.y - minY) / sy);
        b = new THREE.Vector2((p1.x - minX) / sx, (p1.y - minY) / sy);
        c = new THREE.Vector2((p2.x - minX) / sx, (p2.y - minY) / sy);
    }
    return {
        a,
        b,
        c,
        pa,
        pb,
        pc,
        triId: `${ia}:${ib}:${ic}`,
        materialIndex: hit.face?.materialIndex ?? 0,
    };
}

/**
 * @typedef {{
 *   color: string,
 *   alpha?: number,
 *   patternSource?: CanvasImageSource | null,
 *   tileX?: number,
 *   tileY?: number,
 * }} BrushStyle
 */

/**
 * @param {string | BrushStyle} style
 * @returns {BrushStyle}
 */
function normalizeBrushStyle(style) {
    if (typeof style === "string") return { color: style, alpha: 1, patternSource: null };
    return {
        color: style.color || "#000000",
        alpha: typeof style.alpha === "number" ? Math.min(1, Math.max(0.05, style.alpha)) : 1,
        patternSource: style.patternSource ?? null,
        tileX: typeof style.tileX === "number" ? Math.max(0.1, style.tileX) : 1,
        tileY: typeof style.tileY === "number" ? Math.max(0.1, style.tileY) : 1,
    };
}

/**
 * @param {{ ctx: CanvasRenderingContext2D, texture: THREE.CanvasTexture }} layer
 * @param {string | BrushStyle} style
 * @param {number} size
 */
function applyBrushStyle(layer, style, size) {
    const brush = normalizeBrushStyle(style);
    let paint = brush.color;
    if (brush.patternSource) {
        const pattern = layer.ctx.createPattern(brush.patternSource, "repeat");
        if (pattern) {
            const tileX = Math.max(0.1, brush.tileX || 1);
            const tileY = Math.max(0.1, brush.tileY || 1);
            if (typeof pattern.setTransform === "function" && typeof DOMMatrix !== "undefined") {
                pattern.setTransform(new DOMMatrix().scale(1 / tileX, 1 / tileY));
            }
            paint = pattern;
        }
    }
    layer.ctx.globalAlpha = brush.alpha;
    layer.ctx.globalCompositeOperation = "source-over";
    layer.ctx.strokeStyle = paint;
    layer.ctx.fillStyle = paint;
    layer.ctx.lineWidth = size;
    layer.ctx.lineCap = "round";
    layer.ctx.lineJoin = "round";
}

/**
 * @param {{ ctx: CanvasRenderingContext2D, texture: THREE.CanvasTexture }} layer
 */
function commitLayer(layer) {
    layer.texture.needsUpdate = true;
}

/**
 * @param {THREE.Object3D} object
 * @param {THREE.Mesh} mesh
 * @param {number} faceIndex
 * @param {number} x
 * @param {number} y
 * @param {string | BrushStyle} style
 * @param {number} brushSize
 */
export function paintDot(object, mesh, faceIndex, x, y, style, brushSize) {
    const layer = getFacePaintLayer(object, mesh, faceIndex);
    applyBrushStyle(layer, style, brushSize);
    layer.ctx.beginPath();
    layer.ctx.arc(x, y, brushSize * 0.5, 0, Math.PI * 2);
    layer.ctx.fill();
    commitLayer(layer);
}

/**
 * @param {THREE.Object3D} object
 * @param {THREE.Mesh} mesh
 * @param {number} faceIndex
 */
export function paintLine(object, mesh, faceIndex, x0, y0, x1, y1, style, brushSize) {
    const layer = getFacePaintLayer(object, mesh, faceIndex);
    applyBrushStyle(layer, style, brushSize);
    layer.ctx.beginPath();
    layer.ctx.moveTo(x0, y0);
    layer.ctx.lineTo(x1, y1);
    layer.ctx.stroke();
    commitLayer(layer);
}

/**
 * @param {THREE.Object3D} object
 * @param {THREE.Mesh} mesh
 * @param {number} faceIndex
 */
export function paintText(object, mesh, faceIndex, x, y, text, style, fontSize = 22) {
    const layer = getFacePaintLayer(object, mesh, faceIndex);
    applyBrushStyle(layer, style, 1);
    layer.ctx.font = `600 ${fontSize}px system-ui, sans-serif`;
    layer.ctx.textAlign = "center";
    layer.ctx.textBaseline = "middle";
    layer.ctx.fillText(text, x, y);
    commitLayer(layer);
}

/**
 * @param {THREE.Object3D} object
 * @param {THREE.Mesh} mesh
 * @param {number} faceIndex
 */
export function paintRect(object, mesh, faceIndex, x0, y0, x1, y1, style, lineWidth) {
    const layer = getFacePaintLayer(object, mesh, faceIndex);
    applyBrushStyle(layer, style, lineWidth);
    const left = Math.min(x0, x1);
    const top = Math.min(y0, y1);
    const width = Math.abs(x1 - x0);
    const height = Math.abs(y1 - y0);
    layer.ctx.strokeRect(left, top, width, height);
    commitLayer(layer);
}

/**
 * @param {THREE.Object3D} object
 * @param {THREE.Mesh} mesh
 * @param {number} faceIndex
 */
export function paintEllipse(object, mesh, faceIndex, x0, y0, x1, y1, style, lineWidth) {
    const layer = getFacePaintLayer(object, mesh, faceIndex);
    applyBrushStyle(layer, style, lineWidth);
    const cx = (x0 + x1) * 0.5;
    const cy = (y0 + y1) * 0.5;
    const rx = Math.abs(x1 - x0) * 0.5;
    const ry = Math.abs(y1 - y0) * 0.5;
    layer.ctx.beginPath();
    layer.ctx.ellipse(cx, cy, Math.max(rx, 1), Math.max(ry, 1), 0, 0, Math.PI * 2);
    layer.ctx.stroke();
    commitLayer(layer);
}

/**
 * Remplit toute la face avec la couleur/texture active.
 * @param {THREE.Object3D} object
 * @param {THREE.Mesh} mesh
 * @param {number} faceIndex
 * @param {string | BrushStyle} style
 */
export function paintFill(object, mesh, faceIndex, style) {
    const layer = getFacePaintLayer(object, mesh, faceIndex);
    applyBrushStyle(layer, style, 1);
    layer.ctx.fillRect(0, 0, FACE_CANVAS_SIZE, FACE_CANVAS_SIZE);
    commitLayer(layer);
}

/**
 * @param {THREE.Object3D} object
 * @param {number} faceIndex
 * @returns {string | null}
 */
export function captureFaceSnapshot(object, faceIndex) {
    const layer = object.userData[FACE_PAINT_KEY]?.faces?.[faceIndex];
    if (!layer?.canvas) return null;
    return layer.canvas.toDataURL("image/png");
}

/**
 * @param {THREE.Object3D} object
 * @param {THREE.Mesh} mesh
 * @param {number} faceIndex
 */
function clearFacePaintLayer(object, mesh, faceIndex) {
    const store = object.userData[FACE_PAINT_KEY];
    const layer = store?.faces?.[faceIndex];
    if (!layer) return;

    layer.texture?.dispose?.();
    delete store.faces[faceIndex];

    const materials = ensureFaceMaterials(mesh);
    detachPaintOverlay(materials[faceIndex]);

    if (!Object.keys(store.faces).length) {
        delete object.userData[FACE_PAINT_KEY];
    }
}

/**
 * @param {THREE.Object3D} object
 * @param {number} faceIndex
 * @param {string | null} dataUrl
 * @returns {Promise<void>}
 */
export function restoreFaceSnapshot(object, faceIndex, dataUrl) {
    const mesh = getPaintableMesh(object);
    if (!mesh) return Promise.resolve();

    if (!dataUrl) {
        clearFacePaintLayer(object, mesh, faceIndex);
        return Promise.resolve();
    }

    return new Promise((resolve, reject) => {
        const image = new Image();
        image.onload = () => {
            const layer = getFacePaintLayer(object, mesh, faceIndex);
            layer.ctx.clearRect(0, 0, FACE_CANVAS_SIZE, FACE_CANVAS_SIZE);
            layer.ctx.drawImage(image, 0, 0, FACE_CANVAS_SIZE, FACE_CANVAS_SIZE);
            commitLayer(layer);
            resolve();
        };
        image.onerror = () => reject(new Error("Face paint invalide"));
        image.src = dataUrl;
    });
}

/**
 * @param {THREE.Object3D} object
 * @returns {Record<string, string>}
 */
export function serializeFacePaint(object) {
    const store = object.userData[FACE_PAINT_KEY];
    if (!store?.faces) return {};

    /** @type {Record<string, string>} */
    const out = {};
    for (const [faceIndex, layer] of Object.entries(store.faces)) {
        if (layer?.canvas) {
            out[faceIndex] = layer.canvas.toDataURL("image/png");
        }
    }
    return out;
}

/**
 * @param {THREE.Object3D} object
 * @returns {THREE.Mesh | null}
 */
export function getPaintableMesh(object) {
    let found = null;
    object?.traverse((child) => {
        if (found) return;
        if (isPaintableBoxMesh(child)) found = child;
    });
    return found;
}

/**
 * @param {THREE.Object3D} object
 * @param {Record<string, string>} data
 * @returns {Promise<void>}
 */
export async function applyFacePaintData(object, data) {
    if (!data || typeof data !== "object") return;
    const mesh = getPaintableMesh(object);
    if (!mesh) return;

    disposeFacePaint(object, { keepMaterials: true });
    ensureFaceMaterials(mesh);

    const entries = Object.entries(data);
    await Promise.all(
        entries.map(([faceKey, dataUrl]) => {
            const faceIndex = Number(faceKey);
            if (!Number.isFinite(faceIndex) || faceIndex < 0 || faceIndex >= FACE_COUNT) {
                return Promise.resolve();
            }
            return new Promise((resolve, reject) => {
                const image = new Image();
                image.onload = () => {
                    const layer = getFacePaintLayer(object, mesh, faceIndex);
                    layer.ctx.clearRect(0, 0, FACE_CANVAS_SIZE, FACE_CANVAS_SIZE);
                    layer.ctx.drawImage(image, 0, 0, FACE_CANVAS_SIZE, FACE_CANVAS_SIZE);
                    commitLayer(layer);
                    resolve();
                };
                image.onerror = () => reject(new Error("Face paint invalide"));
                image.src = dataUrl;
            });
        })
    );
}

/**
 * @param {THREE.Object3D} object
 * @param {{ keepMaterials?: boolean }} [opts]
 */
export function disposeFacePaint(object, { keepMaterials = false } = {}) {
    const store = object.userData[FACE_PAINT_KEY];
    const mesh = getPaintableMesh(object);

    if (mesh?.material) {
        const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        materials.forEach((material) => {
            if (material instanceof THREE.MeshStandardMaterial) {
                detachPaintOverlay(material);
            }
        });
    }

    if (store?.faces) {
        for (const layer of Object.values(store.faces)) {
            layer?.texture?.dispose?.();
        }
    }
    if (store?.meshLayers) {
        for (const layer of Object.values(store.meshLayers)) {
            layer?.texture?.dispose?.();
        }
    }
    delete object.userData[FACE_PAINT_KEY];

    if (!keepMaterials && mesh instanceof THREE.Mesh) {
        if (Array.isArray(mesh.material) && mesh.material.length === FACE_COUNT) {
            mesh.material.forEach((material) => material?.dispose?.());
            mesh.material = new THREE.MeshStandardMaterial({ color: 0x00d1ff });
        }
    }
}

/**
 * @param {THREE.Mesh} mesh
 */
export function isPaintableBoxMesh(mesh) {
    return mesh instanceof THREE.Mesh && mesh.geometry instanceof THREE.BoxGeometry;
}

const BRUSH_TEXTURE_TILE_SIZE = 96;

/**
 * Redimensionne l'image du pinceau vers une petite tuile répétable,
 * pour que le motif reste lisible quel que soit la taille de la photo.
 * @param {HTMLImageElement} image
 * @returns {HTMLCanvasElement}
 */
function buildBrushTile(image) {
    return prepareTileSource(image, BRUSH_TEXTURE_TILE_SIZE);
}

/**
 * @param {{
 *   canvas: HTMLCanvasElement,
 *   drawBtn: HTMLButtonElement,
 *   drawPanel: HTMLElement,
 *   colorInput: HTMLInputElement,
 *   toolSelect: HTMLSelectElement,
 *   sizeInput: HTMLInputElement,
 *   opacityInput?: HTMLInputElement | null,
 *   textureBtn?: HTMLButtonElement | null,
 *   textureClearBtn?: HTMLButtonElement | null,
 *   tileXInput?: HTMLInputElement | null,
 *   tileYInput?: HTMLInputElement | null,
 *   offsetXInput?: HTMLInputElement | null,
 *   offsetYInput?: HTMLInputElement | null,
 *   faceTextureBtn?: HTMLButtonElement | null,
 *   faceTextureClearBtn?: HTMLButtonElement | null,
 *   applyTrianglesBtn?: HTMLButtonElement | null,
 *   clearTrianglesBtn?: HTMLButtonElement | null,
 *   decalBtn?: HTMLButtonElement | null,
 *   decalClearBtn?: HTMLButtonElement | null,
 *   setDrawModeActive: (active: boolean) => void,
 *   isTriangulationMode?: () => boolean,
 *   enterExplore?: () => void,
 *   setSelectionOnlyMode?: () => void,
 *   showStatus?: (msg: string) => void,
 *   pickPaintHit: (clientX: number, clientY: number) => { entity: THREE.Object3D, mesh: THREE.Mesh, hit: THREE.Intersection } | null,
 *   recordPaintHistory?: (entry: { object: THREE.Object3D, faceIndex: number, before: string | null, after: string | null }) => void,
 * }} options
 */
export function initFaceDrawController(options) {
    const {
        canvas,
        drawBtn,
        drawPanel,
        colorInput,
        toolSelect,
        sizeInput,
        opacityInput,
        textureBtn,
        textureClearBtn,
        tileXInput,
        tileYInput,
        offsetXInput,
        offsetYInput,
        faceTextureBtn,
        faceTextureClearBtn,
        applyTrianglesBtn,
        clearTrianglesBtn,
        decalBtn,
        decalClearBtn,
        setDrawModeActive,
        isTriangulationMode,
        enterExplore,
        setSelectionOnlyMode,
        showStatus,
        pickPaintHit,
        recordPaintHistory,
    } = options;

    let active = false;
    /** @type {HTMLCanvasElement | null} */
    let brushTile = null;
    /** @type {HTMLImageElement | null} */
    let faceTextureImage = null;
    /** @type {HTMLImageElement | null} */
    let decalImage = null;
    /** @type {{ entity: THREE.Object3D, mesh: THREE.Mesh, faceIndex: number, lastX: number, lastY: number } | null} */
    let stroke = null;
    /** @type {{ entity: THREE.Object3D, mesh: THREE.Mesh, faceIndex: number, startX: number, startY: number } | null} */
    let shapeDraft = null;
    /** @type {string | null} */
    let pendingUndoBefore = null;
    /** @type {Array<{ entity: THREE.Object3D, mesh: THREE.Mesh, triId: string, materialIndex: number, a: THREE.Vector2, b: THREE.Vector2, c: THREE.Vector2, pa: THREE.Vector3, pb: THREE.Vector3, pc: THREE.Vector3 }>} */
    let selectedTriangles = [];
    /** @type {Set<THREE.Mesh>} */
    const selectedTriangleMeshes = new Set();
    let triDragActive = false;
    let triDragLastKey = null;
    /** @type {Array<typeof selectedTriangles>} */
    let triSelectionUndoStack = [];
    /** @type {typeof selectedTriangles | null} */
    let triDragSnapshot = null;
    /** @type {THREE.Mesh[]} overlays dont le tile/offset reste piloté en live */
    let liveTriangleTextureOverlays = [];
    /** @type {THREE.Mesh[][]} pile d'annulation des lots de textures posées */
    let triTextureUndoStack = [];

    function removeTriangleOverlay(mesh) {
        const overlay = mesh.getObjectByName(TRI_SELECTION_OVERLAY_NAME);
        if (!overlay) return;
        mesh.remove(overlay);
        overlay.traverse?.((node) => {
            node.geometry?.dispose?.();
            if (Array.isArray(node.material)) node.material.forEach((m) => m?.dispose?.());
            else node.material?.dispose?.();
        });
    }

    function disposeTriangleTextureOverlays(mesh) {
        const toRemove = [];
        mesh.children.forEach((child) => {
            if (typeof child.name === "string" && child.name.startsWith(TRI_TEXTURE_OVERLAY_PREFIX)) {
                toRemove.push(child);
            }
        });
        for (const child of toRemove) {
            mesh.remove(child);
            child.traverse?.((node) => {
                node.geometry?.dispose?.();
                if (Array.isArray(node.material)) node.material.forEach((m) => m?.dispose?.());
                else node.material?.dispose?.();
            });
        }
        if (toRemove.length && liveTriangleTextureOverlays.length) {
            const removed = new Set(toRemove);
            liveTriangleTextureOverlays = liveTriangleTextureOverlays.filter((o) => !removed.has(o));
            triTextureUndoStack = triTextureUndoStack
                .map((batch) => batch.filter((o) => !removed.has(o)))
                .filter((batch) => batch.length > 0);
        }
    }

    function refreshTriangleSelectionOverlay() {
        for (const mesh of selectedTriangleMeshes) {
            removeTriangleOverlay(mesh);
        }
        selectedTriangleMeshes.clear();
        if (!selectedTriangles.length) return;

        const byMesh = new Map();
        for (const entry of selectedTriangles) {
            const arr = byMesh.get(entry.mesh) || [];
            arr.push(entry);
            byMesh.set(entry.mesh, arr);
        }

        for (const [mesh, entries] of byMesh.entries()) {
            const linePoints = [];
            const fillPoints = [];
            for (const tri of entries) {
                fillPoints.push(
                    tri.pa.x, tri.pa.y, tri.pa.z,
                    tri.pb.x, tri.pb.y, tri.pb.z,
                    tri.pc.x, tri.pc.y, tri.pc.z
                );
                linePoints.push(
                    tri.pa.x, tri.pa.y, tri.pa.z,
                    tri.pb.x, tri.pb.y, tri.pb.z,
                    tri.pb.x, tri.pb.y, tri.pb.z,
                    tri.pc.x, tri.pc.y, tri.pc.z,
                    tri.pc.x, tri.pc.y, tri.pc.z,
                    tri.pa.x, tri.pa.y, tri.pa.z
                );
            }
            const overlay = new THREE.Group();
            overlay.name = TRI_SELECTION_OVERLAY_NAME;
            overlay.renderOrder = 10000;
            overlay.frustumCulled = false;
            overlay.userData._labNoPaintPick = true;

            const fillGeo = new THREE.BufferGeometry();
            fillGeo.setAttribute("position", new THREE.Float32BufferAttribute(fillPoints, 3));
            const fillMat = new THREE.MeshBasicMaterial({
                color: 0xffd54f,
                transparent: true,
                opacity: 0.2,
                side: THREE.DoubleSide,
                depthTest: false,
                depthWrite: false,
            });
            const fill = new THREE.Mesh(fillGeo, fillMat);
            fill.renderOrder = 10000;
            fill.frustumCulled = false;
            fill.userData._labNoPaintPick = true;

            const lineGeo = new THREE.BufferGeometry();
            lineGeo.setAttribute("position", new THREE.Float32BufferAttribute(linePoints, 3));
            const lineMat = new THREE.LineBasicMaterial({
                color: 0xffc400,
                transparent: true,
                opacity: 0.95,
                depthTest: false,
                depthWrite: false,
            });
            const edges = new THREE.LineSegments(lineGeo, lineMat);
            edges.renderOrder = 10001;
            edges.frustumCulled = false;
            edges.userData._labNoPaintPick = true;
            edges.renderOrder = 10001;
            edges.frustumCulled = false;

            overlay.add(fill);
            overlay.add(edges);
            mesh.add(overlay);
            selectedTriangleMeshes.add(mesh);
        }
    }

    function triKey(entity, mesh, triId) {
        return `${entity.uuid}:${mesh.uuid}:${triId}`;
    }

    function clearTriangleSelection(showMessage = true) {
        selectedTriangles = [];
        triSelectionUndoStack = [];
        triDragSnapshot = null;
        refreshTriangleSelectionOverlay();
        if (showMessage) showStatus?.("Sélection de triangles vidée");
    }

    function disposeOverlayMesh(overlay) {
        overlay.parent?.remove(overlay);
        overlay.geometry?.dispose?.();
        const mat = overlay.material;
        if (mat) {
            mat.map?.dispose?.();
            mat.dispose?.();
        }
    }

    function sameSelection(a, b) {
        if (a.length !== b.length) return false;
        const keysB = new Set(b.map((it) => triKey(it.entity, it.mesh, it.triId)));
        return a.every((it) => keysB.has(triKey(it.entity, it.mesh, it.triId)));
    }

    /**
     * Annule (Ctrl+Z) : d'abord la dernière texture posée, puis la sélection.
     * @returns {boolean}
     */
    function undoTriangleSelection() {
        if (triTextureUndoStack.length) {
            const batch = triTextureUndoStack.pop();
            for (const overlay of batch) {
                disposeOverlayMesh(overlay);
            }
            const removed = new Set(batch);
            liveTriangleTextureOverlays = liveTriangleTextureOverlays.filter((o) => !removed.has(o));
            if (triTextureUndoStack.length) {
                const prev = triTextureUndoStack[triTextureUndoStack.length - 1];
                liveTriangleTextureOverlays = prev.filter((o) => !!o.parent);
            }
            showStatus?.(
                triTextureUndoStack.length
                    ? `Texture annulée (${triTextureUndoStack.length} lot(s) restant(s))`
                    : "Texture triangle annulée"
            );
            return true;
        }

        if (!isTriMode()) return false;

        if (triSelectionUndoStack.length) {
            selectedTriangles = triSelectionUndoStack.pop();
            refreshTriangleSelectionOverlay();
            showStatus?.(
                `Sélection annulée : ${selectedTriangles.length} triangle(s) restant(s)`
            );
            return true;
        }
        if (selectedTriangles.length) {
            selectedTriangles = [];
            refreshTriangleSelectionOverlay();
            showStatus?.("Sélection de triangles vidée");
            return true;
        }
        return false;
    }

    function isTriMode() {
        return !!isTriangulationMode?.();
    }

    function syncUi() {
        drawBtn.classList.toggle("is-active", active);
        drawBtn.setAttribute("aria-pressed", active ? "true" : "false");
        drawPanel.hidden = !active;
        setDrawModeActive(active);
        if (active) {
            enterExplore?.();
            setSelectionOnlyMode?.();
            showStatus?.(
                isTriMode()
                    ? "Mode triangulation — glissez pour sélectionner (Ctrl+Z pour annuler)"
                    : "Mode dessin — clic sur une face de cube"
            );
        } else {
            showStatus?.("Mode dessin désactivé");
        }
    }

    function setActive(value) {
        active = value;
        stroke = null;
        shapeDraft = null;
        pendingUndoBefore = null;
        if (!active) clearTriangleSelection(false);
        syncUi();
    }

    function commitPaintHistory(object, faceIndex) {
        const after = captureFaceSnapshot(object, faceIndex);
        const before = pendingUndoBefore;
        pendingUndoBefore = null;
        if (before === after) return;
        recordPaintHistory?.({ object, faceIndex, before, after });
    }

    function toggle() {
        setActive(!active);
    }

    function getBrushSize() {
        return Math.max(1, Number(sizeInput.value) || 4);
    }

    function getBrushAlpha() {
        if (!opacityInput) return 1;
        const value = Number(opacityInput.value);
        if (!Number.isFinite(value)) return 1;
        return Math.min(1, Math.max(0.05, value / 100));
    }

    function getTileRepeat(input) {
        const value = Number(input?.value ?? 1);
        if (!Number.isFinite(value)) return 1;
        return Math.min(100, Math.max(0.1, value));
    }

    function getTextureOffset(input) {
        const value = Number(input?.value ?? 0);
        if (!Number.isFinite(value)) return 0;
        return Math.min(10, Math.max(-10, value));
    }

    /** @returns {BrushStyle} */
    function getBrushStyle() {
        return {
            color: colorInput.value || "#000000",
            alpha: getBrushAlpha(),
            patternSource: brushTile,
            tileX: getTileRepeat(tileXInput),
            tileY: getTileRepeat(tileYInput),
        };
    }

    function getTool() {
        return toolSelect.value || "pencil";
    }

    function setBrushTexture(image) {
        brushTile = image ? buildBrushTile(image) : null;
        textureBtn?.classList.toggle("is-active", !!brushTile);
        if (textureClearBtn) textureClearBtn.hidden = !brushTile;
        showStatus?.(brushTile ? "Pinceau texture activé" : "Pinceau couleur");
    }

    function setFaceTexture(image) {
        faceTextureImage = image || null;
        faceTextureBtn?.classList.toggle("is-active", !!faceTextureImage);
        if (faceTextureClearBtn) faceTextureClearBtn.hidden = !faceTextureImage;
        showStatus?.(faceTextureImage ? "Texture face chargée" : "Texture face retirée");
    }

    function setDecalTexture(image) {
        decalImage = image || null;
        decalBtn?.classList.toggle("is-active", !!decalImage);
        if (decalClearBtn) decalClearBtn.hidden = !decalImage;
        showStatus?.(decalImage ? "Décalcomanie chargée" : "Décalcomanie retirée");
    }

    function bindImagePicker(button, onImage, onErrorStatus) {
        if (!button) return;
        const fileInput = document.createElement("input");
        fileInput.type = "file";
        fileInput.accept = "image/jpeg,image/png";
        fileInput.hidden = true;
        document.body.appendChild(fileInput);

        fileInput.addEventListener("change", () => {
            const file = fileInput.files?.[0];
            fileInput.value = "";
            void restoreFullscreenNow();
            if (!file) {
                void ensureLabFullscreenAfterFile();
                return;
            }
            const reader = new FileReader();
            reader.onload = () => {
                const image = new Image();
                image.onload = () => {
                    onImage(image);
                    void ensureLabFullscreenAfterFile();
                };
                image.onerror = () => {
                    showStatus?.(onErrorStatus);
                    void ensureLabFullscreenAfterFile();
                };
                image.src = String(reader.result);
            };
            reader.onerror = () => {
                showStatus?.("Lecture du fichier impossible");
                void ensureLabFullscreenAfterFile();
            };
            reader.readAsDataURL(file);
        });

        button.addEventListener("click", (event) => {
            event.stopPropagation();
            void pickFilePreservingFullscreen(fileInput);
        });
    }

    bindImagePicker(textureBtn || null, setBrushTexture, "Image de pinceau invalide");
    bindImagePicker(faceTextureBtn || null, setFaceTexture, "Image de texture de face invalide");
    bindImagePicker(decalBtn || null, setDecalTexture, "Image de décalcomanie invalide");

    textureClearBtn?.addEventListener("click", (event) => {
        event.stopPropagation();
        setBrushTexture(null);
    });

    faceTextureClearBtn?.addEventListener("click", (event) => {
        event.stopPropagation();
        setFaceTexture(null);
    });

    applyTrianglesBtn?.addEventListener("click", (event) => {
        event.stopPropagation();
        applyFaceTextureToSelectedTriangles();
    });

    clearTrianglesBtn?.addEventListener("click", (event) => {
        event.stopPropagation();
        clearTriangleSelection();
    });

    const onTileInputChange = () => {
        applyLiveTransformToTriangleOverlays();
    };
    tileXInput?.addEventListener("input", onTileInputChange);
    tileXInput?.addEventListener("change", onTileInputChange);
    tileYInput?.addEventListener("input", onTileInputChange);
    tileYInput?.addEventListener("change", onTileInputChange);
    offsetXInput?.addEventListener("input", onTileInputChange);
    offsetXInput?.addEventListener("change", onTileInputChange);
    offsetYInput?.addEventListener("input", onTileInputChange);
    offsetYInput?.addEventListener("change", onTileInputChange);

    decalClearBtn?.addEventListener("click", (event) => {
        event.stopPropagation();
        setDecalTexture(null);
    });

    function applyFaceTexture(object, mesh, faceIndex, image, tileX, tileY) {
        const layer = getFacePaintLayer(object, mesh, faceIndex);
        layer.ctx.globalAlpha = 1;
        layer.ctx.globalCompositeOperation = "source-over";
        layer.ctx.clearRect(0, 0, FACE_CANVAS_SIZE, FACE_CANVAS_SIZE);
        if (Math.abs(tileX - 1) < 1e-6 && Math.abs(tileY - 1) < 1e-6) {
            layer.ctx.drawImage(image, 0, 0, FACE_CANVAS_SIZE, FACE_CANVAS_SIZE);
            commitLayer(layer);
            return;
        }
        const pattern = layer.ctx.createPattern(image, "repeat");
        if (pattern && typeof pattern.setTransform === "function" && typeof DOMMatrix !== "undefined") {
            pattern.setTransform(new DOMMatrix().scale(1 / tileX, 1 / tileY));
            layer.ctx.fillStyle = pattern;
            layer.ctx.fillRect(0, 0, FACE_CANVAS_SIZE, FACE_CANVAS_SIZE);
            commitLayer(layer);
            return;
        }
        layer.ctx.drawImage(image, 0, 0, FACE_CANVAS_SIZE, FACE_CANVAS_SIZE);
        commitLayer(layer);
    }

    function makeRuntimeTexture(image, tileX, tileY, offsetX = 0, offsetY = 0) {
        const texture = new THREE.Texture(image);
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.RepeatWrapping;
        texture.repeat.set(tileX, tileY);
        texture.offset.set(offsetX, offsetY);
        if ("colorSpace" in texture) texture.colorSpace = THREE.SRGBColorSpace;
        else texture.encoding = THREE.sRGBEncoding;
        texture.needsUpdate = true;
        return texture;
    }

    /**
     * UV planaires continues sur le lot de triangles (meilleur rendu du tile).
     * @param {Array<{ pa: THREE.Vector3, pb: THREE.Vector3, pc: THREE.Vector3 }>} tris
     * @returns {number[]}
     */
    function buildPlanarUvsForTris(tris) {
        const normal = new THREE.Vector3();
        for (const tri of tris) {
            const e1 = new THREE.Vector3().subVectors(tri.pb, tri.pa);
            const e2 = new THREE.Vector3().subVectors(tri.pc, tri.pa);
            normal.add(new THREE.Vector3().crossVectors(e1, e2));
        }
        if (normal.lengthSq() < 1e-12) normal.set(0, 1, 0);
        else normal.normalize();

        const ref = Math.abs(normal.y) < 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0);
        const uAxis = new THREE.Vector3().crossVectors(ref, normal);
        if (uAxis.lengthSq() < 1e-12) uAxis.set(1, 0, 0);
        else uAxis.normalize();
        const vAxis = new THREE.Vector3().crossVectors(normal, uAxis).normalize();

        /** @type {THREE.Vector3[]} */
        const verts = [];
        for (const tri of tris) verts.push(tri.pa, tri.pb, tri.pc);

        let minU = Infinity;
        let minV = Infinity;
        let maxU = -Infinity;
        let maxV = -Infinity;
        const projected = verts.map((p) => {
            const u = p.dot(uAxis);
            const v = p.dot(vAxis);
            if (u < minU) minU = u;
            if (v < minV) minV = v;
            if (u > maxU) maxU = u;
            if (v > maxV) maxV = v;
            return { u, v };
        });

        const spanU = Math.max(1e-6, maxU - minU);
        const spanV = Math.max(1e-6, maxV - minV);
        const uvs = [];
        for (const p of projected) {
            uvs.push((p.u - minU) / spanU, (p.v - minV) / spanV);
        }
        return uvs;
    }

    function setTriangleOverlayTransform(overlay, tileX, tileY, offsetX, offsetY) {
        const map = overlay?.material?.map;
        if (!map) return;
        map.wrapS = THREE.RepeatWrapping;
        map.wrapT = THREE.RepeatWrapping;
        map.repeat.set(tileX, tileY);
        map.offset.set(offsetX, offsetY);
        map.needsUpdate = true;
        overlay.userData._labTileX = tileX;
        overlay.userData._labTileY = tileY;
        overlay.userData._labOffsetX = offsetX;
        overlay.userData._labOffsetY = offsetY;
    }

    function applyLiveTransformToTriangleOverlays() {
        if (!liveTriangleTextureOverlays.length) return;
        const tileX = getTileRepeat(tileXInput);
        const tileY = getTileRepeat(tileYInput);
        const offsetX = getTextureOffset(offsetXInput);
        const offsetY = getTextureOffset(offsetYInput);
        const stillAlive = [];
        for (const overlay of liveTriangleTextureOverlays) {
            if (!overlay.parent) continue;
            setTriangleOverlayTransform(overlay, tileX, tileY, offsetX, offsetY);
            stillAlive.push(overlay);
        }
        liveTriangleTextureOverlays = stillAlive;
    }

    function applyTextureToTrianglesAsOverlay(entries, image, tileX, tileY, offsetX, offsetY) {
        const byMesh = new Map();
        for (const entry of entries) {
            const arr = byMesh.get(entry.mesh) || [];
            arr.push(entry);
            byMesh.set(entry.mesh, arr);
        }
        /** @type {THREE.Mesh[]} */
        const created = [];
        for (const [mesh, tris] of byMesh.entries()) {
            const positions = [];
            for (const tri of tris) {
                positions.push(
                    tri.pa.x, tri.pa.y, tri.pa.z,
                    tri.pb.x, tri.pb.y, tri.pb.z,
                    tri.pc.x, tri.pc.y, tri.pc.z
                );
            }
            const uvs = buildPlanarUvsForTris(tris);
            const geometry = new THREE.BufferGeometry();
            geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
            geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
            geometry.computeVertexNormals();

            const overlay = new THREE.Mesh(
                geometry,
                new THREE.MeshStandardMaterial({
                    color: 0xffffff,
                    map: makeRuntimeTexture(image, tileX, tileY, offsetX, offsetY),
                    roughness: 0.62,
                    metalness: 0.08,
                    transparent: true,
                    opacity: 1,
                    side: THREE.DoubleSide,
                    depthWrite: false,
                    polygonOffset: true,
                    polygonOffsetFactor: -2,
                    polygonOffsetUnits: -2,
                })
            );
            overlay.name = `${TRI_TEXTURE_OVERLAY_PREFIX}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
            overlay.userData._labNoPaintPick = true;
            overlay.userData._labTileX = tileX;
            overlay.userData._labTileY = tileY;
            overlay.userData._labOffsetX = offsetX;
            overlay.userData._labOffsetY = offsetY;
            overlay.renderOrder = 9800;
            mesh.add(overlay);
            created.push(overlay);
        }
        // Le dernier lot reste piloté en live par Tile / Offset.
        liveTriangleTextureOverlays = created;
        triTextureUndoStack.push(created);
    }

    function applyFaceTextureToSelectedTriangles() {
        const sourceImage = faceTextureImage || brushTile;
        if (!sourceImage) {
            showStatus?.("Chargez une image avec \"Texture face\" (ou \"Texture pinceau\")");
            return;
        }
        if (!selectedTriangles.length) {
            showStatus?.("Sélectionnez d'abord des triangles");
            return;
        }
        const tileX = getTileRepeat(tileXInput);
        const tileY = getTileRepeat(tileYInput);
        const offsetX = getTextureOffset(offsetXInput);
        const offsetY = getTextureOffset(offsetYInput);
        applyTextureToTrianglesAsOverlay(
            selectedTriangles,
            sourceImage,
            tileX,
            tileY,
            offsetX,
            offsetY
        );
        clearTriangleSelection(false);
        showStatus?.("Texture appliquée — Tile / Offset ajustables, Ctrl+Z pour annuler");
    }

    /** Ajoute un triangle à la sélection (jamais de retrait — Ctrl+Z pour annuler). */
    function addTriangleEntry(entry) {
        const key = triKey(entry.entity, entry.mesh, entry.triId);
        const already = selectedTriangles.some(
            (it) => triKey(it.entity, it.mesh, it.triId) === key
        );
        if (already) return;
        selectedTriangles.push(entry);
        refreshTriangleSelectionOverlay();
        showStatus?.(
            `Triangles sélectionnés : ${selectedTriangles.length} (Ctrl+Z pour annuler)`
        );
    }

    function pickTriangleEntry(clientX, clientY) {
        const picked = pickPaintHit(clientX, clientY);
        if (!picked) return null;
        const triHit = getTriangleUvFromHit(picked.hit);
        if (!triHit) return null;
        return {
            entity: picked.entity,
            mesh: picked.mesh,
            triId: triHit.triId,
            materialIndex: triHit.materialIndex,
            a: triHit.a,
            b: triHit.b,
            c: triHit.c,
            pa: triHit.pa,
            pb: triHit.pb,
            pc: triHit.pc,
        };
    }

    function dragSelectTriangleAt(clientX, clientY) {
        const entry = pickTriangleEntry(clientX, clientY);
        if (!entry) {
            triDragLastKey = null;
            return;
        }
        const key = triKey(entry.entity, entry.mesh, entry.triId);
        if (triDragLastKey === key) return;
        triDragLastKey = key;
        addTriangleEntry(entry);
    }

    function stampDecal(object, mesh, faceIndex, x, y, alpha, size) {
        if (!decalImage) return false;
        const layer = getFacePaintLayer(object, mesh, faceIndex);
        const ratio = Math.max(0.01, decalImage.width / Math.max(1, decalImage.height));
        const decalWidth = Math.max(10, size * 10);
        const decalHeight = Math.max(10, decalWidth / ratio);
        layer.ctx.globalAlpha = alpha;
        layer.ctx.globalCompositeOperation = "source-over";
        layer.ctx.drawImage(
            decalImage,
            x - decalWidth * 0.5,
            y - decalHeight * 0.5,
            decalWidth,
            decalHeight
        );
        commitLayer(layer);
        return true;
    }

    function beginPointer(clientX, clientY, _additive = false) {
        if (!active) return;
        if (isTriMode()) {
            // La sélection s'accumule uniquement (aucun retrait au glissé).
            // Un instantané est pris pour permettre l'annulation (Ctrl+Z).
            triDragSnapshot = selectedTriangles.slice();
            triDragActive = true;
            triDragLastKey = null;
            dragSelectTriangleAt(clientX, clientY);
            return;
        }
        const picked = pickPaintHit(clientX, clientY);
        if (!picked) return;

        const triHit = getTriangleUvFromHit(picked.hit);
        if (isTriMode() && triHit) return;

        const faceIndex = faceIndexFromHit(picked.hit.faceIndex ?? 0);
        const pixel = uvToCanvasPixel(picked.hit.uv);

        pendingUndoBefore = captureFaceSnapshot(picked.entity, faceIndex);

        const tool = getTool();
        if (tool === "pencil") {
            paintDot(
                picked.entity,
                picked.mesh,
                faceIndex,
                pixel.x,
                pixel.y,
                getBrushStyle(),
                getBrushSize()
            );
            stroke = {
                entity: picked.entity,
                mesh: picked.mesh,
                faceIndex,
                lastX: pixel.x,
                lastY: pixel.y,
            };
            return;
        }

        if (tool === "fill") {
            paintFill(picked.entity, picked.mesh, faceIndex, getBrushStyle());
            showStatus?.("Face peinte");
            commitPaintHistory(picked.entity, faceIndex);
            return;
        }

        if (tool === "face-texture") {
            if (!faceTextureImage) {
                pendingUndoBefore = null;
                showStatus?.("Chargez d'abord une image avec \"Texture face\"");
                return;
            }
            applyFaceTexture(
                picked.entity,
                picked.mesh,
                faceIndex,
                faceTextureImage,
                getTileRepeat(tileXInput),
                getTileRepeat(tileYInput)
            );
            showStatus?.("Texture appliquée sur toute la face");
            commitPaintHistory(picked.entity, faceIndex);
            return;
        }

        if (tool === "decal") {
            const done = stampDecal(
                picked.entity,
                picked.mesh,
                faceIndex,
                pixel.x,
                pixel.y,
                getBrushAlpha(),
                getBrushSize()
            );
            if (!done) {
                pendingUndoBefore = null;
                showStatus?.("Chargez d'abord une image de décalcomanie");
                return;
            }
            showStatus?.("Décalcomanie posée");
            commitPaintHistory(picked.entity, faceIndex);
            return;
        }

        shapeDraft = {
            entity: picked.entity,
            mesh: picked.mesh,
            faceIndex,
            startX: pixel.x,
            startY: pixel.y,
        };
    }

    function movePointer(clientX, clientY) {
        if (!active) return;
        if (triDragActive) {
            dragSelectTriangleAt(clientX, clientY);
            return;
        }
        if (stroke) {
            const picked = pickPaintHit(clientX, clientY);
            if (
                !picked ||
                picked.entity !== stroke.entity ||
                picked.mesh !== stroke.mesh ||
                faceIndexFromHit(picked.hit.faceIndex ?? 0) !== stroke.faceIndex
            ) {
                return;
            }
            const pixel = uvToCanvasPixel(picked.hit.uv);
            paintLine(
                stroke.entity,
                stroke.mesh,
                stroke.faceIndex,
                stroke.lastX,
                stroke.lastY,
                pixel.x,
                pixel.y,
                getBrushStyle(),
                getBrushSize()
            );
            stroke.lastX = pixel.x;
            stroke.lastY = pixel.y;
            return;
        }
    }

    async function endPointer(clientX, clientY) {
        if (!active) return;
        if (triDragActive) {
            triDragActive = false;
            triDragLastKey = null;
            if (triDragSnapshot && !sameSelection(triDragSnapshot, selectedTriangles)) {
                triSelectionUndoStack.push(triDragSnapshot);
            }
            triDragSnapshot = null;
            return;
        }

        if (stroke) {
            const { entity, faceIndex } = stroke;
            stroke = null;
            commitPaintHistory(entity, faceIndex);
            return;
        }

        if (!shapeDraft) return;

        const picked = pickPaintHit(clientX, clientY);
        const draft = shapeDraft;
        shapeDraft = null;

        if (
            !picked ||
            picked.entity !== draft.entity ||
            picked.mesh !== draft.mesh ||
            faceIndexFromHit(picked.hit.faceIndex ?? 0) !== draft.faceIndex
        ) {
            return;
        }

        const end = uvToCanvasPixel(picked.hit.uv);
        const tool = getTool();
        const style = getBrushStyle();
        const size = getBrushSize();

        if (tool === "text") {
            const dx = end.x - draft.startX;
            const dy = end.y - draft.startY;
            if (dx * dx + dy * dy > 36) return;
            const text = window.prompt("Texte à dessiner sur la face :", "");
            if (!text?.trim()) return;
            paintText(
                draft.entity,
                draft.mesh,
                draft.faceIndex,
                draft.startX,
                draft.startY,
                text.trim(),
                style,
                Math.round(size * 5 + 12)
            );
            showStatus?.("Texte ajouté");
            commitPaintHistory(draft.entity, draft.faceIndex);
            return;
        }

        if (tool === "rect") {
            paintRect(
                draft.entity,
                draft.mesh,
                draft.faceIndex,
                draft.startX,
                draft.startY,
                end.x,
                end.y,
                style,
                size
            );
            showStatus?.("Rectangle dessiné");
            commitPaintHistory(draft.entity, draft.faceIndex);
            return;
        }

        if (tool === "circle") {
            paintEllipse(
                draft.entity,
                draft.mesh,
                draft.faceIndex,
                draft.startX,
                draft.startY,
                end.x,
                end.y,
                style,
                size
            );
            showStatus?.("Cercle dessiné");
            commitPaintHistory(draft.entity, draft.faceIndex);
        }
    }

    drawBtn.addEventListener("click", (event) => {
        event.stopPropagation();
        toggle();
    });

    canvas.addEventListener("pointerdown", (event) => {
        if (!active || event.button !== 0) return;
        event.preventDefault();
        event.stopPropagation();
        canvas.setPointerCapture(event.pointerId);
        beginPointer(event.clientX, event.clientY, event.shiftKey);
    });

    canvas.addEventListener("pointermove", (event) => {
        if (!active) return;
        if (!triDragActive && !stroke && !shapeDraft) return;
        event.preventDefault();
        movePointer(event.clientX, event.clientY);
    });

    canvas.addEventListener("pointerup", (event) => {
        if (!active) return;
        if (canvas.hasPointerCapture(event.pointerId)) {
            canvas.releasePointerCapture(event.pointerId);
        }
        endPointer(event.clientX, event.clientY);
    });

    canvas.addEventListener("pointercancel", () => {
        if (triDragActive && triDragSnapshot && !sameSelection(triDragSnapshot, selectedTriangles)) {
            triSelectionUndoStack.push(triDragSnapshot);
        }
        triDragActive = false;
        triDragLastKey = null;
        triDragSnapshot = null;
        stroke = null;
        shapeDraft = null;
        pendingUndoBefore = null;
    });

    return {
        setActive,
        isActive: () => active,
        clearTriangleSelection: () => clearTriangleSelection(false),
        undoTriangleSelection,
    };
}
