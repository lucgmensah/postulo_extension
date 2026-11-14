const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

global.window = global;
global.localStorage = {
  data: {},
  getItem(k) { return this.data[k] ?? null; },
  setItem(k, v) { this.data[k] = String(v); }
};
require(path.join(__dirname, '..', '..', 'shared.js'));
const J = window.JobTracker;

test('jobKey : identifiant Indeed (jk / vjk / indeed.fr)', () => {
  assert.equal(J.jobKey('https://fr.indeed.com/viewjob?jk=abc123&from=serp'), 'indeed:abc123');
  assert.equal(J.jobKey('https://fr.indeed.com/jobs?q=dev&vjk=abc123'), 'indeed:abc123');
  assert.equal(J.jobKey('https://www.indeed.fr/viewjob?jk=abc123'), 'indeed:abc123');
  assert.notEqual(J.jobKey('https://fr.indeed.com/viewjob?jk=aaa'), J.jobKey('https://fr.indeed.com/viewjob?jk=bbb'));
});

test('jobKey : identifiant LinkedIn (vue et currentJobId)', () => {
  assert.equal(J.jobKey('https://www.linkedin.com/jobs/view/4012345678/?trk=x'), 'linkedin:4012345678');
  assert.equal(J.jobKey('https://www.linkedin.com/jobs/view/dev-front-at-acme-4012345678'), 'linkedin:4012345678');
  assert.equal(J.jobKey('https://www.linkedin.com/jobs/search/?currentJobId=4012345678&keywords=dev'), 'linkedin:4012345678');
  assert.equal(J.jobKey('https://www.linkedin.com/jobs/collections/?jobId=4012345678'), 'linkedin:4012345678');
});

test('jobKey : WTTJ et URL générique', () => {
  assert.equal(J.jobKey('https://www.welcometothejungle.com/fr/companies/acme/jobs/dev_paris?q=1'), 'wttj:acme/dev_paris');
  assert.equal(J.jobKey('https://example.com/careers/42/?utm=x'), 'https://example.com/careers/42');
});

test('siteJobKey : null hors page d\'offre', () => {
  assert.equal(J.siteJobKey('https://www.linkedin.com/jobs/'), null);
  assert.equal(J.siteJobKey('https://fr.indeed.com/'), null);
  assert.equal(J.siteJobKey('https://indeed.fr/'), null);
});

test('isSupportedSite', () => {
  assert.ok(J.isSupportedSite('https://fr.indeed.com/viewjob?jk=1'));
  assert.ok(J.isSupportedSite('https://www.indeed.fr/viewjob?jk=1'));
  assert.ok(J.isSupportedSite('https://www.welcometothejungle.com/fr/jobs'));
  assert.ok(!J.isSupportedSite('https://evil-indeed.com.example.org/'));
});

test('jobKey : nouveaux sites', () => {
  assert.equal(J.jobKey('https://www.hellowork.com/fr-fr/emplois/83247207.html?utm=x'), 'hellowork:83247207');
  assert.equal(J.jobKey('https://candidat.francetravail.fr/offres/recherche/detail/216hqdm'), 'francetravail:216HQDM');
  assert.equal(J.jobKey('https://www.cadremploi.fr/emploi/detail_offre?offreId=156541529064953069&x=1'), 'cadremploi:156541529064953069');
  assert.equal(J.jobKey('https://hec.jobteaser.com/fr/job-offers/01202997-A1D9-4052-a335-7f9169ac5d1d-thales-stage'), 'jobteaser:01202997-a1d9-4052-a335-7f9169ac5d1d');
  assert.equal(J.jobKey('https://www.free-work.com/fr/tech-it/job-mission/architecte-solutions/Architecte-Metiers?a=1'), 'freework:architecte-solutions/architecte-metiers');
});

test('siteJobKey : null hors page d\'offre sur les nouveaux sites', () => {
  const pages = [
    'https://www.hellowork.com/fr-fr/emploi/recherche.html?k=dev',
    'https://candidat.francetravail.fr/offres/recherche?motsCles=dev',
    'https://www.cadremploi.fr/emploi/liste-offres/q-dev',
    'https://www.jobteaser.com/fr/job-offers?q=dev',
    'https://www.free-work.com/fr/tech-it/jobs?query=dev'
  ];
  for (const u of pages) {
    assert.equal(J.siteJobKey(u), null, u);
    assert.ok(J.isSupportedSite(u), u);
  }
});

test('siteOf : identifiant, noms, hôtes ressemblants refusés', () => {
  assert.equal(J.siteOf('https://www.hellowork.com/').id, 'hellowork');
  assert.ok(J.siteOf('https://fr.indeed.com/').names.includes('indeed'));
  assert.equal(J.siteOf('https://evil-hellowork.com.example.org/fr-fr/emplois/1.html'), null);
  assert.equal(J.siteOf('https://www.francetravail.fr/'), null);
  assert.equal(J.siteOf('pas une url'), null);
});

const LIST = [
  { id: '1', title: 'Dev', company: 'Acme', url: 'https://fr.indeed.com/viewjob?jk=aaa' },
  { id: '2', company: 'NoTitle' }
];

test('isDuplicate : offres Indeed différentes ne sont pas des doublons', () => {
  assert.ok(!J.isDuplicate(LIST, { title: 'Dev', company: 'Acme', url: 'https://fr.indeed.com/viewjob?jk=bbb' }));
  assert.ok(J.isDuplicate(LIST, { title: 'X', company: 'Y', url: 'https://fr.indeed.com/jobs?vjk=aaa' }));
});

test('isDuplicate : titre + entreprise sans URL, exclusion, titre vide', () => {
  assert.ok(J.isDuplicate(LIST, { title: ' dev ', company: 'ACME', url: '' }));
  assert.ok(!J.isDuplicate(LIST, { title: 'Dev', company: 'Acme', url: 'https://fr.indeed.com/viewjob?jk=aaa' }, '1'));
  assert.ok(!J.isDuplicate(LIST, { title: '', company: 'NoTitle' }));
});

test('findDuplicate renvoie la candidature correspondante', () => {
  const list = [{ id: '1', title: 'Dev', company: 'Acme', url: 'https://fr.indeed.com/viewjob?jk=aaa' }];
  assert.equal(J.findDuplicate(list, { url: 'https://fr.indeed.com/jobs?vjk=aaa' }).id, '1');
  assert.equal(J.findDuplicate(list, { url: 'https://fr.indeed.com/viewjob?jk=bbb', title: 'Dev', company: 'Acme' }), null);
  assert.equal(J.findDuplicate(list, { url: 'https://fr.indeed.com/viewjob?jk=aaa' }, '1'), null);
});

test('update relit le stockage avant d\'écrire', () => {
  J.saveAll([{ id: 'a' }]);
  J.saveAll([{ id: 'b' }, { id: 'a' }]); // ajout fait ailleurs
  let ids;
  J.update(l => [...l, { id: 'c' }], (ok, l) => { ids = l.map(x => x.id); });
  assert.deepEqual(ids, ['b', 'a', 'c']);
  let saved;
  J.update(() => null, (ok) => { saved = ok; });
  assert.equal(saved, false);
});

test('todayISO, generateId, escapeHTML', () => {
  assert.match(J.todayISO(), /^\d{4}-\d{2}-\d{2}$/);
  assert.match(J.generateId(), /^[0-9a-f-]{36}$/);
  assert.equal(J.escapeHTML('<a "x">'), '&lt;a &quot;x&quot;&gt;');
});

test('applyStatus : date du jour ajoutée seulement en passant à « envoyée » sans date', () => {
  const c = { id: 'a', status: 'wishlist', dateApplied: '' };
  const applied = J.applyStatus(c, 'applied');
  assert.equal(applied.status, 'applied');
  assert.equal(applied.dateApplied, J.todayISO());
  assert.equal(c.status, 'wishlist', 'objet d\'origine modifié');
  assert.equal(J.applyStatus({ status: 'wishlist', dateApplied: '2026-01-01' }, 'applied').dateApplied, '2026-01-01');
  assert.equal(J.applyStatus({ status: 'applied', dateApplied: '' }, 'interview').dateApplied, '');
});

// --- Actions sur plusieurs candidatures ---
const ids = (list) => list.map((c) => c.id).join(' ');
const FIVE = ['a', 'b', 'c', 'd', 'e'].map((id) => ({ id, status: 'wishlist', dateApplied: '' }));

test('removeByIds : retire les candidatures et note leur position d\'origine', () => {
  const { list, removed } = J.removeByIds(FIVE, ['d', 'b', 'inconnu']);
  assert.equal(ids(list), 'a c e');
  assert.deepEqual(removed.map((r) => [r.item.id, r.index]), [['b', 1], ['d', 3]]);
  assert.equal(ids(FIVE), 'a b c d e', 'liste d\'origine modifiée');
});

test('restoreRemoved : chaque candidature revient à sa position, sans doublon', () => {
  const { list, removed } = J.removeByIds(FIVE, ['b', 'd']);
  assert.equal(ids(J.restoreRemoved(list, removed)), 'a b c d e');
  // Une candidature ajoutée entre-temps (en tête) ne décale pas les positions d'origine
  assert.equal(ids(J.restoreRemoved([{ id: 'x' }, ...list], removed)), 'x b a d c e');
  // Déjà revenue ailleurs : pas de doublon
  assert.equal(ids(J.restoreRemoved([...list, FIVE[1]], removed)), 'a c e d b');
  assert.equal(J.restoreRemoved(FIVE, removed), null);
  assert.equal(ids(list), 'a c e', 'liste reçue modifiée');
});

test('applyStatusToIds : seules les candidatures visées changent', () => {
  const list = [{ id: 'a', status: 'wishlist', dateApplied: '' }, { id: 'b', status: 'wishlist', dateApplied: '' }, { id: 'c', status: 'interview', dateApplied: '2026-01-02' }];
  const updated = J.applyStatusToIds(list, ['a', 'c'], 'applied');
  assert.deepEqual(updated.map((c) => c.status), ['applied', 'wishlist', 'applied']);
  assert.equal(updated[0].dateApplied, J.todayISO());
  assert.equal(updated[2].dateApplied, '2026-01-02');
  assert.equal(updated[1], list[1]);
  assert.equal(list[0].status, 'wishlist', 'objet d\'origine modifié');
});

test('createCandidature : initialise le champ cv à null', () => {
  const c = J.createCandidature({ title: 'Dev' });
  assert.equal(c.cv, null);
  assert.equal(c.title, 'Dev');
});

test('validateCvFile : valide les extensions autorisées et la taille limite', () => {
  assert.equal(J.validateCvFile(null).valid, false);
  assert.equal(J.validateCvFile({ name: 'cv.exe', size: 1000 }).valid, false);
  assert.equal(J.validateCvFile({ name: 'cv.png', size: 1000 }).valid, false);
  
  // Extensions valides
  assert.equal(J.validateCvFile({ name: 'cv.pdf', size: 1000 }).valid, true);
  assert.equal(J.validateCvFile({ name: 'cv.doc', size: 1000 }).valid, true);
  assert.equal(J.validateCvFile({ name: 'CV_FINAL.DOCX', size: 1000 }).valid, true);

  // Dépassement de taille (> 10 Mo)
  assert.equal(J.validateCvFile({ name: 'cv.pdf', size: 11 * 1024 * 1024 }).valid, false);
});

test('formatFileSize : formate lisiblement les octets', () => {
  assert.equal(J.formatFileSize(0), '0 o');
  assert.equal(J.formatFileSize(500), '500 o');
  assert.equal(J.formatFileSize(2048), '2 Ko');
  assert.equal(J.formatFileSize(1.5 * 1024 * 1024), '1.5 Mo');
});

test('sanitizeFilename : supprime et remplace les caractères interdits', () => {
  assert.equal(J.sanitizeFilename('Acme / SAS : Projet*'), 'Acme_SAS_Projet');
  assert.equal(J.sanitizeFilename('  Test??? "Quotes" <> |  '), 'Test_Quotes');
  assert.equal(J.sanitizeFilename(''), 'fichier');
});

test('buildCvZipPath : génère un chemin préfixé sans caractères interdits', () => {
  const c = {
    company: 'Acme / Corp',
    title: 'Développeur Front-End',
    cv: { name: 'mon cv (v2).pdf' }
  };
  const path = J.buildCvZipPath(c);
  assert.equal(path, 'cv/Acme_Corp_Developpeur_Front-End_mon_cv_(v2).pdf');
});

