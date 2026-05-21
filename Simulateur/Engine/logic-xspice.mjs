/**
 * Bascules D via XSPICE (d_dff) + ponts adc_bridge / dac_bridge.
 * Nécessite ngspice compilé avec XSPICE et digital.cm (Simulateur/lib/ngspice/digital.cm).
 */
import { existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __engineDir = dirname(fileURLToPath(import.meta.url));

/** Chemins possibles pour digital.cm (relatif à la racine du dépôt). */
const DIGITAL_CM_REL_PATHS = [
    ["Simulateur", "lib", "ngspice", "digital.cm"],
    ["Simulateur", "share", "ngspice", "lib", "ngspice", "digital.cm"],
];

/**
 * @param {string} [repoRoot] racine du projet (dossier contenant Simulateur/)
 * @returns {string | null} chemin absolu vers digital.cm
 */
/** Chemin relatif (/) sous la racine du dépôt — détection de présence de digital.cm. */
export function resolveDigitalCmRelPath(repoRoot) {
    const root = repoRoot || join(__engineDir, "..", "..");
    for (const parts of DIGITAL_CM_REL_PATHS) {
        const p = join(root, ...parts);
        if (existsSync(p)) return parts.join("/");
    }
    return null;
}

/** @deprecated préférer resolveDigitalCmRelPath pour la netlist */
export function resolveDigitalCmPath(repoRoot) {
    const rel = resolveDigitalCmRelPath(repoRoot);
    if (!rel) return null;
    const root = repoRoot || join(__engineDir, "..", "..");
    return join(root, ...rel.split("/"));
}

export function isXspiceDffAvailable(repoRoot) {
    return resolveDigitalCmRelPath(repoRoot) != null;
}

/**
 * Seuils adc/dac pour signaux bipolaires ±vhi (générateur carré -vhi…+vhi).
 * @param {number} vhi amplitude positive (ex. 5)
 */
export function xspiceLogicThresholds(vhi) {
    const v = vhi > 0 ? vhi : 5;
    return {
        inLow: -0.5 * v,
        inHigh: 0.5 * v,
        outLow: -v,
        outHigh: v,
    };
}

/**
 * Marqueur en tête de netlist : le serveur charge digital.cm via ngspice -f (init.rc),
 * pas via « codemodel » dans le .cir (non reconnu en batch ngspice-46 Windows).
 */
export const XSPICE_DIGITAL_CM_PLACEHOLDER = "__XSPICE_DIGITAL_CM__";

/**
 * @param {string} repoRoot
 * @returns {string[]}
 */
export function xspiceCodemodelLines(repoRoot) {
    if (!resolveDigitalCmRelPath(repoRoot)) return [];
    return [`* XSPICE digital.cm ${XSPICE_DIGITAL_CM_PLACEHOLDER}`];
}

/** @param {string} id préfixe modèle (ex. id du composant) */
function dffModelName(id) {
    return `xdff_${String(id).replace(/[^a-zA-Z0-9_]/g, "_")}`;
}

/**
 * Bascule D XSPICE : broches analogiques via ponts ; cœur numérique d_dff.
 * @param {object} c composant logic_dff
 * @param {function} nodeFor clé broche → nœud SPICE
 * @param {number} vhi
 * @param {string[]} lines
 * @param {function} spiceBranchName
 */
export function appendLogicDffXspiceNetlist(c, nodeFor, vhi, lines, spiceBranchName) {
    const th = xspiceLogicThresholds(vhi);
    const nD = nodeFor(`${c.id}#0`);
    const nClk = nodeFor(`${c.id}#1`);
    const nQ = nodeFor(`${c.id}#2`);
    const nQbar = nodeFor(`${c.id}#3`);
    const dAndQbarShared = nD === nQbar;

    const ndClk = nodeFor(`${c.id}#__xd_clk`);
    const ndQ = nodeFor(`${c.id}#__xd_q`);
    const ndLow = nodeFor(`${c.id}#__xd_low`);
    const nLowA = nodeFor(`${c.id}#__xa_low`);

    const ndBus = dAndQbarShared ? nodeFor(`${c.id}#__xd_bus`) : null;
    const ndData = dAndQbarShared ? ndBus : nodeFor(`${c.id}#__xd_d`);
    const ndQbarOut = dAndQbarShared ? ndBus : nodeFor(`${c.id}#__xd_qbar`);

    lines.push(`V_${c.id}_xlow ${nLowA} 0 DC 0`);
    lines.push(
        `${spiceBranchName("A", c.id)}_adcl [${nLowA}] [${ndLow}] ${c.id}_m_adcl`
    );
    lines.push(
        `.model ${c.id}_m_adcl adc_bridge(in_low=${th.inLow} in_high=${th.inHigh})`
    );

    lines.push(
        `${spiceBranchName("A", c.id)}_adcc [${nClk}] [${ndClk}] ${c.id}_m_adcc`
    );
    lines.push(
        `.model ${c.id}_m_adcc adc_bridge(in_low=${th.inLow} in_high=${th.inHigh})`
    );

    if (!dAndQbarShared) {
        lines.push(
            `${spiceBranchName("A", c.id)}_adcd [${nD}] [${ndData}] ${c.id}_m_adcd`
        );
        lines.push(
            `.model ${c.id}_m_adcd adc_bridge(in_low=${th.inLow} in_high=${th.inHigh})`
        );
    }

    const mname = dffModelName(c.id);
    lines.push(
        `.model ${mname} d_dff(clk_delay=2e-9 set_delay=2e-9 reset_delay=2e-9 ic=0 rise_delay=2e-9 fall_delay=2e-9)`
    );

    lines.push(
        `${spiceBranchName("A", c.id)}_dff [${ndData} ${ndClk} ${ndLow} ${ndLow}] [${ndQ} ${ndQbarOut}] ${mname}`
    );

    lines.push(`${spiceBranchName("A", c.id)}_dacq [${ndQ}] [${nQ}] ${c.id}_m_dacq`);
    lines.push(
        `.model ${c.id}_m_dacq dac_bridge(out_low=${th.outLow} out_high=${th.outHigh} t_rise=2e-9 t_fall=2e-9)`
    );

    lines.push(`${spiceBranchName("A", c.id)}_dacqb [${ndQbarOut}] [${nQbar}] ${c.id}_m_dacqb`);
    lines.push(
        `.model ${c.id}_m_dacqb dac_bridge(out_low=${th.outLow} out_high=${th.outHigh} t_rise=2e-9 t_fall=2e-9)`
    );
}

export function logicDffXspiceInternalNodeKeys(c) {
    if (!c?.id) return [];
    return [
        `${c.id}#__xd_clk`,
        `${c.id}#__xd_set`,
        `${c.id}#__xd_rst`,
        `${c.id}#__xd_q`,
        `${c.id}#__xd_low`,
        `${c.id}#__xa_low`,
        `${c.id}#__xd_d`,
        `${c.id}#__xd_qbar`,
        `${c.id}#__xd_bus`,
    ];
}
