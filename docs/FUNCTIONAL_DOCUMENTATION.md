# Documentation fonctionnelle - FPM Pie Game

## 1. Objectif
FPM Pie Game permet d'animer des sessions de quiz en direct avec plusieurs groupes de joueurs, un pilotage administrateur en temps reel, et un suivi des scores visuel de type camembert.

## 2. Utilisateurs cibles
- Enseignants/encadrants qui preparent et pilotent les sessions.
- Etudiants/joueurs qui participent via des liens dedies par groupe.

## 3. Roles et droits

### 3.1 Administrateur
- Se connecter a l'application.
- Creer, modifier, cloner, activer, reinitialiser, demarrer et terminer une session.
- Gerer les questions et les groupes d'une session.
- Piloter la partie en direct (questions, validations, reveal, progression).
- Gerer les utilisateurs (creation, edition, activation/desactivation).
- Consulter les metadonnees de session (cree par, derniere modification par).

### 3.2 Utilisateur authentifie non admin (role Enseignant)
- Se connecter a l'application.
- Acceder a la gestion des sessions (selon regles d'affichage de navigation).
- Ne pas acceder a la gestion des utilisateurs.

### 3.3 Joueur (acces via lien de groupe)
- Rejoindre une session active via URL.
- Voir les regles et les questions en cours.
- Soumettre des reponses en temps reel.
- Optionnellement stopper le timer lors de la soumission.
- Voir les retours de validation et l'evolution du score.

## 4. Parcours fonctionnels principaux

### 4.1 Authentification
1. L'utilisateur saisit identifiant et mot de passe.
2. En cas de succes, le token JWT est stocke cote client.
3. Si le compte est desactive, la connexion est refusee.

### 4.2 Preparation de session
1. Creation d'une session: titre, date, labels de categories, regles.
2. Ajout de groupes: nom, description, avatar.
3. Ajout/liaison de questions: libre ou choix unique, ordre et temps alloue.

### 4.3 Activation et demarrage
1. L'administrateur active la session (statut Activated).
2. Les liens joueur sont generes.
3. L'administrateur demarre la partie (statut In Progress).

### 4.4 Execution en direct
1. Les questions sont diffusees a tous les joueurs connectes.
2. Les groupes soumettent leurs reponses en temps reel.
3. L'administrateur valide ou invalide les reponses.
4. Les points sont mis a jour et diffuses en direct.

### 4.5 Cloture
1. Fin automatique (plus de questions) ou fin manuelle.
2. Calcul des gagnants.
3. Passage au statut Game Over.

## 5. Regles metier
- Une session possede une liste ordonnee de questions.
- Le score est gere par triangles verts et rouges.
- Si une reponse est correcte: attribution des points selon la modalite.
- Si un groupe stoppe le timer et repond faux: les autres groupes peuvent recevoir des points selon la regle active.
- Les points ne doivent pas devenir negatifs.
- Toutes les actions live sont synchronisees en temps reel.

## 6. Gestion des utilisateurs
- Un admin peut creer un utilisateur avec prenom, nom, username, email, role et mot de passe.
- Un admin peut modifier les informations d'un utilisateur et son mot de passe.
- Un admin peut activer/desactiver un utilisateur.
- Un compte desactive ne peut plus se connecter.
- Un admin ne peut pas se desactiver lui-meme.

## 7. Statuts de session
- Draft: session en preparation.
- Activated: session prete, liens disponibles.
- In Progress: session en cours de jeu.
- Game Over: session terminee.

## 8. Internationalisation
- Langues supportees: fr, en, es, de, pt, ru, ar, zh-Hans, zh-Hant.
- Le changement de langue est possible depuis l'entete.
- Les cles manquantes dans une locale retombent automatiquement sur la langue par defaut.

## 9. Donnees fonctionnelles principales
- Session: titre, date, labels, regles, statut, createur, dernier modificateur.
- Question: type, mode de reponse, intitule, reponse attendue, temps.
- Groupe: nom, description, avatar, lien joueur.
- Reponse: contenu, groupe, question, validation.
- Score: progression camembert par groupe.

## 10. Criteres d'acceptation
- Un admin peut preparer et lancer une session complete.
- Un joueur rejoint via lien et participe en direct.
- Le scoring est visible et mis a jour en temps reel.
- Les metadonnees Createur/Derniere modification sont visibles en administration.
- La gestion utilisateur (create/edit/activate/deactivate) fonctionne de bout en bout.
