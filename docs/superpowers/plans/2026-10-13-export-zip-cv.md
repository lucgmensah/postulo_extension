# Plan d'implémentation : Export CSV + CV en archive ZIP

**Objectif :** Permettre l'exportation complète des données de suivi (fichier CSV) accompagnée de l'ensemble des fichiers CV rattachés au sein d'une archive `.zip`, ou du CSV seul s'il n'y a aucun CV.

**Architecture :** Un module Vanilla JS autonome `zip-builder.js` sans dépendance externe implémente l'écriture du format standard PKZIP (structures Local File Header, Central Directory, End of Central Directory, calcul CRC32). Dans `dashboard.js`, la fonction d'export interroge IndexedDB via `CvStorage`, compile le CSV et les blobs de CV dans un dossier `cv/` avec noms assainis sans collision, et déclenche le téléchargement.

**Tech Stack :** Vanilla JavaScript (ES2020+), IndexedDB, Blob / DataView / Uint8Array, Node.js test runner (`node:test`, `node:assert`).

---

### Tâche 1 : Création du module `zip-builder.js`

**Fichiers concernés :**
- Créer : `zip-builder.js`
- Test : `tests/unit/zip-builder.test.js`

**Étape 1 : Écrire le test unitaire pour `ZipBuilder`**
Tester la création d'un zip avec un fichier texte et un fichier binaire, et vérifier la signature PKZIP (`PK\x03\x04` pour 0x04034b50).

**Étape 2 : Exécuter le test pour vérifier l'échec**
Commande : `rtk npm test` ou `node --test tests/unit/zip-builder.test.js`
Attendu : FAIL (module non trouvé).

**Étape 3 : Implémenter `zip-builder.js`**
- Table CRC32 précalculée.
- Classe ou objet `ZipBuilder` avec méthode `addFile(path, content)` acceptant `string`, `Uint8Array`, `ArrayBuffer`, ou `Blob`.
- Méthode asynchrone `build()` qui génère un `Blob` avec MIME `application/zip`.
- Export compatible navigateur (`window.ZipBuilder`) et Node.js (`typeof module !== 'undefined' ? module.exports = ZipBuilder : null`).

**Étape 4 : Exécuter le test pour vérifier le succès**
Commande : `node --test tests/unit/zip-builder.test.js`
Attendu : PASS.

---

### Tâche 2 : Assainissement des noms et organisation des chemins

**Fichiers concernés :**
- Modifier : `shared.js` (ou `zip-builder.js`)
- Test : `tests/unit/shared.test.js`

**Étape 1 : Écrire le test pour `JobTracker.sanitizeFilename` et `JobTracker.buildCvZipPath`**
- Doit remplacer les caractères interdits (`/`, `\`, `:`, `*`, `?`, `"`, `<`, `>`, `|`) par des tirets bas.
- Doit générer un chemin unique : `cv/Acme_Dev-Front_mon-cv.pdf`.

**Étape 2 : Exécuter le test pour vérifier l'échec**
Commande : `node --test tests/unit/shared.test.js`
Attendu : FAIL.

**Étape 3 : Implémenter les méthodes dans `shared.js`**
Ajouter `JobTracker.sanitizeFilename(str)` et `JobTracker.buildCvZipPath(candidature, index)`.

**Étape 4 : Exécuter le test pour vérifier le succès**
Commande : `node --test tests/unit/shared.test.js`
Attendu : PASS.

---

### Tâche 5 : Intégration dans le Tableau de Bord (`dashboard.html` & `dashboard.js`)

**Fichiers concernés :**
- Modifier : `dashboard.html` (inclure `<script src="zip-builder.js"></script>`)
- Modifier : `dashboard.js` (`handleExport`)

**Étape 1 : Mettre à jour `dashboard.html`**
Ajouter le script `zip-builder.js` avant `dashboard.js` et renommer le bouton `btn-export` en « Exporter ».

**Étape 2 : Adapter `handleExport` dans `dashboard.js`**
- Compter le nombre de candidatures avec un CV rattaché (`c.cv`).
- Si aucun CV : exporter directement le CSV seul (`suivi_candidatures_AAAA-MM-JJ.csv`).
- Si au moins un CV :
  - Afficher un toast d'information (« Préparation de l'archive ZIP... »).
  - Créer une instance `ZipBuilder`.
  - Construire le CSV avec la colonne `CV adapté` indiquant le chemin relatif dans le zip (ex. `cv/Acme_Dev-Front_mon-cv.pdf`).
  - Ajouter le CSV à la racine du zip (`suivi_candidatures_AAAA-MM-JJ.csv`).
  - Pour chaque candidature avec CV, charger le blob via `CvStorage.get(c.id)` et l'ajouter au zip sous son chemin dédié.
  - Générer le blob ZIP et déclencher le téléchargement de `suivi_candidatures_AAAA-MM-JJ.zip`.

---

### Tâche 4 : Tests E2E Puppeteer

**Fichiers concernés :**
- Modifier : `tests/e2e/cv.e2e.js`

**Étape 1 : Ajouter un test E2E de l'export ZIP**
- Créer une candidature avec CV rattaché dans le dashboard.
- Déclencher le bouton `#btn-export`.
- Vérifier que l'archive ZIP générée ou le fichier téléchargé est bien produit sans erreur JavaScript dans la console.

**Étape 2 : Exécuter l'ensemble de la suite de tests**
Commande : `npm test` et `node --test tests/e2e/cv.e2e.js`
Attendu : 100% PASS.
