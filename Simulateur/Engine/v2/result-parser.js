/**
 * Extraction des tensions voltmètres depuis la sortie log ngspice (+ stdout/stderr).
 * Le deck utilise des marqueurs __VM_ROW__ suivis de `print v(a)-v(b)` batch.
 */

const NUM_RE =
  /^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/;

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

  let iStart = lines.findIndex((l) => l.includes("__VM_BEGIN__"));
  if (iStart < 0) iStart = lines.findIndex((l) => l.includes("__VM_ROW__|"));
  if (iStart < 0) {
    /** fallback : dernier tableau « voltages » */
    let iV = -1;
    for (let xi = lines.length - 1; xi >= 0; xi--) {
      if (/\bvoltages?\b/i.test(lines[xi])) {
        iV = xi;
        break;
      }
    }
    if (iV >= 0) {
      /** @type {Map<string, number>} */
      const vnode = new Map();
      const reVNode = /\bv\(\s*([A-Za-z0-9_]+)\s*\)\s*=+\s*([+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?)/gi;
      for (let li = iV + 1; li < lines.length && li < iV + 80; li++) {
        let m;
        const row = lines[li];
        reVNode.lastIndex = 0;
        while ((m = reVNode.exec(row)) !== null) {
          vnode.set(m[1], Number(m[2]));
        }
      }
      for (const vm of voltmeters) {
        const key = vm.displayLabel || `V${vm.vmIndex ?? "?"}`;
        const vp = vm.spicePlus;
        const vn = vm.spiceMinus;
        let val = null;
        if (!vnode.has(vp) || !vnode.has(vn)) val = null;
        else val = /** @type {number} */ (vnode.get(vp)) - /** @type {number} */ (vnode.get(vn));
        out[key] = { volts: val, label: key, plus: vp, minus: vn };
      }
      return out;
    }
    for (const vm of voltmeters) {
      const key = vm.displayLabel || `V${vm.vmIndex}`;
      out[key] = {
        volts: null,
        label: key,
        plus: vm.spicePlus,
        minus: vm.spiceMinus,
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
      /** vmKey, label, plus, minus */
      if (parts.length >= 4 && j + 1 < lines.length) {
      const displayLabel = parts[1].trim().replace(/["']/g, "").trim();
      const pm = displayLabel.trim();
      const printLine = lines[j + 1];
      labelsSeen.push(displayLabel);

      /** ignorer lignes « echo » / vides suivantes jusqu’à nombre */
      let k = j + 1;
      let valNum = scrapeNumber(printLine);
      while (valNum === null && k + 1 < Math.min(lines.length, j + 6)) {
        k++;
        valNum = scrapeNumber(lines[k]);
      }

      /** @type {number | null} */
      let volts = typeof valNum === "number" && Number.isFinite(valNum) ? valNum : null;
      /** cas print multiligne très verbeux : essayer brute force sur bloc */
      if (volts === null) {
        const chunk = lines.slice(j + 1, j + 8).join(" ");
        const alt = scrapeNumber(chunk);
        if (alt !== null) volts = alt;
      }

      out[displayLabel || pm || `VM_${labelsSeen.length}`] = {
        volts,
        label: displayLabel || pm,
        plus: parts[2].trim().replace(/["']/g, "").trim(),
        minus: parts[3].trim().replace(/["']/g, "").trim(),
      };
      j = k + 1;
      continue;
      }
    }
    j++;
  }

  for (const vm of voltmeters) {
    const key = vm.displayLabel || `V${vm.vmIndex}`;
    if (!out[key]) {
      out[key] = {
        volts: null,
        label: key,
        plus: vm.spicePlus,
        minus: vm.spiceMinus,
      };
    }
  }

  return out;
}
