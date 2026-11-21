import { Metadata } from "next"
import ArtworkLibrary from "@modules/account/components/artwork-library"
import { listMyArtwork } from "@lib/data/artwork"
import { listMyOrganisations } from "@lib/data/organisations"

export const metadata: Metadata = {
  title: "My artwork",
  description: "Your logos and artwork, ready to put on any garment.",
}

export default async function ArtworkPage() {
  const [artwork, memberships] = await Promise.all([listMyArtwork(), listMyOrganisations()])
  const organisations = memberships
    .filter((m) => m.organisation && (m.role === "owner" || m.role === "purchaser"))
    .map((m) => ({ id: m.organisation!.id, name: m.organisation!.name }))

  return (
    <div className="w-full" data-testid="artwork-page-wrapper">
      <header className="mb-8 border-l-4 border-brand pl-4">
        <p className="text-xs font-semibold uppercase tracking-[0.12em]">
          Logo library
        </p>
        <h1 className="mt-2 text-2xl font-semibold text-ui-fg-base small:text-3xl small:leading-8">My artwork</h1>
        <p className="mt-3 max-w-2xl text-sm text-ui-fg-subtle small:text-base">
          Keep your logos here and put them on any garment in a couple of clicks.
        </p>
      </header>
      <ArtworkLibrary artwork={artwork} organisations={organisations} />
    </div>
  )
}
