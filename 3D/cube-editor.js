/** Objets de scène : placement, sélection, transformation, collisions. */
import * as THREE from "three";
import { TransformControls } from "three/addons/controls/TransformControls.js";
import {
    COLLISION_KEY,
    registerCollidable,
    unregisterCollidable,
} from "./lab-collision.js";
import { LAB_TERRAIN_KEY } from "./lab-terrain.js";
import { CUBE_SIZE, GRID_STEP, snapValue } from "./grid-constants.js";
import {
    applyTransformSnap,
    formatObjectTransform,
    snapMeshByMode,
    snapMeshRotation,
    snapMeshScale,
    snapMeshToFloor,
    snapMeshTranslate,
} from "./transform-snapping.js";
import {
    applyFacePaintData,
    disposeFacePaint,
    getPaintableMesh,
    initFaceDrawController,
    isPaintableBoxMesh,
    restoreFaceSnapshot,
    serializeFacePaint,
} from "./lab-face-draw.js";
import {
    createPrimitiveGeometry,
    isLabPrimitiveShape,
    kindFromShape,
    PRIMITIVE_META,
    shapeFromKind,
} from "./lab-primitives.js";
import { initVoiceTransformController } from "./lab-voice-dimensions.js";
import { subtractLabObjects, applyCsgResultToLabObject, canCsgLabObject, serializeCsgGeometry, createCsgPivotFromGeometry, getLabContentMesh } from "./lab-csg.js";
import { initCsgTool } from "./lab-csg-tool.js";
import {
    buildStairGroup,
    buildLandingGroup,
    formatStairHeightSummary,
    getStairStepCount,
    getStairThickness,
    getStairShape,
    getStairRadius,
    getStairArcDeg,
    getStairTotalHeight,
    getLandingSize,
    getLandingWidth,
    getLandingDepth,
    getLandingThickness,
    isLabStair,
    isLabLanding,
    placeLandingAfterStair,
    placeStairAfterLanding,
    rebuildStairGroup,
    STAIR_DEFAULT_STEP_COUNT,
    clampStairStepCount,
    clampStairThickness,
    clampStairRadius,
    clampStairArcDeg,
    normalizeStairShape,
} from "./lab-stair.js";
import {
    buildTubeGroup,
    buildBentTubeGroup,
    rebuildTubeGroup,
    placeTubeContinued,
    getTubeEndWorld,
    computeTubeExitDirection,
    getTubeLength,
    getTubeRadius,
    getTubeWall,
    getTubeBendAngle,
    getTubeBendRadius,
    isTubeEntranceOrigin,
    clampTubeLength,
    clampTubeRadius,
    clampTubeWall,
    clampTubeBendRadius,
    isLabTube,
    LAB_TUBE_KEY,
    TUBE_LENGTH_KEY,
    TUBE_RADIUS_KEY,
    TUBE_WALL_KEY,
    TUBE_DEFAULT_LENGTH,
    TUBE_DEFAULT_RADIUS,
    TUBE_DEFAULT_WALL,
    TUBE_BEND_ANGLE_KEY,
    TUBE_BEND_RADIUS_KEY,
    TUBE_CAPS_KEY,
} from "./lab-tube.js";
import {
    createVegetationGroundDataUrl,
    createVegetationObject,
    clampVegetationBrightness,
    DEFAULT_VEGETATION_BRIGHTNESS,
    getActiveVegetationAssetId,
    getVegetationAsset,
    getVegetationAssetId,
    getVegetationType,
    hydrateVegetationAssets,
    isLabVegetation,
    registerVegetationAssetFromFile,
    serializeVegetationAssets,
    setActiveVegetationAssetId,
    setVegetationBrightness,
    enableVegetationShadowCasting,
    VEG_PRESETS,
    VEG_TYPES,
} from "./lab-vegetation.js";
import {
    LAB_IMPORTED_KEY,
    loadModelFromDataUrl,
    loadModelFromFile,
} from "./lab-import.js";
import { pickFilePreservingFullscreen } from "./fullscreen.js";
import {
    captureObjectState,
    createHistory,
    objectStatesEqual,
} from "./lab-history.js";
import {
    applyObjectNormalTexture,
    applyObjectNormalScale,
    applyObjectOpacity,
    applyObjectGlass,
    applyObjectMetalness,
    applyObjectRoughness,
    applyObjectSmooth,
    applyObjectTexture,
    applyObjectTextureTile,
    clearObjectGlassOnManualEdit,
    DEFAULT_NORMAL_SCALE,
    DEFAULT_OPACITY,
    DEFAULT_ROUGHNESS,
    DEFAULT_SMOOTH,
    DEFAULT_TEXTURE_TILE,
    getObjectGlassRestore,
    getObjectMetalness,
    getObjectNormalScale,
    getObjectNormalTextureDataUrl,
    getObjectOpacity,
    getObjectRoughness,
    getObjectSmooth,
    getObjectTextureDataUrl,
    getObjectTextureTile,
    isObjectGlassEnabled,
    METALNESS_MAX,
    NORMAL_SCALE_MAX,
    OBJECT_GLASS_KEY,
    OBJECT_NORMAL_SCALE_KEY,
    OBJECT_OPACITY_KEY,
    OBJECT_ROUGHNESS_KEY,
    OBJECT_SMOOTH_KEY,
    OBJECT_TEXTURE_TILE_KEY,
    OPACITY_MAX,
    OPACITY_MIN,
    TEXTURE_TILE_MAX,
    TEXTURE_TILE_MIN,
    releaseObjectNormalTexture,
    releaseObjectTexture,
} from "./lab-object-textures.js";
import { initObjectContextMenu } from "./lab-context-menu.js";
import {
    buildSceneDocument,
    clearSceneFileSession,
    getCurrentSceneFileName,
    hasDiskFileHandle,
    loadSceneFromLibrary,
    listSavedScenes,
    openSceneFromDiskLocation,
    parseSceneDocument,
    saveSceneToDiskLocation,
    serializeObjectSnapshot,
    setCurrentSceneFileName,
    writeSceneToLibrary,
} from "./lab-scene-io.js";
import { labConfirm, labPickScene, labPrompt } from "./lab-dialog.js";
import {
    attachLightHelper,
    createLightPivot,
    disposeLightPivot,
    detachLightHelper,
    getLightIntensity,
    getLightLabel,
    getLightSpotAngleDeg,
    isLabLight,
    isLightMarkerVisible,
    isLightSceneVisible,
    isSpotLight,
    LIGHT_TYPE,
    SCENE_ITEM_ID_KEY,
    setLightIntensity,
    setLightMarkerVisible,
    setLightSceneVisible,
    setLightSpotAngleDeg,
    updateLightHelpers,
} from "./lab-lights.js";
import {
    getLightShadowEnabled,
    getLightShadowOpacity,
    getObjectShadowEnabled,
    getObjectShadowOpacity,
    setLightShadowEnabled,
    setLightShadowOpacity,
    setObjectShadowEnabled,
    setObjectShadowOpacity,
    disposeShadowOverlay,
    invalidateLabShadows,
    refreshObjectShadows,
} from "./lab-shadows.js";

export const LAB_OBJECT_KEY = "labObject";
export const LAB_SHAPE_KEY = "labShape";
/** @typedef {import("./lab-primitives.js").LabPrimitiveShape} LabShape */
export const OBJECT_COLOR_KEY = "objectColor";
export const DEFAULT_OBJECT_COLOR = "#00d1ff";
export { COLLISION_KEY };

const DRAG_MIME = PRIMITIVE_META.box.mime;
const DRAG_MIME_SPHERE = PRIMITIVE_META.sphere.mime;
const DRAG_MIME_STAIR = "application/x-lab-stair";
const DRAG_MIME_TUBE = "application/x-lab-tube";
const ALL_PRIMITIVE_DRAG_MIMES = Object.values(PRIMITIVE_META).map((m) => m.mime);
const SPAWN_DISTANCE = 2.5;
const DEFAULT_STAIR_COLOR = "#8b9cb3";
const DEFAULT_TUBE_COLOR = "#00d1ff";
const TRI_OVERLAY_NAME = "lab-triangulation-overlay";

const floorPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const hitPoint = new THREE.Vector3();
const lightPickPoint = new THREE.Vector3();
const pickBox = new THREE.Box3();
const pickBoxPoint = new THREE.Vector3();
const nearestPickPoint = new THREE.Vector3();
const LIGHT_PICK_RADIUS = 0.55;
/** Tolérance pour murs / dalles très fines (scènes sauvegardées scalées). */
const PICK_BOX_PAD = 0.15;
/** Distance max (perpendiculaire au rayon) pour cibler un objet proche du curseur. */
const NEAREST_PICK_MAX_DIST = 3;

/**
 * @param {{
 *   scene: THREE.Scene,
 *   camera: THREE.Camera,
 *   renderer: THREE.WebGLRenderer,
 *   viewport: HTMLElement,
 *   yaw: THREE.Object3D,
 *   playerRoot: THREE.Object3D,
 *   spawnBtn: HTMLButtonElement,
 *   spawnSphereBtn?: HTMLButtonElement | null,
 *   spawnPrimitiveBtns?: Partial<Record<import("./lab-primitives.js").LabPrimitiveShape, HTMLButtonElement | null>>,
 *   lightBtns?: { spot?: HTMLButtonElement | null, sun?: HTMLButtonElement | null, lamp?: HTMLButtonElement | null },
 *   modeBtns: NodeListOf<HTMLButtonElement>,
 *   snapBtns: NodeListOf<HTMLButtonElement>,
 *   objectInfoPanel: HTMLElement,
 *   focusOnObject?: (object: THREE.Object3D) => void,
 *   setOrbitTarget?: (target: THREE.Vector3 | { x: number, y: number, z: number } | null, opts?: { frame?: boolean }) => void,
 *   onGizmoDraggingChange?: (dragging: boolean) => void,
 *   setCanvasRightClickHandler: (fn: (e: MouseEvent) => void) => void,
 *   setCanvasLeftClickHandler: (fn: (e: MouseEvent) => void) => void,
 *   setCanvasDoubleClickHandler: (fn: (e: MouseEvent) => void) => void,
 *   setAfterRender?: (fn: () => void) => void,
 *   getPointerRect?: () => DOMRect,
 *   canInteractAt?: (clientX: number, clientY: number) => boolean,
 *   sceneRegistry?: ReturnType<import("./lab-scene-registry.js").createSceneRegistry> | null,
 *   isGizmoDragging?: () => boolean,
 *   drawBtn?: HTMLButtonElement | null,
 *   drawPanel?: HTMLElement | null,
 *   drawColorInput?: HTMLInputElement | null,
 *   drawToolSelect?: HTMLSelectElement | null,
 *   drawSizeInput?: HTMLInputElement | null,
 *   drawOpacityInput?: HTMLInputElement | null,
 *   drawTextureBtn?: HTMLButtonElement | null,
 *   drawTextureClearBtn?: HTMLButtonElement | null,
 *   drawTileXInput?: HTMLInputElement | null,
 *   drawTileYInput?: HTMLInputElement | null,
 *   drawOffsetXInput?: HTMLInputElement | null,
 *   drawOffsetYInput?: HTMLInputElement | null,
 *   drawFaceTextureBtn?: HTMLButtonElement | null,
 *   drawFaceTextureClearBtn?: HTMLButtonElement | null,
 *   drawApplyTrianglesBtn?: HTMLButtonElement | null,
 *   drawClearTrianglesBtn?: HTMLButtonElement | null,
 *   drawDecalBtn?: HTMLButtonElement | null,
 *   drawDecalClearBtn?: HTMLButtonElement | null,
 *   setDrawModeActive?: (active: boolean) => void,
 *   enterExplore?: () => void,
 *   voiceBtn?: HTMLButtonElement | null,
 *   voicePanel?: HTMLElement | null,
 *   voiceModeSelect?: HTMLSelectElement | null,
 *   voiceStartBtn?: HTMLButtonElement | null,
 *   voiceX?: HTMLOutputElement | null,
 *   voiceY?: HTMLOutputElement | null,
 *   voiceZ?: HTMLOutputElement | null,
 *   voiceHint?: HTMLElement | null,
 *   csgBtn?: HTMLButtonElement | null,
 *   spawnStairBtn?: HTMLButtonElement | null,
 *   spawnTubeBtn?: HTMLButtonElement | null,
 *   hoverTooltip?: HTMLElement | null,
 *   vegetationUi?: {
 *     typeButtons?: NodeListOf<HTMLButtonElement> | HTMLButtonElement[],
 *     heightInput?: HTMLInputElement | null,
 *     heightValue?: HTMLElement | null,
 *     paintGroundCheck?: HTMLInputElement | null,
 *     placeBtn?: HTMLButtonElement | null,
 *     applyBrushBtn?: HTMLButtonElement | null,
 *     importBtn?: HTMLButtonElement | null,
 *     fileInput?: HTMLInputElement | null,
 *     modelNameEl?: HTMLElement | null,
 *     brightnessInput?: HTMLInputElement | null,
 *     brightnessValue?: HTMLElement | null,
 *   } | null,
 *   setVegetationPlaceModeActive?: (value: boolean) => void,
 *   terrainController?: { clear: (opts?: { recordHistory?: boolean }) => void, serialize: () => object | null, deserialize: (data: unknown, opts?: { recordHistory?: boolean }) => Promise<void>, hasTerrain: () => boolean, getTerrain: () => THREE.Object3D | null, tryUndoShortcut?: () => boolean, tryRedoShortcut?: () => boolean, getUndoDepth?: () => number, getRedoDepth?: () => number, isUndoInProgress?: () => boolean, setSceneHistoryPush?: (fn: ((entry: unknown) => void) | null) => void, applyBrushTextureFromDataUrl?: (dataUrl: string, opts?: { activatePaint?: boolean }) => Promise<boolean>, stampBrushAtWorld?: (worldX: number, worldZ: number, radiusMeters: number) => boolean, ensureTerrain?: () => unknown },
 *   oceanController?: { clear?: () => void, remove?: (opts?: { recordHistory?: boolean }) => void, serialize: () => object | null, deserialize: (data: unknown, opts?: { recordHistory?: boolean }) => Promise<void>, isActive?: () => boolean, setSceneHistoryPush?: (fn: ((entry: unknown) => void) | null) => void },
 *   skyboxController?: { clear?: () => void, isActive?: () => boolean, serialize?: () => object | null, deserialize?: (data: unknown) => Promise<void> },
 * }} ctx
 */
export function initCubeEditor(ctx) {
    const {
        scene,
        camera,
        renderer,
        viewport,
        yaw,
        playerRoot,
        spawnBtn,
        spawnSphereBtn,
        spawnPrimitiveBtns = {},
        lightBtns,
        modeBtns,
        snapBtns,
        objectInfoPanel,
        focusOnObject,
        setOrbitTarget,
        onGizmoDraggingChange,
        setCanvasRightClickHandler,
        setCanvasLeftClickHandler,
        setCanvasDoubleClickHandler,
        setAfterRender,
        getPointerRect,
        canInteractAt,
        sceneRegistry,
        isGizmoDragging,
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
        setDrawModeActive,
        enterExplore,
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
        vegetationUi,
        setVegetationPlaceModeActive,
        terrainController,
        oceanController,
        skyboxController,
    } = ctx;

    const editableObjects = [];
    const history = createHistory();
    terrainController?.setSceneHistoryPush?.((entry) => history.push(entry));
    oceanController?.setSceneHistoryPush?.((entry) => history.push(entry));
    let cubeCounter = 0;
    let sphereCounter = 0;
    let triangulationMode = false;
    let faceDrawController = null;

    function setTriangulationOverlayForObject(object, enabled) {
        object?.traverse((child) => {
            if (!(child instanceof THREE.Mesh)) return;
            if (child.name === "shadow-overlay") return;
            if (child.name === TRI_OVERLAY_NAME) return;
            if (child.userData?._labNoPaintPick) return;
            if (
                typeof child.name === "string" &&
                (child.name.startsWith("lab-triangle-texture-overlay") ||
                    child.name === "lab-triangle-selection-overlay")
            ) {
                return;
            }
            const mesh = /** @type {THREE.Mesh} */ (child);
            const existing = mesh.getObjectByName(TRI_OVERLAY_NAME);
            if (!enabled) {
                if (existing) {
                    mesh.remove(existing);
                    existing.geometry?.dispose?.();
                    if (Array.isArray(existing.material)) {
                        existing.material.forEach((m) => m?.dispose?.());
                    } else {
                        existing.material?.dispose?.();
                    }
                }
                return;
            }
            if (existing) return;
            if (!mesh.geometry) return;
            const wireGeo = new THREE.WireframeGeometry(mesh.geometry);
            const wireMat = new THREE.LineBasicMaterial({
                color: 0x22d3ee,
                transparent: true,
                opacity: 0.75,
                depthTest: true,
                depthWrite: false,
            });
            const overlay = new THREE.LineSegments(wireGeo, wireMat);
            overlay.name = TRI_OVERLAY_NAME;
            overlay.renderOrder = 9000;
            overlay.frustumCulled = false;
            overlay.userData._labNoPaintPick = true;
            mesh.add(overlay);
        });
    }

    function getTerrainMesh() {
        const terrain = terrainController?.getTerrain?.() ?? null;
        return terrain instanceof THREE.Mesh ? terrain : null;
    }

    function isLabTerrainObject(object) {
        return !!object?.userData?.[LAB_TERRAIN_KEY];
    }

    function ensureTerrainReadyForTriangulation() {
        const terrain = getTerrainMesh();
        if (!terrain || !triangulationMode) return null;
        const posAttr = terrain.geometry?.attributes?.position;
        const stamp = posAttr
            ? `${terrain.geometry.uuid}:${posAttr.version}`
            : String(terrain.geometry?.uuid ?? "");
        const existing = terrain.getObjectByName(TRI_OVERLAY_NAME);
        if (!existing || existing.userData._labTerrainStamp !== stamp) {
            setTriangulationOverlayForObject(terrain, false);
            setTriangulationOverlayForObject(terrain, true);
            const overlay = terrain.getObjectByName(TRI_OVERLAY_NAME);
            if (overlay) overlay.userData._labTerrainStamp = stamp;
        }
        return terrain;
    }

    function applyTriangulationOverlays(enabled) {
        for (const object of editableObjects) {
            if (isLabLight(object)) continue;
            setTriangulationOverlayForObject(object, enabled);
        }
        const terrain = getTerrainMesh();
        if (terrain) setTriangulationOverlayForObject(terrain, enabled);
    }
    /** @type {Record<string, number>} */
    const primitiveCounters = {};
    let stairCounter = 0;
    let landingCounter = 0;
    let tubeCounter = 0;
    let vegetationCounter = 0;
    let importedCounter = 0;
    /** @type {Map<string, THREE.Object3D>} */
    const importedTemplateCache = new Map();
    /** @type {import("./lab-vegetation.js").VegType} */
    let vegetationType = "tree";
    let vegetationPlaceActive = false;
    /** @type {Record<string, number>} */
    const lightCounters = { spot: 0, directional: 0, point: 0 };
    let selectedObject = null;
    /** @type {THREE.Object3D[]} */
    let selectedObjects = [];
    let selectionHighlight = false;
    let gizmoActive = false;
    let currentMode = "translate";
    const snapByMode = { translate: true, rotate: true, scale: true };
    let suppressClick = false;
    let suppressStairClick = false;
    let suppressTubeClick = false;
    let ignoreClickAfterGizmo = false;
    let transformBefore = null;
    /** @type {Map<THREE.Object3D, THREE.BoxHelper>} */
    const selectionHelpers = new Map();
    /** @type {THREE.Object3D[] | null} */
    let clipboard = null;
    /** @type {ReturnType<typeof initCsgTool> | null} */
    let csgTool = null;

    const EMISSIVE_SELECTED = 0x0e4a6e;

    function isObjectSelected(object) {
        return !!object && selectedObjects.includes(object);
    }

    function shouldShowSelectionHighlight(object) {
        return !!object && isObjectSelected(object) && !object.userData[COLLISION_KEY];
    }

    function clearSelectionOutlines() {
        for (const helper of selectionHelpers.values()) {
            scene.remove(helper);
        }
        selectionHelpers.clear();
    }

    function syncSelectionOutlines() {
        clearSelectionOutlines();
        for (const object of selectedObjects) {
            if (!shouldShowSelectionHighlight(object)) continue;
            const helper = new THREE.BoxHelper(object, 0x22d3ee);
            scene.add(helper);
            selectionHelpers.set(object, helper);
        }
    }

    function syncSelectionVisuals(object = selectedObject) {
        syncSelectionOutlines();
        if (object) updateObjectVisual(object);
        for (const selected of selectedObjects) {
            if (selected !== object) updateObjectVisual(selected);
        }
    }

    function notifyOrbitTarget() {
        if (!setOrbitTarget) return;
        if (!selectedObject) {
            setOrbitTarget(null, { frame: false });
            return;
        }
        selectedObject.updateWorldMatrix(true, true);
        const box = new THREE.Box3().setFromObject(selectedObject);
        if (box.isEmpty()) {
            setOrbitTarget(selectedObject.position, { frame: true });
            return;
        }
        const center = box.getCenter(new THREE.Vector3());
        setOrbitTarget(center, { frame: true });
    }

    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();

    const statusEl = document.createElement("div");
    statusEl.className = "lab-viewport__status";
    statusEl.setAttribute("aria-live", "polite");
    viewport.appendChild(statusEl);
    let statusTimer = 0;

    const infoPos = objectInfoPanel.querySelector("[data-field='position']");
    const infoRot = objectInfoPanel.querySelector("[data-field='rotation']");
    const infoScale = objectInfoPanel.querySelector("[data-field='scale']");

    const contextMenu = initObjectContextMenu(viewport);

    /** @type {((e: MouseEvent) => void) | null} */
    let canvasRightClickImpl = null;
    setCanvasRightClickHandler((event) => canvasRightClickImpl?.(event));

    const transformControls = new TransformControls(camera, renderer.domElement);
    transformControls.setMode("translate");
    transformControls.setSpace("world");
    transformControls.setSize(0.85);
    transformControls.showX = true;
    transformControls.showY = true;
    transformControls.showZ = true;
    transformControls.visible = false;
    scene.add(transformControls);

    applyTransformSnap(transformControls, snapByMode);

    /** États au début d’un drag multi-sélection. */
    /** @type {{ object: THREE.Object3D, position: THREE.Vector3, quaternion: THREE.Quaternion, scale: THREE.Vector3, state: ReturnType<typeof captureObjectState> }[] | null} */
    let multiDragStarts = null;
    /** @type {{ position: THREE.Vector3, quaternion: THREE.Quaternion, scale: THREE.Vector3 } | null} */
    let primaryDragStart = null;

    const _multiDeltaPos = new THREE.Vector3();
    const _multiDeltaQuat = new THREE.Quaternion();
    const _multiInvQuat = new THREE.Quaternion();
    const _multiOffset = new THREE.Vector3();
    const _multiScaleRatio = new THREE.Vector3();

    function captureMultiDragStarts() {
        if (!selectedObject || selectedObjects.length < 2) {
            multiDragStarts = null;
            primaryDragStart = null;
            return;
        }
        primaryDragStart = {
            position: selectedObject.position.clone(),
            quaternion: selectedObject.quaternion.clone(),
            scale: selectedObject.scale.clone(),
        };
        multiDragStarts = selectedObjects.map((object) => ({
            object,
            position: object.position.clone(),
            quaternion: object.quaternion.clone(),
            scale: object.scale.clone(),
            state: captureObjectState(object),
        }));
    }

    function applyMultiSelectionTransform() {
        if (!selectedObject || !primaryDragStart || !multiDragStarts || multiDragStarts.length < 2) {
            return;
        }

        _multiDeltaPos.copy(selectedObject.position).sub(primaryDragStart.position);
        _multiInvQuat.copy(primaryDragStart.quaternion).invert();
        _multiDeltaQuat.copy(selectedObject.quaternion).multiply(_multiInvQuat);
        _multiScaleRatio.set(
            primaryDragStart.scale.x !== 0 ? selectedObject.scale.x / primaryDragStart.scale.x : 1,
            primaryDragStart.scale.y !== 0 ? selectedObject.scale.y / primaryDragStart.scale.y : 1,
            primaryDragStart.scale.z !== 0 ? selectedObject.scale.z / primaryDragStart.scale.z : 1
        );

        for (const entry of multiDragStarts) {
            if (entry.object === selectedObject) continue;

            if (currentMode === "translate") {
                entry.object.position.copy(entry.position).add(_multiDeltaPos);
            } else if (currentMode === "rotate") {
                _multiOffset.copy(entry.position).sub(primaryDragStart.position);
                _multiOffset.applyQuaternion(_multiDeltaQuat);
                entry.object.position.copy(selectedObject.position).add(_multiOffset);
                entry.object.quaternion.copy(_multiDeltaQuat).multiply(entry.quaternion);
            } else if (currentMode === "scale") {
                entry.object.scale.set(
                    entry.scale.x * _multiScaleRatio.x,
                    entry.scale.y * _multiScaleRatio.y,
                    entry.scale.z * _multiScaleRatio.z
                );
                _multiOffset.copy(entry.position).sub(primaryDragStart.position);
                _multiOffset.x *= _multiScaleRatio.x;
                _multiOffset.y *= _multiScaleRatio.y;
                _multiOffset.z *= _multiScaleRatio.z;
                entry.object.position.copy(selectedObject.position).add(_multiOffset);
            }

            if (isLabLight(entry.object)) {
                entry.object.userData.lightHelper?.update?.();
            }
        }
    }

    function commitMultiSelectionTransform() {
        if (!multiDragStarts?.length) {
            multiDragStarts = null;
            primaryDragStart = null;
            return;
        }
        for (const entry of multiDragStarts) {
            if (snapByMode[currentMode]) {
                snapMeshByMode(entry.object, currentMode, snapByMode);
            }
            const after = captureObjectState(entry.object);
            if (!objectStatesEqual(entry.state, after)) {
                history.push({
                    type: "transform",
                    object: entry.object,
                    before: entry.state,
                    after,
                });
            }
        }
        multiDragStarts = null;
        primaryDragStart = null;
        transformBefore = null;
    }

    transformControls.addEventListener("dragging-changed", (event) => {
        onGizmoDraggingChange?.(event.value);
        if (event.value && selectedObject) {
            transformBefore = captureObjectState(selectedObject);
            captureMultiDragStarts();
            ignoreClickAfterGizmo = false;
        }
        if (!event.value) {
            // Ignorer le clic suivant seulement après un vrai drag gizmo
            if (transformBefore || multiDragStarts) {
                ignoreClickAfterGizmo = true;
            }
            invalidateLabShadows();
            if (selectedObjects.length > 1 && multiDragStarts) {
                commitMultiSelectionTransform();
                for (const obj of selectedObjects) refreshObjectDisplay(obj);
                syncSelectionOutlines();
            } else if (selectedObject) {
                snapMeshByMode(selectedObject, currentMode, snapByMode);
                refreshObjectDisplay(selectedObject);

                if (transformBefore) {
                    const after = captureObjectState(selectedObject);
                    if (!objectStatesEqual(transformBefore, after)) {
                        history.push({
                            type: "transform",
                            object: selectedObject,
                            before: transformBefore,
                            after,
                        });
                    }
                    transformBefore = null;
                }
            }
            multiDragStarts = null;
            primaryDragStart = null;
        }
    });

    transformControls.addEventListener("objectChange", () => {
        invalidateLabShadows();
        if (!selectedObject) return;
        if (snapByMode[currentMode]) {
            snapMeshByMode(selectedObject, currentMode, snapByMode);
        }
        applyMultiSelectionTransform();
        refreshObjectDisplay(selectedObject);
        for (const helper of selectionHelpers.values()) helper.update();
        if (selectedObject && isLabLight(selectedObject)) {
            selectedObject.userData.lightHelper?.update?.();
        }
    });

    function showStatus(message) {
        statusEl.textContent = message;
        statusEl.classList.add("is-visible");
        window.clearTimeout(statusTimer);
        statusTimer = window.setTimeout(() => {
            statusEl.classList.remove("is-visible");
        }, 2200);
    }

    function refreshSceneRegistry() {
        sceneRegistry?.refresh();
    }

    /** @param {THREE.Object3D} object */
    function registerSceneItem(object) {
        if (!sceneRegistry) return;

        let id = object.userData[SCENE_ITEM_ID_KEY];
        if (!id) {
            if (isLabLight(object)) {
                id = `light-${object.uuid}`;
            } else if (isLabLanding(object)) {
                id = `landing-${object.uuid}`;
            } else if (isLabStair(object)) {
                id = `stair-${object.uuid}`;
            } else if (isLabTube(object)) {
                id = `tube-${object.uuid}`;
            } else if (isLabVegetation(object)) {
                id = `veg-${object.uuid}`;
            } else if (object.userData?.[LAB_IMPORTED_KEY]) {
                id = `import-${object.uuid}`;
            } else if (isLabSphere(object)) {
                id = `sphere-${object.uuid}`;
            } else if (object.userData?.[LAB_SHAPE_KEY]) {
                id = `${object.userData[LAB_SHAPE_KEY]}-${object.uuid}`;
            } else {
                id = `cube-${object.uuid}`;
            }
            object.userData[SCENE_ITEM_ID_KEY] = id;
        }

        if (isLabLight(object)) {
            const type = object.userData.lightType;
            if (!object.userData.sceneItemLabel) {
                lightCounters[type] = (lightCounters[type] || 0) + 1;
                object.userData.sceneItemLabel = `${getLightLabel(type)} ${lightCounters[type]}`;
            }
            sceneRegistry.register({
                id,
                label: object.userData.sceneItemLabel,
                category: "light",
                icon:
                    type === LIGHT_TYPE.SPOT
                        ? "light-spot"
                        : type === LIGHT_TYPE.SUN
                          ? "light-sun"
                          : "light-lamp",
                getVisible: () => isLightSceneVisible(object),
                setVisible: (visible) => {
                    setLightSceneVisible(object, visible);
                    updateObjectVisual(object);
                },
                getIntensity: () => getLightIntensity(object),
                setIntensity: (value) => {
                    setLightIntensity(object, value);
                    contextMenu.syncProperty("light-intensity", value);
                },
                getShadow: () => getLightShadowEnabled(object),
                setShadow: (enabled) => {
                    setLightShadowEnabled(object, enabled);
                    showStatus(enabled ? "Ombres activées (lumière)" : "Ombres désactivées (lumière)");
                },
                getShadowOpacity: () => getLightShadowOpacity(object),
                setShadowOpacity: (value) => {
                    setLightShadowOpacity(object, value);
                },
                select: () => selectObject(object, { highlight: true }),
                onDelete: () => deleteObject(object),
            });
            return;
        }

        if (isLabLanding(object)) {
            if (!object.userData.sceneItemLabel) {
                landingCounter += 1;
                object.userData.sceneItemLabel = `Palier ${landingCounter}`;
            }
            sceneRegistry.register({
                id,
                label: object.userData.sceneItemLabel,
                category: "object",
                icon: "stair",
                getVisible: () => object.visible,
                setVisible: (visible) => {
                    object.visible = visible;
                },
                getShadow: () => getObjectShadowEnabled(object),
                setShadow: (enabled) => {
                    setObjectShadowEnabled(object, enabled);
                    showStatus(enabled ? "Ombres activées (palier)" : "Ombres désactivées (palier)");
                },
                getShadowOpacity: () => getObjectShadowOpacity(object),
                setShadowOpacity: (value) => {
                    setObjectShadowOpacity(object, value);
                },
                select: () => selectObject(object, { highlight: true }),
                onDelete: () => deleteObject(object),
            });
            return;
        }

        if (isLabStair(object)) {
            if (!object.userData.sceneItemLabel) {
                stairCounter += 1;
                object.userData.sceneItemLabel = `Escalier ${stairCounter}`;
            }
            sceneRegistry.register({
                id,
                label: object.userData.sceneItemLabel,
                category: "object",
                icon: "stair",
                getVisible: () => object.visible,
                setVisible: (visible) => {
                    object.visible = visible;
                },
                getShadow: () => getObjectShadowEnabled(object),
                setShadow: (enabled) => {
                    setObjectShadowEnabled(object, enabled);
                    showStatus(enabled ? "Ombres activées (escalier)" : "Ombres désactivées (escalier)");
                },
                getShadowOpacity: () => getObjectShadowOpacity(object),
                setShadowOpacity: (value) => {
                    setObjectShadowOpacity(object, value);
                },
                select: () => selectObject(object, { highlight: true }),
                onDelete: () => deleteObject(object),
            });
            return;
        }

        if (isLabTube(object)) {
            if (!object.userData.sceneItemLabel) {
                tubeCounter += 1;
                object.userData.sceneItemLabel = `Tubulure ${tubeCounter}`;
            }
            sceneRegistry.register({
                id,
                label: object.userData.sceneItemLabel,
                category: "object",
                icon: "stair",
                getVisible: () => object.visible,
                setVisible: (visible) => {
                    object.visible = visible;
                },
                getShadow: () => getObjectShadowEnabled(object),
                setShadow: (enabled) => {
                    setObjectShadowEnabled(object, enabled);
                    showStatus(enabled ? "Ombres activées (tubulure)" : "Ombres désactivées (tubulure)");
                },
                getShadowOpacity: () => getObjectShadowOpacity(object),
                setShadowOpacity: (value) => {
                    setObjectShadowOpacity(object, value);
                },
                select: () => selectObject(object, { highlight: true }),
                onDelete: () => deleteObject(object),
            });
            return;
        }

        if (isLabVegetation(object)) {
            if (!object.userData.sceneItemLabel) {
                vegetationCounter += 1;
                const vegType = getVegetationType(object);
                const assetName = object.userData.vegetationAssetName;
                const label =
                    vegType === "model" && typeof assetName === "string" && assetName
                        ? assetName.replace(/\.(glb|gltf)$/i, "")
                        : VEG_PRESETS[vegType]?.label || "Végétal";
                object.userData.sceneItemLabel = `${label} ${vegetationCounter}`;
            }
            sceneRegistry.register({
                id,
                label: object.userData.sceneItemLabel,
                category: "object",
                icon: "cube",
                getVisible: () => object.visible,
                setVisible: (visible) => {
                    object.visible = visible;
                },
                getShadow: () => getObjectShadowEnabled(object),
                setShadow: (enabled) => {
                    setObjectShadowEnabled(object, enabled);
                    showStatus(enabled ? "Ombres activées (végétal)" : "Ombres désactivées (végétal)");
                },
                getShadowOpacity: () => getObjectShadowOpacity(object),
                setShadowOpacity: (value) => {
                    setObjectShadowOpacity(object, value);
                },
                select: () => selectObject(object, { highlight: true }),
                onDelete: () => deleteObject(object),
            });
            return;
        }

        if (!object.userData.sceneItemLabel) {
            const shape = /** @type {LabShape} */ (object.userData[LAB_SHAPE_KEY] || "box");
            const meta = PRIMITIVE_META[shape] || PRIMITIVE_META.box;
            primitiveCounters[shape] = (primitiveCounters[shape] || 0) + 1;
            if (shape === "box") cubeCounter = primitiveCounters[shape];
            if (shape === "sphere") sphereCounter = primitiveCounters[shape];
            object.userData.sceneItemLabel = `${meta.label} ${primitiveCounters[shape]}`;
        }
        sceneRegistry.register({
            id,
            label: object.userData.sceneItemLabel,
            category: "object",
            icon: "cube",
            getVisible: () => object.visible,
            setVisible: (visible) => {
                object.visible = visible;
            },
            getShadow: () => getObjectShadowEnabled(object),
            setShadow: (enabled) => {
                setObjectShadowEnabled(object, enabled);
                showStatus(enabled ? "Ombres activées (objet)" : "Ombres désactivées (objet)");
            },
            getShadowOpacity: () => getObjectShadowOpacity(object),
            setShadowOpacity: (value) => {
                setObjectShadowOpacity(object, value);
            },
            select: () => selectObject(object, { highlight: true }),
            onDelete: () => deleteObject(object),
        });
    }

    /** @param {THREE.Object3D} object */
    function unregisterSceneItem(object) {
        const id = object.userData?.[SCENE_ITEM_ID_KEY];
        if (id && sceneRegistry) {
            sceneRegistry.unregister(id);
        }
    }

    function isPlayerNode(object) {
        let current = object;
        while (current) {
            if (current === playerRoot) return true;
            current = current.parent;
        }
        return false;
    }

    function isLabObject(object) {
        return object?.userData?.[LAB_OBJECT_KEY] === true && !isPlayerNode(object);
    }

    function isLabSphere(object) {
        return isLabObject(object) && object?.userData?.[LAB_SHAPE_KEY] === "sphere";
    }

    function getLabShape(object) {
        const shape = object?.userData?.[LAB_SHAPE_KEY];
        return isLabPrimitiveShape(shape) ? shape : "box";
    }

    function getPrimitiveSnapshotKind(object) {
        return kindFromShape(getLabShape(object));
    }

    function isEditableEntity(object) {
        if (isPlayerNode(object)) return false;
        return isLabObject(object) || isLabLight(object);
    }

    function registerLabLight(pivot) {
        if (isPlayerNode(pivot)) return pivot;
        pivot.userData.snapToFloor = false;
        if (!editableObjects.includes(pivot)) {
            editableObjects.push(pivot);
        }
        // Ombres projetées automatiquement (désactivables dans le panneau scène).
        if (pivot.userData.shadowEnabled !== false) {
            setLightShadowEnabled(pivot, true);
        }
        attachLightHelper(pivot, scene);
        updateObjectVisual(pivot);
        registerSceneItem(pivot);
        return pivot;
    }

    function registerLabObject(object) {
        if (isPlayerNode(object)) return object;
        object.userData[LAB_OBJECT_KEY] = true;
        if (object.userData[COLLISION_KEY] === undefined) {
            object.userData[COLLISION_KEY] = false;
        }
        // Ombres objet activées par défaut — case « Ombre » du panneau pour retirer.
        if (object.userData.shadowEnabled === undefined) {
            setObjectShadowEnabled(object, true);
        } else {
            setObjectShadowEnabled(object, !!object.userData.shadowEnabled);
        }
        if (isLabVegetation(object)) {
            enableVegetationShadowCasting(object);
            const vegType = getVegetationType(object);
            const foliage = VEG_PRESETS[vegType]?.foliage ?? 0x228b22;
            object.userData[OBJECT_COLOR_KEY] = `#${Number(foliage).toString(16).padStart(6, "0")}`;
        }
        if (object.userData[OBJECT_ROUGHNESS_KEY] === undefined) {
            object.userData[OBJECT_ROUGHNESS_KEY] = DEFAULT_ROUGHNESS;
        }
        if (object.userData[OBJECT_NORMAL_SCALE_KEY] === undefined) {
            object.userData[OBJECT_NORMAL_SCALE_KEY] = DEFAULT_NORMAL_SCALE;
        }
        if (object.userData[OBJECT_TEXTURE_TILE_KEY] === undefined) {
            object.userData[OBJECT_TEXTURE_TILE_KEY] = DEFAULT_TEXTURE_TILE;
        }
        if (object.userData[OBJECT_OPACITY_KEY] === undefined) {
            object.userData[OBJECT_OPACITY_KEY] = DEFAULT_OPACITY;
        }
        if (object.userData[OBJECT_COLOR_KEY] === undefined) {
            object.userData[OBJECT_COLOR_KEY] = DEFAULT_OBJECT_COLOR;
        }
        if (!editableObjects.includes(object)) {
            editableObjects.push(object);
        }
        registerCollidable(object);
        updateObjectVisual(object);
        if (triangulationMode && !isLabLight(object)) {
            setTriangulationOverlayForObject(object, true);
        }
        registerSceneItem(object);
        return object;
    }

    function getObjectColor(object) {
        return object?.userData?.[OBJECT_COLOR_KEY] || DEFAULT_OBJECT_COLOR;
    }

    function isObjectContentMesh(child) {
        return child instanceof THREE.Mesh && child.name !== "shadow-overlay";
    }

    function applyObjectColor(object, colorHex) {
        if (isLabVegetation(object)) return;
        object.userData[OBJECT_COLOR_KEY] = colorHex;
        object.traverse((child) => {
            if (!isObjectContentMesh(child)) return;
            const materials = Array.isArray(child.material) ? child.material : [child.material];
            materials.forEach((material) => material?.color?.set(colorHex));
        });
        updateObjectVisual(object);
    }

    async function setObjectTexture(object, dataUrl) {
        const before = getObjectTextureDataUrl(object);
        if (before === dataUrl) return;

        try {
            await applyObjectTexture(object, dataUrl);
            if (!dataUrl) {
                applyObjectColor(object, getObjectColor(object));
            }
            updateObjectVisual(object);
            history.push({ type: "texture", object, before, after: dataUrl });
            contextMenu.syncProperty("texture", dataUrl);
            showStatus(dataUrl ? "Texture appliquée (UV)" : "Texture retirée");
        } catch (error) {
            showStatus(error instanceof Error ? error.message : "Texture invalide");
        }
    }

    async function setObjectNormalTexture(object, dataUrl) {
        const before = getObjectNormalTextureDataUrl(object);
        if (before === dataUrl) return;

        try {
            await applyObjectNormalTexture(object, dataUrl);
            updateObjectVisual(object);
            history.push({ type: "normal-texture", object, before, after: dataUrl });
            contextMenu.syncProperty("normal-texture", dataUrl);
            showStatus(dataUrl ? "Normal map appliquée" : "Normal map retirée");
        } catch (error) {
            showStatus(error instanceof Error ? error.message : "Normal map invalide");
        }
    }

    function captureMaterialState(object) {
        return {
            glass: isObjectGlassEnabled(object),
            glassRestore: getObjectGlassRestore(object),
            opacity: getObjectOpacity(object),
            roughness: getObjectRoughness(object),
            metalness: getObjectMetalness(object),
        };
    }

    function applyMaterialState(object, state) {
        if (state.glassRestore) {
            object.userData._glassRestore = { ...state.glassRestore };
        } else {
            delete object.userData._glassRestore;
        }
        object.userData[OBJECT_GLASS_KEY] = !!state.glass;
        applyObjectOpacity(object, state.opacity);
        applyObjectRoughness(object, state.roughness);
        applyObjectMetalness(object, state.metalness);
    }

    function setObjectRoughness(object, roughness) {
        const before = captureMaterialState(object);
        const value = Math.max(0, Math.min(1, roughness));
        if (before.roughness === value && !before.glass) return;
        clearObjectGlassOnManualEdit(object);
        applyObjectRoughness(object, value);
        const after = captureMaterialState(object);
        history.push({ type: "material", object, before, after });
        contextMenu.syncProperty("glass", after.glass);
        contextMenu.syncProperty("roughness", after.roughness);
        contextMenu.syncProperty("metalness", after.metalness);
        contextMenu.syncProperty("opacity", after.opacity);
        showStatus(`Rugosité : ${value.toFixed(2)}`);
    }

    function setObjectMetalness(object, metalness) {
        const before = captureMaterialState(object);
        const value = Math.max(0, Math.min(METALNESS_MAX, metalness));
        if (before.metalness === value && !before.glass) return;
        clearObjectGlassOnManualEdit(object);
        applyObjectMetalness(object, value);
        const after = captureMaterialState(object);
        history.push({ type: "material", object, before, after });
        contextMenu.syncProperty("glass", after.glass);
        contextMenu.syncProperty("roughness", after.roughness);
        contextMenu.syncProperty("metalness", after.metalness);
        contextMenu.syncProperty("opacity", after.opacity);
        showStatus(`Métallique : ${value.toFixed(2)}`);
    }

    function setObjectSmooth(object, smooth) {
        const before = getObjectSmooth(object);
        const value = !!smooth;
        applyObjectSmooth(object, value);
        updateObjectVisual(object);
        invalidateLabShadows();
        if (before !== value) {
            history.push({ type: "smooth", object, before, after: value });
        }
        contextMenu.syncProperty("smooth", value);
        showStatus(value ? "Lissage activé (surface interpolée)" : "Lissage désactivé (facettes)");
    }

    function applyMetalPreset(object) {
        const before = captureMaterialState(object);
        clearObjectGlassOnManualEdit(object);
        // Sur escalier : pas de remesh « cube » — seulement PBR métal.
        if (!isLabStair(object) && !isLabLanding(object) && !isLabTube(object)) {
            applyObjectSmooth(object, true);
        } else {
            object.userData[OBJECT_SMOOTH_KEY] = true;
            object.traverse((child) => {
                if (!isObjectContentMesh(child)) return;
                const materials = Array.isArray(child.material) ? child.material : [child.material];
                materials.forEach((material) => {
                    if (!material || !("flatShading" in material)) return;
                    material.flatShading = false;
                    material.needsUpdate = true;
                });
            });
        }
        applyObjectMetalness(object, 1);
        applyObjectRoughness(object, isLabStair(object) || isLabLanding(object) || isLabTube(object) ? 0.12 : 0.18);
        const after = captureMaterialState(object);
        history.push({ type: "material", object, before, after });
        contextMenu.syncProperty("glass", after.glass);
        contextMenu.syncProperty("roughness", after.roughness);
        contextMenu.syncProperty("metalness", after.metalness);
        contextMenu.syncProperty("opacity", after.opacity);
        contextMenu.syncProperty("smooth", true);
        showStatus("Preset métal poli — baissez la rugosité pour plus de chrome");
    }

    function setObjectOpacity(object, opacity) {
        const before = captureMaterialState(object);
        const value = Math.max(OPACITY_MIN, Math.min(OPACITY_MAX, opacity));
        if (before.opacity === value && !before.glass) return;
        clearObjectGlassOnManualEdit(object);
        applyObjectOpacity(object, value);
        const after = captureMaterialState(object);
        history.push({ type: "material", object, before, after });
        contextMenu.syncProperty("glass", after.glass);
        contextMenu.syncProperty("roughness", after.roughness);
        contextMenu.syncProperty("metalness", after.metalness);
        contextMenu.syncProperty("opacity", after.opacity);
        showStatus(`Opacité : ${value.toFixed(2)}`);
    }

    function setObjectGlass(object, enabled) {
        const before = captureMaterialState(object);
        if (before.glass === enabled) return;
        applyObjectGlass(object, enabled);
        const after = captureMaterialState(object);
        history.push({ type: "material", object, before, after });
        contextMenu.syncProperty("glass", after.glass);
        contextMenu.syncProperty("opacity", after.opacity);
        contextMenu.syncProperty("roughness", after.roughness);
        contextMenu.syncProperty("metalness", after.metalness);
        showStatus(enabled ? "Effet verre activé" : "Effet verre désactivé");
    }

    function setObjectNormalScale(object, scale) {
        const before = getObjectNormalScale(object);
        const value = Math.max(0, Math.min(NORMAL_SCALE_MAX, scale));
        if (before === value) return;
        applyObjectNormalScale(object, value);
        history.push({ type: "normal-scale", object, before, after: value });
        contextMenu.syncProperty("normal-scale", value);
        showStatus(`Intensité normale : ${value.toFixed(2)}`);
    }

    function setObjectTextureTile(object, tile) {
        const before = getObjectTextureTile(object);
        const value = Math.max(TEXTURE_TILE_MIN, Math.min(TEXTURE_TILE_MAX, tile));
        if (before === value) return;
        applyObjectTextureTile(object, value);
        history.push({ type: "texture-tile", object, before, after: value });
        contextMenu.syncProperty("texture-tile", value);
        showStatus(`Répétition : ${value.toFixed(2)}×`);
    }

    function updateObjectVisual(object) {
        if (!object) return;

        if (isLabLight(object)) {
            const marker = object.userData.lightMarker;
            if (marker?.material && marker.visible) {
                const type = object.userData.lightType;
                const baseEmissive =
                    type === LIGHT_TYPE.SUN ? 0x664400 : type === LIGHT_TYPE.SPOT ? 0x553300 : 0x444422;
                marker.material.emissive.setHex(
                    shouldShowSelectionHighlight(object) ? EMISSIVE_SELECTED : baseEmissive
                );
            }
            if (object.userData.lightHelper?.visible) {
                object.userData.lightHelper.update?.();
            }
            return;
        }

        const showHighlight = shouldShowSelectionHighlight(object);
        object.traverse((child) => {
            if (!isObjectContentMesh(child)) return;
            if (child.userData?.labVegetationMesh) return;
            const materials = Array.isArray(child.material) ? child.material : [child.material];
            materials.forEach((material) => {
                if (!material?.emissive || material.userData._labFacePaint) return;
                if (material.userData?.labVegetationMaterial) return;
                material.emissive.setHex(showHighlight ? EMISSIVE_SELECTED : 0x000000);
            });
        });
    }

    function setSelectionOutline(object) {
        clearSelectionOutlines();
        if (!object || !shouldShowSelectionHighlight(object)) return;
        const helper = new THREE.BoxHelper(object, 0x22d3ee);
        scene.add(helper);
        selectionHelpers.set(object, helper);
    }

    function applyObjectState(object, state) {
        if (state?.position) object.position.copy(state.position);
        if (state?.quaternion) {
            object.quaternion.copy(state.quaternion);
            object.rotation.setFromQuaternion(object.quaternion, object.rotation.order);
        } else if (state?.rotation) {
            object.rotation.copy(state.rotation);
        }
        if (state?.scale) object.scale.copy(state.scale);

        if (isLabLight(object)) {
            if (state.markerVisible !== undefined) {
                setLightMarkerVisible(object, state.markerVisible);
            }
            if (typeof state.intensity === "number") {
                setLightIntensity(object, state.intensity);
            }
            if (typeof state.spotAngle === "number" && isSpotLight(object)) {
                setLightSpotAngleDeg(object, state.spotAngle);
            }
            if (state.shadowEnabled !== undefined) {
                setLightShadowEnabled(object, !!state.shadowEnabled);
            }
            if (typeof state.shadowOpacity === "number") {
                setLightShadowOpacity(object, state.shadowOpacity);
            }
            updateObjectVisual(object);
            return;
        }

        if (isLabVegetation(object)) {
            object.userData[COLLISION_KEY] = !!state.collisionEnabled;
            if (state.shadowEnabled !== undefined) {
                setObjectShadowEnabled(object, !!state.shadowEnabled);
            }
            if (typeof state.shadowOpacity === "number") {
                setObjectShadowOpacity(object, state.shadowOpacity);
            }
            updateObjectVisual(object);
            return;
        }

        object.userData[COLLISION_KEY] = !!state.collisionEnabled;
        if (isLabStair(object) && typeof state.stairStepCount === "number") {
            const nextCount = clampStairStepCount(state.stairStepCount);
            const nextThickness = clampStairThickness(
                state.stairThickness ?? getStairThickness(object)
            );
            const nextShape = normalizeStairShape(state.stairShape ?? getStairShape(object));
            const nextRadius = clampStairRadius(state.stairRadius ?? getStairRadius(object));
            const nextArc = clampStairArcDeg(state.stairArcDeg ?? getStairArcDeg(object));
            const needsRebuild =
                getStairStepCount(object) !== nextCount ||
                getStairThickness(object) !== nextThickness ||
                getStairShape(object) !== nextShape ||
                getStairRadius(object) !== nextRadius ||
                getStairArcDeg(object) !== nextArc;
            if (needsRebuild) {
                rebuildStairGroup(object, nextCount, {
                    thickness: nextThickness,
                    shape: nextShape,
                    radius: nextRadius,
                    arcDeg: nextArc,
                });
            }
        }
        if (isLabTube(object)) {
            if (typeof state.tubeBendAngle === "number") {
                object.userData[TUBE_BEND_ANGLE_KEY] = state.tubeBendAngle;
            }
            if (typeof state.tubeBendRadius === "number") {
                object.userData[TUBE_BEND_RADIUS_KEY] = state.tubeBendRadius;
            }
            if (state.tubeCaps && typeof state.tubeCaps === "object") {
                object.userData[TUBE_CAPS_KEY] = state.tubeCaps;
            }
            const nextLength = clampTubeLength(state.tubeLength ?? getTubeLength(object));
            const nextRadius = clampTubeRadius(state.tubeRadius ?? getTubeRadius(object));
            const nextWall = clampTubeWall(state.tubeWall ?? getTubeWall(object), nextRadius);
            const needsRebuild =
                getTubeLength(object) !== nextLength ||
                getTubeRadius(object) !== nextRadius ||
                getTubeWall(object) !== nextWall;
            if (needsRebuild) {
                rebuildTubeGroup(object, {
                    length: nextLength,
                    radius: nextRadius,
                    wall: nextWall,
                });
                refreshObjectShadows(object);
                invalidateLabShadows();
            }
        }
        if (state.shadowEnabled !== undefined) {
            setObjectShadowEnabled(object, !!state.shadowEnabled);
        }
        if (typeof state.shadowOpacity === "number") {
            setObjectShadowOpacity(object, state.shadowOpacity);
        }
        if (state.color) {
            applyObjectColor(object, state.color);
        }
        const textureUrl = state.textureDataUrl ?? null;
        const normalTextureUrl = state.normalTextureDataUrl ?? null;
        if (typeof state.roughness === "number") {
            applyObjectRoughness(object, state.roughness);
        }
        if (typeof state.metalness === "number") {
            applyObjectMetalness(object, state.metalness);
        }
        if (typeof state.smooth === "boolean") {
            applyObjectSmooth(object, state.smooth);
        } else {
            applyObjectSmooth(object, DEFAULT_SMOOTH);
        }
        if (typeof state.normalScale === "number") {
            applyObjectNormalScale(object, state.normalScale);
        }
        if (typeof state.opacity === "number") {
            applyObjectOpacity(object, state.opacity);
        }
        if (state.glass) {
            object.userData[OBJECT_GLASS_KEY] = true;
            if (state.glassRestore) {
                object.userData._glassRestore = { ...state.glassRestore };
            }
        } else {
            object.userData[OBJECT_GLASS_KEY] = false;
            delete object.userData._glassRestore;
        }
        applyObjectTexture(object, textureUrl).then(() => {
            applyObjectNormalTexture(object, normalTextureUrl).then(() => {
                const tile = typeof state.textureTile === "number"
                    ? state.textureTile
                    : getObjectTextureTile(object);
                applyObjectTextureTile(object, tile);
                const facePaint =
                    state.facePaint && typeof state.facePaint === "object" ? state.facePaint : null;
                const mesh = !isLabStair(object) && !isLabTube(object) ? getPaintableMesh(object) : null;
                const facePaintPromise =
                    facePaint && mesh ? applyFacePaintData(object, facePaint) : Promise.resolve();
                facePaintPromise.finally(() => {
                    if (!textureUrl && !state.color) updateObjectVisual(object);
                    else updateObjectVisual(object);
                });
            });
        });
    }

    function captureFullSnapshot(object) {
        if (isLabLight(object)) {
            return {
                kind: "light",
                lightType: object.userData.lightType,
                markerVisible: isLightMarkerVisible(object),
                intensity: getLightIntensity(object),
                spotAngle: isSpotLight(object) ? getLightSpotAngleDeg(object) : undefined,
                shadowEnabled: getLightShadowEnabled(object),
                shadowOpacity: getLightShadowOpacity(object),
                ...captureObjectState(object),
            };
        }
        if (isLabLanding(object)) {
            return {
                kind: "landing",
                stairThickness: getLandingThickness(object),
                landingSize: getLandingSize(object),
                landingWidth: getLandingWidth(object),
                landingDepth: getLandingDepth(object),
                ...captureObjectState(object),
                shadowEnabled: getObjectShadowEnabled(object),
                shadowOpacity: getObjectShadowOpacity(object),
                color: getObjectColor(object),
                textureDataUrl: getObjectTextureDataUrl(object),
                normalTextureDataUrl: getObjectNormalTextureDataUrl(object),
                textureTile: getObjectTextureTile(object),
                normalScale: getObjectNormalScale(object),
                roughness: getObjectRoughness(object),
                metalness: getObjectMetalness(object),
                opacity: getObjectOpacity(object),
                glass: isObjectGlassEnabled(object),
                smooth: getObjectSmooth(object),
                glassRestore: isObjectGlassEnabled(object)
                    ? getObjectGlassRestore(object) || undefined
                    : undefined,
            };
        }
        if (isLabStair(object)) {
            return {
                kind: "stair",
                stairStepCount: getStairStepCount(object),
                stairThickness: getStairThickness(object),
                stairShape: getStairShape(object),
                stairRadius: getStairRadius(object),
                stairArcDeg: getStairArcDeg(object),
                ...captureObjectState(object),
                shadowEnabled: getObjectShadowEnabled(object),
                shadowOpacity: getObjectShadowOpacity(object),
                color: getObjectColor(object),
                textureDataUrl: getObjectTextureDataUrl(object),
                normalTextureDataUrl: getObjectNormalTextureDataUrl(object),
                textureTile: getObjectTextureTile(object),
                normalScale: getObjectNormalScale(object),
                roughness: getObjectRoughness(object),
                metalness: getObjectMetalness(object),
                opacity: getObjectOpacity(object),
                glass: isObjectGlassEnabled(object),
                smooth: getObjectSmooth(object),
                glassRestore: isObjectGlassEnabled(object)
                    ? getObjectGlassRestore(object) || undefined
                    : undefined,
            };
        }
        if (isLabTube(object)) {
            const bendAngle = getTubeBendAngle(object);
            const entranceOrigin = isTubeEntranceOrigin(object);
            return {
                kind: "tube",
                tubeLength: getTubeLength(object),
                tubeRadius: getTubeRadius(object),
                tubeWall: getTubeWall(object),
                tubeBendAngle: bendAngle,
                tubeBendRadius: Math.abs(bendAngle) >= 0.5 ? getTubeBendRadius(object) : undefined,
                tubeEntranceOrigin: entranceOrigin || Math.abs(bendAngle) >= 0.5,
                tubeCaps: object.userData?.[TUBE_CAPS_KEY] || undefined,
                ...captureObjectState(object),
                shadowEnabled: getObjectShadowEnabled(object),
                shadowOpacity: getObjectShadowOpacity(object),
                color: getObjectColor(object),
                textureDataUrl: getObjectTextureDataUrl(object),
                normalTextureDataUrl: getObjectNormalTextureDataUrl(object),
                textureTile: getObjectTextureTile(object),
                normalScale: getObjectNormalScale(object),
                roughness: getObjectRoughness(object),
                metalness: getObjectMetalness(object),
                opacity: getObjectOpacity(object),
                glass: isObjectGlassEnabled(object),
                smooth: getObjectSmooth(object),
                glassRestore: isObjectGlassEnabled(object)
                    ? getObjectGlassRestore(object) || undefined
                    : undefined,
            };
        }
        if (isLabVegetation(object)) {
            return {
                kind: "vegetation",
                vegetationType: getVegetationType(object),
                vegetationSeed: object.userData.vegetationSeed,
                vegetationHeight: object.userData.vegetationHeight,
                vegetationAssetId: getVegetationAssetId(object) || undefined,
                vegetationBrightness:
                    typeof object.userData.vegetationBrightness === "number"
                        ? object.userData.vegetationBrightness
                        : undefined,
                ...captureObjectState(object),
                shadowEnabled: getObjectShadowEnabled(object),
                shadowOpacity: getObjectShadowOpacity(object),
            };
        }
        if (object.userData?.[LAB_IMPORTED_KEY]) {
            return {
                kind: "imported",
                importFormat: object.userData.importFormat || "glb",
                importName: object.userData.importName || object.userData.sceneItemLabel || "Import",
                importDataUrl: object.userData.importDataUrl || null,
                ...captureObjectState(object),
                collisionEnabled: !!object.userData[COLLISION_KEY],
                shadowEnabled: getObjectShadowEnabled(object),
                shadowOpacity: getObjectShadowOpacity(object),
            };
        }
        if (object.userData?.labCsg) {
            const csgGeometry = serializeCsgGeometry(object);
            return {
                kind: "csg",
                csgGeometry,
                ...captureObjectState(object),
                shadowEnabled: getObjectShadowEnabled(object),
                shadowOpacity: getObjectShadowOpacity(object),
                color: getObjectColor(object),
                textureDataUrl: getObjectTextureDataUrl(object),
                normalTextureDataUrl: getObjectNormalTextureDataUrl(object),
                textureTile: getObjectTextureTile(object),
                normalScale: getObjectNormalScale(object),
                roughness: getObjectRoughness(object),
                metalness: getObjectMetalness(object),
                opacity: getObjectOpacity(object),
                glass: isObjectGlassEnabled(object),
                smooth: getObjectSmooth(object),
                glassRestore: isObjectGlassEnabled(object)
                    ? getObjectGlassRestore(object) || undefined
                    : undefined,
            };
        }
        return {
            kind: getPrimitiveSnapshotKind(object),
            ...captureObjectState(object),
            shadowEnabled: getObjectShadowEnabled(object),
            shadowOpacity: getObjectShadowOpacity(object),
            color: getObjectColor(object),
            textureDataUrl: getObjectTextureDataUrl(object),
            normalTextureDataUrl: getObjectNormalTextureDataUrl(object),
            textureTile: getObjectTextureTile(object),
            normalScale: getObjectNormalScale(object),
            roughness: getObjectRoughness(object),
            metalness: getObjectMetalness(object),
            opacity: getObjectOpacity(object),
            glass: isObjectGlassEnabled(object),
            smooth: getObjectSmooth(object),
            glassRestore: isObjectGlassEnabled(object)
                ? getObjectGlassRestore(object) || undefined
                : undefined,
            facePaint:
                getLabShape(object) === "box" ? serializeFacePaint(object) : undefined,
        };
    }

    function setObjectColor(object, colorHex) {
        if (isLabVegetation(object)) return;
        const before = getObjectColor(object);
        if (before === colorHex) return;
        applyObjectColor(object, colorHex);
        history.push({ type: "color", object, before, after: colorHex });
        contextMenu.syncProperty("color", colorHex);
        showStatus("Couleur modifiée");
    }

    function disposeObjectResources(object) {
        releaseObjectTexture(object);
        releaseObjectNormalTexture(object);
        disposeFacePaint(object);
        const skipShared =
            isLabVegetation(object) && !!object.userData.vegetationAssetId;
        object.traverse((child) => {
            if (!isObjectContentMesh(child)) return;
            disposeShadowOverlay(child);
            if (skipShared || child.userData?.vegetationSharedResources) {
                if (child.userData?.vegetationOwnsDepthMaterial && child.customDepthMaterial) {
                    child.customDepthMaterial.dispose();
                    child.customDepthMaterial = null;
                }
                if (child.userData?.vegetationClonedMaterials) {
                    const materials = Array.isArray(child.material)
                        ? child.material
                        : [child.material];
                    materials.forEach((material) => material?.dispose?.());
                }
                return;
            }
            child.geometry?.dispose();
            const materials = Array.isArray(child.material) ? child.material : [child.material];
            materials.forEach((material) => material?.dispose?.());
        });
    }

    function removeFromScene(object, { dispose = true } = {}) {
        const selIdx = selectedObjects.indexOf(object);
        if (selIdx >= 0) {
            selectedObjects.splice(selIdx, 1);
            selectedObject = selectedObjects[selectedObjects.length - 1] || null;
            selectionHighlight = selectedObjects.some((obj) => !obj.userData[COLLISION_KEY]);
            syncGizmo();
            syncSelectionOutlines();
            refreshObjectDisplay(selectedObject);
            if (selectedObject) updateObjectVisual(selectedObject);
        }
        scene.remove(object);
        invalidateLabShadows();
        if (isLabLight(object)) {
            detachLightHelper(object, scene);
        }
        const index = editableObjects.indexOf(object);
        if (index !== -1) editableObjects.splice(index, 1);
        unregisterCollidable(object);
        unregisterSceneItem(object);
        if (dispose) {
            if (isLabLight(object)) {
                disposeLightPivot(object, scene);
            } else {
                disposeObjectResources(object);
            }
        }
    }

    function setCollision(object, enabled) {
        if (!!object.userData[COLLISION_KEY] === enabled) return;
        object.userData[COLLISION_KEY] = enabled;
        if (enabled && object === selectedObject) {
            selectionHighlight = false;
        }
        syncSelectionVisuals(object);
        contextMenu.syncProperty("collision", enabled);
        showStatus(
            enabled ? "Collisions activées (joueur)" : "Collisions désactivées"
        );
    }

    function setLightMarkerVisibility(object, visible) {
        if (!isLabLight(object) || isLightMarkerVisible(object) === visible) return;
        setLightMarkerVisible(object, visible);
        updateObjectVisual(object);
        contextMenu.syncProperty("light-marker-visible", visible);
        showStatus(visible ? "Symbole affiché" : "Symbole masqué");
    }

    function setLightIntensityValue(object, intensity) {
        if (!isLabLight(object)) return;
        setLightIntensity(object, intensity);
        contextMenu.syncProperty("light-intensity", intensity);
        showStatus(`Intensité : ${intensity.toFixed(2)}`);
    }

    function setLightSpotAngleValue(object, degrees) {
        if (!isSpotLight(object)) return;
        setLightSpotAngleDeg(object, degrees);
        contextMenu.syncProperty("spot-angle", degrees);
        showStatus(`Angle spot : ${Math.round(degrees)}°`);
    }

    function toggleCollision(object) {
        setCollision(object, !object.userData[COLLISION_KEY]);
    }

    function refreshObjectDisplay(object) {
        if (!object) {
            objectInfoPanel.hidden = true;
            return;
        }

        const formatted = formatObjectTransform(object);
        if (infoPos) infoPos.textContent = formatted.position;
        if (infoRot) infoRot.textContent = formatted.rotation;
        if (infoScale) infoScale.textContent = formatted.scale;
        objectInfoPanel.hidden = false;
    }

    function syncSnapUi() {
        snapBtns.forEach((btn) => {
            const mode = btn.dataset.snapMode;
            const snapped = !!snapByMode[mode];
            btn.classList.toggle("is-snapped", snapped);
            btn.setAttribute("aria-pressed", snapped ? "true" : "false");
            btn.title = snapped ? "Calé (grille / 10° / 1 m)" : "Positionnement libre";
        });
        applyTransformSnap(transformControls, snapByMode);
    }

    function syncGizmo() {
        if (gizmoActive && selectedObject) {
            transformControls.attach(selectedObject);
            transformControls.setMode(currentMode);
            transformControls.setSpace(currentMode === "translate" ? "world" : "local");
            transformControls.visible = true;
            applyTransformSnap(transformControls, snapByMode);
        } else {
            transformControls.detach();
            transformControls.visible = false;
        }
    }

    function syncModeUi() {
        modeBtns.forEach((btn) => {
            const mode = btn.dataset.mode;
            if (mode === "none") {
                btn.classList.toggle("is-active", !gizmoActive);
            } else {
                btn.classList.toggle("is-active", gizmoActive && mode === currentMode);
            }
        });
    }

    function setSelectionOnlyMode() {
        gizmoActive = false;
        syncGizmo();
        syncModeUi();
    }

    function setTransformMode(mode) {
        if (mode !== "translate" && mode !== "rotate" && mode !== "scale") return;
        gizmoActive = true;
        currentMode = mode;
        transformControls.setMode(mode);
        transformControls.setSpace(mode === "translate" ? "world" : "local");
        syncGizmo();
        syncModeUi();
    }

    modeBtns.forEach((btn) => {
        btn.addEventListener("click", (e) => {
            e.stopPropagation();
            const mode = btn.dataset.mode;
            if (mode === "none") {
                setSelectionOnlyMode();
            } else if (mode === "translate" || mode === "rotate" || mode === "scale") {
                setTransformMode(mode);
            }
        });
    });

    snapBtns.forEach((btn) => {
        btn.addEventListener("click", (e) => {
            e.stopPropagation();
            const mode = btn.dataset.snapMode;
            if (!mode || !(mode in snapByMode)) return;
            snapByMode[mode] = !snapByMode[mode];
            syncSnapUi();
            if (selectedObject) {
                snapMeshByMode(selectedObject, mode, snapByMode);
                refreshObjectDisplay(selectedObject);
            }
        });
    });

    syncSnapUi();
    syncModeUi();

    function createPrimitiveObject(shape) {
        const resolved = isLabPrimitiveShape(shape) ? shape : "box";
        const pivot = new THREE.Group();
        const materialOpts = {
            color: DEFAULT_OBJECT_COLOR,
            roughness: DEFAULT_ROUGHNESS,
            metalness: 0.05,
            flatShading: false,
            envMapIntensity: 1.15,
        };
        if (resolved === "panel") {
            materialOpts.side = THREE.DoubleSide;
        }
        const mesh = new THREE.Mesh(
            createPrimitiveGeometry(resolved, DEFAULT_SMOOTH),
            new THREE.MeshStandardMaterial(materialOpts)
        );
        pivot.add(mesh);
        pivot.userData[OBJECT_COLOR_KEY] = DEFAULT_OBJECT_COLOR;
        pivot.userData[LAB_SHAPE_KEY] = resolved;
        pivot.userData[OBJECT_SMOOTH_KEY] = DEFAULT_SMOOTH;
        const registered = registerLabObject(pivot);
        applyObjectSmooth(registered, DEFAULT_SMOOTH);
        return registered;
    }

    function createCubeObject() {
        return createPrimitiveObject("box");
    }

    function createSphereObject() {
        return createPrimitiveObject("sphere");
    }

    function createStairObject(stepCount = STAIR_DEFAULT_STEP_COUNT, options = {}) {
        const steps = clampStairStepCount(stepCount);
        const pivot = buildStairGroup(steps, { color: DEFAULT_STAIR_COLOR, ...options });
        pivot.userData[OBJECT_COLOR_KEY] = options.color || DEFAULT_STAIR_COLOR;
        pivot.userData[COLLISION_KEY] = true;
        return registerLabObject(pivot);
    }

    function createLandingObject(options = {}) {
        const pivot = buildLandingGroup({
            color: options.color || DEFAULT_STAIR_COLOR,
            thickness: options.thickness,
            size: options.size,
            width: options.width,
            depth: options.depth,
            roughness: options.roughness,
            metalness: options.metalness,
        });
        pivot.userData[OBJECT_COLOR_KEY] = options.color || DEFAULT_STAIR_COLOR;
        pivot.userData[COLLISION_KEY] = true;
        return registerLabObject(pivot);
    }

    function createTubeObject(options = {}) {
        const pivot = buildTubeGroup({
            color: options.color || DEFAULT_TUBE_COLOR,
            length: options.length,
            radius: options.radius,
            wall: options.wall,
            roughness: options.roughness,
            metalness: options.metalness,
        });
        // Horizontale par défaut (longueur sur Z) ; orientable ensuite à tout angle (gizmo R).
        if (!options.keepOrientation) {
            pivot.rotation.x = Math.PI / 2;
        }
        pivot.userData[OBJECT_COLOR_KEY] = options.color || DEFAULT_TUBE_COLOR;
        pivot.userData[COLLISION_KEY] = true;
        return registerLabObject(pivot);
    }

    function createPrimitiveFromSnapshot(snapshot) {
        const shape = shapeFromKind(snapshot.kind);
        const object = createPrimitiveObject(shape);
        applyObjectState(object, snapshot);
        return object;
    }

    function createCubeFromSnapshot(snapshot) {
        return createPrimitiveFromSnapshot({ ...snapshot, kind: "cube" });
    }

    function createSphereFromSnapshot(snapshot) {
        return createPrimitiveFromSnapshot({ ...snapshot, kind: "sphere" });
    }

    function createStairFromSnapshot(snapshot) {
        const stepCount = clampStairStepCount(snapshot.stairStepCount ?? STAIR_DEFAULT_STEP_COUNT);
        const object = createStairObject(stepCount, {
            thickness: snapshot.stairThickness,
            shape: snapshot.stairShape,
            radius: snapshot.stairRadius,
            arcDeg: snapshot.stairArcDeg,
        });
        applyObjectState(object, snapshot);
        return object;
    }

    function createLandingFromSnapshot(snapshot) {
        const object = createLandingObject({
            thickness: snapshot.stairThickness,
            size: snapshot.landingSize,
            width: snapshot.landingWidth,
            depth: snapshot.landingDepth,
            color: snapshot.color,
            roughness: snapshot.roughness,
            metalness: snapshot.metalness,
        });
        applyObjectState(object, snapshot);
        return object;
    }

    function createTubeFromSnapshot(snapshot) {
        const bendAngle = Number(snapshot.tubeBendAngle) || 0;
        const entranceOrigin = !!snapshot.tubeEntranceOrigin || Math.abs(bendAngle) >= 0.5;
        const color = snapshot.color || DEFAULT_TUBE_COLOR;
        /** @type {THREE.Object3D} */
        let object;
        if (entranceOrigin || Math.abs(bendAngle) >= 0.5) {
            const pivot = buildBentTubeGroup({
                length: snapshot.tubeLength,
                radius: snapshot.tubeRadius,
                wall: snapshot.tubeWall,
                color,
                roughness: snapshot.roughness,
                metalness: snapshot.metalness,
                bendAngleDeg: bendAngle,
                bendRadius: snapshot.tubeBendRadius,
            });
            if (snapshot.tubeCaps) {
                pivot.userData[TUBE_CAPS_KEY] = snapshot.tubeCaps;
            }
            if (typeof snapshot.tubeBendRadius === "number") {
                pivot.userData[TUBE_BEND_RADIUS_KEY] = snapshot.tubeBendRadius;
            }
            pivot.userData[TUBE_BEND_ANGLE_KEY] = bendAngle;
            pivot.userData[OBJECT_COLOR_KEY] = color;
            pivot.userData[COLLISION_KEY] = true;
            object = registerLabObject(pivot);
        } else {
            object = createTubeObject({
                length: snapshot.tubeLength,
                radius: snapshot.tubeRadius,
                wall: snapshot.tubeWall,
                color,
                roughness: snapshot.roughness,
                metalness: snapshot.metalness,
            });
        }
        applyObjectState(object, snapshot);
        return object;
    }

    function createVegetationFromSnapshot(snapshot) {
        const type = VEG_TYPES.includes(snapshot.vegetationType)
            ? snapshot.vegetationType
            : "tree";
        const object = createVegetationObject(type, {
            seed: snapshot.vegetationSeed,
            height: snapshot.vegetationHeight,
            assetId: snapshot.vegetationAssetId,
            brightness: snapshot.vegetationBrightness,
        });
        object.userData[COLLISION_KEY] = !!snapshot.collisionEnabled;
        registerLabObject(object);
        applyObjectState(object, snapshot);
        return object;
    }

    function createCsgFromSnapshot(snapshot) {
        if (!snapshot.csgGeometry) {
            return createCubeFromSnapshot({ ...snapshot, kind: "cube" });
        }
        const object = createCsgPivotFromGeometry(snapshot.csgGeometry, {
            color: snapshot.color,
            roughness: snapshot.roughness,
            metalness: snapshot.metalness,
        });
        object.userData[OBJECT_COLOR_KEY] = snapshot.color || DEFAULT_OBJECT_COLOR;
        object.userData[OBJECT_SMOOTH_KEY] =
            typeof snapshot.smooth === "boolean" ? snapshot.smooth : DEFAULT_SMOOTH;
        registerLabObject(object);
        applyObjectState(object, snapshot);
        return object;
    }

    /**
     * @param {string} dataUrl
     * @param {string} format
     */
    function importedTemplateKey(dataUrl, format) {
        return `${format}:${dataUrl.length}:${dataUrl.slice(0, 48)}:${dataUrl.slice(-24)}`;
    }

    /**
     * @param {string} dataUrl
     * @param {string} format
     * @returns {Promise<THREE.Object3D>}
     */
    async function ensureImportedTemplate(dataUrl, format) {
        const key = importedTemplateKey(dataUrl, format);
        const cached = importedTemplateCache.get(key);
        if (cached) return cached;
        const template = await loadModelFromDataUrl(dataUrl, /** @type {any} */ (format));
        importedTemplateCache.set(key, template);
        return template;
    }

    /**
     * @param {THREE.Object3D} content
     * @param {{ name?: string, format?: string, dataUrl?: string | null, label?: string }} meta
     */
    function createImportedPivot(content, meta = {}) {
        const pivot = new THREE.Group();
        const name = meta.name || meta.label || "Import";
        pivot.name = name;
        pivot.userData[LAB_IMPORTED_KEY] = true;
        pivot.userData[LAB_SHAPE_KEY] = "imported";
        pivot.userData.importFormat = meta.format || "glb";
        pivot.userData.importName = name;
        pivot.userData.importDataUrl = meta.dataUrl || null;
        importedCounter += 1;
        pivot.userData.sceneItemLabel = `${name}`;
        content.name = "import-content";
        pivot.add(content);
        registerLabObject(pivot);
        return pivot;
    }

    function createImportedFromSnapshot(snapshot) {
        const format = snapshot.importFormat || "glb";
        const dataUrl = snapshot.importDataUrl || null;
        const name = snapshot.importName || "Import";
        let content = new THREE.Group();
        if (dataUrl) {
            const key = importedTemplateKey(dataUrl, format);
            const template = importedTemplateCache.get(key);
            if (template) content = template.clone(true);
        }
        const object = createImportedPivot(content, {
            name,
            format,
            dataUrl,
        });
        object.userData[COLLISION_KEY] = !!snapshot.collisionEnabled;
        applyObjectState(object, snapshot);
        if (dataUrl && !importedTemplateCache.has(importedTemplateKey(dataUrl, format))) {
            void ensureImportedTemplate(dataUrl, format).then((template) => {
                while (object.children.length) object.remove(object.children[0]);
                object.add(template.clone(true));
                invalidateLabShadows();
                updateObjectVisual(object);
            });
        }
        return object;
    }

    /**
     * @param {File} file
     * @param {THREE.Vector3} [position]
     */
    async function spawnImportedModelFile(file, position) {
        const loaded = await loadModelFromFile(file);
        const key = importedTemplateKey(loaded.dataUrl, loaded.format);
        importedTemplateCache.set(key, loaded.root.clone(true));
        const pivot = createImportedPivot(loaded.root, {
            name: loaded.name,
            format: loaded.format,
            dataUrl: loaded.dataUrl,
        });
        const placed = addObjectAt(pivot, position ?? spawnPoint());
        showStatus(`Importé : ${loaded.name} (${loaded.format.toUpperCase()})`);
        return placed;
    }

    function createObjectFromSnapshot(snapshot) {
        if (snapshot.kind === "light") {
            const pivot = createLightPivot(snapshot.lightType);
            registerLabLight(pivot);
            pivot.position.copy(snapshot.position);
            if (snapshot.quaternion) {
                pivot.quaternion.copy(snapshot.quaternion);
                pivot.rotation.setFromQuaternion(pivot.quaternion, pivot.rotation.order);
            } else {
                pivot.rotation.copy(snapshot.rotation);
            }
            pivot.scale.copy(snapshot.scale);
            setLightMarkerVisible(pivot, snapshot.markerVisible !== false);
            if (typeof snapshot.intensity === "number") {
                setLightIntensity(pivot, snapshot.intensity);
            }
            if (typeof snapshot.spotAngle === "number" && isSpotLight(pivot)) {
                setLightSpotAngleDeg(pivot, snapshot.spotAngle);
            }
            if (snapshot.shadowEnabled !== undefined) {
                setLightShadowEnabled(pivot, !!snapshot.shadowEnabled);
            }
            if (typeof snapshot.shadowOpacity === "number") {
                setLightShadowOpacity(pivot, snapshot.shadowOpacity);
            }
            return pivot;
        }
        if (snapshot.kind === "stair") {
            return createStairFromSnapshot(snapshot);
        }
        if (snapshot.kind === "landing") {
            return createLandingFromSnapshot(snapshot);
        }
        if (snapshot.kind === "tube") {
            return createTubeFromSnapshot(snapshot);
        }
        if (snapshot.kind === "vegetation") {
            return createVegetationFromSnapshot(snapshot);
        }
        if (snapshot.kind === "imported") {
            return createImportedFromSnapshot(snapshot);
        }
        if (snapshot.kind === "csg") {
            return createCsgFromSnapshot(snapshot);
        }
        if (
            snapshot.kind === "sphere" ||
            snapshot.kind === "pyramid" ||
            snapshot.kind === "cylinder" ||
            snapshot.kind === "cone" ||
            snapshot.kind === "torus" ||
            snapshot.kind === "panel" ||
            snapshot.kind === "cube"
        ) {
            return createPrimitiveFromSnapshot(snapshot);
        }
        return createCubeFromSnapshot(snapshot);
    }

    function removeAllObjects() {
        const objects = [...editableObjects];
        for (const object of objects) {
            removeFromScene(object);
        }
        terrainController?.clear?.({ recordHistory: false });
        oceanController?.remove?.({ recordHistory: false });
        skyboxController?.clear?.();
        deselectObject();
    }

    function exportSceneDocument() {
        /** @type {string[]} */
        const assetIds = [];
        for (const object of editableObjects) {
            const id = getVegetationAssetId(object);
            if (id && !assetIds.includes(id)) assetIds.push(id);
        }
        const assets = serializeVegetationAssets(assetIds);
        return buildSceneDocument(
            editableObjects.map((object) => serializeObjectSnapshot(captureFullSnapshot(object))),
            {
                name: getCurrentSceneFileName() || "",
                terrain: terrainController?.serialize() || null,
                ocean: oceanController?.serialize() || null,
                skybox: skyboxController?.serialize?.() || null,
                vegetationAssets: Object.keys(assets).length ? assets : null,
            }
        );
    }

    async function importSceneDocument(data, { fileName = null } = {}) {
        try {
            const snapshots = parseSceneDocument(data);
            const doc =
                data && typeof data === "object"
                    ? /** @type {{ terrain?: unknown, ocean?: unknown, skybox?: unknown, vegetationAssets?: unknown }} */ (
                          data
                      )
                    : null;
            if (doc?.vegetationAssets) {
                await hydrateVegetationAssets(doc.vegetationAssets);
                syncVegetationModelUi();
            }
            removeAllObjects();
            cubeCounter = 0;
            sphereCounter = 0;
            for (const key of Object.keys(primitiveCounters)) {
                delete primitiveCounters[key];
            }
            stairCounter = 0;
            landingCounter = 0;
            tubeCounter = 0;
            vegetationCounter = 0;
            importedCounter = 0;
            lightCounters.spot = 0;
            lightCounters.directional = 0;
            lightCounters.point = 0;
            for (const snapshot of snapshots) {
                if (snapshot.kind === "imported" && snapshot.importDataUrl) {
                    try {
                        await ensureImportedTemplate(
                            snapshot.importDataUrl,
                            snapshot.importFormat || "glb"
                        );
                    } catch (error) {
                        console.warn("[lab-import] restauration modèle :", error);
                    }
                }
                addObjectFromSnapshot(snapshot, { recordHistory: false, select: false });
            }
            void terrainController?.deserialize(doc?.terrain ?? null);
            void oceanController?.deserialize(doc?.ocean ?? null);
            void skyboxController?.deserialize?.(doc?.skybox ?? null);
            reconcileEditableObjects();
            refreshSceneRegistry();
            if (fileName) {
                setCurrentSceneFileName(fileName);
            }
            deselectObject();
            showStatus(fileName ? `Scène ouverte : ${fileName}` : "Scène ouverte");
        } catch (error) {
            showStatus(error instanceof Error ? error.message : "Impossible d'ouvrir la scène");
        }
    }

    function resetSceneFileState() {
        clearSceneFileSession();
    }

    async function newScene({ confirmIfNotEmpty = true } = {}) {
        if (confirmIfNotEmpty && (editableObjects.length > 0 || terrainController?.hasTerrain() || oceanController?.isActive?.())) {
            const ok = await labConfirm(
                "Créer une nouvelle scène ? Les modifications non enregistrées seront perdues.",
                { title: "Nouvelle scène", confirmLabel: "Créer" }
            );
            if (!ok) return;
        }
        removeAllObjects();
        resetSceneFileState();
        showStatus("Nouvelle scène");
    }

    async function openSceneFromDisk() {
        try {
            const picked = await openSceneFromDiskLocation();
            if (!picked) return;

            if (editableObjects.length > 0 || terrainController?.hasTerrain() || oceanController?.isActive?.()) {
                const ok = await labConfirm(
                    "Ouvrir un fichier du disque ? La scène actuelle non enregistrée sera remplacée.",
                    { title: "Ouvrir depuis le disque", confirmLabel: "Continuer" }
                );
                if (!ok) return;
            }

            void importSceneDocument(picked.data, { fileName: picked.name });
        } catch (error) {
            if (/** @type {DOMException} */ (error).name === "AbortError") return;
            showStatus(error instanceof Error ? error.message : "Impossible d'ouvrir le fichier");
        }
    }

    async function openScene() {
        try {
            /** @type {Promise<{ name: string, data: object } | null> | null} */
            let pendingDiskPick = null;
            const scenes = await listSavedScenes();
            const pickedName = await labPickScene(
                scenes.map(({ name, updatedAt }) => ({ name, updatedAt })),
                {
                    onPickDiskFile: () => {
                        pendingDiskPick = openSceneFromDiskLocation();
                    },
                }
            );

            if (pendingDiskPick) {
                const picked = await pendingDiskPick;
                if (!picked) return;
                if (editableObjects.length > 0 || terrainController?.hasTerrain() || oceanController?.isActive?.()) {
                    const ok = await labConfirm(
                        "Ouvrir un fichier du disque ? La scène actuelle non enregistrée sera remplacée.",
                        { title: "Ouvrir depuis le disque", confirmLabel: "Continuer" }
                    );
                    if (!ok) return;
                }
                void importSceneDocument(picked.data, { fileName: picked.name });
                return;
            }

            if (!pickedName) return;

            if (editableObjects.length > 0 || terrainController?.hasTerrain() || oceanController?.isActive?.()) {
                const ok = await labConfirm(
                    "Ouvrir une scène ? La scène actuelle non enregistrée sera remplacée.",
                    { title: "Ouvrir", confirmLabel: "Continuer" }
                );
                if (!ok) return;
            }

            const data = await loadSceneFromLibrary(pickedName);
            if (!data) {
                showStatus("Scène introuvable dans la bibliothèque.");
                return;
            }

            void importSceneDocument(data, { fileName: pickedName });
        } catch (error) {
            if (/** @type {DOMException} */ (error).name === "AbortError") return;
            showStatus(error instanceof Error ? error.message : "Impossible d'ouvrir la scène");
        }
    }

    async function saveScene({ forceSaveAs = false } = {}) {
        const doc = exportSceneDocument();

        if (hasDiskFileHandle() && !forceSaveAs) {
            try {
                const result = await saveSceneToDiskLocation(doc, { saveAs: false });
                showStatus(`Enregistré sur le disque : ${result.name}`);
                return;
            } catch (error) {
                if (/** @type {DOMException} */ (error).name === "AbortError") return;
                showStatus(error instanceof Error ? error.message : "Impossible d'enregistrer sur le disque");
                return;
            }
        }

        try {
            const result = await writeSceneToLibrary(doc, {
                saveAs: forceSaveAs,
                suggestedName: getCurrentSceneFileName(),
                askName: (suggested) =>
                    labPrompt("Nom de la scène (bibliothèque locale) :", {
                        title: forceSaveAs ? "Enregistrer sous" : "Enregistrer",
                        defaultValue: suggested.replace(/\.json$/i, ""),
                        confirmLabel: "Enregistrer",
                    }),
            });
            showStatus(`Scène enregistrée : ${result.name}`);
        } catch (error) {
            if (/** @type {DOMException} */ (error).name === "AbortError") return;
            showStatus(error instanceof Error ? error.message : "Impossible d'enregistrer");
        }
    }

    async function saveSceneAs() {
        await saveScene({ forceSaveAs: true });
    }

    async function saveSceneToDisk() {
        try {
            const result = await saveSceneToDiskLocation(exportSceneDocument(), {
                saveAs: true,
                suggestedName: getCurrentSceneFileName(),
            });
            showStatus(
                result.onDisk
                    ? `Enregistré sur le disque : ${result.name}`
                    : `Téléchargé : ${result.name}`
            );
        } catch (error) {
            if (/** @type {DOMException} */ (error).name === "AbortError") return;
            showStatus(error instanceof Error ? error.message : "Impossible d'enregistrer sur le disque");
        }
    }

    async function closeScene() {
        if (editableObjects.length > 0 || terrainController?.hasTerrain() || oceanController?.isActive?.()) {
            const ok = await labConfirm(
                "Fermer la scène ? Les modifications non enregistrées seront perdues.",
                { title: "Fermer", confirmLabel: "Fermer" }
            );
            if (!ok) return;
        }
        removeAllObjects();
        resetSceneFileState();
        showStatus("Scène fermée");
    }

    function selectObject(object, { highlight = true, additive = false } = {}) {
        if (!object) {
            deselectObject();
            return;
        }

        const previous = [...selectedObjects];

        if (additive) {
            const idx = selectedObjects.indexOf(object);
            if (idx >= 0) {
                selectedObjects.splice(idx, 1);
            } else {
                selectedObjects.push(object);
            }
        } else {
            selectedObjects = [object];
        }

        selectedObject = selectedObjects[selectedObjects.length - 1] || null;
        selectionHighlight = selectedObjects.some((obj) => !obj.userData[COLLISION_KEY]);

        for (const prev of previous) {
            if (!isObjectSelected(prev)) updateObjectVisual(prev);
        }
        for (const selected of selectedObjects) {
            updateObjectVisual(selected);
        }

        syncSelectionOutlines();
        syncGizmo();
        refreshObjectDisplay(selectedObject);
        notifyOrbitTarget();
    }

    function deselectObject() {
        const previous = [...selectedObjects];
        selectedObject = null;
        selectedObjects = [];
        selectionHighlight = false;
        syncGizmo();
        clearSelectionOutlines();
        for (const prev of previous) updateObjectVisual(prev);
        refreshObjectDisplay(null);
        contextMenu.hide();
        notifyOrbitTarget();
    }

    function addObjectToScene(object, { select = true, recordHistory = true, highlight = false } = {}) {
        scene.add(object);
        invalidateLabShadows();
        if (recordHistory) {
            history.push({ type: "add", object });
        }
        if (select) selectObject(object, { highlight });
        return object;
    }

    /** Ajoute un objet en conservant position, rotation et échelle du snapshot (copier-coller). */
    function addObjectFromSnapshot(snapshot, options = {}) {
        const object = createObjectFromSnapshot(snapshot);
        return addObjectToScene(object, options);
    }

    function addObjectAt(object, position, options = {}) {
        object.position.copy(snapPlacement(position));
        snapMeshToFloor(object);
        if (snapByMode.translate) snapMeshTranslate(object, { includeY: false });
        return addObjectToScene(object, options);
    }

    function spawnLightAt(type, position, options = {}) {
        const pivot = createLightPivot(type);
        registerLabLight(pivot);
        const pos = position ?? spawnPoint();
        pos.y = Math.max(pos.y, type === LIGHT_TYPE.SUN ? 4 : 2.5);
        pivot.position.copy(snapPlacement(pos));
        if (snapByMode.translate) {
            pivot.position.y = snapValue(pivot.position.y, GRID_STEP);
        }
        return addObjectToScene(pivot, options);
    }

    function spawnCubeAt(position, options = {}) {
        return addObjectAt(createPrimitiveObject("box"), position ?? spawnPoint(), options);
    }

    function spawnSphereAt(position, options = {}) {
        return addObjectAt(createPrimitiveObject("sphere"), position ?? spawnPoint(), options);
    }

    /**
     * @param {import("./lab-primitives.js").LabPrimitiveShape} shape
     * @param {THREE.Vector3} [position]
     * @param {object} [options]
     */
    function spawnPrimitiveAt(shape, position, options = {}) {
        return addObjectAt(createPrimitiveObject(shape), position ?? spawnPoint(), options);
    }

    function spawnStairAt(position, stepCount = STAIR_DEFAULT_STEP_COUNT, options = {}) {
        const object = addObjectAt(
            createStairObject(stepCount),
            position ?? spawnPoint(),
            options
        );
        const steps = getStairStepCount(object);
        const height = getStairTotalHeight(steps, getStairThickness(object));
        showStatus(
            `Escalier ajouté — ${steps} marches, hauteur totale ${height.toFixed(2).replace(".", ",")} m`
        );
        return object;
    }

    function spawnTubeAt(position, options = {}) {
        const object = addObjectAt(createTubeObject(options), position ?? spawnPoint(), options);
        const length = getTubeLength(object);
        const radius = getTubeRadius(object);
        const wall = getTubeWall(object);
        showStatus(
            `Tubulure ajoutée — L ${length.toFixed(2).replace(".", ",")} m, R ${radius.toFixed(2).replace(".", ",")} m, paroi ${wall.toFixed(3).replace(".", ",")} m`
        );
        return object;
    }

    /**
     * Duplique l'apparence matériau complète d'une tubulure vers une autre.
     * @param {THREE.Object3D} source
     * @param {THREE.Object3D} target
     */
    async function copyTubeAppearance(source, target) {
        const color = getObjectColor(source);
        const roughness = getObjectRoughness(source);
        const metalness = getObjectMetalness(source);
        const opacity = getObjectOpacity(source);
        const smooth = getObjectSmooth(source);
        const normalScale = getObjectNormalScale(source);
        const textureTile = getObjectTextureTile(source);
        const textureDataUrl = getObjectTextureDataUrl(source);
        const normalTextureDataUrl = getObjectNormalTextureDataUrl(source);
        const glass = isObjectGlassEnabled(source);
        const glassRestore = getObjectGlassRestore(source);

        target.userData[OBJECT_COLOR_KEY] = color;
        applyObjectColor(target, color);
        applyObjectRoughness(target, roughness);
        applyObjectMetalness(target, metalness);
        applyObjectOpacity(target, opacity);
        applyObjectSmooth(target, smooth);
        applyObjectNormalScale(target, normalScale);

        await applyObjectTexture(target, textureDataUrl ?? null);
        await applyObjectNormalTexture(target, normalTextureDataUrl ?? null);
        applyObjectTextureTile(target, textureTile);
        applyObjectNormalScale(target, normalScale);
        if (!textureDataUrl) {
            applyObjectColor(target, color);
        }

        target.userData[OBJECT_GLASS_KEY] = glass;
        if (glassRestore) {
            target.userData._glassRestore = { ...glassRestore };
        } else {
            delete target.userData._glassRestore;
        }
        updateObjectVisual(target);
    }

    /**
     * Prolongement depuis une extrémité (±). Coude arrondi si angle ≠ 0.
     * @param {THREE.Object3D} fromTube
     * @param {1 | -1} endSign
     * @param {{ length?: number, yaw?: number, pitch?: number, bendRadius?: number }} [detail]
     */
    async function continueTubeAction(fromTube, endSign, detail = {}) {
        if (!isLabTube(fromTube)) {
            showStatus("Sélectionnez une tubulure");
            return null;
        }
        const length = clampTubeLength(detail.length ?? getTubeLength(fromTube));
        const yawRaw = Number(detail.yaw);
        const pitchRaw = Number(detail.pitch);
        const yaw = Number.isFinite(yawRaw) ? yawRaw : 0;
        const pitch = Number.isFinite(pitchRaw) ? pitchRaw : 0;
        const radius = getTubeRadius(fromTube);
        const wall = getTubeWall(fromTube);
        const color = getObjectColor(fromTube);
        const roughness = getObjectRoughness(fromTube);
        const metalness = getObjectMetalness(fromTube);

        const end = getTubeEndWorld(fromTube, endSign);
        const outDir = computeTubeExitDirection(end.direction, yaw, pitch);
        const bendAngleDeg = THREE.MathUtils.radToDeg(end.direction.angleTo(outDir));
        const bendRadius = clampTubeBendRadius(detail.bendRadius, radius);

        const pivot = buildBentTubeGroup({
            length,
            radius,
            wall,
            color,
            roughness,
            metalness,
            bendAngleDeg,
            bendRadius,
        });
        pivot.userData[OBJECT_COLOR_KEY] = color;
        pivot.userData[COLLISION_KEY] = true;
        const next = registerLabObject(pivot);
        placeTubeContinued(fromTube, next, endSign, yaw, pitch);
        try {
            await copyTubeAppearance(fromTube, next);
        } catch {
            // La géométrie reste valide même si une texture source est indisponible.
        }
        addObjectToScene(next, { recordHistory: true, select: true, highlight: true });
        void refreshStairAppearance(next);
        contextMenu.hide();
        const endLabel = endSign > 0 ? "+" : "−";
        const bendLabel =
            Math.abs(bendAngleDeg) >= 0.5
                ? `, coude ${bendAngleDeg.toFixed(0)}°`
                : "";
        showStatus(
            `Tubulure prolongée (bout ${endLabel}) — L ${length.toFixed(2).replace(".", ",")} m, H ${yaw}°, V ${pitch}°${bendLabel}`
        );
        return next;
    }

    /**
     * Ajoute un palier sur la dernière marche de l’escalier sélectionné.
     * @param {THREE.Object3D} stair
     */
    function addLandingAfterStairAction(stair) {
        if (!isLabStair(stair)) {
            showStatus("Sélectionnez un escalier");
            return null;
        }
        const landing = createLandingObject({
            thickness: getStairThickness(stair),
            color: getObjectColor(stair),
            roughness: getObjectRoughness(stair),
            metalness: getObjectMetalness(stair),
        });
        placeLandingAfterStair(stair, landing);
        addObjectToScene(landing, { recordHistory: true, select: true, highlight: true });
        void refreshStairAppearance(landing);
        contextMenu.hide();
        showStatus("Palier ajouté — clic droit dessus pour une volée à +90°, −90° ou 180°");
        return landing;
    }

    /**
     * Nouvelle volée depuis un palier.
     * @param {THREE.Object3D} landing
     * @param {90 | -90 | 180} turnDeg
     */
    function continueStairFromLandingAction(landing, turnDeg) {
        if (!isLabLanding(landing)) {
            showStatus("Sélectionnez un palier");
            return null;
        }
        const stair = createStairObject(STAIR_DEFAULT_STEP_COUNT, {
            thickness: getLandingThickness(landing),
            color: getObjectColor(landing),
            roughness: getObjectRoughness(landing),
            metalness: getObjectMetalness(landing),
            shape: "straight",
        });
        placeStairAfterLanding(landing, stair, turnDeg);
        addObjectToScene(stair, { recordHistory: true, select: true, highlight: true });
        void refreshStairAppearance(stair);
        contextMenu.hide();
        showStatus(
            turnDeg === 180
                ? "Escalier 180° — palier élargi à 2 largeurs, volée sur l’autre côté"
                : `Escalier ajouté à ${turnDeg}° — vous pouvez enchaîner un autre palier`
        );
        return stair;
    }

    /**
     * @param {THREE.Vector3} [position]
     * @param {{ type?: import("./lab-vegetation.js").VegType, height?: number, paintGround?: boolean }} [opts]
     * @param {object} [addOptions]
     */
    async function spawnVegetationAt(position, opts = {}, addOptions = {}) {
        const type = VEG_TYPES.includes(opts.type) ? opts.type : vegetationType;
        if (type === "model" && !getActiveVegetationAssetId() && !opts.assetId) {
            showStatus("Importez d’abord un modèle .glb");
            return null;
        }
        const height =
            typeof opts.height === "number" && opts.height > 0.1
                ? opts.height
                : Number(vegetationUi?.heightInput?.value) || VEG_PRESETS[type].height;
        const paintGround =
            opts.paintGround ?? vegetationUi?.paintGroundCheck?.checked !== false;

        const object = createVegetationObject(type, {
            height,
            assetId: opts.assetId || (type === "model" ? getActiveVegetationAssetId() : undefined),
            brightness:
                type === "model"
                    ? clampVegetationBrightness(
                          Number(vegetationUi?.brightnessInput?.value) ||
                              DEFAULT_VEGETATION_BRIGHTNESS
                      )
                    : undefined,
        });
        object.userData[COLLISION_KEY] = false;
        registerLabObject(object);
        const placed = addObjectAt(object, position ?? spawnPoint(), addOptions);

        if (paintGround && terrainController?.stampBrushAtWorld) {
            const dataUrl = createVegetationGroundDataUrl(type === "model" ? "tree" : type);
            terrainController.ensureTerrain?.();
            await terrainController.applyBrushTextureFromDataUrl?.(dataUrl, {
                activatePaint: false,
            });
            const radius =
                Number(placed.userData.vegetationGroundRadius) ||
                VEG_PRESETS[type].groundRadius;
            terrainController.stampBrushAtWorld(placed.position.x, placed.position.z, radius);
        }

        const label =
            type === "model" && placed.userData.vegetationAssetName
                ? String(placed.userData.vegetationAssetName).replace(/\.(glb|gltf)$/i, "")
                : VEG_PRESETS[type]?.label || "Végétal";
        showStatus(`${label} placé`);
        return placed;
    }

    function formatVegHeightLabel(meters) {
        return `${Number(meters).toFixed(2).replace(".", ",")} m`;
    }

    function formatVegBrightnessLabel(factor) {
        return `${Math.round(clampVegetationBrightness(factor) * 100)} %`;
    }

    function applyBrightnessToAllModelVegetation(factor) {
        const brightness = clampVegetationBrightness(factor);
        for (const object of editableObjects) {
            if (!isLabVegetation(object)) continue;
            if (getVegetationType(object) !== "model") continue;
            setVegetationBrightness(object, brightness);
        }
    }

    function syncVegetationModelUi() {
        const assetId = getActiveVegetationAssetId();
        const asset = assetId ? getVegetationAsset(assetId) : null;
        const modelBtn = [...(vegetationUi?.typeButtons || [])].find(
            (btn) => btn.getAttribute("data-veg-type") === "model"
        );
        if (modelBtn) {
            modelBtn.disabled = !asset;
        }
        if (vegetationUi?.modelNameEl) {
            if (asset) {
                vegetationUi.modelNameEl.hidden = false;
                vegetationUi.modelNameEl.textContent = `Modèle : ${asset.name}`;
            } else {
                vegetationUi.modelNameEl.hidden = true;
                vegetationUi.modelNameEl.textContent = "";
            }
        }
    }

    async function applyVegetationBrushTexture({ activatePaint = true } = {}) {
        const brushType = vegetationType === "model" ? "tree" : vegetationType;
        const dataUrl = createVegetationGroundDataUrl(brushType);
        if (!dataUrl) return false;
        terrainController?.ensureTerrain?.();
        const ok = await terrainController?.applyBrushTextureFromDataUrl?.(dataUrl, {
            activatePaint,
        });
        if (ok) {
            const label = VEG_PRESETS[vegetationType]?.label || "Végétal";
            showStatus(
                activatePaint
                    ? `Pinceau texturé : sol ${label.toLowerCase()} (mode peinture)`
                    : `Texture sol ${label.toLowerCase()} chargée dans le pinceau`
            );
        }
        return !!ok;
    }

    function setVegetationPlaceActive(active) {
        vegetationPlaceActive = !!active;
        if (vegetationPlaceActive) {
            terrainController?.setEditing?.(false);
            enterExplore?.();
            showStatus("Clic court = placer · glisser = regarder · Échap = quitter");
        }
        setVegetationPlaceModeActive?.(vegetationPlaceActive);
        vegetationUi?.placeBtn?.classList.toggle("is-active", vegetationPlaceActive);
        vegetationUi?.placeBtn?.setAttribute(
            "aria-pressed",
            vegetationPlaceActive ? "true" : "false"
        );
    }

    function syncVegetationTypeButtons() {
        const buttons = vegetationUi?.typeButtons;
        if (!buttons) return;
        for (const btn of buttons) {
            const t = btn.getAttribute("data-veg-type");
            btn.classList.toggle("is-active", t === vegetationType);
        }
    }

    function setVegetationType(type, { applyBrush = true } = {}) {
        if (!VEG_TYPES.includes(type)) return;
        if (type === "model" && !getActiveVegetationAssetId()) {
            showStatus("Importez d’abord un modèle .glb");
            return;
        }
        vegetationType = type;
        syncVegetationTypeButtons();
        const preset = VEG_PRESETS[type];
        const asset =
            type === "model" ? getVegetationAsset(getActiveVegetationAssetId() || "") : null;
        const defaultHeight =
            type === "model" && asset
                ? Math.min(12, Math.max(0.5, Number(asset.nativeHeight.toFixed(1))))
                : preset?.height;
        if (vegetationUi?.heightInput && defaultHeight) {
            vegetationUi.heightInput.value = String(defaultHeight);
            if (vegetationUi.heightValue) {
                vegetationUi.heightValue.textContent = formatVegHeightLabel(defaultHeight);
            }
        }
        if (applyBrush) {
            void applyVegetationBrushTexture({ activatePaint: false });
        }
    }

    async function importVegetationModelFile(file) {
        if (!file) return;
        try {
            showStatus(`Chargement ${file.name}…`);
            const asset = await registerVegetationAssetFromFile(file);
            setActiveVegetationAssetId(asset.id);
            syncVegetationModelUi();
            setVegetationType("model", { applyBrush: false });
            showStatus(`Modèle prêt : ${asset.name} — activez Placer`);
        } catch (error) {
            console.error("[lab-vegetation] import:", error);
            showStatus(
                error instanceof Error ? error.message : "Impossible de charger le modèle"
            );
        }
    }

    function refreshStairAppearance(object) {
        if (!isLabStair(object) && !isLabLanding(object) && !isLabTube(object)) return Promise.resolve();
        applyObjectColor(object, getObjectColor(object));
        applyObjectRoughness(object, getObjectRoughness(object));
        applyObjectMetalness(object, getObjectMetalness(object));
        applyObjectOpacity(object, getObjectOpacity(object));
        return Promise.all([
            applyObjectTexture(object, getObjectTextureDataUrl(object)),
            applyObjectNormalTexture(object, getObjectNormalTextureDataUrl(object)),
        ]).then(() => {
            applyObjectTextureTile(object, getObjectTextureTile(object));
            updateObjectVisual(object);
        });
    }

    function syncStairContextMenu(object) {
        if (!isLabStair(object)) return;
        const stepCount = getStairStepCount(object);
        const thickness = getStairThickness(object);
        const summary = formatStairHeightSummary(stepCount, { thickness });
        contextMenu.syncProperty("stair-steps", summary.stepCount);
        contextMenu.syncProperty("stair-thickness", thickness);
        contextMenu.syncProperty("stair-shape", getStairShape(object));
        contextMenu.syncProperty("stair-radius", getStairRadius(object));
        contextMenu.syncProperty("stair-arc", getStairArcDeg(object));
        contextMenu.syncProperty("stair-rise-label", summary.stepRiseLabel);
        contextMenu.syncProperty("stair-total-label", summary.totalHeightLabel);
    }

    /**
     * @param {THREE.Object3D} object
     * @param {{
     *   stepCount?: number,
     *   thickness?: number,
     *   shape?: string,
     *   radius?: number,
     *   arcDeg?: number,
     * }} patch
     */
    function applyStairParams(object, patch) {
        if (!isLabStair(object)) return;
        const nextCount = clampStairStepCount(patch.stepCount ?? getStairStepCount(object));
        const nextThickness = clampStairThickness(patch.thickness ?? getStairThickness(object));
        const nextShape = normalizeStairShape(patch.shape ?? getStairShape(object));
        const nextRadius = clampStairRadius(patch.radius ?? getStairRadius(object));
        const nextArc = clampStairArcDeg(patch.arcDeg ?? getStairArcDeg(object));

        const unchanged =
            getStairStepCount(object) === nextCount &&
            getStairThickness(object) === nextThickness &&
            getStairShape(object) === nextShape &&
            getStairRadius(object) === nextRadius &&
            getStairArcDeg(object) === nextArc;
        if (unchanged) {
            syncStairContextMenu(object);
            return;
        }

        const before = captureFullSnapshot(object);
        rebuildStairGroup(object, nextCount, {
            thickness: nextThickness,
            shape: nextShape,
            radius: nextRadius,
            arcDeg: nextArc,
        });
        refreshObjectShadows(object);
        invalidateLabShadows();
        object.updateMatrixWorld(true);
        void refreshStairAppearance(object).then(() => {
            updateObjectVisual(object);
        });
        selectObject(object);

        const after = captureFullSnapshot(object);
        history.push({ type: "stair-steps", object, before, after });

        syncStairContextMenu(object);
        refreshSceneRegistry();
        const shapeLabel = nextShape === "circular" ? "circulaire" : "droit";
        showStatus(
            `Escalier ${shapeLabel} : ${nextCount} marches, ép. ${nextThickness.toFixed(2).replace(".", ",")} m, haut. ${getStairTotalHeight(nextCount, nextThickness).toFixed(2).replace(".", ",")} m`
        );
    }

    function syncTubeContextMenu(object) {
        if (!isLabTube(object)) return;
        contextMenu.syncProperty("tube-length", getTubeLength(object));
        contextMenu.syncProperty("tube-radius", getTubeRadius(object));
        contextMenu.syncProperty("tube-wall", getTubeWall(object));
    }

    /**
     * @param {THREE.Object3D} object
     * @param {{
     *   length?: number,
     *   radius?: number,
     *   wall?: number,
     * }} patch
     */
    function applyTubeParams(object, patch) {
        if (!isLabTube(object)) return;
        const nextLength = clampTubeLength(patch.length ?? getTubeLength(object));
        const nextRadius = clampTubeRadius(patch.radius ?? getTubeRadius(object));
        const nextWall = clampTubeWall(patch.wall ?? getTubeWall(object), nextRadius);

        const unchanged =
            getTubeLength(object) === nextLength &&
            getTubeRadius(object) === nextRadius &&
            getTubeWall(object) === nextWall;
        if (unchanged) {
            syncTubeContextMenu(object);
            return;
        }

        const before = captureFullSnapshot(object);
        rebuildTubeGroup(object, {
            length: nextLength,
            radius: nextRadius,
            wall: nextWall,
        });
        refreshObjectShadows(object);
        invalidateLabShadows();
        object.updateMatrixWorld(true);
        void refreshStairAppearance(object).then(() => {
            updateObjectVisual(object);
        });
        selectObject(object);

        const after = captureFullSnapshot(object);
        history.push({ type: "tube-params", object, before, after });

        syncTubeContextMenu(object);
        refreshSceneRegistry();
        showStatus(
            `Tubulure — L ${nextLength.toFixed(2).replace(".", ",")} m, R ${nextRadius.toFixed(2).replace(".", ",")} m, paroi ${nextWall.toFixed(3).replace(".", ",")} m`
        );
    }

    function applyStairStepCount(object, stepCount) {
        applyStairParams(object, { stepCount });
    }

    function applyCubeDimensions({ x, y, z }) {
        let object = selectedObject && isLabObject(selectedObject) ? selectedObject : null;
        if (!object) {
            object = spawnCubeAt();
        }

        const before = captureObjectState(object);
        object.scale.set(x, y, z);
        if (snapByMode.scale) snapMeshScale(object);
        snapMeshToFloor(object);
        object.updateMatrixWorld(true);
        refreshObjectDisplay(object);
        selectObject(object);

        const after = captureObjectState(object);
        if (!objectStatesEqual(before, after)) {
            history.push({ type: "transform", object, before, after });
        }
        refreshSceneRegistry();
    }

    function applyCubePosition({ x, y, z }) {
        const object = selectedObject && isLabObject(selectedObject) ? selectedObject : null;
        if (!object) {
            showStatus("Sélectionnez un cube");
            return;
        }

        const before = captureObjectState(object);
        object.position.set(x, y, z);
        if (snapByMode.translate) snapMeshTranslate(object);
        object.updateMatrixWorld(true);
        refreshObjectDisplay(object);
        selectObject(object);

        const after = captureObjectState(object);
        if (!objectStatesEqual(before, after)) {
            history.push({ type: "transform", object, before, after });
        }
        refreshSceneRegistry();
    }

    function applyCubeRotation({ x, y, z }) {
        const object = selectedObject && isLabObject(selectedObject) ? selectedObject : null;
        if (!object) {
            showStatus("Sélectionnez un cube");
            return;
        }

        const before = captureObjectState(object);
        object.rotation.set(
            THREE.MathUtils.degToRad(x),
            THREE.MathUtils.degToRad(y),
            THREE.MathUtils.degToRad(z)
        );
        if (snapByMode.rotate) snapMeshRotation(object);
        object.updateMatrixWorld(true);
        refreshObjectDisplay(object);
        selectObject(object);

        const after = captureObjectState(object);
        if (!objectStatesEqual(before, after)) {
            history.push({ type: "transform", object, before, after });
        }
        refreshSceneRegistry();
    }

    function readdEditableObject(object) {
        if (!object) return;
        if (!object.parent) scene.add(object);
        if (!editableObjects.includes(object)) {
            editableObjects.push(object);
        }
        registerCollidable(object);
        registerSceneItem(object);
    }

    /**
     * Restaure une face CSG sur le MÊME objet (préserve l’identité pour l’historique add/remove).
     * @param {THREE.Object3D} object
     * @param {ReturnType<typeof captureFullSnapshot>} snap
     * @param {THREE.BufferGeometry} geometry
     */
    function restoreCsgObjectState(object, snap, geometry) {
        const mesh = getLabContentMesh(object);
        if (!mesh) return;

        if (snap.kind === "csg") {
            object.userData.labCsg = true;
            delete object.userData.labShape;
        } else {
            delete object.userData.labCsg;
            if (snap.kind === "sphere") object.userData[LAB_SHAPE_KEY] = "sphere";
            else if (snap.kind === "pyramid") object.userData[LAB_SHAPE_KEY] = "pyramid";
            else if (snap.kind === "cylinder") object.userData[LAB_SHAPE_KEY] = "cylinder";
            else if (snap.kind === "cone") object.userData[LAB_SHAPE_KEY] = "cone";
            else if (snap.kind === "torus") object.userData[LAB_SHAPE_KEY] = "torus";
            else if (snap.kind === "panel") object.userData[LAB_SHAPE_KEY] = "panel";
            else if (snap.kind === "stair") {
                /* keep stair flags from snap if present */
            } else object.userData[LAB_SHAPE_KEY] = "box";
        }

        const oldGeo = mesh.geometry;
        mesh.geometry = geometry.clone();
        if (oldGeo && oldGeo !== mesh.geometry) oldGeo.dispose();

        object.position.copy(snap.position);
        if (snap.quaternion) {
            object.quaternion.copy(snap.quaternion);
            object.rotation.setFromQuaternion(object.quaternion, object.rotation.order);
        } else {
            object.rotation.copy(snap.rotation);
        }
        object.scale.copy(snap.scale);
        object.userData[COLLISION_KEY] = !!snap.collisionEnabled;

        if (snap.color) applyObjectColor(object, snap.color);
        if (typeof snap.roughness === "number") applyObjectRoughness(object, snap.roughness);
        if (typeof snap.metalness === "number") applyObjectMetalness(object, snap.metalness);
        if (typeof snap.opacity === "number") applyObjectOpacity(object, snap.opacity);
        if (typeof snap.smooth === "boolean") {
            object.userData[OBJECT_SMOOTH_KEY] = snap.smooth;
            object.traverse((child) => {
                if (!isObjectContentMesh(child)) return;
                const materials = Array.isArray(child.material) ? child.material : [child.material];
                materials.forEach((material) => {
                    if (!material || !("flatShading" in material)) return;
                    material.flatShading = !snap.smooth;
                    material.needsUpdate = true;
                });
            });
        }

        if (snap.shadowEnabled !== undefined) {
            setObjectShadowEnabled(object, !!snap.shadowEnabled);
        }
        if (typeof snap.shadowOpacity === "number") {
            setObjectShadowOpacity(object, snap.shadowOpacity);
        }

        updateObjectVisual(object);
    }

    async function performCsgSubtract(target, cutter) {
        try {
            const before = captureFullSnapshot(target);
            const beforeMesh = getLabContentMesh(target);
            const beforeGeometry = beforeMesh?.geometry?.clone?.() || null;
            if (!beforeGeometry) {
                throw new Error("Géométrie cible introuvable");
            }

            showStatus("Perforation en cours…");
            const result = await subtractLabObjects(target, cutter);
            applyCsgResultToLabObject(target, result);
            // Lissage CSG déjà appliqué dans finalize (normales à plis) — éviter un re-weld destructeur
            target.userData[OBJECT_SMOOTH_KEY] = getObjectSmooth(target);
            snapMeshToFloor(target);
            updateObjectVisual(target);
            invalidateLabShadows();

            // Garder l’outil vivant pour que Ctrl+Z puisse le remettre (même référence)
            removeFromScene(cutter, { dispose: false });

            const after = captureFullSnapshot(target);
            const afterMesh = getLabContentMesh(target);
            const afterGeometry = afterMesh?.geometry?.clone?.() || null;
            if (!afterGeometry) {
                throw new Error("Géométrie résultat introuvable");
            }

            history.push({
                type: "csg",
                target,
                cutter,
                before,
                after,
                beforeGeometry,
                afterGeometry,
            });

            selectObject(target, { highlight: true });
            refreshSceneRegistry();
            showStatus("Perforation appliquée — Ctrl+Z annule aussi les objets ensuite");
        } catch (error) {
            showStatus(error instanceof Error ? error.message : "Perforation impossible");
        }
    }

    function deleteObject(object, { recordHistory = true } = {}) {
        if (!object) return;
        const snapshot = captureFullSnapshot(object);
        removeFromScene(object);
        if (recordHistory) {
            history.push({ type: "remove", snapshot, object: null });
        }
        showStatus(isLabLight(object) ? "Lumière supprimée" : "Objet supprimé");
    }

    function deleteSelection() {
        if (!selectedObjects.length) return;
        const toDelete = [...selectedObjects];
        deselectObject();
        for (const object of toDelete) {
            deleteObject(object);
        }
    }

    /**
     * Duplique userData sans partager la référence (three clone() partage userData).
     * @param {Record<string, unknown>} data
     */
    function clonePlainUserData(data) {
        if (!data || typeof data !== "object") return {};
        try {
            return structuredClone(data);
        } catch {
            const out = { ...data };
            if (data._glassRestore && typeof data._glassRestore === "object") {
                out._glassRestore = { .../** @type {object} */ (data._glassRestore) };
            }
            return out;
        }
    }

    /**
     * Clone rigoureux : même géométrie, matériaux, position/quaternion/échelle.
     * @param {THREE.Object3D} source
     */
    function cloneEditableExact(source) {
        source.updateMatrixWorld(true);
        const clone = source.clone(true);

        clone.traverse((node) => {
            node.userData = clonePlainUserData(node.userData);
            delete node.userData.shadowOverlay;

            if (!(node instanceof THREE.Mesh || node instanceof THREE.Line || node instanceof THREE.Points)) {
                return;
            }
            if (node.name === "shadow-overlay") return;
            if (node.geometry) node.geometry = node.geometry.clone();
            if (node.material) {
                node.material = Array.isArray(node.material)
                    ? node.material.map((m) => (m ? m.clone() : m))
                    : node.material.clone();
            }
        });

        const overlays = [];
        clone.traverse((child) => {
            if (child.name === "shadow-overlay") overlays.push(child);
        });
        for (const overlay of overlays) {
            overlay.parent?.remove(overlay);
            overlay.geometry?.dispose?.();
            const mats = Array.isArray(overlay.material) ? overlay.material : [overlay.material];
            mats.forEach((m) => m?.dispose?.());
        }

        delete clone.userData.sceneItemLabel;
        delete clone.userData[SCENE_ITEM_ID_KEY];

        clone.position.copy(source.position);
        clone.quaternion.copy(source.quaternion);
        clone.scale.copy(source.scale);
        clone.rotation.setFromQuaternion(source.quaternion, source.rotation.order);
        return clone;
    }

    /**
     * @param {THREE.Object3D} clone
     * @param {THREE.Object3D} source
     */
    function registerClonedEditable(clone, source) {
        const shadowOn = getObjectShadowEnabled(source);
        const shadowOpacity = getObjectShadowOpacity(source);
        registerLabObject(clone);
        setObjectShadowEnabled(clone, shadowOn);
        if (typeof shadowOpacity === "number") {
            setObjectShadowOpacity(clone, shadowOpacity);
        }
        return clone;
    }

    function copySelection() {
        if (!selectedObjects.length) {
            showStatus("Aucun objet à copier");
            return;
        }
        const copies = [];
        for (const object of selectedObjects) {
            if (isLabLight(object)) continue;
            object.updateMatrixWorld(true);
            copies.push(cloneEditableExact(object));
        }
        if (!copies.length) {
            showStatus("Les lumières ne peuvent pas être copiées");
            return;
        }
        clipboard = copies;
        showStatus(copies.length > 1 ? `${copies.length} objets copiés` : "Objet copié");
    }

    function pasteClipboard() {
        if (!clipboard?.length) {
            showStatus("Presse-papiers vide");
            return;
        }
        const pasted = [];
        for (const template of clipboard) {
            const clone = cloneEditableExact(template);
            registerClonedEditable(clone, template);
            pasted.push(addObjectToScene(clone, { recordHistory: true, select: false }));
        }
        if (pasted.length) {
            selectedObjects = pasted.filter(Boolean);
            selectedObject = selectedObjects[selectedObjects.length - 1] || null;
            selectionHighlight = selectedObjects.some((obj) => !obj.userData[COLLISION_KEY]);
            syncSelectionOutlines();
            for (const obj of selectedObjects) updateObjectVisual(obj);
            syncGizmo();
            refreshObjectDisplay(selectedObject);
            notifyOrbitTarget();
        }
        showStatus(pasted.length > 1 ? `${pasted.length} objets collés` : "Objet collé");
    }

    function performUndo() {
        const entry = history.undo();
        if (!entry) {
            showStatus("Rien à annuler");
            return;
        }
        applyHistoryEntry(entry, "undo");
        showStatus("Annulé");
    }

    function performRedo() {
        const entry = history.redo();
        if (!entry) {
            showStatus("Rien à rétablir");
            return;
        }
        applyHistoryEntry(entry, "redo");
        showStatus("Rétabli");
    }

    /**
     * Restaure géométrie + pose d’une tubulure (droit ou coude) depuis un snapshot.
     * Conserve l’identité de l’objet (historique add/remove).
     * @param {THREE.Object3D} object
     * @param {ReturnType<typeof captureFullSnapshot>} snapshot
     */
    function restoreTubeObjectFromSnapshot(object, snapshot) {
        if (!object || !snapshot || snapshot.kind !== "tube") return;

        for (const child of [...object.children]) {
            object.remove(child);
            if (child instanceof THREE.Mesh) {
                child.geometry?.dispose?.();
                const mats = Array.isArray(child.material) ? child.material : [child.material];
                mats.forEach((m) => m?.dispose?.());
            }
        }

        const bendAngle = Number(snapshot.tubeBendAngle) || 0;
        const entranceOrigin = !!snapshot.tubeEntranceOrigin || Math.abs(bendAngle) >= 0.5;
        const color = snapshot.color || DEFAULT_TUBE_COLOR;
        const temp = entranceOrigin
            ? buildBentTubeGroup({
                  length: snapshot.tubeLength,
                  radius: snapshot.tubeRadius,
                  wall: snapshot.tubeWall,
                  color,
                  roughness: snapshot.roughness,
                  metalness: snapshot.metalness,
                  bendAngleDeg: bendAngle,
                  bendRadius: snapshot.tubeBendRadius,
              })
            : buildTubeGroup({
                  length: snapshot.tubeLength,
                  radius: snapshot.tubeRadius,
                  wall: snapshot.tubeWall,
                  color,
                  roughness: snapshot.roughness,
                  metalness: snapshot.metalness,
              });

        for (const child of [...temp.children]) {
            object.add(child);
        }
        Object.assign(object.userData, {
            [LAB_TUBE_KEY]: true,
            [TUBE_LENGTH_KEY]: temp.userData[TUBE_LENGTH_KEY],
            [TUBE_RADIUS_KEY]: temp.userData[TUBE_RADIUS_KEY],
            [TUBE_WALL_KEY]: temp.userData[TUBE_WALL_KEY],
            [TUBE_BEND_ANGLE_KEY]: temp.userData[TUBE_BEND_ANGLE_KEY] ?? 0,
            [TUBE_CAPS_KEY]: temp.userData[TUBE_CAPS_KEY],
        });
        if (typeof temp.userData[TUBE_BEND_RADIUS_KEY] === "number") {
            object.userData[TUBE_BEND_RADIUS_KEY] = temp.userData[TUBE_BEND_RADIUS_KEY];
        } else {
            delete object.userData[TUBE_BEND_RADIUS_KEY];
        }
        if (snapshot.tubeCaps) {
            object.userData[TUBE_CAPS_KEY] = snapshot.tubeCaps;
        }

        if (snapshot.position) object.position.copy(snapshot.position);
        if (snapshot.quaternion) {
            object.quaternion.copy(snapshot.quaternion);
            object.rotation.setFromQuaternion(object.quaternion, object.rotation.order);
        } else if (snapshot.rotation) {
            object.rotation.copy(snapshot.rotation);
        }
        if (snapshot.scale) object.scale.copy(snapshot.scale);
        object.userData[COLLISION_KEY] = !!snapshot.collisionEnabled;
        object.userData[OBJECT_COLOR_KEY] = color;
        if (snapshot.color) applyObjectColor(object, snapshot.color);
        object.updateMatrixWorld(true);
    }

    function applyHistoryEntry(entry, direction) {
        switch (entry.type) {
            case "add": {
                if (direction === "undo") {
                    if (entry.object) {
                        removeFromScene(entry.object, { dispose: false });
                        refreshSceneRegistry();
                        invalidateLabShadows();
                    }
                } else if (entry.object) {
                    scene.add(entry.object);
                    if (!editableObjects.includes(entry.object)) {
                        editableObjects.push(entry.object);
                    }
                    if (isLabLight(entry.object)) {
                        attachLightHelper(entry.object, scene);
                    } else {
                        registerCollidable(entry.object);
                    }
                    registerSceneItem(entry.object);
                    selectObject(entry.object, { highlight: false });
                    refreshSceneRegistry();
                    invalidateLabShadows();
                }
                break;
            }
            case "remove": {
                if (direction === "undo") {
                    entry.object = createObjectFromSnapshot(entry.snapshot);
                    scene.add(entry.object);
                    selectObject(entry.object, { highlight: false });
                } else if (entry.object) {
                    removeFromScene(entry.object);
                    entry.object = null;
                }
                break;
            }
            case "csg": {
                if (direction === "undo") {
                    restoreCsgObjectState(entry.target, entry.before, entry.beforeGeometry);
                    readdEditableObject(entry.cutter);
                    selectObject(entry.target, { highlight: false });
                } else {
                    restoreCsgObjectState(entry.target, entry.after, entry.afterGeometry);
                    if (entry.cutter) {
                        removeFromScene(entry.cutter, { dispose: false });
                    }
                    selectObject(entry.target, { highlight: false });
                }
                invalidateLabShadows();
                refreshSceneRegistry();
                break;
            }
            case "transform": {
                const state = direction === "undo" ? entry.before : entry.after;
                applyObjectState(entry.object, state);
                selectObject(entry.object, { highlight: false });
                refreshObjectDisplay(entry.object);
                break;
            }
            case "color": {
                const color = direction === "undo" ? entry.before : entry.after;
                applyObjectColor(entry.object, color);
                selectObject(entry.object, { highlight: false });
                contextMenu.syncProperty("color", color);
                break;
            }
            case "texture": {
                const dataUrl = direction === "undo" ? entry.before : entry.after;
                applyObjectTexture(entry.object, dataUrl).then(() => {
                    if (!dataUrl) applyObjectColor(entry.object, getObjectColor(entry.object));
                    updateObjectVisual(entry.object);
                    selectObject(entry.object, { highlight: false });
                    contextMenu.syncProperty("texture", dataUrl);
                });
                break;
            }
            case "normal-texture": {
                const dataUrl = direction === "undo" ? entry.before : entry.after;
                applyObjectNormalTexture(entry.object, dataUrl).then(() => {
                    updateObjectVisual(entry.object);
                    selectObject(entry.object, { highlight: false });
                    contextMenu.syncProperty("normal-texture", dataUrl);
                });
                break;
            }
            case "roughness":
            case "opacity":
            case "glass-preset":
            case "material": {
                const state = direction === "undo" ? entry.before : entry.after;
                if (entry.type === "roughness" || entry.type === "opacity") {
                    if (entry.type === "roughness") {
                        applyObjectRoughness(entry.object, entry[direction === "undo" ? "before" : "after"]);
                    } else {
                        applyObjectOpacity(entry.object, entry[direction === "undo" ? "before" : "after"]);
                    }
                } else if (entry.type === "glass-preset") {
                    applyObjectOpacity(entry.object, state.opacity);
                    applyObjectRoughness(entry.object, state.roughness);
                } else {
                    applyMaterialState(entry.object, state);
                }
                selectObject(entry.object, { highlight: false });
                const current = captureMaterialState(entry.object);
                contextMenu.syncProperty("glass", current.glass);
                contextMenu.syncProperty("opacity", current.opacity);
                contextMenu.syncProperty("roughness", current.roughness);
                contextMenu.syncProperty("metalness", current.metalness);
                break;
            }
            case "smooth": {
                const value = direction === "undo" ? entry.before : entry.after;
                applyObjectSmooth(entry.object, value);
                selectObject(entry.object, { highlight: false });
                contextMenu.syncProperty("smooth", value);
                break;
            }
            case "normal-scale": {
                const value = direction === "undo" ? entry.before : entry.after;
                applyObjectNormalScale(entry.object, value);
                selectObject(entry.object, { highlight: false });
                contextMenu.syncProperty("normal-scale", value);
                break;
            }
            case "texture-tile": {
                const value = direction === "undo" ? entry.before : entry.after;
                applyObjectTextureTile(entry.object, value);
                selectObject(entry.object, { highlight: false });
                contextMenu.syncProperty("texture-tile", value);
                break;
            }
            case "face-paint": {
                const dataUrl = direction === "undo" ? entry.before : entry.after;
                restoreFaceSnapshot(entry.object, entry.faceIndex, dataUrl).then(() => {
                    selectObject(entry.object, { highlight: false });
                });
                break;
            }
            case "stair-steps": {
                const snapshot = direction === "undo" ? entry.before : entry.after;
                if (!entry.object) break;
                entry.object.position.copy(snapshot.position);
                if (snapshot.quaternion) {
                    entry.object.quaternion.copy(snapshot.quaternion);
                    entry.object.rotation.setFromQuaternion(
                        entry.object.quaternion,
                        entry.object.rotation.order
                    );
                } else {
                    entry.object.rotation.copy(snapshot.rotation);
                }
                entry.object.scale.copy(snapshot.scale);
                entry.object.userData[COLLISION_KEY] = !!snapshot.collisionEnabled;
                rebuildStairGroup(entry.object, snapshot.stairStepCount ?? STAIR_DEFAULT_STEP_COUNT, {
                    thickness: snapshot.stairThickness,
                    shape: snapshot.stairShape,
                    radius: snapshot.stairRadius,
                    arcDeg: snapshot.stairArcDeg,
                });
                if (snapshot.color) applyObjectColor(entry.object, snapshot.color);
                void refreshStairAppearance(entry.object);
                refreshObjectShadows(entry.object);
                invalidateLabShadows();
                updateObjectVisual(entry.object);
                selectObject(entry.object, { highlight: false });
                syncStairContextMenu(entry.object);
                refreshSceneRegistry();
                break;
            }
            case "tube-params": {
                const snapshot = direction === "undo" ? entry.before : entry.after;
                if (!entry.object || !snapshot) break;
                restoreTubeObjectFromSnapshot(entry.object, snapshot);
                void refreshStairAppearance(entry.object);
                refreshObjectShadows(entry.object);
                invalidateLabShadows();
                updateObjectVisual(entry.object);
                selectObject(entry.object, { highlight: false });
                syncTubeContextMenu(entry.object);
                refreshSceneRegistry();
                break;
            }
            case "terrain": {
                const target = direction === "undo" ? entry.before : entry.after;
                if (!target) {
                    terrainController?.clear?.({ recordHistory: false });
                } else {
                    void terrainController?.deserialize?.(target, { recordHistory: false });
                }
                break;
            }
            case "ocean": {
                const target = direction === "undo" ? entry.before : entry.after;
                if (!target) {
                    oceanController?.remove?.({ recordHistory: false });
                } else {
                    void oceanController?.deserialize?.(target, { recordHistory: false });
                }
                break;
            }
            default:
                break;
        }
    }

    // Priorité sur le terrain (window capture) : annuler texture / sélection triangles.
    window.addEventListener(
        "keydown",
        (event) => {
            const mod = event.ctrlKey || event.metaKey;
            if (!mod || event.shiftKey) return;
            const isUndoKey = event.code === "KeyZ" || event.key.toLowerCase() === "z";
            if (!isUndoKey) return;
            if (!faceDrawController?.undoTriangleSelection?.()) return;
            event.preventDefault();
            event.stopPropagation();
            event.stopImmediatePropagation();
        },
        true
    );

    document.addEventListener("keydown", (event) => {
        const mod = event.ctrlKey || event.metaKey;
        const key = event.key.toLowerCase();
        // Touche physique KeyZ : sur AZERTY la touche Z produit « w », d’où event.code.
        const isUndoKey = event.code === "KeyZ" || key === "z";
        const isRedoKey =
            event.code === "KeyY" ||
            key === "y" ||
            (event.shiftKey && (event.code === "KeyZ" || key === "z"));

        if (mod && !event.shiftKey && isUndoKey) {
            if (triangulationMode && faceDrawController?.undoTriangleSelection?.()) {
                event.preventDefault();
                event.stopPropagation();
                return;
            }
            const terrainUndoDepth = terrainController?.getUndoDepth?.() ?? 0;
            if (terrainUndoDepth > 0 || terrainController?.isUndoInProgress?.()) {
                if (terrainController?.tryUndoShortcut?.()) {
                    event.preventDefault();
                    event.stopPropagation();
                    return;
                }
                // Si le terrain ne consomme pas le raccourci, laisser l’historique scène.
            }
            event.preventDefault();
            performUndo();
            return;
        }
        if (mod && isRedoKey) {
            const terrainRedoDepth = terrainController?.getRedoDepth?.() ?? 0;
            if (terrainRedoDepth > 0 || terrainController?.isUndoInProgress?.()) {
                if (terrainController?.tryRedoShortcut?.()) {
                    event.preventDefault();
                    event.stopPropagation();
                    return;
                }
            }
            event.preventDefault();
            performRedo();
            return;
        }

        if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) {
            return;
        }

        if (mod && (key === "c" || event.code === "KeyC")) {
            event.preventDefault();
            copySelection();
            return;
        }
        if (mod && (key === "v" || event.code === "KeyV")) {
            event.preventDefault();
            pasteClipboard();
            return;
        }

        if (event.repeat) return;

        switch (event.code) {
            case "Delete":
            case "Backspace":
                event.preventDefault();
                deleteSelection();
                break;
            case "KeyC":
                if (mod) break;
                event.preventDefault();
                spawnCubeAt();
                break;
            case "KeyG":
                event.preventDefault();
                if (selectedObject) setTransformMode("translate");
                break;
            case "KeyR":
                event.preventDefault();
                if (selectedObject) setTransformMode("rotate");
                break;
            case "KeyE":
                event.preventDefault();
                if (selectedObject) setTransformMode("scale");
                break;
            case "Escape":
                if (vegetationPlaceActive) {
                    event.preventDefault();
                    event.stopPropagation();
                    setVegetationPlaceActive(false);
                    showStatus("Placement végétal annulé");
                    break;
                }
                if (csgTool?.isPickMode()) {
                    event.preventDefault();
                    event.stopPropagation();
                    csgTool.cancelPickMode();
                    showStatus("Mode perforation annulé");
                    break;
                }
                if (gizmoActive) {
                    event.preventDefault();
                    event.stopPropagation();
                    setSelectionOnlyMode();
                    break;
                }
                break;
            default:
                break;
        }
    }, { capture: true });

    function setPointerFromClient(clientX, clientY) {
        const rect = getPointerRect?.() ?? renderer.domElement.getBoundingClientRect();
        pointer.x = ((clientX - rect.left) / rect.width) * 2 - 1;
        pointer.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    }

    function raycastToFloor(clientX, clientY) {
        setPointerFromClient(clientX, clientY);
        raycaster.setFromCamera(pointer, camera);
        const terrain = terrainController?.getTerrain?.();
        if (terrain) {
            const terrainHit = raycaster.intersectObject(terrain, false)[0];
            if (terrainHit) return terrainHit.point.clone();
        }
        if (!raycaster.ray.intersectPlane(floorPlane, hitPoint)) return null;
        return hitPoint.clone();
    }

    function snapPlacement(position) {
        position.x = snapValue(position.x, GRID_STEP);
        position.z = snapValue(position.z, GRID_STEP);
        return position;
    }

    function isLikelyLabCubeRoot(child) {
        if (!(child instanceof THREE.Group)) return false;
        if (child === yaw || child === transformControls) return false;
        if (isLabLight(child)) return false;
        if (child.parent !== scene) return false;
        if (child.userData[LAB_OBJECT_KEY] === true) return true;
        let meshCount = 0;
        child.traverse((node) => {
            if (isObjectContentMesh(node)) meshCount += 1;
        });
        return meshCount > 0;
    }

    /** Ré-enregistre les objets chargés (scènes anciennes / import partiel). */
    function reconcileEditableObjects() {
        for (const child of scene.children) {
            if (child === yaw || child === transformControls) continue;
            if (isLabLight(child)) {
                if (!editableObjects.includes(child)) {
                    registerLabLight(child);
                }
                continue;
            }
            if (!isLikelyLabCubeRoot(child)) continue;
            if (child.userData[LAB_OBJECT_KEY] !== true) {
                registerLabObject(child);
            } else if (!editableObjects.includes(child)) {
                editableObjects.push(child);
                registerCollidable(child);
                registerSceneItem(child);
            }
        }
    }

    function pickNearestLabObjectToRay(clientX, clientY) {
        setPointerFromClient(clientX, clientY);
        raycaster.setFromCamera(pointer, camera);
        let best = null;
        let bestDistance = NEAREST_PICK_MAX_DIST;
        for (const object of editableObjects) {
            object.getWorldPosition(nearestPickPoint);
            const distance = raycaster.ray.distanceToPoint(nearestPickPoint);
            if (distance < bestDistance) {
                bestDistance = distance;
                best = object;
            }
        }
        return best;
    }

    function pickHoveredLabObjectAt(clientX, clientY) {
        setPointerFromClient(clientX, clientY);
        raycaster.setFromCamera(pointer, camera);
        reconcileEditableObjects();
        const hits = raycaster.intersectObjects(editableObjects, true);
        for (const hit of hits) {
            const entity = resolveLabObject(hit);
            if (entity) return entity;
        }
        return null;
    }

    function pickLabObjectMeshAt(clientX, clientY) {
        setPointerFromClient(clientX, clientY);
        raycaster.setFromCamera(pointer, camera);
        reconcileEditableObjects();
        const objectHits = raycaster.intersectObjects(editableObjects, true);
        for (const hit of objectHits) {
            if (hit.object?.name === "shadow-overlay") continue;
            const entity = resolveLabObject(hit);
            if (entity) return entity;
        }

        let nearestLight = null;
        let nearestDistance = LIGHT_PICK_RADIUS;
        for (const object of editableObjects) {
            if (!isLabLight(object)) continue;
            object.getWorldPosition(lightPickPoint);
            const distance = raycaster.ray.distanceToPoint(lightPickPoint);
            if (distance < nearestDistance) {
                nearestDistance = distance;
                nearestLight = object;
            }
        }
        return nearestLight;
    }

    function pickLabObjectAt(clientX, clientY) {
        const meshHit = pickLabObjectMeshAt(clientX, clientY);
        if (meshHit) return meshHit;

        setPointerFromClient(clientX, clientY);
        raycaster.setFromCamera(pointer, camera);

        let bestObject = null;
        let bestDistance = Infinity;
        for (const object of editableObjects) {
            if (isLabLight(object)) continue;
            object.updateWorldMatrix(true, true);
            pickBox.setFromObject(object);
            pickBox.expandByScalar(PICK_BOX_PAD);
            const boxHit = pickBox.intersectRay(raycaster.ray, pickBoxPoint);
            if (!boxHit) continue;
            const dist = raycaster.ray.origin.distanceToSquared(boxHit);
            if (dist < bestDistance) {
                bestDistance = dist;
                bestObject = object;
            }
        }
        return bestObject;
    }

    function spawnPoint() {
        const dir = new THREE.Vector3();
        camera.getWorldDirection(dir);
        const origin = new THREE.Vector3();
        yaw.getWorldPosition(origin);
        const pos = origin.clone().add(dir.multiplyScalar(SPAWN_DISTANCE));
        return snapPlacement(pos);
    }

    spawnBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        if (suppressClick) return;
        spawnCubeAt();
    });

    spawnBtn.setAttribute("draggable", "true");
    spawnBtn.addEventListener("dragstart", (e) => {
        e.dataTransfer.setData(DRAG_MIME, "1");
        e.dataTransfer.effectAllowed = "copy";
        suppressClick = true;
        spawnBtn.classList.add("lab-side-panel__tool--dragging");
    });
    spawnBtn.addEventListener("dragend", () => {
        spawnBtn.classList.remove("lab-side-panel__tool--dragging");
        viewport.classList.remove("lab-viewport--drop");
        window.setTimeout(() => {
            suppressClick = false;
        }, 0);
    });

    let suppressSphereClick = false;
    if (spawnSphereBtn) {
        spawnSphereBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            if (suppressSphereClick) return;
            spawnSphereAt();
        });
        spawnSphereBtn.setAttribute("draggable", "true");
        spawnSphereBtn.addEventListener("dragstart", (e) => {
            e.dataTransfer.setData(DRAG_MIME_SPHERE, "1");
            e.dataTransfer.effectAllowed = "copy";
            suppressSphereClick = true;
            spawnSphereBtn.classList.add("lab-side-panel__tool--dragging");
        });
        spawnSphereBtn.addEventListener("dragend", () => {
            spawnSphereBtn.classList.remove("lab-side-panel__tool--dragging");
            viewport.classList.remove("lab-viewport--drop");
            window.setTimeout(() => {
                suppressSphereClick = false;
            }, 0);
        });
    }

    /**
     * @param {import("./lab-primitives.js").LabPrimitiveShape} shape
     * @param {HTMLButtonElement | null | undefined} btn
     */
    function bindPrimitiveSpawnButton(shape, btn) {
        if (!btn || shape === "box" || shape === "sphere") return;
        const mime = PRIMITIVE_META[shape].mime;
        let suppress = false;
        btn.addEventListener("click", (e) => {
            e.stopPropagation();
            if (suppress) return;
            spawnPrimitiveAt(shape);
        });
        btn.setAttribute("draggable", "true");
        btn.addEventListener("dragstart", (e) => {
            e.dataTransfer.setData(mime, "1");
            e.dataTransfer.effectAllowed = "copy";
            suppress = true;
            btn.classList.add("lab-side-panel__tool--dragging");
        });
        btn.addEventListener("dragend", () => {
            btn.classList.remove("lab-side-panel__tool--dragging");
            viewport.classList.remove("lab-viewport--drop");
            window.setTimeout(() => {
                suppress = false;
            }, 0);
        });
    }

    for (const shape of /** @type {import("./lab-primitives.js").LabPrimitiveShape[]} */ ([
        "pyramid",
        "cylinder",
        "cone",
        "torus",
        "panel",
    ])) {
        bindPrimitiveSpawnButton(shape, spawnPrimitiveBtns?.[shape]);
    }

    if (spawnStairBtn) {
        spawnStairBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            if (suppressStairClick) return;
            spawnStairAt(undefined, STAIR_DEFAULT_STEP_COUNT);
        });

        spawnStairBtn.setAttribute("draggable", "true");
        spawnStairBtn.addEventListener("dragstart", (e) => {
            e.dataTransfer.setData(DRAG_MIME_STAIR, "1");
            e.dataTransfer.effectAllowed = "copy";
            suppressStairClick = true;
            spawnStairBtn.classList.add("lab-side-panel__tool--dragging");
        });
        spawnStairBtn.addEventListener("dragend", () => {
            spawnStairBtn.classList.remove("lab-side-panel__tool--dragging");
            viewport.classList.remove("lab-viewport--drop");
            window.setTimeout(() => {
                suppressStairClick = false;
            }, 0);
        });
    }

    if (spawnTubeBtn) {
        spawnTubeBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            if (suppressTubeClick) return;
            spawnTubeAt();
        });

        spawnTubeBtn.setAttribute("draggable", "true");
        spawnTubeBtn.addEventListener("dragstart", (e) => {
            e.dataTransfer.setData(DRAG_MIME_TUBE, "1");
            e.dataTransfer.effectAllowed = "copy";
            suppressTubeClick = true;
            spawnTubeBtn.classList.add("lab-side-panel__tool--dragging");
        });
        spawnTubeBtn.addEventListener("dragend", () => {
            spawnTubeBtn.classList.remove("lab-side-panel__tool--dragging");
            viewport.classList.remove("lab-viewport--drop");
            window.setTimeout(() => {
                suppressTubeClick = false;
            }, 0);
        });
    }

    const canvas = renderer.domElement;

    canvas.addEventListener("dragover", (e) => {
        const types = e.dataTransfer.types;
        const isPrimitive = ALL_PRIMITIVE_DRAG_MIMES.some((m) => types.includes(m));
        if (!isPrimitive && !types.includes(DRAG_MIME_STAIR) && !types.includes(DRAG_MIME_TUBE)) {
            return;
        }
        e.preventDefault();
        e.dataTransfer.dropEffect = "copy";
        viewport.classList.add("lab-viewport--drop");
    });

    canvas.addEventListener("dragleave", (e) => {
        if (!canvas.contains(e.relatedTarget)) {
            viewport.classList.remove("lab-viewport--drop");
        }
    });

    canvas.addEventListener("drop", (e) => {
        const types = e.dataTransfer.types;
        const isStair = types.includes(DRAG_MIME_STAIR);
        const isTube = types.includes(DRAG_MIME_TUBE);
        /** @type {import("./lab-primitives.js").LabPrimitiveShape | null} */
        let dropShape = null;
        for (const [shape, meta] of Object.entries(PRIMITIVE_META)) {
            if (types.includes(meta.mime)) {
                dropShape = /** @type {import("./lab-primitives.js").LabPrimitiveShape} */ (shape);
                break;
            }
        }
        if (!isStair && !isTube && !dropShape) return;
        e.preventDefault();
        viewport.classList.remove("lab-viewport--drop");
        const pos = raycastToFloor(e.clientX, e.clientY);
        if (!pos) return;
        if (isStair) {
            spawnStairAt(pos, STAIR_DEFAULT_STEP_COUNT);
        } else if (isTube) {
            spawnTubeAt(pos);
        } else if (dropShape) {
            spawnPrimitiveAt(dropShape, pos);
        }
    });

    if (hoverTooltip) {
        canvas.addEventListener("mousemove", (event) => {
            if (isGizmoDragging?.()) {
                hoverTooltip.hidden = true;
                return;
            }
            if (canInteractAt && !canInteractAt(event.clientX, event.clientY)) {
                hoverTooltip.hidden = true;
                return;
            }
            const labObject = pickHoveredLabObjectAt(event.clientX, event.clientY);
            const label = labObject?.userData?.sceneItemLabel;
            if (!label) {
                hoverTooltip.hidden = true;
                hoverTooltip.textContent = "";
                return;
            }
            hoverTooltip.textContent = label;
            hoverTooltip.style.left = `${event.clientX + 14}px`;
            hoverTooltip.style.top = `${event.clientY + 14}px`;
            hoverTooltip.hidden = false;
        });
        canvas.addEventListener("mouseleave", () => {
            hoverTooltip.hidden = true;
            hoverTooltip.textContent = "";
        });
    }

    function pickPaintHit(clientX, clientY) {
        setPointerFromClient(clientX, clientY);
        raycaster.setFromCamera(pointer, camera);
        reconcileEditableObjects();
        /** @type {THREE.Object3D[]} */
        const roots = [...editableObjects];
        if (triangulationMode) {
            const terrain = ensureTerrainReadyForTriangulation();
            if (terrain && !roots.includes(terrain)) roots.push(terrain);
        }
        const hits = raycaster.intersectObjects(roots, true);
        for (const hit of hits) {
            if (!(hit.object instanceof THREE.Mesh)) continue;
            if (hit.object.userData?._labNoPaintPick) continue;
            if (hit.object.name === TRI_OVERLAY_NAME) continue;
            const entity = resolveLabObject(hit);
            if (!entity || isLabLight(entity)) continue;
            if (triangulationMode) {
                if (!hit.face && (hit.faceIndex == null || hit.faceIndex < 0)) continue;
                return { entity, mesh: hit.object, hit };
            }
            if (isLabTerrainObject(entity)) continue;
            if (!isPaintableBoxMesh(hit.object)) continue;
            return { entity, mesh: hit.object, hit };
        }
        return null;
    }

    function resolveLabObject(hit) {
        let current = hit.object;
        while (current) {
            if (isEditableEntity(current) || isLabTerrainObject(current)) return current;
            current = current.parent;
        }
        return null;
    }

    function buildContextMenuState(labObject) {
        if (isLabLight(labObject)) {
            return {
                kind: "light",
                lightType: labObject.userData.lightType,
                markerVisible: isLightMarkerVisible(labObject),
                intensity: getLightIntensity(labObject),
                spotAngle: getLightSpotAngleDeg(labObject),
            };
        }
        if (isLabStair(labObject)) {
            const stepCount = getStairStepCount(labObject);
            const thickness = getStairThickness(labObject);
            const summary = formatStairHeightSummary(stepCount, { thickness });
            return {
                kind: "stair",
                collision: !!labObject.userData[COLLISION_KEY],
                stairStepCount: summary.stepCount,
                stairStepRiseLabel: summary.stepRiseLabel,
                stairTotalHeightLabel: summary.totalHeightLabel,
                stairThickness: thickness,
                stairShape: getStairShape(labObject),
                stairRadius: getStairRadius(labObject),
                stairArcDeg: getStairArcDeg(labObject),
                color: getObjectColor(labObject),
                texture: getObjectTextureDataUrl(labObject),
                normalTexture: getObjectNormalTextureDataUrl(labObject),
                textureTile: getObjectTextureTile(labObject),
                normalScale: getObjectNormalScale(labObject),
                roughness: getObjectRoughness(labObject),
                metalness: getObjectMetalness(labObject),
                opacity: getObjectOpacity(labObject),
                glass: isObjectGlassEnabled(labObject),
                smooth: getObjectSmooth(labObject),
            };
        }
        if (isLabLanding(labObject)) {
            return {
                kind: "landing",
                collision: !!labObject.userData[COLLISION_KEY],
                stairThickness: getLandingThickness(labObject),
                color: getObjectColor(labObject),
                texture: getObjectTextureDataUrl(labObject),
                normalTexture: getObjectNormalTextureDataUrl(labObject),
                textureTile: getObjectTextureTile(labObject),
                normalScale: getObjectNormalScale(labObject),
                roughness: getObjectRoughness(labObject),
                metalness: getObjectMetalness(labObject),
                opacity: getObjectOpacity(labObject),
                glass: isObjectGlassEnabled(labObject),
                smooth: getObjectSmooth(labObject),
            };
        }
        if (isLabTube(labObject)) {
            return {
                kind: "tube",
                collision: !!labObject.userData[COLLISION_KEY],
                tubeLength: getTubeLength(labObject),
                tubeRadius: getTubeRadius(labObject),
                tubeWall: getTubeWall(labObject),
                color: getObjectColor(labObject),
                texture: getObjectTextureDataUrl(labObject),
                normalTexture: getObjectNormalTextureDataUrl(labObject),
                textureTile: getObjectTextureTile(labObject),
                normalScale: getObjectNormalScale(labObject),
                roughness: getObjectRoughness(labObject),
                metalness: getObjectMetalness(labObject),
                opacity: getObjectOpacity(labObject),
                glass: isObjectGlassEnabled(labObject),
                smooth: getObjectSmooth(labObject),
            };
        }
        if (isLabVegetation(labObject)) {
            return {
                kind: "object",
                collision: !!labObject.userData[COLLISION_KEY],
                color: getObjectColor(labObject),
                texture: getObjectTextureDataUrl(labObject),
                normalTexture: getObjectNormalTextureDataUrl(labObject),
                textureTile: getObjectTextureTile(labObject),
                normalScale: getObjectNormalScale(labObject),
                roughness: getObjectRoughness(labObject),
                metalness: getObjectMetalness(labObject),
                opacity: getObjectOpacity(labObject),
                glass: isObjectGlassEnabled(labObject),
                smooth: getObjectSmooth(labObject),
            };
        }
        return {
            kind: "object",
            collision: !!labObject.userData[COLLISION_KEY],
            color: getObjectColor(labObject),
            texture: getObjectTextureDataUrl(labObject),
            normalTexture: getObjectNormalTextureDataUrl(labObject),
            textureTile: getObjectTextureTile(labObject),
            normalScale: getObjectNormalScale(labObject),
            roughness: getObjectRoughness(labObject),
            metalness: getObjectMetalness(labObject),
            opacity: getObjectOpacity(labObject),
            glass: isObjectGlassEnabled(labObject),
            smooth: getObjectSmooth(labObject),
        };
    }

    function showContextMenuForLabObject(labObject, clientX, clientY) {
        if (!labObject) return;
        selectObject(labObject, { highlight: true });
        contextMenu.show(
            clientX,
            clientY,
            labObject,
            buildContextMenuState(labObject)
        );
    }

    function showContextMenuForSceneItem(itemId, event) {
        reconcileEditableObjects();
        let labObject = editableObjects.find(
            (object) => object.userData[SCENE_ITEM_ID_KEY] === itemId
        );
        if (!labObject) {
            sceneRegistry?.selectItem(itemId);
            labObject = selectedObject;
        }
        if (!labObject) return;
        showContextMenuForLabObject(labObject, event.clientX, event.clientY);
    }

    function handleCanvasRightClick(event) {
        if (isGizmoDragging?.()) return;
        if (canInteractAt && !canInteractAt(event.clientX, event.clientY)) return;

        reconcileEditableObjects();
        let labObject = pickLabObjectAt(event.clientX, event.clientY);
        if (
            !labObject &&
            selectedObject &&
            editableObjects.includes(selectedObject)
        ) {
            labObject = selectedObject;
        }
        if (!labObject && editableObjects.length) {
            labObject = pickNearestLabObjectToRay(event.clientX, event.clientY);
        }
        if (labObject) {
            showContextMenuForLabObject(labObject, event.clientX, event.clientY);
            return;
        }

        deselectObject();
        contextMenu.hide();
    }

    canvasRightClickImpl = handleCanvasRightClick;

    contextMenu.onAction((action, object, detail) => {
        if (action === "csg-subtract" && canCsgLabObject(object) && !isLabLight(object)) {
            selectObject(object, { highlight: true });
            csgTool?.startPickMode(object);
            return;
        }
        if (action === "stair-add-landing") {
            addLandingAfterStairAction(object);
            return;
        }
        if (action === "stair-continue-90") {
            continueStairFromLandingAction(object, 90);
            return;
        }
        if (action === "stair-continue--90") {
            continueStairFromLandingAction(object, -90);
            return;
        }
        if (action === "stair-continue-180") {
            continueStairFromLandingAction(object, 180);
            return;
        }
        if (action === "tube-continue-pos") {
            continueTubeAction(object, 1, detail || {});
            return;
        }
        if (action === "tube-continue-neg") {
            continueTubeAction(object, -1, detail || {});
        }
    });

    contextMenu.onPropertyChange((prop, object, value) => {
        if (
            isLabVegetation(object) &&
            (prop === "color" ||
                prop === "color-preview" ||
                prop === "texture" ||
                prop === "texture-clear" ||
                prop === "normal-texture" ||
                prop === "normal-texture-clear" ||
                prop === "roughness" ||
                prop === "metalness" ||
                prop === "opacity" ||
                prop === "glass" ||
                prop === "smooth" ||
                prop === "metal-preset" ||
                prop === "normal-scale" ||
                prop === "texture-tile")
        ) {
            return;
        }
        if (prop === "stair-steps") applyStairParams(object, { stepCount: Number(value) });
        if (prop === "stair-thickness") applyStairParams(object, { thickness: Number(value) });
        if (prop === "stair-shape") applyStairParams(object, { shape: String(value) });
        if (prop === "stair-radius") applyStairParams(object, { radius: Number(value) });
        if (prop === "stair-arc") applyStairParams(object, { arcDeg: Number(value) });
        if (prop === "tube-length") applyTubeParams(object, { length: Number(value) });
        if (prop === "tube-radius") applyTubeParams(object, { radius: Number(value) });
        if (prop === "tube-wall") applyTubeParams(object, { wall: Number(value) });
        if (prop === "collision") setCollision(object, !!value);
        if (prop === "light-marker-visible") setLightMarkerVisibility(object, !!value);
        if (prop === "light-intensity") setLightIntensityValue(object, Number(value));
        if (prop === "spot-angle") setLightSpotAngleValue(object, Number(value));
        if (prop === "color-preview") applyObjectColor(object, String(value));
        if (prop === "color") setObjectColor(object, String(value));
        if (prop === "texture") setObjectTexture(object, value ? String(value) : null);
        if (prop === "texture-clear") setObjectTexture(object, null);
        if (prop === "normal-texture") setObjectNormalTexture(object, value ? String(value) : null);
        if (prop === "normal-texture-clear") setObjectNormalTexture(object, null);
        if (prop === "roughness") setObjectRoughness(object, Number(value));
        if (prop === "metalness") setObjectMetalness(object, Number(value));
        if (prop === "opacity") setObjectOpacity(object, Number(value));
        if (prop === "glass") setObjectGlass(object, !!value);
        if (prop === "smooth") setObjectSmooth(object, !!value);
        if (prop === "metal-preset") applyMetalPreset(object);
        if (prop === "normal-scale") setObjectNormalScale(object, Number(value));
        if (prop === "texture-tile") setObjectTextureTile(object, Number(value));
        if (prop === "texture-error" || prop === "normal-texture-error") {
            showStatus(value instanceof Error ? value.message : "Image invalide");
        }
    });

    function handleCanvasLeftClick(event) {
        if (isGizmoDragging?.()) return;
        if (canInteractAt && !canInteractAt(event.clientX, event.clientY)) return;
        if (ignoreClickAfterGizmo) {
            ignoreClickAfterGizmo = false;
            return;
        }
        if (vegetationPlaceActive) {
            const pos = raycastToFloor(event.clientX, event.clientY);
            if (pos) {
                void spawnVegetationAt(pos).then(() => {
                    setVegetationPlaceActive(false);
                });
            } else {
                showStatus("Cliquez sur le sol ou le terrain");
            }
            return;
        }
        if (csgTool?.handleCanvasClick(event.clientX, event.clientY)) {
            return;
        }

        const labObject = pickLabObjectMeshAt(event.clientX, event.clientY);
        const additive = !!(event.ctrlKey || event.metaKey);

        if (additive) {
            const target = labObject || pickLabObjectAt(event.clientX, event.clientY);
            if (target) selectObject(target, { highlight: true, additive: true });
            return;
        }

        // Hors géométrie réelle → tout désélectionner (pas de pick AABB « soft »)
        if (!labObject) {
            deselectObject();
            return;
        }

        if (!selectedObjects.includes(labObject)) {
            selectObject(labObject, { highlight: true, additive: false });
            return;
        }

        // Clic sur un objet déjà sélectionné : seul → désélection ; multi → ne garder que celui-ci
        if (selectedObjects.length === 1) {
            deselectObject();
            return;
        }
        selectObject(labObject, { highlight: true, additive: false });
    }

    setCanvasLeftClickHandler(handleCanvasLeftClick);

    function handleCanvasDoubleClick(event) {
        if (isGizmoDragging?.()) return;
        if (canInteractAt && !canInteractAt(event.clientX, event.clientY)) return;
        const labObject = pickLabObjectAt(event.clientX, event.clientY);
        if (!labObject) return;
        focusOnObject?.(labObject);
    }

    setCanvasDoubleClickHandler(handleCanvasDoubleClick);

    setAfterRender?.(() => {
        updateLightHelpers(editableObjects);
        for (const helper of selectionHelpers.values()) helper.update();
    });

    function wireLightButton(button, type) {
        if (!button) return;
        button.addEventListener("click", (e) => {
            e.stopPropagation();
            const light = spawnLightAt(type);
            showStatus(`${getLightLabel(type)} ajouté`);
            return light;
        });
    }

    wireLightButton(lightBtns?.spot, LIGHT_TYPE.SPOT);
    wireLightButton(lightBtns?.sun, LIGHT_TYPE.SUN);
    wireLightButton(lightBtns?.lamp, LIGHT_TYPE.LAMP);

    if (
        drawBtn &&
        drawPanel &&
        drawColorInput &&
        drawToolSelect &&
        drawSizeInput &&
        setDrawModeActive
    ) {
        faceDrawController = initFaceDrawController({
            canvas,
            drawBtn,
            drawPanel,
            colorInput: drawColorInput,
            toolSelect: drawToolSelect,
            sizeInput: drawSizeInput,
            opacityInput: drawOpacityInput,
            textureBtn: drawTextureBtn,
            textureClearBtn: drawTextureClearBtn,
            tileXInput: drawTileXInput,
            tileYInput: drawTileYInput,
            offsetXInput: drawOffsetXInput,
            offsetYInput: drawOffsetYInput,
            faceTextureBtn: drawFaceTextureBtn,
            faceTextureClearBtn: drawFaceTextureClearBtn,
            applyTrianglesBtn: drawApplyTrianglesBtn,
            clearTrianglesBtn: drawClearTrianglesBtn,
            decalBtn: drawDecalBtn,
            decalClearBtn: drawDecalClearBtn,
            setDrawModeActive,
            isTriangulationMode: () => triangulationMode,
            enterExplore,
            setSelectionOnlyMode,
            showStatus,
            pickPaintHit,
            recordPaintHistory: ({ object, faceIndex, before, after }) => {
                history.push({ type: "face-paint", object, faceIndex, before, after });
            },
        });
    }

    if (
        voiceBtn &&
        voicePanel &&
        voiceModeSelect &&
        voiceStartBtn &&
        voiceX &&
        voiceY &&
        voiceZ &&
        voiceHint
    ) {
        initVoiceTransformController({
            voiceBtn,
            voicePanel,
            voiceModeSelect,
            voiceStartBtn,
            voiceX,
            voiceY,
            voiceZ,
            voiceHint,
            showStatus,
            getSelectedCube: () => (selectedObject && isLabObject(selectedObject) ? selectedObject : null),
            applyCubeDimensions,
            applyCubePosition,
            applyCubeRotation,
            getSnapEnabled: (mode) => {
                if (mode === "position") return snapByMode.translate;
                if (mode === "rotation") return snapByMode.rotate;
                return snapByMode.scale;
            },
        });
    }

    if (csgBtn) {
        csgTool = initCsgTool({
            csgBtn,
            viewport,
            showStatus,
            getSelectedObject: () =>
                selectedObject && canCsgLabObject(selectedObject) && !isLabLight(selectedObject)
                    ? selectedObject
                    : null,
            pickLabObjectAt: (clientX, clientY) => {
                const object = pickLabObjectAt(clientX, clientY);
                return object && canCsgLabObject(object) && !isLabLight(object) ? object : null;
            },
            canPerforate: (object) => !!object && canCsgLabObject(object) && !isLabLight(object),
            performSubtract: performCsgSubtract,
        });
    }

    if (vegetationUi?.typeButtons) {
        for (const btn of vegetationUi.typeButtons) {
            btn.addEventListener("click", (e) => {
                e.stopPropagation();
                const type = btn.getAttribute("data-veg-type");
                if (type) setVegetationType(/** @type {import("./lab-vegetation.js").VegType} */ (type));
            });
        }
        syncVegetationTypeButtons();
        syncVegetationModelUi();
    }

    vegetationUi?.heightInput?.addEventListener("input", () => {
        const h = Number(vegetationUi.heightInput?.value) || 1;
        if (vegetationUi.heightValue) {
            vegetationUi.heightValue.textContent = formatVegHeightLabel(h);
        }
    });

    vegetationUi?.brightnessInput?.addEventListener("input", () => {
        const b = clampVegetationBrightness(
            Number(vegetationUi.brightnessInput?.value) || DEFAULT_VEGETATION_BRIGHTNESS
        );
        if (vegetationUi.brightnessValue) {
            vegetationUi.brightnessValue.textContent = formatVegBrightnessLabel(b);
        }
        applyBrightnessToAllModelVegetation(b);
    });

    vegetationUi?.placeBtn?.addEventListener("click", (e) => {
        e.stopPropagation();
        if (!vegetationPlaceActive && vegetationType === "model" && !getActiveVegetationAssetId()) {
            showStatus("Importez d’abord un modèle .glb");
            return;
        }
        setVegetationPlaceActive(!vegetationPlaceActive);
    });

    vegetationUi?.applyBrushBtn?.addEventListener("click", (e) => {
        e.stopPropagation();
        setVegetationPlaceActive(false);
        void applyVegetationBrushTexture({ activatePaint: true });
    });

    vegetationUi?.importBtn?.addEventListener("click", (e) => {
        e.stopPropagation();
        if (vegetationUi.fileInput) {
            void pickFilePreservingFullscreen(vegetationUi.fileInput);
        }
    });

    vegetationUi?.fileInput?.addEventListener("change", () => {
        const file = vegetationUi.fileInput?.files?.[0];
        if (vegetationUi.fileInput) vegetationUi.fileInput.value = "";
        if (file) void importVegetationModelFile(file);
    });

    return {
        deselectObject,
        spawnCubeAt,
        spawnSphereAt,
        spawnPrimitiveAt,
        spawnStairAt,
        spawnTubeAt,
        spawnVegetationAt,
        spawnImportedModelFile,
        spawnLightAt,
        registerLabObject,
        setTransformMode,
        toggleCollision,
        transformControls,
        showContextMenuForSceneItem,
        newScene,
        openScene,
        openSceneFromDisk,
        saveScene,
        saveSceneAs,
        saveSceneToDisk,
        closeScene,
        setTriangulationMode: (enabled) => {
            triangulationMode = !!enabled;
            document.documentElement.classList.toggle("lab-triangulation-mode", triangulationMode);
            if (triangulationMode) {
                faceDrawController?.setActive?.(true);
            }
            applyTriangulationOverlays(triangulationMode);
            if (!triangulationMode) {
                faceDrawController?.clearTriangleSelection?.();
            }
            showStatus(
                triangulationMode
                    ? "Mode triangulation activé — objets et terrain"
                    : "Mode triangulation désactivé"
            );
        },
        isTriangulationMode: () => triangulationMode,
        clearTriangleSelection: () => faceDrawController?.clearTriangleSelection?.(),
    };
}
