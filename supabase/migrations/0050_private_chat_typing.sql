-- SEC-013: ephemeral typing is private to the buyer and selected runner.
-- Supabase already enables RLS on realtime.messages. Never disable it.
-- The client must also join with config.private = true; public and private
-- broadcasts do not share a channel even when their topic strings match.

-- A restrictive policy is ANDed with every permissive policy, so a pre-existing
-- broad authenticated/public grant cannot expose typing topics.
drop policy if exists typing_participant_boundary on realtime.messages;
create policy typing_participant_boundary on realtime.messages
  as restrictive for all to public
  using (
    (select realtime.topic()) not like 'typing:%'
    or (
      extension = 'broadcast'
      and exists (
        select 1 from public.tasks t
        where 'typing:' || t.id::text = (select realtime.topic())
          and (t.buyer_id = (select auth.uid()) or t.selected_runner_id = (select auth.uid()))
      )
    )
  );

-- Grant only the two operations used by Broadcast. The restrictive boundary
-- above supplies membership checks for both SELECT and INSERT (WITH CHECK).
drop policy if exists typing_receive on realtime.messages;
create policy typing_receive on realtime.messages
  for select to authenticated
  using ((select realtime.topic()) like 'typing:%');

drop policy if exists typing_send on realtime.messages;
create policy typing_send on realtime.messages
  for insert to authenticated
  with check ((select realtime.topic()) like 'typing:%');
