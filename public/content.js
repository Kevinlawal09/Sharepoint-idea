/* Static content for the UWPBC Intranet concept: departments, news, staff directory,
   the campaign meter, and the inline icon set. Kudos, ideas, events (RSVPs), tickets
   and PTO requests are dynamic and served from the API in server.js instead. */

const CAMPAIGN = { name: '2026 Workplace Campaign', goal: 2000000, raised: 1360000, daysLeft: 47 };

// Your Copilot Studio bot, surfaced as a floating assistant bubble on every page.
// Edit name/description here; teamsLink opens the published Teams app in a new tab.
const BOT = {
  name: 'UWPBC Assistant',
  description: 'Ask about policies, benefits, IT how-tos, and more.',
  teamsLink: 'https://teams.microsoft.com/l/app/1ef3c012-7ba0-4e29-b6e7-e724183ab93f?source=app-profile-card&templateInstanceId=ef0107a5-61bd-4087-aae9-038354e63279&environment=Default-f2cb0f20-30fc-4801-8c8f-66150c6fc34b&threadId=19%3A73c3b127-70f7-44d1-b29a-c8a235059f5e_f6663244-7156-4ed4-a52b-59cc2580d6ca%40unq.gbl.spaces'
};

const DEPARTMENTS = [
  {
    id: 'executive-hr', name: 'Executive & Human Resources', icon: 'briefcase',
    grad: ['--blue', '--blue-deep'],
    tagline: 'Leadership updates, policies, benefits, and HR resources.',
    description: 'The home for org-wide announcements, policy changes, and everything HR — benefits enrollment, time-off requests, onboarding, and how to reach the executive team.',
    resources: [
      { label: 'Employee Handbook', note: 'Policies, conduct, and workplace guidelines' },
      { label: 'Benefits Overview', note: 'Medical, dental, retirement, and open enrollment dates' },
      { label: 'Org Chart', note: 'Leadership structure and reporting lines' },
      { label: 'HR Contact', note: 'hr@unitedwaypbc.org (sample contact for this concept)' }
    ]
  },
  {
    id: 'finance-it-ops', name: 'Finance / IT / Operations', icon: 'chart',
    grad: ['--blue-deep', '--ink'],
    tagline: 'Budgets, tech support, pledge processing, and reception.',
    description: 'Budget calendars, expense and reimbursement procedures, IT support, pledge processing schedules, and day-to-day office operations.',
    resources: [
      { label: 'Submit IT Ticket', note: 'Hardware, software, and access requests', link: 'tickets' },
      { label: 'Expense Reimbursement', note: 'Forms and approval workflow' },
      { label: 'Pledge Processing Calendar', note: 'Cutoffs and batch schedules' },
      { label: 'Reception & Facilities', note: 'Front desk, mail, and building access' }
    ]
  },
  {
    id: 'crm', name: 'CRM Implementation', icon: 'database',
    grad: ['--gold-deep', '--gold'],
    tagline: 'Andar rollout news, training, and project timeline.',
    description: 'Everything about the CRM project: the Andar discovery phase, training materials, timeline, and how to flag a question or blocker to the project team.',
    resources: [
      { label: 'Project Timeline', note: 'Phase 1 discovery, migration, and go-live milestones' },
      { label: 'Training Materials', note: 'Role-based walkthroughs and FAQs' },
      { label: 'Report an Issue', note: 'Flag a data or workflow question to the project team' },
      { label: 'Office Hours', note: 'Weekly drop-in Q&A with the implementation team' }
    ]
  },
  {
    id: 'marketing', name: 'Marketing', icon: 'megaphone',
    grad: ['--red', '--gold-deep'],
    tagline: 'Brand assets, campaigns, and communications resources.',
    description: 'Brand guidelines, logo and template downloads, campaign calendars, and how to request marketing support for your team\'s event or initiative.',
    resources: [
      { label: 'Brand Guidelines', note: 'Logo usage, color palette, and voice' },
      { label: 'Templates', note: 'Flyers, email, and social graphics' },
      { label: 'Campaign Calendar', note: 'Upcoming pushes and key dates' },
      { label: 'Request Support', note: 'Ask marketing to help with your event or project' }
    ]
  },
  {
    id: 'fundraising', name: 'Fundraising', icon: 'heart',
    grad: ['--gold', '--blue'],
    tagline: 'Major gifts, resource development, and campaign tools.',
    description: 'Major gifts, resource development, and workplace campaign tools — pledge forms, donor stewardship resources, and campaign progress reporting.',
    resources: [
      { label: 'Major Gifts', note: 'Prospect tracking and stewardship resources' },
      { label: 'Resource Development', note: 'Grant calendar and funder relationships' },
      { label: 'Campaign Toolkit', note: 'Pledge forms, talking points, and flyers' },
      { label: 'Campaign Progress', note: 'Live tracking toward the annual goal' }
    ]
  },
  {
    id: 'community', name: 'Community Investments', icon: 'building',
    grad: ['--blue', '--gold-deep'],
    tagline: 'Grants, partner agencies, and impact reporting.',
    description: 'Grant cycles, partner agency relationships, and impact reporting for the programs UWPBC funds across Palm Beach County.',
    resources: [
      { label: 'Grant Cycle Calendar', note: 'Application windows and review dates' },
      { label: 'Partner Agencies', note: 'Directory of funded programs' },
      { label: 'Impact Reports', note: 'Outcomes and community data' },
      { label: 'Site Visit Scheduling', note: 'Coordinate agency visits' }
    ]
  }
];

const NEWS = [
  { id: 'n1', dept: 'crm', deptLabel: 'CRM Implementation', title: 'Andar Discovery Phase Kicks Off', teaser: 'Phase 1 discovery sessions begin this month — see the timeline and how to get involved.', posted: '2 days ago', icon: 'database', grad: ['--gold-deep', '--gold'] },
  { id: 'n2', dept: 'executive-hr', deptLabel: 'Human Resources', title: 'Open Enrollment Opens Oct 1', teaser: 'Review your benefits options and mark your calendar for enrollment sessions.', posted: '4 days ago', icon: 'briefcase', grad: ['--blue', '--blue-deep'] },
  { id: 'n3', dept: 'fundraising', deptLabel: 'Fundraising', title: 'Campaign Passes the Halfway Mark', teaser: "Thank you to every team that's pledged so far — here's how to get involved.", posted: '6 days ago', icon: 'heart', grad: ['--gold', '--blue'] }
];

// Sample directory only — illustrative names for this local concept, not real staff records.
const STAFF = [
  { name: 'Jordan Alvarez', role: 'Major Gifts Officer', dept: 'Fundraising', email: 'jalvarez@example.org' },
  { name: 'Priya Nair', role: 'HR Coordinator', dept: 'Executive & Human Resources', email: 'pnair@example.org' },
  { name: 'Marcus Feld', role: 'IT Support Specialist', dept: 'Finance / IT / Operations', email: 'mfeld@example.org' },
  { name: 'Dana Whitfield', role: 'Marketing Manager', dept: 'Marketing', email: 'dwhitfield@example.org' },
  { name: 'Sam Okafor', role: 'CRM Project Lead', dept: 'CRM Implementation', email: 'sokafor@example.org' },
  { name: 'Lena Buchholz', role: 'Community Investments Officer', dept: 'Community Investments', email: 'lbuchholz@example.org' },
  { name: 'Riley Thompson', role: 'Resource Development Manager', dept: 'Fundraising', email: 'rthompson@example.org' },
  { name: 'Casey Morrow', role: 'Finance Analyst', dept: 'Finance / IT / Operations', email: 'cmorrow@example.org' }
];

const ICONS = {
  mark: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 21s-7-4.35-9.5-8.5C.8 9 2 5.5 5.5 5c2-.3 3.7.8 4.5 2.3C10.8 5.8 12.5 4.7 14.5 5c3.5.5 4.7 4 3 7.5C19 16.65 12 21 12 21Z"/></svg>',
  briefcase: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 8h16v11a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V8Z"/><path d="M9 8V6a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2"/><path d="M4 13h16"/></svg>',
  chart: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M5 20V10M12 20V4M19 20v-7"/><path d="M3 20h18"/></svg>',
  database: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><ellipse cx="12" cy="6" rx="8" ry="3"/><path d="M4 6v6c0 1.7 3.6 3 8 3s8-1.3 8-3V6"/><path d="M4 12v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6"/></svg>',
  megaphone: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M3 11v2a2 2 0 0 0 2 2h1l2 5 2-1-1.6-4H10l8 3V6l-8 3H5a2 2 0 0 0-2 2Z"/></svg>',
  heart: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M12 21s-7-4.35-9.5-8.5C.8 9 2 5.5 5.5 5c2-.3 3.7.8 4.5 2.3C10.8 5.8 12.5 4.7 14.5 5c3.5.5 4.7 4 3 7.5C19 16.65 12 21 12 21Z"/></svg>',
  building: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 21V9l5-4 5 4v12"/><path d="M14 21V13l4-2 3 2v8"/><path d="M4 21h17"/></svg>',
  ticket: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 8a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v2a2 2 0 0 0 0 4v2a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-2a2 2 0 0 0 0-4V8Z"/><path d="M10 6v12" stroke-dasharray="2 3"/></svg>',
  calendar: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/></svg>',
  people: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="8" r="3"/><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6"/><circle cx="17.5" cy="8.5" r="2.3"/><path d="M15.8 14.3c2.4.6 4.2 2.7 4.2 5.4"/></svg>',
  star: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 3.5l2.5 5.3 5.8.7-4.3 4 1.1 5.8L12 16.6l-5.1 2.7 1.1-5.8-4.3-4 5.8-.7L12 3.5Z"/></svg>',
  starOutline: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3.5l2.5 5.3 5.8.7-4.3 4 1.1 5.8L12 16.6l-5.1 2.7 1.1-5.8-4.3-4 5.8-.7L12 3.5Z"/></svg>',
  chevronUp: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 15l6-6 6 6"/></svg>',
  clock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
  pin: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 21s7-6.1 7-11a7 7 0 1 0-14 0c0 4.9 7 11 7 11Z"/><circle cx="12" cy="10" r="2.5"/></svg>',
  check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M5 13l4 4L19 7"/></svg>',
  search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></svg>',
  chat: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 5h16v11H8l-4 4V5Z"/><path d="M8 9h8M8 12.5h5"/></svg>',
  close: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 6l12 12M18 6 6 18"/></svg>',
  external: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M14 4h6v6"/><path d="M20 4 10 14"/><path d="M18 13v5a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h5"/></svg>'
};
