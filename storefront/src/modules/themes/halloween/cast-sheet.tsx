"use client"

import { HalloweenMascot, MASCOTS, MASCOT_NAMES } from "./mascot"

/** Review sheet: every mascot at 240px with its name and personality note. */
export default function HalloweenCastSheet() {
  return (
    <ul className="grid list-none grid-cols-1 gap-8 p-0 phone:grid-cols-2 small:grid-cols-3">
      {MASCOT_NAMES.map((name) => {
        const m = MASCOTS[name]
        const dark = name === "cobweb"
        return (
          <li key={name} className="flex flex-col gap-3" data-testid={`mascot-${name}`}>
            <div
              className={`flex aspect-square items-center justify-center rounded-xl border border-ui-border-base ${dark ? "bg-[#2d1b4e]" : "bg-[#eeeeee]"}`}
            >
              <HalloweenMascot name={name} size={240} decorative={false} />
            </div>
            <div>
              <p className="text-sm font-semibold text-ui-fg-base">
                {m.label} <code className="ml-1 text-xs font-normal text-ui-fg-muted">{name}</code>
              </p>
              <p className="mt-1 text-sm text-ui-fg-subtle">{m.note}</p>
            </div>
          </li>
        )
      })}
    </ul>
  )
}
