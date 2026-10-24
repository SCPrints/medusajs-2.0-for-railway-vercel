import {
  Badge,
  Container,
  Heading,
  Tabs,
  Text,
} from "@medusajs/ui"
import { useEffect, useState } from "react"
import SystemMapPage from "../../system-map/page"
import { HelpTooltip } from "../../../components/reports/help-tooltip"

/**
 * In-admin staff guide. Renders an embedded copy of `Docs/STAFF_GUIDE.md`
 * (curated to the bits staff actually need on a daily basis) so new
 * starters can hit `/app/help` and orient themselves without leaving
 * the admin.
 *
 * The canonical source of truth is the file in /Docs — this page
 * exists for *staff* who can't easily browse the repo. When updating,
 * change /Docs first and then mirror the relevant additions here.
 */

type Section = {
  id: string
  title: string
  body: React.ReactNode
}

const SECTIONS: Section[] = [
  {
    id: "start-here",
    title: "Start here — your daily home",
    body: (
      <>
        <Text>
          Open <strong>Today</strong> (<a href="/app/today" className="underline">/app/today</a>) first thing every morning. It lists every open job, longest wait first, with the next action on each row:
        </Text>
        <ul className="mt-2 list-disc pl-5 text-sm">
          <li><strong>Customer waiting on us</strong> — they replied, accepted, asked for changes, or are waiting for a price or a payment link.</li>
          <li><strong>Ready to move</strong> — proof to send, production to start, QC done, or blanks a supplier owes us.</li>
          <li><strong>Waiting on customer</strong> — we&apos;ve sent a quote, proof or payment link and they haven&apos;t answered. Nudge after two business days.</li>
        </ul>
        <Text size="xsmall" className="text-ui-fg-muted mt-2">
          The button on the row is the next step. One-click moves (send proof, blanks arrived, start production, QC done, shipped, payment link) run from the list; anything else opens the <strong>job page</strong> (<code>/app/jobs/&lt;order or quote&gt;</code>), where the whole job is on one screen: customer, money, phase strip, the action bar, the sections Lines / Artwork / Production / Delivery down the left and the diary on the right. Replies you send from the diary carry a reply-to address that lands the customer&apos;s answer back on the job. Medusa&apos;s own order page keeps refunds, edits and cancelling, with an <strong>Open job</strong> button at the top.
        </Text>
      </>
    ),
  },
  {
    id: "sidebar",
    title: "Finding your way — the sidebar",
    body: (
      <>
        <Text>Eight groups. Click a group to see what&apos;s inside.</Text>
        <ul className="mt-2 list-disc pl-5 text-sm space-y-1">
          <li><strong>Today</strong> — your daily home (above).</li>
          <li><strong>Orders</strong> ▸ Quotes, Enquiries (contact form + carts never checked out), Board (the Production page: kanban, print queue, recipes, calendar, rejects), My tasks, POS, Fulfillment.</li>
          <li><strong>Products</strong> ▸ Product data, Brands, Print profiles, Shop categories, Bundles, Bottle shops.</li>
          <li><strong>Inventory</strong> — Medusa&apos;s stock pages.</li>
          <li><strong>Customers</strong> ▸ Organisations, Owner rotation, Email suppressions.</li>
          <li><strong>Promotions</strong> and <strong>Price lists</strong> — Medusa standard.</li>
          <li><strong>Storefront</strong> ▸ Lookbook, Home sections.</li>
          <li><strong>Dropship</strong> — AS Colour, Aussie Pacific and bottle-shop tabs.</li>
          <li><strong>Reports</strong> — the KPI dashboard.</li>
          <li><strong>Setup</strong> ▸ Automation rules, Help &amp; guide.</li>
        </ul>
        <Text size="xsmall" className="text-ui-fg-muted mt-2">
          Old links still work — pages that moved redirect to their new home. The Job pricer has no sidebar entry; open it from a quote or a job. The old Studio dashboard is gone; Today replaces it. Press <code>Cmd-K</code> to jump to any order, quote, customer or email.
        </Text>
      </>
    ),
  },
  {
    id: "order-detail",
    title: "The job page and the order page",
    body: (
      <>
        <Text>
          A <strong>job</strong> is a quote and/or the order it became. Open one from Today, from &quot;Open job&quot; on a quote, or at <code>/app/jobs/&lt;order id, quote id, Q-number or order number&gt;</code>. The same job panel sits at the top of every order in Orders; Medusa&apos;s own order card (items, payments, fulfilment, addresses) is below it.
        </Text>
        <ul className="mt-2 list-disc pl-5 text-sm space-y-1">
          <li><strong>Header</strong> — customer (click to email or call), owner, quoted / order / paid / owing.</li>
          <li><strong>Phase strip</strong> — Enquiry → Quoted → Accepted → Paid → Artwork → Blanks → Production → Shipped → Delivered, with the date each was reached.</li>
          <li><strong>Next-action bar</strong> — who the job is waiting on, for how many business days, and the one button to press. Start production asks for a reason if approved artwork, arrived blanks or a paid deposit is missing.</li>
        </ul>
        <Text className="mt-3 font-semibold">The sections (click a heading to open it)</Text>
        <div className="mt-2 overflow-hidden rounded-md border border-ui-border-base">
          <table className="w-full text-sm">
            <thead className="bg-ui-bg-subtle text-ui-fg-subtle">
              <tr>
                <th className="px-3 py-1.5 text-left font-medium">Section</th>
                <th className="px-3 py-1.5 text-left font-medium">What&apos;s in it</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ui-border-base">
              <tr><td className="px-3 py-1">Lines</td><td className="px-3 py-1">One row per garment and colour with the sizes, margin when the Job pricer priced it, and total / paid / owing underneath. Always open.</td></tr>
              <tr><td className="px-3 py-1">Artwork</td><td className="px-3 py-1">Print files and mockups, revised proofs, print sizes and positions in mm, DTF gang sheet, screen colour check, DPI flags. Also behind <strong>Proof</strong> in the action bar.</td></tr>
              <tr><td className="px-3 py-1">Production</td><td className="px-3 py-1">Stage tracks (artwork / blanks / production), print recipes, production photos, rejects, packing check. Send to DSP is under More.</td></tr>
              <tr><td className="px-3 py-1">Delivery</td><td className="px-3 py-1">Delivery address, shipping decision, perks, fulfilment context, AS Colour / Aussie Pacific / bottle-shop dropship, AusPost parcels, Drive folder.</td></tr>
              <tr><td className="px-3 py-1">Owner &amp; CC</td><td className="px-3 py-1">Order owner, extra people to CC on stage emails, NPS score.</td></tr>
              <tr><td className="px-3 py-1">The diary</td><td className="px-3 py-1">Right column: every email in and out, call, note, stage change and task. Reply box, Log call / note and &quot;Follow up on&quot; on top; open tasks pinned with Done.</td></tr>
            </tbody>
          </table>
        </div>
        <ul className="mt-3 list-disc pl-5 text-sm space-y-1">
          <li><strong>Reply</strong> sends a plain email from <code>orders@scprints.com.au</code>. The customer&apos;s answer lands back in the job&apos;s diary and the job jumps to &quot;Customer waiting on us&quot;. <strong>Log call / note</strong> counts as answering too.</li>
          <li>
            <strong>Stale badge (red)</strong>
            <HelpTooltip text={{
              title: "Stale order",
              body: "Each track has its own limit in business days (artwork in review 2, awaiting approval 4, blanks ordered 5, in production 3, QC 2). Flagged by the daily 08:00 UTC scan; clears when the stage moves. The owner gets a task once per stuck stay.",
            }} />
            {" — shows at the very top when a stage has sat past its limit. Clears when the stage moves. The owner gets a task in "}
            <a href="/app/tasks" className="underline">My tasks</a>.
          </li>
          <li><strong>Production photos</strong> — the latest photo auto-appears in the customer&apos;s next stage email.</li>
          <li><strong>Watchers</strong> — up to 5 extra emails CC&apos;d on production-stage updates.</li>
        </ul>
      </>
    ),
  },
  {
    id: "customer-detail",
    title: "Customer detail — the widgets",
    body: (
      <ul className="list-disc pl-5 text-sm space-y-1">
        <li><strong>Account owner</strong> — the staff member responsible for this customer. New orders auto-inherit the owner so the same teammate handles every job (gated by <code>OWNER_AUTOSTAMP_ENABLED</code>). Setting an owner here populates a link table + writes an audit row. See <em>Owner &amp; rotation</em> below.</li>
        <li><strong>Lifetime value</strong> — LTV / orders / AOV / last-order tiles. &quot;Suggest VIP tag&quot; appears once they cross the threshold.</li>
        <li><strong>Tags + notes</strong> — coloured labels (VIP, Wholesale, Tricky) and pinnable internal notes. Add a snooze date to a note for follow-up reminders. Every tag/note change now writes an audit row visible on the Customer journey timeline.</li>
        <li><strong>Tax status</strong> — mark tax-exempt (council, NFP, school) so invoices render without GST. Snapshots to orders at placement.</li>
        <li><strong>Customer pricing tier</strong> — drop a known/repeat customer onto a tier (Platinum 1.30× → Member 1.65× of cost). They&apos;ll see a flat below-retail price on every product after sign-in. Detail in the <em>Pricing tiers</em> section below.</li>
        <li><strong>Customer journey</strong> — unified timeline of PostHog events + orders + NPS + saved designs + tag changes + every audit-log row (purple "Activity" badge: owner changes, notes pinned/snoozed, organisation joins, unsubscribes, automation rule fires). Use before a sales call.</li>
        <li><strong>Order list</strong> — Medusa standard.</li>
      </ul>
    ),
  },
  {
    id: "owner-rotation",
    title: "Account & order ownership",
    body: (
      <>
        <Text>
          Every customer and every order can have an "owner" — a staff member who's responsible for them. The whole point is that stale orders, quote follow-ups, and re-order chases land on a known inbox instead of falling through the cracks.
        </Text>

        <Text className="mt-3 font-semibold">How it works</Text>
        <ul className="mt-1 list-disc pl-5 text-sm space-y-1">
          <li><strong>Manual assignment always wins.</strong> Pick an owner from the <em>Account owner</em> widget on the customer page, or under Owner &amp; CC on the job page.</li>
          <li><strong>Order inherits customer owner.</strong> When a customer with an owner places an order, the order auto-stamps to the same owner. Different teammate handling a specific job? Override it under Owner &amp; CC on the job page.</li>
          <li><strong>Rotation fills in the gaps.</strong> When an un-owned customer places an order, the system picks the next teammate from the rotation table (oldest <code>last_picked_at</code> wins, position as tiebreaker) and stamps both the customer and the order with that user.</li>
        </ul>

        <Text className="mt-3 font-semibold">Setting up rotation</Text>
        <ul className="mt-1 list-disc pl-5 text-sm space-y-1">
          <li><a href="/app/rotation" className="underline">/app/rotation</a> — admin page where you toggle who's "in rotation".</li>
          <li>Add at least one teammate before flipping <code>OWNER_AUTOSTAMP_ENABLED=true</code> in env — otherwise auto-stamp is a no-op.</li>
          <li><strong>On leave?</strong> Toggle a member's <em>Enabled</em> switch off. They stay in the rotation history but are skipped for picks. Flip back on when they return.</li>
          <li><strong>Position</strong> is a tiebreaker only — lower numbers picked first when <code>last_picked_at</code> is tied. Most setups can leave it at the default 100.</li>
        </ul>

        <Text className="mt-3 font-semibold">What owners are used for</Text>
        <ul className="mt-1 list-disc pl-5 text-sm space-y-1">
          <li><strong>Stale-order escalation</strong> (Phase 11) — when an order goes stale, a Task is auto-created for the owner with priority <em>high</em> (or <em>urgent</em> after 7 days). If the order stays stale past <code>STALE_ORDER_ESCALATION_DAYS</code> (default 3), the manager email gets pinged once.</li>
          <li><strong>Automation rules</strong> (Phase 10) — the <code>create_task</code> action accepts the literal <code>owner</code> sentinel for <em>assignee</em>. Rules can route work to "whoever owns this customer / order" without hard-coding names.</li>
          <li><strong>Filtering</strong> — quotes already support <em>Assigned to</em> (the staff person responding); customer/order owner is the longer-term account assignment.</li>
        </ul>
      </>
    ),
  },
  {
    id: "pricing-tiers",
    title: "Pricing tiers — discounted pricing for known customers",
    body: (
      <>
        <Text>
          Eight customer tiers let you give known/valued customers a flat below-retail price without exposing the rate on the public storefront. A tiered customer who logs in sees <strong>one flat price per variant</strong> on the PDP and inside the customizer — the public 5-band quantity ladder is hidden for them.
        </Text>

        <Text className="mt-3 font-semibold">
          The 8 tiers
          <HelpTooltip text={{
            title: "Tier math",
            body: "Each tier multiplier is applied to the variant's ex-GST cost and produces the GST-inclusive selling price. Costs come from variant.metadata.cost_price_ex_gst_minor — written by every supplier importer. A nightly cron at 06:00 UTC regenerates all 8 tier price-lists from current cost so supplier price rises propagate within ~24h.",
          }} />
        </Text>
        <Text size="xsmall" className="text-ui-fg-muted">
          Multiplier is applied to ex-GST cost and gives the GST-inclusive selling price.
        </Text>
        <div className="mt-2 overflow-hidden rounded-md border border-ui-border-base">
          <table className="w-full text-sm">
            <thead className="bg-ui-bg-subtle text-ui-fg-subtle">
              <tr>
                <th className="px-3 py-1.5 text-left font-medium">Tier</th>
                <th className="px-3 py-1.5 text-left font-medium">Multiplier</th>
                <th className="px-3 py-1.5 text-left font-medium">Example: cost $5.40 →</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ui-border-base">
              <tr><td className="px-3 py-1">Platinum</td><td className="px-3 py-1 tabular-nums">1.30×</td><td className="px-3 py-1 tabular-nums">$7.02</td></tr>
              <tr><td className="px-3 py-1">Gold Plus</td><td className="px-3 py-1 tabular-nums">1.35×</td><td className="px-3 py-1 tabular-nums">$7.29</td></tr>
              <tr><td className="px-3 py-1">Gold</td><td className="px-3 py-1 tabular-nums">1.40×</td><td className="px-3 py-1 tabular-nums">$7.56</td></tr>
              <tr><td className="px-3 py-1">Silver Plus</td><td className="px-3 py-1 tabular-nums">1.45×</td><td className="px-3 py-1 tabular-nums">$7.83</td></tr>
              <tr><td className="px-3 py-1">Silver</td><td className="px-3 py-1 tabular-nums">1.50×</td><td className="px-3 py-1 tabular-nums">$8.10</td></tr>
              <tr><td className="px-3 py-1">Bronze Plus</td><td className="px-3 py-1 tabular-nums">1.55×</td><td className="px-3 py-1 tabular-nums">$8.37</td></tr>
              <tr><td className="px-3 py-1">Bronze</td><td className="px-3 py-1 tabular-nums">1.60×</td><td className="px-3 py-1 tabular-nums">$8.64</td></tr>
              <tr><td className="px-3 py-1">Member</td><td className="px-3 py-1 tabular-nums">1.65×</td><td className="px-3 py-1 tabular-nums">$8.91</td></tr>
              <tr className="bg-ui-bg-subtle/40 text-ui-fg-subtle">
                <td className="px-3 py-1">Public retail (no tier)</td>
                <td className="px-3 py-1 tabular-nums">quantity ladder</td>
                <td className="px-3 py-1 tabular-nums">varies by qty</td>
              </tr>
            </tbody>
          </table>
        </div>

        <Text className="mt-4 font-semibold">Who sees what</Text>
        <ul className="mt-1 list-disc pl-5 text-sm space-y-1">
          <li><strong>Anonymous visitors</strong> — public 5-band quantity ladder. Unchanged.</li>
          <li><strong>Signed-in customers with no tier</strong> — public 5-band quantity ladder. Unchanged.</li>
          <li><strong>Signed-in customers with a tier</strong> — single flat price (<em>cost × tier multiplier</em>) on PDP, customizer, cart, and checkout. The quantity ladder is hidden so they don&apos;t see retail rates they aren&apos;t paying.</li>
        </ul>

        <Text className="mt-4 font-semibold">Assigning a tier</Text>
        <ul className="mt-1 list-disc pl-5 text-sm space-y-1">
          <li>Open the customer&apos;s detail page → <strong>Customer pricing tier</strong> widget in the right sidebar.</li>
          <li>Pick the tier from the dropdown → <em>Save</em>. The change takes effect on the customer&apos;s next page load (existing carts may need a refresh).</li>
          <li>Set the dropdown to &quot;No tier&quot; to remove tier pricing and put them back on the public ladder.</li>
          <li>If a customer ever lands in <em>two</em> tier groups, the widget surfaces a warning + a one-click &quot;Clear all tier memberships&quot; button. The highest-margin tier wins until you fix it.</li>
        </ul>

        <Text className="mt-4 font-semibold">Where the numbers come from</Text>
        <ul className="mt-1 list-disc pl-5 text-sm space-y-1">
          <li>Each product variant has a canonical ex-GST cost in <code>metadata.cost_price_ex_gst_minor</code>. Every importer (AS Colour, FashionBiz, Aussie Pacific, DNC) writes it.</li>
          <li>A <strong>nightly cron at 06:00 UTC</strong> regenerates all 8 tier price lists from current cost, after the supplier inventory + cost syncs finish. So if a supplier raises wholesale, tier prices follow within ~24h.</li>
          <li>Plumbing under the hood: 8 Medusa CustomerGroups (named &quot;Tier: Platinum&quot; … &quot;Tier: Member&quot;) backed by 8 PriceLists (type=OVERRIDE) scoped to the matching group. The customer&apos;s group is auto-injected into pricing context on every store request — no custom middleware.</li>
        </ul>

        <Text className="mt-4 font-semibold">What customers see</Text>
        <ul className="mt-1 list-disc pl-5 text-sm space-y-1">
          <li>On the PDP price block: &quot;Your <em>&lt;Tier&gt;</em> pricing&quot; tag below the headline price. Bulk-discount ladder is hidden.</li>
          <li>In the customizer&apos;s pricing panel: a green pill at the top with &quot;Your <em>&lt;Tier&gt;</em> pricing — $X.XX / unit — flat rate, no quantity ladder.&quot;</li>
          <li>At checkout: the tier price flows natively through Medusa&apos;s calculated_price, so cart subtotal, totals, and tax invoice all match what the customer was shown.</li>
        </ul>

        <Text size="xsmall" className="text-ui-fg-muted mt-3">
          Platinum (1.30×) is the thinnest margin — keep it for top accounts. Member (1.65×) is the entry tier.
        </Text>
      </>
    ),
  },
  {
    id: "quotes",
    title: "Quotes pipeline",
    body: (
      <>
        <Text>
          Orders → <a href="/app/quotes" className="underline">Quotes</a> — every BYO enquiry, contact-form quote request or admin lead lands here as <em>new</em>. Enquiries that aren&apos;t quotes yet (contact form, Studio carts never checked out) are under Orders → <a href="/app/enquiries" className="underline">Enquiries</a>.
        </Text>
        <Text className="mt-2">
          Move through: <strong>new → quoted → accepted → order</strong> (unpaid, invoice + card link emailed). Lost / expired close the loop.
        </Text>
        <ul className="mt-2 list-disc pl-5 text-sm space-y-1">
          <li><strong>The quote drawer is for building the quote</strong> — lines (catalog products, or designed in the Studio popup), the Job pricer for grouped jobs, mood board, assignee, status. Where the job is up to — activity, replies, next action, Convert to order — is on the <strong>job page</strong> (&quot;Open job&quot;).</li>
          <li><strong>Email customer…</strong> — the one way to send it. If every line has a price it sends the quote with the accept-and-pay link; if not, the design-approval link (they approve the mockup or ask for changes, you price it, send again). <strong>Copy link</strong> gives you the same link for pasting into an Outlook reply.</li>
          <li><strong>Accepting is ordering.</strong> The customer gives a delivery address (or picks pick-up) on the accept page; the order is created at the quoted prices, the tax invoice is emailed and a card payment link is offered.</li>
          <li><strong>Accepted but no order?</strong> Today flags it within a business day and the owner gets a task. Convert by hand from the job page (&quot;Convert to order&quot; asks for the address).</li>
          <li><strong>Quote expiry</strong> — daily 23:00 UTC, <em>quoted</em> quotes past their expiry flip to <em>expired</em>. Opt-in via <code>QUOTE_EXPIRY_CRON_ENABLED=true</code>.</li>
          <li><strong>Cancelled orders don&apos;t un-accept the quote.</strong> The quote stays <em>accepted</em> with a note; the customer needs a fresh quote to re-order.</li>
        </ul>
      </>
    ),
  },
  {
    id: "tasks",
    title: "My tasks (staff to-do)",
    body: (
      <>
        <Text>
          <a href="/app/tasks" className="underline">/app/tasks</a> — your personal queue. Three tabs: <strong>Today</strong> (due today), <strong>Overdue</strong> (past due, still active), <strong>All active</strong> (everything assigned to you that&apos;s open or in-progress).
        </Text>

        <Text className="mt-3 font-semibold">When tasks appear</Text>
        <ul className="mt-1 list-disc pl-5 text-sm space-y-1">
          <li><strong>Manually</strong> — quick-add form at the bottom of <a href="/app/tasks" className="underline">/app/tasks</a>. Pick assignee + title + (optional) due date + priority + notes.</li>
          <li><strong>Auto, from stale orders</strong> (Phase 11) — the daily stale-order scan creates a task for the order&apos;s owner: <em>"Investigate stale order #N"</em>, due in 1 day, priority <em>high</em> (urgent after 7 days stale).</li>
          <li><strong>Auto, from automation rules</strong> (Phase 10) — the <code>create_task</code> rule action with <code>assignee_user_id: "owner"</code> resolves at fire-time. Useful for "VIP order → follow up tomorrow" or "post-delivery → chase NPS manually" recipes.</li>
        </ul>

        <Text className="mt-3 font-semibold">What each row shows</Text>
        <ul className="mt-1 list-disc pl-5 text-sm space-y-1">
          <li><strong>Anchor link</strong> — task is auto-attached to the source customer / order / quote / org. Click the anchor pill to jump.</li>
          <li><strong>Priority colour</strong> — grey (low), blue (normal), orange (high), red (urgent).</li>
          <li><strong>Due-date colour</strong> — red text when past due.</li>
        </ul>

        <Text className="mt-3 font-semibold">Actions</Text>
        <ul className="mt-1 list-disc pl-5 text-sm space-y-1">
          <li><strong>Start</strong> — flips to <em>in_progress</em>. Still appears in Today / All buckets.</li>
          <li><strong>Done</strong> — stamps completed_at + completed_by. Task drops out of the active buckets.</li>
        </ul>

        <Text className="mt-3 font-semibold">Overdue notification cron</Text>
        <Text size="xsmall" className="text-ui-fg-muted">
          Daily 09:00 UTC. Walks every active task past its due date, stamps a 23h notification cooldown, writes audit rows on every anchored entity, emits PostHog signals. Email/Slack delivery is wired separately. Opt-in via <code>TASKS_OVERDUE_CRON_ENABLED=true</code>.
        </Text>
      </>
    ),
  },
  {
    id: "pos",
    title: "Point of sale — walk-in transactions",
    body: (
      <>
        <Text>
          <a href="/app/pos" className="underline">/app/pos</a> — the till. Open this when a customer walks into the studio and wants to buy something on the spot. Three panels side-by-side: products on the left, cart in the middle, checkout (customer + payment) on the right.
        </Text>

        <Text className="mt-3 font-semibold">Adding items</Text>
        <ul className="mt-1 list-disc pl-5 text-sm space-y-1">
          <li><strong>Standard products</strong> — search by name, SKU, or handle in the left panel. Single-variant products add directly; multi-variant products expand so you can pick size/colour.</li>
          <li><strong>Custom designs</strong> — click <strong>+ Add custom design</strong> above the search. A popup opens with the full storefront customizer keyed to the current sale. Design the artwork, click <strong>Add to cart</strong>, the popup closes and the line appears in the till within ~2 seconds tagged <strong>Custom</strong>.</li>
          <li><strong>Override a price</strong> — click the price on any cart line to edit it. Useful for negotiated walk-in pricing without leaving the till.</li>
          <li>Same standard variant added twice auto-merges (quantity bump). Custom lines always stay separate.</li>
        </ul>

        <Text className="mt-3 font-semibold">Discounts &amp; promo codes</Text>
        <ul className="mt-1 list-disc pl-5 text-sm space-y-1">
          <li><strong>Promo codes</strong> — type any saved Medusa promotion code into the Promo codes field and click Add. Multiple codes can stack. The discount is applied during checkout.</li>
          <li><strong>Manual discount</strong> — type a dollar value (e.g. 10.00) into the Manual discount field for an ad-hoc whole-of-sale markdown. Stored as a transparent &quot;Walk-in discount&quot; line on the order so the bookkeeping is clean.</li>
        </ul>

        <Text className="mt-3 font-semibold">Customer (or walk-in)</Text>
        <ul className="mt-1 list-disc pl-5 text-sm space-y-1">
          <li><strong>With customer</strong> — search by email or name, or click <strong>+ New customer</strong> to create one inline. When an existing customer is picked, a <strong>Repeat last order</strong> button appears that copies their most recent order&apos;s items into the cart (custom designs skipped).</li>
          <li><strong>Walk-in (no email)</strong> — for true scan-and-go. Toggle <strong>+ Walk-in (no email)</strong> next to the customer label. The order lands against a configurable walk-in inbox (default <code>walkin@scprints.com.au</code>) and you can still email the receipt afterwards.</li>
        </ul>

        <Text className="mt-3 font-semibold">Payment</Text>
        <ul className="mt-1 list-disc pl-5 text-sm space-y-1">
          <li><strong>Pay cash</strong> — creates the order and marks it paid immediately. Receipt modal pops with the order number. Take the cash, you&apos;re done.</li>
          <li><strong>Card (QR link)</strong> — creates the order and mints a Stripe Payment Link. The receipt modal shows a QR code; the customer scans with their phone (Apple Pay / Google Pay / banking app) and the modal auto-flips to &quot;Payment received&quot; the moment Stripe&apos;s webhook fires. <strong>Copy link</strong> lets you SMS the link if a QR is awkward.</li>
        </ul>

        <Text className="mt-3 font-semibold">After payment</Text>
        <ul className="mt-1 list-disc pl-5 text-sm space-y-1">
          <li><strong>Email receipt</strong> — type any address into the receipt modal and click Send. Sends the standard order-placed email — handy if the customer wanted email but you didn&apos;t capture it upfront.</li>
          <li><strong>Customer walked out with goods → mark delivered</strong> — fast-forwards the order through every production stage (artwork → blanks → production → delivered) in a single click. Use only for stock-item pickups; custom jobs should progress organically so the customer still gets the artwork-approval email etc.</li>
          <li><strong>Open order</strong> — jumps to the standard order detail page. Everything works as normal: production stages advance, mockup PDFs render, customizer downloads work, customer-facing emails fire on stage changes.</li>
          <li><strong>New transaction</strong> — wipes the till state and starts a fresh session for the next walk-in.</li>
        </ul>

        <Text className="mt-3 font-semibold">Parking sales (multi-customer)</Text>
        <Text size="small">
          Click <strong>Park sale</strong> in the checkout panel if a customer wants to think about it or another walk-in interrupts. The cart saves against the current session and a fresh empty session opens for the next customer. A <strong>Parked (N)</strong> dropdown appears at the top of the page listing your parked sales — click to resume any of them. Each staff member only sees their own parked sales.
        </Text>

        <Text size="xsmall" className="text-ui-fg-muted mt-3">
          POS sessions last 4 hours and auto-tidy hourly. POS orders count toward LTV like any other order. Cash payments are tagged <code>pos_cash</code> in the payment-mix report so revenue buckets under &quot;Cash&quot; instead of Stripe. The studio&apos;s address is stamped on every POS order so GST computes correctly (the customer never sees it). If the popup customizer is blocked, allow popups for the admin domain.
        </Text>
      </>
    ),
  },
  {
    id: "production",
    title: "Production tooling",
    body: (
      <>
        <Text size="small" className="text-ui-fg-subtle mb-2">
          All production tools live under Orders → <a href="/app/production" className="underline">Board</a> (<code>/app/production</code>) as tabs. Per-order tools (stages, recipes, photos, rejects) are under Production on the job page.
        </Text>
        <ul className="list-disc pl-5 text-sm space-y-1">
          <li><strong>Dashboard tab</strong> — kanban/list of every in-flight order with stage, decoration method and stale flag. For the day&apos;s to-do list use <a href="/app/today" className="underline">Today</a>.</li>
          <li><strong>Print queue tab</strong> — today&apos;s in-production orders grouped by ink/decoration so operators run similar setups back-to-back. Stale orders float to the top.</li>
          <li><strong>Print recipes tab</strong> — reusable settings library. Capture &amp; link to orders so operators have the right setup.</li>
          <li><strong>Production calendar tab</strong> — Gantt-style view of in-flight orders vs deadlines. Red bars = stale.</li>
          <li><strong>Rejects tab</strong> — waste report by reason + supplier brand over any date range.</li>
          <li><strong>Lookbook</strong> (<a href="/app/storefront/lookbook" className="underline">Storefront → Lookbook</a>) — curated photos of past jobs rendered at /lookbook for social proof.</li>
        </ul>
      </>
    ),
  },
  {
    id: "print-queue",
    title: "Print queue optimiser",
    body: (
      <>
        <Text>
          <a href="/app/production" className="underline">Production → Print queue tab</a> — auto-buckets every <strong>in-production</strong> order by decoration method + ink colours so the press is set up once per bucket instead of per order.
        </Text>
        <ul className="mt-2 list-disc pl-5 text-sm space-y-1">
          <li><strong>How buckets are formed</strong> — orders with identical (method, colours) signatures group together. e.g. <code>screen_print · black,white</code> is one bucket, <code>screen_print · black,red</code> is another.</li>
          <li><strong>Bucket order</strong> — buckets with stale orders surface first, then largest-units-first, then alphabetical by signature. Stops you forgetting overdue jobs while chasing the easy wins.</li>
          <li><strong>Within a bucket</strong> — stale → earliest deadline → FIFO. Click any row to jump to the order.</li>
          <li><strong>Multi-method orders</strong> — an order that&apos;s screen-printed AND embroidered shows up in both buckets. Run the press once for the screen-print bucket, the machine once for embroidery.</li>
          <li><strong>What feeds it</strong> — reads <code>metadata.customizerDesign.prints[].method/inks/colours</code> on each cart line. Orders without customizer metadata still appear under <code>unknown</code> bucket so nothing is invisible.</li>
        </ul>
        <Text size="xsmall" className="text-ui-fg-muted mt-2">
          Live computation, no caching. Refresh the page to pick up stage advances / new orders.
        </Text>
      </>
    ),
  },
  {
    id: "ai-description",
    title: "AI product descriptions",
    body: (
      <>
        <Text>
          Product detail → <strong>Generate product description</strong> widget. Click <em>Generate drafts</em> and the LLM returns 3-5 short variants in SC PRINTS voice — pick one, edit if needed, click <em>Apply</em> to write it onto the product.
        </Text>
        <ul className="mt-2 list-disc pl-5 text-sm space-y-1">
          <li><strong>Optional hint</strong> — tell it "lean into the heavyweight cotton" or "highlight that it&apos;s WRAS certified" and it&apos;ll bias the drafts.</li>
          <li><strong>Inputs it sees</strong> — title, current handle, brand, product type, tags, variant options (sizes/colours), and a safe whitelist of metadata. It never sees SKU, cost, or supplier code.</li>
          <li><strong>Drafts are editable</strong> — change anything before clicking Apply. The Apply step calls the standard product update route so the new copy flows through subscribers/analytics.</li>
          <li><strong>Provider</strong> — controlled by env (<code>AI_PROVIDER=openai|anthropic</code>). If no key is configured, the widget shows a clear "not configured" message instead of failing silently.</li>
        </ul>
        <Text size="xsmall" className="text-ui-fg-muted mt-2">
          Use cases: filling in legacy product copy in bulk, generating SEO-friendly descriptions for newly-imported supplier products, refreshing tired listings.
        </Text>
      </>
    ),
  },
  {
    id: "group-orders",
    title: "Group orders (customer-driven)",
    body: (
      <>
        <Text>
          Customers can now spin up a group order from any saved design without contacting us first.
        </Text>
        <ul className="mt-2 list-disc pl-5 text-sm space-y-1">
          <li><strong>Customer flow</strong> — /account/designs → "Use for a group order" → fill title/deadline → share the link with their team. Teammates submit name + size at the public page. Owner converts to cart when ready.</li>
          <li><strong>Public page is safe</strong> — shows design thumbnail + product preview only. Source files, R2 URLs, and full customizer metadata are stripped before responding.</li>
          <li><strong>Convert to cart</strong> — owner clicks Convert; backend matches each participant&apos;s size_label to a real variant on the base product, builds one cart with one line per match, attaches <code>customizerDesign</code> metadata so production sees the artwork. Unmatched sizes are reported as <em>skipped</em> for the owner to resolve.</li>
          <li><strong>Idempotent</strong> — clicking Convert twice returns the same cart, doesn&apos;t create a second one.</li>
          <li><strong>If the design&apos;s base product was deleted</strong> — the owner gets a clear "pick a new base product" error rather than a half-built cart.</li>
        </ul>
        <Text size="xsmall" className="text-ui-fg-muted mt-2">
          What changed for staff: nothing day-to-day. Group orders show up as carts → orders like anything else; the only difference is the <code>group_order_id</code> stamped on order metadata for traceability.
        </Text>
      </>
    ),
  },
  {
    id: "organisations",
    title: "Organisation accounts (B2B)",
    body: (
      <>
        <Text>
          <a href="/app/organisations" className="underline">/app/organisations</a> — schools, clubs, businesses as first-class accounts. Add customers as members with a role (owner / purchaser / viewer).
        </Text>
        <ul className="mt-2 list-disc pl-5 text-sm space-y-1">
          <li>
            <strong>Roles</strong>
            <HelpTooltip text={{
              title: "Member roles",
              bullets: [
                "owner — full control: invite/remove members, change roles, place + cancel orders",
                "purchaser — can place + cancel orders within 24h; can't manage members",
                "viewer — read-only across designs, inventory, destinations, orders",
              ],
            }} />
            {" — owner / purchaser / viewer. Owners can manage members from the storefront portal (Phase 2)."}
          </li>
          <li>
            <strong>Primary contact</strong>
            <HelpTooltip text={{
              title: "Primary contact",
              body: "The customer-of-record on every fulfillment order placed against this org. Required before placing any fulfillment order — pick one from the org overview tab. The actual member who clicks 'submit' on the customer portal is preserved separately on order.metadata.placed_by_customer_id so audit history stays accurate.",
            }} />
            {" — set on the org overview tab. Required for fulfillment orders."}
          </li>
          <li><strong>Default pricing tier</strong> — sets up org-level pricing (future price-list integration).</li>
          <li><strong>Tax-exempt at org level</strong> — snapshots to every order placed by org members.</li>
          <li>Customers see their memberships at <code>/account/organisations</code> on the storefront.</li>
        </ul>
      </>
    ),
  },
  {
    id: "fulfillment-service",
    title: "Customer fulfillment service (B2B restocks)",
    body: (
      <>
        <Text>
          A per-organisation inventory + drop-ship workflow for ongoing B2B customers (the first one is Lifegrain Cafe). Replaces the "Uniforms spreadsheet" pattern: each customer gets pre-approved designs, a destination network, an inventory grid keyed on <em>(design × garment)</em>, and a self-service customer portal so they can browse, restock, and track without emailing us.
        </Text>

        <Text className="mt-3 font-semibold">When to use this vs a normal order</Text>
        <ul className="mt-1 list-disc pl-5 text-sm space-y-1">
          <li><strong>Fulfillment order</strong> — the customer has locked artwork + locked garment combos that they restock against repeatedly. They want to see live stock, place orders without going through the customizer, and see consistent unit pricing.</li>
          <li><strong>Normal order</strong> — one-off custom job. Customer goes through the storefront customizer / quote flow.</li>
        </ul>

        <Text className="mt-4 font-semibold">The three building blocks</Text>
        <Text size="xsmall" className="text-ui-fg-muted">
          Configure these inside the org detail page (<a href="/app/organisations" className="underline">/app/organisations</a> → pick org → tabs).
        </Text>
        <ul className="mt-2 list-disc pl-5 text-sm space-y-1">
          <li>
            <strong>Designs</strong>
            <HelpTooltip text={{
              title: "Organisation designs",
              body: "Pre-approved brand artwork — distinct from the customer-scoped 'My designs' module on the storefront. Each design carries a thumbnail (shown to customer) + a print file URL (staff-only, never exposed via store API). Used as the artwork attached to every fulfillment order line so production sees the right file without re-approval each time.",
            }} />
            {" — upload a thumbnail + a print file. Print file URL is never exposed to the customer; only the thumbnail."}
          </li>
          <li>
            <strong>Destinations</strong>
            <HelpTooltip text={{
              title: "Destinations",
              body: "The customer's ship-to network. Each row carries an address, contact info, and delivery notes (gate codes, receiving hours, etc.). Per Phase 1 Q4, destination management is admin-only — customers see them read-only on the portal with a 'contact us' CTA.",
            }} />
            {" — the customer's ship-to addresses (e.g. one row per store). Customer side is read-only; they email us to add or change."}
          </li>
          <li>
            <strong>Inventory rows</strong>
            <HelpTooltip text={{
              title: "Inventory row",
              body: "One row per (design × garment variant) combination. Holds the unit price (in cents), fulfillment mode, current on_hand + reserved counts, and optional reorder_point + lead_time_days. The available field is computed as on_hand - reserved; mutations always go through the OrgInventoryService so the movement ledger stays consistent.",
            }} />
            {" — one row per (design × garment) combo. Add via the inventory tab; pick a real Medusa variant + design, set unit price (cents) and unit cost (cents), choose fulfillment mode."}
          </li>
        </ul>

        <Text className="mt-4 font-semibold">Fulfillment modes</Text>
        <div className="mt-2 overflow-hidden rounded-md border border-ui-border-base">
          <table className="w-full text-sm">
            <thead className="bg-ui-bg-subtle text-ui-fg-subtle">
              <tr>
                <th className="px-3 py-1.5 text-left font-medium">Mode</th>
                <th className="px-3 py-1.5 text-left font-medium">Means</th>
                <th className="px-3 py-1.5 text-left font-medium">On order placement</th>
                <th className="px-3 py-1.5 text-left font-medium">On shipment</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ui-border-base">
              <tr>
                <td className="px-3 py-1"><strong>Held stock</strong></td>
                <td className="px-3 py-1">Pre-printed garments sitting in our racks. Customer sees live <code>on_hand</code> count.</td>
                <td className="px-3 py-1"><code>quantity_reserved</code>+=qty</td>
                <td className="px-3 py-1">Both <code>on_hand</code> and <code>reserved</code> decrement</td>
              </tr>
              <tr>
                <td className="px-3 py-1"><strong>Print on demand</strong></td>
                <td className="px-3 py-1">We print only when ordered. No stock held; customer sees "PoD" badge.</td>
                <td className="px-3 py-1">No reservation — auto-creates an unassigned <em>print_run</em> task</td>
                <td className="px-3 py-1">No inventory effect</td>
              </tr>
            </tbody>
          </table>
        </div>

        <Text className="mt-3 font-semibold">
          Over-allocation
          <HelpTooltip text={{
            title: "Over-allocation",
            body: "Customers can order more than is currently on_hand for a held_stock row. The reservation goes through and a print_run task is auto-created for the deficit (priority high, unassigned). The portal shows an amber 'we'll print N additional units' hint inline on the line at order time so they know it'll take longer.",
          }} />
        </Text>
        <ul className="mt-1 list-disc pl-5 text-sm space-y-1">
          <li>The portal <em>allows</em> a held_stock line to exceed availability — it inline-warns "We'll print [N] additional units — adds approximately [lead_time] days to that line's delivery."</li>
          <li>The Phase 1 subscriber reserves the full qty AND auto-creates a print task for the deficit (priority high, unassigned). Lands in <a href="/app/tasks" className="underline">/app/tasks</a> under the print queue.</li>
        </ul>

        <Text className="mt-4 font-semibold">Placing an order (admin)</Text>
        <Text size="xsmall" className="text-ui-fg-muted">
          Use when you receive an order via email/phone instead of the customer portal.
        </Text>
        <ul className="mt-1 list-disc pl-5 text-sm space-y-1">
          <li><a href="/app/fulfillment/new" className="underline">/app/fulfillment/new</a> — two-step item picker (design tile → size picker), pick destination, hit submit.</li>
          <li>The list at <a href="/app/fulfillment" className="underline">/app/fulfillment</a> filters orders by <code>metadata.fulfillment_order=true</code>. On the order page the fulfilment context sits in the job panel&apos;s Delivery tab.</li>
          <li>Refuses to submit if the org has no <em>primary contact</em> set. Fix that on the org overview tab first.</li>
        </ul>

        <Text className="mt-4 font-semibold">Customer portal (Phase 2)</Text>
        <Text size="xsmall" className="text-ui-fg-muted">
          Customers self-serve at <code>/account/organisations/[id]</code>. Six tabs, gated by role.
        </Text>
        <ul className="mt-1 list-disc pl-5 text-sm space-y-1">
          <li><strong>Overview</strong> — stats + 5 most recent orders + the Place New Order CTA.</li>
          <li><strong>Designs</strong> — gallery + modal showing SKU coverage. Read-only.</li>
          <li><strong>Inventory</strong> — full admin-parity grid (Phase 2 Q3). Customer sees on_hand / reserved / available / reorder_point / lead_time for held_stock rows. Below-reorder filter highlights what needs restocking.</li>
          <li><strong>Destinations</strong> — list + modal with full address + delivery notes. Read-only.</li>
          <li><strong>Orders</strong> — history filtered to this org, with the production-stage tracker on each detail page.</li>
          <li>
            <strong>Members</strong>
            <HelpTooltip text={{
              title: "Members tab (storefront)",
              body: "Owner-only tab. Lets the org owner invite members by email (the invitee must already have an SC Prints customer account — register first, then re-invite), change a member's role, or remove a member. A 'last owner' guard prevents demoting or removing the only owner.",
            }} />
            {" — owner-only. Invite by email, change roles, remove. Last-owner guard prevents lockout."}
          </li>
        </ul>

        <Text className="mt-4 font-semibold">
          Self-cancellation window
          <HelpTooltip text={{
            title: "24h cancellation",
            body: "Purchaser or owner roles can cancel a fulfillment order from the storefront within 24 hours of placement. After that the cancel button disappears and the customer has to email us. The cancel calls Medusa's cancelOrderWorkflow; the Phase 1 fulfillment-on-order-cancelled subscriber releases the held_stock reservations automatically.",
          }} />
        </Text>
        <ul className="mt-1 list-disc pl-5 text-sm space-y-1">
          <li>Purchaser + owner roles see a "Cancel order" button on the order detail page for 24 hours after placement.</li>
          <li>After 24h the button disappears — they need to email us.</li>
          <li>Cancellation auto-releases the held_stock reservation. Print-on-demand print tasks are NOT auto-cancelled (staff intervention via <a href="/app/tasks" className="underline">/app/tasks</a>).</li>
        </ul>

        <Text className="mt-4 font-semibold">What the subscribers do (you don't have to think about this)</Text>
        <ul className="mt-1 list-disc pl-5 text-sm space-y-1">
          <li><strong>On order placed</strong> — held_stock lines reserved; PoD lines + over-allocation deficits become unassigned print tasks. Customer gets a "Restock confirmed" email; production gets one to <code>FULFILLMENT_NOTIFICATION_EMAIL</code> (falls back to <code>ORDER_NOTIFICATION_EMAIL</code>).</li>
          <li><strong>On shipment created</strong> — held_stock lines decrement <em>both</em> <code>on_hand</code> and <code>reserved</code> in one movement. Customer gets the standard order-shipped email.</li>
          <li><strong>On order cancelled</strong> — held_stock reservations released; <code>on_hand</code> untouched.</li>
          <li>All three are idempotent — re-fired events don't double-process.</li>
        </ul>

        <Text className="mt-4 font-semibold">Emails sent</Text>
        <ul className="mt-1 list-disc pl-5 text-sm space-y-1">
          <li><strong>To the customer</strong> — restock confirmation when an order's placed, then the existing production-stage emails (artwork approval, in production, shipped, delivered).</li>
          <li><strong>To us</strong> — internal alert routed to <code>FULFILLMENT_NOTIFICATION_EMAIL</code> when a portal order lands. Falls back to <code>ORDER_NOTIFICATION_EMAIL</code> if unset.</li>
        </ul>

        <Text className="mt-4 font-semibold">Cache invalidation
          <HelpTooltip text={{
            title: "Storefront cache invalidation",
            body: "The customer portal uses Next.js cache tags (org:[id]:designs, :destinations, :inventory, :orders, :members). When admin mutates any of those, the backend fires a fire-and-forget POST to /api/revalidate-org on the storefront so customer pages refresh on their next render. If STOREFRONT_URL or REVALIDATE_SECRET is unset, the call no-ops silently and cached data goes stale at its cacheLife window.",
          }} />
        </Text>
        <Text size="xsmall" className="text-ui-fg-muted">
          When you change a design / destination / inventory row in admin, the storefront customer portal sees the update on the next page render (no manual refresh needed). Requires <code>STOREFRONT_URL</code> + <code>REVALIDATE_SECRET</code> set on the backend.
        </Text>

        <Text className="mt-4 font-semibold">Common ops</Text>
        <ul className="mt-1 list-disc pl-5 text-sm space-y-1">
          <li><strong>Onboarding a new org for fulfillment</strong> — create the org, set its primary_contact_customer_id, add their designs (thumbnail + print file each), add their destinations, then add inventory rows for each (design × garment × size) combo. Pick fulfillment mode per row.</li>
          <li><strong>Customer says stock is wrong</strong> — open the inventory row → adjust action lets you reconcile <code>on_hand</code> to a target quantity (movement log records the delta).</li>
          <li><strong>Print run finished</strong> — inventory row → receive action increments <code>on_hand</code> by the run quantity. Auto-backs any over-allocations.</li>
          <li><strong>Customer wants to add a new SKU</strong> — open inventory tab → add row. They'll see it on their portal within a render.</li>
          <li><strong>Personal contact's own order history is cluttered with restocks</strong> — already fixed. The primary contact's <code>/account/orders</code> hides orders tagged <code>metadata.fulfillment_order=true</code>; restocks only show under <code>/account/organisations/[id]/orders</code>.</li>
        </ul>

        <Text size="xsmall" className="text-ui-fg-muted mt-3">
          Audit + analytics: every place/cancel writes an audit row (entity=order, action=fulfillment_order_created | fulfillment_order_cancelled). PostHog gets <code>portal_new_order_submitted</code> + <code>portal_order_cancelled</code> events keyed on the placing customer's distinctId.
        </Text>
      </>
    ),
  },
  {
    id: "automation-rules",
    title: "Automation rules (no-code)",
    body: (
      <>
        <Text>
          <a href="/app/setup/automation-rules" className="underline">/app/setup/automation-rules</a> — &quot;when X happens, do Y&quot; rules. Triggers fire in real time from the backend event bus.
        </Text>

        <Text className="mt-3 font-semibold">Triggers</Text>
        <ul className="mt-1 list-disc pl-5 text-sm space-y-1">
          <li><code>order.placed</code> — every new order.</li>
          <li><code>order.production_stage_changed</code> — every stage advance.</li>
          <li><code>customer.created</code> — new customer signup or admin-created. <em>Gated by <code>AUTOMATION_EXPANDED_TRIGGERS_ENABLED</code>.</em></li>
          <li><code>order.delivered</code> — fires once when stage hits <em>delivered</em>. <em>Gated.</em></li>
        </ul>

        <Text className="mt-3 font-semibold">Actions</Text>
        <ul className="mt-1 list-disc pl-5 text-sm space-y-1">
          <li><strong>Tag customer</strong> — adds a coloured label.</li>
          <li><strong>Post order comment</strong> — internal note on the order.</li>
          <li><strong>Send alert email</strong> — staff inbox notification (not for customer-facing emails — use a marketing-stream cron for those).</li>
          <li><strong>Set production stage</strong> — auto-advance the stage. Useful for "approved → in_production" automation when artwork approval comes in.</li>
          <li><strong>Create task</strong> — creates a row in <a href="/app/tasks" className="underline">/app/tasks</a>. <code>assignee_user_id</code> accepts the literal <code>owner</code> sentinel — resolves to the entity&apos;s owner at fire time. <em>Gated.</em></li>
          <li><strong>Assign owner</strong> — calls the Phase 6 ownership API. Targets customer or order. <em>Gated.</em></li>
        </ul>

        <Text className="mt-3 font-semibold">Recipe ideas</Text>
        <ul className="mt-1 list-disc pl-5 text-sm space-y-1">
          <li>When an order is placed AND <code>lifetime_value &gt;= 1500</code>, tag the customer "VIP" AND create a task for the owner ("VIP order — call to thank", due in 1 day).</li>
          <li>When a customer is created with a corporate-domain email, assign the owner to your B2B lead.</li>
          <li>When an order is delivered, create a task to manually chase a review.</li>
          <li>When stage moves to <code>quality_check</code>, post an internal order comment.</li>
        </ul>
      </>
    ),
  },
  {
    id: "marketing-compliance",
    title: "Marketing email opt-out & suppression",
    body: (
      <>
        <Text>
          Every marketing send (cart-reminder, reorder-reminder, winback, NPS) now passes through a single gate that checks the customer&apos;s consent <strong>and</strong> a suppression table before firing.
        </Text>

        <Text className="mt-3 font-semibold">How customers opt out</Text>
        <ul className="mt-1 list-disc pl-5 text-sm space-y-1">
          <li><strong>One-click unsubscribe link</strong> in marketing email footers. Lands at <code>/email/unsubscribe?email=...&amp;kind=...&amp;sig=...</code> with an HMAC signature. The backend inserts a suppression row, flips <code>customer.metadata.marketing_consent_email=false</code> for global unsubs, and redirects them to the storefront preference center.</li>
          <li><strong>Per-stream</strong> — they can opt out of <em>winback</em> only and still receive <em>cart-reminder</em>. Stream key is encoded in the link.</li>
          <li><strong>Account preferences page</strong> on the storefront — same toggle, signed-in path.</li>
        </ul>

        <Text className="mt-3 font-semibold">Admin: managing the suppression list</Text>
        <ul className="mt-1 list-disc pl-5 text-sm space-y-1">
          <li><strong>List + add</strong> — <a href="/app/email-suppressions" className="underline">Customers → Email suppressions</a>.</li>
          <li><strong>Reasons</strong> — <em>user_unsubscribe</em>, <em>bounce</em>, <em>spam_complaint</em>, <em>manual_admin</em>. Pick <em>manual_admin</em> when you&apos;re suppressing on a customer&apos;s phone request.</li>
          <li><strong>Removing a suppression</strong> — same page. Use sparingly: re-enabling an unsubscribed customer without their permission is a compliance risk.</li>
        </ul>

        <Text className="mt-3 font-semibold">Activation checklist</Text>
        <ul className="mt-1 list-disc pl-5 text-sm space-y-1">
          <li>Set <code>UNSUBSCRIBE_LINK_SECRET</code> on Fly (must match across deploys or in-flight links break).</li>
          <li>Set <code>MARKETING_PREFERENCE_CENTER_URL</code> to your storefront preference page (e.g. <code>${'{STOREFRONT_URL}'}/email-preferences</code>).</li>
          <li>Flip <code>EMAIL_SUPPRESSION_TABLE_ENABLED=true</code> once the migration has applied — turns the suppression check on. Until you flip it the helper falls back to consent-only checks.</li>
        </ul>

        <Text size="xsmall" className="text-ui-fg-muted mt-3">
          Compliance note: Australian Spam Act + GDPR/UK PECR both require a working unsubscribe mechanism on commercial email. The one-click endpoint + per-stream toggles satisfy both. Bounces and spam complaints from Resend should be ingested into the same table (deferred — Phase 9 follow-up).
        </Text>
      </>
    ),
  },
  {
    id: "supplier-integrations",
    title: "Supplier API integrations",
    body: (
      <>
        <Text>
          Three supplier APIs back our garment catalog: <strong>AS Colour</strong>, <strong>FashionBiz</strong>, and <strong>Aussie Pacific</strong>. They share the same shape — a one-off product import script, a recurring inventory sync at a dedicated stock location, brand assignment, and (when the supplier exposes one) order forwarding for dropship. Differences are in the API shape, sync cadence, and whether the supplier accepts orders programmatically.
        </Text>

        <Text className="mt-3 font-semibold">At a glance</Text>
        <div className="mt-2 overflow-hidden rounded-md border border-ui-border-base">
          <table className="w-full text-sm">
            <thead className="bg-ui-bg-subtle text-ui-fg-subtle">
              <tr>
                <th className="px-3 py-1.5 text-left font-medium">Supplier</th>
                <th className="px-3 py-1.5 text-left font-medium">Auth</th>
                <th className="px-3 py-1.5 text-left font-medium">Inventory sync</th>
                <th className="px-3 py-1.5 text-left font-medium">Cost convention</th>
                <th className="px-3 py-1.5 text-left font-medium">Dropship</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ui-border-base">
              <tr>
                <td className="px-3 py-1">AS Colour</td>
                <td className="px-3 py-1"><code>Subscription-Key</code> header</td>
                <td className="px-3 py-1">Hourly (delta)</td>
                <td className="px-3 py-1">Ex-GST, no adjustment</td>
                <td className="px-3 py-1">Yes — Order API</td>
              </tr>
              <tr>
                <td className="px-3 py-1">FashionBiz</td>
                <td className="px-3 py-1"><code>Authorization: Token</code></td>
                <td className="px-3 py-1">Daily 04:00 UTC (full sweep)</td>
                <td className="px-3 py-1">1-99 tier × <code>FASHIONBIZ_COST_ADJUSTMENT</code> (1.15× in prod)</td>
                <td className="px-3 py-1">No — supplier has no order endpoint</td>
              </tr>
              <tr>
                <td className="px-3 py-1">Aussie Pacific</td>
                <td className="px-3 py-1"><code>Authorization: Bearer</code></td>
                <td className="px-3 py-1">Daily 05:00 UTC (full sweep)</td>
                <td className="px-3 py-1">Ex-GST, no adjustment</td>
                <td className="px-3 py-1">Yes — POST <code>/order</code> (submit-only, no status)</td>
              </tr>
            </tbody>
          </table>
        </div>

        <Text className="mt-4 font-semibold">AS Colour</Text>
        <Text size="xsmall" className="text-ui-fg-muted">
          Base URL <code>api.ascolour.com.au/v1</code> — API support at <a href="mailto:api@ascolour.com" className="underline">api@ascolour.com</a>.
        </Text>
        <ul className="mt-1 list-disc pl-5 text-sm space-y-1">
          <li><strong>What their API exposes</strong> — Catalog (products, colours, variants, images), Inventory (delta via <code>updatedAt:min</code> + full SKU lookup), Pricelist (wholesale costs, Bearer-authed), Authentication (login → Bearer token), and an Order API for dropship.</li>
          <li><strong>What we pull</strong> — initial import via <code>src/scripts/import-as-colour-from-api.ts</code> creates one Medusa product per style and links it to the AS Colour Brand. Hourly stock delta at <em>AS Colour Warehouse</em> uses the <code>updatedAt:min</code> filter so we only pull what's changed. Pricelist drives <code>variant.metadata.cost_price_ex_gst_minor</code>, which feeds the public quantity ladder and the tier-pricing system.</li>
          <li><strong>What we push</strong> — dropship orders via <code>POST /v1/orders</code>. Trigger from the job panel&apos;s Delivery tab → <em>AS Colour dropship</em>; backend posts shipping address + SKU lines and stamps AS Colour's response on order metadata.</li>
          <li><strong>Quirk: discontinued styles</strong> — AS Colour appends <code>S</code> to a styleCode when it's superseded. The importer skips these by default. Set <code>IMPORT_INCLUDE_DISCONTINUED=1</code> only for one-off historical imports.</li>
          <li><strong>Where to look when it breaks</strong> — <code>fly logs --app sc-prints-backend</code> for the <code>sync-ascolour-inventory</code> job; the dropship widget surfaces any send-to-AS-Colour error inline.</li>
        </ul>

        <Text className="mt-4 font-semibold">FashionBiz</Text>
        <Text size="xsmall" className="text-ui-fg-muted">
          Base URL <code>fashionbizapis.com/api/v3</code> — covers Biz Collection, Biz Care, Biz Corporates, Syzmik.
        </Text>
        <ul className="mt-1 list-disc pl-5 text-sm space-y-1">
          <li><strong>What their API exposes</strong> — eight GET endpoints under <code>/api/v3/products/&lt;brand&gt;/&lt;branch&gt;</code>: paginated and un-paginated product lists (with <code>?gender</code> / <code>?sales_status</code> / <code>?per_page</code> filters), per-slug product detail, per-colour stock lookup, and a <code>/categories</code> endpoint for the tag list. Each variant carries three wholesale tier prices (<code>1-99</code> / <code>100-499</code> / <code>500</code> — good-mates uses <code>Gold</code> for its lowest tier). No order endpoint, no webhooks.</li>
          <li><strong>What we pull</strong> — initial import via <code>src/scripts/import-fashionbiz-from-api.ts</code> creates products linked to the four FashionBiz brand entities (Biz Collection, Biz Care, Biz Corporates, Syzmik — <code>good-mates</code> is API-supported but deferred in our system). Branch defaults to <code>au</code> (override via <code>FASHIONBIZ_BRANCH</code>). Daily stock sweep at 04:00 UTC against <em>FashionBiz Warehouse</em>; because FashionBiz has no <code>updated_at</code> filter, every sync is a full catalog walk.</li>
          <li><strong>What we push</strong> — nothing. FashionBiz has no public order endpoint, so dropship orders are still placed manually through their portal.</li>
          <li><strong>Cost calibration (important)</strong> — the API's <code>1-99</code> tier is a published price, but FashionBiz's distributor storefront charges trade customers ~15% above that. Production sets <code>FASHIONBIZ_COST_ADJUSTMENT=1.15</code> so our retail ladder is built off the cost we'll actually be billed. Without the multiplier the storefront under-prices garments by ~15%. Raw 3-tier array + applied multiplier are preserved on <code>variant.metadata.raw_prices</code> and <code>variant.metadata.cost_adjustment</code> for audit.</li>
          <li><strong>Idempotency</strong> — create-only, keyed by handle (e.g. <code>biz-collection-p400ms</code>). Existing handles are skipped, so re-running the importer to refresh existing products is a no-op until an update path is added.</li>
        </ul>

        <Text className="mt-4 font-semibold">Aussie Pacific</Text>
        <Text size="xsmall" className="text-ui-fg-muted">
          Base URL <code>api.aussiepacific.com.au/api/v1</code> — full docs at <a href="https://api.aussiepacific.com.au/docs/" className="underline" target="_blank" rel="noreferrer">api.aussiepacific.com.au/docs</a>.
        </Text>
        <ul className="mt-1 list-disc pl-5 text-sm space-y-1">
          <li><strong>What their API exposes</strong> — <code>/check</code> (auth ping), <code>/products</code> (with optional <code>include=variants,files,images</code>), get-product-by-style-code, get-variant-by-SKU, and <code>POST /order</code> for dropship.</li>
          <li><strong>What we pull</strong> — initial import via <code>src/scripts/import-aussie-pacific-from-api.ts</code>; daily stock sweep at 05:00 UTC against <em>Aussie Pacific Warehouse</em> (no <code>updated_at</code> filter — full walk every day). Per-variant cost varies within a style, so each variant gets its own price ladder; the first 5 styles per import emit a calibration log line so operators can spot-check the ex-GST assumption against AP invoices before going wide.</li>
          <li><strong>What we push</strong> — dropship orders via <code>POST /order</code>, from either the job panel&apos;s Delivery tab or the dedicated <a href="/app/dropship?tab=aussie-pacific" className="underline">Aussie Pacific Orders</a> dashboard.</li>
          <li><strong>Quirk: run-out items skipped</strong> — products with <code>run_out === true</code> are skipped at import time (one log line per skipped style).</li>
          <li><strong>Quirk: AP gives us nothing back</strong> — no GET order endpoint, no shipment endpoint, no webhooks. After we send a dropship order AP returns a reference and that's it. Operators reconcile shipment progress via AP's email confirmations or distributor portal until AP adds a status endpoint.</li>
          <li><strong>Tag mapping</strong> — AP's <code>main_category</code> (Ladies / Mens / Kids / Unisex) maps to a demographic. <code>sub_category</code> drives the Medusa <code>product_type</code> via strict alias matching, so unknown values resolve to <code>null</code> rather than leaking demographic strings through as types.</li>
        </ul>

        <Text className="mt-4 font-semibold">Common ops</Text>
        <ul className="mt-1 list-disc pl-5 text-sm space-y-1">
          <li><strong>Where do I check a sync ran?</strong> Fly logs filtered to <code>sync-ascolour-inventory</code> / <code>sync-fashionbiz-inventory</code> / <code>sync-aussie-pacific-inventory</code>. Each job logs the SKU count it touched.</li>
          <li><strong>How do I import a new supplier brand or backfill?</strong> <code>fly ssh console --app sc-prints-backend</code>, then <code>cd /app/.medusa/server &amp;&amp; npx medusa exec src/scripts/import-&lt;supplier&gt;-from-api.js</code>. Locally, swap <code>.js</code> for <code>.ts</code> and use the <code>backend</code> working directory.</li>
          <li><strong>How do I confirm a supplier is configured?</strong> Each supplier's module only registers when its API token env var is set (<code>ASCOLOUR_SUBSCRIPTION_KEY</code>, <code>FASHIONBIZ_API_TOKEN</code>, <code>AUSSIE_PACIFIC_API_TOKEN</code>). If the token is missing the cron is a silent no-op rather than an error.</li>
          <li><strong>A supplier's portal shows a price that doesn't match what we billed against</strong> — check the cost-adjustment env var (<code>FASHIONBIZ_COST_ADJUSTMENT</code>, <code>AUSSIE_PACIFIC_COST_ADJUSTMENT</code>) and the <code>variant.metadata.cost_adjustment</code> field on a recent import. If the multiplier is wrong, raising it and re-importing corrects the cost cascade.</li>
          <li><strong>Products are imported but don't show up in the mega-menu / filters</strong> — open <a href="/app/product-data" className="underline">Product data</a> → <strong>Taxonomy audit</strong>. The three counters (missing type / missing demographic tag / missing Shop category) tell you exactly what's wrong. Run <code>backfill-product-taxonomy.ts</code> to retry title-based inference on every product — it never overwrites existing values, only fills gaps.</li>
        </ul>

        <Text size="xsmall" className="text-ui-fg-muted mt-3">
          Deeper detail — endpoint payloads, module file paths, env-var defaults — lives in <code>CLAUDE.md</code> at the repo root and the supplier folders under <code>backend/src/modules/</code> (<code>ascolour</code>, <code>fashionbiz</code>, <code>aussiepacific</code>).
        </Text>
      </>
    ),
  },
  {
    id: "hosting",
    title: "Where everything runs (hosting)",
    body: (
      <>
        <Text>
          The studio's site is split across several providers so we can pick the right tool for each piece without being locked into one platform. Day to day none of this matters — orders flow, emails send, the admin loads. The only time you need to know any of this is when something is down and you're trying to work out which provider to check.
        </Text>

        <Text className="mt-3 font-semibold">The four pieces</Text>
        <div className="mt-2 overflow-hidden rounded-md border border-ui-border-base">
          <table className="w-full text-sm">
            <thead className="bg-ui-bg-subtle text-ui-fg-subtle">
              <tr>
                <th className="px-3 py-1.5 text-left font-medium">Piece</th>
                <th className="px-3 py-1.5 text-left font-medium">What it does</th>
                <th className="px-3 py-1.5 text-left font-medium">Provider</th>
                <th className="px-3 py-1.5 text-left font-medium">Region</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ui-border-base">
              <tr><td className="px-3 py-1">Customer storefront</td><td className="px-3 py-1">scprints.com.au — what customers see</td><td className="px-3 py-1">Vercel</td><td className="px-3 py-1">Global (Sydney edge)</td></tr>
              <tr><td className="px-3 py-1">Backend + this admin</td><td className="px-3 py-1">Medusa server, REST APIs, cron jobs, dashboard SPA</td><td className="px-3 py-1">Fly.io</td><td className="px-3 py-1">Sydney</td></tr>
              <tr><td className="px-3 py-1">Database</td><td className="px-3 py-1">Orders, customers, products — the source of truth</td><td className="px-3 py-1">DigitalOcean Managed Postgres</td><td className="px-3 py-1">Sydney (SYD1)</td></tr>
              <tr><td className="px-3 py-1">File storage</td><td className="px-3 py-1">Customer artwork, mockups, lookbook photos, mood boards</td><td className="px-3 py-1">Cloudflare R2</td><td className="px-3 py-1">Oceania</td></tr>
            </tbody>
          </table>
        </div>

        <Text className="mt-3 font-semibold">Plus the supporting services</Text>
        <ul className="mt-1 list-disc pl-5 text-sm space-y-1">
          <li><strong>Search</strong> — Meilisearch v1.10 self-hosted on Fly alongside the backend (Sydney). Powers the storefront search bar and admin product search.</li>
          <li><strong>Background jobs &amp; locking</strong> — Redis 7 self-hosted on Fly (Sydney, private 6PN). Drives every cron, automation rule, and the customizer's stateful flows. Not exposed to the public internet.</li>
          <li><strong>Emails</strong> — Resend. Verified sender domain <code>scprints.com.au</code>, default From <code>orders@scprints.com.au</code>.</li>
          <li><strong>Payments</strong> — Stripe (test mode + Payment Links). Two webhook endpoints on the backend: <code>/hooks/payment/stripe_stripe</code> for cart checkout and <code>/hooks/stripe-payment-link</code> for admin-created links.</li>
          <li><strong>Analytics &amp; SEO</strong> — PostHog Cloud (US), GA4, Google Search Console. Read via a service account that impersonates <code>info@scprints.com.au</code>.</li>
        </ul>

        <Text className="mt-3 font-semibold">When something looks wrong</Text>
        <ul className="mt-1 list-disc pl-5 text-sm space-y-1">
          <li><strong>Customer site won't load</strong> — check Vercel status (<a href="https://www.vercel-status.com/" className="underline" target="_blank" rel="noreferrer">vercel-status.com</a>), then confirm the backend is healthy via <code>fly status --app sc-prints-backend</code>.</li>
          <li><strong>Admin dashboard down or 502s</strong> — Fly status (<a href="https://status.flyio.net/" className="underline" target="_blank" rel="noreferrer">status.flyio.net</a>) or <code>fly logs --app sc-prints-backend</code>.</li>
          <li><strong>Images or uploads broken</strong> — Cloudflare status (<a href="https://www.cloudflarestatus.com/" className="underline" target="_blank" rel="noreferrer">cloudflarestatus.com</a>) and check the R2 bucket isn&apos;t over quota.</li>
          <li><strong>Emails not arriving</strong> — Resend dashboard for delivery status. If it&apos;s one address only, check the email-suppressions list first (see <a href="#marketing-compliance" className="underline">Marketing email opt-out &amp; suppression</a>).</li>
          <li><strong>Search bar returns nothing</strong> — the Meili index may have drifted from Postgres. Open any product in admin and save (no changes needed) to retrigger an index push, or restart the backend to force a full reindex on boot.</li>
          <li><strong>"Database connection refused" in logs</strong> — DigitalOcean Postgres maintenance window. Status at <a href="https://status.digitalocean.com/" className="underline" target="_blank" rel="noreferrer">status.digitalocean.com</a>.</li>
        </ul>

        <Text className="mt-3 font-semibold">Deploying changes</Text>
        <ul className="mt-1 list-disc pl-5 text-sm space-y-1">
          <li><strong>Backend</strong> — engineering runs <code>fly deploy --app sc-prints-backend</code> from a clean master. Database migrations run as a Fly release command (once per deploy), not on every machine boot, so deploys don&apos;t stall.</li>
          <li><strong>Storefront</strong> — pushing to <code>master</code> on GitHub triggers Vercel automatically. Preview URLs build per pull request.</li>
          <li><strong>Secret rotation</strong> — <code>fly secrets set --app &lt;app&gt; KEY=value</code>; a secret change auto-triggers a rolling redeploy.</li>
        </ul>

        <Text size="xsmall" className="text-ui-fg-muted mt-3">
          Migrated off Railway in May 2026 after a multi-day Railway outage. The new stack is cheaper (~$26/mo total), Australian-resident where the data lives, and split into single-purpose services so an outage at one provider doesn&apos;t take everything down. Full migration runbook lives in <code>Docs/HOSTING.md</code>.
        </Text>
      </>
    ),
  },
  {
    id: "automatic",
    title: "What runs automatically (no action needed)",
    body: (
      <>
        <Text>Every cron is opt-in via an <code>*_ENABLED=true</code> env var:</Text>
        <ul className="mt-2 list-disc pl-5 text-sm space-y-1">
          <li><strong>Stale-order scan</strong> — daily 08:00 UTC. Stamps red badge, posts Slack digest, creates a Task for the order owner (Phase 11), escalates to manager after <code>STALE_ORDER_ESCALATION_DAYS</code>.</li>
          <li><strong>Overdue tasks notification</strong> — daily 09:00 UTC. Walks active tasks past their due date, writes audit + PostHog. <em>(Phase 7, opt-in.)</em></li>
          <li><strong>NPS request</strong> — daily 22:00 UTC. Fires 14 days after delivery. Now respects marketing consent + suppression (Phase 8).</li>
          <li><strong>Abandoned-cart reminder</strong> — daily 23:15 UTC. Respects suppression.</li>
          <li><strong>Reorder reminder</strong> — daily 23:30 UTC. Repeat customers past their median order gap. Now respects marketing consent + suppression (Phase 8).</li>
          <li><strong>Quote expiry</strong> — daily 23:00 UTC. Auto-expires <em>quoted</em>-status quotes past their expires_at. <em>(Phase 5, opt-in.)</em></li>
          <li><strong>Win-back</strong> — Mondays 00:00 UTC. Drifting / at-risk / lost customers. Respects suppression.</li>
          <li><strong>Cross-sell refresh</strong> — daily 02:00 UTC. Walks orders, counts co-purchases, writes to product metadata.</li>
          <li><strong>PostHog cohort sync</strong> — daily 03:30 UTC. Reconciles cohort memberships to customer tags.</li>
          <li><strong>Supplier inventory sync</strong> — AS Colour hourly, FashionBiz daily 04:00 UTC, Aussie Pacific daily 05:00 UTC. See <a href="#supplier-integrations" className="underline">Supplier API integrations</a> for what each sync touches.</li>
        </ul>
      </>
    ),
  },
  {
    id: "common-tasks",
    title: "Common tasks → where to go",
    body: (
      <div className="grid grid-cols-1 small:grid-cols-2 gap-2 text-sm">
        <div><strong>Ring up a walk-in customer</strong> <a href="/app/pos" className="underline">/app/pos</a></div>
        <div><strong>Take a card payment in-person (QR link)</strong> <a href="/app/pos" className="underline">/app/pos</a> → Card (QR link)</div>
        <div><strong>What needs my attention today?</strong> <a href="/app/today" className="underline">Today</a></div>
        <div><strong>Where is a job up to?</strong> Today, or the job page from any order or quote</div>
        <div><strong>Reply so the answer comes back to the job</strong> Job page → Activity → reply box</div>
        <div><strong>Convert an accepted quote by hand</strong> Job page → Convert to order</div>
        <div><strong>What&apos;s on my plate?</strong> Orders → <a href="/app/tasks" className="underline">My tasks</a></div>
        <div><strong>Mark a customer tax-exempt</strong> Customer detail → Tax status</div>
        <div><strong>Tag a customer VIP</strong> Customer detail → Tags</div>
        <div><strong>Give a customer tier pricing</strong> Customer detail → Customer pricing tier</div>
        <div><strong>Assign a customer or order to a teammate</strong> Customer detail → Account owner, or job page → Owner &amp; CC</div>
        <div><strong>Manage owner rotation</strong> Customers → <a href="/app/rotation" className="underline">Owner rotation</a></div>
        <div><strong>Create a task for myself or a teammate</strong> <a href="/app/tasks" className="underline">My tasks</a> → quick-add form</div>
        <div><strong>Send a quote / accept link</strong> Quote drawer → Email customer… (or Copy link)</div>
        <div><strong>Plan the week</strong> Orders → <a href="/app/production" className="underline">Board → Production calendar tab</a></div>
        <div><strong>Group today&apos;s press setups</strong> Orders → <a href="/app/production" className="underline">Board → Print queue tab</a></div>
        <div><strong>Auto-write a product description</strong> Product detail → Generate description widget</div>
        <div><strong>Log a reject</strong> Job page → Production → Rejects</div>
        <div><strong>Photo of the press</strong> Job page → Production → Production photos</div>
        <div><strong>Save settings that worked</strong> Orders → <a href="/app/production" className="underline">Board → Print recipes tab</a></div>
        <div><strong>Add an order watcher</strong> Job page → Activity → Watchers</div>
        <div><strong>Set deposit + balance</strong> Job page → Overview → Deposit &amp; balance</div>
        <div><strong>Add a school as an org</strong> <a href="/app/organisations" className="underline">/app/organisations</a></div>
        <div><strong>Set up a fulfillment customer (Lifegrain-style)</strong> <a href="/app/organisations" className="underline">/app/organisations</a> → Designs / Destinations / Inventory tabs</div>
        <div><strong>Place an admin fulfillment order</strong> <a href="/app/fulfillment/new" className="underline">/app/fulfillment/new</a></div>
        <div><strong>See all fulfillment orders</strong> <a href="/app/fulfillment" className="underline">/app/fulfillment</a></div>
        <div><strong>Reconcile stocktake on an inventory row</strong> Org detail → Inventory tab → row → Adjust</div>
        <div><strong>Mark a print run received</strong> Org detail → Inventory tab → row → Receive</div>
        <div><strong>Add a gallery tile</strong> <a href="/app/storefront/lookbook" className="underline">Storefront → Lookbook</a></div>
        <div><strong>Snooze a customer for Tuesday</strong> Customer detail → Notes → add note with snooze date</div>
        <div><strong>Tax invoice</strong> Customer side: /account/orders/[id] → Tax invoice button</div>
        <div><strong>Stop marketing emails to an address</strong> Customers → <a href="/app/email-suppressions" className="underline">Email suppressions</a></div>
      </div>
    ),
  },
  {
    id: "glossary",
    title: "Glossary",
    body: (
      <dl className="text-sm space-y-1">
        <div><dt className="font-semibold inline">Production stage</dt> <dd className="inline">— where the order is in the build pipeline (received → in_production → shipped → delivered).</dd></div>
        <div><dt className="font-semibold inline">Artwork stage</dt> <dd className="inline">— parallel track tracking customer artwork approval.</dd></div>
        <div><dt className="font-semibold inline">Blanks stage</dt> <dd className="inline">— parallel track tracking the supplier garment order.</dd></div>
        <div><dt className="font-semibold inline">LTV</dt> <dd className="inline">— lifetime value. Sum of order totals across non-cancelled orders.</dd></div>
        <div><dt className="font-semibold inline">NPS</dt> <dd className="inline">— Net Promoter Score, 1-5 rating customers leave after delivery.</dd></div>
        <div><dt className="font-semibold inline">Watcher</dt> <dd className="inline">— extra email on an order that gets CC&apos;d on stage updates.</dd></div>
        <div><dt className="font-semibold inline">Stale order</dt> <dd className="inline">— production stage hasn&apos;t advanced in 3+ days.</dd></div>
        <div><dt className="font-semibold inline">Snooze</dt> <dd className="inline">— a customer note with a future &quot;remind me&quot; date.</dd></div>
        <div><dt className="font-semibold inline">Org</dt> <dd className="inline">— school / club / business — a group of customers sharing identity.</dd></div>
        <div><dt className="font-semibold inline">Recipe</dt> <dd className="inline">— reusable production settings (mesh count, ink, etc.).</dd></div>
        <div><dt className="font-semibold inline">Pricing tier</dt> <dd className="inline">— customer-group-scoped flat price (cost × 1.30 to 1.65). Hides the public quantity ladder for that customer.</dd></div>
        <div><dt className="font-semibold inline">Owner</dt> <dd className="inline">— the staff member responsible for a customer or order. Inherits customer → order; rotation fills gaps for un-owned customers. Different from a quote&apos;s <em>assigned_to</em>, which is the person actively responding to that quote.</dd></div>
        <div><dt className="font-semibold inline">Rotation</dt> <dd className="inline">— the admin-managed list at <a href="/app/rotation" className="underline">/app/rotation</a> of staff who can be auto-assigned new customers/orders. Round-robin by oldest <em>last_picked_at</em>.</dd></div>
        <div><dt className="font-semibold inline">Task</dt> <dd className="inline">— a staff to-do anchored to a customer / order / quote / org. Single assignee, optional due_at + priority. Lives at <a href="/app/tasks" className="underline">/app/tasks</a>.</dd></div>
        <div><dt className="font-semibold inline">Audit log</dt> <dd className="inline">— the polymorphic activity feed. Every meaningful staff action (tag add, note pin, owner change, watcher add, automation fire) writes a row. Surfaced on the customer-journey widget as the purple "Activity" track.</dd></div>
        <div><dt className="font-semibold inline">Suppression</dt> <dd className="inline">— a marketing-email opt-out. Stored by email (works for guests too). Global or per-stream. Blocks every marketing-job send.</dd></div>
        <div><dt className="font-semibold inline">Fulfillment order</dt> <dd className="inline">— an order placed against a B2B org's pre-approved designs + locked garments. Tagged with <code>metadata.fulfillment_order=true</code>. Filters separately from one-off customer orders.</dd></div>
        <div><dt className="font-semibold inline">Organisation design</dt> <dd className="inline">— pre-approved brand artwork for a fulfillment org. Distinct from the customer "My designs" library; carries a print file the customer never sees.</dd></div>
        <div><dt className="font-semibold inline">Destination</dt> <dd className="inline">— a ship-to address in a fulfillment org's network. One org typically has many (one per shop / branch).</dd></div>
        <div><dt className="font-semibold inline">Inventory row</dt> <dd className="inline">— one record per (design × garment) combo for a fulfillment org. Holds unit price, fulfillment mode, on_hand, reserved.</dd></div>
        <div><dt className="font-semibold inline">Held stock</dt> <dd className="inline">— fulfillment mode where pre-printed garments sit in our racks. Customer sees live on_hand counts.</dd></div>
        <div><dt className="font-semibold inline">Print on demand (PoD)</dt> <dd className="inline">— fulfillment mode where we print only when ordered. No stock held; placing an order spawns an unassigned print task.</dd></div>
        <div><dt className="font-semibold inline">Over-allocation</dt> <dd className="inline">— ordering more than on_hand for a held_stock row. Allowed; portal warns the customer, system auto-creates a print task for the deficit.</dd></div>
        <div><dt className="font-semibold inline">Primary contact</dt> <dd className="inline">— the customer_id used as the order's customer-of-record on every fulfillment order. The actual member who placed an order is preserved on <code>order.metadata.placed_by_customer_id</code>.</dd></div>
      </dl>
    ),
  },
]

const HelpPage = () => {
  const [activeTab, setActiveTab] = useState<"guide" | "system-map">("guide")
  const [active, setActive] = useState<string>(SECTIONS[0].id)

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setActive(entry.target.id)
          }
        }
      },
      { rootMargin: "-30% 0px -65% 0px" }
    )
    for (const s of SECTIONS) {
      const el = document.getElementById(s.id)
      if (el) observer.observe(el)
    }
    return () => observer.disconnect()
  }, [])

  return (
    <Container className="p-0">
      <div className="flex items-center justify-between px-6 py-4 border-b border-ui-border-base">
        <div>
          <Heading level="h1">Help & guide</Heading>
          <Text size="xsmall" className="text-ui-fg-muted">
            Staff guide and system documentation
          </Text>
        </div>
        <Badge color="blue">v1</Badge>
      </div>

      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "guide" | "system-map")}>
        <div className="px-6 pt-4 border-b border-ui-border-base">
          <Tabs.List>
            <Tabs.Trigger value="guide">Guide</Tabs.Trigger>
            <Tabs.Trigger value="system-map">System map</Tabs.Trigger>
          </Tabs.List>
        </div>

        <Tabs.Content value="guide">
          <div className="grid grid-cols-1 lg:grid-cols-[200px_1fr] gap-0">
        <nav className="border-r border-ui-border-base p-4 lg:sticky lg:top-0 lg:self-start lg:max-h-[80vh] lg:overflow-y-auto">
          <ul className="flex flex-col gap-y-1 text-sm">
            {SECTIONS.map((s) => (
              <li key={s.id}>
                <a
                  href={`#${s.id}`}
                  className={`block rounded px-2 py-1 ${
                    active === s.id
                      ? "bg-ui-bg-subtle font-semibold text-[var(--brand-primary)]"
                      : "text-ui-fg-base hover:bg-ui-bg-subtle"
                  }`}
                >
                  {s.title}
                </a>
              </li>
            ))}
          </ul>
        </nav>

        <div className="p-6 flex flex-col gap-y-8">
          {SECTIONS.map((s) => (
            <section key={s.id} id={s.id} className="scroll-mt-24">
              <Heading level="h2" className="mb-3">
                {s.title}
              </Heading>
              <div className="prose prose-sm max-w-none text-ui-fg-base">
                {s.body}
              </div>
            </section>
          ))}

          <div className="mt-8 rounded-md border border-ui-border-base bg-ui-bg-subtle p-4 text-sm">
            <Heading level="h3" className="text-base mb-2">
              The deeper docs
            </Heading>
            <ul className="list-disc pl-5 space-y-1">
              <li>
                <span className="font-medium">System map</span> — available as the <strong>System map tab</strong> above. Interactive diagram of every service, module, event bus, cron, and how they connect.
              </li>
              <li>
                <code>Docs/STAFF_GUIDE.md</code> — full version of this page with more detail per section.
              </li>
              <li>
                <code>CLAUDE.md</code> — repo-root developer guide.
              </li>
            </ul>
          </div>
        </div>
        </div>
        </Tabs.Content>

        <Tabs.Content value="system-map" className="p-0">
          <SystemMapPage />
        </Tabs.Content>
      </Tabs>
    </Container>
  )
}

export default HelpPage
