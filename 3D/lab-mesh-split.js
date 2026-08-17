/**
 * Sépare un mesh importé en pièces (îlots disjoints) ou extrait une sélection de triangles.
 */
import * as THREE from "three";

const WELD_DIGITS = 5;

/**
 * @param {THREE.BufferAttribute} pos
 * @param {number} index
 */
function vertKey(pos, index) {
    return `${pos.getX(index).toFixed(WELD_DIGITS)},${pos.getY(index).toFixed(WELD_DIGITS)},${pos.getZ(index).toFixed(WELD_DIGITS)}`;
}

/**
 * @param {THREE.BufferGeometry} geometry
 * @returns {number[][]}
 */
function listTriangles(geometry) {
    const pos = geometry?.attributes?.position;
    if (!pos) return [];
    /** @type {number[][]} */
    const tris = [];
    if (geometry.index) {
        const idx = geometry.index;
        for (let i = 0; i + 2 < idx.count; i += 3) {
            tris.push([idx.getX(i), idx.getX(i + 1), idx.getX(i + 2)]);
        }
    } else {
        for (let i = 0; i + 2 < pos.count; i += 3) {
            tris.push([i, i + 1, i + 2]);
        }
    }
    return tris;
}

/**
 * @param {THREE.BufferGeometry} geometry
 * @returns {{ weldOf: Int32Array, uniqueCount: number }}
 */
function weldVertexIds(geometry) {
    const pos = geometry.attributes.position;
    const weldOf = new Int32Array(pos.count);
    const map = new Map();
    let uid = 0;
    for (let i = 0; i < pos.count; i += 1) {
        const key = vertKey(pos, i);
        let id = map.get(key);
        if (id === undefined) {
            id = uid;
            uid += 1;
            map.set(key, id);
        }
        weldOf[i] = id;
    }
    return { weldOf, uniqueCount: uid };
}

/**
 * @param {number} n
 */
function makeUnionFind(n) {
    const parent = new Int32Array(n);
    for (let i = 0; i < n; i += 1) parent[i] = i;
    function find(x) {
        while (parent[x] !== x) {
            parent[x] = parent[parent[x]];
            x = parent[x];
        }
        return x;
    }
    function unite(a, b) {
        a = find(a);
        b = find(b);
        if (a !== b) parent[b] = a;
    }
    return { find, unite };
}

/**
 * @param {THREE.BufferGeometry} source
 * @param {number[][]} triangles
 * @returns {THREE.BufferGeometry}
 */
function geometryFromTriangles(source, triangles) {
    const out = new THREE.BufferGeometry();
    const names = Object.keys(source.attributes || {});
    for (const name of names) {
        const attr = source.getAttribute(name);
        if (!attr) continue;
        const itemSize = attr.itemSize;
        const count = triangles.length * 3;
        const ArrayCtor = attr.array.constructor;
        const data = new ArrayCtor(count * itemSize);
        let dst = 0;
        for (const tri of triangles) {
            for (let k = 0; k < 3; k += 1) {
                const src = tri[k] * itemSize;
                for (let c = 0; c < itemSize; c += 1) {
                    data[dst + c] = attr.array[src + c];
                }
                dst += itemSize;
            }
        }
        out.setAttribute(name, new THREE.BufferAttribute(data, itemSize, attr.normalized));
    }
    if (source.groups?.length === 1) {
        out.addGroup(0, triangles.length * 3, source.groups[0].materialIndex || 0);
    }
    out.computeBoundingBox();
    out.computeBoundingSphere();
    return out;
}

/**
 * Clone un matériau (tableau ou unique) pour une pièce extraite.
 * @param {THREE.Material | THREE.Material[]} material
 */
function cloneMaterial(material) {
    if (Array.isArray(material)) {
        return material.map((m) => (m?.clone ? m.clone() : m));
    }
    return material?.clone ? material.clone() : material;
}

/**
 * Groupe les triangles d’un mesh par îlot (composantes connexes soudées).
 * @param {THREE.Mesh} mesh
 * @returns {number[][][]} triangles par îlot
 */
export function groupTrianglesByIslands(mesh) {
    const geometry = mesh?.geometry;
    if (!geometry?.attributes?.position) return [];
    const tris = listTriangles(geometry);
    if (!tris.length) return [];
    const { weldOf, uniqueCount } = weldVertexIds(geometry);
    const uf = makeUnionFind(uniqueCount);
    for (const tri of tris) {
        uf.unite(weldOf[tri[0]], weldOf[tri[1]]);
        uf.unite(weldOf[tri[1]], weldOf[tri[2]]);
    }
    /** @type {Map<number, number[][]>} */
    const buckets = new Map();
    for (const tri of tris) {
        const root = uf.find(weldOf[tri[0]]);
        const list = buckets.get(root);
        if (list) list.push(tri);
        else buckets.set(root, [tri]);
    }
    return [...buckets.values()].sort((a, b) => b.length - a.length);
}

/**
 * Tous les triangles de l’îlot contenant `seedTri` (`[ia,ib,ic]` ou `"ia:ib:ic"`).
 * @param {THREE.Mesh} mesh
 * @param {string | number[]} seedTri
 * @returns {number[][]}
 */
export function trianglesInIsland(mesh, seedTri) {
    const islands = groupTrianglesByIslands(mesh);
    const seed = Array.isArray(seedTri)
        ? seedTri.join(":")
        : String(seedTri);
    for (const island of islands) {
        if (island.some((t) => t.join(":") === seed)) return island;
    }
    return [];
}

/**
 * Remplace un mesh par un mesh par îlot (même parent / transform).
 * @param {THREE.Mesh} mesh
 * @returns {THREE.Mesh[]}
 */
export function splitMeshIntoIslandMeshes(mesh) {
    if (!(mesh instanceof THREE.Mesh) || !mesh.geometry) return [];
    const islands = groupTrianglesByIslands(mesh);
    if (islands.length <= 1) return [mesh];

    const parent = mesh.parent;
    const pieces = islands.map((tris, index) => {
        const geo = geometryFromTriangles(mesh.geometry, tris);
        const piece = new THREE.Mesh(geo, cloneMaterial(mesh.material));
        piece.name = `${mesh.name || "Piece"}_${index + 1}`;
        piece.position.copy(mesh.position);
        piece.quaternion.copy(mesh.quaternion);
        piece.scale.copy(mesh.scale);
        piece.castShadow = mesh.castShadow;
        piece.receiveShadow = mesh.receiveShadow;
        piece.userData = { ...mesh.userData, skipObjectPbr: true };
        delete piece.userData._labMeshPersistId;
        if (parent) parent.add(piece);
        return piece;
    });

    if (parent) parent.remove(mesh);
    return pieces;
}

/**
 * Sépare tous les meshes d’un import en îlots disjoints.
 * @param {THREE.Object3D} root
 * @returns {{ meshCount: number, pieceCount: number, splitCount: number }}
 */
export function splitObjectMeshesByIslands(root) {
    /** @type {THREE.Mesh[]} */
    const meshes = [];
    root.traverse((child) => {
        if (!(child instanceof THREE.Mesh) || !child.geometry) return;
        if (child.userData?._labNoPaintPick) return;
        if (typeof child.name === "string" && child.name.startsWith("lab-")) return;
        if (child.name === "shadow-overlay") return;
        meshes.push(child);
    });

    let pieceCount = 0;
    let splitCount = 0;
    for (const mesh of meshes) {
        const pieces = splitMeshIntoIslandMeshes(mesh);
        pieceCount += pieces.length;
        if (pieces.length > 1) splitCount += 1;
    }
    return { meshCount: meshes.length, pieceCount, splitCount };
}

/**
 * Construit une géométrie à partir d’ids de triangles `"ia:ib:ic"`.
 * @param {THREE.BufferGeometry} geometry
 * @param {Iterable<string>} triIds
 * @param {boolean} keep
 * @returns {THREE.BufferGeometry | null}
 */
export function geometryFromTriIds(geometry, triIds, keep) {
    const wanted = new Set(triIds);
    const tris = listTriangles(geometry).filter((t) => {
        const id = t.join(":");
        return keep ? wanted.has(id) : !wanted.has(id);
    });
    if (!tris.length) return null;
    return geometryFromTriangles(geometry, tris);
}

/**
 * Retire les triangles du mesh source et renvoie la géométrie extraite.
 * @param {THREE.Mesh} mesh
 * @param {Iterable<string>} triIds
 * @returns {{ extracted: THREE.BufferGeometry | null, remainderEmpty: boolean }}
 */
export function extractTriIdsFromMesh(mesh, triIds) {
    const geometry = mesh?.geometry;
    if (!geometry) return { extracted: null, remainderEmpty: false };
    const extracted = geometryFromTriIds(geometry, triIds, true);
    const remainder = geometryFromTriIds(geometry, triIds, false);
    if (remainder) {
        mesh.geometry = remainder;
        geometry.dispose?.();
    } else {
        mesh.geometry = new THREE.BufferGeometry();
    }
    return { extracted, remainderEmpty: !remainder };
}
