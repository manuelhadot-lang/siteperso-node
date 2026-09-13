/**
 * 4 quiz mélangés STI2D — thèmes uniquement :
 * résistances, associations, loi d'Ohm, I/U/P,
 * conversions binaires, bit/octet/MSB,
 * multiples et sous-multiples (analogique + numérique).
 * node scripts/seed-quizzes-elec-binaire.mjs
 */
import { readFileSync, writeFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

function mulberry32(seed) {
    return function () {
        let t = (seed += 0x6d2b79f5);
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

function shuffle(arr, rand) {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(rand() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
}

function q(text, answers, correct = 0) {
    return { text, answers, correct, image: null, _rawCorrect: correct };
}

function finalizeQuestion(item, rand) {
    const items = item.answers.map((a, i) => ({ a, i }));
    const shuffled = shuffle(items, rand);
    return {
        text: item.text,
        answers: shuffled.map((x) => x.a),
        correct: shuffled.findIndex((x) => x.i === item._rawCorrect),
        image: null,
    };
}

/** Résistances + associations — y compris calculs multi-étapes. */
const resistances = [
    q("L'unité de la résistance est :", ["Ohm (Ω)", "Volt (V)", "Ampère (A)"]),
    q("Résistances en série : Rtot = ?", ["R1 + R2 + …", "(R1×R2)/(R1+R2)", "min(R1, R2)"]),
    q("Formule de deux résistances en parallèle :", ["Rtot = (R1×R2)/(R1+R2)", "Rtot = R1 + R2", "Rtot = R1 − R2"]),
    q("Deux résistances de 100 Ω en série :", ["200 Ω", "50 Ω", "100 Ω"]),
    q("100 Ω // 100 Ω = ?", ["50 Ω", "200 Ω", "100 Ω"]),
    q("220 Ω et 330 Ω en série :", ["550 Ω", "110 Ω", "72,6 Ω"]),
    q("Deux résistances 470 Ω en parallèle :", ["235 Ω", "940 Ω", "470 Ω"]),
    q("10 Ω, 10 Ω et 10 Ω en parallèle :", ["≈ 3,33 Ω", "30 Ω", "10 Ω"]),
    q("4 × 100 Ω toutes en série :", ["400 Ω", "25 Ω", "100 Ω"]),
    q("4 × 100 Ω toutes en parallèle :", ["25 Ω", "400 Ω", "100 Ω"]),
    q("Association : (100 Ω // 100 Ω) puis + 50 Ω en série :", ["100 Ω", "150 Ω", "50 Ω"]),
    q("En série, le courant est :", ["Le même dans chaque résistance", "Plus fort dans la plus petite R", "Plus fort dans la plus grande R"]),
    q("En parallèle, la tension aux bornes de chaque branche est :", ["La même", "Plus forte sur la plus petite R", "Plus forte sur la plus grande R"]),
    q("Pour limiter le courant d'une LED, on place une résistance :", ["En série avec la LED", "En parallèle avec la LED", "Entre Vcc et la masse uniquement"]),
    q("Une résistance de puissance 1/4 W peut dissiper au max :", ["0,25 W", "1 W", "4 W"]),
    // --- calculs plus complexes ---
    q("R = (220 Ω // 330 Ω) : Rtot ≈ ?", ["132 Ω", "550 Ω", "110 Ω"]),
    q("Circuit : 100 Ω en série avec (200 Ω // 200 Ω). Rtot = ?", ["200 Ω", "300 Ω", "150 Ω"]),
    q("Circuit : (1 kΩ // 1 kΩ) puis + 500 Ω. Rtot = ?", ["1 kΩ", "1,5 kΩ", "2 kΩ"]),
    q("Trois résistances 120 Ω, 180 Ω, 300 Ω en série. Rtot = ?", ["600 Ω", "120 Ω", "40 Ω"]),
    q("Pont diviseur : R1 = 1 kΩ (haut), R2 = 3 kΩ (bas), U = 12 V. Tension sur R2 = ?", ["9 V", "3 V", "6 V"]),
    q("Pont diviseur : R1 = 2 kΩ, R2 = 2 kΩ, U = 5 V. Tension milieu = ?", ["2,5 V", "5 V", "1 V"]),
    q("Pont diviseur : R1 = 4,7 kΩ, R2 = 4,7 kΩ, U = 9 V. Tension milieu ≈ ?", ["4,5 V", "9 V", "2,25 V"]),
    q("LED 2 V, alimentation 5 V, I souhaité 10 mA → R ≈ ?", ["300 Ω", "500 Ω", "200 Ω"]),
    q("LED 2 V, alimentation 12 V, I = 20 mA → R = ?", ["500 Ω", "600 Ω", "100 Ω"]),
    q("Sous 12 V : R1 = 100 Ω et R2 = 200 Ω en série. U sur R2 = ?", ["8 V", "4 V", "6 V"]),
    q("Sous 12 V : R1 = 100 Ω et R2 = 200 Ω en série. I total = ?", ["40 mA", "60 mA", "120 mA"]),
    q("Deux branches en parallèle sous 10 V : 100 Ω et 200 Ω. I dans 100 Ω = ?", ["100 mA", "50 mA", "150 mA"]),
    q("Deux branches en parallèle sous 10 V : 100 Ω et 200 Ω. I total = ?", ["150 mA", "100 mA", "50 mA"]),
    q("(47 Ω // 47 Ω) + 47 Ω en série = ?", ["70,5 Ω", "141 Ω", "47 Ω"]),
    q("R1 = 1,2 kΩ // R2 = 1,8 kΩ ≈ ?", ["720 Ω", "3 kΩ", "600 Ω"]),
    q("Mixte : 50 Ω en série avec (150 Ω // 75 Ω). Rtot = ?", ["100 Ω", "125 Ω", "75 Ω"]),
];

/** Loi d'Ohm, I, U, P — y compris calculs multi-étapes / unités. */
const ohm = [
    q("La loi d'Ohm s'écrit :", ["U = R × I", "U = R / I", "U = R + I"]),
    q("Formule équivalente : I = ?", ["U / R", "U × R", "R / U"]),
    q("Formule équivalente : R = ?", ["U / I", "U × I", "I / U"]),
    q("L'intensité I s'exprime en :", ["Ampères (A)", "Volts (V)", "Watts (W)"]),
    q("La tension U s'exprime en :", ["Volts (V)", "Ohms (Ω)", "Watts (W)"]),
    q("La puissance P s'exprime en :", ["Watts (W)", "Volts (V)", "Ampères (A)"]),
    q("La puissance électrique vaut souvent :", ["P = U × I", "P = U / I", "P = U + I"]),
    q("On peut aussi écrire P = ?", ["R × I²", "R / I²", "R + I²"]),
    q("Autre expression : P = ?", ["U² / R", "U² × R", "U / R²"]),
    q("Un ampèremètre se branche :", ["En série", "En parallèle", "À la masse uniquement"]),
    q("Un voltmètre se branche :", ["En parallèle", "En série", "Sur le neutre uniquement"]),
    q("Si R augmente et U est fixe, I :", ["Diminue", "Augmente", "Reste constant"]),
    // --- calculs simples ---
    q("Si U = 12 V et R = 4 Ω, alors I = ?", ["3 A", "48 A", "0,33 A"]),
    q("Si I = 2 A et R = 10 Ω, alors U = ?", ["20 V", "5 V", "12 V"]),
    q("Si U = 9 V et I = 3 A, alors R = ?", ["3 Ω", "27 Ω", "0,33 Ω"]),
    q("Avec U = 5 V et I = 0,1 A, P = ?", ["0,5 W", "50 W", "5 W"]),
    // --- calculs plus complexes ---
    q("U = 24 V, I = 0,5 A → R = ?", ["48 Ω", "12 Ω", "24,5 Ω"]),
    q("R = 220 Ω, I = 20 mA → U = ?", ["4,4 V", "4400 V", "0,044 V"]),
    q("U = 3,3 V, R = 330 Ω → I ≈ ?", ["10 mA", "1 A", "100 mA"]),
    q("Sous 12 V, R = 1,2 kΩ → I = ?", ["10 mA", "100 mA", "1,2 A"]),
    q("P = 2 W sous 10 V → I = ?", ["0,2 A", "20 A", "5 A"]),
    q("R = 47 Ω sous U = 4,7 V → I = ?", ["100 mA", "10 mA", "1 A"]),
    q("I = 25 mA, R = 680 Ω → U = ?", ["17 V", "1,7 V", "27,2 V"]),
    q("U = 15 V, I = 150 mA → R = ?", ["100 Ω", "10 Ω", "1 kΩ"]),
    q("P = U × I : U = 230 V, I = 0,5 A → P = ?", ["115 W", "460 W", "1150 W"]),
    q("P = R × I² : R = 8 Ω, I = 2 A → P = ?", ["32 W", "16 W", "4 W"]),
    q("P = U² / R : U = 12 V, R = 24 Ω → P = ?", ["6 W", "288 W", "2 W"]),
    q("Une résistance 100 Ω sous 10 V dissipe P = ?", ["1 W", "10 W", "0,1 W"]),
    q("I = 40 mA dans 560 Ω → P ≈ ?", ["0,90 W", "22,4 W", "0,022 W"]),
    q("Alim 5 V, R = 220 Ω → I ≈ ? puis P ≈ ?", ["≈ 23 mA et ≈ 0,11 W", "≈ 23 mA et ≈ 1,1 W", "≈ 230 mA et ≈ 1,1 W"]),
    q("On veut P = 0,25 W sous 5 V → R = U²/P = ?", ["100 Ω", "20 Ω", "250 Ω"]),
    q("Si on double U en gardant R constant, P :", ["Est multipliée par 4", "Est multipliée par 2", "Ne change pas"]),
    q("Si on double R en gardant U constant, P :", ["Est divisée par 2", "Est multipliée par 2", "Ne change pas"]),
    q("U = 9 V, on veut I = 15 mA → R = ?", ["600 Ω", "135 Ω", "60 Ω"]),
    q("Batterie 3,7 V, charge 180 Ω → I ≈ ?", ["≈ 20,6 mA", "≈ 2 mA", "≈ 666 mA"]),
];

/** Binaire : conversions + calculs de valeur d’un mot (poids des bits), 8 bits. */
const binaire = [
    q("Combien de symboles utilise le système binaire ?", ["2 (0 et 1)", "10 (0 à 9)", "16 (0 à F)"]),
    q("La base 16 utilise les chiffres :", ["0–9 et A–F", "0–9 seulement", "0 et 1 seulement"]),
    q("Qu'est-ce qu'un bit ?", ["La plus petite unité d'information (0 ou 1)", "Un groupe de 8 chiffres", "Une unité de tension"]),
    q("Un octet contient :", ["8 bits", "4 bits", "16 bits"]),
    q("Un nibble (quartet) contient :", ["4 bits", "8 bits", "2 bits"]),
    q("MSB signifie :", ["Bit de poids fort (Most Significant Bit)", "Bit de poids faible", "Octet mémoire"]),
    q("LSB signifie :", ["Bit de poids faible (Least Significant Bit)", "Bit de poids fort", "Longueur du mot"]),
    q("Le poids du bit b0 est :", ["1", "2", "0"]),
    q("Le poids du bit b1 est :", ["2", "1", "4"]),
    q("Le poids du bit b2 est :", ["4", "2", "8"]),
    q("Le poids du bit b3 est :", ["8", "4", "16"]),
    q("Le poids du bit b7 (octet) est :", ["128", "64", "255"]),
    q("Combien de valeurs non signées sur 8 bits ?", ["256 (0 à 255)", "128", "8"]),
    q("Sur 8 bits non signés, la plus grande valeur est :", ["255", "128", "256"]),
    q("Combien d'octets dans 32 bits ?", ["4", "8", "32"]),
    // conversions classiques
    q("Convertir 13 (décimal) en binaire :", ["1101", "1011", "1110"]),
    q("Convertir 1010₂ en décimal :", ["10", "8", "12"]),
    q("Convertir 42 (décimal) en binaire 8 bits :", ["00101010", "00110010", "00101100"]),
    q("Convertir 255 (décimal) en binaire 8 bits :", ["11111111", "11111110", "10000000"]),
    q("Convertir 10000000₂ (8 bits) en décimal :", ["128", "64", "256"]),
    q("Convertir 00001111₂ (8 bits) en décimal :", ["15", "16", "240"]),
    q("Convertir 200 (décimal) en binaire 8 bits :", ["11001000", "1100100", "10101000"]),
    q("Convertir 75 (décimal) en binaire 8 bits :", ["01001011", "01001100", "01001010"]),
    q("Convertir 150 (décimal) en binaire 8 bits :", ["10010110", "10010000", "10100000"]),
    q("Convertir 11001100₂ (8 bits) en décimal :", ["204", "192", "216"]),
    q("Convertir FF₁₆ (8 bits) en décimal :", ["255", "256", "240"]),
    q("Convertir 2A₁₆ (8 bits) en décimal :", ["42", "32", "40"]),
    q("Convertir A5₁₆ en binaire 8 bits :", ["10100101", "10100110", "01011010"]),
    q("Convertir 3C₁₆ en binaire 8 bits :", ["00111100", "00110000", "11000011"]),
    q("Convertir 7F₁₆ (8 bits) en décimal :", ["127", "128", "255"]),
    q("Convertir 200 (décimal) en hexadécimal :", ["C8", "C0", "D0"]),
    // --- calculs de mots (somme des poids) ---
    q("Mot 8 bits : seuls b7 et b0 à 1 → valeur = ?", ["129", "128", "127"]),
    q("Mot 8 bits : b7, b6 et b5 à 1 (11100000₂) → ?", ["224", "192", "240"]),
    q("Mot 8 bits : b3+b2+b1+b0 à 1 (00001111₂) → ?", ["15", "16", "240"]),
    q("Mot 8 bits : b7+b3 à 1 (10001000₂) → ?", ["136", "128", "8"]),
    q("Mot 8 bits : b6+b5+b1 (01100010₂) → ?", ["98", "100", "66"]),
    q("Mot 8 bits : b4+b2+b0 (00010101₂) → ?", ["21", "20", "42"]),
    q("Mot 8 bits : tous les bits pairs b0,b2,b4,b6 → ?", ["85", "170", "15"]),
    q("Mot 8 bits : tous les bits impairs b1,b3,b5,b7 → ?", ["170", "85", "255"]),
    q("Quel mot 8 bits vaut 100 ?", ["01100100₂", "1100100₂ (7 bits)", "01100000₂"]),
    q("Quel mot 8 bits vaut 200 ?", ["11001000₂", "1100100₂", "10101000₂"]),
    q("Le nibble de poids fort de 10110100₂ est :", ["1011₂ (= 11)", "0100₂ (= 4)", "1100₂"]),
    q("Le nibble de poids faible de 10110100₂ est :", ["0100₂ (= 4)", "1011₂ (= 11)", "1100₂"]),
    q("Si un octet vaut 0xC3, sa valeur décimale est :", ["195", "203", "163"]),
    q("Si un octet vaut 0x5A, sa valeur décimale est :", ["90", "95", "80"]),
    q("Octet 11011011₂ en hexadécimal :", ["DB", "BD", "D3"]),
    q("Octet 01101110₂ en hexadécimal :", ["6E", "E6", "76"]),
    q("Valeur de b7+b5+b2+b0 (10100101₂) :", ["165", "160", "37"]),
    q("Valeur de b6+b4+b3 (01011000₂) :", ["88", "92", "24"]),
    q("Combien vaut le mot dont seuls b7 à b4 sont à 1 ?", ["240", "15", "255"]),
    q("Convertir 0xA0 (8 bits) en décimal :", ["160", "10", "170"]),
];

/** Multiples et sous-multiples — électrique (analogique) + numérique. */
const multiples = [
    q("1 kΩ = ?", ["1000 Ω", "100 Ω", "0,001 Ω"]),
    q("1 MΩ = ?", ["1 000 000 Ω", "1000 Ω", "0,001 Ω"]),
    q("1 mA = ?", ["0,001 A", "0,01 A", "1000 A"]),
    q("10 mA = ?", ["0,01 A", "0,1 A", "10 A"]),
    q("1 µA = ?", ["10⁻⁶ A", "10⁻³ A", "10⁻⁹ A"]),
    q("1 kV = ?", ["1000 V", "0,001 V", "100 V"]),
    q("1 mV = ?", ["0,001 V", "1000 V", "0,01 V"]),
    q("Le préfixe kilo (k) signifie :", ["× 10³", "× 10⁶", "× 10⁻³"]),
    q("Le préfixe méga (M) signifie :", ["× 10⁶", "× 10³", "× 10⁻⁶"]),
    q("Le préfixe milli (m) signifie :", ["× 10⁻³", "× 10³", "× 10⁻⁶"]),
    q("Le préfixe micro (µ) signifie :", ["× 10⁻⁶", "× 10⁻³", "× 10⁶"]),
    q("Le préfixe nano (n) signifie :", ["× 10⁻⁹", "× 10⁻⁶", "× 10⁻³"]),
    q("Le préfixe giga (G) signifie :", ["× 10⁹", "× 10⁶", "× 10³"]),
    q("2200 Ω = ?", ["2,2 kΩ", "2,2 MΩ", "0,22 kΩ"]),
    q("0,47 kΩ = ?", ["470 Ω", "47 Ω", "4700 Ω"]),
    q("5 V = ? mV", ["5000 mV", "5 mV", "0,005 mV"]),
    q("1500 mA = ?", ["1,5 A", "0,15 A", "15 A"]),
    q("En informatique, 1 octet = ?", ["8 bits", "1000 bits", "1024 bits"]),
    q("1 kio (kibioctet) vaut :", ["1024 octets", "1000 octets", "1000 bits"]),
    q("1 Mio (mébioctet) vaut :", ["1024 kio", "1000 ko", "1024 octets"]),
    q("Attention : 1 ko (décimal) vaut souvent :", ["1000 octets", "1024 octets", "8 bits"]),
    q("Combien de bits dans 2 octets ?", ["16", "8", "2"]),
    q("Combien d'octets dans 64 bits ?", ["8", "4", "16"]),
    q("1 Go (giga-octet, usage courant) ≈ ?", ["10⁹ octets", "10⁶ octets", "10³ octets"]),
    q("Une capacité de 4700 µF = ?", ["4,7 mF", "4,7 nF", "470 mF"]),
    q("1 MHz = ?", ["10⁶ Hz", "10³ Hz", "10⁹ Hz"]),
    q("1 ms = ?", ["10⁻³ s", "10⁻⁶ s", "10³ s"]),
    q("47 kΩ = ? Ω", ["47000 Ω", "470 Ω", "4,7 Ω"]),
];

const FORBIDDEN =
    /couleur|anneau|marron|noir =|rouge =|jaune =|\bAND\b|\bOR\b|\bXOR\b|\bNOT\b|Addition|Soustraction|D[eé]calage|d[eé]cal|d[eé]passement|Compl[eé]ment [aà] 2/i;

function buildMixedQuiz(index, titles, publishedMap) {
    const rand = mulberry32(20260915 + index * 101);
    const pools = {
        resistances: shuffle(resistances, rand),
        ohm: shuffle(ohm, rand),
        binaire: shuffle(binaire, rand),
        multiples: shuffle(multiples, rand),
    };
    // 20 questions — un peu plus de binaire (conversions 8 bits)
    const quotas = [
        { resistances: 5, ohm: 5, binaire: 6, multiples: 4 },
        { resistances: 4, ohm: 5, binaire: 7, multiples: 4 },
        { resistances: 5, ohm: 4, binaire: 6, multiples: 5 },
        { resistances: 4, ohm: 5, binaire: 6, multiples: 5 },
    ][index];

    const picked = [
        ...pools.resistances.slice(0, quotas.resistances),
        ...pools.ohm.slice(0, quotas.ohm),
        ...pools.binaire.slice(0, quotas.binaire),
        ...pools.multiples.slice(0, quotas.multiples),
    ];
    const mixed = shuffle(picked, rand).map((item) => finalizeQuestion(item, rand));
    if (mixed.length !== 20) {
        throw new Error(`Quiz ${index + 1} : ${mixed.length} questions`);
    }
    const id = `quiz_elec_mixte_${index + 1}`;
    return {
        id,
        title: titles[index],
        questions: mixed,
        date: new Date().toISOString().slice(0, 10),
        published: publishedMap[id] === true,
    };
}

const titles = [
    "Éval. n°1 — résistances, Ohm, binaire, multiples",
    "Éval. n°2 — résistances, Ohm, binaire, multiples",
    "Éval. n°3 — résistances, Ohm, binaire, multiples",
    "Éval. n°4 — résistances, Ohm, binaire, multiples",
];

const out = join(root, "quizzes.json");
const publishedMap = {};
if (existsSync(out)) {
    try {
        const prev = JSON.parse(readFileSync(out, "utf8"));
        for (const [id, quiz] of Object.entries(prev || {})) {
            if (quiz && quiz.published === true) publishedMap[id] = true;
        }
    } catch {
        /* ignore */
    }
}

const quizzes = {};
for (let i = 0; i < 4; i++) {
    quizzes[`quiz_elec_mixte_${i + 1}`] = buildMixedQuiz(i, titles, publishedMap);
}

for (const quiz of Object.values(quizzes)) {
    for (const qq of quiz.questions) {
        if (qq.answers.length !== 3 || qq.correct < 0 || qq.correct > 2) {
            throw new Error(`Question invalide dans ${quiz.id}`);
        }
        if (FORBIDDEN.test(qq.text)) {
            throw new Error(`Question hors programme : ${qq.text}`);
        }
    }
}

writeFileSync(out, JSON.stringify(quizzes, null, 2), "utf8");
console.log("OK →", out);
for (const quiz of Object.values(quizzes)) {
    console.log(`- ${quiz.title} : ${quiz.questions.length} Q · published=${quiz.published}`);
}
