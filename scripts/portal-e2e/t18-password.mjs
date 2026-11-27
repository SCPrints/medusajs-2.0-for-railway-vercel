// Passwords: change it while signed in, and set a new one from an emailed reset link.
import { execSync } from "child_process"
import { api, check, customer, describe, summary } from "./lib.mjs"

const RUN = Date.now().toString(36)
const OLD = "e2e-pass-123" // the password lib.customer() registers with
const sleep = (ms) => new Promise((x) => setTimeout(x, ms))
const ENV = new URL("./env.sh", import.meta.url).pathname
const login = (email, password) => api("POST", "/auth/customer/emailpass", { body: { email, password }, store: false })
const change = (who, body) => api("POST", "/store/customers/me/password", { token: who.token, body })

/** A real reset token, made the way the "forgot password" route makes one. */
const resetToken = async (email) => {
  try {
    const out = execSync(`RESET_EMAIL=${email} ${ENV} npx medusa exec src/scripts/zz-e2e-reset-token.ts 2>&1`, { encoding: "utf8" })
    // The dev server may reload after an exec: wait until it answers again.
    await sleep(4000)
    for (let i = 0; i < 60; i++) {
      if (await fetch("http://localhost:9000/health").then((x) => x.ok).catch(() => false)) break
      await sleep(1000)
    }
    await sleep(2000)
    return out.match(/E2E_TOKEN=(\S+)/)?.[1] ?? null
  } catch (e) {
    console.log(String(e.stdout ?? e).split("\n").filter((l) => /rror/.test(l)).slice(0, 3).join("\n"))
    return null
  }
}

describe("Change password while signed in")
const ann = await customer(`ann+${RUN}@pw.example.com`)
const bob = await customer(`bob+${RUN}@pw.example.com`)
let r = await api("POST", "/store/customers/me/password", { body: { old_password: OLD, new_password: "brand-new-pass-1" } })
check("not signed in: refused", r.status === 401, r.status)
r = await change(ann, { old_password: "not-her-password", new_password: "brand-new-pass-1" })
check("wrong current password: refused, and says why", r.status === 400 && /current password/i.test(r.body?.message ?? ""), r.body)
r = await change(ann, { old_password: OLD, new_password: "short" })
check("new password under 8 characters: refused", r.status === 400, r.body)
check("nothing changed yet: the old password still signs in", (await login(ann.email, OLD)).status === 200)
r = await change(ann, { old_password: OLD, new_password: "brand-new-pass-1" })
check("right current password: changed", r.status === 200 && r.body?.success === true, r.body)
r = await login(ann.email, OLD)
check("the old password no longer signs in", r.status === 401, r.status)
check("the new password signs in", (await login(ann.email, "brand-new-pass-1")).status === 200)
check("another customer's password is untouched", (await login(bob.email, OLD)).status === 200)

describe("Forgot password: the emailed link")
r = await api("POST", "/auth/customer/emailpass/reset-password", { body: { identifier: bob.email }, store: false })
check("asking for a link: accepted", r.status === 201, r.status)
r = await api("POST", "/auth/customer/emailpass/reset-password", { body: { identifier: `nobody+${RUN}@pw.example.com` }, store: false })
check("an unknown email gets the same answer (no fishing for accounts)", r.status === 201, r.status)
const setPassword = (token, password) =>
  api("POST", "/auth/customer/emailpass/update", { token, body: { email: bob.email, password }, store: false })
r = await setPassword(bob.token, "sneaky-pass-000")
check("an ordinary sign-in token can't set a password", r.status === 401, r.status)
const token = await resetToken(bob.email)
check("a reset token is issued for the account", !!token)
r = await setPassword(token, "reset-pass-456")
check("the link's token sets the new password", r.status === 200, r.body)
r = await login(bob.email, OLD)
check("the forgotten password no longer signs in", r.status === 401, r.status)
check("the new password signs in", (await login(bob.email, "reset-pass-456")).status === 200)
r = await setPassword(token, "third-pass-789")
check("the link works once only", r.status === 401, r.status)
check("…and the second try changed nothing", (await login(bob.email, "reset-pass-456")).status === 200)

process.exit(summary(new URL("./t18.json", import.meta.url).pathname) ? 1 : 0)
