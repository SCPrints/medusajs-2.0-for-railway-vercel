# SC Prints — Go-Live Checklist

Cutover from the temporary hosting URLs to the production domains.

| | From (current) | To (cutover) |
| --- | --- | --- |
| **Storefront** | `medusajs-2-0-for-railway-vercel.vercel.app` | **`scprints.com.au`** (+ `www`) |
| **Backend + admin** | `sc-prints-backend.fly.dev` | **`api.scprints.com.au`** |

> **Canonical domain is `scprints.com.au` — NO hyphen.** Never use `sc-prints.com.au`.
> State below was verified against live `fly secrets list --app sc-prints-backend` and
> `vercel env ls production` on **2026-06-01**. Re-verify before switch day if it's been a while.

**Legend:** `[ ]` to do · `[x]`/✅ done · ⚠️ watch-out

---

## 0. Status snapshot (2026-06-01)

- ✅ **Stripe** processing live payments
- ✅ **Backend (Fly) secrets** verified — already strong values; **no secret rotation needed** (do NOT rotate `JWT_SECRET`/`COOKIE_SECRET` — it just logs everyone out)
- ✅ **Storefront (Vercel) env** verified — earlier "looks blank" worries were a stale local pull; the keys are actually set
- ✅ Added `NEXT_PUBLIC_BASE_URL` + `NEXT_SERVER_ACTIONS_ENCRYPTION_KEY` to Vercel **Production** — ⚠️ **pending a redeploy to take effect** (Vercel only applies env vars at build time)
- [ ] Everything in sections 1–9 = the actual domain cutover (not started)

### Fix-now items (live bugs today, independent of the cutover)
- [x] `NEXT_PUBLIC_BASE_URL` set (→ current vercel.app URL) — stops canonical/OG/sitemap pointing at `localhost:8000`
- [x] `NEXT_SERVER_ACTIONS_ENCRYPTION_KEY` set (Production) — stops "Server Action not found" after deploys
- [ ] **Redeploy storefront** so the two vars above actually take effect (`vercel redeploy <prod-url>`, or any normal deploy)
- [ ] (optional) add `NEXT_SERVER_ACTIONS_ENCRYPTION_KEY` to **Preview** too — dashboard → Settings → Env Vars → tick Preview (old CLI can't add Preview-scoped vars non-interactively). Low value (staff preview URLs only).

---

## 1. Code changes to land at cutover

These were drafted, then **reverted** (so a routine deploy can't ship them early). Re-apply in a PR on switch day.

**Load-bearing:**
- [ ] [storefront-origins.ts](../backend/src/lib/storefront-origins.ts) — CORS allowlist `sc-prints.com.au` → `scprints.com.au` (apex **+ www**); comment on line 3
- [ ] [base.tsx](../backend/src/modules/email-notifications/templates/base.tsx) — email **logo `src`** (line ~127) → `https://scprints.com.au/...` (today's hyphenated URL 404s)
- [ ] [Dockerfile](../backend/Dockerfile) line ~32 — `BACKEND_PUBLIC_URL=https://api.scprints.com.au` (baked into admin SPA at build → only deploy once the cert/DNS exist)

**Cosmetic (no breakage):**
- [ ] [base.tsx](../backend/src/modules/email-notifications/templates/base.tsx) footer link → `scprints.com.au`
- [ ] [layout.tsx](../storefront/src/app/layout.tsx) line ~128 preconnect → `https://api.scprints.com.au`
- [ ] [artwork-approval.tsx](../backend/src/modules/email-notifications/templates/artwork-approval.tsx) + [contact-submission.tsx](../backend/src/modules/email-notifications/templates/contact-submission.tsx) preview defaults → `scprints.com.au`
- [ ] [seo-analytics/page.tsx](../backend/src/admin/routes/seo-analytics/page.tsx) hint text → `scprints.com.au`

---

## 2. Backend — Fly secrets (`fly secrets set --app sc-prints-backend KEY=value`)

**Change at cutover:**
- [ ] `STOREFRONT_URL=https://scprints.com.au`
- [ ] `STORE_CORS=https://scprints.com.au,https://www.scprints.com.au` *(currently a single origin)*
- [ ] `AUTH_CORS=` add `https://scprints.com.au,https://www.scprints.com.au,https://api.scprints.com.au`
- [ ] `ADMIN_CORS=https://api.scprints.com.au`
- [ ] `BACKEND_PUBLIC_URL=https://api.scprints.com.au` — ⚠️ **NET-NEW** (not currently set; today it auto-detects `sc-prints-backend.fly.dev` via Fly, which will **not** follow the new domain)
- [ ] `GSC_SITE_URL=https://scprints.com.au/` *(currently the old vercel.app URL)*
- [ ] `MARKETING_PREFERENCE_CENTER_URL=https://scprints.com.au/email-preferences`

**Already correct — no action:** `JWT_SECRET`, `COOKIE_SECRET`, `MEDUSA_ADMIN_PASSWORD`, `NPS_LINK_SECRET`, `UNSUBSCRIBE_LINK_SECRET`, `REVALIDATE_SECRET`, `RESEND_*`, AS Colour / FashionBiz / Aussie Pacific keys, `MEILISEARCH_*`, `REDIS_URL`, `POSTHOG_*`, `GOOGLE_SERVICE_ACCOUNT_JSON`, `ANTHROPIC_API_KEY`, all `*_ENABLED` flags.

---

## 3. Storefront — Vercel env (`vercel env add NAME production`)

**Change at cutover:**
- [ ] `NEXT_PUBLIC_BASE_URL` → `https://scprints.com.au` *(set to vercel.app today; flip on switch day)*
- [ ] `NEXT_PUBLIC_MEDUSA_BACKEND_URL` → `https://api.scprints.com.au`
- [ ] `NEXT_PUBLIC_STRIPE_KEY` → confirm it's `pk_live_…`

**Already set — no action:** `ANTHROPIC_API_KEY`, `NEXT_PUBLIC_POSTHOG_KEY`/`_HOST`, `NEXT_PUBLIC_SEARCH_API_KEY`/`_ENDPOINT`, `REVALIDATE_SECRET` (must match backend), `NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY` (sales-channel scoped, NOT domain), `NEXT_PUBLIC_INDEX_NAME`, `NEXT_PUBLIC_MINIO_ENDPOINT`, `PRINT_PROFILES_ENABLED`.

> ⚠️ Every env change needs a **redeploy** to take effect (`NEXT_PUBLIC_*` are inlined at build time).

---

## 4. Stripe (live)

Live payments are working. Remaining items are **domain-coupled** and happen at cutover:
- [ ] Repoint the **live** webhook endpoints to the new backend (or leave on `sc-prints-backend.fly.dev`, which keeps working):
  - `https://api.scprints.com.au/hooks/payment/stripe_stripe` (Medusa checkout) → its signing secret → `STRIPE_WEBHOOK_SECRET`
  - `https://api.scprints.com.au/hooks/stripe-payment-link` (Payment Links) → `STRIPE_PAYMENT_LINK_WEBHOOK_SECRET` — ⚠️ **currently OFF in prod** (secret not set); only configure if you want Payment Links live
- [ ] Apple Pay / Google Pay: if wallet buttons are used, register `scprints.com.au` under Stripe → Settings → **Payment method domains**
- [ ] After cutover: one **real order** end-to-end → charge shows in Stripe → webhook 200 → Medusa order = **paid** → order email fires → refund

---

## 5. DNS — GoDaddy (`scprints.com.au`)

Add **3 records** (after adding the domains in Vercel + running `fly certs add` so you have the exact targets):

| Purpose | Type | Name | Value | TTL |
| --- | --- | --- | --- | --- |
| Storefront apex → Vercel | A | `@` | `216.150.1.1` | 600 |
| Storefront `www` → Vercel | CNAME | `www` | `ee9ed35776d65ac3.vercel-dns-017.com` | 600 |
| Backend/admin → Fly | CNAME | `api` | `sc-prints-backend.fly.dev` | 600 |

- [ ] Add domains in **Vercel** first (Settings → Domains) → use the exact A/CNAME values it shows (newer projects may show a project-specific CNAME like `cname.vercel-dns-017.com`)
- [ ] `fly certs add api.scprints.com.au` → confirms the `api` CNAME + issues TLS (add `_acme-challenge.api` if it asks; see `fly certs show`)
- [ ] Add the 3 records on GoDaddy

⚠️ **Do NOT** use GoDaddy's "Connect Domain"/Airo wizard or switch nameservers to Vercel — that moves DNS off GoDaddy and you'd have to recreate email.
⚠️ **Leave untouched:** existing **MX** records (Google Workspace — `info@scprints.com.au`) and **TXT** records (`v=spf1…`, Resend DKIM `resend._domainkey…`, `_dmarc`). Deleting any breaks email.
⚠️ If a parked `@` A record / `www` CNAME already exists, **edit** it rather than adding a duplicate.

---

## 6. External dashboards

- [ ] **Vercel** — add `scprints.com.au` + `www`, set primary + www→apex redirect
- [ ] **Fly** — `fly certs add api.scprints.com.au`; verify `fly certs check api.scprints.com.au`
- [ ] **Stripe** — live webhooks at the new backend URL (section 4)
- [ ] **Google Search Console** — add + verify the `scprints.com.au` property (then `GSC_SITE_URL` matches exactly)
- [ ] **GA4** — update the data-stream URL (property ID unchanged)
- [ ] **Resend** — confirm `scprints.com.au` SPF/DKIM/DMARC still valid
- [ ] **ShipStation** — repoint its webhook to `api.scprints.com.au` (if used)

---

## 7. Cutover deploy order

1. [ ] DNS live + Fly cert issued (`api.scprints.com.au`) + Vercel domain added (`scprints.com.au`)
2. [ ] Set the Fly secrets (section 2)
3. [ ] Merge the code PR (section 1), then `cd backend && fly deploy` — rebuilds the admin SPA with the new baked URL
4. [ ] Set the Vercel env (section 3)
5. [ ] Stripe live webhooks → new backend URL (section 4)
6. [ ] Storefront deploy (so new `NEXT_PUBLIC_*` are baked in)
7. [ ] Smoke test (section 8)

---

## 8. Post-cutover smoke test

- [ ] Admin login works at `https://api.scprints.com.au/app`
- [ ] A PDP + the customizer load on `https://scprints.com.au`
- [ ] Customer can log in on the storefront (cross-origin `scprints.com.au` → `api.scprints.com.au`)
- [ ] Place a **real order** → completes → shows in admin → order-placed email arrives
- [ ] `view-source` on the homepage: `<link rel="canonical">` + OG URL = `https://scprints.com.au` (NOT localhost)
- [ ] `https://scprints.com.au/sitemap.xml` + `/robots.txt` use the new host
- [ ] Resubmit sitemap in Search Console

---

## 9. Rollback

- [ ] DNS TTL kept at 600s through cutover → revert records fast if needed
- [ ] Keep the **old** Fly secret values noted before changing, so you can restore
- [ ] `sc-prints-backend.fly.dev` keeps resolving even after the custom domain is added — old webhook URLs still work as a fallback
- [ ] Don't delete the old Vercel `.vercel.app` production alias until the new domain is proven

---

## Appendix — verification commands

```bash
# Backend secrets (names + digests, no values)
fly secrets list --app sc-prints-backend

# Storefront env (use the EXPLICIT environment — unscoped `vercel env ls` hits a CLI bug)
vercel env ls production

# After DNS:
fly certs check api.scprints.com.au
dig scprints.com.au A
dig api.scprints.com.au CNAME

# (housekeeping) the npm-cache permission error that blocks global npm/npx upgrades:
sudo chown -R 501:20 ~/.npm
```
