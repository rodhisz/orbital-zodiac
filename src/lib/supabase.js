import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl) {
  console.warn('⚠️ VITE_SUPABASE_URL is missing in environment variables.')
}
if (!supabaseAnonKey) {
  console.warn('⚠️ VITE_SUPABASE_ANON_KEY is missing in environment variables.')
}

// Inisialisasi hanya jika variabel tersedia
export const supabase = (supabaseUrl && supabaseAnonKey) 
  ? createClient(supabaseUrl, supabaseAnonKey) 
  : null;
