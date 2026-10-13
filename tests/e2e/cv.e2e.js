const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const { launch, seed, readStore, openExtPage } = require('./harness.js');

let browser, extId;
before(async () => ({ browser, extId } = await launch()));
after(async () => browser && browser.close());

test('E2E : Rattachement et gestion du CV adapté sur une offre', async () => {
  const testPdfPath = path.join(__dirname, 'fixtures_test_cv.pdf');
  fs.writeFileSync(testPdfPath, '%PDF-1.4 test dummy pdf content');

  try {
    const CANDIDATURE = {
      id: 'cand-test-cv',
      title: 'Développeur Full-Stack',
      company: 'TechCorp',
      status: 'applied',
      dateApplied: '2026-10-12',
      cv: null
    };

    await seed(browser, [CANDIDATURE]);

    const page = await openExtPage(browser, extId, 'dashboard.html');

    // 1. Ouvrir la carte
    await page.waitForSelector('.kanban-card[data-id="cand-test-cv"]');
    await page.click('.kanban-card[data-id="cand-test-cv"]');

    // 2. Vérifier la présence de la dropzone CV dans le panneau
    await page.waitForSelector('#f-cv-dropzone');

    // 3. Téléverser le CV
    const fileInput = await page.$('#f-cv-file-input');
    await fileInput.uploadFile(testPdfPath);

    // 4. Vérifier que la carte de fichier s'affiche dans le panneau
    await page.waitForSelector('#f-cv-card');
    const fileName = await page.$eval('.cv-file-card__name', (el) => el.textContent.trim());
    assert.equal(fileName, 'fixtures_test_cv.pdf');

    // 5. Enregistrer la candidature
    await page.click('#panel-save');
    await page.waitForSelector('.panel.hidden');

    // 6. Vérifier la persistance dans chrome.storage
    const store = await readStore(browser);
    const updated = store.find((c) => c.id === 'cand-test-cv');
    assert.ok(updated.cv);
    assert.equal(updated.cv.name, 'fixtures_test_cv.pdf');

    // 7. Vérifier la présence du badge sur la carte Kanban
    await page.waitForSelector('.kanban-card[data-id="cand-test-cv"] .tag--cv');
    const badgeText = await page.$eval(
      '.kanban-card[data-id="cand-test-cv"] .tag--cv',
      (el) => el.textContent.trim()
    );
    assert.ok(badgeText.includes('CV'));

    // 8. Re-ouvrir et supprimer le CV
    await page.click('.kanban-card[data-id="cand-test-cv"]');
    await page.waitForSelector('#f-cv-btn-delete');
    await page.click('#f-cv-btn-delete');

    // La dropzone doit réapparaître
    await page.waitForSelector('#f-cv-dropzone');

    // Enregistrer
    await page.click('#panel-save');
    await page.waitForSelector('.panel.hidden');

    // Vérifier que le CV est bien retiré
    const storeAfterDelete = await readStore(browser);
    const updatedAfterDelete = storeAfterDelete.find((c) => c.id === 'cand-test-cv');
    assert.equal(updatedAfterDelete.cv, null);

    await page.close();
  } finally {
    if (fs.existsSync(testPdfPath)) fs.unlinkSync(testPdfPath);
  }
});

test('E2E : Ajout d\'une nouvelle candidature avec CV depuis la popup', async () => {
  const testPdfPath = path.join(__dirname, 'fixtures_popup_cv.pdf');
  fs.writeFileSync(testPdfPath, '%PDF-1.4 test popup dummy pdf');

  try {
    const page = await openExtPage(browser, extId, 'popup.html');

    // 1. Cliquer sur le bouton d'ajout "+" dans la popup
    await page.waitForSelector('#btn-add');
    await page.click('#btn-add');

    // 2. Vérifier que la vue ajout s'affiche
    await page.waitForSelector('#view-add:not(.hidden)');
    await page.waitForSelector('#add-title');

    // 3. Remplir le formulaire
    await page.type('#add-title', 'Designer UI/UX');
    await page.type('#add-company', 'Studio Créatif');

    // 4. Vérifier la présence de la dropzone CV et téléverser
    await page.waitForSelector('#add-cv-dropzone');
    const fileInput = await page.$('#add-cv-file-input');
    await fileInput.uploadFile(testPdfPath);

    // 5. Vérifier l'affichage du fichier sélectionné
    await page.waitForSelector('#add-cv-card');
    const fileName = await page.$eval('#add-cv-card .cv-file-card__name', (el) => el.textContent.trim());
    assert.equal(fileName, 'fixtures_popup_cv.pdf');

    // 6. Enregistrer
    await page.click('#add-submit');

    // 7. Vérifier la redirection vers la vue détail
    await page.waitForSelector('#view-detail:not(.hidden)');

    // 8. Vérifier la persistance dans chrome.storage
    const store = await readStore(browser);
    const added = store.find((c) => c.title === 'Designer UI/UX');
    assert.ok(added);
    assert.ok(added.cv);
    assert.equal(added.cv.name, 'fixtures_popup_cv.pdf');

    await page.close();
  } finally {
    if (fs.existsSync(testPdfPath)) fs.unlinkSync(testPdfPath);
  }
});

test('E2E : Export complet CSV + CV sous forme d\'archive ZIP depuis le dashboard', async () => {
  try {
    const CANDIDATURE = {
      id: 'cand-export-zip',
      title: 'Tech Lead Node.js',
      company: 'Acme Solutions',
      status: 'applied',
      dateApplied: '2026-10-13',
      location: 'Paris',
      cv: {
        name: 'mon_cv.pdf',
        size: 1024,
        type: 'application/pdf',
        updatedAt: '2026-10-13'
      }
    };

    await seed(browser, [CANDIDATURE]);

    const page = await openExtPage(browser, extId, 'dashboard.html');

    // Sauvegarder le binaire dans IndexedDB
    await page.evaluate(async (id) => {
      const blob = new Blob(['%PDF-1.4 dummy pdf'], { type: 'application/pdf' });
      await CvStorage.save(id, blob);
    }, 'cand-export-zip');

    // Intercepter le blob et le lien de téléchargement générés
    await page.evaluate(() => {
      window.__lastDownload = null;
      window.__lastBlob = null;
      const origCreate = URL.createObjectURL;
      URL.createObjectURL = function (blob) {
        window.__lastBlob = blob;
        return origCreate.apply(this, arguments);
      };
      HTMLAnchorElement.prototype.click = function () {
        if (this.download) {
          window.__lastDownload = { download: this.download };
        }
      };
    });

    // Cliquer sur le bouton d'export
    await page.waitForSelector('#btn-export');
    await page.click('#btn-export');

    // Attendre que le téléchargement se déclenche
    await page.waitForFunction(() => window.__lastDownload !== null && window.__lastBlob !== null, { timeout: 4000 });

    const downloadInfo = await page.evaluate(async () => {
      const dl = window.__lastDownload;
      const blob = window.__lastBlob;
      const ab = await blob.arrayBuffer();
      const bytes = new Uint8Array(ab);
      const isPkZip = bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04;
      return { download: dl.download, isPkZip, size: bytes.length, type: blob.type };
    });

    assert.ok(downloadInfo.download.endsWith('.zip'), `Le fichier téléchargé doit être un .zip : ${downloadInfo.download}`);
    assert.ok(downloadInfo.isPkZip, 'Le fichier téléchargé doit avoir la signature PKZIP');
    assert.equal(downloadInfo.type, 'application/zip');
    assert.ok(downloadInfo.size > 0, 'L\'archive ne doit pas être vide');

    await page.close();
  } catch (err) {
    throw err;
  }
});

test('E2E : Suppression d\'une offre avec CV : suppression immédiate du binaire et restauration sur Annuler', async () => {
  try {
    const CANDIDATURE = {
      id: 'cand-cascade-del',
      title: 'Ingénieur Cloud',
      company: 'Cloud Corp',
      status: 'interview',
      dateApplied: '2026-10-13',
      location: 'Bordeaux',
      cv: {
        name: 'mon_cv_cloud.pdf',
        size: 1024,
        type: 'application/pdf',
        updatedAt: '2026-10-13'
      }
    };

    await seed(browser, [CANDIDATURE]);

    const page = await openExtPage(browser, extId, 'dashboard.html');

    // Sauvegarder le binaire dans IndexedDB
    await page.evaluate(async (id) => {
      const blob = new Blob(['%PDF-1.4 dummy cloud pdf'], { type: 'application/pdf' });
      await CvStorage.save(id, blob);
    }, 'cand-cascade-del');

    // 1. Ouvrir la carte et cliquer sur Supprimer l'offre
    await page.waitForSelector('.kanban-card[data-id="cand-cascade-del"]');
    await page.click('.kanban-card[data-id="cand-cascade-del"]');
    await page.waitForSelector('#panel-delete');
    await page.click('#panel-delete');
    await page.waitForSelector('.panel.hidden');

    // 2. Vérifier que le binaire est IMMÉDIATEMENT supprimé d'IndexedDB (sans délai de 5s)
    const isDeletedImmediately = await page.waitForFunction(async (id) => {
      const rec = await CvStorage.get(id);
      return rec === null;
    }, { timeout: 2000 }, 'cand-cascade-del');
    assert.ok(isDeletedImmediately, 'Le binaire doit être immédiatement supprimé d\'IndexedDB');

    // 3. Cliquer sur le bouton "Annuler" dans le toast
    await page.waitForSelector('.toast__action');
    await page.click('.toast__action');

    // 4. Vérifier que la candidature et son CV sont restaurés en base
    await page.waitForSelector('.kanban-card[data-id="cand-cascade-del"]');
    const recordAfterRestore = await page.evaluate(async (id) => {
      return await CvStorage.get(id);
    }, 'cand-cascade-del');
    assert.ok(recordAfterRestore, 'Le binaire doit être restauré dans IndexedDB après Annuler');

    await page.close();
  } catch (err) {
    throw err;
  }
});




