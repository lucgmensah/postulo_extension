# Extraction fiable des offres et nouveaux sites - Plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Objectif :** Pré-remplir correctement le poste, l'entreprise et le lieu sur huit sites d'emploi, et reconnaître une offre sur tout site qui publie une fiche `JobPosting`.

**Architecture :** Une table de sites dans `shared.js` donne l'hôte et la clé d'offre. Un nouveau module pur `extract.js` lit les fiches JSON-LD, met le lieu en forme et choisit la valeur de chaque champ. `content.js` ne fait plus que collecter les textes de la page, dans l'ordre de priorité, et délègue à `extract.js`.

**Technique :** JavaScript sans build ni dépendance, `node:test` pour les tests unitaires, Puppeteer pour les tests de bout en bout.

**Spec :** `docs/superpowers/specs/2026-11-14-extraction-offres-design.md`

## Contraintes globales

- Aucune dépendance, aucun appel réseau, aucune étape de build ajoutés.
- Un lieu faux est pire qu'un lieu vide : en cas de doute, chaîne vide.
- Le widget ne s'affiche que si `JobTracker.siteJobKey(url)` est non nul.
- Les clés existantes ne changent pas : `linkedin:{id}`, `indeed:{id}`, `wttj:{entreprise}/{offre}` en minuscules.
- `scrapeJobDetails()` garde sa forme `{ success, title, company, location, url }` ; le champ `confident` s'y ajoute.
- Fichiers chargés par `var X = globalThis.X || (…)` : ils sont réinjectables sans erreur.
- Commentaires et libellés en français.

## Points de vigilance

1. **Fiche d'une autre offre** (navigation interne) : elle est rejetée, les repères prennent le relais. Test : tâche 2, `pickPosting`.
2. **Page pas encore rendue** quand le widget se crée : le lieu arrive ensuite. Test : tâche 4.
3. **Fiche mal formée** (JSON invalide, `jobLocation` en tableau, adresse en chaîne, pays en objet, champs nuls) : aucune exception, champ vide. Test : tâche 2.
4. **Hôte ressemblant** (`evil-hellowork.com.example.org`) : non reconnu. Test : tâche 1.
5. **Texte de lieu imprévu** (« Télétravail », « Paris, Île-de-France, France ») : rendu tel quel, jamais tronqué en une fausse ville. Test : tâche 2, `normalizeLocation`.

---

### Task 1 : Table des sites dans `shared.js`

**Fichiers :**
- Modifier : `shared.js` (section « IDENTIFICATION DES OFFRES »)
- Test : `tests/unit/shared.test.js`

**Interfaces :**
- Produit : `JobTracker.siteOf(url) → { id, names } | null` ; `JobTracker.siteJobKey(url)` et `JobTracker.isSupportedSite(url)` inchangés pour l'appelant.

| `id` | Domaines | `names` | Clé |
|---|---|---|---|
| `linkedin` | `linkedin.com` | `linkedin` | inchangée |
| `indeed` | `indeed.com`, `indeed.fr` | `indeed`, `indeed.com` | inchangée |
| `wttj` | `welcometothejungle.com` | `welcome to the jungle` | inchangée |
| `hellowork` | `hellowork.com` | `hellowork`, `hello work` | chemin `/emplois/(\d+)\.html` |
| `francetravail` | `candidat.francetravail.fr` | `france travail` | chemin `/offres/recherche/detail/([A-Za-z0-9]+)`, en majuscules |
| `cadremploi` | `cadremploi.fr` | `cadremploi` | chemin `/emploi/detail_offre` et paramètre `offreId` |
| `jobteaser` | `jobteaser.com` | `jobteaser` | UUID après `/job-offers/`, en minuscules |
| `freework` | `free-work.com` | `free-work`, `freework` | `/tech-it/job-mission/{a}/{b}` → `{a}/{b}` en minuscules |

- [ ] **Étape 1 : tests**

```js
test('jobKey : nouveaux sites', () => {
  assert.equal(J.jobKey('https://www.hellowork.com/fr-fr/emplois/83247207.html?utm=x'), 'hellowork:83247207');
  assert.equal(J.jobKey('https://candidat.francetravail.fr/offres/recherche/detail/216hqdm'), 'francetravail:216HQDM');
  assert.equal(J.jobKey('https://www.cadremploi.fr/emploi/detail_offre?offreId=156541529064953069&x=1'), 'cadremploi:156541529064953069');
  assert.equal(J.jobKey('https://hec.jobteaser.com/fr/job-offers/01202997-A1D9-4052-a335-7f9169ac5d1d-thales-stage'), 'jobteaser:01202997-a1d9-4052-a335-7f9169ac5d1d');
  assert.equal(J.jobKey('https://www.free-work.com/fr/tech-it/job-mission/architecte-solutions/Architecte-Metiers?a=1'), 'freework:architecte-solutions/architecte-metiers');
});
test('siteJobKey : null hors page d\'offre sur les nouveaux sites', () => {
  for (const u of ['https://www.hellowork.com/fr-fr/emploi/recherche.html?k=dev', 'https://candidat.francetravail.fr/offres/recherche?motsCles=dev',
    'https://www.cadremploi.fr/emploi/liste-offres/q-dev', 'https://www.jobteaser.com/fr/job-offers?q=dev', 'https://www.free-work.com/fr/tech-it/jobs?query=dev']) {
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
```

- [ ] **Étape 2 :** `npm test` → échec (`siteOf is not a function`).
- [ ] **Étape 3 :** écrire la table `SITES` (`{ id, domains, names, key(u: URL) → string | null }`), `siteOf`, et faire découler `siteJobKey` (`${id}:${clé}`) et `isSupportedSite` de la table.
- [ ] **Étape 4 :** `npm test` → tout passe, y compris les tests existants de `jobKey`.

---

### Task 2 : `extract.js`, fiches et lieu

**Fichiers :**
- Créer : `extract.js`, `tests/unit/extract.test.js`, `tests/fixtures/postings.js` (fiches réelles des six sites, sans leur description)

**Interfaces :**
- Produit, sur `globalThis.JobExtract` :
  - `clean(str) → string`
  - `parsePostings(texts: string[]) → object[]` : objets `JobPosting` trouvés (objet seul, tableau, `@graph`, `@type` chaîne ou tableau) ; JSON invalide ignoré.
  - `pickPosting(texts, pageTitles: string[], { pageUrl, keyOf } = {}) → object | null` : première fiche dont le titre normalisé (minuscules, sans accents, ponctuation → espaces) est contenu dans un des `pageTitles`. Rejetée si `keyOf(posting.url)` et `keyOf(pageUrl)` sont non nuls et différents.
  - `postingFields(posting) → { title, company, location }`
  - `department(postalCode) → string` : `'73'`, `'971'`, `'2A'`, `'2B'` (20000-20199 → 2A), `''` sinon.
  - `normalizeLocation(text) → string`
  - `stripSiteName(title, names: string[]) → string` : retire le dernier segment après ` | `, ` - `, ` – ` ou ` — ` s'il contient un des noms.
  - `resolve({ posting, found, fallback, names, isJobPage }) → { success, confident, title, company, location }` où `found` et `fallback` sont `{ title, company, location }` en texte brut.

Règles de `resolve` : chaque champ prend la fiche, sinon `found`, sinon `fallback` (poste : `stripSiteName` ; lieu : pas de secours). L'entreprise est vidée si elle est égale à un des `names`. Le lieu issu de `found` passe par `normalizeLocation`. `confident` = le poste vient de la fiche ou de `found`. `success` = poste non vide et (`isJobPage` ou fiche).

- [ ] **Étape 1 : tests** (valeurs attendues, à écrire avec les fiches de `tests/fixtures/postings.js`)

| Entrée | Attendu |
|---|---|
| Fiche Hello Work (Chambéry, 73000, FR, `TELECOMMUTE`) | `{ title: 'Développeur - Développeuse Flutter H/F', company: 'Alpee', location: 'Chambéry (73)' }` |
| Fiche LinkedIn (Montpellier, sans code postal) | lieu `'Montpellier'` |
| Fiche Welcome to the Jungle (`jobLocation` en tableau, Paris 75011) | lieu `'Paris (75)'`, entreprise `'Solarock'` |
| Fiche Cadremploi (`addressCountry: 'France'`, sans `@type`) | lieu `'Malville (44)'`, entreprise `'MANPOWER FRANCE'` |
| Fiche JobTeaser (Cannes, « France », `TELECOMMUTE`) | lieu `'Cannes'` |
| Fiche Free-Work (Genève, `CH`) | lieu `'Genève, Suisse'` |
| Deux lieux (Lyon 69003, Paris 75002) | `'Lyon (69) +1'` |
| Aucun lieu, `TELECOMMUTE` | `'Télétravail'` |
| Aucun lieu, pas de `TELECOMMUTE` ; adresse `null` ; adresse en chaîne `'Lille'` ; pays `{ name: 'FR' }` | `''` ; `''` ; `'Lille'` ; pas de pays affiché |
| `department` : `'73000'`, `'97400'`, `'20000'`, `'20200'`, `'9021'`, `null` | `'73'`, `'974'`, `'2A'`, `'2B'`, `''`, `''` |
| `normalizeLocation` : `'69800 Saint-Priest'`, `'59 - DOUAI'`, `'Chambéry - 73'`, `'2A - AJACCIO'`, `'LA ROCHE SUR YON - 85'` | `'Saint-Priest (69)'`, `'Douai (59)'`, `'Chambéry (73)'`, `'Ajaccio (2A)'`, `'La Roche sur Yon (85)'` |
| `normalizeLocation` : `'Paris, Île-de-France, France'`, `'Télétravail'`, `'Lyon (69)'`, `'  '` | inchangés, `''` pour le dernier |
| `parsePostings` : JSON invalide, `BreadcrumbList`, `@graph` avec une fiche, `@type: ['JobPosting']` | `[]`, `[]`, 1 fiche, 1 fiche |
| `pickPosting` : titre « Dév Java H/F », page « Data Engineer \| Site » | `null` |
| `pickPosting` : même titre, mais `url` d'une autre offre du même site | `null` |
| `pickPosting` : titre « Développeur - Développeuse Flutter H/F », page « Développeur - Développeuse Flutter H/F Alpee » | la fiche |
| `stripSiteName('Dév Java - Acme \| LinkedIn', ['linkedin'])` ; `stripSiteName('Chef de projet - CDI', ['indeed'])` | `'Dév Java - Acme'` ; inchangé |
| `resolve` sans fiche, `found.title` vide, `fallback.title: 'Dév \| Hellowork'`, `fallback.company: 'Hellowork'`, `isJobPage: true` | `{ success: true, confident: false, title: 'Dév', company: '', location: '' }` |
| `resolve` avec fiche, `isJobPage: false` | `success: true`, `confident: true` |
| `resolve` sans fiche, `isJobPage: false`, titre trouvé | `success: false` |
| `resolve` : fiche sans lieu, `found.location: '59 - DOUAI'` | lieu `'Douai (59)'` |

- [ ] **Étape 2 :** `npm test` → échec (module absent).
- [ ] **Étape 3 :** écrire `extract.js`. Nom du pays : `FR`, `FRA`, `France` → rien ; code à deux lettres → `Intl.DisplayNames(['fr'], { type: 'region' })` ; autre texte → tel quel. Une ville tout en majuscules est remise en casse de titre, les mots `de, du, des, la, le, les, sur, sous, en, et, aux, d', l'` restant en minuscules hors début.
- [ ] **Étape 4 :** `npm test` → tout passe.

---

### Task 3 : collecte par site dans `content.js`, pages enregistrées, manifeste

**Fichiers :**
- Créer : `tests/e2e/pages/*.html` (une page réelle réduite par site), `tests/e2e/extraction.e2e.js`
- Modifier : `content.js` (`scrapeJobDetails`), `manifest.json`, `popup.js` (liste des fichiers injectés), `tests/e2e/harness.js`

**Interfaces :**
- Consomme : `JobTracker.siteOf`, `JobTracker.siteJobKey`, `JobExtract.pickPosting`, `JobExtract.postingFields`, `JobExtract.resolve`.
- Produit : `harness.serveFixture(page, html)` (interception : le document principal reçoit `html`, les requêtes `chrome-extension:` continuent, le reste est abandonné) et `harness.widgetFields(page) → { title, company, location }` (ouvre le panneau du widget et lit ses champs).

- [ ] **Étape 1 : test de bout en bout**, une ligne par page enregistrée, avec et sans fiche (`sansFiche` retire les `script[type="application/ld+json"]` avant de servir la page) :

| Page | Adresse servie | Attendu | Attendu sans fiche |
|---|---|---|---|
| `linkedin.html` | `https://fr.linkedin.com/jobs/view/developpeur-java-h-f-at-devoteam-4368990276` | Développeur Java H/F · Devoteam · Montpellier | identique |
| `indeed.html` | `https://fr.indeed.com/jobs?q=developpeur&l=Lyon&vjk=6b4309b9ec009bc4` | Développeur fullstack confirmé · 2-M · Saint-Priest (69) | (pas de fiche) |
| `wttj.html` | `https://www.welcometothejungle.com/fr/companies/solarock-fr/jobs/customer-success-deployment-manager-reseau-powered-by-solarock-h-f_paris` | Customer Success & Deployment Manager, Réseau Powered by Solarock (H/F) · Solarock · Paris (75) | même poste, même entreprise, lieu vide |
| `hellowork.html` | `https://www.hellowork.com/fr-fr/emplois/83247207.html` | Développeur - Développeuse Flutter H/F · Alpee · Chambéry (73) | identique |
| `francetravail.html` | `https://candidat.francetravail.fr/offres/recherche/detail/216HQDM` | Développeur / Développeuse front-end (H/F) · (vide) · Sene (56) | (pas de fiche) |
| `cadremploi.html` | `https://www.cadremploi.fr/emploi/detail_offre?offreId=156541529064953069` | Développeur informatique Chargé de projet - CDI (44) (H/F) · MANPOWER FRANCE · Malville (44) | même poste |
| `jobteaser.html` | `https://www.jobteaser.com/fr/job-offers/01202997-a1d9-4052-a335-7f9169ac5d1d-thales-stage-technicien-developpeur-web-h-f` | Stage - Technicien Développeur Web - (H/F) · Thales · Cannes | même poste |
| `freework.html` | `https://www.free-work.com/fr/tech-it/job-mission/responsable-qualite-qa-manager/responsable-qualite-logiciel-1` | Responsable Qualité Logiciel · Avanda · Genève, Suisse | même poste |

Une page de recherche Hello Work (`…/emploi/recherche.html`) ne doit afficher aucun widget.

- [ ] **Étape 2 :** `npm run e2e -- --test-name-pattern=extraction` → échec.
- [ ] **Étape 3 :** `manifest.json` : `extract.js` entre `shared.js` et `ui.js` ; ajouter `https://*.hellowork.com/*`, `https://candidat.francetravail.fr/*`, `https://*.cadremploi.fr/*`, `https://*.jobteaser.com/*`, `https://*.free-work.com/*` aux deux listes `matches`. `popup.js` : `files: ['shared.js', 'extract.js', 'ui.js', 'content.js']`.
- [ ] **Étape 4 :** réécrire `scrapeJobDetails` autour d'une table `SCRAPERS[id] = { root?, title, company, location }`, chaque champ étant une liste ordonnée de sélecteurs CSS ou de fonctions `(root) → string`, parcourue par `firstText(root, liste)`. Repères vérifiés sur les pages réelles :
  - `indeed` : racine `#jobsearch-ViewjobPaneWrapper` sinon le document ; poste `[data-testid='vj-job-title']` (retirer un suffixe ` - job post`) ; entreprise `[data-testid='desktop-job-header'] a[href*='/cmp/']` ; lieu = premier enfant du second groupe de la première ligne de `[data-testid='company-info-metadata']`, sinon les anciens repères, sinon la carte `a[data-jk="{jk}"]` → `.job_seen_beacon` → `[data-testid='text-location']` (garder le segment contenant un code postal ou « (dd) »).
  - `wttj` : poste `[data-testid='job-header'] h1 > span:first-child` ; entreprise `[data-testid='job-header'] h1 a[href*='/companies/']`, puis le nom tiré de l'URL.
  - `hellowork` : poste `[data-cy='jobTitle']` ; entreprise `h1 a[href*='/entreprises/']`, sinon le texte du `h1` moins le poste ; lieu `h1 + ul li:first-child`.
  - `francetravail` : poste `.sticky-title-container .title`, sinon le titre de page (`Offre d'emploi {poste} - {dép} - {VILLE} - {id} | France Travail`) ; lieu `.title-complementary .location`, sinon le même titre de page.
  - `linkedin` : repères actuels dans le même ordre, sans `h1` ni `a[href*='/company/']` nus en tête ; ajouter `.job-details-jobs-unified-top-card__primary-description-container .tvm__text` pour le lieu (non vérifié, vue connectée).
  - `cadremploi`, `jobteaser` : poste `h1`. `jobteaser` : lieu `[class*='CandidacyDetails__Locations']`. `freework` : poste `h1` sans le préfixe « Offre d'emploi ».
- [ ] **Étape 5 :** `npm run e2e -- --test-name-pattern=extraction` et `npm test` → tout passe.

---

### Task 4 : relire la page au bon moment

**Fichiers :**
- Modifier : `content.js` (`refreshWidget`, `injectFloatingWidget`)
- Test : `tests/e2e/extraction.e2e.js`

- [ ] **Étape 1 : tests.** (a) La page Hello Work est servie sans son en-tête ni sa fiche ; un script de la page les insère après 3 s. Après 4 s, on ouvre le panneau : les trois champs valent Développeur - Développeuse Flutter H/F · Alpee · Chambéry (73). (b) Même page ; on ouvre le panneau, on saisit « Mon titre » dans le poste, on ferme, on rouvre : le poste vaut toujours « Mon titre ».
- [ ] **Étape 2 :** exécuter → (a) échoue (lieu vide).
- [ ] **Étape 3 :** dans `refreshWidget`, réessayer aussi tant que `details.confident` est faux (mêmes `MAX_RETRIES` et délai). Dans `injectFloatingWidget`, à chaque ouverture du panneau, relire la page ; pour chaque champ dont la valeur est encore celle posée automatiquement, appliquer la nouvelle valeur si elle est non vide et si la clé de l'offre n'a pas changé.
- [ ] **Étape 4 :** exécuter → tout passe ; `npm run e2e -- --test-name-pattern=widget` reste au vert (réseau requis).

---

### Task 5 : documentation et version

**Fichiers :**
- Modifier : `readme.md`, `docs.md`, `manifest.json` (`version` → `1.1.0`)

- [ ] **Étape 1 :** remplacer chaque liste « LinkedIn, Indeed et Welcome to the Jungle » par les huit sites ; préciser que la popup reconnaît aussi les offres des sites publiant une fiche standard ; décrire les tests hors ligne (`tests/e2e/pages/`) dans la section des tests du `readme.md`.
- [ ] **Étape 2 :** `npm test` puis `npm run e2e` → tout passe.
- [ ] **Étape 3 :** `git add -A && git commit -m "feat: extraction fiable des offres et cinq nouveaux sites"`

## Non couvert par un test automatique

La reconnaissance par la popup sur un site non déclaré passe par `activeTab`, que seul un vrai clic sur l'icône accorde. La règle (`success` avec une fiche valide hors site déclaré) est couverte par les tests unitaires de `resolve` ; la collecte est la même que sur les sites déclarés.
