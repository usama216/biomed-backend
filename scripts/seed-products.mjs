import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { SEED_PRODUCT_ROWS } from '../seed-products-data.mjs';

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !key) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env');
  process.exit(1);
}

const supabase = createClient(url, key);

const now = new Date().toISOString();
const rows = SEED_PRODUCT_ROWS.map((r) => ({
  ...r,
  updated_at: now,
}));

const { error } = await supabase.from('products').upsert(rows, { onConflict: 'id' });

if (error) {
  console.error('Seed failed:', error.message, error.details || '');
  process.exit(1);
}

console.log(`Upserted ${rows.length} products.`);
