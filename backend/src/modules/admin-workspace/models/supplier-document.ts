import { model } from "@medusajs/framework/utils"

/**
 * SC Prints' own paperwork that customers' procurement teams ask for (ABN
 * certificate, insurance certificate of currency, modern slavery statement…).
 * Staff upload each once in admin (Setup → Supplier documents); signed-in
 * customers download them from /account/documents. `updated_at` is the "as at"
 * date customers see.
 */
const SupplierDocument = model.define("supplier_document", {
  id: model.id({ prefix: "sdoc" }).primaryKey(),
  title: model.text(),
  url: model.text(),
})

export default SupplierDocument
