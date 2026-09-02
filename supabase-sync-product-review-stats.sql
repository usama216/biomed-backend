-- Sync products.reviews / products.rating from approved product_reviews only.
-- Clears fake/seeded review counts. Safe to run multiple times.

-- 1. Reset all products to 0 first
update public.products
set reviews = 0,
    rating = 0,
    updated_at = now();

-- 2. Apply real approved review stats
update public.products p
set
  reviews = coalesce(s.cnt, 0),
  rating = coalesce(s.avg_rating, 0),
  updated_at = now()
from (
  select
    product_id,
    count(*)::int as cnt,
    round(avg(rating)::numeric, 1) as avg_rating
  from public.product_reviews
  where approved = true
  group by product_id
) s
where p.id = s.product_id;

-- Optional: change column defaults for new rows
alter table public.products alter column rating set default 0;
alter table public.products alter column reviews set default 0;
