/** Objets de scène : placement, sélection, transformation, collisions. */
import * as THREE from "three";
import { TransformControls } from "three/addons/controls/TransformControls.js";
import {
    COLLISION_KEY,
    registerCollidable,
    unregisterCollidable,
} from "./lab-collision.js";
import { CUBE_SIZE, GRID_STEP, snapValue } from "./grid-constants.js";
import {
    applyTransformSnap,
    formatObjectTransform,
    snapMeshByMode,
    snapMeshToFloor,
    snapMeshTranslate,
} from "./transform-snapping.js";
import {
    captureObjectState,
    createHistory,
    objectStatesEqual,
} from "./lab-history.js";
import {
    applyObjectTexture,
    getObjectTextureDataUrl,
    releaseObjectTexture,
} from "./lab-object-textures.js";
import { initObjectContextMenu } from "./lab-context-menu.js";
import {
    buildSceneDocument,
    clearSceneFileSession,
    getCurrentSceneFileName,
    hasDiskFileHandle,
    openSceneFromDiskLocation,
    parseSceneDocument,
    readSceneFromLibrary,
    saveSceneToDiskLocation,
    serializeObjectSnapshot,
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
    isLabLight,
    isLightMarkerVisible,
    isLightSceneVisible,
    LIGHT_TYPE,
    SCENE_ITEM_ID_KEY,
    setLightIntensity,
    setLightMarkerVisible,
    setLightSceneVisible,
    updateLightHelpers,
} from "./lab-lights.js";
import {
    getLightShadowEnabled,
    getObjectShadowEnabled,
    setLightShadowEnabled,
    setObjectShadowEnabled,
} from "./lab-shadows.js";

export const LAB_OBJECT_KEY = "labObject";
export const OBJECT_COLOR_KEY = "objectColor";
export const DEFAULT_OBJECT_COLOR = "#00d1ff";
export { COLLISION_KEY };

const DRAG_MIME = "application/x-lab-cube";
const SPAWN_DISTANCE = 2.5;

const floorPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const hitPoint = new THREE.Vector3();
const lightPickPoint = new THREE.Vector3();
const LIGHT_PICK_RADIUS = 0.55;

/**
 * @param {{
 *   scene: THREE.Scene,
 *   camera: THREE.Camera,
 *   renderer: THREE.WebGLRenderer,
 *   viewport: HTMLElement,
 *   yaw: THREE.Object3D,
 *   playerRoot: THREE.Object3D,
 *   spawnBtn: HTMLButtonElement,
 *   lightBtns?: { spot?: HTMLButtonElement | null, sun?: HTMLButtonElement | null, lamp?: HTMLButtonElement | null },
 *   modeBtns: NodeListOf<HTMLButtonElement>,
 *   snapBtns: NodeListOf<HTMLButtonElement>,
 *   objectInfoPanel: HTMLElement,
 *   focusOnObject?: (object: THREE.Object3D) => void,
 *   onGizmoDraggingChange?: (dragging: boolean) => void,
 *   setCanvasRightClickHandler: (fn: (e: MouseEvent) => void) => void,
 *   setCanvasDoubleClickHandler: (fn: (e: MouseEvent) => void) => void,
 *   setAfterRender?: (fn: () => void) => void,
 *   getPointerRect?: () => DOMRect,
 *   canInteractAt?: (clientX: number, clientY: number) => boolean,
 *   sceneRegistry?: ReturnType<import("./lab-scene-registry.js").createSceneRegistry> | null,
 *   isGizmoDragging?: () => boolean,
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
        lightBtns,
        modeBtns,
        snapBtns,
        objectInfoPanel,
        focusOnObject,
        onGizmoDraggingChange,
        setCanvasRightClickHandler,
        setCanvasDoubleClickHandler,
        setAfterRender,
        getPointerRect,
        canInteractAt,
        sceneRegistry,
        isGizmoDragging,
    } = ctx;

    const editableObjects = [];
    const history = createHistory();
    let cubeCounter = 0;
    /** @type {Record<string, number>} */
    const lightCounters = { spot: 0, directional: 0, point: 0 };
    let selectedObject = null;
    let selectionHighlight = false;
    let gizmoActive = false;
    let currentMode = "translate";
    const snapByMode = { translate: true, rotate: true, scale: true };
    let suppressClick = false;
    let ignoreClickAfterGizmo = false;
    let transformBefore = null;
    /** @type {THREE.BoxHelper | null} */
    let selectionHelper = null;

    /** @type {ReturnType<typeof captureFullSnapshot> | null} */
    let clipboard = null;

    const EMISSIVE_SELECTED = 0x0e4a6e;

    function shouldShowSelectionHighlight(object) {
        return (
            !!object &&
            object === selectedObject &&
            selectionHighlight &&
            !object.userData[COLLISION_KEY]
        );
    }

    function syncSelectionVisuals(object = selectedObject) {
        if (shouldShowSelectionHighlight(object)) {
            setSelectionOutline(object);
        } else {
            setSelectionOutline(null);
        }
        if (object) updateObjectVisual(object);
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

    transformControls.addEventListener("dragging-changed", (event) => {
        onGizmoDraggingChange?.(event.value);
        if (event.value && selectedObject) {
            transformBefore = captureObjectState(selectedObject);
        }
        if (!event.value) {
            ignoreClickAfterGizmo = true;
            if (selectedObject) {
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
        }
    });

    transformControls.addEventListener("objectChange", () => {
        if (!selectedObject) return;
        if (snapByMode[currentMode]) {
            snapMeshByMode(selectedObject, currentMode, snapByMode);
        }
        refreshObjectDisplay(selectedObject);
        if (selectionHelper) selectionHelper.update();
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
            id = isLabLight(object) ? `light-${object.uuid}` : `cube-${object.uuid}`;
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
                select: () => selectObject(object, { highlight: true }),
                onDelete: () => deleteObject(object),
            });
            return;
        }

        if (!object.userData.sceneItemLabel) {
            cubeCounter += 1;
            object.userData.sceneItemLabel = `Cube ${cubeCounter}`;
        }
        sceneRegistry.register({
            id,
            label: object.userData.sceneItemLabel,
            category: "object",
            getVisible: () => object.visible,
            setVisible: (visible) => {
                object.visible = visible;
            },
            getShadow: () => getObjectShadowEnabled(object),
            setShadow: (enabled) => {
                setObjectShadowEnabled(object, enabled);
                showStatus(enabled ? "Ombres activées (objet)" : "Ombres désactivées (objet)");
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
        setObjectShadowEnabled(object, false);
        if (object.userData[OBJECT_COLOR_KEY] === undefined) {
            object.userData[OBJECT_COLOR_KEY] = DEFAULT_OBJECT_COLOR;
        }
        if (!editableObjects.includes(object)) {
            editableObjects.push(object);
        }
        registerCollidable(object);
        updateObjectVisual(object);
        registerSceneItem(object);
        return object;
    }

    function getObjectColor(object) {
        return object?.userData?.[OBJECT_COLOR_KEY] || DEFAULT_OBJECT_COLOR;
    }

    function applyObjectColor(object, colorHex) {
        object.userData[OBJECT_COLOR_KEY] = colorHex;
        object.traverse((child) => {
            if (child instanceof THREE.Mesh) {
                child.material.color.set(colorHex);
            }
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
            if (!(child instanceof THREE.Mesh)) return;
            child.material.emissive.setHex(showHighlight ? EMISSIVE_SELECTED : 0x000000);
        });
    }

    function setSelectionOutline(object) {
        if (selectionHelper) {
            scene.remove(selectionHelper);
            selectionHelper = null;
        }
        if (!shouldShowSelectionHighlight(object)) return;
        selectionHelper = new THREE.BoxHelper(object, 0x22d3ee);
        scene.add(selectionHelper);
    }

    function applyObjectState(object, state) {
        object.position.copy(state.position);
        object.rotation.copy(state.rotation);
        object.scale.copy(state.scale);

        if (isLabLight(object)) {
            if (state.markerVisible !== undefined) {
                setLightMarkerVisible(object, state.markerVisible);
            }
            if (typeof state.intensity === "number") {
                setLightIntensity(object, state.intensity);
            }
            if (state.shadowEnabled !== undefined) {
                setLightShadowEnabled(object, !!state.shadowEnabled);
            }
            updateObjectVisual(object);
            return;
        }

        object.userData[COLLISION_KEY] = state.collisionEnabled;
        if (state.shadowEnabled !== undefined) {
            setObjectShadowEnabled(object, !!state.shadowEnabled);
        }
        if (state.color) {
            applyObjectColor(object, state.color);
        }
        const textureUrl = state.textureDataUrl ?? null;
        applyObjectTexture(object, textureUrl).then(() => {
            if (!textureUrl && !state.color) updateObjectVisual(object);
            else updateObjectVisual(object);
        });
    }

    function captureFullSnapshot(object) {
        if (isLabLight(object)) {
            return {
                kind: "light",
                lightType: object.userData.lightType,
                markerVisible: isLightMarkerVisible(object),
                intensity: getLightIntensity(object),
                shadowEnabled: getLightShadowEnabled(object),
                ...captureObjectState(object),
            };
        }
        return {
            kind: "cube",
            ...captureObjectState(object),
            shadowEnabled: getObjectShadowEnabled(object),
            color: getObjectColor(object),
            textureDataUrl: getObjectTextureDataUrl(object),
        };
    }

    function setObjectColor(object, colorHex) {
        const before = getObjectColor(object);
        if (before === colorHex) return;
        applyObjectColor(object, colorHex);
        history.push({ type: "color", object, before, after: colorHex });
        contextMenu.syncProperty("color", colorHex);
        showStatus("Couleur modifiée");
    }

    function disposeObjectResources(object) {
        releaseObjectTexture(object);
        object.traverse((child) => {
            if (child instanceof THREE.Mesh) {
                child.geometry?.dispose();
                child.material?.dispose();
            }
        });
    }

    function removeFromScene(object, { dispose = true } = {}) {
        if (selectedObject === object) {
            selectedObject = null;
            syncGizmo();
            setSelectionOutline(null);
            refreshObjectDisplay(null);
        }
        scene.remove(object);
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

    function createCubeObject() {
        const pivot = new THREE.Group();
        const mesh = new THREE.Mesh(
            new THREE.BoxGeometry(CUBE_SIZE, CUBE_SIZE, CUBE_SIZE),
            new THREE.MeshLambertMaterial({ color: DEFAULT_OBJECT_COLOR })
        );
        pivot.add(mesh);
        pivot.userData[OBJECT_COLOR_KEY] = DEFAULT_OBJECT_COLOR;
        return registerLabObject(pivot);
    }

    function createCubeFromSnapshot(snapshot) {
        const object = createCubeObject();
        applyObjectState(object, snapshot);
        return object;
    }

    function createObjectFromSnapshot(snapshot) {
        if (snapshot.kind === "light") {
            const pivot = createLightPivot(snapshot.lightType);
            registerLabLight(pivot);
            pivot.position.copy(snapshot.position);
            pivot.rotation.copy(snapshot.rotation);
            pivot.scale.copy(snapshot.scale);
            setLightMarkerVisible(pivot, snapshot.markerVisible !== false);
            if (typeof snapshot.intensity === "number") {
                setLightIntensity(pivot, snapshot.intensity);
            }
            return pivot;
        }
        return createCubeFromSnapshot(snapshot);
    }

    function removeAllObjects() {
        const objects = [...editableObjects];
        for (const object of objects) {
            removeFromScene(object);
        }
        deselectObject();
    }

    function exportSceneDocument() {
        return buildSceneDocument(
            editableObjects.map((object) => serializeObjectSnapshot(captureFullSnapshot(object))),
            { name: getCurrentSceneFileName() || "" }
        );
    }

    function importSceneDocument(data, { fileName = null } = {}) {
        const snapshots = parseSceneDocument(data);
        removeAllObjects();
        for (const snapshot of snapshots) {
            addObjectFromSnapshot(snapshot, { recordHistory: false, select: false });
        }
        deselectObject();
        showStatus(fileName ? `Scène ouverte : ${fileName}` : "Scène ouverte");
    }

    function resetSceneFileState() {
        clearSceneFileSession();
    }

    async function newScene({ confirmIfNotEmpty = true } = {}) {
        if (confirmIfNotEmpty && editableObjects.length > 0) {
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

    async function openScene() {
        if (editableObjects.length > 0) {
            const ok = await labConfirm(
                "Ouvrir une scène ? La scène actuelle non enregistrée sera remplacée.",
                { title: "Ouvrir", confirmLabel: "Continuer" }
            );
            if (!ok) return;
        }

        try {
            const picked = await readSceneFromLibrary((scenes) => labPickScene(scenes));
            if (!picked) return;
            importSceneDocument(picked.data, { fileName: picked.name });
        } catch (error) {
            if (/** @type {DOMException} */ (error).name === "AbortError") return;
            showStatus(error instanceof Error ? error.message : "Impossible d'ouvrir la scène");
        }
    }

    async function openSceneFromDisk() {
        if (editableObjects.length > 0) {
            const ok = await labConfirm(
                "Ouvrir un fichier du disque ? La scène actuelle non enregistrée sera remplacée.",
                { title: "Ouvrir depuis le disque", confirmLabel: "Continuer" }
            );
            if (!ok) return;
        }

        try {
            const picked = await openSceneFromDiskLocation();
            if (!picked) return;
            importSceneDocument(picked.data, { fileName: picked.name });
        } catch (error) {
            if (/** @type {DOMException} */ (error).name === "AbortError") return;
            showStatus(error instanceof Error ? error.message : "Impossible d'ouvrir le fichier");
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
        if (editableObjects.length > 0) {
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

    function selectObject(object, { highlight = false } = {}) {
        const previous = selectedObject;
        selectedObject = object;
        selectionHighlight = !!highlight && !!object && !object.userData[COLLISION_KEY];
        if (previous && previous !== object) updateObjectVisual(previous);
        syncSelectionVisuals(object);
        syncGizmo();
        refreshObjectDisplay(object);
    }

    function deselectObject() {
        const previous = selectedObject;
        selectedObject = null;
        selectionHighlight = false;
        syncGizmo();
        setSelectionOutline(null);
        if (previous) updateObjectVisual(previous);
        refreshObjectDisplay(null);
        contextMenu.hide();
    }

    function addObjectToScene(object, { select = true, recordHistory = true, highlight = false } = {}) {
        scene.add(object);
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
        return addObjectAt(createCubeObject(), position ?? spawnPoint(), options);
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
        if (!selectedObject) return;
        deleteObject(selectedObject);
    }

    function copySelection() {
        if (!selectedObject) {
            showStatus("Aucun objet à copier");
            return;
        }
        if (isLabLight(selectedObject)) {
            showStatus("Les lumières ne peuvent pas être copiées");
            return;
        }
        selectedObject.updateMatrixWorld(true);
        clipboard = captureFullSnapshot(selectedObject);
        showStatus("Objet copié");
    }

    function pasteClipboard() {
        if (!clipboard) {
            showStatus("Presse-papiers vide");
            return;
        }
        addObjectFromSnapshot(clipboard, { recordHistory: true });
        showStatus("Objet collé");
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

    function applyHistoryEntry(entry, direction) {
        switch (entry.type) {
            case "add": {
                if (direction === "undo") {
                    removeFromScene(entry.object, { dispose: false });
                } else {
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
            default:
                break;
        }
    }

    document.addEventListener("keydown", (event) => {
        if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) {
            return;
        }

        const mod = event.ctrlKey || event.metaKey;
        const key = event.key.toLowerCase();

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
        if (mod && key === "z" && !event.shiftKey) {
            event.preventDefault();
            performUndo();
            return;
        }
        if (mod && (key === "y" || (event.shiftKey && key === "z"))) {
            event.preventDefault();
            performRedo();
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
                if (gizmoActive) {
                    event.preventDefault();
                    event.stopPropagation();
                    setSelectionOnlyMode();
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
        if (!raycaster.ray.intersectPlane(floorPlane, hitPoint)) return null;
        return hitPoint.clone();
    }

    function snapPlacement(position) {
        position.x = snapValue(position.x, GRID_STEP);
        position.z = snapValue(position.z, GRID_STEP);
        return position;
    }

    function pickLabObjectAt(clientX, clientY) {
        setPointerFromClient(clientX, clientY);
        raycaster.setFromCamera(pointer, camera);
        const objectHits = raycaster.intersectObjects(editableObjects, true);
        if (objectHits.length) return resolveLabObject(objectHits[0]);

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

    const canvas = renderer.domElement;

    canvas.addEventListener("dragover", (e) => {
        if (!e.dataTransfer.types.includes(DRAG_MIME)) return;
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
        if (!e.dataTransfer.types.includes(DRAG_MIME)) return;
        e.preventDefault();
        viewport.classList.remove("lab-viewport--drop");
        const pos = raycastToFloor(e.clientX, e.clientY);
        if (pos) spawnCubeAt(pos);
    });

    function resolveLabObject(hit) {
        let current = hit.object;
        while (current) {
            if (isEditableEntity(current)) return current;
            current = current.parent;
        }
        return null;
    }

    function handleCanvasRightClick(event) {
        if (isGizmoDragging?.()) return;
        if (canInteractAt && !canInteractAt(event.clientX, event.clientY)) return;

        const labObject = pickLabObjectAt(event.clientX, event.clientY);
        if (labObject) {
            selectObject(labObject, { highlight: true });
            if (isLabLight(labObject)) {
                contextMenu.show(event.clientX, event.clientY, labObject, {
                    kind: "light",
                    markerVisible: isLightMarkerVisible(labObject),
                    intensity: getLightIntensity(labObject),
                });
                return;
            }
            contextMenu.show(event.clientX, event.clientY, labObject, {
                kind: "object",
                collision: !!labObject.userData[COLLISION_KEY],
                color: getObjectColor(labObject),
                texture: getObjectTextureDataUrl(labObject),
            });
            return;
        }

        deselectObject();
        contextMenu.hide();
    }

    contextMenu.onPropertyChange((prop, object, value) => {
        if (prop === "collision") setCollision(object, !!value);
        if (prop === "light-marker-visible") setLightMarkerVisibility(object, !!value);
        if (prop === "light-intensity") setLightIntensityValue(object, Number(value));
        if (prop === "color-preview") applyObjectColor(object, String(value));
        if (prop === "color") setObjectColor(object, String(value));
        if (prop === "texture") setObjectTexture(object, value ? String(value) : null);
        if (prop === "texture-clear") setObjectTexture(object, null);
        if (prop === "texture-error") {
            showStatus(value instanceof Error ? value.message : "Texture invalide");
        }
    });

    function handleCanvasDoubleClick(event) {
        if (isGizmoDragging?.()) return;
        if (canInteractAt && !canInteractAt(event.clientX, event.clientY)) return;
        const labObject = pickLabObjectAt(event.clientX, event.clientY);
        if (!labObject) return;
        focusOnObject?.(labObject);
    }

    setCanvasRightClickHandler(handleCanvasRightClick);
    setCanvasDoubleClickHandler(handleCanvasDoubleClick);

    setAfterRender?.(() => {
        updateLightHelpers(editableObjects);
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

    return {
        deselectObject,
        spawnCubeAt,
        spawnLightAt,
        registerLabObject,
        setTransformMode,
        toggleCollision,
        transformControls,
        newScene,
        openScene,
        openSceneFromDisk,
        saveScene,
        saveSceneAs,
        saveSceneToDisk,
        closeScene,
    };
}
