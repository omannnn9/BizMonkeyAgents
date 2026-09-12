-- Document storage bucket, scoped per company by path convention:
-- documents/{company_id}/{uuid}-{filename}. RLS on storage.objects mirrors
-- the same allowed_company_ids() check used everywhere else, so a file
-- uploaded for one company is unreachable by another regardless of any
-- signed-URL or direct-path guessing attempt.

insert into storage.buckets (id, name, public)
values ('documents', 'documents', false)
on conflict (id) do nothing;

create policy documents_bucket_select on storage.objects for select
  using (
    bucket_id = 'documents'
    and (storage.foldername(name))[1]::uuid in (select private.allowed_company_ids())
  );

create policy documents_bucket_insert on storage.objects for insert
  with check (
    bucket_id = 'documents'
    and (storage.foldername(name))[1]::uuid in (select private.allowed_company_ids())
  );

create policy documents_bucket_delete on storage.objects for delete
  using (
    bucket_id = 'documents'
    and (storage.foldername(name))[1]::uuid in (select private.allowed_company_ids())
  );
