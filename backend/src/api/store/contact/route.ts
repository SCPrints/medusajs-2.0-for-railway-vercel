import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"

export async function POST(
  req: MedusaRequest,
  res: MedusaResponse
) {
  // 1. "Catch" the data sent from the storefront
  const body = req.body

  // 2. Log it to the terminal so we can prove it arrived
  console.log("📬 NEW CONTACT MESSAGE RECEIVED!")
  console.log("Data:", body)

  // 3. Send a "Thumbs Up" back to the storefront so it shows the Success screen
  res.json({
    success: true,
    message: "Your message was successfully received by the backend!"
  })
}