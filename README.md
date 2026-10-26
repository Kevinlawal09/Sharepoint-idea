# UWPBC Intranet Concept — Local Prototype

A fully clickable, locally-hosted mockup of the "modernized, community-style" UWPBC
intranet concept (hero, personalized news, department pages, a kudos wall, an idea
exchange, events with RSVP, an org directory, and IT ticket / PTO request forms).
Every page here actually works — it's a real local web app, not a static image — but
it's a standalone concept for a pitch, unrelated to the Platform Trails training app
in `../prototype`.

It reuses the real UWPBC brand tokens and logo from the Platform Trails prototype
(`../prototype/public/styles.css`) so it looks and feels consistent with what's
already built.

## Run it

```
node server.js
```

Then open **http://localhost:4100** (set `PORT=xxxx` to use a different port).

Enter any name at the welcome screen — it's a lightweight local "login" so kudos,
idea votes, RSVPs, tickets, and PTO requests can be attributed to you. Progress is
shared across anyone who opens this URL on your machine or network, the same way
the training prototype works.

## Connect to Microsoft 365 (optional)

With a `.env` file holding an Entra app registration, the name screen becomes
**Sign in with Microsoft**. The Org Directory then shows real staff (with photos),
and Events come from a shared Outlook calendar, where RSVP adds the event to your
own Outlook. Setup steps are in [MICROSOFT-SETUP.md](MICROSOFT-SETUP.md). Without a
`.env`, everything runs on sample data as described below.

## What's real vs. illustrative

- **Fully functional:** navigation between every page, the kudos wall (post + star),
  the idea exchange (submit + vote, one vote per person), event RSVPs, the IT ticket
  form, and the PTO request form — all persisted to `data/db.json` on this machine.
- **Illustrative / sample data:** department news posts, the campaign spotlight
  numbers, and the staff directory (`public/content.js`) are placeholder content for
  the concept pitch, not real UWPBC data.

## Structure

| File | Purpose |
|---|---|
| `server.js` | Zero-dependency Node HTTP server — static files + a small JSON API |
| `microsoft.js` | Optional Microsoft 365 connection: sign-in, live directory, Outlook events (Microsoft Graph) |
| `.env.example` | Template for the Microsoft settings — copy to `.env` (gitignored) |
| `data/db.json` | Auto-created on first run; stores kudos, ideas, event RSVPs, tickets, PTO requests |
| `public/content.js` | Static content: departments, news, staff directory, icons |
| `public/app.js` | Client-side hash-routed app — all page rendering and interactions |
| `public/styles.css` | Shared UWPBC design tokens and component styles |

Delete `data/db.json` at any time to reset the demo back to its seed data.
