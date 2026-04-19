import { renderRequestSchema } from "../types"

describe("renderRequestSchema", () => {
  it("accepts a valid render payload", () => {
    const result = renderRequestSchema.safeParse({
      side: "front",
      artworkSvg: "<svg><rect width='100' height='100' /></svg>",
      garmentImageUrl: "https://example.com/garment.jpg",
      placement: {
        x: 10,
        y: 20,
        width: 300,
        height: 400,
      },
    })

    expect(result.success).toBe(true)
  })

  it("rejects invalid placement dimensions", () => {
    const result = renderRequestSchema.safeParse({
      side: "front",
      artworkSvg: "<svg><rect width='100' height='100' /></svg>",
      garmentImageUrl: null,
      placement: {
        x: 10,
        y: 20,
        width: 0,
        height: 400,
      },
    })

    expect(result.success).toBe(false)
  })
})
