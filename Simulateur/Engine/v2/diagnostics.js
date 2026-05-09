function collectReachable(adjFrom, seeds) {
    const seen = new Set();
    const stack = [...seeds];
    while (stack.length > 0) {
        const n = stack.pop();
        if (seen.has(n)) {
            continue;
        }
        seen.add(n);
        const nei = adjFrom.get(n);
        if (nei) {
            nei.forEach((x) => stack.push(x));
        }
    }
    return seen;
}

export function buildDiagnostics(compiled) {
    const { conductiveAdj = new Map(), sourceNodes = [], floatingSeedNodes = new Set(), statsByNode } = compiled;
    const groundReach = collectReachable(conductiveAdj, ["0"]);
    const sourceReach = collectReachable(conductiveAdj, sourceNodes);
    const reachable = collectReachable(conductiveAdj, [...floatingSeedNodes, "0"]);

    let sourceConnectedToGround = sourceNodes.length === 0 ? null : false;
    for (const sn of sourceNodes) {
        if (groundReach.has(sn)) {
            sourceConnectedToGround = true;
            break;
        }
    }

    const floatingNets = [];
    if (statsByNode instanceof Map && statsByNode.size > 0) {
        statsByNode.forEach((stats, net) => {
            if (!reachable.has(net)) {
                return;
            }
            if (stats.hasUnsupported) {
                return;
            }
            if ((stats.hasSource || stats.hasConductive) && !groundReach.has(net) && net !== "0") {
                floatingNets.push(net);
            }
        });
    }

    const floatingSet = new Set(floatingNets);
    [...sourceReach].forEach((n) => !groundReach.has(n) && floatingSet.add(n));

    return {
        sourceConnectedToGround,
        floatingNets: [...floatingSet],
        reachableNodeCount: reachable.size,
        groundedNodeCount: groundReach.size
    };
}
