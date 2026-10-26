const http = require('http');
const fs = require('fs');
const path = require('path');
const microsoft = require('./microsoft'); // loads .env, so it comes before PORT is read

const PORT = process.env.PORT || 4100;
const DATA_DIR = path.join(__dirname, 'data');
const DB_PATH = path.join(DATA_DIR, 'db.json');
const PUBLIC_DIR = path.join(__dirname, 'public');

// Seed data for the dynamic (server-backed) parts of the concept. Departments,
// news and the staff directory are static and live in public/content.js instead —
// only the genuinely interactive pieces (kudos, ideas, event RSVPs, tickets, PTO)
// need a server-side record.
const SEED = {
  kudos: [
    { id: 'k1', from: 'Operations Team', message: "Huge thanks to the IT team for the fast turnaround migrating everyone's laptops this week!", stars: 12, starredBy: [] },
    { id: 'k2', from: 'Fundraising Team', message: 'Shoutout to the Major Gifts team for closing out an incredible Q3 — great work, everyone.', stars: 9, starredBy: [] },
    { id: 'k3', from: 'Human Resources', message: 'Welcome to our newest HR coordinator — glad to have you on the team!', stars: 21, starredBy: [] }
  ],
  ideas: [
    { id: 'i1', title: 'Mobile app version of the intranet', description: 'Access news, kudos, and quick links from your phone.', votes: 47, status: 'Under Review', voters: [] },
    { id: 'i2', title: 'Searchable staff directory with photos', description: "Find anyone's role, department, and contact info fast.", votes: 34, status: 'Planned', voters: [] },
    { id: 'i3', title: 'Dark mode for the intranet', description: 'Easier on the eyes for late shifts and low light.', votes: 21, status: 'Shipped', voters: [] },
    { id: 'i4', title: 'Monthly Town Hall recording archive', description: 'Catch up on any all-staff meeting you missed.', votes: 18, status: 'Planned', voters: [] }
  ],
  events: [
    { id: 'e1', month: 'Sep', day: '24', title: 'All-Staff Town Hall', detail: '10:00 AM · Virtual', rsvps: [] },
    { id: 'e2', month: 'Oct', day: '3', title: 'Volunteer Day: Habitat Build', detail: 'West Palm Beach', rsvps: [] },
    { id: 'e3', month: 'Oct', day: '8', title: 'Benefits Open Enrollment Fair', detail: '11:00 AM · Main Office', rsvps: [] }
  ],
  tickets: [],
  pto: [],
  msRsvps: {} // RSVPs to real Outlook events: { eventId: { userId: { name, outlookEventId } } }
};

function ensureDb() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(DB_PATH)) fs.writeFileSync(DB_PATH, JSON.stringify(SEED, null, 2));
}
function readDb() {
  ensureDb();
  try {
    const db = JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
    // backfill in case the file predates a field
    for (const key of Object.keys(SEED)) if (!(key in db)) db[key] = SEED[key];
    return db;
  } catch (e) { return JSON.parse(JSON.stringify(SEED)); }
}
function writeDb(db) {
  fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2));
}
function nextId(prefix, list) {
  let n = list.length + 1;
  while (list.some((x) => x.id === prefix + n)) n++;
  return prefix + n;
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg'
};

function sendJson(res, status, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': Buffer.byteLength(body) });
  res.end(body);
}

function serveStatic(req, res, urlPath) {
  const rel = urlPath === '/' ? '/index.html' : urlPath;
  const filePath = path.join(PUBLIC_DIR, rel);
  if (!filePath.startsWith(PUBLIC_DIR)) { res.writeHead(403); res.end('Forbidden'); return; }
  fs.readFile(filePath, (err, data) => {
    if (err) { res.writeHead(404, { 'Content-Type': 'text/plain' }); res.end('Not found'); return; }
    const ext = path.extname(filePath);
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    res.end(data);
  });
}

function readBody(req) {
  if (req.parsedBody) return Promise.resolve(req.parsedBody); // already read by microsoft.js
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk) => { data += chunk; if (data.length > 1e6) req.destroy(); });
    req.on('end', () => {
      try { req.parsedBody = data ? JSON.parse(data) : {}; resolve(req.parsedBody); } catch (e) { reject(e); }
    });
    req.on('error', reject);
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const pathname = url.pathname;

  // Microsoft sign-in, live directory, and Outlook events (no-op unless configured)
  if (await microsoft.handle(req, res, url, { sendJson, readBody, readDb, writeDb })) return;

  // ---- kudos ----
  if (pathname === '/api/kudos' && req.method === 'GET') {
    return sendJson(res, 200, { kudos: readDb().kudos });
  }
  if (pathname === '/api/kudos' && req.method === 'POST') {
    let body; try { body = await readBody(req); } catch (e) { return sendJson(res, 400, { error: 'bad json' }); }
    const from = (body.from || '').trim();
    const message = (body.message || '').trim();
    if (!from || !message) return sendJson(res, 400, { error: 'from and message are required' });
    const db = readDb();
    db.kudos.unshift({ id: nextId('k', db.kudos), from, message, stars: 0, starredBy: [] });
    writeDb(db);
    return sendJson(res, 200, { kudos: db.kudos });
  }
  if (pathname === '/api/kudos/star' && req.method === 'POST') {
    let body; try { body = await readBody(req); } catch (e) { return sendJson(res, 400, { error: 'bad json' }); }
    const id = (body.id || '').trim();
    const user = (body.user || '').trim();
    if (!id || !user) return sendJson(res, 400, { error: 'id and user are required' });
    const db = readDb();
    const k = db.kudos.find((x) => x.id === id);
    if (!k) return sendJson(res, 404, { error: 'not found' });
    if (k.starredBy.indexOf(user) < 0) { k.starredBy.push(user); k.stars++; }
    writeDb(db);
    return sendJson(res, 200, { kudos: db.kudos });
  }

  // ---- idea exchange ----
  if (pathname === '/api/ideas' && req.method === 'GET') {
    return sendJson(res, 200, { ideas: readDb().ideas });
  }
  if (pathname === '/api/ideas' && req.method === 'POST') {
    let body; try { body = await readBody(req); } catch (e) { return sendJson(res, 400, { error: 'bad json' }); }
    const title = (body.title || '').trim();
    const description = (body.description || '').trim();
    if (!title) return sendJson(res, 400, { error: 'title is required' });
    const db = readDb();
    db.ideas.unshift({ id: nextId('i', db.ideas), title, description, votes: 0, status: 'Under Review', voters: [] });
    writeDb(db);
    return sendJson(res, 200, { ideas: db.ideas });
  }
  if (pathname === '/api/ideas/vote' && req.method === 'POST') {
    let body; try { body = await readBody(req); } catch (e) { return sendJson(res, 400, { error: 'bad json' }); }
    const id = (body.id || '').trim();
    const user = (body.user || '').trim();
    if (!id || !user) return sendJson(res, 400, { error: 'id and user are required' });
    const db = readDb();
    const idea = db.ideas.find((x) => x.id === id);
    if (!idea) return sendJson(res, 404, { error: 'not found' });
    if (idea.voters.indexOf(user) < 0) { idea.voters.push(user); idea.votes++; }
    writeDb(db);
    return sendJson(res, 200, { ideas: db.ideas });
  }

  // ---- events / RSVP ----
  if (pathname === '/api/events' && req.method === 'GET') {
    return sendJson(res, 200, { events: readDb().events });
  }
  if (pathname === '/api/events/rsvp' && req.method === 'POST') {
    let body; try { body = await readBody(req); } catch (e) { return sendJson(res, 400, { error: 'bad json' }); }
    const id = (body.id || '').trim();
    const user = (body.user || '').trim();
    if (!id || !user) return sendJson(res, 400, { error: 'id and user are required' });
    const db = readDb();
    const ev = db.events.find((x) => x.id === id);
    if (!ev) return sendJson(res, 404, { error: 'not found' });
    const i = ev.rsvps.indexOf(user);
    if (i < 0) ev.rsvps.push(user); else ev.rsvps.splice(i, 1);
    writeDb(db);
    return sendJson(res, 200, { events: db.events });
  }

  // ---- IT tickets ----
  if (pathname === '/api/tickets' && req.method === 'GET') {
    const user = (url.searchParams.get('user') || '').trim();
    const db = readDb();
    const rows = user ? db.tickets.filter((t) => t.user === user) : db.tickets;
    return sendJson(res, 200, { tickets: rows });
  }
  if (pathname === '/api/tickets' && req.method === 'POST') {
    let body; try { body = await readBody(req); } catch (e) { return sendJson(res, 400, { error: 'bad json' }); }
    const user = (body.user || '').trim();
    const subject = (body.subject || '').trim();
    const details = (body.details || '').trim();
    if (!user || !subject) return sendJson(res, 400, { error: 'user and subject are required' });
    const db = readDb();
    const ticket = { id: nextId('t', db.tickets), user, subject, details, status: 'Open', created: new Date().toISOString() };
    db.tickets.unshift(ticket);
    writeDb(db);
    return sendJson(res, 200, { tickets: db.tickets.filter((t) => t.user === user) });
  }

  // ---- PTO requests ----
  if (pathname === '/api/pto' && req.method === 'GET') {
    const user = (url.searchParams.get('user') || '').trim();
    const db = readDb();
    const rows = user ? db.pto.filter((p) => p.user === user) : db.pto;
    return sendJson(res, 200, { pto: rows });
  }
  if (pathname === '/api/pto' && req.method === 'POST') {
    let body; try { body = await readBody(req); } catch (e) { return sendJson(res, 400, { error: 'bad json' }); }
    const user = (body.user || '').trim();
    const startDate = (body.startDate || '').trim();
    const endDate = (body.endDate || '').trim();
    const notes = (body.notes || '').trim();
    if (!user || !startDate || !endDate) return sendJson(res, 400, { error: 'user, startDate, and endDate are required' });
    const db = readDb();
    const request = { id: nextId('p', db.pto), user, startDate, endDate, notes, status: 'Pending', created: new Date().toISOString() };
    db.pto.unshift(request);
    writeDb(db);
    return sendJson(res, 200, { pto: db.pto.filter((p) => p.user === user) });
  }

  if (pathname.startsWith('/api/')) { return sendJson(res, 404, { error: 'not found' }); }

  return serveStatic(req, res, pathname);
});

ensureDb();
server.listen(PORT, () => {
  console.log('UWPBC Intranet concept running at http://localhost:' + PORT);
  console.log('Data file: ' + DB_PATH);
  console.log(microsoft.CONFIGURED
    ? 'Microsoft 365: connected (tenant ' + microsoft.CFG.tenant + ')' + (microsoft.CFG.eventsCalendar ? ', events from ' + microsoft.CFG.eventsCalendar : ', no shared events calendar set')
    : 'Microsoft 365: not configured — using sample directory and events (see MICROSOFT-SETUP.md)');
});
