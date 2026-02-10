# BioMed Backend

Node.js Express API with Stripe and Supabase.

## Setup

1. **Environment**
   - Copy `.env.example` to `.env` (or use the existing `.env`).
   - Set `STRIPE_SECRET_KEY` (already set for test mode).
   - Set `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` from your [Supabase](https://supabase.com) project (Settings → API).
   - Optionally set `PORT` (default 5000) and `FRONTEND_URL` (default `http://biomedpharmas.com`).
   - **CORS**: The API allows `FRONTEND_URL`, its http/https variant, `localhost:5173`, and any `*.vercel.app` origin. To allow more origins (e.g. a custom domain), set `ADDITIONAL_ORIGINS` to a comma-separated list (e.g. `https://myapp.com,https://www.myapp.com`).

2. **Supabase**
   - In Supabase Dashboard → SQL Editor, run the script in project root: `supabase-orders-table.sql`.
   - This creates the `orders` table used to store completed payments.

3. **Run**
   - `npm install`
   - `npm run dev` (or `npm start`)

## Test if backend is live (Vercel / any host)

Use these URLs in the browser or with `curl` to confirm the API is running:

| URL | Purpose |
|-----|---------|
| `https://YOUR-BACKEND.vercel.app/api` | Simple live check (returns `{ live: true, ... }`) |
| `https://YOUR-BACKEND.vercel.app/api/live` | Same, explicit "live on Vercel" message |
| `https://YOUR-BACKEND.vercel.app/api/health` | Health check `{ ok: true, ... }` |

Example: `curl https://biomed-backend.vercel.app/api`

## Endpoints

- `GET /api` – Live check (for testing deployment)
- `GET /api/live` – Live check with message
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
