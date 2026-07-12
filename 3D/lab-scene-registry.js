/** Registre des éléments de scène (visibilité, libellés). */

/**
 * @typedef {{
 *   id: string,
 *   label: string,
 *   category: "environment" | "object" | "light",
 *   getVisible: () => boolean,
 *   setVisible: (visible: boolean) => void,
 *   select?: () => void,
 *   getIntensity?: () => number,
 *   setIntensity?: (value: number) => void,
 *   getShadow?: () => boolean,
 *   setShadow?: (enabled: boolean) => void,
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

    return {
        register,
        unregister,
        getAll,
        refresh,
        subscribe,
        setVisible,
        setIntensity,
        setShadow,
        selectItem,
        deleteItem,
    };
}

/**
 * @param {string} id
 * @param {string} label
 * @param {THREE.Object3D | THREE.Light} object
 * @param {{ getShadow?: () => boolean, setShadow?: (enabled: boolean) => void }} [options]
 */
export function createEnvironmentItem(id, label, object, options = {}) {
    const item = /** @type {SceneRegistryItem} */ ({
        id,
        label,
        category: "environment",
        getVisible: () => object.visible,
        setVisible: (visible) => {
            object.visible = visible;
        },
        select: () => {},
    });
    if (options.getShadow && options.setShadow) {
        item.getShadow = options.getShadow;
        item.setShadow = options.setShadow;
    }
    return item;
}
