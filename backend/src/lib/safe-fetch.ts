import { lookup } from "node:dns/promises"
import { isIP } from "node:net"

/**
 * Download a URL that came from a customer (cart / design metadata) without
 * letting it reach our private network or eat the server's memory. https
 * only; refuses localhost, *.internal (Fly's private network), and any host
 * that resolves to a private address, at every redirect; stops reading past
 * `maxBytes`. Returns null on any refusal or failure.
 */
export type SafeFetchResult = { buffer: Buffer; contentType: string | null }

const PRIVATE_V4: Array<[number, number]> = [
  // [network, prefix bits]
  [0x00000000, 8], // 0.0.0.0/8
  [0x0a000000, 8], // 10/8
  [0x64400000, 10], // 100.64/10 (carrier NAT)
  [0x7f000000, 8], // 127/8
  [0xa9fe0000, 16], // 169.254/16 (cloud metadata)
  [0xac100000, 12], // 172.16/12
  [0xc0a80000, 16], // 192.168/16
]

export function isPrivateAddress(ip: string): boolean {
  const mapped = ip.toLowerCase().match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/)
  if (mapped) return isPrivateAddress(mapped[1])
  if (isIP(ip) === 4) {
    const n = ip.split(".").reduce((a, o) => (a << 8) + Number(o), 0) >>> 0
    return PRIVATE_V4.some(([net, bits]) => n >>> (32 - bits) === net >>> (32 - bits))
  }
  const v6 = ip.toLowerCase()
  // ::, ::1, unique-local fc00::/7 (Fly 6PN is fdaa:…), link-local fe80::/10.
  return v6 === "::" || v6 === "::1" || /^f[cd]/.test(v6) || /^fe[89ab]/.test(v6)
}

export function isBlockedHostname(host: string): boolean {
  const h = host.toLowerCase().replace(/^\[|\]$/g, "")
  if (h === "localhost" || /\.(internal|local|localhost|flycast)$/.test(h)) return true
  return isIP(h) ? isPrivateAddress(h) : false
}

async function hostIsPublic(host: string): Promise<boolean> {
  if (isBlockedHostname(host)) return false
  if (isIP(host.replace(/^\[|\]$/g, ""))) return true
  try {
    const addrs = await lookup(host, { all: true })
    return addrs.length > 0 && addrs.every((a) => !isPrivateAddress(a.address))
  } catch {
    return false
  }
}

export async function safeFetchBuffer(
  rawUrl: string | null | undefined,
  opts: { maxBytes: number; timeoutMs: number }
): Promise<SafeFetchResult | null> {
  let url = rawUrl ?? ""
  const signal = AbortSignal.timeout(opts.timeoutMs)
  try {
    for (let hop = 0; hop < 4; hop++) {
      const u = new URL(url)
      if (u.protocol !== "https:" || !(await hostIsPublic(u.hostname))) return null
      const res = await fetch(u, { signal, redirect: "manual" })
      if (res.status >= 300 && res.status < 400) {
        const next = res.headers.get("location")
        if (!next) return null
        url = new URL(next, u).toString()
        continue
      }
      if (!res.ok || !res.body) return null
      const declared = Number(res.headers.get("content-length"))
      if (Number.isFinite(declared) && declared > opts.maxBytes) return null
      const chunks: Buffer[] = []
      let total = 0
      for await (const chunk of res.body as any as AsyncIterable<Uint8Array>) {
        total += chunk.byteLength
        if (total > opts.maxBytes) return null
        chunks.push(Buffer.from(chunk))
      }
      return { buffer: Buffer.concat(chunks), contentType: res.headers.get("content-type") }
    }
    return null
  } catch {
    return null
  }
}
