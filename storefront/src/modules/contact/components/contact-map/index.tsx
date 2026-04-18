"use client"

import { useEffect, useRef, useState } from "react"

const MAP_EMBED_URL =
  "https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d26545.626463999554!2d150.91617260565882!3d-33.89602410887372!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x6b12beabf0b5d84b%3A0x5017d681632ad40!2sCabramatta%20NSW%202166!5e0!3m2!1sen!2sau!4v1713259868726!5m2!1sen!2sau"

const ContactMap = () => {
  const [isMapLoaded, setIsMapLoaded] = useState(false)
  const mapContainerRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (isMapLoaded) {
      return
    }

    const target = mapContainerRef.current

    if (!target) {
      return
    }

    if (typeof window === "undefined" || !("IntersectionObserver" in window)) {
      setIsMapLoaded(true)
      return
    }

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0]

        if (entry?.isIntersecting) {
          setIsMapLoaded(true)
          observer.disconnect()
        }
      },
      {
        rootMargin: "150px 0px",
        threshold: 0.2,
      }
    )

    observer.observe(target)

    return () => observer.disconnect()
  }, [isMapLoaded])

  return (
    <div
      ref={mapContainerRef}
      className="relative h-[400px] w-full overflow-hidden rounded-2xl border border-ui-border-base bg-ui-bg-subtle shadow-sm group"
    >
      {isMapLoaded ? (
        <iframe
          src={MAP_EMBED_URL}
          width="100%"
          height="100%"
          style={{ border: 0 }}
          loading="lazy"
          referrerPolicy="no-referrer-when-downgrade"
          className="absolute inset-0 grayscale contrast-125 opacity-90 group-hover:grayscale-0 group-hover:opacity-100 transition-all duration-500"
        />
      ) : (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-ui-bg-subtle p-6 text-center">
          <p className="text-sm font-semibold text-ui-fg-base">Map preview</p>
          <p className="mt-2 max-w-xs text-sm text-ui-fg-subtle">
            The interactive map will load automatically when this section enters view.
          </p>
          <button
            type="button"
            onClick={() => setIsMapLoaded(true)}
            className="mt-4 inline-flex rounded-lg bg-ui-fg-base px-4 py-2 text-sm font-semibold text-white transition hover:bg-black"
          >
            Load map
          </button>
        </div>
      )}
    </div>
  )
}

export default ContactMap
