const fs = require('node:fs');
const path = require('node:path');
const { execSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');

// Liste exacte des fichiers et dossiers nécessaires à l'extension.
// tests/unit/pack.test.js vérifie qu'aucun fichier chargé par l'extension n'y manque.
const ENTRIES = [
  'manifest.json',
  'background.js',
  'content.js',
  'shared.js',
  'extract.js',
  'ui.js',
  'cv-storage.js',
  'zip-builder.js',
  'popup.html',
  'popup.js',
  'popup.css',
  'dashboard.html',
  'dashboard.js',
  'dashboard.css',
  'tokens.css',
  'components.css',
  'widget.css',
  'images',
  'fonts'
];

// Le nom de l'archive suit la version du manifeste
function zipName() {
  const { version } = JSON.parse(fs.readFileSync(path.join(ROOT, 'manifest.json'), 'utf8'));
  return `postulo-v${version}.zip`;
}

function build() {
  const name = zipName();
  const zipPath = path.join(ROOT, name);

  console.log('Préparation de l\'archive pour le Chrome Web Store...');

  // Vérifier que tous les fichiers requis existent
  for (const entry of ENTRIES) {
    const full = path.join(ROOT, entry);
    if (!fs.existsSync(full)) {
      console.error(`Erreur: fichier requis manquant: ${entry}`);
      process.exit(1);
    }
  }

  // Supprimer l'ancienne archive si elle existe
  if (fs.existsSync(zipPath)) {
    fs.unlinkSync(zipPath);
  }

  // Utiliser PowerShell Compress-Archive
  const pathsArg = ENTRIES.map(e => `'${e}'`).join(', ');
  const psCommand = `powershell -NoProfile -Command "Compress-Archive -Path ${pathsArg} -DestinationPath '${name}' -Force"`;

  console.log('Création du fichier ZIP...');
  execSync(psCommand, { cwd: ROOT, stdio: 'inherit' });

  if (fs.existsSync(zipPath)) {
    const stat = fs.statSync(zipPath);
    const sizeKb = (stat.size / 1024).toFixed(1);
    console.log(`\nSuccès ! Archive créée : ${name} (${sizeKb} Ko)`);
  } else {
    console.error('Erreur lors de la création du ZIP.');
    process.exit(1);
  }
}

// L'archive n'est construite que si le script est lancé directement (npm run pack),
// pas quand un test importe la liste des fichiers.
if (require.main === module) build();

module.exports = { ENTRIES, zipName };
