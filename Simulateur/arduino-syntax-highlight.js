/** Coloration syntaxique sketch Arduino (style proche de l’IDE). */

const KEYWORDS = new Set([
    'if', 'else', 'for', 'while', 'do', 'switch', 'case', 'default', 'break', 'continue', 'return', 'goto',
    'void', 'boolean', 'byte', 'char', 'int', 'long', 'float', 'double', 'short', 'unsigned', 'signed',
    'const', 'static', 'volatile', 'sizeof', 'true', 'false', 'NULL', 'struct', 'enum', 'typedef',
    'uint8_t', 'uint16_t', 'uint32_t', 'int8_t', 'int16_t', 'int32_t', 'word', 'string', 'String',
]);

const TYPE_WORDS = new Set(['boolean', 'byte', 'char', 'int', 'long', 'float', 'double', 'short', 'void', 'word', 'String']);

function escapeHtml(s) {
    return String(s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

function span(cls, text) {
    return `<span class="${cls}">${escapeHtml(text)}</span>`;
}

function skipString(src, i, quote) {
    i++;
    while (i < src.length) {
        if (src[i] === '\\' && i + 1 < src.length) { i += 2; continue; }
        if (src[i] === quote) return i + 1;
        i++;
    }
    return src.length;
}

function skipBlockComment(src, i) {
    i += 2;
    while (i < src.length - 1) {
        if (src[i] === '*' && src[i + 1] === '/') return i + 2;
        i++;
    }
    return src.length;
}

/** @param {string} code */
export function highlightArduinoSource(code) {
    const src = String(code);
    let out = '';
    let i = 0;
    while (i < src.length) {
        const ch = src[i];
        const next = src[i + 1];

        if (ch === '/' && next === '/') {
            const end = src.indexOf('\n', i);
            const slice = end === -1 ? src.slice(i) : src.slice(i, end);
            out += span('ard-hl-cmt', slice);
            i += slice.length;
            continue;
        }
        if (ch === '/' && next === '*') {
            const end = skipBlockComment(src, i);
            out += span('ard-hl-cmt', src.slice(i, end));
            i = end;
            continue;
        }
        if (ch === '#') {
            const end = src.indexOf('\n', i);
            const slice = end === -1 ? src.slice(i) : src.slice(i, end);
            const inc = slice.match(/^#include\s+([<"][^>"]+[>"])/);
            if (inc) {
                const head = slice.slice(0, inc.index + inc[0].indexOf(inc[1]));
                const lib = inc[1];
                out += span('ard-hl-pre', head) + span('ard-hl-lib', lib) + span('ard-hl-pre', slice.slice(head.length + lib.length));
            } else {
                out += span('ard-hl-pre', slice);
            }
            i += slice.length;
            continue;
        }
        if (ch === '"' || ch === "'") {
            const end = skipString(src, i, ch);
            out += span('ard-hl-str', src.slice(i, end));
            i = end;
            continue;
        }
        if (/[0-9]/.test(ch) || (ch === '.' && /[0-9]/.test(next))) {
            let j = i;
            while (j < src.length && /[0-9.xXa-fA-FuUlL]/.test(src[j])) j++;
            out += span('ard-hl-num', src.slice(i, j));
            i = j;
            continue;
        }
        if (/[A-Za-z_]/.test(ch)) {
            let j = i;
            while (j < src.length && /[A-Za-z0-9_]/.test(src[j])) j++;
            const word = src.slice(i, j);
            let k = j;
            while (k < src.length && /\s/.test(src[k])) k++;
            const isCall = src[k] === '(';
            if (word === 'F' && src[k] === '(') {
                out += span('ard-hl-macro', word);
            } else if (KEYWORDS.has(word)) {
                out += span(TYPE_WORDS.has(word) ? 'ard-hl-type' : 'ard-hl-kw', word);
            } else if (isCall) {
                out += span('ard-hl-fn', word);
            } else {
                out += escapeHtml(word);
            }
            i = j;
            continue;
        }
        out += escapeHtml(ch);
        i++;
    }
    return out;
}

let highlightEl = null;
let textareaEl = null;

/** Ajuste la hauteur des deux calques pour qu’ils restent superposés. */
function syncEditorHeight() {
    if (!textareaEl || !highlightEl) return;
    textareaEl.style.height = '0px';
    const h = Math.max(240, textareaEl.scrollHeight);
    textareaEl.style.height = `${h}px`;
    highlightEl.style.height = `${h}px`;
}

function syncHighlight() {
    if (!highlightEl || !textareaEl) return;
    highlightEl.innerHTML = highlightArduinoSource(textareaEl.value);
    syncEditorHeight();
}

export function initArduinoSyntaxHighlight() {
    textareaEl = document.getElementById('arduino-sketch-input');
    highlightEl = document.getElementById('arduino-sketch-highlight');
    if (!textareaEl || !highlightEl) return;

    const refresh = () => syncHighlight();

    textareaEl.addEventListener('input', refresh);
    textareaEl.addEventListener('focus', refresh);
    window.addEventListener('resize', refresh);

    refresh();
}

export function refreshArduinoSyntaxHighlight() {
    syncHighlight();
}
