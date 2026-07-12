/** Galerie Three.js — grille, navigation ZQSD sans verrouillage souris (panneau toujours accessible). */
import * as THREE from "three";
import { movePlayer, moveSpeed, setMoveSpeed, jump, updatePlayerVertical, getGroundEyeY, isPlayerAirborne } from "./lab-collision.js";
import { GRID_SIZE } from "./grid-constants.js";
import { initQuadView } from "./lab-quad-view.js";
import { createEnvironmentItem } from "./lab-scene-registry.js";
import { configureRendererShadows, setObjectShadowEnabled } from "./lab-shadows.js";
import { normalizeWheelDelta } from "./wheel-utils.js";

const LOOK_SENSITIVITY = 0.002;
const WHEEL_ZOOM_SPEED = 0.038;
const MAX_EYE_HEIGHT = 8;
const CLICK_THRESHOLD_PX = 4;
const FOCUS_DISTANCE = 1.35;

const focusTarget = new THREE.Vector3();
const focusViewDir = new THREE.Vector3();
const focusDesiredPos = new THREE.Vector3();
const focusBox = new THREE.Box3();
const focusSize = new THREE.Vector3();
const lookTarget = new THREE.Vector3();

/**
 * @param {HTMLElement} container #lab-viewport
 * @param {{ blocker: HTMLElement, moveSpeedInput?: HTMLInputElement | null }} ui
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
    let canvasDoubleClickHandler = null;
    let gizmoDragging = false;
    let pendingRightClick = null;
    let leftLookActive = false;
    /** @type {(() => void) | null} */
    let afterRender = null;

    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x1a1a1a);
    scene.fog = new THREE.Fog(0x1a1a1a, 0, 60);

    camera = new THREE.PerspectiveCamera(58, 1, 0.05, 1000);
    pitch.add(camera);
    yaw.add(pitch);
    scene.add(yaw);
    yaw.position.set(0, 1.65, 4);

    const gridHelper = new THREE.GridHelper(GRID_SIZE, GRID_SIZE, 0x6b7280, 0x3f4a5a);
    gridHelper.position.y = 0.02;
    scene.add(gridHelper);

    const floor = new THREE.Mesh(
        new THREE.PlaneGeometry(GRID_SIZE, GRID_SIZE),
        new THREE.MeshLambertMaterial({ color: 0x222222, side: THREE.DoubleSide })
    );
    floor.rotation.x = -Math.PI / 2;
    setObjectShadowEnabled(floor, true, { receiveOnly: true });
    scene.add(floor);

    /**
     * @param {ReturnType<import("./lab-scene-registry.js").createSceneRegistry>} registry
     */
    function registerEnvironmentItems(registry) {
        registry.register(createEnvironmentItem("env-grid", "Grille", gridHelper));
        registry.register(
            createEnvironmentItem("env-floor", "Sol", floor, {
                getShadow: () => floor.receiveShadow,
                setShadow: (enabled) => {
                    setObjectShadowEnabled(floor, enabled, { receiveOnly: true });
                },
            })
        );
    }

    const { blocker, moveSpeedInput } = ui;

    if (moveSpeedInput) {
        moveSpeedInput.value = String(moveSpeed);
        moveSpeedInput.addEventListener("input", () => {
            setMoveSpeed(Number(moveSpeedInput.value));
        });
    }

    function enterExplore() {
        exploreActive = true;
        blocker.hidden = true;
    }

    blocker.addEventListener("click", enterExplore);

    const onKeyDown = (event) => {
        if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;

        if (event.code === "Escape") {
            if (exploreActive) {
                exploreActive = false;
                leftLookActive = false;
                blocker.hidden = false;
            }
            return;
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
                event.preventDefault();
                jump();
                break;
            default:
                break;
        }
    };
    const onKeyUp = (event) => {
        if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;

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
    renderer.setPixelRatio(window.devicePixelRatio);
    configureRendererShadows(renderer);
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

    function canInteractAt(clientX, clientY) {
        return quadView.isInMainView(clientX, clientY);
    }

    renderer.domElement.addEventListener("contextmenu", (e) => e.preventDefault());

    renderer.domElement.addEventListener("mousedown", (event) => {
        if (!canInteractAt(event.clientX, event.clientY)) return;

        if (!exploreActive) {
            if (event.button === 0) enterExplore();
            return;
        }
        if (gizmoDragging) return;

        if (event.button === 0) {
            leftLookActive = true;
            container.classList.add("lab-viewport--look");
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

    window.addEventListener("mouseup", (event) => {
        if (event.button === 0) {
            leftLookActive = false;
            container.classList.remove("lab-viewport--look");
        }

        if (event.button === 2 && pendingRightClick) {
            const dx = event.clientX - pendingRightClick.startX;
            const dy = event.clientY - pendingRightClick.startY;
            if (dx * dx + dy * dy < CLICK_THRESHOLD_PX * CLICK_THRESHOLD_PX) {
                canvasRightClickHandler?.(pendingRightClick.event);
            }
            pendingRightClick = null;
        }
    });

    window.addEventListener("mousemove", (event) => {
        if (!leftLookActive || gizmoDragging || !exploreActive) return;
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

    function clampPosition() {
        const bound = GRID_SIZE * 0.45;
        yaw.position.x = THREE.MathUtils.clamp(yaw.position.x, -bound, bound);
        yaw.position.z = THREE.MathUtils.clamp(yaw.position.z, -bound, bound);
        if (isPlayerAirborne()) {
            yaw.position.y = Math.min(yaw.position.y, MAX_EYE_HEIGHT);
        } else {
            const minEye = getGroundEyeY(yaw.position.x, yaw.position.z);
            yaw.position.y = THREE.MathUtils.clamp(yaw.position.y, minEye, MAX_EYE_HEIGHT);
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
        focusDesiredPos.y = THREE.MathUtils.clamp(
            focusTarget.y + 0.3,
            getGroundEyeY(focusDesiredPos.x, focusDesiredPos.z),
            MAX_EYE_HEIGHT
        );

        yaw.position.copy(focusDesiredPos);
        aimAtWorldTarget(focusTarget);
    }

    function stepFocusAnimation() { /* rien */ }

    renderer.domElement.addEventListener("wheel", (event) => {
        if (!canInteractAt(event.clientX, event.clientY)) return;
        if (!exploreActive || gizmoDragging) return;
        event.preventDefault();

        camera.getWorldDirection(viewDirection);
        const step = -normalizeWheelDelta(event) * WHEEL_ZOOM_SPEED;
        moveDelta.copy(viewDirection).multiplyScalar(step);
        movePlayer(moveDelta);
        clampPosition();
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

        stepFocusAnimation();

        if (exploreActive && !gizmoDragging) {
            const delta = (time - prevTime) / 1000;

            velocity.x -= velocity.x * 10.0 * delta;
            velocity.z -= velocity.z * 10.0 * delta;

            direction.z = Number(moveForward) - Number(moveBackward);
            direction.x = Number(moveRight) - Number(moveLeft);
            direction.normalize();

            if (moveForward || moveBackward) velocity.z -= direction.z * moveSpeed * delta;
            if (moveLeft || moveRight) velocity.x -= direction.x * moveSpeed * delta;

            const moveX = -velocity.x * delta;
            const moveZ = -velocity.z * delta;

            const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(yaw.quaternion);
            const right = new THREE.Vector3(1, 0, 0).applyQuaternion(yaw.quaternion);
            moveDelta.set(0, 0, 0);
            moveDelta.addScaledVector(forward, moveZ);
            moveDelta.addScaledVector(right, moveX);
            movePlayer(moveDelta);

            updatePlayerVertical(delta);
            clampPosition();
        }

        prevTime = time;
        renderer.render(scene, camera);
        quadView.renderAuxViews();
        afterRender?.();
    }

    animate();

    return {
        scene,
        camera,
        renderer,
        yaw,
        pickOccluders: [floor],
        isExploreActive: () => exploreActive,
        isGizmoDragging: () => gizmoDragging,
        enterExplore,
        setGizmoDragging(value) {
            gizmoDragging = value;
            if (value) leftLookActive = false;
        },
        setCanvasRightClickHandler(fn) {
            canvasRightClickHandler = fn;
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
        canInteractAt,
        getPointerRect: () => renderer.domElement.getBoundingClientRect(),
        registerEnvironmentItems,
        focusOnObject,
    };
}
