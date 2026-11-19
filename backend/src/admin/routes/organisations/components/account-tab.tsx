import { Badge, Button, Input, Label, Switch, Text, toast } from "@medusajs/ui"
import { useCallback, useEffect, useState } from "react"

type Account = {
  terms_enabled: boolean
  terms_days: number
  credit_limit: number | null
  outstanding: number
  available: number | null
  ap_email: string | null
}
type PurchaseOrder = {
  id: string
  number: string
  amount: number
  drawn: number
  remaining: number
  expires_at: string | null
  is_active: boolean
  expired: boolean
}
type CostCentre = { id: string; code: string; name: string; is_active: boolean }

const aud = (n: number | null | undefined) =>
  n == null ? "—" : new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD" }).format(n)

const call = async (url: string, method: "POST" | "DELETE", body?: unknown) => {
  const res = await fetch(url, {
    method,
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  if (!res.ok) throw new Error(((await res.json().catch(() => ({}))) as any)?.error ?? "Couldn't save.")
}

/**
 * Buying on account: the staff switches (pay on account, terms, credit
 * limit, accounts-payable email) plus the organisation's blanket purchase
 * orders and cost centres. All amounts are AUD inc GST.
 */
const AccountTab = ({ organisationId }: { organisationId: string }) => {
  const [account, setAccount] = useState<Account | null>(null)
  const [pos, setPos] = useState<PurchaseOrder[]>([])
  const [centres, setCentres] = useState<CostCentre[]>([])
  const [poNumber, setPoNumber] = useState("")
  const [poAmount, setPoAmount] = useState("")
  const [poExpires, setPoExpires] = useState("")
  const [ccCode, setCcCode] = useState("")
  const [ccName, setCcName] = useState("")

  const base = `/admin/organisations/${organisationId}`
  const load = useCallback(async () => {
    try {
      const res = await fetch(`${base}/account`, { credentials: "include" })
      const json = (await res.json()) as any
      setAccount(json.account ?? null)
      setPos(json.purchase_orders ?? [])
      setCentres(json.cost_centres ?? [])
    } catch {
      toast.error("Couldn't load the account.")
    }
  }, [base])
  useEffect(() => {
    void load()
  }, [load])

  const run = async (fn: () => Promise<void>) => {
    try {
      await fn()
      await load()
    } catch (err: any) {
      toast.error(err?.message ?? "Couldn't save.")
    }
  }
  const patch = (body: Record<string, unknown>) => run(() => call(base, "POST", body))

  if (!account) return <Text className="text-ui-fg-muted">Loading…</Text>

  return (
    <div className="flex flex-col gap-y-8">
      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="flex items-center gap-x-2 sm:col-span-2">
          <Switch
            id="account-terms"
            checked={account.terms_enabled}
            onCheckedChange={(v) => patch({ account_terms_enabled: v })}
          />
          <Label htmlFor="account-terms">Can pay on account (no card at checkout)</Label>
        </div>
        <div>
          <Label size="xsmall">Payment terms (days)</Label>
          <Input
            type="number"
            min={1}
            max={120}
            defaultValue={account.terms_days}
            onBlur={(e) => {
              const n = Number(e.target.value)
              if (n && n !== account.terms_days) void patch({ account_terms_days: n })
            }}
          />
        </div>
        <div>
          <Label size="xsmall">Credit limit (inc GST) — blank for none</Label>
          <Input
            type="number"
            min={0}
            step="0.01"
            defaultValue={account.credit_limit ?? ""}
            onBlur={(e) => {
              const n = e.target.value.trim() ? Number(e.target.value) : null
              if (n !== account.credit_limit) void patch({ credit_limit: n })
            }}
          />
          <Text size="xsmall" className="mt-1 text-ui-fg-muted">
            Owing on account now: {aud(account.outstanding)}
            {account.available != null ? ` · ${aud(account.available)} left` : ""}
          </Text>
        </div>
        <div className="sm:col-span-2">
          <Label size="xsmall">Accounts-payable email (also gets every tax invoice)</Label>
          <Input
            type="email"
            defaultValue={account.ap_email ?? ""}
            placeholder="accounts@example.gov.au"
            onBlur={(e) => {
              const v = e.target.value.trim() || null
              if (v !== account.ap_email) void patch({ ap_email: v })
            }}
          />
        </div>
      </section>

      <section>
        <Text weight="plus">Blanket purchase orders</Text>
        <table className="mt-2 w-full text-sm">
          <thead className="text-left text-ui-fg-muted">
            <tr>
              <th className="py-1">Number</th>
              <th>Amount</th>
              <th>Used</th>
              <th>Left</th>
              <th>Expires</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {pos.map((po) => (
              <tr key={po.id} className="border-t border-ui-border-base">
                <td className="py-1.5">
                  {po.number}{" "}
                  {!po.is_active ? <Badge color="grey">Closed</Badge> : po.expired ? <Badge color="orange">Expired</Badge> : null}
                </td>
                <td>{aud(po.amount)}</td>
                <td>{aud(po.drawn)}</td>
                <td>{aud(po.remaining)}</td>
                <td>{po.expires_at ? new Date(po.expires_at).toLocaleDateString("en-AU") : "—"}</td>
                <td className="text-right">
                  <Button
                    size="small"
                    variant="transparent"
                    onClick={() => run(() => call(`${base}/purchase-orders/${po.id}`, "POST", { is_active: !po.is_active }))}
                  >
                    {po.is_active ? "Close" : "Reopen"}
                  </Button>
                </td>
              </tr>
            ))}
            {!pos.length ? (
              <tr>
                <td colSpan={6} className="py-2 text-ui-fg-muted">None yet.</td>
              </tr>
            ) : null}
          </tbody>
        </table>
        <div className="mt-3 flex flex-wrap items-end gap-2">
          <div>
            <Label size="xsmall">PO number</Label>
            <Input value={poNumber} onChange={(e) => setPoNumber(e.target.value)} />
          </div>
          <div>
            <Label size="xsmall">Amount (inc GST)</Label>
            <Input type="number" min={0} step="0.01" value={poAmount} onChange={(e) => setPoAmount(e.target.value)} />
          </div>
          <div>
            <Label size="xsmall">Expires (optional)</Label>
            <Input type="date" value={poExpires} onChange={(e) => setPoExpires(e.target.value)} />
          </div>
          <Button
            size="small"
            disabled={!poNumber.trim() || !Number(poAmount)}
            onClick={() =>
              run(async () => {
                await call(`${base}/purchase-orders`, "POST", {
                  number: poNumber,
                  amount: Number(poAmount),
                  expires_at: poExpires || null,
                })
                setPoNumber("")
                setPoAmount("")
                setPoExpires("")
              })
            }
          >
            Add PO
          </Button>
        </div>
      </section>

      <section>
        <Text weight="plus">Cost centres</Text>
        <ul className="mt-2 divide-y divide-ui-border-base text-sm">
          {centres.map((c) => (
            <li key={c.id} className="flex items-center justify-between py-1.5">
              <span>
                <span className="font-medium">{c.code}</span> · {c.name}{" "}
                {!c.is_active ? <Badge color="grey">Off</Badge> : null}
              </span>
              <span>
                <Button
                  size="small"
                  variant="transparent"
                  onClick={() => run(() => call(`${base}/cost-centres/${c.id}`, "POST", { is_active: !c.is_active }))}
                >
                  {c.is_active ? "Turn off" : "Turn on"}
                </Button>
                <Button size="small" variant="transparent" onClick={() => run(() => call(`${base}/cost-centres/${c.id}`, "DELETE"))}>
                  Remove
                </Button>
              </span>
            </li>
          ))}
          {!centres.length ? <li className="py-2 text-ui-fg-muted">None yet. With none, orders aren't asked for one.</li> : null}
        </ul>
        <div className="mt-3 flex flex-wrap items-end gap-2">
          <div>
            <Label size="xsmall">Code</Label>
            <Input value={ccCode} onChange={(e) => setCcCode(e.target.value)} />
          </div>
          <div>
            <Label size="xsmall">Name</Label>
            <Input value={ccName} onChange={(e) => setCcName(e.target.value)} />
          </div>
          <Button
            size="small"
            disabled={!ccCode.trim() || !ccName.trim()}
            onClick={() =>
              run(async () => {
                await call(`${base}/cost-centres`, "POST", { code: ccCode, name: ccName })
                setCcCode("")
                setCcName("")
              })
            }
          >
            Add cost centre
          </Button>
        </div>
      </section>
    </div>
  )
}

export default AccountTab
