/**
 * Diviseur R3/R4 : l'ampèremètre en série dans la branche basse ne doit pas
 * changer la tension lue par le voltmètre. Il est d'impédance nulle : s'il
 * n'est pas traversé, la branche paraît ouverte et le point milieu remonte à
 * la tension d'alimentation (5 V au lieu de 2,5 V).
 * node Simulateur/Engine/ammeter-divider-ideal.test.mjs
 */
import { getIdealVoltmeterVoltage } from "./arduino-gpio-ideal.mjs";
import { quantizeVoltmeterReading } from "./voltmeter-display.mjs";

function wire(fromJonctionId, toJonctionId) {
    return { fromJonctionId, toJonctionId, points: [] };
}

/** Pile 5 V → R3 1k → point milieu (voltmètre) → R4 1k → [ampèremètre] → masse. */
function midpointVoltage(withAmmeter) {
    const components = [
        { label: "VDC2", type: "battery", value: 5 },
        { label: "R3", type: "resistor", value: "1k" },
        { label: "R4", type: "resistor", value: "1k" },
        { label: "V3", type: "voltmeter" },
        { label: "GND1", type: "ground" },
        { label: "GND2", type: "ground" },
        { label: "GND3", type: "ground" },
    ];
    const wires = [
        wire("VDC2_in", "R3_in"), // « + » de la pile = _in
        wire("R3_out", "R4_in"),
        wire("R3_out", "V3_out"), // « + » du voltmètre = _out
        wire("V3_in", "GND2_in"),
        wire("VDC2_out", "GND3_in"),
    ];
    if (withAmmeter) {
        components.push({ label: "A2", type: "ammeter" });
        wires.push(wire("R4_out", "A2_out"));
        wires.push(wire("A2_in", "GND1_in"));
    } else {
        wires.push(wire("R4_out", "GND1_in"));
    }
    return quantizeVoltmeterReading(getIdealVoltmeterVoltage("V3", components, wires, 0, []));
}

let failed = false;
for (const withAmmeter of [false, true]) {
    const v = midpointVoltage(withAmmeter);
    const label = withAmmeter ? "avec ampèremètre" : "sans ampèremètre";
    if (!Number.isFinite(v) || Math.abs(v - 2.5) > 0.05) {
        console.error(`FAIL (${label}) : 2,5 V attendu, obtenu ${v}`);
        failed = true;
    } else {
        console.log(`OK (${label}) : ${v} V`);
    }
}
if (failed) process.exit(1);
