import { NextRequest, NextResponse } from "next/server"

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as { dataUrl?: string }
    const dataUrl = body?.dataUrl

    if (!dataUrl || typeof dataUrl !== "string") {
      return NextResponse.json({ message: "Missing image data." }, { status: 400 })
    }

    const removeBgApiKey = process.env.REMOVE_BG_API_KEY

    // Fallback behavior keeps the workflow functional if no provider key is configured.
    if (!removeBgApiKey) {
      return NextResponse.json(
        { message: "Background removal is not configured for this environment." },
        { status: 503 }
      )
    }

    const [, base64] = dataUrl.split(",", 2)
    if (!base64) {
      return NextResponse.json({ message: "Invalid image data URL." }, { status: 400 })
    }

    const formData = new FormData()
    formData.append("size", "auto")
    formData.append("image_file_b64", base64)

    const response = await fetch("https://api.remove.bg/v1.0/removebg", {
      method: "POST",
      headers: {
        "X-Api-Key": removeBgApiKey,
      },
      body: formData,
      cache: "no-store",
    })

    if (!response.ok) {
      const errorText = await response.text()
      return NextResponse.json(
        { message: `remove.bg failed: ${errorText || response.statusText}` },
        { status: response.status }
      )
    }

    const arrayBuffer = await response.arrayBuffer()
    const nextDataUrl = `data:image/png;base64,${Buffer.from(arrayBuffer).toString("base64")}`
    return NextResponse.json({ dataUrl: nextDataUrl })
  } catch (error) {
    console.error("Background removal proxy failed", error)
    return NextResponse.json({ message: "Background removal service unavailable." }, { status: 500 })
  }
}
