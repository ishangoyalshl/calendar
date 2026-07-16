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
- 💾 **Auto-save** to JSON on every cell change
- Zero frontend dependencies — plain HTML + CSS + Vanilla JS

---

## Stack

| Layer    | Technology                          |
|----------|-------------------------------------|
| Frontend | HTML + CSS + Vanilla JS             |
| Backend  | Node.js + Express                   |
| Storage  | JSON file (`data/calendar.json`)    |

---

## Setup

### Prerequisites

- [Node.js](https://nodejs.org/) v14 or later

### Run

```bash
git clone <repo-url>
cd calendar
npm install
npm start
```

Visit **http://localhost:3000** in your browser.

---

## File Structure

```
/
├── server.js              # Express server + REST API
├── package.json
├── data/
│   └── calendar.json      # Persistent JSON storage
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

## Migrating to SQLite

The JSON structure maps cleanly to two SQL tables:

```sql
CREATE TABLE members (
  id   INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT    NOT NULL UNIQUE
);

CREATE TABLE entries (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  month     TEXT    NOT NULL,  -- "YYYY-MM"
  member    TEXT    NOT NULL,  -- member name (or FK to members.id)
  day       INTEGER NOT NULL,  -- 1–31
  status    TEXT    NOT NULL,  -- "WFO" | "WFH" | "Leave" | "Holiday"
  UNIQUE(month, member, day)
);
```

**Migration steps:**

1. Add `better-sqlite3` (or `sqlite3`) to `package.json`
2. Replace `readData()` / `writeData()` in `server.js` with SQL queries
3. Run a one-time migration script to import `calendar.json` into the DB
4. No frontend changes required — the API contract stays the same

---

## Status Colors

| Status  | Color   | Hex       |
|---------|---------|-----------|
| WFO     | Green   | `#4CAF50` |
| WFH     | Blue    | `#2196F3` |
| Leave   | Orange  | `#FF9800` |
| Holiday | Purple  | `#9C27B0` |
| Empty   | Gray    | —         |
