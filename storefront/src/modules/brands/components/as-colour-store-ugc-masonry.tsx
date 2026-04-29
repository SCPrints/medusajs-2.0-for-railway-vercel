"use client"

import { clx } from "@medusajs/ui"
import { motion } from "framer-motion"
import Image from "next/image"
import { useCallback, useRef, useState, useSyncExternalStore } from "react"

const BASE = "/images/brands/as-colour/ugc"

/** Listing card: ~10px lift, 1.04 scale, img scale 110%, tilt from pointer (~±7°); UGC pushes each harder. */
const UGC_LIFT_PX = 28
const UGC_SCALE = 1.12
/** Pointer tilt range matches listing (−0.5…0.5); coefficients ~3× the listing card (~12/14 vs ~6/7). */
const UGC_ROTATE_X_COEFF = -34
const UGC_ROTATE_Y_COEFF = 40

const TILT_SPRING = { type: "spring" as const, stiffness: 320, damping: 22 }
const LIFT_SPRING = { type: "spring" as const, stiffness: 300, damping: 24 }

function subscribeReducedMotion(cb: () => void) {
  const mq = window.matchMedia("(prefers-reduced-motion: reduce)")
  mq.addEventListener("change", cb)
  return () => mq.removeEventListener("change", cb)
}

function getReducedMotionSnapshot() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches
}

function getReducedMotionServerSnapshot() {
  return false
}

const TILES: { src: string; frameClass: string; alt: string }[] = [
  { src: `${BASE}/ugc-1.png`, frameClass: "aspect-[3/4]", alt: "" },
  { src: `${BASE}/ugc-2.png`, frameClass: "aspect-[4/3]", alt: "" },
  { src: `${BASE}/ugc-3.png`, frameClass: "aspect-[5/4]", alt: "" },
  { src: `${BASE}/ugc-4.png`, frameClass: "aspect-square", alt: "" },
  { src: `${BASE}/ugc-5.png`, frameClass: "aspect-[3/5]", alt: "" },
  { src: `${BASE}/ugc-6.png`, frameClass: "aspect-[4/5]", alt: "" },
]

type UgcPhotoTileProps = {
  src: string
  frameClass: string
  alt: string
}

/**
 * Same interaction model as {@link ProductListingCard} `tiltLift` + {@link CardImage} zoom,
 * with exaggerated lift, scale, tilt, shadow, and inner image scale.
 */
function UgcPhotoTile({ src, frameClass, alt }: UgcPhotoTileProps) {
  const prefersReducedMotion = useSyncExternalStore(
    subscribeReducedMotion,
    getReducedMotionSnapshot,
    getReducedMotionServerSnapshot
  )
  const [rotate, setRotate] = useState({ x: 0, y: 0 })
  const [pointerInside, setPointerInside] = useState(false)
  const rootRef = useRef<HTMLElement | null>(null)

  const onPointerMove = useCallback(
    (e: React.PointerEvent<HTMLElement>) => {
      if (prefersReducedMotion || !rootRef.current) {
        return
      }
      const b = rootRef.current.getBoundingClientRect()
      const px = (e.clientX - b.left) / b.width - 0.5
      const py = (e.clientY - b.top) / b.height - 0.5
      setRotate({ x: py * UGC_ROTATE_X_COEFF, y: px * UGC_ROTATE_Y_COEFF })
    },
    [prefersReducedMotion]
  )

  const onPointerLeave = useCallback(() => {
    setPointerInside(false)
    setRotate({ x: 0, y: 0 })
  }, [])

  const onPointerEnter = useCallback(() => {
    setPointerInside(true)
  }, [])

  const chrome = (
    <div className={clx("relative w-full overflow-hidden rounded-lg bg-ui-bg-subtle p-2 shadow-elevation-card-rest transition-shadow duration-150 ease-out", "group-hover:shadow-elevation-card-hover")}>
      <div className={clx("relative w-full overflow-hidden rounded-md bg-neutral-950", frameClass)}>
        <Image
          src={src}
          alt={alt}
          fill
          className="object-cover transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] will-change-transform group-hover:scale-[1.28]"
          sizes="(max-width: 768px) 42vw, 28vw"
        />
      </div>
    </div>
  )

  const articleClass = clx(
    "group relative w-full break-inside-avoid rounded-xl border border-ui-border-base bg-white p-2 shadow-elevation-card-rest",
    "transform-gpu transition-[border-color,box-shadow] duration-300 ease-out will-change-transform",
    "hover:border-[var(--brand-secondary)]/80 hover:shadow-[0_28px_55px_-12px_rgba(0,0,0,0.38)] hover:shadow-elevation-card-hover"
  )

  if (prefersReducedMotion) {
    return (
      <article
        ref={rootRef}
        className={clx(
          articleClass,
          "mb-3",
          "motion-reduce:z-0 motion-reduce:hover:z-30",
          "motion-reduce:transition-[transform,box-shadow,border-color] motion-reduce:duration-300 motion-reduce:hover:-translate-y-6 motion-reduce:hover:scale-[1.1]"
        )}
      >
        {chrome}
      </article>
    )
  }

  return (
    <div style={{ perspective: 760 }} className="mb-3 break-inside-avoid [transform-style:preserve-3d]">
      <motion.article
        ref={rootRef}
        onPointerEnter={onPointerEnter}
        onPointerMove={onPointerMove}
        onPointerLeave={onPointerLeave}
        animate={{
          rotateX: rotate.x,
          rotateY: rotate.y,
          y: pointerInside ? -UGC_LIFT_PX : 0,
          scale: pointerInside ? UGC_SCALE : 1,
        }}
        transition={{
          rotateX: TILT_SPRING,
          rotateY: TILT_SPRING,
          y: LIFT_SPRING,
          scale: LIFT_SPRING,
        }}
        style={{ transformStyle: "preserve-3d" }}
        className={clx(articleClass, pointerInside ? "z-30" : "z-0")}
      >
        {chrome}
      </motion.article>
    </div>
  )
}

/**
 * Decorative UGC-style photo strip for the AS Colour catalog view.
 * Column masonry + listing-card-style hover (extra exaggerated).
 */
export default function AsColourStoreUgcMasonry() {
  return (
    <section
      className="relative mb-10 overflow-visible rounded-xl border border-ui-border-base/70 bg-gradient-to-b from-ui-bg-base to-ui-bg-subtle/80 p-3 pb-8 sm:p-4"
      aria-label="Community and lifestyle imagery"
    >
      <p className="mb-4 text-small-regular uppercase tracking-[0.2em] text-ui-fg-muted">
        In the studio
      </p>
      <div className="columns-2 gap-3 pb-4 pt-2 [column-gap:1rem] md:columns-3 md:[column-gap:1.25rem]">
        {TILES.map((tile) => (
          <UgcPhotoTile key={tile.src} {...tile} />
        ))}
      </div>
    </section>
  )
}
