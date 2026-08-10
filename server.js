import 'dotenv/config';
import crypto from 'crypto';
import express from 'express';
import cors from 'cors';
import jwt from 'jsonwebtoken';
import Stripe from 'stripe';
import multer from 'multer';
import { createClient } from '@supabase/supabase-js';
import { products, getProductById } from './products.js';
import {
  dbRowToApiProduct,
  normalizeCategoryForDb,
  parseHelpsFromForm,
  parseIngredientsFromForm,
  parseFaqsFromForm,
} from './productDb.js';
import { SEED_PRODUCT_ROWS } from './seed-products-data.mjs';
import { sendOrderEmails } from './email.js';

const app = express();
const PORT = process.env.PORT || 5000;
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://biomedpharmas.com';
const JWT_SECRET = process.env.JWT_SECRET || 'change-me-in-production';
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@biomed.com';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';

const BANNERS_BUCKET = 'banners';
const BLOG_IMAGES_BUCKET = 'blog-images';
const PRODUCT_IMAGES_BUCKET = 'product-images';
// Max upload size for all images (banners, cover, inline blog images)
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

// Allow all domains (any origin can call the API)
app.use(cors({ origin: true, credentials: true }));

const stripe = Stripe(process.env.STRIPE_SECRET_KEY);
const supabase = process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY
  ? createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
  : null;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_SIZE },
  fileFilter: (req, file, cb) => {
    const allowed = /^image\/(jpeg|jpg|png|gif|webp)$/i.test(file.mimetype);
    if (allowed) cb(null, true);
    else cb(new Error('Only images (JPEG, PNG, GIF, WebP) are allowed'), false);
  },
});

app.use(express.json());

async function ensureBannersBucket() {
  if (!supabase) return;
  const { data: buckets } = await supabase.storage.listBuckets();
  if (buckets && !buckets.find((b) => b.name === BANNERS_BUCKET)) {
    await supabase.storage.createBucket(BANNERS_BUCKET, { public: true });
  }
}

async function ensureBlogImagesBucket() {
  if (!supabase) return;
  const { data: buckets } = await supabase.storage.listBuckets();
  if (buckets && !buckets.find((b) => b.name === BLOG_IMAGES_BUCKET)) {
    await supabase.storage.createBucket(BLOG_IMAGES_BUCKET, { public: true });
  }
}

async function ensureProductImagesBucket() {
  if (!supabase) return;
  const { data: buckets } = await supabase.storage.listBuckets();
  if (buckets && !buckets.find((b) => b.name === PRODUCT_IMAGES_BUCKET)) {
    await supabase.storage.createBucket(PRODUCT_IMAGES_BUCKET, { public: true });
  }
}

async function uploadBlogImageToStorage(file) {
  await ensureBlogImagesBucket();
  const ext = (file.originalname && file.originalname.split('.').pop()) || 'jpg';
  const path = `${Date.now()}-${crypto.randomUUID().slice(0, 8)}.${ext.replace(/[^a-z0-9]/gi, '')}`;
  const { data, error } = await supabase.storage
    .from(BLOG_IMAGES_BUCKET)
    .upload(path, file.buffer, { contentType: file.mimetype || 'image/jpeg', upsert: false });
  if (error) throw error;
  const { data: urlData } = supabase.storage.from(BLOG_IMAGES_BUCKET).getPublicUrl(data.path);
  return urlData.publicUrl;
}

async function uploadBannerToStorage(file) {
  await ensureBannersBucket();
  const ext = (file.originalname && file.originalname.split('.').pop()) || 'jpg';
  const path = `${Date.now()}-${crypto.randomUUID().slice(0, 8)}.${ext.replace(/[^a-z0-9]/gi, '')}`;
  const { data, error } = await supabase.storage
    .from(BANNERS_BUCKET)
    .upload(path, file.buffer, { contentType: file.mimetype || 'image/jpeg', upsert: false });
  if (error) throw error;
  const { data: urlData } = supabase.storage.from(BANNERS_BUCKET).getPublicUrl(data.path);
  return urlData.publicUrl;
}

async function uploadProductImageToStorage(file) {
  await ensureProductImagesBucket();
  const ext = (file.originalname && file.originalname.split('.').pop()) || 'jpg';
  const path = `${Date.now()}-${crypto.randomUUID().slice(0, 8)}.${ext.replace(/[^a-z0-9]/gi, '')}`;
  const { data, error } = await supabase.storage
    .from(PRODUCT_IMAGES_BUCKET)
    .upload(path, file.buffer, { contentType: file.mimetype || 'image/jpeg', upsert: false });
  if (error) throw error;
  const { data: urlData } = supabase.storage.from(PRODUCT_IMAGES_BUCKET).getPublicUrl(data.path);
  return urlData.publicUrl;
}

// Admin auth middleware: require Bearer token and valid JWT
function requireAdmin(req, res, next) {
  const auth = req.headers.authorization;
  const token = auth && auth.startsWith('Bearer ') ? auth.slice(7) : null;
  if (!token) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    if (payload.role !== 'admin') {
      return res.status(403).json({ error: 'Forbidden' });
    }
    req.admin = payload;
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

// --- Test / live routes (use these to verify backend is up on Vercel) ---
// Test URL: https://YOUR-BACKEND.vercel.app/api  or  /api/health  or  /api/live
app.get('/api', (req, res) => {
  res.json({ live: true, service: 'BioMed API', timestamp: new Date().toISOString() });
});
app.get('/api/live', (req, res) => {
  res.json({ live: true, message: 'BioMed API is live on Vercel', timestamp: new Date().toISOString() });
});
app.get('/api/health', (req, res) => {
  res.json({ ok: true, message: 'BioMed API running' });
});

function seededApiProducts() {
  return SEED_PRODUCT_ROWS.map(dbRowToApiProduct);
}

// Product catalog (Supabase when configured and non-empty; otherwise in-memory seed for local dev)
app.get('/api/products', async (req, res) => {
  try {
    if (!supabase) {
      return res.json({ products: seededApiProducts() });
    }
    const { data, error } = await supabase
      .from('products')
      .select('*')
      .order('id', { ascending: true });
    if (error) {
      console.error('Products fetch error:', error);
      return res.status(500).json({ error: error.message });
    }
    if (!data?.length) {
      return res.json({ products: [] });
    }
    res.json({ products: data.map(dbRowToApiProduct) });
  } catch (err) {
    console.error('Products error:', err);
    res.status(500).json({ error: err.message || 'Failed to load products' });
  }
});

// Single product (DB first, then seed fallback)
app.get('/api/products/:id', async (req, res) => {
  try {
    const { id } = req.params;
    let row = null;
    if (supabase) {
      const { data, error } = await supabase.from('products').select('*').eq('id', id).maybeSingle();
      if (!error) row = data;
    }
    if (!row) {
      row = SEED_PRODUCT_ROWS.find((r) => r.id === id) || null;
    }
    if (!row) {
      return res.status(404).json({ error: 'Product not found' });
    }
    res.json(dbRowToApiProduct(row));
  } catch (err) {
    console.error('Product get error:', err);
    res.status(500).json({ error: err.message || 'Failed to load product' });
  }
});

async function fetchProductRowsForCheckout(ids) {
  const unique = [...new Set((ids || []).filter(Boolean))];
  if (!supabase || unique.length === 0) return new Map();
  const { data, error } = await supabase
    .from('products')
    .select('id,name,original_price,discounted_price,image')
    .in('id', unique);
  if (error || !data) return new Map();
  return new Map(data.map((r) => [r.id, r]));
}

// Stripe metadata values max 500 chars
const meta = (v) => (v != null && String(v).length > 0 ? String(v).slice(0, 500) : undefined);

// Create Stripe Checkout Session
app.post('/api/create-checkout-session', async (req, res) => {
  try {
    const { items, successUrl, cancelUrl, customer } = req.body;
    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'Cart items are required' });
    }
    const cust = customer && typeof customer === 'object' ? customer : {};
    const customerEmail = cust.email || undefined;

    const lineItems = [];
    const checkoutIds = items.map((i) => i.id);
    const dbProductMap = await fetchProductRowsForCheckout(checkoutIds);
    for (const item of items) {
      const row = dbProductMap.get(item.id);
      const staticP = getProductById(item.id);
      const price = row
        ? Number(row.discounted_price)
        : staticP
          ? staticP.discountedPrice
          : item.discountedPrice ?? item.price;
      const name = row ? row.name : staticP ? staticP.name : item.name;
      const imagePath = row ? row.image : staticP ? staticP.image : item.image;
      const qty = Math.max(1, parseInt(item.quantity, 10) || 1);
      // Stripe amounts in smallest unit: PKR uses paise (1 PKR = 100 paise)
      lineItems.push({
        price_data: {
          currency: 'pkr',
          product_data: {
            name,
            images: imagePath ? [new URL(imagePath, FRONTEND_URL).href] : undefined,
          },
          unit_amount: Math.round(price * 100), // per unit in paise
        },
        quantity: qty,
      });
    }

    const metadata = {
      items: JSON.stringify(items.map(i => ({ id: i.id, name: i.name, quantity: i.quantity, price: i.discountedPrice ?? i.price }))),
    };
    if (cust.name) metadata.customer_name = meta(cust.name);
    if (cust.email) metadata.customer_email_meta = meta(cust.email);
    if (cust.phone) metadata.customer_phone = meta(cust.phone);
    if (cust.address) metadata.customer_address = meta(cust.address);
    if (cust.city) metadata.customer_city = meta(cust.city);
    if (cust.postalCode) metadata.customer_postal_code = meta(cust.postalCode);
    if (cust.deliveryNotes) metadata.delivery_notes = meta(cust.deliveryNotes);

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: lineItems,
      mode: 'payment',
      success_url: successUrl || `${FRONTEND_URL}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: cancelUrl || `${FRONTEND_URL}/checkout`,
      customer_email: customerEmail || undefined,
      metadata,
    });

    res.json({ url: session.url, sessionId: session.id });
  } catch (err) {
    console.error('Checkout session error:', err);
    res.status(500).json({ error: err.message || 'Failed to create checkout session' });
  }
});

// Retrieve session (for success page)
app.get('/api/checkout-session/:sessionId', async (req, res) => {
  try {
    const session = await stripe.checkout.sessions.retrieve(req.params.sessionId, {
      expand: ['line_items'],
    });
    res.json({
      id: session.id,
      payment_status: session.payment_status,
      amount_total: session.amount_total,
      customer_email: session.customer_email,
      metadata: session.metadata,
    });
  } catch (err) {
    console.error('Session retrieve error:', err);
    res.status(500).json({ error: err.message || 'Failed to retrieve session' });
  }
});

// Save order to Supabase after successful payment (called from success page)
app.post('/api/orders', async (req, res) => {
  let session;
  try {
    const { sessionId } = req.body;
    if (!sessionId) {
      return res.status(400).json({ error: 'sessionId required' });
    }
    session = await stripe.checkout.sessions.retrieve(sessionId);
    if (session.payment_status !== 'paid') {
      return res.status(400).json({ error: 'Session not paid' });
    }
    if (!supabase) {
      return res.json({ order: { id: session.id }, saved: false });
    }
    const m = session.metadata || {};
    const { data, error } = await supabase.from('orders').insert({
      stripe_session_id: session.id,
      customer_email: session.customer_email || m.customer_email_meta,
      customer_name: m.customer_name || null,
      customer_phone: m.customer_phone || null,
      customer_address: m.customer_address || null,
      customer_city: m.customer_city || null,
      customer_postal_code: m.customer_postal_code || null,
      delivery_notes: m.delivery_notes || null,
      amount_total: session.amount_total,
      currency: session.currency || 'pkr',
      items: m.items ? JSON.parse(m.items) : [],
      status: 'paid',
    }).select().single();
    if (error) {
      if (error.code === '23505') return res.json({ order: { id: session.id } });
      console.error('Supabase insert error:', error.message, error.details);
      return res.json({ order: { id: session.id }, saved: false });
    }
    sendOrderEmails(data).catch((e) => console.error('Order emails error:', e));
    res.json({ order: data });
  } catch (err) {
    console.error('Order save error:', err.message || err);
    if (session) {
      res.json({ order: { id: session.id }, saved: false });
    } else {
      res.status(500).json({ error: err.message || 'Failed to retrieve session' });
    }
  }
});

// Cash on Delivery: create order without Stripe
app.post('/api/orders/cod', async (req, res) => {
  try {
    const { items, customer, promo_code: promoCodeRaw } = req.body;
    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'Cart items are required' });
    }
    const cust = customer && typeof customer === 'object' ? customer : {};
    if (!cust.name?.trim() || !cust.email?.trim() || !cust.phone?.trim() || !cust.address?.trim()) {
      return res.status(400).json({ error: 'Name, email, phone and address are required' });
    }

    let amountTotal = 0;
    const orderItems = items.map((i) => {
      const price = i.discountedPrice ?? i.price ?? 0;
      const qty = Math.max(1, parseInt(i.quantity, 10) || 1);
      amountTotal += price * qty;
      return { id: i.id, name: i.name, quantity: qty, price };
    });

    let promoDiscount = 0;
    let appliedPromoCode = null;
    let promoRow = null;
    if (promoCodeRaw && String(promoCodeRaw).trim()) {
      const applied = await applyPromoToSubtotal(String(promoCodeRaw).trim(), amountTotal);
      if (!applied.ok) {
        return res.status(400).json({ error: applied.error });
      }
      promoDiscount = applied.discount;
      appliedPromoCode = applied.code;
      promoRow = applied.row;
    }

    const finalTotal = Math.max(0, amountTotal - promoDiscount);
    const amountTotalPaise = Math.round(finalTotal * 100);

    if (!supabase) {
      return res.status(503).json({ error: 'Orders temporarily unavailable' });
    }

    const codSessionId = 'cod_' + crypto.randomUUID();
    const insertRow = {
      stripe_session_id: codSessionId,
      customer_email: cust.email.trim(),
      customer_name: cust.name.trim(),
      customer_phone: cust.phone.trim(),
      customer_address: cust.address.trim(),
      customer_city: cust.city?.trim() || null,
      customer_postal_code: cust.postalCode?.trim() || null,
      delivery_notes: cust.deliveryNotes?.trim() || null,
      amount_total: amountTotalPaise,
      currency: 'pkr',
      items: orderItems,
      status: 'cod',
      promo_code: appliedPromoCode,
      promo_discount: promoDiscount,
    };

    let { data, error } = await supabase.from('orders').insert(insertRow).select().single();
    // If promo columns don't exist yet, retry without them
    if (error && /promo_code|promo_discount/i.test(error.message || '')) {
      delete insertRow.promo_code;
      delete insertRow.promo_discount;
      ({ data, error } = await supabase.from('orders').insert(insertRow).select().single());
    }

    if (error) {
      console.error('COD order error:', error);
      return res.status(500).json({ error: error.message || 'Failed to place order' });
    }

    if (promoRow?.id) {
      await supabase
        .from('promo_codes')
        .update({
          used_count: Number(promoRow.used_count || 0) + 1,
          updated_at: new Date().toISOString(),
        })
        .eq('id', promoRow.id);
    }

    sendOrderEmails(data).catch((e) => console.error('Order emails error:', e));
    res.json({ order: data });
  } catch (err) {
    console.error('COD order error:', err);
    res.status(500).json({ error: err.message || 'Failed to place order' });
  }
});

// --- Admin routes ---

// Admin login: returns JWT if email/password match
app.post('/api/admin/login', (req, res) => {
  const { email, password } = req.body || {};
  if (email === ADMIN_EMAIL && password === ADMIN_PASSWORD) {
    const token = jwt.sign(
      { sub: email, role: 'admin' },
      JWT_SECRET,
      { expiresIn: '7d' }
    );
    return res.json({ token });
  }
  res.status(401).json({ error: 'Invalid email or password' });
});

// Admin: list orders (protected)
app.get('/api/admin/orders', requireAdmin, async (req, res) => {
  try {
    if (!supabase) {
      return res.json({ orders: [] });
    }
    const { data, error } = await supabase
      .from('orders')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) {
      console.error('Admin orders error:', error);
      return res.status(500).json({ error: error.message });
    }
    res.json({ orders: data || [] });
  } catch (err) {
    console.error('Admin orders error:', err);
    res.status(500).json({ error: err.message || 'Failed to load orders' });
  }
});

// --- Products (admin CRUD) ---

// Admin: list products
app.get('/api/admin/products', requireAdmin, async (req, res) => {
  try {
    if (!supabase) {
      return res.json({ products: seededApiProducts() });
    }
    const { data, error } = await supabase
      .from('products')
      .select('*')
      .order('id', { ascending: true });
    if (error) return res.status(500).json({ error: error.message });
    res.json({ products: (data || []).map(dbRowToApiProduct) });
  } catch (err) {
    console.error('Admin products error:', err);
    res.status(500).json({ error: err.message || 'Failed to load products' });
  }
});

// Admin: upload product image (returns { url })
app.post('/api/admin/products/upload-image', requireAdmin, upload.single('image'), async (req, res) => {
  try {
    if (!supabase) return res.status(503).json({ error: 'Database not configured' });
    if (!req.file) return res.status(400).json({ error: 'Image file is required' });
    const url = await uploadProductImageToStorage(req.file);
    res.json({ url });
  } catch (err) {
    console.error('Product image upload error:', err);
    res.status(500).json({ error: err.message || 'Failed to upload image' });
  }
});

function productRowFromBodyOrMultipart(req, existing) {
  const b = req.body || {};
  const base = existing ? { ...existing } : {};

  if (b.name !== undefined) base.name = String(b.name).trim();
  if (b.original_price !== undefined) base.original_price = Number(b.original_price);
  if (b.discounted_price !== undefined) base.discounted_price = Number(b.discounted_price);
  if (b.description !== undefined) base.description = String(b.description);
  if (b.rating !== undefined) base.rating = Number(b.rating);
  if (b.reviews !== undefined) base.reviews = parseInt(b.reviews, 10) || 0;
  if (b.questions !== undefined) base.questions = parseInt(b.questions, 10) || 0;
  if (b.in_stock !== undefined) base.in_stock = b.in_stock === 'true' || b.in_stock === true;
  if (b.category !== undefined) {
    try {
      base.category = normalizeCategoryForDb(JSON.parse(b.category));
    } catch {
      base.category = normalizeCategoryForDb(b.category);
    }
  }
  if (b.pack_size !== undefined) base.pack_size = String(b.pack_size);
  if (b.wellness_coins !== undefined) base.wellness_coins = parseInt(b.wellness_coins, 10) || 0;
  if (b.helps !== undefined) base.helps = parseHelpsFromForm(b.helps);
  if (b.details !== undefined) base.details = String(b.details);
  if (b.directions !== undefined) base.directions = String(b.directions);
  if (b.ingredients !== undefined) base.ingredients = parseIngredientsFromForm(b.ingredients);
  if (b.faqs !== undefined) base.faqs = parseFaqsFromForm(b.faqs);
  if (b.images !== undefined) {
    try {
      const parsed = JSON.parse(b.images);
      base.images = Array.isArray(parsed) ? parsed : [];
    } catch {
      base.images = [];
    }
  }
  if (b.sort_order !== undefined) base.sort_order = parseInt(b.sort_order, 10) || 0;

  return base;
}

// Admin: create product (multipart fields only — images are URLs from /upload-image or static paths)
app.post('/api/admin/products', requireAdmin, upload.none(), async (req, res) => {
  try {
    if (!supabase) return res.status(503).json({ error: 'Database not configured' });

    const { id } = req.body || {};
    if (!id || !String(id).trim()) return res.status(400).json({ error: 'id is required' });

    const row = productRowFromBodyOrMultipart(req, {
      id: String(id).trim(),
      in_stock: true,
      category: ['Best Selling'],
      images: [],
      helps: [],
      ingredients: [],
      faqs: [],
    });

    if (!row.name) return res.status(400).json({ error: 'name is required' });
    if (!Number.isFinite(Number(row.original_price))) return res.status(400).json({ error: 'original_price is required' });
    if (!Number.isFinite(Number(row.discounted_price))) return res.status(400).json({ error: 'discounted_price is required' });

    if (!Array.isArray(row.images)) row.images = [];
    row.images = row.images.map((u) => String(u || '').trim()).filter(Boolean);
    if (row.images.length > 0) {
      row.image = row.images[0];
    } else {
      row.image = row.image != null ? String(row.image) : '';
    }

    row.updated_at = new Date().toISOString();
    const { data, error } = await supabase.from('products').insert(row).select().single();
    if (error) return res.status(500).json({ error: error.message });
    res.status(201).json({ product: dbRowToApiProduct(data) });
  } catch (err) {
    console.error('Product create error:', err);
    res.status(500).json({ error: err.message || 'Failed to create product' });
  }
});

// Admin: update product (multipart fields — images is JSON array of URLs)
app.put('/api/admin/products/:id', requireAdmin, upload.none(), async (req, res) => {
  try {
    if (!supabase) return res.status(503).json({ error: 'Database not configured' });

    const { id } = req.params;
    const updates = productRowFromBodyOrMultipart(req, {});

    if (updates.images !== undefined) {
      const urls = Array.isArray(updates.images)
        ? updates.images.map((u) => String(u || '').trim()).filter(Boolean)
        : [];
      updates.images = urls;
      updates.image = urls.length > 0 ? urls[0] : '';
    }
    updates.updated_at = new Date().toISOString();

    if (Object.keys(updates).length <= 1) {
      return res.status(400).json({ error: 'Provide at least one field to update' });
    }

    const { data, error } = await supabase.from('products').update(updates).eq('id', id).select().single();
    if (error) return res.status(500).json({ error: error.message });
    if (!data) return res.status(404).json({ error: 'Product not found' });
    res.json({ product: dbRowToApiProduct(data) });
  } catch (err) {
    console.error('Product update error:', err);
    res.status(500).json({ error: err.message || 'Failed to update product' });
  }
});

// Admin: delete product
app.delete('/api/admin/products/:id', requireAdmin, async (req, res) => {
  try {
    if (!supabase) return res.status(503).json({ error: 'Database not configured' });
    const { id } = req.params;
    const { error } = await supabase.from('products').delete().eq('id', id);
    if (error) return res.status(500).json({ error: error.message });
    res.json({ success: true });
  } catch (err) {
    console.error('Product delete error:', err);
    res.status(500).json({ error: err.message || 'Failed to delete product' });
  }
});

// --- Banners (hero carousel) ---

// Public: get all banners for hero
app.get('/api/banners', async (req, res) => {
  try {
    if (!supabase) {
      return res.json({ banners: [] });
    }
    const { data, error } = await supabase
      .from('banners')
      .select('*')
      .order('sort_order', { ascending: true });
    if (error) {
      console.error('Banners fetch error:', error);
      return res.status(500).json({ error: error.message });
    }
    res.json({ banners: data || [] });
  } catch (err) {
    console.error('Banners error:', err);
    res.status(500).json({ banners: [] });
  }
});

// Admin: list banners (protected)
app.get('/api/admin/banners', requireAdmin, async (req, res) => {
  try {
    if (!supabase) {
      return res.json({ banners: [] });
    }
    const { data, error } = await supabase
      .from('banners')
      .select('*')
      .order('sort_order', { ascending: true });
    if (error) {
      console.error('Admin banners error:', error);
      return res.status(500).json({ error: error.message });
    }
    res.json({ banners: data || [] });
  } catch (err) {
    console.error('Admin banners error:', err);
    res.status(500).json({ error: err.message || 'Failed to load banners' });
  }
});

// Admin: add banner with image upload (protected)
app.post('/api/admin/banners', requireAdmin, upload.single('image'), async (req, res) => {
  try {
    if (!supabase) {
      return res.status(503).json({ error: 'Database not configured' });
    }
    if (!req.file) {
      return res.status(400).json({ error: 'Image file is required. Upload an image.' });
    }
    const sort_order = req.body.sort_order != null ? parseInt(req.body.sort_order, 10) : 0;
    const image_url = await uploadBannerToStorage(req.file);
    const { data, error } = await supabase
      .from('banners')
      .insert({ image_url, sort_order })
      .select()
      .single();
    if (error) {
      console.error('Banner insert error:', error);
      return res.status(500).json({ error: error.message });
    }
    res.status(201).json({ banner: data });
  } catch (err) {
    console.error('Banner create error:', err);
    res.status(500).json({ error: err.message || 'Failed to create banner' });
  }
});

// Admin: update banner – optional new image upload (protected)
app.put('/api/admin/banners/:id', requireAdmin, upload.single('image'), async (req, res) => {
  try {
    if (!supabase) {
      return res.status(503).json({ error: 'Database not configured' });
    }
    const { id } = req.params;
    const updates = {};
    if (req.file) {
      updates.image_url = await uploadBannerToStorage(req.file);
    }
    if (req.body.sort_order != null) {
      updates.sort_order = parseInt(req.body.sort_order, 10);
    }
    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: 'Provide a new image or sort_order to update' });
    }
    const { data, error } = await supabase
      .from('banners')
      .update(updates)
      .eq('id', id)
      .select()
      .single();
    if (error) {
      console.error('Banner update error:', error);
      return res.status(500).json({ error: error.message });
    }
    if (!data) {
      return res.status(404).json({ error: 'Banner not found' });
    }
    res.json({ banner: data });
  } catch (err) {
    console.error('Banner update error:', err);
    res.status(500).json({ error: err.message || 'Failed to update banner' });
  }
});

// Admin: delete banner (protected)
app.delete('/api/admin/banners/:id', requireAdmin, async (req, res) => {
  try {
    if (!supabase) {
      return res.status(503).json({ error: 'Database not configured' });
    }
    const { id } = req.params;
    const { error } = await supabase.from('banners').delete().eq('id', id);
    if (error) {
      console.error('Banner delete error:', error);
      return res.status(500).json({ error: error.message });
    }
    res.json({ success: true });
  } catch (err) {
    console.error('Banner delete error:', err);
    res.status(500).json({ error: err.message || 'Failed to delete banner' });
  }
});

// --- Blogs ---

// Public: list published blogs
app.get('/api/blogs', async (req, res) => {
  try {
    if (!supabase) {
      return res.json({ blogs: [] });
    }
    const { data, error } = await supabase
      .from('blogs')
      .select('id, title, slug, excerpt, cover_image_url, category, read_time_minutes, created_at')
      .eq('published', true)
      .order('created_at', { ascending: false });
    if (error) {
      console.error('Blogs fetch error:', error);
      return res.status(500).json({ error: error.message });
    }
    res.json({ blogs: data || [] });
  } catch (err) {
    console.error('Blogs error:', err);
    res.json({ blogs: [] });
  }
});

// Public: get single blog by id or slug
app.get('/api/blogs/:idOrSlug', async (req, res) => {
  try {
    if (!supabase) {
      return res.status(404).json({ error: 'Blog not found' });
    }
    const { idOrSlug } = req.params;
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(idOrSlug);
    const query = supabase
      .from('blogs')
      .select('*')
      .eq('published', true);
    if (isUuid) {
      query.eq('id', idOrSlug);
    } else {
      query.eq('slug', idOrSlug);
    }
    const { data, error } = await query.single();
    if (error || !data) {
      return res.status(404).json({ error: 'Blog not found' });
    }
    res.json(data);
  } catch (err) {
    console.error('Blog get error:', err);
    res.status(500).json({ error: err.message || 'Failed to load blog' });
  }
});

// Admin: list all blogs (including unpublished)
app.get('/api/admin/blogs', requireAdmin, async (req, res) => {
  try {
    if (!supabase) {
      return res.json({ blogs: [] });
    }
    const { data, error } = await supabase
      .from('blogs')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) {
      console.error('Admin blogs error:', error);
      return res.status(500).json({ error: error.message });
    }
    res.json({ blogs: data || [] });
  } catch (err) {
    console.error('Admin blogs error:', err);
    res.status(500).json({ error: err.message || 'Failed to load blogs' });
  }
});

// Admin: upload image for blog content (inline images) – returns { url }
app.post('/api/admin/blogs/upload-image', requireAdmin, upload.single('image'), async (req, res) => {
  try {
    if (!supabase) {
      return res.status(503).json({ error: 'Database not configured' });
    }
    if (!req.file) {
      return res.status(400).json({ error: 'Image file is required' });
    }
    const url = await uploadBlogImageToStorage(req.file);
    res.json({ url });
  } catch (err) {
    console.error('Blog image upload error:', err);
    res.status(500).json({ error: err.message || 'Failed to upload image' });
  }
});

// Admin: create blog (multipart: title, excerpt, content, category, read_time_minutes, published, cover image)
app.post('/api/admin/blogs', requireAdmin, upload.single('cover_image'), async (req, res) => {
  try {
    if (!supabase) {
      return res.status(503).json({ error: 'Database not configured' });
    }
    const { title, excerpt, content, category, read_time_minutes, published } = req.body || {};
    if (!title || !String(title).trim()) {
      return res.status(400).json({ error: 'Title is required' });
    }
    const slug = (String(title).trim().toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '') || 'blog-' + Date.now()).slice(0, 200);
    let cover_image_url = null;
    if (req.file) {
      cover_image_url = await uploadBlogImageToStorage(req.file);
    }
    const row = {
      title: String(title).trim(),
      slug,
      excerpt: excerpt != null ? String(excerpt).trim() : null,
      content: content != null ? String(content) : null,
      cover_image_url,
      category: category != null ? String(category).trim() || 'Health' : 'Health',
      read_time_minutes: read_time_minutes != null ? parseInt(read_time_minutes, 10) || 5 : 5,
      published: published === 'true' || published === true,
      updated_at: new Date().toISOString(),
    };
    const { data, error } = await supabase.from('blogs').insert(row).select().single();
    if (error) {
      console.error('Blog insert error:', error);
      return res.status(500).json({ error: error.message });
    }
    res.status(201).json({ blog: data });
  } catch (err) {
    console.error('Blog create error:', err);
    res.status(500).json({ error: err.message || 'Failed to create blog' });
  }
});

// Admin: update blog
app.put('/api/admin/blogs/:id', requireAdmin, upload.single('cover_image'), async (req, res) => {
  try {
    if (!supabase) {
      return res.status(503).json({ error: 'Database not configured' });
    }
    const { id } = req.params;
    const { title, excerpt, content, category, read_time_minutes, published } = req.body || {};
    const updates = { updated_at: new Date().toISOString() };
    if (title !== undefined) updates.title = String(title).trim();
    if (excerpt !== undefined) updates.excerpt = String(excerpt).trim();
    if (content !== undefined) updates.content = String(content);
    if (category !== undefined) updates.category = String(category).trim() || 'Health';
    if (read_time_minutes !== undefined) updates.read_time_minutes = parseInt(read_time_minutes, 10) || 5;
    if (published !== undefined) updates.published = published === 'true' || published === true;
    if (req.file) {
      updates.cover_image_url = await uploadBlogImageToStorage(req.file);
    }
    if (Object.keys(updates).length <= 1) {
      return res.status(400).json({ error: 'Provide at least one field to update' });
    }
    const { data, error } = await supabase.from('blogs').update(updates).eq('id', id).select().single();
    if (error) {
      console.error('Blog update error:', error);
      return res.status(500).json({ error: error.message });
    }
    if (!data) {
      return res.status(404).json({ error: 'Blog not found' });
    }
    res.json({ blog: data });
  } catch (err) {
    console.error('Blog update error:', err);
    res.status(500).json({ error: err.message || 'Failed to update blog' });
  }
});

// Admin: delete blog
app.delete('/api/admin/blogs/:id', requireAdmin, async (req, res) => {
  try {
    if (!supabase) {
      return res.status(503).json({ error: 'Database not configured' });
    }
    const { id } = req.params;
    const { error } = await supabase.from('blogs').delete().eq('id', id);
    if (error) {
      console.error('Blog delete error:', error);
      return res.status(500).json({ error: error.message });
    }
    res.json({ success: true });
  } catch (err) {
    console.error('Blog delete error:', err);
    res.status(500).json({ error: err.message || 'Failed to delete blog' });
  }
});

// --- Product Reviews ---

async function syncProductReviewStats(productId) {
  if (!supabase || !productId) return;
  const { data, error } = await supabase
    .from('product_reviews')
    .select('rating')
    .eq('product_id', productId)
    .eq('approved', true);
  if (error) {
    console.error('Review stats fetch error:', error);
    return;
  }
  const rows = data || [];
  const count = rows.length;
  const avg = count
    ? Math.round((rows.reduce((sum, r) => sum + Number(r.rating || 0), 0) / count) * 10) / 10
    : 0;
  const { error: updateError } = await supabase
    .from('products')
    .update({ reviews: count, rating: avg, updated_at: new Date().toISOString() })
    .eq('id', productId);
  if (updateError) {
    console.error('Review stats update error:', updateError);
  }
}

// Public: approved reviews for a product
app.get('/api/products/:id/reviews', async (req, res) => {
  try {
    if (!supabase) {
      return res.json({ reviews: [] });
    }
    const { id } = req.params;
    const { data, error } = await supabase
      .from('product_reviews')
      .select('id, product_id, author_name, rating, body, created_at')
      .eq('product_id', id)
      .eq('approved', true)
      .order('created_at', { ascending: false });
    if (error) {
      console.error('Product reviews fetch error:', error);
      return res.status(500).json({ error: error.message });
    }
    res.json({ reviews: data || [] });
  } catch (err) {
    console.error('Product reviews error:', err);
    res.json({ reviews: [] });
  }
});

// Public: submit a review (pending admin approval)
app.post('/api/products/:id/reviews', async (req, res) => {
  try {
    if (!supabase) {
      return res.status(503).json({ error: 'Database not configured' });
    }
    const { id } = req.params;
    const { author_name, author_email, rating, body } = req.body || {};
    const name = author_name != null ? String(author_name).trim() : '';
    const comment = body != null ? String(body).trim() : '';
    const stars = parseInt(rating, 10);

    if (!name) {
      return res.status(400).json({ error: 'Name is required' });
    }
    if (!comment) {
      return res.status(400).json({ error: 'Review text is required' });
    }
    if (!Number.isFinite(stars) || stars < 1 || stars > 5) {
      return res.status(400).json({ error: 'Rating must be between 1 and 5' });
    }

    // Ensure product exists (DB or seed)
    let productExists = false;
    const { data: productRow } = await supabase.from('products').select('id').eq('id', id).maybeSingle();
    if (productRow) productExists = true;
    else if (SEED_PRODUCT_ROWS.some((r) => r.id === id)) productExists = true;
    if (!productExists) {
      return res.status(404).json({ error: 'Product not found' });
    }

    const row = {
      product_id: id,
      author_name: name.slice(0, 120),
      author_email: author_email != null ? String(author_email).trim().slice(0, 200) || null : null,
      rating: stars,
      body: comment.slice(0, 2000),
      approved: false,
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await supabase.from('product_reviews').insert(row).select('id').single();
    if (error) {
      console.error('Review insert error:', error);
      return res.status(500).json({ error: error.message });
    }
    res.status(201).json({
      success: true,
      message: 'Review submitted. It will appear after admin approval.',
      review: { id: data.id },
    });
  } catch (err) {
    console.error('Review create error:', err);
    res.status(500).json({ error: err.message || 'Failed to submit review' });
  }
});

// Admin: list all reviews
app.get('/api/admin/reviews', requireAdmin, async (req, res) => {
  try {
    if (!supabase) {
      return res.json({ reviews: [] });
    }
    const { data, error } = await supabase
      .from('product_reviews')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) {
      console.error('Admin reviews error:', error);
      return res.status(500).json({ error: error.message });
    }
    res.json({ reviews: data || [] });
  } catch (err) {
    console.error('Admin reviews error:', err);
    res.status(500).json({ error: err.message || 'Failed to load reviews' });
  }
});

// Admin: approve / reject review
app.put('/api/admin/reviews/:id', requireAdmin, async (req, res) => {
  try {
    if (!supabase) {
      return res.status(503).json({ error: 'Database not configured' });
    }
    const { id } = req.params;
    const { approved } = req.body || {};
    if (approved === undefined) {
      return res.status(400).json({ error: 'approved is required' });
    }
    const updates = {
      approved: approved === true || approved === 'true',
      updated_at: new Date().toISOString(),
    };
    const { data, error } = await supabase
      .from('product_reviews')
      .update(updates)
      .eq('id', id)
      .select()
      .single();
    if (error) {
      console.error('Review update error:', error);
      return res.status(500).json({ error: error.message });
    }
    if (!data) {
      return res.status(404).json({ error: 'Review not found' });
    }
    await syncProductReviewStats(data.product_id);
    res.json({ review: data });
  } catch (err) {
    console.error('Review update error:', err);
    res.status(500).json({ error: err.message || 'Failed to update review' });
  }
});

// Admin: delete review
app.delete('/api/admin/reviews/:id', requireAdmin, async (req, res) => {
  try {
    if (!supabase) {
      return res.status(503).json({ error: 'Database not configured' });
    }
    const { id } = req.params;
    const { data: existing, error: fetchError } = await supabase
      .from('product_reviews')
      .select('id, product_id')
      .eq('id', id)
      .maybeSingle();
    if (fetchError) {
      console.error('Review fetch before delete error:', fetchError);
      return res.status(500).json({ error: fetchError.message });
    }
    if (!existing) {
      return res.status(404).json({ error: 'Review not found' });
    }
    const { error } = await supabase.from('product_reviews').delete().eq('id', id);
    if (error) {
      console.error('Review delete error:', error);
      return res.status(500).json({ error: error.message });
    }
    await syncProductReviewStats(existing.product_id);
    res.json({ success: true });
  } catch (err) {
    console.error('Review delete error:', err);
    res.status(500).json({ error: err.message || 'Failed to delete review' });
  }
});

// --- Promo Codes ---

function normalizePromoCode(code) {
  return String(code || '').trim().toUpperCase();
}

function computePromoDiscount(row, subtotal) {
  const total = Math.max(0, Number(subtotal) || 0);
  const value = Number(row.discount_value) || 0;
  if (row.discount_type === 'fixed') {
    return Math.min(total, Math.round(value));
  }
  // percent
  const pct = Math.min(100, Math.max(0, value));
  return Math.min(total, Math.round(total * (pct / 100)));
}

async function fetchPromoByCode(code) {
  if (!supabase) return null;
  const normalized = normalizePromoCode(code);
  if (!normalized) return null;
  const { data, error } = await supabase
    .from('promo_codes')
    .select('*')
    .eq('code', normalized)
    .maybeSingle();
  if (error || !data) return null;
  return data;
}

async function applyPromoToSubtotal(code, subtotal) {
  const row = await fetchPromoByCode(code);
  if (!row) return { ok: false, error: 'Invalid promo code' };
  if (!row.active) return { ok: false, error: 'This promo code is inactive' };
  if (row.expires_at && new Date(row.expires_at) < new Date()) {
    return { ok: false, error: 'This promo code has expired' };
  }
  if (row.max_uses != null && Number(row.used_count || 0) >= Number(row.max_uses)) {
    return { ok: false, error: 'This promo code has reached its usage limit' };
  }
  const minOrder = Number(row.min_order_amount || 0);
  const total = Math.max(0, Number(subtotal) || 0);
  if (total < minOrder) {
    return { ok: false, error: `Minimum order amount for this code is Rs. ${minOrder}` };
  }
  const discount = computePromoDiscount(row, total);
  if (discount <= 0) return { ok: false, error: 'Promo code cannot be applied to this order' };
  return {
    ok: true,
    code: normalizePromoCode(row.code),
    discount,
    final_total: Math.max(0, total - discount),
    discount_type: row.discount_type,
    discount_value: Number(row.discount_value),
    row,
  };
}

// Public: validate promo code against cart subtotal
app.post('/api/promo-codes/validate', async (req, res) => {
  try {
    if (!supabase) {
      return res.status(503).json({ error: 'Promo codes temporarily unavailable' });
    }
    const { code, subtotal } = req.body || {};
    if (!code || !String(code).trim()) {
      return res.status(400).json({ error: 'Promo code is required' });
    }
    const applied = await applyPromoToSubtotal(code, subtotal);
    if (!applied.ok) {
      return res.status(400).json({ error: applied.error });
    }
    res.json({
      valid: true,
      code: applied.code,
      discount: applied.discount,
      final_total: applied.final_total,
      discount_type: applied.discount_type,
      discount_value: applied.discount_value,
    });
  } catch (err) {
    console.error('Promo validate error:', err);
    res.status(500).json({ error: err.message || 'Failed to validate promo code' });
  }
});

// Admin: list promo codes
app.get('/api/admin/promo-codes', requireAdmin, async (req, res) => {
  try {
    if (!supabase) return res.json({ promo_codes: [] });
    const { data, error } = await supabase
      .from('promo_codes')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) {
      console.error('Admin promo codes error:', error);
      return res.status(500).json({ error: error.message });
    }
    res.json({ promo_codes: data || [] });
  } catch (err) {
    console.error('Admin promo codes error:', err);
    res.status(500).json({ error: err.message || 'Failed to load promo codes' });
  }
});

// Admin: create promo code
app.post('/api/admin/promo-codes', requireAdmin, async (req, res) => {
  try {
    if (!supabase) return res.status(503).json({ error: 'Database not configured' });
    const {
      code,
      discount_type = 'percent',
      discount_value,
      min_order_amount = 0,
      max_uses,
      active = true,
      expires_at,
    } = req.body || {};

    const normalized = normalizePromoCode(code);
    if (!normalized) return res.status(400).json({ error: 'Code is required' });
    if (!['percent', 'fixed'].includes(discount_type)) {
      return res.status(400).json({ error: 'discount_type must be percent or fixed' });
    }
    const value = Number(discount_value);
    if (!Number.isFinite(value) || value <= 0) {
      return res.status(400).json({ error: 'discount_value must be greater than 0' });
    }
    if (discount_type === 'percent' && value > 100) {
      return res.status(400).json({ error: 'Percent discount cannot exceed 100' });
    }

    const row = {
      code: normalized,
      discount_type,
      discount_value: value,
      min_order_amount: Math.max(0, Number(min_order_amount) || 0),
      max_uses: max_uses === '' || max_uses == null ? null : parseInt(max_uses, 10),
      active: active === true || active === 'true',
      expires_at: expires_at ? new Date(expires_at).toISOString() : null,
      updated_at: new Date().toISOString(),
    };
    if (row.max_uses != null && (!Number.isFinite(row.max_uses) || row.max_uses < 1)) {
      return res.status(400).json({ error: 'max_uses must be a positive number or empty' });
    }

    const { data, error } = await supabase.from('promo_codes').insert(row).select().single();
    if (error) {
      console.error('Promo create error:', error);
      if (/duplicate|unique/i.test(error.message || '')) {
        return res.status(400).json({ error: 'This promo code already exists' });
      }
      return res.status(500).json({ error: error.message });
    }
    res.status(201).json({ promo_code: data });
  } catch (err) {
    console.error('Promo create error:', err);
    res.status(500).json({ error: err.message || 'Failed to create promo code' });
  }
});

// Admin: update promo code
app.put('/api/admin/promo-codes/:id', requireAdmin, async (req, res) => {
  try {
    if (!supabase) return res.status(503).json({ error: 'Database not configured' });
    const { id } = req.params;
    const b = req.body || {};
    const updates = { updated_at: new Date().toISOString() };

    if (b.code !== undefined) {
      const normalized = normalizePromoCode(b.code);
      if (!normalized) return res.status(400).json({ error: 'Code is required' });
      updates.code = normalized;
    }
    if (b.discount_type !== undefined) {
      if (!['percent', 'fixed'].includes(b.discount_type)) {
        return res.status(400).json({ error: 'discount_type must be percent or fixed' });
      }
      updates.discount_type = b.discount_type;
    }
    if (b.discount_value !== undefined) {
      const value = Number(b.discount_value);
      if (!Number.isFinite(value) || value <= 0) {
        return res.status(400).json({ error: 'discount_value must be greater than 0' });
      }
      updates.discount_value = value;
    }
    if (b.min_order_amount !== undefined) {
      updates.min_order_amount = Math.max(0, Number(b.min_order_amount) || 0);
    }
    if (b.max_uses !== undefined) {
      updates.max_uses = b.max_uses === '' || b.max_uses == null ? null : parseInt(b.max_uses, 10);
      if (updates.max_uses != null && (!Number.isFinite(updates.max_uses) || updates.max_uses < 1)) {
        return res.status(400).json({ error: 'max_uses must be a positive number or empty' });
      }
    }
    if (b.active !== undefined) updates.active = b.active === true || b.active === 'true';
    if (b.expires_at !== undefined) {
      updates.expires_at = b.expires_at ? new Date(b.expires_at).toISOString() : null;
    }

    if ((updates.discount_type === 'percent' || b.discount_type === 'percent') && updates.discount_value > 100) {
      return res.status(400).json({ error: 'Percent discount cannot exceed 100' });
    }

    const { data, error } = await supabase
      .from('promo_codes')
      .update(updates)
      .eq('id', id)
      .select()
      .single();
    if (error) {
      console.error('Promo update error:', error);
      if (/duplicate|unique/i.test(error.message || '')) {
        return res.status(400).json({ error: 'This promo code already exists' });
      }
      return res.status(500).json({ error: error.message });
    }
    if (!data) return res.status(404).json({ error: 'Promo code not found' });
    res.json({ promo_code: data });
  } catch (err) {
    console.error('Promo update error:', err);
    res.status(500).json({ error: err.message || 'Failed to update promo code' });
  }
});

// Admin: delete promo code
app.delete('/api/admin/promo-codes/:id', requireAdmin, async (req, res) => {
  try {
    if (!supabase) return res.status(503).json({ error: 'Database not configured' });
    const { id } = req.params;
    const { error } = await supabase.from('promo_codes').delete().eq('id', id);
    if (error) {
      console.error('Promo delete error:', error);
      return res.status(500).json({ error: error.message });
    }
    res.json({ success: true });
  } catch (err) {
    console.error('Promo delete error:', err);
    res.status(500).json({ error: err.message || 'Failed to delete promo code' });
  }
});

// Multer (file upload) error handler – return clean JSON instead of HTML
app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ error: 'Image too large. Max 10MB.' });
    }
    console.error('Multer error:', err);
    return res.status(400).json({ error: err.message || 'Upload error' });
  }
  next(err);
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
