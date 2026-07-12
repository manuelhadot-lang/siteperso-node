import { initGallery } from "./gallery.js";
import { initFullscreenToggle } from "./fullscreen.js";
import { initSidePanel } from "./side-panel.js";
import { initCubeEditor } from "./cube-editor.js";
import { initCollisionSystem } from "./lab-collision.js";
import { initFileMenu } from "./lab-menu.js";
import { initScenePanel } from "./lab-scene-panel.js";

initSidePanel();

const workspace = document.getElementById("lab-workspace");
const viewport = document.getElementById("lab-viewport");
const blocker = document.getElementById("lab-blocker");
const fullscreenBtn = document.getElementById("btn-fullscreen");
const spawnCubeBtn = document.getElementById("btn-add-cube");
const lightSpotBtn = document.getElementById("btn-add-spot");
const lightSunBtn = document.getElementById("btn-add-sun");
const lightLampBtn = document.getElementById("btn-add-lamp");
const quadViewBtn = document.getElementById("btn-quad-view");
const modeBtns = document.querySelectorAll(".lab-toolbar__mode-btn");
const snapBtns = document.querySelectorAll(".lab-toolbar__snap-btn");
const objectInfoPanel = document.getElementById("lab-object-info");
const moveSpeedInput = document.getElementById("lab-move-speed");
const moveSpeedValue = document.getElementById("lab-move-speed-value");

if (viewport && blocker) {
    const gallery = initGallery(viewport, { blocker, moveSpeedInput });
    initCollisionSystem(gallery.yaw);

    if (moveSpeedInput && moveSpeedValue) {
        moveSpeedInput.addEventListener("input", () => {
            moveSpeedValue.textContent = moveSpeedInput.value;
        });
    }

    const scenePanelEl = document.getElementById("lab-scene-panel");
    const sceneRegistry = initScenePanel(scenePanelEl);
    if (sceneRegistry) {
        gallery.registerEnvironmentItems(sceneRegistry);
    }

    if (spawnCubeBtn && objectInfoPanel && modeBtns.length && snapBtns.length) {
        const editor = initCubeEditor({
            scene: gallery.scene,
            camera: gallery.camera,
            renderer: gallery.renderer,
            viewport,
            yaw: gallery.yaw,
            playerRoot: gallery.yaw,
            spawnBtn: spawnCubeBtn,
            lightBtns: {
                spot: lightSpotBtn,
                sun: lightSunBtn,
                lamp: lightLampBtn,
            },
            modeBtns,
            snapBtns,
            objectInfoPanel,
            focusOnObject: gallery.focusOnObject,
            onGizmoDraggingChange: gallery.setGizmoDragging,
            setCanvasRightClickHandler: gallery.setCanvasRightClickHandler,
            setCanvasDoubleClickHandler: gallery.setCanvasDoubleClickHandler,
            setAfterRender: gallery.setAfterRender,
            getPointerRect: gallery.getPointerRect,
            canInteractAt: gallery.canInteractAt,
            sceneRegistry: sceneRegistry ?? undefined,
            isGizmoDragging: gallery.isGizmoDragging,
        });

        if (quadViewBtn) {
            quadViewBtn.addEventListener("click", (e) => {
                e.stopPropagation();
                const enabled = gallery.toggleQuadView();
                quadViewBtn.classList.toggle("is-active", enabled);
                quadViewBtn.setAttribute("aria-pressed", enabled ? "true" : "false");
            });
        }

        initFileMenu({
            onNew: () => editor.newScene(),
            onOpen: () => editor.openScene(),
            onOpenDisk: () => editor.openSceneFromDisk(),
            onSave: () => editor.saveScene(),
            onSaveAs: () => editor.saveSceneAs(),
            onSaveDisk: () => editor.saveSceneToDisk(),
            onClose: () => editor.closeScene(),
        });
    }
}

if (workspace && fullscreenBtn) {
    initFullscreenToggle(workspace, fullscreenBtn);
}
