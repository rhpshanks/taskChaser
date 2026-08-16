# TaskChaser

A ledger of what other people owe you, and the chasers that collect it.

Every task app tracks *your* tasks. Nobody tracks what other people agreed to do,
because the other person will never log into your tool. TaskChaser is built the
other way round: the person who owes you something needs no account, no install,
and no login. They get an email with three buttons, and one tap sends the answer back.

Runs entirely in the browser. No server, no build step, no dependencies, no tracking.
All data stays in the visitor's own `localStorage`.

---

## What it does

| Part | Behaviour |
|---|---|
| **One-line logging** | `Sara Khan <sara@example.com> send the venue photos by friday 3pm` parses into person, email, task, and date |
| **Ledger** | Live tally, seven filters, search, three sort modes, colour-coded state stripes |
| **Chaser engine** | A cadence of `-2 / 0 / +1 / +3 / +7` days around the agreed date, escalating through heads-up, due-day check, first chaser, second chaser, final chaser |
| **Tone presets** | Peer, client, and vendor registers, because writing a chaser is the part people avoid |
| **Sending** | Opens the chaser in your own mail app, pre-filled, so it lands from your address and threads normally |
| **Reply links** | Task ready / Need more time, pick a time and date / Task blocked, say why. No account for the recipient |
| **Reply codes** | The recipient's answer travels back as a short code that updates the ledger and writes a receipt trail |
| **Capture** | Rule-based extraction of commitments from pasted meeting minutes or chat logs |
| **Reliability** | Per-person score and a suggested date buffer, built from slips and chasers needed |
| **Digest** | Late, due this week, blocked, silent, and closed, ready to paste into a status update |

---

## In this repo

```
index.html          the page shell
assets/style.css    tokens, themes, layout, components
assets/app.js       the whole application: model, parsing, templates, views, events
vercel.json         static hosting config, clean URLs and cache headers
```

No framework, no bundler, no `package.json`. The three files are the program.

---

## Run it locally

Any static server works. With Python:

```bash
python -m http.server 8791
```

Then open `http://localhost:8791`.

Opening `index.html` straight off disk works too, but reply links will carry a
`file://` address that only resolves on your own machine. Serve it over HTTP to
test the recipient side properly.

---

## Deploy on Vercel

1. In Vercel, choose **Add New > Project** and import `rhpshanks/taskChaser`.
2. Framework preset: **Other**. Leave the build command and install command empty.
3. Root directory: `./`
4. Deploy.

Vercel serves `index.html` at the root. Nothing needs to be built.

**After the first deploy**, open the live site, go to **Settings**, and paste the
deployed address into *Link address for reply buttons*. Every chaser then points
its reply buttons at the live site instead of wherever you happened to be testing.

---

## How the loop runs today

1. Log what someone agreed to, with a date.
2. TaskChaser writes each chaser on schedule and queues it under **Chasers**.
3. You send it from your own mail app in one click, then press **Mark as sent**.
4. The recipient taps one of three buttons. No login, no account.
5. They land on a reply page that hands them a short code and a pre-written mail back to you.
6. You paste that code into **Apply reply code**, and the ledger updates itself with a full trail.

Steps 3 and 6 are manual because this is a static site with nothing behind it.
That is a deliberate starting point, not a limitation of the design: sending from
your own mailbox means chasers thread properly and do not look automated.

## Making it automatic

Two small services turn the loop hands-off, with no change to the logic already here:

- **Sending**: a scheduled job reads the chaser queue and posts each one through a
  transactional mail provider (Resend, Postmark). Set up SPF, DKIM, and DMARC on a
  real domain first; a chaser in the spam folder is worth nothing.
- **Replies**: point the reply links at an endpoint that records the answer directly,
  rather than handing the recipient a code to mail back. The payload in each link
  already carries everything that endpoint needs.

---

## Privacy

Nothing leaves the browser. There is no analytics, no account system, and no
network call of any kind. Clearing site data erases the ledger, so use
**Settings > Backup text** to keep a copy.

---

## Licence

Not yet chosen. Add one before sharing the deployed site widely.
