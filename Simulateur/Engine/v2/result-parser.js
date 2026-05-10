/**
 * Extraction des tensions voltmètres depuis la sortie log ngspice (+ stdout/stderr).
 * Marqueurs __VM_ROW__ + `print …` ; résultats finalisés via le tableau OP `v(no)=`.
 */

const NUM_RE =
  /^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/;

/** Voltages nodaux DC dans tout le journal (motifs répétés comme en sortie `.op`). */
const VNODE_LINE_RE =
  /\b[Vv]\(\s*([A-Za-z0-9_]+)\s*\)\s*=\s*([+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?)/gi;

/**
 * @param {string} raw
 */
function trimSpiceEchoLine(raw) {
  let s = raw.trim();
  if (s.endsWith(";")) {
    const sc = s.indexOf(";");
    if (sc >= 0) s = s.slice(0, sc).trimEnd();
  }
  return s;
}

/**
 * Dernière portion numérique d’une ligne de print ngspice.
 * @param {string} line
 */
function scrapeNumber(line) {
  const parts = line.trim().split(/\s+/);
  for (let i = parts.length - 1; i >= 0; i--) {
    const tok = trimSpiceEchoLine(parts[i]);
    if (NUM_RE.test(tok)) return Number(tok);
  }
  const m = line.match(/=\s*([+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?)/);
  return m ? Number(m[1]) : null;
}

/**
 * @param {string[]} lines
 * @returns {Map<string, number>} clés normalisées en majuscules (référence "0")
 */
function scrapeOpNodeVoltages(lines) {
  /** @type {Map<string, number>} */
  const m = new Map();
  for (const row of lines) {
    if (typeof row !== "string") continue;
    if (row.includes("__VM_ROW__|")) continue;
    let x;
    VNODE_LINE_RE.lastIndex = 0;
    while ((x = VNODE_LINE_RE.exec(row)) !== null) {
      const name = /** @type {string} */ (x[1]).toUpperCase();
      const val = Number(x[2]);
      if (Number.isFinite(val)) m.set(name, val);
    }
  }
  return m;
}

/**
 * Potentiel DC par rapport au nœud ref 0 pour un nom de nœud SPICE tel que dans la netliste.
 * @param {string} spiceNode
 * @param {Map<string, number>} vnode
 */
function dcPotentialVsRef(spiceNode, vnode) {
  if (spiceNode === "0") return 0;
  const u = spiceNode.toUpperCase();
  if (!vnode.has(u)) return null;
  const v = /** @type {number} */ (vnode.get(u));
  return Number.isFinite(v) ? v : null;
}

/**
 * ΔV entre deux nœuds à partir du tableau OP.
 * @param {string} plus
 * @param {string} minus
 * @param {Map<string, number>} vnode
 */
function voltsFromVnodeTable(plus, minus, vnode) {
  const a = dcPotentialVsRef(plus, vnode);
  const b = dcPotentialVsRef(minus, vnode);
  if (a === null || b === null) return null;
  return a - b;
}

/**
 * @param {string} log
 * @param {Array<{ displayLabel?: string; vmIndex?: number; spicePlus: string; spiceMinus: string; spiceId?: string }>} voltmeters
 * @param {unknown[]} _nodeMeasures réservé
 */
export function mergeVoltmeterMeasurements(log, voltmeters, _nodeMeasures) {
  void _nodeMeasures;
  /** @type {Record<string, { volts: number | null; label: string; plus: string; minus: string }>} */
  const out = {};

  if (!voltmeters || voltmeters.length === 0) return out;

  const lines =
    typeof log === "string" ? log.replace(/\r\n/g, "\n").split("\n") : [];
  /** Toujours disposer du tableau nodal OP (robuste pour ponts diviseurs, v(a)−v(b), etc.). */
  const vnodeAll = scrapeOpNodeVoltages(lines);

  let iStart = lines.findIndex((l) => l.includes("__VM_BEGIN__"));
  if (iStart < 0) iStart = lines.findIndex((l) => l.includes("__VM_ROW__|"));
  if (iStart < 0) {
    /** Fallback : dernier tableau « voltages » + colonnes v(...) = dans la suite courte */
    let iV = -1;
    for (let xi = lines.length - 1; xi >= 0; xi--) {
      if (/\bvoltages?\b/i.test(lines[xi])) {
        iV = xi;
        break;
      }
    }
    if (iV >= 0) {
      const vnodeSlice = scrapeOpNodeVoltages(lines.slice(iV, Math.min(lines.length, iV + 120)));
      for (const vm of voltmeters) {
        const key = vm.displayLabel || `V${vm.vmIndex ?? "?"}`;
        const vp = vm.spicePlus;
        const vn = vm.spiceMinus;
        let val = voltsFromVnodeTable(vp, vn, vnodeSlice);
        if (val === null) val = voltsFromVnodeTable(vp, vn, vnodeAll);
        out[key] = {
          volts: val,
          label: key,
          plus: vp,
          minus: vn,
        };
      }
      return out;
    }
    for (const vm of voltmeters) {
      const key = vm.displayLabel || `V${vm.vmIndex}`;
      const vp = vm.spicePlus;
      const vn = vm.spiceMinus;
      let val = voltsFromVnodeTable(vp, vn, vnodeAll);
      out[key] = {
        volts: val,
        label: key,
        plus: vp,
        minus: vn,
      };
    }
    return out;
  }

  /** scan markers */
  let j = Math.max(iStart, 0);
  const labelsSeen = [];
  while (j < lines.length) {
    const row = lines[j];
    const end = row.includes("__VM_END__");
    if (end) break;

    const tag = "__VM_ROW__|";
    const pos = row.indexOf(tag);
    if (pos >= 0) {
      const parts = row.slice(pos + tag.length).split("|");
      if (parts.length >= 4 && j + 1 < lines.length) {
        const displayLabel = parts[1].trim().replace(/["']/g, "").trim();
        const pm = displayLabel.trim();
        const printLine = lines[j + 1];
        labelsSeen.push(displayLabel);

        let k = j + 1;
        let valNum = scrapeNumber(printLine);
        const maxK = Math.min(lines.length > 0 ? lines.length - 1 : 0, j + 28);
        while (valNum === null && k < maxK) {
          k++;
          valNum = scrapeNumber(lines[k]);
        }

        /** @type {number | null} */
        let volts =
          typeof valNum === "number" && Number.isFinite(valNum) ? valNum : null;
        if (volts === null) {
          const chunk = lines
            .slice(j + 1, Math.min(lines.length, j + 32))
            .join(" ");
          const alt = scrapeNumber(chunk);
          if (alt !== null) volts = alt;
        }

        const plus = parts[2].trim().replace(/["']/g, "").trim();
        const minus = parts[3].trim().replace(/["']/g, "").trim();

        out[displayLabel || pm || `VM_${labelsSeen.length}`] = {
          volts,
          label: displayLabel || pm,
          plus,
          minus,
        };
        j = k + 1;
        continue;
      }
    }
    j++;
  }

  /** Source de vérité : ΔV depuis les lignes OP `v(noeud)=` (fiable même si `print v(a)−v(b)` est trompeur). */
  for (const vm of voltmeters) {
    const key = vm.displayLabel || `V${vm.vmIndex}`;
    const vp = vm.spicePlus;
    const vn = vm.spiceMinus;
    const fromOp = voltsFromVnodeTable(vp, vn, vnodeAll);

    let row = out[key];
    if (!row)
      row = {
        volts: fromOp,
        label: key,
        plus: vp,
        minus: vn,
      };

    row.plus = vp;
    row.minus = vn;
    if (fromOp !== null) row.volts = fromOp;
    out[key] = row;
  }

  return out;
}
