import { crc32 } from "node:zlib"

import { toCsv } from "../csv"
import { collectPackFiles } from "../download-pack"
import { createZip, safeZipName } from "../zip-store"

const build = (files: Array<[string, string]>) => {
  const chunks: Buffer[] = []
  const zip = createZip((c) => chunks.push(c), new Date(2026, 10, 19, 10, 30, 0))
  const names = files.map(([n, d]) => zip.add(n, Buffer.from(d)))
  zip.end()
  return { buf: Buffer.concat(chunks), names }
}

describe("createZip", () => {
  it("writes a readable archive: directory, sizes, CRCs and offsets line up", () => {
    const { buf, names } = build([["Tax invoice 78.pdf", "hello"], ["Proofs/a.png", "world!!"], ["Proofs/a.png", "dupe"]])
    expect(names).toEqual(["Tax invoice 78.pdf", "Proofs/a.png", "Proofs/a (2).png"])

    const eocd = buf.length - 22
    expect(buf.readUInt32LE(eocd)).toBe(0x06054b50)
    expect(buf.readUInt16LE(eocd + 10)).toBe(3)
    let p = buf.readUInt32LE(eocd + 16)
    expect(p + buf.readUInt32LE(eocd + 12)).toBe(eocd)

    const data = ["hello", "world!!", "dupe"]
    for (let i = 0; i < 3; i++) {
      expect(buf.readUInt32LE(p)).toBe(0x02014b50)
      const size = buf.readUInt32LE(p + 24)
      const nameLen = buf.readUInt16LE(p + 28)
      const local = buf.readUInt32LE(p + 42)
      expect(buf.toString("utf8", p + 46, p + 46 + nameLen)).toBe(names[i])
      expect(buf.readUInt32LE(p + 16)).toBe(crc32(Buffer.from(data[i])))
      expect(buf.readUInt32LE(local)).toBe(0x04034b50)
      const start = local + 30 + buf.readUInt16LE(local + 26)
      expect(buf.toString("utf8", start, start + size)).toBe(data[i])
      p += 46 + nameLen
    }
  })
  it("never lets a name climb out of the archive", () => {
    expect(safeZipName("../../etc/passwd")).toBe("etc/passwd")
    expect(safeZipName('a<b>:"c".png')).toBe("a b c .png")
    expect(safeZipName("")).toBe("file")
  })
})

describe("collectPackFiles", () => {
  const BASE = "https://pub-x.r2.dev"
  const order = {
    metadata: { revised_proofs: [{ side: "front", url: `${BASE}/proof.jpg`, artwork_url: `${BASE}/art.png` }] },
    items: [
      {
        title: "Staple Tee — Black / M",
        metadata: {
          customizerDesign: {
            artifacts: [
              { side: "front", mockupUrl: `${BASE}/mock-front.png`, printUrl: `${BASE}/print-front.png` },
              { side: "back", mockupUrl: "https://evil.example.com/steal.png" },
            ],
            customerOriginalFiles: [{ url: `${BASE}/orig/logo.pdf`, fileName: "Club logo.pdf" }, { url: "http://sc-prints-redis.internal:6379/" }],
          },
        },
      },
      { title: "Staple Tee — Black / L", metadata: { customizerDesign: { artifacts: [{ side: "front", mockupUrl: `${BASE}/mock-front.png` }] } } },
      { title: "Freight", metadata: null },
    ],
  }
  it("lists proofs, mockups and the customer's files once each, from our file host only", () => {
    expect(collectPackFiles(order, BASE)).toEqual([
      { path: "Proofs/Proof from SC Prints - front.jpg", url: `${BASE}/proof.jpg` },
      { path: "Artwork/Print-ready artwork - front.png", url: `${BASE}/art.png` },
      { path: "Proofs/Mockup - Staple Tee — Black - front.png", url: `${BASE}/mock-front.png` },
      { path: "Artwork/Your files/Club logo.pdf", url: `${BASE}/orig/logo.pdf` },
    ])
  })
  it("leaves internal print files out", () => {
    expect(collectPackFiles(order, BASE).some((f) => f.url.includes("print-front"))).toBe(false)
  })
})

describe("toCsv", () => {
  it("quotes commas, quotes and formulas", () => {
    expect(toCsv([["a,b", 'say "hi"', "=SUM(A1)", 12.5, null]])).toBe('﻿"a,b","say ""hi""",\'=SUM(A1),12.5,\r\n')
  })
})
