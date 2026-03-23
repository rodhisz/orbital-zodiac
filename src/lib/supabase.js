import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn('⚠️ Supabase URL or Anon Key is missing. Please check your environment variables in Vercel.')
}

// Inisialisasi hanya jika variabel tersedia, atau gunakan string kosong untuk menghindari crash saat inisialisasi modul
// Supabase JS akan melempar error saat createClient dipanggil dengan data tidak lengkap, 
// jadi kita bungkus dengan penanganan sederhana jika diperlukan, 
// tapi di Vite/Vercel, solusi utamanya adalah memasukkan variabel ke Dashboard Vercel.
export const supabase = (supabaseUrl && supabaseAnonKey) 
  ? createClient(supabaseUrl, supabaseAnonKey) 
  : null;
