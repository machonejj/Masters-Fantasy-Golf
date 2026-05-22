# Important: You Have Two Apps - Use the Next.js One

## The Problem
Your project has **TWO different implementations**:

1. **Static HTML file** (`index (3).html`) ❌ **DO NOT USE**
   - Old implementation, expects wrong database schema
   - Has "Enter Pool →" button that doesn't work
   - Tries to access non-existent `pools` table

2. **Next.js app** (`src/app/`) ✅ **USE THIS ONE**  
   - Modern, proper implementation
   - Uses correct `draft_state` table from your schema
   - Runs on http://localhost:3001

## Why "Enter Pool" Spins

If you're seeing the static HTML file with the "Enter Pool" button spinning:
- The button tries to create a pool in a non-existent `pools` table
- The request fails silently because the table doesn't exist
- Nothing happens, spinner keeps going

## Solution: Delete the Static HTML File

You should **remove or archive** the static HTML file since it's obsolete:

```bash
cd /Users/macbookair/masters-fantasy-golf
# Backup if you want to keep it
mv "index (3).html" "index (3).html.old"
```

## What You Should Be Using Instead

Access the **Next.js app** at:
```
http://localhost:3001
```

This app:
- ✅ Uses the correct database schema
- ✅ Has proper authentication with Supabase Auth
- ✅ Admin features work correctly
- ✅ Real-time data sync
- ✅ Can be deployed to Vercel

## How the Next.js App Works (No Manual Pool Creation)

1. **First user signs up** → automatically becomes admin
2. **Go to Admin tab** → add participants, start draft, etc.
3. **No "Enter Pool" button needed** - you're already in the pool once authenticated

This is much cleaner than the HTML version's PIN/code system.

