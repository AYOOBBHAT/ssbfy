# SSBFY — commands & scripts reference

Run commands from the **project folder** shown (e.g. `cd backend` first).

---

## Backend API (`backend/`)

| Command | What it does |
|--------|----------------|
| `npm run dev` | API with auto-reload (`nodemon`) |
| `npm start` | Production-style start (`node src/server.js`) |

**Health (no auth):** `GET /health` and `GET /api/health` (same JSON: `status`, `uptime`, `timestamp`).

### DB integrity audits (read-only)

Requires valid `MONGODB_URI` in `backend/.env`. Run from `backend/`:

| npm script | Script file |
|------------|-------------|
| `npm run audit:topics` | `scripts/audit-duplicate-topics.mjs` |
| `npm run audit:questions` | `scripts/audit-question-integrity.mjs` |
| `npm run audit:tests` | `scripts/audit-test-integrity.mjs` |
| `npm run audit:users` | `scripts/audit-user-integrity.mjs` |
| `npm run audit:pdfs` | `scripts/audit-pdf-integrity.mjs` |
| `npm run audit:indexes` | `scripts/audit-indexes.mjs` |
| `npm run audit:all` | All of the above in sequence |

Optional flags (most audits): `--verbose`  
Direct: `node scripts/audit-duplicate-topics.mjs --verbose`

### Subject globalization (merge duplicates)

Requires valid `MONGODB_URI`. Run from `backend/`:

| npm script | Direct command | Notes |
|------------|------------------|--------|
| `npm run migrate:global-subjects` | `node scripts/migrate-global-subjects.mjs` | **Dry-run by default.** Merges same-name subjects, remaps topics/questions/notes. Add `--apply` to write; `--verbose` for detail. Deploy the relaxed backend first if duplicate names would block the new global unique index. |

### Safe fix scripts (writes only with `--apply`)

| npm script | Direct command | Notes |
|------------|------------------|--------|
| `npm run fix:question-postids` | `node scripts/fix-question-postids-dedupe.mjs` | Dedupe `postIds` on questions. Default: dry-run. Add `--apply` to write. |
| `npm run fix:pdf-fileurl` | `node scripts/fix-clear-pdf-fileurl.mjs` | Clear invalid non-http `fileUrl` on PdfNotes. Add `--apply` to write. |
| `npm run fix:topic-names-trim` | `node scripts/fix-trim-topic-names.mjs` | Trim topic names when no CI collision. Add `--apply` to write. |

### One-off maintenance (manual)

| Command | Purpose |
|---------|---------|
| `node scripts/unset-pdfnote-fileurl.mjs` | **Destructive / broad:** `$unset` `fileUrl` on **all** `PdfNote` documents. Run only when you intend to strip legacy URLs cluster-wide. Uses `dotenv/config`; run from `backend/`. |

---

## Mobile app (`mobile/`)

| Command | What it does |
|--------|----------------|
| `npm start` | Expo dev server (`expo start`) |
| `npm run android` | Native Android run |
| `npm run ios` | Native iOS run |
| `npm run eas:production:android` | EAS production Android build |
| `npm run eas:production:ios` | EAS production iOS build |
| `npm run eas:preview:android` | EAS preview Android build |
| `npm run eas:preview:ios` | EAS preview iOS build |

Env templates: `mobile/.env.example` (`EXPO_PUBLIC_*`, Sentry).

### Sentry note (launch default)

We **keep Sentry runtime reporting enabled** (DSN-based), but we **disable automatic sourcemap uploads** in EAS builds by default so builds succeed without `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, and `SENTRY_PROJECT`.

To re-enable uploads later: remove `SENTRY_DISABLE_AUTO_UPLOAD=true` from `mobile/eas.json`, then configure Sentry credentials in EAS secrets/env.

---

## Admin panel (`admin/`)

| Command | What it does |
|--------|----------------|
| `npm run dev` | Vite dev server |
| `npm run build` | Production build |
| `npm run preview` | Preview production build |
| `npm run lint` | ESLint |

Env templates: `admin/.env.example` (`VITE_API_BASE_URL`, `VITE_SENTRY_DSN`).

---

## Environment files (copy to `.env`)

| Package | Example file |
|---------|----------------|
| Backend | `backend/.env.example` |
| Mobile | `mobile/.env.example` |
| Admin | `admin/.env.example` |

---

## Optional operational extras (from project setup)

| Variable / action | Where |
|-------------------|--------|
| `LOG_LEVEL` | Backend structured logs (pino) |
| `SYNC_INDEXES=true` (one-time) | Backend — triggers index sync on prod startup; unset after use |
| Sentry DSNs | `EXPO_PUBLIC_SENTRY_DSN` (mobile), `VITE_SENTRY_DSN` (admin), enable in EAS/build as needed |

---

## Suggested routine

1. **Local dev:** `backend` → `npm run dev`; `mobile` → `npm start`; `admin` → `npm run dev`.  
2. **Before/after data changes:** `cd backend` → `npm run audit:all` (review output).  
3. **Repairs:** run matching `fix:*` **without** `--apply` first; add `--apply` only after reviewing the log.
