"use client"

import React from "react"
import { useTransitionRouter } from "next-view-transitions"
import LocalizedClientLink from "@modules/common/components/localized-client-link"

const transitionFunctions = {
  topToBottom: () => {
    // Phase 1: Slide the current page down and fade it out
    document.documentElement.animate(
      [
        { opacity: 1, transform: "translateY(0)" },
        { opacity: 0.2, transform: "translateY(35%)" },
      ],
      {
        duration: 800,
        easing: "cubic-bezier(0.87, 0, 0.13, 1)",
        fill: "forwards",
        pseudoElement: "::view-transition-old(root)",
      }
    )
    // Phase 2: Reveal the new page from a clip-path at the top
    document.documentElement.animate(
      [
        { clipPath: "polygon(0 0, 100% 0, 100% 0, 0 0)" },
        { clipPath: "polygon(0 0, 100% 0, 100% 100%, 0 100%)" },
      ],
      {
        duration: 800,
        easing: "cubic-bezier(0.87, 0, 0.13, 1)",
        fill: "forwards",
        pseudoElement: "::view-transition-new(root)",
      }
    )
  },
}

type NavLinkProps = {
  href: string
  children: React.ReactNode
  className?: string
  onClick?: () => void
  "data-testid"?: string
}

const NavLink = ({ href, children, onClick, ...props }: NavLinkProps) => {
  const router = useTransitionRouter()

  const handleClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
    e.preventDefault()
    onClick?.()

    // This tells the router to run the animation before switching pages
    router.push(href, {
      onTransitionReady: transitionFunctions.topToBottom,
    })
  }

  return (
    <LocalizedClientLink onClick={handleClick} href={href} {...props}>
      {children}
    </LocalizedClientLink>
  )
}

export default NavLink