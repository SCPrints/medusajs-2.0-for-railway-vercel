### local setup
Video instructions: https://youtu.be/PPxenu7IjGM

- `cd /backend`
- `pnpm install` or `npm i`
- Rename `.env.template` ->  `.env`
- To connect to your online database from your local machine, copy the `DATABASE_URL` value auto-generated on Railway and add it to your `.env` file.
  - If connecting to a new database, for example a local one, run `pnpm ib` or `npm run ib` to seed the database.
- `pnpm dev` or `npm run dev`

### requirements
- **postgres database** (Automatic setup when using the Railway template)
- **redis** (Automatic setup when using the Railway template) - fallback to simulated redis.
- **MinIO storage** (Automatic setup when using the Railway template) - fallback to local storage.
- **Meilisearch** (Automatic setup when using the Railway template)

### Stripe payments

- Add **`STRIPE_API_KEY`** (secret key, `sk_test_...` or `sk_live_...`) and **`STRIPE_WEBHOOK_SECRET`** (`whsec_...`) to `backend/.env`. Both are required for the Payment module to register; restart the backend after changing them.
- Add **`NEXT_PUBLIC_STRIPE_KEY`** (publishable key, `pk_test_...` or `pk_live_...`) to the storefront env and redeploy the storefront. Use the same Stripe mode (test vs live) as the backend.
- **Stripe webhook URL:** `{your-backend-origin}/hooks/payment/stripe_stripe` (replace with your public backend URL, e.g. Railway).
- **Recommended webhook events:** `payment_intent.succeeded`, `payment_intent.payment_failed`, `payment_intent.amount_capturable_updated`, and `payment_intent.partially_funded` (when applicable).
- For **local development**, run Stripe CLI: `stripe listen --forward-to localhost:9000/hooks/payment/stripe_stripe`, then set `STRIPE_WEBHOOK_SECRET` to the signing secret the CLI prints.
- Regions must include the **`pp_stripe_stripe`** payment provider for Stripe at checkout. The seed script adds it automatically when both Stripe env vars are set before running migrations/seed; otherwise add Stripe under **Settings → Regions** in Medusa Admin.
- **Smoke-test checkout:** With test keys, complete an order using Stripe’s test card `4242424242424242`, any future expiry, any CVC; confirm the payment appears authorized/captured and the order shows as paid in Admin.

### shipstation setup
- Add `SHIPSTATION_API_KEY` to `backend/.env` (from your ShipStation API settings).
- Restart the backend after updating env vars so the fulfillment provider is registered.
- In Medusa Admin, create shipping options that use the `shipstation` provider.
- Make sure each shipping option stores both `carrier_id` and `carrier_service_code` in its option data (required by the provider to fetch rates/labels).
- Place a test order and create a fulfillment to verify label purchase + cancellation flows.

### commands

`cd backend/`
`npm run ib` or `pnpm ib` will initialize the backend by running migrations and seed the database with required system data.
`npm run dev` or `pnpm dev` will start the backend (and admin dashboard frontend on `localhost:9000/app`) in development mode.
`pnpm build && pnpm start` will compile the project and run from compiled source. This can be useful for reproducing issues on your cloud instance.
