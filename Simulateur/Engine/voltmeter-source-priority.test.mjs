/**
 * Qui fait foi pour l'affichage d'un voltmètre : SPICE ou le modèle idéal ?
 * Le modèle idéal, approché, ne doit passer devant SPICE que si le circuit
 * contient un état que l'utilisateur change sans relancer la simulation.
 * node Simulateur/Engine/voltmeter-source-priority.test.mjs
 */
import assert from "assert";
import { idealModelHasPriority } from "./arduino-gpio-ideal.mjs";

/** Circuit purement statique : SPICE est exact, il doit faire foi. */
const statique = [
    { label: "VDC2", type: "battery", value: 5 },
    { label: "R3", type: "resistor", value: "1k" },
    { label: "R4", type: "resistor", value: "1k" },
    { label: "V3", type: "voltmeter" },
    { label: "A2", type: "ammeter" },
    { label: "GND1", type: "ground" },
];
assert.equal(idealModelHasPriority(statique), false, "circuit statique : SPICE fait foi");

// Ni un condensateur ni une LED ne rendent un circuit « vivant ».
assert.equal(
    idealModelHasPriority([...statique, { label: "C1", type: "capacitor" }, { label: "LED1", type: "led" }]),
    false,
    "passifs : SPICE fait foi"
);

for (const type of [
    "logic_terminal",
    "push_button",
    "switch_spdt",
    "potentiometer",
    "ldr",
    "gsin",
    "gsqr",
    "gimp",
    "arduino_uno",
]) {
    assert.equal(
        idealModelHasPriority([...statique, { label: "X1", type }]),
        true,
        `${type} : état vivant, le modèle idéal reste prioritaire`
    );
}

assert.equal(idealModelHasPriority(null), false);
assert.equal(idealModelHasPriority([]), false);

console.log("voltmeter-source-priority.test.mjs OK");
