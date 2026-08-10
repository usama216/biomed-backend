-- Run in Supabase SQL Editor

create table if not exists public.promo_codes (
  id uuid primary key default gen_random_uuid(),
  code text not null,
  discount_type text not null default 'percent' check (discount_type in ('percent', 'fixed')),
  discount_value numeric not null check (discount_value > 0),
  min_order_amount numeric not null default 0,
  max_uses int,
  used_count int not null default 0,
  active boolean not null default true,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists promo_codes_code_unique
  on public.promo_codes (lower(code));

alter table public.promo_codes enable row level security;

-- Backend uses service_role (bypasses RLS). No public read of all codes.

-- Store applied promo on orders (optional columns)
alter table public.orders add column if not exists promo_code text;
alter table public.orders add column if not exists promo_discount numeric default 0;
