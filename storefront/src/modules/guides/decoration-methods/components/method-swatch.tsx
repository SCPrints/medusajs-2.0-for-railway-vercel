import type { Method } from "@modules/guides/decoration-methods/recommend"

const NAVY = "var(--brand-primary)"
const TEAL = "var(--brand-accent)"

const BOLT = "64,30 44,58 56,58 51,86 76,52 62,52"

/**
 * The same motif rendered three ways, as if seen through a loupe:
 * DTF = smooth full-colour film, screen print = flat ink in the weave,
 * embroidery = raised thread stitches. `id` must be unique per instance
 * on the page (it namespaces the SVG defs).
 */
export default function MethodSwatch({
  method,
  id,
  className = "",
  title,
}: {
  method: Method
  id: string
  className?: string
  title?: string
}) {
  const u = (name: string) => `${id}-${name}`

  return (
    <svg
      viewBox="0 0 120 120"
      className={className}
      role={title ? "img" : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
    >
      <defs>
        <clipPath id={u("clip")}>
          <circle cx="60" cy="60" r="55" />
        </clipPath>
        <pattern id={u("weave")} width="5" height="5" patternUnits="userSpaceOnUse">
          <path d="M0 0H5M0 0V5" stroke={NAVY} strokeOpacity="0.16" strokeWidth="1" />
        </pattern>
        <linearGradient id={u("grad")} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#ffb02e" />
          <stop offset="0.5" stopColor="#ff2e63" />
          <stop offset="1" stopColor="#7c5cff" />
        </linearGradient>
        <pattern id={u("stitch-a")} width="4" height="4" patternUnits="userSpaceOnUse" patternTransform="rotate(35)">
          <rect width="4" height="4" fill="#2bb5a9" />
          <rect width="2" height="4" fill="#5fe0d4" />
        </pattern>
        <pattern id={u("stitch-b")} width="4" height="4" patternUnits="userSpaceOnUse" patternTransform="rotate(-35)">
          <rect width="4" height="4" fill="#d81e4f" />
          <rect width="2" height="4" fill="#ff6a8f" />
        </pattern>
      </defs>

      <g clipPath={`url(#${u("clip")})`}>
        <rect width="120" height="120" fill="#efece6" />
        <rect width="120" height="120" fill={`url(#${u("weave")})`} />

        {method === "dtf" ? (
          <>
            <circle cx="60" cy="58" r="34" fill={`url(#${u("grad")})`} />
            <polygon points={BOLT} fill="#fff" />
            {/* smooth film sheen */}
            <ellipse cx="48" cy="42" rx="20" ry="9" fill="#fff" opacity="0.28" transform="rotate(-28 48 42)" />
          </>
        ) : null}

        {method === "screen" ? (
          <>
            <circle cx="60" cy="58" r="34" fill={TEAL} />
            <polygon points={BOLT} fill={NAVY} />
            {/* ink sits in the fabric, so the weave shows through */}
            <circle cx="60" cy="58" r="34" fill={`url(#${u("weave")})`} />
          </>
        ) : null}

        {method === "embroidery" ? (
          <>
            {/* shadow first: stitching is raised off the fabric */}
            <circle cx="62" cy="61" r="34" fill={NAVY} opacity="0.22" />
            <circle
              cx="60"
              cy="58"
              r="34"
              fill={`url(#${u("stitch-a")})`}
              stroke="#1f8f86"
              strokeWidth="2.5"
              strokeDasharray="4 2"
            />
            <polygon
              points={BOLT}
              fill={`url(#${u("stitch-b")})`}
              stroke="#b0183f"
              strokeWidth="2"
              strokeDasharray="3 1.5"
              strokeLinejoin="round"
            />
          </>
        ) : null}
      </g>
      <circle cx="60" cy="60" r="55" fill="none" stroke={NAVY} strokeWidth="3" />
    </svg>
  )
}
