import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"

// 1. Intercept the browser's preflight check and immediately approve it
export async function OPTIONS(req: MedusaRequest, res: MedusaResponse) {
  return res.json({ success: true })
}

// 2. Handle the actual form data
export async function POST(
  req: MedusaRequest,
  res: MedusaResponse
) {
  const body = req.body

  console.log("📬 NEW CONTACT MESSAGE RECEIVED!")
  console.log("Data:", body)

  return res.json({
    success: true,
    message: "Your message was successfully received by the backend!"
  })
}