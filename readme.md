# Postulo

Extension Chrome open source pour suivre ses candidatures : enregistrement d'offres en un clic, tableau Kanban, rappels avec notifications et export CSV. Les données restent dans le navigateur.

> Version bêta. Présentation destinée aux utilisateurs : [docs.md](docs.md).

## Fonctionnalités

- **Détection des offres** sur LinkedIn, Indeed, Welcome to the Jungle, Hello Work, France Travail, Cadremploi, JobTeaser et Free-Work :
  - un bouton flottant « Suivre cette offre » apparaît sur la page, avec poste, entreprise et lieu pré-remplis ;
  - la détection fonctionne aussi pendant la navigation interne de ces sites ;
  - sur une offre déjà suivie, le bouton affiche son statut actuel.
- **Popup** (icône de l'extension) :
  - liste des candidatures par avancement (À faire, En cours, Terminées) ;
  - fiche détaillée avec changement de statut et rappel ;
  - ajout pré-rempli depuis la page ouverte, sur n'importe quel site ;
  - sur un autre site qui publie une fiche d'offre standard (`JobPosting`), l'offre est reconnue comme sur les sites ci-dessus.
- **Tableau de bord** :
  - statistiques (dont un taux de réponse estimé) ;
  - Kanban en cinq colonnes avec glisser-déposer ;
  - panneau de détail modifiable ;
  - suppression annulable ;
  - sélection multiple (case au survol, Ctrl+clic, case de colonne) pour changer le statut, exporter ou supprimer plusieurs candidatures à la fois ;
  - recherche ;
  - export CSV compatible Excel.
- **Rappels** : date et heure sur n'importe quelle candidature, notification du navigateur à l'heure prévue (ou au démarrage suivant si le navigateur était fermé), avec les actions « Ouvrir l'offre » et « Reporter à demain ».
- **Détection des doublons** : une même offre n'est enregistrée qu'une fois, même ouverte depuis des URL différentes (paramètres de suivi, page de recherche ou page d'offre).

## Installation

L'extension n'a ni dépendance ni étape de build : elle se charge directement depuis le dépôt.

1. Cloner le dépôt :
   ```bash
   git clone https://github.com/lucgmensah/postulo_extension.git
   ```
2. Ouvrir `chrome://extensions` et activer le **mode développeur** (en haut à droite).
3. Cliquer sur **« Charger l'extension non empaquetée »** et choisir le dossier du dépôt (celui qui contient `manifest.json`).

Après une mise à jour du code, cliquer sur ↻ sur la carte de l'extension, puis **recharger les onglets déjà ouverts** sur les sites reconnus.

## Données et permissions

Les candidatures sont stockées dans `chrome.storage.local`, sous la clé `candidatures`. Rien n'est envoyé à un serveur, et les polices sont embarquées : aucun appel externe.

| Permission | Utilisation |
|---|---|
| `storage` | Enregistrer les candidatures |
| `activeTab`, `scripting` | Lire l'offre de l'onglet courant depuis la popup |
| `alarms` | Programmer le prochain rappel |
| `notifications` | Afficher les rappels |

Le script de contenu s'exécute sur `*.linkedin.com`, `*.indeed.com`, `*.indeed.fr`, `*.welcometothejungle.com`, `*.hellowork.com`, `candidat.francetravail.fr`, `*.cadremploi.fr`, `*.jobteaser.com` et `*.free-work.com`. Il couvre tout le site, et pas seulement les pages d'offres, pour suivre la navigation interne de ces sites.

## Structure du projet

| Fichier | Rôle |
|---|---|
| `manifest.json` | Déclaration de l'extension (Manifest V3) |
| `shared.js` | Couche données partagée (`JobTracker`) : stockage, doublons, table des sites reconnus et clés d'offres, calcul des rappels |
| `extract.js` | Lecture des offres (`JobExtract`), sans accès à la page : fiches `JobPosting`, forme du lieu, choix de la valeur de chaque champ |
| `ui.js` | Rendus partagés (`UI`) : statuts, cartes, statistiques, toasts, composant « Rappel » |
| `tokens.css`, `components.css` | Système de design (couleurs, police, composants) |
| `background.js` | Service worker : ouverture du dashboard, planification des rappels, notifications |
| `content.js`, `widget.css` | Script de contenu : repères de chaque site, détection des offres et bouton flottant (Shadow DOM) |
| `popup.html/.css/.js` | Popup : liste, détail, ajout |
| `dashboard.html/.css/.js` | Tableau de bord : statistiques, Kanban, panneau de détail, export CSV |
| `fonts/` | Police Plus Jakarta Sans (licence OFL) |
| `docs/superpowers/` | Specs et plans d'implémentation |

## Tests

Les tests utilisent Node.js 22 et Puppeteer (dépendance de développement uniquement).

```bash
npm install
npm test        # tests unitaires (node:test)
npm run e2e     # tests de bout en bout : Chrome for Testing avec l'extension chargée
```

L'extraction des offres et le widget sont testés hors ligne : `tests/e2e/pages/` contient une vraie page d'offre par site, réduite à son en-tête et à sa fiche `JobPosting`, que le test sert à l'adresse réelle du site. Ces tests protègent le code contre les régressions ; ils ne signalent pas qu'un site a changé sa mise en page en ligne.

Les tests de la popup ouvrent encore de vraies offres LinkedIn sans connexion. Ils ont besoin d'un accès réseau et peuvent échouer si LinkedIn redirige vers sa page de connexion. Les captures d'écran générées sont dans `tests/e2e/screenshots/` (ignoré par Git).

### Ajouter un site

1. `shared.js` : une ligne dans la table `SITES` (domaines, noms du site, clé de l'offre dans l'URL).
2. `manifest.json` : le domaine dans les deux listes `matches`.
3. `content.js` : ses repères dans `SCRAPERS`, seulement si le site ne publie pas de fiche `JobPosting` ou pour la compléter.
4. `tests/e2e/pages/` : une vraie page réduite, et sa ligne dans `tests/e2e/extraction.e2e.js`.

## Publier sur le Chrome Web Store

`npm run pack` crée l'archive `postulo-v<version>.zip` à la racine du dépôt (Windows, via PowerShell). Pour la construire à la main, ne garder que les fichiers de l'extension. Il faut exclure `node_modules/`, `tests/`, `docs/`, `docs.md`, `package.json`, `package-lock.json` et `readme.md`.

## Contribuer

1. Forker le dépôt et créer une branche (`git checkout -b feat/ma-fonctionnalite`).
2. Garder l'extension sans dépendance ni build : JavaScript et CSS natifs, réutilisation de `shared.js`, `ui.js` et des composants existants.
3. Ajouter les tests correspondants et vérifier que `npm test` et `npm run e2e` passent.
4. Ouvrir une Pull Request vers `main`.

Les bugs et idées sont les bienvenus dans les Issues.

## Licence

Code sous licence MIT. La police Plus Jakarta Sans est distribuée sous licence SIL Open Font License 1.1 (voir `fonts/OFL-PlusJakartaSans.txt`).
