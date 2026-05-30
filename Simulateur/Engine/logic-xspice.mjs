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
 * Seuils adc/dac pour signaux unipolaires 0…Vhi (GImp, états logiques, carré 0…Vhi).
 * Compatible aussi avec un carré bipolaire ±Vhi si l'amplitude dépasse les seuils.
 * @param {number} vhi amplitude positive (ex. 5)
 */
export function xspiceLogicThresholds(vhi) {
    const v = vhi > 0 ? vhi : 5;
    return {
        inLow: 0.2 * v,
        inHigh: 0.8 * v,
        outLow: 0,
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
 * @param {{srWired?: {set?: boolean, reset?: boolean}}} [opts]
 */
export function appendLogicDffXspiceNetlist(c, nodeFor, vhi, lines, spiceBranchName, opts = {}) {
    const th = xspiceLogicThresholds(vhi);
    const srWired = opts.srWired || {};
    const nD = nodeFor(`${c.id}#0`);
    const nClk = nodeFor(`${c.id}#1`);
    const nQ = nodeFor(`${c.id}#2`);
    const nQbar = nodeFor(`${c.id}#3`);
    const nSet = nodeFor(`${c.id}#4`);
    const nReset = nodeFor(`${c.id}#5`);

    const ndData = nodeFor(`${c.id}#__xd_d`);
    const ndClk = nodeFor(`${c.id}#__xd_clk`);
    const ndQ = nodeFor(`${c.id}#__xd_q`);
    const ndQbar = nodeFor(`${c.id}#__xd_qbar`);

    // Seuils mi-rail pour Set/Reset (niveaux logiques 0…Vhi) : actifs à l'état haut (1).
    const v = vhi > 0 ? vhi : 5;
    const srLow = 0.4 * v;
    const srHigh = 0.6 * v;

    const rippleClk = !!opts.rippleClockFromPrevQ;
    let nClkAdc = nClk;
    if (rippleClk) {
        nClkAdc = nodeFor(`${c.id}#__xa_clkinv`);
        lines.push(
            `${spiceBranchName("B", c.id)}_clkinv ${nClkAdc} 0 V = { ${v} - V(${nClk}) }`
        );
    }

    // Entrées Data / Clock : analogique -> numérique. Data passe toujours par un pont
    // (même si D est relié à /Q) : la rétroaction traverse alors les délais dac+adc,
    // ce qui casse la boucle algébrique numérique (sinon la sortie q reste UNKNOWN).
    lines.push(`${spiceBranchName("A", c.id)}_adcd [${nD}] [${ndData}] ${c.id}_m_adcio`);
    lines.push(`${spiceBranchName("A", c.id)}_adcc [${nClkAdc}] [${ndClk}] ${c.id}_m_adcio`);
    lines.push(
        `.model ${c.id}_m_adcio adc_bridge(in_low=${th.inLow} in_high=${th.inHigh})`
    );

    // Set / Reset asynchrones. Si une broche n'est PAS câblée, on ne la tire pas par une
    // simple résistance (un nœud haute impédance reste « UNKNOWN » côté adc_bridge et
    // contamine la sortie Q). On la relie à un nœud numérique ZÉRO franc, issu d'une
    // source 0 V dédiée -> adc : état logique bas garanti dès t=0.
    lines.push(`.model ${c.id}_m_adcsr adc_bridge(in_low=${srLow} in_high=${srHigh})`);
    let ndZero = null;
    const zeroNode = () => {
        if (ndZero) return ndZero;
        const nZa = nodeFor(`${c.id}#__xa_zero`);
        ndZero = nodeFor(`${c.id}#__xd_zero`);
        lines.push(`${spiceBranchName("V", c.id)}_xz ${nZa} 0 DC 0`);
        lines.push(`${spiceBranchName("A", c.id)}_adcz [${nZa}] [${ndZero}] ${c.id}_m_adcsr`);
        return ndZero;
    };

    let ndSet;
    if (srWired.set) {
        ndSet = nodeFor(`${c.id}#__xd_set`);
        lines.push(`${spiceBranchName("A", c.id)}_adcs [${nSet}] [${ndSet}] ${c.id}_m_adcsr`);
    } else {
        ndSet = zeroNode();
    }

    let ndRst;
    if (srWired.reset) {
        ndRst = nodeFor(`${c.id}#__xd_rst`);
        lines.push(`${spiceBranchName("A", c.id)}_adcr [${nReset}] [${ndRst}] ${c.id}_m_adcsr`);
    } else {
        ndRst = zeroNode();
    }

    const mname = dffModelName(c.id);
    lines.push(
        `.model ${mname} d_dff(clk_delay=2e-9 set_delay=2e-9 reset_delay=2e-9 ic=0 rise_delay=2e-9 fall_delay=2e-9)`
    );

    // d_dff : ports scalaires (data clk set reset out Nout), sans crochets [ ].
    lines.push(
        `${spiceBranchName("A", c.id)}_dff ${ndData} ${ndClk} ${ndSet} ${ndRst} ${ndQ} ${ndQbar} ${mname}`
    );

    // Sorties numériques -> analogique.
    lines.push(`${spiceBranchName("A", c.id)}_dacq [${ndQ}] [${nQ}] ${c.id}_m_dac`);
    lines.push(`${spiceBranchName("A", c.id)}_dacqb [${ndQbar}] [${nQbar}] ${c.id}_m_dac`);
    lines.push(
        `.model ${c.id}_m_dac dac_bridge(out_low=${th.outLow} out_high=${th.outHigh} t_rise=2e-9 t_fall=2e-9)`
    );
}

export function logicDffXspiceInternalNodeKeys(c, opts = {}) {
    if (!c?.id) return [];
    const keys = [
        `${c.id}#__xd_d`,
        `${c.id}#__xd_clk`,
        `${c.id}#__xd_set`,
        `${c.id}#__xd_rst`,
        `${c.id}#__xd_q`,
        `${c.id}#__xd_qbar`,
        `${c.id}#__xa_zero`,
        `${c.id}#__xd_zero`,
    ];
    if (opts.rippleClockFromPrevQ) keys.push(`${c.id}#__xa_clkinv`);
    return keys;
}

function jkffModelName(id) {
    return `xjkff_${String(id).replace(/[^a-zA-Z0-9_]/g, "_")}`;
}

/**
 * Bascule JK XSPICE : broches analogiques via ponts ; cœur numérique d_jkff.
 * Ports : j k clk set reset out Nout
 */
export function appendLogicJkXspiceNetlist(c, nodeFor, vhi, lines, spiceBranchName, opts = {}) {
    const th = xspiceLogicThresholds(vhi);
    const srWired = opts.srWired || {};
    const nJ = nodeFor(`${c.id}#0`);
    const nK = nodeFor(`${c.id}#1`);
    const nClk = nodeFor(`${c.id}#2`);
    const nQ = nodeFor(`${c.id}#3`);
    const nQbar = nodeFor(`${c.id}#4`);
    const nSet = nodeFor(`${c.id}#5`);
    const nReset = nodeFor(`${c.id}#6`);

    const ndJ = nodeFor(`${c.id}#__xd_j`);
    const ndK = nodeFor(`${c.id}#__xd_k`);
    const ndClk = nodeFor(`${c.id}#__xd_clk`);
    const ndQ = nodeFor(`${c.id}#__xd_q`);
    const ndQbar = nodeFor(`${c.id}#__xd_qbar`);

    const v = vhi > 0 ? vhi : 5;
    const srLow = 0.4 * v;
    const srHigh = 0.6 * v;

    const rippleClk = !!opts.rippleClockFromPrevQ;
    let nClkAdc = nClk;
    if (rippleClk) {
        nClkAdc = nodeFor(`${c.id}#__xa_clkinv`);
        lines.push(
            `${spiceBranchName("B", c.id)}_clkinv ${nClkAdc} 0 V = { ${v} - V(${nClk}) }`
        );
    }

    lines.push(`${spiceBranchName("A", c.id)}_adcj [${nJ}] [${ndJ}] ${c.id}_m_adcio`);
    lines.push(`${spiceBranchName("A", c.id)}_adck [${nK}] [${ndK}] ${c.id}_m_adcio`);
    lines.push(`${spiceBranchName("A", c.id)}_adcc [${nClkAdc}] [${ndClk}] ${c.id}_m_adcio`);
    lines.push(
        `.model ${c.id}_m_adcio adc_bridge(in_low=${th.inLow} in_high=${th.inHigh})`
    );

    lines.push(`.model ${c.id}_m_adcsr adc_bridge(in_low=${srLow} in_high=${srHigh})`);
    let ndZero = null;
    const zeroNode = () => {
        if (ndZero) return ndZero;
        const nZa = nodeFor(`${c.id}#__xa_zero`);
        ndZero = nodeFor(`${c.id}#__xd_zero`);
        lines.push(`${spiceBranchName("V", c.id)}_xz ${nZa} 0 DC 0`);
        lines.push(`${spiceBranchName("A", c.id)}_adcz [${nZa}] [${ndZero}] ${c.id}_m_adcsr`);
        return ndZero;
    };

    let ndSet;
    if (srWired.set) {
        ndSet = nodeFor(`${c.id}#__xd_set`);
        lines.push(`${spiceBranchName("A", c.id)}_adcs [${nSet}] [${ndSet}] ${c.id}_m_adcsr`);
    } else {
        ndSet = zeroNode();
    }

    let ndRst;
    if (srWired.reset) {
        ndRst = nodeFor(`${c.id}#__xd_rst`);
        lines.push(`${spiceBranchName("A", c.id)}_adcr [${nReset}] [${ndRst}] ${c.id}_m_adcsr`);
    } else {
        ndRst = zeroNode();
    }

    const mname = jkffModelName(c.id);
    lines.push(
        `.model ${mname} d_jkff(clk_delay=2e-9 set_delay=2e-9 reset_delay=2e-9 ic=0 rise_delay=2e-9 fall_delay=2e-9)`
    );
    lines.push(
        `${spiceBranchName("A", c.id)}_jk ${ndJ} ${ndK} ${ndClk} ${ndSet} ${ndRst} ${ndQ} ${ndQbar} ${mname}`
    );

    lines.push(`${spiceBranchName("A", c.id)}_dacq [${ndQ}] [${nQ}] ${c.id}_m_dac`);
    lines.push(`${spiceBranchName("A", c.id)}_dacqb [${ndQbar}] [${nQbar}] ${c.id}_m_dac`);
    lines.push(
        `.model ${c.id}_m_dac dac_bridge(out_low=${th.outLow} out_high=${th.outHigh} t_rise=2e-9 t_fall=2e-9)`
    );
}

export function logicJkXspiceInternalNodeKeys(c, opts = {}) {
    if (!c?.id) return [];
    const keys = [
        `${c.id}#__xd_j`,
        `${c.id}#__xd_k`,
        `${c.id}#__xd_clk`,
        `${c.id}#__xd_set`,
        `${c.id}#__xd_rst`,
        `${c.id}#__xd_q`,
        `${c.id}#__xd_qbar`,
        `${c.id}#__xa_zero`,
        `${c.id}#__xd_zero`,
    ];
    if (opts.rippleClockFromPrevQ) keys.push(`${c.id}#__xa_clkinv`);
    return keys;
}
