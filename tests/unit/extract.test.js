const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

require(path.join(__dirname, '..', '..', 'extract.js'));
const E = globalThis.JobExtract;
const POSTINGS = require('../fixtures/postings');

const posting = (jobLocation, extra = {}) => ({ '@type': 'JobPosting', title: 'Dév', jobLocation, ...extra });
const place = (address) => ({ '@type': 'Place', address });
const locationOf = (p) => E.postingFields(p).location;

// --- Fiches réelles ---
test('fiche Hello Work : poste, entreprise, « Ville (département) »', () => {
  assert.deepEqual(E.postingFields(POSTINGS.hellowork), {
    title: 'Développeur - Développeuse Flutter H/F',
    company: 'Alpee',
    location: 'Chambéry (73)'
  });
});

test('fiche LinkedIn : ville sans code postal', () => {
  assert.equal(locationOf(POSTINGS.linkedin), 'Montpellier');
  assert.equal(E.postingFields(POSTINGS.linkedin).company, 'Devoteam');
});

test('fiche Welcome to the Jungle : lieux en tableau', () => {
  const f = E.postingFields(POSTINGS.wttj);
  assert.equal(f.location, 'Paris (75)');
  assert.equal(f.company, 'Solarock');
});

test('fiche Cadremploi : adresse sans @type, pays écrit « France »', () => {
  const f = E.postingFields(POSTINGS.cadremploi);
  assert.equal(f.location, 'Malville (44)');
  assert.equal(f.company, 'MANPOWER FRANCE');
});

test('fiche JobTeaser : TELECOMMUTE avec un lieu est ignoré', () => {
  assert.equal(locationOf(POSTINGS.jobteaser), 'Cannes');
});

test('fiche Free-Work : pays étranger en toutes lettres', () => {
  assert.equal(locationOf(POSTINGS.freework), 'Genève, Suisse');
});

// --- Formes du lieu ---
test('plusieurs lieux : le premier, suivi de « +N »', () => {
  const p = posting([
    place({ addressLocality: 'Lyon', postalCode: '69003', addressCountry: 'FR' }),
    place({ addressLocality: 'Paris', postalCode: '75002', addressCountry: 'FR' })
  ]);
  assert.equal(locationOf(p), 'Lyon (69) +1');
});

test('aucun lieu : « Télétravail » seulement si la fiche le dit', () => {
  assert.equal(locationOf(posting(undefined, { jobLocationType: 'TELECOMMUTE' })), 'Télétravail');
  assert.equal(locationOf(posting(undefined)), '');
});

test('fiches mal formées : champ vide, jamais d\'exception', () => {
  assert.equal(locationOf(posting(place(null))), '');
  assert.equal(locationOf(posting(null)), '');
  assert.equal(locationOf(posting(place('Lille'))), 'Lille');
  assert.equal(locationOf(posting('Nantes')), 'Nantes');
  assert.equal(locationOf(posting(place({ addressLocality: 'Lille', addressCountry: { '@type': 'Country', name: 'FR' } }))), 'Lille');
  assert.equal(locationOf(posting(place({ addressRegion: 'Bretagne', addressCountry: 'FR' }))), 'Bretagne');
  assert.deepEqual(E.postingFields({ '@type': 'JobPosting' }), { title: '', company: '', location: '' });
  assert.equal(E.postingFields({ '@type': 'JobPosting', title: 'Dév', hiringOrganization: 'Acme' }).company, 'Acme');
});

test('un code postal étranger ne donne pas de département', () => {
  const p = posting(place({ addressLocality: 'Beverly Hills', postalCode: '90210', addressCountry: 'US' }));
  assert.equal(locationOf(p), 'Beverly Hills, États-Unis');
});

test('department', () => {
  assert.equal(E.department('73000'), '73');
  assert.equal(E.department('97400'), '974');
  assert.equal(E.department('20000'), '2A');
  assert.equal(E.department('20200'), '2B');
  assert.equal(E.department('9021'), '');
  assert.equal(E.department(null), '');
});

test('normalizeLocation : formes connues ramenées à « Ville (département) »', () => {
  assert.equal(E.normalizeLocation('69800 Saint-Priest'), 'Saint-Priest (69)');
  assert.equal(E.normalizeLocation('59 - DOUAI'), 'Douai (59)');
  assert.equal(E.normalizeLocation('Chambéry - 73'), 'Chambéry (73)');
  assert.equal(E.normalizeLocation('2A - AJACCIO'), 'Ajaccio (2A)');
  assert.equal(E.normalizeLocation('LA ROCHE SUR YON - 85'), 'La Roche sur Yon (85)');
  assert.equal(E.normalizeLocation('59 - VILLENEUVE D\'ASCQ'), 'Villeneuve d\'Ascq (59)');
});

test('normalizeLocation : un texte imprévu est rendu tel quel', () => {
  assert.equal(E.normalizeLocation('Paris, Île-de-France, France'), 'Paris, Île-de-France, France');
  assert.equal(E.normalizeLocation('Télétravail'), 'Télétravail');
  assert.equal(E.normalizeLocation('Lyon (69)'), 'Lyon (69)');
  assert.equal(E.normalizeLocation('  Lyon \n (69) '), 'Lyon (69)');
  assert.equal(E.normalizeLocation('  '), '');
  assert.equal(E.normalizeLocation(undefined), '');
});

// --- Lecture des fiches ---
test('parsePostings : objet, tableau, @graph, types multiples, JSON invalide', () => {
  const job = { '@type': 'JobPosting', title: 'Dév' };
  assert.deepEqual(E.parsePostings(['{ pas du json']), []);
  assert.deepEqual(E.parsePostings([JSON.stringify({ '@type': 'BreadcrumbList' })]), []);
  assert.equal(E.parsePostings([JSON.stringify({ '@graph': [{ '@type': 'WebSite' }, job] })]).length, 1);
  assert.equal(E.parsePostings([JSON.stringify({ '@type': ['JobPosting', 'Thing'], title: 'X' })]).length, 1);
  assert.equal(E.parsePostings([JSON.stringify([job, job]), 'null', JSON.stringify(job)]).length, 3);
  assert.deepEqual(E.parsePostings(undefined), []);
});

test('pickPosting : la fiche doit décrire l\'offre affichée', () => {
  const texts = [JSON.stringify(POSTINGS.hellowork)];
  const p = E.pickPosting(texts, ['Développeur - Développeuse Flutter H/F Alpee']);
  assert.equal(p.title, 'Développeur - Développeuse Flutter H/F');
  // Accents, casse et ponctuation ne comptent pas
  assert.ok(E.pickPosting(texts, ['developpeur développeuse FLUTTER (h/f) | Hellowork']));
  // Fiche d'une autre offre (navigation interne)
  assert.equal(E.pickPosting(texts, ['Data Engineer H/F | Hellowork', '']), null);
  assert.equal(E.pickPosting(texts, []), null);
  assert.equal(E.pickPosting([JSON.stringify({ '@type': 'JobPosting', title: '' })], ['Dév']), null);
});

test('pickPosting : fiche rejetée si son adresse désigne une autre offre du site', () => {
  const texts = [JSON.stringify(POSTINGS.hellowork)];
  const titles = ['Développeur - Développeuse Flutter H/F'];
  const keyOf = (url) => (url.match(/emplois\/(\d+)/) || [])[1] || null;
  assert.ok(E.pickPosting(texts, titles, { pageUrl: 'https://www.hellowork.com/fr-fr/emplois/83247207.html', keyOf }));
  assert.equal(E.pickPosting(texts, titles, { pageUrl: 'https://www.hellowork.com/fr-fr/emplois/111.html', keyOf }), null);
  // Page sans clé (site non déclaré) : le titre suffit
  assert.ok(E.pickPosting(texts, titles, { pageUrl: 'https://exemple.org/offre', keyOf }));
});

// --- Résolution ---
test('stripSiteName : retire le nom du site en fin de titre, rien d\'autre', () => {
  assert.equal(E.stripSiteName('Dév Java - Acme | LinkedIn', ['linkedin']), 'Dév Java - Acme');
  assert.equal(E.stripSiteName('Dév Java - Indeed.com', ['indeed', 'indeed.com']), 'Dév Java');
  assert.equal(E.stripSiteName('Chef de projet - CDI', ['indeed']), 'Chef de projet - CDI');
  assert.equal(E.stripSiteName('Dév', []), 'Dév');
});

test('resolve : secours du titre de page, nom du site retiré de l\'entreprise', () => {
  const r = E.resolve({
    posting: null,
    found: { title: '', company: '', location: '' },
    fallback: { title: 'Dév | Hellowork', company: 'Hellowork' },
    names: ['hellowork', 'hello work'],
    isJobPage: true
  });
  assert.deepEqual(r, { success: true, confident: false, title: 'Dév', company: '', location: '' });
});

test('resolve : le nom du site n\'est jamais pris pour l\'entreprise', () => {
  const names = ['hellowork', 'hello work'];
  const base = { posting: null, found: { title: 'Dév' }, names, isJobPage: true };
  // og:site_name vaut parfois l'adresse du site
  assert.equal(E.resolve({ ...base, fallback: { company: 'www.hellowork.com' } }).company, '');
  assert.equal(E.resolve({ ...base, fallback: { company: 'Acme' } }).company, 'Acme');
  // Une entreprise lue sur l'offre garde son nom, même s'il contient celui du site
  assert.equal(E.resolve({ ...base, found: { title: 'Dév', company: 'Hellowork Group' }, fallback: {} }).company, 'Hellowork Group');
  assert.equal(E.resolve({ ...base, found: { title: 'Dév', company: 'HelloWork' }, fallback: {} }).company, '');
});

test('resolve : la fiche passe avant les repères, champ par champ', () => {
  const r = E.resolve({
    posting: { '@type': 'JobPosting', title: 'Dév Java', hiringOrganization: { name: 'Acme' } },
    found: { title: 'Dév Java Acme', company: 'Postuler', location: '59 - DOUAI' },
    fallback: { title: 'x', company: 'y' },
    names: [],
    isJobPage: true
  });
  assert.deepEqual(r, { success: true, confident: true, title: 'Dév Java', company: 'Acme', location: 'Douai (59)' });
});

test('resolve : hors site déclaré, il faut une fiche', () => {
  const found = { title: 'Dév', company: '', location: '' };
  const base = { found, fallback: {}, names: [], isJobPage: false };
  assert.equal(E.resolve({ ...base, posting: null }).success, false);
  const withPosting = E.resolve({ ...base, posting: { '@type': 'JobPosting', title: 'Dév' } });
  assert.equal(withPosting.success, true);
  assert.equal(withPosting.confident, true);
});

test('resolve : sans aucun titre, pas d\'offre', () => {
  const r = E.resolve({ posting: null, found: {}, fallback: {}, names: [], isJobPage: true });
  assert.equal(r.success, false);
  assert.equal(r.title, '');
});
