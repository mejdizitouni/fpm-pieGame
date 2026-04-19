# Documentation technique - FPM Pie Game

## 1. Vue d'ensemble
FPM Pie Game est une application web temps reel composee de:
- un frontend React,
- une API Express,
- un bus temps reel Socket.IO,
- une base SQLite locale.

Le serveur Node sert a la fois l'API et le build frontend en mode deploiement classique mono-service.

## 2. Stack technique
- Runtime: Node.js 18+
- Frontend: React 18, react-router-dom
- Backend: Express 4, Socket.IO 4
- Data: SQLite3
- Auth: jsonwebtoken + bcryptjs
- Hardening: helmet, express-rate-limit, CORS
- Tests: node:test + React Testing Library

Les dependances exactes sont declarees dans package.json.

## 3. Architecture applicative

### 3.1 Frontend
- Point d'entree: src/index.js
- Pages principales:
  - Authentification
  - Administration sessions
  - Controle live d'une session
  - Gestion session (questions/groupes)
  - Interface joueur
- i18n:
  - provider central dans src/i18n
  - dictionnaires multilingues
  - fallback automatique sur langue par defaut pour cles absentes
  - regle de dev: aucun texte utilisateur ne doit etre code en dur dans les composants (labels, placeholders, aria-label, alt). Toute chaine UI passe par les cles de traduction.

### 3.2 Backend
- Entree principale: server.js
- Routes auth/utilisateurs: server/routes/auth.routes.js
- Initialisation DB: database.js
- Serveur HTTP + Socket.IO partage le meme processus

### 3.3 Temps reel
Socket.IO gere le cycle de jeu:
- emission des questions,
- reception des reponses,
- validation admin,
- mise a jour des scores,
- reveal et fin de partie.

L'etat runtime de session est maintenu en memoire par processus avec mecanisme de purge TTL.

## 4. Modele de donnees

### 4.1 Tables principales
- users
  - id, username, email, password, role
  - first_name, last_name
  - is_active
- game_sessions
  - metadonnees session (titre, labels, date, statut, regles)
  - created_by
  - last_modified_by
- questions
- question_options
- session_questions
- groups
- answers
- camembert_progress

### 4.2 Audit et ownership
- created_by est renseigne a la creation de session.
- last_modified_by est mis a jour a chaque edition de session.
- les listes et details sessions exposent username/full name du createur et du dernier modificateur via jointures users.

## 5. API REST

### 5.1 Auth
- POST /login
- POST /verify-token
- GET /admin-check

### 5.2 Utilisateurs (admin)
- GET /users
- POST /users
- PUT /users/:id
- PATCH /users/:id/active

### 5.3 Sessions
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

### 5.4 Questions et groupes
- GET/POST/PUT/DELETE sur questions et associations session_questions
- GET/POST/PUT/DELETE sur groupes par session

### 5.5 Scores et reponses
- GET /sessions/:id/camemberts
- POST /sessions/:id/update-points
- POST /sessions/:id/validate
- GET /sessions/:id/answers

## 6. Evenements Socket.IO

### 6.1 Evenements client vers serveur
- joinSession
- startGame
- submitAnswer
- validateAnswer
- validateAnswerNoPoints
- revealAnswer
- nextQuestion

### 6.2 Evenements serveur vers clients
- newQuestion
- answerSubmitted
- timerStopped
- camembertUpdated
- answerValidated
- answerValidatedNoPoints
- revealAnswer
- gameOver

## 7. Securite
- JWT requis pour endpoints d'administration.
- Verification de role Admin pour la gestion utilisateurs.
- Blocage de connexion pour comptes users inactifs.
- Hash des mots de passe via bcrypt.
- Rate limiting sur login et routes sensibles.
- CORS configurable par environnement.
- Helmet actif.

## 8. Configuration

Variables d'environnement principales:
- PORT
- JWT_SECRET
- CORS_ORIGINS
- REACT_APP_API_URL
- DB_PATH (optionnel)

## 9. Build, execution, tests

### 9.1 Scripts
- npm start
- npm run build
- npm run test:backend
- npm run test:frontend
- npm run test:all

### 9.2 Strategie de test
- Backend: tests d'integration API + flux Socket.IO.
- Frontend: tests unitaires/composants sur pages et widgets critiques.

## 10. Observabilite et maintenance
- Journaux applicatifs via console server-side.
- Migrations DB appliquees au demarrage.
- Seed admin automatique si compte absent.

## 11. Limites connues
- Etat live en memoire locale (pas partage multi-instance).
- SQLite adaptee a des charges modestes mono-instance.
- Certaines routes historiques restent centralisees dans server.js.

## 12. Pistes d'evolution
- Externaliser l'etat live (ex: Redis) pour scaler horizontalement.
- Poursuivre l'extraction modulaire des routes metier.
- Ajouter une specification OpenAPI.
- Ajouter un workflow E2E (Cypress/Playwright) pour les parcours critiques.
