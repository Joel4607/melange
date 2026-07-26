-- ============================================================================
-- Phase 38 — Allow users to delete their own notifications.
-- ============================================================================


drop policy if exists notifications_delete on public.notifications;
create policy notifications_delete on public.notifications
  for delete using (recipient_id = auth.uid());
