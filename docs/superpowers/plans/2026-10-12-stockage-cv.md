# Plan d'implémentation : Stockage et gestion du CV adapté

**Objectif :** Permettre d'associer un CV (.pdf, .doc, .docx - max 10 Mo) à chaque candidature avec stockage binaire local (IndexedDB), consultation rapide (visualisation/téléchargement), badge indicateur sur les cartes et export CSV.

**Architecture :**
- Un module utilitaire natif `cv-storage.js` encapsule IndexedDB pour stocker les fichiers binaires (`Blob`) associés à `candidatureId`.
- `shared.js` (`JobTracker`) gère les métadonnées légères `{ cv: { name, size, type, updatedAt } }` dans `chrome.storage.local`.
- `ui.js` fournit le composant d'import/gestion de CV ainsi que le badge sur les cartes du Kanban et de la liste.
- `dashboard.js` et `popup.js` intègrent ce composant dans leurs vues détail, avec synchronisation et suppression en cascade.

**Tech Stack :** IndexedDB natif, Chrome Extension MV3, Vanilla JavaScript, CSS Tokens, `node:test`, Puppeteer.

**Spec :** `docs/superpowers/specs/2026-10-12-stockage-cv-design.md`

---

### Tâche 1 : Module de stockage IndexedDB (`cv-storage.js`)

**Fichiers concernés :**
- Créer : `cv-storage.js`
- Créer : `tests/unit/cv-storage.test.js`

**Étape 1 : Écrire le test unitaire pour `CvStorage`**
- Tester l'enregistrement d'un Blob, la récupération, la vérification de métadonnées, et la suppression.

**Étape 2 : Exécuter le test pour vérifier l'échec initial**
- Exécuter : `node --test tests/unit/cv-storage.test.js`

**Étape 3 : Implémenter `cv-storage.js`**
- Ouvrir la base `postulo_db`, créer l'ObjectStore `cv_files`.
- Exposer `CvStorage.save(id, file)`, `CvStorage.get(id)`, `CvStorage.delete(id)`, `CvStorage.downloadOrOpen(id, name)`.

**Étape 4 : Valider le passage du test unitaire**
- Exécuter : `node --test tests/unit/cv-storage.test.js`

---

### Tâche 2 : Métadonnées et validation dans `shared.js`

**Fichiers concernés :**
- Modifier : `shared.js`
- Modifier : `tests/unit/candidatures.test.js` (ou créer `tests/unit/cv-metadata.test.js`)

**Étape 1 : Écrire les tests pour le champ `cv` et les validateurs**
- Vérifier que `createCandidature()` initialise `cv: null`.
- Tester la fonction de validation de fichier (extension autorisée `.pdf`, `.doc`, `.docx` et taille max 10 Mo).

**Étape 2 : Implémenter dans `shared.js`**
- Ajouter `cv: null` dans `createCandidature(fields)`.
- Ajouter `JobTracker.validateCvFile(file)` renvoyant `{ valid: boolean, error?: string }`.

**Étape 3 : Valider les tests unitaires**
- Exécuter : `node --test tests/unit/*.test.js`

---

### Tâche 3 : Composant UI et Styles CSS (`ui.js`, `components.css`)

**Fichiers concernés :**
- Modifier : `components.css`
- Modifier : `ui.js`

**Étape 1 : Ajouter les styles CSS**
- Styles pour la zone de dépôt (dropzone pointillée, état survol, état rempli).
- Styles pour l'affichage du fichier joint (icône, nom de fichier tronqué, actions).
- Styles pour le badge trombone sur `.job-card`.

**Étape 2 : Ajouter les renderers dans `ui.js`**
- `UI.cvField(candidature, options)` : rend l'état vide ou l'état fichier joint.
- Modifier `UI.jobCard()` pour afficher le badge document/trombone si `candidature.cv` existe.

---

### Tâche 4 : Intégration au Dashboard et Export CSV (`dashboard.html`, `dashboard.js`)

**Fichiers concernés :**
- Modifier : `dashboard.html`
- Modifier : `dashboard.js`

**Étape 1 : Mettre à jour `dashboard.html`**
- Inclure `<script src="cv-storage.js"></script>`.
- Ajouter la section `<div id="f-cv"></div>` dans le panneau de formulaire `#panel-form`.

**Étape 2 : Câbler la logique dans `dashboard.js`**
- Câbler le glisser-déposer et le changement de fichier.
- Actions "Visualiser / Télécharger", "Remplacer", "Supprimer".
- Mettre à jour l'export CSV pour inclure la colonne « CV adapté ».
- Gérer la suppression en cascade du CV après expiration du toast d'annulation (Undo).

---

### Tâche 5 : Intégration à la Popup (`popup.html`, `popup.js`)

**Fichiers concernés :**
- Modifier : `popup.html`
- Modifier : `popup.js`

**Étape 1 : Mettre à jour `popup.html`**
- Inclure `<script src="cv-storage.js"></script>`.

**Étape 2 : Câbler dans la vue détail de `popup.js`**
- Intégrer la consultation et l'import rapide du CV dans la vue détail de la popup.

---

### Tâche 6 : Tests E2E et validation finale

**Fichiers concernés :**
- Créer : `tests/e2e/cv-upload.e2e.js`

**Étape 1 : Écrire le test E2E Puppeteer**
- Tester l'ouverture du dashboard, le téléversement d'un fichier CV sur une candidature, la présence du badge sur la carte Kanban, et la persistance.

**Étape 2 : Lancer tous les tests**
- `npm test`
- `npm run e2e`
