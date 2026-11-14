const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..');
const { ENTRIES, zipName } = require(path.join(ROOT, 'scripts', 'build_zip.js'));
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');

// Un fichier est empaqueté s'il est listé, ou s'il est dans un dossier listé
const packed = (file) => ENTRIES.some((entry) => file === entry || file.startsWith(entry + '/'));

test('l\'archive contient tous les fichiers que l\'extension charge', () => {
  const manifest = JSON.parse(read('manifest.json'));
  const needed = new Set(['manifest.json', manifest.background.service_worker, manifest.action.default_popup, 'dashboard.html']);
  for (const cs of manifest.content_scripts) cs.js.forEach((f) => needed.add(f));
  for (const war of manifest.web_accessible_resources) war.resources.forEach((f) => needed.add(f));
  for (const icon of Object.values(manifest.icons)) needed.add(icon);

  // Scripts et feuilles de style des pages de l'extension
  for (const page of ['popup.html', 'dashboard.html']) {
    for (const m of read(page).matchAll(/<(?:script[^>]*\ssrc|link[^>]*\shref)="([^"]+)"/g)) needed.add(m[1]);
  }
  // Scripts importés par le service worker et injectés par la popup
  const quoted = (text) => [...text.matchAll(/'([^']+\.js)'/g)].map((m) => m[1]);
  for (const m of read('background.js').matchAll(/importScripts\(([^)]*)\)/g)) quoted(m[1]).forEach((f) => needed.add(f));
  for (const m of read('popup.js').matchAll(/files:\s*\[([^\]]*)\]/g)) quoted(m[1]).forEach((f) => needed.add(f));

  const missing = [...needed].filter((f) => !packed(f));
  assert.deepEqual(missing, []);
});

test('le nom de l\'archive suit la version du manifeste', () => {
  const { version } = JSON.parse(read('manifest.json'));
  assert.equal(zipName(), `postulo-v${version}.zip`);
});
