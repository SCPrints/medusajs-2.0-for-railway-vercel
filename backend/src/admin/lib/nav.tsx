import { forwardRef, type AnchorHTMLAttributes } from "react"
import { Link, useNavigate } from "react-router-dom"

/**
 * In-app navigation for our admin pages. A plain `<a href="/app/…">` or
 * `window.location.href = "/app/…"` reloads the whole ~10 MB admin; these go
 * through Medusa's router instead (basename `/app`). Anything outside the
 * admin (storefront, R2 files, mailto, new tabs) still loads normally.
 */
const BASE = "/app"

/** "/app/jobs/x#quote" → "/jobs/x#quote"; null when the href isn't an admin page. */
export const toRoute = (href: string): string | null => {
  if (href !== BASE && !href.startsWith(`${BASE}/`) && !href.startsWith(`${BASE}?`)) return null
  const rest = href.slice(BASE.length)
  return rest.startsWith("/") ? rest : `/${rest}`
}

type AppLinkProps = AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }

/** Drop-in for `<a href>`: router link for admin pages, plain anchor otherwise. */
export const AppLink = forwardRef<HTMLAnchorElement, AppLinkProps>(function AppLink({ href, ...rest }, ref) {
  const to = rest.target ? null : toRoute(href)
  return to ? <Link ref={ref} to={to} {...rest} /> : <a ref={ref} href={href} {...rest} />
})

/** `go("/app/jobs/x")` navigates in-app; other hrefs load normally. */
export function useGo() {
  const navigate = useNavigate()
  return (href: string, opts?: { replace?: boolean }) => {
    const to = toRoute(href)
    if (to) navigate(to, { replace: !!opts?.replace })
    else if (opts?.replace) window.location.replace(href)
    else window.location.assign(href)
  }
}
