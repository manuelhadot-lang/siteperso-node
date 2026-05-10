/**
 * Construction d'un deck SPICE pour ngspice batch à partir du JSON éditeur
 * ({ comps, wires, wireNodes }).
 * @typedef {{ kind: 'T'; compId: string; ti: 0 | 1 } | { kind: 'N'; nid: string }} WirePort
 * @typedef {{ id: string; from: WirePort; to: WirePort; points: { x:number; y:number }[] }} Wire
 */

const DEFAULT_BAT_V = 5;
const DEFAULT_R_OHM = 1000;
/** Stabilisation numérique globale: fuite très faible de chaque nœud vers 0. */
const DEFAULT_RSHUNT_OHM = 1e12;

/** Nœud référence SPICE : évite clé `0` nombre vs chaîne dans le graphe DC. */
function normSpiceNodeLabel(n) {
  if (n === 0 || n === "0") return "0";
  return String(n);
}

/** @param {WirePort} p */
function portWireKey(p) {
  if (p.kind === "T") return `T:${p.compId}:${p.ti}`;
  return `N:${p.nid}`;
}

/** @param {unknown} ep */
function asWirePort(ep) {
  if (!ep || typeof ep !== "object") return null;
  const o = /** @type {{ kind?: string; nid?: string; compId?: string; ti?: number }} */ (
    ep
  );
  if (o.kind === "T" && typeof o.compId === "string" && (o.ti === 0 || o.ti === 1))
    return { kind: /** @type {'T'} */ ("T"), compId: o.compId, ti: /** @type {0|1} */ (o.ti) };
  if (o.kind === "N" && typeof o.nid === "string") return { kind: "N", nid: o.nid };
  if (typeof o.compId === "string" && (o.ti === 0 || o.ti === 1))
    return { kind: "T", compId: o.compId, ti: /** @type {0|1} */ (o.ti) };
  if (typeof o.nid === "string") return { kind: "N", nid: o.nid };
  return null;
}

class UF {
  constructor() {
    /** @type {Map<string, string>} */
    this.parent = new Map();
  }

  /** @param {string} x */
  add(x) {
    if (!this.parent.has(x)) this.parent.set(x, x);
  }

  /** @param {string} x */
  find(x) {
    let r = x;
    const p = this.parent;
    while (p.get(r) !== r) r = /** @type {string} */ (p.get(r));
    let z = x;
    while (z !== r) {
      const nz = /** @type {string} */ (p.get(z));
      p.set(z, r);
      z = nz;
    }
    return r;
  }

  /** @param {string} a @param {string} b */
  union(a, b) {
    this.add(a);
    this.add(b);
    const ra = this.find(a);
    const rb = this.find(b);
    if (ra !== rb) this.parent.set(rb, ra);
  }
}

/**
 * Nœuds apparaissant sur piles / résistances mais sans chaîne conductrice jusqu’à la réf « 0 ».
 * Voltmètre idéal : hors graphe DC (aucun courant de fuite modelisé).
 * @param {Array<[string, string]>} edges couples de nœuds SPICE distincts du marqueur « FLOAT ».
 * @returns {string[]}
 */
function spiceNodesWithoutDcReturnToGround(edges, refRaw = "0") {
  const ref = normSpiceNodeLabel(refRaw);
  /** @type {Map<string, Set<string>>} */
  const adj = new Map();
  for (const [ar, br] of edges) {
    const a = normSpiceNodeLabel(ar);
    const b = normSpiceNodeLabel(br);
    if (!adj.has(a)) adj.set(a, new Set());
    if (!adj.has(b)) adj.set(b, new Set());
    /** @type {Set<string>} */ (adj.get(a)).add(b);
    /** @type {Set<string>} */ (adj.get(b)).add(a);
  }
  /** @type {Set<string>} */
  const seen = new Set();
  /** @type {string[]} */
  const stack = [ref];
  seen.add(ref);
  while (stack.length) {
    const u = /** @type {string} */ (stack.pop());
    const nbors = adj.get(u);
    if (!nbors) continue;
    for (const v of nbors) {
      if (!seen.has(v)) {
        seen.add(v);
        stack.push(v);
      }
    }
  }
  /** @type {Set<string>} */
  const all = new Set();
  for (const [a, b] of edges) {
    all.add(a);
    all.add(b);
  }
  return [...all].filter((n) => !seen.has(n)).sort(ndCompareAlnum);
}

/** e.g. N2 avant N10 */
function ndCompareAlnum(a, b) {
  const ma = /^N(\d+)$/i.exec(a);
  const mb = /^N(\d+)$/i.exec(b);
  if (ma && mb) return Number(ma[1]) - Number(mb[1]);
  return a.localeCompare(b);
}

/** @param {number} gs */
function spanPx(gs) {
  const g = Number(gs);
  const cell = Number.isFinite(g) && g > 0 ? g : 28;
  return 4 * cell;
}

/**
 * Coordonnées des bornes d'un composant (mêmes conventions que terminalsOfComp côté éditeur).
 * @param {object} comp
 * @param {number} span pixels grille (4 cases)
 * @returns {{ ti: 0 | 1; x: number; y: number }[]}
 */
function terminalCoords(comp, span) {
  const c = /** @type {{ kind?: string; jx?: number; jy?: number; orient?: string }} */ (comp);
  const jx = Number(c.jx);
  const jy = Number(c.jy);
  if (!Number.isFinite(jx) || !Number.isFinite(jy)) return [];
  const k = c.kind;
  if (k === "resistor" || k === "voltmeter" || k === "ammeter" || k === "ohmmeter") {
    if (c.orient === "v") {
      return [
        { ti: /** @type {0|1} */ (0), x: jx, y: jy },
        { ti: /** @type {0|1} */ (1), x: jx, y: jy + span },
      ];
    }
    return [
      { ti: /** @type {0|1} */ (0), x: jx, y: jy },
      { ti: /** @type {0|1} */ (1), x: jx + span, y: jy },
    ];
  }
  if (k === "battery") {
    return [
      { ti: /** @type {0|1} */ (0), x: jx, y: jy },
      { ti: /** @type {0|1} */ (1), x: jx, y: jy + span },
    ];
  }
  if (k === "ground") {
    return [{ ti: /** @type {0|1} */ (0), x: jx, y: jy }];
  }
  return [];
}

/** Point sur segment Manhattan (axe-aligné). Tolérance pour erreur d'arrondi grille. */
function pointOnSegment(px, py, ax, ay, bx, by, tol = 0.5) {
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
  /* Segment quelconque (sécurité) : produit vectoriel + projection bornée. */
  const dx = bx - ax;
  const dy = by - ay;
  const cx = px - ax;
  const cy = py - ay;
  if (Math.abs(dx * cy - dy * cx) > tol) return false;
  const dot = cx * dx + cy * dy;
  const lenSq = dx * dx + dy * dy;
  return dot >= -tol && dot <= lenSq + tol;
}

/**
 * Réconcilie la connectivité électrique à partir de la géométrie :
 *   - borne composant tombant sur un segment de fil   → union
 *   - extrémité d'un fil tombant sur le segment d'un autre → union (jonction en T)
 *
 * @param {UF} uf
 * @param {unknown[]} comps
 * @param {Wire[]} wires
 * @param {number} span
 */
function reconcileGeometry(uf, comps, wires, span) {
  /** @type {{ x: number; y: number; key: string }[]} */
  const featurePoints = [];

  for (const c of comps) {
    if (!c || typeof c !== "object") continue;
    const id = /** @type {{ id?: string }} */ (c).id;
    if (typeof id !== "string") continue;
    for (const t of terminalCoords(/** @type {object} */ (c), span)) {
      featurePoints.push({
        x: t.x,
        y: t.y,
        key: portWireKey({ kind: "T", compId: id, ti: t.ti }),
      });
    }
  }

  for (const w of wires) {
    const pts = w.points;
    if (!Array.isArray(pts) || pts.length < 1) continue;
    const a = pts[0];
    const b = pts[pts.length - 1];
    if (a && Number.isFinite(a.x) && Number.isFinite(a.y))
      featurePoints.push({ x: a.x, y: a.y, key: portWireKey(w.from) });
    if (b && Number.isFinite(b.x) && Number.isFinite(b.y))
      featurePoints.push({ x: b.x, y: b.y, key: portWireKey(w.to) });
  }

  /** @type {{ ax:number; ay:number; bx:number; by:number; key:string }[]} */
  const segments = [];
  for (const w of wires) {
    const pts = w.points;
    if (!Array.isArray(pts) || pts.length < 2) continue;
    const wireKey = portWireKey(w.from);
    for (let i = 0; i + 1 < pts.length; i++) {
      const a = pts[i];
      const b = pts[i + 1];
      if (
        !a ||
        !b ||
        !Number.isFinite(a.x) ||
        !Number.isFinite(a.y) ||
        !Number.isFinite(b.x) ||
        !Number.isFinite(b.y)
      )
        continue;
      segments.push({ ax: a.x, ay: a.y, bx: b.x, by: b.y, key: wireKey });
    }
  }

  for (const p of featurePoints) {
    for (const s of segments) {
      if (uf.find(p.key) === uf.find(s.key)) continue;
      if (pointOnSegment(p.x, p.y, s.ax, s.ay, s.bx, s.by)) {
        uf.union(p.key, s.key);
      }
    }
  }
}

/**
 * Ports logiques composant (sans coordonnées) pour le même modèle électrique
 * que l’éditeur : résistance / voltmètre orientation h|v ; pile avec 0=haut (+), 1=bas (− convention schéma).
 * @param {object} comp
 * @returns {{ ti: 0 | 1; label: string }[]}
 */
function logicalTerminals(comp) {
  const kind = /** @type {string} */ (comp.kind);
  const id = /** @type {string} */ (comp.id || "");
  if (kind === "resistor") {
    const o = /** @type {{ orient?: string }} */ (comp);
    const hv = o.orient === "v" ? "v" : "h";
    if (hv === "h") {
      return [
        { ti: /** @type {0|1} */ (0), label: `${id}:L` },
        { ti: /** @type {0|1} */ (1), label: `${id}:R` },
      ];
    }
    return [
      { ti: /** @type {0|1} */ (0), label: `${id}:T` },
      { ti: /** @type {0|1} */ (1), label: `${id}:B` },
    ];
  }
  if (kind === "voltmeter") {
    const o = /** @type {{ vmIndex?: number; orient?: string }} */ (comp);
    const vm = typeof o.vmIndex === "number" ? o.vmIndex : 0;
    const hv = o.orient === "h" ? "h" : "v";
    if (hv === "h") {
      return [
        { ti: /** @type {0|1} */ (0), label: `${id}:Vm${vm}:L` },
        { ti: /** @type {0|1} */ (1), label: `${id}:Vm${vm}:R` },
      ];
    }
    return [
      { ti: /** @type {0|1} */ (0), label: `${id}:Vm${vm}:T` },
      { ti: /** @type {0|1} */ (1), label: `${id}:Vm${vm}:B` },
    ];
  }
  if (kind === "ammeter") {
    const o = /** @type {{ amIndex?: number; orient?: string }} */ (comp);
    const ai = typeof o.amIndex === "number" ? o.amIndex : 0;
    const hv = o.orient === "h" ? "h" : "v";
    if (hv === "h") {
      return [
        { ti: /** @type {0|1} */ (0), label: `${id}:Am${ai}:L` },
        { ti: /** @type {0|1} */ (1), label: `${id}:Am${ai}:R` },
      ];
    }
    return [
      { ti: /** @type {0|1} */ (0), label: `${id}:Am${ai}:T` },
      { ti: /** @type {0|1} */ (1), label: `${id}:Am${ai}:B` },
    ];
  }
  if (kind === "ohmmeter") {
    const o = /** @type {{ omIndex?: number; orient?: string }} */ (comp);
    const oi = typeof o.omIndex === "number" ? o.omIndex : 0;
    const hv = o.orient === "h" ? "h" : "v";
    if (hv === "h") {
      return [
        { ti: /** @type {0|1} */ (0), label: `${id}:Om${oi}:L` },
        { ti: /** @type {0|1} */ (1), label: `${id}:Om${oi}:R` },
      ];
    }
    return [
      { ti: /** @type {0|1} */ (0), label: `${id}:Om${oi}:T` },
      { ti: /** @type {0|1} */ (1), label: `${id}:Om${oi}:B` },
    ];
  }
  if (kind === "battery") {
    const o = /** @type {{ vIndex?: number }} */ (comp);
    const vn = typeof o.vIndex === "number" ? o.vIndex : 0;
    return [
      { ti: /** @type {0|1} */ (0), label: `${id}:E${vn}:+` },
      { ti: /** @type {0|1} */ (1), label: `${id}:E${vn}:−` },
    ];
  }
  if (kind === "ground") {
    return [{ ti: /** @type {0|1} */ (0), label: `${id}:GND` }];
  }
  return [];
}

/** @param {string} compId */
function sanitizeId(compId, prefix) {
  const s = String(compId || "x").replace(/[^a-zA-Z0-9_]/g, "_");
  const b = /^[a-zA-Z_]/.test(s) ? s : `${prefix}${s}`;
  return b.slice(0, 48);
}

/**
 * @param {unknown} state
 * @param {{ gridStep?: number }} [_opts]
 */
export function buildNgspiceDeck(state, _opts) {
  /** @type {string[]} */
  const errors = [];
  /** @type {string[]} */
  const warnings = [];

  if (!state || typeof state !== "object") {
    return {
      ok: false,
      errors: ["Etat circuit manquant ou invalide."],
      warnings,
      netlist: "",
      voltmeters: [],
      ammeters: [],
      ohmeters: [],
      nodeMeasures: [],
    };
  }

  const st = /** @type {{ comps?: unknown[]; wires?: unknown[] }} */ (state);
  const comps = Array.isArray(st.comps) ? st.comps : [];
  const rawWires = Array.isArray(st.wires) ? st.wires : [];
  const gridStep =
    typeof /** @type {{ gridStep?: number }} */ ( /** @type {object} */ (state)).gridStep ===
    "number"
      ? /** @type {{ gridStep:number }} */ (/** @type {object} */ (state)).gridStep
      : _opts?.gridStep;

  const span = spanPx(/** @type {number} */ (gridStep || 28));

  const batteries = comps.filter((c) => c && typeof c === "object" && c.kind === "battery");
  /** @type {unknown[]} */
  const ohmmeterComps = comps.filter((c) => c && typeof c === "object" && c.kind === "ohmmeter");
  if (batteries.length === 0 && ohmmeterComps.length === 0) {
    errors.push(
      "Ajoutez au moins une alimentation (pile) ou un ohmètre pour la simulation DC."
    );
  }

  /** @type {Wire[]} */
  const wires = [];
  for (const w of rawWires) {
    if (!w || typeof w !== "object") continue;
    const o = /** @type {{ id?: string; from?: unknown; to?: unknown }} */ (w);
    const fp = asWirePort(o.from);
    const tp = asWirePort(o.to);
    if (!fp || !tp) continue;
    wires.push({
      id: typeof o.id === "string" ? o.id : "w",
      from: fp,
      to: tp,
      points: Array.isArray(
        /** @type {{ points?: unknown }} */ (/** @type {object} */ (w)).points
      )
        ? /** @type {{ x:number;y:number }[]} */ (
            /** @type {{ points: unknown }} */ (/** @type {object} */ (w)).points
          )
        : [],
    });
  }

  const uf = new UF();

  for (const c of comps) {
    if (!c || typeof c !== "object") continue;
    const id = /** @type {{ id?: string }} */ (c).id;
    if (typeof id !== "string") continue;
    const ports = logicalTerminals(/** @type {object} */ (c));
    for (const { ti } of ports) uf.add(portWireKey({ kind: "T", compId: id, ti }));
  }

  for (const w of wires) {
    uf.union(portWireKey(w.from), portWireKey(w.to));
  }

  /* Jonctions en T : borne ou extrémité de fil tombant sur un segment d'un autre fil. */
  reconcileGeometry(uf, comps, wires, span);

  /** Batterie − (broche ti=1) → référence nœud 0 */
  let gndRoot = null;
  for (const b of batteries) {
    const bid = /** @type {{ id: string }} */ (b).id;
    const kMinus = portWireKey({ kind: "T", compId: bid, ti: 1 });
    uf.add(kMinus);
    const r = uf.find(kMinus);
    if (gndRoot === null) gndRoot = r;
    else uf.union(gndRoot, r);
    gndRoot = uf.find(kMinus);
  }

  /** Masse schématique : même équipotentiel que la borne − pile (nœud SPICE 0 après assignation). */
  const grounds = comps.filter((c) => c && typeof c === "object" && c.kind === "ground");
  if (batteries.length > 0 && grounds.length > 0) {
    const b0id = /** @type {{ id: string }} */ (batteries[0]).id;
    const kBatMinus = portWireKey({ kind: "T", compId: b0id, ti: 1 });
    for (const g of grounds) {
      const gid = /** @type {{ id?: string }} */ (g).id;
      if (typeof gid !== "string") continue;
      uf.union(portWireKey({ kind: "T", compId: gid, ti: 0 }), kBatMinus);
    }
  } else if (batteries.length === 0 && grounds.length > 0) {
    /** Schéma sans pile : équipotential commun des masses → nœud SPICE 0 après assignation. */
    /** @type {{ kind: 'T'; compId: string; ti: 0 | 1 } | null} */
    let firstGroundPk = null;
    for (const g of grounds) {
      const gid = /** @type {{ id?: string }} */ (g).id;
      if (typeof gid !== "string") continue;
      const kg = {
        kind: /** @type {'T'} */ ("T"),
        compId: gid,
        ti: /** @type {0|1} */ (0),
      };
      const kKey = portWireKey(kg);
      uf.add(kKey);
      if (firstGroundPk === null) firstGroundPk = kg;
      else uf.union(portWireKey(firstGroundPk), kKey);
    }
    if (firstGroundPk !== null) gndRoot = uf.find(portWireKey(firstGroundPk));
  }

  /** @type {Set<string>} */
  const roots = new Set();
  for (const c of comps) {
    if (!c || typeof c !== "object") continue;
    const id = /** @type {{ id?: string }} */ (c).id;
    if (typeof id !== "string") continue;
    const ports = logicalTerminals(/** @type {object} */ (c));
    for (const { ti } of ports) roots.add(uf.find(portWireKey({ kind: "T", compId: id, ti })));
  }
  for (const w of wires) {
    roots.add(uf.find(portWireKey(w.from)));
    roots.add(uf.find(portWireKey(w.to)));
  }

  if (
    errors.length === 0 &&
    gndRoot === null &&
    roots.size > 0 &&
    ohmmeterComps.length > 0 &&
    batteries.length === 0
  ) {
    const [anyRoot] = roots;
    gndRoot = anyRoot;
    warnings.push(
      "Schéma sans pile ni masse : référence SPICE arbitraire pour la polarisation DC (ohmètre + résistances). Préférez placer une masse sur un point fixe pour un repère clair."
    );
  }

  if (errors.length === 0 && gndRoot === null && roots.size === 0) {
    errors.push("Aucun composant à simuler.");
  }

  /** @type {Map<string,string>} spiceNodeByRoot — root uf → nom nœud */
  const spiceNodeByRoot = new Map();

  /** @type {string[]} rootsSorted */
  const rootsSorted =
    roots.size === 0 && gndRoot !== null ? [/** @type {string} */ (gndRoot)] : [...roots].sort();

  if (errors.length === 0) {
    for (const rr of rootsSorted) {
      uf.add(rr);
    }
    if (gndRoot !== null) {
      uf.add(gndRoot);
      const gr = uf.find(gndRoot);
      spiceNodeByRoot.set(gr, "0");
    }

    let nIdx = 1;
    for (const r of rootsSorted) {
      const root = uf.find(r);
      if (spiceNodeByRoot.has(root)) continue;
      spiceNodeByRoot.set(root, `N${nIdx++}`);
    }
  }

  function nodeSpice(pk) {
    const root = uf.find(pk);
    const name = spiceNodeByRoot.get(root);
    return name || "FLOAT";
  }

  /** @typedef {{ vmIndex: number; displayLabel: string; spicePlus: string; spiceMinus: string; spiceId: string }} VmInfo */
  /** @type {VmInfo[]} */
  const voltmeters = [];
  /** @typedef {{ amIndex: number; displayLabel: string; spiceVInstance: string; spicePlus: string; spiceMinus: string }} AmInfo */
  /** @type {AmInfo[]} */
  const ammeters = [];
  /** @typedef {{ omIndex: number; displayLabel: string; spiceVInstance: string; spicePlus: string; spiceMinus: string }} OmInfo */
  /** @type {OmInfo[]} */
  const ohmeters = [];

  /** @type {string[]} lines */
  const lines = [];

  lines.push("* Circuit Simulateur grille — ngspice batch (auto-generated)");
  lines.push(".TITLE Circuit_grille_DC");
  lines.push("");
  lines.push("* Robustesse solveur: rend les nœuds flottants calculables en mode pédagogique");
  lines.push(`.options rshunt=${DEFAULT_RSHUNT_OHM}`);
  lines.push("");

  if (errors.length === 0) {
    /** @type {Array<[string, string]>} */
    const dcConductiveEdges = [];

    lines.push("* --- Sources DC (piles)");
    for (const b of batteries) {
      const bid = sanitizeId(
        /** @type {{ id: string }} */ (/** @type {object} */ (b)).id,
        "B"
      );
      const id = /** @type {{ id: string; vVolts?: number }} */ (/** @type {object} */ (b)).id;
      const v =
        typeof /** @type {{ vVolts?: number }} */ (/** @type {object} */ (b)).vVolts === "number"
          ? /** @type {{ vVolts: number }} */ (/** @type {object} */ (b)).vVolts
          : DEFAULT_BAT_V;
      const kP = portWireKey({ kind: "T", compId: id, ti: 0 });
      const kM = portWireKey({ kind: "T", compId: id, ti: 1 });
      const np = nodeSpice(kP);
      const nm = nodeSpice(kM);
      if (np === "FLOAT" || nm === "FLOAT")
        warnings.push(`Pile ${id} : borne flottante (mal connectée).`);
      else dcConductiveEdges.push([normSpiceNodeLabel(np), normSpiceNodeLabel(nm)]);
      lines.push(`V_${bid}_bat ${np} ${nm} DC ${v}`);
    }

    lines.push("");
    lines.push("* --- Passifs");
    for (const comp of comps) {
      if (!comp || typeof comp !== "object" || comp.kind !== "resistor") continue;
      const id = sanitizeId(
        /** @type {{ id: string }} */ (/** @type {object} */ (comp)).id,
        "R"
      );
      const cid = /** @type {{ id: string; rOhms?: number }} */ (/** @type {object} */ (comp)).id;
      const ohms =
        typeof /** @type {{ rOhms?: number }} */ (/** @type {object} */ (comp)).rOhms === "number"
          ? /** @type {{ rOhms: number }} */ (/** @type {object} */ (comp)).rOhms
          : DEFAULT_R_OHM;
      const k0 = portWireKey({ kind: "T", compId: cid, ti: 0 });
      const k1 = portWireKey({ kind: "T", compId: cid, ti: 1 });
      const n0 = nodeSpice(k0);
      const n1 = nodeSpice(k1);
      if (n0 === "FLOAT" || n1 === "FLOAT") warnings.push(`Résistance ${cid} : nœud flottant ?`);
      else dcConductiveEdges.push([normSpiceNodeLabel(n0), normSpiceNodeLabel(n1)]);
      lines.push(`R_${id}_ohm ${n0} ${n1} ${ohms}`);
    }

    lines.push("");
    lines.push("* --- Ohmmètres (source V DC 1 interne sans pile sur schéma → R équivalent = |1 / i(V)| en Ω)");
    for (const comp of comps) {
      if (!comp || typeof comp !== "object" || comp.kind !== "ohmmeter") continue;
      const o = /** @type {{ id: string; omIndex?: number }} */ (/** @type {object} */ (comp));
      const cid = o.id;
      const omIdx = typeof o.omIndex === "number" ? o.omIndex : 0;
      const sid = sanitizeId(cid, "o");
      const spiceVInstance = `Vioh_${sid}`;
      const k0 = portWireKey({ kind: "T", compId: cid, ti: 0 });
      const k1 = portWireKey({ kind: "T", compId: cid, ti: 1 });
      const np = nodeSpice(k0);
      const nm = nodeSpice(k1);
      if (np === "FLOAT" || nm === "FLOAT")
        warnings.push(`Ohmmètre Ω${omIdx} (${cid}) : une borne semble isolée.`);
      else dcConductiveEdges.push([normSpiceNodeLabel(np), normSpiceNodeLabel(nm)]);
      lines.push(`* Ohmmètre Ω${omIdx} (${cid}) : polarisation série 1 V (${spiceVInstance})`);
      lines.push(`${spiceVInstance} ${np} ${nm} DC 1`);
      ohmeters.push({
        omIndex: omIdx,
        displayLabel: `Ω${omIdx}`,
        spiceVInstance,
        spicePlus: String(np),
        spiceMinus: String(nm),
      });
    }

    lines.push("");
    lines.push("* --- Ampèremètres (source V DC 0 en série → courant = i(instance))");
    for (const comp of comps) {
      if (!comp || typeof comp !== "object" || comp.kind !== "ammeter") continue;
      const o = /** @type {{ id: string; amIndex?: number }} */ (/** @type {object} */ (comp));
      const cid = o.id;
      const amIdx = typeof o.amIndex === "number" ? o.amIndex : 0;
      const sid = sanitizeId(cid, "m");
      /** Unique instance name pour print i(...) */
      const spiceVInstance = `Viam_${sid}`;
      const k0 = portWireKey({ kind: "T", compId: cid, ti: 0 });
      const k1 = portWireKey({ kind: "T", compId: cid, ti: 1 });
      const np = nodeSpice(k0);
      const nm = nodeSpice(k1);
      if (np === "FLOAT" || nm === "FLOAT")
        warnings.push(`Ampèremètre A${amIdx} (${cid}) : une borne semble isolée.`);
      else dcConductiveEdges.push([normSpiceNodeLabel(np), normSpiceNodeLabel(nm)]);
      lines.push(
        `* Ampèremètre A${amIdx} (${cid}) : série, ${spiceVInstance} ${np} ${nm} DC 0`
      );
      lines.push(`${spiceVInstance} ${np} ${nm} DC 0`);
      ammeters.push({
        amIndex: amIdx,
        displayLabel: `A${amIdx}`,
        spiceVInstance,
        spicePlus: String(np),
        spiceMinus: String(nm),
      });
    }

    const floatingDc = spiceNodesWithoutDcReturnToGround(dcConductiveEdges);
    if (floatingDc.length) {
      warnings.push(
        `Nœuds ${floatingDc.join(
          ", "
        )} : pas de liaison continue (pile / résistances / ohmmètre ampèremètres) vers la masse « 0 » — sous-réseau isolé. ngspice peut signaler une matrice singulière sur ces nœuds. Ajoutez la masse, une pile, ou un ohmètre entre vos points si besoin.`
      );
      lines.push("");
      lines.push("* --- Diagnostic topologie simulateur ---");
      lines.push(
        `* ATTENTION nœuds sans retour au 0 de référence : ${floatingDc.join(", ")} (schéma ou fil incomplet)`
      );
    }

    /** Nœuds du graphe pile + résistances + ohmmètres (V=1 série) + ampèremètres (V=0 série) ; voltmètres hors conducteurs. */
    /** @type {Set<string>} */
    const dcNodeSet = new Set(["0"]);
    for (const [a, b] of dcConductiveEdges) {
      dcNodeSet.add(normSpiceNodeLabel(a));
      dcNodeSet.add(normSpiceNodeLabel(b));
    }

    for (const comp of comps) {
      if (!comp || typeof comp !== "object" || comp.kind !== "voltmeter") continue;
      const o = /** @type {{ id: string; vmIndex?: number }} */ (/** @type {object} */ (comp));
      const cid = o.id;
      const vmIdx = typeof o.vmIndex === "number" ? o.vmIndex : 0;
      const sid = sanitizeId(cid, "VM");
      const k0 = portWireKey({ kind: "T", compId: cid, ti: 0 });
      const k1 = portWireKey({ kind: "T", compId: cid, ti: 1 });
      const sp = nodeSpice(k0);
      const sn = nodeSpice(k1);
      if (sp === "FLOAT" || sn === "FLOAT")
        warnings.push(`Voltmètre V${vmIdx} (${cid}) : une borne semble isolée.`);
      const spN = normSpiceNodeLabel(sp);
      const snN = normSpiceNodeLabel(sn);
      if (sp !== "FLOAT" && !dcNodeSet.has(spN))
        warnings.push(
          `Voltmètre V${vmIdx} (${cid}) : borne + sur « ${sp} » — aucun composant pile/résistance sur ce point (probable absence de fil jusqu’à la jonction réelle du circuit). Branchez la borne + sur le même nœud que sur le schéma.`
        );
      if (sn !== "FLOAT" && !dcNodeSet.has(snN))
        warnings.push(
          `Voltmètre V${vmIdx} (${cid}) : borne − sur « ${sn} » — aucun pile/résistance sur ce point (voir câblage).`
        );

      lines.push("");
      lines.push(
        `* Voltmètre V${vmIdx} (${cid}) : mesure idéale ΔV(${sp}) − (${sn}) (pas d’élément branché)`
      );

      voltmeters.push({
        vmIndex: vmIdx,
        displayLabel: `V${vmIdx}`,
        spicePlus: String(sp),
        spiceMinus: String(sn),
        spiceId: sid,
      });
    }

    lines.push("");
    lines.push(".OP");

    lines.push(".CONTROL");
    lines.push("  set numdgt=10");
    lines.push("  op");
    lines.push(`  echo __VM_BEGIN__`);

    let i = 0;
    for (const vm of voltmeters) {
      const vmKey = `${vm.displayLabel}_${i++}`;
      lines.push(
        `  echo "__VM_ROW__|${vmKey}|${vm.displayLabel}|${vm.spicePlus}|${vm.spiceMinus}"`
      );
      /*
       * Dans .CONTROL après `op`, `print v(a)-v(0)` peut être faux / nul avec certaines versions
       * alors que la tension entre a et la référence est correcte. Si la borne − est le nœud 0,
       * utiliser `v(a)` (tension par rapport à la masse SPICE).
       */
      const p = vm.spicePlus;
      const m = vm.spiceMinus;
      let printLine = `  print v(${p})-v(${m})`;
      if (m === "0") printLine = `  print v(${p})`;
      else if (p === "0") printLine = `  print -v(${m})`;
      lines.push(printLine);
    }

    lines.push(`  echo __VM_END__`);

    lines.push(`  echo __AM_BEGIN__`);
    let ai = 0;
    for (const am of ammeters) {
      const ak = `${am.displayLabel}_${ai++}`;
      lines.push(`  echo "__AM_ROW__|${ak}|${am.displayLabel}|${am.spiceVInstance}"`);
      lines.push(`  print i(${am.spiceVInstance})`);
    }
    lines.push(`  echo __AM_END__`);

    lines.push(`  echo __OH_BEGIN__`);
    let oi = 0;
    for (const om of ohmeters) {
      const ok = `ohm_${om.omIndex}_${oi++}`;
      /* Marqueur 100 % ASCII : certains ngspice / encodages Windows plantent sur « Ω » dans .CONTROL */
      lines.push(`  echo "__OH_ROW__|${ok}|${om.omIndex}|${om.spiceVInstance}"`);
      lines.push(`  print i(${om.spiceVInstance})`);
    }
    lines.push(`  echo __OH_END__`);

    lines.push("  quit");
    lines.push(".ENDC");

    lines.push("");
    lines.push(".END");

    lines.push("");
  }

  const netlist = errors.length ? `* erreurs dans build — deck vide.\n${errors.join("\n* ")}\n` : lines.join("\n");

  if (errors.length) {
    return {
      ok: false,
      errors,
      warnings,
      netlist,
      voltmeters,
      ammeters,
      ohmeters: [],
      nodeMeasures: [],
    };
  }

  return {
    ok: true,
    errors: [],
    warnings,
    netlist,
    voltmeters,
    ammeters,
    ohmeters,
    nodeMeasures: [],
  };
}
