"use client"

import { useEffect, useMemo, useRef, useState } from "react"

import {
  addRosterMembers,
  deleteRosterMember,
  getOrganisationRoster,
  replaceRoster,
  updateRosterMember,
  type OrgRoster,
  type RosterMember,
} from "@lib/data/org-team"
import { normaliseSize } from "@lib/util/size-list"

import SizeListImport from "./size-list-import"

type Props = {
  orgId: string
  roster: OrgRoster
  /** Sizes the range's garments come in, per garment group (for the paste check). */
  knownSizes?: Record<string, string[]>
  /** Tells the page the list changed (the order form reads it too). */
  onChange?: (members: RosterMember[]) => void
}

type Draft = { name: string; unit: string; number: string; sizes: Record<string, string> }

const EMPTY: Draft = { name: "", unit: "", number: "", sizes: {} }

const toDraft = (m: RosterMember): Draft => ({
  name: m.name,
  unit: m.unit ?? "",
  number: m.number ?? "",
  sizes: { ...m.sizes },
})

const same = (a: Draft, b: Draft) => JSON.stringify(a) === JSON.stringify(b)

/** "medium" → "M", "xxl" → "2XL"; blanks dropped. */
const tidySizes = (sizes: Record<string, string>) =>
  Object.fromEntries(
    Object.entries(sizes)
      .map(([k, v]) => [k, normaliseSize(v)] as const)
      .filter(([, v]) => v)
  )

const cellInput =
  "w-full min-h-11 rounded-md border border-transparent bg-transparent px-2 text-base text-ui-fg-base hover:border-ui-border-base focus:border-ui-border-base focus:bg-white focus:outline-hidden focus-visible:ring-2 tablet:text-sm"

/**
 * "People": the organisation's roster as a table you just type in. A row
 * saves when you leave it; the blank row at the bottom adds a person (Enter
 * keeps you there for the next one). A whole list can be pasted in.
 */
export default function PeopleTab({ orgId, roster, knownSizes, onChange }: Props) {
  const groups = roster.garment_groups
  const canEdit = roster.can_edit
  const [members, setMembersState] = useState<RosterMember[]>(roster.members)
  const [drafts, setDrafts] = useState<Record<string, Draft>>({})
  const [fresh, setFresh] = useState<Draft>(EMPTY)
  const [search, setSearch] = useState("")
  const [unit, setUnit] = useState("")
  const [importing, setImporting] = useState(false)
  const [note, setNote] = useState<{ kind: "ok" | "err"; text: string } | null>(null)
  const newNameRef = useRef<HTMLInputElement>(null)

  // The tab remounts each time it is opened, with the page's (older) copy:
  // fetch the current list so an edit made a moment ago is still there.
  useEffect(() => {
    let live = true
    void getOrganisationRoster(orgId).then((r) => {
      if (live && r.garment_groups.length) setMembersState(r.members)
    })
    return () => {
      live = false
    }
  }, [orgId])

  const setMembers = (next: RosterMember[]) => {
    setMembersState(next)
    onChange?.(next)
  }

  const units = useMemo(
    () => Array.from(new Set(members.map((m) => m.unit).filter((u): u is string => !!u))).sort(),
    [members]
  )
  const shown = useMemo(() => {
    const q = search.trim().toLowerCase()
    return members.filter(
      (m) =>
        (!unit || m.unit === unit) &&
        (!q || [m.name, m.unit, m.number].some((v) => (v ?? "").toLowerCase().includes(q)))
    )
  }, [members, search, unit])

  const draftOf = (m: RosterMember) => drafts[m.id] ?? toDraft(m)
  const edit = (m: RosterMember, patch: Partial<Draft>) =>
    setDrafts((d) => ({ ...d, [m.id]: { ...draftOf(m), ...patch } }))

  async function saveRow(m: RosterMember) {
    const typed = drafts[m.id]
    if (!typed) return
    const draft = { ...typed, sizes: tidySizes(typed.sizes) }
    if (same(draft, toDraft(m)) || !draft.name.trim()) {
      setDrafts(({ [m.id]: _drop, ...rest }) => rest)
      return
    }
    const res = await updateRosterMember(orgId, m.id, { ...draft, notes: m.notes })
    if (res.ok && res.member) {
      const saved = res.member
      setMembers(members.map((x) => (x.id === m.id ? saved : x)))
      setDrafts(({ [m.id]: _done, ...rest }) => rest)
      setNote(null)
    } else if (!res.ok) setNote({ kind: "err", text: res.error })
  }

  async function addFresh() {
    if (!fresh.name.trim()) return
    const res = await addRosterMembers(orgId, [{ ...fresh, sizes: tidySizes(fresh.sizes) }])
    if (res.ok && res.members) {
      setMembers(res.members)
      setFresh({ ...EMPTY, unit: fresh.unit })
      setNote(null)
      newNameRef.current?.focus()
    } else if (!res.ok) setNote({ kind: "err", text: res.error })
  }

  async function remove(m: RosterMember) {
    if (!confirm(`Remove ${m.name} from your people?`)) return
    const res = await deleteRosterMember(orgId, m.id)
    if (res.ok) setMembers(members.filter((x) => x.id !== m.id))
    else setNote({ kind: "err", text: res.error })
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 tablet:flex-row tablet:items-end tablet:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-ui-fg-base">
            Our people <span className="text-ui-fg-muted">({members.length})</span>
          </h2>
          <p className="mt-1 text-sm text-ui-fg-subtle">
            Names and sizes in one place. Use them to fill an order in one click.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search"
            aria-label="Search people"
            className="min-h-11 w-full rounded-md border border-ui-border-base bg-white px-3 text-base phone:w-44 tablet:text-sm"
          />
          {units.length > 0 ? (
            <select
              value={unit}
              onChange={(e) => setUnit(e.target.value)}
              aria-label="Filter by unit or team"
              className="min-h-11 rounded-md border border-ui-border-base bg-white px-2 text-sm"
            >
              <option value="">All units / teams</option>
              {units.map((u) => (
                <option key={u} value={u}>
                  {u}
                </option>
              ))}
            </select>
          ) : null}
          {canEdit ? (
            <button
              type="button"
              onClick={() => setImporting((v) => !v)}
              className="inline-flex min-h-11 items-center justify-center rounded-full bg-brand px-5 text-sm font-semibold text-white transition"
            >
              Paste a list
            </button>
          ) : null}
        </div>
      </div>

      {importing && canEdit ? (
        <SizeListImport
          groups={groups}
          knownSizes={knownSizes}
          existingNames={members.map((m) => m.name)}
          onClose={() => setImporting(false)}
          actions={[
            {
              label: (n) => `Add ${n} ${n === 1 ? "person" : "people"}`,
              run: async (people) => {
                const res = await addRosterMembers(orgId, people)
                if (!res.ok) return res.error
                if (res.members) setMembers(res.members)
                setNote({ kind: "ok", text: `Added ${people.length} ${people.length === 1 ? "person" : "people"}.` })
                return null
              },
            },
            ...(members.length > 0
              ? [
                  {
                    label: () => "Replace our whole list with these",
                    primary: false,
                    everyone: true,
                    run: async (people: Parameters<typeof replaceRoster>[1]) => {
                      if (!confirm(`Replace all ${members.length} people with the ${people.length} pasted?`)) {
                        return "Nothing changed."
                      }
                      const res = await replaceRoster(orgId, people)
                      if (!res.ok) return res.error
                      if (res.members) setMembers(res.members)
                      setNote({ kind: "ok", text: "List replaced." })
                      return null
                    },
                  },
                ]
              : []),
          ]}
        />
      ) : null}

      {note ? (
        <p role="status" className={`text-sm ${note.kind === "ok" ? "text-emerald-700" : "text-rose-700"}`}>
          {note.text}
        </p>
      ) : null}

      <div className="-mx-4 overflow-x-auto border-y border-ui-border-base bg-white tablet:mx-0 tablet:rounded-2xl tablet:border">
        <table className="w-full min-w-max border-collapse text-left">
          <thead className="bg-ui-bg-subtle text-xs font-semibold uppercase tracking-[0.08em] text-ui-fg-subtle">
            <tr>
              <th className="sticky left-0 z-10 bg-ui-bg-subtle px-3 py-2">Name</th>
              <th className="px-3 py-2">Unit / team</th>
              <th className="px-3 py-2">No.</th>
              {groups.map((g) => (
                <th key={g.key} className="px-3 py-2">
                  {g.label}
                </th>
              ))}
              {canEdit ? <th className="px-1 py-2" aria-label="Remove" /> : null}
            </tr>
          </thead>
          <tbody>
            {shown.map((m) => {
              const d = draftOf(m)
              const save = () => void saveRow(m)
              return (
                <tr key={m.id} className="border-t border-ui-border-base">
                  <td className="sticky left-0 z-10 bg-white px-1 py-0.5">
                    <input
                      value={d.name}
                      onChange={(e) => edit(m, { name: e.target.value })}
                      onBlur={save}
                      aria-label="Name"
                      disabled={!canEdit}
                      className={`${cellInput} w-40 font-semibold tablet:w-52`}
                    />
                  </td>
                  <td className="px-1 py-0.5">
                    <input
                      value={d.unit}
                      onChange={(e) => edit(m, { unit: e.target.value })}
                      onBlur={save}
                      aria-label={`Unit or team for ${m.name}`}
                      disabled={!canEdit}
                      list="roster-units"
                      className={`${cellInput} w-36`}
                    />
                  </td>
                  <td className="px-1 py-0.5">
                    <input
                      value={d.number}
                      onChange={(e) => edit(m, { number: e.target.value })}
                      onBlur={save}
                      aria-label={`Number for ${m.name}`}
                      disabled={!canEdit}
                      inputMode="numeric"
                      className={`${cellInput} w-16`}
                    />
                  </td>
                  {groups.map((g) => (
                    <td key={g.key} className="px-1 py-0.5">
                      <input
                        value={d.sizes[g.key] ?? ""}
                        onChange={(e) => edit(m, { sizes: { ...d.sizes, [g.key]: e.target.value } })}
                        onBlur={save}
                        aria-label={`${g.label} size for ${m.name}`}
                        disabled={!canEdit}
                        className={`${cellInput} w-20 uppercase`}
                      />
                    </td>
                  ))}
                  {canEdit ? (
                    <td className="px-1 py-0.5">
                      <button
                        type="button"
                        onClick={() => remove(m)}
                        aria-label={`Remove ${m.name}`}
                        className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-md text-ui-fg-muted hover:bg-rose-50 hover:text-rose-700"
                      >
                        ✕
                      </button>
                    </td>
                  ) : null}
                </tr>
              )
            })}

            {canEdit ? (
              <tr
                className="border-t border-ui-border-base"
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault()
                    void addFresh()
                  }
                }}
              >
                <td className="sticky left-0 z-10 bg-white px-1 py-0.5">
                  <input
                    ref={newNameRef}
                    value={fresh.name}
                    onChange={(e) => setFresh({ ...fresh, name: e.target.value })}
                    placeholder="Add a person…"
                    aria-label="New person's name"
                    className={`${cellInput} w-40 border-ui-border-base bg-white font-semibold tablet:w-52`}
                  />
                </td>
                <td className="px-1 py-0.5">
                  <input
                    value={fresh.unit}
                    onChange={(e) => setFresh({ ...fresh, unit: e.target.value })}
                    placeholder="Unit / team"
                    aria-label="New person's unit or team"
                    list="roster-units"
                    className={`${cellInput} w-36 border-ui-border-base bg-white`}
                  />
                </td>
                <td className="px-1 py-0.5">
                  <input
                    value={fresh.number}
                    onChange={(e) => setFresh({ ...fresh, number: e.target.value })}
                    placeholder="No."
                    aria-label="New person's number"
                    inputMode="numeric"
                    className={`${cellInput} w-16 border-ui-border-base bg-white`}
                  />
                </td>
                {groups.map((g) => (
                  <td key={g.key} className="px-1 py-0.5">
                    <input
                      value={fresh.sizes[g.key] ?? ""}
                      onChange={(e) => setFresh({ ...fresh, sizes: { ...fresh.sizes, [g.key]: e.target.value } })}
                      placeholder="Size"
                      aria-label={`New person's ${g.label} size`}
                      className={`${cellInput} w-20 border-ui-border-base bg-white uppercase`}
                    />
                  </td>
                ))}
                <td className="px-1 py-0.5">
                  <button
                    type="button"
                    onClick={() => void addFresh()}
                    disabled={!fresh.name.trim()}
                    className="inline-flex min-h-11 items-center justify-center rounded-full bg-ink px-4 text-sm font-semibold text-white disabled:opacity-40"
                  >
                    Add
                  </button>
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
        <datalist id="roster-units">
          {units.map((u) => (
            <option key={u} value={u} />
          ))}
        </datalist>
      </div>

      {members.length === 0 ? (
        <p className="text-sm text-ui-fg-subtle">
          {canEdit
            ? "Nobody yet. Type a name in the first row, or paste your whole list."
            : "Nobody yet. An owner or purchaser can add your people."}
        </p>
      ) : shown.length === 0 ? (
        <p className="text-sm text-ui-fg-subtle">Nobody matches that search.</p>
      ) : null}
    </div>
  )
}
