const galleryImages = [
  {
    src: "https://images.unsplash.com/photo-1469474968028-56623f02e42e?auto=format&fit=crop&w=900&q=80",
    alt: "Mountain range at sunrise",
  },
  {
    src: "https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&w=900&q=80",
    alt: "Foggy forest with tall trees",
  },
  {
    src: "https://images.unsplash.com/photo-1470770841072-f978cf4d019e?auto=format&fit=crop&w=900&q=80",
    alt: "Lake with pine trees and reflections",
  },
  {
    src: "https://images.unsplash.com/photo-1510798831971-661eb04b3739?auto=format&fit=crop&w=900&q=80",
    alt: "Coastal cliffs and ocean at golden hour",
  },
  {
    src: "https://images.unsplash.com/photo-1501785888041-af3ef285b470?auto=format&fit=crop&w=900&q=80",
    alt: "Road through hills and dramatic sky",
  },
  {
    src: "https://images.unsplash.com/photo-1493244040629-496f6d136cc3?auto=format&fit=crop&w=900&q=80",
    alt: "Snowy mountains under blue sky",
  },
]

const ScrollingPictureBar = () => {
  const scrollingImages = [...galleryImages, ...galleryImages]

  return (
    <section className="w-full bg-ui-bg-base py-4 small:py-6">
      <div
        className="relative w-full overflow-hidden"
        style={{
          maskImage:
            "linear-gradient(to right, transparent 0%, black 8%, black 92%, transparent 100%)",
          WebkitMaskImage:
            "linear-gradient(to right, transparent 0%, black 8%, black 92%, transparent 100%)",
        }}
      >
        <div className="scrolling-picture-track flex w-max gap-8 py-1 motion-reduce:!animate-none">
          {scrollingImages.map((image, index) => (
            <div
              key={`${image.src}-${index}`}
              className="h-[52vh] w-[84vw] shrink-0 overflow-hidden bg-ui-bg-subtle shadow-elevation-card-rest small:h-[64vh] small:w-[72vw]"
            >
              <img
                src={image.src}
                alt={image.alt}
                className="h-full w-full object-cover"
                loading="lazy"
              />
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

export default ScrollingPictureBar
