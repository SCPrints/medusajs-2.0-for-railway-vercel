import { model } from "@medusajs/framework/utils"

/**
 * A pending invitation for a colleague to join an organisation. The email link
 * carries a random token; only its SHA-256 hash is stored. Accepting needs a
 * signed-in, email-confirmed account with the invited address, and creates the
 * organisation_member row.
 */
const OrganisationInvite = model
  .define("organisation_invite", {
    id: model.id({ prefix: "orgi" }).primaryKey(),
    organisation_id: model.text(),
    email: model.text(),
    role: model.enum(["owner", "purchaser", "viewer"]).default("purchaser"),
    token_hash: model.text(),
    invited_by: model.text(),
    expires_at: model.dateTime(),
    accepted_at: model.dateTime().nullable(),
    revoked_at: model.dateTime().nullable(),
    send_count: model.number().default(1),
  })
  .indexes([
    { on: ["organisation_id"] },
    { on: ["token_hash"], unique: true },
  ])

export default OrganisationInvite
