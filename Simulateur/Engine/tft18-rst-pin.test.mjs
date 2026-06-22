import assert from "node:assert/strict";
import { parseTft18ControlPins } from "./tft18-sketch-parse.mjs";
import { isJoyitTft18WiredToBoard, getIdealJoyitTft18Display } from "./tft18-ideal.mjs";

const espSketchBase = `#include <Adafruit_ST7735.h>
#define TFT_CS   6
#define TFT_DC   7
Adafruit_ST7735 tft = Adafruit_ST7735(TFT_CS, TFT_DC, TFT_RST);
void setup() { tft.initR(INITR_BLACKTAB); tft.fillScreen(ST7735_BLACK); }
void loop() { tft.print("OK"); }
`;

const espComponents = (rstDefine) => [
    { label: "ESP1", type: "esp32_c3", sketch: espSketchBase.replace("TFT_RST", rstDefine), lastCompileOk: true },
    { label: "TFT1", type: "joyit_tft18" },
    { label: "VCC1", type: "vcc", value: "3.3" },
    { label: "GND1", type: "gnd" },
];

const espWires = (resPin) => [
    { fromJonctionId: "TFT1_SCL", toJonctionId: "ESP1_GPIO8" },
    { fromJonctionId: "TFT1_SDA", toJonctionId: "ESP1_GPIO10" },
    { fromJonctionId: "TFT1_CS", toJonctionId: "ESP1_GPIO6" },
    { fromJonctionId: "TFT1_DC", toJonctionId: "ESP1_GPIO7" },
    { fromJonctionId: "TFT1_RES", toJonctionId: `ESP1_${resPin}` },
    { fromJonctionId: "TFT1_VCC", toJonctionId: "VCC1_out" },
    { fromJonctionId: "TFT1_GND", toJonctionId: "GND1_out" },
];

const sketchRst9 = espSketchBase.replace("TFT_RST", "#define TFT_RST 9");
const sketchRst5 = espSketchBase.replace("TFT_RST", "#define TFT_RST 5");

assert.equal(parseTft18ControlPins(sketchRst9).RES, "D9");
assert.equal(parseTft18ControlPins(sketchRst5).RES, "D5");

assert.equal(
    isJoyitTft18WiredToBoard("TFT1", espComponents("#define TFT_RST 9"), espWires("GPIO9"), []),
    true
);
assert.equal(
    isJoyitTft18WiredToBoard("TFT1", espComponents("#define TFT_RST 9"), espWires("GPIO5"), []),
    false
);
assert.equal(
    isJoyitTft18WiredToBoard("TFT1", espComponents("#define TFT_RST 5"), espWires("GPIO5"), []),
    true
);

const disp9 = getIdealJoyitTft18Display(
    "TFT1",
    espComponents("#define TFT_RST 9"),
    espWires("GPIO9"),
    []
);
assert.equal(disp9.wired, true);
assert.ok(disp9.labels.some((l) => l.text === "OK"));

const dispMismatch = getIdealJoyitTft18Display(
    "TFT1",
    espComponents("#define TFT_RST 9"),
    espWires("GPIO5"),
    []
);
assert.equal(dispMismatch.wired, false);

console.log("tft18-rst-pin.test.mjs OK");
