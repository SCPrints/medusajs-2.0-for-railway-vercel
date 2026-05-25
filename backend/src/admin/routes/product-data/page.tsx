import { defineRouteConfig } from "@medusajs/admin-sdk"
import { Container, Heading, Tabs, Text } from "@medusajs/ui"
import { CogSixTooth } from "@medusajs/icons"

import { HelpTooltip } from "../../components/reports/help-tooltip"
import AsColourImportPage from "../ascolour-import/page"
import FashionBizImportPage from "../fashionbiz-import/page"
import AussiePacificImportPage from "../aussie-pacific-import/page"
import ProductTypeTagManagePage from "../product-type-tag-manage/page"
import SpreadsheetSyncPage from "../spreadsheet-sync/page"
import SpreadsheetSyncUpdatePage from "../spreadsheet-sync-update/page"
import ProductsManagerTab from "./components/products-manager-tab"
import TaxonomyAuditPanel from "./components/taxonomy-audit-panel"

/**
 * Consolidated entry point for SC Prints' product-data tooling.
 *
 * Three workflows that all operate on Medusa products via CSV / bulk
 * actions used to live as three separate sidebar entries. They are now
 * tabs inside one route so the admin sees a single "Product data" page
 * with a clear description of when to use each tab.
 *
 * The underlying tab bodies are the original page components imported
 * from their original folders — keeping the implementations isolated
 * makes it cheap to revert or rework one tab independently. The three
 * source pages have had their `defineRouteConfig` exports removed so
 * they no longer appear in the sidebar (they're still routable by
 * direct URL for deep links / muscle memory).
 */
const ProductDataPage = () => {
  return (
    <div className="flex flex-col gap-y-4">
      <Container className="flex flex-col gap-y-2">
        <Heading level="h1" className="flex items-center">
          Product data
          <HelpTooltip
            text={{
              title: "Product data",
              body: "Three bulk-catalog workflows on a single page. Each tab is a different surgical instrument — pick the right one before running.",
              bullets: [
                "Import new products: from a supplier CSV (DNC, FashionBiz, AS Colour, etc.). Creates products that don't exist yet — never use to tweak existing ones.",
                "Update existing: patches columns on already-imported products. Matches by SKU; only patches the columns you tick.",
                "Browse & manage: filter the catalog by brand, type, tag, category, sales channel, or data-quality gap, then bulk-edit selected products (status, brand, tags, sales channels, categories, collection, delete, export CSV).",
                "Types & tags: delete unused or duplicate product types and tags from the store.",
                "Taxonomy audit: live count of products missing the type, demographic tag, or Shop category the storefront needs to group them by.",
                "Result logs are scoped to your last action — they clear when you start a new sync or pick a new file.",
              ],
            }}
          />
        </Heading>
        <Text size="small" className="text-ui-fg-subtle">
          Bulk operations on the product catalog. Each tab is a separate
          workflow — read the description before running. Browse &amp; manage
          is the day-to-day surface; the other tabs are one-shot tools.
        </Text>
      </Container>

      <Tabs defaultValue="browse-manage">
        <Container>
          <Tabs.List>
            <Tabs.Trigger value="browse-manage">Browse &amp; manage</Tabs.Trigger>
            <Tabs.Trigger value="import-new">Import new products</Tabs.Trigger>
            <Tabs.Trigger value="update-existing">Update existing</Tabs.Trigger>
            <Tabs.Trigger value="types-tags">Types &amp; tags</Tabs.Trigger>
            <Tabs.Trigger value="taxonomy-audit">Taxonomy audit</Tabs.Trigger>
            <Tabs.Trigger value="ascolour-import">AS Colour Import</Tabs.Trigger>
            <Tabs.Trigger value="fashionbiz-import">FashionBiz Import</Tabs.Trigger>
            <Tabs.Trigger value="aussie-pacific-import">Aussie Pacific Import</Tabs.Trigger>
          </Tabs.List>
        </Container>

        <Tabs.Content value="browse-manage" className="flex flex-col gap-y-3">
          <Container>
            <Text size="small" className="text-ui-fg-subtle">
              Rich filter + bulk-edit surface. Use the data-quality
              checkboxes to find products missing an image, description,
              brand, type, tag, sales channel, or shop category — then
              tick the rows and pick a bulk action (change status, set
              brand, set tags, etc.). Bulk delete lives here too, behind
              a typed confirmation.
            </Text>
          </Container>
          <ProductsManagerTab />
        </Tabs.Content>

        <Tabs.Content value="import-new" className="flex flex-col gap-y-3">
          <Container>
            <Text size="small" className="text-ui-fg-subtle">
              Paste or upload a supplier catalogue CSV (DNC Workwear,
              Fashion Biz, AS Colour Gold, etc.) to <strong>create</strong>{" "}
              new products. Auto-detects the format, expands variants,
              applies category and shipping-profile defaults, and runs the
              import in chunks. Use this when adding a new range — never
              for tweaking existing products.
            </Text>
          </Container>
          <SpreadsheetSyncPage />
        </Tabs.Content>

        <Tabs.Content value="update-existing" className="flex flex-col gap-y-3">
          <Container>
            <Text size="small" className="text-ui-fg-subtle">
              Upload a spreadsheet to <strong>update</strong> existing
              products / variants — pricing, garment-image metadata, colour
              tags, etc. Matches by SKU and only patches the columns you
              tick. Safer than the import tab; still review the preview
              before confirming.
            </Text>
          </Container>
          <SpreadsheetSyncUpdatePage />
        </Tabs.Content>

        <Tabs.Content value="types-tags" className="flex flex-col gap-y-3">
          <Container>
            <Text size="small" className="text-ui-fg-subtle">
              View and permanently delete product types and tags from your
              store. Deleting a type or tag unassigns it from every product
              that uses it — this cannot be undone.
            </Text>
          </Container>
          <ProductTypeTagManagePage />
        </Tabs.Content>

        <Tabs.Content value="taxonomy-audit" className="flex flex-col gap-y-3">
          <Container>
            <Text size="small" className="text-ui-fg-subtle">
              Live audit of products missing the three taxonomy signals the
              storefront groups products by: <strong>product type</strong>,{" "}
              <strong>demographic tag</strong> (Mens / Womens / Kids /
              Unisex), and <strong>Shop category</strong>. Run after every
              supplier import to confirm nothing fell through. Bulk-fix
              via the backfill script — see the note at the bottom of the
              panel.
            </Text>
          </Container>
          <TaxonomyAuditPanel />
        </Tabs.Content>

        <Tabs.Content value="ascolour-import" className="flex flex-col gap-y-3">
          <AsColourImportPage />
        </Tabs.Content>

        <Tabs.Content value="fashionbiz-import" className="flex flex-col gap-y-3">
          <FashionBizImportPage />
        </Tabs.Content>

        <Tabs.Content value="aussie-pacific-import" className="flex flex-col gap-y-3">
          <AussiePacificImportPage />
        </Tabs.Content>
      </Tabs>
    </div>
  )
}

export const config = defineRouteConfig({
  label: "Product data",
  icon: CogSixTooth,
})

export default ProductDataPage
