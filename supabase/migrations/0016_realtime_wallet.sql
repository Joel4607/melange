-- ============================================================================
-- Phase 16 — Realtime updates for wallet and ledger.
-- ============================================================================

alter table wallets        replica identity full;
alter table ledger_entries replica identity full;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    CREATE PUBLICATION supabase_realtime FOR TABLE wallets, ledger_entries;
  ELSE
    ALTER PUBLICATION supabase_realtime ADD TABLE wallets, ledger_entries;
  END IF;
END
$$;
