/**

 * Extraction des tensions / courants ngspice (.op) : plusieurs formats selon version / sortie.

 */

import { logicLevelFromVoltage } from "../logic-rails.mjs";



/**

 * @param {string} log

 * @returns {Record<string, number>}

 */

function collectNodeVoltagesFromLog(log) {

    const map = Object.create(null);

    if (!log || typeof log !== "string") return map;



    const reEquals = /\bV\s*\(\s*([^)]+?)\s*\)\s*=\s*([-+eE0-9.]+)/gi;

    let m;

    while ((m = reEquals.exec(log)) !== null) {

        const node = String(m[1]).trim().toLowerCase();

        const v = parseFloat(m[2]);

        if (node && Number.isFinite(v)) map[node] = v;

    }



    const reSpaced = /\bV\s*\(\s*([^)]+?)\s*\)\s+([-+eE0-9.]+)/gi;

    while ((m = reSpaced.exec(log)) !== null) {

        const node = String(m[1]).trim().toLowerCase();

        const v = parseFloat(m[2]);

        if (node && Number.isFinite(v)) map[node] = v;

    }



    const lines = log.split(/\r?\n/);

    for (let i = 0; i < lines.length; i++) {

        if (!/Node.*Voltage/i.test(lines[i])) continue;

        let j = i + 1;

        while (j < lines.length && /^\s*(-+|\.{3,})/.test(lines[j])) j++;

        for (; j < lines.length; j++) {

            const line = lines[j];

            if (!line || !line.trim()) break;

            if (/^Reference value/i.test(line)) continue;

            const row = /^\s*(\S+)\s+([-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?)\s*$/i.exec(line.trim());

            if (!row) continue;

            const node = row[1].toLowerCase();

            if (node === "node" || node === "----" || /^\.{2,}/.test(row[1])) continue;

            const v = parseFloat(row[2]);

            if (Number.isFinite(v)) map[node] = v;

        }

    }



    return map;

}



/** Courants de branches : i(vi_e1) = … */

function collectBranchCurrentsFromLog(log) {

    const map = Object.create(null);

    if (!log || typeof log !== "string") return map;



    const reEquals = /\bI\s*\(\s*([^)]+?)\s*\)\s*=\s*([-+eE0-9.]+)/gi;

    let m;

    while ((m = reEquals.exec(log)) !== null) {

        const branch = String(m[1]).trim().toLowerCase();

        const i = parseFloat(m[2]);

        if (branch && Number.isFinite(i)) map[branch] = i;

    }



    const reSpaced = /\bI\s*\(\s*([^)]+?)\s*\)\s+([-+eE0-9.]+)/gi;

    while ((m = reSpaced.exec(log)) !== null) {

        const branch = String(m[1]).trim().toLowerCase();

        const i = parseFloat(m[2]);

        if (branch && Number.isFinite(i)) map[branch] = i;

    }

    const reRev = /\b([-+eE0-9.]+)\s*=\s*i\s*\(\s*([^)]+?)\s*\)/gi;

    while ((m = reRev.exec(log)) !== null) {

        const branch = String(m[2]).trim().toLowerCase();

        const i = parseFloat(m[1]);

        if (branch && Number.isFinite(i)) map[branch] = i;

    }

    const reDev = /\b((?:vil|vi|d)_[a-z0-9_]+)(?:#branchcurrent)?\s*[:=]?\s+([-+eE0-9.]+)/gi;

    while ((m = reDev.exec(log)) !== null) {

        const branch = String(m[1]).trim().toLowerCase();

        const i = parseFloat(m[2]);

        if (branch && Number.isFinite(i)) map[branch] = i;

    }

    return map;

}



function isSpiceReferenceNode(name) {

    const n = String(name || "")

        .trim()

        .toLowerCase();

    return n === "0" || n === "gnd";

}



function nodeVoltageFromMap(name, map) {

    if (isSpiceReferenceNode(name)) return 0;

    const n = String(name || "")

        .trim()

        .toLowerCase();

    const v = map[n];

    return v != null && Number.isFinite(v) ? v : null;

}



function branchCurrentFromMap(branchName, map) {

    const b = String(branchName || "")

        .trim()

        .toLowerCase();

    const i = map[b];

    return i != null && Number.isFinite(i) ? i : null;

}



/**

 * @param {string} log

 * @param {{ id: string; nodePlus: string; nodeMinus: string }[]} voltmeters

 * @param {unknown[]} _nodeMeasures

 */

export function mergeVoltmeterMeasurements(log, voltmeters, _nodeMeasures) {

    const out = {};

    if (!log || typeof log !== "string" || !Array.isArray(voltmeters) || voltmeters.length === 0) return out;



    const map = collectNodeVoltagesFromLog(log);



    for (const vm of voltmeters) {

        const np = String(vm.nodePlus || "").trim().toLowerCase();

        const nm = String(vm.nodeMinus || "").trim().toLowerCase();

        if (!np || !nm) continue;

        if (isSpiceReferenceNode(vm.nodePlus) && isSpiceReferenceNode(vm.nodeMinus)) continue;



        const vp = nodeVoltageFromMap(vm.nodePlus, map);

        const vmv = nodeVoltageFromMap(vm.nodeMinus, map);

        if (vp == null || vmv == null) continue;



        out[vm.id] = {

            voltage: vp - vmv,

            unit: "V",

            nodePlus: vm.nodePlus,

            nodeMinus: vm.nodeMinus,

        };

    }



    return out;

}



/**

 * @param {string} log

 * @param {{ id: string; branch: string; nodePlus?: string; nodeMinus?: string }[]} ammeters

 */

export function mergeAmmeterMeasurements(log, ammeters) {

    const out = {};

    if (!log || typeof log !== "string" || !Array.isArray(ammeters) || ammeters.length === 0) return out;



    const map = collectBranchCurrentsFromLog(log);



    for (const am of ammeters) {

        if (!am.branch) continue;

        const i = branchCurrentFromMap(am.branch, map);

        if (i == null) continue;

        out[am.id] = {

            current: i,

            unit: "A",

            branch: am.branch,

            nodePlus: am.nodePlus,

            nodeMinus: am.nodeMinus,

        };

    }



    return out;

}

/**
 * @param {string} log
 * @param {{ id: string; branch: string }[]} leds
 */
function ledForwardCurrentFromRow(row, meta, vmap) {
    if (!row || typeof row.current !== "number" || !Number.isFinite(row.current)) return 0;
    const i = row.current;
    const np = meta?.nodePlus;
    const nm = meta?.nodeMinus;
    if (np && nm && vmap && Object.keys(vmap).length > 0) {
        const vp = nodeVoltageFromMap(np, vmap);
        const vm = nodeVoltageFromMap(nm, vmap);
        if (vp != null && vm != null) {
            if (vp <= vm + 0.15) return 0;
            return Math.abs(i);
        }
    }
    return i > 0 ? i : 0;
}

export function mergeLedMeasurements(log, leds) {
    const out = {};
    if (!log || typeof log !== "string" || !Array.isArray(leds) || leds.length === 0) return out;

    const map = collectBranchCurrentsFromLog(log);
    const vmap = collectNodeVoltagesFromLog(log);

    for (const ld of leds) {
        if (!ld.branch) continue;
        const i = branchCurrentFromMap(ld.branch, map);
        if (i == null) continue;
        const iFwd = ledForwardCurrentFromRow({ current: i }, ld, vmap);
        out[ld.id] = {
            current: iFwd,
            unit: "A",
            branch: ld.branch,
            nodePlus: ld.nodePlus,
            nodeMinus: ld.nodeMinus,
        };
    }

    return out;
}

/**
 * @param {string} log
 * @param {{ id: string; nodePlus: string; nodeMinus: string; testCurrent?: number }[]} ohmmeters
 */
export function mergeOhmmeterMeasurements(log, ohmmeters) {
    const out = {};
    if (!log || typeof log !== "string" || !Array.isArray(ohmmeters) || ohmmeters.length === 0) return out;

    const map = collectNodeVoltagesFromLog(log);

    for (const om of ohmmeters) {
        const iTest = om.testCurrent > 0 ? om.testCurrent : 0.001;
        const vp = nodeVoltageFromMap(om.nodePlus, map);
        const vm = nodeVoltageFromMap(om.nodeMinus, map);
        if (vp == null || vm == null) continue;
        const r = Math.abs(vp - vm) / iTest;
        if (!Number.isFinite(r) || r <= 0) continue;

        out[om.id] = {
            resistance: r,
            unit: "Ohm",
            nodePlus: om.nodePlus,
            nodeMinus: om.nodeMinus,
        };
    }

    return out;
}

/**
 * @param {string} log
 * @param {{ id: string; ch1NodePlus: string; ch1NodeMinus: string; ch2NodePlus: string; ch2NodeMinus: string }[]} oscilloscopes
 */
export function mergeOscilloscopeMeasurements(log, oscilloscopes) {
    const out = {};
    if (!log || typeof log !== "string" || !Array.isArray(oscilloscopes) || oscilloscopes.length === 0) {
        return out;
    }

    const map = collectNodeVoltagesFromLog(log);

    function channelVoltage(nodePlus, nodeMinus) {
        const np = String(nodePlus || "").trim().toLowerCase();
        const nm = String(nodeMinus || "").trim().toLowerCase();
        if (!np || !nm) return null;
        if (isSpiceReferenceNode(nodePlus) && isSpiceReferenceNode(nodeMinus)) return null;
        const vp = nodeVoltageFromMap(nodePlus, map);
        const vm = nodeVoltageFromMap(nodeMinus, map);
        if (vp == null || vm == null) return null;
        return vp - vm;
    }

    for (const osc of oscilloscopes) {
        const v1 = channelVoltage(osc.ch1NodePlus, osc.ch1NodeMinus);
        const v2 = channelVoltage(osc.ch2NodePlus, osc.ch2NodeMinus);
        if (v1 == null && v2 == null) continue;
        const row = { id: osc.id };
        if (v1 != null) {
            row.ch1 = {
                voltage: v1,
                unit: "V",
                nodePlus: osc.ch1NodePlus,
                nodeMinus: osc.ch1NodeMinus,
            };
        }
        if (v2 != null) {
            row.ch2 = {
                voltage: v2,
                unit: "V",
                nodePlus: osc.ch2NodePlus,
                nodeMinus: osc.ch2NodeMinus,
            };
        }
        out[osc.id] = row;
    }

    return out;
}

/**
 * @param {string} waveTxt
 * @returns {number[][]}
 */
function parseWrdataNumericRows(waveTxt) {
    const rows = [];
    if (!waveTxt || typeof waveTxt !== "string") return rows;
    for (const line of waveTxt.split(/\r?\n/)) {
        const t = line.trim();
        if (!t || t.startsWith("*")) continue;
        const nums = t.split(/\s+/).map(s => parseFloat(s)).filter(n => Number.isFinite(n));
        if (nums.length >= 2) rows.push(nums);
    }
    return rows;
}

function waveformPeakToPeak(values) {
    if (!Array.isArray(values) || values.length === 0) return NaN;
    let min = Infinity;
    let max = -Infinity;
    for (const v of values) {
        if (!Number.isFinite(v)) continue;
        if (v < min) min = v;
        if (v > max) max = v;
    }
    return Number.isFinite(min) && Number.isFinite(max) ? max - min : NaN;
}

function waveformRms(values) {
    if (!Array.isArray(values) || values.length === 0) return NaN;
    let sum = 0;
    let n = 0;
    for (const v of values) {
        if (!Number.isFinite(v)) continue;
        sum += v * v;
        n++;
    }
    return n > 0 ? Math.sqrt(sum / n) : NaN;
}

/**
 * @param {string} waveTxt — sortie ngspice wrdata
 * @param {{ id: string; timeCol?: number; wrVarCount?: number; ch1: { wrIndex?: number; minusWrIndex?: number | null; minusIsGnd?: boolean }; ch2: { wrIndex?: number; minusWrIndex?: number | null; minusIsGnd?: boolean } }[]} meta
 */
export function mergeScopePlotsFromTranWrdata(waveTxt, meta) {
    const out = {};
    const rows = parseWrdataNumericRows(waveTxt);
    if (!rows.length || !Array.isArray(meta) || meta.length === 0) return out;

    let wrVarCount = 0;
    for (const m of meta) {
        if (m.wrVarCount > wrVarCount) wrVarCount = m.wrVarCount;
        const idxs = [m.ch1?.wrIndex, m.ch2?.wrIndex, m.ch1?.minusWrIndex, m.ch2?.minusWrIndex];
        for (const ix of idxs) {
            if (ix != null && ix + 1 > wrVarCount) wrVarCount = ix + 1;
        }
    }
    if (wrVarCount < 2) wrVarCount = 2;
    const ncol = rows[0].length;
    const colOffset = Math.max(0, ncol - wrVarCount);

    function channelDiff(row, ch) {
        if (!ch || ch.wrIndex == null || ch.wrIndex === undefined) return NaN;
        const plusCol = ch.wrIndex + colOffset;
        const vp = row[plusCol];
        if (!Number.isFinite(vp)) return NaN;
        if (ch.minusIsGnd || ch.minusWrIndex == null) return vp;
        const vm = row[ch.minusWrIndex + colOffset];
        if (!Number.isFinite(vm)) return NaN;
        return vp - vm;
    }

    for (const m of meta) {
        if (!m || !m.id) continue;
        const timeCol = m.timeCol ?? 0;
        const tArr = [];
        const v1Arr = [];
        const v2Arr = [];
        for (const row of rows) {
            if (row.length <= timeCol) continue;
            const d1 = channelDiff(row, m.ch1);
            const d2 = channelDiff(row, m.ch2);
            if (!Number.isFinite(row[timeCol])) continue;
            const ok1 = Number.isFinite(d1);
            const ok2 = Number.isFinite(d2);
            if (!ok1 && !ok2) continue;
            tArr.push(row[timeCol]);
            v1Arr.push(ok1 ? d1 : 0);
            v2Arr.push(ok2 ? d2 : 0);
        }
        if (tArr.length === 0) continue;
        out[m.id] = {
            ch1: { time: tArr, voltage: v1Arr, unit: "V", label: "CH1" },
            ch2: { time: tArr, voltage: v2Arr, unit: "V", label: "CH2" },
        };
    }

    return out;
}

/**
 * Valeurs résumées (crête à crête) pour le tableau lorsque l’analyse est .tran.
 * @param {Record<string, { ch1?: { voltage?: number[] }; ch2?: { voltage?: number[] } }>} scopePlots
 */
function channelDiffFromRow(row, ch, colOffset) {
    if (!ch || ch.wrIndex == null || ch.wrIndex === undefined) return NaN;
    const plusCol = ch.wrIndex + colOffset;
    const vp = row[plusCol];
    if (!Number.isFinite(vp)) return NaN;
    if (ch.minusIsGnd || ch.minusWrIndex == null) return vp;
    const vm = row[ch.minusWrIndex + colOffset];
    if (!Number.isFinite(vm)) return NaN;
    return vp - vm;
}

/**
 * @param {string} waveTxt
 * @param {{ id: string; wrVarCount?: number; channel: { wrIndex?: number; minusWrIndex?: number | null; minusIsGnd?: boolean }; nodePlus?: string; nodeMinus?: string }[]} meta
 */
export function mergeVoltmeterRmsFromTranWrdata(waveTxt, meta) {
    const out = {};
    const rows = parseWrdataNumericRows(waveTxt);
    if (!rows.length || !Array.isArray(meta) || meta.length === 0) return out;

    for (const m of meta) {
        if (!m?.id || !m.channel) continue;
        let wrVarCount = m.wrVarCount || 2;
        if (m.channel.wrIndex != null && m.channel.wrIndex + 1 > wrVarCount) {
            wrVarCount = m.channel.wrIndex + 1;
        }
        const ncol = rows[0].length;
        const colOffset = Math.max(0, ncol - wrVarCount);
        const vals = [];
        for (const row of rows) {
            const d = channelDiffFromRow(row, m.channel, colOffset);
            if (Number.isFinite(d)) vals.push(d);
        }
        const vrms = waveformRms(vals);
        if (!Number.isFinite(vrms)) continue;
        out[m.id] = {
            voltage: vrms,
            unit: "V",
            measure: "Vrms",
            nodePlus: m.nodePlus,
            nodeMinus: m.nodeMinus,
        };
    }
    return out;
}

/**
 * @param {string} waveTxt
 * @param {{ id: string; wrVarCount?: number; currentWrIndex?: number; branch?: string }[]} meta
 */
export function mergeAmmeterRmsFromTranWrdata(waveTxt, meta) {
    const out = {};
    const rows = parseWrdataNumericRows(waveTxt);
    if (!rows.length || !Array.isArray(meta) || meta.length === 0) return out;

    for (const m of meta) {
        if (!m?.id || m.currentWrIndex == null || m.currentWrIndex === undefined) continue;
        const wrVarCount = m.wrVarCount || m.currentWrIndex + 1;
        const ncol = rows[0].length;
        const colOffset = Math.max(0, ncol - wrVarCount);
        const vals = [];
        for (const row of rows) {
            const i = row[m.currentWrIndex + colOffset];
            if (Number.isFinite(i)) vals.push(i);
        }
        const irms = waveformRms(vals);
        if (!Number.isFinite(irms)) continue;
        out[m.id] = {
            current: irms,
            unit: "A",
            measure: "Arms",
            branch: m.branch,
        };
    }
    return out;
}

/**
 * Courants LED pendant .tran (wrdata i(VIL_*)).
 * @param {string} waveTxt
 * @param {{ id: string; timeCol?: number; wrVarCount?: number; currentWrIndex?: number; branch?: string; nodePlus?: string; nodeMinus?: string }[]} meta
 */
export function mergeLedTranPlotsFromWrdata(waveTxt, meta) {
    const out = {};
    const rows = parseWrdataNumericRows(waveTxt);
    if (!rows.length || !Array.isArray(meta) || meta.length === 0) return out;

    let wrVarCount = 0;
    for (const m of meta) {
        if (m.wrVarCount > wrVarCount) wrVarCount = m.wrVarCount;
        if (m.currentWrIndex != null && m.currentWrIndex + 1 > wrVarCount) {
            wrVarCount = m.currentWrIndex + 1;
        }
    }
    if (wrVarCount < 2) wrVarCount = 2;
    const ncol = rows[0].length;
    const colOffset = Math.max(0, ncol - wrVarCount);
    const timeCol = meta[0]?.timeCol ?? 0;

    for (const m of meta) {
        if (!m?.id || m.currentWrIndex == null || m.currentWrIndex === undefined) continue;
        const tArr = [];
        const iArr = [];
        for (const row of rows) {
            if (row.length <= timeCol) continue;
            const t = row[timeCol];
            const iCol = m.currentWrIndex + colOffset;
            if (iCol >= row.length) continue;
            const iRaw = row[iCol];
            if (!Number.isFinite(t) || !Number.isFinite(iRaw)) continue;
            tArr.push(t);
            iArr.push(iRaw > 0 ? iRaw : 0);
        }
        if (!tArr.length) continue;
        out[m.id] = {
            time: tArr,
            current: iArr,
            branch: m.branch,
            nodePlus: m.nodePlus,
            nodeMinus: m.nodeMinus,
        };
    }
    return out;
}

/**
 * @param {Record<string, { time: number[]; current: number[]; branch?: string; nodePlus?: string; nodeMinus?: string }>} ledPlots
 */
/**
 * @param {string} log
 * @param {{ id: string; nodeOut: string }[]} logicGates
 */
export function mergeLogicGateMeasurements(log, logicGates) {
    const out = {};
    if (!log || typeof log !== "string" || !Array.isArray(logicGates) || logicGates.length === 0) {
        return out;
    }
    const map = collectNodeVoltagesFromLog(log);
    for (const lg of logicGates) {
        if (!lg?.id || !lg.nodeOut) continue;
        const v = nodeVoltageFromMap(lg.nodeOut, map);
        if (v == null) continue;
        const th = typeof lg.vth === "number" && lg.vth > 0 ? lg.vth : 2.5;
        out[lg.id] = {
            voltage: v,
            unit: "V",
            logic: logicLevelFromVoltage(v, th),
            nodeOut: lg.nodeOut,
            vhi: lg.vhi,
            vth: th,
        };
    }
    return out;
}

/**
 * @param {string} waveTxt
 * @param {{ id: string; wrVarCount?: number; wrIndex?: number; nodeOut?: string }[]} meta
 */
export function mergeLogicGateTranFromWrdata(waveTxt, meta) {
    const out = {};
    const rows = parseWrdataNumericRows(waveTxt);
    if (!rows.length || !Array.isArray(meta) || meta.length === 0) return out;

    for (const m of meta) {
        if (!m?.id || m.wrIndex == null || m.wrIndex === undefined) continue;
        const wrVarCount = m.wrVarCount || m.wrIndex + 1;
        const ncol = rows[0].length;
        const colOffset = Math.max(0, ncol - wrVarCount);
        const vals = [];
        for (const row of rows) {
            const v = row[m.wrIndex + colOffset];
            if (Number.isFinite(v)) vals.push(v);
        }
        if (!vals.length) continue;
        const v = vals[vals.length - 1];
        const th = typeof m.vth === "number" && m.vth > 0 ? m.vth : 2.5;
        out[m.id] = {
            voltage: v,
            unit: "V",
            logic: logicLevelFromVoltage(v, th),
            nodeOut: m.nodeOut,
            vhi: m.vhi,
            vth: th,
        };
    }
    return out;
}

export function mergeLedValuesFromTranPlots(ledPlots) {
    const out = {};
    if (!ledPlots || typeof ledPlots !== "object") return out;
    for (const [id, plot] of Object.entries(ledPlots)) {
        if (!plot?.current?.length) continue;
        let peak = 0;
        for (const i of plot.current) {
            if (Number.isFinite(i) && i > peak) peak = i;
        }
        out[id] = {
            current: peak,
            unit: "A",
            branch: plot.branch,
            nodePlus: plot.nodePlus,
            nodeMinus: plot.nodeMinus,
            reverseBias: peak < 5e-7,
        };
    }
    return out;
}

export function deriveOscilloscopeValuesFromScopePlots(scopePlots) {
    const out = {};
    if (!scopePlots || typeof scopePlots !== "object") return out;
    for (const [id, plot] of Object.entries(scopePlots)) {
        if (!plot) continue;
        const row = {};
        if (plot.ch1 && Array.isArray(plot.ch1.voltage) && plot.ch1.voltage.length) {
            const vpp = waveformPeakToPeak(plot.ch1.voltage);
            row.ch1 = {
                voltage: vpp,
                unit: "V",
                measure: "Vpp",
            };
        }
        if (plot.ch2 && Array.isArray(plot.ch2.voltage) && plot.ch2.voltage.length) {
            const vpp = waveformPeakToPeak(plot.ch2.voltage);
            row.ch2 = {
                voltage: vpp,
                unit: "V",
                measure: "Vpp",
            };
        }
        if (row.ch1 || row.ch2) out[id] = row;
    }
    return out;
}


