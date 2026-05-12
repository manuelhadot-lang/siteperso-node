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
 * Dernière portion numérique d'une ligne de print ngspice.
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

/** Courant de branche ngspice (ex. « i(Viam_x) = -1.2e-3 ») — évite de prendre un « 1 » parasite (ex. ligne « DC 1 »). */
function scrapeSpiceBranchCurrentAmps(line) {
  if (typeof line !== "string") return null;
  const m = line
    .trim()
    .match(/\bi\s*\(\s*[^)]+\)\s*=\s*([+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?)/i);
  if (m) return Number(m[1]);
  return scrapeNumber(line);
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

/**
 * @param {string} log
 * @param {Array<{ amIndex?: number; displayLabel?: string; spiceVInstance?: string }>} ammeters
 */
export function mergeAmmeterMeasurements(log, ammeters) {
  /** @type {Record<string, { amps: number | null; label: string; spiceVInstance: string }>} */
  const out = {};

  if (!ammeters || ammeters.length === 0) return out;

  const lines =
    typeof log === "string" ? log.replace(/\r\n/g, "\n").split("\n") : [];

  let j = lines.findIndex((l) => l.includes("__AM_BEGIN__"));
  if (j < 0) j = lines.findIndex((l) => l.includes("__AM_ROW__|"));
  if (j < 0) {
    for (const am of ammeters) {
      const key = String(am.displayLabel || `A${am.amIndex}`);
      let found = /** @type {number | null} */ (null);
      const vn = String(am.spiceVInstance || "");
      const needle = vn.toLowerCase();
      for (let z = lines.length - 1; z >= 0; z--) {
        const row = lines[z];
        if (typeof row !== "string") continue;
        const rl = row.toLowerCase();
        if (!needle || !rl.includes(needle)) continue;
        const n = scrapeSpiceBranchCurrentAmps(row);
        if (n !== null && Number.isFinite(n)) found = n;
      }
      out[key] = {
        amps: found,
        label: key,
        spiceVInstance: vn,
      };
    }
    return out;
  }

  /** @type {number} */
  let idx = Math.max(j, 0);
  const labelsSeen = [];
  while (idx < lines.length) {
    const row = lines[idx];
    if (row.includes("__AM_END__")) break;

    const tag = "__AM_ROW__|";
    const pos = row.indexOf(tag);
    if (pos >= 0) {
      const parts = row.slice(pos + tag.length).split("|");
      if (parts.length >= 3 && idx + 1 < lines.length) {
        const displayLabel = parts[1].trim().replace(/["']/g, "").trim();
        const spiceVInstance = (parts[2] || parts[3] || "").trim().replace(/["']/g, "").trim();
        labelsSeen.push(displayLabel);

        let k = idx + 1;
        /** @type {number | null} */
        let valNum = scrapeSpiceBranchCurrentAmps(lines[k]);
        const maxK = Math.min(lines.length > 0 ? lines.length - 1 : 0, idx + 28);
        while (valNum === null && k < maxK) {
          k++;
          valNum = scrapeSpiceBranchCurrentAmps(lines[k]);
        }
        /** @type {number | null} */
        let amps =
          typeof valNum === "number" && Number.isFinite(valNum) ? valNum : null;
        if (amps === null) {
          const chunk = lines
            .slice(idx + 1, Math.min(lines.length, idx + 32))
            .join(" ");
          const alt = scrapeSpiceBranchCurrentAmps(chunk);
          if (alt !== null) amps = alt;
        }

        const keyLb = displayLabel || `AM_${labelsSeen.length}`;
        out[keyLb] = {
          amps,
          label: keyLb,
          spiceVInstance: spiceVInstance || "",
        };
        idx = k + 1;
        continue;
      }
    }
    idx++;
  }

  /** Compléter ou corriger depuis i(V…) dans le journal */
  for (const am of ammeters) {
    const key = String(am.displayLabel || `A${am.amIndex}`);
    const prev = out[key];
    let fromLog =
      prev && typeof prev.amps === "number" && Number.isFinite(prev.amps) ? prev.amps : null;
    let fromScan = /** @type {number | null} */ (null);
    const vn = String(am.spiceVInstance || "");
    const needle = vn.toLowerCase();
    for (let z = lines.length - 1; z >= 0; z--) {
      const r = lines[z];
      if (typeof r !== "string" || !needle) continue;
      if (!r.toLowerCase().includes(needle)) continue;
      const n = scrapeSpiceBranchCurrentAmps(r);
      if (n !== null && Number.isFinite(n)) {
        fromScan = n;
        break;
      }
    }
    const pick =
      typeof fromLog === "number" && Number.isFinite(fromLog) ? fromLog : fromScan;
    out[key] = {
      amps: typeof pick === "number" && Number.isFinite(pick) ? pick : null,
      label: key,
      spiceVInstance: vn,
    };
  }

  return out;
}

/**
 * Mesure ohmmètre : source interne 1 V série → R = |1 / i(Vohm)| Ω.
 * @param {string} log
 * @param {Array<{ omIndex?: number; displayLabel?: string; spiceVInstance?: string }>} ohmeters
 */
export function mergeOhmmeterMeasurements(log, ohmeters) {
  /** @type {Record<string, { ohms: number | null; label: string; spiceVInstance: string }>} */
  const out = {};
  if (!ohmeters || ohmeters.length === 0) return out;

  const lines =
    typeof log === "string" ? log.replace(/\r\n/g, "\n").split("\n") : [];

  /** @param {number | null} amps */
  function ampsToOhms(amps) {
    if (typeof amps !== "number" || !Number.isFinite(amps)) return null;
    const ia = Math.abs(amps);
    if (ia < 1e-30) return null;
    const r = 1 / ia;
    return Number.isFinite(r) ? r : null;
  }

  let j = lines.findIndex((l) => l.includes("__OH_BEGIN__"));
  if (j < 0) j = lines.findIndex((l) => l.includes("__OH_ROW__|"));
  if (j < 0) {
    for (const om of ohmeters) {
      const key = String(om.displayLabel || `Ω${om.omIndex}`);
      let amps = /** @type {number | null} */ (null);
      const vn = String(om.spiceVInstance || "");
      const needle = vn.toLowerCase();
      for (let z = lines.length - 1; z >= 0; z--) {
        const row = lines[z];
        if (typeof row !== "string" || !needle) continue;
        if (!row.toLowerCase().includes(needle)) continue;
        const n = scrapeSpiceBranchCurrentAmps(row);
        if (n !== null && Number.isFinite(n)) amps = n;
      }
      out[key] = {
        ohms: ampsToOhms(amps),
        label: key,
        spiceVInstance: vn,
      };
    }
    return out;
  }

  /** @type {number} */
  let idx = Math.max(j, 0);
  const labelsSeen = [];
  while (idx < lines.length) {
    const row = lines[idx];
    if (row.includes("__OH_END__")) break;

    const tag = "__OH_ROW__|";
    const pos = row.indexOf(tag);
    if (pos >= 0) {
      const parts = row.slice(pos + tag.length).split("|");
      if (parts.length >= 3 && idx + 1 < lines.length) {
        const rawPart1 = parts[1].trim().replace(/["']/g, "").trim();
        const spiceVInstance = (parts[2] || "").trim().replace(/["']/g, "").trim();
        const omIdxParsed = /^\d+$/.test(rawPart1) ? Number(rawPart1) : NaN;
        const keyLb =
          Number.isFinite(omIdxParsed) && omIdxParsed >= 0
            ? `\u2126${omIdxParsed}`
            : rawPart1 || `\u2126${labelsSeen.length + 1}`;
        labelsSeen.push(keyLb);

        let k = idx + 1;
        let amps = scrapeSpiceBranchCurrentAmps(lines[k]);
        const maxK = Math.min(lines.length > 0 ? lines.length - 1 : 0, idx + 28);
        while (amps === null && k < maxK) {
          k++;
          amps = scrapeSpiceBranchCurrentAmps(lines[k]);
        }
        if (amps === null) {
          const chunk = lines
            .slice(idx + 1, Math.min(lines.length, idx + 32))
            .join(" ");
          amps = scrapeSpiceBranchCurrentAmps(chunk);
        }
        const a =
          typeof amps === "number" && Number.isFinite(amps) ? amps : null;
        out[keyLb] = {
          ohms: ampsToOhms(a),
          label: keyLb,
          spiceVInstance: spiceVInstance || "",
        };
        idx = k + 1;
        continue;
      }
    }
    idx++;
  }

  for (const om of ohmeters) {
    const key = String(om.displayLabel || `Ω${om.omIndex}`);
    const prev = out[key];
    let fromLog =
      prev && typeof prev.ohms === "number" && Number.isFinite(prev.ohms) ? prev.ohms : null;
    let ampsScan = /** @type {number | null} */ (null);
    const vn = String(om.spiceVInstance || "");
    const needle = vn.toLowerCase();
    for (let z = lines.length - 1; z >= 0; z--) {
      const r = lines[z];
      if (typeof r !== "string" || !needle) continue;
      if (!r.toLowerCase().includes(needle)) continue;
      const n = scrapeSpiceBranchCurrentAmps(r);
      if (n !== null && Number.isFinite(n)) {
        ampsScan = n;
        break;
      }
    }
    const computed = ampsScan !== null ? ampsToOhms(ampsScan) : null;
    const pick =
      typeof fromLog === "number" && Number.isFinite(fromLog) ? fromLog : computed;
    out[key] = {
      ohms:
        typeof pick === "number" && Number.isFinite(pick)
          ? pick
          : null,
      label: key,
      spiceVInstance: vn,
    };
  }

  return out;
}

/** Arrondi affichage 2 décimales (nombre fini uniquement). */
export function fmt2(num) {
  const n = Number(num);
  if (!Number.isFinite(n)) return "";
  return (Math.round(n * 100) / 100).toFixed(2);
}

/**
 * Parse un export wrdata ascii ngspice. Gère tous les formats connus :
 *
 *   Format A – wr_singlescale : N+1 colonnes par ligne  → [time, v1, v2, …, vN]
 *   Format B – entrelacé      : 2N colonnes              → [time,v1, time,v2, …]
 *   Format C – avec index     : N+2 colonnes             → [idx, time, v1, …, vN]
 *   Format D – wr_vecnames    : 1ère ligne = noms (texte) ignorée, reste = format A
 *
 * @param {string} text contenu du fichier wrdata
 * @param {Array<{ displayLabel: string; colCh1: number; colCh2: number; colGnd: number }>} scopesTranMeta
 * @returns {Record<string, { t: number[]; ch1: number[]; ch2: number[] }>}
 */
export function mergeScopePlotsFromTranWrdata(text, scopesTranMeta) {
  /** @type {Record<string, { t: number[]; ch1: number[]; ch2: number[] }>} */
  const out = {};
  if (!scopesTranMeta?.length || typeof text !== "string" || !text.trim()) return out;

  /* nVolt = nombre total de colonnes tension attendues (3 par oscilloscope) */
  const nVolt = scopesTranMeta.length * 3;

  const rawLines = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");

  /** @type {number[][]} */
  const rows = [];

  for (const ln of rawLines) {
    const tln = ln.trim();
    if (!tln) continue;

    /* Ignorer toute ligne qui ne commence pas par un chiffre ou signe numérique */
    if (!/^[-+]?[0-9]/.test(tln)) continue;

    const tok = tln.split(/\s+/).filter(Boolean);
    /** @type {number[]} */
    const nums = [];
    let ok = true;
    for (const t of tok) {
      const v = Number(t.replace(",", "."));
      if (!Number.isFinite(v)) { ok = false; break; }
      nums.push(v);
    }
    if (!ok || nums.length < 2) continue;

    const n = nums.length;
    /* Cibles pour chaque format */
    const fA = 1 + nVolt;   /* format A/D exact */
    const fB = 2 * nVolt;   /* format B entrelacé */
    const fC = 2 + nVolt;   /* format C avec index */

    /** @type {number[] | null} */
    let norm = null;

    if (n === fA) {
      /* Format A : exact – le cas le plus fréquent avec wr_singlescale */
      norm = nums;
    } else if (n === fB && nVolt >= 2) {
      /* Format B entrelacé : time,v1, time,v2, … – les temps pairs doivent être identiques */
      const t0 = nums[0];
      const t1 = nums[2];
      const tol = 1e-9 * (1 + Math.abs(t0));
      if (Number.isFinite(t0) && Number.isFinite(t1) && Math.abs(t0 - t1) <= tol) {
        const r = [t0];
        for (let i = 0; i < nVolt; i++) r.push(nums[1 + i * 2]);
        norm = r;
      }
    } else if (n === fC) {
      /* Format C : première colonne = index entier → on la supprime */
      norm = nums.slice(1);
    } else if (n > fA) {
      /* Plus de colonnes qu'attendu : on prend time + les nVolt premiers data */
      norm = [nums[0], ...nums.slice(1, 1 + nVolt)];
    } else if (n === 2 && nVolt === 1) {
      /* 1 seul vecteur en format entrelacé dégénéré : time, v */
      norm = nums;
    }

    if (norm && norm.length >= 1 + nVolt) rows.push(norm);
  }

  for (const sm of scopesTranMeta) {
    const key = String(sm.displayLabel || "");
    if (!key) continue;
    const c1 = sm.colCh1;
    const c2 = sm.colCh2;
    const cg = sm.colGnd;
    const maxNeeded = Math.max(c1, c2, cg);
    const tArr = /** @type {number[]} */ ([]);
    const u1   = /** @type {number[]} */ ([]);
    const u2   = /** @type {number[]} */ ([]);
    for (const row of rows) {
      if (row.length <= maxNeeded) continue;
      tArr.push(row[0]);
      u1.push(row[c1] - row[cg]);
      u2.push(row[c2] - row[cg]);
    }
    if (tArr.length) out[key] = { t: tArr, ch1: u1, ch2: u2 };
  }
  return out;
}
