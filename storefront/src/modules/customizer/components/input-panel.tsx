"use client"

import { CLIPART_LIBRARY } from "@modules/customizer/lib/clipart"
import { ChangeEvent, useState } from "react"

type InputPanelProps = {
  onUploadFile: (file: File) => Promise<void>
  onAddText: (input: { text: string; color: string; fontFamily: string; letterSpacing: number }) => void
  onAddCurvedText: (input: { text: string; color: string; radius: number }) => void
  onAddClipart: (svg: string) => void
  onAddShape: (shape: "rect" | "circle" | "triangle") => void
  onRunBackgroundRemoval: () => Promise<void>
  isRemovingBackground: boolean
}

export default function InputPanel({
  onUploadFile,
  onAddText,
  onAddCurvedText,
  onAddClipart,
  onAddShape,
  onRunBackgroundRemoval,
  isRemovingBackground,
}: InputPanelProps) {
  const [text, setText] = useState("Your Brand")
  const [fontFamily, setFontFamily] = useState("Arial")
  const [color, setColor] = useState("#111827")
  const [letterSpacing, setLetterSpacing] = useState(0)
  const [arcRadius, setArcRadius] = useState(120)

  const onFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) {
      return
    }

    await onUploadFile(file)
    event.target.value = ""
  }

  return (
    <div className="space-y-4 rounded-xl border border-ui-border-base bg-ui-bg-base p-4">
      <div>
        <h3 className="text-sm font-semibold text-ui-fg-base">Input Tools</h3>
        <p className="mt-1 text-xs text-ui-fg-subtle">Upload assets, add text, and insert clipart.</p>
      </div>

      <div className="space-y-2">
        <label className="text-xs font-medium text-ui-fg-subtle">Image uploader (PNG/JPG/SVG)</label>
        <input type="file" accept="image/png,image/jpeg,image/svg+xml" onChange={onFileChange} className="w-full text-sm" />
      </div>

      <button
        type="button"
        className="w-full rounded-md border border-ui-border-base px-3 py-2 text-sm hover:bg-ui-bg-subtle disabled:opacity-60"
        onClick={onRunBackgroundRemoval}
        disabled={isRemovingBackground}
      >
        {isRemovingBackground ? "Removing background..." : "Remove Background (API)"}
      </button>

      <div className="space-y-2">
        <label className="text-xs font-medium text-ui-fg-subtle">Text</label>
        <input
          value={text}
          onChange={(event) => setText(event.target.value)}
          className="w-full rounded-md border border-ui-border-base px-3 py-2 text-sm"
        />
        <div className="grid grid-cols-2 gap-2">
          <input
            value={fontFamily}
            onChange={(event) => setFontFamily(event.target.value)}
            className="rounded-md border border-ui-border-base px-3 py-2 text-sm"
            placeholder="Font family"
          />
          <input type="color" value={color} onChange={(event) => setColor(event.target.value)} className="h-10 w-full rounded-md border border-ui-border-base" />
        </div>
        <label className="text-xs text-ui-fg-subtle">Letter spacing: {letterSpacing}</label>
        <input
          type="range"
          min={-100}
          max={500}
          step={5}
          value={letterSpacing}
          onChange={(event) => setLetterSpacing(Number(event.target.value))}
          className="w-full"
        />
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            className="rounded-md border border-ui-border-base px-3 py-2 text-sm hover:bg-ui-bg-subtle"
            onClick={() => onAddText({ text, color, fontFamily, letterSpacing })}
          >
            Add Text
          </button>
          <button
            type="button"
            className="rounded-md border border-ui-border-base px-3 py-2 text-sm hover:bg-ui-bg-subtle"
            onClick={() => onAddCurvedText({ text, color, radius: arcRadius })}
          >
            Add Curved Text
          </button>
        </div>
        <label className="text-xs text-ui-fg-subtle">Curve radius: {arcRadius}</label>
        <input
          type="range"
          min={50}
          max={220}
          step={5}
          value={arcRadius}
          onChange={(event) => setArcRadius(Number(event.target.value))}
          className="w-full"
        />
      </div>

      <div className="space-y-2">
        <label className="text-xs font-medium text-ui-fg-subtle">Clipart library</label>
        <div className="grid grid-cols-2 gap-2">
          {CLIPART_LIBRARY.map((clip) => (
            <button
              key={clip.id}
              type="button"
              onClick={() => onAddClipart(clip.svg)}
              className="rounded-md border border-ui-border-base px-2 py-2 text-xs hover:bg-ui-bg-subtle"
            >
              {clip.name}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        <label className="text-xs font-medium text-ui-fg-subtle">Shapes</label>
        <div className="grid grid-cols-3 gap-2">
          <button type="button" onClick={() => onAddShape("rect")} className="rounded-md border border-ui-border-base px-2 py-2 text-xs hover:bg-ui-bg-subtle">
            Rect
          </button>
          <button type="button" onClick={() => onAddShape("circle")} className="rounded-md border border-ui-border-base px-2 py-2 text-xs hover:bg-ui-bg-subtle">
            Circle
          </button>
          <button type="button" onClick={() => onAddShape("triangle")} className="rounded-md border border-ui-border-base px-2 py-2 text-xs hover:bg-ui-bg-subtle">
            Triangle
          </button>
        </div>
      </div>
    </div>
  )
}
