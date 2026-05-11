import { defineWidgetConfig } from "@medusajs/admin-sdk"
import { Badge, Button, Container, Heading, Select, Text, toast } from "@medusajs/ui"
import type { AdminCustomer, DetailWidgetProps } from "@medusajs/framework/types"
import { useEffect, useState } from "react"

const WHOLESALE_TIERS = [
  { value: "none", label: "Retail (no wholesale tier)" },
  { value: "wholesale_bronze", label: "Bronze — 1.4× cost+GST" },
  { value: "wholesale_silver", label: "Silver — 1.3× cost+GST" },
  { value: "wholesale_gold", label: "Gold — 1.2× cost+GST" },
  { value: "wholesale_platinum", label: "Platinum — 1.1× cost+GST" },
]

const WHOLESALE_GROUP_IDS = ["wholesale_bronze", "wholesale_silver", "wholesale_gold", "wholesale_platinum"]

type CustomerGroup = { id: string; name: string }

function currentWholesaleGroup(customer: AdminCustomer): CustomerGroup | null {
  const groups = (customer as unknown as { groups?: CustomerGroup[] }).groups ?? []
  return groups.find((g) => WHOLESALE_GROUP_IDS.includes(g.name)) ?? null
}

const CustomerWholesaleTierWidget = ({ data }: DetailWidgetProps<AdminCustomer>) => {
  const currentGroup = currentWholesaleGroup(data)
  const [selectedTier, setSelectedTier] = useState<string>(currentGroup?.name ?? "none")
  const [loading, setLoading] = useState(false)
  const [allGroups, setAllGroups] = useState<CustomerGroup[]>([])

  useEffect(() => {
    // Fetch all customer groups to find wholesale group IDs
    fetch("/admin/customer-groups?limit=100", {
      credentials: "include",
    })
      .then((r) => r.json())
      .then((data: { customer_groups?: CustomerGroup[] }) => {
        const wholesale = (data.customer_groups ?? []).filter((g) =>
          WHOLESALE_GROUP_IDS.includes(g.name)
        )
        setAllGroups(wholesale)
      })
      .catch(() => {})
  }, [])

  const handleSave = async () => {
    setLoading(true)
    try {
      const currentGroups = (data as unknown as { groups?: CustomerGroup[] }).groups ?? []
      const nonWholesaleGroupIds = currentGroups
        .filter((g) => !WHOLESALE_GROUP_IDS.includes(g.name))
        .map((g) => g.id)

      // Remove from all wholesale groups first
      for (const grp of allGroups) {
        const isMember = currentGroups.some((g) => g.id === grp.id)
        if (isMember) {
          await fetch(`/admin/customer-groups/${grp.id}/customers`, {
            method: "DELETE",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ids: [data.id] }),
          })
        }
      }

      // Add to new group (if not "none")
      if (selectedTier !== "none") {
        const targetGroup = allGroups.find((g) => g.name === selectedTier)
        if (!targetGroup) {
          toast.error("Wholesale group not found", {
            description: `Create a customer group named "${selectedTier}" in Medusa first.`,
          })
          setLoading(false)
          return
        }
        await fetch(`/admin/customer-groups/${targetGroup.id}/customers`, {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ids: [data.id] }),
        })
      }

      toast.success("Wholesale tier updated", {
        description:
          selectedTier === "none"
            ? "Customer is now on retail pricing."
            : `Customer assigned to ${WHOLESALE_TIERS.find((t) => t.value === selectedTier)?.label}.`,
      })
    } catch (err) {
      toast.error("Failed to update wholesale tier", {
        description: err instanceof Error ? err.message : "Unknown error",
      })
    } finally {
      setLoading(false)
    }
  }

  const tierLabel = WHOLESALE_TIERS.find((t) => t.value === selectedTier)?.label ?? "Retail"

  return (
    <Container className="divide-y p-0">
      <div className="flex items-center justify-between px-6 py-4">
        <div>
          <Heading level="h2">Wholesale Tier</Heading>
          <Text size="small" className="text-ui-fg-subtle mt-1">
            Assigns wholesale garment pricing and cheaper DTF print rates.
          </Text>
        </div>
        {currentGroup ? (
          <Badge color="blue">{currentGroup.name.replace("wholesale_", "").toUpperCase()}</Badge>
        ) : (
          <Badge color="grey">Retail</Badge>
        )}
      </div>
      <div className="px-6 py-4 flex flex-col gap-y-3">
        <Select value={selectedTier} onValueChange={setSelectedTier}>
          <Select.Trigger>
            <Select.Value placeholder="Select tier" />
          </Select.Trigger>
          <Select.Content>
            {WHOLESALE_TIERS.map((tier) => (
              <Select.Item key={tier.value} value={tier.value}>
                {tier.label}
              </Select.Item>
            ))}
          </Select.Content>
        </Select>
        <Button
          size="small"
          onClick={handleSave}
          isLoading={loading}
          disabled={selectedTier === (currentGroup?.name ?? "none")}
        >
          Save tier
        </Button>
      </div>
    </Container>
  )
}

export const config = defineWidgetConfig({
  zone: "customer.details.side.after",
})

export default CustomerWholesaleTierWidget
