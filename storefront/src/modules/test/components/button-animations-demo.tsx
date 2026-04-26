"use client"

import { CheckCircleSolid, Spinner } from "@medusajs/icons"
import confetti from "canvas-confetti"
import { motion } from "framer-motion"
import Image from "next/image"
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type MouseEvent,
} from "react"
import { createPortal } from "react-dom"

const FLYING_SIZE = 48
const NAV_CART_SELECTOR = "[data-testid='nav-cart-link']"
const FLYING_IMG = "/branding/sc-prints-logo-transparent.png"

type FlyPayload = {
  startX: number
  startY: number
  endX: number
  endY: number
  id: string
} | null

type MorphState = "idle" | "adding" | "success"

type Ripple = { id: string; x: number; y: number }

const squishTransition = { type: "spring" as const, stiffness: 500, damping: 18 }

function canVibrate() {
  return (
    typeof navigator !== "undefined" && typeof navigator.vibrate === "function"
  )
}

let earconContext: AudioContext | null = null

/** Soft UI “click” for demos — no asset file. Swap to `use-sound` + a tiny MP3 in production if you prefer. */
function playAddEarcon() {
  if (typeof window === "undefined") {
    return
  }
  const Ctor =
    window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
  if (!Ctor) {
    return
  }
  if (!earconContext) {
    earconContext = new Ctor()
  }
  const ctx = earconContext
  if (ctx.state === "suspended") {
    void ctx.resume()
  }
  const t0 = ctx.currentTime
  const osc = ctx.createOscillator()
  const gain = ctx.createGain()
  osc.type = "sine"
  osc.frequency.setValueAtTime(640, t0)
  osc.frequency.exponentialRampToValueAtTime(380, t0 + 0.06)
  gain.gain.setValueAtTime(0.0001, t0)
  gain.gain.exponentialRampToValueAtTime(0.07, t0 + 0.012)
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.11)
  osc.connect(gain)
  gain.connect(ctx.destination)
  try {
    osc.start(t0)
    osc.stop(t0 + 0.12)
  } catch {
    // ignore: already stopped or suspended context
  }
}

function fireConfettiAtClientPoint(clientX: number, clientY: number) {
  const x = clientX / window.innerWidth
  const y = clientY / window.innerHeight
  confetti({
    particleCount: 64,
    spread: 70,
    origin: { x, y },
    startVelocity: 28,
    ticks: 120,
  })
}

function Section({
  title,
  description,
  children,
}: {
  title: string
  description: string
  children: React.ReactNode
}) {
  return (
    <section className="border border-ui-border-base rounded-lg p-6 bg-ui-bg-subtle">
      <h2 className="text-lg font-semibold text-ui-fg-base">{title}</h2>
      <p className="mt-1 text-sm text-ui-fg-muted max-w-3xl">{description}</p>
      <div className="mt-5">{children}</div>
    </section>
  )
}

function FlyToCartButton({
  onFlyComplete,
  demoCartRef,
  withSquish = false,
}: {
  onFlyComplete: () => void
  demoCartRef: React.RefObject<HTMLButtonElement | null>
  /** Pair with the tactile #4 “squish” (whileTap scale) on the same control. */
  withSquish?: boolean
}) {
  const btnRef = useRef<HTMLButtonElement>(null)
  const [fly, setFly] = useState<FlyPayload>(null)
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  const resolveEndRect = useCallback((): DOMRect | null => {
    const nav = document.querySelector(
      NAV_CART_SELECTOR
    ) as HTMLElement | null
    if (nav) {
      return nav.getBoundingClientRect()
    }
    if (demoCartRef.current) {
      return demoCartRef.current.getBoundingClientRect()
    }
    return null
  }, [demoCartRef])

  const handleAdd = useCallback(() => {
    if (!btnRef.current) {
      return
    }
    const endRect = resolveEndRect()
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
  }, [resolveEndRect])

  const flyOverlay =
    mounted &&
    fly &&
    createPortal(
      <motion.div
        key={fly.id}
        className="pointer-events-none fixed z-[200] h-12 w-12 overflow-hidden rounded-lg border border-ui-border-base bg-ui-bg-base shadow-md"
        style={{ left: 0, top: 0 }}
        initial={{ x: fly.startX, y: fly.startY, scale: 0.4, opacity: 0.95 }}
        animate={{ x: fly.endX, y: fly.endY, scale: 1, opacity: 1 }}
        transition={{ type: "spring", stiffness: 85, damping: 20, mass: 1.8 }}
        onAnimationComplete={() => {
          setFly(null)
          onFlyComplete()
        }}
      >
        <Image
          src={FLYING_IMG}
          alt=""
          width={FLYING_SIZE}
          height={FLYING_SIZE}
          className="h-full w-full object-contain p-0.5"
        />
      </motion.div>,
      document.body
    )

  const triggerClassName =
    "min-w-[160px] rounded-md bg-ui-fg-base px-4 py-2.5 text-sm font-medium text-ui-bg-base transition-colors hover:opacity-90"

  return (
    <>
      {withSquish ? (
        <motion.button
          type="button"
          ref={btnRef}
          onClick={handleAdd}
          whileTap={{ scale: 0.95 }}
          transition={squishTransition}
          className={triggerClassName}
        >
          Add to cart
        </motion.button>
      ) : (
        <button
          type="button"
          ref={btnRef}
          onClick={handleAdd}
          className={triggerClassName}
        >
          Add to cart
        </button>
      )}
      {flyOverlay}
    </>
  )
}

function MorphAddButton() {
  const [state, setState] = useState<MorphState>("idle")

  const handleClick = () => {
    if (state !== "idle") {
      return
    }
    setState("adding")
    window.setTimeout(() => {
      setState("success")
      window.setTimeout(() => {
        setState("idle")
      }, 2000)
    }, 800)
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={state === "adding"}
      className={[
        "flex min-w-[200px] items-center justify-center gap-2 rounded-md px-4 py-2.5 text-sm font-medium transition-[background-color,color,box-shadow,transform] duration-300",
        state === "success"
          ? "bg-emerald-600 text-white"
          : "bg-zinc-900 text-white hover:bg-zinc-800",
        state === "adding" && "cursor-wait opacity-90",
      ].join(" ")}
    >
      {state === "adding" && (
        <Spinner className="h-4 w-4 animate-spin text-inherit" />
      )}
      {state === "success" && (
        <CheckCircleSolid className="h-4 w-4 text-white" />
      )}
      <span>
        {state === "adding" && "Adding…"}
        {state === "success" && "Added!"}
        {state === "idle" && "Add to cart"}
      </span>
    </button>
  )
}

function ConfettiAddButton() {
  const ref = useRef<HTMLButtonElement>(null)
  return (
    <button
      type="button"
      ref={ref}
      onClick={(e) => {
        if (ref.current) {
          const r = ref.current.getBoundingClientRect()
          const cx = r.left + r.width / 2
          const cy = r.top + r.height / 2
          fireConfettiAtClientPoint(cx, cy)
        } else {
          fireConfettiAtClientPoint(e.clientX, e.clientY)
        }
      }}
      className="min-w-[160px] rounded-md bg-amber-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-amber-500"
    >
      Celebrate add
    </button>
  )
}

function SquishAddButton() {
  return (
    <motion.button
      type="button"
      whileTap={{ scale: 0.95 }}
      transition={squishTransition}
      className="min-w-[160px] rounded-md bg-slate-800 px-4 py-2.5 text-sm font-medium text-white"
    >
      Add to cart
    </motion.button>
  )
}

function RippleAddButton() {
  const [ripples, setRipples] = useState<Ripple[]>([])

  const addRipple = (e: MouseEvent<HTMLButtonElement>) => {
    const t = e.currentTarget
    const r = t.getBoundingClientRect()
    const x = e.clientX - r.left
    const y = e.clientY - r.top
    const id = `r-${Date.now()}-${Math.random().toString(16).slice(2)}`
    setRipples((prev) => [...prev, { id, x, y }])
  }

  return (
    <button
      type="button"
      onClick={addRipple}
      className="relative min-w-[200px] overflow-hidden rounded-md bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-indigo-500"
    >
      {ripples.map((ripple) => (
        <motion.span
          key={ripple.id}
          className="pointer-events-none absolute rounded-full bg-white/40"
          style={{
            left: ripple.x,
            top: ripple.y,
            width: 8,
            height: 8,
            marginLeft: -4,
            marginTop: -4,
          }}
          initial={{ scale: 0, opacity: 0.5 }}
          animate={{ scale: 20, opacity: 0 }}
          transition={{ duration: 0.55, ease: "easeOut" }}
          onAnimationComplete={() => {
            setRipples((prev) => prev.filter((x) => x.id !== ripple.id))
          }}
        />
      ))}
      <span className="relative z-[1]">Add to cart</span>
    </button>
  )
}

function HapticAddButton() {
  const [last, setLast] = useState<string>("—")
  return (
    <div className="flex flex-wrap items-center gap-4">
      <button
        type="button"
        onClick={() => {
          if (canVibrate()) {
            navigator.vibrate(50)
            setLast("Vibration sent (50ms).")
          } else {
            setLast("Not available in this browser / device.")
          }
        }}
        className="min-w-[160px] rounded-md bg-teal-700 px-4 py-2.5 text-sm font-medium text-white hover:bg-teal-600"
      >
        Add (haptic)
      </button>
      <p className="text-xs text-ui-fg-muted max-w-sm">
        Status: {last} Use Chrome on Android for hardware vibration; iOS
        Safari does not expose this API to web pages in most cases.
      </p>
    </div>
  )
}

const COIN_PERSPECTIVE = 900

function CoinFlip3DButton() {
  const [flipped, setFlipped] = useState(false)
  return (
    <div
      className="inline-block"
      style={{ perspective: `${COIN_PERSPECTIVE}px` }}
    >
      <motion.button
        type="button"
        onClick={() => {
          if (flipped) {
            return
          }
          setFlipped(true)
          window.setTimeout(() => setFlipped(false), 2200)
        }}
        className="relative h-11 w-[200px] cursor-pointer select-none border-0 p-0 [transform-style:preserve-3d] rounded-md outline-none"
        style={{ transformStyle: "preserve-3d" }}
        animate={{ rotateX: flipped ? 180 : 0 }}
        transition={{ type: "spring", stiffness: 95, damping: 16, mass: 0.6 }}
        aria-pressed={flipped}
      >
        <span
          className="absolute inset-0 z-0 flex items-center justify-center rounded-md bg-zinc-900 text-sm font-medium text-white"
          style={{
            backfaceVisibility: "hidden",
            WebkitBackfaceVisibility: "hidden",
          }}
        >
          Add to cart
        </span>
        <span
          className="absolute inset-0 z-0 flex items-center justify-center gap-1.5 rounded-md bg-emerald-600 text-sm font-medium text-white [transform:rotateX(180deg)]"
          style={{
            backfaceVisibility: "hidden",
            WebkitBackfaceVisibility: "hidden",
          }}
        >
          <CheckCircleSolid className="h-4 w-4 shrink-0" />
          Added
        </span>
      </motion.button>
    </div>
  )
}

const SLOT_H = 40

function SlotMachineTextButton() {
  const [slid, setSlid] = useState(false)
  return (
    <button
      type="button"
      onClick={() => {
        if (slid) {
          return
        }
        setSlid(true)
        window.setTimeout(() => setSlid(false), 2000)
      }}
      className="relative h-10 w-[200px] overflow-hidden rounded-md border border-ui-border-base bg-violet-700 px-0 text-sm font-medium text-white hover:bg-violet-600"
    >
      <motion.div
        className="flex flex-col"
        animate={{ y: slid ? -SLOT_H : 0 }}
        transition={{ type: "spring", stiffness: 420, damping: 32 }}
        style={{ willChange: "transform" }}
      >
        <div className="flex h-10 items-center justify-center">Add to cart</div>
        <div className="flex h-10 items-center justify-center">Added!</div>
      </motion.div>
    </button>
  )
}

function ProgressFillButton() {
  const [phase, setPhase] = useState<"idle" | "filling" | "success">("idle")
  const [runId, setRunId] = useState(0)

  useEffect(() => {
    if (phase !== "success") {
      return
    }
    const t = window.setTimeout(() => {
      setPhase("idle")
    }, 2000)
    return () => clearTimeout(t)
  }, [phase])

  return (
    <button
      type="button"
      onClick={() => {
        if (phase !== "idle") {
          return
        }
        setRunId((k) => k + 1)
        setPhase("filling")
      }}
      className="relative h-10 min-w-[200px] overflow-hidden rounded-md bg-rose-500 px-4 text-sm font-medium text-white"
    >
      {phase === "filling" && (
        <motion.div
          key={runId}
          className="absolute inset-0 z-0 h-full origin-left bg-rose-800/50"
          initial={{ width: "0%" }}
          animate={{ width: "100%" }}
          transition={{ duration: 1.2, ease: "easeInOut" }}
          onAnimationComplete={() => {
            setPhase("success")
          }}
        />
      )}
      {phase === "success" && (
        <div className="absolute inset-0 z-0 bg-rose-800/50" aria-hidden />
      )}
      <span className="relative z-[1]">
        {phase === "success" ? "Added!" : "Add to cart"}
      </span>
    </button>
  )
}

function ShimmerSweepButton() {
  const [n, setN] = useState(0)
  return (
    <button
      type="button"
      onClick={() => setN((c) => c + 1)}
      className="relative min-w-[200px] overflow-hidden rounded-md border border-zinc-400 bg-gradient-to-b from-zinc-100 to-zinc-200 px-4 py-2.5 text-sm font-medium text-zinc-900 shadow-sm hover:from-zinc-50 hover:to-zinc-200"
    >
      <span className="relative z-[1]">Add to cart</span>
      {n > 0 && (
        <motion.span
          key={n}
          className="pointer-events-none absolute inset-0 z-0 overflow-hidden"
          aria-hidden
        >
          <motion.span
            className="absolute top-0 h-full w-2/3 bg-gradient-to-r from-transparent via-white/50 to-transparent"
            style={{ transform: "skewX(-18deg) translateX(-20%)" }}
            initial={{ left: "-50%" }}
            animate={{ left: "130%" }}
            transition={{ duration: 0.55, ease: "easeInOut" }}
          />
        </motion.span>
      )}
    </button>
  )
}

function EarconAddButton() {
  const [note, setNote] = useState<string | null>(null)
  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        onClick={() => {
          playAddEarcon()
          setNote("Played earcon (Web Audio).")
          window.setTimeout(() => setNote(null), 2500)
        }}
        className="w-fit min-w-[200px] rounded-md bg-cyan-800 px-4 py-2.5 text-left text-sm font-medium text-white hover:bg-cyan-700"
      >
        Add to cart
      </button>
      <p className="text-xs text-ui-fg-muted max-w-xl">
        {note ??
          "Demo uses a short synthesized tone (no file). In production, pair a tiny .mp3 or .wav in /public with the use-sound hook or HTMLAudioElement for a hand-crafted earcon."}
      </p>
    </div>
  )
}

export default function ButtonAnimationsDemo() {
  const demoCartRef = useRef<HTMLButtonElement>(null)
  const [flyHint, setFlyHint] = useState(false)
  const [flyHintSquish, setFlyHintSquish] = useState(false)

  return (
    <div className="content-container py-10 small:py-16">
      <p className="text-xs text-ui-fg-muted mb-6 max-w-2xl">
        Dev-only UI playground. The fly-to-cart target prefers the main nav link{" "}
        <code className="text-ui-fg-base">{NAV_CART_SELECTOR}</code> when
        present; the secondary button is a stand-in.
      </p>

      <div className="mb-8 flex flex-wrap items-center justify-end gap-3 rounded-lg border border-dashed border-ui-border-base p-3 bg-ui-bg-subtle/50">
        <span className="text-sm text-ui-fg-muted">Demo cart target (fallback):</span>
        <button
          type="button"
          ref={demoCartRef}
          className="rounded border border-ui-border-base bg-ui-bg-base px-3 py-1.5 text-sm font-medium text-ui-fg-base"
          aria-label="Demo shopping cart"
        >
          Cart (0)
        </button>
      </div>

      <div className="grid gap-8">
        <Section
          title="1. Fly-to-cart"
          description="A product thumbnail travels from the add button toward the store cart. Uses Framer Motion, createPortal, and the nav cart when available."
        >
          <div className="flex flex-col gap-2">
            {flyHint && (
              <p className="text-sm text-emerald-700" role="status">
                Arrived at cart.
              </p>
            )}
            <FlyToCartButton
              demoCartRef={demoCartRef}
              onFlyComplete={() => {
                setFlyHint(true)
                window.setTimeout(() => setFlyHint(false), 1200)
              }}
            />
          </div>
        </Section>

        <Section
          title="1 + 4. Fly-to-cart with tactile squish"
          description="The same cart flight as #1, but the trigger is a Framer Motion button with the spring whileTap from #4—press feedback and success motion in one control."
        >
          <div className="flex flex-col gap-2">
            {flyHintSquish && (
              <p className="text-sm text-emerald-700" role="status">
                Arrived at cart.
              </p>
            )}
            <FlyToCartButton
              withSquish
              demoCartRef={demoCartRef}
              onFlyComplete={() => {
                setFlyHintSquish(true)
                window.setTimeout(() => setFlyHintSquish(false), 1200)
              }}
            />
          </div>
        </Section>

        <Section
          title="2. Morph &amp; success state"
          description="Loading state, then success color, checkmark, and copy that resets. Mirrors a typical add-to-cart flow with React state and Tailwind transitions."
        >
          <MorphAddButton />
        </Section>

        <Section
          title="3. Confetti / sparkles"
          description="canvas-confetti burst from the button center. Works well for playful or celebratory brands."
        >
          <ConfettiAddButton />
        </Section>

        <Section
          title="4. Tactile squish / bounce"
          description="whileTap scale with a spring for press feedback. Framer Motion makes this a few lines of code."
        >
          <SquishAddButton />
        </Section>

        <Section
          title="5. Material-style ripple"
          description="Click coordinates seed an expanding ring inside an overflow-hidden button. Uses Framer Motion for the ripple (pure CSS is another valid approach)."
        >
          <RippleAddButton />
        </Section>

        <Section
          title="6. Haptic feedback"
          description="navigator.vibrate for supported mobile browsers; wrapped in a capability check so desktop is unaffected."
        >
          <HapticAddButton />
        </Section>

        <Section
          title="7. 3D coin flip"
          description="Front: Add to cart. Back: Added with icon. Framer Motion rotates on the X-axis with preserve-3d and hidden back-faces, similar to pure CSS 3D card flips."
        >
          <CoinFlip3DButton />
        </Section>

        <Section
          title="8. Slot machine text roll"
          description="Fixed height, overflow hidden; the text column translates up on click so an Added! line slides into view. Typography-only feedback without a big color change."
        >
          <SlotMachineTextButton />
        </Section>

        <Section
          title="9. Integrated progress fill"
          description="A darker layer creeps left-to-right, then the label flips to success—good when cart API can take a moment. Demo uses a 1.2s fill; wire width to a real request for production."
        >
          <ProgressFillButton />
        </Section>

        <Section
          title="10. Glossy shimmer / sweep"
          description="A diagonal light beam crosses the button after each click, keyed so repeated clicks replay the sweep. Gradient overlay + Framer position animation (keyframes work too)."
        >
          <ShimmerSweepButton />
        </Section>

        <Section
          title="11. Auditory feedback (earcon)"
          description="Subtle chime on click via the Web Audio API (no file). Mute the tab or your OS to compare. You can drop in use-sound and a very small /public sound for a custom earcon."
        >
          <EarconAddButton />
        </Section>
      </div>
    </div>
  )
}
