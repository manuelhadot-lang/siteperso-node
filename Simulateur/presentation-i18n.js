/** FR / EN — page presentation.html */
const PRESENTATION_I18N = {
    fr: {
        'meta.title': 'Simulateur STI2D — Présentation',
        'top.title': 'Simulateur STI2D',
        'top.open': 'Ouvrir le simulateur',
        'top.portal': 'Portail lycée',
        'top.print': 'Imprimer',
        'top.pdf': 'Télécharger PDF',
        'top.pdf.hint': 'PDF en français',
        'hero.tag': 'STI2D · SIN · LGT Saint-Erembert',
        'hero.title': 'Simulateur de circuits tout-en-un',
        'hero.lead':
            'Schéma interactif, simulation SPICE (ngspice), programmation Arduino et ESP32, capteurs Grove, logique numérique et application Windows avec téléversement USB — conçu pour la pédagogie STI2D.',
        's.one': 'En une phrase',
        's.one.q':
            'Un environnement qui relie le schéma électrique, la simulation SPICE, la programmation microcontrôleur et — en version bureau — le téléversement sur carte réelle.',
        's.problem': 'Le problème adressé',
        's.problem.intro': 'En STI2D, l\'élève enchaîne souvent plusieurs outils incompatibles :',
        's.problem.l1': 'Fritzing / Tinkercad — schéma sans SPICE réel',
        's.problem.l2': 'LTspice / Proteus — puissants mais hors contexte lycée',
        's.problem.l3': 'Wokwi / IDE Arduino — peu de lien avec l\'analogique STI2D',
        's.problem.l4': 'Logisim — logique isolée du reste du montage',
        's.problem.out':
            'Résultat : temps perdu en installation et changement d\'outil, moins de temps sur la physique.',
        's.offer': 'Ce que propose l\'outil',
        't.ver': 'Version',
        't.content': 'Contenu',
        's.offer.web': 'Site web',
        's.offer.web.d':
            'Simulateur en ligne sur le portail — schéma, SPICE, Arduino, ESP32, scope, Bode, moniteur série',
        's.offer.h': 'Simulateur H',
        's.offer.h.d':
            'Application Windows : ngspice + arduino-cli embarqués, hors ligne, téléversement USB sur UNO / ESP32-C3',
        's.features': 'Composants et fonctionnalités',
        's.features.l1':
            'Analogique : résistances, condensateurs, diodes, AOP, transistors, LM386, LM7805, analyse de Bode',
        's.features.l2': 'Logique : portes, bascules D/JK, CD4511, 74HC90 (XSPICE)',
        's.features.l3': 'Microcontrôleurs : Arduino UNO, ESP32-C3, ESP32 DevKit + éditeur de sketch',
        's.features.l4': 'Capteurs / affichage : DHT22, BMP280, TSL2591, LCD I2C, TFT ST7735, matrice 8×8',
        's.features.l5': 'Mécanique : moteur DC, servo, drivers L293D et IR2104',
        's.features.l6': 'Mesures : voltmètre, ampèremètre, ohmmètre, oscilloscope, moniteur série',
        's.compare': 'Comparaison rapide',
        't.crit': 'Critère',
        't.other': 'Tinkercad / Wokwi',
        't.ours': 'Notre simulateur',
        'c.ui': 'Interface en français',
        'c.partial': 'Partiel',
        'c.native': 'Natif',
        'c.spice': 'SPICE analogique réel',
        'c.limited': 'Limité',
        'c.logic': 'CD4511, 74HC90, Bode',
        'c.rare': 'Rare',
        'c.integrated': 'Intégré',
        'c.win': 'Pack Windows + USB',
        'c.no': 'Non',
        'c.yes': 'Oui',
        'c.portal': 'Lien cours / quiz lycée',
        'c.same': 'Même portail',
        's.benefits': 'Bénéfices pour l\'établissement',
        's.benefits.l1': 'Moins de temps perdu en installation et changement d\'outil en TP',
        's.benefits.l2': 'Continuité entre cours théoriques, simulation et réalisation physique',
        's.benefits.l3': 'Circuits JSON réutilisables et distribuables à toute la classe',
        's.benefits.l4': 'Outil développé en interne, valorisable auprès d\'autres établissements STI2D',
        's.hooks': 'Phrases d\'accroche',
        's.hooks.q1':
            '« En un seul outil, l\'élève câble, simule, programme et — avec Simulateur H — téléverse sur la carte qu\'il aura en TP. »',
        's.hooks.q2':
            '« Pensé pour le programme STI2D : les élèves passent moins de temps sur les outils et plus sur la physique. »',
        'foot':
            '© STI2D — LGT Saint-Erembert · Simulateur de Circuits ·',
        'foot.link': 'Accéder au simulateur',
    },
    en: {
        'meta.title': 'STI2D Simulator — Overview',
        'top.title': 'STI2D Simulator',
        'top.open': 'Open simulator',
        'top.portal': 'School portal',
        'top.print': 'Print',
        'top.pdf': 'Download PDF',
        'top.pdf.hint': 'PDF in French',
        'hero.tag': 'STI2D · SIN · LGT Saint-Erembert',
        'hero.title': 'All-in-one circuit simulator',
        'hero.lead':
            'Interactive schematics, SPICE simulation (ngspice), Arduino and ESP32 programming, Grove sensors, digital logic, and a Windows app with USB upload — built for STI2D electronics education.',
        's.one': 'In one sentence',
        's.one.q':
            'One environment that connects schematic capture, SPICE simulation, microcontroller programming and — in the desktop version — upload to real hardware.',
        's.problem': 'The problem it solves',
        's.problem.intro': 'In STI2D, students often juggle incompatible tools:',
        's.problem.l1': 'Fritzing / Tinkercad — wiring without real SPICE',
        's.problem.l2': 'LTspice / Proteus — powerful but not school-friendly',
        's.problem.l3': 'Wokwi / Arduino IDE — weak link to analog STI2D topics',
        's.problem.l4': 'Logisim — logic isolated from the rest of the circuit',
        's.problem.out':
            'Result: time lost installing and switching tools, less time on physics.',
        's.offer': 'What the tool provides',
        't.ver': 'Version',
        't.content': 'Content',
        's.offer.web': 'Web site',
        's.offer.web.d':
            'Online simulator on the portal — schematic, SPICE, Arduino, ESP32, scope, Bode plot, serial monitor',
        's.offer.h': 'Simulateur H',
        's.offer.h.d':
            'Windows app: bundled ngspice + arduino-cli, offline use, USB upload to UNO / ESP32-C3',
        's.features': 'Components and features',
        's.features.l1':
            'Analog: resistors, capacitors, diodes, op-amps, transistors, LM386, LM7805, Bode analysis',
        's.features.l2': 'Logic: gates, D/JK flip-flops, CD4511, 74HC90 (XSPICE)',
        's.features.l3': 'Microcontrollers: Arduino UNO, ESP32-C3, ESP32 DevKit + sketch editor',
        's.features.l4': 'Sensors / displays: DHT22, BMP280, TSL2591, I2C LCD, ST7735 TFT, 8×8 matrix',
        's.features.l5': 'Mechanics: DC motor, servo, L293D and IR2104 drivers',
        's.features.l6': 'Instruments: voltmeter, ammeter, ohmmeter, oscilloscope, serial monitor',
        's.compare': 'Quick comparison',
        't.crit': 'Criterion',
        't.other': 'Tinkercad / Wokwi',
        't.ours': 'Our simulator',
        'c.ui': 'French UI',
        'c.partial': 'Partial',
        'c.native': 'Native',
        'c.spice': 'Real analog SPICE',
        'c.limited': 'Limited',
        'c.logic': 'CD4511, 74HC90, Bode',
        'c.rare': 'Rare',
        'c.integrated': 'Built-in',
        'c.win': 'Windows pack + USB',
        'c.no': 'No',
        'c.yes': 'Yes',
        'c.portal': 'Link to school courses / quizzes',
        'c.same': 'Same portal',
        's.benefits': 'Benefits for the school',
        's.benefits.l1': 'Less time lost on setup and tool switching in lab sessions',
        's.benefits.l2': 'Continuity between theory, simulation and hands-on work',
        's.benefits.l3': 'Reusable JSON circuits easy to share with the whole class',
        's.benefits.l4': 'In-house tool that can be promoted to other STI2D schools',
        's.hooks': 'Talking points',
        's.hooks.q1':
            '"In one tool, the student wires, simulates, programs and — with Simulateur H — uploads to the board used in lab."',
        's.hooks.q2':
            '"Designed for the French STI2D curriculum: students spend less time on tools and more on physics."',
        'foot': '© STI2D — LGT Saint-Erembert · Circuit Simulator ·',
        'foot.link': 'Open simulator',
    },
};

function presentationResolveLang() {
    const q = new URLSearchParams(window.location.search).get('lang');
    if (q === 'en' || q === 'fr') return q;
    const stored = localStorage.getItem('sim-presentation-lang');
    if (stored === 'en' || stored === 'fr') return stored;
    const nav = (navigator.language || '').toLowerCase();
    return nav.startsWith('en') ? 'en' : 'fr';
}

function applyPresentationLang(lang) {
    const dict = PRESENTATION_I18N[lang] || PRESENTATION_I18N.fr;
    document.documentElement.lang = lang;
    document.title = dict['meta.title'];
    document.querySelectorAll('[data-i18n]').forEach((el) => {
        const key = el.getAttribute('data-i18n');
        if (dict[key] != null) el.textContent = dict[key];
    });
    document.querySelectorAll('[data-i18n-title]').forEach((el) => {
        const key = el.getAttribute('data-i18n-title');
        if (dict[key] != null) el.title = dict[key];
    });
    document.querySelectorAll('.lang-switch__btn').forEach((btn) => {
        btn.classList.toggle('lang-switch__btn--active', btn.dataset.lang === lang);
        btn.setAttribute('aria-pressed', btn.dataset.lang === lang ? 'true' : 'false');
    });
    localStorage.setItem('sim-presentation-lang', lang);
}

function initPresentationI18n() {
    let lang = presentationResolveLang();
    applyPresentationLang(lang);
    document.querySelectorAll('.lang-switch__btn').forEach((btn) => {
        btn.addEventListener('click', () => {
            lang = btn.dataset.lang;
            applyPresentationLang(lang);
            const url = new URL(window.location.href);
            url.searchParams.set('lang', lang);
            history.replaceState(null, '', url);
        });
    });
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initPresentationI18n);
} else {
    initPresentationI18n();
}
