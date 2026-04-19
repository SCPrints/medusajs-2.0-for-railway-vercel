import { MedusaError } from "@medusajs/framework/utils"
import { rethrowIfMedusaError, validateGarmentImageUrl } from "../service"

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
})
