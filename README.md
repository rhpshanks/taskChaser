# TaskChaser

Assign a task, send one email, and let the answer update your dashboard.

Most task trackers fail for the same reason: the people doing the work never log in. TaskChaser
turns that around. Your team never sees the app. They get an ordinary email with three links in it,
and whichever one they tap lands on your board within a second.

```
You type          →  "write brief today at 4pm"
You assign        →  Sara Khan
You click         →  Inform via Email       (Outlook opens, already written)
Sara taps         →  Task Ready | Need Time | Escalation
Your board        →  updates itself, no refresh
```

---

## Quick start

```bash
npm install
```

```bash
npm run build
```

```bash
npm start
```

Then open <http://localhost:4000>.

Sign in with your name, title and email. There is no password step: signing in with the same email
later reopens the same board.

### While developing

```bash
npm run dev
```

Runs the API on `:4000` and the Vite dev server on `:5173` with hot reload. The dev server proxies
both `/api` and `/r`, so the whole email round trip works against `http://localhost:5173` too.

---

## Storage

TaskChaser talks to storage through a small adapter, and picks one at startup:

| When | Backend | Durable |
| --- | --- | --- |
| `INSTANT_APP_ID` and `INSTANT_ADMIN_TOKEN` are set | InstantDB | Yes |
| Neither is set, running normally | `server/data/taskchaser.json` | Yes |
| Neither is set, running serverless | `/tmp`, wiped on recycle | **No**, the app says so in a banner |

The dashboard's **Live** pill names the active backend in its tooltip, so you can
always tell which one you are on.

### Using InstantDB

Set the two variables, locally in `.env` or on your host:

```bash
INSTANT_APP_ID=your-app-id
INSTANT_ADMIN_TOKEN=your-admin-token
```

The App ID is public and safe to share. **The admin token is a secret**: it grants full read and
write over the whole app. Keep it out of version control, and rotate it in the Instant dashboard if
it ever leaks.

The app writes to four namespaces: `owners`, `members`, `tasks` and `events`. It is called `owners`
rather than `users` to keep it clearly apart from Instant's own `$users`, which belongs to Instant's
auth and is not used here.

Instant accepts writes without a schema, so this runs as-is. Pushing the included schema is still
worth it: it indexes the fields every request filters on (looking a task up by its `responseToken`
happens on every tap of an email link) and makes `owners.email` unique, so two simultaneous sign-ins
with one address cannot produce two workspaces.

```bash
npx instant-cli@latest push schema
```

Instant does not replace the API. The server stays in front of it with the admin SDK, because
sign-in here is identity-only by design and letting the browser hold database credentials would let
anyone read every workspace.

---

## Deploying to Vercel

The repo carries `vercel.json` and `api/index.js`, so Vercel builds the dashboard to its CDN and
runs the API and the email-link pages as one function. Import the repo and it deploys with no
settings to fill in.

`PUBLIC_BASE_URL` is optional there: the server uses your project's production domain automatically,
which matters because links sitting in someone's inbox must keep working after your next push.

### Set the storage variables, or the data will not survive

Vercel's filesystem is read-only apart from `/tmp`, and that `/tmp` belongs to one instance that is
wiped when it recycles. Add both Instant variables in **Project Settings → Environment Variables**:

```
INSTANT_APP_ID       = your-app-id
INSTANT_ADMIN_TOKEN  = your-admin-token
```

Without them the app still boots and can be clicked through, but it stores everything in `/tmp` and
shows a banner telling you the data will disappear.

Live updates degrade gracefully on serverless: the SSE stream is cut off at the function timeout and
a reply handled by one instance never reaches a dashboard held open by another, so the client also
polls every 8 seconds. Updates arrive either way, just a few seconds later rather than instantly.

---

## Making the email links work for other people

This is the one bit of setup that matters.

The three buttons in the email are links back to this server. By default they point at
`http://localhost:4000`, which only resolves on **your own machine**. Your colleague tapping that
link on their phone will get nothing.

Set `PUBLIC_BASE_URL` to an address they can actually reach:

| Situation | Value to use |
| --- | --- |
| Testing on your own machine | `http://localhost:4000` (the default) |
| Team on the same office network | `http://192.168.1.20:4000`, your machine's LAN IP |
| Deployed on Vercel | Nothing to set, the production domain is detected |
| Anywhere else | The public HTTPS URL where you host this |

```bash
PUBLIC_BASE_URL=http://192.168.1.20:4000 npm start
```

Copy `.env.example` to `.env` for the full list of settings.

**Outlook**: clicking *Inform via Email* uses a `mailto:` link, so it opens whichever app Windows
has set as the default mail client. If nothing opens, set Outlook as default under
*Settings → Apps → Default apps*. The dialog that appears also has a **Copy email text** button, so
you are never stuck.

---

## Writing tasks in plain English

The task box reads dates out of what you type and shows you what it understood before you commit.
Anything it does not recognise simply stays in the title, so it never invents a deadline.

| You type | Due date |
| --- | --- |
| `write brief today at 4pm` | today, 16:00 |
| `send invoices tomorrow` | tomorrow, 17:00 |
| `review PR by friday` | the coming Friday, 17:00 |
| `retro next tuesday at 11am` | Tuesday next week, 11:00 |
| `ping the vendor in 2 hours` | two hours from now |
| `close the sprint eow` | Friday, 18:00 |
| `submit filing 25 aug at 3pm` | 25 August, 15:00 |
| `call vendor at 4` | today, 16:00 (work hours are assumed) |
| `ship deck !high tomorrow 9am` | tomorrow 09:00, priority High |

A bare day means 17:00. `tonight` means 20:00, `eod` 18:00. A time with no day rolls to tomorrow if
it has already passed. `urgent`, `asap` and `!high` / `!low` set priority and drop out of the title.

### Keyboard

| Key | Does |
| --- | --- |
| `n` | Jump to the new-task box |
| `/` | Jump to search |
| `Esc` | Close the task panel or dialog |

---

## What the statuses mean

| Status | Set by | Meaning |
| --- | --- | --- |
| Unassigned | you | Written down, nobody owns it |
| Assigned | you | Has an owner, they have not been told |
| Awaiting | you | Email sent, no answer yet |
| Ready | **them** | Tapped *Task Ready* |
| Need time | **them** | Tapped *Need Time* |
| Escalation | **them** | Tapped *Escalation* |
| Done | you | Closed off |

Re-assigning a task clears any previous answer, so a stale "Ready" from the last owner can never sit
on someone else's name. Removing a team member releases their tasks back to unassigned rather than
deleting them.

After tapping, the landing page lets them add a short note (a new ETA, what they are blocked on) and
change their answer if they hit the wrong one. Both show up on your board.

---

## Layout

```
taskchaser/
├── vercel.json           Build, routing and function config for Vercel
├── instant.schema.ts     InstantDB schema: indexes and uniqueness
├── api/index.js          Serverless entry: re-exports the Express app
├── server/               Express API + the pages the email links land on
│   └── src/
│       ├── index.js      Routes, auth, SSE broadcast
│       ├── db/           Storage adapters: picks InstantDB or the JSON file
│       ├── domain.js     Statuses and the three response actions
│       ├── email.js      Builds the mailto: draft
│       ├── pages.js      Standalone HTML for the response pages
│       ├── store.js      JSON file store with atomic writes
│       └── api.test.js   End-to-end tests for the whole flow
└── client/               React + TypeScript dashboard
    └── src/
        ├── store.tsx     App state, live updates, toasts
        ├── lib/          Date parsing and formatting (+ tests)
        └── components/   Sign in, overview, tasks, team, drawer
```

The dashboard stays current over Server-Sent Events (`/api/stream`), which is why a reply appears
without anyone hitting refresh. The connection status is the **Live** pill in the top right.

Data lives in one file: `server/data/taskchaser.json`. Back it up by copying it. Delete it to start
over.

---

## Tests

```bash
npm test
```

28 tests: the date parser against every phrase in the table above, and the server driven end to end
(sign in, add a member, create and assign a task, send the email, tap a response link, and confirm
the dashboard reflects it).

The suite always runs against the JSON file store and never reaches a live database, even if Instant
credentials happen to be set in your environment.

---

## Worth knowing before you rely on it

- **Sign-in is identity, not security.** The brief called for name, title and email with no password,
  so that is what this does. Anyone who can reach the server can claim an identity. Run it on a
  trusted network, or put real authentication in front of it before exposing it publicly.
- **Response links are unguessable but not secret.** Each task carries a random token. Anyone with
  the link can answer, which is the point (no login for your team), but it does mean a forwarded
  email lets someone else answer on their behalf.
- **Mail is sent by you, not by the app.** Nothing is sent in the background. The message opens in
  your mail client so the thread stays in your mailbox, and you can edit it before sending.
