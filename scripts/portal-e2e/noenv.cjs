const fs = require("fs")
const orig = fs.readFileSync
fs.readFileSync = function (p, ...rest) {
  if (typeof p === "string" && /\/backend\/\.env(\..*)?$/.test(p)) return rest[0] ? "" : Buffer.from("")
  return orig.call(this, p, ...rest)
}
