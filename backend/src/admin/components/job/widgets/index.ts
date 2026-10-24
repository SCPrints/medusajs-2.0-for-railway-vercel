// ponytail: moved out of src/admin/widgets so the admin stops auto-registering them;
// the job panel composes them instead. ORIGINAL_ZONES records where each used to render.
export { default as OrderAuspostParcels } from "./order-auspost-parcels"
export { default as OrderCustomizerDownloads } from "./order-customizer-downloads"
export { default as OrderCustomizerPrintDetails } from "./order-customizer-print-details"
export { default as OrderDtfGangsheet } from "./order-dtf-gangsheet"
export { default as OrderFulfillmentContext } from "./order-fulfillment-context"
export { default as OrderPackingCheck } from "./order-packing-check"
export { default as OrderPrintRecipes } from "./order-print-recipes"
export { default as OrderProductionPhotos } from "./order-production-photos"
export { default as OrderProductionStage } from "./order-production-stage"
export { default as OrderRejects } from "./order-rejects"
export { default as OrderScreenColourCheck } from "./order-screen-colour-check"
export { default as OrderAscolourDropship } from "./order-ascolour-dropship"
export { default as OrderAussiePacificDropship } from "./order-aussie-pacific-dropship"
export { default as OrderBottleShopDropship } from "./order-bottle-shop-dropship"
export { default as OrderDeposit } from "./order-deposit"
export { default as OrderDriveFolder } from "./order-drive-folder"
export { default as OrderEmailInvoice } from "./order-email-invoice"
export { default as OrderNps } from "./order-nps"
export { default as OrderOwner } from "./order-owner"
export { default as OrderShippingDecision } from "./order-shipping-decision"
export { default as OrderTasks } from "./order-tasks"
export { default as OrderVectorizationFlag } from "./order-vectorization-flag"
export { default as OrderWatchers } from "./order-watchers"
export { default as OrderAppliedPerks } from "./order-applied-perks"

export const ORIGINAL_ZONES: Record<string, string> = {
  OrderAuspostParcels: "order.details.after",
  OrderCustomizerDownloads: "order.details.after",
  OrderCustomizerPrintDetails: "order.details.after",
  OrderDtfGangsheet: "order.details.after",
  OrderFulfillmentContext: "order.details.after",
  OrderPackingCheck: "order.details.after",
  OrderPrintRecipes: "order.details.after",
  OrderProductionPhotos: "order.details.after",
  OrderProductionStage: "order.details.after",
  OrderRejects: "order.details.after",
  OrderScreenColourCheck: "order.details.after",
  OrderAscolourDropship: "order.details.side.after",
  OrderAussiePacificDropship: "order.details.side.after",
  OrderBottleShopDropship: "order.details.side.after",
  OrderDeposit: "order.details.side.after",
  OrderDriveFolder: "order.details.side.after",
  OrderEmailInvoice: "order.details.side.after",
  OrderNps: "order.details.side.after",
  OrderOwner: "order.details.side.after",
  OrderShippingDecision: "order.details.side.after",
  OrderTasks: "order.details.side.after",
  OrderVectorizationFlag: "order.details.side.after",
  OrderWatchers: "order.details.side.after",
  OrderAppliedPerks: "order.details.side.before",
}
