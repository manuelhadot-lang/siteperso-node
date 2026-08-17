/** Épaississement (Solidify) — ferme visuellement les coques CAD ouvertes. */
import * as THREE from "three";
import { mergeVertices } from "three/addons/utils/BufferGeometryUtils.js";

export const LAB_SOLIDIFIED_KEY = "_labSolidified";
export const DEFAULT_SOLIDIFY_THICKNESS = 0.02;
export const MIN_SOLIDIFY_THICKNESS = 0.001;
export const MAX_SOLIDIFY_THICKNESS = 0.5;

/**
 * Snapshot des meshes épaissis (ids stables d’import).
 * @param {THREE.Object3D} root
 * @returns {Array<{ meshId: number, thickness: number, meshName?: string }> | null}
 */
export function serializeMeshSolidify(root) {
    if (!root) return null;
    /** @type {Array<{ meshId: number, thickness: number, meshName?: string }>} */
    const out = [];
    root.traverse((child) => {
        if (!(child instanceof THREE.Mesh)) return;
        if (!child.userData?.[LAB_SOLIDIFIED_KEY]) return;
        const meshId = child.userData._labMeshPersistId;
        if (typeof meshId !== "number") return;
        out.push({
            meshId,
            thickness: clampSolidifyThickness(child.userData._labSolidifyThickness),
            meshName: child.name || undefined,
        });
    });
    return out.length ? out : null;
}

/**
 * Réapplique l’épaississement après rechargement du GLB brut.
 * @param {THREE.Object3D} root
 * @param {Array<{ meshId?: number, thickness?: number, meshName?: string }> | null | undefined} data
 */
export function applyMeshSolidifyData(root, data) {
    if (!root || !Array.isArray(data) || !data.length) return;
    /** @type {Map<number, THREE.Mesh>} */
    const byId = new Map();
    /** @type {Map<string, THREE.Mesh>} */
    const byName = new Map();
    root.traverse((child) => {
        if (!(child instanceof THREE.Mesh) || !child.geometry) return;
        if (typeof child.userData?._labMeshPersistId === "number") {
            byId.set(child.userData._labMeshPersistId, child);
        }
        if (child.name) byName.set(child.name, child);
    });
    for (const entry of data) {
        if (!entry || typeof entry !== "object") continue;
        let mesh =
            typeof entry.meshId === "number" ? byId.get(entry.meshId) || null : null;
        if (!mesh && entry.meshName) mesh = byName.get(entry.meshName) || null;
        if (!mesh || mesh.userData?.[LAB_SOLIDIFIED_KEY]) continue;
        try {
            solidifyMesh(mesh, entry.thickness);
        } catch (err) {
            console.warn("[lab-solidify] restore:", err);
        }
    }
}

/**
 * @param {number} value
 * @returns {number}
 */
export function clampSolidifyThickness(value) {
    const n = Number(value);
    if (!Number.isFinite(n)) return DEFAULT_SOLIDIFY_THICKNESS;
    return THREE.MathUtils.clamp(n, MIN_SOLIDIFY_THICKNESS, MAX_SOLIDIFY_THICKNESS);
}

/**
 * Tolérance de soudure adaptée à la taille du mesh (ferme les micro-fissures CAD).
 * @param {THREE.BufferGeometry} geometry
 * @param {number} [override]
 */
function resolveWeldEps(geometry, override) {
    if (typeof override === "number" && Number.isFinite(override) && override > 0) {
        return override;
    }
    geometry.computeBoundingBox();
    const box = geometry.boundingBox;
    if (!box) return 5e-4;
    const size = new THREE.Vector3();
    box.getSize(size);
    const diag = size.length() || 1;
    // ~0,5 mm mini, sinon ~0,04 % de la diagonale (ex. 0,8 mm sur 2 m).
    return Math.max(5e-4, diag * 4e-4);
}

/**
 * Bords libres d’une géométrie indexée : arêtes présentes une seule fois.
 * @param {THREE.BufferGeometry} geometry
 * @returns {{ edges: Array<[number, number]>, edgeSet: Set<string> }}
 */
function findIndexedBoundaryEdges(geometry) {
    const index = geometry.index;
    const pos = geometry.attributes.position;
    if (!index || !pos) return { edges: [], edgeSet: new Set() };

    /** @type {Map<string, [number, number]>} */
    const once = new Map();
    /** @type {Set<string>} */
    const gone = new Set();

    const keyOf = (a, b) => (a < b ? `${a}_${b}` : `${b}_${a}`);

    const triCount = Math.floor(index.count / 3);
    for (let t = 0; t < triCount; t += 1) {
        const i0 = index.getX(t * 3);
        const i1 = index.getX(t * 3 + 1);
        const i2 = index.getX(t * 3 + 2);
        const sides = [
            [i0, i1],
            [i1, i2],
            [i2, i0],
        ];
        for (const [a, b] of sides) {
            if (a === b) continue;
            const key = keyOf(a, b);
            if (gone.has(key)) continue;
            if (once.has(key)) {
                once.delete(key);
                gone.add(key);
            } else {
                once.set(key, [a, b]);
            }
        }
    }

    return {
        edges: [...once.values()],
        edgeSet: new Set(once.keys()),
    };
}

/**
 * Épaissit une BufferGeometry : face avant + face arrière + bande sur bords libres.
 * Soude d’abord les micro-fissures CAD pour éviter des « rayures » sur la surface.
 * @param {THREE.BufferGeometry} geometry
 * @param {number} [thickness]
 * @param {{ weldEps?: number }} [opts]
 * @returns {{ geometry: THREE.BufferGeometry, boundaryEdges: number, triangles: number }}
 */
export function solidifyBufferGeometry(geometry, thickness = DEFAULT_SOLIDIFY_THICKNESS, opts = {}) {
    const thick = clampSolidifyThickness(thickness);

    let working = geometry.index ? geometry.clone() : geometry.toNonIndexed();
    const disposeWorking = working !== geometry;

    // 1) Souder les sommets proches → ferme les fissures CAD (sinon chaque fissure = bande = rayure).
    const weldEps = resolveWeldEps(working, opts.weldEps);
    let welded = mergeVertices(working, weldEps);
    if (disposeWorking) working.dispose();
    if (!welded.index) {
        // mergeVertices devrait indexer ; sinon on force un passage non indexé → indexé.
        const tmp = mergeVertices(welded.toNonIndexed(), weldEps);
        welded.dispose();
        welded = tmp;
    }

    if (!welded.attributes.normal) {
        welded.computeVertexNormals();
    } else {
        welded.computeVertexNormals();
    }

    const pos = welded.attributes.position;
    const nrm = welded.attributes.normal;
    const uv = welded.attributes.uv;
    const index = welded.index;
    if (!pos || !nrm || !index || pos.count < 3 || index.count < 3) {
        welded.dispose();
        throw new Error("Géométrie invalide pour l’épaississement");
    }

    const { edges: boundaryEdges } = findIndexedBoundaryEdges(welded);
    const triCount = Math.floor(index.count / 3);
    const hasUv = !!uv;

    /** @type {number[]} */
    const outPos = [];
    /** @type {number[]} */
    const outNrm = [];
    /** @type {number[]} */
    const outUv = [];

    const pushVert = (x, y, z, nx, ny, nz, u, v) => {
        outPos.push(x, y, z);
        outNrm.push(nx, ny, nz);
        if (hasUv) outUv.push(u, v);
    };

    const readUv = (i) => (hasUv ? [uv.getX(i), uv.getY(i)] : [0, 0]);

    // 2) Face avant — normales lisses déjà calculées sur le mesh soudé.
    for (let t = 0; t < triCount; t += 1) {
        for (let k = 0; k < 3; k += 1) {
            const i = index.getX(t * 3 + k);
            const [u, v] = readUv(i);
            pushVert(pos.getX(i), pos.getY(i), pos.getZ(i), nrm.getX(i), nrm.getY(i), nrm.getZ(i), u, v);
        }
    }

    // 3) Face arrière (décalée −normale), winding inversé.
    for (let t = 0; t < triCount; t += 1) {
        const i0 = index.getX(t * 3);
        const i1 = index.getX(t * 3 + 1);
        const i2 = index.getX(t * 3 + 2);
        for (const i of [i2, i1, i0]) {
            const nx = nrm.getX(i);
            const ny = nrm.getY(i);
            const nz = nrm.getZ(i);
            const [u, v] = readUv(i);
            pushVert(
                pos.getX(i) - nx * thick,
                pos.getY(i) - ny * thick,
                pos.getZ(i) - nz * thick,
                -nx,
                -ny,
                -nz,
                u,
                v
            );
        }
    }

    // 4) Bande latérale — uniquement les vrais bords libres (après soudure).
    //    On duplique les sommets (pas d’index partagé) pour garder un pli net
    //    face / flanc et éviter que le lissage « raye » la surface.
    const minEdgeLen = weldEps * 0.5;
    let rimCount = 0;
    for (const [ia, ib] of boundaryEdges) {
        const ax = pos.getX(ia);
        const ay = pos.getY(ia);
        const az = pos.getZ(ia);
        const bx = pos.getX(ib);
        const by = pos.getY(ib);
        const bz = pos.getZ(ib);
        const edgeLen = Math.hypot(bx - ax, by - ay, bz - az);
        if (edgeLen < minEdgeLen) continue;

        const anx = nrm.getX(ia);
        const any = nrm.getY(ia);
        const anz = nrm.getZ(ia);
        const bnx = nrm.getX(ib);
        const bny = nrm.getY(ib);
        const bnz = nrm.getZ(ib);

        const aBackX = ax - anx * thick;
        const aBackY = ay - any * thick;
        const aBackZ = az - anz * thick;
        const bBackX = bx - bnx * thick;
        const bBackY = by - bny * thick;
        const bBackZ = bz - bnz * thick;

        const ex = bx - ax;
        const ey = by - ay;
        const ez = bz - az;
        const ox = (anx + bnx) * 0.5;
        const oy = (any + bny) * 0.5;
        const oz = (anz + bnz) * 0.5;
        let sx = ey * oz - ez * oy;
        let sy = ez * ox - ex * oz;
        let sz = ex * oy - ey * ox;
        const sl = Math.hypot(sx, sy, sz);
        if (sl < 1e-12) continue;
        sx /= sl;
        sy /= sl;
        sz /= sl;

        const [ua, va] = readUv(ia);
        const [ub, vb] = readUv(ib);

        pushVert(ax, ay, az, sx, sy, sz, ua, va);
        pushVert(bx, by, bz, sx, sy, sz, ub, vb);
        pushVert(bBackX, bBackY, bBackZ, sx, sy, sz, ub, vb);

        pushVert(ax, ay, az, sx, sy, sz, ua, va);
        pushVert(bBackX, bBackY, bBackZ, sx, sy, sz, ub, vb);
        pushVert(aBackX, aBackY, aBackZ, sx, sy, sz, ua, va);
        rimCount += 1;
    }

    const out = new THREE.BufferGeometry();
    out.setAttribute("position", new THREE.Float32BufferAttribute(outPos, 3));
    out.setAttribute("normal", new THREE.Float32BufferAttribute(outNrm, 3));
    if (hasUv) {
        out.setAttribute("uv", new THREE.Float32BufferAttribute(outUv, 2));
    }
    out.computeBoundingBox();
    out.computeBoundingSphere();

    welded.dispose();

    return {
        geometry: out,
        boundaryEdges: rimCount,
        triangles: outPos.length / 9,
    };
}

/**
 * Épaissit un Mesh Three.js (remplace sa géométrie).
 * @param {THREE.Mesh} mesh
 * @param {number} [thickness]
 * @returns {{ boundaryEdges: number, triangles: number }}
 */
export function solidifyMesh(mesh, thickness = DEFAULT_SOLIDIFY_THICKNESS) {
    if (!(mesh instanceof THREE.Mesh) || !mesh.geometry) {
        throw new Error("Mesh invalide");
    }
    const result = solidifyBufferGeometry(mesh.geometry, thickness);
    const old = mesh.geometry;
    mesh.geometry = result.geometry;
    try {
        old.dispose();
    } catch {
        /* ignore */
    }
    mesh.userData[LAB_SOLIDIFIED_KEY] = true;
    mesh.userData._labSolidifyThickness = clampSolidifyThickness(thickness);
    return { boundaryEdges: result.boundaryEdges, triangles: result.triangles };
}

/**
 * Épaissit un ou plusieurs meshes sous un objet importé.
 * @param {THREE.Object3D} root
 * @param {{ thickness?: number, onlyMesh?: THREE.Mesh | null }} [opts]
 * @returns {{ meshCount: number, boundaryEdges: number, triangles: number }}
 */
export function solidifyObjectMeshes(root, opts = {}) {
    const thickness = clampSolidifyThickness(opts.thickness ?? DEFAULT_SOLIDIFY_THICKNESS);
    /** @type {THREE.Mesh[]} */
    const targets = [];
    if (opts.onlyMesh instanceof THREE.Mesh && opts.onlyMesh.geometry) {
        targets.push(opts.onlyMesh);
    } else {
        root.traverse((child) => {
            if (!(child instanceof THREE.Mesh) || !child.geometry) return;
            if (child.userData?._labNoPaintPick) return;
            if (child.name === "shadow-overlay") return;
            targets.push(child);
        });
    }
    if (!targets.length) {
        throw new Error("Aucun mesh à épaissir");
    }

    let boundaryEdges = 0;
    let triangles = 0;
    for (const mesh of targets) {
        const r = solidifyMesh(mesh, thickness);
        boundaryEdges += r.boundaryEdges;
        triangles += r.triangles;
    }
    return { meshCount: targets.length, boundaryEdges, triangles };
}
