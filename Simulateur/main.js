(function () {
  const stage = document.getElementById("stage");
  const world = document.getElementById("world");
  const componentsLayer = document.getElementById("components-layer");
  const wiresLayer = document.getElementById("wires-layer");
  const circuitGrid = document.getElementById("circuit-grid");
  const pickResistorBtn = document.getElementById("pick-resistor");
  const pickBatteryBtn = document.getElementById("pick-battery");
  const pickVoltmeterBtn = document.getElementById("pick-voltmeter");
  const pickAmmeterBtn = document.getElementById("pick-ammeter");
  const pickOhmmeterBtn = document.getElementById("pick-ohmmeter");
  const pickGroundBtn = document.getElementById("pick-ground");
  const circuitFileImportInput = /** @type {HTMLInputElement | null} */ (
    document.getElementById("circuit-file-import")
  );
  const menuFileNewBtn = document.getElementById("menu-file-new");
  const menuFileOpenBtn = document.getElementById("menu-file-open");
  const menuFileSaveBtn = document.getElementById("menu-file-save");
  const menuFileSaveAsBtn = document.getElementById("menu-file-save-as");

  /** @typedef {'h' | 'v'} Orient */
  /** @typedef {{ kind: 'resistor'; id: string; rIndex: number; jx: number; jy: number; orient: Orient; rOhms?: number }} CR */
  /** @typedef {{ kind: 'voltmeter'; id: string; vmIndex: number; jx: number; jy: number; orient: Orient }} CV */
  /** @typedef {{ kind: 'ammeter'; id: string; amIndex: number; jx: number; jy: number; orient: Orient }} CA */
  /** @typedef {{ kind: 'ohmmeter'; id: string; omIndex: number; jx: number; jy: number; orient: Orient }} CO */
  /** @typedef {{ kind: 'battery'; id: string; vIndex: number; jx: number; jy: number; vVolts?: number }} CB */
  /** @typedef {{ kind: 'ground'; id: string; gIndex: number; jx: number; jy: number }} CG */
  /** @typedef {CR | CB | CV | CA | CO | CG} CircuitComp */
  /** @typedef {{ kind: 'T'; compId: string; ti: 0 | 1 } | { kind: 'N'; nid: string }} WirePort */
  /** @typedef {{ id: string; from: WirePort; to: WirePort; points: { x: number; y: number }[] }} Wire */
  /** @typedef {{ x: number; y: number; key: string; kind: 'T'; compId: string; ti: 0 | 1 } | { x: number; y: number; key: string; kind: 'N'; nodeId: string } | { x: number; y: number; key: string; kind: 'S' }} JunctionHit */
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

  const DEFAULT_R_OHMS = 1000;
  const DEFAULT_BAT_VOLT = 5;

  /** @param {CR} cr */
  function getCompROhms(cr) {
    const n =
      typeof cr.rOhms === "number" && Number.isFinite(cr.rOhms) && cr.rOhms > 0 ? cr.rOhms : DEFAULT_R_OHMS;
    return n;
  }

  /** @param {CB} b */
  function getCompVBat(b) {
    const n =
      typeof b.vVolts === "number" && Number.isFinite(b.vVolts) && b.vVolts > 0 ? b.vVolts : DEFAULT_BAT_VOLT;
    return n;
  }

  /** @param {number} ohms */
  function formatOhmsForDisplay(ohms) {
    if (Number.isInteger(ohms) && ohms >= 1000 && ohms % 1000 === 0 && ohms < 1000000)
      return `${ohms / 1000} k${OHM}`;
    if (ohms >= 1 && ohms === Math.floor(ohms)) return `${ohms}${OHM}`;
    return `${ohms}${OHM}`;
  }

  /** @param {number} v */
  function formatBatVoltsForDisplay(v) {
    const r = Math.round(v * 10000) / 10000;
    if (r === Math.floor(r)) return `${r}V`;
    return `${String(r).replace(/(\.\d*?)0+$/, "$1").replace(/\.$/, "")}V`;
  }

  /** @param {CircuitComp} m */
  function tryEditCompValueInteractive(m) {
    if (dragGhost || wireSession) return;
    if (m.kind === "resistor") {
      const r = /** @type {CR} */ (m);
      const cur = getCompROhms(r);
      const raw = typeof window.prompt === "function" ? window.prompt("Résistance (Ω, > 0)", String(cur)) : null;
      if (raw === null) return;
      const parsed = Number(String(raw).replace(/\s/g, "").replace(",", "."));
      if (!Number.isFinite(parsed) || parsed <= 0) {
        if (typeof window.alert === "function") window.alert("Valeur invalide : entrez un nombre strictement positif (ohms).");
        return;
      }
      commit(() => {
        r.rOhms = parsed;
      });
      return;
    }
    if (m.kind === "battery") {
      const b = /** @type {CB} */ (m);
      const cur = getCompVBat(b);
      const raw = typeof window.prompt === "function" ? window.prompt("Tension de la pile (V, > 0)", String(cur)) : null;
      if (raw === null) return;
      const parsed = Number(String(raw).replace(/\s/g, "").replace(",", "."));
      if (!Number.isFinite(parsed) || parsed <= 0) {
        if (typeof window.alert === "function") window.alert("Valeur invalide : entrez une tension strictement positive (volts).");
        return;
      }
      commit(() => {
        b.vVolts = parsed;
      });
    }
  }

  /**
   * Édition valeur R / pile : clic sur l’étiquette de valeur (ne déclenche pas le déplacement).
   * @param {HTMLElement} root
   * @param {"resistor" | "battery"} kind
   * @param {string} sid
   */
  function wireCompValueEditing(root, kind, sid) {
    const valSel = kind === "resistor" ? ".resistor-value" : ".battery-value";
    const valEl = root.querySelector(valSel);
    if (!(valEl instanceof HTMLElement)) return;
    valEl.style.cursor = "pointer";
    valEl.setAttribute(
      "title",
      kind === "resistor" ? "Cliquer pour modifier la résistance (Ω)" : "Cliquer pour modifier la tension (V)"
    );
    valEl.addEventListener("pointerdown", (ev) => {
      if (ev.button !== 0) return;
      ev.stopPropagation();
    });
    valEl.addEventListener("click", (ev) => {
      ev.stopPropagation();
      const m = getModel(sid);
      if (!m) return;
      if (kind === "resistor" && m.kind !== "resistor") return;
      if (kind === "battery" && m.kind !== "battery") return;
      tryEditCompValueInteractive(m);
    });
  }

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

  /** Version du schéma JSON (fichiers + pile annuler/refaire). */
  const CIRCUIT_FILE_VERSION = 1;
  /** Dernier nom de fichier connu (.json). */
  let circuitFileName = "circuit.json";
  /** Handle système de fichiers (Chrome/Edge) pour « Enregistrer » sur le même fichier. */
  let circuitSaveHandle = null;

  /** Rempli au début de chaque renderAll (bornes reliées à un fil posé) */
  let wiredTerminalKeys = new Set();
  let resistorSeq = 0;
  let voltmeterSeq = 0;
  let ammeterSeq = 0;
  let ohmmeterSeq = 0;
  let batterySeq = 0;
  let groundSeq = 0;

  /** Sélection multiple : composants + fils ; copie / rotation = un seul composant sélectionné. */
  /** @type {Set<string>} */
  let selectedCompIds = new Set();
  /** @type {Set<string>} */
  let selectedWireIds = new Set();

  /** @returns {string | null} id si exactement un composant sélectionné */
  function soleSelectedCompId() {
    if (selectedCompIds.size !== 1) return null;
    const [only] = /** @type {string[]} */ ([...selectedCompIds]);
    return typeof only === "string" ? only : null;
  }

  function clearInteractionSelection() {
    selectedCompIds.clear();
    selectedWireIds.clear();
  }

  function pruneStaleSelection() {
    selectedCompIds = new Set([...selectedCompIds].filter((id) => comps.some((c) => c.id === id)));
    selectedWireIds = new Set([...selectedWireIds].filter((id) => wires.some((w) => w.id === id)));
  }

  /** @param {string} cid */
  function selectSingleCompOnly(cid) {
    selectedCompIds = new Set([cid]);
    selectedWireIds.clear();
  }

  /** @param {string} wid */
  function selectSingleWireOnly(wid) {
    selectedWireIds = new Set([wid]);
    selectedCompIds.clear();
  }

  /** Hit fil (px monde). */
  const WIRE_PICK_R_PX = 9;
  /** Encadré trop petit → ignoré. */
  const MARQUEE_MIN_DRAG_PX = 2;

  /** @type {null | {
   *   pointerId: number;
   *   x0: number;
   *   y0: number;
   *   x1: number;
   *   y1: number;
   * }} */
  let marqueeSession = null;

  /** @type {null | { kind: 'resistor'; orient: Orient } | { kind: 'voltmeter'; orient: Orient } | { kind: 'ammeter'; orient: Orient } | { kind: 'ohmmeter'; orient: Orient } | { kind: 'battery' } | { kind: 'ground' }} */
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
  /** @type {'resistor' | 'voltmeter' | 'ammeter' | 'ohmmeter' | 'battery' | 'ground' | null} */
  let paletteDragKind = null;
  /** @type {number | null} */
  let palettePickPointerId = null;

  /** Contrôle interruption requête /api/simulate */
  /** @type {AbortController | null} */
  let simAbortController = null;

  /** @param {HTMLElement | null} el @param {boolean} running */
  function setSimPanelRunning(running) {
    const simBtn = document.getElementById("sim-panel-simulate");
    const stopBtn = document.getElementById("sim-panel-stop");
    if (simBtn) simBtn.disabled = running;
    if (stopBtn) stopBtn.disabled = !running;
  }

  /** @param {string} text @param {boolean} muted */
  function setBottomVoltmeterText(text, muted) {
    const el = document.getElementById("sim-panel-volt-value");
    if (!el) return;
    el.textContent = text;
    el.classList.toggle("sim-bottom-bar__volt-value--muted", !!muted);
  }

  /** @param {Record<string, { volts?: unknown; label?: string }>} vm */
  function voltsToBottomStrip(vm) {
    const entries = Object.entries(vm || {});
    if (entries.length === 0) return { text: "—", muted: true };
    if (entries.length === 1) {
      const row = entries[0][1];
      const v = row.volts;
      if (typeof v === "number" && Number.isFinite(v)) return { text: `${v.toFixed(4)} V`, muted: false };
      return { text: "—", muted: true };
    }
    /** @type {string[]} */
    const parts = [];
    for (let i = 0; i < entries.length; i++) {
      const [k, row] = entries[i];
      const v = row.volts;
      const labRaw = typeof row.label === "string" && row.label ? row.label : k;
      const trimmed = String(labRaw).trim();
      const vmNum = trimmed.match(/^V(\d+)/i);
      const tag = vmNum ? `V${vmNum[1]}` : `V${i + 1}`;
      parts.push(
        typeof v === "number" && Number.isFinite(v)
          ? `${tag}=${v.toFixed(4)} V`
          : `${tag}=—`
      );
    }
    return {
      text: parts.join("  ·  "),
      muted: parts.length > 0 && parts.every((p) => /\=—\s*$/.test(p)),
    };
  }

  /** @param {Record<string, { amps?: unknown; label?: string }>} am */
  function ampsToBottomStrip(am) {
    const entries = Object.entries(am || {});
    if (entries.length === 0) return { text: "—", muted: true };
    if (entries.length === 1) {
      const row = entries[0][1];
      const a = row.amps;
      if (typeof a === "number" && Number.isFinite(a)) return { text: `${a.toFixed(4)} A`, muted: false };
      return { text: "—", muted: true };
    }
    /** @type {string[]} */
    const parts = [];
    for (let i = 0; i < entries.length; i++) {
      const [k, row] = entries[i];
      const ia = row.amps;
      const labRaw = typeof row.label === "string" && row.label ? row.label : k;
      const trimmed = String(labRaw).trim();
      const amNum = trimmed.match(/^A(\d+)/i);
      const tag = amNum ? `A${amNum[1]}` : `A${i + 1}`;
      parts.push(
        typeof ia === "number" && Number.isFinite(ia)
          ? `${tag}=${ia.toFixed(4)} A`
          : `${tag}=—`
      );
    }
    return {
      text: parts.join("  ·  "),
      muted: parts.length > 0 && parts.every((p) => /\=—\s*$/.test(p)),
    };
  }

  /** @param {Record<string, { ohms?: unknown; label?: string }>} om */
  function ohmsToBottomStrip(om) {
    const entries = Object.entries(om || {});
    if (entries.length === 0) return { text: "—", muted: true };
    if (entries.length === 1) {
      const row = entries[0][1];
      const r = row.ohms;
      if (typeof r === "number" && Number.isFinite(r)) return { text: formatOhmsForDisplay(r), muted: false };
      return { text: "—", muted: true };
    }
    /** @type {string[]} */
    const parts = [];
    for (let i = 0; i < entries.length; i++) {
      const [k, row] = entries[i];
      const ri = row.ohms;
      const lab = typeof row.label === "string" && row.label ? row.label : k;
      parts.push(
        typeof ri === "number" && Number.isFinite(ri)
          ? `${lab}=${formatOhmsForDisplay(ri)}`
          : `${lab}=—`
      );
    }
    return {
      text: parts.join("  ·  "),
      muted: parts.length > 0 && parts.every((p) => /\=—\s*$/.test(p)),
    };
  }

  /**
   * @param {Record<string, { volts?: unknown; label?: string }>} vm
   * @param {Record<string, { amps?: unknown; label?: string }>} amm
   * @param {Record<string, { ohms?: unknown; label?: string }>} ohm
   */
  function instrumentsBottomStrip(vm, amm, ohm) {
    const vKeys = Object.keys(vm || {});
    const aKeys = Object.keys(amm || {});
    const oKeys = Object.keys(ohm || {});
    if (vKeys.length === 0 && aKeys.length === 0 && oKeys.length === 0) return { text: "—", muted: true };
    const vb = vKeys.length ? voltsToBottomStrip(vm) : { text: "", muted: true };
    const ab = aKeys.length ? ampsToBottomStrip(amm) : { text: "", muted: true };
    const ob = oKeys.length ? ohmsToBottomStrip(ohm) : { text: "", muted: true };
    /** @type {string[]} */
    const chunks = [];
    if (vKeys.length) chunks.push(vb.text);
    if (aKeys.length) chunks.push(ab.text);
    if (oKeys.length) chunks.push(ob.text);
    const text = chunks.join("  ·  ");
    const muted =
      (vKeys.length ? vb.muted : true) &&
      (aKeys.length ? ab.muted : true) &&
      (oKeys.length ? ob.muted : true);
    return { text, muted };
  }

  function stopSimulationRequest() {
    simAbortController?.abort();
  }

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

  function distSq2(wx, wy, x, y) {
    const dx = x - wx;
    const dy = y - wy;
    return dx * dx + dy * dy;
  }

  /** @param {number} v @param {number} lo @param {number} hi */
  function clampNum(v, lo, hi) {
    return v < lo ? lo : v > hi ? hi : v;
  }

  /** Distance² au segment orthogonal Manhattan (sommet le plus proche si non aligné). */
  function distSqPointOrthoSeg(px, py, ax, ay, bx, by) {
    if (Math.abs(ax - bx) < 0.25) {
      const ymin = Math.min(ay, by);
      const ymax = Math.max(ay, by);
      const yCl = clampNum(py, ymin, ymax);
      const dx = ax - px;
      const dy = yCl - py;
      return dx * dx + dy * dy;
    }
    if (Math.abs(ay - by) < 0.25) {
      const xmin = Math.min(ax, bx);
      const xmax = Math.max(ax, bx);
      const xCl = clampNum(px, xmin, xmax);
      const dx = xCl - px;
      const dy = ay - py;
      return dx * dx + dy * dy;
    }
    return Math.min(distSq2(px, py, ax, ay), distSq2(px, py, bx, by));
  }

  /** @param {number} wx @param {number} wy @param {number} radiusPx */
  function findNearestWireId(wx, wy, radiusPx) {
    const r2 = radiusPx * radiusPx;
    /** @type {string | null} */
    let bestId = null;
    let bestD = Infinity;
    for (const w of wires) {
      const pts = w.points;
      if (!Array.isArray(pts) || pts.length < 2) continue;
      for (let i = 0; i + 1 < pts.length; i++) {
        const a = pts[i];
        const b = pts[i + 1];
        if (!a || !b) continue;
        const d = distSqPointOrthoSeg(wx, wy, a.x, a.y, b.x, b.y);
        if (d <= r2 && d < bestD) {
          bestD = d;
          bestId = w.id;
        }
      }
    }
    return bestId;
  }

  const COMP_MARQUEE_PAD = 22;

  /** @param {CircuitComp} m */
  function approxCompWorldRect(m) {
    const tt = terminalsOfComp(m);
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const u of tt) {
      minX = Math.min(minX, u.x);
      maxX = Math.max(maxX, u.x);
      minY = Math.min(minY, u.y);
      maxY = Math.max(maxY, u.y);
    }
    const p = COMP_MARQUEE_PAD;
    return { x0: minX - p, y0: minY - p, x1: maxX + p, y1: maxY + p };
  }

  function rectsOverlap2D(ax0, ay0, ax1, ay1, bx0, by0, bx1, by1) {
    const al = Math.min(ax0, ax1);
    const ar = Math.max(ax0, ax1);
    const at = Math.min(ay0, ay1);
    const ab = Math.max(ay0, ay1);
    const bl = Math.min(bx0, bx1);
    const br = Math.max(bx0, bx1);
    const bt = Math.min(by0, by1);
    const bb = Math.max(by0, by1);
    return !(ar < bl || br < al || ab < bt || bb < at);
  }

  /** @param {number} mx0 @param {number} my0 @param {number} mx1 @param {number} my1 */
  function marqueeIntersectingCompIds(mx0, my0, mx1, my1) {
    const ids = /** @type {Set<string>} */ (new Set());
    for (const m of comps) {
      const b = approxCompWorldRect(m);
      if (rectsOverlap2D(b.x0, b.y0, b.x1, b.y1, mx0, my0, mx1, my1)) ids.add(m.id);
    }
    return ids;
  }

  /** @param {number} mx0 @param {number} my0 @param {number} mx1 @param {number} my1 */
  function marqueeIntersectingWireIds(mx0, my0, mx1, my1) {
    const ids = /** @type {Set<string>} */ (new Set());
    for (const w of wires) {
      const pts = w.points;
      if (!Array.isArray(pts) || pts.length < 2) continue;
      for (let i = 0; i + 1 < pts.length; i++) {
        const a = pts[i];
        const b = pts[i + 1];
        if (!a || !b) continue;
        const segL = Math.min(a.x, b.x);
        const segR = Math.max(a.x, b.x);
        const segT = Math.min(a.y, b.y);
        const segB = Math.max(a.y, b.y);
        if (rectsOverlap2D(segL, segT, segR, segB, mx0, my0, mx1, my1)) {
          ids.add(w.id);
          break;
        }
      }
    }
    return ids;
  }

  function updateMarqueeDivFromSession() {
    const el = document.getElementById("selection-marquee");
    if (!el || !marqueeSession) return;
    const x0 = Math.min(marqueeSession.x0, marqueeSession.x1);
    const y0 = Math.min(marqueeSession.y0, marqueeSession.y1);
    const ww = Math.abs(marqueeSession.x1 - marqueeSession.x0);
    const hh = Math.abs(marqueeSession.y1 - marqueeSession.y0);
    el.style.left = `${x0}px`;
    el.style.top = `${y0}px`;
    el.style.width = `${ww}px`;
    el.style.height = `${hh}px`;
    el.classList.remove("is-hidden");
    el.setAttribute("aria-hidden", "false");
  }

  function hideSelectionMarquee() {
    const el = document.getElementById("selection-marquee");
    if (!el) return;
    el.classList.add("is-hidden");
    el.setAttribute("aria-hidden", "true");
    el.style.width = "0";
    el.style.height = "0";
  }

  /** @param {number} pointerIdEvt */
  function teardownMarqueeForPointer(pointerIdEvt) {
    if (!marqueeSession || marqueeSession.pointerId !== pointerIdEvt) return false;
    const { x0, y0, x1, y1 } = marqueeSession;
    marqueeSession = null;
    hideSelectionMarquee();
    if (Math.abs(x1 - x0) < MARQUEE_MIN_DRAG_PX || Math.abs(y1 - y0) < MARQUEE_MIN_DRAG_PX) {
      renderAll();
      return true;
    }
    for (const cid of marqueeIntersectingCompIds(x0, y0, x1, y1)) selectedCompIds.add(cid);
    for (const wid of marqueeIntersectingWireIds(x0, y0, x1, y1)) selectedWireIds.add(wid);
    renderAll();
    return true;
  }

  /** Segment orthogonal (fil Manhattan), extrémités incluses. */
  function pointOnClosedOrthoSeg(px, py, ax, ay, bx, by, tol = 0.5) {
    if (Math.abs(ax - bx) <= tol) {
      if (Math.abs(px - ax) > tol) return false;
      const ymin = Math.min(ay, by) - tol;
      const ymax = Math.max(ay, by) + tol;
      return py >= ymin && py <= ymax;
    }
    if (Math.abs(ay - by) <= tol) {
      if (Math.abs(py - ay) > tol) return false;
      const xmin = Math.min(ax, bx) - tol;
      const xmax = Math.max(ax, bx) + tol;
      return px >= xmin && px <= xmax;
    }
    return false;
  }

  /** Point strictement sur l’arête, pas aux deux sommets (jonction en T au milieu d’un segment). */
  function pointOnClosedOrthoSegInterior(px, py, ax, ay, bx, by, tol = 0.5) {
    if (!pointOnClosedOrthoSeg(px, py, ax, ay, bx, by, tol)) return false;
    const atA = Math.abs(px - ax) <= tol && Math.abs(py - ay) <= tol;
    const atB = Math.abs(px - bx) <= tol && Math.abs(py - by) <= tol;
    return !atA && !atB;
  }

  /** Le point grille (sx,sy) est-il au milieu d’un segment d’un fil existant ? */
  function gridPointOnAnyWireSegmentInterior(sx, sy) {
    for (const w of wires) {
      const pts = w.points;
      if (!Array.isArray(pts) || pts.length < 2) continue;
      for (let i = 0; i + 1 < pts.length; i++) {
        const a = pts[i];
        const b = pts[i + 1];
        if (!a || !b || !Number.isFinite(a.x) || !Number.isFinite(a.y) || !Number.isFinite(b.x) || !Number.isFinite(b.y))
          continue;
        if (pointOnClosedOrthoSegInterior(sx, sy, a.x, a.y, b.x, b.y)) return true;
      }
    }
    return false;
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
    if (m.kind === "resistor" || m.kind === "voltmeter" || m.kind === "ammeter" || m.kind === "ohmmeter") {
      const r = /** @type {CR | CV | CA | CO} */ (m);
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
    if (m.kind === "ground") {
      const g = /** @type {CG} */ (m);
      return [{ x: g.jx, y: g.jy, key: `${id}:0`, compId: id, ti: /** @type {0 | 1} */ (0) }];
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

    /* Milieu d’un segment de fil (jonction en T) : snap grille sur l’arête, sans doubler T/N plus prioritaires */
    const snap = snapToIntersection(wx, wy);
    const dSnap = distSq2(wx, wy, snap.x, snap.y);
    if (dSnap <= max2 && gridPointOnAnyWireSegmentInterior(snap.x, snap.y)) {
      let blocked = false;
      if (best && dSnap > bestD) blocked = true;
      if (!blocked && best && dSnap === bestD && (best.kind === "T" || best.kind === "N")) blocked = true;
      if (!blocked) {
        if (!best || dSnap < bestD || (dSnap === bestD && best.kind === "S")) {
          bestD = dSnap;
          best = {
            kind: "S",
            x: snap.x,
            y: snap.y,
            key: `s:${snap.x}|${snap.y}`,
          };
        }
      }
    }

    return best;
  }

  function uid() {
    return globalThis.crypto && crypto.randomUUID
      ? crypto.randomUUID()
      : `c_${Date.now()}_${Math.random().toString(16).slice(2)}`;
  }

  /** @param {unknown} o */
  function importCircuitData(o) {
    if (Array.isArray(o)) {
      comps = /** @type {CircuitComp[]} */ (o);
      wires = [];
      wireNodes = {};
    } else if (o && typeof o === "object") {
      const obj = /** @type {{ comps?: unknown; wires?: unknown; wireNodes?: unknown }} */ (o);
      comps = Array.isArray(obj.comps) ? /** @type {CircuitComp[]} */ (obj.comps) : [];
      wires = Array.isArray(obj.wires) ? /** @type {Wire[]} */ (obj.wires) : [];
      wireNodes =
        obj.wireNodes &&
        typeof obj.wireNodes === "object" &&
        !Array.isArray(obj.wireNodes)
          ? {
              .../** @type {Record<string, { x: number; y: number }>} */ (
                /** @type {object} */ (obj.wireNodes)
              ),
            }
          : {};
    } else throw new Error("invalid circuit payload");
    normalizeLoadedWires();
    dedupeWireNodesByCoordinates();
    pruneWireNodes();
  }

  function snapshot() {
    dedupeWireNodesByCoordinates();
    pruneWireNodes();
    return JSON.stringify({
      version: CIRCUIT_FILE_VERSION,
      comps,
      wires,
      wireNodes,
    });
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

  /**
   * Réutiliser un jonctionnaire fil aux mêmes coordonnées grille (évite deux nœuds N distincts
   * qui coupent électriquement un T — typique pont diviseur).
   */
  function findWireNodeIdAt(wx, wy) {
    for (const [nid, p] of Object.entries(wireNodes)) {
      if (p && p.x === wx && p.y === wy) return nid;
    }
    return null;
  }

  /**
   * Fusionne plusieurs entrées wireNodes au même point (rechargement JSON ou anciennes versions).
   * @returns {boolean} si un remapping a été appliqué
   */
  function dedupeWireNodesByCoordinates() {
    /** @type {Map<string, string[]>} */
    const buckets = new Map();
    for (const [nid, p] of Object.entries(wireNodes)) {
      if (!p || typeof p.x !== "number" || typeof p.y !== "number") continue;
      const cellKey = `${p.x}|${p.y}`;
      if (!buckets.has(cellKey)) buckets.set(cellKey, []);
      /** @type {string[]} */ (buckets.get(cellKey)).push(nid);
    }
    /** @type {Map<string, string>} */
    const remap = new Map();
    for (const group of buckets.values()) {
      if (group.length < 2) continue;
      group.sort();
      const keep = /** @type {string} */ (group[0]);
      for (let i = 1; i < group.length; i++) remap.set(group[i], keep);
    }
    if (remap.size === 0) return false;

    /** @param {WirePort} pp */
    const rewritePort = (pp) => {
      if (pp.kind !== "N") return;
      const canon = remap.get(pp.nid);
      if (canon !== undefined) pp.nid = canon;
    };

    for (const w of wires) {
      rewritePort(w.from);
      rewritePort(w.to);
    }

    for (const stale of remap.keys()) {
      delete wireNodes[/** @type {string} */ (stale)];
    }
    return true;
  }

  /** @param {string} key */
  function parseRoutingKey(key) {
    if (key.startsWith("n:")) return { kind: /** @type {'N'} */ ("N"), nid: key.slice(2) };
    if (key.startsWith("s:")) {
      const parts = key.slice(2).split("|");
      return {
        kind: /** @type {'Seg'} */ ("Seg"),
        sx: Number(parts[0]),
        sy: Number(parts[1]),
      };
    }
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
      importCircuitData(JSON.parse(json));
    } catch (_) {
      comps = [];
      wires = [];
      wireNodes = {};
    }
    syncSeqFromModels();
  }

  function buildCircuitFileText() {
    return JSON.stringify(
      {
        version: CIRCUIT_FILE_VERSION,
        comps,
        wires,
        wireNodes,
      },
      null,
      2
    );
  }

  /** @param {string} base */
  function ensureJsonFileName(base) {
    let s = (base || "circuit.json").trim() || "circuit.json";
    s = s.replace(/\\/g, "/").split("/").pop() || "circuit.json";
    s = s.replace(/[^\w\s().\-àâäçéèêëïîôùûüœæÆŒÄÀÂ]+/gi, "_").trim() || "circuit.json";
    return s.toLowerCase().endsWith(".json") ? s : `${s}.json`;
  }

  /** Téléchargement local (safari, firefox, Render, fichier hébergé statique…) */
  function downloadJsonToDisk(text, filename) {
    const name = ensureJsonFileName(filename);
    const blob = new Blob([text], { type: "application/json;charset=utf-8" });
    const a = document.createElement("a");
    const url = URL.createObjectURL(blob);
    a.href = url;
    a.download = name;
    a.rel = "noopener noreferrer";
    document.body.appendChild(a);
    a.click();
    queueMicrotask(() => {
      URL.revokeObjectURL(url);
      a.remove();
    });
  }

  /** @param {boolean} forceSaveAs */
  async function saveCircuitToFile(forceSaveAs) {
    const text = buildCircuitFileText();
    const suggested = ensureJsonFileName(circuitFileName);

    if (!forceSaveAs && circuitSaveHandle && circuitSaveHandle.createWritable) {
      try {
        const w = await circuitSaveHandle.createWritable();
        await w.write(text);
        await w.close();
        closeAllMenus();
        return;
      } catch (_) {
        circuitSaveHandle = null;
      }
    }

    if (forceSaveAs && typeof window.showSaveFilePicker === "function") {
      try {
        const fh = /** @type {FileSystemFileHandle} */ (
          await /** @type {any} */ (window).showSaveFilePicker({
            suggestedName: suggested,
            types: [
              {
                description: "Circuit JSON",
                accept: { "application/json": [".json"] },
              },
            ],
          })
        );
        circuitSaveHandle = fh;
        const writer = await fh.createWritable();
        await writer.write(text);
        await writer.close();
        circuitFileName = fh.name ? ensureJsonFileName(fh.name) : suggested;
        closeAllMenus();
        return;
      } catch (e) {
        if (e && /** @type {Error} */ (e).name === "AbortError") {
          closeAllMenus();
          return;
        }
      }
    }

    let nameOut = suggested;
    if (forceSaveAs && typeof window.prompt === "function") {
      const prompted = prompt(
        "Nom du fichier (enregistré via le dossier Téléchargements du navigateur si besoin)",
        suggested
      );
      if (prompted === null) {
        closeAllMenus();
        return;
      }
      nameOut = ensureJsonFileName(prompted.trim() || suggested);
    }

    circuitSaveHandle = null;
    downloadJsonToDisk(text, nameOut);
    circuitFileName = nameOut;
    closeAllMenus();
  }

  function newCircuitPrompt() {
    const empty =
      comps.length === 0 && wires.length === 0 && Object.keys(wireNodes).length === 0;
    if (
      !empty &&
      !confirm(
        "Créer un nouveau circuit ? Les modifications non enregistrées seront perdues."
      )
    ) {
      closeAllMenus();
      return;
    }
    comps = [];
    wires = [];
    wireNodes = {};
    undoStack.length = 0;
    redoStack.length = 0;
    clearInteractionSelection();
    circuitSaveHandle = null;
    circuitFileName = "circuit.json";
    syncSeqFromModels();
    renderAll();
    closeAllMenus();
  }

  /** @param {string} rawText @param {string} fileLabel @param {FileSystemFileHandle | null | undefined} writeHandle */
  function loadCircuitFromText(rawText, fileLabel, writeHandle) {
    try {
      importCircuitData(JSON.parse(rawText));
    } catch (_) {
      alert("Impossible de lire ce fichier : JSON invalide ou projet incomplet.");
      closeAllMenus();
      return;
    }
    circuitFileName = ensureJsonFileName(fileLabel);
    circuitSaveHandle = writeHandle || null;
    undoStack.length = 0;
    redoStack.length = 0;
    pruneStaleSelection();
    syncSeqFromModels();
    renderAll();
    closeAllMenus();
  }

  async function menuOpenCircuit() {
    closeAllMenus();
    try {
      const pick = /** @type {any} */ (window).showOpenFilePicker;
      if (typeof pick === "function") {
        const [fh] = await pick.call(window, {
          types: [
            {
              description: "Circuit JSON",
              accept: { "application/json": [".json"] },
            },
          ],
          multiple: false,
        });
        const file = await fh.getFile();
        const raw = await file.text();
        loadCircuitFromText(raw, file.name || "circuit.json", fh);
        return;
      }
    } catch (e) {
      if (e && /** @type {Error} */ (e).name === "AbortError") return;
    }
    if (circuitFileImportInput) circuitFileImportInput.click();
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
    pruneStaleSelection();
    renderAll();
  }

  function redo() {
    if (redoStack.length === 0) return;
    undoStack.push(snapshot());
    applySnapshot(/** @type {string} */ (redoStack.pop()));
    pruneStaleSelection();
    renderAll();
  }

  function syncSeqFromModels() {
    resistorSeq = comps
      .filter((c) => c.kind === "resistor")
      .reduce((m, c) => Math.max(m, /** @type {CR} */ (c).rIndex), 0);
    batterySeq = comps
      .filter((c) => c.kind === "battery")
      .reduce((m, c) => Math.max(m, /** @type {CB} */ (c).vIndex), 0);
    groundSeq = comps
      .filter((c) => c.kind === "ground")
      .reduce((m, c) => Math.max(m, /** @type {CG} */ (c).gIndex), 0);
    voltmeterSeq = comps
      .filter((c) => c.kind === "voltmeter")
      .reduce((m, c) => Math.max(m, /** @type {CV} */ (c).vmIndex), 0);
    ammeterSeq = comps
      .filter((c) => c.kind === "ammeter")
      .reduce((m, c) => Math.max(m, /** @type {CA} */ (c).amIndex), 0);
    ohmmeterSeq = comps
      .filter((c) => c.kind === "ohmmeter")
      .reduce((m, c) => Math.max(m, /** @type {CO} */ (c).omIndex), 0);
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

  function closeDropdownMenusOnly() {
    document.querySelectorAll(".menubar details.menu-root").forEach((d) => {
      d.open = false;
    });
  }

  function closeCommandsModal() {
    const m = document.getElementById("commands-modal");
    if (!m) return;
    m.classList.add("is-hidden");
    m.setAttribute("aria-hidden", "true");
  }

  function closeSimulateModal() {
    const m = document.getElementById("simulate-modal");
    if (!m) return;
    m.classList.add("is-hidden");
    m.setAttribute("aria-hidden", "true");
  }

  function openCommandsModal() {
    const m = document.getElementById("commands-modal");
    if (!m) return;
    closeDropdownMenusOnly();
    closeSimulateModal();
    m.classList.remove("is-hidden");
    m.setAttribute("aria-hidden", "false");
    document.getElementById("commands-modal-close")?.focus();
  }

  function openSimulateModal() {
    const m = document.getElementById("simulate-modal");
    if (!m) return;
    closeDropdownMenusOnly();
    closeCommandsModal();
    m.classList.remove("is-hidden");
    m.setAttribute("aria-hidden", "false");
    document.getElementById("simulate-modal-close")?.focus();
  }

  function closeAllMenus() {
    closeDropdownMenusOnly();
    closeCommandsModal();
    closeSimulateModal();
  }

  async function runCircuitSimulation() {
    const statusEl = document.getElementById("simulate-status");
    const errEl = document.getElementById("simulate-errors");
    const warnEl = document.getElementById("simulate-warnings");
    const listEl = document.getElementById("simulate-volt-results");
    const netEl = document.getElementById("simulate-netlist");
    const logEl = document.getElementById("simulate-log");
    if (!statusEl || !listEl) return;

    const hideBlk = /** @param {HTMLElement | null} el */ (el) => {
      if (!el) return;
      el.classList.add("is-hidden");
      el.textContent = "";
    };

    /** @param {HTMLElement | null} el @param {string} txt */
    const showBlk = (el, txt) => {
      if (!el) return;
      el.textContent = txt;
      el.classList.remove("is-hidden");
    };

    hideBlk(errEl);
    hideBlk(warnEl);
    listEl.innerHTML = "";
    if (netEl) netEl.textContent = "";
    if (logEl) logEl.textContent = "";

    simAbortController?.abort();

    const controller = new AbortController();
    simAbortController = controller;

    setBottomVoltmeterText("…", true);
    statusEl.textContent = "Calcul en cours… envoi au serveur ngspice.";
    setSimPanelRunning(true);

    try {
      const res = await fetch("/api/simulate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          state: (() => {
            dedupeWireNodesByCoordinates();
            pruneWireNodes();
            return {
              comps: JSON.parse(JSON.stringify(comps)),
              wires: JSON.parse(JSON.stringify(wires)),
              wireNodes: JSON.parse(JSON.stringify(wireNodes)),
            };
          })(),
          gridStep: CELL,
        }),
      });
      /** @type {Record<string, unknown>} */
      const data = /** @type {Record<string, unknown>} */ (await res.json());

      /** @type {Record<string, { volts?: unknown; label?: string }>} */
      const vm = /** @type {object} */ (data.voltmeterValues || {});
      /** @type {Record<string, { amps?: unknown; label?: string }>} */
      const amm = /** @type {object} */ (data.ammeterValues || {});
      /** @type {Record<string, { ohms?: unknown; label?: string }>} */
      const ohm = /** @type {object} */ (data.ohmmeterValues || {});

      /** @param {HTMLElement} li @param {string} label @param {boolean} hasVal @param {string} valStr */
      const appendMeasureRow = (li, label, hasVal, valStr) => {
        const sl = document.createElement("span");
        sl.className = "vm-label";
        sl.textContent = label;
        const sv = document.createElement("span");
        sv.className = hasVal ? "vm-val" : "vm-val vm-pending";
        sv.textContent = valStr;
        li.appendChild(sl);
        li.appendChild(sv);
        listEl.appendChild(li);
      };

      /**
       * @param {Record<string, { volts?: unknown; label?: string }>} voltsMap
       * @param {Record<string, { amps?: unknown; label?: string }>} ampsMap
       * @param {Record<string, { ohms?: unknown; label?: string }>} ohmsMap
       */
      const fillModalInstrumentList = (voltsMap, ampsMap, ohmsMap) => {
        listEl.innerHTML = "";
        let any = false;
        for (const [label, row] of Object.entries(voltsMap)) {
          any = true;
          const li = document.createElement("li");
          const v = row.volts;
          const hasV = typeof v === "number" && Number.isFinite(v);
          appendMeasureRow(li, label, hasV, hasV ? `${v.toFixed(4)} V` : "—");
        }
        for (const [label, row] of Object.entries(ampsMap)) {
          any = true;
          const li = document.createElement("li");
          const a = row.amps;
          const hasA = typeof a === "number" && Number.isFinite(a);
          appendMeasureRow(li, label, hasA, hasA ? `${a.toFixed(4)} A` : "—");
        }
        for (const [label, row] of Object.entries(ohmsMap)) {
          any = true;
          const li = document.createElement("li");
          const r = row.ohms;
          const hasR = typeof r === "number" && Number.isFinite(r);
          appendMeasureRow(li, label, hasR, hasR ? formatOhmsForDisplay(r) : "—");
        }
        if (!any) {
          const li = document.createElement("li");
          const s = document.createElement("span");
          s.className = "vm-pending";
          s.textContent =
            "Aucun appareil de mesure sur le schéma (ou mesures non disponibles).";
          li.appendChild(s);
          listEl.appendChild(li);
        }
      };

      if (!res.ok || !data.ok) {
        const errs = Array.isArray(data.errors)
          ? /** @type {string[]} */ (data.errors).join("\n")
          : "";
        const fall = typeof data.details === "object" && data.details && /** @type {{ message?: string }} */ (data.details).message;
        const detailStr = typeof fall === "string" ? fall : "";
        statusEl.textContent = "Simulation impossible — voir le détail ci-dessous.";
        showBlk(
          errEl,
          errs ||
            detailStr ||
            (typeof data.phase === "string" ? `phase: ${data.phase}` : "") ||
            `HTTP ${res.status}`
        );
        if (Array.isArray(data.warnings) && data.warnings.length && warnEl) {
          showBlk(warnEl, /** @type {string[]} */ (data.warnings).join("\n"));
        }
        if (typeof data.netlist === "string" && netEl) netEl.textContent = data.netlist;
        fillModalInstrumentList(vm, amm, ohm);
        const strip = instrumentsBottomStrip(vm, amm, ohm);
        setBottomVoltmeterText(
          Object.keys(vm).length || Object.keys(amm).length || Object.keys(ohm).length
            ? strip.text
            : "—",
          true
        );
        return;
      }

      statusEl.textContent = "Simulation DC terminée. Détail des mesures (V, A, Ω) :";
      fillModalInstrumentList(vm, amm, ohm);

      const strip = instrumentsBottomStrip(vm, amm, ohm);
      setBottomVoltmeterText(strip.text, strip.muted);

      if (Array.isArray(data.warnings) && data.warnings.length && warnEl) {
        showBlk(warnEl, /** @type {string[]} */ (data.warnings).join("\n"));
      }
      if (typeof data.netlist === "string" && netEl) netEl.textContent = data.netlist;
      if (typeof data.log === "string" && logEl) logEl.textContent = data.log;
    } catch (e) {
      if (/** @type {{ name?: string }} */ (e).name === "AbortError") {
        statusEl.textContent = "Simulation interrompue (stop).";
        setBottomVoltmeterText("—", true);
        return;
      }
      statusEl.textContent = "Impossible de joindre le serveur.";
      hideBlk(errEl);
      hideBlk(warnEl);
      listEl.innerHTML = "";
      showBlk(
        errEl,
        `${e && /** @type {{ message?: string }} */ (/** @type {object} */ (e)).message ? /** @type {{ message: string }} */ (/** @type {object} */ (e)).message : String(e)}\n\nAstuce : utilisez le site servi par Node (npm start) ou votre déploiement Render ; le mode fichier local (file://) n’appelle pas /api/simulate. Sur votre PC, sans ngspice installé, compilez un binaire ou lancez sous Docker.`
      );
      setBottomVoltmeterText("—", true);
    } finally {
      if (simAbortController === controller) {
        simAbortController = null;
        setSimPanelRunning(false);
      }
    }
  }

  /** @param {CR | CV | CA | CO} m */
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

  /** @param {CR | CV | CA | CO} m */
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

  /** Ampèremètre (même géométrie que le voltmètre, glyphe « I » dans le cercle). */
  /** @param {SVGElement} svg
   * @param {Orient} orient
   * @param {string | null} compId */
  function drawAmmeterSymbol(svg, orient, compId) {
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
      svg.appendChild(lineSeg(NS, xL, cy, cx - VM_R, cy, "ammeter-trace"));
      const circEl = document.createElementNS(NS, "circle");
      circEl.setAttribute("class", "ammeter-circle");
      circEl.setAttribute("cx", String(cx));
      circEl.setAttribute("cy", String(cy));
      circEl.setAttribute("r", String(VM_R));
      svg.appendChild(circEl);
      const tv = document.createElementNS(NS, "text");
      tv.setAttribute("class", "ammeter-glyph");
      tv.setAttribute("x", String(cx));
      tv.setAttribute("y", String(cy + 4));
      tv.setAttribute("text-anchor", "middle");
      tv.textContent = "I";
      svg.appendChild(tv);
      svg.appendChild(lineSeg(NS, cx + VM_R, cy, xR, cy, "ammeter-trace"));
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
      svg.appendChild(lineSeg(NS, cjx, yT, cjx, cyy - VM_R, "ammeter-trace"));
      const circEl = document.createElementNS(NS, "circle");
      circEl.setAttribute("class", "ammeter-circle");
      circEl.setAttribute("cx", String(cjx));
      circEl.setAttribute("cy", String(cyy));
      circEl.setAttribute("r", String(VM_R));
      svg.appendChild(circEl);
      const tv = document.createElementNS(NS, "text");
      tv.setAttribute("class", "ammeter-glyph");
      tv.setAttribute("x", String(cjx));
      tv.setAttribute("y", String(cyy + 4));
      tv.setAttribute("text-anchor", "middle");
      tv.textContent = "I";
      svg.appendChild(tv);
      svg.appendChild(lineSeg(NS, cjx, cyy + VM_R, cjx, yB, "ammeter-trace"));
      if (jointDotVisible(compId, 0)) svg.appendChild(circ(NS, cjx, jyT));
      if (jointDotVisible(compId, 1)) svg.appendChild(circ(NS, cjx, jyB));
    }
  }

  /** Ohmmètre (même boîte ; glyphe Ω : mesure R sans pile sur schéma via source 1 V interne). */
  /** @param {SVGElement} svg
   * @param {Orient} orient
   * @param {string | null} compId */
  function drawOhmmeterSymbol(svg, orient, compId) {
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
      svg.appendChild(lineSeg(NS, xL, cy, cx - VM_R, cy, "ohmmeter-trace"));
      const circEl = document.createElementNS(NS, "circle");
      circEl.setAttribute("class", "ohmmeter-circle");
      circEl.setAttribute("cx", String(cx));
      circEl.setAttribute("cy", String(cy));
      circEl.setAttribute("r", String(VM_R));
      svg.appendChild(circEl);
      const tv = document.createElementNS(NS, "text");
      tv.setAttribute("class", "ohmmeter-glyph");
      tv.setAttribute("x", String(cx));
      tv.setAttribute("y", String(cy + 5));
      tv.setAttribute("text-anchor", "middle");
      tv.textContent = OHM;
      svg.appendChild(tv);
      svg.appendChild(lineSeg(NS, cx + VM_R, cy, xR, cy, "ohmmeter-trace"));
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
      svg.appendChild(lineSeg(NS, cjx, yT, cjx, cyy - VM_R, "ohmmeter-trace"));
      const circEl = document.createElementNS(NS, "circle");
      circEl.setAttribute("class", "ohmmeter-circle");
      circEl.setAttribute("cx", String(cjx));
      circEl.setAttribute("cy", String(cyy));
      circEl.setAttribute("r", String(VM_R));
      svg.appendChild(circEl);
      const tv = document.createElementNS(NS, "text");
      tv.setAttribute("class", "ohmmeter-glyph");
      tv.setAttribute("x", String(cjx));
      tv.setAttribute("y", String(cyy + 5));
      tv.setAttribute("text-anchor", "middle");
      tv.textContent = OHM;
      svg.appendChild(tv);
      svg.appendChild(lineSeg(NS, cjx, cyy + VM_R, cjx, yB, "ohmmeter-trace"));
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

  /** Repère grille identique au bornier gauche d’une résistance horizontale : (PAD_L, CY). */
  const GROUND_SVG_BELOW_CY = 40;

  /** @param {SVGElement} svg @param {string | null} compId */
  function drawGroundSymbol(svg, compId) {
    while (svg.firstChild) svg.removeChild(svg.firstChild);
    const NS = "http://www.w3.org/2000/svg";
    const jxL = PAD_L;
    const gH = CY + GROUND_SVG_BELOW_CY;
    svg.setAttribute("class", "resistor-symbol ground-symbol");
    svg.setAttribute("overflow", "visible");
    svg.setAttribute("viewBox", `-2 0 ${PACK_W} ${gH}`);
    svg.setAttribute("width", String(PACK_W));
    svg.setAttribute("height", String(gH));

    svg.appendChild(lineSeg(NS, jxL, CY, jxL, 26, "ground-trace"));
    svg.appendChild(lineSeg(NS, jxL - 14, 26, jxL + 14, 26, "ground-trace"));
    svg.appendChild(lineSeg(NS, jxL - 10, 32, jxL + 10, 32, "ground-trace"));
    svg.appendChild(lineSeg(NS, jxL - 6, 38, jxL + 6, 38, "ground-trace"));
    if (jointDotVisible(compId, 0)) svg.appendChild(circ(NS, jxL, CY));
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

  /** @param {HTMLElement} el @param {CA} model */
  function layoutAmmeterDOM(el, model) {
    layoutOrientedSpanDOM(el, model);
  }

  /** @param {HTMLElement} el @param {CO} model */
  function layoutOhmmeterDOM(el, model) {
    layoutOrientedSpanDOM(el, model);
  }

  /** @param {HTMLElement} el @param {CircuitComp} m */
  function layoutCompDOM(el, m) {
    if (m.kind === "resistor") layoutResistorDOM(el, /** @type {CR} */ (m));
    else if (m.kind === "voltmeter") layoutVoltmeterDOM(el, /** @type {CV} */ (m));
    else if (m.kind === "ammeter") layoutAmmeterDOM(el, /** @type {CA} */ (m));
    else if (m.kind === "ohmmeter") layoutOhmmeterDOM(el, /** @type {CO} */ (m));
    else if (m.kind === "ground") layoutGroundDOM(el, /** @type {CG} */ (m));
    else layoutBatteryDOM(el, /** @type {CB} */ (m));
  }

  /** @param {HTMLElement} el @param {CG} model */
  function layoutGroundDOM(el, model) {
    layoutOrientedSpanDOM(el, {
      orient: /** @type {Orient} */ ("h"),
      jx: model.jx,
      jy: model.jy,
    });
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
    valEl.textContent = ghost
      ? formatOhmsForDisplay(DEFAULT_R_OHMS)
      : formatOhmsForDisplay(getCompROhms(/** @type {CR} */ (data)));

    root.appendChild(idEl);
    root.appendChild(svg);
    root.appendChild(valEl);

    if (!ghost && "jx" in data) {
      layoutResistorDOM(root, /** @type {CR} */ (data));
      if (selectedCompIds.has(id)) root.classList.add("circuit-comp--selected");
      root.addEventListener("pointerdown", onPlacedCompPointerDown);
      wireCompValueEditing(root, "resistor", id);
    } else if (ghost && orient === "h") {
      root.style.minWidth = `${PACK_W}px`;
    } else if (ghost && orient === "v") {
      root.style.minHeight = `${PACK_W}px`;
    }

    return root;
  }

  /** @param {CG | { gIndex?: number }} data @param {boolean} ghost */
  function buildGroundElement(data, ghost) {
    const gIndex =
      /** @type {number} */ ("gIndex" in data && typeof data.gIndex === "number" ? data.gIndex : groundSeq + 1);
    const id = ghost ? "" : /** @type {CG} */ (data).id;

    const root = document.createElement("div");
    root.className = ghost ? "circuit-comp ground ground--ghost" : "circuit-comp ground";
    if (!ghost && id) root.dataset.sid = id;
    root.dataset.compKind = "ground";

    const idEl = document.createElement("div");
    idEl.className = "resistor-id ground-gnd-label";
    idEl.textContent = "GND";

    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    drawGroundSymbol(svg, ghost ? null : id);

    root.appendChild(idEl);
    root.appendChild(svg);

    if (!ghost && "jx" in data) {
      layoutGroundDOM(root, /** @type {CG} */ (data));
      if (selectedCompIds.has(id)) root.classList.add("circuit-comp--selected");
      root.addEventListener("pointerdown", onPlacedCompPointerDown);
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
      if (selectedCompIds.has(id)) root.classList.add("circuit-comp--selected");
      root.addEventListener("pointerdown", onPlacedCompPointerDown);
    } else if (ghost && orient === "h") {
      root.style.minWidth = `${PACK_W}px`;
    } else if (ghost && orient === "v") {
      root.style.minHeight = `${PACK_W}px`;
    }

    return root;
  }

  /** @param {CA | { amIndex: number; orient?: Orient }} data @param {boolean} ghost */
  function buildAmmeterElement(data, ghost) {
    const orient =
      /** @type Orient */ ("orient" in data && data.orient === "h" ? "h" : "v");
    const amIndex =
      /** @type {number} */ ("amIndex" in data ? data.amIndex : ammeterSeq + 1);
    const id = ghost ? "" : /** @type {CA} */ (data).id;

    const root = document.createElement("div");
    root.className = ghost
      ? "circuit-comp ammeter ammeter--ghost"
      : "circuit-comp ammeter";
    if (!ghost && id) root.dataset.sid = id;
    root.dataset.compKind = "ammeter";
    root.dataset.orient = orient;

    const idEl = document.createElement("div");
    idEl.className = "ammeter-id";
    idEl.textContent = `A${amIndex}`;

    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("class", "ammeter-symbol");
    drawAmmeterSymbol(svg, orient, ghost ? null : id);

    root.appendChild(idEl);
    root.appendChild(svg);

    if (!ghost && "jx" in data) {
      layoutAmmeterDOM(root, /** @type {CA} */ (data));
      if (selectedCompIds.has(id)) root.classList.add("circuit-comp--selected");
      root.addEventListener("pointerdown", onPlacedCompPointerDown);
    } else if (ghost && orient === "h") {
      root.style.minWidth = `${PACK_W}px`;
    } else if (ghost && orient === "v") {
      root.style.minHeight = `${PACK_W}px`;
    }

    return root;
  }

  /** @param {CO | { omIndex: number; orient?: Orient }} data @param {boolean} ghost */
  function buildOhmmeterElement(data, ghost) {
    const orient =
      /** @type Orient */ ("orient" in data && data.orient === "h" ? "h" : "v");
    const omIndex =
      /** @type {number} */ ("omIndex" in data ? data.omIndex : ohmmeterSeq + 1);
    const id = ghost ? "" : /** @type {CO} */ (data).id;

    const root = document.createElement("div");
    root.className = ghost
      ? "circuit-comp ohmmeter ohmmeter--ghost"
      : "circuit-comp ohmmeter";
    if (!ghost && id) root.dataset.sid = id;
    root.dataset.compKind = "ohmmeter";
    root.dataset.orient = orient;

    const idEl = document.createElement("div");
    idEl.className = "ohmmeter-id";
    idEl.textContent = `${OHM}${omIndex}`;

    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("class", "ohmmeter-symbol");
    drawOhmmeterSymbol(svg, orient, ghost ? null : id);

    root.appendChild(idEl);
    root.appendChild(svg);

    if (!ghost && "jx" in data) {
      layoutOhmmeterDOM(root, /** @type {CO} */ (data));
      if (selectedCompIds.has(id)) root.classList.add("circuit-comp--selected");
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
    idEl.textContent = `E${vIndex}`;

    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("class", "battery-symbol");
    drawBatterySymbol(svg, ghost ? null : id);

    const valEl = document.createElement("div");
    valEl.className = "battery-value";
    valEl.textContent = ghost
      ? formatBatVoltsForDisplay(DEFAULT_BAT_VOLT)
      : formatBatVoltsForDisplay(getCompVBat(/** @type {CB} */ (data)));

    root.appendChild(svg);
    root.appendChild(idEl);
    root.appendChild(valEl);
    root.style.setProperty("--battery-label-y", `${BAT_LABEL_TOP}px`);

    if (!ghost && "jx" in data) {
      layoutBatteryDOM(root, /** @type {CB} */ (data));
      if (selectedCompIds.has(id)) root.classList.add("circuit-comp--selected");
      root.addEventListener("pointerdown", onPlacedCompPointerDown);
      wireCompValueEditing(root, "battery", id);
    } else if (ghost) {
      root.style.minHeight = `${PACK_W}px`;
    }

    return root;
  }

  /** @param {CircuitComp} m @param {boolean} ghost */
  function buildCompElement(m, ghost) {
    if (m.kind === "resistor") return buildResistorElement(m, ghost);
    if (m.kind === "voltmeter") return buildVoltmeterElement(m, ghost);
    if (m.kind === "ammeter") return buildAmmeterElement(m, ghost);
    if (m.kind === "ohmmeter") return buildOhmmeterElement(m, ghost);
    if (m.kind === "ground") return buildGroundElement(m, ghost);
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
      const segClass = selectedWireIds.has(w.id)
        ? "wire-seg wire-seg--selected"
        : "wire-seg";
      drawWireSegments(w.points, segClass);
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
    clearInteractionSelection();
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

    /** @type {WirePort | null} */
    let toPort = null;
    if (endHit?.kind === "T") {
      toPort = { kind: "T", compId: endHit.compId, ti: /** @type {0 | 1} */ (endHit.ti) };
    } else if (endHit?.kind === "N") {
      toPort = { kind: "N", nid: endHit.nodeId };
    }

    commit(() => {
      const fromRK = parseRoutingKey(ws.startKey);
      /** @type {WirePort} */
      let fromPort;
      if (fromRK.kind === "Seg") {
        let nid = findWireNodeIdAt(fromRK.sx, fromRK.sy);
        if (nid === null) {
          nid = uid();
          wireNodes[nid] = { x: fromRK.sx, y: fromRK.sy };
        }
        fromPort = { kind: "N", nid };
      } else if (fromRK.kind === "T") {
        fromPort = {
          kind: "T",
          compId: fromRK.compId,
          ti: /** @type {0 | 1} */ (fromRK.ti),
        };
      } else {
        fromPort = { kind: "N", nid: /** @type {{ nid: string }} */ (fromRK).nid };
      }

      let finalTo = toPort;
      if (!finalTo) {
        let nid = findWireNodeIdAt(dest.x, dest.y);
        if (nid === null) {
          nid = uid();
          wireNodes[nid] = { x: dest.x, y: dest.y };
        }
        finalTo = { kind: "N", nid };
      }

      if (routingKeyFromPort(fromPort) === routingKeyFromPort(finalTo)) {
        pruneWireNodes();
        return;
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
    if (dragGhost || compMoveSession || wireSession || paletteDragKind || marqueeSession) {
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

    const sid = el.dataset.sid;
    if (!sid) return;

    if (e.shiftKey) {
      if (selectedCompIds.has(sid)) selectedCompIds.delete(sid);
      else selectedCompIds.add(sid);
      selectedWireIds.clear();
    } else {
      selectSingleCompOnly(sid);
    }
    renderAll();

    if (pointerId !== null) {
      try {
        stage.releasePointerCapture(pointerId);
      } catch (_) {}
      pointerId = null;
      stage.classList.remove("dragging");
    }

    const model = getModel(sid);
    if (!model) return;

    const { wx: awx, wy: awy } = clientToWorld(e.clientX, e.clientY);

    compMoveSession = {
      sid,
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

  function deleteSelection() {
    if (selectedCompIds.size === 0 && selectedWireIds.size === 0) return;
    commit(() => {
      const compIds = [...selectedCompIds];
      comps = comps.filter((c) => !selectedCompIds.has(c.id));
      wires = wires.filter(
        (w) =>
          !selectedWireIds.has(w.id) &&
          !compIds.some(
            (cid) => wirePortTouchesComp(w.from, cid) || wirePortTouchesComp(w.to, cid)
          )
      );
      pruneWireNodes();
      clearInteractionSelection();
    });
  }

  function rotateSelectedOrientable() {
    const m = getModel(soleSelectedCompId());
    if (
      !m ||
      (m.kind !== "resistor" &&
        m.kind !== "voltmeter" &&
        m.kind !== "ammeter" &&
        m.kind !== "ohmmeter")
    )
      return;
    commit(() => {
      if (m.kind === "resistor") {
        const r = /** @type {CR} */ (m);
        const mp = midPointOrientedSpan(r);
        r.orient = r.orient === "h" ? "v" : "h";
        setResistorAnchorFromMidpoint(mp.x, mp.y, r.orient, r);
      } else if (m.kind === "voltmeter") {
        const v = /** @type {CV} */ (m);
        const mp = midPointOrientedSpan(v);
        v.orient = v.orient === "h" ? "v" : "h";
        setResistorAnchorFromMidpoint(mp.x, mp.y, v.orient, v);
      } else if (m.kind === "ammeter") {
        const a = /** @type {CA} */ (m);
        const mp = midPointOrientedSpan(a);
        a.orient = a.orient === "h" ? "v" : "h";
        setResistorAnchorFromMidpoint(mp.x, mp.y, a.orient, a);
      } else {
        const o = /** @type {CO} */ (m);
        const mp = midPointOrientedSpan(o);
        o.orient = o.orient === "h" ? "v" : "h";
        setResistorAnchorFromMidpoint(mp.x, mp.y, o.orient, o);
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
      const focus = soleSelectedCompId();
      const m = focus ? getModel(focus) : null;
      if (!m) return;
      if (m.kind === "resistor") {
        clipboardTpl = { kind: "resistor", orient: /** @type {CR} */ (m).orient };
      } else if (m.kind === "voltmeter") {
        clipboardTpl = { kind: "voltmeter", orient: /** @type {CV} */ (m).orient };
      } else if (m.kind === "ammeter") {
        clipboardTpl = { kind: "ammeter", orient: /** @type {CA} */ (m).orient };
      } else if (m.kind === "ohmmeter") {
        clipboardTpl = { kind: "ohmmeter", orient: /** @type {CO} */ (m).orient };
      } else if (m.kind === "ground") {
        clipboardTpl = { kind: "ground" };
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
          selectSingleCompOnly(nw.id);
        } else if (clipboardTpl.kind === "ground") {
          groundSeq += 1;
          /** @type {CG} */
          const nw = {
            kind: "ground",
            id: uid(),
            gIndex: groundSeq,
            jx: 0,
            jy: 0,
          };
          placeGroundAtWorldPoint(lastPointerWorld.wx, lastPointerWorld.wy, nw);
          comps.push(nw);
          selectSingleCompOnly(nw.id);
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
          selectSingleCompOnly(nw.id);
        } else if (clipboardTpl.kind === "ammeter") {
          ammeterSeq += 1;
          /** @type {CA} */
          const nw = {
            kind: "ammeter",
            id: uid(),
            amIndex: ammeterSeq,
            orient: clipboardTpl.orient,
            jx: 0,
            jy: 0,
          };
          placeResistorAtWorldPoint(lastPointerWorld.wx, lastPointerWorld.wy, nw);
          comps.push(nw);
          selectSingleCompOnly(nw.id);
        } else if (clipboardTpl.kind === "ohmmeter") {
          ohmmeterSeq += 1;
          /** @type {CO} */
          const nw = {
            kind: "ohmmeter",
            id: uid(),
            omIndex: ohmmeterSeq,
            orient: clipboardTpl.orient,
            jx: 0,
            jy: 0,
          };
          placeResistorAtWorldPoint(lastPointerWorld.wx, lastPointerWorld.wy, nw);
          comps.push(nw);
          selectSingleCompOnly(nw.id);
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
          selectSingleCompOnly(nw.id);
        }
      });
      return;
    }

    if (e.code === "Delete") {
      if (selectedCompIds.size || selectedWireIds.size) {
        deleteSelection();
        e.preventDefault();
      }
      return;
    }

    if (e.code === "KeyR" && !mod && !e.altKey) {
      const mR = getModel(soleSelectedCompId());
      if (
        !mR ||
        (mR.kind !== "resistor" &&
          mR.kind !== "voltmeter" &&
          mR.kind !== "ammeter" &&
          mR.kind !== "ohmmeter")
      )
        return;
      rotateSelectedOrientable();
      e.preventDefault();
    }
  }

  /** @param {CR | CV | CA | CO} m */
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

  /** @param {CG} m */
  function placeGroundAtWorldPoint(wx, wy, m) {
    const p = snapToIntersection(wx, wy);
    m.jx = p.x;
    m.jy = p.y;
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

  function paletteAmmeterOrient() {
    return clipboardTpl?.kind === "ammeter" ? clipboardTpl.orient : /** @type {Orient} */ ("v");
  }

  function paletteOhmmeterOrient() {
    return clipboardTpl?.kind === "ohmmeter" ? clipboardTpl.orient : /** @type {Orient} */ ("v");
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
    } else if (kind === "ammeter") {
      const o = paletteAmmeterOrient();
      dragGhost = buildAmmeterElement(
        {
          id: "_g",
          amIndex: ammeterSeq + 1,
          orient: o,
          jx: 0,
          jy: 0,
        },
        true
      );
      dragGhost.style.minWidth = o === "h" ? `${PACK_W}px` : "";
      dragGhost.style.minHeight = o === "v" ? `${PACK_W}px` : "";
    } else if (kind === "ohmmeter") {
      const o = paletteOhmmeterOrient();
      dragGhost = buildOhmmeterElement(
        {
          id: "_g",
          omIndex: ohmmeterSeq + 1,
          orient: o,
          jx: 0,
          jy: 0,
        },
        true
      );
      dragGhost.style.minWidth = o === "h" ? `${PACK_W}px` : "";
      dragGhost.style.minHeight = o === "v" ? `${PACK_W}px` : "";
    } else if (kind === "ground") {
      dragGhost = buildGroundElement({ id: "_g", gIndex: groundSeq + 1, jx: 0, jy: 0 }, true);
      dragGhost.style.minWidth = `${PACK_W}px`;
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
  function onPickAmmeterDown(e) {
    if (e.button !== undefined && e.button !== 0) return;
    if (!pickAmmeterBtn) return;
    startPaletteDrag("ammeter", e, pickAmmeterBtn);
  }

  /** @param {PointerEvent} e */
  function onPickOhmmeterDown(e) {
    if (e.button !== undefined && e.button !== 0) return;
    if (!pickOhmmeterBtn) return;
    startPaletteDrag("ohmmeter", e, pickOhmmeterBtn);
  }

  /** @param {PointerEvent} e */
  function onPickGroundDown(e) {
    if (e.button !== undefined && e.button !== 0) return;
    if (!pickGroundBtn) return;
    startPaletteDrag("ground", e, pickGroundBtn);
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
            : paletteDragKind === "ammeter"
              ? pickAmmeterBtn
              : paletteDragKind === "ohmmeter"
                ? pickOhmmeterBtn
                : paletteDragKind === "ground"
                  ? pickGroundBtn
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
          selectSingleCompOnly(nw.id);
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
          selectSingleCompOnly(nw.id);
        });
      } else if (paletteDragKind === "ammeter") {
        const o = paletteAmmeterOrient();
        commit(() => {
          ammeterSeq += 1;
          /** @type {CA} */
          const nw = {
            kind: "ammeter",
            id: uid(),
            amIndex: ammeterSeq,
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
          selectSingleCompOnly(nw.id);
        });
      } else if (paletteDragKind === "ohmmeter") {
        const o = paletteOhmmeterOrient();
        commit(() => {
          ohmmeterSeq += 1;
          /** @type {CO} */
          const nw = {
            kind: "ohmmeter",
            id: uid(),
            omIndex: ohmmeterSeq,
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
          selectSingleCompOnly(nw.id);
        });
      } else if (paletteDragKind === "ground") {
        commit(() => {
          groundSeq += 1;
          /** @type {CG} */
          const nw = {
            kind: "ground",
            id: uid(),
            gIndex: groundSeq,
            jx: 0,
            jy: 0,
          };
          placeGroundAtWorldPoint(wx, wy, nw);
          comps.push(nw);
          selectSingleCompOnly(nw.id);
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
          selectSingleCompOnly(nw.id);
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
    if (j && (j.kind === "N" || j.kind === "S")) {
      e.preventDefault();
      e.stopPropagation();
      startWireRouting(j, e.pointerId);
      return;
    }

    if (e.shiftKey) {
      marqueeSession = {
        pointerId: e.pointerId,
        x0: wx,
        y0: wy,
        x1: wx,
        y1: wy,
      };
      hideSelectionMarquee();
      updateMarqueeDivFromSession();
      stage.setPointerCapture(e.pointerId);
      e.preventDefault();
      return;
    }

    const widHit = findNearestWireId(wx, wy, WIRE_PICK_R_PX);
    if (widHit) {
      selectSingleWireOnly(widHit);
      renderAll();
      e.preventDefault();
      return;
    }

    if (!e.target.closest(".circuit-comp")) {
      clearInteractionSelection();
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
    if (marqueeSession && marqueeSession.pointerId === e.pointerId) {
      const p = clientToWorld(e.clientX, e.clientY);
      marqueeSession.x1 = p.wx;
      marqueeSession.y1 = p.wy;
      updateMarqueeDivFromSession();
      return;
    }
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
  pickGroundBtn?.addEventListener("pointerdown", onPickGroundDown);
  if (pickVoltmeterBtn) pickVoltmeterBtn.addEventListener("pointerdown", onPickVoltmeterDown);
  if (pickAmmeterBtn) pickAmmeterBtn.addEventListener("pointerdown", onPickAmmeterDown);
  if (pickOhmmeterBtn) pickOhmmeterBtn.addEventListener("pointerdown", onPickOhmmeterDown);

  menuFileNewBtn?.addEventListener("click", () => newCircuitPrompt());
  menuFileOpenBtn?.addEventListener("click", () => {
    void menuOpenCircuit();
  });
  menuFileSaveBtn?.addEventListener("click", () => {
    void saveCircuitToFile(false);
  });
  menuFileSaveAsBtn?.addEventListener("click", () => {
    void saveCircuitToFile(true);
  });
  circuitFileImportInput?.addEventListener("change", async () => {
    const f = circuitFileImportInput.files?.[0];
    circuitFileImportInput.value = "";
    if (!f) return;
    const raw = await f.text();
    loadCircuitFromText(raw, f.name, null);
  });

  stage.addEventListener("pointerdown", onPanPointerDown);
  stage.addEventListener("pointermove", onPanPointerMove);
  stage.addEventListener("pointerup", endPanDrag);
  stage.addEventListener("pointercancel", endPanDrag);
  stage.addEventListener("lostpointercapture", (ev) => {
    teardownMarqueeForPointer(ev.pointerId);
    if (pointerId === ev.pointerId) pointerId = null;
    stage.classList.remove("dragging");
  });
  stage.addEventListener("wheel", onWheel, { passive: false });

  window.addEventListener("keydown", onKeyDown);

  function endPanDrag(ev) {
    if (teardownMarqueeForPointer(ev.pointerId)) {
      try {
        stage.releasePointerCapture(ev.pointerId);
      } catch (_) {}
      return;
    }
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
      closeCommandsModal();
      closeSimulateModal();
    });
  });

  document.getElementById("sim-panel-simulate")?.addEventListener("click", () => {
    void runCircuitSimulation();
  });
  document.getElementById("sim-panel-stop")?.addEventListener("click", () => {
    stopSimulationRequest();
  });
  document.getElementById("sim-panel-verify")?.addEventListener("click", () => {
    openSimulateModal();
  });
  document.getElementById("menu-sim-verify")?.addEventListener("click", () => {
    openSimulateModal();
  });
  document.getElementById("simulate-modal-backdrop")?.addEventListener("click", () => {
    closeSimulateModal();
  });
  document.getElementById("simulate-modal-close")?.addEventListener("click", () => {
    closeSimulateModal();
  });

  document.getElementById("open-commands-modal")?.addEventListener("click", () => {
    openCommandsModal();
  });
  document.getElementById("commands-modal-backdrop")?.addEventListener("click", () => {
    closeCommandsModal();
  });
  document.getElementById("commands-modal-close")?.addEventListener("click", () => {
    closeCommandsModal();
  });

  window.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    const t = e.target;
    if (
      t instanceof HTMLInputElement ||
      t instanceof HTMLTextAreaElement ||
      /** @type {HTMLElement} */ (t).isContentEditable
    )
      return;
    if (marqueeSession) {
      const pid = marqueeSession.pointerId;
      marqueeSession = null;
      hideSelectionMarquee();
      try {
        stage.releasePointerCapture(pid);
      } catch (_) {}
      e.preventDefault();
      return;
    }
    const sim = document.getElementById("simulate-modal");
    const cmd = document.getElementById("commands-modal");
    if (sim && !sim.classList.contains("is-hidden")) {
      e.preventDefault();
      closeSimulateModal();
      return;
    }
    if (cmd && !cmd.classList.contains("is-hidden")) {
      e.preventDefault();
      closeCommandsModal();
    }
  });
})();
