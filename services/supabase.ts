import { createClient } from '@supabase/supabase-js';

// 1. Tenta configurações dinâmicas salvas no LocalStorage (painel Admin)
const localConfig = localStorage.getItem('facefind_db_config');
let customUrl = '';
let customKey = '';

if (localConfig) {
  try {
    const parsed = JSON.parse(localConfig);
    customUrl = parsed.url;
    customKey = parsed.key;
  } catch (e) {
    console.error("Erro ao ler config do banco", e);
  }
}

// 2. Variáveis de ambiente (Vercel)
const envUrl = (import.meta as any).env?.VITE_SUPABASE_URL;
const envKey = (import.meta as any).env?.VITE_SUPABASE_ANON_KEY;

// 3. Fallback Hardcoded (Segurança de último caso)
const FALLBACK_URL = 'https://yzuahgbgzfdzvigesbtl.supabase.co';
const FALLBACK_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inl6dWFoZ2JnemZkenZpZ2VzYnRsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQxMTU2NTAsImV4cCI6MjA3OTY5MTY1MH0.thj8G3HX39eRHifqH8mGZ6IAerzm4qJ2_OcL8uW3iSU';

// Prioridade: Custom (Painel) > Env (Vercel) > Fallback (Hardcoded)
const supabaseUrl = customUrl || envUrl || FALLBACK_URL;
const supabaseKey = customKey || envKey || FALLBACK_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('CRITICAL: Supabase keys missing completely.');
}

export const supabase = createClient(supabaseUrl, supabaseKey);

// Helper para saber se estamos usando config customizada
export const isUsingCustomConfig = !!customUrl;

// Helper para pegar a config atual
export const getCurrentConfig = () => ({
  url: supabaseUrl,
  key: supabaseKey
});