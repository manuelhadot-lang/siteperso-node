/** Pile undo / redo pour l'éditeur de scène. */
import { COLLISION_KEY } from "./lab-collision.js";
export function createHistory({ maxSize = 50 } = {}) {
    /** @type {unknown[]} */
    const undoStack = [];
    /** @type {unknown[]} */
    const redoStack = [];

    function push(entry) {
        undoStack.push(entry);
        if (undoStack.length > maxSize) undoStack.shift();
        redoStack.length = 0;
    }

    function undo() {
        if (!undoStack.length) return null;
        const entry = undoStack.pop();
        redoStack.push(entry);
        return entry;
    }

    function redo() {
        if (!redoStack.length) return null;
        const entry = redoStack.pop();
        undoStack.push(entry);
        return entry;
    }

    return {
        push,
        undo,
        redo,
        canUndo: () => undoStack.length > 0,
        canRedo: () => redoStack.length > 0,
    };
}

/**
 * @param {import("three").Object3D} object
 */
export function captureObjectState(object) {
    // TransformControls met à jour le quaternion ; synchroniser l’Euler avant capture.
    object.rotation.setFromQuaternion(object.quaternion, object.rotation.order);
    return {
        position: object.position.clone(),
        quaternion: object.quaternion.clone(),
        rotation: object.rotation.clone(),
        scale: object.scale.clone(),
        collisionEnabled: !!object.userData[COLLISION_KEY],
    };
}

/**
 * @param {ReturnType<typeof captureObjectState>} a
 * @param {ReturnType<typeof captureObjectState>} b
 */
export function objectStatesEqual(a, b) {
    const rotEqual =
        a.quaternion && b.quaternion
            ? a.quaternion.equals(b.quaternion)
            : a.rotation.equals(b.rotation);
    return (
        a.position.equals(b.position) &&
        rotEqual &&
        a.scale.equals(b.scale) &&
        a.collisionEnabled === b.collisionEnabled
    );
}
