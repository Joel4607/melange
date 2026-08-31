-- Durable authoritative counters for security-sensitive rate limits. Redis may
-- reject early, but every potentially allowed hit is granted by this state.

create table public.rate_limit_counters (
  counter_key text primary key check (char_length(counter_key) between 1 and 512),
  hit_count integer not null check (hit_count >= 1),
  expires_at timestamptz not null,
  updated_at timestamptz not null default now()
);

create index rate_limit_counters_expires_at_idx
  on public.rate_limit_counters (expires_at);

alter table public.rate_limit_counters enable row level security;

revoke all on table public.rate_limit_counters from public, anon, authenticated;
grant select, insert, update, delete on table public.rate_limit_counters to service_role;

create or replace function public.consume_rate_limit(
  p_key text,
  p_limit integer,
  p_window_seconds integer
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_count integer;
  v_expires_at timestamptz;
begin
  if nullif(btrim(p_key), '') is null
     or char_length(p_key) > 512
     or p_limit is null
     or p_limit < 1
     or p_limit > 1000000
     or p_window_seconds is null
     or p_window_seconds < 1
     or p_window_seconds > 86400 then
    return false;
  end if;

  -- Match Redis's epoch-aligned window so its early rejection never outlives
  -- the authoritative database window.
  v_expires_at := to_timestamp(
    (floor(extract(epoch from v_now) / p_window_seconds) + 1)
      * p_window_seconds
  );

  insert into public.rate_limit_counters (
    counter_key,
    hit_count,
    expires_at,
    updated_at
  ) values (
    p_key,
    1,
    v_expires_at,
    v_now
  )
  on conflict (counter_key) do update
  set hit_count = case
        when public.rate_limit_counters.expires_at <= v_now then 1
        else least(public.rate_limit_counters.hit_count + 1, p_limit + 1)
      end,
      expires_at = case
        when public.rate_limit_counters.expires_at <= v_now
          then v_expires_at
        else public.rate_limit_counters.expires_at
      end,
      updated_at = v_now
  returning hit_count into v_count;

  -- Bound cleanup work and skip rows another request is already pruning. The
  -- grace period keeps recently expired rows available for ordinary key reuse.
  with expired as (
    select counter_key
    from public.rate_limit_counters
    where expires_at < v_now - interval '1 hour'
    order by expires_at
    for update skip locked
    limit 100
  )
  delete from public.rate_limit_counters counters
  using expired
  where counters.counter_key = expired.counter_key;

  return v_count <= p_limit;
end;
$$;

revoke all on function public.consume_rate_limit(text, integer, integer)
  from public, anon, authenticated;
grant execute on function public.consume_rate_limit(text, integer, integer)
  to service_role;
