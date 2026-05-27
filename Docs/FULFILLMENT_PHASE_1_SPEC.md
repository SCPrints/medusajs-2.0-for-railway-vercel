# Customer fulfillment service — Phase 1 spec

**Status**: spec v3 — all open questions resolved + codebase audit completed, awaiting approval to implement
**Last updated**: 2026-05-27
**Author**: Claude session with Sean
**Scope**: admin-only foundation for the customer fulfillment / drop-ship workflow

---

## What this is

SC Prints holds pre-printed garment stock on behalf of business customers (e.g. Lifegrain Cafe) and drop-ships individual orders to the customer's store network (e.g. Sutherland, Liverpool, Randwick) as those stores request top-ups. Today this runs entirely through emails + the `Uniforms November 2022` Google Sheet.

Phase 1 replaces the spreadsheet with proper Medusa entities, admin tooling for staff to record orders received by email, and the workflow plumbing that decrements held stock + auto-creates print tasks for make-to-order SKUs. **No customer-facing UI in Phase 1** — that's Phase 2.

## What this is not

- **Not a B2C storefront flow** — these orders skip cart/checkout/payment entirely. Customers have standing arrangements; SC Prints invoices out-of-band.
- **Not a portal yet** — customer self-service comes in Phase 2.
- **Not an inbound email parser yet** — staff manually enter orders into the admin form for Phase 1. Email automation is Phase 3.
- **Not a print-on-demand pricing engine** — pricing is a flat pre-agreed `unit_price` per (org, SKU). Bulk-pricing ladders and decoration estimators don't apply.

---

## Glossary

| Term | Meaning |
|---|---|
| **Organisation (org)** | The customer brand whose stock we hold. Existing entity. |
| **Design** | A pre-approved artwork file belonging to an org (e.g. "Lifegrain Logo White"). New entity. One org typically has ~8 designs that can be applied to multiple garment types. |
| **Destination** | A specific ship-to address in the org's store network. New entity. |
| **Inventory row** | A `(org, product_variant, design)` triple we hold stock for or print-on-demand for. New entity. The triple is the orderable SKU. |
| **Movement** | An append-only log entry recording every stock change. New entity. |
| **Fulfillment order** | A Medusa order created via this system. Tagged `metadata.fulfillment_order = true` so existing surfaces can branch behaviour. |
| **`held_stock` SKU** | We hold physical inventory (already printed with the design). Order decrements it; we ship from warehouse. |
| **`print_on_demand` SKU** | We don't hold stock. Order creates a print task referencing the design's print file; we print + ship. |
| **Locked combination** | Only `(org, variant, design)` triples that exist as inventory rows are orderable. Customer can't request "put design X on a garment we haven't pre-approved" — staff add the inventory row first. |

---

## Mapping to existing infrastructure

| Capability | Existing module | Notes |
|---|---|---|
| Customer brand grouping | `organisation` | Reuse as-is |
| Org member roles (owner/purchaser/viewer) | `organisation_member` | Phase 2 will use for portal gating |
| Order lifecycle | Medusa `order` | Fulfillment orders are normal orders with extra metadata |
| Production tracking | `production_stage` (Phase 1 of original portal stack) | Fulfillment orders flow through stages naturally |
| Internal task tracking | `task` (Phase 7) | Print-run tasks land here |
| Audit trail | `audit_log` via `writeAudit()` | Every inventory action audited |
| Threshold alerts | `report-alert` pattern | Phase 4 will use for low-stock alerts |
| Customer auth | Medusa `customer` | Phase 2 only |
| Address snapshotting on orders | Medusa `order.shipping_address` | Destinations snapshot to address at order time |

**Nothing replaces these — we extend.**

---

## Data model

### 0. `organisation` (existing — one new field)

Add `primary_contact_customer_id` to the existing organisation model. All fulfillment orders use this customer as the order's customer-of-record. Field is nullable (no breakage for orgs that don't use fulfillment) but required for any org that has inventory rows.

```ts
// backend/src/modules/organisation/models/organisation.ts
const Organisation = model
  .define("organisation", {
    // ... existing fields ...
    primary_contact_customer_id: model.text().nullable(),
  })
```

Validation: at order-entry time, if the chosen org has no `primary_contact_customer_id`, the form refuses to submit and links to the org's edit page to set one.

### 1. `organisation_design`

Pre-approved artwork that belongs to an org. One design (e.g. "Lifegrain Logo White") can be applied across many garment types via multiple inventory rows.

```ts
// backend/src/modules/organisation/models/organisation-design.ts
const OrganisationDesign = model
  .define("organisation_design", {
    id: model.id({ prefix: "orgdsn" }).primaryKey(),
    organisation_id: model.text(),

    // Display name in admin + customer portal (e.g. "Lifegrain Logo White")
    name: model.text(),
    // Optional short code (e.g. "LG-WHITE-A")
    code: model.text().nullable(),

    // Visual reference shown in pickers + customer portal
    thumbnail_url: model.text(),

    // Production-ready artwork (PNG/PDF/SVG). Linked from print tasks
    // so production knows exactly what to print without re-rendering.
    print_file_url: model.text().nullable(),

    // Optional Fabric.js JSON snapshot. Phase 1 doesn't use it (fully
    // locked artwork), but storing it now means Phase 2 portal can
    // render an accurate on-garment preview from the same data the
    // customizer would produce.
    customizer_metadata: model.json().nullable(),

    is_active: model.boolean().default(true),
    metadata: model.json().default({}),
  })
  .indexes([
    { on: ["organisation_id"] },
    { on: ["organisation_id", "is_active"] },
    { on: ["organisation_id", "code"], unique: true, where: "code IS NOT NULL" },
  ])
```

**Why a new entity instead of extending `designs`**: the existing [`designs` module](../backend/src/modules/designs/) is customer-scoped (the "My Designs" library). Org-level brand artwork has a different lifecycle, different ownership, and different access rules (staff manages it, members of the org consume it). Sharing a table would muddle the UX on both sides.

**Why `print_file_url` separate from `customizer_metadata`**: Phase 1 only needs the final print-ready file. The Fabric.js metadata is optional and stored for Phase 2's portal preview — without it the portal just shows the thumbnail.

### 2. `organisation_destination`

A specific ship-to address in the org's store network. One org has many destinations.

```ts
// backend/src/modules/organisation/models/organisation-destination.ts
const OrganisationDestination = model
  .define("organisation_destination", {
    id: model.id({ prefix: "orgdest" }).primaryKey(),
    organisation_id: model.text(),

    // Display name shown in pickers (e.g. "Lifegrain Sutherland Hospital")
    name: model.text(),
    // Optional short code for tight spaces (e.g. "SUTH-HOSP")
    code: model.text().nullable(),

    // Ship-to address (snapshot to Medusa Address on order placement)
    address_1: model.text(),
    address_2: model.text().nullable(),
    city: model.text(),
    province: model.text().nullable(),
    postal_code: model.text(),
    country_code: model.text().default("au"),

    // Receiving contact at the destination
    contact_name: model.text().nullable(),
    contact_phone: model.text().nullable(),
    contact_email: model.text().nullable(),

    // Free-form delivery instructions (gate code, opening hours,
    // "leave at side door", etc.). Shown on packing slip + label.
    delivery_notes: model.text().nullable(),

    is_active: model.boolean().default(true),
    metadata: model.json().default({}),
  })
  .indexes([
    { on: ["organisation_id"] },
    { on: ["organisation_id", "is_active"] },
    { on: ["organisation_id", "code"], unique: true, where: "code IS NOT NULL" },
  ])
```

**Why a new entity (not Medusa addresses on the org)**: Medusa addresses are throwaway snapshots on orders/carts. Destinations are first-class managed records with stable IDs, codes, opening hours, and receive-side contacts — none of which the address model supports.

**Why `is_active` instead of hard delete**: orders reference destinations historically. Soft-delete preserves reporting.

### 3. `org_inventory`

One row per `(organisation, product_variant, design)` we hold stock for OR print on demand for. The triple is the orderable SKU. Cached aggregate of movement rows.

```ts
// backend/src/modules/org-inventory/models/org-inventory.ts
const OrgInventory = model
  .define("org_inventory", {
    id: model.id({ prefix: "orginv" }).primaryKey(),

    organisation_id: model.text(),
    product_variant_id: model.text(),
    organisation_design_id: model.text(),

    // How we fulfill this SKU for this org
    fulfillment_mode: model.enum(["held_stock", "print_on_demand"]).default("held_stock"),

    // What we charge the customer per unit, in cents, AUD
    unit_price: model.number(),
    // What it cost us to produce/print per unit, in cents.
    // Powers margin reports and tied-up-capital reports.
    unit_cost: model.number(),

    // Cached aggregate of movements (held_stock only — always 0 for PoD)
    quantity_on_hand: model.number().default(0),
    // Quantity already promised to open orders, not yet shipped (held_stock only)
    quantity_reserved: model.number().default(0),

    // Reorder logic (held_stock only — Phase 4 surfaces alerts)
    reorder_point: model.number().nullable(),
    reorder_quantity: model.number().nullable(),

    // Customer-facing lead time estimate (print_on_demand)
    lead_time_days: model.number().nullable(),

    // Per-row label override (e.g. "Lifegrain LifeGrain Tee — S" if the
    // variant's own title isn't customer-friendly). Falls back to
    // variant.title at render time.
    customer_facing_label: model.text().nullable(),

    is_active: model.boolean().default(true),
    metadata: model.json().default({}),
  })
  .indexes([
    { on: ["organisation_id"] },
    { on: ["product_variant_id"] },
    { on: ["organisation_design_id"] },
    { on: ["organisation_id", "product_variant_id", "organisation_design_id"], unique: true },
    { on: ["organisation_id", "is_active"] },
  ])
```

**Composite uniqueness key**: `(org, variant, design)`. Same garment variant CAN appear with multiple designs as separate inventory rows — e.g. "LifeGrain S × Logo White" and "LifeGrain S × Logo Black" are two distinct orderable SKUs.

**Why two cached aggregates (`on_hand` + `reserved`)**:
- `on_hand` = physical units in the warehouse
- `reserved` = units allocated to placed-but-not-yet-shipped orders
- Available = `on_hand - reserved`

This lets staff over-allocate gracefully: place an order for 20 units when only 15 are on hand, the order accepts (with a `quantity_reserved` going negative is the signal to print more), and the print task auto-fires.

Alternative: refuse the order. We'll go with **allow + auto-print** because it matches what staff do today (they take any order and figure out fulfilment).

**Why both `unit_price` AND `unit_cost`**: margin reporting and "capital tied up in slow stock" reporting later. Without `unit_cost` the Linen-at-15-units pattern is invisible.

**Why no `bulk_pricing` ladder**: these are standing arrangements with fixed rates. If a customer ever asks for tiered pricing, add it as a `metadata.bulk_pricing` later.

### 4. `org_inventory_movement`

Append-only ledger. Every stock change writes a row.

```ts
// backend/src/modules/org-inventory/models/org-inventory-movement.ts
const OrgInventoryMovement = model
  .define("org_inventory_movement", {
    id: model.id({ prefix: "orginvmov" }).primaryKey(),

    org_inventory_id: model.text(),

    // Signed integer — positive for receipts/adjustments-up,
    // negative for shipments/adjustments-down
    qty_delta: model.number(),

    reason: model.enum([
      "receipt",         // print run completed, stock arrived
      "shipment",        // order shipped, decrement stock
      "reservation",     // order placed but not yet shipped
      "release",         // order cancelled, release reserved stock
      "adjustment_up",   // stocktake found extra
      "adjustment_down", // stocktake found less, breakage, loss
      "transfer_in",     // moved from another location (future)
      "transfer_out",    // moved to another location (future)
    ]),

    // What caused this movement
    reference_type: model.enum([
      "order",
      "print_run",
      "stocktake",
      "manual",
    ]).nullable(),
    reference_id: model.text().nullable(),

    notes: model.text().nullable(),
    created_by: model.text().nullable(), // admin user id

    metadata: model.json().default({}),
  })
  .indexes([
    { on: ["org_inventory_id"] },
    { on: ["org_inventory_id", "created_at"] },
    { on: ["reference_type", "reference_id"] },
  ])
```

**Why `reservation` + `release` as separate reasons**: a reservation does NOT decrement `on_hand` — it bumps `reserved`. A `shipment` movement THEN decrements `on_hand` and decrements `reserved`. This lets us model the lifecycle:

```
order placed   → reservation (+qty to reserved)
order shipped  → shipment    (-qty from on_hand, -qty from reserved)
order cancel   → release     (-qty from reserved)
```

The movement service is the single mutation point — all reads of `on_hand`/`reserved` go through the cached columns; all writes go through the service which writes the movement AND updates the aggregate transactionally.

### 5. Module links

**IMPORTANT — intra-module relationships don't get link files.** Medusa's
`defineLink` is for cross-module relationships only. The `organisation_design`
and `organisation_destination` entities live in the SAME module as
`organisation`, so the org↔design and org↔destination relationships are
navigated through service methods (`service.listOrganisationDesigns({ organisation_id })`),
NOT through `defineLink`. Creating a same-module link triggers the
"Conflict configuration for service" error at build/sync-links time. This
matches the existing `organisation_member` pattern — that entity also has
no link file.

```ts
// backend/src/links/organisation-inventory.ts
defineLink(
  OrganisationModule.linkable.organisation,
  { linkable: OrgInventoryModule.linkable.org_inventory, isList: true }
)

// backend/src/links/design-inventory.ts
defineLink(
  OrganisationModule.linkable.organisation_design,
  { linkable: OrgInventoryModule.linkable.org_inventory, isList: true }
)

// backend/src/links/variant-org-inventory.ts
defineLink(
  ProductModule.linkable.productVariant,
  { linkable: OrgInventoryModule.linkable.org_inventory, isList: true }
)

// backend/src/links/order-organisation.ts
defineLink(
  OrderModule.linkable.order,
  { linkable: OrganisationModule.linkable.organisation }
  // No isList — an order belongs to exactly one org
)

// backend/src/links/order-destination.ts
defineLink(
  OrderModule.linkable.order,
  { linkable: OrganisationModule.linkable.organisation_destination }
  // No isList — an order ships to exactly one destination
)

// backend/src/links/customer-organisations-primary.ts
defineLink(
  CustomerModule.linkable.customer,
  { linkable: OrganisationModule.linkable.organisation, isList: true }
  // One customer can be the primary contact for many orgs (rare but possible)
)
```

`isList: true` is required on the parent side of any 1:many link per the existing convention (see `organisation-tasks.ts` and the `feedback_medusa_definelink_islist` memory).

**Module placement**: `organisation_design` + `organisation_destination` both live in the **organisation module** alongside `organisation_member` — they're properties of the org, not of inventory. `org_inventory` + `org_inventory_movement` live in a **new `org-inventory` module** (separate concern, mutation-heavy, has its own service layer).

**Cross-module link summary** (`backend/src/links/`):
- `customer-organisations-primary.ts` — Customer ↔ Organisation (isList:true on customer side, for primary_contact_customer_id reverse navigation)
- `organisation-inventory.ts` — Organisation ↔ OrgInventory (isList:true on org side)
- `design-inventory.ts` — OrganisationDesign ↔ OrgInventory (isList:true on design side)
- `variant-org-inventory.ts` — ProductVariant ↔ OrgInventory (isList:true on variant side)

No `organisation-designs.ts` or `organisation-destinations.ts` — same module, navigated via service methods.

---

## Service layer

### `OrgInventoryService` (new)

The mutation gateway. Every stock change goes through this — never write movements + aggregates separately.

```ts
class OrgInventoryService extends MedusaService({
  OrgInventory,
  OrgInventoryMovement,
}) {
  // Reserve stock when an order is placed
  async reserve(args: {
    org_inventory_id: string
    quantity: number
    order_id: string
    actor_id?: string
  }): Promise<OrgInventoryMovement>

  // Ship stock when an order is fulfilled
  async ship(args: {
    org_inventory_id: string
    quantity: number
    order_id: string
    actor_id?: string
  }): Promise<OrgInventoryMovement>

  // Release a reservation when an order is cancelled
  async release(args: {
    org_inventory_id: string
    quantity: number
    order_id: string
    actor_id?: string
  }): Promise<OrgInventoryMovement>

  // Receive stock from a completed print run
  async receive(args: {
    org_inventory_id: string
    quantity: number
    print_run_task_id?: string
    notes?: string
    actor_id?: string
  }): Promise<OrgInventoryMovement>

  // Stocktake adjustment — sets on_hand to a target, writes the
  // delta as a single adjustment movement
  async adjust(args: {
    org_inventory_id: string
    target_quantity: number
    notes?: string
    actor_id?: string
  }): Promise<OrgInventoryMovement>

  // Read helpers
  async getAvailability(org_inventory_id: string): Promise<{
    on_hand: number
    reserved: number
    available: number
  }>

  async listForOrg(organisation_id: string, opts?: {
    active_only?: boolean
    low_stock_only?: boolean
  }): Promise<OrgInventoryWithVariant[]>
}
```

**Transactional invariant**: every write method runs in a single transaction that (1) inserts the movement row and (2) updates the parent `org_inventory` aggregate (`quantity_on_hand` and/or `quantity_reserved`). The aggregates are always recomputable from the movement log — periodic reconciliation job in Phase 4 verifies they haven't drifted.

**Audit hook**: each method calls `writeAudit()` after success with `entity = "org_inventory"`, `entity_id = org_inventory_id`, `action = "stock_reserved"` / `"stock_shipped"` / etc. Action names get added to `AUDIT_ACTION` in `lib/audit-entities.ts` so the Activity timeline (Phase 9) surfaces them automatically.

---

## Workflows

### A. Admin creates a fulfillment order

```
1. Staff navigates to /app/fulfillment/orders/new
   (or /app/organisations/:id/orders/new)

2. Picks organisation → loads:
   - org's destinations (active only)
   - org's designs (active only) with thumbnails
   - org's inventory (active only) with current availability per row
   - guard: refuse to proceed if org has no primary_contact_customer_id

3. Picks destination

4. Adds line items. The picker is design-first to match how
   customers think:
   a) Pick a design (e.g. "Lifegrain Logo White") from the
      thumbnail grid
   b) Pick a garment + size from that design's available
      inventory rows (only locked combinations show — no
      "design X on a variant we haven't pre-approved")
   c) Enter quantity

   Each line shows: design thumbnail, garment+size label, mode
   badge, available qty (if held_stock), unit_price.
   For held_stock SKUs over available: amber warning
   "Will trigger print run for N additional units".

5. Optional fields:
   - external_ref (the customer's order number from their system,
     e.g. "8517")
   - requested_ship_by (date)
   - notes

6. Submit →
   - Creates Medusa order via createOrderWorkflow with:
     - customer_id: organisation.primary_contact_customer_id
     - shipping_address: snapshot of destination's address
     - billing_address: same
     - email: org.contact_email
     - region_id: AU region
     - currency_code: aud
     - items: one per inventory row, with:
         unit_price: from org_inventory.unit_price
         title: design.name + " — " + variant.title
                (e.g. "Lifegrain Logo White — LifeGrain S")
         metadata:
           org_inventory_id: orginv.id
           organisation_design_id: design.id
           print_file_url: design.print_file_url
           customizerDesign: design.customizer_metadata
             (if present — keeps existing customizer admin widgets
              working without a special branch)
     - metadata:
         fulfillment_order: true
         organisation_id: org.id
         organisation_destination_id: dest.id
         external_ref: "8517"
         source: "manual_admin"

   - Order placed → existing order-placed-stamp-production-stage
     subscriber stamps stage = "received"

   - New subscriber fulfillment-on-order-placed runs:
     - For each line, look up the org_inventory row
     - If held_stock: orgInventoryService.reserve()
       - If reservation exceeds availability, ALSO creates an
         unassigned print task for the deficit (over-allocation
         policy decided in spec Q4)
     - If print_on_demand: orgInventoryService is not touched;
       a task is created via task-module.create() with
       title "Print run: <design.name> × <variant.title> × <qty>",
       no assignee (Q3 decision — staff grab from queue),
       priority = "high" if requested_ship_by within 3 days.
       Task metadata stamps:
         org_inventory_id
         organisation_design_id
         print_file_url
         received_quantity_target

7. Redirect to the standard Medusa order detail page
   - Existing production_stage_tracker widget shows
   - New fulfillment-context widget shows: org name, destination,
     external_ref, source, the inventory rows that backed it,
     thumbnails of each design used
```

### B. Order shipped (stock decrement)

```
Existing flow: staff/ShipStation moves stage forward
  → order.shipment_created fires

New subscriber: fulfillment-on-shipment-created
  - For each line, if it's a held_stock fulfillment line:
    - orgInventoryService.ship()
      - Writes "shipment" movement
      - Decrements on_hand by qty
      - Decrements reserved by qty (releases the reservation)
```

### C. Order cancelled (stock release)

```
Existing flow: order.cancelled

New subscriber: fulfillment-on-order-cancelled
  - For each line, if it's a held_stock fulfillment line WITH
    an active reservation:
    - orgInventoryService.release()
      - Writes "release" movement
      - Decrements reserved by qty (returns to available)
```

### D. Print run completed (stock receipt)

```
Staff completes a print_run task in /app/tasks
  → On task status = "done", look at task.metadata.org_inventory_id
    and task.metadata.received_quantity
  → orgInventoryService.receive()
    - Writes "receipt" movement
    - Increments on_hand
    - If reserved is in deficit (negative effective availability from
      earlier over-allocation), reservations are now backed
```

This wiring lives on the task module's `done` transition. Could alternatively be a dedicated "Receive print run" button in the inventory grid — flag for the review.

### E. Stocktake (periodic reconciliation)

```
Staff opens /app/organisations/:id/inventory and clicks
"Reconcile stocktake" on a row.
  → Form: "Counted N units. Reason?"
  → orgInventoryService.adjust()
    - Computes delta from current on_hand
    - Writes "adjustment_up" or "adjustment_down" movement
    - Updates on_hand to the counted value
```

---

## Admin UI

All routes follow the existing `/app/...` pattern.

### Designs tab on organisation detail

Extends [`backend/src/admin/routes/organisations/page.tsx`](../backend/src/admin/routes/organisations/page.tsx) — add tabs to the existing org detail.

**Per-org designs grid** at `/app/organisations/:id` → "Designs" tab:

```
┌─────────────────────────────────────────────────────────────────┐
│ Lifegrain Cafe — Designs                          + Add Design  │
├─────────────────────────────────────────────────────────────────┤
│ ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐                    │
│ │ [img]  │ │ [img]  │ │ [img]  │ │ [img]  │                    │
│ │ Logo   │ │ Logo   │ │ Plume  │ │ Tsubu  │                    │
│ │ White  │ │ Black  │ │ White  │ │ Slogan │                    │
│ │ 6 SKUs │ │ 6 SKUs │ │ 4 SKUs │ │ 3 SKUs │                    │
│ └────────┘ └────────┘ └────────┘ └────────┘                    │
│ ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐                    │
│ │ [img]  │ │ [img]  │ │ [img]  │ │ [img]  │                    │
│ └────────┘ └────────┘ └────────┘ └────────┘                    │
│                                                                  │
│ 8 active designs.                                                │
└─────────────────────────────────────────────────────────────────┘
```

Click a design tile → drawer with:
- Full-size thumbnail + print-ready file download
- Edit form: name, code, thumbnail upload, print file upload, active toggle
- List of inventory rows using this design (with "Add SKU" shortcut to attach another garment)
- Movement count across all SKUs using this design

### Inventory tab on organisation detail

**Per-org inventory grid** at `/app/organisations/:id` → "Inventory" tab:

```
┌──────────────────────────────────────────────────────────────────────────┐
│ Lifegrain Cafe — Inventory                                + Add SKU      │
├──────────────────────────────────────────────────────────────────────────┤
│ Design          Garment           Mode    On Hand  Reserved  Avail  Reorder│
│ Logo White      LifeGrain S      [Held]      76      20       56    ≤10  │
│ Logo White      LifeGrain M      [Held]      59      12       47    ≤10  │
│ Logo White      Plume XL         [PoD]        —       —        —      —  │
│ Logo Black      LifeGrain S      [Held]      40       8       32    ≤10  │
│ Plume White     Tsubu S          [Held]      22       3       19    ≤8   │
│ Tsubu Slogan    Linen XS         [Held]      13       0       13    ≤5   │
│                                                                            │
│ Showing 28 rows across 8 designs. 3 below reorder point.                  │
│ Filters: [All designs ▾] [All modes ▾] [Below reorder ☐]                 │
└──────────────────────────────────────────────────────────────────────────┘
```

Each row is a `(design, variant)` pair. Row-click → drawer with:
- Full movement history (paginated) for this combination
- Edit form: mode, prices, reorder config, lead time, customer_facing_label, active toggle
- "Reconcile stocktake" action
- "Receive print run" action (manual override for receipts not tied to a task)

### Destinations tab

Per-org table at `/app/organisations/:id` → "Destinations" tab:

```
┌─────────────────────────────────────────────────────────────────┐
│ Lifegrain Cafe — Destinations                  + Add Destination │
├─────────────────────────────────────────────────────────────────┤
│ Name                            City          Active   Orders   │
│ Lifegrain Sutherland Hospital   Sutherland    ✓         42      │
│ Lifegrain Liverpool             Liverpool     ✓         38      │
│ Plume Randwick                  Randwick      ✓         29      │
│ Plume Hurstville                Hurstville    ✓         18      │
│ Tsubu Liverpool                 Liverpool     ✓         11      │
└─────────────────────────────────────────────────────────────────┘
```

Row-click → drawer with edit form (name, address, contacts, delivery notes, active toggle).

### Fulfillment order entry

Dedicated page at `/app/fulfillment/orders/new` (top-level under a new "Fulfillment" sidebar entry):

```
┌────────────────────────────────────────────────────────────────────┐
│ New Fulfillment Order                                               │
├────────────────────────────────────────────────────────────────────┤
│ Organisation: [Lifegrain Cafe        ▾]                            │
│ Destination:  [Lifegrain Sutherland Hospital ▾]                    │
│ External Ref: [8517              ]   Ship By: [2026-06-03  ▾]      │
│ Source:       [Email ▾]   Email URL: (linked in Phase 3)           │
│                                                                     │
│ Notes: ┌─────────────────────────────────────────────────────────┐ │
│        │                                                          │ │
│        └─────────────────────────────────────────────────────────┘ │
│                                                                     │
│ Items (pick a design, then a garment):                              │
│ ┌────────────────────────────────────────────────────────────────┐ │
│ │ Design         Garment        Mode    Avail   Qty   Unit  Line │ │
│ │ [img] Logo Wht LifeGrain S   [Held]    56    [10]  $14   $140 │ │
│ │ [img] Logo Wht LifeGrain M   [Held]    47    [ 6]  $14    $84 │ │
│ │ [img] Plume Wt Plume L       [PoD]      —    [ 2]  $18    $36 │ │
│ └────────────────────────────────────────────────────────────────┘ │
│ + Add Item  →  opens design picker → then garment+size picker      │
│                (only locked combinations show)                      │
│                                                                     │
│ Total: $260.00                          [Cancel]  [Submit]         │
└────────────────────────────────────────────────────────────────────┘
```

The "Add Item" button opens a two-step picker:
1. Design picker — thumbnails of the org's active designs
2. Garment+size picker — only the `org_inventory` rows for the picked design, with availability shown

If the chosen org has no `primary_contact_customer_id`, the form is disabled with an inline message linking to the org's edit page.

The submit button posts to `POST /admin/fulfillment/orders` which runs the workflow described in [Workflow A](#a-admin-creates-a-fulfillment-order) above.

### Fulfillment orders list

`/app/fulfillment/orders` — table of fulfillment orders (filtered by `metadata.fulfillment_order = true`):

```
Order #   External   Organisation       Destination          Stage         Total
3902      8517       Lifegrain Cafe     Sutherland Hosp.     in_production $260
3901      9119       Lifegrain Cafe     Liverpool            shipped       $98
3900      —          Lifegrain Cafe     Randwick             delivered     $182
```

Filters: org, destination, stage, date range. Row-click goes to the standard Medusa order detail page.

### Fulfillment context widget (order detail)

New admin widget injected into `order.details.after` zone for fulfillment orders only:

```
┌─────────────────────────────────────────────────────────────────┐
│ Fulfillment Context                                              │
├─────────────────────────────────────────────────────────────────┤
│ Organisation:    Lifegrain Cafe                                  │
│ Destination:     Lifegrain Sutherland Hospital                   │
│ External Ref:    8517                                            │
│ Source:          Manual entry by Sean Mudie · 2026-05-27 14:32  │
│                                                                  │
│ Designs in this order:                                           │
│ [img] Logo White  ·  [img] Plume White                          │
│                                                                  │
│ Stock movements:                                                 │
│ • Logo White × LifeGrain S — reserved 10 · orginv_xyz          │
│ • Logo White × LifeGrain M — reserved 6                         │
│ • Plume White × Plume L    — print task created · task_abc      │
└─────────────────────────────────────────────────────────────────┘
```

---

## API surfaces (admin only — Phase 1)

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/admin/organisations/:id/designs` | List designs for an org |
| `POST` | `/admin/organisations/:id/designs` | Create design (name, thumbnail upload, print file upload) |
| `GET` | `/admin/organisations/:id/designs/:design_id` | Get one |
| `PUT` | `/admin/organisations/:id/designs/:design_id` | Update |
| `DELETE` | `/admin/organisations/:id/designs/:design_id` | Soft-delete (sets is_active=false) |
| `GET` | `/admin/organisations/:id/destinations` | List destinations for an org |
| `POST` | `/admin/organisations/:id/destinations` | Create destination |
| `GET` | `/admin/organisations/:id/destinations/:dest_id` | Get one |
| `PUT` | `/admin/organisations/:id/destinations/:dest_id` | Update |
| `DELETE` | `/admin/organisations/:id/destinations/:dest_id` | Soft-delete |
| `GET` | `/admin/organisations/:id/inventory` | List inventory rows for an org (filterable by design_id) |
| `POST` | `/admin/organisations/:id/inventory` | Create row (pick variant + design, set mode + prices + reorder) |
| `GET` | `/admin/organisations/:id/inventory/:inv_id` | Get one with availability |
| `PUT` | `/admin/organisations/:id/inventory/:inv_id` | Update config (not stock; that goes through movements) |
| `GET` | `/admin/organisations/:id/inventory/:inv_id/movements` | Paginated movement log |
| `POST` | `/admin/organisations/:id/inventory/:inv_id/adjust` | Stocktake reconciliation |
| `POST` | `/admin/organisations/:id/inventory/:inv_id/receive` | Manual receipt |
| `PUT` | `/admin/organisations/:id` (extended) | Add support for `primary_contact_customer_id` field |
| `GET` | `/admin/fulfillment/orders` | List fulfillment orders (filtered query) |
| `POST` | `/admin/fulfillment/orders` | Create fulfillment order (full workflow) |

---

## Implementation gotchas (from codebase audit)

These are non-obvious things the implementing dev needs to know — surfaced by auditing the existing codebase against the spec.

1. **AU region must be queried at runtime, never hardcoded.** Region IDs differ between local / staging / prod. Pattern (from [POS checkout precedent](../backend/src/services/pos-checkout/checkout.ts)):

   ```ts
   const { data: regions } = await query.graph({
     entity: "region",
     filters: { name: "Australia" }, // or country_code: "au"
     fields: ["id", "currency_code"],
   })
   const auRegion = regions?.[0]
   ```

2. **Unit prices: `org_inventory.unit_price` stores cents (integer), but `createOrderWorkflow` expects dollars (decimal).** Divide by 100 when passing line items, as POS does at [`checkout.ts:137`](../backend/src/services/pos-checkout/checkout.ts) (`unit_price: it.unit_price_cents / 100`). Same dual-storage trap applies to `unit_cost`.

3. **`createOrderWorkflow` does NOT auto-select a shipping method.** POS currently passes none and the order is created without one. **Open question for implementation**: does a fulfillment order need a shipping method assigned before it can advance past `production_stage = "received"`? Verify mid-implementation by placing a test order through the workflow and walking it through stages. Likely fix if blocking: assign a "Fulfillment delivery" shipping method (free, internal-only) at order-creation time.

4. **Admin organisation page is currently a single panel with no tabs.** The Designs / Inventory / Destinations / Members tabs require an upfront UI refactor. Tab pattern precedent: [`admin/routes/dropship/aussie-pacific/page.tsx`](../backend/src/admin/routes/dropship/aussie-pacific/page.tsx) uses `activeTab` state + conditional rendering. Plan ~0.5 day for the refactor BEFORE building the new tab contents.

5. **`order.customer_id` aliasing the org's primary contact will pollute `/account/orders` for that customer.** Phase 2 spec resolves this by filtering top-level `/account/orders` to hide `metadata.fulfillment_order = true` — make sure the filter is in place before any portal customer logs in and sees their personal order history flooded.

6. **`createOrderWorkflow` auto-calculates GST from `shipping_address`.** Destination address is therefore load-bearing — never skip it. POS confirms this works.

7. **Medusa core inventory module is NOT registered.** Confirmed by reading [`backend/medusa-config.js`](../backend/medusa-config.js). `Modules.INVENTORY` doesn't appear. Variants are created with `manage_inventory: false` everywhere except AS Colour supplier stock. This means the new `org_inventory` system stands alone — no need to bridge to `inventory_item` rows, no risk of double-decrement.

---

## Migrations

Four new migrations on the `organisation` + new `org-inventory` modules:

1. `Migration2027XXXXXXXXXX_OrganisationFulfillmentFields.ts` — adds `primary_contact_customer_id` (nullable text) column to existing `organisation` table
2. `Migration2027XXXXXXXXXX_OrganisationDesign.ts` — creates `organisation_design` table
3. `Migration2027XXXXXXXXXX_OrganisationDestination.ts` — creates `organisation_destination` table
4. `Migration2027XXXXXXXXXX_OrgInventory.ts` — creates `org_inventory` + `org_inventory_movement` tables (one migration since they're tightly coupled)
5. `Migration2027XXXXXXXXXX_OrderFulfillmentMetadata.ts` — index on `order.metadata->>'fulfillment_order'` for the list query (optional but cheap)

Plus `pnpm --filter backend medusa db:sync-links` after the new `defineLink`s land. The new links materialise:
- `customer ↔ organisation` (primary_contact_customer_id)
- `organisation ↔ org_inventory`
- `organisation_design ↔ org_inventory`
- `product_variant ↔ org_inventory`

(Same-module relationships — org↔design, org↔destination — are NOT module links; they're queried via service methods. Creating a `defineLink` between same-module entities triggers a "Conflict configuration for service" error at sync-links time.)

---

## Subscribers

Three new subscribers:

| File | Trigger | Action |
|---|---|---|
| `backend/src/subscribers/fulfillment-on-order-placed.ts` | `order.placed` where `metadata.fulfillment_order = true` | Reserve held_stock lines; create print tasks for PoD lines |
| `backend/src/subscribers/fulfillment-on-shipment-created.ts` | `order.shipment_created` where `metadata.fulfillment_order = true` | Ship held_stock lines |
| `backend/src/subscribers/fulfillment-on-order-cancelled.ts` | `order.cancelled` where `metadata.fulfillment_order = true` | Release reservations |

All gate on the metadata flag so non-fulfillment orders skip cleanly.

---

## Audit events

New `AUDIT_ACTION` values added to `backend/src/lib/audit-entities.ts`:

```ts
stock_reserved
stock_shipped
stock_released
stock_received
stock_adjusted_up
stock_adjusted_down
fulfillment_order_created
design_created
design_updated
design_deactivated
destination_created
destination_updated
destination_deactivated
inventory_row_created
inventory_row_updated
inventory_row_deactivated
organisation_primary_contact_set
```

New `AUDIT_ENTITY` values: `organisation_design`, `organisation_destination`, `org_inventory`.

The Phase 9 customer-journey activity timeline picks these up automatically via `AUDIT_ACTION_LABEL` fallback.

---

## PostHog events

Per the new-feature checklist convention, emit:

| Event | Where | Properties |
|---|---|---|
| `fulfillment_order_created` | order-entry route | org_id, destination_id, total, line_count, source |
| `org_stock_reserved` | service.reserve | org_id, variant_id, qty |
| `org_stock_shipped` | service.ship | org_id, variant_id, qty |
| `org_stock_received` | service.receive | org_id, variant_id, qty |
| `org_stock_low` | Phase 4 (low-stock job) | org_id, variant_id, on_hand, reorder_point |
| `print_on_demand_task_created` | subscriber | org_id, variant_id, qty, order_id |

---

## Env vars

No new env vars required for Phase 1. The new subscribers + admin pages are unconditionally active. Phase 3 (inbound email) and Phase 4 (alerts) will introduce env gates.

---

## Resolved decisions

All Phase 1 open questions have been answered. Captured here for the implementing developer.

| # | Decision | Choice |
|---|---|---|
| Q1 | Customer-of-record on fulfillment orders | **New `primary_contact_customer_id` field on the organisation model**. One nominated customer per org; all fulfillment orders use this. Required (form-level guard) for any org that has inventory rows. |
| Q2 | Variants — reuse vs. clone per org | **Reuse existing product variants**, but inventory rows are keyed on the triple `(org, variant, design)`. The design entity carries the brand artwork. `customer_facing_label` on each inventory row lets per-org naming override variant titles. |
| Q3 | Print task default assignee | **Unassigned**. Tasks land in `/app/tasks` with no owner; production staff grab them. No env var needed for Phase 1. |
| Q4 | Over-allocation policy | **Accept + auto-print the deficit**. Order for 20 when 15 on hand: reserve all 20 (effective availability goes negative); subscriber auto-creates an unassigned print task for the 5-unit shortfall. |
| Q5 | Module placement of destinations | **`organisation` module** (alongside `organisation_member`, the new `organisation_design`, and `organisation_destination`). Designs + destinations are properties of the org. Inventory + movements live in the separate `org-inventory` module because they're mutation-heavy and have their own service layer. |
| Q6 | Storefront cache invalidation | **Deferred to Phase 2**. Phase 1 is admin-only; nothing on the storefront reads inventory rows yet. |
| Q7 | Design ownership (designs vs. organisation-scoped) | **New `organisation_design` entity** in the organisation module. Distinct from the existing customer-scoped `designs` module (which powers "My Designs" for customizer users). Org artwork has different lifecycle, ownership, and access rules. |
| Q8 | Design × garment combinations | **Locked combinations**. Only `(org, variant, design)` triples that exist as `org_inventory` rows are orderable. Customer can't request "put design X on a garment we haven't pre-approved" — staff adds the inventory row first. |
| Q9 | Design editability in Phase 2 portal | **Fully locked artwork**. Customer portal is a "pick design + product + qty" form. No customizer involvement. Aligns with the standing-arrangement model and prevents unapproved variants reaching production. |

---

## Implementation order (within Phase 1)

Suggested sequence — each step independently testable.

| # | Work | Est | Notes |
|---|---|---|---|
| 1 | Refactor `/app/organisations/:id` admin page to tabbed layout | 0.5 day | Precondition for steps 2, 3, 6. Pattern from `admin/routes/dropship/aussie-pacific/page.tsx` |
| 2 | Migration: `primary_contact_customer_id` on `organisation` + admin UI for setting it | 0.5 day | One field; reusable customer picker already exists |
| 3 | `organisation_design` model + migration + module link + admin REST + designs grid tab + drawer | 1.5 days | File upload via `Modules.FILE` (base64 → MinIO/R2 → URL), pattern from `production-photos/route.ts` |
| 4 | `organisation_destination` model + migration + module link + admin REST + destinations tab + drawer UI | 1 day | Standalone — no inventory dependency |
| 5 | `org-inventory` module skeleton + both models + migration + module links | 0.5 day | No service methods yet |
| 6 | `OrgInventoryService` mutation methods + tests | 1.5 days | Pure service, fully unit-testable |
| 7 | Admin inventory grid tab + movement-log drawer + edit form (design-aware) | 2 days | Design picker on create, design column in grid, design filter |
| 8 | Fulfillment order entry page + POST `/admin/fulfillment/orders` route | 2 days | Two-step item picker (design → garment), guard on primary_contact, calls `createOrderWorkflow` with runtime AU region lookup + cents→dollars conversion |
| 9 | Three subscribers (placed, shipped, cancelled) including over-allocation print task | 1 day | All gate on `metadata.fulfillment_order = true` |
| 10 | Fulfillment context widget on order detail (with design thumbnails) | 0.5 day | |
| 11 | Fulfillment orders list page + filter | 0.5 day | |
| 12 | Audit + PostHog wiring | 0.5 day | Drop-in across the above |
| 13 | Mid-implementation verification: place test order, walk through all stages — verify shipping_method assignment is or isn't required | 0.25 day | Gotcha #3 from the audit |
| 14 | Sample-data seed script for Lifegrain Cafe + import current spreadsheet state | 1 day | Creates 8 designs + 28 inventory rows + the 30+ destinations, replays movements |

**Total: ~12.75 days of focused work.**

---

## Acceptance criteria

Phase 1 ships when:

- [ ] Sean can set a `primary_contact_customer_id` on Lifegrain Cafe in admin
- [ ] Sean can create Lifegrain Cafe's 8 designs in admin (name, thumbnail, print-ready file)
- [ ] Sean can create Lifegrain Cafe's destinations (Sutherland, Liverpool, Randwick, Hornsby, Hurstville, …) in admin
- [ ] Sean can create the org's inventory rows pairing each design with the LifeGrain S/M/L/XL, Plume S–XL, Tsubu S–XL variants — with the right mode (held vs PoD) and prices
- [ ] Sean can import the current spreadsheet's on-hand quantities as a starting baseline via a seed script (writes `adjustment_up` movements)
- [ ] Sean can enter an emailed order via the admin form — picking organisation, destination, and (design → garment) line items — and the order:
  - Appears in `/app/orders` as a normal Medusa order with the design name + garment in each line title
  - Decrements the relevant inventory rows (reserves now, ships later)
  - Creates an unassigned print task for any print-on-demand lines OR over-allocated held-stock lines, with the design's print file URL on the task metadata
  - Records `external_ref`, `organisation_id`, `organisation_destination_id` in order metadata
- [ ] The fulfillment context widget on the order page shows org name, destination, external_ref, source, design thumbnails, and the stock movement summary
- [ ] Marking the order shipped (via standard Medusa flow) writes a `shipment` movement and decrements `on_hand`
- [ ] Cancelling the order writes a `release` movement
- [ ] Receiving a print run via the task → done transition writes a `receipt` movement against the right `(design, variant)` row
- [ ] Stocktake reconciliation works for any inventory row
- [ ] Fulfillment orders list page filters work (by org, destination, design, stage, date range)
- [ ] The spreadsheet can be retired

---

## What Phase 2-5 will add (preview, not commitment)

For context only — these are NOT part of Phase 1.

**Phase 2 (1-2 weeks): Customer portal**
- Extend `/account/organisations/:id` with tabs: Designs (read-only gallery), Inventory, Order History, New Order
- Order placement form mirrors the admin two-step picker: design → garment+size → qty. Only locked combinations show. No customizer involvement (per Q9 decision)
- Read-only inventory view for `viewer` role; full for `owner` + `purchaser`
- Destinations remain admin-only per the Phase 1 decision
- Storefront cache invalidation wired in (Q6 deferred from Phase 1)

**Phase 3 (1 week): Inbound email**
- Postmark inbound webhook → `inbound_messages` table → Claude Haiku parser → draft fulfillment order in admin review queue

**Phase 4 (3-5 days): Reorder workflow + low-stock alerts**
- Extend `report-alert` pattern with `low_stock` metric type
- Daily cron flags inventory rows where `on_hand <= reorder_point`
- Surfaces in admin + emails to `FULFILLMENT_ALERTS_EMAIL`
- One-click "Create print run task" from the alert

**Phase 5 (varies): Multi-customer polish**
- Triggered when customer #2 actually onboards
- Per-org email parser config (if format varies)
- Per-org branding on customer portal (if requested)
- Per-org SLA / lead-time policies
