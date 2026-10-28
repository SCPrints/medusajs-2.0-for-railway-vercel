import type { ExecArgs } from "@medusajs/framework/types"

import { refreshSearchPopularity } from "../jobs/refresh-search-popularity"

/** One-off run of the nightly job (first fill after deploy). */
export default async function run({ container }: ExecArgs) {
  console.log("refresh-search-popularity:", await refreshSearchPopularity(container))
}
