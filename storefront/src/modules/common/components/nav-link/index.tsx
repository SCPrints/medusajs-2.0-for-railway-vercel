"use client"

import React from "react"
import LocalizedClientLink from "@modules/common/components/localized-client-link"

type NavLinkProps = {
  href: string
  children: React.ReactNode
  className?: string
  onClick?: () => void
  "data-testid"?: string
}

const NavLink = ({ href, children, onClick, ...props }: NavLinkProps) => {
  return (
    <LocalizedClientLink onClick={onClick} href={href} {...props}>
      {children}
    </LocalizedClientLink>
  )
}

export default NavLink