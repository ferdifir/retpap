-- Apply once to the isolated Supabase target before uploading media.
-- The bucket must stay private; /media/[slug] checks scheduled visibility
-- before issuing short-lived signed URLs.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'retpap-media',
  'retpap-media',
  false,
  50000000,
  array['image/jpeg', 'video/mp4']::text[]
)
on conflict (id) do update
set name = excluded.name,
    public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;
