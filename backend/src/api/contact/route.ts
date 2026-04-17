import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"

// This function forces the browser to allow the request
function setManualCors(res: MedusaResponse) {
  res.setHeader("Access-Control-Allow-Origin", "https://medusajs-2-0-for-railway-vercel.vercel.app")
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS")
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, x-publishable-api-key")
  res.setHeader("Access-Control-Allow-Credentials", "true")
}

export async function OPTIONS(req: MedusaRequest, res: MedusaResponse) {
  setManualCors(res)
  return res.status(204).send()
}

export async function POST(req: MedusaRequest, res: MedusaResponse) {
  setManualCors(res)
  
  const { name, email, message } = req.body as any

  if (!email || !message) {
    return res.status(400).json({
      success: false,
      message: "Email and message are required",
    })
  }

  console.log("📬 SUCCESS! CONTACT MESSAGE RECEIVED AT ROOT ROUTE:", { name, email, message })

  return res.status(200).json({
    success: true,
    message: "Data received by backend"
  })
}