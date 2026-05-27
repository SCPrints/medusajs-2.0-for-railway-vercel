# Customer fulfillment service — Phase 2 spec (customer portal)

**Status**: spec v2 — post codebase audit, awaiting approval to implement
**Last updated**: 2026-05-27
**Author**: Claude session with Sean
**Scope**: customer-facing self-service portal on the existing storefront
**Depends on**: Phase 1 (admin foundation) must be shipped first

---

## What this is

Customer members of an organisation (owners, purchasers, viewers) log into the existing storefront's `/account` area and self-serve their fulfillment workflow:

- Browse the org's pre-approved designs in a gallery
- See current inventory levels for every `(design, garment)` SKU
- See the org's destination network (read-only — Phase 1 decision)
- Place new orders (design-first flow, single destination per submission, auto-create)
- View order history filtered to their org with live production-stage tracking

No new auth, no new top-level routes — Phase 2 extends [`/account/organisations`](../storefront/src/app/[countryCode]/(main)/account/@dashboard/organisations/page.tsx) with rich per-org tabs.

## What this is not

- **Not a customizer flow** — designs are locked artwork (Phase 1 Q9). The portal opens no Fabric.js canvas. If the customer wants new artwork, they email SC Prints; staff adds it as a new `organisation_design`.
- **Not a checkout/payment flow** — standing arrangement, no Stripe involvement. Orders submit straight through.
- **Not a destination-management UI** — Phase 1 Q4 keeps destinations admin-only. Customer sees them read-only with a "Contact us to add a destination" CTA.
- **Not a multi-destination batch** — one submission = one destination = one Medusa order (Phase 2 Q4).
- **Not a draft-orders system** — auto-create is the policy (Phase 2 Q2). The portal does NOT have a "save for later" step.

---

## Surface map

```
/[countryCode]/account                                    (existing dashboard)
/[countryCode]/account/orders                             (existing — filter ADDED to hide
                                                           metadata.fulfillment_order=true)
/[countryCode]/account/organisations                      (existing list page)
/[countryCode]/account/organisations/[id]                 (NEW — single page with horizontal
                                                           tabs; sub-views as internal state)
  ├── overview                       (default tab, brief summary)
  ├── designs                        (gallery, read-only)
  ├── inventory                      (full grid, read-only — admin parity)
  ├── destinations                   (list, read-only)
  ├── orders                         (history, filtered to this org)
  └── members                        (NET NEW — gated by owner role)
/[countryCode]/account/organisations/[id]/orders/new      (NEW — order placement form)
/[countryCode]/account/organisations/[id]/orders/[oid]    (NEW — single order detail)
```

**Sub-navigation pattern**: horizontal tabs WITHIN `/account/organisations/[id]` (decision confirmed P2-Q9 below). The top-level `/account` uses sidebar navigation per the existing convention ([`account-layout.tsx`](../storefront/src/modules/account/templates/account-layout.tsx)), but the org-detail page uses internal tabs because it's a nested workspace with rich tabular views.

All routes are prefixed by `[countryCode]` per the existing storefront convention. All gated by Medusa customer auth (`Bearer` JWT from `_medusa_jwt` cookie via `getAuthHeaders()`) + org membership check on the backend store routes.

---

## Role gating

The existing `organisation_member.role` enum drives everything:

| Tab / action | viewer | purchaser | owner |
|---|---|---|---|
| Overview, Designs, Inventory, Destinations, Orders list | read | read | read |
| Order detail | read | read | read |
| Place new order | — | yes | yes |
| Cancel own org's order within 24h of placement | — | yes | yes |
| Members tab | — | — | yes |

All store routes enforce this at the API layer. UI elements are conditionally rendered AND server-side validated — never trust the client.

**404 vs 403**: customers who aren't members of an org get a 404 on every route (not a 403) so org IDs aren't enumerable, per the existing CLAUDE.md auth convention.

---

## Page-by-page detail

### Overview tab (default)

```
┌─────────────────────────────────────────────────────────────────┐
│ Lifegrain Cafe                                                   │
│ ──────────────                                                   │
│                                                                  │
│ Quick stats                                                      │
│ ┌──────────────┐ ┌──────────────┐ ┌──────────────┐             │
│ │ 8 designs    │ │ 12 stores    │ │ 28 SKUs      │             │
│ └──────────────┘ └──────────────┘ └──────────────┘             │
│                                                                  │
│ Recent orders                                          [View all]│
│ ┌─────────────────────────────────────────────────────────────┐ │
│ │ #3902  Logo White × 3 SKUs  Sutherland   In production      │ │
│ │ #3901  Logo Black × 2 SKUs  Liverpool    Shipped 2d ago     │ │
│ │ #3900  Plume White × 1 SKU  Randwick     Delivered          │ │
│ └─────────────────────────────────────────────────────────────┘ │
│                                                                  │
│ Need to restock?                                                 │
│ ┌─────────────────────────────────────────────────────────────┐ │
│ │  +  Place new order                                          │ │
│ └─────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

Stats are live numbers. Recent orders is 5 most recent. The Place-new-order CTA is the main call to action — disabled with a tooltip for `viewer` role.

### Designs tab

Read-only gallery. Same shape as the admin Designs tab but no add/edit affordances.

```
┌─────────────────────────────────────────────────────────────────┐
│ Designs                                                          │
│ ───────                                                          │
│ ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐                    │
│ │ [img]  │ │ [img]  │ │ [img]  │ │ [img]  │                    │
│ │ Logo   │ │ Logo   │ │ Plume  │ │ Tsubu  │                    │
│ │ White  │ │ Black  │ │ White  │ │ Slogan │                    │
│ │ 6 SKUs │ │ 6 SKUs │ │ 4 SKUs │ │ 3 SKUs │                    │
│ └────────┘ └────────┘ └────────┘ └────────┘                    │
│ ...                                                              │
│                                                                  │
│ Need new artwork? Contact SC Prints to add a design.            │
└─────────────────────────────────────────────────────────────────┘
```

Click a design → modal with the full thumbnail and the list of SKUs it's available on. No download links to print files (those are staff-only).

### Inventory tab

**Decision: admin parity** — customer sees the same grid as admin, read-only.

```
┌──────────────────────────────────────────────────────────────────────────┐
│ Inventory                                                                  │
│ ──────────                                                                 │
│ Design          Garment           Mode    On Hand  Reserved  Avail  Reorder│
│ Logo White      LifeGrain S      [Held]      76      20       56    ≤10  │
│ Logo White      LifeGrain M      [Held]      59      12       47    ≤10  │
│ Logo White      Plume XL         [PoD]        —       —        —      —  │
│ Logo Black      LifeGrain S      [Held]      40       8       32    ≤10  │
│ Plume White     Tsubu S          [Held]      22       3       19    ≤8   │
│                                                                            │
│ 28 SKUs across 8 designs. 3 below reorder point.                          │
│ Filters: [All designs ▾] [All modes ▾] [Below reorder ☐]                 │
└──────────────────────────────────────────────────────────────────────────┘
```

Differences from admin grid:
- No edit / drawer / movement-log actions
- "Below reorder" filter is just informational for the customer — they can see which SKUs they should plan a larger reorder for
- Movement log access deferred to a later phase (the customer doesn't need a daily ledger; they care about current state)

### Destinations tab

```
┌─────────────────────────────────────────────────────────────────┐
│ Destinations                                                     │
│ ────────────                                                     │
│ Name                            City          Active             │
│ Lifegrain Sutherland Hospital   Sutherland    ✓                  │
│ Lifegrain Liverpool             Liverpool     ✓                  │
│ Plume Randwick                  Randwick      ✓                  │
│ Plume Hurstville                Hurstville    ✓                  │
│ Tsubu Liverpool                 Liverpool     ✓                  │
│ ...                                                              │
│                                                                  │
│ Need to add or change a destination?                             │
│ Contact SC Prints and we'll set it up.                          │
└─────────────────────────────────────────────────────────────────┘
```

Click a row → modal showing the full address + delivery notes + contact at that destination. Useful for the purchaser to verify before placing an order.

### Orders tab

Order history filtered to this org. Reuses the existing storefront order list components where possible.

```
┌─────────────────────────────────────────────────────────────────┐
│ Order history                                                    │
│ ─────────────                                                    │
│ Order   Date         Destination       Designs       Stage       │
│ #3902   2026-05-27   Sutherland Hosp.  Logo White,   In production│
│                                          Logo Black                │
│ #3901   2026-05-24   Liverpool          Logo Black    Shipped     │
│ #3900   2026-05-20   Randwick           Plume White   Delivered   │
│ ...                                                              │
│                                                                  │
│ [Load more]                                                      │
│                                                                  │
│ Filters: [All destinations ▾] [All designs ▾] [Last 90 days ▾] │
└─────────────────────────────────────────────────────────────────┘
```

Click a row → order detail page.

### New Order page (design-first flow)

The most complex page in Phase 2. Single page, three sections.

```
┌─────────────────────────────────────────────────────────────────┐
│ New order for Lifegrain Cafe                                     │
│ ────────────────────────────                                     │
│                                                                  │
│ 1. Where is this going?                                          │
│    Destination: [Lifegrain Sutherland Hospital ▾]               │
│                                                                  │
│ 2. What do you need?                                             │
│    ┌────────────────────────────────────────────────────────┐  │
│    │ Design       Garment        Mode    Avail   Qty   Line $│  │
│    │ Logo White   LifeGrain S    [Held]    56    [10]  $140  │  │
│    │ Logo White   LifeGrain M    [Held]    47    [ 6]  $84   │  │
│    │ Plume White  Plume L        [PoD]      —    [ 2]  $36   │  │
│    │                                                          │  │
│    │ + Add Item                                               │  │
│    └────────────────────────────────────────────────────────┘  │
│                                                                  │
│ 3. Anything else?                                                │
│    Your ref: [____________]   Need by: [____________]           │
│    Notes:    ┌──────────────────────────────────────────────┐  │
│              │                                                │  │
│              └──────────────────────────────────────────────┘  │
│                                                                  │
│                            Total: $260.00                        │
│                            [Cancel]  [Submit order]              │
└─────────────────────────────────────────────────────────────────┘
```

**The "+ Add Item" interaction** — two-step picker matching the admin flow:

1. Modal opens with the org's active designs as a thumbnail grid (8 tiles). Click one.
2. Modal swaps to that design's available SKUs — a list of `(garment, size)` rows with Mode badge + Availability. Enter a qty, click "Add to order".

Both steps are bottom-sheet on mobile (per the storefront responsive conventions).

**Validation**:
- Submit disabled if no destination, no lines, or any qty is 0
- Submit disabled with tooltip for `viewer` role
- "Are you sure?" confirmation modal on click — shows total, destination, line count
- Over-allocation: if a held_stock line exceeds availability, inline amber text "We'll print [N] additional units — adds approximately [lead_time] days to that line's delivery."

**Submission**:
- POST to `/store/customers/me/organisations/[id]/orders`
- Spinner; success → redirect to the new order's detail page
- Failure → toast with retry; form state preserved

### Order detail (customer view)

Reuses the existing storefront order detail layout (which already shows the production-stage tracker) and adds a fulfillment-context block:

```
┌─────────────────────────────────────────────────────────────────┐
│ Order #3902                                       In production  │
│ ─────────────                                                    │
│                                                                  │
│ ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░             │
│ Received → Artwork → Production → Shipped → Delivered           │
│                                                                  │
│ Shipping to                                                      │
│ Lifegrain Sutherland Hospital                                    │
│ 123 Acuna St, Sutherland NSW 2232                                │
│ Gate code: 2200 · Receiving 7am-3pm Mon-Fri                      │
│                                                                  │
│ Items                                                            │
│ ┌─────────────────────────────────────────────────────────────┐ │
│ │ [img] Logo White × LifeGrain S          10   $14.00  $140.00│ │
│ │ [img] Logo White × LifeGrain M           6   $14.00   $84.00│ │
│ │ [img] Plume White × Plume L              2   $18.00   $36.00│ │
│ └─────────────────────────────────────────────────────────────┘ │
│                                                                  │
│ Your ref: 8517 · Placed by Alex Chen · 2026-05-27 14:32         │
│                                                                  │
│ Need to change this order? [Cancel order]                        │
│ (Available for 24h after placement)                              │
└─────────────────────────────────────────────────────────────────┘
```

Existing components reused: the production-stage tracker, the order-line image renderer (now also handles `metadata.organisation_design_id` to render the design thumbnail), the order header.

**Cancel-order button**: visible only if `created_at` < 24h ago AND the role allows. Clicking submits to a Phase 2 cancel route which calls Medusa's `cancelOrderWorkflow` — the Phase 1 `fulfillment-on-order-cancelled` subscriber then writes the `release` movements automatically.

---

## Storefront data layer

New module: [`storefront/src/lib/data/organisations.ts`](../storefront/src/lib/data/organisations.ts) (probably extending the existing one if it exists).

```ts
export async function getMyOrganisations(): Promise<OrganisationWithRole[]>

export async function getOrganisationDetail(
  id: string
): Promise<OrganisationDetail | null>

export async function getOrganisationDesigns(
  id: string
): Promise<OrganisationDesign[]>

export async function getOrganisationDestinations(
  id: string,
  opts?: { activeOnly?: boolean }
): Promise<OrganisationDestination[]>

export async function getOrganisationInventory(
  id: string,
  opts?: {
    designId?: string
    mode?: "held_stock" | "print_on_demand"
    belowReorderOnly?: boolean
  }
): Promise<InventoryRowWithAvailability[]>

export async function getOrganisationOrders(
  id: string,
  opts?: {
    page?: number
    pageSize?: number
    designId?: string
    destinationId?: string
    stage?: ProductionStage
    since?: string  // ISO date
  }
): Promise<{ orders: OrderWithFulfillmentContext[]; count: number }>

export async function placeOrganisationOrder(
  id: string,
  payload: {
    destination_id: string
    items: Array<{ org_inventory_id: string; quantity: number }>
    external_ref?: string
    required_by?: string  // ISO date
    notes?: string
  }
): Promise<{ order_id: string }>

export async function cancelOrganisationOrder(
  id: string,
  orderId: string
): Promise<void>
```

All functions auto-attach the `x-publishable-api-key` + auth bearer per the existing storefront SDK pattern. Tags on responses for the cache invalidation pipeline (see below).

---

## Store API routes (new)

| Method | Path | Role required |
|---|---|---|
| `GET` | `/store/customers/me/organisations/[id]/designs` | any member |
| `GET` | `/store/customers/me/organisations/[id]/destinations` | any member |
| `GET` | `/store/customers/me/organisations/[id]/inventory` | any member |
| `GET` | `/store/customers/me/organisations/[id]/orders` | any member |
| `GET` | `/store/customers/me/organisations/[id]/orders/[oid]` | any member |
| `POST` | `/store/customers/me/organisations/[id]/orders` | purchaser or owner |
| `POST` | `/store/customers/me/organisations/[id]/orders/[oid]/cancel` | purchaser or owner (within 24h) |

Each route:
1. Authenticates via the existing `authenticate("customer", ["session", "bearer"])` middleware
2. Looks up `organisation_member` where `customer_id = req.auth_context.actor_id AND organisation_id = req.params.id` — 404 if no row
3. Checks role for write operations — 403 if insufficient
4. Returns the data

**Customer-of-record on portal orders (resolved in this spec)**:
- `order.customer_id = organisation.primary_contact_customer_id` (consistent with Phase 1)
- `order.metadata.placed_by_customer_id = <actual member who clicked submit>` so audit/history is preserved
- "Placed by" in the customer-facing order detail page reads from `metadata.placed_by_customer_id`

This keeps Phase 1's invariant ("an org has exactly one customer-of-record on orders") while preserving the audit trail of which member actually placed each order.

---

## Email notifications

When a portal order is placed, Phase 1's existing `order.placed` event fires — but we extend the existing `order-placed.ts` subscriber to branch on `metadata.fulfillment_order`:

| Event | Recipient | Template |
|---|---|---|
| Fulfillment order placed (portal) | Org's `primary_contact_customer_id` | New `fulfillment-order-placed.tsx` template — confirms order details, destination, items, ETA |
| Fulfillment order placed (portal) | `FULFILLMENT_NOTIFICATION_EMAIL` (new env var) | Internal alert to production team: "New fulfillment order from [org]" |
| Existing production-stage emails (awaiting_approval, in_production, shipped, delivered) | Same as before | Already fire from the Phase 1 subscriber |

The new internal alert uses `FULFILLMENT_NOTIFICATION_EMAIL` so production staff get heads-up immediately without monitoring `/app/orders`. Falls back to `ORDER_NOTIFICATION_EMAIL` if unset.

**Marketing-email gate not needed** — these are transactional confirmations, not marketing.

---

## Storefront cache invalidation

The storefront uses Next.js cache tags. New tags introduced in Phase 2:

```ts
// storefront/src/lib/util/cache-tag-keys.ts (extends existing)
export const ORG_DESIGNS_TAG = (orgId: string) => `org:${orgId}:designs`
export const ORG_DESTINATIONS_TAG = (orgId: string) => `org:${orgId}:destinations`
export const ORG_INVENTORY_TAG = (orgId: string) => `org:${orgId}:inventory`
export const ORG_ORDERS_TAG = (orgId: string) => `org:${orgId}:orders`
```

**Cache writes**:
- All four `GET` endpoints set the matching tag on their response

**Cache invalidations** (from backend → storefront via the existing `/api/revalidate-products` pattern, extended to `/api/revalidate-org`):
- Admin creates/updates a design → invalidate `org:${orgId}:designs`
- Admin creates/updates a destination → invalidate `org:${orgId}:destinations`
- Inventory movement (any kind) → invalidate `org:${orgId}:inventory`
- Order placed/shipped/cancelled → invalidate `org:${orgId}:orders` (and `inventory` if a movement happened)

This keeps customer-portal pages fresh without per-request DB queries hitting the backend on every page load. The backend webhook hits the storefront with the tag list to invalidate; storefront route returns 200/503.

---

## Mobile / responsive

Per CLAUDE.md storefront breakpoint conventions:

- **Phone (< 768px)**: navigation is the existing burger menu. Tabs become a dropdown or horizontal-scroll pill row. Inventory grid degrades to stacked cards (one row = one card with design + garment + status + avail). New Order page becomes single-column with the design picker as a bottom sheet.
- **Tablet (768–1024px)**: tabs render as a horizontal row. Inventory grid stays as a table with hidden lower-priority columns (reorder point hidden on tablet).
- **Desktop (≥ 1024px)**: full layouts as wireframed above.

Touch targets ≥ 44×44 on all interactive elements. Safe-area-inset on any sticky elements (the Submit button on the New Order page becomes sticky on mobile).

The bottom-sheet design picker uses the existing storefront drawer primitive — no new component needed.

---

## PostHog events

| Event | Trigger | Properties |
|---|---|---|
| `portal_organisation_viewed` | Org detail page load | org_id, tab |
| `portal_designs_viewed` | Designs tab activated | org_id, design_count |
| `portal_inventory_viewed` | Inventory tab activated | org_id, sku_count, below_reorder_count |
| `portal_new_order_started` | "Place new order" clicked | org_id |
| `portal_new_order_destination_selected` | Destination picked | org_id, destination_id |
| `portal_new_order_item_added` | Item added to order | org_id, design_id, variant_id, qty |
| `portal_new_order_submitted` | Submit clicked, success | org_id, destination_id, line_count, total |
| `portal_new_order_failed` | Submit failed | org_id, error_code |
| `portal_order_cancelled` | Customer cancels within 24h | org_id, order_id, age_hours |

These layer onto the existing `fulfillment_order_created` Phase 1 event — Phase 1 fires on every fulfillment order regardless of source; the `portal_*` events fire only on portal-placed ones.

---

## Resolved decisions

All Phase 2 structural questions are answered.

| # | Decision | Choice |
|---|---|---|
| P2-Q1 | Order placement flow shape | **Design-first**. Pick design from gallery → pick garment+size from that design's locked inventory rows → enter qty. Repeat. Then pick destination once. |
| P2-Q2 | Approval workflow | **Auto-create**. Portal orders become real fulfillment orders immediately. Locked combinations + locked artwork mean no scope for the customer to go off-spec. |
| P2-Q3 | Inventory visibility | **Full admin-parity grid**. Customer sees on_hand, reserved, available, reorder_point, lead_time. Unusual for B2B but means we reuse the admin grid component + gives customer operational visibility for their own planning. |
| P2-Q4 | One destination vs. multi-destination per submission | **One destination per submission**. Each submission = one shipment to one store. Restocking 3 stores = 3 submissions. Simpler model, 1:1 with Medusa orders. |
| P2-Q5 | Customer-of-record on portal orders | **`organisation.primary_contact_customer_id` stays as the Medusa `customer_id`**. The actual placing customer goes on `order.metadata.placed_by_customer_id`. Preserves Phase 1's invariant + the audit trail. |
| P2-Q6 | Customer self-cancel | **24h window, then locked**. Within 24h of placement, purchaser/owner can cancel via a button on the order detail. After 24h, contact SC Prints. The 24h Phase 1 `release` movement subscriber handles the stock side. |
| P2-Q7 | Storefront cache strategy | **Tag-based invalidation** extending the existing `revalidate-products` pattern. New `/api/revalidate-org` endpoint receives tags from backend on writes. |
| P2-Q8 | Internal notification on portal order | **New env var `FULFILLMENT_NOTIFICATION_EMAIL`**, falls back to `ORDER_NOTIFICATION_EMAIL`. |
| P2-Q9 | Sub-navigation pattern inside `/account/organisations/[id]` | **Horizontal tabs within the page**. Single URL, internal tab state. Visually consistent with the admin org-detail page. Slightly diverges from `/account`'s sidebar pattern, but tabs scale better for the 7 sub-views than a nested sidebar would. |
| P2-Q10 | Top-level `/account/orders` order history pollution | **Filter to hide `metadata.fulfillment_order = true`**. The primary contact still sees personal-purchase order history without it being drowned out by org-restock orders. Fulfillment orders surface only in `/account/organisations/[id]/orders`. |

---

## Implementation order

| # | Work | Est | Notes |
|---|---|---|---|
| 1 | Store API: 5 new GET routes (designs, destinations, inventory, orders, order detail) | 1.5 days | Each filters by org_member auth |
| 2 | Store API: POST orders (place) + POST orders/cancel | 1 day | Wraps Phase 1 `createOrderWorkflow` invocation with auth + role checks |
| 3 | Storefront data layer (organisations.ts extensions + types) — uses `"use cache"` + `cacheTag()` + `cacheLife()` pattern proven in [`data/products.ts`](../storefront/src/lib/data/products.ts) | 0.5 day | |
| 4 | Account org detail page — single-page with horizontal tab navigation | 1 day | Build a Tabs primitive if not already in the storefront UI kit |
| 5 | Overview tab (stats + recent orders + CTA) | 0.5 day | |
| 6 | Designs tab (gallery + modal) | 1 day | Read-only |
| 7 | Inventory tab (full grid, customer view) | 1 day | Mostly reuses the admin grid component |
| 8 | Destinations tab (list + modal) | 0.5 day | Read-only |
| 9 | Orders tab (history list + filters) | 1 day | |
| 10 | **Filter top-level `/account/orders` to exclude `metadata.fulfillment_order = true`** | 0.25 day | Audit finding — prevents the primary contact's order history being flooded by org restock orders |
| 11 | **Members tab — NET NEW invite + remove + change-role UI** (admin REST already exists in Phase 1) | 1.5 days | Audit confirmed no existing member-management UI on the storefront |
| 12 | New Order page — destination picker + items section + summary + submit | 2.5 days | The two-step "Add Item" modal is the meaty part |
| 13 | Order detail (customer view) — extend existing order detail or new page | 1 day | Adds fulfillment context block + cancel button |
| 14 | Email confirmations — new `fulfillment-order-placed` template + subscriber extension | 0.5 day | |
| 15 | Storefront cache invalidation wiring (new tags + new `/api/revalidate-org` route mirroring [`revalidate-products/route.ts`](../storefront/src/app/api/revalidate-products/route.ts)) | 0.5 day | |
| 16 | Mobile polish (bottom sheets, sticky submit, touch targets) | 1 day | Last per the storefront convention |
| 17 | PostHog events drop-in | 0.25 day | |
| 18 | Role-gating end-to-end tests (Playwright — viewer can't submit, non-member gets 404) | 0.75 day | |

**Total: ~15.25 days of focused work** (was 13 in v1 — added 2.25 days for member-management UI + the order-filter step).

---

## Acceptance criteria

Phase 2 ships when:

- [ ] A purchaser member of Lifegrain Cafe can log into the storefront, navigate to `/account/organisations/[id]`, and see the Overview tab with live stats
- [ ] The Designs tab shows all 8 designs as a gallery with thumbnails and SKU counts
- [ ] The Inventory tab shows all 28 SKUs with full admin-parity columns, filtered by design / mode / below-reorder
- [ ] The Destinations tab lists all stores with click-to-expand details
- [ ] The Orders tab lists past orders filtered to this org, with stage badges and click-through
- [ ] The Place-new-order CTA opens the New Order page; design picker shows all 8 designs as tiles; clicking a design shows its locked-combination SKUs
- [ ] Submitting a valid order creates a fulfillment order (Phase 1 invariants hold), redirects to the order detail page, fires the customer + internal confirmation emails
- [ ] Production-stage updates are visible to the customer on the order detail in real time
- [ ] A viewer member can browse all tabs but the "Place new order" button is disabled with a tooltip
- [ ] An owner can invite a new member (by email), change an existing member's role, or remove a member via the Members tab — all net new UI per audit finding
- [ ] The top-level `/account/orders` page hides fulfillment orders for the primary contact (filter on `metadata.fulfillment_order = true`)
- [ ] A non-member gets a 404 on every route
- [ ] A purchaser can cancel an order within 24h of placement; after 24h the cancel button disappears
- [ ] Mobile experience works end-to-end for placing an order (sticky submit, bottom-sheet pickers, ≥ 44px touch targets)
- [ ] PostHog events fire for the key portal interactions
- [ ] Storefront cache tags invalidate correctly when admin updates a design, destination, or inventory row

---

## What Phase 3-5 will add (preview)

For context only — these are NOT part of Phase 2.

**Phase 3 (~1 week): Inbound email**
- Postmark inbound webhook → store raw email → Claude Haiku parser → draft fulfillment order in admin review queue
- Admin reviews + approves → real order via the existing Phase 1 flow
- Lets the customer keep emailing if they prefer that channel — the portal isn't mandatory

**Phase 4 (~3-5 days): Reorder workflow + low-stock alerts**
- Extend `report-alert` pattern with a `low_stock` metric type
- Daily cron flags inventory rows where `on_hand <= reorder_point`
- Surfaces in admin + emails to `FULFILLMENT_ALERTS_EMAIL`
- One-click "Create print run task" from the alert

**Phase 5 (varies): Multi-customer polish**
- Triggered when customer #2 actually onboards
- Per-org email parser config (if email format varies per customer)
- Per-org branding on the customer portal (logo, accent colour) — pure visual layer
- Per-org SLA policy display
- Optional: subdomain mapping (e.g. `lifegrain.scprints.com.au`)
