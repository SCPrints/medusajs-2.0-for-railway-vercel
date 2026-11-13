import { toPixelSafeObjects } from "./r2-public-url"

const R2 = "https://pub-4b98c1b8d55d4d9597ff5cfac6aa611a.r2.dev/abc-logo.png"

describe("toPixelSafeObjects", () => {
  it("routes R2 artwork through the same-origin proxy and asks for CORS", () => {
    const [out] = toPixelSafeObjects([{ type: "Image", src: R2, crossOrigin: null }])
    expect(out.src).toBe(`/api/proxy-image?url=${encodeURIComponent(R2)}`)
    expect(out.crossOrigin).toBe("anonymous")
  })

  it("rewrites a private R2 endpoint to the public host before proxying", () => {
    const [out] = toPixelSafeObjects([
      { type: "Image", src: "https://acct.r2.cloudflarestorage.com/sc-prints-media/abc-logo.png" },
    ])
    expect(out.src).toBe(`/api/proxy-image?url=${encodeURIComponent(R2)}`)
  })

  it("keeps other remote srcs but asks for CORS", () => {
    const src = "https://cdn.shopify.com/x.png"
    const [out] = toPixelSafeObjects([{ type: "Image", src, crossOrigin: null }])
    expect(out.src).toBe(src)
    expect(out.crossOrigin).toBe("anonymous")
  })

  it("walks groups and leaves data URLs and non-images alone", () => {
    const data = { type: "Image", src: "data:image/png;base64,AAAA", crossOrigin: null }
    const text = { type: "IText", text: "hi" }
    const [group] = toPixelSafeObjects([{ type: "Group", objects: [data, text, { type: "Image", src: R2 }] }])
    const kids = group.objects as Record<string, unknown>[]
    expect(kids[0]).toBe(data)
    expect(kids[1]).toBe(text)
    expect(kids[2].crossOrigin).toBe("anonymous")
  })
})
