# Team WFH/Leave Calendar

A lightweight, self-hosted web app to track your team's Work-From-Home (WFH), planned leaves, office attendance, and holidays on a monthly calendar grid — inspired by calendar.online's shared calendar layout.

---

## Features

- 📅 **Monthly grid view** — rows = team members, columns = days of the month
- 🖱️ **Click a cell to cycle status**: WFO → WFH → Leave → Holiday → *(clear)*
- 🎨 **Color-coded statuses** with legend
- 👥 **Add / remove team members** dynamically
- ⬅️➡️ **Month navigation** with Today shortcut
- 📊 **Per-person monthly summary** (WFO / WFH / Leave / Holiday counts)
- 🗓️ **Weekends** visually dimmed; **today's column** highlighted
- 💾 **Auto-save** on every cell change via backend API
- Zero frontend dependencies — plain HTML + CSS + Vanilla JS

---

## Stack

| Layer    | Technology                          |
|----------|-------------------------------------|
| Frontend | HTML + CSS + Vanilla JS             |
| Backend  | Node.js + Express                   |
| Storage  | Supabase (via `@supabase/supabase-js`) with local JSON fallback |

---

## Setup

### Option A — Self-hosted (Node.js server, shared data)

Runs with a backend server. Data is shared through the API (Postgres when configured, otherwise local `data/calendar.json`).

```bash
git clone https://github.com/ishangoyalshl/calendar.git
cd calendar
npm install
npm start
```

Visit **http://localhost:3000**

> Optional: set `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` (or `SUPABASE_ANON_KEY`) to run with Supabase instead of JSON file storage.

---

### Option B — GitHub Pages (static, per-browser data)

The app is automatically deployed to GitHub Pages on every push to `main` via GitHub Actions.

**One-time setup** (only needed once, by a repo admin):

1. Go to your repo → **Settings → Pages**
2. Under **Source**, select **GitHub Actions**
3. Click **Save**

After your next push to `main`, the workflow will deploy the app to:
```
https://<your-username>.github.io/calendar/
```

> **Note:** On GitHub Pages there is no backend server, so data is stored in your browser's `localStorage`. Each browser/device has its own copy — ideal for personal use or quick demos. For shared team data, use the Node.js self-hosted option.

---

### Option C — Vercel + Supabase (frontend + API + persistent DB)

1. Import this repo in Vercel.
2. Create a Supabase project and copy the project URL and API key.
3. In Vercel, set these environment variables in **Project Settings → Environment Variables**:
  - `SUPABASE_URL`
  - `SUPABASE_SERVICE_ROLE_KEY` (recommended for server-side API usage)
  - or `SUPABASE_ANON_KEY` (if you intentionally want restricted/RLS-bound access)
4. Ensure your Supabase table policies allow the API operations you use.
5. Keep `main` as the production branch.
6. Deploy.

The app uses serverless API routes on Vercel and keeps the same frontend/API contract.

---

## File Structure

```
/
├── server.js              # Express server + REST API
├── app.js                 # Shared Express app (used by local + Vercel)
├── vercel.json            # API rewrite config for Vercel
├── api/
│   └── index.js           # Vercel serverless API entrypoint
├── package.json
├── data/
│   └── calendar.json      # Local fallback storage
└── public/
    ├── index.html         # Main app page
    ├── style.css          # Styles
    └── app.js             # Frontend logic
```

---

## API Endpoints

| Method   | Endpoint                | Description                        |
|----------|-------------------------|------------------------------------|
| GET      | `/api/data`             | Return all members + calendar data |
| POST     | `/api/data`             | Save updated calendar entries      |
| GET      | `/api/members`          | Return list of team members        |
| POST     | `/api/members`          | Add a new team member              |
| DELETE   | `/api/members/:name`    | Remove a team member               |
| GET      | `/api/health`           | Health + active storage mode       |

---

## Data Format

```json
{
  "members": ["Alice", "Bob", "Charlie"],
  "entries": {
    "2026-07": {
      "Alice": {
        "1": "WFO",
        "2": "WFH",
        "15": "Leave"
      },
      "Bob": {
        "10": "Holiday"
      }
    }
  }
}
```

- **members** — ordered list of team member names (unique)
- **entries** — keyed by `"YYYY-MM"`, then by member name, then by day number (string)
- Valid status values: `"WFO"`, `"WFH"`, `"Leave"`, `"Holiday"`

---

## Database Schema (auto-created)

When `SUPABASE_URL` with a key is configured, the app reads/writes these tables (create them in Supabase SQL editor if they do not exist):

```sql
CREATE TABLE members (
  id   SERIAL PRIMARY KEY,
  name TEXT    NOT NULL UNIQUE
);

CREATE TABLE entries (
  id        SERIAL PRIMARY KEY,
  month     TEXT    NOT NULL,  -- "YYYY-MM"
  member    TEXT    NOT NULL,  -- member name
  day       INTEGER NOT NULL,  -- 1–31
  status    TEXT    NOT NULL,  -- "WFO" | "WFH" | "Leave" | "Holiday"
  UNIQUE(month, member, day)
);
```

---

## Status Colors

| Status  | Color   | Hex       |
|---------|---------|-----------|
| WFO     | Green   | `#4CAF50` |
| WFH     | Blue    | `#2196F3` |
| Leave   | Orange  | `#FF9800` |
| Holiday | Purple  | `#9C27B0` |
| Empty   | Gray    | —         |
