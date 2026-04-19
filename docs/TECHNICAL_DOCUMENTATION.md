# Documentation technique - Trivial Chem

## 1. Vue d’ensemble technique
Application web temps réel composée de:
- Frontend React (single page app).
- Backend Node.js/Express.
- Communication temps réel via Socket.IO.
- Base de données SQLite locale.

## 2. Stack et dépendances
- Node.js 18.x
- React 18
- Express 4
- Socket.IO 4 (serveur et client)
- SQLite3
- Axios
- JWT (jsonwebtoken)
- bcryptjs
- helmet
- express-rate-limit
- cors

Défini dans package.json.

## 3. Architecture

### 3.1 Frontend
- Point d’entrée: src/index.js
- Routage:
  - / : page de connexion
  - /admin : tableau de bord administrateur
  - /session/:id : édition de contenu de session
  - /admin/game/:sessionId : console de contrôle live
  - /game/:sessionId/:groupId : interface joueur

### 3.2 Backend
- Point d’entrée: server.js
- Serveur HTTP Express + Socket.IO attaché au même serveur.
- Sert également le build statique React en production.

### 3.3 Base de données
- SQLite fichier users.db
- Initialisation/migrations/seed dans database.js

## 4. Configuration et variables d’environnement

### 4.1 Backend
- PORT: port HTTP, défaut 3001.
- JWT_SECRET: clé de signature JWT. Si absente, génération aléatoire en mémoire au démarrage (les tokens précédents deviennent invalides après redémarrage).
- CORS_ORIGINS: liste d’origines autorisées séparées par virgules.
- NODE_ENV: influe sur le seed par défaut.
- SEED_TEST_SESSION: force le seed si true.

### 4.2 Frontend
- REACT_APP_API_URL: URL de l’API et du serveur Socket.IO.

## 5. Modèle de données

### 5.1 Tables
- users: authentification administrateur.
- game_sessions: métadonnées session, labels catégories, statut, règles.
- questions: banque de questions (type, réponse attendue, temps, type de réponse).
- question_options: options des questions à choix unique.
- groups: équipes participantes par session.
- session_questions: association session-question avec ordre d’apparition.
- answers: traces des réponses soumises.
- camembert_progress: scores rouges/verts par groupe.

### 5.2 Index
- Index ajoutés sur tables relationnelles critiques (session_questions, question_options, groups, camembert_progress, answers).

## 6. Mécanisme temps réel

### 6.1 Événements émis par clients
- startGame
- submitAnswer
- validateAnswer
- validateAnswerNoPoints
- revealAnswer
- nextQuestion
- joinSession

### 6.2 Événements émis par serveur
- newQuestion
- answerSubmitted
- timerStopped
- camembertUpdated
- answerValidated
- answerValidatedNoPoints
- revealAnswer
- gameOver

### 6.3 État runtime en mémoire
Serveur maintient un état par session dans un objet en mémoire:
- index courant
- questions déjà servies
- question courante
- début et durée du timer
- réponses soumises
- groupe ayant stoppé le timer
- bonne réponse révélée
- gagnants

Un mécanisme TTL nettoie les sessions inactives périodiquement.

## 7. API REST

### 7.1 Authentification
- POST /login
- POST /verify-token
- GET /admin-check

### 7.2 Sessions
- GET /game-sessions
- POST /game-sessions
- GET /sessions/:id
- PUT /sessions/:id
- DELETE /sessions/:id
- POST /sessions/:id/activate
- POST /sessions/:id/start
- POST /sessions/:id/end
- POST /sessions/:id/reset
- GET /sessions/:id/runtime-state
- GET /sessions/:id/player-runtime-state/:groupId

### 7.3 Groupes
- GET /sessions/:id/groups
- GET /sessions/:id/groups/:groupId
- POST /sessions/:id/groups
- PUT /sessions/:sessionId/groups/:groupId
- DELETE /sessions/:sessionId/groups/:groupId

### 7.4 Questions
- GET /questions/:id
- POST /questions
- PUT /questions/:id
- GET /questions/:id/options
- POST /questions/:id/options
- GET /sessions/:id/questions
- GET /sessions/:id/available-questions
- POST /sessions/:id/questions
- PUT /sessions/:sessionId/questions/:questionId
- DELETE /sessions/:sessionId/questions/:questionId

### 7.5 Score et réponses
- GET /sessions/:id/camemberts
- POST /sessions/:id/update-points
- POST /sessions/:id/validate
- GET /sessions/:id/answers

## 8. Sécurité
- JWT requis sur la majorité des endpoints d’administration.
- Hachage mot de passe via bcrypt.
- Rate limiting:
  - Route login protégée contre brute force.
  - Limiteur générique sur routes de mutation.
- Helmet activé (CSP désactivée explicitement).
- CORS configurable par variable d’environnement.

## 9. Flux principaux

### 9.1 Démarrage de partie
1. Admin appelle POST /sessions/:id/start.
2. Client admin émet startGame via Socket.IO.
3. Serveur initialise état runtime et diffuse newQuestion.

### 9.2 Soumission et validation
1. Joueur émet submitAnswer.
2. Serveur diffuse answerSubmitted.
3. Admin valide via validateAnswer ou validateAnswerNoPoints.
4. Serveur met à jour score, diffuse camembertUpdated et answerValidated.

### 9.3 Fin de partie
- Déclenchée automatiquement en fin de questions ou manuellement via POST /sessions/:id/end.
- Serveur calcule gagnant(s), passe statut à Game Over et diffuse gameOver.

## 10. Initialisation base et seed
Au démarrage backend, database.js:
- crée les tables si absentes,
- crée les index,
- applique migrations de labels/avatars/noms historiques,
- supprime/recrée une session par défaut selon environnement.

Compte administrateur initial seedé:
- username: admin
- mot de passe initial: WelcomeAdmin2024

## 11. Build, exécution et déploiement

### 11.1 Scripts npm
- npm run build: build frontend.
- npm start: lance backend Node (et sert build statique si présent).
- npm run start:local: build puis backend via concurrently.

### 11.2 Déploiement
Conçu pour déploiement type Render avec serveur Node unique servant API + frontend build.

## 12. Limitations et points d’attention techniques
- Deux définitions POST /questions existent dans server.js; la seconde peut créer une ambiguïté de maintenance.
- Plusieurs endpoints ne vérifient pas systématiquement JWT (exemple lecture session/groupe côté joueur volontairement publique selon usage).
- L’état live est en mémoire serveur: pas partagé entre plusieurs instances sans mécanisme de synchronisation externe.
- Le calcul et diffusion du timer est piloté côté clients avec état serveur de référence; sensible aux décalages réseau.

## 13. Recommandations d’évolution
- Unifier les routes questions (éviter doublons).
- Standardiser la protection JWT selon rôle.
- Externaliser état temps réel (Redis) pour montée en charge multi-instances.
- Ajouter tests automatisés API + sockets + flux E2E.
- Ajouter documentation OpenAPI pour contrat HTTP formel.
