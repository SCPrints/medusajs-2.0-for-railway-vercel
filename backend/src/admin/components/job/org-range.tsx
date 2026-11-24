import { Badge, Button, Container, Heading, Text, toast } from "@medusajs/ui"
import { useCallback, useEffect, useState } from "react"

import { AppLink } from "../../lib/nav"

type RangeState = {
  customer_id: string | null
  organisations: Array<{ id: string; name: string }>
  organisation_id: string | null
  groups: Array<{ group_key: string; title: string; thumbnail: string | null; design_id: string | null }>
}

/**
 * "Organisation range" on the job window: put this job's designs (approved
 * artwork) into the customer's organisation range so their colleagues can
 * order them again, and file the order under that organisation. Hidden on
 * jobs with no Studio designs.
 */
export function OrgRangePanel({ orderId }: { orderId: string }) {
  const url = `/admin/orders/${orderId}/organisation-range`
  const [state, setState] = useState<RangeState | null>(null)
  const [orgId, setOrgId] = useState("")
  const [busy, setBusy] = useState(false)

  const load = useCallback(() => {
    fetch(url, { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((s: RangeState | null) => {
        setState(s)
        if (s) setOrgId(s.organisation_id ?? s.organisations[0]?.id ?? "")
      })
      .catch(() => setState(null))
  }, [url])
  useEffect(load, [load])

  if (!state || state.groups.length === 0) return null
  const missing = state.groups.filter((g) => !g.design_id).length
  const taggedName = state.organisations.find((o) => o.id === state.organisation_id)?.name

  const add = async () => {
    if (!orgId) return
    setBusy(true)
    try {
      const res = await fetch(url, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ organisation_id: orgId }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(body?.message ?? body?.error ?? "Couldn't add to the range.")
      toast.success(body.added ? `Added ${body.added} design${body.added === 1 ? "" : "s"} to the range` : "Already in the range")
      setState(body)
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Container className="flex flex-col gap-y-3 p-0">
      <div className="flex flex-wrap items-center gap-2 px-6 pt-4">
        <Heading level="h2">Organisation range</Heading>
        {taggedName ? <Badge color="blue">Order for {taggedName}</Badge> : null}
      </div>
      <div className="flex flex-col gap-y-3 px-6 pb-4">
        {state.organisations.length === 0 ? (
          <Text size="small" className="text-ui-fg-subtle">
            This customer isn't in an organisation. Add them on{" "}
            <AppLink href="/app/organisations" className="text-ui-fg-interactive">Organisations</AppLink> so their
            colleagues can order these designs again.
          </Text>
        ) : (
          <>
            <Text size="small" className="text-ui-fg-subtle">
              Puts these designs (with the approved artwork) in the organisation's "Our range", so every owner or
              purchaser can order them again, and lists this order in the organisation's order history.
            </Text>
            <ul className="flex flex-col gap-y-2">
              {state.groups.map((g) => (
                <li key={g.group_key} className="flex items-center gap-x-3">
                  {g.thumbnail ? (
                    <img src={g.thumbnail} alt="" className="h-10 w-10 rounded border border-ui-border-base object-contain" />
                  ) : (
                    <div className="h-10 w-10 rounded border border-ui-border-base" />
                  )}
                  <Text size="small" className="flex-1">{g.title}</Text>
                  {g.design_id ? <Badge color="green">In range</Badge> : null}
                </li>
              ))}
            </ul>
            <div className="flex flex-wrap items-center gap-2">
              {state.organisations.length > 1 && !state.organisation_id ? (
                <select
                  className="h-8 rounded-md border border-ui-border-base bg-ui-bg-field px-2 text-sm"
                  value={orgId}
                  onChange={(e) => setOrgId(e.target.value)}
                >
                  {state.organisations.map((o) => (
                    <option key={o.id} value={o.id}>{o.name}</option>
                  ))}
                </select>
              ) : null}
              <Button size="small" variant="secondary" isLoading={busy} disabled={!orgId || (missing === 0 && !!state.organisation_id)} onClick={add}>
                {missing === 0
                  ? state.organisation_id
                    ? "All in the range"
                    : "File under organisation"
                  : `Add ${missing} design${missing === 1 ? "" : "s"} to ${
                      state.organisations.find((o) => o.id === orgId)?.name ?? "range"
                    }`}
              </Button>
            </div>
          </>
        )}
      </div>
    </Container>
  )
}
