-- Disposable local/CI database only. All fixtures and temporary grants roll back.
begin;
grant usage on schema auth to anon, authenticated;
grant select on public.tasks to anon, authenticated;

insert into auth.users (id, email, raw_user_meta_data) values
  ('13000000-0000-0000-0000-000000000001', 'typing-buyer@example.test', '{}'),
  ('13000000-0000-0000-0000-000000000002', 'typing-runner@example.test', '{}'),
  ('13000000-0000-0000-0000-000000000003', 'typing-outsider@example.test', '{}');
insert into public.tasks (id, buyer_id, selected_runner_id, title, pickup_lat, pickup_lng)
values (
  '13000000-0000-0000-0000-000000000010',
  '13000000-0000-0000-0000-000000000001',
  '13000000-0000-0000-0000-000000000002', 'Typing policy test', 0, 0
);
insert into realtime.messages (topic, extension, event, payload, private) values
  ('typing:13000000-0000-0000-0000-000000000010', 'broadcast', 'typing', '{}', true),
  ('typing:13000000-0000-0000-0000-000000000099', 'broadcast', 'typing', '{}', true),
  ('typing:not-a-uuid', 'broadcast', 'typing', '{}', true);

create function pg_temp.assert_typing_access(expected boolean)
returns void language plpgsql as $$
declare
  readable boolean;
  writable boolean := false;
begin
  select exists(select 1 from realtime.messages where topic = realtime.topic()) into readable;
  begin
    insert into realtime.messages (topic, extension, event, payload, private)
    values (realtime.topic(), 'broadcast', 'typing', '{}', true);
    writable := true;
  exception when insufficient_privilege then
    writable := false;
  end;
  if readable is distinct from expected or writable is distinct from expected then
    raise exception 'Typing access for user %, topic %: read %, write %, expected %',
      auth.uid(), realtime.topic(), readable, writable, expected;
  end if;
end $$;

set local role authenticated;
set local "realtime.topic" = 'typing:13000000-0000-0000-0000-000000000010';
set local "request.jwt.claim.sub" = '13000000-0000-0000-0000-000000000001';
select pg_temp.assert_typing_access(true);
set local "request.jwt.claim.sub" = '13000000-0000-0000-0000-000000000002';
select pg_temp.assert_typing_access(true);
set local "request.jwt.claim.sub" = '13000000-0000-0000-0000-000000000003';
select pg_temp.assert_typing_access(false);
reset role;

-- Permissive policies are ORed: a legacy broad policy must not bypass ours.
create policy test_broad_receive on realtime.messages for select using (true);
create policy test_broad_send on realtime.messages for insert with check (true);
update public.profiles set is_admin = true
where id = '13000000-0000-0000-0000-000000000003';
set local role authenticated;
select pg_temp.assert_typing_access(false); -- even an unrelated admin
set local "request.jwt.claim.sub" = '13000000-0000-0000-0000-000000000001';
set local "realtime.topic" = 'typing:13000000-0000-0000-0000-000000000099';
select pg_temp.assert_typing_access(false); -- absent conversation
set local "realtime.topic" = 'typing:not-a-uuid';
select pg_temp.assert_typing_access(false); -- malformed topic, no cast exception
set local "realtime.topic" = 'typing:13000000-0000-0000-0000-000000000010';
select pg_temp.assert_typing_access(true);
do $$ begin
  begin
    insert into realtime.messages (topic, extension) values (realtime.topic(), 'presence');
    raise exception 'Unused presence extension was allowed';
  exception when insufficient_privilege then null;
  end;
end $$;

reset role;
update public.tasks set selected_runner_id = null
where id = '13000000-0000-0000-0000-000000000010';
set local role authenticated;
set local "request.jwt.claim.sub" = '13000000-0000-0000-0000-000000000002';
select pg_temp.assert_typing_access(false); -- revoked membership on next authorization
set local role anon;
set local "request.jwt.claim.sub" = '';
select pg_temp.assert_typing_access(false);
rollback;
