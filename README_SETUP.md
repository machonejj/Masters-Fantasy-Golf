# 🏌️ Masters Fantasy Golf - Complete End-to-End Setup

## TL;DR - What's Wrong and How to Fix

### The Problem
**You have database setup issues** - The schema was partially run but critical data is missing:
- `draft_state` initial row (id=1) is **missing** 
- Golfers table is **empty**

### The Fix (2 minutes)
1. Open Supabase Dashboard
2. Run the SQL in **`supabase/repair.sql`**
3. Clear browser cookies
4. Sign up at http://localhost:3001
5. ✅ Done!

---

## Complete Setup Instructions

### Prerequisites
- [ ] Supabase project created: https://app.supabase.com/
- [ ] Project credentials in `.env.local` ✅ (already done)
- [ ] Next.js dev server running on port 3001 ✅ (already started)

### Phase 1: Fix the Database (2 min)

1. **Go to Supabase Dashboard**
   - https://app.supabase.com/projects
   - Click your project

2. **Go to SQL Editor**
   - Left sidebar → SQL Editor
   - Click "New query"

3. **Copy the repair script**
   - Open file: `supabase/repair.sql`
   - Copy **ALL** the contents
   - Paste into Supabase query window

4. **Run it**
   - Click the blue "Run" button
   - You should see output like:
     ```
     draft_state | 1
     golfers     | 24
     participants | 4
     picks        | 24
     ```

5. **Verify it worked**
   ```bash
   node check-setup.js
   ```
   Should output: `✅ DATABASE IS READY`

### Phase 2: Test Authentication (3 min)

1. **Clear browser cache for localhost**
   - Open DevTools (F12 or Cmd+Option+I)
   - Application/Storage tab
   - Cookies → localhost:3001
   - Delete all cookies

2. **Visit the app**
   - Go to http://localhost:3001
   - Should redirect to `/login`

3. **Sign Up (Create First Admin)**
   - Click "Sign Up" tab
   - Enter:
     - Display Name: `Your Name` (any name)
     - Email: `admin@test.com` (or your email)
     - Password: `password123` (at least 6 chars)
   - Click "Create Account"

4. **You should see:**
   - ✅ Redirect to home page (`/`)
   - ✅ Leaderboard with 4 demo teams
   - ✅ 24 golfers listed with scores
   - ✅ Scores calculated per team

### Phase 3: Use Admin Features (5 min)

1. **Go to Admin Tab**
   - Click "Admin" button in navigation
   - You should be admin (first signup = auto-admin)

2. **Explore Options**
   - **Add Participants**: Add real players
   - **Randomize Draft**: Shuffle draft order
   - **Start Draft**: Begin snake draft
   - **Live Scores**: Fetch real ESPN scores
   - **Invite Players**: Generate codes for others

3. **Invite Other Players**
   - Share URL: http://localhost:3001
   - They sign up normally (not as admin)
   - Auto-added to participants list

---

## File Guide

### Key Files
| File | Purpose |
|------|---------|
| `src/app/login/page.js` | Sign In / Sign Up UI |
| `src/app/page.js` | Main leaderboard |
| `src/app/admin/page.js` | Admin panel |
| `src/lib/usePoolData.js` | Loads all pool data |
| `supabase/schema.sql` | Database structure |
| `supabase/repair.sql` | **Fix the database** ← RUN THIS NOW |
| `.env.local` | Supabase credentials |

### Documentation
| File | Purpose |
|------|---------|
| `SETUP_GUIDE.md` | Detailed setup walkthrough |
| `FIX_DATABASE.md` | Database-specific fixes |
| `README_WHICH_APP.md` | Explains Next.js vs HTML app |
| `check-setup.js` | Diagnostic tool |

---

## Troubleshooting

### "Sign up gives 429 rate limit error"
- Wait a few minutes
- Or use a different email

### "Leaderboard loads but no teams/golfers shown"
- Didn't run repair.sql
- Check: `node check-setup.js`

### "Can't access Admin features"
- You're not the first signup (not admin)
- Ask the real admin to promote you

### "Live scores not updating"
- Make sure you clicked "Start Live Scores" in Admin tab
- It fetches every 60 seconds

### "Network errors in DevTools"
- Check browser console (F12 → Console tab)
- Look for red error messages
- Run `node check-setup.js` to diagnose

---

## Development

### Run the app
```bash
npm run dev
# Opens on http://localhost:3001
```

### Check database status
```bash
node check-setup.js
```

### View Supabase logs
- Dashboard → Logs (right sidebar)
- Look for auth/API errors

### Database structure
- Dashboard → Table Editor (left sidebar)
- View all tables and their data

---

## Deployment to Production

When ready to deploy on Vercel:

1. **Set environment variables**
   ```
   NEXT_PUBLIC_SUPABASE_URL
   NEXT_PUBLIC_SUPABASE_ANON_KEY
   SUPABASE_SERVICE_ROLE_KEY
   CRON_SECRET (optional, for auto-pick)
   ```

2. **Run schema on production database**
   - Supabase → SQL Editor → Run `schema.sql`

3. **Seed production data**
   - Run `repair.sql` to create demo data
   - Or `seed.sql` for full demo

4. **Deploy**
   ```bash
   vercel --prod
   ```

---

## Support

If something still doesn't work:

1. **Run the diagnostic**
   ```bash
   node check-setup.js
   ```

2. **Check browser console** (F12 → Console tab)

3. **Check Supabase logs**
   - Dashboard → Logs

4. **Review error messages carefully** - they usually tell you exactly what's wrong

---

## Architecture Overview

```
┌─────────────────────────────────────────┐
│         Your Browser                    │
│  http://localhost:3001                  │
│  (Next.js React App)                    │
└────────────┬────────────────────────────┘
             │ HTTP Requests
             │ (via usePoolData hook)
             ▼
┌─────────────────────────────────────────┐
│    Next.js Server (port 3001)           │
│  - /api/* routes (for admin only)       │
│  - /login page (auth UI)                │
│  - /page (leaderboard)                  │
│  - /admin (admin panel)                 │
└────────────┬────────────────────────────┘
             │ Supabase Client/Server
             │ (via SDK)
             ▼
┌─────────────────────────────────────────┐
│       Supabase Project                  │
│  xrwbvyitkttekhdgulwk.supabase.co       │
│                                         │
│  PostgreSQL Database Tables:            │
│  - draft_state (pool settings)          │
│  - profiles (users)                     │
│  - participants (teams)                 │
│  - golfers (field)                      │
│  - picks (draft results)                │
│                                         │
│  Auth:                                  │
│  - First signup = admin                 │
│  - Verified via trigger                 │
└─────────────────────────────────────────┘
```

---

## Next Steps

✅ **Right now:**
1. Run `supabase/repair.sql` in Supabase
2. Verify with `node check-setup.js`
3. Sign up at http://localhost:3001

✅ **Then:**
1. Add real participants
2. Randomize draft order
3. Enable live scores
4. Invite other players

✅ **Finally:**
1. Deploy to Vercel
2. Share with friends
3. Enjoy the draft!

---

**Questions?** Check the relevant markdown file above for detailed info on that topic.

**Still stuck?** Run `node check-setup.js` and share the output - it usually shows exactly what's wrong.
