-- Run this in Supabase SQL Editor (Dashboard -> SQL Editor) to create the blogs table.

create table if not exists public.blogs (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  slug text unique,
  excerpt text,
  content text,
  cover_image_url text,
  category text default 'Health',
  read_time_minutes int default 5,
  published boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Optional: enable RLS and allow public read for published blogs, service_role has full access by default
alter table public.blogs enable row level security;

create policy "Public can read published blogs"
  on public.blogs for select
  using (published = true);
-- Backend uses service_role key which bypasses RLS, so admin CRUD works without extra policy.

-- Create storage bucket for blog cover images (or do it from Dashboard: Storage -> New bucket -> blog-images, public)
insert into storage.buckets (id, name, public)
values ('blog-images', 'blog-images', true)
on conflict (id) do nothing;

create policy "Public read blog images"
  on storage.objects for select
  using (bucket_id = 'blog-images');

create policy "Service role upload blog images"
  on storage.objects for insert
  with check (bucket_id = 'blog-images');

create policy "Service role update blog images"
  on storage.objects for update
  using (bucket_id = 'blog-images');

create policy "Service role delete blog images"
  on storage.objects for delete
  using (bucket_id = 'blog-images');
