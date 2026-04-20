"use client"

type LayerItem = {
  id: string
  label: string
  visible: boolean
  locked: boolean
  /** Fabric object `type` (e.g. `image`, `i-text`). */
  type?: string
}

type ManagementPanelProps = {
  layers: LayerItem[]
  selectedLayerId: string | null
  onSelectLayer: (id: string) => void
  onDeleteLayer: () => void
  onBringForward: () => void
  onSendBackward: () => void
  onToggleLayerVisibility: (id: string) => void
  onToggleLayerLock: (id: string) => void
  onAlign: (mode: "centerX" | "centerY" | "top" | "middle" | "bottom") => void
  onReplaceSvgColor: (nextColor: string) => void
}

export default function ManagementPanel({
  layers,
  selectedLayerId,
  onSelectLayer,
  onDeleteLayer,
  onBringForward,
  onSendBackward,
  onToggleLayerVisibility,
  onToggleLayerLock,
  onAlign,
  onReplaceSvgColor,
}: ManagementPanelProps) {
  return (
    <div className="space-y-4 rounded-xl border border-ui-border-base bg-ui-bg-base p-4">
      <div>
        <h3 className="text-sm font-semibold uppercase tracking-wide text-ui-fg-base">Layers & alignment</h3>
        <p className="mt-1 text-xs text-ui-fg-subtle">Align, reorder, and edit the selected layer.</p>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <button type="button" className="rounded-md border border-ui-border-base px-2 py-1.5 text-xs hover:bg-ui-bg-subtle" onClick={() => onAlign("centerX")}>
          Center H
        </button>
        <button type="button" className="rounded-md border border-ui-border-base px-2 py-1.5 text-xs hover:bg-ui-bg-subtle" onClick={() => onAlign("centerY")}>
          Center V
        </button>
        <button type="button" className="rounded-md border border-ui-border-base px-2 py-1.5 text-xs hover:bg-ui-bg-subtle" onClick={() => onAlign("top")}>
          Align Top
        </button>
        <button type="button" className="rounded-md border border-ui-border-base px-2 py-1.5 text-xs hover:bg-ui-bg-subtle" onClick={() => onAlign("middle")}>
          Align Middle
        </button>
        <button type="button" className="rounded-md border border-ui-border-base px-2 py-1.5 text-xs hover:bg-ui-bg-subtle" onClick={() => onAlign("bottom")}>
          Align Bottom
        </button>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <button type="button" className="rounded-md border border-ui-border-base px-2 py-1.5 text-xs hover:bg-ui-bg-subtle" onClick={onBringForward}>
          Bring Forward
        </button>
        <button type="button" className="rounded-md border border-ui-border-base px-2 py-1.5 text-xs hover:bg-ui-bg-subtle" onClick={onSendBackward}>
          Send Backward
        </button>
        <button type="button" className="rounded-md border border-rose-300 px-2 py-1.5 text-xs text-rose-700 hover:bg-rose-50" onClick={onDeleteLayer}>
          Delete
        </button>
      </div>

      <div className="space-y-2">
        <label className="text-xs font-medium text-ui-fg-subtle">SVG color replacement</label>
        <input
          type="color"
          defaultValue="#111827"
          onChange={(event) => onReplaceSvgColor(event.target.value)}
          className="h-10 w-full rounded-md border border-ui-border-base"
        />
      </div>

      <div className="space-y-2">
        <label className="text-xs font-medium text-ui-fg-subtle">Layers</label>
        <div className="max-h-56 space-y-2 overflow-auto rounded-md border border-ui-border-base p-2">
          {layers.length ? (
            layers.map((layer) => (
              <div
                key={layer.id}
                className={`flex items-center gap-2 rounded-md border px-2 py-1.5 ${
                  selectedLayerId === layer.id ? "border-ui-fg-base" : "border-ui-border-base"
                }`}
              >
                <button type="button" className="flex-1 text-left text-xs" onClick={() => onSelectLayer(layer.id)}>
                  {layer.label}
                </button>
                <button type="button" className="text-xs text-ui-fg-subtle" onClick={() => onToggleLayerVisibility(layer.id)}>
                  {layer.visible ? "Hide" : "Show"}
                </button>
                <button type="button" className="text-xs text-ui-fg-subtle" onClick={() => onToggleLayerLock(layer.id)}>
                  {layer.locked ? "Unlock" : "Lock"}
                </button>
              </div>
            ))
          ) : (
            <p className="text-xs text-ui-fg-subtle">No layers yet.</p>
          )}
        </div>
      </div>
    </div>
  )
}
