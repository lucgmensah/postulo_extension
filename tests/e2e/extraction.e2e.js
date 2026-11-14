// Extraction du poste, de l'entreprise et du lieu sur de vraies pages enregistrées.
// Hors ligne : chaque page de tests/e2e/pages/ est servie à l'adresse réelle du site.
const { test, before, after, describe } = require('node:test');
const assert = require('node:assert/strict');
const { launch, seed, sleep, readPage, serveFixture, widgetFields } = require('./harness');

let browser;
before(async () => {
  ({ browser } = await launch());
  await seed(browser, []);
});
after(async () => browser && browser.close());

async function openFixture(url, html) {
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 800 });
  await serveFixture(page, html);
  await page.goto(url, { waitUntil: 'load', timeout: 30000 });
  return page;
}

const CASES = [
  {
    page: 'linkedin',
    url: 'https://fr.linkedin.com/jobs/view/developpeur-java-h-f-at-devoteam-4368990276',
    expected: { title: 'Développeur Java H/F', company: 'Devoteam', location: 'Montpellier' },
    sansFiche: { title: 'Développeur Java H/F', company: 'Devoteam', location: 'Montpellier' }
  },
  {
    page: 'indeed',
    url: 'https://fr.indeed.com/jobs?q=developpeur&l=Lyon&vjk=6b4309b9ec009bc4',
    expected: { title: 'Développeur fullstack confirmé', company: '2-M', location: 'Saint-Priest (69)' }
  },
  {
    page: 'wttj',
    url: 'https://www.welcometothejungle.com/fr/companies/solarock-fr/jobs/customer-success-deployment-manager-reseau-powered-by-solarock-h-f_paris',
    expected: { title: 'Customer Success & Deployment Manager, Réseau Powered by Solarock (H/F)', company: 'Solarock', location: 'Paris (75)' },
    sansFiche: { title: 'Customer Success & Deployment Manager, Réseau Powered by Solarock (H/F)', company: 'Solarock', location: '' }
  },
  {
    page: 'hellowork',
    url: 'https://www.hellowork.com/fr-fr/emplois/83247207.html',
    expected: { title: 'Développeur - Développeuse Flutter H/F', company: 'Alpee', location: 'Chambéry (73)' },
    sansFiche: { title: 'Développeur - Développeuse Flutter H/F', company: 'Alpee', location: 'Chambéry (73)' }
  },
  {
    page: 'francetravail',
    url: 'https://candidat.francetravail.fr/offres/recherche/detail/216HQDM',
    expected: { title: 'Développeur / Développeuse front-end (H/F)', company: '', location: 'Sene (56)' }
  },
  {
    page: 'cadremploi',
    url: 'https://www.cadremploi.fr/emploi/detail_offre?offreId=156541529064953069',
    expected: { title: 'Développeur informatique Chargé de projet - CDI (44) (H/F)', company: 'MANPOWER FRANCE', location: 'Malville (44)' },
    sansFiche: { title: 'Développeur informatique Chargé de projet - CDI (44) (H/F)' }
  },
  {
    page: 'jobteaser',
    url: 'https://www.jobteaser.com/fr/job-offers/01202997-a1d9-4052-a335-7f9169ac5d1d-thales-stage-technicien-developpeur-web-h-f',
    expected: { title: 'Stage - Technicien Développeur Web - (H/F)', company: 'Thales', location: 'Cannes' },
    sansFiche: { title: 'Stage - Technicien Développeur Web - (H/F)', location: 'Cannes (France)' }
  },
  {
    page: 'freework',
    url: 'https://www.free-work.com/fr/tech-it/job-mission/responsable-qualite-qa-manager/responsable-qualite-logiciel-1',
    expected: { title: 'Responsable Qualité Logiciel', company: 'Avanda', location: 'Genève, Suisse' },
    sansFiche: { title: 'Responsable Qualité Logiciel' }
  }
];

describe('Extraction - pages réelles enregistrées', () => {
  for (const c of CASES) {
    test(`${c.page} : poste, entreprise et lieu`, async () => {
      const page = await openFixture(c.url, readPage(c.page));
      const fields = await widgetFields(page);
      await page.close();
      assert.deepEqual(fields, c.expected);
    });

    if (c.sansFiche) {
      test(`${c.page} : sans fiche standard, les repères du site prennent le relais`, async () => {
        const page = await openFixture(c.url, readPage(c.page, { sansFiche: true }));
        const fields = await widgetFields(page);
        await page.close();
        assert.ok(fields, 'widget absent');
        for (const [key, value] of Object.entries(c.sansFiche)) assert.equal(fields[key], value, key);
      });
    }
  }

  test('fiche d\'une autre offre (navigation interne) : elle est ignorée', async () => {
    // La page Hello Work garde son en-tête mais porte la fiche d'une autre offre
    const html = readPage('hellowork').replace(/"title":"[^"]*"/, '"title":"Comptable H/F"').replace('"addressLocality":"Chambéry"', '"addressLocality":"Brest"');
    const page = await openFixture('https://www.hellowork.com/fr-fr/emplois/83247207.html', html);
    const fields = await widgetFields(page);
    await page.close();
    assert.deepEqual(fields, { title: 'Développeur - Développeuse Flutter H/F', company: 'Alpee', location: 'Chambéry (73)' });
  });

  test('page de recherche d\'un nouveau site : pas de widget', async () => {
    const page = await openFixture('https://www.hellowork.com/fr-fr/emploi/recherche.html?k=developpeur', readPage('hellowork'));
    await sleep(3000);
    const present = await page.evaluate(() => !!document.getElementById('job-tracker-floating-root'));
    await page.close();
    assert.equal(present, false);
  });
});
