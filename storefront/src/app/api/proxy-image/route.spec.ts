import { NextRequest } from "next/server"
import { GET } from "./route"

const svgBody = '<svg xmlns="http://www.w3.org/2000/svg"><rect width="1" height="1"/></svg>'

const mockUpstream = (contentType: string, body: string) => {
  ;(global as any).fetch = jest.fn().mockResolvedValue(
    new Response(body, { status: 200, headers: { "content-type": contentType } })
  )
}

const call = (query: string) =>
  GET(new NextRequest(`https://scprints.com.au/api/proxy-image?${query}`))

const R2_SVG = encodeURIComponent("https://pub-abc.r2.dev/artwork.svg")

describe("proxy-image", () => {
  it("serves an SVG as inert text when as=text", async () => {
    mockUpstream("image/svg+xml", svgBody)
    const res = await call(`as=text&url=${R2_SVG}`)
    expect(res.status).toBe(200)
    expect(res.headers.get("content-type")).toBe("text/plain; charset=utf-8")
    expect(res.headers.get("x-content-type-options")).toBe("nosniff")
    expect(await res.text()).toBe(svgBody)
  })

  it("still refuses to serve an SVG as an image", async () => {
    mockUpstream("image/svg+xml", svgBody)
    expect((await call(`url=${R2_SVG}`)).status).toBe(415)
  })

  it("keeps the host allowlist in text mode", async () => {
    mockUpstream("image/svg+xml", svgBody)
    const res = await call(
      `as=text&url=${encodeURIComponent("https://evil.example.com/a.svg")}`
    )
    expect(res.status).toBe(403)
  })
})
