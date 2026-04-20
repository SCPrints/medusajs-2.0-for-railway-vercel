"use client"

import { ChangeEvent, useState } from "react"

type InputPanelProps = {
  onUploadFile: (file: File) => Promise<void>
  onAddText: (input: { text: string; color: string; fontFamily: string; letterSpacing: number }) => void
  onAddCurvedText: (input: { text: string; color: string; radius: number }) => void
  onRemoveSelectedImage: () => void
  canRemoveImage: boolean
  className?: string
}

export default function InputPanel({
  onUploadFile,
  onAddText,
  onAddCurvedText,
  onRemoveSelectedImage,
  canRemoveImage,
  className,
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
    <div
      className={`space-y-4 rounded-xl border border-ui-border-base bg-ui-bg-base p-4 ${className ?? ""}`}
    >
      <div>
        <h3 className="text-sm font-semibold text-ui-fg-base">Add to design</h3>
        <p className="mt-1 text-xs text-ui-fg-subtle">Upload art and text.</p>
      </div>

      <div className="space-y-2">
        <label className="text-xs font-medium text-ui-fg-subtle">Image uploader (PNG/JPG/SVG)</label>
        <input type="file" accept="image/png,image/jpeg,image/svg+xml" onChange={onFileChange} className="w-full text-sm" />
      </div>

      <button
        type="button"
        className="w-full rounded-md border border-rose-200 bg-rose-50/80 px-3 py-2 text-sm text-rose-900 hover:bg-rose-100 disabled:opacity-50"
        onClick={onRemoveSelectedImage}
        disabled={!canRemoveImage}
        title={canRemoveImage ? "Remove selected image from the canvas" : "Select an image layer first"}
      >
        Remove image
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
    </div>
  )
}
