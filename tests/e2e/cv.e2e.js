const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const { launch, seed, readStore, openExtPage } = require('./harness.js');

test('E2E : Rattachement et gestion du CV adapté sur une offre', async () => {
  const { browser, extId } = await launch();
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
    await browser.close();
  }
});

test('E2E : Ajout d\'une nouvelle candidature avec CV depuis la popup', async () => {
  const { browser, extId } = await launch();
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
    await browser.close();
  }
});
