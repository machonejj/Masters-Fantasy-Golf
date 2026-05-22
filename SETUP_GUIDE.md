# Masters Fantasy Golf - Complete Setup Guide

## Prerequisites
- Supabase project created and credentials in `.env.local` ✓
- Next.js dev server running on port 3001 ✓

## Step 1: Verify/Run the Database Schema

1. Go to your **Supabase Dashboard**
2. Navigate to **SQL Editor**
3. Click **New query** and copy the entire contents of `supabase/schema.sql`
4. Paste and run it
5. **It's safe to re-run** - it drops and recreates everything

**What this does:**
- Creates `profiles`, `draft_state`, `golfers`, `participants`, `picks` tables
- Sets up Row Level Security (RLS) policies
- Creates trigger for new users to automatically become admin (if first user)

## Step 2: Seed Demo Data (Golfers & Sample Teams)

1. Create another **New query** in SQL Editor
2. Copy the entire contents of `supabase/seed.sql`
3. Paste and run it
4. **This is re-runnable** - safely recreates demo data each time

**What this does:**
- Inserts 24+ golfers with scores/rankings
- Creates 4 sample team participants
- Pre-populated draft picks
- Gives you immediate data to see on the leaderboard

## Step 3: Test the Auth Flow

### First User (Admin)
1. Visit http://localhost:3001
2. You should be on `/login` page
3. Click **Sign Up**
4. Enter:
   - Display Name: `John Doe` (or any name)
   - Email: `admin@test.com`
   - Password: `password123`
5. Click **Create Account**

**What should happen:**
- Account created in Supabase Auth
- Trigger automatically creates `profile` row with `is_admin = true` (first user)
- You're redirected to `/` (home page)
- Page loads the leaderboard with demo teams and their scores

### If You See an Error
Check the browser console (F12 → Console tab) for error messages. Common issues:

| Error | Solution |
|-------|----------|
| `"No profiles found"` | Schema hasn't been run - go back to Step 1 |
| `"No golfers found"` | Seed data hasn't been run - go back to Step 2 |
| `"Not authenticated"` | Clear cookies: DevTools → Storage → Cookies, delete all for localhost |
| Rate limit error | Wait a few minutes, or use a different test email |

## Step 4: Admin Features

Once logged in as admin:

1. **Add Participants**: Click Admin tab → "Add" new players
2. **Randomize Draft Order**: Shuffle the draft positions
3. **Start Draft**: Initialize the snake draft
4. **Generate Codes**: Create personal codes for each player to enter
5. **Live Scores**: Start ESPN live score fetching (runs every 60s)

## Step 5: Invite Other Players

Each player needs:
1. The app URL: `http://localhost:3001` (or production URL)
2. Their personal code from the Admin panel

They sign up with:
- Display Name
- Email
- Password

Then they join the pool with their code.

## Troubleshooting

### "Enter Pool Spins Forever"
1. Open browser DevTools (F12)
2. Go to **Network** tab
3. Try to enter the pool and watch network requests
4. Look for red/failed requests
5. Check **Console** tab for error messages

### "Golfers Not Loading"
- Seed data wasn't run - execute `supabase/seed.sql`

### "Can't Create Account"
- Check email format
- Verify Supabase auth is enabled
- Look at Supabase Auth logs

### "Everything Loads But No Data Appears"
- Refresh page (F5)
- Check that seed data was actually inserted:
  - Supabase Dashboard → Table Editor
  - Should see rows in: `golfers`, `participants`, `draft_state`

## Production Deployment

When deploying to Vercel:
1. Set environment variables in Project Settings:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY` (this is secret - server only)
2. Make sure the production Supabase database has the schema + seed data run once
3. Deploy with `vercel --prod`

## Key Files

- **`src/app/login/page.js`** - Authentication UI (Sign In / Sign Up)
- **`src/app/page.js`** - Main leaderboard page
- **`src/app/admin/page.js`** - Admin panel
- **`src/lib/usePoolData.js`** - Loads and syncs all pool data
- **`src/lib/auth.js`** - Server-side auth helpers
- **`supabase/schema.sql`** - Database structure
- **`supabase/seed.sql`** - Sample data

