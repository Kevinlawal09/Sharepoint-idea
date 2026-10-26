# Connecting the intranet to Microsoft 365

This turns on three things:

- **Sign in with Microsoft** replaces the "enter your name" screen.
- **Org Directory** shows real staff from Microsoft 365: name, title, department, email, phone and photo.
- **Events** come from a shared Outlook calendar. Clicking **RSVP** adds the event to the person's own Outlook calendar, and clicking again removes it.

Setup has four steps. Step 1 has to be done by someone who can register apps in UWPBC's Microsoft Entra admin center, and step 2 by someone who can grant admin consent. That's usually IT. Steps 3 and 4 happen on the computer running the intranet.

## 1. Register the app (Entra admin center)

1. Go to https://entra.microsoft.com, then **Identity → Applications → App registrations → New registration**.
2. Fill in the form:
   - **Name:** `UWPBC Intranet`
   - **Supported account types:** *Accounts in this organizational directory only (single tenant)*
   - **Redirect URI:** choose platform **Web** and enter `http://localhost:4100/auth/callback`
3. Click **Register**. On the Overview page, copy the **Application (client) ID** and the **Directory (tenant) ID**.
4. Go to **Certificates & secrets → New client secret**. Give it a description such as `intranet` and pick an expiry, then copy the **Value** right away, because it's only shown once.

## 2. Add permissions and grant consent

Go to **API permissions → Add a permission → Microsoft Graph → Delegated permissions** and add these:

| Permission | Why | Admin consent required? |
|---|---|---|
| `User.Read` | Sign the person in and read their own profile | No |
| `User.ReadBasic.All` | Read the staff directory: names, emails, photos | No |
| `Calendars.Read.Shared` | Read the shared events calendar | No |
| `Calendars.ReadWrite` | Add or remove an RSVP'd event on the person's own calendar | No |
| `offline_access`, `openid`, `profile`, `email` | Standard sign-in scopes | No |

None of these needs an admin. Each person approves them the first time they sign in. If UWPBC has turned off user consent, sign-in shows "Need admin approval", and an admin has to click **Grant admin consent** on this page.

**Full directory (optional, admin only).** To also show titles, departments and phone numbers, an admin adds `User.Read.All` (Delegated) and clicks **Grant admin consent for United Way of Palm Beach County**. Then set `MS_FULL_DIRECTORY=true` in `.env` and restart the server.

All of these are *delegated* permissions. The intranet only sees and changes what the signed-in person could see and change in Outlook themselves.

## 3. Set up the shared events calendar (optional)

Skip this step to keep using the sample events.

1. In the Exchange admin center, create a **shared mailbox** such as `events@unitedwaypbc.org`. Shared mailboxes don't need a license.
2. Open that mailbox's calendar in Outlook, go to **Sharing permissions**, and share it with an all-staff group at **Can view all details**. Give the people who post events **Can edit**.
3. Add events to that calendar. The intranet shows the next 60 days.

## 4. Configure and run

1. Copy `.env.example` to `.env` in this folder.
2. Fill in `MS_TENANT_ID`, `MS_CLIENT_ID`, `MS_CLIENT_SECRET`, and, if you did step 3, `MS_EVENTS_CALENDAR`.
3. Start the server with `node server.js`. The startup log should say `Microsoft 365: connected`.
4. Open http://localhost:4100 and click **Sign in with Microsoft**.

`.env` is gitignored. **Never commit the client secret**, and never paste it into chat or email.

## Notes and limits

- **Sign-ins don't survive restarts.** Sessions live in memory, so restarting the server signs everyone out.
- **Other computers.** To serve the intranet anywhere other than `localhost`, add that address as another redirect URI in step 1 (for example `https://intranet.example.org/auth/callback`). Then set `MS_REDIRECT_URI` to match it. Use HTTPS for anything other than localhost.
- **Directory caching.** The directory is cached for 10 minutes and photos for the life of the server. New hires show up within 10 minutes.
- **What RSVP does.** RSVP copies the event to the person's calendar; it doesn't make them an attendee of the original event. If the organizer changes the time later, the copy won't update.
- **Fallback.** If anything fails, such as a missing consent, a wrong mailbox or Microsoft being down, the page says so and falls back to the sample data.
