"use client"

import { HttpTypes } from "@medusajs/types"
import { Container } from "@medusajs/ui"
import Image from "next/image"
import { ChangeEvent, useEffect, useMemo, useState } from "react"

type ImageGalleryProps = {
  images: HttpTypes.StoreProductImage[]
}

const FILE_PREVIEW_LIMIT = 5 * 1024 * 1024

const ImageGallery = ({ images }: ImageGalleryProps) => {
  const [overlayUrl, setOverlayUrl] = useState<string | null>(null)
  const [overlayScale, setOverlayScale] = useState(35)
  const [overlayX, setOverlayX] = useState(50)
  const [overlayY, setOverlayY] = useState(55)
  const [overlayRotation, setOverlayRotation] = useState(0)
  const [overlayOpacity, setOverlayOpacity] = useState(100)
  const [uploadError, setUploadError] = useState<string | null>(null)

  const hasProductImages = images.length > 0
  const canShowOverlay = Boolean(overlayUrl && hasProductImages)

  useEffect(() => {
    return () => {
      if (overlayUrl) {
        URL.revokeObjectURL(overlayUrl)
      }
    }
  }, [overlayUrl])

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
    setOverlayUrl((currentUrl) => {
      if (currentUrl) {
        URL.revokeObjectURL(currentUrl)
      }

      return objectUrl
    })
  }

  const resetOverlay = () => {
    setOverlayScale(35)
    setOverlayX(50)
    setOverlayY(55)
    setOverlayRotation(0)
    setOverlayOpacity(100)
  }

  const clearOverlay = () => {
    setOverlayUrl((currentUrl) => {
      if (currentUrl) {
        URL.revokeObjectURL(currentUrl)
      }

      return null
    })
    resetOverlay()
  }

  const overlayStyle = useMemo(
    () => ({
      left: `${overlayX}%`,
      top: `${overlayY}%`,
      width: `${overlayScale}%`,
      opacity: `${overlayOpacity / 100}`,
      transform: `translate(-50%, -50%) rotate(${overlayRotation}deg)`,
    }),
    [overlayOpacity, overlayRotation, overlayScale, overlayX, overlayY]
  )

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
                <label className="flex flex-col gap-y-1 text-xs text-ui-fg-subtle">
                  Size
                  <input
                    type="range"
                    min={10}
                    max={90}
                    value={overlayScale}
                    onChange={(event) =>
                      setOverlayScale(Number(event.target.value))
                    }
                  />
                </label>
                <label className="flex flex-col gap-y-1 text-xs text-ui-fg-subtle">
                  Horizontal
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={overlayX}
                    onChange={(event) => setOverlayX(Number(event.target.value))}
                  />
                </label>
                <label className="flex flex-col gap-y-1 text-xs text-ui-fg-subtle">
                  Vertical
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={overlayY}
                    onChange={(event) => setOverlayY(Number(event.target.value))}
                  />
                </label>
                <label className="flex flex-col gap-y-1 text-xs text-ui-fg-subtle">
                  Rotation
                  <input
                    type="range"
                    min={-180}
                    max={180}
                    value={overlayRotation}
                    onChange={(event) =>
                      setOverlayRotation(Number(event.target.value))
                    }
                  />
                </label>
                <label className="flex flex-col gap-y-1 text-xs text-ui-fg-subtle small:col-span-2">
                  Opacity
                  <input
                    type="range"
                    min={20}
                    max={100}
                    value={overlayOpacity}
                    onChange={(event) =>
                      setOverlayOpacity(Number(event.target.value))
                    }
                  />
                </label>
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
              </div>
            )}
          </div>
        </Container>

        {images.map((image, index) => {
          const shouldRenderLiveOverlay = canShowOverlay && index === 0

          return (
            <Container
              key={image.id}
              className="relative aspect-[29/34] w-full overflow-hidden bg-ui-bg-subtle"
              id={image.id}
            >
              {!!image.url && (
                <>
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
                  {shouldRenderLiveOverlay && overlayUrl && (
                    <div
                      className="absolute inset-0 pointer-events-none"
                      aria-label="Live design preview overlay"
                    >
                      <img
                        src={overlayUrl}
                        alt="Customer design preview"
                        className="absolute h-auto object-contain drop-shadow-lg"
                        style={overlayStyle}
                      />
                    </div>
                  )}
                </>
              )}
            </Container>
          )
        })}
      </div>
    </div>
  )
}

export default ImageGallery
