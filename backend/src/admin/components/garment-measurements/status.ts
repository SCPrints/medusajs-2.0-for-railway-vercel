import type { SizeStatus } from "../../../lib/garment-measurements"

export const STATUS: Record<SizeStatus, { label: string; color: "green" | "orange" | "purple" | "grey" }> = {
  done: { label: "Done", color: "green" },
  partly: { label: "Partly done", color: "orange" },
  estimated: { label: "Estimated", color: "purple" },
  todo: { label: "Not started", color: "grey" },
}
