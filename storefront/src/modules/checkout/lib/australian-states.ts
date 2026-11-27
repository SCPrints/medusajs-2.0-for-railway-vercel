const STATE_BY_CODE: Record<string, string> = {
  NSW: "New South Wales",
  VIC: "Victoria",
  QLD: "Queensland",
  WA: "Western Australia",
  SA: "South Australia",
  TAS: "Tasmania",
  ACT: "Australian Capital Territory",
  NT: "Northern Territory",
}

/** The checkout's state list uses full names; other forms store "NSW". */
export const checkoutStateName = (province: string | null | undefined): string => {
  const raw = (province ?? "").trim()
  return STATE_BY_CODE[raw.toUpperCase()] ?? raw
}

export const AUSTRALIAN_STATES_AND_TERRITORIES = [
  { value: "New South Wales", label: "New South Wales" },
  { value: "Victoria", label: "Victoria" },
  { value: "Queensland", label: "Queensland" },
  { value: "Western Australia", label: "Western Australia" },
  { value: "South Australia", label: "South Australia" },
  { value: "Tasmania", label: "Tasmania" },
  { value: "Australian Capital Territory", label: "Australian Capital Territory" },
  { value: "Northern Territory", label: "Northern Territory" },
]
