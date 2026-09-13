/**
 * Génère 4 quiz mélangés (binaire + loi d'Ohm + résistances) dans quizzes.json
 * node scripts/seed-quizzes-elec-binaire.mjs
 */
import { writeFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

/** Mélange Fisher–Yates déterministe (seed) pour des résultats stables. */
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

const binaire = [
    q("Combien de symboles utilise le système binaire ?", ["2 (0 et 1)", "10 (0 à 9)", "16 (0 à F)"]),
    q("Que vaut le bit de poids fort (MSB) dans un octet 10000000 ?", ["128", "1", "64"]),
    q("Convertir 13 (décimal) en binaire :", ["1101", "1011", "1110"]),
    q("Convertir 1010₂ en décimal :", ["10", "8", "12"]),
    q("Convertir 255 (décimal) en binaire :", ["11111111", "11111110", "10000000"]),
    q("Combien de valeurs différentes peut coder un octet (8 bits) ?", ["256", "255", "8"]),
    q("Convertir A₁₆ en décimal :", ["10", "11", "16"]),
    q("Convertir 15 (décimal) en hexadécimal :", ["F", "E", "10"]),
    q("Convertir FF₁₆ en décimal :", ["255", "256", "240"]),
    q("Convertir 10000000₂ en décimal :", ["128", "64", "256"]),
    q("En hexadécimal, la lettre C correspond à :", ["12", "11", "13"]),
    q("Convertir 42 (décimal) en binaire :", ["101010", "110010", "101100"]),
    q("Convertir 1111₂ en décimal :", ["15", "16", "14"]),
    q("Un nibble correspond à :", ["4 bits", "8 bits", "2 bits"]),
    q("Convertir 2A₁₆ en décimal :", ["42", "32", "40"]),
    q("Convertir 64 (décimal) en binaire :", ["1000000", "100000", "1100000"]),
    q("La base 16 utilise les chiffres :", ["0–9 et A–F", "0–9 seulement", "0 et 1 seulement"]),
    q("Convertir 1100100₂ en décimal :", ["100", "98", "104"]),
    q("Convertir B₁₆ en binaire :", ["1011", "1100", "1010"]),
    q("Combien de bits faut-il au minimum pour coder 0 à 7 ?", ["3", "4", "7"]),
    q("Qu'est-ce qu'un bit ?", ["La plus petite unité d'information (0 ou 1)", "Un groupe de 8 chiffres", "Une unité de tension"]),
    q("Résultat de 1 AND 1 en logique binaire :", ["1", "0", "2"]),
    q("Résultat de 1 OR 0 :", ["1", "0", "Indéterminé"]),
    q("Résultat de NOT 0 :", ["1", "0", "Erreur"]),
    q("Résultat de 1 XOR 1 :", ["0", "1", "2"]),
    q("Addition binaire : 1 + 1 = ?", ["10₂ (soit 0 avec retenue 1)", "2", "11₂"]),
    q("Combien d'octets dans 32 bits ?", ["4", "8", "32"]),
    q("Le poids du bit b2 (en partant de b0) est :", ["4", "2", "8"]),
    q("Décaler à gauche de 1 bit revient souvent à :", ["Multiplier par 2", "Diviser par 2", "Ajouter 1"]),
    q("1010₂ + 0011₂ = ?", ["1101₂", "1110₂", "1001₂"]),
];

const ohm = [
    q("La loi d'Ohm s'écrit :", ["U = R × I", "U = R / I", "U = R + I"]),
    q("L'unité de la résistance est :", ["Ohm (Ω)", "Volt (V)", "Ampère (A)"]),
    q("L'intensité I s'exprime en :", ["Ampères (A)", "Volts (V)", "Watts (W)"]),
    q("La tension U s'exprime en :", ["Volts (V)", "Ohms (Ω)", "Coulombs (C)"]),
    q("Si U = 12 V et R = 4 Ω, alors I = ?", ["3 A", "48 A", "0,33 A"]),
    q("Si I = 2 A et R = 10 Ω, alors U = ?", ["20 V", "5 V", "12 V"]),
    q("Si U = 9 V et I = 3 A, alors R = ?", ["3 Ω", "27 Ω", "0,33 Ω"]),
    q("La puissance électrique P vaut souvent :", ["P = U × I", "P = U / I", "P = U + I"]),
    q("Avec U = 5 V et I = 0,1 A, P = ?", ["0,5 W", "50 W", "5 W"]),
    q("On peut aussi écrire P = ?", ["R × I²", "R / I²", "R + I²"]),
    q("Si R augmente et U est fixe, I :", ["Diminue", "Augmente", "Reste constant"]),
    q("Un court-circuit correspond idéalement à :", ["R ≈ 0 Ω", "R ≈ ∞", "I = 0"]),
    q("Un circuit ouvert correspond idéalement à :", ["R ≈ ∞ (I ≈ 0)", "R = 0", "U = 0"]),
    q("Sur une résistance, la chute de tension est :", ["Proportionnelle au courant", "Indépendante du courant", "Toujours 5 V"]),
    q("U = 24 V, I = 0,5 A → R = ?", ["48 Ω", "12 Ω", "24,5 Ω"]),
    q("R = 220 Ω, I = 20 mA → U = ?", ["4,4 V", "4400 V", "0,044 V"]),
    q("Attention aux unités : 10 mA = ?", ["0,01 A", "0,1 A", "10 A"]),
    q("1 kΩ = ?", ["1000 Ω", "100 Ω", "0,001 Ω"]),
    q("P = 2 W sous 10 V → I = ?", ["0,2 A", "20 A", "5 A"]),
    q("Si on double R en gardant U constant, P :", ["Est divisée par 2", "Est multipliée par 2", "Ne change pas"]),
    q("U = 3,3 V, R = 330 Ω → I ≈ ?", ["10 mA", "1 A", "100 mA"]),
    q("Formule équivalente de la loi d'Ohm pour I :", ["I = U / R", "I = U × R", "I = R / U"]),
    q("Formule équivalente de la loi d'Ohm pour R :", ["R = U / I", "R = U × I", "R = I / U"]),
    q("Sous 12 V, une résistance de 1,2 kΩ consomme I = ?", ["10 mA", "100 mA", "1,2 A"]),
    q("P = U² / R : si U double et R fixe, P :", ["Est multipliée par 4", "Est multipliée par 2", "Ne change pas"]),
    q("1 MΩ = ?", ["1 000 000 Ω", "1000 Ω", "0,001 Ω"]),
    q("Un ampèremètre se branche :", ["En série", "En parallèle", "À la masse uniquement"]),
    q("Un voltmètre se branche :", ["En parallèle", "En série", "Sur le neutre uniquement"]),
];

const resistances = [
    q("Le 1er anneau d'une résistance (sauf or/argent) indique :", ["Le 1er chiffre significatif", "La tolérance", "Le multiplicateur"]),
    q("Le dernier anneau (or, argent…) indique surtout :", ["La tolérance", "La valeur exacte", "La puissance"]),
    q("Code couleur : Noir = ?", ["0", "1", "10"]),
    q("Code couleur : Marron = ?", ["1", "2", "10"]),
    q("Code couleur : Rouge = ?", ["2", "3", "20"]),
    q("Code couleur : Orange = ?", ["3", "4", "30"]),
    q("Code couleur : Jaune = ?", ["4", "5", "40"]),
    q("Code couleur : Vert = ?", ["5", "6", "50"]),
    q("Multiplicateur Or (anneau) = ?", ["×0,1", "×10", "×0,01"]),
    q("Tolérance Or = ?", ["±5 %", "±10 %", "±1 %"]),
    q("Tolérance Argent = ?", ["±10 %", "±5 %", "±20 %"]),
    q("Résistances en série : Rtot = ?", ["R1 + R2 + …", "(R1×R2)/(R1+R2)", "min(R1, R2)"]),
    q("Deux résistances de 100 Ω en série :", ["200 Ω", "50 Ω", "100 Ω"]),
    q("Deux résistances égales R en parallèle :", ["R/2", "2R", "R"]),
    q("100 Ω // 100 Ω = ?", ["50 Ω", "200 Ω", "100 Ω"]),
    q("En parallèle, Rtot est toujours :", ["Plus petite que la plus petite résistance", "Plus grande que la plus grande", "Égale à la moyenne"]),
    q("Couleurs Brun-Noir-Rouge (4 anneaux, sans tolérance) :", ["1000 Ω (1 kΩ)", "10 Ω", "100 Ω"]),
    q("Couleurs Rouge-Rouge-Marron :", ["220 Ω", "22 Ω", "2,2 kΩ"]),
    q("Une résistance de puissance 1/4 W peut dissiper au max :", ["0,25 W", "1 W", "4 W"]),
    q("Pour limiter le courant d'une LED, on place une résistance :", ["En série avec la LED", "En parallèle avec la LED", "Entre Vcc et la masse uniquement"]),
    q("Code couleur : Bleu = ?", ["6", "5", "7"]),
    q("Code couleur : Violet = ?", ["7", "8", "6"]),
    q("Code couleur : Gris = ?", ["8", "9", "7"]),
    q("Code couleur : Blanc = ?", ["9", "0", "8"]),
    q("Trois résistances de 30 Ω en série :", ["90 Ω", "10 Ω", "30 Ω"]),
    q("Formule de deux résistances en parallèle :", ["Rtot = (R1×R2)/(R1+R2)", "Rtot = R1 + R2", "Rtot = R1 − R2"]),
    q("Couleurs Jaune-Violet-Rouge :", ["4700 Ω (4,7 kΩ)", "470 Ω", "47 Ω"]),
    q("En série, le courant est :", ["Le même dans chaque résistance", "Plus fort dans la plus petite R", "Plus fort dans la plus grande R"]),
];

/**
 * Répartit équitablement 20 questions : 7 + 7 + 6 (ou permutations)
 * en puisant dans chaque thème sans doublon dans un même quiz.
 */
function buildMixedQuiz(index, titles) {
    const rand = mulberry32(20260913 + index * 97);
    const pools = {
        binaire: shuffle(binaire, rand),
        ohm: shuffle(ohm, rand),
        resistances: shuffle(resistances, rand),
    };
    // Rotation des quotas pour varier un peu la composition
    const quotas = [
        { binaire: 7, ohm: 7, resistances: 6 },
        { binaire: 7, ohm: 6, resistances: 7 },
        { binaire: 6, ohm: 7, resistances: 7 },
        { binaire: 7, ohm: 7, resistances: 6 },
    ][index];

    const picked = [
        ...pools.binaire.slice(0, quotas.binaire),
        ...pools.ohm.slice(0, quotas.ohm),
        ...pools.resistances.slice(0, quotas.resistances),
    ];
    const mixed = shuffle(picked, rand).map((item) => finalizeQuestion(item, rand));
    if (mixed.length !== 20) {
        throw new Error(`Quiz ${index + 1} : ${mixed.length} questions`);
    }
    return {
        id: `quiz_elec_mixte_${index + 1}`,
        title: titles[index],
        questions: mixed,
        date: new Date().toISOString().slice(0, 10),
    };
}

const titles = [
    "Éval. élec. & numérique n°1 (binaire, Ohm, résistances)",
    "Éval. élec. & numérique n°2 (binaire, Ohm, résistances)",
    "Éval. élec. & numérique n°3 (binaire, Ohm, résistances)",
    "Éval. élec. & numérique n°4 (binaire, Ohm, résistances)",
];

const quizzes = {};
for (let i = 0; i < 4; i++) {
    const quiz = buildMixedQuiz(i, titles);
    quizzes[quiz.id] = quiz;
}

for (const quiz of Object.values(quizzes)) {
    for (const qq of quiz.questions) {
        if (qq.answers.length !== 3 || qq.correct < 0 || qq.correct > 2) {
            throw new Error(`Question invalide dans ${quiz.id}`);
        }
    }
}

const out = join(root, "quizzes.json");
writeFileSync(out, JSON.stringify(quizzes, null, 2), "utf8");
console.log("OK →", out);
for (const quiz of Object.values(quizzes)) {
    console.log(`- ${quiz.title} : ${quiz.questions.length} questions`);
}
