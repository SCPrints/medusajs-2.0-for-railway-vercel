# Customer portal: re-order, artwork library, designs on any garment (Nov 2026)

Why: repeat customers (and a possible Defence contract) need to re-order past jobs,
keep their logos in their account, and put a design on any garment, with few clicks.

## Problems found in the review (2026-11-19)

1. Orders page showed only the 10 newest orders, no "show more".
2. Re-order replayed the customer's first upload, not the artwork staff fixed in a
   revised proof (proofs live on `order.metadata.revised_proofs`, the line's
   `customizerDesign` never changed).
3. Lines with no `customizerDesign` (quote lines with emailed art, BYO, order-edit
   lines) had no re-order option at all.
4. Re-order / saved-design links opened the old `/customizer` page, not the Studio.
5. The "My uploads" tray lived in sessionStorage: gone when the tab closed.
6. "Change product" in the Studio threw the design away: a design was stuck on one garment.
7. Designs belonged to one person; organisation members couldn't share them.

## API contract (backend → storefront)

All under `/store/customers/me/*` (customer auth by Medusa core). Cross-customer
access returns 404, never 403.

### Artwork library — module `customer_artwork` (`backend/src/modules/customer-artwork/`)

Row: `{ id, customer_id, organisation_id|null, name, url, mime_type, thumbnail_url|null,
source: "upload"|"order", source_order_id|null, hidden_at|null, created_at, updated_at }`.
Unique `(customer_id, url)`.

- `GET /store/customers/me/artwork` → `{ artwork: ArtworkItem[] }`. Own rows (not hidden)
  plus rows shared to any organisation the customer is a member of. Before listing, imports
  every `customerOriginalFiles[]` entry from the customer's own orders' line
  `metadata.customizerDesign` (source `"order"`, idempotent via the unique index).
  `ArtworkItem = row + { can_edit: boolean, shared_from: { organisation_id, organisation_name } | null }`.
- `POST /store/customers/me/artwork` body `{ url, name, mime_type, thumbnail_url? }` → `{ artwork }`.
  `url` must be on our public file host (`MINIO_PUBLIC_URL`) — the file is uploaded first via
  the existing `/store/customizer/upload-original` (storefront relay `/api/customizer/upload-original`).
- `POST /store/customers/me/artwork/:id` body `{ name?, organisation_id?: string|null }` → `{ artwork }`.
  Owner only. Sharing needs membership with role owner or purchaser.
- `DELETE /store/customers/me/artwork/:id` → `{ ok: true }` (sets `hidden_at`; owner only).

### Saved designs — sharing

`design.organisation_id` (nullable). `GET /store/customers/me/designs` returns own + designs shared
to the customer's organisations, each with `can_edit`, `shared_from` (same shape as artwork) and
`base_product_handle` (resolved from `base_product_id`, null if the product is gone) so links can go
straight to `/products/<handle>?design=<id>`.
`GET /:id` allows shared designs. `POST /:id` accepts `organisation_id` (owner only, same role rule).
Update/delete stay owner-only.

### Order again (one click)

`POST /store/customers/me/orders/:id/order-again` body `{ cart_id, line_ids?: string[] }`
→ `{ added_lines: number, needs_staff: Array<{ line_item_id, title, reason }> }`.
Own orders only. Copies every studio line (has `metadata.customizerDesign`) into the cart through
the normal SCP pricing (`addScpLinesToCart`), with today's prices, the approved proof artwork
merged in (below), fresh group ids, and `metadata.reorder_of = { order_id, display_id, line_item_id }`.
Setup-fee lines follow the same rules as a normal studio add. Lines it can't copy come back in `needs_staff`.

### Ask us to re-order (lines the cart can't take)

`POST /store/customers/me/orders/:id/reorder-request` body `{ line_ids?: string[], note?: string }`
→ `{ quote_id, public_id }`. Creates a `new` quote (job) copying the lines, `source: "reorder"`,
`metadata.reorder_of_order_id`, and emails staff once.

### Approved artwork on re-order

`POST /admin/orders/:id/revised-proof` accepts optional
`design: { objects: unknown[], canvas: { width, height }, print_size_id?: string }`, stored on the proof.
The Studio's "Save proof" sends it. `mergeApprovedProofs(customizerDesign, revisedProofs, lineItemId)`
(backend `lib/approved-proof-design.ts`, mirrored in the storefront) swaps each side that has a proof
with a design for the newest proof's objects, rescaled from the proof canvas to the design canvas.
Re-order, order-again and staff re-proofing all read through it.

### Purchase order number

Checkout sets `cart.metadata.po_number` (max 60 chars). A subscriber copies it to
`order.metadata.po_number`. Shown on the tax invoice / receipt PDFs, order emails, the admin job
window and the customer's order page.

## Storefront

- `/account/orders`: full history, "Show more"; "Order again" on each order card.
- Order details re-order card: Order again · Change & re-order (Studio) · Put on another garment ·
  Ask us to re-order (lines without a studio design). Note when the approved artwork is used.
- `/account/designs`: Saved + From past orders tabs; times ordered / pieces / last ordered;
  share with organisation; put on another garment.
- `/account/artwork`: drag-and-drop upload, rename, share, delete, "Use on a garment".
- Account home: active jobs, recent designs, order-again for the last order.
- Studio deep links: `?design=`, `?reorder=`, `?artwork=<id>` on `/products/<handle>`.
  A design or past job opened on a different garment keeps the artwork (colour + sizes reset,
  unsupported print spots flagged). "Your artwork" panel in the Studio: drag a logo onto the garment.
