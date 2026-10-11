"use client"

import { Switch } from "@headlessui/react"

import { HUD_LABEL, HUD_SURFACE } from "../lib/style"

export type GraphVisibility = {
  root: boolean
  brand: boolean
  category: boolean
  type: boolean
  tag: boolean
  product: boolean
}

type Props = {
  value: GraphVisibility
  onChange: (next: GraphVisibility) => void
  className?: string
}

const ITEMS: Array<{ key: keyof GraphVisibility; label: string }> = [
  { key: "brand", label: "Planets · brands" },
  { key: "category", label: "Moons · categories" },
  { key: "type", label: "Beacons · types" },
  { key: "tag", label: "Stars · tags" },
  { key: "product", label: "Dust · products" },
]

/** Toggle switches that hide/show each node kind. 44 px rows for touch. */
export function GraphFilters({ value, onChange, className }: Props) {
  return (
    <div className={`${HUD_SURFACE} p-3 ${className ?? ""}`}>
      <p className={HUD_LABEL}>Show</p>
      <ul className="flex flex-col">
        {ITEMS.map((item) => (
          <li key={item.key} className="flex min-h-11 items-center justify-between gap-4">
            <span className="text-small-regular">{item.label}</span>
            <Switch
              checked={value[item.key]}
              onChange={() => onChange({ ...value, [item.key]: !value[item.key] })}
              className={`${
                value[item.key] ? "bg-[#45A29E]" : "bg-[#1F2833]"
              } relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border border-[#45A29E]/40 transition-colors duration-150 ease-in-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#66FCF1]`}
              aria-label={`Toggle ${item.label}`}
            >
              <span
                aria-hidden="true"
                className={`${
                  value[item.key] ? "translate-x-5" : "translate-x-0.5"
                } pointer-events-none inline-block h-5 w-5 translate-y-px transform rounded-full bg-[#C5C6C7] shadow transition duration-150 ease-in-out`}
              />
            </Switch>
          </li>
        ))}
      </ul>
    </div>
  )
}
