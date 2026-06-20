import assert from "node:assert/strict";
import { getHd44780Glyph } from "../hd44780-font.js";

function glyphHasPixels(glyph) {
    return [...glyph].some((row) => (row & 0x1f) !== 0);
}

const dot = getHd44780Glyph(".");
assert.ok(glyphHasPixels(dot), "le point décimal doit avoir des pixels visibles");

const comma = getHd44780Glyph(",");
assert.ok(glyphHasPixels(comma), "la virgule doit avoir des pixels visibles");

console.log("hd44780-font.test.mjs OK");
