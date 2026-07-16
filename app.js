const express = require('express');
const fs = require('fs');
const path = require('path');
const { sql } = require('@vercel/postgres');

const app = express();
const ALLOWED_STATUSES = new Set(['WFO', 'WFH', 'Leave', 'Holiday']);
const DATA_DIR = path.join(__dirname, 'data');
const DATA_FILE = path.join(DATA_DIR, 'calendar.json');
const hasDatabase = Boolean(process.env.POSTGRES_URL || process.env.DATABASE_URL);

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

let dbInitPromise;
function ensureDbReady() {
  if (!hasDatabase) return Promise.resolve();
  if (!dbInitPromise) {
    dbInitPromise = (async () => {
      await sql`CREATE TABLE IF NOT EXISTS members (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL UNIQUE
      )`;
      await sql`CREATE TABLE IF NOT EXISTS entries (
        id SERIAL PRIMARY KEY,
        month TEXT NOT NULL,
        member TEXT NOT NULL,
        day INTEGER NOT NULL,
        status TEXT NOT NULL,
        UNIQUE(month, member, day)
      )`;
    })();
  }
  return dbInitPromise;
}

function readFileData() {
  if (!fs.existsSync(DATA_FILE)) {
    return { members: [], entries: {} };
  }
  const raw = fs.readFileSync(DATA_FILE, 'utf8');
  return JSON.parse(raw);
}

function writeFileData(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf8');
}

async function readData() {
  if (!hasDatabase) return readFileData();

  await ensureDbReady();
  const [membersResult, entriesResult] = await Promise.all([
    sql`SELECT name FROM members ORDER BY id ASC`,
    sql`SELECT month, member, day, status FROM entries ORDER BY month, member, day`
  ]);

  const members = membersResult.rows.map((row) => row.name);
  const entries = {};

  for (const row of entriesResult.rows) {
    if (!entries[row.month]) entries[row.month] = {};
    if (!entries[row.month][row.member]) entries[row.month][row.member] = {};
    entries[row.month][row.member][String(row.day)] = row.status;
  }

  return { members, entries };
}

function isValidEntries(entries) {
  if (!entries || typeof entries !== 'object' || Array.isArray(entries)) return false;

  for (const [month, monthEntries] of Object.entries(entries)) {
    if (!/^\d{4}-\d{2}$/.test(month)) return false;
    if (!monthEntries || typeof monthEntries !== 'object' || Array.isArray(monthEntries)) return false;

    for (const [member, memberEntries] of Object.entries(monthEntries)) {
      if (!member || typeof member !== 'string') return false;
      if (!memberEntries || typeof memberEntries !== 'object' || Array.isArray(memberEntries)) return false;

      for (const [day, status] of Object.entries(memberEntries)) {
        const dayNum = Number(day);
        if (!Number.isInteger(dayNum) || dayNum < 1 || dayNum > 31) return false;
        if (!ALLOWED_STATUSES.has(status)) return false;
      }
    }
  }

  return true;
}

async function saveEntries(entries) {
  if (!hasDatabase) {
    const current = readFileData();
    current.entries = entries;
    writeFileData(current);
    return;
  }

  await ensureDbReady();
  await sql`BEGIN`;
  try {
    await sql`DELETE FROM entries`;

    for (const [month, monthEntries] of Object.entries(entries)) {
      for (const [member, memberEntries] of Object.entries(monthEntries)) {
        for (const [day, status] of Object.entries(memberEntries)) {
          await sql`
            INSERT INTO entries (month, member, day, status)
            VALUES (${month}, ${member}, ${Number(day)}, ${status})
          `;
        }
      }
    }

    await sql`COMMIT`;
  } catch (error) {
    await sql`ROLLBACK`;
    throw error;
  }
}

async function addMember(name) {
  const trimmed = name.trim();

  if (!hasDatabase) {
    const data = readFileData();
    if (data.members.includes(trimmed)) {
      const err = new Error('Member already exists');
      err.status = 409;
      throw err;
    }
    data.members.push(trimmed);
    writeFileData(data);
    return data.members;
  }

  await ensureDbReady();
  try {
    await sql`INSERT INTO members (name) VALUES (${trimmed})`;
  } catch (error) {
    if (error.code === '23505') {
      const err = new Error('Member already exists');
      err.status = 409;
      throw err;
    }
    throw error;
  }

  const result = await sql`SELECT name FROM members ORDER BY id ASC`;
  return result.rows.map((row) => row.name);
}

async function removeMember(name) {
  if (!hasDatabase) {
    const data = readFileData();
    const idx = data.members.indexOf(name);
    if (idx === -1) {
      const err = new Error('Member not found');
      err.status = 404;
      throw err;
    }

    data.members.splice(idx, 1);
    for (const month of Object.keys(data.entries)) {
      if (data.entries[month]) delete data.entries[month][name];
    }
    writeFileData(data);
    return data.members;
  }

  await ensureDbReady();
  const existing = await sql`SELECT id FROM members WHERE name = ${name}`;
  if (existing.rowCount === 0) {
    const err = new Error('Member not found');
    err.status = 404;
    throw err;
  }

  await sql`BEGIN`;
  try {
    await sql`DELETE FROM members WHERE name = ${name}`;
    await sql`DELETE FROM entries WHERE member = ${name}`;
    await sql`COMMIT`;
  } catch (error) {
    await sql`ROLLBACK`;
    throw error;
  }

  const result = await sql`SELECT name FROM members ORDER BY id ASC`;
  return result.rows.map((row) => row.name);
}

app.get('/api/health', (req, res) => {
  res.json({ ok: true, storage: hasDatabase ? 'database' : 'file' });
});

app.get('/api/data', async (req, res) => {
  try {
    const data = await readData();
    res.json(data);
  } catch (error) {
    console.error('GET /api/data failed', error);
    res.status(500).json({ error: 'Failed to read data' });
  }
});

app.post('/api/data', async (req, res) => {
  try {
    const { entries } = req.body;
    if (!isValidEntries(entries)) {
      return res.status(400).json({ error: 'Invalid entries payload' });
    }

    await saveEntries(entries);
    res.json({ success: true });
  } catch (error) {
    console.error('POST /api/data failed', error);
    res.status(500).json({ error: 'Failed to save data' });
  }
});

app.get('/api/members', async (req, res) => {
  try {
    const data = await readData();
    res.json(data.members);
  } catch (error) {
    console.error('GET /api/members failed', error);
    res.status(500).json({ error: 'Failed to read members' });
  }
});

app.post('/api/members', async (req, res) => {
  try {
    const { name } = req.body;
    if (!name || typeof name !== 'string' || !name.trim()) {
      return res.status(400).json({ error: 'Member name is required' });
    }

    const members = await addMember(name);
    res.status(201).json({ success: true, members });
  } catch (error) {
    console.error('POST /api/members failed', error);
    res.status(error.status || 500).json({ error: error.message || 'Failed to add member' });
  }
});

app.delete('/api/members/:name', async (req, res) => {
  try {
    const name = decodeURIComponent(req.params.name);
    const members = await removeMember(name);
    res.json({ success: true, members });
  } catch (error) {
    console.error('DELETE /api/members/:name failed', error);
    res.status(error.status || 500).json({ error: error.message || 'Failed to remove member' });
  }
});

module.exports = app;
