# Admin: one window per job — proposal v2 (23 Oct 2026)

Follows [ADMIN_WORKFLOW_CONSOLIDATION_2026_10.md](ADMIN_WORKFLOW_CONSOLIDATION_2026_10.md) (shipped 21 Oct). Reference: Sean's ServiceM8 job window. Presentation with wireframes: https://claude.ai/artifact/ARYAfQF6kbkbjFF1j74Cam

v1 was reviewed the same day by a multi-agent pass: 5 code readers (widgets, quotes + pricer, job model, Medusa order page, staff scenarios), 5 critics (simplicity, completeness, feasibility, ServiceM8 parity, click counts), 3 skeptics per finding. 30 findings → 24 confirmed, 6 refuted; a final pass added 8 gaps. This doc is the revised plan. Status: **proposal, not approved**.

## Verdict

The shape holds: one window, action bar on top, job facts left, diary right. v1 was too much rewrite and not enough fixing. v2 fixes next-action bugs first, moves existing widgets instead of rebuilding them, and removes more from the screen.

## Step 0 — next-action bugs live today (fix first, ~2 days, each with a job-state/build spec case)

**Status 23 Oct: built, tested (job-state / job-today / production-due-date specs), not yet committed or deployed.** Rush lead days default to Priority 3 / Express 1 business days (`PRODUCTION_LEAD_BUSINESS_DAYS_PRIORITY` / `_EXPRESS`) until Sean decides.

| Symptom | Cause | Fix |
| --- | --- | --- |
| Sent quotes stay "Price it" in waiting-on-us | `POST /admin/quotes/:id/design-approval-link` logs an event but never sets status/quoted_at; pricer "Save and email" calls the same route | In that route, after a successful send with `include_quote` and `status === "new"`: set `quoted` + `quoted_at`, log `{from,to}` |
| Logged call/note doesn't clear "waiting on us"; customer_reply task stays open | `build.ts` counts only `email_out` as outbound; `jobs/[id]/reply` closes the task only for `channel === "email"` (its doc comment says either) | Count composer notes (`STAFF_NOTE_ACTOR_PREFIX`) as outbound; drop the email-only guard |
| Emailing DSP marks the customer answered | `dsp-pack` route logs with `STAFF_EMAIL_ACTOR_PREFIX` → `email_out` | Log as a plain/supplier note |
| Proof change request lights "Reply", not "Revise the proof" | `build.ts` folds `artwork_changes_requested_at` / `design_changes_requested_at` into `last_inbound_at`; reply rule runs first | Stop folding them; when a `revised_proofs` entry is newer than the request, derive `send_proof` |
| Shipped/delivered with money owing vanishes from every list | `today.ts` drops shipped/delivered; `job-state` returns none before checking money | Leave Today only when delivered **and** paid; owing after dispatch → `nudge_payment` "Chase balance (due …/overdue)" |
| Terms customers stuck on "Send payment link" before proof | `paidOk` ignores `balance_due_at` / payment terms | `paidOk = paid \|\| (deposit_required ? deposit_paid : !!balance_due_at)` |
| "Order blanks" stays lit after AS Colour / AP send | send-to-ascolour / send-to-aussie-pacific don't set blanks_stage | On 2xx set `blanks_stage = ordered` via the production-stage path (history/audit/events fire) |
| Walk-in stock sales sit on Today as "Start production" | no POS branch; undecorated paid order falls through | `pos_session_id` + no decorated lines → "Collected" (existing fast-forward route) |
| Express jobs get a 7-day due date; on-time report's rush bucket always empty | `job_pricer.state.rush` dropped by `convert.ts`; nothing writes `is_rush` | Stamp `rush_tier` + `is_rush` at convert; due-date lead days per tier; Express chip; rush sorts first |

## Step 1 — status 23 Oct: built, not committed

- Diary is a right-hand column on `/app/jobs/:id` (composer, pinned open tasks with Done, routine rows folded into "N updates", unanswered customer email highlighted). The Activity tab is gone.
- "Follow up on <date>" (`POST /admin/jobs/:id/follow-up`) creates a task with `metadata.follow_up`; `deriveJobState` parks a customer-waiting job until the date, then returns `follow_up`. Answering the customer closes a due follow-up.
- One action bar: next action once, then Proof · Invoice & pay · Blanks · Change stage (orders), or Edit quote/pricer (quotes), then More (Send to DSP, Drive folder, Medusa order page, Open quote, Add a task, Copy job link). Each verb opens its existing widget in a Drawer. "Order blanks" / "Revise the proof" open their drawer.
- Medusa order page: the job panel is replaced by a one-line "Job #N · phase · next · Open job →" bar (no redirect).
- cmd-K finds quotes by name, company, email, phone (digits), Q-number or subject; order and quote hits open the job. ~20 staff links (attention + stale emails, quote-action email, pricing digest, customer journey, tasks, production board, print queue, calendars, dropship, fulfilment, reports, POS receipt, open carts) point at `/app/jobs/:id`.
- Audit rows that duplicate a diary entry (stage_changed, job_reply, job_note, dsp_job_sent) are skipped.
- Not clicked through in a browser (local Postgres not running); covered by specs, server + admin tsc and `pnpm build`.

## Changes from v1

| v1 | v2 |
| --- | --- |
| Redirect `/app/orders/:id` to the job | **No redirect** (it loops and strands refund / cancel / edit order / address / capture / mark paid, which only exist on Medusa's page). Replace the job panel on the Medusa page with a one-line bar "Job #N · phase · Open job →". Point every staff link (attention + stale emails, notify-quote-action, order-placed, cmd-K, customer journey, tasks, pricing digest, pricer saves, `actions.ts`) at `/app/jobs/:id`. Fixes the existing `/app/quotes?quote=` link bug too. |
| 11-verb toolbar + next-action bar + section actions | One primary button (job-state next action, once) + only the verbs that apply to this job + More ▾ (Medusa order page, copy links, task, classic view). Email/notes only in the diary composer. Sections show facts. Verbs open the existing widget, unchanged, in a Drawer. |
| Sections rendered from the job read model, widget fetches dropped | **Move, don't rewrite.** Summary line from JobView (plus scalars already in `order.metadata`); body = existing widget without its Container/heading, keeping its own fetch and writes. Add no queries to `getJob` — Today calls it for every open job. Delete duplicates: dead OrderTimeline + OrderCommentsAudit, LinePrintNotes, money tiles in Deposit/EmailInvoice, Owner label, order re-fetches in LinePrintNotes/AuspostParcels. |
| Pricer as a drawer | Pricer stays a full page (wider than a Drawer; FocusModal would hide the job). Its saves return to `/app/jobs/:id` instead of `/app/quotes?id=`. `jp_` lines read-only in the window ("Edit in pricer"); hand-added lines editable inline; after conversion the quote is "as sent" and changes go through Medusa Edit order. |
| Delete the quote drawer | Move its 15 abilities first (parity checklist): Send quote with note + include-price toggle, copy accept/design links, status incl. Lost/Expired/Re-open, owner, estimate, message, add product/custom line, line edits, mockups, Copy design to…, Studio per line, mood board, sign-off banner, cost breakdown. Delete the old detail view only when all are ticked. |
| Retire Enquiries; new "New job" dialog | Keep Enquiries as the inbox for unqualified enquiries (bot flag only marks, doesn't block). Add "Start job". "+ New job" = existing NewQuoteDrawer, redirecting to `/app/jobs/:id`. |
| Money section + header money strip + DUE | Header shows Owing only. Money is the Lines footer: total, paid, owing, deposit/balance link status, est. profit. Production due date sits on the phase strip as "due out". |
| No cost/profit | Margin column + footer "Cost ex · est. profit (%) · priced <date>" from `quote.metadata.job_pricer.snapshot` (already loaded by getJob). Copy the snapshot onto the order at convert. Non-pricer jobs: "cost not tracked" (later). |
| Lines with DPI per position | Lines grouped in `build.ts` by product + colour option, sizes as "S 4 · M 10 · L 10"; setups in the footer. No DPI (never stored) — show the existing vectorisation chip. |
| Details section | Removed. Flags in the action bar, open tasks pinned in the diary, watchers as "+N cc on updates" in the header, tags stay customer data. |
| Diary filters All/Customer/Staff/System | No filters. Customer emails highlighted, runs of stage/status/system/task rows fold to "N updates ▸". Skip audit rows that duplicate a diary entry. "Follow up on <date>" in the composer = a Task that parks nudges until the date (also replaces Studio's dead snooze bucket). |
| 9-queue strip over Today's 3 sections | One list with chips, counted by a pure tested `queueFor()` in `lib/job-today.ts` from what the job is waiting for (next action / tracks), never from `phase` (phase is the last finished step). Chips: Needs us (default) · To quote · Quoted · Artwork · Blanks · Production · Waiting payment · Enquiries →. Summary line: owed $ · late · at risk · new enquiries. |
| ~2 weeks | ~4 weeks (below). |

## Gaps added in v2

- **Concurrent edits.** `POST /admin/quotes/:id` replaces line_items/metadata wholesale with no version check. Accept `expected_updated_at`, 409 `quote_changed`; pricer sends it too. Add `job` to presence entities; header shows "Collins is also in this job".
- **No real customer email** (POS walk-in → `POS_WALKIN_EMAIL`). `JobView.customer.no_email`; email verbs disabled, composer defaults to Log call, stage/proof subscribers skip the walk-in inbox.
- **Customer's needed-by date.** Never captured (lands in free-text). Optional `needed_by` on enquiries/new job, copied at convert; job-state flags late / at risk. Powers the owed · late · at-risk line.
- **cmd-K can't find a quote by name/company/phone.** Add a quotes block reusing the `/admin/quotes?q=` haystack + digits-only phone; all hits open the job.
- **Inbound attachments are dropped.** Fetch via Resend receiving attachments API, store via file module, show in the diary with "Use as artwork". Do before switching inbound on (§9 of the October plan).
- **First week.** Keep `job-panel.tsx` as a per-user "Classic view" for two weeks, a dismissible "what moved" card, and update STAFF_GUIDE + Help (they describe tabs).

## Phasing

| Step | Change | Effort | Depends on |
| --- | --- | --- | --- |
| 0 | Next-action bugs (table above) | 2 d | — |
| 1 | Diary right column; action bar opening existing widgets in drawers; Medusa page → "Open job" bar; links + cmd-K repointed, quote search | 3 d | — |
| 2 | Tabs → sections; grouped lines + margin + money footer; delete duplicates; presence + 409; Classic view, what-moved card, docs | 7 d | 1 |
| 3 | Quote parity checklist into the window; New job → job window; pricer returns to job; delete old quote detail view | 5 d | 2 |
| 4 | Today chips via `queueFor`, owed/late/at-risk line, needed_by capture, Enquiries chip + Start job | 3 d | 0 |

Each step: `npx tsc -p backend/tsconfig.admin.json` filtered to touched files, and click through an AS Colour, Aussie Pacific, bottle-shop, DSP and plain DTF order.

## Refuted / left out

- Split Production by print method (Print queue already groups by DTF/screen/UV/embroidery; adds chips).
- Printable job sheet (the Mockup PDF already is one).
- Per-person "my jobs" view and a cheap paginated `/app/jobs` list (not needed at current volume; owner is on every job).
- Production board drag/bulk advance (it has neither; one-click advance only).
- Sidebar regroup (staff learned it on 21 Oct).
- Later: separate billing/accounts email, proof/quote opened tracking + "open as customer", tracking number capture on Mark shipped, ready-for-pickup email.

## Decisions for Sean

1. Lead days for Priority and Express (Standard = 7 business days from proof approval).
2. `needed_by` on new jobs: optional or required.
3. Contact-form enquiries: stay in Enquiries with "Start job" (proposed), or auto-create a job for each and mark spam lost.
