for (const port of [3000, 3001]) {
    try {
        const t = await (await fetch(`http://127.0.0.1:${port}/Simulateur/index.html`)).text();
        const css = (t.match(/style\.css\?v=([^"']+)/) || [])[1] || '?';
        console.log(`port ${port}: css=${css} badge=${t.includes('UI icons4')} lucide=${t.includes('lucide-icon')} emoji=${t.includes('📁')}`);
    } catch (e) {
        console.log(`port ${port}: offline`);
    }
}
