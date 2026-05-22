#!/usr/bin/env node
/**
 * Diagnostic script to check if Supabase schema and seed data are properly set up
 * Run with: node check-setup.js
 */

const SUPABASE_URL = 'https://xrwbvyitkttekhdgulwk.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inhyd2J2eWl0a3R0ZWtoZGd1bHdrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkxMjIwMDEsImV4cCI6MjA5NDY5ODAwMX0.Oj8AhDsJ7riQYuUX2-CBHkAe6FAs4HyqlKCsLzKY0qg';

(async () => {
  try {
    // Dynamically import Supabase
    const { createClient } = await import('@supabase/supabase-js');
    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

    console.log('\n🔍 Checking Masters Fantasy Golf Database Setup...\n');
    
    // Check draft_state
    const { data: draftState, error: dsErr } = await supabase
      .from('draft_state')
      .select('*')
      .eq('id', 1)
      .maybeSingle();
    
    if (dsErr) {
      console.log('❌ draft_state table missing or inaccessible');
      console.log(`   Error: ${dsErr.message}`);
    } else if (draftState) {
      console.log('✅ draft_state table exists');
      console.log(`   Status: ${draftState.status}`);
      console.log(`   Tournament: ${draftState.tournament_name}`);
    } else {
      console.log('⚠️  draft_state table exists but row id=1 not found');
    }

    // Check profiles
    const { data: profiles, error: pErr, count: pCount } = await supabase
      .from('profiles')
      .select('*', { count: 'exact' });
    
    if (pErr) {
      console.log('❌ profiles table missing or inaccessible');
      console.log(`   Error: ${pErr.message}`);
    } else {
      console.log(`✅ profiles table exists (${pCount} users)`);
    }

    // Check golfers
    const { data: golfers, error: gErr, count: gCount } = await supabase
      .from('golfers')
      .select('*', { count: 'exact' })
      .limit(1);
    
    if (gErr) {
      console.log('❌ golfers table missing or inaccessible');
      console.log(`   Error: ${gErr.message}`);
    } else if (gCount > 0) {
      console.log(`✅ golfers table exists (${gCount} golfers)`);
    } else {
      console.log('⚠️  golfers table exists but is empty - need to run seed.sql');
    }

    // Check participants
    const { data: participants, error: partErr, count: partCount } = await supabase
      .from('participants')
      .select('*', { count: 'exact' });
    
    if (partErr) {
      console.log('❌ participants table missing or inaccessible');
      console.log(`   Error: ${partErr.message}`);
    } else {
      console.log(`✅ participants table exists (${partCount} participants)`);
    }

    // Check picks
    const { data: picks, error: pickErr, count: pickCount } = await supabase
      .from('picks')
      .select('*', { count: 'exact' });
    
    if (pickErr) {
      console.log('❌ picks table missing or inaccessible');
      console.log(`   Error: ${pickErr.message}`);
    } else {
      console.log(`✅ picks table exists (${pickCount} picks)`);
    }

    console.log('\n📋 Summary:\n');
    
    const missingSchema = dsErr || pErr || gErr || partErr || pickErr;
    const missingData = gCount === 0;

    if (missingSchema) {
      console.log('❌ SCHEMA NOT SET UP - Run supabase/schema.sql in Supabase SQL Editor');
      console.log('   → Dashboard → SQL Editor → New query → Copy schema.sql → Run\n');
    }
    
    if (missingData && !missingSchema) {
      console.log('⚠️  SEED DATA MISSING - Run supabase/seed.sql in Supabase SQL Editor');
      console.log('   → Dashboard → SQL Editor → New query → Copy seed.sql → Run\n');
    }

    if (!missingSchema && !missingData) {
      console.log('✅ DATABASE IS READY - Schema and seed data are in place!');
      console.log('   You can now:');
      console.log('   1. Visit http://localhost:3001');
      console.log('   2. Sign up as the first user (becomes admin)');
      console.log('   3. See the demo data loaded\n');
    }

  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  }
})();
