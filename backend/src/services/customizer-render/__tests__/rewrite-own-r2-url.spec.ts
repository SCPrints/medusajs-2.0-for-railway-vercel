/**
 * `rewriteOwnR2UrlToPublic` is the retroactive half of the blank-artwork fix.
 * Customer-original uploads were historically stored under the R2 *S3 API*
 * endpoint (`<acct>.r2.cloudflarestorage.com/<bucket>/<key>`), which returns
 * 400/401 to the unauthenticated fetch() the render uses to re-inline remote
 * `<image>` hrefs — so the artwork rasterized BLANK. The same object is public
 * at `MINIO_PUBLIC_URL/<key>`; the helper rewrites only our own private-endpoint
 * URLs so already-stored designs render without a re-upload.
 *
 * Constants are import-frozen, so mock the module to exercise the rewrite.
 */
jest.mock("../../../lib/constants", () => ({
  BACKEND_URL: "https://backend.test",
  MINIO_ACCESS_KEY: "ak",
  MINIO_SECRET_KEY: "sk",
  MINIO_BUCKET: "sc-prints-media",
  MINIO_ENDPOINT: "45c6f294aad0797f2e9d9828bdea5e5d.r2.cloudflarestorage.com",
  MINIO_PUBLIC_URL: "https://pub-4b98c1b8d55d4d9597ff5cfac6aa611a.r2.dev",
}))

import { rewriteOwnR2UrlToPublic } from "../service"

describe("rewriteOwnR2UrlToPublic", () => {
  it("rewrites our private S3 endpoint URL to the public R2 host (the real bug)", () => {
    expect(
      rewriteOwnR2UrlToPublic(
        "https://45c6f294aad0797f2e9d9828bdea5e5d.r2.cloudflarestorage.com/sc-prints-media/customizer/customer-original-01KSE992GHCKTC06VBAQ39QPWZ.png"
      )
    ).toBe(
      "https://pub-4b98c1b8d55d4d9597ff5cfac6aa611a.r2.dev/customizer/customer-original-01KSE992GHCKTC06VBAQ39QPWZ.png"
    )
  })

  it("passes through already-public r2.dev URLs unchanged", () => {
    const url =
      "https://pub-4b98c1b8d55d4d9597ff5cfac6aa611a.r2.dev/customizer/print-front-x.png"
    expect(rewriteOwnR2UrlToPublic(url)).toBe(url)
  })

  it("passes through foreign CDN hosts unchanged", () => {
    const url = "https://cdn.shopify.com/s/files/1/0/artwork.png"
    expect(rewriteOwnR2UrlToPublic(url)).toBe(url)
  })

  it("leaves our endpoint host but a different bucket untouched", () => {
    const url =
      "https://45c6f294aad0797f2e9d9828bdea5e5d.r2.cloudflarestorage.com/other-bucket/x.png"
    expect(rewriteOwnR2UrlToPublic(url)).toBe(url)
  })

  it("returns malformed input unchanged", () => {
    expect(rewriteOwnR2UrlToPublic("not a url")).toBe("not a url")
  })
})
