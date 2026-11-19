import { cleanEmail, isValidEmail } from "../email-validation"

describe("cleanEmail", () => {
  it("strips the hidden mark Gmail adds when an address is copied", () => {
    const pasted = "‎ TotheMM.Carpentry@gmail.com​ "
    expect(cleanEmail(pasted)).toBe("tothemm.carpentry@gmail.com")
    expect(isValidEmail(cleanEmail(pasted))).toBe(true)
  })

  it("returns an empty string for non-strings", () => {
    expect(cleanEmail(undefined)).toBe("")
    expect(cleanEmail(42)).toBe("")
  })
})
