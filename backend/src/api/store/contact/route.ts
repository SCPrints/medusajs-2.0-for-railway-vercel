import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"

// ✅ Proper preflight handler
export async function OPTIONS(
  req: MedusaRequest,
  res: MedusaResponse
) {
  res.sendStatus(200)
}

// ✅ Actual contact form handler
export async function POST(
  req: MedusaRequest,
  res: MedusaResponse
) {
  const body = req.body

  console.log("📬 NEW CONTACT MESSAGE RECEIVED!")
  console.log("Data:", body)

  return res.status(200).json({
    success: true,
    message: "Your message was successfully received by the backend!",
  })
}
