-- Run this in Supabase SQL Editor to add the missing sort_order column.
-- Safe to run even if the column already exists.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'banners' AND column_name = 'sort_order'
  ) THEN
    ALTER TABLE banners ADD COLUMN sort_order INT NOT NULL DEFAULT 0;
  END IF;
END $$;
