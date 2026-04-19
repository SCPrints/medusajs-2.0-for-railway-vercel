"use client"

import { addToCart } from "@lib/data/cart"
import CanvasStage from "@modules/customizer/components/canvas-stage"
import InputPanel from "@modules/customizer/components/input-panel"
import ManagementPanel from "@modules/customizer/components/management-panel"
import PricingPanel from "@modules/customizer/components/pricing-panel"
import SideSelector from "@modules/customizer/components/side-selector"
import {
  extractRenderArtifactUrl,
  normalizePersistedArtifactUrl,
} from "@modules/customizer/lib/artifact-url"
import { calculatePricing } from "@modules/customizer/lib/pricing"
import { CustomizerMetadata, GarmentSide, SizeQuantity } from "@modules/customizer/lib/types"
import { HttpTypes } from "@medusajs/types"
import { useParams } from "next/navigation"
import { useEffect, useMemo, useRef, useState } from "react"
import * as fabric from "fabric"

const DESIGN_SIDES: GarmentSide[] = ["front", "back", "left_sleeve", "right_sleeve"]
const MAX_UPLOAD_SIZE = 8 * 1024 * 1024
const PRINT_AREA_INCHES = { width: 12, height: 16 }

type CustomizerTemplateProps = {
  defaultGarmentImage: string | null
  defaultGarmentTitle: string | null
  products: HttpTypes.StoreProduct[]
}

const getPrintArea = (width: number, height: number) => ({
  x: width * 0.16,
  y: height * 0.13,
  width: width * 0.68,
  height: height * 0.72,
})

const resolveVariantPrice = (variant?: HttpTypes.StoreProductVariant) => {
  const variantRecord = variant as any
  const calculated = variantRecord?.calculated_price?.calculated_amount
  if (typeof calculated === "number") {
    return calculated
  }

  const amount = variantRecord?.prices?.find((price: any) => typeof price?.amount === "number")?.amount
  if (typeof amount === "number") {
    return amount
  }

  return 0
}

const getSizeOption = (product: HttpTypes.StoreProduct) =>
  product.options?.find((option) => (option.title ?? "").toLowerCase().includes("size"))

const getNonSizeOptions = (product: HttpTypes.StoreProduct) =>
  (product.options ?? []).filter((option) => !(option.title ?? "").toLowerCase().includes("size"))

const variantMatchesNonSizeOptions = (
  variant: HttpTypes.StoreProductVariant,
  product: HttpTypes.StoreProduct,
  reference: HttpTypes.StoreProductVariant
) => {
  const nonSize = getNonSizeOptions(product)
  const refMap = new Map(
    (reference.options ?? []).map((entry) => [entry.option_id, entry.value ?? ""])
  )
  return nonSize.every((opt) => {
    const want = refMap.get(opt.id) ?? ""
    const got = variant.options?.find((e) => e.option_id === opt.id)?.value ?? ""
    return want === got
  })
}

const APPAREL_SIZE_ORDER = [
  "xxs",
  "xs",
  "s",
  "m",
  "l",
  "xl",
  "xxl",
  "2xl",
  "xxxl",
  "3xl",
  "4xl",
  "5xl",
  "one size",
  "os",
  "o/s",
]

const sortSizeLabels = (sizes: string[]): string[] => {
  const rank = (s: string) => {
    const key = s.toLowerCase().trim()
    const idx = APPAREL_SIZE_ORDER.indexOf(key)
    if (idx !== -1) {
      return idx
    }
    const n = parseFloat(key.replace(/[^0-9.]/g, ""))
    if (!Number.isNaN(n)) {
      return 100 + n
    }
    return 1000 + key.charCodeAt(0)
  }
  return [...sizes].sort((a, b) => rank(a) - rank(b))
}

const uniqueSizesForVariant = (
  product: HttpTypes.StoreProduct,
  reference: HttpTypes.StoreProductVariant
): SizeQuantity[] => {
  const sizeOption = getSizeOption(product)
  const pool = (product.variants ?? []).filter((v) =>
    variantMatchesNonSizeOptions(v, product, reference)
  )
  const seen = new Set<string>()
  const sizes: string[] = []
  for (const v of pool) {
    const sizeValue = sizeOption
      ? (v.options?.find((e) => e.option_id === sizeOption.id)?.value ?? "")
      : (v.title ?? "Default")
    if (!sizeValue || seen.has(sizeValue)) {
      continue
    }
    seen.add(sizeValue)
    sizes.push(sizeValue)
  }
  if (!sizes.length) {
    return [{ size: "Default", quantity: 0 }]
  }
  return sortSizeLabels(sizes).map((size) => ({ size, quantity: 0 }))
}

const uniqueOptionValues = (product: HttpTypes.StoreProduct, optionId: string): string[] => {
  const values = new Set<string>()
  for (const v of product.variants ?? []) {
    const val = v.options?.find((e) => e.option_id === optionId)?.value
    if (val) {
      values.add(val)
    }
  }
  return Array.from(values).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
}

const findVariantAfterOptionChange = (
  product: HttpTypes.StoreProduct,
  reference: HttpTypes.StoreProductVariant,
  optionId: string,
  newValue: string
): HttpTypes.StoreProductVariant | undefined => {
  const sizeOption = getSizeOption(product)
  const currentSize = sizeOption
    ? reference.options?.find((e) => e.option_id === sizeOption.id)?.value
    : undefined
  const refMap = new Map(
    (reference.options ?? []).map((e) => [e.option_id, e.value ?? ""])
  )
  const nonSize = getNonSizeOptions(product)
  const matches = (v: HttpTypes.StoreProductVariant, relaxSize: boolean) => {
    if (v.options?.find((e) => e.option_id === optionId)?.value !== newValue) {
      return false
    }
    if (sizeOption && currentSize && !relaxSize) {
      const sv = v.options?.find((e) => e.option_id === sizeOption.id)?.value
      if (sv !== currentSize) {
        return false
      }
    }
    return nonSize.every((opt) => {
      if (opt.id === optionId) {
        return true
      }
      const want = refMap.get(opt.id) ?? ""
      const got = v.options?.find((e) => e.option_id === opt.id)?.value ?? ""
      return want === got
    })
  }
  return (
    product.variants?.find((v) => matches(v, false)) ?? product.variants?.find((v) => matches(v, true))
  )
}

const getObjectId = (object: any) => {
  if (!object.customizerId) {
    object.customizerId = `obj_${Math.random().toString(36).slice(2, 10)}`
  }

  return object.customizerId as string
}

const readFileAsText = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result ?? ""))
    reader.onerror = () => reject(new Error("Unable to read file"))
    reader.readAsText(file)
  })

const readFileAsDataUrl = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result ?? ""))
    reader.onerror = () => reject(new Error("Unable to read file"))
    reader.readAsDataURL(file)
  })

const loadSvgObject = async (svg: string) => {
  const loader = (fabric as any).loadSVGFromString
  if (!loader) {
    throw new Error("SVG loader is unavailable")
  }

  const maybePromise = loader(svg)
  if (maybePromise && typeof maybePromise.then === "function") {
    const result = await maybePromise
    return (fabric as any).util.groupSVGElements(result.objects, result.options)
  }

  return new Promise<any>((resolve, reject) => {
    loader(svg, (objects: any[], options: Record<string, unknown>) => {
      if (!objects?.length) {
        reject(new Error("Could not parse SVG"))
        return
      }
      resolve((fabric as any).util.groupSVGElements(objects, options))
    })
  })
}

export default function CustomizerTemplate({
  defaultGarmentImage,
  defaultGarmentTitle,
  products,
}: CustomizerTemplateProps) {
  const params = useParams()
  const countryCode = String(params?.countryCode ?? "")
  const fabricCanvasRef = useRef<any>(null)
  const htmlCanvasRef = useRef<HTMLCanvasElement>(null)
  const sideLayoutsRef = useRef<Record<GarmentSide, Record<string, unknown>[]>>({
    front: [],
    back: [],
    left_sleeve: [],
    right_sleeve: [],
  })

  const [canvasSize, setCanvasSize] = useState({ width: 0, height: 0 })
  const [currentSide, setCurrentSide] = useState<GarmentSide>("front")
  const [layers, setLayers] = useState<Array<{ id: string; label: string; visible: boolean; locked: boolean }>>([])
  const [selectedLayerId, setSelectedLayerId] = useState<string | null>(null)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [outOfBoundsWarning, setOutOfBoundsWarning] = useState<string | null>(null)
  const [dpiWarning, setDpiWarning] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isRemovingBackground, setIsRemovingBackground] = useState(false)
  const [statusMessage, setStatusMessage] = useState<string | null>(null)
  const [activeProductId, setActiveProductId] = useState<string>(products[0]?.id ?? "")
  const [activeVariantId, setActiveVariantId] = useState<string>(products[0]?.variants?.[0]?.id ?? "")
  const [sizeMatrix, setSizeMatrix] = useState<SizeQuantity[]>([])
  const lastCustomizerProductIdRef = useRef<string | null>(null)

  const printArea = useMemo(
    () => getPrintArea(canvasSize.width, canvasSize.height),
    [canvasSize.height, canvasSize.width]
  )
  const selectedProduct = useMemo(
    () => products.find((product) => product.id === activeProductId) ?? products[0],
    [activeProductId, products]
  )
  const selectedVariant = useMemo(
    () =>
      selectedProduct?.variants?.find((variant) => variant.id === activeVariantId) ??
      selectedProduct?.variants?.[0],
    [activeVariantId, selectedProduct]
  )

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
  const basePriceCents = resolveVariantPrice(selectedVariant)
  const decoratedSidesCount = DESIGN_SIDES.filter(
    (side) => (sideLayoutsRef.current[side] ?? []).length > 0
  ).length
  const totalQty = sizeMatrix.reduce((total, entry) => total + entry.quantity, 0)
  const pricing = calculatePricing({
    basePriceCents,
    decoratedSidesCount,
    totalQuantity: totalQty,
  })

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
      }))

    setLayers(nextLayers)

    const active = canvas.getActiveObject()
    setSelectedLayerId(active ? getObjectId(active) : null)
  }

  const applyPrintClipPath = () => {
    const canvas = fabricCanvasRef.current
    if (!canvas) {
      return
    }

    canvas.clipPath = new (fabric as any).Rect({
      left: printArea.x,
      top: printArea.y,
      width: printArea.width,
      height: printArea.height,
      absolutePositioned: true,
    })
  }

  const clampObjectToBounds = (object: any) => {
    const canvas = fabricCanvasRef.current
    if (!canvas || !object) {
      return
    }

    object.setCoords()
    const bounds = object.getBoundingRect(true, true)
    let nextLeft = object.left ?? 0
    let nextTop = object.top ?? 0
    let isOutside = false

    if (bounds.left < printArea.x) {
      nextLeft += printArea.x - bounds.left
      isOutside = true
    }
    if (bounds.top < printArea.y) {
      nextTop += printArea.y - bounds.top
      isOutside = true
    }
    if (bounds.left + bounds.width > printArea.x + printArea.width) {
      nextLeft -= bounds.left + bounds.width - (printArea.x + printArea.width)
      isOutside = true
    }
    if (bounds.top + bounds.height > printArea.y + printArea.height) {
      nextTop -= bounds.top + bounds.height - (printArea.y + printArea.height)
      isOutside = true
    }

    object.set({ left: nextLeft, top: nextTop })
    object.setCoords()
    canvas.renderAll()

    setOutOfBoundsWarning(
      isOutside ? "Artwork was clipped to stay inside the print area." : null
    )
  }

  const updateDpiWarning = () => {
    const canvas = fabricCanvasRef.current
    const active = canvas?.getActiveObject?.()

    if (!active || active.type !== "image") {
      setDpiWarning(null)
      return
    }

    const sourceWidthPx = Number((active as any).sourceWidthPx ?? 0)
    if (!sourceWidthPx) {
      setDpiWarning(null)
      return
    }

    const renderedWidth = active.getScaledWidth?.() ?? 0
    if (!renderedWidth) {
      setDpiWarning(null)
      return
    }

    const pixelsPerInch = printArea.width / PRINT_AREA_INCHES.width
    const printWidthInches = renderedWidth / pixelsPerInch
    const dpi = sourceWidthPx / Math.max(0.1, printWidthInches)

    if (dpi < 150) {
      setDpiWarning(`Low resolution warning: estimated ${Math.round(dpi)} DPI at current size.`)
      return
    }

    setDpiWarning(null)
  }

  const saveCurrentSide = () => {
    const canvas = fabricCanvasRef.current
    if (!canvas) {
      return
    }

    const serialized = canvas.toJSON([
      "customizerId",
      "customizerLabel",
      "sourceWidthPx",
      "sourceHeightPx",
    ])
    sideLayoutsRef.current[currentSide] = (serialized.objects ?? []) as Record<string, unknown>[]
  }

  const loadSide = async (side: GarmentSide) => {
    const canvas = fabricCanvasRef.current
    if (!canvas) {
      return
    }

    canvas.clear()
    applyPrintClipPath()
    const objects = sideLayoutsRef.current[side] ?? []
    const json = {
      version: "7.0.0",
      objects,
    }
    await (canvas as any).loadFromJSON(json)
    canvas.getObjects().forEach((object: any) => {
      getObjectId(object)
    })
    canvas.renderAll()
    updateLayers()
    updateDpiWarning()
  }

  useEffect(() => {
    if (!selectedProduct?.id) {
      return
    }

    const refVariant =
      selectedProduct.variants?.find((v) => v.id === activeVariantId) ??
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
      if (productChanged) {
        return next.map((row) => ({ ...row }))
      }
      const prevMap = new Map(prev.map((entry) => [entry.size, entry.quantity]))
      return next.map((row) => ({
        size: row.size,
        quantity: prevMap.get(row.size) ?? 0,
      }))
    })
  }, [selectedProduct, activeVariantId])

  useEffect(() => {
    const htmlCanvas = htmlCanvasRef.current
    if (!htmlCanvas) {
      return
    }

    const parent = htmlCanvas.parentElement
    if (!parent) {
      return
    }

    const canvas = new (fabric as any).Canvas(htmlCanvas, {
      preserveObjectStacking: true,
      selection: true,
    })
    fabricCanvasRef.current = canvas

    const syncSize = () => {
      const width = parent.clientWidth
      const height = parent.clientHeight
      canvas.setDimensions({ width, height })
      setCanvasSize({ width, height })
    }

    const syncHandlers = () => {
      updateLayers()
      updateDpiWarning()
      saveCurrentSide()
    }

    syncSize()
    applyPrintClipPath()

    canvas.on("object:moving", (event: any) => clampObjectToBounds(event.target))
    canvas.on("object:scaling", (event: any) => clampObjectToBounds(event.target))
    canvas.on("object:rotating", (event: any) => clampObjectToBounds(event.target))
    canvas.on("object:modified", syncHandlers)
    canvas.on("object:added", syncHandlers)
    canvas.on("object:removed", syncHandlers)
    canvas.on("selection:created", updateLayers)
    canvas.on("selection:updated", updateLayers)
    canvas.on("selection:cleared", updateLayers)

    const observer = new ResizeObserver(syncSize)
    observer.observe(parent)

    return () => {
      observer.disconnect()
      canvas.dispose()
      fabricCanvasRef.current = null
    }
  }, [])

  useEffect(() => {
    applyPrintClipPath()
  }, [printArea.height, printArea.width, printArea.x, printArea.y])

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

    getObjectId(object)
    object.set({
      left: printArea.x + printArea.width / 2 - (object.getScaledWidth?.() ?? 80) / 2,
      top: printArea.y + printArea.height / 2 - (object.getScaledHeight?.() ?? 40) / 2,
    })
    canvas.add(object)
    canvas.setActiveObject(object)
    clampObjectToBounds(object)
    canvas.renderAll()
    updateLayers()
    saveCurrentSide()
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

    if (file.size > MAX_UPLOAD_SIZE) {
      setUploadError("File is too large. Maximum size is 8MB.")
      return
    }

    setUploadError(null)

    if (file.type === "image/svg+xml") {
      const svg = await readFileAsText(file)
      const svgObject = await loadSvgObject(svg)
      svgObject.set({
        customizerLabel: file.name || "SVG",
        sourceWidthPx: Number(svgObject.width ?? 0),
      })
      if (svgObject.scaleToWidth) {
        svgObject.scaleToWidth(printArea.width * 0.35)
      }
      addCanvasObject(svgObject)
      return
    }

    const dataUrl = await readFileAsDataUrl(file)
    const imageObject = await (fabric as any).FabricImage.fromURL(dataUrl)
    imageObject.set({
      customizerLabel: file.name || "Image",
      sourceWidthPx: imageObject.width ?? 0,
      sourceHeightPx: imageObject.height ?? 0,
    })
    imageObject.scaleToWidth?.(printArea.width * 0.35)
    addCanvasObject(imageObject)
  }

  const handleAddText = (input: {
    text: string
    color: string
    fontFamily: string
    letterSpacing: number
  }) => {
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

  const handleAddClipart = async (svg: string) => {
    const clipObject = await loadSvgObject(svg)
    clipObject.set({ customizerLabel: "Clipart" })
    clipObject.scaleToWidth?.(printArea.width * 0.25)
    addCanvasObject(clipObject)
  }

  const handleAddShape = (shape: "rect" | "circle" | "triangle") => {
    const shared = { fill: "#111827", customizerLabel: shape }
    const shapeObject =
      shape === "rect"
        ? new (fabric as any).Rect({ width: 140, height: 90, ...shared })
        : shape === "circle"
        ? new (fabric as any).Circle({ radius: 55, ...shared })
        : new (fabric as any).Triangle({ width: 120, height: 110, ...shared })

    addCanvasObject(shapeObject)
  }

  const runBackgroundRemoval = async () => {
    const canvas = fabricCanvasRef.current
    const active = canvas?.getActiveObject()
    if (!active || active.type !== "image") {
      setUploadError("Select an image layer first.")
      return
    }

    setIsRemovingBackground(true)
    setUploadError(null)

    try {
      const dataUrl = active.toDataURL({ format: "png" })
      const response = await fetch("/api/customizer/remove-background", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dataUrl }),
      })

      const body = await response.json()
      if (!response.ok || typeof body?.dataUrl !== "string") {
        throw new Error(body?.message ?? "Background removal failed")
      }

      const nextImage = await (fabric as any).FabricImage.fromURL(body.dataUrl)
      nextImage.set({
        ...active.toObject(["customizerId", "customizerLabel", "sourceWidthPx", "sourceHeightPx"]),
        customizerLabel: `${active.customizerLabel || "Image"} (BG Removed)`,
      })
      canvas.remove(active)
      canvas.add(nextImage)
      canvas.setActiveObject(nextImage)
      clampObjectToBounds(nextImage)
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : "Background removal failed.")
    } finally {
      setIsRemovingBackground(false)
      saveCurrentSide()
    }
  }

  const selectLayer = (id: string) => {
    const canvas = fabricCanvasRef.current
    const object = canvas?.getObjects().find((entry: any) => getObjectId(entry) === id)
    if (!object) {
      return
    }
    canvas.setActiveObject(object)
    canvas.renderAll()
    updateLayers()
  }

  const toggleLayerVisibility = (id: string) => {
    const canvas = fabricCanvasRef.current
    const object = canvas?.getObjects().find((entry: any) => getObjectId(entry) === id)
    if (!object) {
      return
    }
    object.set({ visible: object.visible === false })
    canvas.renderAll()
    updateLayers()
    saveCurrentSide()
  }

  const toggleLayerLock = (id: string) => {
    const canvas = fabricCanvasRef.current
    const object = canvas?.getObjects().find((entry: any) => getObjectId(entry) === id)
    if (!object) {
      return
    }
    const nextLocked = !object.lockMovementX
    object.set({
      lockMovementX: nextLocked,
      lockMovementY: nextLocked,
      lockScalingX: nextLocked,
      lockScalingY: nextLocked,
      lockRotation: nextLocked,
    })
    updateLayers()
    saveCurrentSide()
  }

  const alignSelection = (mode: "centerX" | "centerY" | "top" | "middle" | "bottom") => {
    const canvas = fabricCanvasRef.current
    const object = canvas?.getActiveObject()
    if (!object) {
      return
    }

    const width = object.getScaledWidth?.() ?? 0
    const height = object.getScaledHeight?.() ?? 0
    const updates: Record<string, number> = {}

    if (mode === "centerX") {
      updates.left = printArea.x + printArea.width / 2 - width / 2
    }
    if (mode === "centerY" || mode === "middle") {
      updates.top = printArea.y + printArea.height / 2 - height / 2
    }
    if (mode === "top") {
      updates.top = printArea.y
    }
    if (mode === "bottom") {
      updates.top = printArea.y + printArea.height - height
    }

    object.set(updates)
    clampObjectToBounds(object)
    saveCurrentSide()
  }

  const recolorSelectedSvg = (nextColor: string) => {
    const canvas = fabricCanvasRef.current
    const object = canvas?.getActiveObject()
    if (!object) {
      return
    }

    const updateColor = (target: any) => {
      if (typeof target.set === "function") {
        if (target.fill) {
          target.set("fill", nextColor)
        }
        if (target.stroke) {
          target.set("stroke", nextColor)
        }
      }

      if (Array.isArray(target._objects)) {
        target._objects.forEach((child: any) => updateColor(child))
      }
    }

    updateColor(object)
    canvas.renderAll()
    saveCurrentSide()
  }

  const changeSizeQuantity = (size: string, quantity: number) => {
    setSizeMatrix((current) =>
      current.map((entry) =>
        entry.size === size
          ? {
              ...entry,
              quantity: Math.max(0, Math.floor(Number.isFinite(quantity) ? quantity : 0)),
            }
          : entry
      )
    )
  }

  const renderSideArtifacts = async (
    side: GarmentSide,
    sideObjects: Record<string, unknown>[]
  ): Promise<{ printUrl: string | null; mockupUrl: string | null }> => {
    const staticCanvas = new (fabric as any).StaticCanvas(null, {
      width: Math.round(printArea.width),
      height: Math.round(printArea.height),
    })
    await staticCanvas.loadFromJSON({
      version: "7.0.0",
      objects: sideObjects,
    })
    const artworkSvg = staticCanvas.toSVG()
    staticCanvas.dispose()

    const payload = {
      side,
      artworkSvg,
      garmentImageUrl: defaultGarmentImage,
      placement: {
        x: Math.round(printArea.x),
        y: Math.round(printArea.y),
        width: Math.round(printArea.width),
        height: Math.round(printArea.height),
      },
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

    const printBody = await printResponse.json()
    const mockupBody = await mockupResponse.json()

    if (!printResponse.ok || !mockupResponse.ok) {
      throw new Error(printBody?.message ?? mockupBody?.message ?? "Render service failed.")
    }

    const printUrl = extractRenderArtifactUrl(printBody?.url)
    const mockupUrl = extractRenderArtifactUrl(mockupBody?.url)

    return {
      printUrl,
      mockupUrl,
    }
  }

  const addCustomizedToCart = async () => {
    if (!selectedProduct || !selectedVariant || !countryCode) {
      setUploadError("Select a product and variant before adding to cart.")
      return
    }

    saveCurrentSide()
    const totalQuantity = sizeMatrix.reduce((total, entry) => total + entry.quantity, 0)
    if (!totalQuantity) {
      setUploadError("Set at least one quantity in the size matrix.")
      return
    }

    const decoratedSides = DESIGN_SIDES.filter((side) => (sideLayoutsRef.current[side] ?? []).length > 0)
    if (!decoratedSides.length) {
      setUploadError("Add at least one design element before checkout.")
      return
    }

    setIsSubmitting(true)
    setStatusMessage(null)
    setUploadError(null)

    try {
      const renderedArtifacts = await Promise.all(
        decoratedSides.map(async (side) => {
          const rendered = await renderSideArtifacts(side, sideLayoutsRef.current[side] ?? [])
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

      const sizeOption = selectedProduct.options?.find((option) =>
        (option.title ?? "").toLowerCase().includes("size")
      )
      const selectedVariantOptions = new Map(
        (selectedVariant.options ?? []).map((entry) => [entry.option_id, entry.value ?? ""])
      )

      const metadataBase: Omit<CustomizerMetadata, "variantId"> = {
        version: 2,
        type: "fabric_customizer",
        productId: selectedProduct.id,
        sideLayouts: DESIGN_SIDES.map((side) => ({
          side,
          objects: sideLayoutsRef.current[side] ?? [],
        })),
        printArea: {
          x: Math.round(printArea.x),
          y: Math.round(printArea.y),
          width: Math.round(printArea.width),
          height: Math.round(printArea.height),
        },
        sizes: sizeMatrix,
        pricing,
        artifacts,
      }

      const resolvedQuantities =
        sizeOption && selectedProduct.variants?.length
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
                  variantId: variant.id,
                  quantity: entry.quantity,
                }
              })
              .filter((entry): entry is { variantId: string; quantity: number } => !!entry && entry.quantity > 0)
          : [{ variantId: selectedVariant.id, quantity: totalQuantity }]

      for (const quantityEntry of resolvedQuantities) {
        const lineItemMetadata: CustomizerMetadata = {
          ...metadataBase,
          variantId: quantityEntry.variantId,
        }

        await addToCart({
          variantId: quantityEntry.variantId,
          quantity: quantityEntry.quantity,
          countryCode,
          metadata: {
            customizerDesign: lineItemMetadata,
          },
        })
      }

      if (artifacts.some((artifact) => !artifact.printUrl || !artifact.mockupUrl)) {
        setStatusMessage(
          "Customized items were added, but hosted print/mockup files are unavailable in this environment."
        )
        return
      }

      setStatusMessage("Customized items were added to your cart.")
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : "Could not add customized product.")
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="content-container py-12 small:py-16">
      <div className="mx-auto max-w-7xl space-y-6">
        <div className="text-center">
          <h1 className="text-3xl font-semibold text-ui-fg-base small:text-4xl">Logo Customizer</h1>
          <p className="mt-3 text-ui-fg-subtle">
            Build print-ready front/back/sleeve designs with live pricing and size matrix ordering.
          </p>
        </div>

        <div className="grid gap-4 lg:grid-cols-[280px_minmax(0,1fr)_300px]">
          <div className="space-y-4">
            <div className="space-y-2 rounded-xl border border-ui-border-base bg-ui-bg-base p-4">
              <label className="text-xs font-medium text-ui-fg-subtle">Garment</label>
              <select
                className="w-full rounded-md border border-ui-border-base px-2 py-2 text-sm"
                value={selectedProduct?.id}
                onChange={(event) => setActiveProductId(event.target.value)}
              >
                {products.map((product) => (
                  <option key={product.id} value={product.id}>
                    {product.title}
                  </option>
                ))}
              </select>
              {nonSizeOptions.length > 0 ? (
                nonSizeOptions.map((option) => {
                  const values = selectedProduct
                    ? uniqueOptionValues(selectedProduct, option.id)
                    : []
                  const current =
                    selectedVariant?.options?.find((entry) => entry.option_id === option.id)?.value ?? ""
                  return (
                    <div key={option.id} className="space-y-1">
                      <label className="text-xs font-medium text-ui-fg-subtle">
                        {option.title ?? "Option"}
                      </label>
                      <select
                        className="w-full rounded-md border border-ui-border-base px-2 py-2 text-sm"
                        value={current}
                        onChange={(event) => handleNonSizeOptionChange(option.id, event.target.value)}
                      >
                        {values.map((value) => (
                          <option key={value} value={value}>
                            {value}
                          </option>
                        ))}
                      </select>
                    </div>
                  )
                })
              ) : (selectedProduct?.variants?.length ?? 0) > 1 ? (
                <>
                  <label className="text-xs font-medium text-ui-fg-subtle">Style</label>
                  <select
                    className="w-full rounded-md border border-ui-border-base px-2 py-2 text-sm"
                    value={selectedVariant?.id}
                    onChange={(event) => setActiveVariantId(event.target.value)}
                  >
                    {(selectedProduct?.variants ?? []).map((variant) => (
                      <option key={variant.id} value={variant.id}>
                        {variant.title}
                      </option>
                    ))}
                  </select>
                </>
              ) : null}
            </div>

            <InputPanel
              onUploadFile={handleUploadFile}
              onAddText={handleAddText}
              onAddCurvedText={handleAddCurvedText}
              onAddClipart={handleAddClipart}
              onAddShape={handleAddShape}
              onRunBackgroundRemoval={runBackgroundRemoval}
              isRemovingBackground={isRemovingBackground}
            />
          </div>

          <div className="space-y-4">
            <div className="rounded-xl border border-ui-border-base bg-ui-bg-base p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-semibold text-ui-fg-base">Core Canvas</p>
                <SideSelector currentSide={currentSide} onSelectSide={switchSide} />
              </div>
              <p className="mt-1 text-xs text-ui-fg-subtle">
                Editing side: <span className="font-medium">{currentSide.replace("_", " ")}</span>
              </p>
            </div>

            <CanvasStage
              garmentImage={defaultGarmentImage}
              garmentTitle={defaultGarmentTitle}
              printArea={printArea}
              outOfBoundsWarning={outOfBoundsWarning}
              dpiWarning={dpiWarning}
              canvasRef={htmlCanvasRef}
            />
          </div>

          <div className="space-y-4">
            <ManagementPanel
              layers={layers}
              selectedLayerId={selectedLayerId}
              onSelectLayer={selectLayer}
              onDeleteLayer={() => {
                const canvas = fabricCanvasRef.current
                const active = canvas?.getActiveObject()
                if (!active) {
                  return
                }
                canvas.remove(active)
                updateLayers()
                saveCurrentSide()
              }}
              onBringForward={() => {
                const canvas = fabricCanvasRef.current
                const active = canvas?.getActiveObject()
                if (!active) {
                  return
                }
                canvas.bringObjectForward(active)
                canvas.renderAll()
                saveCurrentSide()
              }}
              onSendBackward={() => {
                const canvas = fabricCanvasRef.current
                const active = canvas?.getActiveObject()
                if (!active) {
                  return
                }
                canvas.sendObjectBackwards(active)
                canvas.renderAll()
                saveCurrentSide()
              }}
              onToggleLayerVisibility={toggleLayerVisibility}
              onToggleLayerLock={toggleLayerLock}
              onAlign={alignSelection}
              onReplaceSvgColor={recolorSelectedSvg}
            />

            <PricingPanel
              currencyCode={currencyCode}
              pricing={pricing}
              sizes={sizeMatrix}
              onChangeSizeQty={changeSizeQuantity}
              onAddToCart={addCustomizedToCart}
              isSubmitting={isSubmitting}
            />
          </div>
        </div>

        {uploadError && (
          <p className="text-sm text-rose-600" role="alert">
            {uploadError}
          </p>
        )}
        {statusMessage && <p className="text-sm text-emerald-700">{statusMessage}</p>}
      </div>
    </div>
  )
}
