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
