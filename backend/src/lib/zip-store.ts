import { crc32 } from "node:zlib"

/**
 * Minimal ZIP writer (no compression — the files are PDFs and images, already
 * compressed). Each entry is written as soon as it is added, so a big pack
 * streams out one file at a time.
 * ponytail: no ZIP64 — entries and the whole archive must stay under 4 GB (the
 * download pack caps itself far below that). Use a library if that changes.
 */
const dosDateTime = (d: Date) => ({
  time: (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1),
  date: (Math.max(1980, d.getFullYear()) - 1980) << 9 | ((d.getMonth() + 1) << 5) | d.getDate(),
})

/** A file name safe to put in an archive: no folders-up, no control characters. */
export const safeZipName = (name: string): string =>
  name
    .split("/")
    .map((part) => part.replace(/[\u0000-\u001f\u007f<>:"\\|?*]/g, " ").replace(/\s+/g, " ").trim().replace(/^\.+/, ""))
    .filter(Boolean)
    .join("/")
    .slice(0, 180) || "file"

export function createZip(write: (chunk: Buffer) => void, now: Date = new Date()) {
  const central: Buffer[] = []
  const used = new Set<string>()
  let offset = 0
  const { time, date } = dosDateTime(now)

  const uniqueName = (raw: string) => {
    const name = safeZipName(raw)
    if (!used.has(name.toLowerCase())) return name
    const dot = name.lastIndexOf(".")
    const [stem, ext] = dot > name.lastIndexOf("/") ? [name.slice(0, dot), name.slice(dot)] : [name, ""]
    for (let n = 2; ; n++) if (!used.has(`${stem} (${n})${ext}`.toLowerCase())) return `${stem} (${n})${ext}`
  }

  return {
    /** Adds one file; returns the name it was stored under. */
    add(rawName: string, data: Buffer): string {
      const name = uniqueName(rawName)
      used.add(name.toLowerCase())
      const nameBuf = Buffer.from(name, "utf8")
      const crc = crc32(data)

      const local = Buffer.alloc(30)
      local.writeUInt32LE(0x04034b50, 0)
      local.writeUInt16LE(20, 4) // version needed
      local.writeUInt16LE(0x0800, 6) // UTF-8 names
      local.writeUInt16LE(0, 8) // stored
      local.writeUInt16LE(time, 10)
      local.writeUInt16LE(date, 12)
      local.writeUInt32LE(crc, 14)
      local.writeUInt32LE(data.length, 18)
      local.writeUInt32LE(data.length, 22)
      local.writeUInt16LE(nameBuf.length, 26)
      write(Buffer.concat([local, nameBuf]))
      write(data)

      const dir = Buffer.alloc(46)
      dir.writeUInt32LE(0x02014b50, 0)
      dir.writeUInt16LE(20, 4) // version made by
      dir.writeUInt16LE(20, 6)
      dir.writeUInt16LE(0x0800, 8)
      dir.writeUInt16LE(0, 10)
      dir.writeUInt16LE(time, 12)
      dir.writeUInt16LE(date, 14)
      dir.writeUInt32LE(crc, 16)
      dir.writeUInt32LE(data.length, 20)
      dir.writeUInt32LE(data.length, 24)
      dir.writeUInt16LE(nameBuf.length, 28)
      dir.writeUInt32LE(offset, 42)
      central.push(Buffer.concat([dir, nameBuf]))

      offset += 30 + nameBuf.length + data.length
      return name
    },
    /** Writes the directory. Nothing can be added after this. */
    end(): void {
      const dir = Buffer.concat(central)
      const eocd = Buffer.alloc(22)
      eocd.writeUInt32LE(0x06054b50, 0)
      eocd.writeUInt16LE(central.length, 8)
      eocd.writeUInt16LE(central.length, 10)
      eocd.writeUInt32LE(dir.length, 12)
      eocd.writeUInt32LE(offset, 16)
      write(Buffer.concat([dir, eocd]))
    },
  }
}
