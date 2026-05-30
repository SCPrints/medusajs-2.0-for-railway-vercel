import { model } from "@medusajs/framework/utils"

/**
 * A reusable "print profile" — the set of printable areas a garment supports,
 * and per-area the allowed decoration methods + sizes. Products reference a
 * profile by handle (`product.metadata.print_profile`); editing the profile
 * propagates to every product on it.
 *
 * `areas` is a JSON array of PrintProfileArea (see src/lib/print-profile.ts):
 *   { key, label, methods: string[], sizes: string[], max_prints? }
 *
 * `is_system` marks the seeded standard profiles (Short Sleeve Garment, etc.).
 * They can be edited but the admin guards against deleting them.
 */
const PrintProfile = model
  .define("print_profile", {
    id: model.id({ prefix: "ppro" }).primaryKey(),
    name: model.text(),
    handle: model.text(),
    description: model.text().nullable(),
    is_system: model.boolean().default(false),
    position: model.number().default(0),
    // jsonb array of PrintProfileArea — `model.json()` types the value as a
    // Record, so reads/writes cast to PrintProfileArea[] at the boundaries.
    areas: model.json().default([] as any),
  })
  .indexes([{ on: ["handle"], unique: true }])

export default PrintProfile
