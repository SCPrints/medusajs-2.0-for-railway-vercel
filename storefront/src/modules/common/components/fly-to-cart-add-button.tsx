"use client"

import { Button } from "@medusajs/ui"
import type { HttpTypes } from "@medusajs/types"
import { motion } from "framer-motion"
import { useCallback, useEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"

const FLYING_SIZE = 48
const NAV_CART_SELECTOR = "[data-testid='nav-cart-link']"

const squishTransition = { type: "spring" as const, stiffness: 500, damping: 18 }

const MotionAddButton = motion(Button)

const FALLBACK_FLY_IMG = "/branding/sc-prints-logo-transparent.png"

/** Best image for the flying chip: variant thumb, product thumb, first gallery, or brand logo. */
export function resolvePdpFlyImageSrc(
  product: HttpTypes.StoreProduct,
  selectedVariant: HttpTypes.StoreProductVariant | undefined
): string {
  const v = selectedVariant as { thumbnail?: string | null } | undefined
  if (v?.thumbnail) {
    return v.thumbnail
  }
  if (product.thumbnail) {
    return product.thumbnail
  }
  const first = product.images?.[0]?.url
  if (first) {
    return first
  }
  return FALLBACK_FLY_IMG
}

type FlyState = {
  startX: number
  startY: number
  endX: number
  endY: number
  id: string
} | null

type FlyToCartAddButtonProps = {
  onAddToCart: () => void | Promise<void>
  disabled: boolean
  isLoading: boolean
  className?: string
  children: React.ReactNode
  "data-testid"?: string
  /** Thumbnail to animate toward the header cart; use absolute or site-relative URL. */
  flyImageSrc: string
  /** @default z-[210] so it appears above the nav; must stay below modal overlays if needed */
  flyZIndexClass?: string
}

function resolveCartTargetRect(): DOMRect | null {
  const el = document.querySelector(NAV_CART_SELECTOR) as HTMLElement | null
  if (!el) {
    return null
  }
  return el.getBoundingClientRect()
}

/**
 * #1 + #4 from the button animation test page: product chip flies to the nav cart, trigger uses Framer
 * `whileTap` squish. Sets `data-no-squish` so the site-wide CSS press does not double-stack.
 */
export default function FlyToCartAddButton({
  onAddToCart,
  disabled,
  isLoading,
  className,
  children,
  "data-testid": dataTestId,
  flyImageSrc,
  flyZIndexClass = "z-[210]",
}: FlyToCartAddButtonProps) {
  const btnRef = useRef<HTMLButtonElement>(null)
  const [fly, setFly] = useState<FlyState>(null)
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  const startFly = useCallback(() => {
    if (!btnRef.current) {
      return
    }
    const endRect = resolveCartTargetRect()
    if (!endRect) {
      return
    }
    const startRect = btnRef.current.getBoundingClientRect()
    const startX = startRect.left + startRect.width / 2 - FLYING_SIZE / 2
    const startY = startRect.top + startRect.height / 2 - FLYING_SIZE / 2
    const endX = endRect.left + endRect.width / 2 - FLYING_SIZE / 2
    const endY = endRect.top + endRect.height / 2 - FLYING_SIZE / 2
    setFly({
      id: `${Date.now()}`,
      startX,
      startY,
      endX,
      endY,
    })
  }, [])

  const handleClick = () => {
    if (disabled) {
      return
    }
    startFly()
    void onAddToCart()
  }

  const flyLayer =
    mounted &&
    fly &&
    createPortal(
      <motion.div
        key={fly.id}
        className={`pointer-events-none fixed ${flyZIndexClass} h-12 w-12 overflow-hidden rounded-lg border border-ui-border-base bg-ui-bg-base shadow-md`}
        style={{ left: 0, top: 0 }}
        initial={{ x: fly.startX, y: fly.startY, scale: 0.4, opacity: 0.95 }}
        animate={{ x: fly.endX, y: fly.endY, scale: 1, opacity: 1 }}
        transition={{ type: "spring", stiffness: 85, damping: 20, mass: 1.8 }}
        onAnimationComplete={() => setFly(null)}
        aria-hidden
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- dynamic CDN URLs, avoid next.config remotePattern churn */}
        <img
          src={flyImageSrc}
          alt=""
          width={FLYING_SIZE}
          height={FLYING_SIZE}
          className="h-full w-full object-contain p-0.5"
        />
      </motion.div>,
      document.body
    )

  return (
    <>
      <MotionAddButton
        ref={btnRef}
        type="button"
        data-no-squish
        onClick={handleClick}
        disabled={disabled}
        isLoading={isLoading}
        variant="primary"
        className={className}
        data-testid={dataTestId}
        whileTap={disabled || isLoading ? undefined : { scale: 0.95 }}
        transition={squishTransition}
      >
        {children}
      </MotionAddButton>
      {flyLayer}
    </>
  )
}
