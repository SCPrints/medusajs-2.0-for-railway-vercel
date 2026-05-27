import { notFound } from "next/navigation"

// Optional-catch-all that fires for any path under `/[countryCode]/...` that
// no more-specific route handles. It immediately calls `notFound()` to render
// the segment's [not-found.tsx](../not-found.tsx) — exactly what Next.js
// would do on its own — but does so through a real route handler instead of
// Next 16's static `/_not-found` fallback.
//
// Why bother: with `cacheComponents: true` and Vercel hosting, the implicit
// `/_not-found` route is served from Vercel's edge as a cached PPR shell.
// The streamed RSC payload (containing React hydration data) is dropped on
// that path, so no Client Component on the 404 page ever hydrates — the
// GameRotation widget in not-found.tsx stays frozen on its placeholder.
//
// Routing this through a dynamic page forces Vercel to invoke a function
// for every unmatched `/[countryCode]/...` URL, the response streams in full,
// and hydration data lands on the client. Specific routes still win on
// resolution (Next.js prefers the more specific match), so this only fires
// for genuine 404s.
export default function CatchAllNotFound() {
  notFound()
}
