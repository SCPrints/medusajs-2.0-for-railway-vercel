import { defineRouteConfig } from "@medusajs/admin-sdk"
import { BuildingStorefront } from "@medusajs/icons"
import { Badge, Button, Container, Heading, Table, Text, toast } from "@medusajs/ui"
import { useEffect, useState } from "react"
import { useSearchParams } from "react-router-dom"

import { TEAM_STORE_STATUS_LABEL, type TeamStoreStatus } from "../../../lib/team-store"
import { AppLink, useGo } from "../../lib/nav"
import { api, StoreForm, type StoreDraft } from "../../components/team-stores/shared"

type Row = {
  id: string
  title: string
  handle: string
  status: TeamStoreStatus
  closes_at: string
  organisation_name: string | null
  item_count: number
  url: string
}

/**
 * Team stores (Docs/TEAM_STORES_SPEC.md): branded pre-order stores for clubs,
 * schools and companies. Each buyer pays for their own items; the store's
 * orders print as one run when it closes.
 */
const TeamStoresPage = () => {
  const [params] = useSearchParams()
  const go = useGo()
  const [rows, setRows] = useState<Row[] | null>(null)
  const [creating, setCreating] = useState(false)

  // The run job's "Run production" action lands here with ?quote=<run quote id>.
  const quote = params.get("quote")
  useEffect(() => {
    api<{ team_stores: Row[] }>(`/admin/team-stores${quote ? `?quote=${encodeURIComponent(quote)}` : ""}`)
      .then((r) => {
        if (quote && r.team_stores[0]) return go(`/app/team-stores/${r.team_stores[0].id}`)
        setRows(r.team_stores)
      })
      .catch((e) => toast.error(e.message))
  }, [quote])

  const create = async (draft: StoreDraft) => {
    const r = await api<{ store: { id: string } }>("/admin/team-stores", { method: "POST", body: draft })
    go(`/app/team-stores/${r.store.id}`)
  }

  return (
    <Container className="flex flex-col gap-4 p-6">
      <div className="flex items-center justify-between">
        <div>
          <Heading level="h1">Team stores</Heading>
          <Text size="small" className="text-ui-fg-muted">
            A private store link for a club, school or company. Buyers pay for their own items; it prints as one run when it closes.
          </Text>
        </div>
        <Button variant="secondary" onClick={() => setCreating((v) => !v)}>
          {creating ? "Cancel" : "New store"}
        </Button>
      </div>

      {creating ? <StoreForm submitLabel="Create store" onSubmit={create} /> : null}

      {rows === null ? (
        <Text size="small">Loading…</Text>
      ) : rows.length === 0 ? (
        <Text size="small" className="text-ui-fg-muted">No team stores yet.</Text>
      ) : (
        <Table>
          <Table.Header>
            <Table.Row>
              <Table.HeaderCell>Store</Table.HeaderCell>
              <Table.HeaderCell>Organisation</Table.HeaderCell>
              <Table.HeaderCell>Status</Table.HeaderCell>
              <Table.HeaderCell>Closes</Table.HeaderCell>
              <Table.HeaderCell>Items</Table.HeaderCell>
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {rows.map((s) => (
              <Table.Row key={s.id}>
                <Table.Cell>
                  <AppLink href={`/app/team-stores/${s.id}`} className="text-ui-fg-interactive">
                    {s.title}
                  </AppLink>
                </Table.Cell>
                <Table.Cell>{s.organisation_name ?? "—"}</Table.Cell>
                <Table.Cell>
                  <Badge size="2xsmall" color={s.status === "open" ? "green" : s.status === "cancelled" ? "grey" : "blue"}>
                    {TEAM_STORE_STATUS_LABEL[s.status]}
                  </Badge>
                </Table.Cell>
                <Table.Cell>{new Date(s.closes_at).toLocaleString("en-AU", { dateStyle: "medium", timeStyle: "short" })}</Table.Cell>
                <Table.Cell>{s.item_count}</Table.Cell>
              </Table.Row>
            ))}
          </Table.Body>
        </Table>
      )}
    </Container>
  )
}

export const config = defineRouteConfig({
  label: "Team stores",
  icon: BuildingStorefront,
  nested: "/customers",
  rank: 60,
})

export default TeamStoresPage
