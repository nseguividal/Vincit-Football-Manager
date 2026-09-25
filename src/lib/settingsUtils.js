import { supabase } from './supabaseClient'

export const DEFAULT_GAME_SETTINGS = {
  market_mode: 'active', // 'active' (Mercat actiu) | 'no_market' (Sense Mercat)
  anonymous_bids: true, // true (Pujes anònimes) | false (Pujes visibles)
  default_auction_days: 3, // Durada subhastes en dies (3 dies per defecte)
  max_players_mode: false, // true (Màxim 5 jugadors) | false (Sense límit)
}

/**
 * Carrega la configuració actual dels modes de joc de Supabase
 */
export async function fetchGameSettings() {
  try {
    const { data, error } = await supabase
      .from('game_settings')
      .select('*')
      .eq('id', 'default')
      .maybeSingle()

    if (error || !data) {
      return DEFAULT_GAME_SETTINGS
    }

    return {
      market_mode: data.market_mode || 'active',
      anonymous_bids: data.anonymous_bids !== false,
      default_auction_days: Number(data.default_auction_days) || 3,
      max_players_mode: Boolean(data.max_players_mode),
    }
  } catch (err) {
    console.warn('Avís carregant game_settings, usant valors per defecte:', err)
    return DEFAULT_GAME_SETTINGS
  }
}

/**
 * Desa la configuració dels modes de joc a Supabase
 */
export async function saveGameSettings(newSettings) {
  const payload = {
    id: 'default',
    market_mode: newSettings.market_mode || 'active',
    anonymous_bids: newSettings.anonymous_bids !== false,
    default_auction_days: Number(newSettings.default_auction_days) || 3,
    max_players_mode: Boolean(newSettings.max_players_mode),
    updated_at: new Date().toISOString(),
  }

  const { data, error } = await supabase
    .from('game_settings')
    .upsert(payload, { onConflict: 'id' })
    .select()

  if (error) {
    throw error
  }
  return data
}

