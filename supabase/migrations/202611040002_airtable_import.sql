-- Immutable source backups and durable file references for explicit Airtable imports.
create table if not exists public.hackbuddy_airtable_archives (
 id text primary key,
 event_id text not null,
 source_digest text not null,
 captured_at timestamptz not null,
 data jsonb not null
);
create table if not exists public.hackbuddy_assets (
 id text primary key,
 event_id text not null,
 bucket text not null,
 object_path text not null,
 filename text not null,
 content_type text not null,
 size_bytes bigint not null,
 sha256 text not null,
 source_attachment_id text not null
);
create index if not exists hackbuddy_assets_event on public.hackbuddy_assets(event_id);
alter table public.hackbuddy_airtable_archives enable row level security;
alter table public.hackbuddy_assets enable row level security;
revoke all on public.hackbuddy_airtable_archives, public.hackbuddy_assets from anon, authenticated;
