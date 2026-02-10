# BioMed Backend

Node.js Express API with Stripe and Supabase.

## Setup

1. **Environment**
   - Copy `.env.example` to `.env` (or use the existing `.env`).
   - Set `STRIPE_SECRET_KEY` (already set for test mode).
   - Set `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` from your [Supabase](https://supabase.com) project (Settings → API).
   - Optionally set `PORT` (default 5000) and `FRONTEND_URL` (default `http://localhost:5173`).

2. **Supabase**
   - In Supabase Dashboard → SQL Editor, run the script in project root: `supabase-orders-table.sql`.
   - This creates the `orders` table used to store completed payments.

3. **Run**
   - `npm install`
   - `npm run dev` (or `npm start`)

## Endpoints

- `GET /api/health` – Health check
- `GET /api/products` – Static product list
- `POST /api/create-checkout-session` – Create Stripe Checkout session (body: `items`, `successUrl`, `cancelUrl`, `customerEmail`)
- `GET /api/checkout-session/:sessionId` – Retrieve session (e.g. for success page)
- `POST /api/orders` – Save order to Supabase after payment (body: `sessionId`)

## Admin dashboard

- Set `ADMIN_EMAIL`, `ADMIN_PASSWORD`, and `JWT_SECRET` in `.env` (see `.env.example`).
- Admin login: **POST /api/admin/login** with `{ "email", "password" }` returns a JWT.
- Orders list: **GET /api/admin/orders** with header `Authorization: Bearer <token>`.
- Frontend: open **/admin** to sign in, then **/admin/dashboard** to view orders.

## Stripe

- Uses **test** keys; use test card `4242 4242 4242 4242`.
- Payments are in **PKR** (Pakistani Rupee). If your Stripe account does not support PKR, change `currency` in `server.js` to `'usd'` and convert amounts.
