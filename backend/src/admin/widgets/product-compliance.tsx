import { defineWidgetConfig } from "@medusajs/admin-sdk"
import type { DetailWidgetProps, AdminProduct } from "@medusajs/framework/types"
import { Button, Container, Heading, Text } from "@medusajs/ui"
import { useCallback, useEffect, useState } from "react"

import { withWidgetBoundary } from "../components/widget-error-boundary"
import { ComplianceFields, fromDraft, toDraft, type ComplianceDraft } from "../components/compliance/compliance-fields"
import type { Compliance } from "../../lib/compliance"

const ProductComplianceWidget = ({ data }: DetailWidgetProps<AdminProduct>) => {
  const productId = data?.id
  const [draft, setDraft] = useState<ComplianceDraft>(toDraft(null))
  const [brandDefault, setBrandDefault] = useState<Compliance | null>(null)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!productId) return
    const res = await fetch(`/admin/products/${productId}/compliance`, { credentials: "include" })
    if (!res.ok) return setMsg(`Could not load (HTTP ${res.status})`)
    const json = await res.json()
    setDraft(toDraft(json.compliance))
    setBrandDefault(json.brand_default ?? null)
  }, [productId])

  useEffect(() => { void load() }, [load])

  const save = async () => {
    setSaving(true)
    setMsg(null)
    try {
      const res = await fetch(`/admin/products/${productId}/compliance`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ compliance: fromDraft(draft) }),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const json = await res.json()
      setDraft(toDraft(json.compliance))
      setMsg("Saved")
    } catch (err: any) {
      setMsg(err?.message ?? String(err))
    } finally {
      setSaving(false)
    }
  }

  if (!productId) return null
  return (
    <Container className="divide-y p-0">
      <div className="px-6 py-4">
        <Heading level="h2">Compliance</Heading>
        <Text size="small" className="text-ui-fg-subtle mt-1">
          Shown to customers under "Materials and compliance" on the product page. Greyed text is the brand default.
        </Text>
      </div>
      <div className="px-6 py-4 flex flex-col gap-y-3">
        <ComplianceFields value={draft} onChange={setDraft} placeholders={brandDefault} />
        <div className="flex items-center justify-between">
          <Text size="xsmall" className="text-ui-fg-muted">{msg}</Text>
          <Button size="small" onClick={save} isLoading={saving}>Save</Button>
        </div>
      </div>
    </Container>
  )
}

export const config = defineWidgetConfig({ zone: "product.details.side.after" })

export default withWidgetBoundary(ProductComplianceWidget, "product-compliance")
