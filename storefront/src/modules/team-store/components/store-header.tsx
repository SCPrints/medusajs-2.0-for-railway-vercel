import type { TeamStoreView } from "@lib/data/team-stores"

const day = (iso: string) =>
  new Date(iso).toLocaleString("en-AU", { weekday: "long", day: "numeric", month: "long", hour: "numeric", minute: "2-digit", timeZone: "Australia/Sydney" })

/** Banner, intro, closing date and delivery note. */
export default function StoreHeader({ store }: { store: TeamStoreView["store"] }) {
  const daysLeft = Math.ceil((new Date(store.closes_at).getTime() - Date.now()) / 86_400_000)
  return (
    <header className="flex flex-col gap-3" style={store.accent_colour ? ({ "--team-accent": store.accent_colour } as React.CSSProperties) : undefined}>
      {store.banner_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={store.banner_url} alt="" className="max-h-56 w-full rounded-xl object-cover" />
      ) : null}
      {store.organisation_name ? <p className="text-sm font-semibold uppercase tracking-wide text-ui-fg-subtle">{store.organisation_name}</p> : null}
      <h1 className="text-3xl font-semibold" style={store.accent_colour ? { color: store.accent_colour } : undefined}>
        {store.title}
      </h1>
      {store.intro ? <p className="whitespace-pre-line text-ui-fg-subtle">{store.intro}</p> : null}
      {store.state === "open" ? (
        <p className="rounded-md bg-ui-bg-subtle p-3 text-sm">
          Orders close {day(store.closes_at)}
          {daysLeft > 0 ? ` (${daysLeft} day${daysLeft === 1 ? "" : "s"} left)` : ""}. Orders print once the store closes.
          {store.delivery_mode === "bulk" ? " Everything is delivered to the club together, free." : ""}
          {store.fundraising_per_item
            ? ` Each price includes $${store.fundraising_per_item.toFixed(2)} for ${store.organisation_name ?? "the club"}.`
            : ""}
        </p>
      ) : null}
    </header>
  )
}
