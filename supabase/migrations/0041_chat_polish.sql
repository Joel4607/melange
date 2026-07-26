-- ============================================================================
-- Phase 41 — Chat polish: image attachments, read receipts, and typing infra.
-- ============================================================================

-- Allow image-only messages and track read state.
DO $$
DECLARE
  con_name text;
BEGIN
  SELECT conname INTO con_name
  FROM pg_constraint
  WHERE conrelid = 'public.messages'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) LIKE '%length(content)%';

  IF con_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.messages DROP CONSTRAINT %I', con_name);
  END IF;
END
$$;

alter table public.messages
  add column if not exists image_path text,
  add column if not exists read_at timestamptz,
  alter column content set default '',
  add constraint messages_content_or_image check (
    length(content) > 0 or image_path is not null
  ),
  add constraint messages_image_path_length check (
    image_path is null or length(image_path) > 0
  );

create index messages_read_at_idx on public.messages (task_id, read_at) where read_at is null;

-- Private storage bucket for chat images.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'storage' AND table_name = 'buckets'
  ) THEN
    IF NOT EXISTS (SELECT 1 FROM storage.buckets WHERE id = 'chat-images') THEN
      insert into storage.buckets (id, name, public)
      values ('chat-images', 'chat-images', false);
    END IF;
  END IF;
END
$$;

-- Storage RLS: participants can sign/view images attached to their tasks.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'storage' AND table_name = 'objects'
  ) THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'storage' AND tablename = 'objects'
        AND policyname = 'chat_images_select_participants'
    ) THEN
      EXECUTE format(
        'CREATE POLICY %I ON storage.objects FOR SELECT USING (bucket_id = %L AND (public.is_admin() OR EXISTS (SELECT 1 FROM public.messages m JOIN public.tasks t ON t.id = m.task_id WHERE m.image_path = name AND (t.buyer_id = auth.uid() OR t.selected_runner_id = auth.uid()))))',
        'chat_images_select_participants',
        'chat-images'
      );
    END IF;
  END IF;
END
$$;
