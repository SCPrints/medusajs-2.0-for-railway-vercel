import { Metadata } from "next"

import SearchModal from "@modules/search/templates/search-modal"

// Search UI, not content. Keep it out of the index rather than let it inherit
// a canonical from an ancestor.
export const metadata: Metadata = {
  title: "Search",
  robots: { index: false, follow: true },
}

export default async function SearchModalRoute(){return <SearchModal />
}
