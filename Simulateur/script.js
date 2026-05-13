// Configuration pour contourner les blocages de sécurité du navigateur
window.MonacoEnvironment = {
    getWorkerUrl: function (workerId, label) {
        return `data:text/javascript;charset=utf-8,${encodeURIComponent(`
            self.MonacoEnvironment = { baseUrl: 'https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.36.1/min/' };
            importScripts('https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.36.1/min/vs/base/worker/workerMain.js');`
        )}`;
    }
};

require.config({ paths: { 'vs': 'https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.36.1/min/vs' }});

require(['vs/editor/editor.main'], function() {
    // Création de l'éditeur
    window.editor = monaco.editor.create(document.getElementById('editor-container'), {
        value: [
            '* Test diviseur de tension (adapté au mode batch ngspice -b)',
            'V1 1 0 DC 12',
            'R1 1 2 1k',
            'R2 2 0 2k',
            '.op',
            '.print op v(1) v(2)',
            '.end'
        ].join('\n'),
        language: 'plaintext',
        theme: 'vs-dark',
        automaticLayout: true,
        readOnly: false,        // Force l'écriture
        domReadOnly: false,     // Débloque le DOM
        mouseWheelZoom: true
    });

    // Forçage du focus pour activer le curseur et le clic gauche
    setTimeout(() => {
        window.editor.focus();
        console.log("Monaco est prêt et éditable.");
    }, 1000);
});

// Gestion du bouton de simulation
document.getElementById('runBtn').addEventListener('click', async () => {
    const btn = document.getElementById('runBtn');
    const netlist = window.editor.getValue();

    if (!netlist.trim()) return alert("Veuillez saisir une netlist.");

    btn.disabled = true;
    btn.innerText = "⚡ Simulation...";

    try {
        // Envoi au serveur (respecte la structure attendue par votre server.js)
        const response = await fetch('/api/simulate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                state: netlist, // Votre server.js lit req.body.state
                gridStep: 10 
            })
        });

        const data = await response.json();

        if (data.ok) {
            console.log("✅ RESULTATS NGSPICE :");
            console.log(data.log); // Contient la sortie texte de ngspice
            alert("Simulation réussie ! Regardez la console (F12).");
        } else {
            console.error("❌ ERREUR :", data.errors);
            alert("Erreur lors de la simulation. Détails dans la console.");
        }

    } catch (err) {
        console.error("❌ Erreur réseau :", err);
        alert("Impossible de contacter le serveur.");
    } finally {
        btn.disabled = false;
        btn.innerText = "🚀 Lancer la Simulation";
    }
});