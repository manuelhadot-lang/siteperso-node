/**

 * Extraction des tensions / courants ngspice (.op) : plusieurs formats selon version / sortie.

 */



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



export function mergeScopePlotsFromTranWrdata(waveTxt, meta) {

    return {};

}


