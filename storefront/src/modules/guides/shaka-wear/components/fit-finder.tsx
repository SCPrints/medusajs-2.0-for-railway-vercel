"use client"

import Image from "next/image"
import { useState } from "react"

import LocalizedClientLink from "@modules/common/components/localized-client-link"
import {
  CUT_LABEL,
  FINISH_LABEL,
  SLEEVE_LABEL,
  type ShakaCut,
  type ShakaFinish,
  type ShakaSleeve,
  type ShakaStyle,
} from "@modules/guides/shaka-wear/styles"

export type FinderStyle = ShakaStyle & { image: string | null }

type Any<T> = T | "any"

const option = (active: boolean) =>
  `min-h-11 border px-4 text-xs font-bold uppercase tracking-[0.14em] transition ${
    active
      ? "border-white bg-white text-black"
      : "border-white/30 bg-transparent text-white hover:border-white"
  }`

function Group<T extends string>({
  legend,
  value,
  onChange,
  labels,
}: {
  legend: string
  value: Any<T>
  onChange: (v: Any<T>) => void
  labels: Record<T, string>
}) {
  const entries = [["any", "Any"], ...Object.entries(labels)] as [Any<T>, string][]
  return (
    <fieldset>
      <legend className="text-xs font-bold uppercase tracking-[0.14em] text-white/60">{legend}</legend>
      <div className="mt-2 flex flex-wrap gap-2">
        {entries.map(([key, label]) => (
          <button
            key={key}
            type="button"
            aria-pressed={value === key}
            onClick={() => onChange(key)}
            className={option(value === key)}
          >
            {label}
          </button>
        ))}
      </div>
    </fieldset>
  )
}

/** Three filters over the six cuts. Pure filtering — no prices, no stock. */
export default function FitFinder({
  styles,
  displayClassName,
}: {
  styles: FinderStyle[]
  displayClassName: string
}) {
  const [cut, setCut] = useState<Any<ShakaCut>>("any")
  const [finish, setFinish] = useState<Any<ShakaFinish>>("any")
  const [sleeve, setSleeve] = useState<Any<ShakaSleeve>>("any")

  const matches = styles.filter(
    (s) =>
      (cut === "any" || s.cut === cut) &&
      (finish === "any" || s.finish === finish) &&
      (sleeve === "any" || s.sleeve === sleeve)
  )

  return (
    <div className="grid gap-8 border border-white/20 p-6 small:grid-cols-[1fr_1.3fr] small:p-8">
      <div className="space-y-6">
        <Group legend="Cut" value={cut} onChange={setCut} labels={CUT_LABEL} />
        <Group legend="Finish" value={finish} onChange={setFinish} labels={FINISH_LABEL} />
        <Group legend="Sleeve" value={sleeve} onChange={setSleeve} labels={SLEEVE_LABEL} />
      </div>

      <div aria-live="polite">
        <p className="text-xs font-bold uppercase tracking-[0.14em] text-white/60">
          {matches.length} of {styles.length} match
        </p>
        {matches.length === 0 ? (
          <p className="mt-4 max-w-md text-white/70">
            Nothing in the range ticks all three. Set one of them back to Any.
          </p>
        ) : (
          <ul className="mt-4 grid gap-3 phone:grid-cols-2">
            {matches.map((s) => (
              <li key={s.handle}>
                <LocalizedClientLink
                  href={`/products/${s.handle}`}
                  className="group flex min-h-11 items-center gap-3 border border-white/20 p-2 !text-white transition hover:border-white"
                >
                  <span className="relative h-16 w-16 shrink-0 bg-white">
                    {s.image ? (
                      <Image src={s.image} alt="" fill sizes="64px" className="object-contain" />
                    ) : null}
                  </span>
                  <span>
                    <span className={`${displayClassName} block text-xl uppercase leading-none`}>{s.name}</span>
                    <span className="mt-1 block text-xs uppercase tracking-[0.12em] text-white/60">
                      {s.fitLabel}
                    </span>
                  </span>
                </LocalizedClientLink>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
