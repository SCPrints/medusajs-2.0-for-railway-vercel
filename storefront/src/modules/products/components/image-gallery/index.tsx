"use client"

import { HttpTypes } from "@medusajs/types"
import { Container } from "@medusajs/ui"
import Image from "next/image"
import { ChangeEvent, PointerEvent, useEffect, useMemo, useRef, useState } from "react"
import { usePrintPlacement } from "@modules/products/context/print-placement-context"
import { useProductOptions } from "@modules/products/context/product-options-context"

type ImageGalleryProps = {
  product: HttpTypes.StoreProduct
  images: HttpTypes.StoreProductImage[]
  thumbnail?: string | null
}

const FILE_PREVIEW_LIMIT = 5 * 1024 * 1024
const MIN_OVERLAY_SIZE_PX = 48

const COLOR_OPTION_MATCHER = /(color|colour)/i

const normalizeValue = (value: string) =>
  value
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()

const buildColorNeedles = (colorValue: string) => {
  const normalized = normalizeValue(colorValue)

  if (!normalized) {
    return []
  }

  const words = normalized.split(" ").filter(Boolean)
  const compact = words.join("")
  const joinedWithDash = words.join("-")
  const joinedWithUnderscore = words.join("_")

  return Array.from(new Set([normalized, compact, joinedWithDash, joinedWithUnderscore, ...words]))
}

const optionsAsKeymap = (variantOptions: any[] | undefined) => {
  return (variantOptions ?? []).reduce(
    (acc: Record<string, string | undefined>, varopt: any) => {
      if (varopt.option?.title && varopt.value !== null && varopt.value !== undefined) {
        acc[varopt.option.title] = varopt.value
      }
      return acc
    },
    {}
  )
}

const getVariantMappedImages = (metadata: Record<string, unknown> | undefined) => {
  const garmentImages = metadata?.garment_images

  if (!garmentImages) {
    return []
  }

  if (typeof garmentImages === "string") {
    try {
      const parsed = JSON.parse(garmentImages) as Record<string, unknown>
      const all = Array.isArray(parsed.all) ? parsed.all : []
      return [parsed.front, parsed.back, ...all].filter(
        (value): value is string => typeof value === "string" && value.length > 0
      )
    } catch {
      return []
    }
  }

  if (typeof garmentImages !== "object") {
    return []
  }

  const obj = garmentImages as Record<string, unknown>
  const all = Array.isArray(obj.all) ? obj.all : []
  return [obj.front, obj.back, ...all].filter(
    (value): value is string => typeof value === "string" && value.length > 0
  )
}

const ImageGallery = ({ product, images, thumbnail }: ImageGalleryProps) => {
  const { overlayUrl, placement, setOverlayPreview, setPlacement, resetPlacement } =
    usePrintPlacement()
  const { options } = useProductOptions()
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [printAreaSize, setPrintAreaSize] = useState({ width: 0, height: 0 })
  const printAreaRef = useRef<HTMLDivElement>(null)
  const objectUrlRef = useRef<string | null>(null)
  const [interaction, setInteraction] = useState<
    | null
    | {
        mode: "drag" | "resize"
        pointerId: number
        originX: number
        originY: number
        startX: number
        startY: number
        startWidth: number
        startHeight: number
      }
  >(null)

  const galleryImages = useMemo(() => {
    const validImages = images
      .filter((image) => Boolean(image.url))
      .map((image) => ({
        id: image.id,
        url: image.url as string,
      }))

    const selectedVariant = (product.variants ?? []).find((variant) => {
      const variantOptions = optionsAsKeymap((variant as any).options)
      const selectedEntries = Object.entries(options).filter(([, value]) => Boolean(value))

      if (!selectedEntries.length) {
        return false
      }

      return selectedEntries.every(([title, value]) => value === variantOptions[title])
    })

    const mappedVariantImages = getVariantMappedImages(
      (selectedVariant as any)?.metadata as Record<string, unknown> | undefined
    )

    if (mappedVariantImages.length) {
      const matched = mappedVariantImages
        .map((mappedUrl) => validImages.find((image) => image.url === mappedUrl))
        .filter(Boolean) as Array<{ id: string; url: string }>

      if (matched.length) {
        const unmatched = validImages.filter((image) => !matched.some((m) => m.id === image.id))
        return [...matched, ...unmatched]
      }
    }

    const selectedColor = Object.entries(options).find(([title]) =>
      COLOR_OPTION_MATCHER.test(title)
    )?.[1]

    if (!selectedColor || validImages.length <= 1) {
      return validImages
    }

    const needles = buildColorNeedles(selectedColor)
    if (!needles.length) {
      return validImages
    }

    const normalizedImages = validImages.map((image) => ({
      ...image,
      normalizedUrl: normalizeValue(image.url),
    }))

    const matched = normalizedImages.filter((image) =>
      needles.some((needle) => image.normalizedUrl.includes(needle))
    )

    if (!matched.length) {
      return validImages
    }

    const unmatched = normalizedImages.filter((image) => !matched.some((m) => m.id === image.id))

    return [...matched, ...unmatched].map(({ normalizedUrl: _normalizedUrl, ...image }) => image)
  }, [images, options, product.variants])

  const fallbackImages = useMemo(() => {
    if (galleryImages.length > 0) {
      return galleryImages
    }

    if (thumbnail) {
      return [{ id: "thumbnail-fallback", url: thumbnail }]
    }

    return []
  }, [galleryImages, thumbnail])

  const hasProductImages = fallbackImages.length > 0
  const canShowOverlay =
    Boolean(overlayUrl) && printAreaSize.width > 0 && printAreaSize.height > 0

  useEffect(() => {
    const currentPrintArea = printAreaRef.current

    if (!currentPrintArea) {
      return
    }

    const updateSize = () => {
      setPrintAreaSize({
        width: currentPrintArea.clientWidth,
        height: currentPrintArea.clientHeight,
      })
    }

    updateSize()

    const resizeObserver = new ResizeObserver(updateSize)
    resizeObserver.observe(currentPrintArea)

    return () => {
      resizeObserver.disconnect()

      if (objectUrlRef.current) {
        URL.revokeObjectURL(objectUrlRef.current)
        objectUrlRef.current = null
      }
    }
  }, [])

  const handleFileUpload = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]

    if (!file) {
      return
    }

    if (!file.type.startsWith("image/")) {
      setUploadError("Please upload a valid image file.")
      return
    }

    if (file.size > FILE_PREVIEW_LIMIT) {
      setUploadError("Image is too large. Please upload a file under 5MB.")
      return
    }

    setUploadError(null)

    const objectUrl = URL.createObjectURL(file)

    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current)
    }

    objectUrlRef.current = objectUrl
    setOverlayPreview({ url: objectUrl, fileName: file.name })
  }

  const resetOverlay = () => {
    resetPlacement()
  }

  const clearOverlay = () => {
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current)
      objectUrlRef.current = null
    }

    setOverlayPreview(null)
    resetOverlay()
  }

  const rndPosition = useMemo(
    () => ({
      x: (placement.xPct / 100) * printAreaSize.width,
      y: (placement.yPct / 100) * printAreaSize.height,
    }),
    [placement.xPct, placement.yPct, printAreaSize.height, printAreaSize.width]
  )

  const rndSize = useMemo(
    () => ({
      width: (placement.widthPct / 100) * printAreaSize.width,
      height: (placement.heightPct / 100) * printAreaSize.height,
    }),
    [placement.heightPct, placement.widthPct, printAreaSize.height, printAreaSize.width]
  )

  const updatePlacementFromPixels = ({
    x,
    y,
    width,
    height,
  }: {
    x: number
    y: number
    width: number
    height: number
  }) => {
    if (!printAreaSize.width || !printAreaSize.height) {
      return
    }

    setPlacement({
      ...placement,
      xPct: Number(((x / printAreaSize.width) * 100).toFixed(3)),
      yPct: Number(((y / printAreaSize.height) * 100).toFixed(3)),
      widthPct: Number(((width / printAreaSize.width) * 100).toFixed(3)),
      heightPct: Number(((height / printAreaSize.height) * 100).toFixed(3)),
    })
  }

  const beginInteraction = (
    event: PointerEvent<HTMLElement>,
    mode: "drag" | "resize"
  ) => {
    event.preventDefault()
    event.stopPropagation()

    setInteraction({
      mode,
      pointerId: event.pointerId,
      originX: event.clientX,
      originY: event.clientY,
      startX: rndPosition.x,
      startY: rndPosition.y,
      startWidth: rndSize.width,
      startHeight: rndSize.height,
    })
  }

  const handlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (!interaction || interaction.pointerId !== event.pointerId) {
      return
    }

    const deltaX = event.clientX - interaction.originX
    const deltaY = event.clientY - interaction.originY

    if (interaction.mode === "drag") {
      const boundedX = Math.max(
        0,
        Math.min(
          interaction.startX + deltaX,
          printAreaSize.width - interaction.startWidth
        )
      )
      const boundedY = Math.max(
        0,
        Math.min(
          interaction.startY + deltaY,
          printAreaSize.height - interaction.startHeight
        )
      )

      updatePlacementFromPixels({
        x: boundedX,
        y: boundedY,
        width: interaction.startWidth,
        height: interaction.startHeight,
      })
      return
    }

    const nextWidth = Math.max(
      MIN_OVERLAY_SIZE_PX,
      Math.min(interaction.startWidth + deltaX, printAreaSize.width - interaction.startX)
    )
    const nextHeight = Math.max(
      MIN_OVERLAY_SIZE_PX,
      Math.min(
        interaction.startHeight + deltaY,
        printAreaSize.height - interaction.startY
      )
    )

    updatePlacementFromPixels({
      x: interaction.startX,
      y: interaction.startY,
      width: nextWidth,
      height: nextHeight,
    })
  }

  const endInteraction = (event: PointerEvent<HTMLDivElement>) => {
    if (!interaction || interaction.pointerId !== event.pointerId) {
      return
    }

    setInteraction(null)
  }

  return (
    <div className="flex items-start relative">
      <div className="flex flex-col flex-1 small:mx-16 gap-y-4">
        <Container className="p-4 border border-ui-border-base rounded-rounded bg-ui-bg-base">
          <div className="flex flex-col gap-y-4">
            <div>
              <p className="text-sm font-medium text-ui-fg-base">
                Upload your image
              </p>
              <p className="text-xs text-ui-fg-subtle mt-1">
                See your design live on the garment and adjust placement.
              </p>
            </div>

            <input
              type="file"
              accept="image/*"
              onChange={handleFileUpload}
              className="text-xs file:mr-4 file:rounded-rounded file:border-0 file:bg-ui-button-neutral file:px-3 file:py-2 file:text-xs file:font-medium file:text-ui-fg-base hover:file:bg-ui-button-neutral-hover"
              aria-label="Upload design image for live garment preview"
            />

            {uploadError && (
              <p className="text-xs text-rose-600" role="alert">
                {uploadError}
              </p>
            )}

            {overlayUrl && (
              <div className="grid grid-cols-1 gap-3 small:grid-cols-2">
                <div className="flex items-center gap-x-2 small:col-span-2">
                  <button
                    type="button"
                    onClick={resetOverlay}
                    className="text-xs px-3 py-2 rounded-rounded border border-ui-border-base hover:bg-ui-bg-base-hover"
                  >
                    Reset adjustments
                  </button>
                  <button
                    type="button"
                    onClick={clearOverlay}
                    className="text-xs px-3 py-2 rounded-rounded border border-ui-border-base hover:bg-ui-bg-base-hover"
                  >
                    Remove image
                  </button>
                </div>
                <p className="text-xs text-ui-fg-subtle small:col-span-2">
                  Drag and resize directly on the garment. Placement is saved
                  with your cart item.
                </p>
              </div>
            )}
          </div>
        </Container>

        {!hasProductImages && (
          <Container className="relative aspect-[29/34] w-full overflow-hidden bg-ui-bg-subtle p-6 flex items-center justify-center">
            <p className="text-sm text-ui-fg-subtle text-center">
              No garment image is available for this product yet.
            </p>
          </Container>
        )}

        {fallbackImages.map((image, index) => {
          const shouldRenderLiveOverlay = index === 0

          return (
            <Container
              key={image.id}
              className="relative aspect-[29/34] w-full overflow-hidden bg-ui-bg-subtle"
              id={image.id}
            >
              <Image
                src={image.url}
                priority={index <= 2 ? true : false}
                className="absolute inset-0 rounded-rounded"
                alt={`Product image ${index + 1}`}
                fill
                sizes="(max-width: 576px) 280px, (max-width: 768px) 360px, (max-width: 992px) 480px, 800px"
                style={{
                  objectFit: "cover",
                }}
              />
              {shouldRenderLiveOverlay && (
                <div
                  ref={printAreaRef}
                  className="absolute inset-0"
                  aria-label="Design placement area"
                  onPointerMove={handlePointerMove}
                  onPointerUp={endInteraction}
                  onPointerCancel={endInteraction}
                >
                  {canShowOverlay && overlayUrl && (
                    <div
                      className="absolute border border-white/90 bg-white/5 cursor-move touch-none"
                      style={{
                        left: rndPosition.x,
                        top: rndPosition.y,
                        width: rndSize.width,
                        height: rndSize.height,
                      }}
                      onPointerDown={(event) => beginInteraction(event, "drag")}
                    >
                      <img
                        src={overlayUrl}
                        alt="Customer design preview"
                        className="h-full w-full object-contain drop-shadow-lg"
                        draggable={false}
                      />
                      <button
                        type="button"
                        className="absolute -bottom-2 -right-2 h-4 w-4 rounded-full border border-white bg-black/80 cursor-se-resize"
                        aria-label="Resize design"
                        onPointerDown={(event) => beginInteraction(event, "resize")}
                      />
                    </div>
                  )}
                </div>
              )}
            </Container>
          )
        })}
      </div>
    </div>
  )
}

export default ImageGallery
