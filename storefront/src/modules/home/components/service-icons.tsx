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

export const ScreenPrintIcon = (props: IconProps) => (
  <svg {...baseProps} {...props}>
    <path d="M7 5h10l-1.5 4h-7L7 5Z" />
    <path d="M9 9v9a1 1 0 0 0 1 1h4a1 1 0 0 0 1-1V9" />
    <path d="M3 14h3" />
    <path d="M18 14h3" />
  </svg>
)

export const DigitalTransferIcon = (props: IconProps) => (
  <svg {...baseProps} {...props}>
    <rect x="4" y="6" width="16" height="9" rx="1.5" />
    <path d="M7 15v3h10v-3" />
    <path d="M8 9h8" />
    <path d="M12 19v-2" />
  </svg>
)

export const EmbroideryIcon = (props: IconProps) => (
  <svg {...baseProps} {...props}>
    <path d="M5 19 19 5" />
    <path d="M16 5h3v3" />
    <circle cx="9" cy="15" r="1.6" />
    <path d="M5 19c2-1 3-2 4-4" />
  </svg>
)

export const NeckTagIcon = (props: IconProps) => (
  <svg {...baseProps} {...props}>
    <path d="M14 4h5v5l-9 9a2 2 0 0 1-2.8 0l-2.2-2.2a2 2 0 0 1 0-2.8L14 4Z" />
    <circle cx="16" cy="8" r="1.2" />
  </svg>
)

export const FoldAndBagIcon = (props: IconProps) => (
  <svg {...baseProps} {...props}>
    <path d="M6 8h12l-1 11a1 1 0 0 1-1 1H8a1 1 0 0 1-1-1L6 8Z" />
    <path d="M9 8V6a3 3 0 0 1 6 0v2" />
    <path d="M9 12h6" />
  </svg>
)

export const WarehousingIcon = (props: IconProps) => (
  <svg {...baseProps} {...props}>
    <path d="M3 9 12 4l9 5v11H3V9Z" />
    <path d="M9 20v-6h6v6" />
    <path d="M9 14h6" />
  </svg>
)

export const UvPrintingIcon = (props: IconProps) => (
  <svg {...baseProps} {...props}>
    <circle cx="12" cy="12" r="3.5" />
    <path d="M12 4v2" />
    <path d="M12 18v2" />
    <path d="M4 12h2" />
    <path d="M18 12h2" />
    <path d="m6.3 6.3 1.4 1.4" />
    <path d="m16.3 16.3 1.4 1.4" />
    <path d="m6.3 17.7 1.4-1.4" />
    <path d="m16.3 7.7 1.4-1.4" />
  </svg>
)

export const DesignIcon = (props: IconProps) => (
  <svg {...baseProps} {...props}>
    <path d="M4 20 14 10l3 3-10 10H4v-3Z" />
    <path d="M13.5 6.5 17 10" />
    <path d="m15 5 2-2 4 4-2 2-4-4Z" />
  </svg>
)
