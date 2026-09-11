-- Disposable test database only, run immediately before migration 0051.
-- Snapshot actual pre-upgrade rows, apply twice, and assert no data is reset.
begin;
insert into auth.users (id, email, raw_user_meta_data)
values ('51000000-0000-0000-0000-000000000009', 'wallet-upgrade@example.test', '{}');
insert into public.tasks (id, buyer_id, title, price, pickup_lat, pickup_lng, status)
values ('51000000-0000-0000-0000-000000000019', '51000000-0000-0000-0000-000000000009',
  'Preserve upgrade escrow', 17, 0, 0, 'matched');
select public.hold_funds('51000000-0000-0000-0000-000000000019');
create temporary table wallet_upgrade_before on commit drop as table public.wallets;
create temporary table ledger_upgrade_before on commit drop as table public.ledger_entries;
\ir ../../supabase/migrations/0051_restore_simulated_wallet_funding.sql
\ir ../../supabase/migrations/0051_restore_simulated_wallet_funding.sql
do $$ begin
  if exists (table public.wallets except table wallet_upgrade_before)
     or exists (table wallet_upgrade_before except table public.wallets)
     or exists (table public.ledger_entries except table ledger_upgrade_before)
     or exists (table ledger_upgrade_before except table public.ledger_entries) then
    raise exception 'Wallet restoration changed existing balances or ledger history';
  end if;
end $$;
commit;
