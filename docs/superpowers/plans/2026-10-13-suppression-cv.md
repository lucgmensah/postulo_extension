# Plan d'implémentation : Suppression immédiate du CV et bouton explicite de suppression

**Objectif :** Supprimer immédiatement le fichier CV d'IndexedDB lors de la suppression d'une offre (avec restauration si annulation dans les 5s), et ajouter un bouton d'action explicite « Supprimer » sur la carte du CV permettant de supprimer le CV en un clic sans devoir soumettre tout le formulaire.

**Architecture :** 
1. `ui.js` met à jour le composant `cvFieldHTML` pour afficher un bouton explicite `btn btn--danger btn--sm` portant le libellé « Supprimer ».
2. `dashboard.js` :
   - `renderPanelCv()` : le callback `onDelete` supprime directement le CV en base (IndexedDB + stockage de la candidature) si la candidature existe déjà, et rafraîchit la vue.
   - `deleteCandidature()` : sauvegarde temporaire en mémoire du binaire, suppression immédiate dans IndexedDB (sans délai d'attente), et restauration du binaire si le bouton « Annuler » est cliqué pendant les 5 secondes.
3. `popup.js` : harmonisation du bouton « Supprimer » dans le détail de la popup.
4. Tests unitaires (`tests/unit/ui.test.js`) et tests E2E (`tests/e2e/cv.e2e.js`).

---

### Tâche 1 : Bouton explicite « Supprimer » dans `ui.js`

**Fichiers concernés :**
- Modifier : `ui.js:220-230`
- Modifier : `tests/unit/ui.test.js`

**Étape 1 : Écrire le test unitaire qui vérifie la présence du bouton « Supprimer »**
Tester que `UI.cvFieldHTML` contient bien `<button ... class="btn btn--danger btn--sm" ...>Supprimer</button>`.

**Étape 2 : Exécuter le test pour vérifier l'échec**
Commande : `node --test tests/unit/ui.test.js`
Attendu : FAIL (attente du bouton textuel).

**Étape 3 : Implémenter le changement dans `ui.js`**
Remplacer la balise `icon-btn` par `<button type="button" class="btn btn--danger btn--sm" id="${idPrefix}-btn-delete" title="Supprimer le CV">Supprimer</button>`.

**Étape 4 : Exécuter le test pour vérifier le succès**
Commande : `node --test tests/unit/ui.test.js`
Attendu : PASS.

---

### Tâche 2 : Suppression immédiate du CV et de l'offre dans `dashboard.js`

**Fichiers concernés :**
- Modifier : `dashboard.js` (`renderPanelCv`, `deleteCandidature`)

**Étape 1 : Mise à jour de `renderPanelCv` pour suppression directe**
Dans `onDelete` :
- Si `state.panelId && state.panelId !== 'new'` :
  - Supprimer dans IndexedDB via `await CvStorage.delete(state.panelId)`.
  - Mettre à jour `chrome.storage.local` via `JobTracker.update` pour mettre `cv: null`.
  - Mettre à jour l'état local `state.panelCv = null`, `state.pendingCvFile = null`.
  - Ré-afficher la dropzone (`renderPanelCv()`).
  - Mettre à jour les colonnes Kanban (`render()`).
  - Afficher le toast « CV supprimé ».
- Si `state.panelId === 'new'` :
  - Réinitialiser `state.panelCv` et `state.pendingCvFile`.
  - Ré-afficher la dropzone (`renderPanelCv()`).
  - Afficher le toast « CV retiré ».

**Étape 2 : Mise à jour de `deleteCandidature` pour suppression immédiate en base**
- Avant de supprimer la candidature, récupérer le binaire : `const cvRecord = await CvStorage.get(id);`.
- Supprimer immédiatement d'IndexedDB : `await CvStorage.delete(id);`.
- Si l'utilisateur clique sur « Annuler » dans le toast de 5s :
  - Si `cvRecord && cvRecord.file`, réinsérer le fichier dans IndexedDB : `await CvStorage.save(id, cvRecord.file);`.

---

### Tâche 3 : Harmonisation dans la Popup (`popup.js`)

**Fichiers concernés :**
- Modifier : `popup.js` (vue détail)

**Étape 1 : Vérifier et adapter le bouton « Supprimer » dans `view-detail`**
Afficher `<button type="button" class="btn btn--danger btn--sm" id="detail-cv-delete">Supprimer</button>`.

---

### Tâche 4 : Tests E2E

**Fichiers concernés :**
- Modifier : `tests/e2e/cv.e2e.js`

**Étape 1 : Tester la suppression directe d'un CV sans soumettre le formulaire**
Vérifier que le clic sur `#f-cv-btn-delete` supprime le CV d'IndexedDB et retire le badge de la carte Kanban immédiatement.

**Étape 2 : Tester la suppression d'une offre avec CV**
Vérifier que le CV est immédiatement supprimé d'IndexedDB, puis tester la restauration du CV si on clique sur « Annuler ».

**Étape 3 : Exécuter toute la suite de tests**
Commandes : `rtk npm test` et `node --test tests/e2e/cv.e2e.js tests/e2e/dashboard.e2e.js`.
Attendu : 100% PASS.
