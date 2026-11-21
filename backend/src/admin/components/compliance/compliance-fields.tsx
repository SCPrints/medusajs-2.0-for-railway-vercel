import { Input, Label, Text, Textarea } from "@medusajs/ui"

import type { Compliance } from "../../../lib/compliance"

/** Text form of Compliance: certifications are one per line. */
export type ComplianceDraft = Omit<Compliance, "certifications"> & { certifications: string }

export const toDraft = (c: Compliance | null | undefined): ComplianceDraft => ({
  ...(c ?? {}),
  certifications: (c?.certifications ?? []).join("\n"),
})

export const fromDraft = (d: ComplianceDraft): Record<string, unknown> => ({
  ...d,
  certifications: d.certifications.split("\n"),
})

const FIELDS: Array<{ key: "country_of_origin" | "fibre_content" | "fabric_weight" | "statement_url"; label: string; placeholder: string }> = [
  { key: "country_of_origin", label: "Country of origin", placeholder: "e.g. Bangladesh" },
  { key: "fibre_content", label: "Fibre content", placeholder: "e.g. 100% combed cotton" },
  { key: "fabric_weight", label: "Fabric weight", placeholder: "e.g. 180 gsm" },
  { key: "statement_url", label: "Supplier statement link", placeholder: "https://…" },
]

/** The compliance form, shared by the product widget and the brand drawer. */
export const ComplianceFields = ({
  value,
  onChange,
  placeholders,
}: {
  value: ComplianceDraft
  onChange: (next: ComplianceDraft) => void
  /** Brand default shown greyed out on a product, so staff see what it inherits. */
  placeholders?: Compliance | null
}) => (
  <div className="flex flex-col gap-y-3">
    {FIELDS.map((f) => (
      <div key={f.key} className="flex flex-col gap-y-1">
        <Label className="text-xs">{f.label}</Label>
        <Input
          size="small"
          value={value[f.key] ?? ""}
          onChange={(e) => onChange({ ...value, [f.key]: e.currentTarget.value })}
          placeholder={placeholders?.[f.key] ?? f.placeholder}
        />
      </div>
    ))}
    <div className="flex flex-col gap-y-1">
      <Label className="text-xs">Certifications (one per line)</Label>
      <Textarea
        rows={3}
        value={value.certifications}
        onChange={(e) => onChange({ ...value, certifications: e.currentTarget.value })}
        placeholder={placeholders?.certifications?.join("\n") || "OEKO-TEX Standard 100\nWRAP"}
      />
    </div>
    <div className="flex flex-col gap-y-1">
      <Label className="text-xs">Care instructions</Label>
      <Textarea
        rows={2}
        value={value.care ?? ""}
        onChange={(e) => onChange({ ...value, care: e.currentTarget.value })}
        placeholder={placeholders?.care ?? "e.g. Machine wash cold, tumble dry low"}
      />
    </div>
    <Text size="xsmall" className="text-ui-fg-muted">Empty fields are left out. On a product, an empty field uses the brand default.</Text>
  </div>
)
