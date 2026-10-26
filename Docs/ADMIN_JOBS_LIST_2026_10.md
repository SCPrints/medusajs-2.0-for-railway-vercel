# One Jobs list — plan

**Status:** approved 27 Oct 2026 with the four picks below. Step 1 live (f058de44, release v384). Steps 2 and 3 built together 27 Oct. Steps 4–6 to come.

**Built differently from the plan:** a new enquiry's next action stays "Price it" (the mockup showed "Reply"); it sits in New until someone emails or logs a call. Staff replying from Gmail to the enquiry email is recorded on the job as our answer (`isStaffSender`), so it leaves New. The contact submissions archive page went with Enquiries; enquiries are jobs now and the raw rows stay in the database.
**Builds on:** [ADMIN_JOB_WINDOW_2026_10.md](ADMIN_JOB_WINDOW_2026_10.md). That plan gave each job one window. This one gives staff one list to work from, and stops them leaving it.

## The problem

A customer's request changes its name and its home as it moves along. Staff have to know what stage a job is at before they know where to look.

| What staff call it | Where it lives today | Opens as a job? |
| --- | --- | --- |
| Enquiry (contact form) | Enquiries page | Only after someone clicks "Start job" |
| Open cart | Enquiries page, second tab | No |
| Quote | Quotes list, Today | Yes |
| Order | Orders list, Production, Today | Yes. Refunds and edits are on Medusa's order page |

The sidebar has eight lists of work: Today, Orders, Quotes, Enquiries, Production, Fulfillment, My tasks and Drafts. Today, the one list that covers everything, sits at the bottom of the sidebar under Medusa's own sections.

Production, last 90 days:

| | Count |
| --- | --- |
| Enquiries received | 43 |
| Enquiries that became a job in the admin | 3 |
| Enquiries that looked like spam | 1 |
| Quotes | 20 |
| Quotes that became orders | 6 |
| Fulfilment (restock) orders, ever | 0 |

Open right now: 4 quotes and 3 un-shipped orders. Most of the work is still happening in email. The enquiry email goes to the shared inbox with the customer as reply-to, so staff answer from Gmail and the job never exists in the admin.

Inside the admin, every link between our own pages reloads the whole app. There are 106 such links. The admin bundle is about 10 MB, so each hop blanks the screen and rebuilds everything. Medusa's own pages don't do this.

## The change

Everything a customer asks us for is a job from the moment it lands. Staff work from one **Jobs** list with folders across the top. Clicking a job opens it beside the list. Pricing happens inside the job. Moving around never reloads the page.

```
┌ Jobs ─────────────────────────────────────────────────────────────────────────┐
│ $1,240 owed · 1 late · 2 at risk                        [Search…] [+ New job] │
│ (Needs us 5) New 2 · Quoting 1 · Quote sent 1 · Payment 1 · Artwork 1 ·       │
│ Blanks 0 · Production 2 · Done · Lost                                         │
├──────────────────────────┬────────────────────────────────────────────────────┤
│ ▌Club A · #90            │  Club A · Team polos · #90            $2,900       │
│  Chase deposit      $2.9k│  Enquiry ▸ Quoted ▸ Accepted ▸ Paid ▸ Artwork …    │
│ ▌School B · Q-XXXX…      │  [Chase deposit]  Proof  Invoice  Blanks  More ▾   │
│  Price it                │ ┌ Lines ─────────────────────┐ ┌ Diary ──────────┐ │
│ ▌New: C (contact form)   │ │ Polo · Navy  S 4 · M 10    │ │ Reply / call …  │ │
│  Reply                   │ │ …                          │ │ 14 Oct EMAIL IN │ │
│   …                      │ └────────────────────────────┘ └─────────────────┘ │
└──────────────────────────┴────────────────────────────────────────────────────┘
```

### Folders

Each open job sits in exactly one folder. The folders come from the job's next action, which `job-state.ts` already works out. Today's queues are most of them already.

| Folder | What's in it | Rule |
| --- | --- | --- |
| **Needs us** (default) | Every open job whose next move is ours | `waiting_on = us` (a filter across the folders below) |
| New | Enquiries nobody has answered yet | Quote is `new` with no staff email or note yet |
| Quoting | Being priced or designed | Today's "To quote", minus New |
| Quote sent | Waiting for the customer to accept | Today's "Quoted" |
| Payment | Deposit, invoice or balance owed | Today's "Waiting payment" |
| Artwork | Proofs out or being revised | Today's "Artwork" |
| Blanks | Garments to order or arriving | Today's "Blanks" |
| Production | Printing, QC, ready to ship | Today's "Production" |
| Done | Delivered and paid, last 90 days | New |
| Lost | Lost, expired or spam, last 90 days | New |

Older jobs are found with search (the list's box, or cmd-K).

### Sidebar after

- Search
- **Jobs**: replaces Today, Quotes, Job pricer, Enquiries and Fulfillment
- POS
- Orders: Medusa's own list, kept for refunds, edits and history
  - Production: print queue, recipes, calendar and rejects. Its stage list and kanban go, because the folders replace them
  - My tasks
  - Drafts
- Products, Customers (gains Open carts), Reports, Storefront, Dropship, Setup: unchanged

Old addresses keep working. `/app/today`, `/app/quotes`, `/app/enquiries`, `/app/quote-pricer` and `/app/jobs/:id` all redirect into the Jobs page, so links in emails, cmd-K and bookmarks still land somewhere sensible.

## Steps

Each step ships on its own, in this order. Rough size is in working days.

### 1. In-app navigation (1 day)

Every later step depends on this, and it helps every page straight away.

- Add `react-router-dom` 7.18.2 as a direct backend dependency. That is the version the dashboard uses, and Medusa's admin bundler shares one router between the dashboard and our pages. A different version would give us a second router, and links would throw.
- Swap the 90 `<a href="/app/…">` links for router `Link`s and the 16 `window.location.href = "/app/…"` jumps for `navigate()`. Router paths drop the `/app` prefix. External links, downloads and new-tab links stay as they are.
- Fix the ten files that read `window.location` once when they load. Until now every hop reloaded, so they always saw a fresh URL. Without reloads they would show the previous job. The job page moves to `useParams`, and the pricer, Quotes, Production and hub tabs move to `useSearchParams`.
- The landing redirect (login to Today) becomes an in-app redirect instead of a second page load.
- **Done when** moving from Today to a job and back makes no document request in the network tab. The admin type-check and production build must also pass.

### 2. Enquiries become jobs (1 day)

- Move the quote-building out of the "Start job" route into a shared function, and call it from the contact form route as soon as the submission is saved. The route stays for older enquiries and remains idempotent.
- BYO, POA and "email me a quote" from the cart already create quotes. They are unchanged.
- The staff notification email gets an **Open job** link. Its reply-to becomes the customer *and* the job's inbox address. A reply sent from Gmail then lands in the job's diary as well as with the customer.
- Inbound email went live on 26 Oct: `ORDER_INBOX_DOMAIN=jobs.scprints.com.au` is set on Fly, and replies that match no job are forwarded to `info@` (commit bf17f283). Customer replies to job emails sent from then on land on the job.
- A submission the bot check flags still becomes a job. It carries a "Possible bot" badge and a one-click **Spam** that marks it lost.
- **Done when** a contact-form enquiry shows up in New without anyone touching it.

### 3. One Jobs list (2–3 days)

- `/app/jobs` grows out of the Today page. Folders replace the chips. `job-today.ts` gains the New queue (pure function, unit-tested). The builder gains Done and Lost for the last 90 days. At today's volume that is about 30 extra jobs. Past a few hundred open jobs, the list should move to one SQL read model instead of building each job in turn (`ponytail` note in the code).
- The header keeps the owed / late / at-risk line, adds a search box, and gets **+ New job**. That drawer moves here from the Quotes page.
- Each row keeps its one-click next-action button.
- The Quotes list and Enquiries pages go, with redirects. Open carts moves under Customers, because a cart isn't a request until the customer asks. "Email me a quote" and staff's "Convert to quote" already turn one into a job.
- Production loses its Dashboard tab. Fulfillment comes off the sidebar, since no fulfilment order has ever been created. The page stays reachable by address.
- **Done when** every open job, every new enquiry and every recent closed job can be found from one page, with counts matching Today's.

### 4. The job opens beside the list (2–3 days)

- Clicking a row opens the job to the right (`/app/jobs?job=<id>`). The page doesn't change, and the list keeps its folder, scroll position and highlighted row.
- `/app/jobs/:id`, used by emails, cmd-K and the order page's Open job bar, redirects to the same view with that job open.
- On wide screens the list narrows to a rail of about 320 px (customer, label, next action) and the job window sits beside it with its diary. On narrower screens the list hides while a job is open. **← Jobs** returns to the same folder and scroll position.
- Actions taken inside the job refresh that row in place.
- Classic view is removed. The split view replaces the changeover need it covered.
- **Done when** staff can work through five jobs in a row without the address bar leaving `/app/jobs`.

### 5. The pricer inside the job (2–3 days)

- Pull the pricer's body out of its page into a component that takes the quote and reports back when saved. **Price it** and **Edit pricing** open it full-screen over the job, using Medusa's FocusModal, the same overlay as Product data's editor. Closing it returns to the job exactly where it was.
- **Save** and **Save & email** close the pricer and refresh the job instead of jumping to a new page.
- The Studio popup and its polling are unchanged. Drafts are already saved per quote, so two jobs never share one.
- Pricing before a job exists goes away. **+ New job** creates the job first, then prices it. `/app/quote-pricer` redirects after one release.
- **Done when** a quote can be priced, saved and emailed without leaving `/app/jobs`.

### 6. Sidebar and docs (1 day)

- Medusa 2.21's sidebar is itself a layout-editor area. Items can be dragged and hidden, and the order is saved the same way we saved the order page's layout. Save a default with Jobs at the top. Confirm the storage key on a test row before writing it to production.
- Update CLAUDE.md (Jobs workspace), the staff guide and the in-admin help page.

**Total: about two weeks.**

## Stays where it is

- **Medusa's order page** for refunds, order edits, cancel and capture. The earlier plan decided not to rebuild these, and the Open job bar links both ways.
- **POS.** Walk-in sales already land as jobs once checked out.
- **Print queue, print recipes, production calendar, rejects.** These are shop-floor tools, not lists of jobs.
- **My tasks.** Some tasks aren't about a job.

## Decisions for Sean

1. **Backfill recent enquiries?** 9 contact-form enquiries from the last 14 days have no job. I'd turn those into jobs so New starts accurate, and leave older ones in the archive.
2. **Remove Classic view in step 4?** I'd say yes. The split view is the better changeover.
3. **Possible-bot enquiries:** show them in New with a badge (my pick), or keep them in Lost until someone rescues them? At 1 in 43, showing them costs little.
4. **Name:** "Jobs" (my pick) or keep "Today" for the list?

## Risks and checks

- **Router version.** If the router copy doesn't match the dashboard's, links throw at runtime. The check is the production build plus a click-through on prod right after the step 1 deploy.
- **Pages that read the URL once.** These are the ten files listed in step 1. Any page missed would show stale data after an in-app hop, so each one gets a click-through.
- **Width.** The job window's diary column needs room. Below about 1600 px of screen, the list hides while a job is open rather than squeezing both.
- **Admin bundle rules still apply.** Shared `src/lib` files must not import `@medusajs/framework` at runtime. Run `npx tsc -p tsconfig.admin.json` before each deploy, since the main type-check skips admin code.

## Not in this plan

- Page-view tracking in the admin, to measure hops per job before and after. Worth a few lines if you want the numbers. It's not needed to do the work.
- Bringing ServiceM8 history in.
- Any storefront change, apart from the contact form's backend route in step 2.
