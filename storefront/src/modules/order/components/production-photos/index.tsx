import { HttpTypes } from "@medusajs/types"

type Photo = { id?: string; url: string; caption?: string | null; uploaded_at?: string }

/**
 * Photos staff took of the job (order.metadata.production_photos, written by
 * the admin "Production photos" panel), newest first. Renders nothing until
 * there is at least one.
 */
const ProductionPhotos = ({ order }: { order: HttpTypes.StoreOrder }) => {
  const raw = (order.metadata as Record<string, unknown> | null)?.production_photos
  const photos = (Array.isArray(raw) ? (raw as Photo[]) : [])
    .filter((p) => typeof p?.url === "string" && p.url.length > 0)
    .sort((a, b) => (b.uploaded_at ?? "").localeCompare(a.uploaded_at ?? ""))
  if (photos.length === 0) return null

  return (
    <section
      className="rounded-lg border border-ui-border-base bg-ui-bg-base p-4"
      data-testid="production-photos"
    >
      <h2 className="text-base font-semibold text-ui-fg-base">
        Photos of your job
      </h2>
      <p className="mt-0.5 text-xs text-ui-fg-subtle">
        Taken in our studio. Tap a photo to see it full size.
      </p>
      <ul className="mt-3 grid grid-cols-2 gap-3 tablet:grid-cols-3">
        {photos.map((p) => (
          <li key={p.id ?? p.url}>
            <a
              href={p.url}
              target="_blank"
              rel="noopener noreferrer"
              className="block overflow-hidden rounded-md border border-ui-border-base"
            >
              {/* Plain img: photos are shrunk in the browser before staff upload them. */}
              <img
                src={p.url}
                alt={p.caption ?? "Photo of your job in production"}
                loading="lazy"
                decoding="async"
                className="aspect-square w-full object-cover"
              />
            </a>
            {p.caption ? (
              <p className="mt-1 text-xs text-ui-fg-subtle">{p.caption}</p>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  )
}

export default ProductionPhotos
