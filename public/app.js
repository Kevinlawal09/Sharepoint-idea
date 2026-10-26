(function(){
"use strict";

/* ---------- identity (lightweight name-based "login", same pattern as the training prototype) ---------- */
const USER_KEY = 'uwpbc_intranet_user';
function getUser(){ try{ return localStorage.getItem(USER_KEY) || ''; }catch(e){ return ''; } }
function setUser(name){ try{ localStorage.setItem(USER_KEY, name); }catch(e){} }
function clearUser(){ try{ localStorage.removeItem(USER_KEY); }catch(e){} }
let CURRENT_USER = getUser();

/* ---------- Microsoft 365 (when the server is configured, sign-in replaces the name gate) ---------- */
let AUTH = { configured:false, signedIn:false, user:null, directory:false, events:false };
async function fetchAuth(){
  try{ const r = await fetch('/auth/status'); AUTH = await r.json(); }catch(e){}
  if(AUTH.configured) CURRENT_USER = AUTH.signedIn ? AUTH.user.name : '';
}

/* ---------- server-backed state ---------- */
let KUDOS = [];
let IDEAS = [];
let EVENTS = [];
let TICKETS = [];
let PTO = [];
let EVENTS_NOTICE = '';
let DIRECTORY = STAFF;
let DIRECTORY_LIVE = false;
let DIRECTORY_ERROR = '';

async function fetchKudos(){ const r = await fetch('/api/kudos'); const d = await r.json(); KUDOS = d.kudos || []; }
async function fetchIdeas(){ const r = await fetch('/api/ideas'); const d = await r.json(); IDEAS = d.ideas || []; }
async function fetchEvents(){ const r = await fetch('/api/events'); const d = await r.json(); EVENTS = d.events || []; EVENTS_NOTICE = d.notice || ''; }
async function fetchDirectory(){
  DIRECTORY = STAFF; DIRECTORY_LIVE = false; DIRECTORY_ERROR = '';
  if(!AUTH.directory || !AUTH.signedIn) return;
  try{
    const r = await fetch('/api/directory'); const d = await r.json();
    if(!r.ok) throw new Error(d.error || 'request failed');
    DIRECTORY = d.people; DIRECTORY_LIVE = true;
  }catch(e){ DIRECTORY_ERROR = e.message; }
}
async function fetchTickets(){ const r = await fetch('/api/tickets?user='+encodeURIComponent(CURRENT_USER)); const d = await r.json(); TICKETS = d.tickets || []; }
async function fetchPto(){ const r = await fetch('/api/pto?user='+encodeURIComponent(CURRENT_USER)); const d = await r.json(); PTO = d.pto || []; }

async function postJson(url, body){
  const res = await fetch(url, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body) });
  return res.json();
}

/* ---------- helpers ---------- */
function escapeHtml(s){ return String(s==null?'':s).replace(/[&<>"']/g, function(c){ return ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]; }); }
function initials(name){
  const parts = String(name).trim().split(/\s+/);
  if(parts.length===1) return (parts[0].slice(0,2)||'?').toUpperCase();
  return (parts[0][0]+parts[1][0]).toUpperCase();
}
const AVATAR_COLORS = ['var(--blue)','var(--gold-deep)','var(--red)','var(--blue-deep)'];
function avatarColor(name){
  let h=0; const s=String(name);
  for(let i=0;i<s.length;i++){ h=(h*31 + s.charCodeAt(i))|0; }
  return AVATAR_COLORS[Math.abs(h)%AVATAR_COLORS.length];
}
function gradStyle(grad){ return 'background:linear-gradient(120deg, var('+grad[0]+'), var('+grad[1]+'));'; }
function statusStyle(status){
  if(status==='Shipped') return 'background:color-mix(in srgb, var(--green) 20%, transparent); color:var(--green);';
  if(status==='Planned') return 'background:color-mix(in srgb, var(--gold) 22%, transparent); color:var(--gold-deep);';
  return 'background:color-mix(in srgb, var(--blue) 16%, transparent); color:var(--blue);';
}
function deptById(id){ return DEPARTMENTS.filter(function(d){return d.id===id;})[0]; }

/* ---------- routing ---------- */
function parseHash(){
  const h = location.hash.replace(/^#\/?/, '');
  const parts = h.split('/').filter(Boolean);
  if(parts[0]==='department' && parts[1]) return {view:'department', id:parts[1]};
  if(parts[0]==='departments') return {view:'departments'};
  if(parts[0]==='kudos') return {view:'kudos'};
  if(parts[0]==='ideas') return {view:'ideas'};
  if(parts[0]==='events') return {view:'events'};
  if(parts[0]==='directory') return {view:'directory'};
  if(parts[0]==='tickets') return {view:'tickets'};
  if(parts[0]==='pto') return {view:'pto'};
  return {view:'home'};
}
function nav(hash){
  const norm = hash.replace(/^\/?/, '');
  if(location.hash.replace(/^#\/?/,'') === norm){ render(); }
  else { location.hash = hash; }
  window.scrollTo(0,0);
}

/* ---------- shell ---------- */
function topbarHtml(r){
  const tabs = [
    ['', 'home', 'Home'],
    ['departments', 'departments', 'Departments'],
    ['kudos', 'kudos', 'Kudos'],
    ['ideas', 'ideas', 'Ideas'],
    ['events', 'events', 'Events'],
    ['directory', 'directory', 'Directory']
  ];
  const navBtns = tabs.map(function(t){
    return '<button class="'+(r.view===t[1]?'active':'')+'" onclick="nav(\''+t[0]+'\')">'+t[2]+'</button>';
  }).join('');
  return '<div class="topbar">'+
    '<button class="brand" onclick="nav(\'\')" aria-label="Home">'+
      '<span class="brand-mark"><img src="/logo.png" alt="United Way of Palm Beach County"></span>'+
      '<span class="brand-text"><b>UWPBC Intranet</b><span>Concept &middot; local prototype</span></span>'+
    '</button>'+
    '<div class="topnav">'+navBtns+'</div>'+
  '</div>';
}
function whoamiHtml(){
  return '<div class="whoami">Signed in as <b>'+escapeHtml(CURRENT_USER)+'</b> &middot; <button onclick="switchUser()">'+(AUTH.configured?'sign out':'not you?')+'</button></div>';
}
function footerHtml(){
  return '<footer>'+
    '<span>'+(AUTH.configured?'Connected to Microsoft 365 &middot; kudos, ideas, and requests':'Local concept prototype &middot; data')+' stored in intranet-prototype/data/db.json on this machine</span>'+
    '<span><a href="#" onclick="nav(\'tickets\'); return false;">IT Help Desk</a> &middot; <a href="#" onclick="nav(\'directory\'); return false;">Contact HR</a></span>'+
  '</footer>';
}
function switchUser(){
  if(AUTH.configured){ location.href = '/auth/logout'; return; }
  clearUser(); CURRENT_USER=''; render();
}

/* ---------- name gate ---------- */
function renderNameGate(){
  if(AUTH.configured){
    document.getElementById('app').innerHTML =
      '<div class="namegate">'+
        '<div class="mark"><img src="/logo.png" alt="United Way of Palm Beach County"></div>'+
        '<h1>Welcome to the UWPBC Intranet</h1>'+
        '<p>Sign in with your UWPBC Microsoft 365 account to see the staff directory, upcoming events, and your personalized homepage.</p>'+
        '<a class="btn gold" href="/auth/login">Sign in with Microsoft</a>'+
      '</div>';
    return;
  }
  document.getElementById('app').innerHTML =
    '<div class="namegate">'+
      '<div class="mark"><img src="/logo.png" alt="United Way of Palm Beach County"></div>'+
      '<h1>Welcome to the UWPBC Intranet</h1>'+
      '<p>Enter your name to personalize your homepage — kudos, idea votes, and RSVPs are tracked to your name on this shared local prototype.</p>'+
      '<input type="text" id="name-input" placeholder="e.g. Kevin L." autofocus>'+
      '<button class="btn gold" onclick="submitName()">Enter the Intranet</button>'+
    '</div>';
  const input = document.getElementById('name-input');
  input.addEventListener('keydown', function(e){ if(e.key==='Enter') submitName(); });
}
function submitName(){
  const v = (document.getElementById('name-input').value || '').trim();
  if(!v) return;
  setUser(v); CURRENT_USER = v; render();
}

/* ---------- shared bits ---------- */
function newsCardHtml(n){
  return '<div class="card banner-card" onclick="nav(\'department/'+n.dept+'\')">'+
    '<div class="banner tall" style="'+gradStyle(n.grad)+'">'+ICONS[n.icon]+'</div>'+
    '<div class="banner-body">'+
      '<span class="eyebrow">'+escapeHtml(n.deptLabel)+'</span>'+
      '<h4>'+escapeHtml(n.title)+'</h4>'+
      '<p>'+escapeHtml(n.teaser)+'</p>'+
      '<span class="meta">'+escapeHtml(n.posted)+'</span>'+
    '</div>'+
  '</div>';
}
function departmentCardHtml(d){
  return '<div class="card banner-card" onclick="nav(\'department/'+d.id+'\')">'+
    '<div class="banner" style="'+gradStyle(d.grad)+'">'+ICONS[d.icon]+'</div>'+
    '<div class="banner-body">'+
      '<h3>'+escapeHtml(d.name)+'</h3>'+
      '<p>'+escapeHtml(d.tagline)+'</p>'+
      '<a class="go" onclick="event.stopPropagation(); nav(\'department/'+d.id+'\')">View department &rarr;</a>'+
    '</div>'+
  '</div>';
}
function kudosCardHtml(k){
  const starred = k.starredBy && k.starredBy.indexOf(CURRENT_USER) >= 0;
  return '<div class="card kudos-card">'+
    '<div class="kudos-row-head"><div class="avatar" style="background:'+avatarColor(k.from)+'">'+initials(k.from)+'</div><span class="kudos-from">'+escapeHtml(k.from)+'</span></div>'+
    '<p class="kudos-msg">'+escapeHtml(k.message)+'</p>'+
    '<button class="star-btn '+(starred?'starred':'')+'" '+(starred?'disabled':'')+' onclick="starKudos(\''+k.id+'\')">'+(starred?ICONS.star:ICONS.starOutline)+'<span>'+k.stars+'</span></button>'+
  '</div>';
}
function ideaRowHtml(idea){
  const voted = idea.voters && idea.voters.indexOf(CURRENT_USER) >= 0;
  return '<div class="idea-row">'+
    '<button class="vote-btn '+(voted?'voted':'')+'" '+(voted?'disabled':'')+' onclick="voteIdea(\''+idea.id+'\')">'+ICONS.chevronUp+'<span>'+idea.votes+'</span></button>'+
    '<div style="flex:1;"><h4>'+escapeHtml(idea.title)+'</h4><p>'+escapeHtml(idea.description)+'</p></div>'+
    '<span class="status-pill" style="'+statusStyle(idea.status)+'">'+escapeHtml(idea.status)+'</span>'+
  '</div>';
}
function eventCardHtml(ev){
  const going = typeof ev.going === 'boolean' ? ev.going : (ev.rsvps && ev.rsvps.indexOf(CURRENT_USER) >= 0);
  const label = ev.outlook ? (going ? "Going &middot; in your Outlook" : 'RSVP &amp; add to Outlook') : (going ? "You're going" : 'RSVP');
  return '<div class="card event-card">'+
    '<div class="date-badge" style="background:var(--blue)"><span class="mon">'+escapeHtml(ev.month)+'</span><span class="day">'+escapeHtml(ev.day)+'</span></div>'+
    '<div style="display:flex; flex-direction:column; gap:6px; flex:1;">'+
      '<h4 style="font-size:.94rem;">'+escapeHtml(ev.title)+'</h4>'+
      '<span class="event-meta">'+ICONS.pin+' '+escapeHtml(ev.detail)+'</span>'+
      '<button class="btn small '+(going?'ghost':'')+'" style="align-self:flex-start; margin-top:2px;" onclick="toggleRsvp(\''+escapeHtml(ev.id)+'\', this)">'+label+'</button>'+
      '<span class="rsvp-count">'+(ev.rsvps?ev.rsvps.length:0)+' going</span>'+
    '</div>'+
  '</div>';
}

/* ---------- views ---------- */
function renderHome(){
  const pct = Math.round(CAMPAIGN.raised / CAMPAIGN.goal * 100);
  const news = NEWS.map(newsCardHtml).join('');
  const depts = DEPARTMENTS.map(departmentCardHtml).join('');
  const kudos = KUDOS.slice(0,3).map(kudosCardHtml).join('');
  const ideas = IDEAS.slice(0,4).map(ideaRowHtml).join('');
  const events = EVENTS.slice(0,3).map(eventCardHtml).join('');

  return (
  '<div class="hero">'+
    '<div class="hero-copy">'+
      '<span class="eyebrow">United Way of Palm Beach County &middot; Staff Intranet</span>'+
      '<h1>Welcome back &mdash; let\'s <span style="color:var(--red)">LIVE UNITED</span> today.</h1>'+
      '<p>Your home for department news, staff recognition, open ideas, and everything happening across UWPBC this week.</p>'+
      '<div style="display:flex; gap:12px; margin-top:6px; flex-wrap:wrap;">'+
        '<button class="btn" onclick="nav(\'departments\')">Explore Departments</button>'+
        '<button class="btn ghost" onclick="nav(\'ideas\')">Share an Idea</button>'+
      '</div>'+
    '</div>'+
    '<div class="card spotlight">'+
      '<span class="eyebrow" style="color:var(--gold-deep)">Campaign Spotlight</span>'+
      '<h3>'+escapeHtml(CAMPAIGN.name)+'</h3>'+
      '<div style="display:flex; align-items:baseline; gap:10px;"><span class="pct">'+pct+'%</span><span style="font-size:.85rem;color:var(--muted)">of $'+(CAMPAIGN.goal/1000000).toFixed(1)+'M goal &mdash; '+CAMPAIGN.daysLeft+' days left</span></div>'+
      '<div class="meter-track"><div class="meter-fill" style="width:'+pct+'%"></div></div>'+
      '<span style="font-size:.8rem;color:var(--muted)">Illustrative figures for concept only.</span>'+
    '</div>'+
  '</div>'+

  '<div class="quicklinks">'+
    '<button class="qlink" onclick="nav(\'tickets\')"><span class="qicon" style="background:color-mix(in srgb, var(--blue) 14%, transparent); color:var(--blue)">'+ICONS.ticket+'</span><span class="label">Submit IT Ticket</span></button>'+
    '<button class="qlink" onclick="nav(\'pto\')"><span class="qicon" style="background:color-mix(in srgb, var(--gold) 18%, transparent); color:var(--gold-deep)">'+ICONS.calendar+'</span><span class="label">Request PTO</span></button>'+
    '<button class="qlink" onclick="nav(\'directory\')"><span class="qicon" style="background:color-mix(in srgb, var(--red) 14%, transparent); color:var(--red)">'+ICONS.people+'</span><span class="label">Org Directory</span></button>'+
    '<button class="qlink" onclick="nav(\'events\')"><span class="qicon" style="background:color-mix(in srgb, var(--blue-deep) 16%, transparent); color:var(--blue-deep)">'+ICONS.calendar+'</span><span class="label">Events Calendar</span></button>'+
  '</div>'+

  '<div style="margin-bottom:44px;"><div class="section-head"><div><h2>For You</h2><div class="sub">Curated news for your team</div></div></div><div class="grid3">'+news+'</div></div>'+

  '<div style="margin-bottom:44px;"><div class="section-head"><div><h2>Explore by Department</h2><div class="sub">Everything your team needs, in one place</div></div></div><div class="grid3">'+depts+'</div></div>'+

  '<div style="margin-bottom:44px;"><div class="section-head"><div><h2>Kudos Wall</h2><div class="sub">Recognition from around UWPBC</div></div><a class="see-all" onclick="nav(\'kudos\')">See all &rarr;</a></div><div class="grid3">'+kudos+'</div></div>'+

  '<div style="margin-bottom:44px;"><div class="section-head"><div><h2>Idea Exchange</h2><div class="sub">Submit an idea, vote on what matters</div></div><a class="see-all" onclick="nav(\'ideas\')">See all &rarr;</a></div><div class="card list-card">'+ideas+'</div></div>'+

  '<div><div class="section-head"><div><h2>Upcoming Events</h2><div class="sub">Mark your calendar</div></div><a class="see-all" onclick="nav(\'events\')">See all &rarr;</a></div><div class="grid3">'+events+'</div></div>'
  );
}

function renderDepartmentsPage(){
  return '<div class="crumbs"><button onclick="nav(\'\')">Home</button><span class="sep">/</span><span>Departments</span></div>'+
  '<div style="margin-bottom:26px;"><h1>Departments</h1><p style="color:var(--muted); margin-top:6px;">Everything your team needs, in one place.</p></div>'+
  '<div class="grid3">'+DEPARTMENTS.map(departmentCardHtml).join('')+'</div>';
}

function renderDepartmentDetail(id){
  const d = deptById(id);
  if(!d) return '<p>Department not found.</p>';
  const resources = d.resources.map(function(r){
    return '<div class="list-row" '+(r.link?'style="cursor:pointer" onclick="nav(\''+r.link+'\')"':'')+'>'+
      '<div class="txt"><b>'+escapeHtml(r.label)+'</b><span>'+escapeHtml(r.note)+'</span></div>'+
      (r.link?('<span style="color:var(--blue); font-weight:700; font-size:.85rem;">Open &rarr;</span>'):'')+
    '</div>';
  }).join('');
  return '<div class="crumbs"><button onclick="nav(\'\')">Home</button><span class="sep">/</span><button onclick="nav(\'departments\')">Departments</button><span class="sep">/</span><span>'+escapeHtml(d.name)+'</span></div>'+
  '<div style="display:flex; gap:16px; align-items:center; margin-bottom:10px; flex-wrap:wrap;">'+
    '<div style="width:52px;height:52px;border-radius:14px;display:flex;align-items:center;justify-content:center;color:#fff;'+gradStyle(d.grad)+'">'+ICONS[d.icon]+'</div>'+
    '<div><h1 style="font-size:1.6rem;">'+escapeHtml(d.name)+'</h1><div style="color:var(--muted); margin-top:4px;">'+escapeHtml(d.tagline)+'</div></div>'+
  '</div>'+
  '<p style="max-width:70ch; color:var(--ink); margin:18px 0 26px;">'+escapeHtml(d.description)+'</p>'+
  '<h3 style="font-size:1.05rem; margin-bottom:10px;">Resources</h3>'+
  '<div class="card list-card">'+resources+'</div>';
}

function renderKudosPage(){
  const cards = KUDOS.map(kudosCardHtml).join('');
  return '<div class="crumbs"><button onclick="nav(\'\')">Home</button><span class="sep">/</span><span>Kudos Wall</span></div>'+
  '<div style="margin-bottom:26px;"><h1>Kudos Wall</h1><p style="color:var(--muted); margin-top:6px;">Recognition from around UWPBC.</p></div>'+
  '<div class="card form-card" style="margin-bottom:30px;">'+
    '<h3 style="font-size:1rem;">Give Kudos</h3>'+
    '<label>From<input type="text" id="kudos-from" placeholder="Your name or team" value="'+escapeHtml(CURRENT_USER)+'"></label>'+
    '<label>Message<textarea id="kudos-message" placeholder="Say something nice about a teammate or team..."></textarea></label>'+
    '<button class="btn gold" style="align-self:flex-start;" onclick="giveKudos()">Post Kudos</button>'+
  '</div>'+
  '<div class="grid3">'+(cards || '<div class="empty-state">No kudos yet &mdash; be the first to post one.</div>')+'</div>';
}
async function giveKudos(){
  const from = (document.getElementById('kudos-from').value || '').trim();
  const message = (document.getElementById('kudos-message').value || '').trim();
  if(!from || !message) return;
  await postJson('/api/kudos', { from, message });
  await render();
}
async function starKudos(id){
  await postJson('/api/kudos/star', { id, user: CURRENT_USER });
  await render();
}

function renderIdeasPage(){
  const rows = IDEAS.map(ideaRowHtml).join('');
  return '<div class="crumbs"><button onclick="nav(\'\')">Home</button><span class="sep">/</span><span>Idea Exchange</span></div>'+
  '<div style="margin-bottom:26px;"><h1>Idea Exchange</h1><p style="color:var(--muted); margin-top:6px;">Submit an idea. Vote on what matters. Watch it ship.</p></div>'+
  '<div class="card form-card" style="margin-bottom:30px;">'+
    '<h3 style="font-size:1rem;">Submit an Idea</h3>'+
    '<label>Title<input type="text" id="idea-title" placeholder="What should we build or change?"></label>'+
    '<label>Description<textarea id="idea-desc" placeholder="A sentence or two of detail..."></textarea></label>'+
    '<button class="btn gold" style="align-self:flex-start;" onclick="submitIdea()">Submit Idea</button>'+
  '</div>'+
  '<div class="card list-card">'+(rows || '<div class="empty-state">No ideas yet &mdash; submit the first one.</div>')+'</div>';
}
async function submitIdea(){
  const title = (document.getElementById('idea-title').value || '').trim();
  const description = (document.getElementById('idea-desc').value || '').trim();
  if(!title) return;
  await postJson('/api/ideas', { title, description });
  await render();
}
async function voteIdea(id){
  await postJson('/api/ideas/vote', { id, user: CURRENT_USER });
  await render();
}

function renderEventsPage(){
  const cards = EVENTS.map(eventCardHtml).join('');
  const live = EVENTS.length && EVENTS[0].outlook;
  const sub = EVENTS_NOTICE ? escapeHtml(EVENTS_NOTICE)
    : live ? 'From the shared UWPBC Outlook calendar &mdash; RSVP and the event is added to your own Outlook.'
    : 'Mark your calendar &mdash; RSVP so we can plan headcount.';
  return '<div class="crumbs"><button onclick="nav(\'\')">Home</button><span class="sep">/</span><span>Events</span></div>'+
  '<div style="margin-bottom:26px;"><h1>Upcoming Events</h1><p style="color:var(--muted); margin-top:6px;">'+sub+'</p></div>'+
  '<div class="grid3">'+(cards || '<div class="empty-state">No upcoming events.</div>')+'</div>';
}
async function toggleRsvp(id, btn){
  if(btn){ btn.disabled = true; btn.textContent = 'Updating...'; } // Outlook round trips take a second
  const d = await postJson('/api/events/rsvp', { id, user: CURRENT_USER });
  if(d && d.error) alert("Couldn't update your RSVP: " + d.error);
  await render();
}

function renderDirectoryPage(){
  const sub = DIRECTORY_LIVE ? 'Live from Microsoft 365 &middot; '+DIRECTORY.length+' people'+(AUTH.fullDirectory?'':' &middot; titles and departments appear once IT approves full directory access')
    : DIRECTORY_ERROR ? "Couldn't load the Microsoft 365 directory ("+escapeHtml(DIRECTORY_ERROR)+') &mdash; showing sample data.'
    : 'Sample directory for this concept &mdash; not real staff records.';
  return '<div class="crumbs"><button onclick="nav(\'\')">Home</button><span class="sep">/</span><span>Org Directory</span></div>'+
  '<div style="margin-bottom:20px;"><h1>Org Directory</h1><p style="color:var(--muted); margin-top:6px;">'+sub+'</p></div>'+
  '<div class="search-wrap">'+ICONS.search+'<input type="text" id="staff-search" placeholder="Search by name, role, or department..." oninput="filterDirectory(this.value)"></div>'+
  '<div class="card list-card" id="staff-list">'+staffRowsHtml(DIRECTORY)+'</div>';
}
function staffRowsHtml(list){
  if(!list.length) return '<div class="empty-state">No matches.</div>';
  return list.map(function(p){
    // live entries have an Entra id: lay their photo over the initials (it removes itself if they have none)
    const photo = p.id ? '<img src="/api/directory/photo/'+encodeURIComponent(p.id)+'" alt="" loading="lazy" onerror="this.remove()">' : '';
    const email = p.email ? '<a href="mailto:'+escapeHtml(p.email)+'">'+escapeHtml(p.email)+'</a>' : '';
    return '<div class="list-row staff-row">'+
      '<div class="initials" style="background:'+avatarColor(p.name)+'">'+initials(p.name)+photo+'</div>'+
      '<div class="who"><b>'+escapeHtml(p.name)+'</b><span>'+escapeHtml(p.role)+'</span></div>'+
      '<div class="dept">'+escapeHtml(p.dept)+'<br>'+email+(p.phone?'<br>'+escapeHtml(p.phone):'')+'</div>'+
    '</div>';
  }).join('');
}
function filterDirectory(q){
  const query = (q||'').toLowerCase();
  const filtered = DIRECTORY.filter(function(p){
    return (p.name+' '+p.role+' '+p.dept+' '+(p.email||'')).toLowerCase().indexOf(query) >= 0;
  });
  const holder = document.getElementById('staff-list');
  if(holder) holder.innerHTML = staffRowsHtml(filtered);
}

function renderTicketsPage(){
  const rows = TICKETS.map(function(t){
    return '<div class="list-row"><div class="txt"><b>'+escapeHtml(t.subject)+'</b><span>'+escapeHtml(t.details||'')+'</span></div><span class="status-pill" style="background:color-mix(in srgb, var(--blue) 16%, transparent); color:var(--blue);">'+escapeHtml(t.status)+'</span></div>';
  }).join('');
  return '<div class="crumbs"><button onclick="nav(\'\')">Home</button><span class="sep">/</span><span>IT Help Desk</span></div>'+
  '<div style="margin-bottom:26px;"><h1>Submit IT Ticket</h1><p style="color:var(--muted); margin-top:6px;">Hardware, software, and access requests.</p></div>'+
  '<div class="card form-card" style="margin-bottom:30px;">'+
    '<label>Subject<input type="text" id="ticket-subject" placeholder="e.g. Laptop won\'t connect to VPN"></label>'+
    '<label>Details<textarea id="ticket-details" placeholder="Add any details that will help IT triage this..."></textarea></label>'+
    '<button class="btn gold" style="align-self:flex-start;" onclick="submitTicket()">Submit Ticket</button>'+
  '</div>'+
  '<h3 style="font-size:1.05rem; margin-bottom:10px;">My Tickets</h3>'+
  '<div class="card list-card">'+(rows || '<div class="empty-state">No tickets submitted yet.</div>')+'</div>';
}
async function submitTicket(){
  const subject = (document.getElementById('ticket-subject').value || '').trim();
  const details = (document.getElementById('ticket-details').value || '').trim();
  if(!subject) return;
  await postJson('/api/tickets', { user: CURRENT_USER, subject, details });
  await render();
}

function renderPtoPage(){
  const rows = PTO.map(function(p){
    return '<div class="list-row"><div class="txt"><b>'+escapeHtml(p.startDate)+' &ndash; '+escapeHtml(p.endDate)+'</b><span>'+escapeHtml(p.notes||'')+'</span></div><span class="status-pill" style="background:color-mix(in srgb, var(--gold) 22%, transparent); color:var(--gold-deep);">'+escapeHtml(p.status)+'</span></div>';
  }).join('');
  return '<div class="crumbs"><button onclick="nav(\'\')">Home</button><span class="sep">/</span><span>Request PTO</span></div>'+
  '<div style="margin-bottom:26px;"><h1>Request PTO</h1><p style="color:var(--muted); margin-top:6px;">Submit time off for your manager to review.</p></div>'+
  '<div class="card form-card" style="margin-bottom:30px;">'+
    '<div class="row2"><label>Start date<input type="date" id="pto-start"></label><label>End date<input type="date" id="pto-end"></label></div>'+
    '<label>Notes (optional)<textarea id="pto-notes" placeholder="Anything your manager should know..."></textarea></label>'+
    '<button class="btn gold" style="align-self:flex-start;" onclick="submitPto()">Submit Request</button>'+
  '</div>'+
  '<h3 style="font-size:1.05rem; margin-bottom:10px;">My Requests</h3>'+
  '<div class="card list-card">'+(rows || '<div class="empty-state">No PTO requests yet.</div>')+'</div>';
}
async function submitPto(){
  const startDate = (document.getElementById('pto-start').value || '').trim();
  const endDate = (document.getElementById('pto-end').value || '').trim();
  const notes = (document.getElementById('pto-notes').value || '').trim();
  if(!startDate || !endDate) return;
  await postJson('/api/pto', { user: CURRENT_USER, startDate, endDate, notes });
  await render();
}

/* ---------- floating assistant bubble (persists across every page) ---------- */
function initAssistantBubble(){
  if(document.getElementById('assistant-bubble')) return; // don't duplicate
  const wrap = document.createElement('div');
  wrap.innerHTML =
    '<button id="assistant-bubble" class="assistant-bubble" aria-label="Open '+escapeHtml(BOT.name)+'" onclick="toggleAssistant()">'+ICONS.chat+'</button>'+
    '<div id="assistant-panel" class="assistant-panel" hidden>'+
      '<div class="assistant-panel-head">'+
        '<div class="who"><div class="assistant-avatar">'+ICONS.chat+'</div><div><h4>'+escapeHtml(BOT.name)+'</h4><span class="eyebrow">Copilot Studio bot</span></div></div>'+
        '<button class="assistant-close" aria-label="Close" onclick="toggleAssistant(false)">'+ICONS.close+'</button>'+
      '</div>'+
      '<p class="desc">'+escapeHtml(BOT.description)+'</p>'+
      '<a class="btn gold" href="'+BOT.teamsLink+'" target="_blank" rel="noopener">Open in Teams '+ICONS.external+'</a>'+
    '</div>';
  document.body.appendChild(wrap);
}
function toggleAssistant(force){
  const panel = document.getElementById('assistant-panel');
  if(!panel) return;
  const show = typeof force === 'boolean' ? force : panel.hasAttribute('hidden');
  if(show) panel.removeAttribute('hidden'); else panel.setAttribute('hidden','');
}

/* ---------- init ---------- */
async function render(){
  if(!CURRENT_USER){ renderNameGate(); return; }
  const r = parseHash();
  let body = '';
  if(r.view==='department'){ body = renderDepartmentDetail(r.id); }
  else if(r.view==='departments'){ body = renderDepartmentsPage(); }
  else if(r.view==='kudos'){ await fetchKudos(); body = renderKudosPage(); }
  else if(r.view==='ideas'){ await fetchIdeas(); body = renderIdeasPage(); }
  else if(r.view==='events'){ await fetchEvents(); body = renderEventsPage(); }
  else if(r.view==='directory'){ await fetchDirectory(); body = renderDirectoryPage(); }
  else if(r.view==='tickets'){ await fetchTickets(); body = renderTicketsPage(); }
  else if(r.view==='pto'){ await fetchPto(); body = renderPtoPage(); }
  else { await Promise.all([fetchKudos(), fetchIdeas(), fetchEvents()]); body = renderHome(); }
  document.getElementById('app').innerHTML = topbarHtml(r) + whoamiHtml() + body + footerHtml();
}

window.nav = nav;
window.submitName = submitName;
window.switchUser = switchUser;
window.giveKudos = giveKudos;
window.starKudos = starKudos;
window.submitIdea = submitIdea;
window.voteIdea = voteIdea;
window.toggleRsvp = toggleRsvp;
window.submitTicket = submitTicket;
window.submitPto = submitPto;
window.filterDirectory = filterDirectory;
window.toggleAssistant = toggleAssistant;
window.addEventListener('hashchange', render);
initAssistantBubble();
fetchAuth().then(render);

})();
