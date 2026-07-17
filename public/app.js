/* ============================================================
   app.js — Team WFH/Leave Tracker frontend logic
   Works with the Express backend (Node.js) when available,
   and falls back to localStorage for GitHub Pages / offline use.
   ============================================================ */

const STATUSES = ['WFO', 'WFH', 'Leave', 'Holiday', ''];
const STATUS_LABELS = { WFO: 'WFO', WFH: 'WFH', Leave: 'LV', Holiday: 'HOL', '': '' };
const LS_KEY = 'team-wfh-calendar';

let USE_LOCAL_STORAGE = false; // flipped to true when API is unreachable

let state = {
  year: new Date().getFullYear(),
  month: new Date().getMonth() + 1, // 1-indexed
  members: [],
  entries: {}  // { "YYYY-MM": { "MemberName": { "day": "STATUS" } } }
};

// ─── localStorage helpers ─────────────────────────────────────

function lsRead() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    return raw ? JSON.parse(raw) : { members: [], entries: {} };
  } catch {
    return { members: [], entries: {} };
  }
}

function lsWrite(data) {
  localStorage.setItem(LS_KEY, JSON.stringify(data));
}

// ─── API helpers ─────────────────────────────────────────────

async function apiFetch(url, options = {}) {
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    ...options
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || res.statusText);
  }
  return res.json();
}

// ─── Offline / GitHub Pages banner ───────────────────────────

function showOfflineBanner() {
  const existing = document.getElementById('offline-banner');
  if (existing) return;
  const banner = document.createElement('div');
  banner.id = 'offline-banner';
  banner.style.cssText = [
    'background:#2196F3', 'color:#fff', 'text-align:center',
    'padding:8px 16px', 'font-size:0.85rem', 'font-weight:500',
    'letter-spacing:0.2px'
  ].join(';');
  banner.textContent = '🌐 Running in offline mode — data is saved in your browser (localStorage). Run the Node.js server for shared/persistent storage.';
  document.body.insertBefore(banner, document.body.firstChild);
}

// ─── Data loading ─────────────────────────────────────────────

async function loadData() {
  if (USE_LOCAL_STORAGE) {
    const data = lsRead();
    state.members = data.members || [];
    state.entries = data.entries || {};
    renderCalendar();
    return;
  }
  try {
    const data = await apiFetch('/api/data');
    state.members = data.members || [];
    state.entries = data.entries || {};
    renderCalendar();
  } catch {
    // Backend unreachable — switch to localStorage (GitHub Pages / offline)
    USE_LOCAL_STORAGE = true;
    showOfflineBanner();
    const data = lsRead();
    state.members = data.members || [];
    state.entries = data.entries || {};
    renderCalendar();
  }
}

// ─── Save ─────────────────────────────────────────────────────

async function saveEntries() {
  if (USE_LOCAL_STORAGE) {
    const data = lsRead();
    data.entries = state.entries;
    lsWrite(data);
    return;
  }
  await apiFetch('/api/data', {
    method: 'POST',
    body: JSON.stringify({ entries: state.entries })
  });
}

// ─── Month key ────────────────────────────────────────────────

function monthKey() {
  return `${state.year}-${String(state.month).padStart(2, '0')}`;
}

// ─── Calendar rendering ───────────────────────────────────────

function daysInMonth(year, month) {
  return new Date(year, month, 0).getDate();
}

function dayOfWeek(year, month, day) {
  return new Date(year, month - 1, day).getDay(); // 0=Sun, 6=Sat
}

function isWeekend(year, month, day) {
  const dow = dayOfWeek(year, month, day);
  return dow === 0 || dow === 6;
}

function isToday(year, month, day) {
  const now = new Date();
  return now.getFullYear() === year && (now.getMonth() + 1) === month && now.getDate() === day;
}

const MONTH_NAMES = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December'
];

const DAY_ABBR = ['Su','Mo','Tu','We','Th','Fr','Sa'];

function getMemberSummary(member, key) {
  const memberEntries = (state.entries[key] && state.entries[key][member]) ? state.entries[key][member] : {};
  const summary = { WFO: 0, WFH: 0, Leave: 0, Holiday: 0 };

  for (const status of Object.values(memberEntries)) {
    if (summary[status] !== undefined) summary[status] += 1;
  }

  return summary;
}

function renderSummaryModal() {
  const key = monthKey();
  const content = document.getElementById('summary-modal-content');
  const title = document.getElementById('summary-title');
  title.textContent = `Monthly Summary - ${MONTH_NAMES[state.month - 1]} ${state.year}`;

  if (state.members.length === 0) {
    content.innerHTML = '<div class="summary-empty">No team members to summarize.</div>';
    return;
  }

  let html = '';
  html += '<table class="summary-table">';
  html += '<thead><tr><th>Member</th><th>WFO</th><th>WFH</th><th>Leave</th><th>Holiday</th><th>Total Marked</th></tr></thead>';
  html += '<tbody>';

  for (const member of state.members) {
    const summary = getMemberSummary(member, key);
    const total = summary.WFO + summary.WFH + summary.Leave + summary.Holiday;
    html += `<tr>
      <td>${escapeHtml(member)}</td>
      <td>${summary.WFO}</td>
      <td>${summary.WFH}</td>
      <td>${summary.Leave}</td>
      <td>${summary.Holiday}</td>
      <td>${total}</td>
    </tr>`;
  }

  html += '</tbody></table>';
  content.innerHTML = html;
}

function openSummaryModal() {
  renderSummaryModal();
  const backdrop = document.getElementById('summary-modal-backdrop');
  backdrop.classList.add('open');
  backdrop.setAttribute('aria-hidden', 'false');
}

function closeSummaryModal() {
  const backdrop = document.getElementById('summary-modal-backdrop');
  backdrop.classList.remove('open');
  backdrop.setAttribute('aria-hidden', 'true');
}

function renderCalendar() {
  const { year, month, members, entries } = state;
  const key = monthKey();
  const totalDays = daysInMonth(year, month);

  // Update month label
  document.getElementById('month-label').textContent = `${MONTH_NAMES[month - 1]} ${year}`;

  // ── Build thead ──
  const thead = document.getElementById('calendar-thead');
  let headerRow = '<tr>';
  headerRow += '<th class="th-member">Team Member</th>';
  for (let d = 1; d <= totalDays; d++) {
    const dow = dayOfWeek(year, month, d);
    const weekend = (dow === 0 || dow === 6) ? ' weekend' : '';
    const todayClass = isToday(year, month, d) ? ' today-col' : '';
    headerRow += `<th class="${weekend}${todayClass}" title="${MONTH_NAMES[month-1]} ${d}, ${year}">${d}<br><span style="font-weight:400;font-size:0.7em">${DAY_ABBR[dow]}</span></th>`;
  }
  headerRow += '</tr>';
  thead.innerHTML = headerRow;

  // ── Build tbody ──
  const tbody = document.getElementById('calendar-tbody');
  let rows = '';

  if (members.length === 0) {
    rows = `<tr><td colspan="${totalDays + 1}" style="text-align:center;padding:32px;color:#a0aec0;font-size:0.95rem;">No team members yet. Add one above.</td></tr>`;
  } else {
    for (const member of members) {
      const memberEntries = (entries[key] && entries[key][member]) ? entries[key][member] : {};

      rows += `<tr>`;
      // Member name cell
      rows += `<td class="td-member">
        <div class="member-name-cell">
          <span>${escapeHtml(member)}</span>
          <button class="btn-danger" data-member="${escapeAttr(member)}" title="Remove ${escapeAttr(member)}">✕</button>
        </div>
      </td>`;

      // Day cells
      for (let d = 1; d <= totalDays; d++) {
        const status = memberEntries[String(d)] || '';
        const weekend = isWeekend(year, month, d) ? ' weekend' : '';
        const todayClass = isToday(year, month, d) ? ' today-col' : '';
        const statusClass = status ? `status-${status.toLowerCase()}` : 'status-empty';
        const label = STATUS_LABELS[status] || '';

        rows += `<td class="td-day ${statusClass}${weekend}${todayClass}" data-member="${escapeAttr(member)}" data-day="${d}" title="${escapeAttr(member)} — ${MONTH_NAMES[month-1]} ${d}: ${status || 'Not set'}">${label}</td>`;
      }
      rows += `</tr>`;
    }
  }

  tbody.innerHTML = rows;

  // ── Attach events ──
  // Day cell clicks
  tbody.querySelectorAll('.td-day').forEach(cell => {
    cell.addEventListener('click', handleDayCellClick);
  });
  // Delete member buttons
  tbody.querySelectorAll('.btn-danger[data-member]').forEach(btn => {
    btn.addEventListener('click', handleDeleteMember);
  });
}

// ─── Cell click handler ───────────────────────────────────────

async function handleDayCellClick(e) {
  const cell = e.currentTarget;
  const member = cell.dataset.member;
  const day = cell.dataset.day;
  const key = monthKey();

  // Ensure nested objects exist
  if (!state.entries[key]) state.entries[key] = {};
  if (!state.entries[key][member]) state.entries[key][member] = {};

  const current = state.entries[key][member][day] || '';
  const idx = STATUSES.indexOf(current);
  const next = STATUSES[(idx + 1) % STATUSES.length];

  if (next === '') {
    delete state.entries[key][member][day];
  } else {
    state.entries[key][member][day] = next;
  }

  // Optimistically update UI
  renderCalendar();

  try {
    await saveEntries();
  } catch (err) {
    showToast('Error saving: ' + err.message, true);
    await loadData(); // revert
  }
}

// ─── Add member ───────────────────────────────────────────────

async function handleAddMember() {
  const input = document.getElementById('new-member-input');
  const name = input.value.trim();
  if (!name) { input.focus(); return; }

  if (USE_LOCAL_STORAGE) {
    const data = lsRead();
    if (data.members.includes(name)) {
      showToast('Member already exists', true);
      return;
    }
    data.members.push(name);
    lsWrite(data);
    state.members = data.members;
    input.value = '';
    renderCalendar();
    showToast(`Added "${name}"`);
    return;
  }

  try {
    const result = await apiFetch('/api/members', {
      method: 'POST',
      body: JSON.stringify({ name })
    });
    state.members = result.members;
    input.value = '';
    renderCalendar();
    showToast(`Added "${name}"`);
  } catch (err) {
    showToast('Error: ' + err.message, true);
  }
}

// ─── Delete member ────────────────────────────────────────────

async function handleDeleteMember(e) {
  e.stopPropagation();
  const name = e.currentTarget.dataset.member;
  if (!confirm(`Remove "${name}" from the calendar? Their data will be deleted.`)) return;

  if (USE_LOCAL_STORAGE) {
    const data = lsRead();
    const idx = data.members.indexOf(name);
    if (idx !== -1) data.members.splice(idx, 1);
    for (const mKey of Object.keys(data.entries)) {
      delete data.entries[mKey][name];
    }
    lsWrite(data);
    state.members = data.members;
    for (const mKey of Object.keys(state.entries)) {
      delete state.entries[mKey][name];
    }
    renderCalendar();
    showToast(`Removed "${name}"`);
    return;
  }

  try {
    const result = await apiFetch(`/api/members/${encodeURIComponent(name)}`, { method: 'DELETE' });
    state.members = result.members;
    // Also remove from local entries
    for (const mKey of Object.keys(state.entries)) {
      delete state.entries[mKey][name];
    }
    renderCalendar();
    showToast(`Removed "${name}"`);
  } catch (err) {
    showToast('Error: ' + err.message, true);
  }
}

// ─── Navigation ───────────────────────────────────────────────

function navigateMonth(delta) {
  state.month += delta;
  if (state.month > 12) { state.month = 1; state.year++; }
  if (state.month < 1)  { state.month = 12; state.year--; }
  renderCalendar();
}

function goToToday() {
  const now = new Date();
  state.year = now.getFullYear();
  state.month = now.getMonth() + 1;
  renderCalendar();
}

// ─── Toast ────────────────────────────────────────────────────

let toastTimer = null;
function showToast(msg, isError = false) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.style.background = isError ? '#e53e3e' : '#2d3748';
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2500);
}

// ─── Utility ─────────────────────────────────────────────────

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function escapeAttr(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;');
}

// ─── Boot ─────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  // Navigation
  document.getElementById('btn-prev').addEventListener('click', () => navigateMonth(-1));
  document.getElementById('btn-next').addEventListener('click', () => navigateMonth(1));
  document.getElementById('btn-today').addEventListener('click', goToToday);
  document.getElementById('btn-summary').addEventListener('click', openSummaryModal);
  document.getElementById('btn-summary-close').addEventListener('click', closeSummaryModal);
  document.getElementById('summary-modal-backdrop').addEventListener('click', (e) => {
    if (e.target.id === 'summary-modal-backdrop') closeSummaryModal();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeSummaryModal();
  });

  // Add member
  document.getElementById('btn-add-member').addEventListener('click', handleAddMember);
  document.getElementById('new-member-input').addEventListener('keydown', e => {
    if (e.key === 'Enter') handleAddMember();
  });

  // Initial load
  loadData().catch(err => {
    showToast('Failed to load data: ' + err.message, true);
  });
});
