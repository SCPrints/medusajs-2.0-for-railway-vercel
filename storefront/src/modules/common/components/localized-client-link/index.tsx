"use client"

import Link from "next/link"
import { useParams } from "next/navigation"
import React from "react"
import { useTransitionRouter } from "next-view-transitions"

const runPageTransition = () => {
  document.documentElement.animate(
    [
      { opacity: 1, transform: "translateY(0)" },
      { opacity: 0.25, transform: "translateY(24%)" },
    ],
    {
      duration: 650,
      easing: "cubic-bezier(0.87, 0, 0.13, 1)",
      fill: "forwards",
      pseudoElement: "::view-transition-old(root)",
    }
  )

  document.documentElement.animate(
    [
      { clipPath: "polygon(0 0, 100% 0, 100% 0, 0 0)" },
      { clipPath: "polygon(0 0, 100% 0, 100% 100%, 0 100%)" },
    ],
    {
      duration: 650,
      easing: "cubic-bezier(0.87, 0, 0.13, 1)",
      fill: "forwards",
      pseudoElement: "::view-transition-new(root)",
    }
  )
}

/**
 * Use this component to create a Next.js `<Link />` that persists the current country code in the url,
 * without having to explicitly pass it as a prop.
 */
const LocalizedClientLink = ({
  children,
  href,
  ...props
}: {
  children?: React.ReactNode
  href: string
  className?: string
  onClick?: (() => void) | React.MouseEventHandler<HTMLAnchorElement>
  passHref?: true
  [x: string]: any
}) => {
  const router = useTransitionRouter()
  const { countryCode } = useParams()
  const normalizedCountryCode = Array.isArray(countryCode)
    ? countryCode[0]
    : countryCode
  const isExternalHref =
    href.startsWith("http://") ||
    href.startsWith("https://") ||
    href.startsWith("mailto:") ||
    href.startsWith("tel:")
  const localizedHref =
    isExternalHref || !normalizedCountryCode
      ? href
      : `/${normalizedCountryCode}${href}`

  const handleClick: React.MouseEventHandler<HTMLAnchorElement> = (e) => {
    const clickHandler = props.onClick
    if (typeof clickHandler === "function") {
      if (clickHandler.length === 0) {
        ;(clickHandler as () => void)()
      } else {
        ;(clickHandler as React.MouseEventHandler<HTMLAnchorElement>)(e)
      }
    }

    if (e.defaultPrevented) {
      return
    }

    if (
      e.metaKey ||
      e.ctrlKey ||
      e.shiftKey ||
      e.altKey ||
      props.target === "_blank" ||
      props.download ||
      isExternalHref ||
      href.startsWith("#")
    ) {
      return
    }

    e.preventDefault()
    router.push(localizedHref, {
      onTransitionReady: runPageTransition,
    })
  }

  return (
    <Link href={localizedHref} {...props} onClick={handleClick}>
      {children}
    </Link>
  )
}

export default LocalizedClientLink
