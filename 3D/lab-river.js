/** Rivières réalistes — trait droit d’un point à l’autre, courbe si on s’écarte. */
import * as THREE from "three";
import { RealisticOcean, loadWaterNormals } from "./lab-ocean.js";

export const RIVER_SCENE_ITEM_ID = "env-river";
const WATER_NORMALS_URL = "/3D/textures/waternormals.jpg";
const MIN_POINT_DIST = 0.6;
const PREVIEW_COLOR = 0x22d3ee;

/** @typedef {"fleuve" | "riviere" | "cours" | "ruisseau"} RiverKind */

export const RIVER_KINDS = {
    fleuve: {
        id: "fleuve",
        label: "Fleuve",
        width: 9,
        depth: 3.2,
        waveHeight: 0.18,
        waveScale: 0.11,
        waveSpeed: 0.72,
        choppiness: 0.55,
        foam: 0.7,
        color: "#0a5a6a",
        opacity: 4.2,
        surfaceWaves: 1.35,
        surfaceScale: 7.2,
        distortion: 1.05,
    },
    riviere: {
        id: "riviere",
        label: "Rivière",
        width: 3.4,
        depth: 1.85,
        waveHeight: 0.09,
        waveScale: 0.16,
        waveSpeed: 0.95,
        choppiness: 0.42,
        foam: 0.55,
        color: "#0d6b73",
        opacity: 3.6,
        surfaceWaves: 1.55,
        surfaceScale: 9.5,
        distortion: 0.95,
    },
    cours: {
        id: "cours",
        label: "Cours d’eau",
        width: 1.55,
        depth: 1.05,
        waveHeight: 0.045,
        waveScale: 0.2,
        waveSpeed: 1.25,
        choppiness: 0.32,
        foam: 0.4,
        color: "#14808a",
        opacity: 2.8,
        surfaceWaves: 1.7,
        surfaceScale: 12,
        distortion: 0.75,
    },
    ruisseau: {
        id: "ruisseau",
        label: "Ruisseau",
        width: 0.55,
        depth: 0.55,
        waveHeight: 0.022,
        waveScale: 0.26,
        waveSpeed: 1.55,
        choppiness: 0.22,
        foam: 0.28,
        color: "#1a9aa3",
        opacity: 2.2,
        surfaceWaves: 1.85,
        surfaceScale: 16,
        distortion: 0.55,
    },
};

const DEFAULT_KIND = "riviere";

function pointDistXZ(a, b) {
    return Math.hypot(b.x - a.x, b.z - a.z);
}

function samplePolylineAt(points, t) {
    if (points.length === 1) return points[0].clone();
    let total = 0;
    const lengths = [];
    for (let i = 0; i < points.length - 1; i += 1) {
        const d = pointDistXZ(points[i], points[i + 1]);
        lengths.push(d);
        total += d;
    }
    if (total < 1e-5) return points[0].clone();
    let remain = THREE.MathUtils.clamp(t, 0, 1) * total;
    for (let i = 0; i < lengths.length; i += 1) {
        const d = lengths[i];
        if (remain <= d || i === lengths.length - 1) {
            const u = d < 1e-5 ? 0 : remain / d;
            return new THREE.Vector3().lerpVectors(points[i], points[i + 1], u);
        }
        remain -= d;
    }
    return points[points.length - 1].clone();
}

function polylineLength(points) {
    let total = 0;
    for (let i = 0; i < points.length - 1; i += 1) total += pointDistXZ(points[i], points[i + 1]);
    return total;
}

function tangentAtPolyline(points, t) {
    const a = samplePolylineAt(points, Math.max(0, t - 0.01));
    const b = samplePolylineAt(points, Math.min(1, t + 0.01));
    const dir = new THREE.Vector3(b.x - a.x, 0, b.z - a.z);
    if (dir.lengthSq() < 1e-8) dir.set(0, 0, 1);
    else dir.normalize();
    return dir;
}

/**
 * 2 points = trait droit. À partir du 3ᵉ clic décalé : spline qui passe par les clics.
 * @param {THREE.Vector3[]} waypoints
 */
function buildCenterline(waypoints) {
    return waypoints.map((p) => p.clone());
}

/**
 * Ruban d’eau le long du lit — surface au milieu du canal (remplissage).
 * @param {THREE.Vector3[]} centerline
 * @param {number} width
 * @param {(x: number, z: number) => number} sampleY
 * @param {number} [bedDepth=0]
 */
function buildRiverRibbon(centerline, width, sampleY, bedDepth = 0) {
    if (centerline.length < 2) return new THREE.BufferGeometry();
    const curved = centerline.length >= 3;
    const curve = curved ? new THREE.CatmullRomCurve3(centerline, false, "centripetal") : null;
    const length = Math.max(curve ? curve.getLength() : polylineLength(centerline), 0.5);
    const along = Math.max(24, Math.min(420, Math.ceil(length * 2.4)));
    const across = 10;
    let frames = null;
    if (curve) {
        try {
            frames = curve.computeFrenetFrames(along, false);
        } catch {
            frames = null;
        }
    }
    const up = new THREE.Vector3(0, 1, 0);
    const positions = [];
    const uvs = [];
    const indices = [];
    const fillLift = Math.max(0.06, bedDepth * 0.48);
    const surfaceHalf = width * 0.5 * (bedDepth > 0.2 ? 0.92 : 1);

    for (let i = 0; i <= along; i += 1) {
        const t = i / along;
        let p;
        let tangent;
        if (curve) {
            try {
                p = curve.getPointAt(t);
                tangent = frames?.tangents?.[i] ? frames.tangents[i].clone() : tangentAtPolyline(centerline, t);
            } catch {
                p = samplePolylineAt(centerline, t);
                tangent = tangentAtPolyline(centerline, t);
            }
        } else {
            p = samplePolylineAt(centerline, t);
            tangent = tangentAtPolyline(centerline, t);
        }
        tangent.y = 0;
        if (tangent.lengthSq() < 1e-8) tangent.set(0, 0, 1);
        else tangent.normalize();
        const side = new THREE.Vector3().crossVectors(up, tangent);
        if (side.lengthSq() < 1e-8) side.set(1, 0, 0);
        else side.normalize();
        const bedY = sampleY(p.x, p.z);
        const y = bedY + fillLift;
        const flare = 0.94 + 0.06 * Math.sin(t * Math.PI);
        const half = surfaceHalf * flare;
        for (let j = 0; j <= across; j += 1) {
            const v = j / across;
            const lateral = v * 2 - 1;
            const offset = lateral * half;
            // Légère cuvette de surface pour coller aux berges.
            const dish = bedDepth > 0 ? (1 - lateral * lateral) * fillLift * 0.12 : 0;
            positions.push(p.x + side.x * offset, y - dish, p.z + side.z * offset);
            uvs.push(t * (length / Math.max(width * 0.28, 0.35)), v * 2.4);
        }
    }

    const cols = across + 1;
    for (let i = 0; i < along; i += 1) {
        for (let j = 0; j < across; j += 1) {
            const a = i * cols + j;
            const b = a + 1;
            const c = a + cols;
            const d = c + 1;
            indices.push(a, c, b, b, c, d);
        }
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    return geometry;
}

function formatNum(n, digits = 2) {
    return n.toLocaleString("fr-FR", {
        minimumFractionDigits: digits,
        maximumFractionDigits: digits,
    });
}

/**
 * @param {{
 *   scene: THREE.Scene,
 *   camera: THREE.Camera,
 *   renderer: THREE.WebGLRenderer,
 *   sceneRegistry?: ReturnType<import("./lab-scene-registry.js").createSceneRegistry> | null,
 *   showStatus?: (msg: string) => void,
 *   getTerrain?: () => THREE.Object3D | null,
 *   getTerrainHeightMap?: () => ({ texture: THREE.Texture, size: number, yOffset: number, hMin: number, hMax: number } | null),
 *   carveRiverBed?: (path: { x: number, z: number }[], width: number, depth: number) => boolean,
 *   restoreRiverBed?: () => boolean,
 *   setRiverPlaceModeActive?: (active: boolean) => void,
 *   canInteractAt?: (x: number, y: number) => boolean,
 * }} options
 */
export function initRiver({
    scene,
    camera,
    renderer,
    sceneRegistry = null,
    showStatus = () => {},
    getTerrain = null,
    getTerrainHeightMap = null,
    carveRiverBed = null,
    restoreRiverBed = null,
    setRiverPlaceModeActive = null,
    canInteractAt = null,
}) {
    /** @type {RealisticOcean | null} */
    let mesh = null;
    /** @type {THREE.Texture | null} */
    let normalsTex = null;
    /** @type {THREE.Vector3[]} */
    let waypoints = [];
    /** @type {RiverKind} */
    let kind = DEFAULT_KIND;
    let placing = false;
    let widthOverride = null;
    let rebuildSeq = 0;
    let drawing = false;
    /** @type {number | null} */
    let strokePointerId = null;
    /** @type {THREE.Vector3 | null} */
    let hoverPoint = null;
    let previewRaf = 0;
    /** @type {THREE.Line | null} */
    let previewLine = null;

    /** @type {((entry: { type: "river", before: object | null, after: object | null }) => void) | null} */
    let pushSceneHistory = null;

    const sunDir = new THREE.Vector3(0.45, 0.85, 0.25).normalize();
    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    const down = new THREE.Vector3(0, -1, 0);
    const from = new THREE.Vector3();
    const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    const planeHit = new THREE.Vector3();
    /** @type {THREE.Group | null} */
    let markers = null;

    const traceBtn = /** @type {HTMLButtonElement | null} */ (document.getElementById("btn-trace-river"));
    const finishBtn = /** @type {HTMLButtonElement | null} */ (document.getElementById("btn-river-finish"));
    const undoBtn = /** @type {HTMLButtonElement | null} */ (document.getElementById("btn-river-undo"));
    const removeBtn = /** @type {HTMLButtonElement | null} */ (document.getElementById("btn-river-remove"));
    const toolsEl = document.getElementById("lab-river-tools");
    const kindGroup = document.getElementById("lab-river-kinds");
    const widthInput = /** @type {HTMLInputElement | null} */ (document.getElementById("lab-river-width"));
    const widthValue = /** @type {HTMLOutputElement | null} */ (document.getElementById("lab-river-width-value"));

    function kindPreset() {
        return RIVER_KINDS[kind] || RIVER_KINDS.riviere;
    }

    function currentWidth() {
        const preset = kindPreset();
        return Math.max(0.4, Number(widthOverride) || preset.width);
    }

    function sampleGroundY(x, z) {
        const terrain = getTerrain?.();
        if (terrain) {
            from.set(x, 400, z);
            raycaster.set(from, down);
            const hits = raycaster.intersectObject(terrain, true);
            if (hits[0]) return hits[0].point.y;
        }
        return 0;
    }

    function syncKindButtons() {
        kindGroup?.querySelectorAll("[data-river-kind]").forEach((btn) => {
            btn.classList.toggle("is-active", btn.getAttribute("data-river-kind") === kind);
        });
    }

    function syncUi() {
        const preset = kindPreset();
        const w = currentWidth();
        if (widthInput) widthInput.value = String(w);
        if (widthValue) widthValue.textContent = `${formatNum(w, 1)} m`;
        syncKindButtons();
        traceBtn?.classList.toggle("is-active", placing);
        if (toolsEl) toolsEl.hidden = false;
        if (finishBtn) finishBtn.hidden = !placing;
        if (undoBtn) undoBtn.disabled = waypoints.length === 0;
        if (removeBtn) removeBtn.disabled = !mesh && waypoints.length === 0;
    }

    function ensureMarkers() {
        if (markers) return markers;
        markers = new THREE.Group();
        markers.name = "lab-river-markers";
        markers.userData.labNoPick = true;
        markers.userData.labHelper = true;
        scene.add(markers);
        return markers;
    }

    function refreshMarkers() {
        const group = ensureMarkers();
        while (group.children.length) {
            const child = group.children[0];
            group.remove(child);
            child.geometry?.dispose();
            child.material?.dispose();
        }
        if (!placing && waypoints.length < 2) {
            group.visible = false;
            return;
        }
        group.visible = placing;
        const mat = new THREE.MeshBasicMaterial({ color: PREVIEW_COLOR, depthTest: false });
        for (const p of waypoints) {
            const m = new THREE.Mesh(new THREE.SphereGeometry(0.28, 10, 10), mat);
            m.position.set(p.x, sampleGroundY(p.x, p.z) + 0.35, p.z);
            m.renderOrder = 30;
            group.add(m);
        }
    }

    function hidePreview() {
        if (previewLine) previewLine.visible = false;
        hoverPoint = null;
    }

    function previewPathPoints() {
        const pts = waypoints.map((p) => p.clone());
        if (
            hoverPoint &&
            (!pts.length || pointDistXZ(pts[pts.length - 1], hoverPoint) > 0.15)
        ) {
            pts.push(hoverPoint.clone());
        }
        return pts;
    }

    function refreshPreview() {
        if (!placing) {
            hidePreview();
            return;
        }
        const pts = previewPathPoints();
        if (pts.length < 2) {
            if (previewLine) previewLine.visible = false;
            return;
        }
        const curved = pts.length >= 3;
        const n = Math.max(8, Math.min(80, Math.ceil(polylineLength(pts) * 2)));
        const samples = [];
        if (curved) {
            try {
                const curve = new THREE.CatmullRomCurve3(pts, false, "centripetal");
                for (let i = 0; i <= n; i += 1) {
                    const p = curve.getPointAt(i / n);
                    samples.push(p.x, sampleGroundY(p.x, p.z) + 0.12, p.z);
                }
            } catch {
                for (let i = 0; i <= n; i += 1) {
                    const p = samplePolylineAt(pts, i / n);
                    samples.push(p.x, sampleGroundY(p.x, p.z) + 0.12, p.z);
                }
            }
        } else {
            for (let i = 0; i <= n; i += 1) {
                const p = samplePolylineAt(pts, i / n);
                samples.push(p.x, sampleGroundY(p.x, p.z) + 0.12, p.z);
            }
        }
        const geo = new THREE.BufferGeometry();
        geo.setAttribute("position", new THREE.Float32BufferAttribute(samples, 3));
        if (!previewLine) {
            previewLine = new THREE.Line(
                geo,
                new THREE.LineBasicMaterial({ color: PREVIEW_COLOR, depthTest: false })
            );
            previewLine.name = "lab-river-preview";
            previewLine.renderOrder = 31;
            previewLine.userData.labHelper = true;
            previewLine.userData.labNoPick = true;
            scene.add(previewLine);
        } else {
            previewLine.geometry.dispose();
            previewLine.geometry = geo;
        }
        previewLine.visible = true;
    }

    function pickGround(clientX, clientY) {
        const rect = renderer.domElement.getBoundingClientRect();
        pointer.x = ((clientX - rect.left) / rect.width) * 2 - 1;
        pointer.y = -((clientY - rect.top) / rect.height) * 2 + 1;
        raycaster.setFromCamera(pointer, camera);
        const roots = [];
        const terrain = getTerrain?.();
        if (terrain) roots.push(terrain);
        const floor = scene.getObjectByName("lab-floor");
        if (floor) roots.push(floor);
        if (roots.length) {
            const hits = raycaster.intersectObjects(roots, true);
            for (const hit of hits) {
                if (!hit?.point) continue;
                if (hit.object?.userData?.labHelper) continue;
                if (hit.object?.name === "lab-river" || hit.object?.name === "lab-ocean") continue;
                return hit.point.clone();
            }
        }
        if (raycaster.ray.intersectPlane(groundPlane, planeHit)) return planeHit.clone();
        return null;
    }

    function registerSceneItem() {
        if (!sceneRegistry || !mesh) return;
        sceneRegistry.unregister(RIVER_SCENE_ITEM_ID);
        const preset = kindPreset();
        sceneRegistry.register({
            id: RIVER_SCENE_ITEM_ID,
            label: preset.label,
            category: "environment",
            icon: "env",
            detail: `${waypoints.length} points · ${formatNum(currentWidth(), 1)} m`,
            getVisible: () => !!mesh && mesh.visible,
            setVisible: (visible) => {
                if (mesh) mesh.visible = visible;
            },
            select: () => {},
            canDelete: () => true,
            onDelete: () => removeRiver({ recordHistory: true }),
        });
    }

    function serializeState() {
        return {
            kind,
            width: currentWidth(),
            widthOverride: widthOverride == null ? null : currentWidth(),
            points: waypoints.map((p) => ({ x: p.x, y: p.y, z: p.z })),
            visible: mesh ? mesh.visible !== false : true,
        };
    }

    function commitHistory(before) {
        pushSceneHistory?.({ type: "river", before, after: serializeState() });
    }

    function applyWaterSettings() {
        if (!mesh) return;
        const preset = kindPreset();
        const u = mesh.material.uniforms;
        u.waterColor.value.set(preset.color);
        u.uShallowColor.value.set(0x5ad4e0);
        u.sunColor.value.set(0xfff1d6);
        u.alpha.value = preset.opacity;
        u.distortionScale.value = preset.distortion;
        u.uWaveHeight.value = preset.waveHeight;
        u.uWaveScale.value = preset.waveScale;
        u.uWaveSpeed.value = preset.waveSpeed;
        u.uChoppiness.value = preset.choppiness;
        u.uFoamAmount.value = preset.foam;
        u.uSurfaceDetail.value = preset.surfaceWaves;
        u.uSurfaceScale.value = preset.surfaceScale;
        u.size.value = 3.4 + preset.surfaceScale * 0.12;
        u.sunDirection.value.copy(sunDir);
        const info = getTerrainHeightMap?.() ?? null;
        if (info?.texture) {
            u.uTerrainEnabled.value = 1;
            u.uTerrainHeight.value = info.texture;
            u.uTerrainSize.value = info.size;
            u.uTerrainYOffset.value = info.yOffset;
            u.uTerrainHMin.value = info.hMin;
            u.uTerrainHMax.value = info.hMax;
            u.uShoreWidth.value = Math.max(1.6, currentWidth() * 0.45 + (preset.depth ?? 1) * 0.35);
        } else {
            u.uTerrainEnabled.value = 0;
        }
    }

    async function rebuildMesh({ recordHistory = false, before = null } = {}) {
        if (waypoints.length < 2) {
            restoreRiverBed?.();
            if (mesh) {
                scene.remove(mesh);
                mesh.disposeResources();
                mesh = null;
                sceneRegistry?.unregister(RIVER_SCENE_ITEM_ID);
            }
            refreshMarkers();
            refreshPreview();
            syncUi();
            if (recordHistory) commitHistory(before);
            return;
        }
        const preset = kindPreset();
        const bedDepth = preset.depth ?? Math.max(0.5, currentWidth() * 0.45);
        const centerline = buildCenterline(waypoints);
        if (carveRiverBed && getTerrain?.()) {
            carveRiverBed(
                centerline.map((p) => ({ x: p.x, z: p.z })),
                currentWidth(),
                bedDepth
            );
        }
        const draped = centerline.map((p) => {
            const y = sampleGroundY(p.x, p.z);
            return new THREE.Vector3(p.x, y, p.z);
        });
        const geometry = buildRiverRibbon(draped, currentWidth(), sampleGroundY, bedDepth);
        geometry.computeBoundingBox();
        const center = new THREE.Vector3();
        geometry.boundingBox?.getCenter(center);
        geometry.translate(-center.x, -center.y, -center.z);
        const seq = ++rebuildSeq;
        if (!normalsTex) normalsTex = await loadWaterNormals(WATER_NORMALS_URL);
        if (seq !== rebuildSeq) {
            geometry.dispose();
            return;
        }
        if (!mesh) {
            mesh = new RealisticOcean(geometry, {
                waterNormals: normalsTex,
                sunDirection: sunDir.clone(),
                sunColor: 0xfff1d6,
                waterColor: new THREE.Color(preset.color).getHex(),
                shallowColor: 0x5ad4e0,
                distortionScale: preset.distortion,
                alpha: preset.opacity,
                textureWidth: 512,
                textureHeight: 512,
            });
            mesh.name = "lab-river";
            mesh.userData.labRiver = true;
            mesh.userData.labNoPick = true;
            const mirrorPass = mesh.onBeforeRender.bind(mesh);
            mesh.onBeforeRender = (rend, scn, cam) => {
                if (!mesh) return;
                applyWaterSettings();
                mirrorPass(rend, scn, cam);
            };
            scene.add(mesh);
        } else {
            const prev = mesh.geometry;
            mesh.geometry = geometry;
            prev.dispose();
        }
        mesh.position.copy(center);
        applyWaterSettings();
        registerSceneItem();
        refreshMarkers();
        refreshPreview();
        syncUi();
        if (recordHistory) {
            pushSceneHistory?.({ type: "river", before, after: serializeState() });
        }
    }

    function setPlacing(active) {
        placing = !!active;
        setRiverPlaceModeActive?.(placing);
        if (!placing) hidePreview();
        if (placing) {
            showStatus(
                waypoints.length === 0
                    ? `Cliquez ou glissez le départ du ${kindPreset().label.toLowerCase()}`
                    : waypoints.length === 1
                      ? "Tirez un trait droit jusqu’au 2ᵉ point"
                      : "Clic suivant : dans l’axe = droit, décalé = courbe"
            );
        }
        refreshMarkers();
        refreshPreview();
        syncUi();
    }

    function addPointFromClient(clientX, clientY) {
        if (canInteractAt && !canInteractAt(clientX, clientY)) return false;
        const point = pickGround(clientX, clientY);
        if (!point) {
            showStatus("Cliquez sur le sol ou le terrain");
            return false;
        }
        const before = serializeState();
        if (waypoints.length) {
            const last = waypoints[waypoints.length - 1];
            if (pointDistXZ(point, last) < MIN_POINT_DIST) {
                return false;
            }
        }
        waypoints.push(new THREE.Vector3(point.x, point.y, point.z));
        commitHistory(before);
        void rebuildMesh();
        if (waypoints.length === 1) {
            showStatus("Tirez un trait droit jusqu’au 2ᵉ point (clic ou glisser)");
        } else if (waypoints.length === 2) {
            showStatus("Trait droit posé — un 3ᵉ clic décalé crée la courbe");
        } else {
            showStatus(`${kindPreset().label} : ${waypoints.length} points — recliquez pour prolonger`);
        }
        return true;
    }

    function undoLastPoint() {
        if (!waypoints.length) return false;
        const before = serializeState();
        waypoints.pop();
        commitHistory(before);
        void rebuildMesh();
        if (waypoints.length === 0) showStatus("Tracé vidé — recliquez le départ");
        else if (waypoints.length === 1) showStatus("Retour au trait droit — cliquez l’arrivée");
        else showStatus("Dernier point retiré");
        return true;
    }

    function removeRiver({ recordHistory = true } = {}) {
        const before = recordHistory ? serializeState() : null;
        waypoints = [];
        widthOverride = null;
        restoreRiverBed?.();
        if (mesh) {
            scene.remove(mesh);
            mesh.disposeResources();
            mesh = null;
        }
        sceneRegistry?.unregister(RIVER_SCENE_ITEM_ID);
        setPlacing(false);
        refreshMarkers();
        syncUi();
        showStatus("Cours d’eau retiré");
        if (recordHistory && before) {
            pushSceneHistory?.({ type: "river", before, after: null });
        }
    }

    traceBtn?.addEventListener("click", (event) => {
        event.stopPropagation();
        setPlacing(!placing);
        if (placing && waypoints.length === 0) {
            showStatus(`Cliquez le départ du ${kindPreset().label.toLowerCase()}`);
        } else if (!placing && waypoints.length >= 2) {
            showStatus(`${kindPreset().label} tracé — recliquez « Tracer » pour prolonger`);
        }
    });

    finishBtn?.addEventListener("click", (event) => {
        event.stopPropagation();
        setPlacing(false);
        if (waypoints.length < 2) showStatus("Il faut au moins deux clics");
        else showStatus(`${kindPreset().label} terminé`);
    });

    undoBtn?.addEventListener("click", (event) => {
        event.stopPropagation();
        undoLastPoint();
    });

    removeBtn?.addEventListener("click", (event) => {
        event.stopPropagation();
        removeRiver({ recordHistory: true });
    });

    kindGroup?.querySelectorAll("[data-river-kind]").forEach((btn) => {
        btn.addEventListener("click", (event) => {
            event.stopPropagation();
            const next = /** @type {RiverKind} */ (btn.getAttribute("data-river-kind") || DEFAULT_KIND);
            if (!RIVER_KINDS[next]) return;
            const before = serializeState();
            kind = next;
            widthOverride = null;
            commitHistory(before);
            void rebuildMesh();
            showStatus(`${RIVER_KINDS[next].label} — largeur ${formatNum(currentWidth(), 1)} m`);
        });
    });

    widthInput?.addEventListener("input", () => {
        widthOverride = Number(widthInput.value);
        if (widthValue) widthValue.textContent = `${formatNum(currentWidth(), 1)} m`;
    });
    widthInput?.addEventListener("change", () => {
        const before = serializeState();
        widthOverride = Number(widthInput.value);
        commitHistory(before);
        void rebuildMesh();
    });

    function endStroke(event) {
        if (!drawing) return;
        drawing = false;
        if (strokePointerId != null) {
            try {
                renderer.domElement.releasePointerCapture(strokePointerId);
            } catch {
                /* ignore */
            }
            strokePointerId = null;
        }
        addPointFromClient(event.clientX, event.clientY);
    }

    renderer.domElement.addEventListener(
        "pointerdown",
        (event) => {
            if (!placing || event.button !== 0) return;
            if (canInteractAt && !canInteractAt(event.clientX, event.clientY)) return;
            event.preventDefault();
            event.stopPropagation();
            drawing = true;
            strokePointerId = event.pointerId;
            try {
                renderer.domElement.setPointerCapture(event.pointerId);
            } catch {
                /* ignore */
            }
            if (waypoints.length === 0) {
                addPointFromClient(event.clientX, event.clientY);
            }
        },
        true
    );

    renderer.domElement.addEventListener("pointermove", (event) => {
        if (!placing) return;
        hoverPoint = pickGround(event.clientX, event.clientY);
        if (previewRaf) return;
        previewRaf = requestAnimationFrame(() => {
            previewRaf = 0;
            refreshPreview();
        });
    });

    renderer.domElement.addEventListener("pointerup", endStroke);
    renderer.domElement.addEventListener("pointercancel", () => {
        drawing = false;
        strokePointerId = null;
    });

    window.addEventListener("keydown", (event) => {
        if (!placing) return;
        if (event.key === "Escape") {
            event.preventDefault();
            setPlacing(false);
        }
    });

    syncUi();

    return {
        isPlacing: () => placing,
        isActive: () => waypoints.length >= 2 && !!mesh,
        getPointCount: () => waypoints.length,
        setPlacing,
        addPointFromClient,
        undoLastPoint,
        remove: removeRiver,
        tick(dt) {
            if (!mesh?.material?.uniforms) return;
            const d = THREE.MathUtils.clamp(Number(dt) || 1 / 60, 0.001, 0.1);
            const preset = kindPreset();
            mesh.material.uniforms.time.value += d * preset.waveSpeed;
            mesh.material.uniforms.uTime.value += d;
        },
        serialize: serializeState,
        /**
         * @param {unknown} data
         * @param {{ recordHistory?: boolean }} [opts]
         */
        async deserialize(data, { recordHistory = false, preservePlacing = true } = {}) {
            if (!data || typeof data !== "object") {
                waypoints = [];
                widthOverride = null;
                if (mesh) {
                    scene.remove(mesh);
                    mesh.disposeResources();
                    mesh = null;
                }
                sceneRegistry?.unregister(RIVER_SCENE_ITEM_ID);
                if (!preservePlacing) setPlacing(false);
                else {
                    refreshMarkers();
                    refreshPreview();
                    syncUi();
                }
                return;
            }
            const raw = /** @type {{ kind?: string, width?: number, widthOverride?: number | null, points?: { x: number, y: number, z: number }[], visible?: boolean }} */ (
                data
            );
            kind = RIVER_KINDS[raw.kind] ? /** @type {RiverKind} */ (raw.kind) : DEFAULT_KIND;
            widthOverride =
                typeof raw.widthOverride === "number"
                    ? raw.widthOverride
                    : typeof raw.width === "number"
                      ? raw.width
                      : null;
            waypoints = Array.isArray(raw.points)
                ? raw.points
                      .filter((p) => p && Number.isFinite(p.x) && Number.isFinite(p.z))
                      .map((p) => new THREE.Vector3(p.x, Number(p.y) || 0, p.z))
                : [];
            await rebuildMesh({ recordHistory: false });
            if (mesh && raw.visible === false) mesh.visible = false;
            if (!preservePlacing) setPlacing(false);
            else {
                refreshMarkers();
                refreshPreview();
                syncUi();
            }
            if (recordHistory) {
                pushSceneHistory?.({ type: "river", before: null, after: serializeState() });
            }
        },
        setSceneHistoryPush(fn) {
            pushSceneHistory = fn;
        },
    };
}
