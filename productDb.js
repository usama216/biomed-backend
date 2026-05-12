/**
 * Map Supabase `products` row ↔ API shape used by the storefront (camelCase).
 */

export function dbRowToApiProduct(row) {
  if (!row) return null;
  const image = row.image || '';
  const images =
    Array.isArray(row.images) && row.images.length > 0 ? row.images : image ? [image] : [];
  let category = row.category;
  if (category == null || category === '') category = ['Best Selling'];

  return {
    id: row.id,
    name: row.name,
    rating: row.rating != null ? Number(row.rating) : 4.5,
    reviews: row.reviews ?? 0,
    questions: row.questions ?? 0,
    originalPrice: Number(row.original_price),
    discountedPrice: Number(row.discounted_price),
    image,
    images,
    description: row.description || '',
    inStock: row.in_stock !== false,
    category,
    packSize: row.pack_size || '',
    wellnessCoins:
      row.wellness_coins != null ? Number(row.wellness_coins) : Number(row.discounted_price),
    helps: Array.isArray(row.helps) ? row.helps : [],
    details: row.details || '',
    directions: row.directions || '',
    ingredients: Array.isArray(row.ingredients) ? row.ingredients : [],
    sort_order: row.sort_order ?? 0,
  };
}

export function normalizeCategoryForDb(input) {
  if (input == null || input === '') return ['Best Selling'];
  if (Array.isArray(input)) return input.length ? input : ['Best Selling'];
  const parts = String(input)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  return parts.length ? parts : ['Best Selling'];
}

export function parseHelpsFromForm(text) {
  if (!text || !String(text).trim()) return [];
  return String(text)
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean);
}

export function parseIngredientsFromForm(text) {
  if (!text || !String(text).trim()) return [];
  try {
    const parsed = JSON.parse(text);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}
