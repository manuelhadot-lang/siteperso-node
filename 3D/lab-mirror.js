/** Miroirs planaires (Reflector) + force de réflexion PBR pour faces de boîte. */
import * as THREE from "three";
import { Reflector } from "three/addons/objects/Reflector.js";

export const MIRROR_FLAG = "_labMirror";
export const MIRROR_FACE_KEY = "_labMirrorFace";
/** Dès ce seuil : overlay Reflector (opacity ∝ réflexion). En dessous : brillance PBR seule. */
export const MIRROR_REFLECTOR_THRESHOLD = 0.2;
/** Preset parquet / bois ciré (vernis léger, pas un miroir). */
export const WAXED_REFLECTION = 0.28;
export const REFLECTION_MIN = 0;
export const REFLECTION_MAX = 1;
export const REFLECTION_STEP = 0.01;

/** Sous cette distance (m), on n’actualise plus le RT (évite le voile blanc FPS). */
const MIRROR_MIN_CAMERA_DIST = 0.18;
/** Sous cette distance, le miroir s’estompe vers le mur. */
const MIRROR_FADE_DIST = 0.28;

const _mirrorWorldPos = new THREE.Vector3();
const _mirrorCamPos = new THREE.Vector3();
const _mirrorNormal = new THREE.Vector3();
const _mirrorQuat = new THREE.Quaternion();
const _mirrorPlane = new THREE.Plane();

/**
 * Shader miroir sans blendOverlay (celui de Three blanchit fort de près).
 */
const LabMirrorShader = {
    uniforms: {
        color: { value: null },
        tDiffuse: { value: null },
        textureMatrix: { value: null },
        opacity: { value: 1 },
    },
    vertexShader: /* glsl */ `
		uniform mat4 textureMatrix;
		varying vec4 vUv;
		#include <common>
		#include <logdepthbuf_pars_vertex>
		void main() {
			vUv = textureMatrix * vec4( position, 1.0 );
			gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
			#include <logdepthbuf_vertex>
		}`,
    fragmentShader: /* glsl */ `
		uniform vec3 color;
		uniform sampler2D tDiffuse;
		uniform float opacity;
		varying vec4 vUv;
		#include <logdepthbuf_pars_fragment>
		void main() {
			#include <logdepthbuf_fragment>
			vec4 base = texture2DProj( tDiffuse, vUv );
			// Légère teinte, sans wash blanc.
			vec3 rgb = mix(base.rgb, base.rgb * color, 0.08);
			gl_FragColor = vec4(rgb, opacity);
		}`,
};

/**
 * Courbe diélectrique : petit r = bois ciré, grand r = chrome.
 * @param {number} reflection 0–1
 * @returns {{ metalness: number, roughness: number, envMapScale: number, envMapIntensity: number }}
 */
export function reflectionToPbr(reflection) {
    const r = THREE.MathUtils.clamp(Number(reflection) || 0, 0, 1);
    const gloss = Math.pow(r, 0.48);
    const metalness =
        r < 0.72
            ? THREE.MathUtils.lerp(0.02, 0.14, r / 0.72)
            : THREE.MathUtils.lerp(0.14, 1, (r - 0.72) / 0.28);
    const roughness = THREE.MathUtils.lerp(0.78, 0.045, gloss);
    const envMapScale = 1 + gloss * 2.15;
    return {
        metalness,
        roughness,
        envMapScale,
        envMapIntensity: envMapScale,
    };
}

/**
 * Intensité IBL = exposition skybox × brillance du matériau.
 * @param {number} reflection 0–1
 * @param {number} [skyboxBrightness=1]
 */
export function composeEnvMapIntensity(reflection, skyboxBrightness = 1) {
    const { envMapScale } = reflectionToPbr(reflection);
    const base = Number.isFinite(skyboxBrightness) ? Math.max(0.05, skyboxBrightness) : 1;
    return base * envMapScale;
}

/**
 * @param {THREE.Material | null | undefined} material
 * @param {number} [reflection]
 */
export function envMapIntensityForMaterial(material, reflection) {
    const r =
        typeof reflection === "number"
            ? reflection
            : typeof material?.userData?._labReflection === "number"
              ? material.userData._labReflection
              : null;
    const sky = material?.userData?.labSkyboxEnvMap
        ? typeof material.userData._labSkyboxBrightness === "number"
            ? material.userData._labSkyboxBrightness
            : 1
        : 1;
    if (typeof r === "number") return composeEnvMapIntensity(r, sky);
    return sky;
}

/**
 * Force du Reflector (0 = aucun, 1 = miroir plein).
 * @param {number} reflection 0–1
 */
export function reflectorOverlayMix(reflection) {
    const r = THREE.MathUtils.clamp(Number(reflection) || 0, 0, 1);
    if (r < MIRROR_REFLECTOR_THRESHOLD) return 0;
    const t = (r - MIRROR_REFLECTOR_THRESHOLD) / (1 - MIRROR_REFLECTOR_THRESHOLD);
    return THREE.MathUtils.clamp(0.08 + Math.pow(t, 1.2) * 0.92, 0, 1);
}

/**
 * @param {THREE.Object3D} root
 */
export function clearMirrorsUnder(root) {
    if (!root) return;
    /** @type {THREE.Object3D[]} */
    const doomed = [];
    root.traverse((child) => {
        if (child?.userData?.[MIRROR_FLAG]) doomed.push(child);
    });
    for (const child of doomed) {
        disposeMirror(child);
        child.parent?.remove(child);
    }
}

/**
 * @param {THREE.Object3D} mirror
 */
function disposeMirror(mirror) {
    try {
        mirror.getRenderTarget?.()?.dispose?.();
    } catch {
        /* ignore */
    }
    try {
        mirror.geometry?.dispose?.();
    } catch {
        /* ignore */
    }
    try {
        mirror.material?.dispose?.();
    } catch {
        /* ignore */
    }
}

/**
 * @param {THREE.Mesh} mesh
 * @param {number} faceIndex
 */
export function clearMirrorOnFace(mesh, faceIndex) {
    if (!mesh?.children?.length) return;
    const doomed = mesh.children.filter(
        (c) => c.userData?.[MIRROR_FLAG] && c.userData?.[MIRROR_FACE_KEY] === faceIndex
    );
    for (const child of doomed) {
        disposeMirror(child);
        mesh.remove(child);
    }
}

/**
 * @param {THREE.BufferGeometry} geometry
 * @returns {{ width: number, height: number, depth: number } | null}
 */
function boxSizeFromGeometry(geometry) {
    const p = geometry?.parameters;
    if (p && typeof p.width === "number" && typeof p.height === "number" && typeof p.depth === "number") {
        return { width: p.width, height: p.height, depth: p.depth };
    }
    if (!geometry?.attributes?.position) return null;
    if (!geometry.boundingBox) geometry.computeBoundingBox();
    const bb = geometry.boundingBox;
    if (!bb) return null;
    return {
        width: Math.max(1e-4, bb.max.x - bb.min.x),
        height: Math.max(1e-4, bb.max.y - bb.min.y),
        depth: Math.max(1e-4, bb.max.z - bb.min.z),
    };
}

/**
 * Distance signée caméra → plan du miroir (mètres).
 * @param {THREE.Object3D} mirror
 * @param {THREE.Camera} camera
 */
function signedDistanceToMirror(mirror, camera) {
    mirror.getWorldPosition(_mirrorWorldPos);
    mirror.getWorldQuaternion(_mirrorQuat);
    _mirrorNormal.set(0, 0, 1).applyQuaternion(_mirrorQuat).normalize();
    camera.getWorldPosition(_mirrorCamPos);
    _mirrorPlane.setFromNormalAndCoplanarPoint(_mirrorNormal, _mirrorWorldPos);
    return _mirrorPlane.distanceToPoint(_mirrorCamPos);
}

/**
 * Place (ou retire) un Reflector sur une face de boîte.
 * @param {THREE.Mesh} mesh
 * @param {number} faceIndex 0–5 (±X/Y/Z)
 * @param {number} reflection 0–1
 */
export function syncMirrorOnBoxFace(mesh, faceIndex, reflection) {
    if (!(mesh instanceof THREE.Mesh) || !mesh.geometry) return;
    const r = THREE.MathUtils.clamp(Number(reflection) || 0, 0, 1);
    clearMirrorOnFace(mesh, faceIndex);
    if (r < MIRROR_REFLECTOR_THRESHOLD) return;

    const size = boxSizeFromGeometry(mesh.geometry);
    if (!size) return;

    let planeW = size.width;
    let planeH = size.height;
    if (faceIndex === 0 || faceIndex === 1) {
        planeW = size.depth;
        planeH = size.height;
    } else if (faceIndex === 2 || faceIndex === 3) {
        planeW = size.width;
        planeH = size.depth;
    }

    const dpr = typeof window !== "undefined" ? Math.min(2, window.devicePixelRatio || 1) : 1;
    const texSize = Math.max(256, Math.min(1024, Math.round(512 * dpr)));
    // Teinte neutre sombre : évite le wash blanc du Reflector stock.
    const tint = new THREE.Color(0x8a8a8a);

    const mix = reflectorOverlayMix(r);
    const mirror = new Reflector(new THREE.PlaneGeometry(planeW * 0.998, planeH * 0.998), {
        // Bias un peu plus élevé = moins d’artefacts quand on colle au plan.
        clipBias: 0.02,
        textureWidth: texSize,
        textureHeight: texSize,
        color: tint,
        shader: LabMirrorShader,
    });
    mirror.name = `lab-mirror-face-${faceIndex}`;
    mirror.userData[MIRROR_FLAG] = true;
    mirror.userData[MIRROR_FACE_KEY] = faceIndex;
    mirror.userData._labReflection = r;
    mirror.userData._labNoPaintPick = true;
    mirror.renderOrder = 2;

    if (mirror.material) {
        mirror.material.transparent = true;
        // Overlay ciré : laisser l’albedo (parquet) visible dessous.
        mirror.material.depthWrite = mix >= 0.85;
        mirror.material.polygonOffset = true;
        mirror.material.polygonOffsetFactor = -1;
        mirror.material.polygonOffsetUnits = -1;
        if (mirror.material.uniforms?.opacity) {
            mirror.material.uniforms.opacity.value = mix;
        }
    }

    const updateReflection = mirror.onBeforeRender;
    mirror.onBeforeRender = function onBeforeRenderMirror(renderer, scene, camera) {
        const signed = signedDistanceToMirror(mirror, camera);
        const strength = reflectorOverlayMix(mirror.userData._labReflection ?? r);
        // Face arrière du miroir : laisser Reflector ignorer.
        if (signed <= 0) {
            if (mirror.material?.uniforms?.opacity) {
                mirror.material.uniforms.opacity.value = strength;
            }
            updateReflection.call(this, renderer, scene, camera);
            return;
        }

        const dist = signed;
        if (dist < MIRROR_MIN_CAMERA_DIST) {
            // Trop près : ne pas recalculer le RT (voile / clipping oblique).
            if (mirror.material?.uniforms?.opacity) {
                const t = THREE.MathUtils.clamp(
                    (dist - 0.05) / (MIRROR_MIN_CAMERA_DIST - 0.05),
                    0,
                    1
                );
                mirror.material.uniforms.opacity.value = strength * t * t;
            }
            return;
        }

        if (mirror.material?.uniforms?.opacity) {
            const fade = THREE.MathUtils.clamp(
                (dist - MIRROR_MIN_CAMERA_DIST) / (MIRROR_FADE_DIST - MIRROR_MIN_CAMERA_DIST),
                0,
                1
            );
            const distMul = strength > 0.85 ? 0.55 + 0.45 * fade : 0.35 + 0.65 * fade;
            mirror.material.uniforms.opacity.value = strength * distMul;
        }
        updateReflection.call(this, renderer, scene, camera);
    };

    // Décale un peu plus du mur pour limiter le z-fighting en FPS.
    const eps = 0.008;
    const hw = size.width * 0.5;
    const hh = size.height * 0.5;
    const hd = size.depth * 0.5;
    switch (faceIndex) {
        case 0: // +X
            mirror.position.set(hw + eps, 0, 0);
            mirror.rotation.y = Math.PI / 2;
            break;
        case 1: // -X
            mirror.position.set(-hw - eps, 0, 0);
            mirror.rotation.y = -Math.PI / 2;
            break;
        case 2: // +Y
            mirror.position.set(0, hh + eps, 0);
            mirror.rotation.x = -Math.PI / 2;
            break;
        case 3: // -Y
            mirror.position.set(0, -hh - eps, 0);
            mirror.rotation.x = Math.PI / 2;
            break;
        case 4: // +Z
            mirror.position.set(0, 0, hd + eps);
            break;
        case 5: // -Z
            mirror.position.set(0, 0, -hd - eps);
            mirror.rotation.y = Math.PI;
            break;
        default:
            disposeMirror(mirror);
            return;
    }

    mesh.add(mirror);
}
