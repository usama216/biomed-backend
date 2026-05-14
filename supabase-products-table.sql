-- ============================================================
-- Run in Supabase SQL Editor: products catalog + public read.
-- Backend uses service_role and bypasses RLS for admin CRUD.
-- Safe to run multiple times (idempotent).
-- ============================================================

-- 1. Create table if it does not exist yet
create table if not exists public.products (
  id text primary key,
  name text not null,
  original_price numeric not null,
  discounted_price numeric not null,
  image text not null default '',
  images jsonb not null default '[]'::jsonb,
  description text default '',
  rating numeric default 4.5,
  reviews int default 0,
  questions int default 0,
  in_stock boolean not null default true,
  category jsonb not null default '["Best Selling"]'::jsonb,
  pack_size text default '',
  wellness_coins int,
  helps jsonb not null default '[]'::jsonb,
  details text default '',
  directions text default '',
  ingredients jsonb not null default '[]'::jsonb,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 2. Add any missing columns to an already-existing table
alter table public.products add column if not exists name text;
alter table public.products add column if not exists original_price numeric;
alter table public.products add column if not exists discounted_price numeric;
alter table public.products add column if not exists image text not null default '';
alter table public.products add column if not exists images jsonb not null default '[]'::jsonb;
alter table public.products add column if not exists description text default '';
alter table public.products add column if not exists rating numeric default 4.5;
alter table public.products add column if not exists reviews int default 0;
alter table public.products add column if not exists questions int default 0;
alter table public.products add column if not exists in_stock boolean not null default true;
alter table public.products add column if not exists category jsonb not null default '["Best Selling"]'::jsonb;
alter table public.products add column if not exists pack_size text default '';
alter table public.products add column if not exists wellness_coins int;
alter table public.products add column if not exists helps jsonb not null default '[]'::jsonb;
alter table public.products add column if not exists details text default '';
alter table public.products add column if not exists directions text default '';
alter table public.products add column if not exists ingredients jsonb not null default '[]'::jsonb;
alter table public.products add column if not exists sort_order int not null default 0;
alter table public.products add column if not exists created_at timestamptz not null default now();
alter table public.products add column if not exists updated_at timestamptz not null default now();

-- 2.1 Backfill snake_case from legacy quoted camelCase columns (if present), then drop legacy cols
do $$
begin
  if exists (
    select 1
    from pg_catalog.pg_attribute a
    join pg_catalog.pg_class c on c.oid = a.attrelid
    join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = 'products'
      and a.attname = 'originalPrice'
      and a.attnum > 0
      and not a.attisdropped
  ) then
    execute 'update public.products set original_price = coalesce(original_price, "originalPrice")';
  end if;

  if exists (
    select 1
    from pg_catalog.pg_attribute a
    join pg_catalog.pg_class c on c.oid = a.attrelid
    join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = 'products'
      and a.attname = 'discountedPrice'
      and a.attnum > 0
      and not a.attisdropped
  ) then
    execute 'update public.products set discounted_price = coalesce(discounted_price, "discountedPrice")';
  end if;

  if exists (
    select 1
    from pg_catalog.pg_attribute a
    join pg_catalog.pg_class c on c.oid = a.attrelid
    join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = 'products'
      and a.attname = 'inStock'
      and a.attnum > 0
      and not a.attisdropped
  ) then
    execute 'update public.products set in_stock = coalesce(in_stock, "inStock")';
  end if;

  if exists (
    select 1
    from pg_catalog.pg_attribute a
    join pg_catalog.pg_class c on c.oid = a.attrelid
    join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = 'products'
      and a.attname = 'packSize'
      and a.attnum > 0
      and not a.attisdropped
  ) then
    execute 'update public.products set pack_size = coalesce(pack_size, "packSize")';
  end if;

  if exists (
    select 1
    from pg_catalog.pg_attribute a
    join pg_catalog.pg_class c on c.oid = a.attrelid
    join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = 'products'
      and a.attname = 'wellnessCoins'
      and a.attnum > 0
      and not a.attisdropped
  ) then
    execute 'update public.products set wellness_coins = coalesce(wellness_coins, "wellnessCoins")';
  end if;
end $$;

-- Drop legacy camelCase columns so only snake_case remains (PostgREST / app use snake_case)
alter table public.products drop column if exists "originalPrice";
alter table public.products drop column if exists "discountedPrice";
alter table public.products drop column if exists "inStock";
alter table public.products drop column if exists "packSize";
alter table public.products drop column if exists "wellnessCoins";

-- 2.2 Ensure required values exist for API writes
update public.products
set original_price = coalesce(original_price, discounted_price, 0),
    discounted_price = coalesce(discounted_price, original_price, 0),
    name = coalesce(name, id);

-- 3. Enable RLS
alter table public.products enable row level security;

-- 4. Public read policy (drop first to avoid duplicate error)
drop policy if exists "Public read products" on public.products;
create policy "Public read products"
  on public.products for select
  using (true);

-- 5. Storage bucket for admin-uploaded product images
insert into storage.buckets (id, name, public)
values ('product-images', 'product-images', true)
on conflict (id) do nothing;

drop policy if exists "Public read product images" on storage.objects;
create policy "Public read product images"
  on storage.objects for select
  using (bucket_id = 'product-images');

drop policy if exists "Service role upload product images" on storage.objects;
create policy "Service role upload product images"
  on storage.objects for insert
  with check (bucket_id = 'product-images');

drop policy if exists "Service role update product images" on storage.objects;
create policy "Service role update product images"
  on storage.objects for update
  using (bucket_id = 'product-images');

drop policy if exists "Service role delete product images" on storage.objects;
create policy "Service role delete product images"
  on storage.objects for delete
  using (bucket_id = 'product-images');
