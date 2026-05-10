(function () {
  const stage = document.getElementById("stage");
  const world = document.getElementById("world");
  const componentsLayer = document.getElementById("components-layer");
  const wiresLayer = document.getElementById("wires-layer");
  const circuitGrid = document.getElementById("circuit-grid");
  const pickResistorBtn = document.getElementById("pick-resistor");
  const pickBatteryBtn = document.getElementById("pick-battery");
  const pickVoltmeterBtn = document.getElementById("pick-voltmeter");

  /** @typedef {'h' | 'v'} Orient */
  /** @typedef {{ kind: 'resistor'; id: string; rIndex: number; jx: number; jy: number; orient: Orient }} CR */
  /** @typedef {{ kind: 'voltmeter'; id: string; vmIndex: number; jx: number; jy: number; orient: Orient }} CV */
  /** @typedef {{ kind: 'battery'; id: string; vIndex: number; jx: number; jy: number }} CB */
  /** @typedef {CR | CB | CV} CircuitComp */
  /** @typedef {{ kind: 'T'; compId: string; ti: 0 | 1 } | { kind: 'N'; nid: string }} WirePort */
  /** @typedef {{ id: string; from: WirePort; to: WirePort; points: { x: number; y: number }[] }} Wire */
  /** @typedef {{ x: number; y: number; key: string; kind: 'T'; compId: string; ti: 0 | 1 } | { x: number; y: number; key: string; kind: 'N'; nodeId: string }} JunctionHit */
  /** @typedef {{ x: number; y: number; key: string; compId: string; ti: 0 | 1 }} Terminal */

  const CELL = 28;
  const SPAN_CELLS = 4;
  const SPAN_PX = SPAN_CELLS * CELL;
  const BODY_ROW_H = CELL;  
  const CY = BODY_ROW_H / 2;

  const PAD_L = 8;

  const PACK_W = PAD_L + SPAN_PX + 10;

  /** Décalage du viewBox SVG (viewBox="-2 0 …") : la coord logique jxL=PAD_L
   *  se retrouve à pixel-x = PAD_L − (−SVG_VB_X) = PAD_L + SVG_VB_X dans l'élément DOM.
   *  Toutes les positions left doivent être corrigées de −SVG_VB_X. */
  const SVG_VB_X = 2;

  const JUNCTION_ROW_OFFSET_TOP = 14 + 4 + CY;

  const JOINT_R = 5;
  const JOINT_MARGIN = 1.5;
  const RECT_H = CELL;
  const RECT_W = 2 * CELL;

  const V_LABEL_SLOT = 32;
  const V_LABEL_GAP = 4;

  /** axe vertical pile : jonction haute en (BAT_WIRE_X, PAD_L) dans le SVG */
  const BAT_SVG_W = 52;
  const BAT_WIRE_X = 30;
  /** fil vertical depuis la jonction jusqu’au centre du grand trait (≈1,5 carreau) */
  const BAT_WIRE_TO_LONG = 1.5 * CELL;
  /** centre du trait long (2 cases), puis court (1 case) après demi-carreau */
  const BAT_Y_LONG = PAD_L + JOINT_R + BAT_WIRE_TO_LONG;
  const BAT_Y_SHORT = BAT_Y_LONG + 0.5 * CELL;
  /** bande supérieure pour aligner Vn / 5V au même niveau que le trait long (px depuis haut du bloc) */
  const BAT_LABEL_TOP = BAT_Y_LONG - 7;

  const MIN_SCALE = 0.2;
  const MAX_SCALE = 5;

  const OHM = "\u2126";

  /** Proximité des jonctions rouges (px monde) et accrochage à la fin du tracé */
  const JOINT_HIT_R = 15;
  const WIRE_END_SNAP_R = 18;

  const SVG_NS = "http://www.w3.org/2000/svg";

  /** @type {CircuitComp[]} */
  let comps = [];
  /** @type {Wire[]} */
  let wires = [];
  /** Jonctions fil (extrémités libres et nœuds intermédiaires), id → position monde */
  /** @type {Record<string, { x: number; y: number }>} */
  let wireNodes = {};

  /** Rempli au début de chaque renderAll (bornes reliées à un fil posé) */
  let wiredTerminalKeys = new Set();
  let resistorSeq = 0;
  let voltmeterSeq = 0;
  let batterySeq = 0;

  /** @type {string | null} */
  let selectedId = null;

  /** @type {null | { kind: 'resistor'; orient: Orient } | { kind: 'voltmeter'; orient: Orient } | { kind: 'battery' }} */
  let clipboardTpl = null;

  let lastPointerWorld = { wx: 0, wy: 0 };

  const undoStack = [];
  const redoStack = [];

  let tx = 0;
  let ty = 0;
  let scale = 1;

  /** @type {number | null} */
  let pointerId = null;
  let lastX = 0;
  let lastY = 0;

  /** @type {HTMLElement | null} */
  let dragGhost = null;
  /** @type {'resistor' | 'voltmeter' | 'battery' | null} */
  let paletteDragKind = null;
  /** @type {number | null} */
  let palettePickPointerId = null;

  /** @type {null | {
   * sid: string;
   * pointerId: number;
   * jx0: number;
   * jy0: number;
   * anchorWx: number;
   * anchorWy: number;
   * baselineJson: string;
   * moved: boolean;
   * }} */
  let compMoveSession = null;

  /** @type {null | {
   * pointerId: number;
   * startKey: string;
   * fixedPoints: { x: number; y: number }[];
   * previewSnap: { x: number; y: number };
   * elbowInvert: boolean;
   * }} */
  let wireSession = null;

  function samePt(a, b) {
    return a.x === b.x && a.y === b.y;
  }

  /** Coude Manhattan : d’abord l’axe où le curseur est le plus loin, sauf si Espace a inversé */
  function elbowHorizontalFirst(p, t, invert) {
    const adx = Math.abs(t.x - p.x);
    const ady = Math.abs(t.y - p.y);
    let hFirst = adx >= ady;
    if (invert) hFirst = !hFirst;
    return hFirst;
  }

  /** Orthogonal (un seul coude) de p vers t : ordre horizontal d’abord ou vertical d’abord */
  function manhattanAppendPoints(
    p,
    t,
    /** @type {boolean} */ horizontalFirst
  ) {
    if (p.x === t.x && p.y === t.y) return [];
    if (horizontalFirst) {
      if (p.y === t.y) return [t];
      const corner = { x: t.x, y: p.y };
      if (corner.x === p.x && corner.y === p.y) return [t];
      return [corner, t];
    }
    if (p.x === t.x) return [t];
    const corner = { x: p.x, y: t.y };
    if (corner.x === p.x && corner.y === p.y) return [t];
    return [corner, t];
  }

  /** @param {CircuitComp} m */
  function terminalsOfComp(m) {
    const id = m.id;
    if (m.kind === "resistor" || m.kind === "voltmeter") {
      const r = /** @type {CR | CV} */ (m);
      if (r.orient === "h") {
        return [
          { x: r.jx, y: r.jy, key: `${id}:0`, compId: id, ti: /** @type {0 | 1} */ (0) },
          {
            x: r.jx + SPAN_PX,
            y: r.jy,
            key: `${id}:1`,
            compId: id,
            ti: /** @type {0 | 1} */ (1),
          },
        ];
      }
      return [
        { x: r.jx, y: r.jy, key: `${id}:0`, compId: id, ti: /** @type {0 | 1} */ (0) },
        {
          x: r.jx,
          y: r.jy + SPAN_PX,
          key: `${id}:1`,
          compId: id,
          ti: /** @type {0 | 1} */ (1),
        },
      ];
    }
    const b = /** @type {CB} */ (m);
    /* Centre des jonctions SVG : layout left = jx − (slot+gap+BAT_WIRE_X) + padding-left + BAT_WIRE_X = jx */
    return [
      { x: b.jx, y: b.jy, key: `${id}:0`, compId: id, ti: /** @type {0 | 1} */ (0) },
      {
        x: b.jx,
        y: b.jy + SPAN_PX,
        key: `${id}:1`,
        compId: id,
        ti: /** @type {0 | 1} */ (1),
      },
    ];
  }

  function allTerminals() {
    /** @type {Terminal[]} */
    const list = [];
    for (const m of comps) list.push(...terminalsOfComp(m));
    return list;
  }

  /** Bornes composant + jonctions de fils (même hit que le curseur crosshair). */
  /** @param {number} wx @param {number} wy @param {number} maxR */
  function findNearestJunction(wx, wy, maxR) {
    const max2 = maxR * maxR;
    /** @type {JunctionHit | null} */
    let best = null;
    let bestD = max2;
    for (const t of allTerminals()) {
      const dx = t.x - wx;
      const dy = t.y - wy;
      const d2 = dx * dx + dy * dy;
      if (d2 > max2) continue;
      if (!best || d2 < bestD || (d2 === bestD && best.kind !== "T")) {
        bestD = d2;
        best = {
          kind: "T",
          x: t.x,
          y: t.y,
          compId: t.compId,
          ti: t.ti,
          key: `t:${t.compId}:${t.ti}`,
        };
      }
    }
    for (const nid of Object.keys(wireNodes)) {
      const p = wireNodes[nid];
      if (!p) continue;
      const dx = p.x - wx;
      const dy = p.y - wy;
      const d2 = dx * dx + dy * dy;
      if (d2 > max2) continue;
      if (!best || d2 < bestD) {
        bestD = d2;
        best = {
          kind: "N",
          x: p.x,
          y: p.y,
          nodeId: nid,
          key: `n:${nid}`,
        };
      }
    }
    return best;
  }

  function uid() {
    return globalThis.crypto && crypto.randomUUID
      ? crypto.randomUUID()
      : `c_${Date.now()}_${Math.random().toString(16).slice(2)}`;
  }

  function snapshot() {
    return JSON.stringify({ comps, wires, wireNodes });
  }

  /** @param {unknown} ep @returns {WirePort} */
  function legacyToWirePort(ep) {
    if (ep && typeof ep === "object") {
      const o = /** @type {{ kind?: string; nid?: string; compId?: string; ti?: number }} */ (ep);
      if (o.kind === "T" || o.kind === "N") return /** @type {WirePort} */ (ep);
      if (typeof o.nid === "string") return { kind: "N", nid: o.nid };
      if (typeof o.compId === "string" && (o.ti === 0 || o.ti === 1))
        return { kind: "T", compId: o.compId, ti: /** @type {0 | 1} */ (o.ti) };
    }
    return { kind: "T", compId: "_err", ti: 0 };
  }

  function normalizeLoadedWires() {
    for (const w of wires) {
      w.from = legacyToWirePort(w.from);
      w.to = legacyToWirePort(w.to);
    }
  }

  function pruneWireNodes() {
    const used = new Set();
    for (const w of wires) {
      if (w.from.kind === "N") used.add(w.from.nid);
      if (w.to.kind === "N") used.add(w.to.nid);
    }
    for (const k of Object.keys(wireNodes)) {
      if (!used.has(k)) delete wireNodes[k];
    }
  }

  /** @param {string} key */
  function parseRoutingKey(key) {
    if (key.startsWith("n:")) return { kind: /** @type {'N'} */ ("N"), nid: key.slice(2) };
    const rest = key.startsWith("t:") ? key.slice(2) : key;
    const i = rest.lastIndexOf(":");
    return {
      kind: /** @type {'T'} */ ("T"),
      compId: rest.slice(0, i),
      ti: /** @type {0 | 1} */ (Number(rest.slice(i + 1))),
    };
  }

  /** @param {WirePort} p */
  function routingKeyFromPort(p) {
    return p.kind === "T" ? `t:${p.compId}:${p.ti}` : `n:${p.nid}`;
  }

  /** @param {string} json */
  function applySnapshot(json) {
    try {
      const o = JSON.parse(json);
      if (Array.isArray(o)) {
        comps = o;
        wires = [];
        wireNodes = {};
      } else {
        comps = o.comps || [];
        wires = o.wires || [];
        wireNodes =
          o.wireNodes && typeof o.wireNodes === "object" && !Array.isArray(o.wireNodes)
            ? { ...o.wireNodes }
            : {};
        normalizeLoadedWires();
        pruneWireNodes();
      }
    } catch (_) {
      comps = [];
      wires = [];
      wireNodes = {};
    }
    syncSeqFromModels();
  }

  /** @param {() => void} fn */
  function commit(fn) {
    undoStack.push(snapshot());
    redoStack.length = 0;
    fn();
    syncSeqFromModels();
    renderAll();
  }

  function undo() {
    if (undoStack.length === 0) return;
    redoStack.push(snapshot());
    applySnapshot(/** @type {string} */ (undoStack.pop()));
    selectedId =
      selectedId && comps.some((c) => c.id === selectedId) ? selectedId : null;
    renderAll();
  }

  function redo() {
    if (redoStack.length === 0) return;
    undoStack.push(snapshot());
    applySnapshot(/** @type {string} */ (redoStack.pop()));
    selectedId =
      selectedId && comps.some((c) => c.id === selectedId) ? selectedId : null;
    renderAll();
  }

  function syncSeqFromModels() {
    resistorSeq = comps
      .filter((c) => c.kind === "resistor")
      .reduce((m, c) => Math.max(m, /** @type {CR} */ (c).rIndex), 0);
    batterySeq = comps
      .filter((c) => c.kind === "battery")
      .reduce((m, c) => Math.max(m, /** @type {CB} */ (c).vIndex), 0);
    voltmeterSeq = comps
      .filter((c) => c.kind === "voltmeter")
      .reduce((m, c) => Math.max(m, /** @type {CV} */ (c).vmIndex), 0);
  }

  function applyTransform() {
    world.style.transform = `translate(${tx}px, ${ty}px) scale(${scale})`;
  }

  /** Grille étendue et origine logique unique (même repère pour grille visuelle + snap composants/fils) */
  const GRID_PAD_CELLS = 80;
  const GRID_ORIGIN_X = 0;
  const GRID_ORIGIN_Y = 0;

  function layoutCircuitGridExtents() {
    if (!circuitGrid || !world) return;
    const padPx = GRID_PAD_CELLS * CELL;
    const w = Math.max(1, Math.round(world.clientWidth));
    const h = Math.max(1, Math.round(world.clientHeight));
    circuitGrid.style.left = `${-padPx}px`;
    circuitGrid.style.top = `${-padPx}px`;
    circuitGrid.style.width = `${w + 2 * padPx}px`;
    circuitGrid.style.height = `${h + 2 * padPx}px`;
    circuitGrid.style.backgroundPosition = `${GRID_ORIGIN_X + padPx}px ${GRID_ORIGIN_Y + padPx}px`;

    /* SVG fils : 1 unité utilisateur = 1 px comme #components-layer (évite échelle implicite avec width/height en %) */
    if (wiresLayer) {
      wiresLayer.setAttribute("width", String(w));
      wiresLayer.setAttribute("height", String(h));
      wiresLayer.setAttribute("viewBox", `0 0 ${w} ${h}`);
      wiresLayer.style.width = `${w}px`;
      wiresLayer.style.height = `${h}px`;
      wiresLayer.style.left = "0";
      wiresLayer.style.top = "0";
    }
  }

  function snapWorldFallback(v) {
    return Math.round(v / CELL) * CELL;
  }

  function getWiredTerminalKeySet() {
    const s = new Set();
    for (const w of wires) {
      if (w.from.kind === "T") s.add(`${w.from.compId}:${w.from.ti}`);
      if (w.to.kind === "T") s.add(`${w.to.compId}:${w.to.ti}`);
    }
    return s;
  }

  /** @param {WirePort} p */
  function wirePortTouchesComp(p, /** @type {string} */ compId) {
    return p.kind === "T" && p.compId === compId;
  }

  /** @param {string | null | undefined} compId @param {0 | 1} ti */
  function jointDotVisible(compId, ti) {
    if (!compId) return true;
    return !wiredTerminalKeys.has(`${compId}:${ti}`);
  }

  /** Si pastille masquée : le trait va jusqu’au nœud grille (pas d’écart avec le fil) */
  function jointInnerOrCenter(compId, ti, inner, center) {
    return jointDotVisible(compId, ti) ? inner : center;
  }

  /** Snap sur la même origine logique que la grille visible. */
  function snapToIntersection(wx, wy) {
    const x = Math.round((wx - GRID_ORIGIN_X) / CELL) * CELL + GRID_ORIGIN_X;
    const y = Math.round((wy - GRID_ORIGIN_Y) / CELL) * CELL + GRID_ORIGIN_Y;
    return { x, y };
  }

  function closeAllMenus() {
    document.querySelectorAll(".menubar details.menu-root").forEach((d) => {
      d.open = false;
    });
  }

  /** @param {CR | CV} m */
  function setResistorAnchorFromMidpoint(mpx, mpy, orient, m) {
    const { x: sx, y: sy } = snapToIntersection(mpx, mpy);
    if (orient === "h") {
      m.jx = sx - SPAN_PX / 2;
      m.jy = sy;
    } else {
      m.jx = sx;
      m.jy = sy - SPAN_PX / 2;
    }
  }

  /** @param {CR | CV} m */
  function midPointOrientedSpan(m) {
    if (m.orient === "h") return { x: m.jx + SPAN_PX / 2, y: m.jy };
    return { x: m.jx, y: m.jy + SPAN_PX / 2 };
  }

  /** @param {SVGElement} svg
   * @param {Orient} orient
   * @param {string | null} compId id composant (null = palette fantôme : toujours afficher les jonctions) */
  function drawResistorSymbol(svg, orient, compId) {
    while (svg.firstChild) svg.removeChild(svg.firstChild);
    const NS = "http://www.w3.org/2000/svg";

    if (orient === "h") {
      const jxL = PAD_L;
      const jxR = PAD_L + SPAN_PX;
      const innerA = jxL + JOINT_R + JOINT_MARGIN;
      const innerB = jxR - JOINT_R - JOINT_MARGIN;
      const rectW = Math.min(RECT_W, Math.max(12, innerB - innerA));
      const mid = (innerA + innerB) / 2;
      const rx0 = mid - rectW / 2;
      const rx1 = mid + rectW / 2;
      const ry = 0;

      svg.setAttribute("viewBox", `-2 0 ${PACK_W} ${BODY_ROW_H}`);
      svg.setAttribute("width", String(PACK_W));
      svg.setAttribute("height", String(BODY_ROW_H));

      const xL = jointInnerOrCenter(compId, 0, jxL + JOINT_R, jxL);
      const xR = jointInnerOrCenter(compId, 1, jxR - JOINT_R, jxR);
      svg.appendChild(lineSeg(NS, xL, CY, rx0, CY));
      svg.appendChild(lineSeg(NS, rx1, CY, xR, CY));
      svg.appendChild(rectEl(NS, rx0, ry, rectW, RECT_H));
      if (jointDotVisible(compId, 0)) svg.appendChild(circ(NS, jxL, CY));
      if (jointDotVisible(compId, 1)) svg.appendChild(circ(NS, jxR, CY));
    } else {
      const jyTop = PAD_L;
      const jyBot = PAD_L + SPAN_PX;
      const innerA = jyTop + JOINT_R + JOINT_MARGIN;
      const innerB = jyBot - JOINT_R - JOINT_MARGIN;
      const rectH = Math.min(RECT_W, Math.max(12, innerB - innerA));
      const midY = (innerA + innerB) / 2;
      const ry0 = midY - rectH / 2;
      const ry1 = midY + rectH / 2;
      const rx = 0;
      const CX = CELL / 2;

      svg.setAttribute("viewBox", `-2 0 ${BODY_ROW_H} ${PACK_W}`);
      svg.setAttribute("width", String(BODY_ROW_H));
      svg.setAttribute("height", String(PACK_W));

      const yT = jointInnerOrCenter(compId, 0, jyTop + JOINT_R, jyTop);
      const yB = jointInnerOrCenter(compId, 1, jyBot - JOINT_R, jyBot);
      svg.appendChild(vertLine(NS, CX, yT, CX, ry0));
      svg.appendChild(vertLine(NS, CX, ry1, CX, yB));
      svg.appendChild(rectEl(NS, rx, ry0, RECT_H, rectH));
      if (jointDotVisible(compId, 0)) svg.appendChild(circ(NS, CX, jyTop));
      if (jointDotVisible(compId, 1)) svg.appendChild(circ(NS, CX, jyBot));
    }
  }

  /** Rayon du cercle (dépassement géré par overflow visible, boîte = résistance pour la grille) */
  const VM_R = 18;

  /** Voltmètre (cercle + V) : mêmes dimensions boîte que la résistance pour calage grille */
  /** @param {SVGElement} svg
   * @param {Orient} orient
   * @param {string | null} compId */
  function drawVoltmeterSymbol(svg, orient, compId) {
    while (svg.firstChild) svg.removeChild(svg.firstChild);
    const NS = "http://www.w3.org/2000/svg";
    svg.setAttribute("overflow", "visible");

    if (orient === "h") {
      const jxL = PAD_L;
      const jxR = PAD_L + SPAN_PX;
      const cx = (jxL + jxR) / 2;
      const cy = CY;

      svg.setAttribute("viewBox", `-2 0 ${PACK_W} ${BODY_ROW_H}`);
      svg.setAttribute("width", String(PACK_W));
      svg.setAttribute("height", String(BODY_ROW_H));

      const xL = jointInnerOrCenter(compId, 0, jxL + JOINT_R, jxL);
      const xR = jointInnerOrCenter(compId, 1, jxR - JOINT_R, jxR);
      svg.appendChild(lineSeg(NS, xL, cy, cx - VM_R, cy, "voltmeter-trace"));
      const circEl = document.createElementNS(NS, "circle");
      circEl.setAttribute("class", "voltmeter-circle");
      circEl.setAttribute("cx", String(cx));
      circEl.setAttribute("cy", String(cy));
      circEl.setAttribute("r", String(VM_R));
      svg.appendChild(circEl);
      const tv = document.createElementNS(NS, "text");
      tv.setAttribute("class", "voltmeter-glyph");
      tv.setAttribute("x", String(cx));
      tv.setAttribute("y", String(cy + 5));
      tv.setAttribute("text-anchor", "middle");
      tv.textContent = "V";
      svg.appendChild(tv);
      svg.appendChild(lineSeg(NS, cx + VM_R, cy, xR, cy, "voltmeter-trace"));
      if (jointDotVisible(compId, 0)) svg.appendChild(circ(NS, jxL, cy));
      if (jointDotVisible(compId, 1)) svg.appendChild(circ(NS, jxR, cy));
    } else {
      const jyT = PAD_L;
      const jyB = PAD_L + SPAN_PX;
      const cyy = (jyT + jyB) / 2;
      const cjx = CELL / 2;

      svg.setAttribute("viewBox", `-2 0 ${BODY_ROW_H} ${PACK_W}`);
      svg.setAttribute("width", String(BODY_ROW_H));
      svg.setAttribute("height", String(PACK_W));

      const yT = jointInnerOrCenter(compId, 0, jyT + JOINT_R, jyT);
      const yB = jointInnerOrCenter(compId, 1, jyB - JOINT_R, jyB);
      svg.appendChild(lineSeg(NS, cjx, yT, cjx, cyy - VM_R, "voltmeter-trace"));
      const circEl = document.createElementNS(NS, "circle");
      circEl.setAttribute("class", "voltmeter-circle");
      circEl.setAttribute("cx", String(cjx));
      circEl.setAttribute("cy", String(cyy));
      circEl.setAttribute("r", String(VM_R));
      svg.appendChild(circEl);
      const tv = document.createElementNS(NS, "text");
      tv.setAttribute("class", "voltmeter-glyph");
      tv.setAttribute("x", String(cjx));
      tv.setAttribute("y", String(cyy + 5));
      tv.setAttribute("text-anchor", "middle");
      tv.textContent = "V";
      svg.appendChild(tv);
      svg.appendChild(lineSeg(NS, cjx, cyy + VM_R, cjx, yB, "voltmeter-trace"));
      if (jointDotVisible(compId, 0)) svg.appendChild(circ(NS, cjx, jyT));
      if (jointDotVisible(compId, 1)) svg.appendChild(circ(NS, cjx, jyB));
    }
  }

  /** Pile (schéma classique) : 4 cases entre jonctions, trait long 2 cases, court 1 case, +/− à gauche du fil
   * @param {string | null} compId */
  function drawBatterySymbol(svg, compId) {
    while (svg.firstChild) svg.removeChild(svg.firstChild);
    const NS = "http://www.w3.org/2000/svg";
    const cx = BAT_WIRE_X;
    const topJ = PAD_L;
    const botJ = PAD_L + SPAN_PX;
    const H = PACK_W;

    const yLong = BAT_Y_LONG;
    const yShort = BAT_Y_SHORT;
    const longHalf = CELL;
    const shortHalf = CELL / 2;

    svg.setAttribute("viewBox", `-2 0 ${BAT_SVG_W} ${H}`);
    svg.setAttribute("width", String(BAT_SVG_W));
    svg.setAttribute("height", String(H));

    const yTopWire = jointInnerOrCenter(compId, 0, topJ + JOINT_R, topJ);
    const yBotWire = jointInnerOrCenter(compId, 1, botJ - JOINT_R, botJ);
    svg.appendChild(lineSeg(NS, cx, yTopWire, cx, yLong, "battery-trace"));
    svg.appendChild(
      lineSeg(NS, cx - longHalf, yLong, cx + longHalf, yLong, "battery-trace")
    );
    /* pas de fil vertical entre le grand et le petit trait */
    svg.appendChild(
      lineSeg(NS, cx - shortHalf, yShort, cx + shortHalf, yShort, "battery-trace")
    );
    svg.appendChild(lineSeg(NS, cx, yShort, cx, yBotWire, "battery-trace"));

    const tPlus = document.createElementNS(NS, "text");
    tPlus.setAttribute("class", "battery-sign");
    tPlus.setAttribute("x", "4");
    tPlus.setAttribute("y", String(yLong - 10));
    tPlus.textContent = "+";

    const tMinus = document.createElementNS(NS, "text");
    tMinus.setAttribute("class", "battery-sign");
    tMinus.setAttribute("x", "4");
    tMinus.setAttribute("y", String(yShort + 16));
    tMinus.textContent = "\u2212";

    svg.appendChild(tPlus);
    svg.appendChild(tMinus);

    if (jointDotVisible(compId, 0)) svg.appendChild(circ(NS, cx, topJ));
    if (jointDotVisible(compId, 1)) svg.appendChild(circ(NS, cx, botJ));
  }

  /** @param {string} [lineClass='resistor-trace'] */
  function lineSeg(NS, x1, y1, x2, y2, lineClass = "resistor-trace") {
    const ln = document.createElementNS(NS, "line");
    ln.setAttribute("class", lineClass);
    ln.setAttribute("fill", "none");
    ln.setAttribute("stroke-width", "2");
    ln.setAttribute("stroke-linecap", "round");
    ln.setAttribute("x1", String(x1));
    ln.setAttribute("y1", String(y1));
    ln.setAttribute("x2", String(x2));
    ln.setAttribute("y2", String(y2));
    return ln;
  }

  function vertLine(NS, x1, y1, x2, y2) {
    return lineSeg(NS, x1, y1, x2, y2);
  }

  function rectEl(NS, x, y, w, h) {
    const box = document.createElementNS(NS, "rect");
    box.setAttribute("class", "resistor-box");
    box.setAttribute("x", String(x));
    box.setAttribute("y", String(y));
    box.setAttribute("width", String(w));
    box.setAttribute("height", String(h));
    return box;
  }

  function circ(NS, rcx, rcy) {
    const c = document.createElementNS(NS, "circle");
    c.setAttribute("class", "resistor-joint");
    c.setAttribute("cx", String(rcx));
    c.setAttribute("cy", String(rcy));
    c.setAttribute("r", String(JOINT_R));
    return c;
  }

  /** @param {HTMLElement} el @param {{ orient: Orient; jx: number; jy: number }} model */
  function layoutOrientedSpanDOM(el, model) {
    if (model.orient === "h") {
      el.classList.remove("circuit-comp--v");
      el.style.minWidth = `${PACK_W}px`;
      el.style.minHeight = "";
      /* −SVG_VB_X : viewBox="-2 0…" décale le contenu de 2px, compensation nécessaire */
      el.style.left = `${model.jx - PAD_L - SVG_VB_X}px`;
      el.style.top = `${model.jy - JUNCTION_ROW_OFFSET_TOP}px`;
    } else {
      el.classList.add("circuit-comp--v");
      el.style.minWidth = "";
      el.style.minHeight = `${PACK_W}px`;
      const cxMid = CELL / 2;
      el.style.left = `${model.jx - (V_LABEL_SLOT + V_LABEL_GAP + cxMid) - SVG_VB_X}px`;
      /* Mode vertical = flex row : l’étiquette est à gauche du SVG, jonctions à jy / jy+SPAN comme la résistance */
      el.style.top = `${model.jy - PAD_L}px`;
    }
  }

  /** @param {HTMLElement} el @param {CR} model */
  function layoutResistorDOM(el, model) {
    layoutOrientedSpanDOM(el, model);
  }

  /** @param {HTMLElement} el @param {CB} model */
  function layoutBatteryDOM(el, model) {
    el.classList.remove("circuit-comp--v");
    el.style.setProperty("--battery-label-y", `${BAT_LABEL_TOP}px`);
    el.style.minWidth = "";
    el.style.minHeight = `${PACK_W}px`;
    el.style.left = `${model.jx - (V_LABEL_SLOT + V_LABEL_GAP + BAT_WIRE_X) - SVG_VB_X}px`;
    el.style.top = `${model.jy - PAD_L}px`;
  }

  /** @param {HTMLElement} el @param {CV} model */
  function layoutVoltmeterDOM(el, model) {
    layoutOrientedSpanDOM(el, model);
  }

  /** @param {HTMLElement} el @param {CircuitComp} m */
  function layoutCompDOM(el, m) {
    if (m.kind === "resistor") layoutResistorDOM(el, /** @type {CR} */ (m));
    else if (m.kind === "voltmeter") layoutVoltmeterDOM(el, /** @type {CV} */ (m));
    else layoutBatteryDOM(el, /** @type {CB} */ (m));
  }

  /** @param {CR | { rIndex: number; orient?: Orient }} data @param {boolean} ghost */
  function buildResistorElement(data, ghost) {
    const orient =
      /** @type Orient */ ("orient" in data && data.orient === "v" ? "v" : "h");
    const rIndex =
      /** @type {number} */ ("rIndex" in data ? data.rIndex : resistorSeq + 1);
    const id = ghost ? "" : /** @type {CR} */ (data).id;

    const root = document.createElement("div");
    root.className = ghost
      ? "circuit-comp resistor resistor--ghost"
      : "circuit-comp resistor";
    if (!ghost && id) root.dataset.sid = id;
    root.dataset.compKind = "resistor";
    root.dataset.orient = orient;

    const idEl = document.createElement("div");
    idEl.className = "resistor-id";
    idEl.textContent = `R${rIndex}`;

    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("class", "resistor-symbol");
    drawResistorSymbol(svg, orient, ghost ? null : id);

    const valEl = document.createElement("div");
    valEl.className = "resistor-value";
    valEl.textContent = `1000${OHM}`;

    root.appendChild(idEl);
    root.appendChild(svg);
    root.appendChild(valEl);

    if (!ghost && "jx" in data) {
      layoutResistorDOM(root, /** @type {CR} */ (data));
      if (selectedId === id) root.classList.add("circuit-comp--selected");
      root.addEventListener("pointerdown", onPlacedCompPointerDown);
    } else if (ghost && orient === "h") {
      root.style.minWidth = `${PACK_W}px`;
    } else if (ghost && orient === "v") {
      root.style.minHeight = `${PACK_W}px`;
    }

    return root;
  }

  /** @param {CV | { vmIndex: number; orient?: Orient }} data @param {boolean} ghost */
  function buildVoltmeterElement(data, ghost) {
    /** Voltmètre : vertical par défaut (seul cas explicite : horizontal). */
    const orient =
      /** @type Orient */ ("orient" in data && data.orient === "h" ? "h" : "v");
    const vmIndex =
      /** @type {number} */ ("vmIndex" in data ? data.vmIndex : voltmeterSeq + 1);
    const id = ghost ? "" : /** @type {CV} */ (data).id;

    const root = document.createElement("div");
    root.className = ghost
      ? "circuit-comp voltmeter voltmeter--ghost"
      : "circuit-comp voltmeter";
    if (!ghost && id) root.dataset.sid = id;
    root.dataset.compKind = "voltmeter";
    root.dataset.orient = orient;

    const idEl = document.createElement("div");
    idEl.className = "voltmeter-id";
    idEl.textContent = `V${vmIndex}`;

    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("class", "voltmeter-symbol");
    drawVoltmeterSymbol(svg, orient, ghost ? null : id);

    root.appendChild(idEl);
    root.appendChild(svg);

    if (!ghost && "jx" in data) {
      layoutVoltmeterDOM(root, /** @type {CV} */ (data));
      if (selectedId === id) root.classList.add("circuit-comp--selected");
      root.addEventListener("pointerdown", onPlacedCompPointerDown);
    } else if (ghost && orient === "h") {
      root.style.minWidth = `${PACK_W}px`;
    } else if (ghost && orient === "v") {
      root.style.minHeight = `${PACK_W}px`;
    }

    return root;
  }

  /** @param {CB | { vIndex: number }} data @param {boolean} ghost */
  function buildBatteryElement(data, ghost) {
    const vIndex =
      /** @type {number} */ ("vIndex" in data ? data.vIndex : batterySeq + 1);
    const id = ghost ? "" : /** @type {CB} */ (data).id;

    const root = document.createElement("div");
    root.className = ghost
      ? "circuit-comp battery battery--ghost battery--schematic"
      : "circuit-comp battery battery--schematic";
    if (!ghost && id) root.dataset.sid = id;
    root.dataset.compKind = "battery";

    const idEl = document.createElement("div");
    idEl.className = "battery-id";
    idEl.textContent = `V${vIndex}`;

    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("class", "battery-symbol");
    drawBatterySymbol(svg, ghost ? null : id);

    const valEl = document.createElement("div");
    valEl.className = "battery-value";
    valEl.textContent = "5V";

    root.appendChild(svg);
    root.appendChild(idEl);
    root.appendChild(valEl);
    root.style.setProperty("--battery-label-y", `${BAT_LABEL_TOP}px`);

    if (!ghost && "jx" in data) {
      layoutBatteryDOM(root, /** @type {CB} */ (data));
      if (selectedId === id) root.classList.add("circuit-comp--selected");
      root.addEventListener("pointerdown", onPlacedCompPointerDown);
    } else if (ghost) {
      root.style.minHeight = `${PACK_W}px`;
    }

    return root;
  }

  /** @param {CircuitComp} m @param {boolean} ghost */
  function buildCompElement(m, ghost) {
    if (m.kind === "resistor") return buildResistorElement(m, ghost);
    if (m.kind === "voltmeter") return buildVoltmeterElement(m, ghost);
    return buildBatteryElement(m, ghost);
  }

  /** @param {{ x: number; y: number }[]} points @param {string} className */
  function drawWireSegments(points, className) {
    if (!wiresLayer || points.length < 2) return;
    for (let i = 0; i < points.length - 1; i++) {
      const ln = document.createElementNS(SVG_NS, "line");
      ln.setAttribute("class", className);
      ln.setAttribute("x1", String(points[i].x));
      ln.setAttribute("y1", String(points[i].y));
      ln.setAttribute("x2", String(points[i + 1].x));
      ln.setAttribute("y2", String(points[i + 1].y));
      wiresLayer.appendChild(ln);
    }
  }

  function renderWires() {
    if (!wiresLayer) return;
    while (wiresLayer.firstChild) wiresLayer.removeChild(wiresLayer.firstChild);
    for (const w of wires) {
      drawWireSegments(w.points, "wire-seg");
    }
    const nodeDeg = new Map();
    for (const w of wires) {
      if (w.from.kind === "N")
        nodeDeg.set(w.from.nid, (nodeDeg.get(w.from.nid) || 0) + 1);
      if (w.to.kind === "N") nodeDeg.set(w.to.nid, (nodeDeg.get(w.to.nid) || 0) + 1);
    }
    for (const [nid, deg] of nodeDeg) {
      if (deg !== 1) continue;
      const p = wireNodes[nid];
      if (!p) continue;
      const c = document.createElementNS(SVG_NS, "circle");
      c.setAttribute("class", "wire-node");
      c.setAttribute("cx", String(p.x));
      c.setAttribute("cy", String(p.y));
      c.setAttribute("r", String(JOINT_R));
      wiresLayer.appendChild(c);
    }
    if (wireSession) {
      const ws = wireSession;
      const last = ws.fixedPoints[ws.fixedPoints.length - 1];
      const hFirst = elbowHorizontalFirst(last, ws.previewSnap, ws.elbowInvert);
      const add = manhattanAppendPoints(last, ws.previewSnap, hFirst);
      const pts = [...ws.fixedPoints];
      for (const p of add) {
        if (pts.length === 0 || !samePt(pts[pts.length - 1], p)) pts.push(p);
      }
      drawWireSegments(pts, "wire-seg wire-seg--preview");
    }
  }

  function renderAll() {
    wiredTerminalKeys = getWiredTerminalKeySet();
    componentsLayer.replaceChildren(...comps.map((m) => buildCompElement(m, false)));
    renderWires();
  }

  /** @param {JunctionHit} hit @param {number} ptrId */
  function startWireRouting(hit, ptrId) {
    if (wireSession) return;
    selectedId = null;
    wireSession = {
      pointerId: ptrId,
      startKey: hit.key,
      fixedPoints: [{ x: hit.x, y: hit.y }],
      previewSnap: { x: hit.x, y: hit.y },
      elbowInvert: false,
    };
    stage.classList.add("stage--routing-wire");
    window.addEventListener("pointermove", onWirePointerMove);
    window.addEventListener("pointerup", onWirePointerEnd, true);
    window.addEventListener("pointercancel", onWirePointerEnd, true);
    renderWires();
  }

  /** @param {PointerEvent} e */
  function onWirePointerMove(e) {
    if (!wireSession || wireSession.pointerId !== e.pointerId) return;
    const { wx, wy } = clientToWorld(e.clientX, e.clientY);
    wireSession.previewSnap = snapToIntersection(wx, wy);
    renderWires();
  }

  /** @param {PointerEvent} e */
  function onWirePointerEnd(e) {
    if (!wireSession || wireSession.pointerId !== e.pointerId) return;
    window.removeEventListener("pointermove", onWirePointerMove);
    window.removeEventListener("pointerup", onWirePointerEnd, true);
    window.removeEventListener("pointercancel", onWirePointerEnd, true);

    const ws = wireSession;
    wireSession = null;
    stage.classList.remove("stage--routing-wire");

    /** @type {JunctionHit | null} */
    let endHit = findNearestJunction(ws.previewSnap.x, ws.previewSnap.y, WIRE_END_SNAP_R);
    if (endHit && endHit.key === ws.startKey) endHit = null;

    const last = ws.fixedPoints[ws.fixedPoints.length - 1];

    if (!endHit && samePt(ws.previewSnap, ws.fixedPoints[0])) {
      renderAll();
      return;
    }

    const dest = endHit ? { x: endHit.x, y: endHit.y } : { x: ws.previewSnap.x, y: ws.previewSnap.y };

    const hFirst = elbowHorizontalFirst(last, dest, ws.elbowInvert);
    const add = manhattanAppendPoints(last, dest, hFirst);
    /** @type {{ x: number; y: number }[]} */
    const pts = [...ws.fixedPoints];
    for (const p of add) {
      if (pts.length === 0 || !samePt(pts[pts.length - 1], p)) pts.push(p);
    }
    const endP = { x: dest.x, y: dest.y };
    if (pts.length && samePt(pts[pts.length - 1], endP)) pts[pts.length - 1] = endP;
    else pts.push(endP);

    if (pts.length < 2) {
      renderAll();
      return;
    }

    const fromRK = parseRoutingKey(ws.startKey);
    /** @type {WirePort} */
    const fromPort =
      fromRK.kind === "T"
        ? { kind: "T", compId: fromRK.compId, ti: /** @type {0 | 1} */ (fromRK.ti) }
        : { kind: "N", nid: fromRK.nid };

    /** @type {WirePort | null} */
    let toPort = null;
    if (endHit?.kind === "T") {
      toPort = { kind: "T", compId: endHit.compId, ti: /** @type {0 | 1} */ (endHit.ti) };
    } else if (endHit?.kind === "N") {
      toPort = { kind: "N", nid: endHit.nodeId };
    }

    if (toPort !== null && routingKeyFromPort(fromPort) === routingKeyFromPort(toPort)) {
      renderAll();
      return;
    }

    commit(() => {
      let finalTo = toPort;
      if (!finalTo) {
        const nid = uid();
        wireNodes[nid] = { x: dest.x, y: dest.y };
        finalTo = { kind: "N", nid };
      }
      wires.push({
        id: uid(),
        from: fromPort,
        to: finalTo,
        points: pts,
      });
      pruneWireNodes();
    });
  }

  /** @param {number} clientX @param {number} clientY */
  function updateJunctionHoverCursor(clientX, clientY) {
    if (dragGhost || compMoveSession || wireSession || paletteDragKind) {
      document.body.classList.remove("stage-near-junction");
      return;
    }
    const srect = stage.getBoundingClientRect();
    if (
      clientX < srect.left ||
      clientX > srect.right ||
      clientY < srect.top ||
      clientY > srect.bottom
    ) {
      document.body.classList.remove("stage-near-junction");
      return;
    }
    const { wx, wy } = clientToWorld(clientX, clientY);
    const hit = findNearestJunction(wx, wy, JOINT_HIT_R);
    if (hit) document.body.classList.add("stage-near-junction");
    else document.body.classList.remove("stage-near-junction");
  }

  /** @param {string | null | undefined} id */
  function getModel(id) {
    return comps.find((c) => c.id === id);
  }

  function clientToWorld(cx, cy) {
    const rect = stage.getBoundingClientRect();
    const mx = cx - rect.left;
    const my = cy - rect.top;
    return { wx: (mx - tx) / scale, wy: (my - ty) / scale };
  }

  /** @param {PointerEvent} e */
  function onPlacedCompPointerDown(e) {
    if (e.button !== undefined && e.button !== 0) return;
    if (dragGhost) return;
    const { wx, wy } = clientToWorld(e.clientX, e.clientY);
    const jointHit = findNearestJunction(wx, wy, JOINT_HIT_R);
    if (jointHit) {
      e.preventDefault();
      e.stopPropagation();
      startWireRouting(jointHit, e.pointerId);
      return;
    }
    const el = e.currentTarget;
    if (!(el instanceof HTMLElement) || !el.dataset.sid) return;
    e.stopPropagation();

    selectedId = el.dataset.sid;
    renderAll();

    if (pointerId !== null) {
      try {
        stage.releasePointerCapture(pointerId);
      } catch (_) {}
      pointerId = null;
      stage.classList.remove("dragging");
    }

    const model = getModel(selectedId);
    if (!model) return;

    const { wx: awx, wy: awy } = clientToWorld(e.clientX, e.clientY);

    compMoveSession = {
      sid: selectedId,
      pointerId: e.pointerId,
      jx0: model.jx,
      jy0: model.jy,
      anchorWx: awx,
      anchorWy: awy,
      baselineJson: snapshot(),
      moved: false,
    };
    el.classList.add("circuit-comp--dragging");
    try {
      el.setPointerCapture(e.pointerId);
    } catch (_) {}
  }

  /** @param {PointerEvent} e */
  function onWindowCompMove(e) {
    if (!compMoveSession || compMoveSession.pointerId !== e.pointerId) return;
    const model = getModel(compMoveSession.sid);
    if (!model) return;

    const { wx, wy } = clientToWorld(e.clientX, e.clientY);
    const dwx = wx - compMoveSession.anchorWx;
    const dwy = wy - compMoveSession.anchorWy;
    compMoveSession.moved =
      compMoveSession.moved || Math.abs(dwx) > 0.25 || Math.abs(dwy) > 0.25;

    const s = snapToIntersection(compMoveSession.jx0 + dwx, compMoveSession.jy0 + dwy);
    model.jx = s.x;
    model.jy = s.y;

    const tel = findEl(compMoveSession.sid);
    if (tel) layoutCompDOM(tel, model);
  }

  /** @param {string} sid */
  function findEl(sid) {
    return typeof CSS !== "undefined" && CSS.escape
      ? componentsLayer.querySelector(`[data-sid="${CSS.escape(sid)}"]`)
      : componentsLayer.querySelector(`[data-sid="${sid}"]`);
  }

  /** @param {PointerEvent} e */
  function onWindowCompUp(e) {
    if (!compMoveSession || compMoveSession.pointerId !== e.pointerId) return;
    const sid = compMoveSession.sid;
    const baselineJson = compMoveSession.baselineJson;
    const moved = compMoveSession.moved;
    try {
      const el = findEl(sid);
      el?.releasePointerCapture(e.pointerId);
      el?.classList.remove("circuit-comp--dragging");
    } catch (_) {}

    compMoveSession = null;

    if (moved && baselineJson !== snapshot()) {
      undoStack.push(baselineJson);
      redoStack.length = 0;
    }
    renderAll();
  }

  function recordPointerWorld(cx, cy) {
    Object.assign(lastPointerWorld, clientToWorld(cx, cy));
  }

  function removeSelected() {
    if (!selectedId) return;
    commit(() => {
      const sid = selectedId;
      comps = comps.filter((c) => c.id !== sid);
      wires = wires.filter(
        (w) => !wirePortTouchesComp(w.from, sid) && !wirePortTouchesComp(w.to, sid)
      );
      pruneWireNodes();
      selectedId = null;
    });
  }

  function rotateSelectedOrientable() {
    const m = getModel(selectedId);
    if (!m || (m.kind !== "resistor" && m.kind !== "voltmeter")) return;
    commit(() => {
      if (m.kind === "resistor") {
        const r = /** @type {CR} */ (m);
        const mp = midPointOrientedSpan(r);
        r.orient = r.orient === "h" ? "v" : "h";
        setResistorAnchorFromMidpoint(mp.x, mp.y, r.orient, r);
      } else {
        const v = /** @type {CV} */ (m);
        const mp = midPointOrientedSpan(v);
        v.orient = v.orient === "h" ? "v" : "h";
        setResistorAnchorFromMidpoint(mp.x, mp.y, v.orient, v);
      }
    });
  }

  /** @param {KeyboardEvent} e */
  function onKeyDown(e) {
    const t = e.target;
    if (
      t instanceof HTMLInputElement ||
      t instanceof HTMLTextAreaElement ||
      /** @type {HTMLElement} */ (t).isContentEditable
    ) {
      return;
    }

    if (e.code === "Space" && wireSession) {
      wireSession.elbowInvert = !wireSession.elbowInvert;
      renderWires();
      e.preventDefault();
      return;
    }

    const mod = e.ctrlKey || e.metaKey;

    if (mod && !e.altKey && (e.code === "KeyZ" || e.key?.toLowerCase() === "z")) {
      if (e.shiftKey) redo();
      else undo();
      e.preventDefault();
      return;
    }

    if (mod && !e.altKey && e.code === "KeyY") {
      redo();
      e.preventDefault();
      return;
    }

    if (mod && e.code === "KeyC") {
      const m = getModel(selectedId);
      if (!m) return;
      if (m.kind === "resistor") {
        clipboardTpl = { kind: "resistor", orient: /** @type {CR} */ (m).orient };
      } else if (m.kind === "voltmeter") {
        clipboardTpl = { kind: "voltmeter", orient: /** @type {CV} */ (m).orient };
      } else {
        clipboardTpl = { kind: "battery" };
      }
      e.preventDefault();
      return;
    }

    if (mod && e.code === "KeyV") {
      if (!clipboardTpl) return;
      e.preventDefault();
      commit(() => {
        if (clipboardTpl.kind === "resistor") {
          resistorSeq += 1;
          /** @type {CR} */
          const nw = {
            kind: "resistor",
            id: uid(),
            rIndex: resistorSeq,
            orient: clipboardTpl.orient,
            jx: 0,
            jy: 0,
          };
          placeResistorAtWorldPoint(lastPointerWorld.wx, lastPointerWorld.wy, nw);
          comps.push(nw);
          selectedId = nw.id;
        } else if (clipboardTpl.kind === "voltmeter") {
          voltmeterSeq += 1;
          /** @type {CV} */
          const nw = {
            kind: "voltmeter",
            id: uid(),
            vmIndex: voltmeterSeq,
            orient: clipboardTpl.orient,
            jx: 0,
            jy: 0,
          };
          placeResistorAtWorldPoint(lastPointerWorld.wx, lastPointerWorld.wy, nw);
          comps.push(nw);
          selectedId = nw.id;
        } else {
          batterySeq += 1;
          /** @type {CB} */
          const nw = {
            kind: "battery",
            id: uid(),
            vIndex: batterySeq,
            jx: 0,
            jy: 0,
          };
          placeBatteryAtWorldPoint(lastPointerWorld.wx, lastPointerWorld.wy, nw);
          comps.push(nw);
          selectedId = nw.id;
        }
      });
      return;
    }

    if (e.code === "Delete") {
      if (selectedId) {
        removeSelected();
        e.preventDefault();
      }
      return;
    }

    if (e.code === "KeyR" && !mod && !e.altKey) {
      const mR = getModel(selectedId);
      if (!mR || (mR.kind !== "resistor" && mR.kind !== "voltmeter")) return;
      rotateSelectedOrientable();
      e.preventDefault();
    }
  }

  /** @param {CR | CV} m */
  function placeResistorAtWorldPoint(wx, wy, m) {
    if (m.orient === "h") {
      const p = snapToIntersection(wx - SPAN_PX / 2, wy);
      m.jx = p.x;
      m.jy = p.y;
    } else {
      const pTop = snapToIntersection(wx, wy - SPAN_PX / 2);
      m.jx = pTop.x;
      m.jy = pTop.y;
    }
  }

  /** @param {CB} m */
  function placeBatteryAtWorldPoint(wx, wy, m) {
    const pMid = snapToIntersection(wx, wy);
    m.jx = pMid.x;
    m.jy = pMid.y - SPAN_PX / 2;
  }

  function removePaletteGhost() {
    dragGhost?.remove();
    dragGhost = null;
    palettePickPointerId = null;
    paletteDragKind = null;
    document.body.classList.remove("is-dragging-palette");
  }

  function paletteResistorOrient() {
    return clipboardTpl?.kind === "resistor" ? clipboardTpl.orient : /** @type {Orient} */ ("h");
  }

  function paletteVoltmeterOrient() {
    return clipboardTpl?.kind === "voltmeter" ? clipboardTpl.orient : /** @type {Orient} */ ("v");
  }

  /** @param {PointerEvent} e */
  function startPaletteDrag(kind, e, pickBtn) {
    if (dragGhost) return;

    closeAllMenus();
    paletteDragKind = kind;
    palettePickPointerId = e.pointerId;

    if (kind === "resistor") {
      const o = paletteResistorOrient();
      dragGhost = buildResistorElement(
        {
          id: "_g",
          rIndex: resistorSeq + 1,
          orient: o,
          jx: 0,
          jy: 0,
        },
        true
      );
      dragGhost.style.minWidth = o === "h" ? `${PACK_W}px` : "";
      dragGhost.style.minHeight = o === "v" ? `${PACK_W}px` : "";
    } else if (kind === "voltmeter") {
      const o = paletteVoltmeterOrient();
      dragGhost = buildVoltmeterElement(
        {
          id: "_g",
          vmIndex: voltmeterSeq + 1,
          orient: o,
          jx: 0,
          jy: 0,
        },
        true
      );
      dragGhost.style.minWidth = o === "h" ? `${PACK_W}px` : "";
      dragGhost.style.minHeight = o === "v" ? `${PACK_W}px` : "";
    } else {
      dragGhost = buildBatteryElement({ id: "_g", vIndex: batterySeq + 1, jx: 0, jy: 0 }, true);
      dragGhost.style.minHeight = `${PACK_W}px`;
    }

    document.body.appendChild(dragGhost);
    document.body.classList.add("is-dragging-palette");
    dragGhost.style.left = `${e.clientX}px`;
    dragGhost.style.top = `${e.clientY}px`;
    dragGhost.style.transform = "translate(-50%, -50%)";

    window.addEventListener("pointermove", onPaletteDragMove);
    window.addEventListener("pointerup", onPaletteDragUp);
    window.addEventListener("pointercancel", onPaletteDragUp);

    try {
      pickBtn.setPointerCapture(e.pointerId);
    } catch (_) {}
    e.preventDefault();
  }

  /** @param {PointerEvent} e */
  function onPickResistorDown(e) {
    if (e.button !== undefined && e.button !== 0) return;
    startPaletteDrag("resistor", e, pickResistorBtn);
  }

  /** @param {PointerEvent} e */
  function onPickBatteryDown(e) {
    if (e.button !== undefined && e.button !== 0) return;
    startPaletteDrag("battery", e, pickBatteryBtn);
  }

  /** @param {PointerEvent} e */
  function onPickVoltmeterDown(e) {
    if (e.button !== undefined && e.button !== 0) return;
    startPaletteDrag("voltmeter", e, pickVoltmeterBtn);
  }

  /** @param {PointerEvent} e */
  function onPaletteDragMove(e) {
    if (palettePickPointerId !== e.pointerId) return;
    if (!dragGhost) return;
    dragGhost.style.left = `${e.clientX}px`;
    dragGhost.style.top = `${e.clientY}px`;
  }

  /** @param {PointerEvent} e */
  function onPaletteDragUp(e) {
    if (palettePickPointerId !== e.pointerId) return;

    window.removeEventListener("pointermove", onPaletteDragMove);
    window.removeEventListener("pointerup", onPaletteDragUp);
    window.removeEventListener("pointercancel", onPaletteDragUp);

    try {
      const pickBtn =
        paletteDragKind === "resistor"
          ? pickResistorBtn
          : paletteDragKind === "voltmeter"
            ? pickVoltmeterBtn
            : pickBatteryBtn;
      pickBtn?.releasePointerCapture(e.pointerId);
    } catch (_) {}

    const srect = stage.getBoundingClientRect();
    const { clientX: cx, clientY: cy } = e;
    const overStage =
      cx >= srect.left && cx <= srect.right && cy >= srect.top && cy <= srect.bottom;

    if (overStage && paletteDragKind) {
      const { wx, wy } = clientToWorld(cx, cy);
      const pMid = snapToIntersection(wx, wy);
      if (paletteDragKind === "resistor") {
        const o = paletteResistorOrient();
        commit(() => {
          resistorSeq += 1;
          /** @type {CR} */
          const nw = {
            kind: "resistor",
            id: uid(),
            rIndex: resistorSeq,
            orient: o,
            jx: 0,
            jy: 0,
          };
          if (o === "h") {
            nw.jx = pMid.x - SPAN_PX / 2;
            nw.jy = pMid.y;
          } else {
            nw.jx = pMid.x;
            nw.jy = pMid.y - SPAN_PX / 2;
          }
          comps.push(nw);
          selectedId = nw.id;
        });
      } else if (paletteDragKind === "voltmeter") {
        const o = paletteVoltmeterOrient();
        commit(() => {
          voltmeterSeq += 1;
          /** @type {CV} */
          const nw = {
            kind: "voltmeter",
            id: uid(),
            vmIndex: voltmeterSeq,
            orient: o,
            jx: 0,
            jy: 0,
          };
          if (o === "h") {
            nw.jx = pMid.x - SPAN_PX / 2;
            nw.jy = pMid.y;
          } else {
            nw.jx = pMid.x;
            nw.jy = pMid.y - SPAN_PX / 2;
          }
          comps.push(nw);
          selectedId = nw.id;
        });
      } else {
        commit(() => {
          batterySeq += 1;
          /** @type {CB} */
          const nw = {
            kind: "battery",
            id: uid(),
            vIndex: batterySeq,
            jx: pMid.x,
            jy: pMid.y - SPAN_PX / 2,
          };
          comps.push(nw);
          selectedId = nw.id;
        });
      }
    }

    removePaletteGhost();
  }

  function onPanPointerDown(e) {
    if (dragGhost) return;
    if (wireSession) return;
    if (e.button !== undefined && e.button !== 0) return;

    const { wx, wy } = clientToWorld(e.clientX, e.clientY);
    const j = findNearestJunction(wx, wy, JOINT_HIT_R);
    if (j && j.kind === "N") {
      e.preventDefault();
      e.stopPropagation();
      startWireRouting(j, e.pointerId);
      return;
    }

    if (!e.target.closest(".circuit-comp")) {
      selectedId = null;
      renderAll();
    }

    pointerId = e.pointerId;
    lastX = e.clientX;
    lastY = e.clientY;
    stage.classList.add("dragging");
    stage.setPointerCapture(e.pointerId);
    e.preventDefault();
  }

  function onPanPointerMove(e) {
    recordPointerWorld(e.clientX, e.clientY);
    if (pointerId !== e.pointerId) return;
    const dx = e.clientX - lastX;
    const dy = e.clientY - lastY;
    lastX = e.clientX;
    lastY = e.clientY;
    tx += dx;
    ty += dy;
    applyTransform();
  }

  /** @param {WheelEvent} e */
  function onWheel(e) {
    e.preventDefault();
    recordPointerWorld(e.clientX, e.clientY);

    const rect = stage.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;

    let dy = e.deltaY;
    if (e.deltaMode === 1) dy *= 16;
    else if (e.deltaMode === 2) dy *= 100;

    const oldScale = scale;
    let newScale = oldScale * Math.exp(-dy * 0.0015);
    newScale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, newScale));
    if (newScale === oldScale) return;

    const wx = (mx - tx) / oldScale;
    const wy = (my - ty) / oldScale;
    tx = mx - wx * newScale;
    ty = my - wy * newScale;
    scale = newScale;
    applyTransform();
  }

  window.addEventListener("pointermove", onWindowCompMove);
  window.addEventListener("pointerup", onWindowCompUp);
  window.addEventListener("pointercancel", onWindowCompUp);

  stage.addEventListener("pointermove", (ev) => recordPointerWorld(ev.clientX, ev.clientY));

  window.addEventListener("pointermove", (ev) => {
    updateJunctionHoverCursor(ev.clientX, ev.clientY);
  });

  pickResistorBtn.addEventListener("pointerdown", onPickResistorDown);
  pickBatteryBtn.addEventListener("pointerdown", onPickBatteryDown);
  if (pickVoltmeterBtn) pickVoltmeterBtn.addEventListener("pointerdown", onPickVoltmeterDown);

  stage.addEventListener("pointerdown", onPanPointerDown);
  stage.addEventListener("pointermove", onPanPointerMove);
  stage.addEventListener("pointerup", endPanDrag);
  stage.addEventListener("pointercancel", endPanDrag);
  stage.addEventListener("lostpointercapture", () => {
    pointerId = null;
    stage.classList.remove("dragging");
  });
  stage.addEventListener("wheel", onWheel, { passive: false });

  window.addEventListener("keydown", onKeyDown);

  function endPanDrag(ev) {
    if (pointerId !== ev.pointerId) return;
    pointerId = null;
    stage.classList.remove("dragging");
    try {
      stage.releasePointerCapture(ev.pointerId);
    } catch (_) {}
  }

  layoutCircuitGridExtents();
  applyTransform();

  window.addEventListener("resize", () => {
    layoutCircuitGridExtents();
  });

  if (typeof ResizeObserver !== "undefined" && world) {
    new ResizeObserver(() => layoutCircuitGridExtents()).observe(world);
  }

  document.querySelectorAll(".menubar details.menu-root").forEach((root) => {
    root.addEventListener("toggle", () => {
      if (!root.open) return;
      document.querySelectorAll(".menubar details.menu-root").forEach((other) => {
        if (other !== root) other.open = false;
      });
    });
  });
})();
