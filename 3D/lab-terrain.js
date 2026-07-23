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

export const LAB_TERRAIN_KEY = "labTerrain";
export const TERRAIN_SCENE_ITEM_ID = "env-terrain";
const TERRAIN_SEGMENTS = 100;
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

/** Ctrl+Z (touche physique KeyZ ; sur AZERTY la touche Z produit « w »). */
function isUndoShortcut(event) {
    if (!(event.ctrlKey || event.metaKey) || event.shiftKey) return false;
    return event.code === "KeyZ" || event.key.toLowerCase() === "z";
}

function isRedoShortcut(event) {
    if (!(event.ctrlKey || event.metaKey)) return false;
    const key = event.key.toLowerCase();
    return (
        event.code === "KeyY" ||
        key === "y" ||
        (event.shiftKey && (event.code === "KeyZ" || key === "z"))
    );
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

    const HEIGHT_MAP_RES = TERRAIN_SEGMENTS + 1;
    let sizeMeters = GRID_SIZE;
    const createBtn = /** @type {HTMLButtonElement | null} */ (
        document.getElementById("btn-create-terrain")
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
     * @param {{ normal?: boolean }} [opts]
     */
    function createGpuTileTexture(source, { normal = false } = {}) {
        const maxTex = Math.min(
            BASE_TEXTURE_GPU_SIZE,
            renderer.capabilities.maxTextureSize || BASE_TEXTURE_GPU_SIZE
        );
        const tileCanvas = prepareTileSource(source, maxTex);
        const tex = new THREE.CanvasTexture(tileCanvas);
        tex.wrapS = THREE.RepeatWrapping;
        tex.wrapT = THREE.RepeatWrapping;
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
            baseGpuTexture.repeat.set(tile, tile);
            baseGpuTexture.offset.set(0, 0);
            baseGpuTexture.needsUpdate = true;
            material.map = baseGpuTexture;
            // Teinte légère : la texture porte la couleur (évite double saturation verte).
            const tint = new THREE.Color(baseColor);
            tint.lerp(new THREE.Color(0xffffff), 0.72);
            material.color.copy(tint);
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
        const res = HEIGHT_MAP_RES;
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
        heightTexture.needsUpdate = true;
        heightMapDirty = false;
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

    function frameTerrainView() {
        if (terrain) focusOnTerrain?.(terrain);
    }

    function syncTerrainNormalMaterial() {
        if (!material) return;
        const tile = Math.max(TEXTURE_TILE_MIN, textureTile);
        if (baseNormalGpuTexture) {
            baseNormalGpuTexture.repeat.set(tile, tile);
            baseNormalGpuTexture.offset.set(0, 0);
            material.normalMap = baseNormalGpuTexture;
            material.normalScale.set(normalScale, normalScale);
        } else if (normalCanvasTexture && paintNormalUsed && !brushNormalGpuTexture) {
            // Normales peintes cuites (anciennes scènes / sans GPU pinceau).
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
        const geometry = new THREE.PlaneGeometry(sizeMeters, sizeMeters, TERRAIN_SEGMENTS, TERRAIN_SEGMENTS);
        geometry.rotateX(-Math.PI / 2);
        return geometry;
    }

    /**
     * @param {{ recordHistory?: boolean }} [opts]
     */
    function makeTerrain({ recordHistory = true } = {}) {
        if (terrain) return terrain;
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
        terrain.userData.terrainSegments = TERRAIN_SEGMENTS;
        terrain.userData.terrainSize = sizeMeters;
        terrain.userData[COLLISION_KEY] = true;
        scene.add(terrain);
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
            if (current) redoStack.push(current);
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
            if (current) undoStack.push(current);
            await restoreState(next);
            updateHistoryUi();
            return true;
        } finally {
            undoInProgress = false;
        }
    }

    function commitStroke() {
        if (!strokeBefore) return;
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
            const row = TERRAIN_SEGMENTS + 1;
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
     * @param {number} nextSize
     * @param {{ recordHistory?: boolean }} [opts]
     */
    function applyTerrainSize(nextSize, { recordHistory = true } = {}) {
        const size = Math.max(10, Math.min(500, Number(nextSize) || GRID_SIZE));
        if (Math.abs(size - sizeMeters) < 0.001) {
            syncSizeUi();
            return;
        }
        const before = terrain && recordHistory ? serialize() : null;
        sizeMeters = size;
        syncSizeUi();
        setWorldSize?.(sizeMeters);
        if (!terrain) return;

        const heights = [];
        const positions = terrain.geometry.attributes.position;
        for (let i = 0; i < positions.count; i += 1) heights.push(positions.getY(i));

        const prev = terrain.geometry;
        const geometry = createTerrainGeometry();
        const nextPos = geometry.attributes.position;
        const count = Math.min(nextPos.count, heights.length);
        for (let i = 0; i < count; i += 1) nextPos.setY(i, heights[i] || 0);
        nextPos.needsUpdate = true;
        geometry.computeVertexNormals();
        geometry.computeBoundingSphere();
        geometry.computeBoundingBox();
        terrain.geometry = geometry;
        terrain.userData.terrainSize = sizeMeters;
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

    textureBtn?.addEventListener("click", () => {
        if (textureInput) void pickFilePreservingFullscreen(textureInput);
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

    function consumeUndoShortcut(event) {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
    }

    window.addEventListener(
        "keydown",
        (event) => {
            if (!terrain || (undoStack.length === 0 && redoStack.length === 0)) return;
            // Laisser Ctrl+Z au mode triangulation (sélection / texture triangles).
            if (document.documentElement.classList.contains("lab-triangulation-mode")) return;
            if (isRedoShortcut(event)) {
                if (redoStack.length === 0) return;
                consumeUndoShortcut(event);
                void performTerrainRedo();
                return;
            }
            if (!isUndoShortcut(event)) return;
            if (undoStack.length === 0) return;
            consumeUndoShortcut(event);
            void performTerrainUndo();
        },
        true
    );

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
        terrain = null;
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
            version: 4,
            segments: TERRAIN_SEGMENTS,
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
        sizeMeters = Math.max(10, Math.min(500, Number(raw.sizeMeters) || GRID_SIZE));
        syncSizeUi();
        makeTerrain({ recordHistory: false });
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
                    baseGpuTexture = createGpuTileTexture(image);
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
                    baseNormalGpuTexture = createGpuTileTexture(image, { normal: true });
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
        getHeightMapInfo,
        setEditing,
        tryUndoShortcut,
        tryRedoShortcut,
        getUndoDepth,
        getRedoDepth,
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
    };
}
