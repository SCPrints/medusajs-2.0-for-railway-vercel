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
})
