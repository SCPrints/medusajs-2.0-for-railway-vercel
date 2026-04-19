import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { MedusaError } from "@medusajs/framework/utils"
import { renderMockupAsset } from "../../../../services/customizer-render/service"
import { renderRequestSchema } from "../../../../services/customizer-render/types"

export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const parsed = renderRequestSchema.safeParse(req.body ?? {})

  if (!parsed.success) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      `Invalid render-mockup payload: ${parsed.error.issues.map((issue) => issue.message).join(", ")}`
    )
  }

  const result = await renderMockupAsset(parsed.data)
  return res.status(200).json({
    success: true,
    ...result,
  })
}
