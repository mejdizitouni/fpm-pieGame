# Documentation fonctionnelle - Trivial Chem

## 1. Objet
Cette application permet d’animer des sessions de jeu pédagogique en direct, basées sur des questions de chimie pharmaceutique. Le jeu oppose plusieurs groupes d’étudiants avec un système de points visuel (camemberts) et une validation en temps réel par un administrateur.

## 2. Public cible
- Étudiants en 2ème année du premier cycle des études pharmaceutiques.
- Enseignants ou encadrants qui pilotent la séance.

## 3. Périmètre fonctionnel
- Authentification administrateur.
- Gestion des sessions de jeu.
- Gestion des questions (création, édition, association à une session).
- Gestion des groupes participants.
- Activation et pilotage d’une partie en direct.
- Réponses en temps réel des groupes.
- Validation des réponses et mise à jour des scores.
- Calcul des gagnants en fin de partie.

## 4. Rôles utilisateurs

### 4.1 Administrateur
- Se connecte avec identifiants.
- Crée, édite, clone, active, réinitialise ou supprime une session.
- Configure questions et groupes.
- Lance/arrête la partie.
- Valide les réponses en direct.
- Ajuste manuellement les points si nécessaire.
- Affiche les liens joueurs.

### 4.2 Joueur (groupe)
- Accède à la partie via un lien de groupe.
- Consulte les règles de la session.
- Répond aux questions affichées.
- Peut soumettre une réponse normale ou soumettre en stoppant le timer.
- Suit ses retours de validation et les scores globaux.

## 5. Parcours fonctionnels clés

### 5.1 Connexion administrateur
- L’administrateur saisit nom d’utilisateur et mot de passe.
- Si les identifiants sont valides, il accède au tableau de bord.
- Le token JWT est conservé côté navigateur.

### 5.2 Préparation d’une session
- Création d’une session: titre, date, labels des deux catégories, règles du jeu.
- Gestion des groupes: nom, description, avatar.
- Gestion des questions:
  - Questions de réponse libre.
  - Questions à choix unique (avec options).
- Ordonnancement des questions dans la session.

### 5.3 Activation de session
- L’administrateur active une session en statut Activated.
- Le système génère les liens de participation par groupe.
- Lien administrateur de pilotage disponible.

### 5.4 Déroulement en direct
- L’administrateur démarre la session (statut In Progress).
- Les questions sont servies en alternance green/red.
- Chaque question dispose d’un temps alloué.
- Les groupes soumettent leurs réponses en temps réel.
- Un groupe peut arrêter le timer lors de sa soumission.

### 5.5 Validation et scoring
- L’administrateur valide chaque réponse.
- Cas correct:
  - Réponse normale: +1 point de la couleur de la question.
  - Réponse avec arrêt timer: +2 points.
- Cas incorrect d’un groupe ayant stoppé le timer:
  - Les autres groupes gagnent +1 point de la couleur de la question.
- Option de validation manuelle sans attribution automatique des points (mode explication orale).

### 5.6 Fin de partie
- La partie se termine en fin de questions ou par arrêt administrateur.
- Le système détermine le ou les gagnants selon:
  - Nombre de camemberts complets.
  - Puis total de points en cas d’égalité.
- Statut final: Game Over.

## 6. Règles métier principales
- Une session contient un ensemble ordonné de questions.
- Les questions alternent entre deux types (green/red) pendant la partie.
- Un camembert complet nécessite des triangles rouges et verts.
- Les points ne descendent jamais sous zéro lors des ajustements manuels.
- Les réponses et validations sont diffusées en temps réel à tous les participants de la session.

## 7. Gestion des statuts de session
- Draft: session en préparation, non démarrée.
- Activated: session prête, liens générés.
- In Progress: session en cours.
- Game Over: session terminée.

## 8. Données manipulées fonctionnellement
- Sessions: intitulé, date, règles, labels catégories, statut.
- Questions: type, type de réponse, énoncé, réponse attendue, temps alloué, options éventuelles.
- Groupes: nom, description, avatar, lien de participation.
- Scores: triangles rouges et verts par groupe.
- Réponses: contenu soumis, groupe, question, horodatage, validation.

## 9. Notifications et feedback utilisateur
- Affichage en direct des nouvelles questions.
- Bandeaux d’état (connexion, timer, validations, événements live).
- Toasters côté administration (succès, erreur, info).
- Retour explicite côté joueur sur soumission/validation/réponse révélée.

## 10. Contraintes et hypothèses fonctionnelles
- Un seul administrateur pilote généralement une session à la fois.
- Les groupes jouent via URL dédiée.
- La progression en direct dépend de la connectivité réseau.
- Les sessions inactives côté moteur temps réel expirent automatiquement après une durée de vie interne.

## 11. Critères d’acceptation fonctionnels
- Un administrateur peut préparer puis activer une session complète (groupes + questions).
- Un joueur peut rejoindre via son lien, voir les questions et soumettre des réponses.
- Les validations administrateur modifient immédiatement les scores visibles.
- La fin de partie affiche correctement le classement gagnant.
- La réinitialisation remet la session en Draft et remet les scores à zéro.
