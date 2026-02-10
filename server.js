import 'dotenv/config';
import crypto from 'crypto';
import express from 'express';
import cors from 'cors';
import jwt from 'jsonwebtoken';
import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';
import { products, getProductById } from './products.js';

const app = express();
const PORT = process.env.PORT || 5000;
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://biomedpharmas.com';
const JWT_SECRET = process.env.JWT_SECRET || 'change-me-in-production';
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@biomed.com';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';

const stripe = Stripe(process.env.STRIPE_SECRET_KEY);
const supabase = process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY
  ? createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
  : null;

app.use(cors({ origin: FRONTEND_URL, credentials: true }));
app.use(express.json());

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

// Health check
app.get('/api/health', (req, res) => {
  res.json({ ok: true, message: 'BioMed API running' });
});

// Static products (for consistency with frontend)
app.get('/api/products', (req, res) => {
  res.json(products);
});

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
    for (const item of items) {
      const product = getProductById(item.id);
      const price = product ? product.discountedPrice : (item.discountedPrice ?? item.price);
      const name = product ? product.name : item.name;
      const qty = Math.max(1, parseInt(item.quantity, 10) || 1);
      // Stripe amounts in smallest unit: PKR uses paise (1 PKR = 100 paise)
      lineItems.push({
        price_data: {
          currency: 'pkr',
          product_data: {
            name,
            images: item.image ? [new URL(item.image, FRONTEND_URL).href] : undefined,
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
    const { items, customer } = req.body;
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
    const amountTotalPaise = Math.round(amountTotal * 100);

    if (!supabase) {
      return res.status(503).json({ error: 'Orders temporarily unavailable' });
    }

    const codSessionId = 'cod_' + crypto.randomUUID();
    const { data, error } = await supabase.from('orders').insert({
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
    }).select().single();

    if (error) {
      console.error('COD order error:', error);
      return res.status(500).json({ error: error.message || 'Failed to place order' });
    }
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

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
