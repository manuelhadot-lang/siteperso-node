/** Galerie Three.js — grille, navigation ZQSD sans verrouillage souris (panneau toujours accessible). */
import * as THREE from "three";
import { movePlayer, moveSpeed, setMoveSpeed, jump, updatePlayerVertical, getGroundEyeY, setCollisionDeltaTime, setObjectCollisionEnabled, setGroundCollisionEnabled, resetPlayerVerticalMotion, snapPlayerToGroundNow, isPlayerGrounded, PLAYER_HEIGHT } from "./lab-collision.js";
import { GRID_SIZE, formatGridSizeMeters } from "./grid-constants.js";
import { initQuadView } from "./lab-quad-view.js";
import { createEnvironmentItem } from "./lab-scene-registry.js";
import { configureRendererShadows, configureLightShadowMap, getObjectShadowEnabled, getObjectShadowOpacity, setObjectShadowEnabled, setObjectShadowOpacity } from "./lab-shadows.js";
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
/** FOV vertical — ~50° ≈ vision humaine à l’écran ; 58° élargissait trop l’espace. */
const CAMERA_FOV = 50;
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

    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x1a1a1a);
    scene.fog = new THREE.Fog(0x1a1a1a, 0, 60);

    const defaultAmbient = new THREE.AmbientLight(0xffffff, 0.28);
    defaultAmbient.userData.labDefaultLight = true;
    const defaultHemisphere = new THREE.HemisphereLight(0xdceeff, 0x2a3824, 0.34);
    defaultHemisphere.position.set(0, 40, 0);
    defaultHemisphere.userData.labDefaultLight = true;
    const defaultSun = new THREE.DirectionalLight(0xfff2df, 0.95);
    defaultSun.position.set(16, 26, 10);
    defaultSun.castShadow = true;
    configureLightShadowMap(defaultSun);
    if ("shadowIntensity" in defaultSun) {
        defaultSun.shadowIntensity = 0.85;
    }
    defaultSun.userData.labDefaultLight = true;
    scene.add(defaultAmbient, defaultHemisphere, defaultSun);

    camera = new THREE.PerspectiveCamera(CAMERA_FOV, 1, 0.02, 1000);
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

    function applyOrbitCamera() {
        const cosPhi = Math.cos(orbitPhi);
        yaw.position.set(
            orbitTarget.x + orbitDistance * Math.sin(orbitTheta) * cosPhi,
            orbitTarget.y + orbitDistance * Math.sin(orbitPhi),
            orbitTarget.z + orbitDistance * Math.cos(orbitTheta) * cosPhi
        );
        const minEye = getGroundEyeY(yaw.position.x, yaw.position.z);
        // En inspection rapprochée, ne pas bloquer le zoom par la hauteur « œil ».
        const floorPad = orbitDistance < 2.2 ? -0.55 : 0.2;
        yaw.position.y = Math.max(yaw.position.y, minEye + floorPad);
        aimAtWorldTarget(orbitTarget);
    }

    /**
     * @param {THREE.Vector3 | { x: number, y: number, z: number } | null} target
     * @param {{ frame?: boolean }} [opts]
     */
    function setOrbitTarget(target, opts = {}) {
        if (target) {
            orbitTarget.set(target.x, target.y, target.z);
        } else {
            orbitTarget.set(0, 0.5, 0);
        }
        if (opts.frame !== false && movementMode === "design") {
            syncOrbitFromCamera();
            applyOrbitCamera();
        }
    }

    function applyMovementMode(mode) {
        movementMode = normalizeMode(mode);
        enterExplore();
        container.classList.toggle("lab-viewport--fps", movementMode === "fps");
        container.classList.toggle("lab-viewport--design", movementMode === "design");
        container.classList.toggle("lab-viewport--overview", movementMode === "overview");

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

    function resetViewForNewScene() {
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
    function setWorldSize(sizeMeters) {
        const size = Math.max(1, Number(sizeMeters) || GRID_SIZE);
        worldSizeMeters = size;
        const scale = size / GRID_SIZE;
        gridHelper.scale.set(scale, 1, scale);
        floor.scale.set(scale, scale, 1);
        camera.far = Math.max(400, size * 4);
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
        pendingRightClick = null;
        rightClickHandledThisGesture = true;
        dispatchCanvasRightClick(event);
    }

    container.addEventListener("contextmenu", onViewportContextMenu, true);
    window.addEventListener("contextmenu", (event) => {
        if (!container.contains(/** @type {Node} */ (event.target))) return;
        onViewportContextMenu(event);
    }, true);

    container.addEventListener("mousedown", (event) => {
        if (!canInteractAt(event.clientX, event.clientY)) return;
        if (isViewportUiTarget(event.target)) return;

        if (terrainSculptModeActive) {
            if (event.button === 2) {
                rightLookActive = true;
                pendingRightClick = null;
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
        if (drawModeActive) return;

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
            container.classList.remove("lab-viewport--look");

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
            container.classList.remove("lab-viewport--look");
        }
    });

    window.addEventListener("mousemove", (event) => {
        const terrainRightLook = terrainSculptModeActive && rightLookActive;

        // Tant que le déplacement reste sous le seuil, c’est un clic potentiel :
        // ne pas démarrer look / orbite (sinon la désélection « clic vide » rate souvent).
        if (pendingLeftClick && leftLookActive && !terrainSculptModeActive) {
            const dx = event.clientX - pendingLeftClick.startX;
            const dy = event.clientY - pendingLeftClick.startY;
            if (dx * dx + dy * dy < CLICK_THRESHOLD_PX * CLICK_THRESHOLD_PX) {
                return;
            }
            pendingLeftClick = null;
        }

        const normalLeftLook =
            leftLookActive && !gizmoDragging && !drawModeActive && !terrainSculptModeActive && exploreActive;
        if (!terrainRightLook && !normalLeftLook) return;

        if (movementMode === "design" && !terrainRightLook) {
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
        const bound = worldSizeMeters * 0.45;
        yaw.position.x = THREE.MathUtils.clamp(yaw.position.x, -bound, bound);
        yaw.position.z = THREE.MathUtils.clamp(yaw.position.z, -bound, bound);
        const observeMode = movementMode === "overview";
        const maxY = allowFly || observeMode || movementMode === "design" ? MAX_FLY_HEIGHT : MAX_EYE_HEIGHT;
        const groundEyeY = getGroundEyeY(yaw.position.x, yaw.position.z);

        if (observeMode || movementMode === "design") {
            // Vue / conception : monter librement.
            // En conception rapprochée, autoriser de descendre près de la surface.
            const closeInspect = movementMode === "design" && orbitDistance < 2.2;
            const minY = closeInspect
                ? Math.max(-0.2, groundEyeY - 0.55)
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
     * Positionne et oriente la caméra devant un objet (double-clic).
     * @param {THREE.Object3D} object
     */
    function focusOnObject(object) {
        if (!object) return;
        enterExplore();

        object.updateWorldMatrix(true, true);
        focusBox.setFromObject(object);
        focusBox.getCenter(focusTarget);

        const objectSize = focusBox.getSize(focusSize).length();
        const distance = Math.max(FOCUS_DISTANCE, objectSize * 1.25);

        focusViewDir.copy(focusTarget).sub(yaw.position);
        if (focusViewDir.lengthSq() < 1e-6) focusViewDir.set(0, 0, -1);
        else focusViewDir.normalize();

        focusDesiredPos.copy(focusTarget).addScaledVector(focusViewDir, -distance);
        const focusMaxEye = Math.max(MAX_EYE_HEIGHT, Math.min(MAX_FLY_HEIGHT, objectSize * 0.35));
        focusDesiredPos.y = THREE.MathUtils.clamp(
            focusTarget.y + Math.max(0.3, objectSize * 0.08),
            getGroundEyeY(focusDesiredPos.x, focusDesiredPos.z),
            focusMaxEye
        );

        yaw.position.copy(focusDesiredPos);
        aimAtWorldTarget(focusTarget);
        orbitTarget.copy(focusTarget);
        if (movementMode === "design") {
            syncOrbitFromCamera();
        }
    }

    /**
     * Cadre le terrain : vue rapprochée et plongeante (le relief reste visible).
     * @param {THREE.Object3D} object
     */
    function focusOnTerrainRelief(object) {
        if (!object) return;
        enterExplore();

        object.updateWorldMatrix(true, true);
        focusBox.setFromObject(object);
        focusBox.getCenter(focusTarget);
        const size = focusBox.getSize(focusSize);
        const span = Math.max(size.x, size.z, 1);
        const relief = Math.max(size.y, 0.3);

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
                120
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
        renderer.render(scene, camera);
        quadView.renderAuxViews();
        afterRender?.();
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
        resetViewForNewScene,
        setGizmoDragging(value) {
            gizmoDragging = value;
            if (value) leftLookActive = false;
        },
        setDrawModeActive(value) {
            drawModeActive = value;
            if (value) leftLookActive = false;
            container.classList.toggle("lab-viewport--draw", value);
        },
        setTerrainSculptModeActive(value) {
            terrainSculptModeActive = value;
            if (value) {
                leftLookActive = false;
                pendingLeftClick = null;
                vegetationPlaceModeActive = false;
                container.classList.remove("lab-viewport--veg-place");
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
                container.classList.remove("lab-viewport--look");
            }
            container.classList.toggle("lab-viewport--veg-place", vegetationPlaceModeActive);
        },
        isVegetationPlaceModeActive: () => vegetationPlaceModeActive,
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
        focusOnTerrainRelief,
    };
}
