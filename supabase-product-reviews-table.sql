-- Run this in Supabase SQL Editor to create product reviews.

create table if not exists public.product_reviews (
  id uuid primary key default gen_random_uuid(),
  product_id text not null,
  author_name text not null,
  author_email text,
  rating int not null check (rating >= 1 and rating <= 5),
  body text not null,
  approved boolean not null default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists product_reviews_product_id_idx on public.product_reviews (product_id);
create index if not exists product_reviews_approved_idx on public.product_reviews (approved);

alter table public.product_reviews enable row level security;

create policy "Public can read approved reviews"
  on public.product_reviews for select
  using (approved = true);

-- Backend uses service_role key which bypasses RLS for inserts/admin CRUD.
