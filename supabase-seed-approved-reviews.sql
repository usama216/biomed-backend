-- ============================================================
-- Seed APPROVED 5-star positive reviews for EVERY product.
-- ~28 reviews per product | Pakistani names + emails
-- Run once in Supabase SQL Editor.
-- Safe-ish: only inserts; does not delete existing reviews.
-- ============================================================

do $$
declare
  v_product record;
  v_i int;
  v_name text;
  v_email text;
  v_body text;
  v_names text[] := array[
    'Ahmed Raza',
    'Fatima Khan',
    'Usman Ali',
    'Ayesha Malik',
    'Hassan Shah',
    'Sana Iqbal',
    'Bilal Ahmed',
    'Maryam Noor',
    'Zainab Hussain',
    'Omar Farooq',
    'Hina Sheikh',
    'Imran Qureshi',
    'Nida Javed',
    'Saad Mehmood',
    'Rabia Anwar',
    'Kamran Siddiqui',
    'Mehwish Tariq',
    'Asadullah Khan',
    'Laiba Rehman',
    'Waqas Anjum',
    'Saima Bashir',
    'Hamza Nawaz',
    'Areeba Yousaf',
    'Danish Saleem',
    'Iqra Nadeem',
    'Shahzad Butt',
    'Mahnoor Aslam',
    'Faisal Aziz',
    'Kiran Fatima',
    'Adeel Chaudhry'
  ];
  v_emails text[] := array[
    'ahmed.raza.pk@gmail.com',
    'fatima.khan87@gmail.com',
    'usman.ali.lahore@gmail.com',
    'ayesha.malik22@yahoo.com',
    'hassan.shah91@gmail.com',
    'sana.iqbal.hyd@gmail.com',
    'bilal.ahmed.karachi@gmail.com',
    'maryam.noor.pk@outlook.com',
    'zainab.hussain33@gmail.com',
    'omar.farooq.isb@gmail.com',
    'hina.sheikh.pk@yahoo.com',
    'imran.qureshi.fsd@gmail.com',
    'nida.javed94@gmail.com',
    'saad.mehmood.mul@gmail.com',
    'rabia.anwar.pk@gmail.com',
    'kamran.siddiqui77@yahoo.com',
    'mehwish.tariq.lhr@gmail.com',
    'asadullah.khan.pk@gmail.com',
    'laiba.rehman21@gmail.com',
    'waqas.anjum.rwp@gmail.com',
    'saima.bashir.pk@outlook.com',
    'hamza.nawaz88@gmail.com',
    'areeba.yousaf.pk@gmail.com',
    'danish.saleem.khi@gmail.com',
    'iqra.nadeem92@yahoo.com',
    'shahzad.butt.lhr@gmail.com',
    'mahnoor.aslam.pk@gmail.com',
    'faisal.aziz.pk@gmail.com',
    'kiran.fatima.hyd@gmail.com',
    'adeel.chaudhry.pk@gmail.com'
  ];
  v_bodies text[] := array[
    'Excellent product. Quality is genuine and packaging was neat. Highly recommended.',
    'Very satisfied with the results. Will definitely order again from Biomed.',
    'Great quality supplement. Delivery was fast and product was sealed properly.',
    'Using it regularly and feeling positive difference. Worth every rupee.',
    'Authentic product, no side effects for me. Customer support was also helpful.',
    'Best purchase I made recently. Results are better than I expected.',
    'Trusted brand and reliable quality. My family also started using it.',
    'Five stars without any doubt. Pure and effective formula.',
    'Ordered for the second time. Same great quality every time.',
    'Very good experience overall. Product arrived on time in perfect condition.',
    'I was looking for something trustworthy and this product delivered.',
    'Noticeable improvement after a few weeks. Happy with my purchase.',
    'Clean ingredients and good dosage. Feels premium quality.',
    'Cash on delivery made it easy. Product is original and effective.',
    'Recommended by a friend and I am glad I tried it. Fantastic results.',
    'Smooth ordering process and quality product. Fully satisfied.',
    'Been using for a month now. Feeling more energetic and better overall.',
    'Genuine Biomed product. Packaging and expiry details were clear.',
    'Amazing value for money. Will keep this in my monthly routine.',
    'No complaints at all. Effective, fresh stock, and quick delivery.',
    'My doctor suggested a similar supplement and this one works great.',
    'Top quality. I compared with other brands and this is better.',
    'Very positive experience from order to results. Thank you Biomed.',
    'Sealed pack, authentic labels, and good results. Fully trusted.',
    'Helped me a lot. I already recommended it to my cousins.',
    'Outstanding product quality. Stars well deserved.',
    'Safe to use and results are consistent. Highly impressed.',
    'Best supplement I have bought online so far. Will reorder soon.'
  ];
begin
  for v_product in
    select id from public.products order by id
  loop
    for v_i in 1..28 loop
      v_name := v_names[((v_i - 1 + (ascii(substring(v_product.id from length(v_product.id) for 1)) % 7)) % array_length(v_names, 1)) + 1];
      v_email := v_emails[((v_i - 1 + (ascii(substring(v_product.id from length(v_product.id) for 1)) % 7)) % array_length(v_emails, 1)) + 1];
      -- Slightly shift email local-part per product so same person+product looks unique in DB
      v_email := replace(v_email, '@', '+' || replace(v_product.id, '-', '') || '@');
      v_body := v_bodies[((v_i - 1 + (hashtext(v_product.id) & 15)) % array_length(v_bodies, 1)) + 1];

      insert into public.product_reviews (
        product_id,
        author_name,
        author_email,
        rating,
        body,
        approved,
        created_at,
        updated_at
      ) values (
        v_product.id,
        v_name,
        v_email,
        5,
        v_body,
        true,
        now() - ((v_i * 2 + (hashtext(v_product.id) % 5)) || ' days')::interval,
        now() - ((v_i * 2 + (hashtext(v_product.id) % 5)) || ' days')::interval
      );
    end loop;
  end loop;
end $$;

-- Sync products.reviews + products.rating from approved reviews
update public.products
set reviews = 0,
    rating = 0,
    updated_at = now();

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

-- Quick check (optional)
-- select product_id, count(*) as reviews, round(avg(rating)::numeric,1) as rating
-- from public.product_reviews
-- where approved = true
-- group by product_id
-- order by product_id;
