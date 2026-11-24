import type { MedusaContainer } from "@medusajs/framework/types"

import {
  ASCOLOUR_WORKSHOP_ADDRESS_1,
  ASCOLOUR_WORKSHOP_ADDRESS_2,
  ASCOLOUR_WORKSHOP_CITY,
  ASCOLOUR_WORKSHOP_PHONE,
  ASCOLOUR_WORKSHOP_STATE,
  ASCOLOUR_WORKSHOP_ZIP,
  SCP_BANK_ACCOUNT_NAME,
  SCP_BANK_ACCOUNT_NUMBER,
  SCP_BANK_BSB,
  SCP_COMPANY_ABN,
} from "../../lib/constants"
import { ADMIN_WORKSPACE_MODULE } from "../../modules/admin-workspace"
import type AdminWorkspaceService from "../../modules/admin-workspace/service"
import type { DocSpec } from "./pdf"

export type SupplierPackInput = {
  abn: string | null
  address: string | null
  phone: string | null
  bank: { name: string; bsb: string; account: string } | null
  documents: Array<{ title: string; url: string }>
  /** Who it's for (the customer / organisation), if known. */
  to: string[]
  date: string
}

/**
 * The page a new customer's accounts team asks for: who we are, how to pay
 * us, and where our certificates are. Pure: everything comes in, nothing is
 * looked up. Bank details only when all three are set (same rule as invoices).
 */
export function supplierPackDoc(p: SupplierPackInput): DocSpec {
  const business: string[][] = [
    ["Business name", "SC Prints"],
    ...(p.abn ? [["ABN", p.abn], ["GST", "Registered. Our prices include GST."]] : []),
    ...(p.address ? [["Address", p.address]] : []),
    ["Email", "info@scprints.com.au"],
    ...(p.phone ? [["Phone", p.phone]] : []),
    ["Website", "scprints.com.au"],
  ]
  const payment: string[][] = [
    ...(p.bank ? [["Account name", p.bank.name], ["BSB", p.bank.bsb], ["Account number", p.bank.account]] : []),
    ["Card", "Online at checkout, or a secure payment link we send you."],
    ["Remittance", "Email info@scprints.com.au with the invoice number."],
  ]
  const cols = [
    { label: "", width: 0.3 },
    { label: "", width: 0.7 },
  ]
  return {
    title: "Supplier details",
    subtitle: `For your accounts team · ${p.date}`,
    to: p.to,
    tables: [
      { heading: "Business", columns: cols, rows: business },
      { heading: p.bank ? "Paying us by bank transfer" : "Paying us", columns: cols, rows: payment },
      ...(p.documents.length
        ? [
            {
              heading: "Certificates",
              note: "Download links. Signed-in customers also find these in their account, under Documents.",
              columns: [
                { label: "Document", width: 0.35 },
                { label: "Link", width: 0.65 },
              ],
              rows: p.documents.map((d) => [d.title, d.url]),
            },
          ]
        : []),
    ],
    notes: ["Payment terms are on each quote and invoice.", "Questions about these details: info@scprints.com.au"],
  }
}

/** Live values: env-set business details + the documents staff uploaded (Setup → Supplier documents). */
export async function supplierPackInput(container: MedusaContainer, to: string[]): Promise<SupplierPackInput> {
  const service = container.resolve<AdminWorkspaceService>(ADMIN_WORKSPACE_MODULE)
  const docs = await service.listSupplierDocuments({}, { order: { title: "ASC" }, take: 50 }).catch(() => [])
  const address = [ASCOLOUR_WORKSHOP_ADDRESS_1, ASCOLOUR_WORKSHOP_ADDRESS_2, [ASCOLOUR_WORKSHOP_CITY, ASCOLOUR_WORKSHOP_STATE, ASCOLOUR_WORKSHOP_ZIP].filter(Boolean).join(" ")]
    .filter(Boolean)
    .join(", ")
  return {
    abn: SCP_COMPANY_ABN || null,
    address: address || null,
    phone: ASCOLOUR_WORKSHOP_PHONE || null,
    bank:
      SCP_BANK_ACCOUNT_NAME && SCP_BANK_BSB && SCP_BANK_ACCOUNT_NUMBER
        ? { name: SCP_BANK_ACCOUNT_NAME, bsb: SCP_BANK_BSB, account: SCP_BANK_ACCOUNT_NUMBER }
        : null,
    documents: (docs as any[]).filter((d) => d?.url).map((d) => ({ title: String(d.title), url: String(d.url) })),
    to: to.filter(Boolean),
    date: new Date().toLocaleDateString("en-AU", { day: "numeric", month: "long", year: "numeric", timeZone: "Australia/Sydney" }),
  }
}
