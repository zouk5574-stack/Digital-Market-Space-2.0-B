// src/config/supabaseClient.js
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY; // ⚠️ utiliser le service role côté backend
export const supabase = createClient(supabaseUrl, supabaseKey);