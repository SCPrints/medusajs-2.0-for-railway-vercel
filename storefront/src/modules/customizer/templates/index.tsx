"use client"

import { addScpLineItemToCartSafe, addScpLineItemsBatchSafe, addToCartSafe, deleteLineItem, getScpCartAggregate, retrieveCart, updateScpDesignInCart } from "@lib/data/cart"
import { createMyDesign, getMyDesign, updateMyDesign } from "@lib/data/designs"
import { getOrderLineCustomizerMetadata } from "@lib/data/orders"
import { getQuoteGroupDesign } from "@lib/data/quote-design"
import CustomizerProductPicker, {
  type CustomizerPickerProduct,
} from "@modules/customizer/components/customizer-product-picker"
import LowResolutionModal from "@modules/customizer/components/low-resolution-modal"
import PoaQuoteModal from "@modules/customizer/components/poa-quote-modal"
import { MAX_AUTO_PRICED_STITCHES } from "@modules/embroidery/lib/pricing"
import { buildCustomizerMetadataBase } from "@modules/customizer/lib/build-metadata"
import {
  DPI_CRITICAL_THRESHOLD,
  assessCanvasDpi,
  effectiveDpiForFabricImage,
  type DpiAssessment,
} from "@modules/customizer/lib/dpi"
import { resolvePdpFlyImageSrc } from "@modules/common/components/fly-to-cart-add-button"
import CanvasStage from "@modules/customizer/components/canvas-stage"
import DesignPreviewPopover from "@modules/customizer/components/design-preview-popover"
import InputPanel from "@modules/customizer/components/input-panel"
import BulkOrderGrid, {
  type BulkCellEntry,
  type BulkPricingEstimate,
} from "@modules/customizer/components/bulk-order-grid"
import PricingPanel from "@modules/customizer/components/pricing-panel"
import { getTierUnitMajorForVariant } from "@lib/util/tier-price"
import SideSelector from "@modules/customizer/components/side-selector"
import { getStoreProductTagValues } from "@lib/util/product-tags"
import {
  extractRenderArtifactUrl,
  normalizePersistedArtifactUrl,
} from "@modules/customizer/lib/artifact-url"
import { resolveGarmentImageUrlForCustomizerRender } from "@modules/customizer/lib/garment-url-for-render"
import { calculatePricing } from "@modules/customizer/lib/pricing"
import { TIER_GROUP_NAME_PREFIX, type Tier } from "@lib/customer-tiers"
import {
  DEFAULT_SCP_PRINT_SIZE_ID,
  SCP_A6_ONLY_SIDES,
  SCP_PRINT_SIZE_OPTIONS,
  SCP_PRINT_UNIT_MATRIX,
  getAllowedScpPrintSizesForSide,
  getDefaultScpPrintSizeForSide,
  resolveScpPrintSizeForSide,
  resolveScpTierIndexForQuantity,
  type ScpPrintSizeId,
} from "@modules/customizer/lib/scp-dtf-print-pricing"
import { getDisplayUnitMinorForVariant } from "@lib/util/get-product-price"
import { sanitizeCustomizerDesignForCart } from "@modules/customizer/lib/sanitize-cart-metadata"
import { uploadCustomerOriginalUnchanged } from "@modules/customizer/lib/upload-customer-original"
import { replaceInlineRasterWithHostedUrls } from "@modules/customizer/lib/inline-raster-to-hosted"
import { rewriteArtworkSrcs, toPublicArtworkUrl } from "@modules/customizer/lib/r2-public-url"
import { extractCartDesigns, filterByKind } from "@lib/util/cart-decorations"
import { sanitizeCartAddError } from "@lib/util/sanitize-cart-error"
import {
  getVariantStockState,
  type VariantStockState,
} from "@modules/products/lib/variant-stock"
import {
  BulkPricingTier,
  CUSTOMIZER_PRINT_NOTES_MAX_LENGTH,
  CustomizerMetadata,
  DecorationMethod,
  EmbroideryConfig,
  GarmentSide,
  PrintSpec,
  ScreenConfig,
  SizeQuantity,
} from "@modules/customizer/lib/types"
import {
  profileAllowedSides,
  profileMethodsForSide,
  profileSizesForSide,
  type PrintMethod,
  type ResolvedPrintProfile,
} from "@modules/customizer/lib/print-profile"
import DecorationMethodPicker from "@modules/customizer/components/decoration-method-picker"
import EmbroiderySideConfig from "@modules/customizer/components/embroidery-side-config"
import ScreenSideConfig from "@modules/customizer/components/screen-side-config"
import {
  SCREEN_MAX_COLOURS,
  SCREEN_MAX_STANDARD_PRINT_CM,
  SCREEN_MIN_QUANTITY,
} from "@modules/customizer/lib/scp-screen-print-pricing"
import {
  estimateScreenColoursFromDataUrl,
  isDarkGarmentColourName,
  type ScreenColourEstimate,
} from "@modules/customizer/lib/estimate-screen-colours"
import {
  canvasPxToApproxCm,
  printSpecsToPricingSpecs,
  snapSizeForBoundingCm,
} from "@modules/customizer/lib/print-spec"
import {
  getSourceWidthPx,
  getSourceHeightPx,
} from "@modules/customizer/lib/fabric-image-source"
import {
  readFileAsText,
  readFileAsDataUrl,
  normalizeRasterDataUrl,
  loadSvgObject,
} from "@modules/customizer/lib/file-upload-utils"
import {
  variantHasConfiguredPrice,
  getSizeOption,
  getNonSizeOptions,
  variantMatchesNonSizeOptions,
  uniqueSizesForVariant,
  variantBySizeForReference,
  uniqueOptionValues,
  findVariantAfterOptionChange,
} from "@modules/customizer/lib/variant-size-resolver"
import OptionSelect from "@modules/products/components/product-actions/option-select"
import { useProductOptionsOptional } from "@modules/products/context/product-options-context"
import { useCustomizeModeOptional } from "@modules/products/context/customize-mode-context"
import { sortApparelSizeLabels } from "@modules/products/lib/apparel-size-order"
import {
  getGarmentImageUrlForPrintSide,
  getVariantOptionValue,
  isBeanieGarmentProduct,
  isColorOptionTitle,
  isHatGarmentProduct,
  isPufferJacketProduct,
  isSleevelessGarmentProduct,
  isLongSleeveGarmentProduct,
} from "@modules/products/lib/variant-options"
import { resolveGarmentSwatchColor } from "@modules/products/lib/garment-swatch-colors"
import { HttpTypes } from "@medusajs/types"
import { useParams, useRouter, useSearchParams } from "next/navigation"
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react"
import { motion } from "framer-motion"
import { trackCustomizerAction, trackCustomizerFunnel } from "@lib/analytics"
import { phCapture } from "@lib/posthog"
import CustomizerGuide from "@modules/customizer/components/customizer-guide"
import * as fabric from "fabric"
import { FabricImage } from "fabric"

const DESIGN_SIDES: GarmentSide[] = ["front", "back", "left_sleeve", "right_sleeve", "printed_tag"]
const MAX_UPLOAD_SIZE = 8 * 1024 * 1024
const PRINT_AREA_INCHES = { width: 12, height: 16 }
const SESSION_UPLOADS_KEY = "customizer_uploads_v1"
/** Ignore sub-pixel drift from Fabric so small moves inside the box don’t show a “clipped” alert. */
const PRINT_AREA_EPS = 1.5
/** Skip clamp until the canvas has a real size (avoids pinning art to a corner when printArea is ~0). */
const MIN_PRINT_AREA_PX = 8
/**
 * Default cap on top-level Fabric objects per side. Each object is one
 * transfer in production, so unlimited additions create orders the print
 * room rejects. Hats are tighter than this (single transfer on the crown);
 * see `MAX_PRINTS_PER_SIDE_HAT`.
 */
const MAX_PRINTS_PER_SIDE = 4
const MAX_PRINTS_PER_SIDE_HAT = 1

/** Initial on-canvas width for uploads when the print area is not sized yet (avoids Fabric Image width/scale bugs). */
const getTargetArtworkWidth = (printAreaWidth: number) => Math.max(120, printAreaWidth * 0.35)

/**
 * Place freshly added artwork to fit within the current print area at the
 * largest representative size — so picking A6 vs A4 vs A3 actually shows the
 * customer what their print will look like at that scale on the garment.
 */
const fitObjectToPrintArea = (
  obj: { scaleToWidth?: (w: number) => void; scaleToHeight?: (h: number) => void; width?: number; height?: number; scaleX?: number; scaleY?: number },
  area: { width: number; height: number }
) => {
  const margin = 0.96 // small breathing room inside the print rectangle
  const targetW = area.width * margin
  const targetH = area.height * margin
  obj.scaleToWidth?.(targetW)
  // Fabric's scaleToWidth uses width only — if the result is taller than the
  // print area, downscale further by height so the image fits inside both.
  const scaledH = (obj.height ?? 0) * (obj.scaleY ?? 1)
  if (scaledH > targetH && obj.scaleToHeight) {
    obj.scaleToHeight(targetH)
  }
}

type CustomizerTemplateProps = {
  defaultGarmentImage: string | null
  defaultGarmentTitle: string | null
  product: HttpTypes.StoreProduct
  /** When true, section is embedded on PDP (section heading, no page-level duplicate chrome). */
  embedded?: boolean
  /** Embedded only: Medusa variant id from ProductActions (colour/size). */
  pdpSyncedVariantId?: string | null
  /** Embedded PDP: gallery + variant pickers slot into one grid with the editor (single page layout). */
  integratedPdpSlots?: {
    gallery: ReactNode
    variantPickers: ReactNode
  }
  /**
   * Assembly-Studio-style full-screen shell (the `/customizer-v2` test): big
   * garment canvas on the left, a fixed-width menu of collapsible sections on
   * the right with a sticky pricing/Add-to-Cart footer. Only changes layout
   * chrome — every piece of functionality is shared with normal embedded mode.
   * Implies `embedded` behaviour (requires `integratedPdpSlots`).
   */
  assemblyLayout?: boolean
  /**
   * Catalog products available in the in-customizer "Change product" picker.
   * Only used by the standalone /customizer route — PDP embeds always know
   * their product up front and never show the picker.
   */
  pickerProducts?: CustomizerPickerProduct[]
  /**
   * Logged-in customer's pricing tier, resolved server-side. When set, the
   * customizer shows a flat tier price ("Your Gold pricing $X.XX/unit") and
   * hides the public quantity ladder. `null` for guests / untiered customers.
   */
  tier?: Tier | null
  /**
   * Explicit print profile resolved server-side from the product
   * (`metadata.print_profile` / `print_config`). When present (feature flag on
   * + product assigned), it drives which sides / methods / sizes the customer
   * can pick. `null` falls back to the legacy title/tag heuristics.
   */
  printProfile?: ResolvedPrintProfile | null
  /**
   * Logged-in customer's email, resolved server-side. Prefills the POA
   * quote-request modal (>12k-stitch embroidery); guests type theirs.
   */
  customerEmail?: string | null
}

// Visual-only dimensions used to scale the dashed print-area guide on the
// canvas. These are tuned against the photographed garment so each size *looks*
// like the print a customer will actually receive — they are NOT the true
// printable dimensions used for pricing or production. The customer-facing
// label dimensions live in `SCP_PRINT_SIZE_OPTIONS` (scp-dtf-print-pricing.ts).
//
// "Oversize" matches the full 68%×72% canvas footprint (≈ a real garment-wide
// print). A3 and A4 are pulled in so the rectangle reads more like a normal
// chest print rather than swallowing the whole tee, otherwise customers expect
// a print larger than what they're paying for. A6 is small enough already.
const SCP_PRINT_SIZE_CM: Record<ScpPrintSizeId, { w: number; h: number }> = {
  up_to_a6: { w: 8, h: 12 },
  up_to_a4: { w: 14, h: 20 },
  up_to_a3: { w: 19, h: 27 },
  oversize: { w: 38, h: 48 },
}
const SCP_BASE_REF = SCP_PRINT_SIZE_CM.oversize

const getPrintArea = (
  width: number,
  height: number,
  printSizeId: ScpPrintSizeId = "oversize"
) => {
  const baseW = width * 0.68
  const baseH = height * 0.72
  const refSize = SCP_PRINT_SIZE_CM[printSizeId] ?? SCP_BASE_REF
  const scaleW = refSize.w / SCP_BASE_REF.w
  const scaleH = refSize.h / SCP_BASE_REF.h
  const areaW = baseW * scaleW
  const areaH = baseH * scaleH
  // Shift smaller print areas down toward the chest line. Oversize keeps the
  // legacy top-anchor at 13%; smaller sizes blend toward 30% so they don't end
  // up sitting on the hood/collar of hoodies and similar garments.
  const sizeRatio = areaH / baseH // 1.0 for oversize, ~0.31 for A6
  const topRatioMin = 0.13
  const topRatioMax = 0.30
  const topRatio = topRatioMin + (topRatioMax - topRatioMin) * (1 - sizeRatio)
  return {
    x: (width - areaW) / 2,
    y: height * topRatio,
    width: areaW,
    height: areaH,
  }
}

/**
 * Inverse of `getPrintArea` — recover the canvas dimensions a saved design was
 * authored on, from the `printArea` + `scpPrintSizeId` stored in its metadata.
 *
 * Why: saved Fabric objects use ABSOLUTE canvas-pixel coordinates, but the
 * customizer's canvas size is the live container size (see `syncSize`). So a
 * design authored on a wide PDP canvas, then rehydrated into a smaller surface
 * (the admin "revised proof" modal, a re-order on a different screen), lands its
 * artwork at stale coordinates — off-position or off-canvas entirely (the
 * garment always looks right because it's re-fit to the canvas every load).
 * Knowing the authoring canvas size lets us rescale objects into the current
 * one on rehydration. Returns null when the inputs are missing/inconsistent so
 * the caller can skip normalization (legacy no-op behaviour).
 *
 * Derivation (from getPrintArea):
 *   areaW = W·0.68·(refW/38)         x = (W − areaW)/2   ⇒  W = 2·x + areaW
 *   areaH = H·0.72·(refH/48)                              ⇒  H = areaH / (0.72·refH/48)
 */
const inferCanvasSizeFromPrintArea = (
  printArea: { x: number; y: number; width: number; height: number } | null | undefined,
  sizeId: ScpPrintSizeId | null | undefined
): { width: number; height: number } | null => {
  if (!printArea || !sizeId) return null
  const ref = SCP_PRINT_SIZE_CM[sizeId]
  if (!ref) return null
  const { x, width: areaW, height: areaH } = printArea
  if (![x, areaW, areaH].every((n) => typeof n === "number" && isFinite(n)) || areaH <= 0) {
    return null
  }
  const width = 2 * x + areaW
  const scaleH = ref.h / SCP_BASE_REF.h
  const height = areaH / (0.72 * scaleH)
  if (!isFinite(width) || !isFinite(height) || width <= 0 || height <= 0) return null
  return { width, height }
}

const productMetadataShowsDtfTierEstimator = (product: HttpTypes.StoreProduct) => {
  const m = product.metadata as Record<string, unknown> | undefined
  return m?.show_dtf_tier_estimator === true
}

const resolveVariantPrice = (
  variant?: HttpTypes.StoreProductVariant,
  product?: HttpTypes.StoreProduct | null
) => {
  const variantRecord = variant as any
  const calculated = variantRecord?.calculated_price?.calculated_amount
  if (typeof calculated === "number") {
    const merged =
      product?.handle != null
        ? {
            ...variantRecord,
            product: {
              ...(variantRecord.product ?? {}),
              handle:
                (typeof variantRecord.product?.handle === "string" &&
                  variantRecord.product.handle) ||
                product.handle,
            },
          }
        : variantRecord
    return getDisplayUnitMinorForVariant(merged)
  }

  const amount = variantRecord?.prices?.find((price: any) => typeof price?.amount === "number")?.amount
  if (typeof amount === "number") {
    return amount
  }

  return 0
}

const toFiniteNumber = (value: unknown) => {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value
  }
  if (typeof value === "string") {
    const parsed = Number.parseInt(value, 10)
    if (Number.isFinite(parsed)) {
      return parsed
    }
  }
  return null
}

const resolveVariantBulkPricingTiers = (
  variant?: HttpTypes.StoreProductVariant
): BulkPricingTier[] => {
  const metadata = (variant?.metadata ?? {}) as Record<string, unknown>
  const bulkPricing = metadata.bulk_pricing as
    | {
        tiers?: Array<Record<string, unknown>>
      }
    | undefined

  if (!Array.isArray(bulkPricing?.tiers)) {
    return []
  }

  return bulkPricing.tiers
    .map((tier): BulkPricingTier | null => {
      const minQuantity = toFiniteNumber(tier.min_quantity)
      const maxQuantity = toFiniteNumber(tier.max_quantity)
      const amountCents = toFiniteNumber(tier.amount)
      if (minQuantity === null || amountCents === null) {
        return null
      }
      return {
        minQuantity,
        maxQuantity: maxQuantity ?? undefined,
        amountCents,
      }
    })
    .filter((tier): tier is BulkPricingTier => tier !== null)
    .sort((a, b) => a.minQuantity - b.minQuantity)
}

const getObjectId = (object: any) => {
  if (!object.customizerId) {
    object.customizerId = `obj_${Math.random().toString(36).slice(2, 10)}`
  }

  return object.customizerId as string
}

type SessionUploadAsset = {
  id: string
  name: string
  type: string
  dataUrl: string
  /** Hosted copy of the exact bytes the customer uploaded (MinIO/S3); optional if storage failed. */
  originalStorageUrl?: string
}

const ExpandCollapsePlus = () => (
  <span className="relative h-5 w-5">
    <span className="absolute inset-y-[31.75%] left-[48%] right-1/2 w-[1.5px] rounded-full bg-ui-fg-subtle transition-all duration-300 group-open:rotate-90" />
    <span className="absolute inset-x-[31.75%] bottom-1/2 top-[48%] h-[1.5px] rounded-full bg-ui-fg-subtle transition-all duration-300 group-open:left-1/2 group-open:right-1/2 group-open:rotate-90" />
  </span>
)

function HelpTip({ text }: { text: string }) {
  const [open, setOpen] = useState(false)
  return (
    <span className="relative inline-flex shrink-0">
      <button
        type="button"
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onClick={() => setOpen((o) => !o)}
        onBlur={() => setOpen(false)}
        className="flex h-6 w-6 items-center justify-center rounded-full bg-[var(--brand-secondary,#0ea5b7)] text-sm font-bold text-white shadow-sm transition hover:brightness-110 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-secondary,#0ea5b7)] focus-visible:ring-offset-2"
        aria-label="Help"
      >
        ?
      </button>
      {open && (
        <span
          role="tooltip"
          className="absolute left-5 top-0 z-50 w-60 rounded-lg border border-ui-border-base bg-ui-bg-base p-3 text-xs leading-relaxed text-ui-fg-base shadow-lg"
        >
          {text}
        </span>
      )}
    </span>
  )
}

export default function CustomizerTemplate({
  defaultGarmentImage,
  defaultGarmentTitle,
  product,
  embedded = false,
  pdpSyncedVariantId = null,
  integratedPdpSlots,
  assemblyLayout = false,
  pickerProducts,
  tier = null,
  printProfile = null,
  customerEmail = null,
}: CustomizerTemplateProps) {
  const params = useParams()
  const router = useRouter()
  const countryCode = String(params?.countryCode ?? "")
  const fabricCanvasRef = useRef<any>(null)
  /** Host div only — canvas is created imperatively so Fabric can replace/wrap it without breaking React siblings (garment img). */
  const fabricContainerRef = useRef<HTMLDivElement | null>(null)
  const htmlCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const step1Ref = useRef<HTMLDivElement | null>(null)
  const step2Ref = useRef<HTMLDivElement | null>(null)
  const step3Ref = useRef<HTMLDivElement | null>(null)
  const step4Ref = useRef<HTMLDivElement | null>(null)

  /**
   * Resolver for EmbroiderySideConfig — returns a data URL of the artwork
   * currently placed on the canvas for the active side. Preference order:
   * 1) selected (active) object → just its bounds (best for multi-object sides)
   * 2) first top-level object on the canvas
   * Returns null when no artwork has been placed yet.
   */
  const getCurrentSideArtworkDataUrl = (): { dataUrl: string; mediaType: string } | null => {
    const canvas = fabricCanvasRef.current
    if (!canvas || typeof canvas.toDataURL !== "function") return null
    try {
      const active = canvas.getActiveObject?.()
      const target = active ?? canvas.getObjects?.()?.[0]
      if (!target) return null
      // Use the target object's bounding rect as the dataURL crop. Fabric's
      // toDataURL accepts left/top/width/height to clip to a specific region.
      const rect = target.getBoundingRect?.(true, true)
      if (!rect || rect.width <= 0 || rect.height <= 0) {
        // Fallback: whole-canvas screenshot if bounds are unavailable.
        const dataUrl = canvas.toDataURL({ format: "png", multiplier: 1 }) as string
        return dataUrl ? { dataUrl, mediaType: "image/png" } : null
      }
      const dataUrl = canvas.toDataURL({
        format: "png",
        multiplier: 1,
        left: rect.left,
        top: rect.top,
        width: rect.width,
        height: rect.height,
      }) as string
      return dataUrl ? { dataUrl, mediaType: "image/png" } : null
    } catch {
      return null
    }
  }

  /**
   * Whole-canvas variant of the resolver above — screen colour analysis needs
   * EVERY object on the side (all of them print with the same screens), not
   * just the active/first one. The Fabric canvas is transparent-backed (the
   * garment photo is a sibling <img>), so this captures artwork only.
   */
  const getCurrentSideFullArtworkDataUrl = (): { dataUrl: string; mediaType: string } | null => {
    const canvas = fabricCanvasRef.current
    if (!canvas || typeof canvas.toDataURL !== "function") return null
    try {
      if (!canvas.getObjects?.()?.length) return null
      const dataUrl = canvas.toDataURL({ format: "png", multiplier: 1 }) as string
      return dataUrl ? { dataUrl, mediaType: "image/png" } : null
    } catch {
      return null
    }
  }

  useLayoutEffect(() => {
    const host = fabricContainerRef.current
    if (!host) {
      return
    }
    const el = document.createElement("canvas")
    el.className = "absolute inset-0 h-full w-full touch-none"
    el.setAttribute("data-customizer-fabric", "lower")
    host.appendChild(el)
    htmlCanvasRef.current = el
    return () => {
      host.replaceChildren()
      htmlCanvasRef.current = null
    }
  }, [])
  const sideLayoutsRef = useRef<Record<GarmentSide, Record<string, unknown>[]>>({
    front: [],
    back: [],
    left_sleeve: [],
    right_sleeve: [],
    printed_tag: [],
    bottle_label: [],
    bottle_back_label: [],
  })
  /**
   * Per-object manual size override. Keyed by `customizerId`. When set the
   * auto-snap leaves that object alone — the customer has explicitly
   * chosen a size and we shouldn't yank it back when they nudge the box.
   */
  const manualSizeOverridesRef = useRef<Map<string, ScpPrintSizeId>>(new Map())
  /**
   * Most-recent upload signature, used to dedupe the iOS Safari double-fire
   * of `<input type="file">` change events. See the guard inside
   * `handleUploadFile` for the 1500ms reuse window.
   */
  const lastUploadSignatureRef = useRef<{ sig: string; at: number } | null>(null)

  const [canvasSize, setCanvasSize] = useState({ width: 0, height: 0 })
  const [currentSide, setCurrentSide] = useState<GarmentSide>("front")
  /** Fabric listeners are registered once; read the latest side when persisting so we don’t always write to `front`. */
  const currentSideRef = useRef<GarmentSide>(currentSide)
  currentSideRef.current = currentSide
  /** Avoid persisting while clearing/loading the canvas — `clear()` emits removals that would wipe the wrong side. */
  const suppressFabricPersistenceRef = useRef(false)
  const [layers, setLayers] = useState<
    Array<{ id: string; label: string; visible: boolean; locked: boolean; type?: string }>
  >([])
  const [selectedLayerId, setSelectedLayerId] = useState<string | null>(null)
  // Snapshot of the active text layer's editable attributes, so the
  // InputPanel can swap into edit mode when the customer selects an
  // existing text on the canvas. Null when the active object isn't a
  // text layer (or nothing is selected).
  const [selectedTextSnapshot, setSelectedTextSnapshot] = useState<
    { id: string; text: string; color: string; fontFamily: string; letterSpacing: number } | null
  >(null)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [outOfBoundsWarning, setOutOfBoundsWarning] = useState<string | null>(null)
  const [dpiWarning, setDpiWarning] = useState<string | null>(null)
  const [dpiAssessment, setDpiAssessment] = useState<DpiAssessment>({
    worstDpi: null,
    severity: "ok",
    imagesEvaluated: 0,
    imagesBelowCritical: 0,
  })
  const [lowResModalOpen, setLowResModalOpen] = useState(false)
  /** Once the customer dismisses the modal we don't keep re-opening it on every scale event. */
  const lowResModalDismissedRef = useRef(false)
  /** Funnel guard — fire `customizer_design_started` once per page load. */
  const designStartedFiredRef = useRef(false)
  const [vectorizationRequested, setVectorizationRequested] = useState(false)
  const [isRemovingVectorization, setIsRemovingVectorization] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isSavingDesign, setIsSavingDesign] = useState(false)
  const [statusMessage, setStatusMessage] = useState<string | null>(null)
  const [printNotes, setPrintNotes] = useState("")
  // Seed from `?variant=` (e.g. when returning from cart) so the previously
  // chosen colour/size is reselected; falls back to the first variant.
  const initialVariantSearchParams = useSearchParams()
  const initialVariantIdFromUrl = initialVariantSearchParams?.get("variant") ?? null
  const [activeVariantId, setActiveVariantId] = useState<string>(() => {
    if (initialVariantIdFromUrl && product.variants?.some((v) => v.id === initialVariantIdFromUrl)) {
      return initialVariantIdFromUrl
    }
    return product.variants?.[0]?.id ?? ""
  })
  const [sizeMatrix, setSizeMatrix] = useState<SizeQuantity[]>([])
  // Bulk-order grid mode. When true, the wizard hides and a full-width
  // colour × size matrix takes over. Add-to-cart from that surface routes
  // through `addCustomizedToCart(bulkCells)` so the same rendering /
  // metadata pipeline produces one line per (colour, size) cell.
  const [bulkMode, setBulkMode] = useState(false)
  const [sessionUploads, setSessionUploads] = useState<SessionUploadAsset[]>([])
  // Designs the customer has already attached to other cart items (typically
  // via the bundle wizard). Loaded once on mount; populates the InputPanel's
  // "From your cart" section so they can drop an existing artwork into the
  // canvas without re-uploading. Populated only when there's something to show.
  const [cartArtworkDesigns, setCartArtworkDesigns] = useState<
    Array<{ id: string; name: string; url: string }>
  >([])
  // Cross-cart bulk-tier aggregation projection. When the customer already
  // has eligible items in their cart, this number drives the green tier
  // highlight in <PricingPanel/> so they see "you're heading into the 50-99
  // tier with this design + your cart" instead of just this product's local
  // quantity. Null until the first fetch resolves; passing `undefined` to
  // PricingPanel disables the projection.
  const [aggregatedCartQuantity, setAggregatedCartQuantity] = useState<number | undefined>(undefined)
  const [layoutVersion, setLayoutVersion] = useState(0)
  // Print size is stored PER SIDE so each location keeps its own size — picking
  // A3 on the Front no longer reshapes the Back when you switch to it.
  // `scpPrintSizeId` resolves to the current side's size; `setScpPrintSizeId`
  // writes to whichever side is active at call time (via currentSideRef, so it's
  // correct even mid side-switch). Pricing is driven by per-object printSpecs,
  // so this only affects the live frame + the selected-size UI, never the price.
  const [scpPrintSizeBySide, setScpPrintSizeBySide] = useState<
    Partial<Record<GarmentSide, ScpPrintSizeId>>
  >({})
  const scpPrintSizeId = scpPrintSizeBySide[currentSide] ?? DEFAULT_SCP_PRINT_SIZE_ID
  const setScpPrintSizeId = useCallback((id: ScpPrintSizeId) => {
    setScpPrintSizeBySide((prev) => ({ ...prev, [currentSideRef.current]: id }))
  }, [])
  // Tracks whether the customer has actively chosen a size in the picker.
  // Pricing still uses `scpPrintSizeId` (defaulted to A6) so totals work pre-
  // selection, but the tile UI doesn't highlight anything until this flips
  // true. Re-hydration / re-edit flows set it via the same setter as the
  // size, so prior selections appear pre-selected on return.
  const [scpPrintSizeChosen, setScpPrintSizeChosen] = useState(false)
  // Guided PDP wizard: tracks the highest step the user has reached (1..4).
  // Steps below `pdpStep` collapse to summary chips with a "Change" link.
  const [pdpStep, setPdpStep] = useState<1 | 2 | 3 | 4>(1)
  // Assembly studio: sections are freely navigable, so Step 1 is never a
  // gate — start it "done" so the Artwork/InputPanel and other features
  // aren't locked behind a "Customise this garment" click (that button is
  // removed in the studio). Legacy non-assembly wizard still starts false.
  // Admin proof mode is known at first render from the URL (`adminProof=
  // <orderId>:<lineItemId>:<side>`). The variant is fixed by `?variant=`, so
  // wizard Step 1 (colour/variant) is already settled — seed pdpStep1Done=true
  // so the editor (InputPanel / add text / replace artwork) is enabled
  // immediately and the Step 2/3 auto-advance effects don't early-return.
  // (`isAdminProofMode` is computed later, so parse the param inline here.)
  const proofModeAtInit =
    (initialVariantSearchParams?.get("adminProof") ?? "").split(":").filter(Boolean)
      .length === 3
  const [pdpStep1Done, setPdpStep1Done] = useState(assemblyLayout || proofModeAtInit)
  const [pdpStep2Done, setPdpStep2Done] = useState(false)
  // Assembly layout (/customizer-v2) free accordion: which section is expanded,
  // independent of the wizard's `pdpStep`. null = all collapsed. Only consulted
  // when `assemblyLayout` is true.
  const [assemblyExpanded, setAssemblyExpanded] = useState<1 | 2 | 3 | 4 | null>(1)
  // Assembly layout: the "Artwork" section (InputPanel) is a peer accordion
  // section. Tracked separately from the numeric wizard steps; the two are
  // kept mutually-exclusive (opening one closes the other) so the menu stays
  // one-section-at-a-time like Assembly.
  const [assemblyArtworkOpen, setAssemblyArtworkOpen] = useState(false)
  const [showGuidePulse, setShowGuidePulse] = useState(false)
  // Record<GarmentSide, true> avoids Set spread which requires es2015+ target.
  const [sizingDoneSides, setSizingDoneSides] = useState<Partial<Record<GarmentSide, true>>>({})
  // pdpStep3Done: true once at least one side is sized — gates the upload panel
  const pdpStep3Done = Object.keys(sizingDoneSides).length > 0
  // currentSideSized: true when the active side has a confirmed size — collapses Step 3
  const currentSideSized = !!sizingDoneSides[currentSide]
  /**
   * Per-side decoration method (print | embroidery). Missing entries default
   * to "print" via getSideDecorationMethod() at read time. Stored as
   * Partial<Record> so only customer-touched sides take up metadata payload.
   * v3 schema field — see CustomizerMetadata.sideDecorationMethods.
   */
  const [sideDecorationMethods, setSideDecorationMethods] = useState<
    Partial<Record<GarmentSide, DecorationMethod>>
  >({})
  /**
   * Per-side embroidery config (mm dimensions + stitch count). Only populated
   * for sides whose method is "embroidery". v3 schema field — see
   * CustomizerMetadata.sideEmbroideryConfigs.
   */
  const [sideEmbroideryConfigs, setSideEmbroideryConfigs] = useState<
    Partial<Record<GarmentSide, EmbroideryConfig>>
  >({})
  /**
   * Per-side screen-print config (colour count + dark-garment flag). Only
   * populated for sides whose method is "screen". v3 schema field — see
   * CustomizerMetadata.sideScreenConfigs.
   */
  const [sideScreenConfigs, setSideScreenConfigs] = useState<
    Partial<Record<GarmentSide, ScreenConfig>>
  >({})
  /**
   * Deterministic artwork colour estimate per screen-printed side. Recomputed
   * whenever the side's artwork changes; advisory input to the colour-count
   * default + the add-to-cart mismatch check.
   */
  const [sideScreenEstimates, setSideScreenEstimates] = useState<
    Partial<Record<GarmentSide, ScreenColourEstimate>>
  >({})
  /** Oversize notice for screen sides (artwork bigger than the 40×40cm standard area). */
  const [screenSizeWarning, setScreenSizeWarning] = useState<string | null>(null)
  // showSideNudge: brief banner when switching to an empty side in embedded mode
  const [showSideNudge, setShowSideNudge] = useState(false)
  // "Edit existing cart line" mode: when present, the customizer pre-fills from
  // the line metadata and "Add to cart" replaces (add new + delete old).
  const editLineItemIdFromUrl = initialVariantSearchParams?.get("edit") ?? null
  // Phase 2 design-group edit: when the customer clicks "Edit design" on a
  // grouped cart row, we land here with `?edit_group=<id>`. The customizer
  // opens directly into the bulk grid pre-populated with the existing
  // cells so the customer can edit the design AND add/remove colours/sizes
  // in one place.
  const editGroupIdFromUrl =
    initialVariantSearchParams?.get("edit_group") ?? null
  const [editGroupId, setEditGroupId] = useState<string | null>(
    editGroupIdFromUrl
  )
  const [editGroupHydrated, setEditGroupHydrated] = useState(false)
  // Cells the customer is currently editing in this group. Seeded from
  // the cart siblings on rehydration; mutated by the inline variant
  // list (qty stepper, +/- variants). On Save the customer's CURRENT
  // working state is fanned out, every editGroupLineIds row is
  // deleted, new rows are added per cell.
  const [editGroupCells, setEditGroupCells] = useState<
    Array<{
      variant: HttpTypes.StoreProductVariant
      size: string
      quantity: number
    }>
  >([])
  // Read-only snapshot of the cells as they were on rehydration. Used
  // by the bulk grid pre-fill, kept in sync with editGroupCells so the
  // grid stays consistent with the inline list.
  const [editGroupInitialCells, setEditGroupInitialCells] = useState<
    Array<{
      variant: HttpTypes.StoreProductVariant
      size: string
      quantity: number
    }>
  >([])
  const [editGroupLineIds, setEditGroupLineIds] = useState<string[]>([])
  // Read-only line summary for the edit-mode panel. Built from the cart's
  // own line data (variant_title, product_title, quantity) so the panel can
  // render even if `product.variants` doesn't include the cart's variants
  // (e.g. a variant was retired after the cart was created). Keeps the
  // edit-design flow strictly about artwork — no variant lookup required.
  const [editGroupLineSummary, setEditGroupLineSummary] = useState<
    Array<{
      lineId: string
      productTitle: string | null
      variantTitle: string | null
      quantity: number
    }>
  >([])
  // Set by stage-2 hydration when a side's metadata contains a
  // sanitized "[omitted-image-data]" placeholder — happens when the
  // original upload wasn't archived to MinIO/R2. Surfaces a visible
  // banner so the customer can re-upload instead of staring at a
  // blank side wondering what happened.
  const [hydrationPlaceholderSides, setHydrationPlaceholderSides] = useState<
    string[]
  >([])
  const [editLineItemId, setEditLineItemId] = useState<string | null>(editLineItemIdFromUrl)

  // URL → state sync for `?edit_group=<id>`. `useState(initialValue)` runs
  // its initialiser on the server during SSR/prerender, when `useSearchParams`
  // can still return an empty params object. The Cache Components prerender
  // for `[countryCode]/products/[handle]` hits exactly that path — so on a
  // server-rendered page the customer can land with `?edit_group=<id>` on the
  // URL while the customizer's local state captures `null` and never recovers,
  // leaving the wizard stuck in fresh-add mode (no hydration, no gated UI,
  // empty canvas). Reconcile after mount so the edit-from-cart flow
  // recognises itself even when the initial state was captured pre-hydration.
  //
  // Gated on `editGroupHydrated`, NOT on the current `editGroupId` value.
  // Reason: `dropEditGroupParam` and `Cancel` clear state with
  // `setEditGroupId(null)` and also wipe the URL via
  // `window.history.replaceState`. But `replaceState` does NOT update Next.js's
  // `useSearchParams` — so after the drop, the URL bar is clean but
  // `searchParams.get("edit_group")` still returns the old id. Without the
  // hydrated gate, the sync would immediately re-set state from the stale
  // snapshot, undoing the drop and pinning the wizard into edit mode forever.
  // Hydrated → sync stops; explicit clear stays cleared.
  useEffect(() => {
    if (!editGroupHydrated && editGroupIdFromUrl && !editGroupId) {
      setEditGroupId(editGroupIdFromUrl)
    }
  }, [editGroupIdFromUrl, editGroupId, editGroupHydrated])

  // Rehydration mode: `?design=<id>` (saved-design re-edit) or
  // `?reorder=<order_id>:<line_item_id>` (re-order from order history). Both
  // resolve to a CustomizerMetadata that we replay onto the canvas + state.
  const designIdFromUrl = initialVariantSearchParams?.get("design") ?? null
  const reorderRefFromUrl = initialVariantSearchParams?.get("reorder") ?? null

  // POS mode: customizer launched in a popup from the admin POS page
  // (/app/pos). The "Add to cart" button POSTs the rendered metadata
  // back to /api/pos-bridge/items keyed by the session id, then closes
  // the popup. No real cart line is created — the POS page composes
  // them into a draft order at checkout time.
  const posSessionIdFromUrl =
    initialVariantSearchParams?.get("pos_session") ?? null
  const isPOSMode = Boolean(posSessionIdFromUrl)

  // Quote mode: customizer launched in a popup from the admin Quotes page
  // (/app/quotes → "Design in Studio"). The add-to-cart button POSTs the
  // rendered design back to /api/quote-bridge/items, keyed by the quote id +
  // signed `qsig`, then closes the popup. No real cart line is created — the
  // design lines attach to the quote and only become cart lines if/when the
  // customer accepts the quote. `group` ties a multi-size design together so
  // re-editing replaces it. Mirrors POS mode.
  const quoteIdFromUrl = initialVariantSearchParams?.get("quote_id") ?? null
  const quoteSigFromUrl = initialVariantSearchParams?.get("qsig") ?? null
  const quoteGroupFromUrl = initialVariantSearchParams?.get("group") ?? null
  const isQuoteMode = Boolean(quoteIdFromUrl && quoteSigFromUrl)

  // POA auto-quote: embroidery over the auto-priced stitch cap can't be added
  // to cart. The add-to-cart gate opens a quote-request modal; on submit the
  // flow re-runs and diverts the finished design to /api/quote-bridge/poa
  // (creating a quote in the staff Kanban) instead of the cart routes.
  const [poaModalOpen, setPoaModalOpen] = useState(false)
  const poaContactRef = useRef<{
    email: string
    name?: string
    note?: string
  } | null>(null)
  const poaPendingCellsRef = useRef<Array<{
    variant: HttpTypes.StoreProductVariant
    size: string
    quantity: number
    mockupDataUrl?: string
  }> | null>(null)
  const [pendingHydration, setPendingHydration] = useState<CustomizerMetadata | null>(null)
  const [hydrationApplied, setHydrationApplied] = useState(false)
  const [editingHydrated, setEditingHydrated] = useState(false)

  // URL → state sync for `?edit=<lineItemId>`. Same SSR-prerender root cause
  // as the edit-group sync above (`useSearchParams` returns null during static
  // prerender, useState captures null forever). Same hydrated-gate reasoning:
  // once the edit-line hydration runs (success or failure) we leave the
  // explicit `setEditLineItemId(null)` calls alone.
  useEffect(() => {
    if (!editingHydrated && editLineItemIdFromUrl && !editLineItemId) {
      setEditLineItemId(editLineItemIdFromUrl)
    }
  }, [editLineItemIdFromUrl, editLineItemId, editingHydrated])

  const [editingProductTitle, setEditingProductTitle] = useState<string | null>(null)
  const [editingPreviousSides, setEditingPreviousSides] = useState<GarmentSide[]>([])
  const [editingPreviousQty, setEditingPreviousQty] = useState<number>(0)
  // When the edited line is part of a design-group, this tracks the
  // number of sibling lines that will be updated together by the
  // fan-out logic in addCustomizedToCart. Surfaces in the edit banner
  // so the customer isn't surprised.
  const [editingGroupSiblingCount, setEditingGroupSiblingCount] = useState<number>(0)
  const [editingGroupTotalQty, setEditingGroupTotalQty] = useState<number>(0)
  const lastCustomizerProductIdRef = useRef<string | null>(null)
  const sideLoadVersionRef = useRef(0)
  const productOptionsFromPdp = useProductOptionsOptional()

  // Admin proof mode: `?adminProof=<orderId>:<lineItemId>:<side>` + `?proofArtwork=<encodedUrl>`
  // Opens the customiser in a stripped-down mode for staff to reposition artwork,
  // then save back to the order via window.parent.postMessage.
  const adminProofParam = initialVariantSearchParams?.get("adminProof") ?? null
  const proofArtworkParam = initialVariantSearchParams?.get("proofArtwork") ?? null
  const [adminProofOrderId, adminProofLineItemId, adminProofSide] = (() => {
    if (!adminProofParam) return [null, null, null]
    const parts = adminProofParam.split(":")
    return [parts[0] || null, parts[1] || null, parts[2] || null]
  })()
  const isAdminProofMode =
    !!adminProofOrderId && !!adminProofLineItemId && !!adminProofSide
  const adminProofAppliedRef = useRef(false)
  // True once we've finished trying to load the order line's saved design (so
  // the flat-image fallback knows the saved-layout path has had its chance).
  const [adminProofMetaResolved, setAdminProofMetaResolved] = useState(false)
  const [adminProofSaving, setAdminProofSaving] = useState(false)
  const [adminProofError, setAdminProofError] = useState<string | null>(null)

  // (productIsLongSleeve / allowedSizesForCurrentSide are computed below,
  // after `selectedProduct` is in scope — they were moved to fix a
  // temporal-dead-zone "Cannot access … before initialization" error.)

  // Per-side effective print size (sleeves & printed tag are forced to A6 in
  // pricing, so the visible print area mirrors that constraint too).
  // SCREEN sides are not DTF-size-tiered — pricing is per colour, and the
  // supplier's standard area (40×40cm) is close to the full footprint — so
  // unlock the full "oversize" area instead of inheriting the DTF tile
  // (which defaults to A6 and would lock artwork small).
  const effectivePrintSizeIdForArea = (
    sideDecorationMethods[currentSide] === "screen"
      ? "oversize"
      : resolveScpPrintSizeForSide(currentSide, scpPrintSizeId)
  ) as ScpPrintSizeId
  const printArea = useMemo(
    () =>
      getPrintArea(canvasSize.width, canvasSize.height, effectivePrintSizeIdForArea),
    [canvasSize.height, canvasSize.width, effectivePrintSizeIdForArea]
  )
  // Refs so the (one-time-bound) Fabric event handlers always read the current
  // print area + effective size when clamping.
  const printAreaRef = useRef(printArea)
  const effectivePrintSizeIdRef = useRef<ScpPrintSizeId>(effectivePrintSizeIdForArea)
  useEffect(() => {
    printAreaRef.current = printArea
  }, [printArea])
  useEffect(() => {
    effectivePrintSizeIdRef.current = effectivePrintSizeIdForArea
  }, [effectivePrintSizeIdForArea])
  // Briefly pulse the "Need help?" trigger on first load to draw attention
  useEffect(() => {
    if (!embedded || pdpStep1Done || pdpStep > 1) return
    setShowGuidePulse(true)
    const t = setTimeout(() => setShowGuidePulse(false), 4000)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Auto-advance Step 1 → Step 2 when the customer reached the Customise
  // tab by clicking the rose "Customise this garment" CTA on the Photos
  // panel. Without this, the wizard's own Step 1 surface re-renders the
  // same colour pickers + rose CTA the customer just clicked — they'd
  // have to press it a second time to actually open Print Location. The
  // PdpSplitTabs CTA sets a one-shot sessionStorage flag; we consume it
  // here on mount and clear it. Tab-click navigation does NOT set the
  // flag, so jumping to the Customise tab directly still shows Step 1.
  useEffect(() => {
    if (!embedded) return
    if (typeof window === "undefined") return
    try {
      if (window.sessionStorage.getItem("sc:pdp-photos-cta-fired") !== "1") return
      window.sessionStorage.removeItem("sc:pdp-photos-cta-fired")
    } catch {
      return
    }
    setPdpStep1Done(true)
    setPdpStep((s) => (s > 1 ? s : 2))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Load any artwork the customer has already attached to other cart items
  // (e.g. via the bundle wizard) so the InputPanel can offer a one-click
  // "reuse this design here too" option. Runs once on mount; we don't
  // re-fetch on cart mutations because the customer is actively building
  // a design — surprising them with new tiles mid-edit would be jarring.
  useEffect(() => {
    let cancelled = false
    void retrieveCart().then((cart) => {
      if (cancelled || !cart) return
      const designs = filterByKind(extractCartDesigns(cart), ["artwork"])
      const tiles = designs
        .filter((d) => d.artworkUrl)
        .map((d, i) => ({
          id: d.lineItemId || `cart-design-${i}`,
          name: d.bundleTitle ?? d.productTitle,
          url: d.artworkUrl as string,
        }))
      if (tiles.length > 0) setCartArtworkDesigns(tiles)
    })
    return () => {
      cancelled = true
    }
  }, [])

  // When the effective print size shrinks (or the customer picks a smaller
  // size after placing artwork), enforce the new max scale on every existing
  // object so artwork can't stay larger than the print area allows.
  useEffect(() => {
    if (effectivePrintSizeIdForArea === "oversize") {
      return
    }
    const canvas = fabricCanvasRef.current
    const pr = printArea
    if (!canvas || pr.width < MIN_PRINT_AREA_PX || pr.height < MIN_PRINT_AREA_PX) {
      return
    }
    const objects = canvas.getObjects?.() ?? []
    let mutated = false
    for (const obj of objects) {
      const baseW = Math.max(1, (obj as any).width ?? 0)
      const baseH = Math.max(1, (obj as any).height ?? 0)
      const maxScaleX = pr.width / baseW
      const maxScaleY = pr.height / baseH
      const maxScale = Math.min(maxScaleX, maxScaleY)
      const sx = Math.abs((obj as any).scaleX ?? 1)
      const sy = Math.abs((obj as any).scaleY ?? 1)
      if (Math.max(sx, sy) > maxScale && Number.isFinite(maxScale) && maxScale > 0) {
        const sign = (v: number) => (v < 0 ? -1 : 1)
        ;(obj as any).set({
          scaleX: maxScale * sign((obj as any).scaleX ?? 1),
          scaleY: maxScale * sign((obj as any).scaleY ?? 1),
        })
        ;(obj as any).setCoords?.()
        mutated = true
      }
      // Also nudge back inside the new (potentially shifted) print rectangle.
      clampObjectToBounds(obj)
    }
    if (mutated) {
      canvas.requestRenderAll?.()
      saveCurrentSide?.()
    }
  }, [effectivePrintSizeIdForArea, printArea.width, printArea.height])
  const selectedProduct = product
  // Long-sleeve garments accept up to A3 on sleeves; short-sleeve garments stay
  // A6-only. Used to gate the print-size tile picker and to clamp the global
  // scpPrintSizeId when the user switches to a side with stricter limits.
  const productIsLongSleeve = useMemo(
    () => isLongSleeveGarmentProduct(selectedProduct),
    [selectedProduct]
  )
  /**
   * Hats / caps lock every print location to A6 (curved-crown garments
   * can't reliably take a larger transfer). The picker collapses to a
   * single A6 option and `printSpecs` clamps any stale override down.
   */
  const productIsHat = useMemo(
    () => isHatGarmentProduct(selectedProduct),
    [selectedProduct]
  )
  /**
   * Beanies are embroidery-only — the knit fabric can't take heat-press
   * DTF prints. When true the DecorationMethodPicker is restricted to
   * the embroidery option and every side defaults to embroidery on mount.
   */
  const productIsBeanie = useMemo(
    () => isBeanieGarmentProduct(selectedProduct),
    [selectedProduct]
  )
  const productIsPuffer = useMemo(
    () => isPufferJacketProduct(selectedProduct),
    [selectedProduct]
  )
  const productIsSleeveless = useMemo(
    () => isSleevelessGarmentProduct(selectedProduct),
    [selectedProduct]
  )
  /**
   * Staff-controlled per-product flag (admin product print-profile widget,
   * metadata.screen_heavy): hoodies/sweats/fleece/poly cost +$1/print on
   * SCREEN sides only — mirrors the supplier's heavy-garment surcharge.
   */
  const screenHeavyGarment = useMemo(
    () => (selectedProduct?.metadata as Record<string, unknown> | undefined)?.screen_heavy === true,
    [selectedProduct]
  )
  /**
   * Sides the customer can print on for this product. Hats: front only —
   * the curved crown is the single realistic transfer location. Bottom-
   * half garments and accessories (pants, totes, bags, beanies, aprons,
   * towels): front + back. Everything else (tees, hoodies, longsleeves):
   * full set. Hoisted to the component body so both the embedded PDP
   * picker and the standalone /customizer rail share the same gate.
   */
  const allowedPrintSides = useMemo<GarmentSide[]>(() => {
    // Explicit print profile (admin-managed) wins over the legacy inference.
    if (printProfile) {
      const fromProfile = profileAllowedSides(printProfile)
      if (fromProfile.length) return fromProfile
    }
    if (productIsHat) return ["front"]
    if (productIsSleeveless) return ["front", "back", "printed_tag"]
    const productTags = getStoreProductTagValues(selectedProduct).map((t) => t.toLowerCase())
    const productTitleLower = (selectedProduct.title ?? "").toLowerCase()
    const isFrontBackOnlyProduct =
      productTags.some((t) =>
        // `shorts?(?!\s*sleeve)` so the canonical "Short Sleeve" tag isn't
        // mistaken for the garment "shorts" (which used to cap short-sleeve
        // tees at front+back). The print-profile path supersedes this whole
        // heuristic once PRINT_PROFILES_ENABLED is on + the product is backfilled.
        /\b(pants?|shorts?(?!\s*sleeve)|trousers?|jeans?|leggings?|skirts?|tote|totes|bags?|backpacks?|pouch|pouches|cap|caps|hat|hats|beanie|beanies|apron|aprons|towel|towels)\b/.test(
          t
        )
      ) ||
      /\b(tote|bag|backpack|pouch|cap|hat|beanie|apron|towel)\b/.test(productTitleLower)
    return isFrontBackOnlyProduct
      ? ["front", "back"]
      : ["front", "back", "left_sleeve", "right_sleeve", "printed_tag"]
  }, [printProfile, productIsHat, productIsSleeveless, selectedProduct])
  const allowedSizesForCurrentSide = useMemo(() => {
    if (printProfile) {
      const fromProfile = profileSizesForSide(printProfile, currentSide)
      if (fromProfile.length) return fromProfile
    }
    return getAllowedScpPrintSizesForSide(currentSide, {
      isLongSleeve: productIsLongSleeve,
      isHat: productIsHat,
    })
  }, [printProfile, currentSide, productIsLongSleeve, productIsHat])
  /**
   * Per-side allowed sizes — fed into PricingPanel so the per-print size
   * dropdown only offers what the side physically supports. The explicit print
   * profile (when present) defines these per location; otherwise we fall back
   * to the legacy garment-cut heuristics (sleeves on a short-sleeve tee are
   * A6-only, hats are A6-only everywhere, etc).
   */
  const allowedSizesBySide = useMemo<
    Partial<Record<GarmentSide, ScpPrintSizeId[]>>
  >(
    () =>
      DESIGN_SIDES.reduce(
        (acc, side) => {
          const fromProfile = printProfile
            ? profileSizesForSide(printProfile, side)
            : []
          acc[side] = fromProfile.length
            ? fromProfile
            : getAllowedScpPrintSizesForSide(side, {
                isLongSleeve: productIsLongSleeve,
                isHat: productIsHat,
              })
          return acc
        },
        {} as Partial<Record<GarmentSide, ScpPrintSizeId[]>>
      ),
    [printProfile, productIsLongSleeve, productIsHat]
  )
  /**
   * Decoration methods offered for the current side. Profile-driven when a
   * print profile is assigned (per-location methods); otherwise the legacy
   * rule — beanie/puffer garments are embroidery-only, everything else offers
   * both print and embroidery.
   */
  const availableMethodsForCurrentSide = useMemo<PrintMethod[]>(() => {
    // Screen availability is derived, not profile-stored: any side that can
    // take a DTF print can take a screen print (same flat print areas). The
    // profile vocabulary stays print/embroidery; screen is injected here.
    // Sleeves/tags are excluded — screen runs are chest/back placements.
    const withScreen = (methods: PrintMethod[]): PrintMethod[] =>
      methods.includes("print") && (currentSide === "front" || currentSide === "back")
        ? [...methods.filter((m) => m !== "screen"), "screen"]
        : methods
    if (printProfile) {
      const fromProfile = profileMethodsForSide(printProfile, currentSide)
      if (fromProfile.length) return withScreen(fromProfile)
    }
    return productIsBeanie || productIsPuffer
      ? ["embroidery"]
      : withScreen(["print", "embroidery"])
  }, [printProfile, currentSide, productIsBeanie, productIsPuffer])

  /**
   * Manual size override entry point. The per-print row in PricingPanel
   * calls this; we mutate the ref + bump layoutVersion so `printSpecs`
   * recomputes and pricing updates on the next render.
   */
  const handleChangePrintSize = (
    objectId: string,
    sizeId: ScpPrintSizeId | null
  ) => {
    if (sizeId) {
      manualSizeOverridesRef.current.set(objectId, sizeId)
    } else {
      manualSizeOverridesRef.current.delete(objectId)
    }
    bumpLayoutVersion()
  }
  // If the current global print size isn't allowed on this side, snap it to
  // the largest allowed size so pricing + UI stay in sync.
  useEffect(() => {
    if (!allowedSizesForCurrentSide.includes(scpPrintSizeId)) {
      const fallback = allowedSizesForCurrentSide[allowedSizesForCurrentSide.length - 1]
      if (fallback) setScpPrintSizeId(fallback)
    }
  }, [allowedSizesForCurrentSide, scpPrintSizeId])
  const pdpHasVariantOptions = (selectedProduct.variants?.length ?? 0) > 1
  /**
   * When the side only allows one size (hats → A6, short-sleeve sleeves → A6,
   * printed_tag → A6), there's no decision for the customer to make on step 3
   * — but the wizard still expects an explicit "tile click" to flip
   * `pdpStep3Done` and unlock the upload panel. Without this auto-advance,
   * hat PDPs land in a stuck state where the right column shows green
   * checkmarks but the left "Add to design" panel keeps saying
   * "Customize first". Auto-advance the step so the flow continues.
   */
  useEffect(() => {
    if (!embedded) return
    if (pdpHasVariantOptions && !pdpStep1Done) return
    if (allowedSizesForCurrentSide.length !== 1) return
    if (sizingDoneSides[currentSide] && scpPrintSizeChosen) return
    setScpPrintSizeChosen(true)
    setSizingDoneSides((prev) => ({ ...prev, [currentSide]: true as const }))
    setPdpStep((s) => (s > 3 ? s : 4))
  }, [embedded, pdpHasVariantOptions, pdpStep1Done, allowedSizesForCurrentSide, pdpStep3Done, scpPrintSizeChosen])

  /**
   * Mirror of the above but for step 2 (print location). When the product
   * only allows one print location — hats are front-only — the side picker
   * has nothing to choose from. Auto-advance so the wizard doesn't dead-end
   * on a single-tile picker.
   */
  useEffect(() => {
    if (!embedded) return
    if (pdpHasVariantOptions && !pdpStep1Done) return
    if (allowedPrintSides.length !== 1) return
    if (pdpStep2Done) return
    setPdpStep2Done(true)
    setPdpStep((s) => (s > 2 ? s : 3))
  }, [embedded, pdpHasVariantOptions, pdpStep1Done, allowedPrintSides, pdpStep2Done])

  // Show a brief nudge when the customer switches to a side with no artwork yet.
  useEffect(() => {
    if (!embedded) return
    // In the studio the canvas + "Editing: {side}" label sit ABOVE the panel,
    // so "upload artwork in the panel below" points the wrong way — and the
    // Artwork section is a separate accordion, not directly below. Skip it.
    if (assemblyLayout) return
    if (pdpStep < 2) return
    // decoratedSides is populated after canvas load — only nudge once the wizard
    // is past step 1 and the customer has actually switched sides.
    setShowSideNudge(!decoratedSides.includes(currentSide))
  }, [currentSide]) // eslint-disable-line react-hooks/exhaustive-deps

  /**
   * Beanies are embroidery-only — knit fabric can't take DTF heat-press.
   * Auto-set the active side's method to "embroidery" so the customer
   * doesn't have to click the picker, and mark it sized so the upload
   * panel + Step 3 unlock immediately. Skip if the side already has an
   * explicit method (e.g. restored from a saved design / re-order).
   */
  useEffect(() => {
    if (sideDecorationMethods[currentSide]) return
    // Auto-select embroidery + skip the print-size step when this side only
    // supports embroidery — beanie/puffer garments, or an embroidery-only
    // location on the assigned print profile.
    if (
      availableMethodsForCurrentSide.length === 1 &&
      availableMethodsForCurrentSide[0] === "embroidery"
    ) {
      setSideDecorationMethods((prev) => ({ ...prev, [currentSide]: "embroidery" }))
      setSizingDoneSides((prev) => ({ ...prev, [currentSide]: true }))
    }
  }, [availableMethodsForCurrentSide, currentSide, sideDecorationMethods])

  /**
   * Screen colour detection: re-analyse the current side's composed artwork
   * whenever it changes (layoutVersion bumps on every canvas edit) while the
   * side's method is "screen". Purely client-side, ~ms per run.
   */
  useEffect(() => {
    if (sideDecorationMethods[currentSide] !== "screen") {
      setScreenSizeWarning(null)
      return
    }
    // Oversize check: screen artwork resizes freely, but prints beyond the
    // supplier's 40×40cm standard area carry a +30% surcharge — warn (not
    // block) so the customer knows before staff quote the oversize.
    const canvasForSize = fabricCanvasRef.current
    const sizeObjects = canvasForSize?.getObjects?.() ?? []
    let sizeWarn: string | null = null
    if (sizeObjects.length && canvasSize.width > 0 && canvasSize.height > 0) {
      let minX = Infinity
      let minY = Infinity
      let maxX = -Infinity
      let maxY = -Infinity
      for (const obj of sizeObjects) {
        const rect = (obj as any).getBoundingRect?.(true, true)
        if (!rect) continue
        minX = Math.min(minX, rect.left)
        minY = Math.min(minY, rect.top)
        maxX = Math.max(maxX, rect.left + rect.width)
        maxY = Math.max(maxY, rect.top + rect.height)
      }
      if (Number.isFinite(minX) && maxX > minX && maxY > minY) {
        const cm = canvasPxToApproxCm(
          maxX - minX,
          maxY - minY,
          canvasSize.width,
          canvasSize.height
        )
        if (
          cm.width > SCREEN_MAX_STANDARD_PRINT_CM.width ||
          cm.height > SCREEN_MAX_STANDARD_PRINT_CM.height
        ) {
          sizeWarn = `Screen print ~${Math.round(cm.width)}×${Math.round(
            cm.height
          )} cm — larger than our standard ${SCREEN_MAX_STANDARD_PRINT_CM.width}×${
            SCREEN_MAX_STANDARD_PRINT_CM.height
          } cm screen area. We'll confirm an oversize quote before printing.`
        }
      }
    }
    setScreenSizeWarning(sizeWarn)

    const artwork = getCurrentSideFullArtworkDataUrl()
    if (!artwork) {
      setSideScreenEstimates((prev) => {
        if (!(currentSide in prev)) return prev
        const next = { ...prev }
        delete next[currentSide]
        return next
      })
      return
    }
    let cancelled = false
    void estimateScreenColoursFromDataUrl(artwork.dataUrl).then((est) => {
      if (cancelled || !est) return
      setSideScreenEstimates((prev) => ({ ...prev, [currentSide]: est }))
    })
    return () => {
      cancelled = true
    }
    // getCurrentSideFullArtworkDataUrl reads refs; layoutVersion is the change signal.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layoutVersion, currentSide, sideDecorationMethods, canvasSize.width, canvasSize.height])

  /**
   * Sync the estimate into the side's screen config: auto-default the colour
   * count while the customer hasn't chosen manually, record detectedColours
   * for the add-to-cart mismatch check, and invalidate a stale mismatch
   * confirmation whenever detection changes.
   */
  useEffect(() => {
    const est = sideScreenEstimates[currentSide]
    if (!est) return
    if (sideDecorationMethods[currentSide] !== "screen") return
    setSideScreenConfigs((prev) => {
      const cfg = prev[currentSide]
      if (!cfg) return prev
      const detectionChanged = cfg.detectedColours !== est.colours
      const autoColours =
        cfg.coloursAuto !== false && est.printable ? est.colours : cfg.colours
      if (!detectionChanged && autoColours === cfg.colours) return prev
      return {
        ...prev,
        [currentSide]: {
          ...cfg,
          colours: autoColours,
          detectedColours: est.colours,
          ...(detectionChanged ? { mismatchConfirmed: false } : {}),
        },
      }
    })
  }, [sideScreenEstimates, currentSide, sideDecorationMethods])
  const showPdpLabeledOptionsStep = Boolean(integratedPdpSlots) && pdpHasVariantOptions
  const embedPdpQuantityStepNumber = showPdpLabeledOptionsStep ? 3 : 2

  // Single-variant / no-options products have no "Product options" section
  // (section 01), so the default open section (assemblyExpanded = 1) would
  // leave the studio with every section collapsed and no obvious starting
  // point. Open "Print location" (section 02) instead. Guarded on the default
  // so it never overrides a section the customer later opens.
  useEffect(() => {
    if (assemblyLayout && !showPdpLabeledOptionsStep && assemblyExpanded === 1) {
      setAssemblyExpanded(2)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assemblyLayout, showPdpLabeledOptionsStep])
  // Canvas is the primary view from the moment the embedded customizer
  // mounts — gallery hides immediately so the customer can start designing
  // without scrolling past a hero image first (mirrors The Print Bar's
  // PDP, where the canvas occupies the left column from page load).
  // Shared with PdpLayoutGrid via the CustomizeMode context.
  const isCustomizing = embedded
  const customizeModeCtx = useCustomizeModeOptional()
  useEffect(() => {
    customizeModeCtx?.setIsCustomizing(isCustomizing)
  }, [isCustomizing, customizeModeCtx])
  const selectedVariant = useMemo(
    () =>
      selectedProduct?.variants?.find((variant) => variant.id === activeVariantId) ??
      selectedProduct?.variants?.[0],
    [activeVariantId, selectedProduct]
  )

  // Stable resolver passed to <DesignPreviewPopover/>. Memoised so the popover's
  // thumbnail-generation effect doesn't re-run (and flicker "Rendering…") on
  // every parent re-render — it previously received an inline arrow recreated
  // each render, which sat in that effect's dependency array.
  const getGarmentUrlForSide = useCallback(
    (side: GarmentSide) =>
      getGarmentImageUrlForPrintSide(
        selectedProduct,
        selectedVariant,
        side,
        defaultGarmentImage
      ),
    [selectedProduct, selectedVariant, defaultGarmentImage]
  )

  /**
   * Per-size stock state for the size matrix in <PricingPanel/>. Keyed by
   * size value, recomputed when the colour-selected variant changes (because
   * each colour has its own SKUs and therefore its own per-size stock). The
   * `requestedQuantity` per size is fed in so we can flag entries where the
   * customer is asking for more than is currently in stock, not just zero.
   */
  const stockBySize = useMemo(() => {
    if (!selectedProduct || !selectedVariant) return {}
    const variantMap = variantBySizeForReference(selectedProduct, selectedVariant)
    const requestedBySize = new Map(
      sizeMatrix.map((entry) => [entry.size, entry.quantity])
    )
    const result: Record<string, VariantStockState> = {}
    Array.from(variantMap.entries()).forEach(([size, variant]) => {
      result[size] = getVariantStockState(variant, {
        requestedQuantity: requestedBySize.get(size) ?? 0,
      })
    })
    return result
  }, [selectedProduct, selectedVariant, sizeMatrix])

  const flyImageSrcForAddToCart = useMemo(
    () => resolvePdpFlyImageSrc(selectedProduct, selectedVariant),
    [selectedProduct, selectedVariant]
  )

  // Resolve the variant's garment colour from the colour option label using the
  // same swatch table as the PDP. This avoids CORS issues with image sampling.
  const variantTintHex = useMemo(() => {
    if (!selectedProduct || !selectedVariant) return null
    const colorOption = selectedProduct.options?.find((o) => isColorOptionTitle(o.title))
    if (!colorOption?.title) return null
    const label = getVariantOptionValue(selectedVariant, colorOption.title, selectedProduct)
    if (!label) return null
    return resolveGarmentSwatchColor(label)
  }, [selectedProduct, selectedVariant])

  // resolveGarmentSwatchColor may return hsl(...) for unknown colours (valid CSS for
  // the PDP swatch, but the backend render endpoint requires a strict #RRGGBB hex).
  const HEX_COLOR_RE = /^#[0-9a-fA-F]{6}$/
  const variantTintHexForRender = HEX_COLOR_RE.test(variantTintHex ?? "") ? variantTintHex : null

  /**
   * Dark-garment default for screen printing (white underbase needed).
   * Name-based heuristic first, hex luminance as backup. Advisory — seeds the
   * checkbox on method switch; the customer can untick and staff verify at
   * art review.
   */
  const garmentIsDark = useMemo(() => {
    if (!selectedProduct || !selectedVariant) return false
    const colorOption = selectedProduct.options?.find((o) => isColorOptionTitle(o.title))
    const label = colorOption?.title
      ? getVariantOptionValue(selectedVariant, colorOption.title, selectedProduct)
      : null
    if (isDarkGarmentColourName(label)) return true
    if (variantTintHexForRender) {
      const r = parseInt(variantTintHexForRender.slice(1, 3), 16)
      const g = parseInt(variantTintHexForRender.slice(3, 5), 16)
      const b = parseInt(variantTintHexForRender.slice(5, 7), 16)
      return 0.2126 * r + 0.7152 * g + 0.0722 * b < 128
    }
    return false
  }, [selectedProduct, selectedVariant, variantTintHexForRender])

  const nonSizeOptions = useMemo(
    () => (selectedProduct ? getNonSizeOptions(selectedProduct) : []),
    [selectedProduct]
  )

  const handleNonSizeOptionChange = (optionId: string, value: string) => {
    if (!selectedProduct || !selectedVariant) {
      return
    }
    const next = findVariantAfterOptionChange(selectedProduct, selectedVariant, optionId, value)
    if (next) {
      setActiveVariantId(next.id)
    }
  }

  const currencyCode =
    (selectedVariant as any)?.calculated_price?.currency_code ??
    (selectedVariant as any)?.prices?.[0]?.currency_code ??
    "usd"
  const basePriceCents = resolveVariantPrice(selectedVariant, selectedProduct)
  // A tier customer's flat garment price (cost × multiplier), major units.
  // Mirrors the backend SCP charge (garmentMajorWithTier) so the customizer
  // shows exactly what it charges. Null when there's no tier or the variant
  // has no cost — then standard pricing (incl. the bulk ladder) applies.
  const tierUnitCents = useMemo(
    () => getTierUnitMajorForVariant(selectedVariant as any, tier),
    [selectedVariant, tier]
  )
  // The flat tier price replaces the quantity ladder entirely (it's cheaper
  // than any band) — hide the bulk bands when, and only when, a tier price
  // actually applies to this variant.
  const bulkPricingTiers = useMemo(
    () => (tierUnitCents != null ? [] : resolveVariantBulkPricingTiers(selectedVariant)),
    [selectedVariant, tierUnitCents]
  )

  const productBrand = useMemo(() => {
    const sub = selectedProduct?.subtitle
    if (typeof sub === "string" && sub.trim()) {
      return sub.trim()
    }
    const meta = selectedProduct?.metadata as Record<string, unknown> | undefined
    const brand = meta?.brand
    if (typeof brand === "string" && brand.trim()) {
      return brand.trim()
    }
    return null
  }, [selectedProduct])

  const garmentImageUrl = useMemo(
    () =>
      getGarmentImageUrlForPrintSide(
        selectedProduct,
        selectedVariant,
        currentSide,
        defaultGarmentImage
      ),
    [selectedProduct, selectedVariant, currentSide, defaultGarmentImage]
  )

  // Ordered fallbacks for the canvas when the colour-specific garment shot above
  // is dead (the AS Colour CDN rotates per-colour files and 404s individual
  // colours — see also the gallery, which masks this via the next/image cache).
  // Prefer generic, colour-agnostic shots for the current side, then thumbnail /
  // default / any other image. CanvasStage tries each in order on load error, so
  // dead candidates are skipped and the customer still gets a garment to design
  // on instead of a blank "No garment image available". (Source repair via the
  // AS Colour image scripts is still the real fix; this is graceful degradation.)
  const garmentImageFallbacks = useMemo(() => {
    const imgs = (selectedProduct?.images ?? [])
      .map((image) => image.url)
      .filter((u): u is string => typeof u === "string" && u.length > 0)
    const fileOf = (u: string) => (u.split("?")[0].split("/").pop() ?? "").toLowerCase()
    const frontMain = imgs.filter((u) => /_(front|main)__/.test(fileOf(u)))
    const back = imgs.filter((u) => /_back__/.test(fileOf(u)))
    const wantBack = currentSide === "back"
    const ordered = [
      ...(wantBack ? [...back, ...frontMain] : [...frontMain, ...back]),
      selectedProduct?.thumbnail ?? "",
      defaultGarmentImage ?? "",
      ...imgs,
    ].filter((u): u is string => typeof u === "string" && u.length > 0)
    return Array.from(new Set(ordered))
      .filter((u) => u !== garmentImageUrl)
      .slice(0, 8)
  }, [selectedProduct, currentSide, defaultGarmentImage, garmentImageUrl])

  const garmentDisplayTitle = selectedProduct?.title ?? defaultGarmentTitle

  const decoratedSides = useMemo(
    () => DESIGN_SIDES.filter((side) => (sideLayoutsRef.current[side] ?? []).length > 0),
    [layoutVersion]
  )
  const decoratedSidesCount = decoratedSides.length
  const totalQty = sizeMatrix.reduce((total, entry) => total + entry.quantity, 0)

  // Studio (assembly) only: warn before refresh / tab-close / browser-back when
  // there's an unsaved design on the canvas. The design lives in memory only, so
  // an accidental reload would silently wipe it. Reads sideLayoutsRef live (a
  // ref, always current) so the listener never needs re-subscribing.
  useEffect(() => {
    if (!assemblyLayout) return
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      const hasDesign = DESIGN_SIDES.some(
        (side) => (sideLayoutsRef.current[side] ?? []).length > 0
      )
      if (!hasDesign) return
      e.preventDefault()
      // Legacy browsers require returnValue to be set to trigger the prompt.
      e.returnValue = ""
    }
    window.addEventListener("beforeunload", onBeforeUnload)
    return () => window.removeEventListener("beforeunload", onBeforeUnload)
  }, [assemblyLayout])

  /**
   * One PrintSpec per top-level Fabric object — the canonical input to the
   * per-print pricing path. Derives bounding-box → cm → snapped size tier
   * for each object, honouring any per-object manual overrides the
   * customer has set. Re-runs whenever the canvas changes (`layoutVersion`)
   * or the canvas size / product changes.
   *
   * Falls back to an empty array when the canvas is too small to convert
   * pixels to cm reliably; pricing then uses the legacy side-level path.
   */
  const printSpecs = useMemo<PrintSpec[]>(() => {
    const canvasW = Math.round(canvasSize.width)
    const canvasH = Math.round(canvasSize.height)
    if (canvasW < MIN_PRINT_AREA_PX || canvasH < MIN_PRINT_AREA_PX) {
      return []
    }
    const longSleeve = isLongSleeveGarmentProduct(selectedProduct)
    const hat = isHatGarmentProduct(selectedProduct)
    const out: PrintSpec[] = []
    DESIGN_SIDES.forEach((side) => {
      const objects = sideLayoutsRef.current[side] ?? []
      objects.forEach((raw) => {
        const obj = raw as Record<string, any>
        const objectId =
          typeof obj.customizerId === "string" && obj.customizerId.length > 0
            ? (obj.customizerId as string)
            : null
        if (!objectId) return
        const baseW = Number(obj.width)
        const baseH = Number(obj.height)
        const scaleX = Number(obj.scaleX ?? 1)
        const scaleY = Number(obj.scaleY ?? 1)
        if (!Number.isFinite(baseW) || !Number.isFinite(baseH)) return
        const renderedW = Math.max(0, baseW * (Number.isFinite(scaleX) ? scaleX : 1))
        const renderedH = Math.max(0, baseH * (Number.isFinite(scaleY) ? scaleY : 1))
        const approxCm = canvasPxToApproxCm(renderedW, renderedH, canvasW, canvasH)
        const manual = manualSizeOverridesRef.current.get(objectId)
        const sizeId =
          manual ??
          snapSizeForBoundingCm(side, approxCm, {
            isLongSleeve: longSleeve,
            isHat: hat,
          })
        // Hats clamp every side to A6 even when a stale manual override
        // says otherwise — same shape as the printed_tag clamp below.
        const clampedSize = hat || SCP_A6_ONLY_SIDES.has(side) ? "up_to_a6" : sizeId
        out.push({
          objectId,
          side,
          sizeId: clampedSize,
          manualSize: !!manual,
          approxCm: {
            width: Math.round(approxCm.width * 10) / 10,
            height: Math.round(approxCm.height * 10) / 10,
          },
        })
      })
    })
    return out
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layoutVersion, canvasSize.width, canvasSize.height, selectedProduct?.id])

  /**
   * Embroidered sides priced by stitch count. Fed into calculatePricing so
   * (a) their artwork is EXCLUDED from the DTF print matrix and (b) the
   * embroidery add-on (stitch tier + digitizing/qty) lands in the displayed
   * unit price — matching what the backend actually charges at cart-add.
   */
  const embroiderySpecs = useMemo(
    () =>
      decoratedSides
        .filter((side) => sideDecorationMethods[side] === "embroidery")
        .map((side) => {
          // Artwork identity for the per-FILE digitizing dedup: sorted image
          // sources (text objects fall back to their content). Sides sharing
          // the same artwork at the same size (±5%) reuse one digitized file
          // → one setup fee. Mirrors embroideryDigitizingUnits server-side.
          const sources: string[] = []
          for (const raw of sideLayoutsRef.current[side] ?? []) {
            const obj = raw as Record<string, any>
            if (typeof obj.src === "string" && obj.src.length > 0) sources.push(obj.src)
            else if (typeof obj.text === "string" && obj.text.trim().length > 0)
              sources.push(`text:${obj.text.trim()}`)
          }
          return {
            side,
            stitchCount: sideEmbroideryConfigs[side]?.stitchCount ?? 0,
            includeDigitizingFee:
              sideEmbroideryConfigs[side]?.includeDigitizingFee !== false,
            widthMm: sideEmbroideryConfigs[side]?.widthMm,
            heightMm: sideEmbroideryConfigs[side]?.heightMm,
            artworkKey: sources.length ? sources.sort().join("|") : undefined,
          }
        }),
    // sideLayoutsRef is a ref (always current); decoratedSides already bumps
    // on every canvas change via layoutVersion, so the artwork keys refresh.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [decoratedSides, sideDecorationMethods, sideEmbroideryConfigs]
  )

  /**
   * Screen-printed sides priced by colour count. Same contract as
   * embroiderySpecs: feeding these into calculatePricing excludes the sides
   * from the DTF matrix and adds the colour-tier unit instead.
   */
  const screenSpecs = useMemo(
    () =>
      decoratedSides
        .filter((side) => sideDecorationMethods[side] === "screen")
        .map((side) => ({
          side,
          colours: sideScreenConfigs[side]?.colours ?? 1,
          darkGarment: sideScreenConfigs[side]?.darkGarment === true,
        })),
    [decoratedSides, sideDecorationMethods, sideScreenConfigs]
  )

  // Print rows shown in the pricing panel — embroidery/screen sides render
  // as their own rows instead, so drop them from the per-print list.
  const printSpecsForDisplay = useMemo(
    () =>
      embroiderySpecs.length || screenSpecs.length
        ? printSpecs.filter(
            (p) =>
              sideDecorationMethods[p.side] !== "embroidery" &&
              sideDecorationMethods[p.side] !== "screen"
          )
        : printSpecs,
    [printSpecs, embroiderySpecs, screenSpecs, sideDecorationMethods]
  )

  // Memoised so the object identity is stable for the memoised <PricingPanel/>.
  // The deps cover every input to calculatePricing — a missing one would show a
  // stale price, so this list must stay complete if the call args change.
  const pricing = useMemo(
    () =>
      calculatePricing({
        basePriceCents,
        decoratedSidesCount,
        decoratedSides,
        totalQuantity: totalQty,
        bulkPricingTiers,
        scpPrint: { printSizeId: scpPrintSizeId },
        prints: printSpecs.length > 0 ? printSpecsToPricingSpecs(printSpecs) : undefined,
        tierUnitCents,
        embroidery: embroiderySpecs,
        screen: screenSpecs,
        screenHeavyGarment,
      }),
    [
      basePriceCents,
      decoratedSidesCount,
      decoratedSides,
      totalQty,
      bulkPricingTiers,
      scpPrintSizeId,
      printSpecs,
      tierUnitCents,
      embroiderySpecs,
      screenSpecs,
      screenHeavyGarment,
    ]
  )

  const updateLayers = () => {
    const canvas = fabricCanvasRef.current
    if (!canvas) {
      return
    }

    const nextLayers = [...canvas.getObjects()]
      .reverse()
      .map((object: any, index) => ({
        id: getObjectId(object),
        label: object.customizerLabel || object.type || `Layer ${index + 1}`,
        visible: object.visible !== false,
        locked: !!object.lockMovementX,
        type: typeof object.type === "string" ? object.type : undefined,
      }))

    setLayers(nextLayers)

    const active = canvas.getActiveObject()
    setSelectedLayerId(active ? getObjectId(active) : null)

    const activeType = typeof active?.type === "string" ? active.type : null
    if (active && (activeType === "i-text" || activeType === "text")) {
      const fill = typeof active.fill === "string" ? active.fill : "#111827"
      setSelectedTextSnapshot({
        id: getObjectId(active),
        text: typeof active.text === "string" ? active.text : "",
        color: fill,
        fontFamily: typeof active.fontFamily === "string" ? active.fontFamily : "Arial",
        letterSpacing: typeof active.charSpacing === "number" ? active.charSpacing : 0,
      })
    } else {
      setSelectedTextSnapshot(null)
    }
  }

  const updateActiveText = (
    patch: Partial<{ text: string; color: string; fontFamily: string; letterSpacing: number }>
  ) => {
    const canvas = fabricCanvasRef.current
    const active = canvas?.getActiveObject?.()
    const activeType = typeof active?.type === "string" ? active.type : null
    if (!active || (activeType !== "i-text" && activeType !== "text")) {
      return
    }
    if (patch.text !== undefined) active.set({ text: patch.text })
    if (patch.color !== undefined) active.set({ fill: patch.color })
    if (patch.fontFamily !== undefined) active.set({ fontFamily: patch.fontFamily })
    if (patch.letterSpacing !== undefined) active.set({ charSpacing: patch.letterSpacing })
    active.setCoords?.()
    canvas.requestRenderAll()
    saveCurrentSide()
    setSelectedTextSnapshot((prev) =>
      prev && prev.id === getObjectId(active)
        ? {
            ...prev,
            ...(patch.text !== undefined ? { text: patch.text } : {}),
            ...(patch.color !== undefined ? { color: patch.color } : {}),
            ...(patch.fontFamily !== undefined ? { fontFamily: patch.fontFamily } : {}),
            ...(patch.letterSpacing !== undefined ? { letterSpacing: patch.letterSpacing } : {}),
          }
        : prev
    )
  }

  const deselectActiveText = () => {
    const canvas = fabricCanvasRef.current
    if (!canvas) return
    canvas.discardActiveObject()
    canvas.requestRenderAll()
    updateLayers()
  }

  const bumpLayoutVersion = () => {
    setLayoutVersion((version) => version + 1)
  }

  const clampObjectToBounds = (object: any) => {
    const canvas = fabricCanvasRef.current
    if (!canvas || !object) {
      return
    }

    // Clamp POSITION to the whole canvas (garment), NOT the selected print-size
    // box. Customers place artwork anywhere on the garment; the print SIZE only
    // caps how large it can scale (handled separately by the object:scaling cap
    // + the print-size-shrink effect, both of which read printAreaRef). The
    // backend print render trims to the artwork's own opaque pixels and the
    // mockup composites it at this canvas position, so free placement renders
    // faithfully — pinning art inside the small A6 box only restricts the editor.
    // Read live canvas dims (not the `canvasSize` state) so this stays correct
    // when invoked from the once-bound Fabric listeners.
    const canvasW = Number(canvas.getWidth?.() ?? canvas.width ?? 0)
    const canvasH = Number(canvas.getHeight?.() ?? canvas.height ?? 0)
    const pr = { x: 0, y: 0, width: canvasW, height: canvasH }
    if (pr.width < MIN_PRINT_AREA_PX || pr.height < MIN_PRINT_AREA_PX) {
      setOutOfBoundsWarning(null)
      return
    }

    object.setCoords()
    // Fabric 7: axis-aligned scene bbox (extra args are ignored; do not pass legacy Fabric 5 flags).
    const bounds = object.getBoundingRect()
    const prevLeft = object.left ?? 0
    const prevTop = object.top ?? 0

    const inside =
      bounds.left >= pr.x - PRINT_AREA_EPS &&
      bounds.top >= pr.y - PRINT_AREA_EPS &&
      bounds.left + bounds.width <= pr.x + pr.width + PRINT_AREA_EPS &&
      bounds.top + bounds.height <= pr.y + pr.height + PRINT_AREA_EPS

    if (inside) {
      setOutOfBoundsWarning(null)
      return
    }

    let desiredLeft = bounds.left
    let desiredTop = bounds.top

    const right = pr.x + pr.width
    const bottom = pr.y + pr.height

    // Horizontal: if art is wider than the print box, slide along [printRight - width, printLeft] so it stays overlapping.
    if (bounds.width > pr.width + PRINT_AREA_EPS) {
      const minLeft = right - bounds.width
      const maxLeft = pr.x
      desiredLeft = Math.min(Math.max(bounds.left, minLeft), maxLeft)
    } else {
      if (bounds.left < pr.x - PRINT_AREA_EPS) {
        desiredLeft = pr.x
      } else if (bounds.left + bounds.width > right + PRINT_AREA_EPS) {
        desiredLeft = right - bounds.width
      }
    }

    if (bounds.height > pr.height + PRINT_AREA_EPS) {
      const minTop = bottom - bounds.height
      const maxTop = pr.y
      desiredTop = Math.min(Math.max(bounds.top, minTop), maxTop)
    } else {
      if (bounds.top < pr.y - PRINT_AREA_EPS) {
        desiredTop = pr.y
      } else if (bounds.top + bounds.height > bottom + PRINT_AREA_EPS) {
        desiredTop = bottom - bounds.height
      }
    }

    const dx = desiredLeft - bounds.left
    const dy = desiredTop - bounds.top
    const nextLeft = prevLeft + dx
    const nextTop = prevTop + dy

    object.set({ left: nextLeft, top: nextTop })
    object.setCoords()
    canvas.renderAll()

    const moved =
      Math.abs(dx) > PRINT_AREA_EPS || Math.abs(dy) > PRINT_AREA_EPS

    setOutOfBoundsWarning(
      moved ? "Artwork was nudged to stay on the garment." : null
    )
  }

  const updateDpiWarning = () => {
    const canvas = fabricCanvasRef.current
    if (!canvas) {
      setDpiWarning(null)
      setDpiAssessment({ worstDpi: null, severity: "ok", imagesEvaluated: 0, imagesBelowCritical: 0 })
      return
    }
    // Live print area via the ref — like clampObjectToBounds, this fn runs
    // from the once-bound Fabric listeners (via syncHandlers on object:modified
    // /added/removed), where captured `printArea` state is the stale 0×0 mount
    // value. Without this the live low-res warning never updates while scaling.
    const pr = printAreaRef.current
    if (pr.width < 1 || pr.height < 1) {
      setDpiWarning(null)
      setDpiAssessment({ worstDpi: null, severity: "ok", imagesEvaluated: 0, imagesBelowCritical: 0 })
      return
    }

    const pixelsPerInch = pr.width / PRINT_AREA_INCHES.width
    if (!Number.isFinite(pixelsPerInch) || pixelsPerInch <= 0) {
      setDpiWarning(null)
      setDpiAssessment({ worstDpi: null, severity: "ok", imagesEvaluated: 0, imagesBelowCritical: 0 })
      return
    }

    // Inline warning prefers the active object (what the user is touching);
    // canvas-wide assessment drives the modal so unselected low-res layers
    // can't sneak through.
    const active = canvas.getActiveObject?.()
    const activeDpi =
      active && active.type === "image"
        ? effectiveDpiForFabricImage(active, pixelsPerInch)
        : null

    if (activeDpi !== null && activeDpi < DPI_CRITICAL_THRESHOLD) {
      setDpiWarning(
        `Low resolution warning: estimated ${Math.max(1, Math.round(activeDpi))} DPI at current size.`
      )
    } else {
      setDpiWarning(null)
    }

    const assessment = assessCanvasDpi(canvas, pixelsPerInch)
    setDpiAssessment(assessment)

    // Auto-open the modal the first time the canvas crosses into "critical"
    // territory. Stays closed once dismissed; the customer can re-trigger by
    // re-uploading a worse file (assessment changes again). Suppressed in admin
    // proof mode — the DPI upsell is customer-facing and would just interrupt
    // staff repositioning the artwork.
    if (
      assessment.severity === "critical" &&
      !lowResModalDismissedRef.current &&
      !vectorizationRequested &&
      !isAdminProofMode
    ) {
      setLowResModalOpen(true)
    }
  }

  // Edit-from-cart hydration: when `?edit=<lineItemId>` is present, fetch the
  // cart and pre-populate sizes / notes / print size / variant from the line's
  // saved metadata. Artwork itself is not persisted on the cart line (Medusa
  // size limits) so the customer re-uploads — we surface which sides previously
  // had artwork so it's clear what to recreate.
  useEffect(() => {
    if (!editLineItemId || editingHydrated) {
      return
    }
    let cancelled = false
    ;(async () => {
      try {
        const cart = await retrieveCart()
        if (cancelled || !cart?.items) return
        const line = cart.items.find((i) => i.id === editLineItemId)
        if (!line) {
          setEditLineItemId(null)
          return
        }
        const meta = (line.metadata ?? {}) as { customizerDesign?: CustomizerMetadata }
        const design = meta.customizerDesign
        if (design && Array.isArray(design.sizes) && design.sizes.length > 0) {
          setSizeMatrix(design.sizes)
        }
        if (design?.printNotes) {
          setPrintNotes(design.printNotes)
        }
        if (design?.scpPrintSizeId) {
          const sid = design.scpPrintSizeId
          if (
            sid === "up_to_a6" ||
            sid === "up_to_a4" ||
            sid === "up_to_a3" ||
            sid === "oversize"
          ) {
            setScpPrintSizeId(sid as ScpPrintSizeId)
            setScpPrintSizeChosen(true)
          }
        }
        const previousSides = (design?.artifacts ?? [])
          .map((a) => a.side)
          .filter((s, i, arr) => arr.indexOf(s) === i)
        setEditingPreviousSides(previousSides as GarmentSide[])
        setEditingPreviousQty(line.quantity ?? 0)
        setEditingProductTitle(line.product_title ?? line.title ?? null)
        // Route the design through the shared stage-2 hydration pipeline.
        // Stage 2 handles sideLayoutsRef + Fabric loadSide + restoring
        // active side / variant / prints. Without this the canvas
        // shows blank for any previously-decorated side the customer
        // hasn't yet clicked into — the metadata is in the ref but
        // Fabric isn't replaying it onto the live canvas until
        // loadSide fires.
        if (design && typeof design === "object") {
          setPendingHydration(design as CustomizerMetadata)
        }
        // Design-group sibling lookup — surface a hint in the banner
        // when this edit will fan out across the whole group.
        const groupId = (design as { group_id?: string } | undefined)?.group_id
        if (groupId && Array.isArray(cart?.items)) {
          const siblings = cart.items.filter((other: any) => {
            const otherMeta = (other?.metadata ?? {}) as Record<string, unknown>
            const otherDesign = otherMeta?.customizerDesign as
              | { group_id?: string }
              | undefined
            return otherDesign?.group_id === groupId
          })
          if (siblings.length > 1) {
            setEditingGroupSiblingCount(siblings.length)
            setEditingGroupTotalQty(
              siblings.reduce((sum: number, s: any) => sum + (s.quantity ?? 0), 0)
            )
          }
        }
        // Drop user straight onto the final step so they can update qty / re-upload.
        setPdpStep1Done(true)
        setPdpStep2Done(true)
        setSizingDoneSides(
          Object.fromEntries((previousSides as GarmentSide[]).map((s) => [s, true as const])) as Partial<Record<GarmentSide, true>>
        )
        setPdpStep(4)
        setEditingHydrated(true)
      } catch {
        // Cart unreachable; degrade silently — user can still create a fresh line.
        setEditLineItemId(null)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [editLineItemId, editingHydrated])

  // Phase 2 design-group edit hydration. Runs once when ?edit_group=<id>
  // is on the URL. Finds every cart line in the group, materialises:
  //   - the shared design (any one sibling; they're identical)
  //   - bulkCells pre-populated from the existing variant×qty selection
  // and flips into bulkMode so the customer lands inside the bulk grid
  // ready to tweak the design and/or grow/shrink the colour mix.
  useEffect(() => {
    if (!editGroupId || editGroupHydrated) return
    let cancelled = false
    const dropEditGroupParam = () => {
      setEditGroupId(null)
      setEditGroupHydrated(true)
      if (typeof window !== "undefined") {
        const url = new URL(window.location.href)
        url.searchParams.delete("edit_group")
        window.history.replaceState({}, "", url.toString())
      }
    }
    ;(async () => {
      try {
        const cart = await retrieveCart()
        if (cancelled) return
        if (!cart?.items?.length) {
          // No cart or empty cart — nothing to edit. Clean the URL so
          // refreshes don't keep trying.
          dropEditGroupParam()
          return
        }
        const siblings = cart.items.filter((line: any) => {
          const meta = (line?.metadata ?? {}) as Record<string, unknown>
          const design = meta?.customizerDesign as
            | { group_id?: string }
            | undefined
          return design?.group_id === editGroupId
        })
        if (siblings.length === 0) {
          // Group no longer exists (deleted, expired). Drop the param so
          // we don't loop on it and let the customer fall back to fresh add.
          dropEditGroupParam()
          return
        }
        // Rehydrate the design from the first sibling. They share metadata,
        // so any one will do.
        const firstMeta = (siblings[0]?.metadata ?? {}) as {
          customizerDesign?: CustomizerMetadata
        }
        const design = firstMeta.customizerDesign
        if (design && Array.isArray(design.sizes) && design.sizes.length > 0) {
          setSizeMatrix(design.sizes)
        }
        if (design?.printNotes) {
          setPrintNotes(design.printNotes)
        }
        if (design?.scpPrintSizeId) {
          const sid = design.scpPrintSizeId
          if (
            sid === "up_to_a6" ||
            sid === "up_to_a4" ||
            sid === "up_to_a3" ||
            sid === "oversize"
          ) {
            setScpPrintSizeId(sid as ScpPrintSizeId)
            setScpPrintSizeChosen(true)
          }
        }
        const previousSides = (design?.artifacts ?? [])
          .map((a) => a.side)
          .filter((s, i, arr) => arr.indexOf(s) === i)
        setEditingPreviousSides(previousSides as GarmentSide[])
        setSizingDoneSides(
          Object.fromEntries(
            (previousSides as GarmentSide[]).map((s) => [s, true as const])
          ) as Partial<Record<GarmentSide, true>>
        )
        // Route through stage-2 hydration (sideLayoutsRef + Fabric
        // loadSide + restore active side, variant, prints). Same
        // reasoning as the single-line edit path above.
        if (design && typeof design === "object") {
          setPendingHydration(design as CustomizerMetadata)
        }
        setPdpStep1Done(true)
        setPdpStep2Done(true)
        setPdpStep(4)
        // Track every sibling line by id + display fields from the cart
        // (variant_title, product_title, quantity). This is what the
        // read-only edit-mode summary renders; it doesn't need a product
        // variant lookup, so the panel stays functional even when a
        // variant has been retired between cart-add and edit time.
        const trackedLineIds: string[] = []
        const summary: Array<{
          lineId: string
          productTitle: string | null
          variantTitle: string | null
          quantity: number
        }> = []
        for (const line of siblings) {
          const lineId = (line as any)?.id
          if (typeof lineId !== "string" || !lineId) continue
          trackedLineIds.push(lineId)
          summary.push({
            lineId,
            productTitle:
              ((line as any)?.product_title as string | undefined) ??
              ((line as any)?.variant?.product?.title as string | undefined) ??
              null,
            variantTitle:
              ((line as any)?.variant_title as string | undefined) ??
              ((line as any)?.variant?.title as string | undefined) ??
              null,
            quantity:
              typeof (line as any)?.quantity === "number"
                ? (line as any).quantity
                : 0,
          })
        }
        if (trackedLineIds.length === 0) {
          // Defensive: siblings.length was non-zero above but none of them
          // exposed a usable id. Bail rather than wedge the edit flow.
          dropEditGroupParam()
          return
        }
        setEditGroupLineIds(trackedLineIds)
        setEditGroupLineSummary(summary)

        // Best-effort secondary fill: populate editGroupCells from
        // product.variants for back-compat with the bulk-grid fallback.
        // Empty cells is fine — the edit-mode panel doesn't use them.
        const sizeOptForCells = product.options?.find((option) =>
          (option.title ?? "").toLowerCase().includes("size")
        )
        const cells: typeof editGroupInitialCells = []
        for (const line of siblings) {
          const variantId =
            (line as any)?.variant?.id ?? (line as any)?.variant_id
          const variant = product.variants?.find((v) => v.id === variantId)
          if (!variant) continue
          const sizeValue = sizeOptForCells
            ? variant.options?.find((o) => o.option_id === sizeOptForCells.id)
                ?.value ?? "Default"
            : "Default"
          cells.push({
            variant,
            size: sizeValue,
            quantity: (line as any).quantity ?? 0,
          })
        }
        setEditGroupInitialCells(cells)
        setEditGroupCells(cells)
        // Editing a cart design lands the customer in a focused design
        // editor — NOT the bulk grid. The bulk grid is for adding cells
        // to a fresh order; in edit mode the existing cart cells are
        // managed inline next to the canvas. The bulk grid is still
        // available as a secondary "fullscreen grid" link for power-
        // users who want the table view.
        setEditGroupHydrated(true)
        if (typeof window !== "undefined") {
          // Diagnostic — surfaces hydration outcome so a future "design
          // didn't reload" bug shows up in the browser console instead of
          // requiring a remote-debug session.
          // eslint-disable-next-line no-console
          console.info(
            "[customizer] edit_group hydration",
            `lines=${trackedLineIds.length}`,
            `cells=${cells.length}`,
            `design.sides=${
              Array.isArray(design?.sideLayouts) ? design!.sideLayouts.length : "none"
            }`,
            `design.activeSide=${design?.activeSide ?? "—"}`
          )
        }
      } catch (err) {
        if (typeof window !== "undefined") {
          // eslint-disable-next-line no-console
          console.warn("[customizer] edit_group hydration failed", err)
        }
        dropEditGroupParam()
      }
    })()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editGroupId, editGroupHydrated])

  // Stage 1 of rehydration: fetch the saved metadata from either source.
  // Quote "Edit design in Studio" is a third source — when a quote group is in
  // the URL we load the design saved against it so colour + artwork come back.
  const hasQuoteGroupToHydrate = Boolean(
    quoteIdFromUrl && quoteSigFromUrl && quoteGroupFromUrl
  )
  useEffect(() => {
    if (hydrationApplied || pendingHydration) return
    if (
      !designIdFromUrl &&
      !reorderRefFromUrl &&
      !hasQuoteGroupToHydrate &&
      !isAdminProofMode
    )
      return
    let cancelled = false
    ;(async () => {
      try {
        let meta: CustomizerMetadata | null = null
        if (designIdFromUrl) {
          const design = await getMyDesign(designIdFromUrl)
          meta = (design?.customizer_metadata as CustomizerMetadata | undefined) ?? null
        } else if (reorderRefFromUrl) {
          const [orderId, lineItemId] = reorderRefFromUrl.split(":")
          if (orderId && lineItemId) {
            meta = await getOrderLineCustomizerMetadata(orderId, lineItemId)
          }
        } else if (
          quoteIdFromUrl &&
          quoteSigFromUrl &&
          quoteGroupFromUrl
        ) {
          meta = await getQuoteGroupDesign(
            quoteIdFromUrl,
            quoteSigFromUrl,
            quoteGroupFromUrl
          )
        } else if (isAdminProofMode && adminProofOrderId && adminProofLineItemId) {
          // Staff "Create revised proof" — replay the customer's saved design so
          // the artwork comes back on every side at its real position (and the
          // garment colour follows the ordered variant), instead of dropping a
          // flat image fitted to the print area.
          meta = await getOrderLineCustomizerMetadata(
            adminProofOrderId,
            adminProofLineItemId
          )
        }
        if (cancelled) return
        if (meta) setPendingHydration(meta)
      } catch {
        // Best-effort; user can still build a fresh design.
      } finally {
        if (!cancelled && isAdminProofMode) setAdminProofMetaResolved(true)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [
    designIdFromUrl,
    reorderRefFromUrl,
    hasQuoteGroupToHydrate,
    quoteIdFromUrl,
    quoteSigFromUrl,
    quoteGroupFromUrl,
    isAdminProofMode,
    adminProofOrderId,
    adminProofLineItemId,
    hydrationApplied,
    pendingHydration,
  ])

  // Stage 2 of rehydration: replay the metadata once Fabric is up. canvasSize
  // is the readiness signal (set by syncSize() inside the canvas init effect).
  useEffect(() => {
    if (!pendingHydration || hydrationApplied) return
    const canvas = fabricCanvasRef.current
    if (!canvas || canvasSize.width <= 0 || canvasSize.height <= 0) return

    if (Array.isArray(pendingHydration.sideLayouts)) {
      // Saved objects use absolute canvas-pixel coordinates. The canvas size is
      // the live container size, so a design authored on one surface (the PDP
      // studio) rehydrated into another (the smaller admin "revised proof"
      // modal, or a re-order on a different screen) would place its artwork at
      // stale coords — off-position or off-canvas (the garment always looks
      // right because it's re-fit to the canvas every load). Recover the
      // authoring canvas from the saved printArea and rescale every side's
      // objects into the current canvas so the artwork lands where the customer
      // put it (proportionally). No-op when sizes match (legacy behaviour) or
      // when the canvas can't be inferred.
      const savedCanvas = inferCanvasSizeFromPrintArea(
        (pendingHydration as { printArea?: { x: number; y: number; width: number; height: number } }).printArea,
        (pendingHydration.scpPrintSizeId as ScpPrintSizeId | undefined) ?? null
      )
      const sx = savedCanvas ? canvasSize.width / savedCanvas.width : 1
      const sy = savedCanvas ? canvasSize.height / savedCanvas.height : 1
      const needsRescale =
        !!savedCanvas && (Math.abs(sx - 1) > 0.01 || Math.abs(sy - 1) > 0.01)
      const rescaleObject = (obj: any) => {
        if (!needsRescale || !obj || typeof obj !== "object") return obj
        const next = { ...obj }
        if (typeof next.left === "number") next.left = next.left * sx
        if (typeof next.top === "number") next.top = next.top * sy
        if (typeof next.scaleX === "number") next.scaleX = next.scaleX * sx
        if (typeof next.scaleY === "number") next.scaleY = next.scaleY * sy
        return next
      }
      if (needsRescale && typeof window !== "undefined") {
        console.info(
          `[customizer] rescaling rehydrated artwork ${Math.round(
            savedCanvas!.width
          )}×${Math.round(savedCanvas!.height)} → ${Math.round(
            canvasSize.width
          )}×${Math.round(canvasSize.height)} (sx=${sx.toFixed(3)}, sy=${sy.toFixed(3)})`
        )
      }
      // Diagnostic — surfaces which sides got which object counts on
      // rehydration. Caught one production bug where a side's Fabric
      // image had a sanitized "[omitted-image-data]" src (the original
      // upload wasn't archived to MinIO/R2), so loadFromJSON silently
      // dropped the image and the side rendered blank. Logging the
      // count + placeholder-detection makes that obvious in the console
      // instead of customers reporting "the back is gone".
      const placeholders: string[] = []
      for (const sl of pendingHydration.sideLayouts) {
        if (sl?.side && Array.isArray(sl.objects)) {
          // Rescale (canvas-size normalize) AND rewrite private R2 srcs to
          // public on the way into the ref, so loadSide + saveCurrentSide both
          // see browser-loadable, correctly-placed artwork.
          sideLayoutsRef.current[sl.side] = rewriteArtworkSrcs(
            needsRescale ? sl.objects.map(rescaleObject) : sl.objects
          )
          const placeholderCount = sl.objects.reduce((acc, obj: any) => {
            const src = obj?.src
            if (
              typeof src === "string" &&
              (src === "[omitted-image-data]" || src.includes("[omitted-image-data]"))
            ) {
              return acc + 1
            }
            return acc
          }, 0)
          if (placeholderCount > 0) {
            placeholders.push(`${sl.side}(${placeholderCount})`)
          }
        }
      }
      if (typeof window !== "undefined") {
        console.info(
          "[customizer] rehydrated sideLayouts",
          pendingHydration.sideLayouts
            .map((sl) => `${sl.side}=${Array.isArray(sl.objects) ? sl.objects.length : 0}`)
            .join(", "),
          placeholders.length > 0
            ? `· placeholders: ${placeholders.join(", ")}`
            : ""
        )
      }
      if (placeholders.length > 0) {
        setHydrationPlaceholderSides(placeholders)
      }
    }
    if (Array.isArray(pendingHydration.sizes) && pendingHydration.sizes.length > 0) {
      setSizeMatrix(pendingHydration.sizes)
      // In the embedded / v2 Studio the size matrix is derived from the product-
      // options context (sizeQuantities), so the size-matrix effect would zero
      // the rehydrated quantities. Mirror them into the context so they survive.
      if (embedded && productOptionsFromPdp) {
        for (const sq of pendingHydration.sizes) {
          if (
            sq &&
            typeof sq.size === "string" &&
            typeof sq.quantity === "number"
          ) {
            productOptionsFromPdp.setSizeQuantity(sq.size, sq.quantity)
          }
        }
      }
    }
    if (typeof pendingHydration.printNotes === "string" && pendingHydration.printNotes.length) {
      setPrintNotes(pendingHydration.printNotes)
    }
    if (pendingHydration.scpPrintSizeId) {
      const sid = pendingHydration.scpPrintSizeId
      if (sid === "up_to_a6" || sid === "up_to_a4" || sid === "up_to_a3" || sid === "oversize") {
        setScpPrintSizeId(sid as ScpPrintSizeId)
        setScpPrintSizeChosen(true)
        // Mark all sides as sized so the wizard doesn't re-prompt for print
        // size when re-opening a previously saved/ordered design.
        setSizingDoneSides({ front: true, back: true, left_sleeve: true, right_sleeve: true, printed_tag: true })
      }
    }
    if (pendingHydration.variantId) {
      const variant = product.variants?.find(
        (v) => v.id === pendingHydration.variantId
      )
      if (variant) {
        setActiveVariantId(variant.id)
        // In the embedded / v2 Studio the colour is driven by the product-
        // options context (it resolves pdpSyncedVariantId AND renders the
        // "Select Colour" panel). Setting activeVariantId alone isn't enough —
        // the size-matrix effect re-forces pdpSyncedVariantId, snapping the
        // garment back to the default colour and losing the saved one. Mirror
        // the rehydrated variant's option values (colour + size) into the
        // context so the picker + pdpSyncedVariantId follow the saved design.
        if (embedded && productOptionsFromPdp) {
          for (const vo of (variant.options ?? []) as Array<any>) {
            const value = vo?.value
            if (typeof value !== "string") continue
            const optId = vo?.option_id ?? vo?.option?.id
            const title =
              vo?.option?.title ??
              product.options?.find((o) => o.id === optId)?.title
            if (typeof title === "string") {
              productOptionsFromPdp.setOptionValue(title, value)
            }
          }
        }
      }
    }

    // Restore per-side decoration methods (v3 schema). v2 metadata has no
    // entries so all sides default to "print" via getSideDecorationMethod()
    // — no explicit restore needed in that case.
    if (pendingHydration.sideDecorationMethods) {
      setSideDecorationMethods(pendingHydration.sideDecorationMethods)
    }
    if (pendingHydration.sideEmbroideryConfigs) {
      setSideEmbroideryConfigs(pendingHydration.sideEmbroideryConfigs)
    }
    if (pendingHydration.sideScreenConfigs) {
      setSideScreenConfigs(pendingHydration.sideScreenConfigs)
    }

    // Restore manual size overrides so a re-edit of a saved/ordered design
    // keeps the prices the customer last saw. Auto-snapped prints carry
    // `manualSize: false` and we leave them out of the override map so the
    // bounding-box math drives them again on first render.
    if (Array.isArray(pendingHydration.prints)) {
      manualSizeOverridesRef.current.clear()
      for (const print of pendingHydration.prints) {
        if (
          print &&
          typeof print.objectId === "string" &&
          print.objectId.length > 0 &&
          print.manualSize === true &&
          (print.sizeId === "up_to_a6" ||
            print.sizeId === "up_to_a4" ||
            print.sizeId === "up_to_a3" ||
            print.sizeId === "oversize")
        ) {
          manualSizeOverridesRef.current.set(print.objectId, print.sizeId)
        }
      }
    }

    // Restore the side the customer was viewing when they saved / placed the
    // order. Without this, re-opening a back-of-hoodie design dumps the user
    // onto the front and they have to hunt for their work.
    let sideToLoad: GarmentSide = currentSideRef.current
    const savedSide = pendingHydration.activeSide
    if (
      savedSide === "front" ||
      savedSide === "back" ||
      savedSide === "left_sleeve" ||
      savedSide === "right_sleeve" ||
      savedSide === "printed_tag"
    ) {
      sideToLoad = savedSide
      // Update the ref synchronously so the loadSide call below reads the
      // new value before React commits the setCurrentSide state update.
      currentSideRef.current = savedSide
      setCurrentSide(savedSide)
    }

    // In admin proof mode, always land on the exact side staff clicked
    // ("Create revised proof" for Front vs Back) — not whichever side the
    // customer happened to have active when they ordered.
    if (
      isAdminProofMode &&
      (adminProofSide === "front" ||
        adminProofSide === "back" ||
        adminProofSide === "left_sleeve" ||
        adminProofSide === "right_sleeve" ||
        adminProofSide === "printed_tag")
    ) {
      sideToLoad = adminProofSide as GarmentSide
      currentSideRef.current = adminProofSide as GarmentSide
      setCurrentSide(adminProofSide as GarmentSide)
    }

    void loadSide(sideToLoad)
    setHydrationApplied(true)
  }, [pendingHydration, hydrationApplied, canvasSize.width, canvasSize.height, product.variants])

  // Admin proof mode fallback: when the order has NO recoverable saved design
  // for the target side, drop the flat proof artwork fitted to the print area
  // so staff still have an image to position. The normal path is the
  // rehydration pipeline above, which restores the artwork at its true saved
  // position — this only runs when that produced nothing for the side.
  useEffect(() => {
    if (!isAdminProofMode || adminProofAppliedRef.current) return
    const canvas = fabricCanvasRef.current
    if (!canvas || canvasSize.width <= 0 || canvasSize.height <= 0) return
    // Wait until we know whether a saved design exists. When one does, wait for
    // stage 2 to finish replaying it so we can tell whether the target side was
    // restored before deciding to drop the flat fallback image.
    if (!adminProofMetaResolved) return
    if (pendingHydration && !hydrationApplied) return

    adminProofAppliedRef.current = true

    const targetSide = adminProofSide as GarmentSide

    // The saved design already replayed real artwork onto this side at its true
    // position — nothing to add. Objects whose image src was sanitized to the
    // "[omitted-image-data]" placeholder (original upload not archived) don't
    // count as visible artwork, so the flat proof image still gets dropped in
    // that case rather than leaving a blank canvas.
    const restoredVisible = (sideLayoutsRef.current[targetSide] ?? []).filter(
      (obj: any) => {
        const src = obj?.src
        return !(typeof src === "string" && src.includes("[omitted-image-data]"))
      }
    )
    if (restoredVisible.length > 0) return

    // No recoverable saved layout for this side. Switch to it (loading its
    // garment background) and drop the flat proof artwork so staff at least
    // have the image to position.
    if (currentSideRef.current !== targetSide) {
      currentSideRef.current = targetSide
      setCurrentSide(targetSide)
      void loadSide(targetSide)
    }

    const artworkUrl = proofArtworkParam
      ? toPublicArtworkUrl(decodeURIComponent(proofArtworkParam))
      : null
    if (!artworkUrl) return

    void (async () => {
      try {
        // No forced crossOrigin: the artwork is hosted on R2's public dev URL,
        // which sends NO Access-Control-Allow-Origin header — requesting
        // crossOrigin:"anonymous" makes the browser reject the load outright, so
        // the fallback rendered nothing. Loading without it taints the canvas,
        // but that's harmless here: Save Proof composites server-side via an SVG
        // (toSVG embeds the URL, no pixel read), never a client toDataURL.
        const imageObject = await FabricImage.fromURL(artworkUrl)
        const { width: naturalW, height: naturalH } = imageObject.getOriginalSize()
        if (naturalW > 0 && naturalH > 0) {
          imageObject.set({ width: naturalW, height: naturalH, scaleX: 1, scaleY: 1 })
        }
        imageObject.set({ customizerLabel: "Proof artwork" })
        const area = printAreaRef.current
        if (area) fitObjectToPrintArea(imageObject as any, area)
        addCanvasObject(imageObject)
      } catch {
        // artwork load failed — staff can still use blank canvas or upload manually
      }
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    isAdminProofMode,
    canvasSize.width,
    canvasSize.height,
    adminProofMetaResolved,
    pendingHydration,
    hydrationApplied,
  ])

  useEffect(() => {
    if (typeof window === "undefined") {
      return
    }
    try {
      const raw = window.sessionStorage.getItem(SESSION_UPLOADS_KEY)
      if (!raw) {
        return
      }
      const parsed = JSON.parse(raw)
      if (!Array.isArray(parsed)) {
        return
      }
      const hydrated = parsed
        .filter((entry) => entry && typeof entry === "object")
        .map((entry) => ({
          id: String((entry as any).id ?? ""),
          name: String((entry as any).name ?? "Upload"),
          type: String((entry as any).type ?? "image/png"),
          dataUrl: String((entry as any).dataUrl ?? ""),
          originalStorageUrl:
            typeof (entry as any).originalStorageUrl === "string"
              ? (entry as any).originalStorageUrl
              : undefined,
        }))
        .filter((entry) => entry.id && entry.dataUrl)
      setSessionUploads(hydrated)
    } catch {
      // Ignore invalid persisted uploads and continue with an empty tray.
    }
  }, [])

  useEffect(() => {
    if (typeof window === "undefined") {
      return
    }
    try {
      window.sessionStorage.setItem(SESSION_UPLOADS_KEY, JSON.stringify(sessionUploads))
    } catch {
      // Ignore persistence errors; tray still works in-memory.
    }
  }, [sessionUploads])

  const saveCurrentSide = () => {
    if (suppressFabricPersistenceRef.current) {
      return
    }
    // Throttled inside the helper so this is safe to call on every
    // mutation. Tracks customizer iteration depth.
    trackCustomizerAction("layout_change", { side: currentSideRef.current })
    const canvas = fabricCanvasRef.current
    if (!canvas) {
      return
    }

    // These custom props link a serialized canvas object back to its source.
    // `customizerUploadId` ties an object to the upload it came from so the
    // cart-add flow attaches only the customer-original files actually placed
    // on this design (not stale items from the persistent "My uploads" tray).
    const CUSTOM_PROPS = [
      "customizerId",
      "customizerLabel",
      "sourceWidthPx",
      "sourceHeightPx",
      "customizerUploadId",
    ] as const
    const serialized = canvas.toJSON([...CUSTOM_PROPS])
    const serializedObjects = (serialized.objects ?? []) as Record<string, unknown>[]
    // Fabric's Group.toObject() does NOT reliably copy these custom props —
    // notably for SVG uploads (loaded via groupSVGElements) it drops
    // `customizerUploadId` + `customizerLabel` entirely. That silently broke
    // the "download the customer's original file" flow: with no
    // `customizerUploadId` on the serialized object, cart-add saw "no uploads
    // referenced" and wrote an empty `customerOriginalFiles`, so the admin was
    // left with only the rendered print PNG. Re-stamp the props from the live
    // objects (same z-order as toJSON — nothing is excludeFromExport, so
    // indices align 1:1) so the link survives Fabric's per-type quirks.
    const liveObjects = canvas.getObjects() as Array<Record<string, unknown>>
    serializedObjects.forEach((obj, i) => {
      const live = liveObjects[i]
      if (!live) {
        return
      }
      for (const key of CUSTOM_PROPS) {
        if (obj[key] == null && live[key] != null) {
          obj[key] = live[key]
        }
      }
    })
    sideLayoutsRef.current[currentSideRef.current] = serializedObjects
    bumpLayoutVersion()
  }

  const loadSide = async (side: GarmentSide) => {
    const canvas = fabricCanvasRef.current
    if (!canvas) {
      return
    }
    suppressFabricPersistenceRef.current = true
    try {
      const loadVersion = ++sideLoadVersionRef.current

      canvas.clear()
      // Rewrite any private R2 S3-endpoint srcs to their public form before
      // handing to Fabric — the private host 400s an anonymous browser fetch,
      // which would blank the side (order #4). No-op for already-public /
      // data: / supplier-CDN srcs.
      const objects = rewriteArtworkSrcs(sideLayoutsRef.current[side] ?? [])
      const json = {
        version: "7.0.0",
        objects,
      }
      // Wrap loadFromJSON in a try/catch so a single broken image (404 on
      // a hosted upload, R2 CORS misconfig, expired URL) doesn't leave the
      // entire side blank. Fabric's loadFromJSON rejects the whole batch
      // on any FabricImage.fromURL failure — with the catch, we surface
      // a console warning and try to load survivors one-by-one so the
      // customer at least sees the text + working images.
      try {
        await (canvas as any).loadFromJSON(json)
      } catch (err) {
        if (typeof window !== "undefined") {
          // eslint-disable-next-line no-console
          console.warn(
            `[customizer] loadFromJSON failed for side="${side}" (likely an image URL is broken). Falling back to per-object load.`,
            err
          )
        }
        // Best-effort survival load. Skip the object that failed; keep the rest.
        // Empty array = empty side, which is the same outcome as the failure
        // path but lets us continue past the throw.
        await (async () => {
          // Try loading each object as its own micro-batch so one bad
          // entry doesn't take the others down with it.
          for (const obj of objects) {
            try {
              await (canvas as any).loadFromJSON({
                version: "7.0.0",
                objects: [obj],
              })
              // loadFromJSON resets the canvas each call, so we can't
              // accumulate this way. Instead break early — once any single
              // object loads, that's the best we can do; the rest stay
              // missing. The customer's banner ("Some artwork didn't
              // reload") will already be visible to nudge them to re-upload.
              break
            } catch {
              // Skip and try the next.
            }
          }
        })()
      }
      if (loadVersion !== sideLoadVersionRef.current) {
        return
      }
      const liveAfterLoad = canvas.getObjects()
      // Restore our custom link props onto revived objects is index-aligned
      // only when loadFromJSON loaded every object (the happy path). The
      // survival fallback above may load a subset, so skip the restore when
      // counts diverge to avoid mis-assigning props across objects.
      const canRestoreProps = liveAfterLoad.length === objects.length
      liveAfterLoad.forEach((object: any, i: number) => {
        getObjectId(object)
        // Fabric can drop our custom props when reviving a Group (SVG uploads),
        // and a later saveCurrentSide re-serialises from the live object — so
        // without this restore a reloaded SVG side would lose its
        // `customizerUploadId` again and the customer-original-file link would
        // silently break. Mirrors the re-stamp in saveCurrentSide.
        if (canRestoreProps) {
          const src = objects[i] as Record<string, unknown> | undefined
          if (src) {
            for (const key of [
              "customizerId",
              "customizerLabel",
              "sourceWidthPx",
              "sourceHeightPx",
              "customizerUploadId",
            ]) {
              if (object[key] == null && src[key] != null) {
                object[key] = src[key]
              }
            }
          }
        }
        // Re-apply mobile-friendly control styling to objects rehydrated from
        // saved JSON — loadFromJSON resets controls to Fabric defaults.
        object.set({
          cornerSize: 16,
          touchCornerSize: 36,
          cornerStyle: "circle",
          transparentCorners: false,
          cornerColor: "#ffffff",
          cornerStrokeColor: "rgba(15, 23, 42, 0.85)",
          borderColor: "rgba(15, 23, 42, 0.55)",
          padding: 4,
        })
      })
      canvas.renderAll()
      updateLayers()
      updateDpiWarning()
      bumpLayoutVersion()
    } finally {
      suppressFabricPersistenceRef.current = false
    }
  }

  useEffect(() => {
    if (!selectedProduct?.id) {
      return
    }

    const variantIds = new Set(selectedProduct.variants?.map((v) => v.id) ?? [])

    const preferredId =
      embedded &&
      pdpSyncedVariantId &&
      variantIds.has(pdpSyncedVariantId)
        ? pdpSyncedVariantId
        : activeVariantId

    const refVariant =
      selectedProduct.variants?.find((v) => v.id === preferredId) ??
      selectedProduct.variants?.[0]
    if (!refVariant) {
      setSizeMatrix([])
      return
    }

    if (refVariant.id !== activeVariantId) {
      setActiveVariantId(refVariant.id)
      return
    }

    const productChanged = lastCustomizerProductIdRef.current !== selectedProduct.id
    lastCustomizerProductIdRef.current = selectedProduct.id

    const next = uniqueSizesForVariant(selectedProduct, refVariant)

    setSizeMatrix((prev) => {
      if (embedded && productOptionsFromPdp) {
        return next.map((row) => ({
          size: row.size,
          quantity: productOptionsFromPdp.sizeQuantities[row.size] ?? 0,
        }))
      }
      if (productChanged) {
        return next.map((row) => ({ ...row }))
      }
      const prevMap = new Map(prev.map((entry) => [entry.size, entry.quantity]))
      return next.map((row) => ({
        size: row.size,
        quantity: prevMap.get(row.size) ?? 0,
      }))
    })
  }, [
    selectedProduct,
    activeVariantId,
    embedded,
    pdpSyncedVariantId,
    productOptionsFromPdp?.sizeQuantities,
  ])

  useEffect(() => {
    const htmlCanvas = htmlCanvasRef.current
    if (!htmlCanvas) {
      return
    }

    const resizeTarget = fabricContainerRef.current ?? htmlCanvas.parentElement
    if (!resizeTarget) {
      return
    }

    // Mobile-friendly control defaults: larger touch handles + pointer events
    // so iOS Safari fires identical pointermove for touch + mouse. Set once on
    // the prototype so every object created later inherits these without us
    // having to thread the props through every addCanvasObject call site.
    const FabricObject = (fabric as any).Object ?? (fabric as any).FabricObject
    if (FabricObject?.prototype) {
      FabricObject.prototype.cornerSize = 16
      FabricObject.prototype.touchCornerSize = 32
      FabricObject.prototype.cornerStyle = "circle"
      FabricObject.prototype.transparentCorners = false
      FabricObject.prototype.cornerColor = "#ffffff"
      FabricObject.prototype.cornerStrokeColor = "rgba(15, 23, 42, 0.85)"
      FabricObject.prototype.borderColor = "rgba(15, 23, 42, 0.55)"
      FabricObject.prototype.padding = 4
    }

    const canvas = new (fabric as any).Canvas(htmlCanvas, {
      preserveObjectStacking: true,
      selection: true,
      enablePointerEvents: true,
      targetFindTolerance: 8,
      perPixelTargetFind: false,
    })
    fabricCanvasRef.current = canvas

    const syncSize = () => {
      const width = resizeTarget.clientWidth
      const height = resizeTarget.clientHeight
      // Ignore transient 0×0 reports — happens when the wizard subtree
      // is briefly hidden or unmounted (e.g. opening the bulk-order
      // overlay, or the Photos/Customise tab swap). Propagating 0×0
      // would (a) destroy Fabric's buffer via setDimensions and
      // (b) blow away `printArea`, which the bulk submit reads to
      // verify the design is ready — leading to a spurious "design
      // preview is still loading" error on Add-to-cart.
      if (width < MIN_PRINT_AREA_PX || height < MIN_PRINT_AREA_PX) {
        return
      }
      canvas.setDimensions({ width, height })
      setCanvasSize({ width, height })
    }

    const syncHandlers = () => {
      updateLayers()
      updateDpiWarning()
      saveCurrentSide()
      setShowSideNudge(false)
    }

    syncSize()

    canvas.on("object:moving", (event: any) => {
      clampObjectToBounds(event.target)
    })
    canvas.on("object:scaling", (event: any) => {
      // Cap the artwork size at the current print area (per-side, per-size).
      // Skipped when the effective print size is "oversize" (no max).
      const obj = event.target
      const pr = printAreaRef.current
      if (
        obj &&
        pr &&
        effectivePrintSizeIdRef.current !== "oversize" &&
        pr.width >= MIN_PRINT_AREA_PX &&
        pr.height >= MIN_PRINT_AREA_PX
      ) {
        // Use the object's intrinsic width/height (constant during scaling) so
        // we compute a stable max-scale rather than relying on the live
        // bounding rect (which Fabric may not have committed yet mid-drag).
        const baseW = Math.max(1, obj.width ?? 0)
        const baseH = Math.max(1, obj.height ?? 0)
        const maxScaleX = pr.width / baseW
        const maxScaleY = pr.height / baseH
        const maxScale = Math.min(maxScaleX, maxScaleY)
        const sx = Math.abs(obj.scaleX ?? 1)
        const sy = Math.abs(obj.scaleY ?? 1)
        const overshoot = Math.max(sx, sy) > maxScale
        if (overshoot && Number.isFinite(maxScale) && maxScale > 0) {
          const sign = (v: number) => (v < 0 ? -1 : 1)
          obj.set({
            scaleX: maxScale * sign(obj.scaleX ?? 1),
            scaleY: maxScale * sign(obj.scaleY ?? 1),
          })
          obj.setCoords?.()
          canvas.requestRenderAll?.()
        }
      }
      clampObjectToBounds(event.target)
    })
    canvas.on("object:rotating", (event: any) => {
      clampObjectToBounds(event.target)
    })
    canvas.on("object:modified", syncHandlers)
    canvas.on("object:added", syncHandlers)
    canvas.on("object:removed", syncHandlers)
    canvas.on("selection:created", () => {
      updateLayers()
    })
    canvas.on("selection:updated", () => {
      updateLayers()
    })
    canvas.on("selection:cleared", () => {
      updateLayers()
    })

    const observer = new ResizeObserver(syncSize)
    observer.observe(resizeTarget)

    return () => {
      observer.disconnect()
      canvas.dispose()
      fabricCanvasRef.current = null
    }
  }, [])

  const switchSide = async (nextSide: GarmentSide) => {
    if (nextSide === currentSide) {
      return
    }

    saveCurrentSide()
    setCurrentSide(nextSide)
    await loadSide(nextSide)
  }

  const addCanvasObject = (object: any) => {
    const canvas = fabricCanvasRef.current
    if (!canvas) {
      return
    }

    // Per-side cap. Each top-level object becomes one transfer in
    // production, so leaving this unbounded creates orders the print room
    // can't realistically fulfil. Hats are tighter — only one print on the
    // crown is realistic — so they get their own lower cap.
    const perSideCap = productIsHat ? MAX_PRINTS_PER_SIDE_HAT : MAX_PRINTS_PER_SIDE
    const currentCount = canvas.getObjects().length
    if (currentCount >= perSideCap) {
      setUploadError(
        productIsHat
          ? "Hats only support one print on the front. Remove the existing print to add a different one."
          : `This location already has ${perSideCap} prints (the maximum). Tap a print on the garment (or its upload tile) to select it, then click "Remove selected".`
      )
      return
    }

    getObjectId(object)
    // Cascade each additional print on this side by a small diagonal offset so
    // duplicates never land perfectly on top of one another. Without this, a
    // customer who re-taps the same artwork (common when it's low-contrast on a
    // dark garment and the add looks like "nothing happened") builds an
    // invisible stack of identical copies they can't see to remove — the studio
    // then reports the location as decorated and the per-side cap blocks further
    // edits, leaving them stuck. clampObjectToBounds (below) keeps the offset
    // copy on the garment.
    const STACK_OFFSET_PX = 22
    const cascade = currentCount * STACK_OFFSET_PX
    object.set({
      left: printArea.x + printArea.width / 2 - (object.getScaledWidth?.() ?? 80) / 2 + cascade,
      top: printArea.y + printArea.height / 2 - (object.getScaledHeight?.() ?? 40) / 2 + cascade,
      // Mobile-friendly control styling. Setting these per-object reliably
      // works across Fabric v5/v6/v7 — the prototype path didn't take in v7.
      cornerSize: 16,
      touchCornerSize: 36,
      cornerStyle: "circle",
      transparentCorners: false,
      cornerColor: "#ffffff",
      cornerStrokeColor: "rgba(15, 23, 42, 0.85)",
      borderColor: "rgba(15, 23, 42, 0.55)",
      padding: 4,
    })
    canvas.add(object)
    canvas.setActiveObject(object)
    clampObjectToBounds(object)
    canvas.renderAll()
    updateLayers()
    saveCurrentSide()
  }

  const addUploadedAssetToCanvas = async (asset: {
    name: string
    type: string
    dataUrl?: string
    svgText?: string
    /**
     * Persistent id from the "My uploads" tray. Stamped onto the resulting
     * canvas object so the cart-add flow can resolve which uploads are
     * actually referenced on this design (vs stale items in the tray from
     * earlier sessions / orders).
     */
    uploadId?: string
  }) => {
    if (asset.type === "image/svg+xml") {
      const svg = asset.svgText ?? ""
      if (!svg) {
        throw new Error("Could not read SVG.")
      }
      const svgObject = await loadSvgObject(svg)
      svgObject.set({
        customizerLabel: asset.name || "SVG",
        sourceWidthPx: Number(svgObject.width ?? 0),
        ...(asset.uploadId ? { customizerUploadId: asset.uploadId } : {}),
      })
      if (effectivePrintSizeIdForArea === "oversize") {
        svgObject.scaleToWidth?.(getTargetArtworkWidth(printArea.width))
      } else {
        fitObjectToPrintArea(svgObject as any, printArea)
      }
      addCanvasObject(svgObject)
      return
    }

    const dataUrl = asset.dataUrl ?? ""
    if (!dataUrl) {
      throw new Error("Could not read image.")
    }
    const imageObject = await FabricImage.fromURL(dataUrl)
    const { width: naturalW, height: naturalH } = imageObject.getOriginalSize()
    if (naturalW > 0 && naturalH > 0) {
      imageObject.set({ width: naturalW, height: naturalH, scaleX: 1, scaleY: 1 })
    }
    imageObject.set({
      customizerLabel: asset.name || "Image",
      sourceWidthPx: getSourceWidthPx(imageObject),
      sourceHeightPx: getSourceHeightPx(imageObject),
      ...(asset.uploadId ? { customizerUploadId: asset.uploadId } : {}),
    })
    if (effectivePrintSizeIdForArea === "oversize") {
      imageObject.scaleToWidth?.(getTargetArtworkWidth(printArea.width))
    } else {
      fitObjectToPrintArea(imageObject as any, printArea)
    }
    addCanvasObject(imageObject)
  }

  const fireDesignStarted = (source: string) => {
    if (designStartedFiredRef.current) return
    designStartedFiredRef.current = true
    const productId = selectedProduct?.id ?? null
    const variantId = selectedVariant?.id ?? null
    const payload = { source, product_id: productId, variant_id: variantId }
    trackCustomizerFunnel("design_started", payload)
    phCapture("customizer_design_started", payload)
  }

  /**
   * Walk every decorated side's serialised layout and collect the set of
   * `customizerUploadId` values referenced. Used to filter the persistent
   * "My uploads" tray down to only those uploads actually placed on the
   * current design — without it, every cart-add or "save to my designs"
   * also attached unrelated images from earlier sessions, which then
   * showed up as confusing "Customer upload" downloads on the admin
   * order page.
   */
  const collectReferencedUploadIds = (): Set<string> => {
    const seen = new Set<string>()
    DESIGN_SIDES.forEach((side) => {
      const objects = sideLayoutsRef.current[side] ?? []
      objects.forEach((raw) => {
        const id = (raw as Record<string, unknown>).customizerUploadId
        if (typeof id === "string" && id.length > 0) {
          seen.add(id)
        }
      })
    })
    return seen
  }

  // Non-blocking heads-up when a file's original couldn't be archived to
  // storage — the asset is already on the canvas, but it must be re-uploaded
  // before checkout or the print is lost. The cart-add path enforces this too.
  const warnArchiveFailed = (name: string) => {
    setUploadError(
      `Heads up — we couldn't save “${name}” to our servers. It's on your design, but please re-upload it before checkout or the print may not come through.`
    )
  }

  const handleUploadFile = async (file: File) => {
    const isAllowedType =
      file.type === "image/png" ||
      file.type === "image/jpeg" ||
      file.type === "image/svg+xml"

    if (!isAllowedType) {
      setUploadError("Please upload PNG, JPG, or SVG.")
      return
    }

    if (file.size === 0) {
      setUploadError("That file looks empty or corrupted. Please choose a different file.")
      return
    }

    if (file.size > MAX_UPLOAD_SIZE) {
      setUploadError("File is too large. Maximum size is 8MB.")
      return
    }

    // iOS Safari occasionally fires the file-input `change` event twice
    // for the same selection — same name, size, and lastModified. Without
    // a dedupe the customer ends up with two stacked copies of their
    // artwork on the canvas. Track the most recent upload signature in a
    // ref and ignore any duplicate that arrives within 1500ms.
    const sig = `${file.name}|${file.size}|${file.lastModified}`
    const now = Date.now()
    const last = lastUploadSignatureRef.current
    if (last && last.sig === sig && now - last.at < 1500) {
      // Drop silent — re-firing the same event isn't an error condition
      // and the customer doesn't need to know about it.
      return
    }
    lastUploadSignatureRef.current = { sig, at: now }

    setUploadError(null)
    fireDesignStarted("upload")
    try {
      if (file.type === "image/svg+xml") {
        const originalPromise = uploadCustomerOriginalUnchanged(file)
        const svg = await readFileAsText(file)
        const originalStorageUrl = await originalPromise
        const dataUrl = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
        const nextAsset: SessionUploadAsset = {
          id: `upload_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
          name: file.name || "SVG",
          type: file.type,
          dataUrl,
          ...(originalStorageUrl ? { originalStorageUrl } : {}),
        }
        setSessionUploads((current) => [nextAsset, ...current.filter((entry) => entry.dataUrl !== dataUrl)])
        await addUploadedAssetToCanvas({
          name: nextAsset.name,
          type: nextAsset.type,
          svgText: svg,
          uploadId: nextAsset.id,
        })
        if (!originalStorageUrl) warnArchiveFailed(nextAsset.name)
        return
      }

      // Archive the original file (with EXIF intact) to MinIO for the
      // production team's reference, but use an EXIF-normalised copy
      // for the canvas + print render so what-you-see-is-what-gets-printed.
      const originalPromise = uploadCustomerOriginalUnchanged(file)
      const rawDataUrl = await readFileAsDataUrl(file)
      const dataUrl = await normalizeRasterDataUrl(file, rawDataUrl)
      const originalStorageUrl = await originalPromise
      const nextAsset: SessionUploadAsset = {
        id: `upload_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        name: file.name || "Image",
        // Normalisation re-encodes to PNG, so the type stored alongside
        // the canvas-bound data URL must match. The MinIO archive still
        // has the original MIME (handled by `uploadCustomerOriginalUnchanged`).
        type: dataUrl.startsWith("data:image/png") ? "image/png" : file.type,
        dataUrl,
        ...(originalStorageUrl ? { originalStorageUrl } : {}),
      }
      setSessionUploads((current) => [nextAsset, ...current.filter((entry) => entry.dataUrl !== dataUrl)])
      await addUploadedAssetToCanvas({
        name: nextAsset.name,
        type: nextAsset.type,
        dataUrl,
        uploadId: nextAsset.id,
      })
      if (!originalStorageUrl) warnArchiveFailed(nextAsset.name)
    } catch (error) {
      // Never leak a raw decode / FabricError (which can embed the data URL)
      // to the customer; log it for staff and show recoverable copy.
      console.error("[customizer] upload failed", error)
      setUploadError(
        "We couldn't process that file. Make sure it's a valid PNG, JPG or SVG and try again."
      )
    }
  }

  /**
   * "From your cart" tile click — fetch the artwork from MinIO, wrap it as
   * a File, and run it through the standard upload pipeline. Reusing
   * `handleUploadFile` means we get the same dedupe/normalisation/MinIO
   * archive/canvas-add path as a fresh upload, so the artwork lands in
   * `sessionUploads` and behaves identically afterwards. The trade-off
   * is one extra MinIO write per reuse — fine for a manual customer
   * action.
   */
  const handleAddCartDesignFromCart = async (design: {
    id: string
    name: string
    url: string
  }) => {
    setUploadError(null)

    // Two-step fetch (same strategy as bulk-order-grid's mockup compositor):
    //   1. Try the artwork URL directly — works for hosts that send permissive
    //      CORS headers.
    //   2. On reject, retry via `/api/proxy-image`, which re-streams the same
    //      bytes with `Access-Control-Allow-Origin: *`.
    // The cart artwork lives on R2/MinIO public URLs (`pub-….r2.dev`), which do
    // NOT send CORS headers, so a direct cross-origin fetch rejects with the
    // native "Failed to fetch" TypeError — hence the proxy fallback.
    const fetchArtworkBlob = async (): Promise<Blob> => {
      try {
        const direct = await fetch(design.url, { mode: "cors" })
        if (!direct.ok) throw new Error(`HTTP ${direct.status}`)
        return await direct.blob()
      } catch {
        const proxied = `/api/proxy-image?url=${encodeURIComponent(design.url)}`
        const viaProxy = await fetch(proxied)
        if (!viaProxy.ok) {
          throw new Error(`Could not fetch artwork (HTTP ${viaProxy.status})`)
        }
        return await viaProxy.blob()
      }
    }

    try {
      const blob = await fetchArtworkBlob()
      // Infer a usable filename from the URL (strip query string + path).
      const urlPath = (() => {
        try {
          return new URL(design.url).pathname
        } catch {
          return design.url
        }
      })()
      const inferredName =
        urlPath.split("/").pop() || design.name || "cart-artwork"
      const file = new File([blob], inferredName, {
        type: blob.type || "image/png",
      })
      await handleUploadFile(file)
    } catch (error) {
      setUploadError(
        error instanceof Error
          ? error.message
          : "Could not add that artwork from your cart."
      )
    }
  }

  const handleReuseUpload = async (uploadId: string) => {
    const asset = sessionUploads.find((entry) => entry.id === uploadId)
    if (!asset) {
      setUploadError("That upload is no longer available.")
      return
    }

    setUploadError(null)

    // If this artwork is already on the current side, select that copy instead
    // of silently adding another. Re-tapping a "My uploads" tile is almost
    // always the customer trying to find art they can't see (low-contrast on a
    // dark garment), not asking for a second copy — and piling invisible
    // duplicates is exactly what gets them stuck against the per-side cap.
    // Selecting the existing copy surfaces its (white) handles so they can see
    // it's there and resize/remove it.
    const canvas = fabricCanvasRef.current
    const existing = canvas
      ?.getObjects?.()
      ?.find((o: any) => o?.customizerUploadId === uploadId)
    if (canvas && existing) {
      canvas.setActiveObject(existing)
      canvas.requestRenderAll?.()
      updateLayers()
      setStatusMessage(
        `“${asset.name}” is already on this location — selected it for you. Drag a corner to resize, or use “Remove selected” to take it off.`
      )
      return
    }

    fireDesignStarted("reuse_upload")
    try {
      if (asset.type === "image/svg+xml") {
        const prefix = "data:image/svg+xml;charset=utf-8,"
        const encoded = asset.dataUrl.startsWith(prefix) ? asset.dataUrl.slice(prefix.length) : ""
        const svgText = encoded ? decodeURIComponent(encoded) : ""
        await addUploadedAssetToCanvas({
          name: asset.name,
          type: asset.type,
          svgText,
          uploadId: asset.id,
        })
        return
      }
      await addUploadedAssetToCanvas({
        name: asset.name,
        type: asset.type,
        dataUrl: asset.dataUrl,
        uploadId: asset.id,
      })
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : "Could not reuse uploaded image.")
    }
  }

  const handleAddText = (input: {
    text: string
    color: string
    fontFamily: string
    letterSpacing: number
  }) => {
    fireDesignStarted("add_text")
    const textObject = new (fabric as any).IText(input.text || "Text", {
      fontFamily: input.fontFamily || "Arial",
      fill: input.color,
      charSpacing: input.letterSpacing,
      fontSize: 42,
      customizerLabel: "Text",
    })
    addCanvasObject(textObject)
  }

  const handleAddCurvedText = (input: { text: string; color: string; radius: number }) => {
    const path = new (fabric as any).Path(
      `M 0 ${input.radius} A ${input.radius} ${input.radius} 0 0 1 ${input.radius * 2} ${input.radius}`
    )
    const textObject = new (fabric as any).Text(input.text || "Curved Text", {
      fill: input.color,
      fontSize: 32,
      path,
      customizerLabel: "Curved Text",
    })
    addCanvasObject(textObject)
  }

  const removeSelectedImage = () => {
    const canvas = fabricCanvasRef.current
    const active = canvas?.getActiveObject?.()
    // Any selectable, non-locked object the customer placed counts —
    // raster images load as `image`, SVG uploads as `group`, text as
    // `i-text`. Previously the gate only matched `image`, so removing
    // an SVG logo or a text layer silently no-op'd.
    if (!active) {
      setUploadError("Select a layer to remove first.")
      return
    }
    if (active.lockMovementX || active.lockMovementY) {
      setUploadError("That layer is locked. Unlock it first, then remove.")
      return
    }

    canvas.remove(active)
    canvas.discardActiveObject()
    canvas.renderAll()
    updateLayers()
    saveCurrentSide()
    // If that was the last object on this side, drop the stale per-side "sized"
    // and decoration-method flags so the now-empty location isn't left looking
    // confirmed (a ghost ✓ / locked method). The cart never sees it either way
    // (cart-add filters by object count), but the wizard state stays honest.
    const side = currentSideRef.current
    if ((sideLayoutsRef.current[side] ?? []).length === 0) {
      setSizingDoneSides((prev) => {
        if (!prev[side]) return prev
        const next = { ...prev }
        delete next[side]
        return next
      })
      setSideDecorationMethods((prev) => {
        if (!prev[side]) return prev
        const next = { ...prev }
        delete next[side]
        return next
      })
    }
    setUploadError(null)
  }

  /**
   * Remove an entire print location. Clears every artwork object on that side
   * and un-confirms it, so the location drops off the order — cart-add and
   * pricing are both derived from `decoratedSides` (sides that still hold
   * artwork), so emptying the side fully removes it. Works whether the side is
   * the one currently on the canvas (live remove) or a different saved side
   * (clears its stored layout). This is the explicit "remove this location"
   * control the assembly wizard previously lacked.
   */
  const clearPrintLocation = (side: GarmentSide) => {
    const canvas = fabricCanvasRef.current
    if (side === currentSide && canvas) {
      ;(canvas.getObjects() as any[]).slice().forEach((obj: any) => canvas.remove(obj))
      canvas.discardActiveObject()
      canvas.renderAll()
      updateLayers()
      // Serialises the now-empty canvas → sideLayoutsRef[side] = [] + bumps version.
      saveCurrentSide()
    } else {
      sideLayoutsRef.current[side] = []
      bumpLayoutVersion()
    }
    // Drop the per-side "sized" flag so the location is fully un-confirmed and
    // won't show a stale ✓ / sized state if the customer revisits it.
    setSizingDoneSides((prev) => {
      if (!prev[side]) return prev
      const next = { ...prev }
      delete next[side]
      return next
    })
    setUploadError(null)
    trackCustomizerAction("print_location_removed", { side })
  }

  const canRemoveImage = useMemo(() => {
    // Same relaxation — enable Remove for any selected, non-locked
    // top-level layer (image / svg-group / text). Locked layers stay
    // disabled because the explicit lock should prevent accidental
    // removal too.
    const layer = layers.find((l) => l.id === selectedLayerId)
    if (!layer) return false
    return !layer.locked
  }, [layers, selectedLayerId])

  const changeSizeQuantity = (size: string, quantity: number) => {
    // Clamp 0–999 per size (matches the bulk grid) so a stray paste / spinner
    // can't build a 99,999-unit line. Floors decimals to whole garments.
    const safeQty = Math.max(0, Math.min(999, Math.floor(Number.isFinite(quantity) ? quantity : 0)))
    setSizeMatrix((current) =>
      current.map((entry) =>
        entry.size === size ? { ...entry, quantity: safeQty } : entry
      )
    )
    if (productOptionsFromPdp) {
      productOptionsFromPdp.setSizeQuantity(size, safeQty)
      // Only mirror the size into the shared single-value option when the order
      // is effectively single-size (this is the only row with a quantity). For
      // a multi-size order "the selected size" is ambiguous, and writing the
      // last-touched row here made the synced canvas variant jump around as the
      // customer filled in quantities across sizes.
      const sizeOption = getSizeOption(selectedProduct)
      const sizeTitle = sizeOption?.title
      if (sizeTitle && safeQty > 0) {
        const otherNonZero = sizeMatrix.some(
          (entry) => entry.size !== size && entry.quantity > 0
        )
        if (!otherNonZero) {
          productOptionsFromPdp.setOptionValue(sizeTitle, size)
        }
      }
    }
  }

  const renderSideArtifacts = async (
    side: GarmentSide,
    sideObjects: Record<string, unknown>[],
    mockupGarmentUrl: string | null,
    canvasDims: { width: number; height: number }
  ): Promise<{ printUrl: string | null; mockupUrl: string | null }> => {
    /**
     * Full-canvas export (same coordinate space as the live editor). The backend crops the
     * print rectangle and trims transparent margins for the PNG; mockup uses the same crop
     * plus object-cover garment alignment.
     */
    const staticCanvas = new (fabric as any).StaticCanvas(null, {
      width: Math.round(canvasDims.width),
      height: Math.round(canvasDims.height),
    })
    await staticCanvas.loadFromJSON({
      version: "7.0.0",
      objects: sideObjects,
    })
    const rawArtworkSvg = staticCanvas.toSVG()
    staticCanvas.dispose()

    // Fabric inlines every raster as a base64 data URL inside the SVG. Swap
    // each one for its hosted R2 counterpart so the render payload stays
    // under Vercel's serverless function body limit (~4.5 MB). Without this,
    // multi-MB customer uploads return 413 from /api/customizer/render-* on
    // Windows / large originals.
    const dataUrlToHostedUrl: Record<string, string> = {}
    for (const upload of sessionUploads) {
      if (upload.dataUrl && upload.originalStorageUrl) {
        dataUrlToHostedUrl[upload.dataUrl] = upload.originalStorageUrl
      }
    }
    const artworkSvg = await replaceInlineRasterWithHostedUrls(
      rawArtworkSvg,
      dataUrlToHostedUrl
    )

    const garmentImageUrlForApi = resolveGarmentImageUrlForCustomizerRender(
      mockupGarmentUrl,
      defaultGarmentImage
    )

    /**
     * Placement MUST be derived from the same pixel dimensions as the StaticCanvas / payload.canvas.
     * Using the outer `printArea` hook value can desync when effective canvas fallbacks differ from
     * `canvasSize`, which misaligns mockups and leaves the print PNG with empty margins on the wrong side.
     */
    const pa = getPrintArea(
      Math.round(canvasDims.width),
      Math.round(canvasDims.height),
      resolveScpPrintSizeForSide(side, scpPrintSizeBySide[side] ?? DEFAULT_SCP_PRINT_SIZE_ID) as ScpPrintSizeId
    )
    const pw = Math.max(1, Math.round(pa.width))
    const ph = Math.max(1, Math.round(pa.height))

    const payload = {
      side,
      artworkSvg,
      garmentImageUrl: garmentImageUrlForApi,
      placement: {
        x: Math.max(0, Math.round(pa.x)),
        y: Math.max(0, Math.round(pa.y)),
        width: pw,
        height: ph,
      },
      canvas: {
        width: Math.round(canvasDims.width),
        height: Math.round(canvasDims.height),
      },
      // Backend ignores this for non-sleeve sides; when set on a sleeve it
      // recolours the white placeholder so the mockup picks up the variant
      // colour instead of staying white-on-black.
      tintColor: variantTintHexForRender ?? undefined,
    }

    const [printResponse, mockupResponse] = await Promise.all([
      fetch("/api/customizer/render-print", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }),
      fetch("/api/customizer/render-mockup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }),
    ])

    const printBody = await printResponse.json().catch(() => ({}))
    const mockupBody = await mockupResponse.json().catch(() => ({}))

    if (!printResponse.ok || !mockupResponse.ok) {
      const detail = [printBody?.message, mockupBody?.message].filter(Boolean).join(" — ")
      throw new Error(detail || `Render failed (print ${printResponse.status}, mockup ${mockupResponse.status}).`)
    }

    const printUrl = extractRenderArtifactUrl(printBody) ?? extractRenderArtifactUrl((printBody as any)?.data)
    const mockupUrl = extractRenderArtifactUrl(mockupBody) ?? extractRenderArtifactUrl((mockupBody as any)?.data)

    return {
      printUrl,
      mockupUrl,
    }
  }

  /** Admin proof mode: render only the mockup for the current side and
   *  post the result back to the parent admin widget via postMessage. */
  const handleSaveProof = async () => {
    if (!isAdminProofMode) return
    setAdminProofSaving(true)
    setAdminProofError(null)
    try {
      saveCurrentSide()
      const side = currentSideRef.current
      const sideObjects = sideLayoutsRef.current[side] ?? []
      // Load hosted artwork WITHOUT crossOrigin so the (tainted) canvas makes
      // toSVG embed the hosted R2 URL instead of re-encoding the raster as a
      // multi-MB lossless-PNG base64. That re-encode is what blows the render
      // route's body limit ("Render failed (413)") on large photographic
      // proofs even when the original upload is small. Same technique the
      // flat-artwork fallback above relies on; local data: srcs are untouched
      // (the inline-raster swap below still handles those).
      const proofObjects = sideObjects.map((obj: any) =>
        obj && typeof obj.src === "string" && /^https?:\/\//i.test(obj.src)
          ? { ...obj, crossOrigin: null }
          : obj
      )
      const canvasDims = {
        width: Math.round(canvasSize.width),
        height: Math.round(canvasSize.height),
      }
      const mockupGarmentUrl = garmentImageUrl ?? null

      // Render only the mockup (no print file needed for proof)
      const staticCanvas = new (fabric as any).StaticCanvas(null, {
        width: canvasDims.width,
        height: canvasDims.height,
      })
      await staticCanvas.loadFromJSON({ version: "7.0.0", objects: proofObjects })
      const rawArtworkSvg = staticCanvas.toSVG()
      staticCanvas.dispose()

      // Same body-size protection as renderSideArtifacts — swap inline data
      // URLs for hosted ones before POSTing.
      const dataUrlToHostedUrl: Record<string, string> = {}
      for (const upload of sessionUploads) {
        if (upload.dataUrl && upload.originalStorageUrl) {
          dataUrlToHostedUrl[upload.dataUrl] = upload.originalStorageUrl
        }
      }
      const artworkSvg = await replaceInlineRasterWithHostedUrls(
        rawArtworkSvg,
        dataUrlToHostedUrl
      )

      const garmentImageUrlForApi = resolveGarmentImageUrlForCustomizerRender(
        mockupGarmentUrl,
        defaultGarmentImage
      )
      const pa = getPrintArea(canvasDims.width, canvasDims.height, resolveScpPrintSizeForSide(side, scpPrintSizeBySide[side] ?? DEFAULT_SCP_PRINT_SIZE_ID) as ScpPrintSizeId)
      const payload = {
        side,
        artworkSvg,
        garmentImageUrl: garmentImageUrlForApi,
        placement: {
          x: Math.max(0, Math.round(pa.x)),
          y: Math.max(0, Math.round(pa.y)),
          width: Math.max(1, Math.round(pa.width)),
          height: Math.max(1, Math.round(pa.height)),
        },
        canvas: canvasDims,
        tintColor: variantTintHexForRender ?? undefined,
      }

      const mockupResponse = await fetch("/api/customizer/render-mockup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
      const mockupBody = await mockupResponse.json().catch(() => ({}))
      if (!mockupResponse.ok) {
        throw new Error(mockupBody?.message ?? `Render failed (${mockupResponse.status})`)
      }
      const mockupUrl = extractRenderArtifactUrl(mockupBody) ?? extractRenderArtifactUrl((mockupBody as any)?.data)
      if (!mockupUrl) throw new Error("Mockup URL not returned")

      window.parent.postMessage(
        {
          type: "ADMIN_PROOF_SAVED",
          orderId: adminProofOrderId,
          lineItemId: adminProofLineItemId,
          side,
          mockupUrl,
          artworkUrl: proofArtworkParam ? decodeURIComponent(proofArtworkParam) : null,
        },
        "*"
      )
    } catch (err) {
      setAdminProofError(err instanceof Error ? err.message : "Save failed")
    } finally {
      setAdminProofSaving(false)
    }
  }

  /**
   * Background render cache. Key encodes everything that affects render output
   * (objects, print size, garment image, canvas dims) so a stale entry is
   * impossible — any edit changes the key and forces a fresh render at click
   * time. Cache entries hold finished URLs; in-flight entries hold the promise
   * so a click during a prefetch awaits the existing request instead of
   * starting a duplicate.
   */
  const prerenderedArtifactsRef = useRef<
    Map<GarmentSide, { key: string; printUrl: string; mockupUrl: string }>
  >(new Map())
  const inflightRendersRef = useRef<
    Map<
      GarmentSide,
      {
        key: string
        promise: Promise<{ printUrl: string | null; mockupUrl: string | null }>
      }
    >
  >(new Map())

  const buildSideRenderKey = (
    side: GarmentSide
  ):
    | {
        key: string
        canvasDims: { width: number; height: number }
        mockupGarmentUrl: string | null
        sideObjects: Record<string, unknown>[]
      }
    | null => {
    if (!selectedProduct || !selectedVariant) return null
    const w = Math.round(canvasSize.width)
    const h = Math.round(canvasSize.height)
    if (w < MIN_PRINT_AREA_PX || h < MIN_PRINT_AREA_PX) return null
    const sideObjects = sideLayoutsRef.current[side] ?? []
    if (sideObjects.length === 0) return null
    const mockupGarmentUrl = getGarmentImageUrlForPrintSide(
      selectedProduct,
      selectedVariant,
      side,
      defaultGarmentImage
    )
    let serialized: string
    try {
      serialized = JSON.stringify(sideObjects)
    } catch {
      return null
    }
    const key = `${serialized}|${scpPrintSizeId}|${mockupGarmentUrl ?? ""}|${w}x${h}`
    return { key, canvasDims: { width: w, height: h }, mockupGarmentUrl, sideObjects }
  }

  useEffect(() => {
    if (typeof window === "undefined") return
    const handle = window.setTimeout(() => {
      DESIGN_SIDES.forEach((side) => {
        const built = buildSideRenderKey(side)
        if (!built) return
        const cached = prerenderedArtifactsRef.current.get(side)
        if (cached && cached.key === built.key) return
        const inflight = inflightRendersRef.current.get(side)
        if (inflight && inflight.key === built.key) return
        const promise = renderSideArtifacts(
          side,
          built.sideObjects,
          built.mockupGarmentUrl,
          built.canvasDims
        )
        inflightRendersRef.current.set(side, { key: built.key, promise })
        promise
          .then((res) => {
            if (res.printUrl && res.mockupUrl) {
              prerenderedArtifactsRef.current.set(side, {
                key: built.key,
                printUrl: res.printUrl,
                mockupUrl: res.mockupUrl,
              })
            }
          })
          .catch(() => {
            // Swallow — the click-time render will surface the error properly.
          })
          .finally(() => {
            const cur = inflightRendersRef.current.get(side)
            if (cur && cur.key === built.key) {
              inflightRendersRef.current.delete(side)
            }
          })
      })
    }, 800)
    return () => window.clearTimeout(handle)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    layoutVersion,
    selectedProduct?.id,
    selectedVariant?.id,
    scpPrintSizeId,
    canvasSize.width,
    canvasSize.height,
    defaultGarmentImage,
  ])

  /**
   * Cancels the vectorization upsell and removes any matching cart line that a
   * previous "Add to cart" already inserted. Without the cart-side cleanup the
   * customer sees the banner disappear but still pays for vectorization at
   * checkout — exactly the gap that made the bug worth fixing.
   *
   * If the cart is unreachable, we still flip the local state but warn the
   * customer to check their cart manually rather than silently leaving the
   * stale line in place.
   */
  const handleRemoveVectorization = async () => {
    setIsRemovingVectorization(true)
    setStatusMessage(null)
    setUploadError(null)
    try {
      const cart = await retrieveCart()
      const matchingLines = (cart?.items ?? []).filter((line: any) => {
        const meta = (line?.metadata ?? {}) as Record<string, unknown>
        return meta.vectorization_for_order === true
      })
      let anyDeleteFailed = false
      for (const line of matchingLines) {
        try {
          await deleteLineItem((line as any).id)
        } catch {
          anyDeleteFailed = true
        }
      }
      setVectorizationRequested(false)
      if (anyDeleteFailed) {
        setUploadError(
          "Removed from this design, but couldn't fully clear it from your cart — please double-check the cart before checking out."
        )
      } else if (matchingLines.length > 0) {
        setStatusMessage("Vectorization service removed from your cart.")
      }
    } catch {
      setVectorizationRequested(false)
      setUploadError(
        "Removed from this design, but we couldn't reach your cart to confirm. Double-check the cart before checking out."
      )
    } finally {
      setIsRemovingVectorization(false)
    }
  }

  /**
   * Persist the current canvas state to the customer's "My Designs" without
   * sending it to the cart. Skips the heavy server-side print/mockup render —
   * those run later when the user actually adds the design to cart. The
   * thumbnail is a small inline JPEG generated client-side from Fabric.
   */
  const saveCurrentDesign = async () => {
    if (!selectedProduct || !selectedVariant) {
      setUploadError("Select a product and variant before saving.")
      return
    }
    saveCurrentSide()
    const decoratedSidesNow = DESIGN_SIDES.filter(
      (side) => (sideLayoutsRef.current[side] ?? []).length > 0
    )
    if (!decoratedSidesNow.length) {
      setUploadError("Add at least one design element before saving.")
      return
    }

    // Update path: customer entered the customizer via ?design=<id>, so
    // "Save" should update the existing Design row (with a version
    // snapshot — handled by the backend POST endpoint) rather than
    // create a duplicate "Logo v1 · 5/23/2026" alongside the original.
    // Create path: ask for a name and call createMyDesign.
    const isUpdatingExisting = !!designIdFromUrl
    let resolvedName: string | null = null
    if (!isUpdatingExisting) {
      const defaultName = `${
        selectedProduct.title ?? "Design"
      } · ${new Date().toLocaleDateString()}`
      const proposedName = window.prompt("Name this design", defaultName)
      if (proposedName === null) {
        return
      }
      resolvedName = proposedName.trim() || defaultName
    }

    setIsSavingDesign(true)
    setStatusMessage(null)
    setUploadError(null)
    try {
      let thumbnailDataUrl: string | undefined
      try {
        const canvas = fabricCanvasRef.current
        if (canvas && typeof canvas.toDataURL === "function") {
          const url = canvas.toDataURL({
            format: "jpeg",
            quality: 0.6,
            multiplier: 0.4,
          }) as string
          if (typeof url === "string" && url.length < 120_000) {
            thumbnailDataUrl = url
          }
        }
      } catch {
        // Thumbnail is best-effort.
      }

      const partialMetadata: CustomizerMetadata = {
        ...buildCustomizerMetadataBase({
          productId: selectedProduct.id,
          sideLayoutsBySide: sideLayoutsRef.current,
          printArea,
          sizes: sizeMatrix,
          pricing,
          artifacts: [],
          scpPrintSizeId,
          printNotes,
          // Only attach the uploads referenced on this design's canvas —
          // the "My uploads" tray persists across sessions, so attaching
          // every entry would dump unrelated artwork into the saved
          // design's metadata.
          customerOriginalFiles: (() => {
            const referenced = collectReferencedUploadIds()
            return sessionUploads
              .filter((u) => u.originalStorageUrl && referenced.has(u.id))
              .map((u) => ({
                url: u.originalStorageUrl!,
                fileName: u.name,
                mimeType: u.type,
              }))
          })(),
          activeSide: currentSideRef.current,
          prints: printSpecs,
          sideDecorationMethods,
          sideEmbroideryConfigs,
          sideScreenConfigs,
        }),
        variantId: selectedVariant.id,
      }

      const result = isUpdatingExisting && designIdFromUrl
        ? await updateMyDesign(designIdFromUrl, {
            thumbnail_url: thumbnailDataUrl ?? null,
            customizer_metadata: partialMetadata,
          })
        : await createMyDesign({
            name: resolvedName ?? `${selectedProduct.title ?? "Design"}`,
            thumbnail_url: thumbnailDataUrl ?? null,
            base_product_id: selectedProduct.id,
            base_variant_id: selectedVariant.id,
            customizer_metadata: partialMetadata,
          })

      if (!result.ok) {
        setUploadError(result.error)
        return
      }

      setStatusMessage(
        isUpdatingExisting
          ? `Updated "${result.design.name}" in your designs.`
          : `Saved "${result.design.name}" to your designs.`
      )
      const savedPayload = {
        product_id: selectedProduct.id,
        variant_id: selectedVariant.id,
        sides_with_decoration: decoratedSidesNow.length,
        update: isUpdatingExisting,
      }
      trackCustomizerFunnel(
        isUpdatingExisting ? "design_updated" : "design_saved",
        savedPayload
      )
      phCapture(
        isUpdatingExisting
          ? "customizer_design_updated"
          : "customizer_design_saved",
        savedPayload
      )
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "Failed to save design.")
    } finally {
      setIsSavingDesign(false)
    }
  }

  // Refresh the cross-cart bulk-tier aggregate from the backend. Called on
  // mount and after each successful add-to-cart so the tier highlight stays
  // in lockstep with the cart. Soft-fails: a fetch error leaves the previous
  // value in place so the customizer doesn't flicker between aggregated and
  // standalone modes on a transient network hiccup.
  const refreshAggregatedCartQuantity = async () => {
    try {
      const aggregate = await getScpCartAggregate()
      setAggregatedCartQuantity(aggregate?.eligible_quantity ?? 0)
    } catch {
      // Soft-fail: leave previous value in place.
    }
  }

  useEffect(() => {
    void refreshAggregatedCartQuantity()
    // Intentionally run once on mount. The aggregate doesn't change while
    // the customizer is open — only on add-to-cart, which already invokes
    // refreshAggregatedCartQuantity() inline below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /**
   * Screen-setup fee line: one hidden service variant (env
   * NEXT_PUBLIC_SCREEN_SETUP_VARIANT_ID), quantity = number of screens
   * (colours incl. underbase, summed over screen-printed positions), keyed
   * to the design group via metadata so re-edits update instead of
   * duplicating. Soft-fails — staff add the fee at art review if the
   * automatic add doesn't land. Returns false when a follow-up is needed.
   */
  const syncScreenSetupLine = async (
    groupId: string,
    screensNeeded: number
  ): Promise<boolean> => {
    const screenSetupVariantId =
      process.env.NEXT_PUBLIC_SCREEN_SETUP_VARIANT_ID?.trim()
    if (!screenSetupVariantId) return screensNeeded === 0
    try {
      const existingCart = await retrieveCart()
      const existing = (existingCart?.items ?? []).filter((line: any) => {
        const meta = (line?.metadata ?? {}) as Record<string, unknown>
        return meta.screen_setup_for_group === groupId
      })
      const currentScreens = existing.reduce(
        (sum: number, line: any) => sum + (line.quantity || 0),
        0
      )
      if (currentScreens === screensNeeded) return true
      for (const line of existing) {
        await deleteLineItem((line as any).id)
      }
      if (screensNeeded > 0) {
        const result = await addToCartSafe({
          variantId: screenSetupVariantId,
          quantity: screensNeeded,
          countryCode,
          metadata: {
            screen_setup_for_order: true,
            screen_setup_for_group: groupId,
          },
        })
        return result.ok
      }
      return true
    } catch {
      return false
    }
  }

  /** Screens needed for the current design: colours (+ underbase) per screen side. */
  const countScreensForSides = (sides: GarmentSide[]): number =>
    sides.reduce((sum, side) => {
      if (sideDecorationMethods[side] !== "screen") return sum
      const cfg = sideScreenConfigs[side]
      const colours = Math.max(
        1,
        Math.min(SCREEN_MAX_COLOURS, Math.round(cfg?.colours ?? 1))
      )
      return (
        sum + Math.min(SCREEN_MAX_COLOURS, colours + (cfg?.darkGarment ? 1 : 0))
      )
    }, 0)

  const addCustomizedToCart = async (
    bulkCells?: Array<{
      variant: HttpTypes.StoreProductVariant
      size: string
      quantity: number
      mockupDataUrl?: string
    }>
  ) => {
    if (!selectedProduct || !selectedVariant || !countryCode) {
      setUploadError("Select a product and variant before adding to cart.")
      return
    }

    saveCurrentSide()
    // In edit_group mode the quantities live on the existing cart lines —
    // there's no size matrix or bulk grid to read. Use the summary list as
    // the source of truth so the totals shown in the UI stay accurate when
    // logging / telemetry references `totalQuantity`.
    const totalQuantity = editGroupId
      ? editGroupLineSummary.reduce((sum, l) => sum + (l.quantity || 0), 0)
      : bulkCells && bulkCells.length
      ? bulkCells.reduce((total, cell) => total + cell.quantity, 0)
      : sizeMatrix.reduce((total, entry) => total + entry.quantity, 0)
    if (editGroupId) {
      if (editGroupLineIds.length === 0) {
        setUploadError(
          "Couldn't find the cart lines to update — refresh the cart and try again."
        )
        return
      }
    } else if (!totalQuantity) {
      setUploadError(
        bulkCells
          ? "Enter at least one quantity in the bulk grid."
          : "Set at least one quantity in the size matrix."
      )
      return
    }

    const decoratedSides = DESIGN_SIDES.filter((side) => (sideLayoutsRef.current[side] ?? []).length > 0)
    if (!decoratedSides.length) {
      setUploadError("Add at least one design element before checkout.")
      return
    }

    // Screen printing has a hard 25-piece minimum (the supplier's run
    // minimum) — block the add rather than silently pricing at the 25-49
    // tier for a quantity we can't actually produce.
    const hasScreenSides = decoratedSides.some(
      (side) => sideDecorationMethods[side] === "screen"
    )
    if (hasScreenSides && totalQuantity < SCREEN_MIN_QUANTITY) {
      setUploadError(
        `Screen printing needs at least ${SCREEN_MIN_QUANTITY} pieces. Increase the quantity, or switch the screen-printed side(s) to Print (DTF) for small runs.`
      )
      return
    }

    // Embroidered sides must have a confirmed size/stitch estimate before
    // checkout — an unconfirmed side would price its embroidery at $0 (the
    // backend rejects it too; this gate just catches it with a friendlier
    // message). Matches the "Embroidery settings" panel per side.
    const unconfirmedEmbroiderySides = decoratedSides.filter(
      (side) =>
        sideDecorationMethods[side] === "embroidery" &&
        !((sideEmbroideryConfigs[side]?.stitchCount ?? 0) > 0)
    )
    if (unconfirmedEmbroiderySides.length) {
      const labels = unconfirmedEmbroiderySides
        .map((s) => s.replace(/_/g, " "))
        .join(", ")
      setUploadError(
        `Confirm the embroidery size for: ${labels}. Open the embroidery settings on ${
          unconfirmedEmbroiderySides.length === 1 ? "that position" : "each position"
        } and confirm the size (this sets the stitch count your price is based on).`
      )
      return
    }

    // POA gate: embroidery over the auto-priced stitch cap prices at $0 and
    // the backend cart routes reject it — divert to the auto-quote flow
    // instead. Staff quote mode passes through (staff price the quote anyway).
    const poaEmbroiderySides = decoratedSides.filter(
      (side) =>
        sideDecorationMethods[side] === "embroidery" &&
        (sideEmbroideryConfigs[side]?.stitchCount ?? 0) > MAX_AUTO_PRICED_STITCHES
    )
    if (poaEmbroiderySides.length && !isQuoteMode) {
      const labels = poaEmbroiderySides
        .map((s) => s.replace(/_/g, " "))
        .join(", ")
      if (isPOSMode) {
        setUploadError(
          `Embroidery on ${labels} is over ${MAX_AUTO_PRICED_STITCHES.toLocaleString()} stitches — priced on application. Create a quote for this design instead of a POS sale.`
        )
        return
      }
      if (editGroupId || editLineItemId) {
        setUploadError(
          `Embroidery on ${labels} is over ${MAX_AUTO_PRICED_STITCHES.toLocaleString()} stitches — priced on application, so it can't be saved to the cart. Reduce the stitch count, or start a new design and request a quote.`
        )
        return
      }
      if (!poaContactRef.current) {
        poaPendingCellsRef.current = bulkCells ?? null
        setPoaModalOpen(true)
        return
      }
    }

    // Colour-count mismatch gate: the artwork analyser found MORE colours
    // than the customer declared, and they haven't explicitly confirmed the
    // reduction — block so the invoice can't silently undercount screens.
    if (hasScreenSides) {
      for (const side of decoratedSides) {
        if (sideDecorationMethods[side] !== "screen") continue
        const cfg = sideScreenConfigs[side]
        const declared = Math.max(1, cfg?.colours ?? 1)
        const detected = cfg?.detectedColours ?? 0
        if (detected > declared && cfg?.mismatchConfirmed !== true) {
          const sideLabel = side.replace(/_/g, " ")
          setUploadError(
            `Your ${sideLabel} artwork looks like ~${detected} colours but ${declared} ${
              declared > 1 ? "are" : "is"
            } selected. Update the ink colour count in the Screen Print settings, or tick "print it anyway" there to confirm.`
          )
          return
        }
      }
    }

    if (printArea.width < MIN_PRINT_AREA_PX || printArea.height < MIN_PRINT_AREA_PX) {
      setUploadError(
        "The design preview is still loading. Wait a moment or resize the window, then try adding to cart again."
      )
      return
    }

    setIsSubmitting(true)
    setStatusMessage(null)
    setUploadError(null)

    try {
      const canvasW =
        canvasSize.width > MIN_PRINT_AREA_PX
          ? Math.round(canvasSize.width)
          : Math.max(400, Math.round(printArea.width / 0.68))
      const canvasH =
        canvasSize.height > MIN_PRINT_AREA_PX
          ? Math.round(canvasSize.height)
          : Math.max(500, Math.round(printArea.height / 0.72))
      const effectiveCanvas = { width: canvasW, height: canvasH }

      // Only fail the cart-add when an upload **actually used on this
      // design** is missing its archived copy. Stale entries in the
      // persistent "My uploads" tray that the customer didn't place on
      // this canvas are irrelevant — they used to block cart-add even
      // though they don't go on the order.
      const referencedUploadsCheck = collectReferencedUploadIds()
      const uploadsWithoutArchive = sessionUploads.filter(
        (u) => referencedUploadsCheck.has(u.id) && !u.originalStorageUrl
      )
      if (uploadsWithoutArchive.length > 0) {
        // Customer-safe, recoverable copy — never expose backend env vars. The
        // diagnostic detail is logged for staff instead.
        console.error(
          "[customizer] add-to-cart blocked: uploads missing archived original (check MINIO_* / STORE_CORS on the backend)",
          uploadsWithoutArchive.map((u) => u.id)
        )
        setUploadError(
          "We couldn't save your uploaded artwork to our servers — please check your connection, remove the file in “My uploads”, and upload it again before checking out."
        )
        return
      }

      const renderedArtifacts = await Promise.all(
        decoratedSides.map(async (side) => {
          const mockupUrlForSide = getGarmentImageUrlForPrintSide(
            selectedProduct,
            selectedVariant,
            side,
            defaultGarmentImage
          )
          const sideObjects = sideLayoutsRef.current[side] ?? []

          // Try the prefetch cache first — keyed on the same inputs the
          // prefetch effect uses, so a hit means the URLs match the current
          // canvas state byte-for-byte.
          let cacheKey: string | null = null
          if (
            effectiveCanvas.width >= MIN_PRINT_AREA_PX &&
            effectiveCanvas.height >= MIN_PRINT_AREA_PX
          ) {
            try {
              cacheKey = `${JSON.stringify(sideObjects)}|${scpPrintSizeId}|${
                mockupUrlForSide ?? ""
              }|${effectiveCanvas.width}x${effectiveCanvas.height}`
            } catch {
              cacheKey = null
            }
          }
          if (cacheKey) {
            const cached = prerenderedArtifactsRef.current.get(side)
            if (cached && cached.key === cacheKey) {
              return { side, printUrl: cached.printUrl, mockupUrl: cached.mockupUrl }
            }
            const inflight = inflightRendersRef.current.get(side)
            if (inflight && inflight.key === cacheKey) {
              try {
                const res = await inflight.promise
                if (res.printUrl && res.mockupUrl) {
                  return { side, printUrl: res.printUrl, mockupUrl: res.mockupUrl }
                }
              } catch {
                // fall through to live render
              }
            }
          }

          const rendered = await renderSideArtifacts(
            side,
            sideObjects,
            mockupUrlForSide,
            effectiveCanvas
          )
          return {
            side,
            ...rendered,
          }
        })
      )

      const artifacts = renderedArtifacts.map((artifact) => ({
        side: artifact.side,
        printUrl: normalizePersistedArtifactUrl(artifact.printUrl),
        mockupUrl: normalizePersistedArtifactUrl(artifact.mockupUrl),
      }))

      const renderHadPrintAndMockupStrings = renderedArtifacts.every(
        (a) =>
          typeof a.printUrl === "string" &&
          a.printUrl.trim().length > 0 &&
          typeof a.mockupUrl === "string" &&
          a.mockupUrl.trim().length > 0
      )
      const cartHasHostedArtifactUrls = artifacts.every((a) => a.printUrl && a.mockupUrl)

      const sizeOption = selectedProduct.options?.find((option) =>
        (option.title ?? "").toLowerCase().includes("size")
      )
      const selectedVariantOptions = new Map(
        (selectedVariant.options ?? []).map((entry) => [entry.option_id, entry.value ?? ""])
      )

      const normalizedPrintNotes = printNotes
        .trim()
        .slice(0, CUSTOMIZER_PRINT_NOTES_MAX_LENGTH)

      // Only attach uploads referenced on this design's canvas. "My
      // uploads" is a persistent tray (sessionStorage) so customers can
      // reuse files across sessions; without this filter, the cart-add
      // would attach every prior upload too, which then showed up as
      // confusing customer-upload downloads on unrelated orders in the
      // admin.
      const referencedUploadIdsForCart = collectReferencedUploadIds()
      const originalFilesPayload = sessionUploads
        .filter((u) => u.originalStorageUrl && referencedUploadIdsForCart.has(u.id))
        .map((u) => ({
          url: u.originalStorageUrl!,
          fileName: u.name,
          mimeType: u.type,
        }))

      // Design-group fan-out:
      // - When the customer is editing a cart line that's part of a
      //   group (e.g. bulk-added across 4 colours), apply the design
      //   change to every sibling line in one go. Without this they'd
      //   have to repeat the edit per cart line.
      // - When this is a fresh add (bulk or single), mint a new
      //   group_id so future edits of any one line can fan out across
      //   siblings. Single adds still get a group_id (group_size=1)
      //   so two separate adds of the same product don't accidentally
      //   collapse into one cart group via the product_id fallback.
      let groupIdForThisAdd: string | null = null
      let groupSizeForThisAdd = bulkCells?.length ?? 1
      const siblingLineIdsToReplace: string[] = []
      let groupEditSyntheticCells:
        | Array<{
            variant: HttpTypes.StoreProductVariant
            size: string
            quantity: number
            mockupDataUrl?: string
          }>
        | null = null
      if (editLineItemId && !bulkCells?.length) {
        try {
          const editCart = await retrieveCart()
          const editingLine = editCart?.items?.find(
            (i: any) => i.id === editLineItemId
          )
          const editingMeta = (editingLine?.metadata ?? {}) as Record<
            string,
            unknown
          >
          const editingDesign = editingMeta?.customizerDesign as
            | { group_id?: string }
            | undefined
          const existingGroupId = editingDesign?.group_id
          if (existingGroupId && editCart?.items?.length) {
            const siblings = editCart.items.filter((line: any) => {
              const meta = (line?.metadata ?? {}) as Record<string, unknown>
              const design = meta?.customizerDesign as
                | { group_id?: string }
                | undefined
              return design?.group_id === existingGroupId
            })
            if (siblings.length > 1) {
              groupIdForThisAdd = existingGroupId
              groupSizeForThisAdd = siblings.length
              const sizeOptForSiblings = selectedProduct.options?.find(
                (option) =>
                  (option.title ?? "").toLowerCase().includes("size")
              )
              // Explicit non-nullable array type — `typeof groupEditSyntheticCells`
              // is a union with `null` (declared above), and `[]` isn't
              // assignable to `null` under strict TS.
              const synthesised: Array<{
                variant: HttpTypes.StoreProductVariant
                size: string
                quantity: number
                mockupDataUrl?: string
              }> = []
              for (const line of siblings) {
                const variantId = (line as any)?.variant?.id ?? line.variant_id
                const variant = selectedProduct.variants?.find(
                  (v) => v.id === variantId
                )
                if (!variant) {
                  // Variant no longer exists (e.g. deleted on the
                  // backend); skip — we'll lose this sibling but won't
                  // crash the rest of the fan-out.
                  continue
                }
                const sizeValue = sizeOptForSiblings
                  ? variant.options?.find(
                      (o) => o.option_id === sizeOptForSiblings.id
                    )?.value ?? "Default"
                  : "Default"
                synthesised.push({
                  variant,
                  size: sizeValue,
                  quantity: line.quantity ?? 0,
                })
                siblingLineIdsToReplace.push(line.id)
              }
              if (synthesised.length > 0) {
                groupEditSyntheticCells = synthesised
              }
            }
          }
        } catch {
          // Best-effort — if the cart fetch fails, fall through to the
          // single-line edit path. Better to update one line than to
          // bail entirely.
        }
      }
      if (!groupIdForThisAdd) {
        // Group-edit mode (?edit_group=<id>): preserve the existing
        // group id so the new lines remain part of the same logical
        // group as their replaced predecessors.
        if (editGroupId) {
          groupIdForThisAdd = editGroupId
          groupSizeForThisAdd = bulkCells?.length ?? groupSizeForThisAdd
        } else {
          // Fresh add (bulk or single): mint a new group id.
          groupIdForThisAdd =
            typeof crypto !== "undefined" && "randomUUID" in crypto
              ? crypto.randomUUID()
              : `gid_${Date.now().toString(36)}_${Math.random()
                  .toString(36)
                  .slice(2, 10)}`
        }
      }

      const metadataBase = buildCustomizerMetadataBase({
        productId: selectedProduct.id,
        sideLayoutsBySide: sideLayoutsRef.current,
        printArea,
        sizes: sizeMatrix,
        pricing,
        artifacts,
        scpPrintSizeId,
        printNotes: normalizedPrintNotes,
        customerOriginalFiles: originalFilesPayload,
        requiresVectorization: vectorizationRequested,
        activeSide: currentSideRef.current,
        prints: printSpecs,
        sideDecorationMethods,
        sideEmbroideryConfigs,
        sideScreenConfigs,
        groupId: groupIdForThisAdd,
        groupSize: groupSizeForThisAdd,
      })

      // Edit-design (group edit) in-place save path. Bypasses the
      // delete-and-recreate flow entirely — we keep every existing cart
      // line (its id, variant, quantity, created_at) and just rewrite
      // `customizerDesign` metadata + per-line unit_price via the new
      // /store/carts/:id/scp-update-design route. Same render output
      // (artifacts) feeds the metadata so mockups stay current.
      if (editGroupId && editGroupLineIds.length > 0) {
        // Bridge between data URLs and hosted MinIO URLs so the metadata
        // we write doesn't carry "[omitted-image-data]" placeholders for
        // images we already archived to object storage.
        const dataUrlToHostedUrlForEdit: Record<string, string> = {}
        for (const upload of sessionUploads) {
          if (upload.dataUrl && upload.originalStorageUrl) {
            dataUrlToHostedUrlForEdit[upload.dataUrl] = upload.originalStorageUrl
          }
        }
        // Build the same shape `addScpLineItemToCartSafe` writes — minus
        // variantId (that stays on each line). The backend route validates
        // and rebuilds the pricing.server block per line.
        const sharedDesignMetadata: Omit<CustomizerMetadata, "variantId"> =
          metadataBase
        const sanitizedDesign = sanitizeCustomizerDesignForCart(
          sharedDesignMetadata as CustomizerMetadata,
          dataUrlToHostedUrlForEdit
        )
        const updateResult = await updateScpDesignInCart({
          lineIds: editGroupLineIds,
          customizerDesign:
            sanitizedDesign as unknown as Record<string, unknown>,
          printSizeId: scpPrintSizeId,
          productHandle: selectedProduct.handle ?? undefined,
          productTitle: selectedProduct.title ?? undefined,
        })
        if (!updateResult.ok) {
          throw new Error(updateResult.error)
        }

        // Vectorization upsell: the design-edit may have flipped the
        // requiresVectorization flag from false → true (e.g. customer
        // uploaded a low-res raster). Same idempotency pattern as the
        // fresh-add path — probe before stamping.
        const vectorizationVariantIdForEdit =
          process.env.NEXT_PUBLIC_VECTORIZATION_VARIANT_ID?.trim()
        if (vectorizationRequested && vectorizationVariantIdForEdit) {
          let cartAlreadyHasVectorization = true
          try {
            const existingCart = await retrieveCart()
            cartAlreadyHasVectorization = (existingCart?.items ?? []).some(
              (line: any) => {
                const meta = (line?.metadata ?? {}) as Record<string, unknown>
                return meta.vectorization_for_order === true
              }
            )
          } catch {
            // Defensive: treat as already present.
          }
          if (!cartAlreadyHasVectorization) {
            await addToCartSafe({
              variantId: vectorizationVariantIdForEdit,
              quantity: 1,
              countryCode,
              metadata: { vectorization_for_order: true },
            })
          }
        }

        // Screen-setup fee: re-sync on every design edit (colour count may
        // have changed, or screen sides removed entirely — 0 clears the line).
        const editScreens = countScreensForSides(decoratedSides)
        const editSetupOk = await syncScreenSetupLine(groupIdForThisAdd, editScreens)
        if (!editSetupOk) {
          setStatusMessage(
            "Design updated, but the screen setup fee couldn't be updated automatically — our team will correct it during artwork review."
          )
        }

        trackCustomizerFunnel("design_updated_in_cart", {
          product_id: selectedProduct.id,
          line_count: editGroupLineIds.length,
          total_quantity: totalQuantity,
          sides_with_decoration: decoratedSides.length,
        })
        phCapture("customizer_design_updated_in_cart", {
          product_id: selectedProduct.id,
          line_count: editGroupLineIds.length,
          total_quantity: totalQuantity,
          group_id: groupIdForThisAdd,
        })

        router.push(`/${countryCode}/cart`)
        return
      }

      const resolvedQuantities: Array<{
        variant: HttpTypes.StoreProductVariant
        size: string
        quantity: number
        mockupDataUrl?: string
      }> = groupEditSyntheticCells
        ? groupEditSyntheticCells.filter((cell) => cell.quantity > 0)
        : bulkCells && bulkCells.length
        ? bulkCells.filter((cell) => cell.quantity > 0)
        : sizeOption && selectedProduct.variants?.length
          ? sizeMatrix
              .map((entry) => {
                const variant = selectedProduct.variants?.find((candidate) => {
                  const sizeValue = candidate.options?.find(
                    (item) => item.option_id === sizeOption.id
                  )?.value

                  if (sizeValue !== entry.size) {
                    return false
                  }

                  return (selectedProduct.options ?? []).every((option) => {
                    if (option.id === sizeOption.id) {
                      return true
                    }

                    const selectedValue = selectedVariantOptions.get(option.id) ?? ""
                    const candidateValue =
                      candidate.options?.find((item) => item.option_id === option.id)?.value ?? ""
                    return selectedValue === candidateValue
                  })
                })

                if (!variant) {
                  return null
                }

                return {
                  variant,
                  size: entry.size,
                  quantity: entry.quantity,
                }
              })
              .filter(
                (
                  entry
                ): entry is {
                  variant: HttpTypes.StoreProductVariant
                  size: string
                  quantity: number
                } => !!entry && entry.quantity > 0
              )
          : [
              {
                variant: selectedVariant,
                size: "Default",
                quantity: totalQuantity,
              },
            ]

      const unpricedSelections = resolvedQuantities.filter(
        (entry) => !variantHasConfiguredPrice(entry.variant)
      )
      if (unpricedSelections.length) {
        const labels = Array.from(new Set(unpricedSelections.map((entry) => entry.size))).join(", ")
        setUploadError(
          labels
            ? `Some selected sizes are unavailable in the selected region: ${labels}.`
            : "One or more selected variants are unavailable in the selected region."
        )
        return
      }

      // Bridge between Fabric's inline data URLs and the hosted MinIO URLs we
      // already have for each upload. `sanitizeCustomizerDesignForCart` uses
      // this map to swap data URLs for hosted URLs, so re-order rehydration
      // can actually load the images back into Fabric instead of choking on a
      // "[omitted-image-data]" placeholder (the original Phase 3 bug).
      const dataUrlToHostedUrl: Record<string, string> = {}
      for (const upload of sessionUploads) {
        if (upload.dataUrl && upload.originalStorageUrl) {
          dataUrlToHostedUrl[upload.dataUrl] = upload.originalStorageUrl
        }
      }

      // POS mode: skip the cart and post each (variant × quantity) to the
      // POS bridge instead. The admin POS page polls its session and
      // surfaces the line items in its cart UI. We never touch
      // addScpLineItemToCartSafe / vectorization / router.refresh in this
      // branch — those are storefront-only concerns.
      if (isPOSMode && posSessionIdFromUrl) {
        try {
          for (const quantityEntry of resolvedQuantities) {
            const lineItemMetadata: CustomizerMetadata = {
              ...metadataBase,
              variantId: quantityEntry.variant.id,
            }
            const sanitized = sanitizeCustomizerDesignForCart(
              lineItemMetadata,
              dataUrlToHostedUrl
            )
            const variantPrice = (() => {
              const p = (quantityEntry.variant as any)?.calculated_price
              if (!p) return null
              const amount =
                typeof p.calculated_amount === "number"
                  ? p.calculated_amount
                  : Number(p.calculated_amount ?? 0)
              if (!Number.isFinite(amount) || amount <= 0) return null
              return Math.round(amount * 100)
            })()
            const bridgeRes = await fetch("/api/pos-bridge/items", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                pos_session_id: posSessionIdFromUrl,
                kind: "customizer",
                variant_id: quantityEntry.variant.id,
                product_id: selectedProduct.id,
                product_title: selectedProduct.title ?? "Custom design",
                variant_title:
                  (quantityEntry.variant as any)?.title ?? quantityEntry.size,
                quantity: quantityEntry.quantity,
                unit_price_cents: variantPrice,
                metadata: {
                  customizerDesign: sanitized,
                  product_handle: selectedProduct.handle ?? undefined,
                  product_title: selectedProduct.title ?? undefined,
                  print_size_id: scpPrintSizeId,
                },
              }),
            })
            if (!bridgeRes.ok) {
              const j = await bridgeRes.json().catch(() => ({}))
              throw new Error(
                (j as { error?: string })?.error ??
                  `POS bridge failed (${bridgeRes.status})`
              )
            }
          }
          setStatusMessage(
            "Saved to POS. You can close this window — the cart on the till has been updated."
          )
          // Best-effort: close the popup. If we weren't opened with a
          // popup reference, the browser will refuse — leave the
          // success message visible instead.
          try {
            window.close()
          } catch {
            /* noop */
          }
        } catch (err: any) {
          setUploadError(err?.message ?? "Failed to save to POS")
        } finally {
          setIsSubmitting(false)
        }
        return
      }

      // Quote mode: skip the cart and post the finished design back to the
      // quote bridge. All (variant × size) lines for this design go in ONE
      // request sharing a group_id so the backend can replace the group
      // atomically on re-edit. The admin Quotes page polls the quote and
      // surfaces the new lines. Like POS, we never touch the SCP cart routes /
      // vectorization / router.refresh here.
      if (isQuoteMode && quoteIdFromUrl && quoteSigFromUrl) {
        try {
          const groupId =
            quoteGroupFromUrl ||
            `qg_${Date.now().toString(36)}${Math.random()
              .toString(36)
              .slice(2, 8)}`
          const lines = resolvedQuantities.map((quantityEntry) => {
            const lineItemMetadata: CustomizerMetadata = {
              ...metadataBase,
              variantId: quantityEntry.variant.id,
            }
            const sanitized = sanitizeCustomizerDesignForCart(
              lineItemMetadata,
              dataUrlToHostedUrl
            )
            // Suggested per-unit price = the decorated price the operator saw
            // in the pricing panel (pricing.discountedUnitPriceCents), falling
            // back to the bare garment calculated_price. Staff confirm/adjust
            // it on the quote before sending.
            const unitCents = (() => {
              // NOTE: despite the `Cents` suffix, discountedUnitPriceCents is in
              // MAJOR units (decimal dollars) — see customizer/lib/pricing.ts.
              // Convert to cents (× 100), matching the calculated_price fallback
              // below; the backend divides unit_price_cents by 100.
              const fromBreakdown = (pricing as any)?.discountedUnitPriceCents
              if (Number.isFinite(fromBreakdown) && fromBreakdown > 0) {
                return Math.round(fromBreakdown * 100)
              }
              const p = (quantityEntry.variant as any)?.calculated_price
              const amount =
                typeof p?.calculated_amount === "number"
                  ? p.calculated_amount
                  : Number(p?.calculated_amount ?? 0)
              return Number.isFinite(amount) && amount > 0
                ? Math.round(amount * 100)
                : null
            })()
            return {
              kind: "customizer" as const,
              variant_id: quantityEntry.variant.id,
              product_id: selectedProduct.id,
              product_title: selectedProduct.title ?? "Custom design",
              variant_title:
                (quantityEntry.variant as any)?.title ?? quantityEntry.size,
              quantity: quantityEntry.quantity,
              unit_price_cents: unitCents,
              metadata: {
                customizerDesign: sanitized,
                product_handle: selectedProduct.handle ?? undefined,
                product_title: selectedProduct.title ?? undefined,
                print_size_id: scpPrintSizeId,
              },
            }
          })
          const bridgeRes = await fetch("/api/quote-bridge/items", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              quote_id: quoteIdFromUrl,
              qsig: quoteSigFromUrl,
              group_id: groupId,
              lines,
            }),
          })
          if (!bridgeRes.ok) {
            const j = await bridgeRes.json().catch(() => ({}))
            throw new Error(
              (j as { error?: string })?.error ??
                `Quote bridge failed (${bridgeRes.status})`
            )
          }
          setStatusMessage(
            "Saved to quote. You can close this window — the quote has been updated."
          )
          try {
            window.close()
          } catch {
            /* noop */
          }
        } catch (err: any) {
          setUploadError(err?.message ?? "Failed to save to quote")
        } finally {
          setIsSubmitting(false)
        }
        return
      }

      // POA divert: instead of the cart, post the finished design to the POA
      // auto-quote bridge. Mirrors the quote-mode branch (same line shape,
      // fresh group_id so staff "Edit design in Studio" replaces cleanly) but
      // with null prices — staff set them when they price the quote.
      if (poaEmbroiderySides.length && poaContactRef.current) {
        try {
          const contact = poaContactRef.current
          const groupId = `qg_${Date.now().toString(36)}${Math.random()
            .toString(36)
            .slice(2, 8)}`
          const lines = resolvedQuantities.map((quantityEntry) => {
            const lineItemMetadata: CustomizerMetadata = {
              ...metadataBase,
              variantId: quantityEntry.variant.id,
            }
            const sanitized = sanitizeCustomizerDesignForCart(
              lineItemMetadata,
              dataUrlToHostedUrl
            )
            return {
              kind: "customizer" as const,
              variant_id: quantityEntry.variant.id,
              product_id: selectedProduct.id,
              product_title: selectedProduct.title ?? "Custom design",
              variant_title:
                (quantityEntry.variant as any)?.title ?? quantityEntry.size,
              quantity: quantityEntry.quantity,
              unit_price_cents: null,
              metadata: {
                customizerDesign: sanitized,
                product_handle: selectedProduct.handle ?? undefined,
                product_title: selectedProduct.title ?? undefined,
                print_size_id: scpPrintSizeId,
              },
            }
          })
          const bridgeRes = await fetch("/api/quote-bridge/poa", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              email: contact.email,
              contact_name: contact.name || undefined,
              note: contact.note || undefined,
              group_id: groupId,
              product_title: selectedProduct.title ?? undefined,
              poa_sides: poaEmbroiderySides.map((side) => ({
                side,
                stitch_count: sideEmbroideryConfigs[side]?.stitchCount ?? 0,
              })),
              lines,
            }),
          })
          const j = (await bridgeRes.json().catch(() => ({}))) as {
            message?: string
            error?: string
            public_id?: string
          }
          if (!bridgeRes.ok) {
            throw new Error(
              j?.message ?? j?.error ?? `Quote request failed (${bridgeRes.status})`
            )
          }
          setStatusMessage(
            `Quote request${j.public_id ? ` ${j.public_id}` : ""} sent! Embroidery over ${MAX_AUTO_PRICED_STITCHES.toLocaleString()} stitches is priced individually — we'll email ${contact.email} with a price, usually within 1 business day.`
          )
          // If the request came from the bulk grid, close it so the success
          // message (rendered in the main layout) is actually visible.
          setBulkMode(false)
          phCapture("customizer_poa_quote_requested", {
            product_id: selectedProduct.id,
            quote_public_id: j.public_id ?? null,
            total_quantity: totalQuantity,
            max_stitch_count: Math.max(
              0,
              ...poaEmbroiderySides.map(
                (s) => sideEmbroideryConfigs[s]?.stitchCount ?? 0
              )
            ),
          })
        } catch (err: any) {
          setUploadError(err?.message ?? "Failed to send the quote request")
        } finally {
          setIsSubmitting(false)
        }
        return
      }

      // Build the batch payload up front then submit in ONE request. The
      // previous version awaited `addScpLineItemToCartSafe` per cell — for
      // a 252-cell bulk-grid add that was 252 sequential POSTs, each
      // triggering a full `recomputeScpCartPricing` over the whole cart.
      // The backend route now accepts the whole batch and does ONE
      // recompute at the end (see scp-line-items-batch/route.ts).
      const batchItems = resolvedQuantities.map((quantityEntry) => {
        // Per-cell mockup overrides: bulk-grid cells carry colour-specific
        // composited mockups for every decorated side so the cart preview
        // shows the actual colour the customer ordered — not the design-
        // reference colour — across front, back, sleeves, and tag. The
        // override map is keyed by side; sides without an entry keep the
        // base mockupUrl. Data URLs are preserved through the sanitizer
        // via the per-cell override map below.
        const perSideOverrides =
          (quantityEntry as { mockupDataUrlsBySide?: Partial<Record<GarmentSide, string>> })
            .mockupDataUrlsBySide ??
          (quantityEntry.mockupDataUrl
            ? ({ front: quantityEntry.mockupDataUrl } as Partial<Record<GarmentSide, string>>)
            : null)
        const perCellArtifacts =
          perSideOverrides && Object.keys(perSideOverrides).length > 0
            ? (metadataBase.artifacts ?? []).map((artifact) => {
                const override = perSideOverrides[artifact.side as GarmentSide]
                return override ? { ...artifact, mockupUrl: override } : artifact
              })
            : metadataBase.artifacts
        const lineItemMetadata: CustomizerMetadata = {
          ...metadataBase,
          variantId: quantityEntry.variant.id,
          artifacts: perCellArtifacts,
          // Keep `sideLayouts` (with Fabric objects) on the line metadata so
          // `?reorder=<order_id>:<line_item_id>` can replay the design onto
          // the canvas. Previously this was overridden to empty arrays to
          // "keep the payload small" — but it broke re-order completely
          // (customer landed on a blank canvas, see screenshot in support).
          // `sanitizeCustomizerDesignForCart` already strips large `data:`
          // image URLs; what remains (positions, scales, rotations, fills,
          // hosted image URLs) is a few KB per side at most.
        }
        const perCellOverrides: Record<string, string> = { ...dataUrlToHostedUrl }
        if (perSideOverrides) {
          for (const value of Object.values(perSideOverrides)) {
            if (typeof value === "string" && value.length > 0) {
              // Identity entry — preserves the data URL through the
              // sanitizer instead of replacing it with the placeholder.
              perCellOverrides[value] = value
            }
          }
        }

        return {
          variantId: quantityEntry.variant.id,
          quantity: quantityEntry.quantity,
          printSizeId: scpPrintSizeId,
          metadata: {
            customizerDesign: sanitizeCustomizerDesignForCart(
              lineItemMetadata,
              perCellOverrides
            ),
            // When the customer entered the customizer via `?design=<id>`,
            // tag the resulting line so saved-design conversion reporting
            // can attribute the purchase back to the original design row.
            // Stored under both keys: `source_design_id` (current canonical)
            // and `designId` (legacy, kept so older reports still work).
            ...(designIdFromUrl
              ? {
                  source_design_id: designIdFromUrl,
                  designId: designIdFromUrl,
                }
              : {}),
            // Fallback display fields — if the cart later loses the
            // variant→product join (custom add path, deleted variant, or
            // partial fields population), the cart UI still has a title and
            // a working "back to product" link from these.
            product_handle: selectedProduct.handle ?? undefined,
            product_title: selectedProduct.title ?? undefined,
          },
        }
      })

      if (batchItems.length > 0) {
        // Single-line fast-path (e.g. customizer "Add to cart" outside the
        // bulk-grid) keeps using the original endpoint — preserves the
        // existing single-line code path 1:1 and avoids exercising the
        // batch path for low-volume traffic until it's settled in prod.
        if (batchItems.length === 1) {
          const only = batchItems[0]
          const addResult = await addScpLineItemToCartSafe({
            variantId: only.variantId,
            quantity: only.quantity,
            countryCode,
            printSizeId: only.printSizeId,
            metadata: only.metadata,
          })
          if (!addResult.ok) {
            throw new Error(addResult.error)
          }
        } else {
          const batchResult = await addScpLineItemsBatchSafe({
            countryCode,
            items: batchItems,
          })
          if (!batchResult.ok) {
            throw new Error(batchResult.error)
          }
        }
      }

      // Funnel signal — design successfully entered the cart. Fires once
      // per `addCustomizedToCart` invocation regardless of how many size
      // variants were added in the loop above.
      const cartedPayload = {
        product_id: selectedProduct.id,
        line_count: resolvedQuantities.length,
        total_quantity: totalQuantity,
        sides_with_decoration: decoratedSides.length,
        had_vectorization_request: vectorizationRequested,
      }
      trackCustomizerFunnel("design_added_to_cart", cartedPayload)
      phCapture("customizer_design_added_to_cart", cartedPayload)

      // Phase 3a — auto-save bulk groups as a Design for logged-in
      // customers. The cart line still carries the full snapshot (so
      // orders remain immutable at placement), but the same design is
      // now also recoverable from /account/designs months later. Won't
      // run for:
      //   - single-line adds (low intent; would clutter saved designs)
      //   - edit flows (would create duplicate Designs on each save)
      //   - guests (createMyDesign returns "Sign in to save designs.")
      //   - reorders from existing saved designs (designIdFromUrl set)
      const shouldAutoSaveDesign =
        !editLineItemId &&
        !editGroupId &&
        !designIdFromUrl &&
        bulkCells &&
        bulkCells.length > 1
      if (shouldAutoSaveDesign) {
        const autoSaveName = `${
          selectedProduct.title ?? "Design"
        } · ${new Date().toLocaleDateString()}`
        // Use the front-side mockup if available (already rendered as
        // part of the cart-add render pass). Falls back to null — the
        // saved-designs UI degrades gracefully to a placeholder when no
        // thumbnail is set.
        const frontMockup =
          artifacts.find((a) => a.side === "front")?.mockupUrl ?? null
        const autoSaveMetadata: CustomizerMetadata = {
          ...metadataBase,
          variantId: selectedVariant.id,
        }
        // Fire-and-forget — never block the cart-add success path. The
        // worst-case failure mode is "cart added, design wasn't saved",
        // which the customer can fix later by saving manually.
        void createMyDesign({
          name: autoSaveName,
          thumbnail_url: frontMockup,
          base_product_id: selectedProduct.id,
          base_variant_id: selectedVariant.id,
          customizer_metadata: autoSaveMetadata,
        })
          .then((result) => {
            if (!result.ok) return
            const autoSavedPayload = {
              product_id: selectedProduct.id,
              variant_id: selectedVariant.id,
              line_count: resolvedQuantities.length,
              total_quantity: totalQuantity,
              group_id: groupIdForThisAdd,
              design_id: result.design.id,
            }
            trackCustomizerFunnel("design_auto_saved", autoSavedPayload)
            phCapture("customizer_design_auto_saved", autoSavedPayload)
          })
          .catch(() => {
            // Soft-fail — see comment above.
          })
      }

      // Vectorization service: when the customer accepted the upsell from the
      // low-resolution modal, add the matching service SKU once per cart —
      // a single review covers everything in the cart. Re-clicking "Add to cart"
      // (e.g. after tweaking quantity) MUST NOT add a second service line: we
      // probe the cart for an existing `vectorization_for_order: true` marker
      // first. On read failure we default to "already there" so we never
      // double-charge a customer because of a transient cart fetch.
      const vectorizationVariantId =
        process.env.NEXT_PUBLIC_VECTORIZATION_VARIANT_ID?.trim()
      if (vectorizationRequested && vectorizationVariantId) {
        let cartAlreadyHasVectorization = true
        try {
          const existingCart = await retrieveCart()
          cartAlreadyHasVectorization = (existingCart?.items ?? []).some((line: any) => {
            const meta = (line?.metadata ?? {}) as Record<string, unknown>
            return meta.vectorization_for_order === true
          })
        } catch {
          // Defensive default: leave `cartAlreadyHasVectorization = true` so
          // we skip the add. Better to under-add than to double-charge.
        }

        if (!cartAlreadyHasVectorization) {
          const vectorizationResult = await addToCartSafe({
            variantId: vectorizationVariantId,
            quantity: 1,
            countryCode,
            metadata: {
              vectorization_for_order: true,
            },
          })
          if (!vectorizationResult.ok) {
            setStatusMessage(
              `Items were added, but the vectorization service couldn't be added automatically (${vectorizationResult.error}). Our team will add it during artwork review.`
            )
          }
        }
      }

      // Screen-setup fee line (one per design group, qty = screens needed).
      const screensNeeded = countScreensForSides(decoratedSides)
      if (screensNeeded > 0) {
        const setupOk = await syncScreenSetupLine(groupIdForThisAdd, screensNeeded)
        if (!setupOk) {
          setStatusMessage(
            "Items were added, but the screen setup fee couldn't be added automatically — our team will add it during artwork review."
          )
        }
      }

      // Edit-from-cart: replace the original line(s) by deleting after the
      // new line(s) have been added successfully. Three paths:
      // - Group-edit (?edit_group=<id>, bulk grid): delete every line
      //   tracked in editGroupLineIds. The new lines from the bulk
      //   submit have already taken over the group id, so deleting the
      //   old siblings cleanly hands the group identity over.
      // - Single-line edit on a grouped line: Phase 1 fan-out detected
      //   siblings and synthesised bulk cells. Delete every sibling.
      // - Plain single-line edit (no group siblings): delete just the
      //   edited line.
      if (editLineItemId || editGroupId) {
        const idsToDelete =
          editGroupId && editGroupLineIds.length > 0
            ? editGroupLineIds
            : siblingLineIdsToReplace.length > 0
              ? siblingLineIdsToReplace
              : editLineItemId
                ? [editLineItemId]
                : []
        const failed: string[] = []
        for (const id of idsToDelete) {
          try {
            await deleteLineItem(id)
          } catch {
            failed.push(id)
          }
        }
        if (failed.length > 0) {
          setStatusMessage(
            failed.length === idsToDelete.length
              ? "Updated cart added, but couldn't remove the original line(s) — please delete them from the cart."
              : `Updated cart added, but couldn't remove ${failed.length} of ${idsToDelete.length} original line(s) — please clean them up in the cart.`
          )
        }
        router.push(`/${countryCode}/cart`)
        return
      }

      router.refresh()

      // Items are now in the cart and counted in the cross-product
      // aggregate. Clear the local size matrix so the bulk-tier
      // projection doesn't double-count the just-added quantities
      // against the freshly-refreshed aggregate (which already
      // includes them).
      setSizeMatrix((prev) => prev.map((row) => ({ ...row, quantity: 0 })))

      if (!cartHasHostedArtifactUrls) {
        if (renderHadPrintAndMockupStrings) {
          setStatusMessage(
            "Added to your cart. Print/mockup files were generated, but cart metadata only keeps hosted URLs—inline fallbacks (when Minio/S3 is not configured) are dropped. Normal for local dev; configure object storage on Medusa for public links."
          )
        } else {
          setStatusMessage(
            "Customized items were added, but the render service returned no print/mockup data. Check Medusa logs and storage env (e.g. MINIO_*)."
          )
        }
        return
      }

      setStatusMessage("Customized items were added to your cart.")
      // Refresh the cross-cart aggregate so the tier highlight reflects the
      // newly-added line on the next interaction.
      void refreshAggregatedCartQuantity()
    } catch (error) {
      // Always log the full error to the browser console so the customer
      // (or whoever is debugging) can see the actual stack/message even
      // when the surfaced inline message is something generic like
      // "An unknown error occurred." (which is what the Medusa framework
      // returns for unhandled errors in route handlers).
      // eslint-disable-next-line no-console
      console.error("addCustomizedToCart failed", error)
      const baseMessage = error instanceof Error ? error.message : "Could not add customized product."
      // The generic Medusa framework default isn't actionable. Replace
      // it with a hint pointing to where to look so we can diagnose
      // failures from the field instead of staring at the generic copy.
      // For everything else, route through the sanitizer so customers don't
      // see leaked stack traces or internal paths from older backend builds.
      const friendly = /^an unknown error occurred\.?$/i.test(baseMessage.trim())
        ? "Add to cart failed on the server (no specific message returned). Open the browser console for details, or check Fly backend logs (sc-prints-backend) around this timestamp."
        : sanitizeCartAddError(baseMessage)
      setUploadError(friendly)
    } finally {
      setIsSubmitting(false)
    }
  }

  // Stable handler identities for the memoised <PricingPanel/>. The latest-ref
  // pattern keeps each prop's identity constant (so React.memo can skip renders
  // driven by unrelated state) while always invoking the freshest closure — no
  // stale-closure risk even though these close over volatile state.
  const addCustomizedToCartRef = useRef(addCustomizedToCart)
  addCustomizedToCartRef.current = addCustomizedToCart
  const changeSizeQuantityRef = useRef(changeSizeQuantity)
  changeSizeQuantityRef.current = changeSizeQuantity
  const handleChangePrintSizeRef = useRef(handleChangePrintSize)
  handleChangePrintSizeRef.current = handleChangePrintSize

  const stableOnAddToCart = useCallback(() => addCustomizedToCartRef.current(), [])
  const stableOnChangeSizeQty = useCallback(
    (size: string, quantity: number) => changeSizeQuantityRef.current(size, quantity),
    []
  )
  const stableOnChangePrintSize = useCallback(
    (objectId: string, sizeId: ScpPrintSizeId | null) =>
      handleChangePrintSizeRef.current(objectId, sizeId),
    []
  )
  const stableOnScpPrintSizeIdChange = useCallback((id: ScpPrintSizeId) => {
    setScpPrintSizeId(id)
    setScpPrintSizeChosen(true)
  }, [])

  // Lifted out of the bulkMode render branch (a conditional early-return where
  // hooks can't live) so the props handed to the memoised <BulkOrderGrid/> have
  // stable identities. Cheap to compute each render; only consumed in bulk mode.
  const bulkPrintThumbSources = useMemo(
    () =>
      DESIGN_SIDES.reduce<Array<{ side: GarmentSide; printUrl: string }>>((acc, side) => {
        const cached = prerenderedArtifactsRef.current.get(side)
        if (cached?.printUrl) acc.push({ side, printUrl: cached.printUrl })
        return acc
      }, []),
    // prerenderedArtifactsRef is repopulated by the prefetch effect on canvas
    // changes (which bump layoutVersion) and on colour/variant changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [layoutVersion, activeVariantId]
  )
  const bulkPrintArtifactForThumb = bulkPrintThumbSources[0] ?? null
  const latestBulkHandlers = {
    estimate: (qty: number): BulkPricingEstimate | null => {
      if (!qty || !basePriceCents) return null
      const breakdown = calculatePricing({
        basePriceCents,
        decoratedSidesCount,
        decoratedSides,
        totalQuantity: qty,
        bulkPricingTiers,
        scpPrint: { printSizeId: scpPrintSizeId },
        prints: printSpecs.length > 0 ? printSpecsToPricingSpecs(printSpecs) : undefined,
        tierUnitCents,
        embroidery: embroiderySpecs,
        screen: screenSpecs,
        screenHeavyGarment,
      })
      const activeTier = breakdown.activeBulkTier
      // calculatePricing's `*Cents` fields are misnamed — Medusa 2.x stores
      // price.amount in major units (dollars), so these are already dollars.
      return {
        unitPriceMajor: breakdown.discountedUnitPriceCents,
        totalPriceMajor: breakdown.totalPriceCents,
        activeTierLabel: activeTier
          ? `${activeTier.minQuantity}${activeTier.maxQuantity ? `–${activeTier.maxQuantity}` : "+"}`
          : undefined,
      }
    },
    submit: async (cells: BulkCellEntry[]) => {
      phCapture(editGroupId ? "bulk_grid_updated_cart" : "bulk_grid_added_to_cart", {
        product_id: selectedProduct.id,
        line_count: cells.length,
        total_quantity: cells.reduce((sum, c) => sum + c.quantity, 0),
        colour_count: new Set(cells.map((c) => c.variant.id.split(":")[0])).size,
        edit_group: editGroupId ? true : false,
      })
      await addCustomizedToCart(cells)
      // Fresh bulk adds drop back to the wizard; group-edit mode navigates to
      // /cart inside addCustomizedToCart itself.
      if (!editGroupId) setBulkMode(false)
    },
  }
  const bulkHandlersRef = useRef(latestBulkHandlers)
  bulkHandlersRef.current = latestBulkHandlers
  const stableEstimatePricingForTotal = useCallback(
    (qty: number) => bulkHandlersRef.current.estimate(qty),
    []
  )
  const stableHandleBulkSubmit = useCallback(
    (cells: BulkCellEntry[]) => bulkHandlersRef.current.submit(cells),
    []
  )
  const stableBulkClose = useCallback(() => setBulkMode(false), [])
  const stableBulkBackToProduct = useCallback(() => {
    setBulkMode(false)
    setPdpStep(1)
  }, [])

  // Stable props for the memoised <InputPanel/>. Handlers go through a
  // latest-ref so their identities stay constant (React.memo can then skip the
  // frequent canvas-interaction re-renders) while always invoking the freshest
  // closure. Inline-built data props are useMemo'd.
  const latestInputPanelHandlers = {
    onUploadFile: handleUploadFile,
    onReuseUpload: handleReuseUpload,
    onAddCartDesign: handleAddCartDesignFromCart,
    onAddText: handleAddText,
    onAddCurvedText: handleAddCurvedText,
    onRemoveSelectedImage: removeSelectedImage,
    onUpdateSelectedText: updateActiveText,
    onDeselectText: deselectActiveText,
  }
  const inputPanelHandlersRef = useRef(latestInputPanelHandlers)
  inputPanelHandlersRef.current = latestInputPanelHandlers
  const inputPanelProps = useMemo(
    () => ({
      onUploadFile: (file: File) => inputPanelHandlersRef.current.onUploadFile(file),
      onReuseUpload: (uploadId: string) =>
        inputPanelHandlersRef.current.onReuseUpload(uploadId),
      onAddCartDesign: (design: { id: string; name: string; url: string }) =>
        inputPanelHandlersRef.current.onAddCartDesign(design),
      onAddText: (input: {
        text: string
        color: string
        fontFamily: string
        letterSpacing: number
      }) => inputPanelHandlersRef.current.onAddText(input),
      onAddCurvedText: (input: { text: string; color: string; radius: number }) =>
        inputPanelHandlersRef.current.onAddCurvedText(input),
      onRemoveSelectedImage: () => inputPanelHandlersRef.current.onRemoveSelectedImage(),
      onUpdateSelectedText: (
        patch: Partial<{
          text: string
          color: string
          fontFamily: string
          letterSpacing: number
        }>
      ) => inputPanelHandlersRef.current.onUpdateSelectedText(patch),
      onDeselectText: () => inputPanelHandlersRef.current.onDeselectText(),
      onDeleteUpload: (uploadId: string) =>
        setSessionUploads((current) => current.filter((entry) => entry.id !== uploadId)),
    }),
    []
  )
  const inputPanelUploads = useMemo(
    () =>
      sessionUploads.map((entry) => ({
        id: entry.id,
        name: entry.name,
        previewUrl: entry.dataUrl,
        type: entry.type,
      })),
    [sessionUploads]
  )
  const inputPanelDisabledMessage = useMemo(
    () =>
      !isAdminProofMode && pdpHasVariantOptions && !pdpStep1Done
        ? {
            title: "Customize first",
            body: 'Tap "Customise this garment" above to start.',
          }
        : undefined,
    [isAdminProofMode, pdpHasVariantOptions, pdpStep1Done]
  )

  const sideLabel =
    currentSide === "left_sleeve"
      ? "Left Sleeve"
      : currentSide === "right_sleeve"
      ? "Right Sleeve"
      : currentSide === "printed_tag"
      ? "Printed Tag"
      : currentSide.charAt(0).toUpperCase() + currentSide.slice(1)

  const editorColumn = (
          <div className={assemblyLayout ? "flex flex-1 min-h-0 flex-col" : "space-y-4"}>
            <div className={assemblyLayout ? "flex flex-1 min-h-0 flex-col overflow-hidden bg-ui-bg-base" : "overflow-hidden rounded-2xl border border-ui-border-base bg-ui-bg-base shadow-sm"}>
              <div className={`flex flex-col px-4 py-3 small:flex-row small:items-center small:justify-between${assemblyLayout ? " py-2.5" : " border-b border-ui-border-base bg-ui-bg-subtle/40"}`}>
                <div className="flex items-start gap-3">
                  {!assemblyLayout && (
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-ui-fg-subtle">
                      Design preview
                    </p>
                    <p className="mt-0.5 text-sm text-ui-fg-base">
                      {selectedProduct?.title ? `Design your ${selectedProduct.title}` : "Design your product"}
                    </p>
                  </div>
                  )}
                  {!isAdminProofMode && pickerProducts && pickerProducts.length > 0 ? (
                    <CustomizerProductPicker
                      products={pickerProducts}
                      currentHandle={selectedProduct?.handle ?? null}
                      basePath={assemblyLayout ? "/customizer-v2" : "/customizer"}
                      hasUnsavedDesign={() => {
                        // Any side carrying objects = real design work the
                        // customer would lose by switching products.
                        return DESIGN_SIDES.some(
                          (side) => (sideLayoutsRef.current[side] ?? []).length > 0
                        )
                      }}
                    />
                  ) : null}
                </div>
                <div className="mt-2 flex items-center gap-3 small:mt-0">
                  {!isAdminProofMode && !assemblyLayout ? (
                    <p className="hidden text-xs text-ui-fg-subtle small:block">
                      Drag, resize and position your artwork.
                    </p>
                  ) : null}
                  {!isAdminProofMode && (
                  <DesignPreviewPopover
                    decoratedSides={decoratedSides}
                    canvasSize={canvasSize}
                    sideLayouts={sideLayoutsRef.current}
                    getGarmentUrlForSide={getGarmentUrlForSide}
                    layoutVersion={layoutVersion}
                    variantId={activeVariantId}
                  />
                  )}
                </div>
              </div>

              <div className={`flex flex-col lg:flex-row lg:items-stretch${assemblyLayout ? " flex-1 min-h-0" : ""}`}>
                {/* InputPanel (upload / add text / remove artwork) also shows in
                    admin proof mode so staff can add or replace artwork — e.g.
                    when a customer emails a revised file — not just reposition
                    the existing design. Still hidden in the v2 assembly layout. */}
                {!assemblyLayout && (
                <div
                  id="customizer-input-panel"
                  className="order-2 border-t border-ui-border-base bg-ui-bg-subtle/30 p-4 scroll-mt-20 lg:order-1 lg:w-[min(100%,280px)] lg:shrink-0 lg:border-r lg:border-t-0 lg:border-ui-border-base"
                >
                  <InputPanel
                    onUploadFile={inputPanelProps.onUploadFile}
                    uploads={inputPanelUploads}
                    onReuseUpload={inputPanelProps.onReuseUpload}
                    cartDesigns={cartArtworkDesigns}
                    onAddCartDesign={inputPanelProps.onAddCartDesign}
                    onAddText={inputPanelProps.onAddText}
                    onAddCurvedText={inputPanelProps.onAddCurvedText}
                    onRemoveSelectedImage={inputPanelProps.onRemoveSelectedImage}
                    canRemoveImage={canRemoveImage}
                    onDeleteUpload={inputPanelProps.onDeleteUpload}
                    enabled={isAdminProofMode || !embedded || (!pdpHasVariantOptions || pdpStep1Done)}
                    disabledMessage={inputPanelDisabledMessage}
                    selectedText={selectedTextSnapshot}
                    onUpdateSelectedText={inputPanelProps.onUpdateSelectedText}
                    onDeselectText={inputPanelProps.onDeselectText}
                    className="border-0 bg-transparent p-0"
                  />
                </div>
                )}

                <div className={assemblyLayout ? "order-1 flex flex-1 min-h-0 flex-col p-4 lg:order-2" : "order-1 min-h-[min(58vh,680px)] flex-1 p-4 small:p-5 lg:order-2"}>
                  <p className="mb-2 text-center text-xs font-semibold uppercase tracking-widest text-ui-fg-subtle">
                    Editing: {sideLabel}
                  </p>
                  <div className={assemblyLayout ? "relative isolate z-[1] flex flex-1 min-h-0 items-center justify-center" : "z-[1]"}>
                    {/* SC Prints watermark — overlaid ON TOP of the studio area
                        (page background + garment photo together), slightly
                        oversize so it spans past the photo edges uncut. Faint;
                        non-interactive. Unconditional per colour so every
                        product looks the same. Front/back only — the sleeve
                        line-drawings and zoomed tag view get too busy with it. */}
                    {assemblyLayout && (currentSide === "front" || currentSide === "back") && (
                      <img
                        src="/branding/scp-vector.svg"
                        alt=""
                        aria-hidden
                        draggable={false}
                        className="pointer-events-none absolute left-1/2 top-1/2 z-[2] h-[108%] w-auto max-w-none -translate-x-1/2 -translate-y-1/2 select-none opacity-[0.08]"
                      />
                    )}
                    {/* Brief "preparing" overlay while the Fabric canvas first
                        sizes itself on initial studio open — avoids a stark
                        blank/half-rendered flash. canvasSize stays > 0 after the
                        first mount (studio is kept mounted), so this only shows
                        once. */}
                    {assemblyLayout && canvasSize.width === 0 && (
                      <div
                        className="pointer-events-none absolute inset-0 z-[3] flex items-center justify-center bg-ui-bg-base"
                        aria-hidden
                      >
                        <div className="flex flex-col items-center gap-3 text-ui-fg-subtle">
                          <span className="h-8 w-8 animate-spin rounded-full border-2 border-ui-border-strong border-t-transparent" />
                          <span className="text-xs">Preparing your studio…</span>
                        </div>
                      </div>
                    )}
                    <CanvasStage
                      tintColor={variantTintHex}
                      garmentImage={garmentImageUrl}
                      garmentImageFallbacks={garmentImageFallbacks}
                      garmentTitle={garmentDisplayTitle}
                      printSideKey={currentSide}
                      printArea={printArea}
                      outOfBoundsWarning={outOfBoundsWarning}
                      dpiWarning={dpiWarning}
                      sizeWarning={screenSizeWarning}
                      fabricContainerRef={fabricContainerRef}
                      frameClassName={
                        assemblyLayout
                          ? "mx-auto aspect-[4/5] h-full max-h-full w-auto max-w-full rounded-xl"
                          : undefined
                      }
                    />
                  </div>
                </div>
              </div>
            </div>

            {vectorizationRequested && (
              <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-medium text-emerald-900">
                    Vectorization service requested
                  </p>
                  <p className="text-xs text-emerald-800 mt-0.5">
                    Added to your cart at checkout. Our team will redraw your artwork sharp for print.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    void handleRemoveVectorization()
                  }}
                  disabled={isRemovingVectorization}
                  className="text-xs text-emerald-800 hover:text-emerald-900 underline self-start disabled:opacity-60"
                >
                  {isRemovingVectorization ? "Removing…" : "Remove"}
                </button>
              </div>
            )}
            {uploadError && (
              <p className="text-sm text-rose-600" role="alert">
                {uploadError}
              </p>
            )}
            {statusMessage && <p className="text-sm text-emerald-700">{statusMessage}</p>}
            {/* Reorder / saved-design re-edit: when an original upload can't be
                reloaded from storage (GC'd R2 object), warn the customer right
                under the canvas so they don't re-order with the print missing.
                The edit-group flow surfaces its own copy inside the "Save design
                changes" box, so only render here when NOT in that flow. */}
            {!editGroupId && hydrationPlaceholderSides.length > 0 && (
              <div className="rounded-md border border-rose-300 bg-rose-50 px-2.5 py-2 text-xs text-rose-900" role="alert">
                <p className="font-semibold">⚠️ Some artwork didn't reload</p>
                <p className="mt-1">
                  The original upload for{" "}
                  <span className="font-semibold">
                    {hydrationPlaceholderSides.join(", ")}
                  </span>{" "}
                  appears to be missing from storage. Switch to that side and
                  re-upload it via <span className="font-semibold">Add to design</span>{" "}
                  before checking out, so the print isn't lost.
                </p>
              </div>
            )}
          </div>
  )

  if (embedded && integratedPdpSlots) {
    // Guided wizard: steps reveal one at a time and collapse to a summary
    // chip with a "Change" link once completed. Mirrors the reference
    // /Customizer.mov flow.
    const hasStep1 = showPdpLabeledOptionsStep
    // `allowedPrintSides` is hoisted to the component body so the standalone
    // rail can share it; here we just react to the customer landing on a
    // disallowed side (e.g. via a stale `?side=back` querystring on a hat).
    if (!allowedPrintSides.includes(currentSide)) {
      // Snap back to a valid side without blocking render.
      Promise.resolve().then(() => switchSide("front"))
    }
    const stepOffset = hasStep1 ? 0 : 1 // when no variant options, renumber 1->location
    const stepNum = (n: number) => n - stepOffset
    const printSizeLabel =
      SCP_PRINT_SIZE_OPTIONS.find((opt) => opt.id === scpPrintSizeId)?.label ?? "Size"

    const StepHeader = ({
      num,
      title,
      done,
      onChange,
      badge,
      active,
      help,
      assemblyOpen,
      onToggle,
      assemblyNum,
    }: {
      num: number
      title: string
      done: boolean
      onChange?: () => void
      badge?: string
      active?: boolean
      help?: string
      assemblyOpen?: boolean
      onToggle?: () => void
      /** Display-order ordinal shown (zero-padded) in the studio header. */
      assemblyNum?: number
    }) => {
      // Assembly layout: the whole header row is a toggle with a chevron, so
      // any section can be collapsed/expanded at any time (no inline help
      // tooltip here — a nested <button> is invalid; the top-bar guide covers
      // help).
      if (assemblyLayout) {
        return (
          <button
            type="button"
            onClick={onToggle}
            aria-expanded={!!assemblyOpen}
            className="flex w-full flex-col items-start gap-2.5 text-left"
          >
            <span
              className="flex h-7 w-7 items-center justify-center rounded-lg bg-ui-bg-subtle text-base leading-none text-ui-fg-subtle"
              aria-hidden
            >
              {assemblyOpen ? "✕" : done ? "✎" : "+"}
            </span>
            <span className="flex min-w-0 flex-col pr-12">
              <span className="truncate text-[15px] font-semibold text-ui-fg-base">
                {title}
              </span>
              {badge && (
                <span className="mt-0.5 truncate text-xs font-normal text-ui-fg-subtle">
                  {badge}
                </span>
              )}
            </span>
            {assemblyNum != null && (
              <span
                className="pointer-events-none absolute -top-3 -right-1 select-none text-[5rem] font-black leading-none tracking-tighter text-ui-fg-base"
                aria-hidden
              >
                {String(assemblyNum).padStart(2, "0")}
              </span>
            )}
          </button>
        )
      }
      return (
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <span
              className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold ${
                done
                  ? "bg-emerald-100 text-emerald-700"
                  : active
                  ? "bg-ui-fg-base text-white"
                  : "bg-ui-bg-base text-ui-fg-subtle ring-1 ring-ui-border-base"
              }`}
              aria-hidden
            >
              {done ? "✓" : num}
            </span>
            <h3 className="text-sm font-semibold uppercase tracking-wide text-ui-fg-base truncate">
              {title}
            </h3>
            {badge && (
              <span className="shrink-0 rounded-full bg-ui-bg-base-hover px-2 py-0.5 text-[11px] font-medium text-ui-fg-base ring-1 ring-ui-border-base">
                {badge}
              </span>
            )}
            {help && <HelpTip text={help} />}
          </div>
          {!active && onChange ? (
            <button
              type="button"
              className="text-xs font-medium text-ui-fg-interactive hover:underline"
              onClick={onChange}
            >
              Change
            </button>
          ) : null}
        </div>
      )
    }

    // Dimmed, clickable preview card for steps the customer hasn't reached
    // yet. Clicking advances `pdpStep` directly so the customer can jump
    // ahead — earlier steps stay accessible via the "Change" link on their
    // collapsed summary.
    const StepPreview = ({
      num,
      title,
      hint,
      onClick,
      isNext,
    }: {
      num: number
      title: string
      hint: string
      onClick: () => void
      isNext?: boolean
    }) => (
      <button
        type="button"
        onClick={onClick}
        className={`w-full rounded-xl border p-4 text-left transition ${
          isNext
            ? "border-ui-border-strong bg-ui-bg-subtle hover:border-ui-fg-base hover:bg-ui-bg-subtle hover:shadow-sm"
            : "border-dashed border-ui-border-base bg-ui-bg-subtle/30 opacity-60 hover:border-ui-border-strong hover:opacity-90"
        }`}
      >
        <div className="flex items-center gap-2">
          <span
            className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold ${
              isNext
                ? "bg-ui-bg-base text-ui-fg-base ring-1 ring-ui-border-strong"
                : "bg-ui-bg-base text-ui-fg-muted ring-1 ring-ui-border-base"
            }`}
            aria-hidden
          >
            {num}
          </span>
          <h3 className={`text-sm font-semibold uppercase tracking-wide truncate ${isNext ? "text-ui-fg-base" : "text-ui-fg-subtle"}`}>
            {title}
          </h3>
          {isNext && <span aria-hidden className="ml-auto text-xs font-medium text-ui-fg-interactive">Next →</span>}
          {!isNext && <span aria-hidden className="ml-auto text-ui-fg-muted">›</span>}
        </div>
        <p className={`mt-1.5 pl-7 text-xs ${isNext ? "text-ui-fg-subtle" : "text-ui-fg-muted"}`}>{hint}</p>
      </button>
    )

    // Assembly layout: a collapsed section row (title + status + chevron) shown
    // in place of the full card when the section isn't expanded. Clicking it
    // expands the section (and jumps the underlying wizard step so the full UI
    // inside renders).
    const AssemblyCollapsedHeader = ({
      num,
      title,
      status,
      done,
      onExpand,
      assemblyNum,
    }: {
      num?: number | string
      title: string
      status?: string
      done?: boolean
      onExpand: () => void
      /** Display-order ordinal shown (zero-padded) in the studio header. */
      assemblyNum?: number
    }) => (
      <button
        type="button"
        onClick={onExpand}
        aria-expanded={false}
        className="relative flex w-full flex-col items-start gap-2.5 overflow-hidden rounded-2xl border border-ui-border-base bg-ui-bg-base px-5 py-4 text-left transition hover:border-ui-border-strong"
      >
        <span
          className="flex h-7 w-7 items-center justify-center rounded-lg bg-ui-bg-subtle text-base leading-none text-ui-fg-subtle"
          aria-hidden
        >
          {done ? "✎" : "+"}
        </span>
        <span className="flex min-w-0 flex-col pr-12">
          <span className="truncate text-[15px] font-semibold text-ui-fg-base">
            {title}
          </span>
          {status ? (
            <span className="mt-0.5 truncate text-xs font-normal text-ui-fg-subtle">
              {status}
            </span>
          ) : null}
        </span>
        {assemblyNum != null && (
          <span
            className="pointer-events-none absolute -top-3 -right-1 select-none text-[5rem] font-black leading-none tracking-tighter text-ui-fg-base"
            aria-hidden
          >
            {String(assemblyNum).padStart(2, "0")}
          </span>
        )}
      </button>
    )

    const expandAssemblySection = (n: 1 | 2 | 3 | 4) => {
      setAssemblyExpanded(n)
      setAssemblyArtworkOpen(false)
      setPdpStep(n)
    }

    // Print-size body, extracted so it can be reused in BOTH the legacy
    // non-assembly Step 3 card AND the merged assembly "Print location & size"
    // section. `full` selects the editing UI (method picker + embroidery config
    // + size tiles) vs. the collapsed summary line. Closes over all the
    // component state it needs (in scope here).
    const renderPrintSizeBody = (full: boolean) =>
      full ? (
        <>
          {/* Per-side method picker — always visible here so the
              customer can switch a side between print and embroidery
              after the initial position setup (e.g. front=print at
              first, then change back=embroidery without re-opening
              the print-positions step). */}
          <div className="rounded-md border border-ui-border-base bg-ui-bg-base px-3 py-2">
            <div className="mb-1.5 flex items-center justify-between gap-2">
              <span className="text-[11px] font-semibold uppercase tracking-wide text-ui-fg-subtle">
                Decoration method · {sideLabel}
              </span>
            </div>
            <DecorationMethodPicker
              side={currentSide}
              value={
                sideDecorationMethods[currentSide] ??
                availableMethodsForCurrentSide[0] ??
                "print"
              }
              availableMethods={availableMethodsForCurrentSide}
              onChange={(side, method) => {
                setSideDecorationMethods((prev) => ({ ...prev, [side]: method }))
                if (method !== "embroidery") {
                  setSideEmbroideryConfigs((prev) => {
                    const next = { ...prev }
                    delete next[side]
                    return next
                  })
                }
                if (method !== "screen") {
                  setSideScreenConfigs((prev) => {
                    const next = { ...prev }
                    delete next[side]
                    return next
                  })
                }
                if (method === "embroidery" || method === "screen") {
                  // Neither method uses the DTF print-size step — mark the
                  // side sized so the upload panel + Step 3 unlock.
                  setSizingDoneSides((prev) => ({ ...prev, [side]: true }))
                  if (method === "screen" && !sideScreenConfigs[side]) {
                    setSideScreenConfigs((prev) => ({
                      ...prev,
                      [side]: {
                        side,
                        colours: 1,
                        coloursAuto: true,
                        darkGarment: garmentIsDark,
                      },
                    }))
                  }
                } else {
                  setSizingDoneSides((prev) => {
                    const next = { ...prev }
                    delete next[side]
                    return next
                  })
                  // Re-prompt for print size since we just reverted to print.
                  setScpPrintSizeChosen(false)
                }
              }}
            />
          </div>
          {sideDecorationMethods[currentSide] === "embroidery" ? (
            <EmbroiderySideConfig
              // Remount per side: the component seeds its mm/stitch
              // inputs from `value` on mount only, so without a per-side
              // key it would show (and persist) the previous side's
              // values when switching garment sides.
              key={currentSide}
              side={currentSide}
              value={sideEmbroideryConfigs[currentSide]}
              onChange={(side, next) => {
                setSideEmbroideryConfigs((prev) => ({ ...prev, [side]: next }))
              }}
              getArtworkDataUrl={getCurrentSideArtworkDataUrl}
            />
          ) : sideDecorationMethods[currentSide] === "screen" ? (
            <ScreenSideConfig
              // Remount per side so preview/AI request state resets cleanly.
              key={currentSide}
              side={currentSide}
              value={sideScreenConfigs[currentSide]}
              onChange={(side, next) => {
                setSideScreenConfigs((prev) => ({ ...prev, [side]: next }))
              }}
              totalQuantity={totalQty}
              heavyGarment={screenHeavyGarment}
              estimate={sideScreenEstimates[currentSide] ?? null}
              getArtworkDataUrl={getCurrentSideFullArtworkDataUrl}
            />
          ) : allowedSizesForCurrentSide.length === 1 &&
            allowedSizesForCurrentSide[0] === "up_to_a6" ? (
            <p className="rounded-md bg-ui-bg-subtle/70 px-2.5 py-1.5 text-xs text-ui-fg-subtle">
              <span className="font-semibold text-ui-fg-base">{sideLabel}</span> prints
              are limited to A6 (10×15 cm) — only one size is available for this location.
            </p>
          ) : (currentSide === "left_sleeve" || currentSide === "right_sleeve") &&
            productIsLongSleeve ? (
            <p className="rounded-md bg-ui-bg-subtle/70 px-2.5 py-1.5 text-xs text-ui-fg-subtle">
              <span className="font-semibold text-ui-fg-base">{sideLabel}</span> prints on
              long-sleeve garments can go up to A3 (29×42 cm).
            </p>
          ) : null}
          {sideDecorationMethods[currentSide] === "embroidery" ||
          sideDecorationMethods[currentSide] === "screen" ? null : (
            <div className="grid grid-cols-2 gap-2">
              {SCP_PRINT_SIZE_OPTIONS.filter((opt) =>
                allowedSizesForCurrentSide.includes(opt.id)
              ).map((opt) => {
                // Show the price the customer will *actually* pay at their
                // current quantity (highest 1-9 tier if no qty set yet) —
                // not the cheapest 100+ tier. The bulk discount drops it
                // further at higher qty, communicated via the bulk-tier
                // panel below.
                const matrixRow = SCP_PRINT_UNIT_MATRIX[opt.id]
                const tierIdx = resolveScpTierIndexForQuantity(totalQty)
                const currentPrice = matrixRow[tierIdx]
                const bestPrice = matrixRow[matrixRow.length - 1]
                const showsDiscountHint = currentPrice > bestPrice
                const selected = scpPrintSizeChosen && scpPrintSizeId === opt.id
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => {
                      setScpPrintSizeId(opt.id)
                      setScpPrintSizeChosen(true)
                      setSizingDoneSides((prev) => ({ ...prev, [currentSide]: true as const }))
                      setPdpStep((s) => (s > 3 ? s : 4))
                      // Studio momentum: picking a size moves the accordion to
                      // the next logical section — quantity if a location is
                      // already decorated, otherwise Artwork to place the print.
                      if (assemblyLayout) {
                        const hasDecorated = decoratedSides.some((s) =>
                          allowedPrintSides.includes(s)
                        )
                        if (hasDecorated) {
                          setAssemblyArtworkOpen(false)
                          setAssemblyExpanded(4)
                        } else {
                          setAssemblyExpanded(null)
                          setAssemblyArtworkOpen(true)
                        }
                      }
                    }}
                    className={`relative flex flex-col items-start gap-0.5 rounded-lg border p-2.5 text-left transition-colors ${
                      selected
                        ? "border-ui-border-interactive bg-ui-bg-base-pressed"
                        : "border-ui-border-base bg-ui-bg-base hover:bg-ui-bg-subtle"
                    }`}
                  >
                    {selected && (
                      <span
                        aria-hidden
                        className="absolute right-2 top-2 flex h-4 w-4 items-center justify-center rounded-full bg-emerald-100 text-[10px] font-bold text-emerald-700"
                      >
                        ✓
                      </span>
                    )}
                    <span className="text-sm font-semibold text-ui-fg-base">
                      {opt.label}
                    </span>
                    <span className="text-[11px] text-ui-fg-subtle">
                      {opt.dimensionsLabel}
                    </span>
                    <span className="text-[11px] text-ui-fg-muted">
                      ${currentPrice.toFixed(2)} ea
                      {showsDiscountHint
                        ? ` · drops to $${bestPrice.toFixed(2)} at 100+`
                        : ""}
                    </span>
                  </button>
                )
              })}
            </div>
          )}
        </>
      ) : (
        <div className="space-y-2">
          <div className="flex items-baseline justify-between gap-2 rounded-lg bg-ui-bg-subtle/60 px-2.5 py-2">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-ui-fg-base">{printSizeLabel}</p>
              <p className="text-[11px] text-ui-fg-muted">
                {SCP_PRINT_SIZE_OPTIONS.find((o) => o.id === scpPrintSizeId)?.dimensionsLabel}
              </p>
            </div>
            <p className="shrink-0 text-sm font-semibold text-ui-fg-base">
              $
              {SCP_PRINT_UNIT_MATRIX[scpPrintSizeId][
                resolveScpTierIndexForQuantity(totalQty)
              ].toFixed(2)}{" "}
              <span className="text-[11px] font-normal text-ui-fg-subtle">ea / location</span>
            </p>
          </div>
        </div>
      )

    // Bulk-order grid takes over the viewport when active — design stays
    // intact in canvas state, so closing the grid drops the customer back
    // exactly where they were. The grid produces one (variant × size) cell
    // per filled qty; each becomes its own cart line via the existing
    // `addCustomizedToCart` path with the `bulkCells` argument.
    // POA quote modal — shared between the main layout and the bulk-grid
    // overlay (the bulk branch returns early, so the modal must render there
    // too or the gate would open it into nothing).
    const poaSidesForDisplay = decoratedSides.filter(
      (side) =>
        sideDecorationMethods[side] === "embroidery" &&
        (sideEmbroideryConfigs[side]?.stitchCount ?? 0) >
          MAX_AUTO_PRICED_STITCHES
    )
    const poaQuoteModalNode = (
      <PoaQuoteModal
        open={poaModalOpen}
        initialEmail={customerEmail}
        poaSides={poaSidesForDisplay.map((side) => ({
          side,
          stitchCount: sideEmbroideryConfigs[side]?.stitchCount ?? 0,
        }))}
        onClose={() => setPoaModalOpen(false)}
        onSubmit={(contact) => {
          poaContactRef.current = contact
          setPoaModalOpen(false)
          void addCustomizedToCart(poaPendingCellsRef.current ?? undefined)
        }}
      />
    )

    if (bulkMode && selectedProduct && selectedVariant) {
      // Prop-building consts are lifted to the component top level (see
      // bulkPrintThumbSources / stableHandleBulkSubmit etc.) so they have
      // stable identities for the memoised <BulkOrderGrid/>.
      return (
        <div className="fixed inset-0 z-[60] overflow-hidden bg-white" data-studio-sublayer>
          <BulkOrderGrid
            product={selectedProduct}
            baseVariant={selectedVariant}
            defaultGarmentImage={defaultGarmentImage}
            currencyCode={currencyCode}
            isSubmitting={isSubmitting}
            printThumbSource={bulkPrintArtifactForThumb}
            printThumbSources={bulkPrintThumbSources}
            estimatePricingForTotal={stableEstimatePricingForTotal}
            onClose={stableBulkClose}
            onBackToProduct={stableBulkBackToProduct}
            onSubmit={stableHandleBulkSubmit}
            initialCells={
              editGroupCells.length > 0 ? editGroupCells : undefined
            }
            submitCtaLabel={
              editGroupId
                ? `Save design (${editGroupLineIds.length} cart line${
                    editGroupLineIds.length === 1 ? "" : "s"
                  })`
                : undefined
            }
            editMode={!!editGroupId}
            editingLineCount={editGroupLineIds.length}
            editingTotalQuantity={editGroupCells.reduce(
              (sum, c) => sum + (c.quantity ?? 0),
              0
            )}
          />
          {poaQuoteModalNode}
        </div>
      )
    }

    return (
      <div id="customize" className="contents">
        {/*
          Studio (assembly) toast: surfaces upload / add-to-cart errors and
          success messages as a fixed overlay banner. In the two-column studio
          the inline message (rendered down in the canvas column) is off-screen
          when the customer is acting in the right-hand panel — so a failed "Add
          to cart" looked like a dead button. This mirrors it where they're
          looking. Safe-area aware; dismissable.
        */}
        {assemblyLayout && (uploadError || statusMessage) ? (
          <div
            className="pointer-events-none fixed inset-x-3 bottom-3 z-[210] flex justify-center"
            style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
          >
            <div
              role="alert"
              aria-live="assertive"
              className={`pointer-events-auto flex max-w-md items-start gap-3 rounded-xl px-4 py-3 text-sm shadow-lg ring-1 ${
                uploadError
                  ? "bg-rose-50 text-rose-800 ring-rose-200"
                  : "bg-emerald-50 text-emerald-800 ring-emerald-200"
              }`}
            >
              <span className="flex-1 leading-snug">{uploadError || statusMessage}</span>
              <button
                type="button"
                onClick={() => {
                  setUploadError(null)
                  setStatusMessage(null)
                }}
                aria-label="Dismiss message"
                className="-mr-1 -mt-1 shrink-0 rounded p-1 text-base leading-none opacity-60 transition-opacity hover:opacity-100"
              >
                ✕
              </button>
            </div>
          </div>
        ) : null}
        {/*
          Column order is swapped on mobile via Tailwind `order-*` so the
          customer sees the Customize and checkout wizard (with the
          prominent "Customize this product" CTA in step 1) above the
          gallery / canvas. Desktop keeps the original side-by-side
          layout (col-span sits on lg, where order-* is reset to none).
        */}
        <div className={
          assemblyLayout
            // Mobile/tablet (below small:=1024) stacks flex-col: pin the canvas
            // to a fixed share of the viewport (basis-[46vh], no grow/shrink) so
            // it can't be starved to ~0 by the section panel below it. Desktop
            // (small:flex-row) restores flex-1 + full height.
            ? "flex min-w-0 flex-col min-h-0 overflow-hidden bg-ui-bg-base p-3 small:p-4 basis-[46dvh] [@media(max-height:520px)]:basis-[40dvh] grow-0 shrink-0 small:basis-0 small:grow small:shrink small:h-full"
            : `order-2 lg:order-none flex min-w-0 flex-col gap-4 lg:sticky lg:top-24 lg:self-start transition-[grid-column] duration-300 ease-in-out ${
                isCustomizing ? "lg:col-span-7 lg:max-h-[calc(100vh-6rem)] lg:overflow-y-auto" : "lg:col-span-8"
              }`
        }>
          {showSideNudge && (
            <div className="flex items-center gap-2 rounded-lg bg-ui-bg-subtle/90 px-3 py-2 text-xs text-ui-fg-base ring-1 ring-ui-border-base">
              <span className="shrink-0 text-ui-fg-muted" aria-hidden>✏</span>
              Now designing <strong className="mx-0.5">{sideLabel}</strong> — upload artwork in the panel below.
            </div>
          )}

          {editorColumn}

          {/* Below-canvas "Add print to another location" — visible whenever
              there are unused sides. Disabled (greyed) until the customer has
              placed artwork on the canvas; size can be picked later. Lives
              under the canvas so the design surface stays the focal point;
              this prompt only matters once the customer's eye drops below
              the artwork. Suppressed in the studio (assembly), which has its
              own single in-panel "Add print to another location" button — two
              identical CTAs is confusing. */}
          {!assemblyLayout && isCustomizing && allowedPrintSides.length > 1 && (() => {
            const undecoratedAllowed = allowedPrintSides.filter(
              (s) => !decoratedSides.includes(s)
            )
            if (!undecoratedAllowed.length) return null
            const nextUndecoratedSide = undecoratedAllowed[0]
            const nextUndecoratedLabel =
              nextUndecoratedSide === "left_sleeve" ? "Left Sleeve"
              : nextUndecoratedSide === "right_sleeve" ? "Right Sleeve"
              : nextUndecoratedSide === "printed_tag" ? "Printed Tag"
              : nextUndecoratedSide.charAt(0).toUpperCase() + nextUndecoratedSide.slice(1)
            const canAddLocation =
              decoratedSides.filter((s) => allowedPrintSides.includes(s)).length > 0
            return (
              <button
                type="button"
                disabled={!canAddLocation}
                title={
                  !canAddLocation
                    ? "Add artwork to the current location first"
                    : undefined
                }
                onClick={() => {
                  if (!canAddLocation) return
                  // Don't auto-pick the next side — open the print
                  // location & size selector (Step 2) and let the
                  // customer choose which location to add. Auto-switching
                  // made the button behave differently at each stage and
                  // do nothing once every side had been auto-picked.
                  if (assemblyLayout) {
                    setAssemblyExpanded(2)
                  } else {
                    setPdpStep(2)
                  }
                  step2Ref.current?.scrollIntoView({ behavior: "smooth", block: "start" })
                }}
                className={`w-full rounded-xl border-2 border-dashed px-4 py-2.5 text-left text-sm font-medium transition-colors ${
                  canAddLocation
                    ? "border-fuchsia-500 text-ui-fg-base hover:border-fuchsia-600 hover:bg-fuchsia-50"
                    : "cursor-not-allowed border-ui-border-base text-ui-fg-muted opacity-40"
                }`}
              >
                + Add print to another location
                <span className="ml-1.5 text-xs font-normal opacity-70">
                  (e.g. {nextUndecoratedLabel})
                </span>
              </button>
            )
          })()}
        </div>
        <div className={
          assemblyLayout
            // Mobile/tablet: the panel takes the height the fixed canvas leaves
            // (grow/shrink + min-h-0) and scrolls internally, instead of
            // shrink-0 + h-full which claimed the whole column and squished the
            // canvas. Desktop: fixed-width, full-height side panel as before.
            ? "flex w-full small:w-[400px] lg:w-[420px] flex-col border-t border-ui-border-base bg-ui-bg-subtle overflow-hidden min-h-0 grow shrink basis-0 small:grow-0 small:shrink-0 small:basis-auto small:h-full small:border-t-0 small:border-l"
            : `order-1 lg:order-none flex min-w-0 flex-col gap-2 self-start lg:sticky lg:top-24 lg:pr-1 lg:max-h-[calc(100vh-6rem)] lg:overflow-y-auto transition-[grid-column] duration-300 ease-in-out ${
                isCustomizing ? "lg:col-span-5" : "lg:col-span-4"
              }`
        }>
          {assemblyLayout && (
            <div className="flex items-center justify-between gap-2 border-b border-ui-border-base px-4 py-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-ui-fg-base">
                  {selectedProduct?.title ?? "Customise"}
                </p>
                <p className="text-[11px] uppercase tracking-wide text-ui-fg-subtle">
                  SC Prints Studio
                </p>
              </div>
              {!isAdminProofMode ? (
                <CustomizerGuide
                  pdpStep={pdpStep}
                  hasStep1={hasStep1}
                  assemblyLayout
                  stepRefs={{ step1: step1Ref, step2: step2Ref, step3: step3Ref, step4: step4Ref }}
                  showTriggerPulse={showGuidePulse}
                  onFocusStep={(n) => {
                    // Open the accordion section this guide step highlights so
                    // its ref mounts: 1=colour, 2=location+size, 4=quantity all
                    // ride assemblyExpanded; 3=Artwork is its own toggle.
                    if (n === 3) {
                      setAssemblyExpanded(null)
                      setAssemblyArtworkOpen(true)
                    } else {
                      setAssemblyArtworkOpen(false)
                      setAssemblyExpanded(n)
                    }
                  }}
                />
              ) : null}
            </div>
          )}
          <div
            className={assemblyLayout ? "flex flex-1 flex-col gap-3 overflow-y-auto px-4 pt-5 [&>*]:shrink-0 scroll-pb-24" : "contents"}
            style={
              assemblyLayout
                ? { paddingBottom: "calc(2rem + env(safe-area-inset-bottom))" }
                : undefined
            }
          >
          {!isAdminProofMode && !assemblyLayout && (
          <div className="space-y-1 border-b border-ui-border-base pb-3">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-xl font-semibold text-ui-fg-base">Customize and checkout</p>
                <p className="text-xs text-ui-fg-subtle">We'll guide you through each step.</p>
              </div>
              {embedded ? (
                <CustomizerGuide
                  pdpStep={pdpStep}
                  hasStep1={hasStep1}
                  stepRefs={{ step1: step1Ref, step2: step2Ref, step3: step3Ref, step4: step4Ref }}
                  showTriggerPulse={showGuidePulse}
                />
              ) : null}
            </div>
          </div>
          )}

          {isAdminProofMode ? (
            <div className="space-y-3 rounded-xl border-2 border-blue-400 bg-blue-50 p-4">
              <p className="text-sm font-semibold text-blue-900">Admin proof mode</p>
              <p className="text-xs text-blue-800">
                Adjust the artwork position and size, then click <strong>Save Proof</strong> to composite the mockup and send it back to the order.
              </p>
              {adminProofError ? (
                <p className="text-xs text-red-700 font-medium">{adminProofError}</p>
              ) : null}
              <button
                type="button"
                disabled={adminProofSaving}
                onClick={handleSaveProof}
                className="w-full rounded-xl bg-blue-600 px-4 py-3 text-sm font-bold text-white shadow-md hover:bg-blue-700 active:scale-[0.99] disabled:opacity-60"
              >
                {adminProofSaving ? "Saving proof…" : "Save Proof"}
              </button>
            </div>
          ) : null}

          {isQuoteMode ? (
            <div className="space-y-2 rounded-xl border-2 border-violet-500 bg-violet-50 p-3 text-violet-900 shadow-[0_0_0_3px_rgba(139,92,246,0.18)]">
              <p className="text-sm font-semibold">🎨 Designing for a quote</p>
              <p className="text-xs rounded-md bg-violet-100 px-2 py-1.5 ring-1 ring-violet-200">
                Set your print locations and artwork, choose sizes, then tap{" "}
                <span className="font-semibold">Add design to quote</span>{" "}
                below. This builds a mockup and saves it to the quote — the
                customer will see it to approve. Close this window when you're
                done.
              </p>
            </div>
          ) : null}

          {editGroupId ? (
            <div className="space-y-2 rounded-xl border-2 border-amber-500 bg-amber-50 p-3 text-amber-900 shadow-[0_0_0_3px_rgba(245,158,11,0.18)]">
              <p className="text-sm font-semibold">
                ✏️ Editing design across your cart
              </p>
              <p className="text-xs rounded-md bg-amber-100 px-2 py-1.5 ring-1 ring-amber-200">
                You're updating the design on{" "}
                <span className="font-semibold">
                  {editGroupLineIds.length} cart line
                  {editGroupLineIds.length === 1 ? "" : "s"}
                </span>
                {editGroupCells.length > 0 ? (
                  <>
                    {" "}
                    (
                    {editGroupCells.reduce(
                      (sum, c) => sum + (c.quantity ?? 0),
                      0
                    )}{" "}
                    garments)
                  </>
                ) : null}
                . Adjust artwork or text, then tap{" "}
                <span className="font-semibold">Save design changes</span>{" "}
                below to update the cart. No new items will be added.
              </p>
              <button
                type="button"
                onClick={() => {
                  setEditGroupId(null)
                  setEditGroupHydrated(false)
                  setEditGroupInitialCells([])
                  setEditGroupCells([])
                  setEditGroupLineIds([])
                  setBulkMode(false)
                  if (typeof window !== "undefined") {
                    const url = new URL(window.location.href)
                    url.searchParams.delete("edit_group")
                    window.history.replaceState({}, "", url.toString())
                    router.push(`/${countryCode}/cart`)
                  }
                }}
                className="text-xs font-medium text-amber-900 underline underline-offset-2 hover:text-amber-700"
              >
                Cancel — back to cart without changes
              </button>
            </div>
          ) : null}
          {editLineItemId ? (
            <div className="space-y-2 rounded-xl border-2 border-fuchsia-500 bg-amber-50 p-3 text-amber-900 shadow-[0_0_0_3px_rgba(217,70,239,0.18)]">
              <p className="text-sm font-semibold">
                Editing {editingProductTitle ?? "your cart item"}
                {editingPreviousQty ? ` × ${editingPreviousQty}` : ""}
              </p>
              {editingGroupSiblingCount > 1 ? (
                <p className="text-xs rounded-md bg-amber-100 px-2 py-1.5 ring-1 ring-amber-200">
                  <span className="font-semibold">Group edit:</span> this design is
                  shared across <span className="font-semibold">{editingGroupSiblingCount}</span>{" "}
                  cart lines ({editingGroupTotalQty} garments total). Your changes here
                  will apply to <span className="font-semibold">all</span> of them.
                </p>
              ) : null}
              <p className="text-xs">
                Quantities, notes and print size are pre-filled. Update them, then tap{" "}
                <span className="font-semibold">Update cart</span> — the original cart line will
                be replaced.
              </p>
              {editingPreviousSides.length > 0 ? (
                <p className="text-xs">
                  <span className="font-semibold">Previous artwork:</span>{" "}
                  {editingPreviousSides
                    .map((s) =>
                      s === "left_sleeve"
                        ? "Left Sleeve"
                        : s === "right_sleeve"
                        ? "Right Sleeve"
                        : s === "printed_tag"
                        ? "Printed Tag"
                        : s.charAt(0).toUpperCase() + s.slice(1)
                    )
                    .join(", ")}
                  {" — "}re-upload via the design preview to keep these prints.
                </p>
              ) : null}
              <button
                type="button"
                onClick={() => {
                  setEditLineItemId(null)
                  setEditingHydrated(false)
                  setEditingProductTitle(null)
                  setEditingPreviousSides([])
                  setEditingPreviousQty(0)
                  setEditingGroupSiblingCount(0)
                  setEditingGroupTotalQty(0)
                  if (typeof window !== "undefined") {
                    const url = new URL(window.location.href)
                    url.searchParams.delete("edit")
                    window.history.replaceState({}, "", url.toString())
                  }
                }}
                className="text-xs font-medium text-amber-900 underline underline-offset-2 hover:text-amber-700"
              >
                Cancel edit (keep original line)
              </button>
            </div>
          ) : null}

          {/* Step 1 — Product options (color/etc.). Hidden in edit-group
              mode because the customer is editing a design across many
              variants — picking "the" variant doesn't apply. The inline
              variant list below Step 4 is where they manage the mix.
              Also hidden in admin proof mode — admin already has the
              variant from URL params and only needs to save the proof. */}
          {hasStep1 && !editGroupId && !isAdminProofMode ? (
            <div ref={step1Ref} className={
              assemblyLayout
                ? "relative space-y-4 overflow-hidden rounded-2xl border border-ui-border-base bg-ui-bg-base p-5 shadow-sm"
                : `space-y-3 rounded-xl border p-4 ${
                    pdpStep === 1
                      ? "border-ui-fg-base bg-ui-bg-base shadow-sm"
                      : "border-ui-border-base bg-ui-bg-subtle/40"
                  }`
            }>
              <StepHeader
                num={1}
                assemblyNum={1}
                title="Product options"
                done={pdpStep1Done && pdpStep > 1}
                active={pdpStep === 1}
                onChange={() => setPdpStep(1)}
                assemblyOpen={assemblyExpanded === 1}
                onToggle={() => {
                  // Keep one section open at a time — closing Artwork (its own
                  // toggle) when section 01 opens avoids two expanded panels.
                  setAssemblyArtworkOpen(false)
                  setAssemblyExpanded((p) => (p === 1 ? null : 1))
                }}
                help="Pick your colour and any other options, then tap 'Customise this garment' to open the design tool."
              />
              {(assemblyLayout ? assemblyExpanded === 1 : pdpStep === 1) ? (
                <>
                  {/* Fade-slide the colour/size pickers in on expand so section
                      01 matches the mount animation of the other sections. */}
                  <motion.div
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1], delay: 0.05 }}
                  >
                    {integratedPdpSlots.variantPickers}
                  </motion.div>
                  {/* The "Customise this garment" CTA only exists in the legacy
                      non-assembly wizard, where it gates Step 1. In the studio
                      the sections are freely navigable, so it's removed. */}
                  {!assemblyLayout && (
                    <>
                      <button
                        type="button"
                        className="group relative flex w-full items-center justify-center gap-2 overflow-hidden rounded-xl bg-[var(--brand-primary,#1e293b)] px-4 py-4 text-base font-bold uppercase tracking-wide text-white shadow-md ring-1 ring-black/5 transition-all hover:brightness-110 hover:scale-[1.01] active:scale-[0.99]"
                        onClick={() => {
                          setPdpStep1Done(true)
                          setPdpStep((s) => (s > 1 ? s : 2))
                        }}
                      >
                        <svg
                          viewBox="0 0 24 24"
                          width="20"
                          height="20"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2.2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          aria-hidden
                        >
                          <path d="M12 20h9" />
                          <path d="M16.5 3.5a2.121 2.121 0 1 1 3 3L7 19l-4 1 1-4 12.5-12.5z" />
                        </svg>
                        Customise this garment
                        <span aria-hidden className="text-lg leading-none">→</span>
                      </button>
                      <p className="mt-1 text-center text-[11px] text-ui-fg-subtle">
                        Free design tool · upload artwork or add text
                      </p>
                    </>
                  )}
                </>
              ) : assemblyLayout ? null : (
                <p className="text-xs text-ui-fg-subtle">Selected. Click Change to edit.</p>
              )}
            </div>
          ) : null}

          {/* Wizard steps 2-4. Hidden in admin proof mode (the Save Proof
              panel above replaces the wizard). The motion.div gives the
              steps a soft mount-in once Step 1 is completed (or on first
              load for products without variant options). */}
          {!isAdminProofMode && (
              <motion.div
                key="steps"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
                className="flex flex-col gap-2 [&>*]:shrink-0"
              >

          {/* Step 2 — Print location */}
          {(assemblyLayout ? assemblyExpanded === 2 : (pdpStep >= 2 || !hasStep1)) ? (
            (() => {
              const sideLabelMap: Record<GarmentSide, string> = {
                front: "Front",
                back: "Back",
                left_sleeve: "Left Sleeve",
                right_sleeve: "Right Sleeve",
                printed_tag: "Printed Tag",
                bottle_label: "Bottle Label",
                bottle_back_label: "Bottle Back Label",
              }
              const decoratedAllowed = decoratedSides.filter((s) => allowedPrintSides.includes(s))
              const decoratedCount = decoratedAllowed.length
              const totalAllowed = allowedPrintSides.length
              return (
                <motion.div
                  ref={step2Ref}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1], delay: 0.05 }}
                  className={
                  assemblyLayout
                    ? "relative space-y-4 overflow-hidden rounded-2xl border border-ui-border-base bg-ui-bg-base p-5 shadow-sm"
                    : `space-y-3 rounded-xl border p-4 ${
                        pdpStep === 2
                          ? "border-ui-fg-base bg-ui-bg-base shadow-sm"
                          : "border-ui-border-base bg-ui-bg-subtle/40"
                      }`
                }>
                  <StepHeader
                    num={stepNum(2)}
                    assemblyNum={stepNum(2)}
                    title={
                      assemblyLayout
                        ? "Print location & size"
                        : decoratedCount > 0
                        ? "Add / change print positions"
                        : "Select print location"
                    }
                    done={
                      assemblyLayout
                        ? pdpStep2Done && pdpStep3Done
                        : pdpStep2Done && pdpStep > 2
                    }
                    active={pdpStep === 2}
                    badge={pdpStep2Done && pdpStep > 2 ? sideLabel : undefined}
                    help="Choose which part of the garment to print on — front, back, sleeves, or inside neck tag. Select a location, add your artwork, then use the button below the canvas to add prints to more locations. Each location is priced separately."
                    onChange={() => setPdpStep(2)}
                    assemblyOpen={assemblyExpanded === 2}
                    onToggle={() => setAssemblyExpanded(null)}
                  />

                  {/* At Step 4 collapse to just the header — saves vertical space.
                      "Change" on the header lets the customer jump back to pick
                      a different location. In assembly mode the section's own
                      accordion controls visibility, so keep the body mounted
                      whenever the section is expanded (pdpStep advances to 4
                      after a size is picked but we still want it visible). */}
                  {assemblyLayout || pdpStep < 4 ? (
                    <>
                      {decoratedCount > 0 ? (
                        <div className="space-y-1.5 rounded-lg bg-emerald-50/70 px-2.5 py-2 ring-1 ring-emerald-200">
                          <p className="text-[11px] font-semibold uppercase tracking-wide text-emerald-800">
                            Artwork added on {decoratedCount} of {totalAllowed} location
                            {totalAllowed === 1 ? "" : "s"}
                          </p>
                          <ul className="flex flex-wrap gap-1">
                            {decoratedAllowed.map((s) => (
                              <li
                                key={s}
                                className="inline-flex items-center gap-1 rounded-full bg-white py-0.5 pl-2 pr-1 text-[11px] font-medium text-emerald-900 ring-1 ring-emerald-200"
                              >
                                <span aria-hidden>✓</span>
                                {sideLabelMap[s]}
                                <button
                                  type="button"
                                  onClick={() => {
                                    // Removing a location deletes its artwork
                                    // with no undo — confirm so a phone mis-tap
                                    // doesn't silently wipe a finished side.
                                    if (
                                      typeof window !== "undefined" &&
                                      !window.confirm(
                                        `Remove the ${sideLabelMap[s]} print? Its artwork will be deleted.`
                                      )
                                    ) {
                                      return
                                    }
                                    clearPrintLocation(s)
                                  }}
                                  aria-label={`Remove ${sideLabelMap[s]} print location`}
                                  title={`Remove ${sideLabelMap[s]}`}
                                  className="ml-0.5 inline-flex h-5 min-h-11 w-5 min-w-11 items-center justify-center rounded-full text-sm leading-none text-emerald-700 transition-colors hover:bg-emerald-100 hover:text-emerald-900 small:min-h-0 small:min-w-0"
                                >
                                  ×
                                </button>
                              </li>
                            ))}
                          </ul>
                        </div>
                      ) : null}

                      <SideSelector
                        currentSide={currentSide}
                        allowedSides={allowedPrintSides}
                        // A tab is ticked ✓ ONLY once it actually has artwork on
                        // it. Merely visiting a location — or a single-size side
                        // (sleeves/tag = A6) being auto-sized just to unlock the
                        // upload panel — must NOT mark it "added", otherwise
                        // clicking through the sleeve tabs silently confirms
                        // locations the customer never chose. "Added" == has
                        // artwork, which is exactly what cart + pricing derive
                        // from (decoratedSides), so the three now agree.
                        decoratedSides={decoratedSides}
                        hideSelection={pdpStep === 2 && !pdpStep2Done}
                        onSelectSide={(side) => {
                          switchSide(side)
                          setPdpStep2Done(true)
                          // Re-open Step 3 when switching to a location that hasn't
                          // been sized yet; single-size sides auto-advance immediately.
                          const newStep =
                            pdpStep > 2 && !sizingDoneSides[side] ? 3
                            : pdpStep > 2 ? pdpStep
                            : 3
                          setPdpStep(newStep)
                          // Pre-select the per-side default size (Front → A6,
                          // Back → A3) so the size picker has a sensible
                          // starting point. Customer can still pick a different
                          // tile; clicking commits + advances to Step 4.
                          if (!sizingDoneSides[side]) {
                            const allowed = getAllowedScpPrintSizesForSide(side, {
                              isLongSleeve: productIsLongSleeve,
                              isHat: productIsHat,
                            })
                            setScpPrintSizeId(getDefaultScpPrintSizeForSide(side, allowed))
                            setScpPrintSizeChosen(true)
                          }
                        }}
                      />
                      {pdpStep === 2 && (
                        <p className="text-xs text-ui-fg-subtle">
                          Pick a location, then add artwork in the design preview. Repeat to print on
                          more spots — each location is priced separately.
                        </p>
                      )}
                      {/*
                        The decoration-method picker (Print/Embroidery) used
                        to live here, but it's now in the print-size body
                        (renderPrintSizeBody) alongside the size/embroidery
                        configuration — that way the customer can change a
                        side's method any time they're working on it.
                      */}

                      {/* Assembly only: the print-size selection is folded
                          into this combined section, rendered inline beneath
                          the location tabs once a position is chosen. In the
                          non-assembly layout the size body stays in its own
                          Step 3 card further down. */}
                      {assemblyLayout && pdpStep2Done ? (
                        <div className="space-y-4 border-t border-ui-border-base pt-4">
                          <p className="text-[11px] font-semibold uppercase tracking-wide text-ui-fg-subtle">
                            Print size · {sideLabel}
                          </p>
                          {renderPrintSizeBody(true)}
                        </div>
                      ) : null}
                    </>
                  ) : null}
                </motion.div>
              )
            })()
          ) : assemblyLayout ? (
            <AssemblyCollapsedHeader
              assemblyNum={stepNum(2)}
              title="Print location & size"
              status={
                decoratedSides.length > 0 || pdpStep3Done
                  ? `${decoratedSides.length || "No"} location${
                      decoratedSides.length === 1 ? "" : "s"
                    } · ${printSizeLabel}`
                  : "No selection"
              }
              done={pdpStep2Done && pdpStep3Done}
              onExpand={() => expandAssemblySection(2)}
            />
          ) : (
            <StepPreview
              num={stepNum(2)}
              title="Print location"
              hint="Pick where the artwork goes — front, back, sleeves, neck tag."
              onClick={() => setPdpStep(2)}
              isNext={pdpStep === 1}
            />
          )}

          {/* Add print to another location — magenta dashed CTA between
              Step 2 (Print location) and Step 3 (Print size). Always
              visible (once past Step 1) when the product has multiple
              sides and at least one is still unused; greys out until
              the customer has placed artwork on the current side so
              they don't strand an empty location behind. */}
          {embedded && (assemblyLayout || pdpStep >= 2) && allowedPrintSides.length > 1 && (() => {
            const undecoratedAllowed = allowedPrintSides.filter(
              (s) => !decoratedSides.includes(s)
            )
            if (!undecoratedAllowed.length) return null
            const nextSide = undecoratedAllowed[0]
            const nextSideLabel =
              nextSide === "left_sleeve" ? "Left Sleeve"
              : nextSide === "right_sleeve" ? "Right Sleeve"
              : nextSide === "printed_tag" ? "Printed Tag"
              : nextSide.charAt(0).toUpperCase() + nextSide.slice(1)
            const canAddLocation =
              decoratedSides.filter((s) => allowedPrintSides.includes(s)).length > 0
            return (
              <motion.button
                type="button"
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1], delay: 0.05 }}
                disabled={!canAddLocation}
                title={
                  !canAddLocation
                    ? "Add artwork to the current location first"
                    : undefined
                }
                onClick={() => {
                  if (!canAddLocation) return
                  // Don't auto-pick the next side — open the print
                  // location & size selector (Step 2) so the customer
                  // chooses which location to add. Previously this jumped
                  // straight to a size step for an auto-chosen side, which
                  // behaved differently at each stage and did nothing once
                  // every side had already been auto-picked.
                  if (assemblyLayout) {
                    setAssemblyExpanded(2)
                  } else {
                    setPdpStep(2)
                  }
                  step2Ref.current?.scrollIntoView({ behavior: "smooth", block: "start" })
                }}
                className={`w-full rounded-xl border-2 border-dashed px-4 py-3 text-left text-sm font-medium transition-colors ${
                  canAddLocation
                    ? "border-fuchsia-500 bg-transparent text-ui-fg-base hover:border-fuchsia-600 hover:bg-fuchsia-50"
                    : "cursor-not-allowed border-ui-border-base bg-transparent text-ui-fg-muted opacity-50"
                }`}
              >
                <span
                  className={`text-base leading-none mr-2 ${
                    canAddLocation ? "text-fuchsia-600" : "text-ui-fg-muted"
                  }`}
                  aria-hidden
                >
                  +
                </span>
                Add print to another location
                <span className="ml-1.5 text-xs font-normal text-ui-fg-subtle">
                  (e.g. {nextSideLabel})
                </span>
              </motion.button>
            )
          })()}

          {/* Artwork — collapsible section (assembly layout only). Hosts the
              InputPanel (upload / text / saved uploads) that in the normal
              layout sits beside the canvas; moving it here lets the canvas
              take the full width of the design column. Sits AFTER the combined
              "Print location & size" section so the studio flow reads
              location/size → artwork → quantity. */}
          {assemblyLayout && !isAdminProofMode ? (
            assemblyArtworkOpen ? (
              // step3Ref lives here in assembly mode (the v1 "Print size" step
              // that normally holds it renders null above) so the guide's step-3
              // spotlight targets the Artwork section.
              <motion.div
                ref={step3Ref}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1], delay: 0.05 }}
                className="relative space-y-4 overflow-hidden rounded-2xl border border-ui-border-base bg-ui-bg-base p-5 shadow-sm"
              >
                <button
                  type="button"
                  onClick={() => setAssemblyArtworkOpen(false)}
                  aria-expanded={true}
                  className="flex w-full flex-col items-start gap-2.5 text-left"
                >
                  <span
                    className="flex h-7 w-7 items-center justify-center rounded-lg bg-ui-bg-subtle text-base leading-none text-ui-fg-subtle"
                    aria-hidden
                  >
                    ✕
                  </span>
                  <span className="truncate pr-12 text-[15px] font-semibold text-ui-fg-base">
                    Artwork
                  </span>
                </button>
                <span
                  className="pointer-events-none absolute -top-3 -right-1 select-none text-[5rem] font-black leading-none tracking-tighter text-ui-fg-base"
                  aria-hidden
                >
                  {String(stepNum(3)).padStart(2, "0")}
                </span>
                <InputPanel
                  onUploadFile={inputPanelProps.onUploadFile}
                  uploads={inputPanelUploads}
                  onReuseUpload={inputPanelProps.onReuseUpload}
                  cartDesigns={cartArtworkDesigns}
                  onAddCartDesign={inputPanelProps.onAddCartDesign}
                  onAddText={inputPanelProps.onAddText}
                  onAddCurvedText={inputPanelProps.onAddCurvedText}
                  onRemoveSelectedImage={inputPanelProps.onRemoveSelectedImage}
                  canRemoveImage={canRemoveImage}
                  onDeleteUpload={inputPanelProps.onDeleteUpload}
                  enabled={isAdminProofMode || !embedded || !pdpHasVariantOptions || pdpStep1Done}
                  disabledMessage={inputPanelDisabledMessage}
                  selectedText={selectedTextSnapshot}
                  onUpdateSelectedText={inputPanelProps.onUpdateSelectedText}
                  onDeselectText={inputPanelProps.onDeselectText}
                  className="border-0 bg-transparent p-0"
                />
                {/* Forward momentum: once artwork is on the garment, send the
                    customer straight to quantity & checkout. */}
                {decoratedSides.some((s) => allowedPrintSides.includes(s)) && (
                  <button
                    type="button"
                    onClick={() => {
                      setAssemblyArtworkOpen(false)
                      setAssemblyExpanded(4)
                    }}
                    className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-ui-fg-base px-4 py-2.5 text-sm font-semibold text-ui-bg-base transition-opacity hover:opacity-90"
                  >
                    Continue to quantity
                    <span aria-hidden>→</span>
                  </button>
                )}
              </motion.div>
            ) : (
              <AssemblyCollapsedHeader
                assemblyNum={stepNum(3)}
                title="Artwork"
                status="Upload a logo or add text"
                onExpand={() => {
                  setAssemblyArtworkOpen(true)
                  setAssemblyExpanded(null)
                }}
              />
            )
          ) : null}

          {/* Step 3 — Print size. ASSEMBLY MODE: this section is folded into
              the combined "Print location & size" card above (section 02), so
              it renders nothing standalone here. NON-ASSEMBLY MODE: unchanged —
              its own card / preview, body shared via renderPrintSizeBody(). */}
          {assemblyLayout ? null : pdpStep >= 3 ? (
            <motion.div
              ref={step3Ref}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1], delay: 0.05 }}
              className={`space-y-3 rounded-xl border p-4 ${
                pdpStep === 3
                  ? "border-ui-fg-base bg-ui-bg-base shadow-sm"
                  : "border-ui-border-base bg-ui-bg-subtle/40"
              }`}>
              <StepHeader
                num={stepNum(3)}
                assemblyNum={stepNum(4)}
                title="Print size"
                done={currentSideSized && pdpStep > 3}
                active={pdpStep === 3}
                help="Pick the maximum print area for this location. Larger = more detail but higher cost per garment. A6 suits small logos and tags; Oversize covers most of the chest. You can choose different sizes for different locations."
                // Hide the "Change" link when the side only allows one size
                // (hats, printed_tag, short-sleeve sleeves) — there's nothing
                // to switch to, so the link would just bounce the customer
                // back into a non-interactive picker and our auto-advance
                // would immediately re-complete the step.
                onChange={
                  allowedSizesForCurrentSide.length > 1
                    ? () => {
                        setPdpStep(3)
                        // Re-pick: clear highlight so the customer makes a
                        // fresh choice rather than seeing the previous size
                        // pre-selected.
                        setScpPrintSizeChosen(false)
                      }
                    : undefined
                }
                assemblyOpen={assemblyExpanded === 3}
                onToggle={() => setAssemblyExpanded(null)}
              />
              {renderPrintSizeBody(pdpStep === 3)}
            </motion.div>
          ) : (
            <div ref={step3Ref}>
              <StepPreview
                num={stepNum(3)}
                title="Print size"
                hint="Choose A6, A4, A3 or oversize for each location."
                onClick={() => setPdpStep(3)}
                isNext={pdpStep === 2}
              />
            </div>
          )}

          {/* Edit-design mode: replace Step 4 (Quantity & Checkout) with
              a focused design-only save panel. The cart's existing
              variants and quantities are preserved exactly — this flow
              ONLY updates the artwork/text/positions/print-size on the
              already-added lines. To change quantities or variants, the
              customer goes back to the cart. */}
          {editGroupId && pdpStep >= 4 ? (
            <motion.div
              ref={step4Ref}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1], delay: 0.05 }}
              className="flex flex-col gap-3"
            >
              <div className="space-y-3 rounded-xl border-2 border-amber-500 bg-amber-50/50 p-3 shadow-sm">
                <div>
                  <p className="text-sm font-semibold text-amber-900">
                    Save design changes
                  </p>
                  <p className="text-xs text-amber-800">
                    Your edits apply to the existing cart variants below.
                    Quantities and sizes are preserved — to change those,
                    go back to the cart.
                  </p>
                </div>
                {hydrationPlaceholderSides.length > 0 ? (
                  <div className="rounded-md border border-rose-300 bg-rose-50 px-2.5 py-2 text-xs text-rose-900">
                    <p className="font-semibold">
                      ⚠️ Some artwork didn't reload
                    </p>
                    <p className="mt-1">
                      The original upload for{" "}
                      <span className="font-semibold">
                        {hydrationPlaceholderSides.join(", ")}
                      </span>{" "}
                      appears to be missing from storage. Switch to that
                      side in the canvas and re-upload via{" "}
                      <span className="font-semibold">Add to design</span>{" "}
                      to keep the print.
                    </p>
                  </div>
                ) : null}
                {/* Read-only cart-variant summary. Pulled from the cart's
                    own line data (variant_title + quantity) so it stays
                    accurate even if the storefront's product.variants
                    list excludes a retired variant. No editing controls
                    by design — this is purely "what you're updating". */}
                {editGroupLineSummary.length > 0 ? (
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-semibold uppercase tracking-wide text-amber-900">
                        Updating {editGroupLineSummary.length} cart line
                        {editGroupLineSummary.length === 1 ? "" : "s"}
                      </p>
                      <p className="text-xs text-amber-800">
                        {editGroupLineSummary.reduce(
                          (sum, l) => sum + (l.quantity || 0),
                          0
                        )}{" "}
                        garment
                        {editGroupLineSummary.reduce(
                          (sum, l) => sum + (l.quantity || 0),
                          0
                        ) === 1
                          ? ""
                          : "s"}
                      </p>
                    </div>
                    <ul className="space-y-1">
                      {editGroupLineSummary.map((line) => (
                        <li
                          key={line.lineId}
                          className="flex items-center justify-between gap-2 rounded-md border border-amber-200 bg-white/70 px-2.5 py-1.5 text-xs"
                        >
                          <span className="flex-1 truncate text-amber-900">
                            {line.variantTitle ??
                              line.productTitle ??
                              "Variant"}
                          </span>
                          <span className="shrink-0 font-semibold tabular-nums text-amber-900">
                            × {line.quantity}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
                <button
                  type="button"
                  onClick={() => {
                    void addCustomizedToCart()
                  }}
                  disabled={isSubmitting || editGroupLineIds.length === 0}
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-[var(--brand-primary,#1e293b)] px-4 py-3 text-sm font-bold uppercase tracking-wide text-white shadow-md ring-1 ring-black/5 transition-all hover:brightness-110 hover:scale-[1.01] active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {isSubmitting
                    ? "Saving…"
                    : `Save design changes (${editGroupLineIds.length} cart line${
                        editGroupLineIds.length === 1 ? "" : "s"
                      })`}
                </button>
                <div className="flex items-center justify-end text-xs">
                  <button
                    type="button"
                    onClick={() => {
                      router.push(`/${countryCode}/cart`)
                    }}
                    disabled={isSubmitting}
                    className="font-medium text-ui-fg-subtle underline-offset-2 hover:text-ui-fg-base hover:underline disabled:opacity-40"
                  >
                    Cancel — back to cart
                  </button>
                </div>
              </div>
            </motion.div>
          ) : (assemblyLayout ? assemblyExpanded === 4 : pdpStep >= 4) ? (
            /* Original Step 4 — Quantities, notes & checkout (fresh add flow). */
            <motion.div
              ref={step4Ref}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1], delay: 0.05 }}
              className="flex flex-col gap-3"
            >
              <div className={assemblyLayout ? "relative space-y-2 overflow-hidden rounded-2xl border border-ui-border-base bg-ui-bg-base p-5 shadow-sm" : "space-y-2 rounded-xl border border-ui-fg-base bg-ui-bg-base p-3 shadow-sm"}>
                <StepHeader num={stepNum(4)} assemblyNum={stepNum(4)} title="Quantity & checkout" done={false} active={true} assemblyOpen={assemblyExpanded === 4} onToggle={() => setAssemblyExpanded(null)} help="Enter how many of each size you need. Bulk discounts apply automatically — the more you order, the lower the price per garment. Once you're happy, add to cart and complete checkout." />
                {(() => {
                  const sideShortMap: Record<GarmentSide, string> = {
                    front: "Front",
                    back: "Back",
                    left_sleeve: "Left Sleeve",
                    right_sleeve: "Right Sleeve",
                    printed_tag: "Printed Tag",
                    bottle_label: "Bottle Label",
                    bottle_back_label: "Bottle Back Label",
                  }
                  const sidesForSummary = decoratedSides.filter((s) => allowedPrintSides.includes(s))
                  if (sidesForSummary.length === 0) {
                    if (assemblyLayout) {
                      return (
                        <div className="rounded-md bg-amber-50 px-2.5 py-2 text-xs text-amber-900 ring-1 ring-amber-200">
                          <p>No artwork added yet — add a logo or text before checkout.</p>
                          <button
                            type="button"
                            onClick={() => {
                              setAssemblyExpanded(null)
                              setAssemblyArtworkOpen(true)
                            }}
                            className="mt-1.5 inline-flex items-center gap-1 font-semibold text-amber-900 underline underline-offset-2 hover:text-amber-950"
                          >
                            Open the Artwork section <span aria-hidden>→</span>
                          </button>
                        </div>
                      )
                    }
                    return (
                      <p className="rounded-md bg-amber-50 px-2.5 py-1.5 text-xs text-amber-900 ring-1 ring-amber-200">
                        No artwork added yet — use the{" "}
                        <span className="font-semibold">Add to design</span> section in the design
                        preview to upload art or add text.
                      </p>
                    )
                  }
                  return (
                    <p className="rounded-md bg-ui-bg-subtle/70 px-2.5 py-1.5 text-xs text-ui-fg-base">
                      <span className="font-semibold">Printing on </span>
                      {sidesForSummary.map((s, i) => (
                        <span key={s}>
                          {i > 0 ? <span aria-hidden> + </span> : null}
                          <span
                            className="animate-brand-pulse"
                            // Offset each label by half the animation cycle
                            // (3.6s / 2 = 1.8s) so adjacent locations sit on
                            // opposite phases — Front goes magenta while Back
                            // goes teal, and vice versa.
                            style={{ animationDelay: `${(i % 2) * -1.8}s` }}
                          >
                            {sideShortMap[s]}
                          </span>
                        </span>
                      ))}
                      <span className="text-ui-fg-subtle"> · {printSizeLabel} each</span>
                    </p>
                  )
                })()}
                {(() => {
                  // Embroidered sides whose size/stitch estimate was never
                  // confirmed — checkout is blocked until they are (the
                  // price depends on the stitch count).
                  const unconfirmed = decoratedSides.filter(
                    (side) =>
                      sideDecorationMethods[side] === "embroidery" &&
                      !((sideEmbroideryConfigs[side]?.stitchCount ?? 0) > 0)
                  )
                  if (!unconfirmed.length) return null
                  return (
                    <div className="mt-1.5 rounded-md bg-amber-50 px-2.5 py-2 text-xs text-amber-900 ring-1 ring-amber-200">
                      <p>
                        <span className="font-semibold">Embroidery size not confirmed</span> for{" "}
                        {unconfirmed.map((s) => s.replace(/_/g, " ")).join(", ")} — open the
                        embroidery settings on {unconfirmed.length === 1 ? "that position" : "each position"}{" "}
                        and confirm the size before checkout. Your price is based on the stitch count.
                      </p>
                    </div>
                  )
                })()}
                {poaSidesForDisplay.length > 0 && !isQuoteMode && (
                  <div className="mt-1.5 rounded-md bg-amber-50 px-2.5 py-2 text-xs text-amber-900 ring-1 ring-amber-200">
                    <p>
                      <span className="font-semibold">Custom quote needed</span> — embroidery on{" "}
                      {poaSidesForDisplay.map((s) => s.replace(/_/g, " ")).join(", ")} is over{" "}
                      {MAX_AUTO_PRICED_STITCHES.toLocaleString()} stitches, which we price
                      individually. The button below sends your design to our team for a quote
                      instead of adding it to cart.
                    </p>
                  </div>
                )}
              </div>
              {(() => {
                const colourOption = selectedProduct.options?.find((option) =>
                  isColorOptionTitle(option.title)
                )
                const hasMultipleColours = colourOption
                  ? new Set(
                      (selectedProduct.variants ?? [])
                        .map((v) => v.options?.find((e) => e.option_id === colourOption.id)?.value)
                        .filter(Boolean)
                    ).size > 1
                  : false
                if (!hasMultipleColours) return null
                // The bulk grid is the end of the flow — once inside, the
                // customer fills sizes and adds to cart without coming back
                // to the canvas. So warn them to finish adding artwork on
                // every print position first (only relevant when the
                // garment supports more than one position).
                const multiplePositions = allowedPrintSides.length > 1
                return (
                  <div className="space-y-2">
                    <button
                      type="button"
                      onClick={() => setBulkMode(true)}
                      disabled={isSubmitting}
                      className="flex w-full items-center justify-between gap-3 rounded-xl border border-ui-fg-base bg-white px-4 py-3 text-left text-sm font-medium text-ui-fg-base shadow-sm transition-colors hover:bg-ui-bg-subtle disabled:opacity-60"
                    >
                      <span className="flex flex-col">
                        <span>Order multiple colours →</span>
                        <span className="text-xs font-normal text-ui-fg-subtle">
                          Full-page grid · pick colours, fill sizes, add everything in one click.
                        </span>
                      </span>
                      <span className="rounded-full bg-ui-fg-base px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">
                        Bulk
                      </span>
                    </button>
                    {multiplePositions && (
                      <p className="flex items-start gap-1.5 rounded-lg bg-amber-50 px-3 py-2 text-[11px] leading-snug text-amber-800 ring-1 ring-amber-200">
                        <span aria-hidden className="mt-px shrink-0">⚠</span>
                        <span>
                          Finish adding artwork to <strong>all your print positions</strong> (front, back, sleeves…) before opening the bulk grid — you complete your order there and won&apos;t be able to add more artwork once inside.
                        </span>
                      </p>
                    )}
                  </div>
                )
              })()}
              <PricingPanel
                currencyCode={currencyCode}
                pricing={pricing}
                sizes={sizeMatrix}
                onChangeSizeQty={stableOnChangeSizeQty}
                onAddToCart={stableOnAddToCart}
                isSubmitting={isSubmitting}
                embeddedOnPdp={embedded}
                flyImageSrc={flyImageSrcForAddToCart}
                showDtfTierEstimator={productMetadataShowsDtfTierEstimator(selectedProduct)}
                embedPdpQuantityStepNumber={embedPdpQuantityStepNumber}
                scpPrintSizeId={scpPrintSizeId}
                onScpPrintSizeIdChange={stableOnScpPrintSizeIdChange}
                decoratedSides={decoratedSides}
                prints={printSpecsForDisplay}
                onChangePrintSize={stableOnChangePrintSize}
                allowedPrintSizesBySide={allowedSizesBySide}
                hidePrintSizeSelector
                hideHeader
                primaryCtaLabel={
                  isQuoteMode
                    ? "Add design to quote"
                    : isPOSMode
                    ? "Add to sale"
                    : editLineItemId
                    ? "Update cart"
                    : poaSidesForDisplay.length > 0
                    ? "Request a quote"
                    : undefined
                }
                primaryCtaLoadingLabel={
                  isQuoteMode
                    ? "Saving to quote…"
                    : isPOSMode
                    ? "Adding…"
                    : editLineItemId
                    ? "Updating..."
                    : poaSidesForDisplay.length > 0
                    ? "Sending…"
                    : undefined
                }
                aggregatedCartQuantity={aggregatedCartQuantity}
                stockBySize={stockBySize}
                tier={tier}
                variantTintHex={variantTintHex}
              />
              <div className="space-y-2 rounded-xl border border-ui-border-base bg-ui-bg-base p-4">
                <label
                  htmlFor="customizer-print-notes"
                  className="text-xs font-semibold uppercase tracking-wide text-ui-fg-subtle"
                >
                  Notes for production (optional)
                </label>
                <textarea
                  id="customizer-print-notes"
                  value={printNotes}
                  onChange={(e) =>
                    setPrintNotes(e.target.value.slice(0, CUSTOMIZER_PRINT_NOTES_MAX_LENGTH))
                  }
                  rows={3}
                  maxLength={CUSTOMIZER_PRINT_NOTES_MAX_LENGTH}
                  placeholder="e.g. Match logo PMS 185 C, keep 3 cm from collar seam…"
                  className="w-full resize-y rounded-md border border-ui-border-base bg-ui-bg-field px-3 py-2 text-sm text-ui-fg-base placeholder:text-ui-fg-muted outline-none focus:border-ui-border-interactive focus:ring-2 focus:ring-ui-border-interactive/20"
                  disabled={isSubmitting}
                />
                <p className="text-xs text-ui-fg-muted tabular-nums">
                  {printNotes.length}/{CUSTOMIZER_PRINT_NOTES_MAX_LENGTH}
                </p>
              </div>
            </motion.div>
          ) : assemblyLayout ? (
            <AssemblyCollapsedHeader
              assemblyNum={stepNum(4)}
              title="Quantity & checkout"
              status="Sizes, quantities & add to cart"
              onExpand={() => expandAssemblySection(4)}
            />
          ) : (
            <div ref={step4Ref}>
              <StepPreview
                num={stepNum(4)}
                title="Quantity & checkout"
                hint="Set sizes, quantities and add to cart."
                onClick={() => setPdpStep(4)}
                isNext={pdpStep === 3}
              />
            </div>
          )}
              </motion.div>
          )}
          </div>
        </div>
        <LowResolutionModal
          open={lowResModalOpen}
          worstDpi={dpiAssessment.worstDpi}
          imagesBelowCritical={dpiAssessment.imagesBelowCritical}
          vectorizationDisplayPrice={
            process.env.NEXT_PUBLIC_VECTORIZATION_DISPLAY_PRICE ?? null
          }
          onClose={() => {
            setLowResModalOpen(false)
            lowResModalDismissedRef.current = true
          }}
          onUploadHigherQuality={() => {
            try {
              fabricContainerRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })
            } catch {
              /* noop */
            }
          }}
          onAcceptVectorization={() => {
            setVectorizationRequested(true)
            setStatusMessage(
              "Vectorization service will be added when you check out — our team will redraw your artwork sharp for print."
            )
          }}
        />
        {poaQuoteModalNode}
      </div>
    )
  }

  return null
}
