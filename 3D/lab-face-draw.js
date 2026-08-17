/** Dessin sur les faces — calque alpha fusionné dans diffuseColor (texture PBR intacte). */
import * as THREE from "three";
import { prepareTileSource } from "./texture-tile-utils.js";
import { getArchSurfaceId, getArchSurfaceMeshes, isLabArchitecture, prepareArchSurfaceMeshForTexture, applyArchMeshPlanarUvs, ARCH_SURFACE_TEX_KEY, ARCH_SURFACE_TEXTURED_KEY } from "./lab-architecture.js";
import { reflectionToPbr, syncMirrorOnBoxFace } from "./lab-mirror.js";
import { LAB_IMPORTED_KEY, LAB_MESH_PERSIST_ID_KEY } from "./lab-import.js";
import { groupTrianglesByIslands } from "./lab-mesh-split.js";

export const FACE_PAINT_KEY = "facePaint";
export const FACE_CANVAS_SIZE = 256;
const FACE_COUNT = 6;
const FACE_PAINT_FLAG = "_labFacePaint";
const PAINT_UNIFORM_KEY = "_labPaintUniform";
/** Canal UV utilisé par le calque de peinture : "uv" ou "uv2". */
const PAINT_SHADER_KEY = "_labPaintShaderAttached";
const PAINT_BASE_COMPILE_KEY = "_labPaintBaseCompile";
const TRI_SELECTION_OVERLAY_NAME = "lab-triangle-selection-overlay";
const TRI_TEXTURE_OVERLAY_PREFIX = "lab-triangle-texture-overlay";
const FACE_SELECTION_OVERLAY_NAME = "lab-face-selection-overlay";
/** Texture albedo posée en mode Face (remplace material.map de la face). */
export const FACE_ALBEDO_MAP_KEY = "_labFaceAlbedoMap";
export const FACE_NORMAL_MAP_KEY = "_labFaceNormalMap";
export const FACE_SPECULAR_MAP_KEY = "_labFaceSpecularMap";
export const FACE_ROUGHNESS_MAP_KEY = "_labFaceRoughnessMap";
/** Store PBR par face (survit aux rebuilds de matériaux). */
const FACE_PBR_STORE_KEY = "_labFacePbrStore";

const PAINT_MIX_SNIPPET = `
    vec4 labPaintTexel = texture2D( labPaintMap, vLabPaintUv );
    diffuseColor.rgb = mix( diffuseColor.rgb, labPaintTexel.rgb, labPaintTexel.a );
`;

/** @type {THREE.Vector3} */
const _paintLocal = new THREE.Vector3();
/** @type {THREE.Vector3} */
const _paintNormal = new THREE.Vector3();
/** @type {THREE.Vector3} */
const _paintAB = new THREE.Vector3();
/** @type {THREE.Vector3} */
const _paintAC = new THREE.Vector3();
/** @type {THREE.Vector3} */
const _paintPosA = new THREE.Vector3();
/** @type {THREE.Vector3} */
const _paintPosB = new THREE.Vector3();
/** @type {THREE.Vector3} */
const _paintPosC = new THREE.Vector3();
/** @type {THREE.Vector3} */
const _paintBary = new THREE.Vector3();

const FACE_PAINT_PREPARED_KEY = "_labFacePaintPrepared";

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
 * Canal UV de peinture d’un mesh : `uv2` dès qu’il existe (il porte les UV
 * 0–1 par face), sinon `uv`. Doit rester aligné sur `paintPixelFromHit`.
 * @param {THREE.Mesh | null | undefined} mesh
 * @returns {"uv" | "uv2"}
 */
function paintUvChannelForMesh(mesh) {
    return mesh?.geometry?.attributes?.uv2 ? "uv2" : "uv";
}

/**
 * Injecte la lecture du calque de peinture dans un shader standard.
 * @param {{ vertexShader: string, fragmentShader: string }} shader
 * @param {"uv" | "uv2"} channel
 */
function injectPaintShader(shader, channel) {
    if (
        !shader.vertexShader.includes("vLabPaintUv") &&
        shader.vertexShader.includes("#include <uv_vertex>")
    ) {
        // three r132 ne déclare `uv2` que pour aoMap / lightMap : le déclarer
        // ici sinon, sans doublon quand three l’a déjà fait.
        const declarations =
            channel === "uv2"
                ? `#include <common>
varying vec2 vLabPaintUv;
#if ! defined( USE_LIGHTMAP ) && ! defined( USE_AOMAP )
attribute vec2 uv2;
#endif`
                : "#include <common>\nvarying vec2 vLabPaintUv;";

        // UV brute (hors répétition/offset de la texture couleur) : le dessin
        // n’est ni carrelé ni décalé par le tile de l’objet.
        shader.vertexShader = shader.vertexShader
            .replace("#include <common>", declarations)
            .replace("#include <uv_vertex>", `#include <uv_vertex>\n\tvLabPaintUv = ${channel};`);
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
            .replace("#include <map_fragment>", `#include <map_fragment>${PAINT_MIX_SNIPPET}`);
    }
}

/**
 * Mélange le dessin dans diffuseColor (avant éclairage PBR) — couleurs foncées incluses.
 * @param {THREE.MeshStandardMaterial} material
 * @param {THREE.CanvasTexture} overlayTexture
 * @param {"uv" | "uv2"} [paintUvChannel]
 */
function attachPaintOverlay(material, overlayTexture, paintUvChannel = "uv") {
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

    const channel = paintUvChannel === "uv2" ? "uv2" : "uv";
    if (material.userData[PAINT_SHADER_KEY] !== channel) {
        if (!(PAINT_BASE_COMPILE_KEY in material.userData)) {
            material.userData[PAINT_BASE_COMPILE_KEY] = {
                onBeforeCompile: material.onBeforeCompile ?? null,
                cacheKey: material.customProgramCacheKey?.bind(material) ?? null,
            };
        }
        const base = material.userData[PAINT_BASE_COMPILE_KEY];

        material.onBeforeCompile = (shader) => {
            base.onBeforeCompile?.call(material, shader);
            shader.uniforms.labPaintMap = uniform;
            injectPaintShader(shader, channel);
        };
        material.customProgramCacheKey = () =>
            `${base.cacheKey?.() || ""}_labFacePaintV8_${channel}`;
        material.userData[PAINT_SHADER_KEY] = channel;
    }

    material.needsUpdate = true;
}

/**
 * Réaligne le canal UV du calque de peinture : le canal 0–1 par face peut
 * n’apparaître qu’au moment où une projection XYZ (tile Z) est appliquée.
 * @param {THREE.Mesh} mesh
 */
export function syncPaintUvChannel(mesh) {
    if (!(mesh instanceof THREE.Mesh)) return;
    const channel = paintUvChannelForMesh(mesh);
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const material of materials) {
        if (!material?.userData?.[FACE_PAINT_FLAG]) continue;
        if (material.userData[PAINT_SHADER_KEY] === channel) continue;
        const overlay = material.userData[PAINT_UNIFORM_KEY]?.value;
        if (!overlay) continue;
        attachPaintOverlay(material, overlay, channel);
    }
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
    const base = material.userData[PAINT_BASE_COMPILE_KEY];
    delete material.userData[FACE_PAINT_FLAG];
    delete material.userData[PAINT_UNIFORM_KEY];
    delete material.userData[PAINT_SHADER_KEY];
    delete material.userData[PAINT_BASE_COMPILE_KEY];
    if (base?.onBeforeCompile) material.onBeforeCompile = base.onBeforeCompile;
    else delete material.onBeforeCompile;
    delete material.customProgramCacheKey;
    material.needsUpdate = true;
}

/**
 * @param {THREE.Mesh} mesh
 * @returns {THREE.MeshStandardMaterial[]}
 */
export function ensureFaceMaterials(mesh) {
    if (isPaintableBoxMesh(mesh)) {
        prepareBoxMeshForFacePaint(mesh);
    }
    if (Array.isArray(mesh.material) && mesh.material.length === FACE_COUNT) {
        // Ne pas retirer le verre des autres faces : chaque slot est indépendant.
        return mesh.material;
    }

    const base =
        mesh.material instanceof THREE.MeshStandardMaterial || mesh.material?.isMeshStandardMaterial
            ? mesh.material
            : new THREE.MeshStandardMaterial({ color: 0x00d1ff });

    const materials = Array.from({ length: FACE_COUNT }, () => {
        // Toujours un Standard opaque neuf (évite de cloner un Physical verre).
        const material = createFreshOpaqueStandardMaterial(base, {
            roughness: typeof base.roughness === "number" ? base.roughness : FACE_MAT_DEFAULTS.roughness,
            metalness: typeof base.metalness === "number" ? base.metalness : FACE_MAT_DEFAULTS.metalness,
            opacity: 1,
        });
        if (base.color && material.color) material.color.copy(base.color);
        return material;
    });

    if (!Array.isArray(mesh.material)) {
        // Ne pas dispose si encore référencé comme backup verre.
        if (!mesh.material?.userData?._labPreGlassMaterial) {
            try {
                mesh.material?.dispose?.();
            } catch {
                /* ignore */
            }
        }
    }
    mesh.material = materials;
    return materials;
}

/**
 * Prépare un cube/panneau pour peindre chaque face indépendamment :
 * sommets dédoublés + 6 groups + UV 0–1 dans le canal `uv2` (sinon le
 * lissage soude les coins et certaines faces ne reçoivent jamais le calque).
 * `uv` n’est pas touché : il porte le tile/offset de la texture couleur.
 * @param {THREE.Mesh} mesh
 */
function prepareBoxMeshForFacePaint(mesh) {
    if (!mesh?.geometry || mesh.userData[FACE_PAINT_PREPARED_KEY]) return;

    let geo = mesh.geometry;

    // Dédoubler les sommets partagés (RoundedBox soudé / weld).
    if (geo.index) {
        const previousIndex = geo.index;
        const expanded = geo.toNonIndexed();
        expanded.userData = { ...geo.userData };
        const old = geo;
        mesh.geometry = expanded;
        expandUvBackupToNonIndexed(mesh, previousIndex);
        old.dispose();
        geo = expanded;
    }

    ensureBoxFaceGroups(geo, { force: true });
    // Canal dédié : la peinture reste en 0–1 par face même quand `uv` porte
    // une projection XYZ / un carrelage (tile X, Y, Z) de la texture couleur.
    writeBoxFacePaintUvs(geo, "uv2");
    if (!geo.attributes.uv) writeBoxFacePaintUvs(geo, "uv");

    mesh.userData[FACE_PAINT_PREPARED_KEY] = true;
}

/**
 * Réaligne la sauvegarde d’UV (projection XYZ) après passage en non indexé,
 * sinon la restauration de tile écrirait un tableau de mauvaise taille.
 * @param {THREE.Mesh} mesh
 * @param {THREE.BufferAttribute} previousIndex
 */
function expandUvBackupToNonIndexed(mesh, previousIndex) {
    const backup = mesh.userData._labUvBackup;
    if (!backup?.array || !previousIndex) return;
    const itemSize = backup.itemSize ?? 2;
    const expanded = new Float32Array(previousIndex.count * itemSize);
    for (let i = 0; i < previousIndex.count; i++) {
        const source = previousIndex.getX(i) * itemSize;
        for (let c = 0; c < itemSize; c++) {
            expanded[i * itemSize + c] = backup.array[source + c];
        }
    }
    mesh.userData._labUvBackup = {
        array: expanded,
        itemSize,
        count: previousIndex.count,
    };
}

/**
 * Classe les triangles par face de boîte (±X/Y/Z) et crée 6 groups matériaux.
 * @param {THREE.BufferGeometry | null | undefined} geometry
 * @param {{ force?: boolean }} [opts]
 */
export function ensureBoxFaceGroups(geometry, opts = {}) {
    if (!geometry?.attributes?.position) return false;
    const force = !!opts.force;
    if (!force && geometry.groups?.length === FACE_COUNT) {
        const total = geometry.groups.reduce((s, g) => s + (g.count || 0), 0);
        const expected = geometry.index ? geometry.index.count : geometry.attributes.position.count;
        if (total === expected) return true;
    }

    const pos = geometry.attributes.position;
    const indexAttr = geometry.index;
    const triCount = indexAttr ? indexAttr.count / 3 : Math.floor(pos.count / 3);
    /** @type {number[][]} */
    const byFace = Array.from({ length: FACE_COUNT }, () => []);

    for (let t = 0; t < triCount; t++) {
        let ia;
        let ib;
        let ic;
        if (indexAttr) {
            ia = indexAttr.getX(t * 3);
            ib = indexAttr.getX(t * 3 + 1);
            ic = indexAttr.getX(t * 3 + 2);
        } else {
            ia = t * 3;
            ib = t * 3 + 1;
            ic = t * 3 + 2;
        }
        _paintLocal.fromBufferAttribute(pos, ia);
        _paintAB.fromBufferAttribute(pos, ib).sub(_paintLocal);
        _paintAC.fromBufferAttribute(pos, ic).sub(_paintLocal);
        _paintNormal.crossVectors(_paintAB, _paintAC);
        if (_paintNormal.lengthSq() < 1e-12) continue;
        _paintNormal.normalize();
        const face = dominantBoxFaceFromNormal(_paintNormal);
        byFace[face].push(ia, ib, ic);
    }

    const merged = [];
    geometry.clearGroups();
    for (let f = 0; f < FACE_COUNT; f++) {
        const start = merged.length;
        merged.push(...byFace[f]);
        geometry.addGroup(start, byFace[f].length, f);
    }
    geometry.setIndex(merged);
    // Ne pas recalculer les normales si elles existent déjà : toNonIndexed les a
    // conservées, et un recomput fait « sauter » l’éclairage / le tile perçu
    // au premier coup de pinceau.
    if (!geometry.attributes.normal || geometry.attributes.normal.count !== geometry.attributes.position.count) {
        geometry.computeVertexNormals();
    }
    return true;
}

/**
 * UV 0–1 par face, alignées sur le mapping de peinture.
 * @param {THREE.BufferGeometry} geometry
 * @param {"uv" | "uv2"} [attributeName]
 */
function writeBoxFacePaintUvs(geometry, attributeName = "uv") {
    const pos = geometry.attributes.position;
    if (!pos) return;
    if (!geometry.boundingBox) geometry.computeBoundingBox();
    const bb = geometry.boundingBox;
    let uv = geometry.attributes[attributeName];
    if (!uv || uv.count !== pos.count) {
        uv = new THREE.BufferAttribute(new Float32Array(pos.count * 2), 2);
        geometry.setAttribute(attributeName, uv);
    }

    const index = geometry.index;
    const groups = geometry.groups?.length ? geometry.groups : [{ start: 0, count: index ? index.count : pos.count, materialIndex: 0 }];

    for (const g of groups) {
        const faceIndex = g.materialIndex ?? 0;
        const end = g.start + g.count;
        for (let i = g.start; i < end; i++) {
            const vi = index ? index.getX(i) : i;
            const coords = boxFaceUv01(pos.getX(vi), pos.getY(vi), pos.getZ(vi), faceIndex, bb);
            uv.setXY(vi, coords.u, coords.v);
        }
    }
    uv.needsUpdate = true;
}

/**
 * @param {THREE.Vector3} n
 */
function dominantBoxFaceFromNormal(n) {
    const ax = Math.abs(n.x);
    const ay = Math.abs(n.y);
    const az = Math.abs(n.z);
    if (ax >= ay && ax >= az) return n.x >= 0 ? 0 : 1;
    if (ay >= ax && ay >= az) return n.y >= 0 ? 2 : 3;
    return n.z >= 0 ? 4 : 5;
}

/**
 * @param {number} x
 * @param {number} y
 * @param {number} z
 * @param {number} faceIndex
 * @param {THREE.Box3} bb
 */
function boxFaceUv01(x, y, z, faceIndex, bb) {
    const sx = Math.max(1e-6, bb.max.x - bb.min.x);
    const sy = Math.max(1e-6, bb.max.y - bb.min.y);
    const sz = Math.max(1e-6, bb.max.z - bb.min.z);
    let u = 0.5;
    let v = 0.5;
    switch (faceIndex) {
        case 0: // +X
            u = 1 - (z - bb.min.z) / sz;
            v = (y - bb.min.y) / sy;
            break;
        case 1: // -X
            u = (z - bb.min.z) / sz;
            v = (y - bb.min.y) / sy;
            break;
        case 2: // +Y
            u = (x - bb.min.x) / sx;
            v = 1 - (z - bb.min.z) / sz;
            break;
        case 3: // -Y
            u = (x - bb.min.x) / sx;
            v = (z - bb.min.z) / sz;
            break;
        case 4: // +Z
            u = (x - bb.min.x) / sx;
            v = (y - bb.min.y) / sy;
            break;
        default: // -Z
            u = 1 - (x - bb.min.x) / sx;
            v = (y - bb.min.y) / sy;
            break;
    }
    return {
        u: THREE.MathUtils.clamp(u, 0, 1),
        v: THREE.MathUtils.clamp(v, 0, 1),
    };
}

/**
 * UV canvas 0…size pour une face de boîte, depuis un point local.
 * @param {THREE.Vector3} local
 * @param {number} faceIndex
 * @param {THREE.Mesh} mesh
 * @param {number} [size]
 */
function boxFaceCanvasPixel(local, faceIndex, mesh, size = FACE_CANVAS_SIZE) {
    const geo = mesh.geometry;
    if (!geo.boundingBox) geo.computeBoundingBox();
    const { u, v } = boxFaceUv01(local.x, local.y, local.z, faceIndex, geo.boundingBox);
    return { x: u * size, y: (1 - v) * size };
}

/**
 * Prépare géométrie + 6 matériaux AVANT le calcul du pixel de peinture.
 * À appeler avant le 1er coup, sinon le hit (indices/UV) est obsolète et le
 * pinceau rate l’endroit, pendant que le tile « saute ».
 * @param {THREE.Mesh} mesh
 * @returns {boolean} true si la géométrie ou les matériaux ont changé
 */
export function ensurePaintReady(mesh) {
    if (!(mesh instanceof THREE.Mesh)) return false;
    let changed = false;
    if (isPaintableBoxMesh(mesh)) {
        if (!mesh.userData[FACE_PAINT_PREPARED_KEY]) {
            prepareBoxMeshForFacePaint(mesh);
            changed = true;
        }
        if (!Array.isArray(mesh.material) || mesh.material.length !== FACE_COUNT) {
            ensureFaceMaterials(mesh);
            changed = true;
        }
    }
    return changed;
}

/**
 * UV canvas depuis un hit. Pour les boîtes : projection locale (stable), pas les
 * UV couleur éventuellement carrelées (XYZ / tile) qui décaleraient le trait.
 * @param {THREE.Mesh} mesh
 * @param {THREE.Intersection} hit
 * @param {number} faceIndex
 */
function paintPixelFromHit(mesh, hit, faceIndex) {
    if (isPaintableBoxMesh(mesh) && hit.point) {
        _paintLocal.copy(hit.point);
        mesh.worldToLocal(_paintLocal);
        return boxFaceCanvasPixel(_paintLocal, faceIndex, mesh);
    }

    const geo = mesh.geometry;
    const uvAttr = geo?.attributes?.uv2 || geo?.attributes?.uv;
    const pos = geo?.attributes?.position;

    if (uvAttr && pos && hit.face) {
        const ia = hit.face.a;
        const ib = hit.face.b;
        const ic = hit.face.c;
        let ba = 1 / 3;
        let bb = 1 / 3;
        let bc = 1 / 3;
        if (hit.barycoord) {
            ba = hit.barycoord.x;
            bb = hit.barycoord.y;
            bc = hit.barycoord.z;
        } else if (hit.point) {
            _paintLocal.copy(hit.point);
            mesh.worldToLocal(_paintLocal);
            _paintPosA.fromBufferAttribute(pos, ia);
            _paintPosB.fromBufferAttribute(pos, ib);
            _paintPosC.fromBufferAttribute(pos, ic);
            THREE.Triangle.getBarycoord(_paintLocal, _paintPosA, _paintPosB, _paintPosC, _paintBary);
            ba = _paintBary.x;
            bb = _paintBary.y;
            bc = _paintBary.z;
        }
        const u = uvAttr.getX(ia) * ba + uvAttr.getX(ib) * bb + uvAttr.getX(ic) * bc;
        const v = uvAttr.getY(ia) * ba + uvAttr.getY(ib) * bb + uvAttr.getY(ic) * bc;
        return uvToCanvasPixel({ x: u, y: v });
    }

    if (hit.uv) return uvToCanvasPixel(hit.uv);
    return { x: FACE_CANVAS_SIZE / 2, y: FACE_CANVAS_SIZE / 2 };
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
 * Clé calque face : un mesh architecture ≠ un autre (même faceIndex 0–5).
 * @param {THREE.Mesh} mesh
 * @param {number} faceIndex
 */
function facePaintLayerKey(mesh, faceIndex) {
    return `${mesh.uuid}:${faceIndex}`;
}

/**
 * @param {THREE.Object3D} object
 * @param {THREE.Mesh} mesh
 * @param {number} faceIndex
 */
function lookupFacePaintLayer(object, mesh, faceIndex) {
    const store = object.userData[FACE_PAINT_KEY];
    if (!store?.faces) return null;
    const keyed = store.faces[facePaintLayerKey(mesh, faceIndex)];
    if (keyed) return keyed;
    // Ancien format : faces[faceIndex] sans uuid (cubes mono-mesh).
    const legacy = store.faces[faceIndex] ?? store.faces[String(faceIndex)];
    if (legacy && (legacy.meshUuid == null || legacy.meshUuid === mesh.uuid)) {
        return legacy;
    }
    return null;
}

/**
 * UV 0–1 de la face → canal `uv` (pour material.map), sans toucher les autres faces.
 * @param {THREE.Mesh} mesh
 * @param {number} faceIndex
 */
function promoteFaceUv01ToMapChannel(mesh, faceIndex) {
    const geo = mesh.geometry;
    if (!geo?.attributes?.position) return;
    if (!geo.attributes.uv2) {
        writeBoxFacePaintUvs(geo, "uv2");
    }
    if (!geo.attributes.uv) {
        writeBoxFacePaintUvs(geo, "uv");
        return;
    }
    const uv = geo.attributes.uv;
    const uv2 = geo.attributes.uv2;
    const groups = geo.groups?.length
        ? geo.groups
        : [{ start: 0, count: geo.index ? geo.index.count : geo.attributes.position.count, materialIndex: 0 }];
    const index = geo.index;
    for (const g of groups) {
        if ((g.materialIndex ?? 0) !== faceIndex) continue;
        const end = g.start + g.count;
        for (let i = g.start; i < end; i++) {
            const vi = index ? index.getX(i) : i;
            uv.setXY(vi, uv2.getX(vi), uv2.getY(vi));
        }
    }
    uv.needsUpdate = true;
}

/**
 * Réapplique les UV 0–1 sur toutes les faces qui ont une albedo Face.
 * À appeler après syncObjectUvTransforms (tile XYZ / restore backup).
 * @param {THREE.Mesh} mesh
 */
export function restoreFaceAlbedoMapUvs(mesh) {
    if (!(mesh instanceof THREE.Mesh) || !Array.isArray(mesh.material)) return;
    for (let i = 0; i < mesh.material.length; i += 1) {
        const mat = mesh.material[i];
        if (mat?.userData?.[FACE_ALBEDO_MAP_KEY]) {
            promoteFaceUv01ToMapChannel(mesh, i);
        }
    }
}

/**
 * @param {string} dataUrl
 * @param {"srgb" | "linear"} colorSpace
 * @param {number} tileX
 * @param {number} tileY
 * @param {number} offsetX
 * @param {number} offsetY
 * @returns {Promise<THREE.Texture>}
 */
async function loadFaceMapTexture(dataUrl, colorSpace, tileX, tileY, offsetX, offsetY) {
    const image = await loadImageElement(dataUrl);
    const texture = new THREE.Texture(image);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(tileX, tileY);
    texture.offset.set(offsetX, offsetY);
    if (colorSpace === "srgb") {
        if ("colorSpace" in texture) texture.colorSpace = THREE.SRGBColorSpace;
        else texture.encoding = THREE.sRGBEncoding;
    } else if ("colorSpace" in texture) {
        texture.colorSpace = THREE.NoColorSpace;
    } else {
        texture.encoding = THREE.LinearEncoding;
    }
    if (typeof texture.updateMatrix === "function") texture.updateMatrix();
    texture.needsUpdate = true;
    return texture;
}

/**
 * Clé store texture Architecture : une face de boîte (0–5) d’un mur.
 * @param {string} surfaceId
 * @param {number} faceIndex
 */
function archSurfaceFaceKey(surfaceId, faceIndex) {
    return `${surfaceId}:${faceIndex}`;
}

const FACE_MAT_DEFAULTS = { roughness: 0.65, metalness: 0.05, opacity: 1, glass: false, reflection: 0 };
const ARCH_MAT_DEFAULTS = { roughness: 0.78, metalness: 0.02, opacity: 1, glass: false, reflection: 0 };
const TRI_MAT_DEFAULTS = { roughness: 0.62, metalness: 0.08, opacity: 1, glass: false, reflection: 0 };
/** Opacité UI verre → transmission = 1 − opacity (0 = vitre claire). */
const FACE_GLASS_OPACITY = 0.15;
const FACE_GLASS_ROUGHNESS = 0.08;
const FACE_GLASS_METALNESS = 0;
const FACE_GLASS_TRANSMISSION = 0.92;
const FACE_GLASS_THICKNESS = 0.45;

/**
 * Faces opposées d’une BoxGeometry Three (0↔1, 2↔3, 4↔5).
 * @param {number} faceIndex
 */
function oppositeBoxFaceIndex(faceIndex) {
    return faceIndex ^ 1;
}

/**
 * Sync face opposée : verre, métal poli, miroir (mur mince = 2 faces).
 * @param {{ glass?: boolean, opacity?: number, clearGlass?: boolean, metalPreset?: boolean, mirrorPreset?: boolean } | null | undefined} props
 * @param {{ glass?: boolean } | null | undefined} nextProps
 */
function shouldSyncOppositeFace(props, nextProps) {
    if (!props) return false;
    if (props.glass === true || props.glass === false || props.clearGlass) return true;
    if (props.metalPreset || props.mirrorPreset) return true;
    return typeof props.opacity === "number" && !!nextProps?.glass;
}

/**
 * @param {THREE.Mesh | null | undefined} mesh
 */
function syncMeshTranslucentRenderOrder(mesh) {
    if (!mesh) return;
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    const translucent = mats.some(
        (m) =>
            m &&
            (m.transparent ||
                (typeof m.opacity === "number" && m.opacity < 0.995) ||
                (typeof m.transmission === "number" && m.transmission > 0.02) ||
                !!m.userData?._labGlass)
    );
    mesh.renderOrder = translucent ? 2 : 0;
}

/**
 * Opacité curseur (0–1) → transmission verre (1 = tout voir à travers).
 * @param {number} opacity
 */
function glassOpacityToTransmission(opacity) {
    const op = THREE.MathUtils.clamp(opacity, 0, 1);
    return THREE.MathUtils.clamp(1 - op * 0.92, 0.08, 1);
}

/**
 * Convertit un matériau face en verre physique (transmission réelle).
 * @param {THREE.Material} source
 * @param {number} opacity
 * @param {{ roughness?: number, metalness?: number }} [opts]
 * @returns {THREE.MeshPhysicalMaterial}
 */
function toGlassPhysicalMaterial(source, opacity, opts = {}) {
    const transmission = glassOpacityToTransmission(
        typeof opacity === "number" ? opacity : FACE_GLASS_OPACITY
    );
    const roughness =
        typeof opts.roughness === "number"
            ? THREE.MathUtils.clamp(opts.roughness, 0, 1)
            : FACE_GLASS_ROUGHNESS;
    const metalness =
        typeof opts.metalness === "number"
            ? THREE.MathUtils.clamp(opts.metalness, 0, 1)
            : FACE_GLASS_METALNESS;

    if (source?.isMeshPhysicalMaterial && source.userData?._labGlass) {
        source.transmission = transmission;
        source.thickness = FACE_GLASS_THICKNESS;
        source.roughness = roughness;
        source.metalness = metalness;
        source.transparent = true;
        source.opacity = 1;
        source.depthWrite = false;
        source.side = THREE.FrontSide;
        source.envMapIntensity = 1;
        if (source.map && !source.userData._labGlassMapSaved) {
            source.userData._labGlassMapSaved = source.map;
            source.map = null;
        }
        source.needsUpdate = true;
        return /** @type {THREE.MeshPhysicalMaterial} */ (source);
    }

    if (source) detachPaintOverlay(source);

    const color = source?.color?.clone?.() || new THREE.Color(0xffffff);
    color.lerp(new THREE.Color(0xffffff), 0.55);

    const phys = new THREE.MeshPhysicalMaterial({
        color,
        map: null,
        normalMap: source?.normalMap || null,
        roughness,
        metalness,
        transmission,
        thickness: FACE_GLASS_THICKNESS,
        transparent: true,
        opacity: 1,
        depthWrite: false,
        side: THREE.FrontSide,
        envMapIntensity: 1,
    });
    if (source?.normalScale && phys.normalScale) phys.normalScale.copy(source.normalScale);

    phys.userData = {
        ...(source?.userData || {}),
        _labGlass: true,
        _labPreGlassMaterial: source || null,
        _labGlassMapSaved: source?.map || null,
    };
    delete phys.userData[FACE_PAINT_FLAG];
    phys.needsUpdate = true;
    return phys;
}

/**
 * Restaure le matériau d’avant le verre.
 * @param {THREE.Material} glassMat
 * @returns {THREE.Material}
 */
function fromGlassPhysicalMaterial(glassMat) {
    const backup = glassMat?.userData?._labPreGlassMaterial;
    if (backup && backup.isMaterial) {
        delete glassMat.userData._labGlass;
        delete glassMat.userData._labPreGlassMaterial;
        try {
            glassMat.dispose?.();
        } catch {
            /* ignore */
        }
        return backup;
    }
    const std = new THREE.MeshStandardMaterial({
        color: glassMat?.color?.clone?.() || new THREE.Color(0xc8c2b4),
        map: glassMat?.userData?._labGlassMapSaved || null,
        normalMap: glassMat?.normalMap || null,
        roughness: FACE_MAT_DEFAULTS.roughness,
        metalness: FACE_MAT_DEFAULTS.metalness,
        transparent: false,
        opacity: 1,
        depthWrite: true,
        side: THREE.FrontSide,
    });
    std.userData = { ...(glassMat?.userData || {}) };
    delete std.userData._labGlass;
    delete std.userData._labPreGlassMaterial;
    delete std.userData._labGlassMapSaved;
    try {
        glassMat?.dispose?.();
    } catch {
        /* ignore */
    }
    return std;
}

/**
 * Nouveau StandardMaterial opaque (jamais de mutation d’un Physical verre).
 * @param {THREE.Material | null | undefined} source
 * @param {{ roughness?: number, metalness?: number, opacity?: number, reflection?: number, envMapIntensity?: number }} props
 * @returns {THREE.MeshStandardMaterial}
 */
function createFreshOpaqueStandardMaterial(source, props = {}) {
    const roughness =
        typeof props.roughness === "number" ? props.roughness : FACE_MAT_DEFAULTS.roughness;
    const metalness =
        typeof props.metalness === "number" ? props.metalness : FACE_MAT_DEFAULTS.metalness;
    const opacity = typeof props.opacity === "number" ? props.opacity : 1;
    const envMapIntensity =
        typeof props.envMapIntensity === "number"
            ? props.envMapIntensity
            : typeof props.reflection === "number"
              ? 1.05 + props.reflection * 2.9
              : typeof source?.envMapIntensity === "number"
                ? source.envMapIntensity
                : 1;

    // Ne pas reprendre une albedo « verre » (souvent retirée) ni un map fantôme.
    const map =
        source?.userData?._labGlass || source?.isMeshPhysicalMaterial
            ? source?.userData?._labGlassMapSaved || null
            : source?.map || null;

    const mat = new THREE.MeshStandardMaterial({
        color: source?.color?.clone?.() || new THREE.Color(0xc8c8c8),
        map,
        normalMap: source?.userData?._labGlass ? null : source?.normalMap || null,
        roughness: THREE.MathUtils.clamp(roughness, 0, 1),
        metalness: THREE.MathUtils.clamp(metalness, 0, 1),
        envMap: source?.envMap || null,
        envMapIntensity,
        transparent: opacity < 0.995,
        opacity: THREE.MathUtils.clamp(opacity, 0, 1),
        depthWrite: opacity >= 0.995,
        side: THREE.FrontSide,
    });
    if (source?.normalScale && mat.normalScale && mat.normalMap) {
        mat.normalScale.copy(source.normalScale);
    }
    mat.userData = { ...(source?.userData || {}) };
    delete mat.userData._labGlass;
    delete mat.userData._labPreGlassMaterial;
    delete mat.userData._labGlassMapSaved;
    delete mat.userData[FACE_PAINT_FLAG];
    delete mat.userData._labPaintShaderAttached;
    delete mat.onBeforeCompile;
    delete mat.customProgramCacheKey;
    if (typeof props.reflection === "number") {
        mat.userData._labReflection = props.reflection;
    }
    mat.needsUpdate = true;
    return mat;
}

/**
 * True si le matériau est encore du verre / semi-transparent.
 * @param {THREE.Material | null | undefined} mat
 */
function isResidualGlassOrTranslucent(mat) {
    if (!mat) return false;
    if (mat.userData?._labGlass) return true;
    if (mat.isMeshPhysicalMaterial && typeof mat.transmission === "number" && mat.transmission > 0.02) {
        return true;
    }
    if (mat.transparent && typeof mat.opacity === "number" && mat.opacity < 0.98) return true;
    return false;
}

/**
 * Remplace tout slot verre/translucide restant par un Standard opaque (défaut mur).
 * @param {THREE.Mesh} mesh
 * @param {number[]} [preserveIndices] faces déjà traitées (métal) — on les laisse
 */
function stripResidualGlassSlots(mesh, preserveIndices = []) {
    if (!mesh) return;
    const preserve = new Set(preserveIndices);
    const list = Array.isArray(mesh.material) ? mesh.material.slice() : mesh.material ? [mesh.material] : [];
    if (!list.length) return;
    let changed = false;
    for (let i = 0; i < list.length; i += 1) {
        if (preserve.has(i)) continue;
        const mat = list[i];
        if (!isResidualGlassOrTranslucent(mat)) continue;
        const fresh = createFreshOpaqueStandardMaterial(mat, {
            roughness: FACE_MAT_DEFAULTS.roughness,
            metalness: FACE_MAT_DEFAULTS.metalness,
            opacity: 1,
            reflection: 0,
        });
        try {
            if (mat !== fresh) mat.dispose?.();
        } catch {
            /* ignore */
        }
        list[i] = fresh;
        changed = true;
    }
    if (changed) {
        mesh.material = Array.isArray(mesh.material) ? list : list[0];
        syncMeshTranslucentRenderOrder(mesh);
    }
}

/**
 * Force un matériau face opaque (sortie verre / métal poli / miroir).
 * @param {THREE.Material} mat
 * @param {{ roughness?: number, metalness?: number, opacity?: number, reflection?: number, envMapIntensity?: number }} [props]
 * @returns {THREE.Material}
 */
function forceFaceMaterialOpaque(mat, props = {}) {
    if (!mat) return mat;
    if (
        isResidualGlassOrTranslucent(mat) ||
        mat.isMeshPhysicalMaterial ||
        typeof props.metalness === "number" ||
        typeof props.reflection === "number"
    ) {
        return createFreshOpaqueStandardMaterial(mat, {
            roughness: typeof props.roughness === "number" ? props.roughness : mat.roughness,
            metalness: typeof props.metalness === "number" ? props.metalness : mat.metalness,
            opacity: typeof props.opacity === "number" ? props.opacity : 1,
            reflection: props.reflection,
            envMapIntensity: props.envMapIntensity,
        });
    }
    mat.opacity = typeof props.opacity === "number" ? props.opacity : 1;
    mat.transparent = mat.opacity < 0.995;
    mat.depthWrite = mat.opacity >= 0.995;
    mat.side = THREE.FrontSide;
    if (typeof mat.transmission === "number") mat.transmission = 0;
    if ("thickness" in mat) mat.thickness = 0;
    if ("alphaMap" in mat) mat.alphaMap = null;
    if (mat.userData) {
        delete mat.userData._labGlass;
        delete mat.userData._labPreGlassMaterial;
    }
    mat.needsUpdate = true;
    return mat;
}

/**
 * Applique / retire le verre sur un slot de matériau (remplace dans le tableau si besoin).
 * @param {THREE.Mesh} mesh
 * @param {number} slotIndex
 * @param {{ roughness?: number, metalness?: number, opacity?: number, glass?: boolean, reflection?: number, envMapIntensity?: number }} nextProps
 * @param {{ alwaysTransparent?: boolean }} [opts]
 * @returns {THREE.Material | null}
 */
function applyMaterialPropsToSlot(mesh, slotIndex, nextProps, opts = {}) {
    const list = Array.isArray(mesh.material) ? mesh.material.slice() : mesh.material ? [mesh.material] : [];
    if (!list.length || slotIndex < 0 || slotIndex >= list.length) return null;
    let mat = list[slotIndex];
    if (!mat) return null;

    if (nextProps.glass) {
        detachPaintOverlay(mat);
        const glassMat = toGlassPhysicalMaterial(mat, nextProps.opacity, {
            roughness: nextProps.roughness,
            metalness: nextProps.metalness,
        });
        if (glassMat !== mat) {
            list[slotIndex] = glassMat;
            mesh.material = Array.isArray(mesh.material) ? list : glassMat;
            mat = glassMat;
        }
        mat.userData._labGlass = true;
        mat.userData._labReflection = typeof nextProps.reflection === "number" ? nextProps.reflection : 0;
        if (typeof nextProps.roughness === "number") {
            mat.roughness = THREE.MathUtils.clamp(nextProps.roughness, 0, 1);
        }
        if (typeof nextProps.metalness === "number") {
            mat.metalness = THREE.MathUtils.clamp(nextProps.metalness, 0, 1);
        }
        mat.needsUpdate = true;
        return mat;
    }

    // Métal / miroir / sortie verre : toujours un Standard neuf si verre ou Physical.
    const prevMat = mat;
    mat = forceFaceMaterialOpaque(mat, nextProps);
    list[slotIndex] = mat;
    mesh.material = Array.isArray(mesh.material) ? list : mat;
    if (prevMat && prevMat !== mat) {
        try {
            // Ne dispose pas le backup encore référencé ailleurs.
            if (!prevMat.userData?._labPreGlassMaterial) prevMat.dispose?.();
        } catch {
            /* ignore */
        }
    }

    applyPropsToStandardMaterial(mat, { ...nextProps, glass: false }, opts);
    const op = typeof nextProps.opacity === "number" ? nextProps.opacity : 1;
    mat.opacity = op;
    if (op > 0.98) {
        mat.transparent = false;
        mat.depthWrite = true;
        mat.side = THREE.FrontSide;
        if (typeof mat.transmission === "number") mat.transmission = 0;
    }
    if (mat.roughnessMap) mat.roughnessMap = null;
    if (mat.metalnessMap) mat.metalnessMap = null;
    mat.needsUpdate = true;
    return mat;
}

/**
 * @deprecated Conservé pour overlays triangles / chemins non-slot.
 * @param {THREE.MeshStandardMaterial} mat
 * @param {boolean} glass
 */
function polishGlassMaterialLook(mat, glass) {
    if (!mat) return;
    if (!glass) {
        if (typeof mat.transmission === "number") mat.transmission = 0;
        return;
    }
    // Fallback si un StandardMaterial reste en mode verre (ne devrait plus arriver).
    mat.transparent = true;
    mat.depthWrite = false;
    mat.opacity = typeof mat.opacity === "number" && mat.opacity < 0.85 ? mat.opacity : FACE_GLASS_OPACITY;
    mat.envMapIntensity = 0.35;
    mat.needsUpdate = true;
}

/**
 * @param {THREE.MeshStandardMaterial | null | undefined} mat
 * @param {{ roughness?: number, metalness?: number, opacity?: number, glass?: boolean, reflection?: number, envMapIntensity?: number }} props
 * @param {{ alwaysTransparent?: boolean }} [opts]
 */
function applyPropsToStandardMaterial(mat, props, opts = {}) {
    if (!mat) return;
    const alwaysTransparent = !!opts.alwaysTransparent;

    // Verre physique : le curseur Opacité pilote la transmission.
    if (mat.isMeshPhysicalMaterial && (props.glass === true || mat.userData?._labGlass)) {
        if (typeof props.opacity === "number") {
            mat.transmission = glassOpacityToTransmission(props.opacity);
        }
        mat.transparent = true;
        mat.opacity = 1;
        mat.depthWrite = false;
        if (typeof props.roughness === "number") {
            mat.roughness = THREE.MathUtils.clamp(props.roughness, 0, 1);
        }
        if (typeof props.metalness === "number") {
            mat.metalness = THREE.MathUtils.clamp(props.metalness, 0, 1);
        }
        if (props.glass === true) mat.userData._labGlass = true;
        mat.needsUpdate = true;
        return;
    }

    if (typeof props.roughness === "number") {
        mat.roughness = THREE.MathUtils.clamp(props.roughness, 0, 1);
    }
    if (typeof props.metalness === "number") {
        mat.metalness = THREE.MathUtils.clamp(props.metalness, 0, 1);
    }
    if (typeof props.envMapIntensity === "number") {
        mat.envMapIntensity = props.envMapIntensity;
    } else if (typeof props.reflection === "number" || typeof props.metalness === "number") {
        const metal = typeof props.metalness === "number" ? props.metalness : mat.metalness || 0;
        const refl = typeof props.reflection === "number" ? props.reflection : metal;
        mat.envMapIntensity = 1.05 + refl * 2.9;
    }
    if (typeof props.opacity === "number") {
        const opacity = THREE.MathUtils.clamp(props.opacity, 0, 1);
        mat.opacity = opacity;
        const glass = props.glass === true || (props.glass !== false && !!mat.userData?._labGlass);
        const translucent = opacity < 0.995 || glass || alwaysTransparent;
        mat.transparent = translucent || opacity < 0.995;
        if (glass || translucent || alwaysTransparent) {
            mat.depthWrite = false;
            mat.side = alwaysTransparent ? THREE.DoubleSide : THREE.FrontSide;
        } else {
            mat.depthWrite = true;
            mat.side = THREE.FrontSide;
        }
    } else if (props.glass === false) {
        if (typeof mat.opacity === "number" && mat.opacity < 0.995 && !alwaysTransparent) {
            mat.opacity = 1;
            mat.transparent = false;
            mat.depthWrite = true;
            mat.side = THREE.FrontSide;
        }
    }
    if (props.glass === true) mat.userData._labGlass = true;
    else if (props.glass === false) delete mat.userData._labGlass;
    if (typeof props.reflection === "number") {
        mat.userData._labReflection = props.reflection;
    }
    mat.needsUpdate = true;
}

/**
 * @param {THREE.MeshStandardMaterial | null | undefined} mat
 * @param {{ roughness: number, metalness: number, opacity: number, glass: boolean, reflection: number }} defaults
 */
function readMaterialPropsFromMat(mat, defaults) {
    const glass = !!mat?.userData?._labGlass;
    let opacity = typeof mat?.opacity === "number" ? mat.opacity : defaults.opacity;
    // Verre physique : le curseur affiche l’inverse de la transmission.
    if (glass && typeof mat?.transmission === "number" && mat.transmission > 0.02) {
        opacity = THREE.MathUtils.clamp(1 - mat.transmission / 0.92, 0, 1);
    }
    return {
        roughness: typeof mat?.roughness === "number" ? mat.roughness : defaults.roughness,
        metalness: typeof mat?.metalness === "number" ? mat.metalness : defaults.metalness,
        opacity,
        glass,
        reflection:
            typeof mat?.userData?._labReflection === "number"
                ? mat.userData._labReflection
                : typeof mat?.metalness === "number"
                  ? mat.metalness
                  : defaults.reflection,
    };
}

/**
 * @param {Record<string, unknown>} storeEntry
 * @param {{ roughness: number, metalness: number, opacity: number, glass: boolean, reflection: number }} defaults
 */
function readMaterialPropsFromStore(storeEntry, defaults) {
    if (!storeEntry || typeof storeEntry !== "object") return { ...defaults };
    return {
        roughness:
            typeof storeEntry.roughness === "number" ? storeEntry.roughness : defaults.roughness,
        metalness:
            typeof storeEntry.metalness === "number" ? storeEntry.metalness : defaults.metalness,
        opacity: typeof storeEntry.opacity === "number" ? storeEntry.opacity : defaults.opacity,
        glass: !!storeEntry.glass,
        reflection:
            typeof storeEntry.reflection === "number" ? storeEntry.reflection : defaults.reflection,
    };
}

/**
 * @param {Record<string, unknown>} nextProps
 * @param {{ roughness?: number, metalness?: number, opacity?: number, glass?: boolean, reflection?: number, metalPreset?: boolean, mirrorPreset?: boolean, clearGlass?: boolean }} props
 * @param {Record<string, unknown>} prev
 * @param {{ roughness: number, metalness: number, opacity: number, glass: boolean, reflection: number }} defaults
 */
function resolveMaterialPropsUpdate(nextProps, props, prev, defaults) {
    let out = { ...nextProps };
    if (props.mirrorPreset) {
        const pbr = reflectionToPbr(1);
        out = {
            ...out,
            glass: false,
            reflection: 1,
            metalness: pbr.metalness,
            roughness: pbr.roughness,
            envMapIntensity: pbr.envMapIntensity,
        };
        delete prev.glassRestore;
        return out;
    }
    if (props.metalPreset) {
        out = {
            ...out,
            glass: false,
            metalness: 1,
            roughness: 0.18,
            opacity: 1,
            reflection: 0.82,
            envMapIntensity: 1.05 + 0.82 * 2.9,
        };
        delete prev.glassRestore;
        return out;
    }
    if (props.glass === true) {
        if (!prev.glass) {
            prev.glassRestore = {
                roughness: out.roughness,
                metalness: out.metalness,
                opacity: out.opacity,
                reflection: out.reflection,
            };
            // Première activation : preset, sauf rugosité / métal déjà fournis (restauration).
            out = {
                roughness:
                    typeof props.roughness === "number" ? props.roughness : FACE_GLASS_ROUGHNESS,
                metalness:
                    typeof props.metalness === "number" ? props.metalness : FACE_GLASS_METALNESS,
                opacity: typeof props.opacity === "number" ? props.opacity : FACE_GLASS_OPACITY,
                glass: true,
                reflection: 0,
            };
        } else {
            // Déjà en verre : garder rugosité / métal / opacité (ne pas forcer le preset).
            out = {
                ...out,
                glass: true,
                reflection: 0,
                opacity: typeof out.opacity === "number" ? out.opacity : FACE_GLASS_OPACITY,
            };
            if (typeof props.roughness === "number") out.roughness = props.roughness;
            if (typeof props.metalness === "number") out.metalness = props.metalness;
            if (typeof props.opacity === "number") out.opacity = props.opacity;
        }
        return out;
    }
    if (props.glass === false && out.glass) {
        const restore = prev.glassRestore || defaults;
        out = {
            roughness: typeof restore.roughness === "number" ? restore.roughness : defaults.roughness,
            metalness: typeof restore.metalness === "number" ? restore.metalness : defaults.metalness,
            opacity: typeof restore.opacity === "number" ? restore.opacity : defaults.opacity,
            reflection: typeof restore.reflection === "number" ? restore.reflection : defaults.reflection,
            glass: false,
        };
        delete prev.glassRestore;
        return out;
    }
    if (props.clearGlass && out.glass) {
        const restore = prev.glassRestore || defaults;
        out = {
            ...out,
            glass: false,
            opacity: typeof restore.opacity === "number" ? restore.opacity : defaults.opacity,
            // Restaurer aussi rugosité / métal du pré-verre, sauf si le curseur les fixe ensuite.
            roughness: typeof restore.roughness === "number" ? restore.roughness : out.roughness,
            metalness: typeof restore.metalness === "number" ? restore.metalness : out.metalness,
            reflection:
                typeof restore.reflection === "number" ? restore.reflection : out.reflection,
        };
        delete prev.glassRestore;
    }
    if (typeof props.reflection === "number") {
        const pbr = reflectionToPbr(props.reflection);
        out.reflection = props.reflection;
        out.metalness = pbr.metalness;
        out.roughness = pbr.roughness;
        out.envMapIntensity = pbr.envMapIntensity;
        out.glass = false;
        delete prev.glassRestore;
    }
    if (typeof props.roughness === "number") out.roughness = props.roughness;
    if (typeof props.metalness === "number") out.metalness = props.metalness;
    if (typeof props.opacity === "number") {
        out.opacity = props.opacity;
    }
    return out;
}

/**
 * Applique rugosité / métallique / opacité / verre / réflexion sur une face Architecture.
 * @param {THREE.Object3D} room
 * @param {string} surfaceId
 * @param {number} faceIndex
 * @param {{ roughness?: number, metalness?: number, opacity?: number, glass?: boolean, reflection?: number, metalPreset?: boolean, mirrorPreset?: boolean, clearGlass?: boolean }} props
 * @param {{ skipOpposite?: boolean }} [opts]
 * @returns {boolean}
 */
export function applyArchSurfaceMaterialProps(room, surfaceId, faceIndex, props, opts = {}) {
    if (!isLabArchitecture(room)) return false;
    const meshes = getArchSurfaceMeshes(room, surfaceId);
    if (!meshes.length) return false;
    if (!Number.isInteger(faceIndex) || faceIndex < 0 || faceIndex >= FACE_COUNT) return false;

    if (!room.userData[ARCH_SURFACE_TEX_KEY]) room.userData[ARCH_SURFACE_TEX_KEY] = {};
    const store = room.userData[ARCH_SURFACE_TEX_KEY];
    const key = archSurfaceFaceKey(surfaceId, faceIndex);
    const prev = store[key] || {};
    let nextProps = readMaterialPropsFromStore(prev, ARCH_MAT_DEFAULTS);
    nextProps = resolveMaterialPropsUpdate(nextProps, props || {}, prev, ARCH_MAT_DEFAULTS);

    for (const mesh of meshes) {
        ensurePaintReady(mesh);
        const materials = ensureFaceMaterials(mesh);
        if (!materials[faceIndex]) continue;
        const mat = applyMaterialPropsToSlot(mesh, faceIndex, nextProps);
        if (mat) {
            if (typeof props?.roughness === "number" || props?.metalPreset || props?.mirrorPreset || props?.glass) {
                if (mat.roughnessMap) mat.roughnessMap = null;
            }
            if (
                typeof props?.metalness === "number" ||
                typeof props?.reflection === "number" ||
                props?.metalPreset ||
                props?.mirrorPreset
            ) {
                if (mat.metalnessMap) mat.metalnessMap = null;
            }
        }
        syncMirrorOnBoxFace(mesh, faceIndex, nextProps.reflection || 0);
        syncMeshTranslucentRenderOrder(mesh);
    }

    store[key] = {
        ...prev,
        faceIndex,
        surfaceId,
        roughness: nextProps.roughness,
        metalness: nextProps.metalness,
        opacity: nextProps.opacity,
        glass: nextProps.glass,
        reflection: nextProps.reflection,
        glassRestore: prev.glassRestore || undefined,
    };

    // Mur = boîte mince : sans face opposée opaque/verre sync, l’autre côté reste faux.
    if (!opts.skipOpposite && shouldSyncOppositeFace(props, nextProps)) {
        const opp = oppositeBoxFaceIndex(faceIndex);
        const oppositeProps =
            props?.metalPreset || props?.mirrorPreset
                ? {
                      glass: false,
                      clearGlass: true,
                      metalness: nextProps.metalness,
                      roughness: nextProps.roughness,
                      opacity: 1,
                      reflection: nextProps.reflection,
                  }
                : props;
        applyArchSurfaceMaterialProps(room, surfaceId, opp, oppositeProps, {
            skipOpposite: true,
        });
    }
    return true;
}

/**
 * Applique le matériau sur une face cube / panneau (store PBR face).
 * @param {THREE.Object3D} object
 * @param {THREE.Mesh} mesh
 * @param {number} faceIndex
 * @param {{ roughness?: number, metalness?: number, opacity?: number, glass?: boolean, reflection?: number, metalPreset?: boolean, mirrorPreset?: boolean, clearGlass?: boolean }} props
 * @param {{ skipOpposite?: boolean }} [opts]
 * @returns {boolean}
 */
export function applyBoxFaceMaterialProps(object, mesh, faceIndex, props, opts = {}) {
    if (!object || !mesh) return false;
    if (!Number.isInteger(faceIndex) || faceIndex < 0 || faceIndex >= FACE_COUNT) return false;
    ensurePaintReady(mesh);
    const materials = ensureFaceMaterials(mesh);
    if (!materials[faceIndex]) return false;

    if (!object.userData[FACE_PBR_STORE_KEY]) object.userData[FACE_PBR_STORE_KEY] = {};
    const storeKey = `${mesh.uuid}:${faceIndex}`;
    const pbr = object.userData[FACE_PBR_STORE_KEY];
    const prev = pbr[storeKey] || {};
    let nextProps = readMaterialPropsFromStore(prev, FACE_MAT_DEFAULTS);
    if (typeof prev.roughness !== "number" && typeof prev.metalness !== "number") {
        nextProps = readMaterialPropsFromMat(materials[faceIndex], FACE_MAT_DEFAULTS);
    }
    nextProps = resolveMaterialPropsUpdate(nextProps, props || {}, prev, FACE_MAT_DEFAULTS);

    const mat = applyMaterialPropsToSlot(mesh, faceIndex, nextProps);
    if (!mat) return false;
    if (typeof props?.roughness === "number" || props?.metalPreset || props?.mirrorPreset || props?.glass) {
        if (mat.roughnessMap) mat.roughnessMap = null;
    }
    if (
        typeof props?.metalness === "number" ||
        typeof props?.reflection === "number" ||
        props?.metalPreset ||
        props?.mirrorPreset
    ) {
        if (mat.metalnessMap) mat.metalnessMap = null;
    }
    syncMirrorOnBoxFace(mesh, faceIndex, nextProps.reflection || 0);
    syncMeshTranslucentRenderOrder(mesh);
    pbr[storeKey] = {
        ...prev,
        roughness: nextProps.roughness,
        metalness: nextProps.metalness,
        opacity: nextProps.opacity,
        glass: nextProps.glass,
        reflection: nextProps.reflection,
        glassRestore: prev.glassRestore || undefined,
        roughnessMap: prev.roughnessMap || (prev.roughness?.isTexture ? prev.roughness : undefined),
    };

    if (!opts.skipOpposite && shouldSyncOppositeFace(props, nextProps)) {
        const opp = oppositeBoxFaceIndex(faceIndex);
        const oppositeProps =
            props?.metalPreset || props?.mirrorPreset
                ? {
                      glass: false,
                      clearGlass: true,
                      metalness: nextProps.metalness,
                      roughness: nextProps.roughness,
                      opacity: 1,
                      reflection: nextProps.reflection,
                  }
                : props;
        applyBoxFaceMaterialProps(object, mesh, opp, oppositeProps, {
            skipOpposite: true,
        });
    }
    return true;
}

/**
 * Clone le matériau du slot s’il est partagé entre plusieurs meshes (CAD Beetle…).
 * @param {THREE.Object3D} object
 * @param {THREE.Mesh} mesh
 * @param {number} materialIndex
 * @returns {{ mat: THREE.Material, index: number } | null}
 */
function ensureUniqueMeshMaterialSlot(object, mesh, materialIndex) {
    if (!object || !mesh) return null;
    const list = Array.isArray(mesh.material) ? mesh.material.slice() : mesh.material ? [mesh.material] : [];
    if (!list.length) return null;
    const idx = Number.isInteger(materialIndex)
        ? Math.max(0, Math.min(list.length - 1, materialIndex))
        : 0;
    let mat = list[idx];
    if (!mat) return null;

    let shared = false;
    object.traverse((child) => {
        if (shared || child === mesh || !(child instanceof THREE.Mesh)) return;
        const mats = Array.isArray(child.material) ? child.material : [child.material];
        if (mats.includes(mat)) shared = true;
    });
    if (shared) {
        const cloned = mat.clone();
        cloned.userData = { ...(mat.userData || {}), _labUniqueSlot: true };
        mat = cloned;
        list[idx] = mat;
        mesh.material = Array.isArray(mesh.material) ? list : mat;
    }
    return { mat, index: idx };
}

/**
 * UV planaires en mètres (comme les overlays △) pour carreler correctement les CAD.
 * @param {THREE.Mesh} mesh
 * @returns {boolean}
 */
function ensureLabPlanarUvsForMesh(mesh) {
    if (!mesh?.geometry?.attributes?.position) return false;
    if (!mesh.userData._labUvOwned) {
        mesh.geometry = mesh.geometry.clone();
        mesh.userData._labUvOwned = true;
    }
    const geo = mesh.geometry;
    const pos = geo.attributes.position;
    if (!geo.boundingBox) geo.computeBoundingBox();
    const bb = geo.boundingBox;
    if (!bb) return false;
    const sx = Math.max(1e-6, bb.max.x - bb.min.x);
    const sy = Math.max(1e-6, bb.max.y - bb.min.y);
    const sz = Math.max(1e-6, bb.max.z - bb.min.z);
    /** @type {"x"|"y"|"z"} */
    let uAxis;
    /** @type {"x"|"y"|"z"} */
    let vAxis;
    let u0;
    let v0;
    // Projeter sur les 2 plus grandes dimensions (UV ≈ mètres locaux).
    if (sx <= sy && sx <= sz) {
        uAxis = "z";
        vAxis = "y";
        u0 = bb.min.z;
        v0 = bb.min.y;
    } else if (sy <= sx && sy <= sz) {
        uAxis = "x";
        vAxis = "z";
        u0 = bb.min.x;
        v0 = bb.min.z;
    } else {
        uAxis = "x";
        vAxis = "y";
        u0 = bb.min.x;
        v0 = bb.min.y;
    }
    const uvs = new Float32Array(pos.count * 2);
    for (let i = 0; i < pos.count; i += 1) {
        const x = pos.getX(i);
        const y = pos.getY(i);
        const z = pos.getZ(i);
        const u = (uAxis === "x" ? x : uAxis === "y" ? y : z) - u0;
        const v = (vAxis === "x" ? x : vAxis === "y" ? y : z) - v0;
        uvs[i * 2] = u;
        uvs[i * 2 + 1] = v;
    }
    geo.setAttribute("uv", new THREE.BufferAttribute(uvs, 2));
    return true;
}

/**
 * Force un matériau pièce opaque (évite transparence CAD / verre collé).
 * @param {THREE.Material} mat
 */
function forceMeshSlotOpaque(mat) {
    if (!mat) return;
    if (typeof mat.transmission === "number") mat.transmission = 0;
    if ("thickness" in mat) mat.thickness = 0;
    mat.opacity = 1;
    mat.transparent = false;
    mat.depthWrite = true;
    mat.side = THREE.FrontSide;
    if ("alphaMap" in mat) mat.alphaMap = null;
    if (mat.userData) {
        delete mat.userData._labGlass;
        delete mat.userData._labPreGlassMaterial;
    }
    mat.needsUpdate = true;
}

/**
 * Teinte une pièce d’import (slot matériau) sans reconstruire 6 faces cube.
 * @param {THREE.Object3D} object
 * @param {THREE.Mesh} mesh
 * @param {number} materialIndex
 * @param {string} hex
 * @returns {boolean}
 */
export function applyMeshSlotColor(object, mesh, materialIndex, hex) {
    const slot = ensureUniqueMeshMaterialSlot(object, mesh, materialIndex);
    if (!slot?.mat?.color) return false;
    const color = new THREE.Color(hex || "#ffffff");
    slot.mat.color.copy(color);
    forceMeshSlotOpaque(slot.mat);
    if (!object.userData[FACE_PBR_STORE_KEY]) object.userData[FACE_PBR_STORE_KEY] = {};
    const storeKey = `${mesh.uuid}:${slot.index}`;
    const pbr = object.userData[FACE_PBR_STORE_KEY];
    pbr[storeKey] = {
        ...(pbr[storeKey] || {}),
        tintHex: color.getHexString(),
        opacity: 1,
        glass: false,
    };
    return true;
}

/**
 * Albedo (+ maps) sur une pièce d’import entière (un mesh / un slot matériau).
 * @param {THREE.Object3D} object
 * @param {THREE.Mesh} mesh
 * @param {number} materialIndex
 * @param {{ color?: string | null, normal?: string | null, specular?: string | null, roughness?: string | null }} maps
 * @param {number} [tileX]
 * @param {number} [tileY]
 * @param {number} [offsetX]
 * @param {number} [offsetY]
 * @returns {Promise<boolean>}
 */
export async function applyMeshSlotTextureMaps(
    object,
    mesh,
    materialIndex,
    maps,
    tileX = 1,
    tileY = 1,
    offsetX = 0,
    offsetY = 0
) {
    const slot = ensureUniqueMeshMaterialSlot(object, mesh, materialIndex);
    if (!slot?.mat) return false;
    let mat = slot.mat;
    if (!(mat instanceof THREE.MeshStandardMaterial) && !mat.isMeshStandardMaterial) {
        const prev = mat;
        mat = new THREE.MeshStandardMaterial({
            color: prev.color?.clone?.() || new THREE.Color(0xffffff),
            map: prev.map || null,
            normalMap: prev.normalMap || null,
            roughness: typeof prev.roughness === "number" ? prev.roughness : FACE_MAT_DEFAULTS.roughness,
            metalness: typeof prev.metalness === "number" ? prev.metalness : FACE_MAT_DEFAULTS.metalness,
            opacity: 1,
            transparent: false,
            depthWrite: true,
            side: prev.side ?? THREE.DoubleSide,
        });
        mat.userData._labUniqueSlot = true;
        const list = Array.isArray(mesh.material) ? mesh.material.slice() : [];
        if (list.length) {
            list[slot.index] = mat;
            mesh.material = list;
        } else {
            mesh.material = mat;
        }
    }

    // UV CAD souvent inutilisables pour le tile lab → projection planaire en mètres.
    ensureLabPlanarUvsForMesh(mesh);

    const tx = Math.max(0.1, tileX);
    const ty = Math.max(0.1, tileY);

    if (maps.color) {
        const img = await loadImageElement(maps.color);
        const colorTex = createFaceAlbedoTexture(img, tx, ty, offsetX, offsetY);
        if (mat.map && mat.map !== colorTex) {
            try {
                mat.map.dispose?.();
            } catch {
                /* ignore */
            }
        }
        mat.map = colorTex;
        mat.color.setHex(0xffffff);
        mat.userData[FACE_ALBEDO_MAP_KEY] = colorTex;
        colorTex.needsUpdate = true;
    }
    if (maps.normal) {
        const normalTex = await loadFaceMapTexture(maps.normal, "linear", tx, ty, offsetX, offsetY);
        mat.normalMap = normalTex;
        if (mat.normalScale) mat.normalScale.set(1, 1);
        mat.userData[FACE_NORMAL_MAP_KEY] = normalTex;
    }
    if (maps.specular) {
        const specularTex = await loadFaceMapTexture(maps.specular, "linear", tx, ty, offsetX, offsetY);
        mat.metalnessMap = specularTex;
        if (typeof mat.metalness !== "number" || mat.metalness < 0.2) mat.metalness = 1;
        mat.userData[FACE_SPECULAR_MAP_KEY] = specularTex;
    }
    if (maps.roughness) {
        const roughnessTex = await loadFaceMapTexture(maps.roughness, "linear", tx, ty, offsetX, offsetY);
        mat.roughnessMap = roughnessTex;
        mat.roughness = 1;
        mat.userData[FACE_ROUGHNESS_MAP_KEY] = roughnessTex;
    }

    mat.userData._labTileX = tx;
    mat.userData._labTileY = ty;
    mat.userData._labOffsetX = offsetX;
    mat.userData._labOffsetY = offsetY;
    forceMeshSlotOpaque(mat);

    if (!object.userData[FACE_PBR_STORE_KEY]) object.userData[FACE_PBR_STORE_KEY] = {};
    const storeKey = `${mesh.uuid}:${slot.index}`;
    const pbr = object.userData[FACE_PBR_STORE_KEY];
    pbr[storeKey] = {
        ...(pbr[storeKey] || {}),
        tileX: tx,
        tileY: ty,
        offsetX,
        offsetY,
        opacity: 1,
        glass: false,
        colorDataUrl: typeof maps.color === "string" ? maps.color : pbr[storeKey]?.colorDataUrl,
    };
    return true;
}

/**
 * Matériau sur un slot d’import / mesh multi-matériaux (sans forcer 6 faces cube).
 * Clone si le matériau est partagé (CAD type Beetle : 6 mats pour 59 meshes).
 * @param {THREE.Object3D} object
 * @param {THREE.Mesh} mesh
 * @param {number} materialIndex
 * @param {{ roughness?: number, metalness?: number, opacity?: number, glass?: boolean, reflection?: number, metalPreset?: boolean, mirrorPreset?: boolean, clearGlass?: boolean }} props
 * @returns {boolean}
 */
export function applyMeshSlotMaterialProps(object, mesh, materialIndex, props) {
    if (!object || !mesh) return false;
    const slot = ensureUniqueMeshMaterialSlot(object, mesh, materialIndex);
    if (!slot) return false;
    let mat = slot.mat;
    const idx = slot.index;

    if (!(mat instanceof THREE.MeshStandardMaterial) && !mat.isMeshStandardMaterial) {
        const prev = mat;
        mat = new THREE.MeshStandardMaterial({
            color: prev.color?.clone?.() || new THREE.Color(0xffffff),
            map: prev.map || null,
            normalMap: prev.normalMap || null,
            roughness: typeof prev.roughness === "number" ? prev.roughness : FACE_MAT_DEFAULTS.roughness,
            metalness: typeof prev.metalness === "number" ? prev.metalness : FACE_MAT_DEFAULTS.metalness,
            opacity: typeof prev.opacity === "number" ? prev.opacity : 1,
            transparent: false,
            depthWrite: true,
            side: prev.side ?? THREE.FrontSide,
        });
        mat.userData._labUniqueSlot = true;
        const list = Array.isArray(mesh.material) ? mesh.material.slice() : [];
        if (list.length) {
            list[idx] = mat;
            mesh.material = list;
        } else {
            mesh.material = mat;
        }
    }

    if (!object.userData[FACE_PBR_STORE_KEY]) object.userData[FACE_PBR_STORE_KEY] = {};
    const storeKey = `${mesh.uuid}:${idx}`;
    const pbr = object.userData[FACE_PBR_STORE_KEY];
    const prev = pbr[storeKey] || {};
    let nextProps = readMaterialPropsFromStore(prev, FACE_MAT_DEFAULTS);
    if (typeof prev.roughness !== "number" && typeof prev.metalness !== "number") {
        nextProps = readMaterialPropsFromMat(mat, FACE_MAT_DEFAULTS);
    }
    nextProps = resolveMaterialPropsUpdate(nextProps, props || {}, prev, FACE_MAT_DEFAULTS);

    // Si le verre est demandé, applyMaterialPropsToSlot remplace le matériau.
    mat = applyMaterialPropsToSlot(mesh, idx, nextProps) || mat;
    if (typeof props?.roughness === "number" || props?.metalPreset || props?.mirrorPreset || props?.glass) {
        if (mat.roughnessMap) mat.roughnessMap = null;
    }
    if (
        typeof props?.metalness === "number" ||
        typeof props?.reflection === "number" ||
        props?.metalPreset ||
        props?.mirrorPreset
    ) {
        if (mat.metalnessMap) mat.metalnessMap = null;
    }
    // Hors verre : ne pas laisser une opacité CAD collée.
    if (props?.glass !== true && !nextProps.glass) {
        if (typeof nextProps.opacity !== "number" || nextProps.opacity > 0.98) {
            forceMeshSlotOpaque(mat);
            nextProps.opacity = 1;
            nextProps.glass = false;
        }
    }
    syncMeshTranslucentRenderOrder(mesh);
    mat.needsUpdate = true;

    pbr[storeKey] = {
        ...prev,
        roughness: nextProps.roughness,
        metalness: nextProps.metalness,
        opacity: nextProps.opacity,
        glass: nextProps.glass,
        reflection: nextProps.reflection,
        glassRestore: prev.glassRestore || undefined,
    };
    return true;
}

/**
 * @param {THREE.Mesh[]} overlays
 * @param {{ roughness?: number, metalness?: number, opacity?: number, glass?: boolean, reflection?: number, metalPreset?: boolean, mirrorPreset?: boolean, clearGlass?: boolean }} props
 * @returns {boolean}
 */
export function applyTriangleOverlaysMaterial(overlays, props) {
    const list = (overlays || []).filter((o) => o?.parent && o.material);
    if (!list.length) return false;

    for (const overlay of list) {
        const mat = /** @type {THREE.MeshStandardMaterial} */ (overlay.material);
        const prev = {
            glassRestore: overlay.userData._labGlassRestore,
            glass: !!overlay.userData._labGlass,
        };
        let nextProps = {
            roughness:
                typeof overlay.userData._labRoughness === "number"
                    ? overlay.userData._labRoughness
                    : typeof mat.roughness === "number"
                      ? mat.roughness
                      : TRI_MAT_DEFAULTS.roughness,
            metalness:
                typeof overlay.userData._labMetalness === "number"
                    ? overlay.userData._labMetalness
                    : typeof mat.metalness === "number"
                      ? mat.metalness
                      : TRI_MAT_DEFAULTS.metalness,
            opacity:
                typeof overlay.userData._labOpacity === "number"
                    ? overlay.userData._labOpacity
                    : typeof mat.opacity === "number"
                      ? mat.opacity
                      : TRI_MAT_DEFAULTS.opacity,
            glass: !!overlay.userData._labGlass,
            reflection:
                typeof overlay.userData._labReflection === "number"
                    ? overlay.userData._labReflection
                    : TRI_MAT_DEFAULTS.reflection,
        };
        nextProps = resolveMaterialPropsUpdate(nextProps, props || {}, prev, TRI_MAT_DEFAULTS);
        if (prev.glassRestore) overlay.userData._labGlassRestore = prev.glassRestore;
        else delete overlay.userData._labGlassRestore;

        applyPropsToStandardMaterial(mat, nextProps, { alwaysTransparent: true });
        overlay.userData._labRoughness = nextProps.roughness;
        overlay.userData._labMetalness = nextProps.metalness;
        overlay.userData._labOpacity = nextProps.opacity;
        overlay.userData._labGlass = nextProps.glass;
        overlay.userData._labReflection = nextProps.reflection;
    }
    return true;
}

/**
 * Mode Face sur Architecture : texture continue sur UNE face du mur
 * (intérieur ou extérieur), tous les panneaux autour d’une porte / fenêtre.
 * Les autres faces du mur (dos, chant) restent intactes.
 * @param {THREE.Object3D} room
 * @param {string} surfaceId
 * @param {number} faceIndex face locale 0–5 (±X/Y/Z)
 * @param {{ color?: string | null, normal?: string | null, specular?: string | null }} maps
 * @param {number} tileX
 * @param {number} tileY
 * @param {number} offsetX
 * @param {number} offsetY
 * @returns {Promise<number>} nombre de panneaux texturés
 */
export async function applyArchSurfaceTextureMaps(
    room,
    surfaceId,
    faceIndex,
    maps,
    tileX = 1,
    tileY = 1,
    offsetX = 0,
    offsetY = 0
) {
    const meshes = getArchSurfaceMeshes(room, surfaceId);
    if (!meshes.length) return 0;
    if (!Number.isInteger(faceIndex) || faceIndex < 0 || faceIndex >= FACE_COUNT) return 0;

    /** @type {THREE.Texture | null} */
    let colorTex = null;
    /** @type {THREE.Texture | null} */
    let normalTex = null;
    /** @type {THREE.Texture | null} */
    let specularTex = null;

    if (maps.color) {
        const img = await loadImageElement(maps.color);
        colorTex = createFaceAlbedoTexture(img, tileX, tileY, offsetX, offsetY);
    }
    if (maps.normal) {
        normalTex = await loadFaceMapTexture(maps.normal, "linear", tileX, tileY, offsetX, offsetY);
    }
    if (maps.specular) {
        specularTex = await loadFaceMapTexture(maps.specular, "linear", tileX, tileY, offsetX, offsetY);
    }

    if (!room.userData[ARCH_SURFACE_TEX_KEY]) room.userData[ARCH_SURFACE_TEX_KEY] = {};
    /** @type {Record<string, { color?: THREE.Texture|null, normal?: THREE.Texture|null, specular?: THREE.Texture|null, faceIndex?: number, surfaceId?: string }>} */
    const store = room.userData[ARCH_SURFACE_TEX_KEY];
    // Ancien format (matériau unique sur tout le mur) → libérer.
    const legacy = store[surfaceId];
    if (legacy && typeof legacy === "object") {
        try {
            legacy.color?.dispose?.();
        } catch {
            /* ignore */
        }
        try {
            legacy.normal?.dispose?.();
        } catch {
            /* ignore */
        }
        try {
            legacy.specular?.dispose?.();
        } catch {
            /* ignore */
        }
        delete store[surfaceId];
    }
    const storeKey = archSurfaceFaceKey(surfaceId, faceIndex);
    const prev = store[storeKey] || {};

    if (maps.color && prev.color && prev.color !== colorTex) {
        try {
            prev.color.dispose?.();
        } catch {
            /* ignore */
        }
    }
    if (maps.normal && prev.normal && prev.normal !== normalTex) {
        try {
            prev.normal.dispose?.();
        } catch {
            /* ignore */
        }
    }
    if (maps.specular && prev.specular && prev.specular !== specularTex) {
        try {
            prev.specular.dispose?.();
        } catch {
            /* ignore */
        }
    }

    const finalColor = colorTex || prev.color || null;
    const finalNormal = normalTex || prev.normal || null;
    const finalSpecular = specularTex || prev.specular || null;

    // Ne retile que les maps créées dans cet appel — sinon empiler une
    // normale/spéculaire écraserait le tile de l’albedo déjà posée.
    const syncNewMapTile = (tex) => {
        if (!tex) return;
        tex.wrapS = THREE.RepeatWrapping;
        tex.wrapT = THREE.RepeatWrapping;
        tex.repeat.set(tileX, tileY);
        tex.offset.set(offsetX, offsetY);
        if (typeof tex.updateMatrix === "function") tex.updateMatrix();
        tex.needsUpdate = true;
    };
    if (colorTex) syncNewMapTile(colorTex);
    if (normalTex) syncNewMapTile(normalTex);
    if (specularTex) syncNewMapTile(specularTex);

    for (const mesh of meshes) {
        ensurePaintReady(mesh);
        prepareArchSurfaceMeshForTexture(mesh, surfaceId);
        const materials = ensureFaceMaterials(mesh);
        // Si le panneau avait un matériau unique texturé, le clone 6 faces
        // recopierait la map partout — ne garder que les faces déjà stockées.
        for (let i = 0; i < FACE_COUNT; i += 1) {
            if (i === faceIndex) continue;
            const other = materials[i];
            if (!other) continue;
            const kept = store[archSurfaceFaceKey(surfaceId, i)];
            const keepMap = kept?.color || null;
            if (keepMap && (other.map === keepMap || other.userData?.[FACE_ALBEDO_MAP_KEY] === keepMap)) {
                continue;
            }
            if (other.map || other.normalMap || other.metalnessMap || other.userData?.[FACE_ALBEDO_MAP_KEY]) {
                other.map = null;
                other.normalMap = null;
                other.metalnessMap = null;
                delete other.userData[FACE_ALBEDO_MAP_KEY];
                delete other.userData[FACE_NORMAL_MAP_KEY];
                delete other.userData[FACE_SPECULAR_MAP_KEY];
                other.needsUpdate = true;
            }
        }
        const oldMat = materials[faceIndex];
        if (!oldMat) continue;

        const tintHex = prev.tintHex ? `#${String(prev.tintHex).replace(/^#/, "")}` : null;
        const matProps = readMaterialPropsFromStore(prev, {
            roughness: typeof oldMat.roughness === "number" ? oldMat.roughness : ARCH_MAT_DEFAULTS.roughness,
            metalness: typeof oldMat.metalness === "number" ? oldMat.metalness : ARCH_MAT_DEFAULTS.metalness,
            opacity: typeof oldMat.opacity === "number" ? oldMat.opacity : ARCH_MAT_DEFAULTS.opacity,
            glass: !!prev.glass,
        });
        const next = new THREE.MeshStandardMaterial({
            color: tintHex || (finalColor ? 0xffffff : oldMat.color?.getHex?.() ?? 0xc8c2b4),
            roughness: matProps.roughness,
            metalness: finalSpecular
                ? Math.max(0.2, matProps.metalness)
                : matProps.metalness,
            side: THREE.FrontSide,
            map: finalColor,
            normalMap: finalNormal,
            metalnessMap: finalSpecular,
        });
        applyPropsToStandardMaterial(next, matProps);
        if (finalNormal && next.normalScale) next.normalScale.set(1, 1);
        if (finalColor) next.userData[FACE_ALBEDO_MAP_KEY] = finalColor;
        if (finalNormal) next.userData[FACE_NORMAL_MAP_KEY] = finalNormal;
        if (finalSpecular) next.userData[FACE_SPECULAR_MAP_KEY] = finalSpecular;

        detachPaintOverlay(oldMat);
        const prevAlbedo = oldMat.userData?.[FACE_ALBEDO_MAP_KEY];
        // Ne dispose pas les textures partagées du store (gérées ci-dessus).
        if (prevAlbedo && prevAlbedo !== finalColor && prevAlbedo !== prev.color) {
            try {
                prevAlbedo.dispose?.();
            } catch {
                /* ignore */
            }
        }
        try {
            oldMat.dispose?.();
        } catch {
            /* ignore */
        }

        materials[faceIndex] = next;
        mesh.material = materials.slice();
        next.needsUpdate = true;
        mesh.userData[ARCH_SURFACE_TEXTURED_KEY] = surfaceId;
    }

    store[storeKey] = {
        color: finalColor,
        normal: finalNormal,
        specular: finalSpecular,
        faceIndex,
        surfaceId,
        // Data URLs stables pour rebuild / save (évite toDataURL canvas tainted).
        colorDataUrl:
            (typeof maps.color === "string" && maps.color) || prev.colorDataUrl || null,
        normalDataUrl:
            (typeof maps.normal === "string" && maps.normal) || prev.normalDataUrl || null,
        specularDataUrl:
            (typeof maps.specular === "string" && maps.specular) || prev.specularDataUrl || null,
        tileX,
        tileY,
        offsetX,
        offsetY,
        tintHex: prev.tintHex || null,
        roughness: typeof prev.roughness === "number" ? prev.roughness : undefined,
        metalness: typeof prev.metalness === "number" ? prev.metalness : undefined,
        opacity: typeof prev.opacity === "number" ? prev.opacity : undefined,
        glass: !!prev.glass,
        glassRestore: prev.glassRestore || undefined,
    };

    return meshes.length;
}

/**
 * @param {THREE.Texture | null | undefined} texture
 * @returns {string | null}
 */
function textureImageToDataUrl(texture) {
    const image = texture?.image;
    if (!image) return null;
    if (typeof image.src === "string" && image.src.startsWith("data:")) return image.src;
    try {
        const w = image.width || image.videoWidth || 0;
        const h = image.height || image.videoHeight || 0;
        if (!(w > 0 && h > 0)) return null;
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        if (!ctx) return null;
        ctx.drawImage(/** @type {CanvasImageSource} */ (image), 0, 0);
        return canvas.toDataURL("image/png");
    } catch {
        return null;
    }
}

/**
 * Sérialise les textures Face posées sur une pièce Architecture (par mur + face).
 * @param {THREE.Object3D} room
 * @returns {Record<string, {
 *   color?: string | null,
 *   normal?: string | null,
 *   specular?: string | null,
 *   tileX?: number,
 *   tileY?: number,
 *   offsetX?: number,
 *   offsetY?: number,
 * }> | null}
 */
export function serializeArchSurfaceTextures(room) {
    if (!isLabArchitecture(room)) return null;
    const store = room.userData?.[ARCH_SURFACE_TEX_KEY];
    if (!store || typeof store !== "object") return null;

    /** @type {Record<string, { color?: string | null, normal?: string | null, specular?: string | null, tileX?: number, tileY?: number, offsetX?: number, offsetY?: number, roughness?: number, metalness?: number, opacity?: number, glass?: boolean }>} */
    const out = {};
    for (const [key, entry] of Object.entries(store)) {
        if (!entry || typeof entry !== "object") continue;
        // Ignorer l’ancien format sans face (« south ») — désormais « south:4 ».
        if (!String(key).includes(":")) continue;
        const color =
            (typeof entry.colorDataUrl === "string" && entry.colorDataUrl) ||
            textureImageToDataUrl(entry.color);
        const normal =
            (typeof entry.normalDataUrl === "string" && entry.normalDataUrl) ||
            textureImageToDataUrl(entry.normal);
        const specular =
            (typeof entry.specularDataUrl === "string" && entry.specularDataUrl) ||
            textureImageToDataUrl(entry.specular);
        const hasMaterial =
            typeof entry.roughness === "number" ||
            typeof entry.metalness === "number" ||
            typeof entry.opacity === "number" ||
            typeof entry.reflection === "number" ||
            !!entry.glass;
        if (!color && !normal && !specular && !hasMaterial) continue;
        const ref = entry.color || entry.normal || entry.specular;
        out[key] = {
            color: color || null,
            normal: normal || null,
            specular: specular || null,
            tileX:
                typeof entry.tileX === "number"
                    ? entry.tileX
                    : typeof ref?.repeat?.x === "number"
                      ? ref.repeat.x
                      : 1,
            tileY:
                typeof entry.tileY === "number"
                    ? entry.tileY
                    : typeof ref?.repeat?.y === "number"
                      ? ref.repeat.y
                      : 1,
            offsetX:
                typeof entry.offsetX === "number"
                    ? entry.offsetX
                    : typeof ref?.offset?.x === "number"
                      ? ref.offset.x
                      : 0,
            offsetY:
                typeof entry.offsetY === "number"
                    ? entry.offsetY
                    : typeof ref?.offset?.y === "number"
                      ? ref.offset.y
                      : 0,
            roughness: typeof entry.roughness === "number" ? entry.roughness : undefined,
            metalness: typeof entry.metalness === "number" ? entry.metalness : undefined,
            opacity: typeof entry.opacity === "number" ? entry.opacity : undefined,
            glass: !!entry.glass || undefined,
            reflection: typeof entry.reflection === "number" ? entry.reflection : undefined,
        };
    }
    return Object.keys(out).length ? out : null;
}

/**
 * Restaure les textures Face Architecture depuis un snapshot de scène.
 * @param {THREE.Object3D} room
 * @param {Record<string, {
 *   color?: string | null,
 *   normal?: string | null,
 *   specular?: string | null,
 *   tileX?: number,
 *   tileY?: number,
 *   offsetX?: number,
 *   offsetY?: number,
 * }> | null | undefined} data
 */
export async function applyArchSurfaceTexturesData(room, data) {
    if (!isLabArchitecture(room) || !data || typeof data !== "object") return;
    // Série : plusieurs faces d’une même surface ne doivent pas se clear entre elles.
    for (const [key, entry] of Object.entries(data)) {
        if (!entry || typeof entry !== "object") continue;
        const colon = String(key).lastIndexOf(":");
        if (colon < 0) continue;
        const surfaceId = String(key).slice(0, colon);
        const faceIndex = Number(String(key).slice(colon + 1));
        if (!surfaceId || !Number.isInteger(faceIndex)) continue;
        const hasMaps = !!(entry.color || entry.normal || entry.specular);
        const hasMaterial =
            typeof entry.roughness === "number" ||
            typeof entry.metalness === "number" ||
            typeof entry.opacity === "number" ||
            typeof entry.reflection === "number" ||
            !!entry.glass;
        if (!hasMaps && !hasMaterial) continue;
        if (hasMaps) {
            await applyArchSurfaceTextureMaps(
                room,
                surfaceId,
                faceIndex,
                {
                    color: entry.color || null,
                    normal: entry.normal || null,
                    specular: entry.specular || null,
                },
                typeof entry.tileX === "number" ? entry.tileX : 1,
                typeof entry.tileY === "number" ? entry.tileY : 1,
                typeof entry.offsetX === "number" ? entry.offsetX : 0,
                typeof entry.offsetY === "number" ? entry.offsetY : 0
            );
        }
        if (hasMaterial) {
            applyArchSurfaceMaterialProps(room, surfaceId, faceIndex, {
                roughness: typeof entry.roughness === "number" ? entry.roughness : undefined,
                metalness: typeof entry.metalness === "number" ? entry.metalness : undefined,
                opacity: typeof entry.opacity === "number" ? entry.opacity : undefined,
                reflection: typeof entry.reflection === "number" ? entry.reflection : undefined,
                glass: entry.glass === true ? true : entry.glass === false ? false : undefined,
            });
        }
    }
}

/**
 * Empile couleur / normal / spéculaire / roughness sur une face (conserve les maps absentes du drop).
 * @param {THREE.Object3D} object
 * @param {THREE.Mesh} mesh
 * @param {number} faceIndex
 * @param {{ color?: string | null, normal?: string | null, specular?: string | null, roughness?: string | null }} maps
 * @param {number} tileX
 * @param {number} tileY
 * @param {number} offsetX
 * @param {number} offsetY
 */
export async function applyFaceMapsToSurface(
    object,
    mesh,
    faceIndex,
    maps,
    tileX = 1,
    tileY = 1,
    offsetX = 0,
    offsetY = 0
) {
    ensurePaintReady(mesh);
    const materials = ensureFaceMaterials(mesh);
    const oldMat = materials[faceIndex];
    if (!oldMat) return;

    promoteFaceUv01ToMapChannel(mesh, faceIndex);

    if (!object.userData[FACE_PBR_STORE_KEY]) object.userData[FACE_PBR_STORE_KEY] = {};
    /** @type {Record<string, {
     *   colorDataUrl?: string|null,
     *   normalDataUrl?: string|null,
     *   specularDataUrl?: string|null,
     *   roughnessDataUrl?: string|null,
     *   color?: THREE.Texture|null,
     *   normal?: THREE.Texture|null,
     *   specular?: THREE.Texture|null,
     *   roughness?: THREE.Texture|null,
     * }>} */
    const store = object.userData[FACE_PBR_STORE_KEY];
    const storeKey = `${mesh.uuid}:${faceIndex}`;
    const prev = store[storeKey] || {};

    /** @type {THREE.Texture | null} */
    let colorTex = null;
    /** @type {THREE.Texture | null} */
    let normalTex = null;
    /** @type {THREE.Texture | null} */
    let specularTex = null;
    /** @type {THREE.Texture | null} */
    let roughnessTex = null;
    /** @type {string | null} */
    let albedoSnapshot = null;
    /** @type {string | null} */
    let colorDataUrl = prev.colorDataUrl || null;
    /** @type {string | null} */
    let normalDataUrl = prev.normalDataUrl || null;
    /** @type {string | null} */
    let specularDataUrl = prev.specularDataUrl || null;
    /** @type {string | null} */
    let roughnessDataUrl = prev.roughnessDataUrl || null;

    if (maps.color) {
        colorDataUrl = maps.color;
        const img = await loadImageElement(maps.color);
        colorTex = createFaceAlbedoTexture(img, tileX, tileY, offsetX, offsetY);
        const snap = document.createElement("canvas");
        snap.width = FACE_CANVAS_SIZE;
        snap.height = FACE_CANVAS_SIZE;
        const sctx = snap.getContext("2d");
        if (sctx) {
            sctx.drawImage(img, 0, 0, FACE_CANVAS_SIZE, FACE_CANVAS_SIZE);
            albedoSnapshot = snap.toDataURL("image/png");
        }
        if (prev.color && prev.color !== colorTex) {
            try {
                prev.color.dispose?.();
            } catch {
                /* ignore */
            }
        }
    } else if (prev.color && prev.color.image) {
        colorTex = prev.color;
    } else if (colorDataUrl) {
        const img = await loadImageElement(colorDataUrl);
        colorTex = createFaceAlbedoTexture(img, tileX, tileY, offsetX, offsetY);
    } else if (oldMat.userData?.[FACE_ALBEDO_MAP_KEY] || oldMat.map) {
        colorTex = /** @type {THREE.Texture} */ (
            oldMat.userData?.[FACE_ALBEDO_MAP_KEY] || oldMat.map
        );
    }

    if (maps.normal) {
        normalDataUrl = maps.normal;
        normalTex = await loadFaceMapTexture(maps.normal, "linear", tileX, tileY, offsetX, offsetY);
        if (prev.normal && prev.normal !== normalTex) {
            try {
                prev.normal.dispose?.();
            } catch {
                /* ignore */
            }
        }
    } else if (prev.normal && prev.normal.image) {
        normalTex = prev.normal;
    } else if (normalDataUrl) {
        normalTex = await loadFaceMapTexture(normalDataUrl, "linear", tileX, tileY, offsetX, offsetY);
    } else if (oldMat.userData?.[FACE_NORMAL_MAP_KEY] || oldMat.normalMap) {
        normalTex = /** @type {THREE.Texture} */ (
            oldMat.userData?.[FACE_NORMAL_MAP_KEY] || oldMat.normalMap
        );
    }

    if (maps.specular) {
        specularDataUrl = maps.specular;
        specularTex = await loadFaceMapTexture(maps.specular, "linear", tileX, tileY, offsetX, offsetY);
        if (prev.specular && prev.specular !== specularTex) {
            try {
                prev.specular.dispose?.();
            } catch {
                /* ignore */
            }
        }
    } else if (prev.specular && prev.specular.image) {
        specularTex = prev.specular;
    } else if (specularDataUrl) {
        specularTex = await loadFaceMapTexture(specularDataUrl, "linear", tileX, tileY, offsetX, offsetY);
    } else if (oldMat.userData?.[FACE_SPECULAR_MAP_KEY] || oldMat.metalnessMap) {
        specularTex = /** @type {THREE.Texture} */ (
            oldMat.userData?.[FACE_SPECULAR_MAP_KEY] || oldMat.metalnessMap
        );
    }

    if (maps.roughness) {
        roughnessDataUrl = maps.roughness;
        roughnessTex = await loadFaceMapTexture(maps.roughness, "linear", tileX, tileY, offsetX, offsetY);
        const prevRoughMap =
            prev.roughnessMap ||
            (prev.roughness && prev.roughness.isTexture ? prev.roughness : null);
        if (prevRoughMap && prevRoughMap !== roughnessTex) {
            try {
                prevRoughMap.dispose?.();
            } catch {
                /* ignore */
            }
        }
    } else if (prev.roughnessMap && prev.roughnessMap.image) {
        roughnessTex = prev.roughnessMap;
    } else if (prev.roughness && prev.roughness.isTexture && prev.roughness.image) {
        roughnessTex = prev.roughness;
    } else if (roughnessDataUrl) {
        roughnessTex = await loadFaceMapTexture(roughnessDataUrl, "linear", tileX, tileY, offsetX, offsetY);
    } else if (oldMat.userData?.[FACE_ROUGHNESS_MAP_KEY] || oldMat.roughnessMap) {
        roughnessTex = /** @type {THREE.Texture} */ (
            oldMat.userData?.[FACE_ROUGHNESS_MAP_KEY] || oldMat.roughnessMap
        );
    }

    // Conserver les scalaires (rugosité / réflexion…) : ne pas écraser avec la texture map.
    store[storeKey] = {
        ...prev,
        colorDataUrl,
        normalDataUrl,
        specularDataUrl,
        roughnessDataUrl,
        color: colorTex,
        normal: normalTex,
        specular: specularTex,
        roughnessMap: roughnessTex,
        roughness:
            typeof prev.roughness === "number"
                ? prev.roughness
                : !roughnessTex && typeof oldMat.roughness === "number"
                  ? oldMat.roughness
                  : undefined,
        metalness:
            typeof prev.metalness === "number"
                ? prev.metalness
                : typeof oldMat.metalness === "number"
                  ? oldMat.metalness
                  : undefined,
        opacity:
            typeof prev.opacity === "number"
                ? prev.opacity
                : typeof oldMat.opacity === "number"
                  ? oldMat.opacity
                  : undefined,
        glass: typeof prev.glass === "boolean" ? prev.glass : undefined,
        reflection:
            typeof prev.reflection === "number"
                ? prev.reflection
                : typeof oldMat.userData?._labReflection === "number"
                  ? oldMat.userData._labReflection
                  : undefined,
        glassRestore: prev.glassRestore || undefined,
    };

    // Nouvelle albedo → blanc (couleurs vraies). Empilement N/S/R → garder la teinte.
    const next = new THREE.MeshStandardMaterial({
        color: maps.color ? 0xffffff : oldMat.color?.getHex?.() ?? 0xffffff,
        roughness: roughnessTex
            ? 1
            : typeof oldMat.roughness === "number"
              ? oldMat.roughness
              : 0.65,
        metalness:
            specularTex
                ? Math.max(0.2, typeof oldMat.metalness === "number" ? oldMat.metalness : 1)
                : typeof oldMat.metalness === "number"
                  ? oldMat.metalness
                  : 0.05,
        side: oldMat.side ?? THREE.FrontSide,
        transparent: !!oldMat.transparent,
        opacity: typeof oldMat.opacity === "number" ? oldMat.opacity : 1,
        map: colorTex,
        normalMap: normalTex,
        metalnessMap: specularTex,
        roughnessMap: roughnessTex,
    });
    if (normalTex && next.normalScale) next.normalScale.set(1, 1);
    if (colorTex) next.userData[FACE_ALBEDO_MAP_KEY] = colorTex;
    if (normalTex) next.userData[FACE_NORMAL_MAP_KEY] = normalTex;
    if (specularTex) next.userData[FACE_SPECULAR_MAP_KEY] = specularTex;
    if (roughnessTex) next.userData[FACE_ROUGHNESS_MAP_KEY] = roughnessTex;

    // Libère l’ancien matériau / calque paint de cette face (pas les textures du store).
    detachPaintOverlay(oldMat);
    try {
        oldMat.dispose?.();
    } catch {
        /* ignore */
    }

    materials[faceIndex] = next;
    mesh.material = materials.slice();
    next.needsUpdate = true;
    if (colorTex) colorTex.needsUpdate = true;
    if (normalTex) normalTex.needsUpdate = true;
    if (specularTex) specularTex.needsUpdate = true;
    if (roughnessTex) roughnessTex.needsUpdate = true;

    // Vide / oublie le calque paint de cette face (ne surtout pas le réattacher).
    const paintStore = object.userData[FACE_PAINT_KEY];
    if (paintStore?.faces) {
        const key = facePaintLayerKey(mesh, faceIndex);
        const layer = lookupFacePaintLayer(object, mesh, faceIndex);
        if (layer) {
            if (albedoSnapshot) layer._faceAlbedoSnapshot = albedoSnapshot;
            try {
                layer.texture?.dispose?.();
            } catch {
                /* ignore */
            }
            delete paintStore.faces[key];
            if (paintStore.faces[faceIndex] === layer) delete paintStore.faces[faceIndex];
            if (paintStore.faces[String(faceIndex)] === layer) delete paintStore.faces[String(faceIndex)];
        }
    }

    forceFaceMapUvs01(mesh, faceIndex);
}

/**
 * @param {CanvasImageSource} image
 * @param {number} tileX
 * @param {number} tileY
 * @param {number} [offsetX]
 * @param {number} [offsetY]
 */
function createFaceAlbedoTexture(image, tileX, tileY, offsetX = 0, offsetY = 0) {
    // Texture directe (pas ClampToEdge sur canvas) : avec UV 0–1 la couleur
    // remplace vraiment ; le Clamp + UV mètres ne montrait que le bord de l’image
    // (d’où l’impression « seule la normale change »).
    const texture = new THREE.Texture(/** @type {HTMLImageElement} */ (image));
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(Math.max(0.1, tileX), Math.max(0.1, tileY));
    texture.offset.set(offsetX, offsetY);
    if ("colorSpace" in texture) texture.colorSpace = THREE.SRGBColorSpace;
    else texture.encoding = THREE.sRGBEncoding;
    if (typeof texture.updateMatrix === "function") texture.updateMatrix();
    texture.needsUpdate = true;
    return texture;
}

/**
 * Force UV 0–1 sur une face pour material.map (indépendant de uv2 / paint).
 * @param {THREE.Mesh} mesh
 * @param {number} faceIndex
 */
function forceFaceMapUvs01(mesh, faceIndex) {
    ensurePaintReady(mesh);
    const geo = mesh.geometry;
    const pos = geo?.attributes?.position;
    if (!pos) return;
    if (!geo.boundingBox) geo.computeBoundingBox();
    const bb = geo.boundingBox;
    if (!bb) return;

    let uv = geo.attributes.uv;
    if (!uv || uv.count !== pos.count) {
        uv = new THREE.BufferAttribute(new Float32Array(pos.count * 2), 2);
        geo.setAttribute("uv", uv);
    }

    const index = geo.index;
    const groups = geo.groups?.length
        ? geo.groups
        : [{ start: 0, count: index ? index.count : pos.count, materialIndex: 0 }];

    for (const g of groups) {
        if ((g.materialIndex ?? 0) !== faceIndex) continue;
        const end = g.start + g.count;
        for (let i = g.start; i < end; i++) {
            const vi = index ? index.getX(i) : i;
            const coords = boxFaceUv01(pos.getX(vi), pos.getY(vi), pos.getZ(vi), faceIndex, bb);
            uv.setXY(vi, coords.u, coords.v);
        }
    }
    uv.needsUpdate = true;
}

/**
 * Pose / remplace l’albedo d’une face (material.map), sans calque paint.
 * @param {THREE.Object3D} object
 * @param {THREE.Mesh} mesh
 * @param {number} faceIndex
 * @param {CanvasImageSource} image
 * @param {number} [tileX]
 * @param {number} [tileY]
 * @param {number} [offsetX]
 * @param {number} [offsetY]
 */
export function applyFaceAlbedoTexture(
    object,
    mesh,
    faceIndex,
    image,
    tileX = 1,
    tileY = 1,
    offsetX = 0,
    offsetY = 0
) {
    ensurePaintReady(mesh);
    const materials = ensureFaceMaterials(mesh);
    const oldMat = materials[faceIndex];
    if (!oldMat) return;

    promoteFaceUv01ToMapChannel(mesh, faceIndex);
    const colorTex = createFaceAlbedoTexture(image, tileX, tileY, offsetX, offsetY);

    const next = new THREE.MeshStandardMaterial({
        color: 0xffffff,
        roughness: typeof oldMat.roughness === "number" ? oldMat.roughness : 0.65,
        metalness: typeof oldMat.metalness === "number" ? oldMat.metalness : 0.05,
        side: oldMat.side ?? THREE.FrontSide,
        transparent: !!oldMat.transparent,
        opacity: typeof oldMat.opacity === "number" ? oldMat.opacity : 1,
        map: colorTex,
        normalMap: oldMat.userData?.[FACE_NORMAL_MAP_KEY] ? oldMat.normalMap : null,
        metalnessMap: oldMat.userData?.[FACE_SPECULAR_MAP_KEY] ? oldMat.metalnessMap : null,
    });
    next.userData[FACE_ALBEDO_MAP_KEY] = colorTex;
    if (oldMat.userData?.[FACE_NORMAL_MAP_KEY]) {
        next.userData[FACE_NORMAL_MAP_KEY] = oldMat.userData[FACE_NORMAL_MAP_KEY];
        if (next.normalScale) next.normalScale.set(1, 1);
    }
    if (oldMat.userData?.[FACE_SPECULAR_MAP_KEY]) {
        next.userData[FACE_SPECULAR_MAP_KEY] = oldMat.userData[FACE_SPECULAR_MAP_KEY];
    }
    if (oldMat.userData?.[FACE_ROUGHNESS_MAP_KEY]) {
        next.userData[FACE_ROUGHNESS_MAP_KEY] = oldMat.userData[FACE_ROUGHNESS_MAP_KEY];
        next.roughnessMap = oldMat.roughnessMap;
    }

    // Persiste l’albedo Face pour les drops suivants (normal / spec / rough).
    if (!object.userData[FACE_PBR_STORE_KEY]) object.userData[FACE_PBR_STORE_KEY] = {};
    const storeKey = `${mesh.uuid}:${faceIndex}`;
    const prevStore = object.userData[FACE_PBR_STORE_KEY][storeKey] || {};
    if (prevStore.color && prevStore.color !== colorTex) {
        try {
            prevStore.color.dispose?.();
        } catch {
            /* ignore */
        }
    }
    let colorDataUrl = null;
    try {
        const canvas = document.createElement("canvas");
        canvas.width = FACE_CANVAS_SIZE;
        canvas.height = FACE_CANVAS_SIZE;
        const ctx = canvas.getContext("2d");
        if (ctx) {
            ctx.drawImage(/** @type {CanvasImageSource} */ (image), 0, 0, FACE_CANVAS_SIZE, FACE_CANVAS_SIZE);
            colorDataUrl = canvas.toDataURL("image/png");
        }
    } catch {
        /* ignore */
    }
    object.userData[FACE_PBR_STORE_KEY][storeKey] = {
        ...prevStore,
        colorDataUrl: colorDataUrl || prevStore.colorDataUrl || null,
        color: colorTex,
        normal: next.userData[FACE_NORMAL_MAP_KEY] || prevStore.normal || null,
        specular: next.userData[FACE_SPECULAR_MAP_KEY] || prevStore.specular || null,
        roughness: next.userData[FACE_ROUGHNESS_MAP_KEY] || prevStore.roughness || null,
    };

    detachPaintOverlay(oldMat);
    const prevAlbedo = oldMat.userData?.[FACE_ALBEDO_MAP_KEY];
    if (prevAlbedo && prevAlbedo !== colorTex) {
        try {
            prevAlbedo.dispose?.();
        } catch {
            /* ignore */
        }
    }
    try {
        oldMat.dispose?.();
    } catch {
        /* ignore */
    }

    materials[faceIndex] = next;
    mesh.material = materials.slice();
    next.needsUpdate = true;
    if (colorTex) colorTex.needsUpdate = true;

    clearFacePaintCanvas(object, mesh, faceIndex);
    const layer = lookupFacePaintLayer(object, mesh, faceIndex);
    if (layer) {
        const snap = document.createElement("canvas");
        snap.width = FACE_CANVAS_SIZE;
        snap.height = FACE_CANVAS_SIZE;
        const sctx = snap.getContext("2d");
        if (sctx) {
            sctx.drawImage(/** @type {CanvasImageSource} */ (image), 0, 0, FACE_CANVAS_SIZE, FACE_CANVAS_SIZE);
            layer._faceAlbedoSnapshot = snap.toDataURL("image/png");
        }
    }
    forceFaceMapUvs01(mesh, faceIndex);
}

/**
 * Vide le calque paint d’une face (évite qu’un ancien dessin opaque masque la nouvelle map).
 * @param {THREE.Object3D} object
 * @param {THREE.Mesh} mesh
 * @param {number} faceIndex
 */
function clearFacePaintCanvas(object, mesh, faceIndex) {
    const layer = lookupFacePaintLayer(object, mesh, faceIndex);
    if (!layer?.ctx) return;
    layer.ctx.save();
    layer.ctx.setTransform(1, 0, 0, 1, 0, 0);
    layer.ctx.globalAlpha = 1;
    layer.ctx.globalCompositeOperation = "copy";
    layer.ctx.clearRect(0, 0, FACE_CANVAS_SIZE, FACE_CANVAS_SIZE);
    layer.ctx.restore();
    commitLayer(layer);
}

/**
 * @param {THREE.Object3D} object
 * @param {THREE.Mesh} mesh
 * @param {number} faceIndex
 */
function getFacePaintLayer(object, mesh, faceIndex) {
    const store = ensureFacePaintStore(object);
    const key = facePaintLayerKey(mesh, faceIndex);
    const existing = lookupFacePaintLayer(object, mesh, faceIndex);
    if (existing) {
        // Réattache si le matériau a été recréé / a perdu le shader.
        const materials = ensureFaceMaterials(mesh);
        const mat = materials[faceIndex];
        if (mat) {
            attachPaintOverlay(mat, existing.texture, paintUvChannelForMesh(mesh));
        }
        // Migre l’ancienne clé numérique vers la clé mesh+face.
        if (store.faces[faceIndex] === existing) delete store.faces[faceIndex];
        if (store.faces[String(faceIndex)] === existing) delete store.faces[String(faceIndex)];
        existing.meshUuid = mesh.uuid;
        existing.faceIndex = faceIndex;
        existing.meshName = mesh.name || existing.meshName || "";
        store.faces[key] = existing;
        return existing;
    }

    const canvas = document.createElement("canvas");
    canvas.width = FACE_CANVAS_SIZE;
    canvas.height = FACE_CANVAS_SIZE;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas 2D indisponible");
    ctx.clearRect(0, 0, FACE_CANVAS_SIZE, FACE_CANVAS_SIZE);

    const texture = new THREE.CanvasTexture(canvas);
    configureOverlayTexture(texture);

    const materials = ensureFaceMaterials(mesh);
    attachPaintOverlay(materials[faceIndex], texture, paintUvChannelForMesh(mesh));

    const layer = { canvas, ctx, texture, faceIndex, meshUuid: mesh.uuid, meshName: mesh.name || "" };
    store.faces[key] = layer;
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

    const channel = paintUvChannelForMesh(mesh);
    if (Array.isArray(mesh.material)) {
        let mat = mesh.material[resolvedMaterialIndex];
        if (!(mat instanceof THREE.MeshStandardMaterial)) {
            mat = toCompatibleStandardMaterial(mat || mesh.material[0]);
            mesh.material[resolvedMaterialIndex] = mat;
        }
        attachPaintOverlay(mat, texture, channel);
    } else if (mesh.material instanceof THREE.MeshStandardMaterial) {
        attachPaintOverlay(mesh.material, texture, channel);
    } else {
        mesh.material = toCompatibleStandardMaterial(mesh.material);
        attachPaintOverlay(mesh.material, texture, channel);
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
    if (!layer?.texture) return;
    layer.texture.needsUpdate = true;
}

/**
 * @param {THREE.Object3D} object
 * @param {THREE.Mesh} mesh
 * @param {number} faceOrMatIndex index face cube (0–5) ou materialIndex mesh
 */
function resolvePaintLayer(object, mesh, faceOrMatIndex) {
    if (isPaintableBoxMesh(mesh)) {
        return getFacePaintLayer(object, mesh, faceOrMatIndex);
    }
    return getMeshPaintLayer(object, mesh, faceOrMatIndex);
}

/**
 * Index de face boîte le plus fiable : plan le plus proche du point de hit.
 * (Sur un mur fin, materialIndex / normale peuvent viser la mauvaise face.)
 * @param {THREE.Mesh} mesh
 * @param {THREE.Intersection} hit
 */
function boxFaceIndexFromHit(mesh, hit) {
    const geo = mesh.geometry;
    if (!geo?.attributes?.position) return paintSurfaceIndexFromHit(mesh, hit);
    if (!geo.boundingBox) geo.computeBoundingBox();
    const bb = geo.boundingBox;
    if (!bb) return paintSurfaceIndexFromHit(mesh, hit);

    if (hit.point) {
        _paintLocal.copy(hit.point);
        mesh.worldToLocal(_paintLocal);
        const dists = [
            Math.abs(bb.max.x - _paintLocal.x),
            Math.abs(_paintLocal.x - bb.min.x),
            Math.abs(bb.max.y - _paintLocal.y),
            Math.abs(_paintLocal.y - bb.min.y),
            Math.abs(bb.max.z - _paintLocal.z),
            Math.abs(_paintLocal.z - bb.min.z),
        ];
        let best = 0;
        for (let i = 1; i < 6; i += 1) {
            if (dists[i] < dists[best]) best = i;
        }
        return best;
    }

    if (hit.face?.normal) {
        _paintNormal.copy(hit.face.normal).normalize();
        return dominantBoxFaceFromNormal(_paintNormal);
    }
    return paintSurfaceIndexFromHit(mesh, hit);
}

/**
 * Normale monde d’une face de boîte (0–5).
 * @param {THREE.Mesh} mesh
 * @param {number} faceIndex
 * @param {THREE.Vector3} [target]
 */
function boxFaceWorldNormal(mesh, faceIndex, target = new THREE.Vector3()) {
    target.set(
        faceIndex === 0 ? 1 : faceIndex === 1 ? -1 : 0,
        faceIndex === 2 ? 1 : faceIndex === 3 ? -1 : 0,
        faceIndex === 4 ? 1 : faceIndex === 5 ? -1 : 0
    );
    return target.transformDirection(mesh.matrixWorld).normalize();
}

/**
 * Face locale dont la normale monde est la plus alignée avec `worldNormal`.
 * @param {THREE.Mesh} mesh
 * @param {THREE.Vector3} worldNormal
 */
function boxFaceIndexFromWorldNormal(mesh, worldNormal) {
    mesh.updateWorldMatrix?.(true, false);
    let best = 0;
    let bestDot = -Infinity;
    const n = new THREE.Vector3();
    for (let i = 0; i < FACE_COUNT; i += 1) {
        boxFaceWorldNormal(mesh, i, n);
        const d = n.dot(worldNormal);
        if (d > bestDot) {
            bestDot = d;
            best = i;
        }
    }
    return best;
}

/**
 * @param {THREE.Mesh} mesh
 * @param {THREE.Intersection} hit
 */
function paintSurfaceIndexFromHit(mesh, hit) {
    if (isPaintableBoxMesh(mesh)) {
        // Priorité au group matériau (après prepareBoxMeshForFacePaint) —
        // la normale peut être biaisée sur les arrondis et peindre la mauvaise face.
        const mi = hit.face?.materialIndex;
        if (Number.isInteger(mi) && mi >= 0 && mi < FACE_COUNT) return mi;

        if (hit.faceIndex != null && mesh.geometry?.groups?.length === FACE_COUNT) {
            const triStart = hit.faceIndex * 3;
            for (const g of mesh.geometry.groups) {
                if (triStart >= g.start && triStart < g.start + g.count) {
                    const idx = g.materialIndex ?? 0;
                    if (idx >= 0 && idx < FACE_COUNT) return idx;
                }
            }
        }

        if (hit.face?.normal) {
            _paintNormal.copy(hit.face.normal).normalize();
            return dominantBoxFaceFromNormal(_paintNormal);
        }
        if (mesh.geometry instanceof THREE.BoxGeometry && hit.faceIndex != null) {
            return faceIndexFromHit(hit.faceIndex);
        }
        return faceIndexFromHit(hit.faceIndex ?? 0);
    }
    const matIndex = hit.face?.materialIndex;
    return Number.isInteger(matIndex) && matIndex >= 0 ? matIndex : 0;
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
    const layer = resolvePaintLayer(object, mesh, faceIndex);
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
    const layer = resolvePaintLayer(object, mesh, faceIndex);
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
    const layer = resolvePaintLayer(object, mesh, faceIndex);
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
    const layer = resolvePaintLayer(object, mesh, faceIndex);
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
    const layer = resolvePaintLayer(object, mesh, faceIndex);
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
    const layer = resolvePaintLayer(object, mesh, faceIndex);
    applyBrushStyle(layer, style, 1);
    layer.ctx.fillRect(0, 0, FACE_CANVAS_SIZE, FACE_CANVAS_SIZE);
    commitLayer(layer);
}

/**
 * @param {THREE.Object3D} object
 * @param {number} faceIndex
 * @param {THREE.Mesh | null} [mesh]
 * @returns {string | null}
 */
export function captureFaceSnapshot(object, faceIndex, mesh = null) {
    if (mesh && !isPaintableBoxMesh(mesh)) {
        const isMultiMat = Array.isArray(mesh.material);
        const key = `${mesh.uuid}:${isMultiMat ? faceIndex : "single"}`;
        const layer = object.userData[FACE_PAINT_KEY]?.meshLayers?.[key];
        if (!layer?.canvas) return null;
        return layer.canvas.toDataURL("image/png");
    }
    const target = mesh || getPaintableMesh(object);
    if (!target) return null;
    const layer = lookupFacePaintLayer(object, target, faceIndex);
    if (layer?._faceAlbedoSnapshot) return layer._faceAlbedoSnapshot;
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
    if (!store) return;

    if (!isPaintableBoxMesh(mesh)) {
        const isMultiMat = Array.isArray(mesh.material);
        const key = `${mesh.uuid}:${isMultiMat ? faceIndex : "single"}`;
        const layer = store.meshLayers?.[key];
        if (!layer) return;
        layer.texture?.dispose?.();
        delete store.meshLayers[key];
        if (Array.isArray(mesh.material)) {
            const mat = mesh.material[faceIndex];
            if (mat) detachPaintOverlay(mat);
        } else if (mesh.material) {
            detachPaintOverlay(mesh.material);
        }
        if (!Object.keys(store.faces || {}).length && !Object.keys(store.meshLayers || {}).length) {
            delete object.userData[FACE_PAINT_KEY];
        }
        return;
    }

    const key = facePaintLayerKey(mesh, faceIndex);
    const layer = lookupFacePaintLayer(object, mesh, faceIndex);
    if (!layer) return;

    layer.texture?.dispose?.();
    delete store.faces[key];
    if (store.faces[faceIndex] === layer) delete store.faces[faceIndex];
    if (store.faces[String(faceIndex)] === layer) delete store.faces[String(faceIndex)];

    const materials = ensureFaceMaterials(mesh);
    const mat = materials[faceIndex];
    if (mat) {
        const faceMap = mat.userData?.[FACE_ALBEDO_MAP_KEY];
        if (faceMap) {
            try {
                faceMap.dispose?.();
            } catch {
                /* ignore */
            }
            delete mat.userData[FACE_ALBEDO_MAP_KEY];
            if (mat.map === faceMap) mat.map = null;
        }
        if (mat.userData?.[FACE_NORMAL_MAP_KEY]) {
            try {
                mat.userData[FACE_NORMAL_MAP_KEY].dispose?.();
            } catch {
                /* ignore */
            }
            if (mat.normalMap === mat.userData[FACE_NORMAL_MAP_KEY]) mat.normalMap = null;
            delete mat.userData[FACE_NORMAL_MAP_KEY];
        }
        if (mat.userData?.[FACE_SPECULAR_MAP_KEY]) {
            try {
                mat.userData[FACE_SPECULAR_MAP_KEY].dispose?.();
            } catch {
                /* ignore */
            }
            if (mat.metalnessMap === mat.userData[FACE_SPECULAR_MAP_KEY]) mat.metalnessMap = null;
            delete mat.userData[FACE_SPECULAR_MAP_KEY];
        }
        detachPaintOverlay(mat);
    }

    if (!Object.keys(store.faces).length && !Object.keys(store.meshLayers || {}).length) {
        delete object.userData[FACE_PAINT_KEY];
    }
}

/**
 * @param {THREE.Object3D} object
 * @param {number} faceIndex
 * @param {string | null} dataUrl
 * @param {THREE.Mesh | null} [meshHint]
 * @returns {Promise<void>}
 */
export function restoreFaceSnapshot(object, faceIndex, dataUrl, meshHint = null) {
    const mesh = meshHint || getPaintableMesh(object);
    if (!mesh) return Promise.resolve();

    if (!dataUrl) {
        clearFacePaintLayer(object, mesh, faceIndex);
        return Promise.resolve();
    }

    return new Promise((resolve, reject) => {
        const image = new Image();
        image.onload = () => {
            applyFaceAlbedoTexture(object, mesh, faceIndex, image, 1, 1, 0, 0);
            resolve();
        };
        image.onerror = () => reject(new Error("Face paint invalide"));
        image.src = dataUrl;
    });
}

/**
 * @param {THREE.Object3D} object
 * @returns {{ faces: Record<string, string>, meshLayers: Record<string, string> } | null}
 */
/**
 * Retire tous les overlays texture triangles d’un objet.
 * @param {THREE.Object3D} object
 */
export function clearTriangleTextureOverlays(object) {
    /** @type {THREE.Mesh[]} */
    const toRemove = [];
    object?.traverse((child) => {
        if (!(child instanceof THREE.Mesh)) return;
        if (typeof child.name === "string" && child.name.startsWith(TRI_TEXTURE_OVERLAY_PREFIX)) {
            toRemove.push(child);
        }
    });
    for (const overlay of toRemove) {
        overlay.parent?.remove(overlay);
        overlay.geometry?.dispose?.();
        const mat = overlay.material;
        if (Array.isArray(mat)) {
            mat.forEach((m) => {
                try {
                    m?.map?.dispose?.();
                } catch {
                    /* ignore */
                }
                m?.dispose?.();
            });
        } else if (mat) {
            try {
                mat.map?.dispose?.();
            } catch {
                /* ignore */
            }
            mat.dispose?.();
        }
    }
}

/**
 * Sérialise les overlays texture posés en mode Triangles.
 * @param {THREE.Object3D} object
 * @returns {Array<{
 *   meshName: string,
 *   positions: number[],
 *   uvs: number[],
 *   textureDataUrl: string,
 *   tileX: number,
 *   tileY: number,
 *   offsetX: number,
 *   offsetY: number,
 *   tileZ?: number,
 *   offsetZ?: number,
 * }> | null}
 */
export function serializeTriangleTextures(object) {
    if (!object) return null;
    /** @type {Array<{ meshName: string, positions: number[], uvs: number[], textureDataUrl: string, tileX: number, tileY: number, offsetX: number, offsetY: number, tileZ?: number, offsetZ?: number, roughness?: number, metalness?: number, opacity?: number, glass?: boolean }>} */
    const out = [];
    object.traverse((node) => {
        if (!(node instanceof THREE.Mesh)) return;
        if (typeof node.name !== "string" || !node.name.startsWith(TRI_TEXTURE_OVERLAY_PREFIX)) return;
        const parent = node.parent;
        if (!(parent instanceof THREE.Mesh)) return;
        const pos = node.geometry?.attributes?.position;
        const uv = node.geometry?.attributes?.uv;
        if (!pos || !uv) return;
        const map = /** @type {THREE.MeshStandardMaterial} */ (node.material)?.map;
        const textureDataUrl = textureImageToDataUrl(map);
        if (!textureDataUrl) return;
        const mat = /** @type {THREE.MeshStandardMaterial} */ (node.material);
        out.push({
            meshName: String(parent.name || ""),
            positions: Array.from(pos.array),
            uvs: Array.from(uv.array),
            textureDataUrl,
            tileX: typeof node.userData._labTileX === "number" ? node.userData._labTileX : map.repeat?.x ?? 1,
            tileY: typeof node.userData._labTileY === "number" ? node.userData._labTileY : map.repeat?.y ?? 1,
            offsetX:
                typeof node.userData._labOffsetX === "number" ? node.userData._labOffsetX : map.offset?.x ?? 0,
            offsetY:
                typeof node.userData._labOffsetY === "number" ? node.userData._labOffsetY : map.offset?.y ?? 0,
            tileZ: typeof node.userData._labTileZ === "number" ? node.userData._labTileZ : 1,
            offsetZ: typeof node.userData._labOffsetZ === "number" ? node.userData._labOffsetZ : 0,
            roughness:
                typeof node.userData._labRoughness === "number"
                    ? node.userData._labRoughness
                    : typeof mat?.roughness === "number"
                      ? mat.roughness
                      : TRI_MAT_DEFAULTS.roughness,
            metalness:
                typeof node.userData._labMetalness === "number"
                    ? node.userData._labMetalness
                    : typeof mat?.metalness === "number"
                      ? mat.metalness
                      : TRI_MAT_DEFAULTS.metalness,
            opacity:
                typeof node.userData._labOpacity === "number"
                    ? node.userData._labOpacity
                    : typeof mat?.opacity === "number"
                      ? mat.opacity
                      : TRI_MAT_DEFAULTS.opacity,
            glass: !!node.userData._labGlass || undefined,
            reflection:
                typeof node.userData._labReflection === "number"
                    ? node.userData._labReflection
                    : typeof mat?.userData?._labReflection === "number"
                      ? mat.userData._labReflection
                      : undefined,
        });
    });
    return out.length ? out : null;
}

/**
 * Restaure les overlays texture triangles depuis un snapshot.
 * @param {THREE.Object3D} object
 * @param {unknown} data
 */
export async function applyTriangleTexturesData(object, data) {
    if (!object || !Array.isArray(data) || !data.length) return;
    clearTriangleTextureOverlays(object);

    /** @type {THREE.Mesh[]} */
    const contentMeshes = [];
    object.traverse((child) => {
        if (!(child instanceof THREE.Mesh)) return;
        if (child.name === "shadow-overlay") return;
        if (typeof child.name === "string" && child.name.startsWith(TRI_TEXTURE_OVERLAY_PREFIX)) return;
        if (child.userData?._labNoPaintPick) return;
        contentMeshes.push(child);
    });

    for (const entry of data) {
        if (!entry || typeof entry !== "object") continue;
        const e = /** @type {Record<string, unknown>} */ (entry);
        if (typeof e.textureDataUrl !== "string" || !e.textureDataUrl) continue;
        if (!Array.isArray(e.positions) || !Array.isArray(e.uvs)) continue;
        if (e.positions.length < 9 || e.uvs.length < 6) continue;

        /** @type {THREE.Mesh | null} */
        let mesh = null;
        const meshName = typeof e.meshName === "string" ? e.meshName : "";
        if (meshName) {
            mesh = contentMeshes.find((m) => m.name === meshName) || null;
        }
        // Pas de fallback sur meshes[0] : sinon overlays flottants après rebuild.
        if (!mesh) continue;

        const image = await loadImageElement(e.textureDataUrl);
        const tileX = typeof e.tileX === "number" ? e.tileX : 1;
        const tileY = typeof e.tileY === "number" ? e.tileY : 1;
        const offsetX = typeof e.offsetX === "number" ? e.offsetX : 0;
        const offsetY = typeof e.offsetY === "number" ? e.offsetY : 0;
        const tileZ = typeof e.tileZ === "number" ? e.tileZ : 1;
        const offsetZ = typeof e.offsetZ === "number" ? e.offsetZ : 0;
        const roughness =
            typeof e.roughness === "number" ? e.roughness : TRI_MAT_DEFAULTS.roughness;
        const metalness =
            typeof e.metalness === "number" ? e.metalness : TRI_MAT_DEFAULTS.metalness;
        const opacity = typeof e.opacity === "number" ? e.opacity : TRI_MAT_DEFAULTS.opacity;
        const glass = !!e.glass;
        const reflection =
            typeof e.reflection === "number" ? e.reflection : TRI_MAT_DEFAULTS.reflection;

        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute(
            "position",
            new THREE.Float32BufferAttribute(/** @type {number[]} */ (e.positions), 3)
        );
        geometry.setAttribute("uv", new THREE.Float32BufferAttribute(/** @type {number[]} */ (e.uvs), 2));
        geometry.computeVertexNormals();

        const texture = new THREE.Texture(image);
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.RepeatWrapping;
        const zScale = Math.max(0.1, tileZ);
        texture.repeat.set(tileX * (Math.abs(zScale - 1) > 1e-4 ? zScale : 1), tileY);
        texture.offset.set(offsetX + offsetZ, offsetY);
        if ("colorSpace" in texture) texture.colorSpace = THREE.SRGBColorSpace;
        else texture.encoding = THREE.sRGBEncoding;
        if (typeof texture.updateMatrix === "function") texture.updateMatrix();
        texture.needsUpdate = true;

        const mat = new THREE.MeshStandardMaterial({
            color: 0xffffff,
            map: texture,
            roughness,
            metalness,
            transparent: true,
            opacity,
            side: THREE.DoubleSide,
            depthWrite: false,
            polygonOffset: true,
            polygonOffsetFactor: -2,
            polygonOffsetUnits: -2,
        });
        applyPropsToStandardMaterial(
            mat,
            { roughness, metalness, opacity, glass, reflection },
            { alwaysTransparent: true }
        );

        const overlay = new THREE.Mesh(geometry, mat);
        overlay.name = `${TRI_TEXTURE_OVERLAY_PREFIX}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        overlay.userData._labNoPaintPick = true;
        overlay.userData._labTileX = tileX;
        overlay.userData._labTileY = tileY;
        overlay.userData._labTileZ = tileZ;
        overlay.userData._labOffsetX = offsetX;
        overlay.userData._labOffsetY = offsetY;
        overlay.userData._labOffsetZ = offsetZ;
        overlay.userData._labRoughness = roughness;
        overlay.userData._labMetalness = metalness;
        overlay.userData._labOpacity = opacity;
        overlay.userData._labGlass = glass;
        overlay.userData._labReflection = reflection;
        overlay.renderOrder = 9800;
        mesh.add(overlay);
    }
}

export function serializeFacePaint(object) {
    const store = object.userData[FACE_PAINT_KEY];
    if (!store) return null;

    /** @type {Record<string, string>} */
    const faces = {};
    for (const [key, layer] of Object.entries(store.faces || {})) {
        if (!layer?.canvas) continue;
        const faceIndex =
            typeof layer.faceIndex === "number"
                ? layer.faceIndex
                : Number(String(key).includes(":") ? key.slice(key.lastIndexOf(":") + 1) : key);
        if (!Number.isFinite(faceIndex)) continue;
        // Préfixe nom mesh pour les pièces multi-panneaux ; sinon index seul (cube).
        const meshName = layer.meshName || "";
        const outKey = meshName ? `${meshName}::${faceIndex}` : String(faceIndex);
        faces[outKey] = layer._faceAlbedoSnapshot || layer.canvas.toDataURL("image/png");
    }

    /** @type {Record<string, string>} */
    const meshLayers = {};
    for (const [key, layer] of Object.entries(store.meshLayers || {})) {
        if (!layer?.canvas) continue;
        // Clé stable hors uuid mesh (change au clone) : index matériau ou "single".
        const matKey = key.includes(":") ? key.slice(key.lastIndexOf(":") + 1) : key;
        meshLayers[matKey] = layer.canvas.toDataURL("image/png");
    }

    if (!Object.keys(faces).length && !Object.keys(meshLayers).length) return null;
    return { faces, meshLayers };
}

/**
 * Résout un mesh par id stable, nom ou index DFS.
 * @param {THREE.Object3D} object
 * @param {{ persistId?: number | null, meshUuid?: string, meshName?: string, meshIndex?: number | null }} ref
 * @returns {THREE.Mesh | null}
 */
function findPersistMesh(object, ref) {
    /** @type {THREE.Mesh[]} */
    const meshes = [];
    object.traverse((child) => {
        if (!(child instanceof THREE.Mesh)) return;
        if (child.userData?._labNoPaintPick) return;
        if (typeof child.name === "string" && child.name.startsWith(TRI_TEXTURE_OVERLAY_PREFIX)) return;
        meshes.push(child);
    });
    if (typeof ref.persistId === "number") {
        const found = meshes.find((m) => m.userData?.[LAB_MESH_PERSIST_ID_KEY] === ref.persistId);
        if (found) return found;
    }
    if (ref.meshUuid) {
        const found = meshes.find((m) => m.uuid === ref.meshUuid);
        if (found) return found;
    }
    if (ref.meshName) {
        const found = meshes.find((m) => m.name === ref.meshName);
        if (found) return found;
    }
    if (typeof ref.meshIndex === "number" && ref.meshIndex >= 0 && ref.meshIndex < meshes.length) {
        return meshes[ref.meshIndex];
    }
    return null;
}

/**
 * Sérialise le store PBR (cubes 6 faces OU slots multi-mesh d’import).
 * Clés stables imports : `m{persistId}::{slot}`.
 * @param {THREE.Object3D} object
 * @returns {Record<string, object> | null}
 */
export function serializeFacePbrStore(object) {
    if (!object || isLabArchitecture(object)) return null;
    const store = object.userData?.[FACE_PBR_STORE_KEY];
    if (!store || typeof store !== "object") return null;

    const isImported =
        !!object.userData?.[LAB_IMPORTED_KEY] || object.userData?.labShape === "imported";

    /** @type {THREE.Mesh[]} */
    const meshes = [];
    object.traverse((child) => {
        if (!(child instanceof THREE.Mesh)) return;
        if (child.userData?._labNoPaintPick) return;
        if (typeof child.name === "string" && child.name.startsWith(TRI_TEXTURE_OVERLAY_PREFIX)) return;
        meshes.push(child);
    });

    /** @type {Record<string, object>} */
    const out = {};
    for (const [uuidKey, entry] of Object.entries(store)) {
        if (!entry || typeof entry !== "object") continue;
        const colon = String(uuidKey).lastIndexOf(":");
        if (colon < 0) continue;
        const meshUuid = String(uuidKey).slice(0, colon);
        const slotIndex = Number(String(uuidKey).slice(colon + 1));
        if (!Number.isInteger(slotIndex) || slotIndex < 0) continue;
        if (!isImported && slotIndex >= FACE_COUNT) continue;

        const mesh = meshes.find((m) => m.uuid === meshUuid) || null;
        const materials = mesh
            ? Array.isArray(mesh.material)
                ? mesh.material
                : mesh.material
                  ? [mesh.material]
                  : []
            : [];
        const mat = /** @type {THREE.MeshStandardMaterial | undefined} */ (materials[slotIndex]);

        const color =
            (typeof entry.colorDataUrl === "string" && entry.colorDataUrl) ||
            textureImageToDataUrl(entry.color) ||
            textureImageToDataUrl(mat?.userData?.[FACE_ALBEDO_MAP_KEY]) ||
            textureImageToDataUrl(mat?.map);
        const normal =
            (typeof entry.normalDataUrl === "string" && entry.normalDataUrl) ||
            textureImageToDataUrl(entry.normal) ||
            textureImageToDataUrl(mat?.userData?.[FACE_NORMAL_MAP_KEY]) ||
            textureImageToDataUrl(mat?.normalMap);
        const specular =
            (typeof entry.specularDataUrl === "string" && entry.specularDataUrl) ||
            textureImageToDataUrl(entry.specular) ||
            textureImageToDataUrl(mat?.userData?.[FACE_SPECULAR_MAP_KEY]) ||
            textureImageToDataUrl(mat?.metalnessMap);
        const roughnessMapTex =
            entry.roughnessMap ||
            (entry.roughness && entry.roughness.isTexture ? entry.roughness : null) ||
            mat?.userData?.[FACE_ROUGHNESS_MAP_KEY] ||
            mat?.roughnessMap ||
            null;
        const roughnessMap =
            (typeof entry.roughnessDataUrl === "string" && entry.roughnessDataUrl) ||
            textureImageToDataUrl(roughnessMapTex);

        const roughness =
            typeof entry.roughness === "number"
                ? entry.roughness
                : typeof mat?.roughness === "number"
                  ? mat.roughness
                  : undefined;
        const metalness =
            typeof entry.metalness === "number"
                ? entry.metalness
                : typeof mat?.metalness === "number"
                  ? mat.metalness
                  : undefined;
        const opacity =
            typeof entry.opacity === "number"
                ? entry.opacity
                : typeof mat?.opacity === "number"
                  ? mat.opacity
                  : undefined;
        const reflection =
            typeof entry.reflection === "number"
                ? entry.reflection
                : typeof mat?.userData?._labReflection === "number"
                  ? mat.userData._labReflection
                  : undefined;
        const glass = !!(entry.glass || mat?.userData?._labGlass) || undefined;
        const tintHex = typeof entry.tintHex === "string" && entry.tintHex ? entry.tintHex : null;

        const hasMaps = !!(color || normal || specular || roughnessMap);
        const hasMaterial =
            typeof entry.roughness === "number" ||
            typeof entry.metalness === "number" ||
            typeof entry.opacity === "number" ||
            typeof entry.reflection === "number" ||
            !!entry.glass ||
            !!glass ||
            typeof entry.tintHex === "string";
        if (!hasMaps && !hasMaterial) continue;

        const persistId =
            typeof mesh?.userData?.[LAB_MESH_PERSIST_ID_KEY] === "number"
                ? mesh.userData[LAB_MESH_PERSIST_ID_KEY]
                : typeof entry.meshId === "number"
                  ? entry.meshId
                  : null;
        const meshName = mesh?.name || "";
        let outKey;
        if (typeof persistId === "number") {
            outKey = `m${persistId}::${slotIndex}`;
        } else if (meshName) {
            outKey = `${meshName}::${slotIndex}`;
        } else {
            outKey = String(slotIndex);
        }

        const ref = entry.color || entry.normal || entry.specular || roughnessMapTex;
        out[outKey] = {
            color: color || null,
            normal: normal || null,
            specular: specular || null,
            roughnessMap: roughnessMap || null,
            tileX:
                typeof entry.tileX === "number"
                    ? entry.tileX
                    : typeof ref?.repeat?.x === "number"
                      ? ref.repeat.x
                      : 1,
            tileY:
                typeof entry.tileY === "number"
                    ? entry.tileY
                    : typeof ref?.repeat?.y === "number"
                      ? ref.repeat.y
                      : 1,
            offsetX:
                typeof entry.offsetX === "number"
                    ? entry.offsetX
                    : typeof ref?.offset?.x === "number"
                      ? ref.offset.x
                      : 0,
            offsetY:
                typeof entry.offsetY === "number"
                    ? entry.offsetY
                    : typeof ref?.offset?.y === "number"
                      ? ref.offset.y
                      : 0,
            roughness: typeof roughness === "number" ? roughness : undefined,
            metalness: typeof metalness === "number" ? metalness : undefined,
            opacity: typeof opacity === "number" ? opacity : undefined,
            glass,
            reflection: typeof reflection === "number" ? reflection : undefined,
            tintHex: tintHex || undefined,
            glassRestore: entry.glassRestore || undefined,
            meshId: typeof persistId === "number" ? persistId : undefined,
            slot: slotIndex,
        };
    }
    return Object.keys(out).length ? out : null;
}

/**
 * Restaure PBR / teintes / verre par face cube ou slot d’import multi-mesh.
 * @param {THREE.Object3D} object
 * @param {Record<string, object> | null | undefined} data
 */
export async function applyFacePbrStoreData(object, data) {
    if (!object || !data || typeof data !== "object") return;
    if (isLabArchitecture(object)) return;

    const isImported =
        !!object.userData?.[LAB_IMPORTED_KEY] || object.userData?.labShape === "imported";

    for (const [key, entry] of Object.entries(data)) {
        if (!entry || typeof entry !== "object") continue;

        let persistId = typeof entry.meshId === "number" ? entry.meshId : null;
        let meshName = "";
        let slotIndex =
            typeof entry.slot === "number"
                ? entry.slot
                : Number.isInteger(Number(key))
                  ? Number(key)
                  : NaN;

        if (String(key).startsWith("m") && String(key).includes("::")) {
            const split = String(key).split("::");
            const idPart = split[0].slice(1);
            if (Number.isInteger(Number(idPart))) persistId = Number(idPart);
            slotIndex = Number(split[1]);
        } else if (String(key).includes("::")) {
            const split = String(key).split("::");
            meshName = split[0];
            slotIndex = Number(split[1]);
        } else if (String(key).includes(":") && !Number.isFinite(Number(key))) {
            slotIndex = Number(String(key).slice(String(key).lastIndexOf(":") + 1));
        }

        if (!Number.isInteger(slotIndex) || slotIndex < 0) continue;

        /** @type {THREE.Mesh | null} */
        let mesh = findPersistMesh(object, {
            persistId,
            meshName: meshName || undefined,
            meshIndex: typeof persistId === "number" ? persistId : null,
        });
        if (!mesh && meshName) {
            object.traverse((child) => {
                if (mesh) return;
                if (child instanceof THREE.Mesh && child.name === meshName) mesh = child;
            });
        }
        if (!mesh) mesh = getPaintableMesh(object);
        if (!mesh) continue;

        const useMeshSlot =
            isImported || !isPaintableBoxMesh(mesh) || slotIndex >= FACE_COUNT;

        const hasMaps = !!(entry.color || entry.normal || entry.specular || entry.roughnessMap);
        const hasMaterial =
            typeof entry.roughness === "number" ||
            typeof entry.metalness === "number" ||
            typeof entry.opacity === "number" ||
            typeof entry.reflection === "number" ||
            "glass" in entry ||
            !!entry.glass;
        const hasTint = typeof entry.tintHex === "string" && entry.tintHex.length > 0;
        if (!hasMaps && !hasMaterial && !hasTint) continue;

        if (useMeshSlot) {
            if (hasTint) {
                applyMeshSlotColor(
                    object,
                    mesh,
                    slotIndex,
                    `#${String(entry.tintHex).replace(/^#/, "")}`
                );
            }
            if (hasMaps) {
                await applyMeshSlotTextureMaps(
                    object,
                    mesh,
                    slotIndex,
                    {
                        color: entry.color || null,
                        normal: entry.normal || null,
                        specular: entry.specular || null,
                        roughness: entry.roughnessMap || null,
                    },
                    typeof entry.tileX === "number" ? entry.tileX : 1,
                    typeof entry.tileY === "number" ? entry.tileY : 1,
                    typeof entry.offsetX === "number" ? entry.offsetX : 0,
                    typeof entry.offsetY === "number" ? entry.offsetY : 0
                );
            }
            if (hasMaterial) {
                if (entry.glassRestore && typeof entry.glassRestore === "object") {
                    if (!object.userData[FACE_PBR_STORE_KEY]) object.userData[FACE_PBR_STORE_KEY] = {};
                    const sk = `${mesh.uuid}:${slotIndex}`;
                    object.userData[FACE_PBR_STORE_KEY][sk] = {
                        ...(object.userData[FACE_PBR_STORE_KEY][sk] || {}),
                        glassRestore: entry.glassRestore,
                    };
                }
                applyMeshSlotMaterialProps(object, mesh, slotIndex, {
                    roughness: typeof entry.roughness === "number" ? entry.roughness : undefined,
                    metalness: typeof entry.metalness === "number" ? entry.metalness : undefined,
                    opacity: typeof entry.opacity === "number" ? entry.opacity : undefined,
                    glass: entry.glass === true ? true : entry.glass === false ? false : undefined,
                    reflection: typeof entry.reflection === "number" ? entry.reflection : undefined,
                });
            }
            continue;
        }

        if (slotIndex >= FACE_COUNT) continue;

        if (hasMaps) {
            await applyFaceMapsToSurface(
                object,
                mesh,
                slotIndex,
                {
                    color: entry.color || null,
                    normal: entry.normal || null,
                    specular: entry.specular || null,
                    roughness: entry.roughnessMap || null,
                },
                typeof entry.tileX === "number" ? entry.tileX : 1,
                typeof entry.tileY === "number" ? entry.tileY : 1,
                typeof entry.offsetX === "number" ? entry.offsetX : 0,
                typeof entry.offsetY === "number" ? entry.offsetY : 0
            );
        }
        if (hasTint) {
            const materials = ensureFaceMaterials(mesh);
            const mat = materials[slotIndex];
            if (mat?.color) {
                mat.color.set(`#${String(entry.tintHex).replace(/^#/, "")}`);
                mat.needsUpdate = true;
            }
        }
        if (hasMaterial) {
            applyBoxFaceMaterialProps(object, mesh, slotIndex, {
                roughness: typeof entry.roughness === "number" ? entry.roughness : undefined,
                metalness: typeof entry.metalness === "number" ? entry.metalness : undefined,
                opacity: typeof entry.opacity === "number" ? entry.opacity : undefined,
                glass: entry.glass ? true : "glass" in entry ? false : undefined,
                reflection: typeof entry.reflection === "number" ? entry.reflection : undefined,
            });
        }
    }
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
    if (found) return found;
    object?.traverse((child) => {
        if (found) return;
        if (child instanceof THREE.Mesh && child.geometry && !child.userData?._labNoPaintPick) {
            found = child;
        }
    });
    return found;
}

/**
 * @param {THREE.Object3D} object
 * @param {Record<string, string> | { faces?: Record<string, string>, meshLayers?: Record<string, string> } | null | undefined} data
 * @returns {Promise<void>}
 */
export async function applyFacePaintData(object, data) {
    if (!data || typeof data !== "object") return;
    const mesh = getPaintableMesh(object);
    if (!mesh) return;

    // Compat : ancien format = map faceIndex → dataUrl
    const faces =
        data.faces && typeof data.faces === "object"
            ? data.faces
            : !("faces" in data) && !("meshLayers" in data)
              ? /** @type {Record<string, string>} */ (data)
              : {};
    const meshLayers =
        data.meshLayers && typeof data.meshLayers === "object" ? data.meshLayers : {};

    disposeFacePaint(object, { keepMaterials: true });

    const faceEntries = Object.entries(faces);
    if (faceEntries.length) {
    await Promise.all(
            faceEntries.map(([faceKey, dataUrl]) => {
                if (typeof dataUrl !== "string" || !dataUrl) return Promise.resolve();
                let meshName = "";
                let faceIndex = Number(faceKey);
                if (String(faceKey).includes("::")) {
                    const split = String(faceKey).split("::");
                    meshName = split[0];
                    faceIndex = Number(split[1]);
                } else if (String(faceKey).includes(":") && !Number.isFinite(Number(faceKey))) {
                    faceIndex = Number(String(faceKey).slice(String(faceKey).lastIndexOf(":") + 1));
                }
            if (!Number.isFinite(faceIndex) || faceIndex < 0 || faceIndex >= FACE_COUNT) {
                return Promise.resolve();
            }
                /** @type {THREE.Mesh | null} */
                let target = null;
                if (meshName) {
                    object.traverse((child) => {
                        if (target) return;
                        if (child instanceof THREE.Mesh && child.name === meshName) target = child;
                    });
                }
                if (!target) target = mesh;
                if (!target || !isPaintableBoxMesh(target)) return Promise.resolve();
                ensureFaceMaterials(target);
            return new Promise((resolve, reject) => {
                const image = new Image();
                image.onload = () => {
                        applyFaceAlbedoTexture(object, target, faceIndex, image, 1, 1, 0, 0);
                        resolve();
                    };
                    image.onerror = () => reject(new Error("Face paint invalide"));
                    image.src = dataUrl;
                });
            })
        );
    }

    const layerEntries = Object.entries(meshLayers);
    if (layerEntries.length) {
        await Promise.all(
            layerEntries.map(([matKey, dataUrl]) => {
                if (typeof dataUrl !== "string" || !dataUrl) return Promise.resolve();
                const materialIndex = matKey === "single" ? 0 : Number(matKey);
                if (!Number.isFinite(materialIndex) || materialIndex < 0) return Promise.resolve();
                return new Promise((resolve, reject) => {
                    const image = new Image();
                    image.onload = () => {
                        const layer = getMeshPaintLayer(object, mesh, materialIndex);
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
}

/**
 * @param {THREE.Object3D} object
 * @param {{ keepMaterials?: boolean }} [opts]
 */
export function disposeFacePaint(object, { keepMaterials = false } = {}) {
    const store = object.userData[FACE_PAINT_KEY];

    object?.traverse((child) => {
        if (!(child instanceof THREE.Mesh) || !child.material) return;
        const materials = Array.isArray(child.material) ? child.material : [child.material];
        materials.forEach((material) => {
            if (!(material instanceof THREE.MeshStandardMaterial)) return;
            const faceMap = material.userData?.[FACE_ALBEDO_MAP_KEY];
            if (faceMap) {
                try {
                    faceMap.dispose?.();
                } catch {
                    /* ignore */
                }
                delete material.userData[FACE_ALBEDO_MAP_KEY];
            }
            for (const key of [FACE_NORMAL_MAP_KEY, FACE_SPECULAR_MAP_KEY]) {
                const secondary = material.userData?.[key];
                if (!secondary) continue;
                try {
                    secondary.dispose?.();
                } catch {
                    /* ignore */
                }
                delete material.userData[key];
            }
            detachPaintOverlay(material);
        });
    });

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

    if (!keepMaterials) {
        object?.traverse((child) => {
            if (!(child instanceof THREE.Mesh)) return;
            if (Array.isArray(child.material) && child.material.length === FACE_COUNT) {
                child.material.forEach((material) => material?.dispose?.());
                child.material = new THREE.MeshStandardMaterial({ color: 0x00d1ff });
            }
        });
    }
}

/**
 * Cube / panneau / RoundedBox (lissage) — peinture par face (6 matériaux).
 * @param {THREE.Mesh} mesh
 */
export function isPaintableBoxMesh(mesh) {
    if (!(mesh instanceof THREE.Mesh) || !mesh.geometry) return false;
    if (mesh.geometry instanceof THREE.BoxGeometry) return true;
    if (mesh.geometry.type === "RoundedBoxGeometry") return true;
    let root = /** @type {THREE.Object3D} */ (mesh);
    while (root.parent && root.userData?.labShape == null) {
        root = root.parent;
    }
    const shape = root.userData?.labShape;
    return shape === "box" || shape === "panel";
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
 *   sizeInput?: HTMLInputElement | null,
 *   opacityInput?: HTMLInputElement | null,
 *   tileXInput?: HTMLInputElement | null,
 *   tileYInput?: HTMLInputElement | null,
 *   offsetXInput?: HTMLInputElement | null,
 *   offsetYInput?: HTMLInputElement | null,
 *   setDrawModeActive: (active: boolean) => void,
 *   setPaintStrokeActive?: (active: boolean) => void,
 *   cancelLookGesture?: () => void,
 *   isTriangulationMode?: () => boolean,
 *   exitTriangulationForPaint?: () => void,
 *   enterExplore?: () => void,
 *   setSelectionOnlyMode?: () => void,
 *   showStatus?: (msg: string) => void,
 *   pickPaintHit: (clientX: number, clientY: number) => { entity: THREE.Object3D, mesh: THREE.Mesh, hit: THREE.Intersection } | null,
 *   recordPaintHistory?: (entry: { object: THREE.Object3D, faceIndex: number, before: string | null, after: string | null }) => void,
 *   onTriangleTextureApplied?: (overlays: THREE.Mesh[]) => void,
 *   onEmptyPaintClick?: () => boolean,
 *   resyncObjectUv?: (object: THREE.Object3D) => void,
 * }} options
 */
export function initFaceDrawController(options) {
    const {
        canvas,
        drawBtn,
        drawPanel,
        colorInput,
        sizeInput = null,
        opacityInput = null,
        tileXInput,
        tileYInput,
        offsetXInput,
        offsetYInput,
        setDrawModeActive,
        setPaintStrokeActive,
        cancelLookGesture,
        isTriangulationMode,
        exitTriangulationForPaint,
        enterExplore,
        setSelectionOnlyMode,
        showStatus,
        pickPaintHit,
        recordPaintHistory,
        onTriangleTextureApplied,
        onEmptyPaintClick,
        resyncObjectUv,
    } = options;

    let active = false;
    /** Évite une course disable qui laissait le nuancier inutilisable. */
    let colorPickerClosing = false;
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
    /** @type {number | null} */
    let capturedPointerId = null;
    /** @type {Array<typeof selectedTriangles>} */
    let triSelectionUndoStack = [];
    /** @type {typeof selectedTriangles | null} */
    let triDragSnapshot = null;
    /** @type {THREE.Mesh[]} overlays dont le tile/offset reste piloté en live */
    let liveTriangleTextureOverlays = [];
    /** @type {Array<{ object: THREE.Object3D, mesh: THREE.Mesh, faceIndex: number, image: CanvasImageSource, surfaceId?: string }>} */
    let liveFaceTextureTargets = [];
    /** @type {Set<THREE.Object3D>} */
    const faceSelectionOverlayHosts = new Set();

    function removeFaceSelectionOverlay(host) {
        if (!host) return;
        const overlay = host.getObjectByName?.(FACE_SELECTION_OVERLAY_NAME);
        if (!overlay) return;
        host.remove(overlay);
        overlay.traverse?.((node) => {
            node.geometry?.dispose?.();
            if (Array.isArray(node.material)) node.material.forEach((m) => m?.dispose?.());
            else node.material?.dispose?.();
        });
    }

    function clearFaceSelectionOverlays() {
        for (const host of faceSelectionOverlayHosts) {
            removeFaceSelectionOverlay(host);
        }
        faceSelectionOverlayHosts.clear();
    }

    /**
     * Triangles locaux d’une face (groupe matériau / face boîte).
     * @param {THREE.Mesh} mesh
     * @param {number} faceIndex
     * @returns {{ fillPoints: number[], linePoints: number[] } | null}
     */
    function collectMeshFaceLocalPoints(mesh, faceIndex) {
        if (isPaintableBoxMesh(mesh)) ensurePaintReady(mesh);

        const geo = mesh?.geometry;
        const pos = geo?.attributes?.position;
        if (!pos) return null;

        /** @type {number[]} */
        const fillPoints = [];
        /** @type {number[]} */
        const linePoints = [];

        const pushTri = (ia, ib, ic) => {
            const ax = pos.getX(ia);
            const ay = pos.getY(ia);
            const az = pos.getZ(ia);
            const bx = pos.getX(ib);
            const by = pos.getY(ib);
            const bz = pos.getZ(ib);
            const cx = pos.getX(ic);
            const cy = pos.getY(ic);
            const cz = pos.getZ(ic);
            fillPoints.push(ax, ay, az, bx, by, bz, cx, cy, cz);
            linePoints.push(
                ax, ay, az, bx, by, bz,
                bx, by, bz, cx, cy, cz,
                cx, cy, cz, ax, ay, az
            );
        };

        const groups = geo.groups || [];
        const group =
            groups.find((g) => g.materialIndex === faceIndex) ||
            (faceIndex >= 0 && faceIndex < groups.length ? groups[faceIndex] : null);

        const index = geo.index;

        if (group && group.count > 0) {
            for (let i = 0; i + 2 < group.count; i += 3) {
                const base = group.start + i;
                if (index) {
                    pushTri(index.getX(base), index.getX(base + 1), index.getX(base + 2));
                } else {
                    pushTri(base, base + 1, base + 2);
                }
            }
        } else {
            // Pas de groupe : pièce entière (import mono-matériau).
            const triCount = index ? Math.floor(index.count / 3) : Math.floor(pos.count / 3);
            for (let t = 0; t < triCount; t += 1) {
                if (index) {
                    pushTri(index.getX(t * 3), index.getX(t * 3 + 1), index.getX(t * 3 + 2));
                } else {
                    pushTri(t * 3, t * 3 + 1, t * 3 + 2);
                }
            }
        }

        if (!fillPoints.length) return null;
        return { fillPoints, linePoints };
    }

    /**
     * Surbrillance contours (comme mode Triangles) de la dernière face ciblée.
     */
    function refreshFaceSelectionOverlay() {
        clearFaceSelectionOverlays();
        const entry = liveFaceTextureTargets[liveFaceTextureTargets.length - 1];
        if (!entry?.object || !Number.isInteger(entry.faceIndex)) return;

        /** @type {THREE.Mesh[]} */
        let meshes = [];
        if (entry.surfaceId && isLabArchitecture(entry.object)) {
            meshes = getArchSurfaceMeshes(entry.object, entry.surfaceId).filter(
                (m) => m instanceof THREE.Mesh
            );
        } else if (entry.mesh instanceof THREE.Mesh) {
            meshes = [entry.mesh];
        }
        if (!meshes.length) return;

        for (const mesh of meshes) {
            const pts = collectMeshFaceLocalPoints(mesh, entry.faceIndex);
            if (!pts) continue;

            const overlay = new THREE.Group();
            overlay.name = FACE_SELECTION_OVERLAY_NAME;
            overlay.renderOrder = 10000;
            overlay.frustumCulled = false;
            overlay.userData._labNoPaintPick = true;

            const fillGeo = new THREE.BufferGeometry();
            fillGeo.setAttribute("position", new THREE.Float32BufferAttribute(pts.fillPoints, 3));
            const fillMat = new THREE.MeshBasicMaterial({
                color: 0xffd54f,
                transparent: true,
                opacity: 0.18,
                side: THREE.DoubleSide,
                depthTest: false,
                depthWrite: false,
            });
            const fill = new THREE.Mesh(fillGeo, fillMat);
            fill.renderOrder = 10000;
            fill.frustumCulled = false;
            fill.userData._labNoPaintPick = true;

            const lineGeo = new THREE.BufferGeometry();
            lineGeo.setAttribute("position", new THREE.Float32BufferAttribute(pts.linePoints, 3));
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

            overlay.add(fill);
            overlay.add(edges);
            mesh.add(overlay);
            faceSelectionOverlayHosts.add(mesh);
        }
    }

    /**
     * @param {typeof liveFaceTextureTargets} entries
     */
    function setLiveFaceTextureTargets(entries) {
        liveFaceTextureTargets = Array.isArray(entries) ? entries : [];
        refreshFaceSelectionOverlay();
    }

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
     * Annule (Ctrl+Z) la sélection de triangles uniquement.
     * Les textures △ passent par l’historique scène.
     * @returns {boolean}
     */
    function undoTriangleSelection() {
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

    function releaseCapturedPointer(pointerId = capturedPointerId) {
        if (pointerId == null) return;
        try {
            if (canvas.hasPointerCapture(pointerId)) {
                canvas.releasePointerCapture(pointerId);
            }
        } catch {
            /* ignore */
        }
        if (capturedPointerId === pointerId) capturedPointerId = null;
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
                    ? "Triangulation — glisser = sélection, clic droit = regarder (Ctrl+Z annule)"
                    : "Crayon — clic gauche = dessiner, clic droit = regarder"
            );
        } else {
            showStatus?.("Mode dessin désactivé");
        }
    }

    function setActive(value, { freehand = false } = {}) {
        if (value && freehand) {
            // Le mode Triangles détourne le clic gauche : en sortir pour peindre.
            exitTriangulationForPaint?.();
        }
        active = value;
        stroke = null;
        shapeDraft = null;
        pendingUndoBefore = null;
        triDragActive = false;
        triDragLastKey = null;
        triDragSnapshot = null;
        releaseCapturedPointer();
        setPaintStrokeActive?.(false);
        if (!active) {
            clearTriangleSelection(false);
            clearFaceSelectionOverlays();
            liveFaceTextureTargets = [];
            cancelLookGesture?.();
        } else if (colorInput) {
            colorInput.disabled = false;
            colorPickerClosing = false;
        }
        syncUi();
    }

    function commitPaintHistory(object, faceIndex, mesh = null) {
        const after = captureFaceSnapshot(object, faceIndex, mesh);
        const before = pendingUndoBefore;
        pendingUndoBefore = null;
        if (before === after) return;
        recordPaintHistory?.({ object, faceIndex, before, after, mesh });
    }

    function toggle() {
        if (active) setActive(false);
        else setActive(true, { freehand: true });
    }

    function getBrushSize() {
        return Math.max(1, Number(sizeInput?.value) || 8);
    }

    function getBrushAlpha() {
        const value = Number(opacityInput?.value);
        if (!Number.isFinite(value)) return 1;
        return Math.min(1, Math.max(0.05, value));
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
            patternSource: null,
            tileX: 1,
            tileY: 1,
        };
    }

    /** Crayon uniquement pour l’instant. */
    function getTool() {
        return "pencil";
    }

    function setBrushTexture(image) {
        brushTile = image ? buildBrushTile(image) : null;
    }

    function setFaceTexture(image) {
        faceTextureImage = image || null;
    }

    function setDecalTexture(image) {
        decalImage = image || null;
    }

    /** Évite une course disable/rAF qui laissait l’input `disabled` (nuancier 1 seule fois). */
    function closeColorPicker() {
        if (colorPickerClosing || !colorInput) return;
        colorPickerClosing = true;
        try {
            colorInput.blur();
        } catch {
            /* ignore */
        }
        // Ne pas mémoriser `wasDisabled` : des appels concurrents le figeaient à true.
        colorInput.disabled = true;
        window.setTimeout(() => {
            colorInput.disabled = false;
            colorPickerClosing = false;
        }, 50);
    }

    // Fermer à la validation (`change`), pas à chaque `input` (sinon course + fermeture pendant le drag).
    colorInput.addEventListener("change", closeColorPicker);

    const onTileInputChange = () => {
        applyLiveUvTransform();
    };
    tileXInput?.addEventListener("input", onTileInputChange);
    tileXInput?.addEventListener("change", onTileInputChange);
    tileYInput?.addEventListener("input", onTileInputChange);
    tileYInput?.addEventListener("change", onTileInputChange);
    offsetXInput?.addEventListener("input", onTileInputChange);
    offsetXInput?.addEventListener("change", onTileInputChange);
    offsetYInput?.addEventListener("input", onTileInputChange);
    offsetYInput?.addEventListener("change", onTileInputChange);

    function bakeFaceTexture(object, mesh, faceIndex, image, tileX, tileY, offsetX = 0, offsetY = 0) {
        applyFaceAlbedoTexture(object, mesh, faceIndex, image, tileX, tileY, offsetX, offsetY);
    }

    function applyFaceTexture(object, mesh, faceIndex, image, tileX, tileY) {
        const offsetX = getTextureOffset(offsetXInput);
        const offsetY = getTextureOffset(offsetYInput);
        bakeFaceTexture(object, mesh, faceIndex, image, tileX, tileY, offsetX, offsetY);
        // Un seul live target : chaque face garde son tile ; le curseur
        // n’ajuste que la dernière texture posée.
        liveFaceTextureTargets = [{ object, mesh, faceIndex, image }];
        refreshFaceSelectionOverlay();
    }

    /**
     * @param {CanvasImageSource} image
     * @returns {CanvasImageSource}
     */
    function getFacePatternSource(image) {
        const w = /** @type {{ width?: number, naturalWidth?: number }} */ (image).naturalWidth
            || /** @type {{ width?: number }} */ (image).width
            || FACE_CANVAS_SIZE;
        const h = /** @type {{ height?: number, naturalHeight?: number }} */ (image).naturalHeight
            || /** @type {{ height?: number }} */ (image).height
            || FACE_CANVAS_SIZE;
        if (w <= FACE_CANVAS_SIZE && h <= FACE_CANVAS_SIZE) return image;
        const scale = Math.min(FACE_CANVAS_SIZE / w, FACE_CANVAS_SIZE / h);
        const cw = Math.max(1, Math.round(w * scale));
        const ch = Math.max(1, Math.round(h * scale));
        const tmp = document.createElement("canvas");
        tmp.width = cw;
        tmp.height = ch;
        const ctx = tmp.getContext("2d");
        if (!ctx) return image;
        ctx.drawImage(/** @type {CanvasImageSource} */ (image), 0, 0, cw, ch);
        return tmp;
    }

    function makeRuntimeTexture(image, tileX, tileY, offsetX = 0, offsetY = 0) {
        const texture = new THREE.Texture(image);
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.RepeatWrapping;
        texture.repeat.set(tileX, tileY);
        texture.offset.set(offsetX, offsetY);
        if ("colorSpace" in texture) texture.colorSpace = THREE.SRGBColorSpace;
        else texture.encoding = THREE.sRGBEncoding;
        if (typeof texture.updateMatrix === "function") texture.updateMatrix();
        texture.needsUpdate = true;
        return texture;
    }

    /**
     * Projection planaire partagée (espace entité) pour un lot de triangles
     * éventuellement répartis sur plusieurs meshes (murs découpés, etc.).
     * UV en mètres → Tile = répétitions / mètre, alignées sur toute la surface.
     * @param {Array<{ mesh: THREE.Mesh, entity: THREE.Object3D, pa: THREE.Vector3, pb: THREE.Vector3, pc: THREE.Vector3 }>} tris
     * @returns {{ project: (mesh: THREE.Mesh, local: THREE.Vector3) => { u: number, v: number } }}
     */
    function buildSharedPlanarProjector(tris) {
        const tmp = new THREE.Vector3();
        const entity = tris[0]?.entity;
        const normal = new THREE.Vector3();

        for (const tri of tris) {
            const pts = [tri.pa, tri.pb, tri.pc].map((local) => {
                const p = local.clone();
                tri.mesh.localToWorld(p);
                if (entity) entity.worldToLocal(p);
                return p;
            });
            const e1 = new THREE.Vector3().subVectors(pts[1], pts[0]);
            const e2 = new THREE.Vector3().subVectors(pts[2], pts[0]);
            normal.add(new THREE.Vector3().crossVectors(e1, e2));
        }
        if (normal.lengthSq() < 1e-12) normal.set(0, 1, 0);
        else normal.normalize();

        const ref = Math.abs(normal.y) < 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0);
        const uAxis = new THREE.Vector3().crossVectors(ref, normal);
        if (uAxis.lengthSq() < 1e-12) uAxis.set(1, 0, 0);
        else uAxis.normalize();
        const vAxis = new THREE.Vector3().crossVectors(normal, uAxis).normalize();

        return {
            project(mesh, local) {
                tmp.copy(local);
                mesh.localToWorld(tmp);
                if (entity) entity.worldToLocal(tmp);
                return { u: tmp.dot(uAxis), v: tmp.dot(vAxis) };
            },
        };
    }

    function applyTextureToTrianglesAsOverlay(entries, image, tileX, tileY, offsetX, offsetY) {
        if (!entries.length) return;
        const projector = buildSharedPlanarProjector(entries);

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
            const uvs = [];
            for (const tri of tris) {
                positions.push(
                    tri.pa.x, tri.pa.y, tri.pa.z,
                    tri.pb.x, tri.pb.y, tri.pb.z,
                    tri.pc.x, tri.pc.y, tri.pc.z
                );
                for (const local of [tri.pa, tri.pb, tri.pc]) {
                    const { u, v } = projector.project(mesh, local);
                    uvs.push(u, v);
                }
            }
            const geometry = new THREE.BufferGeometry();
            geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
            geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
            geometry.computeVertexNormals();

            const overlay = new THREE.Mesh(
                geometry,
                new THREE.MeshStandardMaterial({
                    color: 0xffffff,
                    map: makeRuntimeTexture(image, tileX, tileY, offsetX, offsetY),
                    roughness: TRI_MAT_DEFAULTS.roughness,
                    metalness: TRI_MAT_DEFAULTS.metalness,
                    transparent: true,
                    opacity: TRI_MAT_DEFAULTS.opacity,
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
            overlay.userData._labTileZ = 1;
            overlay.userData._labOffsetX = offsetX;
            overlay.userData._labOffsetY = offsetY;
            overlay.userData._labOffsetZ = 0;
            overlay.userData._labRoughness = TRI_MAT_DEFAULTS.roughness;
            overlay.userData._labMetalness = TRI_MAT_DEFAULTS.metalness;
            overlay.userData._labOpacity = TRI_MAT_DEFAULTS.opacity;
            overlay.userData._labGlass = false;
            overlay.renderOrder = 9800;
            mesh.add(overlay);
            created.push(overlay);
        }
        // Le dernier lot reste piloté en live par Tile / Offset.
        liveTriangleTextureOverlays = created;
        onTriangleTextureApplied?.(created);
    }

    /**
     * Couleur unie sur les triangles sélectionnés (canvas 1×1 → sérialisable).
     * @param {typeof selectedTriangles} entries
     * @param {string} hex
     */
    function applyColorToTrianglesAsOverlay(entries, hex) {
        if (!entries.length) return;
        const color = new THREE.Color(hex || "#ffffff");
        const canvas = document.createElement("canvas");
        canvas.width = 1;
        canvas.height = 1;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;
        ctx.fillStyle = `#${color.getHexString()}`;
        ctx.fillRect(0, 0, 1, 1);
        applyTextureToTrianglesAsOverlay(entries, canvas, 1, 1, 0, 0);
        for (const overlay of liveTriangleTextureOverlays) {
            const mat = /** @type {THREE.MeshStandardMaterial} */ (overlay.material);
            if (mat?.color) {
                mat.color.copy(color);
                mat.needsUpdate = true;
            }
            overlay.userData._labTintHex = color.getHexString();
        }
    }

    /**
     * Teinte les overlays △ live ; sinon crée un overlay couleur sur la sélection.
     * @param {string} hex
     * @returns {boolean}
     */
    function applyLiveTriangleColor(hex) {
        const color = new THREE.Color(hex || "#ffffff");
        const live = liveTriangleTextureOverlays.filter((o) => o?.parent);
        if (live.length) {
            for (const overlay of live) {
                const mat = /** @type {THREE.MeshStandardMaterial} */ (overlay.material);
                if (!mat?.color) continue;
                mat.color.copy(color);
                mat.needsUpdate = true;
                overlay.userData._labTintHex = color.getHexString();
            }
            return true;
        }
        if (!selectedTriangles.length) return false;
        applyColorToTrianglesAsOverlay(selectedTriangles, hex);
        clearTriangleSelection(false);
        return liveTriangleTextureOverlays.some((o) => o?.parent);
    }

    function getLiveTriangleColor() {
        const live = liveTriangleTextureOverlays.filter((o) => o?.parent);
        if (!live.length) return null;
        const overlay = live[live.length - 1];
        if (overlay.userData?._labTintHex) {
            return `#${String(overlay.userData._labTintHex).replace(/^#/, "")}`;
        }
        const mat = /** @type {THREE.MeshStandardMaterial} */ (overlay.material);
        if (mat?.color?.getHexString) return `#${mat.color.getHexString()}`;
        return null;
    }

    function setTriangleOverlayTransform(overlay, tileX, tileY, offsetX, offsetY, tileZ = 1, offsetZ = 0) {
        const map = overlay?.material?.map;
        if (!map) return;
        map.wrapS = THREE.RepeatWrapping;
        map.wrapT = THREE.RepeatWrapping;
        // Tile Z : densifie les UV overlay (pas de vraie 3e coordonnée sur un △ plat).
        const zScale = Math.max(0.1, tileZ);
        map.repeat.set(tileX * (Math.abs(zScale - 1) > 1e-4 ? zScale : 1), tileY);
        map.offset.set(offsetX + offsetZ, offsetY);
        if (typeof map.updateMatrix === "function") map.updateMatrix();
        map.needsUpdate = true;
        overlay.userData._labTileX = tileX;
        overlay.userData._labTileY = tileY;
        overlay.userData._labTileZ = tileZ;
        overlay.userData._labOffsetX = offsetX;
        overlay.userData._labOffsetY = offsetY;
        overlay.userData._labOffsetZ = offsetZ;
        if (overlay.material) overlay.material.needsUpdate = true;
    }

    function applyLiveTransformToTriangleOverlays(transform) {
        if (!liveTriangleTextureOverlays.length) return;
        const tileX =
            typeof transform?.tileX === "number" ? getTileRepeat({ value: transform.tileX }) : getTileRepeat(tileXInput);
        const tileY =
            typeof transform?.tileY === "number" ? getTileRepeat({ value: transform.tileY }) : getTileRepeat(tileYInput);
        const tileZ =
            typeof transform?.tileZ === "number" ? getTileRepeat({ value: transform.tileZ }) : 1;
        const offsetX =
            typeof transform?.offsetX === "number"
                ? getTextureOffset({ value: transform.offsetX })
                : getTextureOffset(offsetXInput);
        const offsetY =
            typeof transform?.offsetY === "number"
                ? getTextureOffset({ value: transform.offsetY })
                : getTextureOffset(offsetYInput);
        const offsetZ =
            typeof transform?.offsetZ === "number" ? getTextureOffset({ value: transform.offsetZ }) : 0;
        const stillAlive = [];
        for (const overlay of liveTriangleTextureOverlays) {
            if (!overlay.parent) continue;
            setTriangleOverlayTransform(overlay, tileX, tileY, offsetX, offsetY, tileZ, offsetZ);
            stillAlive.push(overlay);
        }
        liveTriangleTextureOverlays = stillAlive;
    }

    function applyUvToFaceMaps(mat, tileX, tileY, offsetX, offsetY) {
        if (!mat) return;
        /** @type {Set<THREE.Texture>} */
        const textures = new Set();
        for (const key of [
            FACE_ALBEDO_MAP_KEY,
            FACE_NORMAL_MAP_KEY,
            FACE_SPECULAR_MAP_KEY,
            FACE_ROUGHNESS_MAP_KEY,
        ]) {
            const tex = mat.userData?.[key];
            if (tex) textures.add(tex);
        }
        if (mat.map) textures.add(mat.map);
        if (mat.normalMap) textures.add(mat.normalMap);
        if (mat.metalnessMap) textures.add(mat.metalnessMap);
        if (mat.roughnessMap) textures.add(mat.roughnessMap);
        for (const tex of textures) {
            if (!tex || typeof tex.repeat?.set !== "function") continue;
            tex.wrapS = THREE.RepeatWrapping;
            tex.wrapT = THREE.RepeatWrapping;
            tex.repeat.set(tileX, tileY);
            tex.offset.set(offsetX, offsetY);
            if (typeof tex.updateMatrix === "function") tex.updateMatrix();
            tex.needsUpdate = true;
        }
        mat.userData._labTileX = tileX;
        mat.userData._labTileY = tileY;
        mat.userData._labOffsetX = offsetX;
        mat.userData._labOffsetY = offsetY;
        mat.needsUpdate = true;
    }

    function applyLiveTransformToFaceTextures(transform) {
        if (!liveFaceTextureTargets.length) return;
        const tileX =
            typeof transform?.tileX === "number" ? getTileRepeat({ value: transform.tileX }) : getTileRepeat(tileXInput);
        const tileY =
            typeof transform?.tileY === "number" ? getTileRepeat({ value: transform.tileY }) : getTileRepeat(tileYInput);
        const offsetX =
            typeof transform?.offsetX === "number"
                ? getTextureOffset({ value: transform.offsetX })
                : getTextureOffset(offsetXInput);
        const offsetY =
            typeof transform?.offsetY === "number"
                ? getTextureOffset({ value: transform.offsetY })
                : getTextureOffset(offsetYInput);
        // Uniquement la dernière face posée (les précédentes gardent leur tile).
        const still = [];
        const entries = liveFaceTextureTargets.slice(-1);
        for (const entry of entries) {
            // Surface Architecture : une face (intérieur/extérieur) sur le mur.
            if (entry.surfaceId && entry.object && Number.isInteger(entry.faceIndex)) {
                const key = archSurfaceFaceKey(entry.surfaceId, entry.faceIndex);
                const store = entry.object.userData?.[ARCH_SURFACE_TEX_KEY]?.[key];
                if (store) {
                    for (const tex of [store.color, store.normal, store.specular]) {
                        if (!tex || typeof tex.repeat?.set !== "function") continue;
                        tex.wrapS = THREE.RepeatWrapping;
                        tex.wrapT = THREE.RepeatWrapping;
                        tex.repeat.set(tileX, tileY);
                        tex.offset.set(offsetX, offsetY);
                        if (typeof tex.updateMatrix === "function") tex.updateMatrix();
                        tex.needsUpdate = true;
                    }
                    store.tileX = tileX;
                    store.tileY = tileY;
                    store.offsetX = offsetX;
                    store.offsetY = offsetY;
                }
                // Garder la cible même pendant un rebuild (store temporairement vide).
                still.push(entry);
                continue;
            }
            if (!entry.mesh?.geometry) continue;
            const mats = Array.isArray(entry.mesh.material)
                ? entry.mesh.material
                : [entry.mesh.material];
            const idx = Math.max(0, Math.min(mats.length - 1, entry.faceIndex || 0));
            const mat = mats[idx];
            if (
                mat &&
                (mat.userData?.[FACE_ALBEDO_MAP_KEY] ||
                    mat.userData?.[FACE_NORMAL_MAP_KEY] ||
                    mat.userData?.[FACE_SPECULAR_MAP_KEY] ||
                    mat.userData?.[FACE_ROUGHNESS_MAP_KEY] ||
                    mat.map)
            ) {
                applyUvToFaceMaps(mat, tileX, tileY, offsetX, offsetY);
                if (entry.object?.userData?.[FACE_PBR_STORE_KEY]) {
                    const storeKey = `${entry.mesh.uuid}:${idx}`;
                    const pbr = entry.object.userData[FACE_PBR_STORE_KEY];
                    pbr[storeKey] = {
                        ...(pbr[storeKey] || {}),
                        tileX,
                        tileY,
                        offsetX,
                        offsetY,
                    };
                }
                still.push(entry);
                continue;
            }
            if (!entry.image) continue;
            bakeFaceTexture(
                entry.object,
                entry.mesh,
                entry.faceIndex,
                entry.image,
                tileX,
                tileY,
                offsetX,
                offsetY
            );
            still.push(entry);
        }
        liveFaceTextureTargets = still;
        refreshFaceSelectionOverlay();
    }

    function applyLiveUvTransform(transform) {
        applyLiveTransformToTriangleOverlays(transform);
        applyLiveTransformToFaceTextures(transform);
    }

    function applyLiveFaceUvTransform(transform) {
        applyLiveTransformToFaceTextures(transform);
    }

    function applyUvToOverlays(overlays, transform) {
        if (!overlays?.length || !transform) return;
        const tileX = getTileRepeat({ value: transform.tileX ?? 1 });
        const tileY = getTileRepeat({ value: transform.tileY ?? 1 });
        const tileZ = getTileRepeat({ value: transform.tileZ ?? 1 });
        const offsetX = getTextureOffset({ value: transform.offsetX ?? 0 });
        const offsetY = getTextureOffset({ value: transform.offsetY ?? 0 });
        const offsetZ = getTextureOffset({ value: transform.offsetZ ?? 0 });
        for (const overlay of overlays) {
            if (!overlay) continue;
            setTriangleOverlayTransform(overlay, tileX, tileY, offsetX, offsetY, tileZ, offsetZ);
        }
        liveTriangleTextureOverlays = overlays.filter((o) => o?.parent);
    }

    function forgetOverlays(overlays) {
        const remove = new Set(overlays || []);
        liveTriangleTextureOverlays = liveTriangleTextureOverlays.filter((o) => !remove.has(o));
    }

    function restoreOverlays(overlays) {
        liveTriangleTextureOverlays = (overlays || []).filter((o) => o?.parent);
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
        const layer = resolvePaintLayer(object, mesh, faceIndex);
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
        const picked0 = pickPaintHit(clientX, clientY);
        if (!picked0) {
            // Clic dans le vide : sert de désélection (le clic gauche est
            // capté par la peinture, la sélection resterait sinon bloquée).
            if (onEmptyPaintClick?.()) return;
            showStatus?.("Aucune face sous le curseur");
            return;
        }
        // Préparer géométrie/matériaux AVANT le calcul du pixel — sinon le
        // 1er coup utilise d’anciens UV/indices (mauvais endroit + tile qui saute).
        if (ensurePaintReady(picked0.mesh)) {
            resyncObjectUv?.(picked0.entity);
        }
        const picked = pickPaintHit(clientX, clientY) || picked0;
        if (!picked.hit?.uv && !isPaintableBoxMesh(picked.mesh) && !picked.hit?.point) {
            showStatus?.("Cette surface n’a pas d’UV — impossible de peindre");
            return;
        }

        // Boîtes / murs fins : face par proximité de plan (materialIndex trompeur).
        const faceIndex = isPaintableBoxMesh(picked.mesh)
            ? boxFaceIndexFromHit(picked.mesh, picked.hit)
            : paintSurfaceIndexFromHit(picked.mesh, picked.hit);
        const pixel = paintPixelFromHit(picked.mesh, picked.hit, faceIndex);

        pendingUndoBefore = captureFaceSnapshot(picked.entity, faceIndex, picked.mesh);
        setLiveFaceTextureTargets([
            {
                object: picked.entity,
                mesh: picked.mesh,
                faceIndex,
                surfaceId: getArchSurfaceId(picked.mesh) || undefined,
                image: null,
            },
        ]);

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
            commitPaintHistory(picked.entity, faceIndex, picked.mesh);
            return;
        }

        if (tool === "face-texture") {
            if (!faceTextureImage) {
                pendingUndoBefore = null;
                showStatus?.("Chargez d'abord une image avec \"Texture face\"");
                return;
            }
            const tileX = getTileRepeat(tileXInput);
            const tileY = getTileRepeat(tileYInput);
            const offsetX = getTextureOffset(offsetXInput);
            const offsetY = getTextureOffset(offsetYInput);
            const surfaceId = getArchSurfaceId(picked.mesh);
            if (isLabArchitecture(picked.entity) && surfaceId) {
                const entity = picked.entity;
                const mesh = picked.mesh;
                const img = faceTextureImage;
                void (async () => {
                    const canvas = document.createElement("canvas");
                    canvas.width = Math.min(FACE_CANVAS_SIZE, img.naturalWidth || img.width || FACE_CANVAS_SIZE);
                    canvas.height = Math.min(
                        FACE_CANVAS_SIZE,
                        img.naturalHeight || img.height || FACE_CANVAS_SIZE
                    );
                    const ctx = canvas.getContext("2d");
                    if (!ctx) {
                        showStatus?.("Impossible d’encoder la texture face");
                        return;
                    }
                    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                    const dataUrl = canvas.toDataURL("image/png");
                    const count = await applyArchSurfaceTextureMaps(
                        entity,
                        surfaceId,
                        faceIndex,
                        { color: dataUrl },
                        tileX,
                        tileY,
                        offsetX,
                        offsetY
                    );
                    liveFaceTextureTargets = [
                        { object: entity, surfaceId, faceIndex, image: img, mesh },
                    ];
                    refreshFaceSelectionOverlay();
                    showStatus?.(
                        count
                            ? `Mur « ${surfaceId} » face ${faceIndex} — ${count} panneau(x)`
                            : "Texture face Architecture appliquée"
                    );
                    commitPaintHistory(entity, faceIndex, mesh);
                })();
                return;
            }
            applyFaceTexture(picked.entity, picked.mesh, faceIndex, faceTextureImage, tileX, tileY);
            showStatus?.("Texture appliquée sur toute la face");
            commitPaintHistory(picked.entity, faceIndex, picked.mesh);
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
            commitPaintHistory(picked.entity, faceIndex, picked.mesh);
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
                (isPaintableBoxMesh(picked.mesh)
                    ? boxFaceIndexFromHit(picked.mesh, picked.hit)
                    : paintSurfaceIndexFromHit(picked.mesh, picked.hit)) !== stroke.faceIndex
            ) {
                return;
            }
            const pixel = paintPixelFromHit(picked.mesh, picked.hit, stroke.faceIndex);
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
            const { entity, faceIndex, mesh } = stroke;
            stroke = null;
            commitPaintHistory(entity, faceIndex, mesh);
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
            (isPaintableBoxMesh(picked.mesh)
                ? boxFaceIndexFromHit(picked.mesh, picked.hit)
                : paintSurfaceIndexFromHit(picked.mesh, picked.hit)) !== draft.faceIndex
        ) {
            pendingUndoBefore = null;
            return;
        }

        const end = paintPixelFromHit(picked.mesh, picked.hit, draft.faceIndex);
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
            commitPaintHistory(draft.entity, draft.faceIndex, draft.mesh);
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
            commitPaintHistory(draft.entity, draft.faceIndex, draft.mesh);
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
            commitPaintHistory(draft.entity, draft.faceIndex, draft.mesh);
        }
    }

    function endPaintStrokeGesture() {
        setPaintStrokeActive?.(false);
        stroke = null;
        shapeDraft = null;
        triDragActive = false;
        triDragLastKey = null;
        triDragSnapshot = null;
    }

    drawBtn.addEventListener("click", (event) => {
        event.stopPropagation();
        toggle();
    });

    canvas.addEventListener("pointerdown", (event) => {
        if (!active || event.button !== 0) return;
        // Ne pas preventDefault ici : ça coupe mouseup et laisse l’orbite
        // « coincée » en mode Conception. touch-action CSS gère le scroll.
        event.stopPropagation();
        cancelLookGesture?.();
        setPaintStrokeActive?.(true);
        try {
        canvas.setPointerCapture(event.pointerId);
            capturedPointerId = event.pointerId;
        } catch {
            capturedPointerId = null;
        }
        try {
            beginPointer(event.clientX, event.clientY, event.shiftKey);
        } catch (error) {
            releaseCapturedPointer(event.pointerId);
            setPaintStrokeActive?.(false);
            throw error;
        }
        // Outils one-shot (texture face, fill, décal…) : libérer tout de suite
        // pour éviter une capture qui bloque la souris si pointerup est perdu.
        if (!triDragActive && !stroke && !shapeDraft) {
            releaseCapturedPointer(event.pointerId);
            setPaintStrokeActive?.(false);
        }
    });

    canvas.addEventListener("pointermove", (event) => {
        if (!active) return;
        if (!triDragActive && !stroke && !shapeDraft) return;
        event.preventDefault();
        movePointer(event.clientX, event.clientY);
    });

    canvas.addEventListener("pointerup", (event) => {
        releaseCapturedPointer(event.pointerId);
        if (!active) {
            setPaintStrokeActive?.(false);
            return;
        }
        endPointer(event.clientX, event.clientY);
        setPaintStrokeActive?.(false);
    });

    canvas.addEventListener("pointercancel", (event) => {
        releaseCapturedPointer(event.pointerId);
        if (triDragActive && triDragSnapshot && !sameSelection(triDragSnapshot, selectedTriangles)) {
            triSelectionUndoStack.push(triDragSnapshot);
        }
        endPaintStrokeGesture();
        pendingUndoBefore = null;
    });

    canvas.addEventListener("lostpointercapture", () => {
        capturedPointerId = null;
        // Si la capture est perdue sans pointerup, désarmer l’orbite bloquée.
        setPaintStrokeActive?.(false);
    });

    // Filet de sécurité : si pointerup est perdu hors canvas, libérer la capture.
    const onWindowPointerEnd = (event) => {
        if (capturedPointerId == null) return;
        if (event.pointerId !== capturedPointerId) return;
        // Le handler canvas gère le cas normal (évite un double commit).
        if (event.target === canvas) return;
        releaseCapturedPointer(event.pointerId);
        if (active) endPointer(event.clientX, event.clientY);
        setPaintStrokeActive?.(false);
    };
    window.addEventListener("pointerup", onWindowPointerEnd);
    window.addEventListener("pointercancel", onWindowPointerEnd);

    return {
        setActive,
        isActive: () => active,
        clearTriangleSelection: (showMessage = true) => clearTriangleSelection(!!showMessage),
        undoTriangleSelection,
        setBrushFromDataUrl: async (dataUrl) => {
            const img = await loadImageElement(dataUrl);
            setBrushTexture(img);
        },
        setFaceTextureFromDataUrl: async (dataUrl) => {
            const img = await loadImageElement(dataUrl);
            setFaceTexture(img);
        },
        setDecalFromDataUrl: async (dataUrl) => {
            const img = await loadImageElement(dataUrl);
            setDecalTexture(img);
        },
        hasTriangleSelection: () => selectedTriangles.length > 0,
        getSelectedTriangles: () => selectedTriangles.slice(),
        /**
         * Étend la sélection au(x) îlot(s) des triangles déjà choisis.
         * @returns {number}
         */
        growSelectionToIslands: () => {
            if (!selectedTriangles.length) return 0;
            const byMesh = new Map();
            for (const entry of selectedTriangles) {
                const arr = byMesh.get(entry.mesh) || [];
                arr.push(entry);
                byMesh.set(entry.mesh, arr);
            }
            triSelectionUndoStack.push(selectedTriangles.slice());
            const next = [];
            for (const [mesh, entries] of byMesh.entries()) {
                const seeds = new Set(entries.map((e) => e.triId));
                const islands = groupTrianglesByIslands(mesh);
                const pos = mesh.geometry.attributes.position;
                const entity = entries[0].entity;
                const materialIndex = entries[0].materialIndex;
                for (const island of islands) {
                    if (!island.some((t) => seeds.has(t.join(":")))) continue;
                    for (const tri of island) {
                        next.push({
                            entity,
                            mesh,
                            triId: tri.join(":"),
                            materialIndex,
                            a: new THREE.Vector2(),
                            b: new THREE.Vector2(),
                            c: new THREE.Vector2(),
                            pa: new THREE.Vector3(pos.getX(tri[0]), pos.getY(tri[0]), pos.getZ(tri[0])),
                            pb: new THREE.Vector3(pos.getX(tri[1]), pos.getY(tri[1]), pos.getZ(tri[1])),
                            pc: new THREE.Vector3(pos.getX(tri[2]), pos.getY(tri[2]), pos.getZ(tri[2])),
                        });
                    }
                }
            }
            selectedTriangles = next;
            refreshTriangleSelectionOverlay();
            return selectedTriangles.length;
        },
        peekPaintHit: (clientX, clientY) => pickPaintHit(clientX, clientY),
        applyLiveUvTransform,
        applyLiveFaceUvTransform,
        applyUvToOverlays,
        forgetOverlays,
        restoreOverlays,
        getLiveTriangleOverlays: () => liveTriangleTextureOverlays.filter((o) => o?.parent),
        /**
         * Drop texture en mode Triangles : uniquement la sélection △.
         * @param {string} dataUrl
         * @returns {Promise<boolean>}
         */
        applyDroppedTriangleTexture: async (dataUrl) => {
            const img = await loadImageElement(dataUrl);
            setFaceTexture(img);
            if (!selectedTriangles.length) {
                showStatus?.("Sélectionnez d’abord des triangles");
                return false;
            }
            applyFaceTextureToSelectedTriangles();
            return true;
        },
        /**
         * Drop texture en mode Face : albedo (+ normal / spéculaire) sur la face visée.
         * Sur une pièce Architecture, tous les panneaux de la même surface sont texturés.
         * @param {string | { color?: string, normal?: string, specular?: string, roughness?: string }} mapsOrColor
         * @param {number} clientX
         * @param {number} clientY
         * @param {{ tileX?: number, tileY?: number, offsetX?: number, offsetY?: number } | null} [transform]
         * @returns {Promise<boolean>}
         */
        applyDroppedFaceTexture: async (mapsOrColor, clientX, clientY, transform = null) => {
            const maps =
                typeof mapsOrColor === "string"
                    ? { color: mapsOrColor }
                    : mapsOrColor && typeof mapsOrColor === "object"
                      ? mapsOrColor
                      : {};
            if (!maps.color && !maps.normal && !maps.specular && !maps.roughness) return false;

            if (maps.color) {
                const img = await loadImageElement(maps.color);
                setFaceTexture(img);
            }

            const picked0 = pickPaintHit(clientX, clientY);
            if (!picked0?.entity || !picked0.mesh || !picked0.hit) {
                showStatus?.("Mode Face : visez une face, un mur ou une pièce du modèle");
                return false;
            }

            const tileX =
                typeof transform?.tileX === "number"
                    ? getTileRepeat({ value: transform.tileX })
                    : getTileRepeat(tileXInput);
            const tileY =
                typeof transform?.tileY === "number"
                    ? getTileRepeat({ value: transform.tileY })
                    : getTileRepeat(tileYInput);
            const offsetX =
                typeof transform?.offsetX === "number"
                    ? getTextureOffset({ value: transform.offsetX })
                    : getTextureOffset(offsetXInput);
            const offsetY =
                typeof transform?.offsetY === "number"
                    ? getTextureOffset({ value: transform.offsetY })
                    : getTextureOffset(offsetYInput);

            // Architecture : une seule face (intérieur/extérieur), continue autour de la porte.
            const surfaceId = getArchSurfaceId(picked0.mesh);
            if (isLabArchitecture(picked0.entity) && surfaceId) {
                const faceIndex = boxFaceIndexFromHit(picked0.mesh, picked0.hit);
                const count = await applyArchSurfaceTextureMaps(
                    picked0.entity,
                    surfaceId,
                    faceIndex,
                    maps,
                    tileX,
                    tileY,
                    offsetX,
                    offsetY
                );
                if (!count) {
                    showStatus?.("Aucun panneau sur cette surface");
                    return false;
                }
                if (maps.color || maps.normal || maps.specular || maps.roughness) {
                    const img = maps.color ? await loadImageElement(maps.color) : null;
                    liveFaceTextureTargets = [
                        {
                            object: picked0.entity,
                            surfaceId,
                            faceIndex,
                            image: img,
                            mesh: picked0.mesh,
                        },
                    ];
                    refreshFaceSelectionOverlay();
                }
                const stacked = [
                    maps.color ? "couleur" : null,
                    maps.normal ? "normal" : null,
                    maps.specular ? "spéculaire" : null,
                    maps.roughness ? "roughness" : null,
                ].filter(Boolean);
                showStatus?.(
                    `Mur « ${surfaceId} » face ${faceIndex} — ${count} panneau(x) — ${stacked.join(" + ")}`
                );
                return true;
            }

            if (!isPaintableBoxMesh(picked0.mesh)) {
                // Imports (Beetle…) : mode Face = la pièce (mesh) sous le curseur.
                const matIndex = Number.isInteger(picked0.hit?.face?.materialIndex)
                    ? picked0.hit.face.materialIndex
                    : 0;
                const ok = await applyMeshSlotTextureMaps(
                    picked0.entity,
                    picked0.mesh,
                    matIndex,
                    maps,
                    tileX,
                    tileY,
                    offsetX,
                    offsetY
                );
                if (!ok) {
                    showStatus?.("Impossible d’appliquer la texture sur cette pièce");
                    return false;
                }
                const img = maps.color ? await loadImageElement(maps.color) : null;
                liveFaceTextureTargets = [
                    {
                        object: picked0.entity,
                        mesh: picked0.mesh,
                        faceIndex: matIndex,
                        image: img,
                        tileX,
                        tileY,
                        offsetX,
                        offsetY,
                    },
                ];
                refreshFaceSelectionOverlay();
                const piece = picked0.mesh.name || `pièce`;
                const stacked = [
                    maps.color ? "couleur" : null,
                    maps.normal ? "normal" : null,
                    maps.specular ? "spéculaire" : null,
                    maps.roughness ? "roughness" : null,
                ].filter(Boolean);
                showStatus?.(`Pièce « ${piece} » — ${stacked.join(" + ")}`);
                return true;
            }
            if (ensurePaintReady(picked0.mesh)) {
                resyncObjectUv?.(picked0.entity);
            }
            const picked = pickPaintHit(clientX, clientY) || picked0;
            if (!picked?.mesh || !picked.hit || !picked.entity) return false;

            const faceIndex = boxFaceIndexFromHit(picked.mesh, picked.hit);
            pendingUndoBefore = captureFaceSnapshot(picked.entity, faceIndex, picked.mesh);

            await applyFaceMapsToSurface(
                picked.entity,
                picked.mesh,
                faceIndex,
                maps,
                tileX,
                tileY,
                offsetX,
                offsetY
            );

            if (maps.color || maps.normal || maps.specular || maps.roughness) {
                const img = maps.color ? await loadImageElement(maps.color) : null;
                liveFaceTextureTargets = [
                    {
                        object: picked.entity,
                        mesh: picked.mesh,
                        faceIndex,
                        image: img,
                    },
                ];
                refreshFaceSelectionOverlay();
            }

            commitPaintHistory(picked.entity, faceIndex, picked.mesh);
            const stacked = [
                maps.color ? "couleur" : null,
                maps.normal ? "normal" : null,
                maps.specular ? "spéculaire" : null,
                maps.roughness ? "roughness" : null,
            ].filter(Boolean);
            showStatus?.(
                stacked.length > 1 || !maps.color
                    ? `Empilé sur face ${faceIndex} : ${stacked.join(" + ")}`
                    : `Couleur sur la face ${faceIndex} — Tile = cette face`
            );
            return true;
        },
        /**
         * Mémorise la face / le mur sous le curseur (couleur, tile, drop).
         * @param {THREE.Object3D} object
         * @param {THREE.Mesh} mesh
         * @param {THREE.Intersection | null | undefined} hit
         */
        setLiveFaceFromHit: (object, mesh, hit = null) => {
            if (!object || !mesh) return false;
            const faceIndex =
                isPaintableBoxMesh(mesh) && hit
                    ? boxFaceIndexFromHit(mesh, hit)
                    : Number.isInteger(hit?.face?.materialIndex)
                      ? hit.face.materialIndex
                      : 0;
            const surfaceId = isLabArchitecture(object) ? getArchSurfaceId(mesh) : null;
            liveFaceTextureTargets = [
                {
                    object,
                    mesh,
                    faceIndex,
                    surfaceId: surfaceId || undefined,
                    image: null,
                },
            ];
            refreshFaceSelectionOverlay();
            return true;
        },
        clearFaceSelectionHighlight: () => {
            liveFaceTextureTargets = [];
            clearFaceSelectionOverlays();
        },
        /**
         * Teinte uniquement la dernière face / le dernier mur ciblé.
         * @param {string} hex
         * @returns {boolean}
         */
        applyLiveFaceColor: (hex) => {
            const entry = liveFaceTextureTargets[liveFaceTextureTargets.length - 1];
            if (!entry?.object || !Number.isInteger(entry.faceIndex)) return false;
            const color = new THREE.Color(hex || "#ffffff");

            /**
             * Teinte un slot en forçant un Standard opaque (sinon verre → intérieur transparent).
             * @param {THREE.Mesh} mesh
             * @param {number} faceIndex
             */
            const tintFaceSlot = (mesh, faceIndex) => {
                const materials = ensureFaceMaterials(mesh);
                let mat = materials[faceIndex];
                if (!mat) return;
                if (isResidualGlassOrTranslucent(mat) || mat.isMeshPhysicalMaterial) {
                    mat = createFreshOpaqueStandardMaterial(mat, {
                        roughness:
                            typeof mat.roughness === "number"
                                ? mat.roughness
                                : FACE_MAT_DEFAULTS.roughness,
                        metalness:
                            typeof mat.metalness === "number"
                                ? mat.metalness
                                : FACE_MAT_DEFAULTS.metalness,
                        opacity: 1,
                    });
                    materials[faceIndex] = mat;
                    mesh.material = materials;
                }
                mat.color.copy(color);
                mat.transparent = false;
                mat.opacity = 1;
                mat.depthWrite = true;
                mat.side = THREE.FrontSide;
                if (typeof mat.transmission === "number") mat.transmission = 0;
                if (mat.userData) delete mat.userData._labGlass;
                mat.needsUpdate = true;
            };

            if (entry.surfaceId && isLabArchitecture(entry.object)) {
                const meshes = getArchSurfaceMeshes(entry.object, entry.surfaceId);
                if (!meshes.length) return false;
                const opp = oppositeBoxFaceIndex(entry.faceIndex);
                for (const mesh of meshes) {
                    ensurePaintReady(mesh);
                    // Mur mince : colorer intérieur + extérieur, sinon un côté reste verre/troué.
                    tintFaceSlot(mesh, entry.faceIndex);
                    tintFaceSlot(mesh, opp);
                }
                if (!entry.object.userData[ARCH_SURFACE_TEX_KEY]) {
                    entry.object.userData[ARCH_SURFACE_TEX_KEY] = {};
                }
                const store = entry.object.userData[ARCH_SURFACE_TEX_KEY];
                const key = archSurfaceFaceKey(entry.surfaceId, entry.faceIndex);
                const oppKey = archSurfaceFaceKey(entry.surfaceId, opp);
                store[key] = {
                    ...(store[key] || {}),
                    tintHex: color.getHexString(),
                    opacity: 1,
                    glass: false,
                };
                store[oppKey] = {
                    ...(store[oppKey] || {}),
                    tintHex: color.getHexString(),
                    opacity: 1,
                    glass: false,
                };
                return true;
            }

            if (!entry.mesh) return false;
            // Import / mesh non-boîte : teinte la pièce cliquée (slot matériau).
            if (!isPaintableBoxMesh(entry.mesh)) {
                return applyMeshSlotColor(entry.object, entry.mesh, entry.faceIndex, hex);
            }
            ensurePaintReady(entry.mesh);
            const opp = oppositeBoxFaceIndex(entry.faceIndex);
            tintFaceSlot(entry.mesh, entry.faceIndex);
            tintFaceSlot(entry.mesh, opp);
            if (!entry.object.userData[FACE_PBR_STORE_KEY]) {
                entry.object.userData[FACE_PBR_STORE_KEY] = {};
            }
            const pbr = entry.object.userData[FACE_PBR_STORE_KEY];
            for (const fi of [entry.faceIndex, opp]) {
                const storeKey = `${entry.mesh.uuid}:${fi}`;
                pbr[storeKey] = {
                    ...(pbr[storeKey] || {}),
                    tintHex: color.getHexString(),
                    opacity: 1,
                    glass: false,
                };
            }
            return true;
        },
        getLiveFaceColor: () => {
            const entry = liveFaceTextureTargets[liveFaceTextureTargets.length - 1];
            if (!entry) return null;
            if (entry.surfaceId && entry.object) {
                const key = archSurfaceFaceKey(entry.surfaceId, entry.faceIndex);
                const tint = entry.object.userData?.[ARCH_SURFACE_TEX_KEY]?.[key]?.tintHex;
                if (tint) return `#${String(tint).replace(/^#/, "")}`;
                const meshes = getArchSurfaceMeshes(entry.object, entry.surfaceId);
                const mat = Array.isArray(meshes[0]?.material)
                    ? meshes[0].material[entry.faceIndex]
                    : meshes[0]?.material;
                if (mat?.color?.getHexString) return `#${mat.color.getHexString()}`;
            }
            if (entry.mesh && entry.object) {
                const storeKey = `${entry.mesh.uuid}:${entry.faceIndex}`;
                const tint = entry.object.userData?.[FACE_PBR_STORE_KEY]?.[storeKey]?.tintHex;
                if (tint) return `#${String(tint).replace(/^#/, "")}`;
            }
            const mats = Array.isArray(entry.mesh?.material)
                ? entry.mesh.material
                : [entry.mesh?.material];
            const idx = Math.max(0, Math.min(mats.length - 1, entry.faceIndex || 0));
            const mat = mats[idx];
            if (mat?.color?.getHexString) return `#${mat.color.getHexString()}`;
            return null;
        },
        /**
         * Matériau (rugosité / métallique / opacité / verre) sur la dernière face ciblée.
         * @param {{ roughness?: number, metalness?: number, opacity?: number, glass?: boolean, metalPreset?: boolean, clearGlass?: boolean }} props
         * @returns {boolean}
         */
        applyLiveFaceMaterial: (props) => {
            const entry = liveFaceTextureTargets[liveFaceTextureTargets.length - 1];
            if (!entry?.object || !Number.isInteger(entry.faceIndex)) return false;
            if (entry.surfaceId && isLabArchitecture(entry.object)) {
                return applyArchSurfaceMaterialProps(
                    entry.object,
                    entry.surfaceId,
                    entry.faceIndex,
                    props || {}
                );
            }
            if (!entry.mesh) return false;
            // Cubes / panneaux : 6 faces. Imports : slot matériau existant (ne pas écraser en 6 mats).
            if (isPaintableBoxMesh(entry.mesh)) {
                return applyBoxFaceMaterialProps(entry.object, entry.mesh, entry.faceIndex, props || {});
            }
            return applyMeshSlotMaterialProps(entry.object, entry.mesh, entry.faceIndex, props || {});
        },
        getLiveFaceMaterial: () => {
            const entry = liveFaceTextureTargets[liveFaceTextureTargets.length - 1];
            if (!entry?.object || !Number.isInteger(entry.faceIndex)) return null;
            if (entry.surfaceId && isLabArchitecture(entry.object)) {
                const key = archSurfaceFaceKey(entry.surfaceId, entry.faceIndex);
                const store = entry.object.userData?.[ARCH_SURFACE_TEX_KEY]?.[key];
                if (store && (typeof store.roughness === "number" || store.glass)) {
                    return readMaterialPropsFromStore(store, ARCH_MAT_DEFAULTS);
                }
                const meshes = getArchSurfaceMeshes(entry.object, entry.surfaceId);
                const mat = Array.isArray(meshes[0]?.material)
                    ? meshes[0].material[entry.faceIndex]
                    : meshes[0]?.material;
                return readMaterialPropsFromMat(mat, ARCH_MAT_DEFAULTS);
            }
            if (!entry.mesh) return null;
            const storeKey = `${entry.mesh.uuid}:${entry.faceIndex}`;
            const store = entry.object.userData?.[FACE_PBR_STORE_KEY]?.[storeKey];
            if (store && (typeof store.roughness === "number" || store.glass)) {
                return readMaterialPropsFromStore(store, FACE_MAT_DEFAULTS);
            }
            const mats = Array.isArray(entry.mesh.material) ? entry.mesh.material : [entry.mesh.material];
            const idx = Math.max(0, Math.min(mats.length - 1, entry.faceIndex));
            return readMaterialPropsFromMat(mats[idx], FACE_MAT_DEFAULTS);
        },
        /**
         * Matériau sur les overlays triangles live (dernier lot texturé).
         * @param {{ roughness?: number, metalness?: number, opacity?: number, glass?: boolean, metalPreset?: boolean, clearGlass?: boolean }} props
         * @returns {boolean}
         */
        applyLiveTriangleMaterial: (props) =>
            applyTriangleOverlaysMaterial(liveTriangleTextureOverlays, props || {}),
        applyLiveTriangleColor: (hex) => applyLiveTriangleColor(hex),
        getLiveTriangleColor: () => getLiveTriangleColor(),
        getLiveTriangleMaterial: () => {
            const overlays = liveTriangleTextureOverlays.filter((o) => o?.parent);
            if (!overlays.length) return null;
            const overlay = overlays[overlays.length - 1];
            const mat = /** @type {THREE.MeshStandardMaterial} */ (overlay.material);
            return {
                roughness:
                    typeof overlay.userData._labRoughness === "number"
                        ? overlay.userData._labRoughness
                        : typeof mat?.roughness === "number"
                          ? mat.roughness
                          : TRI_MAT_DEFAULTS.roughness,
                metalness:
                    typeof overlay.userData._labMetalness === "number"
                        ? overlay.userData._labMetalness
                        : typeof mat?.metalness === "number"
                          ? mat.metalness
                          : TRI_MAT_DEFAULTS.metalness,
                opacity:
                    typeof overlay.userData._labOpacity === "number"
                        ? overlay.userData._labOpacity
                        : typeof mat?.opacity === "number"
                          ? mat.opacity
                          : TRI_MAT_DEFAULTS.opacity,
                glass: !!overlay.userData._labGlass,
                reflection:
                    typeof overlay.userData._labReflection === "number"
                        ? overlay.userData._labReflection
                        : TRI_MAT_DEFAULTS.reflection,
            };
        },
        /** Dernière face texturée (pour Tile / Offset live + undo). */
        getLiveFaceTextureTarget: () => liveFaceTextureTargets[liveFaceTextureTargets.length - 1] || null,
        getLiveFaceTextureTransform: () => {
            const entry = liveFaceTextureTargets[liveFaceTextureTargets.length - 1];
            if (!entry) return null;
            /** @type {THREE.Texture | null | undefined} */
            let ref = null;
            if (entry.surfaceId && entry.object && Number.isInteger(entry.faceIndex)) {
                const key = archSurfaceFaceKey(entry.surfaceId, entry.faceIndex);
                const store = entry.object.userData?.[ARCH_SURFACE_TEX_KEY]?.[key];
                ref = store?.color || store?.normal || store?.specular || null;
            } else if (entry.mesh && Number.isInteger(entry.faceIndex)) {
                const mats = Array.isArray(entry.mesh.material)
                    ? entry.mesh.material
                    : [entry.mesh.material];
                const idx = Math.max(0, Math.min(mats.length - 1, entry.faceIndex));
                const mat = mats[idx];
                ref =
                    mat?.userData?.[FACE_ALBEDO_MAP_KEY] ||
                    mat?.userData?.[FACE_NORMAL_MAP_KEY] ||
                    mat?.map ||
                    null;
                if (
                    mat &&
                    typeof mat.userData?._labTileX === "number" &&
                    (!ref || typeof ref.repeat?.x !== "number")
                ) {
                    return {
                        tileX: mat.userData._labTileX,
                        tileY: mat.userData._labTileY ?? 1,
                        offsetX: mat.userData._labOffsetX ?? 0,
                        offsetY: mat.userData._labOffsetY ?? 0,
                    };
                }
            }
            if (!ref) return null;
            return {
                tileX: typeof ref.repeat?.x === "number" ? ref.repeat.x : 1,
                tileY: typeof ref.repeat?.y === "number" ? ref.repeat.y : 1,
                offsetX: typeof ref.offset?.x === "number" ? ref.offset.x : 0,
                offsetY: typeof ref.offset?.y === "number" ? ref.offset.y : 0,
            };
        },
    };
}

/**
 * @param {string} dataUrl
 * @returns {Promise<HTMLImageElement>}
 */
const _labImageElementCache = new Map();

function loadImageElement(dataUrl) {
    if (!dataUrl) return Promise.reject(new Error("Image invalide"));
    const cached = _labImageElementCache.get(dataUrl);
    if (cached?.complete && cached.naturalWidth > 0) {
        return Promise.resolve(cached);
    }
    return loadImageElementFresh(dataUrl);
}

/**
 * @param {string} dataUrl
 * @returns {Promise<HTMLImageElement>}
 */
function loadImageElementFresh(dataUrl) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
            _labImageElementCache.set(dataUrl, img);
            if (_labImageElementCache.size > 48) {
                const first = _labImageElementCache.keys().next().value;
                if (first) _labImageElementCache.delete(first);
            }
            resolve(img);
        };
        img.onerror = () => reject(new Error("Image invalide"));
        img.src = dataUrl;
    });
}

