-- ============================================================================
-- TAULA DE CONFIGURACIÓ DE MODES DE JOC (GAME SETTINGS)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.game_settings (
  id text PRIMARY KEY DEFAULT 'default',
  market_mode text NOT NULL DEFAULT 'active', -- 'active' (Mercat actiu) | 'no_market' (Sense Mercat)
  anonymous_bids boolean NOT NULL DEFAULT true, -- true (Pujes anònimes) | false (Pujes visibles)
  default_auction_days integer NOT NULL DEFAULT 3, -- Durada de les subhastes (3 dies per defecte)
  max_players_mode boolean NOT NULL DEFAULT false, -- true (Màxim 5 jugadors) | false (Sense límit)
  updated_at timestamp with time zone DEFAULT now()
);

-- ============================================================================
-- PERMISOS BASE (GRANT)
-- Imprescindible per evitar l'error "permission denied for table game_settings"
-- ============================================================================
GRANT SELECT ON public.game_settings TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.game_settings TO authenticated;
GRANT ALL ON public.game_settings TO service_role;

-- ============================================================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================================================
ALTER TABLE public.game_settings ENABLE ROW LEVEL SECURITY;

-- 1. Lectura pública (qualsevol usuari o visitant pot consultar la configuració)
DROP POLICY IF EXISTS "Lectura publica game_settings" ON public.game_settings;
CREATE POLICY "Lectura publica game_settings" ON public.game_settings
  FOR SELECT USING (true);

-- 2. Modificació per a usuaris autenticats (administradors)
DROP POLICY IF EXISTS "Admins poden modificar game_settings" ON public.game_settings;
CREATE POLICY "Admins poden modificar game_settings" ON public.game_settings
  FOR ALL USING (
    auth.role() = 'authenticated'
  )
  WITH CHECK (
    auth.role() = 'authenticated'
  );

-- ============================================================================
-- FILA PER DEFECTE
-- ============================================================================
-- ============================================================================
-- OFERTES DEL CLUB (Permetre que el Club faci ofertes directes com a comprador)
-- ============================================================================
ALTER TABLE public.transfer_offers ALTER COLUMN bidder_manager_id DROP NOT NULL;

-- Actualitzar accept_transfer_offer per donar suport a ofertes del Club (bidder_manager_id IS NULL)
CREATE OR REPLACE FUNCTION public.accept_transfer_offer(p_offer_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_offer          transfer_offers%ROWTYPE;
  v_card           fantasy_cards%ROWTYPE;
  v_seller         uuid;
  v_buyer_budget   numeric;
  v_player_name    text;
  v_buyer_name     text;
  v_caller_mgr     uuid := current_manager_id();
  v_final_amount   numeric;
BEGIN
  SELECT * INTO v_offer FROM transfer_offers WHERE id = p_offer_id AND status IN ('pending', 'countered');
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Oferta no trobada o ja resolta';
  END IF;

  SELECT * INTO v_card FROM fantasy_cards WHERE id = v_offer.fantasy_card_id;
  v_seller := v_card.owner_manager_id;

  -- Permís: Només l'administrador o el venedor actual pot acceptar l'oferta
  IF NOT is_current_user_admin() AND (v_seller IS NULL OR v_caller_mgr <> v_seller) THEN
    RAISE EXCEPTION 'No tens permís per acceptar aquesta oferta';
  END IF;

  v_final_amount := COALESCE(v_offer.counter_amount, v_offer.amount);

  SELECT full_name INTO v_player_name FROM club_players WHERE id = v_card.club_player_id;

  IF v_offer.bidder_manager_id IS NOT NULL THEN
    SELECT budget, display_name INTO v_buyer_budget, v_buyer_name FROM managers WHERE id = v_offer.bidder_manager_id;
    IF v_buyer_budget < v_final_amount THEN
      RAISE EXCEPTION 'El comprador no té prou pressupost disponible (%M requerits, %M disponibles)', v_final_amount, v_buyer_budget;
    END IF;

    -- Moviment de diners comprador
    UPDATE managers SET budget = budget - v_final_amount WHERE id = v_offer.bidder_manager_id;
  ELSE
    v_buyer_name := '🏛️ El Club';
  END IF;

  -- Moviment de diners venedor
  IF v_seller IS NOT NULL THEN
    UPDATE managers SET budget = budget + v_final_amount WHERE id = v_seller;
  END IF;

  -- Canvi de propietat del jugador
  UPDATE fantasy_cards
    SET owner_manager_id = v_offer.bidder_manager_id,
        status = 'owned',
        current_price = v_final_amount,
        market_listed_at = NULL,
        market_expires_at = NULL
    WHERE id = v_card.id;

  -- Marcar l'oferta com acceptada
  UPDATE transfer_offers
    SET status = 'accepted',
        resolved_at = now()
    WHERE id = p_offer_id;

  -- Rebutjar la resta d'ofertes pendents per a aquesta mateixa fitxa
  UPDATE transfer_offers
    SET status = 'rejected',
        resolved_at = now()
    WHERE fantasy_card_id = v_card.id
      AND id <> p_offer_id
      AND status IN ('pending', 'countered');

  -- Registrar al log d'activitat
  INSERT INTO activity_log (manager_id, type, message)
    VALUES (
      v_offer.bidder_manager_id,
      'purchase',
      format('%s ha fitxat %s per %sM', COALESCE(v_buyer_name, 'El Club'), COALESCE(v_player_name, 'el jugador'), v_final_amount)
    );
END;
$$;


