import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  // Avís clar en consola en comptes d'un error críptic més endavant
  console.warn(
    '[Vincit Manager] Falten VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY. ' +
    'Crea un fitxer .env.local (mira .env.example).'
  )
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

// ---------------------------------------------------------------------------
// Els jugadors no tenen "email" real, sinó un usuari curt (p.ex. "jordi").
// Supabase Auth necessita un email, així que internament el construïm com
// "usuari@vincit.local". Aquesta funció ho amaga a la resta de l'app.
// ---------------------------------------------------------------------------
export function usernameToEmail(username) {
  return `${username.trim().toLowerCase()}@vincit.local`
}
