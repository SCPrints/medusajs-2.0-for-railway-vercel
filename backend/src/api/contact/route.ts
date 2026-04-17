import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"

export async function OPTIONS(
  req: MedusaRequest,
  res: MedusaResponse
) {
  res.sendStatus(200)
}

export async function POST(
  req: MedusaRequest,
  res: MedusaResponse
) {
  const { name, email, message } = req.body

  if (!email || !message) {
    return res.status(400).json({
      success: false,
      message: "Email and message are required",
    })
  }

  console.log("📬 Contact message received", {
    name,
    email,
    message,
  })

  return res.status(200).json({
    success: true,
  })
}