/**
 * Tiny HTMLImageElement cache keyed by URL.
 *
 * react-force-graph's `nodeCanvasObject` is called every frame per node; we
 * cannot afford to create a new `Image()` on every paint. Instead we keep a
 * pool keyed by URL, preload in the background, and expose a synchronous
 * getter that either returns a fully-loaded image or null (so the caller can
 * draw a placeholder square until the bitmap arrives).
 */

type PoolEntry = {
  image: HTMLImageElement
  loaded: boolean
  failed: boolean
}

const pool = new Map<string, PoolEntry>()

const MAX_CONCURRENT = 6
let inFlight = 0
const queue: string[] = []

function pump() {
  while (inFlight < MAX_CONCURRENT && queue.length > 0) {
    const url = queue.shift()
    if (!url) continue
    const entry = pool.get(url)
    if (!entry || entry.loaded || entry.failed) continue
    inFlight++
    entry.image.onload = () => {
      entry.loaded = true
      inFlight--
      pump()
    }
    entry.image.onerror = () => {
      entry.failed = true
      inFlight--
      pump()
    }
    entry.image.src = url
  }
}

/**
 * Return a loaded HTMLImageElement for the URL, or null if still pending.
 * Triggers background load on first call.
 */
export function getImage(url: string | null | undefined): HTMLImageElement | null {
  if (typeof window === "undefined" || !url) return null
  const existing = pool.get(url)
  if (existing) {
    return existing.loaded && !existing.failed ? existing.image : null
  }
  const image = new Image()
  image.decoding = "async"
  image.crossOrigin = "anonymous"
  const entry: PoolEntry = { image, loaded: false, failed: false }
  pool.set(url, entry)
  queue.push(url)
  pump()
  return null
}

/**
 * Preload a batch of URLs without blocking. Used during idle callbacks to
 * warm up thumbnails for upcoming node expansions.
 */
export function preloadImages(urls: Array<string | null | undefined>): void {
  for (const url of urls) {
    if (url) getImage(url)
  }
}
