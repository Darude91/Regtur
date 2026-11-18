// Zet de nieuwste hls.js (uit node_modules) in de web-app; lukt het niet, dan blijft het meegeleverde bestand staan.
const fs = require('fs'), path = require('path');
try {
  const src = path.join(__dirname, '..', 'node_modules', 'hls.js', 'dist', 'hls.min.js');
  const dst = path.join(__dirname, '..', 'www', 'vendor', 'hls.min.js');
  if (fs.existsSync(src) && fs.statSync(src).size > 100000) { fs.copyFileSync(src, dst); console.log('hls.js bijgewerkt'); }
} catch (e) { console.log('hls.js niet bijgewerkt:', e.message); }
