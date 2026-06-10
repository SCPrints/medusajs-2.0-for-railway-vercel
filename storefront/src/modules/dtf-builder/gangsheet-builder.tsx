"use client"

import { addToCart } from "@lib/data/cart"
import LocalizedClientLink from "@modules/common/components/localized-client-link"
import ProductPrice from "@modules/products/components/product-price"
import { parseSheetDimensionsFromVariant } from "@modules/dtf-builder/parse-sheet-size"
import { uploadCustomerOriginalUnchanged } from "@modules/customizer/lib/upload-customer-original"
import { Button, Heading, Text } from "@medusajs/ui"
import { HttpTypes } from "@medusajs/types"
import { useRouter } from "next/navigation"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import * as fabricNs from "fabric"

const PIXELS_PER_CM = 12
const MAX_UPLOAD_BYTES = 8 * 1024 * 1024
const STORAGE_KEY_PREFIX = "dtf_gangsheet_v1_"
const PRINT_DPI = 300
const NEST_MARGIN_CM = 0.5

// Effective-DPI bands for the print-readiness feedback. Mirrors the customizer's
// Phase-4 DPI thresholds (see modules/customizer/lib/dpi.ts) so the two flows
// give customers consistent guidance.
const DPI_OK = 250
const DPI_WARN = 150

type Props = {
  product: HttpTypes.StoreProduct
  countryCode: string
  initialVariantId: string
}

type DpiBand = "ok" | "warn" | "bad"

type ImageInfo = {
  index: number
  label: string
  dpi: number
  band: DpiBand
  widthCm: number
  heightCm: number
}

const fabric = fabricNs as any

const readFileAsDataUrl = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result ?? ""))
    reader.onerror = () => reject(new Error("Unable to read file"))
    reader.readAsDataURL(file)
  })

const dataUrlToFile = (dataUrl: string, name: string): File | null => {
  const commaIdx = dataUrl.indexOf(",")
  if (commaIdx < 0) {
    return null
  }
  try {
    const binary = atob(dataUrl.slice(commaIdx + 1))
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i)
    }
    return new File([bytes], name, { type: "image/png" })
  } catch {
    return null
  }
}

const bandFor = (dpi: number): DpiBand => {
  if (dpi < DPI_WARN) {
    return "bad"
  }
  if (dpi < DPI_OK) {
    return "warn"
  }
  return "ok"
}

export default function GangsheetBuilder({
  product,
  countryCode,
  initialVariantId,
}: Props) {
  const router = useRouter()
  const canvasParentRef = useRef<HTMLDivElement>(null)
  const htmlCanvasRef = useRef<HTMLCanvasElement>(null)
  const fabricCanvasRef = useRef<any>(null)
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const [designId, setDesignId] = useState<string | null>(null)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [statusMessage, setStatusMessage] = useState<string | null>(null)
  const [isAdding, setIsAdding] = useState(false)
  const [canvasReady, setCanvasReady] = useState(false)
  const [imageInfos, setImageInfos] = useState<ImageInfo[]>([])
  const [overflow, setOverflow] = useState(false)
  const recomputeRef = useRef<(() => void) | null>(null)

  const selectedVariant = useMemo(
    () => product.variants?.find((v) => v.id === initialVariantId) ?? product.variants?.[0],
    [product.variants, initialVariantId]
  )

  const sheetCm = useMemo(() => parseSheetDimensionsFromVariant(selectedVariant), [selectedVariant])

  const widthPx = sheetCm ? Math.round(sheetCm.widthCm * PIXELS_PER_CM) : 0
  const heightPx = sheetCm ? Math.round(sheetCm.heightCm * PIXELS_PER_CM) : 0

  const schedulePersist = useCallback(() => {
    const canvas = fabricCanvasRef.current
    if (!canvas || !designId) {
      return
    }

    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current)
    }

    saveTimerRef.current = setTimeout(() => {
      const c = fabricCanvasRef.current
      if (!c || !designId) {
        return
      }

      try {
        const payload = {
          variantId: initialVariantId,
          fabricJson: c.toJSON(),
        }
        localStorage.setItem(`${STORAGE_KEY_PREFIX}${designId}`, JSON.stringify(payload))
      } catch {
        // ignore quota / private mode
      }
    }, 450)
  }, [designId, initialVariantId])

  // Recompute per-image effective DPI + whether the layout overflows the sheet.
  // Effective DPI = native source pixels ÷ printed inches at the current scale.
  const recomputeImageInfos = useCallback(() => {
    const canvas = fabricCanvasRef.current
    if (!canvas) {
      setImageInfos([])
      setOverflow(false)
      return
    }

    let maxBottom = 0
    const infos: ImageInfo[] = canvas.getObjects().map((obj: any, i: number) => {
      const sourceWidthPx = Number(obj.sourceWidthPx) || Number(obj.width) || 0
      const scaledWidthPx = obj.getScaledWidth?.() ?? 0
      const scaledHeightPx = obj.getScaledHeight?.() ?? 0
      const widthCm = scaledWidthPx / PIXELS_PER_CM
      const heightCm = scaledHeightPx / PIXELS_PER_CM
      const widthInches = widthCm / 2.54
      const dpi = widthInches > 0 ? Math.round(sourceWidthPx / widthInches) : 0
      maxBottom = Math.max(maxBottom, (obj.top ?? 0) + scaledHeightPx)
      return {
        index: i,
        label: String(obj.customizerLabel ?? `Artwork ${i + 1}`),
        dpi,
        band: bandFor(dpi),
        widthCm: Math.round(widthCm * 10) / 10,
        heightCm: Math.round(heightCm * 10) / 10,
      }
    })

    setImageInfos(infos)
    setOverflow(heightPx > 0 && maxBottom > heightPx + 1)
  }, [heightPx])

  useEffect(() => {
    recomputeRef.current = recomputeImageInfos
  }, [recomputeImageInfos])

  useEffect(() => {
    if (typeof window === "undefined") {
      return
    }

    const hash = window.location.hash.replace(/^#/, "")
    const params = new URLSearchParams(hash)
    let id = params.get("clientDesignId")

    if (!id) {
      id = crypto.randomUUID()
      const next = new URL(window.location.href)
      next.hash = `clientDesignId=${id}`
      window.history.replaceState(null, "", next.toString())
    }

    setDesignId(id)
  }, [])

  useEffect(() => {
    const htmlCanvas = htmlCanvasRef.current
    if (!htmlCanvas || !sheetCm || widthPx < 1 || heightPx < 1) {
      return
    }

    setCanvasReady(false)

    const canvas = new fabric.Canvas(htmlCanvas, {
      width: widthPx,
      height: heightPx,
      backgroundColor: "#ffffff",
      preserveObjectStacking: true,
    })

    fabricCanvasRef.current = canvas

    const syncPersist = () => {
      schedulePersist()
      recomputeRef.current?.()
    }

    canvas.on("object:added", syncPersist)
    canvas.on("object:removed", syncPersist)
    canvas.on("object:modified", syncPersist)

    setCanvasReady(true)

    return () => {
      canvas.dispose()
      fabricCanvasRef.current = null
      setCanvasReady(false)
    }
  }, [sheetCm, widthPx, heightPx, initialVariantId])

  useEffect(() => {
    if (!canvasReady || !designId || !fabricCanvasRef.current) {
      return
    }

    const raw = localStorage.getItem(`${STORAGE_KEY_PREFIX}${designId}`)
    if (!raw) {
      return
    }

    try {
      const parsed = JSON.parse(raw) as { variantId?: string; fabricJson?: unknown }
      if (parsed.variantId !== initialVariantId || !parsed.fabricJson) {
        return
      }

      const c = fabricCanvasRef.current
      c.loadFromJSON(parsed.fabricJson as any).then(() => {
        c.renderAll()
        recomputeRef.current?.()
      })
    } catch {
      // ignore
    }
  }, [canvasReady, designId, initialVariantId])

  const handleVariantChange = (nextId: string) => {
    const hasArt = fabricCanvasRef.current && fabricCanvasRef.current.getObjects().length > 0

    if (hasArt && nextId !== initialVariantId) {
      const ok = window.confirm(
        "Changing the sheet size clears the canvas layout. Copy your design or download it first. Continue?"
      )
      if (!ok) {
        return
      }
    }

    router.replace(`/${countryCode}/dtf-builder?variantId=${encodeURIComponent(nextId)}`)
  }

  const handleUpload = async (files: FileList | null) => {
    if (!files?.length || !fabricCanvasRef.current) {
      return
    }

    setUploadError(null)

    for (const file of Array.from(files)) {
      if (file.type !== "image/png") {
        setUploadError("Use PNG files with transparency for DTF (300 dpi recommended).")
        return
      }
      if (file.size > MAX_UPLOAD_BYTES) {
        setUploadError("Each file must be 8MB or smaller.")
        return
      }

      const dataUrl = await readFileAsDataUrl(file)
      const imageObject = await fabric.FabricImage.fromURL(dataUrl)
      imageObject.set({
        customizerLabel: file.name || "Artwork",
        sourceWidthPx: imageObject.width ?? 0,
        sourceHeightPx: imageObject.height ?? 0,
      })

      const maxW = widthPx * 0.45
      if (imageObject.getScaledWidth() > maxW && imageObject.scaleToWidth) {
        imageObject.scaleToWidth(maxW)
      }

      imageObject.set({
        left: widthPx / 2 - imageObject.getScaledWidth() / 2,
        top: heightPx * 0.08,
      })

      fabricCanvasRef.current.add(imageObject)
      fabricCanvasRef.current.setActiveObject(imageObject)
    }

    fabricCanvasRef.current.renderAll()
    schedulePersist()
  }

  // Shelf-packing auto-nest: lay artwork left→right across the full sheet
  // width, wrapping to a new row when it won't fit, sorting tallest-first so
  // rows pack tightly. Cuts wasted roll length vs the old top-to-bottom stack.
  const autoNest = () => {
    const canvas = fabricCanvasRef.current
    if (!canvas) {
      return
    }

    const margin = Math.round(NEST_MARGIN_CM * PIXELS_PER_CM)
    const objs = [...canvas.getObjects()].sort(
      (a: any, b: any) => b.getScaledHeight() - a.getScaledHeight()
    )

    let x = margin
    let y = margin
    let rowHeight = 0

    objs.forEach((obj: any) => {
      const w = obj.getScaledWidth()
      const h = obj.getScaledHeight()

      if (x > margin && x + w + margin > widthPx) {
        // Wrap to next row
        x = margin
        y += rowHeight + margin
        rowHeight = 0
      }

      obj.set({ left: x, top: y })
      obj.setCoords()
      x += w + margin
      rowHeight = Math.max(rowHeight, h)
    })

    canvas.requestRenderAll()
    schedulePersist()
    recomputeRef.current?.()

    if (heightPx > 0 && y + rowHeight > heightPx) {
      setStatusMessage("Your artwork doesn't all fit on this roll — pick a longer roll size or remove some images.")
      window.setTimeout(() => setStatusMessage(null), 7000)
    }
  }

  const duplicateSelected = async () => {
    const canvas = fabricCanvasRef.current
    if (!canvas) {
      return
    }
    const active = canvas.getActiveObject()
    if (!active) {
      setUploadError("Select an image on the sheet first, then duplicate it.")
      return
    }
    setUploadError(null)

    const cloned = await active.clone()
    cloned.set({
      left: (active.left ?? 0) + 24,
      top: (active.top ?? 0) + 24,
      customizerLabel: active.customizerLabel,
      sourceWidthPx: active.sourceWidthPx,
      sourceHeightPx: active.sourceHeightPx,
    })
    canvas.add(cloned)
    canvas.setActiveObject(cloned)
    canvas.requestRenderAll()
    schedulePersist()
  }

  const removeSelected = () => {
    const canvas = fabricCanvasRef.current
    if (!canvas) {
      return
    }

    const active = canvas.getActiveObject()
    if (active) {
      canvas.remove(active)
      canvas.discardActiveObject()
      canvas.requestRenderAll()
      schedulePersist()
    }
  }

  // Renders the canvas to a print-ready 300 DPI PNG data URL on a transparent
  // background (DTF film). Returns null if the sheet/canvas isn't ready.
  const renderPrintDataUrl = (): string | null => {
    const canvas = fabricCanvasRef.current
    if (!canvas || !sheetCm) {
      return null
    }

    const widthInches = sheetCm.widthCm / 2.54
    const targetWidthPx = widthInches * PRINT_DPI
    const multiplier = Math.max(1, targetWidthPx / canvas.getWidth())

    // Export with a transparent background so the print team gets clean film,
    // then restore the white working background for the on-screen editor.
    const prevBg = canvas.backgroundColor
    canvas.backgroundColor = ""
    canvas.renderAll()
    const dataUrl = canvas.toDataURL({
      format: "png",
      multiplier,
      enableRetinaScaling: false,
    })
    canvas.backgroundColor = prevBg
    canvas.renderAll()

    return dataUrl
  }

  const downloadPrintPng = () => {
    const canvas = fabricCanvasRef.current
    if (!canvas || !sheetCm) {
      return
    }
    if (canvas.getObjects().length === 0) {
      setStatusMessage("Add at least one PNG before downloading.")
      window.setTimeout(() => setStatusMessage(null), 4000)
      return
    }

    const dataUrl = renderPrintDataUrl()
    if (!dataUrl) {
      return
    }

    const a = document.createElement("a")
    a.href = dataUrl
    a.download = `gangsheet-${sheetCm.widthCm}x${sheetCm.heightCm}cm-300dpi.png`
    a.click()

    setStatusMessage("Download started. Keep this file for your records—we also recommend finishing checkout so we can produce your roll.")
    window.setTimeout(() => setStatusMessage(null), 6000)
  }

  const handleAddToCart = async () => {
    if (!selectedVariant?.id) {
      return
    }

    const canvas = fabricCanvasRef.current
    const imageCount = canvas?.getObjects().length ?? 0
    setIsAdding(true)

    // Upload the print-ready sheet to R2 so the production team receives the
    // actual artwork on the order — the localStorage draft never reaches them.
    let artworkUrl: string | null = null
    if (imageCount > 0 && sheetCm) {
      try {
        setStatusMessage("Preparing your print-ready sheet…")
        const dataUrl = renderPrintDataUrl()
        const file = dataUrl
          ? dataUrlToFile(dataUrl, `gangsheet-${sheetCm.widthCm}x${sheetCm.heightCm}cm-300dpi.png`)
          : null
        if (file) {
          setStatusMessage("Uploading artwork to our print team…")
          artworkUrl = await uploadCustomerOriginalUnchanged(file)
        }
      } catch {
        artworkUrl = null
      }
    }

    await addToCart({
      variantId: selectedVariant.id,
      quantity: 1,
      countryCode,
      metadata: {
        ...(designId ? { dtfGangsheetDesignId: designId } : {}),
        dtfGangsheetVariantId: selectedVariant.id,
        dtfGangsheetImageCount: imageCount,
        ...(sheetCm
          ? { dtfGangsheetSheetSize: `${sheetCm.widthCm}cm × ${sheetCm.heightCm}cm` }
          : {}),
        ...(artworkUrl ? { dtfGangsheetArtworkUrl: artworkUrl } : {}),
      },
    })

    setIsAdding(false)

    if (imageCount > 0 && !artworkUrl) {
      setStatusMessage(
        "Added to cart, but we couldn't upload your artwork automatically — please download the 300 DPI PNG and email it to support so we can print it."
      )
    } else {
      setStatusMessage(null)
    }
  }

  if (!sheetCm) {
    return (
      <div className="content-container py-16">
        <Text className="text-ui-fg-subtle">
          Could not read gang sheet dimensions for this variant. Return to the product page and pick a size option.
        </Text>
        <LocalizedClientLink href={`/products/${product.handle}`} className="mt-4 inline-block text-ui-fg-interactive">
          ← Back to product
        </LocalizedClientLink>
      </div>
    )
  }

  return (
    <div className="content-container py-8 space-y-8">
      <div className="flex flex-col gap-4 small:flex-row small:items-end small:justify-between">
        <div>
          <Heading level="h1" className="text-2xl text-ui-fg-base">
            DTF gang sheet builder
          </Heading>
          <Text className="text-small-regular text-ui-fg-muted mt-2 max-w-xl">
            Upload transparent PNGs (300 dpi recommended), arrange them on your purchased roll size, then download a
            print-ready file or add the matching variant to your cart—similar to{" "}
            <a
              href="https://printfactory.com.au/products/dtf-auto-builder"
              className="text-ui-fg-interactive hover:underline"
              target="_blank"
              rel="noreferrer"
            >
              Printfactory&apos;s auto builder
            </a>
            .
          </Text>
        </div>
        <LocalizedClientLink
          href={`/products/${product.handle}`}
          className="text-small font-medium text-ui-fg-interactive hover:underline shrink-0"
        >
          Product page →
        </LocalizedClientLink>
      </div>

      <div className="grid grid-cols-1 large:grid-cols-[280px_1fr] gap-8 items-start">
        <div className="space-y-4 rounded-lg border border-ui-border-base p-4 bg-ui-bg-subtle">
          <div>
            <Text className="text-xsmall font-medium text-ui-fg-muted uppercase tracking-wide mb-2">Roll size</Text>
            <select
              className="w-full h-10 rounded-md border border-ui-border-base bg-ui-bg-base px-3 text-small text-ui-fg-base"
              value={initialVariantId}
              onChange={(e) => handleVariantChange(e.target.value)}
              aria-label="Gang sheet size"
            >
              {(product.variants ?? []).map((v) => (
                <option key={v.id} value={v.id}>
                  {v.title ?? v.sku ?? v.id}
                </option>
              ))}
            </select>
          </div>

          <div>
            <Text className="text-xsmall text-ui-fg-muted mb-1">Sheet</Text>
            <Text className="text-small text-ui-fg-base">
              {sheetCm.widthCm} cm × {sheetCm.heightCm} cm (preview scale: {PIXELS_PER_CM} px/cm)
            </Text>
          </div>

          <ProductPrice product={product} variant={selectedVariant} />

          <Button
            variant="primary"
            className="w-full"
            onClick={handleAddToCart}
            isLoading={isAdding}
            disabled={!selectedVariant}
          >
            Add to cart
          </Button>

          <div className="border-t border-ui-border-base pt-4 space-y-2">
            <label className="flex flex-col gap-2">
              <span className="text-xsmall font-medium text-ui-fg-muted uppercase tracking-wide">Add PNG artwork</span>
              <input
                type="file"
                accept="image/png"
                multiple
                className="text-small text-ui-fg-base file:mr-3 file:rounded file:border file:border-ui-border-base file:bg-ui-bg-base file:px-3 file:py-1"
                onChange={(e) => void handleUpload(e.target.files)}
              />
            </label>
            {uploadError && <p className="text-xsmall text-rose-600">{uploadError}</p>}
          </div>

          <div className="flex flex-col gap-2">
            <Button type="button" variant="secondary" className="w-full" onClick={autoNest}>
              Auto-nest (fit more on)
            </Button>
            <Button type="button" variant="secondary" className="w-full" onClick={() => void duplicateSelected()}>
              Duplicate selected
            </Button>
            <Button type="button" variant="transparent" className="w-full" onClick={removeSelected}>
              Remove selected
            </Button>
            <Button type="button" variant="secondary" className="w-full" onClick={downloadPrintPng}>
              Download 300 DPI PNG
            </Button>
          </div>

          {imageInfos.length > 0 && (
            <div className="border-t border-ui-border-base pt-4 space-y-2">
              <Text className="text-xsmall font-medium text-ui-fg-muted uppercase tracking-wide">
                Print quality ({imageInfos.length} {imageInfos.length === 1 ? "image" : "images"})
              </Text>
              {overflow && (
                <p className="text-xsmall text-rose-600">
                  ⚠ Artwork extends past the bottom of this roll. Auto-nest, remove images, or pick a longer roll.
                </p>
              )}
              <ul className="space-y-1">
                {imageInfos.map((info) => (
                  <li key={info.index} className="flex items-center gap-2 text-xsmall">
                    <span
                      className={`inline-block h-2 w-2 rounded-full shrink-0 ${
                        info.band === "ok"
                          ? "bg-emerald-500"
                          : info.band === "warn"
                          ? "bg-amber-500"
                          : "bg-rose-500"
                      }`}
                      aria-hidden
                    />
                    <span className="truncate text-ui-fg-base flex-1" title={info.label}>
                      {info.label}
                    </span>
                    <span
                      className={
                        info.band === "ok"
                          ? "text-emerald-600"
                          : info.band === "warn"
                          ? "text-amber-600"
                          : "text-rose-600"
                      }
                    >
                      {info.dpi} dpi
                    </span>
                    <span className="text-ui-fg-muted">
                      {info.widthCm}×{info.heightCm}cm
                    </span>
                  </li>
                ))}
              </ul>
              <p className="text-xsmall text-ui-fg-muted">
                {DPI_OK}+ dpi prints sharp · {DPI_WARN}–{DPI_OK - 1} dpi is usable · below {DPI_WARN} dpi will look soft.
                Scale an image down to raise its dpi.
              </p>
            </div>
          )}

          {statusMessage && <p className="text-xsmall text-ui-fg-subtle">{statusMessage}</p>}

          <Text className="text-xsmall text-ui-fg-muted">
            Drafts save in this browser (design id in the URL hash). For production, attach your exported PNG to the
            order or send it via support if you use manual ordering.
          </Text>
        </div>

        <div className="min-w-0">
          <Text className="text-xsmall text-ui-fg-muted mb-2">Scroll to view the full sheet. Drag artwork to position.</Text>
          <div
            ref={canvasParentRef}
            className="max-h-[80vh] overflow-auto rounded-xl border border-ui-border-base bg-ui-bg-subtle p-3"
          >
            {/* width/height are known synchronously from the variant, so set
                them on the SSR'd element — without them the canvas paints at
                the browser default 300×150 and jumps to full sheet size when
                Fabric initialises post-hydration (the page's 0.26 CLS). */}
            <canvas
              key={initialVariantId}
              ref={htmlCanvasRef}
              width={widthPx > 0 ? widthPx : undefined}
              height={heightPx > 0 ? heightPx : undefined}
              className="block shadow-sm touch-none"
            />
          </div>
        </div>
      </div>
    </div>
  )
}
