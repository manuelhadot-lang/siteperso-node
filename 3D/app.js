import { initGallery } from "./gallery.js";
import { initFullscreenToggle } from "./fullscreen.js";
import { initSidePanel } from "./side-panel.js";
import { initCubeEditor } from "./cube-editor.js";
import { initCollisionSystem } from "./lab-collision.js";
import { initFileMenu } from "./lab-menu.js";
import { initExportMenu } from "./lab-export.js";
import { initImportMenu } from "./lab-import.js";
import { initHelpMenu } from "./lab-help.js";
import { initFaceMenu } from "./lab-face-menu.js";
import { initSkybox } from "./lab-skybox.js";
import { initScenePanel } from "./lab-scene-panel.js";
import { initTerrainEditor } from "./lab-terrain.js";
import { initOcean } from "./lab-ocean.js";

export const LAB_BUILD = "20260719tubeundo";

initSidePanel();

if (typeof window !== "undefined") {
    window.__LAB_3D_BUILD__ = LAB_BUILD;
}

const workspace = document.getElementById("lab-workspace");
const viewport = document.getElementById("lab-viewport");
const blocker = document.getElementById("lab-blocker");
const fullscreenBtn = document.getElementById("btn-fullscreen");
const spawnCubeBtn = document.getElementById("btn-add-cube");
const spawnSphereBtn = document.getElementById("btn-add-sphere");
const spawnPyramidBtn = document.getElementById("btn-add-pyramid");
const spawnCylinderBtn = document.getElementById("btn-add-cylinder");
const spawnConeBtn = document.getElementById("btn-add-cone");
const spawnTorusBtn = document.getElementById("btn-add-torus");
const spawnPanelBtn = document.getElementById("btn-add-panel");
const spawnStairBtn = document.getElementById("btn-add-stair");
const spawnTubeBtn = document.getElementById("btn-add-tube");
const hoverTooltip = document.getElementById("lab-hover-tooltip");
const lightSpotBtn = document.getElementById("btn-add-spot");
const lightSunBtn = document.getElementById("btn-add-sun");
const lightLampBtn = document.getElementById("btn-add-lamp");
const quadViewBtn = document.getElementById("btn-quad-view");
const drawBtn = document.getElementById("btn-face-draw-panel");
const drawPanel = document.getElementById("lab-draw-panel-side");
const drawColorInput = document.getElementById("lab-draw-color-side");
const drawToolSelect = document.getElementById("lab-draw-tool-side");
const drawSizeInput = document.getElementById("lab-draw-size-side");
const drawOpacityInput = document.getElementById("lab-draw-opacity-side");
const drawTextureBtn = document.getElementById("lab-draw-texture-side");
const drawTextureClearBtn = document.getElementById("lab-draw-texture-clear-side");
const drawTileXInput = document.getElementById("lab-draw-tile-x-side");
const drawTileYInput = document.getElementById("lab-draw-tile-y-side");
const drawOffsetXInput = document.getElementById("lab-draw-offset-x-side");
const drawOffsetYInput = document.getElementById("lab-draw-offset-y-side");
const drawFaceTextureBtn = document.getElementById("lab-draw-face-texture-side");
const drawFaceTextureClearBtn = document.getElementById("lab-draw-face-texture-clear-side");
const drawApplyTrianglesBtn = document.getElementById("lab-draw-apply-triangles-side");
const drawClearTrianglesBtn = document.getElementById("lab-draw-clear-triangles-side");
const drawDecalBtn = document.getElementById("lab-draw-decal-side");
const drawDecalClearBtn = document.getElementById("lab-draw-decal-clear-side");
const voiceBtn = document.getElementById("btn-voice-dimensions");
const voicePanel = document.getElementById("lab-voice-panel");
const voiceModeSelect = document.getElementById("lab-voice-mode");
const voiceStartBtn = document.getElementById("lab-voice-start");
const voiceX = document.getElementById("lab-voice-x");
const voiceY = document.getElementById("lab-voice-y");
const voiceZ = document.getElementById("lab-voice-z");
const voiceHint = document.getElementById("lab-voice-hint");
const csgBtn = document.getElementById("btn-csg-subtract");
const modeBtns = document.querySelectorAll(".lab-toolbar__mode-btn");
const snapBtns = document.querySelectorAll(".lab-toolbar__snap-btn");
const objectInfoPanel = document.getElementById("lab-object-info");
const moveSpeedInput = document.getElementById("lab-move-speed");
const moveSpeedValue = document.getElementById("lab-move-speed-value");
const fpsModeBtn = document.getElementById("btn-fps-mode");
const designModeBtn = document.getElementById("btn-design-mode");
const overviewModeBtn = document.getElementById("btn-overview-mode");

function syncMovementModeUi(mode) {
    const normalized = mode === "col" ? "overview" : mode || "design";
    if (fpsModeBtn) {
        fpsModeBtn.classList.toggle("is-active", normalized === "fps");
        fpsModeBtn.setAttribute("aria-pressed", String(normalized === "fps"));
    }
    if (designModeBtn) {
        designModeBtn.classList.toggle("is-active", normalized === "design");
        designModeBtn.setAttribute("aria-pressed", String(normalized === "design"));
    }
    if (overviewModeBtn) {
        overviewModeBtn.classList.toggle("is-active", normalized === "overview");
        overviewModeBtn.setAttribute("aria-pressed", String(normalized === "overview"));
    }
}

if (workspace && fullscreenBtn) {
    initFullscreenToggle(workspace, fullscreenBtn);
}

if (viewport && blocker) {
    const gallery = initGallery(viewport, {
        blocker,
        moveSpeedInput,
        onMovementModeChange: syncMovementModeUi,
    });
    initCollisionSystem(gallery.yaw);

    if (moveSpeedInput && moveSpeedValue) {
        moveSpeedInput.addEventListener("input", () => {
            moveSpeedValue.textContent = moveSpeedInput.value;
        });
    }

    if (fpsModeBtn) {
        fpsModeBtn.addEventListener("click", (event) => {
            event.stopPropagation();
            gallery.setMovementMode("fps");
        });
    }
    if (designModeBtn) {
        designModeBtn.addEventListener("click", (event) => {
            event.stopPropagation();
            gallery.setMovementMode("design");
        });
    }
    if (overviewModeBtn) {
        overviewModeBtn.addEventListener("click", (event) => {
            event.stopPropagation();
            gallery.setMovementMode("overview");
        });
    }

    initHelpMenu();

    const scenePanelEl = document.getElementById("lab-scene-panel");
    const sceneRegistry = initScenePanel(scenePanelEl);
    if (sceneRegistry) {
        gallery.registerEnvironmentItems(sceneRegistry);
    }

    const terrainEditor = initTerrainEditor({
        scene: gallery.scene,
        camera: gallery.camera,
        renderer: gallery.renderer,
        setTerrainSculptModeActive: gallery.setTerrainSculptModeActive,
        gridHelper: gallery.gridHelper,
        floor: gallery.floor,
        setFloorCoveredByTerrain: gallery.setFloorCoveredByTerrain,
        sceneRegistry,
        focusOnTerrain: gallery.focusOnTerrainRelief,
        setWorldSize: gallery.setWorldSize,
    });

    const showLabStatus = (msg) => {
        const el = document.querySelector(".lab-viewport__status");
        if (!el) return;
        el.textContent = msg;
        el.classList.add("is-visible");
        window.setTimeout(() => el.classList.remove("is-visible"), 2200);
    };

    const oceanEditor = initOcean({
        scene: gallery.scene,
        camera: gallery.camera,
        renderer: gallery.renderer,
        sceneRegistry,
        showStatus: showLabStatus,
        getTerrainHeightMap: () => terrainEditor.getHeightMapInfo?.() ?? null,
    });

    const skyboxController = initSkybox({
        getScene: () => gallery.scene,
        getRenderer: () => gallery.renderer,
        registry: sceneRegistry,
        showStatus: showLabStatus,
    });

    if (spawnCubeBtn && objectInfoPanel && modeBtns.length && snapBtns.length) {
        let editor;
        try {
            editor = initCubeEditor({
                scene: gallery.scene,
                camera: gallery.camera,
                renderer: gallery.renderer,
                viewport,
                yaw: gallery.yaw,
                playerRoot: gallery.yaw,
                spawnBtn: spawnCubeBtn,
                spawnSphereBtn: /** @type {HTMLButtonElement | null} */ (spawnSphereBtn),
                spawnPrimitiveBtns: {
                    pyramid: /** @type {HTMLButtonElement | null} */ (spawnPyramidBtn),
                    cylinder: /** @type {HTMLButtonElement | null} */ (spawnCylinderBtn),
                    cone: /** @type {HTMLButtonElement | null} */ (spawnConeBtn),
                    torus: /** @type {HTMLButtonElement | null} */ (spawnTorusBtn),
                    panel: /** @type {HTMLButtonElement | null} */ (spawnPanelBtn),
                },
                lightBtns: {
                    spot: lightSpotBtn,
                    sun: lightSunBtn,
                    lamp: lightLampBtn,
                },
                modeBtns,
                snapBtns,
                objectInfoPanel,
                focusOnObject: gallery.focusOnObject,
                setOrbitTarget: gallery.setOrbitTarget,
                onGizmoDraggingChange: gallery.setGizmoDragging,
                setCanvasRightClickHandler: gallery.setCanvasRightClickHandler,
                setCanvasLeftClickHandler: gallery.setCanvasLeftClickHandler,
                setCanvasDoubleClickHandler: gallery.setCanvasDoubleClickHandler,
                setAfterRender: gallery.setAfterRender,
                getPointerRect: gallery.getPointerRect,
                canInteractAt: gallery.canInteractAt,
                sceneRegistry: sceneRegistry ?? undefined,
                isGizmoDragging: gallery.isGizmoDragging,
                drawBtn,
                drawPanel,
                drawColorInput,
                drawToolSelect,
                drawSizeInput,
                drawOpacityInput,
                drawTextureBtn,
                drawTextureClearBtn,
                drawTileXInput,
                drawTileYInput,
                drawOffsetXInput,
                drawOffsetYInput,
                drawFaceTextureBtn,
                drawFaceTextureClearBtn,
                drawApplyTrianglesBtn,
                drawClearTrianglesBtn,
                drawDecalBtn,
                drawDecalClearBtn,
                setDrawModeActive: gallery.setDrawModeActive,
                enterExplore: gallery.enterExplore,
                voiceBtn,
                voicePanel,
                voiceModeSelect,
                voiceStartBtn,
                voiceX,
                voiceY,
                voiceZ,
                voiceHint,
                csgBtn,
                spawnStairBtn,
                spawnTubeBtn,
                hoverTooltip,
                vegetationUi: {
                    typeButtons: document.querySelectorAll("[data-veg-type]"),
                    heightInput: /** @type {HTMLInputElement | null} */ (
                        document.getElementById("lab-veg-height")
                    ),
                    heightValue: document.getElementById("lab-veg-height-value"),
                    paintGroundCheck: /** @type {HTMLInputElement | null} */ (
                        document.getElementById("lab-veg-paint-ground")
                    ),
                    placeBtn: /** @type {HTMLButtonElement | null} */ (
                        document.getElementById("btn-veg-place")
                    ),
                    applyBrushBtn: /** @type {HTMLButtonElement | null} */ (
                        document.getElementById("btn-veg-apply-brush")
                    ),
                    importBtn: /** @type {HTMLButtonElement | null} */ (
                        document.getElementById("btn-veg-import")
                    ),
                    fileInput: /** @type {HTMLInputElement | null} */ (
                        document.getElementById("lab-veg-file")
                    ),
                    modelNameEl: document.getElementById("lab-veg-model-name"),
                    brightnessInput: /** @type {HTMLInputElement | null} */ (
                        document.getElementById("lab-veg-brightness")
                    ),
                    brightnessValue: document.getElementById("lab-veg-brightness-value"),
                },
                setVegetationPlaceModeActive: gallery.setVegetationPlaceModeActive,
                terrainController: terrainEditor,
                oceanController: oceanEditor,
                skyboxController: skyboxController ?? undefined,
            });
        } catch (error) {
            console.error("[LAB 3D] initCubeEditor a échoué :", error);
        }

        if (editor && quadViewBtn) {
            quadViewBtn.addEventListener("click", (e) => {
                e.stopPropagation();
                const enabled = gallery.toggleQuadView();
                quadViewBtn.classList.toggle("is-active", enabled);
                quadViewBtn.setAttribute("aria-pressed", enabled ? "true" : "false");
            });
        }

        if (editor) {
            initFaceMenu({
                isTriangulationMode: () => !!editor.isTriangulationMode?.(),
                onToggleTriangulation: (next) => editor.setTriangulationMode?.(next),
                onClearTriangleSelection: () => editor.clearTriangleSelection?.(),
            });
            if (typeof window !== "undefined") {
                window.__LAB_3D_MENU_READY__ = true;
            }
            if (sceneRegistry) {
                sceneRegistry.setItemContextMenuHandler((itemId, event) => {
                    editor.showContextMenuForSceneItem(itemId, event);
                });
            }

            initFileMenu({
                onNew: async () => {
                    await editor.newScene();
                    gallery.resetViewForNewScene();
                },
                onOpen: () => editor.openScene(),
                onOpenDisk: () => editor.openSceneFromDisk(),
                onSave: () => editor.saveScene(),
                onSaveAs: () => editor.saveSceneAs(),
                onSaveDisk: () => editor.saveSceneToDisk(),
                onClose: async () => {
                    await editor.closeScene();
                    gallery.resetViewForNewScene();
                },
            });

            initExportMenu({
                getScene: () => gallery.scene,
                showStatus: showLabStatus,
            });

            initImportMenu({
                onImportFile: (file) => editor.spawnImportedModelFile(file),
                showStatus: showLabStatus,
            });
        }
    }
}
