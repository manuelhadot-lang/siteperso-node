/** Soustraction booléenne (perforations) — Manifold en priorité, fallback three-csg-ts. */
import * as THREE from "three";
import { CSG } from "three-csg-ts";
import Module from "manifold-3d";
import { mergeBufferGeometries, mergeVertices } from "three/addons/utils/BufferGeometryUtils.js";
import { disposeFacePaint } from "./lab-face-draw.js";
import { ensureObjectMaterial } from "./lab-object-textures.js";
import { disposeShadowOverlay } from "./lab-shadows.js";

export const LAB_CSG_KEY = "labCsg";

const MAX_CSG_TRIANGLES = 80000;
const WELD_TOLERANCE = 1e-4;
/** Scale interne : les panneaux (~4 cm) sont trop fins pour un booléen float fiable. */
const MANIFOLD_SCALE = 1000;
/** Légère inflation du cutter pour éviter les faces coplanaires / trous ouverts. */
const CUTTER_INFLATE = 1.0025;

/** @type {null | Promise<{ Mesh: any, Manifold: any }>} */
let manifoldReady = null;

/**
 * Charge Manifold WASM une seule fois.
 * @returns {Promise<{ Mesh: any, Manifold: any }>}
 */
function ensureManifold() {
    if (!manifoldReady) {
        manifoldReady = Module({
            locateFile: (path) =>
                `https://cdn.jsdelivr.net/npm/manifold-3d@2.5.1/${path}`,
        }).then((wasm) => {
            wasm.setup();
            return { Mesh: wasm.Mesh, Manifold: wasm.Manifold };
        });
    }
    return manifoldReady;
}

/**
 * @param {THREE.Object3D} object
 * @returns {THREE.Mesh[]}
 */
export function getLabContentMeshes(object) {
    /** @type {THREE.Mesh[]} */
    const meshes = [];
    if (!object) return meshes;
    object.traverse((child) => {
        if (!(child instanceof THREE.Mesh)) return;
        if (child.name === "shadow-overlay") return;
        if (!child.geometry?.attributes?.position) return;
        meshes.push(child);
    });
    return meshes;
}

/**
 * @param {THREE.Object3D} object
 * @returns {THREE.Mesh | null}
 */
export function getLabContentMesh(object) {
    return getLabContentMeshes(object)[0] || null;
}

/**
 * @param {THREE.BufferGeometry} geometry
 */
function countTriangles(geometry) {
    if (!geometry?.attributes?.position) return 0;
    if (geometry.index) return Math.floor(geometry.index.count / 3);
    return Math.floor(geometry.attributes.position.count / 3);
}

/**
 * @param {THREE.BufferGeometry} geometry
 * @param {number} [minArea]
 * @returns {THREE.BufferGeometry}
 */
function removeDegenerateTriangles(geometry, minArea = 1e-12) {
    const pos = geometry.attributes.position;
    if (!pos) return geometry;

    /** @type {number[]} */
    let indices;
    if (geometry.index) {
        indices = Array.from(geometry.index.array);
    } else {
        indices = [];
        for (let i = 0; i < pos.count; i += 1) indices.push(i);
    }

    const a = new THREE.Vector3();
    const b = new THREE.Vector3();
    const c = new THREE.Vector3();
    const ab = new THREE.Vector3();
    const ac = new THREE.Vector3();
    /** @type {number[]} */
    const kept = [];

    for (let i = 0; i < indices.length; i += 3) {
        const ia = indices[i];
        const ib = indices[i + 1];
        const ic = indices[i + 2];
        a.fromBufferAttribute(pos, ia);
        b.fromBufferAttribute(pos, ib);
        c.fromBufferAttribute(pos, ic);
        ab.subVectors(b, a);
        ac.subVectors(c, a);
        const area = ab.cross(ac).length() * 0.5;
        if (area >= minArea && Number.isFinite(area)) {
            kept.push(ia, ib, ic);
        }
    }

    if (kept.length === indices.length) {
        if (!geometry.index) geometry.setIndex(indices);
        return geometry;
    }

    const out = new THREE.BufferGeometry();
    out.setAttribute("position", pos.clone());
    out.setIndex(kept);
    return out;
}

/**
 * Géométrie monde (positions soudées) pour booléen.
 * @param {THREE.BufferGeometry} source
 * @param {THREE.Matrix4} matrix
 */
function prepareGeometry(source, matrix) {
    const positioned = new THREE.BufferGeometry();
    positioned.setAttribute("position", source.attributes.position.clone());
    if (source.index) {
        positioned.setIndex(source.index.clone());
    } else {
        const count = source.attributes.position.count;
        const idx = new Uint32Array(count);
        for (let i = 0; i < count; i += 1) idx[i] = i;
        positioned.setIndex(new THREE.BufferAttribute(idx, 1));
    }
    positioned.applyMatrix4(matrix);

    let welded = mergeVertices(positioned, WELD_TOLERANCE);
    positioned.dispose();

    const cleaned = removeDegenerateTriangles(welded);
    if (cleaned !== welded) {
        welded.dispose();
        welded = cleaned;
    }

    const rewelded = mergeVertices(welded, WELD_TOLERANCE);
    if (rewelded !== welded) {
        welded.dispose();
        welded = rewelded;
    }

    welded.computeVertexNormals();
    return welded;
}

/**
 * @param {THREE.Object3D} object
 * @returns {THREE.BufferGeometry}
 */
function buildWorldGeometry(object) {
    object.updateMatrixWorld(true);
    const meshes = getLabContentMeshes(object);
    if (!meshes.length) throw new Error("Géométrie introuvable");

    const parts = meshes.map((mesh) => prepareGeometry(mesh.geometry, mesh.matrixWorld));
    const totalTris = parts.reduce((sum, g) => sum + countTriangles(g), 0);
    if (totalTris > MAX_CSG_TRIANGLES) {
        parts.forEach((g) => g.dispose());
        throw new Error(
            `Objet trop dense pour perforer (${totalTris.toLocaleString("fr-FR")} triangles, max ${MAX_CSG_TRIANGLES.toLocaleString("fr-FR")})`
        );
    }

    if (parts.length === 1) return parts[0];

    const merged = mergeBufferGeometries(parts, false);
    parts.forEach((g) => g.dispose());
    if (!merged) throw new Error("Impossible de fusionner les maillages de l’objet");
    return merged;
}

/**
 * @param {any} Mesh
 * @param {THREE.BufferGeometry} geometry
 */
function geometryToManifoldMesh(Mesh, geometry) {
    let geo = geometry;
    if (!geo.index) {
        const welded = mergeVertices(geo, WELD_TOLERANCE);
        if (welded !== geo) geo = welded;
    }

    const posAttr = geo.attributes.position;
    const vertCount = posAttr.count;
    const vertProperties = new Float32Array(vertCount * 3);
    for (let i = 0; i < vertCount; i += 1) {
        vertProperties[i * 3] = posAttr.getX(i);
        vertProperties[i * 3 + 1] = posAttr.getY(i);
        vertProperties[i * 3 + 2] = posAttr.getZ(i);
    }

    const indexArray = geo.index.array;
    const triVerts =
        indexArray instanceof Uint32Array
            ? indexArray.slice()
            : new Uint32Array(indexArray);

    const mesh = new Mesh({
        numProp: 3,
        vertProperties,
        triVerts,
    });
    mesh.merge();
    return mesh;
}

/**
 * @param {any} manifold
 * @returns {THREE.BufferGeometry}
 */
function manifoldToGeometry(manifold) {
    const out = manifold.getMesh();
    const numProp = out.numProp || 3;
    const vertCount = out.vertProperties.length / numProp;
    const positions = new Float32Array(vertCount * 3);
    for (let i = 0; i < vertCount; i += 1) {
        const o = i * numProp;
        positions[i * 3] = out.vertProperties[o];
        positions[i * 3 + 1] = out.vertProperties[o + 1];
        positions[i * 3 + 2] = out.vertProperties[o + 2];
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geometry.setIndex(new THREE.BufferAttribute(new Uint32Array(out.triVerts), 1));
    return geometry;
}

/**
 * Agrandit légèrement une géométrie autour de son centre (évite les coplanarités).
 * @param {THREE.BufferGeometry} geometry
 * @param {number} factor
 * @returns {THREE.BufferGeometry}
 */
function inflateGeometryInPlace(geometry, factor) {
    if (!geometry?.attributes?.position || !(factor > 1)) return geometry;
    geometry.computeBoundingBox();
    const box = geometry.boundingBox;
    if (!box) return geometry;
    const cx = (box.min.x + box.max.x) * 0.5;
    const cy = (box.min.y + box.max.y) * 0.5;
    const cz = (box.min.z + box.max.z) * 0.5;
    const pos = geometry.attributes.position;
    for (let i = 0; i < pos.count; i += 1) {
        pos.setXYZ(
            i,
            cx + (pos.getX(i) - cx) * factor,
            cy + (pos.getY(i) - cy) * factor,
            cz + (pos.getZ(i) - cz) * factor
        );
    }
    pos.needsUpdate = true;
    geometry.computeBoundingBox();
    return geometry;
}

/**
 * UV planaires de secours (XZ) pour texturer après CSG.
 * @param {THREE.BufferGeometry} geometry
 */
function ensurePlanarUv(geometry) {
    if (geometry.attributes?.uv) return;
    const pos = geometry.attributes?.position;
    if (!pos) return;
    geometry.computeBoundingBox();
    const bbox = geometry.boundingBox;
    if (!bbox) return;
    const sizeX = Math.max(1e-6, bbox.max.x - bbox.min.x);
    const sizeY = Math.max(1e-6, bbox.max.y - bbox.min.y);
    const uv = new Float32Array(pos.count * 2);
    for (let i = 0; i < pos.count; i += 1) {
        uv[i * 2] = (pos.getX(i) - bbox.min.x) / sizeX;
        uv[i * 2 + 1] = (pos.getY(i) - bbox.min.y) / sizeY;
    }
    geometry.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
}

/**
 * Booléen Manifold (haute qualité).
 * @param {THREE.BufferGeometry} geomA
 * @param {THREE.BufferGeometry} geomB
 * @returns {Promise<THREE.BufferGeometry>}
 */
async function subtractWithManifold(geomA, geomB) {
    const { Mesh, Manifold } = await ensureManifold();

    // Scale up pour fiabiliser les parois fines (panneau 4 cm, etc.)
    const scaledA = geomA.clone();
    const scaledB = geomB.clone();
    scaledA.scale(MANIFOLD_SCALE, MANIFOLD_SCALE, MANIFOLD_SCALE);
    scaledB.scale(MANIFOLD_SCALE, MANIFOLD_SCALE, MANIFOLD_SCALE);
    inflateGeometryInPlace(scaledB, CUTTER_INFLATE);

    const meshA = geometryToManifoldMesh(Mesh, scaledA);
    const meshB = geometryToManifoldMesh(Mesh, scaledB);
    scaledA.dispose();
    scaledB.dispose();

    let manA = null;
    let manB = null;
    let manResult = null;

    try {
        manA = new Manifold(meshA);
        manB = new Manifold(meshB);
        manResult = manA.subtract(manB);

        if (manResult.isEmpty?.() || manResult.numTri === 0) {
            throw new Error("Résultat vide — les objets ne se chevauchent peut‑être pas");
        }

        let geometry = manifoldToGeometry(manResult);
        geometry.scale(1 / MANIFOLD_SCALE, 1 / MANIFOLD_SCALE, 1 / MANIFOLD_SCALE);
        geometry = finalizeCsgGeometry(geometry);
        return geometry;
    } finally {
        manResult?.delete?.();
        manA?.delete?.();
        manB?.delete?.();
        meshA?.delete?.();
        meshB?.delete?.();
    }
}

/**
 * Fallback three-csg-ts (moins propre).
 * @param {THREE.BufferGeometry} geomA
 * @param {THREE.BufferGeometry} geomB
 * @param {THREE.Material} material
 * @returns {THREE.BufferGeometry}
 */
function subtractWithThreeCsg(geomA, geomB, material) {
    const CSG_SCALE = 1000;
    const a = geomA.clone();
    const b = geomB.clone();
    a.scale(CSG_SCALE, CSG_SCALE, CSG_SCALE);
    b.scale(CSG_SCALE, CSG_SCALE, CSG_SCALE);
    inflateGeometryInPlace(b, CUTTER_INFLATE);
    a.computeVertexNormals();
    b.computeVertexNormals();
    if (!a.attributes.uv) {
        a.setAttribute(
            "uv",
            new THREE.BufferAttribute(new Float32Array(a.attributes.position.count * 2), 2)
        );
    }
    if (!b.attributes.uv) {
        b.setAttribute(
            "uv",
            new THREE.BufferAttribute(new Float32Array(b.attributes.position.count * 2), 2)
        );
    }

    const meshA = new THREE.Mesh(a, material);
    const meshB = new THREE.Mesh(b, material);
    meshA.updateMatrix();
    meshB.updateMatrix();

    const resultMesh = CSG.subtract(meshA, meshB);
    a.dispose();
    b.dispose();

    if (!resultMesh.geometry?.attributes?.position?.count) {
        throw new Error("Résultat vide — les objets ne se chevauchent peut‑être pas");
    }

    resultMesh.geometry.scale(1 / CSG_SCALE, 1 / CSG_SCALE, 1 / CSG_SCALE);
    return finalizeCsgGeometry(resultMesh.geometry);
}

/**
 * Post-traitement léger : ne pas reconstruire les normales à plis
 * (ça ouvrait les parois internes des trous sur panneaux fins).
 * @param {THREE.BufferGeometry} geometry
 * @returns {THREE.BufferGeometry}
 */
function finalizeCsgGeometry(geometry) {
    let geo = removeDegenerateTriangles(geometry, 1e-14);
    if (geo !== geometry) geometry.dispose();

    const welded = mergeVertices(geo, WELD_TOLERANCE);
    if (welded !== geo) geo.dispose();

    welded.computeVertexNormals();
    ensurePlanarUv(welded);
    welded.computeBoundingBox();
    welded.computeBoundingSphere();
    return welded;
}

/**
 * @param {THREE.Object3D} object
 */
export function canCsgLabObject(object) {
    return getLabContentMeshes(object).length > 0;
}

/**
 * Soustrait « cutter » de « target » (target − cutter).
 * @param {THREE.Object3D} target
 * @param {THREE.Object3D} cutter
 * @returns {Promise<{ geometry: THREE.BufferGeometry, center: THREE.Vector3, material: THREE.Material }>}
 */
export async function subtractLabObjects(target, cutter) {
    if (!canCsgLabObject(target) || !canCsgLabObject(cutter)) {
        throw new Error("Objets invalides pour la perforation");
    }

    const srcTarget = getLabContentMesh(target);
    if (!srcTarget) throw new Error("Géométrie introuvable");

    const geomA = buildWorldGeometry(target);
    const geomB = buildWorldGeometry(cutter);

    const material = ensureObjectMaterial(srcTarget).clone();
    material.flatShading = false;
    // DoubleSide : les faces internes du trou restent visibles même si une normale est ambiguë.
    material.side = THREE.DoubleSide;
    material.needsUpdate = true;

    /** @type {THREE.BufferGeometry} */
    let geo;
    try {
        geo = await subtractWithManifold(geomA, geomB);
    } catch (manifoldError) {
        console.warn("[lab-csg] Manifold indisponible, fallback three-csg-ts:", manifoldError);
        try {
            geo = subtractWithThreeCsg(geomA, geomB, material);
        } catch (fallbackError) {
            geomA.dispose();
            geomB.dispose();
            material.dispose();
            throw fallbackError instanceof Error
                ? fallbackError
                : new Error("Perforation impossible");
        }
    }

    geomA.dispose();
    geomB.dispose();

    if (!geo.attributes?.position?.count) {
        material.dispose();
        geo.dispose();
        throw new Error("Résultat vide — les objets ne se chevauchent peut‑être pas");
    }

    geo.computeBoundingBox();
    const center = new THREE.Vector3();
    geo.boundingBox.getCenter(center);
    geo.translate(-center.x, -center.y, -center.z);
    // Ne pas rappeler computeVertexNormals() : écraserait les normales à plis.
    geo.computeBoundingBox();
    geo.computeBoundingSphere();

    return { geometry: geo, center, material };
}

/** @deprecated */
export const subtractLabCube = subtractLabObjects;

/**
 * @param {THREE.Mesh} mesh
 * @param {{ disposeGeometry?: boolean }} [opts]
 */
function disposeMeshResources(mesh, { disposeGeometry = true } = {}) {
    disposeShadowOverlay(mesh);
    const shared = !!mesh.userData?.vegetationSharedResources;
    if (disposeGeometry && !shared) {
        mesh.geometry?.dispose();
    }
    if (!shared || mesh.userData?.vegetationClonedMaterials) {
        const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        materials.forEach((mat) => mat?.dispose?.());
    }
}

/**
 * @param {THREE.Object3D} target
 * @param {{ geometry: THREE.BufferGeometry, center: THREE.Vector3, material: THREE.Material }} result
 */
export function applyCsgResultToLabObject(target, result) {
    const meshes = getLabContentMeshes(target);
    if (!meshes.length) throw new Error("Mesh cible introuvable");

    disposeFacePaint(target, { keepMaterials: false });

    const primary = meshes[0];
    const primaryWasShared = !!primary.userData?.vegetationSharedResources;
    primary.parent?.remove(primary);

    while (target.children.length) {
        const child = target.children[0];
        target.remove(child);
        child.traverse((node) => {
            if (!(node instanceof THREE.Mesh)) return;
            if (node === primary) return;
            disposeMeshResources(node);
        });
    }

    disposeMeshResources(primary, { disposeGeometry: !primaryWasShared });

    primary.geometry = result.geometry;
    primary.material = result.material;
    primary.position.set(0, 0, 0);
    primary.rotation.set(0, 0, 0);
    primary.scale.set(1, 1, 1);
    primary.name = "lab-csg-mesh";
    delete primary.userData.labVegetationMesh;
    delete primary.userData.skipObjectPbr;
    delete primary.userData.vegetationSharedResources;
    delete primary.userData.vegetationClonedMaterials;
    delete primary.userData.vegetationOwnsDepthMaterial;
    delete primary.userData.shadowOverlay;

    target.add(primary);

    target.position.copy(result.center);
    target.rotation.set(0, 0, 0);
    target.scale.set(1, 1, 1);

    target.userData[LAB_CSG_KEY] = true;
    delete target.userData.labShape;
    delete target.userData.labStair;
    delete target.userData.stairStepCount;
    delete target.userData.labVegetation;
    delete target.userData.vegetationType;
    delete target.userData.vegetationSeed;
    delete target.userData.vegetationHeight;
    delete target.userData.vegetationAssetId;
    delete target.userData.vegetationAssetName;
    delete target.userData.vegetationBrightness;
    delete target.userData.vegetationGroundRadius;
    delete target.userData.skipObjectPbr;

    target.updateMatrixWorld(true);
}

/**
 * @param {THREE.Object3D} object
 * @returns {object | null}
 */
export function serializeCsgGeometry(object) {
    const mesh = getLabContentMesh(object);
    if (!mesh?.geometry) return null;
    return mesh.geometry.toJSON();
}

/**
 * @param {object} geometryJSON
 * @param {{ color?: string, roughness?: number, metalness?: number }} [materialOpts]
 * @returns {THREE.Group}
 */
export function createCsgPivotFromGeometry(geometryJSON, materialOpts = {}) {
    const loader = new THREE.BufferGeometryLoader();
    let geometry = loader.parse(geometryJSON);
    const cleaned = finalizeCsgGeometry(geometry);
    if (cleaned !== geometry) {
        geometry.dispose();
        geometry = cleaned;
    }

    const pivot = new THREE.Group();
    const mesh = new THREE.Mesh(
        geometry,
        new THREE.MeshStandardMaterial({
            color: materialOpts.color || "#00d1ff",
            roughness: typeof materialOpts.roughness === "number" ? materialOpts.roughness : 0.65,
            metalness: typeof materialOpts.metalness === "number" ? materialOpts.metalness : 0.05,
            flatShading: false,
            side: THREE.DoubleSide,
            envMapIntensity: 1.15,
        })
    );
    mesh.name = "lab-csg-mesh";
    pivot.add(mesh);
    pivot.userData[LAB_CSG_KEY] = true;
    return pivot;
}
