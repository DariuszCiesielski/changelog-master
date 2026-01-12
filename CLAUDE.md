# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build & Development Commands

```bash
# Development (RECOMMENDED - starts both frontend and backend)
npm run dev:all

# Frontend only (port 5173)
npm run dev

# Backend only (port 3001)
npm run dev:server

# Production build
npm run build

# Start production server (serves frontend from dist/)
npm start
```

## Architecture Overview

**Changelog Master** is a full-stack TypeScript application for tracking software changelogs with AI-powered analysis.

### Frontend (React 19 + Vite + Tailwind CSS 4)
- **Entry**: `src/main.tsx` → `src/App.tsx`
- **State management**: Custom hooks in `src/hooks/` (useChangelog, useAudio, useTheme)
- **i18n**: react-i18next with translations in `src/i18n/locales/{en,pl}/translation.json`
- **Key components**: Header, TabNav, ChangelogView, MattersView, ChatPanel, SettingsPanel, SourcesPanel

### Backend (Express.js)
- **Single file**: `server/index.ts` - all API routes, database setup, cron jobs
- **Database**: Turso/LibSQL via @libsql/client (lokalnie: `local.db`, produkcja: Turso cloud)
- **External APIs**: Gemini (analysis + TTS), Resend (email)

### Data Flow
```
User Request → Frontend Hook → Backend API → SQLite Cache / External API → Response
```

## API Endpoints Pattern

| Prefix | Purpose |
|--------|---------|
| `/api/sources/*` | CRUD for changelog sources |
| `/api/analysis/*` | Cached AI analysis |
| `/api/audio/*` | TTS audio cache |
| `/api/chat` | Gemini-powered chat |
| `/api/conversations/*` | Chat history |
| `/api/monitor/*` | Cron job control |
| `/api/settings/*` | User preferences |

## Key Implementation Details

### Internationalization
- Language is passed to Gemini API for localized AI responses
- `useTranslation()` hook used in all components
- Language selection persisted in localStorage via i18next-browser-languagedetector

### Audio System
- TTS via Gemini 2.5 Flash TTS API
- Audio cached in Turso/LibSQL as base64 (keyed by text_hash + voice)
- Frontend caches last played audio in IndexedDB for instant restore

### Analysis Caching
- Analyses cached by version string + language
- Hash function: `hashString(text + '_' + language)`

## Environment Variables

```env
VITE_GEMINI_API_KEY=  # Required - Gemini API for analysis and TTS
RESEND_API_KEY=       # Optional - Email notifications
NOTIFY_EMAIL=         # Optional - Recipient for notifications
TURSO_DATABASE_URL=   # Optional - Turso database URL (puste = local.db)
TURSO_AUTH_TOKEN=     # Optional - Turso auth token
PORT=3001             # Backend port (Railway sets this)
```

## Deployment

**Railway (full-stack) + Turso**:
- Utwórz bazę na Turso: `turso db create changelog-master`
- Build: `npm run build`
- Start: `npm start`
- Server serves static files from `dist/` in production
- Ustaw `TURSO_DATABASE_URL` i `TURSO_AUTH_TOKEN`

**Lokalny rozwój**:
- Bez zmiennych Turso używa automatycznie `local.db`

**Vercel (frontend only)**:
- Requires separate backend deployment
- Set `BACKEND_URL` env var for API proxy
