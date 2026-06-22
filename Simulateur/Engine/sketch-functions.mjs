/**
 * Expansion des fonctions C++ définies dans le sketch (void foo() { … }).
 * Le simulateur n'exécute que setup()/loop() : les appels utilisateur sont inlined.
 */

const SKIP_FUNCTION_NAMES = new Set([
    "setup",
    "loop",
    "if",
    "else",
    "for",
    "while",
    "switch",
    "case",
    "return",
]);

function escapeRegExp(s) {
    return String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Corps entre { … } à partir de l'index du « { » ouvrant. */
export function extractBraceBody(src, openBraceIdx) {
    if (src[openBraceIdx] !== "{") return null;
    let depth = 0;
    const start = openBraceIdx + 1;
    for (let i = openBraceIdx; i < src.length; i++) {
        const c = src[i];
        if (c === "{") depth++;
        else if (c === "}") {
            depth--;
            if (depth === 0) return src.slice(start, i);
        }
    }
    return src.slice(start);
}

function parseParamNames(paramList) {
    const raw = String(paramList || "").trim();
    if (!raw || raw === "void") return [];
    return raw
        .split(",")
        .map((part) => {
            let p = part.replace(/=.*$/, "").trim();
            const m = p.match(/([A-Za-z_]\w*)\s*$/);
            return m ? m[1] : null;
        })
        .filter(Boolean);
}

function splitCallArgs(argsStr) {
    const args = [];
    let cur = "";
    let depth = 0;
    let inStr = null;
    for (let i = 0; i < argsStr.length; i++) {
        const c = argsStr[i];
        if (inStr) {
            cur += c;
            if (c === inStr && argsStr[i - 1] !== "\\") inStr = null;
            continue;
        }
        if (c === '"' || c === "'") {
            inStr = c;
            cur += c;
            continue;
        }
        if (c === "(") {
            depth++;
            cur += c;
            continue;
        }
        if (c === ")") {
            depth--;
            cur += c;
            continue;
        }
        if (c === "," && depth === 0) {
            args.push(cur.trim());
            cur = "";
            continue;
        }
        cur += c;
    }
    if (cur.trim()) args.push(cur.trim());
    return args;
}

function substituteParams(body, params, argsStr) {
    const args = splitCallArgs(argsStr);
    let out = body;
    params.forEach((param, i) => {
        if (i >= args.length) return;
        out = out.replace(new RegExp(`\\b${escapeRegExp(param)}\\b`, "g"), args[i]);
    });
    return out;
}

/**
 * @param {string} src sketch sans commentaires (ou avec — les définitions sont scannées telles quelles)
 * @returns {Map<string, { params: string[], body: string }>}
 */
export function collectUserFunctions(src) {
    const funcs = new Map();
    const re = /\b(?:static\s+)?void\s+([A-Za-z_]\w*)\s*\(([^)]*)\)\s*\{/gi;
    let m;
    while ((m = re.exec(src)) !== null) {
        const name = m[1];
        if (SKIP_FUNCTION_NAMES.has(name) || funcs.has(name)) continue;
        const openBrace = m.index + m[0].length - 1;
        const body = extractBraceBody(src, openBrace);
        if (body == null) continue;
        funcs.set(name, { params: parseParamNames(m[2]), body });
    }
    return funcs;
}

function findMatchingParen(src, openIdx) {
    if (src[openIdx] !== "(") return -1;
    let depth = 0;
    let inStr = null;
    for (let i = openIdx; i < src.length; i++) {
        const c = src[i];
        if (inStr) {
            if (c === inStr && src[i - 1] !== "\\") inStr = null;
            continue;
        }
        if (c === '"' || c === "'") {
            inStr = c;
            continue;
        }
        if (c === "(") depth++;
        else if (c === ")") {
            depth--;
            if (depth === 0) return i;
        }
    }
    return -1;
}

/**
 * Remplace les appels void foo(…) par le corps de foo (substitution des paramètres).
 * @param {string} body corps de setup()/loop()
 * @param {string} src sketch complet (pour trouver les définitions)
 */
export function expandUserFunctionCalls(body, src) {
    if (!body?.trim()) return body || "";
    const funcs = collectUserFunctions(src);
    if (!funcs.size) return body;

    let result = body;
    for (let pass = 0; pass < 32; pass++) {
        let changed = false;
        for (const [name, fn] of funcs) {
            const re = new RegExp(`\\b${escapeRegExp(name)}\\s*\\(`, "g");
            let m;
            while ((m = re.exec(result)) !== null) {
                const openParen = m.index + m[0].length - 1;
                const closeParen = findMatchingParen(result, openParen);
                if (closeParen < 0) continue;
                const argsStr = result.slice(openParen + 1, closeParen);
                let end = closeParen + 1;
                while (end < result.length && /\s/.test(result[end])) end++;
                if (result[end] === ";") end++;
                const inline = substituteParams(fn.body, fn.params, argsStr);
                result = result.slice(0, m.index) + inline + result.slice(end);
                changed = true;
                re.lastIndex = m.index + Math.max(inline.length, 1);
            }
        }
        if (!changed) break;
    }
    return result;
}
