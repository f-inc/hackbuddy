-- Server-only persistence. Browser clients never receive database credentials.
create table if not exists public.hackbuddy_events (
 id text primary key,
 revision bigint not null default 0,
 data jsonb not null,
 constraint hackbuddy_event_identity check (data->'config'->>'id' = id)
);
create unique index if not exists hackbuddy_event_slug on public.hackbuddy_events ((data->'config'->>'slug'));
alter table public.hackbuddy_events enable row level security;
revoke all on public.hackbuddy_events from anon, authenticated;
