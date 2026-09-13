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

/** Résistances + associations (série / parallèle) — pas de code couleurs. */
const resistances = [
    q("L'unité de la résistance est :", ["Ohm (Ω)", "Volt (V)", "Ampère (A)"]),
    q("Résistances en série : Rtot = ?", ["R1 + R2 + …", "(R1×R2)/(R1+R2)", "min(R1, R2)"]),
    q("Deux résistances de 100 Ω en série :", ["200 Ω", "50 Ω", "100 Ω"]),
    q("Deux résistances égales R en parallèle :", ["R/2", "2R", "R"]),
    q("100 Ω // 100 Ω = ?", ["50 Ω", "200 Ω", "100 Ω"]),
    q("En parallèle, Rtot est toujours :", ["Plus petite que la plus petite résistance", "Plus grande que la plus grande", "Égale à la moyenne"]),
    q("Formule de deux résistances en parallèle :", ["Rtot = (R1×R2)/(R1+R2)", "Rtot = R1 + R2", "Rtot = R1 − R2"]),
    q("Trois résistances de 30 Ω en série :", ["90 Ω", "10 Ω", "30 Ω"]),
    q("En série, le courant est :", ["Le même dans chaque résistance", "Plus fort dans la plus petite R", "Plus fort dans la plus grande R"]),
    q("En parallèle, la tension aux bornes de chaque branche est :", ["La même", "Plus forte sur la plus petite R", "Plus forte sur la plus grande R"]),
    q("220 Ω et 330 Ω en série :", ["550 Ω", "110 Ω", "72,6 Ω"]),
    q("10 Ω, 10 Ω et 10 Ω en parallèle :", ["≈ 3,33 Ω", "30 Ω", "10 Ω"]),
    q("Association : (100 Ω // 100 Ω) puis + 50 Ω en série :", ["100 Ω", "150 Ω", "50 Ω"]),
    q("Deux résistances 470 Ω en série :", ["940 Ω", "235 Ω", "470 Ω"]),
    q("Deux résistances 470 Ω en parallèle :", ["235 Ω", "940 Ω", "470 Ω"]),
    q("4 × 100 Ω toutes en série :", ["400 Ω", "25 Ω", "100 Ω"]),
    q("4 × 100 Ω toutes en parallèle :", ["25 Ω", "400 Ω", "100 Ω"]),
    q("Pour limiter le courant d'une LED, on place une résistance :", ["En série avec la LED", "En parallèle avec la LED", "Entre Vcc et la masse uniquement"]),
    q("Dans un circuit série, la plus grande chute de tension est sur :", ["La plus grande résistance", "La plus petite résistance", "Toujours la première"]),
    q("Pont diviseur R1 = R2, entrée 10 V → tension milieu :", ["5 V", "10 V", "0 V"]),
    q("Une résistance de puissance 1/4 W peut dissiper au max :", ["0,25 W", "1 W", "4 W"]),
    q("Si deux résistances en série sont parcourues par 2 A, I dans chacune :", ["2 A", "1 A", "4 A"]),
];

/** Loi d'Ohm, courant, tension, puissance. */
const ohm = [
    q("La loi d'Ohm s'écrit :", ["U = R × I", "U = R / I", "U = R + I"]),
    q("Formule équivalente : I = ?", ["U / R", "U × R", "R / U"]),
    q("Formule équivalente : R = ?", ["U / I", "U × I", "I / U"]),
    q("L'intensité I s'exprime en :", ["Ampères (A)", "Volts (V)", "Watts (W)"]),
    q("La tension U s'exprime en :", ["Volts (V)", "Ohms (Ω)", "Watts (W)"]),
    q("La puissance P s'exprime en :", ["Watts (W)", "Volts (V)", "Ampères (A)"]),
    q("Si U = 12 V et R = 4 Ω, alors I = ?", ["3 A", "48 A", "0,33 A"]),
    q("Si I = 2 A et R = 10 Ω, alors U = ?", ["20 V", "5 V", "12 V"]),
    q("Si U = 9 V et I = 3 A, alors R = ?", ["3 Ω", "27 Ω", "0,33 Ω"]),
    q("La puissance électrique vaut souvent :", ["P = U × I", "P = U / I", "P = U + I"]),
    q("On peut aussi écrire P = ?", ["R × I²", "R / I²", "R + I²"]),
    q("Autre expression : P = ?", ["U² / R", "U² × R", "U / R²"]),
    q("Avec U = 5 V et I = 0,1 A, P = ?", ["0,5 W", "50 W", "5 W"]),
    q("U = 24 V, I = 0,5 A → R = ?", ["48 Ω", "12 Ω", "24,5 Ω"]),
    q("R = 220 Ω, I = 20 mA → U = ?", ["4,4 V", "4400 V", "0,044 V"]),
    q("U = 3,3 V, R = 330 Ω → I ≈ ?", ["10 mA", "1 A", "100 mA"]),
    q("Sous 12 V, R = 1,2 kΩ → I = ?", ["10 mA", "100 mA", "1,2 A"]),
    q("P = 2 W sous 10 V → I = ?", ["0,2 A", "20 A", "5 A"]),
    q("Si R augmente et U est fixe, I :", ["Diminue", "Augmente", "Reste constant"]),
    q("Si on double R en gardant U constant, P :", ["Est divisée par 2", "Est multipliée par 2", "Ne change pas"]),
    q("P = U² / R : si U double et R fixe, P :", ["Est multipliée par 4", "Est multipliée par 2", "Ne change pas"]),
    q("Un court-circuit correspond idéalement à :", ["R ≈ 0 Ω", "R ≈ ∞", "I = 0"]),
    q("Un circuit ouvert correspond idéalement à :", ["R ≈ ∞ (I ≈ 0)", "R = 0", "U = 0"]),
    q("Un ampèremètre se branche :", ["En série", "En parallèle", "À la masse uniquement"]),
    q("Un voltmètre se branche :", ["En parallèle", "En série", "Sur le neutre uniquement"]),
    q("Sur une résistance, la chute de tension est :", ["Proportionnelle au courant", "Indépendante du courant", "Toujours 5 V"]),
];

/** Conversions de base + bit, octet, MSB. */
const binaire = [
    q("Combien de symboles utilise le système binaire ?", ["2 (0 et 1)", "10 (0 à 9)", "16 (0 à F)"]),
    q("La base 16 utilise les chiffres :", ["0–9 et A–F", "0–9 seulement", "0 et 1 seulement"]),
    q("Qu'est-ce qu'un bit ?", ["La plus petite unité d'information (0 ou 1)", "Un groupe de 8 chiffres", "Une unité de tension"]),
    q("Un octet contient :", ["8 bits", "4 bits", "16 bits"]),
    q("Un nibble (quartet) contient :", ["4 bits", "8 bits", "2 bits"]),
    q("MSB signifie :", ["Bit de poids fort (Most Significant Bit)", "Bit de poids faible", "Octet mémoire"]),
    q("LSB signifie :", ["Bit de poids faible (Least Significant Bit)", "Bit de poids fort", "Longueur du mot"]),
    q("Dans 1000₂ (4 bits), le MSB vaut :", ["8", "1", "4"]),
    q("Dans 10000000₂ (8 bits), le MSB vaut :", ["128", "1", "64"]),
    q("Le poids du bit b0 est :", ["1", "2", "0"]),
    q("Le poids du bit b1 est :", ["2", "1", "4"]),
    q("Le poids du bit b2 est :", ["4", "2", "8"]),
    q("Le poids du bit b3 est :", ["8", "4", "16"]),
    q("Combien de valeurs non signées sur 4 bits ?", ["16 (0 à 15)", "8 (0 à 7)", "4"]),
    q("Combien de valeurs non signées sur 8 bits ?", ["256 (0 à 255)", "128", "8"]),
    q("Convertir 13 (décimal) en binaire :", ["1101", "1011", "1110"]),
    q("Convertir 1010₂ en décimal :", ["10", "8", "12"]),
    q("Convertir 0110₂ en décimal :", ["6", "4", "12"]),
    q("Convertir 1111₂ en décimal :", ["15", "16", "14"]),
    q("Convertir 9 (décimal) en binaire :", ["1001", "1010", "0110"]),
    q("Convertir 5 (décimal) en binaire :", ["101", "100", "111"]),
    q("Convertir 42 (décimal) en binaire :", ["101010", "110010", "101100"]),
    q("Convertir 10000000₂ en décimal :", ["128", "64", "256"]),
    q("Convertir 255 (décimal) en binaire :", ["11111111", "11111110", "10000000"]),
    q("Convertir 00001111₂ en décimal :", ["15", "16", "240"]),
    q("Convertir A₁₆ en décimal :", ["10", "11", "16"]),
    q("Convertir 15 (décimal) en hexadécimal :", ["F", "E", "10"]),
    q("Convertir FF₁₆ en décimal :", ["255", "256", "240"]),
    q("Convertir 2A₁₆ en décimal :", ["42", "32", "40"]),
    q("Convertir B₁₆ en binaire :", ["1011", "1100", "1010"]),
    q("Convertir C₁₆ en décimal :", ["12", "11", "13"]),
    q("Convertir 10₁₆ en décimal :", ["16", "10", "1"]),
    q("Convertir 16 (décimal) en hexadécimal :", ["10", "16", "F"]),
    q("Convertir 0F₁₆ en binaire :", ["00001111", "11110000", "00001010"]),
    q("Convertir F0₁₆ en binaire :", ["11110000", "00001111", "11111111"]),
    q("Convertir 100 (décimal) en hexadécimal :", ["64", "100", "6A"]),
    q("Combien d'octets dans 32 bits ?", ["4", "8", "32"]),
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
    // 20 questions : 5 + 5 + 5 + 5 (tous les thèmes dans chaque quiz)
    const quotas = [
        { resistances: 5, ohm: 5, binaire: 5, multiples: 5 },
        { resistances: 5, ohm: 5, binaire: 6, multiples: 4 },
        { resistances: 6, ohm: 4, binaire: 5, multiples: 5 },
        { resistances: 4, ohm: 6, binaire: 5, multiples: 5 },
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
