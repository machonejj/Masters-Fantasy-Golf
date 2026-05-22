# Database Setup Issues Found & How to Fix

## Problem Summary

Your app is not working because:

1. ❌ **draft_state table row is missing** - Schema was run but initial data insert failed
2. ❌ **Golfers table is empty** - Seed data was never loaded

## ✅ Step-by-Step Fix

### Step 1: Repair the Database

1. Open **Supabase Dashboard** → https://app.supabase.com/
2. Select your project (xrwbvyitkttekhdgulwk)
3. Go to **SQL Editor** (left sidebar)
4. Click **"New query"**
5. Copy the ENTIRE contents of this file: **`supabase/repair.sql`**
6. Paste it into the query window
7. Click the **blue "Run"** button
8. You should see output confirming everything was created:
   ```
   draft_state    | 1
   golfers        | 24
   participants   | 4
   picks          | 24
   ```

### Step 2: Verify the Fix

Run this command:
```bash
node check-setup.js
```

You should see:
```
✅ draft_state table exists
✅ golfers table exists (24 golfers)
✅ participants table exists (4 participants)
✅ picks table exists (24 picks)
```

### Step 3: Test the App

1. **Clear your browser cookies** (to reset any cached failed auth):
   - Open DevTools (F12)
   - Application/Storage tab
   - Cookies → localhost:3001 → Delete all

2. **Go to** http://localhost:3001

3. **Sign Up** (this creates the admin):
   - Display Name: `Admin`
   - Email: `admin@test.com`
   - Password: `password123`

4. **You should now see:**
   - The leaderboard with Team Alpha, Bravo, Charlie, Delta
   - 24 golfers with their scores
   - Draft picks already made

## If It Still Doesn't Work

Check the browser console (F12 → Console) for errors:

| Error Message | Solution |
|---|---|
| `"profiles" does not exist` | Run `supabase/schema.sql` first (the full schema, not just repair.sql) |
| `"golfers" returns empty` | The repair script didn't run properly - check for SQL errors when you ran it |
| `auth.uid() returned null` | Clear cookies and sign out/in again |
| Any other SQL error | Copy the error message and search for it in supabase/repair.sql comments |

## What repair.sql Does

1. **Ensures draft_state row exists** - Fixes the missing id=1 row
2. **Inserts 24 demo golfers** - All with realistic scores and statuses
3. **Creates 4 demo teams** - So you see immediate data on the leaderboard
4. **Pre-populates draft picks** - Simulates a completed snake draft
5. **Safe to re-run** - Uses `ON CONFLICT DO NOTHING` so it won't break if run again

## Next Steps After Setup Works

1. **Admin Tab** - Add real participants, randomize draft order
2. **Live Scores** - Enable ESPN live scoring to fetch real tournament data
3. **Invite Players** - Share the URL with other players; they sign up normally

## Files Involved

- `supabase/schema.sql` - Database structure (run once, safe to re-run)
- `supabase/repair.sql` - Fix missing data (run now to fix your issues)
- `supabase/seed.sql` - Alternative complete seed data (you don't need this if repair.sql works)
- `check-setup.js` - Diagnostic tool to verify setup status
