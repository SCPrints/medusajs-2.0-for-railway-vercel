jest.mock("../../../lib/constants", () => ({ MINIO_PUBLIC_URL: "https://files.example.com" }))

import {
  attachmentBlock,
  attachmentSkipReason,
  splitAttachmentBlock,
  storeInboundAttachments,
  type InboundAttachmentMeta,
} from "../attachments"

const meta = (over: Partial<InboundAttachmentMeta> = {}): InboundAttachmentMeta => ({
  filename: "logo.ai",
  size: 1000,
  content_type: "application/postscript",
  content_disposition: "attachment",
  download_url: "https://resend.example/f",
  ...over,
})

describe("attachmentSkipReason", () => {
  it("keeps artwork, including large inline images (Apple Mail)", () => {
    expect(attachmentSkipReason(meta())).toBeNull()
    expect(attachmentSkipReason(meta({ filename: "art.zip" }))).toBeNull()
    expect(
      attachmentSkipReason(meta({ filename: "art.png", content_type: "image/png", content_disposition: "inline", size: 2_000_000 }))
    ).toBeNull()
  })

  it("skips signature logos, runnable files and oversize files", () => {
    expect(
      attachmentSkipReason(meta({ filename: "sig.png", content_type: "image/png", content_disposition: "inline", size: 5000 }))
    ).toBe("signature")
    expect(attachmentSkipReason(meta({ filename: "invoice.pdf.EXE" }))).toBe("blocked type")
    expect(attachmentSkipReason(meta({ size: 60 * 1024 * 1024 }))).toBe("too big")
  })
})

describe("splitAttachmentBlock", () => {
  const saved = [{ name: "my logo.ai", url: "https://files.example.com/my_logo-01.ai" }]

  it("round-trips saved files and leaves the text and missed files", () => {
    const detail = `Here you go${attachmentBlock(saved, ["big.zip (too big)"])}`
    expect(splitAttachmentBlock(detail)).toEqual({
      detail: "Here you go\n\nNot saved: big.zip (too big)",
      attachments: saved,
    })
  })

  it("makes no link from a look-alike block typed by the customer", () => {
    const detail = "Hi\n\nAttachments:\n- invoice.pdf: https://evil.example/x"
    expect(splitAttachmentBlock(detail)).toEqual({ detail, attachments: [] })
  })

  it("leaves other text alone", () => {
    expect(splitAttachmentBlock("Hi")).toEqual({ detail: "Hi", attachments: [] })
    expect(splitAttachmentBlock(null)).toEqual({ detail: null, attachments: [] })
  })
})

describe("storeInboundAttachments", () => {
  const realFetch = global.fetch
  afterEach(() => {
    global.fetch = realFetch
  })

  const setup = (createFiles: jest.Mock) =>
    ({
      resolve: (key: string) => (key === "logger" ? { warn: jest.fn() } : { createFiles }),
    }) as any

  it("saves a file, retrying a failed download once", async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 503 })
      .mockResolvedValueOnce({ ok: true, arrayBuffer: async () => new ArrayBuffer(4) }) as any
    const createFiles = jest.fn().mockResolvedValue([{ url: "https://files.example.com/logo-01.ai" }])

    const block = await storeInboundAttachments(setup(createFiles), [meta()])

    expect(createFiles.mock.calls[0][0][0]).toMatchObject({ filename: "logo.ai", mimeType: "application/postscript" })
    expect(splitAttachmentBlock(`Hi${block}`).attachments).toEqual([
      { name: "logo.ai", url: "https://files.example.com/logo-01.ai" },
    ])
  })

  it("names a file it could not save rather than dropping it or the email", async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error("network")) as any

    const block = await storeInboundAttachments(setup(jest.fn()), [meta(), meta({ filename: "virus.exe" })])

    expect(block).toBe("\n\nNot saved: logo.ai (failed, ask the customer to resend), virus.exe (blocked type)")
  })
})
