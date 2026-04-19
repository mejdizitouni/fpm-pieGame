# FPM Pie Game

FPM Pie Game is a real-time educational quiz platform used to run live classroom game sessions.

It provides:
- an administrator back office for sessions, questions, groups, and users,
- a live game control screen for moderation,
- player access links by group,
- real-time scoring with Socket.IO,
- multilingual UI support.

## Key Features

### Session and game lifecycle
- Create, update, clone, activate, reset, and delete game sessions.
- Associate questions and groups to sessions.
- Start and control live game flow from the admin console.
- Track session audit information: created by and last modified by.

### Real-time gameplay
- Push questions live to connected player groups.
- Receive answers in real time.
- Validate answers with automatic or manual scoring.
- Reveal answers and compute winners at end of game.

### User and access management
- JWT-based authentication.
- Admin-only user management.
- Create, edit, activate, and deactivate user accounts.
- Deactivated users are blocked at login.
- Session management is available to authenticated users, while user management is admin-only.

### Internationalization
- Built-in language selector in the header.
- Translations for French, English, Spanish, German, Portuguese, Russian, Arabic, Simplified Chinese, and Traditional Chinese.
- Automatic fallback to default-language keys for missing translations.
- UI text policy: no user-facing labels are hardcoded in components; labels, placeholders, aria labels, and alt text must use translation keys from src/i18n/translations.js.

## Tech Stack

- Frontend: React 18, react-router, react-scripts
- Backend: Node.js, Express, Socket.IO
- Database: SQLite (sqlite3)
- Security: JWT, bcryptjs, helmet, express-rate-limit, CORS
- Tests: Node test runner (backend), React Testing Library (frontend)

## Project Structure

```text
.
|-- src/                      # React source code
|-- public/                   # Public static assets
|-- build/                    # Production frontend build
|-- server/                   # Modular backend pieces (routes/config/services...)
|-- server.js                 # Main API + Socket.IO runtime entrypoint
|-- database.js               # SQLite schema, migrations, seed logic
|-- tests/backend/            # Backend integration tests
|-- docs/
|   |-- FUNCTIONAL_DOCUMENTATION.md
|   |-- TECHNICAL_DOCUMENTATION.md
|-- package.json
```

## Prerequisites

- Node.js >= 18 and < 21
- npm >= 8.18 and < 11

## Local Setup

1. Install dependencies

```bash
npm ci
```

2. Start the application

```bash
npm start
```

By default, the backend runs on port 3001.

3. Build frontend for production

```bash
npm run build
```

Important: this application serves static frontend assets from build output. If you change frontend source code, run a new build before validating the production-served UI.

## Environment Variables

Create a local .env file:

```env
PORT=3001
JWT_SECRET=change-me-in-production
CORS_ORIGINS=http://localhost:3000
REACT_APP_API_URL=http://localhost:3001

# Optional
# DB_PATH=./data/users.db
# SEED_TEST_SESSION=true
```

## Default Seed Data

On initialization, the app seeds an admin account if missing:

- username: admin
- password: WelcomeAdmin2024

Use this account only for first login and rotate credentials immediately in non-local environments.

## Test Commands

- Backend tests:

```bash
npm run test:backend
```

- Frontend tests:

```bash
npm run test:frontend
```

- Full test suite:

```bash
npm run test:all
```

## Deployment Notes

- Build frontend before deployment.
- Ensure JWT_SECRET is set to a strong value.
- Configure CORS_ORIGINS for your target domains.
- Persist SQLite storage volume if runtime filesystem is ephemeral.

## Documentation

Detailed documentation:

- Functional: docs/FUNCTIONAL_DOCUMENTATION.md
- Technical: docs/TECHNICAL_DOCUMENTATION.md

