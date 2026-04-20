import { extractRenderArtifactUrl, normalizePersistedArtifactUrl } from "./artifact-url"

describe("artifact URL normalization", () => {
  it("returns null for null-like and data URLs", () => {
    expect(normalizePersistedArtifactUrl(null)).toBeNull()
    expect(normalizePersistedArtifactUrl(undefined)).toBeNull()
    expect(normalizePersistedArtifactUrl("")).toBeNull()
    expect(normalizePersistedArtifactUrl("null")).toBeNull()
    expect(normalizePersistedArtifactUrl("undefined")).toBeNull()
    expect(normalizePersistedArtifactUrl("data:image/png;base64,AAA")).toBeNull()
  })

  it("preserves normal URLs", () => {
    expect(
      normalizePersistedArtifactUrl("https://cdn.example.com/customizer/mockup-1.jpg")
    ).toBe("https://cdn.example.com/customizer/mockup-1.jpg")
  })

  it("extracts only string URLs from unknown render payloads", () => {
    expect(extractRenderArtifactUrl("https://example.com/file.png")).toBe(
      "https://example.com/file.png"
    )
    expect(extractRenderArtifactUrl("null")).toBeNull()
    expect(extractRenderArtifactUrl(null)).toBeNull()
    expect(extractRenderArtifactUrl(undefined)).toBeNull()
    expect(extractRenderArtifactUrl({})).toBeNull()
    expect(extractRenderArtifactUrl({ url: "https://example.com/file.png" })).toBe(
      "https://example.com/file.png"
    )
  })
})
