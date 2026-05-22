# ⛳ Masters Fantasy Golf

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fmachonejj%2Fmasters-fantasy-golf&env=NEXT_PUBLIC_SUPABASE_URL,NEXT_PUBLIC_SUPABASE_ANON_KEY,SUPABASE_SERVICE_ROLE_KEY,ADMIN_ACCESS_CODE,CRON_SECRET&envDescription=Supabase%20project%20keys%2C%20an%20admin%20access%20code%2C%20and%20a%20random%20CRON_SECRET&envLink=https%3A%2F%2Fgithub.com%2Fmachonejj%2Fmasters-fantasy-golf%2Fblob%2Fmain%2F.env.local.example)

A full-stack fantasy golf pool built with **Next.js (App Router)**, **Supabase**, and
**Tailwind CSS** in a Masters green-and-gold theme.

- **Code-based login** — no emails or passwords. You set a secret **admin code**;
  each player logs in with a short **player code** the admin generates for them.
- **Draft Room** — snake draft with a 1-hour pick clock that **auto-picks the best
  available golfer** when the timer expires.
- **Leaderboard** — standings using the **best 3 of 6** golfer scores per team.
- **My Team** — your personal roster, team score, and standing.
- **Golfers** — the full field with **live scoring** pulled from ESPN.
- **Admin panel** — manage participants, start / pause / resume / reset the draft,
  edit scores, load the field, and tune pool settings.

## Stack

| Layer        | Choice                                                   |
| ------------ | -------------------------------------------------------- |
| Framework    | Next.js 14 (App Router, JavaScript)                      |
| Auth + DB    | Supabase (Postgres, Auth, Realtime, RLS)                 |
| Styling      | Tailwind CSS                                             |
| Live scores  | ESPN public golf leaderboard API (no key needed)         |

Reads happen client-side with the anon key (RLS allows authenticated reads + realtime).
All **writes** go through Next.js API routes that validate the caller server-side and
use the Supabase **service-role key** to bypass RLS — so turn order and admin rules
can't be spoofed from the browser.

## Setup

### 1. Create the database

In your Supabase project: **SQL Editor → New query**, paste the contents of
[`supabase/schema.sql`](supabase/schema.sql), and run it. This creates the tables
(`profiles`, `participants`, `golfers`, `picks`, `draft_state`), RLS policies, the
new-user trigger, and enables realtime.

### 2. Configure environment

```bash
cp .env.local.example .env.local
```

Fill in from **Supabase → Project Settings → API**:

```
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...      # server-only, never exposed to the browser
ADMIN_ACCESS_CODE=...              # secret code that grants admin (min 6 chars)
```

> **`ADMIN_ACCESS_CODE`** is the master key to the pool: whoever enters it at the
> login screen becomes the admin (it bootstraps the admin account on first use).
> Keep it private, and change it any time to rotate the admin login.

### 3. Run

```bash
npm install
npm run dev
```

Open <http://localhost:3000>.

## First-run checklist

1. **Log in as admin** — go to the login screen and enter your `ADMIN_ACCESS_CODE`.
   This bootstraps the admin account and drops you into the **Admin** panel.
2. **Admin → Field & Scores → Load default field** (seeds the 144-golfer Masters field).
3. **Admin → Players** — add each player by name. Every player you add gets a unique
   **login code**; copy it (click the code) and share it with that person.
4. **Shuffle order** to randomize the snake order.
5. **Admin → Draft Controls → Start Draft.** Each pick has a 1-hour clock.
6. During the tournament, **Admin → Pull live scores (ESPN)** to update standings,
   or edit any golfer's rounds/status by hand.

> Players just visit the site and enter their code — no sign-up, email, or password.
> Anyone who knows the `ADMIN_ACCESS_CODE` has admin access, so guard it.

### Want to see it populated right away?

Run [`supabase/seed.sql`](supabase/seed.sql) in the SQL editor. It creates 4 demo
teams, a 24-golfer scored field, and a completed snake draft so the Leaderboard
and Golfers pages have real data. (Demo teams have no login codes — they're just
for viewing; add real players from **Admin → Players** to hand out codes.)

## Deploy

### One-click (Vercel)

Click the **Deploy with Vercel** button at the top. Vercel clones the repo and prompts
for the four env vars (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
`SUPABASE_SERVICE_ROLE_KEY`, `CRON_SECRET`). After it deploys:

1. Run [`supabase/schema.sql`](supabase/schema.sql) in your Supabase project (once).
2. The cron in [`vercel.json`](vercel.json) auto-registers and starts hitting
   `/api/draft/tick` (per-minute schedule needs the Vercel Pro plan).

### Free scheduler (GitHub Actions)

If you're on Vercel Hobby (crons run only once a day) or host elsewhere, use the
included workflow [`.github/workflows/draft-autopick.yml`](.github/workflows/draft-autopick.yml)
instead — it pokes the tick endpoint every ~5 minutes for free. In your repo settings:

- **Settings → Variables → Actions** → add `APP_URL` = `https://your-app.vercel.app`
- **Settings → Secrets → Actions** → add `CRON_SECRET` = the same value as the app's env

Then enable the workflow (Actions tab). You can also trigger it manually with
**Run workflow**. Either scheduler is enough — you don't need both.

## How the pick timer works

When a pick clock expires, the server auto-drafts the lowest-ranked available golfer.
This is driven by `/api/draft/tick`, which is idempotent and only acts when the deadline
has actually passed. The Draft Room pings it (POST) every few seconds while open, so
timeouts resolve as long as **someone** has the page open.

For a **fully unattended draft**, [`vercel.json`](vercel.json) registers a Vercel Cron
job that hits `GET /api/draft/tick` every minute. Set a `CRON_SECRET` env var in your
Vercel project — Vercel then sends it as a Bearer token and the endpoint requires it to
match. (Per-minute crons need the Vercel Pro plan; Hobby runs crons once a day.) Any
scheduler that can GET that URL with the bearer token works just as well.

## Scoring

Each round value may be entered as **to-par** (e.g. `-3`, `2`) or **raw strokes**
(e.g. `69`); any value over 30 is treated as raw strokes and converted with the course
par. A team's score is the sum of its **best N** golfer totals (default best 3 of 6).
**Cut / withdrawn** golfers score the configured cut penalty (default +16).

## Project structure

```
src/
  app/
    layout.js                 root layout + nav + auth-gated shell
    page.js                   Leaderboard (home)
    login/page.js             single access-code login (player + admin)
    draft/page.js             Draft Room (snake order, timer, auto-pick)
    team/page.js              My Team
    golfers/page.js           Golfers + live scoring
    admin/page.js             Admin panel (incl. add players → generate codes)
    api/
      auth/resolve-code       turn a code into a login; bootstrap/rotate admin
      draft/pick              make a pick (turn-validated)
      draft/tick              auto-pick on timeout (idempotent)
      draft/control           admin: start/pause/resume/reset/settings
      admin/participants      admin: add player (+code) / remove / reorder / codes
      admin/golfers           admin: seed/add/edit/delete + ESPN sync
      golfers/live            live ESPN leaderboard proxy
  lib/
    supabase/{client,server,admin,middleware}.js
    access-codes.js           code generation + hidden-login derivation (server)
    scoring.js                golferTotal / teamData / formatting
    draft.js                  snake order + best-available helpers
    draft-server.js           shared draft-advance logic
    espn.js                   ESPN leaderboard fetch + normalize
    usePoolData.js            client hook: load + realtime + poll
    auth.js                   server-side session / admin guards
  middleware.js               session refresh + route guard
supabase/schema.sql           database schema + RLS + triggers
supabase/seed.sql             optional demo data (teams, scores, finished draft)
vercel.json                   Vercel Cron → /api/draft/tick (unattended auto-pick)
.github/workflows/
  draft-autopick.yml          free GitHub Actions scheduler (alt to Vercel Cron)
```
