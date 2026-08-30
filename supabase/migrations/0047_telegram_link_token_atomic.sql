-- Consume Telegram link tokens and update their admin profile in one transaction.
-- Row locks make each token single-use even when two webhook requests race.

alter table public.telegram_link_tokens enable row level security;

revoke all on table public.telegram_link_tokens from public, anon, authenticated;
grant select, insert, update, delete on table public.telegram_link_tokens to service_role;

create or replace function public.link_telegram_from_token(
  p_token text,
  p_telegram_user_id text
)
returns table (
  linked_profile_id uuid,
  linked_profile_name text,
  was_already_linked boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_profile_id uuid;
  v_profile_name text;
  v_existing_telegram_user_id text;
  v_already_linked boolean;
begin
  if nullif(btrim(p_token), '') is null
     or nullif(btrim(p_telegram_user_id), '') is null then
    return;
  end if;

  select p.id, p.name, p.telegram_user_id
    into v_profile_id, v_profile_name, v_existing_telegram_user_id
  from public.telegram_link_tokens t
  join public.profiles p on p.id = t.profile_id
  where t.token = p_token
    and t.used_at is null
    and t.expires_at > now()
    and p.is_admin is true
  for update of t, p;

  if not found then
    return;
  end if;

  v_already_linked := v_existing_telegram_user_id is not distinct from p_telegram_user_id;

  if not v_already_linked then
    update public.profiles
    set telegram_user_id = p_telegram_user_id
    where id = v_profile_id;
  end if;

  update public.telegram_link_tokens
  set used_at = now()
  where token = p_token;

  return query
  select v_profile_id, v_profile_name, v_already_linked;
end;
$$;

revoke all on function public.link_telegram_from_token(text, text)
  from public, anon, authenticated;
grant execute on function public.link_telegram_from_token(text, text)
  to service_role;
