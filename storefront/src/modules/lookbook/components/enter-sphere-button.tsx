import LocalizedClientLink from "@modules/common/components/localized-client-link"

/**
 * CTA that drops visitors from the flat `/lookbook` gallery into the immersive
 * `/lookbook-sphere`. The glyph is a wireframe globe whose two meridians
 * oscillate out of phase (the classic rotating-globe wireframe) with a small
 * satellite dot orbiting it — so the button literally previews the sphere.
 *
 * The motion is declarative SVG/SMIL + CSS hover only, so this stays a server
 * component (no client JS) and animates even before hydration. `!text-white`
 * opts out of the globals.css anchor repaint (links get painted brand-pink).
 */
const EnterSphereButton = () => (
  <LocalizedClientLink
    href="/lookbook-sphere"
    aria-label="Enter the immersive sphere lookbook"
    className="group relative mt-8 inline-flex items-center gap-3 overflow-hidden rounded-full bg-[var(--brand-secondary)] px-7 py-3.5 text-sm font-semibold uppercase tracking-[0.2em] !text-white shadow-sm transition-transform duration-300 hover:scale-[1.03] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-secondary)]/50 focus-visible:ring-offset-2"
  >
    {/* Hover sheen sweep */}
    <span
      aria-hidden
      className="pointer-events-none absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/25 to-transparent transition-transform duration-700 ease-out group-hover:translate-x-full"
    />

    {/* Rotating wireframe globe */}
    <svg
      viewBox="0 0 40 40"
      className="relative h-5 w-5 shrink-0"
      fill="none"
      stroke="currentColor"
      aria-hidden
    >
      {/* sphere outline */}
      <circle cx="20" cy="20" r="14" strokeWidth="1.6" opacity="0.95" />
      {/* equator */}
      <ellipse cx="20" cy="20" rx="14" ry="5" strokeWidth="1.2" opacity="0.6" />
      {/* meridians — rx oscillates out of phase to fake the spin */}
      <ellipse cx="20" cy="20" ry="14" strokeWidth="1.2" opacity="0.6">
        <animate
          attributeName="rx"
          values="14;2;14"
          keyTimes="0;0.5;1"
          dur="4s"
          calcMode="spline"
          keySplines="0.4 0 0.6 1;0.4 0 0.6 1"
          repeatCount="indefinite"
        />
      </ellipse>
      <ellipse cx="20" cy="20" ry="14" strokeWidth="1.2" opacity="0.4">
        <animate
          attributeName="rx"
          values="2;14;2"
          keyTimes="0;0.5;1"
          dur="4s"
          calcMode="spline"
          keySplines="0.4 0 0.6 1;0.4 0 0.6 1"
          repeatCount="indefinite"
        />
      </ellipse>
      {/* orbiting satellite */}
      <g>
        <animateTransform
          attributeName="transform"
          type="rotate"
          from="0 20 20"
          to="360 20 20"
          dur="6s"
          repeatCount="indefinite"
        />
        <circle cx="20" cy="3.5" r="1.7" fill="currentColor" stroke="none" />
      </g>
    </svg>

    <span className="relative">Enter the sphere</span>

    {/* Arrow nudges in on hover */}
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="relative transition-transform duration-300 group-hover:translate-x-1"
      aria-hidden
    >
      <path d="M3 8h10M9 4l4 4-4 4" />
    </svg>
  </LocalizedClientLink>
)

export default EnterSphereButton
