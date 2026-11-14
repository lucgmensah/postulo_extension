# Sélection multiple dans le tableau de bord - Plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Objectif :** Sélectionner plusieurs cartes du Kanban et les supprimer, changer leur statut ou les exporter en une fois.

**Architecture :** Fonctions de liste pures dans `shared.js` (testées sous Node). Dans `dashboard.js`, un `Set` d'identifiants sélectionnés et une fonction `syncSelection()` qui met à jour classes, cases et barre sans redessiner le Kanban.

**Technique :** JavaScript sans build, `node:test`, Puppeteer.

**Spec :** `docs/superpowers/specs/2026-11-15-selection-multiple-design.md`

## Contraintes globales

- Aucune dépendance ni build. Aucun `alert()` ni `confirm()` (test existant).
- Le message de suppression d'une seule candidature reste « Candidature supprimée ».
- Une écriture passe toujours par `JobTracker.update` : relire avant d'écrire.

## Points de vigilance

1. **Carte masquée par la recherche** alors qu'elle était cochée : retirée de la sélection. Test : tâche 2.
2. **Candidature supprimée dans un autre onglet** pendant la sélection : retirée de la sélection, la barre se met à jour. Test : tâche 2.
3. **Annuler après une suppression multiple** alors qu'une candidature a été ajoutée entre-temps : chaque carte revient à sa position d'origine, sans doublon. Test : tâche 1.
4. **Focus clavier** après Espace : il reste sur la carte. Test : tâche 2.
5. **Message masqué par la barre :** il s'affiche au-dessus. Test : tâche 3.

---

### Task 1 : fonctions de liste dans `shared.js`

**Fichiers :** modifier `shared.js`, `dashboard.js` (`deleteCandidature`) ; tests : `tests/unit/shared.test.js`

**Interfaces produites :**
- `JobTracker.removeByIds(list, ids: string[]) → { list, removed: { item, index }[] }` : `removed` dans l'ordre croissant des positions d'origine.
- `JobTracker.restoreRemoved(list, removed) → list | null` : réinsère chaque élément à `Math.min(index, longueur)` dans l'ordre croissant ; ignore ceux déjà présents ; `null` si aucun n'est à réinsérer.
- `JobTracker.applyStatusToIds(list, ids, status) → list` : `applyStatus` sur chaque candidature concernée, objet d'origine inchangé.

- [ ] **Étape 1 : tests.** Liste `a b c d e`. `removeByIds(['d','b'])` → liste `a c e`, `removed` = `[{b,1},{d,3}]`. `restoreRemoved` sur `a c e` → `a b c d e`. Sur `x a c e` (ajout entre-temps) → `x b a d c e`, chaque élément à sa position d'origine. Avec `b` déjà présent, seul `d` revient. Tout déjà présent → `null`. `removeByIds` avec un id inconnu → ignoré. `applyStatusToIds(['a','c'], 'applied')` : `a` et `c` passent à `applied`, avec la date du jour si elle manquait ; `b` est inchangé ; la liste d'origine n'est pas modifiée.
- [ ] **Étape 2 :** `npm test` → échec.
- [ ] **Étape 3 :** implémenter, puis faire passer `deleteCandidature` du dashboard par `removeByIds` et `restoreRemoved`.
- [ ] **Étape 4 :** `npm test` et `node --test --test-concurrency=1 --test-timeout=300000 --test-name-pattern="suppression" tests/e2e/dashboard.e2e.js` → tout passe.
- [ ] **Étape 5 :** commit.

### Task 2 : sélectionner

**Fichiers :** modifier `dashboard.html` (barre), `dashboard.js`, `dashboard.css` ; tests : créer `tests/e2e/selection.e2e.js`

**Interfaces produites :** `state.selected: Set<string>`, `syncSelection()`, `clearSelection()`, `toggleSelected(id)`. Classes `.kanban-card--selected`, `.kanban-card__check`, `.kanban-col__check`, `.kanban--selecting`. Barre `#selection-bar` (`role="toolbar"`), compteur `#selection-count`, boutons `#selection-clear`, `#selection-export`, `#selection-delete`, menu `#selection-status`.

- [ ] **Étape 1 : tests** (données `SAMPLE` de `fixtures.js`) :
  - Ctrl+clic sur `s1` : carte cochée, barre visible, texte « 1 sélectionnée », panneau fermé.
  - Clic simple sur `s2` pendant la sélection → « 2 sélectionnées », panneau toujours fermé. Nouveau clic sur `s2` → « 1 sélectionnée ».
  - Clic sur la case de `s3` sans sélection en cours → cochée, panneau fermé.
  - Case de la colonne « Candidature envoyée » (`applied`) : `s1` et `s3` cochés ; nouveau clic → les deux décochés. Avec la recherche « Acme », seule `s1` est cochée.
  - Recherche qui masque une carte cochée → elle sort de la sélection.
  - Stockage modifié ailleurs (retrait de `s1` cochée) → « 0 », barre masquée.
  - Espace sur la carte focalisée → cochée, et `document.activeElement` est toujours cette carte.
  - Échap → sélection vide, barre masquée. ✕ → idem.
  - Hors sélection, un clic simple ouvre toujours le panneau (test existant `clic sur une carte`).
- [ ] **Étape 2 :** exécuter → échec.
- [ ] **Étape 3 :** implémenter. Les cases de carte ne relancent pas `renderKanban` ; `render()` élague `state.selected` aux cartes visibles puis appelle `syncSelection()`. La case de colonne passe en `indeterminate` si une partie seulement est cochée.
- [ ] **Étape 4 :** exécuter `selection.e2e.js` et `dashboard.e2e.js` → tout passe.
- [ ] **Étape 5 :** commit.

### Task 3 : agir sur la sélection

**Fichiers :** modifier `dashboard.js`, `dashboard.css` ; tests : `tests/e2e/selection.e2e.js`

**Interfaces consommées :** tâche 1 (`removeByIds`, `restoreRemoved`, `applyStatusToIds`), tâche 2 (barre, `state.selected`).

- [ ] **Étape 1 : tests :**
  - Statut : `s4` et `s5` (À postuler) cochés, « Entretien » choisi → les deux dans la colonne `interview` et en stockage ; message « 2 candidatures passées en « Entretien » » ; la sélection reste ; le menu revient à son libellé.
  - Statut « Candidature envoyée » sur `s5` sans date → date du jour.
  - Supprimer `s2`, `s4` et `s6` → absents du stockage, message « 3 candidatures supprimées », barre masquée. « Annuler » → les trois reviennent à leurs positions d'origine.
  - Supprimer une candidature avec CV puis annuler → le CV est de nouveau lisible (`CvStorage.get`).
  - Exporter `s1` et `s3` : la fonction d'export reçoit exactement ces deux candidatures (`buildCSV` espionné dans la page).
  - Glisser `s4` cochée avec `s5` cochée vers « Entretien » → les deux déplacées. Glisser `s1` non cochée → elle seule.
  - Message affiché au-dessus de la barre : le bas de `.toast-region` est au-dessus du haut de `#selection-bar`.
- [ ] **Étape 2 :** exécuter → échec.
- [ ] **Étape 3 :** implémenter. `deleteCandidatures(ids)` remplace `deleteCandidature(id)` : sauvegarde les CV en mémoire, les retire d'IndexedDB, écrit la liste, puis message avec « Annuler » (restaure CV et positions). `handleExportCSV(list = state.list)`. Le bouton « Exporter » de l'en-tête exporte tout.
- [ ] **Étape 4 :** `npm test` et `npm run e2e` → tout passe.
- [ ] **Étape 5 :** `readme.md` et `docs.md` (sélection multiple), puis commit.
