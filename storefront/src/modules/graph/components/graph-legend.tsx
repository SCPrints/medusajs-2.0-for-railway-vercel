"use client"

import { HUD_LABEL, HUD_SURFACE, NODE_STYLE, SPACE } from "../lib/style"

const ITEMS: Array<{ kind: keyof typeof NODE_STYLE; label: string; hint: string }> = [
  { kind: "root", label: "Sun", hint: "the whole catalog" },
  { kind: "brand", label: "Planet", hint: "brand" },
  { kind: "category", label: "Moon", hint: "category" },
  { kind: "type", label: "Beacon", hint: "product type" },
  { kind: "tag", label: "Star", hint: "tag" },
  { kind: "product", label: "Dust", hint: "product" },
]

export function GraphLegend({ className }: { className?: string }) {
  return (
    <div className={`${HUD_SURFACE} p-3 ${className ?? ""}`}>
      <p className={`mb-2 ${HUD_LABEL}`}>Legend</p>
      <ul className="flex flex-col gap-2">
        {ITEMS.map((item) => {
          const style = NODE_STYLE[item.kind]
          return (
            <li key={item.kind} className="flex items-center gap-2">
              <span
                aria-hidden
                className={`inline-block h-3 w-3 border ${item.kind === "type" ? "rotate-45" : "rounded-full"}`}
                style={{
                  backgroundColor: style.fill,
                  borderColor: item.kind === "root" ? SPACE.gold : style.stroke,
                  boxShadow: item.kind === "root" || item.kind === "brand" ? `0 0 8px ${item.kind === "root" ? SPACE.gold : SPACE.teal}` : undefined,
                }}
              />
              <span className="text-small-regular">
                {item.label} <span className="!text-[#C5C6C7]/60">· {item.hint}</span>
              </span>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
