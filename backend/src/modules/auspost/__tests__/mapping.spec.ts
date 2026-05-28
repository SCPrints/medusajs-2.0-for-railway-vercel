import {
  buildAusPostAddressFromCart,
  buildAusPostShipFromAddress,
  buildAusPostTrackingUrl,
  normalizeAustralianState,
  normalizeCountryCode,
  priceToNumber,
} from "../mapping"

describe("auspost/mapping", () => {
  describe("normalizeAustralianState", () => {
    it("passes through 3-letter codes case-insensitively", () => {
      expect(normalizeAustralianState("NSW")).toBe("NSW")
      expect(normalizeAustralianState("nsw")).toBe("NSW")
      expect(normalizeAustralianState("Nsw")).toBe("NSW")
    })

    it("expands full state names", () => {
      expect(normalizeAustralianState("New South Wales")).toBe("NSW")
      expect(normalizeAustralianState("Victoria")).toBe("VIC")
      expect(normalizeAustralianState("Queensland")).toBe("QLD")
      expect(normalizeAustralianState("Western Australia")).toBe("WA")
      expect(normalizeAustralianState("South Australia")).toBe("SA")
      expect(normalizeAustralianState("Tasmania")).toBe("TAS")
      expect(normalizeAustralianState("Northern Territory")).toBe("NT")
      expect(normalizeAustralianState("Australian Capital Territory")).toBe("ACT")
    })

    it("handles dot-separated shorthand", () => {
      expect(normalizeAustralianState("N.S.W.")).toBe("NSW")
      expect(normalizeAustralianState("Vic.")).toBe("VIC")
    })

    it("returns empty for empty input", () => {
      expect(normalizeAustralianState("")).toBe("")
      expect(normalizeAustralianState(null)).toBe("")
      expect(normalizeAustralianState(undefined)).toBe("")
    })

    it("uppercases unknown values rather than dropping them", () => {
      // AusPost will reject "ZZZ" but the failure surfaces from the API,
      // not the mapping layer — we don't want to silently swap to "" and
      // hide the problem.
      expect(normalizeAustralianState("Zzz")).toBe("ZZZ")
    })
  })

  describe("normalizeCountryCode", () => {
    it("uppercases lowercase ISO codes (au → AU)", () => {
      expect(normalizeCountryCode("au")).toBe("AU")
      expect(normalizeCountryCode("AU")).toBe("AU")
    })

    it("returns empty for nullish input", () => {
      expect(normalizeCountryCode(null)).toBe("")
      expect(normalizeCountryCode(undefined)).toBe("")
      expect(normalizeCountryCode("")).toBe("")
    })
  })

  describe("buildAusPostAddressFromCart", () => {
    const baseCart = {
      first_name: "Jane",
      last_name: "Citizen",
      company: "SC Prints",
      address_1: "123 Main St",
      address_2: "Unit 4",
      city: "Sydney",
      province: "New South Wales",
      postal_code: "2000",
      country_code: "au",
      phone: "+61400000000",
      email: "jane@example.com",
    } as const

    it("builds a domestic AusPost address WITHOUT a country field", () => {
      const out = buildAusPostAddressFromCart(baseCart)
      expect(out).toEqual({
        name: "Jane Citizen",
        business_name: "SC Prints",
        lines: ["123 Main St", "Unit 4"],
        suburb: "Sydney",
        state: "NSW",
        postcode: "2000",
        phone: "+61400000000",
        email: "jane@example.com",
      })
      // The v1 API doesn't expect `country` on domestic shipments.
      expect(out.country).toBeUndefined()
    })

    it("throws if postcode is missing", () => {
      expect(() =>
        buildAusPostAddressFromCart({ ...baseCart, postal_code: "" })
      ).toThrow(/postal_code/)
    })

    it("throws if country_code is missing", () => {
      expect(() =>
        buildAusPostAddressFromCart({ ...baseCart, country_code: "" })
      ).toThrow(/country_code/)
    })

    it("throws if city is missing", () => {
      expect(() =>
        buildAusPostAddressFromCart({ ...baseCart, city: "" })
      ).toThrow(/city|suburb/i)
    })

    it("keeps country + raw province for non-AU (international) destinations", () => {
      const out = buildAusPostAddressFromCart({
        ...baseCart,
        country_code: "us",
        province: "California",
      })
      expect(out.country).toBe("US")
      expect(out.state).toBe("California")
    })
  })

  describe("buildAusPostShipFromAddress", () => {
    const FALLBACKS = {
      address_1: "10 Studio Lane",
      city: "Surry Hills",
      state: "NSW",
      postcode: "2010",
      country: "AU",
      phone: "+61298765432",
      name: "SC Prints",
    }

    it("prefers stock location address over fallbacks when both are present", () => {
      const out = buildAusPostShipFromAddress({
        name: "Override Warehouse",
        address: {
          id: "sl",
          address_1: "5 Different St",
          city: "Newtown",
          province: "NSW",
          postal_code: "2042",
          country_code: "au",
          phone: "+61234567890",
        } as any,
        fallbacks: FALLBACKS,
      })
      expect(out.lines).toEqual(["5 Different St"])
      expect(out.suburb).toBe("Newtown")
      expect(out.postcode).toBe("2042")
      expect(out.name).toBe("Override Warehouse")
      // Domestic AU ship-from omits country.
      expect(out.country).toBeUndefined()
    })

    it("falls back to env vars when stock location address is empty", () => {
      const out = buildAusPostShipFromAddress({
        fallbacks: FALLBACKS,
      })
      expect(out.lines).toEqual(["10 Studio Lane"])
      expect(out.suburb).toBe("Surry Hills")
      expect(out.state).toBe("NSW")
      expect(out.phone).toBe("+61298765432")
      expect(out.name).toBe("SC Prints")
    })

    it("throws a clear error when phone is missing", () => {
      expect(() =>
        buildAusPostShipFromAddress({
          fallbacks: { ...FALLBACKS, phone: undefined },
        })
      ).toThrow(/phone/i)
    })

    it("throws a clear error when state is missing", () => {
      expect(() =>
        buildAusPostShipFromAddress({
          fallbacks: { ...FALLBACKS, state: undefined },
        })
      ).toThrow(/state/i)
    })
  })

  describe("buildAusPostTrackingUrl", () => {
    it("URL-encodes the tracking ID", () => {
      expect(buildAusPostTrackingUrl("AP12345")).toContain("AP12345")
      expect(buildAusPostTrackingUrl("with spaces")).toContain("with%20spaces")
    })

    it("returns the public mypost track page", () => {
      expect(buildAusPostTrackingUrl("123")).toMatch(/auspost\.com\.au\/mypost\/track/)
    })
  })

  describe("priceToNumber", () => {
    it("parses AUD decimal strings into DOLLARS (major units), not cents", () => {
      // Critical: Medusa's calculated_amount is in major units. Returning
      // cents here would charge shipping 100×.
      expect(priceToNumber("9.95")).toBe(9.95)
      expect(priceToNumber("12.00")).toBe(12)
      expect(priceToNumber("0.05")).toBe(0.05)
    })

    it("handles numeric input (already a number)", () => {
      expect(priceToNumber(9.95)).toBe(9.95)
      expect(priceToNumber(0)).toBe(0)
    })

    it("returns 0 for invalid or negative input", () => {
      expect(priceToNumber("")).toBe(0)
      expect(priceToNumber("not a price")).toBe(0)
      expect(priceToNumber(null)).toBe(0)
      expect(priceToNumber(undefined)).toBe(0)
      expect(priceToNumber(-5)).toBe(0)
      expect(priceToNumber("-1.50")).toBe(0)
    })
  })
})
