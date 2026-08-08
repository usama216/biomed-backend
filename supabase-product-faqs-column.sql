-- Add FAQs to products (run in Supabase SQL Editor if products table already exists).

alter table public.products
  add column if not exists faqs jsonb not null default '[]'::jsonb;
