export function buildDiagnostics(compiled) {
    const {
        sourceNodes = [],
        floatingSeedNodes = new Set(),
        conductiveAdj = new Map(),
        unsupportedComponents = []
    } = compiled;

    const visited = new Set(["0"]);
    const queue = ["0"];
    while (queue.length > 0) {
        const cur = queue.shift();
        const nextSet = conductiveAdj.get(cur);
        if (!nextSet) {
            continue;
        }
        for (const nxt of nextSet) {
            if (!visited.has(nxt)) {
                visited.add(nxt);
                queue.push(nxt);
            }
        }
    }

    const sourceConnectedToGround = sourceNodes.length === 0 ? null : sourceNodes.some((n) => visited.has(n));
    const floatingNets = [];
    floatingSeedNodes.forEach((node) => {
        if (node !== "0" && !visited.has(node)) {
            floatingNets.push(node);
        }
    });

    return {
        floatingNets,
        sourceConnectedToGround,
        unsupportedComponents
    };
}
