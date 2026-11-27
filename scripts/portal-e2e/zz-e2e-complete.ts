// Portal e2e helper (throwaway DB only; run.sh copies it in and removes it): complete a personal cart with the
// system provider, skipping the card step the store routes refuse.
import { Modules } from "@medusajs/framework/utils"
import { completeCartWorkflow, createPaymentCollectionForCartWorkflow, createPaymentSessionsWorkflow } from "@medusajs/medusa/core-flows"

export default async function run({ container }: any) {
  const cartId = process.env.CART_ID as string
  const query = container.resolve("query")
  let { data: [cart] } = await query.graph({ entity: "cart", filters: { id: cartId }, fields: ["id", "payment_collection.id"] })
  if (!cart.payment_collection) {
    await createPaymentCollectionForCartWorkflow(container).run({ input: { cart_id: cartId } })
    ;({ data: [cart] } = await query.graph({ entity: "cart", filters: { id: cartId }, fields: ["id", "payment_collection.id"] }))
  }
  await createPaymentSessionsWorkflow(container).run({ input: { payment_collection_id: cart.payment_collection.id, provider_id: "pp_system_default" } })
  const { result } = await completeCartWorkflow(container).run({ input: { id: cartId } })
  console.log(`E2E_ORDER=${(result as any).id}`)
  await new Promise((r) => setTimeout(r, 3000)) // let order.placed subscribers finish
}
