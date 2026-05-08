function parseVoltMeasurements(log, voltmeters = []) {
    const byRef = {};
    const numberPattern = "([+-]?(?:\\d+\\.?,?\\d*|\\.\\d+|\\d+,\\d+)(?:[eE][+-]?\\d+)?)";
    const parseMaybeNumber = (raw) => {
        const normalized = String(raw || "").trim().replace(",", ".");
        const value = Number.parseFloat(normalized);
        return Number.isFinite(value) ? value : null;
    };
    for (const meter of voltmeters) {
        const escapedName = String(meter.measureName).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const re = new RegExp(`${escapedName}\\s*=\\s*${numberPattern}`, "i");
        const match = re.exec(log);
        if (!match) {
            continue;
        }
        const value = parseMaybeNumber(match[1]);
        if (Number.isFinite(value)) {
            byRef[meter.reference] = value;
        }
    }
    return byRef;
}

function parseNamedMeasurements(log, measureItems = []) {
    const byName = {};
    const numberPattern = "([+-]?(?:\\d+\\.?,?\\d*|\\.\\d+|\\d+,\\d+)(?:[eE][+-]?\\d+)?)";
    const parseMaybeNumber = (raw) => {
        const normalized = String(raw || "").trim().replace(",", ".");
        const value = Number.parseFloat(normalized);
        return Number.isFinite(value) ? value : null;
    };
    for (const item of measureItems) {
        const escapedName = String(item?.measureName || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        if (!escapedName) {
            continue;
        }
        const re = new RegExp(`${escapedName}\\s*=\\s*${numberPattern}`, "i");
        const match = re.exec(log);
        if (!match) {
            continue;
        }
        const value = parseMaybeNumber(match[1]);
        if (Number.isFinite(value)) {
            byName[item.measureName] = value;
        }
    }
    return byName;
}

function parseNodeVoltages(log) {
    const byNode = {};
    const numberRe = /[+-]?(?:\d+\.?\d*|\.\d+|\d+,\d+)(?:[eE][+-]?\d+)?/;
    const parseMaybeNumber = (raw) => {
        const normalized = String(raw || "").trim().replace(",", ".");
        const value = Number.parseFloat(normalized);
        return Number.isFinite(value) ? value : null;
    };

    const explicitRegex = /v\(\s*([^)]+?)\s*\)\s*=\s*([+-]?(?:\d+\.?\d*|\.\d+|\d+,\d+)(?:[eE][+-]?\d+)?)/gi;
    let explicit;
    while ((explicit = explicitRegex.exec(log)) !== null) {
        const nodeName = String(explicit[1] || "").trim().toLowerCase();
        const value = parseMaybeNumber(explicit[2]);
        if (nodeName && Number.isFinite(value)) {
            byNode[nodeName] = value;
        }
    }

    const lines = String(log || "").split(/\r?\n/);
    for (const line of lines) {
        const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s+([+-]?(?:\d+\.?\d*|\.\d+|\d+,\d+)(?:[eE][+-]?\d+)?)\s*$/);
        if (!m) {
            continue;
        }
        const nodeName = m[1].toLowerCase();
        const value = parseMaybeNumber(m[2]);
        if (Number.isFinite(value)) {
            byNode[nodeName] = value;
        }
    }

    for (let i = 0; i < lines.length - 1; i += 1) {
        const header = lines[i];
        if (!/\bindex\b/i.test(header) || !/v\(/i.test(header)) {
            continue;
        }
        const valueLine = lines[i + 1] || "";
        const headerMatches = [...header.matchAll(/v\(\s*([^)]+?)\s*\)/gi)];
        if (headerMatches.length === 0) {
            continue;
        }
        const nums = valueLine.match(new RegExp(numberRe.source, "g")) || [];
        if (nums.length < headerMatches.length + 1) {
            continue;
        }
        for (let k = 0; k < headerMatches.length; k += 1) {
            const nodeName = String(headerMatches[k][1] || "").trim().toLowerCase();
            const value = parseMaybeNumber(nums[k + 1]);
            if (nodeName && Number.isFinite(value)) {
                byNode[nodeName] = value;
            }
        }
    }

    /* ngspice n'affiche souvent pas la ligne du noeud de reference (0) ; tension implicite = 0 */
    if (!Object.prototype.hasOwnProperty.call(byNode, "0")) {
        byNode["0"] = 0;
    }

    return byNode;
}

export function mergeVoltmeterMeasurements(log, voltmeters = [], nodeMeasures = []) {
    const directValues = parseVoltMeasurements(log, voltmeters);
    const namedNodeValues = parseNamedMeasurements(log, nodeMeasures);
    const nodeVoltages = parseNodeVoltages(log);
    const merged = { ...directValues };

    for (const nodeMeasure of nodeMeasures) {
        const measured = namedNodeValues[nodeMeasure.measureName];
        if (Number.isFinite(measured)) {
            nodeVoltages[String(nodeMeasure.nodeName || "").toLowerCase()] = measured;
        }
    }

    for (const meter of voltmeters) {
        if (Number.isFinite(merged[meter.reference])) {
            continue;
        }
        const nPlus = String(meter.nPlus || "").toLowerCase();
        const nMinus = String(meter.nMinus || "").toLowerCase();
        if (!(nPlus in nodeVoltages) || !(nMinus in nodeVoltages)) {
            continue;
        }
        const computed = nodeVoltages[nPlus] - nodeVoltages[nMinus];
        if (Number.isFinite(computed)) {
            merged[meter.reference] = computed;
        }
    }
    return merged;
}
