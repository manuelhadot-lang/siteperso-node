for (const port of [3000, 3001]) {
    try {
        const ui = await fetch(`http://127.0.0.1:${port}/Simulateur/__ui`);
        if (ui.ok) {
            console.log(`port ${port} __ui`, await ui.json());
        } else {
            console.log(`port ${port} __ui`, ui.status, '(route absente = ancien serveur)');
        }
    } catch (e) {
        console.log(`port ${port} __ui offline`);
    }
    try {
        const v = await fetch(`http://127.0.0.1:${port}/api/version`);
        if (v.ok) {
            const j = await v.json();
            console.log(`port ${port} api pid=${j.pid} simUi=${j.simUiVersion || '?'} dir=${j.simulateurDir || '?'}`);
        }
    } catch {
        /* ignore */
    }
}
