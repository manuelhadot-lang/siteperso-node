/** Objets de scène : placement, sélection, transformation, collisions. */
import * as THREE from "three";
import { TransformControls } from "three/addons/controls/TransformControls.js";
import {
    COLLISION_KEY,
    PLAYER_HEIGHT,
    PLAYER_RADIUS,
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
    applyArchSurfaceTexturesData,
    applyFacePaintData,
    applyFacePbrStoreData,
    applyTriangleTexturesData,
    clearTriangleTextureOverlays,
    disposeFacePaint,
    ensurePaintReady,
    getPaintableMesh,
    initFaceDrawController,
    restoreFaceSnapshot,
    serializeArchSurfaceTextures,
    serializeFacePaint,
    serializeFacePbrStore,
    serializeTriangleTextures,
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
    buildArchitectureGroup,
    rebuildArchitectureGroup,
    isLabArchitecture,
    isLabArchOpeningFill,
    findArchOpeningFillAncestor,
    getArchHostFromFill,
    findArchOpeningFill,
    readArchOpeningFillTx,
    getArchLength,
    getArchWidth,
    getArchHeight,
    getArchWall,
    getArchHasCeiling,
    getArchHasPlinth,
    getArchPlinthFloors,
    hasArchPlinthOnFloor,
    normalizeArchPlinthFloors,
    getArchOpenings,
    archOpeningsSignature,
    setArchOpeningImportTemplate,
    getArchOpeningImportTemplate,
    createDefaultOpening,
    openingBelongsToArchFace,
    createDefaultSlabHole,
    clampArchLength,
    clampArchWidth,
    clampArchHeight,
    clampArchWall,
    clampOpeningOffset,
    clampOpeningOffsetZ,
    clampOpeningWidth,
    clampOpeningHeight,
    normalizeArchSurface,
    isArchSlabSurface,
    getArchSurfaceId,
    getArchStoryFromMesh,
    estimateArchStoryFromLocalY,
    getArchWallOffsetFromLocalPoint,
    getArchStoryPitch,
    getArchLayout,
    getArchLayoutPreset,
    normalizeArchLayout,
    getArchWingA,
    getArchWingB,
    getArchFloors,
    clampArchWingA,
    clampArchWingB,
    clampArchFloors,
    ARCH_LAYOUT_LABELS,
    ARCH_WALL_LABELS,
    ARCH_OPENINGS_KEY,
} from "./lab-architecture.js";
import {
    buildBoatGroup,
    getBoatWoodTextureDataUrl,
    getBoatLength,
    getBoatWidth,
    getBoatShell,
    getBoatStandPoint,
    applyBoatFloatMetadata,
    setBoatVisualContent,
    clearBoatVisual,
    measureBoatFootprint,
    prepareBoatForFloat,
    getBoatKeelOffset,
    getBoatDraft,
    getBoatDensity,
    setBoatDensity,
    isLabBoat,
    isBoatFloating,
    updateBoatFloat,
    BOAT_DEFAULT_LENGTH,
    BOAT_DEFAULT_WIDTH,
    BOAT_DRAFT,
    BOAT_FLOAT_KEY,
    BOAT_SHELL_KEY,
    BOAT_BASE_KIND_KEY,
} from "./lab-boat.js";
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
    parseModelData,
    prepareImportedContent,
    ensureImportedMeshPersistIds,
} from "./lab-import.js";
import {
    solidifyObjectMeshes,
    clampSolidifyThickness,
    DEFAULT_SOLIDIFY_THICKNESS,
    serializeMeshSolidify,
} from "./lab-solidify.js";
import {
    serializeImportedAppearance,
    restoreImportedAppearance,
} from "./lab-import-appearance.js";
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
    applyObjectRoughnessTexture,
    applyObjectSmooth,
    applyObjectSpecularTexture,
    applyObjectTexture,
    applyObjectTextureTile,
    applyObjectTextureTransform,
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
    getObjectRoughnessTextureDataUrl,
    getObjectSmooth,
    getObjectSpecularTextureDataUrl,
    getObjectTextureDataUrl,
    getObjectTextureOffsetX,
    getObjectTextureOffsetY,
    getObjectTextureOffsetZ,
    getObjectTextureTile,
    getObjectTextureTileX,
    getObjectTextureTileY,
    getObjectTextureTileZ,
    isObjectGlassEnabled,
    METALNESS_MAX,
    NORMAL_SCALE_MAX,
    OBJECT_GLASS_KEY,
    OBJECT_NORMAL_SCALE_KEY,
    OBJECT_OPACITY_KEY,
    OBJECT_ROUGHNESS_KEY,
    OBJECT_METALNESS_KEY,
    OBJECT_SMOOTH_KEY,
    OBJECT_TEXTURE_TILE_KEY,
    OPACITY_MAX,
    OPACITY_MIN,
    TEXTURE_TILE_MAX,
    TEXTURE_TILE_MIN,
    releaseObjectNormalTexture,
    releaseObjectSpecularTexture,
    releaseObjectTexture,
    syncObjectUvTransforms,
} from "./lab-object-textures.js";
import { initObjectContextMenu } from "./lab-context-menu.js";
import { exportObjectGltf, objectToGlbDataUrl } from "./lab-export.js";
import {
    applyObjectPhysicsData,
    disposeObjectPhysics,
    getObjectPhysicsBounce,
    getObjectPhysicsMass,
    getObjectPhysicsTeaching,
    isObjectPhysicsEnabled,
    serializeObjectPhysics,
    setObjectPhysicsBounce,
    setObjectPhysicsEnabled,
    setObjectPhysicsMass,
    stepPhysicsObjects,
    wakeObjectPhysics,
} from "./lab-object-physics.js";
import {
    splitObjectMeshesByIslands,
    extractSelectedTrianglesFromMesh,
} from "./lab-mesh-split.js";
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
import { closeLabDialog, labConfirm, labPickScene, labPrompt } from "./lab-dialog.js";
import {
    attachLightHelper,
    createLightPivot,
    disposeLightPivot,
    detachLightHelper,
    getLightIntensity,
    getLightLabel,
    getLightSpotAngleDeg,
    getLightSpotPenumbra,
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
    setLightSpotPenumbra,
    orientLightPivotToward,
    syncLightAim,
    updateLightHelpers,
} from "./lab-lights.js";
import { reflectionToPbr, envMapIntensityForMaterial, WAXED_REFLECTION } from "./lab-mirror.js";
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
const DRAG_MIME_BOAT = "application/x-lab-boat";
const DRAG_MIME_ARCHITECTURE = "application/x-lab-architecture";
const ALL_PRIMITIVE_DRAG_MIMES = Object.values(PRIMITIVE_META).map((m) => m.mime);
const SPAWN_DISTANCE = 2.5;
const DEFAULT_STAIR_COLOR = "#8b9cb3";
const DEFAULT_TUBE_COLOR = "#00d1ff";
const DEFAULT_ARCHITECTURE_COLOR = "#c8c2b4";
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
 *   focusOnPoint?: (point: THREE.Vector3 | { x: number, y: number, z: number }, opts?: { normal?: THREE.Vector3 | { x: number, y: number, z: number } | null, distance?: number }) => void,
 *   setOrbitTarget?: (target: THREE.Vector3 | { x: number, y: number, z: number } | null, opts?: { frame?: boolean }) => void,
 *   serializeView?: () => object,
 *   restoreView?: (view: unknown) => boolean,
 *   onGizmoDraggingChange?: (dragging: boolean) => void,
 *   setCanvasRightClickHandler: (fn: (e: MouseEvent) => void) => void,
 *   setCanvasLeftClickHandler: (fn: (e: MouseEvent) => void) => void,
 *   setCanvasDoubleClickHandler: (fn: (e: MouseEvent) => void) => void,
 *   setAfterRender?: (fn: () => void) => void,
 *   setBeforeRender?: (fn: () => void) => void,
 *   getPointerRect?: () => DOMRect,
 *   canInteractAt?: (clientX: number, clientY: number) => boolean,
 *   sceneRegistry?: ReturnType<import("./lab-scene-registry.js").createSceneRegistry> | null,
 *   isGizmoDragging?: () => boolean,
 *   drawBtn?: HTMLButtonElement | null,
 *   drawPanel?: HTMLElement | null,
 *   drawColorInput?: HTMLInputElement | null,
 *   drawSizeInput?: HTMLInputElement | null,
 *   drawOpacityInput?: HTMLInputElement | null,
 *   drawTileXInput?: HTMLInputElement | null,
 *   drawTileYInput?: HTMLInputElement | null,
 *   drawOffsetXInput?: HTMLInputElement | null,
 *   drawOffsetYInput?: HTMLInputElement | null,
 *   setDrawModeActive?: (active: boolean) => void,
 *   setPaintStrokeActive?: (active: boolean) => void,
 *   cancelLookGesture?: () => void,
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
 *   spawnBoatBtn?: HTMLButtonElement | null,
 *   spawnArchitectureBtns?: NodeListOf<HTMLButtonElement> | HTMLButtonElement[] | null,
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
 *   setAvatarPlaceModeActive?: (value: boolean) => void,
 *   setLightPlaceModeActive?: (value: boolean) => void,
 *   placePlayerAt?: (x: number | THREE.Vector3, y?: number | object, z?: number, opts?: object) => boolean,
 *   placeAvatarBtn?: HTMLButtonElement | null,
 *   terrainController?: { clear: (opts?: { recordHistory?: boolean }) => void, serialize: () => object | null, deserialize: (data: unknown, opts?: { recordHistory?: boolean }) => Promise<void>, hasTerrain: () => boolean, getTerrain: () => THREE.Object3D | null, tryUndoShortcut?: () => boolean, tryRedoShortcut?: () => boolean, getUndoDepth?: () => number, getRedoDepth?: () => number, isUndoInProgress?: () => boolean, setSceneHistoryPush?: (fn: ((entry: unknown) => void) | null) => void, applyBrushTextureFromDataUrl?: (dataUrl: string, opts?: { activatePaint?: boolean }) => Promise<boolean>, stampBrushAtWorld?: (worldX: number, worldZ: number, radiusMeters: number) => boolean, ensureTerrain?: () => unknown },
 *   oceanController?: { clear?: () => void, remove?: (opts?: { recordHistory?: boolean }) => void, serialize: () => object | null, deserialize: (data: unknown, opts?: { recordHistory?: boolean }) => Promise<void>, isActive?: () => boolean, getWaveHeightAt?: (x: number, z: number) => number | null, tick?: (dt: number) => void, setSceneHistoryPush?: (fn: ((entry: unknown) => void) | null) => void },
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
        focusOnPoint,
        setOrbitTarget,
        serializeView,
        restoreView,
        onGizmoDraggingChange,
        setCanvasRightClickHandler,
        setCanvasLeftClickHandler,
        setCanvasDoubleClickHandler,
        setAfterRender,
        setBeforeRender,
        getPointerRect,
        canInteractAt,
        sceneRegistry,
        isGizmoDragging,
        drawBtn,
        drawPanel,
        drawColorInput,
        drawSizeInput,
        drawOpacityInput,
        drawTileXInput,
        drawTileYInput,
        drawOffsetXInput,
        drawOffsetYInput,
        setDrawModeActive,
        setPaintStrokeActive,
        cancelLookGesture,
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
        spawnBoatBtn,
        spawnArchitectureBtns,
        hoverTooltip,
        vegetationUi,
        setVegetationPlaceModeActive,
        setAvatarPlaceModeActive,
        setLightPlaceModeActive,
        placePlayerAt,
        placeAvatarBtn,
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
    /** @type {"object" | "face" | "triangles"} */
    let textureApplyMode = "object";

    function syncTextureModeDocClass() {
        document.documentElement.classList.toggle(
            "lab-triangulation-mode",
            triangulationMode || textureApplyMode === "triangles"
        );
        document.documentElement.classList.toggle("lab-face-apply-mode", textureApplyMode === "face");
    }
    /** @type {ReturnType<typeof setTimeout> | null} */
    let archOpeningDebounce = null;
    /** @type {{ object: THREE.Object3D, openings: import("./lab-architecture.js").ArchOpening[] } | null} */
    let archOpeningPending = null;

    /**
     * Debounce rebuild ouvertures (taille / offset) — flush immédiat au commit (change).
     * @param {THREE.Object3D} object
     * @param {import("./lab-architecture.js").ArchOpening[]} openings
     * @param {{ commit?: boolean }} [options]
     */
    function queueArchitectureOpenings(object, openings, options = {}) {
        archOpeningPending = { object, openings };
        if (archOpeningDebounce) clearTimeout(archOpeningDebounce);
        const flush = () => {
            const pending = archOpeningPending;
            archOpeningPending = null;
            archOpeningDebounce = null;
            if (!pending || !isLabArchitecture(pending.object)) return;
            applyArchitectureParams(pending.object, { openings: pending.openings }, {
                recordHistory: true,
                quietUi: true,
            });
            syncArchitectureContextMenu(pending.object);
        };
        if (options.commit) {
            flush();
            return;
        }
        archOpeningDebounce = setTimeout(flush, 140);
    }
    /**
     * Dernière cible Tile/Offset (objet entier OU lot de triangles / face).
     * @type {{ kind: "object", object: THREE.Object3D } | { kind: "triangles", overlays: THREE.Mesh[] } | { kind: "face" } | null}
     */
    let lastUvEditTarget = null;
    /** Snapshot UV avant un geste de slider (pour Ctrl+Z). */
    let uvGestureBefore = null;
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
                    child.name === "lab-triangle-selection-overlay" ||
                    child.name === "lab-face-selection-overlay")
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
    let boatCounter = 0;
    let architectureCounter = 0;
    let vegetationCounter = 0;
    let importedCounter = 0;
    /** @type {Map<string, THREE.Object3D>} */
    const importedTemplateCache = new Map();
    /** @type {Map<string, Promise<THREE.Object3D>>} */
    const importedTemplateLoading = new Map();
    /** Séquence d’import de scène (ignore les jobs d’apparence périmés). */
    let sceneImportSeq = 0;
    /** @type {number} */
    let currentSceneImportSeq = 0;
    /** @type {Promise<void>} */
    let importSceneDocumentChain = Promise.resolve();
    /** Mesh cliqué au dernier menu contextuel (pièce d’un import). */
    let contextMenuHitMesh = /** @type {THREE.Mesh | null} */ (null);
    /** @type {import("./lab-vegetation.js").VegType} */
    let vegetationType = "tree";
    let vegetationPlaceActive = false;
    let avatarPlaceActive = false;
    /** @type {THREE.Group | null} */
    let avatarPlaceMarker = null;
    /** Dernier point de pose valide sous le curseur (pieds). */
    let avatarPlacePreview = /** @type {{ point: THREE.Vector3, snapGround: boolean, yaw?: number } | null} */ (null);
    /** @type {"spot"|"directional"|"point"|null} */
    let lightPlaceType = null;
    /** @type {THREE.Group | null} */
    let lightPlaceMarker = null;
    /** @type {{ point: THREE.Vector3, normal: THREE.Vector3 } | null} */
    let lightPlacePreview = null;
    const LIGHT_SURFACE_OFFSET = 0.12;
    const _lightCamDir = new THREE.Vector3();
    /** @type {Record<string, number>} */
    const lightCounters = { spot: 0, directional: 0, point: 0 };
    let selectedObject = null;
    /** @type {THREE.Object3D[]} */
    let selectedObjects = [];
    /** @type {THREE.Object3D | null} */
    let lastUvTransformTarget = null;
    let selectionHighlight = false;
    let gizmoActive = false;
    let currentMode = "translate";
    const snapByMode = { translate: true, rotate: true, scale: true };
    let suppressClick = false;
    let suppressStairClick = false;
    let suppressTubeClick = false;
    let suppressBoatClick = false;
    let suppressArchitectureClick = false;
    let lastFloatTimeMs = 0;
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

    /** Mode peinture actif : la surbrillance émissive est mise en pause. */
    let paintModeActive = false;

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

    function notifyOrbitTarget({ frame = false } = {}) {
        if (!setOrbitTarget) return;
        if (!selectedObject) {
            // Garder le pivot actuel — ne pas le renvoyer à l’origine (sinon
            // le prochain orbit fait « sauter » les objets à l’écran).
            return;
        }
        selectedObject.updateWorldMatrix(true, true);
        const box = new THREE.Box3().setFromObject(selectedObject);
        if (box.isEmpty()) {
            setOrbitTarget(selectedObject.position, { frame: !!frame });
            return;
        }
        const center = box.getCenter(new THREE.Vector3());
        setOrbitTarget(center, { frame: !!frame });
    }

    const _focusFaceNormal = new THREE.Vector3();

    /**
     * Rapproche la caméra de l’objet ou de la face cliquée.
     * @param {THREE.Object3D | null | undefined} labObject
     * @param {{ mesh?: THREE.Object3D, hit?: THREE.Intersection | null } | null | undefined} hitInfo
     */
    function focusCameraNearSelection(labObject, hitInfo = null) {
        if (suppressCameraFrame || !labObject) return;
        const hit = hitInfo?.hit;
        const mesh = hitInfo?.mesh;
        if (hit?.point && Number.isFinite(hit.point.x)) {
            let normal = null;
            if (hit.face?.normal && mesh) {
                _focusFaceNormal.copy(hit.face.normal).transformDirection(mesh.matrixWorld);
                if (_focusFaceNormal.lengthSq() > 1e-8) {
                    _focusFaceNormal.normalize();
                    normal = _focusFaceNormal;
                }
            } else if (hit.normal && Number.isFinite(hit.normal.x)) {
                _focusFaceNormal.copy(hit.normal);
                if (_focusFaceNormal.lengthSq() > 1e-8) {
                    _focusFaceNormal.normalize();
                    normal = _focusFaceNormal;
                }
            }
            if (focusOnPoint) {
                focusOnPoint(hit.point, { normal, distance: 1.55 });
                return;
            }
        }
        focusOnObject?.(labObject);
    }

    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();

    const statusEl = document.createElement("div");
    statusEl.className = "lab-viewport__status";
    statusEl.setAttribute("aria-live", "polite");
    viewport.appendChild(statusEl);
    let statusTimer = 0;
    const loadingOverlay = document.getElementById("lab-loading-overlay");

    const infoSize = objectInfoPanel.querySelector("[data-field='size']");
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
                syncLightAim(entry.object);
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
        try {
            handleGizmoDraggingChanged(event);
        } catch (err) {
            // Ne jamais laisser l’état de drag à moitié appliqué (bloquerait
            // clics et déplacements suivants).
            console.error("[LAB] gizmo :", err);
            transformBefore = null;
            multiDragStarts = null;
            primaryDragStart = null;
            ignoreClickAfterGizmo = false;
        }
    });

    /** @param {{ value: boolean }} event */
    function handleGizmoDraggingChanged(event) {
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
                // Rotation : snap final via TransformControls uniquement (évite conflit euler).
                if (currentMode !== "rotate") {
                    snapMeshByMode(selectedObject, currentMode, snapByMode);
                } else if (snapByMode.rotate && !isLabLight(selectedObject)) {
                    // Euler snap en fin de geste OK pour les meshes ; sur les
                    // spots (pitch -90°) il provoque des sauts de quaternion.
                    snapMeshRotation(selectedObject);
                    selectedObject.quaternion.setFromEuler(selectedObject.rotation);
                }
                refreshObjectDisplay(selectedObject);
                if (isLabLight(selectedObject)) syncLightAim(selectedObject);

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
                if (isLabArchOpeningFill(selectedObject)) {
                    commitArchOpeningFillTransform(selectedObject);
                }
            }
            // Suivre le pivot d’orbite après un déplacement (évite un saut « au centre »).
            notifyOrbitTarget({ frame: false });
            for (const obj of selectedObjects.length ? selectedObjects : selectedObject ? [selectedObject] : []) {
                if (isObjectPhysicsEnabled(obj)) wakeObjectPhysics(obj);
            }
            multiDragStarts = null;
            primaryDragStart = null;
        }
    }

    transformControls.addEventListener("objectChange", () => {
        invalidateLabShadows();
        if (!selectedObject) return;
        // Ne pas re-snapper la rotation en Euler ici : TransformControls gère déjà
        // le snap quaternion — un 2e snap euler provoque des sauts (surtout spots).
        if (snapByMode[currentMode] && currentMode !== "rotate") {
            snapMeshByMode(selectedObject, currentMode, snapByMode);
        }
        applyMultiSelectionTransform();
        refreshObjectDisplay(selectedObject);
        for (const helper of selectionHelpers.values()) helper.update();
        if (selectedObject && isLabLight(selectedObject)) {
            syncLightAim(selectedObject);
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

    const loadingOverlaySnapshot = loadingOverlay?.querySelector(".lab-loading-overlay__snapshot");
    const loadingOverlayBar = loadingOverlay?.querySelector(".lab-loading-overlay__bar");
    const loadingOverlayBarFill = loadingOverlay?.querySelector(".lab-loading-overlay__bar-fill");

    function setLoadingProgress(pct) {
        if (!loadingOverlayBarFill) return;
        const clamped = Math.max(0, Math.min(100, pct));
        loadingOverlayBarFill.style.width = `${clamped}%`;
        loadingOverlayBar?.setAttribute("aria-valuenow", String(Math.round(clamped)));
    }

    function captureViewportSnapshot() {
        try {
            if (renderer.getContext?.()?.isContextLost?.()) return null;
            renderer.render(scene, camera);
            const canvas = renderer.domElement;
            if (!canvas?.width || !canvas?.height) return null;
            return canvas.toDataURL("image/jpeg", 0.82);
        } catch {
            return null;
        }
    }

    async function beginLoadingOverlay() {
        if (!loadingOverlay) return;
        const dataUrl = captureViewportSnapshot();
        if (loadingOverlaySnapshot) {
            if (dataUrl) loadingOverlaySnapshot.src = dataUrl;
            else loadingOverlaySnapshot.removeAttribute("src");
        }
        setLoadingProgress(0);
        loadingOverlay.hidden = false;
        loadingOverlay.setAttribute("aria-hidden", "false");
        await new Promise((resolve) =>
            window.requestAnimationFrame(() =>
                window.requestAnimationFrame(() => window.setTimeout(resolve, 0))
            )
        );
    }

    async function tickLoadingProgress(pct) {
        setLoadingProgress(pct);
        await new Promise((resolve) => window.requestAnimationFrame(resolve));
    }

    function hideLoadingOverlay() {
        if (!loadingOverlay) return;
        loadingOverlay.hidden = true;
        loadingOverlay.setAttribute("aria-hidden", "true");
        loadingOverlaySnapshot?.removeAttribute("src");
        setLoadingProgress(0);
    }

    function refreshSceneRegistry() {
        sceneRegistry?.refresh();
    }

    /**
     * @param {THREE.Object3D} object
     * @param {string} rawLabel
     */
    function applySceneItemLabel(object, rawLabel) {
        const next = String(rawLabel || "")
            .trim()
            .replace(/\s+/g, " ")
            .slice(0, 80);
        if (!object || !next) return false;
        object.userData.sceneItemLabel = next;
        if (object.name !== "import-content") object.name = next;
        const itemId = object.userData[SCENE_ITEM_ID_KEY];
        if (itemId) sceneRegistry?.setLabel?.(itemId, next);
        return true;
    }

    /** @param {THREE.Object3D} object */
    async function promptRenameSceneObject(object) {
        if (!object) return;
        contextMenu.hide();
        const current =
            (typeof object.userData.sceneItemLabel === "string" && object.userData.sceneItemLabel) ||
            object.name ||
            "Objet";
        const raw = await labPrompt("Nouveau nom :", {
            title: "Renommer",
            defaultValue: current,
            confirmLabel: "Renommer",
            cancelLabel: "Annuler",
        });
        if (raw == null) return;
        if (applySceneItemLabel(object, raw)) {
            showStatus(`Renommé : ${object.userData.sceneItemLabel}`);
        }
    }

    /** @param {THREE.Object3D} object */
    function registerSceneItem(object) {
        if (!sceneRegistry) return;

        /** @param {import("./lab-scene-registry.js").SceneRegistryItem} item */
        function registerLabSceneItem(item) {
            item.onRename = () => {
                void promptRenameSceneObject(object);
            };
            sceneRegistry.register(item);
        }

        /**
         * @param {string} shadowKind
         * @param {import("./lab-scene-registry.js").SceneRegistryItem["icon"]} [icon]
         */
        function registerStandardObjectItem(shadowKind, icon = "cube") {
            registerLabSceneItem({
                id,
                label: object.userData.sceneItemLabel,
                category: "object",
                icon,
                getVisible: () => object.visible,
                setVisible: (visible) => {
                    object.visible = visible;
                },
                getShadow: () => getObjectShadowEnabled(object),
                setShadow: (enabled) => {
                    setObjectShadowEnabled(object, enabled);
                    showStatus(
                        enabled
                            ? `Ombres activées (${shadowKind})`
                            : `Ombres désactivées (${shadowKind})`
                    );
                },
                getShadowOpacity: () => getObjectShadowOpacity(object),
                setShadowOpacity: (value) => {
                    setObjectShadowOpacity(object, value);
                },
                select: () => selectObject(object, { highlight: true }),
                onDelete: () => deleteObject(object),
            });
        }

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
            } else if (isLabArchitecture(object)) {
                id = `arch-${object.uuid}`;
            } else if (isLabBoat(object)) {
                id = `boat-${object.uuid}`;
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
            registerLabSceneItem({
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
                getShadowOpacity: () => getLightShadowOpacity(object),
                setShadowOpacity: (value) => {
                    setLightShadowOpacity(object, value);
                    contextMenu.syncProperty("light-shadow-opacity", value);
                },
                getSpotPenumbra: isSpotLight(object)
                    ? () => getLightSpotPenumbra(object)
                    : undefined,
                setSpotPenumbra: isSpotLight(object)
                    ? (value) => {
                          setLightSpotPenumbra(object, value);
                          contextMenu.syncProperty("spot-penumbra", value);
                      }
                    : undefined,
                getShadow: () => getLightShadowEnabled(object),
                setShadow: (enabled) => {
                    setLightShadowEnabled(object, enabled);
                    showStatus(enabled ? "Ombres activées (lumière)" : "Ombres désactivées (lumière)");
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
            registerStandardObjectItem("palier", "stair");
            return;
        }

        if (isLabStair(object)) {
            if (!object.userData.sceneItemLabel) {
                stairCounter += 1;
                object.userData.sceneItemLabel = `Escalier ${stairCounter}`;
            }
            registerStandardObjectItem("escalier", "stair");
            return;
        }

        if (isLabTube(object)) {
            if (!object.userData.sceneItemLabel) {
                tubeCounter += 1;
                object.userData.sceneItemLabel = `Tubulure ${tubeCounter}`;
            }
            registerStandardObjectItem("tubulure", "stair");
            return;
        }

        if (isLabArchitecture(object)) {
            if (!object.userData.sceneItemLabel) {
                architectureCounter += 1;
                const layoutLabel =
                    ARCH_LAYOUT_LABELS[getArchLayout(object)] || ARCH_LAYOUT_LABELS.rect;
                object.userData.sceneItemLabel = `${layoutLabel} ${architectureCounter}`;
            }
            registerStandardObjectItem("pièce", "stair");
            return;
        }

        if (isLabBoat(object)) {
            if (!object.userData.sceneItemLabel) {
                boatCounter += 1;
                object.userData.sceneItemLabel = `Barque ${boatCounter}`;
            }
            registerStandardObjectItem("barque");
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
            registerStandardObjectItem("végétal");
            return;
        }

        if (object.userData?.[LAB_IMPORTED_KEY] || object.userData?.labShape === "imported") {
            if (!object.userData.sceneItemLabel) {
                importedCounter += 1;
                const raw = object.userData.importName || object.name || "Import";
                const base = String(raw).replace(/\.(glb|gltf|fbx|obj|stl|dae|ply)$/i, "");
                object.userData.sceneItemLabel = `${base} ${importedCounter}`;
            }
            registerStandardObjectItem("import");
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
        registerStandardObjectItem("objet");
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

    function normalizeObjectColorHex(value) {
        if (typeof value !== "string") return null;
        const trimmed = value.trim();
        if (!trimmed) return null;
        if (/^#[0-9a-fA-F]{6}$/.test(trimmed)) return `#${trimmed.slice(1).toLowerCase()}`;
        if (/^#[0-9a-fA-F]{3}$/.test(trimmed)) {
            const r = trimmed[1];
            const g = trimmed[2];
            const b = trimmed[3];
            return `#${r}${r}${g}${g}${b}${b}`.toLowerCase();
        }
        try {
            return `#${new THREE.Color(trimmed).getHexString()}`;
        } catch {
            return null;
        }
    }

    function readMaterialColorHex(object) {
        let found = null;
        object?.traverse?.((child) => {
            if (found || !isObjectContentMesh(child)) return;
            if (child.userData?.labVegetationMesh) return;
            const material = Array.isArray(child.material) ? child.material[0] : child.material;
            if (material?.color?.getHexString) {
                found = `#${material.color.getHexString()}`;
            }
        });
        return found;
    }

    function getObjectColor(object) {
        const stored = normalizeObjectColorHex(object?.userData?.[OBJECT_COLOR_KEY]);
        if (stored) return stored;
        const fromMaterial = normalizeObjectColorHex(readMaterialColorHex(object) || "");
        if (fromMaterial) {
            if (object?.userData) object.userData[OBJECT_COLOR_KEY] = fromMaterial;
            return fromMaterial;
        }
        return DEFAULT_OBJECT_COLOR;
    }

    function isObjectContentMesh(child) {
        return child instanceof THREE.Mesh && child.name !== "shadow-overlay";
    }

    /**
     * @param {THREE.Object3D} object
     * @param {string} colorHex
     * @param {{ tintFaceMaps?: boolean }} [options]
     *   tintFaceMaps : teinte aussi les faces texturées (nuancier utilisateur).
     *   false par défaut pour ne pas recouvrir une albedo Face lors d’un rebuild.
     */
    function applyObjectColor(object, colorHex, options = {}) {
        if (isLabVegetation(object)) return;
        const hex = normalizeObjectColorHex(colorHex) || DEFAULT_OBJECT_COLOR;
        object.userData[OBJECT_COLOR_KEY] = hex;
        const tintFaceMaps = options.tintFaceMaps === true;
        object.traverse((child) => {
            if (!isObjectContentMesh(child)) return;
            // Plinthes : teinte propre (plus foncée), pas la couleur des murs.
            if (String(child.name || "").startsWith("arch-plinth-")) return;
            if (!isLabArchOpeningFill(object)) {
                if (String(child.name || "").startsWith("arch-opening-")) return;
                if (child.userData?.archOpeningFill) return;
            } else if (child.material?.transparent && Number(child.material.opacity) < 0.5) {
                return;
            }
            const materials = Array.isArray(child.material) ? child.material : [child.material];
            materials.forEach((material) => {
                if (!material) return;
                if (
                    !tintFaceMaps &&
                    (material?.userData?._labFaceAlbedoMap ||
                        material?.userData?._labFaceNormalMap ||
                        material?.userData?._labFaceSpecularMap ||
                        material?.userData?._labFaceRoughnessMap)
                ) {
                    return;
                }
                material.color?.set(hex);
                // Évite un mur « transparent » si un verre face était encore collé.
                material.transparent = false;
                material.opacity = 1;
                material.depthWrite = true;
                if (typeof material.transmission === "number") material.transmission = 0;
                if (material.userData) delete material.userData._labGlass;
                material.needsUpdate = true;
            });
        });
        updateObjectVisual(object);
        if (isLabArchOpeningFill(object)) persistArchOpeningFillColor(object, hex);
    }

    /**
     * @param {THREE.Object3D} fill
     * @param {(op: import("./lab-architecture.js").ArchOpening) => import("./lab-architecture.js").ArchOpening} patchFn
     */
    function patchArchOpeningOnHost(fill, patchFn) {
        const room = getArchHostFromFill(fill);
        const openingId = fill?.userData?.archOpeningId;
        if (!room || !openingId) return;
        const openings = getArchOpenings(room).map((op) => (op.id === openingId ? patchFn(op) : op));
        room.userData[ARCH_OPENINGS_KEY] = openings;
    }

    /**
     * @param {THREE.Object3D} fill
     * @param {string} hex
     */
    function persistArchOpeningFillColor(fill, hex) {
        patchArchOpeningOnHost(fill, (op) => ({ ...op, fillColor: hex }));
    }

    /**
     * Enregistre la pose locale (gizmo) sans reconstruire le mur.
     * @param {THREE.Object3D} fill
     */
    function commitArchOpeningFillTransform(fill) {
        if (!isLabArchOpeningFill(fill)) return;
        patchArchOpeningOnHost(fill, (op) => ({ ...op, fillTx: readArchOpeningFillTx(fill) }));
    }

    /**
     * @param {THREE.Object3D} fill
     */
    function resetArchOpeningFillTransform(fill) {
        if (!isLabArchOpeningFill(fill)) return;
        const room = getArchHostFromFill(fill);
        const openingId = fill.userData?.archOpeningId;
        if (!room || !openingId) return;
        const openings = getArchOpenings(room).map((op) => {
            if (op.id !== openingId) return op;
            const next = { ...op };
            delete next.fillTx;
            return next;
        });
        applyArchitectureParams(room, { openings });
        const nextFill = findArchOpeningFill(room, openingId);
        if (nextFill) selectObject(nextFill, { highlight: true });
        showStatus("Pose de la porte / fenêtre réinitialisée");
    }

    /**
     * @param {THREE.Object3D} fill
     */
    function removeArchOpeningFillKeepHole(fill) {
        const room = getArchHostFromFill(fill);
        const openingId = fill?.userData?.archOpeningId;
        if (!room || !openingId) return;
        const openings = getArchOpenings(room).map((op) => {
            if (op.id !== openingId) return op;
            return {
                ...op,
                fill: "none",
                importDataUrl: undefined,
                importFormat: undefined,
                importName: undefined,
            };
        });
        applyArchitectureParams(room, { openings });
        selectObject(room, { highlight: true });
        showStatus("Trou seul (sans porte / fenêtre)");
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
            if (dataUrl) setLastUvObjectTarget(object);
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

    async function setObjectSpecularTexture(object, dataUrl) {
        const before = getObjectSpecularTextureDataUrl(object);
        if (before === dataUrl) return;

        try {
            await applyObjectSpecularTexture(object, dataUrl);
            updateObjectVisual(object);
            history.push({ type: "specular-texture", object, before, after: dataUrl });
            contextMenu.syncProperty("specular-texture", dataUrl);
            showStatus(dataUrl ? "Spéculaire appliquée" : "Spéculaire retirée");
        } catch (error) {
            showStatus(error instanceof Error ? error.message : "Spéculaire invalide");
        }
    }

    async function setObjectRoughnessTexture(object, dataUrl) {
        const before = getObjectRoughnessTextureDataUrl(object);
        if (before === dataUrl) return;

        try {
            await applyObjectRoughnessTexture(object, dataUrl);
            updateObjectVisual(object);
            history.push({ type: "roughness-texture", object, before, after: dataUrl });
            showStatus(dataUrl ? "Roughness map appliquée" : "Roughness map retirée");
        } catch (error) {
            showStatus(error instanceof Error ? error.message : "Roughness map invalide");
        }
    }

    function captureUvTransformState(target = lastUvEditTarget) {
        if (!target) return null;
        if (target.kind === "object" && target.object) {
            return {
                kind: "object",
                object: target.object,
                tileX: getObjectTextureTileX(target.object),
                tileY: getObjectTextureTileY(target.object),
                tileZ: getObjectTextureTileZ(target.object),
                offsetX: getObjectTextureOffsetX(target.object),
                offsetY: getObjectTextureOffsetY(target.object),
                offsetZ: getObjectTextureOffsetZ(target.object),
            };
        }
        if (target.kind === "triangles" && target.overlays?.length) {
            const first = target.overlays[0];
            return {
                kind: "triangles",
                overlays: [...target.overlays],
                tileX: first.userData._labTileX ?? 1,
                tileY: first.userData._labTileY ?? 1,
                tileZ: first.userData._labTileZ ?? 1,
                offsetX: first.userData._labOffsetX ?? 0,
                offsetY: first.userData._labOffsetY ?? 0,
                offsetZ: first.userData._labOffsetZ ?? 0,
            };
        }
        if (target.kind === "face") {
            const live = faceDrawController?.getLiveFaceTextureTransform?.();
            return {
                kind: "face",
                tileX: live?.tileX ?? (Number(drawTileXInput?.value) || 1),
                tileY: live?.tileY ?? (Number(drawTileYInput?.value) || 1),
                tileZ: 1,
                offsetX: live?.offsetX ?? (Number(drawOffsetXInput?.value) || 0),
                offsetY: live?.offsetY ?? (Number(drawOffsetYInput?.value) || 0),
                offsetZ: 0,
            };
        }
        return null;
    }

    function setLastUvObjectTarget(object) {
        if (!object || isLabLight(object)) return;
        lastUvEditTarget = { kind: "object", object };
        lastUvTransformTarget = object;
    }

    function setLastUvTriangleTarget(overlays) {
        if (!overlays?.length) return;
        lastUvEditTarget = { kind: "triangles", overlays: [...overlays] };
    }

    /** @param {"object" | "face" | "triangles"} mode */
    function syncTextureModeButtons(mode) {
        document.querySelectorAll("[data-texlib-mode]").forEach((btn) => {
            const on = btn.getAttribute("data-texlib-mode") === mode;
            btn.classList.toggle("is-active", on);
            btn.setAttribute("aria-pressed", String(on));
        });
        const hint = document.querySelector("[data-texlib-mode-hint]");
        if (hint) {
            hint.textContent =
                mode === "triangles"
                    ? "Mode Triangles : glissez pour sélectionner, clic droit pour vider. Tile = dernier lot △."
                    : mode === "face"
                      ? "Mode Face : cliquez une face, clic droit pour vider. Tile = dernière face."
                      : "Mode Objet : déposez sur l’objet entier. Tile = dernier objet texturé.";
        }
    }

    function setObjectTextureTransform(object, transform) {
        if (!object) return;
        applyObjectTextureTransform(object, transform);
        setLastUvObjectTarget(object);
        const tileX = getObjectTextureTileX(object);
        contextMenu.syncProperty("texture-tile", tileX);
    }

    /**
     * Tile/Offset en direct — uniquement sur le dernier dépôt (objet OU triangles).
     * @param {{ tileX?: number, tileY?: number, offsetX?: number, offsetY?: number }} transform
     * @param {{ phase?: "input" | "change" }} [meta]
     */
    function applyTextureTransformLive(transform, meta = {}) {
        if (!transform) return;
        const phase = meta.phase || "input";

        if (!lastUvEditTarget) {
            const fallback =
                selectedObject && !isLabLight(selectedObject) ? selectedObject : lastUvTransformTarget;
            if (fallback) setLastUvObjectTarget(fallback);
        }
        if (!lastUvEditTarget) {
            showStatus("Déposez d’abord une texture (objet ou triangles)");
            return;
        }

        if (phase === "input" && !uvGestureBefore) {
            uvGestureBefore = captureUvTransformState(lastUvEditTarget);
        }

        if (lastUvEditTarget.kind === "triangles") {
            const alive = (lastUvEditTarget.overlays || []).filter((o) => o?.parent);
            lastUvEditTarget.overlays = alive;
            if (!alive.length) {
                lastUvEditTarget = null;
                showStatus("Plus de triangles texturés — déposez à nouveau");
                return;
            }
            // Uniquement le dernier lot △ (pas toutes les textures de la scène).
            faceDrawController?.applyUvToOverlays?.(alive, transform);
        } else if (lastUvEditTarget.kind === "face") {
            faceDrawController?.applyLiveFaceUvTransform?.(transform);
        } else if (lastUvEditTarget.kind === "object" && lastUvEditTarget.object) {
            applyObjectTextureTransform(lastUvEditTarget.object, transform);
            lastUvTransformTarget = lastUvEditTarget.object;
            contextMenu.syncProperty("texture-tile", getObjectTextureTileX(lastUvEditTarget.object));
        }

        if (phase === "change" && uvGestureBefore) {
            const after = captureUvTransformState(lastUvEditTarget);
            const changed =
                after &&
                (after.tileX !== uvGestureBefore.tileX ||
                    after.tileY !== uvGestureBefore.tileY ||
                    after.tileZ !== uvGestureBefore.tileZ ||
                    after.offsetX !== uvGestureBefore.offsetX ||
                    after.offsetY !== uvGestureBefore.offsetY ||
                    after.offsetZ !== uvGestureBefore.offsetZ);
            if (changed && after) {
                history.push({
                    type: "texture-uv-transform",
                    before: uvGestureBefore,
                    after,
                });
            }
            uvGestureBefore = null;
        }
    }

    /**
     * Drop bibliothèque : empile couleur / normal / spéculaire / roughness.
     * Mode Objet → maps sur l’objet ; Face → une face de cube ; Triangles → △ sélectionnés.
     * @param {{
     *   clientX: number,
     *   clientY: number,
     *   maps: { color?: string, normal?: string, specular?: string, roughness?: string },
     *   name?: string,
     *   transform?: { tileX?: number, tileY?: number, offsetX?: number, offsetY?: number },
     * }} payload
     */
    async function applyTextureDrop(payload) {
        const { clientX, clientY, maps, transform } = payload;
        const hasMaps = !!(maps?.color || maps?.normal || maps?.specular || maps?.roughness);
        if (!hasMaps) {
            showStatus("Aucune map à appliquer");
            return;
        }

        const wantTriangles = textureApplyMode === "triangles" || triangulationMode;
        const wantFace = textureApplyMode === "face" && !wantTriangles;

        if (wantFace && (maps.color || maps.normal || maps.specular || maps.roughness)) {
            if (!faceDrawController?.applyDroppedFaceTexture) {
                showStatus("Mode Face indisponible — rechargez la page (Ctrl+F5)");
                return;
            }
            const ok = await faceDrawController.applyDroppedFaceTexture(
                maps,
                clientX,
                clientY,
                transform || null
            );
            if (ok) {
                lastUvEditTarget = { kind: "face" };
                const build =
                    typeof window !== "undefined" ? window.__LAB_3D_BUILD__ || "?" : "?";
                console.info("[LAB Face] texture remplacée", { build, maps: Object.keys(maps) });
                // Ne pas écraser le message déjà posé (ex. mur Architecture N panneaux).
                return;
            }
            showStatus("Mode Face : visez une face de cube, panneau ou mur");
            return;
        } else if (wantTriangles && maps.color) {
            const ok = await faceDrawController?.applyDroppedTriangleTexture?.(
                maps.color,
                clientX,
                clientY
            );
            if (ok) {
                const overlays = faceDrawController?.getLiveTriangleOverlays?.() || [];
                if (overlays.length) {
                    setLastUvTriangleTarget(overlays);
                    showStatus("Texture posée sur les triangles — Tile n’affecte que ce lot");
                }
            } else if (!maps.normal && !maps.specular && !maps.roughness) {
                showStatus("Sélectionnez des triangles puis déposez la texture");
                return;
            }
        }

        let object = pickLabObjectAt(clientX, clientY);
        if (!object || isLabLight(object)) {
            object = selectedObject && !isLabLight(selectedObject) ? selectedObject : null;
        }
        if ((!object || isLabLight(object)) && (wantTriangles || wantFace)) {
            const hit = faceDrawController?.peekPaintHit?.(clientX, clientY);
            object = hit?.entity && !isLabLight(hit.entity) ? hit.entity : object;
        }
        if (!object) {
            if (!wantTriangles && !wantFace) showStatus("Déposez sur un objet de la scène");
            return;
        }

        selectObject(object, { additive: false });
        const parts = [];
        if (maps.color && !wantTriangles && !wantFace) {
            await setObjectTexture(object, maps.color);
            parts.push("couleur");
        }
        // En mode Face : normal/spéculaire gérés uniquement via applyDroppedFaceTexture.
        if (maps.normal && !wantFace) {
            await setObjectNormalTexture(object, maps.normal);
            parts.push("normal");
        }
        if (maps.specular && !wantFace) {
            await setObjectSpecularTexture(object, maps.specular);
            parts.push("spéculaire");
        }
        if (maps.roughness && !wantFace) {
            await setObjectRoughnessTexture(object, maps.roughness);
            parts.push("roughness");
        }
        if (!wantTriangles && !wantFace) {
            if (transform) setObjectTextureTransform(object, transform);
            setLastUvObjectTarget(object);
        } else if (parts.length && !maps.color) {
            // maps secondaires seules en mode face / triangles
            setLastUvObjectTarget(object);
            if (transform) setObjectTextureTransform(object, transform);
        }
        if (parts.length) {
            showStatus(
                (wantTriangles || wantFace) && maps.color
                    ? `${wantFace ? "Face" : "Triangles"} + ${parts.join(" + ")}`
                    : `Empilé : ${parts.join(" + ")}`
            );
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
        const value = Math.max(0, Math.min(1, roughness));
        if (
            applyScopedMaterial(
                object,
                { roughness: value },
                `Rugosité face/△ : ${value.toFixed(2)}`
            )
        ) {
            return;
        }
        const before = captureMaterialState(object);
        if (before.roughness === value && !before.glass) return;
        // Objet entier : garder le verre si actif (la rugosité = dépoli du verre).
        if (!before.glass) {
            clearObjectGlassOnManualEdit(object);
        }
        applyObjectRoughness(object, value);
        const after = captureMaterialState(object);
        history.push({ type: "material", object, before, after });
        contextMenu.syncProperty("glass", after.glass);
        contextMenu.syncProperty("roughness", after.roughness);
        contextMenu.syncProperty("metalness", after.metalness);
        contextMenu.syncProperty("opacity", after.opacity);
        showStatus(
            after.glass
                ? `Dépoli verre : ${value.toFixed(2)}`
                : `Rugosité : ${value.toFixed(2)}`
        );
    }

    function setObjectMetalness(object, metalness) {
        const value = Math.max(0, Math.min(METALNESS_MAX, metalness));
        if (
            applyScopedMaterial(
                object,
                { metalness: value, clearGlass: true },
                `Métallique face/△ : ${value.toFixed(2)}`
            )
        ) {
            return;
        }
        const before = captureMaterialState(object);
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
        // Mode Face / Triangles : métal uniquement sur la cible (ne pas vider le verre des autres faces).
        if (applyScopedMaterial(object, { metalPreset: true }, "Métal poli (face / triangles)")) {
            return;
        }
        const before = captureMaterialState(object);
        clearObjectGlassOnManualEdit(object);
        // Sur escalier : pas de remesh « cube » — seulement PBR métal.
        if (!isLabStair(object) && !isLabLanding(object) && !isLabTube(object) && !isLabBoat(object)) {
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
        syncMaterialMenu({ ...after, reflection: 0.82 });
        contextMenu.syncProperty("smooth", true);
        showStatus("Preset métal poli — baissez la rugosité pour plus de chrome");
    }

    function applyMirrorPreset(object) {
        if (applyScopedMaterial(object, { mirrorPreset: true }, "Miroir (face / triangles)")) {
            return;
        }
        setObjectReflection(object, 1);
        showStatus("Miroir — réflexion maximale");
    }

    function applyWaxedPreset(object) {
        setObjectReflection(object, WAXED_REFLECTION);
        showStatus("Ciré — parquet légèrement brillant");
    }

    function setObjectReflection(object, reflection) {
        const value = Math.max(0, Math.min(1, Number(reflection) || 0));
        if (
            applyScopedMaterial(
                object,
                { reflection: value },
                `Réflexion : ${value.toFixed(2)}`
            )
        ) {
            return;
        }
        const before = captureMaterialState(object);
        clearObjectGlassOnManualEdit(object);
        const pbr = reflectionToPbr(value);
        applyObjectMetalness(object, pbr.metalness);
        applyObjectRoughness(object, pbr.roughness);
        object.traverse((child) => {
            if (!isObjectContentMesh(child)) return;
            const materials = Array.isArray(child.material) ? child.material : [child.material];
            materials.forEach((material) => {
                if (!material || typeof material.envMapIntensity !== "number") return;
                material.userData._labReflection = value;
                material.envMapIntensity = envMapIntensityForMaterial(material, value);
                material.needsUpdate = true;
            });
        });
        const after = captureMaterialState(object);
        history.push({ type: "material", object, before, after });
        syncMaterialMenu({ ...after, reflection: value });
        showStatus(`Réflexion : ${value.toFixed(2)}`);
    }

    function setObjectOpacity(object, opacity) {
        const value = Math.max(OPACITY_MIN, Math.min(OPACITY_MAX, opacity));
        // Ne pas clearGlass : en face verre, le curseur règle la transparence du verre.
        if (
            applyScopedMaterial(
                object,
                { opacity: value },
                `Opacité face/△ : ${value.toFixed(2)}`
            )
        ) {
            return;
        }
        const before = captureMaterialState(object);
        if (before.opacity === value) return;
        // Objet entier : garder le mode verre si actif, seulement changer l’opacité.
        if (!before.glass) {
            clearObjectGlassOnManualEdit(object);
        }
        applyObjectOpacity(object, value);
        const after = captureMaterialState(object);
        history.push({ type: "material", object, before, after });
        contextMenu.syncProperty("glass", after.glass);
        contextMenu.syncProperty("roughness", after.roughness);
        contextMenu.syncProperty("metalness", after.metalness);
        contextMenu.syncProperty("opacity", after.opacity);
        showStatus(
            after.glass
                ? `Transparence verre : ${value.toFixed(2)}`
                : `Opacité : ${value.toFixed(2)}`
        );
    }

    function setObjectGlass(object, enabled) {
        if (
            applyScopedMaterial(
                object,
                { glass: !!enabled },
                enabled ? "Verre (face / triangles)" : "Verre désactivé (face / triangles)"
            )
        ) {
            return;
        }
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
                syncLightAim(object);
            }
            return;
        }

        // En peinture : pas d’émissif (sinon les faces déjà peintes et les
        // autres ne réagissent pas pareil et les couleurs sont faussées).
        const showHighlight = shouldShowSelectionHighlight(object) && !paintModeActive;
        object.traverse((child) => {
            if (!isObjectContentMesh(child)) return;
            if (child.userData?.labVegetationMesh) return;
            const materials = Array.isArray(child.material) ? child.material : [child.material];
            materials.forEach((material) => {
                if (!material?.emissive) return;
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

        if (typeof state?.sceneItemLabel === "string" && state.sceneItemLabel.trim()) {
            object.userData.sceneItemLabel = state.sceneItemLabel.trim();
            const itemId = object.userData[SCENE_ITEM_ID_KEY];
            if (itemId) sceneRegistry?.setLabel?.(itemId, object.userData.sceneItemLabel);
        }

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
            if (typeof state.spotPenumbra === "number" && isSpotLight(object)) {
                setLightSpotPenumbra(object, state.spotPenumbra);
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
            applyObjectPhysicsData(object, state);
            updateObjectVisual(object);
            return;
        }

        object.userData[COLLISION_KEY] = !!state.collisionEnabled;
        if (isLabBoat(object) && state.boatFloat !== undefined) {
            object.userData[BOAT_FLOAT_KEY] = state.boatFloat !== false;
        }
        if (isLabBoat(object) && typeof state.boatDensity === "number") {
            setBoatDensity(object, state.boatDensity);
        }
        applyObjectPhysicsData(object, state);
        if (isLabBoat(object) && typeof state.boatLength === "number") {
            object.userData.boatLength = state.boatLength;
        }
        if (isLabBoat(object) && typeof state.boatWidth === "number") {
            object.userData.boatWidth = state.boatWidth;
        }
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
        if (isLabArchitecture(object)) {
            const nextLength = clampArchLength(state.archLength ?? getArchLength(object));
            const nextWidth = clampArchWidth(state.archWidth ?? getArchWidth(object));
            const nextHeight = clampArchHeight(state.archHeight ?? getArchHeight(object));
            const nextWall = clampArchWall(state.archWall ?? getArchWall(object));
            const nextCeiling = state.archCeiling !== undefined ? !!state.archCeiling : getArchHasCeiling(object);
            const nextFloors = clampArchFloors(state.archFloors ?? getArchFloors(object));
            const nextPlinthFloors = Array.isArray(state.archPlinthFloors)
                ? normalizeArchPlinthFloors(state.archPlinthFloors, nextFloors)
                : state.archPlinth !== undefined
                  ? state.archPlinth
                      ? [0]
                      : []
                  : getArchPlinthFloors(object);
            const nextLayout = normalizeArchLayout(state.archLayout ?? getArchLayout(object));
            const nextWingA = clampArchWingA(state.archWingA ?? getArchWingA(object), nextWidth);
            const nextWingB = clampArchWingB(state.archWingB ?? getArchWingB(object), nextLength);
            const nextOpenings = Array.isArray(state.archOpenings)
                ? state.archOpenings
                : getArchOpenings(object);
            const needsRebuild =
                getArchLength(object) !== nextLength ||
                getArchWidth(object) !== nextWidth ||
                getArchHeight(object) !== nextHeight ||
                getArchWall(object) !== nextWall ||
                getArchHasCeiling(object) !== nextCeiling ||
                JSON.stringify(getArchPlinthFloors(object)) !== JSON.stringify(nextPlinthFloors) ||
                getArchLayout(object) !== nextLayout ||
                getArchWingA(object) !== nextWingA ||
                getArchWingB(object) !== nextWingB ||
                getArchFloors(object) !== nextFloors ||
                archOpeningsSignature(getArchOpenings(object)) !== archOpeningsSignature(nextOpenings);
            if (needsRebuild) {
                // Invalide toute restauration async d’un rebuild précédent.
                object.userData._labArchRebuildGen =
                    (Number(object.userData._labArchRebuildGen) || 0) + 1;
                delete object.userData._labArchSurfaceTextures;
                rebuildArchitectureGroup(object, {
                    length: nextLength,
                    width: nextWidth,
                    height: nextHeight,
                    wall: nextWall,
                    ceiling: nextCeiling,
                    plinthFloors: nextPlinthFloors,
                    layout: nextLayout,
                    wingA: nextWingA,
                    wingB: nextWingB,
                    floors: nextFloors,
                    openings: nextOpenings,
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
        const restoredColor =
            typeof state.color === "string" && state.color ? state.color : null;
        if (restoredColor) {
            applyObjectColor(object, restoredColor);
        }
        const textureUrl = state.textureDataUrl ?? null;
        const normalTextureUrl = state.normalTextureDataUrl ?? null;
        const specularTextureUrl = state.specularTextureDataUrl ?? null;
        if (typeof state.roughness === "number") {
            applyObjectRoughness(object, state.roughness);
        }
        if (typeof state.metalness === "number") {
            applyObjectMetalness(object, state.metalness);
        }
        if (typeof state.smooth === "boolean") {
            applyObjectSmooth(object, state.smooth);
        } else if (!isLabArchitecture(object) && !object.userData?.[LAB_IMPORTED_KEY]) {
            applyObjectSmooth(object, DEFAULT_SMOOTH);
        }
        // Le lissage peut recréer la géométrie : réappliquer la couleur ensuite.
        if (restoredColor) {
            applyObjectColor(object, restoredColor);
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
        applyObjectTexture(object, textureUrl)
            .then(() => applyObjectNormalTexture(object, normalTextureUrl))
            .then(() => applyObjectSpecularTexture(object, specularTextureUrl))
            .then(() => {
                const tile =
                    typeof state.textureTile === "number"
                        ? state.textureTile
                        : getObjectTextureTile(object);
                applyObjectTextureTile(object, tile);
            })
            .catch((err) => {
                console.warn("[lab] restauration apparence objet :", err);
            })
            .then(() => {
                // Scalaires objet AVANT les maps Face (sinon rugosité / métal
                // objet écrasent parquet, vernis, roughnessMap par face).
                if (restoredColor) {
                    const tint = normalizeObjectColorHex(restoredColor);
                    const defaultTint = normalizeObjectColorHex(DEFAULT_OBJECT_COLOR);
                    if (!textureUrl) {
                        applyObjectColor(object, restoredColor);
                    } else if (tint && tint !== "#ffffff" && tint !== defaultTint) {
                        applyObjectColor(object, tint);
                    } else {
                        applyObjectColor(object, "#ffffff");
                    }
                }
                if (typeof state.roughness === "number") {
                    applyObjectRoughness(object, state.roughness);
                }
                if (typeof state.metalness === "number") {
                    applyObjectMetalness(object, state.metalness);
                }
                if (typeof state.opacity === "number") {
                    applyObjectOpacity(object, state.opacity);
                }
                updateObjectVisual(object);
            })
            .then(() => {
                /** @type {Promise<void>[]} */
                const jobs = [];
                const warnRestore = (label) => (err) => {
                    console.warn(`[lab] ${label} :`, err);
                };
                if (
                    isLabArchitecture(object) &&
                    state.archFaceTextures &&
                    typeof state.archFaceTextures === "object"
                ) {
                    jobs.push(
                        applyArchSurfaceTexturesData(object, state.archFaceTextures).catch(
                            warnRestore("restauration textures Architecture")
                        )
                    );
                }
                const facePaint =
                    state.facePaint && typeof state.facePaint === "object" ? state.facePaint : null;
                const mesh =
                    !isLabStair(object) &&
                    !isLabTube(object) &&
                    !isLabBoat(object) &&
                    !isLabArchitecture(object)
                        ? getPaintableMesh(object)
                        : null;
                if (facePaint && mesh) {
                    jobs.push(
                        applyFacePaintData(object, facePaint).catch(
                            warnRestore("restauration peinture faces")
                        )
                    );
                }
                if (Array.isArray(state.triangleTextures) && state.triangleTextures.length) {
                    jobs.push(
                        applyTriangleTexturesData(object, state.triangleTextures).catch(
                            warnRestore("restauration textures triangles")
                        )
                    );
                }
                return jobs.length ? Promise.all(jobs) : undefined;
            })
            .then(() => {
                const facePbr =
                    state.facePbr && typeof state.facePbr === "object" ? state.facePbr : null;
                if (!facePbr) return undefined;
                return applyFacePbrStoreData(object, facePbr)
                    .then(() => {
                        updateObjectVisual(object);
                    })
                    .catch((err) => {
                        console.warn("[lab] restauration PBR faces :", err);
                    });
            })
            .then(() => {
                if (state.glass) {
                    applyObjectGlass(object, true);
                    if (typeof state.opacity === "number") {
                        applyObjectOpacity(object, state.opacity);
                    }
                    if (typeof state.roughness === "number") {
                        applyObjectRoughness(object, state.roughness);
                    }
                    updateObjectVisual(object);
                }
            });
    }

    /* ------------------------------------------------ identité stable (labId) */

    let labIdCounter = 0;

    /**
     * Identifiant stable d’un objet lab (assigné à la demande). Il survit dans
     * les snapshots : un objet supprimé puis recréé par undo garde le même id,
     * ce qui permet aux anciennes entrées d’historique de le retrouver.
     * @param {THREE.Object3D} object
     * @returns {string | null}
     */
    function getLabId(object) {
        if (!object?.userData) return null;
        if (typeof object.userData.labId !== "string" || !object.userData.labId) {
            labIdCounter += 1;
            object.userData.labId = `lab-${Date.now().toString(36)}-${labIdCounter}`;
        }
        return object.userData.labId;
    }

    /**
     * Réconcilie une référence d’historique potentiellement périmée : si l’objet
     * n’est plus dans la scène mais qu’un objet portant le même labId existe
     * (recréé par undo), c’est lui qu’on manipule.
     * @param {THREE.Object3D | null | undefined} object
     */
    function resolveHistoryObject(object) {
        if (!object || editableObjects.includes(object)) return object;
        const id = object.userData?.labId;
        if (!id) return object;
        return editableObjects.find((o) => o?.userData?.labId === id) || object;
    }

    /** @param {{ object?: unknown, target?: unknown, cutter?: unknown, before?: unknown, after?: unknown }} entry */
    function resolveHistoryEntryObjects(entry) {
        if (!entry || typeof entry !== "object") return;
        if (entry.object) entry.object = resolveHistoryObject(entry.object);
        if (entry.target) entry.target = resolveHistoryObject(entry.target);
        if (entry.cutter) entry.cutter = resolveHistoryObject(entry.cutter);
        // texture-uv-transform : la cible vit dans les états before/after.
        for (const state of [entry.before, entry.after]) {
            if (state && typeof state === "object" && state.object) {
                state.object = resolveHistoryObject(state.object);
            }
        }
    }

    /* ------------------------------------------------------------- snapshots */

    function captureAppearanceFields(object) {
        return {
            shadowEnabled: getObjectShadowEnabled(object),
            shadowOpacity: getObjectShadowOpacity(object),
            color: getObjectColor(object),
            textureDataUrl: getObjectTextureDataUrl(object),
            normalTextureDataUrl: getObjectNormalTextureDataUrl(object),
            specularTextureDataUrl: getObjectSpecularTextureDataUrl(object),
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
            ...serializeObjectPhysics(object),
        };
    }

    function captureFullSnapshot(object) {
        const snapshot = captureFullSnapshotBase(object);
        if (snapshot && typeof snapshot === "object") {
            snapshot.labId = getLabId(object) || undefined;
            if (typeof object.userData?.sceneItemLabel === "string" && object.userData.sceneItemLabel) {
                snapshot.sceneItemLabel = object.userData.sceneItemLabel;
            }
            if (snapshot.kind !== "light") {
                const tri = serializeTriangleTextures(object);
                if (tri) snapshot.triangleTextures = tri;
            }
        }
        return snapshot;
    }

    function captureFullSnapshotBase(object) {
        if (isLabLight(object)) {
            return {
                kind: "light",
                lightType: object.userData.lightType,
                lightAim: object.userData.lightAim || "negZ",
                markerVisible: isLightMarkerVisible(object),
                intensity: getLightIntensity(object),
                spotAngle: isSpotLight(object) ? getLightSpotAngleDeg(object) : undefined,
                spotPenumbra: isSpotLight(object) ? getLightSpotPenumbra(object) : undefined,
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
                ...captureAppearanceFields(object),
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
                ...captureAppearanceFields(object),
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
                ...captureAppearanceFields(object),
            };
        }
        if (isLabArchitecture(object)) {
            return {
                kind: "architecture",
                archLayout: getArchLayout(object),
                archLength: getArchLength(object),
                archWidth: getArchWidth(object),
                archHeight: getArchHeight(object),
                archWall: getArchWall(object),
                archWingA: getArchWingA(object),
                archWingB: getArchWingB(object),
                archFloors: getArchFloors(object),
                archCeiling: getArchHasCeiling(object),
                archPlinth: getArchHasPlinth(object),
                archPlinthFloors: getArchPlinthFloors(object),
                archOpenings: getArchOpenings(object),
                ...captureObjectState(object),
                ...captureAppearanceFields(object),
                archFaceTextures: serializeArchSurfaceTextures(object) || undefined,
            };
        }
        if (isLabBoat(object)) {
            const shell = getBoatShell(object);
            return {
                kind: "boat",
                boatLength: getBoatLength(object),
                boatWidth: getBoatWidth(object),
                boatFloat: isBoatFloating(object),
                boatDensity: getBoatDensity(object),
                boatShell: shell,
                boatBaseKind: object.userData?.[BOAT_BASE_KIND_KEY] || undefined,
                importFormat: object.userData?.importFormat || undefined,
                importName: object.userData?.importName || undefined,
                importDataUrl: object.userData?.importDataUrl || null,
                ...captureObjectState(object),
                ...captureAppearanceFields(object),
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
                ...serializeObjectPhysics(object),
            };
        }
        if (object.userData?.[LAB_IMPORTED_KEY]) {
            const importAppearance = serializeImportedAppearance(object) || undefined;
            return {
                kind: "imported",
                importFormat: object.userData.importFormat || "glb",
                importName: object.userData.importName || object.userData.sceneItemLabel || "Import",
                importDataUrl: object.userData.importDataUrl || null,
                ...captureObjectState(object),
                collisionEnabled: !!object.userData[COLLISION_KEY],
                shadowEnabled: getObjectShadowEnabled(object),
                shadowOpacity: getObjectShadowOpacity(object),
                color: object.userData[OBJECT_COLOR_KEY] || undefined,
                roughness:
                    typeof object.userData[OBJECT_ROUGHNESS_KEY] === "number"
                        ? object.userData[OBJECT_ROUGHNESS_KEY]
                        : undefined,
                metalness:
                    typeof object.userData[OBJECT_METALNESS_KEY] === "number"
                        ? object.userData[OBJECT_METALNESS_KEY]
                        : undefined,
                opacity:
                    typeof object.userData[OBJECT_OPACITY_KEY] === "number"
                        ? object.userData[OBJECT_OPACITY_KEY]
                        : undefined,
                glass: isObjectGlassEnabled(object),
                smooth: getObjectSmooth(object),
                glassRestore: isObjectGlassEnabled(object)
                    ? getObjectGlassRestore(object) || undefined
                    : undefined,
                // Apparence live par mesh (source de vérité) + stores legacy.
                importAppearance,
                facePaint: serializeFacePaint(object) || undefined,
                facePbr: serializeFacePbrStore(object) || undefined,
                meshSolidify: serializeMeshSolidify(object) || undefined,
                ...serializeObjectPhysics(object),
            };
        }
        if (object.userData?.labCsg) {
            const csgGeometry = serializeCsgGeometry(object);
            return {
                kind: "csg",
                csgGeometry,
                ...captureObjectState(object),
                ...captureAppearanceFields(object),
            };
        }
        return {
            kind: getPrimitiveSnapshotKind(object),
            ...captureObjectState(object),
            ...captureAppearanceFields(object),
            facePaint: serializeFacePaint(object) || undefined,
            facePbr: serializeFacePbrStore(object) || undefined,
        };
    }

    function isFaceColorContext() {
        // Mode Face explicite, ou Architecture (clic droit sur un mur) comme le matériau.
        if (textureApplyMode === "face") return true;
        return false;
    }

    function isArchitectureFaceColorContext(object) {
        if (!object || !isLabArchitecture(object)) return false;
        const live = faceDrawController?.getLiveFaceTextureTarget?.();
        return !!(live && live.object === object && live.surfaceId);
    }

    function isTriangleMaterialContext() {
        return textureApplyMode === "triangles";
    }

    function isFaceMaterialContext(object = null) {
        if (textureApplyMode === "triangles") return false;
        if (textureApplyMode === "face") return true;
        // Mode Objet : Architecture — matériau du mur sous le curseur (clic droit).
        if (textureApplyMode === "object" && object && isLabArchitecture(object)) {
            const live = faceDrawController?.getLiveFaceTextureTarget?.();
            return !!(live && live.object === object && live.surfaceId);
        }
        return false;
    }

    /**
     * @param {THREE.Object3D} object
     * @returns {{ roughness: number, metalness: number, opacity: number, glass: boolean }}
     */
    function getScopedMaterialState(object) {
        if (isTriangleMaterialContext()) {
            const tri = faceDrawController?.getLiveTriangleMaterial?.();
            if (tri) return tri;
        }
        if (isFaceMaterialContext(object)) {
            const face = faceDrawController?.getLiveFaceMaterial?.();
            if (face) return face;
        }
        return {
            roughness: getObjectRoughness(object),
            metalness: getObjectMetalness(object),
            opacity: getObjectOpacity(object),
            glass: isObjectGlassEnabled(object),
            reflection: getObjectMetalness(object),
        };
    }

    /**
     * @param {THREE.Object3D} object
     * @param {{ roughness?: number, metalness?: number, opacity?: number, glass?: boolean, reflection?: number, metalPreset?: boolean, mirrorPreset?: boolean, clearGlass?: boolean }} props
     * @param {string} statusMsg
     * @returns {boolean}
     */
    function applyScopedMaterial(object, props, statusMsg) {
        if (isTriangleMaterialContext()) {
            const overlays = faceDrawController?.getLiveTriangleOverlays?.() || [];
            if (!overlays.length) {
                showStatus("Mode Triangles : texturisez d’abord la sélection");
                return true;
            }
            const ok = faceDrawController?.applyLiveTriangleMaterial?.(props);
            if (ok) {
                const after = faceDrawController?.getLiveTriangleMaterial?.();
                if (after) syncMaterialMenu(after);
                showStatus(statusMsg || "Matériau des triangles");
            }
            return true;
        }
        if (isFaceMaterialContext(object)) {
            const live = faceDrawController?.getLiveFaceTextureTarget?.();
            if (!live || live.object !== object) {
                // Import / mode Face sans cible : appliquer à tout l’objet
                // (évite un « rien ne se passe » sauf si on a cliqué une face).
                if (object?.userData?.[LAB_IMPORTED_KEY] || object?.userData?.labShape === "imported") {
                    return false;
                }
                showStatus("Mode Face : cliquez d’abord la face / le mur");
                return true;
            }
            const ok = faceDrawController?.applyLiveFaceMaterial?.(props);
            if (ok) {
                const after = faceDrawController?.getLiveFaceMaterial?.();
                if (after) syncMaterialMenu(after);
                showStatus(statusMsg || "Matériau de la face / du mur");
            } else {
                showStatus("Mode Face : cliquez d’abord la face / le mur");
            }
            return true;
        }
        return false;
    }

    /** @param {{ roughness?: number, metalness?: number, opacity?: number, glass?: boolean, reflection?: number }} state */
    function syncMaterialMenu(state) {
        if (typeof state.glass === "boolean") contextMenu.syncProperty("glass", state.glass);
        if (typeof state.roughness === "number") contextMenu.syncProperty("roughness", state.roughness);
        if (typeof state.metalness === "number") contextMenu.syncProperty("metalness", state.metalness);
        if (typeof state.opacity === "number") contextMenu.syncProperty("opacity", state.opacity);
        if (typeof state.reflection === "number") contextMenu.syncProperty("reflection", state.reflection);
    }

    /**
     * En mode Face : teinte uniquement le mur / la face / la pièce ciblé(e).
     * @param {THREE.Object3D} object
     * @param {string} colorHex
     * @returns {boolean}
     */
    function applySelectedFaceColor(object, colorHex) {
        const hex = normalizeObjectColorHex(colorHex) || DEFAULT_OBJECT_COLOR;
        const live = faceDrawController?.getLiveFaceTextureTarget?.();
        if (!live || live.object !== object) return false;
        const ok = faceDrawController?.applyLiveFaceColor?.(hex);
        if (ok) {
            contextMenu.syncProperty("color", hex);
            return true;
        }
        return false;
    }

    /**
     * Mode Triangles : teinte les overlays texturés, ou pose une couleur sur la sélection.
     * @param {THREE.Object3D} object
     * @param {string} colorHex
     * @returns {boolean}
     */
    function applySelectedTriangleColor(object, colorHex) {
        const hex = normalizeObjectColorHex(colorHex) || DEFAULT_OBJECT_COLOR;
        const ok = faceDrawController?.applyLiveTriangleColor?.(hex);
        if (ok) {
            contextMenu.syncProperty("color", hex);
            return true;
        }
        return false;
    }

    function setObjectColor(object, colorHex) {
        if (isLabVegetation(object)) return;
        if (isTriangleMaterialContext()) {
            const before =
                faceDrawController?.getLiveTriangleColor?.() || getObjectColor(object);
            if (before === colorHex) return;
            if (applySelectedTriangleColor(object, colorHex)) {
                history.push({ type: "face-color", object, before, after: colorHex });
                showStatus("Couleur des triangles");
                return;
            }
            showStatus("Mode Triangles : texturisez ou sélectionnez des triangles d’abord");
            return;
        }
        // Architecture : couleur du mur sous le curseur (intérieur + extérieur opaques).
        if (isArchitectureFaceColorContext(object) || isFaceColorContext()) {
            const before = faceDrawController?.getLiveFaceColor?.() || getObjectColor(object);
            if (before === colorHex) return;
            if (applySelectedFaceColor(object, colorHex)) {
                history.push({ type: "face-color", object, before, after: colorHex });
                showStatus("Couleur de la face / mur");
                return;
            }
            if (isFaceColorContext()) {
                showStatus("Mode Face : cliquez d’abord la face / la pièce à colorer");
                return;
            }
        }
        const before = getObjectColor(object);
        if (before === colorHex) return;
        clearObjectGlassOnManualEdit(object);
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
        disposeObjectPhysics(object);
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

    /**
     * @param {THREE.Object3D} object
     */
    function objectSupportsPhysics(object) {
        if (!object || isLabLight(object)) return false;
        if (isLabArchitecture(object) || isLabStair(object) || isLabLanding(object)) return false;
        if (isLabArchOpeningFill(object)) return false;
        if (isLabTube(object)) return false;
        if (isLabBoat(object) && isBoatFloating(object)) return false;
        return true;
    }

    function setObjectPhysics(object, enabled) {
        if (!objectSupportsPhysics(object)) {
            showStatus("Physique non disponible sur cet objet");
            return;
        }
        if (isObjectPhysicsEnabled(object) === !!enabled) return;
        setObjectPhysicsEnabled(object, enabled);
        contextMenu.syncProperty("physics", enabled);
        contextMenu.syncProperty("physics-mass", getObjectPhysicsMass(object));
        contextMenu.syncProperty("physics-bounce", getObjectPhysicsBounce(object));
        if (enabled) {
            const t = getObjectPhysicsTeaching(object);
            showStatus(
                `Physique activée — m ${t.mass.toFixed(1)} kg · P ${(t.weightN).toFixed(1)} N · rebond ${t.bounce.toFixed(2).replace(".", ",")} (rotation + collisions)`
            );
        } else {
            showStatus("Physique désactivée (objet figé)");
        }
    }

    function setObjectPhysicsMassValue(object, mass) {
        if (!objectSupportsPhysics(object)) return;
        setObjectPhysicsMass(object, mass);
        const m = getObjectPhysicsMass(object);
        contextMenu.syncProperty("physics-mass", m);
        const g = 9.81;
        showStatus(`Masse ${m.toFixed(1).replace(".", ",")} kg — poids P = ${(m * g).toFixed(1).replace(".", ",")} N`);
    }

    function setObjectPhysicsBounceValue(object, bounce) {
        if (!objectSupportsPhysics(object)) return;
        setObjectPhysicsBounce(object, bounce);
        const e = getObjectPhysicsBounce(object);
        contextMenu.syncProperty("physics-bounce", e);
        showStatus(
            e <= 0.001
                ? "Rebond 0 — pose sans rebond"
                : `Rebond e = ${e.toFixed(2).replace(".", ",")} (élasticité)`
        );
        if (isObjectPhysicsEnabled(object)) wakeObjectPhysics(object);
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

    function setLightShadowOpacityValue(object, opacity) {
        if (!isLabLight(object)) return;
        setLightShadowOpacity(object, opacity);
        contextMenu.syncProperty("light-shadow-opacity", opacity);
        showStatus(`Densité d’ombre : ${opacity.toFixed(2).replace(".", ",")}`);
    }

    function setLightSpotAngleValue(object, degrees) {
        if (!isSpotLight(object)) return;
        setLightSpotAngleDeg(object, degrees);
        contextMenu.syncProperty("spot-angle", degrees);
        showStatus(`Angle spot : ${Math.round(degrees)}°`);
    }

    function setLightSpotPenumbraValue(object, penumbra) {
        if (!isSpotLight(object)) return;
        setLightSpotPenumbra(object, penumbra);
        contextMenu.syncProperty("spot-penumbra", penumbra);
        showStatus(`Pénombre spot : ${penumbra.toFixed(2).replace(".", ",")}`);
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
        if (infoSize) infoSize.textContent = formatted.size;
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
            // Éviter le mode scale sur une lumière (gizmo trompeur).
            if (isLabLight(selectedObject) && currentMode === "scale") {
                currentMode = "translate";
                transformControls.setMode("translate");
                transformControls.setSpace("world");
                syncModeUi();
            }
            transformControls.attach(selectedObject);
            transformControls.setMode(currentMode);
            transformControls.setSpace(currentMode === "translate" ? "world" : "local");
            transformControls.visible = true;
            applyTransformSnap(transformControls, snapByMode);
            if (isLabLight(selectedObject)) syncLightAim(selectedObject);
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
        // Les lumières n’ont pas d’échelle utile — forcer translate/rotate.
        if (mode === "scale" && selectedObject && isLabLight(selectedObject)) {
            mode = "translate";
        }
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

    function createArchitectureObject(options = {}) {
        const layout = normalizeArchLayout(options.layout);
        const preset =
            options.length == null && options.width == null && options.openings == null
                ? getArchLayoutPreset(layout)
                : null;
        const pivot = buildArchitectureGroup({
            color: options.color || DEFAULT_ARCHITECTURE_COLOR,
            layout,
            length: options.length ?? preset?.length,
            width: options.width ?? preset?.width,
            height: options.height ?? preset?.height,
            wall: options.wall,
            ceiling: options.ceiling ?? preset?.ceiling,
            plinthFloors: Array.isArray(options.plinthFloors)
                ? options.plinthFloors
                : options.plinth ?? preset?.plinth
                  ? [0]
                  : [],
            openings: options.openings ?? preset?.openings,
            wingA: options.wingA ?? preset?.wingA,
            wingB: options.wingB ?? preset?.wingB,
            floors: options.floors ?? preset?.floors,
            roughness: options.roughness,
            metalness: options.metalness,
        });
        pivot.userData[OBJECT_COLOR_KEY] = options.color || DEFAULT_ARCHITECTURE_COLOR;
        pivot.userData[COLLISION_KEY] = true;
        return registerLabObject(pivot);
    }

    /**
     * @param {{ length?: number, width?: number, skipTexture?: boolean }} [options]
     */
    function createBoatObject(options = {}) {
        const pivot = buildBoatGroup({
            length: options.length ?? BOAT_DEFAULT_LENGTH,
            width: options.width ?? BOAT_DEFAULT_WIDTH,
        });
        // Tangage / roulis pilotés par la houle par-dessus le cap du joueur.
        pivot.rotation.order = "YXZ";
        pivot.userData.snapToFloor = false;
        // Le bois est porté par la texture : teinte objet neutre.
        pivot.userData[OBJECT_COLOR_KEY] = "#ffffff";
        pivot.userData[OBJECT_ROUGHNESS_KEY] = 0.8;
        pivot.userData[COLLISION_KEY] = true;
        registerLabObject(pivot);

        if (!options.skipTexture) {
            const wood = getBoatWoodTextureDataUrl();
            if (wood) {
                void applyObjectTexture(pivot, wood)
                    .then(() => {
                        updateObjectVisual(pivot);
                        invalidateLabShadows();
                    })
                    .catch(() => {});
            }
        }
        return pivot;
    }

    function createBoatFromSnapshot(snapshot) {
        const shell = snapshot.boatShell === "imported" || snapshot.boatShell === "native"
            ? snapshot.boatShell
            : "procedural";

        if (shell === "imported" || (shell === "native" && snapshot.importDataUrl)) {
            const pivot = new THREE.Group();
            pivot.name = "lab-boat";
            pivot.rotation.order = "YXZ";
            pivot.userData[LAB_OBJECT_KEY] = true;
            applyBoatFloatMetadata(pivot, {
                length: snapshot.boatLength,
                width: snapshot.boatWidth,
                float: snapshot.boatFloat !== false,
                density: snapshot.boatDensity,
                shell: "imported",
                baseKind: snapshot.boatBaseKind || "imported",
            });
            pivot.userData.importFormat = snapshot.importFormat || "glb";
            pivot.userData.importName = snapshot.importName || "Barque";
            pivot.userData.importDataUrl = snapshot.importDataUrl || null;
            pivot.userData[COLLISION_KEY] = snapshot.collisionEnabled !== false;
            registerLabObject(pivot);
            applyObjectState(pivot, snapshot);
            const dataUrl = snapshot.importDataUrl;
            const format = snapshot.importFormat || "glb";
            if (dataUrl) {
                void ensureImportedTemplate(dataUrl, format).then((template) => {
                    clearBoatVisual(pivot);
                    const content = template.clone(true);
                    content.name = "boat-content";
                    pivot.add(content);
                    const measured = measureBoatFootprint(pivot);
                    applyBoatFloatMetadata(pivot, {
                        length: snapshot.boatLength ?? measured.length,
                        width: snapshot.boatWidth ?? measured.width,
                        float: snapshot.boatFloat !== false,
                        density: snapshot.boatDensity,
                        shell: "imported",
                    });
                    invalidateLabShadows();
                    updateObjectVisual(pivot);
                }).catch((err) => console.warn("[lab-import] restauration barque :", err));
            }
            return pivot;
        }

        if (shell === "native" && snapshot.boatBaseKind && snapshot.boatBaseKind !== "boat") {
            const baseSnap = { ...snapshot, kind: snapshot.boatBaseKind };
            delete baseSnap.boatShell;
            let object;
            if (snapshot.boatBaseKind === "tube") object = createTubeFromSnapshot(baseSnap);
            else if (snapshot.boatBaseKind === "stair") object = createStairFromSnapshot(baseSnap);
            else if (snapshot.boatBaseKind === "landing") object = createLandingFromSnapshot(baseSnap);
            else if (snapshot.boatBaseKind === "csg") {
                // CSG : fallback procédural si pas de géométrie dédiée ici
                object = createBoatObject({
                    length: snapshot.boatLength,
                    width: snapshot.boatWidth,
                    skipTexture: !!snapshot.textureDataUrl,
                });
            } else if (snapshot.boatBaseKind === "imported") {
                object = createImportedFromSnapshot(baseSnap);
            } else {
                object = createPrimitiveFromSnapshot(baseSnap);
            }
            applyBoatFloatMetadata(object, {
                length: snapshot.boatLength,
                width: snapshot.boatWidth,
                float: snapshot.boatFloat !== false,
                density: snapshot.boatDensity,
                shell: "native",
                baseKind: snapshot.boatBaseKind,
            });
            object.userData[COLLISION_KEY] = snapshot.collisionEnabled !== false;
            applyObjectState(object, snapshot);
            return object;
        }

        const object = createBoatObject({
            length: snapshot.boatLength,
            width: snapshot.boatWidth,
            skipTexture: !!snapshot.textureDataUrl,
        });
        object.userData[BOAT_FLOAT_KEY] = snapshot.boatFloat !== false;
        object.userData[BOAT_SHELL_KEY] = "procedural";
        applyObjectState(object, snapshot);
        return object;
    }

    /**
     * Transforme un objet existant en barque flottante (garde son mesh).
     * @param {THREE.Object3D} object
     */
    function makeObjectFloatAsBoat(object) {
        if (!object || isLabLight(object)) {
            showStatus("Choisissez un objet (cube, modèle importé…)");
            return null;
        }
        if (!oceanController?.isActive?.()) {
            showStatus("Créez d’abord un océan (Environnement) pour faire flotter l’objet");
        }

        // Déjà une barque importée / native : recalibrer la quille (souvent sous l’eau).
        if (isLabBoat(object) && getBoatShell(object) !== "procedural") {
            const before = captureFullSnapshot(object);
            prepareBoatForFloat(object, { alignKeel: true });
            object.userData[BOAT_FLOAT_KEY] = true;
            object.userData.boatKeelAligned = true;
            object.userData.snapToFloor = false;
            const waterY = oceanController?.getWaveHeightAt?.(object.position.x, object.position.z);
            if (typeof waterY === "number") {
                object.position.y = waterY - getBoatDraft(object) + getBoatKeelOffset(object);
            }
            object.rotation.x = 0;
            object.rotation.z = 0;
            updateObjectVisual(object);
            const after = captureFullSnapshot(object);
            history.push({ type: "reshape", object, before, after });
            showStatus("Quille recalée sur l’eau — flottaison corrigée");
            return object;
        }

        if (isLabBoat(object)) {
            showStatus("Cette barque flotte déjà");
            return null;
        }

        const before = captureFullSnapshot(object);
        let baseKind = "cube";
        if (object.userData?.[LAB_IMPORTED_KEY]) baseKind = "imported";
        else if (isLabTube(object)) baseKind = "tube";
        else if (isLabStair(object)) baseKind = "stair";
        else if (isLabLanding(object)) baseKind = "landing";
        else if (object.userData?.labCsg) baseKind = "csg";
        else baseKind = getPrimitiveSnapshotKind(object);

        // Forcer shell avant prepare : sinon un import est vu comme « procedural »
        // et la quille n’est pas réalignée → modèle sous l’eau.
        object.userData[BOAT_SHELL_KEY] = "native";
        prepareBoatForFloat(object, { alignKeel: true });
        applyBoatFloatMetadata(object, {
            float: true,
            shell: "native",
            baseKind,
        });
        object.userData[COLLISION_KEY] = true;
        object.userData.snapToFloor = false;
        object.rotation.order = "YXZ";
        const waterY = oceanController?.getWaveHeightAt?.(object.position.x, object.position.z);
        if (typeof waterY === "number") {
            const keel = getBoatKeelOffset(object);
            object.position.y = waterY - getBoatDraft(object) + keel;
        }
        registerSceneItem(object);
        refreshSceneRegistry();
        updateObjectVisual(object);
        const after = captureFullSnapshot(object);
        history.push({ type: "reshape", object, before, after });
        showStatus("Objet transformé en barque flottante — flottaison + collisions");
        return object;
    }

    /**
     * Remplace le mesh d’une barque par un modèle importé (conserve flottaison).
     * @param {THREE.Object3D} boat
     */
    async function replaceBoatAppearanceFromFile(boat) {
        if (!isLabBoat(boat)) return;
        const input = document.createElement("input");
        input.type = "file";
        input.accept = ".glb,.gltf,.fbx,.obj,.stl,.dae,.ply";
        input.hidden = true;
        document.body.appendChild(input);
        const file = await new Promise((resolve) => {
            let settled = false;
            const finish = () => {
                if (settled) return;
                settled = true;
                window.removeEventListener("focus", onWindowFocus);
                const chosen = input.files?.[0] || null;
                input.remove();
                resolve(chosen);
            };
            // Filet : « cancel » n’est pas émis partout — au retour du focus,
            // on laisse « change » arriver puis on libère l’await.
            const onWindowFocus = () => {
                setTimeout(finish, 800);
            };
            input.addEventListener("change", finish, { once: true });
            input.addEventListener("cancel", finish, { once: true });
            window.addEventListener("focus", onWindowFocus, { once: true });
            void pickFilePreservingFullscreen(input);
        });
        if (!file) return;
        try {
            const before = captureFullSnapshot(boat);
            const loaded = await loadModelFromFile(file);
            const key = importedTemplateKey(loaded.dataUrl, loaded.format);
            importedTemplateCache.set(key, loaded.root.clone(true));
            setBoatVisualContent(boat, loaded.root, {
                shell: "imported",
                baseKind: "imported",
                importFormat: loaded.format,
                importName: loaded.name,
                importDataUrl: loaded.dataUrl,
            });
            // Teinte neutre : le modèle apporte ses matériaux.
            boat.userData[OBJECT_COLOR_KEY] = "#ffffff";
            boat.userData[COLLISION_KEY] = true;
            const waterY = oceanController?.getWaveHeightAt?.(boat.position.x, boat.position.z);
            if (typeof waterY === "number") {
                const keel = getBoatKeelOffset(boat);
                boat.position.y = waterY - getBoatDraft(boat) + keel;
            }
            invalidateLabShadows();
            updateObjectVisual(boat);
            refreshSceneRegistry();
            const after = captureFullSnapshot(boat);
            history.push({ type: "reshape", object: boat, before, after });
            showStatus(`Apparence remplacée : ${loaded.name} — flottaison conservée`);
        } catch (err) {
            console.error("[lab-boat] import:", err);
            showStatus(err instanceof Error ? err.message : "Import impossible");
        }
    }

    /**
     * @param {THREE.Object3D} boat
     */
    function restoreProceduralBoatAppearance(boat) {
        if (!isLabBoat(boat)) return;
        const before = captureFullSnapshot(boat);
        const length = getBoatLength(boat);
        const width = getBoatWidth(boat);
        const fresh = buildBoatGroup({ length, width });
        clearBoatVisual(boat);
        for (const child of [...fresh.children]) {
            boat.add(child);
        }
        delete boat.userData.importDataUrl;
        delete boat.userData.importFormat;
        delete boat.userData.importName;
        delete boat.userData[BOAT_BASE_KIND_KEY];
        boat.userData[BOAT_SHELL_KEY] = "procedural";
        boat.userData[OBJECT_COLOR_KEY] = "#ffffff";
        const wood = getBoatWoodTextureDataUrl();
        if (wood) {
            void applyObjectTexture(boat, wood).then(() => updateObjectVisual(boat));
        }
        invalidateLabShadows();
        updateObjectVisual(boat);
        refreshSceneRegistry();
        const after = captureFullSnapshot(boat);
        history.push({ type: "reshape", object: boat, before, after });
        showStatus("Coque procédurale restaurée");
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

    function createArchitectureFromSnapshot(snapshot) {
        const object = createArchitectureObject({
            layout: snapshot.archLayout,
            length: snapshot.archLength,
            width: snapshot.archWidth,
            height: snapshot.archHeight,
            wall: snapshot.archWall,
            ceiling: snapshot.archCeiling,
            plinthFloors: Array.isArray(snapshot.archPlinthFloors)
                ? snapshot.archPlinthFloors
                : snapshot.archPlinth
                  ? [0]
                  : [],
            openings: snapshot.archOpenings,
            wingA: snapshot.archWingA,
            wingB: snapshot.archWingB,
            floors: snapshot.archFloors,
            color: snapshot.color,
            roughness: snapshot.roughness,
            metalness: snapshot.metalness,
        });
        applyObjectState(object, snapshot);
        void hydrateArchOpeningModels(object);
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
        let pending = importedTemplateLoading.get(key);
        if (pending) return pending;
        pending = loadModelFromDataUrl(dataUrl, /** @type {any} */ (format))
            .then((template) => {
                importedTemplateCache.set(key, template);
                importedTemplateLoading.delete(key);
                return template;
            })
            .catch((err) => {
                importedTemplateLoading.delete(key);
                throw err;
            });
        importedTemplateLoading.set(key, pending);
        return pending;
    }

    /**
     * Charge les GLB d’ouvertures Architecture (après restore / undo).
     * @param {THREE.Object3D} object
     */
    async function hydrateArchOpeningModels(object) {
        if (!isLabArchitecture(object)) return;
        const openings = getArchOpenings(object);
        let missing = false;
        for (const op of openings) {
            if (op.fill !== "imported" || !op.importDataUrl) continue;
            const format = op.importFormat || "glb";
            if (getArchOpeningImportTemplate(op.importDataUrl, format)) continue;
            missing = true;
            try {
                const template = await ensureImportedTemplate(op.importDataUrl, format);
                setArchOpeningImportTemplate(op.importDataUrl, format, template);
            } catch (err) {
                console.warn("[lab-arch] modèle ouverture :", err);
            }
        }
        if (!missing) return;
        applyArchitectureParams(object, { openings }, { recordHistory: false, quietUi: true, forceRebuild: true });
    }

    /**
     * @param {THREE.Object3D} object
     * @param {string} openingId
     */
    async function replaceArchOpeningWithFile(object, openingId) {
        if (!isLabArchitecture(object) || !openingId) return;
        const input = document.createElement("input");
        input.type = "file";
        input.accept = ".glb,.gltf,.fbx,.obj,.stl,.dae,.ply";
        input.hidden = true;
        document.body.appendChild(input);
        const file = await new Promise((resolve) => {
            let settled = false;
            const finish = () => {
                if (settled) return;
                settled = true;
                window.removeEventListener("focus", onWindowFocus);
                const chosen = input.files?.[0] || null;
                input.remove();
                resolve(chosen);
            };
            const onWindowFocus = () => {
                setTimeout(finish, 800);
            };
            input.addEventListener("change", finish, { once: true });
            input.addEventListener("cancel", finish, { once: true });
            window.addEventListener("focus", onWindowFocus, { once: true });
            void pickFilePreservingFullscreen(input);
        });
        if (!file) return;
        try {
            const loaded = await loadModelFromFile(file);
            const key = importedTemplateKey(loaded.dataUrl, loaded.format);
            importedTemplateCache.set(key, loaded.root.clone(true));
            setArchOpeningImportTemplate(loaded.dataUrl, loaded.format, loaded.root);
            const next = getArchOpenings(object).map((op) => {
                if (op.id !== openingId) return op;
                return {
                    ...op,
                    fill: "imported",
                    importDataUrl: loaded.dataUrl,
                    importFormat: loaded.format,
                    importName: loaded.name,
                };
            });
            applyArchitectureParams(object, { openings: next });
            showStatus(`Ouverture remplacée : ${loaded.name}`);
        } catch (err) {
            console.error("[lab-arch] import ouverture :", err);
            showStatus(err instanceof Error ? err.message : "Import impossible");
        }
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
        const base = String(name).replace(/\.(glb|gltf|fbx|obj|stl|dae|ply)$/i, "") || "Import";
        pivot.userData.sceneItemLabel =
            typeof meta.sceneItemLabel === "string" && meta.sceneItemLabel.trim()
                ? meta.sceneItemLabel.trim()
                : `${base} ${importedCounter}`;
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
            sceneItemLabel: snapshot.sceneItemLabel,
        });
        object.userData[COLLISION_KEY] = !!snapshot.collisionEnabled;
        ensureImportedMeshPersistIds(object);

        // Transform / ombres UNIQUEMENT — jamais applyObjectState (opacity/metal async
        // détruisent le verre restauré juste après).
        applyImportedTransformOnly(object, snapshot);

        object.userData._labSceneImportSeq = currentSceneImportSeq;

        const appearanceJob = (async () => {
            const importSeq = object.userData._labSceneImportSeq;
            const stillCurrent = () =>
                importSeq === sceneImportSeq && editableObjects.includes(object);

            if (dataUrl && !importedTemplateCache.has(importedTemplateKey(dataUrl, format))) {
                try {
                    const template = await ensureImportedTemplate(dataUrl, format);
                    if (!stillCurrent()) return;
                    while (object.children.length) object.remove(object.children[0]);
                    object.add(template.clone(true));
                    ensureImportedMeshPersistIds(object);
                    applyImportedTransformOnly(object, snapshot);
                } catch (err) {
                    console.warn("[lab-import] restauration modèle :", err);
                }
            }
            if (!stillCurrent()) return;
            await restoreImportedAppearance(object, snapshot, { applyObjectColor });
            if (!stillCurrent()) return;
            invalidateLabShadows();
            updateObjectVisual(object);
        })();
        object.userData._labImportAppearanceJob = appearanceJob;
        void appearanceJob;
        return object;
    }

    /**
     * Pose / collision / ombres sans toucher aux matériaux (évite d'écraser le verre).
     * @param {THREE.Object3D} object
     * @param {object} snapshot
     */
    function applyImportedTransformOnly(object, snapshot) {
        if (!object || !snapshot) return;
        if (snapshot.position) {
            object.position.set(
                Number(snapshot.position.x) || 0,
                Number(snapshot.position.y) || 0,
                Number(snapshot.position.z) || 0
            );
        }
        if (snapshot.quaternion) {
            object.quaternion.set(
                Number(snapshot.quaternion.x) || 0,
                Number(snapshot.quaternion.y) || 0,
                Number(snapshot.quaternion.z) || 0,
                Number(snapshot.quaternion.w) || 1
            );
        } else if (snapshot.rotation) {
            object.rotation.set(
                Number(snapshot.rotation.x) || 0,
                Number(snapshot.rotation.y) || 0,
                Number(snapshot.rotation.z) || 0
            );
        }
        if (snapshot.scale) {
            object.scale.set(
                Number(snapshot.scale.x) || 1,
                Number(snapshot.scale.y) || 1,
                Number(snapshot.scale.z) || 1
            );
        }
        if (snapshot.collisionEnabled !== undefined) {
            object.userData[COLLISION_KEY] = !!snapshot.collisionEnabled;
        }
        if (snapshot.shadowEnabled !== undefined) {
            setObjectShadowEnabled(object, !!snapshot.shadowEnabled);
        }
        if (typeof snapshot.shadowOpacity === "number") {
            setObjectShadowOpacity(object, snapshot.shadowOpacity);
        }
        if (typeof snapshot.labId === "string" && snapshot.labId) {
            object.userData.labId = snapshot.labId;
        }
        applyObjectPhysicsData(object, snapshot);
    }

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
        // Avec un océan : activer la flottaison (quille corrigée pour les .glb).
        if (oceanController?.isActive?.()) {
            makeObjectFloatAsBoat(placed);
            showStatus(`Importé et mis à flotter : ${loaded.name} — décochez « Flottaison » si besoin`);
        } else {
            showStatus(
                `Importé : ${loaded.name} — créez un océan puis clic droit → Faire flotter comme une barque`
            );
        }
        return placed;
    }

    /**
     * @param {ArrayBuffer} buffer
     * @param {string} mime
     * @returns {Promise<string>}
     */
    function arrayBufferToDataUrl(buffer, mime = "application/octet-stream") {
        return new Promise((resolve, reject) => {
            const blob = new Blob([buffer], { type: mime });
            const reader = new FileReader();
            reader.onload = () => {
                if (typeof reader.result === "string") resolve(reader.result);
                else reject(new Error("Conversion data URL impossible"));
            };
            reader.onerror = () => reject(reader.error ?? new Error("Conversion data URL impossible"));
            reader.readAsDataURL(blob);
        });
    }

    /**
     * Placement depuis la bibliothèque « Objets chargés » (sans flottaison auto).
     * @param {{ dataUrl?: string, buffer?: ArrayBuffer, format: string, name?: string, id?: string }} asset
     * @param {THREE.Vector3} [position]
     */
    async function spawnImportedLibraryAsset(asset, position) {
        if (!asset?.format || (!asset.buffer && !asset.dataUrl)) {
            throw new Error("Objet bibliothèque invalide");
        }
        const format = asset.format;
        const name = asset.name || "Import";
        const cacheKey = importedTemplateKey(asset.id || asset.dataUrl || name, format);

        let template = importedTemplateCache.get(cacheKey);
        if (!template) {
            if (asset.buffer instanceof ArrayBuffer) {
                const root = await parseModelData(asset.buffer, /** @type {any} */ (format));
                prepareImportedContent(root);
                template = root;
            } else {
                template = await loadModelFromDataUrl(
                    /** @type {string} */ (asset.dataUrl),
                    /** @type {any} */ (format)
                );
            }
            importedTemplateCache.set(cacheKey, template.clone(true));
        }

        let dataUrl = asset.dataUrl || null;
        if (!dataUrl && asset.buffer instanceof ArrayBuffer) {
            const mime =
                format === "glb"
                    ? "model/gltf-binary"
                    : format === "gltf"
                      ? "model/gltf+json"
                      : "application/octet-stream";
            try {
                dataUrl = await arrayBufferToDataUrl(asset.buffer, mime);
            } catch (err) {
                console.warn("[lab-import] dataUrl pour sauvegarde scène impossible", err);
            }
        }

        const pivot = createImportedPivot(template.clone(true), {
            name,
            format,
            dataUrl,
        });
        const placed = addObjectAt(pivot, position ?? spawnPoint());
        showStatus(`Placé : ${name}`);
        return placed;
    }

    /**
     * Drop bibliothèque objets : raycast sol / spawn.
     * @param {{ dataUrl?: string, buffer?: ArrayBuffer, format: string, name?: string, id?: string }} asset
     * @param {number} [clientX]
     * @param {number} [clientY]
     */
    async function spawnImportedLibraryAssetAtClient(asset, clientX, clientY) {
        let position = null;
        if (Number.isFinite(clientX) && Number.isFinite(clientY)) {
            position = raycastToFloor(clientX, clientY);
        }
        return spawnImportedLibraryAsset(asset, position || undefined);
    }

    function createObjectFromSnapshot(snapshot) {
        const object = createObjectFromSnapshotBase(snapshot);
        // Restaurer l’identité : les entrées d’historique antérieures pourront
        // retrouver ce nouvel objet à la place de l’ancien (disposé).
        if (object?.userData && typeof snapshot?.labId === "string" && snapshot.labId) {
            object.userData.labId = snapshot.labId;
        }
        return object;
    }

    function createObjectFromSnapshotBase(snapshot) {
        if (snapshot.kind === "light") {
            const pivot = createLightPivot(snapshot.lightType);
            registerLabLight(pivot);
            // Anciennes scènes : cible sous le pivot (0,-4,0), sans pitch -90°.
            if (
                snapshot.lightAim !== "negZ" &&
                (snapshot.lightType === LIGHT_TYPE.SPOT || snapshot.lightType === LIGHT_TYPE.SUN)
            ) {
                const target = pivot.userData.lightTarget;
                if (target) target.position.set(0, -4, 0);
                pivot.rotation.set(0, 0, 0);
                pivot.userData.lightAim = "negY";
            }
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
            if (typeof snapshot.spotPenumbra === "number" && isSpotLight(pivot)) {
                setLightSpotPenumbra(pivot, snapshot.spotPenumbra);
            }
            if (snapshot.shadowEnabled !== undefined) {
                setLightShadowEnabled(pivot, !!snapshot.shadowEnabled);
            }
            if (typeof snapshot.shadowOpacity === "number") {
                setLightShadowOpacity(pivot, snapshot.shadowOpacity);
            }
            syncLightAim(pivot);
            return pivot;
        }
        if (snapshot.kind === "boat") {
            return createBoatFromSnapshot(snapshot);
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
        if (snapshot.kind === "architecture") {
            return createArchitectureFromSnapshot(snapshot);
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
        oceanController?.remove?.({ recordHistory: false, resetSettings: true });
        skyboxController?.clear?.();
        deselectObject();
    }

    function exportSceneDocument() {
        // Récupère d’éventuels objets lab présents dans la scène mais absents de la liste.
        for (const child of scene.children) {
            if (child === yaw || child === transformControls) continue;
            if (isLabLight(child)) {
                if (!editableObjects.includes(child)) registerLabLight(child);
                continue;
            }
            if (child.userData?.[LAB_OBJECT_KEY] === true && !editableObjects.includes(child)) {
                editableObjects.push(child);
                registerCollidable(child);
                registerSceneItem(child);
            }
        }

        /** @type {string[]} */
        const assetIds = [];
        for (const object of editableObjects) {
            const id = getVegetationAssetId(object);
            if (id && !assetIds.includes(id)) assetIds.push(id);
        }
        const assets = serializeVegetationAssets(assetIds);

        /** @type {ReturnType<typeof serializeObjectSnapshot>[]} */
        const objects = [];
        /** @type {string[]} */
        const failed = [];
        for (const object of editableObjects) {
            try {
                objects.push(serializeObjectSnapshot(captureFullSnapshot(object)));
            } catch (error) {
                const label =
                    object?.userData?.sceneItemLabel ||
                    object?.userData?.lightType ||
                    object?.uuid ||
                    "?";
                failed.push(String(label));
                console.warn("[lab] sérialisation objet échouée :", label, error);
            }
        }
        if (editableObjects.length > 0 && objects.length === 0) {
            throw new Error(
                `Impossible d'enregistrer : aucun objet sérialisable${
                    failed.length ? ` (${failed.join(", ")})` : ""
                }.`
            );
        }

        const doc = buildSceneDocument(objects, {
            name: getCurrentSceneFileName() || "",
            terrain: terrainController?.serialize() || null,
            ocean: oceanController?.serialize() || null,
            skybox: skyboxController?.serialize?.() || null,
            vegetationAssets: Object.keys(assets).length ? assets : null,
            view: serializeView?.() || null,
        });
        if (failed.length) {
            doc._serializeWarnings = failed;
        }
        return doc;
    }

    async function saveScene({ forceSaveAs = false } = {}) {
        closeLabDialog();
        let doc;
        try {
            doc = exportSceneDocument();
        } catch (error) {
            showStatus(error instanceof Error ? error.message : "Impossible de préparer la scène");
            return;
        }

        const objectCount = Array.isArray(doc.objects) ? doc.objects.length : 0;

        if (hasDiskFileHandle() && !forceSaveAs) {
            try {
                const result = await saveSceneToDiskLocation(doc, { saveAs: false });
                showStatus(
                    `Enregistré sur le disque : ${result.name} (${objectCount} objet${
                        objectCount > 1 ? "s" : ""
                    })`
                );
                return;
            } catch (error) {
                if (/** @type {DOMException} */ (error).name === "AbortError") return;
                showStatus(
                    error instanceof Error ? error.message : "Impossible d'enregistrer sur le disque"
                );
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
            showStatus(
                `Scène enregistrée : ${result.name} (${objectCount} objet${
                    objectCount > 1 ? "s" : ""
                })`
            );
        } catch (error) {
            if (/** @type {DOMException} */ (error).name === "AbortError") {
                showStatus("Enregistrement annulé");
                return;
            }
            showStatus(error instanceof Error ? error.message : "Impossible d'enregistrer");
        }
    }

    async function saveSceneAs() {
        await saveScene({ forceSaveAs: true });
    }

    async function saveSceneToDisk() {
        closeLabDialog();
        let doc;
        try {
            doc = exportSceneDocument();
        } catch (error) {
            showStatus(error instanceof Error ? error.message : "Impossible de préparer la scène");
            return;
        }
        try {
            const result = await saveSceneToDiskLocation(doc, {
                saveAs: true,
                suggestedName: getCurrentSceneFileName(),
            });
            const objectCount = Array.isArray(doc.objects) ? doc.objects.length : 0;
            showStatus(
                result.onDisk
                    ? `Enregistré sur le disque : ${result.name} (${objectCount} obj.)`
                    : `Téléchargé : ${result.name} (${objectCount} obj.)`
            );
        } catch (error) {
            if (/** @type {DOMException} */ (error).name === "AbortError") {
                showStatus("Enregistrement annulé");
                return;
            }
            showStatus(
                error instanceof Error ? error.message : "Impossible d'enregistrer sur le disque"
            );
        }
    }

    async function importSceneDocument(data, { fileName = null } = {}) {
        const runImport = async () => {
            const importSeq = ++sceneImportSeq;
            currentSceneImportSeq = importSeq;
            await beginLoadingOverlay();
            try {
                await tickLoadingProgress(3);
                resetEditorInteractionState();
                await tickLoadingProgress(8);
                const snapshots = parseSceneDocument(data);
                const doc =
                    data && typeof data === "object"
                        ? /** @type {{ terrain?: unknown, ocean?: unknown, skybox?: unknown, vegetationAssets?: unknown, view?: unknown }} */ (
                              data
                          )
                        : null;
                if (doc?.vegetationAssets) {
                    await hydrateVegetationAssets(doc.vegetationAssets);
                    syncVegetationModelUi();
                }
                await tickLoadingProgress(16);
                removeAllObjects();
                history.clear();
                clipboard = null;
                resetObjectCounters();
                /** @type {Promise<unknown>[]} */
                const importAppearanceJobs = [];
                const snapCount = Math.max(1, snapshots.length);
                for (let i = 0; i < snapshots.length; i++) {
                    const snapshot = snapshots[i];
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
                    if (snapshot.kind === "architecture" && Array.isArray(snapshot.archOpenings)) {
                        for (const raw of snapshot.archOpenings) {
                            const op = /** @type {Record<string, unknown>} */ (raw || {});
                            if (op.fill !== "imported" || typeof op.importDataUrl !== "string") continue;
                            try {
                                const format =
                                    typeof op.importFormat === "string" && op.importFormat
                                        ? op.importFormat
                                        : "glb";
                                const template = await ensureImportedTemplate(op.importDataUrl, format);
                                setArchOpeningImportTemplate(op.importDataUrl, format, template);
                            } catch (error) {
                                console.warn("[lab-arch] restauration ouverture :", error);
                            }
                        }
                    }
                    if (importSeq !== sceneImportSeq) return;
                    const created = addObjectFromSnapshot(snapshot, {
                        recordHistory: false,
                        select: false,
                    });
                    const job = created?.userData?._labImportAppearanceJob;
                    if (job && typeof job.then === "function") {
                        importAppearanceJobs.push(
                            job.catch((err) => {
                                console.warn("[lab-import] apparence objet :", err);
                            })
                        );
                    }
                    await tickLoadingProgress(18 + Math.round((52 * (i + 1)) / snapCount));
                }
                if (importAppearanceJobs.length) {
                    await Promise.all(importAppearanceJobs);
                }
                if (importSeq !== sceneImportSeq) return;
                await tickLoadingProgress(74);
                try {
                    if (terrainController?.deserialize) {
                        await terrainController.deserialize(doc?.terrain ?? null, {
                            recordHistory: false,
                        });
                    }
                } catch (error) {
                    console.warn("[lab] terrain :", error);
                }
                await tickLoadingProgress(82);
                try {
                    if (oceanController?.deserialize) {
                        await oceanController.deserialize(doc?.ocean ?? null, { recordHistory: false });
                    }
                } catch (error) {
                    console.warn("[lab] océan :", error);
                }
                await tickLoadingProgress(89);
                try {
                    if (skyboxController?.deserialize) {
                        await skyboxController.deserialize(doc?.skybox ?? null);
                    }
                } catch (error) {
                    console.warn("[lab] skybox / HDRI :", error);
                }
                await tickLoadingProgress(94);
                reconcileEditableObjects();
                refreshSceneRegistry();
                if (fileName) {
                    setCurrentSceneFileName(fileName);
                }
                resetEditorInteractionState();
                if (doc?.view) {
                    restoreView?.(doc.view);
                }
                await tickLoadingProgress(100);
                showStatus(fileName ? `Scène ouverte : ${fileName}` : "Scène ouverte");
            } catch (error) {
                resetEditorInteractionState();
                showStatus(error instanceof Error ? error.message : "Impossible d'ouvrir la scène");
            } finally {
                if (importSeq === sceneImportSeq) hideLoadingOverlay();
            }
        };
        importSceneDocumentChain = importSceneDocumentChain.then(runImport, runImport);
        return importSceneDocumentChain;
    }

    /** Remet peinture / gizmo / gestures dans un état cliquable après ouverture de scène. */
    function resetEditorInteractionState() {
        closeLabDialog();
        try {
            faceDrawController?.setActive?.(false);
        } catch {
            /* ignore */
        }
        paintModeActive = false;
        setDrawModeActive?.(false);
        setPaintStrokeActive?.(false);
        cancelLookGesture?.();
        try {
            csgTool?.cancelPickMode?.();
        } catch {
            /* ignore */
        }
        try {
            setVegetationPlaceActive?.(false);
        } catch {
            /* ignore */
        }
        triangulationMode = false;
        textureApplyMode = "object";
        syncTextureModeDocClass();
        try {
            faceDrawController?.clearTriangleSelection?.();
            applyTriangulationOverlays(false);
        } catch {
            /* ignore */
        }
        ignoreClickAfterGizmo = false;
        onGizmoDraggingChange?.(false);
        transformBefore = null;
        multiDragStarts = null;
        primaryDragStart = null;
        transformControls.detach();
        transformControls.enabled = true;
        transformControls.visible = false;
        gizmoActive = false;
        syncModeUi();
        deselectObject();
        enterExplore?.();
    }

    function resetSceneFileState() {
        clearSceneFileSession();
    }

    /** Remet les compteurs de nommage à zéro (nouvelle scène / ouverture). */
    function resetObjectCounters() {
        cubeCounter = 0;
        sphereCounter = 0;
        for (const key of Object.keys(primitiveCounters)) {
            delete primitiveCounters[key];
        }
        stairCounter = 0;
        landingCounter = 0;
        tubeCounter = 0;
        boatCounter = 0;
        architectureCounter = 0;
        vegetationCounter = 0;
        importedCounter = 0;
        lightCounters.spot = 0;
        lightCounters.directional = 0;
        lightCounters.point = 0;
    }

    /** Repart de zéro : modes d’édition, objets, historique, presse-papiers, compteurs. */
    function clearSceneCompletely() {
        resetEditorInteractionState();
        removeAllObjects();
        history.clear();
        clipboard = null;
        resetObjectCounters();
        lastFloatTimeMs = 0;
    }

    /** @returns {Promise<boolean>} true si la scène a réellement été réinitialisée. */
    async function newScene({ confirmIfNotEmpty = true } = {}) {
        if (
            confirmIfNotEmpty &&
            (editableObjects.length > 0 ||
                terrainController?.hasTerrain() ||
                oceanController?.isActive?.() ||
                skyboxController?.isActive?.())
        ) {
            const ok = await labConfirm(
                "Créer une nouvelle scène ? Les modifications non enregistrées seront perdues.",
                { title: "Nouvelle scène", confirmLabel: "Créer" }
            );
            if (!ok) return false;
        }
        clearSceneCompletely();
        resetSceneFileState();
        showStatus("Nouvelle scène");
        return true;
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

    /** @returns {Promise<boolean>} true si la scène a réellement été fermée. */
    async function closeScene() {
        if (
            editableObjects.length > 0 ||
            terrainController?.hasTerrain() ||
            oceanController?.isActive?.() ||
            skyboxController?.isActive?.()
        ) {
            const ok = await labConfirm(
                "Fermer la scène ? Les modifications non enregistrées seront perdues.",
                { title: "Fermer", confirmLabel: "Fermer" }
            );
            if (!ok) return false;
        }
        clearSceneCompletely();
        resetSceneFileState();
        showStatus("Scène fermée");
        return true;
    }

    function selectObject(object, { highlight = true, additive = false, frameCamera = false } = {}) {
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
        // Met à jour le pivot d’orbite sans bouger la caméra (sauf frame explicite).
        notifyOrbitTarget({ frame: frameCamera && !suppressCameraFrame });
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
        faceDrawController?.clearFaceSelectionHighlight?.();
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
        const pos = (position ?? spawnPoint()).clone?.() ?? new THREE.Vector3().copy(position ?? spawnPoint());
        const aim =
            options.aimDirection instanceof THREE.Vector3
                ? options.aimDirection
                : null;
        if (!aim) {
            pos.y = Math.max(pos.y, type === LIGHT_TYPE.SUN ? 4 : 2.5);
            pivot.position.copy(snapPlacement(pos));
            if (snapByMode.translate) {
                pivot.position.y = snapValue(pivot.position.y, GRID_STEP);
            }
        } else {
            // Placement sur surface : position exacte (pas de snap qui enfoncerait dans le mur).
            pivot.position.copy(pos);
            if (type === LIGHT_TYPE.SPOT || type === LIGHT_TYPE.SUN) {
                orientLightPivotToward(pivot, aim);
            } else {
                pivot.rotation.set(0, 0, 0);
            }
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

    function spawnBoatAt(position, options = {}) {
        const target = position ?? spawnPoint();
        const object = addObjectAt(createBoatObject(options), target, options);
        const waterY = oceanController?.getWaveHeightAt?.(object.position.x, object.position.z);
        if (typeof waterY === "number") {
            object.position.y = waterY - BOAT_DRAFT;
            showStatus(
                `Barque mise à l’eau — ${getBoatLength(object).toFixed(1).replace(".", ",")} m × ${getBoatWidth(object).toFixed(1).replace(".", ",")} m`
            );
        } else {
            showStatus(
                `Barque ajoutée — ${getBoatLength(object).toFixed(1).replace(".", ",")} m × ${getBoatWidth(object).toFixed(1).replace(".", ",")} m (créez un océan pour la faire flotter)`
            );
        }
        return object;
    }

    function spawnArchitectureAt(position, options = {}) {
        const layout = normalizeArchLayout(options.layout);
        const preset = getArchLayoutPreset(layout);
        const isFirstRoom = !editableObjects.some((obj) => isLabArchitecture(obj));
        const object = addObjectAt(
            createArchitectureObject({ ...options, layout }),
            position ?? spawnPoint(),
            options
        );
        showStatus(
            `${preset.label} ajouté(e) — ${getArchLength(object).toFixed(1).replace(".", ",")} × ${getArchWidth(object).toFixed(1).replace(".", ",")} × ${getArchHeight(object).toFixed(1).replace(".", ",")} m`
        );
        if (isFirstRoom) {
            enterFirstArchitectureRoom(object);
        }
        return object;
    }

    /**
     * Première pièce : place l’avatar (caméra FPS) au centre, pieds sur le sol.
     * Regard vers la porte sud (axe −Z local).
     * @param {THREE.Object3D} object
     */
    function enterFirstArchitectureRoom(object) {
        if (!isLabArchitecture(object) || !placePlayerAt) return;
        object.updateWorldMatrix(true, true);
        const feet = new THREE.Vector3(0, 0.02, 0);
        object.localToWorld(feet);
        const ok = placePlayerAt(feet.x, feet.y, feet.z, {
            switchToFps: true,
            snapGround: false,
            exact: true,
            yaw: object.rotation.y,
        });
        if (ok) {
            showStatus("Avatar au centre de la pièce — mode FPS");
        }
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

    function ensureAvatarPlaceMarker() {
        if (avatarPlaceMarker) return avatarPlaceMarker;
        const group = new THREE.Group();
        group.name = "lab-avatar-place-marker";
        group.userData.labNoPick = true;
        group.userData.labNoMirror = true;
        group.userData._labNoPaintPick = true;

        const matRing = new THREE.MeshBasicMaterial({
            color: 0xff1f1f,
            side: THREE.DoubleSide,
            depthTest: false,
            transparent: true,
            opacity: 0.95,
        });
        const matFill = new THREE.MeshBasicMaterial({
            color: 0xff2a2a,
            side: THREE.DoubleSide,
            depthTest: false,
            transparent: true,
            opacity: 0.28,
        });
        const matPole = new THREE.MeshBasicMaterial({
            color: 0xff3333,
            depthTest: false,
            transparent: true,
            opacity: 0.75,
        });

        const ring = new THREE.Mesh(
            new THREE.RingGeometry(PLAYER_RADIUS * 0.72, PLAYER_RADIUS * 1.08, 48),
            matRing
        );
        ring.rotation.x = -Math.PI / 2;
        ring.position.y = 0.025;
        ring.renderOrder = 1000;
        ring.name = "avatar-place-ring";

        const fill = new THREE.Mesh(new THREE.CircleGeometry(PLAYER_RADIUS * 0.72, 48), matFill);
        fill.rotation.x = -Math.PI / 2;
        fill.position.y = 0.02;
        fill.renderOrder = 999;
        fill.name = "avatar-place-fill";

        const pole = new THREE.Mesh(
            new THREE.CylinderGeometry(0.035, 0.035, PLAYER_HEIGHT, 10),
            matPole
        );
        pole.position.y = PLAYER_HEIGHT * 0.5;
        pole.renderOrder = 1000;
        pole.name = "avatar-place-pole";

        // Petite tête pour lire l’échelle « joueur ».
        const head = new THREE.Mesh(new THREE.SphereGeometry(0.14, 12, 10), matPole);
        head.position.y = PLAYER_HEIGHT + 0.12;
        head.renderOrder = 1000;
        head.name = "avatar-place-head";

        group.add(ring, fill, pole, head);
        group.visible = false;
        scene.add(group);
        avatarPlaceMarker = group;
        return group;
    }

    /**
     * @param {boolean} valid
     */
    function setAvatarPlaceMarkerValid(valid) {
        const marker = avatarPlaceMarker;
        if (!marker) return;
        marker.traverse((child) => {
            if (!(child instanceof THREE.Mesh)) return;
            const mat = child.material;
            if (!mat || !("color" in mat)) return;
            mat.color.setHex(valid ? 0xff1f1f : 0x64748b);
            if ("opacity" in mat) {
                mat.opacity = valid
                    ? child.name === "avatar-place-fill"
                        ? 0.28
                        : child.name === "avatar-place-pole" || child.name === "avatar-place-head"
                          ? 0.75
                          : 0.95
                    : 0.35;
            }
        });
    }

    /**
     * @param {{ point: THREE.Vector3, snapGround: boolean, yaw?: number } | null} preview
     */
    function updateAvatarPlaceMarker(preview) {
        const marker = ensureAvatarPlaceMarker();
        avatarPlacePreview = preview;
        if (!preview) {
            marker.visible = false;
            setAvatarPlaceMarkerValid(false);
            return;
        }
        marker.visible = true;
        marker.position.copy(preview.point);
        if (typeof preview.yaw === "number" && Number.isFinite(preview.yaw)) {
            marker.rotation.y = preview.yaw;
        }
        setAvatarPlaceMarkerValid(true);
    }

    function disposeAvatarPlaceMarker() {
        if (!avatarPlaceMarker) return;
        scene.remove(avatarPlaceMarker);
        avatarPlaceMarker.traverse((child) => {
            if (child instanceof THREE.Mesh) {
                child.geometry?.dispose?.();
                const mats = Array.isArray(child.material) ? child.material : [child.material];
                for (const mat of mats) mat?.dispose?.();
            }
        });
        avatarPlaceMarker = null;
        avatarPlacePreview = null;
    }

    /**
     * Point d’appui sous le curseur (même logique pour l’aperçu et le clic).
     * @param {number} clientX
     * @param {number} clientY
     * @returns {{ point: THREE.Vector3, snapGround: boolean, yaw?: number } | null}
     */
    function pickAvatarStandHit(clientX, clientY) {
        setPointerFromClient(clientX, clientY);
        raycaster.setFromCamera(pointer, camera);
        reconcileEditableObjects();

        /** @type {THREE.Object3D[]} */
        const roots = [...editableObjects];
        const terrain = terrainController?.getTerrain?.();
        if (terrain && !roots.includes(terrain)) roots.push(terrain);
        const oceanMesh = scene.getObjectByName("lab-ocean");
        if (oceanMesh && !roots.includes(oceanMesh)) roots.push(oceanMesh);

        const hits = raycaster.intersectObjects(roots, true);
        for (const hit of hits) {
            if (!hit?.point) continue;
            if (hit.object?.name === "shadow-overlay") continue;
            if (hit.object?.name?.startsWith?.("avatar-place-")) continue;

            const isOcean =
                hit.object?.userData?.labOcean === true ||
                hit.object?.name === "lab-ocean" ||
                hit.object?.parent?.userData?.labOcean === true;
            if (hit.object?.userData?.labNoPick && !isOcean) continue;
            if (hit.object?.userData?._labNoPaintPick && !isOcean) continue;

            const entity = resolveLabObject(hit);
            if (entity && isLabLight(entity)) continue;

            const point = hit.point.clone();
            // Léger offset pour éviter z-fighting / enfoncement dans le mesh.
            if (hit.face?.normal) {
                const n = hit.face.normal.clone().transformDirection(hit.object.matrixWorld).normalize();
                if (n.y > 0.2) point.addScaledVector(n, 0.02);
                else point.y += 0.02;
            } else {
                point.y += 0.02;
            }

            const onObject = isOcean || (!!entity && !isLabTerrainObject(entity));
            return {
                point,
                snapGround: false,
                yaw: onObject && entity && typeof entity.rotation?.y === "number" ? entity.rotation.y : undefined,
            };
        }

        const floorPos = raycastToFloor(clientX, clientY);
        if (!floorPos) return null;
        floorPos.y += 0.02;
        return { point: floorPos, snapGround: false };
    }

    function setAvatarPlaceActive(active) {
        avatarPlaceActive = !!active;
        if (avatarPlaceActive) {
            setLightPlaceActive(null);
            setVegetationPlaceActive(false);
            csgTool?.cancelPickMode?.();
            enterExplore?.();
            ensureAvatarPlaceMarker();
            showStatus("Curseur rouge = position des pieds — clic pour placer (Échap pour annuler)");
        } else {
            if (avatarPlaceMarker) avatarPlaceMarker.visible = false;
            avatarPlacePreview = null;
        }
        setAvatarPlaceModeActive?.(avatarPlaceActive);
        placeAvatarBtn?.classList.toggle("is-active", avatarPlaceActive);
        placeAvatarBtn?.setAttribute("aria-pressed", avatarPlaceActive ? "true" : "false");
    }

    /**
     * @param {THREE.Vector3} feetPoint
     * @param {{ snapGround?: boolean, yaw?: number }} [opts]
     */
    function placeAvatarAtPoint(feetPoint, opts = {}) {
        if (!placePlayerAt || !feetPoint) return false;
        const ok = placePlayerAt(feetPoint.x, feetPoint.y, feetPoint.z, {
            switchToFps: true,
            // Le curseur rouge est la source de vérité : pas de re-snap sol / clamp.
            snapGround: false,
            exact: true,
            yaw: opts.yaw,
        });
        if (ok) {
            setAvatarPlaceActive(false);
            showStatus("Avatar placé — mode FPS");
        }
        return ok;
    }

    /**
     * @param {THREE.Object3D} object
     */
    function placeAvatarOnObject(object) {
        if (!object || isLabLight(object)) return false;
        const stand = isLabBoat(object)
            ? getBoatStandPoint(object)
            : (() => {
                  object.updateWorldMatrix(true, true);
                  const box = new THREE.Box3().setFromObject(object);
                  return new THREE.Vector3(
                      (box.min.x + box.max.x) * 0.5,
                      box.max.y + 0.02,
                      (box.min.z + box.max.z) * 0.5
                  );
              })();
        return placeAvatarAtPoint(stand, { snapGround: false, yaw: object.rotation.y });
    }

    /**
     * @param {number} clientX
     * @param {number} clientY
     */
    function placeAvatarAtClient(clientX, clientY) {
        // Priorité au curseur rouge visible (dernier aperçu), pas un re-raycast
        // qui peut diverger au moment du clic.
        const hit = avatarPlacePreview || pickAvatarStandHit(clientX, clientY);
        if (!hit) {
            showStatus("Cliquez sur le sol, le terrain ou un objet (anneau rouge)");
            return false;
        }
        return placeAvatarAtPoint(hit.point.clone?.() ?? hit.point, {
            snapGround: false,
            yaw: hit.yaw,
        });
    }

    function handleAvatarPlacePointerMove(event) {
        if (!avatarPlaceActive) return;
        if (canInteractAt && !canInteractAt(event.clientX, event.clientY)) {
            updateAvatarPlaceMarker(null);
            return;
        }
        updateAvatarPlaceMarker(pickAvatarStandHit(event.clientX, event.clientY));
    }

    /**
     * Surface (mur / sol / plafond / objet / plancher) sous le curseur pour y accrocher une lumière.
     * @param {number} clientX
     * @param {number} clientY
     * @returns {{ point: THREE.Vector3, normal: THREE.Vector3 } | null}
     */
    function pickLightSurfaceHit(clientX, clientY) {
        setPointerFromClient(clientX, clientY);
        raycaster.setFromCamera(pointer, camera);
        reconcileEditableObjects();

        /** @type {THREE.Object3D[]} */
        const roots = [...editableObjects];
        const terrain = terrainController?.getTerrain?.();
        if (terrain && !roots.includes(terrain)) roots.push(terrain);

        const hits = raycaster.intersectObjects(roots, true);
        for (const hit of hits) {
            if (!hit?.point || !hit.face) continue;
            if (hit.object?.name === "shadow-overlay") continue;
            if (hit.object?.name?.startsWith?.("light-place-")) continue;
            if (hit.object?.name?.startsWith?.("avatar-place-")) continue;
            if (hit.object?.userData?.labNoPick) continue;
            if (hit.object?.userData?._labNoPaintPick) continue;

            const entity = resolveLabObject(hit);
            if (entity && isLabLight(entity)) continue;

            const normal = hit.face.normal
                .clone()
                .transformDirection(hit.object.matrixWorld)
                .normalize();
            // Face visible côté caméra (intérieur de pièce).
            _lightCamDir.copy(camera.position).sub(hit.point);
            if (_lightCamDir.lengthSq() > 1e-10) {
                _lightCamDir.normalize();
                if (normal.dot(_lightCamDir) < 0) normal.negate();
            }

            const point = hit.point.clone().addScaledVector(normal, LIGHT_SURFACE_OFFSET);
            return { point, normal };
        }

        const floorPos = raycastToFloor(clientX, clientY);
        if (!floorPos) return null;
        const normal = new THREE.Vector3(0, 1, 0);
        return {
            point: floorPos.clone().addScaledVector(normal, LIGHT_SURFACE_OFFSET),
            normal,
        };
    }

    function ensureLightPlaceMarker() {
        if (lightPlaceMarker) return lightPlaceMarker;
        const group = new THREE.Group();
        group.name = "light-place-preview";
        group.userData.labNoPick = true;
        group.userData._labNoPaintPick = true;

        const bulb = new THREE.Mesh(
            new THREE.SphereGeometry(0.1, 12, 12),
            new THREE.MeshBasicMaterial({
                color: 0xffcc66,
                depthTest: false,
                transparent: true,
                opacity: 0.95,
            })
        );
        bulb.name = "light-place-bulb";
        bulb.renderOrder = 999;

        const cone = new THREE.Mesh(
            new THREE.ConeGeometry(0.18, 0.55, 16, 1, true),
            new THREE.MeshBasicMaterial({
                color: 0xffb347,
                depthTest: false,
                transparent: true,
                opacity: 0.45,
                side: THREE.DoubleSide,
            })
        );
        // Cône le long de −Z (même axe que le faisceau spot).
        cone.rotation.x = -Math.PI / 2;
        cone.position.z = -0.35;
        cone.name = "light-place-cone";
        cone.renderOrder = 998;

        const axis = new THREE.Mesh(
            new THREE.CylinderGeometry(0.015, 0.015, 0.7, 8),
            new THREE.MeshBasicMaterial({
                color: 0xffe08a,
                depthTest: false,
                transparent: true,
                opacity: 0.85,
            })
        );
        axis.rotation.x = Math.PI / 2;
        axis.position.z = -0.35;
        axis.name = "light-place-axis";
        axis.renderOrder = 997;

        group.add(bulb, cone, axis);
        group.visible = false;
        scene.add(group);
        lightPlaceMarker = group;
        return group;
    }

    /**
     * @param {{ point: THREE.Vector3, normal: THREE.Vector3 } | null} preview
     */
    function updateLightPlaceMarker(preview) {
        lightPlacePreview = preview;
        const marker = ensureLightPlaceMarker();
        if (!preview) {
            marker.visible = false;
            return;
        }
        marker.visible = true;
        marker.position.copy(preview.point);
        marker.quaternion.setFromUnitVectors(
            new THREE.Vector3(0, 0, -1),
            preview.normal.clone().normalize()
        );
        const cone = marker.getObjectByName("light-place-cone");
        const axis = marker.getObjectByName("light-place-axis");
        const directed =
            lightPlaceType === LIGHT_TYPE.SPOT || lightPlaceType === LIGHT_TYPE.SUN;
        if (cone) cone.visible = directed;
        if (axis) axis.visible = directed;
    }

    function disposeLightPlaceMarker() {
        if (!lightPlaceMarker) return;
        scene.remove(lightPlaceMarker);
        lightPlaceMarker.traverse((child) => {
            if (child instanceof THREE.Mesh) {
                child.geometry?.dispose?.();
                child.material?.dispose?.();
            }
        });
        lightPlaceMarker = null;
        lightPlacePreview = null;
    }

    function syncLightPlaceButtons() {
        const map = [
            [lightBtns?.spot, LIGHT_TYPE.SPOT],
            [lightBtns?.sun, LIGHT_TYPE.SUN],
            [lightBtns?.lamp, LIGHT_TYPE.LAMP],
        ];
        for (const [btn, type] of map) {
            if (!btn) continue;
            const on = lightPlaceType === type;
            btn.classList.toggle("is-active", on);
            btn.setAttribute("aria-pressed", String(on));
        }
    }

    /**
     * @param {"spot"|"directional"|"point"|null} type
     */
    function setLightPlaceActive(type) {
        const next =
            type === LIGHT_TYPE.SPOT || type === LIGHT_TYPE.SUN || type === LIGHT_TYPE.LAMP
                ? type
                : null;
        if (lightPlaceType === next) {
            // Recliquer le même bouton annule.
            if (next) {
                lightPlaceType = null;
            }
        } else {
            lightPlaceType = next;
        }

        if (lightPlaceType) {
            setAvatarPlaceActive(false);
            setVegetationPlaceActive(false);
            csgTool?.cancelPickMode?.();
            enterExplore?.();
            ensureLightPlaceMarker();
            showStatus(
                `${getLightLabel(lightPlaceType)} : cliquez un mur, sol ou plafond — puis R pour orienter (Échap = quitter)`
            );
        } else {
            if (lightPlaceMarker) lightPlaceMarker.visible = false;
            lightPlacePreview = null;
        }
        setLightPlaceModeActive?.(!!lightPlaceType);
        syncLightPlaceButtons();
    }

    function placeLightAtClient(clientX, clientY) {
        if (!lightPlaceType) return false;
        const hit = lightPlacePreview || pickLightSurfaceHit(clientX, clientY);
        if (!hit) {
            showStatus("Visez un mur, un sol, un plafond ou un objet");
            return false;
        }
        const type = lightPlaceType;
        const light = spawnLightAt(type, hit.point, {
            aimDirection: hit.normal,
            select: true,
            highlight: true,
        });
        setLightPlaceActive(null);
        setTransformMode("rotate");
        showStatus(
            `${getLightLabel(type)} placé — orientez avec le gizmo (R) · G = déplacer`
        );
        syncLightAim(light);
        invalidateLabShadows();
        return true;
    }

    function handleLightPlacePointerMove(event) {
        if (!lightPlaceType) return;
        if (canInteractAt && !canInteractAt(event.clientX, event.clientY)) {
            updateLightPlaceMarker(null);
            return;
        }
        updateLightPlaceMarker(pickLightSurfaceHit(event.clientX, event.clientY));
    }

    function setVegetationPlaceActive(active) {
        vegetationPlaceActive = !!active;
        if (vegetationPlaceActive) {
            setAvatarPlaceActive(false);
            setLightPlaceActive(null);
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
        if (
            !isLabStair(object) &&
            !isLabLanding(object) &&
            !isLabTube(object) &&
            !isLabArchitecture(object)
        ) {
            return Promise.resolve();
        }
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

    function syncArchitectureContextMenu(object) {
        if (!isLabArchitecture(object)) return;
        const targetWall = object.userData.archTargetWall || "south";
        const targetFloor = Math.max(0, Number(object.userData.archTargetFloor) | 0);
        contextMenu.syncProperty("arch-layout-ui", {
            archLayout: getArchLayout(object),
            archTargetWall: targetWall,
            archTargetFloor: targetFloor,
        });
        contextMenu.syncProperty("arch-length", getArchLength(object));
        contextMenu.syncProperty("arch-width", getArchWidth(object));
        contextMenu.syncProperty("arch-height", getArchHeight(object));
        contextMenu.syncProperty("arch-wall", getArchWall(object));
        contextMenu.syncProperty("arch-wing-a", getArchWingA(object));
        contextMenu.syncProperty("arch-wing-b", getArchWingB(object));
        contextMenu.syncProperty("arch-floors", getArchFloors(object));
        contextMenu.syncProperty("arch-ceiling", getArchHasCeiling(object));
        contextMenu.syncProperty("arch-plinth-floor", hasArchPlinthOnFloor(object, targetFloor));
        const openings = getArchOpenings(object);
        contextMenu.syncProperty("arch-openings", {
            archOpenings: openings,
            archTargetWall: targetWall,
            archTargetFloor: targetFloor,
            archLength: getArchLength(object),
            archWidth: getArchWidth(object),
            archWall: getArchWall(object),
            archLayout: getArchLayout(object),
            archWingA: getArchWingA(object),
            archWingB: getArchWingB(object),
        });
    }

    /**
     * Restaure l’apparence d’une pièce après rebuild sans « wipe » inutile
     * (évite le flash blanc / disparition des textures Face).
     * @param {THREE.Object3D} object
     * @param {unknown} faceTexKeep
     * @param {unknown} triTexKeep
     * @param {number} gen
     */
    async function restoreArchitectureAppearanceAfterRebuild(object, faceTexKeep, triTexKeep, gen) {
        if (object.userData._labArchRebuildGen !== gen) return;

        applyObjectColor(object, getObjectColor(object));
        applyObjectRoughness(object, getObjectRoughness(object));
        applyObjectMetalness(object, getObjectMetalness(object));
        applyObjectOpacity(object, getObjectOpacity(object));

        const texUrl = getObjectTextureDataUrl(object);
        const normalUrl = getObjectNormalTextureDataUrl(object);
        const specularUrl = getObjectSpecularTextureDataUrl(object);
        // Ne pas appeler applyObjectTexture(null) : ça efface les maps Face.
        /** @type {Promise<void>[]} */
        const objectMaps = [];
        if (texUrl) objectMaps.push(applyObjectTexture(object, texUrl));
        if (normalUrl) objectMaps.push(applyObjectNormalTexture(object, normalUrl));
        if (specularUrl) objectMaps.push(applyObjectSpecularTexture(object, specularUrl));
        if (objectMaps.length) await Promise.all(objectMaps);
        if (object.userData._labArchRebuildGen !== gen) return;

        if (texUrl || normalUrl || specularUrl) {
            applyObjectTextureTile(object, getObjectTextureTile(object));
        }

        if (faceTexKeep) {
            await applyArchSurfaceTexturesData(object, faceTexKeep);
        }
        if (object.userData._labArchRebuildGen !== gen) return;

        if (triTexKeep) {
            await applyTriangleTexturesData(object, triTexKeep);
        }
        if (object.userData._labArchRebuildGen !== gen) return;

        updateObjectVisual(object);
    }

    /**
     * @param {THREE.Object3D} object
     * @param {{
     *   length?: number,
     *   width?: number,
     *   height?: number,
     *   wall?: number,
     *   ceiling?: boolean,
     *   plinth?: boolean,
     *   plinthFloors?: number[],
     *   openings?: import("./lab-architecture.js").ArchOpening[],
     * }} patch
     * @param {{ recordHistory?: boolean, quietUi?: boolean, forceRebuild?: boolean, selectOpeningId?: string }} [opts]
     */
    function applyArchitectureParams(object, patch, opts = {}) {
        if (!isLabArchitecture(object)) return;
        const recordHistory = opts.recordHistory !== false;
        const quietUi = opts.quietUi === true;
        const forceRebuild = opts.forceRebuild === true;
        const keepFillId =
            typeof opts.selectOpeningId === "string"
                ? opts.selectOpeningId
                : isLabArchOpeningFill(selectedObject) && getArchHostFromFill(selectedObject) === object
                  ? String(selectedObject.userData.archOpeningId || "")
                  : "";
        const nextLength = clampArchLength(patch.length ?? getArchLength(object));
        const nextWidth = clampArchWidth(patch.width ?? getArchWidth(object));
        const nextHeight = clampArchHeight(patch.height ?? getArchHeight(object));
        const nextWall = clampArchWall(patch.wall ?? getArchWall(object));
        const nextCeiling = patch.ceiling !== undefined ? !!patch.ceiling : getArchHasCeiling(object);
        const nextFloors = clampArchFloors(patch.floors ?? getArchFloors(object));
        /** @type {number[]} */
        let nextPlinthFloors;
        if (Array.isArray(patch.plinthFloors)) {
            nextPlinthFloors = normalizeArchPlinthFloors(patch.plinthFloors, nextFloors);
        } else if (patch.plinth !== undefined) {
            nextPlinthFloors = patch.plinth ? [0] : [];
        } else {
            nextPlinthFloors = normalizeArchPlinthFloors(getArchPlinthFloors(object), nextFloors);
        }
        const nextWingA = clampArchWingA(patch.wingA ?? getArchWingA(object), nextWidth);
        const nextWingB = clampArchWingB(patch.wingB ?? getArchWingB(object), nextLength);
        const nextOpenings = Array.isArray(patch.openings) ? patch.openings : getArchOpenings(object);

        const unchanged =
            getArchLength(object) === nextLength &&
            getArchWidth(object) === nextWidth &&
            getArchHeight(object) === nextHeight &&
            getArchWall(object) === nextWall &&
            getArchHasCeiling(object) === nextCeiling &&
            JSON.stringify(getArchPlinthFloors(object)) === JSON.stringify(nextPlinthFloors) &&
            getArchWingA(object) === nextWingA &&
            getArchWingB(object) === nextWingB &&
            getArchFloors(object) === nextFloors &&
            archOpeningsSignature(getArchOpenings(object)) === archOpeningsSignature(nextOpenings);
        if (unchanged && !forceRebuild) {
            if (!quietUi) syncArchitectureContextMenu(object);
            return;
        }

        const before = captureFullSnapshot(object);
        // Rebuild détruit les meshes : sérialiser textures Face avant.
        const faceTexKeep =
            serializeArchSurfaceTextures(object) ||
            object.userData._labArchFaceTexturesPersist ||
            null;
        if (faceTexKeep) object.userData._labArchFaceTexturesPersist = faceTexKeep;

        // Les overlays triangles stockent des positions locales absolues.
        // Dès que la découpe des murs change (porte / dimensions), les
        // réappliquer détache les bandes (jambages flottants). On ne les
        // restaure que si la topologie des murs est inchangée (plafond / plinthe).
        const wallTopoChanged =
            getArchLength(object) !== nextLength ||
            getArchWidth(object) !== nextWidth ||
            getArchHeight(object) !== nextHeight ||
            getArchWall(object) !== nextWall ||
            getArchWingA(object) !== nextWingA ||
            getArchWingB(object) !== nextWingB ||
            getArchFloors(object) !== nextFloors ||
            archOpeningsSignature(getArchOpenings(object)) !== archOpeningsSignature(nextOpenings);
        /** @type {unknown} */
        let triTexKeep = null;
        if (wallTopoChanged) {
            delete object.userData._labArchTriangleTexturesPersist;
        } else {
            triTexKeep =
                serializeTriangleTextures(object) ||
                object.userData._labArchTriangleTexturesPersist ||
                null;
            if (triTexKeep) object.userData._labArchTriangleTexturesPersist = triTexKeep;
        }

        const gen = (Number(object.userData._labArchRebuildGen) || 0) + 1;
        object.userData._labArchRebuildGen = gen;

        rebuildArchitectureGroup(object, {
            length: nextLength,
            width: nextWidth,
            height: nextHeight,
            wall: nextWall,
            ceiling: nextCeiling,
            plinthFloors: nextPlinthFloors,
            wingA: nextWingA,
            wingB: nextWingB,
            floors: nextFloors,
            openings: nextOpenings,
        });
        // Ne pas garder d’anciennes refs WebGL orphelines (persist JSON reste).
        delete object.userData._labArchSurfaceTextures;
        // Sécurité : aucun overlay triangle orphelin après rebuild.
        clearTriangleTextureOverlays(object);
        refreshObjectShadows(object);
        invalidateLabShadows();
        object.updateMatrixWorld(true);

        void restoreArchitectureAppearanceAfterRebuild(object, faceTexKeep, triTexKeep, gen)
            .then(() => {
                if (object.userData._labArchRebuildGen !== gen) return;
                if (recordHistory) {
                    const after = captureFullSnapshot(object);
                    history.push({ type: "architecture-params", object, before, after });
                }
            })
            .catch((err) => {
                console.warn("[lab] restauration textures après rebuild pièce :", err);
                if (recordHistory && object.userData._labArchRebuildGen === gen) {
                    const after = captureFullSnapshot(object);
                    history.push({ type: "architecture-params", object, before, after });
                }
            });
        if (keepFillId) {
            const fill = findArchOpeningFill(object, keepFillId);
            if (fill) selectObject(fill, { highlight: true });
            else if (!quietUi) selectObject(object);
        } else if (!quietUi) {
            selectObject(object);
        }

        if (!quietUi) syncArchitectureContextMenu(object);
        refreshSceneRegistry();
        if (!quietUi) {
            showStatus(
                `Pièce — ${nextLength.toFixed(1).replace(".", ",")} × ${nextWidth.toFixed(1).replace(".", ",")} × ${nextHeight.toFixed(1).replace(".", ",")} m`
            );
        }
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
            if (isLabArchOpeningFill(object)) {
                removeArchOpeningFillKeepHole(object);
                continue;
            }
            deleteObject(object);
        }
    }

    /**
     * Duplique userData sans partager la référence (three clone() partage userData).
     * @param {Record<string, unknown>} data
     */
    function clonePlainUserData(data) {
        if (!data || typeof data !== "object") return {};
        // Ne jamais cloner le store de peinture / textures Face Arch (canvas / WebGL).
        const {
            facePaint: _fp,
            _labArchSurfaceTextures: _ast,
            _labFacePbrStore: _fps,
            ...rest
        } = data;
        try {
            return structuredClone(rest);
        } catch {
            const out = { ...rest };
            if (rest._glassRestore && typeof rest._glassRestore === "object") {
                out._glassRestore = { .../** @type {object} */ (rest._glassRestore) };
            }
            return out;
        }
    }

    /**
     * Retire les hooks shader peinture d’un matériau cloné (à reconstruire via applyFacePaintData).
     * @param {THREE.Material | null | undefined} material
     */
    function stripPaintMaterialHooks(material) {
        if (!material?.userData) return;
        delete material.userData._labFacePaint;
        delete material.userData._labFacePaint_placeholderMap;
        delete material.userData._labPaintUniform;
        delete material.userData._labPaintShaderAttached;
        delete material.userData._labPaintBaseCompile;
        delete material.onBeforeCompile;
        delete material.customProgramCacheKey;
    }

    /**
     * Clone rigoureux : même géométrie, matériaux, position/quaternion/échelle.
     * @param {THREE.Object3D} source
     */
    function cloneEditableExact(source) {
        source.updateMatrixWorld(true);
        const paintData = serializeFacePaint(source);
        const facePbrData = serializeFacePbrStore(source);
        const archFaceTextures = serializeArchSurfaceTextures(source);
        const triangleTextures = serializeTriangleTextures(source);
        const clone = source.clone(true);

        clone.traverse((node) => {
            node.userData = clonePlainUserData(node.userData);
            delete node.userData.shadowOverlay;
            delete node.userData.facePaint;
            delete node.userData._labArchSurfaceTextures;
            delete node.userData._labFacePbrStore;
            // Jamais deux objets avec le même labId : la copie reçoit le sien
            // à la demande (sinon l’historique confondrait original et copie).
            delete node.userData.labId;

            if (!(node instanceof THREE.Mesh || node instanceof THREE.Line || node instanceof THREE.Points)) {
                return;
            }
            if (node.name === "shadow-overlay") return;
            if (node.geometry) node.geometry = node.geometry.clone();
            if (node.material) {
                node.material = Array.isArray(node.material)
                    ? node.material.map((m) => {
                          if (!m) return m;
                          const cloned = m.clone();
                          stripPaintMaterialHooks(cloned);
                          return cloned;
                      })
                    : (() => {
                          const cloned = node.material.clone();
                          stripPaintMaterialHooks(cloned);
                          return cloned;
                      })();
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
        delete clone.userData.facePaint;
        delete clone.userData._labArchSurfaceTextures;
        delete clone.userData._labFacePbrStore;
        // Overlays clonés partagent des textures WebGL cassées → on les recrée.
        clearTriangleTextureOverlays(clone);

        clone.position.copy(source.position);
        clone.quaternion.copy(source.quaternion);
        clone.scale.copy(source.scale);
        clone.rotation.setFromQuaternion(source.quaternion, source.rotation.order);

        if (paintData) {
            clone.userData._labPendingFacePaint = paintData;
        } else if (source.userData?._labPendingFacePaint) {
            // Re-clone depuis le presse-papiers : conserver la peinture sérialisée.
            clone.userData._labPendingFacePaint = source.userData._labPendingFacePaint;
        }
        if (facePbrData) {
            clone.userData._labPendingFacePbr = facePbrData;
        } else if (source.userData?._labPendingFacePbr) {
            clone.userData._labPendingFacePbr = source.userData._labPendingFacePbr;
        }
        if (archFaceTextures) {
            clone.userData._labPendingArchFaceTextures = archFaceTextures;
        } else if (source.userData?._labPendingArchFaceTextures) {
            clone.userData._labPendingArchFaceTextures = source.userData._labPendingArchFaceTextures;
        }
        if (triangleTextures) {
            clone.userData._labPendingTriangleTextures = triangleTextures;
        } else if (source.userData?._labPendingTriangleTextures) {
            clone.userData._labPendingTriangleTextures = source.userData._labPendingTriangleTextures;
        }
        return clone;
    }

    /**
     * Applique la peinture en attente après un clone / collage.
     * @param {THREE.Object3D} object
     * @returns {Promise<void>}
     */
    function flushPendingFacePaint(object) {
        const pending = object?.userData?._labPendingFacePaint;
        const pendingFacePbr = object?.userData?._labPendingFacePbr;
        const pendingArch = object?.userData?._labPendingArchFaceTextures;
        const pendingTri = object?.userData?._labPendingTriangleTextures;
        if (!pending && !pendingFacePbr && !pendingArch && !pendingTri) return Promise.resolve();
        delete object.userData._labPendingFacePaint;
        delete object.userData._labPendingFacePbr;
        delete object.userData._labPendingArchFaceTextures;
        delete object.userData._labPendingTriangleTextures;
        /** @type {Promise<void>[]} */
        const jobs = [];
        if (pending) {
            jobs.push(
                applyFacePaintData(object, pending).catch((err) => {
                    console.warn("[lab] collage peinture face échoué", err);
                })
            );
        }
        if (pendingArch) {
            jobs.push(
                applyArchSurfaceTexturesData(object, pendingArch).catch((err) => {
                    console.warn("[lab] collage textures mur Architecture échoué", err);
                })
            );
        }
        if (pendingTri) {
            jobs.push(
                applyTriangleTexturesData(object, pendingTri).catch((err) => {
                    console.warn("[lab] collage textures triangles échoué", err);
                })
            );
        }
        return Promise.all(jobs)
            .then(() => {
                if (!pendingFacePbr) return undefined;
                return applyFacePbrStoreData(object, pendingFacePbr).catch((err) => {
                    console.warn("[lab] collage PBR faces échoué", err);
                });
            })
            .then(() => undefined);
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
        const paintJobs = [];
        for (const template of clipboard) {
            const clone = cloneEditableExact(template);
            registerClonedEditable(clone, template);
            pasted.push(addObjectToScene(clone, { recordHistory: true, select: false }));
            paintJobs.push(flushPendingFacePaint(clone));
        }
        if (pasted.length) {
            selectedObjects = pasted.filter(Boolean);
            selectedObject = selectedObjects[selectedObjects.length - 1] || null;
            selectionHighlight = selectedObjects.some((obj) => !obj.userData[COLLISION_KEY]);
            syncSelectionOutlines();
            for (const obj of selectedObjects) updateObjectVisual(obj);
            syncGizmo();
            refreshObjectDisplay(selectedObject);
            notifyOrbitTarget({ frame: false });
            Promise.all(paintJobs).then(() => {
                for (const obj of selectedObjects) updateObjectVisual(obj);
            });
        }
        showStatus(pasted.length > 1 ? `${pasted.length} objets collés` : "Objet collé");
    }

    /** Empêche le recentrage caméra pendant Ctrl+Z / Ctrl+Y. */
    let suppressCameraFrame = false;

    function performUndo() {
        const entry = history.undo();
        if (!entry) {
            showStatus("Rien à annuler");
            return;
        }
        suppressCameraFrame = true;
        try {
            applyHistoryEntry(entry, "undo");
            showStatus("Annulé");
        } catch (err) {
            // Une entrée corrompue (objet disposé…) ne doit pas casser l’éditeur.
            console.error("[LAB] undo :", err);
            showStatus("Impossible d’annuler cette action");
        } finally {
            suppressCameraFrame = false;
        }
    }

    function performRedo() {
        const entry = history.redo();
        if (!entry) {
            showStatus("Rien à rétablir");
            return;
        }
        suppressCameraFrame = true;
        try {
            applyHistoryEntry(entry, "redo");
            showStatus("Rétabli");
        } catch (err) {
            console.error("[LAB] redo :", err);
            showStatus("Impossible de rétablir cette action");
        } finally {
            suppressCameraFrame = false;
        }
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
        // Réconcilier les références avant tout : un objet supprimé puis recréé
        // par undo n’est plus la même instance — on le retrouve par labId.
        resolveHistoryEntryObjects(entry);
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
                    refreshSceneRegistry();
                    invalidateLabShadows();
                } else if (entry.object) {
                    removeFromScene(entry.object);
                    entry.object = null;
                    refreshSceneRegistry();
                    invalidateLabShadows();
                }
                break;
            }
            case "reshape": {
                // Métamorphose (objet → barque, changement de coque…) : on
                // remplace l’objet entier depuis le snapshot — un simple
                // applyObjectState laisserait flags / mesh à moitié restaurés.
                const snapshot = direction === "undo" ? entry.before : entry.after;
                if (!snapshot) break;
                if (entry.object) {
                    removeFromScene(entry.object);
                }
                entry.object = createObjectFromSnapshot(snapshot);
                scene.add(entry.object);
                selectObject(entry.object, { highlight: false });
                refreshSceneRegistry();
                invalidateLabShadows();
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
                if (isLabArchOpeningFill(entry.object)) {
                    commitArchOpeningFillTransform(entry.object);
                }
                selectObject(entry.object, { highlight: false });
                refreshObjectDisplay(entry.object);
                break;
            }
            case "face-color": {
                const color = direction === "undo" ? entry.before : entry.after;
                applySelectedFaceColor(entry.object, color);
                selectObject(entry.object, { highlight: false });
                contextMenu.syncProperty("color", color);
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
            case "specular-texture": {
                const dataUrl = direction === "undo" ? entry.before : entry.after;
                applyObjectSpecularTexture(entry.object, dataUrl).then(() => {
                    updateObjectVisual(entry.object);
                    selectObject(entry.object, { highlight: false });
                });
                break;
            }
            case "roughness-texture": {
                const dataUrl = direction === "undo" ? entry.before : entry.after;
                applyObjectRoughnessTexture(entry.object, dataUrl).then(() => {
                    updateObjectVisual(entry.object);
                    selectObject(entry.object, { highlight: false });
                });
                break;
            }
            case "texture-uv-transform": {
                const state = direction === "undo" ? entry.before : entry.after;
                if (!state) break;
                if (state.kind === "object" && state.object) {
                    applyObjectTextureTransform(state.object, {
                        tileX: state.tileX,
                        tileY: state.tileY,
                        tileZ: state.tileZ,
                        offsetX: state.offsetX,
                        offsetY: state.offsetY,
                        offsetZ: state.offsetZ,
                    });
                    setLastUvObjectTarget(state.object);
                    selectObject(state.object, { highlight: false, frameCamera: false });
                    contextMenu.syncProperty("texture-tile", state.tileX);
                } else if (state.kind === "triangles" && state.overlays?.length) {
                    faceDrawController?.applyUvToOverlays?.(state.overlays, {
                        tileX: state.tileX,
                        tileY: state.tileY,
                        tileZ: state.tileZ,
                        offsetX: state.offsetX,
                        offsetY: state.offsetY,
                        offsetZ: state.offsetZ,
                    });
                    setLastUvTriangleTarget(state.overlays);
                } else if (state.kind === "face") {
                    lastUvEditTarget = { kind: "face" };
                    faceDrawController?.applyLiveFaceUvTransform?.({
                        tileX: state.tileX,
                        tileY: state.tileY,
                        tileZ: state.tileZ,
                        offsetX: state.offsetX,
                        offsetY: state.offsetY,
                        offsetZ: state.offsetZ,
                    });
                }
                break;
            }
            case "triangle-texture": {
                if (direction === "undo") {
                    for (const overlay of entry.overlays || []) {
                        if (overlay?.parent) overlay.parent.remove(overlay);
                    }
                    faceDrawController?.forgetOverlays?.(entry.overlays || []);
                    if (lastUvEditTarget?.kind === "triangles") {
                        const left = (lastUvEditTarget.overlays || []).filter(
                            (o) => entry.overlays && !entry.overlays.includes(o) && o.parent
                        );
                        lastUvEditTarget = left.length ? { kind: "triangles", overlays: left } : null;
                    }
                } else {
                    for (const item of entry.restore || []) {
                        if (item.parent && item.overlay && !item.overlay.parent) {
                            item.parent.add(item.overlay);
                        }
                    }
                    const overlays = (entry.overlays || []).filter((o) => o?.parent);
                    if (overlays.length) {
                        faceDrawController?.restoreOverlays?.(overlays);
                        setLastUvTriangleTarget(overlays);
                    }
                }
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
                restoreFaceSnapshot(entry.object, entry.faceIndex, dataUrl, entry.mesh || null)
                    .then(() => {
                        selectObject(entry.object, { highlight: false });
                    })
                    .catch((err) => console.warn("[LAB] undo peinture face :", err));
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
            case "architecture-params": {
                const snapshot = direction === "undo" ? entry.before : entry.after;
                if (!entry.object || !snapshot) break;
                // Coupe toute restauration Face async encore en vol.
                entry.object.userData._labArchRebuildGen =
                    (Number(entry.object.userData._labArchRebuildGen) || 0) + 1;
                delete entry.object.userData._labArchSurfaceTextures;
                rebuildArchitectureGroup(entry.object, {
                    layout: snapshot.archLayout,
                    length: snapshot.archLength,
                    width: snapshot.archWidth,
                    height: snapshot.archHeight,
                    wall: snapshot.archWall,
                    ceiling: snapshot.archCeiling,
                    plinthFloors: Array.isArray(snapshot.archPlinthFloors)
                        ? snapshot.archPlinthFloors
                        : snapshot.archPlinth
                          ? [0]
                          : [],
                    wingA: snapshot.archWingA,
                    wingB: snapshot.archWingB,
                    floors: snapshot.archFloors,
                    openings: snapshot.archOpenings,
                });
                applyObjectState(entry.object, snapshot);
                refreshObjectShadows(entry.object);
                invalidateLabShadows();
                updateObjectVisual(entry.object);
                selectObject(entry.object, { highlight: false });
                syncArchitectureContextMenu(entry.object);
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

    // Ctrl+Z / Ctrl+Y : arbitrage chronologique entre l’historique de scène et
    // les coups de pinceau terrain — on annule toujours l’action la plus récente.
    document.addEventListener("keydown", (event) => {
        const mod = event.ctrlKey || event.metaKey;
        const key = event.key.toLowerCase();
        // Touche physique KeyZ : sur AZERTY la touche Z produit « w », d’où event.code.
        const isUndoKey = event.code === "KeyZ" || key === "z";
        const isRedoKey =
            event.code === "KeyY" ||
            key === "y" ||
            (event.shiftKey && (event.code === "KeyZ" || key === "z"));
        // En mode triangulation, Ctrl+Z reste dédié à la sélection de triangles.
        const triangulationActive = document.documentElement.classList.contains(
            "lab-triangulation-mode"
        );

        if (mod && !event.shiftKey && isUndoKey) {
            event.preventDefault();
            event.stopPropagation();
            // Triangulation : Ctrl+Z annule d’abord la sélection △ (pas l’historique scène).
            if (triangulationActive && faceDrawController?.undoTriangleSelection?.()) {
                return;
            }
            const sceneAt = history.canUndo() ? history.peekUndoAt() : 0;
            const terrainAt =
                !triangulationActive && (terrainController?.getUndoDepth?.() ?? 0) > 0
                    ? terrainController?.getLastUndoAt?.() ?? 0
                    : 0;
            if (terrainAt > sceneAt && terrainController?.tryUndoShortcut?.()) {
                showStatus("Terrain : coup de pinceau annulé");
                return;
            }
            if (history.canUndo()) {
                performUndo();
                return;
            }
            if (faceDrawController?.undoTriangleSelection?.()) {
                return;
            }
            if (terrainAt > 0 && terrainController?.tryUndoShortcut?.()) {
                showStatus("Terrain : coup de pinceau annulé");
                return;
            }
            performUndo();
            return;
        }
        if (mod && isRedoKey) {
            event.preventDefault();
            event.stopPropagation();
            // Le redo rejoue en ordre inverse de l’undo : entre les deux piles,
            // on rétablit celle dont la tête est la plus ancienne.
            const sceneAt = history.canRedo() ? history.peekRedoAt() : Infinity;
            const terrainAt =
                !triangulationActive && (terrainController?.getRedoDepth?.() ?? 0) > 0
                    ? terrainController?.getLastRedoAt?.() ?? 0
                    : Infinity;
            if (terrainAt < sceneAt && terrainController?.tryRedoShortcut?.()) {
                showStatus("Terrain : coup de pinceau rétabli");
                return;
            }
            if (history.canRedo()) {
                performRedo();
                return;
            }
            if (Number.isFinite(terrainAt) && terrainController?.tryRedoShortcut?.()) {
                showStatus("Terrain : coup de pinceau rétabli");
                return;
            }
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
            case "F2":
                event.preventDefault();
                if (selectedObject) void promptRenameSceneObject(selectedObject);
                break;
            case "Delete":
            case "Backspace":
                event.preventDefault();
                if (
                    faceDrawController?.hasTriangleSelection?.() ||
                    (textureApplyMode === "face" && faceDrawController?.hasLiveFaceTarget?.())
                ) {
                    void deleteTriangleSelection();
                    break;
                }
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
                if (lightPlaceType) {
                    setLightPlaceActive(null);
                    showStatus("Placement lumière annulé");
                    break;
                }
                if (avatarPlaceActive) {
                    setAvatarPlaceActive(false);
                    showStatus("Placement avatar annulé");
                    break;
                }
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
                if (
                    (triangulationMode || textureApplyMode === "triangles") &&
                    faceDrawController?.hasTriangleSelection?.()
                ) {
                    event.preventDefault();
                    event.stopPropagation();
                    faceDrawController.clearTriangleSelection?.(true);
                    showStatus("Sélection de triangles vidée");
                    break;
                }
                if (textureApplyMode === "face" && faceDrawController?.hasLiveFaceTarget?.()) {
                    event.preventDefault();
                    event.stopPropagation();
                    faceDrawController.clearFaceSelectionHighlight?.(true);
                    showStatus("Face désélectionnée");
                    break;
                }
                if (faceDrawController?.isActive?.()) {
                    event.preventDefault();
                    event.stopPropagation();
                    faceDrawController.setActive(false);
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
            // Helpers de lumière / outlines : jamais promouvoir en objet éditable.
            if (child.userData?.lightHelper || child.name === "shadow-overlay") continue;
            if (typeof child.type === "string" && child.type.includes("Helper")) continue;
            if (isLabLight(child)) {
                if (!editableObjects.includes(child)) {
                    registerLabLight(child);
                }
                syncLightAim(child);
                continue;
            }
            // Ne promouvoir que les racines déjà marquées lab (évite de capturer des groupes UI).
            if (child.userData[LAB_OBJECT_KEY] !== true) continue;
            if (!editableObjects.includes(child)) {
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
        return pickLabObjectHitAt(clientX, clientY)?.entity || null;
    }

    /**
     * Pick précis : entité lab + mesh touché (pour orientation Architecture).
     * @returns {{ entity: THREE.Object3D, mesh: THREE.Object3D, hit: THREE.Intersection } | null}
     */
    function pickLabObjectHitAt(clientX, clientY) {
        setPointerFromClient(clientX, clientY);
        raycaster.setFromCamera(pointer, camera);
        reconcileEditableObjects();
        const objectHits = raycaster.intersectObjects(editableObjects, true);
        for (const hit of objectHits) {
            if (hit.object?.name === "shadow-overlay") continue;
            if (hit.object?.userData?._labNoPaintPick) continue;
            const entity = resolveLabObject(hit);
            if (!entity) continue;
            return { entity, mesh: hit.object, hit };
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
        if (!nearestLight) return null;
        return { entity: nearestLight, mesh: nearestLight, hit: null };
    }

    /**
     * Surface logique (mur / sol / plafond) depuis un mesh de pièce.
     * @param {THREE.Object3D | null | undefined} mesh
     * @returns {string | null}
     */
    function archSurfaceFromClickedMesh(mesh) {
        const raw = getArchSurfaceId(mesh);
        if (!raw) return null;
        if (raw.startsWith("plinth-")) {
            return normalizeArchSurface(raw.slice("plinth-".length));
        }
        return normalizeArchSurface(raw);
    }

    /**
     * Indique la pièce + orientation cliquée, et fixe la cible d’ouverture (mur + étage + offset).
     * @param {THREE.Object3D} object
     * @param {THREE.Object3D | null | undefined} mesh
     * @param {THREE.Intersection | null | undefined} [hit]
     */
    function indicateArchitectureFace(object, mesh, hit = null) {
        if (!isLabArchitecture(object)) return;
        const surface = archSurfaceFromClickedMesh(mesh);
        if (!surface) return;
        object.userData.archTargetWall = surface;

        let story = getArchStoryFromMesh(mesh);
        let local = null;
        if (hit?.point) {
            local = object.worldToLocal(hit.point.clone());
            if (story == null) story = estimateArchStoryFromLocalY(object, local.y);
            if (!isArchSlabSurface(surface)) {
                object.userData.archTargetOffset = getArchWallOffsetFromLocalPoint(
                    object,
                    surface,
                    local
                );
                delete object.userData.archTargetOffsetZ;
                object.userData.archTargetHitY = local.y;
            } else {
                object.userData.archTargetOffset = local.x;
                object.userData.archTargetOffsetZ = local.z;
                delete object.userData.archTargetHitY;
            }
        } else {
            delete object.userData.archTargetOffset;
            delete object.userData.archTargetOffsetZ;
            delete object.userData.archTargetHitY;
        }
        if (story == null) story = 0;
        const maxStory = Math.max(0, getArchFloors(object) - 1);
        story = Math.max(0, Math.min(maxStory, story | 0));
        object.userData.archTargetFloor = story;

        contextMenu.syncProperty("arch-layout-ui", {
            archLayout: getArchLayout(object),
            archTargetWall: surface,
            archTargetFloor: story,
        });
        contextMenu.syncProperty("arch-target-wall", surface);
        contextMenu.syncProperty("arch-target-floor", story);
        contextMenu.syncProperty("arch-plinth-floor", hasArchPlinthOnFloor(object, story));
        contextMenu.syncProperty("arch-openings", {
            archOpenings: getArchOpenings(object),
            archTargetWall: surface,
            archTargetFloor: story,
            archLength: getArchLength(object),
            archWidth: getArchWidth(object),
            archWall: getArchWall(object),
            archLayout: getArchLayout(object),
            archWingA: getArchWingA(object),
            archWingB: getArchWingB(object),
        });
        const piece = object.userData.sceneItemLabel || "Pièce";
        const orient = ARCH_WALL_LABELS[surface] || surface;
        showStatus(
            `${piece} — ${orient} — étage ${story + 1}`
        );
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

    if (spawnBoatBtn) {
        spawnBoatBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            if (suppressBoatClick) return;
            spawnBoatAt();
        });

        spawnBoatBtn.setAttribute("draggable", "true");
        spawnBoatBtn.addEventListener("dragstart", (e) => {
            e.dataTransfer.setData(DRAG_MIME_BOAT, "1");
            e.dataTransfer.effectAllowed = "copy";
            suppressBoatClick = true;
            spawnBoatBtn.classList.add("lab-side-panel__tool--dragging");
        });
        spawnBoatBtn.addEventListener("dragend", () => {
            spawnBoatBtn.classList.remove("lab-side-panel__tool--dragging");
            viewport.classList.remove("lab-viewport--drop");
            window.setTimeout(() => {
                suppressBoatClick = false;
            }, 0);
        });
    }

    for (const spawnArchitectureBtn of spawnArchitectureBtns || []) {
        if (!spawnArchitectureBtn) continue;
        const layoutAttr = spawnArchitectureBtn.getAttribute("data-arch-layout") || "rect";
        spawnArchitectureBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            if (suppressArchitectureClick) return;
            spawnArchitectureAt(undefined, { layout: layoutAttr });
        });

        spawnArchitectureBtn.setAttribute("draggable", "true");
        spawnArchitectureBtn.addEventListener("dragstart", (e) => {
            e.dataTransfer.setData(DRAG_MIME_ARCHITECTURE, layoutAttr);
            e.dataTransfer.effectAllowed = "copy";
            suppressArchitectureClick = true;
            spawnArchitectureBtn.classList.add("lab-side-panel__tool--dragging");
        });
        spawnArchitectureBtn.addEventListener("dragend", () => {
            spawnArchitectureBtn.classList.remove("lab-side-panel__tool--dragging");
            viewport.classList.remove("lab-viewport--drop");
            window.setTimeout(() => {
                suppressArchitectureClick = false;
            }, 0);
        });
    }

    const canvas = renderer.domElement;

    canvas.addEventListener("dragover", (e) => {
        const types = e.dataTransfer.types;
        const isPrimitive = ALL_PRIMITIVE_DRAG_MIMES.some((m) => types.includes(m));
        const isTexlib =
            [...types].includes("application/x-lab-texlib") ||
            [...types].includes("text/plain");
        if (
            !isPrimitive &&
            !types.includes(DRAG_MIME_STAIR) &&
            !types.includes(DRAG_MIME_TUBE) &&
            !types.includes(DRAG_MIME_BOAT) &&
            !types.includes(DRAG_MIME_ARCHITECTURE) &&
            !isTexlib
        ) {
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
        const texRaw =
            e.dataTransfer.getData("application/x-lab-texlib") ||
            e.dataTransfer.getData("text/plain") ||
            "";
        if (texRaw && texRaw.includes('"id"')) {
            // Laissé au handler bibliothèque textures (lab-texture-library).
            return;
        }
        const isStair = types.includes(DRAG_MIME_STAIR);
        const isTube = types.includes(DRAG_MIME_TUBE);
        const isBoat = types.includes(DRAG_MIME_BOAT);
        const isArchitecture = types.includes(DRAG_MIME_ARCHITECTURE);
        /** @type {import("./lab-primitives.js").LabPrimitiveShape | null} */
        let dropShape = null;
        for (const [shape, meta] of Object.entries(PRIMITIVE_META)) {
            if (types.includes(meta.mime)) {
                dropShape = /** @type {import("./lab-primitives.js").LabPrimitiveShape} */ (shape);
                break;
            }
        }
        if (!isStair && !isTube && !isBoat && !isArchitecture && !dropShape) return;
        e.preventDefault();
        viewport.classList.remove("lab-viewport--drop");
        const pos = raycastToFloor(e.clientX, e.clientY);
        if (!pos) return;
        if (isStair) {
            spawnStairAt(pos, STAIR_DEFAULT_STEP_COUNT);
        } else if (isTube) {
            spawnTubeAt(pos);
        } else if (isBoat) {
            spawnBoatAt(pos);
        } else if (isArchitecture) {
            const layoutRaw = e.dataTransfer.getData(DRAG_MIME_ARCHITECTURE) || "rect";
            spawnArchitectureAt(pos, { layout: layoutRaw });
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
            // Peinture libre : tout mesh UV (cube, CSG, panneaux, etc.) — plus seulement BoxGeometry.
            if (!hit.object.geometry) continue;
            return { entity, mesh: hit.object, hit };
        }
        return null;
    }

    function resolveLabObject(hit) {
        let current = hit.object;
        while (current) {
            const fill = findArchOpeningFillAncestor(current);
            if (fill) return fill;
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
                shadowOpacity: getLightShadowOpacity(labObject),
                spotAngle: getLightSpotAngleDeg(labObject),
                spotPenumbra: getLightSpotPenumbra(labObject),
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
                specularTexture: getObjectSpecularTextureDataUrl(labObject),
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
                specularTexture: getObjectSpecularTextureDataUrl(labObject),
                textureTile: getObjectTextureTile(labObject),
                normalScale: getObjectNormalScale(labObject),
                roughness: getObjectRoughness(labObject),
                metalness: getObjectMetalness(labObject),
                opacity: getObjectOpacity(labObject),
                glass: isObjectGlassEnabled(labObject),
                smooth: getObjectSmooth(labObject),
            };
        }
        if (isLabBoat(labObject)) {
            return {
                kind: "boat",
                collision: !!labObject.userData[COLLISION_KEY],
                boatFloat: isBoatFloating(labObject),
                boatDensity: getBoatDensity(labObject),
                boatShell: getBoatShell(labObject),
                color: getObjectColor(labObject),
                texture: getObjectTextureDataUrl(labObject),
                normalTexture: getObjectNormalTextureDataUrl(labObject),
                specularTexture: getObjectSpecularTextureDataUrl(labObject),
                textureTile: getObjectTextureTile(labObject),
                normalScale: getObjectNormalScale(labObject),
                roughness: getObjectRoughness(labObject),
                metalness: getObjectMetalness(labObject),
                opacity: getObjectOpacity(labObject),
                glass: isObjectGlassEnabled(labObject),
                smooth: getObjectSmooth(labObject),
                canPhysics: objectSupportsPhysics(labObject),
                physics: isObjectPhysicsEnabled(labObject),
                physicsMass: getObjectPhysicsMass(labObject),
                physicsBounce: getObjectPhysicsBounce(labObject),
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
                specularTexture: getObjectSpecularTextureDataUrl(labObject),
                textureTile: getObjectTextureTile(labObject),
                normalScale: getObjectNormalScale(labObject),
                roughness: getObjectRoughness(labObject),
                metalness: getObjectMetalness(labObject),
                opacity: getObjectOpacity(labObject),
                glass: isObjectGlassEnabled(labObject),
                smooth: getObjectSmooth(labObject),
            };
        }
        if (isLabArchOpeningFill(labObject)) {
            const kind = labObject.userData.archOpeningKind === "window" ? "window" : "door";
            return {
                kind: "arch-opening",
                archOpeningKind: kind,
                collision: false,
                color: getObjectColor(labObject) || "#6e4a2e",
                texture: getObjectTextureDataUrl(labObject),
                normalTexture: getObjectNormalTextureDataUrl(labObject),
                specularTexture: getObjectSpecularTextureDataUrl(labObject),
                textureTile: getObjectTextureTile(labObject),
                normalScale: getObjectNormalScale(labObject),
                roughness: getObjectRoughness(labObject),
                metalness: getObjectMetalness(labObject),
                opacity: getObjectOpacity(labObject),
                glass: isObjectGlassEnabled(labObject),
                smooth: getObjectSmooth(labObject),
                canPhysics: false,
            };
        }
        if (isLabArchitecture(labObject)) {
            const mat = getScopedMaterialState(labObject);
            return {
                kind: "architecture",
                hasLiveFace: textureApplyMode === "face" && !!faceDrawController?.hasLiveFaceTarget?.(),
                collision: !!labObject.userData[COLLISION_KEY],
                archLayout: getArchLayout(labObject),
                archLength: getArchLength(labObject),
                archWidth: getArchWidth(labObject),
                archHeight: getArchHeight(labObject),
                archWall: getArchWall(labObject),
                archWingA: getArchWingA(labObject),
                archWingB: getArchWingB(labObject),
                archFloors: getArchFloors(labObject),
                archCeiling: getArchHasCeiling(labObject),
                archPlinth: getArchHasPlinth(labObject),
                archPlinthFloors: getArchPlinthFloors(labObject),
                archOpenings: getArchOpenings(labObject),
                archTargetWall: labObject.userData.archTargetWall || "south",
                archTargetFloor: labObject.userData.archTargetFloor ?? 0,
                color: getObjectColor(labObject),
                texture: getObjectTextureDataUrl(labObject),
                normalTexture: getObjectNormalTextureDataUrl(labObject),
                specularTexture: getObjectSpecularTextureDataUrl(labObject),
                textureTile: getObjectTextureTile(labObject),
                normalScale: getObjectNormalScale(labObject),
                roughness: mat.roughness,
                metalness: mat.metalness,
                opacity: mat.opacity,
                glass: mat.glass,
                reflection: typeof mat.reflection === "number" ? mat.reflection : mat.metalness,
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
                specularTexture: getObjectSpecularTextureDataUrl(labObject),
                textureTile: getObjectTextureTile(labObject),
                normalScale: getObjectNormalScale(labObject),
                roughness: getObjectRoughness(labObject),
                metalness: getObjectMetalness(labObject),
                opacity: getObjectOpacity(labObject),
                glass: isObjectGlassEnabled(labObject),
                smooth: getObjectSmooth(labObject),
                canPhysics: objectSupportsPhysics(labObject),
                physics: isObjectPhysicsEnabled(labObject),
                physicsMass: getObjectPhysicsMass(labObject),
                physicsBounce: getObjectPhysicsBounce(labObject),
            };
        }
        return {
            kind: "object",
            isImported: !!(labObject.userData?.[LAB_IMPORTED_KEY] || labObject.userData?.labShape === "imported"),
            hasTriangleSelection: !!faceDrawController?.hasTriangleSelection?.(),
            hasLiveFace: textureApplyMode === "face" && !!faceDrawController?.hasLiveFaceTarget?.(),
            collision: !!labObject.userData[COLLISION_KEY],
            color:
                (isTriangleMaterialContext()
                    ? faceDrawController?.getLiveTriangleColor?.()
                    : null) ||
                (isFaceColorContext() ? faceDrawController?.getLiveFaceColor?.() : null) ||
                getObjectColor(labObject),
            texture: getObjectTextureDataUrl(labObject),
            normalTexture: getObjectNormalTextureDataUrl(labObject),
            specularTexture: getObjectSpecularTextureDataUrl(labObject),
            textureTile: getObjectTextureTile(labObject),
            normalScale: getObjectNormalScale(labObject),
            ...(() => {
                const mat = getScopedMaterialState(labObject);
                return {
                    roughness: mat.roughness,
                    metalness: mat.metalness,
                    opacity: mat.opacity,
                    glass: mat.glass,
                    reflection: typeof mat.reflection === "number" ? mat.reflection : mat.metalness,
                };
            })(),
            smooth: getObjectSmooth(labObject),
            canPhysics: objectSupportsPhysics(labObject),
            physics: isObjectPhysicsEnabled(labObject),
            physicsMass: getObjectPhysicsMass(labObject),
            physicsBounce: getObjectPhysicsBounce(labObject),
        };
    }

    function showContextMenuForLabObject(labObject, clientX, clientY, hitMesh = null, hit = null) {
        if (!labObject) return;
        selectObject(labObject, { highlight: true });
        contextMenuHitMesh =
            hitMesh instanceof THREE.Mesh && hitMesh.geometry ? hitMesh : null;
        if (isLabArchitecture(labObject) && hitMesh) {
            indicateArchitectureFace(labObject, hitMesh, hit);
            // Mur ciblé pour ouvertures + matériau (même en mode Objet).
            faceDrawController?.setLiveFaceFromHit?.(labObject, hitMesh, hit);
        }
        if (isLabArchOpeningFill(labObject) && hitMesh) {
            faceDrawController?.setLiveFaceFromHit?.(labObject, hitMesh, hit);
        }
        if (textureApplyMode === "triangles") {
            lastUvEditTarget = { kind: "triangles" };
        } else if (textureApplyMode === "face") {
            if (hitMesh) {
                faceDrawController?.setLiveFaceFromHit?.(labObject, hitMesh, hit);
            }
            lastUvEditTarget = { kind: "face" };
        } else {
            // Mode Objet : ne pas basculer couleur / tile / matériau en mode Face.
            setLastUvObjectTarget(labObject);
        }
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

        if (
            (triangulationMode || textureApplyMode === "triangles") &&
            faceDrawController?.hasTriangleSelection?.()
        ) {
            faceDrawController.clearTriangleSelection?.(true);
            contextMenu.hide();
            return true;
        }
        if (textureApplyMode === "face" && faceDrawController?.hasLiveFaceTarget?.()) {
            faceDrawController.clearFaceSelectionHighlight?.(true);
            contextMenu.hide();
            return true;
        }

        reconcileEditableObjects();
        const hitInfo = pickLabObjectHitAt(event.clientX, event.clientY);
        let labObject = hitInfo?.entity || pickLabObjectAt(event.clientX, event.clientY);
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
            showContextMenuForLabObject(
                labObject,
                event.clientX,
                event.clientY,
                hitInfo?.entity === labObject ? hitInfo.mesh : null,
                hitInfo?.entity === labObject ? hitInfo.hit : null
            );
            return;
        }

        deselectObject();
        contextMenu.hide();
    }

    canvasRightClickImpl = handleCanvasRightClick;

    /**
     * Télécharge l’objet cliqué en fichier .glb (apparence actuelle).
     * @param {THREE.Object3D} object
     */
    async function exportSelectedObjectGltf(object) {
        if (!object || isLabLight(object)) {
            showStatus("Export GLB : choisissez un objet");
            return;
        }
        contextMenu.hide();
        const name =
            object.userData.sceneItemLabel ||
            object.userData.importName ||
            object.name ||
            "objet";
        try {
            const filename = await exportObjectGltf(object, name);
            showStatus(`Exporté : ${filename}`);
        } catch (error) {
            console.warn("[lab-export] GLB objet :", error);
            showStatus(error instanceof Error ? error.message : "Export GLB impossible");
        }
    }

    /**
     * Fige le contenu importé (après split) dans le dataURL, pour Ctrl+S.
     * @param {THREE.Object3D} object
     */
    async function bakeImportedContent(object) {
        if (!object?.userData?.[LAB_IMPORTED_KEY] && object?.userData?.labShape !== "imported") {
            return;
        }
        const content =
            object.children.find((child) => child.name === "import-content") || object;
        try {
            const dataUrl = await objectToGlbDataUrl(content);
            object.userData.importDataUrl = dataUrl;
            object.userData.importFormat = "glb";
            importedTemplateCache.set(importedTemplateKey(dataUrl, "glb"), content.clone(true));
        } catch (err) {
            console.warn("[lab-import] figer pièces :", err);
        }
    }

    /**
     * Découpe un import en meshes séparés (îlots non soudés).
     * @param {THREE.Object3D} object
     */
    async function splitImportedIslands(object) {
        if (!object?.userData?.[LAB_IMPORTED_KEY] && object?.userData?.labShape !== "imported") {
            showStatus("Séparer : réservé aux modèles importés");
            return;
        }
        contextMenu.hide();
        const result = splitObjectMeshesByIslands(object);
        if (!result.splitCount) {
            showStatus(
                result.pieceCount <= 1
                    ? "Une seule pièce : tout est soudé. Mode Triangles → Extraire la sélection."
                    : "Déjà séparé en pièces"
            );
            return;
        }
        ensureImportedMeshPersistIds(object);
        faceDrawController?.clearTriangleSelection?.(false);
        await bakeImportedContent(object);
        invalidateLabShadows();
        updateObjectVisual(object);
        showStatus(
            `Séparées : ${result.pieceCount} pièces — mode Face pour texturer coussin / pieds`
        );
    }

    function selectTriangleIsland() {
        contextMenu.hide();
        if (!faceDrawController?.hasTriangleSelection?.()) {
            showStatus("Mode Triangles : cliquez d’abord un triangle de la pièce");
            return;
        }
        const count = faceDrawController.growSelectionToIslands?.() || 0;
        showStatus(
            count
                ? `Pièce sélectionnée : ${count} triangle(s) — Extraire en objet si besoin`
                : "Aucun îlot autour de la sélection"
        );
    }

    /**
     * Retire les triangles sélectionnés et en crée un nouvel objet lab.
     * @param {THREE.Object3D} sourceObject
     */
    async function extractTriangleSelectionAsObject(sourceObject) {
        const entries = faceDrawController?.getSelectedTriangles?.() || [];
        if (!entries.length) {
            showStatus("Sélectionnez d’abord des triangles (mode Triangles)");
            return;
        }
        contextMenu.hide();

        /** @type {Map<THREE.Mesh, typeof entries>} */
        const byMesh = new Map();
        for (const entry of entries) {
            if (!(entry.mesh instanceof THREE.Mesh)) continue;
            if (entry.mesh.userData?._labNoPaintPick) continue;
            const list = byMesh.get(entry.mesh) || [];
            list.push(entry);
            byMesh.set(entry.mesh, list);
        }

        /** @type {THREE.Object3D[]} */
        const created = [];
        for (const [mesh, meshEntries] of byMesh.entries()) {
            const { extracted, remainderEmpty, matched } = extractSelectedTrianglesFromMesh(
                mesh,
                meshEntries
            );
            if (!extracted || !matched) continue;
            const pieceMesh = new THREE.Mesh(
                extracted,
                Array.isArray(mesh.material)
                    ? mesh.material.map((m) => (m?.clone ? m.clone() : m))
                    : mesh.material?.clone?.() || mesh.material
            );
            pieceMesh.name = `${mesh.name || "Piece"}_extrait`;
            pieceMesh.castShadow = true;
            pieceMesh.receiveShadow = true;
            const pivot = createImportedPivot(pieceMesh, {
                name: `${sourceObject.userData.sceneItemLabel || "Pièce"} extrait`,
                format: "glb",
                dataUrl: null,
            });
            mesh.updateMatrixWorld(true);
            mesh.matrixWorld.decompose(pivot.position, pivot.quaternion, pivot.scale);
            addObjectToScene(pivot, { recordHistory: true, select: false });
            created.push(pivot);
            if (remainderEmpty) {
                mesh.parent?.remove(mesh);
                mesh.geometry?.dispose?.();
            }
        }

        faceDrawController?.clearTriangleSelection?.(false);
        const bakeJobs = created.map((pivot) => bakeImportedContent(pivot));
        if (sourceObject.userData?.[LAB_IMPORTED_KEY] || sourceObject.userData?.labShape === "imported") {
            ensureImportedMeshPersistIds(sourceObject);
            bakeJobs.push(bakeImportedContent(sourceObject));
        }
        await Promise.all(bakeJobs);
        invalidateLabShadows();
        if (created.length) {
            selectObject(created[0], { highlight: true });
            showStatus(
                created.length > 1
                    ? `${created.length} pièces extraites — déplacez-les séparément`
                    : "Pièce extraite — vous pouvez la déplacer / texturer"
            );
        } else {
            showStatus("Extraction impossible");
        }
    }

    /**
     * @param {THREE.Mesh} mesh
     */
    function pruneTriangleOverlaysOnMesh(mesh) {
        if (!mesh?.children?.length) return;
        const toRemove = mesh.children.filter(
            (child) =>
                typeof child.name === "string" &&
                (child.name.startsWith("lab-triangle-texture-overlay") ||
                    child.name === "lab-triangle-selection-overlay")
        );
        for (const child of toRemove) {
            mesh.remove(child);
            child.geometry?.dispose?.();
            const mat = child.material;
            if (Array.isArray(mat)) {
                mat.forEach((m) => {
                    try {
                        m?.map?.dispose?.();
                    } catch {
                        /* ignore */
                    }
                    m?.dispose?.();
                });
            } else if (mat) {
                try {
                    mat.map?.dispose?.();
                } catch {
                    /* ignore */
                }
                mat.dispose?.();
            }
        }
    }

    /**
     * @param {THREE.Object3D} object
     */
    function countRemainingContentMeshes(object) {
        let n = 0;
        object?.traverse((child) => {
            if (!(child instanceof THREE.Mesh)) return;
            if (child.name === "shadow-overlay") return;
            if (
                typeof child.name === "string" &&
                (child.name.startsWith("lab-triangle-texture-overlay") ||
                    child.name === "lab-triangle-selection-overlay" ||
                    child.name === "lab-face-selection-overlay")
            ) {
                return;
            }
            const pos = child.geometry?.attributes?.position;
            if (!pos || pos.count < 3) return;
            n += 1;
        });
        return n;
    }

    /**
     * @param {THREE.Object3D} mesh
     * @returns {THREE.Object3D | null}
     */
    function findEditableAncestor(mesh) {
        let cur = mesh;
        while (cur) {
            if (editableObjects.includes(cur)) return cur;
            cur = cur.parent;
        }
        return null;
    }

    /**
     * Retire les triangles sélectionnés de la géométrie (sans créer d’objet).
     * @param {THREE.Object3D | null} [preferredObject]
     */
    async function deleteTriangleSelection(preferredObject = null) {
        let entries = faceDrawController?.getSelectedTriangles?.() || [];
        let fromFace = false;
        if (!entries.length) {
            entries = faceDrawController?.getLiveFaceTriangleEntries?.() || [];
            fromFace = entries.length > 0;
        }
        if (!entries.length) {
            showStatus(
                textureApplyMode === "face"
                    ? "Mode Face : cliquez une face (surbrillance jaune) puis Suppr"
                    : "Sélectionnez d’abord des triangles (mode Triangles)"
            );
            return;
        }
        contextMenu.hide();

        /** @type {Map<THREE.Object3D, Map<THREE.Mesh, typeof entries>>} */
        const byObject = new Map();
        for (const entry of entries) {
            if (!(entry.mesh instanceof THREE.Mesh) || !entry.triId) continue;
            if (entry.mesh.userData?._labNoPaintPick) continue;
            const root =
                (preferredObject && findEditableAncestor(entry.mesh) === preferredObject
                    ? preferredObject
                    : null) ||
                (entry.entity && editableObjects.includes(entry.entity) ? entry.entity : null) ||
                findEditableAncestor(entry.mesh);
            if (!root) continue;
            if (preferredObject && root !== preferredObject) continue;
            if (isLabLight(root) || isLabVegetation(root)) continue;
            let meshMap = byObject.get(root);
            if (!meshMap) {
                meshMap = new Map();
                byObject.set(root, meshMap);
            }
            const list = meshMap.get(entry.mesh) || [];
            list.push(entry);
            meshMap.set(entry.mesh, list);
        }

        if (!byObject.size) {
            showStatus("Aucun triangle supprimable dans cette sélection");
            return;
        }

        let deleted = 0;
        let objectsEmptied = 0;
        let unmatched = 0;
        for (const [object, meshMap] of byObject.entries()) {
            const before = captureFullSnapshot(object);
            let objectChanged = false;
            for (const [mesh, meshEntries] of meshMap.entries()) {
                const { remainderEmpty, matched } = extractSelectedTrianglesFromMesh(
                    mesh,
                    meshEntries
                );
                if (!matched) {
                    unmatched += meshEntries.length;
                    continue;
                }
                deleted += matched;
                objectChanged = true;
                pruneTriangleOverlaysOnMesh(mesh);
                const pos = mesh.geometry?.attributes?.position;
                if (remainderEmpty || !pos || pos.count < 3) {
                    mesh.parent?.remove(mesh);
                    if (mesh.userData?._labGeoOwned) mesh.geometry?.dispose?.();
                }
            }

            if (!objectChanged) continue;

            if (countRemainingContentMeshes(object) === 0) {
                deleteObject(object, { recordHistory: true });
                objectsEmptied += 1;
                continue;
            }

            const imported =
                !!object.userData?.[LAB_IMPORTED_KEY] || object.userData?.labShape === "imported";
            if (imported) {
                ensureImportedMeshPersistIds(object);
                await bakeImportedContent(object);
            } else if (
                !isLabArchitecture(object) &&
                !isLabStair(object) &&
                !isLabLanding(object) &&
                !isLabTube(object) &&
                !isLabBoat(object)
            ) {
                object.userData.labCsg = true;
                delete object.userData[LAB_SHAPE_KEY];
            }

            invalidateLabShadows();
            updateObjectVisual(object);
            if (triangulationMode) {
                setTriangulationOverlayForObject(object, false);
                setTriangulationOverlayForObject(object, true);
            }
            const after = captureFullSnapshot(object);
            history.push({ type: "reshape", object, before, after });
        }

        faceDrawController?.clearTriangleSelection?.(false);
        if (fromFace) faceDrawController?.clearFaceSelectionHighlight?.();
        if (lastUvEditTarget?.kind === "triangles" || lastUvEditTarget?.kind === "face") {
            lastUvEditTarget = null;
        }

        if (!deleted) {
            showStatus(
                unmatched
                    ? "Ces triangles n’ont pas pu être retirés — resélectionnez-les puis réessayez"
                    : "Suppression impossible"
            );
            return;
        }
        showStatus(
            objectsEmptied
                ? `${deleted} triangle(s) supprimé(s) — objet vide retiré`
                : fromFace
                  ? `Face retirée (${deleted} △) — Ctrl+Z pour annuler`
                  : `${deleted} triangle(s) supprimé(s) — Ctrl+Z pour annuler`
        );
    }

    /**
     * Épaissit un mesh (ou tout l’import) pour fermer les coques CAD.
     * @param {THREE.Object3D} object
     * @param {"piece" | "all"} scope
     */
    async function solidifyImportedSelection(object, scope = "piece") {
        if (!object?.userData?.[LAB_IMPORTED_KEY] && object?.userData?.labShape !== "imported") {
            showStatus("Épaissir : réservé aux modèles importés");
            return;
        }
        contextMenu.hide();

        /** @type {THREE.Mesh | null} */
        let onlyMesh = null;
        if (scope === "piece") {
            if (!(contextMenuHitMesh instanceof THREE.Mesh) || !contextMenuHitMesh.geometry) {
                showStatus("Cliquez d’abord la pièce (porte, panneau…) puis Épaissir cette pièce");
                return;
            }
            let belongs = false;
            object.traverse((child) => {
                if (child === contextMenuHitMesh) belongs = true;
            });
            if (!belongs) {
                showStatus("La pièce cliquée n’appartient pas à cet import");
                return;
            }
            onlyMesh = contextMenuHitMesh;
        }

        const raw = await labPrompt(
            "Épaisseur (mètres). Ex. 0,02 = 2 cm — ferme les coques ouvertes (CAD).",
            {
                title: scope === "piece" ? "Épaissir cette pièce" : "Épaissir tout le modèle",
                defaultValue: String(DEFAULT_SOLIDIFY_THICKNESS).replace(".", ","),
                confirmLabel: "Épaissir",
                cancelLabel: "Annuler",
            }
        );
        if (raw == null) return;
        const thickness = clampSolidifyThickness(String(raw).replace(",", "."));

        try {
            const result = solidifyObjectMeshes(object, {
                thickness,
                onlyMesh,
            });
            clearObjectGlassOnManualEdit(object);
            // Recalcule les normales lisses sans coller face/flanc (pli serré sur shell).
            applyObjectSmooth(object, getObjectSmooth(object));
            invalidateLabShadows();
            updateObjectVisual(object);
            const mm = Math.round(thickness * 1000);
            const scopeLabel = onlyMesh
                ? `« ${onlyMesh.name || "pièce"} »`
                : `${result.meshCount} mesh(es)`;
            showStatus(
                `Épaissi ${scopeLabel} — ${mm} mm (${result.boundaryEdges} bords, ${result.triangles} △)`
            );
        } catch (error) {
            showStatus(error instanceof Error ? error.message : "Épaississement impossible");
        }
    }

    contextMenu.onAction((action, object, detail) => {
        if (action === "rename") {
            void promptRenameSceneObject(object);
            return;
        }
        if (action === "place-avatar") {
            placeAvatarOnObject(object);
            return;
        }
        if (action === "export-glb") {
            void exportSelectedObjectGltf(object);
            return;
        }
        if (action === "mesh-solidify-piece") {
            void solidifyImportedSelection(object, "piece");
            return;
        }
        if (action === "mesh-solidify-all") {
            void solidifyImportedSelection(object, "all");
            return;
        }
        if (action === "mesh-solidify") {
            void solidifyImportedSelection(object, "piece");
            return;
        }
        if (action === "mesh-split-islands") {
            void splitImportedIslands(object);
            return;
        }
        if (action === "mesh-select-island") {
            selectTriangleIsland();
            return;
        }
        if (action === "mesh-extract-selection") {
            void extractTriangleSelectionAsObject(object);
            return;
        }
        if (action === "mesh-delete-selection") {
            void deleteTriangleSelection(object);
            return;
        }
        if (action === "make-boat") {
            makeObjectFloatAsBoat(object);
            return;
        }
        if (action === "boat-replace-import") {
            void replaceBoatAppearanceFromFile(object);
            return;
        }
        if (action === "boat-restore-procedural") {
            restoreProceduralBoatAppearance(object);
            return;
        }
        if (action === "arch-add-door" && isLabArchitecture(object)) {
            const surface = normalizeArchSurface(object.userData.archTargetWall || "south");
            if (isArchSlabSurface(surface)) {
                showStatus("Choisissez un mur (clic) pour une porte");
                return;
            }
            const floor = Math.max(0, Number(object.userData.archTargetFloor) | 0);
            /** @type {{ floor: number, offset?: number }} */
            const opts = { floor };
            if (Number.isFinite(Number(object.userData.archTargetOffset))) {
                opts.offset = Number(object.userData.archTargetOffset);
            }
            const opening = createDefaultOpening(object, "door", surface, opts);
            if (!opening) {
                showStatus(
                    `Pas assez de place — ${ARCH_WALL_LABELS[surface] || surface}, étage ${floor + 1}`
                );
                return;
            }
            applyArchitectureParams(object, { openings: [...getArchOpenings(object), opening] });
            showStatus(
                `Porte avec encadrement — ${ARCH_WALL_LABELS[surface] || surface}, étage ${opening.floor + 1}`
            );
            return;
        }
        if (action === "arch-add-window" && isLabArchitecture(object)) {
            const surface = normalizeArchSurface(object.userData.archTargetWall || "south");
            if (isArchSlabSurface(surface)) {
                showStatus("Choisissez un mur (clic) pour une fenêtre");
                return;
            }
            const floor = Math.max(0, Number(object.userData.archTargetFloor) | 0);
            const height = getArchHeight(object);
            const pitch = getArchStoryPitch(object);
            /** @type {{ floor: number, offset?: number, sill?: number }} */
            const opts = { floor };
            if (Number.isFinite(Number(object.userData.archTargetOffset))) {
                opts.offset = Number(object.userData.archTargetOffset);
            }
            if (Number.isFinite(Number(object.userData.archTargetHitY))) {
                const relY = Number(object.userData.archTargetHitY) - floor * pitch;
                const winH = Math.min(1.2, height - 0.4);
                opts.sill = THREE.MathUtils.clamp(relY - winH / 2, 0, Math.max(0, height - winH - 0.05));
            }
            const opening = createDefaultOpening(object, "window", surface, opts);
            if (!opening) {
                showStatus(
                    `Pas assez de place — ${ARCH_WALL_LABELS[surface] || surface}, étage ${floor + 1}`
                );
                return;
            }
            applyArchitectureParams(object, { openings: [...getArchOpenings(object), opening] });
            showStatus(
                `Fenêtre avec encadrement — ${ARCH_WALL_LABELS[surface] || surface}, étage ${opening.floor + 1}`
            );
            return;
        }
        if (action === "arch-add-hole" && isLabArchitecture(object)) {
            let surface = normalizeArchSurface(object.userData.archTargetWall || "floor");
            if (!isArchSlabSurface(surface)) surface = "floor";
            if (surface === "ceiling" && !getArchHasCeiling(object)) {
                showStatus("Activez d’abord le plafond");
                return;
            }
            const floor = Math.max(0, Number(object.userData.archTargetFloor) | 0);
            if (surface === "floor" && getArchLayout(object) === "patio" && floor === 0) {
                showStatus("Patio RDC : sol plein (trou possible dès l’étage 2)");
                return;
            }
            /** @type {{ floor?: number, offset?: number, offsetZ?: number }} */
            const opts = { floor };
            if (Number.isFinite(Number(object.userData.archTargetOffset))) {
                opts.offset = Number(object.userData.archTargetOffset);
            }
            if (Number.isFinite(Number(object.userData.archTargetOffsetZ))) {
                opts.offsetZ = Number(object.userData.archTargetOffsetZ);
            }
            const opening = createDefaultSlabHole(
                object,
                /** @type {"floor"|"ceiling"} */ (surface),
                opts
            );
            if (!opening) {
                showStatus(`Pas assez de place sur le ${surface === "floor" ? "sol" : "plafond"}`);
                return;
            }
            applyArchitectureParams(object, { openings: [...getArchOpenings(object), opening] });
            showStatus(
                surface === "floor"
                    ? `Trou sol — étage ${opening.floor + 1} (${opening.width.toFixed(2)} × ${opening.height.toFixed(2)} m)`
                    : `Trou plafond (${opening.width.toFixed(2)} × ${opening.height.toFixed(2)} m)`
            );
            return;
        }
        if (action === "arch-remove-opening" && isLabArchitecture(object)) {
            const openingId = detail?.openingId;
            if (!openingId) return;
            const openings = getArchOpenings(object).filter((o) => o.id !== openingId);
            applyArchitectureParams(object, { openings });
            showStatus("Ouverture supprimée");
            return;
        }
        if (action === "arch-opening-replace-glb") {
            const fill = isLabArchOpeningFill(object) ? object : null;
            const room = fill ? getArchHostFromFill(fill) : object;
            const openingId = fill
                ? String(fill.userData.archOpeningId || "")
                : String(detail?.openingId || "");
            if (!isLabArchitecture(room) || !openingId) return;
            void replaceArchOpeningWithFile(room, openingId);
            return;
        }
        if (action === "arch-opening-restore-simple") {
            const fill = isLabArchOpeningFill(object) ? object : null;
            const room = fill ? getArchHostFromFill(fill) : object;
            const openingId = fill
                ? String(fill.userData.archOpeningId || "")
                : String(detail?.openingId || "");
            if (!isLabArchitecture(room) || !openingId) return;
            const openings = getArchOpenings(room).map((op) => {
                if (op.id !== openingId) return op;
                return { ...op, fill: "simple", importDataUrl: undefined, importFormat: undefined, importName: undefined };
            });
            applyArchitectureParams(room, { openings }, { selectOpeningId: openingId });
            showStatus("Modèle simple restauré");
            return;
        }
        if (action === "arch-opening-fill-none") {
            const fill = isLabArchOpeningFill(object) ? object : null;
            const room = fill ? getArchHostFromFill(fill) : object;
            const openingId = fill
                ? String(fill.userData.archOpeningId || "")
                : String(detail?.openingId || "");
            if (!isLabArchitecture(room) || !openingId) return;
            const openings = getArchOpenings(room).map((op) => {
                if (op.id !== openingId) return op;
                return { ...op, fill: "none", importDataUrl: undefined, importFormat: undefined, importName: undefined };
            });
            applyArchitectureParams(room, { openings });
            showStatus("Trou seul (sans porte / fenêtre)");
            return;
        }
        if (action === "arch-opening-reset-pose") {
            if (isLabArchOpeningFill(object)) resetArchOpeningFillTransform(object);
            return;
        }
        if (action === "arch-clear-openings" && isLabArchitecture(object)) {
            const surface = normalizeArchSurface(object.userData.archTargetWall || "south");
            const floor = Math.max(0, Number(object.userData.archTargetFloor) | 0);
            const openings = getArchOpenings(object).filter(
                (o) => !openingBelongsToArchFace(o, surface, floor)
            );
            applyArchitectureParams(object, { openings });
            showStatus("Ouvertures de cette face supprimées");
            return;
        }
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
                prop === "specular-texture" ||
                prop === "specular-texture-clear" ||
                prop === "roughness" ||
                prop === "metalness" ||
                prop === "reflection" ||
                prop === "opacity" ||
                prop === "glass" ||
                prop === "smooth" ||
                prop === "metal-preset" ||
                prop === "waxed-preset" ||
                prop === "mirror-preset" ||
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
        if (prop === "arch-length") applyArchitectureParams(object, { length: Number(value) });
        if (prop === "arch-width") applyArchitectureParams(object, { width: Number(value) });
        if (prop === "arch-height") applyArchitectureParams(object, { height: Number(value) });
        if (prop === "arch-wall") applyArchitectureParams(object, { wall: Number(value) });
        if (prop === "arch-wing-a") applyArchitectureParams(object, { wingA: Number(value) });
        if (prop === "arch-wing-b") applyArchitectureParams(object, { wingB: Number(value) });
        if (prop === "arch-floors") applyArchitectureParams(object, { floors: Number(value) });
        if (prop === "arch-ceiling") applyArchitectureParams(object, { ceiling: !!value });
        if (prop === "arch-plinth-floor" && isLabArchitecture(object)) {
            const floor = Math.max(0, Number(object.userData.archTargetFloor) | 0);
            const current = new Set(getArchPlinthFloors(object));
            if (value) current.add(floor);
            else current.delete(floor);
            applyArchitectureParams(object, {
                plinthFloors: normalizeArchPlinthFloors([...current], getArchFloors(object)),
            });
            contextMenu.syncProperty("arch-plinth-floor", !!value);
            return;
        }
        if (prop === "arch-opening-offset" && isLabArchitecture(object) && value && typeof value === "object") {
            const payload = /** @type {{ id?: string, offset?: number, commit?: boolean }} */ (value);
            const id = payload.id;
            if (!id) return;
            const current = getArchOpenings(object);
            const openings = current.map((o) => {
                if (o.id !== id) return o;
                const next = { ...o, offset: Number(payload.offset) || 0 };
                next.offset = clampOpeningOffset(object, next, current);
                if (isArchSlabSurface(next.wall)) {
                    next.offsetZ = clampOpeningOffsetZ(object, next, current);
                }
                return next;
            });
            const applied = openings.find((o) => o.id === id);
            if (applied) {
                contextMenu.syncProperty("arch-opening-offset-value", {
                    id,
                    offset: applied.offset,
                });
            }
            queueArchitectureOpenings(object, openings, { commit: !!payload.commit });
            return;
        }
        if (prop === "arch-opening-offset-z" && isLabArchitecture(object) && value && typeof value === "object") {
            const payload = /** @type {{ id?: string, offsetZ?: number, commit?: boolean }} */ (value);
            const id = payload.id;
            if (!id) return;
            const current = getArchOpenings(object);
            const openings = current.map((o) => {
                if (o.id !== id) return o;
                const next = { ...o, offsetZ: Number(payload.offsetZ) || 0 };
                next.offset = clampOpeningOffset(object, next, current);
                next.offsetZ = clampOpeningOffsetZ(object, next, current);
                return next;
            });
            const applied = openings.find((o) => o.id === id);
            if (applied) {
                contextMenu.syncProperty("arch-opening-offset-z-value", {
                    id,
                    offsetZ: applied.offsetZ,
                });
            }
            queueArchitectureOpenings(object, openings, { commit: !!payload.commit });
            return;
        }
        if (prop === "arch-opening-size" && isLabArchitecture(object) && value && typeof value === "object") {
            const payload = /** @type {{ id?: string, width?: number, height?: number, commit?: boolean }} */ (
                value
            );
            const id = payload.id;
            if (!id) return;
            const current = getArchOpenings(object);
            const openings = current.map((o) => {
                if (o.id !== id) return o;
                const next = { ...o };
                if (typeof payload.width === "number") next.width = payload.width;
                if (typeof payload.height === "number") next.height = payload.height;
                next.width = clampOpeningWidth(object, next);
                next.height = clampOpeningHeight(object, next);
                next.offset = clampOpeningOffset(object, next, current);
                if (isArchSlabSurface(next.wall)) {
                    next.offsetZ = clampOpeningOffsetZ(object, next, current);
                }
                return next;
            });
            queueArchitectureOpenings(object, openings, { commit: !!payload.commit });
            return;
        }
        if (prop === "arch-target-wall" && isLabArchitecture(object)) {
            object.userData.archTargetWall = normalizeArchSurface(value);
            contextMenu.syncProperty("arch-target-wall", object.userData.archTargetWall);
            syncArchitectureContextMenu(object);
        }
        if (prop === "collision") setCollision(object, !!value);
        if (prop === "physics") setObjectPhysics(object, !!value);
        if (prop === "physics-mass") setObjectPhysicsMassValue(object, Number(value));
        if (prop === "physics-bounce") setObjectPhysicsBounceValue(object, Number(value));
        if (prop === "boat-float" && isLabBoat(object)) {
            object.userData[BOAT_FLOAT_KEY] = !!value;
            contextMenu.syncProperty("boat-float", !!value);
            if (value && isObjectPhysicsEnabled(object)) {
                setObjectPhysics(object, false);
            }
            showStatus(value ? "Flottaison activée" : "Flottaison désactivée");
        }
        if (prop === "boat-density" && isLabBoat(object)) {
            setBoatDensity(object, Number(value));
            const density = getBoatDensity(object);
            showStatus(
                density >= 1
                    ? `Densité ${density.toFixed(2).replace(".", ",")} — plus dense que l’eau : l’objet coule`
                    : `Densité ${density.toFixed(2).replace(".", ",")} — immersion ${Math.round(density * 100)} % (Archimède)`
            );
        }
        if (prop === "light-marker-visible") setLightMarkerVisibility(object, !!value);
        if (prop === "light-intensity") setLightIntensityValue(object, Number(value));
        if (prop === "light-shadow-opacity") setLightShadowOpacityValue(object, Number(value));
        if (prop === "spot-angle") setLightSpotAngleValue(object, Number(value));
        if (prop === "spot-penumbra") setLightSpotPenumbraValue(object, Number(value));
        if (prop === "color-preview") {
            if (isTriangleMaterialContext()) {
                if (!applySelectedTriangleColor(object, String(value))) {
                    showStatus("Mode Triangles : texturisez ou sélectionnez des triangles d’abord");
                }
            } else if (isArchitectureFaceColorContext(object) || isFaceColorContext()) {
                if (!applySelectedFaceColor(object, String(value))) {
                    if (isFaceColorContext()) {
                        showStatus("Mode Face : cliquez d’abord la face / la pièce à colorer");
                    } else {
                        clearObjectGlassOnManualEdit(object);
                        applyObjectColor(object, String(value));
                    }
                }
            } else {
                clearObjectGlassOnManualEdit(object);
                applyObjectColor(object, String(value));
            }
        }
        if (prop === "color") setObjectColor(object, String(value));
        if (prop === "texture") setObjectTexture(object, value ? String(value) : null);
        if (prop === "texture-clear") setObjectTexture(object, null);
        if (prop === "normal-texture") setObjectNormalTexture(object, value ? String(value) : null);
        if (prop === "normal-texture-clear") setObjectNormalTexture(object, null);
        if (prop === "specular-texture") setObjectSpecularTexture(object, value ? String(value) : null);
        if (prop === "specular-texture-clear") setObjectSpecularTexture(object, null);
        if (prop === "roughness") setObjectRoughness(object, Number(value));
        if (prop === "metalness") setObjectMetalness(object, Number(value));
        if (prop === "reflection") setObjectReflection(object, Number(value));
        if (prop === "opacity") setObjectOpacity(object, Number(value));
        if (prop === "glass") setObjectGlass(object, !!value);
        if (prop === "smooth") setObjectSmooth(object, !!value);
        if (prop === "metal-preset") applyMetalPreset(object);
        if (prop === "waxed-preset") applyWaxedPreset(object);
        if (prop === "mirror-preset") applyMirrorPreset(object);
        if (prop === "normal-scale") setObjectNormalScale(object, Number(value));
        if (prop === "texture-tile") {
            // Si une texture Face / Triangles vient d’être posée, le Tile du
            // menu contextuel doit la viser — pas le tile global de l’objet.
            if (lastUvEditTarget?.kind === "face" || lastUvEditTarget?.kind === "triangles") {
                const tile = Number(value);
                applyTextureTransformLive(
                    { tileX: tile, tileY: tile },
                    { phase: "input" }
                );
            } else {
                setObjectTextureTile(object, Number(value));
            }
        }
        if (
            prop === "texture-error" ||
            prop === "normal-texture-error" ||
            prop === "specular-texture-error"
        ) {
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
        if (avatarPlaceActive) {
            placeAvatarAtClient(event.clientX, event.clientY);
            return;
        }
        if (lightPlaceType) {
            placeLightAtClient(event.clientX, event.clientY);
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

        const hitInfo = pickLabObjectHitAt(event.clientX, event.clientY);
        const labObject = hitInfo?.entity || null;
        const additive = !!(event.ctrlKey || event.metaKey);

        if (additive) {
            const target = labObject || pickLabObjectAt(event.clientX, event.clientY);
            if (target) {
                selectObject(target, { highlight: true, additive: true });
                if (isLabArchitecture(target) && hitInfo?.mesh) {
                    indicateArchitectureFace(target, hitInfo.mesh, hitInfo.hit);
                }
            }
            return;
        }

        // Hors géométrie réelle → tout désélectionner (pas de pick AABB « soft »)
        if (!labObject) {
            deselectObject();
            return;
        }

        if (isLabArchitecture(labObject) && hitInfo?.mesh) {
            // Pièce : sélectionne + indique l’orientation (pas de toggle désélection).
            if (!selectedObjects.includes(labObject) || selectedObjects.length !== 1) {
                selectObject(labObject, { highlight: true, additive: false });
            }
            indicateArchitectureFace(labObject, hitInfo.mesh, hitInfo.hit);
            faceDrawController?.setLiveFaceFromHit?.(labObject, hitInfo.mesh, hitInfo.hit);
            return;
        }

        if (!selectedObjects.includes(labObject)) {
            selectObject(labObject, { highlight: true, additive: false });
            if (textureApplyMode === "face" && hitInfo?.mesh) {
                faceDrawController?.setLiveFaceFromHit?.(labObject, hitInfo.mesh, hitInfo.hit);
            }
            return;
        }

        // Clic sur un objet déjà sélectionné : seul → désélection ; multi → ne garder que celui-ci
        if (selectedObjects.length === 1) {
            // Mode Face : un nouveau clic retarget la face (surbrillance) au lieu de désélectionner.
            if (textureApplyMode === "face" && hitInfo?.mesh) {
                faceDrawController?.setLiveFaceFromHit?.(labObject, hitInfo.mesh, hitInfo.hit);
                return;
            }
            deselectObject();
            return;
        }
        selectObject(labObject, { highlight: true, additive: false });
        if (textureApplyMode === "face" && hitInfo?.mesh) {
            faceDrawController?.setLiveFaceFromHit?.(labObject, hitInfo.mesh, hitInfo.hit);
        }
    }

    setCanvasLeftClickHandler(handleCanvasLeftClick);

    function handleCanvasDoubleClick(event) {
        if (isGizmoDragging?.()) return;
        if (canInteractAt && !canInteractAt(event.clientX, event.clientY)) return;
        const hitInfo = pickLabObjectHitAt(event.clientX, event.clientY);
        const labObject = hitInfo?.entity || pickLabObjectAt(event.clientX, event.clientY);
        if (!labObject) return;
        selectObject(labObject, { highlight: true, additive: false });
        if (isLabArchitecture(labObject) && hitInfo?.mesh) {
            indicateArchitectureFace(labObject, hitInfo.mesh, hitInfo.hit);
        }
        if (textureApplyMode === "face" && hitInfo?.mesh) {
            faceDrawController?.setLiveFaceFromHit?.(labObject, hitInfo.mesh, hitInfo.hit);
        }
        focusCameraNearSelection(labObject, hitInfo);
    }

    setCanvasDoubleClickHandler(handleCanvasDoubleClick);

    /** Cale les barques sur la houle, sauf pendant une manipulation au gizmo. */
    function updateFloatingBoats(step) {
        if (!oceanController?.isActive?.()) return;
        const dt = THREE.MathUtils.clamp(step ?? 1 / 60, 0.001, 0.05);

        // Avancer la houle AVANT d’échantillonner / de rendre.
        oceanController.tick?.(dt);

        const sampleWaveY = oceanController.getWaveHeightAt;
        if (typeof sampleWaveY !== "function") return;

        const dragging = !!isGizmoDragging?.();
        for (const object of editableObjects) {
            if (!isLabBoat(object)) continue;
            if (dragging && selectedObjects.includes(object)) continue;
            // Fond marin = plancher du lab (y = 0) pour les objets qui coulent.
            updateBoatFloat(object, (x, z) => sampleWaveY(x, z), dt, { floorY: 0 });
        }
    }

    function updateObjectPhysics(step) {
        const dt = THREE.MathUtils.clamp(step ?? 1 / 60, 0.001, 0.05);
        const dragging = !!isGizmoDragging?.();
        const moved = stepPhysicsObjects(editableObjects, dt, {
            skip: (object) => {
                if (!objectSupportsPhysics(object)) return true;
                if (dragging && selectedObjects.includes(object)) return true;
                return false;
            },
        });
        if (moved) {
            invalidateLabShadows();
            for (const object of selectedObjects) {
                if (isObjectPhysicsEnabled(object)) refreshObjectDisplay(object);
            }
            syncSelectionOutlines();
        }
    }

    setBeforeRender?.(() => {
        const now = performance.now();
        const dt = lastFloatTimeMs ? (now - lastFloatTimeMs) / 1000 : 1 / 60;
        lastFloatTimeMs = now;
        const step = Math.min(0.05, Math.max(0.001, dt));
        updateFloatingBoats(step);
        updateObjectPhysics(step);
    });

    setAfterRender?.(() => {
        updateLightHelpers(editableObjects);
        for (const helper of selectionHelpers.values()) helper.update();
    });

    function wireLightButton(button, type) {
        if (!button) return;
        button.addEventListener("click", (e) => {
            e.stopPropagation();
            setLightPlaceActive(type);
        });
    }

    wireLightButton(lightBtns?.spot, LIGHT_TYPE.SPOT);
    wireLightButton(lightBtns?.sun, LIGHT_TYPE.SUN);
    wireLightButton(lightBtns?.lamp, LIGHT_TYPE.LAMP);

    if (drawBtn && drawPanel && drawColorInput && setDrawModeActive) {
        faceDrawController = initFaceDrawController({
            canvas,
            drawBtn,
            drawPanel,
            colorInput: drawColorInput,
            sizeInput: drawSizeInput,
            opacityInput: drawOpacityInput,
            tileXInput: drawTileXInput,
            tileYInput: drawTileYInput,
            offsetXInput: drawOffsetXInput,
            offsetYInput: drawOffsetYInput,
            setDrawModeActive: (activePaint) => {
                paintModeActive = !!activePaint;
                setDrawModeActive(activePaint);
                if (activePaint) {
                    // Préparer les objets sélectionnés tout de suite : le 1er
                    // coup de pinceau ne doit plus reconstruire la géométrie.
                    for (const object of selectedObjects) {
                        let prepared = false;
                        object.traverse((child) => {
                            if (ensurePaintReady(child)) prepared = true;
                        });
                        if (prepared) syncObjectUvTransforms(object);
                    }
                }
                for (const object of [...selectedObjects]) updateObjectVisual(object);
            },
            setPaintStrokeActive,
            cancelLookGesture,
            onEmptyPaintClick: () => {
                if (!selectedObjects.length) return false;
                deselectObject();
                showStatus("Objet désélectionné");
                return true;
            },
            resyncObjectUv: (object) => {
                if (object) syncObjectUvTransforms(object);
            },
            isTriangulationMode: () => triangulationMode,
            isFaceApplyMode: () => textureApplyMode === "face",
            exitTriangulationForPaint: () => {
                if (!triangulationMode) return;
                triangulationMode = false;
                textureApplyMode = "object";
                syncTextureModeDocClass();
                faceDrawController?.clearTriangleSelection?.();
                applyTriangulationOverlays(false);
                syncTextureModeButtons("object");
            },
            enterExplore,
            setSelectionOnlyMode,
            showStatus,
            pickPaintHit,
            recordPaintHistory: ({ object, faceIndex, before, after, mesh }) => {
                history.push({ type: "face-paint", object, faceIndex, before, after, mesh });
            },
            onTriangleTextureApplied: (overlays) => {
                if (!overlays?.length) return;
                setLastUvTriangleTarget(overlays);
                history.push({
                    type: "triangle-texture",
                    overlays: [...overlays],
                    restore: overlays.map((overlay) => ({
                        overlay,
                        parent: overlay.parent,
                    })),
                });
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

    placeAvatarBtn?.addEventListener("click", (e) => {
        e.stopPropagation();
        setAvatarPlaceActive(!avatarPlaceActive);
    });

    canvas.addEventListener("mousemove", handleAvatarPlacePointerMove);
    canvas.addEventListener("mousemove", handleLightPlacePointerMove);
    canvas.addEventListener("mouseleave", () => {
        if (avatarPlaceActive) updateAvatarPlaceMarker(null);
        if (lightPlaceType) updateLightPlaceMarker(null);
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
        spawnArchitectureAt,
        spawnVegetationAt,
        spawnImportedModelFile,
        spawnImportedLibraryAsset,
        spawnImportedLibraryAssetAtClient,
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
            textureApplyMode = triangulationMode ? "triangles" : "object";
            syncTextureModeDocClass();
            if (triangulationMode) {
                faceDrawController?.setActive?.(true);
            } else {
                faceDrawController?.clearTriangleSelection?.();
            }
            applyTriangulationOverlays(triangulationMode);
            syncTextureModeButtons(textureApplyMode);
            showStatus(
                triangulationMode
                    ? "Mode Triangles — glisser = sélection, clic droit = vider"
                    : "Mode Objet complet"
            );
        },
        /** Sortie triangulation pour peindre librement (crayon). */
        exitTriangulationForPaint: () => {
            if (!triangulationMode) return;
            triangulationMode = false;
            textureApplyMode = "object";
            syncTextureModeDocClass();
            faceDrawController?.clearTriangleSelection?.();
            applyTriangulationOverlays(false);
            syncTextureModeButtons("object");
        },
        setTextureApplyMode: (mode) => {
            const next =
                mode === "triangles" ? "triangles" : mode === "face" ? "face" : "object";
            textureApplyMode = next;
            const enableTris = next === "triangles";
            triangulationMode = enableTris;
            syncTextureModeDocClass();
            if (triangulationMode) {
                faceDrawController?.setActive?.(true);
                faceDrawController?.clearFaceSelectionHighlight?.();
            } else {
                faceDrawController?.clearTriangleSelection?.();
            }
            applyTriangulationOverlays(triangulationMode);
            syncTextureModeButtons(next);
            showStatus(
                next === "triangles"
                    ? "Mode Triangles — glisser = sélection, clic droit = vider"
                    : next === "face"
                      ? "Mode Face — cliquez une face, clic droit = vider"
                      : "Mode Objet — déposez sur l’objet entier"
            );
        },
        getTextureApplyMode: () => textureApplyMode,
        isTriangulationMode: () => triangulationMode,
        clearTriangleSelection: () => faceDrawController?.clearTriangleSelection?.(),
        deleteTriangleSelection: () => deleteTriangleSelection(),
        getSelectedObjects: () => [...selectedObjects],
        getSelectedObject: () => selectedObject,
        pickLabObjectAt,
        applyTextureDrop,
        setObjectTexture,
        setObjectNormalTexture,
        setObjectSpecularTexture,
        setObjectTextureTransform,
        applyTextureTransformLive,
        setObjectColor,
        setObjectRoughness,
        setObjectMetalness,
        setObjectOpacity,
        getFaceDrawController: () => faceDrawController,
        showStatus,
    };
}
