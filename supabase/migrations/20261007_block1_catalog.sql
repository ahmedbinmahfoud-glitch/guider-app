-- Block 1, phase 1: catalog cache + per-store config.
-- Applied via the Supabase Management API after Ahmed's approval.

-- One row per Salla product per store. Sizes are separate Salla products at
-- Drip On (each has its own product_id and URL), so links are per row.
create table if not exists public.products (
  store_id          text        not null,
  salla_product_id  text        not null,
  name              text,
  sku               text,
  type              text,
  status            text,          -- Salla status: sale / out / hidden ...
  is_available      boolean,
  quantity          integer,       -- null = unlimited or unknown
  price             numeric,       -- current selling price, VAT-inclusive
  regular_price     numeric,
  sale_price        numeric,
  currency          text,
  url               text,
  image             text,
  brand             text,
  categories        jsonb not null default '[]'::jsonb,
  options           jsonb not null default '[]'::jsonb,
  description       text,
  metadata          jsonb not null default '{}'::jsonb,  -- our enrichment (taste profile, recipe); never overwritten by sync
  raw               jsonb,                                -- last Salla payload, for parser fixes
  synced_at         timestamptz not null default now(),
  removed_at        timestamptz,                          -- set when gone from Salla
  primary key (store_id, salla_product_id)
);
create index if not exists products_store_available on public.products (store_id, is_available) where removed_at is null;

-- Owner decisions the bot reads instead of the prompt (docs/merchants/<store>-rules.md).
create table if not exists public.store_config (
  store_id    text primary key,
  persona     jsonb not null default '{}'::jsonb,
  rules       jsonb not null default '{}'::jsonb,
  updated_at  timestamptz not null default now()
);

alter table public.products enable row level security;
alter table public.store_config enable row level security;
revoke all on public.products, public.store_config from anon, authenticated;
