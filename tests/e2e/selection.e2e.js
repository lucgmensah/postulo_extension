// Sélection multiple dans le tableau de bord
const { test, before, after, describe } = require('node:test');
const assert = require('node:assert/strict');
const { launch, seed, readStore, openExtPage, shot, sleep } = require('./harness');
const { SAMPLE } = require('./fixtures');

let browser, extId;
before(async () => ({ browser, extId } = await launch()));
after(async () => browser && browser.close());

async function openDashboard(list = SAMPLE) {
  await seed(browser, list);
  const page = await openExtPage(browser, extId, 'dashboard.html', { width: 1440, height: 900 });
  await page.waitForSelector('.kanban-card');
  return page;
}

// État visible de la sélection
const selection = (page) => page.evaluate(() => {
  const bar = document.querySelector('#selection-bar');
  return {
    ids: [...document.querySelectorAll('.kanban-card--selected')].map((c) => c.dataset.id),
    checked: [...document.querySelectorAll('.kanban-card__check')].filter((c) => c.checked).map((c) => c.closest('.kanban-card').dataset.id),
    bar: !!bar && !bar.classList.contains('hidden'),
    count: (document.querySelector('#selection-count') || {}).textContent || '',
    panel: !document.querySelector('.panel').classList.contains('hidden')
  };
});

const card = (id) => `.kanban-card[data-id="${id}"]`;
const colCheck = (status) => `.kanban-col[data-status="${status}"] .kanban-col__check`;

async function ctrlClick(page, selector) {
  await page.keyboard.down('Control');
  await page.click(selector);
  await page.keyboard.up('Control');
}

async function selectCards(page, ids) {
  for (const id of ids) await ctrlClick(page, card(id));
}

async function chooseStatus(page, status) {
  await page.click('#selection-status');
  await page.click(`#selection-status-menu [data-status="${status}"]`);
}

const columnIds = (page, status) => page.$$eval(`.kanban-col[data-status="${status}"] .kanban-card`, (cards) => cards.map((c) => c.dataset.id));

const todayLocal = () => {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

// Glisser-déposer HTML5 via des DragEvent synthétiques
async function dragTo(page, id, status) {
  await page.evaluate((id, status) => {
    const from = document.querySelector(`.kanban-card[data-id="${id}"]`);
    const to = document.querySelector(`.kanban-col[data-status="${status}"]`);
    const dt = new DataTransfer();
    const fire = (el, type) => el.dispatchEvent(new DragEvent(type, { bubbles: true, cancelable: true, dataTransfer: dt }));
    fire(from, 'dragstart');
    fire(to, 'dragenter');
    fire(to, 'dragover');
    fire(to, 'drop');
    fire(from, 'dragend');
  }, id, status);
  await sleep(300);
}

describe('Sélection - choisir des cartes', () => {
  test('Ctrl+clic coche une carte sans ouvrir le panneau', async () => {
    const page = await openDashboard();
    await ctrlClick(page, card('s1'));
    const s = await selection(page);
    assert.deepEqual(s.ids, ['s1']);
    assert.deepEqual(s.checked, ['s1']);
    assert.ok(s.bar, 'barre absente');
    assert.equal(s.count, '1 sélectionnée');
    assert.equal(s.panel, false);
    await shot(page, 'selection-bar');
    assert.deepEqual(page.errors, []);
    await page.close();
  });

  test('pendant une sélection, un clic simple coche ou décoche', async () => {
    const page = await openDashboard();
    await ctrlClick(page, card('s1'));
    await page.click(card('s2'));
    let s = await selection(page);
    assert.deepEqual(s.ids.sort(), ['s1', 's2']);
    assert.equal(s.count, '2 sélectionnées');
    assert.equal(s.panel, false);
    await page.click(card('s2'));
    s = await selection(page);
    assert.deepEqual(s.ids, ['s1']);
    await page.close();
  });

  test('la case d\'une carte la coche sans ouvrir le panneau', async () => {
    const page = await openDashboard();
    await page.click(`${card('s3')} .kanban-card__check`);
    const s = await selection(page);
    assert.deepEqual(s.ids, ['s3']);
    assert.equal(s.panel, false);
    await page.close();
  });

  test('case de colonne : toute la colonne, puis rien, en respectant la recherche', async () => {
    const page = await openDashboard();
    await page.click(colCheck('applied'));
    assert.deepEqual((await selection(page)).ids.sort(), ['s1', 's3']);
    await page.click(colCheck('applied'));
    assert.deepEqual((await selection(page)).ids, []);

    // Une partie de la colonne cochée : case « indéterminée »
    await page.click(`${card('s1')} .kanban-card__check`);
    assert.ok(await page.$eval(colCheck('applied'), (b) => b.indeterminate && !b.checked));

    await page.click(`${card('s1')} .kanban-card__check`);
    await page.type('#search-input', 'Acme');
    await page.click(colCheck('applied'));
    assert.deepEqual((await selection(page)).ids, ['s1']);
    await page.close();
  });

  test('une carte masquée par la recherche sort de la sélection', async () => {
    const page = await openDashboard();
    await ctrlClick(page, card('s1'));
    await ctrlClick(page, card('s2'));
    await page.type('#search-input', 'Acme');
    await sleep(100);
    let s = await selection(page);
    assert.deepEqual(s.ids, ['s1']);
    assert.equal(s.count, '1 sélectionnée');
    // Effacer la recherche ne la recoche pas
    await page.$eval('#search-input', (i) => { i.value = ''; i.dispatchEvent(new Event('input', { bubbles: true })); });
    s = await selection(page);
    assert.deepEqual(s.ids, ['s1']);
    await page.close();
  });

  test('une candidature supprimée ailleurs sort de la sélection', async () => {
    const page = await openDashboard();
    await ctrlClick(page, card('s1'));
    await ctrlClick(page, card('s2'));
    assert.deepEqual((await selection(page)).ids.sort(), ['s1', 's2']);
    await seed(browser, SAMPLE.filter((c) => c.id !== 's1'));
    await sleep(400);
    assert.deepEqual((await selection(page)).ids, ['s2']);
    assert.equal((await selection(page)).count, '1 sélectionnée');
    await seed(browser, SAMPLE.filter((c) => c.id !== 's1' && c.id !== 's2'));
    await sleep(400);
    const s = await selection(page);
    assert.deepEqual(s.ids, []);
    assert.equal(s.bar, false);
    await page.close();
  });

  test('Espace coche la carte focalisée et garde le focus ; Entrée coche pendant une sélection', async () => {
    const page = await openDashboard();
    await page.focus(card('s4'));
    await page.keyboard.press('Space');
    assert.deepEqual((await selection(page)).ids, ['s4']);
    assert.equal(await page.evaluate(() => document.activeElement.dataset.id), 's4', 'focus perdu');

    await page.focus(card('s5'));
    await page.keyboard.press('Enter');
    const s = await selection(page);
    assert.deepEqual(s.ids.sort(), ['s4', 's5']);
    assert.equal(s.panel, false);
    await page.close();
  });

  test('Échap puis ✕ vident la sélection', async () => {
    const page = await openDashboard();
    await ctrlClick(page, card('s1'));
    await page.keyboard.press('Escape');
    let s = await selection(page);
    assert.deepEqual(s.ids, []);
    assert.equal(s.bar, false);

    await ctrlClick(page, card('s2'));
    await page.click('#selection-clear');
    s = await selection(page);
    assert.deepEqual(s.ids, []);
    assert.equal(s.bar, false);
    await page.close();
  });

  test('Échap dans le panneau ferme le panneau sans vider la sélection', async () => {
    const page = await openDashboard();
    await ctrlClick(page, card('s1'));
    await page.click('#btn-add');
    await page.keyboard.press('Escape');
    const s = await selection(page);
    assert.equal(s.panel, false);
    assert.deepEqual(s.ids, ['s1']);
    await page.close();
  });

  test('la case de colonne ne tronque pas les titres de colonne', async () => {
    const page = await openDashboard();
    const cut = await page.$$eval('.kanban-col__title', (els) => els.filter((e) => e.scrollWidth > e.clientWidth).map((e) => e.textContent));
    assert.deepEqual(cut, []);
    await page.close();
  });

  test('sans sélection, un clic ouvre toujours la candidature', async () => {
    const page = await openDashboard();
    await page.click(card('s2'));
    assert.equal((await selection(page)).panel, true);
    await page.close();
  });
});

describe('Sélection - actions', () => {
  test('changer le statut de la sélection', async () => {
    const page = await openDashboard();
    await selectCards(page, ['s4', 's5']);
    await chooseStatus(page, 'interview');
    await sleep(400);
    assert.deepEqual((await columnIds(page, 'interview')).sort(), ['s2', 's4', 's5']);
    const store = await readStore(browser);
    assert.deepEqual(store.filter((c) => ['s4', 's5'].includes(c.id)).map((c) => c.status), ['interview', 'interview']);
    assert.match(await page.$eval('.toast', (t) => t.textContent), /2 candidatures passées en « Entretien »/);
    assert.deepEqual((await selection(page)).ids.sort(), ['s4', 's5'], 'sélection perdue');
    assert.ok(await page.$eval('#selection-status-menu', (m) => m.classList.contains('hidden')), 'menu resté ouvert');
    await page.close();
  });

  test('parcourir le menu de statut au clavier ne change rien avant validation', async () => {
    // Chrome sous Windows déclenche `change` à chaque flèche sur un menu fermé :
    // cartes hors « À postuler », sinon la première option ne changerait rien de visible.
    const page = await openDashboard();
    await selectCards(page, ['s1', 's2']);
    const statuses = async () => (await readStore(browser)).filter((c) => ['s1', 's2'].includes(c.id)).map((c) => c.status);
    await page.focus('#selection-status');
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('ArrowDown');
    await sleep(400);
    assert.deepEqual(await statuses(), ['applied', 'interview'], 'statut changé par une simple flèche');

    // Entrée ouvre le menu, les flèches s'y déplacent, Entrée valide
    await page.keyboard.press('Enter');
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('ArrowDown');
    await sleep(300);
    assert.deepEqual(await statuses(), ['applied', 'interview'], 'statut changé avant validation');
    await page.keyboard.press('Enter');
    await sleep(400);
    assert.deepEqual(await statuses(), ['interview', 'interview']);

    // Échap ferme le menu sans vider la sélection
    await page.keyboard.press('Enter');
    await page.keyboard.press('Escape');
    assert.ok(await page.$eval('#selection-status-menu', (m) => m.classList.contains('hidden')));
    assert.deepEqual((await selection(page)).ids.sort(), ['s1', 's2']);
    await page.close();
  });

  test('passer en « Candidature envoyée » renseigne la date du jour si elle manque', async () => {
    const page = await openDashboard();
    await selectCards(page, ['s5']);
    await chooseStatus(page, 'applied');
    await sleep(400);
    const s5 = (await readStore(browser)).find((c) => c.id === 's5');
    assert.equal(s5.status, 'applied');
    assert.equal(s5.dateApplied, todayLocal());
    await page.close();
  });

  test('supprimer la sélection puis annuler', async () => {
    const page = await openDashboard();
    await selectCards(page, ['s2', 's4', 's6']);
    await page.click('#selection-delete');
    await sleep(400);
    const ids = (await readStore(browser)).map((c) => c.id);
    assert.ok(!ids.some((id) => ['s2', 's4', 's6'].includes(id)), ids.join(' '));
    assert.match(await page.$eval('.toast', (t) => t.textContent), /3 candidatures supprimées/);
    const s = await selection(page);
    assert.deepEqual(s.ids, []);
    assert.equal(s.bar, false);

    await page.click('.toast__action');
    await sleep(400);
    assert.deepEqual((await readStore(browser)).map((c) => c.id), SAMPLE.map((c) => c.id));
    assert.deepEqual(page.errors, []);
    await page.close();
  });

  test('supprimer puis annuler restaure aussi les CV', async () => {
    const withCv = SAMPLE.map((c) => (c.id === 's1' ? { ...c, cv: { name: 'cv.pdf', size: 3, type: 'application/pdf', updatedAt: '2026-11-01' } } : c));
    const page = await openDashboard(withCv);
    await page.evaluate(() => CvStorage.save('s1', new File(['pdf'], 'cv.pdf', { type: 'application/pdf' })));
    await selectCards(page, ['s1', 's3']);
    await page.click('#selection-delete');
    await sleep(400);
    assert.equal(await page.evaluate(async () => !!(await CvStorage.get('s1'))), false, 'CV toujours en base');
    await page.click('.toast__action');
    await sleep(400);
    assert.equal(await page.evaluate(async () => (await CvStorage.get('s1')).name), 'cv.pdf');
    await page.close();
  });

  test('exporter la sélection, puis tout depuis l\'en-tête', async () => {
    const page = await openDashboard();
    // Espionner l'export sans rien télécharger
    await page.evaluate(() => {
      const original = buildCSV;
      window.buildCSV = (list, map) => {
        window.__exported = list.map((c) => c.id);
        return original(list, map);
      };
      HTMLAnchorElement.prototype.click = function () { window.__downloaded = this.download; };
    });
    await selectCards(page, ['s3', 's1']);
    await page.click('#selection-export');
    await sleep(200);
    assert.deepEqual(await page.evaluate(() => window.__exported), ['s1', 's3']);
    assert.match(await page.evaluate(() => window.__downloaded), /\.csv$/);
    assert.deepEqual((await selection(page)).ids.sort(), ['s1', 's3'], 'sélection perdue');

    await page.click('#selection-clear');
    await page.click('#btn-export');
    await sleep(200);
    assert.equal((await page.evaluate(() => window.__exported)).length, SAMPLE.length);
    await page.close();
  });

  test('glisser une carte cochée déplace toute la sélection ; une carte non cochée part seule', async () => {
    const page = await openDashboard();
    await selectCards(page, ['s4', 's5']);
    await dragTo(page, 's4', 'interview');
    assert.deepEqual((await columnIds(page, 'interview')).sort(), ['s2', 's4', 's5']);

    await dragTo(page, 's1', 'offer');
    assert.deepEqual((await columnIds(page, 'offer')).sort(), ['s1', 's6']);
    assert.deepEqual((await columnIds(page, 'interview')).sort(), ['s2', 's4', 's5']);
    await page.close();
  });

  test('les messages s\'affichent au-dessus de la barre', async () => {
    const page = await openDashboard();
    await selectCards(page, ['s4']);
    await chooseStatus(page, 'offer');
    await page.waitForSelector('.toast');
    const r = await page.evaluate(() => ({
      toast: document.querySelector('.toast').getBoundingClientRect().bottom,
      bar: document.querySelector('#selection-bar').getBoundingClientRect().top
    }));
    assert.ok(r.toast <= r.bar, JSON.stringify(r));
    await shot(page, 'selection-toast');
    await page.close();
  });
});
