import { ArrowUpRightMini } from "@medusajs/icons"
import LocalizedClientLink from "../localized-client-link"

type InteractiveLinkProps = {
  href: string
  children?: React.ReactNode
  onClick?: () => void
}

const InteractiveLink = ({
  href,
  children,
  onClick,
  ...props
}: InteractiveLinkProps) => {
  return (
    <LocalizedClientLink
      className="group inline-flex items-center gap-x-1 font-semibold text-[var(--brand-secondary)] transition-colors hover:text-[var(--brand-accent)]"
      href={href}
      onClick={onClick}
      {...props}
    >
      <span>{children}</span>
      <ArrowUpRightMini className="text-current transition-transform duration-150 ease-in-out group-hover:rotate-45" />
    </LocalizedClientLink>
  )
}

export default InteractiveLink
