-- ============================================================================
-- StudyOS — 0003_storage.sql
-- Bucket privato per i materiali di studio, una cartella per utente:
--   study-materials/<user_id>/<nome-file>
-- ============================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'study-materials',
  'study-materials',
  false,
  52428800, -- 50 MB
  array[
    'application/pdf',
    'image/png',
    'image/jpeg',
    'image/webp',
    'text/plain',
    'text/markdown',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/zip'
  ]
)
on conflict (id) do update
  set file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types,
      public = false;

-- Il primo segmento del path deve coincidere con l'id dell'utente autenticato.
drop policy if exists "study_materials_select_own" on storage.objects;
create policy "study_materials_select_own" on storage.objects
  for select to authenticated
  using (bucket_id = 'study-materials' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "study_materials_insert_own" on storage.objects;
create policy "study_materials_insert_own" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'study-materials' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "study_materials_update_own" on storage.objects;
create policy "study_materials_update_own" on storage.objects
  for update to authenticated
  using (bucket_id = 'study-materials' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'study-materials' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "study_materials_delete_own" on storage.objects;
create policy "study_materials_delete_own" on storage.objects
  for delete to authenticated
  using (bucket_id = 'study-materials' and (storage.foldername(name))[1] = auth.uid()::text);
