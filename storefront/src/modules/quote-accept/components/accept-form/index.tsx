"use client"

import { useState, useTransition } from "react"

import { acceptQuote, type QuoteForAccept } from "@lib/data/quote-accept"
import DecorationList from "@modules/quote-accept/components/decoration-list"
import JobBreakdown from "@modules/quote-accept/components/job-breakdown"

type Props = {
  id: string
  sig: string
  quote: QuoteForAccept
}

const fmtMoney = (
  amount: number | string | null | undefined,
  currency: string
): string => {
  const n =
    typeof amount === "number"
      ? amount
      : typeof amount === "string"
        ? Number.parseFloat(amount)
        : 0
  if (!Number.isFinite(n) || n === 0) return ""
  try {
    return new Intl.NumberFormat("en-AU", {
      style: "currency",
      currency: currency.toUpperCase(),
    }).format(n)
  } catch {
    return `${currency.toUpperCase()} ${n.toFixed(2)}`
  }
}

const FIELD =
  "mt-1 block w-full min-h-11 rounded-md border border-ui-border-base bg-white px-3 py-2.5 text-base shadow-sm focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand tablet:text-sm"

const AU_STATES = ["NSW", "VIC", "QLD", "WA", "SA", "TAS", "ACT", "NT"]

const AcceptForm = ({ id, sig, quote }: Props) => {
  const [name, setName] = useState(quote.contact_name ?? "")
  const [pickup, setPickup] = useState(false)
  const prefill = quote.delivery_address ?? null
  const [addr, setAddr] = useState({
    address_1: prefill?.address_1 ?? "",
    address_2: prefill?.address_2 ?? "",
    city: prefill?.city ?? "",
    province: prefill?.province ?? "NSW",
    postal_code: prefill?.postal_code ?? "",
    phone: prefill?.phone ?? quote.contact_phone ?? "",
  })
  const setField = (k: keyof typeof addr) => (e: { target: { value: string } }) =>
    setAddr((a) => ({ ...a, [k]: e.target.value }))
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const [placed, setPlaced] = useState<{
    display_id: number | string | null
    pay_url: string | null
  } | null>(
    quote.already_accepted
      ? {
          display_id: quote.order_display_id ?? null,
          pay_url: quote.pay_url ?? null,
        }
      : null
  )

  if (placed) {
    return (
      <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-6">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-700">
          Quote {quote.public_id}
        </p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-emerald-900">
          {placed.display_id
            ? `Order #${placed.display_id} confirmed`
            : "Quote accepted"}
        </h1>
        <p className="mt-2 text-sm text-emerald-800">
          {placed.display_id
            ? "Thanks — your job is booked in. We've emailed your tax invoice with bank-transfer details."
            : "We've got this one moving. If you weren't expecting that, reply to your quote email and we'll sort it out."}
        </p>
        {placed.pay_url ? (
          <a
            href={placed.pay_url}
            className="mt-4 inline-flex min-h-12 w-full items-center justify-center rounded-md bg-ink px-5 py-3 text-base font-semibold text-white shadow-sm hover:opacity-95 tablet:w-auto tablet:py-2 tablet:text-sm"
          >
            Pay now by card
          </a>
        ) : null}
      </div>
    )
  }

  const accept = () => {
    setError(null)
    if (!pickup && (!addr.address_1.trim() || !addr.city.trim() || addr.postal_code.trim().length < 3)) {
      setError("Please add a delivery address, or tick pick-up from the studio.")
      return
    }
    const [first, ...rest] = name.trim().split(/\s+/).filter(Boolean)
    startTransition(async () => {
      const res = await acceptQuote({
        id,
        sig,
        approver_name: name.trim() || undefined,
        pickup,
        shipping_address: pickup
          ? undefined
          : {
              first_name: first,
              last_name: rest.join(" ") || undefined,
              company: quote.company ?? undefined,
              address_1: addr.address_1.trim(),
              address_2: addr.address_2.trim() || undefined,
              city: addr.city.trim(),
              province: addr.province,
              postal_code: addr.postal_code.trim(),
              country_code: "au",
              phone: addr.phone.trim() || undefined,
            },
      })
      if (!res.ok) {
        setError(res.error)
        return
      }
      setPlaced({ display_id: res.display_id, pay_url: res.pay_url })
      // Card payment straight away when a link was minted; the confirmation
      // (with the same button) shows if they come back.
      if (res.pay_url) window.location.href = res.pay_url
    })
  }

  // Big preview: prefer the Studio mockups (every print position); fall back to
  // per-line thumbnails for catalog-only quotes with no design.
  const galleryImages =
    quote.mockups && quote.mockups.length > 0
      ? quote.mockups
      : quote.line_items
          .filter((li) => li.thumbnail)
          .map((li) => ({
            side: "item",
            side_label: li.title ?? null,
            url: li.thumbnail as string,
          }))

  return (
    <div className="rounded-2xl border border-ink/[0.1] bg-white/95 p-6 shadow-[0_4px_40px_rgb(var(--ink)/0.08)]">
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-brand">
        Quote {quote.public_id}
      </p>
      <h1 className="mt-1 text-3xl font-semibold tracking-tight text-ink">
        {quote.subject ?? "Your SC PRINTS quote"}
      </h1>
      {quote.message ? (
        <p className="mt-4 text-sm text-ui-fg-base whitespace-pre-wrap">
          {quote.message}
        </p>
      ) : null}

      <hr className="my-6 border-ink/[0.08]" />

      {/* Large design preview — every print position (front, back, sleeves…) so
          the customer can clearly see what they're agreeing to. */}
      {galleryImages.length > 0 ? (
        <div
          className={`mb-6 grid gap-4 ${
            galleryImages.length === 1
              ? "grid-cols-1"
              : "grid-cols-1 tablet:grid-cols-2"
          }`}
        >
          {galleryImages.map((img, i) => (
            <figure key={`${img.url}-${i}`} className="m-0">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={img.url}
                alt={img.side_label ?? img.side}
                className="w-full max-h-[480px] rounded-xl border border-ink/[0.08] bg-white object-contain"
              />
              {img.side_label ? (
                <figcaption className="mt-1.5 text-center text-xs font-medium uppercase tracking-wide text-ui-fg-subtle">
                  {img.side_label}
                </figcaption>
              ) : null}
            </figure>
          ))}
        </div>
      ) : null}

      <DecorationList decorations={quote.decorations} />

      {quote.job_breakdown ? (
        <JobBreakdown breakdown={quote.job_breakdown} currency={quote.currency_code} />
      ) : null}

      {/* With a job breakdown the per-size ledger is detail, not the story — tuck it away. */}
      {quote.line_items.length > 0 && quote.job_breakdown ? (
        <details className="mb-2">
          <summary className="cursor-pointer text-xs font-semibold uppercase tracking-[0.1em] text-ui-fg-subtle">
            Itemised lines ({quote.line_items.length})
          </summary>
          <ul className="mt-2 divide-y divide-ink/[0.06]">
            {quote.line_items.map((li, idx) => (
              <li key={idx} className="py-2 flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm text-ink">{li.title ?? "Item"}</p>
                  {li.quantity ? <p className="text-xs text-ui-fg-muted">Qty {li.quantity}</p> : null}
                </div>
                <span className="text-sm text-ui-fg-base whitespace-nowrap">
                  {fmtMoney(li.total ?? li.unit_price ?? null, quote.currency_code)}
                </span>
              </li>
            ))}
          </ul>
        </details>
      ) : quote.line_items.length > 0 ? (
        <ul className="divide-y divide-ink/[0.06]">
          {quote.line_items.map((li, idx) => (
            <li
              key={idx}
              className="py-3 flex items-start justify-between gap-3"
            >
              <div className="min-w-0">
                <p className="text-sm font-semibold text-ink">
                  {li.title ?? "Item"}
                </p>
                {li.description ? (
                  <p className="text-xs text-ui-fg-subtle">{li.description}</p>
                ) : null}
                {li.quantity ? (
                  <p className="text-xs text-ui-fg-muted mt-0.5">
                    Qty {li.quantity}
                  </p>
                ) : null}
              </div>
              <span className="text-sm text-ui-fg-base whitespace-nowrap">
                {fmtMoney(li.total ?? li.unit_price ?? null, quote.currency_code)}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-ui-fg-subtle">
          Detailed line items will be confirmed once you accept.
        </p>
      )}

      {quote.total_estimate ? (
        <p className="mt-4 text-right text-base font-semibold text-ink">
          Total estimate {fmtMoney(quote.total_estimate, quote.currency_code)}
        </p>
      ) : null}

      <hr className="my-6 border-ink/[0.08]" />

      <label
        htmlFor="approver"
        className="block text-sm font-semibold text-ink"
      >
        Your name (for our records)
      </label>
      <input
        id="approver"
        value={name}
        onChange={(e) => setName(e.target.value)}
        className="mt-1 block w-full min-h-11 rounded-md border border-ui-border-base bg-white px-3 py-2.5 text-base shadow-sm focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand tablet:text-sm"
        placeholder="e.g. Alex Smith"
      />

      <fieldset className="mt-5 border-0 p-0">
        <legend className="text-sm font-semibold text-ink">Where should we send it?</legend>
        <label className="mt-2 flex min-h-11 items-center gap-2 text-sm text-ink">
          <input
            type="checkbox"
            checked={pickup}
            onChange={(e) => setPickup(e.target.checked)}
            className="h-4 w-4 rounded border-ui-border-base"
          />
          I&apos;ll pick it up from the studio
        </label>
        {!pickup ? (
          <div className="mt-2 grid grid-cols-1 gap-3 tablet:grid-cols-2">
            <div className="tablet:col-span-2">
              <label htmlFor="addr1" className="text-xs font-medium text-ui-fg-subtle">Street address</label>
              <input id="addr1" value={addr.address_1} onChange={setField("address_1")} autoComplete="address-line1" className={FIELD} placeholder="18 Kerr Cres" />
            </div>
            <div className="tablet:col-span-2">
              <label htmlFor="addr2" className="text-xs font-medium text-ui-fg-subtle">Unit / company (optional)</label>
              <input id="addr2" value={addr.address_2} onChange={setField("address_2")} autoComplete="address-line2" className={FIELD} />
            </div>
            <div>
              <label htmlFor="city" className="text-xs font-medium text-ui-fg-subtle">Suburb</label>
              <input id="city" value={addr.city} onChange={setField("city")} autoComplete="address-level2" className={FIELD} placeholder="Pagewood" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="state" className="text-xs font-medium text-ui-fg-subtle">State</label>
                <select id="state" value={addr.province} onChange={setField("province")} autoComplete="address-level1" className={FIELD}>
                  {AU_STATES.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="postcode" className="text-xs font-medium text-ui-fg-subtle">Postcode</label>
                <input id="postcode" value={addr.postal_code} onChange={setField("postal_code")} inputMode="numeric" autoComplete="postal-code" className={FIELD} placeholder="2035" />
              </div>
            </div>
            <div className="tablet:col-span-2">
              <label htmlFor="phone" className="text-xs font-medium text-ui-fg-subtle">Phone (for the courier)</label>
              <input id="phone" value={addr.phone} onChange={setField("phone")} inputMode="tel" autoComplete="tel" className={FIELD} />
            </div>
          </div>
        ) : null}
      </fieldset>

      {error ? (
        <p className="mt-3 text-sm text-rose-700">{error}</p>
      ) : null}

      <div className="mt-4 flex flex-col gap-3 tablet:flex-row tablet:items-center tablet:justify-end tablet:gap-2">
        <button
          type="button"
          onClick={accept}
          disabled={pending}
          className="inline-flex min-h-12 w-full items-center justify-center rounded-md bg-ink px-5 py-3 text-base font-semibold text-white shadow-sm hover:opacity-95 disabled:opacity-60 tablet:w-auto tablet:py-2 tablet:text-sm"
        >
          {pending ? "Placing your order…" : "Accept and place order"}
        </button>
      </div>

      <p className="mt-6 text-xs text-ui-fg-muted">
        Accepting places your order at the prices above and emails your tax
        invoice. You can pay by card straight away or by bank transfer. Reply
        to your quote email if anything needs to change first.
      </p>
    </div>
  )
}

export default AcceptForm
