# Audio Monitoring Platform — CLAUDE.md

## Project Overview

A web platform for audio monitoring officers to verify assessment recordings against collected survey data. Officers listen to audio files from a Google Drive folder, compare what they hear against the recorded responses in the dataset, and log compliance verdicts with comments. Observations with < 85% compliance are automatically flagged.

The platform supports **multiple instruments** — currently **EGRA/EGMA** and **ASER** — each with its own survey data export, Drive audio folder, and assessment section schema, but sharing one login, one backend, one Google Sheet, and one Analytics dashboard. Officers pick an instrument first (at the Dashboard), then review within that instrument.

## Instruments

Instrument config lives in `server/config/instruments/` — one file per instrument (`egraEgma.js`, `aser.js`) plus a registry (`index.js`). Each instrument config declares:

- `key` / `label` — e.g. `egra_egma` / "EGRA / EGMA"
- `csvPathEnvVar` (+ optional `csvPathFallbackEnvVar`) — where the local cached data file lives
- `dataFileIdEnvVar` — the Google Drive file ID to sync that data file from (Drive is the source of truth; the local file is a cache — see **Data Sync** below)
- `driveFolderIdEnvVar` — which Drive folder holds this instrument's audio files
- `idField` — the canonical unique-id column (`unique_id_calc` for both today)
- `fieldMap` — maps canonical summary field names (`unique_id_calc`, `enumerator_name`, `school_name`, `emis_code`, `caseid`, `SubmissionDate`, `audio_comp`) to that instrument's actual CSV column names, since ASER's raw export uses different column names for some of these (e.g. `Enumerator_Name`, `emis_name`) than EGRA/EGMA's CSV does
- `displayFields` — which observation fields the review screen's side panel shows
- `sections` — the assessment section/compliance schema (see below)
- `gradeField` / `gradeBands` — for grade-banded instruments like ASER, which raw column holds the grade and how grades map to bands (e.g. `{'1-3': [1,2,3], '4-5': [4,5]}`); sections carrying a matching `gradeBand` are the only ones offered for an observation in that band

`GET /api/instruments` lists available instruments; `GET /api/instruments/:key/config` returns one instrument's full config (sections/displayFields/gradeField/gradeBands) — the client fetches this rather than hardcoding a duplicate copy, so there's one source of truth for section schema.

### EGRA / EGMA

Flat, fixed-item sections (18 total) — see `server/config/instruments/egraEgma.js` (wraps `server/config/sections.js`). Each section has a `label`, `group` (Urdu/English/Math), `items` (raw per-item CSV columns), `summaryFields`, and `verifyFields` (the summary-level fields the officer actually verifies, with display labels — e.g. section `listcomp_urd` → verify field `listcomp_numcorrect_urd` "Number Correct").

### ASER

Grade-banded sections (8 total: Urdu/English/Math/General Knowledge × Grade 1-3/Grade 4-5) — see `server/config/instruments/aser.js`. Unlike EGRA/EGMA, ASER's raw columns *are* the per-item verify fields (no 100-item grid collapsing into one summary score), so `verifyFields` map close to 1:1 with `items`. Section keys are prefixed `aser_` to keep them distinct from EGRA/EGMA's in the shared `verdicts_json`/analytics namespace.

**This grouping is a first pass drawn from the ASER XLSForm's own group boundaries — get a domain sign-off before treating it as final.** The Grade 4-5 groups are *not* a clean rename-mirror of Grade 1-3: several G4-5 items (masculine/feminine, grammar, extra comprehension questions) have no G1-3 counterpart, and some G4-5 sections include "Grade 1-3 fallback" items for students who need the easier assessment.

## Source Data

| File | Purpose |
|------|---------|
| `EGRA_EGMA_Combine_WIDE.csv` | EGRA/EGMA master survey data (one row per student observation, 1000+ columns) — local cache of the Drive file, auto-synced (see below) |
| `ASER_ICT_Endline_FINAL_WIDE.csv` | ASER master survey data (249 columns) — local cache of the Drive file, auto-synced |
| `EGRA_EGMA_Combine codebook v109.html` | Codebook describing EGRA/EGMA variables and answer codes |
| `ASER_xls.xlsx` | ASER XLSForm (survey + choices tabs) — the form definition, not collected data |

**Key identifier fields:** `unique_id_calc`, `enumerator_name`, `school_name`, `caseid` (canonical names — see `fieldMap` above for how each instrument's raw columns map to these)

**`unique_id_calc` is not guaranteed unique within a CSV** — confirmed duplicate groups in both instruments' data (two distinct physical recordings can share one id). Don't use it as a locking/lookup key — see **Claim & Review Keying** below. When fetching a full observation row (`GET /api/observations/:id`), pass `?segment=<audio_filename_segment>` to disambiguate.

**Audio link field:** `audio_comp` — contains a SurveyCTO URL whose `file=` parameter is the Google Drive filename (starts with `AA_`, e.g. `AA_75469b92-e2a1-44e3-bf25-bf5c6e52a03b_Enumerator_Name.m4a`). Same URL shape for both instruments.

## Data Sync (Drive → local cache)

Each instrument's master CSV lives on Google Drive (see **External Resources**) — that's the source of truth, not the local file. `server/services/csvLoader.js`:

- Downloads the Drive file into the local `csvPath` **once per instrument per server process**, the first time that instrument's data is requested (memoized — repeated requests don't re-download). This normally means "once at server boot" — `server/index.js` proactively warms both instruments' data on startup so the first Dashboard load doesn't stall on a cold ~20MB download.
- Falls back to whatever's already at the local path if the Drive download fails (missing permissions, network issue, etc.) — logs a warning, doesn't crash.
- Downloads to a `.tmp` file and renames into place atomically, so a concurrent reader never sees a half-written file.
- **`POST /api/instruments/:key/refresh-data`** (auth required) forces a fresh download + re-parse for one instrument, discarding the in-memory cache — this is what the Dashboard's "Sync Data from Drive" button calls. Use this to pull a freshly-exported CSV without redeploying/restarting the server.

If an instrument's Drive audio folder has files that don't match any row in its data export (0 matches on the Dashboard), that means the data export is stale relative to the audio — hit "Sync Data from Drive", and if it's still stale, the underlying export on Drive needs to be regenerated.

## External Resources

| Resource | URL / Location |
|----------|---------------|
| EGRA/EGMA audio files (Google Drive) | `https://drive.google.com/drive/folders/13-sArEtLQ6yaGCv9q5D_i3igCLcXuxxQ` |
| ASER audio files (Google Drive) | `https://drive.google.com/drive/folders/1nwBAKufRBoudR0Ta0LQVk6I5ydZAsgdf` |
| EGRA/EGMA master data (Google Drive) | `https://drive.google.com/file/d/1MEkDufw_K4xue3oRHQmyFeSiKPYzeLe7/view` |
| ASER master data (Google Drive) | `https://drive.google.com/file/d/1vjEQTv6LaQGBTZ16M6Q32C7_5moFd2Tl/view` |
| Review output sheet (shared across instruments) | `https://docs.google.com/spreadsheets/d/1N1POd9dhcXy3f-u_UZggNsLzE3hlObK4Y7JzFJQANQI` |

## Tech Stack

- **Frontend:** React (Vite), deployed to **Vercel**
- **Backend:** Node.js + Express, deployed to **Render**
- **Database (session state):** Google Sheet (`Reviews`/`Claims` tabs, shared across instruments) — stores claim locks and review records; local CSV files are a data cache, not a database
- **Google APIs:** Sheets API v4 + Drive API v3 via service account
- **Auth:** Simple username + bcrypt-hashed password, JWT sessions

## Architecture

```
React SPA (Vercel)
  └── REST API (Express on Render)
        ├── GET  /api/instruments               → List available instruments [{key,label}]
        ├── GET  /api/instruments/:key/config   → Section schema + display fields for one instrument
        ├── POST /api/instruments/:key/refresh-data → Force a fresh Drive data sync
        ├── GET  /api/session                   → Pull Google Sheet for completed/claimed/draft state (all instruments)
        ├── GET  /api/observations?instrument=  → Return CSV summary rows for one instrument
        ├── GET  /api/observations/:id?instrument=&segment= → Full row, segment disambiguates duplicate ids
        ├── GET  /api/audio/files?instrument=   → List + match that instrument's Drive folder against its CSV
        ├── POST /api/claim                     → Lock an audio file for a reviewer (keyed by audio_filename)
        ├── POST /api/reviews                   → Submit/save-draft review, write row to Google Sheet
        ├── GET  /api/analytics?instrument=     → Aggregated compliance stats, scoped to one instrument
        └── Drive API                           → Stream audio files to browser, sync data files to local cache
```

## Officer Workflow

1. **Login** — simple username + password
2. **Pick instrument** — Dashboard shows an instrument picker (EGRA/EGMA · ASER) when more than one is configured; selection persists via `?instrument=` in the URL
3. **Session load** — app fetches the Google Sheet to mark already-reviewed/claimed files, scoped to the selected instrument
4. **File list** — shows that instrument's Drive audio files, with reviewed/claimed/available status
5. **Claim** — officer clicks a file → auto-matched to the observation via `audio_comp` field; marked "in review" so other officers skip it
6. **Review screen:**
   - Left: embedded audio player (streamed from Drive) + observation data (key fields + section data)
   - Right: section selector + item-level verification
   - For grade-banded instruments (ASER), only the sections matching the observation's grade band are offered
7. **Section verification** — officer selects which sections to verify; for each section, an item-level table shows variable name, recorded value, and a checkbox (Correct / Incorrect / Cannot Determine) + optional per-item comment
8. **Overall comment** — free-text box at the bottom
9. **Submit** — review written to Google Sheet; compliance score computed

## Compliance Rules

- **Per observation compliance** = (number of items marked Correct by officer) / (total items verified, excluding "Cannot Determine") × 100 — computed server-side in `calculateCompliance()` (`server/routes/reviews.js`), which is fully generic over whatever section/verdict shape it's given (no instrument-specific logic)
- **Flag threshold:** < 85% compliance → observation flagged for supervisor review
- Compliance is calculated across all sections the officer chose to verify in a session

## Google Sheet Schema (output)

Shared `Reviews` and `Claims` tabs across both instruments — the last column on each is `instrument` (`egra_egma` | `aser`). Rows written before this column existed are treated as `egra_egma` wherever read.

Each review writes one row to `Reviews`:

| Column | Content |
|--------|---------|
| `review_id` | UUID generated at submit time |
| `unique_id_calc` | Matched observation ID (descriptive only — see keying note below) |
| `audio_filename` | e.g. `AA_75469b92-..._Enumerator_Name.m4a` — the true per-submission key |
| `reviewer` | Username of officer |
| `review_timestamp` | ISO 8601 |
| `status` | `draft` \| `complete` |
| `sections_reviewed` | Comma-separated section keys |
| `overall_compliance_pct` | Number 0–100 |
| `flagged` | `true` / `false` |
| `overall_comment` | Free text |
| `verdicts_json` | JSON string: `{"sectionKey": {"itemKey": "correct"|"incorrect"|"unknown", ...}, ...}` |
| `comments_json` | JSON string: per-section free-text comments |
| `instrument` | `egra_egma` \| `aser` |

`Claims` mirrors this for in-progress work (`unique_id_calc`, `audio_filename`, `audio_file_id`, `reviewer`, `claimed_at`, `status` (`claimed`\|`draft`), `draft_data_json`, `instrument`).

### Claim & Review Keying

**Keyed by `audio_filename`, not `unique_id_calc`.** `unique_id_calc` isn't unique within a CSV (confirmed duplicate groups in both instruments' data — two distinct recordings can legitimately share one id), so it can't safely identify one claim/review. `audio_filename` (equivalently, Drive's `audio_file_id`) is 1:1 with the physical recording an officer is actually reviewing and is already sent on every claim/review request — `server/services/googleSheets.js`'s `getClaim`/`deleteClaim`/`findClaimRowIndex` all match on it.

## Audio File ↔ Observation Matching

1. Extract filename from `audio_comp` field: parse the `file=` query parameter from the URL — this gives a string containing `AA_<UUID>_Enumerator_Name.m4a` (or `_enumerator.m4a` in older EGRA/EGMA exports)
2. In Google Drive, audio files may have additional text prepended before `AA_` (e.g. `Copy of AA_uuid_....m4a`)
3. Match by checking if the Drive filename **contains** the `AA_<UUID>` substring from the `audio_comp` field — scoped per-instrument (each instrument only matches against its own Drive folder + CSV)
4. If no match found, officer can manually search/select the observation
5. If **no files at all** match for an instrument, the data export is stale relative to the Drive audio folder — see **Data Sync** above

## Session State at Login

On app load (or explicit refresh):
1. Fetch all rows from the Google Sheet's `Reviews`/`Claims` tabs (`GET /api/session` — covers every instrument)
2. Client-side, scope those rows to the currently-selected instrument (by the row's `instrument` column) before merging onto the file list — a physical file reviewed under one instrument must not show as reviewed under another, even though both instruments' audio may share overlapping Drive folder history
3. Build a map of `audio_filename` → completed/claimed/draft state
4. Mark files in the UI accordingly

## Analytics Dashboard

Visible to all logged-in users, scoped to one instrument at a time (`GET /api/analytics?instrument=`):

- **Stat cards:** total reviewed, average compliance, flagged count
- **Compliance by enumerator:** bar chart, avg compliance % per enumerator
- **Compliance by section:** bar chart, avg compliance % per section — uses that instrument's own section schema, so ASER's `aser_*` section keys don't get silently dropped the way they would if this still read from a single hardcoded EGRA/EGMA section map
- **Reviews by reviewer:** table with review count / avg compliance / flag count per officer
- **Flagged observations list:** table of all flagged rows for the selected instrument, with school/enumerator/compliance/reviewer/date

## Auth

- Backend maintains a `users.json` (or env-configured list) of `{username, passwordHash}`
- Login returns a signed JWT (24h expiry)
- All API routes are protected; JWT passed in `Authorization` header (or `?token=` query param for `<audio src>` streaming)
- No self-registration; accounts are provisioned by the project lead

## Environment Variables (backend)

```
GOOGLE_SERVICE_ACCOUNT_KEY=<base64-encoded service account JSON>
GOOGLE_SHEET_ID=1N1POd9dhcXy3f-u_UZggNsLzE3hlObK4Y7JzFJQANQI

# Per-instrument Drive audio folders
GOOGLE_DRIVE_FOLDER_ID=<EGRA/EGMA audio folder id>
GOOGLE_DRIVE_FOLDER_ID_ASER=<ASER audio folder id>

# Per-instrument Drive master-data file ids (synced into CSV_PATH_* — see Data Sync)
GOOGLE_DRIVE_DATA_FILE_ID_EGRA=<EGRA/EGMA data file id>
GOOGLE_DRIVE_DATA_FILE_ID_ASER=<ASER data file id>

# Local cache paths the Drive files above are synced into
CSV_PATH=../EGRA_EGMA_Combine_WIDE.csv   # fallback alias for CSV_PATH_EGRA (back-compat)
CSV_PATH_EGRA=../EGRA_EGMA_Combine_WIDE.csv
CSV_PATH_ASER=../ASER_ICT_Endline_FINAL_WIDE.csv

JWT_SECRET=<random string>
USERS=<JSON array of {username, passwordHash}>
```

## Folder Structure

```
audio-monitoring/
├── client/          # React + Vite frontend
│   ├── src/
│   │   ├── pages/        # Login, Dashboard, ReviewScreen, Analytics
│   │   ├── components/   # NavBar, AudioPlayer, ObservationPanel, SectionVerifier
│   │   └── api/          # Axios wrappers for backend (client.js)
│   └── vite.config.js
├── server/          # Express backend
│   ├── config/
│   │   ├── sections.js          # EGRA/EGMA section schema (wrapped by instruments/egraEgma.js)
│   │   └── instruments/         # Per-instrument config registry
│   │       ├── egraEgma.js
│   │       ├── aser.js
│   │       └── index.js
│   ├── routes/       # observations, audio, reviews, analytics, instruments, auth
│   ├── services/     # googleSheets.js, googleDrive.js, csvLoader.js, googleAuth.js
│   ├── middleware/   # auth.js
│   └── index.js
├── EGRA_EGMA_Combine_WIDE.csv        # local cache, synced from Drive
├── ASER_ICT_Endline_FINAL_WIDE.csv   # local cache, synced from Drive
├── ASER_xls.xlsx                     # ASER XLSForm (form definition)
└── CLAUDE.md
```

## Officers

Two officers for initial deployment:
- `mpatel`
- `ahwaz`

Passwords are set via the `USERS` environment variable (bcrypt-hashed). Accounts provisioned by project lead.

## Review Rules

- **Partial reviews:** Allowed — officers can save progress and return. The claim lock persists. A review has status `draft` (in-progress) or `complete` (submitted).
- **One reviewer per file:** Once a file is claimed and submitted (status = `complete`), it is locked and removed from the queue for all other officers. Locking is per `audio_filename`, not `unique_id_calc` (see **Claim & Review Keying**).
- **Claim expiry:** Not currently implemented — a `draft`/`claimed` row persists indefinitely until submitted or released. (This doc previously stated a 24-hour auto-expiry; there's no code enforcing that today — the only 24h expiry in the codebase is the JWT login session in `server/routes/auth.js`. Treat this as a known gap, not a working feature, until it's built.)
- **No round tracking needed:** each round's submissions get a fresh `unique_id_calc`, so round 1 and round 2 data never collide on locking/compliance — no explicit "round" dimension exists in the schema.
