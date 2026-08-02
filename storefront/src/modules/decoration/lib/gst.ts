export const GST_RATE = 0.1

/**
 * HOLD cutover 2026-07 (Docs/GST_INC_PRICING_SCOPE.md): the decoration rate
 * cards kept their dollar values and became GST-INCLUSIVE. splitGst therefore
 * now EXTRACTS the embedded GST (÷11) from the amount the calculators sum,
 * instead of adding 10% on top of it. The return shape is unchanged so the six
 * method calculators didn't need touching — note their local variable is still
 * named `subtotalExGst`; since the cutover that input is actually inc-GST.
 */
export const splitGst = (incGst: number) => {
  const safe = Math.max(0, incGst)
  const gst = Math.round((safe / 11) * 100) / 100
  return {
    exGst: Math.round((safe - gst) * 100) / 100,
    gst,
    incGst: safe,
  }
}
