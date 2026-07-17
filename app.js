const express = require('express');
const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

require('dotenv').config({ path: path.join(__dirname, '.env') });
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

const app = express();
const ALLOWED_STATUSES = new Set(['WFO', 'WFH', 'Leave', 'Holiday']);
const DB_UNIQUE_VIOLATION = '23505';
const DATA_DIR = path.join(__dirname, 'data');
const DATA_FILE = path.join(DATA_DIR, 'calendar.json');

const supabaseUrl = process.env.POSTGRES_THOR_SUPABASE_URL;
const supabaseKey = process.env.POSTGRES_SUPABASE_ANON_KEY;

const hasDatabaseConfig = Boolean(supabaseUrl && supabaseKey);
const supabase = hasDatabaseConfig
  ? createClient(supabaseUrl, supabaseKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false
    }
  })
  : null;

const storageState = {
  mode: 'file',
  initialized: false,
  initPromise: null
};

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

function ensureDbReady() {
  if (storageState.initialized) {
    return Promise.resolve(storageState.mode === 'database');
  }

  if (!hasDatabaseConfig || !supabase) {
    storageState.initialized = true;
    storageState.mode = 'file';
    return Promise.resolve(false);
  }

  if (!storageState.initPromise) {
    storageState.initPromise = (async () => {
      const membersCheck = await supabase
        .from('members')
        .select('id', { head: true, count: 'exact' })
        .limit(1);
      if (membersCheck.error) {
        throw new Error(`members table check failed: ${membersCheck.error.message}`);
      }

      const entriesCheck = await supabase
        .from('entries')
        .select('id', { head: true, count: 'exact' })
        .limit(1);
      if (entriesCheck.error) {
        throw new Error(`entries table check failed: ${entriesCheck.error.message}`);
      }

      storageState.mode = 'database';
      storageState.initialized = true;
      return true;
    })().catch((error) => {
      console.warn('Database not reachable, falling back to file storage:', error.message);
      storageState.mode = 'file';
      storageState.initialized = true;
      return false;
    });
  }

  return storageState.initPromise;
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

async function readDataFromDatabase() {
  const [membersResult, entriesResult] = await Promise.all([
    supabase.from('members').select('name').order('id', { ascending: true }),
    supabase
      .from('entries')
      .select('month, member, day, status')
      .order('month', { ascending: true })
      .order('member', { ascending: true })
      .order('day', { ascending: true })
  ]);

  if (membersResult.error) throw membersResult.error;
  if (entriesResult.error) throw entriesResult.error;

  const members = membersResult.data.map((row) => row.name);
  const entries = {};

  for (const row of entriesResult.data) {
    if (!entries[row.month]) entries[row.month] = {};
    if (!entries[row.month][row.member]) entries[row.month][row.member] = {};
    entries[row.month][row.member][String(row.day)] = row.status;
  }

  return { members, entries };
}

async function readData() {
  const useDatabase = await ensureDbReady();
  if (!useDatabase) return readFileData();
  return readDataFromDatabase();
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
  const useDatabase = await ensureDbReady();
  if (!useDatabase) {
    const current = readFileData();
    current.entries = entries;
    writeFileData(current);
    return;
  }

  const deleteResult = await supabase.from('entries').delete().not('id', 'is', null);
  if (deleteResult.error) {
    throw deleteResult.error;
  }

  const rows = [];
  for (const [month, monthEntries] of Object.entries(entries)) {
    for (const [member, memberEntries] of Object.entries(monthEntries)) {
      for (const [day, status] of Object.entries(memberEntries)) {
        rows.push({ month, member, day: Number(day), status });
      }
    }
  }

  if (rows.length > 0) {
    const insertResult = await supabase.from('entries').insert(rows);
    if (insertResult.error) {
      throw insertResult.error;
    }
  }
}

async function addMember(name) {
  const trimmed = name.trim();

  const useDatabase = await ensureDbReady();
  if (!useDatabase) {
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

  const insertResult = await supabase.from('members').insert({ name: trimmed });
  if (insertResult.error) {
    if (insertResult.error.code === DB_UNIQUE_VIOLATION) {
      const err = new Error('Member already exists');
      err.status = 409;
      throw err;
    }
    throw insertResult.error;
  }

  const result = await supabase.from('members').select('name').order('id', { ascending: true });
  if (result.error) throw result.error;
  return result.data.map((row) => row.name);
}

async function removeMember(name) {
  const useDatabase = await ensureDbReady();
  if (!useDatabase) {
    const data = readFileData();
    const idx = data.members.indexOf(name);
    if (idx === -1) {
      const err = new Error('Member not found');
      err.status = 404;
      throw err;
    }

    data.members.splice(idx, 1);
    for (const month of Object.keys(data.entries)) {
      delete data.entries[month][name];
    }
    writeFileData(data);
    return data.members;
  }

  const existing = await supabase.from('members').select('id').eq('name', name).maybeSingle();
  if (existing.error && existing.error.code !== 'PGRST116') {
    throw existing.error;
  }
  if (!existing.data) {
    const err = new Error('Member not found');
    err.status = 404;
    throw err;
  }

  const deleteEntries = await supabase.from('entries').delete().eq('member', name);
  if (deleteEntries.error) throw deleteEntries.error;

  const deleteMember = await supabase.from('members').delete().eq('name', name);
  if (deleteMember.error) throw deleteMember.error;

  const result = await supabase.from('members').select('name').order('id', { ascending: true });
  if (result.error) throw result.error;
  return result.data.map((row) => row.name);
}

app.get('/api/health', async (req, res) => {
  const useDatabase = await ensureDbReady();
  res.json({
    ok: true,
    storage: useDatabase ? 'database' : 'file',
    databaseConfigured: hasDatabaseConfig
  });
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
