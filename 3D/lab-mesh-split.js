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
 * @param {THREE.BufferAttribute | THREE.InterleavedBufferAttribute} attr
 * @param {number} index
 * @param {number} c
 */
function readAttrComponent(attr, index, c) {
    if (c === 0) return attr.getX(index);
    if (c === 1) return attr.getY(index);
    if (c === 2) return typeof attr.getZ === "function" ? attr.getZ(index) : 0;
    if (c === 3) return typeof attr.getW === "function" ? attr.getW(index) : 0;
    return 0;
}

/**
 * @param {THREE.BufferGeometry} source
 * @param {number[][]} triangles
 * @param {number[]} [materialOfTri]
 * @returns {THREE.BufferGeometry}
 */
function geometryFromTriangles(source, triangles, materialOfTri = null) {
    const out = new THREE.BufferGeometry();
    const names = Object.keys(source.attributes || {});
    for (const name of names) {
        const attr = source.getAttribute(name);
        if (!attr) continue;
        const itemSize = attr.itemSize;
        const count = triangles.length * 3;
        const ArrayCtor =
            attr.array && attr.array.constructor && attr.array.constructor.BYTES_PER_ELEMENT
                ? attr.array.constructor
                : Float32Array;
        const data = new ArrayCtor(count * itemSize);
        let dst = 0;
        for (const tri of triangles) {
            for (let k = 0; k < 3; k += 1) {
                for (let c = 0; c < itemSize; c += 1) {
                    data[dst + c] = readAttrComponent(attr, tri[k], c);
                }
                dst += itemSize;
            }
        }
        out.setAttribute(name, new THREE.BufferAttribute(data, itemSize, attr.normalized));
    }

    /** @type {number[]} */
    const mats =
        Array.isArray(materialOfTri) && materialOfTri.length === triangles.length
            ? materialOfTri
            : null;
    if (mats && mats.length) {
        let start = 0;
        let current = mats[0] || 0;
        for (let i = 1; i <= mats.length; i += 1) {
            const next = i < mats.length ? mats[i] || 0 : null;
            if (next !== current) {
                out.addGroup(start * 3, (i - start) * 3, current);
                start = i;
                current = next;
            }
        }
    } else if (source.groups?.length === 1) {
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
 * @param {string | null | undefined} id
 */
function canonicalTriId(id) {
    if (!id) return "";
    return String(id)
        .split(":")
        .map((n) => Number(n))
        .filter((n) => Number.isFinite(n))
        .sort((a, b) => a - b)
        .join(":");
}

/**
 * @param {{ x: number, y: number, z: number }} p
 */
function posKey(p) {
    return `${Number(p.x).toFixed(WELD_DIGITS)},${Number(p.y).toFixed(WELD_DIGITS)},${Number(p.z).toFixed(WELD_DIGITS)}`;
}

/**
 * @param {{ x: number, y: number, z: number }} a
 * @param {{ x: number, y: number, z: number }} b
 * @param {{ x: number, y: number, z: number }} c
 */
function selectionPosKey(a, b, c) {
    return [posKey(a), posKey(b), posKey(c)].sort().join("|");
}

/**
 * @param {THREE.BufferAttribute} pos
 * @param {number} ia
 * @param {number} ib
 * @param {number} ic
 */
function trianglePosKey(pos, ia, ib, ic) {
    return [vertKey(pos, ia), vertKey(pos, ib), vertKey(pos, ic)].sort().join("|");
}

/**
 * @param {THREE.BufferGeometry} geometry
 * @returns {{ t: number, verts: number[], id: string, materialIndex: number }[]}
 */
export function listTriangleRecords(geometry) {
    const pos = geometry?.attributes?.position;
    if (!pos) return [];
    const index = geometry.index;
    const groups = Array.isArray(geometry.groups) ? geometry.groups : [];
    const drawStart = geometry.drawRange?.start || 0;
    const drawCount = geometry.drawRange?.count;
    const limit = index ? index.count : pos.count;
    const drawEnd = Number.isFinite(drawCount) ? Math.min(limit, drawStart + drawCount) : limit;
    const start = Math.max(0, drawStart);
    const end = Math.max(start, drawEnd);

    /**
     * @param {number} vertexOffset
     */
    function materialAt(vertexOffset) {
        for (const group of groups) {
            const gs = group.start || 0;
            const gc = group.count || 0;
            if (vertexOffset >= gs && vertexOffset < gs + gc) return group.materialIndex || 0;
        }
        return 0;
    }

    /** @type {{ t: number, verts: number[], id: string, materialIndex: number }[]} */
    const records = [];
    for (let j = start; j + 2 < end; j += 3) {
        const t = Math.floor(j / 3);
        let a;
        let b;
        let c;
        if (index) {
            a = index.getX(j);
            b = index.getX(j + 1);
            c = index.getX(j + 2);
        } else {
            a = j;
            b = j + 1;
            c = j + 2;
        }
        if (![a, b, c].every((n) => Number.isFinite(n))) continue;
        records.push({
            t,
            verts: [a, b, c],
            id: `${a}:${b}:${c}`,
            materialIndex: materialAt(j),
        });
    }
    return records;
}

/**
 * @param {Array<{ triId?: string, faceIndex?: number, pa?: { x: number, y: number, z: number }, pb?: { x: number, y: number, z: number }, pc?: { x: number, y: number, z: number } }>} entries
 * @param {THREE.BufferGeometry} geometry
 */
function makeTriangleMatcher(entries, geometry) {
    const pos = geometry.attributes.position;
    const faceSet = new Set();
    const idSet = new Set();
    const canonSet = new Set();
    const posSet = new Set();
    for (const entry of entries || []) {
        if (typeof entry.faceIndex === "number" && Number.isFinite(entry.faceIndex)) {
            faceSet.add(entry.faceIndex);
        }
        if (entry.triId) {
            idSet.add(String(entry.triId));
            const canon = canonicalTriId(entry.triId);
            if (canon) canonSet.add(canon);
        }
        if (entry.pa && entry.pb && entry.pc) {
            posSet.add(selectionPosKey(entry.pa, entry.pb, entry.pc));
        }
    }
    return (rec) => {
        if (faceSet.has(rec.t)) return true;
        if (idSet.has(rec.id)) return true;
        if (canonSet.has(canonicalTriId(rec.id))) return true;
        if (posSet.size && posSet.has(trianglePosKey(pos, rec.verts[0], rec.verts[1], rec.verts[2]))) {
            return true;
        }
        return false;
    };
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
    const records = listTriangleRecords(geometry).filter((rec) => {
        const hit = wanted.has(rec.id) || wanted.has(canonicalTriId(rec.id));
        return keep ? hit : !hit;
    });
    if (!records.length) return null;
    return geometryFromTriangles(
        geometry,
        records.map((r) => r.verts),
        records.map((r) => r.materialIndex)
    );
}

/**
 * Retire les triangles sélectionnés (faceIndex / id / positions) sans vider
 * le mesh si aucun triangle ne correspond — fréquent après un reload GLB.
 * @param {THREE.Mesh} mesh
 * @param {Array<{ triId?: string, faceIndex?: number, pa?: object, pb?: object, pc?: object }>} entries
 * @returns {{ extracted: THREE.BufferGeometry | null, remainderEmpty: boolean, matched: number }}
 */
export function extractSelectedTrianglesFromMesh(mesh, entries) {
    const geometry = mesh?.geometry;
    if (!geometry?.attributes?.position) {
        return { extracted: null, remainderEmpty: false, matched: 0 };
    }
    const records = listTriangleRecords(geometry);
    if (!records.length) {
        return { extracted: null, remainderEmpty: false, matched: 0 };
    }
    const match = makeTriangleMatcher(entries, geometry);
    const extractedRecs = [];
    const keptRecs = [];
    for (const rec of records) {
        if (match(rec)) extractedRecs.push(rec);
        else keptRecs.push(rec);
    }
    if (!extractedRecs.length) {
        return { extracted: null, remainderEmpty: false, matched: 0 };
    }

    const extracted = geometryFromTriangles(
        geometry,
        extractedRecs.map((r) => r.verts),
        extractedRecs.map((r) => r.materialIndex)
    );
    if (Array.isArray(mesh.material) && !extracted.groups.length) {
        extracted.addGroup(0, extractedRecs.length * 3, 0);
    }

    const owned = !!mesh.userData?._labGeoOwned;
    if (!keptRecs.length) {
        mesh.geometry = new THREE.BufferGeometry();
        mesh.userData._labGeoOwned = true;
        if (owned) geometry.dispose?.();
        return { extracted, remainderEmpty: true, matched: extractedRecs.length };
    }

    const remainder = geometryFromTriangles(
        geometry,
        keptRecs.map((r) => r.verts),
        keptRecs.map((r) => r.materialIndex)
    );
    if (Array.isArray(mesh.material) && !remainder.groups.length) {
        remainder.addGroup(0, keptRecs.length * 3, 0);
    }
    mesh.geometry = remainder;
    mesh.userData._labGeoOwned = true;
    if (owned) geometry.dispose?.();
    return { extracted, remainderEmpty: false, matched: extractedRecs.length };
}

/**
 * Retire les triangles du mesh source et renvoie la géométrie extraite.
 * @param {THREE.Mesh} mesh
 * @param {Iterable<string>} triIds
 * @returns {{ extracted: THREE.BufferGeometry | null, remainderEmpty: boolean, matched: number }}
 */
export function extractTriIdsFromMesh(mesh, triIds) {
    return extractSelectedTrianglesFromMesh(
        mesh,
        [...triIds].map((triId) => ({ triId }))
    );
}
