"use client"

import { useMemo, useState } from "react"

import {
  parseSizeList,
  type SizeListColumn,
  type SizeListPerson,
  type SizeListResult,
} from "@lib/util/size-list"

type Action = {
  label: (count: number) => string
  run: (people: SizeListPerson[], result: SizeListResult) => Promise<string | null> | string | null
  primary?: boolean
  /** Gets every named row, even names already on the list (e.g. "replace the list"). */
  everyone?: boolean
}

type Props = {
  groups: Array<{ key: string; label: string }>
  /** Sizes the garments come in, per group — anything else is flagged. */
  knownSizes?: Record<string, string[]>
  existingNames?: string[]
  actions: Action[]
  onClose?: () => void
}

const MAX_FILE_BYTES = 2 * 1024 * 1024

/**
 * Paste a size list from a spreadsheet, or drop a CSV file. Shows what we
 * understood (each column can be corrected) with problems highlighted, and
 * saves nothing until the buyer presses a button.
 */
export default function SizeListImport({ groups, knownSizes, existingNames, actions, onClose }: Props) {
  const [text, setText] = useState("")
  const [columns, setColumns] = useState<Array<SizeListColumn | null> | undefined>()
  const [skipDuplicates, setSkipDuplicates] = useState(true)
  const [dragging, setDragging] = useState(false)
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState<{ kind: "ok" | "err"; text: string } | null>(null)

  const result = useMemo(
    () => (text.trim() ? parseSizeList(text, { knownSizes, existingNames, columns }) : null),
    [text, knownSizes, existingNames, columns]
  )

  const columnChoices: Array<{ value: string; label: string }> = [
    { value: "", label: "Ignore" },
    { value: "name", label: "Name" },
    { value: "first_name", label: "First name" },
    { value: "last_name", label: "Last name" },
    { value: "unit", label: "Unit / team" },
    { value: "number", label: "Number" },
    { value: "size", label: "Size" },
    ...groups.map((g) => ({ value: `size:${g.key}`, label: `${g.label} size` })),
    { value: "notes", label: "Notes" },
  ]

  const usable = (result?.rows ?? []).filter(
    (r) => r.name && !(skipDuplicates && r.problems.includes("Name already on the list"))
  )

  function load(value: string) {
    setColumns(undefined)
    setNote(null)
    setText(value)
  }

  async function readFile(file: File | undefined) {
    if (!file) return
    if (/\.(xlsx?|numbers|ods)$/i.test(file.name)) {
      setNote({
        kind: "err",
        text: "We can't open Excel files here yet. Select the cells in your spreadsheet, copy, and paste them in this box (or save the sheet as CSV).",
      })
      return
    }
    if (file.size > MAX_FILE_BYTES) {
      setNote({ kind: "err", text: "That file is too big. A size list should be well under 2 MB." })
      return
    }
    load(await file.text())
  }

  async function run(action: Action) {
    const rows = action.everyone ? (result?.rows ?? []).filter((r) => r.name) : usable
    if (!result || rows.length === 0) return
    setBusy(true)
    setNote(null)
    try {
      const people = rows.map(({ line: _l, cells: _c, problems: _p, ...person }) => person)
      const error = await action.run(people, result)
      if (error) setNote({ kind: "err", text: error })
      else {
        setText("")
        setColumns(undefined)
        onClose?.()
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="rounded-2xl border border-ui-border-base bg-white p-4 tablet:p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-ui-fg-base">Paste or drop a size list</h3>
          <p className="mt-1 text-xs text-ui-fg-muted">
            Copy the names and sizes from your spreadsheet and paste them here, or drop a CSV file. Columns can be in
            any order.
          </p>
        </div>
        {onClose ? (
          <button
            type="button"
            onClick={onClose}
            className="inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-md text-sm text-ui-fg-subtle hover:bg-ui-bg-subtle"
            aria-label="Close size list"
          >
            ✕
          </button>
        ) : null}
      </div>

      <div
        onDragOver={(e) => {
          e.preventDefault()
          setDragging(true)
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault()
          setDragging(false)
          void readFile(e.dataTransfer.files?.[0])
        }}
        className={`mt-3 rounded-xl border-2 border-dashed p-2 transition ${
          dragging ? "border-brand bg-[var(--brand-secondary)]/5" : "border-ui-border-base"
        }`}
      >
        <textarea
          value={text}
          onChange={(e) => load(e.target.value)}
          rows={result ? 3 : 5}
          spellCheck={false}
          placeholder={"Name\tTeam\tSize\nJo Steele\tUnder 12s\tM\nAl Brown\tUnder 12s\tL"}
          aria-label="Size list"
          className="w-full resize-y rounded-lg border-0 bg-transparent p-2 font-mono text-base focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-secondary)]/40 tablet:text-sm"
        />
        <label className="inline-flex min-h-11 cursor-pointer items-center px-2 text-xs font-semibold text-ui-fg-interactive underline">
          or choose a CSV file
          <input
            type="file"
            accept=".csv,.tsv,.txt,text/csv,text/plain"
            className="sr-only"
            onChange={(e) => {
              void readFile(e.target.files?.[0])
              e.target.value = ""
            }}
          />
        </label>
      </div>

      {note ? (
        <p role="status" className={`mt-3 text-sm ${note.kind === "ok" ? "text-emerald-700" : "text-rose-700"}`}>
          {note.text}
        </p>
      ) : null}

      {result && result.rows.length > 0 ? (
        <div className="mt-4">
          <p className="text-sm text-ui-fg-base" aria-live="polite">
            <span className="font-semibold">
              {result.rows.length} {result.rows.length === 1 ? "person" : "people"}
            </span>
            {result.problemCount > 0 ? (
              <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-900">
                {result.problemCount} to check
              </span>
            ) : (
              <span className="ml-2 text-emerald-700">All good</span>
            )}
          </p>

          <div className="mt-2 max-h-80 overflow-auto rounded-xl border border-ui-border-base">
            <table className="w-full min-w-max border-collapse text-left text-sm">
              <thead className="sticky top-0 z-10 bg-ui-bg-subtle">
                <tr>
                  {result.columns.map((col, i) => (
                    <th key={i} className="px-2 py-1.5">
                      <select
                        value={col ?? ""}
                        aria-label={`Column ${i + 1} is`}
                        onChange={(e) => {
                          const next = [...result.columns]
                          next[i] = (e.target.value || null) as SizeListColumn | null
                          setColumns(next)
                        }}
                        className="min-h-11 rounded-md border border-ui-border-base bg-white px-2 text-xs font-semibold"
                      >
                        {columnChoices.map((c) => (
                          <option key={c.value} value={c.value}>
                            {c.label}
                          </option>
                        ))}
                      </select>
                    </th>
                  ))}
                  <th className="px-2 py-1.5 text-xs font-semibold text-ui-fg-subtle">Check</th>
                </tr>
              </thead>
              <tbody>
                {result.rows.map((row) => {
                  const cells = result.columns.map((_, i) => row.cells[i] ?? "")
                  const bad = row.problems.length > 0
                  return (
                    <tr key={row.line} className={`border-t border-ui-border-base ${bad ? "bg-amber-50" : ""}`}>
                      {cells.map((cell, i) => (
                        <td key={i} className="px-2 py-1.5 text-ui-fg-base">
                          {cell || <span className="text-ui-fg-muted">—</span>}
                        </td>
                      ))}
                      <td className="px-2 py-1.5 text-xs font-semibold text-amber-900">{row.problems.join(" · ")}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {result.rows.some((r) => r.problems.includes("Name already on the list")) ? (
            <label className="mt-3 flex min-h-11 items-center gap-2 text-sm text-ui-fg-base">
              <input
                type="checkbox"
                checked={skipDuplicates}
                onChange={(e) => setSkipDuplicates(e.target.checked)}
                className="h-5 w-5"
              />
              Leave out names that are already on the list
            </label>
          ) : null}

          <div className="mt-3 flex flex-wrap items-center gap-2">
            {actions.map((a, i) => (
              <button
                key={i}
                type="button"
                disabled={busy || usable.length === 0}
                onClick={() => run(a)}
                className={`inline-flex min-h-11 items-center justify-center rounded-full px-5 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${
                  a.primary === false
                    ? "border border-ui-border-base text-ui-fg-base hover:bg-ui-bg-subtle"
                    : "bg-brand text-white hover:bg-[var(--brand-secondary)]/90"
                }`}
              >
                {a.label(usable.length)}
              </button>
            ))}
            <button
              type="button"
              onClick={() => load("")}
              className="inline-flex min-h-11 items-center px-3 text-sm text-ui-fg-subtle underline"
            >
              Clear
            </button>
          </div>
          <p className="mt-2 text-xs text-ui-fg-muted">
            Rows marked “to check” are still added. Rows with no name are left out.
          </p>
        </div>
      ) : null}
    </section>
  )
}
