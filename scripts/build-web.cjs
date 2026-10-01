const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const out = path.join(root, 'dist');
fs.mkdirSync(out, { recursive: true });
// Explicit allowlist: no private data and no alternate unauthenticated entry page.
for (const file of ['app.js', 'mobile.js', 'login.js', 'style.css', 'manifest.webmanifest', 'sw.js', 'offline.html', 'icons']) fs.cpSync(path.join(root, 'public', file), path.join(out, file), { recursive: true });
