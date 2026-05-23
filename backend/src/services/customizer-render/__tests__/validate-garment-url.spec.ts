import { MedusaError } from "@medusajs/framework/utils"
import { renderMockupAsset, rethrowIfMedusaError, validateGarmentImageUrl } from "../service"

/**
 * `validateGarmentImageUrl` gates private-host rejection behind
 * `NODE_ENV === "production"` so local dev can use `http://localhost:9000`
 * sleeve placeholders. Force the production code path for the security
 * assertions; restore whatever the harness set afterwards.
 */
const ORIGINAL_NODE_ENV = process.env.NODE_ENV
const ORIGINAL_ALLOW = process.env.CUSTOMIZER_ALLOW_PRIVATE_GARMENT_URLS

beforeAll(() => {
  process.env.NODE_ENV = "production"
  delete process.env.CUSTOMIZER_ALLOW_PRIVATE_GARMENT_URLS
})

afterAll(() => {
  if (ORIGINAL_NODE_ENV === undefined) delete process.env.NODE_ENV
  else process.env.NODE_ENV = ORIGINAL_NODE_ENV
  if (ORIGINAL_ALLOW === undefined)
    delete process.env.CUSTOMIZER_ALLOW_PRIVATE_GARMENT_URLS
  else process.env.CUSTOMIZER_ALLOW_PRIVATE_GARMENT_URLS = ORIGINAL_ALLOW
})

describe("validateGarmentImageUrl", () => {
  it("rejects private and local hosts", () => {
    expect(() => validateGarmentImageUrl("http://localhost:9000/image.png")).toThrow(
      MedusaError
    )
    expect(() => validateGarmentImageUrl("http://127.0.0.1/image.png")).toThrow(MedusaError)
    expect(() => validateGarmentImageUrl("http://192.168.0.10/image.png")).toThrow(MedusaError)
  })

  it("rejects non-http protocols", () => {
    expect(() => validateGarmentImageUrl("file:///tmp/image.png")).toThrow(MedusaError)
  })

  it("accepts public https URLs", () => {
    expect(validateGarmentImageUrl("https://cdn.example.com/mockup.png")).toBe(
      "https://cdn.example.com/mockup.png"
    )
  })

  it("rethrows MedusaError and ignores non-Medusa errors", () => {
    const blockedError = new MedusaError(
      MedusaError.Types.INVALID_DATA,
      "Private or local network garment image URLs are not allowed."
    )

    expect(() => rethrowIfMedusaError(blockedError)).toThrow(MedusaError)
    expect(() => rethrowIfMedusaError(new Error("network timeout"))).not.toThrow()
  })

  it("rethrows MedusaError-like objects by shape", () => {
    const errorLike = {
      name: "MedusaError",
      message: "blocked",
      type: MedusaError.Types.INVALID_DATA,
    }

    expect(() => rethrowIfMedusaError(errorLike)).toThrow("blocked")
  })

  it("does not swallow garment URL validation failures in renderMockupAsset", async () => {
    await expect(
      renderMockupAsset({
        side: "front",
        artworkSvg:
          '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400"><rect width="400" height="400" fill="#000"/></svg>',
        garmentImageUrl: "http://127.0.0.1/test.png",
        placement: {
          x: 0,
          y: 0,
          width: 400,
          height: 400,
        },
      })
    ).rejects.toThrow(MedusaError)
  })
})
