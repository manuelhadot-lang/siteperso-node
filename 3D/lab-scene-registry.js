/** Registre des éléments de scène (visibilité, libellés). */

/**
 * @typedef {{
 *   id: string,
 *   label: string,
 *   category: "environment" | "object" | "light",
 *   icon?: "cube" | "stair" | "light-spot" | "light-sun" | "light-lamp" | "env" | "skybox",
 *   getVisible: () => boolean,
 *   setVisible: (visible: boolean) => void,
 *   select?: () => void,
 *   getIntensity?: () => number,
 *   setIntensity?: (value: number) => void,
 *   intensityMin?: number,
 *   intensityMax?: number,
 *   intensityStep?: number,
 *   intensityTitle?: string,
 *   detail?: string,
 *   isIntensityEnabled?: () => boolean,
 *   isVisibleEnabled?: () => boolean,
 *   canDelete?: () => boolean,
 *   getShadow?: () => boolean,
 *   setShadow?: (enabled: boolean) => void,
 *   getShadowOpacity?: () => number,
 *   setShadowOpacity?: (value: number) => void,
 *   onDelete?: () => void,
 * }} SceneRegistryItem
 */

export function createSceneRegistry() {
    /** @type {Map<string, SceneRegistryItem>} */
    const items = new Map();
    /** @type {Set<(items: SceneRegistryItem[]) => void>} */
    const listeners = new Set();

    function notify() {
        const list = getAll();
        listeners.forEach((fn) => fn(list));
    }

    /** @param {SceneRegistryItem} item */
    function register(item) {
        items.set(item.id, item);
        notify();
        return item.id;
    }

    /** @param {string} id */
    function unregister(id) {
        if (!items.delete(id)) return;
        notify();
    }

    /** @returns {SceneRegistryItem[]} */
    function getAll() {
        const order = { environment: 0, object: 1, light: 2 };
        return [...items.values()].sort((a, b) => {
            const cat = order[a.category] - order[b.category];
            if (cat !== 0) return cat;
            return a.label.localeCompare(b.label, "fr");
        });
    }

    function refresh() {
        notify();
    }

    /** @param {(items: SceneRegistryItem[]) => void} fn */
    function subscribe(fn) {
        listeners.add(fn);
        fn(getAll());
        return () => listeners.delete(fn);
    }

    /** @param {string} id @param {boolean} visible */
    function setVisible(id, visible) {
        const item = items.get(id);
        if (!item) return;
        item.setVisible(visible);
    }

    /** @param {string} id @param {number} value */
    function setIntensity(id, value) {
        const item = items.get(id);
        if (!item?.setIntensity) return;
        item.setIntensity(value);
    }

    /** @param {string} id @param {boolean} enabled */
    function setShadow(id, enabled) {
        const item = items.get(id);
        if (!item?.setShadow) return;
        item.setShadow(enabled);
    }

    /** @param {string} id @param {number} value */
    function setShadowOpacity(id, value) {
        const item = items.get(id);
        if (!item?.setShadowOpacity) return;
        item.setShadowOpacity(value);
    }

    /** @param {string} id */
    function selectItem(id) {
        items.get(id)?.select?.();
    }

    /** @param {string} id */
    function deleteItem(id) {
        const item = items.get(id);
        if (!item?.onDelete) return;
        item.onDelete();
        notify();
    }

    /** @type {((id: string, event: MouseEvent) => void) | null} */
    let itemContextMenuHandler = null;

    /** @param {(id: string, event: MouseEvent) => void | null} fn */
    function setItemContextMenuHandler(fn) {
        itemContextMenuHandler = fn;
    }

    /** @param {string} id @param {MouseEvent} event */
    function openItemContextMenu(id, event) {
        itemContextMenuHandler?.(id, event);
    }

    return {
        register,
        unregister,
        getAll,
        refresh,
        subscribe,
        setVisible,
        setIntensity,
        setShadow,
        setShadowOpacity,
        selectItem,
        deleteItem,
        setItemContextMenuHandler,
        openItemContextMenu,
    };
}

/**
 * @param {string} id
 * @param {string} label
 * @param {THREE.Object3D | THREE.Light} object
 * @param {{
 *   getVisible?: () => boolean,
 *   setVisible?: (visible: boolean) => void,
 *   isVisibleEnabled?: () => boolean,
 *   getShadow?: () => boolean,
 *   setShadow?: (enabled: boolean) => void,
 *   getShadowOpacity?: () => number,
 *   setShadowOpacity?: (value: number) => void,
 *   detail?: string,
 * }} [options]
 */
export function createEnvironmentItem(id, label, object, options = {}) {
    const item = /** @type {SceneRegistryItem} */ ({
        id,
        label,
        category: "environment",
        icon: "env",
        getVisible: options.getVisible ?? (() => object.visible),
        setVisible:
            options.setVisible ??
            ((visible) => {
                object.visible = visible;
            }),
        select: () => {},
    });
    if (options.isVisibleEnabled) item.isVisibleEnabled = options.isVisibleEnabled;
    if (options.detail) item.detail = options.detail;
    if (options.getShadow && options.setShadow) {
        item.getShadow = options.getShadow;
        item.setShadow = options.setShadow;
    }
    if (options.getShadowOpacity && options.setShadowOpacity) {
        item.getShadowOpacity = options.getShadowOpacity;
        item.setShadowOpacity = options.setShadowOpacity;
    }
    return item;
}
