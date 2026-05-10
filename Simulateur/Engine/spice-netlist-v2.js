/**
 * Construction d'un deck SPICE pour ngspice batch à partir du JSON éditeur
 * ({ comps, wires, wireNodes }).
 * @typedef {{ kind: 'T'; compId: string; ti: 0 | 1 } | { kind: 'N'; nid: string }} WirePort
 * @typedef {{ id: string; from: WirePort; to: WirePort; points: { x:number; y:number }[] }} Wire
 */

const DEFAULT_BAT_V = 5;
const DEFAULT_R_OHM = 1000;

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

/** @param {number} gs */
function spanPx(gs) {
  const g = Number(gs);
  const cell = Number.isFinite(g) && g > 0 ? g : 28;
  return 4 * cell;
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
  if (kind === "battery") {
    const o = /** @type {{ vIndex?: number }} */ (comp);
    const vn = typeof o.vIndex === "number" ? o.vIndex : 0;
    return [
      { ti: /** @type {0|1} */ (0), label: `${id}:V${vn}:+` },
      { ti: /** @type {0|1} */ (1), label: `${id}:V${vn}:−` },
    ];
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
  void span;

  const batteries = comps.filter((c) => c && typeof c === "object" && c.kind === "battery");
  if (batteries.length === 0) {
    errors.push("Ajoutez au moins une alimentation (pile) pour la simulation DC.");
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

  /** @type {string[]} lines */
  const lines = [];

  lines.push("* Circuit Simulateur grille — ngspice batch (auto-generated)");
  lines.push(".TITLE Circuit_grille_DC");
  lines.push("");
  lines.push(".GLOBAL 0");

  if (errors.length === 0) {
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
      lines.push(`R_${id}_ohm ${n0} ${n1} ${ohms}`);
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
      lines.push(`  echo __VM_ROW__:${vmKey}:${vm.displayLabel}:${vm.spicePlus}:${vm.spiceMinus}`);
      lines.push(`  print v(${vm.spicePlus})-v(${vm.spiceMinus})`);
    }

    lines.push(`  echo __VM_END__`);
    lines.push("  quit");
    lines.push(".ENDC");

    lines.push("");
    lines.push(".END");

    lines.push("");
  }

  const netlist = errors.length ? `* erreurs dans build — deck vide.\n${errors.join("\n* ")}\n` : lines.join("\n");

  if (errors.length) {
    return { ok: false, errors, warnings, netlist, voltmeters, nodeMeasures: [] };
  }

  return { ok: true, errors: [], warnings, netlist, voltmeters, nodeMeasures: [] };
}
