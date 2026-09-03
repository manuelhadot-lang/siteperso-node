/** Terrain sculptable couvrant toute la grille. */
import * as THREE from "three";
import { GRID_SIZE, formatGridSizeMeters } from "./grid-constants.js";
import {
    COLLISION_KEY,
    registerCollidable,
    unregisterCollidable,
} from "./lab-collision.js";
import {
    ensureLabFullscreenAfterFile,
    pickFilePreservingFullscreen,
    restoreFullscreenNow,
} from "./fullscreen.js";
import { setObjectShadowEnabled, getObjectShadowEnabled, getObjectShadowOpacity, setObjectShadowOpacity } from "./lab-shadows.js";
import {
    DEFAULT_NORMAL_SCALE,
    DEFAULT_TEXTURE_TILE,
    NORMAL_SCALE_MAX,
    NORMAL_SCALE_MIN,
    NORMAL_SCALE_STEP,
    TERRAIN_PAINT_TEXTURE_TILE_MIN,
    TERRAIN_PAINT_TEXTURE_TILE_MAX,
    TERRAIN_TEXTURE_TILE_MAX,
    TEXTURE_TILE_MIN,
    TEXTURE_TILE_STEP,
} from "./lab-object-textures.js";
import { bindRangeSliderWheel } from "./wheel-utils.js";
import { fillRepeatingTexture, prepareTileSource } from "./texture-tile-utils.js";
import {
    downloadIgnHeightmapPng,
    elevationsToHeightmapDataUrl,
    fetchIgnHeightGrid,
    labIgnTerrainPicker,
    mapIgnElevationsToMeshHeights,
    applyMeshHeightsToTerrainPositions,
    applyTerrainGeoUVs,
    IGN_GRID_SEGMENTS,
    upsampleIgnElevations,
} from "./lab-terrain-ign.js";
import { buildOsmRoadMaskForTerrain } from "./lab-terrain-osm.js";
import { placeOsmBuildings, placeBdTopoBuildings, clearOsmBuildings, clearOsmRoads } from "./lab-terrain-buildings.js";
import { buildIgnOrthoForTerrain, dataUrlToImageData } from "./lab-terrain-ortho.js";
import {
    LAYER_DEFS,
    GROUND_LAYER_IDS,
    composeTerrainGround,
} from "./lab-terrain-splat.js";

export const LAB_TERRAIN_KEY = "labTerrain";
export const TERRAIN_SCENE_ITEM_ID = "env-terrain";
/** Espacement cible des sommets (m) — sous le mètre pour lit / berges. */
const TERRAIN_CELL_TARGET_M = 0.75;
const TERRAIN_SEGMENTS_MIN = 160;
/** Plafond perf / IGN (~263k points). Sous 384 m de côté → ≤ 0,75 m/cellule. */
const TERRAIN_SEGMENTS_MAX = 512;
/** Fallback si taille inconnue. */
const TERRAIN_SEGMENTS = 320;

/**
 * @param {number} sizeMeters
 */
function segmentsForTerrainSize(sizeMeters) {
    const size = Math.max(10, Number(sizeMeters) || GRID_SIZE);
    const raw = Math.ceil(size / TERRAIN_CELL_TARGET_M);
    return Math.max(TERRAIN_SEGMENTS_MIN, Math.min(TERRAIN_SEGMENTS_MAX, raw));
}
/** Canvas pinceau — masques / couleurs peintes. Textures tilées en GPU. */
const PAINT_SIZE = 4096;
/** Tuile GPU (sol + pinceau) : haute rés. pour rester nette de près. */
const BASE_TEXTURE_GPU_SIZE = 2048;
const MAX_HISTORY = 30;
const SCULPT_HEIGHT_MIN = -8;
const SCULPT_HEIGHT_MAX = 18;
/** Normal map plate (0.5, 0.5, 1) en tangent space. */
const FLAT_NORMAL_COLOR = "#8080ff";

function formatNumber(value, digits = 2) {
    return value.toFixed(digits).replace(".", ",");
}

/**
 * @param {{
 *   scene: THREE.Scene,
 *   camera: THREE.Camera,
 *   renderer: THREE.WebGLRenderer,
 *   setTerrainSculptModeActive?: (active: boolean) => void,
 *   gridHelper?: THREE.Object3D | null,
 *   floor?: THREE.Object3D | null,
 *   setFloorCoveredByTerrain?: (covered: boolean) => void,
 *   sceneRegistry?: ReturnType<import("./lab-scene-registry.js").createSceneRegistry> | null,
 *   focusOnTerrain?: (object: THREE.Object3D) => void,
 *   setWorldSize?: (sizeMeters: number) => void,
 *   showStatus?: (message: string) => void,
 *   setMovementMode?: (mode: string) => void,
 *   placePlayerAt?: (x: number, y: number, z: number, opts?: object) => boolean,
 *   clearSkybox?: () => void,
 *   clearOcean?: () => void,
 * }} options
 */
export function initTerrainEditor(options) {
    const {
        scene,
        camera,
        renderer,
        setTerrainSculptModeActive,
        gridHelper = null,
        floor = null,
        setFloorCoveredByTerrain = null,
        sceneRegistry = null,
        focusOnTerrain = null,
        setWorldSize = null,
        showStatus = null,
        setMovementMode = null,
        placePlayerAt = null,
        clearSkybox = null,
        clearOcean = null,
    } = options;

    function coverFloor(covered) {
        if (setFloorCoveredByTerrain) {
            setFloorCoveredByTerrain(covered);
            return;
        }
        if (floor) floor.visible = !covered;
    }

    /** @type {((entry: { type: "terrain", before: object | null, after: object | null }) => void) | null} */
    let pushSceneHistory = null;

    /** @type {THREE.DataTexture | null} */
    let heightTexture = null;
    /** @type {Uint8Array | null} */
    let heightTextureData = null;
    let heightMapDirty = true;

    const HEIGHT_MAP_RES = () => meshSegments + 1;
    let meshSegments = TERRAIN_SEGMENTS;
    let sizeMeters = GRID_SIZE;
    const createBtn = /** @type {HTMLButtonElement | null} */ (
        document.getElementById("btn-create-terrain")
    );
    const ignImportBtn = /** @type {HTMLButtonElement | null} */ (
        document.getElementById("btn-import-terrain-ign")
    );
    const ignMeshBtn = /** @type {HTMLButtonElement | null} */ (
        document.getElementById("btn-import-terrain-ign-mesh")
    );
    const tools = document.getElementById("lab-terrain-tools");
    const sizeInput = /** @type {HTMLInputElement | null} */ (
        document.getElementById("lab-terrain-size")
    );
    const sizeValue = /** @type {HTMLOutputElement | null} */ (
        document.getElementById("lab-terrain-size-value")
    );
    const radiusInput = /** @type {HTMLInputElement | null} */ (
        document.getElementById("lab-terrain-radius")
    );
    const strengthInput = /** @type {HTMLInputElement | null} */ (
        document.getElementById("lab-terrain-strength")
    );
    const radiusValue = document.getElementById("lab-terrain-radius-value");
    const strengthValue = document.getElementById("lab-terrain-strength-value");
    const colorInput = /** @type {HTMLInputElement | null} */ (
        document.getElementById("lab-terrain-color")
    );
    const paintColorInput = /** @type {HTMLInputElement | null} */ (
        document.getElementById("lab-terrain-paint-color")
    );
    const textureBtn = /** @type {HTMLButtonElement | null} */ (
        document.getElementById("btn-terrain-texture")
    );
    const realGroundBtn = /** @type {HTMLButtonElement | null} */ (
        document.getElementById("btn-terrain-real-ground")
    );
    const groundLayersEl = document.getElementById("lab-terrain-layers");
    const layerFileInput = /** @type {HTMLInputElement | null} */ (
        document.getElementById("lab-terrain-layer-input")
    );
    const orthoMixInput = /** @type {HTMLInputElement | null} */ (
        document.getElementById("lab-terrain-ortho-mix")
    );
    const orthoMixValue = document.getElementById("lab-terrain-ortho-mix-value");
    const showRoadsInput = /** @type {HTMLInputElement | null} */ (
        document.getElementById("lab-terrain-show-roads")
    );
    const osmBuildingsBtn = /** @type {HTMLButtonElement | null} */ (
        document.getElementById("btn-terrain-osm-buildings")
    );
    const textureInput = /** @type {HTMLInputElement | null} */ (
        document.getElementById("lab-terrain-texture-input")
    );
    const brushTextureBtn = /** @type {HTMLButtonElement | null} */ (
        document.getElementById("btn-terrain-brush-texture")
    );
    const brushTextureClearBtn = /** @type {HTMLButtonElement | null} */ (
        document.getElementById("btn-terrain-brush-texture-clear")
    );
    const brushTextureInput = /** @type {HTMLInputElement | null} */ (
        document.getElementById("lab-terrain-brush-texture-input")
    );
    const undoBtn = /** @type {HTMLButtonElement | null} */ (
        document.getElementById("btn-terrain-undo")
    );
    const redoBtn = /** @type {HTMLButtonElement | null} */ (
        document.getElementById("btn-terrain-redo")
    );
    const resetBtn = /** @type {HTMLButtonElement | null} */ (
        document.getElementById("btn-terrain-reset")
    );
    const textureTileInput = /** @type {HTMLInputElement | null} */ (
        document.getElementById("lab-terrain-texture-tile")
    );
    const textureTileValue = document.getElementById("lab-terrain-texture-tile-value");
    const paintTileInput = /** @type {HTMLInputElement | null} */ (
        document.getElementById("lab-terrain-paint-tile")
    );
    const paintTileValue = document.getElementById("lab-terrain-paint-tile-value");
    const paintIntensityInput = /** @type {HTMLInputElement | null} */ (
        document.getElementById("lab-terrain-paint-intensity")
    );
    const paintIntensityValue = document.getElementById("lab-terrain-paint-intensity-value");
    const normalBtn = /** @type {HTMLButtonElement | null} */ (
        document.getElementById("btn-terrain-normal")
    );
    const normalClearBtn = /** @type {HTMLButtonElement | null} */ (
        document.getElementById("btn-terrain-normal-clear")
    );
    const normalInput = /** @type {HTMLInputElement | null} */ (
        document.getElementById("lab-terrain-normal-input")
    );
    const brushNormalBtn = /** @type {HTMLButtonElement | null} */ (
        document.getElementById("btn-terrain-brush-normal")
    );
    const brushNormalClearBtn = /** @type {HTMLButtonElement | null} */ (
        document.getElementById("btn-terrain-brush-normal-clear")
    );
    const brushNormalInput = /** @type {HTMLInputElement | null} */ (
        document.getElementById("lab-terrain-brush-normal-input")
    );
    const normalScaleInput = /** @type {HTMLInputElement | null} */ (
        document.getElementById("lab-terrain-normal-scale")
    );
    const normalScaleValue = document.getElementById("lab-terrain-normal-scale-value");
    const modeButtons = [
        ...document.querySelectorAll("[data-terrain-mode]"),
    ].filter((node) => node instanceof HTMLButtonElement);

    /** @type {THREE.Mesh | null} */
    let terrain = null;
    /** @type {THREE.MeshStandardMaterial | null} */
    let material = null;
    /** @type {THREE.CanvasTexture | null} */
    let canvasTexture = null;
    /** Overlay peinture couleur (alpha) — paintCanvas. */
    /** @type {THREE.CanvasTexture | null} */
    let paintOverlayTexture = null;
    /** Masque alpha du pinceau texturé (tilage GPU). */
    /** @type {THREE.CanvasTexture | null} */
    let brushMaskTexture = null;
    /** Masque alpha des normales pinceau (paintNormalCanvas). */
    /** @type {THREE.CanvasTexture | null} */
    let paintNormalMaskTexture = null;
    /** @type {THREE.CanvasTexture | null} */
    let normalCanvasTexture = null;
    /** @type {THREE.Texture | null} */
    let baseGpuTexture = null;
    /** @type {THREE.Texture | null} */
    let baseNormalGpuTexture = null;
    /** @type {THREE.Texture | null} */
    let brushGpuTexture = null;
    /** @type {THREE.Texture | null} */
    let brushNormalGpuTexture = null;
    /** @type {CanvasImageSource | null} */
    let baseImage = null;
    let baseTextureDataUrl = null;
    let geoAlignedBase = false;
    /** @type {Record<string, { color: string, normal: string }>} */
    let layerUrls = {
        grass: { color: LAYER_DEFS.grass.color, normal: LAYER_DEFS.grass.normal },
        sand: { color: LAYER_DEFS.sand.color, normal: LAYER_DEFS.sand.normal },
        path: { color: LAYER_DEFS.path.color, normal: LAYER_DEFS.path.normal },
        rock: { color: LAYER_DEFS.rock.color, normal: LAYER_DEFS.rock.normal },
        road: { color: LAYER_DEFS.road.color, normal: LAYER_DEFS.road.normal },
    };
    let orthoMix = 1;
    let showRoads = true;
    let pendingLayerReplace = "";
    /** @type {{
     *   ortho: ImageData | null,
     *   roadMask: ImageData | null,
     *   splat: { color: ImageData, normal: ImageData } | null,
     *   osmElements: object[] | null,
     *   osmBbox: { south: number, west: number, north: number, east: number } | null,
     * }} */
    let groundCache = { ortho: null, roadMask: null, splat: null, osmElements: null, osmBbox: null };
    /** @type {CanvasImageSource | null} */
    let baseNormalImage = null;
    let baseNormalTextureDataUrl = null;
    /** @type {HTMLCanvasElement | null} */
    let brushTextureTile = null;
    /** @type {HTMLCanvasElement | null} */
    let brushNormalTile = null;
    let brushTextureDataUrl = null;
    let brushNormalTextureDataUrl = null;
    let normalScale = DEFAULT_NORMAL_SCALE;
    let editing = false;
    let dragging = false;
    let mode = "mound";
    let radius = Number(radiusInput?.value) || 3;
    let strength = Number(strengthInput?.value) || 0.2;
    let baseColor = colorInput?.value || "#455838";
    let textureTile = Math.max(
        TEXTURE_TILE_MIN,
        Number(textureTileInput?.value) || 8
    );
    let paintTextureTile = Math.max(
        TEXTURE_TILE_MIN,
        Number(paintTileInput?.value) || DEFAULT_TEXTURE_TILE
    );
    let paintIntensity = Number(paintIntensityInput?.value) || 1;

    const displayCanvas = document.createElement("canvas");
    displayCanvas.width = PAINT_SIZE;
    displayCanvas.height = PAINT_SIZE;
    const displayCtx = displayCanvas.getContext("2d", { alpha: false });
    const paintCanvas = document.createElement("canvas");
    paintCanvas.width = PAINT_SIZE;
    paintCanvas.height = PAINT_SIZE;
    const paintCtx = paintCanvas.getContext("2d", { alpha: true });
    /** Masque alpha des coups de pinceau texturé (la texture est tilée en GPU). */
    const brushMaskCanvas = document.createElement("canvas");
    brushMaskCanvas.width = PAINT_SIZE;
    brushMaskCanvas.height = PAINT_SIZE;
    const brushMaskCtx = brushMaskCanvas.getContext("2d", { alpha: true });
    const displayNormalCanvas = document.createElement("canvas");
    displayNormalCanvas.width = PAINT_SIZE;
    displayNormalCanvas.height = PAINT_SIZE;
    const displayNormalCtx = displayNormalCanvas.getContext("2d", { alpha: false });
    const paintNormalCanvas = document.createElement("canvas");
    paintNormalCanvas.width = PAINT_SIZE;
    paintNormalCanvas.height = PAINT_SIZE;
    const paintNormalCtx = paintNormalCanvas.getContext("2d", { alpha: true });
    if (displayCtx) displayCtx.imageSmoothingEnabled = true;
    if (displayNormalCtx) displayNormalCtx.imageSmoothingEnabled = false;
    if (paintCtx) {
        paintCtx.imageSmoothingEnabled = false;
        paintCtx.globalCompositeOperation = "source-over";
    }
    if (brushMaskCtx) {
        brushMaskCtx.imageSmoothingEnabled = false;
        brushMaskCtx.globalCompositeOperation = "source-over";
    }
    if (paintNormalCtx) {
        paintNormalCtx.imageSmoothingEnabled = false;
        paintNormalCtx.globalCompositeOperation = "source-over";
    }

    /** Texture 1×1 transparente pour samplers GPU inutilisés. */
    const emptyMaskTexture = (() => {
        const c = document.createElement("canvas");
        c.width = 1;
        c.height = 1;
        const t = new THREE.CanvasTexture(c);
        t.needsUpdate = true;
        return t;
    })();
    /** Texture 1×1 blanche. */
    const whitePixelTexture = (() => {
        const c = document.createElement("canvas");
        c.width = 1;
        c.height = 1;
        const ctx = c.getContext("2d");
        if (ctx) {
            ctx.fillStyle = "#ffffff";
            ctx.fillRect(0, 0, 1, 1);
        }
        const t = new THREE.CanvasTexture(c);
        if ("colorSpace" in t) t.colorSpace = THREE.SRGBColorSpace;
        else t.encoding = THREE.sRGBEncoding;
        t.needsUpdate = true;
        return t;
    })();
    /** Normal plate 1×1. */
    const flatNormalPixelTexture = (() => {
        const c = document.createElement("canvas");
        c.width = 1;
        c.height = 1;
        const ctx = c.getContext("2d");
        if (ctx) {
            ctx.fillStyle = FLAT_NORMAL_COLOR;
            ctx.fillRect(0, 0, 1, 1);
        }
        const t = new THREE.CanvasTexture(c);
        if ("colorSpace" in t) t.colorSpace = THREE.NoColorSpace;
        else t.encoding = THREE.LinearEncoding;
        t.needsUpdate = true;
        return t;
    })();

    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    const localPoint = new THREE.Vector3();
    const brushRing = new THREE.Mesh(
        new THREE.RingGeometry(0.92, 1, 64),
        new THREE.MeshBasicMaterial({
            color: 0x22d3ee,
            transparent: true,
            opacity: 0.8,
            side: THREE.DoubleSide,
            depthWrite: false,
        })
    );
    brushRing.rotation.x = -Math.PI / 2;
    brushRing.renderOrder = 1000;
    brushRing.visible = false;
    scene.add(brushRing);

    /** @type {{ heights: Float32Array, paint: string, paintNormal: string }[]} */
    const undoStack = [];
    /** @type {{ heights: Float32Array, paint: string, paintNormal: string }[]} */
    const redoStack = [];
    let paintNormalUsed = false;
    let brushMaskUsed = false;
    let strokeBefore = null;
    let lastPaintX = null;
    let lastPaintY = null;
    let undoInProgress = false;

    function updateHistoryUi() {
        if (undoBtn) undoBtn.disabled = undoStack.length === 0;
        if (redoBtn) redoBtn.disabled = redoStack.length === 0;
    }

    function getMaxAnisotropy() {
        return Math.min(16, renderer.capabilities.getMaxAnisotropy?.() || 1);
    }

    /**
     * Texture GPU tilable (mipmaps + anisotropie) — nette de près même à fort tile.
     * @param {CanvasImageSource} source
     * @param {{ normal?: boolean, geoAligned?: boolean }} [opts]
     */
    function createGpuTileTexture(source, { normal = false, geoAligned = false } = {}) {
        const maxTex = Math.min(
            BASE_TEXTURE_GPU_SIZE,
            renderer.capabilities.maxTextureSize || BASE_TEXTURE_GPU_SIZE
        );
        const tileCanvas = prepareTileSource(source, maxTex);
        const tex = new THREE.CanvasTexture(tileCanvas);
        if (geoAligned) {
            tex.wrapS = THREE.ClampToEdgeWrapping;
            tex.wrapT = THREE.ClampToEdgeWrapping;
            tex.repeat.set(1, 1);
            // Nord en haut + UV v = nord géographique (−Z) : flipY true.
            tex.flipY = true;
        } else {
            tex.wrapS = THREE.RepeatWrapping;
            tex.wrapT = THREE.RepeatWrapping;
        }
        tex.generateMipmaps = true;
        tex.minFilter = THREE.LinearMipmapLinearFilter;
        tex.magFilter = THREE.LinearFilter;
        tex.anisotropy = getMaxAnisotropy();
        if (normal) {
            if ("colorSpace" in tex) tex.colorSpace = THREE.NoColorSpace;
            else tex.encoding = THREE.LinearEncoding;
        } else if ("colorSpace" in tex) {
            tex.colorSpace = THREE.SRGBColorSpace;
        } else {
            tex.encoding = THREE.sRGBEncoding;
        }
        tex.needsUpdate = true;
        return tex;
    }

    function disposeBaseGpuTextures() {
        baseGpuTexture?.dispose();
        baseGpuTexture = null;
        baseNormalGpuTexture?.dispose();
        baseNormalGpuTexture = null;
    }

    function disposeBrushGpuTextures() {
        brushGpuTexture?.dispose();
        brushGpuTexture = null;
        brushNormalGpuTexture?.dispose();
        brushNormalGpuTexture = null;
    }

    function syncPaintOverlayUniform() {
        const shader = material?.userData?.terrainShader;
        if (!shader?.uniforms) return;
        const paintRepeat = Math.max(TERRAIN_PAINT_TEXTURE_TILE_MIN, paintTextureTile);
        shader.uniforms.uTerrainPaintMap.value = paintOverlayTexture || emptyMaskTexture;
        shader.uniforms.uTerrainBrushMask.value = brushMaskTexture || emptyMaskTexture;
        shader.uniforms.uTerrainBrushMap.value = brushGpuTexture || whitePixelTexture;
        shader.uniforms.uTerrainHasBrushMap.value = brushGpuTexture ? 1 : 0;
        shader.uniforms.uTerrainPaintRepeat.value = paintRepeat;
        shader.uniforms.uTerrainBrushNormalMask.value = paintNormalMaskTexture || emptyMaskTexture;
        shader.uniforms.uTerrainBrushNormalMap.value = brushNormalGpuTexture || flatNormalPixelTexture;
        shader.uniforms.uTerrainHasBrushNormal.value = brushNormalGpuTexture && paintNormalUsed ? 1 : 0;
        shader.uniforms.uTerrainBrushNormalScale.value = normalScale;
    }

    /**
     * Sol = map Three.js native (tuilage + mipmaps).
     * Peinture couleur = overlay alpha.
     * Pinceau texturé = masque alpha + texture GPU tilée (nette de près).
     */
    function patchTerrainMaterial(mat) {
        mat.onBeforeCompile = (shader) => {
            const paintRepeat = Math.max(TERRAIN_PAINT_TEXTURE_TILE_MIN, paintTextureTile);
            shader.uniforms.uTerrainPaintMap = { value: paintOverlayTexture || emptyMaskTexture };
            shader.uniforms.uTerrainBrushMask = { value: brushMaskTexture || emptyMaskTexture };
            shader.uniforms.uTerrainBrushMap = { value: brushGpuTexture || whitePixelTexture };
            shader.uniforms.uTerrainHasBrushMap = { value: brushGpuTexture ? 1 : 0 };
            shader.uniforms.uTerrainPaintRepeat = { value: paintRepeat };
            shader.uniforms.uTerrainBrushNormalMask = { value: paintNormalMaskTexture || emptyMaskTexture };
            shader.uniforms.uTerrainBrushNormalMap = {
                value: brushNormalGpuTexture || flatNormalPixelTexture,
            };
            shader.uniforms.uTerrainHasBrushNormal = {
                value: brushNormalGpuTexture && paintNormalUsed ? 1 : 0,
            };
            shader.uniforms.uTerrainBrushNormalScale = { value: normalScale };

            shader.vertexShader = shader.vertexShader.replace(
                "#include <uv_vertex>",
                "#include <uv_vertex>\n\t#ifdef USE_UV\n\t\tvTerrainPaintUv = uv;\n\t#endif"
            );
            shader.vertexShader = shader.vertexShader.replace(
                "#include <common>",
                /* glsl */ `
                #include <common>
                varying vec2 vTerrainPaintUv;
                `
            );
            shader.fragmentShader = shader.fragmentShader.replace(
                "#include <common>",
                /* glsl */ `
                #include <common>
                uniform sampler2D uTerrainPaintMap;
                uniform sampler2D uTerrainBrushMask;
                uniform sampler2D uTerrainBrushMap;
                uniform float uTerrainHasBrushMap;
                uniform float uTerrainPaintRepeat;
                uniform sampler2D uTerrainBrushNormalMask;
                uniform sampler2D uTerrainBrushNormalMap;
                uniform float uTerrainHasBrushNormal;
                uniform float uTerrainBrushNormalScale;
                varying vec2 vTerrainPaintUv;
                `
            );
            if (shader.fragmentShader.includes("#include <map_fragment>")) {
                shader.fragmentShader = shader.fragmentShader.replace(
                    "#include <map_fragment>",
                    /* glsl */ `
                    #include <map_fragment>
                    {
                      if ( uTerrainHasBrushMap > 0.5 ) {
                        float brushMask = texture2D( uTerrainBrushMask, vTerrainPaintUv ).a;
                        vec4 brushSample = texture2D( uTerrainBrushMap, vTerrainPaintUv * uTerrainPaintRepeat );
                        brushSample = mapTexelToLinear( brushSample );
                        diffuseColor.rgb = mix( diffuseColor.rgb, brushSample.rgb, brushMask );
                      }
                      vec4 terrainPaint = texture2D( uTerrainPaintMap, vTerrainPaintUv );
                      terrainPaint = mapTexelToLinear( terrainPaint );
                      diffuseColor.rgb = mix( diffuseColor.rgb, terrainPaint.rgb, terrainPaint.a );
                    }
                    `
                );
            }
            if (shader.fragmentShader.includes("#include <normal_fragment_maps>")) {
                shader.fragmentShader = shader.fragmentShader.replace(
                    "#include <normal_fragment_maps>",
                    /* glsl */ `
                    #include <normal_fragment_maps>
                    if ( uTerrainHasBrushNormal > 0.5 ) {
                      float nMask = texture2D( uTerrainBrushNormalMask, vTerrainPaintUv ).a;
                      vec3 mapN = texture2D( uTerrainBrushNormalMap, vTerrainPaintUv * uTerrainPaintRepeat ).xyz * 2.0 - 1.0;
                      mapN.xy *= uTerrainBrushNormalScale;
                      normal = normalize( mix( normal, normalize( normal + mapN ), nMask ) );
                    }
                    `
                );
            }
            mat.userData.terrainShader = shader;
        };
        const prevKey = mat.customProgramCacheKey?.bind(mat);
        mat.customProgramCacheKey = () => `${prevKey?.() || ""}_labTerrainPaintV4`;
        mat.needsUpdate = true;
    }

    function applyBaseMapToMaterial() {
        if (!material) return;
        const tile = Math.max(TEXTURE_TILE_MIN, textureTile);
        if (baseGpuTexture) {
            if (geoAlignedBase) {
                baseGpuTexture.repeat.set(1, 1);
                baseGpuTexture.wrapS = THREE.ClampToEdgeWrapping;
                baseGpuTexture.wrapT = THREE.ClampToEdgeWrapping;
            } else {
                baseGpuTexture.repeat.set(tile, tile);
            }
            baseGpuTexture.offset.set(0, 0);
            baseGpuTexture.needsUpdate = true;
            material.map = baseGpuTexture;
            if (geoAlignedBase) {
                material.color.set("#ffffff");
            } else {
                const tint = new THREE.Color(baseColor);
                tint.lerp(new THREE.Color(0xffffff), 0.72);
                material.color.copy(tint);
            }
        } else if (canvasTexture) {
            canvasTexture.repeat.set(1, 1);
            canvasTexture.offset.set(0, 0);
            material.map = canvasTexture;
            material.color.set("#ffffff");
        }
        material.needsUpdate = true;
    }

    function renderTerrainTexture() {
        if (!displayCtx || !paintCtx) return;
        if (!baseGpuTexture) {
            displayCtx.fillStyle = baseColor;
            displayCtx.fillRect(0, 0, PAINT_SIZE, PAINT_SIZE);
            if (canvasTexture) canvasTexture.needsUpdate = true;
        }
        if (paintOverlayTexture) paintOverlayTexture.needsUpdate = true;
        if (brushMaskTexture) brushMaskTexture.needsUpdate = true;
        applyBaseMapToMaterial();
        syncPaintOverlayUniform();
        renderTerrainNormalMap();
    }

    function renderTerrainNormalMap() {
        if (!displayNormalCtx || !paintNormalCtx) return;
        if (!brushNormalGpuTexture) {
            displayNormalCtx.fillStyle = FLAT_NORMAL_COLOR;
            displayNormalCtx.fillRect(0, 0, PAINT_SIZE, PAINT_SIZE);
            displayNormalCtx.drawImage(paintNormalCanvas, 0, 0);
            if (normalCanvasTexture) normalCanvasTexture.needsUpdate = true;
        }
        if (paintNormalMaskTexture) paintNormalMaskTexture.needsUpdate = true;
        if (brushMaskTexture) brushMaskTexture.needsUpdate = true;
        syncTerrainNormalMaterial();
        syncPaintOverlayUniform();
    }

    function syncTerrainSceneItem() {
        if (!sceneRegistry || !terrain) return;
        sceneRegistry.unregister(TERRAIN_SCENE_ITEM_ID);
        sceneRegistry.register({
            id: TERRAIN_SCENE_ITEM_ID,
            label: "Terrain",
            category: "environment",
            icon: "env",
            detail: formatGridSizeMeters(sizeMeters),
            getVisible: () => terrain.visible,
            setVisible: (visible) => {
                if (terrain) terrain.visible = visible;
            },
            select: () => {
                if (terrain) focusOnTerrain?.(terrain);
            },
            getShadow: () => getObjectShadowEnabled(terrain),
            setShadow: (enabled) => {
                setObjectShadowEnabled(terrain, enabled);
            },
            getShadowOpacity: () => getObjectShadowOpacity(terrain),
            setShadowOpacity: (value) => {
                setObjectShadowOpacity(terrain, value);
            },
            canDelete: () => true,
            onDelete: () => {
                clear({ recordHistory: true });
            },
        });
    }

    function markHeightMapDirty() {
        heightMapDirty = true;
    }

    function disposeHeightTexture() {
        heightTexture?.dispose();
        heightTexture = null;
        heightTextureData = null;
        heightMapDirty = true;
    }

    /**
     * Heightmap pour l’océan (écume / bords littoraux).
     * @returns {{ texture: THREE.DataTexture, size: number, yOffset: number, hMin: number, hMax: number } | null}
     */
    function getHeightMapInfo() {
        if (!terrain) return null;
        if (heightMapDirty) rebuildHeightMap();
        if (!heightTexture) return null;
        return {
            texture: heightTexture,
            size: sizeMeters,
            yOffset: terrain.position.y,
            hMin: SCULPT_HEIGHT_MIN,
            hMax: SCULPT_HEIGHT_MAX,
        };
    }

    function rebuildHeightMap() {
        if (!terrain) {
            disposeHeightTexture();
            return;
        }
        const res = HEIGHT_MAP_RES();
        const byteLen = res * res * 3;
        if (!heightTextureData || heightTextureData.length !== byteLen) {
            heightTextureData = new Uint8Array(byteLen);
            heightTexture?.dispose();
            heightTexture = new THREE.DataTexture(heightTextureData, res, res, THREE.RGBFormat);
            heightTexture.magFilter = THREE.LinearFilter;
            heightTexture.minFilter = THREE.LinearFilter;
            heightTexture.wrapS = THREE.ClampToEdgeWrapping;
            heightTexture.wrapT = THREE.ClampToEdgeWrapping;
            heightTexture.flipY = false;
            heightTexture.generateMipmaps = false;
            heightTexture.needsUpdate = true;
        }
        heightTextureData.fill(0);
        const positions = terrain.geometry.attributes.position;
        const span = SCULPT_HEIGHT_MAX - SCULPT_HEIGHT_MIN || 1;
        const half = sizeMeters * 0.5;
        const maxIndex = res - 1;
        for (let i = 0; i < positions.count; i += 1) {
            const x = positions.getX(i);
            const z = positions.getZ(i);
            const h = positions.getY(i);
            const ix = THREE.MathUtils.clamp(Math.round(((x + half) / sizeMeters) * maxIndex), 0, maxIndex);
            const iz = THREE.MathUtils.clamp(Math.round(((z + half) / sizeMeters) * maxIndex), 0, maxIndex);
            const enc = Math.round(
                THREE.MathUtils.clamp((h - SCULPT_HEIGHT_MIN) / span, 0, 1) * 255
            );
            const o = (iz * res + ix) * 3;
            heightTextureData[o] = enc;
            heightTextureData[o + 1] = enc;
            heightTextureData[o + 2] = enc;
        }
        // Flou 3×3 pour adoucir la ligne d’eau océan / lit.
        const blurred = new Uint8Array(byteLen);
        for (let iz = 0; iz < res; iz += 1) {
            for (let ix = 0; ix < res; ix += 1) {
                let sum = 0;
                let n = 0;
                for (let dz = -1; dz <= 1; dz += 1) {
                    for (let dx = -1; dx <= 1; dx += 1) {
                        const x2 = THREE.MathUtils.clamp(ix + dx, 0, maxIndex);
                        const z2 = THREE.MathUtils.clamp(iz + dz, 0, maxIndex);
                        sum += heightTextureData[(z2 * res + x2) * 3];
                        n += 1;
                    }
                }
                const v = Math.round(sum / n);
                const o = (iz * res + ix) * 3;
                blurred[o] = v;
                blurred[o + 1] = v;
                blurred[o + 2] = v;
            }
        }
        heightTextureData.set(blurred);
        heightTexture.needsUpdate = true;
        heightMapDirty = false;
    }

    /**
     * @param {number} worldX
     * @param {number} worldZ
     */
    function sampleTerrainY(worldX, worldZ) {
        if (!terrain) return 0;
        const segs = terrain.userData.terrainSegments || meshSegments;
        const size = terrain.userData.terrainSize || sizeMeters;
        const half = size * 0.5;
        const u = THREE.MathUtils.clamp((worldX + half) / size, 0, 1);
        const v = THREE.MathUtils.clamp((worldZ + half) / size, 0, 1);
        const fx = u * segs;
        const fz = v * segs;
        const i0 = Math.floor(fx);
        const j0 = Math.floor(fz);
        const i1 = Math.min(segs, i0 + 1);
        const j1 = Math.min(segs, j0 + 1);
        const tx = fx - i0;
        const tz = fz - j0;
        const pos = terrain.geometry.attributes.position;
        const row = segs + 1;
        const y00 = pos.getY(j0 * row + i0);
        const y10 = pos.getY(j0 * row + i1);
        const y01 = pos.getY(j1 * row + i0);
        const y11 = pos.getY(j1 * row + i1);
        return (
            y00 * (1 - tx) * (1 - tz) +
            y10 * tx * (1 - tz) +
            y01 * (1 - tx) * tz +
            y11 * tx * tz
        );
    }

    function syncSizeUi() {
        if (sizeInput) sizeInput.value = String(sizeMeters);
        if (sizeValue) sizeValue.textContent = `${formatNumber(sizeMeters, 0)} m`;
    }

    function updateTerrainGridLevel() {
        if (!gridHelper) return;
        // Grille fixe à ~0 m : le niveau 0 du terrain reste aligné sur la grille.
        gridHelper.position.y = 0.02;
        gridHelper.renderOrder = 20;
    }

    /** @type {HTMLElement | null} */
    let ignLoadingEl = null;

    function setIgnLoading(active, message = "", progress = null) {
        const viewport =
            document.getElementById("lab-viewport") ||
            renderer.domElement.closest("#lab-viewport");
        if (!viewport) return;
        if (!ignLoadingEl) {
            ignLoadingEl = document.createElement("div");
            ignLoadingEl.className = "lab-ign-loading";
            ignLoadingEl.hidden = true;
            ignLoadingEl.innerHTML = `
                <div class="lab-ign-loading__panel" role="status" aria-live="polite">
                    <div class="lab-ign-loading__hourglass" aria-hidden="true">⏳</div>
                    <p class="lab-ign-loading__msg"></p>
                    <progress class="lab-ign-loading__bar" max="100" value="0"></progress>
                </div>`;
            viewport.appendChild(ignLoadingEl);
        }
        ignLoadingEl.hidden = !active;
        if (!active) return;
        const msgEl = ignLoadingEl.querySelector(".lab-ign-loading__msg");
        const barEl = /** @type {HTMLProgressElement | null} */ (
            ignLoadingEl.querySelector(".lab-ign-loading__bar")
        );
        if (msgEl) msgEl.textContent = message;
        if (barEl) {
            if (typeof progress === "number" && Number.isFinite(progress)) {
                barEl.hidden = false;
                barEl.value = Math.round(Math.max(0, Math.min(1, progress)) * 100);
            } else {
                barEl.hidden = true;
            }
        }
    }

    function frameTerrainView(overview = false) {
        if (terrain) focusOnTerrain?.(terrain, overview ? { overview: true } : undefined);
    }

    function syncTerrainNormalMaterial() {
        if (!material) return;
        const tile = Math.max(TEXTURE_TILE_MIN, textureTile);
        if (baseNormalGpuTexture) {
            if (geoAlignedBase) {
                baseNormalGpuTexture.repeat.set(1, 1);
                baseNormalGpuTexture.wrapS = THREE.ClampToEdgeWrapping;
                baseNormalGpuTexture.wrapT = THREE.ClampToEdgeWrapping;
            } else {
                baseNormalGpuTexture.repeat.set(tile, tile);
            }
            baseNormalGpuTexture.offset.set(0, 0);
            material.normalMap = baseNormalGpuTexture;
            material.normalScale.set(normalScale, normalScale);
        } else if (normalCanvasTexture && paintNormalUsed && !brushNormalGpuTexture) {
            normalCanvasTexture.repeat.set(1, 1);
            material.normalMap = normalCanvasTexture;
            material.normalScale.set(normalScale, normalScale);
        } else {
            material.normalMap = null;
            material.normalScale.set(1, 1);
        }
        material.needsUpdate = true;
    }

    function createTerrainGeometry() {
        const geometry = new THREE.PlaneGeometry(sizeMeters, sizeMeters, meshSegments, meshSegments);
        geometry.rotateX(-Math.PI / 2);
        return geometry;
    }

    /**
     * Maillage terrain avec relief IGN (hauteur sur Z avant rotateX → axe Y monde).
     * @param {number[]} meshHeights
     * @param {number} [segments]
     * @param {number} [terrainSize]
     */
    function buildIgnTerrainGeometry(meshHeights, segments = meshSegments, terrainSize = sizeMeters) {
        const geometry = new THREE.PlaneGeometry(terrainSize, terrainSize, segments, segments);
        geometry.rotateX(-Math.PI / 2);
        applyMeshHeightsToTerrainPositions(
            geometry.attributes.position,
            meshHeights,
            terrainSize,
            segments
        );
        geometry.attributes.position.needsUpdate = true;
        applyTerrainGeoUVs(geometry, terrainSize);
        geometry.computeVertexNormals();
        geometry.computeBoundingSphere();
        geometry.computeBoundingBox();
        return geometry;
    }

    /**
     * @param {{ recordHistory?: boolean }} [opts]
     */
    function makeTerrain({ recordHistory = true } = {}) {
        if (terrain) return terrain;
        meshSegments = segmentsForTerrainSize(sizeMeters);
        const geometry = createTerrainGeometry();
        geometry.computeVertexNormals();
        canvasTexture = new THREE.CanvasTexture(displayCanvas);
        canvasTexture.wrapS = THREE.ClampToEdgeWrapping;
        canvasTexture.wrapT = THREE.ClampToEdgeWrapping;
        canvasTexture.generateMipmaps = true;
        canvasTexture.minFilter = THREE.LinearMipmapLinearFilter;
        canvasTexture.magFilter = THREE.LinearFilter;
        canvasTexture.anisotropy = getMaxAnisotropy();
        if ("colorSpace" in canvasTexture) canvasTexture.colorSpace = THREE.SRGBColorSpace;
        else canvasTexture.encoding = THREE.sRGBEncoding;
        paintOverlayTexture = new THREE.CanvasTexture(paintCanvas);
        paintOverlayTexture.wrapS = THREE.ClampToEdgeWrapping;
        paintOverlayTexture.wrapT = THREE.ClampToEdgeWrapping;
        paintOverlayTexture.generateMipmaps = true;
        paintOverlayTexture.minFilter = THREE.LinearMipmapLinearFilter;
        paintOverlayTexture.magFilter = THREE.LinearFilter;
        paintOverlayTexture.anisotropy = getMaxAnisotropy();
        if ("colorSpace" in paintOverlayTexture) paintOverlayTexture.colorSpace = THREE.SRGBColorSpace;
        else paintOverlayTexture.encoding = THREE.sRGBEncoding;
        brushMaskTexture = new THREE.CanvasTexture(brushMaskCanvas);
        brushMaskTexture.wrapS = THREE.ClampToEdgeWrapping;
        brushMaskTexture.wrapT = THREE.ClampToEdgeWrapping;
        brushMaskTexture.generateMipmaps = true;
        brushMaskTexture.minFilter = THREE.LinearMipmapLinearFilter;
        brushMaskTexture.magFilter = THREE.LinearFilter;
        brushMaskTexture.anisotropy = getMaxAnisotropy();
        if ("colorSpace" in brushMaskTexture) brushMaskTexture.colorSpace = THREE.NoColorSpace;
        else brushMaskTexture.encoding = THREE.LinearEncoding;
        normalCanvasTexture = new THREE.CanvasTexture(displayNormalCanvas);
        normalCanvasTexture.wrapS = THREE.ClampToEdgeWrapping;
        normalCanvasTexture.wrapT = THREE.ClampToEdgeWrapping;
        normalCanvasTexture.generateMipmaps = false;
        normalCanvasTexture.minFilter = THREE.LinearFilter;
        normalCanvasTexture.magFilter = THREE.LinearFilter;
        if ("colorSpace" in normalCanvasTexture) {
            normalCanvasTexture.colorSpace = THREE.NoColorSpace;
        } else {
            normalCanvasTexture.encoding = THREE.LinearEncoding;
        }
        paintNormalMaskTexture = new THREE.CanvasTexture(paintNormalCanvas);
        paintNormalMaskTexture.wrapS = THREE.ClampToEdgeWrapping;
        paintNormalMaskTexture.wrapT = THREE.ClampToEdgeWrapping;
        paintNormalMaskTexture.generateMipmaps = true;
        paintNormalMaskTexture.minFilter = THREE.LinearMipmapLinearFilter;
        paintNormalMaskTexture.magFilter = THREE.LinearFilter;
        if ("colorSpace" in paintNormalMaskTexture) {
            paintNormalMaskTexture.colorSpace = THREE.NoColorSpace;
        } else {
            paintNormalMaskTexture.encoding = THREE.LinearEncoding;
        }
        material = new THREE.MeshStandardMaterial({
            map: canvasTexture,
            color: 0xffffff,
            roughness: 0.95,
            metalness: 0,
            side: THREE.DoubleSide,
        });
        patchTerrainMaterial(material);
        terrain = new THREE.Mesh(geometry, material);
        terrain.name = "lab-terrain";
        terrain.position.y = 0;
        terrain.userData[LAB_TERRAIN_KEY] = true;
        terrain.userData.terrainSegments = meshSegments;
        terrain.userData.terrainSize = sizeMeters;
        terrain.userData[COLLISION_KEY] = true;
        scene.add(terrain);
        clearSkybox?.();
        clearOcean?.();
        setObjectShadowEnabled(terrain, true);
        registerCollidable(terrain);
        markHeightMapDirty();
        coverFloor(true);
        setWorldSize?.(sizeMeters);
        renderTerrainTexture();
        updateTerrainGridLevel();
        syncTerrainSceneItem();
        syncSizeUi();
        tools?.removeAttribute("hidden");
        updateCreateButton();
        updateHistoryUi();
        if (recordHistory) {
            pushSceneHistory?.({ type: "terrain", before: null, after: serialize() });
        }
        return terrain;
    }

    function updateCreateButton() {
        if (!createBtn) return;
        if (!terrain) {
            createBtn.classList.remove("is-active");
            createBtn.querySelector(".lab-side-panel__tool-label").textContent =
                "Créer sur toute la grille";
            return;
        }
        createBtn.classList.toggle("is-active", editing);
        createBtn.querySelector(".lab-side-panel__tool-label").textContent = editing
            ? "Terminer l’édition"
            : "Modifier le terrain";
    }

    function setEditing(active) {
        editing = !!active && !!terrain;
        dragging = false;
        resetPaintStroke();
        brushRing.visible = false;
        setTerrainSculptModeActive?.(editing);
        renderer.domElement.classList.toggle("lab-terrain-editing", editing);
        updateCreateButton();
    }

    function setMode(nextMode) {
        mode = nextMode;
        modeButtons.forEach((button) => {
            button.classList.toggle("is-active", button.dataset.terrainMode === mode);
        });
    }

    function setPointer(event) {
        const rect = renderer.domElement.getBoundingClientRect();
        pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
        raycaster.setFromCamera(pointer, camera);
    }

    function hitTerrain(event) {
        if (!terrain) return null;
        setPointer(event);
        return raycaster.intersectObject(terrain, false)[0] || null;
    }

    function captureState() {
        if (!terrain || !paintCtx) return null;
        const positions = terrain.geometry.attributes.position;
        const heights = new Float32Array(positions.count);
        for (let i = 0; i < positions.count; i += 1) heights[i] = positions.getY(i);
        return {
            heights,
            paint: paintCanvas.toDataURL("image/png"),
            paintNormal: paintNormalCanvas.toDataURL("image/png"),
            brushMask: brushMaskCanvas.toDataURL("image/png"),
        };
    }

    function restoreBrushMask(dataUrl) {
        if (!brushMaskCtx) return Promise.resolve();
        brushMaskCtx.clearRect(0, 0, PAINT_SIZE, PAINT_SIZE);
        brushMaskUsed = false;
        if (!dataUrl || dataUrl === "data:,") {
            if (brushMaskTexture) brushMaskTexture.needsUpdate = true;
            renderTerrainTexture();
            return Promise.resolve();
        }
        return new Promise((resolve) => {
            const image = new Image();
            image.onload = () => {
                brushMaskCtx.imageSmoothingEnabled = false;
                brushMaskCtx.clearRect(0, 0, PAINT_SIZE, PAINT_SIZE);
                brushMaskCtx.drawImage(image, 0, 0, PAINT_SIZE, PAINT_SIZE);
                brushMaskUsed = true;
                if (brushMaskTexture) brushMaskTexture.needsUpdate = true;
                renderTerrainTexture();
                resolve();
            };
            image.onerror = () => resolve();
            image.src = dataUrl;
        });
    }

    function restorePaintNormal(dataUrl) {
        if (!paintNormalCtx) return Promise.resolve();
        paintNormalCtx.clearRect(0, 0, PAINT_SIZE, PAINT_SIZE);
        paintNormalUsed = false;
        if (!dataUrl || dataUrl === "data:,") {
            renderTerrainTexture();
            return Promise.resolve();
        }
        return new Promise((resolve) => {
            const image = new Image();
            image.onload = () => {
                paintNormalCtx.imageSmoothingEnabled = false;
                paintNormalCtx.clearRect(0, 0, PAINT_SIZE, PAINT_SIZE);
                paintNormalCtx.drawImage(image, 0, 0, PAINT_SIZE, PAINT_SIZE);
                paintNormalUsed = true;
                renderTerrainTexture();
                resolve();
            };
            image.onerror = () => resolve();
            image.src = dataUrl;
        });
    }

    function restorePaint(dataUrl) {
        if (!paintCtx) return Promise.resolve();
        paintCtx.clearRect(0, 0, PAINT_SIZE, PAINT_SIZE);
        if (!dataUrl || dataUrl === "data:,") {
            renderTerrainTexture();
            return Promise.resolve();
        }
        return new Promise((resolve) => {
            const image = new Image();
            image.onload = () => {
                paintCtx.imageSmoothingEnabled = false;
                paintCtx.clearRect(0, 0, PAINT_SIZE, PAINT_SIZE);
                paintCtx.drawImage(image, 0, 0, PAINT_SIZE, PAINT_SIZE);
                renderTerrainTexture();
                resolve();
            };
            image.onerror = () => resolve();
            image.src = dataUrl;
        });
    }

    function pushHistoryState() {
        const state = captureState();
        if (!state) return;
        state.at = Date.now();
        undoStack.push(state);
        if (undoStack.length > MAX_HISTORY) undoStack.shift();
        redoStack.length = 0;
        updateHistoryUi();
    }

    async function restoreState(state) {
        if (!terrain || !state) return;
        const positions = terrain.geometry.attributes.position;
        const count = Math.min(positions.count, state.heights.length);
        for (let i = 0; i < count; i += 1) positions.setY(i, state.heights[i]);
        positions.needsUpdate = true;
        terrain.geometry.attributes.position.needsUpdate = true;
        terrain.geometry.computeVertexNormals();
        terrain.geometry.computeBoundingSphere();
        terrain.geometry.computeBoundingBox();
        await restorePaint(state.paint);
        await restorePaintNormal(state.paintNormal || null);
        await restoreBrushMask(state.brushMask || null);
        updateTerrainGridLevel();
        markHeightMapDirty();
        syncTerrainSceneItem();
    }

    async function performTerrainUndo() {
        if (undoInProgress || !terrain || undoStack.length === 0) return false;
        undoInProgress = true;
        try {
            const current = captureState();
            const previous = undoStack.pop();
            if (current) {
                // L’entrée redo garde l’horodatage de l’action annulée : c’est
                // lui qui sert à l’arbitrage chronologique scène / terrain.
                current.at = previous?.at ?? Date.now();
                redoStack.push(current);
            }
            await restoreState(previous);
            updateHistoryUi();
            return true;
        } finally {
            undoInProgress = false;
        }
    }

    async function performTerrainRedo() {
        if (undoInProgress || !terrain || redoStack.length === 0) return false;
        undoInProgress = true;
        try {
            const current = captureState();
            const next = redoStack.pop();
            if (current) {
                current.at = next?.at ?? Date.now();
                undoStack.push(current);
            }
            await restoreState(next);
            updateHistoryUi();
            return true;
        } finally {
            undoInProgress = false;
        }
    }

    function commitStroke() {
        if (!strokeBefore) return;
        strokeBefore.at = Date.now();
        undoStack.push(strokeBefore);
        if (undoStack.length > MAX_HISTORY) undoStack.shift();
        redoStack.length = 0;
        strokeBefore = null;
        markHeightMapDirty();
        updateHistoryUi();
    }

    function sculpt(hit) {
        if (!terrain) return;
        terrain.worldToLocal(localPoint.copy(hit.point));
        const positions = terrain.geometry.attributes.position;
        const affected = [];
        for (let i = 0; i < positions.count; i += 1) {
            const dx = positions.getX(i) - localPoint.x;
            const dz = positions.getZ(i) - localPoint.z;
            const distance = Math.hypot(dx, dz);
            if (distance > radius) continue;
            affected.push({ index: i, distance });
        }

        if (mode === "smooth") {
            const source = new Float32Array(positions.count);
            for (let i = 0; i < positions.count; i += 1) source[i] = positions.getY(i);
            const row = meshSegments + 1;
            for (const { index, distance } of affected) {
                const neighbors = [index - 1, index + 1, index - row, index + row]
                    .filter((value) => value >= 0 && value < positions.count);
                const average =
                    neighbors.reduce((sum, value) => sum + source[value], source[index]) /
                    (neighbors.length + 1);
                const falloff = 1 - distance / radius;
                positions.setY(
                    index,
                    THREE.MathUtils.lerp(source[index], average, strength * falloff)
                );
            }
        } else {
            for (const { index, distance } of affected) {
                const t = 1 - distance / radius;
                let falloff = t * t * (3 - 2 * t);
                let direction = 1;
                if (mode === "mound") {
                    const ratio = distance / radius;
                    falloff = Math.exp(-ratio * ratio * 3.8);
                } else if (mode === "basin") {
                    direction = -1;
                    const ratio = distance / radius;
                    falloff = Math.exp(-ratio * ratio * 3.2);
                } else if (mode === "mountain") {
                    falloff = Math.pow(t, 1.35);
                    const x = positions.getX(index);
                    const z = positions.getZ(index);
                    falloff *= 0.88 + 0.12 * Math.sin(x * 2.7 + z * 1.9);
                }
                const next = THREE.MathUtils.clamp(
                    positions.getY(index) + direction * strength * falloff,
                    SCULPT_HEIGHT_MIN,
                    SCULPT_HEIGHT_MAX
                );
                positions.setY(index, next);
            }
        }
        positions.needsUpdate = true;
        terrain.geometry.computeVertexNormals();
        terrain.geometry.computeBoundingSphere();
        terrain.geometry.computeBoundingBox();
        markHeightMapDirty();
    }

    /**
     * Distance XZ au polygone (segments).
     * @param {number} x
     * @param {number} z
     * @param {{ x: number, z: number }[]} path
     */
    function distToPathXZ(x, z, path) {
        let best = Infinity;
        for (let i = 0; i < path.length - 1; i += 1) {
            const ax = path[i].x;
            const az = path[i].z;
            const bx = path[i + 1].x;
            const bz = path[i + 1].z;
            const abx = bx - ax;
            const abz = bz - az;
            const len2 = abx * abx + abz * abz;
            let t = len2 < 1e-10 ? 0 : ((x - ax) * abx + (z - az) * abz) / len2;
            t = Math.max(0, Math.min(1, t));
            const dx = x - (ax + abx * t);
            const dz = z - (az + abz * t);
            const d = Math.hypot(dx, dz);
            if (d < best) best = d;
        }
        return best;
    }

    /**
     * @param {{ x: number, z: number }[]} pathPoints
     * @param {number} [step=0.8]
     */
    function densifyPathXZ(pathPoints, step = 0.8) {
        /** @type {{ x: number, z: number }[]} */
        const out = [];
        for (let i = 0; i < pathPoints.length - 1; i += 1) {
            const a = pathPoints[i];
            const b = pathPoints[i + 1];
            const len = Math.hypot(b.x - a.x, b.z - a.z);
            const n = Math.max(1, Math.ceil(len / step));
            for (let k = 0; k < n; k += 1) {
                const t = k / n;
                out.push({ x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t });
            }
        }
        const last = pathPoints[pathPoints.length - 1];
        out.push({ x: last.x, z: last.z });
        return out;
    }

    /**
     * Creuse un lit en U + berges le long d’un tracé (pour y loger l’océan / la rivière).
     * @param {{ x: number, z: number }[]} pathPoints
     * @param {number} widthMeters
     * @param {number} depthMeters
     */
    function carveRiverBed(pathPoints, widthMeters, depthMeters) {
        if (!terrain || !Array.isArray(pathPoints) || pathPoints.length < 2) return false;
        const positions = terrain.geometry.attributes.position;
        if (!positions) return false;

        let backup = terrain.userData.riverBedBackup;
        if (!(backup instanceof Float32Array) || backup.length !== positions.count) {
            backup = new Float32Array(positions.count);
            for (let i = 0; i < positions.count; i += 1) backup[i] = positions.getY(i);
            terrain.userData.riverBedBackup = backup;
        } else {
            for (let i = 0; i < positions.count; i += 1) positions.setY(i, backup[i]);
        }

        const segs = terrain.userData.terrainSegments || meshSegments;
        const path = densifyPathXZ(
            pathPoints,
            Math.max(0.15, (sizeMeters / Math.max(1, meshSegments)) * 0.35)
        );
        const cell = sizeMeters / Math.max(1, segs);
        // Pente de berge sur plusieurs cellules → moins d’escalier à la ligne d’eau.
        const halfW = Math.max(cell * 1.1, widthMeters * 0.38);
        const bank = Math.max(cell * 4.2, widthMeters * 0.85);
        const radius = halfW + bank;
        const depth = Math.max(0.35, depthMeters);
        const row = segs + 1;

        /** @type {number[]} */
        const touched = [];
        for (let i = 0; i < positions.count; i += 1) {
            const x = positions.getX(i);
            const z = positions.getZ(i);
            const dist = distToPathXZ(x, z, path);
            if (dist >= radius) continue;
            const y0 = backup[i];
            let delta = 0;
            if (dist <= halfW) {
                const t = dist / halfW;
                const bowl = 0.5 * (1 + Math.cos(Math.PI * Math.min(1, t)));
                delta = -depth * (0.92 * bowl + 0.08);
            } else {
                const u = (dist - halfW) / bank;
                const soft = u * u * (3 - 2 * u);
                delta = -depth * (1 - soft) * 0.92;
            }
            positions.setY(
                i,
                THREE.MathUtils.clamp(y0 + delta, SCULPT_HEIGHT_MIN, SCULPT_HEIGHT_MAX)
            );
            touched.push(i);
        }

        // Plusieurs passes de lissage (voisinage 8) pour adoucir les berges.
        if (touched.length) {
            const neigh = [-1, 1, -row, row, -row - 1, -row + 1, row - 1, row + 1];
            for (let pass = 0; pass < 4; pass += 1) {
                const src = new Float32Array(positions.count);
                for (let i = 0; i < positions.count; i += 1) src[i] = positions.getY(i);
                const blend = pass < 2 ? 0.55 : 0.38;
                for (const index of touched) {
                    let sum = src[index];
                    let n = 1;
                    for (const d of neigh) {
                        const ni = index + d;
                        if (ni < 0 || ni >= positions.count) continue;
                        sum += src[ni];
                        n += 1;
                    }
                    positions.setY(index, THREE.MathUtils.lerp(src[index], sum / n, blend));
                }
            }
        }
        positions.needsUpdate = true;
        terrain.geometry.computeVertexNormals();
        terrain.geometry.computeBoundingSphere();
        terrain.geometry.computeBoundingBox();
        markHeightMapDirty();
        syncTerrainSceneItem();
        return true;
    }

    /** Restaure le relief avant creusement du lit de rivière. */
    function restoreRiverBed() {
        if (!terrain) return false;
        const backup = terrain.userData.riverBedBackup;
        const positions = terrain.geometry.attributes.position;
        if (!(backup instanceof Float32Array) || !positions || backup.length !== positions.count) {
            delete terrain.userData.riverBedBackup;
            return false;
        }
        for (let i = 0; i < positions.count; i += 1) positions.setY(i, backup[i]);
        delete terrain.userData.riverBedBackup;
        positions.needsUpdate = true;
        terrain.geometry.computeVertexNormals();
        terrain.geometry.computeBoundingSphere();
        terrain.geometry.computeBoundingBox();
        markHeightMapDirty();
        syncTerrainSceneItem();
        return true;
    }

    /** Tampon alpha doux (masque) — la texture est échantillonnée en GPU. */
    function stampSoftMaskAt(targetCtx, x, y, pixelRadius) {
        if (!targetCtx) return;
        const cx = Math.round(x);
        const cy = Math.round(y);
        const pr = Math.max(1, Math.round(pixelRadius));
        const intensity = THREE.MathUtils.clamp(paintIntensity, 0.05, 1);

        targetCtx.save();
        targetCtx.globalCompositeOperation = "source-over";
        targetCtx.globalAlpha = intensity;
        const softStart = pixelRadius < 8 ? 0.35 : 0.72;
        const gradient = targetCtx.createRadialGradient(cx, cy, pr * softStart, cx, cy, pr);
        gradient.addColorStop(0, "rgba(255,255,255,1)");
        gradient.addColorStop(0.55, "rgba(255,255,255,1)");
        gradient.addColorStop(1, "rgba(255,255,255,0)");
        targetCtx.fillStyle = gradient;
        targetCtx.beginPath();
        targetCtx.arc(cx, cy, pr, 0, Math.PI * 2);
        targetCtx.fill();
        targetCtx.restore();
    }

    function paintTilePixelSize() {
        const tile = Math.max(TERRAIN_PAINT_TEXTURE_TILE_MIN, paintTextureTile);
        return PAINT_SIZE / tile;
    }

    /**
     * Fige le masque GPU actuel dans le calque peinture (couleur),
     * pour qu’un changement de texture/tile n’écrase pas les coups précédents.
     */
    function bakeBrushMaskIntoPaint() {
        if (!brushMaskUsed || !brushTextureTile || !brushGpuTexture || !brushMaskCtx || !paintCtx) {
            return;
        }

        const bakeCanvas = document.createElement("canvas");
        bakeCanvas.width = PAINT_SIZE;
        bakeCanvas.height = PAINT_SIZE;
        const bakeCtx = bakeCanvas.getContext("2d", { alpha: true });
        if (!bakeCtx) return;

        const tilePx = paintTilePixelSize();
        bakeCtx.clearRect(0, 0, PAINT_SIZE, PAINT_SIZE);
        bakeCtx.imageSmoothingEnabled = true;
        fillRepeatingTexture(
            bakeCtx,
            brushTextureTile,
            0,
            0,
            PAINT_SIZE,
            PAINT_SIZE,
            tilePx,
            0,
            0
        );
        bakeCtx.globalCompositeOperation = "destination-in";
        bakeCtx.drawImage(brushMaskCanvas, 0, 0);
        bakeCtx.globalCompositeOperation = "source-over";

        paintCtx.save();
        paintCtx.globalCompositeOperation = "source-over";
        paintCtx.globalAlpha = 1;
        paintCtx.drawImage(bakeCanvas, 0, 0);
        paintCtx.restore();

        brushMaskCtx.clearRect(0, 0, PAINT_SIZE, PAINT_SIZE);
        brushMaskUsed = false;
        if (brushMaskTexture) brushMaskTexture.needsUpdate = true;
        if (paintOverlayTexture) paintOverlayTexture.needsUpdate = true;
    }

    function paintColorAt(x, y, pixelRadius) {
        if (!paintCtx) return;
        const cx = Math.round(x);
        const cy = Math.round(y);
        const pr = Math.max(1, Math.round(pixelRadius));
        const color = paintColorInput?.value || "#6b4423";
        const intensity = THREE.MathUtils.clamp(paintIntensity, 0.05, 1);

        paintCtx.save();
        paintCtx.globalCompositeOperation = "source-over";
        paintCtx.globalAlpha = intensity;
        paintCtx.fillStyle = color;
        paintCtx.beginPath();
        paintCtx.arc(cx, cy, pr * 0.88, 0, Math.PI * 2);
        paintCtx.fill();

        const gradient = paintCtx.createRadialGradient(cx, cy, pr * 0.72, cx, cy, pr);
        gradient.addColorStop(0, color);
        gradient.addColorStop(0.55, color);
        gradient.addColorStop(1, `${color}00`);
        paintCtx.fillStyle = gradient;
        paintCtx.beginPath();
        paintCtx.arc(cx, cy, pr, 0, Math.PI * 2);
        paintCtx.fill();
        paintCtx.restore();
    }

    function paintTextureStampAt(x, y, pixelRadius) {
        if (!brushGpuTexture || !brushMaskCtx) return;
        stampSoftMaskAt(brushMaskCtx, x, y, pixelRadius);
        brushMaskUsed = true;
    }

    function paintNormalStampAt(x, y, pixelRadius) {
        if (!brushNormalGpuTexture || !paintNormalCtx) return;
        stampSoftMaskAt(paintNormalCtx, x, y, pixelRadius);
        paintNormalUsed = true;
    }

    function paintAt(x, y) {
        const pixelRadius = (radius / sizeMeters) * PAINT_SIZE;
        if (brushTextureTile) {
            paintTextureStampAt(x, y, pixelRadius);
            if (brushNormalTile) paintNormalStampAt(x, y, pixelRadius);
        } else if (brushNormalTile) {
            paintNormalStampAt(x, y, pixelRadius);
        } else {
            paintColorAt(x, y, pixelRadius);
        }
    }

    function paintStroke(x0, y0, x1, y1) {
        const pixelRadius = (radius / sizeMeters) * PAINT_SIZE;
        const step = Math.max(2, pixelRadius * 0.3);
        const dx = x1 - x0;
        const dy = y1 - y0;
        const dist = Math.hypot(dx, dy);
        if (dist <= step) {
            paintAt(x1, y1);
            return;
        }
        const steps = Math.ceil(dist / step);
        for (let i = 0; i <= steps; i += 1) {
            const t = i / steps;
            paintAt(x0 + dx * t, y0 + dy * t);
        }
    }

    function resetPaintStroke() {
        lastPaintX = null;
        lastPaintY = null;
    }

    function paint(hit) {
        if (!paintCtx || !hit.uv) return;
        const x = hit.uv.x * PAINT_SIZE;
        const y = (1 - hit.uv.y) * PAINT_SIZE;

        if (lastPaintX !== null && lastPaintY !== null) {
            paintStroke(lastPaintX, lastPaintY, x, y);
        } else {
            paintAt(x, y);
        }
        lastPaintX = x;
        lastPaintY = y;
        renderTerrainTexture();
    }

    function applyBrush(hit) {
        if (mode === "paint") paint(hit);
        else sculpt(hit);
    }

    function updateBrush(hit) {
        if (!terrain || !hit) {
            brushRing.visible = false;
            return;
        }
        brushRing.visible = editing;
        brushRing.position.copy(hit.point);
        brushRing.position.y += 0.04;
        brushRing.scale.setScalar(radius);
    }

    function consume(event) {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
    }

    renderer.domElement.addEventListener(
        "pointerdown",
        (event) => {
            if (!editing || event.button !== 0) return;
            const hit = hitTerrain(event);
            if (!hit) return;
            consume(event);
            dragging = true;
            resetPaintStroke();
            strokeBefore = captureState();
            renderer.domElement.setPointerCapture?.(event.pointerId);
            applyBrush(hit);
            updateBrush(hit);
        },
        true
    );

    renderer.domElement.addEventListener(
        "pointermove",
        (event) => {
            if (!editing) return;
            const hit = hitTerrain(event);
            updateBrush(hit);
            if (!dragging || !hit) return;
            consume(event);
            applyBrush(hit);
        },
        true
    );

    window.addEventListener("pointerup", () => {
        if (!dragging) return;
        dragging = false;
        resetPaintStroke();
        commitStroke();
    });

    renderer.domElement.addEventListener(
        "wheel",
        (event) => {
            if (!editing || !radiusInput) return;
            if (!hitTerrain(event)) return;
            consume(event);
            const step = event.shiftKey ? 0.05 : 0.1;
            radius = THREE.MathUtils.clamp(radius + (event.deltaY > 0 ? -step : step), 0.05, 8);
            radius = Math.round(radius * 100) / 100;
            radiusInput.value = String(radius);
            if (radiusValue) radiusValue.textContent = `${formatNumber(radius, 2)} m`;
            brushRing.scale.setScalar(radius);
        },
        { capture: true, passive: false }
    );

    renderer.domElement.addEventListener("pointerleave", () => {
        if (!dragging) brushRing.visible = false;
    });

    createBtn?.addEventListener("click", () => {
        const wasNew = !terrain;
        if (!terrain) makeTerrain({ recordHistory: true });
        if (wasNew) frameTerrainView();
        setEditing(!editing);
    });

    /**
     * @param {{ lat: number, lon: number, sizeMeters?: number }} pick
     * @param {{ enterFps?: boolean }} [opts]
     */
    async function importIgnRelief(pick, { enterFps = false } = {}) {
        const targetSize = Math.max(100, Math.min(2000, Number(pick.sizeMeters) || sizeMeters));
        const before = terrain ? serialize() : null;

        if (Math.abs(targetSize - sizeMeters) > 0.001) {
            applyTerrainSize(targetSize, { recordHistory: false });
        }
        meshSegments = segmentsForTerrainSize(sizeMeters);
        if (!terrain) makeTerrain({ recordHistory: false });
        setWorldSize?.(sizeMeters);
        frameTerrainView(true);

        setIgnLoading(true, "Relief IGN…", 0);
        try {
            const grid = await fetchIgnHeightGrid(
                pick.lat,
                pick.lon,
                sizeMeters,
                IGN_GRID_SEGMENTS,
                (progress) => {
                    setIgnLoading(
                        true,
                        progress >= 0.999
                            ? "Construction du relief 3D…"
                            : `Relief IGN… ${Math.round(progress * 100)} %`,
                        progress
                    );
                }
            );
            const denseElev = upsampleIgnElevations(
                grid.elevations,
                IGN_GRID_SEGMENTS,
                meshSegments
            );
            const meshHeights = mapIgnElevationsToMeshHeights(
                denseElev,
                grid.minElev,
                grid.maxElev,
                sizeMeters
            );
            const heightmapRes = meshSegments + 1;
            const heightmapDataUrl = elevationsToHeightmapDataUrl(denseElev, heightmapRes);

            const prevGeometry = terrain.geometry;
            terrain.geometry = buildIgnTerrainGeometry(meshHeights, meshSegments, sizeMeters);
            prevGeometry.dispose();
            terrain.userData.terrainSegments = meshSegments;
            terrain.userData.terrainSize = sizeMeters;
            delete terrain.userData.riverBedBackup;
            terrain.updateMatrixWorld(true);
            coverFloor(true);
            updateTerrainGridLevel();
            renderTerrainTexture();
            terrain.userData.ignCenter = { lat: pick.lat, lon: pick.lon };
            terrain.userData.ignElevRange = { min: grid.minElev, max: grid.maxElev };
            terrain.userData.ignHeightmap = {
                dataUrl: heightmapDataUrl,
                resolution: heightmapRes,
                sizeMeters,
                minElev: grid.minElev,
                maxElev: grid.maxElev,
            };
            groundCache = { ortho: null, roadMask: null, splat: null, osmElements: null, osmBbox: null };
            downloadIgnHeightmapPng(heightmapDataUrl, pick);
            markHeightMapDirty();
            syncTerrainSceneItem();
            tools?.removeAttribute("hidden");
            clearSkybox?.();
            clearOcean?.();
            setWorldSize?.(sizeMeters);
            setEditing(false);
            if (!enterFps) {
                setMovementMode?.("design");
                frameTerrainView(true);
            }

            try {
                setIgnLoading(true, "Photo aérienne IGN + routes…", 0.02);
                await drapeRealGround({ recordHistory: false, autoAfterIgn: true });
            } catch (drapeError) {
                console.warn("[lab-terrain] sol réel après IGN :", drapeError);
            }

            setIgnLoading(true, "Bâtiments BD TOPO…", 0.96);
            const placed = await placeOsmMapFeatures({ quiet: false });
            terrain.userData.osmBuildingCount = placed.nBuildings;
            if (placed.nRoads || placed.nBuildings) {
                showStatus?.(
                    `${placed.source || "Bâtiments"} : ${placed.nBuildings} bâtiments`
                );
            }

            const after = serialize();
            pushSceneHistory?.({ type: "terrain", before, after });

            return grid;
        } finally {
            setIgnLoading(false);
        }
    }

    let ignImportBusy = false;
    let ignImportToken = 0;

    const LAB_IMPORT_IGN_TYPE = "lab3d-import-ign";

    function expandTerrainSection() {
        const section = document.querySelector('.lab-side-panel__section[data-section="terrain"]');
        if (!section) return;
        section.classList.add("lab-side-panel__section--open");
        section.classList.remove("lab-side-panel__section--collapsed");
        const toggle = section.querySelector(".lab-side-panel__section-toggle");
        if (toggle) {
            toggle.setAttribute("aria-expanded", "true");
            toggle.title = "Replier";
        }
    }

    /**
     * @param {{ elevations?: number[], minElev: number, maxElev: number }} grid
     * @param {{ requestedSize?: number, enterFps?: boolean }} [opts]
     */
    function reportIgnImportResult(grid, { requestedSize = null, enterFps = false } = {}) {
        terrain?.geometry?.computeBoundingBox?.();
        const reliefVisual = terrain?.geometry?.boundingBox
            ? terrain.geometry.boundingBox.max.y - terrain.geometry.boundingBox.min.y
            : 0;
        const denivele = grid.maxElev - grid.minElev;
        const clamped =
            Number.isFinite(requestedSize) && requestedSize > 2000
                ? ` — zone ${Math.round(requestedSize)} m ramenée à 2000 m`
                : "";
        const fpsNote = enterFps ? " — FPS (ZQSD, clic gauche pour regarder)" : "";
        if (denivele < 0.5) {
            showStatus?.(
                `Zone très plate (${grid.minElev.toFixed(0)} m d’altitude) — zoomez sur une pente, un sommet ou une vallée (${Math.round(sizeMeters)} m)${clamped}${fpsNote}`
            );
            return;
        }
        if (reliefVisual < 0.5) {
            showStatus?.(
                `Dénivelé IGN ${denivele.toFixed(0)} m non visible en 3D — Ctrl+F5 puis réessayez${clamped}`
            );
            return;
        }
        const hasPhoto = Boolean(groundCache.ortho);
        const nRoutes = groundCache.roadMask || scene.getObjectByName("lab-osm-roads")
            ? " + routes"
            : "";
        const nHouses = terrain?.userData?.osmBuildingCount
            ? ` + ${terrain.userData.osmBuildingCount} bât.`
            : "";
        showStatus?.(
            hasPhoto
                ? `Relief IGN + photo aérienne${nRoutes}${nHouses} : ${denivele.toFixed(0)} m dénivelé (${Math.round(sizeMeters)} m, pas ${(sizeMeters / meshSegments).toFixed(2).replace(".", ",")} m)${clamped}${fpsNote}`
                : `Relief IGN : ${denivele.toFixed(0)} m dénivelé (${Math.round(sizeMeters)} m, pas ${(sizeMeters / meshSegments).toFixed(2).replace(".", ",")} m) — photo aérienne indisponible, réessayez « Sol réel »${clamped}${fpsNote}`
        );
    }

    /**
     * @param {{ lat: number, lon: number, sizeMeters: number }} pick
     * @param {{ enterFps?: boolean, requestedSize?: number }} [opts]
     */
    async function finishIgnImport(pick, { enterFps = false, requestedSize = null } = {}) {
        if (ignImportBusy) {
            showStatus?.("Import IGN déjà en cours…");
            return null;
        }
        const leftoverPicker = document.querySelector(".lab-dialog-overlay--ign");
        if (leftoverPicker) {
            leftoverPicker.dispatchEvent(new Event("lab-ign-dismiss"));
            leftoverPicker.remove();
        }
        const token = ++ignImportToken;
        ignImportBusy = true;
        setEditing(false);
        expandTerrainSection();
        try {
            const grid = await importIgnRelief(pick, { enterFps });
            if (token !== ignImportToken) return null;
            reportIgnImportResult(grid, { requestedSize, enterFps });
            if (enterFps && typeof placePlayerAt === "function") {
                const y = sampleTerrainY(0, 0);
                placePlayerAt(0, y, 0, { switchToFps: true, snapGround: true });
            }
            return grid;
        } catch (error) {
            console.warn("[lab-terrain] import IGN :", error);
            showStatus?.(
                error instanceof Error ? error.message : "Import relief IGN impossible"
            );
            return null;
        } finally {
            if (token === ignImportToken) ignImportBusy = false;
        }
    }

    /**
     * @param {Record<string, unknown>} raw
     * @returns {{ lat: number, lon: number, sizeMeters: number, enterFps: boolean, requestedSize: number } | null}
     */
    function parseIgnImportRequest(raw) {
        const lat = Number(raw?.lat);
        const lon = Number(raw?.lon);
        const rawSize = Number(raw?.size ?? raw?.sizeMeters);
        if (![lat, lon].every(Number.isFinite)) return null;
        if (lat < -90 || lat > 90 || lon < -180 || lon > 180) return null;
        const requestedSize = Number.isFinite(rawSize) ? rawSize : 800;
        return {
            lat,
            lon,
            sizeMeters: Math.max(100, Math.min(2000, Math.round(requestedSize))),
            enterFps: raw?.fps !== false && raw?.fps !== "0" && raw?.fps !== 0,
            requestedSize,
        };
    }

    function consumeIgnImportQuery() {
        const q = new URLSearchParams(window.location.search);
        const flag = q.get("import");
        if (flag !== "ign") return null;
        const parsed = parseIgnImportRequest({
            lat: q.get("lat"),
            lon: q.get("lon"),
            size: q.get("size"),
            fps: q.get("fps"),
        });
        q.delete("import");
        q.delete("lat");
        q.delete("lon");
        q.delete("size");
        q.delete("fps");
        const next = q.toString();
        history.replaceState(
            null,
            "",
            `${window.location.pathname}${next ? `?${next}` : ""}${window.location.hash || ""}`
        );
        return parsed;
    }

    ignImportBtn?.addEventListener("click", async (event) => {
        event.stopPropagation();
        const leftoverPicker = document.querySelector(".lab-dialog-overlay--ign");
        if (leftoverPicker) {
            leftoverPicker.dispatchEvent(new Event("lab-ign-dismiss"));
            leftoverPicker.remove();
        }
        if (ignImportBusy) {
            showStatus?.("Import IGN déjà en cours…");
            return;
        }
        setEditing(false);
        try {
            const pick = await labIgnTerrainPicker({
                defaultLat: terrain?.userData?.ignCenter?.lat ?? 48.8566,
                defaultLon: terrain?.userData?.ignCenter?.lon ?? 2.3522,
                defaultSize: Math.max(100, Math.min(2000, sizeMeters) || 800),
                title: "Relief IGN — choisir la zone",
                confirmLabel: "Importer le relief",
                hint: "Zoomez et centrez le carré cyan. Le heightmap IGN (photo, routes, bâtiments) sera posé dans le lab.",
            });
            if (!pick) return;
            await finishIgnImport(pick);
        } catch (error) {
            console.warn("[lab-terrain] import IGN :", error);
            showStatus?.(
                error instanceof Error ? error.message : "Import relief IGN impossible"
            );
        }
    });

    ignMeshBtn?.addEventListener("click", async (event) => {
        event.stopPropagation();
        ignImportBtn?.click();
    });

    window.addEventListener("message", (event) => {
        if (event.origin !== window.location.origin) return;
        const data = event.data;
        if (!data || data.type !== LAB_IMPORT_IGN_TYPE) return;
        const req = parseIgnImportRequest(data);
        if (!req) {
            showStatus?.("Import IGN : coordonnées invalides");
            return;
        }
        void finishIgnImport(
            { lat: req.lat, lon: req.lon, sizeMeters: req.sizeMeters },
            { enterFps: req.enterFps, requestedSize: req.requestedSize }
        );
    });

    const pendingIgnImport = consumeIgnImportQuery();
    if (pendingIgnImport) {
        void finishIgnImport(
            {
                lat: pendingIgnImport.lat,
                lon: pendingIgnImport.lon,
                sizeMeters: pendingIgnImport.sizeMeters,
            },
            {
                enterFps: pendingIgnImport.enterFps,
                requestedSize: pendingIgnImport.requestedSize,
            }
        );
    }

    /**
     * @param {number} nextSize
     * @param {{ recordHistory?: boolean }} [opts]
     */
    function applyTerrainSize(nextSize, { recordHistory = true } = {}) {
        const size = Math.max(10, Math.min(2000, Number(nextSize) || GRID_SIZE));
        if (Math.abs(size - sizeMeters) < 0.001) {
            syncSizeUi();
            return;
        }
        const before = terrain && recordHistory ? serialize() : null;
        sizeMeters = size;
        meshSegments = segmentsForTerrainSize(sizeMeters);
        syncSizeUi();
        setWorldSize?.(sizeMeters);
        if (!terrain) return;

        const oldPos = terrain.geometry.attributes.position;
        const oldSize = Number(terrain.userData.terrainSize) || size;
        const oldHalf = oldSize * 0.5;
        /** @type {(x: number, z: number) => number} */
        const sampleOld = (wx, wz) => {
            const segs = Number(terrain.userData.terrainSegments) || meshSegments;
            const u = THREE.MathUtils.clamp((wx + oldHalf) / oldSize, 0, 1);
            const v = THREE.MathUtils.clamp((wz + oldHalf) / oldSize, 0, 1);
            const fx = u * segs;
            const fz = v * segs;
            const i0 = Math.floor(fx);
            const j0 = Math.floor(fz);
            const i1 = Math.min(segs, i0 + 1);
            const j1 = Math.min(segs, j0 + 1);
            const tx = fx - i0;
            const tz = fz - j0;
            const row = segs + 1;
            const y00 = oldPos.getY(j0 * row + i0);
            const y10 = oldPos.getY(j0 * row + i1);
            const y01 = oldPos.getY(j1 * row + i0);
            const y11 = oldPos.getY(j1 * row + i1);
            return (
                y00 * (1 - tx) * (1 - tz) +
                y10 * tx * (1 - tz) +
                y01 * (1 - tx) * tz +
                y11 * tx * tz
            );
        };

        const prev = terrain.geometry;
        const geometry = createTerrainGeometry();
        const nextPos = geometry.attributes.position;
        for (let i = 0; i < nextPos.count; i += 1) {
            nextPos.setY(i, sampleOld(nextPos.getX(i), nextPos.getZ(i)));
        }
        nextPos.needsUpdate = true;
        if (terrain.userData?.ignCenter) applyTerrainGeoUVs(geometry, sizeMeters);
        geometry.computeVertexNormals();
        geometry.computeBoundingSphere();
        geometry.computeBoundingBox();
        terrain.geometry = geometry;
        terrain.userData.terrainSize = sizeMeters;
        terrain.userData.terrainSegments = meshSegments;
        prev.dispose();
        updateTerrainGridLevel();
        markHeightMapDirty();
        syncTerrainSceneItem();
        if (recordHistory && before) {
            pushSceneHistory?.({ type: "terrain", before, after: serialize() });
        }
    }

    bindRangeSliderWheel(
        sizeInput,
        (value) => applyTerrainSize(value, { recordHistory: true }),
        { step: 1 }
    );
    sizeInput?.addEventListener("change", () => {
        applyTerrainSize(Number(sizeInput.value), { recordHistory: true });
    });
    sizeInput?.addEventListener("input", () => {
        if (sizeValue) sizeValue.textContent = `${formatNumber(Number(sizeInput.value) || sizeMeters, 0)} m`;
    });

    modeButtons.forEach((button) => {
        button.addEventListener("click", () => setMode(button.dataset.terrainMode || "mound"));
    });

    radiusInput?.addEventListener("input", () => {
        radius = Number(radiusInput.value);
        if (radiusValue) radiusValue.textContent = `${formatNumber(radius, 2)} m`;
    });
    strengthInput?.addEventListener("input", () => {
        strength = Number(strengthInput.value);
        if (strengthValue) strengthValue.textContent = formatNumber(strength);
    });
    colorInput?.addEventListener("input", () => {
        baseColor = colorInput.value;
        renderTerrainTexture();
    });

    textureTileInput?.addEventListener("input", () => {
        textureTile = THREE.MathUtils.clamp(
            Number(textureTileInput.value) || DEFAULT_TEXTURE_TILE,
            TEXTURE_TILE_MIN,
            TERRAIN_TEXTURE_TILE_MAX
        );
        if (textureTileValue) textureTileValue.textContent = textureTile.toFixed(2);
        applyBaseMapToMaterial();
        syncTerrainNormalMaterial();
    });
    bindRangeSliderWheel(textureTileInput, (value) => {
        textureTile = value;
        if (textureTileValue) textureTileValue.textContent = value.toFixed(2);
        applyBaseMapToMaterial();
        syncTerrainNormalMaterial();
    }, { step: TEXTURE_TILE_STEP });

    paintTileInput?.addEventListener("input", () => {
        paintTextureTile = THREE.MathUtils.clamp(
            Number(paintTileInput.value) || DEFAULT_TEXTURE_TILE,
            TERRAIN_PAINT_TEXTURE_TILE_MIN,
            TERRAIN_PAINT_TEXTURE_TILE_MAX
        );
        if (paintTileValue) paintTileValue.textContent = paintTextureTile.toFixed(2);
        syncPaintOverlayUniform();
    });
    bindRangeSliderWheel(paintTileInput, (value) => {
        paintTextureTile = value;
        if (paintTileValue) paintTileValue.textContent = value.toFixed(2);
        syncPaintOverlayUniform();
    }, { step: 0.05 });

    paintIntensityInput?.addEventListener("input", () => {
        paintIntensity = THREE.MathUtils.clamp(Number(paintIntensityInput.value) || 1, 0.05, 1);
        if (paintIntensityValue) paintIntensityValue.textContent = paintIntensity.toFixed(2);
    });
    bindRangeSliderWheel(paintIntensityInput, (value) => {
        paintIntensity = value;
        if (paintIntensityValue) paintIntensityValue.textContent = value.toFixed(2);
    }, { step: 0.01 });

    function applyBaseTextureFromDataUrl(dataUrl, { geoAligned = false } = {}) {
        return new Promise((resolve, reject) => {
            const image = new Image();
            image.onload = () => {
                baseImage = prepareTileSource(image, BASE_TEXTURE_GPU_SIZE);
                baseGpuTexture?.dispose();
                geoAlignedBase = geoAligned;
                baseGpuTexture = createGpuTileTexture(image, { geoAligned });
                baseTextureDataUrl = dataUrl;
                if (geoAligned) {
                    textureTile = 1;
                    if (textureTileInput) textureTileInput.value = "1";
                    if (textureTileValue) textureTileValue.textContent = "1,00";
                }
                renderTerrainTexture();
                resolve(undefined);
            };
            image.onerror = () => reject(new Error("Texture illisible"));
            image.src = dataUrl;
        });
    }

    function clearBaseNormalMap() {
        baseNormalGpuTexture?.dispose();
        baseNormalGpuTexture = null;
        baseNormalImage = null;
        baseNormalTextureDataUrl = null;
        normalBtn?.classList.remove("is-active");
        if (normalClearBtn) normalClearBtn.hidden = true;
        if (material) {
            material.normalMap = null;
            material.normalScale.set(1, 1);
            material.needsUpdate = true;
        }
    }

    function applyBaseNormalFromDataUrl(dataUrl, { geoAligned = false } = {}) {
        return new Promise((resolve, reject) => {
            const image = new Image();
            image.onload = () => {
                baseNormalImage = prepareTileSource(image, BASE_TEXTURE_GPU_SIZE);
                baseNormalGpuTexture?.dispose();
                baseNormalGpuTexture = createGpuTileTexture(image, { normal: true, geoAligned });
                baseNormalTextureDataUrl = dataUrl;
                normalBtn?.classList.add("is-active");
                if (normalClearBtn) normalClearBtn.hidden = false;
                renderTerrainTexture();
                resolve(undefined);
            };
            image.onerror = () => reject(new Error("Normal map illisible"));
            image.src = dataUrl;
        });
    }

    function resetLayerUrls() {
        layerUrls = {
            grass: { color: LAYER_DEFS.grass.color, normal: LAYER_DEFS.grass.normal },
            sand: { color: LAYER_DEFS.sand.color, normal: LAYER_DEFS.sand.normal },
            path: { color: LAYER_DEFS.path.color, normal: LAYER_DEFS.path.normal },
            rock: { color: LAYER_DEFS.rock.color, normal: LAYER_DEFS.rock.normal },
            road: { color: LAYER_DEFS.road.color, normal: LAYER_DEFS.road.normal },
        };
    }

    function ignCenterOrNull() {
        const center = terrain?.userData?.ignCenter;
        if (!center || !Number.isFinite(center.lat) || !Number.isFinite(center.lon)) return null;
        return center;
    }

    /**
     * Bâtiments BD TOPO (IGN) en priorité, repli OSM si besoin.
     * @param {{ roads?: boolean, buildings?: boolean, quiet?: boolean }} [opts]
     */
    async function placeOsmMapFeatures({ roads = true, buildings = true, quiet = false } = {}) {
        const center = ignCenterOrNull();
        if (!center || !terrain) return { nRoads: 0, nBuildings: 0, source: null };
        // Plus de volumes gris 3D : les routes restent sur la photo / le bitume drapé.
        if (roads) clearOsmRoads(scene, sceneRegistry);
        let nBuildings = 0;
        /** @type {string | null} */
        let source = null;
        if (buildings) {
            try {
                nBuildings = await placeBdTopoBuildings({
                    scene,
                    sceneRegistry,
                    terrain,
                    centerLat: center.lat,
                    centerLon: center.lon,
                    sizeMeters,
                    sampleY: sampleTerrainY,
                });
                source = "BD TOPO";
                terrain.userData.osmBuildingCount = nBuildings;
                terrain.userData.buildingSource = source;
            } catch (bdErr) {
                console.warn("[lab-terrain] BD TOPO :", bdErr);
                try {
                    nBuildings = await placeOsmBuildings({
                        scene,
                        sceneRegistry,
                        terrain,
                        centerLat: center.lat,
                        centerLon: center.lon,
                        sizeMeters,
                        sampleY: sampleTerrainY,
                        elements: groundCache.osmElements,
                    });
                    source = "OSM";
                    terrain.userData.osmBuildingCount = nBuildings;
                    terrain.userData.buildingSource = source;
                    if (!quiet) {
                        showStatus?.(
                            `BD TOPO indisponible — repli OSM (${nBuildings} bâtiments)`
                        );
                    }
                } catch (error) {
                    console.warn("[lab-terrain] maisons OSM :", error);
                    if (!quiet) {
                        showStatus?.(
                            error instanceof Error
                                ? error.message
                                : bdErr instanceof Error
                                  ? bdErr.message
                                  : "Bâtiments impossibles"
                        );
                    }
                }
            }
        }
        return { nRoads: 0, nBuildings, source };
    }

    /**
     * Plaque photo IGN + bitume OSM (ou splat relief si pas d’IGN).
     * @param {{ recordHistory?: boolean, autoAfterIgn?: boolean, invalidate?: ("ortho" | "roads" | "splat")[] }} [opts]
     */
    async function drapeRealGround({ recordHistory = true, autoAfterIgn = false, invalidate = [] } = {}) {
        if (!terrain) {
            showStatus?.("Créez d’abord un terrain ou importez un heightmap IGN");
            return;
        }
        if (invalidate.includes("ortho")) groundCache.ortho = null;
        if (invalidate.includes("roads")) {
            groundCache.roadMask = null;
            groundCache.osmElements = null;
            groundCache.osmBbox = null;
        }
        if (invalidate.includes("splat")) groundCache.splat = null;

        const before = recordHistory ? serialize() : null;
        const center = ignCenterOrNull();
        const notes = [];

        if (center && !groundCache.ortho) {
            setIgnLoading(true, "Orthophoto IGN (sol réel)…", 0.04);
            try {
                const ortho = await buildIgnOrthoForTerrain(
                    center.lat,
                    center.lon,
                    sizeMeters,
                    2048,
                    (progress, label) => setIgnLoading(true, label, progress)
                );
                groundCache.ortho = ortho.imageData;
                notes.push("photo aérienne");
                clearBaseNormalMap();
                await applyBaseTextureFromDataUrl(ortho.dataUrl, { geoAligned: true });
                showStatus?.(
                    `Photo aérienne IGN plaquée (${ortho.tileCount} tuiles) — pose des routes…`
                );
            } catch (error) {
                console.warn("[lab-terrain] orthophoto :", error);
                showStatus?.(
                    error instanceof Error
                        ? error.message
                        : "Orthophoto IGN indisponible — redémarrez le serveur Node"
                );
            }
        } else if (groundCache.ortho) {
            notes.push("photo aérienne");
        }

        if (center && showRoads && !groundCache.roadMask) {
            setIgnLoading(true, "Routes OpenStreetMap…", 0.08);
            try {
                const mask = await buildOsmRoadMaskForTerrain(
                    center.lat,
                    center.lon,
                    sizeMeters,
                    2048
                );
                groundCache.roadMask = mask.imageData;
                groundCache.osmElements = mask.elements || null;
                groundCache.osmBbox = mask.bbox || null;
                notes.push(`${mask.wayCount} routes`);
            } catch (error) {
                console.warn("[lab-terrain] masque OSM :", error);
                notes.push("routes indisponibles");
                showStatus?.(
                    error instanceof Error
                        ? error.message
                        : "Routes OSM indisponibles — relancez le serveur Node"
                );
            }
        }

        const mix = groundCache.ortho ? orthoMix : 0;
        setIgnLoading(
            true,
            mix > 0.5 ? "Plaquage de la photo sur le relief…" : "Textures sol selon le relief…",
            0.12
        );

        let maps;
        try {
            maps = await composeTerrainGround({
                geometry: terrain.geometry,
                sizeMeters,
                ortho: groundCache.ortho,
                orthoMix: mix,
                roadMask: groundCache.roadMask,
                showRoads,
                roadElements: groundCache.osmElements,
                roadBbox: groundCache.osmBbox,
                layerUrls,
                splatCache: groundCache.splat,
                onProgress: (progress, label) => setIgnLoading(true, label, progress),
            });
        } catch (error) {
            if (!groundCache.ortho) throw error;
            console.warn("[lab-terrain] compose, fallback ortho :", error);
            const canvas = document.createElement("canvas");
            canvas.width = groundCache.ortho.width;
            canvas.height = groundCache.ortho.height;
            const ctx = canvas.getContext("2d");
            if (!ctx) throw error;
            ctx.putImageData(groundCache.ortho, 0, 0);
            maps = {
                colorUrl: canvas.toDataURL("image/jpeg", 0.86),
                normalUrl: null,
                splat: null,
            };
        }
        if (maps.splat) groundCache.splat = maps.splat;

        if (groundCache.ortho) clearBaseNormalMap();
        await applyBaseTextureFromDataUrl(maps.colorUrl, { geoAligned: true });
        if (!groundCache.ortho && maps.normalUrl) {
            await applyBaseNormalFromDataUrl(maps.normalUrl, { geoAligned: true });
        }
        terrain.userData.realisticSplat = true;
        terrain.userData.osmRoadTexture = Boolean(showRoads && groundCache.roadMask);

        if (recordHistory) {
            const after = serialize();
            pushSceneHistory?.({ type: "terrain", before, after });
        }

        const mixLabel = groundCache.ortho
            ? `photo ${Math.round(mix * 100)} %`
            : "herbe / sable / roche";
        const roadNote = showRoads && groundCache.roadMask
            ? ` · ${notes.find((n) => n.includes("routes")) || "routes"}`
            : "";
        if (!autoAfterIgn) {
            showStatus?.(`Sol réel plaqué (${mixLabel}${roadNote})`);
        }
    }

    textureBtn?.addEventListener("click", () => {
        if (textureInput) void pickFilePreservingFullscreen(textureInput);
    });

    let realGroundBusy = false;
    realGroundBtn?.addEventListener("click", async () => {
        if (realGroundBusy) return;
        if (!terrain) {
            showStatus?.("Créez d’abord un terrain ou importez un heightmap IGN");
            return;
        }
        realGroundBusy = true;
        setIgnLoading(true, "Préparation du sol réel…", 0);
        try {
            await drapeRealGround({
                recordHistory: true,
                invalidate: ["ortho", "roads"],
            });
            setIgnLoading(true, "Bâtiments BD TOPO…", 0.9);
            const placed = await placeOsmMapFeatures();
            if (placed.nRoads || placed.nBuildings) {
                showStatus?.(
                    `Sol réel : ${placed.nBuildings} bâtiments (${placed.source || "OSM"})`
                );
            }
        } catch (error) {
            console.warn("[lab-terrain] sol réel :", error);
            showStatus?.(
                error instanceof Error ? error.message : "Sol réel impossible"
            );
        } finally {
            setIgnLoading(false);
            realGroundBusy = false;
        }
    });

    let layerReplaceBusy = false;
    groundLayersEl?.addEventListener("click", (event) => {
        const target = /** @type {HTMLElement} */ (event.target);
        const key = target.closest("[data-ground-replace]")?.getAttribute("data-ground-replace");
        if (!key || !layerFileInput) return;
        pendingLayerReplace = key;
        void pickFilePreservingFullscreen(layerFileInput);
    });

    layerFileInput?.addEventListener("change", () => {
        const file = layerFileInput.files?.[0];
        const key = pendingLayerReplace;
        pendingLayerReplace = "";
        layerFileInput.value = "";
        void restoreFullscreenNow();
        if (!file || !key || !/^image\/(jpeg|png)$/i.test(file.type)) {
            void ensureLabFullscreenAfterFile();
            return;
        }
        const reader = new FileReader();
        reader.onload = async () => {
            const dataUrl = String(reader.result);
            if (key === "ortho") {
                try {
                    groundCache.ortho = await dataUrlToImageData(dataUrl);
                    layerReplaceBusy = true;
                    setIgnLoading(true, "Application de l’orthophoto…", 0.2);
                    await drapeRealGround({ recordHistory: true });
                } catch (error) {
                    showStatus?.(
                        error instanceof Error ? error.message : "Orthophoto illisible"
                    );
                } finally {
                    setIgnLoading(false);
                    layerReplaceBusy = false;
                    void ensureLabFullscreenAfterFile();
                }
                return;
            }
            if (!GROUND_LAYER_IDS.includes(key)) {
                void ensureLabFullscreenAfterFile();
                return;
            }
            layerUrls[key] = { ...layerUrls[key], color: dataUrl };
            const invalidate = key === "road" ? [] : ["splat"];
            layerReplaceBusy = true;
            setIgnLoading(true, `Calque ${LAYER_DEFS[key]?.label || key}…`, 0.15);
            try {
                await drapeRealGround({
                    recordHistory: true,
                    invalidate,
                });
            } catch (error) {
                showStatus?.(
                    error instanceof Error ? error.message : "Calque impossible"
                );
            } finally {
                setIgnLoading(false);
                layerReplaceBusy = false;
                void ensureLabFullscreenAfterFile();
            }
        };
        reader.onerror = () => void ensureLabFullscreenAfterFile();
        reader.readAsDataURL(file);
    });

    let orthoMixTimer = 0;
    function syncOrthoMixUi(value) {
        orthoMix = THREE.MathUtils.clamp(value / 100, 0, 1);
        if (orthoMixValue) orthoMixValue.textContent = `${Math.round(orthoMix * 100)} %`;
    }
    orthoMixInput?.addEventListener("input", () => {
        syncOrthoMixUi(Number(orthoMixInput.value) || 0);
        window.clearTimeout(orthoMixTimer);
        orthoMixTimer = window.setTimeout(() => {
            if (!terrain || !groundCache.ortho) return;
            void (async () => {
                setIgnLoading(true, "Mix photo / textures…", 0.4);
                try {
                    await drapeRealGround({ recordHistory: true });
                } catch (error) {
                    console.warn("[lab-terrain] mix ortho :", error);
                } finally {
                    setIgnLoading(false);
                }
            })();
        }, 280);
    });
    bindRangeSliderWheel(orthoMixInput, (value) => {
        if (orthoMixInput) orthoMixInput.value = String(Math.round(value));
        syncOrthoMixUi(value);
        window.clearTimeout(orthoMixTimer);
        orthoMixTimer = window.setTimeout(() => {
            if (!terrain || !groundCache.ortho) return;
            void (async () => {
                setIgnLoading(true, "Mix photo / textures…", 0.4);
                try {
                    await drapeRealGround({ recordHistory: true });
                } catch (error) {
                    console.warn("[lab-terrain] mix ortho :", error);
                } finally {
                    setIgnLoading(false);
                }
            })();
        }, 280);
    }, { step: 1 });

    showRoadsInput?.addEventListener("change", () => {
        showRoads = Boolean(showRoadsInput.checked);
        if (!terrain) return;
        void (async () => {
            setIgnLoading(true, showRoads ? "Bitume sur la photo…" : "Retrait du bitume…", 0.3);
            try {
                clearOsmRoads(scene, sceneRegistry);
                await drapeRealGround({
                    recordHistory: true,
                });
            } catch (error) {
                console.warn("[lab-terrain] routes :", error);
            } finally {
                setIgnLoading(false);
            }
        })();
    });

    let osmBuildingsBusy = false;
    osmBuildingsBtn?.addEventListener("click", () => {
        if (osmBuildingsBusy) return;
        const center = ignCenterOrNull();
        if (!terrain || !center) {
            showStatus?.("Importez d’abord un heightmap IGN (carte)");
            return;
        }
        osmBuildingsBusy = true;
        setIgnLoading(true, "Placement des bâtiments BD TOPO…", 0.2);
        void (async () => {
            try {
                const placed = await placeOsmMapFeatures({ quiet: false });
                const src = placed.source || "OSM";
                showStatus?.(
                    placed.nBuildings
                        ? `${placed.nBuildings} bâtiments (${src})`
                        : "Aucun bâtiment dans cette zone"
                );
            } catch (error) {
                console.warn("[lab-terrain] maisons OSM :", error);
                showStatus?.(
                    error instanceof Error ? error.message : "Maisons OSM impossibles"
                );
            } finally {
                setIgnLoading(false);
                osmBuildingsBusy = false;
            }
        })();
    });
    textureInput?.addEventListener("change", () => {
        const file = textureInput.files?.[0];
        textureInput.value = "";
        void restoreFullscreenNow();
        if (!file || !/^image\/(jpeg|png)$/i.test(file.type)) {
            void ensureLabFullscreenAfterFile();
            return;
        }
        const reader = new FileReader();
        reader.onload = () => {
            const image = new Image();
            image.onload = () => {
                geoAlignedBase = false;
                baseImage = prepareTileSource(image, BASE_TEXTURE_GPU_SIZE);
                baseGpuTexture?.dispose();
                baseGpuTexture = createGpuTileTexture(image);
                baseTextureDataUrl = String(reader.result);
                renderTerrainTexture();
                void ensureLabFullscreenAfterFile();
            };
            image.onerror = () => void ensureLabFullscreenAfterFile();
            image.src = String(reader.result);
        };
        reader.onerror = () => void ensureLabFullscreenAfterFile();
        reader.readAsDataURL(file);
    });

    brushTextureBtn?.addEventListener("click", () => {
        if (brushTextureInput) void pickFilePreservingFullscreen(brushTextureInput);
    });
    brushTextureClearBtn?.addEventListener("click", () => {
        bakeBrushMaskIntoPaint();
        brushTextureTile = null;
        brushGpuTexture?.dispose();
        brushGpuTexture = null;
        brushTextureDataUrl = null;
        brushTextureBtn?.classList.remove("is-active");
        if (brushTextureBtn) brushTextureBtn.textContent = "Texture du pinceau";
        brushTextureClearBtn.hidden = true;
        renderTerrainTexture();
    });
    brushTextureInput?.addEventListener("change", () => {
        const file = brushTextureInput.files?.[0];
        brushTextureInput.value = "";
        void restoreFullscreenNow();
        if (!file || !/^image\/(jpeg|png)$/i.test(file.type)) {
            void ensureLabFullscreenAfterFile();
            return;
        }
        const reader = new FileReader();
        reader.onload = () => {
            const image = new Image();
            image.onload = () => {
                // Fige les coups de l’ancienne texture avant d’en charger une nouvelle.
                bakeBrushMaskIntoPaint();
                brushTextureTile = prepareTileSource(image, BASE_TEXTURE_GPU_SIZE);
                brushGpuTexture?.dispose();
                brushGpuTexture = createGpuTileTexture(image);
                brushTextureDataUrl = String(reader.result);
                brushTextureBtn?.classList.add("is-active");
                if (brushTextureBtn) brushTextureBtn.textContent = "Pinceau texturé actif";
                if (brushTextureClearBtn) brushTextureClearBtn.hidden = false;
                setMode("paint");
                renderTerrainTexture();
                void ensureLabFullscreenAfterFile();
            };
            image.onerror = () => void ensureLabFullscreenAfterFile();
            image.src = String(reader.result);
        };
        reader.onerror = () => void ensureLabFullscreenAfterFile();
        reader.readAsDataURL(file);
    });

    normalBtn?.addEventListener("click", () => {
        if (normalInput) void pickFilePreservingFullscreen(normalInput);
    });
    normalClearBtn?.addEventListener("click", () => {
        baseNormalImage = null;
        baseNormalTextureDataUrl = null;
        baseNormalGpuTexture?.dispose();
        baseNormalGpuTexture = null;
        normalBtn?.classList.remove("is-active");
        if (normalClearBtn) normalClearBtn.hidden = true;
        renderTerrainTexture();
    });
    normalInput?.addEventListener("change", () => {
        const file = normalInput.files?.[0];
        normalInput.value = "";
        void restoreFullscreenNow();
        if (!file || !/^image\/(jpeg|png)$/i.test(file.type)) {
            void ensureLabFullscreenAfterFile();
            return;
        }
        const reader = new FileReader();
        reader.onload = () => {
            const image = new Image();
            image.onload = () => {
                baseNormalImage = prepareTileSource(image, BASE_TEXTURE_GPU_SIZE);
                baseNormalGpuTexture?.dispose();
                baseNormalGpuTexture = createGpuTileTexture(image, { normal: true });
                baseNormalTextureDataUrl = String(reader.result);
                normalBtn?.classList.add("is-active");
                if (normalClearBtn) normalClearBtn.hidden = false;
                renderTerrainTexture();
                void ensureLabFullscreenAfterFile();
            };
            image.onerror = () => void ensureLabFullscreenAfterFile();
            image.src = String(reader.result);
        };
        reader.onerror = () => void ensureLabFullscreenAfterFile();
        reader.readAsDataURL(file);
    });

    brushNormalBtn?.addEventListener("click", () => {
        if (brushNormalInput) void pickFilePreservingFullscreen(brushNormalInput);
    });
    brushNormalClearBtn?.addEventListener("click", () => {
        brushNormalTile = null;
        brushNormalBtn?.classList.remove("is-active");
        if (brushNormalClearBtn) brushNormalClearBtn.hidden = true;
        syncPaintOverlayUniform();
    });
    brushNormalInput?.addEventListener("change", () => {
        const file = brushNormalInput.files?.[0];
        brushNormalInput.value = "";
        void restoreFullscreenNow();
        if (!file || !/^image\/(jpeg|png)$/i.test(file.type)) {
            void ensureLabFullscreenAfterFile();
            return;
        }
        const reader = new FileReader();
        reader.onload = () => {
            const image = new Image();
            image.onload = () => {
                brushNormalTile = prepareTileSource(image, BASE_TEXTURE_GPU_SIZE);
                brushNormalGpuTexture?.dispose();
                brushNormalGpuTexture = createGpuTileTexture(image, { normal: true });
                brushNormalTextureDataUrl = String(reader.result);
                brushNormalBtn?.classList.add("is-active");
                if (brushNormalClearBtn) brushNormalClearBtn.hidden = false;
                if (brushGpuTexture || brushTextureTile || brushNormalTile) setMode("paint");
                syncPaintOverlayUniform();
                void ensureLabFullscreenAfterFile();
            };
            image.onerror = () => void ensureLabFullscreenAfterFile();
            image.src = String(reader.result);
        };
        reader.onerror = () => void ensureLabFullscreenAfterFile();
        reader.readAsDataURL(file);
    });

    normalScaleInput?.addEventListener("input", () => {
        normalScale = THREE.MathUtils.clamp(
            Number(normalScaleInput.value) || DEFAULT_NORMAL_SCALE,
            NORMAL_SCALE_MIN,
            NORMAL_SCALE_MAX
        );
        if (normalScaleValue) normalScaleValue.textContent = normalScale.toFixed(2);
        syncTerrainNormalMaterial();
    });
    bindRangeSliderWheel(
        normalScaleInput,
        (value) => {
            normalScale = value;
            if (normalScaleValue) normalScaleValue.textContent = value.toFixed(2);
            syncTerrainNormalMaterial();
        },
        { step: NORMAL_SCALE_STEP }
    );

    undoBtn?.addEventListener("click", () => {
        void performTerrainUndo();
    });
    redoBtn?.addEventListener("click", () => {
        void performTerrainRedo();
    });

    // NB : plus d’écouteur clavier local — l’arbitrage Ctrl+Z / Ctrl+Y entre
    // historique de scène et coups de pinceau terrain est centralisé dans
    // l’éditeur (comparaison chronologique via getLastUndoAt / getLastRedoAt).

    function tryUndoShortcut() {
        if (undoInProgress || !terrain || undoStack.length === 0) return false;
        void performTerrainUndo();
        return true;
    }

    function tryRedoShortcut() {
        if (undoInProgress || !terrain || redoStack.length === 0) return false;
        void performTerrainRedo();
        return true;
    }

    function getUndoDepth() {
        return undoStack.length;
    }

    function getRedoDepth() {
        return redoStack.length;
    }

    /** Horodatage du dernier coup de pinceau annulable (0 si aucun). */
    function getLastUndoAt() {
        const top = undoStack[undoStack.length - 1];
        return typeof top?.at === "number" ? top.at : 0;
    }

    /** Horodatage du prochain coup de pinceau rétablissable (0 si aucun). */
    function getLastRedoAt() {
        const top = redoStack[redoStack.length - 1];
        return typeof top?.at === "number" ? top.at : 0;
    }

    function isUndoInProgress() {
        return undoInProgress;
    }

    resetBtn?.addEventListener("click", () => {
        if (!terrain) return;
        pushHistoryState();
        const positions = terrain.geometry.attributes.position;
        for (let i = 0; i < positions.count; i += 1) positions.setY(i, 0);
        positions.needsUpdate = true;
        terrain.geometry.computeVertexNormals();
        terrain.geometry.computeBoundingSphere();
        terrain.geometry.computeBoundingBox();
        updateTerrainGridLevel();
        markHeightMapDirty();
        redoStack.length = 0;
        updateHistoryUi();
    });

    /**
     * @param {{ recordHistory?: boolean }} [opts]
     */
    function clear({ recordHistory = true } = {}) {
        const before = recordHistory && terrain ? serialize() : null;
        setEditing(false);
        if (terrain) {
            unregisterCollidable(terrain);
            scene.remove(terrain);
            terrain.geometry.dispose();
            material?.dispose();
            canvasTexture?.dispose();
            paintOverlayTexture?.dispose();
            brushMaskTexture?.dispose();
            paintNormalMaskTexture?.dispose();
            normalCanvasTexture?.dispose();
        }
        clearOsmBuildings(scene, sceneRegistry);
        clearOsmRoads(scene, sceneRegistry);
        terrain = null;
        setIgnLoading(false);
        material = null;
        canvasTexture = null;
        paintOverlayTexture = null;
        brushMaskTexture = null;
        paintNormalMaskTexture = null;
        normalCanvasTexture = null;
        disposeHeightTexture();
        disposeBaseGpuTextures();
        disposeBrushGpuTextures();
        baseImage = null;
        baseTextureDataUrl = null;
        geoAlignedBase = false;
        resetLayerUrls();
        orthoMix = 1;
        showRoads = true;
        if (orthoMixInput) orthoMixInput.value = "100";
        if (orthoMixValue) orthoMixValue.textContent = "100 %";
        if (showRoadsInput) showRoadsInput.checked = true;
        groundCache = { ortho: null, roadMask: null, splat: null, osmElements: null, osmBbox: null };
        baseNormalImage = null;
        baseNormalTextureDataUrl = null;
        brushTextureTile = null;
        brushNormalTile = null;
        brushTextureDataUrl = null;
        brushNormalTextureDataUrl = null;
        paintNormalUsed = false;
        brushMaskUsed = false;
        normalScale = DEFAULT_NORMAL_SCALE;
        brushTextureBtn?.classList.remove("is-active");
        if (brushTextureBtn) brushTextureBtn.textContent = "Texture du pinceau";
        if (brushTextureClearBtn) brushTextureClearBtn.hidden = true;
        normalBtn?.classList.remove("is-active");
        if (normalClearBtn) normalClearBtn.hidden = true;
        brushNormalBtn?.classList.remove("is-active");
        if (brushNormalClearBtn) brushNormalClearBtn.hidden = true;
        if (normalScaleInput) normalScaleInput.value = String(DEFAULT_NORMAL_SCALE);
        if (normalScaleValue) normalScaleValue.textContent = DEFAULT_NORMAL_SCALE.toFixed(2);
        coverFloor(false);
        sceneRegistry?.unregister(TERRAIN_SCENE_ITEM_ID);
        paintCtx?.clearRect(0, 0, PAINT_SIZE, PAINT_SIZE);
        brushMaskCtx?.clearRect(0, 0, PAINT_SIZE, PAINT_SIZE);
        paintNormalCtx?.clearRect(0, 0, PAINT_SIZE, PAINT_SIZE);
        if (gridHelper) gridHelper.position.y = 0.02;
        sizeMeters = GRID_SIZE;
        meshSegments = segmentsForTerrainSize(GRID_SIZE);
        setWorldSize?.(GRID_SIZE);
        syncSizeUi();
        undoStack.length = 0;
        redoStack.length = 0;
        tools?.setAttribute("hidden", "");
        updateCreateButton();
        updateHistoryUi();
        if (recordHistory && before) {
            pushSceneHistory?.({ type: "terrain", before, after: null });
        }
    }

    function serialize() {
        if (!terrain) return null;
        const positions = terrain.geometry.attributes.position;
        const heights = [];
        for (let i = 0; i < positions.count; i += 1) {
            heights.push(Number(positions.getY(i).toFixed(4)));
        }
        return {
            version: 5,
            segments: meshSegments,
            sizeMeters,
            heights,
            color: baseColor,
            textureDataUrl: baseTextureDataUrl,
            normalTextureDataUrl: baseNormalTextureDataUrl,
            brushTextureDataUrl,
            brushNormalTextureDataUrl,
            normalScale,
            textureTile,
            paintTextureTile,
            paintDataUrl: paintCanvas.toDataURL("image/png"),
            paintNormalDataUrl: paintNormalCanvas.toDataURL("image/png"),
            brushMaskDataUrl: brushMaskCanvas.toDataURL("image/png"),
            ignCenter: terrain.userData?.ignCenter ?? null,
            geoAligned: geoAlignedBase,
            orthoMix,
            showRoads,
            layerUrls,
        };
    }

    /**
     * @param {unknown} data
     * @param {{ recordHistory?: boolean }} [opts]
     */
    async function deserialize(data, { recordHistory = false } = {}) {
        clear({ recordHistory: false });
        if (!data || typeof data !== "object") return;
        const raw = /** @type {Record<string, unknown>} */ (data);
        sizeMeters = Math.max(10, Math.min(2000, Number(raw.sizeMeters) || GRID_SIZE));
        if (Array.isArray(raw.heights)) {
            const n = raw.heights.length;
            const savedSeg = Number(raw.segments);
            const fromCount = Math.round(Math.sqrt(n) - 1);
            if (Number.isFinite(savedSeg) && savedSeg >= 8 && savedSeg <= TERRAIN_SEGMENTS_MAX) {
                meshSegments = savedSeg;
            } else if (fromCount >= 8 && (fromCount + 1) * (fromCount + 1) === n) {
                meshSegments = fromCount;
            } else {
                meshSegments = segmentsForTerrainSize(sizeMeters);
            }
        } else {
            meshSegments = segmentsForTerrainSize(sizeMeters);
        }
        syncSizeUi();
        makeTerrain({ recordHistory: false });
        if (raw.ignCenter && typeof raw.ignCenter === "object") {
            const ign = /** @type {{ lat?: number, lon?: number }} */ (raw.ignCenter);
            if (Number.isFinite(ign.lat) && Number.isFinite(ign.lon) && terrain) {
                terrain.userData.ignCenter = { lat: ign.lat, lon: ign.lon };
            }
        }
        geoAlignedBase = raw.geoAligned === true;
        orthoMix = typeof raw.orthoMix === "number" ? THREE.MathUtils.clamp(raw.orthoMix, 0, 1) : 1;
        if (orthoMixInput) orthoMixInput.value = String(Math.round(orthoMix * 100));
        if (orthoMixValue) orthoMixValue.textContent = `${Math.round(orthoMix * 100)} %`;
        showRoads = raw.showRoads !== false;
        if (showRoadsInput) showRoadsInput.checked = showRoads;
        if (raw.layerUrls && typeof raw.layerUrls === "object") {
            const next = /** @type {Record<string, { color?: string, normal?: string }>} */ (raw.layerUrls);
            for (const id of GROUND_LAYER_IDS) {
                if (next[id]?.color) layerUrls[id] = { ...layerUrls[id], ...next[id] };
            }
        }
        const positions = terrain.geometry.attributes.position;
        if (Array.isArray(raw.heights)) {
            const count = Math.min(positions.count, raw.heights.length);
            for (let i = 0; i < count; i += 1) positions.setY(i, Number(raw.heights[i]) || 0);
            positions.needsUpdate = true;
            terrain.geometry.computeVertexNormals();
        }
        baseColor = typeof raw.color === "string" ? raw.color : "#455838";
        if (colorInput) colorInput.value = baseColor;
        textureTile =
            typeof raw.textureTile === "number"
                ? THREE.MathUtils.clamp(raw.textureTile, TEXTURE_TILE_MIN, TERRAIN_TEXTURE_TILE_MAX)
                : DEFAULT_TEXTURE_TILE;
        if (textureTileInput) textureTileInput.value = String(textureTile);
        if (textureTileValue) textureTileValue.textContent = textureTile.toFixed(2);
        paintTextureTile =
            typeof raw.paintTextureTile === "number"
                ? THREE.MathUtils.clamp(
                      raw.paintTextureTile,
                      TERRAIN_PAINT_TEXTURE_TILE_MIN,
                      TERRAIN_PAINT_TEXTURE_TILE_MAX
                  )
                : DEFAULT_TEXTURE_TILE;
        if (paintTileInput) paintTileInput.value = String(paintTextureTile);
        if (paintTileValue) paintTileValue.textContent = paintTextureTile.toFixed(2);
        baseTextureDataUrl =
            typeof raw.textureDataUrl === "string" ? raw.textureDataUrl : null;
        if (baseTextureDataUrl) {
            await new Promise((resolve) => {
                const image = new Image();
                image.onload = () => {
                    baseImage = prepareTileSource(image, BASE_TEXTURE_GPU_SIZE);
                    baseGpuTexture?.dispose();
                    baseGpuTexture = createGpuTileTexture(image, { geoAligned: geoAlignedBase });
                    resolve(null);
                };
                image.onerror = () => resolve(null);
                image.src = baseTextureDataUrl;
            });
        }
        baseNormalTextureDataUrl =
            typeof raw.normalTextureDataUrl === "string" ? raw.normalTextureDataUrl : null;
        if (baseNormalTextureDataUrl) {
            await new Promise((resolve) => {
                const image = new Image();
                image.onload = () => {
                    baseNormalImage = prepareTileSource(image, BASE_TEXTURE_GPU_SIZE);
                    baseNormalGpuTexture?.dispose();
                    baseNormalGpuTexture = createGpuTileTexture(image, {
                        normal: true,
                        geoAligned: geoAlignedBase,
                    });
                    normalBtn?.classList.add("is-active");
                    if (normalClearBtn) normalClearBtn.hidden = false;
                    resolve(null);
                };
                image.onerror = () => resolve(null);
                image.src = baseNormalTextureDataUrl;
            });
        } else {
            baseNormalImage = null;
        }
        brushTextureDataUrl =
            typeof raw.brushTextureDataUrl === "string" ? raw.brushTextureDataUrl : null;
        if (brushTextureDataUrl) {
            await new Promise((resolve) => {
                const image = new Image();
                image.onload = () => {
                    brushTextureTile = prepareTileSource(image, BASE_TEXTURE_GPU_SIZE);
                    brushGpuTexture?.dispose();
                    brushGpuTexture = createGpuTileTexture(image);
                    brushTextureBtn?.classList.add("is-active");
                    if (brushTextureBtn) brushTextureBtn.textContent = "Pinceau texturé actif";
                    if (brushTextureClearBtn) brushTextureClearBtn.hidden = false;
                    resolve(null);
                };
                image.onerror = () => resolve(null);
                image.src = brushTextureDataUrl;
            });
        }
        brushNormalTextureDataUrl =
            typeof raw.brushNormalTextureDataUrl === "string" ? raw.brushNormalTextureDataUrl : null;
        if (brushNormalTextureDataUrl) {
            await new Promise((resolve) => {
                const image = new Image();
                image.onload = () => {
                    brushNormalTile = prepareTileSource(image, BASE_TEXTURE_GPU_SIZE);
                    brushNormalGpuTexture?.dispose();
                    brushNormalGpuTexture = createGpuTileTexture(image, { normal: true });
                    brushNormalBtn?.classList.add("is-active");
                    if (brushNormalClearBtn) brushNormalClearBtn.hidden = false;
                    resolve(null);
                };
                image.onerror = () => resolve(null);
                image.src = brushNormalTextureDataUrl;
            });
        }
        normalScale =
            typeof raw.normalScale === "number"
                ? THREE.MathUtils.clamp(raw.normalScale, NORMAL_SCALE_MIN, NORMAL_SCALE_MAX)
                : DEFAULT_NORMAL_SCALE;
        if (normalScaleInput) normalScaleInput.value = String(normalScale);
        if (normalScaleValue) normalScaleValue.textContent = normalScale.toFixed(2);
        await restorePaint(typeof raw.paintDataUrl === "string" ? raw.paintDataUrl : null);
        await restorePaintNormal(
            typeof raw.paintNormalDataUrl === "string" ? raw.paintNormalDataUrl : null
        );
        await restoreBrushMask(
            typeof raw.brushMaskDataUrl === "string" ? raw.brushMaskDataUrl : null
        );
        renderTerrainTexture();
        updateTerrainGridLevel();
        markHeightMapDirty();
        syncTerrainSceneItem();
        setEditing(false);
        if (recordHistory) {
            pushSceneHistory?.({ type: "terrain", before: null, after: serialize() });
        }
    }

    syncSizeUi();
    updateHistoryUi();
    return {
        clear,
        serialize,
        deserialize,
        hasTerrain: () => !!terrain,
        getTerrain: () => terrain,
        getIgnCenter: () => ignCenterOrNull(),
        getSizeMeters: () => sizeMeters,
        sampleTerrainY,
        getHeightMapInfo,
        setEditing,
        tryUndoShortcut,
        tryRedoShortcut,
        getUndoDepth,
        getRedoDepth,
        getLastUndoAt,
        getLastRedoAt,
        isUndoInProgress,
        /**
         * @param {((entry: { type: "terrain", before: object | null, after: object | null }) => void) | null} fn
         */
        setSceneHistoryPush(fn) {
            pushSceneHistory = fn;
        },
        applyTerrainSize,
        /**
         * Active une texture de pinceau depuis une data URL (ex. sol lié à un végétal).
         * @param {string} dataUrl
         * @param {{ activatePaint?: boolean }} [opts]
         */
        applyBrushTextureFromDataUrl(dataUrl, { activatePaint = true } = {}) {
            if (!dataUrl || typeof dataUrl !== "string") return Promise.resolve(false);
            if (!terrain) makeTerrain({ recordHistory: false });
            if (brushTextureDataUrl === dataUrl && brushTextureTile && brushGpuTexture) {
                if (activatePaint) {
                    setMode("paint");
                    setEditing(true);
                }
                return Promise.resolve(true);
            }
            return new Promise((resolve) => {
                const image = new Image();
                image.onload = () => {
                    if (brushTextureDataUrl && brushTextureDataUrl !== dataUrl) {
                        bakeBrushMaskIntoPaint();
                    }
                    brushTextureTile = prepareTileSource(image, BASE_TEXTURE_GPU_SIZE);
                    brushGpuTexture?.dispose();
                    brushGpuTexture = createGpuTileTexture(image);
                    brushTextureDataUrl = dataUrl;
                    brushTextureBtn?.classList.add("is-active");
                    if (brushTextureBtn) brushTextureBtn.textContent = "Pinceau texturé actif";
                    if (brushTextureClearBtn) brushTextureClearBtn.hidden = false;
                    if (activatePaint) {
                        setMode("paint");
                        setEditing(true);
                    }
                    syncPaintOverlayUniform();
                    renderTerrainTexture();
                    resolve(true);
                };
                image.onerror = () => resolve(false);
                image.src = dataUrl;
            });
        },
        /**
         * Tampon pinceau (texture ou couleur) à une position monde.
         * @param {number} worldX
         * @param {number} worldZ
         * @param {number} radiusMeters
         */
        stampBrushAtWorld(worldX, worldZ, radiusMeters) {
            if (!terrain || !paintCtx) return false;
            const half = sizeMeters * 0.5;
            if (worldX < -half || worldX > half || worldZ < -half || worldZ > half) return false;
            const u = (worldX + half) / sizeMeters;
            const v = (worldZ + half) / sizeMeters;
            const x = u * PAINT_SIZE;
            const y = (1 - v) * PAINT_SIZE;
            const prevRadius = radius;
            radius = Math.max(0.15, Number(radiusMeters) || 0.15);
            const before = captureState();
            paintAt(x, y);
            radius = prevRadius;
            renderTerrainTexture();
            if (before) {
                before.at = Date.now();
                undoStack.push(before);
                if (undoStack.length > MAX_HISTORY) undoStack.shift();
                redoStack.length = 0;
                updateHistoryUi();
            }
            return true;
        },
        ensureTerrain() {
            return makeTerrain({ recordHistory: true });
        },
        importIgnRelief,
        carveRiverBed,
        restoreRiverBed,
    };
}
