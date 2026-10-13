const { test } = require('node:test');
const assert = require('node:assert/strict');
const ZipBuilder = require('../../zip-builder.js');

test('ZipBuilder : crée une archive ZIP valide contenant plusieurs fichiers', async () => {
  const zip = new ZipBuilder();
  zip.addFile('test.txt', 'Bonjour le monde !');
  zip.addFile('cv/candidat.pdf', Buffer.from('%PDF-1.4 mock content'));

  const blob = await zip.build();
  assert.ok(blob, 'Le blob généré doit être défini');
  assert.equal(blob.type, 'application/zip');

  const arrayBuffer = await blob.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  // Vérifier la signature PKZIP du premier fichier : PK\x03\x04
  assert.equal(buffer[0], 0x50);
  assert.equal(buffer[1], 0x4b);
  assert.equal(buffer[2], 0x03);
  assert.equal(buffer[3], 0x04);

  // Vérifier que le nom des fichiers est présent dans le buffer
  assert.ok(buffer.includes(Buffer.from('test.txt')), 'test.txt doit être dans le buffer');
  assert.ok(buffer.includes(Buffer.from('cv/candidat.pdf')), 'cv/candidat.pdf doit être dans le buffer');

  // Vérifier la signature de fin de répertoire central : PK\x05\x06
  const eocdSignature = Buffer.from([0x50, 0x4b, 0x05, 0x06]);
  assert.ok(buffer.includes(eocdSignature), 'La signature de fin de répertoire central doit être présente');
});

test('ZipBuilder : gère les chaînes UTF-8 avec accents', async () => {
  const zip = new ZipBuilder();
  zip.addFile('dossier/élève_ingénieur.txt', 'Développeur Full-Stack & Données');
  const blob = await zip.build();
  const buffer = Buffer.from(await blob.arrayBuffer());
  assert.ok(buffer.includes(Buffer.from('élève_ingénieur.txt', 'utf8')));
  assert.ok(buffer.includes(Buffer.from('Développeur Full-Stack & Données', 'utf8')));
});

test('ZipBuilder : archive vérifiée et reconnue valide par unzip', async () => {
  const { execSync } = require('node:child_process');
  const fs = require('node:fs');
  const os = require('node:os');
  const path = require('node:path');

  const zip = new ZipBuilder();
  zip.addFile('suivi.csv', 'Titre;Entreprise\nDev;Acme');
  zip.addFile('cv/Acme_Dev_mon-cv.pdf', Buffer.from('%PDF-1.4 dummy'));

  const blob = await zip.build();
  const tmpFile = path.join(os.tmpdir(), `test_archive_${Date.now()}.zip`);
  fs.writeFileSync(tmpFile, Buffer.from(await blob.arrayBuffer()));

  try {
    const output = execSync(`unzip -t "${tmpFile}"`).toString();
    assert.ok(output.includes('No errors detected in compressed data'), 'unzip doit valider sans erreur');
  } finally {
    try { fs.unlinkSync(tmpFile); } catch (e) {}
  }
});

