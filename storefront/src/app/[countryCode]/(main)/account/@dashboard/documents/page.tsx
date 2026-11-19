import { Metadata } from "next"

import { listSupplierDocuments } from "@lib/data/documents"
import DocumentsList from "@modules/account/components/documents"

export const metadata: Metadata = {
  title: "Documents",
  description: "SC Prints supplier documents, and where to find your own.",
}

export default async function DocumentsPage() {
  const documents = await listSupplierDocuments()
  return (
    <div className="w-full" data-testid="documents-page-wrapper">
      <header className="mb-8 border-l-4 border-brand pl-4">
        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--brand-primary)]/80">Documents</p>
        <h1 className="mt-2 text-2xl font-semibold text-ui-fg-base small:text-3xl">Documents</h1>
        <p className="mt-3 max-w-2xl text-sm text-ui-fg-subtle small:text-base">
          Our ABN, insurance and other certificates, ready to download.
        </p>
      </header>
      <DocumentsList documents={documents} />
    </div>
  )
}
