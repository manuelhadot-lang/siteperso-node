import assert from "node:assert/strict";
import {
    collectUserFunctions,
    expandUserFunctionCalls,
} from "./sketch-functions.mjs";

const src = `
void drawTitle() {
  tft.print("Hello");
  delay(100);
}
void showValue(int v) {
  tft.print(v);
  tft.print("%");
}
void setup() {
  tft.initR(INITR_BLACKTAB);
}
void loop() {
  drawTitle();
  showValue(50);
}
`;

assert.ok(collectUserFunctions(src).has("drawTitle"));
assert.ok(collectUserFunctions(src).has("showValue"));
assert.equal(collectUserFunctions(src).has("setup"), false);

const expanded = expandUserFunctionCalls(extractLoop(src), src);
assert.match(expanded, /tft\.print\("Hello"\)/);
assert.match(expanded, /tft\.print\(50\)/);
assert.match(expanded, /tft\.print\("%"\)/);

function extractLoop(s) {
    const i = s.indexOf("void loop()");
    const open = s.indexOf("{", i);
    let depth = 0;
    for (let j = open; j < s.length; j++) {
        if (s[j] === "{") depth++;
        else if (s[j] === "}") {
            depth--;
            if (depth === 0) return s.slice(open + 1, j);
        }
    }
    return "";
}

console.log("sketch-functions.test.mjs OK");
