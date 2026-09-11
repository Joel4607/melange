-- Disposable test database only. All fixture data and grants roll back.
begin;
insert into auth.users (id, email, raw_user_meta_data) values
  ('51000000-0000-0000-0000-000000000001', 'wallet-buyer@example.test', '{}'),
  ('51000000-0000-0000-0000-000000000002', 'wallet-runner@example.test', '{}');

do $$
declare
  buyer constant uuid := '51000000-0000-0000-0000-000000000001';
  runner constant uuid := '51000000-0000-0000-0000-000000000002';
  v_task_id uuid;
  direct_id uuid;
  invalid_amount bigint;
  mutation text;
  ledger_count integer;
begin
  if (select balance from public.wallets where user_id = buyer) is distinct from 0::numeric
     or exists (select 1 from public.ledger_entries where user_id = buyer) then
    raise exception 'New account received a fixed allocation instead of an empty wallet';
  end if;

  if to_regprocedure('public.top_up_wallet(uuid,bigint)') is null then
    raise exception 'Simulated top-up RPC is missing';
  end if;
  foreach mutation in array array[
    'public.top_up_wallet(uuid,bigint)', 'public.hold_funds(uuid)',
    'public.fund_and_hold_task(uuid)', 'public.release_funds(uuid)', 'public.refund_funds(uuid)',
    'public.rate_and_tip(uuid,uuid,smallint,text,bigint)',
    'public.create_and_hold_direct_demo_errand(uuid,uuid,text,text,text,urgency,numeric,numeric,double precision,double precision,double precision,double precision,jsonb,text,date)'
  ] loop
    if has_function_privilege('anon', mutation, 'EXECUTE')
       or has_function_privilege('authenticated', mutation, 'EXECUTE')
       or not has_function_privilege('service_role', mutation, 'EXECUTE') then
      raise exception 'Wallet mutation permissions are incorrect: %', mutation;
    end if;
  end loop;

  perform public.top_up_wallet(buyer, 5025);
  perform public.top_up_wallet(buyer, 1000);
  if (select balance from public.wallets where user_id = buyer) <> 60.25
     or (select sum(amount) from public.ledger_entries where user_id = buyer) <> 60.25
     or (select count(*) from public.ledger_entries where user_id = buyer and type = 'topup') <> 2 then
    raise exception 'Repeated manual top-ups did not credit and record exact amounts';
  end if;
  foreach invalid_amount in array array[null::bigint, 0, -1, 1000000000000] loop
    begin
      perform public.top_up_wallet(buyer, invalid_amount);
      raise exception 'Invalid top-up was accepted';
    exception when invalid_parameter_value then null;
    end;
  end loop;
  if (select balance from public.wallets where user_id = buyer) <> 60.25 then
    raise exception 'Invalid top-up changed balance';
  end if;

  insert into public.tasks (buyer_id, title, pickup_lat, pickup_lng, price, status)
  values (buyer, 'Fund shortfall once', 0, 0, 100, 'matched') returning id into v_task_id;
  perform public.fund_and_hold_task(v_task_id);
  perform public.fund_and_hold_task(v_task_id);
  if (select balance from public.wallets where user_id = buyer) <> 0
     or (select held from public.wallets where user_id = buyer) <> 100
     or (select count(*) from public.ledger_entries l where l.task_id = v_task_id and type = 'topup' and amount = 39.75) <> 1
     or (select count(*) from public.ledger_entries l where l.task_id = v_task_id and type = 'hold' and amount = 100) <> 1 then
    raise exception 'Shortfall funding or retry idempotency failed';
  end if;

  select public.create_and_hold_direct_demo_errand(
    buyer, runner, 'Automatically funded direct request', null, null,
    'normal', 120, 10, 0, 0, null, null, '[]', 'none', null
  ) into direct_id;
  if (select balance from public.wallets where user_id = buyer) <> 0
     or (select held from public.wallets where user_id = buyer) <> 220
     or (select count(*) from public.ledger_entries where ledger_entries.task_id = direct_id and type = 'topup' and amount = 120) <> 1 then
    raise exception 'Direct request did not atomically fund and hold its shortfall';
  end if;

  -- A supplied balance is spent first, without an unnecessary automatic credit.
  perform public.top_up_wallet(buyer, 20000);
  insert into public.tasks (buyer_id, title, pickup_lat, pickup_lng, price, status)
  values (buyer, 'Already funded', 0, 0, 30, 'matched') returning id into v_task_id;
  perform public.fund_and_hold_task(v_task_id);
  if (select balance from public.wallets where user_id = buyer) <> 170
     or exists (select 1 from public.ledger_entries l where l.task_id = v_task_id and type = 'topup') then
    raise exception 'Funding minted credits despite a sufficient balance';
  end if;

  update public.tasks set status = 'completed' where id = direct_id;
  perform public.rate_and_tip(direct_id, buyer, 5::smallint, 'Demo', 2500);
  if (select balance from public.wallets where user_id = buyer) <> 145
     or (select balance from public.wallets where user_id = runner) <> 135
     or (select held from public.wallets where user_id = buyer) <> 130 then
    raise exception 'Atomic payout and tip changed after restoring funding';
  end if;

  -- Retain atomic rollback when a tip is unaffordable (manual top-up is available).
  update public.tasks set selected_runner_id = runner, status = 'completed' where id = v_task_id;
  begin
    perform public.rate_and_tip(v_task_id, buyer, 5::smallint, null, 100000);
    raise exception 'Unaffordable tip was accepted';
  exception when others then
    if sqlerrm <> 'demo_wallet_insufficient_credits' then raise; end if;
  end;
  if (select held from public.wallets where user_id = buyer) <> 130
     or exists (select 1 from public.ratings r where r.task_id = v_task_id)
     or exists (select 1 from public.ledger_entries l where l.task_id = v_task_id and type in ('release','payout','tip','tip_charge')) then
    raise exception 'Rejected tip left partial payout state';
  end if;

  -- Wallet/ledger overflow must abort the whole top-up, not partially credit it.
  select count(*) into ledger_count from public.ledger_entries where user_id = buyer;
  update public.wallets set balance = 0, held = 9999999999.99 where user_id = buyer;
  begin
    perform public.create_and_hold_direct_demo_errand(
      buyer, runner, 'Rollback overflowing hold', null, null,
      'normal', 1, 0, 0, 0, null, null, '[]', 'none', null
    );
    raise exception 'Overflowing hold was accepted';
  exception when numeric_value_out_of_range then null;
  end;
  if (select balance from public.wallets where user_id = buyer) <> 0
     or (select count(*) from public.ledger_entries where user_id = buyer) <> ledger_count
     or exists (select 1 from public.tasks where title = 'Rollback overflowing hold') then
    raise exception 'Failed direct hold left a task or credited shortfall behind';
  end if;

  update public.wallets set balance = 9999999999.99 where user_id = buyer;
  begin
    perform public.top_up_wallet(buyer, 1);
    raise exception 'Overflowing top-up was accepted';
  exception when numeric_value_out_of_range then null;
  end;
  if (select balance from public.wallets where user_id = buyer) <> 9999999999.99
     or (select count(*) from public.ledger_entries where user_id = buyer) <> ledger_count then
    raise exception 'Overflowing top-up changed balance';
  end if;
end $$;
rollback;
