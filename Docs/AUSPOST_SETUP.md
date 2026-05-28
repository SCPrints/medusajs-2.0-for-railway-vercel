# Australia Post API — Setup Checklist

Setting up the AusPost direct integration as a replacement for ShipStation. Two parallel tracks: **account setup** (you, ~5-10 days of waiting) and **code rollout** (already built and merged, gated behind env vars).

This integration replaces the AU$77/mo ShipStation bill with a free direct API and per-label AusPost charges through your existing MyPost Business charge account.

---

## Account setup — do these in this order

### 1. Create a MyPost Business account *(5 minutes)*

- Go to https://auspost.com.au/business/shipping/mypost-business
- Sign up with the SC Prints ABN + business email
- Complete the verification flow
- **Record**: your MyPost Business **account number** (visible top-right after login)

### 2. Apply for a Credit (Charge) Account *(can take a week)*

Without this you get **per-label card debits** instead of monthly invoices. This is the only step you don't want to skip — start it on day 1.

- In the MyPost Business portal, navigate to **Payment Settings → Credit Account**
- Or email `mypostbusiness@auspost.com.au` and ask to be set up with a credit account against your MyPost Business account
- AusPost will request:
  - ABN, trading name, business address
  - Estimated monthly parcel volume
  - Bank reference / trade references for credit check
- **Record**: the **credit account number** (CAN) once issued

### 3. Register at the Developer Centre *(5 minutes)*

- Go to https://developers.auspost.com.au/register
- Use the same email tied to your MyPost Business account
- Verify via the email link

### 4. Submit the Shipping & Tracking API registration *(manual review, days)*

- Go to https://developers.auspost.com.au/apis/st-registration
- Fill in:
  - **Application name**: "SC Prints Storefront"
  - **MyPost Business account number** (from step 1)
  - **Use case**: Multi-channel e-commerce storefront generating consignments + labels for AU domestic delivery
  - **Test bed required**: ✓ Yes (mandatory — you'll do all integration testing here first)
- AusPost reviews manually. Expect 2-5 business days.

### 5. Receive credentials *(automatic on approval)*

You'll receive **two sets** of creds (testbed + production):

| What you get | Where it goes in `.env` |
|---|---|
| MyPost Business **Account Number** (10-digit) | `AUSPOST_ACCOUNT_NUMBER` |
| **API Key** (a UUID) | `AUSPOST_API_KEY` |
| **API Password** (the key's secret) | `AUSPOST_API_PASSWORD` |

### 5a. ⚠️ STOP — confirm your credential shape (v1 vs v2)

AusPost runs **two** API generations and this integration targets the classic **v1 (HTTP Basic Auth)** one that MyPost Business accounts use. Before going further, look at what you were issued:

- ✅ **API key (a UUID) + password** → you have **v1**. This code works as-is. Continue.
- ⚠️ **OAuth `client_id` + `client_secret`** (no plain key/password) → you were issued the newer **v2 / Parcel Send** generation. The endpoint shapes differ and the client needs an auth + endpoint swap. **Stop and flag this** before configuring — don't try to force v2 creds into the v1 vars.

If you're unsure, ask your AusPost onboarding contact "is my Shipping & Tracking API access v1 (Basic Auth) or v2 (OAuth)?" The answer determines whether this code runs unchanged.

### 6. Verify the studio's ship-from address in MyPost Business *(5 minutes)*

- Open **Settings → Senders**
- Confirm the SC Prints studio address is set as the default sender
- This is the `from` address on every shipment unless overridden per-fulfillment

---

## Code rollout

The integration is already built. Three flip-the-switch stages:

### Stage 1: Configure testbed and dry-run *(when testbed creds arrive)*

Set on the Fly backend secrets:

```bash
fly secrets set --app sc-prints-backend \
  AUSPOST_API_KEY="<testbed-api-key-uuid>" \
  AUSPOST_API_PASSWORD="<testbed-api-password>" \
  AUSPOST_ACCOUNT_NUMBER="<account-number>" \
  AUSPOST_TEST_MODE="true" \
  AUSPOST_WAREHOUSE_POSTCODE="<studio-postcode>" \
  AUSPOST_WAREHOUSE_STATE="NSW" \
  AUSPOST_WAREHOUSE_CITY="<studio-suburb>" \
  AUSPOST_WAREHOUSE_ADDRESS_1="<studio-street>" \
  AUSPOST_WAREHOUSE_PHONE="<studio-phone>" \
  AUSPOST_WAREHOUSE_NAME="SC Prints"
```

On next deploy, the AusPost provider is registered alongside ShipStation. **Carts still route through ShipStation** because `LIVE_SHIPPING_PROVIDER` defaults to `shipstation`.

Test:
1. Admin → `/app/reports/system-health` — confirm the "Australia Post" tile shows `ok`
2. Re-run the seed (or create shipping options manually in admin) to provision the `auspost_parcel_au` + `auspost_express_au` options
3. Place a test order via admin (with a real customer address) and watch the order detail page — the **AusPost parcels widget** should render after the first 4h tracking-poll tick

### Stage 2: Cut over to AusPost *(when testbed is green + you have prod creds)*

Re-set the same env vars with **production** values, set `AUSPOST_TEST_MODE=false`, and flip:

```bash
fly secrets set --app sc-prints-backend LIVE_SHIPPING_PROVIDER=auspost
```

From this moment new carts >3kg quote AusPost rates instead of ShipStation. Existing orders that were already booked through ShipStation continue to be tracked via the ShipStation webhook unchanged.

**Verify within the first hour:**
- A real test order at full price (use a $1 SKU and refund yourself)
- Visual QA of the printed PDF label vs the studio's label printer template
- Tracking ID appears in the AusPost parcels widget
- Customer ORDER_SHIPPED email fires once the tracking poll picks up the first lodgement event

### Stage 3: Deprecate ShipStation *(after 2-4 weeks of clean AusPost data)*

When you've shipped at least 50 AusPost parcels with no operational issues:

1. Cancel the ShipStation subscription via their dashboard
2. Remove the `SHIPSTATION_*` secrets:
   ```bash
   fly secrets unset --app sc-prints-backend \
     SHIPSTATION_API_KEY SHIPSTATION_WEBHOOK_SECRET \
     SHIPSTATION_WAREHOUSE_POSTCODE SHIPSTATION_WAREHOUSE_COUNTRY_CODE \
     SHIPSTATION_WAREHOUSE_CITY SHIPSTATION_WAREHOUSE_STATE \
     SHIPSTATION_WAREHOUSE_NAME SHIPSTATION_WAREHOUSE_ADDRESS_1 \
     SHIPSTATION_WAREHOUSE_PHONE
   ```
   The ShipStation module will not be registered on next boot — the existing module files stay in the repo as a historical reference until the next cleanup pass.

---

## Differences vs ShipStation you should know about

| Surface | ShipStation | AusPost direct |
|---|---|---|
| Tracking updates | Webhook push (real-time) | Poll every 4h via `sync-auspost-tracking` cron |
| Label format | PDF (4×6" thermal default) | PDF A4-1pp default; override with `AUSPOST_LABEL_FORMAT` + `AUSPOST_LABEL_LAYOUT` |
| Carrier choice | Multi-carrier rate shop | AusPost services only (Parcel Post / Express Post) |
| Charging | Per-label, billed monthly via ShipStation | Per-label, billed monthly via MyPost Business charge account |
| Cancel label after lodgement | Possible via void endpoint | Only via MyPost Business UI — API DELETE returns 4xx once manifested |
| ABN on label | Optional | **Required** for international shipments (set `AUSPOST_WAREHOUSE_ABN`) |

---

## Operational gotchas

- **Test bed labels are generic**. The testbed will return a sample PDF regardless of payload contents. Visual QA must happen against one real production label before the cutover.
- **AusPost label URLs are signed and expire**. If a label hasn't been printed within a few hours, the URL 403s — regenerate via `POST /labels` with the same `shipment_id`. Surfacing a "Regenerate label" button is a follow-up.
- **First tracking event takes hours after lodgement**. The 4-hour cron is sized for this — don't expect events to appear in the widget until AusPost has scanned the parcel at a lodgement point.
- **Address fields are stricter**. Suburb + 3-letter state code + postcode + country are mandatory on both ends. The mapping layer normalises NSW/Victoria/Queensland/etc. but if a customer enters "New South Wales" it converts to `NSW`. Invalid state strings will fail the rate quote with an opaque API error.

---

## When things break

Run the system-health check first:
- `GET /admin/reports/system-health` → look for the "Australia Post" tile
- `unset` = env vars missing
- `down` = DNS/network broken or the API root is unreachable
- `ok` = reachable, doesn't prove auth works (no auth ping; we'd burn token quota)

If shipments fail to create, check the Fly logs for the `AusPost /shipments failed` message — the error array AusPost returns has codes that map directly to the developer reference docs.

If tracking events stop syncing, check the cron logs for `AusPost tracking sync: nothing to poll` (expected when there are no shipments in flight) vs error messages.

---

## References

- [AusPost Developer Centre](https://developers.auspost.com.au/)
- [Shipping & Tracking API Reference](https://developers.auspost.com.au/docs/reference)
- [Getting started — Shipping and Tracking](https://developers.auspost.com.au/apis/shipping-and-tracking/getting-started)
- [Test bed environment docs](https://developers.auspost.com.au/apis/shipping-and-tracking/info/integration/testbed-environment)
- [MyPost Business — pricing + signup](https://auspost.com.au/business/shipping/mypost-business)
- Codebase entry points:
  - Module: [backend/src/modules/auspost/](../backend/src/modules/auspost/)
  - Cron: [backend/src/jobs/sync-auspost-tracking.ts](../backend/src/jobs/sync-auspost-tracking.ts)
  - Admin widget: [backend/src/admin/widgets/order-auspost-parcels.tsx](../backend/src/admin/widgets/order-auspost-parcels.tsx)
  - Constants: [backend/src/lib/constants.ts](../backend/src/lib/constants.ts) (search for `AUSPOST_`)
