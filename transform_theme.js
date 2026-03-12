const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'src', 'App.tsx');
let content = fs.readFileSync(filePath, 'utf8');

const replacements = [
    // Backgrounds
    { from: /bg-\[\#0a0a0a\]/g, to: 'bg-slate-50' },
    { from: /bg-\[\#151619\]/g, to: 'bg-white' },

    // Text Colors
    { from: /text-white\/10/g, to: 'text-slate-200' },
    { from: /text-white\/20/g, to: 'text-slate-300' },
    { from: /text-white\/30/g, to: 'text-slate-400' },
    { from: /text-white\/40/g, to: 'text-slate-500' },
    { from: /text-white\/50/g, to: 'text-slate-500' },
    { from: /text-white\/60/g, to: 'text-slate-600' },
    { from: /text-white\/80/g, to: 'text-slate-700' },
    { from: /text-white/g, to: 'text-slate-900' },
    { from: /text-black/g, to: 'text-white' },

    // Borders
    { from: /border-white\/5/g, to: 'border-slate-200' },
    { from: /border-white\/10/g, to: 'border-slate-200' },

    // Background transparencies
    { from: /bg-white\/5/g, to: 'bg-slate-100' },
    { from: /bg-white\/10/g, to: 'bg-slate-200' },
    { from: /hover:bg-white\/5/g, to: 'hover:bg-slate-100' },
    { from: /hover:bg-white\/10/g, to: 'hover:bg-slate-200' },
    { from: /bg-black\/20/g, to: 'bg-slate-100' },
    { from: /bg-black\/40/g, to: 'bg-slate-50' },
    { from: /bg-black\/80/g, to: 'bg-slate-900/50' },

    // Brand color swap (Emerald -> Blue for ByteXL)
    { from: /emerald-500/g, to: 'blue-600' },
    { from: /emerald-600/g, to: 'blue-700' },
    { from: /emerald-400/g, to: 'blue-600' },

    // Editor Theme
    { from: /theme="vs-dark"/g, to: 'theme="light"' }
];

replacements.forEach(({ from, to }) => {
    content = content.replace(from, to);
});

// Since text-white mapped text-black to text-white, let's just make sure "text-white" on blue buttons isn't reverted to text-slate-900. Wait, my order above was text-white -> text-slate-900, THEN text-black -> text-white! So text-black becomes text-white safely without being re-replaced.
// Let's verify no issues with border styles.
fs.writeFileSync(filePath, content, 'utf8');
console.log('Theme transformed successfully!');
