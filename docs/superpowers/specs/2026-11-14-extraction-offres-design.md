# Extraction fiable des offres et nouveaux sites - Postulo

- **Date** : 2026-11-14
- **Statut** : validé en brainstorming (le point 4 des causes et le § 4.4 ont été ajoutés après validation, à la lecture du code)
- **Branche** : `feat/extraction-offres`

## 1. Intention

Quand on ouvre une offre, Postulo pré-remplit le poste, l'entreprise et le lieu. Aujourd'hui le lieu manque souvent, et seuls trois sites sont reconnus. Le but : un pré-remplissage juste sur les sites d'emploi courants en France, et qui le reste quand un site change sa mise en page.

### Constat

Mesuré le 14/11/2026 sur de vraies offres, dans un Chrome avec l'extension chargée.

| Site | Ce que Postulo extrait aujourd'hui |
|---|---|
| LinkedIn, sans connexion | Correct sur 3 offres sur 3 |
| LinkedIn, connecté | Non vérifié (pas de compte de test) |
| Indeed, recherche avec panneau d'offre | Lieu vide. Poste = titre de la recherche. Entreprise = texte d'un lien sans rapport |
| Welcome to the Jungle | Lieu vide sur 3 offres sur 3. Nom de l'entreprise collé au poste. Entreprise parfois fausse (« Postuler », ou nom déduit de l'URL) |
| Hello Work et les autres | Non reconnus |

### Causes

1. Des repères CSS périmés : Welcome to the Jungle a changé, Indeed a refait tout son panneau d'offre.
2. Un bug de priorité : `querySelector('a, b, c')` renvoie le premier élément dans l'ordre du document, pas dans l'ordre de la liste. Les repères de secours placés en fin de liste (`h1`, `a[href*='/cmp/']`) passent donc devant les repères précis.
3. Aucune source de repli structurée quand les repères échouent.
4. Des informations figées trop tôt : le widget lit la page une demi-seconde après son chargement et ne la relit plus tant que l'offre ne change pas. Sur un site qui affiche l'offre après coup, ou qui change d'offre sans recharger la page, il garde un lieu vide ou celui de l'offre précédente.

## 2. Objectifs

- Poste, entreprise et lieu corrects sur huit sites : LinkedIn (sans connexion), Indeed (panneau de recherche), Welcome to the Jungle, Hello Work, France Travail, Cadremploi, JobTeaser, Free-Work.
- Le bouton « Suivre cette offre » s'affiche sur les pages d'offre de ces huit sites.
- Sur tout autre site qui publie une fiche d'offre standard, la popup reconnaît l'offre.
- Le lieu a la même forme quel que soit le site.
- Des tests rejouables hors ligne couvrent chaque site.

### Hors périmètre

- Glassdoor, APEC et Meteojob : leur protection contre les robots a bloqué toute vérification. Pas de bouton flottant ; ils profitent du cas général s'ils publient la fiche standard.
- Monster : l'adresse française redirige vers une page sans offres.
- Salaire, type de contrat, mode de télétravail.
- Correction des candidatures déjà enregistrées.

### À éviter

- Un lieu faux est pire qu'un lieu vide. En cas de doute, le champ reste vide.
- Le bouton flottant ne s'affiche jamais hors d'une page d'offre.
- Aucune dépendance, aucun appel réseau, aucune étape de build ajoutés.

## 3. Approches

**A. Corriger les repères site par site.** Rapide. C'est pourtant la cause du problème : chaque refonte d'un site casse l'extraction en silence, et chaque nouveau site demande des repères à écrire puis à surveiller.

**B. Fiche standard d'abord, repères ensuite (retenue).** La plupart des sites publient pour Google une fiche `JobPosting` (schema.org) avec le poste, l'entreprise et l'adresse. On la lit en premier, puis les repères du site par ordre de priorité. Les sites sont décrits dans une table.

**C. Heuristiques sur le texte de la page** (chercher un code postal, un libellé « Lieu »). Écartée : trop de faux positifs, contraire à « vide plutôt que faux ».

B est le choix proposé par Claude. Six des huit sites publient la fiche ; elle survit aux refontes visuelles et rend l'ajout d'un site peu coûteux.

## 4. Conception

### 4.1 Ordre de lecture

Chaque champ (poste, entreprise, lieu) est résolu séparément, dans cet ordre :

1. **La fiche standard**, lue dans les `script[type="application/ld+json"]` (objet seul, tableau ou `@graph`). Elle n'est retenue que si elle décrit l'offre affichée : son titre, normalisé, est contenu dans le titre principal de l'offre ou dans le titre de la page. Sur les sites à navigation interne, la fiche peut manquer ou être celle de l'offre précédente.
2. **Les repères du site**, essayés un par un dans l'ordre de priorité. Le premier qui donne un texte non vide gagne. Sur les pages « liste + panneau », la recherche est limitée au panneau de l'offre.
3. **Les secours actuels** (`og:title`, titre de la page) pour le poste et l'entreprise seulement. Le lieu n'a pas de secours générique.

### 4.2 Forme du lieu

Depuis la fiche :

| Cas | Résultat |
|---|---|
| Ville et code postal français | « Chambéry (73) » |
| Ville sans code postal | « Montpellier » |
| Hors de France | « Beverly Hills, États-Unis » |
| Plusieurs lieux | Le premier, suivi de « +N » |
| Aucun lieu, offre marquée `TELECOMMUTE` | « Télétravail » |

`TELECOMMUTE` accompagné d'un lieu est ignoré : il apparaît aussi sur des offres en télétravail partiel. Le pays peut être un code, un nom ou un objet ; son nom français vient de `Intl.DisplayNames`. Le département vient du code postal : deux chiffres, trois pour l'outre-mer, 2A ou 2B pour la Corse.

Depuis un repère, le texte est nettoyé et les formes connues sont ramenées au même format :

| Texte du site | Résultat |
|---|---|
| « 69800 Saint-Priest » (Indeed) | « Saint-Priest (69) » |
| « 59 - DOUAI » (France Travail) | « Douai (59) » |
| « Chambéry - 73 » (Hello Work) | « Chambéry (73) » |
| Autre, par exemple « Paris, Île-de-France, France » | Inchangé |

### 4.3 Sites

Les clés d'offre servent à reconnaître une offre déjà suivie. Les sources ci-dessous ont été vérifiées sur de vraies pages.

| Site | Page d'offre et clé | Source |
|---|---|---|
| LinkedIn | Inchangé | Fiche (sans connexion), puis repères actuels |
| Indeed | Inchangé (`jk`, `vjk`) | Repères du nouveau panneau (voir ci-dessous) |
| Welcome to the Jungle | Inchangé | Fiche. Le titre principal contient aussi l'entreprise : repères à corriger |
| Hello Work | `hellowork.com/…/emplois/{id}.html` → `hellowork:{id}` | Fiche, puis `[data-cy="jobTitle"]`, lien `/entreprises/` du titre, premier élément de la liste sous le titre |
| France Travail | `candidat.francetravail.fr/offres/recherche/detail/{id}` → `francetravail:{id}` | Pas de fiche. `.sticky-title-container .title` et `.title-complementary .location` |
| Cadremploi | `cadremploi.fr/emploi/detail_offre?offreId={id}` → `cadremploi:{id}` | Fiche |
| JobTeaser | `jobteaser.com/{langue}/job-offers/{uuid}-…` → `jobteaser:{uuid}` | Fiche |
| Free-Work | `free-work.com/{langue}/tech-it/job-mission/{catégorie}/{offre}` → `freework:{catégorie}/{offre}` | Fiche |

**Indeed.** Le panneau d'offre est `#jobsearch-ViewjobPaneWrapper`. Le poste est `[data-testid="vj-job-title"]`, l'entreprise le lien `/cmp/` de `[data-testid="desktop-job-header"]`. Le lieu n'a pas de repère propre : c'est le premier texte du second groupe de `[data-testid="company-info-metadata"]`. En repli, le lieu de la carte de résultat portant le même `jk` (`[data-testid="text-location"]`). Les anciens repères restent, pour la page d'offre seule.

**France Travail.** L'entreprise est souvent absente de l'annonce : le champ reste vide et se remplit à la main.

### 4.4 Moment de la lecture

- Tant que le poste ne vient ni de la fiche ni d'un repère du site, le widget réessaie pendant quelques secondes avant d'accepter le titre de la page.
- À l'ouverture du panneau « Suivre cette offre », la page est relue. Les champs que l'utilisateur n'a pas modifiés prennent les nouvelles valeurs.

### 4.5 Cas général

Sur un site non déclaré, si la page publie une fiche valide, la popup propose l'offre comme sur un site reconnu : bandeau et champs pré-remplis. Pas de bouton flottant, puisque le script n'y est injecté qu'à l'ouverture de la popup.

Limite connue : la clé d'une offre y reste l'adresse sans ses paramètres. Sur un site qui ne distingue ses offres que par un paramètre, deux offres peuvent être prises pour la même. C'est déjà le cas pour l'ajout manuel.

### 4.6 Organisation du code

- `shared.js` : la table des sites (hôtes, calcul de la clé). `siteJobKey` et `isSupportedSite` en découlent.
- `extract.js`, nouveau : logique pure, sans accès à la page, testable sous Node. Lecture des fiches, correspondance entre fiche et offre affichée, forme du lieu, nettoyage du poste et de l'entreprise, résolution par priorité.
- `content.js` : collecte les textes (fiches, repères) et délègue à `extract.js`.
- `manifest.json` : nouveaux hôtes pour le script de contenu et les ressources du widget. `extract.js` est chargé partout où `content.js` l'est, y compris à l'injection par la popup.
- `readme.md` et `docs.md` : liste des sites à jour.

### 4.7 Tests

- **Unitaires** : `extract.js` avec les fiches réelles réduites des six sites, tableau, `@graph`, JSON invalide, fiche d'une autre offre rejetée, toutes les formes de lieu. Table des sites : clés, hôtes, faux amis du type `evil-hellowork.com.example.org`. Respect de l'ordre de priorité.
- **Bout en bout, hors ligne** : une page réelle enregistrée par site, réduite à l'en-tête de l'offre et à sa fiche. Elle est servie par interception réseau à l'adresse réelle, pour que le script de contenu s'exécute. On vérifie les trois champs pré-remplis du widget.
- Les tests existants restent au vert.

## 5. Risques et points ouverts

- **LinkedIn connecté** n'a pas pu être vérifié. Ses repères actuels sont conservés et profitent de la correction de priorité. Si le lieu y manque encore, il faudra une page d'offre enregistrée depuis un navigateur connecté pour ajouter le repère et son test.
- **Indeed, page d'offre seule** (`viewjob?jk=`) : la protection contre les robots a bloqué la vérification.
- **Autorisations** : de nouveaux hôtes font redemander l'accord de l'utilisateur à la mise à jour, pour une installation depuis le Chrome Web Store.
- **Les sites changeront encore.** La fiche standard amortit le choc. Les tests hors ligne protègent le code contre les régressions, pas contre une refonte en ligne.

## 6. Décisions prises par Claude

À corriger au besoin :

- La liste des huit sites, et l'exclusion de Glassdoor, APEC et Meteojob.
- La forme du lieu, « Ville (département) ».
- La reconnaissance dans la popup sur les sites non déclarés.
- Le nouveau fichier `extract.js`.

## 7. Laissé à l'implémentation

Noms des fonctions, découpage exact, contenu des pages enregistrées, numéro de version.
