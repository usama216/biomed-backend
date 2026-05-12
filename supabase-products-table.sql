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
