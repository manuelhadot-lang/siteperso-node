/** Vue quadruple : dessus, droite, gauche + vue réelle (joueur). */
import * as THREE from "three";
import { GRID_SIZE } from "./grid-constants.js";
import { configureRendererShadows } from "./lab-shadows.js";
import { wheelZoomFactor } from "./wheel-utils.js";

/** Demi-étendue ortho par défaut : grille 50 m visible avec petite marge. */
const ORTHO_BASE_HALF = GRID_SIZE / 2 + 1;
const ORTHO_DISTANCE = 40;
const ZOOM_MIN = 0.25;
const ZOOM_MAX = 20;
const ZOOM_WHEEL_SENSITIVITY = 0.0018;

/**
 * Ajuste le frustum ortho pour conserver les proportions (1 m = même échelle X/Y à l'écran).
 * @param {THREE.OrthographicCamera} camera
 * @param {number} width
 * @param {number} height
 * @param {number} halfExtent
 */
function fitOrthoFrustum(camera, width, height, halfExtent) {
    if (width < 1 || height < 1) return;
    const aspect = width / height;
    if (aspect >= 1) {
        camera.left = -halfExtent * aspect;
        camera.right = halfExtent * aspect;
        camera.top = halfExtent;
        camera.bottom = -halfExtent;
    } else {
        camera.left = -halfExtent;
        camera.right = halfExtent;
        camera.top = halfExtent / aspect;
        camera.bottom = -halfExtent / aspect;
    }
    camera.updateProjectionMatrix();
}

/**
 * @param {{
 *   viewport: HTMLElement,
 *   scene: THREE.Scene,
 *   mainRenderer: THREE.WebGLRenderer,
 *   getTarget: () => THREE.Vector3,
 * }} ctx
 */
export function initQuadView(ctx) {
    const { viewport, scene, mainRenderer, getTarget } = ctx;

    const grid = document.createElement("div");
    grid.className = "lab-quad-grid";
    grid.hidden = true;
    grid.innerHTML =
        '<div class="lab-quad-cell" data-quad="top" title="Molette : zoomer"><span class="lab-quad-cell__label">Dessus</span><div class="lab-quad-cell__canvas"></div></div>' +
        '<div class="lab-quad-cell" data-quad="right" title="Molette : zoomer"><span class="lab-quad-cell__label">Droite</span><div class="lab-quad-cell__canvas"></div></div>' +
        '<div class="lab-quad-cell" data-quad="left" title="Molette : zoomer"><span class="lab-quad-cell__label">Gauche</span><div class="lab-quad-cell__canvas"></div></div>' +
        '<div class="lab-quad-cell lab-quad-cell--main" data-quad="main" title="Molette : zoomer"><span class="lab-quad-cell__label">Réelle</span><div class="lab-quad-cell__canvas"></div></div>';
    viewport.insertBefore(grid, viewport.firstChild);

    ["top", "right", "left"].forEach((view) => {
        const cell = grid.querySelector(`[data-quad="${view}"]`);
        cell?.addEventListener(
            "wheel",
            (event) => {
                if (!enabled) return;
                event.preventDefault();
                applyOrthoZoom(/** @type {"top"|"right"|"left"} */ (view), event);
            },
            { passive: false }
        );
    });

    const mainSlot = grid.querySelector('[data-quad="main"] .lab-quad-cell__canvas');
    const auxSlots = {
        top: grid.querySelector('[data-quad="top"] .lab-quad-cell__canvas'),
        right: grid.querySelector('[data-quad="right"] .lab-quad-cell__canvas'),
        left: grid.querySelector('[data-quad="left"] .lab-quad-cell__canvas'),
    };

    let enabled = false;

    function makeOrthoCamera() {
        return new THREE.OrthographicCamera(
            -ORTHO_BASE_HALF,
            ORTHO_BASE_HALF,
            ORTHO_BASE_HALF,
            -ORTHO_BASE_HALF,
            0.1,
            500
        );
    }

    const topCam = makeOrthoCamera();
    const rightCam = makeOrthoCamera();
    const leftCam = makeOrthoCamera();

    /** @type {Record<"top"|"right"|"left", number>} */
    const zoomLevels = { top: 1, right: 1, left: 1 };

    /** @type {{ top: THREE.WebGLRenderer, right: THREE.WebGLRenderer, left: THREE.WebGLRenderer } | null} */
    let auxRenderers = null;

    /** @param {"top"|"right"|"left"} view */
    function getOrthoHalf(view) {
        return ORTHO_BASE_HALF / zoomLevels[view];
    }

    /** @param {"top"|"right"|"left"} view @param {WheelEvent} event */
    function applyOrthoZoom(view, event) {
        const factor = wheelZoomFactor(event, ZOOM_WHEEL_SENSITIVITY);
        zoomLevels[view] = THREE.MathUtils.clamp(zoomLevels[view] * factor, ZOOM_MIN, ZOOM_MAX);
        if (!auxRenderers) return;
        const cameras = { top: topCam, right: rightCam, left: leftCam };
        resizeAuxRenderer(auxRenderers[view], auxSlots[view], cameras[view], view);
    }

    function ensureAuxRenderers() {
        if (auxRenderers) return auxRenderers;
        auxRenderers = {
            top: createAuxRenderer(auxSlots.top, "top"),
            right: createAuxRenderer(auxSlots.right, "right"),
            left: createAuxRenderer(auxSlots.left, "left"),
        };
        return auxRenderers;
    }

    /** @param {HTMLElement} container @param {"top"|"right"|"left"} view */
    function createAuxRenderer(container, view) {
        const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
        renderer.setPixelRatio(window.devicePixelRatio);
        configureRendererShadows(renderer);
        renderer.setClearColor(0x1a1a1a, 1);
        container.appendChild(renderer.domElement);
        return renderer;
    }

    function updateOrthoCameras() {
        const target = getTarget();
        const groundX = target.x;
        const groundZ = target.z;

        topCam.position.set(groundX, ORTHO_DISTANCE, groundZ);
        topCam.up.set(0, 0, -1);
        topCam.lookAt(groundX, 0, groundZ);
        topCam.updateMatrixWorld();

        rightCam.position.set(groundX + ORTHO_DISTANCE, target.y, groundZ);
        rightCam.up.set(0, 1, 0);
        rightCam.lookAt(groundX, target.y, groundZ);
        rightCam.updateMatrixWorld();

        leftCam.position.set(groundX - ORTHO_DISTANCE, target.y, groundZ);
        leftCam.up.set(0, 1, 0);
        leftCam.lookAt(groundX, target.y, groundZ);
        leftCam.updateMatrixWorld();
    }

    /** @param {THREE.WebGLRenderer} renderer @param {HTMLElement} container @param {THREE.OrthographicCamera} camera @param {"top"|"right"|"left"} view */
    function resizeAuxRenderer(renderer, container, camera, view) {
        const width = container.clientWidth;
        const height = container.clientHeight;
        if (width < 1 || height < 1) return;
        renderer.setSize(width, height, false);
        fitOrthoFrustum(camera, width, height, getOrthoHalf(view));
    }

    function resizeAll() {
        if (!enabled) return;
        const aux = ensureAuxRenderers();
        resizeAuxRenderer(aux.top, auxSlots.top, topCam, "top");
        resizeAuxRenderer(aux.right, auxSlots.right, rightCam, "right");
        resizeAuxRenderer(aux.left, auxSlots.left, leftCam, "left");

        const width = mainSlot.clientWidth;
        const height = mainSlot.clientHeight;
        if (width > 0 && height > 0) {
            mainRenderer.setSize(width, height, false);
        }
    }

    function renderAuxViews() {
        if (!enabled || !auxRenderers) return;
        updateOrthoCameras();

        const fog = scene.fog;
        scene.fog = null;

        auxRenderers.top.render(scene, topCam);
        auxRenderers.right.render(scene, rightCam);
        auxRenderers.left.render(scene, leftCam);

        scene.fog = fog;
    }

    function setEnabled(value) {
        if (enabled === value) return enabled;
        enabled = value;
        viewport.classList.toggle("lab-viewport--quad", enabled);
        grid.hidden = !enabled;

        if (enabled) {
            ensureAuxRenderers();
            mainSlot.appendChild(mainRenderer.domElement);
            requestAnimationFrame(resizeAll);
        } else {
            viewport.appendChild(mainRenderer.domElement);
            requestAnimationFrame(() => {
                const width = viewport.clientWidth;
                const height = viewport.clientHeight;
                if (width > 0 && height > 0) {
                    mainRenderer.setSize(width, height, false);
                }
            });
        }

        return enabled;
    }

    function toggle() {
        return setEnabled(!enabled);
    }

    function isEnabled() {
        return enabled;
    }

    /** @param {number} clientX @param {number} clientY */
    function isInMainView(clientX, clientY) {
        if (!enabled) return true;
        const rect = mainSlot.getBoundingClientRect();
        return (
            clientX >= rect.left &&
            clientX <= rect.right &&
            clientY >= rect.top &&
            clientY <= rect.bottom
        );
    }

    const resizeObserver = new ResizeObserver(() => resizeAll());
    resizeObserver.observe(viewport);
    grid.querySelectorAll(".lab-quad-cell__canvas").forEach((el) => resizeObserver.observe(el));

    return {
        setEnabled,
        toggle,
        isEnabled,
        isInMainView,
        renderAuxViews,
        resizeAll,
    };
}
