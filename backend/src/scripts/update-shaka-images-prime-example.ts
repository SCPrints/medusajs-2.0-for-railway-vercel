/**
 * One-off: swap the 6 Shaka Wear products' galleries from Shaka US Shopify-CDN
 * hotlinks to SC-Prints-hosted R2 copies of Prime Example's cleared assets
 * (flat-lay front/back per colour + up to 2 model shots per colour, uploaded
 * 2026-08-27 under shaka-wear/ with colour-token filenames the storefront
 * matcher reads).
 *
 * Uses writeProductImages with `explicitRemovals` — the operator-sanctioned
 * replacement path: only the exact cdn.shopify.com URLs currently on each
 * product are removed, additions are HEAD-validated, gallery can never empty.
 *
 * Usage:
 *   # Local:  cd backend && IMPORT_DRY_RUN=1 npx medusa exec src/scripts/update-shaka-images-prime-example.ts
 *   # Prod:   cd /app/.medusa/server && IMPORT_DRY_RUN=1 npx medusa exec src/scripts/update-shaka-images-prime-example.js
 *            (re-run without IMPORT_DRY_RUN to write)
 *
 * Idempotent: re-running finds no shopify URLs and no missing additions → no-op.
 */

import { ExecArgs } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import { writeProductImages } from "../lib/safe-product-images"
import { revalidateStorefrontTags } from "../lib/storefront-revalidate"

// handle → colour (catalog order) → [front, back, ...models] on R2
const MANIFEST: Record<string, Record<string, string[]>> = {
  "shaka-wear-max-heavyweight-tee": {
    "Black": [
      "https://pub-4b98c1b8d55d4d9597ff5cfac6aa611a.r2.dev/shaka-wear/10M-001_Black_Front.png",
      "https://pub-4b98c1b8d55d4d9597ff5cfac6aa611a.r2.dev/shaka-wear/10M-001_Black_Back.png",
      "https://pub-4b98c1b8d55d4d9597ff5cfac6aa611a.r2.dev/shaka-wear/10M-001_Black_Model_1.png",
      "https://pub-4b98c1b8d55d4d9597ff5cfac6aa611a.r2.dev/shaka-wear/10M-001_Black_Model_2.png"
    ],
    "White": [
      "https://pub-4b98c1b8d55d4d9597ff5cfac6aa611a.r2.dev/shaka-wear/10M-001_White_Front.png",
      "https://pub-4b98c1b8d55d4d9597ff5cfac6aa611a.r2.dev/shaka-wear/10M-001_White_Back.png",
      "https://pub-4b98c1b8d55d4d9597ff5cfac6aa611a.r2.dev/shaka-wear/10M-001_White_Model_1.png",
      "https://pub-4b98c1b8d55d4d9597ff5cfac6aa611a.r2.dev/shaka-wear/10M-001_White_Model_2.png"
    ],
    "Dark Grey": [
      "https://pub-4b98c1b8d55d4d9597ff5cfac6aa611a.r2.dev/shaka-wear/10M-001_DarkGrey_Front.jpg",
      "https://pub-4b98c1b8d55d4d9597ff5cfac6aa611a.r2.dev/shaka-wear/10M-001_DarkGrey_Back.jpg",
      "https://pub-4b98c1b8d55d4d9597ff5cfac6aa611a.r2.dev/shaka-wear/10M-001_DarkGrey_Model_1.jpg",
      "https://pub-4b98c1b8d55d4d9597ff5cfac6aa611a.r2.dev/shaka-wear/10M-001_DarkGrey_Model_2.jpg"
    ]
  },
  "shaka-wear-max-heavyweight-garment-dye-tee": {
    "Black": [
      "https://pub-4b98c1b8d55d4d9597ff5cfac6aa611a.r2.dev/shaka-wear/10M-002_Black_Front.jpg",
      "https://pub-4b98c1b8d55d4d9597ff5cfac6aa611a.r2.dev/shaka-wear/10M-002_Black_Back.jpg",
      "https://pub-4b98c1b8d55d4d9597ff5cfac6aa611a.r2.dev/shaka-wear/10M-002_Black_Model_1.jpg",
      "https://pub-4b98c1b8d55d4d9597ff5cfac6aa611a.r2.dev/shaka-wear/10M-002_Black_Model_2.jpg"
    ],
    "Shadow": [
      "https://pub-4b98c1b8d55d4d9597ff5cfac6aa611a.r2.dev/shaka-wear/10M-002_Shadow_Front.jpg",
      "https://pub-4b98c1b8d55d4d9597ff5cfac6aa611a.r2.dev/shaka-wear/10M-002_Shadow_Back.jpg",
      "https://pub-4b98c1b8d55d4d9597ff5cfac6aa611a.r2.dev/shaka-wear/10M-002_Shadow_Model_1.jpg",
      "https://pub-4b98c1b8d55d4d9597ff5cfac6aa611a.r2.dev/shaka-wear/10M-002_Shadow_Model_2.jpg"
    ],
    "Cream": [
      "https://pub-4b98c1b8d55d4d9597ff5cfac6aa611a.r2.dev/shaka-wear/10M-002_Cream_Front.jpg",
      "https://pub-4b98c1b8d55d4d9597ff5cfac6aa611a.r2.dev/shaka-wear/10M-002_Cream_Back.jpg",
      "https://pub-4b98c1b8d55d4d9597ff5cfac6aa611a.r2.dev/shaka-wear/10M-002_Cream_Model_1.jpg",
      "https://pub-4b98c1b8d55d4d9597ff5cfac6aa611a.r2.dev/shaka-wear/10M-002_Cream_Model_2.jpg"
    ],
    "White": [
      "https://pub-4b98c1b8d55d4d9597ff5cfac6aa611a.r2.dev/shaka-wear/10M-002_White_Front.jpg",
      "https://pub-4b98c1b8d55d4d9597ff5cfac6aa611a.r2.dev/shaka-wear/10M-002_White_Back.jpg",
      "https://pub-4b98c1b8d55d4d9597ff5cfac6aa611a.r2.dev/shaka-wear/10M-002_White_Model_1.jpg",
      "https://pub-4b98c1b8d55d4d9597ff5cfac6aa611a.r2.dev/shaka-wear/10M-002_White_Model_2.jpg"
    ],
    "Cement": [
      "https://pub-4b98c1b8d55d4d9597ff5cfac6aa611a.r2.dev/shaka-wear/10M-002_Cement_Front.jpg",
      "https://pub-4b98c1b8d55d4d9597ff5cfac6aa611a.r2.dev/shaka-wear/10M-002_Cement_Back.jpg",
      "https://pub-4b98c1b8d55d4d9597ff5cfac6aa611a.r2.dev/shaka-wear/10M-002_Cement_Model_1.jpg",
      "https://pub-4b98c1b8d55d4d9597ff5cfac6aa611a.r2.dev/shaka-wear/10M-002_Cement_Model_2.jpg"
    ],
    "Denim": [
      "https://pub-4b98c1b8d55d4d9597ff5cfac6aa611a.r2.dev/shaka-wear/10M-002_Denim_Front.jpg",
      "https://pub-4b98c1b8d55d4d9597ff5cfac6aa611a.r2.dev/shaka-wear/10M-002_Denim_Back.jpg",
      "https://pub-4b98c1b8d55d4d9597ff5cfac6aa611a.r2.dev/shaka-wear/10M-002_Denim_Model_1.jpg",
      "https://pub-4b98c1b8d55d4d9597ff5cfac6aa611a.r2.dev/shaka-wear/10M-002_Denim_Model_2.jpg"
    ],
    "Moss": [
      "https://pub-4b98c1b8d55d4d9597ff5cfac6aa611a.r2.dev/shaka-wear/10M-002_Moss_Front.jpg",
      "https://pub-4b98c1b8d55d4d9597ff5cfac6aa611a.r2.dev/shaka-wear/10M-002_Moss_Back.jpg",
      "https://pub-4b98c1b8d55d4d9597ff5cfac6aa611a.r2.dev/shaka-wear/10M-002_Moss_Model_1.jpg",
      "https://pub-4b98c1b8d55d4d9597ff5cfac6aa611a.r2.dev/shaka-wear/10M-002_Moss_Model_2.jpg"
    ],
    "Mustard": [
      "https://pub-4b98c1b8d55d4d9597ff5cfac6aa611a.r2.dev/shaka-wear/10M-002_Mustard_Front.jpg",
      "https://pub-4b98c1b8d55d4d9597ff5cfac6aa611a.r2.dev/shaka-wear/10M-002_Mustard_Back.jpg",
      "https://pub-4b98c1b8d55d4d9597ff5cfac6aa611a.r2.dev/shaka-wear/10M-002_Mustard_Model_1.jpg",
      "https://pub-4b98c1b8d55d4d9597ff5cfac6aa611a.r2.dev/shaka-wear/10M-002_Mustard_Model_2.jpg"
    ]
  },
  "shaka-wear-garment-dye-drop-shoulder-tee": {
    "Black": [
      "https://pub-4b98c1b8d55d4d9597ff5cfac6aa611a.r2.dev/shaka-wear/10M-003_Black_Front.jpg",
      "https://pub-4b98c1b8d55d4d9597ff5cfac6aa611a.r2.dev/shaka-wear/10M-003_Black_Back.jpg",
      "https://pub-4b98c1b8d55d4d9597ff5cfac6aa611a.r2.dev/shaka-wear/10M-003_Black_Model_1.jpg",
      "https://pub-4b98c1b8d55d4d9597ff5cfac6aa611a.r2.dev/shaka-wear/10M-003_Black_Model_2.jpg"
    ],
    "Shadow": [
      "https://pub-4b98c1b8d55d4d9597ff5cfac6aa611a.r2.dev/shaka-wear/10M-003_Shadow_Front.jpg",
      "https://pub-4b98c1b8d55d4d9597ff5cfac6aa611a.r2.dev/shaka-wear/10M-003_Shadow_Back.jpg",
      "https://pub-4b98c1b8d55d4d9597ff5cfac6aa611a.r2.dev/shaka-wear/10M-003_Shadow_Model_1.jpg",
      "https://pub-4b98c1b8d55d4d9597ff5cfac6aa611a.r2.dev/shaka-wear/10M-003_Shadow_Model_2.jpg"
    ],
    "White": [
      "https://pub-4b98c1b8d55d4d9597ff5cfac6aa611a.r2.dev/shaka-wear/10M-003_White_Front.jpg",
      "https://pub-4b98c1b8d55d4d9597ff5cfac6aa611a.r2.dev/shaka-wear/10M-003_White_Back.jpg",
      "https://pub-4b98c1b8d55d4d9597ff5cfac6aa611a.r2.dev/shaka-wear/10M-003_White_Model_1.jpg",
      "https://pub-4b98c1b8d55d4d9597ff5cfac6aa611a.r2.dev/shaka-wear/10M-003_White_Model_2.jpg"
    ],
    "Cream": [
      "https://pub-4b98c1b8d55d4d9597ff5cfac6aa611a.r2.dev/shaka-wear/10M-003_Cream_Front.jpg",
      "https://pub-4b98c1b8d55d4d9597ff5cfac6aa611a.r2.dev/shaka-wear/10M-003_Cream_Back.jpg"
    ],
    "Oatmeal": [
      "https://pub-4b98c1b8d55d4d9597ff5cfac6aa611a.r2.dev/shaka-wear/10M-003_Oatmeal_Front.jpg",
      "https://pub-4b98c1b8d55d4d9597ff5cfac6aa611a.r2.dev/shaka-wear/10M-003_Oatmeal_Back.jpg"
    ],
    "Mocha": [
      "https://pub-4b98c1b8d55d4d9597ff5cfac6aa611a.r2.dev/shaka-wear/10M-003_Mocha_Front.jpg",
      "https://pub-4b98c1b8d55d4d9597ff5cfac6aa611a.r2.dev/shaka-wear/10M-003_Mocha_Back.jpg",
      "https://pub-4b98c1b8d55d4d9597ff5cfac6aa611a.r2.dev/shaka-wear/10M-003_Mocha_Model_1.jpg",
      "https://pub-4b98c1b8d55d4d9597ff5cfac6aa611a.r2.dev/shaka-wear/10M-003_Mocha_Model_2.jpg"
    ]
  },
  "shaka-wear-max-heavyweight-oversized-tee": {
    "Black": [
      "https://pub-4b98c1b8d55d4d9597ff5cfac6aa611a.r2.dev/shaka-wear/10M-005_Black_Front.jpg",
      "https://pub-4b98c1b8d55d4d9597ff5cfac6aa611a.r2.dev/shaka-wear/10M-005_Black_Back.jpg",
      "https://pub-4b98c1b8d55d4d9597ff5cfac6aa611a.r2.dev/shaka-wear/10M-005_Black_Model_1.jpg",
      "https://pub-4b98c1b8d55d4d9597ff5cfac6aa611a.r2.dev/shaka-wear/10M-005_Black_Model_2.jpg"
    ],
    "White": [
      "https://pub-4b98c1b8d55d4d9597ff5cfac6aa611a.r2.dev/shaka-wear/10M-005_White_Front.jpg",
      "https://pub-4b98c1b8d55d4d9597ff5cfac6aa611a.r2.dev/shaka-wear/10M-005_White_Back.jpg",
      "https://pub-4b98c1b8d55d4d9597ff5cfac6aa611a.r2.dev/shaka-wear/10M-005_White_Model_1.jpg",
      "https://pub-4b98c1b8d55d4d9597ff5cfac6aa611a.r2.dev/shaka-wear/10M-005_White_Model_2.jpg"
    ],
    "Off-White": [
      "https://pub-4b98c1b8d55d4d9597ff5cfac6aa611a.r2.dev/shaka-wear/10M-005_OffWhite_Front.jpg",
      "https://pub-4b98c1b8d55d4d9597ff5cfac6aa611a.r2.dev/shaka-wear/10M-005_OffWhite_Back.jpg",
      "https://pub-4b98c1b8d55d4d9597ff5cfac6aa611a.r2.dev/shaka-wear/10M-005_OffWhite_Model_1.jpg",
      "https://pub-4b98c1b8d55d4d9597ff5cfac6aa611a.r2.dev/shaka-wear/10M-005_OffWhite_Model_2.jpg"
    ],
    "Slate Blue": [
      "https://pub-4b98c1b8d55d4d9597ff5cfac6aa611a.r2.dev/shaka-wear/10M-005_SlateBlue_Front.jpg",
      "https://pub-4b98c1b8d55d4d9597ff5cfac6aa611a.r2.dev/shaka-wear/10M-005_SlateBlue_Back.jpg",
      "https://pub-4b98c1b8d55d4d9597ff5cfac6aa611a.r2.dev/shaka-wear/10M-005_SlateBlue_Model_1.jpg",
      "https://pub-4b98c1b8d55d4d9597ff5cfac6aa611a.r2.dev/shaka-wear/10M-005_SlateBlue_Model_2.jpg"
    ],
    "Off Black": [
      "https://pub-4b98c1b8d55d4d9597ff5cfac6aa611a.r2.dev/shaka-wear/10M-005_OffBlack_Front.jpg",
      "https://pub-4b98c1b8d55d4d9597ff5cfac6aa611a.r2.dev/shaka-wear/10M-005_OffBlack_Back.jpg",
      "https://pub-4b98c1b8d55d4d9597ff5cfac6aa611a.r2.dev/shaka-wear/10M-005_OffBlack_Model_1.jpg",
      "https://pub-4b98c1b8d55d4d9597ff5cfac6aa611a.r2.dev/shaka-wear/10M-005_OffBlack_Model_2.jpg"
    ],
    "Latte": [
      "https://pub-4b98c1b8d55d4d9597ff5cfac6aa611a.r2.dev/shaka-wear/10M-005_Latte_Front.jpg",
      "https://pub-4b98c1b8d55d4d9597ff5cfac6aa611a.r2.dev/shaka-wear/10M-005_Latte_Back.jpg",
      "https://pub-4b98c1b8d55d4d9597ff5cfac6aa611a.r2.dev/shaka-wear/10M-005_Latte_Model_1.jpg",
      "https://pub-4b98c1b8d55d4d9597ff5cfac6aa611a.r2.dev/shaka-wear/10M-005_Latte_Model_2.jpg"
    ]
  },
  "shaka-wear-max-heavyweight-cropped-tee": {
    "Black": [
      "https://pub-4b98c1b8d55d4d9597ff5cfac6aa611a.r2.dev/shaka-wear/10M-006_Black_Front.jpg",
      "https://pub-4b98c1b8d55d4d9597ff5cfac6aa611a.r2.dev/shaka-wear/10M-006_Black_Back.jpg",
      "https://pub-4b98c1b8d55d4d9597ff5cfac6aa611a.r2.dev/shaka-wear/10M-006_Black_Model_1.jpg",
      "https://pub-4b98c1b8d55d4d9597ff5cfac6aa611a.r2.dev/shaka-wear/10M-006_Black_Model_2.jpg"
    ],
    "White": [
      "https://pub-4b98c1b8d55d4d9597ff5cfac6aa611a.r2.dev/shaka-wear/10M-006_White_Front.jpg",
      "https://pub-4b98c1b8d55d4d9597ff5cfac6aa611a.r2.dev/shaka-wear/10M-006_White_Back.jpg",
      "https://pub-4b98c1b8d55d4d9597ff5cfac6aa611a.r2.dev/shaka-wear/10M-006_White_Model_1.jpg",
      "https://pub-4b98c1b8d55d4d9597ff5cfac6aa611a.r2.dev/shaka-wear/10M-006_White_Model_2.jpg"
    ],
    "Off-White": [
      "https://pub-4b98c1b8d55d4d9597ff5cfac6aa611a.r2.dev/shaka-wear/10M-006_OffWhite_Front.jpg",
      "https://pub-4b98c1b8d55d4d9597ff5cfac6aa611a.r2.dev/shaka-wear/10M-006_OffWhite_Back.jpg",
      "https://pub-4b98c1b8d55d4d9597ff5cfac6aa611a.r2.dev/shaka-wear/10M-006_OffWhite_Model_1.jpg",
      "https://pub-4b98c1b8d55d4d9597ff5cfac6aa611a.r2.dev/shaka-wear/10M-006_OffWhite_Model_2.jpg"
    ]
  },
  "shaka-wear-max-heavyweight-long-sleeve-tee": {
    "Black": [
      "https://pub-4b98c1b8d55d4d9597ff5cfac6aa611a.r2.dev/shaka-wear/10M-104_Black_Front.png",
      "https://pub-4b98c1b8d55d4d9597ff5cfac6aa611a.r2.dev/shaka-wear/10M-104_Black_Back.png",
      "https://pub-4b98c1b8d55d4d9597ff5cfac6aa611a.r2.dev/shaka-wear/10M-104_Black_Model_1.jpg",
      "https://pub-4b98c1b8d55d4d9597ff5cfac6aa611a.r2.dev/shaka-wear/10M-104_Black_Model_2.jpg"
    ],
    "White": [
      "https://pub-4b98c1b8d55d4d9597ff5cfac6aa611a.r2.dev/shaka-wear/10M-104_White_Front.png",
      "https://pub-4b98c1b8d55d4d9597ff5cfac6aa611a.r2.dev/shaka-wear/10M-104_White_Back.png",
      "https://pub-4b98c1b8d55d4d9597ff5cfac6aa611a.r2.dev/shaka-wear/10M-104_White_Model_1.jpg",
      "https://pub-4b98c1b8d55d4d9597ff5cfac6aa611a.r2.dev/shaka-wear/10M-104_White_Model_2.jpg"
    ]
  }
}

export default async function run({ container }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const dryRun = process.env.IMPORT_DRY_RUN === "1"

  let wrote = false
  for (const [handle, colours] of Object.entries(MANIFEST)) {
    const { data } = await query.graph({
      entity: "product",
      fields: ["id", "thumbnail", "images.url"],
      filters: { handle },
    })
    const product = (data ?? [])[0]
    if (!product) {
      logger.warn(`shaka-pe-images: product not found for handle ${handle} — skipped`)
      continue
    }
    const current: string[] = ((product.images ?? []) as any[])
      .map((i) => i?.url)
      .filter(Boolean)
    const desired = Object.values(colours).flat()
    const explicitRemovals = current.filter((u) => {
      try {
        return new URL(u).host === "cdn.shopify.com"
      } catch {
        return false
      }
    })
    const firstColour = Object.values(colours)[0]
    const result = await writeProductImages(container, product.id, desired, {
      thumbnail: firstColour?.[0],
      explicitRemovals,
      dryRun,
      logger,
    })
    wrote = wrote || result.wrote
    logger.info(
      `shaka-pe-images ${handle}${dryRun ? " (dry-run)" : ""}: ${result.before} -> ${result.after} images ` +
        `(+${result.added.length}, -${result.removed.length} shopify, ${result.forceKept.length} kept, ${result.rejected.length} rejected)` +
        (result.abortReason ? ` ABORTED: ${result.abortReason}` : "")
    )
    for (const r of result.rejected) logger.warn(`  rejected ${r.url}: ${r.reason}`)

    // The PDP gallery + customizer read variant metadata.garment_images FIRST
    // (see variant-options.ts) — the seed stamped Shopify URLs there, so the
    // product.images swap alone leaves the storefront on the old images.
    // Rewrite each variant's block from the manifest, keyed by garment_color.
    const { data: variants } = await query.graph({
      entity: "product_variant",
      fields: ["id", "metadata"],
      filters: { product_id: product.id },
    })
    const productModule = container.resolve(Modules.PRODUCT) as any
    let variantUpdates = 0
    for (const variant of variants ?? []) {
      const meta = ((variant as any).metadata ?? {}) as Record<string, unknown>
      const colourName = typeof meta.garment_color === "string" ? meta.garment_color : null
      const urls = colourName ? colours[colourName] : undefined
      if (!urls?.length) continue
      const garment_images = {
        front: urls[0],
        ...(urls[1] ? { back: urls[1] } : {}),
        ...(urls[2] ? { model_image: urls[2] } : {}),
        all: urls,
      }
      if (JSON.stringify(meta.garment_images) === JSON.stringify(garment_images)) continue
      if (!dryRun) {
        // read-modify-write: Medusa metadata updates REPLACE the whole jsonb
        await productModule.updateProductVariants((variant as any).id, {
          metadata: { ...meta, garment_images },
        })
      }
      variantUpdates++
    }
    if (variantUpdates > 0) wrote = wrote || !dryRun
    logger.info(
      `shaka-pe-images ${handle}${dryRun ? " (dry-run)" : ""}: garment_images rewritten on ${variantUpdates}/${(variants ?? []).length} variants`
    )
  }

  if (wrote) {
    const purged = await revalidateStorefrontTags(["products"], logger)
    logger.info(`shaka-pe-images: storefront cache purge ${purged ? "ok" : "skipped/failed"}`)
  }
}
