-- Run this in your Supabase SQL Editor to create the banners table for hero carousel.
CREATE TABLE IF NOT EXISTS banners (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  image_url TEXT NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Banner images are uploaded to Supabase Storage. The backend creates a public bucket
-- named "banners" on first upload. You can also create it manually: Storage → New bucket → name "banners", set Public.
