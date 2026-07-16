const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = 3000;
const DATA_FILE = path.join(__dirname, 'data', 'calendar.json');

// Ensure data directory exists
const DATA_DIR = path.join(__dirname, 'data');
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Helper: read data file (returns default structure if file is missing)
function readData() {
  if (!fs.existsSync(DATA_FILE)) {
    return { members: [], entries: {} };
  }
  const raw = fs.readFileSync(DATA_FILE, 'utf8');
  return JSON.parse(raw);
}

// Helper: write data file
function writeData(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf8');
}

// GET /api/data — return all calendar data and team members
app.get('/api/data', (req, res) => {
  try {
    const data = readData();
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: 'Failed to read data' });
  }
});

// POST /api/data — save updated calendar data
app.post('/api/data', (req, res) => {
  try {
    const current = readData();
    const { entries } = req.body;
    if (!entries || typeof entries !== 'object') {
      return res.status(400).json({ error: 'Invalid entries payload' });
    }
    current.entries = entries;
    writeData(current);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to save data' });
  }
});

// GET /api/members — return list of team members
app.get('/api/members', (req, res) => {
  try {
    const data = readData();
    res.json(data.members);
  } catch (err) {
    res.status(500).json({ error: 'Failed to read members' });
  }
});

// POST /api/members — add a team member
app.post('/api/members', (req, res) => {
  try {
    const { name } = req.body;
    if (!name || typeof name !== 'string' || !name.trim()) {
      return res.status(400).json({ error: 'Member name is required' });
    }
    const trimmed = name.trim();
    const data = readData();
    if (data.members.includes(trimmed)) {
      return res.status(409).json({ error: 'Member already exists' });
    }
    data.members.push(trimmed);
    writeData(data);
    res.status(201).json({ success: true, members: data.members });
  } catch (err) {
    res.status(500).json({ error: 'Failed to add member' });
  }
});

// DELETE /api/members/:name — remove a team member
app.delete('/api/members/:name', (req, res) => {
  try {
    const name = decodeURIComponent(req.params.name);
    const data = readData();
    const idx = data.members.indexOf(name);
    if (idx === -1) {
      return res.status(404).json({ error: 'Member not found' });
    }
    data.members.splice(idx, 1);
    // Remove entries for this member from all months
    for (const month of Object.keys(data.entries)) {
      delete data.entries[month][name];
    }
    writeData(data);
    res.json({ success: true, members: data.members });
  } catch (err) {
    res.status(500).json({ error: 'Failed to remove member' });
  }
});

app.listen(PORT, () => {
  console.log(`Team WFH/Leave Tracker running at http://localhost:${PORT}`);
});
