# Stockage et gestion du CV adapté par offre - Postulo

- **Date** : 2026-10-12
- **Statut** : validé en brainstorming
- **Branche** : `feat/stockage-cv`

## 1. Objectif

Permettre à un candidat de rattacher, visualiser et télécharger le CV spécifiquement adapté (format PDF, DOC ou DOCX) à chacune de ses candidatures, directement depuis le tableau de bord ou la popup.

### Critères de réussite

- Import d'un CV (.pdf, .doc, .docx - max 10 Mo) par glisser-déposer ou sélecteur de fichier dans le panneau de détail du Dashboard et de la Popup.
- Stockage binaire local 100% dans le navigateur via IndexedDB (aucun appel externe, aucun ralentissement de `chrome.storage.local`).
- Consultation en un clic (ouverture dans un onglet pour PDF, téléchargement pour DOC/DOCX), remplacement et suppression du CV.
- Indicateur visuel (badge trombone) sur les cartes du Kanban et de la liste pour repérer les offres disposant déjà d'un CV.
- Ajout de la colonne « CV adapté » dans l'export CSV.
- Nettoyage automatique du fichier en cascade lors de la suppression définitive de la candidature.
- Suite de tests unitaires et E2E au vert.

### Hors périmètre

- Édition ou génération de CV en ligne.
- Synchronisation cloud multi-appareils (Postulo est 100% local).
- Rapprochement sémantique IA du contenu du CV avec la fiche de poste.

## 2. Architecture des données

### 2.1. Métadonnées dans `shared.js` (`chrome.storage.local`)
L'objet candidature intègre un champ `cv` contenant uniquement des métadonnées légères :
```json
{
  "cv": {
    "name": "CV_Frontend_Acme.pdf",
    "size": 184320,
    "type": "application/pdf",
    "updatedAt": "2026-10-12"
  }
}
```
Si aucun CV n'est rattaché, `cv: null`.

### 2.2. Stockage binaire dans IndexedDB (`cv-storage.js`)
- **Base de données** : `postulo_db` (version 1)
- **Object Store** : `cv_files`
- **Structure** : `{ id: candidatureId, file: Blob, name: string, type: string, updatedAt: string }`
- **Méthodes exportées** :
  - `save(id, file)` : enregistre le Blob associé à l'identifiant.
  - `get(id)` : retourne le Blob et ses métadonnées.
  - `delete(id)` : supprime le fichier de la base IndexedDB.
  - `openOrDownload(id)` : ouvre le PDF dans un nouvel onglet ou déclenche le téléchargement.

## 3. Interface utilisateur (UI)

### 3.1. Panneau de détail (Dashboard & Popup)
Section dédiée dans le formulaire :
- **État vide** : Zone de dropzone stylisée avec indication des formats acceptés (.pdf, .doc, .docx) et taille max (10 Mo).
- **État rempli** : Carte affichant le nom du fichier, la taille formatée, bouton « Ouvrir / Télécharger », bouton « Remplacer », bouton « Supprimer ».

### 3.2. Cartes de candidatures (Kanban & Popup)
- Ajout d'un badge avec icône de trombone/fichier si `candidature.cv` est défini.

## 4. Cycle de vie et intégrité

- **Suppression avec Undo** : Lors d'une suppression avec toast d'annulation, le fichier dans IndexedDB n'est supprimé définitivement qu'à l'expiration du toast d'annulation.
- **Export CSV** : Nouvelle colonne `CV adapté` avec le nom du fichier ou vide.
