import { feedImages } from "./feed-images"

describe("feedImages", () => {
  it("drops audited-dead URLs from primary and additional images", () => {
    expect(
      feedImages({
        thumbnail: "https://x/a.jpg",
        images: [{ url: "https://x/a.jpg" }, { url: "https://x/b.jpg" }, { url: "https://x/c.jpg" }],
        metadata: { image_audit: { status: "broken", broken_urls: ["https://x/a.jpg", "https://x/c.jpg"] } },
      })
    ).toEqual(["https://x/b.jpg"])
  })

  it("returns nothing when every image is dead, so the product is skipped", () => {
    expect(
      feedImages({
        thumbnail: "https://x/a.jpg",
        images: [],
        metadata: { image_audit: { broken_urls: ["https://x/a.jpg"] } },
      })
    ).toEqual([])
  })

  it("ignores missing or malformed audit metadata", () => {
    expect(feedImages({ thumbnail: "https://x/a.jpg", metadata: { image_audit: "?" } })).toEqual([
      "https://x/a.jpg",
    ])
    expect(feedImages({ thumbnail: "https://x/a.jpg" })).toEqual(["https://x/a.jpg"])
  })

  describe("image sizes", () => {
    const base = {
      thumbnail: "https://x/TEE_NAVY__front.jpg",
      images: [{ url: "https://x/TEE_NAVY_BACK.jpg" }, { url: "https://x/TEE_RED__front.jpg" }],
    }

    it("skips a small front view for a large image as image_link", () => {
      expect(
        feedImages({
          ...base,
          metadata: {
            image_audit: {
              sizes: {
                "https://x/TEE_NAVY__front.jpg": [400, 400],
                "https://x/TEE_NAVY_BACK.jpg": [900, 1100],
                "https://x/TEE_RED__front.jpg": [900, 499],
              },
            },
          },
        })
      ).toEqual(["https://x/TEE_NAVY_BACK.jpg", "https://x/TEE_NAVY__front.jpg", "https://x/TEE_RED__front.jpg"])
    })

    it("keeps front-view ranking among large images and puts unknown before small", () => {
      const out = feedImages({
        ...base,
        metadata: {
          image_audit: {
            sizes: {
              "https://x/TEE_NAVY__front.jpg": [300, 300],
              "https://x/TEE_RED__front.jpg": [800, 800],
            },
          },
        },
      })
      expect(out[0]).toBe("https://x/TEE_RED__front.jpg")
      expect(out.indexOf("https://x/TEE_NAVY_BACK.jpg")).toBeLessThan(out.indexOf("https://x/TEE_NAVY__front.jpg"))
    })

    it("falls back to view ranking when sizes are absent or malformed", () => {
      const plain = feedImages(base)
      expect(feedImages({ ...base, metadata: { image_audit: { sizes: { "https://x/TEE_NAVY__front.jpg": "big" } } } })).toEqual(plain)
      expect(feedImages({ ...base, metadata: { image_audit: { sizes: null } } })).toEqual(plain)
    })
  })
})
