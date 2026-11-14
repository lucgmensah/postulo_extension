# Sélection multiple dans le tableau de bord - Postulo

- **Date** : 2026-11-15
- **Statut** : validé en conversation le 2026-11-14
- **Branche** : `feat/selection-multiple`, partie de `feat/extraction-offres`

## Intention

Aujourd'hui, chaque candidature se supprime une par une depuis son panneau, et « Exporter » exporte tout. Avec des dizaines de candidatures, faire le ménage ou exporter une partie devient fastidieux. Le but : sélectionner plusieurs cartes du Kanban et agir sur elles en une fois.

## Ce qui a été validé

- **Sélectionner.** Une case apparaît au survol de chaque carte. Ctrl+clic (ou Cmd+clic) fait la même chose. Une case dans l'en-tête de chaque colonne sélectionne toutes ses cartes visibles, en respectant la recherche.
- **Pendant une sélection,** un clic simple sur une carte la coche ou la décoche au lieu de l'ouvrir. Échap ou ✕ vide la sélection.
- **Barre d'actions** en bas de l'écran : « N sélectionnées », « Changer le statut », « Exporter », « Supprimer », ✕.
- **Supprimer** : immédiat, avec « Annuler » pendant 5 s comme aujourd'hui, CV compris.
- **Changer le statut** : applique le statut choisi à toute la sélection. Glisser une carte cochée déplace aussi les autres.
- **Exporter** : le même export qu'aujourd'hui (CSV, ou ZIP avec les CV), limité à la sélection.

### Hors périmètre

- Rappel en masse : écarté par l'utilisateur.
- Sélection multiple dans la popup.
- Sélection d'une plage avec Maj+clic.

### À éviter

- Supprimer quelque chose que l'utilisateur ne voit plus à l'écran.
- Ouvrir le panneau par erreur pendant une sélection.

## Approches

**A. Sélection dans l'état du dashboard, mise à jour de l'affichage sans tout redessiner (retenue).** Un `Set` d'identifiants ; cocher une carte ne change que ses classes et la barre. Le focus clavier reste en place.

**B. Mode « sélection » explicite, avec un bouton pour y entrer.** Un clic de plus, et ce n'est pas ce qui a été validé.

**C. Tout redessiner à chaque coche.** Plus simple, mais le focus est perdu à chaque Espace : inutilisable au clavier.

## Décisions prises par Claude

À corriger au besoin :

- **Ce qu'on voit est ce qu'on touche.** Une carte masquée par la recherche, ou supprimée ailleurs, sort de la sélection.
- **Après « Changer le statut » ou « Exporter »,** la sélection reste, pour enchaîner une autre action. Elle se vide après « Supprimer ».
- **Clavier.** Espace sur une carte la coche ou la décoche. Entrée l'ouvre hors sélection, et la coche ou la décoche pendant une sélection.
- **Messages.** « Candidature supprimée » pour une seule (inchangé), « 3 candidatures supprimées » au-delà. « 3 candidatures passées en « Entretien » » pour le statut.
- **Les messages remontent** au-dessus de la barre tant qu'elle est affichée.
- **Pas de confirmation avant suppression :** « Annuler » suffit, comme aujourd'hui. Le projet interdit `confirm()`.
- **Glisser une carte non cochée** pendant une sélection ne déplace qu'elle.
- **Logique de liste testable sous Node** dans `shared.js` : retrait et réinsertion de plusieurs candidatures, changement de statut de plusieurs.

## Laissé à l'implémentation

Noms des classes CSS, détail visuel de la barre, ordre des boutons.
