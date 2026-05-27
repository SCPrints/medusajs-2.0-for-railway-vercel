import { defineLink } from "@medusajs/framework/utils"
import CustomerModule from "@medusajs/medusa/customer"

import OrganisationModule from "../modules/organisation"

/**
 * One customer can be the `primary_contact_customer_id` for many
 * organisations (rare but possible — the same person could administer
 * multiple Lifegrain-style brand accounts). `isList: true` on the
 * customer side.
 *
 * Used by Phase 1 of the customer fulfillment service: every fulfillment
 * order's `customer_id` is sourced from `organisation.primary_contact_customer_id`,
 * and Phase 2's customer portal uses this link to expose "orgs you're the
 * primary contact for" alongside "orgs you're a member of".
 *
 * Run `npx medusa db:sync-links` after adding/changing this file so the
 * link table is materialised in Postgres.
 *
 * See Docs/FULFILLMENT_PHASE_1_SPEC.md → "Resolved decisions Q1".
 */
export default defineLink(
  CustomerModule.linkable.customer,
  {
    linkable: OrganisationModule.linkable.organisation,
    isList: true,
  }
)
