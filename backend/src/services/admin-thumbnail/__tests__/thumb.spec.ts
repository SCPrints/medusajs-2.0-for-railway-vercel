/**
 * The thumbnail route fetches whatever URL it is given, so it must only ever
 * accept our own R2 files.
 */
jest.mock("../../../lib/constants", () => ({
  BACKEND_URL: "https://backend.test",
  MINIO_ACCESS_KEY: "ak",
  MINIO_SECRET_KEY: "sk",
  MINIO_BUCKET: "sc-prints-media",
  MINIO_ENDPOINT: "acct.r2.cloudflarestorage.com",
  MINIO_PUBLIC_URL: "https://pub-abc.r2.dev",
}))

import { ownR2PublicUrl, thumbKeyFor } from "../thumb"

describe("ownR2PublicUrl", () => {
  it("accepts our public R2 files", () => {
    expect(ownR2PublicUrl("https://pub-abc.r2.dev/customizer/a.png")).toBe(
      "https://pub-abc.r2.dev/customizer/a.png"
    )
  })

  it("maps our private-endpoint URLs to the public host", () => {
    expect(
      ownR2PublicUrl("https://acct.r2.cloudflarestorage.com/sc-prints-media/customizer/a.png")
    ).toBe("https://pub-abc.r2.dev/customizer/a.png")
  })

  it.each([
    "https://evil.example/a.png",
    "https://pub-abc.r2.dev.evil.example/a.png",
    "https://pub-abc.r2.dev@evil.example/a.png",
    "http://169.254.169.254/latest/meta-data",
    "https://pub-abc.r2.dev/../x",
    "https://pub-abc.r2.dev/thumbs/abc.webp",
    "not a url",
    "",
  ])("refuses %s", (url) => {
    expect(ownR2PublicUrl(url)).toBeNull()
  })
})

describe("thumbKeyFor", () => {
  it("is stable per URL and lives under thumbs/", () => {
    const a = thumbKeyFor("https://pub-abc.r2.dev/customizer/a.png")
    expect(a).toMatch(/^thumbs\/[0-9a-f]{32}\.webp$/)
    expect(thumbKeyFor("https://pub-abc.r2.dev/customizer/a.png")).toBe(a)
    expect(thumbKeyFor("https://pub-abc.r2.dev/customizer/b.png")).not.toBe(a)
  })
})
