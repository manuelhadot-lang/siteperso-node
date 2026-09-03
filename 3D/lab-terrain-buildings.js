/** Routes OSM + bâtiments OSM / BD TOPO posés en volumes 3D sur le heightmap. */

import * as THREE from "three";
import {
    wgs84ToLocalTerrain,
    terrainFootprintBounds,
} from "./lab-terrain-ign.js";
import {
    buildingWays,
    fetchOsmRoadGeometries,
    highwayWays,
    roadWidthMeters,
} from "./lab-terrain-osm.js";
import {
    COLLISION_KEY,
    registerCollidable,
    unregisterCollidable,
} from "./lab-collision.js";
import { setObjectShadowEnabled, invalidateLabShadows } from "./lab-shadows.js";

export const OSM_BUILDINGS_SCENE_ITEM_ID = "env-osm-buildings";
export const OSM_ROADS_SCENE_ITEM_ID = "env-osm-roads";
const BUILDINGS_NAME = "lab-osm-buildings";
const ROADS_NAME = "lab-osm-roads";
const MAX_BUILDINGS = 380;
const MAX_ROAD_SEGS = 2200;
const MIN_AREA_M2 = 12;
const MAX_AREA_M2 = 12000;
const BDTOPO_PROXY_URL = "/api/ign/bdtopo-buildings";

const WALL_COLORS = [0xe8d7c0, 0xf2e4d0, 0xd4c2a6, 0xcbb89a, 0xf7edd8, 0xbfa888];
const ROOF_COLORS = [0x8b3e32, 0x6e4a40, 0x9a4e36, 0x4e5a66, 0xa05a38];

const _down = new THREE.Vector3(0, -1, 0);
const _origin = new THREE.Vector3();
const _raycaster = new THREE.Raycaster();

/**
 * @param {number} n
 * @param {number} modulo
 */
function hashPick(n, modulo) {
    return Math.abs(Math.floor(n * 9973) % modulo);
}

/**
 * @param {Record<string, string> | undefined} tags
 */
function buildingHeightMeters(tags) {
    const raw = tags?.height || tags?.["est_height"] || "";
    if (raw) {
        const n = parseFloat(String(raw).replace(",", ".").replace(/m$/i, "").trim());
        if (Number.isFinite(n) && n >= 2 && n < 90) return n;
    }
    const levels = parseFloat(tags?.["building:levels"] || tags?.levels || "");
    if (Number.isFinite(levels) && levels > 0) {
        return Math.min(72, Math.max(2.8, levels * 2.8));
    }
    const kind = tags?.building || "yes";
    if (kind === "garage" || kind === "shed" || kind === "carport" || kind === "hut") return 2.6;
    if (kind === "church" || kind === "cathedral" || kind === "chapel") return 14;
    if (kind === "apartments" || kind === "residential") return 9;
    if (kind === "industrial" || kind === "warehouse") return 8;
    if (kind === "house" || kind === "detached" || kind === "semidetached_house") return 7;
    return 7.2;
}

/**
 * Hauteur BD TOPO (m) — attribut officiel `hauteur`, sinon étages.
 * @param {Record<string, unknown> | null | undefined} props
 */
function bdTopoHeightMeters(props) {
    const h = Number(props?.hauteur);
    if (Number.isFinite(h) && h >= 1.5 && h < 250) return h;
    const floors = Number(props?.nombre_d_etages);
    if (Number.isFinite(floors) && floors > 0) {
        return Math.min(120, Math.max(2.8, floors * 2.8));
    }
    const nature = String(props?.nature || "").toLowerCase();
    if (nature.includes("église") || nature.includes("eglise") || nature.includes("cathédrale")) {
        return 14;
    }
    if (nature.includes("tour") || nature.includes("donjon")) return 28;
    if (nature.includes("serre") || nature.includes("hangar")) return 5;
    if (props?.construction_legere === true) return 3.2;
    return 7.2;
}

/**
 * @param {{ x: number, z: number }[]} pts
 */
function shoelaceArea(pts) {
    let acc = 0;
    for (let i = 0; i < pts.length; i += 1) {
        const a = pts[i];
        const b = pts[(i + 1) % pts.length];
        acc += a.x * b.z - b.x * a.z;
    }
    return Math.abs(acc) * 0.5;
}

/**
 * @param {{ lat: number, lon: number }[]} geometry
 * @param {number} centerLat
 * @param {number} centerLon
 */
function footprintLocal(geometry, centerLat, centerLon) {
    const pts = [];
    for (const pt of geometry) {
        if (!Number.isFinite(pt.lat) || !Number.isFinite(pt.lon)) continue;
        pts.push(wgs84ToLocalTerrain(centerLat, centerLon, pt.lat, pt.lon));
    }
    if (pts.length >= 2) {
        const first = pts[0];
        const last = pts[pts.length - 1];
        if (Math.hypot(first.x - last.x, first.z - last.z) < 0.15) pts.pop();
    }
    return pts;
}

/**
 * Anneau GeoJSON [lon, lat, z?] → points locaux.
 * @param {unknown} ring
 * @param {number} centerLat
 * @param {number} centerLon
 */
function ringToLocalPts(ring, centerLat, centerLon) {
    if (!Array.isArray(ring)) return [];
    /** @type {{ lat: number, lon: number }[]} */
    const geo = [];
    for (const pos of ring) {
        if (!Array.isArray(pos) || pos.length < 2) continue;
        const lon = Number(pos[0]);
        const lat = Number(pos[1]);
        if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
        geo.push({ lat, lon });
    }
    return footprintLocal(geo, centerLat, centerLon);
}

/**
 * Empreinte principale d’une feature BD TOPO (Polygon / MultiPolygon).
 * @param {{ type?: string, coordinates?: unknown }} geometry
 * @param {number} centerLat
 * @param {number} centerLon
 */
function bdTopoFootprintLocal(geometry, centerLat, centerLon) {
    if (!geometry || !geometry.coordinates) return [];
    const type = geometry.type;
    /** @type {unknown[]} */
    let polygons = [];
    if (type === "Polygon") polygons = [geometry.coordinates];
    else if (type === "MultiPolygon") polygons = /** @type {unknown[]} */ (geometry.coordinates);
    else return [];

    let best = [];
    let bestArea = 0;
    for (const poly of polygons) {
        if (!Array.isArray(poly) || !poly.length) continue;
        const outer = ringToLocalPts(poly[0], centerLat, centerLon);
        if (outer.length < 3) continue;
        const area = shoelaceArea(outer);
        if (area > bestArea) {
            bestArea = area;
            best = outer;
        }
    }
    return best;
}

/**
 * @param {number} south
 * @param {number} west
 * @param {number} north
 * @param {number} east
 */
async function fetchBdTopoBuildings(south, west, north, east) {
    const q = new URLSearchParams({
        south: String(south),
        west: String(west),
        north: String(north),
        east: String(east),
        count: "500",
    });
    const res = await fetch(`${BDTOPO_PROXY_URL}?${q}`, {
        credentials: "same-origin",
        cache: "no-store",
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
        throw new Error(data?.error || `BD TOPO HTTP ${res.status}`);
    }
    return Array.isArray(data?.features) ? data.features : [];
}

/**
 * @param {THREE.Object3D | null} terrain
 * @param {number} x
 * @param {number} z
 * @param {(x: number, z: number) => number} fallback
 */
function groundYAt(terrain, x, z, fallback) {
    if (terrain) {
        _origin.set(x, 800, z);
        _raycaster.set(_origin, _down);
        _raycaster.far = 1600;
        const hits = _raycaster.intersectObject(terrain, false);
        if (hits[0]?.point) return hits[0].point.y;
    }
    return fallback(x, z);
}

/**
 * @param {THREE.Object3D} group
 */
function disposeGroupMeshes(group) {
    group.traverse((node) => {
        if (node.isMesh) {
            unregisterCollidable(node);
            node.geometry?.dispose?.();
            const mats = Array.isArray(node.material) ? node.material : [node.material];
            for (const mat of mats) mat?.dispose?.();
        }
    });
}

/**
 * Extrude une liste de candidats bâtiments (OSM ou BD TOPO).
 * @param {{
 *   scene: THREE.Scene,
 *   sceneRegistry?: { register: Function, unregister: (id: string) => void } | null,
 *   terrain?: THREE.Object3D | null,
 *   sampleY: (x: number, z: number) => number,
 *   picked: { pts: { x: number, z: number }[], height: number, area: number, id: number }[],
 *   labelPrefix: string,
 *   sourceTag: string,
 * }} opts
 */
function extrudeBuildingCandidates(opts) {
    const {
        scene,
        sceneRegistry = null,
        terrain = null,
        sampleY,
        picked,
        labelPrefix,
        sourceTag,
    } = opts;

    clearOsmBuildings(scene, sceneRegistry);

    if (!picked.length) {
        throw new Error(`Aucun bâtiment ${sourceTag} dans cette zone`);
    }

    const group = new THREE.Group();
    group.name = BUILDINGS_NAME;
    group.userData.labOsmBuildings = true;
    group.userData.labBuildingSource = sourceTag;

    for (const building of picked) {
        try {
            let cx = 0;
            let cz = 0;
            let minX = Infinity;
            let maxX = -Infinity;
            let minZ = Infinity;
            let maxZ = -Infinity;
            for (const p of building.pts) {
                cx += p.x;
                cz += p.z;
                minX = Math.min(minX, p.x);
                maxX = Math.max(maxX, p.x);
                minZ = Math.min(minZ, p.z);
                maxZ = Math.max(maxZ, p.z);
            }
            cx /= building.pts.length;
            cz /= building.pts.length;
            const groundY = groundYAt(terrain, cx, cz, sampleY);
            const h = Math.max(2.5, building.height);

            let mesh;
            try {
                const shape = new THREE.Shape();
                building.pts.forEach((p, index) => {
                    const x = p.x - cx;
                    const y = -(p.z - cz);
                    if (index === 0) shape.moveTo(x, y);
                    else shape.lineTo(x, y);
                });
                shape.closePath();
                const geo = new THREE.ExtrudeGeometry(shape, {
                    depth: h,
                    bevelEnabled: false,
                    steps: 1,
                    curveSegments: 1,
                });
                geo.rotateX(-Math.PI / 2);
                geo.computeVertexNormals();
                const mat = new THREE.MeshStandardMaterial({
                    color: WALL_COLORS[hashPick(building.id, WALL_COLORS.length)],
                    roughness: 0.88,
                    metalness: 0.02,
                    side: THREE.DoubleSide,
                });
                mesh = new THREE.Mesh(geo, mat);
                mesh.position.set(cx, groundY + 0.05, cz);
            } catch {
                const w = Math.max(3, maxX - minX);
                const d = Math.max(3, maxZ - minZ);
                const geo = new THREE.BoxGeometry(w, h, d);
                const mat = new THREE.MeshStandardMaterial({
                    color: WALL_COLORS[hashPick(building.id, WALL_COLORS.length)],
                    roughness: 0.88,
                    metalness: 0.02,
                    side: THREE.DoubleSide,
                });
                mesh = new THREE.Mesh(geo, mat);
                mesh.position.set(cx, groundY + h * 0.5 + 0.05, cz);
            }

            mesh.castShadow = true;
            mesh.receiveShadow = true;
            mesh.frustumCulled = false;
            mesh.renderOrder = 4;
            mesh.userData[COLLISION_KEY] = true;
            mesh.userData.labOsmBuilding = true;
            mesh.userData.labBuildingSource = sourceTag;
            setObjectShadowEnabled(mesh, true);
            registerCollidable(mesh);
            group.add(mesh);
        } catch {
            /* empreinte invalide */
        }
    }

    if (!group.children.length) {
        throw new Error(`Aucun bâtiment ${sourceTag} dans cette zone`);
    }

    scene.add(group);
    invalidateLabShadows();

    sceneRegistry?.unregister?.(OSM_BUILDINGS_SCENE_ITEM_ID);
    sceneRegistry?.register?.({
        id: OSM_BUILDINGS_SCENE_ITEM_ID,
        label: `${labelPrefix} (${group.children.length})`,
        category: "environment",
        icon: "env",
        detail: `${group.children.length} bâtiments · ${sourceTag}`,
        getVisible: () => group.visible !== false,
        setVisible: (visible) => {
            group.visible = visible;
        },
        select: () => {},
        canDelete: () => true,
        onDelete: () => clearOsmBuildings(scene, sceneRegistry),
    });

    return group.children.length;
}

/**
 * @param {THREE.Scene} scene
 * @param {{ unregister?: (id: string) => void } | null} sceneRegistry
 */
export function clearOsmBuildings(scene, sceneRegistry = null) {
    const group = scene.getObjectByName(BUILDINGS_NAME);
    if (group) {
        disposeGroupMeshes(group);
        scene.remove(group);
    }
    sceneRegistry?.unregister?.(OSM_BUILDINGS_SCENE_ITEM_ID);
    invalidateLabShadows();
}

/**
 * @param {THREE.Scene} scene
 * @param {{ unregister?: (id: string) => void } | null} sceneRegistry
 */
export function clearOsmRoads(scene, sceneRegistry = null) {
    const group = scene.getObjectByName(ROADS_NAME);
    if (group) {
        disposeGroupMeshes(group);
        scene.remove(group);
    }
    sceneRegistry?.unregister?.(OSM_ROADS_SCENE_ITEM_ID);
    invalidateLabShadows();
}

/**
 * @param {{
 *   scene: THREE.Scene,
 *   sceneRegistry?: { register: Function, unregister: (id: string) => void } | null,
 *   terrain?: THREE.Object3D | null,
 *   centerLat: number,
 *   centerLon: number,
 *   sizeMeters: number,
 *   sampleY: (x: number, z: number) => number,
 *   elements?: object[] | null,
 *   visible?: boolean,
 * }} opts
 */
export async function placeOsmRoads(opts) {
    const {
        scene,
        sceneRegistry = null,
        terrain = null,
        centerLat,
        centerLon,
        sizeMeters,
        sampleY,
        elements = null,
        visible = true,
    } = opts;

    clearOsmRoads(scene, sceneRegistry);

    let osm = elements;
    if (!highwayWays(osm || []).length) {
        const footprint = terrainFootprintBounds(sizeMeters, centerLat, centerLon);
        osm = await fetchOsmRoadGeometries(
            footprint[0][0],
            footprint[0][1],
            footprint[1][0],
            footprint[1][1],
            ["highway"]
        );
    }

    const ways = highwayWays(osm);
    const half = sizeMeters * 0.5;
    const mat = new THREE.MeshBasicMaterial({
        color: 0x3a3a40,
        depthTest: true,
        polygonOffset: true,
        polygonOffsetFactor: -4,
        polygonOffsetUnits: -4,
    });

    const group = new THREE.Group();
    group.name = ROADS_NAME;
    group.userData.labOsmRoads = true;
    group.visible = visible !== false;
    group.renderOrder = 5;

    const forward = new THREE.Vector3();
    const zAxis = new THREE.Vector3(0, 0, 1);
    let segs = 0;
    for (const way of ways) {
        const pts = footprintLocal(way.geometry || [], centerLat, centerLon);
        if (pts.length < 2) continue;
        const width = Math.max(3.2, roadWidthMeters(way.tags?.highway) * 1.05);
        for (let i = 1; i < pts.length; i += 1) {
            if (segs >= MAX_ROAD_SEGS) break;
            const a = pts[i - 1];
            const b = pts[i];
            const dx = b.x - a.x;
            const dz = b.z - a.z;
            const len = Math.hypot(dx, dz);
            if (len < 0.5) continue;
            const mx = (a.x + b.x) * 0.5;
            const mz = (a.z + b.z) * 0.5;
            if (Math.abs(mx) > half + 2 || Math.abs(mz) > half + 2) continue;
            const y = groundYAt(terrain, mx, mz, sampleY) + 0.12;
            const geo = new THREE.BoxGeometry(width, 0.16, len);
            const mesh = new THREE.Mesh(geo, mat);
            mesh.position.set(mx, y, mz);
            forward.set(dx / len, 0, dz / len);
            mesh.quaternion.setFromUnitVectors(zAxis, forward);
            mesh.castShadow = false;
            mesh.receiveShadow = false;
            mesh.frustumCulled = false;
            mesh.renderOrder = 5;
            mesh.userData.labOsmRoad = true;
            group.add(mesh);
            segs += 1;
        }
        if (segs >= MAX_ROAD_SEGS) break;
    }

    if (!group.children.length) {
        mat.dispose();
        throw new Error("Aucune route OSM dans cette zone — zoomez sur une zone urbanisée");
    }

    scene.add(group);
    invalidateLabShadows();
    sceneRegistry?.unregister?.(OSM_ROADS_SCENE_ITEM_ID);
    sceneRegistry?.register?.({
        id: OSM_ROADS_SCENE_ITEM_ID,
        label: `Routes OSM (${group.children.length})`,
        category: "environment",
        icon: "env",
        detail: `${group.children.length} segments`,
        getVisible: () => group.visible !== false,
        setVisible: (v) => {
            group.visible = v;
        },
        select: () => {},
        canDelete: () => true,
        onDelete: () => clearOsmRoads(scene, sceneRegistry),
    });
    return group.children.length;
}

/**
 * @param {{
 *   scene: THREE.Scene,
 *   sceneRegistry?: { register: Function, unregister: (id: string) => void } | null,
 *   terrain?: THREE.Object3D | null,
 *   centerLat: number,
 *   centerLon: number,
 *   sizeMeters: number,
 *   sampleY: (x: number, z: number) => number,
 *   elements?: object[] | null,
 * }} opts
 */
export async function placeOsmBuildings(opts) {
    const {
        scene,
        sceneRegistry = null,
        terrain = null,
        centerLat,
        centerLon,
        sizeMeters,
        sampleY,
        elements = null,
    } = opts;

    let osm = elements;
    if (!buildingWays(osm || []).length) {
        const footprint = terrainFootprintBounds(sizeMeters, centerLat, centerLon);
        osm = await fetchOsmRoadGeometries(
            footprint[0][0],
            footprint[0][1],
            footprint[1][0],
            footprint[1][1],
            ["building"]
        );
    }

    const ways = buildingWays(osm);
    const half = sizeMeters * 0.5;
    /** @type {{ pts: { x: number, z: number }[], height: number, area: number, id: number }[]} */
    const candidates = [];
    for (const way of ways) {
        const pts = footprintLocal(way.geometry || [], centerLat, centerLon);
        if (pts.length < 3) continue;
        const inside = pts.filter((p) => Math.abs(p.x) <= half && Math.abs(p.z) <= half);
        if (inside.length < 3) continue;
        const area = shoelaceArea(pts);
        if (area < MIN_AREA_M2 || area > MAX_AREA_M2) continue;
        candidates.push({
            pts,
            height: buildingHeightMeters(way.tags),
            area,
            id: Number(/** @type {{ id?: number }} */ (way).id) || candidates.length,
        });
    }
    candidates.sort((a, b) => b.area - a.area);
    const picked = candidates.slice(0, MAX_BUILDINGS);
    if (!picked.length) {
        throw new Error("Aucun bâtiment OSM dans cette zone — zoomez sur un village ou un quartier");
    }

    return extrudeBuildingCandidates({
        scene,
        sceneRegistry,
        terrain,
        sampleY,
        picked,
        labelPrefix: "Maisons OSM",
        sourceTag: "OSM",
    });
}

/**
 * Bâtiments IGN BD TOPO® (empreintes + hauteur officielle), posés sur le relief.
 * @param {{
 *   scene: THREE.Scene,
 *   sceneRegistry?: { register: Function, unregister: (id: string) => void } | null,
 *   terrain?: THREE.Object3D | null,
 *   centerLat: number,
 *   centerLon: number,
 *   sizeMeters: number,
 *   sampleY: (x: number, z: number) => number,
 * }} opts
 */
export async function placeBdTopoBuildings(opts) {
    const {
        scene,
        sceneRegistry = null,
        terrain = null,
        centerLat,
        centerLon,
        sizeMeters,
        sampleY,
    } = opts;

    const footprint = terrainFootprintBounds(sizeMeters, centerLat, centerLon);
    const features = await fetchBdTopoBuildings(
        footprint[0][0],
        footprint[0][1],
        footprint[1][0],
        footprint[1][1]
    );

    const half = sizeMeters * 0.5;
    /** @type {{ pts: { x: number, z: number }[], height: number, area: number, id: number }[]} */
    const candidates = [];
    for (let i = 0; i < features.length; i += 1) {
        const feat = features[i];
        const props = feat?.properties || {};
        if (props.etat_de_l_objet && props.etat_de_l_objet !== "En service") continue;
        const pts = bdTopoFootprintLocal(feat?.geometry, centerLat, centerLon);
        if (pts.length < 3) continue;
        const inside = pts.filter((p) => Math.abs(p.x) <= half && Math.abs(p.z) <= half);
        if (inside.length < 3) continue;
        const area = shoelaceArea(pts);
        if (area < MIN_AREA_M2 || area > MAX_AREA_M2) continue;
        const idRaw = String(feat?.id || props.cleabs || i);
        let idHash = 0;
        for (let c = 0; c < idRaw.length; c += 1) idHash = (idHash * 31 + idRaw.charCodeAt(c)) | 0;
        candidates.push({
            pts,
            height: bdTopoHeightMeters(props),
            area,
            id: Math.abs(idHash) || i + 1,
        });
    }
    candidates.sort((a, b) => b.area - a.area);
    const picked = candidates.slice(0, MAX_BUILDINGS);
    if (!picked.length) {
        throw new Error("Aucun bâtiment BD TOPO dans cette zone — zoomez sur un quartier");
    }

    return extrudeBuildingCandidates({
        scene,
        sceneRegistry,
        terrain,
        sampleY,
        picked,
        labelPrefix: "Bâtiments BD TOPO",
        sourceTag: "BD TOPO",
    });
}
