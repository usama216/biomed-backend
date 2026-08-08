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

  const orig = row.original_price ?? row.originalPrice;
  const disc = row.discounted_price ?? row.discountedPrice;
  const origN = Number(orig);
  const discN = Number(disc);
  let helps = row.helps;
  if (typeof helps === 'string') helps = helps.trim() ? [helps.trim()] : [];
  else if (!Array.isArray(helps)) helps = [];

  const inStock = row.in_stock !== undefined ? row.in_stock : row.inStock;
  const packSize = row.pack_size ?? row.packSize ?? '';
  const wc = row.wellness_coins ?? row.wellnessCoins;

  return {
    id: row.id,
    name: row.name,
    rating: row.rating != null ? Number(row.rating) : 4.5,
    reviews: row.reviews ?? 0,
    questions: row.questions ?? 0,
    originalPrice: Number.isFinite(origN) ? origN : 0,
    discountedPrice: Number.isFinite(discN) ? discN : 0,
    image,
    images,
    description: row.description || '',
    inStock: inStock !== false,
    category,
    packSize: String(packSize || ''),
    wellnessCoins:
      wc != null && wc !== '' && Number.isFinite(Number(wc))
        ? Number(wc)
        : Number.isFinite(discN)
          ? discN
          : 0,
    helps,
    details: row.details || '',
    directions: row.directions || '',
    ingredients: Array.isArray(row.ingredients) ? row.ingredients : [],
    faqs: Array.isArray(row.faqs) ? row.faqs : [],
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

export function parseFaqsFromForm(text) {
  if (text == null || text === '') return [];
  let parsed = text;
  if (typeof text === 'string') {
    try {
      parsed = JSON.parse(text);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(parsed)) return [];
  return parsed
    .map((item) => {
      if (!item || typeof item !== 'object') return null;
      const question = String(item.question || '').trim();
      const answer = String(item.answer || '').trim();
      if (!question || !answer) return null;
      return { question, answer };
    })
    .filter(Boolean);
}
