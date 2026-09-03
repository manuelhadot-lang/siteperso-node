/** Galerie Three.js — grille, navigation ZQSD sans verrouillage souris (panneau toujours accessible). */
import * as THREE from "three";
import { movePlayer, moveSpeed, setMoveSpeed, jump, updatePlayerVertical, getGroundEyeY, setCollisionDeltaTime, setObjectCollisionEnabled, setGroundCollisionEnabled, resetPlayerVerticalMotion, snapPlayerToGroundNow, isPlayerGrounded, PLAYER_HEIGHT, suppressPlayerCollisionBriefly } from "./lab-collision.js";
import { GRID_SIZE, formatGridSizeMeters } from "./grid-constants.js";
import { initQuadView } from "./lab-quad-view.js";
import { createEnvironmentItem } from "./lab-scene-registry.js";
import { configureRendererShadows, getObjectShadowEnabled, getObjectShadowOpacity, setObjectShadowEnabled, setObjectShadowOpacity } from "./lab-shadows.js";
import { applyStudioEnvironment } from "./lab-studio-env.js";
import { normalizeWheelDelta } from "./wheel-utils.js";

const LOOK_SENSITIVITY = 0.002;
const ORBIT_SENSITIVITY = 0.005;
const WHEEL_ZOOM_SPEED = 0.004;
/** Zoom orbite conception : ~3 % par cran de molette. */
const WHEEL_ORBIT_ZOOM = 0.045;
const MAX_EYE_HEIGHT = 8;
const MAX_FLY_HEIGHT = 45;
const SPRINT_MULTIPLIER = 1.85;
/** Head-bob / respiration (style UE4). */
const BOB_WALK_FREQ = 7.2;
const BOB_RUN_FREQ = 11.5;
const BOB_WALK_AMP_Y = 0.028;
const BOB_WALK_AMP_X = 0.014;
const BOB_WALK_ROLL = 0.0045;
const BOB_RUN_AMP_Y = 0.062;
const BOB_RUN_AMP_X = 0.034;
const BOB_RUN_ROLL = 0.011;
const BREATH_FREQ = 1.35;
const BREATH_AMP = 0.007;
/** Vue d’ensemble — hauteur / distance adaptées à la taille du monde. */
const DEFAULT_OVERVIEW_PITCH = -0.42;
/** FOV conception / vue d’ensemble (plus serré pour cadrer les objets). */
const CAMERA_FOV_DESIGN = 50;
/**
 * FOV FPS (vertical, Three.js).
 * 70° restait trop « télé » : peu de périphérie, pièce 4×3 m peu lisible.
 * ~85° ≈ champ confortable écran pour sentir murs / plafond / profondeur 1:1.
 */
const CAMERA_FOV_FPS = 85;
/** Plan near caméra FPS : assez bas pour les murs proches, sans z-fighting excessif. */
const CAMERA_NEAR_FPS = 0.08;
const CAMERA_NEAR_DESIGN = 0.02;
/** Brouillard : near > 0 pour ne pas aplatir le contraste dans une pièce. */
const SCENE_FOG_NEAR = 14;
const SCENE_FOG_FAR = 90;
const CLICK_THRESHOLD_PX = 8;
const FOCUS_DISTANCE = 1.35;

const focusTarget = new THREE.Vector3();
const focusViewDir = new THREE.Vector3();
const focusDesiredPos = new THREE.Vector3();
const focusBox = new THREE.Box3();
const focusSize = new THREE.Vector3();
const lookTarget = new THREE.Vector3();
const orbitTarget = new THREE.Vector3(0, 0.5, 0);

/**
 * @param {HTMLElement} container #lab-viewport
 * @param {{ blocker: HTMLElement, moveSpeedInput?: HTMLInputElement | null, onMovementModeChange?: (mode: "fps" | "design" | "overview") => void }} ui
 */
export function initGallery(container, ui) {
    let camera;
    let scene;
    let renderer;
    const yaw = new THREE.Object3D();
    const pitch = new THREE.Object3D();

    let exploreActive = false;
    let moveForward = false;
    let moveBackward = false;
    let moveLeft = false;
    let moveRight = false;
    let prevTime = performance.now();
    const velocity = new THREE.Vector3();
    const direction = new THREE.Vector3();
    const viewDirection = new THREE.Vector3();
    const moveDelta = new THREE.Vector3();

    /** @type {((e: MouseEvent) => void) | null} */
    let canvasRightClickHandler = null;
    /** @type {((e: MouseEvent) => void) | null} */
    let canvasLeftClickHandler = null;
    /** @type {((e: MouseEvent) => void) | null} */
    let canvasDoubleClickHandler = null;
    let gizmoDragging = false;
    let drawModeActive = false;
    let terrainSculptModeActive = false;
    let vegetationPlaceModeActive = false;
    let avatarPlaceModeActive = false;
    let lightPlaceModeActive = false;
    let riverPlaceModeActive = false;
    let rightLookActive = false;
    /** @type {"fps" | "design" | "overview"} */
    let movementMode = "design";
    let pendingRightClick = null;
    let pendingLeftClick = null;
    let leftLookActive = false;
    let sprinting = false;
    let orbitDistance = 8;
    let orbitTheta = 0.6;
    let orbitPhi = 0.35;
    let bobPhase = 0;
    let breathPhase = 0;
    /** @type {(() => void) | null} */
    let afterRender = null;
    /** @type {(() => void) | null} */
    let beforeRender = null;

    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x1a1a1a);
    scene.fog = new THREE.Fog(0x1a1a1a, SCENE_FOG_NEAR, SCENE_FOG_FAR);

    const defaultAmbient = new THREE.AmbientLight(0xffffff, 0.42);
    defaultAmbient.userData.labDefaultLight = true;
    const defaultHemisphere = new THREE.HemisphereLight(0xdceeff, 0x2a3824, 0.38);
    defaultHemisphere.position.set(0, 40, 0);
    defaultHemisphere.userData.labDefaultLight = true;
    // Pas de soleil directionnel « fantôme » : les ombres / faisceaux
    // n’apparaissent qu’avec les lumières placées par l’utilisateur.
    scene.add(defaultAmbient, defaultHemisphere);

    camera = new THREE.PerspectiveCamera(CAMERA_FOV_DESIGN, 1, CAMERA_NEAR_DESIGN, 1000);
    pitch.add(camera);
    yaw.add(pitch);
    scene.add(yaw);
    yaw.position.set(0, PLAYER_HEIGHT, 4);

    const gridHelper = new THREE.GridHelper(GRID_SIZE, GRID_SIZE, 0x6b7280, 0x3f4a5a);
    gridHelper.position.y = 0.02;
    scene.add(gridHelper);

    const floor = new THREE.Mesh(
        new THREE.PlaneGeometry(GRID_SIZE, GRID_SIZE),
        new THREE.MeshLambertMaterial({ color: 0x222222, side: THREE.DoubleSide })
    );
    floor.rotation.x = -Math.PI / 2;
    floor.name = "lab-floor";
    floor.userData.labFloorVisual = true;
    setObjectShadowEnabled(floor, true, { receiveOnly: true });
    scene.add(floor);

    /** Préférence utilisateur : plateau visible (indépendant de la collision sol y=0). */
    let floorUserVisible = true;
    /** Masqué automatiquement tant qu’un terrain couvre la grille. */
    let floorCoveredByTerrain = false;

    let worldSizeMeters = GRID_SIZE;
    /** @type {ReturnType<import("./lab-scene-registry.js").createSceneRegistry> | null} */
    let environmentRegistry = null;
    const floorVisibleInput = /** @type {HTMLInputElement | null} */ (
        document.getElementById("lab-floor-visible")
    );

    function syncFloorVisibility() {
        floor.visible = floorUserVisible && !floorCoveredByTerrain;
        if (floorVisibleInput) {
            floorVisibleInput.checked = floorUserVisible;
            floorVisibleInput.disabled = floorCoveredByTerrain;
            floorVisibleInput.title = floorCoveredByTerrain
                ? "Masqué tant qu’un terrain est présent — la collision joueur reste active"
                : "Afficher / masquer le plateau (collision joueur conservée)";
        }
        environmentRegistry?.refresh?.();
    }

    /**
     * Visuel uniquement — ne touche jamais à setGroundCollisionEnabled.
     * @param {boolean} visible
     */
    function setFloorUserVisible(visible) {
        floorUserVisible = !!visible;
        syncFloorVisibility();
    }

    /**
     * @param {boolean} covered
     */
    function setFloorCoveredByTerrain(covered) {
        floorCoveredByTerrain = !!covered;
        syncFloorVisibility();
    }

    if (floorVisibleInput) {
        floorVisibleInput.checked = floorUserVisible;
        floorVisibleInput.addEventListener("change", () => {
            setFloorUserVisible(floorVisibleInput.checked);
        });
    }

    /**
     * @param {ReturnType<import("./lab-scene-registry.js").createSceneRegistry>} registry
     */
    function registerEnvironmentItems(registry) {
        environmentRegistry = registry;
        registry.register(
            createEnvironmentItem("env-grid", "Grille", gridHelper, {
                detail: formatGridSizeMeters(worldSizeMeters),
            })
        );
        registry.register(
            createEnvironmentItem("env-floor", "Plateau", floor, {
                getVisible: () => floorUserVisible && !floorCoveredByTerrain,
                setVisible: (visible) => setFloorUserVisible(visible),
                isVisibleEnabled: () => !floorCoveredByTerrain,
                detail: "Visuel seul — la collision joueur reste active si masqué",
                getShadow: () => floor.receiveShadow || getObjectShadowEnabled(floor),
                setShadow: (enabled) => {
                    setObjectShadowEnabled(floor, enabled, { receiveOnly: true });
                },
                getShadowOpacity: () => getObjectShadowOpacity(floor),
                setShadowOpacity: (value) => {
                    setObjectShadowOpacity(floor, value, { receiveOnly: true });
                },
            })
        );
    }

    const { blocker, moveSpeedInput, onMovementModeChange } = ui;

    function normalizeMode(mode) {
        if (mode === "fps") return "fps";
        if (mode === "overview" || mode === "col") return "overview";
        return "design";
    }

    function syncOrbitFromCamera() {
        const dx = yaw.position.x - orbitTarget.x;
        const dy = yaw.position.y - orbitTarget.y;
        const dz = yaw.position.z - orbitTarget.z;
        orbitDistance = Math.max(0.08, Math.hypot(dx, dy, dz));
        orbitTheta = Math.atan2(dx, dz);
        orbitPhi = Math.asin(THREE.MathUtils.clamp(dy / orbitDistance, -0.99, 0.99));
    }

    /**
     * Hauteur mini caméra en inspection (près du sol/objet), pas la hauteur d’œil FPS (1,62 m).
     * @param {number} x
     * @param {number} z
     */
    function getInspectMinCamY(x, z) {
        return getGroundEyeY(x, z) - PLAYER_HEIGHT + 0.08;
    }

    /** Distance orbite sous laquelle on autorise une caméra basse (cadrage face / objet). */
    const INSPECT_ORBIT_CLOSE = 4.5;

    function applyOrbitCamera() {
        const cosPhi = Math.cos(orbitPhi);
        yaw.position.set(
            orbitTarget.x + orbitDistance * Math.sin(orbitTheta) * cosPhi,
            orbitTarget.y + orbitDistance * Math.sin(orbitPhi),
            orbitTarget.z + orbitDistance * Math.cos(orbitTheta) * cosPhi
        );
        const minCamY =
            orbitDistance < INSPECT_ORBIT_CLOSE
                ? getInspectMinCamY(yaw.position.x, yaw.position.z)
                : getGroundEyeY(yaw.position.x, yaw.position.z) + 0.15;
        yaw.position.y = Math.max(yaw.position.y, minCamY);
        aimAtWorldTarget(orbitTarget);
    }

    /**
     * Met à jour le pivot d’orbite (mode Conception).
     * Par défaut : ne déplace pas la caméra — seul `frame: true` recentre la vue.
     * Sans frame : met à jour le pivot + angles (caméra fixe). Pas de réorientation
     * pendant un drag gizmo (sinon le TranslateControls « glisse » bizarrement).
     * @param {THREE.Vector3 | { x: number, y: number, z: number } | null} target
     * @param {{ frame?: boolean }} [opts]
     */
    function setOrbitTarget(target, opts = {}) {
        if (target) {
            orbitTarget.set(target.x, target.y, target.z);
        }
        if (!target || movementMode !== "design") return;
        // Recalcule angles/distance pour le prochain orbit, sans bouger la caméra.
        syncOrbitFromCamera();
        if (opts.frame === true) {
            applyOrbitCamera();
        }
        // Pas d’aimAtWorldTarget ici : réorienter le regard après un drag
        // (surtout spot) donne l’impression que l’objet « saute ».
    }

    function syncCameraFovForMode() {
        const nextFov = movementMode === "fps" ? CAMERA_FOV_FPS : CAMERA_FOV_DESIGN;
        const nextNear = movementMode === "fps" ? CAMERA_NEAR_FPS : CAMERA_NEAR_DESIGN;
        let dirty = false;
        if (Math.abs(camera.fov - nextFov) >= 0.01) {
            camera.fov = nextFov;
            dirty = true;
        }
        if (Math.abs(camera.near - nextNear) >= 0.001) {
            camera.near = nextNear;
            dirty = true;
        }
        if (dirty) camera.updateProjectionMatrix();
    }

    function applyMovementMode(mode) {
        movementMode = normalizeMode(mode);
        enterExplore();
        container.classList.toggle("lab-viewport--fps", movementMode === "fps");
        container.classList.toggle("lab-viewport--design", movementMode === "design");
        container.classList.toggle("lab-viewport--overview", movementMode === "overview");
        syncCameraFovForMode();

        if (movementMode === "overview") {
            setObjectCollisionEnabled(false);
            setGroundCollisionEnabled(false);
            resetPlayerVerticalMotion();
            clampPosition({ allowFly: true });
        } else if (movementMode === "fps") {
            setObjectCollisionEnabled(true);
            setGroundCollisionEnabled(true);
            resetPlayerVerticalMotion();
            snapPlayerToGroundNow();
            resetHeadBob(true);
        } else {
            setObjectCollisionEnabled(true);
            setGroundCollisionEnabled(true);
            resetPlayerVerticalMotion();
            resetHeadBob();
            syncOrbitFromCamera();
            applyOrbitCamera();
        }
        onMovementModeChange?.(movementMode);
    }

    /** Hauteur max caméra (conception / vue d’ensemble) — suit la taille du monde. */
    function getDesignMaxY() {
        return Math.max(MAX_FLY_HEIGHT, worldSizeMeters * 1.15);
    }

    /**
     * Cadre le plateau (grille) depuis le mode Conception, origine au centre.
     */
    function frameStudioPlateau() {
        orbitTarget.set(0, 0.5, 0);
        orbitDistance = THREE.MathUtils.clamp(worldSizeMeters * 0.55, 16, 42);
        orbitTheta = 0.7;
        orbitPhi = 0.38;
        resetPlayerVerticalMotion();
        movementMode = "design";
        enterExplore();
        container.classList.toggle("lab-viewport--fps", false);
        container.classList.toggle("lab-viewport--design", true);
        container.classList.toggle("lab-viewport--overview", false);
        syncCameraFovForMode();
        setObjectCollisionEnabled(true);
        setGroundCollisionEnabled(true);
        resetHeadBob();
        applyOrbitCamera();
        onMovementModeChange?.(movementMode);
    }

    /**
     * Réinitialise la vue. `resetWorld` (Fichier → Nouveau) ramène aussi
     * la grille 50 m, le plateau et une caméra centrée.
     * @param {{ resetWorld?: boolean }} [opts]
     */
    function restoreDefaultEnvironment() {
        scene.background = null;
        scene.environment = null;
        if ("backgroundBlurriness" in scene) scene.backgroundBlurriness = 0;
        if ("backgroundIntensity" in scene) scene.backgroundIntensity = 1;
        if ("environmentIntensity" in scene) scene.environmentIntensity = 1;
        scene.background = new THREE.Color(0x1a1a1a);
        scene.fog = new THREE.Fog(0x1a1a1a, SCENE_FOG_NEAR, SCENE_FOG_FAR);
        renderer.toneMapping = THREE.NoToneMapping;
        renderer.toneMappingExposure = 1;
        applyStudioEnvironment(scene, renderer);
        syncWorldFog(worldSizeMeters);
        // S’assurer qu’aucun fond HDRI n’a survécu (texture encore assignée).
        if (scene.background && scene.background.isTexture) {
            scene.background = new THREE.Color(0x1a1a1a);
        }
    }

    function resetViewForNewScene({ resetWorld = false } = {}) {
        if (resetWorld) {
            restoreDefaultEnvironment();
            setWorldSize(GRID_SIZE);
            gridHelper.visible = true;
            gridHelper.position.y = 0.02;
            floorUserVisible = true;
            floorCoveredByTerrain = false;
            syncFloorVisibility();
            environmentRegistry?.refresh?.();
            frameStudioPlateau();
            return;
        }
        const eyeY = getOverviewEyeY();
        yaw.position.set(0, eyeY, getOverviewZ());
        yaw.rotation.y = 0;
        pitch.rotation.x = DEFAULT_OVERVIEW_PITCH;
        resetPlayerVerticalMotion();
        orbitTarget.set(0, 0.5, 0);
        applyMovementMode("overview");
        const groundEyeY = getGroundEyeY(yaw.position.x, yaw.position.z);
        yaw.position.y = Math.max(eyeY, groundEyeY + 2.5);
        clampPosition({ allowFly: true });
    }

    /**
     * Téléporte l’avatar (pieds sur le point, yeux à PLAYER_HEIGHT au-dessus).
     * @param {number | THREE.Vector3} x
     * @param {number} [y]
     * @param {number} [z]
     * @param {{ yaw?: number, switchToFps?: boolean, snapGround?: boolean, exact?: boolean }} [opts]
     */
    function placePlayerAt(x, y, z, opts = {}) {
        let px;
        let py;
        let pz;
        if (x && typeof x === "object" && "x" in x) {
            px = Number(x.x);
            py = Number(x.y);
            pz = Number(x.z);
            opts = y && typeof y === "object" ? y : opts;
        } else {
            px = Number(x);
            py = Number(y);
            pz = Number(z);
        }
        if (![px, py, pz].every(Number.isFinite)) return false;

        const wantFps = opts.switchToFps !== false;
        // Placement curseur rouge : ne jamais re-snaper / clamper hors du point choisi.
        const exact = opts.exact === true;
        const snapGround = !exact && opts.snapGround !== false;

        // Évite que les collisions / la gravité éjectent l’avatar du point cliqué.
        suppressPlayerCollisionBriefly(exact ? 600 : 350);
        resetPlayerVerticalMotion();
        yaw.position.set(px, py + PLAYER_HEIGHT, pz);
        if (typeof opts.yaw === "number" && Number.isFinite(opts.yaw)) {
            yaw.rotation.y = opts.yaw;
        }
        // Regard un peu horizontal (le mode Conception regarde souvent vers le bas).
        if (exact || wantFps) {
            const halfPi = Math.PI / 2 - 0.01;
            pitch.rotation.x = THREE.MathUtils.clamp(-0.12, -halfPi, halfPi);
        }
        resetHeadBob(true);

        if (wantFps && movementMode !== "fps") {
            // Activer le FPS sans snaper (on gère le sol juste après).
            movementMode = "fps";
            enterExplore();
            container.classList.toggle("lab-viewport--fps", true);
            container.classList.toggle("lab-viewport--design", false);
            container.classList.toggle("lab-viewport--overview", false);
            setObjectCollisionEnabled(true);
            setGroundCollisionEnabled(true);
            resetHeadBob(true);
            syncCameraFovForMode();
            onMovementModeChange?.(movementMode);
        }

        if (snapGround && movementMode === "fps") {
            snapPlayerToGroundNow();
            // Conserver le XZ du curseur (le snap ne touche que Y).
            yaw.position.x = px;
            yaw.position.z = pz;
        } else {
            yaw.position.set(px, py + PLAYER_HEIGHT, pz);
            resetPlayerVerticalMotion();
        }

        if (exact) {
            // Pas de clamp XZ : le curseur rouge est la source de vérité.
            yaw.position.set(px, py + PLAYER_HEIGHT, pz);
        } else {
            clampPosition({ allowFly: movementMode !== "fps" });
            yaw.position.x = px;
            yaw.position.z = pz;
        }
        return true;
    }

    /**
     * État caméra / orbite pour enregistrement de scène.
     * @returns {{
     *   mode: "fps" | "design" | "overview",
     *   yaw: { x: number, y: number, z: number, ry: number },
     *   pitch: number,
     *   orbitTarget: { x: number, y: number, z: number },
     *   orbitDistance: number,
     *   orbitTheta: number,
     *   orbitPhi: number,
     * }}
     */
    function serializeView() {
        return {
            mode: movementMode,
            gridVisible: gridHelper.visible !== false,
            floorVisible: floorUserVisible !== false,
            yaw: {
                x: yaw.position.x,
                y: yaw.position.y,
                z: yaw.position.z,
                ry: yaw.rotation.y,
            },
            pitch: pitch.rotation.x,
            orbitTarget: {
                x: orbitTarget.x,
                y: orbitTarget.y,
                z: orbitTarget.z,
            },
            orbitDistance,
            orbitTheta,
            orbitPhi,
        };
    }

    /**
     * Restaure la caméra / orbite après ouverture de scène (sans recentrer).
     * @param {unknown} view
     * @returns {boolean}
     */
    function restoreView(view) {
        if (!view || typeof view !== "object") return false;
        const raw = /** @type {Record<string, unknown>} */ (view);
        const mode = normalizeMode(typeof raw.mode === "string" ? raw.mode : "design");
        if (typeof raw.gridVisible === "boolean") {
            gridHelper.visible = raw.gridVisible;
            environmentRegistry?.refresh?.();
        }
        if (typeof raw.floorVisible === "boolean") {
            setFloorUserVisible(raw.floorVisible);
        }

        const ot = raw.orbitTarget && typeof raw.orbitTarget === "object"
            ? /** @type {Record<string, unknown>} */ (raw.orbitTarget)
            : null;
        if (ot) {
            orbitTarget.set(
                Number(ot.x) || 0,
                Number.isFinite(Number(ot.y)) ? Number(ot.y) : 0.5,
                Number(ot.z) || 0
            );
        }
        if (typeof raw.orbitDistance === "number" && Number.isFinite(raw.orbitDistance)) {
            orbitDistance = Math.max(0.08, raw.orbitDistance);
        }
        if (typeof raw.orbitTheta === "number" && Number.isFinite(raw.orbitTheta)) {
            orbitTheta = raw.orbitTheta;
        }
        if (typeof raw.orbitPhi === "number" && Number.isFinite(raw.orbitPhi)) {
            orbitPhi = THREE.MathUtils.clamp(raw.orbitPhi, -1.2, 1.2);
        }

        const yawData = raw.yaw && typeof raw.yaw === "object"
            ? /** @type {Record<string, unknown>} */ (raw.yaw)
            : null;
        if (yawData) {
            yaw.position.set(
                Number(yawData.x) || 0,
                Number.isFinite(Number(yawData.y)) ? Number(yawData.y) : getOverviewEyeY(),
                Number(yawData.z) || 0
            );
            if (typeof yawData.ry === "number" && Number.isFinite(yawData.ry)) {
                yaw.rotation.y = yawData.ry;
            }
        }
        if (typeof raw.pitch === "number" && Number.isFinite(raw.pitch)) {
            const halfPi = Math.PI / 2 - 0.01;
            pitch.rotation.x = THREE.MathUtils.clamp(raw.pitch, -halfPi, halfPi);
        }

        // Appliquer le mode sans écraser la pose : ne pas passer par applyMovementMode
        // (design y force applyOrbitCamera depuis des angles potentiellement incomplets).
        movementMode = mode;
        enterExplore();
        container.classList.toggle("lab-viewport--fps", movementMode === "fps");
        container.classList.toggle("lab-viewport--design", movementMode === "design");
        container.classList.toggle("lab-viewport--overview", movementMode === "overview");
        syncCameraFovForMode();

        if (movementMode === "overview") {
            setObjectCollisionEnabled(false);
            setGroundCollisionEnabled(false);
            resetPlayerVerticalMotion();
            clampPosition({ allowFly: true });
        } else if (movementMode === "fps") {
            setObjectCollisionEnabled(true);
            setGroundCollisionEnabled(true);
            resetPlayerVerticalMotion();
            snapPlayerToGroundNow();
            resetHeadBob(true);
        } else {
            setObjectCollisionEnabled(true);
            setGroundCollisionEnabled(true);
            resetPlayerVerticalMotion();
            resetHeadBob();
            // Pose explicite déjà restaurée : resynchroniser angles ↔ caméra sans jump.
            if (yawData) {
                syncOrbitFromCamera();
            } else {
                applyOrbitCamera();
            }
        }

        onMovementModeChange?.(movementMode);
        return true;
    }

    if (moveSpeedInput) {
        moveSpeedInput.value = String(moveSpeed);
        moveSpeedInput.addEventListener("input", () => {
            setMoveSpeed(Number(moveSpeedInput.value));
        });
    }

    function resetHeadBob(instant = false) {
        bobPhase = 0;
        breathPhase = 0;
        if (instant) {
            camera.position.x = 0;
            camera.position.y = 0;
            camera.position.z = 0;
            camera.rotation.z = 0;
            return;
        }
    }

    /**
     * Oscillation caméra FPS : respiration à l’arrêt, bob marche / course.
     * @param {number} delta
     * @param {boolean} moving
     */
    function updateHeadBob(delta, moving) {
        const damp = 1 - Math.exp(-14 * delta);
        let targetX = 0;
        let targetY = 0;
        let targetRoll = 0;

        if (movementMode !== "fps" || !exploreActive) {
            camera.position.x += (0 - camera.position.x) * damp;
            camera.position.y += (0 - camera.position.y) * damp;
            camera.rotation.z += (0 - camera.rotation.z) * damp;
            if (Math.abs(camera.position.x) < 1e-4) camera.position.x = 0;
            if (Math.abs(camera.position.y) < 1e-4) camera.position.y = 0;
            if (Math.abs(camera.rotation.z) < 1e-5) camera.rotation.z = 0;
            return;
        }

        const grounded = isPlayerGrounded();
        const isSprint = sprinting && moving;

        if (moving && grounded) {
            const freq = isSprint ? BOB_RUN_FREQ : BOB_WALK_FREQ;
            const ampY = isSprint ? BOB_RUN_AMP_Y : BOB_WALK_AMP_Y;
            const ampX = isSprint ? BOB_RUN_AMP_X : BOB_WALK_AMP_X;
            const ampRoll = isSprint ? BOB_RUN_ROLL : BOB_WALK_ROLL;
            bobPhase += delta * freq;
            // Double fréquence verticale = pas gauche / droite (style UE)
            targetY = Math.sin(bobPhase * 2) * ampY;
            targetX = Math.sin(bobPhase) * ampX;
            targetRoll = Math.cos(bobPhase) * ampRoll;
            breathPhase = 0;
        } else if (grounded) {
            // Respiration légère à l’arrêt
            breathPhase += delta * BREATH_FREQ;
            targetY = Math.sin(breathPhase) * BREATH_AMP;
            bobPhase *= Math.max(0, 1 - delta * 4);
        } else {
            // En l’air : amortir le bob
            bobPhase *= Math.max(0, 1 - delta * 2);
            targetY = Math.sin(bobPhase * 2) * (isSprint ? BOB_RUN_AMP_Y : BOB_WALK_AMP_Y) * 0.25;
            targetX = Math.sin(bobPhase) * (isSprint ? BOB_RUN_AMP_X : BOB_WALK_AMP_X) * 0.2;
        }

        camera.position.x += (targetX - camera.position.x) * damp;
        camera.position.y += (targetY - camera.position.y) * damp;
        camera.rotation.z += (targetRoll - camera.rotation.z) * damp;
    }

    function enterExplore() {
        exploreActive = true;
        blocker.hidden = true;
    }

    const onKeyDown = (event) => {
        if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;

        if (event.code === "Escape") {
            if (movementMode === "fps") {
                resetViewForNewScene();
                return;
            }
            if (movementMode === "overview") return;
            if (exploreActive) {
                exploreActive = false;
                leftLookActive = false;
                blocker.hidden = false;
            }
            return;
        }

        if (event.code === "ShiftLeft" || event.code === "ShiftRight") {
            sprinting = true;
        }

        if (gizmoDragging || !exploreActive) return;
        if (event.ctrlKey || event.metaKey) return;

        switch (event.code) {
            case "ArrowUp":
            case "KeyW":
            case "KeyZ":
                moveForward = true;
                break;
            case "ArrowLeft":
            case "KeyA":
            case "KeyQ":
                moveLeft = true;
                break;
            case "ArrowDown":
            case "KeyS":
                moveBackward = true;
                break;
            case "ArrowRight":
            case "KeyD":
                moveRight = true;
                break;
            case "Space":
                if (movementMode !== "fps") break;
                event.preventDefault();
                jump();
                break;
            default:
                break;
        }
    };
    const onKeyUp = (event) => {
        if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;

        if (event.code === "ShiftLeft" || event.code === "ShiftRight") {
            sprinting = false;
        }

        switch (event.code) {
            case "ArrowUp":
            case "KeyW":
            case "KeyZ":
                moveForward = false;
                break;
            case "ArrowLeft":
            case "KeyA":
            case "KeyQ":
                moveLeft = false;
                break;
            case "ArrowDown":
            case "KeyS":
                moveBackward = false;
                break;
            case "ArrowRight":
            case "KeyD":
                moveRight = false;
                break;
            default:
                break;
        }
    };
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("keyup", onKeyUp);

    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    renderer.sortObjects = true;
    configureRendererShadows(renderer);
    applyStudioEnvironment(scene, renderer);
    container.appendChild(renderer.domElement);

    const quadView = initQuadView({
        viewport: container,
        scene,
        mainRenderer: renderer,
        getTarget: () => {
            yaw.getWorldPosition(lookTarget);
            return lookTarget;
        },
    });

    /**
     * Agrandit / réduit la grille et le sol pour suivre une zone terrain (mètres).
     * @param {number} sizeMeters
     */
    function syncWorldFog(size) {
        if (!(scene.fog instanceof THREE.Fog)) return;
        const fogFar = Math.max(SCENE_FOG_FAR, size * 1.8 + 50);
        scene.fog.near = Math.min(Math.max(SCENE_FOG_NEAR, size * 0.12), fogFar * 0.35);
        scene.fog.far = fogFar;
    }

    function setWorldSize(sizeMeters) {
        const size = Math.max(1, Number(sizeMeters) || GRID_SIZE);
        worldSizeMeters = size;
        const scale = size / GRID_SIZE;
        gridHelper.scale.set(scale, 1, scale);
        floor.scale.set(scale, scale, 1);
        syncWorldFog(size);
        const fogFar = scene.fog instanceof THREE.Fog ? scene.fog.far : SCENE_FOG_FAR;
        camera.far = Math.max(400, size * 4, fogFar * 1.2);
        camera.updateProjectionMatrix();
        quadView.setWorldSize(size);
        if (environmentRegistry) {
            const gridItem = environmentRegistry.getAll().find((item) => item.id === "env-grid");
            if (gridItem) {
                gridItem.detail = formatGridSizeMeters(size);
                environmentRegistry.refresh();
            }
        }
    }

    function getOverviewEyeY() {
        return Math.max(6, Math.min(28, worldSizeMeters * 0.18));
    }

    function getOverviewZ() {
        return Math.max(8, Math.min(40, worldSizeMeters * 0.22));
    }

    function canInteractAt(clientX, clientY) {
        return quadView.isInMainView(clientX, clientY);
    }

    function isViewportUiTarget(target) {
        if (!(target instanceof Element)) return false;
        return !!target.closest(
            ".lab-viewport-fs, .lab-context-menu, .lab-object-info, .lab-side-panel, .lab-scene-panel"
        );
    }

    /** @type {number} */
    let lastRightClickAt = 0;
    /** @type {boolean} */
    let rightClickHandledThisGesture = false;

    function dispatchCanvasRightClick(event) {
        if (!canInteractAt(event.clientX, event.clientY)) return;
        if (gizmoDragging) return;
        if (isViewportUiTarget(event.target)) return;
        const now = performance.now();
        if (now - lastRightClickAt < 80) return;
        lastRightClickAt = now;

        if (!exploreActive) enterExplore();
        try {
            canvasRightClickHandler?.(event);
        } catch (error) {
            console.error("[LAB 3D] Erreur menu contextuel :", error);
        }
    }

    function onViewportContextMenu(event) {
        if (isViewportUiTarget(event.target)) return;
        event.preventDefault();
        event.stopPropagation();
        if (terrainSculptModeActive) {
            pendingRightClick = null;
            rightClickHandledThisGesture = true;
            return;
        }
        // Mode Triangles / Face : pas de menu objet — le clic droit vide la sélection.
        if (
            document.documentElement.classList.contains("lab-triangulation-mode") ||
            document.documentElement.classList.contains("lab-face-apply-mode")
        ) {
            pendingRightClick = null;
            rightClickHandledThisGesture = true;
            return;
        }
        // Glisser droit = caméra : ne pas traiter comme un clic (menu).
        if (pendingRightClick) {
            const dx = event.clientX - pendingRightClick.startX;
            const dy = event.clientY - pendingRightClick.startY;
            if (dx * dx + dy * dy >= CLICK_THRESHOLD_PX * CLICK_THRESHOLD_PX) {
                pendingRightClick = null;
                rightClickHandledThisGesture = true;
                return;
            }
        }
        pendingRightClick = null;
        rightClickHandledThisGesture = true;
        dispatchCanvasRightClick(event);
    }

    container.addEventListener("contextmenu", onViewportContextMenu, true);
    window.addEventListener("contextmenu", (event) => {
        if (!container.contains(/** @type {Node} */ (event.target))) return;
        onViewportContextMenu(event);
    }, true);

    function cancelLookGesture() {
        leftLookActive = false;
        rightLookActive = false;
        rightClickHandledThisGesture = false;
        pendingLeftClick = null;
        pendingRightClick = null;
        container.classList.remove("lab-viewport--look");
    }

    /** Trait de peinture en cours : bloque toute orbite/regard (même clic droit). */
    let paintStrokeActive = false;

    container.addEventListener("mousedown", (event) => {
        if (!canInteractAt(event.clientX, event.clientY)) return;
        if (isViewportUiTarget(event.target)) return;

        // Peinture / triangulation / placement : clic gauche = outil, jamais look/orbite.
        // Terrain : le sculpt est en capture sur le mesh ; un clic dans le vide doit orbiter.
        // (Doit être avant !exploreActive, sinon le 1er clic armé leftLookActive.)
        if (drawModeActive || paintStrokeActive || avatarPlaceModeActive || lightPlaceModeActive || riverPlaceModeActive) {
            if (event.button === 0) {
                leftLookActive = false;
                pendingLeftClick = null;
                if (!rightLookActive) container.classList.remove("lab-viewport--look");
                if ((avatarPlaceModeActive || lightPlaceModeActive || riverPlaceModeActive) && exploreActive && !gizmoDragging) {
                    emitCanvasLeftClick(event);
                }
                return;
            }
            if (event.button === 2) {
                // Pendant un trait de peinture : pas d’orbite (sinon la vue « tourne » en peignant).
                if (paintStrokeActive) {
                    event.preventDefault();
                    return;
                }
                rightLookActive = true;
                pendingRightClick = terrainSculptModeActive
                    ? null
                    : {
                          startX: event.clientX,
                          startY: event.clientY,
                          event,
                      };
                container.classList.add("lab-viewport--look");
                event.preventDefault();
            }
            return;
        }

        // Mode placer végétal : même navigation souris que l’exploration
        // (clic court = pose via canvasLeftClickHandler).

        if (!exploreActive) {
            if (event.button === 0) {
                enterExplore();
                leftLookActive = true;
                container.classList.add("lab-viewport--look");
                pendingLeftClick = {
                    startX: event.clientX,
                    startY: event.clientY,
                    event,
                };
            }
            if (event.button === 2) {
                pendingRightClick = {
                    startX: event.clientX,
                    startY: event.clientY,
                    event,
                };
                event.preventDefault();
            }
            return;
        }
        if (gizmoDragging) return;

        if (event.button === 0) {
            leftLookActive = true;
            container.classList.add("lab-viewport--look");
            pendingLeftClick = {
                startX: event.clientX,
                startY: event.clientY,
                event,
            };
        }

        if (event.button === 2) {
            pendingRightClick = {
                startX: event.clientX,
                startY: event.clientY,
                event,
            };
            event.preventDefault();
        }
    });

    let lastEmittedLeftClickAt = 0;

    function emitCanvasLeftClick(event) {
        if (!exploreActive || gizmoDragging || drawModeActive || terrainSculptModeActive) return;
        const now = performance.now();
        if (now - lastEmittedLeftClickAt < 40) return;
        lastEmittedLeftClickAt = now;
        try {
            canvasLeftClickHandler?.(event);
        } catch (error) {
            console.error("[LAB 3D] Erreur clic gauche :", error);
        }
    }

    window.addEventListener("mouseup", (event) => {
        if (event.button === 0) {
            leftLookActive = false;
            if (!rightLookActive) container.classList.remove("lab-viewport--look");

            if (pendingLeftClick) {
                const dx = event.clientX - pendingLeftClick.startX;
                const dy = event.clientY - pendingLeftClick.startY;
                if (dx * dx + dy * dy < CLICK_THRESHOLD_PX * CLICK_THRESHOLD_PX) {
                    emitCanvasLeftClick(pendingLeftClick.event);
                }
            }
            pendingLeftClick = null;
        }

        if (event.button === 2 && pendingRightClick) {
            if (rightClickHandledThisGesture) {
                rightClickHandledThisGesture = false;
                pendingRightClick = null;
                return;
            }
            const dx = event.clientX - pendingRightClick.startX;
            const dy = event.clientY - pendingRightClick.startY;
            if (dx * dx + dy * dy < CLICK_THRESHOLD_PX * CLICK_THRESHOLD_PX) {
                dispatchCanvasRightClick(pendingRightClick.event);
            }
            pendingRightClick = null;
        }

        if (event.button === 2 && rightLookActive) {
            rightLookActive = false;
            rightClickHandledThisGesture = false;
            pendingRightClick = null;
            if (!leftLookActive) container.classList.remove("lab-viewport--look");
        }
    });

    // Filet : si preventDefault() sur pointerdown (peinture) coupe les mouseup,
    // pointerup doit quand même désarmer le look/orbite — sinon la caméra
    // reste en rotation tant que la souris bouge.
    // Ne pas toucher pendingLeft/RightClick : mouseup gère encore les clics courts.
    window.addEventListener("pointerup", (event) => {
        if (event.button === 0) {
            leftLookActive = false;
            if (!rightLookActive) container.classList.remove("lab-viewport--look");
        }
        if (event.button === 2) {
            rightLookActive = false;
            rightClickHandledThisGesture = false;
            if (!leftLookActive) container.classList.remove("lab-viewport--look");
        }
    });
    window.addEventListener("pointercancel", () => {
        cancelLookGesture();
        paintStrokeActive = false;
    });

    window.addEventListener("mousemove", (event) => {
        const usingRightLook = rightLookActive && !gizmoDragging && !paintStrokeActive;

        // Tant que le déplacement reste sous le seuil, c’est un clic potentiel :
        // ne pas démarrer look / orbite (sinon la désélection « clic vide » rate souvent).
        if (pendingLeftClick && leftLookActive) {
            const dx = event.clientX - pendingLeftClick.startX;
            const dy = event.clientY - pendingLeftClick.startY;
            if (dx * dx + dy * dy < CLICK_THRESHOLD_PX * CLICK_THRESHOLD_PX) {
                return;
            }
            pendingLeftClick = null;
        }
        if (pendingRightClick && usingRightLook) {
            const dx = event.clientX - pendingRightClick.startX;
            const dy = event.clientY - pendingRightClick.startY;
            if (dx * dx + dy * dy < CLICK_THRESHOLD_PX * CLICK_THRESHOLD_PX) {
                return;
            }
            pendingRightClick = null;
        }

        const normalLeftLook =
            leftLookActive &&
            !gizmoDragging &&
            !drawModeActive &&
            !paintStrokeActive &&
            exploreActive;
        if (!usingRightLook && !normalLeftLook) return;

        if (movementMode === "design") {
            orbitTheta -= event.movementX * ORBIT_SENSITIVITY;
            orbitPhi = THREE.MathUtils.clamp(
                orbitPhi + event.movementY * ORBIT_SENSITIVITY,
                -1.35,
                1.35
            );
            applyOrbitCamera();
            return;
        }

        yaw.rotation.y -= event.movementX * LOOK_SENSITIVITY;
        pitch.rotation.x -= event.movementY * LOOK_SENSITIVITY;
        const halfPi = Math.PI / 2 - 0.01;
        pitch.rotation.x = Math.max(-halfPi, Math.min(halfPi, pitch.rotation.x));
    });

    renderer.domElement.addEventListener("dblclick", (event) => {
        if (!canInteractAt(event.clientX, event.clientY)) return;
        if (gizmoDragging) return;
        if (!exploreActive) enterExplore();
        leftLookActive = false;
        container.classList.remove("lab-viewport--look");
        canvasDoubleClickHandler?.(event);
    });

    function clampPosition({ allowFly = false } = {}) {
        const observeMode = movementMode === "overview";
        const designLike = observeMode || movementMode === "design";
        const bound = designLike
            ? Math.max(worldSizeMeters * 1.35, 50)
            : worldSizeMeters * 0.45;
        yaw.position.x = THREE.MathUtils.clamp(yaw.position.x, -bound, bound);
        yaw.position.z = THREE.MathUtils.clamp(yaw.position.z, -bound, bound);
        const maxY = allowFly || designLike ? getDesignMaxY() : MAX_EYE_HEIGHT;
        const groundEyeY = getGroundEyeY(yaw.position.x, yaw.position.z);

        if (designLike) {
            // Conception : en cadrage proche, autoriser la hauteur de la face / du centre objet
            // (sinon getGroundEyeY ≈ 1,62 m remonte toujours la caméra).
            const closeInspect = movementMode === "design" && orbitDistance < INSPECT_ORBIT_CLOSE;
            const minY = closeInspect
                ? Math.max(-0.2, getInspectMinCamY(yaw.position.x, yaw.position.z))
                : Math.max(0.5, groundEyeY);
            yaw.position.y = THREE.MathUtils.clamp(yaw.position.y, minY, maxY);
        } else if (allowFly) {
            yaw.position.y = THREE.MathUtils.clamp(yaw.position.y, 0.3, maxY);
        } else {
            yaw.position.y = THREE.MathUtils.clamp(yaw.position.y, groundEyeY, maxY);
        }
    }

    /**
     * Oriente yaw/pitch exactement vers un point monde.
     * Formule analytique pour hiérarchie yaw(Y) → pitch(X) → camera(-Z).
     * Vecteur forward world : (-cos(px)*sin(py), sin(px), -cos(px)*cos(py))
     * → yaw.rotation.y = atan2(-dx, -dz)
     * → pitch.rotation.x = atan2(dy, hypot(dx, dz))
     */
    function aimAtWorldTarget(target) {
        const dx = target.x - yaw.position.x;
        const dy = target.y - yaw.position.y;
        const dz = target.z - yaw.position.z;

        yaw.rotation.y = Math.atan2(-dx, -dz);

        const halfPi = Math.PI / 2 - 0.01;
        const rawPitch = Math.atan2(dy, Math.hypot(dx, dz));
        pitch.rotation.x = THREE.MathUtils.clamp(rawPitch, -halfPi, halfPi);
    }

    /**
     * Positionne et oriente la caméra devant un objet (double-clic / sélection).
     * @param {THREE.Object3D} object
     */
    function focusOnObject(object) {
        if (!object) return;
        enterExplore();

        object.updateWorldMatrix(true, true);
        focusBox.setFromObject(object);
        focusBox.getCenter(focusTarget);

        const objectSize = focusBox.getSize(focusSize).length();
        const distance = Math.max(FOCUS_DISTANCE, objectSize * 1.05);

        // Approche horizontale (même hauteur que le centre → objet bien cadré).
        focusViewDir.copy(focusTarget).sub(yaw.position);
        focusViewDir.y = 0;
        if (focusViewDir.lengthSq() < 1e-6) focusViewDir.set(0, 0, -1);
        else focusViewDir.normalize();

        focusDesiredPos.copy(focusTarget).addScaledVector(focusViewDir, -distance);
        focusDesiredPos.y = focusTarget.y;
        const minCamY = getInspectMinCamY(focusDesiredPos.x, focusDesiredPos.z);
        if (focusDesiredPos.y < minCamY) focusDesiredPos.y = minCamY;

        yaw.position.copy(focusDesiredPos);
        aimAtWorldTarget(focusTarget);
        orbitTarget.copy(focusTarget);
        if (movementMode === "design") {
            syncOrbitFromCamera();
            // Forcer un cadrage horizontal (pas de plongée).
            orbitPhi = 0;
            applyOrbitCamera();
        }
    }

    /**
     * Rapproche la caméra d’un point (face / mur cliqué), face à la normale.
     * @param {THREE.Vector3 | { x: number, y: number, z: number }} point
     * @param {{ normal?: THREE.Vector3 | { x: number, y: number, z: number } | null, distance?: number }} [opts]
     */
    function focusOnPoint(point, opts = {}) {
        if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y) || !Number.isFinite(point.z)) {
            return;
        }
        enterExplore();
        focusTarget.set(point.x, point.y, point.z);

        const distance = THREE.MathUtils.clamp(
            typeof opts.distance === "number" ? opts.distance : FOCUS_DISTANCE * 1.15,
            0.55,
            14
        );

        const n = opts.normal;
        if (n && Number.isFinite(n.x) && Number.isFinite(n.y) && Number.isFinite(n.z)) {
            focusViewDir.set(n.x, n.y, n.z);
            if (focusViewDir.lengthSq() > 1e-8) focusViewDir.normalize();
            else focusViewDir.set(0, 0, 1).normalize();
            // Murs / faces verticales : rester à hauteur du point (pas monter le long de la normale).
            if (Math.abs(focusViewDir.y) < 0.85) {
                focusViewDir.y = 0;
                if (focusViewDir.lengthSq() < 1e-8) focusViewDir.set(0, 0, 1);
                else focusViewDir.normalize();
            }
        } else {
            focusViewDir.copy(yaw.position).sub(focusTarget);
            focusViewDir.y = 0;
            if (focusViewDir.lengthSq() < 1e-6) focusViewDir.set(0, 0, 1);
            focusViewDir.normalize();
        }

        focusDesiredPos.copy(focusTarget).addScaledVector(focusViewDir, distance);
        // Même hauteur que le point cliqué → face centrée dans le viseur.
        if (Math.abs(focusViewDir.y) < 0.85) {
            focusDesiredPos.y = focusTarget.y;
        }
        const minCamY = getInspectMinCamY(focusDesiredPos.x, focusDesiredPos.z);
        if (focusDesiredPos.y < minCamY) focusDesiredPos.y = minCamY;

        yaw.position.copy(focusDesiredPos);
        aimAtWorldTarget(focusTarget);
        orbitTarget.copy(focusTarget);
        if (movementMode === "design") {
            syncOrbitFromCamera();
            if (Math.abs(focusViewDir.y) < 0.85) {
                orbitPhi = 0;
                applyOrbitCamera();
            }
        }
    }

    function getMaxOrbitDistance() {
        return Math.max(280, worldSizeMeters * 3.8);
    }

    /**
     * Cadre le terrain.
     * @param {THREE.Object3D} object
     * @param {{ overview?: boolean }} [opts] overview = vue d’ensemble (dézoom)
     */
    function focusOnTerrainRelief(object, opts = {}) {
        if (!object) return;
        const overview = !!opts.overview;
        enterExplore();

        object.updateWorldMatrix(true, true);
        focusBox.setFromObject(object);
        focusBox.getCenter(focusTarget);
        const size = focusBox.getSize(focusSize);
        const span = Math.max(size.x, size.z, 1);
        const relief = Math.max(size.y, 0.5);
        const reliefRatio = relief / span;
        const maxOrbit = getMaxOrbitDistance();

        if (movementMode === "design") {
            orbitTarget.copy(focusTarget);
            if (overview) {
                orbitTarget.y = focusTarget.y + relief * 0.12;
                orbitDistance = THREE.MathUtils.clamp(span * 1.55, span * 0.9, maxOrbit);
                orbitPhi = THREE.MathUtils.clamp(0.28 + relief / Math.max(span * 2.5, 1), 0.22, 0.48);
            } else {
                orbitTarget.y += relief * 0.35;
                orbitDistance = THREE.MathUtils.clamp(
                    span * (reliefRatio > 0.08 ? 0.48 : 0.38),
                    10,
                    Math.min(maxOrbit, Math.max(span * 0.95, 60))
                );
                orbitPhi = THREE.MathUtils.clamp(
                    0.55 + relief / Math.max(span * 0.85, 1),
                    0.52,
                    1.12
                );
            }
            applyOrbitCamera();
            return;
        }

        const distance = THREE.MathUtils.clamp(span * 0.32, 16, 85);
        const eyeHeight = Math.max(relief * 2.8, span * 0.1, 5);

        yaw.position.set(
            focusTarget.x + distance * 0.62,
            focusTarget.y + eyeHeight,
            focusTarget.z + distance * 0.62
        );
        const minEye = getGroundEyeY(yaw.position.x, yaw.position.z);
        yaw.position.y = Math.max(yaw.position.y, minEye + 0.5);
        aimAtWorldTarget(focusTarget);
    }

    renderer.domElement.addEventListener("wheel", (event) => {
        if (!canInteractAt(event.clientX, event.clientY)) return;
        if (!exploreActive || gizmoDragging) return;
        event.preventDefault();

        const delta = normalizeWheelDelta(event);
        // delta ≈ ±100 par cran → on ramène à ~±1
        const notch = THREE.MathUtils.clamp(delta / 100, -1.5, 1.5);

        if (movementMode === "design") {
            orbitDistance = THREE.MathUtils.clamp(
                orbitDistance * Math.exp(notch * WHEEL_ORBIT_ZOOM),
                0.08,
                getMaxOrbitDistance()
            );
            applyOrbitCamera();
            return;
        }

        camera.getWorldDirection(viewDirection);
        const step =
            -notch *
            WHEEL_ZOOM_SPEED *
            100 *
            (movementMode === "overview" ? 1.2 : 0.85) *
            Math.max(1, yaw.position.y * 0.08);
        moveDelta.copy(viewDirection).multiplyScalar(step);
        yaw.position.add(moveDelta);
        clampPosition({ allowFly: movementMode !== "fps" });
    }, { passive: false });

    function resize() {
        if (quadView.isEnabled()) {
            quadView.resizeAll();
            const rect = renderer.domElement.getBoundingClientRect();
            if (rect.width > 0 && rect.height > 0) {
                camera.aspect = rect.width / rect.height;
                camera.updateProjectionMatrix();
            }
            return;
        }
        const width = container.clientWidth;
        const height = container.clientHeight;
        if (width < 1 || height < 1) return;
        camera.aspect = width / height;
        camera.updateProjectionMatrix();
        renderer.setSize(width, height);
    }

    const resizeObserver = new ResizeObserver(() => resize());
    resizeObserver.observe(container);
    window.addEventListener("resize", resize);
    resize();

    // Fenêtre qui perd le focus (Alt+Tab, dialogue OS…) : le keyup n’arrivera
    // jamais, on relâche tout pour éviter un déplacement « touche collée ».
    function releaseMovementKeys() {
        moveForward = false;
        moveBackward = false;
        moveLeft = false;
        moveRight = false;
        sprinting = false;
    }
    window.addEventListener("blur", releaseMovementKeys);
    document.addEventListener("visibilitychange", () => {
        if (document.hidden) releaseMovementKeys();
    });

    function animate() {
        requestAnimationFrame(animate);

        const time = performance.now();

        if (exploreActive && !gizmoDragging) {
            const delta = (time - prevTime) / 1000;
            setCollisionDeltaTime(delta);

            velocity.x -= velocity.x * 10.0 * delta;
            velocity.z -= velocity.z * 10.0 * delta;

            direction.z = Number(moveForward) - Number(moveBackward);
            direction.x = Number(moveRight) - Number(moveLeft);
            direction.normalize();

            if (moveForward || moveBackward) {
                const speed =
                    moveSpeed * (sprinting && movementMode === "fps" ? SPRINT_MULTIPLIER : 1);
                velocity.z -= direction.z * speed * delta;
            }
            if (moveLeft || moveRight) {
                const speed =
                    moveSpeed * (sprinting && movementMode === "fps" ? SPRINT_MULTIPLIER : 1);
                velocity.x -= direction.x * speed * delta;
            }

            const moveX = -velocity.x * delta;
            const moveZ = -velocity.z * delta;

            const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(yaw.quaternion);
            const right = new THREE.Vector3(1, 0, 0).applyQuaternion(yaw.quaternion);
            moveDelta.set(0, 0, 0);
            moveDelta.addScaledVector(forward, moveZ);
            moveDelta.addScaledVector(right, moveX);

            if (movementMode === "design") {
                // En conception, ZQSD décale la cible d’orbite (pan type Blender).
                orbitTarget.x += moveDelta.x;
                orbitTarget.z += moveDelta.z;
                applyOrbitCamera();
            } else {
                movePlayer(moveDelta);
            }

            if (movementMode === "overview" || movementMode === "design") {
                clampPosition({ allowFly: true });
                updateHeadBob(delta, false);
            } else {
                updatePlayerVertical(delta);
                clampPosition();
                const moving =
                    moveForward || moveBackward || moveLeft || moveRight;
                updateHeadBob(delta, moving);
            }
        } else {
            updateHeadBob((time - prevTime) / 1000, false);
        }

        prevTime = time;
        // Chaque étape est isolée : un callback qui throw (flottaison, helper
        // orphelin…) ne doit jamais figer le rendu des frames suivantes.
        try {
            beforeRender?.();
        } catch (err) {
            reportRenderError("beforeRender", err);
        }
        try {
            renderer.render(scene, camera);
            quadView.renderAuxViews();
        } catch (err) {
            reportRenderError("render", err);
        }
        try {
            afterRender?.();
        } catch (err) {
            reportRenderError("afterRender", err);
        }
    }

    let lastRenderErrorLog = 0;
    /**
     * Log throttlé (1×/2 s) pour éviter de saturer la console si l’erreur revient chaque frame.
     * @param {string} stage
     * @param {unknown} err
     */
    function reportRenderError(stage, err) {
        const now = performance.now();
        if (now - lastRenderErrorLog < 2000) return;
        lastRenderErrorLog = now;
        console.error(`[LAB] erreur pendant ${stage} :`, err);
    }

    animate();

    resetViewForNewScene();

    return {
        scene,
        camera,
        renderer,
        yaw,
        gridHelper,
        floor,
        pickOccluders: [floor],
        isExploreActive: () => exploreActive,
        isGizmoDragging: () => gizmoDragging,
        enterExplore,
        getMovementMode: () => movementMode,
        setMovementMode(mode) {
            applyMovementMode(normalizeMode(mode));
        },
        setOrbitTarget,
        getOrbitTarget: () => orbitTarget.clone(),
        serializeView,
        restoreView,
        resetViewForNewScene,
        restoreDefaultEnvironment,
        placePlayerAt,
        setGizmoDragging(value) {
            gizmoDragging = !!value;
            if (value) {
                leftLookActive = false;
            } else {
                // Fin de drag (ou reset scène) : libérer les clics / orbites.
                pendingLeftClick = null;
                leftLookActive = false;
                if (!rightLookActive) container.classList.remove("lab-viewport--look");
            }
        },
        setDrawModeActive(value) {
            drawModeActive = value;
            if (value) {
                cancelLookGesture();
            } else {
                paintStrokeActive = false;
                rightLookActive = false;
                rightClickHandledThisGesture = false;
                pendingRightClick = null;
                container.classList.remove("lab-viewport--look");
            }
            container.classList.toggle("lab-viewport--draw", value);
        },
        setPaintStrokeActive(value) {
            paintStrokeActive = !!value;
            if (paintStrokeActive) cancelLookGesture();
        },
        cancelLookGesture,
        setTerrainSculptModeActive(value) {
            terrainSculptModeActive = value;
            if (value) {
                leftLookActive = false;
                pendingLeftClick = null;
                vegetationPlaceModeActive = false;
                avatarPlaceModeActive = false;
                lightPlaceModeActive = false;
                riverPlaceModeActive = false;
                container.classList.remove("lab-viewport--veg-place");
                container.classList.remove("lab-viewport--avatar-place");
                container.classList.remove("lab-viewport--light-place");
                container.classList.remove("lab-viewport--river-place");
            } else {
                rightLookActive = false;
                rightClickHandledThisGesture = false;
                pendingRightClick = null;
                container.classList.remove("lab-viewport--look");
            }
            container.classList.toggle("lab-viewport--terrain", value);
        },
        setVegetationPlaceModeActive(value) {
            vegetationPlaceModeActive = !!value;
            if (value) {
                leftLookActive = false;
                pendingLeftClick = null;
                avatarPlaceModeActive = false;
                lightPlaceModeActive = false;
                riverPlaceModeActive = false;
                container.classList.remove("lab-viewport--look");
                container.classList.remove("lab-viewport--avatar-place");
                container.classList.remove("lab-viewport--light-place");
                container.classList.remove("lab-viewport--river-place");
            }
            container.classList.toggle("lab-viewport--veg-place", vegetationPlaceModeActive);
        },
        isVegetationPlaceModeActive: () => vegetationPlaceModeActive,
        setAvatarPlaceModeActive(value) {
            avatarPlaceModeActive = !!value;
            if (value) {
                leftLookActive = false;
                pendingLeftClick = null;
                vegetationPlaceModeActive = false;
                lightPlaceModeActive = false;
                riverPlaceModeActive = false;
                container.classList.remove("lab-viewport--look");
                container.classList.remove("lab-viewport--veg-place");
                container.classList.remove("lab-viewport--light-place");
                container.classList.remove("lab-viewport--river-place");
            }
            container.classList.toggle("lab-viewport--avatar-place", avatarPlaceModeActive);
        },
        isAvatarPlaceModeActive: () => avatarPlaceModeActive,
        setLightPlaceModeActive(value) {
            lightPlaceModeActive = !!value;
            if (value) {
                leftLookActive = false;
                pendingLeftClick = null;
                vegetationPlaceModeActive = false;
                avatarPlaceModeActive = false;
                riverPlaceModeActive = false;
                container.classList.remove("lab-viewport--look");
                container.classList.remove("lab-viewport--veg-place");
                container.classList.remove("lab-viewport--avatar-place");
                container.classList.remove("lab-viewport--river-place");
            }
            container.classList.toggle("lab-viewport--light-place", lightPlaceModeActive);
        },
        isLightPlaceModeActive: () => lightPlaceModeActive,
        setRiverPlaceModeActive(value) {
            riverPlaceModeActive = !!value;
            if (value) {
                leftLookActive = false;
                pendingLeftClick = null;
                vegetationPlaceModeActive = false;
                avatarPlaceModeActive = false;
                lightPlaceModeActive = false;
                container.classList.remove("lab-viewport--look");
                container.classList.remove("lab-viewport--veg-place");
                container.classList.remove("lab-viewport--avatar-place");
                container.classList.remove("lab-viewport--light-place");
            }
            container.classList.toggle("lab-viewport--river-place", riverPlaceModeActive);
        },
        isRiverPlaceModeActive: () => riverPlaceModeActive,
        isDrawModeActive: () => drawModeActive,
        setCanvasRightClickHandler(fn) {
            canvasRightClickHandler = fn;
        },
        setCanvasLeftClickHandler(fn) {
            canvasLeftClickHandler = fn;
        },
        setCanvasDoubleClickHandler(fn) {
            canvasDoubleClickHandler = fn;
        },
        setAfterRender(fn) {
            afterRender = fn;
        },
        setBeforeRender(fn) {
            beforeRender = fn;
        },
        toggleQuadView() {
            return quadView.toggle();
        },
        isQuadViewEnabled: () => quadView.isEnabled(),
        setWorldSize,
        getWorldSize: () => worldSizeMeters,
        setFloorUserVisible,
        getFloorUserVisible: () => floorUserVisible,
        setFloorCoveredByTerrain,
        canInteractAt,
        getPointerRect: () => renderer.domElement.getBoundingClientRect(),
        registerEnvironmentItems,
        focusOnObject,
        focusOnPoint,
        focusOnTerrainRelief,
    };
}
