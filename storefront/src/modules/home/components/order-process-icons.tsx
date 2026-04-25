import type { SVGProps } from "react"

type IconProps = SVGProps<SVGSVGElement>

const baseProps = {
  width: 24,
  height: 24,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.6,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  xmlns: "http://www.w3.org/2000/svg",
}

/** Single tee — step 1 */
export const ProductTeeIcon = (props: IconProps) => (
  <svg {...baseProps} {...props}>
    <path d="M7 5h10l-1.5 4H8.5L7 5Z" />
    <path d="M9 9v9a1 1 0 0 0 1 1h4a1 1 0 0 0 1-1V9" />
  </svg>
)

/** Overlapping tees — step 2 */
export const ColoursTeesIcon = (props: IconProps) => (
  <svg {...baseProps} {...props}>
    <path d="M5.5 6h7l-1.2 3.2H6.2L5.5 6Z" />
    <path d="M6.5 9.2v6.2a.85.85 0 0 0 .85.85h2.3" />
    <path d="M10.5 5.2h6.5l-1.2 3.2H11.2l-.7-3.2Z" />
    <path d="M12 9.2v6.2a.85.85 0 0 0 .85.85h2.4" />
  </svg>
)

/** Tee with upload area — step 3 */
export const UploadDesignTeeIcon = (props: IconProps) => (
  <svg {...baseProps} {...props}>
    <path d="M7 5h10l-1.5 4H8.5L7 5Z" />
    <path d="M9 9v7a1 1 0 0 0 1 1h2" />
    <rect x="11" y="10.5" width="4.2" height="3.2" rx="0.4" />
    <path d="M12.4 12.1h1.2M13 11.2v1.2" />
  </svg>
)

/** Tee with sparkles — step 4 */
export const MagicTeeIcon = (props: IconProps) => (
  <svg {...baseProps} {...props}>
    <path d="M7 5h10l-1.5 4H8.5L7 5Z" />
    <path d="M9 9v9a1 1 0 0 0 1 1h4a1 1 0 0 0 1-1V9" />
    <path d="M2.2 3.2v.9M1.6 3.6h.9" />
    <path d="M20.2 3.2v.9M19.5 3.6h.9" />
    <path d="M3.2 5.2v.9M2.5 5.6h.9" />
  </svg>
)

/** Box with check — step 5 */
export const DeliveryBoxIcon = (props: IconProps) => (
  <svg {...baseProps} {...props}>
    <path d="M2.5 8.2 12 3.2l9.5 5" />
    <path d="M4.5 9.2v9.2a1 1 0 0 0 1 1h13a1 1 0 0 0 1-1V9.2" />
    <path d="M12 3.2v16.2" />
    <path d="M2.5 8.2h19" />
    <circle cx="17.5" cy="18" r="1.8" />
    <path d="M16.4 18l.5.5 1-1" />
  </svg>
)

/** Person / pickup — step 6 */
export const PickupIcon = (props: IconProps) => (
  <svg {...baseProps} {...props}>
    <circle cx="7" cy="5" r="1.3" />
    <path d="M5.5 19v-5.5L7 8.2l1.2 1.1V19" />
    <path d="M8.2 7.1 9.2 5.5H13l-1.5 2.4v1.2" />
    <path d="M4.2 19h1.2" />
    <path d="M10.2 9.2h1.2l.8 2.2 4.2 1" />
    <rect x="14.2" y="10.2" width="4.2" height="2.4" rx="0.2" />
    <path d="M11.2 20.5H18a1.2 1.2 0 0 0 0-2.4h-3.6" />
  </svg>
)
