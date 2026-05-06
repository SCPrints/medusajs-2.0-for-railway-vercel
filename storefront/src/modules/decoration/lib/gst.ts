export const GST_RATE = 0.1

/** Returns the GST component of an ex-GST amount. */
export const gstOn = (exGst: number): number =>
  Math.round(exGst * GST_RATE * 100) / 100

/** Splits an ex-GST amount into { exGst, gst, incGst } with 2dp rounding. */
export const splitGst = (exGst: number) => {
  const safe = Math.max(0, exGst)
  const gst = gstOn(safe)
  return { exGst: safe, gst, incGst: Math.round((safe + gst) * 100) / 100 }
}
