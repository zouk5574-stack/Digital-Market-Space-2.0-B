// src/config/supabase.js
import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY;

if (!supabaseUrl || !supabaseKey) {
  throw new Error('Missing Supabase environment variables');
}

export const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: true,
  },
  db: {
    schema: 'public'
  }
});

// Helper pour les erreurs Supabase
export const handleSupabaseError = (error, customMessage = 'Database error') => {
  console.error('Supabase Error:', error);
  
  if (error.code === 'PGRST116') {
    return { error: 'Resource not found' };
  }
  if (error.code === '23505') {
    return { error: 'Duplicate resource' };
  }
  if (error.code === '23503') {
    return { error: 'Invalid reference' };
  }
  
  return { error: customMessage };
};
