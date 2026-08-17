/** Océan réaliste — vagues Gerstner, reflets miroir, écume, normal map. */
import * as THREE from "three";
import { GRID_SIZE } from "./grid-constants.js";
import { bindRangeSliderWheel } from "./wheel-utils.js";

export const OCEAN_SCENE_ITEM_ID = "env-ocean";

const WATER_NORMALS_URL = "/3D/textures/waternormals.jpg";
/** Maillage plus dense pour vagues et littoral plus fins. */
const SEGMENTS = 280;

const DEFAULTS = {
    size: GRID_SIZE * 3.6,
    level: -0.05,
    color: "#074455",
    sunColor: "#fff1d6",
    opacity: 5,
    waveHeight: 0.42,
    waveScale: 0.1,
    waveSpeed: 1.0,
    choppiness: 0.95,
    /** Intensité des rides / vagues de détail sur la surface (normal map). */
    surfaceWaves: 1.15,
    /** Échelle des rides de surface (plus haut = rides plus petites / denses). */
    surfaceScale: 1.1,
    distortion: 1.35,
    foam: 0.8,
};

/** Bias du plan de coupe miroir : léger, pour garder la coque à la flottaison
 * dans le reflet sans créer d’artefacts latéraux. */
const MIRROR_CLIP_BIAS = 0.005;

/** Trains de Gerstner — doivent rester identiques au vertex shader. */
const WAVE_TRAINS = [
    { amp: 0.42, freq: 0.95, speed: 1.05, dir: [1.0, 0.22], steep: 0.9, timeMul: 1 },
    { amp: 0.28, freq: 1.65, speed: 0.88, dir: [-0.6, 1.0], steep: 0.75, timeMul: 1.08 },
    { amp: 0.16, freq: 2.85, speed: 1.35, dir: [0.4, -0.85], steep: 0.55, timeMul: 0.92 },
    { amp: 0.1, freq: 4.6, speed: 1.72, dir: [-0.9, -0.35], steep: 0.4, timeMul: 1.18 },
    { amp: 0.055, freq: 7.8, speed: 2.15, dir: [0.15, 0.98], steep: 0.28, timeMul: 1.4 },
    { amp: 0.03, freq: 12.5, speed: 2.55, dir: [-0.72, 0.55], steep: 0.18, timeMul: 1.65 },
].map((wave) => {
    const len = Math.hypot(wave.dir[0], wave.dir[1]) || 1;
    return { ...wave, dir: [wave.dir[0] / len, wave.dir[1] / len] };
});

/** Texture 1×1 neutre quand aucun terrain n’est lié. */
function createDummyHeightTexture() {
    const data = new Uint8Array([0, 0, 0]);
    const tex = new THREE.DataTexture(data, 1, 1, THREE.RGBFormat);
    tex.needsUpdate = true;
    return tex;
}

const VERTEX_SHADER = /* glsl */ `
uniform mat4 textureMatrix;
uniform float uTime;
uniform float uWaveHeight;
uniform float uWaveScale;
uniform float uWaveSpeed;
uniform float uChoppiness;
uniform sampler2D uTerrainHeight;
uniform float uTerrainEnabled;
uniform float uTerrainSize;
uniform float uTerrainYOffset;
uniform float uTerrainHMin;
uniform float uTerrainHMax;
uniform float uShoreWidth;

varying vec4 vMirrorCoord;
varying vec4 vWorldPosition;
varying vec3 vNormalW;
varying float vFoam;
varying float vWaveElev;
varying vec2 vBaseXZ;
varying float vShoreDamp;

float sampleTerrainHeightV(vec2 worldXZ) {
  float halfSize = uTerrainSize * 0.5;
  vec2 uv = (worldXZ + halfSize) / uTerrainSize;
  if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) {
    return uTerrainHMin - 2.0;
  }
  float enc = texture2D(uTerrainHeight, uv).r;
  return mix(uTerrainHMin, uTerrainHMax, enc) + uTerrainYOffset;
}

vec3 gerstner(vec2 xz, float amp, float freq, float speed, vec2 dir, float steep, float time, inout vec3 tangent, inout vec3 binormal) {
  vec2 d = normalize(dir);
  float phase = dot(d, xz) * freq + time * speed;
  float s = sin(phase);
  float c = cos(phase);
  float qa = steep * amp;
  float dx = d.x;
  float dz = d.y;

  tangent += vec3(
    -dx * dx * qa * s,
    dx * steep * amp * c * freq * 0.35,
    -dx * dz * qa * s
  );
  binormal += vec3(
    -dx * dz * qa * s,
    dz * steep * amp * c * freq * 0.35,
    -dz * dz * qa * s
  );

  return vec3(dx * qa * c, amp * s, dz * qa * c);
}

void main() {
  vec3 pos = position;
  vec2 xz = pos.xz;
  vBaseXZ = (modelMatrix * vec4(pos.x, 0.0, pos.z, 1.0)).xz;
  float t = uTime * uWaveSpeed;
  float h = uWaveHeight;
  float f = uWaveScale;
  float steep = clamp(uChoppiness, 0.0, 2.5);

  // Amortit les vagues près du littoral (profondeur faible).
  float shoreDamp = 1.0;
  if (uTerrainEnabled > 0.5) {
    float terrainH = sampleTerrainHeightV(vBaseXZ);
    float waterBaseY = (modelMatrix * vec4(0.0, 0.0, 0.0, 1.0)).y;
    float depth = waterBaseY - terrainH;
    float shoreW = max(uShoreWidth, 0.12);
    shoreDamp = smoothstep(0.02, shoreW * 2.2, depth);
  }
  vShoreDamp = shoreDamp;

  vec3 tangent = vec3(1.0, 0.0, 0.0);
  vec3 binormal = vec3(0.0, 0.0, 1.0);
  vec3 disp = vec3(0.0);

  disp += gerstner(xz, h * 0.42, f * 0.95, 1.05, vec2(1.0, 0.22), steep * 0.9, t, tangent, binormal);
  disp += gerstner(xz, h * 0.28, f * 1.65, 0.88, vec2(-0.6, 1.0), steep * 0.75, t * 1.08, tangent, binormal);
  disp += gerstner(xz, h * 0.16, f * 2.85, 1.35, vec2(0.4, -0.85), steep * 0.55, t * 0.92, tangent, binormal);
  disp += gerstner(xz, h * 0.10, f * 4.6, 1.72, vec2(-0.9, -0.35), steep * 0.4, t * 1.18, tangent, binormal);
  disp += gerstner(xz, h * 0.055, f * 7.8, 2.15, vec2(0.15, 0.98), steep * 0.28, t * 1.4, tangent, binormal);
  disp += gerstner(xz, h * 0.03, f * 12.5, 2.55, vec2(-0.72, 0.55), steep * 0.18, t * 1.65, tangent, binormal);

  disp *= shoreDamp;
  pos += disp;
  vec3 n = normalize(cross(binormal, tangent));

  vec4 world = modelMatrix * vec4(pos, 1.0);
  vWorldPosition = world;
  // Projection miroir classique sur la position déplacée (comme Water de
  // three.js) : le reflet reste accroché à la coque des objets flottants.
  vMirrorCoord = textureMatrix * world;
  vNormalW = normalize(mat3(modelMatrix) * n);
  vWaveElev = disp.y / max(h * shoreDamp, 0.001);
  float steepnessApprox = length(disp.xz) / max(h * shoreDamp, 0.001);
  vFoam = clamp(steepnessApprox * 0.7 + smoothstep(0.3, 0.9, vWaveElev), 0.0, 1.0) * shoreDamp;

  gl_Position = projectionMatrix * viewMatrix * world;
}
`;

const FRAGMENT_SHADER = /* glsl */ `
uniform sampler2D mirrorSampler;
uniform sampler2D normalSampler;
uniform sampler2D uTerrainHeight;
uniform mat4 textureMatrix;
uniform float alpha;
uniform float time;
uniform float size;
uniform float distortionScale;
uniform float uFoamAmount;
uniform float uSurfaceDetail;
uniform float uSurfaceScale;
uniform float uTerrainEnabled;
uniform float uTerrainSize;
uniform float uTerrainYOffset;
uniform float uTerrainHMin;
uniform float uTerrainHMax;
uniform float uShoreWidth;
uniform vec3 sunColor;
uniform vec3 sunDirection;
uniform vec3 eye;
uniform vec3 waterColor;
uniform vec3 uShallowColor;

varying vec4 vMirrorCoord;
varying vec4 vWorldPosition;
varying vec3 vNormalW;
varying float vFoam;
varying float vWaveElev;
varying vec2 vBaseXZ;
varying float vShoreDamp;

vec4 getNoise(vec2 uv) {
  vec2 uv0 = (uv / 103.0) + vec2(time / 17.0, time / 29.0);
  vec2 uv1 = uv / 107.0 - vec2(time / -19.0, time / 31.0);
  vec2 uv2 = uv / vec2(8907.0, 9803.0) + vec2(time / 101.0, time / 97.0);
  vec2 uv3 = uv / vec2(1091.0, 1027.0) - vec2(time / 109.0, time / -113.0);
  vec4 noise = texture2D(normalSampler, uv0)
             + texture2D(normalSampler, uv1)
             + texture2D(normalSampler, uv2)
             + texture2D(normalSampler, uv3);
  return noise * 0.5 - 1.0;
}

float sampleTerrainHeight(vec2 worldXZ) {
  float halfSize = uTerrainSize * 0.5;
  vec2 uv = (worldXZ + halfSize) / uTerrainSize;
  if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) {
    return uTerrainHMin - 2.0;
  }
  float enc = texture2D(uTerrainHeight, uv).r;
  return mix(uTerrainHMin, uTerrainHMax, enc) + uTerrainYOffset;
}

void main() {
  vec3 geoN = normalize(vNormalW);
  vec4 noise = getNoise(vWorldPosition.xz * size * max(uSurfaceScale, 0.05));
  float detailStrength = clamp(uSurfaceDetail, 0.0, 2.5);
  float detailMix = mix(0.18, 0.78, vShoreDamp) * detailStrength;
  vec3 detailN = normalize(noise.xzy * vec3(1.6, 1.0, 1.6));
  vec3 surfaceNormal = normalize(mix(geoN, normalize(geoN + detailN * (0.4 + detailStrength * 0.32)), clamp(detailMix, 0.0, 1.0)));

  vec3 worldToEye = eye - vWorldPosition.xyz;
  vec3 eyeDirection = normalize(worldToEye);
  float distance = length(worldToEye);

  float ndotv = max(dot(eyeDirection, surfaceNormal), 0.0);
  float grazing = 1.0 - ndotv;
  float nearCalm = smoothstep(2.0, 16.0, distance);
  float contactZone = 1.0 - smoothstep(1.5, 9.0, distance);

  // Distorsion : calme au contact des objets (coque lisible), plus vive au large.
  float distortGain = distortionScale
    * mix(0.12, 1.0, nearCalm)
    * mix(0.5, 1.0, vShoreDamp)
    * mix(0.55, 1.0, 1.0 - contactZone * 0.65);
  vec2 warpN = mix(geoN.xz, surfaceNormal.xz, mix(0.22, 0.62, nearCalm));
  float invDist = 1.0 / max(distance, 8.0);
  vec2 distortion = warpN * (0.00045 + invDist * 0.42) * distortGain;

  vec2 mirrorUV = vMirrorCoord.xy / max(vMirrorCoord.w, 1e-4);
  float mirrorEdge = smoothstep(0.0, 0.04, mirrorUV.x) * smoothstep(1.0, 0.96, mirrorUV.x)
    * smoothstep(0.0, 0.04, mirrorUV.y) * smoothstep(1.0, 0.96, mirrorUV.y);
  mirrorUV = clamp(mirrorUV + distortion, 0.001, 0.999);
  vec3 reflectionSample = texture2D(mirrorSampler, mirrorUV).rgb;
  // Léger adoucissement du reflet (moins « pixel miroir »).
  vec3 reflectionSoft = (
    reflectionSample
    + texture2D(mirrorSampler, clamp(mirrorUV + vec2(0.0015, 0.0), 0.001, 0.999)).rgb
    + texture2D(mirrorSampler, clamp(mirrorUV + vec2(-0.0015, 0.0), 0.001, 0.999)).rgb
    + texture2D(mirrorSampler, clamp(mirrorUV + vec2(0.0, 0.0015), 0.001, 0.999)).rgb
  ) * 0.25;
  reflectionSample = mix(reflectionSample, reflectionSoft, mix(0.15, 0.45, nearCalm));

  // Fresnel Schlick approx. : reflet fort en rasance, plus présent près des coques.
  float F0 = 0.045;
  float fresnel = F0 + (1.0 - F0) * pow(grazing, mix(3.6, 4.8, nearCalm));
  fresnel = mix(fresnel, max(fresnel, 0.55), contactZone * 0.45);
  float reflectMix = fresnel
    * mix(0.78, 0.94, nearCalm)
    * mix(0.55, 1.0, vShoreDamp)
    * mix(0.55, 1.0, mirrorEdge);

  vec3 reflectDir = reflect(-sunDirection, surfaceNormal);
  float spec = pow(max(dot(eyeDirection, reflectDir), 0.0), 220.0);
  float diffuse = max(dot(sunDirection, surfaceNormal), 0.0);

  float waterDepth = 4.0;
  float shoreMask = 0.0;
  float shoreFoam = 0.0;
  float edgeFade = 1.0;

  if (uTerrainEnabled > 0.5) {
    float terrainH = sampleTerrainHeight(vBaseXZ);
    waterDepth = vWorldPosition.y - terrainH;
    float shoreW = max(uShoreWidth, 0.1);

    // Transition littorale plus douce et précise.
    edgeFade = smoothstep(-0.02, 0.12, waterDepth);
    if (edgeFade < 0.003) discard;

    float shallow = 1.0 - smoothstep(0.0, shoreW * 2.4, max(waterDepth, 0.0));
    shoreMask = pow(shallow, 1.15);

    float wash = sin(time * 2.2 + vBaseXZ.x * 0.7 + vBaseXZ.y * 0.45) * 0.5 + 0.5;
    float wash2 = sin(time * 3.4 - vBaseXZ.x * 0.4 + vBaseXZ.y * 0.85) * 0.5 + 0.5;
    float wash3 = sin(time * 1.6 + vBaseXZ.x * 1.1 - vBaseXZ.y * 0.3) * 0.5 + 0.5;
    float bandInner = smoothstep(shoreW * 0.95, 0.0, waterDepth);
    float bandOuter = smoothstep(-0.02, 0.08, waterDepth);
    float band = bandInner * bandOuter;
    float crestNoise = clamp(noise.x * 0.45 + noise.y * 0.25 + 0.5, 0.0, 1.0);
    shoreFoam = band * mix(0.5, 1.0, wash) * mix(0.65, 1.0, wash2) * mix(0.75, 1.0, wash3);
    shoreFoam *= (0.7 + crestNoise * 0.4) * uFoamAmount * 1.45;
    // Fine ligne d’écume au contact terre/eau.
    float lip = smoothstep(0.07, 0.0, abs(waterDepth - 0.015)) * (0.55 + wash * 0.45);
    shoreFoam = max(shoreFoam, lip * uFoamAmount * 1.1);
  }

  float depthTint = mix(0.32, 1.0, ndotv);
  float shallowTint = shoreMask * 0.7 + max(vWaveElev, 0.0) * 0.12;
  vec3 deepColor = waterColor * vec3(0.72, 0.88, 1.05);
  vec3 scatter = mix(deepColor, uShallowColor, depthTint * 0.42 + shallowTint);
  scatter *= (0.42 + diffuse * 0.58);

  vec3 albedo = mix(scatter, reflectionSample, reflectMix);
  // Reflet un peu plus saturé / contrasté pour coller aux objets.
  albedo = mix(albedo, reflectionSample * vec3(1.02, 1.03, 1.06), reflectMix * 0.18);
  albedo += sunColor * spec * mix(0.7, 1.35, nearCalm) * vShoreDamp;
  albedo += sunColor * diffuse * 0.07;

  float crestFoam = smoothstep(0.42, 0.9, vFoam) * uFoamAmount * 0.48 * vShoreDamp;
  float foamMask = max(crestFoam, shoreFoam);
  vec3 foamColor = mix(vec3(0.78, 0.9, 0.95), vec3(1.0), foamMask);
  albedo = mix(albedo, foamColor, clamp(foamMask, 0.0, 1.0));

  float a = clamp(alpha * (0.8 + fresnel * 0.28) * edgeFade, 0.0, 1.0);
  a = max(a, foamMask * 0.4 * edgeFade);
  // Plus transparent dans l’eau très peu profonde.
  a *= mix(0.55, 1.0, smoothstep(0.0, 0.35, max(waterDepth, 0.0)));
  gl_FragColor = vec4(albedo, a);
}
`;

/**
 * @returns {THREE.CanvasTexture}
 */
function createFallbackNormals() {
    const size = 256;
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas 2D indisponible");
    const img = ctx.createImageData(size, size);
    const data = img.data;
    for (let y = 0; y < size; y += 1) {
        for (let x = 0; x < size; x += 1) {
            const u = x / size;
            const v = y / size;
            const nx = Math.sin(u * Math.PI * 10) * 0.5 + Math.sin(u * Math.PI * 23) * 0.2;
            const ny = Math.cos(v * Math.PI * 8) * 0.5 + Math.sin(v * Math.PI * 19) * 0.2;
            const len = Math.hypot(nx, ny, 1) || 1;
            const i = (y * size + x) * 4;
            data[i] = ((nx / len) * 0.5 + 0.5) * 255;
            data[i + 1] = ((ny / len) * 0.5 + 0.5) * 255;
            data[i + 2] = ((1 / len) * 0.5 + 0.5) * 255;
            data[i + 3] = 255;
        }
    }
    ctx.putImageData(img, 0, 0);
    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    return tex;
}

/**
 * @param {string} url
 * @returns {Promise<THREE.Texture>}
 */
function loadNormals(url) {
    return new Promise((resolve) => {
        new THREE.TextureLoader().load(
            url,
            (tex) => {
                tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
                resolve(tex);
            },
            undefined,
            () => resolve(createFallbackNormals())
        );
    });
}

/**
 * Mesh océan avec reflets miroir + Gerstner.
 */
class RealisticOcean extends THREE.Mesh {
    /**
     * @param {THREE.BufferGeometry} geometry
     * @param {{
     *   waterNormals: THREE.Texture,
     *   sunDirection: THREE.Vector3,
     *   sunColor: number,
     *   waterColor: number,
     *   shallowColor?: number,
     *   distortionScale: number,
     *   alpha: number,
     *   textureWidth?: number,
     *   textureHeight?: number,
     * }} options
     */
    constructor(geometry, options) {
        super(geometry);

        const textureWidth = options.textureWidth ?? 512;
        const textureHeight = options.textureHeight ?? 512;
        const mirrorPlane = new THREE.Plane();
        const normal = new THREE.Vector3();
        const mirrorWorldPosition = new THREE.Vector3();
        const cameraWorldPosition = new THREE.Vector3();
        const rotationMatrix = new THREE.Matrix4();
        const lookAtPosition = new THREE.Vector3(0, 0, -1);
        const clipPlane = new THREE.Vector4();
        const view = new THREE.Vector3();
        const target = new THREE.Vector3();
        const q = new THREE.Vector4();
        const textureMatrix = new THREE.Matrix4();
        const mirrorCamera = new THREE.PerspectiveCamera();
        const eye = new THREE.Vector3();

        const renderTarget = new THREE.WebGLRenderTarget(textureWidth, textureHeight, {
            minFilter: THREE.LinearFilter,
            magFilter: THREE.LinearFilter,
            format: THREE.RGBFormat,
        });

        const shallow = options.shallowColor ?? 0x3aa8b8;

        const dummyHeight = createDummyHeightTexture();

        const material = new THREE.ShaderMaterial({
            uniforms: {
                mirrorSampler: { value: renderTarget.texture },
                normalSampler: { value: options.waterNormals },
                uTerrainHeight: { value: dummyHeight },
                alpha: { value: options.alpha },
                time: { value: 0 },
                size: { value: 0.55 },
                distortionScale: { value: options.distortionScale },
                textureMatrix: { value: textureMatrix },
                sunColor: { value: new THREE.Color(options.sunColor) },
                sunDirection: { value: options.sunDirection.clone().normalize() },
                eye: { value: eye },
                waterColor: { value: new THREE.Color(options.waterColor) },
                uShallowColor: { value: new THREE.Color(shallow) },
                uTime: { value: 0 },
                uWaveHeight: { value: DEFAULTS.waveHeight },
                uWaveScale: { value: DEFAULTS.waveScale },
                uWaveSpeed: { value: DEFAULTS.waveSpeed },
                uChoppiness: { value: DEFAULTS.choppiness },
                uFoamAmount: { value: DEFAULTS.foam },
                uSurfaceDetail: { value: DEFAULTS.surfaceWaves },
                uSurfaceScale: { value: DEFAULTS.surfaceScale },
                uTerrainEnabled: { value: 0 },
                uTerrainSize: { value: 50 },
                uTerrainYOffset: { value: 0 },
                uTerrainHMin: { value: -8 },
                uTerrainHMax: { value: 18 },
                uShoreWidth: { value: 0.85 },
            },
            vertexShader: VERTEX_SHADER,
            fragmentShader: FRAGMENT_SHADER,
            transparent: true,
            side: THREE.FrontSide,
            depthWrite: true,
        });

        this.material = material;
        this.userData.oceanRenderTarget = renderTarget;
        this.userData.dummyHeightTexture = dummyHeight;
        this.userData.oceanClipBias = MIRROR_CLIP_BIAS;
        renderTarget.texture.wrapS = THREE.ClampToEdgeWrapping;
        renderTarget.texture.wrapT = THREE.ClampToEdgeWrapping;
        /** @type {THREE.Object3D[]} */
        const mirrorHidden = [];

        /**
         * Masque gizmo / helpers / marqueurs pendant la passe miroir
         * (sinon ils polluent le reflet des objets flottants).
         * @param {THREE.Scene} scn
         */
        const hideMirrorClutter = (scn) => {
            mirrorHidden.length = 0;
            scn.traverse((obj) => {
                if (!obj.visible || obj === this) return;
                const name = obj.name || "";
                const type = obj.type || "";
                const ud = obj.userData || {};
                const hide =
                    ud.labNoMirror === true ||
                    ud.labHelper === true ||
                    name === "lab-avatar-place-marker" ||
                    name.startsWith("avatar-place-") ||
                    type === "BoxHelper" ||
                    obj.isTransformControls === true ||
                    /^TransformControls/.test(type) ||
                    /Helper$/.test(type);
                if (!hide) {
                    let p = obj.parent;
                    while (p) {
                        if (p.isTransformControls) {
                            mirrorHidden.push(obj);
                            obj.visible = false;
                            return;
                        }
                        p = p.parent;
                    }
                } else {
                    mirrorHidden.push(obj);
                    obj.visible = false;
                }
            });
        };

        const restoreMirrorClutter = () => {
            for (const obj of mirrorHidden) obj.visible = true;
            mirrorHidden.length = 0;
        };

        this.onBeforeRender = (renderer, scene, camera) => {
            mirrorWorldPosition.setFromMatrixPosition(this.matrixWorld);
            cameraWorldPosition.setFromMatrixPosition(camera.matrixWorld);
            rotationMatrix.extractRotation(this.matrixWorld);

            normal.set(0, 1, 0);
            normal.applyMatrix4(rotationMatrix);

            view.subVectors(mirrorWorldPosition, cameraWorldPosition);
            if (view.dot(normal) > 0) return;

            // Plan miroir = niveau moyen de l’océan (pas de décalage vertical :
            // un offset bas faisait apparaître les reflets « au-dessus » des objets).
            const clipBias =
                typeof this.userData.oceanClipBias === "number"
                    ? this.userData.oceanClipBias
                    : MIRROR_CLIP_BIAS;

            view.reflect(normal).negate();
            view.add(mirrorWorldPosition);

            rotationMatrix.extractRotation(camera.matrixWorld);
            lookAtPosition.set(0, 0, -1);
            lookAtPosition.applyMatrix4(rotationMatrix);
            lookAtPosition.add(cameraWorldPosition);

            target.subVectors(mirrorWorldPosition, lookAtPosition);
            target.reflect(normal).negate();
            target.add(mirrorWorldPosition);

            mirrorCamera.position.copy(view);
            mirrorCamera.up.set(0, 1, 0);
            mirrorCamera.up.applyMatrix4(rotationMatrix);
            mirrorCamera.up.reflect(normal);
            mirrorCamera.lookAt(target);
            mirrorCamera.near = camera.near;
            mirrorCamera.far = camera.far;
            mirrorCamera.updateMatrixWorld();
            mirrorCamera.projectionMatrix.copy(camera.projectionMatrix);

            textureMatrix.set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1);
            textureMatrix.multiply(mirrorCamera.projectionMatrix);
            textureMatrix.multiply(mirrorCamera.matrixWorldInverse);

            mirrorPlane.setFromNormalAndCoplanarPoint(normal, mirrorWorldPosition);
            mirrorPlane.applyMatrix4(mirrorCamera.matrixWorldInverse);
            clipPlane.set(mirrorPlane.normal.x, mirrorPlane.normal.y, mirrorPlane.normal.z, mirrorPlane.constant);

            const projectionMatrix = mirrorCamera.projectionMatrix;
            q.x = (Math.sign(clipPlane.x) + projectionMatrix.elements[8]) / projectionMatrix.elements[0];
            q.y = (Math.sign(clipPlane.y) + projectionMatrix.elements[9]) / projectionMatrix.elements[5];
            q.z = -1;
            q.w = (1 + projectionMatrix.elements[10]) / projectionMatrix.elements[14];
            clipPlane.multiplyScalar(2 / clipPlane.dot(q));
            projectionMatrix.elements[2] = clipPlane.x;
            projectionMatrix.elements[6] = clipPlane.y;
            projectionMatrix.elements[10] = clipPlane.z + 1.0 - clipBias;
            projectionMatrix.elements[14] = clipPlane.w;

            eye.setFromMatrixPosition(camera.matrixWorld);
            material.uniforms.eye.value.copy(eye);

            const currentRenderTarget = renderer.getRenderTarget();
            const currentXrEnabled = renderer.xr.enabled;
            const currentShadowAutoUpdate = renderer.shadowMap.autoUpdate;

            // try/finally : si la passe miroir throw, on restaure quand même la
            // visibilité (océan / gizmos) et le render target — sinon la scène
            // resterait « morte » (océan invisible, rendu détourné vers le RT).
            this.visible = false;
            hideMirrorClutter(scene);
            renderer.xr.enabled = false;
            renderer.shadowMap.autoUpdate = false;
            try {
                renderer.setRenderTarget(renderTarget);
                renderer.state.buffers.depth.setMask(true);
                if (renderer.autoClear === false) renderer.clear();
                renderer.render(scene, mirrorCamera);
            } finally {
                restoreMirrorClutter();
                this.visible = true;
                renderer.xr.enabled = currentXrEnabled;
                renderer.shadowMap.autoUpdate = currentShadowAutoUpdate;
                renderer.setRenderTarget(currentRenderTarget);
                if (camera.viewport !== undefined) {
                    renderer.state.viewport(camera.viewport);
                }
            }
        };
    }

    disposeResources() {
        this.geometry?.dispose();
        this.material?.dispose();
        this.userData.oceanRenderTarget?.dispose();
        this.userData.dummyHeightTexture?.dispose();
    }
}

/**
 * @param {{
 *   scene: THREE.Scene,
 *   camera: THREE.Camera,
 *   renderer: THREE.WebGLRenderer,
 *   sceneRegistry?: ReturnType<import("./lab-scene-registry.js").createSceneRegistry> | null,
 *   showStatus?: (msg: string) => void,
 *   getTerrainHeightMap?: () => ({ texture: THREE.Texture, size: number, yOffset: number, hMin: number, hMax: number } | null),
 * }} options
 */
export function initOcean({
    scene,
    camera: _camera,
    renderer: _renderer,
    sceneRegistry = null,
    showStatus = () => {},
    getTerrainHeightMap = null,
}) {
    /** @type {RealisticOcean | null} */
    let mesh = null;
    /** @type {THREE.Texture | null} */
    let normalsTex = null;
    let creating = false;

    /** @type {((entry: { type: "ocean", before: object | null, after: object | null }) => void) | null} */
    let pushSceneHistory = null;

    const sunDir = new THREE.Vector3(0.45, 0.85, 0.25).normalize();

    const state = { ...DEFAULTS };

    /** @type {{ near: number, far: number } | null} */
    let fogBackup = null;

    function softenFogForOcean() {
        if (!scene.fog || fogBackup) return;
        fogBackup = { near: scene.fog.near, far: scene.fog.far };
        scene.fog.near = Math.max(scene.fog.near, 40);
        scene.fog.far = Math.max(scene.fog.far, 360);
    }

    function restoreFog() {
        if (!fogBackup || !scene.fog) {
            fogBackup = null;
            return;
        }
        scene.fog.near = fogBackup.near;
        scene.fog.far = fogBackup.far;
        fogBackup = null;
    }

    function updateSunFromScene() {
        let found = false;
        scene.traverse((obj) => {
            if (found) return;
            if (obj.isDirectionalLight && obj.visible) {
                sunDir.copy(obj.position).normalize();
                if (sunDir.y < 0.15) sunDir.y = 0.15;
                sunDir.normalize();
                found = true;
            }
        });
    }

    const createBtn = /** @type {HTMLButtonElement | null} */ (document.getElementById("btn-create-ocean"));
    const toolsEl = document.getElementById("lab-ocean-tools");
    const removeBtn = /** @type {HTMLButtonElement | null} */ (document.getElementById("btn-ocean-remove"));
    const colorInput = /** @type {HTMLInputElement | null} */ (document.getElementById("lab-ocean-color"));
    const sunColorInput = /** @type {HTMLInputElement | null} */ (document.getElementById("lab-ocean-sun-color"));
    const opacityInput = /** @type {HTMLInputElement | null} */ (document.getElementById("lab-ocean-opacity"));
    const opacityValue = /** @type {HTMLOutputElement | null} */ (document.getElementById("lab-ocean-opacity-value"));
    const heightInput = /** @type {HTMLInputElement | null} */ (document.getElementById("lab-ocean-wave-height"));
    const heightValue = /** @type {HTMLOutputElement | null} */ (document.getElementById("lab-ocean-wave-height-value"));
    const scaleInput = /** @type {HTMLInputElement | null} */ (document.getElementById("lab-ocean-wave-scale"));
    const scaleValue = /** @type {HTMLOutputElement | null} */ (document.getElementById("lab-ocean-wave-scale-value"));
    const speedInput = /** @type {HTMLInputElement | null} */ (document.getElementById("lab-ocean-wave-speed"));
    const speedValue = /** @type {HTMLOutputElement | null} */ (document.getElementById("lab-ocean-wave-speed-value"));
    const chopInput = /** @type {HTMLInputElement | null} */ (document.getElementById("lab-ocean-choppiness"));
    const chopValue = /** @type {HTMLOutputElement | null} */ (document.getElementById("lab-ocean-choppiness-value"));
    const surfaceWavesInput = /** @type {HTMLInputElement | null} */ (document.getElementById("lab-ocean-surface-waves"));
    const surfaceWavesValue = /** @type {HTMLOutputElement | null} */ (document.getElementById("lab-ocean-surface-waves-value"));
    const surfaceScaleInput = /** @type {HTMLInputElement | null} */ (document.getElementById("lab-ocean-surface-scale"));
    const surfaceScaleValue = /** @type {HTMLOutputElement | null} */ (document.getElementById("lab-ocean-surface-scale-value"));
    const distortionInput = /** @type {HTMLInputElement | null} */ (document.getElementById("lab-ocean-distortion"));
    const distortionValue = /** @type {HTMLOutputElement | null} */ (document.getElementById("lab-ocean-distortion-value"));
    const foamInput = /** @type {HTMLInputElement | null} */ (document.getElementById("lab-ocean-foam"));
    const foamValue = /** @type {HTMLOutputElement | null} */ (document.getElementById("lab-ocean-foam-value"));
    const levelInput = /** @type {HTMLInputElement | null} */ (document.getElementById("lab-ocean-level"));
    const levelValue = /** @type {HTMLOutputElement | null} */ (document.getElementById("lab-ocean-level-value"));
    const sizeInput = /** @type {HTMLInputElement | null} */ (document.getElementById("lab-ocean-size"));
    const sizeValue = /** @type {HTMLOutputElement | null} */ (document.getElementById("lab-ocean-size-value"));

    function formatNum(n, digits = 2) {
        return n.toLocaleString("fr-FR", {
            minimumFractionDigits: digits,
            maximumFractionDigits: digits,
        });
    }

    function syncUiFromState() {
        if (colorInput) colorInput.value = state.color;
        if (sunColorInput) sunColorInput.value = state.sunColor;
        if (opacityInput) opacityInput.value = String(state.opacity);
        if (opacityValue) opacityValue.textContent = formatNum(state.opacity);
        if (heightInput) heightInput.value = String(state.waveHeight);
        if (heightValue) heightValue.textContent = `${formatNum(state.waveHeight)} m`;
        if (scaleInput) scaleInput.value = String(state.waveScale);
        if (scaleValue) scaleValue.textContent = formatNum(state.waveScale, 3);
        if (speedInput) speedInput.value = String(state.waveSpeed);
        if (speedValue) speedValue.textContent = formatNum(state.waveSpeed);
        if (chopInput) chopInput.value = String(state.choppiness);
        if (chopValue) chopValue.textContent = formatNum(state.choppiness);
        if (surfaceWavesInput) surfaceWavesInput.value = String(state.surfaceWaves);
        if (surfaceWavesValue) surfaceWavesValue.textContent = formatNum(state.surfaceWaves);
        if (surfaceScaleInput) surfaceScaleInput.value = String(state.surfaceScale);
        if (surfaceScaleValue) surfaceScaleValue.textContent = formatNum(state.surfaceScale);
        if (distortionInput) distortionInput.value = String(state.distortion);
        if (distortionValue) distortionValue.textContent = formatNum(state.distortion);
        if (foamInput) foamInput.value = String(state.foam);
        if (foamValue) foamValue.textContent = formatNum(state.foam);
        if (levelInput) levelInput.value = String(state.level);
        if (levelValue) levelValue.textContent = `${formatNum(state.level)} m`;
        if (sizeInput) sizeInput.value = String(state.size);
        if (sizeValue) sizeValue.textContent = `${formatNum(state.size, 0)} m`;
        createBtn?.classList.toggle("is-active", !!mesh);
        if (toolsEl) toolsEl.hidden = !mesh;
    }

    function syncTerrainToOcean() {
        if (!mesh) return;
        const u = mesh.material.uniforms;
        const info = getTerrainHeightMap?.() ?? null;
        if (!info?.texture) {
            u.uTerrainEnabled.value = 0;
            u.uTerrainHeight.value = mesh.userData.dummyHeightTexture;
            return;
        }
        u.uTerrainEnabled.value = 1;
        u.uTerrainHeight.value = info.texture;
        u.uTerrainSize.value = info.size;
        u.uTerrainYOffset.value = info.yOffset;
        u.uTerrainHMin.value = info.hMin;
        u.uTerrainHMax.value = info.hMax;
        u.uShoreWidth.value = Math.max(0.45, Math.min(3.2, state.waveHeight * 1.35 + 0.65));
    }

    function applySettings() {
        if (!mesh) return;
        const u = mesh.material.uniforms;
        updateSunFromScene();
        u.waterColor.value.set(state.color);
        u.sunColor.value.set(state.sunColor);
        u.alpha.value = state.opacity;
        u.distortionScale.value = state.distortion;
        u.uWaveHeight.value = state.waveHeight;
        u.uWaveScale.value = state.waveScale;
        u.uWaveSpeed.value = state.waveSpeed;
        u.uChoppiness.value = state.choppiness;
        u.uFoamAmount.value = state.foam;
        u.uSurfaceDetail.value = state.surfaceWaves;
        u.uSurfaceScale.value = state.surfaceScale;
        u.size.value = 0.45 + state.waveScale * 4.5;
        u.sunDirection.value.copy(sunDir);
        mesh.material.transparent = true;
        mesh.position.y = state.level;
        mesh.userData.oceanClipBias = MIRROR_CLIP_BIAS;
        syncTerrainToOcean();
    }

    function registerSceneItem() {
        if (!sceneRegistry || !mesh) return;
        sceneRegistry.unregister(OCEAN_SCENE_ITEM_ID);
        sceneRegistry.register({
            id: OCEAN_SCENE_ITEM_ID,
            label: "Océan",
            category: "environment",
            icon: "env",
            detail: `${Math.round(state.size)} m`,
            getVisible: () => !!mesh && mesh.visible,
            setVisible: (visible) => {
                if (mesh) mesh.visible = visible;
            },
            select: () => {},
            canDelete: () => true,
            onDelete: () => removeOcean({ recordHistory: true }),
        });
    }

    function serializeState() {
        if (!mesh) return null;
        return { ...state, visible: mesh.visible };
    }

    /**
     * @param {{ recordHistory?: boolean }} [opts]
     */
    async function createOcean({ recordHistory = true } = {}) {
        if (mesh || creating) {
            if (mesh) showStatus("Océan déjà présent");
            return;
        }
        creating = true;
        createBtn && (createBtn.disabled = true);
        try {
            if (!normalsTex) normalsTex = await loadNormals(WATER_NORMALS_URL);
            updateSunFromScene();

            const geometry = new THREE.PlaneGeometry(state.size, state.size, SEGMENTS, SEGMENTS);
            geometry.rotateX(-Math.PI / 2);
            mesh = new RealisticOcean(geometry, {
                waterNormals: normalsTex,
                sunDirection: sunDir.clone(),
                sunColor: new THREE.Color(state.sunColor).getHex(),
                waterColor: new THREE.Color(state.color).getHex(),
                shallowColor: 0x4ec8d8,
                distortionScale: state.distortion,
                alpha: state.opacity,
                textureWidth: 1024,
                textureHeight: 1024,
            });
            mesh.position.y = state.level;
            mesh.name = "lab-ocean";
            mesh.userData.labOcean = true;
            mesh.userData.labNoPick = true;

            const mirrorPass = mesh.onBeforeRender.bind(mesh);
            mesh.onBeforeRender = (rend, scn, cam) => {
                if (!mesh) return;
                // Le temps est avancé via tick() (beforeRender) pour rester
                // synchronisé avec la flottaison — pas ici.
                syncTerrainToOcean();
                mirrorPass(rend, scn, cam);
            };

            scene.add(mesh);
            softenFogForOcean();
            applySettings();
            registerSceneItem();
            syncUiFromState();
            showStatus("Océan créé");
            if (recordHistory) {
                pushSceneHistory?.({ type: "ocean", before: null, after: serializeState() });
            }
        } catch (err) {
            console.error("[LAB] océan:", err);
            if (mesh) {
                scene.remove(mesh);
                mesh.disposeResources();
                mesh = null;
            }
            showStatus("Impossible de créer l’océan");
        } finally {
            creating = false;
            createBtn && (createBtn.disabled = false);
        }
    }

    /**
     * @param {{ recordHistory?: boolean }} [opts]
     */
    function removeOcean({ recordHistory = true, resetSettings = false } = {}) {
        if (!mesh) return;
        const before = recordHistory ? serializeState() : null;
        scene.remove(mesh);
        mesh.disposeResources();
        mesh = null;
        restoreFog();
        sceneRegistry?.unregister(OCEAN_SCENE_ITEM_ID);
        if (resetSettings) {
            Object.assign(state, DEFAULTS);
        }
        syncUiFromState();
        showStatus("Océan retiré");
        if (recordHistory && before) {
            pushSceneHistory?.({ type: "ocean", before, after: null });
        }
    }

    /**
     * @param {number} nextSize
     * @param {{ recordHistory?: boolean }} [opts]
     */
    function applyOceanSize(nextSize, { recordHistory = true } = {}) {
        const size = Math.max(20, Math.min(500, Number(nextSize) || state.size));
        if (!mesh) {
            state.size = size;
            syncUiFromState();
            return;
        }
        if (Math.abs(size - state.size) < 0.001) return;
        const before = recordHistory ? serializeState() : null;
        state.size = size;
        rebuildSize();
        syncUiFromState();
        if (recordHistory && before) {
            pushSceneHistory?.({ type: "ocean", before, after: serializeState() });
        }
    }

    function rebuildSize() {
        if (!mesh) return;
        const prev = mesh.geometry;
        const geometry = new THREE.PlaneGeometry(state.size, state.size, SEGMENTS, SEGMENTS);
        geometry.rotateX(-Math.PI / 2);
        mesh.geometry = geometry;
        prev.dispose();
        registerSceneItem();
    }

    /**
     * @param {HTMLInputElement | null} input
     * @param {HTMLOutputElement | null} output
     * @param {(v: number) => void} apply
     * @param {(v: number) => string} format
     * @param {{ step?: number }} [opts]
     */
    function bindSlider(input, output, apply, format, opts = {}) {
        if (!input) return;
        const run = (value) => {
            apply(value);
            if (output) output.textContent = format(value);
            applySettings();
        };
        input.addEventListener("input", () => run(Number(input.value)));
        bindRangeSliderWheel(input, (value) => {
            input.value = String(value);
            run(value);
        }, opts);
    }

    createBtn?.addEventListener("click", (e) => {
        e.stopPropagation();
        if (mesh) {
            if (toolsEl) toolsEl.hidden = !toolsEl.hidden;
            return;
        }
        void createOcean({ recordHistory: true });
    });

    removeBtn?.addEventListener("click", (e) => {
        e.stopPropagation();
        removeOcean({ recordHistory: true });
    });

    colorInput?.addEventListener("input", () => {
        state.color = colorInput.value;
        applySettings();
    });
    sunColorInput?.addEventListener("input", () => {
        state.sunColor = sunColorInput.value;
        applySettings();
    });

    bindSlider(opacityInput, opacityValue, (v) => { state.opacity = v; }, (v) => formatNum(v), { step: 0.05 });
    bindSlider(heightInput, heightValue, (v) => { state.waveHeight = v; }, (v) => `${formatNum(v)} m`, { step: 0.01 });
    bindSlider(scaleInput, scaleValue, (v) => { state.waveScale = v; }, (v) => formatNum(v, 3), { step: 0.005 });
    bindSlider(speedInput, speedValue, (v) => { state.waveSpeed = v; }, (v) => formatNum(v), { step: 0.05 });
    bindSlider(chopInput, chopValue, (v) => { state.choppiness = v; }, (v) => formatNum(v), { step: 0.05 });
    bindSlider(surfaceWavesInput, surfaceWavesValue, (v) => { state.surfaceWaves = v; }, (v) => formatNum(v), { step: 0.05 });
    bindSlider(surfaceScaleInput, surfaceScaleValue, (v) => { state.surfaceScale = v; }, (v) => formatNum(v), { step: 0.05 });
    bindSlider(distortionInput, distortionValue, (v) => { state.distortion = v; }, (v) => formatNum(v), { step: 0.1 });
    bindSlider(foamInput, foamValue, (v) => { state.foam = v; }, (v) => formatNum(v), { step: 0.05 });
    bindSlider(levelInput, levelValue, (v) => { state.level = v; }, (v) => `${formatNum(v)} m`, { step: 0.05 });

    if (sizeInput) {
        sizeInput.addEventListener("input", () => {
            if (sizeValue) sizeValue.textContent = `${formatNum(Number(sizeInput.value) || state.size, 0)} m`;
        });
        sizeInput.addEventListener("change", () => {
            applyOceanSize(Number(sizeInput.value), { recordHistory: true });
        });
        bindRangeSliderWheel(sizeInput, (value) => {
            sizeInput.value = String(value);
            applyOceanSize(value, { recordHistory: true });
        }, { step: 1 });
    }

    /**
     * Altitude de la surface en (x, z) monde — même houle que le shader.
     * Deux itérations pour compenser le déplacement horizontal de Gerstner.
     * @param {number} x
     * @param {number} z
     * @returns {number | null}
     */
    function getWaveHeightAt(x, z) {
        if (!mesh) return null;
        const half = Math.max(0.5, state.size * 0.5 - 0.25);
        // Clamp dans le domaine plutôt que null : sinon la flottaison
        // s’arrête dès qu’un coin de barque sort du disque océan.
        const sx = THREE.MathUtils.clamp(x, -half, half);
        const sz = THREE.MathUtils.clamp(z, -half, half);

        const time = (mesh.material?.uniforms?.uTime?.value ?? 0) * state.waveSpeed;
        const height = state.waveHeight;
        const scale = state.waveScale;
        const steep = Math.max(0, Math.min(2.5, state.choppiness));

        let baseX = sx;
        let baseZ = sz;
        let elevation = 0;
        for (let pass = 0; pass < 2; pass += 1) {
            let dx = 0;
            let dy = 0;
            let dz = 0;
            for (const wave of WAVE_TRAINS) {
                const amp = height * wave.amp;
                const freq = scale * wave.freq;
                const phase =
                    (wave.dir[0] * baseX + wave.dir[1] * baseZ) * freq +
                    time * wave.timeMul * wave.speed;
                const qa = steep * wave.steep * amp;
                dx += wave.dir[0] * qa * Math.cos(phase);
                dz += wave.dir[1] * qa * Math.cos(phase);
                dy += amp * Math.sin(phase);
            }
            elevation = dy;
            baseX = sx - dx;
            baseZ = sz - dz;
        }
        return mesh.position.y + elevation;
    }

    /**
     * Avance le temps de l’océan (houle + rides) — indépendant du rendu miroir.
     * @param {number} dt
     */
    function tick(dt) {
        if (!mesh?.material?.uniforms) return;
        const d = THREE.MathUtils.clamp(Number(dt) || 1 / 60, 0.001, 0.1);
        mesh.material.uniforms.time.value += d * state.waveSpeed;
        mesh.material.uniforms.uTime.value += d;
    }

    syncUiFromState();

    return {
        create: createOcean,
        remove: removeOcean,
        isActive: () => !!mesh,
        getMesh: () => mesh,
        getWaveHeightAt,
        tick,
        serialize: serializeState,
        /**
         * @param {Partial<typeof DEFAULTS> & { visible?: boolean } | null | undefined} data
         * @param {{ recordHistory?: boolean }} [opts]
         */
        async deserialize(data, { recordHistory = false } = {}) {
            if (!data) {
                removeOcean({ recordHistory: false });
                return;
            }
            Object.assign(state, {
                size: Number(data.size) || DEFAULTS.size,
                level: Number.isFinite(Number(data.level)) ? Number(data.level) : DEFAULTS.level,
                color: data.color || DEFAULTS.color,
                sunColor: data.sunColor || DEFAULTS.sunColor,
                opacity: Number.isFinite(Number(data.opacity)) ? Number(data.opacity) : DEFAULTS.opacity,
                waveHeight: Number.isFinite(Number(data.waveHeight)) ? Number(data.waveHeight) : DEFAULTS.waveHeight,
                waveScale: Number.isFinite(Number(data.waveScale)) ? Number(data.waveScale) : DEFAULTS.waveScale,
                waveSpeed: Number.isFinite(Number(data.waveSpeed)) ? Number(data.waveSpeed) : DEFAULTS.waveSpeed,
                choppiness: Number.isFinite(Number(data.choppiness)) ? Number(data.choppiness) : DEFAULTS.choppiness,
                surfaceWaves: Number.isFinite(Number(data.surfaceWaves)) ? Number(data.surfaceWaves) : DEFAULTS.surfaceWaves,
                surfaceScale: Number.isFinite(Number(data.surfaceScale)) ? Number(data.surfaceScale) : DEFAULTS.surfaceScale,
                distortion: Number.isFinite(Number(data.distortion)) ? Number(data.distortion) : DEFAULTS.distortion,
                foam: Number.isFinite(Number(data.foam)) ? Number(data.foam) : DEFAULTS.foam,
            });
            if (!mesh) await createOcean({ recordHistory: false });
            else {
                rebuildSize();
                applySettings();
            }
            if (mesh && data.visible === false) mesh.visible = false;
            syncUiFromState();
            if (recordHistory) {
                pushSceneHistory?.({ type: "ocean", before: null, after: serializeState() });
            }
        },
        /**
         * @param {((entry: { type: "ocean", before: object | null, after: object | null }) => void) | null} fn
         */
        setSceneHistoryPush(fn) {
            pushSceneHistory = fn;
        },
    };
}
