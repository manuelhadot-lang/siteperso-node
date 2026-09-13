/**
 * Vue geo IGN (Giro3D) — MNT REST IGN + ortho WMTS + bâtiments BD TOPO® drapés.
 * Query : ?lat=&lon=&size= (mètres, côté de la zone carrée).
 */
import {
  AmbientLight,
  BufferGeometry,
  Color,
  DataTexture,
  DirectionalLight,
  DoubleSide,
  Float32BufferAttribute,
  FloatType,
  LinearFilter,
  Mesh,
  MeshLambertMaterial,
  NoColorSpace,
  Object3D,
  PCFSoftShadowMap,
  RGFormat,
  Uniform,
  Vector3,
} from "three";
import { MapControls } from "three/examples/jsm/controls/MapControls.js";
import GeoJSON from "ol/format/GeoJSON";
import proj4 from "proj4";

import CoordinateSystem from "@giro3d/giro3d/core/geographic/CoordinateSystem.js";
import Extent from "@giro3d/giro3d/core/geographic/Extent.js";
import Instance from "@giro3d/giro3d/core/Instance.js";
import ColorLayer from "@giro3d/giro3d/core/layer/ColorLayer.js";
import ElevationLayer from "@giro3d/giro3d/core/layer/ElevationLayer.js";
import DrapedFeatureCollection from "@giro3d/giro3d/entities/DrapedFeatureCollection.js";
import Giro3dMap from "@giro3d/giro3d/entities/Map.js";
import { MapLightingMode } from "@giro3d/giro3d/entities/MapLightingOptions.js";
import ImageSource, { ImageResult } from "@giro3d/giro3d/sources/ImageSource.js";
import StaticFeatureSource from "@giro3d/giro3d/sources/StaticFeatureSource.js";
import WmtsSource from "@giro3d/giro3d/sources/WmtsSource.js";

const LAMBERT93 =
  "+proj=lcc +lat_0=46.5 +lat_1=49 +lat_2=44 +lon_0=3 +x_0=700000 +y_0=6600000 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs +type=crs";

proj4.defs("EPSG:2154", LAMBERT93);
proj4.defs("EPSG:4326", "+proj=longlat +datum=WGS84 +no_defs +type=crs");

const epsg2154 = CoordinateSystem.register("EPSG:2154", LAMBERT93);

const WMTS_CAPS =
  "https://data.geopf.fr/wmts?SERVICE=WMTS&VERSION=1.0.0&REQUEST=GetCapabilities";

const HEIGHT_GRID = 65;
/**
 * Enfoncement de la base des bâtiments (m). Volontairement identique pour tous :
 * le shader de façade s'en sert pour situer le sol dans le repère du maillage.
 */
const BASE_SINK = 2.5;
const HEIGHT_PROP = "_giro_hauteur";
const SINK_PROP = "_giro_enfoncement";

/** Trame des façades procédurales, en mètres. */
const FLOOR_HEIGHT = 2.9;
const GROUND_FLOOR_HEIGHT = 3.6;
const BAY_WIDTH = 3.2;

const DEG = Math.PI / 180;
/** Obliquité de l'écliptique. */
const OBLIQUITY = 23.4397 * DEG;
/**
 * Le shader de terrain Giro3D multiplie la photo par l'éclairement diffus
 * (≈ (N·L × soleil + ambiante) / π). Ces valeurs gardent l'ortho à son
 * exposition d'origine quand le soleil est à 45°.
 */
const SUN_INTENSITY = 3.2;
const AMBIENT_DAY = 0.9;
const AMBIENT_NIGHT = 0.8;
const SUN_DAY_COLOR = new Color(0xfff4e2);
const SUN_DUSK_COLOR = new Color(0xff9a52);
const AMBIENT_NIGHT_COLOR = new Color(0x9db4d6);
const SKY_DAY_COLOR = new Color(0x87b5d9);
const SKY_NIGHT_COLOR = new Color(0x1a2740);

/**
 * Position du soleil pour une date et un lieu.
 * Azimut renvoyé compté depuis le sud, positif vers l'ouest.
 * @param {Date} date
 * @param {number} lat
 * @param {number} lon
 */
function sunPosition(date, lat, lon) {
  const days = date.getTime() / 86400000 - 0.5 + 2440588 - 2451545;
  const meanAnomaly = (357.5291 + 0.98560028 * days) * DEG;
  const eclipticLon =
    meanAnomaly +
    (1.9148 * Math.sin(meanAnomaly) +
      0.02 * Math.sin(2 * meanAnomaly) +
      0.0003 * Math.sin(3 * meanAnomaly)) *
      DEG +
    102.9372 * DEG +
    Math.PI;
  const declination = Math.asin(Math.sin(OBLIQUITY) * Math.sin(eclipticLon));
  const rightAscension = Math.atan2(
    Math.sin(eclipticLon) * Math.cos(OBLIQUITY),
    Math.cos(eclipticLon)
  );
  const siderealTime = (280.16 + 360.9856235 * days) * DEG + lon * DEG;
  const hourAngle = siderealTime - rightAscension;
  const latR = lat * DEG;
  const altitude = Math.asin(
    Math.sin(latR) * Math.sin(declination) +
      Math.cos(latR) * Math.cos(declination) * Math.cos(hourAngle)
  );
  const azimuth = Math.atan2(
    Math.sin(hourAngle),
    Math.cos(hourAngle) * Math.sin(latR) - Math.tan(declination) * Math.cos(latR)
  );
  const cosAlt = Math.cos(altitude);
  return {
    east: -Math.sin(azimuth) * cosAlt,
    north: -Math.cos(azimuth) * cosAlt,
    up: Math.sin(altitude),
    altitudeDeg: altitude / DEG,
    /** Azimut boussole : 0 = nord, 90 = est. */
    compassDeg: ((azimuth / DEG + 180) % 360 + 360) % 360,
  };
}

/**
 * @param {number} compassDeg
 */
function compassLabel(compassDeg) {
  const names = ["nord", "nord-est", "est", "sud-est", "sud", "sud-ouest", "ouest", "nord-ouest"];
  return names[Math.round(compassDeg / 45) % 8];
}

/**
 * Source MNT Giro3D : texture RG float (hauteur + masque), comme le décodeur BIL.
 * StaticImageSource force du 8 bits sRGB : le sol reste plat.
 */
class HeightmapImageSource extends ImageSource {
  /**
   * @param {{
   *   extent: import("@giro3d/giro3d/core/geographic/Extent.js").default,
   *   heights: number[],
   *   width: number,
   *   height: number,
   *   min: number,
   *   max: number,
   * }} options
   */
  constructor(options) {
    super({
      is8bit: false,
      flipY: false,
      colorSpace: NoColorSpace,
      synchronous: false,
    });
    this._extent = options.extent;
    this._id = "ign-heightmap";
    this._min = options.min;
    this._max = options.max;
    const count = options.width * options.height;
    const data = new Float32Array(count * 2);
    for (let i = 0; i < count; i += 1) {
      data[i * 2] = options.heights[i];
      data[i * 2 + 1] = 1;
    }
    const texture = new DataTexture(
      data,
      options.width,
      options.height,
      RGFormat,
      FloatType
    );
    texture.needsUpdate = true;
    texture.generateMipmaps = false;
    texture.magFilter = LinearFilter;
    texture.minFilter = LinearFilter;
    texture.colorSpace = NoColorSpace;
    this._texture = texture;
  }

  getCrs() {
    return this._extent.crs;
  }

  getExtent() {
    return this._extent;
  }

  getImages() {
    return [
      {
        id: this._id,
        request: () =>
          Promise.resolve(
            new ImageResult({
              id: this._id,
              texture: this._texture,
              extent: this._extent,
              min: this._min,
              max: this._max,
            })
          ),
      },
    ];
  }
}

/**
 * @param {unknown} raw
 * @returns {number | null}
 */
function asElevationMeters(raw) {
  if (typeof raw === "number" && Number.isFinite(raw) && raw > -9000) return raw;
  if (raw && typeof raw === "object") {
    const z = Number(
      /** @type {{ z?: unknown, elevation?: unknown }} */ (raw).z ??
        /** @type {{ elevation?: unknown }} */ (raw).elevation
    );
    if (Number.isFinite(z) && z > -9000) return z;
  }
  const n = Number(raw);
  if (Number.isFinite(n) && n > -9000) return n;
  return null;
}

const statusEl = document.getElementById("status");
const sunInfoEl = document.getElementById("sun-info");
const latInput = /** @type {HTMLInputElement} */ (document.getElementById("lat"));
const lonInput = /** @type {HTMLInputElement} */ (document.getElementById("lon"));
const sizeInput = /** @type {HTMLInputElement} */ (document.getElementById("size"));
const dateInput = /** @type {HTMLInputElement | null} */ (document.getElementById("date"));
const hourInput = /** @type {HTMLInputElement | null} */ (document.getElementById("hour"));
const hourOutput = document.getElementById("hour-out");
const goBtn = document.getElementById("btn-go");

/**
 * @param {string} msg
 */
function setStatus(msg) {
  if (statusEl) statusEl.textContent = msg;
}

/**
 * @param {string} msg
 */
function setSunInfo(msg) {
  if (sunInfoEl) sunInfoEl.textContent = msg;
}

/** Initialise date + heure sur l'instant présent. */
function initDateTimeInputs() {
  const now = new Date();
  if (dateInput && !dateInput.value) {
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const day = String(now.getDate()).padStart(2, "0");
    dateInput.value = `${now.getFullYear()}-${month}-${day}`;
  }
  if (hourInput && !hourInput.value) {
    hourInput.value = String(now.getHours() + now.getMinutes() / 60);
  }
  updateHourLabel();
}

function updateHourLabel() {
  if (!hourOutput || !hourInput) return;
  const value = Number(hourInput.value);
  const hours = Math.floor(value);
  const minutes = Math.round((value - hours) * 60);
  hourOutput.textContent = `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

/** Date locale reconstruite depuis les deux champs. */
function readDateTime() {
  const fallback = new Date();
  if (!dateInput?.value || !hourInput?.value) return fallback;
  const [year, month, day] = dateInput.value.split("-").map(Number);
  if (![year, month, day].every(Number.isFinite)) return fallback;
  const value = Number(hourInput.value);
  const hours = Math.floor(value);
  const minutes = Math.round((value - hours) * 60);
  return new Date(year, month - 1, day, hours, minutes);
}

/**
 * @returns {{ lat: number, lon: number, size: number }}
 */
function readParams() {
  const q = new URLSearchParams(window.location.search);
  const lat = Number(q.get("lat"));
  const lon = Number(q.get("lon"));
  const size = Number(q.get("size"));
  return {
    lat: Number.isFinite(lat) ? lat : 48.85837,
    lon: Number.isFinite(lon) ? lon : 2.29448,
    size: Number.isFinite(size) ? Math.max(200, Math.min(5000, size)) : 800,
  };
}

/**
 * @param {number} lat
 * @param {number} lon
 * @param {number} sizeMeters
 */
function extentAround(lat, lon, sizeMeters) {
  const [x, y] = proj4("EPSG:4326", "EPSG:2154", [lon, lat]);
  const half = sizeMeters * 0.5;
  return {
    x,
    y,
    west: x - half,
    east: x + half,
    south: y - half,
    north: y + half,
    extent: new Extent(epsg2154, x - half, x + half, y - half, y + half),
  };
}

/**
 * Éclairement des fenêtres la nuit, partagé par tous les matériaux de façade.
 */
const facadeNight = new Uniform(0);
const facadeGroundZ = new Uniform(BASE_SINK);

/**
 * Le maillage d'un bâtiment est centré sur son premier sommet : dans ce repère,
 * `z` est la hauteur au-dessus de la base et `xy` reste petit, donc précis en
 * float32. On y dessine les étages et la trame de fenêtres, orientées par la
 * normale de chaque face — ce qui distingue aussi les murs des toitures.
 */
const FACADE_PRELUDE = /* glsl */ `
varying vec3 vFacadePos;
varying vec3 vFacadeNormal;
`;

const FACADE_FRAGMENT_PRELUDE = /* glsl */ `
uniform float uFacadeNight;
uniform float uFacadeGroundZ;

const float FLOOR_H = ${FLOOR_HEIGHT.toFixed(3)};
const float GROUND_H = ${GROUND_FLOOR_HEIGHT.toFixed(3)};
const float BAY_W = ${BAY_WIDTH.toFixed(3)};

float facadeHash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}
`;

const FACADE_FRAGMENT_BODY = /* glsl */ `
{
  vec3 fn = normalize(vFacadeNormal);
  float wallness = 1.0 - smoothstep(0.30, 0.65, abs(fn.z));
  float roofness = smoothstep(0.55, 0.85, abs(fn.z));

  float h = vFacadePos.z - uFacadeGroundZ;
  // Abscisse le long du mur : la tangente horizontale est constante par face,
  // donc la trame ne se décale jamais au milieu d'une façade.
  vec2 tangent = normalize(vec2(-fn.y, fn.x) + vec2(1e-5, 0.0));
  float u = dot(vFacadePos.xy, tangent);

  float above = max(h - GROUND_H, 0.0);
  float level = floor(above / FLOOR_H);
  float fy = above - level * FLOOR_H;
  float onGround = step(h, GROUND_H);

  float winY = mix(
    smoothstep(0.75, 0.90, fy) * (1.0 - smoothstep(2.05, 2.20, fy)),
    smoothstep(0.70, 0.85, h) * (1.0 - smoothstep(2.60, 2.75, h)),
    onGround
  );
  float bx = fract(u / BAY_W);
  float winX = smoothstep(0.24, 0.31, bx) * (1.0 - smoothstep(0.69, 0.76, bx));
  float window = winX * winY * wallness * step(0.15, h);

  float cell = facadeHash(vec2(floor(u / BAY_W), level - onGround));
  vec3 glass = mix(vec3(0.09, 0.12, 0.16), vec3(0.32, 0.40, 0.48), cell);

  // Soubassement et bandeaux d'étage : deux lignes d'ombre qui donnent l'échelle.
  float plinth = (1.0 - smoothstep(0.55, 0.80, h)) * wallness * step(-0.05, h);
  float edge = min(fy, FLOOR_H - fy);
  float band = (1.0 - smoothstep(0.03, 0.13, edge)) * wallness * (1.0 - onGround);
  float grain = 0.97 + 0.06 * facadeHash(floor(vec2(u, h) * 2.0));

  vec3 wallColor = diffuseColor.rgb * grain;
  wallColor = mix(wallColor, wallColor * 0.80, plinth);
  wallColor = mix(wallColor, wallColor * 0.90, band);
  wallColor = mix(wallColor, glass, window);

  float gravel = 0.93 + 0.13 * facadeHash(floor(vFacadePos.xy * 1.5));
  vec3 roofColor = (diffuseColor.rgb * 0.58 + vec3(0.02)) * gravel;

  diffuseColor.rgb = mix(wallColor, roofColor, roofness);
  // La nuit, une fenêtre sur trois s'allume.
  totalEmissiveRadiance += step(0.66, cell) * window * uFacadeNight * vec3(1.60, 1.28, 0.77);
}
`;

/** @type {Map<string, MeshLambertMaterial>} */
const facadeMaterialCache = new Map();

/**
 * Générateur de matériaux pour les surfaces ombrées des bâtiments.
 * Reste un MeshLambertMaterial, comme Giro3D, pour garder soleil et ombres.
 * @param {{ color?: unknown, opacity?: number, depthTest?: boolean, side?: number }} style
 */
function createFacadeMaterial(style) {
  const color = new Color(/** @type {any} */ (style?.color ?? "#d6cfc4"));
  const opacity = style?.opacity ?? 1;
  const depthTest = style?.depthTest ?? true;
  const key = `${color.getHexString()}|${opacity}|${depthTest}|${style?.side}`;
  const cached = facadeMaterialCache.get(key);
  if (cached) return cached;

  const material = new MeshLambertMaterial({
    color,
    opacity,
    transparent: opacity < 1,
    side: style?.side,
    depthTest,
    depthWrite: depthTest,
  });
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uFacadeNight = facadeNight;
    shader.uniforms.uFacadeGroundZ = facadeGroundZ;
    shader.vertexShader = FACADE_PRELUDE + shader.vertexShader.replace(
      "#include <project_vertex>",
      `#include <project_vertex>
  vFacadePos = transformed;
  vFacadeNormal = objectNormal;`
    );
    shader.fragmentShader =
      FACADE_PRELUDE +
      FACADE_FRAGMENT_PRELUDE +
      shader.fragmentShader.replace(
        "#include <emissivemap_fragment>",
        `#include <emissivemap_fragment>\n${FACADE_FRAGMENT_BODY}`
      );
  };
  material.customProgramCacheKey = () => "geo-facade";
  facadeMaterialCache.set(key, material);
  return material;
}

/** Enveloppe convexe (chaîne monotone d'Andrew). */
function convexHull(points) {
  if (points.length < 4) return points.slice();
  const sorted = points.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o, a, b) =>
    (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  /** @type {number[][]} */
  const lower = [];
  for (const p of sorted) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) {
      lower.pop();
    }
    lower.push(p);
  }
  /** @type {number[][]} */
  const upper = [];
  for (let i = sorted.length - 1; i >= 0; i -= 1) {
    const p = sorted[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) {
      upper.pop();
    }
    upper.push(p);
  }
  lower.pop();
  upper.pop();
  return lower.concat(upper);
}

/** Aire d'un anneau (formule des lacets). */
function polygonArea(ring) {
  let sum = 0;
  for (let i = 0, n = ring.length; i < n; i += 1) {
    const a = ring[i];
    const b = ring[(i + 1) % n];
    sum += a[0] * b[1] - b[0] * a[1];
  }
  return Math.abs(sum) * 0.5;
}

/**
 * Rectangle d'aire minimale englobant le nuage (calipers tournants).
 * C'est lui qui donne l'orientation du bâtiment, donc celle du faîtage.
 * @param {number[][]} hull
 */
function minAreaRect(hull) {
  let best = null;
  for (let i = 0, n = hull.length; i < n; i += 1) {
    const a = hull[i];
    const b = hull[(i + 1) % n];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (len < 1e-6) continue;
    const ux = (b[0] - a[0]) / len;
    const uy = (b[1] - a[1]) / len;
    let minU = Infinity;
    let maxU = -Infinity;
    let minV = Infinity;
    let maxV = -Infinity;
    for (const p of hull) {
      const du = p[0] * ux + p[1] * uy;
      const dv = -p[0] * uy + p[1] * ux;
      if (du < minU) minU = du;
      if (du > maxU) maxU = du;
      if (dv < minV) minV = dv;
      if (dv > maxV) maxV = dv;
    }
    const area = (maxU - minU) * (maxV - minV);
    if (!best || area < best.area) best = { area, ux, uy, minU, maxU, minV, maxV };
  }
  if (!best) return null;
  const cu = (best.minU + best.maxU) * 0.5;
  const cv = (best.minV + best.maxV) * 0.5;
  const halfA = (best.maxU - best.minU) * 0.5;
  const halfB = (best.maxV - best.minV) * 0.5;
  const cx = cu * best.ux - cv * best.uy;
  const cy = cu * best.uy + cv * best.ux;
  // Le faîtage suit toujours le grand côté.
  if (halfA >= halfB) {
    return { cx, cy, ux: best.ux, uy: best.uy, halfLong: halfA, halfShort: halfB, area: best.area };
  }
  return { cx, cy, ux: -best.uy, uy: best.ux, halfLong: halfB, halfShort: halfA, area: best.area };
}

/** Tuiles, ardoises et zinc. */
const ROOF_COLORS = ["#9c4b38", "#ab5a41", "#8a4132", "#6d5a4c", "#57606b", "#7c5342"];
/** Pente ≈ 30°, plafonnée pour ne pas obtenir de flèche sur un bâtiment large. */
const ROOF_SLOPE = 0.58;
const ROOF_RISE_MAX = 4.5;
const ROOF_OVERHANG = 0.4;
/**
 * La toiture redescend sous le haut du mur. Notre altitude du sol vient de la
 * grille MNT, celle de Giro3D de la texture de terrain : quelques centimètres
 * d'écart suffiraient à ouvrir un jour à l'égout.
 */
const ROOF_SKIRT = 0.5;

const ROOF_PRELUDE = /* glsl */ `
varying vec3 vRoofPos;
varying vec3 vRoofNormal;
`;

const ROOF_FRAGMENT_PRELUDE = /* glsl */ `
float roofHash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}
`;

const ROOF_FRAGMENT_BODY = /* glsl */ `
{
  vec3 rn = normalize(vRoofNormal);
  // Rangs de tuiles : des lignes de niveau, espacées de 17 cm de dénivelé.
  float rows = fract(vRoofPos.z / 0.17);
  float rowLine = 1.0 - smoothstep(0.0, 0.22, rows);
  // Joints verticaux, le long de la ligne de plus grande pente.
  vec2 along = normalize(vec2(-rn.y, rn.x) + vec2(1e-5, 0.0));
  float u = dot(vRoofPos.xy, along);
  float seam = fract(u / 0.26);
  float seamLine = 1.0 - smoothstep(0.0, 0.30, min(seam, 1.0 - seam));
  float wear = 0.94 + 0.12 * roofHash(floor(vec2(u, vRoofPos.z) * 3.0));
  diffuseColor.rgb *= wear * (1.0 - 0.22 * rowLine) * (1.0 - 0.10 * seamLine);
}
`;

function createRoofMaterial() {
  const material = new MeshLambertMaterial({ vertexColors: true });
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = ROOF_PRELUDE + shader.vertexShader.replace(
      "#include <project_vertex>",
      `#include <project_vertex>
  vRoofPos = transformed;
  vRoofNormal = objectNormal;`
    );
    shader.fragmentShader =
      ROOF_PRELUDE +
      ROOF_FRAGMENT_PRELUDE +
      shader.fragmentShader.replace(
        "#include <emissivemap_fragment>",
        `#include <emissivemap_fragment>\n${ROOF_FRAGMENT_BODY}`
      );
  };
  material.customProgramCacheKey = () => "geo-roof";
  return material;
}

/**
 * Décide si un bâtiment reçoit une toiture en pente, et sous quelle forme.
 * Calculé avant l'extrusion : dans BD TOPO, `hauteur` va jusqu'au sommet du
 * bâtiment. Les murs doivent donc s'arrêter à l'égout pour que le faîtage
 * retombe sur cette hauteur au lieu de la dépasser.
 * @param {any} feature GeoJSON BD TOPO, en EPSG:4326
 */
function planRoof(feature) {
  const geometry = feature?.geometry;
  if (!geometry) return null;
  /** @type {any[] | undefined} */
  let ring;
  if (geometry.type === "Polygon") {
    ring = geometry.coordinates?.[0];
  } else if (geometry.type === "MultiPolygon" && geometry.coordinates?.length === 1) {
    ring = geometry.coordinates[0]?.[0];
  }
  if (!Array.isArray(ring) || ring.length < 4) return null;

  /** @type {number[][]} */
  const points = [];
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const coord of ring) {
    const [px, py] = proj4("EPSG:4326", "EPSG:2154", [coord[0], coord[1]]);
    points.push([px, py]);
    if (px < minX) minX = px;
    if (px > maxX) maxX = px;
    if (py < minY) minY = py;
    if (py > maxY) maxY = py;
  }

  const rect = minAreaRect(convexHull(points));
  if (!rect) return null;
  const props = feature.properties ?? {};
  const height = buildingHeightMeters(props);
  const shortSide = rect.halfShort * 2;
  // Une pente ne se justifie que sur un bâti compact et rectangulaire : au-delà,
  // les toitures réelles sont plates et une croupe inventée sauterait aux yeux.
  if (height > 18 || shortSide < 3 || shortSide > 20) return null;
  if (polygonArea(points) / Math.max(rect.area, 1e-6) < 0.72) return null;

  const halfShort = rect.halfShort + ROOF_OVERHANG;
  let rise = Math.min(ROOF_RISE_MAX, Math.max(1, halfShort * ROOF_SLOPE));
  // Il faut laisser un mur debout sous l'égout.
  if (height - rise < 2.5) rise = height - 2.5;
  if (rise < 0.8) return null;

  return {
    cx: rect.cx,
    cy: rect.cy,
    ux: rect.ux,
    uy: rect.uy,
    halfLong: rect.halfLong + ROOF_OVERHANG,
    halfShort,
    rise,
    eaveHeight: height - rise,
    // Même point d'échantillonnage que Giro3D pour poser le bâtiment.
    groundX: (minX + maxX) * 0.5,
    groundY: (minY + maxY) * 0.5,
    seed: seedFromId(props.cleabs),
  };
}

/**
 * Toitures à quatre pans, d'après les plans calculés au chargement.
 * Tout le quartier tient dans un seul maillage, donc un seul appel de rendu.
 * @param {any[]} plans
 * @param {(x: number, y: number) => number} groundAt altitude du sol, en Lambert 93
 * @param {{ x: number, y: number }} origin origine locale, pour la précision float32
 */
function buildRoofs(plans, groundAt, origin) {
  /** @type {number[]} */
  const positions = [];
  /** @type {number[]} */
  const colors = [];
  const tint = new Color();
  let count = 0;

  const pushTriangle = (p0, p1, p2) => {
    // Normale tournée vers le haut, sinon la face reste dans l'ombre.
    const nz =
      (p1[0] - p0[0]) * (p2[1] - p0[1]) - (p1[1] - p0[1]) * (p2[0] - p0[0]);
    const tri = nz >= 0 ? [p0, p1, p2] : [p0, p2, p1];
    for (const p of tri) {
      positions.push(p[0], p[1], p[2]);
      colors.push(tint.r, tint.g, tint.b);
    }
  };

  for (const plan of plans) {
    if (!plan) continue;
    const groundZ = groundAt(plan.groundX, plan.groundY);
    const hu = plan.halfLong;
    const hv = plan.halfShort;
    const eaveZ = groundZ + plan.eaveHeight - ROOF_SKIRT;
    const ridgeZ = groundZ + plan.eaveHeight + plan.rise;
    const inset = Math.min(hv, hu * 0.45);
    const vx = -plan.uy;
    const vy = plan.ux;
    const at = (du, dv, z) => [
      plan.cx + plan.ux * du + vx * dv - origin.x,
      plan.cy + plan.uy * du + vy * dv - origin.y,
      z,
    ];
    const a = at(-hu, -hv, eaveZ);
    const b = at(hu, -hv, eaveZ);
    const d = at(-hu, hv, eaveZ);
    const e = at(hu, hv, eaveZ);
    const r0 = at(-hu + inset, 0, ridgeZ);
    const r1 = at(hu - inset, 0, ridgeZ);

    tint.set(ROOF_COLORS[plan.seed]);
    pushTriangle(a, b, r1);
    pushTriangle(a, r1, r0);
    pushTriangle(d, r0, r1);
    pushTriangle(d, r1, e);
    pushTriangle(a, r0, d);
    pushTriangle(b, e, r1);
    count += 1;
  }

  if (!count) return null;
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
  geometry.setAttribute("color", new Float32BufferAttribute(colors, 3));
  geometry.computeVertexNormals();
  // Giro3D n'ajuste les plans de caméra que sur les objets qui ont une sphère.
  geometry.computeBoundingSphere();
  const mesh = new Mesh(geometry, createRoofMaterial());
  mesh.position.set(origin.x, origin.y, 0);
  mesh.updateMatrix();
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return { mesh, count };
}

/** Hash stable d'un identifiant BD TOPO. */
function seedFromId(id) {
  const text = String(id ?? "");
  let hash = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) % 6;
}

/**
 * Sans variation, tout un quartier partage exactement la même teinte et l'œil
 * lit une maquette. Six variantes quantifiées suffisent, et bornent le nombre
 * de matériaux.
 * @param {string} hex
 * @param {number} seed
 */
function tintedColor(hex, seed) {
  const color = new Color(hex);
  color.offsetHSL((seed - 2.5) * 0.007, (seed % 3 - 1) * 0.025, (seed - 2.5) * 0.017);
  return `#${color.getHexString()}`;
}

/**
 * @param {import("ol").Feature} feature
 */
function buildingStyle(feature) {
  const properties = feature.getProperties();
  let fillColor = "#d6cfc4";
  switch (properties.usage_1) {
    case "Industriel":
      fillColor = "#f0bb41";
      break;
    case "Agricole":
      fillColor = "#96ff0d";
      break;
    case "Religieux":
      fillColor = "#41b5f0";
      break;
    case "Sportif":
      fillColor = "#ff0d45";
      break;
    case "Résidentiel":
      fillColor = "#cec8be";
      break;
    case "Commercial et services":
      fillColor = "#d8ffd4";
      break;
    default:
      break;
  }
  const seed = seedFromId(properties.cleabs ?? feature.getId());
  return {
    fill: { color: tintedColor(fillColor, seed), shading: true },
    stroke: { color: "#1e293b", lineWidth: 1 },
  };
}

/**
 * Hauteur BD TOPO (m) — attribut officiel `hauteur`, sinon étages.
 * @param {Record<string, unknown>} props
 */
function buildingHeightMeters(props) {
  const h = Number(props.hauteur);
  if (Number.isFinite(h) && h >= 1.5 && h < 250) return h;
  const floors = Number(props.nombre_d_etages);
  if (Number.isFinite(floors) && floors > 0) {
    return Math.min(120, Math.max(2.8, floors * 2.8));
  }
  return 8;
}

/**
 * Giro3D pose le bâtiment à l'altitude de son centre : sur une pente, un côté
 * décollerait. On enfonce la base pour masquer l'écart, sans réduire la hauteur
 * visible (l'extrusion compense l'enfoncement).
 */
function buildingSinkMeters() {
  return BASE_SINK;
}

/**
 * @param {import("ol").Feature} feature
 */
function extrusionOffsetCallback(feature) {
  const props = feature.getProperties();
  const h = Number(props[HEIGHT_PROP]);
  const sink = Number(props[SINK_PROP]);
  if (Number.isFinite(h) && Number.isFinite(sink)) return h + sink;
  return buildingHeightMeters(props);
}

/**
 * Altitude du sol, interpolée dans la grille MNT (coordonnées Lambert 93).
 * Les échantillons sont au centre des mailles, d'où le décalage d'un demi-pas.
 * @param {{ heights: number[], width: number } | null} grid
 * @param {{ west: number, east: number, south: number, north: number }} bounds
 * @param {number} fallback altitude retenue si le relief n'a pas pu être chargé
 */
function makeGroundSampler(grid, bounds, fallback) {
  if (!grid) return () => fallback;
  const { heights, width: n } = grid;
  const dx = (bounds.east - bounds.west) / n;
  const dy = (bounds.north - bounds.south) / n;
  return (x, y) => {
    const fx = (x - bounds.west) / dx - 0.5;
    const fy = (y - bounds.south) / dy - 0.5;
    const i0 = Math.max(0, Math.min(n - 1, Math.floor(fx)));
    const j0 = Math.max(0, Math.min(n - 1, Math.floor(fy)));
    const i1 = Math.min(n - 1, i0 + 1);
    const j1 = Math.min(n - 1, j0 + 1);
    const tx = Math.max(0, Math.min(1, fx - i0));
    const ty = Math.max(0, Math.min(1, fy - j0));
    const bottom = heights[j0 * n + i0] * (1 - tx) + heights[j0 * n + i1] * tx;
    const top = heights[j1 * n + i0] * (1 - tx) + heights[j1 * n + i1] * tx;
    return bottom * (1 - ty) + top * ty;
  };
}

/**
 * Grille MNT via le proxy REST du lab. j = 0 = sud (origine DataTexture).
 * @param {number} west
 * @param {number} east
 * @param {number} south
 * @param {number} north
 */
async function fetchHeightGrid(west, east, south, north) {
  const n = HEIGHT_GRID;
  const dx = (east - west) / n;
  const dy = (north - south) / n;
  /** @type {string[]} */
  const lats = [];
  /** @type {string[]} */
  const lons = [];
  for (let j = 0; j < n; j += 1) {
    const y = south + (j + 0.5) * dy;
    for (let i = 0; i < n; i += 1) {
      const x = west + (i + 0.5) * dx;
      const [lon, lat] = proj4("EPSG:2154", "EPSG:4326", [x, y]);
      lats.push(lat.toFixed(6));
      lons.push(lon.toFixed(6));
    }
  }
  const res = await fetch("/api/ign/elevation", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "same-origin",
    body: JSON.stringify({ lats, lons }),
    cache: "no-store",
  });
  let data = null;
  try {
    data = await res.json();
  } catch {
    data = null;
  }
  if (!res.ok || !Array.isArray(data?.elevations) || data.elevations.length !== n * n) {
    const err =
      (data && typeof data.error === "string" && data.error) ||
      `HTTP ${res.status}`;
    throw new Error(err);
  }
  /** @type {number[]} */
  const heights = new Array(n * n);
  let min = Infinity;
  let max = -Infinity;
  let sum = 0;
  let count = 0;
  for (let p = 0; p < n * n; p += 1) {
    const v = asElevationMeters(data.elevations[p]);
    if (v == null) {
      heights[p] = Number.NaN;
      continue;
    }
    heights[p] = v;
    if (v < min) min = v;
    if (v > max) max = v;
    sum += v;
    count += 1;
  }
  if (!count) throw new Error("Aucune altitude IGN sur cette zone");
  for (let p = 0; p < n * n; p += 1) {
    if (!Number.isFinite(heights[p])) heights[p] = min;
  }
  return { heights, width: n, height: n, min, max, mean: sum / count };
}

/**
 * @param {number} lat
 * @param {number} lon
 * @param {number} sizeMeters
 */
function buildingsApiUrl(lat, lon, sizeMeters) {
  const [cx, cy] = proj4("EPSG:4326", "EPSG:2154", [lon, lat]);
  const half = sizeMeters * 0.5;
  const sw = proj4("EPSG:2154", "EPSG:4326", [cx - half, cy - half]);
  const ne = proj4("EPSG:2154", "EPSG:4326", [cx + half, cy + half]);
  const west = Math.min(sw[0], ne[0]);
  const east = Math.max(sw[0], ne[0]);
  const south = Math.min(sw[1], ne[1]);
  const north = Math.max(sw[1], ne[1]);
  return `/api/ign/bdtopo-buildings?${new URLSearchParams({
    south: String(south),
    west: String(west),
    north: String(north),
    east: String(east),
    count: "800",
  })}`;
}

/**
 * BD TOPO renvoie des géométries 3D (Z = altitude NGF). Giro3D ajoute ensuite
 * l'altitude du terrain : en gardant ce Z, les bâtiments flotteraient au double.
 * On le remplace donc par l'enfoncement voulu, relatif au sol.
 * @param {unknown} coords
 * @param {number} z
 * @returns {unknown}
 */
function setCoordinatesZ(coords, z) {
  if (!Array.isArray(coords)) return coords;
  if (typeof coords[0] === "number") return [coords[0], coords[1], z];
  return coords.map((item) => setCoordinatesZ(item, z));
}

/**
 * @param {any} feature
 * @param {{ eaveHeight: number } | null} [roofPlan]
 */
function prepareBuildingFeature(feature, roofPlan) {
  const coordinates = feature?.geometry?.coordinates;
  if (!coordinates) return feature;
  const props = feature.properties ?? {};
  const height = roofPlan ? roofPlan.eaveHeight : buildingHeightMeters(props);
  const sink = buildingSinkMeters();
  return {
    ...feature,
    properties: { ...props, [HEIGHT_PROP]: height, [SINK_PROP]: sink },
    geometry: {
      ...feature.geometry,
      coordinates: setCoordinatesZ(coordinates, -sink),
    },
  };
}

/**
 * @param {string} url
 * @returns {Promise<{ source: StaticFeatureSource, count: number, roofPlans: any[] }>}
 */
async function loadBuildingSource(url) {
  const res = await fetch(url, { credentials: "same-origin", cache: "no-store" });
  let geo = null;
  try {
    geo = await res.json();
  } catch {
    geo = null;
  }
  if (!res.ok) {
    throw new Error(
      (geo && typeof geo.error === "string" && geo.error) || `BD TOPO HTTP ${res.status}`
    );
  }
  const rawFeatures = Array.isArray(geo?.features) ? geo.features : [];
  const roofPlans = rawFeatures.map(planRoof);
  const features = new GeoJSON().readFeatures(
    {
      type: "FeatureCollection",
      features: rawFeatures.map((feature, index) =>
        prepareBuildingFeature(feature, roofPlans[index])
      ),
    },
    {
      dataProjection: "EPSG:4326",
      featureProjection: "EPSG:4326",
    }
  );
  return {
    count: features.length,
    roofPlans,
    source: new StaticFeatureSource({
      features,
      coordinateSystem: CoordinateSystem.epsg4326,
    }),
  };
}

async function boot() {
  const params = readParams();
  latInput.value = String(params.lat);
  lonInput.value = String(params.lon);
  sizeInput.value = String(params.size);

  const notes = [];
  setStatus("Création de la scène Giro3D…");

  const { x, y, west, east, south, north, extent } = extentAround(
    params.lat,
    params.lon,
    params.size
  );

  const instance = new Instance({
    target: "view",
    crs: epsg2154,
    backgroundColor: new Color(0x87b5d9),
  });

  instance.renderer.shadowMap.enabled = true;
  instance.renderer.shadowMap.type = PCFSoftShadowMap;

  const map = new Giro3dMap({
    extent,
    backgroundColor: "#6b7280",
    lighting: {
      enabled: true,
      // Même soleil que les bâtiments, et le sol peut recevoir leurs ombres.
      mode: MapLightingMode.LightBased,
      elevationLayersOnly: false,
    },
    terrain: {
      enabled: true,
      segments: 64,
    },
    side: DoubleSide,
  });
  instance.add(map);
  // Le MNT est trop grossier (~12 m) pour s'auto-ombrer proprement.
  map.castShadow = false;
  map.receiveShadow = true;

  // Lancé tout de suite : la grille MNT demande plusieurs secondes à l'IGN.
  const buildingsPromise = loadBuildingSource(
    buildingsApiUrl(params.lat, params.lon, params.size)
  ).catch((err) => {
    console.error("[geo] BD TOPO :", err);
    return null;
  });

  setStatus("Chargement du relief IGN…");
  let elevationOk = false;
  let meanZ = 40;
  /** @type {{ heights: number[], width: number } | null} */
  let heightGrid = null;
  try {
    const grid = await fetchHeightGrid(west, east, south, north);
    heightGrid = grid;
    meanZ = grid.mean;
    await map.addLayer(
      new ElevationLayer({
        name: "elevation",
        extent: map.extent,
        minmax: { min: grid.min, max: grid.max },
        source: new HeightmapImageSource({
          extent,
          heights: grid.heights,
          width: grid.width,
          height: grid.height,
          min: grid.min,
          max: grid.max,
        }),
      })
    );
    elevationOk = true;
    notes.push(
      `relief ${Math.round(grid.min)}–${Math.round(grid.max)} m (Δ ${Math.round(grid.max - grid.min)} m)`
    );
  } catch (err) {
    console.error("[geo] MNT REST :", err);
    notes.push("relief indisponible");
  }

  setStatus("Chargement ortho IGN…");
  try {
    const orthophotoWmts = await WmtsSource.fromCapabilities(WMTS_CAPS, {
      layer: "HR.ORTHOIMAGERY.ORTHOPHOTOS",
    });
    await map.addLayer(
      new ColorLayer({
        name: "ortho",
        extent: map.extent,
        source: orthophotoWmts,
      })
    );
    notes.push("ortho OK");
  } catch (err) {
    console.error(err);
    notes.push("ortho indisponible");
  }

  setStatus("Bâtiments BD TOPO…");
  /** @type {any[]} */
  let roofPlans = [];
  try {
    const loaded = await buildingsPromise;
    if (!loaded) throw new Error("BD TOPO indisponible");
    const { source, count } = loaded;
    roofPlans = loaded.roofPlans ?? [];
    const featureCollection = new DrapedFeatureCollection({
      style: buildingStyle,
      extrusionOffset: extrusionOffsetCallback,
      drapingMode: "per-feature",
      minLod: 0,
      source,
      shadedSurfaceMaterialGenerator: createFacadeMaterial,
    });
    instance.add(featureCollection);
    featureCollection.attach(map);
    featureCollection.castShadow = true;
    featureCollection.receiveShadow = true;
    map.renderOrder = 0;
    featureCollection.renderOrder = 1;
    notes.push(count ? `${count} bâtiments` : "aucun bâtiment (zone vide ?)");
  } catch (err) {
    console.error("[geo] BD TOPO :", err);
    notes.push("bâtiments indisponibles");
  }

  if (roofPlans.length) {
    setStatus("Toitures…");
    try {
      const groundAt = makeGroundSampler(
        heightGrid,
        { west, east, south, north },
        elevationOk ? meanZ : 0
      );
      const roofs = buildRoofs(roofPlans, groundAt, { x, y });
      if (roofs) {
        await instance.add(roofs.mesh);
        // Giro3D coupe `matrixWorldAutoUpdate` sur la scène : ses entités
        // gèrent leurs matrices seules. Sans ce calcul explicite, le maillage
        // resterait dessiné à l'origine du Lambert 93, hors de la zone.
        roofs.mesh.updateMatrixWorld(true);
        notes.push(`${roofs.count} toitures en pente`);
      }
    } catch (err) {
      console.error("[geo] toitures :", err);
    }
  }

  const groundZ = elevationOk ? meanZ : 0;
  const sunDistance = Math.max(2500, params.size * 3);
  const shadowHalf = params.size * 0.8;

  const sun = new DirectionalLight(SUN_DAY_COLOR, SUN_INTENSITY);
  const sunTarget = new Object3D();
  sunTarget.position.set(x, y, groundZ);
  instance.scene.add(sunTarget);
  sun.target = sunTarget;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -shadowHalf;
  sun.shadow.camera.right = shadowHalf;
  sun.shadow.camera.top = shadowHalf;
  sun.shadow.camera.bottom = -shadowHalf;
  sun.shadow.camera.near = sunDistance * 0.05;
  sun.shadow.camera.far = sunDistance * 2.5;
  sun.shadow.camera.updateProjectionMatrix();
  // Grandes distances : sans ce décalage, l'ortho se couvre de moirage d'ombre.
  sun.shadow.normalBias = 0.6;
  sun.shadow.bias = -0.0002;
  instance.scene.add(sun);

  const ambient = new AmbientLight(0xffffff, AMBIENT_DAY);
  instance.scene.add(ambient);

  // `backgroundColor` n'est qu'une option de construction : on pilote le ciel
  // par le fond de scène three.js, qui prend le pas sur la couleur d'effacement.
  const skyColor = SKY_DAY_COLOR.clone();
  instance.scene.background = skyColor;

  /**
   * @param {Date} date
   */
  function applySun(date) {
    const s = sunPosition(date, params.lat, params.lon);
    const night = s.altitudeDeg <= -1;
    const up = Math.max(0.05, s.up);
    sun.position.set(
      sunTarget.position.x + s.east * sunDistance,
      sunTarget.position.y + s.north * sunDistance,
      sunTarget.position.z + up * sunDistance
    );
    sun.intensity = night ? 0 : SUN_INTENSITY;
    // Le soleil rasant rougit : mélange progressif sur les 10 premiers degrés.
    const warmth = Math.max(0, Math.min(1, s.altitudeDeg / 10));
    sun.color.copy(SUN_DUSK_COLOR).lerp(SUN_DAY_COLOR, warmth);
    // Une ombre de soleil rasant sortirait du champ de la shadow map.
    sun.castShadow = s.altitudeDeg > 5;
    ambient.intensity = night ? AMBIENT_NIGHT : AMBIENT_DAY;
    ambient.color.copy(night ? AMBIENT_NIGHT_COLOR : SUN_DAY_COLOR);
    // Les fenêtres s'allument à la tombée du jour, pas d'un coup.
    facadeNight.value = 1 - Math.max(0, Math.min(1, (s.altitudeDeg + 4) / 10));
    // Ciel qui s'assombrit et se réchauffe avec le soleil rasant.
    skyColor.copy(night ? SKY_NIGHT_COLOR : SKY_DAY_COLOR);
    if (!night) skyColor.lerp(SUN_DUSK_COLOR, (1 - warmth) * 0.45);
    sunTarget.updateMatrixWorld(true);
    sun.updateMatrixWorld(true);
    instance.notifyChange(map);
    setSunInfo(
      night
        ? "Soleil sous l'horizon (nuit)"
        : `Soleil : ${Math.round(s.altitudeDeg)}° sur l'horizon, au ${compassLabel(
            s.compassDeg
          )} (azimut ${Math.round(s.compassDeg)}°)`
    );
  }

  initDateTimeInputs();
  applySun(readDateTime());
  dateInput?.addEventListener("input", () => applySun(readDateTime()));
  hourInput?.addEventListener("input", () => {
    updateHourLabel();
    applySun(readDateTime());
  });

  const lookZ = elevationOk ? meanZ : 20;
  const camAlt = Math.max(80, params.size * 0.28);
  const camBack = params.size * 1.15;
  instance.view.camera.position.set(x, y - camBack, lookZ + camAlt);
  const lookAt = new Vector3(x, y, lookZ);
  instance.view.camera.lookAt(lookAt);

  const controls = new MapControls(instance.view.camera, instance.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.25;
  controls.target.copy(lookAt);
  controls.maxPolarAngle = Math.PI / 2.05;
  controls.saveState();
  instance.view.setControls(controls);
  instance.notifyChange(map);

  setStatus(
    `${notes.join(" · ")} — clic gauche : incliner · molette : zoomer`
  );

  goBtn?.addEventListener("click", () => {
    const lat = Number(latInput.value);
    const lon = Number(lonInput.value);
    const size = Number(sizeInput.value);
    if (![lat, lon, size].every(Number.isFinite)) {
      setStatus("Coordonnées invalides");
      return;
    }
    const q = new URLSearchParams({
      lat: String(lat),
      lon: String(lon),
      size: String(Math.max(200, Math.min(5000, size))),
    });
    window.location.search = q.toString();
  });
}

boot().catch((err) => {
  console.error(err);
  setStatus(err instanceof Error ? err.message : "Échec Giro3D");
});
