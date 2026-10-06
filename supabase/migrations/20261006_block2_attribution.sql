-- Block 2: order attribution + private Salla app.
-- Applied manually via the Supabase Management API after Ahmed's approval.

-- Which Salla app a store installed: 'public' (OAuth callback) or 'private' (Easy Mode).
-- Needed to pick the right client credentials when refreshing tokens.
alter table public.stores add column if not exists salla_app text not null default 'public';

-- Widget session <-> Salla customer, reported by the widget on every page.
-- Join key between conversations and order webhooks.
create table if not exists public.session_identities (
  store_id    text        not null,
  session_id  text        not null,
  customer_id text        not null,
  first_seen  timestamptz not null default now(),
  last_seen   timestamptz not null default now(),
  primary key (store_id, session_id, customer_id)
);
create index if not exists session_identities_lookup
  on public.session_identities (store_id, customer_id, last_seen desc);

-- Server-only, like every other table (Block 0).
alter table public.session_identities enable row level security;
revoke all on public.session_identities from anon, authenticated;

-- Attribution looks up conversations by session.
create index if not exists conversations_session_id on public.conversations (session_id);
