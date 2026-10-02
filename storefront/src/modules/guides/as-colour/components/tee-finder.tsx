"use client"

import Image from "next/image"
import { useState } from "react"

import LocalizedClientLink from "@modules/common/components/localized-client-link"
import {
  CUT_LABEL,
  FIT_LABEL,
  WEIGHT_LABEL,
  type Cut,
  type Fit,
  type Weight,
} from "@modules/guides/as-colour/data"

export type FinderTee = {
  handle: string
  title: string
  gsm: number | null
  weight: Weight | null
  fit: Fit
  cut: Cut
  colours: number
  image: string | null
}

type Any<T> = T | "any"

const option = (active: boolean) =>
  `min-h-11 border px-4 text-sm transition ${
    active
      ? "border-[#1a1a1a] bg-[#1a1a1a] text-white"
      : "border-[#d9d9d4] bg-white text-[#1a1a1a] hover:border-[#1a1a1a]"
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
      <legend className="text-xs uppercase tracking-[0.14em] text-[#6b6b66]">{legend}</legend>
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

/** Filters the featured tees by cut, weight and fit. No prices, no stock. */
export default function TeeFinder({ tees }: { tees: FinderTee[] }) {
  const [cut, setCut] = useState<Any<Cut>>("any")
  const [weight, setWeight] = useState<Any<Weight>>("any")
  const [fit, setFit] = useState<Any<Fit>>("any")

  const matches = tees
    .filter(
      (t) =>
        (cut === "any" || t.cut === cut) &&
        (weight === "any" || t.weight === weight) &&
        (fit === "any" || t.fit === fit)
    )
    .sort((a, b) => b.colours - a.colours)

  return (
    <div className="grid gap-10 border border-[#e6e6e1] bg-white p-6 small:grid-cols-[1fr_1.5fr] small:p-10">
      <div className="space-y-6">
        <Group legend="Cut" value={cut} onChange={setCut} labels={CUT_LABEL} />
        <Group legend="Weight" value={weight} onChange={setWeight} labels={WEIGHT_LABEL} />
        <Group legend="Fit" value={fit} onChange={setFit} labels={FIT_LABEL} />
      </div>

      <div aria-live="polite">
        <p className="text-xs uppercase tracking-[0.14em] text-[#6b6b66]">
          {matches.length} of {tees.length} tees
        </p>
        {matches.length === 0 ? (
          <p className="mt-4 max-w-md text-[#6b6b66]">
            No tee in this selection has all three. Set one of them back to Any.
          </p>
        ) : (
          <ul className="mt-4 grid gap-x-6 gap-y-1 phone:grid-cols-2">
            {matches.map((t) => (
              <li key={t.handle}>
                <LocalizedClientLink
                  href={`/products/${t.handle}`}
                  className="group flex min-h-11 items-center gap-4 border-b border-[#e6e6e1] py-3 !text-[#1a1a1a]"
                >
                  <span className="relative h-16 w-14 shrink-0 bg-[#f4f3f0]">
                    {t.image ? (
                      <Image src={t.image} alt="" fill sizes="56px" className="object-contain" />
                    ) : null}
                  </span>
                  <span className="min-w-0">
                    <span className="block text-base font-medium group-hover:underline group-hover:underline-offset-4">
                      {t.title}
                    </span>
                    <span className="mt-0.5 block text-sm text-[#6b6b66]">
                      {[t.gsm ? `${t.gsm} GSM` : null, FIT_LABEL[t.fit], `${t.colours} colours`]
                        .filter(Boolean)
                        .join(" · ")}
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
