import { clx } from "@medusajs/ui"
import type { ReactNode } from "react"

export type MarketingHeroProps = {
  eyebrow: ReactNode
  /** "pill" = brand chip. "muted" = uppercase label (e.g. service detail). */
  eyebrowVariant?: "pill" | "muted"
  title: ReactNode
  subtitle?: ReactNode
  subtitleClassName?: string
  /** Larger gap between eyebrow and title (home hero). */
  titleSpacing?: "default" | "relaxed"
  /** "default" p-8 small:p-10. "spacious" adds shadow and p-8 small:p-12. */
  padding?: "default" | "spacious"
  align?: "left" | "center"
  className?: string
  children?: ReactNode
}

export default function MarketingHero({
  eyebrow,
  eyebrowVariant = "pill",
  title,
  subtitle,
  subtitleClassName,
  titleSpacing = "default",
  padding = "default",
  align = "left",
  className,
  children,
}: MarketingHeroProps) {
  const eyebrowEl =
    eyebrowVariant === "pill" ? (
      <span className="inline-flex rounded-full border border-[var(--brand-secondary)]/40 bg-white px-4 py-1 text-xs font-semibold uppercase tracking-[0.12em] text-[var(--brand-secondary)]">
        {eyebrow}
      </span>
    ) : (
      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-ui-fg-muted">
        {eyebrow}
      </p>
    )

  const body = (
    <>
      {eyebrowEl}
      <h1
        className={clx(
          "page-title-marketing",
          titleSpacing === "relaxed" ? "mt-5" : "mt-3"
        )}
      >
        {title}
      </h1>
      {subtitle ? (
        <p
          className={clx(
            "mt-4 max-w-3xl text-ui-fg-subtle",
            align === "center" && "mx-auto",
            subtitleClassName
          )}
        >
          {subtitle}
        </p>
      ) : null}
      {children}
    </>
  )

  return (
    <div
      className={clx(
        "rounded-2xl border border-ui-border-base bg-ui-bg-subtle",
        padding === "spacious"
          ? "p-8 shadow-sm small:p-12"
          : "p-8 small:p-10",
        className
      )}
    >
      {align === "center" ? (
        <div className="text-center">
          <div className="mx-auto max-w-2xl">{body}</div>
        </div>
      ) : (
        body
      )}
    </div>
  )
}
