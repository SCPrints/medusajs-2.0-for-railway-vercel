import Footer from "@modules/layout/templates/footer"
import Nav from "@modules/layout/templates/nav"

/**
 * Standard shop header + footer. Used by `(main)/layout` and by root `app/not-found`
 * (global 404 is outside the `(main)` segment).
 */
export default function MainStoreShell({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <>
      <Nav />
      {children}
      <Footer />
    </>
  )
}
