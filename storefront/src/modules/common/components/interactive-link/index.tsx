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
      className="group inline-flex items-center gap-x-1 font-semibold text-brand transition-colors hover:text-accent"
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
