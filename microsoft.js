// Microsoft 365 connection: sign-in (OAuth 2.0 auth code + PKCE against Entra ID),
// the live staff directory, and events from a shared Outlook calendar — all through
// Microsoft Graph using the signed-in person's own (delegated) permissions.
// Everything here is optional: with no MS_* settings the intranet runs on its sample
// data exactly as before. Setup steps are in MICROSOFT-SETUP.md.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

loadDotEnv(path.join(__dirname, '.env'));

function loadDotEnv(file) {
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    if (/^\s*#/.test(line)) continue;
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (!m) continue;
    let v = m[2];
    if (/^(["']).*\1$/.test(v)) v = v.slice(1, -1);
    if (!(m[1] in process.env)) process.env[m[1]] = v; // real env vars win over .env
  }
}

const PORT = process.env.PORT || 4100;
const CFG = {
  tenant: process.env.MS_TENANT_ID || '',
  clientId: process.env.MS_CLIENT_ID || '',
  clientSecret: process.env.MS_CLIENT_SECRET || '',
  redirectUri: process.env.MS_REDIRECT_URI || 'http://localhost:' + PORT + '/auth/callback',
  eventsCalendar: process.env.MS_EVENTS_CALENDAR || '',
  timeZone: process.env.MS_TIMEZONE || 'Eastern Standard Time',
  eventsDays: parseInt(process.env.MS_EVENTS_DAYS, 10) || 60,
  // User.Read.All (titles, departments, phones) needs an admin to consent; without it the
  // directory uses User.ReadBasic.All, which anyone can consent to: names, emails, photos.
  fullDirectory: /^(1|true|yes)$/i.test(process.env.MS_FULL_DIRECTORY || '')
};
const CONFIGURED = !!(CFG.tenant && CFG.clientId && CFG.clientSecret);
// MS_SCOPES overrides the list, e.g. to test what the tenant's consent policy allows
const SCOPES = process.env.MS_SCOPES || 'openid profile email offline_access User.Read ' +
  (CFG.fullDirectory ? 'User.Read.All' : 'User.ReadBasic.All') + ' Calendars.ReadWrite Calendars.Read.Shared';
const AUTHORITY = 'https://login.microsoftonline.com/' + encodeURIComponent(CFG.tenant) + '/oauth2/v2.0';
const GRAPH = 'https://graph.microsoft.com/v1.0';
const TZ_HEADER = { Prefer: 'outlook.timezone="' + CFG.timeZone + '"' };

// ---- sessions (in memory: restarting the server signs everyone out) ----
const SID_COOKIE = 'uwpbc_sid';
const SESSION_HOURS = 8;
const sessions = new Map(); // sid -> { accessToken, refreshToken, expiresAt, user: { id, name, email } }
const pending = new Map();  // OAuth state -> { verifier, created }

function parseCookies(req) {
  const out = {};
  for (const part of (req.headers.cookie || '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}
function getSession(req) {
  const sid = parseCookies(req)[SID_COOKIE];
  return sid ? sessions.get(sid) || null : null;
}

// ---- tokens ----
async function tokenRequest(params) {
  const res = await fetch(AUTHORITY + '/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(Object.assign({ client_id: CFG.clientId, client_secret: CFG.clientSecret, scope: SCOPES }, params))
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error_description || data.error || 'token request failed (' + res.status + ')');
  return data;
}
function storeTokens(session, t) {
  session.accessToken = t.access_token;
  if (t.refresh_token) session.refreshToken = t.refresh_token;
  session.expiresAt = Date.now() + (t.expires_in - 60) * 1000;
}
async function accessToken(session) {
  if (Date.now() < session.expiresAt) return session.accessToken;
  storeTokens(session, await tokenRequest({ grant_type: 'refresh_token', refresh_token: session.refreshToken }));
  return session.accessToken;
}

async function graph(session, method, pathOrUrl, opts) {
  opts = opts || {};
  const headers = Object.assign({ Authorization: 'Bearer ' + await accessToken(session) }, opts.headers);
  if (opts.body) headers['Content-Type'] = 'application/json';
  const res = await fetch(pathOrUrl.startsWith('https://') ? pathOrUrl : GRAPH + pathOrUrl,
    { method, headers, body: opts.body ? JSON.stringify(opts.body) : undefined });
  if (opts.raw) return res;
  if (res.status === 204) return null;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error((data.error && data.error.message) || 'Microsoft Graph returned ' + res.status);
    err.status = res.status;
    throw err;
  }
  return data;
}

// ---- directory (shared by everyone in the tenant, so cached server-wide) ----
const DIRECTORY_TTL = 10 * 60 * 1000;
let directoryCache = null; // { at, people }
const photoCache = new Map(); // user id -> { type, data }, or null when they have no photo

async function loadDirectory(session) {
  if (directoryCache && Date.now() - directoryCache.at < DIRECTORY_TTL) return directoryCache.people;
  const people = [];
  // basic mode can only see/filter on basic properties, so it skips the enabled-member filter
  let next = CFG.fullDirectory
    ? '/users?$select=id,displayName,jobTitle,department,mail,businessPhones,officeLocation' +
      '&$filter=' + encodeURIComponent("accountEnabled eq true and userType eq 'Member'") + '&$count=true&$top=999'
    : '/users?$select=id,displayName,mail&$top=999';
  while (next) {
    const page = await graph(session, 'GET', next, { headers: { ConsistencyLevel: 'eventual' } });
    for (const u of page.value) {
      if (!u.mail) continue; // skips rooms, service accounts, and other non-people
      people.push({
        id: u.id, name: u.displayName || u.mail, role: u.jobTitle || '', dept: u.department || '',
        email: u.mail, phone: (u.businessPhones || [])[0] || '', office: u.officeLocation || ''
      });
    }
    next = page['@odata.nextLink'];
  }
  people.sort((a, b) => a.name.localeCompare(b.name));
  directoryCache = { at: Date.now(), people };
  return people;
}
async function loadPhoto(session, id) {
  if (photoCache.has(id)) return photoCache.get(id);
  const res = await graph(session, 'GET', '/users/' + encodeURIComponent(id) + '/photos/48x48/$value', { raw: true });
  const photo = res.ok ? { type: res.headers.get('content-type') || 'image/jpeg', data: Buffer.from(await res.arrayBuffer()) } : null;
  if (res.ok || res.status === 404) photoCache.set(id, photo);
  return photo;
}

// ---- events from the shared calendar ----
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
function formatTime(local) { // Graph returns 'YYYY-MM-DDTHH:MM:SS...' already in CFG.timeZone
  let h = parseInt(local.slice(11, 13), 10);
  const ap = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;
  return h + ':' + local.slice(14, 16) + ' ' + ap;
}
function eventCard(ev, rsvps, user) {
  const start = ev.start.dateTime;
  const when = ev.isAllDay ? 'All day' : formatTime(start);
  const where = ev.location && ev.location.displayName;
  const going = rsvps[ev.id] || {};
  return {
    id: ev.id,
    month: MONTHS[parseInt(start.slice(5, 7), 10) - 1],
    day: String(parseInt(start.slice(8, 10), 10)),
    title: ev.subject || '(untitled event)',
    detail: where ? when + ' · ' + where : when,
    rsvps: Object.values(going).map((r) => r.name),
    going: !!going[user.id],
    outlook: true
  };
}
async function loadEvents(session) {
  const now = new Date();
  const end = new Date(now.getTime() + CFG.eventsDays * 864e5);
  const data = await graph(session, 'GET', '/users/' + encodeURIComponent(CFG.eventsCalendar) + '/calendarView' +
    '?startDateTime=' + now.toISOString() + '&endDateTime=' + end.toISOString() +
    '&$select=id,subject,start,end,location,isAllDay,isCancelled&$orderby=start/dateTime&$top=50', { headers: TZ_HEADER });
  return data.value.filter((ev) => !ev.isCancelled);
}

// RSVP = put a copy of the event on the person's own Outlook calendar (and take it off
// again on un-RSVP). Who's going is kept in db.msRsvps[eventId][userId].
async function toggleRsvp(session, id, h) {
  const user = session.user;
  const mine = ((h.readDb().msRsvps || {})[id] || {})[user.id];
  let created = null;
  if (mine) {
    try { await graph(session, 'DELETE', '/me/events/' + encodeURIComponent(mine.outlookEventId)); }
    catch (e) { if (e.status !== 404) throw e; } // they already deleted it from Outlook
  } else {
    const ev = await graph(session, 'GET', '/users/' + encodeURIComponent(CFG.eventsCalendar) + '/events/' + encodeURIComponent(id) +
      '?$select=subject,start,end,location,isAllDay,bodyPreview', { headers: TZ_HEADER });
    created = await graph(session, 'POST', '/me/events', {
      body: {
        subject: ev.subject, start: ev.start, end: ev.end, isAllDay: ev.isAllDay,
        location: { displayName: (ev.location && ev.location.displayName) || '' },
        body: { contentType: 'text', content: "Added from the UWPBC Intranet when you RSVP'd." + (ev.bodyPreview ? '\n\n' + ev.bodyPreview : '') }
      }
    });
  }
  // re-read after the Graph round trips so we don't clobber writes made in the meantime
  const db = h.readDb();
  db.msRsvps = db.msRsvps || {};
  const list = db.msRsvps[id] = db.msRsvps[id] || {};
  if (created) list[user.id] = { name: user.name, outlookEventId: created.id };
  else delete list[user.id];
  h.writeDb(db);
  return db;
}

// ---- HTTP ----
function redirect(res, location, extraHeaders) {
  res.writeHead(302, Object.assign({ Location: location }, extraHeaders));
  res.end();
}
function errorPage(res, message) {
  const safe = String(message).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end('<!doctype html><meta charset="utf-8"><title>Sign-in problem</title><link rel="stylesheet" href="/styles.css">' +
    '<div class="namegate"><h1>Microsoft sign-in didn\'t work</h1><p>' + safe + '</p><a class="btn gold" href="/">Back to the intranet</a></div>');
}

// Returns true when it handled the request. h = { sendJson, readBody, readDb, writeDb }.
async function handle(req, res, url, h) {
  const p = url.pathname;

  if (p === '/auth/status') {
    const s = CONFIGURED ? getSession(req) : null;
    return h.sendJson(res, 200, {
      configured: CONFIGURED,
      signedIn: !!s,
      user: s ? { name: s.user.name, email: s.user.email } : null,
      directory: CONFIGURED,
      fullDirectory: CFG.fullDirectory,
      events: CONFIGURED && !!CFG.eventsCalendar
    }), true;
  }
  if (!CONFIGURED) return false;

  if (p === '/auth/login') {
    for (const [k, v] of pending) if (Date.now() - v.created > 10 * 60 * 1000) pending.delete(k);
    const state = crypto.randomBytes(16).toString('base64url');
    const verifier = crypto.randomBytes(32).toString('base64url');
    pending.set(state, { verifier, created: Date.now() });
    const q = new URLSearchParams({
      client_id: CFG.clientId, response_type: 'code', redirect_uri: CFG.redirectUri, response_mode: 'query',
      scope: SCOPES, state, prompt: 'select_account',
      code_challenge: crypto.createHash('sha256').update(verifier).digest('base64url'), code_challenge_method: 'S256'
    });
    return redirect(res, AUTHORITY + '/authorize?' + q), true;
  }

  if (p === '/auth/callback') {
    const err = url.searchParams.get('error');
    if (err) return errorPage(res, url.searchParams.get('error_description') || err), true;
    const state = url.searchParams.get('state');
    const pend = state && pending.get(state);
    if (!pend) return errorPage(res, 'That sign-in link expired. Please try signing in again.'), true;
    pending.delete(state);
    try {
      const session = {};
      storeTokens(session, await tokenRequest({
        grant_type: 'authorization_code', code: url.searchParams.get('code') || '',
        redirect_uri: CFG.redirectUri, code_verifier: pend.verifier
      }));
      const me = await graph(session, 'GET', '/me?$select=id,displayName,mail,userPrincipalName');
      session.user = { id: me.id, name: me.displayName || me.mail || me.userPrincipalName, email: me.mail || me.userPrincipalName };
      const sid = crypto.randomBytes(24).toString('base64url');
      sessions.set(sid, session);
      setTimeout(() => sessions.delete(sid), SESSION_HOURS * 3600 * 1000).unref();
      return redirect(res, '/', { 'Set-Cookie': SID_COOKIE + '=' + sid + '; HttpOnly; SameSite=Lax; Path=/; Max-Age=' + SESSION_HOURS * 3600 }), true;
    } catch (e) {
      return errorPage(res, e.message), true;
    }
  }

  if (p === '/auth/logout') {
    const sid = parseCookies(req)[SID_COOKIE];
    if (sid) sessions.delete(sid);
    return redirect(res, '/', { 'Set-Cookie': SID_COOKIE + '=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0' }), true;
  }

  const isDirectory = p === '/api/directory' || p.startsWith('/api/directory/photo/');
  const isEvents = CFG.eventsCalendar && (p === '/api/events' || p === '/api/events/rsvp');
  if (!isDirectory && !isEvents) return false;
  const session = getSession(req);
  if (!session) {
    if (isEvents) return false; // not signed in: fall through to the sample events
    return h.sendJson(res, 401, { error: 'sign in with Microsoft first' }), true;
  }

  if (p === '/api/directory' && req.method === 'GET') {
    try { return h.sendJson(res, 200, { people: await loadDirectory(session) }), true; }
    catch (e) { return h.sendJson(res, 502, { error: e.message }), true; }
  }
  if (p.startsWith('/api/directory/photo/') && req.method === 'GET') {
    try {
      const photo = await loadPhoto(session, decodeURIComponent(p.slice('/api/directory/photo/'.length)));
      if (!photo) { res.writeHead(404); res.end(); return true; }
      res.writeHead(200, { 'Content-Type': photo.type, 'Cache-Control': 'private, max-age=3600' });
      res.end(photo.data);
    } catch (e) { res.writeHead(502); res.end(); }
    return true;
  }

  if (p === '/api/events' && req.method === 'GET') {
    try {
      const rsvps = h.readDb().msRsvps || {};
      return h.sendJson(res, 200, { events: (await loadEvents(session)).map((ev) => eventCard(ev, rsvps, session.user)) }), true;
    } catch (e) {
      return h.sendJson(res, 200, { events: h.readDb().events, notice: "Couldn't load the shared Outlook calendar (" + e.message + ') — showing sample events.' }), true;
    }
  }
  if (p === '/api/events/rsvp' && req.method === 'POST') {
    let body; try { body = await h.readBody(req); } catch (e) { return h.sendJson(res, 400, { error: 'bad json' }), true; }
    const id = (body.id || '').trim();
    if (!id) return h.sendJson(res, 400, { error: 'id is required' }), true;
    if (h.readDb().events.some((ev) => ev.id === id)) return false; // a sample event (calendar fallback): normal handler
    try { await toggleRsvp(session, id, h); return h.sendJson(res, 200, { ok: true }), true; }
    catch (e) { return h.sendJson(res, 502, { error: e.message }), true; }
  }
  return false;
}

module.exports = { handle, CONFIGURED, CFG };
